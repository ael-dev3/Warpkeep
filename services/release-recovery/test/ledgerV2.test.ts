import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { RecoveryArmingTuple } from '../src/config.js'
import type { RecoveryAuthorizationPayload } from '../src/crypto.js'
import {
  githubEvidenceMetadataSha256,
  type GitHubEvidenceMetadata,
} from '../src/githubEvidenceMetadata.js'
import type { GitHubWorkflowIdentity } from '../src/githubOidc.js'
import {
  RECOVERY_CLAIM_DEADLINE_SECONDS_V2,
  RECOVERY_ISSUING_TIMEOUT_SECONDS_V2,
  RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS_V2,
  applyLedgerV2Event,
  createLedgerV2Control,
  installLedgerV2Arming,
  ledgerV2AlarmDeadline,
  ledgerV2RowBindingDigest,
  readClaimedProjection,
  reconcileLedgerV2Control,
  type LedgerV2AuthorizationSnapshot,
  type LedgerV2ClaimedState,
  type LedgerV2ControlState,
  type LedgerV2Event,
  type LedgerV2IssuedState,
  type LedgerV2IssuingState,
  type RecoveryLedgerRecordV2,
} from '../src/ledgerV2.js'
import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  RECOVERY_AUTHORIZATION_TYP,
  base64UrlEncode,
  serializeExactObject,
} from '../src/protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from '../src/recoveryPublicKey.js'

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const AUTHORIZATION_JTI = '123e4567-e89b-42d3-a456-426614174001'
const OIDC_JTI = '123e4567-e89b-42d3-a456-426614174050'
const CANDIDATE = 'a'.repeat(40)
const CANDIDATE_TREE = 'b'.repeat(40)
const PREPARATION_COMMIT = 'c'.repeat(40)
const PREPARATION_TREE = 'd'.repeat(40)
const G001 = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G002 = '1'.repeat(64)
const PTR = '2'.repeat(64)
const NOW = 10_000
const GITHUB_METADATA_SHA256 = '51367acb7096af207397bf8abdd214bd81ba8db7bb27098d455bce2a5bd8a886'
const CONTRADICTORY_GITHUB_METADATA_SHA256 = '51411025c5494a9c86acb64a31dc794242542ac83eeb1b58f7f798957652e3bf'
const encoder = new TextEncoder()

const githubMetadata: GitHubEvidenceMetadata = {
  repository: 'ael-dev3/Warpkeep',
  repositoryId: '1273513252',
  repositoryOwnerId: '183124839',
  candidateCommit: 'a'.repeat(40),
  candidateTree: 'b'.repeat(40),
  parentCommit: 'c'.repeat(40),
  preparationTree: 'd'.repeat(40),
  artifactId: '123',
  artifactName: 'github-pages-recovery-123-1',
  pagesRunId: '123',
  pagesRunAttempt: '1',
  artifactSize: 1,
  artifactDigest: 'sha256:' + 'f'.repeat(64),
  artifactUrl: 'https://api.github.com/artifact',
  artifactArchiveUrl: 'https://api.github.com/archive',
  artifactNodeId: 'node',
  artifactCreatedAt: '2026-01-01T00:00:00.000Z',
  artifactExpiresAt: '2026-01-02T00:00:00.000Z',
  artifactEtag: 'etag',
  githubArtifactArchiveSha256: 'f'.repeat(64),
}

