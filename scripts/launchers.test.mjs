import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tauriInvocation, npmInvocation, releaseSigningEnvironment } from './launchers.mjs'

test('release launcher omits absent Apple secrets without changing configured signing', () => {
  const names = ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']
  const empty = Object.fromEntries(names.map(name => [name, '']))
  const source = { ...empty, TAURI_SIGNING_PRIVATE_KEY: 'synthetic', TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '', PATH: 'fixture' }
  assert.deepEqual(releaseSigningEnvironment(source), { TAURI_SIGNING_PRIVATE_KEY: 'synthetic', TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '', PATH: 'fixture' })
  assert.equal(source.APPLE_CERTIFICATE, '', 'must not mutate the caller environment')
  const configured = Object.fromEntries(names.map(name => [name, `synthetic-${name}`]))
  assert.deepEqual(releaseSigningEnvironment(configured), configured)
  assert.deepEqual(releaseSigningEnvironment({ APPLE_CERTIFICATE: 'synthetic', APPLE_CERTIFICATE_PASSWORD: '' }), { APPLE_CERTIFICATE: 'synthetic', APPLE_CERTIFICATE_PASSWORD: '' })
  assert.deepEqual(releaseSigningEnvironment({ APPLE_CERTIFICATE: 'invalid-but-present' }), { APPLE_CERTIFICATE: 'invalid-but-present' }, 'invalid configured credentials must still fail in Tauri')
})

test('release wrapper forwards CLI arguments and failure status', () => {
  const wrapper = fileURLToPath(new URL('./release-tauri.mjs', import.meta.url))
  const version = spawnSync(process.execPath, [wrapper, '--version'], { encoding: 'utf8', timeout: 10000 })
  assert.equal(version.status, 0, version.stderr)
  assert.match(version.stdout, /tauri-cli/)
  const invalid = spawnSync(process.execPath, [wrapper, 'invalid-fixture-command'], { encoding: 'utf8', timeout: 10000 })
  assert.notEqual(invalid.status, 0)
})
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

test('npm launcher executes the actual pinned Node CLI without cmd shell', async () => {
  const invocation = npmInvocation('npm', ['--version'])
  assert.equal(invocation.command, process.execPath)
  const result = spawnSync(invocation.command, invocation.args, { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/)
})

test('CI command wrapper resolves npm and npx before native process supervision', () => {
  const wrapper = fileURLToPath(new URL('./ci-run.mjs', import.meta.url))
  for (const executable of ['npm', 'npx']) {
    const result = spawnSync(process.execPath, [wrapper, `contract-${executable}`, '30', executable, '--version'], { encoding: 'utf8', timeout: 40000 })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /\d+\.\d+\.\d+/)
  }
})
