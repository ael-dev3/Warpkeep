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

export type RecoveryRealmBindingProjection = Readonly<{
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

export type RecoveryArmingTuple = RecoveryRealmBindingProjection & Readonly<{
  bindingPath: 'config/releases/0.4.0-sealed-launch.json'
  workflowPath: '.github/workflows/deploy-pages.yml'
}>
export type GitHubAppEnvironment=Readonly<{GITHUB_APP_ID:string;GITHUB_APP_INSTALLATION_ID:string;GITHUB_APP_PRIVATE_KEY_PEM:string}>
