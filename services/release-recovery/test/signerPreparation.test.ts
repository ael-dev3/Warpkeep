import { afterEach, expect, it, vi } from 'vitest'
import { prepareRecoveryFromEnvironment } from '../src/signerPreparation.js'
import { preparationFixture, preparationPolicy, preparationPrivateJwk } from './preparationFixture.js'
import { base64UrlEncode } from '../src/protocol.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('refuses an authenticated token that expires during metadata lookup before opening the durable namespace', async () => {
  const now = 1_700_000_000
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
  const fixture = await preparationFixture({ now, claims: { exp: now + 1 }, mutate: url => {
    if (url.endsWith('/branches/main')) clock.mockReturnValue((now + 2) * 1000)
  } })
  vi.stubGlobal('fetch', fixture.fetch)
  const namespace = { getByName: vi.fn(() => { throw new Error('must not open') }) }
  await expect(prepareRecoveryFromEnvironment({ ...fixture.environment, RECOVERY_ENABLED: 'false',
    RECOVERY_AUTHORIZATION_EPOCH: '3', RECOVERY_PREPARATION_POLICY: JSON.stringify(preparationPolicy),
    RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify(preparationPrivateJwk),
    RELEASE_RECOVERY_RPC_SECRET: base64UrlEncode(new Uint8Array(32).fill(1)), RECOVERY_LEDGER_V2: namespace as never,
  }, { oidcToken: fixture.token, preparationCommit: fixture.preparationCommit })).rejects.toThrow('RECOVERY_PREPARATION_DEADLINE_EXCEEDED')
  expect(namespace.getByName).not.toHaveBeenCalled()
})
