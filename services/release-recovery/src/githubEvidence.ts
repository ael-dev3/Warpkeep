import {
  GITHUB_REPOSITORY,
  RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  RecoveryGitHubError,
  type GitHubAppEnvironment,
  type RecoveryArmingTuple,
  type RecoveryRealmBindingProjection,
  commit,
  githubFail,
  positive,
  recoveryRealmBindingProjectionFromArmed,
  sha,
  snapshotExactDataObject,
  snapshotRecoveryArmingTuple,
  snapshotRecoveryRealmBindingProjection,
} from './config.js'
import { inspectPagesArtifact } from './archive.js'
import {
  githubRedirect,
  json,
  jsonWithMetadata,
  parseGitHubJsonObject,
  type GitHubJsonObject,
  type GitHubJsonValue,
} from './http.js'
import type { GitHubWorkflowIdentity } from './githubOidc.js'
import {
  base64UrlEncode,
  serializeExactObject,
  sha256Hex,
  type JsonValue,
} from './protocol.js'
import {
  githubEvidenceMetadataSha256,
  snapshotGitHubEvidenceMetadata,
  type GitHubEvidenceMetadata,
} from './githubEvidenceMetadata.js'
import { RECOVERY_KEY_ID, RECOVERY_KEY_THUMBPRINT } from './recoveryPublicKey.js'
import { parseDocument } from 'yaml'

export {
  RECOVERY_REALM_BINDING_PROJECTION_KEYS,
  type GitHubAppEnvironment,
  type RecoveryArmingTuple,
  type RecoveryRealmBindingProjection,
} from './config.js'
export {
  GITHUB_EVIDENCE_METADATA_KEYS,
  githubEvidenceMetadataSha256,
  snapshotGitHubEvidenceMetadata,
  type GitHubEvidenceMetadata,
} from './githubEvidenceMetadata.js'

