import test from 'node:test'
import assert from 'node:assert/strict'
import { requireSuccess, validateTier } from './ci-gate.mjs'
test('required gate rejects every non-success, missing job and empty topology', () => {
  for (const result of ['failure', 'cancelled', 'skipped', undefined]) assert.throws(() => requireSuccess({ frontend: { result: 'success' }, native: { result } }, ['frontend', 'native']), /Required job native/)
  assert.throws(() => requireSuccess({}, ['checks']), /missing/)
  assert.throws(() => requireSuccess({}, []), /must not be empty/)
  requireSuccess({ frontend: { result: 'success' }, native: { result: 'success' } }, ['frontend', 'native'])
  for (const tier of ['pr', 'nightly', 'release']) validateTier(tier)
  assert.throws(() => validateTier('untrusted-skip'), /Unknown CI tier/)
})
