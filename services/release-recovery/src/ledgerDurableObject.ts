import { DurableObject } from 'cloudflare:workers'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

import {
  GITHUB_REPOSITORY,
  commit,
  positive,
  sha,
  snapshotRecoveryArmingTuple,
  type RecoveryArmingTuple,
} from './config.js'
import type { RecoveryAuthorizationPayload } from './crypto.js'
import {
  RECOVERY_ARMING_TUPLE_KEYS,
  RECOVERY_CLAIM_DEADLINE_SECONDS,
  RECOVERY_ISSUING_TIMEOUT_SECONDS,
  RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS,
  RECOVERY_LEDGER_SQL_SCHEMA,
  RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS,
  RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS,
  RecoveryLedgerError,
  applyLedgerEvent,
  createLedgerControl,
  installLedgerArming,
  ledgerAlarmDeadline,
  ledgerRowBindingDigest,
  reconcileLedgerControl,
  type LedgerArmedState,
  type LedgerAuthorizationSnapshot,
  type LedgerClaimedState,
  type LedgerCompletedProof,
  type LedgerControlState,
  type LedgerEvent,
  type LedgerReconciliationProof,
  type LedgerReconciliationRequiredState,
  type LedgerRequestLocators,
  type LedgerStableWorkflowIdentity,
  type LedgerTerminalState,
  type RecoveryLedgerRecord,
} from './ledger.js'
import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  parseRecoveryCompactJws,
  parseRecoveryPayload,
  serializeExactObject,
} from './protocol.js'
import { readDeploymentReconciliationProof } from './reconciliationProof.js'

export const RECOVERY_LEDGER_CONTROL_OBJECT_NAME =
  'warpkeep-release-recovery-control-v1' as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type SqlValue = ArrayBuffer | string | number | null
type SqlRow = Record<string, SqlValue>
type ObjectRole = 'control' | 'request'

export interface SignerEnv {
  RECOVERY_LEDGER: DurableObjectNamespace<ReleaseRecoveryAuthorizationLedger>
}

export type LedgerControlInput =
  | Readonly<{ enabled: false; authorizationEpoch: number }>
  | Readonly<{
      enabled: true
      authorizationEpoch: number
      arming: RecoveryArmingTuple
    }>

export type LedgerArmingInput = Readonly<{
  arming: RecoveryArmingTuple
  control: LedgerControlState
}>

export type LedgerReserveIssueInput = Omit<
  Extract<LedgerEvent, { type: 'reserve-issue' }>,
  'type'
>

export type LedgerFinalizeIssueInput = Omit<
  Extract<LedgerEvent, { type: 'finalize-issue' }>,
  'type'
>

export type LedgerReadInput = Omit<
  Extract<LedgerEvent, { type: 'read-issued' }>,
  'type'
>

export type LedgerClaimInput = Omit<
  Extract<LedgerEvent, { type: 'claim' }>,
  'type'
>

export type LedgerCompleteInput = Readonly<{
  requestId: string
  proof: LedgerCompletedProof
  now: number
}>

export type LedgerReconcileInput = Readonly<{ requestId: string }>

export type LedgerIssueReservation = Readonly<{
  state: 'issuing'
  reservedPayload: RecoveryAuthorizationPayload
  reservedAt: number
  issuingDeadline: number
  revision: number
}>

export type LedgerIssueResult = Readonly<{
  state: 'issued'
  authorizationJws: string
  authorizationJwsSha256: string
  expiresAt: number
  revision: number
}>

export type LedgerClaimResult = Readonly<{
  state: 'claimed'
  requestId: string
  authorizationJwsSha256: string
  claimSnapshotDigest: string
  liveInvariantDigest: string
  claimSequence: 1
  claimedAt: number
  claimDeadline: number
  rowBindingDigest: string
  revision: number
}>

export type LedgerTerminalResult =
  | Readonly<{
      state: 'reconciliation-required'
      reconciliationAttempts: number
      nextReconcileAt: number | null
      rowBindingDigest: string
      revision: number
    }>
  | Readonly<{
      state: 'completed' | 'not-deployed'
      outcome: 'completed' | 'not-deployed'
      completedAt: number
      rowBindingDigest: string
      revision: number
    }>

export type LedgerStatusResult =
  | Readonly<{ role: 'control'; control: LedgerControlState | null }>
  | Readonly<{
      role: 'request'
      requestId: string
      state: RecoveryLedgerRecord['state'] | null
      revision: number | null
      alarmDeadline: number | null
      authorizationJwsSha256?: string | null
      expiresAt?: number | null
      reservedAt?: number | null
      issuingDeadline?: number | null
      claimedAt?: number | null
      claimDeadline?: number | null
      reconciliationAttempts?: number | null
      nextReconcileAt?: number | null
      outcome?: 'completed' | 'not-deployed' | null
      completedAt?: number | null
      expiredAt?: number | null
      expirationSource?: 'issuing' | 'issued' | null
    }>

function fail(code: string): never {
  throw new RecoveryLedgerError(code)
}

function snakeCase(key: string): string {
  return key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)
}

function exactData(
  value: unknown,
  keys: readonly string[],
  code: string,
): Readonly<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== 'object') fail(code)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail(code)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(descriptors)
    if (
      new Set(keys).size !== keys.length
      || ownKeys.length !== keys.length
      || ownKeys.some((key, index) => typeof key !== 'string' || key !== keys[index])
      || keys.some((key) => !Object.hasOwn(descriptors, key))
    ) fail(code)
    const result: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')
      ) fail(code)
      result[key] = descriptor.value
    }
    return Object.freeze(result)
  } catch (error) {
    if (error instanceof RecoveryLedgerError) throw error
    fail(code)
  }
}

function exactControlInput(value: unknown): LedgerControlInput {
  let source: Readonly<Record<string, unknown>>
  try {
    source = exactData(
      value,
      ['enabled', 'authorizationEpoch'],
      'RECOVERY_LEDGER_CONTROL_INVALID',
    )
  } catch {
    source = exactData(
      value,
      ['enabled', 'authorizationEpoch', 'arming'],
      'RECOVERY_LEDGER_CONTROL_INVALID',
    )
  }
  if (source.enabled === false) {
    if (Object.hasOwn(source, 'arming')) fail('RECOVERY_LEDGER_CONTROL_INVALID')
    return Object.freeze({
      enabled: false,
      authorizationEpoch: source.authorizationEpoch as number,
    })
  }
  if (source.enabled !== true || !Object.hasOwn(source, 'arming')) {
    fail('RECOVERY_LEDGER_CONTROL_INVALID')
  }
  return Object.freeze({
    enabled: true,
    authorizationEpoch: source.authorizationEpoch as number,
    arming: source.arming as RecoveryArmingTuple,
  })
}

function requestId(value: unknown, code = 'RECOVERY_LEDGER_REQUEST_ID_INVALID'): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code)
  return value
}

function integer(value: SqlValue | undefined, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(code)
  return value
}

function positiveInteger(value: SqlValue | undefined, code: string): number {
  const result = integer(value, code)
  if (result < 1) fail(code)
  return result
}

function text(value: SqlValue | undefined, code: string): string {
  if (typeof value !== 'string') fail(code)
  return value
}

function nullableInteger(value: SqlValue | undefined, code: string): number | null {
  if (value === null) return null
  return integer(value, code)
}

function nullableText(value: SqlValue | undefined, code: string): string | null {
  if (value === null) return null
  return text(value, code)
}

function booleanInteger(value: SqlValue | undefined, code: string): boolean {
  if (value !== 0 && value !== 1) fail(code)
  return value === 1
}

function oneOrNone(rows: readonly SqlRow[], code: string): SqlRow | undefined {
  if (rows.length > 1) fail(code)
  return rows[0]
}

