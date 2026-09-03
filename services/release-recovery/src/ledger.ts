import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

import {
  GITHUB_REPOSITORY,
  RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  commit,
  positive,
  sha,
  snapshotRecoveryArmingTuple,
  type RecoveryArmingTuple,
} from './config.js'
import type { RecoveryAuthorizationPayload } from './crypto.js'
import type { GitHubWorkflowIdentity } from './githubOidc.js'
import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  canonicalMapJsonBytes,
  parseRecoveryCompactJws,
  parseRecoveryPayload,
  serializeExactObject,
  type JsonValue,
} from './protocol.js'

export const RECOVERY_ISSUING_TIMEOUT_SECONDS = 120 as const
export const RECOVERY_CLAIM_DEADLINE_SECONDS = 1_200 as const
export const RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS = Object.freeze([
  60,
  300,
  900,
  3_600,
] as const)

export const RECOVERY_ARMING_TUPLE_KEYS = Object.freeze([
  ...RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  'bindingPath',
  'workflowPath',
] as const)

export const RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS = Object.freeze([
  'repository',
  'repositoryId',
  'repositoryOwnerId',
  'ref',
  'workflowRef',
  'environment',
  'eventName',
  'workflowSha',
  'pagesRunId',
  'pagesRunAttempt',
  'checkRunId',
] as const)

export const RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS = Object.freeze([
  'requestId',
  'candidateCommit',
  'sourceVerifyRunId',
  'sourceVerifyRunAttempt',
  'artifactId',
] as const)

export type RecoveryLedgerState =
  | 'armed'
  | 'issuing'
  | 'issued'
  | 'claimed'
  | 'reconciliation-required'
  | 'completed'
  | 'expired-unused'
  | 'not-deployed'

export class RecoveryLedgerError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'RecoveryLedgerError'
    this.code = code
  }
}

export type LedgerControlState = Readonly<{
  enabled: boolean
  authorizationEpoch: number
  maxConsumedAuthorizationEpoch: number | null
  activeArming: RecoveryArmingTuple | null
  usedRequestIds: readonly string[]
  revision: number
}>

export type LedgerRequestLocators = Readonly<{
  requestId: string
  candidateCommit: string
  sourceVerifyRunId: string
  sourceVerifyRunAttempt: string
  artifactId: string
}>

export type LedgerStableWorkflowIdentity = Readonly<{
  repository: 'ael-dev3/Warpkeep'
  repositoryId: '1273513252'
  repositoryOwnerId: '183124839'
  ref: 'refs/heads/main'
  workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
  environment: 'github-pages'
  eventName: 'workflow_run'
  workflowSha: string
  pagesRunId: string
  pagesRunAttempt: string
  checkRunId: string
}>

export type LedgerAuthorizationSnapshot = Readonly<{
  locators: LedgerRequestLocators
  workflowIdentity: LedgerStableWorkflowIdentity
  payload: RecoveryAuthorizationPayload
  authorizationJti: string
  authorizationEpoch: number
  issuedAt: number
  notBefore: number
  expiresAt: number
  issuanceEvidenceSnapshotDigest: string
  liveInvariantDigest: string
  candidateTree: string
  artifactName: string
  githubArtifactArchiveSha256: string
  innerArtifactTarSha256: string
  contentManifestSha256: string
  deploymentAttestationSha256: string
  operation: 'github-pages-production-deploy'
  canonicalOrigin: 'https://warpkeep.com'
}>

type LedgerBase = Readonly<{
  arming: RecoveryArmingTuple
  revision: number
  lastTransitionAt: number | null
}>

export type LedgerArmedState = LedgerBase & Readonly<{
  state: 'armed'
}>

export type LedgerIssuingState = LedgerBase & Readonly<{
  state: 'issuing'
  authorization: LedgerAuthorizationSnapshot
  reservedPayload: RecoveryAuthorizationPayload
  reservedAt: number
  issuingDeadline: number
}>

export type LedgerIssuedState = LedgerBase & Readonly<{
  state: 'issued'
  authorization: LedgerAuthorizationSnapshot
  authorizationJws: string
  authorizationJwsSha256: string
}>

export type LedgerClaimSnapshot = Readonly<{
  claimSnapshotDigest: string
  claimLiveInvariantDigest: string
  claimSequence: 1
  claimedAt: number
  claimDeadline: number
}>

export type LedgerClaimedState = LedgerBase & Readonly<{
  state: 'claimed'
  authorization: LedgerAuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerClaimSnapshot
}>

export type LedgerReconciliationRequiredState = LedgerBase & Readonly<{
  state: 'reconciliation-required'
  authorization: LedgerAuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerClaimSnapshot
  reconciliationAttempts: number
  nextReconcileAt: number | null
}>

export type LedgerTerminalState = LedgerBase & Readonly<{
  state: 'completed' | 'not-deployed'
  authorization: LedgerAuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerClaimSnapshot
  outcome: 'completed' | 'not-deployed'
  completedAt: number
}>

export type LedgerExpiredUnusedState = LedgerBase & Readonly<{
  state: 'expired-unused'
  authorization: LedgerAuthorizationSnapshot
  authorizationJwsSha256: string | null
  expiredAt: number
  expirationSource: 'issuing' | 'issued'
}>

export type RecoveryLedgerRecord =
  | LedgerArmedState
  | LedgerIssuingState
  | LedgerIssuedState
  | LedgerClaimedState
  | LedgerReconciliationRequiredState
  | LedgerTerminalState
  | LedgerExpiredUnusedState

export type LedgerCompletedProof = Readonly<{
  outcome: 'completed'
  rowBindingDigest: string
  deployStepConclusion: 'success'
  matchingPagesDeployment: true
  deploymentAttestationMatches: true
}>

export type LedgerNotDeployedProof = Readonly<{
  outcome: 'not-deployed'
  rowBindingDigest: string
  authoritativeTerminalRun: true
  pagesDeployStepStarted: false
  matchingPagesDeploymentAbsent: true
}>

export type LedgerReconciliationProof =
  | LedgerCompletedProof
  | LedgerNotDeployedProof
  | Readonly<{ outcome: 'ambiguous' }>

export type LedgerEvent =
  | Readonly<{
      type: 'reserve-issue'
      control: LedgerControlState
      locators: LedgerRequestLocators
      identity: GitHubWorkflowIdentity
      payload?: RecoveryAuthorizationPayload
      now: number
    }>
  | Readonly<{
      type: 'finalize-issue'
      control: LedgerControlState
      locators: LedgerRequestLocators
      identity: GitHubWorkflowIdentity
      authorizationJws: string
      authorizationJwsSha256: string
      now: number
    }>
  | Readonly<{
      type: 'read-issued'
      control: LedgerControlState
      locators: LedgerRequestLocators
      identity: GitHubWorkflowIdentity
      now: number
    }>
  | Readonly<{
      type: 'claim'
      control: LedgerControlState
      locators: LedgerRequestLocators
      identity: GitHubWorkflowIdentity
      authorizationJws: string
      liveInvariantDigest: string
      claimSnapshotDigest: string
      now: number
    }>
  | Readonly<{
      type: 'complete'
      proof: LedgerCompletedProof
      now: number
    }>
  | Readonly<{
      type: 'alarm'
      now: number
    }>
  | Readonly<{
      type: 'reconcile'
      proof: LedgerReconciliationProof
      now: number
    }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const decoder = new TextDecoder()
const encoder = new TextEncoder()

function fail(code: string): never {
  throw new RecoveryLedgerError(code)
}

function plainDataSnapshot(
  value: unknown,
  keys: readonly string[],
  code: string,
  allowExtraKeys = false,
): Readonly<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== 'object') fail(code)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail(code)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const ownKeys = Reflect.ownKeys(descriptors)
    if (
      new Set(keys).size !== keys.length
      || ownKeys.some((key) => typeof key !== 'string')
      || (!allowExtraKeys && ownKeys.length !== keys.length)
      || keys.some((key) => !Object.hasOwn(descriptors, key))
      || (!allowExtraKeys && ownKeys.some((key) => !keys.includes(key as string)))
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

function positiveEpoch(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(code)
  return value as number
}

function unixSecond(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code)
  return value as number
}

function addSeconds(value: number, seconds: number, code: string): number {
  const result = value + seconds
  if (!Number.isSafeInteger(result)) fail(code)
  return result
}

function assertNonBackwardTime(state: RecoveryLedgerRecord, now: number): void {
  if (state.lastTransitionAt !== null && now < state.lastTransitionAt) {
    fail('RECOVERY_LEDGER_TIME_BACKWARDS')
  }
}

function sameFlatKeys(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => left[key] === right[key])
}

function sameArming(left: RecoveryArmingTuple, right: RecoveryArmingTuple): boolean {
  return sameFlatKeys(
    left as unknown as Readonly<Record<string, unknown>>,
    right as unknown as Readonly<Record<string, unknown>>,
    RECOVERY_ARMING_TUPLE_KEYS,
  )
}

function armingSnapshot(value: unknown, code: string): RecoveryArmingTuple {
  try {
    return snapshotRecoveryArmingTuple(value, code)
  } catch {
    fail(code)
  }
}

