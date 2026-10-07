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
async function cleanupRegistry(directory) {
  if (process.platform === 'win32') return // The enclosing kill-on-close Job Object owns nested jobs.
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.owned.json')) continue
    let record
    try { record = JSON.parse(await readFile(join(directory, name), 'utf8')) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (record.invocation === invocation || !Number.isInteger(record.pid) || record.pid <= 1) continue
    await terminateTree({ pid: record.pid, exitCode: null, signalCode: null })
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
  const inheritedRegistry = process.env.WOWTHING_PROCESS_REGISTRY
  const registry = inheritedRegistry ?? await mkdtemp(join(tmpdir(), 'wowthing-process-owner-'))
  const entry = join(registry, `${invocation}-${sequence}-${randomUUID()}.owned.json`)
  const jobConfig = process.platform === 'win32' ? join(registry, `${randomUUID()}.job.json`) : null
  const append = (previous, bytes) => { const next = previous + bytes.toString(); return next.length > 16 * 1024 * 1024 ? next.slice(-16 * 1024 * 1024) : next }
  let child
  try {
    let launched = executable, launchArgs = args
    if (jobConfig) {
      await writeFile(jobConfig, JSON.stringify({ executable, args, cwd: spawnOptions.cwd ?? process.cwd(), waitDescendants }))
      launched = 'powershell.exe'; launchArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./process-job.ps1', import.meta.url)), '-Configuration', jobConfig]
    }
    await new Promise((resolvePromise, reject) => {
      child = spawn(launched, launchArgs, { ...spawnOptions, env: { ...(spawnOptions.env ?? process.env), WOWTHING_PROCESS_REGISTRY: registry }, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
      pid = child.pid ?? null
      let closeDeadline
      const timer = setTimeout(() => {
        timedOut = true
        closeDeadline = setTimeout(() => {
          child.kill('SIGKILL'); child.stdout.destroy(); child.stderr.destroy(); child.unref()
          reject(new Error(`${label} process did not close after forced cleanup`))
        }, 10_000)
        cleanup = (async () => { try { if (!inheritedRegistry) await cleanupRegistry(registry) } finally { await terminateTree(child) } })().catch(error => { failure = `process cleanup failed: ${error.message}`; child.kill('SIGKILL') })
      }, timeout)
      child.stdout.on('data', bytes => { stdout = append(stdout, bytes); if (!capture) process.stdout.write(bytes); onStdout?.(bytes) })
      child.stderr.on('data', bytes => { stderr = append(stderr, bytes); if (!capture) process.stderr.write(bytes); onStderr?.(bytes) })
      child.once('error', error => { clearTimeout(timer); clearTimeout(closeDeadline); processClosed = !child.pid; treeClosed = processClosed; reject(error) })
      child.once('close', (code, childSignal) => { clearTimeout(timer); clearTimeout(closeDeadline); processClosed = true; exitCode = code; signal = childSignal; resolvePromise() })
      if (pid) { writeFileSync(`${entry}.pending`, JSON.stringify({ pid, invocation })); renameSync(`${entry}.pending`, entry) }
    })
    await cleanup
    // Remove background descendants after normal exits too. The Windows launcher
    // closes its Job Object only after all owned processes are gone.
    if (process.platform !== 'win32') await terminateTree(child)
    if (!inheritedRegistry) await cleanupRegistry(registry)
    treeClosed = true
    if (timedOut) throw new Error(`${label} exceeded ${timeout}ms deadline${failure ? ` (${failure})` : ''}`)
    if (exitCode !== 0) throw new Error(`${label} failed with exit ${exitCode}${signal ? ` (${signal})` : ''}`)
  } catch (error) {
    failure = error.message
    // Registration/config/report setup may fail after spawn, before the normal
    // listeners exist. It still owns the child and must terminate and await it.
    if (!child) { processClosed = true; treeClosed = true }
    else if (!processClosed) {
      try { await terminateTree(child) } catch (cleanupError) { failure += `; cleanup: ${cleanupError.message}`; child.kill('SIGKILL') }
      await new Promise(resolvePromise => {
        if (processClosed) { resolvePromise(); return }
        const timer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); child.unref(); resolvePromise() }, 10_000)
        child.once('close', () => { clearTimeout(timer); processClosed = true; resolvePromise() })
      })
      treeClosed = processClosed
    }
  }
  finally {
    if (treeClosed || !pid) { try { unlinkSync(entry) } catch {} }
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
