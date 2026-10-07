import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { tauriInvocation } from './launchers.mjs'
import { root } from './native-integration.mjs'
test('standalone release verifier checks the real signed bytes, key and trusted version', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'wowthing-signature-'))
  try {
    const privateKey = join(temporary, 'key'), artifact = join(temporary, 'artifact'), config = join(temporary, 'config.json')
    const version = (await readFile(join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8')).match(/^version = "([^"]+)"/m)[1]
    const cli = args => { const launch = tauriInvocation(join(root, 'apps/desktop'), args); const result = spawnSync(launch.command, launch.args, { encoding: 'utf8', timeout: 30000 }); assert.equal(result.status, 0, result.stderr) }
    cli(['signer', 'generate', '--ci', '--write-keys', privateKey]) // private output captured, never logged
    await writeFile(artifact, 'synthetic signed release bytes')
    await writeFile(config, JSON.stringify({ plugins: { updater: { pubkey: (await readFile(`${privateKey}.pub`, 'utf8')).trim() } } }))
    const sign = signedVersion => cli(['signer', 'sign', '--private-key-path', privateKey, '--password', '', '--app-version', signedVersion, artifact])
    const verify = () => spawnSync('cargo', ['run', '--quiet', '--locked', '--features', 'signature-audit', '--bin', 'wowthing-signature-check', '--', artifact, `${artifact}.sig`, config], { cwd: root, encoding: 'utf8', timeout: 300000 })
    sign(version)
    let result = verify(); assert.equal(result.status, 0, result.stderr)
    await writeFile(artifact, 'tampered signed release bytes')
    result = verify(); assert.notEqual(result.status, 0); assert.match(result.stderr, /InvalidSignature/)
    sign('9.9.9')
    result = verify(); assert.notEqual(result.status, 0); assert.match(result.stderr, /signed release version mismatch/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
