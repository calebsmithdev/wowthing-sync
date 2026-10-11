import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { normalize } from '../apps/desktop/node_modules/pathe/dist/index.mjs'
import { createNitro } from '../apps/desktop/node_modules/nitropack/dist/core/index.mjs'
import { getRollupConfig } from '../apps/desktop/node_modules/nitropack/dist/rollup/index.mjs'

// Nuxt 4.6.1 inlines its dist through a matcher that normalizes Windows separators,
// replacing our former `nitro.externals.inline` workaround. It is not exported, so
// read the shipped pattern and apply it exactly as Nuxt does (pathe normalize + test).
const nitroServer = await readFile(new URL('../apps/desktop/node_modules/@nuxt/nitro-server/dist/index.mjs', import.meta.url), 'utf8')
const shipped = /const NUXT_DIST_RE = \/(.+)\/;\s*function isNuxtDistId\(id\) \{\s*return NUXT_DIST_RE\.test\(normalize\(id\)\);/.exec(nitroServer)

test('Nuxt renderer stays bundled when Nitro resolves a Windows path', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'wowthing-nuxt-runtime-'))
  const rootDir = join(temporary, 'project')
  // On POSIX these backslashes are literal filename characters, allowing the
  // real externals plugin to inspect an existing Windows-style resolved ID.
  const resolved = join(temporary, 'dependencies', 'node_modules\\nuxt\\dist\\runtime\\server\\renderer\\index.mjs')
  await mkdir(dirname(resolved), { recursive: true })
  await mkdir(rootDir)
  await writeFile(resolved, 'export const createNuxtRenderer = () => {}\n')
  const probe = async (inline, specifier) => {
    const nitro = await createNitro({ rootDir, compatibilityDate: '2024-10-01', preset: 'node-server', externals: { trace: false, inline } })
    try {
      const plugin = getRollupConfig(nitro).plugins.find(plugin => plugin?.name === 'node-externals')
      assert.ok(plugin, 'expected Nitro externals plugin')
      return await plugin.resolveId.call({ resolve: async () => ({ id: resolved }) }, specifier, join(rootDir, 'renderer.mjs'), {})
    } finally { await nitro.close() }
  }
  try {
    // Nuxt 4.6 defaults only inline the resolved nuxt/dist path; Nitro 2.13.4
    // does not normalize that resolved ID before matching it on Windows.
    assert.equal((await probe(['nuxt/dist'], 'nuxt/internal/renderer')).external, true)
    assert.ok(shipped, 'Nuxt no longer normalizes resolved dist IDs; restore nitro.externals.inline in nuxt.config.ts')
    const pattern = new RegExp(shipped[1])
    const isNuxtDistId = id => pattern.test(normalize(id))
    for (const specifier of ['nuxt/internal/renderer', 'nuxt/internal/renderer-config', 'nuxt/internal/precomputed']) {
      assert.equal(await probe([isNuxtDistId], specifier), null, specifier)
    }
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
