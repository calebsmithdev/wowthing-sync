import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
// This feature replaces the entire builder before any real preferences/secret setup.
// CI uses xvfb-run on Linux. macOS WKWebView is checked in process, not unsupported tauri-driver.
const root = fileURLToPath(new URL('../', import.meta.url))
const build = spawn('cargo', ['build', '--locked', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml', '--features', 'smoke-test'], { cwd: root, stdio: 'inherit' })
build.on('error', error => { console.error(error); process.exitCode = 1 })
build.on('close', code => {
  if (code !== 0) { process.exitCode = 1; return }
  const binary = resolve(root, 'target/debug', process.platform === 'win32' ? 'wowthing-sync.exe' : 'wowthing-sync')
  const child = spawn(binary, [], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', data => { process.stdout.write(data); output += data.toString() })
  child.stderr.pipe(process.stderr)
  const timeout = setTimeout(() => { console.error('Native smoke UI timed out'); child.kill('SIGKILL') }, 45_000)
  child.on('error', error => { console.error(error); clearTimeout(timeout); process.exitCode = 1 })
  child.on('close', exit => { clearTimeout(timeout); process.exitCode = exit === 0 && output.includes('NATIVE_SMOKE PASS') ? 0 : 1 })
})
