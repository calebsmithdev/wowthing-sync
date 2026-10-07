import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { releaseSigningEnvironment, tauriInvocation } from './launchers.mjs'

const desktop = fileURLToPath(new URL('../apps/desktop', import.meta.url))
const invocation = tauriInvocation(desktop, process.argv.slice(2))
const result = spawnSync(invocation.command, invocation.args, {
  cwd: desktop,
  env: releaseSigningEnvironment(process.env),
  stdio: 'inherit',
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1
