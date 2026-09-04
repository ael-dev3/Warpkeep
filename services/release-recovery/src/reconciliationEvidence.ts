import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { parseDocument } from 'yaml'

import {
  GITHUB_REPOSITORY,
  type GitHubAppEnvironment,
  commit,
  positive,
  sha,
  snapshotExactDataObject,
} from './config.js'
import { mintGitHubInstallationToken } from './githubEvidence.js'
import {
  githubEvidenceMetadataSha256,
  snapshotGitHubEvidenceMetadata,
  type GitHubEvidenceMetadata,
} from './githubEvidenceMetadata.js'
import {
  bounded,
  jsonWithMetadata,
  parseGitHubJsonObject,
  type GitHubJsonObject,
  type GitHubJsonResponse,
  type GitHubJsonValue,
} from './http.js'
import {
  RECOVERY_CLAIM_DEADLINE_SECONDS_V2,
  RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS_V2,
  RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS_V2,
  type LedgerSignerClaimProjection,
  type LedgerV2AuthorizationSnapshot,
  type LedgerV2ClaimSnapshot,
  type LedgerV2ReconciliationProof,
} from './ledgerV2.js'

const API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`
const REPOSITORY_ID = '1273513252'
const REPOSITORY_OWNER_ID = '183124839'
const WORKFLOW_PATH = '.github/workflows/deploy-pages.yml'
const PUBLIC_ATTESTATION_URL =
  'https://warpkeep.com/.well-known/warpkeep-deployment-v1.json'
const DEPLOY_JOB = 'deploy-recovery'
const DEPLOY_STEP = 'Deploy recovery-authorized release to GitHub Pages'
const DEPLOY_ACTION =
  'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128'
const RECOVERY_ARTIFACT_EXPRESSION =
  'github-pages-recovery-${{ github.run_id }}-${{ github.run_attempt }}'
const ERROR_CODE = 'RECOVERY_RECONCILIATION_EVIDENCE_INVALID'
const MAX_WORKFLOW_BYTES = 1024 * 1024
const MAX_RUN_BYTES = 512 * 1024
const MAX_JOBS_BYTES = 1024 * 1024
const MAX_PAGES_BYTES = 16 * 1024
const MAX_ATTESTATION_BYTES = 16 * 1024
const HTTP_TIMEOUT_MS = 10_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const JSON_MEDIA_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/iu
const utf8 = new TextDecoder('utf-8', { fatal: true })
const text = new TextEncoder()

const AUTHORIZATION_KEYS = Object.freeze([
  'locators',
  'workflowIdentity',
  'authorizationJti',
  'authorizationEpoch',
  'issuedAt',
  'notBefore',
  'expiresAt',
  'issuanceEvidenceSnapshotDigest',
  'liveInvariantDigest',
  'candidateTree',
  'artifactName',
  'githubArtifactArchiveSha256',
  'innerArtifactTarSha256',
  'contentManifestSha256',
  'deploymentAttestationSha256',
  'operation',
  'canonicalOrigin',
  'githubMetadata',
  'githubMetadataSha256',
] as const)

const CLAIM_KEYS = Object.freeze([
  'claimSnapshotDigest',
  'claimLiveInvariantDigest',
  'claimSequence',
  'claimedAt',
  'claimDeadline',
] as const)

const RUN_KEYS = Object.freeze([
  'id', 'name', 'node_id', 'head_branch', 'head_sha', 'path', 'display_title',
  'run_number', 'event', 'status', 'conclusion', 'workflow_id', 'check_suite_id',
  'check_suite_node_id', 'url', 'html_url', 'pull_requests', 'created_at',
  'updated_at', 'actor', 'triggering_actor', 'run_attempt',
  'referenced_workflows', 'run_started_at', 'jobs_url', 'logs_url',
  'check_suite_url', 'artifacts_url', 'cancel_url', 'rerun_url',
  'previous_attempt_url', 'workflow_url', 'head_commit', 'repository',
  'head_repository',
] as const)

const JOB_KEYS = Object.freeze([
  'id', 'run_id', 'workflow_name', 'head_branch', 'run_url', 'run_attempt',
  'node_id', 'head_sha', 'url', 'html_url', 'status', 'conclusion',
  'created_at', 'started_at', 'completed_at', 'name', 'steps',
  'check_run_url', 'labels', 'runner_id', 'runner_name', 'runner_group_id',
  'runner_group_name',
] as const)

const STEP_KEYS = Object.freeze([
  'name', 'status', 'conclusion', 'number', 'started_at', 'completed_at',
] as const)

const ATTESTATION_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'candidateCommit',
  'candidateTree',
  'recoveryAuthorizationCoreSha256',
  'sourceClosureProfile',
  'sourceClosureSha256',
  'releaseVersion',
  'canonicalOrigin',
  'contentManifestSha256',
] as const)

const AMBIGUOUS: Readonly<{ outcome: 'ambiguous' }> = Object.freeze({ outcome: 'ambiguous' })

export type DeploymentReconciliationProofReader = (
  projection: LedgerSignerClaimProjection,
) => Promise<LedgerV2ReconciliationProof>

export type DeploymentReconciliationProofReaderInput = Readonly<{
  githubApp: GitHubAppEnvironment
  fetch: typeof globalThis.fetch
}>

export type DeploymentReconciliationProofReaderFactory = (
  input: DeploymentReconciliationProofReaderInput,
) => DeploymentReconciliationProofReader

type ProjectionSnapshot = Readonly<{
  requestId: string
  authorization: LedgerV2AuthorizationSnapshot
  authorizationJwsSha256: string
  claim: LedgerV2ClaimSnapshot
  rowBindingDigest: string
  revision: number
}>

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

type StepDisposition = 'success' | 'unstarted' | 'ambiguous'
type PagesDisposition = 'succeed' | 'absent' | 'ambiguous'

function exactKeySet(value: GitHubJsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length
    && actual.every(key => keys.includes(key))
}

function objectValue(value: GitHubJsonValue | undefined): GitHubJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(ERROR_CODE)
  return value as GitHubJsonObject
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index])
}

function validInstant(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) return false
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return false
  const canonical = new Date(parsed).toISOString()
  return value.includes('.') ? canonical === value : canonical.replace('.000Z', 'Z') === value
}

function validUnixSecond(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function nonnegative(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value)
}

function nonemptyString(value: unknown, maximum = 4_096): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && !/[\0\r\n]/u.test(value)
}

const TERMINAL_CONCLUSIONS = Object.freeze(new Set([
  'success', 'failure', 'cancelled', 'timed_out', 'action_required', 'stale',
  'skipped', 'startup_failure', 'neutral',
]))

function terminalConclusion(value: unknown): value is string {
  return typeof value === 'string' && TERMINAL_CONCLUSIONS.has(value)
}

function validateActor(value: GitHubJsonValue | undefined): void {
  const actor = objectValue(value)
  if (
    !exactKeySet(actor, ['login', 'id', 'type'])
    || !nonemptyString(actor.login, 256)
    || !positive(actor.id)
    || !nonemptyString(actor.type, 64)
  ) throw new Error(ERROR_CODE)
}

function validateCommitActor(value: GitHubJsonValue | undefined): void {
  const actor = objectValue(value)
  if (
    !exactKeySet(actor, ['name', 'email'])
    || !nonemptyString(actor.name, 1_024)
    || !nonemptyString(actor.email, 1_024)
  ) throw new Error(ERROR_CODE)
}

function copyGitHubApp(value: unknown): GitHubAppEnvironment {
  const source = snapshotExactDataObject(
    value,
    ['GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY_PEM'],
    ERROR_CODE,
  )
  if (
    !positive(source.GITHUB_APP_ID)
    || !positive(source.GITHUB_APP_INSTALLATION_ID)
    || typeof source.GITHUB_APP_PRIVATE_KEY_PEM !== 'string'
    || source.GITHUB_APP_PRIVATE_KEY_PEM.length < 64
    || source.GITHUB_APP_PRIVATE_KEY_PEM.length > 32_768
  ) throw new Error(ERROR_CODE)
  return Object.freeze({
    GITHUB_APP_ID: source.GITHUB_APP_ID,
    GITHUB_APP_INSTALLATION_ID: source.GITHUB_APP_INSTALLATION_ID,
    GITHUB_APP_PRIVATE_KEY_PEM: source.GITHUB_APP_PRIVATE_KEY_PEM,
  })
}

function snapshotProjection(value: unknown): ProjectionSnapshot {
  const source = snapshotExactDataObject(value, [
    'state', 'requestId', 'authorization', 'authorizationJwsSha256', 'claim',
    'rowBindingDigest', 'revision',
  ], ERROR_CODE)
  if (
    source.state !== 'reconciliation-required'
    || typeof source.requestId !== 'string'
    || !UUID.test(source.requestId)
    || !sha(source.authorizationJwsSha256)
    || !sha(source.rowBindingDigest)
    || !Number.isSafeInteger(source.revision)
    || (source.revision as number) < 1
  ) throw new Error(ERROR_CODE)

  const authorizationSource = snapshotExactDataObject(
    source.authorization, AUTHORIZATION_KEYS, ERROR_CODE,
  )
  const locatorsSource = snapshotExactDataObject(
    authorizationSource.locators,
    RECOVERY_LEDGER_REQUEST_LOCATOR_KEYS_V2,
    ERROR_CODE,
  )
  const identitySource = snapshotExactDataObject(
    authorizationSource.workflowIdentity,
    RECOVERY_LEDGER_STABLE_WORKFLOW_IDENTITY_KEYS_V2,
    ERROR_CODE,
  )
  const claimSource = snapshotExactDataObject(source.claim, CLAIM_KEYS, ERROR_CODE)
  const metadata = snapshotGitHubEvidenceMetadata(authorizationSource.githubMetadata)

  if (
    locatorsSource.requestId !== source.requestId
    || !commit(locatorsSource.candidateCommit)
    || !positive(locatorsSource.sourceVerifyRunId)
    || !positive(locatorsSource.sourceVerifyRunAttempt)
    || !positive(locatorsSource.artifactId)
    || identitySource.repository !== GITHUB_REPOSITORY
    || identitySource.repositoryId !== REPOSITORY_ID
    || identitySource.repositoryOwnerId !== REPOSITORY_OWNER_ID
    || identitySource.ref !== 'refs/heads/main'
    || identitySource.workflowRef !== `${GITHUB_REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`
    || identitySource.environment !== 'github-pages'
    || identitySource.eventName !== 'workflow_run'
    || identitySource.workflowSha !== locatorsSource.candidateCommit
    || !positive(identitySource.pagesRunId)
    || !positive(identitySource.pagesRunAttempt)
    || !positive(identitySource.checkRunId)
    || typeof authorizationSource.authorizationJti !== 'string'
    || !UUID.test(authorizationSource.authorizationJti)
    || !Number.isSafeInteger(authorizationSource.authorizationEpoch)
    || (authorizationSource.authorizationEpoch as number) < 1
    || !validUnixSecond(authorizationSource.issuedAt)
    || !validUnixSecond(authorizationSource.notBefore)
    || !validUnixSecond(authorizationSource.expiresAt)
    || (authorizationSource.issuedAt as number) > (authorizationSource.notBefore as number)
    || (authorizationSource.notBefore as number) >= (authorizationSource.expiresAt as number)
    || !sha(authorizationSource.issuanceEvidenceSnapshotDigest)
    || !sha(authorizationSource.liveInvariantDigest)
    || !commit(authorizationSource.candidateTree)
    || typeof authorizationSource.artifactName !== 'string'
    || !sha(authorizationSource.githubArtifactArchiveSha256)
    || !sha(authorizationSource.innerArtifactTarSha256)
    || !sha(authorizationSource.contentManifestSha256)
    || !sha(authorizationSource.deploymentAttestationSha256)
    || authorizationSource.operation !== 'github-pages-production-deploy'
    || authorizationSource.canonicalOrigin !== 'https://warpkeep.com'
    || !sha(authorizationSource.githubMetadataSha256)
    || !sha(claimSource.claimSnapshotDigest)
    || !sha(claimSource.claimLiveInvariantDigest)
    || claimSource.claimSequence !== 1
    || !validUnixSecond(claimSource.claimedAt)
    || !validUnixSecond(claimSource.claimDeadline)
    || claimSource.claimDeadline !== claimSource.claimedAt + RECOVERY_CLAIM_DEADLINE_SECONDS_V2
    || claimSource.claimedAt >= (authorizationSource.expiresAt as number)
    || claimSource.claimLiveInvariantDigest !== authorizationSource.liveInvariantDigest
    || Date.now() < (claimSource.claimDeadline as number) * 1_000
    || metadata.repository !== GITHUB_REPOSITORY
    || metadata.repositoryId !== REPOSITORY_ID
    || metadata.repositoryOwnerId !== REPOSITORY_OWNER_ID
    || metadata.candidateCommit !== locatorsSource.candidateCommit
    || metadata.candidateTree !== authorizationSource.candidateTree
    || metadata.artifactId !== locatorsSource.artifactId
    || metadata.artifactName !== authorizationSource.artifactName
    || metadata.pagesRunId !== identitySource.pagesRunId
    || metadata.pagesRunAttempt !== identitySource.pagesRunAttempt
    || metadata.githubArtifactArchiveSha256 !== authorizationSource.githubArtifactArchiveSha256
    || metadata.artifactDigest !== `sha256:${authorizationSource.githubArtifactArchiveSha256}`
    || metadata.artifactName !== `github-pages-recovery-${identitySource.pagesRunId}-${identitySource.pagesRunAttempt}`
    || !nonemptyString(metadata.artifactEtag)
  ) throw new Error(ERROR_CODE)

  const locators = Object.freeze({ ...locatorsSource })
  const workflowIdentity = Object.freeze({ ...identitySource })
  const authorization = Object.freeze({
    ...authorizationSource,
    locators,
    workflowIdentity,
    githubMetadata: metadata,
  }) as LedgerV2AuthorizationSnapshot
  const claim = Object.freeze({ ...claimSource }) as LedgerV2ClaimSnapshot
  return Object.freeze({
    requestId: source.requestId,
    authorization,
    authorizationJwsSha256: source.authorizationJwsSha256,
    claim,
    rowBindingDigest: source.rowBindingDigest,
    revision: source.revision as number,
  })
}

function authenticatedHeaders(token: string): HeadersInit {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  }
}

function stable(first: GitHubJsonResponse, second: GitHubJsonResponse): GitHubJsonObject {
  if (
    first.etag === null
    || first.etag.length < 1
    || first.etag !== second.etag
    || first.link !== null
    || second.link !== null
    || !sameBytes(first.bytes, second.bytes)
  ) throw new Error(ERROR_CODE)
  return first.value
}

function validateRepository(value: GitHubJsonObject): void {
  const owner = objectValue(value.owner)
  if (
    value.id !== REPOSITORY_ID
    || value.name !== 'Warpkeep'
    || value.full_name !== GITHUB_REPOSITORY
    || value.default_branch !== 'main'
    || value.archived !== false
    || value.disabled !== false
    || owner.id !== REPOSITORY_OWNER_ID
    || owner.login !== 'ael-dev3'
  ) throw new Error(ERROR_CODE)
}

function validateBranch(value: GitHubJsonObject, candidate: string): void {
  const branchCommit = objectValue(value.commit)
  if (value.name !== 'main' || value.protected !== true || branchCommit.sha !== candidate) {
    throw new Error(ERROR_CODE)
  }
}

function validateCommit(value: GitHubJsonObject, metadata: GitHubEvidenceMetadata): void {
  const treeValue = objectValue(value.tree)
  if (
    value.sha !== metadata.candidateCommit
    || treeValue.sha !== metadata.candidateTree
    || !Array.isArray(value.parents)
    || value.parents.length !== 1
    || objectValue(value.parents[0]).sha !== metadata.parentCommit
  ) throw new Error(ERROR_CODE)
}

function artifactProjection(
  value: GitHubJsonObject,
  metadata: GitHubEvidenceMetadata,
): ArtifactProjection {
  const run = objectValue(value.workflow_run)
  if (
    !exactKeySet(value, [
      'id', 'name', 'node_id', 'size_in_bytes', 'url',
      'archive_download_url', 'expired', 'created_at', 'expires_at',
      'updated_at', 'digest', 'workflow_run',
    ])
    || value.id !== metadata.artifactId
    || value.name !== metadata.artifactName
    || !nonemptyString(value.node_id)
    || value.expired !== false
    || typeof value.size_in_bytes !== 'number'
    || !Number.isSafeInteger(value.size_in_bytes)
    || value.size_in_bytes < 1
    || value.url !== `${API}/actions/artifacts/${metadata.artifactId}`
    || value.archive_download_url !== `${API}/actions/artifacts/${metadata.artifactId}/zip`
    || !validInstant(value.created_at)
    || !validInstant(value.expires_at)
    || !validInstant(value.updated_at)
    || typeof value.digest !== 'string'
    || value.digest !== `sha256:${metadata.githubArtifactArchiveSha256}`
    || run.id !== metadata.pagesRunId
    || run.repository_id !== REPOSITORY_ID
    || run.head_repository_id !== REPOSITORY_ID
    || run.head_branch !== 'main'
    || run.head_sha !== metadata.candidateCommit
  ) throw new Error(ERROR_CODE)
  const created = Date.parse(value.created_at)
  const expires = Date.parse(value.expires_at)
  const updated = Date.parse(value.updated_at)
  if (
    created > Date.now()
    || created > updated
    || updated >= expires
    || created >= expires
    || expires <= Date.now()
  ) throw new Error(ERROR_CODE)
  return Object.freeze({
    id: metadata.artifactId,
    name: metadata.artifactName,
    size: value.size_in_bytes,
    url: value.url,
    archiveUrl: value.archive_download_url,
    nodeId: value.node_id,
    createdAt: value.created_at,
    expiresAt: value.expires_at,
    digest: value.digest,
    runId: metadata.pagesRunId,
    repositoryId: REPOSITORY_ID,
    headRepositoryId: REPOSITORY_ID,
    headBranch: 'main',
    headSha: metadata.candidateCommit,
  })
}

function expectedArtifact(metadata: GitHubEvidenceMetadata): ArtifactProjection {
  return Object.freeze({
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
}

async function recheckMetadata(
  fetchImplementation: typeof globalThis.fetch,
  init: RequestInit,
  projection: ProjectionSnapshot,
): Promise<void> {
  const metadata = projection.authorization.githubMetadata
  if (await githubEvidenceMetadataSha256(metadata) !== projection.authorization.githubMetadataSha256) {
    throw new Error(ERROR_CODE)
  }
  const firstRepository = await jsonWithMetadata(
    fetchImplementation, API, init, ERROR_CODE, 200, ['id', '/owner/id'],
  )
  const secondRepository = await jsonWithMetadata(
    fetchImplementation, API, init, ERROR_CODE, 200, ['id', '/owner/id'],
  )
  validateRepository(stable(firstRepository, secondRepository))
  const firstBranch = await jsonWithMetadata(
    fetchImplementation, `${API}/branches/main`, init, ERROR_CODE,
  )
  const secondBranch = await jsonWithMetadata(
    fetchImplementation, `${API}/branches/main`, init, ERROR_CODE,
  )
  validateBranch(stable(firstBranch, secondBranch), metadata.candidateCommit)
  const firstCandidate = await jsonWithMetadata(
    fetchImplementation,
    `${API}/git/commits/${metadata.candidateCommit}`,
    init,
    ERROR_CODE,
  )
  const secondCandidate = await jsonWithMetadata(
    fetchImplementation,
    `${API}/git/commits/${metadata.candidateCommit}`,
    init,
    ERROR_CODE,
  )
  validateCommit(stable(firstCandidate, secondCandidate), metadata)

  const artifactUrl = `${API}/actions/artifacts/${metadata.artifactId}`
  const artifactFields = [
    'id', '/workflow_run/id', '/workflow_run/repository_id',
    '/workflow_run/head_repository_id',
  ]
  const first = await jsonWithMetadata(
    fetchImplementation, artifactUrl, init, ERROR_CODE, 200, artifactFields,
  )
  const second = await jsonWithMetadata(
    fetchImplementation, artifactUrl, init, ERROR_CODE, 200, artifactFields,
  )
  const actual = artifactProjection(stable(first, second), metadata)
  if (JSON.stringify(actual) !== JSON.stringify(expectedArtifact(metadata)) || first.etag !== metadata.artifactEtag) {
    throw new Error(ERROR_CODE)
  }
}

function canonicalBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  const encoded = btoa(binary)
  const lines = encoded.match(/.{1,60}/gu)
  return lines === null ? '' : `${lines.join('\n')}\n`
}

function decodeCanonicalBase64(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > 2 * MAX_WORKFLOW_BYTES) throw new Error(ERROR_CODE)
  let binary: string
  try {
    binary = atob(value.replace(/\n/gu, ''))
  } catch {
    throw new Error(ERROR_CODE)
  }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (bytes.byteLength > MAX_WORKFLOW_BYTES || canonicalBase64(bytes) !== value) throw new Error(ERROR_CODE)
  return bytes
}

async function gitBlobSha1(bytes: Uint8Array): Promise<string> {
  const prefix = text.encode(`blob ${bytes.byteLength}\0`)
  const input = new Uint8Array(prefix.byteLength + bytes.byteLength)
  input.set(prefix)
  input.set(bytes, prefix.byteLength)
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', input))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

function validateWorkflowSource(bytes: Uint8Array): void {
  let source: string
  try {
    source = utf8.decode(bytes)
  } catch {
    throw new Error(ERROR_CODE)
  }
  if (/\t|\r(?!\n)|[\0\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(source)) throw new Error(ERROR_CODE)
  try {
    const document = parseDocument(source, {
      schema: 'core', strict: true, uniqueKeys: true, prettyErrors: false,
    })
    if (document.errors.length !== 0 || document.warnings.length !== 0) throw new Error(ERROR_CODE)
    const root = document.toJS({ maxAliasCount: 0 }) as unknown
    if (root === null || typeof root !== 'object' || Array.isArray(root)) throw new Error(ERROR_CODE)
    const rootObject = root as Record<string, unknown>
    const jobs = rootObject.jobs
    if (rootObject.name !== 'Deploy GitHub Pages' || jobs === null || typeof jobs !== 'object' || Array.isArray(jobs)) {
      throw new Error(ERROR_CODE)
    }
    const recovery = (jobs as Record<string, unknown>)[DEPLOY_JOB]
    if (recovery === null || typeof recovery !== 'object' || Array.isArray(recovery)) throw new Error(ERROR_CODE)
    const recoveryObject = recovery as Record<string, unknown>
    const environment = recoveryObject.environment
    if (
      recoveryObject['runs-on'] !== 'ubuntu-latest'
      || environment === null
      || typeof environment !== 'object'
      || Array.isArray(environment)
      || (environment as Record<string, unknown>).name !== 'github-pages'
      || !Array.isArray(recoveryObject.steps)
      || recoveryObject.steps.length < 1
      || recoveryObject.steps.length > 100
    ) throw new Error(ERROR_CODE)
    const stepObjects = recoveryObject.steps.filter(
      value => value !== null && typeof value === 'object' && !Array.isArray(value),
    ) as Record<string, unknown>[]
    if (stepObjects.length !== recoveryObject.steps.length) throw new Error(ERROR_CODE)
    const named = stepObjects.filter(value => value.name === DEPLOY_STEP)
    const action = stepObjects.filter(value => value.uses === DEPLOY_ACTION)
    if (named.length !== 1 || action.length !== 1 || named[0] !== action[0]) throw new Error(ERROR_CODE)
    const deploy = named[0]!
    const withValue = deploy.with
    if (
      deploy.id !== 'deployment'
      || withValue === null
      || typeof withValue !== 'object'
      || Array.isArray(withValue)
      || Reflect.ownKeys(withValue).length !== 1
      || (withValue as Record<string, unknown>).artifact_name !== RECOVERY_ARTIFACT_EXPRESSION
    ) throw new Error(ERROR_CODE)
  } catch {
    throw new Error(ERROR_CODE)
  }
}

async function loadWorkflow(
  fetchImplementation: typeof globalThis.fetch,
  init: RequestInit,
  candidate: string,
): Promise<void> {
  const url = `${API}/contents/${WORKFLOW_PATH}?ref=${candidate}`
  const first = await jsonWithMetadata(
    fetchImplementation, url, init, ERROR_CODE, 200, [], 2 * MAX_WORKFLOW_BYTES,
  )
  const second = await jsonWithMetadata(
    fetchImplementation, url, init, ERROR_CODE, 200, [], 2 * MAX_WORKFLOW_BYTES,
  )
  const value = stable(first, second)
  const keys = [
    'type', 'encoding', 'size', 'name', 'path', 'content', 'sha', 'url',
    'git_url', 'html_url', 'download_url', '_links',
  ]
  if (!exactKeySet(value, keys)) throw new Error(ERROR_CODE)
  const bytes = decodeCanonicalBase64(value.content)
  if (
    value.type !== 'file'
    || value.encoding !== 'base64'
    || value.size !== bytes.byteLength
    || value.name !== 'deploy-pages.yml'
    || value.path !== WORKFLOW_PATH
    || !commit(value.sha)
    || value.url !== url
  ) throw new Error(ERROR_CODE)
  const blobSha = await gitBlobSha1(bytes)
  const gitUrl = `${API}/git/blobs/${blobSha}`
  const htmlUrl = `https://github.com/${GITHUB_REPOSITORY}/blob/${candidate}/${WORKFLOW_PATH}`
  const downloadUrl = `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${candidate}/${WORKFLOW_PATH}`
  const links = objectValue(value._links)
  if (
    value.sha !== blobSha
    || value.git_url !== gitUrl
    || value.html_url !== htmlUrl
    || value.download_url !== downloadUrl
    || !exactKeySet(links, ['self', 'git', 'html'])
    || links.self !== url
    || links.git !== gitUrl
    || links.html !== htmlUrl
  ) throw new Error(ERROR_CODE)
  validateWorkflowSource(bytes)
}

