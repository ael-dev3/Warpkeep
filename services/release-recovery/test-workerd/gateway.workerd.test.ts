import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import { createRecoveryGateway } from '../src/gateway.js'
import { snapshotSignerRequest } from '../src/signerRequests.js'

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
