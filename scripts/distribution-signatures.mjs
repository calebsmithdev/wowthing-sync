import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { files } from './package-check.mjs'
import { command } from './native-integration.mjs'
const target = process.argv[2]
const bundles = resolve('target', target, 'release/bundle')
const paths = await files(bundles), reports = []
const signatures = paths.filter(path => path.endsWith('.sig'))
const payloads = paths.filter(path => /(?:\.app\.tar\.gz|\.AppImage(?:\.tar\.gz)?|\.(?:nsis|msi)\.zip|\.exe|\.msi)$/.test(path))
for (const payload of payloads) if (!paths.includes(`${payload}.sig`)) throw new Error(`unsigned updater payload: ${payload}`)
if (!signatures.length) throw new Error('no distribution updater signatures')
for (const signature of signatures) {
  await command('cargo', ['run', '--locked', '--features', 'signature-audit', '--bin', 'wowthing-signature-check', '--', signature.slice(0, -4), signature, 'apps/desktop/src-tauri/tauri.conf.json'], { timeout: 600000 })
  reports.push({ artifact: signature.replace(resolve('.'), ''), updaterSignature: 'verified' })
}
if (process.platform === 'darwin' && process.env.APPLE_CERTIFICATE) {
  const app = resolve(bundles, 'macos/Wowthing Sync.app')
  await command('codesign', ['--verify', '--deep', '--strict', '--verbose=2', '-R', 'anchor apple generic', app])
  const details = await command('codesign', ['-d', '--verbose=4', app], { capture: true })
  if (/Signature=adhoc/.test(details.stderr) || !/^Authority=Developer ID Application:/m.test(details.stderr) || !/^TeamIdentifier=[A-Z0-9]{10}$/m.test(details.stderr)) throw new Error('expected real Developer ID distribution signature')
  // A notarized build must carry a usable stapled ticket, independent of codesign.
  if (process.env.APPLE_API_KEY || process.env.APPLE_ID) await command('xcrun', ['stapler', 'validate', app])
  reports.push({ platformSignature: 'verified', notarization: (process.env.APPLE_API_KEY || process.env.APPLE_ID) ? 'verified' : 'not configured' })
} else if (process.platform === 'win32' && process.env.WINDOWS_CERTIFICATE) {
  const installers = paths.filter(path => /\.(exe|msi)$/.test(path))
  if (!installers.length) throw new Error('signed Windows installer missing')
  for (const artifact of [...installers, resolve('target', target, 'release/Wowthing Sync.exe')]) {
    await command('powershell.exe', ['-NoProfile', '-File', resolve('scripts/verify-authenticode.ps1'), artifact])
  }
  reports.push({ platformSignature: 'verified' })
} else reports.push({ platformSignature: 'not configured; manual release verification required' })
await mkdir('test-results', { recursive: true })
await writeFile('test-results/distribution-signatures.json', JSON.stringify(reports, null, 2))
