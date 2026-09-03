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
import type { GitHubWorkflowIdentity } from '../src/githubOidc.js'
import type { LedgerControlState } from '../src/ledger.js'
import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  RECOVERY_AUTHORIZATION_TYP,
  base64UrlEncode,
  serializeExactObject,
} from '../src/protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from '../src/recoveryPublicKey.js'
import {
  resetTestReconciliationProofReader,
  setTestReconciliationProofReader,
} from './reconciliationProof.fake.js'

const CONTROL_NAME = 'warpkeep-release-recovery-control-v1'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const AUTHORIZATION_JTI = '123e4567-e89b-42d3-a456-426614174001'
const CANDIDATE = 'd'.repeat(40)
// Normal-path alarms stay safely in the future so the runtime cannot fire them
// asynchronously while a concurrency assertion is still in progress.
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
    preparationCommit: 'b'.repeat(40),
    preparationTree: 'c'.repeat(40),
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
    repository: 'ael-dev3/Warpkeep', repositoryId: '1273513252', repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    environment: 'github-pages', eventName: 'workflow_run', workflowSha: CANDIDATE,
    pagesRunId: '123', pagesRunAttempt: '1', checkRunId: '999',
    oidcJti: '123e4567-e89b-42d3-a456-426614174050',
    ...overrides,
  }
}

function locators(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    requestId: REQUEST_ID, candidateCommit: CANDIDATE, sourceVerifyRunId: '456',
    sourceVerifyRunAttempt: '2', artifactId: '789', ...overrides,
  }
}

function payload(overrides: Readonly<Record<string, unknown>> = {}): RecoveryAuthorizationPayload {
  return {
    schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-authorization-v1',
    iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
    sub: 'warpkeep-0.4.0-recovery-deployment', kid: RECOVERY_KEY_ID,
    requestId: REQUEST_ID, jti: AUTHORIZATION_JTI, authorizationEpoch: 3,
    repository: 'ael-dev3/Warpkeep', repositoryId: '1273513252', repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    workflowSha: CANDIDATE, environment: 'github-pages', eventName: 'workflow_run',
    pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
    predecessorCommit: 'b'.repeat(40), candidateCommit: CANDIDATE, candidateTree: 'e'.repeat(40),
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: 'a'.repeat(64), recoveryAuthorizationCoreSha256: 'b'.repeat(64),
    artifactId: '789', artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: 'c'.repeat(64), innerArtifactTarSha256: 'd'.repeat(64),
    contentManifestSha256: 'e'.repeat(64), deploymentAttestationSha256: 'f'.repeat(64),
    releaseVersion: '0.4.0', operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com', authWorker: 'warpkeep-auth-bridge',
    genesis001Database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    genesis002Database: '1'.repeat(64), ptrDatabase: '2'.repeat(64),
    historicalGenesis001ReceiptStatus: 'unavailable',
    historicalGenesis001ReceiptExpectedSha256: '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63',
    g001ReleaseVersion: '0.3.43', g001PlayerAccessEnabled: true,
    g001AdmissionStateMutationsEnabled: false, g001AccessRequestSubmissionsEnabled: false,
    g001BaselineAbiSha256: '3'.repeat(64), g002Sealed: true, g002PlayerCount: 0,
    g002GeneralAdmissionCount: 0, ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0,
    observedFrom: NOW - 20, observedThrough: NOW - 1,
    issuanceEvidenceSnapshotDigest: '4'.repeat(64), liveInvariantDigest: '5'.repeat(64),
    iat: NOW, nbf: NOW, exp: NOW + 900,
    ...overrides,
  } as RecoveryAuthorizationPayload
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

function reverseKeyOrder(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).reverse())
}

async function enableAndInstall(
  tuple = arming(),
): Promise<Readonly<{ control: LedgerControlState; request: ReturnType<typeof env.RECOVERY_LEDGER.getByName> }>> {
  const controlStub = env.RECOVERY_LEDGER.getByName(CONTROL_NAME)
  await controlStub.reconcileControl({ enabled: false, authorizationEpoch: tuple.authorizationEpoch })
  const control = await controlStub.reconcileControl({
    enabled: true, authorizationEpoch: tuple.authorizationEpoch, arming: tuple,
  })
  const request = env.RECOVERY_LEDGER.getByName(tuple.requestId)
  await request.installArming({ arming: tuple, control })
  return { control, request }
}

function reserveInput(control: LedgerControlState, overrides: Readonly<Record<string, unknown>> = {}) {
  return { control, locators: locators(), identity: identity(), payload: payload(), now: NOW, ...overrides }
}

async function runAlarmAt(
  stub: ReturnType<typeof env.RECOVERY_LEDGER.getByName>,
  observedAt: number,
): Promise<boolean> {
  vi.setSystemTime(observedAt * 1_000)
  try {
    await expect(runInDurableObject(stub, () => Date.now()))
      .resolves.toBe(observedAt * 1_000)
    return await runDurableObjectAlarm(stub)
  } finally {
    vi.useRealTimers()
  }
}