function validateRun(
  value: GitHubJsonObject,
  projection: ProjectionSnapshot,
): Readonly<{ terminal: boolean }> {
  if (!exactKeySet(value, RUN_KEYS)) throw new Error(ERROR_CODE)
  const identity = projection.authorization.workflowIdentity
  const runId = identity.pagesRunId
  const runAttempt = identity.pagesRunAttempt
  const runUrl = `${API}/actions/runs/${runId}`
  const repository = objectValue(value.repository)
  const headRepository = objectValue(value.head_repository)
  const headCommit = objectValue(value.head_commit)
  const terminal = value.status === 'completed'
    && terminalConclusion(value.conclusion)
  const running = value.status === 'in_progress' && value.conclusion === null
  const createdAt = validInstant(value.created_at) ? Date.parse(value.created_at) : Number.NaN
  const startedAt = validInstant(value.run_started_at) ? Date.parse(value.run_started_at) : Number.NaN
  const updatedAt = validInstant(value.updated_at) ? Date.parse(value.updated_at) : Number.NaN
  validateActor(value.actor)
  validateActor(value.triggering_actor)
  validateCommitActor(headCommit.author)
  validateCommitActor(headCommit.committer)
  if (
    (!terminal && !running)
    || value.id !== runId
    || value.run_attempt !== runAttempt
    || value.name !== 'Deploy GitHub Pages'
    || value.display_title !== 'Deploy GitHub Pages'
    || value.path !== `${WORKFLOW_PATH}@main`
    || value.event !== 'workflow_run'
    || !nonemptyString(value.node_id)
    || !positive(value.run_number)
    || !nonemptyString(value.check_suite_node_id)
    || value.head_branch !== 'main'
    || value.head_sha !== projection.authorization.locators.candidateCommit
    || value.url !== runUrl
    || value.html_url !== `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${runId}`
    || value.jobs_url !== `${runUrl}/attempts/${runAttempt}/jobs`
    || value.logs_url !== `${runUrl}/logs`
    || value.artifacts_url !== `${runUrl}/artifacts`
    || value.cancel_url !== `${runUrl}/cancel`
    || value.rerun_url !== `${runUrl}/rerun`
    || !positive(value.workflow_id)
    || value.workflow_url !== `${API}/actions/workflows/${value.workflow_id}`
    || !positive(value.check_suite_id)
    || value.check_suite_url !== `${API}/check-suites/${value.check_suite_id}`
    || !Array.isArray(value.pull_requests)
    || value.pull_requests.length !== 0
    || !Array.isArray(value.referenced_workflows)
    || value.referenced_workflows.length !== 0
    || !Number.isFinite(createdAt)
    || !Number.isFinite(startedAt)
    || !Number.isFinite(updatedAt)
    || createdAt > startedAt
    || startedAt > updatedAt
    || value.previous_attempt_url !== null
    || !exactKeySet(headCommit, [
      'id', 'tree_id', 'message', 'timestamp', 'author', 'committer',
    ])
    || headCommit.id !== projection.authorization.locators.candidateCommit
    || headCommit.tree_id !== projection.authorization.candidateTree
    || typeof headCommit.message !== 'string'
    || headCommit.message.length < 1
    || headCommit.message.length > 64 * 1024
    || !validInstant(headCommit.timestamp)
    || !exactKeySet(repository, ['id', 'name', 'full_name'])
    || repository.id !== REPOSITORY_ID
    || repository.name !== 'Warpkeep'
    || repository.full_name !== GITHUB_REPOSITORY
    || !exactKeySet(headRepository, ['id', 'name', 'full_name'])
    || headRepository.id !== REPOSITORY_ID
    || headRepository.name !== 'Warpkeep'
    || headRepository.full_name !== GITHUB_REPOSITORY
  ) throw new Error(ERROR_CODE)
  return Object.freeze({ terminal })
}

