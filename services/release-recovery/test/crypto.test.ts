import { describe, expect, it, vi } from 'vitest'

import {
  P256_ORDER,
  assertRecoveryPrivateKeyMatchesPinned,
  signRecoveryAuthorizationJws,
  signRecoveryClaimJws,
  signRecoveryStatusJws,
  signRecoveryTerminalJws,
  verifyRecoveryClaimJws,
  verifyRecoveryStatusJws,
} from '../src/crypto.js'
import * as recoveryCrypto from '../src/crypto.js'
import { loadTestOnlyCrypto } from './cryptoFixture.js'

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
  // Fixture only. This deliberately has unrelated P-256 coordinates.
  kty: 'EC',
  crv: 'P-256',
  x: '8UvvEI1cJ_k90byhgLiQfOJwRFPu7vRT94D2JPtnms4',
  y: 'GdfYHHW0cc9gAaCDgHMhareQPEyJEY29yF3BFmFX0RE',
}

const TEST_ONLY_THUMBPRINT = 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M'

const statusPayload = {
  schemaVersion: 1,
  profile: 'warpkeep-0.4.0-recovery-status-v1',
  iss: 'https://release-auth.warpkeep.com',
  aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-control-status',
  kid: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  enabled: true,
  authorizationEpoch: 7,
  iat: 1_000,
  nbf: 1_000,
  exp: 1_060,
} as const

const authorizationPayload = {
  schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-authorization-v1',
  iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-deployment', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  requestId: '123e4567-e89b-42d3-a456-426614174000', jti: '123e4567-e89b-42d3-a456-426614174001', authorizationEpoch: 7,
  repository: 'ael-dev3/Warpkeep', repositoryId: '1273513252', repositoryOwnerId: '183124839', ref: 'refs/heads/main',
  workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main', workflowSha: 'd'.repeat(40),
  environment: 'github-pages', eventName: 'workflow_run', pagesRunId: '123', pagesRunAttempt: '1',
  sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2', predecessorCommit: 'c'.repeat(40), candidateCommit: 'd'.repeat(40),
  candidateTree: 'e'.repeat(40), sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1', sourceClosureSha256: 'a'.repeat(64),
  recoveryAuthorizationCoreSha256: 'b'.repeat(64), artifactId: '789', artifactName: 'github-pages-recovery-123-1',
  githubArtifactArchiveSha256: 'c'.repeat(64), innerArtifactTarSha256: 'd'.repeat(64), contentManifestSha256: 'e'.repeat(64),
  deploymentAttestationSha256: 'f'.repeat(64), releaseVersion: '0.4.0', operation: 'github-pages-production-deploy',
  canonicalOrigin: 'https://warpkeep.com', authWorker: 'warpkeep-auth-bridge',
  genesis001Database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e', genesis002Database: '1'.repeat(64), ptrDatabase: '2'.repeat(64),
  historicalGenesis001ReceiptStatus: 'unavailable', historicalGenesis001ReceiptExpectedSha256: '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63',
  g001ReleaseVersion: '0.3.43', g001PlayerAccessEnabled: true, g001AdmissionStateMutationsEnabled: false, g001AccessRequestSubmissionsEnabled: false,
  g001BaselineAbiSha256: '3'.repeat(64), g002Sealed: true, g002PlayerCount: 0, g002GeneralAdmissionCount: 0,
  ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0, observedFrom: 1_000, observedThrough: 1_001,
  issuanceEvidenceSnapshotDigest: '4'.repeat(64), liveInvariantDigest: '5'.repeat(64), iat: 1_010, nbf: 1_010, exp: 1_900,
} as const

const claimPayload = {
  schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-claim-v1', iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-deployment-claim', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  requestId: authorizationPayload.requestId, authorizationJti: authorizationPayload.jti, authorizationJwsSha256: '6'.repeat(64),
  pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2', candidateCommit: authorizationPayload.candidateCommit,
  candidateTree: authorizationPayload.candidateTree, artifactId: '789', artifactName: authorizationPayload.artifactName,
  githubArtifactArchiveSha256: authorizationPayload.githubArtifactArchiveSha256, innerArtifactTarSha256: authorizationPayload.innerArtifactTarSha256,
  contentManifestSha256: authorizationPayload.contentManifestSha256, deploymentAttestationSha256: authorizationPayload.deploymentAttestationSha256,
  operation: 'github-pages-production-deploy', canonicalOrigin: 'https://warpkeep.com', authorizationEpoch: 7, claimSequence: 1,
  claimedAt: 1_020, claimDeadline: 2_220, iat: 1_020, nbf: 1_020, exp: 1_140,
} as const

