import { env } from 'cloudflare:workers'
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RecoveryArmingTuple } from '../src/config.js'
import type { RecoveryAuthorizationPayload } from '../src/crypto.js'
import {
  githubEvidenceMetadataSha256,
  type GitHubEvidenceMetadata,
} from '../src/githubEvidenceMetadata.js'
import type { GitHubWorkflowIdentity } from '../src/githubOidc.js'
import {
  type LedgerSignerClaimProjection,
  type LedgerV2ControlState,
  type LedgerV2ReconciliationProof,
} from '../src/ledgerV2.js'
import { ReleaseRecoveryAuthorizationLedgerV2 } from '../src/ledgerDurableObjectV2.js'
import type { DeploymentReconciliationProofReader } from '../src/reconciliationEvidence.js'
import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  RECOVERY_AUTHORIZATION_TYP,
  base64UrlEncode,
  serializeExactObject,
} from '../src/protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from '../src/recoveryPublicKey.js'

// With multiple RPC-capable Durable Object namespaces, TypeScript 7 widens
// the pool helper's legacy union constraint instead of inferring the instance
// from the supplied typed stub. This narrower overload preserves that type.
declare module 'cloudflare:test' {
  function runInDurableObject<
    ObjectType extends CloudflareWorkersModule.DurableObject<unknown, unknown>,
    Result,
  >(
    stub: DurableObjectStub<ObjectType>,
    callback: (instance: ObjectType, state: DurableObjectState) => Result | Promise<Result>,
  ): Promise<Result>
}

const CONTROL_NAME_V1 = 'warpkeep-release-recovery-control-v1'
const CONTROL_NAME_V2 = 'warpkeep-release-recovery-control-v2'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_REQUEST_ID = '123e4567-e89b-42d3-a456-426614174099'
const AUTHORIZATION_JTI = '123e4567-e89b-42d3-a456-426614174001'
const CANDIDATE = 'd'.repeat(40)
const CANDIDATE_TREE = 'e'.repeat(40)
const PREPARATION_COMMIT = 'b'.repeat(40)
const PREPARATION_TREE = 'c'.repeat(40)
const ARCHIVE_SHA256 = 'c'.repeat(64)
const NOW = Math.floor(Date.now() / 1_000) + 3_600
const encoder = new TextEncoder()

function arming(overrides: Partial<RecoveryArmingTuple> = {}): RecoveryArmingTuple {
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
    genesis001Database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    genesis002Database: '1'.repeat(64),
    ptrDatabase: '2'.repeat(64),
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
  }
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
    oidcJti: '123e4567-e89b-42d3-a456-426614174050',
    ...overrides,
  }
}

function locators(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    requestId: REQUEST_ID,
    candidateCommit: CANDIDATE,
    sourceVerifyRunId: '456',
    sourceVerifyRunAttempt: '2',
    artifactId: '789',
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
    artifactId: '789',
    artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: ARCHIVE_SHA256,
    innerArtifactTarSha256: 'd'.repeat(64),
    contentManifestSha256: 'e'.repeat(64),
    deploymentAttestationSha256: 'f'.repeat(64),
    releaseVersion: '0.4.0',
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
    authWorker: 'warpkeep-auth-bridge',
    genesis001Database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    genesis002Database: '1'.repeat(64),
    ptrDatabase: '2'.repeat(64),
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

const githubMetadata: GitHubEvidenceMetadata = {
  repository: 'ael-dev3/Warpkeep',
  repositoryId: '1273513252',
  repositoryOwnerId: '183124839',
  candidateCommit: CANDIDATE,
  candidateTree: CANDIDATE_TREE,
  parentCommit: PREPARATION_COMMIT,
  preparationTree: PREPARATION_TREE,
  artifactId: '789',
  artifactName: 'github-pages-recovery-123-1',
  pagesRunId: '123',
  pagesRunAttempt: '1',
  artifactSize: 1234,
  artifactDigest: `sha256:${ARCHIVE_SHA256}`,
  artifactUrl: 'https://api.github.test/artifacts/789',
  artifactArchiveUrl: 'https://api.github.test/artifacts/789/archive',
  artifactNodeId: 'synthetic-node-id',
  artifactCreatedAt: '2026-09-04T00:00:00.000Z',
  artifactExpiresAt: '2026-09-05T00:00:00.000Z',
  artifactEtag: 'synthetic-etag',
  githubArtifactArchiveSha256: ARCHIVE_SHA256,
}

function compactAuthorizationJws(value: RecoveryAuthorizationPayload): string {
  return [
    base64UrlEncode(serializeExactObject(['alg', 'typ', 'kid'] as const, {
      alg: 'ES256', typ: RECOVERY_AUTHORIZATION_TYP, kid: RECOVERY_KEY_ID,
    })),
    base64UrlEncode(serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, value)),
    base64UrlEncode(new Uint8Array(64).fill(1)),
  ].join('.')
}

