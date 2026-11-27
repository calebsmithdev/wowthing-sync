// Enables the tracked .githooks/ for this clone (run by apps/desktop postinstall).
// Skipped in CI, outside this repository's checkout, with WOWTHING_SKIP_HOOKS=1,
// or when core.hooksPath already points elsewhere (another hook manager wins).
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
const top = git('rev-parse', '--show-toplevel')
if (process.env.CI || process.env.WOWTHING_SKIP_HOOKS === '1' || top.status !== 0 || realpathSync(top.stdout.trim()) !== root) process.exit(0)
const current = git('config', '--get', 'core.hooksPath').stdout.trim()
if (current === '.githooks') process.exit(0)
if (current) {
  console.log(`install-hooks: core.hooksPath is already "${current}"; leaving it. Run \`git config core.hooksPath .githooks\` to use this repo's hooks.`)
  process.exit(0)
}
if (git('config', 'core.hooksPath', '.githooks').status === 0) console.log('install-hooks: enabled .githooks (pre-commit: staged lint/format, pre-push: node scripts/validate.mjs)')
