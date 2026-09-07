import { createHash, generateKeyPairSync, webcrypto } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { signRecoveryAuthorizationJws, signRecoveryClaimJws } from '../src/crypto.js'
import { RECOVERY_KEY_ID } from '../src/recoveryPublicKey.js'
import { recoveryAuthorizationFixture } from '../../../tests/fixtures/recoveryAuthorizationFixture.js'

it('binds a service-signed authorization to its exact service-signed claim', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const publicJwk = pair.publicKey.export({ format: 'jwk' })
  const privateJwk = pair.privateKey.export({ format: 'jwk' })
  const thumbprint = createHash('sha256').update(JSON.stringify({
    crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y,
  })).digest('base64url')
  const fixture = recoveryAuthorizationFixture()
  const authorization = await signRecoveryAuthorizationJws(
    fixture.payload as Parameters<typeof signRecoveryAuthorizationJws>[0], privateJwk,
  )
  vi.resetModules()
  vi.doMock('../../../scripts/recovery-public-key.mjs', () => ({
    RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK: publicJwk, RECOVERY_KEY_THUMBPRINT: thumbprint,
  }))
  try {
    const { verifyRecoveryAuthorization } = await import('../../../scripts/verify-recovery-authorization-jws.mjs')
    const { verifyRecoveryClaimReceipt } = await import('../../../scripts/verify-recovery-claim-receipt.mjs')
    const result = verifyRecoveryAuthorization(authorization, fixture.bindingSource, JSON.stringify(fixture.context), 1100)
    const expected = JSON.parse(result.claimExpectedSource)
    const independentDigest = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization))).toString('hex')
    expect(expected.authorizationJwsSha256).toBe(independentDigest)
    const claim = await signRecoveryClaimJws({
      schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-claim-v1', iss: 'https://release-auth.warpkeep.com',
      aud: 'warpkeep-0.4.0-sealed-launch', sub: 'warpkeep-0.4.0-recovery-deployment-claim', kid: RECOVERY_KEY_ID,
      ...expected, claimSequence: 1, claimedAt: 1100, claimDeadline: 2300, iat: 1100, nbf: 1100, exp: 1220,
    }, privateJwk)
    expect(verifyRecoveryClaimReceipt(claim, result.claimExpectedSource, 1101)).toEqual({
      authorizationEpoch: fixture.payload.authorizationEpoch, claimSequence: 1, issuedAt: 1100, expiresAt: 1220,
    })
    expect(() => verifyRecoveryClaimReceipt(claim, result.claimExpectedSource, 1220)).toThrow('RECOVERY_CLAIM_INVALID')
    expect(() => verifyRecoveryClaimReceipt(claim, JSON.stringify({ ...expected, artifactId: '790' }), 1101)).toThrow('RECOVERY_CLAIM_INVALID')
  } finally {
    vi.doUnmock('../../../scripts/recovery-public-key.mjs'); vi.resetModules()
  }
})
