import { commit, githubFail, positive, snapshotExactDataObject } from './config.js'

const ISSUE_KEYS = Object.freeze([
  'requestId', 'candidateCommit', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId', 'oidcToken',
] as const)
const CONTRACTS = Object.freeze({
  issue: ISSUE_KEYS,
  claim: Object.freeze([...ISSUE_KEYS, 'authorizationJws']),
  complete: Object.freeze([...ISSUE_KEYS, 'claimReceiptJws']),
  reconcile: Object.freeze([...ISSUE_KEYS, 'claimReceiptJws']),
  terminal: Object.freeze(['requestId']),
})
const CODE = 'RECOVERY_REQUEST_INVALID'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

/** Transport validation only; OIDC/signature and durable authority checks remain mandatory. */
export function snapshotSignerRequest(endpoint: unknown, input: unknown): Readonly<Record<string, string>> {
  if (typeof endpoint !== 'string' || !Object.hasOwn(CONTRACTS, endpoint)) githubFail(CODE)
  const keys = CONTRACTS[endpoint as keyof typeof CONTRACTS]
  const source = snapshotExactDataObject(input, keys, CODE)
  const result: Record<string, string> = Object.create(null)
  for (const key of keys) {
    const value = source[key]
    if (typeof value !== 'string' || value.length === 0 || value.length > 32768) githubFail(CODE)
    if (key === 'requestId' ? !UUID.test(value)
      : key === 'candidateCommit' ? !commit(value)
        : ['sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'].includes(key) ? !positive(value)
          : value.length > 16384 || !/^[\x21-\x7e]+$/u.test(value)) githubFail(CODE)
    result[key] = value
  }
  // Includes escaped JSON bytes and field names, matching the public transport cap.
  if (new TextEncoder().encode(JSON.stringify(result)).length > 32768) githubFail(CODE)
  return Object.freeze(result)
}