function encodeArmingValue(
  key: (typeof RECOVERY_ARMING_TUPLE_KEYS)[number],
  value: RecoveryArmingTuple[(typeof RECOVERY_ARMING_TUPLE_KEYS)[number]],
): string | number {
  if (key === 'pagesDeploymentApproved') return value === true ? 1 : 0
  return value as string | number
}

function decodeArming(
  row: SqlRow,
  prefix: string,
  code: string,
): RecoveryArmingTuple {
  const candidate: Record<string, unknown> = Object.create(null)
  for (const key of RECOVERY_ARMING_TUPLE_KEYS) {
    const value = row[`${prefix}${snakeCase(key)}`]
    if (key === 'authorizationEpoch' || key === 'bridgeConfigEpoch') {
      candidate[key] = positiveInteger(value, code)
    } else if (key === 'pagesDeploymentApproved') {
      candidate[key] = booleanInteger(value, code)
    } else {
      candidate[key] = text(value, code)
    }
  }
  try {
    return snapshotRecoveryArmingTuple(candidate, code)
  } catch {
    fail(code)
  }
}

const ARMING_COLUMNS = RECOVERY_ARMING_TUPLE_KEYS.map(snakeCase)
const CONTROL_ACTIVE_ARMING_COLUMNS = RECOVERY_ARMING_TUPLE_KEYS
  .map((key) => `active_${snakeCase(key)}`)
const CONTROL_COLUMNS = [
  'singleton_key',
  'enabled',
  'authorization_epoch',
  'max_consumed_authorization_epoch',
  ...CONTROL_ACTIVE_ARMING_COLUMNS,
  'revision',
] as const

const PAYLOAD_BOOLEAN_KEYS = new Set<string>([
  'g001PlayerAccessEnabled',
  'g001AdmissionStateMutationsEnabled',
  'g001AccessRequestSubmissionsEnabled',
  'g002Sealed',
])

const PAYLOAD_INTEGER_KEYS = new Set<string>([
  'schemaVersion',
  'authorizationEpoch',
  'g002PlayerCount',
  'g002GeneralAdmissionCount',
  'ptrSingletonOwnerCount',
  'ptrGeneralAdmissionCount',
  'observedFrom',
  'observedThrough',
  'iat',
  'nbf',
  'exp',
  ...PAYLOAD_BOOLEAN_KEYS,
])

const PAYLOAD_COLUMNS = [
  'singleton_key',
  ...RECOVERY_AUTHORIZATION_PAYLOAD_KEYS.map((key) => `payload_${snakeCase(key)}`),
] as const

const CORE_COLUMNS = [
  'singleton_key',
  'request_id',
  'state',
  'locator_candidate_commit',
  'locator_source_verify_run_id',
  'locator_source_verify_run_attempt',
  'locator_artifact_id',
  ...RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS
    .map((key) => `workflow_identity_${snakeCase(key)}`),
  'authorization_jti',
  'snapshot_authorization_epoch',
  'issued_at',
  'not_before',
  'expires_at',
  'candidate_tree',
  'artifact_name',
  'github_artifact_archive_sha256',
  'inner_artifact_tar_sha256',
  'content_manifest_sha256',
  'deployment_attestation_sha256',
  'snapshot_operation',
  'snapshot_canonical_origin',
  'authorization_jws',
  'authorization_jws_sha256',
  'issuance_evidence_snapshot_digest',
  'live_invariant_digest',
  'reserved_payload_json',
  'reserved_at',
  'issuing_deadline',
  'last_transition_at',
  'claim_snapshot_digest',
  'claim_live_invariant_digest',
  'claim_sequence',
  'claimed_at',
  'claim_deadline',
  'reconciliation_attempts',
  'next_reconcile_at',
  'completed_at',
  'terminal_outcome',
  'expired_at',
  'expiration_source',
  'revision',
] as const

const CORE_UPDATE_COLUMNS = CORE_COLUMNS.filter((column) => column !== 'singleton_key')

function payloadSqlValues(payload: RecoveryAuthorizationPayload): readonly (string | number)[] {
  const source = payload as unknown as Readonly<Record<string, unknown>>
  return RECOVERY_AUTHORIZATION_PAYLOAD_KEYS.map((key) => {
    const value = source[key]
    if (PAYLOAD_BOOLEAN_KEYS.has(key)) return value === true ? 1 : 0
    return value as string | number
  })
}

function decodePayload(row: SqlRow, code: string): RecoveryAuthorizationPayload {
  const candidate: Record<string, unknown> = Object.create(null)
  for (const key of RECOVERY_AUTHORIZATION_PAYLOAD_KEYS) {
    const value = row[`payload_${snakeCase(key)}`]
    if (PAYLOAD_BOOLEAN_KEYS.has(key)) {
      candidate[key] = booleanInteger(value, code)
    } else if (PAYLOAD_INTEGER_KEYS.has(key)) {
      candidate[key] = integer(value, code)
    } else {
      candidate[key] = text(value, code)
    }
  }
  try {
    const bytes = serializeExactObject(
      RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
      candidate as RecoveryAuthorizationPayload,
    )
    return Object.freeze({
      ...parseRecoveryPayload(bytes, 'authorization'),
    }) as RecoveryAuthorizationPayload
  } catch {
    fail(code)
  }
}

function payloadValue(
  payload: RecoveryAuthorizationPayload,
  key: (typeof RECOVERY_AUTHORIZATION_PAYLOAD_KEYS)[number],
): unknown {
  return (payload as unknown as Readonly<Record<string, unknown>>)[key]
}

function canonicalPayload(payload: RecoveryAuthorizationPayload): string {
  return decoder.decode(serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, payload))
}

function parseStoredJwsPayload(
  value: string,
  digest: string,
  code: string,
): RecoveryAuthorizationPayload {
  if (value.length < 1 || value.length > 16_384 || !sha(digest)) fail(code)
  let payload: RecoveryAuthorizationPayload
  try {
    const parsed = parseRecoveryCompactJws(value, 'authorization')
    payload = Object.freeze({
      ...parseRecoveryPayload(parsed.payloadBytes, 'authorization'),
    }) as RecoveryAuthorizationPayload
  } catch {
    fail(code)
  }
  if (bytesToHex(sha256(encoder.encode(value))) !== digest) fail(code)
  return payload
}