function arming(overrides: Readonly<Record<string, unknown>> = {}): RecoveryArmingTuple {
  return {
    requestId: REQUEST_ID,
    authorizationMode: 'recovery-authorization-v1',
    recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1',
    recoveryKeyId: RECOVERY_KEY_ID,
    recoveryKeyThumbprint: RECOVERY_KEY_THUMBPRINT,
    authorizationEpoch: 3,
    repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    environment: 'github-pages',
    releaseVersion: '0.4.0',
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
    issuer: 'https://release-auth.warpkeep.com',
    authWorker: 'warpkeep-auth-bridge',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeWorkerVersionId: '123e4567-e89b-42d3-a456-426614174002',
    bridgeSourceCommit: '1'.repeat(40),
    bridgeConfigIdentity: '2'.repeat(64),
    bridgeConfigEpoch: 4,
    preparationCommit: PREPARATION_COMMIT,
    preparationTree: PREPARATION_TREE,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: 'a'.repeat(64),
    recoveryAuthorizationCoreSha256: 'b'.repeat(64),
    pagesDeploymentApproved: true,
    genesis001Database: G001,
    genesis002Database: G002,
    ptrDatabase: PTR,
    g001ExpectedProgramKeccak256: '3'.repeat(64),
    g002ExpectedProgramKeccak256: '4'.repeat(64),
    ptrExpectedProgramKeccak256: '5'.repeat(64),
    g002AtlasId: 'GENESIS_002_GREATER_REALM',
    g002PublicReleaseId: `GRR-${'A'.repeat(26)}`,
    g002PublicApprovalReceiptId: `GRA-${'B'.repeat(26)}`,
    g002AtlasSourceCommit: '6'.repeat(40),
    g002ReleaseSha256: 'a1'.repeat(32),
    g002ReleaseHeaderSha256: 'a2'.repeat(32),
    g002VerificationDigest: 'a3'.repeat(32),
    ptrAtlasId: 'PTR_GREATER_REALM',
    ptrPublicReleaseId: `GRR-${'C'.repeat(26)}`,
    ptrPublicApprovalReceiptId: `GRA-${'D'.repeat(26)}`,
    ptrAtlasSourceCommit: '7'.repeat(40),
    ptrExpectedReleaseSha256: 'b1'.repeat(32),
    ptrReleaseHeaderSha256: 'b2'.repeat(32),
    ptrVerificationDigest: 'b3'.repeat(32),
    bindingPath: 'config/releases/0.4.0-sealed-launch.json',
    workflowPath: '.github/workflows/deploy-pages.yml',
    ...overrides,
  } as RecoveryArmingTuple
}

function identity(overrides: Partial<GitHubWorkflowIdentity> = {}): GitHubWorkflowIdentity {
  return {
    repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    environment: 'github-pages',
    eventName: 'workflow_run',
    workflowSha: CANDIDATE,
    pagesRunId: '123',
    pagesRunAttempt: '1',
    checkRunId: '999',
    oidcJti: OIDC_JTI,
    ...overrides,
  }
}

function locators(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    requestId: REQUEST_ID,
    candidateCommit: CANDIDATE,
    sourceVerifyRunId: '456',
    sourceVerifyRunAttempt: '2',
    artifactId: '123',
    ...overrides,
  }
}

