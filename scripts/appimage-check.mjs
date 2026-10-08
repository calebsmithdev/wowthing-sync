// Inspect packages without launching the application or accessing user data.
import { mkdtemp, open, readdir, readFile, stat, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { command, root } from './native-integration.mjs'

export const GLIBC_CEILING = '2.35' // Ubuntu 22.04; keep the release/native runners aligned.
function compareVersions(left, right) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference
  }
  return 0
}
export function verifyGlibcRequirements(output) {
  // Read only version *needs*: version definitions exported by a library do
  // not describe its requirements. readelf output is forced to the C locale.
  let needs = false
  const versions = new Set()
  for (const line of output.split('\n')) {
    if (/^Version \w+ section/.test(line)) needs = line.startsWith('Version needs section')
    if (!needs) continue
    for (const match of line.matchAll(/\bName:\s+(GLIBC_[\w.]+)/g)) {
      const version = match[1].slice('GLIBC_'.length)
      if (!/^\d+(?:\.\d+)+$/.test(version) || compareVersions(version, GLIBC_CEILING) > 0) {
        throw new Error(`requires ${match[1]}; Ubuntu 22.04 supports at most GLIBC_${GLIBC_CEILING}`)
      }
      versions.add(version)
    }
  }
  return [...versions].sort(compareVersions).at(-1) ?? null
}
async function inspectElf(path) {
  const handle = await open(path, 'r')
  const magic = Buffer.alloc(4)
  try { await handle.read(magic, 0, 4, 0) } finally { await handle.close() }
  if (!magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return null
  const result = await command('readelf', ['--version-info', '--wide', path], { capture: true, env: { ...process.env, LC_ALL: 'C' } })
  return { requiredGlibc: verifyGlibcRequirements(result.stdout) }
}
export async function verifyAppDir(directory) {
  for (const name of ['AppRun', '.DirIcon']) {
    const entry = await stat(join(directory, name)).catch(() => null)
    if (!entry?.isFile()) throw new Error(`AppDir is missing ${name} or its symlink target`)
    if (name === 'AppRun' && !(entry.mode & 0o111)) throw new Error('AppRun must be executable')
  }
  const entries = await readdir(directory)
  const desktops = entries.filter(name => name.endsWith('.desktop'))
  if (desktops.length !== 1) throw new Error('AppDir must contain exactly one root desktop file')
  const desktop = join(directory, desktops[0])
  await command('desktop-file-validate', [desktop], { capture: true })
  const icon = (await readFile(desktop, 'utf8')).match(/^Icon=([^\r\n]+)$/m)?.[1]
  if (!icon || basename(icon) !== icon || !entries.some(name => name === `${icon}.png` || name === `${icon}.svg`)) throw new Error('AppDir desktop icon is missing')
  const iconPath = join(directory, entries.find(name => name === `${icon}.png` || name === `${icon}.svg`))
  if (!(await stat(iconPath)).isFile()) throw new Error('AppDir desktop icon is not a file')
  let elfFiles = 0, requiredGlibc = null
  async function inspect(directoryPath) {
    for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
      const path = join(directoryPath, entry.name)
      if (entry.isDirectory()) await inspect(path)
      // Symlink targets packaged in the AppDir are scanned as regular files.
      else if (entry.isFile()) {
        let result
        try { result = await inspectElf(path) } catch (error) { error.message = `${relative(directory, path)}: ${error.message}`; throw error }
        if (result) {
          elfFiles++
          if (result.requiredGlibc && (!requiredGlibc || compareVersions(result.requiredGlibc, requiredGlibc) > 0)) requiredGlibc = result.requiredGlibc
        }
      }
    }
  }
  await inspect(directory)
  if (!elfFiles) throw new Error('AppDir contains no ELF executables or libraries')
  return { glibcCeiling: GLIBC_CEILING, requiredGlibc, elfFiles, desktopFile: desktops[0] }
}
export async function auditAppImage(path) {
  const temporary = await mkdtemp(join(tmpdir(), 'wowthing-appimage-'))
  let safeToRemove = true
  try {
    const runtime = await inspectElf(path)
    if (!runtime) throw new Error('AppImage runtime is not ELF')
    await command(resolve(path), ['--appimage-extract'], { cwd: temporary, capture: true, timeout: 120_000 })
    return { artifact: basename(path), runtime, ...await verifyAppDir(join(temporary, 'squashfs-root')) }
  } catch (error) {
    safeToRemove = error.report?.processClosed !== false && error.report?.treeClosed !== false
    throw error
  } finally { if (safeToRemove) await rm(temporary, { recursive: true, force: true }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const paths = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(process.env.ARTIFACT_PATHS ?? '[]')
    const images = paths.filter(path => path.endsWith('.AppImage'))
    if (images.length !== 1) throw new Error('expected exactly one shipping AppImage')
    const report = await auditAppImage(images[0])
    await mkdir(join(root, 'test-results'), { recursive: true })
    await writeFile(join(root, 'test-results/appimage-compatibility.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } catch (error) { console.error(error); process.exitCode = 1 }
}