function locatorSnapshot(value: unknown, code: string): LedgerRequestLocators {
  const source = plainDataSnapshot(value, RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS, code)
  if (
    typeof source.requestId !== 'string'
    || !UUID.test(source.requestId)
    || !commit(source.candidateCommit)
    || !positive(source.sourceVerifyRunId)
    || !positive(source.sourceVerifyRunAttempt)
    || !positive(source.artifactId)
  ) fail(code)
  return Object.freeze({ ...source }) as LedgerRequestLocators
}

function stableIdentitySnapshot(value: unknown, code: string): LedgerStableWorkflowIdentity {
  const fullKeys = [...RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS, 'oidcJti'] as const
  // Only the verified identity envelope crosses this boundary. The ephemeral
  // jti is validated but deliberately omitted from the stable stored snapshot.
  const source = plainDataSnapshot(value, fullKeys, code)
  if (
    source.repository !== GITHUB_REPOSITORY
    || source.repositoryId !== '1273513252'
    || source.repositoryOwnerId !== '183124839'
    || source.ref !== 'refs/heads/main'
    || source.workflowRef !== `${GITHUB_REPOSITORY}/.github/workflows/deploy-pages.yml@refs/heads/main`
    || source.environment !== 'github-pages'
    || source.eventName !== 'workflow_run'
    || !commit(source.workflowSha)
    || !positive(source.pagesRunId)
    || !positive(source.pagesRunAttempt)
    || !positive(source.checkRunId)
    || typeof source.oidcJti !== 'string'
    || !UUID.test(source.oidcJti)
  ) fail(code)
  const stable: Record<string, unknown> = Object.create(null)
  for (const key of RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS) stable[key] = source[key]
  return Object.freeze(stable) as LedgerStableWorkflowIdentity
}

function payloadSnapshot(value: unknown, code: string): RecoveryAuthorizationPayload {
  try {
    const bytes = serializeExactObject(
      RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
      value as RecoveryAuthorizationPayload,
    )
    const parsed = parseRecoveryPayload(bytes, 'authorization')
    return Object.freeze({ ...parsed }) as RecoveryAuthorizationPayload
  } catch {
    fail(code)
  }
}

function payloadCanonical(value: RecoveryAuthorizationPayload): string {
  return decoder.decode(serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, value))
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] as number) ^ (right[index] as number)
  }
  return difference === 0
}

function rawSha256Hex(value: string): string {
  return bytesToHex(sha256(encoder.encode(value)))
}

function payloadField(
  value: RecoveryAuthorizationPayload,
  key: (typeof RECOVERY_AUTHORIZATION_PAYLOAD_KEYS)[number],
): JsonValue {
  return (value as Readonly<Record<string, JsonValue>>)[key]
}

function validatePayloadBinding(
  armed: RecoveryArmingTuple,
  locators: LedgerRequestLocators,
  identity: LedgerStableWorkflowIdentity,
  payload: RecoveryAuthorizationPayload,
  now: number,
): void {
  const sharedPairs: ReadonlyArray<readonly [string, unknown]> = [
    ['requestId', armed.requestId],
    ['authorizationEpoch', armed.authorizationEpoch],
    ['repository', armed.repository],
    ['repositoryId', armed.repositoryId],
    ['repositoryOwnerId', armed.repositoryOwnerId],
    ['ref', armed.ref],
    ['workflowRef', armed.workflowRef],
    ['environment', armed.environment],
    ['releaseVersion', armed.releaseVersion],
    ['operation', armed.operation],
    ['canonicalOrigin', armed.canonicalOrigin],
    ['authWorker', armed.authWorker],
    ['sourceClosureProfile', armed.sourceClosureProfile],
    ['sourceClosureSha256', armed.sourceClosureSha256],
    ['recoveryAuthorizationCoreSha256', armed.recoveryAuthorizationCoreSha256],
    ['predecessorCommit', armed.preparationCommit],
    ['genesis001Database', armed.genesis001Database],
    ['genesis002Database', armed.genesis002Database],
    ['ptrDatabase', armed.ptrDatabase],
  ]
  const locatorPairs: ReadonlyArray<readonly [string, unknown]> = [
    ['requestId', locators.requestId],
    ['candidateCommit', locators.candidateCommit],
    ['sourceVerifyRunId', locators.sourceVerifyRunId],
    ['sourceVerifyRunAttempt', locators.sourceVerifyRunAttempt],
    ['artifactId', locators.artifactId],
  ]
  const identityPairs: ReadonlyArray<readonly [string, unknown]> = [
    ['repository', identity.repository],
    ['repositoryId', identity.repositoryId],
    ['repositoryOwnerId', identity.repositoryOwnerId],
    ['ref', identity.ref],
    ['workflowRef', identity.workflowRef],
    ['environment', identity.environment],
    ['eventName', identity.eventName],
    ['workflowSha', identity.workflowSha],
    ['pagesRunId', identity.pagesRunId],
    ['pagesRunAttempt', identity.pagesRunAttempt],
  ]
  if (
    sharedPairs.some(([key, expected]) => payloadField(payload, key as never) !== expected)
    || locatorPairs.some(([key, expected]) => payloadField(payload, key as never) !== expected)
    || identityPairs.some(([key, expected]) => payloadField(payload, key as never) !== expected)
    || payloadField(payload, 'iat') !== now
    || payloadField(payload, 'nbf') !== now
  ) fail('RECOVERY_LEDGER_PAYLOAD_MISMATCH')
}

function authorizationSnapshot(
  locators: LedgerRequestLocators,
  identity: LedgerStableWorkflowIdentity,
  payload: RecoveryAuthorizationPayload,
): LedgerAuthorizationSnapshot {
  const authorizationJti = payloadField(payload, 'jti')
  const authorizationEpoch = payloadField(payload, 'authorizationEpoch')
  const issuedAt = payloadField(payload, 'iat')
  const notBefore = payloadField(payload, 'nbf')
  const expiresAt = payloadField(payload, 'exp')
  const issuanceEvidenceSnapshotDigest = payloadField(payload, 'issuanceEvidenceSnapshotDigest')
  const liveInvariantDigest = payloadField(payload, 'liveInvariantDigest')
  const candidateTree = payloadField(payload, 'candidateTree')
  const artifactName = payloadField(payload, 'artifactName')
  const githubArtifactArchiveSha256 = payloadField(payload, 'githubArtifactArchiveSha256')
  const innerArtifactTarSha256 = payloadField(payload, 'innerArtifactTarSha256')
  const contentManifestSha256 = payloadField(payload, 'contentManifestSha256')
  const deploymentAttestationSha256 = payloadField(payload, 'deploymentAttestationSha256')
  if (
    typeof authorizationJti !== 'string'
    || typeof authorizationEpoch !== 'number'
    || typeof issuedAt !== 'number'
    || typeof notBefore !== 'number'
    || typeof expiresAt !== 'number'
    || typeof issuanceEvidenceSnapshotDigest !== 'string'
    || typeof liveInvariantDigest !== 'string'
    || typeof candidateTree !== 'string'
    || typeof artifactName !== 'string'
    || typeof githubArtifactArchiveSha256 !== 'string'
    || typeof innerArtifactTarSha256 !== 'string'
    || typeof contentManifestSha256 !== 'string'
    || typeof deploymentAttestationSha256 !== 'string'
  ) fail('RECOVERY_LEDGER_PAYLOAD_INVALID')
  return Object.freeze({
    locators,
    workflowIdentity: identity,
    payload,
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
    operation: 'github-pages-production-deploy',
    canonicalOrigin: 'https://warpkeep.com',
  })
}

function sameLocators(left: LedgerRequestLocators, right: LedgerRequestLocators): boolean {
  return sameFlatKeys(
    left as unknown as Readonly<Record<string, unknown>>,
    right as unknown as Readonly<Record<string, unknown>>,
    RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS,
  )
}

function sameStableIdentity(
  left: LedgerStableWorkflowIdentity,
  right: LedgerStableWorkflowIdentity,
): boolean {
  return sameFlatKeys(
    left as unknown as Readonly<Record<string, unknown>>,
    right as unknown as Readonly<Record<string, unknown>>,
    RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS,
  )
}

const RECOVERY_LEDGER_CONTROL_KEYS = Object.freeze([
  'enabled',
  'authorizationEpoch',
  'maxConsumedAuthorizationEpoch',
  'activeArming',
  'usedRequestIds',
  'revision',
] as const)

function uuidArraySnapshot(value: unknown, code: string): readonly string[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(code)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length')
    if (
      lengthDescriptor === undefined
      || !Object.hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value)
      || (lengthDescriptor.value as number) < 0
    ) fail(code)
    const length = lengthDescriptor.value as number
    if (Reflect.ownKeys(descriptors).length !== length + 1) fail(code)
    const result: string[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')
        || typeof descriptor.value !== 'string'
        || !UUID.test(descriptor.value)
      ) fail(code)
      result.push(descriptor.value)
    }
    if (new Set(result).size !== result.length) fail(code)
    return Object.freeze(result)
  } catch (error) {
    if (error instanceof RecoveryLedgerError) throw error
    fail(code)
  }
}