function buildAuthorizationSnapshot(
  arming: RecoveryArmingTuple,
  core: SqlRow,
  code: string,
): LedgerAuthorizationSnapshot {
  const locators: LedgerRequestLocators = Object.freeze({
    requestId: text(core.request_id, code),
    candidateCommit: text(core.locator_candidate_commit, code),
    sourceVerifyRunId: text(core.locator_source_verify_run_id, code),
    sourceVerifyRunAttempt: text(core.locator_source_verify_run_attempt, code),
    artifactId: text(core.locator_artifact_id, code),
  })
  if (
    !UUID.test(locators.requestId)
    || !commit(locators.candidateCommit)
    || !positive(locators.sourceVerifyRunId)
    || !positive(locators.sourceVerifyRunAttempt)
    || !positive(locators.artifactId)
  ) fail(code)

  const workflowIdentity: LedgerStableWorkflowIdentity = Object.freeze({
    repository: text(core.workflow_identity_repository, code) as LedgerStableWorkflowIdentity['repository'],
    repositoryId: text(core.workflow_identity_repository_id, code) as LedgerStableWorkflowIdentity['repositoryId'],
    repositoryOwnerId: text(core.workflow_identity_repository_owner_id, code) as LedgerStableWorkflowIdentity['repositoryOwnerId'],
    ref: text(core.workflow_identity_ref, code) as LedgerStableWorkflowIdentity['ref'],
    workflowRef: text(core.workflow_identity_workflow_ref, code) as LedgerStableWorkflowIdentity['workflowRef'],
    environment: text(core.workflow_identity_environment, code) as LedgerStableWorkflowIdentity['environment'],
    eventName: text(core.workflow_identity_event_name, code) as LedgerStableWorkflowIdentity['eventName'],
    workflowSha: text(core.workflow_identity_workflow_sha, code),
    pagesRunId: text(core.workflow_identity_pages_run_id, code),
    pagesRunAttempt: text(core.workflow_identity_pages_run_attempt, code),
    checkRunId: text(core.workflow_identity_check_run_id, code),
  })
  if (
    workflowIdentity.repository !== GITHUB_REPOSITORY
    || workflowIdentity.repositoryId !== '1273513252'
    || workflowIdentity.repositoryOwnerId !== '183124839'
    || workflowIdentity.ref !== 'refs/heads/main'
    || workflowIdentity.workflowRef !== `${GITHUB_REPOSITORY}/.github/workflows/deploy-pages.yml@refs/heads/main`
    || workflowIdentity.environment !== 'github-pages'
    || workflowIdentity.eventName !== 'workflow_run'
    || !commit(workflowIdentity.workflowSha)
    || !positive(workflowIdentity.pagesRunId)
    || !positive(workflowIdentity.pagesRunAttempt)
    || !positive(workflowIdentity.checkRunId)
  ) fail(code)

  const authorizationJti = text(core.authorization_jti, code)
  const authorizationEpoch = positiveInteger(core.snapshot_authorization_epoch, code)
  const issuedAt = integer(core.issued_at, code)
  const notBefore = integer(core.not_before, code)
  const expiresAt = integer(core.expires_at, code)
  const issuanceEvidenceSnapshotDigest = text(core.issuance_evidence_snapshot_digest, code)
  const liveInvariantDigest = text(core.live_invariant_digest, code)
  const candidateTree = text(core.candidate_tree, code)
  const artifactName = text(core.artifact_name, code)
  const githubArtifactArchiveSha256 = text(core.github_artifact_archive_sha256, code)
  const innerArtifactTarSha256 = text(core.inner_artifact_tar_sha256, code)
  const contentManifestSha256 = text(core.content_manifest_sha256, code)
  const deploymentAttestationSha256 = text(core.deployment_attestation_sha256, code)
  const operation = text(core.snapshot_operation, code)
  const canonicalOrigin = text(core.snapshot_canonical_origin, code)

  if (
    !UUID.test(authorizationJti)
    || locators.requestId !== arming.requestId
    || authorizationEpoch !== arming.authorizationEpoch
    || workflowIdentity.repository !== arming.repository
    || workflowIdentity.repositoryId !== arming.repositoryId
    || workflowIdentity.repositoryOwnerId !== arming.repositoryOwnerId
    || workflowIdentity.ref !== arming.ref
    || workflowIdentity.workflowRef !== arming.workflowRef
    || workflowIdentity.environment !== arming.environment
    || workflowIdentity.workflowSha !== locators.candidateCommit
    || notBefore !== issuedAt
    || expiresAt <= issuedAt
    || expiresAt > issuedAt + 900
    || !commit(candidateTree)
    || artifactName !== `github-pages-recovery-${workflowIdentity.pagesRunId}-${workflowIdentity.pagesRunAttempt}`
    || !sha(githubArtifactArchiveSha256)
    || !sha(innerArtifactTarSha256)
    || !sha(contentManifestSha256)
    || !sha(deploymentAttestationSha256)
    || !sha(issuanceEvidenceSnapshotDigest)
    || !sha(liveInvariantDigest)
    || operation !== arming.operation
    || operation !== 'github-pages-production-deploy'
    || canonicalOrigin !== arming.canonicalOrigin
    || canonicalOrigin !== 'https://warpkeep.com'
  ) {
    fail(code)
  }

  return Object.freeze({
    locators,
    workflowIdentity,
    authorizationJti,
    authorizationEpoch,
    issuedAt,
    notBefore,
    expiresAt,
    issuanceEvidenceSnapshotDigest,
    liveInvariantDigest,
    candidateTree,
    artifactName,
    githubArtifactArchiveSha256,
    innerArtifactTarSha256,
    contentManifestSha256,
    deploymentAttestationSha256,
    operation,
    canonicalOrigin,
  })
}

function assertPayloadSnapshot(
  arming: RecoveryArmingTuple,
  authorization: LedgerAuthorizationSnapshot,
  payload: RecoveryAuthorizationPayload,
  code: string,
): void {
  const payloadBindings: ReadonlyArray<readonly [string, unknown]> = [
    ['requestId', arming.requestId],
    ['authorizationEpoch', arming.authorizationEpoch],
    ['repository', arming.repository],
    ['repositoryId', arming.repositoryId],
    ['repositoryOwnerId', arming.repositoryOwnerId],
    ['ref', arming.ref],
    ['workflowRef', arming.workflowRef],
    ['environment', arming.environment],
    ['releaseVersion', arming.releaseVersion],
    ['operation', arming.operation],
    ['canonicalOrigin', arming.canonicalOrigin],
    ['authWorker', arming.authWorker],
    ['sourceClosureProfile', arming.sourceClosureProfile],
    ['sourceClosureSha256', arming.sourceClosureSha256],
    ['recoveryAuthorizationCoreSha256', arming.recoveryAuthorizationCoreSha256],
    ['predecessorCommit', arming.preparationCommit],
    ['genesis001Database', arming.genesis001Database],
    ['genesis002Database', arming.genesis002Database],
    ['ptrDatabase', arming.ptrDatabase],
    ...RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS.map((key) => [key, authorization.locators[key]] as const),
    ...RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS
      .filter((key) => key !== 'checkRunId')
      .map((key) => [key, authorization.workflowIdentity[key]] as const),
    ['jti', authorization.authorizationJti],
    ['iat', authorization.issuedAt],
    ['nbf', authorization.notBefore],
    ['exp', authorization.expiresAt],
    ['candidateTree', authorization.candidateTree],
    ['artifactName', authorization.artifactName],
    ['githubArtifactArchiveSha256', authorization.githubArtifactArchiveSha256],
    ['innerArtifactTarSha256', authorization.innerArtifactTarSha256],
    ['contentManifestSha256', authorization.contentManifestSha256],
    ['deploymentAttestationSha256', authorization.deploymentAttestationSha256],
    ['issuanceEvidenceSnapshotDigest', authorization.issuanceEvidenceSnapshotDigest],
    ['liveInvariantDigest', authorization.liveInvariantDigest],
  ]
  if (payloadBindings.some(([key, expected]) => payloadValue(
    payload,
    key as (typeof RECOVERY_AUTHORIZATION_PAYLOAD_KEYS)[number],
  ) !== expected)) fail(code)
}

function emptyCoreValues(request: string, state: RecoveryLedgerRecord['state'], revision: number): Record<string, SqlValue> {
  const result: Record<string, SqlValue> = Object.create(null)
  for (const column of CORE_COLUMNS) result[column] = null
  result.singleton_key = 1
  result.request_id = request
  result.state = state
  result.revision = revision
  return result
}

