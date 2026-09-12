import { describe, expect, it, vi } from 'vitest'

import type { RecoveryClaimPayload } from '../src/crypto.js'
import {
  githubEvidenceMetadataSha256,
  type GitHubEvidenceMetadata,
} from '../src/githubEvidenceMetadata.js'
import type { LedgerSignerClaimProjection } from '../src/ledgerV2.js'
import { RECOVERY_KEY_ID } from '../src/recoveryPublicKey.js'

const TEST_ONLY_PRIVATE_JWK: JsonWebKey = {
  // Fixture only. This key is never a production recovery signing key.
  kty: 'EC',
  crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
  y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
  d: '3Cfq7fh3QQUIL6yuWLcD7fYN4-26tQgG07i-8nj462o',
}

const TEST_ONLY_PUBLIC_JWK: JsonWebKey = {
  // Fixture only. This public key pairs only with TEST_ONLY_PRIVATE_JWK.
  kty: 'EC',
  crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
  y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
}

const OTHER_TEST_ONLY_PUBLIC_JWK: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: '8UvvEI1cJ_k90byhgLiQfOJwRFPu7vRT94D2JPtnms4',
  y: 'GdfYHHW0cc9gAaCDgHMhareQPEyJEY29yF3BFmFX0RE',
}

const TEST_ONLY_THUMBPRINT = 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const AUTHORIZATION_JTI = '123e4567-e89b-42d3-a456-426614174001'
const AUTHORIZATION_JWS_SHA256 = '6'.repeat(64)
const CANDIDATE_COMMIT = 'a'.repeat(40)
const CANDIDATE_TREE = 'b'.repeat(40)
const CLAIMED_AT = 1_020
const CLAIM_DEADLINE = 2_220
const ROW_BINDING_DIGEST = '7'.repeat(64)

const githubMetadata: GitHubEvidenceMetadata = {
  repository: 'ael-dev3/Warpkeep',
  repositoryId: '1273513252',
  repositoryOwnerId: '183124839',
  candidateCommit: CANDIDATE_COMMIT,
  candidateTree: CANDIDATE_TREE,
  parentCommit: 'c'.repeat(40),
  preparationTree: 'd'.repeat(40),
  artifactId: '789',
  artifactName: 'github-pages-recovery-123-1',
  pagesRunId: '123',
  pagesRunAttempt: '1',
  artifactSize: 1,
  artifactDigest: `sha256:${'c'.repeat(64)}`,
  artifactUrl: 'https://api.github.com/artifact',
  artifactArchiveUrl: 'https://api.github.com/archive',
  artifactNodeId: 'node',
  artifactCreatedAt: '2026-01-01T00:00:00.000Z',
  artifactExpiresAt: '2026-01-02T00:00:00.000Z',
  artifactEtag: 'etag',
  githubArtifactArchiveSha256: 'c'.repeat(64),
}

const claimPayload: RecoveryClaimPayload = {
  schemaVersion: 1,
  profile: 'warpkeep-0.4.0-recovery-claim-v1',
  iss: 'https://release-auth.warpkeep.com',
  aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-deployment-claim',
  kid: RECOVERY_KEY_ID,
  requestId: REQUEST_ID,
  authorizationJti: AUTHORIZATION_JTI,
  authorizationJwsSha256: AUTHORIZATION_JWS_SHA256,
  pagesRunId: '123',
  pagesRunAttempt: '1',
  sourceVerifyRunId: '456',
  sourceVerifyRunAttempt: '2',
  candidateCommit: CANDIDATE_COMMIT,
  candidateTree: CANDIDATE_TREE,
  artifactId: '789',
  artifactName: 'github-pages-recovery-123-1',
  githubArtifactArchiveSha256: 'c'.repeat(64),
  innerArtifactTarSha256: 'd'.repeat(64),
  contentManifestSha256: 'e'.repeat(64),
  deploymentAttestationSha256: 'f'.repeat(64),
  operation: 'github-pages-production-deploy',
  canonicalOrigin: 'https://warpkeep.com',
  authorizationEpoch: 3,
  claimSequence: 1,
  claimedAt: CLAIMED_AT,
  claimDeadline: CLAIM_DEADLINE,
  iat: CLAIMED_AT,
  nbf: CLAIMED_AT,
  exp: CLAIMED_AT + 120,
}

