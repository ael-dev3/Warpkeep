import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from './recoveryPublicKey.js'

export const GITHUB_OIDC_ISSUER='https://token.actions.githubusercontent.com' as const
export const GITHUB_OIDC_DISCOVERY_URL='https://token.actions.githubusercontent.com/.well-known/openid-configuration' as const
export const GITHUB_OIDC_JWKS_URL='https://token.actions.githubusercontent.com/.well-known/jwks' as const
export const GITHUB_RECOVERY_AUDIENCE='warpkeep-release-recovery' as const
export const GITHUB_REPOSITORY='ael-dev3/Warpkeep' as const
export const MAX_GITHUB_JSON_BYTES=256*1024; export const MAX_ARCHIVE_BYTES=160*1024*1024; export const MAX_TAR_BYTES=150*1024*1024
export class RecoveryGitHubError extends Error { readonly code:string; constructor(code:string){super(code);this.code=code;this.name='RecoveryGitHubError'} }
export function githubFail(code:string):never { throw new RecoveryGitHubError(code) }
export function positive(value:unknown):value is string{return typeof value==='string'&&/^[1-9][0-9]*$/u.test(value)}
export function commit(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{40}$/u.test(value)}
export function sha(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{64}$/u.test(value)}
export function snapshotExactDataObject(
  value: unknown,
  keys: readonly string[],
  code: string,
): Readonly<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== 'object') githubFail(code)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) githubFail(code)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const actualKeys = Reflect.ownKeys(descriptors)
    if (
      new Set(keys).size !== keys.length
      || actualKeys.length !== keys.length
      || actualKeys.some(key => typeof key !== 'string' || !keys.includes(key))
    ) githubFail(code)
    const snapshot: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')
      ) githubFail(code)
      snapshot[key] = descriptor.value
    }
    return Object.freeze(snapshot)
  } catch (error) {
    if (error instanceof RecoveryGitHubError && error.code === code) throw error
    githubFail(code)
  }
}
export const RECOVERY_REALM_BINDING_PROJECTION_KEYS = Object.freeze([
  'requestId', 'authorizationMode', 'recoveryAuthorizationProfile',
  'recoveryKeyId', 'recoveryKeyThumbprint', 'authorizationEpoch',
  'repository', 'repositoryId', 'repositoryOwnerId', 'ref', 'workflowRef',
  'environment', 'releaseVersion', 'operation', 'canonicalOrigin', 'issuer',
  'authWorker', 'bridgeWorkerVersion', 'bridgeWorkerVersionId',
  'bridgeSourceCommit', 'bridgeConfigIdentity', 'bridgeConfigEpoch',
  'preparationCommit', 'preparationTree', 'sourceClosureProfile',
  'sourceClosureSha256', 'recoveryAuthorizationCoreSha256',
  'pagesDeploymentApproved', 'genesis001Database', 'genesis002Database',
  'ptrDatabase', 'g001ExpectedProgramKeccak256',
  'g002ExpectedProgramKeccak256', 'ptrExpectedProgramKeccak256',
  'g002AtlasId', 'g002PublicReleaseId', 'g002PublicApprovalReceiptId',
  'g002AtlasSourceCommit', 'g002ReleaseSha256',
  'g002ReleaseHeaderSha256', 'g002VerificationDigest', 'ptrAtlasId',
  'ptrPublicReleaseId', 'ptrPublicApprovalReceiptId', 'ptrAtlasSourceCommit',
  'ptrExpectedReleaseSha256', 'ptrReleaseHeaderSha256',
  'ptrVerificationDigest',
] as const)

export const RECOVERY_REALM_BINDING_PROJECTION_KEYS_V4 = Object.freeze([
  ...RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  'ptrStateEvidenceProfile', 'ptrExistingStateAdoptionReceiptDigest',
  'ptrExpectedSealedStateHmacSha256', 'ptrExpectedOwnerInvariantHmacSha256',
] as const)

/** Choose a shape without invoking a caller-owned discriminator accessor. */
export function recoveryRealmBindingProjectionKeys(value: unknown,
  code = 'RECOVERY_REALM_BINDING_INVALID'): readonly string[] {
  try {
    if (value === null || typeof value !== 'object') githubFail(code)
    return Object.hasOwn(value, 'ptrStateEvidenceProfile')
      ? RECOVERY_REALM_BINDING_PROJECTION_KEYS_V4 : RECOVERY_REALM_BINDING_PROJECTION_KEYS
  } catch { githubFail(code) }
}