function payload(overrides: Readonly<Record<string, unknown>> = {}): RecoveryAuthorizationPayload {
  return {
    schemaVersion: 1,
    profile: 'warpkeep-0.4.0-recovery-authorization-v1',
    iss: 'https://release-auth.warpkeep.com',
    aud: 'warpkeep-0.4.0-sealed-launch',
    sub: 'warpkeep-0.4.0-recovery-deployment',
    kid: RECOVERY_KEY_ID,
    requestId: REQUEST_ID,
    jti: AUTHORIZATION_JTI,
    authorizationEpoch: 3,
    repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    workflowSha: CANDIDATE,
    environment: 'github-pages',
    eventName: 'workflow_run',
    pagesRunId: '123',
    pagesRunAttempt: '1',
    sourceVerifyRunId: '456',
    sourceVerifyRunAttempt: '2',
    predecessorCommit: PREPARATION_COMMIT,
    candidateCommit: CANDIDATE,
    candidateTree: CANDIDATE_TREE,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: 'a'.repeat(64),
    recoveryAuthorizationCoreSha256: 'b'.repeat(64),
    artifactId: '123',
    artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: 'f'.repeat(64),
    innerArtifactTarSha256: 'd'.repeat(64),
    contentManifestSha256: 'e'.repeat(64),
    deploymentAttestationSha256: 'f'.repeat(64),
    releaseVersion: '0.4.0',
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
    authWorker: 'warpkeep-auth-bridge',
    genesis001Database: G001,
    genesis002Database: G002,
    ptrDatabase: PTR,
    historicalGenesis001ReceiptStatus: 'unavailable',
    historicalGenesis001ReceiptExpectedSha256: '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63',
    g001ReleaseVersion: '0.3.43',
    g001PlayerAccessEnabled: true,
    g001AdmissionStateMutationsEnabled: false,
    g001AccessRequestSubmissionsEnabled: false,
    g001BaselineAbiSha256: '3'.repeat(64),
    g002Sealed: true,
    g002PlayerCount: 0,
    g002GeneralAdmissionCount: 0,
    ptrSingletonOwnerCount: 1,
    ptrGeneralAdmissionCount: 0,
    observedFrom: NOW - 20,
    observedThrough: NOW - 1,
    issuanceEvidenceSnapshotDigest: '4'.repeat(64),
    liveInvariantDigest: '5'.repeat(64),
    iat: NOW,
    nbf: NOW,
    exp: NOW + 900,
    ...overrides,
  } as RecoveryAuthorizationPayload
}

function authorization(
  overrides: Readonly<Record<string, unknown>> = {},
): LedgerV2AuthorizationSnapshot {
  return {
    locators: locators(),
    workflowIdentity: {
      repository: 'ael-dev3/Warpkeep',
      repositoryId: '1273513252',
      repositoryOwnerId: '183124839',
      ref: 'refs/heads/main',
      workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
      environment: 'github-pages',
      eventName: 'workflow_run',
      workflowSha: CANDIDATE,
      pagesRunId: '123',
      pagesRunAttempt: '1',
      checkRunId: '999',
    },
    authorizationJti: AUTHORIZATION_JTI,
    authorizationEpoch: 3,
    issuedAt: NOW,
    notBefore: NOW,
    expiresAt: NOW + 900,
    issuanceEvidenceSnapshotDigest: '4'.repeat(64),
    liveInvariantDigest: '5'.repeat(64),
    candidateTree: CANDIDATE_TREE,
    artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: 'f'.repeat(64),
    innerArtifactTarSha256: 'd'.repeat(64),
    contentManifestSha256: 'e'.repeat(64),
    deploymentAttestationSha256: 'f'.repeat(64),
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
    githubMetadata,
    githubMetadataSha256: GITHUB_METADATA_SHA256,
    ...overrides,
  } as LedgerV2AuthorizationSnapshot
}

function compactAuthorizationJws(value: RecoveryAuthorizationPayload): string {
  const protectedBytes = serializeExactObject(['alg', 'typ', 'kid'] as const, {
    alg: 'ES256',
    typ: RECOVERY_AUTHORIZATION_TYP,
    kid: RECOVERY_KEY_ID,
  })
  const payloadBytes = serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, value)
  return [
    base64UrlEncode(protectedBytes),
    base64UrlEncode(payloadBytes),
    base64UrlEncode(new Uint8Array(64).fill(1)),
  ].join('.')
}

function rawSha256(value: string): string {
  return createHash('sha256').update(encoder.encode(value)).digest('hex')
}

const JWS = compactAuthorizationJws(payload())
const JWS_SHA256 = rawSha256(JWS)

function enabledControl(tuple = arming()): LedgerV2ControlState {
  return reconcileLedgerV2Control(
    createLedgerV2Control({ authorizationEpoch: tuple.authorizationEpoch }),
    { enabled: true, authorizationEpoch: tuple.authorizationEpoch, arming: tuple },
  )
}

function armed(tuple = arming(), control = enabledControl(tuple)) {
  return installLedgerV2Arming(undefined, { arming: tuple, control })
}

