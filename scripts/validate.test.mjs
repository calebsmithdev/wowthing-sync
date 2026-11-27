import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, plan } from './validate.mjs'

const scriptTests = ['scripts/a.test.mjs', 'scripts/signature-check.test.mjs']
const ids = options => plan({ scriptTests, ...options }).map(step => step.id)

test('files are classified into validation areas', () => {
  assert.deepEqual(classify(['apps/desktop/src-tauri/src/lib.rs']), { rust: true, frontend: false, scripts: false, workflows: false, release: false })
  assert.equal(classify(['apps/desktop/src/pages/index.vue']).frontend, true)
  assert.equal(classify(['apps/desktop/src-tauri/tauri.conf.json']).frontend, false)
  assert.equal(classify(['apps/desktop/src-tauri/tauri.conf.json']).release, true)
  assert.equal(classify(['.cargo/config.toml']).rust, true)
  assert.equal(classify(['eslint.config.mjs']).scripts, true)
  assert.deepEqual(Object.values(classify(['README.md', 'docs/ci-validation.md'])), [false, false, false, false, false])
})

test('quick plans run only the checks the changed areas need', () => {
  assert.deepEqual(ids({ files: ['README.md'] }), [])
  assert.deepEqual(ids({ files: ['apps/desktop/src/app.vue'] }), ['eslint', 'generate', 'typecheck', 'vitest'])
  assert.deepEqual(ids({ files: ['apps/desktop/src-tauri/src/lib.rs'] }), ['rustfmt', 'clippy', 'clippy-integration', 'check-os-probe', 'cargo-test', 'signature-check'])
  assert.deepEqual(ids({ files: ['scripts/ci-gate.mjs'] }), ['eslint', 'script-tests', 'signature-check'])
  assert.deepEqual(ids({ files: ['.github/workflows/rust-tests.yml'] }), ['script-tests', 'actionlint'])
})

test('cargo-compiling script tests run in the cargo lane, not beside it', () => {
  const steps = plan({ files: ['scripts/ci-gate.mjs', 'src/lib.rs'], scriptTests })
  assert.ok(!steps.find(step => step.id === 'script-tests').args.includes('scripts/signature-check.test.mjs'))
  assert.equal(steps.find(step => step.id === 'signature-check').lane, 'cargo')
  assert.ok(steps.findIndex(step => step.id === 'signature-check') > steps.findIndex(step => step.id === 'cargo-test'))
})

test('cargo steps get generated frontend assets when they are missing or stale', () => {
  assert.ok(ids({ files: ['src/main.rs'], assetsExist: false }).includes('generate'))
  assert.ok(ids({ files: ['scripts/ci-gate.mjs'], assetsExist: false }).includes('generate'), 'signature-check compiles the app')
  assert.ok(!ids({ files: ['src/main.rs'], assetsExist: true }).includes('generate'))
  assert.ok(ids({ files: ['src/main.rs', 'apps/desktop/src/app.vue'] }).includes('generate'))
  assert.ok(!ids({ files: ['.github/workflows/x.yml'], assetsExist: false }).includes('generate'))
})

test('full plans add browser and native webview paths last; formatters and generate run first', () => {
  const steps = plan({ all: true, full: true, scriptTests: [] })
  const id = steps.map(step => step.id)
  for (const expected of ['browser-e2e', 'native-smoke', 'native-integration', 'generate', 'release-metadata', 'signature-check']) assert.ok(id.includes(expected), expected)
  assert.deepEqual(steps.filter(step => step.lane === 'pre').map(step => step.id), ['eslint', 'rustfmt', 'generate'])
  assert.deepEqual(steps.filter(step => step.lane === 'post').map(step => step.id), ['browser-e2e', 'native-smoke', 'native-integration'])
  assert.ok(steps.every(step => ['pre', 'node', 'cargo', 'post'].includes(step.lane)))
  assert.ok(!ids({ files: ['apps/desktop/src/app.vue'] }).includes('native-smoke'), 'native paths are --full only')
})

test('harness script changes exercise the flows they drive under --full', () => {
  for (const file of ['scripts/smoke-server.mjs', 'scripts/native-integration.mjs', 'scripts/process-runner.mjs']) {
    const id = ids({ files: [file], full: true })
    for (const expected of ['generate', 'browser-e2e', 'native-smoke', 'native-integration']) assert.ok(id.includes(expected), `${file} → ${expected}`)
  }
  assert.ok(!ids({ files: ['scripts/ci-gate.mjs'], full: true }).includes('native-smoke'))
})

test('fix mode rewrites with the same tools instead of checking', () => {
  const steps = plan({ files: ['src/lib.rs', 'scripts/x.mjs'], fix: true })
  assert.deepEqual(steps.find(step => step.id === 'rustfmt').args, ['fmt', '--all'])
  assert.ok(steps.find(step => step.id === 'eslint').args.includes('--fix'))
  assert.ok(plan({ files: ['src/lib.rs'] }).find(step => step.id === 'rustfmt').args.includes('--check'))
})

test('staged plans only lint/format the staged files', () => {
  const steps = plan({ staged: true, files: ['apps/desktop/src/app.vue', 'scripts/ci-run.mjs', 'apps/desktop/src-tauri/src/lib.rs', 'README.md', 'apps/desktop/src-tauri/build.rs'] })
  assert.deepEqual(steps.map(step => step.id), ['eslint', 'rustfmt'])
  assert.deepEqual(steps[0].args.slice(-2), ['src/app.vue', '../../scripts/ci-run.mjs'])
  assert.deepEqual(steps[1].args.slice(-2), ['apps/desktop/src-tauri/src/lib.rs', 'apps/desktop/src-tauri/build.rs'])
  assert.deepEqual(plan({ staged: true, files: ['docs/a.md'] }), [])
})