function rawSha256(value: string): string {
  return bytesToHex(sha256(encoder.encode(value)))
}

async function enableAndInstall(tuple = arming()) {
  const controlStub = env.RECOVERY_LEDGER_V2.getByName(CONTROL_NAME_V2)
  await controlStub.reconcileControl({ enabled: false, authorizationEpoch: tuple.authorizationEpoch })
  const control = await controlStub.reconcileControl({
    enabled: true,
    authorizationEpoch: tuple.authorizationEpoch,
    arming: tuple,
  })
  const request = env.RECOVERY_LEDGER_V2.getByName(tuple.requestId)
  await request.installArming({ arming: tuple, control })
  return { control, request }
}

async function reserveInput(control: LedgerV2ControlState) {
  return {
    control,
    locators: locators(),
    identity: identity(),
    payload: payload(),
    githubMetadata,
    githubMetadataSha256: await githubEvidenceMetadataSha256(githubMetadata),
    now: NOW,
  }
}

async function issueUnclaimed() {
  const { control, request } = await enableAndInstall()
  await request.reserveIssue(await reserveInput(control))
  const authorizationJws = compactAuthorizationJws(payload())
  await request.finalizeIssue({
    control,
    locators: locators(),
    identity: identity(),
    authorizationJws,
    authorizationJwsSha256: rawSha256(authorizationJws),
    now: NOW + 1,
  })
  return { control, request, authorizationJws }
}

async function issueAndClaim() {
  const { control, request, authorizationJws } = await issueUnclaimed()
  await request.claim({
    control,
    locators: locators(),
    identity: identity(),
    authorizationJws,
    liveInvariantDigest: '5'.repeat(64),
    claimSnapshotDigest: '6'.repeat(64),
    now: NOW + 2,
  })
  return { control, request, authorizationJws }
}

async function runAlarmWithReader(
  request: ReturnType<typeof env.RECOVERY_LEDGER_V2.getByName>,
  reader: DeploymentReconciliationProofReader,
): Promise<void> {
  await runInDurableObject(request, async (_instance, state) => {
    const injected = new ReleaseRecoveryAuthorizationLedgerV2(
      state,
      { RECOVERY_LEDGER_V2: env.RECOVERY_LEDGER_V2 },
      () => reader,
    )
    await injected.alarm()
  })
}

async function corruptIssuedRecord(
  request: ReturnType<typeof env.RECOVERY_LEDGER_V2.getByName>,
  mutate: (record: Record<string, unknown>) => void,
): Promise<void> {
  await runInDurableObject(request, async (_instance, state) => {
    const row = state.storage.sql.exec<{ record_json: string }>(
      'SELECT record_json FROM recovery_v2_authorization WHERE singleton_key = 1',
    ).one()
    const record = JSON.parse(row.record_json) as Record<string, unknown>
    mutate(record)
    state.storage.sql.exec('DROP TRIGGER recovery_v2_authorization_transition_guard').toArray()
    state.storage.sql.exec(
      'UPDATE recovery_v2_authorization SET record_json = ? WHERE singleton_key = 1',
      JSON.stringify(record),
    ).toArray()
  })
}

