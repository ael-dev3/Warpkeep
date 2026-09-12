import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { commit, githubFail, snapshotExactDataObject, snapshotRecoveryArmingTuple, type RecoveryArmingTuple } from './config.js'
import type { LedgerV2ControlState } from './ledgerV2.js'
import { snapshotPreparationPolicy, type PreparationPolicy } from './preparationPolicy.js'

const CODE = 'RECOVERY_PREPARATION_INTENT_INVALID'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const HASH = /^[0-9a-f]{64}$/u
const ID = /^[1-9][0-9]{0,19}$/u
export type PreparationIdentity = Readonly<{
  preparationCommit: string
  preparationTree: string
  runId: string
  runAttempt: string
  checkRunId: string
}>
export type PreparationIntent = Readonly<{
  schemaVersion: 1
  profile: 'warpkeep-recovery-preparation-intent-v1'
  requestId: string
  authorizationEpoch: number
  repository: 'ael-dev3/Warpkeep'
  repositoryId: '1273513252'
  repositoryOwnerId: '183124839'
  preparationCommit: string
  preparationTree: string
  policyDigest: string
  configuredArmingDigest: string | null
  runId: string
  runAttempt: string
  checkRunId: string
  createdAt: number
}>
export type PreparationReservationInput = Readonly<{
  policy: PreparationPolicy
  identity: PreparationIdentity
  configuredArming: RecoveryArmingTuple | null
  now: number
}>

function preparationDigest(value: PreparationPolicy | RecoveryArmingTuple): string {
  return bytesToHex(sha256(new TextEncoder().encode(`warpkeep-recovery-preparation-data-v1\n${JSON.stringify(value)}`)))
}

export function snapshotPreparationIdentity(value: unknown): PreparationIdentity {
  const source = snapshotExactDataObject(value, ['preparationCommit', 'preparationTree', 'runId', 'runAttempt', 'checkRunId'], CODE)
  if (!commit(source.preparationCommit) || !commit(source.preparationTree)
    || typeof source.runId !== 'string' || !ID.test(source.runId)
    || typeof source.runAttempt !== 'string' || !ID.test(source.runAttempt)
    || typeof source.checkRunId !== 'string' || !ID.test(source.checkRunId)) githubFail(CODE)
  return Object.freeze({ ...source }) as PreparationIdentity
}

export function snapshotPreparationIntent(value: unknown): PreparationIntent {
  const source = snapshotExactDataObject(value, [
    'schemaVersion', 'profile', 'requestId', 'authorizationEpoch', 'repository', 'repositoryId',
    'repositoryOwnerId', 'preparationCommit', 'preparationTree', 'policyDigest', 'configuredArmingDigest',
    'runId', 'runAttempt', 'checkRunId', 'createdAt',
  ], CODE)
  snapshotPreparationIdentity({ preparationCommit: source.preparationCommit, preparationTree: source.preparationTree,
    runId: source.runId, runAttempt: source.runAttempt, checkRunId: source.checkRunId })
  if (source.schemaVersion !== 1 || source.profile !== 'warpkeep-recovery-preparation-intent-v1'
    || typeof source.requestId !== 'string' || !UUID.test(source.requestId)
    || !Number.isSafeInteger(source.authorizationEpoch) || (source.authorizationEpoch as number) < 1
    || source.repository !== 'ael-dev3/Warpkeep' || source.repositoryId !== '1273513252'
    || source.repositoryOwnerId !== '183124839' || typeof source.policyDigest !== 'string' || !HASH.test(source.policyDigest)
    || (source.configuredArmingDigest !== null && (typeof source.configuredArmingDigest !== 'string' || !HASH.test(source.configuredArmingDigest)))
    || !Number.isSafeInteger(source.createdAt) || (source.createdAt as number) < 1) githubFail(CODE)
  return Object.freeze({ ...source }) as PreparationIntent
}

