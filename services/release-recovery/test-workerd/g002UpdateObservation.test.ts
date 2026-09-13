import { env } from 'cloudflare:workers'
import { reset } from 'cloudflare:test'
import { afterEach, expect, it, vi } from 'vitest'
import { createRecoveryGateway } from '../src/gateway.js'
import { snapshotG002UpdateObservationContext, verifyHistoricalG002UpdateObservation } from '../src/ptrObservation.js'
import { ptrObservationOidcFixture } from '../test/ptrObservationOidcFixture.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
    y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))
declare const __WARPKEEP_PREPARATION_TEST_RESET_TIMEOUT__: number
afterEach(async () => { vi.unstubAllGlobals(); await reset() }, __WARPKEEP_PREPARATION_TEST_RESET_TIMEOUT__)

it('crosses the actual named signer RPC with real OIDC, fixed G002 capture and canonical signature', async () => {
  const f = await ptrObservationOidcFixture({ claims: { aud: 'https://release-auth.warpkeep.com/g002-update-observation' },
    mutate(url, value) {
      if (url.includes('/jobs?')) for (const job of value.jobs as Record<string, unknown>[])
        if (job.name === 'observe_ptr') job.name = 'operate_g002'
      if (value.name === 'observe_ptr') value.name = 'operate_g002'
    } })
  vi.stubGlobal('fetch', f.fetch)
  const gateway = createRecoveryGateway({ signer: env.RECOVERY_PREPARATION_ACTUAL_SIGNER, log: () => {} })
  const context = { bindingDigest: '1'.repeat(64), inspectionDigest: '2'.repeat(64), inspectionRecordDigest: '3'.repeat(64),
    predecessorDigest: null, predecessorReceiptDigest: null, beforeProgram: 'a'.repeat(64), candidateProgram: 'b'.repeat(64),
    scopeDigest: '4'.repeat(64), issuedRecordDigest: '5'.repeat(64), claimRecordDigest: '6'.repeat(64),
    claimRunId: '9007199254740995', claimRunAttempt: '2', phase: 'pre' }
  const response = await gateway.fetch(new Request('https://release-auth.warpkeep.com/v1/recovery/g002-update-observation',
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oidcToken: f.token, sourceCommit: f.sourceCommit, requestId: f.requestId, context }) }))
  expect(response.status).toBe(200)
  const body = await response.json() as { g002UpdateObservationJws: string }
  const data = await verifyHistoricalG002UpdateObservation(body.g002UpdateObservationJws)
  expect(data.context).toEqual(context)
  expect(data.observation.g002.databaseIdentity).toBe('c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194')
  expect(data.observation.g002.programKeccak256).toBe(context.beforeProgram)
})
it('rejects malformed/extra actual RPC inputs and proxies before invoking traps', async () => {
  for (const extra of [[], ['unexpected']]) {
    const result = await env.RECOVERY_PREPARATION_ACTUAL_SIGNER.probeInvalidG002Update({}, ...extra)
    try { expect(result.code).toBe('RECOVERY_G002_UPDATE_OBSERVATION_UNAVAILABLE') }
    finally { result[Symbol.dispose]() }
  }
  const trap = vi.fn(() => [])
  expect(() => snapshotG002UpdateObservationContext(new Proxy({}, { ownKeys: trap }))).toThrow()
  expect(trap).not.toHaveBeenCalled()
})