function coreValues(record: RecoveryLedgerRecord): Record<string, SqlValue> {
  const row = emptyCoreValues(record.arming.requestId, record.state, record.revision)
  row.last_transition_at = record.lastTransitionAt
  if (record.state === 'armed') return row

  const authorization = record.authorization
  row.locator_candidate_commit = authorization.locators.candidateCommit
  row.locator_source_verify_run_id = authorization.locators.sourceVerifyRunId
  row.locator_source_verify_run_attempt = authorization.locators.sourceVerifyRunAttempt
  row.locator_artifact_id = authorization.locators.artifactId
  for (const key of RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS) {
    row[`workflow_identity_${snakeCase(key)}`] = authorization.workflowIdentity[key]
  }
  row.authorization_jti = authorization.authorizationJti
  row.snapshot_authorization_epoch = authorization.authorizationEpoch
  row.issued_at = authorization.issuedAt
  row.not_before = authorization.notBefore
  row.expires_at = authorization.expiresAt
  row.candidate_tree = authorization.candidateTree
  row.artifact_name = authorization.artifactName
  row.github_artifact_archive_sha256 = authorization.githubArtifactArchiveSha256
  row.inner_artifact_tar_sha256 = authorization.innerArtifactTarSha256
  row.content_manifest_sha256 = authorization.contentManifestSha256
  row.deployment_attestation_sha256 = authorization.deploymentAttestationSha256
  row.snapshot_operation = authorization.operation
  row.snapshot_canonical_origin = authorization.canonicalOrigin
  row.issuance_evidence_snapshot_digest = authorization.issuanceEvidenceSnapshotDigest
  row.live_invariant_digest = authorization.liveInvariantDigest

  if (record.state === 'issuing') {
    row.reserved_payload_json = canonicalPayload(record.reservedPayload)
    row.reserved_at = record.reservedAt
    row.issuing_deadline = record.issuingDeadline
    return row
  }

  if (record.state === 'issued') {
    row.authorization_jws = record.authorizationJws
    row.authorization_jws_sha256 = record.authorizationJwsSha256
    return row
  }

  row.authorization_jws_sha256 = record.authorizationJwsSha256
  if (record.state === 'expired-unused') {
    row.expired_at = record.expiredAt
    row.expiration_source = record.expirationSource
    return row
  }

  row.claim_snapshot_digest = record.claim.claimSnapshotDigest
  row.claim_live_invariant_digest = record.claim.claimLiveInvariantDigest
  row.claim_sequence = record.claim.claimSequence
  row.claimed_at = record.claim.claimedAt
  row.claim_deadline = record.claim.claimDeadline
  if (record.state === 'reconciliation-required') {
    row.reconciliation_attempts = record.reconciliationAttempts
    row.next_reconcile_at = record.nextReconcileAt
  } else if (record.state === 'completed' || record.state === 'not-deployed') {
    row.completed_at = record.completedAt
    row.terminal_outcome = record.outcome
  }
  return row
}

function assertCoreRoundTrip(core: SqlRow, record: RecoveryLedgerRecord, code: string): void {
  const expected = coreValues(record)
  for (const column of CORE_COLUMNS) {
    if (core[column] !== expected[column]) fail(code)
  }
}

function buildRecord(
  arming: RecoveryArmingTuple,
  core: SqlRow,
  payloadRow: SqlRow | undefined,
  code: string,
): RecoveryLedgerRecord {
  if (integer(core.singleton_key, code) !== 1) fail(code)
  const state = text(core.state, code)
  const revision = integer(core.revision, code)
  const storedRequestId = requestId(core.request_id, code)
  if (storedRequestId !== arming.requestId) fail(code)

  if (state === 'armed') {
    if (payloadRow !== undefined) fail(code)
    const record = installLedgerArming(undefined, {
      arming,
      control: Object.freeze({
        enabled: true,
        authorizationEpoch: arming.authorizationEpoch,
        maxConsumedAuthorizationEpoch: arming.authorizationEpoch,
        activeArming: arming,
        usedRequestIds: Object.freeze([arming.requestId]),
        revision: 1,
      }),
    })
    assertCoreRoundTrip(core, record, code)
    return record
  }
  const payload = state === 'issuing'
    ? payloadRow === undefined || integer(payloadRow.singleton_key, code) !== 1
      ? fail(code)
      : decodePayload(payloadRow, code)
    : payloadRow === undefined
      ? undefined
      : fail(code)
  const authorization = buildAuthorizationSnapshot(arming, core, code)
  if (payload !== undefined) assertPayloadSnapshot(arming, authorization, payload, code)
  const lastTransitionAt = integer(core.last_transition_at, code)
  let record: RecoveryLedgerRecord

  if (state === 'issuing') {
    if (payload === undefined) fail(code)
    const reservedAt = integer(core.reserved_at, code)
    const issuingDeadline = integer(core.issuing_deadline, code)
    if (
      revision !== 1
      || lastTransitionAt !== reservedAt
      || reservedAt !== authorization.issuedAt
      || issuingDeadline !== reservedAt + RECOVERY_ISSUING_TIMEOUT_SECONDS
      || core.reserved_payload_json !== canonicalPayload(payload)
    ) fail(code)
    record = Object.freeze({
      state,
      arming,
      revision,
      lastTransitionAt,
      authorization,
      reservedPayload: payload,
      reservedAt,
      issuingDeadline,
    })
  } else if (state === 'issued') {
    const authorizationJws = text(core.authorization_jws, code)
    const authorizationJwsSha256 = text(core.authorization_jws_sha256, code)
    const signedPayload = parseStoredJwsPayload(authorizationJws, authorizationJwsSha256, code)
    assertPayloadSnapshot(arming, authorization, signedPayload, code)
    if (
      revision !== 2
      || lastTransitionAt < authorization.issuedAt
      || lastTransitionAt >= authorization.expiresAt
      || lastTransitionAt >= authorization.issuedAt + RECOVERY_ISSUING_TIMEOUT_SECONDS
    ) fail(code)
    record = Object.freeze({
      state,
      arming,
      revision,
      lastTransitionAt,
      authorization,
      authorizationJws,
      authorizationJwsSha256,
    })
  } else if (state === 'expired-unused') {
    const expirationSource = text(core.expiration_source, code)
    if (expirationSource !== 'issuing' && expirationSource !== 'issued') fail(code)
    const authorizationJwsSha256 = nullableText(core.authorization_jws_sha256, code)
    const expiredAt = integer(core.expired_at, code)
    if (
      (expirationSource === 'issuing' && (
        authorizationJwsSha256 !== null
        || revision !== 2
        || expiredAt < authorization.issuedAt + RECOVERY_ISSUING_TIMEOUT_SECONDS
      ))
      || (expirationSource === 'issued' && (
        authorizationJwsSha256 === null
        || !sha(authorizationJwsSha256)
        || revision !== 3
        || expiredAt < authorization.expiresAt
      ))
      || lastTransitionAt !== expiredAt
    ) fail(code)
    record = Object.freeze({
      state,
      arming,
      revision,
      lastTransitionAt,
      authorization,
      authorizationJwsSha256,
      expiredAt,
      expirationSource,
    })
  } else {
    if (
      state !== 'claimed'
      && state !== 'reconciliation-required'
      && state !== 'completed'
      && state !== 'not-deployed'
    ) fail(code)
    const authorizationJwsSha256 = text(core.authorization_jws_sha256, code)
    const claimSnapshotDigest = text(core.claim_snapshot_digest, code)
    const claimLiveInvariantDigest = text(core.claim_live_invariant_digest, code)
    const claimSequence = integer(core.claim_sequence, code)
    const claimedAt = integer(core.claimed_at, code)
    const claimDeadline = integer(core.claim_deadline, code)
    if (
      !sha(authorizationJwsSha256)
      || !sha(claimSnapshotDigest)
      || claimLiveInvariantDigest !== authorization.liveInvariantDigest
      || claimSnapshotDigest === authorization.issuanceEvidenceSnapshotDigest
      || claimSnapshotDigest === authorization.liveInvariantDigest
      || claimSequence !== 1
      || claimedAt < authorization.issuedAt
      || claimedAt >= authorization.expiresAt
      || claimDeadline !== claimedAt + RECOVERY_CLAIM_DEADLINE_SECONDS
    ) fail(code)
    const claim = Object.freeze({
      claimSnapshotDigest,
      claimLiveInvariantDigest,
      claimSequence: 1 as const,
      claimedAt,
      claimDeadline,
    })
    if (state === 'claimed') {
      if (revision !== 3 || lastTransitionAt !== claimedAt) fail(code)
      record = Object.freeze({
        state,
        arming,
        revision,
        lastTransitionAt,
        authorization,
        authorizationJwsSha256,
        claim,
      })
    } else if (state === 'reconciliation-required') {
      const reconciliationAttempts = integer(core.reconciliation_attempts, code)
      const nextReconcileAt = nullableInteger(core.next_reconcile_at, code)
      if (
        reconciliationAttempts > RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS.length + 1
        || revision !== 4 + reconciliationAttempts
        || lastTransitionAt < claimDeadline
        || ((reconciliationAttempts === 5) !== (nextReconcileAt === null))
      ) fail(code)
      record = Object.freeze({
        state,
        arming,
        revision,
        lastTransitionAt,
        authorization,
        authorizationJwsSha256,
        claim,
        reconciliationAttempts,
        nextReconcileAt,
      })
    } else {
      const outcome = text(core.terminal_outcome, code)
      const completedAt = integer(core.completed_at, code)
      if (
        outcome !== state
        || completedAt !== lastTransitionAt
        || completedAt < claimedAt
        || (state === 'not-deployed' && revision < 5)
        || (state === 'completed' && revision < 4)
      ) fail(code)
      record = Object.freeze({
        state,
        arming,
        revision,
        lastTransitionAt,
        authorization,
        authorizationJwsSha256,
        claim,
        outcome,
        completedAt,
      })
    }
  }
  assertCoreRoundTrip(core, record, code)
  return record
}