export function snapshotPreparationReservation(value: unknown): PreparationReservationInput {
  const source = snapshotExactDataObject(value, ['policy', 'identity', 'configuredArming', 'now'], CODE)
  const policy = snapshotPreparationPolicy(source.policy)
  const identity = snapshotPreparationIdentity(source.identity)
  const configuredArming = source.configuredArming === null ? null : snapshotRecoveryArmingTuple(source.configuredArming, CODE)
  if (!Number.isSafeInteger(source.now) || (source.now as number) < 1) githubFail(CODE)
  if (configuredArming !== null && (configuredArming.authorizationEpoch !== policy.authorizationEpoch
    || configuredArming.preparationCommit !== identity.preparationCommit
    || configuredArming.preparationTree !== identity.preparationTree)) githubFail(CODE)
  return Object.freeze({ policy, identity, configuredArming, now: source.now as number })
}

export function assertPreparationControl(control: LedgerV2ControlState, epoch: number): void {
  if (control.enabled || control.activeArming !== null || control.authorizationEpoch !== epoch
    || (control.maxConsumedAuthorizationEpoch !== null && control.maxConsumedAuthorizationEpoch >= epoch)) {
    githubFail('RECOVERY_PREPARATION_CONTROL_CONFLICT')
  }
}

/** Retries retain the first authenticated run and creation time, including after a lost response. */
export function choosePreparationIntent(
  input: PreparationReservationInput, control: LedgerV2ControlState,
  existing: PreparationIntent | null, allocateRequestId: () => string,
): PreparationIntent {
  const source = snapshotPreparationReservation(input)
  assertPreparationControl(control, source.policy.authorizationEpoch)
  const policyDigest = preparationDigest(source.policy)
  const configuredArmingDigest = source.configuredArming === null ? null : preparationDigest(source.configuredArming)
  if (existing !== null) {
    const prior = snapshotPreparationIntent(existing)
    if (prior.authorizationEpoch !== source.policy.authorizationEpoch || prior.policyDigest !== policyDigest
      || prior.preparationCommit !== source.identity.preparationCommit || prior.preparationTree !== source.identity.preparationTree
      || (prior.configuredArmingDigest !== null && prior.configuredArmingDigest !== configuredArmingDigest)
      || (source.configuredArming !== null && prior.requestId !== source.configuredArming.requestId)
      || control.usedRequestIds.includes(prior.requestId)) githubFail('RECOVERY_PREPARATION_INTENT_CONFLICT')
    // A later populated manifest may confirm the original tuple, but must not rewrite its earlier attestation.
    if (source.configuredArming !== null) assertPreparationArming(prior, source.configuredArming)
    return prior
  }
  const requestId = source.configuredArming?.requestId ?? allocateRequestId()
  if (control.usedRequestIds.includes(requestId)) githubFail('RECOVERY_PREPARATION_INTENT_CONFLICT')
  return snapshotPreparationIntent({
    schemaVersion: 1, profile: 'warpkeep-recovery-preparation-intent-v1', requestId,
    authorizationEpoch: source.policy.authorizationEpoch, repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252', repositoryOwnerId: '183124839',
    preparationCommit: source.identity.preparationCommit, preparationTree: source.identity.preparationTree,
    policyDigest, configuredArmingDigest, runId: source.identity.runId, runAttempt: source.identity.runAttempt,
    checkRunId: source.identity.checkRunId, createdAt: source.now,
  })
}

/** A reservation constrains only facts already owned at preparation time. Legacy epochs have no new guard. */
export function assertPreparationArming(intent: PreparationIntent, value: RecoveryArmingTuple): void {
  const prior = snapshotPreparationIntent(intent)
  const arming = snapshotRecoveryArmingTuple(value, CODE)
  if (arming.requestId !== prior.requestId || arming.authorizationEpoch !== prior.authorizationEpoch
    || arming.preparationCommit !== prior.preparationCommit || arming.preparationTree !== prior.preparationTree
    || arming.repository !== prior.repository || arming.repositoryId !== prior.repositoryId
    || arming.repositoryOwnerId !== prior.repositoryOwnerId
    || (prior.configuredArmingDigest !== null && preparationDigest(arming) !== prior.configuredArmingDigest)) {
    githubFail('RECOVERY_PREPARATION_ARMING_CONFLICT')
  }
}