type RecoveryRealmBindingBase = Readonly<{
  requestId: string
  authorizationMode: 'recovery-authorization-v1'
  recoveryAuthorizationProfile: 'warpkeep-0.4.0-recovery-authorization-v1'
  recoveryKeyId: string
  recoveryKeyThumbprint: string
  authorizationEpoch: number
  repository: 'ael-dev3/Warpkeep'
  repositoryId: '1273513252'
  repositoryOwnerId: '183124839'
  ref: 'refs/heads/main'
  workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
  environment: 'github-pages'
  releaseVersion: '0.4.0'
  operation: 'github-pages-production-deploy'
  canonicalOrigin: 'https://warpkeep.com'
  issuer: 'https://release-auth.warpkeep.com'
  authWorker: 'warpkeep-auth-bridge'
  bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1'
  bridgeWorkerVersionId: string
  bridgeSourceCommit: string
  bridgeConfigIdentity: string
  bridgeConfigEpoch: number
  preparationCommit: string
  preparationTree: string
  sourceClosureProfile: string
  sourceClosureSha256: string
  recoveryAuthorizationCoreSha256: string
  pagesDeploymentApproved: true
  genesis001Database: string
  genesis002Database: string
  ptrDatabase: string
  g001ExpectedProgramKeccak256: string
  g002ExpectedProgramKeccak256: string
  ptrExpectedProgramKeccak256: string
  g002AtlasId: string
  g002PublicReleaseId: string
  g002PublicApprovalReceiptId: string
  g002AtlasSourceCommit: string
  g002ReleaseSha256: string
  g002ReleaseHeaderSha256: string
  g002VerificationDigest: string
  ptrAtlasId: string
  ptrPublicReleaseId: string
  ptrPublicApprovalReceiptId: string
  ptrAtlasSourceCommit: string
  ptrExpectedReleaseSha256: string
  ptrReleaseHeaderSha256: string
  ptrVerificationDigest: string
}>

export type RecoveryRealmBindingProjection = RecoveryRealmBindingBase | (RecoveryRealmBindingBase &
  Readonly<{ ptrStateEvidenceProfile: 'warpkeep-ptr-existing-state-adoption-v1';
    ptrExistingStateAdoptionReceiptDigest: string; ptrExpectedSealedStateHmacSha256: string;
    ptrExpectedOwnerInvariantHmacSha256: string }>
)

export type RecoveryArmingTuple = RecoveryRealmBindingProjection & Readonly<{
  bindingPath: 'config/releases/0.4.0-sealed-launch.json'
  workflowPath: '.github/workflows/deploy-pages.yml'
}>

export const RECOVERY_BINDING_PATH = 'config/releases/0.4.0-sealed-launch.json' as const
export const RECOVERY_WORKFLOW_PATH = '.github/workflows/deploy-pages.yml' as const
export const RECOVERY_GENESIS_001_DATABASE =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e' as const

const RECOVERY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const RECOVERY_PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u
const RECOVERY_PUBLIC_APPROVAL_RECEIPT_ID = /^GRA-[A-Z2-7]{26}$/u

/**
 * Snapshot the complete source-protected realm projection without invoking
 * accessors. This is shared by GitHub evidence loading and the live realm gate
 * so the two boundaries cannot silently disagree about accepted arming data.
 */
