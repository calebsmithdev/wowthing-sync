import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sourceVersion, verifyVersions, existingReleaseTarget, semver, stageArtifacts, mergeUpdater, PLATFORM_KEYS } from './release-metadata.mjs'

test('Cargo is authoritative and lock/config/input/tag/app/updater drift is rejected', () => {
  const manifest = '[package]\nname = "wowthing-sync"\nversion = "1.0.7"\n[dependencies]\n'
  const lock = '[[package]]\nname = "wowthing-sync"\nversion = "1.0.7"\n'
  assert.equal(sourceVersion(manifest, {}, lock), '1.0.7')
  assert.throws(() => sourceVersion(manifest, { version: '1.0.7' }, lock))
  assert.throws(() => sourceVersion(manifest, {}, lock.replace('1.0.7','0.0.0')))
  verifyVersions('1.0.7', { input: '1.0.7', tag: 'v1.0.7', appVersion: '1.0.7', updaterVersion: '1.0.7' })
  for (const field of ['input', 'tag', 'appVersion', 'updaterVersion']) assert.throws(() => verifyVersions('1.0.7', { [field]: '1.0.8' }))
  for (const value of ['01.0.0', '1.0', '1.0.0-01', '1.0.0;echo bad']) assert.throws(() => semver(value))
})
test('stages distinct signed platform assets and builds a version-consistent updater manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'wowthing-release-'))
  try {
    const target = join(root,'target'); const destination = join(root,'assets'); mkdirSync(target)
    const fragments = PLATFORM_KEYS.map(key => {
      const extension = key.startsWith('darwin') ? '.app.tar.gz' : key.startsWith('linux') ? '.AppImage.tar.gz' : '.nsis.zip'
      const paths = [extension, ...(key.startsWith('linux') ? ['.deb', '.rpm'] : [])].flatMap(extension => {
        const binary = join(target, `${key}${extension}`); const signature = `${binary}.sig`
        writeFileSync(binary, `fixture ${extension}`); writeFileSync(signature, `fixture signature ${extension}`)
        return [binary, signature]
      })
      return stageArtifacts({ version:'1.0.7', key, paths, destination, targetRoot:target })
    })
    const updater = mergeUpdater(fragments,'1.0.7','owner/repo')
    assert.equal(updater.version,'1.0.7')
    assert.deepEqual(Object.keys(updater.platforms).sort(), [...PLATFORM_KEYS, 'linux-x86_64-deb', 'linux-x86_64-rpm'].sort())
    for (const entry of Object.values(updater.platforms)) assert.match(entry.url,/\/v1\.0\.7\/wowthing-sync_1\.0\.7_/)
    const release = 'https://github.com/owner/repo/releases/download/v1.0.7/'
    assert.equal(updater.platforms['linux-x86_64'].url, `${release}wowthing-sync_1.0.7_x86_64.AppImage.tar.gz`)
    // Each installer entry carries its own package and that package's signature.
    assert.deepEqual(updater.platforms['linux-x86_64-deb'], { url: `${release}wowthing-sync_1.0.7_linux-x86_64.deb`, signature: 'fixture signature .deb' })
    assert.deepEqual(updater.platforms['linux-x86_64-rpm'], { url: `${release}wowthing-sync_1.0.7_linux-x86_64.rpm`, signature: 'fixture signature .rpm' })
    for (const key of PLATFORM_KEYS.filter(key => !key.startsWith('linux'))) assert.equal(updater.platforms[`${key}-deb`], undefined)
    const linux = fragments.findIndex(fragment => fragment.key === 'linux-x86_64')
    const withLinux = replacement => fragments.map((fragment, index) => index === linux ? replacement : fragment)
    assert.throws(() => mergeUpdater(withLinux({ ...fragments[linux], installers: { deb: fragments[linux].installers.deb } }),'1.0.7','owner/repo'), /installer entries/)
    assert.throws(() => mergeUpdater(withLinux({ ...fragments[linux], installers: { ...fragments[linux].installers, rpm: fragments[linux].installers.deb } }),'1.0.7','owner/repo'), /Invalid updater artifact/)
    assert.throws(() => mergeUpdater(fragments.map(fragment => fragment.key === 'windows-x86_64' ? { ...fragment, installers: fragments[linux].installers } : fragment),'1.0.7','owner/repo'), /installer entries/)
    assert.throws(() => mergeUpdater(fragments.slice(1),'1.0.7','owner/repo'))
    assert.throws(() => mergeUpdater([{...fragments[0],version:'1.0.8'},...fragments.slice(1)],'1.0.7','owner/repo'))
    assert.throws(() => stageArtifacts({version:'1.0.7',key:'linux-x86_64',paths:[join(root,'outside')],destination,targetRoot:target}))
  } finally { rmSync(root,{recursive:true,force:true}) }
})

