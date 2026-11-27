// Claude Code PostToolUse hook (.claude/settings.json): formats the file an
// Edit/Write just touched with the repository's own rules. Rust → rustfmt;
// app/script JS/TS/Vue → eslint --fix. Remaining lint errors exit 2 so the agent
// sees them immediately. Never fails the tool call for missing tooling.
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
let input = ''
for await (const chunk of process.stdin) input += chunk
let file
try { file = JSON.parse(input).tool_input?.file_path } catch { process.exit(0) }
if (typeof file !== 'string' || !existsSync(file)) process.exit(0)
const path = relative(root, realpathSync(file)).split(sep).join('/')
if (path.startsWith('..')) process.exit(0)

let result
if (path.endsWith('.rs')) {
  result = spawnSync('rustfmt', ['--edition', '2021', path], { cwd: root, encoding: 'utf8' })
} else if (/\.(?:[cm]?[jt]s|vue)$/.test(path) && ((path.startsWith('apps/desktop/') && !path.startsWith('apps/desktop/src-tauri/')) || path.startsWith('scripts/') || path === 'eslint.config.mjs')) {
  const desktop = resolve(root, 'apps/desktop')
  const bin = resolve(desktop, 'node_modules/eslint/bin/eslint.js')
  if (!existsSync(bin) || !existsSync(resolve(desktop, '.nuxt/eslint.config.mjs'))) process.exit(0)
  result = spawnSync(process.execPath, [bin, '--fix', resolve(root, path)], { cwd: desktop, encoding: 'utf8' })
} else process.exit(0)

if (result.error) process.exit(0)
if (result.status !== 0) {
  process.stderr.write(`${path}: formatter/lint reported problems (repo rules, see AGENTS.md "Local validation")\n${result.stdout}${result.stderr}`)
  process.exit(2)
}
