import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runProcess } from './process-runner.mjs'
test('supervision reports failure and kills its process tree at deadline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'process-supervision-'))
  try {
    const source = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(child.pid); setInterval(()=>{},1000)`
    await assert.rejects(runProcess(process.execPath, ['-e', source], { timeout: process.platform === 'win32' ? 15_000 : 2000, capture: true, reportDirectory: directory, label: 'owned-tree' }), /deadline/)
    const names = await readdir(directory)
    const report = JSON.parse(await readFile(join(directory, names.find(name => name.endsWith('.json'))), 'utf8'))
    const childPid = Number((await readFile(join(directory, names.find(name => name.endsWith('.stdout.log'))), 'utf8')).trim())
    assert.equal(report.timedOut, true); assert.equal(report.passed, false); assert.ok(report.failure)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150))
    if (process.platform !== 'win32') {
      // kill0 can still see a briefly unreaped zombie on Linux; ps state proves it cannot run.
      const state = await runProcess('ps', ['-o', 'stat=', '-p', String(childPid)], { capture: true }).catch(() => ({ stdout: '' }))
      assert.ok(!state.stdout.trim() || state.stdout.trim().startsWith('Z'), `descendant survived: ${state.stdout}`)
    } else assert.throws(() => process.kill(childPid, 0))
    await assert.rejects(runProcess('wowthing-command-that-does-not-exist', [], { capture: true, reportDirectory: directory }), /ENOENT|failed with exit/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test('nested supervisors and successful wrappers cannot leave owned descendants', async () => {
  const module = new URL('./process-runner.mjs', import.meta.url).href
  const source = `import {runProcess} from ${JSON.stringify(module)}; await runProcess(process.execPath,['-e','console.log(process.pid);setInterval(()=>{},1000)'],{timeout:20000})`
  let descendant = ''
  await assert.rejects(runProcess(process.execPath, ['--input-type=module', '-e', source], { timeout: process.platform === 'win32' ? 15_000 : 2000, capture: true, onStdout: data => { descendant += data.toString() } }), /deadline/)
  const pid = Number(descendant.trim())
  assert.ok(pid > 1)
  await new Promise(resolvePromise => setTimeout(resolvePromise, 150))
  if (process.platform !== 'win32') {
    const state = await runProcess('ps', ['-o', 'stat=', '-p', String(pid)], { capture: true }).catch(() => ({ stdout: '' }))
    assert.ok(!state.stdout.trim() || state.stdout.trim().startsWith('Z'), `nested child survived: ${state.stdout}`)
  } else assert.throws(() => process.kill(pid, 0))
  const background = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(c.pid); c.unref()`
  const result = await runProcess(process.execPath, ['-e', background], { capture: true, timeout: 10_000 })
  const orphan = Number(result.stdout.trim())
  await new Promise(resolvePromise => setTimeout(resolvePromise, 150))
  if (process.platform !== 'win32') {
    const state = await runProcess('ps', ['-o', 'stat=', '-p', String(orphan)], { capture: true }).catch(() => ({ stdout: '' }))
    assert.ok(!state.stdout.trim() || state.stdout.trim().startsWith('Z'), `background child survived: ${state.stdout}`)
  } else assert.throws(() => process.kill(orphan, 0))
})

test('a registration failure cannot leak a spawned process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'registration-failure-'))
  const old = process.env.WOWTHING_PROCESS_REGISTRY
  process.env.WOWTHING_PROCESS_REGISTRY = join(directory, 'does-not-exist')
  try {
    await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { capture: true }), error => {
      assert.equal(error.report.passed, false)
      assert.equal(error.report.processClosed, true)
      assert.equal(error.report.treeClosed, true)
      if (error.report.pid) assert.throws(() => process.kill(error.report.pid, 0))
      return true
    })
  } finally {
    if (old === undefined) delete process.env.WOWTHING_PROCESS_REGISTRY; else process.env.WOWTHING_PROCESS_REGISTRY = old
    await rm(directory, { recursive: true, force: true })
  }
})