test('AppImage, updater archive and signatures omit linux without changing updater keys or bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'wowthing-appimage-names-'))
  try {
    const target = join(root, 'target'), destination = join(root, 'assets'); mkdirSync(target)
    const extensions = ['.AppImage', '.AppImage.sig', '.AppImage.tar.gz', '.AppImage.tar.gz.sig', '.deb', '.deb.sig', '.rpm', '.rpm.sig']
    const paths = extensions.map(extension => {
      const path = join(target, `Wowthing Sync_1.1.1_amd64${extension}`)
      writeFileSync(path, `original ${extension}`)
      return path
    })
    const fragment = stageArtifacts({ version: '1.1.1', key: 'linux-x86_64', paths, destination, targetRoot: target })
    assert.equal(fragment.key, 'linux-x86_64')
    assert.equal(fragment.artifact, 'wowthing-sync_1.1.1_x86_64.AppImage.tar.gz')
    assert.equal(fragment.installers.deb.artifact, 'wowthing-sync_1.1.1_linux-x86_64.deb')
    assert.equal(fragment.installers.rpm.signature, 'original .rpm.sig')
    for (const extension of extensions) {
      const label = extension.startsWith('.AppImage') ? 'x86_64' : 'linux-x86_64'
      assert.equal(readFileSync(join(destination, `wowthing-sync_1.1.1_${label}${extension}`), 'utf8'), `original ${extension}`)
    }
    assert.equal(readdirSync(destination).filter(name => /linux.*\.AppImage/.test(name)).length, 0)
    const direct = join(root, 'direct')
    const raw = stageArtifacts({ version: '1.1.1', key: 'linux-x86_64', paths: [...paths.slice(0, 2), ...paths.slice(4)], destination: direct, targetRoot: target })
    assert.equal(raw.artifact, 'wowthing-sync_1.1.1_x86_64.AppImage')
    // Releases always ship .deb/.rpm; an unsigned package would strand its installs.
    for (const unsigned of ['.deb.sig', '.rpm.sig']) {
      assert.throws(() => stageArtifacts({ version: '1.1.1', key: 'linux-x86_64', paths: paths.filter(path => !path.endsWith(unsigned)), destination: join(root, `missing${unsigned}`), targetRoot: target }), /No signed (deb|rpm) updater artifact/)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('retries only repair the same draft and published releases remain unchanged', () => {
  const release = { tagName:'v1.0.7', targetCommitish:'commit', isDraft:true }
  assert.equal(existingReleaseTarget(release,{version:'1.0.7',sha:'commit',tagSha:''}),true)
  assert.equal(existingReleaseTarget({...release,isDraft:false},{version:'1.0.7',sha:'commit',tagSha:'commit'}),false)
  assert.throws(() => existingReleaseTarget(release,{version:'1.0.7',sha:'other',tagSha:''}))
  assert.throws(() => existingReleaseTarget(release,{version:'1.0.7',sha:'commit',tagSha:'other'}))
})
