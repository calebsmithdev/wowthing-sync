// Explicit opt-in only. Never run on a local user or a self-hosted runner.
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root, command } from './native-integration.mjs'
if (process.env.WOWTHING_OS_TESTS !== '1' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  console.error('OS probes refused: explicit disposable hosted-runner opt-in required')
  process.exit(2)
}
const unavailable = process.env.WOWTHING_EXPECT_VAULT_UNAVAILABLE === '1'
const reportDirectory = resolve(root, 'test-results/os-integration')
await mkdir(reportDirectory, { recursive: true })
let stdout = '', stderr = ''
const scopedEnvironment = { ...process.env, WOWTHING_OS_ID: `wowthing-ci-${randomUUID()}` }
let built = false
const binary = resolve(root, 'target/debug', process.platform === 'win32' ? 'wowthing-os-test.exe' : 'wowthing-os-test')
try {
  await command('cargo', ['build', '--locked', '--bin', 'wowthing-os-test', '--features', 'os-integration-test'])
  built = true
  const result = await command(binary, [], { cwd: root, env: scopedEnvironment, timeout: 90_000, label: 'os-probe', reportDirectory, onStdout: bytes => { stdout += bytes.toString() }, onStderr: bytes => { stderr += bytes.toString() } })
  const reports = result.stdout.split('\n').filter(line => line.startsWith('OS_INTEGRATION_REPORT '))
  if (reports.length !== 1) throw new Error('OS probe missing expected successful report')
  const report = JSON.parse(reports[0].slice('OS_INTEGRATION_REPORT '.length))
  if (report.passed !== true || report.marker !== 'WOWTHING_OS_CI_V1') throw new Error('OS adapter probe failed')
  await writeFile(resolve(reportDirectory, `${unavailable ? 'unavailable-' : ''}report.json`), JSON.stringify(report, null, 2))
} catch (error) { console.error(error); process.exitCode = 1 }
finally {
  if (built && !unavailable) {
    try {
      const cleanup = await command(binary, [], { env: { ...scopedEnvironment, WOWTHING_OS_CLEANUP: '1' }, capture: true, timeout: 30_000, label: 'os-cleanup', reportDirectory })
      const line = cleanup.stdout.split('\n').find(line => line.startsWith('OS_INTEGRATION_REPORT '))
      if (!line || JSON.parse(line.slice('OS_INTEGRATION_REPORT '.length)).passed !== true) throw new Error('OS cleanup report missing or failed')
      await writeFile(resolve(reportDirectory, 'cleanup.json'), line.slice('OS_INTEGRATION_REPORT '.length))
    } catch (error) { console.error(error); process.exitCode = 1 }
  }
  const prefix = unavailable ? 'unavailable-' : ''
  await writeFile(resolve(reportDirectory, `${prefix}stdout.log`), stdout)
  await writeFile(resolve(reportDirectory, `${prefix}stderr.log`), stderr)
}
