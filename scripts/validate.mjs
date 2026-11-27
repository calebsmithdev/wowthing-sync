// One local validation entry point for humans, agents and git hooks.
//
//   node scripts/validate.mjs            change-scoped quick checks (pre-push)
//   node scripts/validate.mjs --fix      apply eslint --fix + cargo fmt, then check
//   node scripts/validate.mjs --full     also browser e2e + native smoke/integration (before a PR)
//   node scripts/validate.mjs --all      ignore change detection, validate everything
//   node scripts/validate.mjs --staged   format/lint staged files only (pre-commit)
//   node scripts/validate.mjs --dry-run  print the plan without running it
//   --base <ref>                         compare against <ref> instead of the default branch
//
// Changed files (branch commits since the default-branch merge base, the working
// tree and untracked files) are classified into areas; each area maps to the
// same commands CI runs. Logs: test-results/validate/<step>.log.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { npmInvocation } from './launchers.mjs'
import { runProcess } from './process-runner.mjs'

export const root = fileURLToPath(new URL('..', import.meta.url))
const desktop = 'apps/desktop'
const minutes = value => value * 60_000

export const AREAS = {
  rust: path => /\.rs$/.test(path) || /^(Cargo\.(toml|lock)|rust-toolchain\.toml|\.cargo\/)/.test(path) || path.startsWith(`${desktop}/src-tauri/`),
  frontend: path => path.startsWith(`${desktop}/`) && !path.startsWith(`${desktop}/src-tauri/`),
  scripts: path => path.startsWith('scripts/') || path === 'eslint.config.mjs',
  workflows: path => path.startsWith('.github/'),
  release: path => ['apps/desktop/src-tauri/Cargo.toml', 'apps/desktop/src-tauri/tauri.conf.json', 'apps/desktop/package.json', 'Cargo.lock', 'scripts/release-metadata.mjs'].includes(path),
}
const LINTABLE = /\.(?:[cm]?[jt]s|vue)$/
const lintable = path => LINTABLE.test(path) && (AREAS.frontend(path) || AREAS.scripts(path))

export function classify(files) {
  const areas = Object.fromEntries(Object.keys(AREAS).map(name => [name, false]))
  for (const file of files) for (const [name, matches] of Object.entries(AREAS)) if (matches(file)) areas[name] = true
  return areas
}

const node = (...args) => ({ command: process.execPath, args })
const npm = (...args) => npmInvocation('npm', ['run', '--prefix', desktop, ...args])
const eslint = (...args) => node(resolve(root, desktop, 'node_modules/eslint/bin/eslint.js'), ...args)
const cargo = (...args) => ({ command: 'cargo', args })

/**
 * Pure planner: which steps run, in which lane, with which command.
 * Lanes: `pre` runs first and serially (formatters rewrite files, generate writes
 * the assets cargo embeds); `node` and `cargo` then run concurrently.
 */
export function plan({ files = [], all = false, full = false, staged = false, fix = false, assetsExist = true, scriptTests = [] } = {}) {
  if (staged) {
    const lint = files.filter(lintable)
    const rust = files.filter(path => path.endsWith('.rs'))
    return [
      lint.length && { id: 'eslint', lane: 'pre', cwd: desktop, ...eslint(...lint.map(path => relative(resolve(root, desktop), resolve(root, path)))) },
      rust.length && { id: 'rustfmt', lane: 'pre', ...{ command: 'rustfmt', args: ['--edition', '2021', '--check', ...rust] } },
    ].filter(Boolean)
  }
  const area = all ? Object.fromEntries(Object.keys(AREAS).map(name => [name, true])) : classify(files)
  const native = area.rust || area.frontend
  const steps = [
    (area.frontend || area.scripts) && { id: 'eslint', lane: 'pre', ...(fix ? npm('lint', '--', '--fix') : npm('lint')) },
    area.rust && { id: 'rustfmt', lane: 'pre', ...cargo('fmt', '--all', ...(fix ? [] : ['--', '--check'])) },
    ((area.rust && (!assetsExist || area.frontend)) || (full && native)) && { id: 'generate', lane: 'pre', ...npm('generate') },
    area.frontend && { id: 'typecheck', lane: 'node', ...npm('typecheck') },
    area.frontend && { id: 'vitest', lane: 'node', ...npm('test:unit') },
    (area.scripts || area.workflows) && { id: 'script-tests', lane: 'node', ...node('--test', ...scriptTests) },
    area.release && { id: 'release-metadata', lane: 'node', ...node('scripts/release-metadata.mjs', 'verify') },
    area.workflows && { id: 'actionlint', lane: 'node', optional: 'actionlint', command: 'actionlint', args: [] },
    full && area.frontend && { id: 'browser-e2e', lane: 'node', ...npm('test:e2e') },
    area.rust && { id: 'clippy', lane: 'cargo', ...cargo('clippy', '--locked', '--all-targets', '--', '-D', 'warnings') },
    area.rust && { id: 'clippy-integration', lane: 'cargo', ...cargo('clippy', '--locked', '--all-targets', '--features', 'integration-test', '--', '-D', 'warnings') },
    area.rust && { id: 'check-os-probe', lane: 'cargo', ...cargo('check', '--locked', '--all-targets', '--features', 'os-integration-test') },
    area.rust && { id: 'cargo-test', lane: 'cargo', timeout: minutes(20), ...cargo('test', '--locked') },
    full && native && { id: 'native-smoke', lane: 'cargo', timeout: minutes(25), ...node('scripts/native-smoke.mjs') },
    full && native && { id: 'native-integration', lane: 'cargo', timeout: minutes(25), ...node('scripts/native-integration.mjs') },
  ]
  return steps.filter(Boolean)
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}
const lines = text => (text ?? '').split('\n').map(line => line.trim()).filter(Boolean)

