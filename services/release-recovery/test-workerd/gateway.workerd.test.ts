import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import { createRecoveryGateway } from '../src/gateway.js'
import { snapshotSignerRequest } from '../src/signerRequests.js'
import { createSignerObservationService } from '../src/signerObservationService.js'
import type { ReleaseRecoveryObservationRequest } from '../src/realmEvidence.js'
import { snapshotPtrUpdateObservationContext } from '../src/ptrObservation.js'

it('exposes the separate actual signer RPC and rejects invalid or extra arguments without public authority', async () => {
  // Catch expected exceptions inside the test worker, following the existing
  // preparation probe; do not suppress Workerd runtime failures.
  for (const extra of [[], ['unexpected']]) {
    const result = await env.RECOVERY_PREPARATION_ACTUAL_SIGNER.probeInvalidPtrUpdate({}, ...extra)
    try { expect(result.code).toBe('RECOVERY_PTR_UPDATE_OBSERVATION_UNAVAILABLE') }
    finally { result[Symbol.dispose]() }
  }
  const trap = vi.fn(() => [])
  expect(() => snapshotPtrUpdateObservationContext(new Proxy({}, { ownKeys: trap }))).toThrow()
  expect(trap).not.toHaveBeenCalled()
})

it('transports recovery and PTR observation endpoint contracts through a real named Worker service binding', async () => {
  const log = vi.fn()
  const gateway = createRecoveryGateway({ signer: env.RECOVERY_GATEWAY_TEST_SIGNER, log })
  const direct = await env.RECOVERY_GATEWAY_TEST_SIGNER.status()
  expect(Reflect.ownKeys(direct)).toEqual(['statusJws', Symbol.dispose])
  expect(Object.getOwnPropertyDescriptor(direct, Symbol.dispose)?.enumerable).toBe(false)
  direct[Symbol.dispose]()
  const root = 'https://release-auth.warpkeep.com/v1/recovery/'
  const requestId = '123e4567-e89b-42d3-a456-426614174000'
  const issue = { requestId, candidateCommit: 'a'.repeat(40), sourceVerifyRunId: '1', sourceVerifyRunAttempt: '1', artifactId: '2', oidcToken: 'test-only-oidc' }
  const ptrObservation = { requestId, sourceCommit: 'a'.repeat(40), oidcToken: 'test-only.oidc.token' }
  await expect(async () => env.RECOVERY_GATEWAY_TEST_SIGNER.issue(snapshotSignerRequest('issue', issue))).rejects.toThrow('Could not serialize')
  const directIssue = await env.RECOVERY_GATEWAY_TEST_SIGNER.issue({ ...snapshotSignerRequest('issue', issue) })
  directIssue[Symbol.dispose]()
  expect(await (await gateway.fetch(new Request(root + 'status'))).json()).toEqual({ statusJws: 'test-only-status' })
  const ptrResponse = await gateway.fetch(new Request(root + 'ptr-observation', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ptrObservation) }))
  expect(await ptrResponse.json()).toEqual({ ptrObservationJws: 'test-only-ptr-observation' })
  const update = { ...ptrObservation, context: {
    bindingDigest: '1'.repeat(64), inspectionDigest: '2'.repeat(64), inspectionRecordDigest: '3'.repeat(64),
    predecessorDigest: null, predecessorReceiptDigest: null, beforeProgram: 'a'.repeat(64), candidateProgram: 'b'.repeat(64),
    scopeDigest: '4'.repeat(64), issuedRecordDigest: '5'.repeat(64), claimRecordDigest: '6'.repeat(64),
    claimRunId: '1', claimRunAttempt: '1', phase: 'pre' } }
  const updateResponse = await gateway.fetch(new Request(root + 'ptr-update-observation', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) }))
  expect(updateResponse.status).toBe(200)
  expect(await updateResponse.json()).toEqual({ ptrUpdateObservationJws: 'test-only-ptr-update-observation' })
  for (const endpoint of ['issue', 'claim', 'complete', 'reconcile']) {
    const request = { ...issue, ...(endpoint === 'issue' ? {} : endpoint === 'claim' ? { authorizationJws: 'test-only-authorization' } : { claimReceiptJws: 'test-only-claim' }) }
    const response = await gateway.fetch(new Request(root + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  }
  expect(await (await gateway.fetch(new Request(root + 'requests/' + requestId))).json()).toEqual({ terminalJws: 'test-only-terminal' })
  expect(log).toHaveBeenCalledTimes(8)
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/test-only-|oidcToken|authorizationJws|claimReceiptJws/u)
})

it('adapts a real named observer binding to the strict plain capability without RPC lifecycle fields', async () => {
  const service = env.RECOVERY_GATEWAY_TEST_SIGNER
  expect(Object.getPrototypeOf(service)).not.toBe(Object.prototype)
  const request = { rpcCredential: 'test-only-rpc', requestId: '123e4567-e89b-42d3-a456-426614174000' } as ReleaseRecoveryObservationRequest
  const direct = await service.observeReleaseRecoveryState(request)
  expect(Reflect.ownKeys(direct)).toContain(Symbol.dispose)
  direct[Symbol.dispose]()
  const adapter = createSignerObservationService(service)
  expect(Object.getPrototypeOf(adapter)).toBe(Object.prototype)
  expect(Reflect.ownKeys(adapter)).toEqual(['observeReleaseRecoveryState'])
  const detached = adapter.observeReleaseRecoveryState
  const result = await detached(request)
  expect(Reflect.ownKeys(result as object)).toEqual(['testOnlyObservation', 'requestId'])
  expect(result).toEqual({ testOnlyObservation: true, requestId: request.requestId })
})
