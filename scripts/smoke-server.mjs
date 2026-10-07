import { sourceVersion } from './release-metadata.mjs'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../', import.meta.url))
const root = resolve(repo, 'apps/desktop/.output/public')
const version = sourceVersion(readFileSync(resolve(repo, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8'), JSON.parse(readFileSync(resolve(repo, 'apps/desktop/src-tauri/tauri.conf.json'))), readFileSync(resolve(repo, 'Cargo.lock'), 'utf8'))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname === '/__smoke/adapter.js') {
      response.setHeader('content-type', 'text/javascript')
      response.end((await readFile(resolve(repo, 'apps/desktop/tests/e2e/adapter.js'), 'utf8')).replace('__SMOKE_VERSION__', version))
      return
    }
    let path = resolve(root, `.${pathname}`)
    if (!path.startsWith(root + sep) && path !== root) { response.writeHead(403).end(); return }
    if (!extname(path)) path = resolve(root, 'index.html')
    let body = await readFile(path)
    if (extname(path) === '.html') {
      const html = body.toString()
      const hashes = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(match => match[1]).map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`)
      response.setHeader('content-security-policy', `default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'`)
      body = Buffer.from(html.replace('<head>', '<head><script src="/__smoke/adapter.js"></script>'))
    }
    response.setHeader('content-type', types[extname(path)] ?? 'application/octet-stream')
    response.end(body)
  } catch { response.writeHead(404).end('Not found') }
})
server.listen(Number(process.env.SMOKE_PORT ?? 4173), '127.0.0.1', () => console.log(`Hermetic smoke server: http://127.0.0.1:${server.address().port} (no native credentials, uploads or updater network)`))
