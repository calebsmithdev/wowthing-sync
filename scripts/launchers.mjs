import { createRequire } from 'node:module'
import { resolve } from 'node:path'
export function tauriInvocation(desktop, args) {
  const require = createRequire(resolve(desktop, 'package.json'))
  return { command: process.execPath, args: [require.resolve('@tauri-apps/cli/tauri.js'), ...args] }
}