function controlSnapshot(value: unknown, code = 'RECOVERY_LEDGER_CONTROL_INVALID'): LedgerControlState {
  const source = plainDataSnapshot(value, RECOVERY_LEDGER_CONTROL_KEYS, code)
  if (typeof source.enabled !== 'boolean') fail(code)
  const authorizationEpoch = positiveEpoch(source.authorizationEpoch, code)
  const maxConsumedAuthorizationEpoch = source.maxConsumedAuthorizationEpoch === null
    ? null
    : positiveEpoch(source.maxConsumedAuthorizationEpoch, code)
  const revision = unixSecond(source.revision, code)
  const usedRequestIds = uuidArraySnapshot(source.usedRequestIds, code)
  const activeArming = source.activeArming === null
    ? null
    : armingSnapshot(source.activeArming, code)
  if (
    (source.enabled && (
      activeArming === null
      || activeArming.authorizationEpoch !== authorizationEpoch
      || !usedRequestIds.includes(activeArming.requestId)
      || maxConsumedAuthorizationEpoch !== authorizationEpoch
    ))
    || (!source.enabled && activeArming !== null)
    || (maxConsumedAuthorizationEpoch !== null && maxConsumedAuthorizationEpoch > authorizationEpoch)
    || ((maxConsumedAuthorizationEpoch === null) !== (usedRequestIds.length === 0))
  ) fail(code)
  return Object.freeze({
    enabled: source.enabled,
    authorizationEpoch,
    maxConsumedAuthorizationEpoch,
    activeArming,
    usedRequestIds,
    revision,
  })
}

function assertAuthority(arming: RecoveryArmingTuple, controlValue: unknown): void {
  const control = controlSnapshot(controlValue)
  if (!control.enabled) fail('RECOVERY_LEDGER_CONTROL_DISABLED')
  if (control.authorizationEpoch !== arming.authorizationEpoch) {
    fail('RECOVERY_LEDGER_EPOCH_MISMATCH')
  }
  if (control.activeArming === null || !sameArming(control.activeArming, arming)) {
    fail('RECOVERY_LEDGER_ARMING_MISMATCH')
  }
}

function assertRequestMatch(
  authorization: LedgerAuthorizationSnapshot,
  locatorsValue: unknown,
  identityValue: unknown,
): void {
  let locators: LedgerRequestLocators
  let identity: LedgerStableWorkflowIdentity
  try {
    locators = locatorSnapshot(locatorsValue, 'RECOVERY_LEDGER_ISSUE_MISMATCH')
    identity = stableIdentitySnapshot(identityValue, 'RECOVERY_LEDGER_ISSUE_MISMATCH')
  } catch {
    fail('RECOVERY_LEDGER_ISSUE_MISMATCH')
  }
  if (
    !sameLocators(authorization.locators, locators)
    || !sameStableIdentity(authorization.workflowIdentity, identity)
  ) fail('RECOVERY_LEDGER_ISSUE_MISMATCH')
}

function completedProof(value: unknown): value is LedgerCompletedProof {
  try {
    const source = plainDataSnapshot(value, [
      'outcome',
      'rowBindingDigest',
      'deployStepConclusion',
      'matchingPagesDeployment',
      'deploymentAttestationMatches',
    ], 'RECOVERY_LEDGER_COMPLETION_NOT_PROVEN')
    return source.outcome === 'completed'
      && sha(source.rowBindingDigest)
      && source.deployStepConclusion === 'success'
      && source.matchingPagesDeployment === true
      && source.deploymentAttestationMatches === true
  } catch {
    return false
  }
}

function notDeployedProof(value: unknown): value is LedgerNotDeployedProof {
  try {
    const source = plainDataSnapshot(value, [
      'outcome',
      'rowBindingDigest',
      'authoritativeTerminalRun',
      'pagesDeployStepStarted',
      'matchingPagesDeploymentAbsent',
    ], 'RECOVERY_LEDGER_NOT_DEPLOYED_NOT_PROVEN')
    return source.outcome === 'not-deployed'
      && sha(source.rowBindingDigest)
      && source.authoritativeTerminalRun === true
      && source.pagesDeployStepStarted === false
      && source.matchingPagesDeploymentAbsent === true
  } catch {
    return false
  }
}