function reserveEvent(
  control = enabledControl(),
  overrides: Readonly<Record<string, unknown>> = {},
): LedgerV2Event {
  return {
    type: 'reserve-issue',
    control,
    locators: locators(),
    identity: identity(),
    payload: payload(),
    githubMetadata,
    githubMetadataSha256: GITHUB_METADATA_SHA256,
    now: NOW,
    ...overrides,
  } as LedgerV2Event
}

async function issuing() {
  const control = enabledControl()
  const record = await applyLedgerV2Event(armed(arming(), control), reserveEvent(control))
  if (record.state !== 'issuing') throw new Error('expected issuing fixture')
  return { control, record: record as LedgerV2IssuingState }
}

function finalizeEvent(
  control: LedgerV2ControlState,
  overrides: Readonly<Record<string, unknown>> = {},
): LedgerV2Event {
  return {
    type: 'finalize-issue',
    control,
    locators: locators(),
    identity: identity(),
    authorizationJws: JWS,
    authorizationJwsSha256: JWS_SHA256,
    now: NOW + 1,
    ...overrides,
  } as LedgerV2Event
}

async function issued() {
  const reserved = await issuing()
  const record = await applyLedgerV2Event(reserved.record, finalizeEvent(reserved.control))
  if (record.state !== 'issued') throw new Error('expected issued fixture')
  return { control: reserved.control, record: record as LedgerV2IssuedState }
}

function claimEvent(
  control: LedgerV2ControlState,
  overrides: Readonly<Record<string, unknown>> = {},
): LedgerV2Event {
  return {
    type: 'claim',
    control,
    locators: locators(),
    identity: identity(),
    authorizationJws: JWS,
    liveInvariantDigest: '5'.repeat(64),
    claimSnapshotDigest: '7'.repeat(64),
    now: NOW + 2,
    ...overrides,
  } as LedgerV2Event
}

async function claimed() {
  const value = await issued()
  const record = await applyLedgerV2Event(value.record, claimEvent(value.control))
  if (record.state !== 'claimed') throw new Error('expected claimed fixture')
  return { control: value.control, record: record as LedgerV2ClaimedState }
}

function completedProof(
  record: RecoveryLedgerRecordV2,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    outcome: 'completed',
    rowBindingDigest: ledgerV2RowBindingDigest(record),
    deployStepConclusion: 'success',
    matchingPagesDeployment: true,
    deploymentAttestationMatches: true,
    ...overrides,
  } as const
}

function notDeployedProof(
  record: RecoveryLedgerRecordV2,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    outcome: 'not-deployed',
    rowBindingDigest: ledgerV2RowBindingDigest(record),
    authoritativeTerminalRun: true,
    pagesDeployStepStarted: false,
    matchingPagesDeploymentAbsent: true,
    ...overrides,
  } as const
}

