import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import {
  RECOVERY_ARMING_TUPLE_KEYS,
  RECOVERY_CLAIM_DEADLINE_SECONDS,
  RECOVERY_ISSUING_TIMEOUT_SECONDS,
  RECOVERY_LEDGER_SQL_SCHEMA,
  RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS,
  applyLedgerEvent,
  createLedgerControl,
  installLedgerArming,
  ledgerAlarmDeadline,
  ledgerRowBindingDigest,
  reconcileLedgerControl,
  type LedgerControlState,
  type LedgerEvent,
  type RecoveryLedgerRecord,
} from '../src/ledger.js'
import type { RecoveryArmingTuple } from '../src/config.js'
import type { RecoveryAuthorizationPayload } from '../src/crypto.js'
import type { GitHubWorkflowIdentity } from '../src/githubOidc.js'
import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  RECOVERY_AUTHORIZATION_TYP,
  base64UrlEncode,
  serializeExactObject,
} from '../src/protocol.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from '../src/recoveryPublicKey.js'

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_REQUEST_ID = '123e4567-e89b-42d3-a456-426614174099'
const AUTHORIZATION_JTI = '123e4567-e89b-42d3-a456-426614174001'
const OTHER_OIDC_JTI = '123e4567-e89b-42d3-a456-426614174098'
const CANDIDATE = 'd'.repeat(40)
const CANDIDATE_TREE = 'e'.repeat(40)
const G001 = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G002 = '1'.repeat(64)
const PTR = '2'.repeat(64)
const NOW = 10_000
const encoder = new TextEncoder()

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

function sqlColumnName(key: string): string {
  return key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)
}

function sqlValue(value: unknown): string | number | null {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' || typeof value === 'number' || value === null) return value
  throw new Error('TEST_SQL_VALUE_INVALID')
}

