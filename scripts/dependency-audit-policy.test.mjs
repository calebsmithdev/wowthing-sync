import test from 'node:test'
import assert from 'node:assert/strict'
import { requireCompletedAudit } from './dependency-audit-policy.mjs'

const completed = { exitCode: 0, passed: true, timedOut: false, signal: null, processClosed: true, treeClosed: true }
test('clean audits and completed audits with findings do not block releases', () => {
  requireCompletedAudit(completed, 0, 'npm')
  requireCompletedAudit({ ...completed, exitCode: 1, passed: false }, 15, 'npm')
  requireCompletedAudit({ ...completed, exitCode: 1, passed: false }, 1, 'RustSec')
})
test('execution failures remain blocking even when partial output reports findings', () => {
  for (const override of [
    { exitCode: 2 }, { timedOut: true }, { signal: 'SIGTERM' },
    { processClosed: false }, { treeClosed: false },
  ]) {
    assert.throws(() => requireCompletedAudit({ ...completed, passed: false, exitCode: 1, ...override }, 15, 'npm'), /did not complete/)
  }
  assert.throws(() => requireCompletedAudit({ ...completed, passed: false, exitCode: 1 }, 0, 'npm'), /did not complete/)
  assert.throws(() => requireCompletedAudit(undefined, 15, 'npm'), /did not complete/)
})