describe('recovery ledger v2 metadata binding', () => {
  it('rejects a caller-supplied GitHub metadata commitment that does not match the exact snapshot', async () => {
    await expect(applyLedgerV2Event(armed(), reserveEvent(enabledControl(), {
      githubMetadataSha256: '0'.repeat(64),
    }))).rejects.toThrow('RECOVERY_GITHUB_EVIDENCE_INVALID')
  })

  it('rejects committed metadata whose artifact digest contradicts its archive SHA-256', async () => {
    const control = enabledControl()
    const state = armed(arming(), control)
    const contradictoryMetadata = {
      ...githubMetadata,
      artifactDigest: 'sha256:' + 'e'.repeat(64),
    }
    await expect(applyLedgerV2Event(state, reserveEvent(control, {
      githubMetadata: contradictoryMetadata,
      githubMetadataSha256: CONTRADICTORY_GITHUB_METADATA_SHA256,
    }))).rejects.toThrow('RECOVERY_GITHUB_EVIDENCE_INVALID')
    expect(state).toMatchObject({ state: 'armed', revision: 0, lastTransitionAt: null })
  })

  it('binds every duplicated GitHub coordinate to the request, workflow, payload, and metadata snapshots', async () => {
    const control = enabledControl()
    const state = armed(arming(), control)
    for (const changedEvent of [
      { locators: locators({ candidateCommit: '9'.repeat(40) }) },
      { locators: locators({ artifactId: '124' }) },
      { identity: identity({ pagesRunAttempt: '2' }) },
      { payload: payload({ githubArtifactArchiveSha256: '8'.repeat(64) }) },
    ]) {
      await expect(applyLedgerV2Event(state, reserveEvent(control, {
        ...changedEvent,
      }))).rejects.toThrow()
    }

    const mutatedMetadata = { ...githubMetadata, artifactSize: 2 }
    await expect(applyLedgerV2Event(state, reserveEvent(control, {
      githubMetadata: mutatedMetadata,
    }))).rejects.toThrow('RECOVERY_GITHUB_EVIDENCE_INVALID')
  })

  it('changes the v2 row binding when canonical metadata or another claimed-row coordinate changes', async () => {
    const value = await claimed()
    const originalDigest = ledgerV2RowBindingDigest(value.record)
    expect(originalDigest).toMatch(/^[0-9a-f]{64}$/)

    const changedMetadata = { ...githubMetadata, artifactSize: 2 }
    const changedMetadataRecord = {
      ...value.record,
      authorization: { ...value.record.authorization, githubMetadata: changedMetadata },
    } as RecoveryLedgerRecordV2
    expect(ledgerV2RowBindingDigest(changedMetadataRecord)).not.toBe(originalDigest)

    const changedMetadataDigestRecord = {
      ...value.record,
      authorization: { ...value.record.authorization, githubMetadataSha256: '0'.repeat(64) },
    } as RecoveryLedgerRecordV2
    expect(ledgerV2RowBindingDigest(changedMetadataDigestRecord)).not.toBe(originalDigest)

    const changedLocatorRecord = {
      ...value.record,
      authorization: {
        ...value.record.authorization,
        locators: { ...value.record.authorization.locators, sourceVerifyRunAttempt: '3' },
      },
    } as RecoveryLedgerRecordV2
    expect(ledgerV2RowBindingDigest(changedLocatorRecord)).not.toBe(originalDigest)
  })
})

