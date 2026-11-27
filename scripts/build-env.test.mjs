import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('plain cargo and the Tauri CLI build with the same macOS deployment target', async () => {
  // A mismatch makes cc-based build scripts rerun whenever cargo and `tauri build`
  // alternate (clippy/test vs native smoke/packages), rebuilding most dependencies.
  const config = await read('.cargo/config.toml')
  const cargo = /^MACOSX_DEPLOYMENT_TARGET\s*=\s*"([^"]+)"\s*$/m.exec(config)?.[1]
  const tauri = JSON.parse(await read('apps/desktop/src-tauri/tauri.conf.json')).bundle.macOS.minimumSystemVersion
  assert.ok(cargo, '.cargo/config.toml must set [env] MACOSX_DEPLOYMENT_TARGET')
  assert.equal(cargo, tauri)
})
