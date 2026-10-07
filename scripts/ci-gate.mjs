import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export function validateTier(tier) {
  if (!['pr', 'nightly', 'release'].includes(tier)) throw new Error(`Unknown CI tier: ${tier}`)
}
export function requireSuccess(results, required) {
  if (!required.length) throw new Error('Required job list must not be empty')
  for (const name of required) {
    if (!Object.hasOwn(results, name) || results[name]?.result !== 'success') throw new Error(`Required job ${name}: ${results[name]?.result ?? 'missing'}`)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--tier') validateTier(process.argv[3])
    else requireSuccess(JSON.parse(process.env.REQUIRED_JOB_RESULTS ?? '{}'), process.argv.slice(2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
