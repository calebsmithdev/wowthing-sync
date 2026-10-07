import { createServer } from 'node:http'
import { runProcess } from './process-runner.mjs'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tauriInvocation } from './launchers.mjs'
export const marker = 'WOWTHING_ISOLATED_HARNESS_V1'
export const root = fileURLToPath(new URL('../', import.meta.url))
export async function command(executable, args, options = {}) {
  return runProcess(executable, args, { cwd: root, ...options })
}
export async function runFixture(binary, reportDirectory = resolve(root, 'test-results/native-integration'), { auditedBinary = binary } = {}) {
  if (!(await readFile(auditedBinary)).includes(Buffer.from(marker))) throw new Error('refusing to launch a binary without isolated harness identity')
  const temporary = await mkdtemp(join(tmpdir(), 'wowthing-isolated-'))
  const folder = join(temporary, 'WoW Unicode 雪 with spaces', '_retail_')
  const saved = join(folder, 'WTF/Account/SYNTHETIC/SavedVariables')
  let stdout = '', stderr = ''
  let report, failure = null, safeToRemove = true, server
  let uploads = 0, navigationWriteUploaded = false
  const responseTimers = new Set()
  try {
  await mkdir(saved, { recursive: true })
  await mkdir(join(temporary, 'not-a-wow-folder')) // Existing invalid folder reaches production validation.
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(join(temporary, 'fixture-marker'), marker)
  await writeFile(join(saved, 'WoWthing_Collector.lua'), 'synthetic packaged collector')
  // Previous1.0.6 preferences: candidate runs its production migration and writes.
  await writeFile(join(temporary, 'settings.json'), JSON.stringify({ 'api-key': 'smoke-fixture-key', 'program-folder': folder, 'last-updated': '2026-01-01T00:00:00Z', 'notifications-enabled': false }))
  server = createServer(async (request, response) => {
    try {
      let body = ''
      for await (const chunk of request) { body += chunk; if (body.length > 10000) throw new Error('oversized fixture request') }
      const payload = JSON.parse(body)
      if (request.method !== 'POST' || request.url !== '/upload/' || payload.apiKey !== 'smoke-fixture-key' || !payload.luaFile.startsWith('synthetic')) throw new Error('unexpected fixture upload')
      uploads++
      if (payload.luaFile === 'synthetic write during native navigation') navigationWriteUploaded = true
      const timer = setTimeout(() => { responseTimers.delete(timer); response.writeHead(200); response.end() }, 750)
      responseTimers.add(timer)
      response.once('close', () => { clearTimeout(timer); responseTimers.delete(timer) })
    } catch { response.writeHead(400); response.end() }
  })
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolvePromise) })
    const result = await command(binary, [], {
      cwd: temporary,
      env: { ...process.env, WOWTHING_TEST_ROOT: temporary, WOWTHING_TEST_ENDPOINT: `http://127.0.0.1:${server.address().port}/upload/` },
      timeout: 60_000, label: 'native-integration', reportDirectory: join(reportDirectory, 'process'),
      onStdout: bytes => { stdout += bytes.toString() }, onStderr: bytes => { stderr += bytes.toString() },
    })
    const lines = result.stdout.split('\n').filter(line => line.startsWith('INTEGRATION_REPORT '))
    if (lines.length !== 1) throw new Error('missing or duplicate native report')
    report = JSON.parse(lines[0].slice('INTEGRATION_REPORT '.length))
    if (report.marker !== marker || report.passed !== true || report.errors.length || !report.migrated || uploads < 1 || !navigationWriteUploaded || !report.resourcesClosed || !report.windowLifecycle || !report.updater) throw new Error('native integration did not pass')
    const preferences = JSON.parse(await readFile(join(temporary, 'settings.json'), 'utf8'))
    if ('api-key' in preferences || !preferences['last-success']) throw new Error('upgrade fixture did not persist migration and upload')
    return report
  } catch (error) { failure = error.message; safeToRemove = error.report?.processClosed !== false && error.report?.treeClosed !== false; throw error }
  finally {
    await mkdir(reportDirectory, { recursive: true })
    await writeFile(join(reportDirectory, 'stdout.log'), stdout)
    await writeFile(join(reportDirectory, 'stderr.log'), stderr)
    await writeFile(join(reportDirectory, 'report.json'), JSON.stringify({ passed: failure === null, failure, report: report ?? null, uploads, navigationWriteUploaded, retainedFixture: safeToRemove ? null : temporary }, null, 2))
    for (const timer of responseTimers) clearTimeout(timer)
    if (server?.listening) {
      const closed = new Promise(resolvePromise => server.close(resolvePromise))
      server.closeAllConnections()
      await closed
    }
    if (safeToRemove) await rm(temporary, { recursive: true, force: true })
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const invocation = tauriInvocation(resolve(root, 'apps/desktop'), ['build', '--debug', '--no-bundle', '--features', 'integration-test', '--', '--locked'])
    await command(invocation.command, invocation.args, { cwd: resolve(root, 'apps/desktop') })
    await runFixture(resolve(root, 'target/debug', process.platform === 'win32' ? 'Wowthing Sync.exe' : 'Wowthing Sync'))
  } catch (error) { console.error(error); process.exitCode = 1 }
}
