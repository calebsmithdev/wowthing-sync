import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { requireSuccess } from './ci-gate.mjs'
const require = createRequire(fileURLToPath(new URL('../apps/desktop/package.json', import.meta.url)))
const { parse } = require('yaml')
const directory = new URL('../.github/workflows/', import.meta.url)
async function workflow(name) { return parse(await readFile(new URL(name, directory), 'utf8')) }
test('Playwright caches isolate runner images, architectures and locked browser revisions', async () => {
  const native = (await workflow('desktop-checks.yml')).jobs.native
  const caches = native.steps.filter(step => step.uses?.split('@')[0] === 'actions/cache')
    .filter(step => step.with.path.split('\n').some(path => path.endsWith('/ms-playwright')))
  assert.equal(caches.length, 1)
  const inputs = caches[0].with
  assert.equal(inputs['restore-keys'], undefined, 'browser cache must not fall back across architectures')
  assert.ok([undefined, false, 'false'].includes(inputs.enableCrossOsArchive))
  const key = (image, os, arch, lock) => inputs.key.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) => {
    const values = {
      'matrix.os': image,
      'runner.os': os,
      'runner.arch': arch,
      "hashFiles('apps/desktop/package-lock.json')": lock,
    }
    assert.ok(Object.hasOwn(values, expression), `unsupported cache expression: ${expression}`)
    return values[expression]
  })
  const images = native.strategy.matrix.os.map(image => {
    const os = image.startsWith('macos-') ? 'macOS' : image.startsWith('windows-') ? 'Windows' : 'Linux'
    assert.notEqual(key(image, os, 'ARM64', 'lock-a'), key(image, os, 'X64', 'lock-a'))
    assert.notEqual(key(image, os, 'X64', 'lock-a'), key(image, os, 'X64', 'lock-b'))
    return key(image, os, 'X64', 'lock-a')
  })
  assert.equal(new Set(images).size, native.strategy.matrix.os.length, 'runner image caches must remain distinct even at the same architecture')
})
test('workflow DAG, real runner matrix and required-job topology are enforced', async () => {
  for (const name of await readdir(directory)) {
    if (!/\.ya?ml$/.test(name)) continue
    const document = await workflow(name)
    for (const [id, job] of Object.entries(document.jobs)) {
      const needs = typeof job.needs === 'string' ? [job.needs] : job.needs ?? []
      for (const dependency of needs) assert.ok(Object.hasOwn(document.jobs, dependency), `${name}/${id} has missing dependency ${dependency}`)
    }
  }
  const pr = await workflow('rust-tests.yml')
  assert.ok(Object.hasOwn(pr.on, 'pull_request')); assert.ok(Object.hasOwn(pr.on, 'merge_group'))
  assert.equal(pr.on.pull_request?.paths, undefined)
  assert.equal(pr.jobs.required.name, 'Required Desktop CI')
  assert.equal(pr.jobs.required.if, 'always()')
  assert.equal(pr.jobs.required.needs, 'checks')
  assert.equal(pr.jobs.checks.uses, './.github/workflows/desktop-checks.yml')
  const reusable = await workflow('desktop-checks.yml')
  assert.deepEqual(reusable.jobs.native.strategy.matrix.os, ['macos-15', 'macos-15-intel', 'windows-2022', 'ubuntu-24.04'])
  assert.deepEqual(reusable.jobs.complete.needs, ['frontend', 'native', 'audit'])
  assert.equal(reusable.jobs.complete.if, 'always()')
  const release = await workflow('release.yml')
  assert.equal(release.jobs.checks.uses, pr.jobs.checks.uses)
  assert.ok(release.jobs.build.needs.includes('checks'))
  assert.ok(release.jobs['draft-release'].needs.includes('checks'))
  const nightly = await workflow('nightly.yml')
  assert.equal(nightly.jobs.checks.uses, pr.jobs.checks.uses)
  // Every declared common dependency must be required by the executable gate.
  const needs = Object.fromEntries(reusable.jobs.complete.needs.map(id => [id, { result: 'success' }]))
  requireSuccess(needs, reusable.jobs.complete.needs)
  for (const id of reusable.jobs.complete.needs) assert.throws(() => requireSuccess({ ...needs, [id]: { result: 'skipped' } }, reusable.jobs.complete.needs), new RegExp(id))
})
