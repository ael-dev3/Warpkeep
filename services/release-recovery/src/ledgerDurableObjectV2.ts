import { DurableObject } from 'cloudflare:workers'
import { assertPreparationArming, assertPreparationControl, choosePreparationIntent, snapshotPreparationIntent,
  snapshotPreparationReservation, type PreparationIntent, type PreparationReservationInput } from './preparationIntent.js'
import { verifyPreparationReceipt } from './preparationReceipt.js'

import type { GitHubAppEnvironment, RecoveryArmingTuple } from './config.js'
import { RecoveryGitHubError } from './config.js'
import type { RecoveryAuthorizationPayload } from './crypto.js'
import {
  GITHUB_EVIDENCE_METADATA_KEYS,
  githubEvidenceMetadataSha256,
  snapshotGitHubEvidenceMetadata,
  type GitHubEvidenceMetadata,
} from './githubEvidenceMetadata.js'
import type { GitHubWorkflowIdentity } from './githubOidc.js'
import {
  RECOVERY_CLAIM_DEADLINE_SECONDS_V2,
  RECOVERY_ISSUING_TIMEOUT_SECONDS_V2,
  RecoveryLedgerV2Error,
  applyLedgerV2Event,
  createLedgerV2Control,
  installLedgerV2Arming,
  ledgerV2AlarmDeadline,
  readClaimedProjection as projectClaimedLedgerV2Row,
  reconcileLedgerV2Control,
  type LedgerSignerClaimProjection,
  type LedgerV2ArmedState,
  type LedgerV2AuthorizationSnapshot,
  type LedgerV2ClaimSnapshot,
  type LedgerV2ControlState,
  type LedgerV2Event,
  type LedgerV2ReconciliationProof,
  type RecoveryLedgerRecordV2,
} from './ledgerV2.js'
import {
  createDeploymentReconciliationProofReader,
  type DeploymentReconciliationProofReader,
  type DeploymentReconciliationProofReaderFactory,
} from './reconciliationEvidence.js'

export const RECOVERY_LEDGER_V2_CONTROL_OBJECT_NAME = 'warpkeep-release-recovery-control-v2'

export type LedgerV2ControlInput = Readonly<{
  enabled: boolean
  authorizationEpoch: number
  arming?: RecoveryArmingTuple
}>

export type LedgerV2ArmingInput = Readonly<{
  arming: RecoveryArmingTuple
  control: LedgerV2ControlState
}>

export type LedgerV2ReserveIssueInput = Omit<
  Extract<LedgerV2Event, { type: 'reserve-issue' }>,
  'type'
>
export type LedgerV2FinalizeIssueInput = Omit<
  Extract<LedgerV2Event, { type: 'finalize-issue' }>,
  'type'
>
export type LedgerV2ReadInput = Omit<
  Extract<LedgerV2Event, { type: 'read-issued' }>,
  'type'
>
export type LedgerV2ClaimInput = Omit<Extract<LedgerV2Event, { type: 'claim' }>, 'type'>
export type LedgerV2CompleteInput = Readonly<{
  requestId: string
  proof: Extract<LedgerV2Event, { type: 'complete' }>['proof']
  now: number
}>
export type LedgerV2ProjectionInput = Readonly<{ requestId: string }>

export type LedgerV2IssueReservation = Readonly<{
  authorization: LedgerV2AuthorizationSnapshot
  reservedPayload: RecoveryAuthorizationPayload
  issuingDeadline: number
  revision: number
}>

export type LedgerV2IssueResult = Readonly<{
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJws: string
  authorizationJwsSha256: string
  revision: number
}>

export type LedgerV2ClaimResult = Readonly<{
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerV2ClaimSnapshot
  revision: number
}>

export type LedgerV2TerminalResult = Readonly<{
  state: 'completed' | 'not-deployed'
  requestId: string
  outcome: 'completed' | 'not-deployed'
  completedAt: number
  revision: number
}>

export type LedgerV2StatusResult =
  | Readonly<{
      role: 'control'
      control: null | Readonly<{
        enabled: boolean
        authorizationEpoch: number
        maxConsumedAuthorizationEpoch: number | null
        activeRequestId: string | null
        revision: number
      }>
    }>
  | Readonly<{
      role: 'request'
      requestId: string
      state: RecoveryLedgerRecordV2['state'] | null
      revision: number | null
      alarmDeadline: number | null
      reconciliationAttempts?: number
      nextReconcileAt?: number | null
      terminal?: Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number }>
    }>

type ObjectRole = 'control' | 'request'
type SqlRow = Record<string, SqlStorageValue>
type SqlValue = ArrayBuffer | string | number | null

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const COMMIT = /^[0-9a-f]{40}$/u
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/u
const encoder = new TextEncoder()

const AUTHORIZATION_KEYS = Object.freeze([
  'locators', 'workflowIdentity', 'authorizationJti', 'authorizationEpoch',
  'issuedAt', 'notBefore', 'expiresAt', 'issuanceEvidenceSnapshotDigest',
  'liveInvariantDigest', 'candidateTree', 'artifactName',
  'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
  'contentManifestSha256', 'deploymentAttestationSha256', 'operation',
  'canonicalOrigin', 'githubMetadata', 'githubMetadataSha256',
] as const)

const LOCATOR_KEYS = Object.freeze([
  'requestId', 'candidateCommit', 'sourceVerifyRunId', 'sourceVerifyRunAttempt',
  'artifactId',
] as const)

const WORKFLOW_IDENTITY_KEYS = Object.freeze([
  'repository', 'repositoryId', 'repositoryOwnerId', 'ref', 'workflowRef',
  'environment', 'eventName', 'workflowSha', 'pagesRunId', 'pagesRunAttempt',
  'checkRunId',
] as const)

const CLAIM_KEYS = Object.freeze([
  'claimSnapshotDigest', 'claimLiveInvariantDigest', 'claimSequence', 'claimedAt',
  'claimDeadline',
] as const)

const RECORD_KEYS = Object.freeze({
  armed: ['state', 'arming', 'revision', 'lastTransitionAt'],
  issuing: [
    'state', 'arming', 'revision', 'lastTransitionAt', 'authorization',
    'reservedPayload', 'reservedAt', 'issuingDeadline',
  ],
  issued: [
    'state', 'arming', 'revision', 'lastTransitionAt', 'authorization',
    'authorizationJws', 'authorizationJwsSha256',
  ],
  claimed: [
    'state', 'arming', 'revision', 'lastTransitionAt', 'authorization',
    'authorizationJwsSha256', 'claim',
  ],
  'reconciliation-required': [
    'state', 'arming', 'revision', 'lastTransitionAt', 'authorization',
    'authorizationJwsSha256', 'claim', 'reconciliationAttempts',
    'nextReconcileAt',
  ],
  completed: [
    'state', 'arming', 'revision', 'lastTransitionAt', 'authorization',
    'authorizationJwsSha256', 'claim', 'outcome', 'completedAt',
  ],
  'not-deployed': [
    'state', 'arming', 'revision', 'lastTransitionAt', 'authorization',
    'authorizationJwsSha256', 'claim', 'outcome', 'completedAt',
  ],
  'expired-unused': [
    'state', 'arming', 'revision', 'lastTransitionAt', 'authorization',
    'authorizationJwsSha256', 'expiredAt', 'expirationSource',
  ],
} as const)

const RECOVERY_LEDGER_V2_SQL_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recovery_v2_preparation_intents (
  authorization_epoch INTEGER PRIMARY KEY CHECK (authorization_epoch > 0),
  request_id TEXT NOT NULL UNIQUE,
  intent_json TEXT NOT NULL CHECK (json_valid(intent_json)),
  receipt_jws TEXT
);
CREATE TRIGGER IF NOT EXISTS recovery_v2_preparation_immutable_update
BEFORE UPDATE ON recovery_v2_preparation_intents
WHEN NEW.authorization_epoch <> OLD.authorization_epoch OR NEW.request_id <> OLD.request_id
  OR NEW.intent_json <> OLD.intent_json OR OLD.receipt_jws IS NOT NULL OR NEW.receipt_jws IS NULL
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_PREPARATION_IMMUTABLE');
END;
CREATE TRIGGER IF NOT EXISTS recovery_v2_preparation_immutable_delete
BEFORE DELETE ON recovery_v2_preparation_intents
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_PREPARATION_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_v2_control (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  control_json TEXT NOT NULL CHECK (json_valid(control_json)),
  revision INTEGER NOT NULL CHECK (revision >= 0)
);

