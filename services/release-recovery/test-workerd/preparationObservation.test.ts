import { createRecoveryGateway } from '../src/gateway.js'

import { env } from 'cloudflare:workers'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observePreparationFromEnvironment } from '../src/signerPreparationObservation.js'
import { verifyPreparationObservation } from '../src/preparationObservation.js'
import { preparationFixture, preparationPolicy, preparationPrivateJwk } from '../test/preparationFixture.js'
import { observeReleaseRecoveryConfiguration } from '../../auth-bridge/src/releaseRecoveryConfiguration.js'
import { bridgeEnv } from '../../auth-bridge/test/recoveryConfigurationFixture.js'
vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: {
    kty: 'EC',
    crv: 'P-256',
    x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
    y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
  },
}))

declare const __WARPKEEP_PREPARATION_TEST_RESET_TIMEOUT__: number
afterEach(async () => {
  vi.unstubAllGlobals()
  await reset()
}, __WARPKEEP_PREPARATION_TEST_RESET_TIMEOUT__)
describe('genuine preparation configuration signer and SQLite control', () => {
  it('crosses actual gateway and signer RPC with unchanged durable reservation receipt', async () => {
    const fixture = await preparationFixture()
    vi.stubGlobal('fetch', fixture.fetch)
    const gateway = createRecoveryGateway({ signer: env.RECOVERY_PREPARATION_ACTUAL_SIGNER, log: () => {} })
    const request = (endpoint: string) =>
      new Request('https://release-auth.warpkeep.com/v1/recovery/' + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oidcToken: fixture.token, preparationCommit: fixture.preparationCommit }),
      })
    const reserved = await gateway.fetch(request('prepare'))
    expect(reserved.status).toBe(200)
    const immutable = await reserved.json()
    const response = await gateway.fetch(request('preparation-observation'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { preparationObservationJws: string }
    const payload = JSON.parse(
      atob(body.preparationObservationJws.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    )
    expect(
      (
        await verifyPreparationObservation(
          body.preparationObservationJws,
          payload.intent,
          Math.floor(Date.now() / 1000),
        )
      ).bridgeConfigEpoch,
    ).toBe(7)
    const retried = await gateway.fetch(request('prepare'))
    expect(retried.status).toBe(200)
    expect(await retried.json()).toEqual(immutable)
  }, 30000)

  it.each(['success', 'rpc-cleanup', 'changed-epoch', 'wrong-request', 'source-move'] as const)(
    'binds actual config to reserved source: %s',
    async (scenario) => {
      let sourceMoved = false
      const fixture = await preparationFixture({ mutate: (url, body) => {
        if (sourceMoved && url.endsWith('/branches/main')) body.commit = { sha: 'f'.repeat(40) }
      } })
      vi.stubGlobal('fetch', fixture.fetch)
      const control = env.RECOVERY_LEDGER_V2.getByName('warpkeep-release-recovery-control-v2')
      const rpcCredential = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
      const disposed = vi.fn()
      const observe = vi.fn(async (request: unknown) => {
        const actual = await observeReleaseRecoveryConfiguration(bridgeEnv(), request)
        if (scenario === 'source-move') sourceMoved = true
        if (scenario === 'changed-epoch')
          await control.reconcileControl({ enabled: false, authorizationEpoch: 4 })
        if (scenario === 'rpc-cleanup')
          return Object.defineProperty({ ...actual }, Symbol.dispose, { value: disposed })
        return scenario === 'wrong-request'
          ? { ...actual, requestId: '123e4567-e89b-42d3-a456-426614174001' }
          : actual
      })
      const environment = {
        ...fixture.environment,
        RECOVERY_ENABLED: 'false',
        RECOVERY_AUTHORIZATION_EPOCH: '3',
        RECOVERY_ARMING_MANIFEST: '',
        RECOVERY_PREPARATION_POLICY: JSON.stringify(preparationPolicy),
        RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify(preparationPrivateJwk),
        RELEASE_RECOVERY_RPC_SECRET: rpcCredential,
        RECOVERY_LEDGER_V2: env.RECOVERY_LEDGER_V2,
        AUTH_BRIDGE_OBSERVER: { observeReleaseRecoveryConfiguration: observe },
      }
      const call = () =>
        observePreparationFromEnvironment(environment, {
          oidcToken: fixture.token,
          preparationCommit: fixture.preparationCommit,
        })
      if (scenario === 'changed-epoch' || scenario === 'wrong-request' || scenario === 'source-move') {
        await expect(call()).rejects.toThrow()
        expect(observe).toHaveBeenCalledOnce()
        return
      }
      const result = await call()
      if (scenario === 'rpc-cleanup') expect(disposed).toHaveBeenCalledOnce()
      const body = JSON.parse(
        atob(result.preparationObservationJws.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
      )
      const verified = await verifyPreparationObservation(
        result.preparationObservationJws,
        body.intent,
        Math.floor(Date.now() / 1000),
      )
      expect(verified.intent.preparationCommit).toBe(fixture.preparationCommit)
      expect(verified.bridgeConfigEpoch).toBe(7)
      expect(verified.bridgeSourceCommit).toBe('e'.repeat(40))
      expect(verified.expiresAt).toBe(verified.observedThrough + 90)
      const state = await control.reconcileControl({ enabled: false, authorizationEpoch: 3 })
      expect(state.enabled).toBe(false)
      expect(state.usedRequestIds).toEqual([])
      expect(state.maxConsumedAuthorizationEpoch).toBeNull()
    },
  )
})
