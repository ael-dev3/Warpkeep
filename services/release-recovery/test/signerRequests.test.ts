import { describe, expect, it } from 'vitest'
import { snapshotSignerRequest } from '../src/signerRequests.js'

const issue = () => ({ requestId: '11111111-1111-4111-8111-111111111111',
  candidateCommit: 'a'.repeat(40), sourceVerifyRunId: '9007199254740993',
  sourceVerifyRunAttempt: '1', artifactId: '2', oidcToken: 'opaque-token' })

describe('signer request boundary', () => {
  it('snapshots exact locators without rounding IDs or interpreting tokens', () => {
    const input = issue()
    const result = snapshotSignerRequest('issue', input)
    expect(result).toEqual(input)
    input.artifactId = '3'
    expect(result.artifactId).toBe('2')
    expect(Object.isFrozen(result)).toBe(true)
  })
  it('separates claim from post-deployment receipt correlation', () => {
    expect(snapshotSignerRequest('claim', { ...issue(), authorizationJws: 'opaque-jws' }).authorizationJws).toBe('opaque-jws')
    for (const endpoint of ['complete', 'reconcile'] as const) {
      expect(snapshotSignerRequest(endpoint, { ...issue(), claimReceiptJws: 'opaque-receipt' }).claimReceiptJws).toBe('opaque-receipt')
      expect(() => snapshotSignerRequest(endpoint, { ...issue(), authorizationJws: 'opaque-jws' })).toThrow('RECOVERY_REQUEST_INVALID')
    }
    expect(snapshotSignerRequest('terminal', { requestId: issue().requestId })).toEqual({ requestId: issue().requestId })
  })
  it('rejects malformed fields, extra fields and private-object tricks without invoking getters', () => {
    for (const change of [{ artifactId: 2 }, { artifactId: '02' }, { candidateCommit: 'A'.repeat(40) },
      { oidcToken: '' }, { oidcToken: 'a b' }, { oidcToken: 'x'.repeat(16385) }, { extra: true }]) {
      expect(() => snapshotSignerRequest('issue', { ...issue(), ...change })).toThrow('RECOVERY_REQUEST_INVALID')
    }
    let reads = 0
    const accessor = Object.defineProperty(issue(), 'oidcToken', { enumerable: true, get() { reads++; return 'secret' } })
    for (const input of [accessor, Object.assign(Object.create({ inherited: true }), issue()),
      Object.defineProperty(issue(), 'artifactId', { value: '2', enumerable: false }),
      Object.assign(issue(), { [Symbol('extra')]: true })]) {
      expect(() => snapshotSignerRequest('issue', input)).toThrow('RECOVERY_REQUEST_INVALID')
    }
    expect(reads).toBe(0)
  })
  it('rejects unknown endpoints and over-limit aggregate requests', () => {
    expect(() => snapshotSignerRequest('status', {})).toThrow('RECOVERY_REQUEST_INVALID')
    expect(() => snapshotSignerRequest('claim', { ...issue(), oidcToken: 'x'.repeat(16384), authorizationJws: 'x'.repeat(16384) })).toThrow('RECOVERY_REQUEST_INVALID')
  })
  it('accepts the exact byte ceiling and rejects the next byte including JSON escaping', () => {
    const input = { ...issue(), oidcToken: 'x'.repeat(16384), authorizationJws: 'x' }
    const available = 32768 - Buffer.byteLength(JSON.stringify(input)) + 1
    input.authorizationJws = 'x'.repeat(available)
    expect(Buffer.byteLength(JSON.stringify(input))).toBe(32768)
    expect(snapshotSignerRequest('claim', input)).toEqual(input)
    expect(() => snapshotSignerRequest('claim', { ...input, authorizationJws: input.authorizationJws + 'x' })).toThrow('RECOVERY_REQUEST_INVALID')
    expect(() => snapshotSignerRequest('claim', { ...input, authorizationJws: '"'.repeat(available) })).toThrow('RECOVERY_REQUEST_INVALID')
  })
  it('rejects every missing issue member and extra post-deployment authorization', () => {
    for (const key of Object.keys(issue())) {
      const input: Record<string, unknown> = issue()
      delete input[key]
      expect(() => snapshotSignerRequest('issue', input)).toThrow('RECOVERY_REQUEST_INVALID')
    }
    for (const endpoint of ['complete', 'reconcile']) {
      expect(() => snapshotSignerRequest(endpoint, { ...issue(), claimReceiptJws: 'receipt', authorizationJws: 'secret' })).toThrow('RECOVERY_REQUEST_INVALID')
    }
    expect(() => snapshotSignerRequest('terminal', issue())).toThrow('RECOVERY_REQUEST_INVALID')
  })
})
