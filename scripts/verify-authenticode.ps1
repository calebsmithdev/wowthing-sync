param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $Path
if ($signature.Status -ne 'Valid') { throw "Authenticode signature invalid: $($signature.Status)" }
Write-Output 'verified Authenticode signature'
