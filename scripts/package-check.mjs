// Shipping packages are inspected without launch. Separately identified harness
// packages are installed/extracted and launched with production worker wiring.
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { tauriInvocation } from './launchers.mjs'
import { root, marker, command, runFixture } from './native-integration.mjs'
export async function files(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await files(path)); else found.push(path)
  }
  return found
}
export async function verifyBinary(path, harness) {
  const bytes = await readFile(path)
  if (!harness && ['NATIVE_SMOKE', 'WOWTHING_OS_CI_V1', 'WOWTHING_UPDATER_CI_V1'].some(value => bytes.includes(Buffer.from(value)))) throw new Error('shipping artifact includes automation harness')
  if (bytes.includes(Buffer.from(marker)) !== harness) throw new Error(`wrong artifact harness identity: ${path}`)
  const expected = process.arch
  let architecture
  if (process.platform === 'darwin') {
    const magic = bytes.readUInt32LE(0), cpu = bytes.readUInt32LE(4)
    if (magic !== 0xfeedfacf) throw new Error('expected64bit Mach-O')
    architecture = cpu === 0x100000c ? 'arm64' : cpu === 0x1000007 ? 'x64' : 'unknown'
  } else if (process.platform === 'win32') {
    const offset = bytes.readUInt32LE(0x3c)
    if (bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0') throw new Error('invalid PE')
    architecture = bytes.readUInt16LE(offset + 4) === 0x8664 ? 'x64' : 'unknown'
  } else {
    if (bytes.toString('ascii', 1, 4) !== 'ELF' || bytes[4] !== 2) throw new Error('expected64bit ELF')
    architecture = bytes.readUInt16LE(18) === 62 ? 'x64' : 'unknown'
  }
  if (architecture !== expected) throw new Error(`architecture mismatch ${architecture}/${expected}`)
  return { architecture, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
}
export async function expectedPackageIdentity(built, harness, bundleTarget) {
  const source = await verifyBinary(built, harness)
  const token = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK')
  const variant = new Map([['deb', 'DEB'], ['rpm', 'RPM'], ['nsis', 'NSS']]).get(bundleTarget)
  let expectedSha256
  if (variant) {
    // CLI2.12.1 patches only the first token, then restores the target binary.
    // Compare every packaged byte against that exact, documented transformation:
    // https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.1/crates/tauri-bundler/src/bundle.rs#L90-L96
    const bytes = await readFile(built)
    const offset = bytes.indexOf(token)
    if (offset < 0) throw new Error(`missing original Tauri bundle type token: ${built}`)
    const patched = Buffer.from(`__TAURI_BUNDLE_TYPE_VAR_${variant}`)
    expectedSha256 = createHash('sha256').update(bytes.subarray(0, offset)).update(patched).update(bytes.subarray(offset + token.length)).digest('hex')
  } else if (['app', 'appimage'].includes(bundleTarget)) {
    // AppImage's source is the postprocessed AppDir executable; macOS is not patched.
    expectedSha256 = source.sha256
  } else throw new Error(`unsupported bundle type comparison: ${bundleTarget}`)
  return { sourceSha256: source.sha256, expectedSha256, bundleTarget }
}
export async function verifyPackageBinary(binary, built, harness, bundleTarget) {
  const identity = await verifyBinary(binary, harness)
  const expected = await expectedPackageIdentity(built, harness, bundleTarget)
  if (identity.sha256 !== expected.expectedSha256) throw new Error(`extracted binary differs from expected packaged executable (${bundleTarget}): expected ${expected.expectedSha256}, actual ${identity.sha256}`)
  return { ...identity, ...expected }
}
const targets = process.platform === 'darwin' ? 'app' : process.platform === 'win32' ? 'nsis' : 'deb,rpm,appimage'
async function extract(path, temporary) {
  if (path.endsWith('.app')) { const destination = join(temporary, basename(path)); await cp(path, destination, { recursive: true }); return destination }
  if (path.endsWith('.deb')) await command('dpkg-deb', ['--extract', path, temporary])
  else if (path.endsWith('.rpm')) await command('bash', ['-o', 'pipefail', '-c', 'rpm2cpio "$1" | cpio -idm --quiet', 'extract-rpm', path], { cwd: temporary })
  else if (path.endsWith('.AppImage')) await command(path, ['--appimage-extract'], { cwd: temporary })
  else if (path.endsWith('.exe')) {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('installer requires disposable hosted runner')
    await command(path, ['/S', `/D=${temporary}`], { waitDescendants: true })
  } else throw new Error(`unsupported package ${path}`)
  return temporary
}
export async function packageCheck({ release = false } = {}) {
  const profile = release ? 'release' : 'debug'
  const destination = resolve(root, 'target/package-artifacts', profile)
  await rm(destination, { recursive: true, force: true })
  const version = (await readFile(resolve(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8')).match(/^version = "([^"]+)"/m)[1]
  const reports = []
  for (const harness of [false, true]) {
    const kind = harness ? 'harness' : 'production'
    for (const bundleTarget of targets.split(',')) {
    const config = { bundle: { createUpdaterArtifacts: false }, ...(harness ? { identifier: 'com.calebsmithdev.wowthing-ci-isolated', productName: 'Wowthing CI Isolated', mainBinaryName: 'Wowthing CI Isolated' } : {}) }
    const args = ['build', ...(release ? [] : ['--debug']), '--bundles', bundleTarget, '--no-sign', '--config', JSON.stringify(config), ...(harness ? ['--features', 'integration-test'] : []), '--', '--locked']
    const invocation = tauriInvocation(resolve(root, 'apps/desktop'), args)
    await rm(resolve(root, `target/${profile}/bundle`), { recursive: true, force: true })
    const env = { ...process.env }
    delete env.TAURI_SIGNING_PRIVATE_KEY
    delete env.APPLE_CERTIFICATE
    delete env.WOWTHING_DISTRIBUTION
    if (!harness) env.WOWTHING_DISTRIBUTION = '1'
    await command(invocation.command, invocation.args, { cwd: resolve(root, 'apps/desktop'), env, timeout: 35 * 60_000 })
    const staged = join(destination, kind, bundleTarget)
    await mkdir(staged, { recursive: true })
    await cp(resolve(root, `target/${profile}/bundle`), staged, { recursive: true })
    const all = await files(staged)
    const packages = process.platform === 'darwin' ? [join(staged, 'macos', `${harness ? 'Wowthing CI Isolated' : 'Wowthing Sync'}.app`)] : all.filter(path => /\.(deb|rpm|AppImage|exe)$/.test(path))
    if (packages.length !== 1) throw new Error('missing or unexpected packages')
    for (const artifact of packages) {
      const temporary = await mkdtemp(join(tmpdir(), 'wowthing-package-'))
      let safeToRemove = true
      try {
        if (artifact.endsWith('.deb')) {
          const actual = await command('dpkg-deb', ['--field', artifact, 'Version'], { capture: true })
          if (actual.stdout.trim() !== version) throw new Error('Debian package version mismatch')
        } else if (artifact.endsWith('.rpm')) {
          const actual = await command('rpm', ['-qp', '--queryformat', '%{VERSION}', artifact], { capture: true })
          if (actual.stdout.trim() !== version) throw new Error('RPM package version mismatch')
        }
        const extracted = await extract(artifact, temporary)
        const binaryName = harness ? 'Wowthing CI Isolated' : 'Wowthing Sync'
        const candidates = (await files(extracted)).filter(path => [binaryName, binaryName.toLowerCase().replaceAll(' ', '-'), 'wowthing-sync'].includes(basename(path).replace(/\.exe$/, '')))
        if (candidates.length !== 1) throw new Error(`expected one package executable: ${artifact}`)
        const binary = candidates[0]
        let built = resolve(root, `target/${profile}`, `${binaryName}${process.platform === 'win32' ? '.exe' : ''}`)
        if (artifact.endsWith('.AppImage')) {
          const postprocessed = (await files(resolve(root, `target/${profile}/bundle/appimage`))).filter(path => path.includes('.AppDir/') && basename(path) === basename(binary))
          if (postprocessed.length !== 1) throw new Error('missing postprocessed AppImage build source')
          built = postprocessed[0]
        }
        const identity = await verifyPackageBinary(binary, built, harness, bundleTarget)
        if (process.platform === 'darwin') {
          const actual = await command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(extracted, 'Contents/Info.plist')], { capture: true })
          if (actual.stdout.trim() !== version) throw new Error('bundle version mismatch')
          await command('otool', ['-L', binary])
        } else if (process.platform === 'linux') {
          const linkage = await command('ldd', [binary], { capture: true })
          if (/not found/.test(linkage.stdout + linkage.stderr)) throw new Error('packaged native dependency is missing')
        } else {
          const script = join(temporary, 'version.ps1')
          await writeFile(script, 'param([string]$Binary)\n(Get-Item -LiteralPath $Binary).VersionInfo.ProductVersion')
          const actual = await command('powershell.exe', ['-NoProfile', '-File', script, binary], { capture: true })
          if (actual.stdout.trim() !== version) throw new Error('Windows executable version mismatch')
        }
        const entrypoint = artifact.endsWith('.AppImage') ? join(extracted, 'squashfs-root/AppRun') : binary
        const native = harness ? await runFixture(entrypoint, resolve(root, `test-results/package-${profile}/${basename(artifact)}`), { auditedBinary: binary }) : null
        if (native && native.version !== version) throw new Error('packaged candidate version mismatch')
        reports.push({ artifact: artifact.replace(root, ''), harness, version, ...identity, launched: harness })
      } catch (error) { safeToRemove = error.report?.processClosed !== false && error.report?.treeClosed !== false; throw error }
      finally { if (safeToRemove) await rm(temporary, { recursive: true, force: true }) }
    }
    }
  }
  await mkdir(resolve(root, 'test-results'), { recursive: true })
  await writeFile(resolve(root, `test-results/packages-${profile}.json`), JSON.stringify(reports, null, 2))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await packageCheck({ release: process.argv.includes('--release') }) } catch (error) { console.error(error); process.exitCode = 1 }
}