function ledgerSqlRow(record: RecoveryLedgerRecord): Readonly<Record<string, string | number | null>> {
  const row: Record<string, string | number | null> = {
    singleton_key: 1,
    state: record.state,
    revision: record.revision,
    last_transition_at: record.lastTransitionAt,
  }
  for (const key of RECOVERY_ARMING_TUPLE_KEYS) row[sqlColumnName(key)] = sqlValue(record.arming[key])
  if (record.state === 'armed') return row

  const authorization = record.authorization
  for (const key of ['candidateCommit', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'] as const) {
    row[`locator_${sqlColumnName(key)}`] = sqlValue(authorization.locators[key])
  }
  for (const key of [
    'repository', 'repositoryId', 'repositoryOwnerId', 'ref', 'workflowRef',
    'environment', 'eventName', 'workflowSha', 'pagesRunId', 'pagesRunAttempt',
    'checkRunId',
  ] as const) {
    row[`workflow_identity_${sqlColumnName(key)}`] = sqlValue(authorization.workflowIdentity[key])
  }
  for (const key of RECOVERY_AUTHORIZATION_PAYLOAD_KEYS) {
    row[`payload_${sqlColumnName(key)}`] = sqlValue(authorization.payload[key])
  }
  row.authorization_jti = authorization.authorizationJti
  row.issuance_evidence_snapshot_digest = authorization.issuanceEvidenceSnapshotDigest
  row.live_invariant_digest = authorization.liveInvariantDigest

  if (record.state === 'issuing') {
    row.reserved_payload_json = new TextDecoder().decode(
      serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, record.reservedPayload),
    )
    row.reserved_at = record.reservedAt
    row.issuing_deadline = record.issuingDeadline
    return row
  }
  row.authorization_jws_sha256 = record.authorizationJwsSha256
  if (record.state === 'issued') {
    row.authorization_jws = record.authorizationJws
    return row
  }
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

function insertSqlRow(
  database: DatabaseSync,
  table: string,
  row: Readonly<Record<string, string | number | null>>,
): void {
  const entries = Object.entries(row)
  const columns = entries.map(([column]) => column)
  const placeholders = columns.map(() => '?')
  database.prepare(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders.join(',')})`,
  ).run(...entries.map(([, value]) => value))
}

type LedgerSqlRows = Readonly<{
  arming: Readonly<Record<string, string | number | null>>
  payload: Readonly<Record<string, string | number | null>>
  authorization: Readonly<Record<string, string | number | null>>
}>

function splitLedgerSqlRow(row: Readonly<Record<string, string | number | null>>): LedgerSqlRows {
  const armingColumns = new Set(RECOVERY_ARMING_TUPLE_KEYS.map(sqlColumnName))
  const payloadColumns = new Set(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS.map(
    (key) => `payload_${sqlColumnName(key)}`,
  ))
  const armingRow: Record<string, string | number | null> = { singleton_key: 1 }
  const payloadRow: Record<string, string | number | null> = { singleton_key: 1 }
  const authorizationRow: Record<string, string | number | null> = {}
  for (const [column, value] of Object.entries(row)) {
    if (armingColumns.has(column)) armingRow[column] = value
    else if (payloadColumns.has(column)) payloadRow[column] = value
    else authorizationRow[column] = value
  }
  authorizationRow.request_id = row.request_id
  return Object.freeze({
    arming: Object.freeze(armingRow),
    payload: Object.freeze(payloadRow),
    authorization: Object.freeze(authorizationRow),
  })
}

function insertLedgerSqlRow(database: DatabaseSync, row: Readonly<Record<string, string | number | null>>): void {
  const split = splitLedgerSqlRow(row)
  insertSqlRow(database, 'recovery_authorization_arming', split.arming)
  if (Object.keys(split.payload).length > 1) {
    insertSqlRow(database, 'recovery_authorization_payload', split.payload)
  }
  insertSqlRow(database, 'recovery_authorization', split.authorization)
}

function updateAuthorizationSqlValues(
  database: DatabaseSync,
  row: Readonly<Record<string, string | number | null>>,
): void {
  const columns = (database.prepare("SELECT name FROM pragma_table_info('recovery_authorization')").all() as Array<{ name: string }>)
    .map(({ name }) => name)
    .filter((name) => name !== 'singleton_key')
  const assignments = columns.map((column) => `${column} = ?`)
  database.prepare(`UPDATE recovery_authorization SET ${assignments.join(',')} WHERE singleton_key = 1`)
    .run(...columns.map((column) => Object.hasOwn(row, column) ? row[column] : null))
}

function updateAuthorizationSqlRow(database: DatabaseSync, record: RecoveryLedgerRecord): void {
  updateAuthorizationSqlValues(database, splitLedgerSqlRow(ledgerSqlRow(record)).authorization)
}

function controlSqlRow(control: LedgerControlState): Readonly<Record<string, string | number | null>> {
  const row: Record<string, string | number | null> = {
    singleton_key: 1,
    enabled: control.enabled ? 1 : 0,
    authorization_epoch: control.authorizationEpoch,
    max_consumed_authorization_epoch: control.maxConsumedAuthorizationEpoch,
    revision: control.revision,
  }
  for (const key of RECOVERY_ARMING_TUPLE_KEYS) {
    row[`active_${sqlColumnName(key)}`] = control.activeArming === null
      ? null
      : sqlValue(control.activeArming[key])
  }
  return Object.freeze(row)
}

function updateControlSqlRow(
  database: DatabaseSync,
  row: Readonly<Record<string, string | number | null>>,
): void {
  const entries = Object.entries(row).filter(([column]) => column !== 'singleton_key')
  database.prepare(
    `UPDATE recovery_control SET ${entries.map(([column]) => `${column} = ?`).join(',')} WHERE singleton_key = 1`,
  ).run(...entries.map(([, value]) => value))
}

function expectLedgerSqlMutationRejected(
  record: RecoveryLedgerRecord,
  mutation: Readonly<Record<string, string | number | null>>,
): void {
  const database = new DatabaseSync(':memory:')
  try {
    database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
    persistLedgerSqlPath(database, ledgerSqlPredecessors(record))
    expect(() => applyLedgerSqlTarget(database, record, mutation)).toThrow()
  } finally {
    database.close()
  }
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
    preparationCommit: 'b'.repeat(40),
    preparationTree: 'c'.repeat(40),
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
    predecessorCommit: 'b'.repeat(40),
    candidateCommit: CANDIDATE,
    candidateTree: CANDIDATE_TREE,
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1',
    sourceClosureSha256: 'a'.repeat(64),
    recoveryAuthorizationCoreSha256: 'b'.repeat(64),
    artifactId: '789',
    artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: 'c'.repeat(64),
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

const JWS = compactAuthorizationJws(payload())
const JWS_SHA256 = rawSha256(JWS)

function enabledControl(tuple = arming()): LedgerControlState {
  return reconcileLedgerControl(createLedgerControl({ authorizationEpoch: tuple.authorizationEpoch }), {
    enabled: true,
    authorizationEpoch: tuple.authorizationEpoch,
    arming: tuple,
  })
}

function armed(tuple = arming(), control = enabledControl(tuple)) {
  return installLedgerArming(undefined, { arming: tuple, control })
}

function reserveEvent(
  control = enabledControl(),
  overrides: Readonly<Record<string, unknown>> = {},
): LedgerEvent {
  return {
    type: 'reserve-issue',
    control,
    locators: locators(),
    identity: identity(),
    payload: payload(),
    now: NOW,
    ...overrides,
  } as LedgerEvent
}

function issuing() {
  const control = enabledControl()
  return { control, record: applyLedgerEvent(armed(arming(), control), reserveEvent(control)) }
}

function finalizeEvent(control: LedgerControlState, overrides: Readonly<Record<string, unknown>> = {}): LedgerEvent {
  return {
    type: 'finalize-issue',
    control,
    locators: locators(),
    identity: identity(),
    authorizationJws: JWS,
    authorizationJwsSha256: JWS_SHA256,
    now: NOW + 1,
    ...overrides,
  } as LedgerEvent
}

function issued() {
  const reserved = issuing()
  return {
    control: reserved.control,
    record: applyLedgerEvent(reserved.record, finalizeEvent(reserved.control)),
  }
}

function claimEvent(control: LedgerControlState, overrides: Readonly<Record<string, unknown>> = {}): LedgerEvent {
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
  } as LedgerEvent
}

function claimed() {
  const value = issued()
  return {
    control: value.control,
    record: applyLedgerEvent(value.record, claimEvent(value.control)),
  }
}

function completedProof(
  record: RecoveryLedgerRecord,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    outcome: 'completed',
    rowBindingDigest: ledgerRowBindingDigest(record),
    deployStepConclusion: 'success',
    matchingPagesDeployment: true,
    deploymentAttestationMatches: true,
    ...overrides,
  } as const
}

function notDeployedProof(
  record: RecoveryLedgerRecord,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    outcome: 'not-deployed',
    rowBindingDigest: ledgerRowBindingDigest(record),
    authoritativeTerminalRun: true,
    pagesDeployStepStarted: false,
    matchingPagesDeploymentAbsent: true,
    ...overrides,
  } as const
}

function ledgerSqlPredecessors(record: RecoveryLedgerRecord): readonly RecoveryLedgerRecord[] {
  if (record.state === 'armed') return []
  const control = enabledControl(record.arming)
  const installed = armed(record.arming, control)
  const authorization = record.authorization
  const reservation = applyLedgerEvent(installed, {
    type: 'reserve-issue',
    control,
    locators: authorization.locators,
    identity: {
      ...authorization.workflowIdentity,
      oidcJti: OTHER_OIDC_JTI,
    },
    payload: authorization.payload,
    now: authorization.issuedAt,
  })
  if (record.state === 'issuing') return [installed]
  if (record.state === 'expired-unused' && record.expirationSource === 'issuing') {
    return [installed, reservation]
  }

  const authorizationJws = record.state === 'issued'
    ? record.authorizationJws
    : compactAuthorizationJws(authorization.payload)
  const issuance = applyLedgerEvent(reservation, {
    type: 'finalize-issue',
    control,
    locators: authorization.locators,
    identity: {
      ...authorization.workflowIdentity,
      oidcJti: OTHER_OIDC_JTI,
    },
    authorizationJws,
    authorizationJwsSha256: rawSha256(authorizationJws),
    now: authorization.issuedAt,
  })
  if (record.state === 'issued') return [installed, reservation]
  if (record.state === 'expired-unused') return [installed, reservation, issuance]

  const claimState = record.state === 'claimed'
    || record.state === 'reconciliation-required'
    || record.state === 'completed'
    || record.state === 'not-deployed'
    ? record.claim
    : null
  if (claimState === null) throw new Error('TEST_LEDGER_SQL_PATH_INVALID')
  const consumption = applyLedgerEvent(issuance, {
    type: 'claim',
    control,
    locators: authorization.locators,
    identity: {
      ...authorization.workflowIdentity,
      oidcJti: OTHER_OIDC_JTI,
    },
    authorizationJws,
    liveInvariantDigest: claimState.claimLiveInvariantDigest,
    claimSnapshotDigest: claimState.claimSnapshotDigest,
    now: claimState.claimedAt,
  })
  if (record.state === 'claimed') return [installed, reservation, issuance]
  if (record.state === 'completed' && record.completedAt < claimState.claimDeadline) {
    return [installed, reservation, issuance, consumption]
  }

  const path: RecoveryLedgerRecord[] = [installed, reservation, issuance, consumption]
  let reconciliation = applyLedgerEvent(consumption, {
    type: 'alarm',
    now: claimState.claimDeadline,
  }) as Extract<RecoveryLedgerRecord, { state: 'reconciliation-required' }>
  if (record.state === 'reconciliation-required') {
    while (reconciliation.reconciliationAttempts < record.reconciliationAttempts) {
      path.push(reconciliation)
      if (reconciliation.reconciliationAttempts + 1 >= record.reconciliationAttempts) break
      reconciliation = applyLedgerEvent(reconciliation, {
        type: 'reconcile',
        proof: { outcome: 'ambiguous' },
        now: ledgerAlarmDeadline(reconciliation) as number,
      }) as typeof reconciliation
    }
    return path
  }

  const precedingAttempts = Math.max(0, record.revision - 5)
  while (reconciliation.reconciliationAttempts < precedingAttempts) {
    path.push(reconciliation)
    reconciliation = applyLedgerEvent(reconciliation, {
      type: 'reconcile',
      proof: { outcome: 'ambiguous' },
      now: ledgerAlarmDeadline(reconciliation) as number,
    }) as typeof reconciliation
  }
  path.push(reconciliation)
  return path
}

function persistLedgerSqlPath(
  database: DatabaseSync,
  path: readonly RecoveryLedgerRecord[],
): void {
  for (const [index, record] of path.entries()) {
    if (index === 0) {
      if (record.state !== 'armed') throw new Error('TEST_LEDGER_SQL_PATH_INVALID')
      insertLedgerSqlRow(database, ledgerSqlRow(record))
      continue
    }
    applyLedgerSqlTarget(database, record)
  }
}

function applyLedgerSqlTarget(
  database: DatabaseSync,
  record: RecoveryLedgerRecord,
  mutation: Readonly<Record<string, string | number | null>> = {},
): void {
  const split = splitLedgerSqlRow({ ...ledgerSqlRow(record), ...mutation })
  if (record.state === 'issuing') {
    database.exec('BEGIN')
    try {
      insertSqlRow(database, 'recovery_authorization_payload', split.payload)
      updateAuthorizationSqlValues(database, split.authorization)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    return
  }
  updateAuthorizationSqlValues(database, split.authorization)
}

function persistLedgerSqlRecord(database: DatabaseSync, record: RecoveryLedgerRecord): void {
  const path = [...ledgerSqlPredecessors(record), record]
  persistLedgerSqlPath(database, path)
}

describe('recovery ledger schema and arming', () => {
  it('loads the generated schema in SQLite so every declared reconstruction constraint is executable', () => {
    const database = new DatabaseSync(':memory:')
    try {
      expect(() => database.exec(RECOVERY_LEDGER_SQL_SCHEMA)).not.toThrow()
      expect(database.prepare(
        "SELECT json_object('enabled', json('true'), 'count', 0) AS value",
      ).get()).toEqual({ value: '{"enabled":true,"count":0}' })
    } finally {
      database.close()
    }
  })

  it('keeps every Cloudflare Durable Object SQLite table within the 100-column limit', () => {
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      const tables = database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ).all() as Array<{ name: string }>
      const columnCounts: Record<string, number> = {}
      for (const { name } of tables) {
        const count = database.prepare(`SELECT COUNT(*) AS count FROM pragma_table_info('${name}')`)
          .get() as { count: number }
        columnCounts[name] = count.count
        expect(count.count, name).toBeLessThanOrEqual(100)
      }
      expect(columnCounts).toEqual({
        recovery_authorization: 39,
        recovery_authorization_arming: 51,
        recovery_authorization_payload: 60,
        recovery_control: 55,
        recovery_used_arming: 2,
      })
      expect(encoder.encode(RECOVERY_LEDGER_SQL_SCHEMA).byteLength).toBeLessThanOrEqual(100_000)
      expect(RECOVERY_LEDGER_SQL_SCHEMA).not.toContain('\r')
    } finally {
      database.close()
    }
  })

  it('represents the reducer lifecycle through bounded transactional table writes', () => {
    const reservation = issuing()
    const issuance = applyLedgerEvent(reservation.record, finalizeEvent(reservation.control))
    const consumption = applyLedgerEvent(issuance, claimEvent(reservation.control))
    const reconciliation = applyLedgerEvent(consumption, {
      type: 'alarm',
      now: ledgerAlarmDeadline(consumption) as number,
    })
    const retry = applyLedgerEvent(reconciliation, {
      type: 'reconcile',
      proof: { outcome: 'ambiguous' },
      now: ledgerAlarmDeadline(reconciliation) as number,
    })
    const terminal = applyLedgerEvent(retry, {
      type: 'reconcile',
      proof: notDeployedProof(retry),
      now: ledgerAlarmDeadline(retry) as number,
    })
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      insertLedgerSqlRow(database, ledgerSqlRow(armed()))
      const splitReservation = splitLedgerSqlRow(ledgerSqlRow(reservation.record))
      expect(Object.keys(splitReservation.arming)).toHaveLength(51)
      expect(Object.keys(splitReservation.payload)).toHaveLength(60)
      expect(Object.keys(splitReservation.authorization).length).toBeLessThanOrEqual(100)

      database.exec('BEGIN')
      insertSqlRow(database, 'recovery_authorization_payload', splitReservation.payload)
      updateAuthorizationSqlRow(database, reservation.record)
      database.exec('COMMIT')
      for (const record of [issuance, consumption, reconciliation, retry, terminal]) {
        updateAuthorizationSqlRow(database, record)
        expect(database.prepare('SELECT state, revision FROM recovery_authorization').get())
          .toEqual({ state: record.state, revision: record.revision })
      }
    } finally {
      database.close()
    }
  })

  it('accepts a reconstructable SQL row for every reducer state and rejects incomplete state substitution', () => {
    const reservation = issuing()
    const issuance = applyLedgerEvent(reservation.record, finalizeEvent(reservation.control))
    const consumption = applyLedgerEvent(issuance, claimEvent(reservation.control))
    const reconciliation = applyLedgerEvent(consumption, {
      type: 'alarm',
      now: (consumption as { claim: { claimDeadline: number } }).claim.claimDeadline,
    })
    const completed = applyLedgerEvent(consumption, {
      type: 'complete',
      proof: completedProof(consumption),
      now: NOW + 3,
    })
    const notDeployed = applyLedgerEvent(reconciliation, {
      type: 'reconcile',
      proof: notDeployedProof(reconciliation),
      now: (reconciliation as { nextReconcileAt: number }).nextReconcileAt,
    })
    const expiredIssuing = applyLedgerEvent(reservation.record, {
      type: 'alarm',
      now: NOW + RECOVERY_ISSUING_TIMEOUT_SECONDS,
    })
    const expiredIssued = applyLedgerEvent(issuance, {
      type: 'alarm',
      now: NOW + 900,
    })
    const records = [
      armed(),
      reservation.record,
      issuance,
      consumption,
      reconciliation,
      completed,
      expiredIssuing,
      expiredIssued,
      notDeployed,
    ] as const

    for (const record of records) {
      const database = new DatabaseSync(':memory:')
      try {
        database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
        persistLedgerSqlRecord(database, record)
        expect(database.prepare('SELECT state FROM recovery_authorization').get())
          .toEqual({ state: record.state })
      } finally {
        database.close()
      }
    }

    const database = new DatabaseSync(':memory:')
    try {
      database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      insertLedgerSqlRow(database, ledgerSqlRow(armed()))
      for (const state of ['issuing', 'issued', 'claimed', 'reconciliation-required', 'completed', 'expired-unused', 'not-deployed']) {
        expect(() => database.prepare(
          'UPDATE recovery_authorization SET state = ? WHERE singleton_key = 1',
        ).run(state)).toThrow()
      }
    } finally {
      database.close()
    }
  })

  it('rejects direct advanced authorization inserts and nonzero-revision armed inserts', () => {
    const reservation = issuing()
    const issuance = applyLedgerEvent(reservation.record, finalizeEvent(reservation.control))

    const revisionDatabase = new DatabaseSync(':memory:')
    try {
      revisionDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      const split = splitLedgerSqlRow({ ...ledgerSqlRow(armed()), revision: 1 })
      insertSqlRow(revisionDatabase, 'recovery_authorization_arming', split.arming)
      expect.soft(() => insertSqlRow(
        revisionDatabase,
        'recovery_authorization',
        split.authorization,
      )).toThrow()
    } finally {
      revisionDatabase.close()
    }

    const advancedDatabase = new DatabaseSync(':memory:')
    try {
      advancedDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      const split = splitLedgerSqlRow(ledgerSqlRow(issuance))
      persistLedgerSqlRecord(advancedDatabase, reservation.record)
      advancedDatabase.exec('DROP TRIGGER recovery_authorization_immutable_delete')
      advancedDatabase.exec('DELETE FROM recovery_authorization')
      expect.soft(() => insertSqlRow(
        advancedDatabase,
        'recovery_authorization',
        split.authorization,
      )).toThrow()
    } finally {
      advancedDatabase.close()
    }
  })

  it('requires an exact initial disabled control insert', () => {
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      expect(() => insertSqlRow(database, 'recovery_control', {
        ...controlSqlRow(createLedgerControl({ authorizationEpoch: 3 })),
        revision: 1,
      })).toThrow()
    } finally {
      database.close()
    }

    const reinsertDatabase = new DatabaseSync(':memory:')
    try {
      reinsertDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      const initial = createLedgerControl({ authorizationEpoch: 3 })
      const enabled = reconcileLedgerControl(initial, {
        enabled: true,
        authorizationEpoch: 3,
        arming: arming(),
      })
      insertSqlRow(reinsertDatabase, 'recovery_control', controlSqlRow(initial))
      reinsertDatabase.exec('BEGIN')
      insertSqlRow(reinsertDatabase, 'recovery_used_arming', {
        request_id: REQUEST_ID,
        authorization_epoch: 3,
      })
      updateControlSqlRow(reinsertDatabase, controlSqlRow(enabled))
      reinsertDatabase.exec('COMMIT')
      reinsertDatabase.exec('DROP TRIGGER recovery_control_immutable_delete')
      reinsertDatabase.exec('DELETE FROM recovery_control')
      expect(() => insertSqlRow(
        reinsertDatabase,
        'recovery_control',
        controlSqlRow(enabled),
      )).toThrow()
    } finally {
      reinsertDatabase.close()
    }
  })

  it('stages used arming only against the matching disabled control epoch', () => {
    const missingControlDatabase = new DatabaseSync(':memory:')
    try {
      missingControlDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      expect.soft(() => insertSqlRow(missingControlDatabase, 'recovery_used_arming', {
        request_id: REQUEST_ID,
        authorization_epoch: 3,
      })).toThrow()
    } finally {
      missingControlDatabase.close()
    }

    const wrongEpochDatabase = new DatabaseSync(':memory:')
    try {
      wrongEpochDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      insertSqlRow(
        wrongEpochDatabase,
        'recovery_control',
        controlSqlRow(createLedgerControl({ authorizationEpoch: 3 })),
      )
      expect.soft(() => insertSqlRow(wrongEpochDatabase, 'recovery_used_arming', {
        request_id: REQUEST_ID,
        authorization_epoch: 4,
      })).toThrow()
    } finally {
      wrongEpochDatabase.close()
    }

    const activeControlDatabase = new DatabaseSync(':memory:')
    try {
      activeControlDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      const initial = createLedgerControl({ authorizationEpoch: 3 })
      const enabled = reconcileLedgerControl(initial, {
        enabled: true,
        authorizationEpoch: 3,
        arming: arming(),
      })
      insertSqlRow(activeControlDatabase, 'recovery_control', controlSqlRow(initial))
      activeControlDatabase.exec('BEGIN')
      insertSqlRow(activeControlDatabase, 'recovery_used_arming', {
        request_id: REQUEST_ID,
        authorization_epoch: 3,
      })
      updateControlSqlRow(activeControlDatabase, controlSqlRow(enabled))
      activeControlDatabase.exec('COMMIT')
      expect.soft(() => insertSqlRow(activeControlDatabase, 'recovery_used_arming', {
        request_id: OTHER_REQUEST_ID,
        authorization_epoch: 4,
      })).toThrow()
    } finally {
      activeControlDatabase.close()
    }
  })

  it('stages a payload only for the matching existing armed authorization core', () => {
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      const split = splitLedgerSqlRow(ledgerSqlRow(issuing().record))
      insertSqlRow(database, 'recovery_authorization_arming', split.arming)
      expect(() => insertSqlRow(
        database,
        'recovery_authorization_payload',
        split.payload,
      )).toThrow()
    } finally {
      database.close()
    }
  })

  it('rejects SQL rows whose claim or candidate digests disagree with the reducer snapshot', () => {
    const value = claimed()
    expectLedgerSqlMutationRejected(value.record, {
      claim_live_invariant_digest: '8'.repeat(64),
    })
    expectLedgerSqlMutationRejected(value.record, {
      claim_snapshot_digest: '4'.repeat(64),
    })
    expectLedgerSqlMutationRejected(value.record, {
      claim_snapshot_digest: '5'.repeat(64),
    })
    expectLedgerSqlMutationRejected(issuing().record, {
      payload_candidate_commit: '8'.repeat(40),
    })
  })

  it('binds the transient reserved payload JSON byte-for-byte to its typed payload columns', () => {
    const value = issuing()
    const changedPayload = new TextDecoder().decode(serializeExactObject(
      RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
      payload({ candidateTree: '9'.repeat(40) }),
    ))
    expectLedgerSqlMutationRejected(value.record, { reserved_payload_json: changedPayload })
    expectLedgerSqlMutationRejected(value.record, { payload_candidate_tree: '9'.repeat(40) })
  })

  it('rejects SQL rows whose transition clocks or reconciliation schedule cannot come from the reducer', () => {
    const reservation = issuing()
    const issuance = applyLedgerEvent(reservation.record, finalizeEvent(reservation.control))
    const consumption = applyLedgerEvent(issuance, claimEvent(reservation.control))
    const completed = applyLedgerEvent(consumption, {
      type: 'complete',
      proof: completedProof(consumption),
      now: NOW + 3,
    })
    const expiredIssuing = applyLedgerEvent(reservation.record, {
      type: 'alarm',
      now: NOW + RECOVERY_ISSUING_TIMEOUT_SECONDS,
    })
    const expiredIssued = applyLedgerEvent(issuance, {
      type: 'alarm',
      now: NOW + 900,
    })

    expectLedgerSqlMutationRejected(reservation.record, {
      reserved_at: NOW + 1,
      issuing_deadline: NOW + 1 + RECOVERY_ISSUING_TIMEOUT_SECONDS,
    })
    expectLedgerSqlMutationRejected(issuance, { last_transition_at: NOW - 1 })
    expectLedgerSqlMutationRejected(consumption, {
      claimed_at: NOW + 3,
      claim_deadline: NOW + 3 + RECOVERY_CLAIM_DEADLINE_SECONDS,
    })
    expectLedgerSqlMutationRejected(completed, { completed_at: NOW + 4 })
    expectLedgerSqlMutationRejected(expiredIssuing, { expired_at: NOW + 121 })
    expectLedgerSqlMutationRejected(expiredIssued, { expired_at: NOW + 901 })

    const claimDeadline = ledgerAlarmDeadline(consumption) as number
    let reconciling = applyLedgerEvent(consumption, {
      type: 'alarm',
      now: claimDeadline,
    })
    expectLedgerSqlMutationRejected(reconciling, {
      last_transition_at: claimDeadline - 1,
      next_reconcile_at: claimDeadline - 1,
    })
    for (let attempt = 0; attempt < RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS.length; attempt += 1) {
      expectLedgerSqlMutationRejected(reconciling, {
        next_reconcile_at: (ledgerAlarmDeadline(reconciling) as number) + 1,
      })
      const now = ledgerAlarmDeadline(reconciling) as number
      reconciling = applyLedgerEvent(reconciling, {
        type: 'reconcile',
        now,
        proof: { outcome: 'ambiguous' },
      })
    }
    expectLedgerSqlMutationRejected(reconciling, {
      next_reconcile_at: (reconciling.lastTransitionAt as number) + 1,
    })
  })

  it('rejects direct deletion, state rewind, stable-field mutation, and issued-JWS substitution', () => {
    const reservation = issuing()
    const issuance = applyLedgerEvent(reservation.record, finalizeEvent(reservation.control))

    const deletionDatabase = new DatabaseSync(':memory:')
    try {
      deletionDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      persistLedgerSqlRecord(deletionDatabase, issuance)
      expect.soft(() => deletionDatabase.exec('DELETE FROM recovery_authorization')).toThrow()
      expect.soft(() => deletionDatabase.exec(
        `UPDATE recovery_authorization SET locator_artifact_id = '790' WHERE singleton_key = 1`,
      )).toThrow()
    } finally {
      deletionDatabase.close()
    }

    const rewindDatabase = new DatabaseSync(':memory:')
    try {
      rewindDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      persistLedgerSqlRecord(rewindDatabase, issuance)
      expect.soft(() => updateAuthorizationSqlRow(rewindDatabase, reservation.record)).toThrow()
    } finally {
      rewindDatabase.close()
    }

    const jwsDatabase = new DatabaseSync(':memory:')
    try {
      jwsDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      persistLedgerSqlRecord(jwsDatabase, issuance)
      expect.soft(() => jwsDatabase.prepare(
        'UPDATE recovery_authorization SET authorization_jws = ?, authorization_jws_sha256 = ?, last_transition_at = last_transition_at + 1, revision = revision + 1 WHERE singleton_key = 1',
      ).run('substituted', '8'.repeat(64))).toThrow()
    } finally {
      jwsDatabase.close()
    }
  })

  it('makes arming and payload rows immutable after their transactional insert', () => {
    const value = issuing()
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      persistLedgerSqlRecord(database, value.record)
      expect(() => database.exec(
        `UPDATE recovery_authorization_arming SET preparation_commit = '${'9'.repeat(40)}'`,
      )).toThrow()
      expect(() => database.exec('DELETE FROM recovery_authorization_arming')).toThrow()
      expect(() => database.exec(
        `UPDATE recovery_authorization_payload SET payload_candidate_tree = '${'9'.repeat(40)}'`,
      )).toThrow()
      expect(() => database.exec('DELETE FROM recovery_authorization_payload')).toThrow()
    } finally {
      database.close()
    }
  })

  it('declares every exact arming field as a dedicated SQL column, never an identity blob', () => {
    expect(RECOVERY_ARMING_TUPLE_KEYS).toHaveLength(50)
    for (const key of RECOVERY_ARMING_TUPLE_KEYS) {
      const column = key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)
      expect(RECOVERY_LEDGER_SQL_SCHEMA).toContain(`${column} `)
    }
    expect(RECOVERY_LEDGER_SQL_SCHEMA).not.toMatch(/arming_(?:json|blob)|identity_(?:json|blob)/u)
    for (const state of ['armed', 'issuing', 'issued', 'claimed', 'reconciliation-required', 'completed', 'expired-unused', 'not-deployed']) {
      expect(RECOVERY_LEDGER_SQL_SCHEMA).toContain(`'${state}'`)
      expect(RECOVERY_LEDGER_SQL_SCHEMA).toContain(`(state = '${state}' AND`)
    }
    expect(RECOVERY_LEDGER_SQL_SCHEMA).toContain('expired_at INTEGER')
    expect(RECOVERY_LEDGER_SQL_SCHEMA).toContain("expiration_source TEXT CHECK (expiration_source IS NULL OR expiration_source IN ('issuing', 'issued'))")
    expect(RECOVERY_LEDGER_SQL_SCHEMA).toContain('last_transition_at INTEGER')
  })

  it('stores the complete active control arming tuple in dedicated reconstructable columns', () => {
    const controlSchema = RECOVERY_LEDGER_SQL_SCHEMA.slice(
      RECOVERY_LEDGER_SQL_SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS recovery_control'),
      RECOVERY_LEDGER_SQL_SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS recovery_used_arming'),
    )
    for (const key of RECOVERY_ARMING_TUPLE_KEYS) {
      const column = key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)
      expect(controlSchema).toContain(`active_${column} `)
    }
    expect(controlSchema).not.toMatch(/active_arming_(?:json|blob)|active_identity_(?:json|blob)/u)
    expect(controlSchema).toContain("enabled = 1 AND active_request_id IS NOT NULL")
    expect(controlSchema).toContain("enabled = 0 AND active_request_id IS NULL")
  })

  it('initializes disabled and reconciles control monotonically with a new unused tuple', () => {
    const initial = createLedgerControl({ authorizationEpoch: 3 })
    expect(initial).toMatchObject({
      enabled: false,
      authorizationEpoch: 3,
      maxConsumedAuthorizationEpoch: null,
      activeArming: null,
    })

    const first = reconcileLedgerControl(initial, { enabled: true, authorizationEpoch: 3, arming: arming() })
    expect(first).toMatchObject({ enabled: true, maxConsumedAuthorizationEpoch: 3 })
    expect(reconcileLedgerControl(first, { enabled: true, authorizationEpoch: 3, arming: arming() })).toBe(first)

    const disabled = reconcileLedgerControl(first, { enabled: false, authorizationEpoch: 3 })
    expect(disabled).toMatchObject({ enabled: false, maxConsumedAuthorizationEpoch: 3 })
    expect(() => reconcileLedgerControl(disabled, { enabled: true, authorizationEpoch: 3, arming: arming() }))
      .toThrowError('RECOVERY_LEDGER_ARMING_ALREADY_USED')
    expect(() => reconcileLedgerControl(disabled, {
      enabled: true,
      authorizationEpoch: 3,
      arming: arming({ requestId: OTHER_REQUEST_ID }),
    })).toThrowError('RECOVERY_LEDGER_EPOCH_ALREADY_CONSUMED')
    expect(() => reconcileLedgerControl(disabled, { enabled: false, authorizationEpoch: 2 }))
      .toThrowError('RECOVERY_LEDGER_EPOCH_DECREASE')
    expect(() => reconcileLedgerControl(disabled, { enabled: true, authorizationEpoch: 4, arming: arming({ authorizationEpoch: 4 }) }))
      .toThrowError('RECOVERY_LEDGER_EPOCH_ADVANCE_MUST_DISABLE')

    const advanced = reconcileLedgerControl(disabled, { enabled: false, authorizationEpoch: 4 })
    expect(advanced.maxConsumedAuthorizationEpoch).toBe(3)
    const nextTuple = arming({ requestId: OTHER_REQUEST_ID, authorizationEpoch: 4 })
    const reenabled = reconcileLedgerControl(advanced, { enabled: true, authorizationEpoch: 4, arming: nextTuple })
    expect(reenabled).toMatchObject({
      enabled: true,
      authorizationEpoch: 4,
      maxConsumedAuthorizationEpoch: 4,
    })
    expect(reenabled.activeArming?.requestId).toBe(OTHER_REQUEST_ID)
  })

  it('persists the consumed epoch watermark with the exact active control tuple', () => {
    const database = new DatabaseSync(':memory:')
    const tuple = arming()
    const initial = createLedgerControl({ authorizationEpoch: tuple.authorizationEpoch })
    const enabled = reconcileLedgerControl(initial, {
      enabled: true,
      authorizationEpoch: tuple.authorizationEpoch,
      arming: tuple,
    })
    try {
      database.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      insertSqlRow(database, 'recovery_control', controlSqlRow(initial))
      database.exec('BEGIN')
      try {
        insertSqlRow(database, 'recovery_used_arming', {
          request_id: tuple.requestId,
          authorization_epoch: tuple.authorizationEpoch,
        })
        updateControlSqlRow(database, controlSqlRow(enabled))
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      expect(database.prepare(
        'SELECT enabled, authorization_epoch, max_consumed_authorization_epoch, active_request_id FROM recovery_control',
      ).get()).toEqual({
        enabled: 1,
        authorization_epoch: 3,
        max_consumed_authorization_epoch: 3,
        active_request_id: REQUEST_ID,
      })
    } finally {
      database.close()
    }
  })

  it('rejects SQL control replay, watermark substitution, active tuple mutation, and deletion', () => {
    const initial = createLedgerControl({ authorizationEpoch: 3 })
    const first = reconcileLedgerControl(initial, {
      enabled: true,
      authorizationEpoch: 3,
      arming: arming(),
    })
    const disabled = reconcileLedgerControl(first, { enabled: false, authorizationEpoch: 3 })
    const advanced = reconcileLedgerControl(disabled, { enabled: false, authorizationEpoch: 4 })

    const replayDatabase = new DatabaseSync(':memory:')
    try {
      replayDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      insertSqlRow(replayDatabase, 'recovery_control', controlSqlRow(initial))
      replayDatabase.exec('BEGIN')
      insertSqlRow(replayDatabase, 'recovery_used_arming', {
        request_id: REQUEST_ID,
        authorization_epoch: 3,
      })
      updateControlSqlRow(replayDatabase, controlSqlRow(first))
      replayDatabase.exec('COMMIT')
      updateControlSqlRow(replayDatabase, controlSqlRow(disabled))
      expect.soft(() => insertSqlRow(replayDatabase, 'recovery_used_arming', {
        request_id: OTHER_REQUEST_ID,
        authorization_epoch: 3,
      })).toThrow()
      expect.soft(() => updateControlSqlRow(replayDatabase, {
        ...controlSqlRow(first),
        active_request_id: OTHER_REQUEST_ID,
        revision: disabled.revision + 1,
      })).toThrow()
    } finally {
      replayDatabase.close()
    }

    const activeMutationDatabase = new DatabaseSync(':memory:')
    try {
      activeMutationDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      insertSqlRow(activeMutationDatabase, 'recovery_control', controlSqlRow(initial))
      activeMutationDatabase.exec('BEGIN')
      insertSqlRow(activeMutationDatabase, 'recovery_used_arming', {
        request_id: REQUEST_ID,
        authorization_epoch: 3,
      })
      updateControlSqlRow(activeMutationDatabase, controlSqlRow(first))
      activeMutationDatabase.exec('COMMIT')
      expect.soft(() => updateControlSqlRow(activeMutationDatabase, {
        ...controlSqlRow(first),
        active_preparation_commit: '9'.repeat(40),
        revision: first.revision + 1,
      })).toThrow()
    } finally {
      activeMutationDatabase.close()
    }

    const mutationDatabase = new DatabaseSync(':memory:')
    try {
      mutationDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      insertSqlRow(mutationDatabase, 'recovery_control', controlSqlRow(initial))
      mutationDatabase.exec('BEGIN')
      insertSqlRow(mutationDatabase, 'recovery_used_arming', {
        request_id: REQUEST_ID,
        authorization_epoch: 3,
      })
      updateControlSqlRow(mutationDatabase, controlSqlRow(first))
      mutationDatabase.exec('COMMIT')
      updateControlSqlRow(mutationDatabase, controlSqlRow(disabled))
      expect.soft(() => updateControlSqlRow(mutationDatabase, {
        ...controlSqlRow(advanced),
        max_consumed_authorization_epoch: 2,
      })).toThrow()
      expect.soft(() => mutationDatabase.exec('DELETE FROM recovery_control')).toThrow()
    } finally {
      mutationDatabase.close()
    }

    const missingUsedDatabase = new DatabaseSync(':memory:')
    try {
      missingUsedDatabase.exec(RECOVERY_LEDGER_SQL_SCHEMA)
      expect.soft(() => insertSqlRow(
        missingUsedDatabase,
        'recovery_control',
        controlSqlRow(first),
      )).toThrow()
    } finally {
      missingUsedDatabase.close()
    }
  })

  it('rejects non-exact control and install envelopes', () => {
    const initial = createLedgerControl({ authorizationEpoch: 3 })
    expect(() => reconcileLedgerControl(initial, {
      enabled: false,
      authorizationEpoch: 3,
      unexpected: true,
    } as never)).toThrowError('RECOVERY_LEDGER_CONTROL_INVALID')
    expect(() => reconcileLedgerControl({ ...initial, unexpected: true } as never, {
      enabled: false,
      authorizationEpoch: 3,
    })).toThrowError('RECOVERY_LEDGER_CONTROL_INVALID')

    const control = enabledControl()
    expect(() => installLedgerArming(undefined, {
      arming: arming(),
      control,
      unexpected: true,
    } as never)).toThrowError('RECOVERY_LEDGER_INSTALL_INVALID')
  })

  it('installs an exact arming tuple once and rejects every bridge/program/atlas substitution', () => {
    const tuple = arming()
    const control = enabledControl(tuple)
    const installed = installLedgerArming(undefined, { arming: tuple, control })
    expect(installed.state).toBe('armed')
    expect(installLedgerArming(installed, { arming: tuple, control })).toBe(installed)

    const mutations: ReadonlyArray<readonly [keyof RecoveryArmingTuple, unknown]> = [
      ['bridgeWorkerVersion', 'substituted'],
      ['bridgeWorkerVersionId', '123e4567-e89b-42d3-a456-426614174003'],
      ['bridgeSourceCommit', '8'.repeat(40)],
      ['bridgeConfigIdentity', '8'.repeat(64)],
      ['bridgeConfigEpoch', 5],
      ['g001ExpectedProgramKeccak256', '8'.repeat(64)],
      ['g002ExpectedProgramKeccak256', '9'.repeat(64)],
      ['ptrExpectedProgramKeccak256', 'a'.repeat(64)],
      ['g002AtlasId', 'SUBSTITUTED'],
      ['g002PublicReleaseId', `GRR-${'E'.repeat(26)}`],
      ['g002PublicApprovalReceiptId', `GRA-${'F'.repeat(26)}`],
      ['g002AtlasSourceCommit', '8'.repeat(40)],
      ['g002ReleaseSha256', '81'.repeat(32)],
      ['g002ReleaseHeaderSha256', '82'.repeat(32)],
      ['g002VerificationDigest', '83'.repeat(32)],
      ['ptrAtlasId', 'SUBSTITUTED'],
      ['ptrPublicReleaseId', `GRR-${'E'.repeat(26)}`],
      ['ptrPublicApprovalReceiptId', `GRA-${'F'.repeat(26)}`],
      ['ptrAtlasSourceCommit', '9'.repeat(40)],
      ['ptrExpectedReleaseSha256', '91'.repeat(32)],
      ['ptrReleaseHeaderSha256', '92'.repeat(32)],
      ['ptrVerificationDigest', '93'.repeat(32)],
    ]
    for (const [key, value] of mutations) {
      expect(() => installLedgerArming(installed, { arming: arming({ [key]: value }), control }))
        .toThrowError('RECOVERY_LEDGER_ARMING_CONFLICT')
    }
  })
})

describe('recovery authorization issue state machine', () => {
  it('denies reservation when control is disabled or its dynamic epoch differs', () => {
    const tuple = arming()
    const control = enabledControl(tuple)
    const record = armed(tuple, control)
    const disabled = reconcileLedgerControl(control, { enabled: false, authorizationEpoch: 3 })
    expect(() => applyLedgerEvent(record, reserveEvent(disabled)))
      .toThrowError('RECOVERY_LEDGER_CONTROL_DISABLED')
    const nextEpochControl = enabledControl(arming({
      requestId: OTHER_REQUEST_ID,
      authorizationEpoch: 4,
    }))
    expect(() => applyLedgerEvent(record, reserveEvent(nextEpochControl)))
      .toThrowError('RECOVERY_LEDGER_EPOCH_MISMATCH')
  })

  it('binds the authorization predecessor to the armed preparation commit', () => {
    const control = enabledControl()
    const record = armed(arming(), control)
    expect(() => applyLedgerEvent(record, reserveEvent(control, {
      payload: payload({ predecessorCommit: 'c'.repeat(40) }),
    }))).toThrowError('RECOVERY_LEDGER_PAYLOAD_MISMATCH')
  })

  it('reserves once and resumes only the immutable payload, jti, times, locators, and stable workflow projection', () => {
    const value = issuing()
    expect(value.record).toMatchObject({
      state: 'issuing',
      authorization: {
        authorizationJti: AUTHORIZATION_JTI,
        issuedAt: NOW,
        notBefore: NOW,
        expiresAt: NOW + 900,
      },
      reservedAt: NOW,
      issuingDeadline: NOW + RECOVERY_ISSUING_TIMEOUT_SECONDS,
    })
    expect(ledgerAlarmDeadline(value.record)).toBe(NOW + 120)

    const retry = applyLedgerEvent(value.record, reserveEvent(value.control, {
      identity: identity({ oidcJti: OTHER_OIDC_JTI }),
      now: NOW + 30,
    }))
    expect(retry).toBe(value.record)
    expect(JSON.stringify(retry)).not.toContain(OTHER_OIDC_JTI)
    expect(JSON.stringify(retry)).not.toContain(identity().oidcJti)

    for (const [field, replacement] of [
      ['requestId', OTHER_REQUEST_ID],
      ['candidateCommit', '8'.repeat(40)],
      ['sourceVerifyRunId', '457'],
      ['sourceVerifyRunAttempt', '3'],
      ['artifactId', '790'],
    ] as const) {
      expect(() => applyLedgerEvent(value.record, reserveEvent(value.control, { locators: locators({ [field]: replacement }) })))
        .toThrowError('RECOVERY_LEDGER_ISSUE_MISMATCH')
    }

    for (const [field, replacement] of [
      ['workflowSha', '8'.repeat(40)],
      ['pagesRunId', '124'],
      ['pagesRunAttempt', '2'],
      ['checkRunId', '998'],
      ['repository', 'other/Warpkeep'],
      ['repositoryId', '1273513253'],
      ['repositoryOwnerId', '183124840'],
      ['ref', 'refs/heads/other'],
      ['workflowRef', 'ael-dev3/Warpkeep/.github/workflows/other.yml@refs/heads/main'],
      ['environment', 'other'],
      ['eventName', 'push'],
    ] as const) {
      expect(() => applyLedgerEvent(value.record, reserveEvent(value.control, { identity: identity({ [field]: replacement }) })))
        .toThrowError('RECOVERY_LEDGER_ISSUE_MISMATCH')
    }

    expect(() => applyLedgerEvent(value.record, reserveEvent(value.control, {
      payload: payload({ jti: '123e4567-e89b-42d3-a456-426614174097' }),
    }))).toThrowError('RECOVERY_LEDGER_ISSUE_MISMATCH')
    expect(() => applyLedgerEvent(value.record, reserveEvent(value.control, {
      payload: payload({ iat: NOW + 1, nbf: NOW + 1, exp: NOW + 901 }),
    }))).toThrowError('RECOVERY_LEDGER_ISSUE_MISMATCH')
    expect(() => applyLedgerEvent(value.record, reserveEvent(value.control, { now: NOW + 120 })))
      .toThrowError('RECOVERY_LEDGER_RESERVATION_EXPIRED')
  })

  it('resumes an issuing row from its stored payload without accepting a caller reconstruction requirement', () => {
    const value = issuing()
    const { payload: _discardedPayload, ...retry } = reserveEvent(value.control, {
      identity: identity({ oidcJti: OTHER_OIDC_JTI }),
      now: NOW + 1,
    }) as Extract<LedgerEvent, { type: 'reserve-issue' }>

    expect(applyLedgerEvent(value.record, retry as LedgerEvent)).toBe(value.record)
    expect((value.record as { reservedPayload: RecoveryAuthorizationPayload }).reservedPayload)
      .toEqual(payload())
  })

  it('rejects backward time at every issue, read, claim, and completion boundary', () => {
    const reservation = issuing()
    expect(() => applyLedgerEvent(reservation.record, reserveEvent(reservation.control, { now: NOW - 1 })))
      .toThrowError('RECOVERY_LEDGER_TIME_BACKWARDS')
    expect(() => applyLedgerEvent(reservation.record, finalizeEvent(reservation.control, { now: NOW - 1 })))
      .toThrowError('RECOVERY_LEDGER_TIME_BACKWARDS')

    const issuance = issued()
    expect(() => applyLedgerEvent(issuance.record, {
      type: 'read-issued',
      control: issuance.control,
      locators: locators(),
      identity: identity(),
      now: NOW,
    })).toThrowError('RECOVERY_LEDGER_TIME_BACKWARDS')
    expect(() => applyLedgerEvent(issuance.record, claimEvent(issuance.control, { now: NOW })))
      .toThrowError('RECOVERY_LEDGER_TIME_BACKWARDS')

    const consumption = claimed()
    expect(() => applyLedgerEvent(consumption.record, {
      type: 'complete',
      proof: completedProof(consumption.record),
      now: NOW + 1,
    })).toThrowError('RECOVERY_LEDGER_TIME_BACKWARDS')
  })

  it('expires an interrupted reservation exactly at 120 seconds and cannot re-arm it', () => {
    const value = issuing()
    expect(() => applyLedgerEvent(value.record, { type: 'alarm', now: NOW + 119 }))
      .toThrowError('RECOVERY_LEDGER_ALARM_NOT_DUE')
    const expired = applyLedgerEvent(value.record, { type: 'alarm', now: NOW + 120 })
    expect(expired.state).toBe('expired-unused')
    expect(JSON.stringify(expired)).not.toContain('reservedPayload')
    expect(ledgerAlarmDeadline(expired)).toBeNull()
    expect(() => applyLedgerEvent(expired, reserveEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_REISSUE_DENIED')
    expect(() => applyLedgerEvent(expired, claimEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_AUTHORIZATION_EXPIRED')
  })

  it('finalizes one exact JWS and returns it only to an exact stable retry', () => {
    const value = issuing()
    const result = applyLedgerEvent(value.record, finalizeEvent(value.control))
    expect(result).toMatchObject({ state: 'issued', authorizationJws: JWS, authorizationJwsSha256: JWS_SHA256 })
    expect(JSON.stringify(result)).not.toContain('reservedPayload')
    expect(ledgerAlarmDeadline(result)).toBe(NOW + 900)
    expect(applyLedgerEvent(result, finalizeEvent(value.control))).toBe(result)

    const exactRetry = applyLedgerEvent(result, {
      type: 'read-issued',
      control: value.control,
      locators: locators(),
      identity: identity({ oidcJti: OTHER_OIDC_JTI }),
      now: NOW + 2,
    })
    expect(exactRetry).toBe(result)

    expect(() => applyLedgerEvent(result, {
      type: 'read-issued', control: value.control, locators: locators({ artifactId: '790' }), identity: identity(), now: NOW + 2,
    })).toThrowError('RECOVERY_LEDGER_ISSUE_MISMATCH')
    expect(() => applyLedgerEvent(result, {
      type: 'read-issued', control: value.control, locators: locators(), identity: identity({ pagesRunAttempt: '2' }), now: NOW + 2,
    })).toThrowError('RECOVERY_LEDGER_ISSUE_MISMATCH')
  })

  it('finalizes only a structurally exact JWS over the reserved canonical payload and its raw digest', () => {
    const value = issuing()
    const changedPayloadJws = compactAuthorizationJws(payload({ candidateTree: '9'.repeat(40) }))

    expect(() => applyLedgerEvent(value.record, finalizeEvent(value.control, {
      authorizationJws: 'header.payload.signature',
      authorizationJwsSha256: rawSha256('header.payload.signature'),
    }))).toThrowError('RECOVERY_LEDGER_JWS_INVALID')
    expect(() => applyLedgerEvent(value.record, finalizeEvent(value.control, {
      authorizationJws: changedPayloadJws,
      authorizationJwsSha256: rawSha256(changedPayloadJws),
    }))).toThrowError('RECOVERY_LEDGER_JWS_PAYLOAD_MISMATCH')
    expect(() => applyLedgerEvent(value.record, finalizeEvent(value.control, {
      authorizationJwsSha256: '6'.repeat(64),
    }))).toThrowError('RECOVERY_LEDGER_JWS_DIGEST_MISMATCH')
  })

  it('accepts a fresh exact OIDC jti but rejects arbitrary identity extras instead of persisting them', () => {
    const value = issued()
    const retried = applyLedgerEvent(value.record, {
      type: 'read-issued', control: value.control, locators: locators(), identity: identity({ oidcJti: OTHER_OIDC_JTI }), now: NOW + 2,
    })
    const serialized = JSON.stringify(retried)
    expect(retried).toBe(value.record)
    expect(serialized).not.toContain('oidcJti')

    expect(() => applyLedgerEvent(value.record, {
      type: 'read-issued',
      control: value.control,
      locators: locators(),
      identity: { ...identity(), rawOidcToken: 'DO-NOT-PERSIST-RAW-OIDC' },
      now: NOW + 2,
    } as never)).toThrowError('RECOVERY_LEDGER_ISSUE_MISMATCH')
  })

  it('rejects extra event keys, non-exact embedded control, and unknown event types', () => {
    const value = issuing()
    expect(() => applyLedgerEvent(value.record, {
      ...finalizeEvent(value.control),
      unexpected: true,
    } as never)).toThrowError('RECOVERY_LEDGER_EVENT_INVALID')
    expect(() => applyLedgerEvent(value.record, {
      ...finalizeEvent({ ...value.control, unexpected: true } as never),
    } as never)).toThrowError('RECOVERY_LEDGER_CONTROL_INVALID')
    expect(() => applyLedgerEvent(value.record, {
      type: 'future-event',
      now: NOW + 1,
    } as never)).toThrowError('RECOVERY_LEDGER_EVENT_INVALID')
  })

  it('cleans an unclaimed JWS at its fixed expiry and denies an expired claim', () => {
    const value = issued()
    const expiredByClaim = applyLedgerEvent(value.record, claimEvent(value.control, { now: NOW + 900 }))
    expect(expiredByClaim).toMatchObject({
      state: 'expired-unused',
      expiredAt: NOW + 900,
      expirationSource: 'issued',
    })
    expect(JSON.stringify(expiredByClaim)).not.toContain(JWS)
    expect(() => applyLedgerEvent(value.record, { type: 'alarm', now: NOW + 899 }))
      .toThrowError('RECOVERY_LEDGER_ALARM_NOT_DUE')
    const expired = applyLedgerEvent(value.record, { type: 'alarm', now: NOW + 900 })
    expect(expired.state).toBe('expired-unused')
    expect(JSON.stringify(expired)).not.toContain(JWS)
    expect(() => applyLedgerEvent(expired, finalizeEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_REISSUE_DENIED')
  })
})

describe('claim, completion, and reconciliation', () => {
  it('binds claim to a fresh matching live invariant and a distinct claim snapshot', () => {
    const value = issued()
    expect(() => applyLedgerEvent(value.record, claimEvent(value.control, {
      liveInvariantDigest: '8'.repeat(64),
    }))).toThrowError('RECOVERY_LEDGER_LIVE_INVARIANT_CHANGED')
    expect(() => applyLedgerEvent(value.record, claimEvent(value.control, {
      claimSnapshotDigest: '4'.repeat(64),
    }))).toThrowError('RECOVERY_LEDGER_CLAIM_SNAPSHOT_NOT_DISTINCT')
    expect(() => applyLedgerEvent(value.record, claimEvent(value.control, {
      claimSnapshotDigest: '5'.repeat(64),
    }))).toThrowError('RECOVERY_LEDGER_CLAIM_SNAPSHOT_NOT_DISTINCT')
  })

  it('admits one exact claim, stores a separate claim snapshot, and deletes raw JWS synchronously', () => {
    const value = issued()
    expect(() => applyLedgerEvent(value.record, claimEvent(value.control, { authorizationJws: 'wrong' })))
      .toThrowError('RECOVERY_LEDGER_JWS_MISMATCH')
    const result = applyLedgerEvent(value.record, claimEvent(value.control))
    expect(result).toMatchObject({
      state: 'claimed',
      claim: {
        claimSnapshotDigest: '7'.repeat(64),
        claimLiveInvariantDigest: '5'.repeat(64),
        claimSequence: 1,
        claimedAt: NOW + 2,
        claimDeadline: NOW + 2 + RECOVERY_CLAIM_DEADLINE_SECONDS,
      },
    })
    expect((result as { authorization: { issuanceEvidenceSnapshotDigest: string } }).authorization.issuanceEvidenceSnapshotDigest)
      .toBe('4'.repeat(64))
    expect(JSON.stringify(result)).not.toContain(JWS)
    expect(ledgerAlarmDeadline(result)).toBe(NOW + 1_202)
    expect(() => applyLedgerEvent(result, claimEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_ALREADY_CLAIMED')
  })

  it('requires current authority through claim but lets consumed rows complete after control changes', () => {
    const value = issued()
    const disabled = reconcileLedgerControl(value.control, { enabled: false, authorizationEpoch: 3 })
    expect(() => applyLedgerEvent(value.record, claimEvent(disabled)))
      .toThrowError('RECOVERY_LEDGER_CONTROL_DISABLED')

    const consumed = applyLedgerEvent(value.record, claimEvent(value.control))
    const complete = applyLedgerEvent(consumed, { type: 'complete', now: NOW + 3, proof: completedProof(consumed) })
    expect(complete).toMatchObject({ state: 'completed', outcome: 'completed', completedAt: NOW + 3 })
    expect(() => applyLedgerEvent(complete, reserveEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_REISSUE_DENIED')
    expect(() => applyLedgerEvent(complete, claimEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_ALREADY_CLAIMED')
  })

  it('requires all three post-deploy facts and completion before the fixed claim deadline', () => {
    const value = claimed()
    for (const proof of [
      completedProof(value.record, { deployStepConclusion: 'failure' }),
      completedProof(value.record, { matchingPagesDeployment: false }),
      completedProof(value.record, { deploymentAttestationMatches: false }),
    ]) {
      expect(() => applyLedgerEvent(value.record, { type: 'complete', now: NOW + 3, proof } as LedgerEvent))
        .toThrowError('RECOVERY_LEDGER_COMPLETION_NOT_PROVEN')
    }
    expect(() => applyLedgerEvent(value.record, {
      type: 'complete', now: NOW + 1_202, proof: completedProof(value.record),
    })).toThrowError('RECOVERY_LEDGER_CLAIM_DEADLINE_REACHED')
  })

  it('rejects completion and not-deployed proofs substituted from another stored row binding', () => {
    const value = claimed()
    expect(() => applyLedgerEvent(value.record, {
      type: 'complete',
      now: NOW + 3,
      proof: completedProof(value.record, { rowBindingDigest: '8'.repeat(64) }),
    } as LedgerEvent)).toThrowError('RECOVERY_LEDGER_ROW_BINDING_MISMATCH')

    const deadline = NOW + 1_202
    const reconciling = applyLedgerEvent(value.record, { type: 'alarm', now: deadline })
    expect(() => applyLedgerEvent(reconciling, {
      type: 'reconcile',
      now: deadline,
      proof: notDeployedProof(reconciling, { rowBindingDigest: '8'.repeat(64) }),
    } as LedgerEvent)).toThrowError('RECOVERY_LEDGER_ROW_BINDING_MISMATCH')
  })

  it('enters reconciliation at the exact claim deadline and schedules only 1/5/15/60 minute retries', () => {
    const value = claimed()
    const deadline = NOW + 1_202
    expect(() => applyLedgerEvent(value.record, { type: 'alarm', now: deadline - 1 }))
      .toThrowError('RECOVERY_LEDGER_ALARM_NOT_DUE')
    let record = applyLedgerEvent(value.record, { type: 'alarm', now: deadline })
    expect(record).toMatchObject({ state: 'reconciliation-required', nextReconcileAt: deadline, reconciliationAttempts: 0 })

    const scheduled: number[] = []
    for (const delay of RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS) {
      const now = ledgerAlarmDeadline(record) as number
      record = applyLedgerEvent(record, { type: 'reconcile', now, proof: { outcome: 'ambiguous' } })
      scheduled.push((ledgerAlarmDeadline(record) as number) - now)
      expect(() => applyLedgerEvent(record, reserveEvent(value.control)))
        .toThrowError('RECOVERY_LEDGER_REISSUE_DENIED')
      expect(() => applyLedgerEvent(record, claimEvent(value.control)))
        .toThrowError('RECOVERY_LEDGER_ALREADY_CLAIMED')
    }
    expect(scheduled).toEqual([...RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS])

    const finalRetryAt = ledgerAlarmDeadline(record) as number
    record = applyLedgerEvent(record, { type: 'reconcile', now: finalRetryAt, proof: { outcome: 'ambiguous' } })
    expect(record).toMatchObject({ state: 'reconciliation-required', nextReconcileAt: null, reconciliationAttempts: 5 })
    expect(ledgerAlarmDeadline(record)).toBeNull()
    expect(() => applyLedgerEvent(record, { type: 'reconcile', now: finalRetryAt + 1, proof: { outcome: 'ambiguous' } }))
      .toThrowError('RECOVERY_LEDGER_RECONCILIATION_EXHAUSTED')
  })

  it('rejects an early reconciliation retry', () => {
    const value = claimed()
    const deadline = NOW + 1_202
    const reconciling = applyLedgerEvent(value.record, { type: 'alarm', now: deadline })
    const ambiguous = applyLedgerEvent(reconciling, { type: 'reconcile', now: deadline, proof: { outcome: 'ambiguous' } })
    expect(() => applyLedgerEvent(ambiguous, { type: 'reconcile', now: deadline + 59, proof: { outcome: 'ambiguous' } }))
      .toThrowError('RECOVERY_LEDGER_RECONCILIATION_NOT_DUE')
  })

  it('reconciles only definitive exact-deploy proof to completed', () => {
    const value = claimed()
    const deadline = NOW + 1_202
    const reconciling = applyLedgerEvent(value.record, { type: 'alarm', now: deadline })
    const completed = applyLedgerEvent(reconciling, { type: 'reconcile', now: deadline, proof: completedProof(reconciling) })
    expect(completed).toMatchObject({ state: 'completed', outcome: 'completed', completedAt: deadline })
  })

  it('requires authoritative terminal run, an unstarted deploy step, and deployment absence for not-deployed', () => {
    const value = claimed()
    const deadline = NOW + 1_202
    const reconciling = applyLedgerEvent(value.record, { type: 'alarm', now: deadline })
    for (const proof of [
      notDeployedProof(reconciling, { authoritativeTerminalRun: false }),
      notDeployedProof(reconciling, { pagesDeployStepStarted: true }),
      notDeployedProof(reconciling, { matchingPagesDeploymentAbsent: false }),
      { outcome: 'not-deployed', elapsedOnly: true, liveMarkerMissing: true },
    ]) {
      expect(() => applyLedgerEvent(reconciling, { type: 'reconcile', now: deadline, proof } as LedgerEvent))
        .toThrowError('RECOVERY_LEDGER_NOT_DEPLOYED_NOT_PROVEN')
    }
    const terminal = applyLedgerEvent(reconciling, { type: 'reconcile', now: deadline, proof: notDeployedProof(reconciling) })
    expect(terminal).toMatchObject({ state: 'not-deployed', outcome: 'not-deployed', completedAt: deadline })
    expect(() => applyLedgerEvent(terminal, reserveEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_REISSUE_DENIED')
    expect(() => applyLedgerEvent(terminal, claimEvent(value.control)))
      .toThrowError('RECOVERY_LEDGER_ALREADY_CLAIMED')
  })

  it('leaves terminal alarms as no-ops', () => {
    const value = claimed()
    const completed = applyLedgerEvent(value.record, { type: 'complete', now: NOW + 3, proof: completedProof(value.record) })
    expect(applyLedgerEvent(completed, { type: 'alarm', now: NOW + 99_999 })).toBe(completed)
  })

  it('still validates exact proof and monotonic time envelopes on an idempotent terminal read', () => {
    const value = claimed()
    const completed = applyLedgerEvent(value.record, {
      type: 'complete',
      now: NOW + 3,
      proof: completedProof(value.record),
    })
    expect(() => applyLedgerEvent(completed, {
      type: 'complete',
      now: NOW + 4,
      proof: { ...completedProof(completed), unexpected: true },
    } as never)).toThrowError('RECOVERY_LEDGER_COMPLETION_NOT_PROVEN')
    expect(() => applyLedgerEvent(completed, {
      type: 'complete',
      now: NOW + 2,
      proof: completedProof(completed),
    })).toThrowError('RECOVERY_LEDGER_TIME_BACKWARDS')

    const deadline = ledgerAlarmDeadline(value.record) as number
    const reconciling = applyLedgerEvent(value.record, { type: 'alarm', now: deadline })
    const notDeployed = applyLedgerEvent(reconciling, {
      type: 'reconcile',
      now: deadline,
      proof: notDeployedProof(reconciling),
    })
    expect(() => applyLedgerEvent(notDeployed, {
      type: 'reconcile',
      now: deadline + 1,
      proof: { outcome: 'ambiguous', unexpected: true },
    } as never)).toThrowError('RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
    expect(() => applyLedgerEvent(notDeployed, {
      type: 'reconcile',
      now: deadline - 1,
      proof: notDeployedProof(notDeployed),
    })).toThrowError('RECOVERY_LEDGER_TIME_BACKWARDS')
  })
})

// Compile-time exhaustiveness guard: public reducer results are always one of the
// protocol's monotonic ledger records, never an untyped response envelope.
function _assertLedgerRecord(value: RecoveryLedgerRecord): RecoveryLedgerRecord {
  return value
}
void _assertLedgerRecord
