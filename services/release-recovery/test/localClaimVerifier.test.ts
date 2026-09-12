import { createHash, generateKeyPairSync } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { signRecoveryClaimJws } from '../src/crypto.js'
import { RECOVERY_KEY_ID } from '../src/recoveryPublicKey.js'

it('verifies a service-signed claim locally and refuses it after receipt expiry', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const publicJwk = pair.publicKey.export({ format: 'jwk' })
  const thumbprint = createHash('sha256').update(JSON.stringify({
    crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y,
  })).digest('base64url')
  const expected = {
    requestId: '123e4567-e89b-42d3-a456-426614174000', authorizationJti: '123e4567-e89b-42d3-a456-426614174001',
    authorizationJwsSha256: '1'.repeat(64), pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
    candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40), artifactId: '789', artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: '2'.repeat(64), innerArtifactTarSha256: '3'.repeat(64), contentManifestSha256: '4'.repeat(64),
    deploymentAttestationSha256: '5'.repeat(64), operation: 'github-pages-production-deploy', canonicalOrigin: 'https://warpkeep.com', authorizationEpoch: 19,
  }
  const compact = await signRecoveryClaimJws({
    schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-claim-v1', iss: 'https://release-auth.warpkeep.com',
    aud: 'warpkeep-0.4.0-sealed-launch', sub: 'warpkeep-0.4.0-recovery-deployment-claim', kid: RECOVERY_KEY_ID,
    ...expected, claimSequence: 1, claimedAt: 1001, claimDeadline: 2201, iat: 1001, nbf: 1001, exp: 1121,
  }, pair.privateKey.export({ format: 'jwk' }))
  vi.resetModules()
  vi.doMock('../../../scripts/recovery-public-key.mjs', () => ({
    RECOVERY_KEY_ID, RECOVERY_PUBLIC_JWK: publicJwk, RECOVERY_KEY_THUMBPRINT: thumbprint,
  }))
  try {
    const { verifyRecoveryClaimReceipt } = await import('../../../scripts/verify-recovery-claim-receipt.mjs')
    expect(verifyRecoveryClaimReceipt(compact, JSON.stringify(expected), 1120)).toEqual({ authorizationEpoch: 19, claimSequence: 1, issuedAt: 1001, expiresAt: 1121 })
    expect(() => verifyRecoveryClaimReceipt(compact, JSON.stringify(expected), 1121)).toThrow('RECOVERY_CLAIM_INVALID')
    expect(() => verifyRecoveryClaimReceipt(compact, JSON.stringify({ ...expected, artifactId: '790' }), 1120)).toThrow('RECOVERY_CLAIM_INVALID')
  } finally {
    vi.doUnmock('../../../scripts/recovery-public-key.mjs'); vi.resetModules()
  }
})
