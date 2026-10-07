import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { root, command } from './native-integration.mjs'
const reportDirectory = resolve(root, 'test-results/native-smoke')
await mkdir(reportDirectory, { recursive: true })
let report = null, failure = null
try {
  await command('cargo', ['build', '--locked', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml', '--features', 'smoke-test'], { timeout: 20 * 60_000, label: 'smoke-build', reportDirectory })
  const binary = resolve(root, 'target/debug', process.platform === 'win32' ? 'wowthing-sync.exe' : 'wowthing-sync')
  const output = await command(binary, [], { timeout: 45_000, label: 'native-smoke', reportDirectory })
  const lines = output.stdout.split('\n').filter(line => line.startsWith('NATIVE_SMOKE '))
  if (lines.length !== 1 || !lines[0].startsWith('NATIVE_SMOKE PASS ')) throw new Error('missing or failed native smoke report')
  report = JSON.parse(lines[0].slice('NATIVE_SMOKE PASS '.length))
  if (report.errors.length || report.saved !== 1 || report.synced !== true) throw new Error('native smoke incomplete')
} catch (error) { failure = error.message; console.error(error.message); process.exitCode = 1 }
finally { await writeFile(resolve(reportDirectory, 'report.json'), JSON.stringify({ passed: failure === null, failure, native: report }, null, 2)) }