function issueReservation(record: RecoveryLedgerRecord): LedgerIssueReservation {
  if (record.state !== 'issuing') fail('RECOVERY_LEDGER_NOT_ISSUING')
  return Object.freeze({
    state: record.state,
    reservedPayload: record.reservedPayload,
    reservedAt: record.reservedAt,
    issuingDeadline: record.issuingDeadline,
    revision: record.revision,
  })
}

function issueResult(record: RecoveryLedgerRecord): LedgerIssueResult {
  if (record.state !== 'issued') fail('RECOVERY_LEDGER_NOT_ISSUED')
  return Object.freeze({
    state: record.state,
    authorizationJws: record.authorizationJws,
    authorizationJwsSha256: record.authorizationJwsSha256,
    expiresAt: record.authorization.expiresAt,
    revision: record.revision,
  })
}

function claimResult(record: RecoveryLedgerRecord): LedgerClaimResult {
  if (record.state !== 'claimed') fail('RECOVERY_LEDGER_ALREADY_CLAIMED')
  return Object.freeze({
    state: record.state,
    requestId: record.arming.requestId,
    authorizationJwsSha256: record.authorizationJwsSha256,
    claimSnapshotDigest: record.claim.claimSnapshotDigest,
    liveInvariantDigest: record.claim.claimLiveInvariantDigest,
    claimSequence: record.claim.claimSequence,
    claimedAt: record.claim.claimedAt,
    claimDeadline: record.claim.claimDeadline,
    rowBindingDigest: ledgerRowBindingDigest(record),
    revision: record.revision,
  })
}

function terminalResult(
  record: LedgerReconciliationRequiredState | LedgerTerminalState,
): LedgerTerminalResult {
  const rowBindingDigest = ledgerRowBindingDigest(record)
  if (record.state === 'reconciliation-required') {
    return Object.freeze({
      state: record.state,
      reconciliationAttempts: record.reconciliationAttempts,
      nextReconcileAt: record.nextReconcileAt,
      rowBindingDigest,
      revision: record.revision,
    })
  }
  return Object.freeze({
    state: record.state,
    outcome: record.outcome,
    completedAt: record.completedAt,
    rowBindingDigest,
    revision: record.revision,
  })
}

function safeRequestStatus(record: RecoveryLedgerRecord): LedgerStatusResult {
  const base = {
    role: 'request' as const,
    requestId: record.arming.requestId,
    state: record.state,
    revision: record.revision,
    alarmDeadline: ledgerAlarmDeadline(record),
  }
  if (record.state === 'armed') return Object.freeze(base)
  if (record.state === 'issuing') {
    return Object.freeze({
      ...base,
      expiresAt: record.authorization.expiresAt,
      reservedAt: record.reservedAt,
      issuingDeadline: record.issuingDeadline,
    })
  }
  if (record.state === 'issued') {
    return Object.freeze({
      ...base,
      authorizationJwsSha256: record.authorizationJwsSha256,
      expiresAt: record.authorization.expiresAt,
    })
  }
  if (record.state === 'expired-unused') {
    return Object.freeze({
      ...base,
      authorizationJwsSha256: record.authorizationJwsSha256,
      expiresAt: record.authorization.expiresAt,
      expiredAt: record.expiredAt,
      expirationSource: record.expirationSource,
    })
  }
  const claimBase = {
    ...base,
    authorizationJwsSha256: record.authorizationJwsSha256,
    expiresAt: record.authorization.expiresAt,
    claimedAt: record.claim.claimedAt,
    claimDeadline: record.claim.claimDeadline,
  }
  if (record.state === 'claimed') return Object.freeze(claimBase)
  if (record.state === 'reconciliation-required') {
    return Object.freeze({
      ...claimBase,
      reconciliationAttempts: record.reconciliationAttempts,
      nextReconcileAt: record.nextReconcileAt,
    })
  }
  return Object.freeze({
    ...claimBase,
    outcome: record.outcome,
    completedAt: record.completedAt,
  })
}

class CasConflict extends Error {}

export class ReleaseRecoveryAuthorizationLedger extends DurableObject<SignerEnv> {
  readonly #name: string | null
  readonly #role: ObjectRole | null
  readonly #identityValid: boolean

