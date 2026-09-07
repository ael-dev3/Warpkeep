import { createHash, generateKeyPairSync } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { signRecoveryStatusJws } from '../src/crypto.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT, RECOVERY_PUBLIC_JWK } from '../src/recoveryPublicKey.js'

it('keeps the local pinned verification key identical to the service public key', async () => {
  const local = await vi.importActual<typeof import('../../../scripts/recovery-public-key.mjs')>('../../../scripts/recovery-public-key.mjs')
  expect(local.RECOVERY_PUBLIC_JWK).toEqual(RECOVERY_PUBLIC_JWK)
  expect(local.RECOVERY_KEY_ID).toBe(RECOVERY_KEY_ID)
  expect(local.RECOVERY_KEY_THUMBPRINT).toBe(RECOVERY_KEY_THUMBPRINT)
})

it('verifies service-produced signed status bytes with the independent Node verifier', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const publicJwk = pair.publicKey.export({ format: 'jwk' })
  const privateJwk = pair.privateKey.export({ format: 'jwk' })
  const thumbprint = createHash('sha256').update(JSON.stringify({
    crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y,
  })).digest('base64url')
  vi.resetModules()
  vi.doMock('../../../scripts/recovery-public-key.mjs', () => ({
    RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK: publicJwk, RECOVERY_KEY_THUMBPRINT: thumbprint,
  }))
  try {
    const { verifyRecoveryStatus } = await import('../../../scripts/verify-recovery-status.mjs')
    const compact = await signRecoveryStatusJws({
      schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-status-v1',
      iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
      sub: 'warpkeep-0.4.0-recovery-control-status', kid: RECOVERY_KEY_ID,
      enabled: true, authorizationEpoch: 19, iat: 1000, nbf: 1000, exp: 1060,
    }, privateJwk)
    expect(verifyRecoveryStatus(compact, 19, 1059)).toEqual({ authorizationEpoch: 19, issuedAt: 1000, expiresAt: 1060 })
    expect(() => verifyRecoveryStatus(compact, 19, 1060)).toThrow('RECOVERY_STATUS_INVALID')
    expect(() => verifyRecoveryStatus(compact, 18, 1059)).toThrow('RECOVERY_STATUS_INVALID')
  } finally {
    vi.doUnmock('../../../scripts/recovery-public-key.mjs')
    vi.resetModules()
  }
})
