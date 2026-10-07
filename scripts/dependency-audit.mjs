// Findings are informational; incomplete audits still fail. Reports always survive.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { npmInvocation } from './launchers.mjs'
import { runProcess } from './process-runner.mjs'
import { requireCompletedAudit } from './dependency-audit-policy.mjs'
const directory = resolve('test-results/dependency-audit')
await mkdir(directory, { recursive: true })
async function audit(executable, args, label, cwd) {
  let stdout = '', status
  try { const result = await runProcess(executable, args, { cwd, capture: true, timeout: 180000, label, reportDirectory: directory, onStdout: bytes => { stdout += bytes } }); status = result.report }
  catch (error) { status = error.report; if (!status) throw error }
  await writeFile(resolve(directory, `${label}.json`), stdout)
  return { status, data: JSON.parse(stdout) }
}
const results = []
for (const kind of ['all', 'production']) {
  const launch = npmInvocation('npm', ['audit', '--json', ...(kind === 'production' ? ['--omit=dev'] : [])])
  const { status, data } = await audit(launch.command, launch.args, `npm-${kind}`, resolve('apps/desktop'))
  if (data.error || !data.metadata?.vulnerabilities) throw new Error(`npm ${kind} audit did not complete`)
  requireCompletedAudit(status, data.metadata.vulnerabilities.total, `npm ${kind}`)
  results.push({ kind, passed: status.passed, vulnerabilities: data.metadata.vulnerabilities })
}
const { status, data } = await audit('cargo', ['audit', '--json'], 'rustsec', resolve('.'))
if (!data.database || !data.vulnerabilities) throw new Error('RustSec audit did not complete')
requireCompletedAudit(status, data.vulnerabilities.count, 'RustSec')
results.push({ kind: 'rustsec', passed: status.passed, vulnerabilities: data.vulnerabilities.count })
await writeFile(resolve(directory, 'report.json'), JSON.stringify(results, null, 2))
if (results.some(result => result.passed !== true)) {
  console.warn('::warning::Dependency audit findings (informational): see dependency-audits artifact for structured reports')
}