  constructor(ctx: DurableObjectState, env: SignerEnv) {
    super(ctx, env)
    const name = ctx.id.name
    this.#name = typeof name === 'string' ? name : null
    this.#role = name === RECOVERY_LEDGER_CONTROL_OBJECT_NAME
      ? 'control'
      : typeof name === 'string' && UUID.test(name)
        ? 'request'
        : null
    let identityValid = false
    try {
      identityValid = this.#name !== null
        && ctx.id.equals(env.RECOVERY_LEDGER.idFromName(this.#name))
    } catch {
      identityValid = false
    }
    this.#identityValid = identityValid

    ctx.blockConcurrencyWhile(async () => {
      if (this.#role === null || !this.#identityValid || this.#name === null) return
      try {
        ctx.storage.sql.exec(RECOVERY_LEDGER_SQL_SCHEMA).toArray()
      } catch (error) {
        if (error instanceof RecoveryLedgerError) throw error
        fail('RECOVERY_LEDGER_STORAGE_FAILED')
      }
    })
  }

  #assertRole(expected: ObjectRole): string {
    if (this.#name === null || this.#role === null || !this.#identityValid) {
      fail('RECOVERY_LEDGER_OBJECT_NAME_INVALID')
    }
    if (this.#role !== expected) fail('RECOVERY_LEDGER_ROLE_MISMATCH')
    return this.#name
  }

  #rows(query: string, ...bindings: unknown[]): SqlRow[] {
    return this.ctx.storage.sql.exec<SqlRow>(query, ...bindings).toArray()
  }

  #assertNoRequestRows(): void {
    const row = this.#rows(`
      SELECT
        (SELECT COUNT(*) FROM recovery_authorization_arming) AS arming_count,
        (SELECT COUNT(*) FROM recovery_authorization_payload) AS payload_count,
        (SELECT COUNT(*) FROM recovery_authorization) AS authorization_count
    `)[0]
    if (
      row === undefined
      || row.arming_count !== 0
      || row.payload_count !== 0
      || row.authorization_count !== 0
    ) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
  }

  #assertNoControlRows(): void {
    const row = this.#rows(`
      SELECT
        (SELECT COUNT(*) FROM recovery_control) AS control_count,
        (SELECT COUNT(*) FROM recovery_used_arming) AS used_count
    `)[0]
    if (row === undefined || row.control_count !== 0 || row.used_count !== 0) {
      fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
    }
  }

  #loadControl(): LedgerControlState | undefined {
    const code = 'RECOVERY_LEDGER_STORAGE_CORRUPT'
    try {
      this.#assertNoRequestRows()
      const controlRow = oneOrNone(this.#rows(
        `SELECT ${CONTROL_COLUMNS.join(', ')} FROM recovery_control WHERE singleton_key = 1`,
      ), code)
      const usedRows = this.#rows(
        'SELECT request_id, authorization_epoch FROM recovery_used_arming ORDER BY authorization_epoch ASC',
      )
      if (controlRow === undefined) {
        if (usedRows.length !== 0) fail(code)
        return undefined
      }
      if (integer(controlRow.singleton_key, code) !== 1) fail(code)
      const enabled = booleanInteger(controlRow.enabled, code)
      const authorizationEpoch = positiveInteger(controlRow.authorization_epoch, code)
      const maxConsumedAuthorizationEpoch = controlRow.max_consumed_authorization_epoch === null
        ? null
        : positiveInteger(controlRow.max_consumed_authorization_epoch, code)
      const revision = integer(controlRow.revision, code)
      const usedRequestIds: string[] = []
      let previousEpoch = 0
      for (const row of usedRows) {
        const id = requestId(row.request_id, code)
        const epoch = positiveInteger(row.authorization_epoch, code)
        if (epoch <= previousEpoch || usedRequestIds.includes(id)) fail(code)
        previousEpoch = epoch
        usedRequestIds.push(id)
      }
      if (
        (maxConsumedAuthorizationEpoch === null) !== (usedRows.length === 0)
        || (maxConsumedAuthorizationEpoch !== null && maxConsumedAuthorizationEpoch !== previousEpoch)
      ) fail(code)

      const activeValues = CONTROL_ACTIVE_ARMING_COLUMNS.map((column) => controlRow[column])
      let activeArming: RecoveryArmingTuple | null
      if (activeValues.every((value) => value === null)) {
        activeArming = null
      } else if (activeValues.every((value) => value !== null)) {
        activeArming = decodeArming(controlRow, 'active_', code)
      } else {
        fail(code)
      }
      const control: LedgerControlState = Object.freeze({
        enabled,
        authorizationEpoch,
        maxConsumedAuthorizationEpoch,
        activeArming,
        usedRequestIds: Object.freeze(usedRequestIds),
        revision,
      })
      reconcileLedgerControl(control, enabled
        ? { enabled: true, authorizationEpoch, arming: activeArming as RecoveryArmingTuple }
        : { enabled: false, authorizationEpoch })
      return control
    } catch (error) {
      if (error instanceof RecoveryLedgerError && error.code === code) throw error
      fail(code)
    }
  }

  #loadRecord(): RecoveryLedgerRecord | undefined {
    const code = 'RECOVERY_LEDGER_STORAGE_CORRUPT'
    try {
      const name = this.#assertRole('request')
      this.#assertNoControlRows()
      const armingRow = oneOrNone(this.#rows(
        `SELECT singleton_key, ${ARMING_COLUMNS.join(', ')} FROM recovery_authorization_arming WHERE singleton_key = 1`,
      ), code)
      const coreRow = oneOrNone(this.#rows(
        `SELECT ${CORE_COLUMNS.join(', ')} FROM recovery_authorization WHERE singleton_key = 1`,
      ), code)
      const payloadRow = oneOrNone(this.#rows(
        `SELECT ${PAYLOAD_COLUMNS.join(', ')} FROM recovery_authorization_payload WHERE singleton_key = 1`,
      ), code)
      if (armingRow === undefined && coreRow === undefined && payloadRow === undefined) return undefined
      if (armingRow === undefined || coreRow === undefined) fail(code)
      if (integer(armingRow.singleton_key, code) !== 1) fail(code)
      const arming = decodeArming(armingRow, '', code)
      if (arming.requestId !== name) fail(code)
      for (const key of RECOVERY_ARMING_TUPLE_KEYS) {
        if (armingRow[snakeCase(key)] !== encodeArmingValue(key, arming[key])) fail(code)
      }
      return buildRecord(arming, coreRow, payloadRow, code)
    } catch (error) {
      if (error instanceof RecoveryLedgerError && error.code === code) throw error
      fail(code)
    }
  }

  #insertControl(control: LedgerControlState): void {
    const values: SqlValue[] = [
      1,
      control.enabled ? 1 : 0,
      control.authorizationEpoch,
      control.maxConsumedAuthorizationEpoch,
      ...RECOVERY_ARMING_TUPLE_KEYS.map((key) => control.activeArming === null
        ? null
        : encodeArmingValue(key, control.activeArming[key])),
      control.revision,
    ]
    const cursor = this.ctx.storage.sql.exec(
      `INSERT INTO recovery_control (${CONTROL_COLUMNS.join(', ')}) VALUES (${CONTROL_COLUMNS.map(() => '?').join(', ')})`,
      ...values,
    )
    cursor.toArray()
    // Cloudflare counts index maintenance in rowsWritten, so a statement
    // targeting one logical row may report more than one physical row write.
    if (cursor.rowsWritten === 0) throw new CasConflict()
  }

  #updateControl(previous: LedgerControlState, next: LedgerControlState): void {
    if (next.revision === previous.revision) return
    if (next.enabled && !previous.enabled) {
      if (next.activeArming === null) fail('RECOVERY_LEDGER_STORAGE_FAILED')
      const insert = this.ctx.storage.sql.exec(
        'INSERT INTO recovery_used_arming (request_id, authorization_epoch) VALUES (?, ?)',
        next.activeArming.requestId,
        next.authorizationEpoch,
      )
      insert.toArray()
      if (insert.rowsWritten === 0) throw new CasConflict()
    }
    const columns = CONTROL_COLUMNS.filter((column) => column !== 'singleton_key')
    const values: SqlValue[] = [
      next.enabled ? 1 : 0,
      next.authorizationEpoch,
      next.maxConsumedAuthorizationEpoch,
      ...RECOVERY_ARMING_TUPLE_KEYS.map((key) => next.activeArming === null
        ? null
        : encodeArmingValue(key, next.activeArming[key])),
      next.revision,
    ]
    const cursor = this.ctx.storage.sql.exec(
      `UPDATE recovery_control SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE singleton_key = 1 AND revision = ?`,
      ...values,
      previous.revision,
    )
    cursor.toArray()
    if (cursor.rowsWritten === 0) throw new CasConflict()
  }

  #insertArmed(record: LedgerArmedState): void {
    const armingValues = RECOVERY_ARMING_TUPLE_KEYS
      .map((key) => encodeArmingValue(key, record.arming[key]))
    const armingCursor = this.ctx.storage.sql.exec(
      `INSERT INTO recovery_authorization_arming (singleton_key, ${ARMING_COLUMNS.join(', ')}) VALUES (${['singleton_key', ...ARMING_COLUMNS].map(() => '?').join(', ')})`,
      1,
      ...armingValues,
    )
    armingCursor.toArray()
    if (armingCursor.rowsWritten === 0) throw new CasConflict()
    const coreCursor = this.ctx.storage.sql.exec(
      'INSERT INTO recovery_authorization (singleton_key, request_id, state, last_transition_at, revision) VALUES (1, ?, ?, ?, ?)',
      record.arming.requestId,
      record.state,
      record.lastTransitionAt,
      record.revision,
    )
    coreCursor.toArray()
    if (coreCursor.rowsWritten === 0) throw new CasConflict()
  }

  #insertPayload(payload: RecoveryAuthorizationPayload): void {
    const cursor = this.ctx.storage.sql.exec(
      `INSERT INTO recovery_authorization_payload (${PAYLOAD_COLUMNS.join(', ')}) VALUES (${PAYLOAD_COLUMNS.map(() => '?').join(', ')})`,
      1,
      ...payloadSqlValues(payload),
    )
    cursor.toArray()
    if (cursor.rowsWritten === 0) throw new CasConflict()
  }

  #updateRecord(previous: RecoveryLedgerRecord, next: RecoveryLedgerRecord): void {
    if (next === previous || next.revision === previous.revision) return
    if (previous.state === 'armed' && next.state === 'issuing') {
      this.#insertPayload(next.reservedPayload)
    }
    const values = coreValues(next)
    const cursor = this.ctx.storage.sql.exec(
      `UPDATE recovery_authorization SET ${CORE_UPDATE_COLUMNS.map((column) => `${column} = ?`).join(', ')} WHERE singleton_key = 1 AND revision = ?`,
      ...CORE_UPDATE_COLUMNS.map((column) => values[column]),
      previous.revision,
    )
    cursor.toArray()
    if (cursor.rowsWritten === 0) throw new CasConflict()
    if (previous.state === 'issuing' && next.state !== 'issuing') {
      const deleted = this.ctx.storage.sql.exec(
        'DELETE FROM recovery_authorization_payload WHERE singleton_key = 1',
      )
      deleted.toArray()
      if (deleted.rowsWritten !== 1) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
    }
  }

  async #repairAlarm(record: RecoveryLedgerRecord): Promise<void> {
    const deadline = ledgerAlarmDeadline(record)
    const scheduled = await this.ctx.storage.getAlarm()
    if (deadline === null) {
      if (scheduled !== null) {
        try {
          await this.ctx.storage.deleteAlarm()
        } catch {
          // Terminal and unused authority remains safe even if a stale alarm is
          // retried. The alarm handler is a no-op for these rows.
        }
      }
      return
    }
    const expected = deadline * 1_000
    if (!Number.isSafeInteger(expected) || expected < 0) {
      fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
    }
    if (scheduled !== expected) await this.ctx.storage.setAlarm(expected)
  }

  async #updateRecordWithAlarm(
    previous: RecoveryLedgerRecord,
    next: RecoveryLedgerRecord,
    deadline: number,
  ): Promise<void> {
    const scheduledTime = deadline * 1_000
    if (!Number.isSafeInteger(scheduledTime) || scheduledTime < 0) {
      fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
    }
    await this.ctx.storage.transaction(async transaction => {
      // SQLite-backed Durable Objects include direct SQL storage operations
      // in this explicit transaction. Alarm installation and the SQL CAS are
      // therefore durable together: either the old row/alarm survive, or the
      // new row already has its exact deadline.
      await transaction.setAlarm(scheduledTime)
      this.#updateRecord(previous, next)
    })
  }

  async #applyEventWithRejectedAlarmRepair(
    current: RecoveryLedgerRecord,
    event: LedgerEvent,
  ): Promise<RecoveryLedgerRecord> {
    try {
      return applyLedgerEvent(current, event)
    } catch (error) {
      try {
        await this.#repairAlarm(current)
      } catch {
        // A repair failure must not replace the exact domain rejection. A
        // later read or the existing alarm can retry the same stored deadline.
      }
      throw error
    }
  }

  async #withPublicErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof RecoveryLedgerError) throw new Error(error.code)
      if (error instanceof CasConflict) throw new Error('RECOVERY_LEDGER_CONFLICT')
      throw new Error('RECOVERY_LEDGER_STORAGE_FAILED')
    }
  }

  async reconcileControl(input: LedgerControlInput): Promise<LedgerControlState> {
    return this.#withPublicErrors(async () => {
      this.#assertRole('control')
      const parsed = exactControlInput(input)
      let result: LedgerControlState | undefined
      this.ctx.storage.transactionSync(() => {
        const current = this.#loadControl()
        if (current === undefined) {
          const initial = createLedgerControl({ authorizationEpoch: parsed.authorizationEpoch })
          this.#insertControl(initial)
          result = reconcileLedgerControl(initial, parsed)
          this.#updateControl(initial, result)
        } else {
          result = reconcileLedgerControl(current, parsed)
          this.#updateControl(current, result)
        }
      })
      if (result === undefined) fail('RECOVERY_LEDGER_STORAGE_FAILED')
      return result
    })
  }

  async installArming(input: LedgerArmingInput): Promise<LedgerArmedState> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      const source = exactData(input, ['arming', 'control'], 'RECOVERY_LEDGER_INSTALL_INVALID')
      let result: LedgerArmedState | undefined
      this.ctx.storage.transactionSync(() => {
        const current = this.#loadRecord()
        const installed = installLedgerArming(current, {
          arming: source.arming as RecoveryArmingTuple,
          control: source.control as LedgerControlState,
        })
        if (installed.arming.requestId !== name) fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
        if (current === undefined) this.#insertArmed(installed)
        result = installed
      })
      if (result === undefined) fail('RECOVERY_LEDGER_STORAGE_FAILED')
      return result
    })
  }

  async reserveIssue(input: LedgerReserveIssueInput): Promise<LedgerIssueReservation> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      let source: Readonly<Record<string, unknown>>
      try {
        source = exactData(
          input,
          ['control', 'locators', 'identity', 'payload', 'now'],
          'RECOVERY_LEDGER_EVENT_INVALID',
        )
      } catch {
        source = exactData(
          input,
          ['control', 'locators', 'identity', 'now'],
          'RECOVERY_LEDGER_EVENT_INVALID',
        )
      }
      const event = Object.freeze({ type: 'reserve-issue', ...source }) as Extract<LedgerEvent, { type: 'reserve-issue' }>
      let current = this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state !== 'issuing' || next.authorization.locators.requestId !== name) {
        fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      }
      if (next !== current) {
        const previousRevision = current.revision
        try {
          await this.#updateRecordWithAlarm(current, next, next.issuingDeadline)
        } catch (error) {
          const fresh = this.#loadRecord()
          if (fresh === undefined || fresh.revision === previousRevision) throw error
          current = fresh
          try {
            next = await this.#applyEventWithRejectedAlarmRepair(current, event)
          } catch (retryError) {
            throw retryError
          }
        }
      }
      await this.#repairAlarm(next)
      return issueReservation(next)
    })
  }

  async finalizeIssue(input: LedgerFinalizeIssueInput): Promise<LedgerIssueResult> {
    return this.#withPublicErrors(async () => {
      const source = exactData(input, [
        'control', 'locators', 'identity', 'authorizationJws',
        'authorizationJwsSha256', 'now',
      ], 'RECOVERY_LEDGER_EVENT_INVALID')
      const event = Object.freeze({ type: 'finalize-issue', ...source }) as Extract<LedgerEvent, { type: 'finalize-issue' }>
      let current = this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const name = this.#assertRole('request')
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state !== 'issued' || next.authorization.locators.requestId !== name) {
        fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      }
      if (next !== current) {
        const previousRevision = current.revision
        try {
          await this.#updateRecordWithAlarm(current, next, next.authorization.expiresAt)
        } catch (error) {
          const fresh = this.#loadRecord()
          if (fresh === undefined || fresh.revision === previousRevision) throw error
          current = fresh
          try {
            next = await this.#applyEventWithRejectedAlarmRepair(current, event)
          } catch (retryError) {
            throw retryError
          }
        }
      }
      await this.#repairAlarm(next)
      return issueResult(next)
    })
  }

  async readIssued(input: LedgerReadInput): Promise<LedgerIssueResult> {
    return this.#withPublicErrors(async () => {
      const source = exactData(
        input,
        ['control', 'locators', 'identity', 'now'],
        'RECOVERY_LEDGER_EVENT_INVALID',
      )
      const event = Object.freeze({ type: 'read-issued', ...source }) as Extract<LedgerEvent, { type: 'read-issued' }>
      const current = this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const name = this.#assertRole('request')
      const next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state === 'expired-unused') {
        this.ctx.storage.transactionSync(() => this.#updateRecord(current, next))
        await this.#repairAlarm(next)
        fail('RECOVERY_LEDGER_AUTHORIZATION_EXPIRED')
      }
      if (next.state !== 'issued' || next.authorization.locators.requestId !== name) {
        fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      }
      await this.#repairAlarm(next)
      return issueResult(next)
    })
  }

  async claim(input: LedgerClaimInput): Promise<LedgerClaimResult> {
    return this.#withPublicErrors(async () => {
      const source = exactData(input, [
        'control', 'locators', 'identity', 'authorizationJws',
        'liveInvariantDigest', 'claimSnapshotDigest', 'now',
      ], 'RECOVERY_LEDGER_EVENT_INVALID')
      const event = Object.freeze({ type: 'claim', ...source }) as Extract<LedgerEvent, { type: 'claim' }>
      let current = this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const name = this.#assertRole('request')
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state === 'expired-unused') {
        this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecord, next))
        await this.#repairAlarm(next)
        fail('RECOVERY_LEDGER_AUTHORIZATION_EXPIRED')
      }
      if (next.state !== 'claimed' || next.authorization.locators.requestId !== name) {
        fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      }
      // Keep the earlier JWS-expiry alarm until the transaction has deleted
      // the raw JWS and committed the claim. A stale delivery cannot consume
      // the claim; it only repairs the fixed, later claim deadline.
      await this.#repairAlarm(current)
      const previousRevision = current.revision
      try {
        this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecord, next))
      } catch (error) {
        const fresh = this.#loadRecord()
        if (fresh === undefined || fresh.revision === previousRevision) throw error
        current = fresh
        try {
          next = await this.#applyEventWithRejectedAlarmRepair(current, event)
        } catch (retryError) {
          throw retryError
        }
      }
      await this.#repairAlarm(next)
      return claimResult(next)
    })
  }

  async complete(input: LedgerCompleteInput): Promise<LedgerTerminalResult> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      const source = exactData(input, ['requestId', 'proof', 'now'], 'RECOVERY_LEDGER_EVENT_INVALID')
      if (requestId(source.requestId) !== name) fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      let current = this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const event = Object.freeze({
        type: 'complete',
        proof: source.proof,
        now: source.now,
      }) as Extract<LedgerEvent, { type: 'complete' }>
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state !== 'completed' && next.state !== 'not-deployed') {
        fail('RECOVERY_LEDGER_COMPLETION_STATE_INVALID')
      }
      if (next !== current) {
        const previousRevision = current.revision
        try {
          this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecord, next))
        } catch (error) {
          const fresh = this.#loadRecord()
          if (fresh === undefined || fresh.revision === previousRevision) throw error
          current = fresh
          next = await this.#applyEventWithRejectedAlarmRepair(current, event)
          if (
            (next.state !== 'completed' && next.state !== 'not-deployed')
            || next !== current
          ) throw new CasConflict()
        }
      }
      try {
        await this.ctx.storage.deleteAlarm()
      } catch {
        // The terminal row is authoritative; a leftover alarm is a no-op.
      }
      return terminalResult(next)
    })
  }

  async #readReconciliationProof(
    record: LedgerClaimedState | LedgerReconciliationRequiredState,
  ): Promise<LedgerReconciliationProof> {
    try {
      const proof = await readDeploymentReconciliationProof(record)
      const prototype = proof === null || typeof proof !== 'object'
        ? null
        : Object.getPrototypeOf(proof)
      if (prototype !== Object.prototype && prototype !== null) {
        return Object.freeze({ outcome: 'ambiguous' })
      }
      return proof
    } catch {
      return Object.freeze({ outcome: 'ambiguous' })
    }
  }

  async #reconcileDue(
    current: LedgerReconciliationRequiredState,
  ): Promise<LedgerReconciliationRequiredState | LedgerTerminalState> {
    const proof = await this.#readReconciliationProof(current)
    const now = Math.floor(Date.now() / 1_000)
    let next: RecoveryLedgerRecord
    try {
      next = applyLedgerEvent(current, Object.freeze({
        type: 'reconcile',
        proof,
        now,
      }))
    } catch {
      // A malformed, stale, or incorrectly row-bound reader result is
      // indistinguishable from ambiguity. It must consume only the bounded
      // fail-closed retry schedule and can never become terminal evidence.
      next = applyLedgerEvent(current, Object.freeze({
        type: 'reconcile',
        proof: Object.freeze({ outcome: 'ambiguous' }),
        now,
      }))
    }
    if (next.state !== 'reconciliation-required' && next.state !== 'completed' && next.state !== 'not-deployed') {
      fail('RECOVERY_LEDGER_RECONCILIATION_STATE_INVALID')
    }
    this.ctx.storage.transactionSync(() => this.#updateRecord(current, next))
    await this.#repairAlarm(next)
    return next
  }

  async reconcile(input: LedgerReconcileInput): Promise<LedgerTerminalResult> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      const source = exactData(input, ['requestId'], 'RECOVERY_LEDGER_EVENT_INVALID')
      if (requestId(source.requestId) !== name) fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      const current = this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      if (current.state !== 'reconciliation-required') {
        try {
          await this.#repairAlarm(current)
        } catch {
          // Preserve the exact state rejection; later reads retry repair.
        }
        fail('RECOVERY_LEDGER_RECONCILIATION_STATE_INVALID')
      }
      const now = Math.floor(Date.now() / 1_000)
      const deadline = ledgerAlarmDeadline(current)
      if (deadline === null) fail('RECOVERY_LEDGER_RECONCILIATION_EXHAUSTED')
      if (now < deadline) {
        await this.#repairAlarm(current)
        fail('RECOVERY_LEDGER_RECONCILIATION_NOT_DUE')
      }
      const next = await this.#reconcileDue(current)
      return terminalResult(next)
    })
  }

  async status(...args: []): Promise<LedgerStatusResult> {
    return this.#withPublicErrors(async () => {
      if (args.length !== 0) fail('RECOVERY_LEDGER_EVENT_INVALID')
      if (this.#role === 'control') {
        this.#assertRole('control')
        return Object.freeze({ role: 'control', control: this.#loadControl() ?? null })
      }
      const name = this.#assertRole('request')
      const record = this.#loadRecord()
      if (record === undefined) {
        return Object.freeze({
          role: 'request',
          requestId: name,
          state: null,
          revision: null,
          alarmDeadline: null,
        })
      }
      await this.#repairAlarm(record)
      return safeRequestStatus(record)
    })
  }

  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.#withPublicErrors(async () => {
      // The scheduled timestamp describes the original alarm, not when this
      // delivery is actually being processed. Cloudflare alarms are
      // at-least-once and may be delayed, so all transitions and retry
      // deadlines are anchored to the observed wall clock.
      void info
      this.#assertRole('request')
      let current = this.#loadRecord()
      if (current === undefined) return
      let deadline = ledgerAlarmDeadline(current)
      if (deadline === null) {
        await this.#repairAlarm(current)
        return
      }
      const now = Math.floor(Date.now() / 1_000)
      if (now < deadline) {
        await this.#repairAlarm(current)
        return
      }

      if (current.state === 'issuing' || current.state === 'issued' || current.state === 'claimed') {
        const next = applyLedgerEvent(current, Object.freeze({ type: 'alarm', now }))
        this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecord, next))
        current = next
      }
      if (current.state === 'reconciliation-required') {
        deadline = ledgerAlarmDeadline(current)
        if (deadline !== null && now < deadline) {
          await this.#repairAlarm(current)
          return
        }
        await this.#reconcileDue(current)
        return
      }
      await this.#repairAlarm(current)
    })
  }
}
