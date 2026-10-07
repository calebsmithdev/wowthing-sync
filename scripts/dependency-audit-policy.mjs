// Exit 1 is informational only when a completed audit actually reports findings.
export function requireCompletedAudit(status, findings, label) {
  if (!status || status.timedOut || status.signal || !status.processClosed || !status.treeClosed
    || !(status.passed || (status.exitCode === 1 && findings > 0))) {
    throw new Error(`${label} audit did not complete: ${status?.failure ?? 'invalid process result'}`)
  }
}
