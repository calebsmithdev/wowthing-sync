import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
// GitHub expands absent secrets to empty strings. Tauri treats the presence of
// Apple variables as opting into certificate import/notarization.
export function releaseSigningEnvironment(source) {
  const env = { ...source }
  for (const name of ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
    if (env[name] === '') delete env[name]
  }
  // An exported PKCS#12 certificate can legitimately have an empty password.
  if (env.APPLE_CERTIFICATE && source.APPLE_CERTIFICATE_PASSWORD === '') env.APPLE_CERTIFICATE_PASSWORD = ''
  return env
}

export function tauriInvocation(desktop, args) {
  const require = createRequire(resolve(desktop, 'package.json'))
  return { command: process.execPath, args: [require.resolve('@tauri-apps/cli/tauri.js'), ...args] }
}

export function npmInvocation(command, args = []) {
  if (!['npm', 'npx'].includes(command)) throw new Error('unsupported npm launcher')
  const cli = `${command}-cli.js`
  const candidates = [
    resolve(dirname(process.execPath), 'node_modules/npm/bin', cli),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin', cli),
  ]
  const path = candidates.find(existsSync)
  if (!path) throw new Error(`Cannot locate ${cli} next to pinned Node; refusing a platform shell fallback`)
  return { command: process.execPath, args: [path, ...args] }
}