export function snapshotRecoveryRealmBindingProjection(
  value: unknown,
  code = 'RECOVERY_REALM_BINDING_INVALID',
): RecoveryRealmBindingProjection {
  const keys = recoveryRealmBindingProjectionKeys(value, code)
  const source = snapshotExactDataObject(value, keys, code)
  const digestKeys = [
    'bridgeConfigIdentity', 'sourceClosureSha256',
    'recoveryAuthorizationCoreSha256', 'genesis001Database',
    'genesis002Database', 'ptrDatabase', 'g001ExpectedProgramKeccak256',
    'g002ExpectedProgramKeccak256', 'ptrExpectedProgramKeccak256',
    'g002ReleaseSha256', 'g002ReleaseHeaderSha256',
    'g002VerificationDigest', 'ptrExpectedReleaseSha256',
    'ptrReleaseHeaderSha256', 'ptrVerificationDigest',
  ] as const
  if (
    typeof source.requestId !== 'string'
    || !RECOVERY_UUID.test(source.requestId)
    || source.authorizationMode !== 'recovery-authorization-v1'
    || source.recoveryAuthorizationProfile !== 'warpkeep-0.4.0-recovery-authorization-v1'
    || source.recoveryKeyId !== RECOVERY_KEY_ID
    || source.recoveryKeyThumbprint !== RECOVERY_KEY_THUMBPRINT
    || !Number.isSafeInteger(source.authorizationEpoch)
    || (source.authorizationEpoch as number) < 1
    || source.repository !== GITHUB_REPOSITORY
    || source.repositoryId !== '1273513252'
    || source.repositoryOwnerId !== '183124839'
    || source.ref !== 'refs/heads/main'
    || source.workflowRef !== `${GITHUB_REPOSITORY}/${RECOVERY_WORKFLOW_PATH}@refs/heads/main`
    || source.environment !== 'github-pages'
    || source.releaseVersion !== '0.4.0'
    || source.operation !== 'github-pages-production-deploy'
    || source.canonicalOrigin !== 'https://warpkeep.com'
    || source.issuer !== 'https://release-auth.warpkeep.com'
    || source.authWorker !== 'warpkeep-auth-bridge'
    || source.bridgeWorkerVersion !== 'warpkeep-auth-bridge-release-recovery-v1'
    || typeof source.bridgeWorkerVersionId !== 'string'
    || !RECOVERY_UUID.test(source.bridgeWorkerVersionId)
    || !commit(source.bridgeSourceCommit)
    || !Number.isSafeInteger(source.bridgeConfigEpoch)
    || (source.bridgeConfigEpoch as number) < 1
    || !commit(source.preparationCommit)
    || !commit(source.preparationTree)
    || source.sourceClosureProfile !== 'warpkeep-0.4.0-recovery-source-closure-v1'
    || source.pagesDeploymentApproved !== true
    || digestKeys.some(key => !sha(source[key]))
    || source.genesis001Database !== RECOVERY_GENESIS_001_DATABASE
    || source.genesis002Database === source.genesis001Database
    || source.ptrDatabase === source.genesis001Database
    || source.ptrDatabase === source.genesis002Database
    || source.g002AtlasId !== 'GENESIS_002_GREATER_REALM'
    || typeof source.g002PublicReleaseId !== 'string'
    || !RECOVERY_PUBLIC_RELEASE_ID.test(source.g002PublicReleaseId)
    || typeof source.g002PublicApprovalReceiptId !== 'string'
    || !RECOVERY_PUBLIC_APPROVAL_RECEIPT_ID.test(source.g002PublicApprovalReceiptId)
    || !commit(source.g002AtlasSourceCommit)
    || source.ptrAtlasId !== 'PTR_GREATER_REALM'
    || typeof source.ptrPublicReleaseId !== 'string'
    || !RECOVERY_PUBLIC_RELEASE_ID.test(source.ptrPublicReleaseId)
    || typeof source.ptrPublicApprovalReceiptId !== 'string'
    || !RECOVERY_PUBLIC_APPROVAL_RECEIPT_ID.test(source.ptrPublicApprovalReceiptId)
    || !commit(source.ptrAtlasSourceCommit)
  ) githubFail(code)
  if (keys === RECOVERY_REALM_BINDING_PROJECTION_KEYS_V4 && (
    source.ptrStateEvidenceProfile !== 'warpkeep-ptr-existing-state-adoption-v1'
    || !sha(source.ptrExistingStateAdoptionReceiptDigest)
    || !sha(source.ptrExpectedSealedStateHmacSha256)
    || !sha(source.ptrExpectedOwnerInvariantHmacSha256)
  )) githubFail(code)
  return Object.freeze({ ...source }) as RecoveryRealmBindingProjection
}

export function snapshotRecoveryArmingTuple(
  value: unknown,
  code = 'RECOVERY_REALM_BINDING_INVALID',
): RecoveryArmingTuple {
  const projectionKeys = recoveryRealmBindingProjectionKeys(value, code)
  const keys = [...projectionKeys, 'bindingPath', 'workflowPath'] as const
  const source = snapshotExactDataObject(value, keys, code)
  const projection: Record<string, unknown> = Object.create(null)
  for (const key of projectionKeys) projection[key] = source[key]
  const binding = snapshotRecoveryRealmBindingProjection(projection, code)
  if (
    source.bindingPath !== RECOVERY_BINDING_PATH
    || source.workflowPath !== RECOVERY_WORKFLOW_PATH
  ) githubFail(code)
  return Object.freeze({
    ...binding,
    bindingPath: RECOVERY_BINDING_PATH,
    workflowPath: RECOVERY_WORKFLOW_PATH,
  })
}

export function recoveryRealmBindingProjectionFromArmed(
  armed: RecoveryArmingTuple,
  code = 'RECOVERY_REALM_BINDING_INVALID',
): RecoveryRealmBindingProjection {
  const projection: Record<string, unknown> = Object.create(null)
  const source = snapshotRecoveryArmingTuple(armed, code)
  for (const key of recoveryRealmBindingProjectionKeys(source, code)) {
    projection[key] = (source as unknown as Readonly<Record<string, unknown>>)[key]
  }
  return snapshotRecoveryRealmBindingProjection(projection, code)
}
export type GitHubAppEnvironment=Readonly<{GITHUB_APP_ID:string;GITHUB_APP_INSTALLATION_ID:string;GITHUB_APP_PRIVATE_KEY_PEM:string}>