describe('recovery ledger v2 lifecycle and signer projection', () => {
  it('rejects reserve retries with altered committed metadata, its hash, or the payload', async () => {
    const value = await issuing()
    const changedMetadata = { ...githubMetadata, artifactSize: 2 }
    const changedMetadataSha256 = await githubEvidenceMetadataSha256(changedMetadata)

    await expect(applyLedgerV2Event(value.record, reserveEvent(value.control, {
      githubMetadata: changedMetadata,
      githubMetadataSha256: changedMetadataSha256,
    }))).rejects.toThrow('RECOVERY_LEDGER_ISSUE_MISMATCH')
    await expect(applyLedgerV2Event(value.record, reserveEvent(value.control, {
      githubMetadataSha256: '0'.repeat(64),
    }))).rejects.toThrow('RECOVERY_GITHUB_EVIDENCE_INVALID')
    await expect(applyLedgerV2Event(value.record, reserveEvent(value.control, {
      payload: payload({ jti: '123e4567-e89b-42d3-a456-426614174097' }),
    }))).rejects.toThrow('RECOVERY_LEDGER_ISSUE_MISMATCH')
  })

  it('denies reservation and claim after the matching control is disabled or epoch-cancelled', async () => {
    const control = enabledControl()
    const state = armed(arming(), control)
    const disabled = reconcileLedgerV2Control(control, {
      enabled: false,
      authorizationEpoch: control.authorizationEpoch,
    })
    const cancelled = reconcileLedgerV2Control(control, {
      enabled: false,
      authorizationEpoch: control.authorizationEpoch + 1,
    })

    await expect(applyLedgerV2Event(state, reserveEvent(disabled)))
      .rejects.toThrow('RECOVERY_LEDGER_CONTROL_DISABLED')
    await expect(applyLedgerV2Event(state, reserveEvent(cancelled)))
      .rejects.toThrow('RECOVERY_LEDGER_CONTROL_DISABLED')
    expect(state).toMatchObject({ state: 'armed', revision: 0 })

    const issuance = await issued()
    await expect(applyLedgerV2Event(issuance.record, claimEvent(disabled)))
      .rejects.toThrow('RECOVERY_LEDGER_CONTROL_DISABLED')
  })

  it('enforces the exact issuing, authorization, and claim deadline boundaries', async () => {
    const reservation = await issuing()
    await expect(applyLedgerV2Event(reservation.record, { type: 'alarm', now: NOW + 119 }))
      .rejects.toThrow('RECOVERY_LEDGER_ALARM_NOT_DUE')
    await expect(applyLedgerV2Event(reservation.record, { type: 'alarm', now: NOW + 120 }))
      .resolves.toMatchObject({
        state: 'expired-unused',
        expiredAt: NOW + RECOVERY_ISSUING_TIMEOUT_SECONDS_V2,
        expirationSource: 'issuing',
      })

    const issuance = await issued()
    await expect(applyLedgerV2Event(issuance.record, claimEvent(issuance.control, {
      now: NOW + 899,
    }))).resolves.toMatchObject({ state: 'claimed' })
    const expired = await applyLedgerV2Event(issuance.record, claimEvent(issuance.control, {
      now: NOW + 900,
    }))
    expect(expired).toMatchObject({
      state: 'expired-unused', expiredAt: NOW + 900, expirationSource: 'issued',
    })
    expect(JSON.stringify(expired)).not.toContain(JWS)

    const consumption = await claimed()
    const claimDeadline = NOW + 2 + RECOVERY_CLAIM_DEADLINE_SECONDS_V2
    await expect(applyLedgerV2Event(consumption.record, {
      type: 'complete', proof: completedProof(consumption.record), now: claimDeadline,
    })).rejects.toThrow('RECOVERY_LEDGER_CLAIM_DEADLINE_REACHED')
    await expect(applyLedgerV2Event(consumption.record, {
      type: 'alarm', now: claimDeadline - 1,
    })).rejects.toThrow('RECOVERY_LEDGER_ALARM_NOT_DUE')
    await expect(applyLedgerV2Event(consumption.record, {
      type: 'alarm', now: claimDeadline,
    })).resolves.toMatchObject({
      state: 'reconciliation-required',
      reconciliationAttempts: 0,
      nextReconcileAt: claimDeadline,
    })
  })

  it('rejects malformed, payload-substituted, digest-substituted, and claim-substituted JWS input', async () => {
    const reservation = await issuing()
    const malformedJws = 'header.payload.signature'
    await expect(applyLedgerV2Event(reservation.record, finalizeEvent(reservation.control, {
      authorizationJws: malformedJws,
      authorizationJwsSha256: rawSha256(malformedJws),
    }))).rejects.toThrow('RECOVERY_LEDGER_JWS_INVALID')

    const substitutedPayloadJws = compactAuthorizationJws(payload({ candidateTree: '9'.repeat(40) }))
    await expect(applyLedgerV2Event(reservation.record, finalizeEvent(reservation.control, {
      authorizationJws: substitutedPayloadJws,
      authorizationJwsSha256: rawSha256(substitutedPayloadJws),
    }))).rejects.toThrow('RECOVERY_LEDGER_JWS_PAYLOAD_MISMATCH')
    await expect(applyLedgerV2Event(reservation.record, finalizeEvent(reservation.control, {
      authorizationJwsSha256: '6'.repeat(64),
    }))).rejects.toThrow('RECOVERY_LEDGER_JWS_DIGEST_MISMATCH')

    const issuance = await issued()
    await expect(applyLedgerV2Event(issuance.record, claimEvent(issuance.control, {
      authorizationJws: 'wrong',
    }))).rejects.toThrow('RECOVERY_LEDGER_JWS_MISMATCH')
  })

  it('rejects completion and not-deployed proofs carrying another claimed row digest', async () => {
    const first = await claimed()
    const secondIssuance = await issued()
    const second = await applyLedgerV2Event(
      secondIssuance.record,
      claimEvent(secondIssuance.control, { claimSnapshotDigest: '8'.repeat(64) }),
    )
    const secondDigest = ledgerV2RowBindingDigest(second)
    expect(secondDigest).not.toBe(ledgerV2RowBindingDigest(first.record))

    await expect(applyLedgerV2Event(first.record, {
      type: 'complete',
      proof: completedProof(first.record, { rowBindingDigest: secondDigest }),
      now: NOW + 3,
    })).rejects.toThrow('RECOVERY_LEDGER_ROW_BINDING_MISMATCH')

    const deadline = ledgerV2AlarmDeadline(first.record) as number
    const reconciling = await applyLedgerV2Event(first.record, { type: 'alarm', now: deadline })
    await expect(applyLedgerV2Event(reconciling, {
      type: 'reconcile',
      proof: notDeployedProof(reconciling, { rowBindingDigest: secondDigest }),
      now: deadline,
    })).rejects.toThrow('RECOVERY_LEDGER_ROW_BINDING_MISMATCH')
  })

  it('rejects early reconciliation and refuses retries after the bounded schedule is exhausted', async () => {
    const value = await claimed()
    const deadline = ledgerV2AlarmDeadline(value.record) as number
    let record = await applyLedgerV2Event(value.record, { type: 'alarm', now: deadline })
    record = await applyLedgerV2Event(record, {
      type: 'reconcile', proof: { outcome: 'ambiguous' }, now: deadline,
    })
    await expect(applyLedgerV2Event(record, {
      type: 'reconcile', proof: { outcome: 'ambiguous' }, now: deadline + 59,
    })).rejects.toThrow('RECOVERY_LEDGER_RECONCILIATION_NOT_DUE')

    for (let index = 0; index < RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS_V2.length; index += 1) {
      record = await applyLedgerV2Event(record, {
        type: 'reconcile',
        proof: { outcome: 'ambiguous' },
        now: ledgerV2AlarmDeadline(record) as number,
      })
    }
    expect(record).toMatchObject({
      state: 'reconciliation-required', reconciliationAttempts: 5, nextReconcileAt: null,
    })
    await expect(applyLedgerV2Event(record, {
      type: 'reconcile', proof: { outcome: 'ambiguous' }, now: record.lastTransitionAt! + 1,
    })).rejects.toThrow('RECOVERY_LEDGER_RECONCILIATION_EXHAUSTED')
  })

  it('preserves v1 control, issue, and fixed-deadline state transitions under v2-only names', async () => {
    const control = enabledControl()
    const installed = armed(arming(), control)
    const reserved = await applyLedgerV2Event(installed, reserveEvent(control))
    expect(reserved).toMatchObject({
      state: 'issuing',
      revision: 1,
      issuingDeadline: NOW + RECOVERY_ISSUING_TIMEOUT_SECONDS_V2,
      authorization: { githubMetadata, githubMetadataSha256: GITHUB_METADATA_SHA256 },
    })
    if (reserved.state !== 'issuing') throw new Error('expected issuing state')
    expect(reserved.authorization).toEqual(authorization())
    expect(ledgerV2RowBindingDigest(reserved)).toMatch(/^[0-9a-f]{64}$/)
    expect(ledgerV2AlarmDeadline(reserved)).toBe(NOW + RECOVERY_ISSUING_TIMEOUT_SECONDS_V2)

    const finalized = await applyLedgerV2Event(reserved, finalizeEvent(control))
    expect(finalized).toMatchObject({ state: 'issued', revision: 2, authorizationJws: JWS })
    expect(ledgerV2AlarmDeadline(finalized)).toBe(NOW + 900)

    const consumed = await applyLedgerV2Event(finalized, claimEvent(control))
    expect(consumed).toMatchObject({
      state: 'claimed',
      revision: 3,
      claim: {
        claimSequence: 1,
        claimedAt: NOW + 2,
        claimDeadline: NOW + 2 + RECOVERY_CLAIM_DEADLINE_SECONDS_V2,
      },
    })
    expect(JSON.stringify(consumed)).not.toContain(JWS)

    const completed = await applyLedgerV2Event(consumed, {
      type: 'complete',
      proof: completedProof(consumed),
      now: NOW + 3,
    })
    expect(completed).toMatchObject({
      state: 'completed', outcome: 'completed', completedAt: NOW + 3, revision: 4,
    })
  })

  it('deletes the raw authorization JWS when an unclaimed row expires', async () => {
    const value = await issued()
    const expired = await applyLedgerV2Event(value.record, { type: 'alarm', now: NOW + 900 })
    expect(expired).toMatchObject({
      state: 'expired-unused',
      authorizationJwsSha256: JWS_SHA256,
      expirationSource: 'issued',
    })
    expect(JSON.stringify(expired)).not.toContain(JWS)
    expect(ledgerV2AlarmDeadline(expired)).toBeNull()
  })

  it('projects only claimed state, immutable authorization evidence, binding, and terminal outcome', async () => {
    const value = await claimed()
    const claimedProjection = readClaimedProjection(value.record)
    expect(claimedProjection).toEqual({
      state: 'claimed',
      requestId: REQUEST_ID,
      authorization: value.record.authorization,
      authorizationJwsSha256: JWS_SHA256,
      claim: value.record.claim,
      rowBindingDigest: ledgerV2RowBindingDigest(value.record),
      revision: 3,
    })
    expect('authorizationJws' in claimedProjection).toBe(false)
    expect('arming' in claimedProjection).toBe(false)
    expect(JSON.stringify(claimedProjection)).not.toContain(JWS)

    const taintedProjection = readClaimedProjection({
      ...value.record,
      authorizationJws: JWS,
    } as never)
    expect('authorizationJws' in taintedProjection).toBe(false)
    expect(JSON.stringify(taintedProjection)).not.toContain(JWS)

    const completed = await applyLedgerV2Event(value.record, {
      type: 'complete', proof: completedProof(value.record), now: NOW + 3,
    })
    expect(readClaimedProjection(completed)).toMatchObject({
      state: 'completed',
      terminal: { outcome: 'completed', completedAt: NOW + 3 },
    })

    await expect(issuing()).resolves.toEqual(expect.any(Object))
    const unclaimed = await issuing()
    expect(() => readClaimedProjection(unclaimed.record))
      .toThrow('RECOVERY_LEDGER_PROJECTION_UNAVAILABLE')
  })

  it('keeps the v1 reconciliation cadence and projects both reconciliation and not-deployed states', async () => {
    const value = await claimed()
    const claimDeadline = ledgerV2AlarmDeadline(value.record) as number
    let record = await applyLedgerV2Event(value.record, { type: 'alarm', now: claimDeadline })
    expect(readClaimedProjection(record)).toMatchObject({
      state: 'reconciliation-required', revision: 4,
    })

    const scheduled: number[] = []
    for (const delay of RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS_V2) {
      const now = ledgerV2AlarmDeadline(record) as number
      record = await applyLedgerV2Event(record, {
        type: 'reconcile', proof: { outcome: 'ambiguous' }, now,
      })
      scheduled.push((ledgerV2AlarmDeadline(record) as number) - now)
      expect(scheduled.at(-1)).toBe(delay)
    }
    expect(scheduled).toEqual([...RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS_V2])

    const finalRetryAt = ledgerV2AlarmDeadline(record) as number
    record = await applyLedgerV2Event(record, {
      type: 'reconcile', proof: notDeployedProof(record), now: finalRetryAt,
    })
    expect(readClaimedProjection(record)).toMatchObject({
      state: 'not-deployed',
      terminal: { outcome: 'not-deployed', completedAt: finalRetryAt },
    })
  })
})