const API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`
const REPOSITORY_ID = '1273513252'
const REPOSITORY_OWNER_ID = '183124839'
const REPOSITORY_OWNER = 'ael-dev3'
const BINDING_PATH = 'config/releases/0.4.0-sealed-launch.json'
const WORKFLOW_PATH = '.github/workflows/deploy-pages.yml'
const VERIFY_WORKFLOW_PATH = '.github/workflows/verify.yml'
const PACKAGE_PATH = 'package.json'
const PACKAGE_LOCK_PATH = 'package-lock.json'
const PREPARATION_VERSION = '0.3.43'
const ACTIVATION_VERSION = '0.4.0'
const BINDING_PROFILE = 'warpkeep-0.4.0-sealed-launch-v2'
const SOURCE_CLOSURE_PROFILE = 'warpkeep-0.4.0-recovery-source-closure-v1'
const AUTHORIZATION_PROFILE = 'warpkeep-0.4.0-recovery-authorization-v1'
const AUTHORIZATION_MODE = 'recovery-authorization-v1'
const BRIDGE_WORKER_VERSION = 'warpkeep-auth-bridge-release-recovery-v1'
const G001_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const MAX_TREE_ENTRIES = 20_000
const MAX_TREE_JSON_BYTES = 7 * 1024 * 1024
const MAX_BLOB_BYTES = 1024 * 1024
const MAX_BLOB_JSON_BYTES = 2 * 1024 * 1024
const BASE64_ROUNDTRIP_CHUNK_BYTES = 24 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const PUBLIC_RELEASE_ID = /^GRR-[A-Z2-7]{26}$/u
const PUBLIC_APPROVAL_RECEIPT_ID = /^GRA-[A-Z2-7]{26}$/u
const text = new TextEncoder()
const utf8 = new TextDecoder('utf-8', { fatal: true })

const PERMISSIONS = Object.freeze({
  actions: 'read',
  checks: 'read',
  contents: 'read',
  deployments: 'read',
  metadata: 'read',
  pages: 'read',
})
const PERMISSION_KEYS = Object.keys(PERMISSIONS)
const INSTALLATION_BODY = JSON.stringify({ permissions: PERMISSIONS, repositories: ['Warpkeep'] })
const IDENTITY_KEYS = [
  'repository', 'repositoryId', 'repositoryOwnerId', 'ref', 'workflowRef',
  'environment', 'eventName', 'workflowSha', 'pagesRunId', 'pagesRunAttempt',
  'checkRunId', 'oidcJti',
] as const
const V1_AFTER_PREPARATION = [
  'g001DatabaseIdentity', 'g001ExpectedProgramKeccak256',
  'g001SourceBaselineCommit', 'g001BaselineAbiSha256',
  'g001FreezeReleaseNonce', 'g001FreezePublishReceiptDigest',
  'g001FreezePublishReceiptCommitment', 'g001PolicyReceiptDigest',
  'g001PolicyReceiptCommitment', 'g001PolicyObservationBootstrapReceiptDigest',
  'g001PolicyObservationBootstrapReceiptCommitment', 'g001PolicySourceCommit',
  'g001ReleaseVersion', 'g001PlayerAccessEnabled',
  'g001AdmissionStateMutationsEnabled', 'g001AccessRequestSubmissionsEnabled',
  'g001CensusPrivacySafeReceiptProfile', 'g001CensusPrivacySafeReceiptDigest',
  'g001CensusPrivacySafeReceiptCommitment',
  'g001AdmittedPlayerCensusReceiptProfile',
  'g001AdmittedPlayerCensusReceiptDigest',
  'g001AdmittedPlayerCensusReceiptCommitment',
  'admissionMonitorSuspensionReceiptDigest',
  'admissionMonitorSuspensionReceiptCommitment',
  'admissionMonitorCurrentStateReceiptDigest',
  'admissionMonitorCurrentStateReceiptCommitment', 'admissionMonitorDisabled',
  'admissionMonitorLoaded', 'authBridgeSourceCommit',
  'admissionRequestSuspensionReceiptDigest',
  'admissionRequestSuspensionReceiptCommitment', 'g002PublishReceiptDigest',
  'g002PublishReceiptCommitment', 'g002FreshStatusDigest',
  'g002FreshStatusCommitment', 'g002DatabaseIdentity',
  'g002ExpectedProgramKeccak256', 'g002ModuleSourceCommit',
  'g002ModuleSha256', 'g002ModuleTreeId', 'g002DependencyClosureDigest',
  'g002SpacetimeExecutableSha256', 'g002SpacetimeCliConfigSha256',
  'g002AtlasImportReceiptDigest', 'g002AtlasImportReceiptCommitment',
  'g002SealedLiveReceiptDigest', 'g002SealedLiveReceiptCommitment',
  'g002AtlasSourceCommit', 'g002AtlasId', 'g002PublicReleaseId',
  'g002PublicApprovalReceiptId',
  'g002ReleaseSha256', 'g002ReleaseHeaderSha256', 'g002VerificationDigest',
  'g002AllowedFids', 'g002AccessRequests', 'g002PlayersV1', 'g002PlayersV2',
  'g002OwnershipBindings', 'g002Founders', 'g002Castles', 'g002RealmProfiles',
  'g002TermsAcceptances', 'g002MarkAccounts', 'g002ResourceAccounts',
  'g002Claims', 'g002Occupancies', 'g002ActivationRows', 'g002WorkerSystemRows',
  'g002AtlasReady', 'g002AtlasFinalized', 'g002AtlasWritesClosedByFinalization',
  'g002AtlasImportMutationsEnabled', 'g002AtlasActivationMutationsEnabled',
  'g002PlayerAccessEnabled', 'g002AdmissionMutationsEnabled',
  'ptrPublishReceiptDigest', 'ptrPublishReceiptCommitment',
  'ptrFreshStatusDigest', 'ptrFreshStatusCommitment',
  'ptrAtlasImportReceiptDigest', 'ptrAtlasImportReceiptCommitment',
  'ptrSealedLiveReceiptDigest', 'ptrSealedLiveReceiptCommitment',
  'ptrOwnerProvisionReceiptDigest', 'ptrOwnerProvisionReceiptCommitment',
  'ptrDatabaseIdentity', 'ptrExpectedProgramKeccak256',
  'ptrModuleSourceCommit', 'ptrModuleSha256',
  'ptrModuleTreeId', 'ptrDependencyClosureDigest', 'ptrSpacetimeExecutableSha256',
  'ptrSpacetimeCliConfigSha256', 'ptrAtlasSourceCommit', 'ptrAtlasId',
  'ptrPublicReleaseId', 'ptrPublicApprovalReceiptId', 'ptrReleaseVersion',
  'ptrReleaseManifestSha256',
  'ptrExpectedReleaseSha256', 'ptrReleaseHeaderSha256', 'ptrVerificationDigest',
  'ptrAllowedFids', 'ptrAccessRequests', 'ptrPlayersV1', 'ptrPlayersV2',
  'ptrOwnershipBindings', 'ptrCastles', 'ptrRealmProfiles', 'ptrTermsAcceptances',
  'ptrMarkAccounts', 'ptrResourceAccounts', 'ptrClaims', 'ptrOccupancies',
  'ptrActivationRows', 'ptrPublicAtlasRows', 'ptrPublicRegionRows',
  'ptrWorkerSystemRows', 'ptrAtlasReady', 'ptrAtlasFinalized',
  'ptrAtlasWritesClosedByFinalization', 'ptrAtlasImportsExact',
  'ptrAtlasImportMutationsCompiled', 'ptrAtlasActivationMutationsCompiled',
  'ptrOwnerAnchorRows', 'ptrOwnerProvisioned', 'ptrOwnerEnabled',
  'ptrAdmissionsOpen', 'ptrAccessRequestsOpen', 'ptrAdmissionSurfacePresent',
  'ptrAccessRequestSurfacePresent', 'g002PresentationEnabled',
  'ptrPresentationEnabled', 'legacyGreaterRealmClientPresentationEnabled',
  'legacyGreaterRealmServerPresentationEnabled', 'admissionNotificationsEnabled',
] as const

const BINDING_KEYS = [
  'schemaVersion', 'profile', 'authorizationMode', 'recoveryAuthorizationProfile',
  'recoveryAuthorizationRequestId', 'recoveryAuthorizationCoreSha256',
  'recoveryKeyId', 'recoveryKeyThumbprint', 'recoveryAuthorizationEpoch',
  'recoveryRepository', 'recoveryRepositoryId', 'recoveryRepositoryOwnerId',
  'recoveryRef', 'recoveryWorkflowRef', 'recoveryEnvironment',
  'recoveryReleaseVersion', 'recoveryOperation', 'recoveryCanonicalOrigin',
  'recoveryIssuer', 'recoveryAuthWorker', 'recoveryAuthWorkerVersion',
  'recoveryAuthWorkerVersionId', 'recoveryAuthWorkerSourceCommit',
  'recoveryAuthWorkerConfigIdentity', 'recoveryAuthWorkerConfigEpoch',
  'sourceClosureProfile',
  'sourceClosureSha256', 'pagesDeploymentApproved', 'preparationSourceCommit',
  'preparationSourceTree', ...V1_AFTER_PREPARATION,
] as const

const RECEIPT_COMMITMENTS = Object.freeze({
  g001PolicyReceiptCommitment: 'g001PolicyReceiptDigest',
  g001PolicyObservationBootstrapReceiptCommitment: 'g001PolicyObservationBootstrapReceiptDigest',
  g001CensusPrivacySafeReceiptCommitment: 'g001CensusPrivacySafeReceiptDigest',
  g001AdmittedPlayerCensusReceiptCommitment: 'g001AdmittedPlayerCensusReceiptDigest',
  admissionMonitorSuspensionReceiptCommitment: 'admissionMonitorSuspensionReceiptDigest',
  admissionMonitorCurrentStateReceiptCommitment: 'admissionMonitorCurrentStateReceiptDigest',
  admissionRequestSuspensionReceiptCommitment: 'admissionRequestSuspensionReceiptDigest',
  g002PublishReceiptCommitment: 'g002PublishReceiptDigest',
  g002FreshStatusCommitment: 'g002FreshStatusDigest',
  g002AtlasImportReceiptCommitment: 'g002AtlasImportReceiptDigest',
  g002SealedLiveReceiptCommitment: 'g002SealedLiveReceiptDigest',
  ptrPublishReceiptCommitment: 'ptrPublishReceiptDigest',
  ptrFreshStatusCommitment: 'ptrFreshStatusDigest',
  ptrAtlasImportReceiptCommitment: 'ptrAtlasImportReceiptDigest',
  ptrSealedLiveReceiptCommitment: 'ptrSealedLiveReceiptDigest',
  ptrOwnerProvisionReceiptCommitment: 'ptrOwnerProvisionReceiptDigest',
})
const COMMITMENT_KEYS = new Set([
  'g001FreezePublishReceiptCommitment', ...Object.keys(RECEIPT_COMMITMENTS),
])
const RECEIPT_SNAPSHOT_KEYS = BINDING_KEYS.filter(key => !COMMITMENT_KEYS.has(key))

// Shared with the literal service fixture; release Task 1 owns the matching root copy.
export const RECOVERY_BINDING_KEYS_V2: readonly string[] = Object.freeze([...BINDING_KEYS])
export const RECOVERY_RECEIPT_COMMITMENT_DIGESTS: Readonly<Record<string, string>> = RECEIPT_COMMITMENTS

// V3 changes only PTR publication evidence; all other fields retain their order.
export const RECOVERY_BINDING_KEYS_V3: readonly string[] = Object.freeze(BINDING_KEYS.flatMap(key =>
  key === 'ptrPublishReceiptDigest' ? ['ptrExistingUpdateReceiptDigest', 'ptrExistingUpdateReceiptCommitment']
    : ['ptrPublishReceiptCommitment', 'ptrFreshStatusDigest', 'ptrFreshStatusCommitment'].includes(key) ? [] : [key],
))
export const RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V3: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(RECEIPT_COMMITMENTS).flatMap(([key, value]) =>
    key === 'ptrPublishReceiptCommitment' ? [['ptrExistingUpdateReceiptCommitment', 'ptrExistingUpdateReceiptDigest']]
      : key === 'ptrFreshStatusCommitment' ? [] : [[key, value]],
  )),
)
const V3_COMMITMENT_KEYS = new Set(['g001FreezePublishReceiptCommitment', ...Object.keys(RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V3)])
const V3_RECEIPT_SNAPSHOT_KEYS = RECOVERY_BINDING_KEYS_V3.filter(key => !V3_COMMITMENT_KEYS.has(key))

export type GitHubCandidateEvidence = Readonly<{
  currentMainCommit: string
  parentCommit: string
  candidateTree: string
  recoveryBindingBytes: Uint8Array
  realmBinding: RecoveryRealmBindingProjection
  protectedWorkflowBytes: Uint8Array
  sourceClosureSha256: string
  sourceVerifyRunId: string
  sourceVerifyRunAttempt: string
  pagesArtifactId: string
  pagesArtifactName: string
  githubArtifactArchiveSha256: string
  innerArtifactTarSha256: string
  contentManifestSha256: string
  deploymentAttestationSha256: string
  githubMetadata: GitHubEvidenceMetadata
  githubMetadataSha256: string
}>

function objectValue(value: GitHubJsonValue | undefined): GitHubJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  return value as GitHubJsonObject
}

function exactKeys(value: GitHubJsonObject, keys: readonly string[], optional: readonly string[] = []): boolean {
  const actual = Object.keys(value)
  const allowed = new Set([...keys, ...optional])
  return keys.every(key => Object.hasOwn(value, key)) && actual.every(key => allowed.has(key))
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function environment(value: GitHubAppEnvironment): GitHubAppEnvironment {
  const source = snapshotExactDataObject(
    value,
    ['GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY_PEM'],
    'RECOVERY_GITHUB_EVIDENCE_INVALID',
  )
  if (
    !positive(source.GITHUB_APP_ID)
    || !positive(source.GITHUB_APP_INSTALLATION_ID)
    || typeof source.GITHUB_APP_PRIVATE_KEY_PEM !== 'string'
    || source.GITHUB_APP_PRIVATE_KEY_PEM.length < 64
    || source.GITHUB_APP_PRIVATE_KEY_PEM.length > 32_768
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return Object.freeze({
    GITHUB_APP_ID: source.GITHUB_APP_ID,
    GITHUB_APP_INSTALLATION_ID: source.GITHUB_APP_INSTALLATION_ID,
    GITHUB_APP_PRIVATE_KEY_PEM: source.GITHUB_APP_PRIVATE_KEY_PEM,
  })
}

function derLength(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0 || length > 32_768) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  if (length < 128) return new Uint8Array([length])
  const bytes: number[] = []
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) bytes.unshift(remaining & 0xff)
  return new Uint8Array([0x80 | bytes.length, ...bytes])
}

function derElement(tag: number, body: Uint8Array): Uint8Array {
  const length = derLength(body.length)
  const result = new Uint8Array(1 + length.length + body.length)
  result[0] = tag
  result.set(length, 1)
  result.set(body, 1 + length.length)
  return result
}

function decodePem(pem: string, label: 'PRIVATE KEY' | 'RSA PRIVATE KEY'): Uint8Array | undefined {
  const match = new RegExp(`^-----BEGIN ${label}-----\\r?\\n([A-Za-z0-9+/=\\r\\n]+)\\r?\\n-----END ${label}-----\\r?\\n?$`, 'u').exec(pem)
  if (match === null) return undefined
  try {
    const encoded = match[1]!.replace(/[\r\n]/gu, '')
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) return undefined
    const value = Uint8Array.from(atob(encoded), item => item.charCodeAt(0))
    let binary = ''
    for (const byte of value) binary += String.fromCharCode(byte)
    if (btoa(binary) !== encoded || value.length < 128 || value.length > 24_576) return undefined
    return value
  } catch {
    return undefined
  }
}

function pkcs8(pem: string): Uint8Array {
  const direct = decodePem(pem, 'PRIVATE KEY')
  if (direct !== undefined) return direct
  const pkcs1 = decodePem(pem, 'RSA PRIVATE KEY')
  if (pkcs1 === undefined) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const rsaAlgorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ])
  return derElement(0x30, new Uint8Array([...version, ...rsaAlgorithm, ...derElement(0x04, pkcs1)]))
}

async function signedAppJwt(env: GitHubAppEnvironment, now: number): Promise<string> {
  if (!Number.isSafeInteger(now) || now < 1) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const header = base64UrlEncode(text.encode('{"alg":"RS256","typ":"JWT"}'))
  const payload = base64UrlEncode(text.encode(JSON.stringify({ exp: now + 540, iat: now - 30, iss: env.GITHUB_APP_ID })))
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8', Uint8Array.from(pkcs8(env.GITHUB_APP_PRIVATE_KEY_PEM)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
    )
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, text.encode(`${header}.${payload}`))
    return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`
  } catch {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

export async function mintGitHubInstallationToken(
  input: GitHubAppEnvironment,
  fetchImplementation: typeof fetch,
  nowSeconds: number,
): Promise<string> {
  const env = environment(input)
  if (typeof fetchImplementation !== 'function') githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const jwt = await signedAppJwt(env, nowSeconds)
  const response = await json(
    fetchImplementation,
    `https://api.github.com/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${jwt}`,
        'content-type': 'application/json', 'x-github-api-version': '2022-11-28',
      },
      body: INSTALLATION_BODY,
    },
    'RECOVERY_GITHUB_EVIDENCE_INVALID', 201, ['/repositories/*/id'],
  )
  if (!exactKeys(
    response,
    ['expires_at', 'permissions', 'repositories', 'repository_selection', 'token'],
    ['repositories_url', 'has_multiple_single_files', 'single_file', 'single_file_paths', 'token_last_eight'],
  )) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const permissions = objectValue(response.permissions)
  const repositories = response.repositories
  const singleFilePaths = response.single_file_paths
  if (
    !exactKeys(permissions, PERMISSION_KEYS)
    || PERMISSION_KEYS.some(key => permissions[key] !== 'read')
    || !Array.isArray(repositories)
    || repositories.length !== 1
    || (response.repositories_url !== undefined && response.repositories_url !== 'https://api.github.com/installation/repositories')
    || (response.has_multiple_single_files !== undefined && typeof response.has_multiple_single_files !== 'boolean')
    || (response.single_file !== undefined && response.single_file !== null && typeof response.single_file !== 'string')
    || (singleFilePaths !== undefined && (
      !Array.isArray(singleFilePaths)
      || singleFilePaths.length > 100
      || singleFilePaths.some(path => typeof path !== 'string' || path.length > 1_024)
    ))
    || (response.token_last_eight !== undefined && (
      typeof response.token_last_eight !== 'string'
      || response.token_last_eight.length !== 8
    ))
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const repository = objectValue(repositories[0])
  if (
    typeof response.token !== 'string'
    || response.token.length < 1
    || response.token.length > 32_768
    || typeof response.expires_at !== 'string'
    || response.repository_selection !== 'selected'
    || (typeof response.token_last_eight === 'string' && !response.token.endsWith(response.token_last_eight))
    || repository.full_name !== GITHUB_REPOSITORY
    || repository.id !== REPOSITORY_ID
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const expiry = Date.parse(response.expires_at) / 1_000
  if (!Number.isSafeInteger(expiry) || expiry <= nowSeconds || expiry > nowSeconds + 3_660) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return response.token
}

function githubHeaders(token: string): HeadersInit {
  return { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }
}

function validateRepository(value: GitHubJsonObject): void {
  const owner = objectValue(value.owner)
  if (
    value.id !== REPOSITORY_ID
    || value.full_name !== GITHUB_REPOSITORY
    || value.name !== 'Warpkeep'
    || value.default_branch !== 'main'
    || value.archived !== false
    || value.disabled !== false
    || owner.id !== REPOSITORY_OWNER_ID
    || owner.login !== REPOSITORY_OWNER
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
}

function validateBranch(value: GitHubJsonObject, candidateCommit: string): void {
  const branchCommit = objectValue(value.commit)
  if (value.name !== 'main' || value.protected !== true || branchCommit.sha !== candidateCommit) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

type CommitProjection = Readonly<{ sha: string; tree: string; parent: string }>

function validateCommit(value: GitHubJsonObject, expectedSha: string): CommitProjection {
  const treeValue = objectValue(value.tree)
  const parents = value.parents
  if (
    value.sha !== expectedSha
    || !commit(treeValue.sha)
    || !Array.isArray(parents)
    || parents.length !== 1
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const parent = objectValue(parents[0]).sha
  if (!commit(parent)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return Object.freeze({ sha: expectedSha, tree: treeValue.sha, parent })
}

type TreeEntry = Readonly<{ path: string; mode: string; type: string; sha: string; size?: number }>

function validatePath(path: unknown): path is string {
  return typeof path === 'string'
    && path.length > 0
    && path.length <= 1_024
    && !path.startsWith('/')
    && !/[\\\0-\x1f\x7f]/u.test(path)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

function treeMap(value: GitHubJsonObject, expectedTree: string): ReadonlyMap<string, TreeEntry> {
  if (value.sha !== expectedTree || value.truncated !== false || !Array.isArray(value.tree) || value.tree.length > MAX_TREE_ENTRIES) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  const result = new Map<string, TreeEntry>()
  for (const rawEntry of value.tree) {
    const entry = objectValue(rawEntry)
    if (
      !validatePath(entry.path)
      || typeof entry.mode !== 'string'
      || typeof entry.type !== 'string'
      || !commit(entry.sha)
      || result.has(entry.path)
      || (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0))
    ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const validKind = (entry.mode === '040000' && entry.type === 'tree' && entry.size === undefined)
      || ((entry.mode === '100644' || entry.mode === '100755' || entry.mode === '120000') && entry.type === 'blob' && entry.size !== undefined)
      || (entry.mode === '160000' && entry.type === 'commit' && entry.size === undefined)
    if (!validKind) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    result.set(entry.path, Object.freeze({
      path: entry.path,
      mode: entry.mode,
      type: entry.type,
      sha: entry.sha,
      ...(entry.size === undefined ? {} : { size: entry.size as number }),
    }))
  }
  return result
}

function validateActivationDelta(
  candidate: ReadonlyMap<string, TreeEntry>,
  preparation: ReadonlyMap<string, TreeEntry>,
): void {
  if (candidate.size !== preparation.size) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const changedBlobs = new Set<string>()
  const changedTrees = new Set<string>()
  for (const [path, candidateEntry] of candidate) {
    const preparationEntry = preparation.get(path)
    if (preparationEntry === undefined) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    if (candidateEntry.mode !== preparationEntry.mode || candidateEntry.type !== preparationEntry.type) {
      githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
    if (candidateEntry.type === 'blob' && candidateEntry.size !== preparationEntry.size) changedBlobs.add(path)
    if (candidateEntry.sha !== preparationEntry.sha) {
      if (candidateEntry.type === 'tree') changedTrees.add(path)
      else changedBlobs.add(path)
    }
  }
  const expected = new Set([BINDING_PATH, PACKAGE_PATH, PACKAGE_LOCK_PATH])
  if (changedBlobs.size !== expected.size || [...expected].some(path => !changedBlobs.has(path))) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const expectedTrees = new Set<string>()
  for (const path of expected) {
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index += 1) expectedTrees.add(parts.slice(0, index).join('/'))
  }
  if ([...changedTrees].some(path => !expectedTrees.has(path))) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  for (const path of expected) {
    const before = preparation.get(path)
    const after = candidate.get(path)
    if (
      before === undefined
      || after === undefined
      || before.mode !== '100644'
      || after.mode !== '100644'
      || before.type !== 'blob'
      || after.type !== 'blob'
      || before.sha === after.sha
    ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  const workflowBefore = preparation.get(WORKFLOW_PATH)
  const workflowAfter = candidate.get(WORKFLOW_PATH)
  if (
    workflowBefore === undefined
    || workflowAfter === undefined
    || workflowBefore.mode !== '100644'
    || workflowBefore.type !== 'blob'
    || workflowAfter.mode !== workflowBefore.mode
    || workflowAfter.type !== workflowBefore.type
    || workflowAfter.sha !== workflowBefore.sha
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
}

function encodeCanonicalBase64(bytes: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_ROUNDTRIP_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + BASE64_ROUNDTRIP_CHUNK_BYTES)
    result += btoa(String.fromCharCode(...chunk))
  }
  return result
}

function decodeCanonicalBase64(value: unknown): Uint8Array {
  const maximumEncodedLength = Math.ceil(MAX_BLOB_BYTES / 3) * 4
  const maximumWireLength = maximumEncodedLength + Math.ceil(maximumEncodedLength / 60)
  if (typeof value !== 'string' || value.length < 2 || value.length > maximumWireLength || !value.endsWith('\n')) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  const lines = value.slice(0, -1).split('\n')
  if (
    lines.length < 1
    || lines.some((line, index) => line.length < 1 || line.length > 60 || (index < lines.length - 1 && line.length !== 60))
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const encoded = lines.join('')
  if (
    encoded.length > maximumEncodedLength
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)
  ) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  try {
    const result = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
    if (encodeCanonicalBase64(result) !== encoded || result.length > MAX_BLOB_BYTES) {
      githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
    return result
  } catch (error) {
    if (error instanceof RecoveryGitHubError) throw error
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

async function gitBlobSha1(bytes: Uint8Array): Promise<string> {
  const prefix = text.encode(`blob ${bytes.length}\0`)
  const input = new Uint8Array(prefix.length + bytes.length)
  input.set(prefix)
  input.set(bytes, prefix.length)
  const digest = await crypto.subtle.digest('SHA-1', input)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function loadStableBlob(
  fetchImplementation: typeof fetch,
  init: RequestInit,
  blobSha: string,
): Promise<Uint8Array> {
  const url = `${API}/git/blobs/${blobSha}`
  const first = await jsonWithMetadata(
    fetchImplementation, url, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, [], MAX_BLOB_JSON_BYTES,
  )
  const second = await jsonWithMetadata(
    fetchImplementation, url, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, [], MAX_BLOB_JSON_BYTES,
  )
  if (
    first.etag === null
    || first.etag.length < 1
    || first.etag !== second.etag
    || !equalBytes(first.bytes, second.bytes)
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const blob = first.value
  if (!exactKeys(blob, ['content', 'encoding', 'node_id', 'sha', 'size', 'url']) || blob.encoding !== 'base64' || blob.sha !== blobSha) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  const bytes = decodeCanonicalBase64(blob.content)
  if (blob.size !== bytes.length || await gitBlobSha1(bytes) !== blobSha) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return Uint8Array.from(bytes)
}

async function loadStableTreeBlob(
  fetchImplementation: typeof fetch,
  init: RequestInit,
  entry: TreeEntry,
): Promise<Uint8Array> {
  const bytes = await loadStableBlob(fetchImplementation, init, entry.sha)
  if (entry.size !== bytes.length) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return bytes
}

function canonicalJsonObject(bytes: Uint8Array): GitHubJsonObject {
  const value = parseGitHubJsonObject(bytes, 'RECOVERY_GITHUB_EVIDENCE_INVALID', [])
  let canonical: Uint8Array
  try {
    canonical = text.encode(`${JSON.stringify(value, null, 2)}\n`)
  } catch {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  if (!equalBytes(bytes, canonical)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return value
}

function replaceJsonProperty(
  value: GitHubJsonObject,
  key: string,
  replacement: GitHubJsonValue,
): GitHubJsonObject {
  if (!Object.hasOwn(value, key)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const result: Record<string, GitHubJsonValue> = Object.create(null)
  for (const current of Object.keys(value)) result[current] = current === key ? replacement : value[current]!
  return result
}

function canonicalJsonBytes(value: GitHubJsonObject): Uint8Array {
  try {
    return text.encode(`${JSON.stringify(value, null, 2)}\n`)
  } catch {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

function validatePackageVersionTransform(preparationBytes: Uint8Array, candidateBytes: Uint8Array): void {
  const preparation = canonicalJsonObject(preparationBytes)
  const candidate = canonicalJsonObject(candidateBytes)
  if (
    preparation.name !== 'warpkeep'
    || candidate.name !== 'warpkeep'
    || preparation.version !== PREPARATION_VERSION
    || candidate.version !== ACTIVATION_VERSION
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const downgraded = replaceJsonProperty(candidate, 'version', PREPARATION_VERSION)
  if (!equalBytes(preparationBytes, canonicalJsonBytes(downgraded))) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
}

function validatePackageLockVersionTransform(preparationBytes: Uint8Array, candidateBytes: Uint8Array): void {
  const preparation = canonicalJsonObject(preparationBytes)
  const candidate = canonicalJsonObject(candidateBytes)
  const preparationPackages = objectValue(preparation.packages)
  const candidatePackages = objectValue(candidate.packages)
  const preparationRoot = objectValue(preparationPackages[''])
  const candidateRoot = objectValue(candidatePackages[''])
  if (
    preparation.name !== 'warpkeep'
    || candidate.name !== 'warpkeep'
    || preparationRoot.name !== 'warpkeep'
    || candidateRoot.name !== 'warpkeep'
    || preparation.version !== PREPARATION_VERSION
    || candidate.version !== ACTIVATION_VERSION
    || preparationRoot.version !== PREPARATION_VERSION
    || candidateRoot.version !== ACTIVATION_VERSION
    || preparation.lockfileVersion !== 3
    || candidate.lockfileVersion !== 3
    || preparation.requires !== true
    || candidate.requires !== true
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const downgradedRoot = replaceJsonProperty(candidateRoot, 'version', PREPARATION_VERSION)
  const downgradedPackages = replaceJsonProperty(candidatePackages, '', downgradedRoot)
  const downgraded = replaceJsonProperty(
    replaceJsonProperty(candidate, 'version', PREPARATION_VERSION),
    'packages',
    downgradedPackages,
  )
  if (!equalBytes(preparationBytes, canonicalJsonBytes(downgraded))) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
}

function jsonRecord(value: GitHubJsonObject): Readonly<Record<string, JsonValue>> {
  return value as unknown as Readonly<Record<string, JsonValue>>
}

function exactRealmBindingProjection(value: unknown): RecoveryRealmBindingProjection {
  return snapshotRecoveryRealmBindingProjection(value, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
}

function pickRealmBindingProjection(value: Readonly<Record<string, unknown>>): RecoveryRealmBindingProjection {
  return recoveryRealmBindingProjectionFromArmed(
    value as RecoveryArmingTuple,
    'RECOVERY_GITHUB_EVIDENCE_INVALID',
  )
}

function bindingRealmProjection(binding: GitHubJsonObject): RecoveryRealmBindingProjection {
  return exactRealmBindingProjection({
    requestId: binding.recoveryAuthorizationRequestId,
    authorizationMode: binding.authorizationMode,
    recoveryAuthorizationProfile: binding.recoveryAuthorizationProfile,
    recoveryKeyId: binding.recoveryKeyId,
    recoveryKeyThumbprint: binding.recoveryKeyThumbprint,
    authorizationEpoch: binding.recoveryAuthorizationEpoch,
    repository: binding.recoveryRepository,
    repositoryId: binding.recoveryRepositoryId,
    repositoryOwnerId: binding.recoveryRepositoryOwnerId,
    ref: binding.recoveryRef,
    workflowRef: binding.recoveryWorkflowRef,
    environment: binding.recoveryEnvironment,
    releaseVersion: binding.recoveryReleaseVersion,
    operation: binding.recoveryOperation,
    canonicalOrigin: binding.recoveryCanonicalOrigin,
    issuer: binding.recoveryIssuer,
    authWorker: binding.recoveryAuthWorker,
    bridgeWorkerVersion: binding.recoveryAuthWorkerVersion,
    bridgeWorkerVersionId: binding.recoveryAuthWorkerVersionId,
    bridgeSourceCommit: binding.recoveryAuthWorkerSourceCommit,
    bridgeConfigIdentity: binding.recoveryAuthWorkerConfigIdentity,
    bridgeConfigEpoch: binding.recoveryAuthWorkerConfigEpoch,
    preparationCommit: binding.preparationSourceCommit,
    preparationTree: binding.preparationSourceTree,
    sourceClosureProfile: binding.sourceClosureProfile,
    sourceClosureSha256: binding.sourceClosureSha256,
    recoveryAuthorizationCoreSha256: binding.recoveryAuthorizationCoreSha256,
    pagesDeploymentApproved: binding.pagesDeploymentApproved,
    genesis001Database: binding.g001DatabaseIdentity,
    genesis002Database: binding.g002DatabaseIdentity,
    ptrDatabase: binding.ptrDatabaseIdentity,
    g001ExpectedProgramKeccak256: binding.g001ExpectedProgramKeccak256,
    g002ExpectedProgramKeccak256: binding.g002ExpectedProgramKeccak256,
    ptrExpectedProgramKeccak256: binding.ptrExpectedProgramKeccak256,
    g002AtlasId: binding.g002AtlasId,
    g002PublicReleaseId: binding.g002PublicReleaseId,
    g002PublicApprovalReceiptId: binding.g002PublicApprovalReceiptId,
    g002AtlasSourceCommit: binding.g002AtlasSourceCommit,
    g002ReleaseSha256: binding.g002ReleaseSha256,
    g002ReleaseHeaderSha256: binding.g002ReleaseHeaderSha256,
    g002VerificationDigest: binding.g002VerificationDigest,
    ptrAtlasId: binding.ptrAtlasId,
    ptrPublicReleaseId: binding.ptrPublicReleaseId,
    ptrPublicApprovalReceiptId: binding.ptrPublicApprovalReceiptId,
    ptrAtlasSourceCommit: binding.ptrAtlasSourceCommit,
    ptrExpectedReleaseSha256: binding.ptrExpectedReleaseSha256,
    ptrReleaseHeaderSha256: binding.ptrReleaseHeaderSha256,
    ptrVerificationDigest: binding.ptrVerificationDigest,
  })
}

function sameRealmBinding(
  left: RecoveryRealmBindingProjection,
  right: RecoveryRealmBindingProjection,
): boolean {
  try {
    return equalBytes(
      serializeExactObject(RECOVERY_REALM_BINDING_PROJECTION_KEYS, left as never),
      serializeExactObject(RECOVERY_REALM_BINDING_PROJECTION_KEYS, right as never),
    )
  } catch {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

async function validateBinding(
  bytes: Uint8Array,
  armed: RecoveryArmingTuple,
  bindingRequestId: unknown,
): Promise<RecoveryRealmBindingProjection> {
  const binding = parseGitHubJsonObject(bytes, 'RECOVERY_GITHUB_EVIDENCE_INVALID', [])
  if (binding.schemaVersion !== 2 && binding.schemaVersion !== 3) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const update = binding.schemaVersion === 3
  const bindingKeys = update ? RECOVERY_BINDING_KEYS_V3 : BINDING_KEYS
  const receiptKeys = update ? V3_RECEIPT_SNAPSHOT_KEYS : RECEIPT_SNAPSHOT_KEYS
  const commitments = update ? RECOVERY_RECEIPT_COMMITMENT_DIGESTS_V3 : RECEIPT_COMMITMENTS
  if (
    Object.keys(binding).length !== bindingKeys.length
    || bindingKeys.some((key, index) => Object.keys(binding)[index] !== key)
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  let canonical: Uint8Array
  try {
    canonical = text.encode(`${JSON.stringify(binding, null, 2)}\n`)
  } catch {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  if (!equalBytes(bytes, canonical)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  if (
    binding.profile !== (update ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' : BINDING_PROFILE)
    || binding.authorizationMode !== AUTHORIZATION_MODE
    || binding.authorizationMode !== armed.authorizationMode
    || binding.recoveryAuthorizationProfile !== AUTHORIZATION_PROFILE
    || binding.recoveryAuthorizationProfile !== armed.recoveryAuthorizationProfile
    || binding.recoveryAuthorizationRequestId !== bindingRequestId
    || binding.recoveryAuthorizationRequestId !== armed.requestId
    || binding.recoveryKeyId !== RECOVERY_KEY_ID
    || binding.recoveryKeyId !== armed.recoveryKeyId
    || binding.recoveryKeyThumbprint !== RECOVERY_KEY_THUMBPRINT
    || binding.recoveryKeyThumbprint !== armed.recoveryKeyThumbprint
    || !Number.isSafeInteger(binding.recoveryAuthorizationEpoch)
    || (binding.recoveryAuthorizationEpoch as number) < 1
    || binding.recoveryAuthorizationEpoch !== armed.authorizationEpoch
    || binding.recoveryRepository !== GITHUB_REPOSITORY
    || binding.recoveryRepository !== armed.repository
    || binding.recoveryRepositoryId !== REPOSITORY_ID
    || binding.recoveryRepositoryId !== armed.repositoryId
    || binding.recoveryRepositoryOwnerId !== REPOSITORY_OWNER_ID
    || binding.recoveryRepositoryOwnerId !== armed.repositoryOwnerId
    || binding.recoveryRef !== 'refs/heads/main'
    || binding.recoveryRef !== armed.ref
    || binding.recoveryWorkflowRef !== `${GITHUB_REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`
    || binding.recoveryWorkflowRef !== armed.workflowRef
    || binding.recoveryEnvironment !== 'github-pages'
    || binding.recoveryEnvironment !== armed.environment
    || binding.recoveryReleaseVersion !== '0.4.0'
    || binding.recoveryReleaseVersion !== armed.releaseVersion
    || binding.recoveryOperation !== 'github-pages-production-deploy'
    || binding.recoveryOperation !== armed.operation
    || binding.recoveryCanonicalOrigin !== 'https://warpkeep.com'
    || binding.recoveryCanonicalOrigin !== armed.canonicalOrigin
    || binding.recoveryIssuer !== 'https://release-auth.warpkeep.com'
    || binding.recoveryIssuer !== armed.issuer
    || binding.recoveryAuthWorker !== 'warpkeep-auth-bridge'
    || binding.recoveryAuthWorker !== armed.authWorker
    || binding.sourceClosureProfile !== SOURCE_CLOSURE_PROFILE
    || binding.sourceClosureProfile !== armed.sourceClosureProfile
    || binding.sourceClosureSha256 !== armed.sourceClosureSha256
    || binding.pagesDeploymentApproved !== true
    || binding.preparationSourceCommit !== armed.preparationCommit
    || binding.preparationSourceTree !== armed.preparationTree
    || binding.g001DatabaseIdentity !== G001_DATABASE
    || binding.g001DatabaseIdentity !== armed.genesis001Database
    || binding.g002DatabaseIdentity !== armed.genesis002Database
    || binding.ptrDatabaseIdentity !== armed.ptrDatabase
    || binding.g001FreezePublishReceiptDigest !== null
    || binding.g001FreezePublishReceiptCommitment !== null
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')

  const source = jsonRecord(binding)
  const receiptSnapshot: Record<string, JsonValue> = Object.create(null)
  for (const key of receiptKeys) {
    receiptSnapshot[key] = key === 'recoveryAuthorizationCoreSha256' ? null : source[key]!
  }
  for (const [commitmentKey, digestKey] of Object.entries(commitments)) {
    if (!sha(source[digestKey]) || !sha(source[commitmentKey])) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const expected = await sha256Hex(
      `warpkeep.0.4.0.recovery-sealed-launch.${commitmentKey}.v${update ? 3 : 2}\n`,
      serializeExactObject(receiptKeys, receiptSnapshot as never),
    )
    if (source[commitmentKey] !== expected) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  if (!sha(binding.recoveryAuthorizationCoreSha256) || binding.recoveryAuthorizationCoreSha256 !== armed.recoveryAuthorizationCoreSha256) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  const coreProjection: Record<string, JsonValue> = Object.create(null)
  for (const key of bindingKeys) coreProjection[key] = key === 'recoveryAuthorizationCoreSha256' ? null : source[key]!
  const expectedCore = await sha256Hex(
    `warpkeep.0.4.0.recovery-authorization-core.v${update ? 3 : 1}\n`,
    serializeExactObject(bindingKeys, coreProjection as never),
  )
  if (binding.recoveryAuthorizationCoreSha256 !== expectedCore) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const realmBinding = bindingRealmProjection(binding)
  if (!sameRealmBinding(realmBinding, pickRealmBindingProjection(armed))) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  return realmBinding
}

export function validateRecoveryWorkflowSource(bytes: Uint8Array): void {
  let source: string
  try {
    source = utf8.decode(bytes)
  } catch {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  if (/\t|\r(?!\n)|[\0\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(source)) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  try {
    const document = parseDocument(source, {
      schema: 'core', strict: true, uniqueKeys: true, prettyErrors: false,
    })
    if (document.errors.length !== 0 || document.warnings.length !== 0) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const root = document.toJS({ maxAliasCount: 0 }) as unknown
    if (root === null || typeof root !== 'object' || Array.isArray(root)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const rootObject = root as Record<string, unknown>
    const jobs = rootObject.jobs
    if (rootObject.name !== 'Deploy GitHub Pages' || jobs === null || typeof jobs !== 'object' || Array.isArray(jobs)) {
      githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
    const recovery = (jobs as Record<string, unknown>)['deploy-recovery']
    if (recovery === null || typeof recovery !== 'object' || Array.isArray(recovery)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const job = recovery as Record<string, unknown>
    const labels = job['runs-on']
    const requiredLabels = ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive']
    const permissions = job.permissions
    const requiredPermissions = { contents: 'read', actions: 'read', pages: 'write', 'id-token': 'write' }
    const concurrency = rootObject.concurrency
    const environment = job.environment
    const environmentName = typeof environment === 'string' ? environment
      : environment !== null && typeof environment === 'object' && !Array.isArray(environment)
        ? (environment as Record<string, unknown>).name : undefined
    if (!Array.isArray(labels) || labels.length !== requiredLabels.length
      || requiredLabels.some(label => !labels.includes(label))
      || permissions === null || typeof permissions !== 'object' || Array.isArray(permissions)
      || Object.keys(permissions).length !== Object.keys(requiredPermissions).length
      || Object.entries(requiredPermissions).some(([key, value]) => (permissions as Record<string, unknown>)[key] !== value)
      || concurrency === null || typeof concurrency !== 'object' || Array.isArray(concurrency)
      || Object.keys(concurrency).length !== 2
      || (concurrency as Record<string, unknown>).group !== 'warpkeep-production-state'
      || (concurrency as Record<string, unknown>)['cancel-in-progress'] !== false
      || environmentName !== 'github-pages'
      || ['concurrency', 'strategy', 'uses', 'container', 'services', 'continue-on-error'].some(key => Object.hasOwn(job, key))) {
      githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
    const steps = job.steps
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 100) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const objects = steps.filter(step => step !== null && typeof step === 'object' && !Array.isArray(step)) as Record<string, unknown>[]
    if (objects.length !== steps.length) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const preparationSteps = objects.filter(step => {
      const environment = step.env
      // The fixed helper owns fresh audience-bound OIDC acquisition. Shell
      // substrings (including comments or raw curl) do not prove that behavior.
      return Object.keys(step).length === 5
        && step.name === 'Prepare private recovery claim'
        && step.id === 'recovery-claim' && step.shell === 'bash'
        && environment !== null && typeof environment === 'object' && !Array.isArray(environment)
        && Object.keys(environment).length === 1
        && (environment as Record<string, unknown>).GITHUB_TOKEN === '${{ github.token }}'
        && step.run === 'node scripts/recovery-workflow-prepare-claim.mjs\n'
    })
    const artifactSteps = objects.filter(step => {
      const withValue = step.with
      return typeof step.uses === 'string'
        && step.uses === 'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9'
        && withValue !== null && typeof withValue === 'object' && !Array.isArray(withValue)
        && (withValue as Record<string, unknown>).name === 'github-pages-recovery-${{ github.run_id }}-${{ github.run_attempt }}'
    })
    if (preparationSteps.length !== 1 || artifactSteps.length !== 1
      || objects.indexOf(artifactSteps[0]!) >= objects.indexOf(preparationSteps[0]!)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const boundarySteps = objects.filter(step => {
      const env = step.env
      return Object.keys(step).length === 5 && step.name === 'Check recovery deployment boundary'
        && step.id === 'recovery-boundary' && step.shell === 'bash'
        && env !== null && typeof env === 'object' && !Array.isArray(env) && Object.keys(env).length === 1
        && (env as Record<string, unknown>).GITHUB_TOKEN === '${{ github.token }}'
        && step.run === 'node scripts/recovery-workflow-check-deployment.mjs\n'
    })
    const deploySteps = objects.filter(step => typeof step.uses === 'string' && step.uses.startsWith('actions/deploy-pages@'))
    if (boundarySteps.length !== 1 || deploySteps.length !== 1) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const deploy = deploySteps[0]!
    const deployWith = deploy.with
    if (Object.keys(deploy).length !== 4 || deploy.name !== 'Deploy recovery-authorized release to GitHub Pages'
      || deploy.id !== 'recovery-deployment'
      || deploy.uses !== 'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128'
      || deployWith === null || typeof deployWith !== 'object' || Array.isArray(deployWith)
      || Object.keys(deployWith).length !== 1
      || (deployWith as Record<string, unknown>).artifact_name !== 'github-pages-recovery-${{ github.run_id }}-${{ github.run_attempt }}'
      || objects.indexOf(boundarySteps[0]!) !== objects.indexOf(preparationSteps[0]!) + 1
      || objects.indexOf(deploy) !== objects.indexOf(boundarySteps[0]!) + 1) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const postflights = objects.filter(step => step.id === 'recovery-postflight')
    if (postflights.length !== 1) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const postflight = postflights[0]!
    const postflightEnv = postflight.env
    if (Object.keys(postflight).length !== 6
      || postflight.name !== 'Verify recovery live postflight'
      || postflight.if !== "${{ always() && steps.recovery-claim.outcome == 'success' }}"
      || postflight.shell !== 'bash'
      || postflightEnv === null || typeof postflightEnv !== 'object' || Array.isArray(postflightEnv)
      || Object.keys(postflightEnv).length !== 1
      || (postflightEnv as Record<string, unknown>).GITHUB_TOKEN !== '${{ github.token }}'
      || postflight.run !== 'node scripts/recovery-workflow-postflight.mjs\n'
      || objects.indexOf(postflight) !== objects.indexOf(deploy) + 1) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  } catch {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

function validateSourceVerify(
  source: GitHubJsonObject,
  runId: string,
  runAttempt: string,
  candidateCommit: string,
  pagesRunId: string,
): void {
  const repository = objectValue(source.repository)
  const owner = objectValue(repository.owner)
  const headRepository = objectValue(source.head_repository)
  if (
    runId === pagesRunId
    || source.id !== runId
    || source.run_attempt !== runAttempt
    || source.name !== 'Verify'
    || (source.path !== VERIFY_WORKFLOW_PATH && source.path !== `${VERIFY_WORKFLOW_PATH}@main`)
    || !positive(source.workflow_id)
    || source.workflow_url !== `${API}/actions/workflows/${source.workflow_id}`
    || source.event !== 'push'
    || source.status !== 'completed'
    || source.conclusion !== 'success'
    || source.head_branch !== 'main'
    || source.head_sha !== candidateCommit
    || repository.full_name !== GITHUB_REPOSITORY
    || repository.id !== REPOSITORY_ID
    || owner.id !== REPOSITORY_OWNER_ID
    || headRepository.id !== REPOSITORY_ID
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
}

type ArtifactProjection = Readonly<{
  id: string
  name: string
  size: number
  url: string
  archiveUrl: string
  nodeId: string
  createdAt: string
  expiresAt: string
  digest: string
  runId: string
  repositoryId: string
  headRepositoryId: string
  headBranch: string
  headSha: string
}>

function artifactProjection(
  value: GitHubJsonObject,
  artifactId: string,
  artifactName: string,
  pagesRunId: string,
  candidateCommit: string,
): ArtifactProjection {
  const run = objectValue(value.workflow_run)
  if (
    value.id !== artifactId
    || value.name !== artifactName
    || typeof value.node_id !== 'string'
    || value.node_id.length < 1
    || value.expired !== false
    || typeof value.size_in_bytes !== 'number'
    || !Number.isSafeInteger(value.size_in_bytes)
    || value.size_in_bytes < 1
    || typeof value.url !== 'string'
    || value.url !== `${API}/actions/artifacts/${artifactId}`
    || typeof value.archive_download_url !== 'string'
    || value.archive_download_url !== `${API}/actions/artifacts/${artifactId}/zip`
    || typeof value.created_at !== 'string'
    || typeof value.expires_at !== 'string'
    || !sha(typeof value.digest === 'string' && value.digest.startsWith('sha256:') ? value.digest.slice(7) : undefined)
    || run.id !== pagesRunId
    || run.repository_id !== REPOSITORY_ID
    || run.head_repository_id !== REPOSITORY_ID
    || run.head_branch !== 'main'
    || run.head_sha !== candidateCommit
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const created = Date.parse(value.created_at)
  const expires = Date.parse(value.expires_at)
  if (!Number.isFinite(created) || !Number.isFinite(expires) || created > Date.now() || created >= expires || expires <= Date.now()) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  return Object.freeze({
    id: artifactId,
    name: artifactName,
    size: value.size_in_bytes,
    url: value.url,
    archiveUrl: value.archive_download_url,
    nodeId: value.node_id,
    createdAt: value.created_at,
    expiresAt: value.expires_at,
    digest: value.digest as string,
    runId: pagesRunId,
    repositoryId: REPOSITORY_ID,
    headRepositoryId: REPOSITORY_ID,
    headBranch: 'main',
    headSha: candidateCommit,
  })
}

function sameArtifact(left: ArtifactProjection, right: ArtifactProjection): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function loadStableArtifact(
  fetchImplementation: typeof fetch,
  init: RequestInit,
  artifactId: string,
  artifactName: string,
  pagesRunId: string,
  candidateCommit: string,
): Promise<Readonly<{ projection: ArtifactProjection; etag: string }>> {
  const url = `${API}/actions/artifacts/${artifactId}`
  const first = await jsonWithMetadata(fetchImplementation, url, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, [
    'id', '/workflow_run/id', '/workflow_run/repository_id', '/workflow_run/head_repository_id',
  ])
  const second = await jsonWithMetadata(fetchImplementation, url, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, [
    'id', '/workflow_run/id', '/workflow_run/repository_id', '/workflow_run/head_repository_id',
  ])
  if (
    first.etag === null
    || first.etag.length < 1
    || first.etag !== second.etag
    || !equalBytes(first.bytes, second.bytes)
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  const projection = artifactProjection(first.value, artifactId, artifactName, pagesRunId, candidateCommit)
  if (!sameArtifact(projection, artifactProjection(second.value, artifactId, artifactName, pagesRunId, candidateCommit))) {
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
  return Object.freeze({ projection, etag: first.etag })
}

function snapshotIdentity(value: unknown, candidateCommit: string): Readonly<Record<string, unknown>> {
  const identity = snapshotExactDataObject(value, IDENTITY_KEYS, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
  if (
    identity.repository !== GITHUB_REPOSITORY
    || identity.repositoryId !== REPOSITORY_ID
    || identity.repositoryOwnerId !== REPOSITORY_OWNER_ID
    || identity.ref !== 'refs/heads/main'
    || identity.workflowRef !== `${GITHUB_REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`
    || identity.environment !== 'github-pages'
    || identity.eventName !== 'workflow_run'
    || identity.workflowSha !== candidateCommit
    || !positive(identity.pagesRunId)
    || !positive(identity.pagesRunAttempt)
    || !positive(identity.checkRunId)
    || typeof identity.oidcJti !== 'string'
  ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  return identity
}

function snapshotArmed(value: unknown): RecoveryArmingTuple {
  return snapshotRecoveryArmingTuple(value, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
}

export async function loadGitHubCandidateEvidence(input: Readonly<{
  identity: GitHubWorkflowIdentity
  candidateCommit: string
  artifactId: string
  sourceVerifyRunId: string
  sourceVerifyRunAttempt: string
  bindingRequestId: string
  armed: RecoveryArmingTuple
  environment: GitHubAppEnvironment
  fetch: typeof fetch
}>): Promise<GitHubCandidateEvidence> {
  try {
    const snapshot = snapshotExactDataObject(input, [
      'identity', 'candidateCommit', 'artifactId', 'sourceVerifyRunId',
      'sourceVerifyRunAttempt', 'bindingRequestId', 'armed', 'environment', 'fetch',
    ], 'RECOVERY_GITHUB_EVIDENCE_INVALID')
    if (
      !commit(snapshot.candidateCommit)
      || !positive(snapshot.artifactId)
      || !positive(snapshot.sourceVerifyRunId)
      || !positive(snapshot.sourceVerifyRunAttempt)
      || typeof snapshot.bindingRequestId !== 'string'
      || !UUID.test(snapshot.bindingRequestId)
      || typeof snapshot.fetch !== 'function'
    ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const candidateCommit = snapshot.candidateCommit
    const artifactId = snapshot.artifactId
    const sourceVerifyRunId = snapshot.sourceVerifyRunId
    const sourceVerifyRunAttempt = snapshot.sourceVerifyRunAttempt
    const fetchImplementation = snapshot.fetch as typeof fetch
    const identity = snapshotIdentity(snapshot.identity, candidateCommit)
    const armed = snapshotArmed(snapshot.armed)
    if (armed.requestId !== snapshot.bindingRequestId) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')

    const token = await mintGitHubInstallationToken(
      snapshot.environment as GitHubAppEnvironment,
      fetchImplementation,
      Math.floor(Date.now() / 1_000),
    )
    const init = { headers: githubHeaders(token) }
    const repository = await json(fetchImplementation, API, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, ['id', '/owner/id'])
    validateRepository(repository)
    const branch = await json(fetchImplementation, `${API}/branches/main`, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
    validateBranch(branch, candidateCommit)
    const candidateValue = await json(fetchImplementation, `${API}/git/commits/${candidateCommit}`, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
    const candidate = validateCommit(candidateValue, candidateCommit)
    if (candidate.parent !== armed.preparationCommit) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const preparationValue = await json(fetchImplementation, `${API}/git/commits/${armed.preparationCommit as string}`, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
    const preparation = validateCommit(preparationValue, armed.preparationCommit as string)
    if (preparation.tree !== armed.preparationTree) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const candidateTreeValue = await json(fetchImplementation, `${API}/git/trees/${candidate.tree}?recursive=1`, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, [], MAX_TREE_JSON_BYTES)
    const preparationTreeValue = await json(fetchImplementation, `${API}/git/trees/${preparation.tree}?recursive=1`, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, [], MAX_TREE_JSON_BYTES)
    const candidateTree = treeMap(candidateTreeValue, candidate.tree)
    const preparationTree = treeMap(preparationTreeValue, preparation.tree)
    validateActivationDelta(candidateTree, preparationTree)
    const candidatePackageBytes = await loadStableTreeBlob(fetchImplementation, init, candidateTree.get(PACKAGE_PATH)!)
    const preparationPackageBytes = await loadStableTreeBlob(fetchImplementation, init, preparationTree.get(PACKAGE_PATH)!)
    validatePackageVersionTransform(preparationPackageBytes, candidatePackageBytes)
    const candidateLockBytes = await loadStableTreeBlob(fetchImplementation, init, candidateTree.get(PACKAGE_LOCK_PATH)!)
    const preparationLockBytes = await loadStableTreeBlob(fetchImplementation, init, preparationTree.get(PACKAGE_LOCK_PATH)!)
    validatePackageLockVersionTransform(preparationLockBytes, candidateLockBytes)
    const bindingEntry = candidateTree.get(BINDING_PATH)!
    const workflowEntry = candidateTree.get(WORKFLOW_PATH)!
    const bindingBytes = await loadStableTreeBlob(fetchImplementation, init, bindingEntry)
    const realmBinding = await validateBinding(bindingBytes, armed, snapshot.bindingRequestId)
    const workflowBytes = await loadStableTreeBlob(fetchImplementation, init, workflowEntry)
    validateRecoveryWorkflowSource(workflowBytes)

    const source = await json(
      fetchImplementation,
      `${API}/actions/runs/${sourceVerifyRunId}/attempts/${sourceVerifyRunAttempt}`,
      init,
      'RECOVERY_GITHUB_EVIDENCE_INVALID', 200,
      ['id', 'run_attempt', 'workflow_id', '/repository/id', '/repository/owner/id', '/head_repository/id'],
    )
    validateSourceVerify(source, sourceVerifyRunId, sourceVerifyRunAttempt, candidateCommit, identity.pagesRunId as string)

    const artifactName = `github-pages-recovery-${identity.pagesRunId as string}-${identity.pagesRunAttempt as string}`
    const listUrl = `${API}/actions/runs/${identity.pagesRunId as string}/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100&page=1`
    const listed = await jsonWithMetadata(fetchImplementation, listUrl, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, [
      '/artifacts/*/id', '/artifacts/*/workflow_run/id',
      '/artifacts/*/workflow_run/repository_id', '/artifacts/*/workflow_run/head_repository_id',
    ])
    if (listed.link !== null || listed.value.total_count !== 1 || !Array.isArray(listed.value.artifacts) || listed.value.artifacts.length !== 1) {
      githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
    const listedArtifact = artifactProjection(objectValue(listed.value.artifacts[0]), artifactId, artifactName, identity.pagesRunId as string, candidateCommit)
    const direct = await loadStableArtifact(fetchImplementation, init, artifactId, artifactName, identity.pagesRunId as string, candidateCommit)
    if (!sameArtifact(listedArtifact, direct.projection)) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')

    const archiveResponse = await githubRedirect(fetchImplementation, direct.projection.archiveUrl, `Bearer ${token}`)
    let archive: Awaited<ReturnType<typeof inspectPagesArtifact>>
    try {
      archive = await inspectPagesArtifact(archiveResponse, {
        candidateCommit,
        candidateTree: candidate.tree,
        recoveryAuthorizationCoreSha256: armed.recoveryAuthorizationCoreSha256 as string,
        sourceClosureProfile: armed.sourceClosureProfile as string,
        sourceClosureSha256: armed.sourceClosureSha256 as string,
      }, undefined, { archiveByteLength: direct.projection.size })
    } catch {
      githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
    if (direct.projection.digest !== `sha256:${archive.githubArtifactArchiveSha256}`) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const githubMetadata: GitHubEvidenceMetadata = Object.freeze({
      repository: GITHUB_REPOSITORY,
      repositoryId: REPOSITORY_ID,
      repositoryOwnerId: REPOSITORY_OWNER_ID,
      candidateCommit,
      candidateTree: candidate.tree,
      parentCommit: candidate.parent,
      preparationTree: preparation.tree,
      artifactId,
      artifactName,
      pagesRunId: identity.pagesRunId as string,
      pagesRunAttempt: identity.pagesRunAttempt as string,
      artifactSize: direct.projection.size,
      artifactDigest: direct.projection.digest,
      artifactUrl: direct.projection.url,
      artifactArchiveUrl: direct.projection.archiveUrl,
      artifactNodeId: direct.projection.nodeId,
      artifactCreatedAt: direct.projection.createdAt,
      artifactExpiresAt: direct.projection.expiresAt,
      artifactEtag: direct.etag,
      githubArtifactArchiveSha256: archive.githubArtifactArchiveSha256,
    })
    return Object.freeze({
      currentMainCommit: candidateCommit,
      parentCommit: candidate.parent,
      candidateTree: candidate.tree,
      recoveryBindingBytes: Uint8Array.from(bindingBytes),
      realmBinding,
      protectedWorkflowBytes: Uint8Array.from(workflowBytes),
      sourceClosureSha256: armed.sourceClosureSha256 as string,
      sourceVerifyRunId,
      sourceVerifyRunAttempt,
      pagesArtifactId: artifactId,
      pagesArtifactName: artifactName,
      githubArtifactArchiveSha256: archive.githubArtifactArchiveSha256,
      innerArtifactTarSha256: archive.innerArtifactTarSha256,
      contentManifestSha256: archive.contentManifestSha256,
      deploymentAttestationSha256: archive.deploymentAttestationSha256,
      githubMetadata,
      githubMetadataSha256: await githubEvidenceMetadataSha256(githubMetadata),
    })
  } catch (error) {
    if (error instanceof RecoveryGitHubError) throw error
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}

export async function recheckGitHubEvidenceMetadata(input: Readonly<{
  githubMetadata: GitHubEvidenceMetadata
  githubMetadataSha256: string
  environment: GitHubAppEnvironment
  fetch: typeof fetch
}>): Promise<void> {
  try {
    const snapshot = snapshotExactDataObject(
      input,
      ['githubMetadata', 'githubMetadataSha256', 'environment', 'fetch'],
      'RECOVERY_GITHUB_EVIDENCE_INVALID',
    )
    if (!sha(snapshot.githubMetadataSha256) || typeof snapshot.fetch !== 'function') githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const metadata = snapshotGitHubEvidenceMetadata(snapshot.githubMetadata)
    if (await githubEvidenceMetadataSha256(metadata) !== snapshot.githubMetadataSha256) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    if (
      metadata.artifactDigest !== `sha256:${metadata.githubArtifactArchiveSha256}`
      || metadata.artifactName !== `github-pages-recovery-${metadata.pagesRunId}-${metadata.pagesRunAttempt}`
    ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const fetchImplementation = snapshot.fetch as typeof fetch
    const token = await mintGitHubInstallationToken(
      snapshot.environment as GitHubAppEnvironment,
      fetchImplementation,
      Math.floor(Date.now() / 1_000),
    )
    const init = { headers: githubHeaders(token) }
    const repository = await json(fetchImplementation, API, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID', 200, ['id', '/owner/id'])
    validateRepository(repository)
    const branch = await json(fetchImplementation, `${API}/branches/main`, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
    validateBranch(branch, metadata.candidateCommit)
    const candidateValue = await json(fetchImplementation, `${API}/git/commits/${metadata.candidateCommit}`, init, 'RECOVERY_GITHUB_EVIDENCE_INVALID')
    const candidate = validateCommit(candidateValue, metadata.candidateCommit)
    if (
      candidate.tree !== metadata.candidateTree
      || candidate.parent !== metadata.parentCommit
    ) githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    const artifact = await loadStableArtifact(
      fetchImplementation,
      init,
      metadata.artifactId,
      metadata.artifactName,
      metadata.pagesRunId,
      metadata.candidateCommit,
    )
    const expected: ArtifactProjection = Object.freeze({
      id: metadata.artifactId,
      name: metadata.artifactName,
      size: metadata.artifactSize,
      url: metadata.artifactUrl,
      archiveUrl: metadata.artifactArchiveUrl,
      nodeId: metadata.artifactNodeId,
      createdAt: metadata.artifactCreatedAt,
      expiresAt: metadata.artifactExpiresAt,
      digest: metadata.artifactDigest,
      runId: metadata.pagesRunId,
      repositoryId: metadata.repositoryId,
      headRepositoryId: metadata.repositoryId,
      headBranch: 'main',
      headSha: metadata.candidateCommit,
    })
    if (!sameArtifact(artifact.projection, expected) || artifact.etag !== metadata.artifactEtag) {
      githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
    }
  } catch (error) {
    if (error instanceof RecoveryGitHubError) throw error
    githubFail('RECOVERY_GITHUB_EVIDENCE_INVALID')
  }
}
