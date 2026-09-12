import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

import {
  GITHUB_REPOSITORY,
  RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  recoveryRealmBindingProjectionKeys,
  commit,
  positive,
  sha,
  snapshotRecoveryArmingTuple,
  type RecoveryArmingTuple,
} from './config.js'
import type { RecoveryAuthorizationPayload } from './crypto.js'
import {
  githubEvidenceMetadataSha256,
  snapshotGitHubEvidenceMetadata,
  type GitHubEvidenceMetadata,
} from './githubEvidenceMetadata.js'
import type { GitHubWorkflowIdentity } from './githubOidc.js'
import {
  RECOVERY_AUTHORIZATION_PAYLOAD_KEYS,
  canonicalMapJsonBytes,
  parseRecoveryCompactJws,
  parseRecoveryPayload,
  serializeExactObject,
  type JsonValue,
} from './protocol.js'

export const RECOVERY_ISSUING_TIMEOUT_SECONDS_V2 = 120 as const
export const RECOVERY_CLAIM_DEADLINE_SECONDS_V2 = 1_200 as const
export const RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS_V2 = Object.freeze([
  60,
  300,
  900,
  3_600,
] as const)

export const RECOVERY_ARMING_TUPLE_KEYS_V2 = Object.freeze([
  ...RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  'bindingPath',
  'workflowPath',
] as const)

export const RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS_V2 = Object.freeze([
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

export const RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS_V2 = Object.freeze([
  'requestId',
  'candidateCommit',
  'sourceVerifyRunId',
  'sourceVerifyRunAttempt',
  'artifactId',
] as const)

export type RecoveryLedgerStateV2 =
  | 'armed'
  | 'issuing'
  | 'issued'
  | 'claimed'
  | 'reconciliation-required'
  | 'completed'
  | 'expired-unused'
  | 'not-deployed'

export class RecoveryLedgerV2Error extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'RecoveryLedgerV2Error'
    this.code = code
  }
}

export type LedgerV2ControlState = Readonly<{
  enabled: boolean
  authorizationEpoch: number
  maxConsumedAuthorizationEpoch: number | null
  activeArming: RecoveryArmingTuple | null
  usedRequestIds: readonly string[]
  revision: number
}>

export type LedgerV2RequestLocators = Readonly<{
  requestId: string
  candidateCommit: string
  sourceVerifyRunId: string
  sourceVerifyRunAttempt: string
  artifactId: string
}>