afterEach(async () => {
  vi.useRealTimers()
  await reset()
})

describe('ReleaseRecoveryAuthorizationLedgerV2 Workerd adapter', () => {
  it('preserves exact V4 adoption arming across real control and request eviction', async () => {
    const tuple = arming({ requestId: OTHER_REQUEST_ID, ptrStateEvidenceProfile: 'warpkeep-ptr-existing-state-adoption-v1',
      ptrExistingStateAdoptionReceiptDigest: 'b'.repeat(64), ptrExpectedSealedStateHmacSha256: 'e'.repeat(64),
      ptrExpectedOwnerInvariantHmacSha256: 'f'.repeat(64) })
    const { control, request } = await enableAndInstall(tuple)
    const controlStub = env.RECOVERY_LEDGER_V2.getByName(CONTROL_NAME_V2)
    const retained = await runInDurableObject(request, async (_instance, state) => {
      const row = state.storage.sql.exec<{ arming_json: string }>(
        'SELECT arming_json FROM recovery_v2_authorization_arming WHERE singleton_key = 1',
      ).one()
      return JSON.parse(row.arming_json)
    })
    expect(retained).toEqual(tuple)
    await evictDurableObject(request)
    await evictDurableObject(controlStub)
    await expect(controlStub.reconcileControl({ enabled: true, authorizationEpoch: tuple.authorizationEpoch,
      arming: tuple })).resolves.toMatchObject({ activeArming: tuple })
    await expect(request.installArming({ arming: tuple, control })).resolves.toMatchObject({ arming: tuple })
    for (const key of ['ptrExistingStateAdoptionReceiptDigest', 'ptrExpectedSealedStateHmacSha256',
      'ptrExpectedOwnerInvariantHmacSha256']) {
      const changed = { ...tuple, [key]: '1'.repeat(64) }
      await expect(runInDurableObject(controlStub, instance => instance.reconcileControl({ enabled: true,
        authorizationEpoch: tuple.authorizationEpoch, arming: changed }))).rejects.toThrow('RECOVERY_LEDGER_ARMING_CONFLICT')
      await expect(runInDurableObject(request, instance => instance.installArming({ arming: changed, control }))).rejects.toThrow()
    }
  })

  it('keeps the V1 and V2 bindings, control objects, and SQLite namespaces isolated', async () => {
    expect(env.RECOVERY_LEDGER).toBeDefined()
    expect(env.RECOVERY_LEDGER_V2).toBeDefined()

    const v1 = env.RECOVERY_LEDGER.getByName(CONTROL_NAME_V1)
    const v2 = env.RECOVERY_LEDGER_V2.getByName(CONTROL_NAME_V2)
    await v1.reconcileControl({ enabled: false, authorizationEpoch: 7 })

    await expect(v2.status()).resolves.toEqual({ role: 'control', control: null })
    const tables = await runInDurableObject(v2, async (_instance, state) => (
      state.storage.sql.exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'recovery_%' ORDER BY name",
      ).toArray().map(({ name }) => name)
    ))
    expect(tables).toEqual([
      'recovery_v2_authorization',
      'recovery_v2_authorization_arming',
      'recovery_v2_authorization_binding',
      'recovery_v2_authorization_payload',
      'recovery_v2_claim_binding',
      'recovery_v2_control',
      'recovery_v2_preparation_intents',
    ])
    expect(tables).not.toContain('recovery_authorization')
    const v1Tables = await runInDurableObject(v1, async (_instance, state) => (
      state.storage.sql.exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'recovery_v2_%'",
      ).toArray().map(({ name }) => name)
    ))
    expect(v1Tables).toEqual([])
    await expect(v1.status()).resolves.toMatchObject({
      role: 'control',
      control: { authorizationEpoch: 7 },
    })
  })

  it('rejects projection reads whose exact request id does not name the object', async () => {
    const { request } = await issueAndClaim()
    await expect(runInDurableObject(
      request,
      instance => instance.readClaimedProjection({ requestId: OTHER_REQUEST_ID }),
    ))
      .rejects.toThrow('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
    await expect(runInDurableObject(
      request,
      instance => instance.readClaimedProjection({ requestId: REQUEST_ID, extra: true } as never),
    ))
      .rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')
  })

  it('persists canonical metadata and the redacted projection across eviction', async () => {
    const { request } = await issueAndClaim()
    const before = await request.readClaimedProjection({ requestId: REQUEST_ID })
    expect(before.authorization.githubMetadata).toEqual(githubMetadata)
    expect(before.authorization.githubMetadataSha256)
      .toBe(await githubEvidenceMetadataSha256(githubMetadata))

    await evictDurableObject(request)
    await expect(request.readClaimedProjection({ requestId: REQUEST_ID })).resolves.toEqual(before)
  })

  it('rejects tampered metadata commitments before a hydrated row is usable', async () => {
    const { request } = await issueAndClaim()
    await runInDurableObject(request, async (_instance, state) => {
      state.storage.sql.exec('DROP TRIGGER recovery_v2_github_metadata_immutable_update').toArray()
      state.storage.sql.exec(
        'UPDATE recovery_v2_authorization_binding SET github_metadata_sha256 = ? WHERE singleton_key = 1',
        'a'.repeat(64),
      ).toArray()
    })
    await evictDurableObject(request)

    await expect(runInDurableObject(
      request,
      instance => instance.readClaimedProjection({ requestId: REQUEST_ID }),
    ))
      .rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
    await expect(runInDurableObject(request, instance => instance.status()))
      .rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
  })

  it('rejects tampered canonical metadata before a hydrated row is usable', async () => {
    const { request } = await issueAndClaim()
    const tampered = { ...githubMetadata, artifactEtag: 'tampered-synthetic-etag' }
    await runInDurableObject(request, async (_instance, state) => {
      state.storage.sql.exec('DROP TRIGGER recovery_v2_github_metadata_immutable_update').toArray()
      state.storage.sql.exec(
        'UPDATE recovery_v2_authorization_binding SET github_metadata_json = ? WHERE singleton_key = 1',
        JSON.stringify(tampered),
      ).toArray()
    })
    await evictDurableObject(request)

    await expect(runInDurableObject(
      request,
      instance => instance.readClaimedProjection({ requestId: REQUEST_ID }),
    )).rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
  })

  it('rejects an issued raw JWS corrupted after a valid eviction round trip', async () => {
    const { request, authorizationJws } = await issueUnclaimed()
    await evictDurableObject(request)
    await expect(request.status()).resolves.toMatchObject({
      role: 'request', requestId: REQUEST_ID, state: 'issued', revision: 2,
    })

    await corruptIssuedRecord(request, record => {
      record.authorizationJws = `${authorizationJws.slice(0, -1)}A`
    })
    await evictDurableObject(request)

    await expect(runInDurableObject(request, instance => instance.status()))
      .rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
    await expect(runInDurableObject(
      request,
      instance => instance.readClaimedProjection({ requestId: REQUEST_ID }),
    )).rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
  })

  it('rejects an issued JWS digest corrupted after a valid eviction round trip', async () => {
    const { request } = await issueUnclaimed()
    await evictDurableObject(request)
    await expect(request.status()).resolves.toMatchObject({
      role: 'request', requestId: REQUEST_ID, state: 'issued', revision: 2,
    })

    await corruptIssuedRecord(request, record => {
      record.authorizationJwsSha256 = 'a'.repeat(64)
    })
    await evictDurableObject(request)

    await expect(runInDurableObject(request, instance => instance.status()))
      .rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
    await expect(runInDurableObject(
      request,
      instance => instance.readClaimedProjection({ requestId: REQUEST_ID }),
    )).rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
  })

  it('never exposes raw JWS, arming, or unsigned payload through status or projection', async () => {
    const { request, authorizationJws } = await issueAndClaim()
    const status = await request.status()
    const projection = await request.readClaimedProjection({ requestId: REQUEST_ID })
    const statusJson = JSON.stringify(status)
    const projectionJson = JSON.stringify(projection)

    expect(statusJson).not.toContain(authorizationJws)
    expect(projectionJson).not.toContain(authorizationJws)
    expect(status).not.toHaveProperty('arming')
    expect(status).not.toHaveProperty('authorization')
    expect(projection).not.toHaveProperty('arming')
    expect(projection).not.toHaveProperty('reservedPayload')
    expect(projectionJson).not.toContain('oidcJti')
    const durable = await runInDurableObject(request, async (_instance, state) => ({
      row: state.storage.sql.exec<{ record_json: string }>(
        'SELECT record_json FROM recovery_v2_authorization WHERE singleton_key = 1',
      ).one().record_json,
      payloadCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_v2_authorization_payload',
      ).one().count,
    }))
    expect(durable.row).not.toContain(authorizationJws)
    expect(durable.payloadCount).toBe(0)
  })

  it('reads terminal projection without changing SQL or repairing a leftover alarm', async () => {
    const { request } = await issueAndClaim()
    await expect(runInDurableObject(request, instance => instance.readTerminalProjection({ requestId: REQUEST_ID }))).rejects.toThrow('RECOVERY_LEDGER_TERMINAL_UNAVAILABLE')
    const projection = await request.readClaimedProjection({ requestId: REQUEST_ID })
    await request.complete({ requestId: REQUEST_ID, proof: {
      outcome: 'completed', rowBindingDigest: projection.rowBindingDigest,
      deployStepConclusion: 'success', matchingPagesDeployment: true, deploymentAttestationMatches: true,
    }, now: NOW + 3 })
    await expect(runInDurableObject(request, instance => instance.readTerminalProjection({ requestId: OTHER_REQUEST_ID }))).rejects.toThrow('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
    await runInDurableObject(request, async (instance, state) => {
      const alarm = (NOW + 2000) * 1000
      await state.storage.setAlarm(alarm)
      const before = state.storage.sql.exec<{ record_json: string }>('SELECT record_json FROM recovery_v2_authorization WHERE singleton_key = 1').one().record_json
      const result = await instance.readTerminalProjection({ requestId: REQUEST_ID })
      expect(result).toMatchObject({ state: 'completed', terminal: { outcome: 'completed', completedAt: NOW + 3 } })
      expect(await state.storage.getAlarm()).toBe(alarm)
      expect(state.storage.sql.exec<{ record_json: string }>('SELECT record_json FROM recovery_v2_authorization WHERE singleton_key = 1').one().record_json).toBe(before)
      expect(result).not.toHaveProperty('authorizationJws')
    })
  })

  it('persists reconciliation-required before the injected reader and accepts a row-bound completed proof', async () => {
    const { request } = await issueAndClaim()
    const alarmAt = NOW + 2 + 1_200
    vi.setSystemTime(alarmAt * 1_000)
    let projectionSeen: LedgerSignerClaimProjection | undefined
    let storedStateSeen: string | undefined

    await runInDurableObject(request, async (_instance, state) => {
      const reader: DeploymentReconciliationProofReader = async projection => {
        projectionSeen = projection
        storedStateSeen = state.storage.sql.exec<{ state: string }>(
          'SELECT state FROM recovery_v2_authorization WHERE singleton_key = 1',
        ).one().state
        return Object.freeze({
          outcome: 'completed',
          rowBindingDigest: projection.rowBindingDigest,
          deployStepConclusion: 'success',
          matchingPagesDeployment: true,
          deploymentAttestationMatches: true,
        })
      }
      const injected = new ReleaseRecoveryAuthorizationLedgerV2(
        state,
        { RECOVERY_LEDGER_V2: env.RECOVERY_LEDGER_V2 },
        () => reader,
      )
      await injected.alarm()
    })

    expect(storedStateSeen).toBe('reconciliation-required')
    expect(projectionSeen).toMatchObject({
      state: 'reconciliation-required', requestId: REQUEST_ID, revision: 4,
    })
    await expect(request.status()).resolves.toMatchObject({
      state: 'completed', terminal: { outcome: 'completed', completedAt: alarmAt }, revision: 5,
    })
  })

  it('accepts not-deployed only through the alarm reader and exposes no public reconcile RPC', async () => {
    const { request } = await issueAndClaim()
    const alarmAt = NOW + 2 + 1_200
    vi.setSystemTime(alarmAt * 1_000)
    const reader: DeploymentReconciliationProofReader = async projection => Object.freeze({
      outcome: 'not-deployed',
      rowBindingDigest: projection.rowBindingDigest,
      authoritativeTerminalRun: true,
      pagesDeployStepStarted: false,
      matchingPagesDeploymentAbsent: true,
    })

    await runAlarmWithReader(request, reader)

    await expect(request.status()).resolves.toMatchObject({
      state: 'not-deployed', terminal: { outcome: 'not-deployed', completedAt: alarmAt }, revision: 5,
    })
    await runInDurableObject(request, instance => {
      expect('reconcile' in instance).toBe(false)
    })
  })

  it('discards a terminal reader result when the stored revision changes during the await', async () => {
    const { request } = await issueAndClaim()
    const alarmAt = NOW + 2 + 1_200
    vi.setSystemTime(alarmAt * 1_000)
    let calls = 0

    await runInDurableObject(request, async (runtimeInstance, state) => {
      const reader = async (
        projection: LedgerSignerClaimProjection,
      ): Promise<LedgerV2ReconciliationProof> => {
        calls += 1
        await runtimeInstance.alarm()
        return Object.freeze({
          outcome: 'completed',
          rowBindingDigest: projection.rowBindingDigest,
          deployStepConclusion: 'success',
          matchingPagesDeployment: true,
          deploymentAttestationMatches: true,
        })
      }
      const injected = new ReleaseRecoveryAuthorizationLedgerV2(
        state,
        { RECOVERY_LEDGER_V2: env.RECOVERY_LEDGER_V2 },
        () => reader,
      )
      await injected.alarm()
    })

    expect(calls).toBe(1)
    await expect(request.status()).resolves.toMatchObject({
      state: 'reconciliation-required', reconciliationAttempts: 1,
      nextReconcileAt: alarmAt + 60, revision: 5,
    })
  })

  it('uses only bounded ambiguous alarm retries when configured evidence is unavailable', async () => {
    const { request } = await issueAndClaim()
    const firstAlarmAt = NOW + 2 + 1_200
    const callbacks = [
      { at: firstAlarmAt, attempts: 1, next: firstAlarmAt + 60 },
      { at: firstAlarmAt + 60, attempts: 2, next: firstAlarmAt + 360 },
      { at: firstAlarmAt + 360, attempts: 3, next: firstAlarmAt + 1_260 },
      { at: firstAlarmAt + 1_260, attempts: 4, next: firstAlarmAt + 4_860 },
      { at: firstAlarmAt + 4_860, attempts: 5, next: null },
    ] as const

    for (const callback of callbacks) {
      vi.setSystemTime(callback.at * 1_000)
      await expect(runDurableObjectAlarm(request)).resolves.toBe(true)
      const status = await request.status()
      expect(status).toMatchObject({
        role: 'request',
        requestId: REQUEST_ID,
        state: 'reconciliation-required',
        reconciliationAttempts: callback.attempts,
        nextReconcileAt: callback.next,
      })
      expect(status).not.toHaveProperty('terminal')
      expect(status).not.toHaveProperty('proof')
      await expect(runInDurableObject(
        request,
        async (_instance, state) => state.storage.getAlarm(),
      )).resolves.toBe(callback.next === null ? null : callback.next * 1_000)
    }

    await expect(runDurableObjectAlarm(request)).resolves.toBe(false)
    await expect(request.status()).resolves.toMatchObject({
      state: 'reconciliation-required', reconciliationAttempts: 5, nextReconcileAt: null,
    })
  })
})