CREATE TRIGGER IF NOT EXISTS recovery_v2_control_transition_guard
BEFORE UPDATE ON recovery_v2_control
WHEN NEW.singleton_key <> OLD.singleton_key OR NEW.revision <> OLD.revision + 1
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_CONTROL_TRANSITION_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS recovery_v2_control_immutable_delete
BEFORE DELETE ON recovery_v2_control
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_CONTROL_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_v2_authorization_arming (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  request_id TEXT NOT NULL UNIQUE,
  arming_json TEXT NOT NULL CHECK (json_valid(arming_json))
);

CREATE TRIGGER IF NOT EXISTS recovery_v2_arming_immutable_update
BEFORE UPDATE ON recovery_v2_authorization_arming
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_ARMING_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_v2_arming_immutable_delete
BEFORE DELETE ON recovery_v2_authorization_arming
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_ARMING_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_v2_authorization (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  request_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN (
    'armed', 'issuing', 'issued', 'claimed', 'reconciliation-required',
    'completed', 'expired-unused', 'not-deployed'
  )),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  last_transition_at INTEGER,
  alarm_deadline INTEGER,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  FOREIGN KEY (request_id) REFERENCES recovery_v2_authorization_arming(request_id) ON DELETE RESTRICT,
  CHECK (json_extract(record_json, '$.state') = state),
  CHECK (json_extract(record_json, '$.revision') = revision),
  CHECK (
    (last_transition_at IS NULL AND json_type(record_json, '$.lastTransitionAt') = 'null')
    OR json_extract(record_json, '$.lastTransitionAt') = last_transition_at
  ),
  CHECK (
    (state = 'issued' AND json_type(record_json, '$.authorizationJws') = 'text')
    OR (state <> 'issued' AND json_type(record_json, '$.authorizationJws') IS NULL)
  ),
  CHECK (
    (state = 'issuing' AND json_type(record_json, '$.reservedPayload') = 'object')
    OR (state <> 'issuing' AND json_type(record_json, '$.reservedPayload') IS NULL)
  )
);

