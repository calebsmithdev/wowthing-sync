import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, readdirSync, appendFileSync } from 'node:fs'
import { resolve, basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export function semver(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) throw new Error('Version must be valid semver')
  const prerelease = value.split('+')[0].split('-').slice(1).join('-')
  if (prerelease.split('.').some(part => /^0\d+$/.test(part))) throw new Error('Numeric prerelease identifiers cannot have leading zeroes')
  return value
}
export function sourceVersion(manifest, config, lock) {
  if (Object.hasOwn(config, 'version')) throw new Error('Tauri version must be omitted: Cargo package version is authoritative')
  const section = manifest.match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1]
  const version = semver(section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1])
  const locked = lock.split('[[package]]').find(section => /^name = "wowthing-sync"$/m.test(section))?.match(/^version = "([^"]+)"$/m)?.[1]
  if (locked !== version) throw new Error('Cargo.lock app version differs from Cargo.toml; regenerate the lockfile')
  return version
}
export function verifyVersions(version, { input, tag, appVersion, updaterVersion } = {}) {
  semver(version)
  if (input !== undefined && semver(input) !== version) throw new Error('Release input differs from Cargo package version')
  if (tag !== undefined && tag !== `v${version}`) throw new Error('Release tag differs from Cargo package version')
  if (appVersion !== undefined && appVersion !== version) throw new Error('Built app metadata differs from release version')
  if (updaterVersion !== undefined && updaterVersion !== version) throw new Error('Updater metadata differs from release version')
}
export function existingReleaseTarget(release, { version, sha, tagSha }) {
  verifyVersions(version, { tag: release.tagName })
  if (tagSha && tagSha !== sha) throw new Error('Existing release tag points to a different commit')
  if (!tagSha && release.targetCommitish !== sha) throw new Error('Existing draft targets a different commit')
  // A retry may repair the same draft, but never changes a published release.
  return release.isDraft === true
}
export const PLATFORM_KEYS = ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64']
const EXTENSIONS = ['.app.tar.gz.sig', '.AppImage.tar.gz.sig', '.msi.zip.sig', '.nsis.zip.sig', '.app.tar.gz', '.AppImage.tar.gz', '.msi.zip', '.nsis.zip', '.AppImage.sig', '.AppImage', '.dmg', '.deb', '.rpm', '.msi', '.exe']
function artifactName(version, key, extension) {
  // AppImageHub rejects redundant "linux" in AppImage names. Keep the Tauri
  // updater platform key unchanged; its URL points to the renamed asset.
  const label = key.startsWith('linux-') && extension.startsWith('.AppImage') ? key.slice('linux-'.length) : key
  return `wowthing-sync_${version}_${label}${extension}`
}
export function stageArtifacts({ version, key, paths, destination, targetRoot }) {
  if (!PLATFORM_KEYS.includes(key)) throw new Error('Unknown release platform')
  semver(version); mkdirSync(destination, { recursive: true })
  const staged = new Map()
  for (const source of paths) {
    const path = resolve(source)
    const location = relative(resolve(targetRoot), path)
    if (location.startsWith('..') || resolve(targetRoot) === path) throw new Error('Build artifact is outside the Cargo target directory')
    if (!statSync(path).isFile()) continue
    const extension = EXTENSIONS.find(extension => path.endsWith(extension))
    if (!extension) continue
    const name = artifactName(version, key, extension)
    if (staged.has(extension)) throw new Error(`Duplicate artifact type for ${key}: ${extension}`)
    copyFileSync(path, join(destination, name)); staged.set(extension, name)
  }
  const candidates = key.startsWith('darwin') ? ['.app.tar.gz'] : key.startsWith('linux') ? ['.AppImage.tar.gz', '.AppImage'] : ['.nsis.zip', '.msi.zip']
  const extension = candidates.find(extension => staged.has(extension) && staged.has(`${extension}.sig`))
  if (!extension) throw new Error(`No signed updater artifact for ${key}`)
  const signature = readFileSync(join(destination, staged.get(`${extension}.sig`)), 'utf8').trim()
  if (!signature) throw new Error('Updater signature is empty')
  const fragment = { version, key, artifact: staged.get(extension), signature }
  writeFileSync(join(destination, `metadata-${key}.json`), JSON.stringify(fragment))
  return fragment
}
export function mergeUpdater(fragments, version, repository) {
  semver(version)
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release repository')
  if (fragments.length !== PLATFORM_KEYS.length || new Set(fragments.map(value => value.key)).size !== PLATFORM_KEYS.length) throw new Error('Exactly one validated artifact per platform is required')
  const platforms = {}
  for (const fragment of fragments) {
    if (!PLATFORM_KEYS.includes(fragment.key)) throw new Error('Unexpected updater platform')
    verifyVersions(version, { updaterVersion: fragment.version })
    const extension = EXTENSIONS.find(extension => fragment.artifact.endsWith(extension))
    if (!fragment.signature || basename(fragment.artifact) !== fragment.artifact || !extension || fragment.artifact !== artifactName(version, fragment.key, extension)) throw new Error('Invalid updater artifact metadata')
    platforms[fragment.key] = { signature: fragment.signature, url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(fragment.artifact)}` }
  }
  return { version, notes: `WoWthing Sync ${version}`, pub_date: new Date().toISOString(), platforms }
}
function main() {
  const args = process.argv.slice(2); const mode = args.shift() ?? 'verify'
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const version = sourceVersion(readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8'), JSON.parse(readFileSync(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8')), readFileSync(join(root, 'Cargo.lock'), 'utf8'))
  verifyVersions(version, { input: process.env.RELEASE_VERSION, tag: process.env.RELEASE_TAG, appVersion: process.env.BUILT_APP_VERSION })
  if (mode === 'verify') {
    console.log(`Release metadata verified: ${version}`)
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=v${version}\nprerelease=${version.split('+')[0].includes('-')}\n`)
  } else if (mode === 'existing') {
    const upload = existingReleaseTarget(JSON.parse(readFileSync(process.env.EXISTING_RELEASE_FILE, 'utf8')), { version, sha: process.env.GITHUB_SHA, tagSha: process.env.EXISTING_TAG_SHA })
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `upload=${upload}\n`)
    console.log(upload ? 'Repairing the existing matching draft' : 'Matching release is already published; leaving it unchanged')
  } else if (mode === 'stage') {
    stageArtifacts({ version, key: process.env.RELEASE_PLATFORM, paths: JSON.parse(process.env.ARTIFACT_PATHS), destination: join(root, 'release-assets'), targetRoot: join(root, 'target') })
  } else if (mode === 'merge') {
    const destination = join(root, 'release-assets')
    const fragments = readdirSync(destination).filter(name => name.startsWith('metadata-') && name.endsWith('.json')).map(name => JSON.parse(readFileSync(join(destination, name), 'utf8')))
    const updater = mergeUpdater(fragments, version, process.env.GITHUB_REPOSITORY)
    // Confirm every metadata entry refers to a present staged binary/signature pair.
    for (const fragment of fragments) {
      if (!statSync(join(destination, fragment.artifact)).isFile() || readFileSync(join(destination, `${fragment.artifact}.sig`), 'utf8').trim() !== fragment.signature) throw new Error('Updater artifact or matching signature missing')
    }
    writeFileSync(join(destination, 'latest.json'), JSON.stringify(updater, null, 2))
  } else throw new Error('Unknown release metadata command')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