export function changedFiles({ base, staged }) {
  if (staged) return { files: lines(git('diff', '--cached', '--name-only', '--diff-filter=ACMR')), base: 'index' }
  const reference = base ?? git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD') ?? 'main'
  const mergeBase = git('merge-base', 'HEAD', reference)
  const files = new Set([
    ...(mergeBase ? lines(git('diff', '--name-only', mergeBase)) : []),
    ...lines(git('diff', '--name-only', 'HEAD')),
    ...lines(git('ls-files', '--others', '--exclude-standard')),
  ])
  return { files: [...files].sort(), base: mergeBase ? `${reference}@${mergeBase.slice(0, 8)}` : `${reference} (no merge base; working tree only)` }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index > 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const flag = name => process.argv.includes(name)
  const options = { all: flag('--all'), full: flag('--full'), staged: flag('--staged'), fix: flag('--fix') }
  if (options.staged && options.fix) throw new Error('--staged only checks; run --fix without --staged')
  const { files, base } = options.all ? { files: [], base: 'all' } : changedFiles({ base: argument('--base'), staged: options.staged })
  const scriptTests = readdirSync(resolve(root, 'scripts')).filter(name => name.endsWith('.test.mjs')).sort().map(name => `scripts/${name}`)
  const steps = plan({ ...options, files, scriptTests, assetsExist: existsSync(resolve(root, desktop, '.output/public/index.html')) })
  const scope = options.all ? 'all areas' : Object.entries(classify(files)).filter(([, on]) => on).map(([name]) => name).join(', ') || 'no checked areas'
  console.log(`validate: ${options.staged ? 'staged' : options.full ? 'full' : 'quick'} · ${options.all ? 'all files' : `${files.length} changed file(s) vs ${base}`} → ${scope}`)
  if (!steps.length) { console.log('validate: nothing to check'); return }
  if (flag('--dry-run')) {
    for (const step of steps) console.log(`  [${step.lane}] ${step.id}: ${[step.command === process.execPath ? 'node' : step.command, ...step.args].join(' ')}`)
    return
  }
  const logs = resolve(root, 'test-results/validate')
  await mkdir(logs, { recursive: true })
  const results = []
  const run = async (step) => {
    const started = Date.now()
    if (step.optional && spawnSync(step.optional, ['--version'], { stdio: 'ignore' }).error) {
      results.push({ ...step, status: 'skipped', note: `${step.optional} not installed` }); console.log(`  - ${step.id.padEnd(20)} skipped: ${step.optional} not installed`); return
    }
    let output = ''
    const append = (bytes) => { output += bytes.toString() }
    let status = 'passed'
    try { await runProcess(step.command, step.args, { cwd: resolve(root, step.cwd ?? '.'), label: step.id, capture: true, timeout: step.timeout ?? minutes(15), onStdout: append, onStderr: append }) } catch (error) { status = 'failed'; output += `\n${error.message}\n` }
    const log = resolve(logs, `${step.id}.log`)
    await writeFile(log, output)
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    results.push({ ...step, status, output, log })
    console.log(`  ${status === 'passed' ? '✓' : '✗'} ${step.id.padEnd(20)} ${seconds.padStart(6)}s${status === 'failed' ? `  → ${relative(root, log)}` : ''}`)
  }
  for (const step of steps.filter(step => step.lane === 'pre')) await run(step)
  await Promise.all(['node', 'cargo'].map(async (lane) => { for (const step of steps.filter(step => step.lane === lane)) await run(step) }))
  const failed = results.filter(result => result.status === 'failed')
  for (const result of failed) {
    const tail = result.output.trimEnd().split('\n').slice(-40).join('\n')
    console.log(`\n── ${result.id} (last 40 lines; full log ${relative(root, result.log)}) ──\n${tail}`)
  }
  if (failed.length) {
    const formatting = failed.some(result => ['eslint', 'rustfmt'].includes(result.id))
    console.log(`\nvalidate: ${failed.length} failed (${failed.map(result => result.id).join(', ')})${formatting ? '. Formatting/lint: run `node scripts/validate.mjs --fix`' : ''}`)
    process.exitCode = 1
  } else console.log(`validate: all ${results.filter(result => result.status === 'passed').length} checks passed`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`validate: ${error.message}`); process.exitCode = 1 })
}
