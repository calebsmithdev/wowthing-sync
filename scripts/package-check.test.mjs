import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyBinary, verifyPackageBinary, expectedPackageIdentity } from './package-check.mjs'
import { marker } from './native-integration.mjs'
function fixture(architecture = process.arch, text = '') {
  const bytes = Buffer.alloc(256)
  if (process.platform === 'darwin') { bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(architecture === 'arm64' ? 0x100000c : 0x1000007, 4) }
  else if (process.platform === 'win32') { bytes.writeUInt32LE(64, 0x3c); bytes.write('PE\0\0', 64); bytes.writeUInt16LE(architecture === 'x64' ? 0x8664 : 0x14c, 68) }
  else { bytes.write('\x7fELF'); bytes[4] = 2; bytes.writeUInt16LE(architecture === 'x64' ? 62 : 183, 18) }
  bytes.write(text, 128)
  return bytes
}
test('artifact audit rejects automation contamination, missing harness identity and wrong architecture', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'package-audit-'))
  const path = join(temporary, 'binary')
  try {
    await writeFile(path, fixture())
    assert.equal((await verifyBinary(path, false)).architecture, process.arch)
    await assert.rejects(verifyBinary(path, true), /harness identity/)
    for (const markerText of [marker, 'NATIVE_SMOKE', 'WOWTHING_OS_CI_V1', 'WOWTHING_UPDATER_CI_V1']) {
      await writeFile(path, fixture(process.arch, markerText))
      await assert.rejects(verifyBinary(path, false), /harness/)
    }
    await writeFile(path, fixture(process.arch, marker))
    await verifyBinary(path, true)
    await writeFile(path, fixture(process.arch === 'arm64' ? 'x64' : 'arm64'))
    await assert.rejects(verifyBinary(path, false), /architecture mismatch/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
test('package audit requires the exact first bundle token patch and every remaining byte', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'package-patch-audit-'))
  const source = join(temporary, 'built')
  const extracted = join(temporary, 'extracted')
  try {
    const original = fixture()
    original.write('__TAURI_BUNDLE_TYPE_VAR_UNK', 200)
    await writeFile(source, original)
    for (const [target, variant] of [['deb', 'DEB'], ['rpm', 'RPM'], ['nsis', 'NSS']]) {
      const bundled = Buffer.from(original)
      bundled.write(`__TAURI_BUNDLE_TYPE_VAR_${variant}`, 200)
      await writeFile(extracted, bundled)
      const report = await verifyPackageBinary(extracted, source, false, target)
      assert.deepEqual(await expectedPackageIdentity(source, false, target), { sourceSha256: report.sourceSha256, expectedSha256: report.sha256, bundleTarget: target })
      assert.equal(report.sha256, report.expectedSha256)
      assert.notEqual(report.sha256, report.sourceSha256)
      await assert.rejects(verifyPackageBinary(extracted, source, false, target === 'deb' ? 'rpm' : 'deb'), /differs from expected/)
      bundled[250] ^= 1
      await writeFile(extracted, bundled)
      await assert.rejects(verifyPackageBinary(extracted, source, false, target), /differs from expected/)
      await writeFile(extracted, original)
      await assert.rejects(verifyPackageBinary(extracted, source, false, target), /differs from expected/)
    }
    await writeFile(source, fixture())
    await writeFile(extracted, fixture())
    await assert.rejects(verifyPackageBinary(extracted, source, false, 'deb'), /missing original Tauri bundle type token/)
    await assert.rejects(verifyPackageBinary(extracted, source, false, 'unknown'), /unsupported bundle type comparison/)
    await assert.rejects(verifyPackageBinary(extracted, source, false, 'toString'), /unsupported bundle type comparison/)
    for (const target of ['app', 'appimage']) {
      const report = await verifyPackageBinary(extracted, source, false, target)
      assert.equal(report.sha256, report.sourceSha256)
      const corrupted = fixture()
      corrupted[250] ^= 1
      await writeFile(extracted, corrupted)
      await assert.rejects(verifyPackageBinary(extracted, source, false, target), /differs from expected/)
      await writeFile(extracted, fixture())
    }
    // The upstream bundler selects the first token even if another remains.
    const repeated = fixture()
    repeated.write('__TAURI_BUNDLE_TYPE_VAR_UNK', 160)
    repeated.write('__TAURI_BUNDLE_TYPE_VAR_UNK', 200)
    await writeFile(source, repeated)
    repeated.write('__TAURI_BUNDLE_TYPE_VAR_DEB', 160)
    await writeFile(extracted, repeated)
    await verifyPackageBinary(extracted, source, false, 'deb')
    repeated.write('__TAURI_BUNDLE_TYPE_VAR_DEB', 200)
    await writeFile(extracted, repeated)
    await assert.rejects(verifyPackageBinary(extracted, source, false, 'deb'), /differs from expected/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
test('updater candidate hash is derived before installation from an audited NSIS harness source', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'updater-candidate-audit-'))
  const source = join(temporary, 'candidate.exe')
  try {
    const bytes = fixture(process.arch, marker)
    bytes.write('__TAURI_BUNDLE_TYPE_VAR_UNK', 200)
    await writeFile(source, bytes)
    const candidate = await expectedPackageIdentity(source, true, 'nsis')
    assert.notEqual(candidate.sourceSha256, candidate.expectedSha256)
    // No installed/extracted executable exists when the updater derives its proof.
    const installed = join(temporary, 'installed.exe')
    bytes.write('__TAURI_BUNDLE_TYPE_VAR_NSS', 200)
    await writeFile(installed, bytes)
    assert.equal((await verifyBinary(installed, true)).sha256, candidate.expectedSha256)
    await writeFile(source, fixture())
    await assert.rejects(expectedPackageIdentity(source, true, 'nsis'), /harness identity/)
    await writeFile(source, fixture(process.arch === 'arm64' ? 'x64' : 'arm64', marker))
    await assert.rejects(expectedPackageIdentity(source, true, 'nsis'), /architecture mismatch/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