CREATE TRIGGER IF NOT EXISTS recovery_v2_authorization_transition_guard
BEFORE UPDATE ON recovery_v2_authorization
WHEN NOT (
  NEW.singleton_key = OLD.singleton_key
  AND NEW.request_id = OLD.request_id
  AND NEW.revision = OLD.revision + 1
  AND (
    (OLD.state = 'armed' AND NEW.state = 'issuing')
    OR (OLD.state = 'issuing' AND NEW.state IN ('issued', 'expired-unused'))
    OR (OLD.state = 'issued' AND NEW.state IN ('claimed', 'expired-unused'))
    OR (OLD.state = 'claimed' AND NEW.state IN ('completed', 'reconciliation-required'))
    OR (OLD.state = 'reconciliation-required' AND NEW.state IN (
      'reconciliation-required', 'completed', 'not-deployed'
    ))
  )
)
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_TRANSITION_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS recovery_v2_authorization_immutable_delete
BEFORE DELETE ON recovery_v2_authorization
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_AUTHORIZATION_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_v2_authorization_binding (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  request_id TEXT NOT NULL UNIQUE,
  authorization_json TEXT NOT NULL CHECK (json_valid(authorization_json)),
  github_metadata_json TEXT NOT NULL CHECK (json_valid(github_metadata_json)),
  github_metadata_sha256 TEXT NOT NULL CHECK (
    length(github_metadata_sha256) = 64 AND github_metadata_sha256 = lower(github_metadata_sha256)
  ),
  authorization_jws_sha256 TEXT CHECK (
    authorization_jws_sha256 IS NULL
    OR (length(authorization_jws_sha256) = 64 AND authorization_jws_sha256 = lower(authorization_jws_sha256))
  ),
  FOREIGN KEY (request_id) REFERENCES recovery_v2_authorization_arming(request_id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS recovery_v2_github_metadata_immutable_update
BEFORE UPDATE ON recovery_v2_authorization_binding
WHEN NOT (
  NEW.singleton_key = OLD.singleton_key
  AND NEW.request_id = OLD.request_id
  AND NEW.authorization_json = OLD.authorization_json
  AND NEW.github_metadata_json = OLD.github_metadata_json
  AND NEW.github_metadata_sha256 = OLD.github_metadata_sha256
  AND OLD.authorization_jws_sha256 IS NULL
  AND NEW.authorization_jws_sha256 IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_METADATA_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_v2_authorization_binding_immutable_delete
BEFORE DELETE ON recovery_v2_authorization_binding
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_BINDING_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_v2_authorization_payload (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  request_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  FOREIGN KEY (request_id) REFERENCES recovery_v2_authorization_arming(request_id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS recovery_v2_payload_immutable_update
BEFORE UPDATE ON recovery_v2_authorization_payload
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_PAYLOAD_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_v2_payload_delete_guard
BEFORE DELETE ON recovery_v2_authorization_payload
WHEN NOT EXISTS (
  SELECT 1 FROM recovery_v2_authorization
  WHERE singleton_key = 1 AND state IN ('issued', 'expired-unused')
)
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_PAYLOAD_DELETE_INVALID');
END;

CREATE TABLE IF NOT EXISTS recovery_v2_claim_binding (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  request_id TEXT NOT NULL UNIQUE,
  claim_json TEXT NOT NULL CHECK (json_valid(claim_json)),
  FOREIGN KEY (request_id) REFERENCES recovery_v2_authorization_arming(request_id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS recovery_v2_claim_immutable_update
BEFORE UPDATE ON recovery_v2_claim_binding
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_CLAIM_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_v2_claim_immutable_delete
BEFORE DELETE ON recovery_v2_claim_binding
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_V2_SQL_CLAIM_IMMUTABLE');
END;
`.trimStart().replace(/\r\n?/gu, '\n')

function fail(code: string): never {
  throw new RecoveryLedgerV2Error(code)
}

function exactData(value: unknown, keys: readonly string[], code: string): Readonly<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== 'object') fail(code)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail(code)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(descriptors)
    if (
      ownKeys.length !== keys.length
      || ownKeys.some((key) => typeof key !== 'string')
      || keys.some((key, index) => ownKeys[index] !== key)
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
    if (error instanceof RecoveryLedgerV2Error) throw error
    fail(code)
  }
}

function plainObject(value: unknown, keys: readonly string[], code: string): Readonly<Record<string, unknown>> {
  return exactData(value, keys, code)
}

function parseCanonicalJson(text: unknown, code: string): unknown {
  if (typeof text !== 'string') fail(code)
  try {
    const parsed: unknown = JSON.parse(text)
    if (JSON.stringify(parsed) !== text) fail(code)
    return parsed
  } catch (error) {
    if (error instanceof RecoveryLedgerV2Error) throw error
    fail(code)
  }
}

function integer(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code)
  return value as number
}

function positiveInteger(value: unknown, code: string): number {
  const result = integer(value, code)
  if (result < 1) fail(code)
  return result
}

function nullableInteger(value: unknown, code: string): number | null {
  return value === null ? null : integer(value, code)
}

function textValue(value: unknown, code: string): string {
  if (typeof value !== 'string') fail(code)
  return value
}

function sha256Value(value: unknown, code: string): string {
  const result = textValue(value, code)
  if (!SHA256.test(result)) fail(code)
  return result
}

async function rawSha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function canonicalJson(value: unknown): string {
  try {
    const result = JSON.stringify(value)
    if (typeof result !== 'string') fail('RECOVERY_LEDGER_STORAGE_FAILED')
    return result
  } catch (error) {
    if (error instanceof RecoveryLedgerV2Error) throw error
    fail('RECOVERY_LEDGER_STORAGE_FAILED')
  }
}

function rpcSnapshot<T>(value: T): T {
  try {
    return JSON.parse(canonicalJson(value)) as T
  } catch {
    fail('RECOVERY_LEDGER_STORAGE_FAILED')
  }
}

function oneOrNone(rows: readonly SqlRow[], code: string): SqlRow | undefined {
  if (rows.length > 1) fail(code)
  return rows[0]
}

function validatedArming(value: unknown, canonical: string, code: string): RecoveryArmingTuple {
  const source = value as RecoveryArmingTuple
  const epoch = (value as { authorizationEpoch?: unknown } | null)?.authorizationEpoch
  if (!Number.isSafeInteger(epoch) || (epoch as number) < 1) fail(code)
  try {
    const initial = createLedgerV2Control({ authorizationEpoch: epoch as number })
    const control = reconcileLedgerV2Control(initial, {
      enabled: true,
      authorizationEpoch: epoch as number,
      arming: source,
    })
    const installed = installLedgerV2Arming(undefined, { arming: source, control })
    if (canonicalJson(installed.arming) !== canonical) fail(code)
    return installed.arming
  } catch {
    fail(code)
  }
}

function validatedControl(value: unknown, canonical: string, code: string): LedgerV2ControlState {
  try {
    const source = value as LedgerV2ControlState
    const validated = source.enabled
      ? reconcileLedgerV2Control(source, {
          enabled: true,
          authorizationEpoch: source.authorizationEpoch,
          arming: source.activeArming as RecoveryArmingTuple,
        })
      : reconcileLedgerV2Control(source, {
          enabled: false,
          authorizationEpoch: source.authorizationEpoch,
        })
    if (validated !== source && canonicalJson(validated) !== canonical) fail(code)
    if (canonicalJson(source) !== canonical) fail(code)
    return source
  } catch {
    fail(code)
  }
}

function validatedAuthorization(
  value: unknown,
  canonical: string,
  metadata: GitHubEvidenceMetadata,
  metadataSha256: string,
  requestName: string,
  arming: RecoveryArmingTuple,
  code: string,
): LedgerV2AuthorizationSnapshot {
  const source = plainObject(value, AUTHORIZATION_KEYS, code)
  const locators = plainObject(source.locators, LOCATOR_KEYS, code)
  const identity = plainObject(source.workflowIdentity, WORKFLOW_IDENTITY_KEYS, code)
  if (
    canonicalJson(source) !== canonical
    || locators.requestId !== requestName
    || !UUID.test(textValue(locators.requestId, code))
    || source.githubMetadataSha256 !== metadataSha256
    || canonicalJson(source.githubMetadata) !== canonicalJson(metadata)
    || metadata.candidateCommit !== locators.candidateCommit
    || metadata.candidateCommit !== identity.workflowSha
    || metadata.repository !== identity.repository
    || metadata.repositoryId !== identity.repositoryId
    || metadata.repositoryOwnerId !== identity.repositoryOwnerId
    || metadata.artifactId !== locators.artifactId
    || metadata.artifactName !== source.artifactName
    || metadata.pagesRunId !== identity.pagesRunId
    || metadata.pagesRunAttempt !== identity.pagesRunAttempt
    || metadata.githubArtifactArchiveSha256 !== source.githubArtifactArchiveSha256
    || metadata.artifactDigest !== `sha256:${metadata.githubArtifactArchiveSha256}`
    || metadata.parentCommit !== arming.preparationCommit
    || metadata.preparationTree !== arming.preparationTree
    || source.authorizationEpoch !== arming.authorizationEpoch
    || source.operation !== 'github-pages-production-deploy'
    || source.canonicalOrigin !== 'https://warpkeep.com'
    || source.authorizationJti === null
    || !UUID.test(textValue(source.authorizationJti, code))
    || !COMMIT.test(textValue(locators.candidateCommit, code))
    || !POSITIVE_DECIMAL.test(textValue(locators.sourceVerifyRunId, code))
    || !POSITIVE_DECIMAL.test(textValue(locators.sourceVerifyRunAttempt, code))
    || !POSITIVE_DECIMAL.test(textValue(locators.artifactId, code))
    || identity.repository !== 'ael-dev3/Warpkeep'
    || identity.repositoryId !== '1273513252'
    || identity.repositoryOwnerId !== '183124839'
    || identity.ref !== 'refs/heads/main'
    || identity.workflowRef !== 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
    || identity.environment !== 'github-pages'
    || identity.eventName !== 'workflow_run'
    || !COMMIT.test(textValue(identity.workflowSha, code))
    || !POSITIVE_DECIMAL.test(textValue(identity.pagesRunId, code))
    || !POSITIVE_DECIMAL.test(textValue(identity.pagesRunAttempt, code))
    || !POSITIVE_DECIMAL.test(textValue(identity.checkRunId, code))
    || !COMMIT.test(textValue(source.candidateTree, code))
  ) fail(code)
  positiveInteger(source.authorizationEpoch, code)
  const issuedAt = integer(source.issuedAt, code)
  const expiresAt = integer(source.expiresAt, code)
  if (
    integer(source.notBefore, code) !== issuedAt
    || expiresAt <= issuedAt
    || expiresAt > issuedAt + 900
  ) fail(code)
  sha256Value(source.issuanceEvidenceSnapshotDigest, code)
  sha256Value(source.liveInvariantDigest, code)
  sha256Value(source.githubArtifactArchiveSha256, code)
  sha256Value(source.innerArtifactTarSha256, code)
  sha256Value(source.contentManifestSha256, code)
  sha256Value(source.deploymentAttestationSha256, code)
  return source as unknown as LedgerV2AuthorizationSnapshot
}

function validatedClaim(value: unknown, canonical: string, code: string): LedgerV2ClaimSnapshot {
  const source = plainObject(value, CLAIM_KEYS, code)
  if (canonicalJson(source) !== canonical) fail(code)
  sha256Value(source.claimSnapshotDigest, code)
  sha256Value(source.claimLiveInvariantDigest, code)
  if (source.claimSequence !== 1) fail(code)
  const claimedAt = integer(source.claimedAt, code)
  if (integer(source.claimDeadline, code) !== claimedAt + RECOVERY_CLAIM_DEADLINE_SECONDS_V2) {
    fail(code)
  }
  return source as unknown as LedgerV2ClaimSnapshot
}

function issueReservation(record: RecoveryLedgerRecordV2): LedgerV2IssueReservation {
  if (record.state !== 'issuing') fail('RECOVERY_LEDGER_ISSUE_STATE_INVALID')
  return rpcSnapshot(Object.freeze({
    authorization: record.authorization,
    reservedPayload: record.reservedPayload,
    issuingDeadline: record.issuingDeadline,
    revision: record.revision,
  }))
}

function issueResult(record: RecoveryLedgerRecordV2): LedgerV2IssueResult {
  if (record.state !== 'issued') fail('RECOVERY_LEDGER_ISSUE_STATE_INVALID')
  return rpcSnapshot(Object.freeze({
    authorization: record.authorization,
    authorizationJws: record.authorizationJws,
    authorizationJwsSha256: record.authorizationJwsSha256,
    revision: record.revision,
  }))
}

function claimResult(record: RecoveryLedgerRecordV2): LedgerV2ClaimResult {
  if (record.state !== 'claimed') fail('RECOVERY_LEDGER_CLAIM_STATE_INVALID')
  return rpcSnapshot(Object.freeze({
    authorization: record.authorization,
    authorizationJwsSha256: record.authorizationJwsSha256,
    claim: record.claim,
    revision: record.revision,
  }))
}

function terminalResult(record: RecoveryLedgerRecordV2): LedgerV2TerminalResult {
  if (record.state !== 'completed' && record.state !== 'not-deployed') {
    fail('RECOVERY_LEDGER_COMPLETION_STATE_INVALID')
  }
  return rpcSnapshot(Object.freeze({
    state: record.state,
    requestId: record.authorization.locators.requestId,
    outcome: record.outcome,
    completedAt: record.completedAt,
    revision: record.revision,
  }))
}

function safeRequestStatus(record: RecoveryLedgerRecordV2): LedgerV2StatusResult {
  const base = {
    role: 'request' as const,
    requestId: record.arming.requestId,
    state: record.state,
    revision: record.revision,
    alarmDeadline: ledgerV2AlarmDeadline(record),
  }
  if (record.state === 'reconciliation-required') {
    return Object.freeze({
      ...base,
      reconciliationAttempts: record.reconciliationAttempts,
      nextReconcileAt: record.nextReconcileAt,
    })
  }
  if (record.state === 'completed' || record.state === 'not-deployed') {
    return Object.freeze({
      ...base,
      terminal: Object.freeze({ outcome: record.outcome, completedAt: record.completedAt }),
    })
  }
  return Object.freeze(base)
}

class CasConflict extends Error {}

export interface SignerEnvV2 {
  RECOVERY_LEDGER_V2: DurableObjectNamespace
  GITHUB_APP_ID?: string
  GITHUB_APP_INSTALLATION_ID?: string
  GITHUB_APP_PRIVATE_KEY_PEM?: string
}

export class ReleaseRecoveryAuthorizationLedgerV2 extends DurableObject<SignerEnvV2> {
  readonly #name: string | null
  readonly #role: ObjectRole | null
  readonly #identityValid: boolean
  readonly #reconciliationReader: DeploymentReconciliationProofReader

  constructor(
    ctx: DurableObjectState,
    env: SignerEnvV2,
    readerFactory: DeploymentReconciliationProofReaderFactory =
      createDeploymentReconciliationProofReader,
  ) {
    super(ctx, env)
    const name = ctx.id.name
    this.#name = typeof name === 'string' ? name : null
    this.#role = name === RECOVERY_LEDGER_V2_CONTROL_OBJECT_NAME
      ? 'control'
      : typeof name === 'string' && UUID.test(name)
        ? 'request'
        : null
    let identityValid = false
    try {
      identityValid = this.#name !== null
        && ctx.id.equals(env.RECOVERY_LEDGER_V2.idFromName(this.#name))
    } catch {
      identityValid = false
    }
    this.#identityValid = identityValid
    let reader: DeploymentReconciliationProofReader = async () => Object.freeze({
      outcome: 'ambiguous',
    })
    try {
      reader = readerFactory(Object.freeze({
        githubApp: Object.freeze({
          GITHUB_APP_ID: env.GITHUB_APP_ID,
          GITHUB_APP_INSTALLATION_ID: env.GITHUB_APP_INSTALLATION_ID,
          GITHUB_APP_PRIVATE_KEY_PEM: env.GITHUB_APP_PRIVATE_KEY_PEM,
        }) as unknown as GitHubAppEnvironment,
        fetch: globalThis.fetch,
      }))
      if (typeof reader !== 'function') {
        reader = async () => Object.freeze({ outcome: 'ambiguous' })
      }
    } catch {
      reader = async () => Object.freeze({ outcome: 'ambiguous' })
    }
    this.#reconciliationReader = reader

    ctx.blockConcurrencyWhile(async () => {
      if (this.#role === null || !this.#identityValid || this.#name === null) return
      try {
        ctx.storage.sql.exec(RECOVERY_LEDGER_V2_SQL_SCHEMA).toArray()
      } catch {
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
        (SELECT COUNT(*) FROM recovery_v2_authorization_arming) AS arming_count,
        (SELECT COUNT(*) FROM recovery_v2_authorization) AS authorization_count,
        (SELECT COUNT(*) FROM recovery_v2_authorization_binding) AS binding_count,
        (SELECT COUNT(*) FROM recovery_v2_authorization_payload) AS payload_count,
        (SELECT COUNT(*) FROM recovery_v2_claim_binding) AS claim_count
    `)[0]
    if (
      row === undefined
      || row.arming_count !== 0
      || row.authorization_count !== 0
      || row.binding_count !== 0
      || row.payload_count !== 0
      || row.claim_count !== 0
    ) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
  }

  #assertNoControlRows(): void {
    const row = this.#rows('SELECT COUNT(*) AS control_count FROM recovery_v2_control')[0]
    if (row === undefined || row.control_count !== 0) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
  }

  #loadControl(): LedgerV2ControlState | undefined {
    const code = 'RECOVERY_LEDGER_STORAGE_CORRUPT'
    try {
      this.#assertNoRequestRows()
      const row = oneOrNone(this.#rows(
        'SELECT singleton_key, control_json, revision FROM recovery_v2_control WHERE singleton_key = 1',
      ), code)
      if (row === undefined) return undefined
      if (row.singleton_key !== 1) fail(code)
      const canonical = textValue(row.control_json, code)
      const control = validatedControl(parseCanonicalJson(canonical, code), canonical, code)
      if (control.revision !== integer(row.revision, code)) fail(code)
      return control
    } catch (error) {
      if (error instanceof RecoveryLedgerV2Error && error.code === code) throw error
      fail(code)
    }
  }

  async #loadRecord(): Promise<RecoveryLedgerRecordV2 | undefined> {
    const code = 'RECOVERY_LEDGER_STORAGE_CORRUPT'
    try {
      const name = this.#assertRole('request')
      this.#assertNoControlRows()
      const armingRow = oneOrNone(this.#rows(
        'SELECT singleton_key, request_id, arming_json FROM recovery_v2_authorization_arming WHERE singleton_key = 1',
      ), code)
      const coreRow = oneOrNone(this.#rows(
        'SELECT singleton_key, request_id, state, record_json, last_transition_at, alarm_deadline, revision FROM recovery_v2_authorization WHERE singleton_key = 1',
      ), code)
      const bindingRow = oneOrNone(this.#rows(
        'SELECT singleton_key, request_id, authorization_json, github_metadata_json, github_metadata_sha256, authorization_jws_sha256 FROM recovery_v2_authorization_binding WHERE singleton_key = 1',
      ), code)
      const payloadRow = oneOrNone(this.#rows(
        'SELECT singleton_key, request_id, payload_json FROM recovery_v2_authorization_payload WHERE singleton_key = 1',
      ), code)
      const claimRow = oneOrNone(this.#rows(
        'SELECT singleton_key, request_id, claim_json FROM recovery_v2_claim_binding WHERE singleton_key = 1',
      ), code)
      if (
        armingRow === undefined
        && coreRow === undefined
        && bindingRow === undefined
        && payloadRow === undefined
        && claimRow === undefined
      ) return undefined
      if (armingRow === undefined || coreRow === undefined) fail(code)
      for (const row of [armingRow, coreRow, bindingRow, payloadRow, claimRow]) {
        if (row !== undefined && (row.singleton_key !== 1 || row.request_id !== name)) fail(code)
      }

      const armingCanonical = textValue(armingRow.arming_json, code)
      const arming = validatedArming(
        parseCanonicalJson(armingCanonical, code), armingCanonical, code,
      )
      if (arming.requestId !== name) fail(code)

      const recordCanonical = textValue(coreRow.record_json, code)
      const parsed = parseCanonicalJson(recordCanonical, code)
      const discriminator = (parsed as { state?: unknown } | null)?.state
      if (typeof discriminator !== 'string' || !Object.hasOwn(RECORD_KEYS, discriminator)) fail(code)
      const source = plainObject(
        parsed,
        RECORD_KEYS[discriminator as keyof typeof RECORD_KEYS],
        code,
      )
      const record = source as unknown as RecoveryLedgerRecordV2
      const revision = integer(record.revision, code)
      if (
        record.state !== coreRow.state
        || revision !== integer(coreRow.revision, code)
        || record.lastTransitionAt !== nullableInteger(coreRow.last_transition_at, code)
        || canonicalJson(record.arming) !== armingCanonical
      ) fail(code)
      const deadline = ledgerV2AlarmDeadline(record)
      if (deadline !== nullableInteger(coreRow.alarm_deadline, code)) fail(code)

      if (record.state === 'armed') {
        if (
          record.lastTransitionAt !== null
          || revision !== 0
          || bindingRow !== undefined
          || payloadRow !== undefined
          || claimRow !== undefined
        ) fail(code)
        return Object.freeze({ ...record, arming }) as LedgerV2ArmedState
      }

      if (bindingRow === undefined) fail(code)
      const metadataCanonical = textValue(bindingRow.github_metadata_json, code)
      const metadata = snapshotGitHubEvidenceMetadata(
        parseCanonicalJson(metadataCanonical, code),
      )
      if (
        canonicalJson(metadata) !== metadataCanonical
        || GITHUB_EVIDENCE_METADATA_KEYS.some((key) => !Object.hasOwn(metadata, key))
      ) fail(code)
      const metadataSha256 = sha256Value(bindingRow.github_metadata_sha256, code)
      if (await githubEvidenceMetadataSha256(metadata) !== metadataSha256) fail(code)
      const authorizationCanonical = textValue(bindingRow.authorization_json, code)
      const authorization = validatedAuthorization(
        parseCanonicalJson(authorizationCanonical, code),
        authorizationCanonical,
        metadata,
        metadataSha256,
        name,
        arming,
        code,
      )
      if (canonicalJson(record.authorization) !== authorizationCanonical) fail(code)

      const storedJwsSha256 = bindingRow.authorization_jws_sha256 === null
        ? null
        : sha256Value(bindingRow.authorization_jws_sha256, code)
      const recordJwsSha256 = 'authorizationJwsSha256' in record
        ? record.authorizationJwsSha256
        : null
      if (
        (record.state === 'issuing' && storedJwsSha256 !== null)
        || (record.state === 'expired-unused'
          && record.expirationSource === 'issuing'
          && storedJwsSha256 !== null)
        || (record.state !== 'issuing'
          && !(record.state === 'expired-unused' && record.expirationSource === 'issuing')
          && (storedJwsSha256 === null || recordJwsSha256 !== storedJwsSha256))
      ) fail(code)

      if (record.state === 'issuing') {
        if (payloadRow === undefined || claimRow !== undefined) fail(code)
        const payloadCanonical = textValue(payloadRow.payload_json, code)
        if (
          canonicalJson(parseCanonicalJson(payloadCanonical, code)) !== payloadCanonical
          || canonicalJson(record.reservedPayload) !== payloadCanonical
          || record.lastTransitionAt !== integer(record.reservedAt, code)
          || integer(record.issuingDeadline, code)
            !== record.reservedAt + RECOVERY_ISSUING_TIMEOUT_SECONDS_V2
        ) fail(code)
      } else if (payloadRow !== undefined) {
        fail(code)
      }

      if (
        record.state === 'claimed'
        || record.state === 'reconciliation-required'
        || record.state === 'completed'
        || record.state === 'not-deployed'
      ) {
        if (claimRow === undefined) fail(code)
        const claimCanonical = textValue(claimRow.claim_json, code)
        const claim = validatedClaim(
          parseCanonicalJson(claimCanonical, code), claimCanonical, code,
        )
        if (canonicalJson(record.claim) !== claimCanonical) fail(code)
        if (record.state === 'claimed' && record.lastTransitionAt !== claim.claimedAt) fail(code)
        if (
          record.state === 'reconciliation-required'
          && (
            record.lastTransitionAt === null
            || record.lastTransitionAt < claim.claimDeadline
            || !Number.isSafeInteger(record.reconciliationAttempts)
            || record.reconciliationAttempts < 0
            || record.reconciliationAttempts > 5
            || (record.reconciliationAttempts === 5) !== (record.nextReconcileAt === null)
          )
        ) fail(code)
        if (
          (record.state === 'completed' || record.state === 'not-deployed')
          && (
            record.outcome !== record.state
            || record.lastTransitionAt !== integer(record.completedAt, code)
            || record.completedAt < claim.claimedAt
          )
        ) fail(code)
      } else if (claimRow !== undefined) {
        fail(code)
      }

      if (record.state === 'issued') {
        if (
          typeof record.authorizationJws !== 'string'
          || record.authorizationJws.length < 1
          || sha256Value(record.authorizationJwsSha256, code) !== storedJwsSha256
          || await rawSha256Hex(record.authorizationJws) !== storedJwsSha256
          || record.lastTransitionAt === null
          || record.lastTransitionAt < authorization.issuedAt
          || record.lastTransitionAt >= authorization.issuedAt + RECOVERY_ISSUING_TIMEOUT_SECONDS_V2
          || record.lastTransitionAt >= authorization.expiresAt
        ) fail(code)
      }
      if (record.state === 'expired-unused') {
        if (
          record.lastTransitionAt !== integer(record.expiredAt, code)
          || (record.expirationSource !== 'issuing' && record.expirationSource !== 'issued')
        ) fail(code)
      }
      return Object.freeze({ ...record, arming, authorization }) as RecoveryLedgerRecordV2
    } catch (error) {
      if (error instanceof RecoveryLedgerV2Error && error.code === code) throw error
      fail(code)
    }
  }

  #insertControl(control: LedgerV2ControlState): void {
    const cursor = this.ctx.storage.sql.exec(
      'INSERT INTO recovery_v2_control (singleton_key, control_json, revision) VALUES (1, ?, ?)',
      canonicalJson(control),
      control.revision,
    )
    cursor.toArray()
    if (cursor.rowsWritten === 0) throw new CasConflict()
  }

  #updateControl(previous: LedgerV2ControlState, next: LedgerV2ControlState): void {
    if (previous === next || previous.revision === next.revision) return
    const cursor = this.ctx.storage.sql.exec(
      'UPDATE recovery_v2_control SET control_json = ?, revision = ? WHERE singleton_key = 1 AND revision = ?',
      canonicalJson(next),
      next.revision,
      previous.revision,
    )
    cursor.toArray()
    if (cursor.rowsWritten === 0) throw new CasConflict()
  }

  #insertArmed(record: LedgerV2ArmedState): void {
    const armingCursor = this.ctx.storage.sql.exec(
      'INSERT INTO recovery_v2_authorization_arming (singleton_key, request_id, arming_json) VALUES (1, ?, ?)',
      record.arming.requestId,
      canonicalJson(record.arming),
    )
    armingCursor.toArray()
    if (armingCursor.rowsWritten === 0) throw new CasConflict()
    const coreCursor = this.ctx.storage.sql.exec(
      'INSERT INTO recovery_v2_authorization (singleton_key, request_id, state, record_json, last_transition_at, alarm_deadline, revision) VALUES (1, ?, ?, ?, ?, ?, ?)',
      record.arming.requestId,
      record.state,
      canonicalJson(record),
      record.lastTransitionAt,
      ledgerV2AlarmDeadline(record),
      record.revision,
    )
    coreCursor.toArray()
    if (coreCursor.rowsWritten === 0) throw new CasConflict()
  }

  #updateRecord(previous: RecoveryLedgerRecordV2, next: RecoveryLedgerRecordV2): void {
    if (previous === next || previous.revision === next.revision) return
    const requestId = previous.arming.requestId
    if (previous.state === 'armed' && next.state === 'issuing') {
      this.ctx.storage.sql.exec(
        'INSERT INTO recovery_v2_authorization_binding (singleton_key, request_id, authorization_json, github_metadata_json, github_metadata_sha256, authorization_jws_sha256) VALUES (1, ?, ?, ?, ?, NULL)',
        requestId,
        canonicalJson(next.authorization),
        canonicalJson(next.authorization.githubMetadata),
        next.authorization.githubMetadataSha256,
      ).toArray()
      this.ctx.storage.sql.exec(
        'INSERT INTO recovery_v2_authorization_payload (singleton_key, request_id, payload_json) VALUES (1, ?, ?)',
        requestId,
        canonicalJson(next.reservedPayload),
      ).toArray()
    }

    const cursor = this.ctx.storage.sql.exec(
      'UPDATE recovery_v2_authorization SET state = ?, record_json = ?, last_transition_at = ?, alarm_deadline = ?, revision = ? WHERE singleton_key = 1 AND revision = ?',
      next.state,
      canonicalJson(next),
      next.lastTransitionAt,
      ledgerV2AlarmDeadline(next),
      next.revision,
      previous.revision,
    )
    cursor.toArray()
    if (cursor.rowsWritten === 0) throw new CasConflict()

    if (previous.state === 'issuing' && next.state === 'issued') {
      const binding = this.ctx.storage.sql.exec(
        'UPDATE recovery_v2_authorization_binding SET authorization_jws_sha256 = ? WHERE singleton_key = 1 AND authorization_jws_sha256 IS NULL',
        next.authorizationJwsSha256,
      )
      binding.toArray()
      if (binding.rowsWritten === 0) throw new CasConflict()
    }
    if (previous.state === 'issuing' && next.state !== 'issuing') {
      const deleted = this.ctx.storage.sql.exec(
        'DELETE FROM recovery_v2_authorization_payload WHERE singleton_key = 1',
      )
      deleted.toArray()
      if (deleted.rowsWritten === 0) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
    }
    if (previous.state === 'issued' && next.state === 'claimed') {
      const claim = this.ctx.storage.sql.exec(
        'INSERT INTO recovery_v2_claim_binding (singleton_key, request_id, claim_json) VALUES (1, ?, ?)',
        requestId,
        canonicalJson(next.claim),
      )
      claim.toArray()
      if (claim.rowsWritten === 0) throw new CasConflict()
    }
  }

  async #repairAlarm(record: RecoveryLedgerRecordV2): Promise<void> {
    const deadline = ledgerV2AlarmDeadline(record)
    const scheduled = await this.ctx.storage.getAlarm()
    if (deadline === null) {
      if (scheduled !== null) {
        try {
          await this.ctx.storage.deleteAlarm()
        } catch {
          // A terminal or exhausted row makes a stale alarm harmless.
        }
      }
      return
    }
    const expected = deadline * 1_000
    if (!Number.isSafeInteger(expected) || expected < 0) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
    if (scheduled !== expected) await this.ctx.storage.setAlarm(expected)
  }

  async #updateRecordWithAlarm(
    previous: RecoveryLedgerRecordV2,
    next: RecoveryLedgerRecordV2,
  ): Promise<void> {
    const deadline = ledgerV2AlarmDeadline(next)
    if (deadline === null) fail('RECOVERY_LEDGER_STORAGE_FAILED')
    const scheduledTime = deadline * 1_000
    if (!Number.isSafeInteger(scheduledTime) || scheduledTime < 0) {
      fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
    }
    await this.ctx.storage.transaction(async transaction => {
      await transaction.setAlarm(scheduledTime)
      this.#updateRecord(previous, next)
    })
  }

  async #applyEventWithRejectedAlarmRepair(
    current: RecoveryLedgerRecordV2,
    event: LedgerV2Event,
  ): Promise<RecoveryLedgerRecordV2> {
    try {
      return await applyLedgerV2Event(current, event)
    } catch (error) {
      try {
        await this.#repairAlarm(current)
      } catch {
        // Preserve the exact reducer rejection; a later read can repair the alarm.
      }
      throw error
    }
  }

  async #readReconciliationProof(
    projection: LedgerSignerClaimProjection,
  ): Promise<LedgerV2ReconciliationProof> {
    const ambiguous = (): LedgerV2ReconciliationProof => Object.freeze({ outcome: 'ambiguous' })
    try {
      const value = await this.#reconciliationReader(projection)
      try {
        const source = exactData(value, ['outcome'], 'RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
        if (source.outcome === 'ambiguous') return ambiguous()
      } catch {
        // Try each exact terminal proof shape below.
      }
      try {
        const source = exactData(value, [
          'outcome', 'rowBindingDigest', 'deployStepConclusion',
          'matchingPagesDeployment', 'deploymentAttestationMatches',
        ], 'RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
        if (
          source.outcome === 'completed'
          && source.rowBindingDigest === projection.rowBindingDigest
          && source.deployStepConclusion === 'success'
          && source.matchingPagesDeployment === true
          && source.deploymentAttestationMatches === true
        ) return Object.freeze({ ...source }) as LedgerV2ReconciliationProof
      } catch {
        // Try the exact not-deployed shape below.
      }
      try {
        const source = exactData(value, [
          'outcome', 'rowBindingDigest', 'authoritativeTerminalRun',
          'pagesDeployStepStarted', 'matchingPagesDeploymentAbsent',
        ], 'RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
        if (
          source.outcome === 'not-deployed'
          && source.rowBindingDigest === projection.rowBindingDigest
          && source.authoritativeTerminalRun === true
          && source.pagesDeployStepStarted === false
          && source.matchingPagesDeploymentAbsent === true
        ) return Object.freeze({ ...source }) as LedgerV2ReconciliationProof
      } catch {
        // Any malformed or hostile reader result is ambiguous.
      }
      return ambiguous()
    } catch {
      return ambiguous()
    }
  }

  async #withPublicErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof RecoveryLedgerV2Error) throw new Error(error.code)
      if (error instanceof RecoveryGitHubError && /^RECOVERY_PREPARATION_[A-Z_]+$/u.test(error.code)) throw new Error(error.code)
      if (error instanceof CasConflict) throw new Error('RECOVERY_LEDGER_CONFLICT')
      throw new Error('RECOVERY_LEDGER_STORAGE_FAILED')
    }
  }

  #loadPreparation(epoch: number): Readonly<{ intent: PreparationIntent; preparationReceiptJws: string | null }> | null {
    const rows = this.ctx.storage.sql.exec<{ authorization_epoch: number; request_id: string; intent_json: string; receipt_jws: string | null }>(
      'SELECT authorization_epoch, request_id, intent_json, receipt_jws FROM recovery_v2_preparation_intents WHERE authorization_epoch = ?', epoch,
    ).toArray()
    if (rows.length === 0) return null
    if (rows.length !== 1) fail('RECOVERY_LEDGER_STORAGE_FAILED')
    const row = rows[0]!
    const intent = snapshotPreparationIntent(JSON.parse(row.intent_json))
    if (JSON.stringify(intent) !== row.intent_json || intent.authorizationEpoch !== row.authorization_epoch
      || intent.requestId !== row.request_id || (row.receipt_jws !== null && typeof row.receipt_jws !== 'string')) fail('RECOVERY_LEDGER_STORAGE_FAILED')
    return Object.freeze({ intent, preparationReceiptJws: row.receipt_jws })
  }

  async reservePreparationIntent(input: PreparationReservationInput): Promise<Readonly<{ intent: PreparationIntent; preparationReceiptJws: string | null }>> {
    return this.#withPublicErrors(async () => {
      this.#assertRole('control')
      const source = snapshotPreparationReservation(input)
      const result = this.ctx.storage.transactionSync(() => {
        let control = this.#loadControl()
        if (control === undefined) {
          control = createLedgerV2Control({ authorizationEpoch: source.policy.authorizationEpoch })
          this.#insertControl(control)
        } else if (source.policy.authorizationEpoch > control.authorizationEpoch && !control.enabled) {
          const next = reconcileLedgerV2Control(control, { enabled: false, authorizationEpoch: source.policy.authorizationEpoch })
          this.#updateControl(control, next)
          control = next
        }
        const existing = this.#loadPreparation(source.policy.authorizationEpoch)
        const intent = choosePreparationIntent(source, control, existing?.intent ?? null, () => crypto.randomUUID())
        if (existing !== null) return existing
        this.ctx.storage.sql.exec('INSERT INTO recovery_v2_preparation_intents (authorization_epoch, request_id, intent_json, receipt_jws) VALUES (?, ?, ?, NULL)',
          intent.authorizationEpoch, intent.requestId, JSON.stringify(intent)).toArray()
        return { intent, preparationReceiptJws: null }
      })
      if (result.preparationReceiptJws !== null) await verifyPreparationReceipt(result.preparationReceiptJws, result.intent)
      this.ctx.storage.transactionSync(() => {
        const current = this.#loadControl()
        if (current === undefined) fail('RECOVERY_LEDGER_STORAGE_FAILED')
        assertPreparationControl(current, result.intent.authorizationEpoch)
      })
      return rpcSnapshot(result)
    })
  }

  async assertPreparationObservationIntent(input: PreparationIntent): Promise<Readonly<{ intent: PreparationIntent }>> {
    return this.#withPublicErrors(async () => {
      this.#assertRole('control')
      const intent = snapshotPreparationIntent(input)
      const result = this.ctx.storage.transactionSync(() => {
        const current = this.#loadControl()
        if (current === undefined) fail('RECOVERY_LEDGER_STORAGE_FAILED')
        assertPreparationControl(current, intent.authorizationEpoch)
        const existing = this.#loadPreparation(intent.authorizationEpoch)
        if (existing === null || JSON.stringify(existing.intent) !== JSON.stringify(intent)) fail('RECOVERY_LEDGER_CONTROL_INVALID')
        return { intent: existing.intent }
      })
      return rpcSnapshot(result)
    })
  }
  async finalizePreparationIntent(input: Readonly<{ intent: PreparationIntent; preparationReceiptJws: string }>): Promise<Readonly<{ preparationReceiptJws: string }>> {
    return this.#withPublicErrors(async () => {
      this.#assertRole('control')
      const source = exactData(input, ['intent', 'preparationReceiptJws'], 'RECOVERY_LEDGER_CONTROL_INVALID')
      const intent = snapshotPreparationIntent(source.intent)
      await verifyPreparationReceipt(source.preparationReceiptJws, intent)
      const result = this.ctx.storage.transactionSync(() => {
        const current = this.#loadControl()
        if (current === undefined) fail('RECOVERY_LEDGER_STORAGE_FAILED')
        assertPreparationControl(current, intent.authorizationEpoch)
        const existing = this.#loadPreparation(intent.authorizationEpoch)
        if (existing === null || JSON.stringify(existing.intent) !== JSON.stringify(intent)) fail('RECOVERY_LEDGER_STORAGE_FAILED')
        if (existing.preparationReceiptJws !== null) return { preparationReceiptJws: existing.preparationReceiptJws }
        this.ctx.storage.sql.exec('UPDATE recovery_v2_preparation_intents SET receipt_jws = ? WHERE authorization_epoch = ? AND receipt_jws IS NULL',
          source.preparationReceiptJws as string, intent.authorizationEpoch).toArray()
        return { preparationReceiptJws: source.preparationReceiptJws as string }
      })
      await verifyPreparationReceipt(result.preparationReceiptJws, intent)
      this.ctx.storage.transactionSync(() => {
        const current = this.#loadControl()
        if (current === undefined) fail('RECOVERY_LEDGER_STORAGE_FAILED')
        assertPreparationControl(current, intent.authorizationEpoch)
      })
      return rpcSnapshot(result)
    })
  }

  async reconcileControl(input: LedgerV2ControlInput): Promise<LedgerV2ControlState> {
    return this.#withPublicErrors(async () => {
      this.#assertRole('control')
      let source: Readonly<Record<string, unknown>>
      try {
        source = exactData(
          input, ['enabled', 'authorizationEpoch'], 'RECOVERY_LEDGER_CONTROL_INVALID',
        )
      } catch {
        source = exactData(
          input, ['enabled', 'authorizationEpoch', 'arming'], 'RECOVERY_LEDGER_CONTROL_INVALID',
        )
      }
      let result: LedgerV2ControlState | undefined
      this.ctx.storage.transactionSync(() => {
        if (source.enabled === true) {
          const reserved = this.#loadPreparation(source.authorizationEpoch as number)
          if (reserved !== null) assertPreparationArming(reserved.intent, source.arming as RecoveryArmingTuple)
        }
        const current = this.#loadControl()
        if (current === undefined) {
          const initial = createLedgerV2Control({
            authorizationEpoch: source.authorizationEpoch as number,
          })
          this.#insertControl(initial)
          result = reconcileLedgerV2Control(initial, source as LedgerV2ControlInput)
          this.#updateControl(initial, result)
        } else {
          result = reconcileLedgerV2Control(current, source as LedgerV2ControlInput)
          this.#updateControl(current, result)
        }
      })
      if (result === undefined) fail('RECOVERY_LEDGER_STORAGE_FAILED')
      return rpcSnapshot(result)
    })
  }

  async installArming(input: LedgerV2ArmingInput): Promise<LedgerV2ArmedState> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      const source = exactData(input, ['arming', 'control'], 'RECOVERY_LEDGER_INSTALL_INVALID')
      const current = await this.#loadRecord()
      const installed = installLedgerV2Arming(current, {
        arming: source.arming as RecoveryArmingTuple,
        control: source.control as LedgerV2ControlState,
      })
      if (installed.arming.requestId !== name) fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      if (current === undefined) {
        this.ctx.storage.transactionSync(() => this.#insertArmed(installed))
      }
      return rpcSnapshot(installed)
    })
  }

  async reserveIssue(input: LedgerV2ReserveIssueInput): Promise<LedgerV2IssueReservation> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      let source: Readonly<Record<string, unknown>>
      try {
        source = exactData(input, [
          'control', 'locators', 'identity', 'payload', 'githubMetadata',
          'githubMetadataSha256', 'now',
        ], 'RECOVERY_LEDGER_EVENT_INVALID')
      } catch {
        source = exactData(input, [
          'control', 'locators', 'identity', 'githubMetadata',
          'githubMetadataSha256', 'now',
        ], 'RECOVERY_LEDGER_EVENT_INVALID')
      }
      const event = Object.freeze({ type: 'reserve-issue', ...source }) as Extract<
        LedgerV2Event, { type: 'reserve-issue' }
      >
      let current = await this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state !== 'issuing' || next.authorization.locators.requestId !== name) {
        fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      }
      if (next !== current) {
        const previousRevision = current.revision
        try {
          await this.#updateRecordWithAlarm(current, next)
        } catch (error) {
          const fresh = await this.#loadRecord()
          if (fresh === undefined || fresh.revision === previousRevision) throw error
          current = fresh
          next = await this.#applyEventWithRejectedAlarmRepair(current, event)
        }
      }
      await this.#repairAlarm(next)
      return issueReservation(next)
    })
  }

  async finalizeIssue(input: LedgerV2FinalizeIssueInput): Promise<LedgerV2IssueResult> {
    return this.#withPublicErrors(async () => {
      const source = exactData(input, [
        'control', 'locators', 'identity', 'authorizationJws',
        'authorizationJwsSha256', 'now',
      ], 'RECOVERY_LEDGER_EVENT_INVALID')
      const event = Object.freeze({ type: 'finalize-issue', ...source }) as Extract<
        LedgerV2Event, { type: 'finalize-issue' }
      >
      let current = await this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const name = this.#assertRole('request')
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state !== 'issued' || next.authorization.locators.requestId !== name) {
        fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      }
      if (next !== current) {
        const previousRevision = current.revision
        try {
          await this.#updateRecordWithAlarm(current, next)
        } catch (error) {
          const fresh = await this.#loadRecord()
          if (fresh === undefined || fresh.revision === previousRevision) throw error
          current = fresh
          next = await this.#applyEventWithRejectedAlarmRepair(current, event)
        }
      }
      await this.#repairAlarm(next)
      return issueResult(next)
    })
  }

  async readIssued(input: LedgerV2ReadInput): Promise<LedgerV2IssueResult> {
    return this.#withPublicErrors(async () => {
      const source = exactData(
        input, ['control', 'locators', 'identity', 'now'], 'RECOVERY_LEDGER_EVENT_INVALID',
      )
      const event = Object.freeze({ type: 'read-issued', ...source }) as Extract<
        LedgerV2Event, { type: 'read-issued' }
      >
      const current = await this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const name = this.#assertRole('request')
      const next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state === 'expired-unused') {
        this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecordV2, next))
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

  async claim(input: LedgerV2ClaimInput): Promise<LedgerV2ClaimResult> {
    return this.#withPublicErrors(async () => {
      const source = exactData(input, [
        'control', 'locators', 'identity', 'authorizationJws',
        'liveInvariantDigest', 'claimSnapshotDigest', 'now',
      ], 'RECOVERY_LEDGER_EVENT_INVALID')
      const event = Object.freeze({ type: 'claim', ...source }) as Extract<
        LedgerV2Event, { type: 'claim' }
      >
      let current = await this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const name = this.#assertRole('request')
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state === 'expired-unused') {
        this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecordV2, next))
        await this.#repairAlarm(next)
        fail('RECOVERY_LEDGER_AUTHORIZATION_EXPIRED')
      }
      if (next.state !== 'claimed' || next.authorization.locators.requestId !== name) {
        fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      }
      await this.#repairAlarm(current)
      if (next !== current) {
        const previousRevision = current.revision
        try {
          this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecordV2, next))
        } catch (error) {
          const fresh = await this.#loadRecord()
          if (fresh === undefined || fresh.revision === previousRevision) throw error
          current = fresh
          next = await this.#applyEventWithRejectedAlarmRepair(current, event)
        }
      }
      await this.#repairAlarm(next)
      return claimResult(next)
    })
  }

  async complete(input: LedgerV2CompleteInput): Promise<LedgerV2TerminalResult> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      const source = exactData(
        input, ['requestId', 'proof', 'now'], 'RECOVERY_LEDGER_EVENT_INVALID',
      )
      if (source.requestId !== name) fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      let current = await this.#loadRecord()
      if (current === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      const event = Object.freeze({
        type: 'complete', proof: source.proof, now: source.now,
      }) as Extract<LedgerV2Event, { type: 'complete' }>
      let next = await this.#applyEventWithRejectedAlarmRepair(current, event)
      if (next.state !== 'completed' && next.state !== 'not-deployed') {
        fail('RECOVERY_LEDGER_COMPLETION_STATE_INVALID')
      }
      if (next !== current) {
        const previousRevision = current.revision
        try {
          this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecordV2, next))
        } catch (error) {
          const fresh = await this.#loadRecord()
          if (fresh === undefined || fresh.revision === previousRevision) throw error
          current = fresh
          next = await this.#applyEventWithRejectedAlarmRepair(current, event)
          if (next !== current) throw new CasConflict()
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

  async readClaimedProjection(input: LedgerV2ProjectionInput): Promise<LedgerSignerClaimProjection> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      const source = exactData(input, ['requestId'], 'RECOVERY_LEDGER_EVENT_INVALID')
      if (source.requestId !== name) fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      const record = await this.#loadRecord()
      if (record === undefined) fail('RECOVERY_LEDGER_NOT_INITIALIZED')
      await this.#repairAlarm(record)
      return rpcSnapshot(projectClaimedLedgerV2Row(record))
    })
  }

  async readTerminalProjection(input: LedgerV2ProjectionInput): Promise<LedgerSignerClaimProjection> {
    return this.#withPublicErrors(async () => {
      const name = this.#assertRole('request')
      const source = exactData(input, ['requestId'], 'RECOVERY_LEDGER_EVENT_INVALID')
      if (source.requestId !== name) fail('RECOVERY_LEDGER_REQUEST_ID_MISMATCH')
      const record = await this.#loadRecord()
      if (record === undefined || (record.state !== 'completed' && record.state !== 'not-deployed')) fail('RECOVERY_LEDGER_TERMINAL_UNAVAILABLE')
      // Terminal lookup must not schedule/repair alarms or mutate any record.
      return rpcSnapshot(projectClaimedLedgerV2Row(record))
    })
  }

  async status(...args: []): Promise<LedgerV2StatusResult> {
    return this.#withPublicErrors(async () => {
      if (args.length !== 0) fail('RECOVERY_LEDGER_EVENT_INVALID')
      if (this.#role === 'control') {
        this.#assertRole('control')
        const control = this.#loadControl()
        return Object.freeze({
          role: 'control' as const,
          control: control === undefined
            ? null
            : Object.freeze({
                enabled: control.enabled,
                authorizationEpoch: control.authorizationEpoch,
                maxConsumedAuthorizationEpoch: control.maxConsumedAuthorizationEpoch,
                activeRequestId: control.activeArming?.requestId ?? null,
                revision: control.revision,
              }),
        })
      }
      const name = this.#assertRole('request')
      const record = await this.#loadRecord()
      if (record === undefined) {
        return Object.freeze({
          role: 'request' as const,
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
      void info
      this.#assertRole('request')
      let current = await this.#loadRecord()
      if (current === undefined) return
      const deadline = ledgerV2AlarmDeadline(current)
      if (deadline === null) {
        await this.#repairAlarm(current)
        return
      }
      const now = Math.floor(Date.now() / 1_000)
      if (now < deadline) {
        await this.#repairAlarm(current)
        return
      }

      if (current.state === 'issuing' || current.state === 'issued') {
        const next = await applyLedgerV2Event(current, Object.freeze({ type: 'alarm', now }))
        this.ctx.storage.transactionSync(() => this.#updateRecord(current as RecoveryLedgerRecordV2, next))
        current = next
      } else if (current.state === 'claimed') {
        const required = await applyLedgerV2Event(
          current, Object.freeze({ type: 'alarm', now }),
        )
        this.ctx.storage.transactionSync(() => (
          this.#updateRecord(current as RecoveryLedgerRecordV2, required)
        ))
        const persisted = await this.#loadRecord()
        if (persisted === undefined) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
        current = persisted
      }

      if (current.state === 'reconciliation-required') {
        if (current.nextReconcileAt === null || now < current.nextReconcileAt) {
          await this.#repairAlarm(current)
          return
        }
        const readerProjection = projectClaimedLedgerV2Row(current)
        const proof = await this.#readReconciliationProof(readerProjection)
        const fresh = await this.#loadRecord()
        if (fresh === undefined) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
        current = fresh
        if (current.state !== 'reconciliation-required') {
          await this.#repairAlarm(current)
          return
        }
        const freshNow = Math.floor(Date.now() / 1_000)
        if (current.nextReconcileAt === null || freshNow < current.nextReconcileAt) {
          await this.#repairAlarm(current)
          return
        }
        const freshProjection = projectClaimedLedgerV2Row(current)
        const unchanged = freshProjection.state === 'reconciliation-required'
          && freshProjection.requestId === readerProjection.requestId
          && freshProjection.revision === readerProjection.revision
          && freshProjection.rowBindingDigest === readerProjection.rowBindingDigest
        const selectedProof = unchanged
          ? proof
          : Object.freeze({ outcome: 'ambiguous' as const })
        const next = await applyLedgerV2Event(current, Object.freeze({
          type: 'reconcile', proof: selectedProof, now: freshNow,
        }))
        try {
          this.ctx.storage.transactionSync(() => (
            this.#updateRecord(current as RecoveryLedgerRecordV2, next)
          ))
          current = next
        } catch (error) {
          if (!(error instanceof CasConflict)) throw error
          const latest = await this.#loadRecord()
          if (latest === undefined) fail('RECOVERY_LEDGER_STORAGE_CORRUPT')
          await this.#repairAlarm(latest)
          return
        }
      }
      await this.#repairAlarm(current)
    })
  }
}
