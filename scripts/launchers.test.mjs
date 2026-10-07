import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tauriInvocation } from './launchers.mjs'
test('runs the actual Tauri JS CLI through Node without a platform shell', () => {
  const desktop = fileURLToPath(new URL('../apps/desktop', import.meta.url))
  const launch = tauriInvocation(desktop, ['dev', '--help'])
  assert.equal(launch.command, process.execPath)
  assert.match(launch.args[0], /tauri\.js$/)
  assert.deepEqual(launch.args.slice(1), ['dev', '--help'])
  const result = spawnSync(launch.command, launch.args, { cwd: desktop, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--no-watch/)
})
