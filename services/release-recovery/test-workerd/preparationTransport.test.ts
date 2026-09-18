import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'
import { createRecoveryGateway } from '../src/gateway.js'
import preparationWorker from '../src/index-preparation-signer.js'

const request = () => new Request('https://release-auth.warpkeep.com/v1/recovery/prepare', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ oidcToken: 'a.b.c', preparationCommit: 'c'.repeat(40) }),
})
it('transports the preparation contract through a named Worker RPC binding and strips lifecycle fields', async () => {
  const log = vi.fn()
  const gateway = createRecoveryGateway({ signer: env.RECOVERY_GATEWAY_TEST_SIGNER, log })
  const response = await gateway.fetch(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ preparationReceiptJws: 'test-only-preparation' })
  expect(log).toHaveBeenCalledWith({ schemaVersion: 1, profile: 'warpkeep-release-recovery-safe-log-v1',
    endpoint: 'prepare', outcome: 'success', httpStatus: 200, requestId: null })
})
it('reaches the actual private signer preparation entry without full arming and refuses absent policy', async () => {
  // The test-only remote probe catches the expected error inside the RPC handler.
  // No production runtime exception behavior is changed or suppressed.
  const result = await env.RECOVERY_PREPARATION_ACTUAL_SIGNER.probeWithoutPolicy({ oidcToken: 'a.b.c', preparationCommit: 'c'.repeat(40) })
  try { expect(result.code).toBe('RECOVERY_PREPARATION_POLICY_INVALID') }
  finally { result[Symbol.dispose]() }
})

it.each(['status', 'issue', 'claim', 'complete', 'reconcile', 'terminal'])(
  'does not expose the final %s method through the actual preparation Worker RPC', async method => {
    // Deliberately attempt a method absent from the typed preparation interface.
    // This must fail at named RPC dispatch, before any signer request validation.
    const remote = env.RECOVERY_PREPARATION_ACTUAL_SIGNER as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
    let caught: unknown
    try { await remote[method]!(...(method === 'status' ? [] : [{}])) }
    catch (error) { caught = error }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/does not implement/iu)
  },
)

it('keeps the private preparation entry off HTTP and reports unavailable final gateway status safely', async () => {
  const privateResponse = preparationWorker.fetch()
  expect(privateResponse.status).toBe(404)
  expect(privateResponse.headers.get('Cache-Control')).toBe('no-store')
  expect(await privateResponse.text()).toBe('')
  const log = vi.fn()
  const gateway = createRecoveryGateway({ signer: env.RECOVERY_PREPARATION_ACTUAL_SIGNER, log })
  const response = await gateway.fetch(new Request('https://release-auth.warpkeep.com/v1/recovery/status'))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ code: 'RECOVERY_STATUS_UNAVAILABLE', requestId: null })
  expect(log).toHaveBeenCalledWith({ schemaVersion: 1, profile: 'warpkeep-release-recovery-safe-log-v1',
    endpoint: 'status', outcome: 'unavailable', httpStatus: 503, requestId: null })
})
