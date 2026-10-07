param([Parameter(Mandatory=$true)][string]$Configuration, [switch]$ResolveOnly, [switch]$CommandLineOnly)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $Configuration -Raw -Encoding UTF8 | ConvertFrom-Json
# PATH can expose several applications with the same name. Bind exactly one
# scalar path; casting Source[] to string would join paths into an invalid name.
$application = @(Get-Command -Name $config.executable -CommandType Application -ErrorAction Stop)[0]
[string]$executable = $application.Source
if ([string]::IsNullOrWhiteSpace($executable) -or !(Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Resolved executable is not a file' }
if ($ResolveOnly) { ConvertTo-Json -Compress @{ executable = $executable }; exit 0 }
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
public static class WowthingOwnedJob {
  [StructLayout(LayoutKind.Sequential)] struct Startup {
    public uint cb; public IntPtr reserved, desktop, title;
    public uint x,y,xsize,ysize,xchars,ychars,fill,flags;
    public ushort show, reserved2; public IntPtr reserved3,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long processTime,jobTime; public uint flags; public UIntPtr minWorking,maxWorking;
    public uint activeLimit; public UIntPtr affinity; public uint priority,scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct Limits { public BasicLimits basic; public IoCounters io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
  [StructLayout(LayoutKind.Sequential)] struct Accounting { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attr, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits limits,uint length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting info,uint length,IntPtr returned);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true, EntryPoint="CreateProcessW")]
  static extern bool CreateProcess(string exe,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref Startup startup,out ProcessInfo info);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
  static void Check(bool ok) { if(!ok) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
  static string Quote(string value) {
    StringBuilder text = new StringBuilder("\""); int slashes=0;
    foreach(char c in value) {
      if(c=='\\') { slashes++; continue; }
      if(c=='\"') { text.Append('\\',slashes*2+1); text.Append(c); }
      else { text.Append('\\',slashes); text.Append(c); }
      slashes=0;
    }
    text.Append('\\',slashes*2); text.Append('"'); return text.ToString();
  }
  static uint Active(IntPtr job) { Accounting a; Check(QueryInformationJobObject(job,1,out a,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero)); return a.active; }
  public static string CommandLine(string executable,string[] args,string mode) {
    StringBuilder command=new StringBuilder(Quote(executable));
    if(String.IsNullOrEmpty(mode) || mode=="standard") {
      foreach(string arg in args) command.Append(" "+Quote(arg));
    } else if(mode=="nsis") {
      // NSIS 3.11 parses /S and the terminal /D= remainder itself, not CRT argv.
      // https://github.com/kichik/nsis/blob/v311/Source/exehead/Main.c#L235-L260
      if(args.Length==0 || args[0]!="/S") throw new ArgumentException("NSIS requires /S");
      command.Append(" /S");
      for(int i=1;i<args.Length;i++) {
        string arg=args[i];
        if(i==1 && arg=="/NS") command.Append(" /NS");
        else if(i==args.Length-1 && arg.StartsWith("/D=",StringComparison.Ordinal)) {
          string path=arg.Substring(3);
          if(!System.Text.RegularExpressions.Regex.IsMatch(path,@"^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])") || path.IndexOf('"')>=0) throw new ArgumentException("NSIS requires an absolute unquoted directory");
          foreach(char c in path) if(Char.IsControl(c)) throw new ArgumentException("NSIS directory contains a control character");
          command.Append(" "+arg);
        } else throw new ArgumentException("Unsupported NSIS argument or nonterminal /D");
      }
    } else throw new ArgumentException("Unsupported Windows argument mode");
    return command.ToString();
  }
  public static int Run(string executable,string[] args,string cwd,bool waitDescendants,string mode) {
    IntPtr job=CreateJobObject(IntPtr.Zero,null); Check(job!=IntPtr.Zero);
    ProcessInfo pi = new ProcessInfo(); bool assigned=false;
    try {
      Limits limits = new Limits(); limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE
      Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits))));
      Startup startup = new Startup(); startup.cb=(uint)Marshal.SizeOf(typeof(Startup)); startup.flags=0x100;
      startup.input=GetStdHandle(-10); startup.output=GetStdHandle(-11); startup.error=GetStdHandle(-12);
      StringBuilder command=new StringBuilder(CommandLine(executable,args,mode));
      Check(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,4,IntPtr.Zero,cwd,ref startup,out pi));
      Check(AssignProcessToJobObject(job,pi.process)); assigned=true;
      Check(ResumeThread(pi.thread)!=0xffffffff);
      Check(WaitForSingleObject(pi.process,0xffffffff)==0);
      uint exit; Check(GetExitCodeProcess(pi.process,out exit));
      if(waitDescendants) { while(Active(job)>0) Thread.Sleep(50); }
      Check(TerminateJobObject(job,exit));
      DateTime deadline=DateTime.UtcNow.AddSeconds(5);
      while(Active(job)>0) { if(DateTime.UtcNow>deadline) throw new Exception("Owned job descendants did not terminate"); Thread.Sleep(20); }
      return unchecked((int)exit);
    } finally {
      if(pi.process!=IntPtr.Zero && !assigned) TerminateProcess(pi.process,1);
      if(pi.thread!=IntPtr.Zero) CloseHandle(pi.thread);
      if(pi.process!=IntPtr.Zero) CloseHandle(pi.process);
      CloseHandle(job);
    }
  }
}
'@
if ($CommandLineOnly) { ConvertTo-Json -Compress @{ commandLine = [WowthingOwnedJob]::CommandLine($executable, [string[]]$config.args, [string]$config.windowsArgumentMode) }; return }
exit [WowthingOwnedJob]::Run($executable, [string[]]$config.args, [string]$config.cwd, [bool]$config.waitDescendants, [string]$config.windowsArgumentMode)
