import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, mkdir, cp, chmod, writeFile, realpath } from 'node:fs/promises'
import { join, delimiter } from 'node:path'
import { tmpdir } from 'node:os'
import { runProcess } from './process-runner.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
async function assertStopped(pid) {
  assert.ok(Number.isInteger(pid) && pid > 1, 'missing owned descendant PID')
  if (process.platform === 'win32') assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH')
  else {
    let stderr = ''
    const state = await runProcess('ps', ['-o', 'stat=', '-p', String(pid)], { capture: true, onStderr: bytes => { stderr += bytes } }).catch(error => {
      assert.equal(error.report?.exitCode, 1, error.message)
      assert.equal(stderr.trim(), '', 'process inspection failed')
      return { stdout: '' }
    })
    assert.ok(!state.stdout.trim() || state.stdout.trim().startsWith('Z'), `descendant survived: ${state.stdout}`)
  }
}
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
    await assertStopped(childPid)
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
  await assertStopped(pid)
  const background = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(c.pid); c.unref()`
  const result = await runProcess(process.execPath, ['-e', background], { capture: true, timeout: 10_000 })
  const orphan = Number(result.stdout.trim())
  await new Promise(resolvePromise => setTimeout(resolvePromise, 150))
  await assertStopped(orphan)
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

test('an intermediate deadline under an outer supervisor stops only its own subtree', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scoped-supervisor-'))
  try {
    const module = new URL('./process-runner.mjs', import.meta.url).href
    const release = join(directory, 'release-sibling')
    const sibling = `const fs=require('node:fs');console.log(process.pid);setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},25)`
    const nested = `import {runProcess} from ${JSON.stringify(module)}; await runProcess(process.execPath,['-e','console.log(process.pid);setInterval(()=>{},1000)'],{timeout:30000})`
    const inspect = `const state=spawnSync('ps',['-o','stat=','-p',String(pid)],{encoding:'utf8'});assert.ok(state.status===0||(state.status===1&&!state.stderr.trim()),state.stderr);assert.ok(!state.stdout.trim()||state.stdout.trim().startsWith('Z'),'owned descendant survived: '+state.stdout)`
    const source = `
      import assert from 'node:assert/strict'; import {writeFile} from 'node:fs/promises'; import {spawnSync} from 'node:child_process';
      import {runProcess} from ${JSON.stringify(module)};
      let ready;const started=new Promise(resolve=>ready=resolve);let siblingPid;
      const sibling=runProcess(process.execPath,['-e',${JSON.stringify(sibling)}],{capture:true,timeout:45000,onStdout:bytes=>{siblingPid=Number(bytes.toString().trim());ready()}});
      const readiness=setTimeout(()=>ready(),20000);
      try {
        await started; clearTimeout(readiness); assert.ok(siblingPid>1,'sibling startup failed');
        let descendant='';
        await assert.rejects(runProcess(process.execPath,['--input-type=module','-e',${JSON.stringify(nested)}],{timeout:${process.platform === 'win32' ? 15000 : 2000},capture:true,onStdout:bytes=>descendant+=bytes}),/deadline/);
        const pid=Number(descendant.trim());assert.ok(pid>1,'nested startup failed');
        await new Promise(resolve=>setTimeout(resolve,150));
        ${process.platform === 'win32' ? "assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH')" : inspect};
        process.kill(siblingPid,0); // Sibling and this enclosing supervisor must still be alive.
      } finally { clearTimeout(readiness);await writeFile(${JSON.stringify(release)},'done');await sibling; }
      console.log('SCOPED_OWNERS_PASS');
    `
    const result = await runProcess(process.execPath, ['--input-type=module', '-e', source], { capture: true, timeout: process.platform === 'win32' ? 60000 : 15000 })
    assert.match(result.stdout, /SCOPED_OWNERS_PASS/)
    assert.equal(result.report.treeClosed, true)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const hasPowerShell = spawnSync(powershell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' }).status === 0
test('PowerShell resolves duplicate PATH commands to the first scalar file and preserves absolute paths', { skip: !hasPowerShell && process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resolver spaces 雪-'))
  try {
    const first = join(directory, 'first node space'), second = join(directory, 'second node space')
    const executable = process.platform === 'win32' ? 'node.exe' : 'node'
    for (const path of [first, second]) { await mkdir(path); await cp(process.execPath, join(path, executable)); await chmod(join(path, executable), 0o755) }
    const env = { ...process.env, PATH: [first, second, process.env.PATH].join(delimiter) }
    const script = fileURLToPath(new URL('./process-job.ps1', import.meta.url))
    const configuration = join(directory, 'configuration.json')
    for (const [command, expected] of [['node', join(first, executable)], [process.execPath, process.execPath]]) {
      await writeFile(configuration, JSON.stringify({ executable: command, args: [], cwd: directory }))
      const result = spawnSync(powershell, ['-NoProfile', '-File', script, '-Configuration', configuration, '-ResolveOnly'], { env, encoding: 'utf8', timeout: 30000 })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(JSON.parse(result.stdout).executable, expected)
    }
    if (process.platform === 'win32') {
      const args = ['spaces and 雪', 'literal"quote', 'trailing\\']
      for (const [command, expected] of [['node', join(first, executable)], [process.execPath, process.execPath]]) {
        const source = 'console.log(JSON.stringify({executable:process.execPath,cwd:process.cwd(),args:process.argv.slice(1)}))'
        const result = await runProcess(command, ['-e', source, ...args], { cwd: directory, env, capture: true, timeout: 30000 })
        assert.deepEqual(JSON.parse(result.stdout), { executable: expected, cwd: directory, args })
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})


test('unconfirmed POSIX registry cleanup retains the tree failure and registry', { skip: process.platform === 'win32' }, async context => {
  const directory = await mkdtemp(join(tmpdir(), 'unconfirmed-cleanup-'))
  const old = process.env.WOWTHING_PROCESS_REGISTRY
  try {
    await writeFile(join(directory, 'broken.owned.json'), '{invalid')
    process.env.WOWTHING_PROCESS_REGISTRY = directory
    // Inject only the registration IO failure after a real child was started.
    context.mock.method(fs, 'writeFileSync', () => { throw new Error('injected registration failure') })
    syncBuiltinESMExports()
    await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { capture: true }), error => {
      assert.match(error.message, /injected registration failure; cleanup:/)
      assert.equal(error.report.passed, false)
      assert.equal(error.report.processClosed, true)
      assert.equal(error.report.treeClosed, false)
      assert.equal(error.report.retainedProcessRegistry, directory)
      assert.throws(() => process.kill(error.report.pid, 0), failure => failure.code === 'ESRCH')
      return true
    })
    assert.ok((await readdir(directory)).includes('broken.owned.json'))
  } finally {
    context.mock.restoreAll(); syncBuiltinESMExports()
    if (old === undefined) delete process.env.WOWTHING_PROCESS_REGISTRY; else process.env.WOWTHING_PROCESS_REGISTRY = old
    await rm(directory, { recursive: true, force: true })
  }
})

test('interrupted POSIX publication cannot start the executable or orphan its group', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'interrupted-publication-'))
  const module = new URL('./process-runner.mjs', import.meta.url).href
  try {
    for (const phase of ['writeFileSync', 'renameSync']) {
      const marker = join(directory, phase)
      const target = `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');setInterval(()=>{},1000)`
      const source = `
        import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {runProcess} from ${JSON.stringify(module)};
        const original=fs.${phase};
        fs.${phase}=(...args)=>{
          ${phase === 'renameSync' ? "console.log('UNPUBLISHED '+JSON.parse(fs.readFileSync(args[0],'utf8')).pid)" : "console.log('UNPUBLISHED '+JSON.parse(args[1]).pid)"};
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
          return original(...args);
        };syncBuiltinESMExports();
        await runProcess(process.execPath,['-e',${JSON.stringify(target)}],{timeout:20000});
      `
      let output = ''
      await assert.rejects(runProcess(process.execPath, ['--input-type=module', '-e', source], { timeout: 2000, capture: true, onStdout: bytes => { output += bytes } }), error => {
        assert.equal(error.report.timedOut, true); assert.equal(error.report.treeClosed, true)
        return /deadline/.test(error.message)
      })
      const pid = Number(/UNPUBLISHED (\d+)/.exec(output)?.[1])
      await new Promise(resolve => setTimeout(resolve, 150))
      await assertStopped(pid)
      await assert.rejects(readFile(marker), error => error.code === 'ENOENT')
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('supervision preserves cwd, environment, output, native exit and inherited-output descendant cleanup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supervised cwd 雪 spaces-'))
  try {
    const result = await runProcess(process.execPath, ['-e', 'console.log(JSON.stringify({cwd:process.cwd(),value:process.env.WOWTHING_TEST_VALUE}));console.error("owned stderr")'], { cwd: directory, env: { ...process.env, WOWTHING_TEST_VALUE: 'literal value 雪' }, capture: true, timeout: 15000 })
    assert.deepEqual(JSON.parse(result.stdout), { cwd: await realpath(directory), value: 'literal value 雪' })
    assert.equal(result.stderr.trim(), 'owned stderr')
    await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(7)'], { capture: true, timeout: 15000 }), error => error.report.exitCode === 7 && error.report.signal === null)
    if (process.platform !== 'win32') await assert.rejects(runProcess(process.execPath, ['-e', "process.kill(process.pid,'SIGTERM')"], { capture: true, timeout: 15000 }), error => error.report.signal === 'SIGTERM')
    const background = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});console.log(child.pid);child.unref()`
    const completed = await runProcess(process.execPath, ['-e', background], { capture: true, timeout: 15000 })
    assert.equal(completed.report.exitCode, 0)
    await new Promise(resolve => setTimeout(resolve, 150))
    await assertStopped(Number(completed.stdout.trim()))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a timed-out unconfirmed group kill cannot report treeClosed or remove its ownership record', { skip: process.platform === 'win32' }, async context => {
  const originalKill = process.kill
  let report
  try {
    context.mock.method(process, 'kill', (pid, signal) => {
      if (pid < 0 && signal === 'SIGKILL') { const error = new Error('injected group kill failure'); error.code = 'EPERM'; throw error }
      return originalKill(pid, signal)
    })
    await assert.rejects(runProcess(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),500)'], { capture: true, timeout: 200 }), error => {
      report = error.report
      assert.match(error.message, /deadline.*injected group kill failure/)
      assert.equal(report.timedOut, true)
      assert.equal(report.processClosed, true)
      assert.equal(report.treeClosed, false)
      assert.ok(report.retainedProcessRegistry)
      return true
    })
    const entries = await readdir(report.retainedProcessRegistry)
    const records = await Promise.all(entries.filter(name => name.endsWith('.owned.json')).map(async name => ({ name, data: JSON.parse(await readFile(join(report.retainedProcessRegistry, name), 'utf8')) })))
    assert.ok(records.some(record => record.data.pid === report.pid), 'unconfirmed ownership record must survive')
  } finally {
    context.mock.restoreAll()
    if (report) {
      try { originalKill(-report.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
      // Retire only this deliberately interrupted invocation, never enclosing/sibling records.
      for (const name of await readdir(report.retainedProcessRegistry)) {
        if (!name.endsWith('.owned.json')) continue
        const path = join(report.retainedProcessRegistry, name)
        if (JSON.parse(await readFile(path, 'utf8')).pid === report.pid) await rm(path)
      }
    }
  }
})
