import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
let config = {}
if (process.platform === 'win32' && process.env.WINDOWS_CERTIFICATE) {
  config = { bundle: { windows: { signCommand: { cmd: 'powershell.exe', args: ['-NoProfile', '-File', resolve('scripts/windows-sign.ps1'), '%1'] } } } }
} else if (process.platform === 'darwin' && process.env.APPLE_CERTIFICATE) {
  if (!process.env.APPLE_SIGNING_IDENTITY || process.env.APPLE_SIGNING_IDENTITY === '-') throw new Error('provisioned certificate requires real APPLE_SIGNING_IDENTITY')
  config = { bundle: { macOS: { signingIdentity: process.env.APPLE_SIGNING_IDENTITY } } }
}
await mkdir('target', { recursive: true })
await writeFile('target/release-signing.json', JSON.stringify(config))