export type LedgerV2StableWorkflowIdentity = Readonly<{
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

export type LedgerV2AuthorizationSnapshot = Readonly<{
  locators: LedgerV2RequestLocators
  workflowIdentity: LedgerV2StableWorkflowIdentity
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
  githubMetadata: GitHubEvidenceMetadata
  githubMetadataSha256: string
}>

type LedgerV2Base = Readonly<{
  arming: RecoveryArmingTuple
  revision: number
  lastTransitionAt: number | null
}>

export type LedgerV2ArmedState = LedgerV2Base & Readonly<{
  state: 'armed'
}>

export type LedgerV2IssuingState = LedgerV2Base & Readonly<{
  state: 'issuing'
  authorization: LedgerV2AuthorizationSnapshot
  reservedPayload: RecoveryAuthorizationPayload
  reservedAt: number
  issuingDeadline: number
}>

export type LedgerV2IssuedState = LedgerV2Base & Readonly<{
  state: 'issued'
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJws: string
  authorizationJwsSha256: string
}>

export type LedgerV2ClaimSnapshot = Readonly<{
  claimSnapshotDigest: string
  claimLiveInvariantDigest: string
  claimSequence: 1
  claimedAt: number
  claimDeadline: number
}>

export type LedgerV2ClaimedState = LedgerV2Base & Readonly<{
  state: 'claimed'
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerV2ClaimSnapshot
}>

export type LedgerV2ReconciliationRequiredState = LedgerV2Base & Readonly<{
  state: 'reconciliation-required'
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerV2ClaimSnapshot
  reconciliationAttempts: number
  nextReconcileAt: number | null
}>

export type LedgerV2TerminalState = LedgerV2Base & Readonly<{
  state: 'completed' | 'not-deployed'
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerV2ClaimSnapshot
  outcome: 'completed' | 'not-deployed'
  completedAt: number
}>

export type LedgerV2ExpiredUnusedState = LedgerV2Base & Readonly<{
  state: 'expired-unused'
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJwsSha256: string | null
  expiredAt: number
  expirationSource: 'issuing' | 'issued'
}>

export type RecoveryLedgerRecordV2 =
  | LedgerV2ArmedState
  | LedgerV2IssuingState
  | LedgerV2IssuedState
  | LedgerV2ClaimedState
  | LedgerV2ReconciliationRequiredState
  | LedgerV2TerminalState
  | LedgerV2ExpiredUnusedState

export type LedgerV2CompletedProof = Readonly<{
  outcome: 'completed'
  rowBindingDigest: string
  deployStepConclusion: 'success'
  matchingPagesDeployment: true
  deploymentAttestationMatches: true
}>

export type LedgerV2NotDeployedProof = Readonly<{
  outcome: 'not-deployed'
  rowBindingDigest: string
  authoritativeTerminalRun: true
  pagesDeployStepStarted: false
  matchingPagesDeploymentAbsent: true
}>

export type LedgerV2ReconciliationProof =
  | LedgerV2CompletedProof
  | LedgerV2NotDeployedProof
  | Readonly<{ outcome: 'ambiguous' }>

export type LedgerV2Event =
  | Readonly<{
      type: 'reserve-issue'
      control: LedgerV2ControlState
      locators: LedgerV2RequestLocators
      identity: GitHubWorkflowIdentity
      payload?: RecoveryAuthorizationPayload
      githubMetadata: GitHubEvidenceMetadata
      githubMetadataSha256: string
      now: number
    }>
  | Readonly<{
      type: 'finalize-issue'
      control: LedgerV2ControlState
      locators: LedgerV2RequestLocators
      identity: GitHubWorkflowIdentity
      authorizationJws: string
      authorizationJwsSha256: string
      now: number
    }>
  | Readonly<{
      type: 'read-issued'
      control: LedgerV2ControlState
      locators: LedgerV2RequestLocators
      identity: GitHubWorkflowIdentity
      now: number
    }>
  | Readonly<{
      type: 'claim'
      control: LedgerV2ControlState
      locators: LedgerV2RequestLocators
      identity: GitHubWorkflowIdentity
      authorizationJws: string
      liveInvariantDigest: string
      claimSnapshotDigest: string
      now: number
    }>
  | Readonly<{
      type: 'complete'
      proof: LedgerV2CompletedProof
      now: number
    }>
  | Readonly<{
      type: 'alarm'
      now: number
    }>
  | Readonly<{
      type: 'reconcile'
      proof: LedgerV2ReconciliationProof
      now: number
    }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const decoder = new TextDecoder()
const encoder = new TextEncoder()

function fail(code: string): never {
  throw new RecoveryLedgerV2Error(code)
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
      || keys.some((key, index) => ownKeys[index] !== key)
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
    if (error instanceof RecoveryLedgerV2Error) throw error
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

function assertNonBackwardTime(state: RecoveryLedgerRecordV2, now: number): void {
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
  const keys = [...recoveryRealmBindingProjectionKeys(left), 'bindingPath', 'workflowPath']
  const rightKeys = [...recoveryRealmBindingProjectionKeys(right), 'bindingPath', 'workflowPath']
  return keys.length === rightKeys.length && keys.every((key, index) => key === rightKeys[index]) && sameFlatKeys(
    left as unknown as Readonly<Record<string, unknown>>,
    right as unknown as Readonly<Record<string, unknown>>,
    keys,
  )
}

function armingSnapshot(value: unknown, code: string): RecoveryArmingTuple {
  try {
    return snapshotRecoveryArmingTuple(value, code)
  } catch {
    fail(code)
  }
}

function locatorSnapshot(value: unknown, code: string): LedgerV2RequestLocators {
  const source = plainDataSnapshot(value, RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS_V2, code)
  if (
    typeof source.requestId !== 'string'
    || !UUID.test(source.requestId)
    || !commit(source.candidateCommit)
    || !positive(source.sourceVerifyRunId)
    || !positive(source.sourceVerifyRunAttempt)
    || !positive(source.artifactId)
  ) fail(code)
  return Object.freeze({ ...source }) as LedgerV2RequestLocators
}

function stableIdentitySnapshot(value: unknown, code: string): LedgerV2StableWorkflowIdentity {
  const fullKeys = [...RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS_V2, 'oidcJti'] as const
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
  for (const key of RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS_V2) stable[key] = source[key]
  return Object.freeze(stable) as LedgerV2StableWorkflowIdentity
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
  locators: LedgerV2RequestLocators,
  identity: LedgerV2StableWorkflowIdentity,
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

async function githubMetadataSnapshot(
  value: unknown,
  suppliedSha256: unknown,
): Promise<GitHubEvidenceMetadata> {
  try {
    const metadata = snapshotGitHubEvidenceMetadata(value)
    if (
      !sha(suppliedSha256)
      || await githubEvidenceMetadataSha256(metadata) !== suppliedSha256
    ) fail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    return metadata
  } catch {
    fail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

function validateGitHubMetadataBinding(
  armed: RecoveryArmingTuple,
  locators: LedgerV2RequestLocators,
  identity: LedgerV2StableWorkflowIdentity,
  payload: RecoveryAuthorizationPayload,
  metadata: GitHubEvidenceMetadata,
): void {
  if (
    metadata.repository !== identity.repository
    || metadata.repositoryId !== identity.repositoryId
    || metadata.repositoryOwnerId !== identity.repositoryOwnerId
    || metadata.candidateCommit !== locators.candidateCommit
    || metadata.candidateCommit !== identity.workflowSha
    || metadata.candidateCommit !== payloadField(payload, 'candidateCommit')
    || metadata.candidateTree !== payloadField(payload, 'candidateTree')
    || metadata.parentCommit !== armed.preparationCommit
    || metadata.parentCommit !== payloadField(payload, 'predecessorCommit')
    || metadata.preparationTree !== armed.preparationTree
    || metadata.artifactId !== locators.artifactId
    || metadata.artifactId !== payloadField(payload, 'artifactId')
    || metadata.artifactName !== payloadField(payload, 'artifactName')
    || metadata.pagesRunId !== identity.pagesRunId
    || metadata.pagesRunId !== payloadField(payload, 'pagesRunId')
    || metadata.pagesRunAttempt !== identity.pagesRunAttempt
    || metadata.pagesRunAttempt !== payloadField(payload, 'pagesRunAttempt')
    || metadata.artifactDigest !== `sha256:${metadata.githubArtifactArchiveSha256}`
    || metadata.githubArtifactArchiveSha256 !== payloadField(
      payload,
      'githubArtifactArchiveSha256',
    )
  ) fail('RECOVERY_GITHUB_EVIDENCE_INVALID')
}

function authorizationSnapshot(
  locators: LedgerV2RequestLocators,
  identity: LedgerV2StableWorkflowIdentity,
  payload: RecoveryAuthorizationPayload,
  githubMetadata: GitHubEvidenceMetadata,
  githubMetadataSha256: string,
): LedgerV2AuthorizationSnapshot {
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
    githubMetadata,
    githubMetadataSha256,
  })
}

function sameLocators(left: LedgerV2RequestLocators, right: LedgerV2RequestLocators): boolean {
  return sameFlatKeys(
    left as unknown as Readonly<Record<string, unknown>>,
    right as unknown as Readonly<Record<string, unknown>>,
    RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS_V2,
  )
}

function sameStableIdentity(
  left: LedgerV2StableWorkflowIdentity,
  right: LedgerV2StableWorkflowIdentity,
): boolean {
  return sameFlatKeys(
    left as unknown as Readonly<Record<string, unknown>>,
    right as unknown as Readonly<Record<string, unknown>>,
    RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS_V2,
  )
}

const RECOVERY_LEDGER_CONTROL_KEYS_V2 = Object.freeze([
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
    if (error instanceof RecoveryLedgerV2Error) throw error
    fail(code)
  }
}

function controlSnapshot(value: unknown, code = 'RECOVERY_LEDGER_CONTROL_INVALID'): LedgerV2ControlState {
  const source = plainDataSnapshot(value, RECOVERY_LEDGER_CONTROL_KEYS_V2, code)
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
  authorization: LedgerV2AuthorizationSnapshot,
  locatorsValue: unknown,
  identityValue: unknown,
): void {
  let locators: LedgerV2RequestLocators
  let identity: LedgerV2StableWorkflowIdentity
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

function completedProof(value: unknown): value is LedgerV2CompletedProof {
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

function notDeployedProof(value: unknown): value is LedgerV2NotDeployedProof {
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
    if (error instanceof RecoveryLedgerV2Error && error.code === 'RECOVERY_LEDGER_NOT_DEPLOYED_NOT_PROVEN') {
      throw error
    }
  }
  fail('RECOVERY_LEDGER_RECONCILIATION_PROOF_INVALID')
}

type LedgerV2RowBoundRecord = Exclude<RecoveryLedgerRecordV2, LedgerV2ArmedState>

function rowBoundRecord(state: RecoveryLedgerRecordV2): LedgerV2RowBoundRecord {
  if (state.state === 'armed') fail('RECOVERY_LEDGER_ROW_BINDING_UNAVAILABLE')
  return state
}

export function ledgerV2RowBindingDigest(state: RecoveryLedgerRecordV2): string {
  const bound = rowBoundRecord(state)
  const bytes = canonicalMapJsonBytes({
    profile: 'warpkeep-release-recovery-ledger-row-binding-v2',
    arming: bound.arming,
    authorization: bound.authorization,
    authorizationJwsSha256: bound.state === 'issuing'
      ? null
      : bound.authorizationJwsSha256,
    claim: bound.state === 'claimed'
      || bound.state === 'reconciliation-required'
      || bound.state === 'completed'
      || bound.state === 'not-deployed'
      ? bound.claim
      : null,
  })
  return bytesToHex(sha256(bytes))
}

function assertRowBinding(state: RecoveryLedgerRecordV2, digest: string): void {
  if (ledgerV2RowBindingDigest(state) !== digest) fail('RECOVERY_LEDGER_ROW_BINDING_MISMATCH')
}

export function createLedgerV2Control(input: Readonly<{ authorizationEpoch: number }>): LedgerV2ControlState {
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

export function reconcileLedgerV2Control(
  stateValue: LedgerV2ControlState,
  input: Readonly<{
    enabled: boolean
    authorizationEpoch: number
    arming?: RecoveryArmingTuple
  }>,
): LedgerV2ControlState {
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

export function installLedgerV2Arming(
  existing: RecoveryLedgerRecordV2 | undefined,
  input: Readonly<{ arming: RecoveryArmingTuple; control: LedgerV2ControlState }>,
): LedgerV2ArmedState {
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

async function reserveIssue(
  state: RecoveryLedgerRecordV2,
  event: Extract<LedgerV2Event, { type: 'reserve-issue' }>,
): Promise<RecoveryLedgerRecordV2> {
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
  const metadata = await githubMetadataSnapshot(
    event.githubMetadata,
    event.githubMetadataSha256,
  )

  if (state.state === 'issuing') {
    assertNonBackwardTime(state, now)
    if (now >= state.issuingDeadline) fail('RECOVERY_LEDGER_RESERVATION_EXPIRED')
    const retryPayload = event.payload === undefined
      ? null
      : payloadSnapshot(event.payload, 'RECOVERY_LEDGER_ISSUE_MISMATCH')
    if (
      !sameLocators(state.authorization.locators, locators)
      || !sameStableIdentity(state.authorization.workflowIdentity, identity)
      || state.authorization.githubMetadataSha256 !== event.githubMetadataSha256
      || JSON.stringify(state.authorization.githubMetadata) !== JSON.stringify(metadata)
      || (retryPayload !== null && payloadCanonical(state.reservedPayload) !== payloadCanonical(retryPayload))
    ) fail('RECOVERY_LEDGER_ISSUE_MISMATCH')
    validateGitHubMetadataBinding(state.arming, locators, identity, state.reservedPayload, metadata)
    return state
  }

  if (event.payload === undefined) fail('RECOVERY_LEDGER_PAYLOAD_REQUIRED')
  const payload = payloadSnapshot(event.payload, 'RECOVERY_LEDGER_PAYLOAD_INVALID')
  validatePayloadBinding(state.arming, locators, identity, payload, now)
  validateGitHubMetadataBinding(state.arming, locators, identity, payload, metadata)
  const authorization = authorizationSnapshot(
    locators,
    identity,
    payload,
    metadata,
    event.githubMetadataSha256,
  )
  return Object.freeze({
    state: 'issuing',
    arming: state.arming,
    revision: state.revision + 1,
    lastTransitionAt: now,
    authorization,
    reservedPayload: payload,
    reservedAt: now,
    issuingDeadline: addSeconds(now, RECOVERY_ISSUING_TIMEOUT_SECONDS_V2, 'RECOVERY_LEDGER_TIME_INVALID'),
  })
}

function finalizeIssue(
  state: RecoveryLedgerRecordV2,
  event: Extract<LedgerV2Event, { type: 'finalize-issue' }>,
): RecoveryLedgerRecordV2 {
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
  if (state.state === 'issued') {
    if (
      state.authorizationJws !== event.authorizationJws
      || state.authorizationJwsSha256 !== event.authorizationJwsSha256
    ) fail('RECOVERY_LEDGER_ISSUE_MISMATCH')
    return state
  }
  let parsedPayload: Uint8Array
  try {
    parsedPayload = parseRecoveryCompactJws(event.authorizationJws, 'authorization').payloadBytes
  } catch {
    fail('RECOVERY_LEDGER_JWS_INVALID')
  }
  if (!sameBytes(
    parsedPayload,
    serializeExactObject(RECOVERY_AUTHORIZATION_PAYLOAD_KEYS, state.reservedPayload),
  )) fail('RECOVERY_LEDGER_JWS_PAYLOAD_MISMATCH')
  if (rawSha256Hex(event.authorizationJws) !== event.authorizationJwsSha256) {
    fail('RECOVERY_LEDGER_JWS_DIGEST_MISMATCH')
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

function expireIssuing(state: LedgerV2IssuingState, now: number): LedgerV2ExpiredUnusedState {
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

function expireIssued(state: LedgerV2IssuedState, now: number): LedgerV2ExpiredUnusedState {
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
  state: RecoveryLedgerRecordV2,
  event: Extract<LedgerV2Event, { type: 'read-issued' }>,
): RecoveryLedgerRecordV2 {
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
  state: RecoveryLedgerRecordV2,
  event: Extract<LedgerV2Event, { type: 'claim' }>,
): RecoveryLedgerRecordV2 {
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
  const claimSnapshot: LedgerV2ClaimSnapshot = Object.freeze({
    claimSnapshotDigest: event.claimSnapshotDigest,
    claimLiveInvariantDigest: event.liveInvariantDigest,
    claimSequence: 1,
    claimedAt: now,
    claimDeadline: addSeconds(now, RECOVERY_CLAIM_DEADLINE_SECONDS_V2, 'RECOVERY_LEDGER_TIME_INVALID'),
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
  state: RecoveryLedgerRecordV2,
  event: Extract<LedgerV2Event, { type: 'complete' }>,
): RecoveryLedgerRecordV2 {
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

function alarm(state: RecoveryLedgerRecordV2, event: Extract<LedgerV2Event, { type: 'alarm' }>): RecoveryLedgerRecordV2 {
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
  state: RecoveryLedgerRecordV2,
  event: Extract<LedgerV2Event, { type: 'reconcile' }>,
): RecoveryLedgerRecordV2 {
  const now = unixSecond(event.now, 'RECOVERY_LEDGER_TIME_INVALID')
  assertNonBackwardTime(state, now)
  const proofKind = reconciliationProofKind(event.proof)
  if (state.state === 'completed' || state.state === 'not-deployed') {
    if (proofKind === 'completed' || proofKind === 'not-deployed') {
      assertRowBinding(
        state,
        (event.proof as LedgerV2CompletedProof | LedgerV2NotDeployedProof).rowBindingDigest,
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
  const delay = RECOVERY_RECONCILIATION_RETRY_DELAYS_SECONDS_V2[state.reconciliationAttempts]
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

function exactEventSnapshot(value: unknown, keys: readonly string[]): LedgerV2Event {
  return Object.freeze({
    ...plainDataSnapshot(value, keys, 'RECOVERY_LEDGER_EVENT_INVALID'),
  }) as unknown as LedgerV2Event
}

function ledgerEventSnapshot(value: unknown): LedgerV2Event {
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
          'type', 'control', 'locators', 'identity', 'payload', 'githubMetadata',
          'githubMetadataSha256', 'now',
        ]) as Extract<LedgerV2Event, { type: 'reserve-issue' }>
        if (withPayload.payload === undefined) fail('RECOVERY_LEDGER_EVENT_INVALID')
        return withPayload
      } catch {
        return exactEventSnapshot(value, [
          'type', 'control', 'locators', 'identity', 'githubMetadata',
          'githubMetadataSha256', 'now',
        ])
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

export async function applyLedgerV2Event(
  state: RecoveryLedgerRecordV2,
  eventValue: LedgerV2Event,
): Promise<RecoveryLedgerRecordV2> {
  const event = ledgerEventSnapshot(eventValue)
  switch (event.type) {
    case 'reserve-issue': return await reserveIssue(state, event)
    case 'finalize-issue': return finalizeIssue(state, event)
    case 'read-issued': return readIssued(state, event)
    case 'claim': return claim(state, event)
    case 'complete': return complete(state, event)
    case 'alarm': return alarm(state, event)
    case 'reconcile': return reconcile(state, event)
    default: fail('RECOVERY_LEDGER_EVENT_INVALID')
  }
}

export function ledgerV2AlarmDeadline(state: RecoveryLedgerRecordV2): number | null {
  if (state.state === 'issuing') return state.issuingDeadline
  if (state.state === 'issued') return state.authorization.expiresAt
  if (state.state === 'claimed') return state.claim.claimDeadline
  if (state.state === 'reconciliation-required') return state.nextReconcileAt
  return null
}

export type LedgerSignerClaimProjection = Readonly<{
  state: 'claimed' | 'reconciliation-required' | 'completed' | 'not-deployed'
  requestId: string
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerV2ClaimSnapshot
  rowBindingDigest: string
  revision: number
  terminal?: Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number }>
}>

export function readClaimedProjection(
  row: RecoveryLedgerRecordV2,
): LedgerSignerClaimProjection {
  if (
    row.state !== 'claimed'
    && row.state !== 'reconciliation-required'
    && row.state !== 'completed'
    && row.state !== 'not-deployed'
  ) fail('RECOVERY_LEDGER_PROJECTION_UNAVAILABLE')

  const projection = {
    state: row.state,
    requestId: row.authorization.locators.requestId,
    authorization: row.authorization,
    authorizationJwsSha256: row.authorizationJwsSha256,
    claim: row.claim,
    rowBindingDigest: ledgerV2RowBindingDigest(row),
    revision: row.revision,
    ...(row.state === 'completed' || row.state === 'not-deployed'
      ? {
          terminal: Object.freeze({
            outcome: row.outcome,
            completedAt: row.completedAt,
          }),
        }
      : {}),
  }
  return Object.freeze(projection)
}
