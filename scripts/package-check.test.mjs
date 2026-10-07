import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyBinary } from './package-check.mjs'
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
    for (const markerText of [marker, 'NATIVE_SMOKE']) {
      await writeFile(path, fixture(process.arch, markerText))
      await assert.rejects(verifyBinary(path, false), /harness/)
    }
    await writeFile(path, fixture(process.arch, marker))
    await verifyBinary(path, true)
    await writeFile(path, fixture(process.arch === 'arm64' ? 'x64' : 'arm64'))
    await assert.rejects(verifyBinary(path, false), /architecture mismatch/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