function ambiguousProof(value: unknown): boolean {
  try {
    const source = plainDataSnapshot(value, ['outcome'], 'RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
    return source.outcome === 'ambiguous'
  } catch {
    return false
  }
}

function reconciliationProofKind(
  value: unknown,
): 'completed' | 'not-deployed' | 'ambiguous' {
  if (completedProof(value)) return 'completed'
  if (notDeployedProof(value)) return 'not-deployed'
  if (ambiguousProof(value)) return 'ambiguous'
  try {
    if (plainDataSnapshot(
      value,
      ['outcome'],
      'RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID',
      true,
    ).outcome === 'not-deployed') fail('RECOVERY_LEDGER_NOT_DEPLOYED_NOT_PROVEN')
  } catch (error) {
    if (error instanceof RecoveryLedgerError && error.code === 'RECOVERY_LEDGER_NOT_DEPLOYED_NOT_PROVEN') {
      throw error
    }
  }
  fail('RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
}

type LedgerClaimBoundRecord =
  | LedgerClaimedState
  | LedgerReconciliationRequiredState
  | LedgerTerminalState

function claimBoundRecord(state: RecoveryLedgerRecord): LedgerClaimBoundRecord {
  if (
    state.state !== 'claimed'
    && state.state !== 'reconciliation-required'
    && state.state !== 'completed'
    && state.state !== 'not-deployed'
  ) fail('RECOVERY_LEDGER_ROW_BINDING_UNAVAILABLE')
  return state
}

export function ledgerRowBindingDigest(state: RecoveryLedgerRecord): string {
  const bound = claimBoundRecord(state)
  const bytes = canonicalMapJsonBytes({
    profile: 'warpkeep-release-recovery-ledger-row-binding-v1',
    arming: bound.arming,
    authorization: bound.authorization,
    authorizationJwsSha256: bound.authorizationJwsSha256,
    claim: bound.claim,
  })
  return bytesToHex(sha256(bytes))
}

function assertRowBinding(state: RecoveryLedgerRecord, digest: string): void {
  if (ledgerRowBindingDigest(state) !== digest) fail('RECOVERY_LEDGER_ROW_BINDING_MISMATCH')
}

export function createLedgerControl(input: Readonly<{ authorizationEpoch: number }>): LedgerControlState {
  const source = plainDataSnapshot(input, ['authorizationEpoch'], 'RECOVERY_LEDGER_CONTROL_INVALID')
  return Object.freeze({
    enabled: false,
    authorizationEpoch: positiveEpoch(source.authorizationEpoch, 'RECOVERY_LEDGER_CONTROL_INVALID'),
    maxConsumedAuthorizationEpoch: null,
    activeArming: null,
    usedRequestIds: Object.freeze([]),
    revision: 0,
  })
}

export function reconcileLedgerControl(
  stateValue: LedgerControlState,
  input: Readonly<{
    enabled: boolean
    authorizationEpoch: number
    arming?: RecoveryArmingTuple
  }>,
): LedgerControlState {
  const state = controlSnapshot(stateValue)
  let source: Readonly<Record<string, unknown>>
  try {
    source = plainDataSnapshot(
      input,
      ['enabled', 'authorizationEpoch'],
      'RECOVERY_LEDGER_CONTROL_INVALID',
    )
  } catch {
    source = plainDataSnapshot(
      input,
      ['enabled', 'authorizationEpoch', 'arming'],
      'RECOVERY_LEDGER_CONTROL_INVALID',
    )
  }
  if (typeof source.enabled !== 'boolean') fail('RECOVERY_LEDGER_CONTROL_INVALID')
  const epoch = positiveEpoch(source.authorizationEpoch, 'RECOVERY_LEDGER_CONTROL_INVALID')
  if (epoch < state.authorizationEpoch) fail('RECOVERY_LEDGER_EPOCH_DECREASE')
  if (epoch > state.authorizationEpoch) {
    if (source.enabled) fail('RECOVERY_LEDGER_EPOCH_ADVANCE_MUST_DISABLE')
    if (Object.hasOwn(source, 'arming')) fail('RECOVERY_LEDGER_CONTROL_INVALID')
    return Object.freeze({
      enabled: false,
      authorizationEpoch: epoch,
      maxConsumedAuthorizationEpoch: state.maxConsumedAuthorizationEpoch,
      activeArming: null,
      usedRequestIds: state.usedRequestIds,
      revision: state.revision + 1,
    })
  }

  if (!source.enabled) {
    if (Object.hasOwn(source, 'arming')) fail('RECOVERY_LEDGER_CONTROL_INVALID')
    if (!state.enabled) return stateValue
    return Object.freeze({
      enabled: false,
      authorizationEpoch: epoch,
      maxConsumedAuthorizationEpoch: state.maxConsumedAuthorizationEpoch,
      activeArming: null,
      usedRequestIds: state.usedRequestIds,
      revision: state.revision + 1,
    })
  }

  if (!Object.hasOwn(source, 'arming')) fail('RECOVERY_LEDGER_ARMING_REQUIRED')
  const arming = armingSnapshot(source.arming, 'RECOVERY_LEDGER_ARMING_INVALID')
  if (arming.authorizationEpoch !== epoch) fail('RECOVERY_LEDGER_EPOCH_MISMATCH')
  if (state.enabled) {
    if (state.activeArming !== null && sameArming(state.activeArming, arming)) return stateValue
    fail('RECOVERY_LEDGER_ARMING_CONFLICT')
  }
  if (state.usedRequestIds.includes(arming.requestId)) {
    fail('RECOVERY_LEDGER_ARMING_ALREADY_USED')
  }
  if (
    state.maxConsumedAuthorizationEpoch !== null
    && epoch <= state.maxConsumedAuthorizationEpoch
  ) fail('RECOVERY_LEDGER_EPOCH_ALREADY_CONSUMED')
  return Object.freeze({
    enabled: true,
    authorizationEpoch: epoch,
    maxConsumedAuthorizationEpoch: epoch,
    activeArming: arming,
    usedRequestIds: Object.freeze([...state.usedRequestIds, arming.requestId]),
    revision: state.revision + 1,
  })
}

export function installLedgerArming(
  existing: RecoveryLedgerRecord | undefined,
  input: Readonly<{ arming: RecoveryArmingTuple; control: LedgerControlState }>,
): LedgerArmedState {
  const source = plainDataSnapshot(
    input,
    ['arming', 'control'],
    'RECOVERY_LEDGER_INSTALL_INVALID',
  )
  let arming: RecoveryArmingTuple
  try {
    arming = armingSnapshot(
      source.arming,
      existing === undefined ? 'RECOVERY_LEDGER_ARMING_INVALID' : 'RECOVERY_LEDGER_ARMING_CONFLICT',
    )
  } catch {
    fail(existing === undefined ? 'RECOVERY_LEDGER_ARMING_INVALID' : 'RECOVERY_LEDGER_ARMING_CONFLICT')
  }
  if (existing !== undefined) {
    if (!sameArming(existing.arming, arming)) fail('RECOVERY_LEDGER_ARMING_CONFLICT')
    if (existing.state !== 'armed') fail('RECOVERY_LEDGER_ARMING_ALREADY_USED')
    assertAuthority(arming, source.control)
    return existing
  }
  assertAuthority(arming, source.control)
  return Object.freeze({ state: 'armed', arming, revision: 0, lastTransitionAt: null })
}

function reserveIssue(
  state: RecoveryLedgerRecord,
  event: Extract<LedgerEvent, { type: 'reserve-issue' }>,
): RecoveryLedgerRecord {
  if (state.state !== 'armed' && state.state !== 'issuing') {
    fail('RECOVERY_LEDGER_REISSUE_DENIED')
  }
  assertAuthority(state.arming, event.control)
  const retryCode = state.state === 'issuing'
    ? 'RECOVERY_LEDGER_ISSUE_MISMATCH'
    : 'RECOVERY_LEDGER_ISSUE_INVALID'
  const locators = locatorSnapshot(event.locators, retryCode)
  const identity = stableIdentitySnapshot(event.identity, retryCode)
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')

  if (state.state === 'issuing') {
    assertNonBackwardTime(state, now)
    if (now >= state.issuingDeadline) fail('RECOVERY_LEDGER_RESERVATION_EXPIRED')
    const retryPayload = event.payload === undefined
      ? null
      : payloadSnapshot(event.payload, 'RECOVERY_LEDGER_ISSUE_MISMATCH')
    if (
      !sameLocators(state.authorization.locators, locators)
      || !sameStableIdentity(state.authorization.workflowIdentity, identity)
      || (retryPayload !== null && payloadCanonical(state.reservedPayload) !== payloadCanonical(retryPayload))
    ) fail('RECOVERY_LEDGER_ISSUE_MISMATCH')
    return state
  }

  if (event.payload === undefined) fail('RECOVERY_LEDGER_PAYLOAD_REQUIRED')
  const payload = payloadSnapshot(event.payload, 'RECOVERY_LEDGER_PAYLOAD_INVALID')
  validatePayloadBinding(state.arming, locators, identity, payload, now)
  const authorization = authorizationSnapshot(locators, identity, payload)
  return Object.freeze({
    state: 'issuing',
    arming: state.arming,
    revision: state.revision + 1,
    lastTransitionAt: now,
    authorization,
    reservedPayload: payload,
    reservedAt: now,
    issuingDeadline: addSeconds(now, RECOVERY_ISSUING_TIMEOUT_SECONDS, 'RECOVERY_LEDGER_TIME_INVALID'),
  })
}

function finalizeIssue(
  state: RecoveryLedgerRecord,
  event: Extract<LedgerEvent, { type: 'finalize-issue' }>,
): RecoveryLedgerRecord {
  if (state.state !== 'issuing' && state.state !== 'issued') {
    fail('RECOVERY_LEDGER_REISSUE_DENIED')
  }
  assertAuthority(state.arming, event.control)
  assertRequestMatch(state.authorization, event.locators, event.identity)
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')
  assertNonBackwardTime(state, now)
  if (now >= state.authorization.expiresAt) fail('RECOVERY_LEDGER_AUTHORIZATION_EXPIRED')
  if (typeof event.authorizationJws !== 'string' || event.authorizationJws.length < 1 || event.authorizationJws.length > 16_384) {
    fail('RECOVERY_LEDGER_JWS_INVALID')
  }
  if (!sha(event.authorizationJwsSha256)) fail('RECOVERY_LEDGER_JWS_DIGEST_INVALID')
  let parsedPayload: Uint8Array
  try {
    parsedPayload = parseRecoveryCompactJws(event.authorizationJws, 'authorization').payloadBytes
  } catch {
    fail('RECOVERY_LEDGER_JWS_INVALID')
  }
  if (!sameBytes(
    parsedPayload,
    serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, state.authorization.payload),
  )) fail('RECOVERY_LEDGER_JWS_PAYLOAD_MISMATCH')
  if (rawSha256Hex(event.authorizationJws) !== event.authorizationJwsSha256) {
    fail('RECOVERY_LEDGER_JWS_DIGEST_MISMATCH')
  }

  if (state.state === 'issued') {
    if (
      state.authorizationJws !== event.authorizationJws
      || state.authorizationJwsSha256 !== event.authorizationJwsSha256
    ) fail('RECOVERY_LEDGER_ISSUE_MISMATCH')
    return state
  }
  if (now >= state.issuingDeadline) fail('RECOVERY_LEDGER_RESERVATION_EXPIRED')
  return Object.freeze({
    state: 'issued',
    arming: state.arming,
    revision: state.revision + 1,
    lastTransitionAt: now,
    authorization: state.authorization,
    authorizationJws: event.authorizationJws,
    authorizationJwsSha256: event.authorizationJwsSha256,
  })
}

function expireIssuing(state: LedgerIssuingState, now: number): LedgerExpiredUnusedState {
  return Object.freeze({
    state: 'expired-unused',
    arming: state.arming,
    revision: state.revision + 1,
    lastTransitionAt: now,
    authorization: state.authorization,
    authorizationJwsSha256: null,
    expiredAt: now,
    expirationSource: 'issuing',
  })
}

function expireIssued(state: LedgerIssuedState, now: number): LedgerExpiredUnusedState {
  return Object.freeze({
    state: 'expired-unused',
    arming: state.arming,
    revision: state.revision + 1,
    lastTransitionAt: now,
    authorization: state.authorization,
    authorizationJwsSha256: state.authorizationJwsSha256,
    expiredAt: now,
    expirationSource: 'issued',
  })
}

function readIssued(
  state: RecoveryLedgerRecord,
  event: Extract<LedgerEvent, { type: 'read-issued' }>,
): RecoveryLedgerRecord {
  if (state.state !== 'issued') {
    if (state.state === 'claimed' || state.state === 'reconciliation-required' || state.state === 'completed' || state.state === 'not-deployed') {
      fail('RECOVERY_LEDGER_ALREADY_CLAIMED')
    }
    if (state.state === 'expired-unused') fail('RECOVERY_LEDGER_AUTHORIZATION_EXPIRED')
    fail('RECOVERY_LEDGER_NOT_ISSUED')
  }
  assertAuthority(state.arming, event.control)
  assertRequestMatch(state.authorization, event.locators, event.identity)
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')
  assertNonBackwardTime(state, now)
  if (now >= state.authorization.expiresAt) return expireIssued(state, now)
  return state
}

function claim(
  state: RecoveryLedgerRecord,
  event: Extract<LedgerEvent, { type: 'claim' }>,
): RecoveryLedgerRecord {
  if (state.state === 'claimed' || state.state === 'reconciliation-required' || state.state === 'completed' || state.state === 'not-deployed') {
    fail('RECOVERY_LEDGER_ALREADY_CLAIMED')
  }
  if (state.state === 'expired-unused') fail('RECOVERY_LEDGER_AUTHORIZATION_EXPIRED')
  if (state.state !== 'issued') fail('RECOVERY_LEDGER_NOT_ISSUED')
  assertAuthority(state.arming, event.control)
  assertRequestMatch(state.authorization, event.locators, event.identity)
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')
  assertNonBackwardTime(state, now)
  if (now >= state.authorization.expiresAt) return expireIssued(state, now)
  if (event.authorizationJws !== state.authorizationJws) fail('RECOVERY_LEDGER_JWS_MISMATCH')
  if (!sha(event.liveInvariantDigest)) fail('RECOVERY_LEDGER_LIVE_INVARIANT_INVALID')
  if (event.liveInvariantDigest !== state.authorization.liveInvariantDigest) {
    fail('RECOVERY_LEDGER_LIVE_INVARIANT_CHANGED')
  }
  if (!sha(event.claimSnapshotDigest)) fail('RECOVERY_LEDGER_CLAIM_SNAPSHOT_INVALID')
  if (
    event.claimSnapshotDigest === state.authorization.issuanceEvidenceSnapshotDigest
    || event.claimSnapshotDigest === state.authorization.liveInvariantDigest
  ) {
    fail('RECOVERY_LEDGER_CLAIM_SNAPSHOT_NOT_DISTINCT')
  }
  const claimSnapshot: LedgerClaimSnapshot = Object.freeze({
    claimSnapshotDigest: event.claimSnapshotDigest,
    claimLiveInvariantDigest: event.liveInvariantDigest,
    claimSequence: 1,
    claimedAt: now,
    claimDeadline: addSeconds(now, RECOVERY_CLAIM_DEADLINE_SECONDS, 'RECOVERY_LEDGER_TIME_INVALID'),
  })
  return Object.freeze({
    state: 'claimed',
    arming: state.arming,
    revision: state.revision + 1,
    lastTransitionAt: now,
    authorization: state.authorization,
    authorizationJwsSha256: state.authorizationJwsSha256,
    claim: claimSnapshot,
  })
}

function complete(
  state: RecoveryLedgerRecord,
  event: Extract<LedgerEvent, { type: 'complete' }>,
): RecoveryLedgerRecord {
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')
  assertNonBackwardTime(state, now)
  if (!completedProof(event.proof)) fail('RECOVERY_LEDGER_COMPLETION_NOT_PROVEN')
  if (state.state !== 'claimed' && state.state !== 'completed' && state.state !== 'not-deployed') {
    fail('RECOVERY_LEDGER_COMPLETION_STATE_INVALID')
  }
  assertRowBinding(state, event.proof.rowBindingDigest)
  if (state.state === 'completed' || state.state === 'not-deployed') return state
  if (now >= state.claim.claimDeadline) fail('RECOVERY_LEDGER_CLAIM_DEADLINE_REACHED')
  return Object.freeze({
    state: 'completed',
    arming: state.arming,
    revision: state.revision + 1,
    lastTransitionAt: now,
    authorization: state.authorization,
    authorizationJwsSha256: state.authorizationJwsSha256,
    claim: state.claim,
    outcome: 'completed',
    completedAt: now,
  })
}

function alarm(state: RecoveryLedgerRecord, event: Extract<LedgerEvent, { type: 'alarm' }>): RecoveryLedgerRecord {
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')
  if (state.state === 'completed' || state.state === 'not-deployed' || state.state === 'expired-unused') return state
  assertNonBackwardTime(state, now)
  if (state.state === 'issuing') {
    if (now < state.issuingDeadline) fail('RECOVERY_LEDGER_ALARM_NOT_DUE')
    return expireIssuing(state, now)
  }
  if (state.state === 'issued') {
    if (now < state.authorization.expiresAt) fail('RECOVERY_LEDGER_ALARM_NOT_DUE')
    return expireIssued(state, now)
  }
  if (state.state === 'claimed') {
    if (now < state.claim.claimDeadline) fail('RECOVERY_LEDGER_ALARM_NOT_DUE')
    return Object.freeze({
      state: 'reconciliation-required',
      arming: state.arming,
      revision: state.revision + 1,
      lastTransitionAt: now,
      authorization: state.authorization,
      authorizationJwsSha256: state.authorizationJwsSha256,
      claim: state.claim,
      reconciliationAttempts: 0,
      nextReconcileAt: now,
    })
  }
  if (state.state === 'reconciliation-required') {
    fail('RECOVERY_LEDGER_RECONCILIATION_REQUIRED')
  }
  fail('RECOVERY_LEDGER_ALARM_NOT_SCHEDULED')
}

function reconcile(
  state: RecoveryLedgerRecord,
  event: Extract<LedgerEvent, { type: 'reconcile' }>,
): RecoveryLedgerRecord {
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')
  assertNonBackwardTime(state, now)
  const proofKind = reconciliationProofKind(event.proof)
  if (state.state === 'completed' || state.state === 'not-deployed') {
    if (proofKind === 'completed' || proofKind === 'not-deployed') {
      assertRowBinding(
        state,
        (event.proof as LedgerCompletedProof | LedgerNotDeployedProof).rowBindingDigest,
      )
    }
    return state
  }
  if (state.state !== 'reconciliation-required') fail('RECOVERY_LEDGER_RECONCILIATION_STATE_INVALID')
  if (state.nextReconcileAt === null) fail('RECOVERY_LEDGER_RECONCILIATION_EXHAUSTED')
  if (now < state.nextReconcileAt) fail('RECOVERY_LEDGER_RECONCILIATION_NOT_DUE')
  if (proofKind === 'completed') {
    if (!completedProof(event.proof)) fail('RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
    assertRowBinding(state, event.proof.rowBindingDigest)
    return Object.freeze({
      state: 'completed',
      arming: state.arming,
      revision: state.revision + 1,
      lastTransitionAt: now,
      authorization: state.authorization,
      authorizationJwsSha256: state.authorizationJwsSha256,
      claim: state.claim,
      outcome: 'completed',
      completedAt: now,
    })
  }
  if (proofKind === 'not-deployed') {
    if (!notDeployedProof(event.proof)) fail('RECOVERY_LEDGER_NOT_DEPLOYED_NOT_PROVEN')
    assertRowBinding(state, event.proof.rowBindingDigest)
    return Object.freeze({
      state: 'not-deployed',
      arming: state.arming,
      revision: state.revision + 1,
      lastTransitionAt: now,
      authorization: state.authorization,
      authorizationJwsSha256: state.authorizationJwsSha256,
      claim: state.claim,
      outcome: 'not-deployed',
      completedAt: now,
    })
  }
  const attempts = state.reconciliationAttempts + 1
  const delay = RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS[state.reconciliationAttempts]
  return Object.freeze({
    ...state,
    revision: state.revision + 1,
    lastTransitionAt: now,
    reconciliationAttempts: attempts,
    nextReconcileAt: delay === undefined
      ? null
      : addSeconds(now, delay, 'RECOVERY_LEDGER_TIME_INVALID'),
  })
}

function exactEventSnapshot(value: unknown, keys: readonly string[]): LedgerEvent {
  return Object.freeze({
    ...plainDataSnapshot(value, keys, 'RECOVERY_LEDGER_EVENT_INVALID'),
  }) as unknown as LedgerEvent
}

function ledgerEventSnapshot(value: unknown): LedgerEvent {
  const discriminator = plainDataSnapshot(
    value,
    ['type'],
    'RECOVERY_LEDGER_EVENT_INVALID',
    true,
  ).type
  switch (discriminator) {
    case 'reserve-issue': {
      try {
        const withPayload = exactEventSnapshot(value, [
          'type', 'control', 'locators', 'identity', 'payload', 'now',
        ]) as Extract<LedgerEvent, { type: 'reserve-issue' }>
        if (withPayload.payload === undefined) fail('RECOVERY_LEDGER_EVENT_INVALID')
        return withPayload
      } catch {
        return exactEventSnapshot(value, ['type', 'control', 'locators', 'identity', 'now'])
      }
    }
    case 'finalize-issue':
      return exactEventSnapshot(value, [
        'type', 'control', 'locators', 'identity', 'authorizationJws',
        'authorizationJwsSha256', 'now',
      ])
    case 'read-issued':
      return exactEventSnapshot(value, ['type', 'control', 'locators', 'identity', 'now'])
    case 'claim':
      return exactEventSnapshot(value, [
        'type', 'control', 'locators', 'identity', 'authorizationJws',
        'liveInvariantDigest', 'claimSnapshotDigest', 'now',
      ])
    case 'complete':
    case 'reconcile':
      return exactEventSnapshot(value, ['type', 'proof', 'now'])
    case 'alarm':
      return exactEventSnapshot(value, ['type', 'now'])
    default:
      fail('RECOVERY_LEDGER_EVENT_INVALID')
  }
}

export function applyLedgerEvent(state: RecoveryLedgerRecord, eventValue: LedgerEvent): RecoveryLedgerRecord {
  const event = ledgerEventSnapshot(eventValue)
  switch (event.type) {
    case 'reserve-issue': return reserveIssue(state, event)
    case 'finalize-issue': return finalizeIssue(state, event)
    case 'read-issued': return readIssued(state, event)
    case 'claim': return claim(state, event)
    case 'complete': return complete(state, event)
    case 'alarm': return alarm(state, event)
    case 'reconcile': return reconcile(state, event)
    default: fail('RECOVERY_LEDGER_EVENT_INVALID')
  }
}

export function ledgerAlarmDeadline(state: RecoveryLedgerRecord): number | null {
  if (state.state === 'issuing') return state.issuingDeadline
  if (state.state === 'issued') return state.authorization.expiresAt
  if (state.state === 'claimed') return state.claim.claimDeadline
  if (state.state === 'reconciliation-required') return state.nextReconcileAt
  return null
}

function snakeCase(key: string): string {
  return key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)
}

function armingSqlType(key: (typeof RECOVERY_ARMING_TUPLE_KEYS)[number]): 'INTEGER' | 'TEXT' {
  return key === 'authorizationEpoch' || key === 'bridgeConfigEpoch' || key === 'pagesDeploymentApproved'
    ? 'INTEGER'
    : 'TEXT'
}

const armingSqlColumns = RECOVERY_ARMING_TUPLE_KEYS
  .map((key) => `  ${snakeCase(key)} ${armingSqlType(key)} NOT NULL`)
  .join(',\n')

const controlArmingSqlColumns = RECOVERY_ARMING_TUPLE_KEYS
  .map((key) => `  active_${snakeCase(key)} ${armingSqlType(key)}`)
  .join(',\n')

const controlArmingColumnNames = RECOVERY_ARMING_TUPLE_KEYS
  .map((key) => `active_${snakeCase(key)}`)

const controlArmingNotNullSql = controlArmingColumnNames
  .map((column) => `${column} IS NOT NULL`)
  .join(' AND ')

const controlArmingNullSql = controlArmingColumnNames
  .map((column) => `${column} IS NULL`)
  .join(' AND ')

const newControlArmingNullSql = controlArmingColumnNames
  .map((column) => `NEW.${column} IS NULL`)
  .join(' AND ')

const payloadBooleanKeys = new Set<string>([
  'g001PlayerAccessEnabled',
  'g001AdmissionStateMutationsEnabled',
  'g001AccessRequestSubmissionsEnabled',
  'g002Sealed',
])

const payloadIntegerKeys = new Set<string>([
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
  ...payloadBooleanKeys,
])

const payloadSqlColumns = RECOVERY_AUTHORIZATION_PAYLOAD_KEYS
  .map((key) => {
    const column = `payload_${snakeCase(key)}`
    if (payloadBooleanKeys.has(key)) {
      return `  ${column} INTEGER NOT NULL CHECK (${column} IN (0, 1))`
    }
    return `  ${column} ${payloadIntegerKeys.has(key) ? 'INTEGER' : 'TEXT'} NOT NULL`
  })
  .join(',\n')

const locatorSqlColumnNames = [
  'locator_candidate_commit',
  'locator_source_verify_run_id',
  'locator_source_verify_run_attempt',
  'locator_artifact_id',
] as const

const workflowIdentitySqlColumnNames = RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS
  .map((key) => `workflow_identity_${snakeCase(key)}`)

const authorizationSqlColumnNames = [
  ...locatorSqlColumnNames,
  ...workflowIdentitySqlColumnNames,
  'authorization_jti',
  'issuance_evidence_snapshot_digest',
  'live_invariant_digest',
] as const

const issuingSqlColumnNames = [
  'reserved_payload_json',
  'reserved_at',
  'issuing_deadline',
] as const

const claimSqlColumnNames = [
  'claim_snapshot_digest',
  'claim_live_invariant_digest',
  'claim_sequence',
  'claimed_at',
  'claim_deadline',
] as const

const reconciliationSqlColumnNames = [
  'reconciliation_attempts',
  'next_reconcile_at',
] as const

const terminalSqlColumnNames = ['completed_at', 'terminal_outcome'] as const
const expirationSqlColumnNames = ['expired_at', 'expiration_source'] as const

const armedCoreNullableColumnNames = [
  ...authorizationSqlColumnNames,
  ...issuingSqlColumnNames,
  'authorization_jws',
  'authorization_jws_sha256',
  ...claimSqlColumnNames,
  ...reconciliationSqlColumnNames,
  ...terminalSqlColumnNames,
  ...expirationSqlColumnNames,
] as const

const newArmedCoreNullSql = armedCoreNullableColumnNames
  .map((column) => `NEW.${column} IS NULL`)
  .join(' AND ')

function sqlColumnsAreNull(columns: readonly string[]): string {
  return columns.map((column) => `${column} IS NULL`).join(' AND ')
}

function sqlColumnsAreNotNull(columns: readonly string[]): string {
  return columns.map((column) => `${column} IS NOT NULL`).join(' AND ')
}

const authorizationNullSql = sqlColumnsAreNull(authorizationSqlColumnNames)
const authorizationNotNullSql = sqlColumnsAreNotNull(authorizationSqlColumnNames)
const issuingNullSql = sqlColumnsAreNull(issuingSqlColumnNames)
const issuingNotNullSql = sqlColumnsAreNotNull(issuingSqlColumnNames)
const claimNullSql = sqlColumnsAreNull(claimSqlColumnNames)
const claimNotNullSql = sqlColumnsAreNotNull(claimSqlColumnNames)
const reconciliationNullSql = sqlColumnsAreNull(reconciliationSqlColumnNames)
const terminalNullSql = sqlColumnsAreNull(terminalSqlColumnNames)
const expirationNullSql = sqlColumnsAreNull(expirationSqlColumnNames)

function sqlQualified(prefix: string, column: string): string {
  return `${prefix}${column}`
}

function canonicalPayloadSqlExpression(prefix: string): string {
  const parts = RECOVERY_AUTHORIZATION_PAYLOAD_KEYS.map((key, index) => {
    const column = sqlQualified(prefix, `payload_${snakeCase(key)}`)
    const label = `${index === 0 ? '{' : ','}\"${key}\":`
    let value: string
    if (payloadBooleanKeys.has(key)) {
      value = `(CASE ${column} WHEN 1 THEN 'true' WHEN 0 THEN 'false' ELSE NULL END)`
    } else if (payloadIntegerKeys.has(key)) {
      value = `CAST(${column} AS TEXT)`
    } else {
      value = `json_quote(${column})`
    }
    return `'${label}' || ${value}`
  })
  return `${parts.join(" || ")} || '}'`
}

const payloadArmingBindingSql = [
  ['payload_request_id', 'request_id'],
  ['payload_authorization_epoch', 'authorization_epoch'],
  ['payload_profile', 'recovery_authorization_profile'],
  ['payload_iss', 'issuer'],
  ['payload_kid', 'recovery_key_id'],
  ['payload_repository', 'repository'],
  ['payload_repository_id', 'repository_id'],
  ['payload_repository_owner_id', 'repository_owner_id'],
  ['payload_ref', 'ref'],
  ['payload_workflow_ref', 'workflow_ref'],
  ['payload_environment', 'environment'],
  ['payload_release_version', 'release_version'],
  ['payload_operation', 'operation'],
  ['payload_canonical_origin', 'canonical_origin'],
  ['payload_auth_worker', 'auth_worker'],
  ['payload_source_closure_profile', 'source_closure_profile'],
  ['payload_source_closure_sha256', 'source_closure_sha256'],
  ['payload_recovery_authorization_core_sha256', 'recovery_authorization_core_sha256'],
  ['payload_predecessor_commit', 'preparation_commit'],
  ['payload_genesis001_database', 'genesis001_database'],
  ['payload_genesis002_database', 'genesis002_database'],
  ['payload_ptr_database', 'ptr_database'],
] as const

const payloadArmingBindingPredicate = payloadArmingBindingSql
  .map(([payloadColumn, armingColumn]) => `NEW.${payloadColumn} = a.${armingColumn}`)
  .join(' AND ')

const corePayloadBindingSql = [
  ['request_id', 'payload_request_id'],
  ['locator_candidate_commit', 'payload_candidate_commit'],
  ['locator_source_verify_run_id', 'payload_source_verify_run_id'],
  ['locator_source_verify_run_attempt', 'payload_source_verify_run_attempt'],
  ['locator_artifact_id', 'payload_artifact_id'],
  ['workflow_identity_repository', 'payload_repository'],
  ['workflow_identity_repository_id', 'payload_repository_id'],
  ['workflow_identity_repository_owner_id', 'payload_repository_owner_id'],
  ['workflow_identity_ref', 'payload_ref'],
  ['workflow_identity_workflow_ref', 'payload_workflow_ref'],
  ['workflow_identity_environment', 'payload_environment'],
  ['workflow_identity_event_name', 'payload_event_name'],
  ['workflow_identity_workflow_sha', 'payload_workflow_sha'],
  ['workflow_identity_pages_run_id', 'payload_pages_run_id'],
  ['workflow_identity_pages_run_attempt', 'payload_pages_run_attempt'],
  ['authorization_jti', 'payload_jti'],
  ['issuance_evidence_snapshot_digest', 'payload_issuance_evidence_snapshot_digest'],
  ['live_invariant_digest', 'payload_live_invariant_digest'],
] as const

const corePayloadBindingPredicate = corePayloadBindingSql
  .map(([coreColumn, payloadColumn]) => `NEW.${coreColumn} = p.${payloadColumn}`)
  .join(' AND ')

const immutableCoreColumnNames = [
  'request_id',
  ...authorizationSqlColumnNames,
] as const

const immutableCoreUpdatePredicate = immutableCoreColumnNames
  .map((column) => `OLD.${column} IS NOT NEW.${column}`)
  .join(' OR ')

const claimDigestBindingSql = [
  'claim_live_invariant_digest = live_invariant_digest',
  'claim_snapshot_digest <> issuance_evidence_snapshot_digest',
  'claim_snapshot_digest <> live_invariant_digest',
].join(' AND ')

const reconciliationScheduleSql = [
  '(reconciliation_attempts = 0 AND next_reconcile_at = last_transition_at)',
  `(reconciliation_attempts = 1 AND next_reconcile_at = last_transition_at + ${RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS[0]})`,
  `(reconciliation_attempts = 2 AND next_reconcile_at = last_transition_at + ${RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS[1]})`,
  `(reconciliation_attempts = 3 AND next_reconcile_at = last_transition_at + ${RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS[2]})`,
  `(reconciliation_attempts = 4 AND next_reconcile_at = last_transition_at + ${RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS[3]})`,
  '(reconciliation_attempts = 5 AND next_reconcile_at IS NULL)',
].join(' OR ')

const claimSqlValuesUnchanged = claimSqlColumnNames
  .map((column) => `NEW.${column} IS OLD.${column}`)
  .join(' AND ')

const authorizationDigestUnchanged = 'NEW.authorization_jws_sha256 IS OLD.authorization_jws_sha256'

const legalCoreTransitionSql = [
  "(OLD.state = 'armed' AND NEW.state = 'issuing')",
  "(OLD.state = 'issuing' AND NEW.state = 'issued' AND NEW.last_transition_at >= OLD.last_transition_at AND NEW.last_transition_at < OLD.issuing_deadline)",
  "(OLD.state = 'issuing' AND NEW.state = 'expired-unused' AND NEW.last_transition_at >= OLD.issuing_deadline)",
  `(OLD.state = 'issued' AND NEW.state = 'claimed' AND NEW.last_transition_at >= OLD.last_transition_at AND ${authorizationDigestUnchanged})`,
  `(OLD.state = 'issued' AND NEW.state = 'expired-unused' AND NEW.last_transition_at >= OLD.last_transition_at AND ${authorizationDigestUnchanged})`,
  `(OLD.state = 'claimed' AND NEW.state = 'reconciliation-required' AND NEW.last_transition_at >= OLD.claim_deadline AND NEW.reconciliation_attempts = 0 AND ${authorizationDigestUnchanged} AND ${claimSqlValuesUnchanged})`,
  `(OLD.state = 'claimed' AND NEW.state = 'completed' AND NEW.last_transition_at >= OLD.last_transition_at AND NEW.last_transition_at < OLD.claim_deadline AND ${authorizationDigestUnchanged} AND ${claimSqlValuesUnchanged})`,
  `(OLD.state = 'reconciliation-required' AND NEW.state = 'reconciliation-required' AND OLD.next_reconcile_at IS NOT NULL AND NEW.last_transition_at >= OLD.next_reconcile_at AND NEW.reconciliation_attempts = OLD.reconciliation_attempts + 1 AND ${authorizationDigestUnchanged} AND ${claimSqlValuesUnchanged})`,
  `(OLD.state = 'reconciliation-required' AND NEW.state IN ('completed', 'not-deployed') AND OLD.next_reconcile_at IS NOT NULL AND NEW.last_transition_at >= OLD.next_reconcile_at AND ${authorizationDigestUnchanged} AND ${claimSqlValuesUnchanged})`,
].join(' OR ')

const corePayloadChronologyPredicate = [
  "(NEW.state = 'issuing' AND NEW.reserved_at = p.payload_iat)",
  `(NEW.state = 'issued' AND NEW.last_transition_at >= p.payload_iat AND NEW.last_transition_at < p.payload_iat + ${RECOVERY_ISSUING_TIMEOUT_SECONDS} AND NEW.last_transition_at < p.payload_exp)`,
  "(NEW.state IN ('claimed', 'reconciliation-required', 'completed', 'not-deployed') AND NEW.claimed_at >= p.payload_iat AND NEW.claimed_at < p.payload_exp)",
  "(NEW.state = 'expired-unused' AND ((NEW.expiration_source = 'issuing' AND NEW.expired_at >= p.payload_iat + 120) OR (NEW.expiration_source = 'issued' AND NEW.expired_at >= p.payload_exp)))",
].join(' OR ')

const canonicalReservedPayloadSql = canonicalPayloadSqlExpression('p.')

/**
 * Schema consumed by the Task 5 Durable Object adapter. Arming and finalized
 * authorization fields are individual columns; only the transient unsigned
 * payload has a canonical JSON column while the row is `issuing`.
 */
export const RECOVERY_LEDGER_SQL_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recovery_control (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  authorization_epoch INTEGER NOT NULL CHECK (authorization_epoch > 0),
  max_consumed_authorization_epoch INTEGER CHECK (max_consumed_authorization_epoch IS NULL OR (max_consumed_authorization_epoch > 0 AND max_consumed_authorization_epoch <= authorization_epoch)),
${controlArmingSqlColumns},
  revision INTEGER NOT NULL CHECK (revision >= 0),
  CHECK (
    (enabled = 0 AND ${controlArmingNullSql})
    OR (enabled = 1 AND ${controlArmingNotNullSql} AND active_authorization_epoch = authorization_epoch AND max_consumed_authorization_epoch = authorization_epoch)
  )
);

CREATE TABLE IF NOT EXISTS recovery_used_arming (
  request_id TEXT PRIMARY KEY,
  authorization_epoch INTEGER NOT NULL CHECK (authorization_epoch > 0)
);

CREATE TRIGGER IF NOT EXISTS recovery_control_validate_insert
BEFORE INSERT ON recovery_control
BEGIN
  SELECT CASE WHEN NOT (
    NEW.enabled = 0
    AND NEW.revision = 0
    AND NEW.max_consumed_authorization_epoch IS NULL
    AND ${newControlArmingNullSql}
    AND NOT EXISTS (SELECT 1 FROM recovery_used_arming)
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_CONTROL_INITIAL_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS recovery_control_validate_update
BEFORE UPDATE ON recovery_control
BEGIN
  SELECT CASE WHEN NOT (
    (NEW.max_consumed_authorization_epoch IS NULL AND NOT EXISTS (
      SELECT 1 FROM recovery_used_arming
    ))
    OR (
      NEW.max_consumed_authorization_epoch IS NOT NULL
      AND NEW.max_consumed_authorization_epoch = (
        SELECT MAX(authorization_epoch) FROM recovery_used_arming
      )
    )
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_CONTROL_WATERMARK_MISMATCH') END;
  SELECT CASE WHEN NEW.enabled = 1 AND NOT EXISTS (
    SELECT 1 FROM recovery_used_arming
    WHERE request_id = NEW.active_request_id
      AND authorization_epoch = NEW.active_authorization_epoch
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_CONTROL_ARMING_NOT_CONSUMED') END;
END;

CREATE TRIGGER IF NOT EXISTS recovery_control_transition_guard
BEFORE UPDATE ON recovery_control
WHEN NOT (
  NEW.revision = OLD.revision + 1
  AND NEW.authorization_epoch >= OLD.authorization_epoch
  AND (
    (
      OLD.enabled = 0
      AND NEW.enabled = 1
      AND NEW.authorization_epoch = OLD.authorization_epoch
      AND NEW.max_consumed_authorization_epoch = NEW.authorization_epoch
      AND (
        OLD.max_consumed_authorization_epoch IS NULL
        OR NEW.authorization_epoch > OLD.max_consumed_authorization_epoch
      )
    )
    OR (
      OLD.enabled = 1
      AND NEW.enabled = 0
      AND NEW.max_consumed_authorization_epoch IS OLD.max_consumed_authorization_epoch
    )
    OR (
      OLD.enabled = 0
      AND NEW.enabled = 0
      AND NEW.authorization_epoch > OLD.authorization_epoch
      AND NEW.max_consumed_authorization_epoch IS OLD.max_consumed_authorization_epoch
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_CONTROL_TRANSITION_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS recovery_control_immutable_delete
BEFORE DELETE ON recovery_control
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_CONTROL_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_used_arming_monotonic_insert
BEFORE INSERT ON recovery_used_arming
WHEN EXISTS (
  SELECT 1 FROM recovery_used_arming
  WHERE authorization_epoch >= NEW.authorization_epoch
)
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_EPOCH_ALREADY_CONSUMED');
END;

CREATE TRIGGER IF NOT EXISTS recovery_used_arming_validate_insert
BEFORE INSERT ON recovery_used_arming
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM recovery_control AS c
    WHERE c.singleton_key = 1
      AND c.enabled = 0
      AND c.authorization_epoch = NEW.authorization_epoch
      AND (
        c.max_consumed_authorization_epoch IS NULL
        OR NEW.authorization_epoch > c.max_consumed_authorization_epoch
      )
      AND ${controlArmingColumnNames.map((column) => `c.${column} IS NULL`).join(' AND ')}
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_USED_ARMING_NOT_STAGED') END;
END;

CREATE TRIGGER IF NOT EXISTS recovery_used_arming_immutable_update
BEFORE UPDATE ON recovery_used_arming
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_USED_ARMING_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_used_arming_immutable_delete
BEFORE DELETE ON recovery_used_arming
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_USED_ARMING_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_authorization_arming (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
${armingSqlColumns},
  UNIQUE (request_id)
);

CREATE TRIGGER IF NOT EXISTS recovery_authorization_arming_immutable_update
BEFORE UPDATE ON recovery_authorization_arming
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_ARMING_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_authorization_arming_immutable_delete
BEFORE DELETE ON recovery_authorization_arming
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_ARMING_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_authorization_payload (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
${payloadSqlColumns},
  UNIQUE (payload_request_id),
  FOREIGN KEY (payload_request_id) REFERENCES recovery_authorization_arming(request_id) ON DELETE RESTRICT,
  CHECK (payload_candidate_commit = payload_workflow_sha),
  CHECK (payload_nbf = payload_iat AND payload_exp > payload_iat)
);

CREATE TRIGGER IF NOT EXISTS recovery_authorization_payload_immutable_update
BEFORE UPDATE ON recovery_authorization_payload
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_PAYLOAD_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_authorization_payload_immutable_delete
BEFORE DELETE ON recovery_authorization_payload
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_PAYLOAD_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS recovery_authorization (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  request_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('armed', 'issuing', 'issued', 'claimed', 'reconciliation-required', 'completed', 'expired-unused', 'not-deployed')),
  locator_candidate_commit TEXT,
  locator_source_verify_run_id TEXT,
  locator_source_verify_run_attempt TEXT,
  locator_artifact_id TEXT,
  workflow_identity_repository TEXT,
  workflow_identity_repository_id TEXT,
  workflow_identity_repository_owner_id TEXT,
  workflow_identity_ref TEXT,
  workflow_identity_workflow_ref TEXT,
  workflow_identity_environment TEXT,
  workflow_identity_event_name TEXT,
  workflow_identity_workflow_sha TEXT,
  workflow_identity_pages_run_id TEXT,
  workflow_identity_pages_run_attempt TEXT,
  workflow_identity_check_run_id TEXT,
  authorization_jti TEXT,
  authorization_jws TEXT,
  authorization_jws_sha256 TEXT,
  issuance_evidence_snapshot_digest TEXT,
  live_invariant_digest TEXT,
  reserved_payload_json TEXT,
  reserved_at INTEGER,
  issuing_deadline INTEGER,
  last_transition_at INTEGER,
  claim_snapshot_digest TEXT,
  claim_live_invariant_digest TEXT,
  claim_sequence INTEGER,
  claimed_at INTEGER,
  claim_deadline INTEGER,
  reconciliation_attempts INTEGER,
  next_reconcile_at INTEGER,
  completed_at INTEGER,
  terminal_outcome TEXT CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('completed', 'not-deployed')),
  expired_at INTEGER,
  expiration_source TEXT CHECK (expiration_source IS NULL OR expiration_source IN ('issuing', 'issued')),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  FOREIGN KEY (request_id) REFERENCES recovery_authorization_arming(request_id) ON DELETE RESTRICT,
  CHECK (
    (state = 'armed' AND last_transition_at IS NULL AND ${authorizationNullSql} AND ${issuingNullSql} AND authorization_jws IS NULL AND authorization_jws_sha256 IS NULL AND ${claimNullSql} AND ${reconciliationNullSql} AND ${terminalNullSql} AND ${expirationNullSql})
    OR (state = 'issuing' AND last_transition_at = reserved_at AND ${authorizationNotNullSql} AND ${issuingNotNullSql} AND issuing_deadline = reserved_at + ${RECOVERY_ISSUING_TIMEOUT_SECONDS} AND authorization_jws IS NULL AND authorization_jws_sha256 IS NULL AND ${claimNullSql} AND ${reconciliationNullSql} AND ${terminalNullSql} AND ${expirationNullSql})
    OR (state = 'issued' AND last_transition_at IS NOT NULL AND ${authorizationNotNullSql} AND ${issuingNullSql} AND authorization_jws IS NOT NULL AND authorization_jws_sha256 IS NOT NULL AND ${claimNullSql} AND ${reconciliationNullSql} AND ${terminalNullSql} AND ${expirationNullSql})
    OR (state = 'claimed' AND last_transition_at = claimed_at AND ${authorizationNotNullSql} AND ${issuingNullSql} AND authorization_jws IS NULL AND authorization_jws_sha256 IS NOT NULL AND ${claimNotNullSql} AND ${claimDigestBindingSql} AND claim_sequence = 1 AND claim_deadline = claimed_at + ${RECOVERY_CLAIM_DEADLINE_SECONDS} AND ${reconciliationNullSql} AND ${terminalNullSql} AND ${expirationNullSql})
    OR (state = 'reconciliation-required' AND last_transition_at >= claim_deadline AND ${authorizationNotNullSql} AND ${issuingNullSql} AND authorization_jws IS NULL AND authorization_jws_sha256 IS NOT NULL AND ${claimNotNullSql} AND ${claimDigestBindingSql} AND claim_sequence = 1 AND claim_deadline = claimed_at + ${RECOVERY_CLAIM_DEADLINE_SECONDS} AND (${reconciliationScheduleSql}) AND ${terminalNullSql} AND ${expirationNullSql})
    OR (state = 'completed' AND last_transition_at = completed_at AND completed_at >= claimed_at AND ${authorizationNotNullSql} AND ${issuingNullSql} AND authorization_jws IS NULL AND authorization_jws_sha256 IS NOT NULL AND ${claimNotNullSql} AND ${claimDigestBindingSql} AND claim_sequence = 1 AND claim_deadline = claimed_at + ${RECOVERY_CLAIM_DEADLINE_SECONDS} AND ${reconciliationNullSql} AND completed_at IS NOT NULL AND terminal_outcome = 'completed' AND ${expirationNullSql})
    OR (state = 'not-deployed' AND last_transition_at = completed_at AND completed_at >= claimed_at AND ${authorizationNotNullSql} AND ${issuingNullSql} AND authorization_jws IS NULL AND authorization_jws_sha256 IS NOT NULL AND ${claimNotNullSql} AND ${claimDigestBindingSql} AND claim_sequence = 1 AND claim_deadline = claimed_at + ${RECOVERY_CLAIM_DEADLINE_SECONDS} AND ${reconciliationNullSql} AND completed_at IS NOT NULL AND terminal_outcome = 'not-deployed' AND ${expirationNullSql})
    OR (state = 'expired-unused' AND last_transition_at = expired_at AND ${authorizationNotNullSql} AND ${issuingNullSql} AND authorization_jws IS NULL AND ${claimNullSql} AND ${reconciliationNullSql} AND ${terminalNullSql} AND expired_at IS NOT NULL AND expiration_source IS NOT NULL AND ((expiration_source = 'issuing' AND authorization_jws_sha256 IS NULL) OR (expiration_source = 'issued' AND authorization_jws_sha256 IS NOT NULL)))
  )
);

CREATE TRIGGER IF NOT EXISTS recovery_authorization_payload_validate_insert
BEFORE INSERT ON recovery_authorization_payload
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM recovery_authorization_arming AS a
    WHERE a.singleton_key = 1 AND ${payloadArmingBindingPredicate}
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_PAYLOAD_ARMING_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM recovery_authorization AS r
    WHERE r.singleton_key = 1
      AND r.state = 'armed'
      AND r.revision = 0
      AND r.request_id = NEW.payload_request_id
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_PAYLOAD_NOT_STAGED') END;
END;

CREATE TRIGGER IF NOT EXISTS recovery_authorization_validate_insert
BEFORE INSERT ON recovery_authorization
BEGIN
  SELECT CASE WHEN NOT (
    NEW.state = 'armed'
    AND NEW.revision = 0
    AND NEW.last_transition_at IS NULL
    AND ${newArmedCoreNullSql}
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_AUTHORIZATION_INITIAL_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM recovery_authorization_arming AS a
    WHERE a.singleton_key = 1 AND a.request_id = NEW.request_id
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_ARMING_MISSING') END;
END;

CREATE TRIGGER IF NOT EXISTS recovery_authorization_validate_update
BEFORE UPDATE ON recovery_authorization
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM recovery_authorization_arming AS a
    WHERE a.singleton_key = 1 AND a.request_id = NEW.request_id
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_ARMING_MISSING') END;
  SELECT CASE WHEN NEW.state <> 'armed' AND NOT EXISTS (
    SELECT 1 FROM recovery_authorization_payload AS p
    WHERE p.singleton_key = 1 AND ${corePayloadBindingPredicate}
      AND (${corePayloadChronologyPredicate})
      AND (NEW.state <> 'issuing' OR NEW.reserved_payload_json = ${canonicalReservedPayloadSql})
  ) THEN RAISE(ABORT, 'RECOVERY_LEDGER_SQL_PAYLOAD_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS recovery_authorization_core_immutable_update
BEFORE UPDATE ON recovery_authorization
WHEN OLD.state <> 'armed' AND (${immutableCoreUpdatePredicate})
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_AUTHORIZATION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS recovery_authorization_transition_guard
BEFORE UPDATE ON recovery_authorization
WHEN NOT (
  NEW.revision = OLD.revision + 1
  AND (${legalCoreTransitionSql})
)
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_TRANSITION_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS recovery_authorization_immutable_delete
BEFORE DELETE ON recovery_authorization
BEGIN
  SELECT RAISE(ABORT, 'RECOVERY_LEDGER_SQL_AUTHORIZATION_IMMUTABLE');
END;
`.trimStart().replace(/\r\n?/gu, '\n')
