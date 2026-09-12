import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import { createRecoveryGateway } from '../src/gateway.js'
import { snapshotSignerRequest } from '../src/signerRequests.js'
import { createSignerObservationService } from '../src/signerObservationService.js'
import type { ReleaseRecoveryObservationRequest } from '../src/realmEvidence.js'

it('transports all six endpoint contracts through a real named Worker service binding', async () => {
  const log = vi.fn()
  const gateway = createRecoveryGateway({ signer: env.RECOVERY_GATEWAY_TEST_SIGNER, log })
  const direct = await env.RECOVERY_GATEWAY_TEST_SIGNER.status()
  expect(Reflect.ownKeys(direct)).toEqual(['statusJws', Symbol.dispose])
  expect(Object.getOwnPropertyDescriptor(direct, Symbol.dispose)?.enumerable).toBe(false)
  direct[Symbol.dispose]()
  const root = 'https://release-auth.warpkeep.com/v1/recovery/'
  const requestId = '123e4567-e89b-42d3-a456-426614174000'
  const issue = { requestId, candidateCommit: 'a'.repeat(40), sourceVerifyRunId: '1', sourceVerifyRunAttempt: '1', artifactId: '2', oidcToken: 'test-only-oidc' }
  await expect(async () => env.RECOVERY_GATEWAY_TEST_SIGNER.issue(snapshotSignerRequest('issue', issue))).rejects.toThrow('Could not serialize')
  const directIssue = await env.RECOVERY_GATEWAY_TEST_SIGNER.issue({ ...snapshotSignerRequest('issue', issue) })
  directIssue[Symbol.dispose]()
  expect(await (await gateway.fetch(new Request(root + 'status'))).json()).toEqual({ statusJws: 'test-only-status' })
  for (const endpoint of ['issue', 'claim', 'complete', 'reconcile']) {
    const request = { ...issue, ...(endpoint === 'issue' ? {} : endpoint === 'claim' ? { authorizationJws: 'test-only-authorization' } : { claimReceiptJws: 'test-only-claim' }) }
    const response = await gateway.fetch(new Request(root + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  }
  expect(await (await gateway.fetch(new Request(root + 'requests/' + requestId))).json()).toEqual({ terminalJws: 'test-only-terminal' })
  expect(log).toHaveBeenCalledTimes(6)
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
