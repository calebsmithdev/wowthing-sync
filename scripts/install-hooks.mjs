// Enables the tracked .githooks/ for this clone (run by apps/desktop postinstall).
// Skipped in CI, outside this repository's checkout, with WOWTHING_SKIP_HOOKS=1,
// or when another hook setup exists (core.hooksPath elsewhere, or real hooks in
// .git/hooks, which core.hooksPath would silently disable).
import { spawnSync } from 'node:child_process'
import { readdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
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
const hooks = resolve(root, git('rev-parse', '--git-path', 'hooks').stdout.trim())
let existing = []
try { existing = readdirSync(hooks).filter(name => !name.endsWith('.sample')) } catch {}
if (existing.length) {
  console.log(`install-hooks: ${hooks} has hooks (${existing.join(', ')}); not enabling .githooks. Run \`git config core.hooksPath .githooks\` to switch.`)
  process.exit(0)
}
if (git('config', 'core.hooksPath', '.githooks').status === 0) console.log('install-hooks: enabled .githooks (pre-commit: staged lint/format, pre-push: node scripts/validate.mjs)')
