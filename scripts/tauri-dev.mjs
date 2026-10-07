import { tauriInvocation } from './launchers.mjs'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url))
const config = JSON.parse(readFileSync(new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url)))
const port = Number(process.env.TAURI_DEV_PORT ?? 3015)
if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('TAURI_DEV_PORT must be 1024..65534')
// Refuse to let Nuxt's automatic takeover stop another user's running server.
for (const candidate of [port, port + 1]) {
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', () => reject(new Error(`Dev port ${candidate} is occupied; choose another TAURI_DEV_PORT`)))
    probe.listen(candidate, '127.0.0.1', () => probe.close(resolve))
  })
}
const nonce = randomBytes(24).toString('base64')
const devCsp = config.app.security.devCsp.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`).replace("style-src 'self'", `style-src 'self' 'nonce-${nonce}'`)
const override = JSON.stringify({ build: { beforeDevCommand: `npm run dev -- --port ${port}`, devUrl: `http://localhost:${port}` }, app: { security: { devCsp } } })
const launch = tauriInvocation(desktop, ['dev', '--config', override, ...process.argv.slice(2)])
const child = spawn(launch.command, launch.args, { cwd: desktop, stdio: 'inherit', env: { ...process.env, TAURI_DEV_NONCE: nonce, TAURI_DEV_PORT: String(port), TAURI_CONFIG: override } })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('close', code => { process.exitCode = code ?? 1 })