function validateJobs(
  value: GitHubJsonObject,
  projection: ProjectionSnapshot,
): StepDisposition {
  if (!exactKeySet(value, ['total_count', 'jobs']) || !positive(value.total_count)) {
    throw new Error(ERROR_CODE)
  }
  if (!Array.isArray(value.jobs) || value.jobs.length > 100 || value.total_count !== String(value.jobs.length)) {
    throw new Error(ERROR_CODE)
  }
  const identity = projection.authorization.workflowIdentity
  const runUrl = `${API}/actions/runs/${identity.pagesRunId}`
  const seenJobs = new Set<string>()
  const named: GitHubJsonObject[] = []
  for (const rawJob of value.jobs) {
    const job = objectValue(rawJob)
    if (!exactKeySet(job, JOB_KEYS) || !positive(job.id) || seenJobs.has(job.id)) throw new Error(ERROR_CODE)
    seenJobs.add(job.id)
    const completed = job.status === 'completed' && terminalConclusion(job.conclusion)
    const active = (job.status === 'queued' || job.status === 'in_progress')
      && job.conclusion === null
    const createdAt = validInstant(job.created_at) ? Date.parse(job.created_at) : Number.NaN
    const startedAt = validInstant(job.started_at) ? Date.parse(job.started_at) : null
    const completedAt = validInstant(job.completed_at) ? Date.parse(job.completed_at) : null
    const runnerAbsent = job.runner_id === null
      && job.runner_name === null
      && job.runner_group_id === null
      && job.runner_group_name === null
    const runnerPresent = positive(job.runner_id)
      && nonemptyString(job.runner_name, 1_024)
      && nonnegative(job.runner_group_id)
      && nonemptyString(job.runner_group_name, 1_024)
    if (
      (!completed && !active)
      || !nonemptyString(job.node_id)
      || !nonemptyString(job.name, 1_024)
      || job.run_id !== identity.pagesRunId
      || job.workflow_name !== 'Deploy GitHub Pages'
      || job.head_branch !== 'main'
      || job.run_url !== runUrl
      || job.run_attempt !== identity.pagesRunAttempt
      || job.head_sha !== projection.authorization.locators.candidateCommit
      || job.url !== `${API}/actions/jobs/${job.id}`
      || job.html_url !== `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${identity.pagesRunId}/job/${job.id}`
      || job.check_run_url !== `${API}/check-runs/${job.id}`
      || !Array.isArray(job.labels)
      || job.labels.length > 100
      || job.labels.some(label => typeof label !== 'string')
      || !Array.isArray(job.steps)
      || job.steps.length > 100
      || !Number.isFinite(createdAt)
      || (startedAt !== null && createdAt > startedAt)
      || (job.status === 'in_progress' && (startedAt === null || completedAt !== null))
      || (job.status === 'queued' && (startedAt !== null || completedAt !== null))
      || (completed && (completedAt === null || (startedAt !== null && startedAt > completedAt)))
      || (!runnerAbsent && !runnerPresent)
    ) throw new Error(ERROR_CODE)
    if (job.name === DEPLOY_JOB) named.push(job)
  }
  if (named.length !== 1) throw new Error(ERROR_CODE)
  const job = named[0]!
  if (job.id !== identity.checkRunId || !Array.isArray(job.steps)) throw new Error(ERROR_CODE)
  const seenSteps = new Set<number>()
  const deploySteps: GitHubJsonObject[] = []
  for (const rawStep of job.steps) {
    const step = objectValue(rawStep)
    if (
      !exactKeySet(step, STEP_KEYS)
      || typeof step.number !== 'number'
      || !Number.isSafeInteger(step.number)
      || step.number < 1
      || seenSteps.has(step.number)
      || typeof step.name !== 'string'
    ) throw new Error(ERROR_CODE)
    const stepCompleted = step.status === 'completed' && terminalConclusion(step.conclusion)
    const stepActive = step.status === 'in_progress' && step.conclusion === null
    const stepQueued = step.status === 'queued' && step.conclusion === null
    const stepStarted = validInstant(step.started_at) ? Date.parse(step.started_at) : null
    const stepEnded = validInstant(step.completed_at) ? Date.parse(step.completed_at) : null
    if (
      (!stepCompleted && !stepActive && !stepQueued)
      || (stepActive && (stepStarted === null || stepEnded !== null))
      || (stepQueued && (stepStarted !== null || stepEnded !== null))
      || (stepCompleted && step.conclusion !== 'skipped' && (
        stepStarted === null || stepEnded === null || stepStarted > stepEnded
      ))
      || (stepCompleted && step.conclusion === 'skipped' && (
        (stepStarted === null) !== (stepEnded === null)
        || (stepStarted !== null && stepEnded !== null && stepStarted > stepEnded)
      ))
    ) throw new Error(ERROR_CODE)
    seenSteps.add(step.number)
    if (step.name === DEPLOY_STEP) deploySteps.push(step)
  }
  if (deploySteps.length !== 1) throw new Error(ERROR_CODE)
  const step = deploySteps[0]!
  if (
    step.status === 'completed'
    && step.conclusion === 'success'
    && validInstant(step.started_at)
    && validInstant(step.completed_at)
    && Date.parse(step.started_at) <= Date.parse(step.completed_at)
  ) return 'success'
  if (
    job.status === 'completed'
    && typeof job.conclusion === 'string'
    && step.status === 'completed'
    && step.conclusion === 'skipped'
    && step.started_at === null
    && step.completed_at === null
  ) return 'unstarted'
  return 'ambiguous'
}

