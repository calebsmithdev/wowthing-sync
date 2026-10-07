import { resolve } from 'node:path'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { verifyBinary } from './package-check.mjs'
const target = process.argv[2]
if (!/^(aarch64-apple-darwin|x86_64-apple-darwin|x86_64-unknown-linux-gnu|x86_64-pc-windows-msvc)$/.test(target ?? '')) throw new Error('unsupported distribution target')
const config = JSON.parse(await readFile('apps/desktop/src-tauri/tauri.conf.json', 'utf8'))
const binary = resolve('target', target, 'release', `${config.mainBinaryName}${process.platform === 'win32' ? '.exe' : ''}`)
const identity = await verifyBinary(binary, false)
await mkdir('test-results', { recursive: true })
await writeFile('test-results/distribution-identity.json', JSON.stringify({ target, binary, ...identity }, null, 2))
