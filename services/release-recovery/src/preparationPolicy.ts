import { commit, githubFail, snapshotExactDataObject, snapshotRecoveryArmingTuple, type RecoveryArmingTuple } from './config.js'
import { parseGitHubJsonObject } from './http.js'

export const PREPARATION_WORKFLOW_REF = 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main'
export const PREPARATION_ENVIRONMENT = 'notification-bridge-prepared'
export const PREPARATION_AUDIENCE = 'https://release-auth.warpkeep.com/preparation'
const CODE = 'RECOVERY_PREPARATION_POLICY_INVALID'
export type PreparationPolicy = Readonly<{
  schemaVersion: 1
  profile: 'warpkeep-recovery-preparation-policy-v1'
  enabled: true
  authorizationEpoch: number
  workflowRef: typeof PREPARATION_WORKFLOW_REF
  environment: typeof PREPARATION_ENVIRONMENT
  operation: 'activation-evidence-generate'
}>

export function snapshotPreparationPolicy(value: unknown): PreparationPolicy {
  const source = snapshotExactDataObject(value, [
    'schemaVersion', 'profile', 'enabled', 'authorizationEpoch', 'workflowRef', 'environment', 'operation',
  ], CODE)
  if (source.schemaVersion !== 1 || source.profile !== 'warpkeep-recovery-preparation-policy-v1'
    || source.enabled !== true || !Number.isSafeInteger(source.authorizationEpoch)
    || (source.authorizationEpoch as number) < 1 || source.workflowRef !== PREPARATION_WORKFLOW_REF
    || source.environment !== PREPARATION_ENVIRONMENT || source.operation !== 'activation-evidence-generate') githubFail(CODE)
  return Object.freeze({ ...source }) as PreparationPolicy
}

/** A separate deploy-owned policy. This never parses an HTTP request as policy. */
export function parsePreparationDeployment(value: unknown): Readonly<{
  policy: PreparationPolicy
  configuredArming: RecoveryArmingTuple | null
}> {
  const source = snapshotExactDataObject(value, [
    'RECOVERY_ENABLED', 'RECOVERY_AUTHORIZATION_EPOCH', 'RECOVERY_ARMING_MANIFEST', 'RECOVERY_PREPARATION_POLICY',
  ], CODE)
  if (source.RECOVERY_ENABLED !== 'false' || typeof source.RECOVERY_PREPARATION_POLICY !== 'string'
    || source.RECOVERY_PREPARATION_POLICY.length > 4096) githubFail(CODE)
  const policy = snapshotPreparationPolicy(parseGitHubJsonObject(
    new TextEncoder().encode(source.RECOVERY_PREPARATION_POLICY), CODE, [],
  ))
  if (source.RECOVERY_AUTHORIZATION_EPOCH !== String(policy.authorizationEpoch)) githubFail(CODE)
  const manifest = source.RECOVERY_ARMING_MANIFEST
  let configuredArming: RecoveryArmingTuple | null = null
  if (manifest !== undefined && manifest !== '') {
    if (typeof manifest !== 'string' || manifest.length > 32768) githubFail(CODE)
    configuredArming = snapshotRecoveryArmingTuple(parseGitHubJsonObject(new TextEncoder().encode(manifest), CODE, []), CODE)
    if (configuredArming.authorizationEpoch !== policy.authorizationEpoch) githubFail(CODE)
  }
  return Object.freeze({ policy, configuredArming })
}

export function snapshotPreparationRequest(value: unknown): Readonly<{ oidcToken: string; preparationCommit: string }> {
  const source = snapshotExactDataObject(value, ['oidcToken', 'preparationCommit'], 'RECOVERY_PREPARATION_REQUEST_INVALID')
  if (typeof source.oidcToken !== 'string' || source.oidcToken.length < 1 || source.oidcToken.length > 30000
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(source.oidcToken)
    || !commit(source.preparationCommit)) githubFail('RECOVERY_PREPARATION_REQUEST_INVALID')
  return Object.freeze({ oidcToken: source.oidcToken, preparationCommit: source.preparationCommit })
}