afterEach(async () => {
  await reset()
})

describe('ReleaseRecoveryAuthorizationLedger Workerd adapter', () => {
  it('loads the real SQLite schema and isolates control and request object roles', async () => {
    const control = env.RECOVERY_LEDGER.getByName(CONTROL_NAME)
    const schema = await runInDurableObject(control, async (_instance, state) => ({
      foreignKeys: state.storage.sql.exec<{ foreign_keys: number }>('PRAGMA foreign_keys').one().foreign_keys,
      json1: state.storage.sql.exec<{ valid: number }>("SELECT json_valid('{\"ok\":true}') AS valid").one().valid,
      tables: state.storage.sql.exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'recovery_%' ORDER BY name",
      ).toArray().map(({ name }) => name),
      columns: Object.fromEntries(await Promise.all([
        'recovery_authorization', 'recovery_authorization_arming',
        'recovery_authorization_payload', 'recovery_control', 'recovery_used_arming',
      ].map(async table => [table, state.storage.sql.exec(`PRAGMA table_info(${table})`).toArray().length]))),
      rowCounts: Object.fromEntries([
        'recovery_authorization', 'recovery_authorization_arming',
        'recovery_authorization_payload', 'recovery_control', 'recovery_used_arming',
      ].map(table => [table, state.storage.sql.exec<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      ).one().count])),
    }))
    expect(schema).toEqual({
      foreignKeys: 1,
      json1: 1,
      tables: [
        'recovery_authorization', 'recovery_authorization_arming',
        'recovery_authorization_payload', 'recovery_control', 'recovery_used_arming',
      ],
      columns: {
        recovery_authorization: 51,
        recovery_authorization_arming: 51,
        recovery_authorization_payload: 60,
        recovery_control: 55,
        recovery_used_arming: 2,
      },
      rowCounts: {
        recovery_authorization: 0,
        recovery_authorization_arming: 0,
        recovery_authorization_payload: 0,
        recovery_control: 0,
        recovery_used_arming: 0,
      },
    })
    await expect(control.status()).resolves.toEqual({ role: 'control', control: null })
    const request = env.RECOVERY_LEDGER.getByName(REQUEST_ID)
    await expect(request.status()).resolves.toEqual({
      role: 'request', requestId: REQUEST_ID, state: null, revision: null, alarmDeadline: null,
    })
    await expect(runInDurableObject(request, instance => instance.reconcileControl({
      enabled: false, authorizationEpoch: 3,
    }))).rejects.toThrow('RECOVERY_LEDGER_ROLE_MISMATCH')
    const noncanonical = env.RECOVERY_LEDGER.getByName(REQUEST_ID.toUpperCase())
    await expect(runInDurableObject(noncanonical, instance => instance.status()))
      .rejects.toThrow('RECOVERY_LEDGER_OBJECT_NAME_INVALID')
    const unnamed = env.RECOVERY_LEDGER.get(env.RECOVERY_LEDGER.newUniqueId())
    await expect(runInDurableObject(unnamed, instance => instance.status()))
      .rejects.toThrow('RECOVERY_LEDGER_OBJECT_NAME_INVALID')
  })

  it('rejects reverse-role calls and cross-name arming without writing state', async () => {
    const { control, request } = await enableAndInstall()
    const controlStub = env.RECOVERY_LEDGER.getByName(CONTROL_NAME)
    await expect(runInDurableObject(controlStub, instance => instance.installArming(structuredClone({
      arming: arming(), control,
    })))).rejects.toThrow('RECOVERY_LEDGER_ROLE_MISMATCH')

    const otherId = '123e4567-e89b-42d3-a456-426614174099'
    const other = env.RECOVERY_LEDGER.getByName(otherId)
    await expect(runInDurableObject(other, instance => instance.installArming(structuredClone({
      arming: arming(), control,
    })))).rejects.toThrow('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
    await expect(other.status()).resolves.toEqual({
      role: 'request', requestId: otherId, state: null, revision: null, alarmDeadline: null,
    })
    await expect(request.status()).resolves.toMatchObject({ state: 'armed', revision: 0 })
  })

  it('rejects noncanonical top-level envelopes for every signer-internal RPC shape', async () => {
    const controlStub = env.RECOVERY_LEDGER.getByName(CONTROL_NAME)
    await expect(runInDurableObject(controlStub, instance => instance.reconcileControl(
      structuredClone(reverseKeyOrder({ enabled: false, authorizationEpoch: 3 })) as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_CONTROL_INVALID')

    const { control, request } = await enableAndInstall()
    await expect(runInDurableObject(request, instance => instance.installArming(
      structuredClone(reverseKeyOrder({ arming: arming(), control })) as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_INSTALL_INVALID')

    const reserve = reserveInput(control)
    await expect(runInDurableObject(request, instance => instance.reserveIssue(
      structuredClone(reverseKeyOrder(reserve)) as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')
    await request.reserveIssue(reserve)

    const body = payload()
    const jws = compactAuthorizationJws(body)
    const finalize = {
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    }
    await expect(runInDurableObject(request, instance => instance.finalizeIssue(
      structuredClone(reverseKeyOrder(finalize)) as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')
    await request.finalizeIssue(finalize)

    const read = { control, locators: locators(), identity: identity(), now: NOW + 2 }
    await expect(runInDurableObject(request, instance => instance.readIssued(
      structuredClone(reverseKeyOrder(read)) as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')

    const claim = {
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 2,
    }
    await expect(runInDurableObject(request, instance => instance.claim(
      structuredClone(reverseKeyOrder(claim)) as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')
    const claimed = await request.claim(claim)

    const complete = {
      requestId: REQUEST_ID,
      proof: {
        outcome: 'completed' as const,
        rowBindingDigest: claimed.rowBindingDigest,
        deployStepConclusion: 'success' as const,
        matchingPagesDeployment: true as const,
        deploymentAttestationMatches: true as const,
      },
      now: NOW + 3,
    }
    await expect(runInDurableObject(request, instance => instance.complete(
      structuredClone(reverseKeyOrder(complete)) as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')
    await expect(runInDurableObject(request, instance => instance.reconcile(
      { requestId: REQUEST_ID, unexpected: true } as never,
    ))).rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')
    await expect(runInDurableObject(request, instance => (
      instance.status as unknown as (input: unknown) => Promise<unknown>
    )({ unexpected: true }))).rejects.toThrow('RECOVERY_LEDGER_EVENT_INVALID')
  })

  it('rejects extra, symbolic, accessor, inherited, and non-enumerable RPC data', async () => {
    const control = env.RECOVERY_LEDGER.getByName(CONTROL_NAME)
    const result = await runInDurableObject(control, async instance => {
      let getterCalls = 0
      const symbolic = { enabled: false, authorizationEpoch: 3 } as Record<PropertyKey, unknown>
      symbolic[Symbol('unexpected')] = true
      const accessor = Object.create(null) as Record<string, unknown>
      Object.defineProperties(accessor, {
        enabled: {
          enumerable: true,
          get() {
            getterCalls += 1
            return false
          },
        },
        authorizationEpoch: { enumerable: true, value: 3 },
      })
      const inherited = Object.assign(Object.create({ unexpected: true }), {
        enabled: false,
        authorizationEpoch: 3,
      }) as Record<string, unknown>
      const nonEnumerable = Object.create(null) as Record<string, unknown>
      Object.defineProperties(nonEnumerable, {
        enabled: { enumerable: false, value: false },
        authorizationEpoch: { enumerable: true, value: 3 },
      })
      const candidates = [
        { enabled: false, authorizationEpoch: 3, unexpected: true },
        symbolic,
        accessor,
        inherited,
        nonEnumerable,
      ]
      const codes: string[] = []
      for (const candidate of candidates) {
        try {
          await instance.reconcileControl(candidate as never)
          codes.push('unexpected-success')
        } catch (error) {
          codes.push(error instanceof Error ? error.message : 'non-error')
        }
      }
      return { codes, getterCalls }
    })
    expect(result).toEqual({
      codes: Array.from({ length: 5 }, () => 'RECOVERY_LEDGER_CONTROL_INVALID'),
      getterCalls: 0,
    })
  })

  it('persists the monotonic control watermark across object eviction', async () => {
    const tuple = arming()
    const stub = env.RECOVERY_LEDGER.getByName(CONTROL_NAME)
    await stub.reconcileControl({ enabled: false, authorizationEpoch: 3 })
    const enabled = await stub.reconcileControl({ enabled: true, authorizationEpoch: 3, arming: tuple })
    expect(enabled).toMatchObject({ enabled: true, authorizationEpoch: 3, maxConsumedAuthorizationEpoch: 3 })
    await evictDurableObject(stub)
    await expect(stub.status()).resolves.toMatchObject({
      role: 'control', control: { enabled: true, authorizationEpoch: 3, maxConsumedAuthorizationEpoch: 3 },
    })
    await expect(runInDurableObject(stub, instance => instance.reconcileControl({
      enabled: false, authorizationEpoch: 2,
    }))).rejects.toThrow('RECOVERY_LEDGER_EPOCH_DECREASE')
  })

  it('persists an exact immutable arming row and rejects a conflicting reinstall', async () => {
    const { control, request } = await enableAndInstall()
    await evictDurableObject(request)
    await expect(request.status()).resolves.toMatchObject({
      role: 'request', requestId: REQUEST_ID, state: 'armed', revision: 0,
    })
    await expect(runInDurableObject(request, instance => instance.installArming({
      arming: arming({ bridgeWorkerVersionId: '123e4567-e89b-42d3-a456-426614174099' }),
      control,
    }))).rejects.toThrow('RECOVERY_LEDGER_ARMING_CONFLICT')
  })

  it('serializes parallel issue reservations and rolls back a mismatched retry', async () => {
    const { control, request } = await enableAndInstall()
    const [first, second] = await Promise.all([
      request.reserveIssue(reserveInput(control)), request.reserveIssue(reserveInput(control)),
    ])
    expect(first).toEqual(second)
    expect(first).toMatchObject({ state: 'issuing', reservedAt: NOW, issuingDeadline: NOW + 120, revision: 1 })
    await expect(runInDurableObject(request, instance => instance.reserveIssue(structuredClone(
      reserveInput(control, { payload: payload({ artifactId: '790' }) }),
    )))).rejects.toThrow('RECOVERY_LEDGER_ISSUE_MISMATCH')
    await expect(request.status()).resolves.toMatchObject({ state: 'issuing', revision: 1 })
    await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBe((NOW + 120) * 1_000)
  })

  it('keeps the winning row and alarm when distinct reservations race', async () => {
    const { control, request } = await enableAndInstall()
    const secondNow = NOW + 1
    const firstInput = reserveInput(control)
    const secondInput = reserveInput(control, {
      payload: payload({
        jti: '123e4567-e89b-42d3-a456-426614174099',
        observedFrom: NOW - 19,
        observedThrough: NOW,
        iat: secondNow,
        nbf: secondNow,
        exp: secondNow + 900,
      }),
      now: secondNow,
    })
    const outcomes = await runInDurableObject(request, instance => Promise.allSettled([
      instance.reserveIssue(structuredClone(firstInput)),
      instance.reserveIssue(structuredClone(secondInput)),
    ]))
    const winner = outcomes.find(result => result.status === 'fulfilled')
    const loser = outcomes.find(result => result.status === 'rejected')
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
    if (winner?.status !== 'fulfilled' || loser?.status !== 'rejected') {
      throw new Error('expected one reservation winner and one loser')
    }
    expect(loser.reason).toBeInstanceOf(Error)
    expect((loser.reason as Error).message).toBe(
      winner.value.reservedAt === NOW
        ? 'RECOVERY_LEDGER_ISSUE_MISMATCH'
        : 'RECOVERY_LEDGER_TIME_BACKWARDS',
    )

    const durable = await runInDurableObject(request, async (_instance, state) => ({
      alarm: await state.storage.getAlarm(),
      core: state.storage.sql.exec<{ reserved_at: number; issuing_deadline: number; revision: number }>(
        'SELECT reserved_at, issuing_deadline, revision FROM recovery_authorization WHERE singleton_key = 1',
      ).one(),
      jti: state.storage.sql.exec<{ payload_jti: string }>(
        'SELECT payload_jti FROM recovery_authorization_payload WHERE singleton_key = 1',
      ).one().payload_jti,
      payloadCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_authorization_payload',
      ).one().count,
    }))
    expect(durable).toEqual({
      alarm: winner.value.issuingDeadline * 1_000,
      core: {
        reserved_at: winner.value.reservedAt,
        issuing_deadline: winner.value.issuingDeadline,
        revision: 1,
      },
      jti: winner.value.reservedPayload.jti,
      payloadCount: 1,
    })
  })

  it('atomically rolls back a failed reservation and its alarm', async () => {
    const { control, request } = await enableAndInstall()
    await runInDurableObject(request, async (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER warpkeep_test_core_update_abort
        BEFORE UPDATE ON recovery_authorization
        BEGIN
          SELECT RAISE(ABORT, 'warpkeep-test-core-update-abort');
        END
      `).toArray()
    })
    await expect(runInDurableObject(request, instance => instance.reserveIssue(
      structuredClone(reserveInput(control)),
    ))).rejects.toThrow('RECOVERY_LEDGER_STORAGE_FAILED')

    const afterRollback = await runInDurableObject(request, async (_instance, state) => ({
      alarm: await state.storage.getAlarm(),
      core: state.storage.sql.exec<{ state: string; revision: number }>(
        'SELECT state, revision FROM recovery_authorization WHERE singleton_key = 1',
      ).one(),
      payloadCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_authorization_payload',
      ).one().count,
    }))
    expect(afterRollback).toEqual({
      alarm: null,
      core: { state: 'armed', revision: 0 },
      payloadCount: 0,
    })
    await expect(runDurableObjectAlarm(request)).resolves.toBe(false)
    await expect(request.status()).resolves.toEqual({
      role: 'request', requestId: REQUEST_ID, state: 'armed', revision: 0, alarmDeadline: null,
    })
    await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBeNull()
  })

  it('atomically rolls back JWS finalization, payload deletion, and alarm replacement', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await runInDurableObject(request, async (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER warpkeep_test_finalize_abort
        BEFORE UPDATE ON recovery_authorization
        WHEN OLD.state = 'issuing' AND NEW.state = 'issued'
        BEGIN
          SELECT RAISE(ABORT, 'warpkeep-test-finalize-abort');
        END
      `).toArray()
    })

    await expect(runInDurableObject(request, instance => instance.finalizeIssue(structuredClone({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })))).rejects.toThrow('RECOVERY_LEDGER_STORAGE_FAILED')

    const durable = await runInDurableObject(request, async (_instance, state) => ({
      alarm: await state.storage.getAlarm(),
      row: state.storage.sql.exec<{
        state: string; revision: number; authorization_jws: string | null; reserved_payload_json: string | null
      }>(
        'SELECT state, revision, authorization_jws, reserved_payload_json FROM recovery_authorization WHERE singleton_key = 1',
      ).one(),
      payloadCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_authorization_payload',
      ).one().count,
    }))
    expect(durable).toEqual({
      alarm: (NOW + 120) * 1_000,
      row: {
        state: 'issuing', revision: 1, authorization_jws: null,
        reserved_payload_json: new TextDecoder().decode(
          serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, body),
        ),
      },
      payloadCount: 1,
    })
  })

  it('rolls back the consumed-arming watermark when control update fails', async () => {
    const control = env.RECOVERY_LEDGER.getByName(CONTROL_NAME)
    await control.reconcileControl({ enabled: false, authorizationEpoch: 3 })
    await runInDurableObject(control, async (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER warpkeep_test_control_update_abort
        BEFORE UPDATE ON recovery_control
        BEGIN
          SELECT RAISE(ABORT, 'warpkeep-test-control-update-abort');
        END
      `).toArray()
    })
    await expect(runInDurableObject(control, instance => instance.reconcileControl(structuredClone({
      enabled: true,
      authorizationEpoch: 3,
      arming: arming(),
    })))).rejects.toThrow('RECOVERY_LEDGER_STORAGE_FAILED')
    const durable = await runInDurableObject(control, async (_instance, state) => ({
      control: state.storage.sql.exec<{
        enabled: number; authorization_epoch: number; max_consumed_authorization_epoch: number | null; revision: number
      }>(
        'SELECT enabled, authorization_epoch, max_consumed_authorization_epoch, revision FROM recovery_control WHERE singleton_key = 1',
      ).one(),
      usedCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_used_arming',
      ).one().count,
    }))
    expect(durable).toEqual({
      control: {
        enabled: 0,
        authorization_epoch: 3,
        max_consumed_authorization_epoch: null,
        revision: 0,
      },
      usedCount: 0,
    })
  })

  it('retains one issued JWS across eviction and repairs only its stored expiry alarm', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    const issued = await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    expect(issued).toMatchObject({ state: 'issued', authorizationJws: jws, expiresAt: NOW + 900, revision: 2 })
    await runInDurableObject(request, async (_instance, state) => {
      await state.storage.setAlarm((NOW + 9_999) * 1_000)
    })
    await evictDurableObject(request)
    await expect(request.readIssued({ control, locators: locators(), identity: identity(), now: NOW + 2 }))
      .resolves.toMatchObject({ authorizationJws: jws, revision: 2 })
    await expect(runInDurableObject(request, async (_instance, state) => ({
      alarm: await state.storage.getAlarm(),
      payloadCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_authorization_payload',
      ).one().count,
    }))).resolves.toEqual({ alarm: (NOW + 900) * 1_000, payloadCount: 0 })
  })

  it('repairs missing, early, and late alarms without changing issuing or claimed rows', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    const issuingStatus = {
      role: 'request', requestId: REQUEST_ID, state: 'issuing', revision: 1,
      alarmDeadline: NOW + 120, expiresAt: NOW + 900, reservedAt: NOW,
      issuingDeadline: NOW + 120,
    }
    for (const alarm of [null, (NOW + 1) * 1_000, (NOW + 800) * 1_000]) {
      await runInDurableObject(request, async (_instance, state) => {
        if (alarm === null) await state.storage.deleteAlarm()
        else await state.storage.setAlarm(alarm)
      })
      await expect(request.status()).resolves.toEqual(issuingStatus)
      await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
        .resolves.toBe((NOW + 120) * 1_000)
    }

    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 2,
    })
    const claimedStatus = {
      role: 'request', requestId: REQUEST_ID, state: 'claimed', revision: 3,
      alarmDeadline: NOW + 1_202, authorizationJwsSha256: rawSha256(jws),
      expiresAt: NOW + 900, claimedAt: NOW + 2, claimDeadline: NOW + 1_202,
    }
    for (const alarm of [null, (NOW + 900) * 1_000, (NOW + 2_000) * 1_000]) {
      await runInDurableObject(request, async (_instance, state) => {
        if (alarm === null) await state.storage.deleteAlarm()
        else await state.storage.setAlarm(alarm)
      })
      await expect(request.status()).resolves.toEqual(claimedStatus)
      await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBe((NOW + 1_202) * 1_000)
    }
  })

  it('repairs each retained-authority alarm while preserving exact rejection codes', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await runInDurableObject(request, async (_instance, state) => state.storage.deleteAlarm())
    await expect(runInDurableObject(request, instance => instance.reserveIssue(structuredClone(
      reserveInput(control, { payload: payload({ artifactId: '790' }) }),
    )))).rejects.toThrow('RECOVERY_LEDGER_ISSUE_MISMATCH')
    await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBe((NOW + 120) * 1_000)

    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    await runInDurableObject(request, async (_instance, state) => {
      await state.storage.setAlarm((NOW + 100) * 1_000)
    })
    await expect(runInDurableObject(request, instance => instance.readIssued(structuredClone({
      control,
      locators: locators({ artifactId: '790' }),
      identity: identity(),
      now: NOW + 2,
    })))).rejects.toThrow('RECOVERY_LEDGER_ISSUE_MISMATCH')
    await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBe((NOW + 900) * 1_000)

    await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 2,
    })
    await runInDurableObject(request, async (_instance, state) => state.storage.deleteAlarm())
    await expect(runInDurableObject(request, instance => instance.claim(structuredClone({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '8'.repeat(64), now: NOW + 3,
    })))).rejects.toThrow('RECOVERY_LEDGER_ALREADY_CLAIMED')
    await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBe((NOW + 1_202) * 1_000)
  })

  it('makes orphaned and stale prior-phase alarm deliveries harmless', async () => {
    const { control, request } = await enableAndInstall()
    const armed = await runInDurableObject(request, async (instance, state) => {
      await state.storage.setAlarm((NOW + 60) * 1_000)
      await instance.alarm({ scheduledTime: (NOW + 60) * 1_000, isRetry: false, retryCount: 0 })
      return {
        alarm: await state.storage.getAlarm(),
        row: state.storage.sql.exec<{ state: string; revision: number }>(
          'SELECT state, revision FROM recovery_authorization WHERE singleton_key = 1',
        ).one(),
      }
    })
    expect(armed).toEqual({ alarm: null, row: { state: 'armed', revision: 0 } })

    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    const issuing = await runInDurableObject(request, async (instance, state) => {
      await instance.alarm({ scheduledTime: (NOW + 60) * 1_000, isRetry: false, retryCount: 0 })
      return {
        alarm: await state.storage.getAlarm(),
        row: state.storage.sql.exec<{ state: string; revision: number }>(
          'SELECT state, revision FROM recovery_authorization WHERE singleton_key = 1',
        ).one(),
      }
    })
    expect(issuing).toEqual({
      alarm: (NOW + 120) * 1_000,
      row: { state: 'issuing', revision: 1 },
    })

    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 2,
    })
    const claimed = await runInDurableObject(request, async (instance, state) => {
      await instance.alarm({ scheduledTime: (NOW + 900) * 1_000, isRetry: false, retryCount: 0 })
      return {
        alarm: await state.storage.getAlarm(),
        row: state.storage.sql.exec<{ state: string; revision: number }>(
          'SELECT state, revision FROM recovery_authorization WHERE singleton_key = 1',
        ).one(),
      }
    })
    expect(claimed).toEqual({
      alarm: (NOW + 1_202) * 1_000,
      row: { state: 'claimed', revision: 3 },
    })
  })

  it('uses observed wall time for early and delayed alarm delivery', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))

    const early = await runInDurableObject(request, async (instance, state) => {
      const realNow = Date.now
      Date.now = () => (NOW + 60) * 1_000
      try {
        await instance.alarm()
      } finally {
        Date.now = realNow
      }
      return {
        alarm: await state.storage.getAlarm(),
        row: state.storage.sql.exec<{ state: string; revision: number }>(
          'SELECT state, revision FROM recovery_authorization WHERE singleton_key = 1',
        ).one(),
      }
    })
    expect(early).toEqual({
      alarm: (NOW + 120) * 1_000,
      row: { state: 'issuing', revision: 1 },
    })

    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 61,
    })
    await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 62,
    })

    const deliveredAt = NOW + 2_000
    const delayed = await runInDurableObject(request, async (instance, state) => {
      const realNow = Date.now
      Date.now = () => deliveredAt * 1_000
      try {
        await instance.alarm({
          scheduledTime: (NOW + 1_262) * 1_000,
          isRetry: false,
          retryCount: 0,
        })
      } finally {
        Date.now = realNow
      }
      return {
        alarm: await state.storage.getAlarm(),
        row: state.storage.sql.exec<{
          state: string; reconciliation_attempts: number | null; next_reconcile_at: number | null
        }>(
          'SELECT state, reconciliation_attempts, next_reconcile_at FROM recovery_authorization WHERE singleton_key = 1',
        ).one(),
      }
    })
    expect(delayed).toEqual({
      alarm: (deliveredAt + 60) * 1_000,
      row: {
        state: 'reconciliation-required',
        reconciliation_attempts: 1,
        next_reconcile_at: deliveredAt + 60,
      },
    })
  })

  it('permits exactly one parallel claim, deletes raw JWS, and installs the claim deadline', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    const claimInput = {
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 2,
    }
    const outcomes = await runInDurableObject(request, instance => Promise.allSettled([
      instance.claim(structuredClone(claimInput)),
      instance.claim(structuredClone(claimInput)),
    ]))
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1)
    expect(outcomes.find(({ status }) => status === 'fulfilled')).toMatchObject({
      value: { state: 'claimed', requestId: REQUEST_ID, revision: 3, claimSequence: 1 },
    })
    expect((outcomes.find(({ status }) => status === 'rejected') as { reason: Error }).reason.message)
      .toBe('RECOVERY_LEDGER_ALREADY_CLAIMED')
    const durable = await runInDurableObject(request, async (_instance, state) => ({
      alarm: await state.storage.getAlarm(),
      row: state.storage.sql.exec<{ authorization_jws: string | null; state: string }>(
        'SELECT authorization_jws, state FROM recovery_authorization WHERE singleton_key = 1',
      ).one(),
    }))
    expect(durable).toEqual({
      alarm: (NOW + 2 + 1_200) * 1_000,
      row: { authorization_jws: null, state: 'claimed' },
    })
    expect(JSON.stringify(await request.status())).not.toContain(jws)
  })

  it('completes from the claimed row binding and ignores a stale claim alarm', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    const claimed = await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 2,
    })
    const completed = await request.complete({
      requestId: REQUEST_ID,
      proof: {
        outcome: 'completed',
        rowBindingDigest: claimed.rowBindingDigest,
        deployStepConclusion: 'success',
        matchingPagesDeployment: true,
        deploymentAttestationMatches: true,
      },
      now: NOW + 3,
    })
    expect(completed).toEqual({
      state: 'completed', outcome: 'completed', completedAt: NOW + 3,
      rowBindingDigest: claimed.rowBindingDigest, revision: 4,
    })
    const terminalStatus = {
      role: 'request', requestId: REQUEST_ID, state: 'completed', revision: 4,
      alarmDeadline: null, authorizationJwsSha256: rawSha256(jws),
      expiresAt: NOW + 900, claimedAt: NOW + 2, claimDeadline: NOW + 1_202,
      outcome: 'completed', completedAt: NOW + 3,
    }
    await expect(request.status()).resolves.toEqual(terminalStatus)
    await runInDurableObject(request, async (_instance, state) => {
      await state.storage.setAlarm((NOW + 1_202) * 1_000)
    })
    await expect(runDurableObjectAlarm(request)).resolves.toBe(true)
    await expect(request.status()).resolves.toEqual(terminalStatus)
    await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBeNull()
  })

  it('returns one exact terminal result to parallel completion retries', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    const claimed = await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: NOW + 2,
    })
    const input = {
      requestId: REQUEST_ID,
      proof: {
        outcome: 'completed' as const,
        rowBindingDigest: claimed.rowBindingDigest,
        deployStepConclusion: 'success' as const,
        matchingPagesDeployment: true as const,
        deploymentAttestationMatches: true as const,
      },
      now: NOW + 3,
    }
    const outcomes = await runInDurableObject(request, instance => Promise.allSettled([
      instance.complete(structuredClone(input)),
      instance.complete(structuredClone(input)),
    ]))
    expect(outcomes).toEqual([
      {
        status: 'fulfilled',
        value: {
          state: 'completed', outcome: 'completed', completedAt: NOW + 3,
          rowBindingDigest: claimed.rowBindingDigest, revision: 4,
        },
      },
      {
        status: 'fulfilled',
        value: {
          state: 'completed', outcome: 'completed', completedAt: NOW + 3,
          rowBindingDigest: claimed.rowBindingDigest, revision: 4,
        },
      },
    ])
    await expect(runInDurableObject(request, async (_instance, state) => state.storage.getAlarm()))
      .resolves.toBeNull()
  })

  it('fails closed when immutable arming storage is corrupted between evictions', async () => {
    const { request } = await enableAndInstall()
    await runInDurableObject(request, async (_instance, state) => {
      state.storage.sql.exec('DROP TRIGGER recovery_authorization_arming_immutable_update').toArray()
      state.storage.sql.exec(
        "UPDATE recovery_authorization_arming SET repository = 'attacker/repository' WHERE singleton_key = 1",
      ).toArray()
    })
    await evictDurableObject(request)
    await expect(runInDurableObject(request, instance => instance.status()))
      .rejects.toThrow('RECOVERY_LEDGER_STORAGE_CORRUPT')
  })

  it('expires an abandoned issuing reservation and deletes its unsigned payload', async () => {
    const { control, request } = await enableAndInstall()
    await request.reserveIssue(reserveInput(control))
    await expect(runAlarmAt(request, NOW + 120)).resolves.toBe(true)
    await expect(request.status()).resolves.toMatchObject({ state: 'expired-unused', revision: 2 })
    const durable = await runInDurableObject(request, async (_instance, state) => ({
      row: state.storage.sql.exec<{ reserved_payload_json: string | null }>(
        'SELECT reserved_payload_json FROM recovery_authorization WHERE singleton_key = 1',
      ).one(),
      payloadCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_authorization_payload',
      ).one().count,
    }))
    expect(durable).toEqual({ row: { reserved_payload_json: null }, payloadCount: 0 })
  })

  it('expires an unclaimed authorization and deletes its raw JWS', async () => {
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    await expect(runAlarmAt(request, NOW + 900)).resolves.toBe(true)
    const durable = await runInDurableObject(request, async (_instance, state) => ({
      row: state.storage.sql.exec<{ authorization_jws: string | null; state: string }>(
        'SELECT authorization_jws, state FROM recovery_authorization WHERE singleton_key = 1',
      ).one(),
      payloadCount: state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_authorization_payload',
      ).one().count,
    }))
    expect(durable).toEqual({
      row: { authorization_jws: null, state: 'expired-unused' },
      payloadCount: 0,
    })
  })

  it('fails closed into bounded ambiguous reconciliation without restoring authority', async () => {
    const claimedAt = NOW + 2
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: claimedAt,
    })
    await expect(runAlarmAt(request, claimedAt + 1_200)).resolves.toBe(true)
    await expect(request.status()).resolves.toMatchObject({
      state: 'reconciliation-required', reconciliationAttempts: 1,
      nextReconcileAt: claimedAt + 1_200 + 60,
    })
    const expected = [
      { attempts: 2, next: claimedAt + 1_200 + 60 + 300 },
      { attempts: 3, next: claimedAt + 1_200 + 60 + 300 + 900 },
      { attempts: 4, next: claimedAt + 1_200 + 60 + 300 + 900 + 3_600 },
      { attempts: 5, next: null },
    ] as const
    for (const value of expected) {
      const status = await request.status()
      if (status.role !== 'request' || status.nextReconcileAt === null || status.nextReconcileAt === undefined) {
        throw new Error('TEST_RECONCILIATION_DEADLINE_MISSING')
      }
      await expect(runAlarmAt(request, status.nextReconcileAt)).resolves.toBe(true)
      await expect(request.status()).resolves.toMatchObject({
        state: 'reconciliation-required',
        reconciliationAttempts: value.attempts,
        nextReconcileAt: value.next,
      })
    }
    await expect(runDurableObjectAlarm(request)).resolves.toBe(false)
    await expect(runInDurableObject(request, instance => instance.reserveIssue(reserveInput(control))))
      .rejects.toThrow('RECOVERY_LEDGER_REISSUE_DENIED')
    await expect(runInDurableObject(request, instance => instance.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '8'.repeat(64),
      now: claimedAt + 1_200 + 60 + 300 + 900 + 3_600,
    }))).rejects.toThrow('RECOVERY_LEDGER_ALREADY_CLAIMED')
  })

  it('checks manual reconciliation due time before its reader and anchors retry timing after that read', async () => {
    const claimedAt = NOW + 2
    const { control, request } = await enableAndInstall()
    const body = payload()
    const jws = compactAuthorizationJws(body)
    await request.reserveIssue(reserveInput(control, { payload: body }))
    await request.finalizeIssue({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      authorizationJwsSha256: rawSha256(jws), now: NOW + 1,
    })
    await request.claim({
      control, locators: locators(), identity: identity(), authorizationJws: jws,
      liveInvariantDigest: '5'.repeat(64), claimSnapshotDigest: '7'.repeat(64), now: claimedAt,
    })
    await expect(runAlarmAt(request, claimedAt + 1_200)).resolves.toBe(true)
    const dueAt = claimedAt + 1_200 + 60
    const readFinishedAt = dueAt + 23

    const reconciliation = await runInDurableObject(request, async (instance, state) => {
      const realNow = Date.now
      let readerCalls = 0
      setTestReconciliationProofReader(async () => {
        readerCalls += 1
        Date.now = () => readFinishedAt * 1_000
        return Object.freeze({ outcome: 'ambiguous' })
      })
      try {
        Date.now = () => (dueAt - 1) * 1_000
        await expect(instance.reconcile({ requestId: REQUEST_ID }))
          .rejects.toThrow('RECOVERY_LEDGER_RECONCILIATION_NOT_DUE')
        expect(readerCalls).toBe(0)

        Date.now = () => dueAt * 1_000
        const result = await instance.reconcile({ requestId: REQUEST_ID })
        return {
          readerCalls,
          result,
          alarm: await state.storage.getAlarm(),
          row: state.storage.sql.exec<{
            state: string; last_transition_at: number; reconciliation_attempts: number; next_reconcile_at: number
          }>(
            'SELECT state, last_transition_at, reconciliation_attempts, next_reconcile_at FROM recovery_authorization WHERE singleton_key = 1',
          ).one(),
        }
      } finally {
        Date.now = realNow
        resetTestReconciliationProofReader()
      }
    })
    expect(reconciliation).toEqual({
      readerCalls: 1,
      result: {
        state: 'reconciliation-required', reconciliationAttempts: 2,
        nextReconcileAt: readFinishedAt + 300,
        rowBindingDigest: expect.any(String), revision: 6,
      },
      alarm: (readFinishedAt + 300) * 1_000,
      row: {
        state: 'reconciliation-required', last_transition_at: readFinishedAt,
        reconciliation_attempts: 2, next_reconcile_at: readFinishedAt + 300,
      },
    })
  })
})
