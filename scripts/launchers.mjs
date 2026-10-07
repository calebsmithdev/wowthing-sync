import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
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
