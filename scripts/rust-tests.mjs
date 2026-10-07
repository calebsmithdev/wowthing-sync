import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runProcess } from './process-runner.mjs'
const endurance = process.argv.includes('--endurance')
const directory = resolve('test-results/rust')
await mkdir(directory, { recursive: true })
const name = 'real_worker_long_run'
let stdout = '', failure = null
const cases = []
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
try {
  if (endurance) {
    const listed = await runProcess('cargo', ['test', '--locked', name, '--', '--list'], { capture: true, timeout: 900000, reportDirectory: directory })
    const tests = listed.stdout.split('\n').filter(line => line.endsWith(': test'))
    if (tests.length !== 1 || !tests[0].endsWith(`::${name}: test`)) throw new Error('expected exactly one production endurance test')
  }
  await runProcess('cargo', ['test', '--locked', ...(endurance ? [name, '--', '--ignored', '--nocapture'] : [])], { timeout: 900000, label: endurance ? 'endurance' : 'unit-worker', reportDirectory: directory, onStdout: bytes => { stdout += bytes } })
  for (const line of stdout.split('\n')) {
    const match = /^test (\S+) \.\.\. (ok|FAILED|ignored.*)$/.exec(line)
    if (match) cases.push({ name: match[1], status: match[2] })
  }
  if (!cases.length || (endurance && (cases.length !== 1 || !cases[0].name.endsWith(`::${name}`) || cases[0].status !== 'ok'))) throw new Error('missing expected completed Rust test report')
} catch (error) { failure = error.message; console.error(error); process.exitCode = 1 }
finally {
  await writeFile(resolve(directory, `${endurance ? 'endurance' : 'tests'}.json`), JSON.stringify({ passed: failure === null, failure, cases }, null, 2))
  await writeFile(resolve(directory, `${endurance ? 'endurance' : 'tests'}.xml`), `<testsuite tests="${cases.length + (failure ? 1 : 0)}" failures="${failure ? 1 : 0}">${cases.map(item => `<testcase name="${escape(item.name)}">${item.status.startsWith('ignored') ? '<skipped/>' : item.status === 'FAILED' ? '<failure/>' : ''}</testcase>`).join('')}${failure ? `<testcase name="runner"><failure message="${escape(failure)}"/></testcase>` : ''}</testsuite>`)
}
