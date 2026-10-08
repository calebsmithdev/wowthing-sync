import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { command } from './native-integration.mjs'
import { verifyGlibcRequirements, verifyAppDir } from './appimage-check.mjs'

test('glibc audit checks required versions numerically and ignores exported definitions', () => {
  const output = `Version definition section '.gnu.version_d' contains 1 entry:
    Name: GLIBC_2.39
Version needs section '.gnu.version_r' contains 2 entries:
    Name: GLIBC_2.2.5
    Name: GLIBC_2.9
    Name: GLIBC_2.35
    Name: GLIBCXX_3.4.30
    Name: GCC_3.0
`
  assert.equal(verifyGlibcRequirements(output), '2.35')
  assert.equal(verifyGlibcRequirements('No version information found in this file.'), null)
  for (const version of ['2.35.1', '2.36', '2.38', '2.39', 'PRIVATE', 'ABI_DT_RELR']) {
    assert.throws(() => verifyGlibcRequirements(output.replace('Name: GLIBC_2.35', `Name: GLIBC_${version}`)), /Ubuntu 22.04/)
  }
})

test('AppDir audit rejects a missing or broken .DirIcon before ELF inspection', { skip: process.platform !== 'linux' }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'wowthing-appdir-icon-'))
  try {
    await writeFile(join(temporary, 'AppRun'), '#!/bin/sh\n', { mode: 0o755 })
    await assert.rejects(verifyAppDir(temporary), /missing .DirIcon/)
    await symlink('missing.png', join(temporary, '.DirIcon'))
    await assert.rejects(verifyAppDir(temporary), /symlink target/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})

test('AppDir audit scans bundled libraries as well as the main executable', { skip: process.platform !== 'linux' }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'wowthing-appdir-elf-'))
  try {
    await mkdir(join(temporary, 'usr/bin'), { recursive: true })
    await mkdir(join(temporary, 'usr/lib'), { recursive: true })
    await writeFile(join(temporary, 'AppRun'), '#!/bin/sh\n', { mode: 0o755 })
    await writeFile(join(temporary, 'fixture.png'), 'synthetic icon')
    await symlink('fixture.png', join(temporary, '.DirIcon'))
    await writeFile(join(temporary, 'fixture.desktop'), '[Desktop Entry]\nType=Application\nName=Fixture\nExec=fixture\nIcon=fixture\nCategories=Utility;\n')
    const source = join(temporary, 'fixture.c')
    const library = join(temporary, 'usr/lib/libfixture.so')
    await writeFile(source, '#include <stdio.h>\nint main(void) { return puts("synthetic fixture"); }\n')
    await command('cc', [source, '-o', join(temporary, 'usr/bin/fixture')], { capture: true })
    await command('cc', ['-shared', '-fPIC', source, '-o', library], { capture: true })
    assert.equal((await verifyAppDir(temporary)).elfFiles, 2)
    const bytes = await readFile(library)
    const offset = bytes.indexOf('GLIBC_2.2.5')
    assert.ok(offset >= 0, 'fixture must reference the original puts symbol version')
    bytes.write('GLIBC_9.9.9', offset)
    await writeFile(library, bytes)
    await assert.rejects(verifyAppDir(temporary), /usr\/lib\/libfixture.so: requires GLIBC_9.9.9/)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