async function projection(): Promise<LedgerSignerClaimProjection> {
  return {
    state: 'claimed',
    requestId: REQUEST_ID,
    authorization: {
      locators: {
        requestId: REQUEST_ID,
        candidateCommit: CANDIDATE_COMMIT,
        sourceVerifyRunId: '456',
        sourceVerifyRunAttempt: '2',
        artifactId: '789',
      },
      workflowIdentity: {
        repository: 'ael-dev3/Warpkeep',
        repositoryId: '1273513252',
        repositoryOwnerId: '183124839',
        ref: 'refs/heads/main',
        workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
        environment: 'github-pages',
        eventName: 'workflow_run',
        workflowSha: CANDIDATE_COMMIT,
        pagesRunId: '123',
        pagesRunAttempt: '1',
        checkRunId: '999',
      },
      authorizationJti: AUTHORIZATION_JTI,
      authorizationEpoch: 3,
      issuedAt: 1_010,
      notBefore: 1_010,
      expiresAt: 1_900,
      issuanceEvidenceSnapshotDigest: '4'.repeat(64),
      liveInvariantDigest: '5'.repeat(64),
      candidateTree: CANDIDATE_TREE,
      artifactName: 'github-pages-recovery-123-1',
      githubArtifactArchiveSha256: 'c'.repeat(64),
      innerArtifactTarSha256: 'd'.repeat(64),
      contentManifestSha256: 'e'.repeat(64),
      deploymentAttestationSha256: 'f'.repeat(64),
      operation: 'github-pages-production-deploy',
      canonicalOrigin: 'https://warpkeep.com',
      githubMetadata,
      githubMetadataSha256: await githubEvidenceMetadataSha256(githubMetadata),
    },
    authorizationJwsSha256: AUTHORIZATION_JWS_SHA256,
    claim: {
      claimSnapshotDigest: '8'.repeat(64),
      claimLiveInvariantDigest: '5'.repeat(64),
      claimSequence: 1,
      claimedAt: CLAIMED_AT,
      claimDeadline: CLAIM_DEADLINE,
    },
    rowBindingDigest: ROW_BINDING_DIGEST,
    revision: 3,
  }
}

async function loadTestBoundary(publicJwk: JsonWebKey = TEST_ONLY_PUBLIC_JWK) {
  vi.resetModules()
  vi.doMock('../src/recoveryPublicKey.js', () => ({
    RECOVERY_KEY_ID,
    RECOVERY_PUBLIC_JWK: publicJwk,
    RECOVERY_KEY_THUMBPRINT: TEST_ONLY_THUMBPRINT,
  }))
  const crypto = await import('../src/crypto.js')
  const correlation = await import('../src/claimReceiptCorrelation.js')
  return { ...crypto, ...correlation }
}

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64url'))
}

function bytesToBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function readP256S(signature: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(signature.slice(32)).toString('hex')}`)
}

describe('post-deploy claim receipt correlation', () => {
  it('keeps ordinary claim verification strict after exp while correlating only before the durable deadline', async () => {
    const boundary = await loadTestBoundary()
    const compact = await boundary.signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    const claimedProjection = await projection()
    const afterReceiptExpiry = (claimPayload.exp as number) + 1

    await expect(boundary.verifyRecoveryClaimJws(compact, afterReceiptExpiry))
      .rejects.toThrowError('RECOVERY_JWS_TIME_INVALID')
    await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
      compact,
      projection: claimedProjection,
      nowSeconds: afterReceiptExpiry,
    })).resolves.toEqual({ rowBindingDigest: ROW_BINDING_DIGEST })
    await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
      compact,
      projection: claimedProjection,
      nowSeconds: CLAIM_DEADLINE,
    })).rejects.toThrowError('RECOVERY_CLAIM_RECEIPT_TIME_INVALID')
  })

  it('rejects correlation before the signed claim time and at the exact durable deadline', async () => {
    const boundary = await loadTestBoundary()
    const compact = await boundary.signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    const claimedProjection = await projection()

    for (const nowSeconds of [CLAIMED_AT - 1, CLAIM_DEADLINE]) {
      await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
        compact,
        projection: claimedProjection,
        nowSeconds,
      })).rejects.toThrowError('RECOVERY_CLAIM_RECEIPT_TIME_INVALID')
    }
  })

  it('binds every signed receipt locator, digest, run, candidate, epoch, and claim coordinate', async () => {
    const boundary = await loadTestBoundary()
    const claimedProjection = await projection()
    const mutations: ReadonlyArray<readonly [string, RecoveryClaimPayload]> = [
      ['requestId', { ...claimPayload, requestId: '123e4567-e89b-42d3-a456-426614174099' }],
      ['authorizationJti', { ...claimPayload, authorizationJti: '123e4567-e89b-42d3-a456-426614174098' }],
      ['authorizationJwsSha256', { ...claimPayload, authorizationJwsSha256: '0'.repeat(64) }],
      ['pagesRunId and artifactName', { ...claimPayload, pagesRunId: '124', artifactName: 'github-pages-recovery-124-1' }],
      ['pagesRunAttempt and artifactName', { ...claimPayload, pagesRunAttempt: '2', artifactName: 'github-pages-recovery-123-2' }],
      ['sourceVerifyRunId', { ...claimPayload, sourceVerifyRunId: '457' }],
      ['sourceVerifyRunAttempt', { ...claimPayload, sourceVerifyRunAttempt: '3' }],
      ['candidateCommit', { ...claimPayload, candidateCommit: '9'.repeat(40) }],
      ['candidateTree', { ...claimPayload, candidateTree: '8'.repeat(40) }],
      ['artifactId', { ...claimPayload, artifactId: '790' }],
      ['githubArtifactArchiveSha256', { ...claimPayload, githubArtifactArchiveSha256: '0'.repeat(64) }],
      ['innerArtifactTarSha256', { ...claimPayload, innerArtifactTarSha256: '1'.repeat(64) }],
      ['contentManifestSha256', { ...claimPayload, contentManifestSha256: '2'.repeat(64) }],
      ['deploymentAttestationSha256', { ...claimPayload, deploymentAttestationSha256: '3'.repeat(64) }],
      ['authorizationEpoch', { ...claimPayload, authorizationEpoch: 4 }],
      ['claimSequence', { ...claimPayload, claimSequence: 2 }],
    ]

    for (const [name, mutatedPayload] of mutations) {
      const compact = await boundary.signRecoveryClaimJws(mutatedPayload, TEST_ONLY_PRIVATE_JWK)
      await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
        compact,
        projection: claimedProjection,
        nowSeconds: CLAIMED_AT + 1,
      }), name).rejects.toThrowError('RECOVERY_CLAIM_RECEIPT_MISMATCH')
    }
  })

  it('binds claim timing to the projection independently of receipt expiry', async () => {
    const boundary = await loadTestBoundary()
    const claimedProjection = await projection()
    const shiftedClaim: RecoveryClaimPayload = {
      ...claimPayload,
      claimedAt: CLAIMED_AT + 1,
      claimDeadline: CLAIM_DEADLINE + 1,
      iat: CLAIMED_AT + 1,
      nbf: CLAIMED_AT + 1,
      exp: (claimPayload.exp as number) + 1,
    }
    const compact = await boundary.signRecoveryClaimJws(shiftedClaim, TEST_ONLY_PRIVATE_JWK)

    await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
      compact,
      projection: claimedProjection,
      nowSeconds: CLAIMED_AT + 1,
    })).rejects.toThrowError('RECOVERY_CLAIM_RECEIPT_MISMATCH')
  })

  it('cross-checks the receipt against duplicated authorization and canonical GitHub metadata fields', async () => {
    const boundary = await loadTestBoundary()
    const compact = await boundary.signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    const baseline = await projection()
    const changedMetadata = { ...githubMetadata, candidateCommit: '9'.repeat(40) }
    const projections: LedgerSignerClaimProjection[] = [
      {
        ...baseline,
        authorization: { ...baseline.authorization, artifactName: 'github-pages-recovery-999-1' },
      },
      {
        ...baseline,
        authorization: { ...baseline.authorization, operation: 'attacker-selected' as never },
      },
      {
        ...baseline,
        authorization: { ...baseline.authorization, canonicalOrigin: 'https://attacker.invalid' as never },
      },
      {
        ...baseline,
        authorization: {
          ...baseline.authorization,
          githubMetadata: changedMetadata,
          githubMetadataSha256: await githubEvidenceMetadataSha256(changedMetadata),
        },
      },
      {
        ...baseline,
        authorization: { ...baseline.authorization, githubMetadataSha256: '0'.repeat(64) },
      },
    ]

    for (const changedProjection of projections) {
      await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
        compact,
        projection: changedProjection,
        nowSeconds: CLAIMED_AT + 1,
      })).rejects.toThrowError('RECOVERY_CLAIM_RECEIPT_MISMATCH')
    }
  })

  it('retains strict header, low-S signature, and pinned-key verification', async () => {
    const boundary = await loadTestBoundary()
    const compact = await boundary.signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    const [header, payload, encodedSignature] = compact.split('.')
    const signature = base64UrlToBytes(encodedSignature)
    const highS = boundary.P256_ORDER - readP256S(signature)
    const highSBytes = new Uint8Array(signature)
    highSBytes.set(Buffer.from(highS.toString(16).padStart(64, '0'), 'hex'), 32)
    const wrongHeader = bytesToBase64Url(new TextEncoder().encode(
      `{"alg":"none","typ":"warpkeep-0.4.0-recovery-claim+jwt","kid":"${RECOVERY_KEY_ID}"}`,
    ))
    const claimedProjection = await projection()

    await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
      compact: `${wrongHeader}.${payload}.${encodedSignature}`,
      projection: claimedProjection,
      nowSeconds: CLAIMED_AT + 1,
    })).rejects.toThrowError('RECOVERY_JWS_HEADER_INVALID')
    await expect(boundary.verifyPostDeployClaimReceiptCorrelation({
      compact: `${header}.${payload}.${bytesToBase64Url(highSBytes)}`,
      projection: claimedProjection,
      nowSeconds: CLAIMED_AT + 1,
    })).rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')

    const wrongKeyBoundary = await loadTestBoundary(OTHER_TEST_ONLY_PUBLIC_JWK)
    await expect(wrongKeyBoundary.verifyPostDeployClaimReceiptCorrelation({
      compact,
      projection: claimedProjection,
      nowSeconds: CLAIMED_AT + 1,
    })).rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')
  })

  it('derives the result only from the trusted projection row binding', async () => {
    const boundary = await loadTestBoundary()
    const compact = await boundary.signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    const claimedProjection = await projection()
    const result = await boundary.verifyPostDeployClaimReceiptCorrelation({
      compact,
      projection: claimedProjection,
      nowSeconds: CLAIMED_AT + 1,
      rowBindingDigest: '0'.repeat(64),
      ignoreExpiration: true,
    } as never)

    expect(result).toEqual({ rowBindingDigest: ROW_BINDING_DIGEST })
    expect(Object.keys(result)).toEqual(['rowBindingDigest'])
  })
})
