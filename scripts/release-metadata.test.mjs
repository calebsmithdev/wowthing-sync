import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
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
      const binary = join(target, `${key}${extension}`); const signature = `${binary}.sig`
      writeFileSync(binary, 'fixture binary'); writeFileSync(signature, 'fixture signature')
      return stageArtifacts({ version:'1.0.7', key, paths:[binary,signature], destination, targetRoot:target })
    })
    const updater = mergeUpdater(fragments,'1.0.7','owner/repo')
    assert.equal(updater.version,'1.0.7'); assert.equal(Object.keys(updater.platforms).length,4)
    for (const entry of Object.values(updater.platforms)) assert.match(entry.url,/\/v1\.0\.7\/wowthing-sync_1\.0\.7_/)
    assert.throws(() => mergeUpdater(fragments.slice(1),'1.0.7','owner/repo'))
    assert.throws(() => mergeUpdater([{...fragments[0],version:'1.0.8'},...fragments.slice(1)],'1.0.7','owner/repo'))
    assert.throws(() => stageArtifacts({version:'1.0.7',key:'linux-x86_64',paths:[join(root,'outside')],destination,targetRoot:target}))
  } finally { rmSync(root,{recursive:true,force:true}) }
})

test('retries only repair the same draft and published releases remain unchanged', () => {
  const release = { tagName:'v1.0.7', targetCommitish:'commit', isDraft:true }
  assert.equal(existingReleaseTarget(release,{version:'1.0.7',sha:'commit',tagSha:''}),true)
  assert.equal(existingReleaseTarget({...release,isDraft:false},{version:'1.0.7',sha:'commit',tagSha:'commit'}),false)
  assert.throws(() => existingReleaseTarget(release,{version:'1.0.7',sha:'other',tagSha:''}))
  assert.throws(() => existingReleaseTarget(release,{version:'1.0.7',sha:'commit',tagSha:'other'}))
})
