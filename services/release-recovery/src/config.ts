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
export type RecoveryArmingTuple=Readonly<{
  requestId:string
  authorizationMode:string
  recoveryAuthorizationProfile:string
  recoveryKeyId:string
  recoveryKeyThumbprint:string
  authorizationEpoch:number
  repository:string
  repositoryId:string
  repositoryOwnerId:string
  ref:string
  workflowRef:string
  environment:string
  releaseVersion:string
  operation:string
  canonicalOrigin:string
  issuer:string
  authWorker:string
  preparationCommit:string
  preparationTree:string
  sourceClosureProfile:string
  sourceClosureSha256:string
  recoveryAuthorizationCoreSha256:string
  bindingPath:string
  workflowPath:string
  genesis001Database:string
  genesis002Database:string
  ptrDatabase:string
}>
export type GitHubAppEnvironment=Readonly<{GITHUB_APP_ID:string;GITHUB_APP_INSTALLATION_ID:string;GITHUB_APP_PRIVATE_KEY_PEM:string}>