async function loadRunAndJobs(
  fetchImplementation: typeof globalThis.fetch,
  init: RequestInit,
  projection: ProjectionSnapshot,
): Promise<Readonly<{ terminal: boolean; step: StepDisposition }>> {
  const identity = projection.authorization.workflowIdentity
  const attemptUrl = `${API}/actions/runs/${identity.pagesRunId}/attempts/${identity.pagesRunAttempt}`
  const runFields = [
    '/id', 'run_attempt', 'workflow_id', 'check_suite_id', 'run_number',
    '/actor/id', '/triggering_actor/id', '/repository/id', '/head_repository/id',
  ]
  const firstRun = await jsonWithMetadata(
    fetchImplementation, attemptUrl, init, ERROR_CODE, 200, runFields, MAX_RUN_BYTES,
  )
  const secondRun = await jsonWithMetadata(
    fetchImplementation, attemptUrl, init, ERROR_CODE, 200, runFields, MAX_RUN_BYTES,
  )
  const run = validateRun(stable(firstRun, secondRun), projection)

  const jobsUrl = `${attemptUrl}/jobs?per_page=100`
  const integerFields = [
    '/total_count', '/jobs/*/id', '/jobs/*/run_id', '/jobs/*/run_attempt',
  ]
  const nullableFields = ['/jobs/*/runner_id', '/jobs/*/runner_group_id']
  const firstJobs = await jsonWithMetadata(
    fetchImplementation, jobsUrl, init, ERROR_CODE, 200, integerFields, MAX_JOBS_BYTES,
    nullableFields,
  )
  const secondJobs = await jsonWithMetadata(
    fetchImplementation, jobsUrl, init, ERROR_CODE, 200, integerFields, MAX_JOBS_BYTES,
    nullableFields,
  )
  return Object.freeze({ terminal: run.terminal, step: validateJobs(stable(firstJobs, secondJobs), projection) })
}

function safeHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name)
  if (value !== null && (value.length > 4_096 || /[\0\r\n]/u.test(value))) throw new Error(ERROR_CODE)
  return value
}

type RawResponse = Readonly<{
  status: number
  bytes: Uint8Array
  etag: string | null
}>

async function fixedJsonBytes(
  fetchImplementation: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  allowedStatuses: readonly number[],
  limit: number,
): Promise<RawResponse> {
  const response = await fetchImplementation(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  if (
    !allowedStatuses.includes(response.status)
    || response.type === 'opaqueredirect'
    || response.url !== url
  ) throw new Error(ERROR_CODE)
  const contentType = safeHeader(response.headers, 'content-type')
  if (contentType === null || !JSON_MEDIA_TYPE.test(contentType)) throw new Error(ERROR_CODE)
  if (safeHeader(response.headers, 'link') !== null) throw new Error(ERROR_CODE)
  const bytes = await bounded(response, limit, ERROR_CODE, HTTP_TIMEOUT_MS)
  return Object.freeze({
    status: response.status,
    bytes: Uint8Array.from(bytes),
    etag: safeHeader(response.headers, 'etag'),
  })
}

function stableRaw(first: RawResponse, second: RawResponse): RawResponse {
  if (
    first.status !== second.status
    || first.etag === null
    || first.etag.length < 1
    || first.etag !== second.etag
    || !sameBytes(first.bytes, second.bytes)
  ) throw new Error(ERROR_CODE)
  return first
}

async function loadPagesDisposition(
  fetchImplementation: typeof globalThis.fetch,
  init: RequestInit,
  candidate: string,
): Promise<PagesDisposition> {
  const url = `${API}/pages/deployments/${candidate}`
  const first = await fixedJsonBytes(fetchImplementation, url, init, [200, 404], MAX_PAGES_BYTES)
  const second = await fixedJsonBytes(fetchImplementation, url, init, [200, 404], MAX_PAGES_BYTES)
  const response = stableRaw(first, second)
  let value: GitHubJsonObject
  try {
    value = parseGitHubJsonObject(response.bytes, ERROR_CODE, [])
  } catch {
    return 'ambiguous'
  }
  if (response.status === 200) {
    return Reflect.ownKeys(value).length === 1 && value.status === 'succeed'
      ? 'succeed'
      : 'ambiguous'
  }
  return Reflect.ownKeys(value).length === 1 && value.message === 'Not Found'
    ? 'absent'
    : 'ambiguous'
}

function validateAttestation(
  bytes: Uint8Array,
  projection: ProjectionSnapshot,
): boolean {
  try {
    const source = utf8.decode(bytes)
    const object = parseGitHubJsonObject(bytes, ERROR_CODE, [])
    if (
      Reflect.ownKeys(object).length !== ATTESTATION_KEYS.length
      || Object.keys(object).some((key, index) => key !== ATTESTATION_KEYS[index])
      || source !== JSON.stringify(object)
      || object.schemaVersion !== 1
      || object.profile !== 'warpkeep-deployment-attestation-v1'
      || object.candidateCommit !== projection.authorization.locators.candidateCommit
      || object.candidateTree !== projection.authorization.candidateTree
      || !sha(object.recoveryAuthorizationCoreSha256)
      || object.sourceClosureProfile !== 'warpkeep-0.4.0-recovery-source-closure-v1'
      || !sha(object.sourceClosureSha256)
      || object.releaseVersion !== '0.4.0'
      || object.canonicalOrigin !== projection.authorization.canonicalOrigin
      || object.contentManifestSha256 !== projection.authorization.contentManifestSha256
      || bytesToHex(sha256(bytes)) !== projection.authorization.deploymentAttestationSha256
    ) return false
    return true
  } catch {
    return false
  }
}

async function loadPublicAttestation(
  fetchImplementation: typeof globalThis.fetch,
  projection: ProjectionSnapshot,
): Promise<boolean> {
  const init: RequestInit = {
    headers: { accept: 'application/json' },
    credentials: 'omit',
  }
  const first = await fixedJsonBytes(
    fetchImplementation, PUBLIC_ATTESTATION_URL, init, [200], MAX_ATTESTATION_BYTES,
  )
  const second = await fixedJsonBytes(
    fetchImplementation, PUBLIC_ATTESTATION_URL, init, [200], MAX_ATTESTATION_BYTES,
  )
  return validateAttestation(stableRaw(first, second).bytes, projection)
}

async function readEvidence(
  projectionValue: LedgerSignerClaimProjection,
  githubApp: GitHubAppEnvironment,
  fetchImplementation: typeof globalThis.fetch,
): Promise<LedgerV2ReconciliationProof> {
  try {
    const projection = snapshotProjection(projectionValue)
    if (await githubEvidenceMetadataSha256(projection.authorization.githubMetadata)
      !== projection.authorization.githubMetadataSha256) return AMBIGUOUS

    const token = await mintGitHubInstallationToken(
      githubApp,
      fetchImplementation,
      Math.floor(Date.now() / 1_000),
    )
    const authenticatedInit: RequestInit = { headers: authenticatedHeaders(token) }
    await recheckMetadata(fetchImplementation, authenticatedInit, projection)
    await loadWorkflow(
      fetchImplementation,
      authenticatedInit,
      projection.authorization.locators.candidateCommit,
    )
    const run = await loadRunAndJobs(fetchImplementation, authenticatedInit, projection)
    const pages = await loadPagesDisposition(
      fetchImplementation,
      authenticatedInit,
      projection.authorization.locators.candidateCommit,
    )

    if (run.step === 'success' && pages === 'succeed') {
      if (!await loadPublicAttestation(fetchImplementation, projection)) return AMBIGUOUS
      return Object.freeze({
        outcome: 'completed',
        rowBindingDigest: projection.rowBindingDigest,
        deployStepConclusion: 'success',
        matchingPagesDeployment: true,
        deploymentAttestationMatches: true,
      })
    }
    if (run.terminal && run.step === 'unstarted' && pages === 'absent') {
      return Object.freeze({
        outcome: 'not-deployed',
        rowBindingDigest: projection.rowBindingDigest,
        authoritativeTerminalRun: true,
        pagesDeployStepStarted: false,
        matchingPagesDeploymentAbsent: true,
      })
    }
    return AMBIGUOUS
  } catch {
    return AMBIGUOUS
  }
}

export function createDeploymentReconciliationProofReader(
  input: DeploymentReconciliationProofReaderInput,
): DeploymentReconciliationProofReader {
  try {
    const source = snapshotExactDataObject(input, ['githubApp', 'fetch'], ERROR_CODE)
    const githubApp = copyGitHubApp(source.githubApp)
    if (typeof source.fetch !== 'function') throw new Error(ERROR_CODE)
    const suppliedFetch = source.fetch as typeof globalThis.fetch
    const noStoreFetch = ((request: RequestInfo | URL, init: RequestInit = {}) => suppliedFetch(request, {
      ...init,
      cache: 'no-store',
      redirect: 'manual',
    })) as typeof globalThis.fetch
    return async projection => await readEvidence(projection, githubApp, noStoreFetch)
  } catch {
    return async () => AMBIGUOUS
  }
}
