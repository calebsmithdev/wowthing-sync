import { appendFile, cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { homedir, release, platform, arch } from 'node:os'
import { runProcess } from './process-runner.mjs'
const output = resolve(process.env.CI_REPORT_DIR ?? 'test-results/diagnostics')
await mkdir(output, { recursive: true })
if (!process.env.CI_STARTED_AT && process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `CI_STARTED_AT=${Date.now()}\n`)
async function probe(executable, args) {
  try { return (await runProcess(executable, args, { capture: true, timeout: 15_000, reportDirectory: undefined })).stdout.trim() }
  catch (error) { return { unavailable: error.message } }
}
const metadata = {
  recordedAt: new Date().toISOString(), platform: platform(), architecture: arch(), osRelease: release(), node: process.version,
  runner: { environment: process.env.RUNNER_ENVIRONMENT ?? 'local', os: process.env.RUNNER_OS ?? platform(), architecture: process.env.RUNNER_ARCH ?? arch(), image: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null },
  rust: await probe('rustc', ['--version', '--verbose']), cargo: await probe('cargo', ['--version']),
  webview: process.platform === 'darwin' ? await probe('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', '/System/Library/Frameworks/WebKit.framework/Resources/Info.plist']) : process.platform === 'linux' ? await probe('dpkg-query', ['-W', '-f=${Version}', 'libwebkit2gtk-4.1-0']) : await probe('reg.exe', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', '/v', 'pv']),
}
await writeFile(join(output, 'metadata.json'), JSON.stringify(metadata, null, 2))
if (process.argv.includes('--collect-crashes')) {
  const start = Number(process.env.CI_STARTED_AT ?? Date.now())
  const records = []
  if (process.platform === 'darwin') {
    const directory = join(homedir(), 'Library/Logs/DiagnosticReports')
    for (const name of await readdir(directory).catch(() => [])) {
      if (!/^(wowthing-sync|wowthing-os-test|Wowthing CI|Wowthing Sync)/i.test(name)) continue
      const path = join(directory, name)
      if ((await stat(path)).mtimeMs < start) continue
      await cp(path, join(output, name)); records.push(name)
    }
  } else if (process.platform === 'linux') {
    const logs = await probe('journalctl', ['--no-pager', '--since', new Date(start).toISOString(), '--grep', 'wowthing-sync|wowthing-os-test|Wowthing CI|Wowthing Sync'])
    await writeFile(join(output, 'native-journal.json'), JSON.stringify(logs)); records.push('native-journal.json')
  } else {
    // Only application crash events for our scoped executables, no environment dump.
    const script = join(output, 'crashes.ps1')
    await writeFile(script, 'param([string]$Since)\nGet-WinEvent -FilterHashtable @{LogName="Application";StartTime=[DateTime]::Parse($Since);Id=1000,1001} -ErrorAction SilentlyContinue | Where-Object {$_.Message -match "wowthing-(sync|os-test)|Wowthing CI|Wowthing Sync"} | Select-Object TimeCreated,Id,Message | ConvertTo-Json')
    await writeFile(join(output, 'native-crashes.json'), JSON.stringify(await probe('powershell.exe', ['-NoProfile', '-File', script, new Date(start).toISOString()]))); records.push('native-crashes.json')
  }
  await writeFile(join(output, 'crash-inventory.json'), JSON.stringify({ since: new Date(start).toISOString(), files: records }, null, 2))
}
