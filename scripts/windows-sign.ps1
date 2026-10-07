param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or !$env:WINDOWS_CERTIFICATE -or !$env:WINDOWS_CERTIFICATE_PASSWORD) { throw 'Signing requires provisioned disposable release runner' }
$certificate = Join-Path $env:RUNNER_TEMP ([Guid]::NewGuid().ToString() + '.pfx')
try {
  [IO.File]::WriteAllBytes($certificate, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
  $tools = @(Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' | Sort-Object FullName -Descending)
  if (!$tools.Count) { throw 'Windows SDK signtool unavailable' }
  & $tools[0].FullName sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f $certificate /p $env:WINDOWS_CERTIFICATE_PASSWORD $Path
  if ($LASTEXITCODE -ne 0) { throw 'Authenticode signing failed' }
} finally { Remove-Item -LiteralPath $certificate -Force -ErrorAction SilentlyContinue }