const terminalPayload = {
  schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-terminal-v1', iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-terminal-attestation', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  requestId: authorizationPayload.requestId, authorizationJti: authorizationPayload.jti, authorizationJwsSha256: '6'.repeat(64),
  candidateCommit: authorizationPayload.candidateCommit, candidateTree: authorizationPayload.candidateTree, artifactId: '789', artifactName: authorizationPayload.artifactName,
  githubArtifactArchiveSha256: authorizationPayload.githubArtifactArchiveSha256, innerArtifactTarSha256: authorizationPayload.innerArtifactTarSha256,
  contentManifestSha256: authorizationPayload.contentManifestSha256, deploymentAttestationSha256: authorizationPayload.deploymentAttestationSha256,
  operation: 'github-pages-production-deploy', canonicalOrigin: 'https://warpkeep.com', pagesRunId: '123', pagesRunAttempt: '1',
  sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2', authorizationEpoch: 7, completedAt: 1_200, outcome: 'completed', iat: 1_200, nbf: 1_200, exp: 2_000,
} as const

const HAND_DERIVED_TEST_ONLY_STATUS_JWS = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IndhcnBrZWVwLTAuNC4wLXJlY292ZXJ5LXN0YXR1cytqd3QiLCJraWQiOiJ3YXJwa2VlcC0wLjQuMC1yZWNvdmVyeS0yMDI2LTA5LTAzLTEifQ.eyJzY2hlbWFWZXJzaW9uIjoxLCJwcm9maWxlIjoid2FycGtlZXAtMC40LjAtcmVjb3Zlcnktc3RhdHVzLXYxIiwiaXNzIjoiaHR0cHM6Ly9yZWxlYXNlLWF1dGgud2FycGtlZXAuY29tIiwiYXVkIjoid2FycGtlZXAtMC40LjAtc2VhbGVkLWxhdW5jaCIsInN1YiI6IndhcnBrZWVwLTAuNC4wLXJlY292ZXJ5LWNvbnRyb2wtc3RhdHVzIiwia2lkIjoid2FycGtlZXAtMC40LjAtcmVjb3ZlcnktMjAyNi0wOS0wMy0xIiwiZW5hYmxlZCI6dHJ1ZSwiYXV0aG9yaXphdGlvbkVwb2NoIjo3LCJpYXQiOjEwMDAsIm5iZiI6MTAwMCwiZXhwIjoxMDYwfQ.-KXyra7BGffHXoMvcsPr7lArwRAMOsgJ2YHidcQeEsRGnaXM2BFD9G9O-ri-OtNMVfxk20hcHfVTC1YfpaVLgg'

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64url'))
}

function bytesToBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function readP256S(signature: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(signature.slice(32)).toString('hex')}`)
}

function p1363ToDer(signature: Uint8Array): ArrayBuffer {
  const integer = (value: Uint8Array): Uint8Array => {
    let start = 0
    while (start < value.length - 1 && value[start] === 0) start += 1
    const trimmed = value.slice(start)
    const padded = (trimmed[0] & 0x80) === 0 ? trimmed : Uint8Array.from([0, ...trimmed])
    return Uint8Array.from([0x02, padded.length, ...padded])
  }
  const r = integer(signature.slice(0, 32))
  const s = integer(signature.slice(32))
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]).buffer
}

describe('recovery ES256 signatures', () => {
  it('does not expose a caller-selected verification key from the production crypto module', () => {
    expect('createRecoveryJwsVerifier' in recoveryCrypto).toBe(false)
  })

  it('rejects a status exactly at exp because JWT expiry is exclusive', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    await expect(verifyRecoveryStatusJws(compact, statusPayload.exp)).rejects.toThrowError('RECOVERY_JWS_TIME_INVALID')
  })

  it('keeps the production claim verifier strict after receipt expiry', async () => {
    const compact = await signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    await expect(verifyRecoveryClaimJws(compact, claimPayload.exp + 1))
      .rejects.toThrowError('RECOVERY_JWS_TIME_INVALID')
  })

  it('treats exp as exclusive for authorization, claim, and terminal verification', async () => {
    const testCrypto = await loadTestOnlyCrypto({ publicJwk: TEST_ONLY_PUBLIC_JWK, thumbprint: TEST_ONLY_THUMBPRINT })
    const authorization = await signRecoveryAuthorizationJws(authorizationPayload, TEST_ONLY_PRIVATE_JWK)
    const claim = await signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    const terminal = await signRecoveryTerminalJws(terminalPayload, TEST_ONLY_PRIVATE_JWK)

    await expect(testCrypto.verifyRecoveryAuthorizationJws(authorization, authorizationPayload.exp)).rejects.toThrowError('RECOVERY_JWS_TIME_INVALID')
    await expect(testCrypto.verifyRecoveryClaimJws(claim, claimPayload.exp)).rejects.toThrowError('RECOVERY_JWS_TIME_INVALID')
    await expect(testCrypto.verifyRecoveryTerminalJws(terminal, terminalPayload.exp)).rejects.toThrowError('RECOVERY_JWS_TIME_INVALID')
  })

  it('requires every authorization field to have its approved strict type and target value', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, candidateCommit: 'not-a-commit' }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, artifactId: '001' }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, ptrSingletonOwnerCount: 2 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, observedThrough: authorizationPayload.iat + 1 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects an authorization observation interval that started 121 seconds before issuance even when its end is recent', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, observedFrom: 889, observedThrough: 1_009 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('accepts an authorization observation interval that started exactly 120 seconds before issuance', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, observedFrom: 890, observedThrough: 1_009 }, TEST_ONLY_PRIVATE_JWK))
      .resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
  })

  it('rejects an authorization observation interval whose start follows its end', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, observedFrom: 1_002, observedThrough: 1_001 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects an authorization whose workflow SHA differs from its candidate commit', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, workflowSha: 'b'.repeat(40) }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects an authorization that reuses its Pages run ID as the source Verify run ID', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, sourceVerifyRunId: authorizationPayload.pagesRunId }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects an authorization that identifies G002 and PTR as the same database', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, ptrDatabase: authorizationPayload.genesis002Database }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects an authorization outside the approved recovery source-closure profile', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, sourceClosureProfile: 'attacker-selected-closure' }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('requires every claim and terminal field to have its approved strict type and lifetime relation', async () => {
    await expect(signRecoveryClaimJws({ ...claimPayload, claimDeadline: claimPayload.exp - 1 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryClaimJws({ ...claimPayload, claimedAt: -1 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryClaimJws({ ...claimPayload, authorizationJwsSha256: 'not-a-digest' }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryTerminalJws({ ...terminalPayload, outcome: 'ambiguous' }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryTerminalJws({ ...terminalPayload, exp: terminalPayload.iat + 901 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects a claim deadline that is not exactly 20 minutes after claim time', async () => {
    await expect(signRecoveryClaimJws({ ...claimPayload, claimDeadline: claimPayload.claimedAt + 1_201 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects a claim receipt that reuses its Pages run ID as its source Verify run ID', async () => {
    await expect(signRecoveryClaimJws({ ...claimPayload, sourceVerifyRunId: claimPayload.pagesRunId }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects a terminal attestation that reuses its Pages run ID as its source Verify run ID', async () => {
    await expect(signRecoveryTerminalJws({ ...terminalPayload, sourceVerifyRunId: terminalPayload.pagesRunId }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('accepts the exact 15-minute authorization lifetime and rejects one second over it', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, exp: authorizationPayload.iat + 900 }, TEST_ONLY_PRIVATE_JWK))
      .resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, exp: authorizationPayload.iat + 901 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('accepts the exact 60-second status lifetime and rejects one second over it', async () => {
    await expect(signRecoveryStatusJws({ ...statusPayload, exp: statusPayload.iat + 60 }, TEST_ONLY_PRIVATE_JWK))
      .resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
    await expect(signRecoveryStatusJws({ ...statusPayload, exp: statusPayload.iat + 61 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('accepts the exact 120-second claim lifetime and rejects one second over it', async () => {
    await expect(signRecoveryClaimJws({ ...claimPayload, exp: claimPayload.iat + 120 }, TEST_ONLY_PRIVATE_JWK))
      .resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
    await expect(signRecoveryClaimJws({ ...claimPayload, exp: claimPayload.iat + 121 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('accepts the exact 15-minute terminal lifetime and rejects one second over it', async () => {
    await expect(signRecoveryTerminalJws({ ...terminalPayload, exp: terminalPayload.iat + 900 }, TEST_ONLY_PRIVATE_JWK))
      .resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
    await expect(signRecoveryTerminalJws({ ...terminalPayload, exp: terminalPayload.iat + 901 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects an authorization schema-version substitution', async () => {
    await expect(signRecoveryAuthorizationJws({ ...authorizationPayload, schemaVersion: 2 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects a status schema-version substitution', async () => {
    await expect(signRecoveryStatusJws({ ...statusPayload, schemaVersion: 2 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects a claim schema-version substitution', async () => {
    await expect(signRecoveryClaimJws({ ...claimPayload, schemaVersion: 2 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects a terminal schema-version substitution', async () => {
    await expect(signRecoveryTerminalJws({ ...terminalPayload, schemaVersion: 2 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('rejects zero-duration and negative-time signed objects before they reach a verifier', async () => {
    await expect(signRecoveryStatusJws({ ...statusPayload, exp: statusPayload.iat }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
    await expect(signRecoveryStatusJws({ ...statusPayload, iat: -1, nbf: -1, exp: 1 }, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JWS_PAYLOAD_INVALID')
  })

  it('accepts valid authorization, claim, and terminal payloads through their dedicated signers', async () => {
    await expect(signRecoveryAuthorizationJws(authorizationPayload, TEST_ONLY_PRIVATE_JWK)).resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
    await expect(signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)).resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
    await expect(signRecoveryTerminalJws(terminalPayload, TEST_ONLY_PRIVATE_JWK)).resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/)
  })

  it('verifies valid authorization, claim, and terminal signatures with the test-only pinned-key injection', async () => {
    const testCrypto = await loadTestOnlyCrypto({ publicJwk: TEST_ONLY_PUBLIC_JWK, thumbprint: TEST_ONLY_THUMBPRINT })
    const authorization = await signRecoveryAuthorizationJws(authorizationPayload, TEST_ONLY_PRIVATE_JWK)
    const claim = await signRecoveryClaimJws(claimPayload, TEST_ONLY_PRIVATE_JWK)
    const terminal = await signRecoveryTerminalJws(terminalPayload, TEST_ONLY_PRIVATE_JWK)

    await expect(testCrypto.verifyRecoveryAuthorizationJws(authorization, 1_100)).resolves.toEqual(authorizationPayload)
    await expect(testCrypto.verifyRecoveryClaimJws(claim, 1_030)).resolves.toEqual(claimPayload)
    await expect(testCrypto.verifyRecoveryTerminalJws(terminal, 1_300)).resolves.toEqual(terminalPayload)
  })

  it('converts DER Web Crypto output to the required 64-byte P1363 signature form', async () => {
    const baseline = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const der = p1363ToDer(base64UrlToBytes(baseline.split('.')[2]))
    const signSpy = vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(der)
    try {
      const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
      expect(base64UrlToBytes(compact.split('.')[2])).toHaveLength(64)
    } finally {
      signSpy.mockRestore()
    }
  })

  it('rejects a proxy payload before header construction so it cannot select a protected kid', async () => {
    let kidReads = 0
    const payload = new Proxy({ ...statusPayload }, {
      get(target, key) {
        if (key === 'kid') {
          kidReads += 1
          return kidReads === 1 ? 'attacker-selected' : target.kid
        }
        return Reflect.get(target, key)
      },
    })

    await expect(signRecoveryStatusJws(payload, TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_JSON_INVALID')
  })

  it('rejects non-enumerable JWK metadata, transparent JWK proxies, and noncanonical base64url aliases', async () => {
    const withMetadata = { ...TEST_ONLY_PUBLIC_JWK }
    Object.defineProperty(withMetadata, 'kid', { value: 'extra', enumerable: false })
    const getterProxy = new Proxy(TEST_ONLY_PUBLIC_JWK, {
      get(target, key) {
        return Reflect.get(target, key)
      },
    })
    const alias = { ...TEST_ONLY_PUBLIC_JWK, x: `${TEST_ONLY_PUBLIC_JWK.x!.slice(0, -1)}F` }

    for (const publicJwk of [withMetadata, getterProxy, alias]) {
      const verifier = await loadTestOnlyCrypto({ publicJwk, thumbprint: TEST_ONLY_THUMBPRINT })
      await expect(verifier.verifyRecoveryStatusJws(HAND_DERIVED_TEST_ONLY_STATUS_JWS, 1_030))
        .rejects.toThrowError('RECOVERY_JWS_KEY_INVALID')
    }
  })

  it('passes the signer self-check only for a matching key, using a test-only pinned public-key injection', async () => {
    const testCrypto = await loadTestOnlyCrypto({ publicJwk: TEST_ONLY_PUBLIC_JWK, thumbprint: TEST_ONLY_THUMBPRINT })
    await expect(testCrypto.assertRecoveryPrivateKeyMatchesPinned(TEST_ONLY_PRIVATE_JWK)).resolves.toBeUndefined()
  })
  it('normalizes signatures to low-S so equivalent ES256 signatures do not create another authority', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const signature = base64UrlToBytes(compact.split('.')[2])

    expect(signature).toHaveLength(64)
    expect(readP256S(signature) <= P256_ORDER / 2n).toBe(true)
  })

  it('rejects a high-S variant so signature malleability cannot bypass a single-use record', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const [header, payload, encodedSignature] = compact.split('.')
    const signature = base64UrlToBytes(encodedSignature)
    const highS = P256_ORDER - readP256S(signature)
    const highSBytes = new Uint8Array(signature)
    highSBytes.set(Buffer.from(highS.toString(16).padStart(64, '0'), 'hex'), 32)
    const verifier = await loadTestOnlyCrypto({ publicJwk: TEST_ONLY_PUBLIC_JWK, thumbprint: TEST_ONLY_THUMBPRINT })

    await expect(verifier.verifyRecoveryStatusJws(`${header}.${payload}.${bytesToBase64Url(highSBytes)}`, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')
  })

  it('rejects a signature under another public key so a foreign recovery signer is not trusted', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const verifier = await loadTestOnlyCrypto({ publicJwk: OTHER_TEST_ONLY_PUBLIC_JWK, thumbprint: TEST_ONLY_THUMBPRINT })

    await expect(verifier.verifyRecoveryStatusJws(compact, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')
  })

  it('verifies a hand-derived compact JWS byte-for-byte with a test-injected key', async () => {
    const verifier = await loadTestOnlyCrypto({ publicJwk: TEST_ONLY_PUBLIC_JWK, thumbprint: TEST_ONLY_THUMBPRINT })

    await expect(verifier.verifyRecoveryStatusJws(HAND_DERIVED_TEST_ONLY_STATUS_JWS, 1_030))
      .resolves.toEqual(statusPayload)
  })

  it('rejects a protected header algorithm substitution before signature verification', async () => {
    const compact = await signRecoveryStatusJws(statusPayload, TEST_ONLY_PRIVATE_JWK)
    const [, payload, signature] = compact.split('.')
    const header = bytesToBase64Url(new TextEncoder().encode('{"alg":"none","typ":"warpkeep-0.4.0-recovery-status+jwt","kid":"warpkeep-0.4.0-recovery-2026-09-03-1"}'))
    const verifier = await loadTestOnlyCrypto({ publicJwk: TEST_ONLY_PUBLIC_JWK, thumbprint: TEST_ONLY_THUMBPRINT })

    await expect(verifier.verifyRecoveryStatusJws(`${header}.${payload}.${signature}`, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_HEADER_INVALID')
  })

  it('uses only the pinned production key in the public verifier entrypoint', async () => {
    await expect(verifyRecoveryStatusJws(HAND_DERIVED_TEST_ONLY_STATUS_JWS, 1_030))
      .rejects.toThrowError('RECOVERY_JWS_SIGNATURE_INVALID')
  })

  it('fails a signer startup key check when a test fixture does not match the pinned production public key', async () => {
    await expect(assertRecoveryPrivateKeyMatchesPinned(TEST_ONLY_PRIVATE_JWK))
      .rejects.toThrowError('RECOVERY_SIGNING_KEY_MISMATCH')
  })
})
