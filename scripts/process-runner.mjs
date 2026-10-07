import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const invocation = randomUUID()
let sequence = 0
export async function terminateTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    await new Promise((resolvePromise, reject) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      const timer = setTimeout(() => { killer.kill(); reject(new Error('taskkill deadline exceeded')) }, 5000)
      killer.once('error', error => { clearTimeout(timer); reject(error) })
      killer.once('close', code => { clearTimeout(timer); code === 0 || child.exitCode !== null || child.signalCode !== null ? resolvePromise() : reject(new Error(`taskkill failed (${code})`)) })
    })
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}
async function cleanupRegistry(directory, owner) {
  if (process.platform === 'win32') return // The enclosing kill-on-close Job Object owns nested jobs.
  let names
  try { names = await readdir(directory) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  for (const name of names) {
    if (!name.endsWith('.owned.json') && !name.endsWith('.owned.json.pending')) continue
    const path = join(directory, name)
    let record
    try { record = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (record.owner !== owner && !record.ancestors?.includes(owner)) continue
    if (record.owner === owner) continue // Retired only by finally after confirmed group cleanup.
    if (!Number.isInteger(record.pid) || record.pid <= 1) throw new Error('invalid owned process record')
    await terminateTree({ pid: record.pid, exitCode: null, signalCode: null })
    // Do not leave terminated descendant IDs for enclosing supervisors to act on
    // later. Another concurrently finishing owner may already have removed it.
    await rm(path, { force: true })
  }
}
/** Each owned group registers with its enclosing supervisor, so nested wrappers
 * cannot escape parent deadlines. Windows suspended launches use kill-on-close
 * Job Objects; normal wrapper exits also remove their owned descendants. */
export async function runProcess(executable, args = [], options = {}) {
  const { timeout = 20 * 60_000, capture = false, label = basename(executable), reportDirectory = process.env.CI_REPORT_DIR, onStdout, onStderr, waitDescendants = false, ...spawnOptions } = options
  const start = Date.now()
  let stdout = '', stderr = '', failure = null, timedOut = false
  let exitCode = null, signal = null, pid = null, processClosed = false, treeClosed = false, cleanup
  const owner = randomUUID()
  const ancestors = JSON.parse(process.env.WOWTHING_PROCESS_ANCESTORS ?? '[]')
  if (!Array.isArray(ancestors) || ancestors.length > 128 || ancestors.some(value => typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value))) throw new Error('invalid process ownership ancestry')
  const inheritedRegistry = process.env.WOWTHING_PROCESS_REGISTRY
  const registry = inheritedRegistry ?? await mkdtemp(join(tmpdir(), 'wowthing-process-owner-'))
  const entry = join(registry, `${invocation}-${sequence}-${randomUUID()}.owned.json`)
  const jobConfig = process.platform === 'win32' ? join(registry, `${randomUUID()}.job.json`) : null
  const append = (previous, bytes) => { const next = previous + bytes.toString(); return next.length > 16 * 1024 * 1024 ? next.slice(-16 * 1024 * 1024) : next }
  let child
  try {
    let launched = executable, launchArgs = args
    if (process.platform !== 'win32') {
      launched = process.execPath
      launchArgs = [fileURLToPath(import.meta.url), '--wowthing-owned-child']
    }
    if (jobConfig) {
      await writeFile(jobConfig, JSON.stringify({ executable, args, cwd: spawnOptions.cwd ?? process.cwd(), waitDescendants }))
      launched = 'powershell.exe'; launchArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./process-job.ps1', import.meta.url)), '-Configuration', jobConfig]
    }
    await new Promise((resolvePromise, reject) => {
      child = spawn(launched, launchArgs, { ...spawnOptions, env: { ...(spawnOptions.env ?? process.env), WOWTHING_PROCESS_REGISTRY: registry, WOWTHING_PROCESS_ANCESTORS: JSON.stringify([...ancestors, owner]) }, detached: process.platform !== 'win32', stdio: [process.platform === 'win32' ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
      pid = child.pid ?? null
      let closeDeadline
      const timer = setTimeout(() => {
        timedOut = true
        closeDeadline = setTimeout(() => {
          child.kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); child.unref()
          reject(new Error(`${label} process did not close after forced cleanup`))
        }, 10_000)
        cleanup = (async () => { try { await terminateTree(child) } finally { await cleanupRegistry(registry, owner) } })().catch(error => { failure = `process cleanup failed: ${error.message}`; child.kill('SIGKILL') })
      }, timeout)
      child.stdout.on('data', bytes => { stdout = append(stdout, bytes); if (!capture) process.stdout.write(bytes); onStdout?.(bytes) })
      child.stderr.on('data', bytes => { stderr = append(stderr, bytes); if (!capture) process.stderr.write(bytes); onStderr?.(bytes) })
      child.once('error', error => { clearTimeout(timer); clearTimeout(closeDeadline); processClosed = !child.pid; treeClosed = processClosed; reject(error) })
      child.once('exit', () => {
        // An exited wrapper may leave descendants holding stdout/stderr open.
        // Stop its group now, then allow close to drain the captured streams.
        if (process.platform !== 'win32' && !cleanup) cleanup = (async () => { try { await terminateTree(child) } finally { await cleanupRegistry(registry, owner) } })().catch(error => { failure = `process cleanup failed: ${error.message}` })
      })
      child.once('close', (code, childSignal) => { clearTimeout(timer); clearTimeout(closeDeadline); processClosed = true; exitCode = code; signal = childSignal; resolvePromise() })
      if (pid) { writeFileSync(`${entry}.pending`, JSON.stringify({ pid, owner, ancestors })); renameSync(`${entry}.pending`, entry) }
      // A detached POSIX group receives its executable only after publication.
      // Until then it can only wait, and an interrupted owner closes its pipe.
      if (process.platform !== 'win32') {
        child.stdin.once('error', reject)
        child.stdin.write(`${JSON.stringify({ executable, args })}\n`)
      }
    })
    await cleanup
    if (failure) throw new Error(timedOut ? `${label} exceeded ${timeout}ms deadline (${failure})` : failure)
    // Remove background descendants after normal exits too. The Windows launcher
    // closes its Job Object only after all owned processes are gone.
    if (process.platform !== 'win32' && !cleanup) await terminateTree(child)
    await cleanupRegistry(registry, owner)
    treeClosed = true
    if (timedOut) throw new Error(`${label} exceeded ${timeout}ms deadline${failure ? ` (${failure})` : ''}`)
    if (exitCode !== 0) throw new Error(`${label} failed with exit ${exitCode}${signal ? ` (${signal})` : ''}`)
  } catch (error) {
    failure = error.message
    // Registration/config/report setup may fail after spawn, before the normal
    // listeners exist. It still owns the child and must terminate and await it.
    if (!child) { processClosed = true; treeClosed = true }
    else if (!processClosed) {
      let cleanupSucceeded = true
      try { try { await terminateTree(child) } finally { await cleanupRegistry(registry, owner) } } catch (cleanupError) { cleanupSucceeded = false; failure += `; cleanup: ${cleanupError.message}`; child.kill('SIGKILL') }
      await new Promise(resolvePromise => {
        if (processClosed) { resolvePromise(); return }
        const timer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); child.unref(); resolvePromise() }, 10_000)
        child.once('close', () => { clearTimeout(timer); processClosed = true; resolvePromise() })
      })
      treeClosed = processClosed && cleanupSucceeded
    }
  }
  finally {
    if (treeClosed || !pid) { for (const path of [entry, `${entry}.pending`]) { try { unlinkSync(path) } catch {} } }
    if (jobConfig) await rm(jobConfig, { force: true })
    if (!inheritedRegistry && processClosed && treeClosed) await rm(registry, { recursive: true, force: true })
  }
  const report = { label, pid, startedAt: new Date(start).toISOString(), durationMs: Date.now() - start, exitCode, signal, timedOut, processClosed, treeClosed, retainedProcessRegistry: treeClosed ? null : registry, passed: failure === null, failure }
  if (reportDirectory) {
    await mkdir(reportDirectory, { recursive: true })
    const name = `${invocation}-${String(sequence++).padStart(3, '0')}-${label.replace(/[^a-z0-9-]/gi, '_')}`
    await Promise.all([
      writeFile(resolve(reportDirectory, `${name}.json`), JSON.stringify(report, null, 2)),
      writeFile(resolve(reportDirectory, `${name}.stdout.log`), stdout),
      writeFile(resolve(reportDirectory, `${name}.stderr.log`), stderr),
    ])
  }
  if (failure) { const error = new Error(failure); error.report = report; throw error }
  return { stdout, stderr, report }
}


// Private POSIX launcher. The control pipe is held only by runProcess: owner
// death closes it and kills this group even if registry publication was interrupted.
// The requested executable never runs before its owner has published the group.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--wowthing-owned-child') {
  let input = '', started = false
  const abandoned = () => { try { process.kill(-process.pid, 'SIGKILL') } catch { process.exit(1) } }
  process.stdin.once('end', abandoned)
  process.stdin.on('data', bytes => {
    if (started) return
    input += bytes
    if (input.length > 16 * 1024 * 1024) abandoned()
    if (!input.endsWith('\n')) return
    try {
      const { executable, args } = JSON.parse(input)
      if (typeof executable !== 'string' || !Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('invalid owned executable')
      started = true
      const target = spawn(executable, args, { env: process.env, cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'] })
      target.once('error', error => { console.error(error.message); process.exit(1) })
      target.once('exit', (code, signal) => {
        if (signal) process.kill(process.pid, signal)
        else process.exit(code ?? 1)
      })
    } catch (error) { console.error(error.message); process.exit(1) }
  })
}
