import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tauriInvocation } from './launchers.mjs'
export const marker = 'WOWTHING_ISOLATED_HARNESS_V1'
export const root = fileURLToPath(new URL('../', import.meta.url))
export async function command(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    let stdout = '', stderr = ''
    const child = spawn(command, args, { cwd: root, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', ...options })
    child.stdout?.on('data', data => { stdout += data.toString() })
    child.stderr?.on('data', data => { stderr += data.toString() })
    const timeout = setTimeout(() => child.kill('SIGKILL'), options.timeout ?? 20 * 60_000)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('close', code => { clearTimeout(timeout); code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} failed (${code}): ${stderr}`)) })
  })
}
export async function runFixture(binary, reportDirectory = resolve(root, 'test-results/native-integration')) {
  const temporary = await mkdtemp(join(tmpdir(), 'wowthing-isolated-'))
  const folder = join(temporary, 'WoW Unicode 雪 with spaces', '_retail_')
  const saved = join(folder, 'WTF/Account/SYNTHETIC/SavedVariables')
  await mkdir(saved, { recursive: true })
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(join(temporary, 'fixture-marker'), marker)
  await writeFile(join(saved, 'WoWthing_Collector.lua'), 'synthetic packaged collector')
  // Previous1.0.6 preferences: candidate runs its production migration and writes.
  await writeFile(join(temporary, 'settings.json'), JSON.stringify({ 'api-key': 'smoke-fixture-key', 'program-folder': folder, 'last-updated': '2026-01-01T00:00:00Z', 'notifications-enabled': false }))
  let uploads = 0
  const server = createServer(async (request, response) => {
    try {
      let body = ''
      for await (const chunk of request) { body += chunk; if (body.length > 10000) throw new Error('oversized fixture request') }
      const payload = JSON.parse(body)
      if (request.method !== 'POST' || request.url !== '/upload/' || payload.apiKey !== 'smoke-fixture-key' || !payload.luaFile.startsWith('synthetic')) throw new Error('unexpected fixture upload')
      uploads++
      setTimeout(() => { response.writeHead(200); response.end() }, 200)
    } catch { response.writeHead(400); response.end() }
  })
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolvePromise) })
  let stdout = '', stderr = ''
  let report
  try {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(binary, [], { cwd: temporary, env: { ...process.env, WOWTHING_TEST_ROOT: temporary, WOWTHING_TEST_ENDPOINT: `http://127.0.0.1:${server.address().port}/upload/` }, stdio: ['ignore', 'pipe', 'pipe'] })
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('native startup/test deadline exceeded')) }, 60_000)
      child.stdout.on('data', bytes => { stdout += bytes.toString(); process.stdout.write(bytes) })
      child.stderr.on('data', bytes => { stderr += bytes.toString(); process.stderr.write(bytes) })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', code => {
        clearTimeout(timer)
        try {
          const lines = stdout.split('\n').filter(line => line.startsWith('INTEGRATION_REPORT '))
          if (lines.length !== 1) throw new Error('missing or duplicate native report')
          report = JSON.parse(lines[0].slice('INTEGRATION_REPORT '.length))
          if (code !== 0 || report.marker !== marker || report.passed !== true || report.errors.length || !report.migrated || uploads < 1) throw new Error('native integration did not pass')
          resolvePromise()
        } catch (error) { reject(error) }
      })
    })
    const preferences = JSON.parse(await readFile(join(temporary, 'settings.json'), 'utf8'))
    if ('api-key' in preferences || !preferences['last-success']) throw new Error('upgrade fixture did not persist migration and upload')
    return report
  } finally {
    await writeFile(join(reportDirectory, 'stdout.log'), stdout)
    await writeFile(join(reportDirectory, 'stderr.log'), stderr)
    await writeFile(join(reportDirectory, 'report.json'), JSON.stringify({ report: report ?? null, uploads }, null, 2))
    const closed = new Promise(resolvePromise => server.close(resolvePromise))
    server.closeAllConnections()
    await closed
    await rm(temporary, { recursive: true, force: true })
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const invocation = tauriInvocation(resolve(root, 'apps/desktop'), ['build', '--debug', '--no-bundle', '--features', 'integration-test', '--', '--locked'])
    await command(invocation.command, invocation.args, { cwd: resolve(root, 'apps/desktop') })
    await runFixture(resolve(root, 'target/debug', process.platform === 'win32' ? 'Wowthing Sync.exe' : 'Wowthing Sync'))
  } catch (error) { console.error(error); process.exitCode = 1 }
}
