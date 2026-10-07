// Uses only an explicitly identified instrumented app, temporary signing keys and loopback HTTP.
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, chmod, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { tauriInvocation } from './launchers.mjs'
import { root, marker, command } from './native-integration.mjs'
import { files, verifyBinary, expectedPackageIdentity } from './package-check.mjs'
const directory = resolve(root, 'test-results/updater-install')
await mkdir(directory, { recursive: true })
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'wowthing-updater-')))
const product = 'Wowthing CI Updater'
const bundle = process.platform === 'darwin' ? 'app' : process.platform === 'win32' ? 'nsis' : 'appimage'
const release = process.argv.includes('--release'), profile = release ? 'release' : 'debug'
let server, failure = null, candidate, signature, safe = true, installed, downloadCount = 0
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const invoke = async (args, options = {}) => { const invocation = tauriInvocation(resolve(root, 'apps/desktop'), args); return command(invocation.command, invocation.args, { cwd: resolve(root, 'apps/desktop'), ...options }) }
try {
  if (process.platform === 'win32' && (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted')) throw new Error('Windows install requires disposable hosted runner')
  await writeFile(join(temporary, 'fixture-marker'), marker)
  const folder = join(temporary, 'WoW/WTF/Account/SYNTHETIC/SavedVariables')
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'WoWthing_Collector.lua'), 'synthetic updater collector')
  await writeFile(join(temporary, 'settings.json'), JSON.stringify({ 'api-key': 'smoke-fixture-key', 'program-folder': join(temporary, 'WoW'), 'notifications-enabled': false }))
  server = createServer(async (request, response) => {
    if (request.url === '/upload/') { for await (const _ of request) {} response.end(); return }
    if (request.url === '/background') { response.writeHead(204); response.end(); return }
    if (request.url === '/payload') { downloadCount++; response.end(candidate); return }
    if (!['/invalid', '/valid'].includes(request.url) || !signature) { response.writeHead(404); response.end(); return }
    const valid = request.url === '/valid'
    const lines = Buffer.from(signature, 'base64').toString('utf8').split('\n')
    const signed = Buffer.from(lines[1], 'base64'); signed[10] ^= 1; lines[1] = signed.toString('base64')
    const tampered = Buffer.from(lines.join('\n')).toString('base64')
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ version: '1.0.8', notes: 'isolated fixture', pub_date: '2026-01-01T00:00:00Z', url: `http://127.0.0.1:${server.address().port}/payload`, signature: valid ? signature : tampered }))
  })
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  const endpoint = `http://127.0.0.1:${server.address().port}/`
  // Key generator output includes a private key: capture it without persisting/logging.
  const key = join(temporary, 'signing.key')
  await invoke(['signer', 'generate', '--ci', '--write-keys', key], { capture: true, reportDirectory: false })
  const pubkey = (await readFile(`${key}.pub`, 'utf8')).trim()
  const environment = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: await readFile(key, 'utf8'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' }
  delete environment.WOWTHING_DISTRIBUTION
  for (const name of ['APPLE_CERTIFICATE', 'APPLE_SIGNING_IDENTITY', 'APPLE_ID', 'APPLE_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_ISSUER', 'WINDOWS_CERTIFICATE']) delete environment[name]
  const staged = {}
  for (const version of ['1.0.6', '1.0.8']) {
    const config = { version, identifier: 'com.calebsmithdev.wowthing-ci-updater', productName: product, mainBinaryName: product, bundle: { createUpdaterArtifacts: true }, plugins: { updater: { pubkey, endpoints: [`${endpoint}background`], dangerousInsecureTransportProtocol: true, windows: { installMode: 'quiet' } } } }
    await rm(resolve(root, `target/${profile}/bundle`), { recursive: true, force: true })
    await invoke(['build', ...(release ? [] : ['--debug']), '--bundles', bundle, '--features', 'integration-test', '--config', JSON.stringify(config), '--', '--locked'], { env: environment, timeout: 35 * 60_000 })
    staged[version] = join(temporary, version)
    await cp(resolve(root, `target/${profile}/bundle/${bundle === 'app' ? 'macos' : bundle}`), staged[version], { recursive: true })
  }
  const candidates = (await files(staged['1.0.8'])).filter(path => path.endsWith('.sig'))
  if (candidates.length !== 1) throw new Error('expected exactly one signed updater artifact')
  signature = (await readFile(candidates[0], 'utf8')).trim()
  candidate = await readFile(candidates[0].slice(0, -4))
  const initialFiles = await files(staged['1.0.6'])
  const installDir = join(temporary, 'installed')
  if (process.platform === 'darwin') {
    installed = join(installDir, `${product}.app`)
    await cp(join(staged['1.0.6'], `${product}.app`), installed, { recursive: true })
  } else if (process.platform === 'win32') {
    const installer = initialFiles.find(path => path.endsWith('.exe'))
    if (!installer) throw new Error('missing prior installer')
    await command(installer, ['/S', `/D=${installDir}`], { timeout: 120000, waitDescendants: true })
    installed = join(installDir, `${product}.exe`)
  } else {
    const appimage = initialFiles.find(path => path.endsWith('.AppImage'))
    if (!appimage) throw new Error('missing prior AppImage')
    installed = join(temporary, 'installed.AppImage')
    await cp(appimage, installed); await chmod(installed, 0o755)
  }
  const executable = process.platform === 'darwin' ? join(installed, 'Contents/MacOS', product) : installed
  const candidateIdentity = process.platform === 'linux' ? null : await expectedPackageIdentity(
    process.platform === 'darwin' ? join(staged['1.0.8'], `${product}.app/Contents/MacOS`, product) : resolve(root, `target/${profile}`, `${product}.exe`),
    true,
    bundle,
  )
  const expected = candidateIdentity?.expectedSha256 ?? hash(candidate)
  const before = hash(await readFile(executable))
  if (process.platform !== 'linux') await verifyBinary(executable, true)
  else {
    for (const [name, artifact] of [['previous', installed], ['candidate', candidates[0].slice(0, -4)]]) {
      const extracted = join(temporary, `audit-${name}`); await mkdir(extracted)
      await command(artifact, ['--appimage-extract'], { cwd: extracted })
      const binaries = (await files(extracted)).filter(path => [product, product.toLowerCase().replaceAll(' ', '-')].includes(basename(path)))
      if (binaries.length !== 1) throw new Error('missing unique updater harness binary')
      await verifyBinary(binaries[0], true)
    }
  }
  const env = { ...process.env, WOWTHING_TEST_ROOT: temporary, WOWTHING_TEST_ENDPOINT: `${endpoint}upload/`, WOWTHING_UPDATER_TEST: '1', WOWTHING_UPDATER_ENDPOINT: endpoint, APPIMAGE_EXTRACT_AND_RUN: '1' }
  const launch = async label => command(executable, [], { cwd: temporary, env, timeout: 180000, label, reportDirectory: directory, waitDescendants: process.platform === 'win32' })
  await launch('updater-previous')
  if ((await readFile(join(temporary, 'updater-signature-rejected'), 'utf8')) !== '1.0.6') throw new Error('signature rejection proof missing')
  // Installer may exit the old process before replacement. Await actual owned descendants;
  // the next launch is ALWAYS from the installed location, never the staged candidate.
  const after = hash(await readFile(executable))
  if (after !== expected) throw new Error('installed executable differs from the signed candidate')
  if (before === after) throw new Error('installed executable was not replaced')
  await launch('updater-candidate')
  const report = JSON.parse(await readFile(join(temporary, 'updater-candidate.json'), 'utf8'))
  if (report.marker !== 'WOWTHING_UPDATER_CI_V1' || report.passed !== true || report.version !== '1.0.8' || !report.lastSuccess || downloadCount !== 2) throw new Error('installed candidate proof failed')
  const preferences = JSON.parse(await readFile(join(temporary, 'settings.json'), 'utf8'))
  if ('api-key' in preferences || !preferences['last-success']) throw new Error('upgrade persistence failed')
  await writeFile(join(directory, 'report.json'), JSON.stringify({ passed: true, previous: '1.0.6', candidate: report.version, signatureRejected: true, installedHashBefore: before, installedHashAfter: after, expectedCandidateHash: expected, candidateIdentity, downloads: downloadCount, profile }, null, 2))
} catch (error) { failure = error.message; safe = error.report?.processClosed !== false && error.report?.treeClosed !== false; console.error(error); process.exitCode = 1 }
finally {
  if (failure) await writeFile(join(directory, 'report.json'), JSON.stringify({ passed: false, failure, retainedFixture: safe ? null : temporary }, null, 2))
  if (server?.listening) { const closed = new Promise(accept => server.close(accept)); server.closeAllConnections(); await closed }
  if (process.platform === 'win32' && installed) {
    try { const uninstaller = (await files(join(temporary, 'installed'))).find(path => /uninstall.*\.exe$/i.test(basename(path))); if (!uninstaller) throw new Error('isolated uninstaller missing'); await command(uninstaller, ['/S'], { timeout: 120000, waitDescendants: true }) } catch (error) { console.error(error); safe = false; process.exitCode = 1; await writeFile(join(directory, 'report.json'), JSON.stringify({ passed: false, failure: error.message, retainedFixture: temporary }, null, 2)) }
  }
  if (safe) await rm(temporary, { recursive: true, force: true })
}
