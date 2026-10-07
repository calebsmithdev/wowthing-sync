import { resolve } from 'node:path'
import { npmInvocation } from './launchers.mjs'
import { runProcess } from './process-runner.mjs'
// YAML passes executable + individual args. No shell interpolation or secret env dump.
const [label, seconds, executable, ...args] = process.argv.slice(2)
if (!label || !executable || !(Number(seconds) > 0)) throw new Error('usage: ci-run label timeout-seconds executable [args]')
const invocation = ['npm', 'npx'].includes(executable) ? npmInvocation(executable, args) : { command: executable, args }
try { await runProcess(invocation.command, invocation.args, { cwd: process.cwd(), label, timeout: Number(seconds) * 1000, reportDirectory: resolve(process.env.CI_REPORT_DIR ?? 'test-results/diagnostics') }) }
catch (error) { console.error(error.message); process.exitCode = 1 }
