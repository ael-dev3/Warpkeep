import {
  GITHUB_OIDC_DISCOVERY_URL,
  GITHUB_OIDC_ISSUER,
  GITHUB_OIDC_JWKS_URL,
  GITHUB_RECOVERY_AUDIENCE,
  GITHUB_REPOSITORY,
  commit,
  githubFail,
  positive,
  snapshotExactDataObject,
} from './config.js'
import {
  json,
  parseGitHubJsonObject,
  type GitHubJsonObject,
  type GitHubJsonValue,
} from './http.js'
import {
  mintGitHubInstallationToken,
  type GitHubAppEnvironment,
} from './githubEvidence.js'
import { base64UrlEncode } from './protocol.js'

export type GitHubWorkflowIdentity = Readonly<{
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
  oidcJti: string
}>

const encoder = new TextEncoder()
const REQUIRED_CLAIMS = [
  'iss',
  'aud',
  'sub',
  'repository',
  'repository_id',
  'repository_owner_id',
  'ref',
  'sha',
  'ref_protected',
  'workflow',
  'workflow_ref',
  'workflow_sha',
  'environment',
  'event_name',
  'runner_environment',
  'check_run_id',
  'run_id',
  'run_attempt',
  'jti',
  'iat',
  'nbf',
  'exp',
] as const
const OPTIONAL_CLAIMS = [
  'actor',
  'actor_id',
  'base_ref',
  'environment_node_id',
  'enterprise',
  'enterprise_id',
  'head_ref',
  'issuer_scope',
  'job_workflow_ref',
  'job_workflow_sha',
  'ref_type',
  'repository_owner',
  'repository_visibility',
  'run_number',
] as const
const GITHUB_WORKFLOW_NAME = 'Deploy GitHub Pages'
const GITHUB_WORKFLOW_PATH = '.github/workflows/deploy-pages.yml'
const GITHUB_WORKFLOW_REF = `${GITHUB_REPOSITORY}/${GITHUB_WORKFLOW_PATH}@refs/heads/main`
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const DISCOVERY_REQUIRED_KEYS = ['issuer', 'jwks_uri'] as const
const DISCOVERY_OPTIONAL_ARRAY_KEYS = [
  'claims_supported',
  'id_token_signing_alg_values_supported',
  'response_types_supported',
  'subject_types_supported',
  'scopes_supported',
] as const

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  }
  try {
    const standard = value.replace(/-/gu, '+').replace(/_/gu, '/')
      + '='.repeat((4 - value.length % 4) % 4)
    const bytes = Uint8Array.from(atob(standard), part => part.charCodeAt(0))
    if (base64UrlEncode(bytes) !== value) githubFail('RECOVERY_GITHUB_OIDC_INVALID')
    return bytes
  } catch {
    githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  }
}

function exactKeys(
  value: GitHubJsonObject,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.hasOwn(value, key))
    && keys.every(key => allowed.has(key))
}

function objectValue(value: GitHubJsonValue | undefined, code: string): GitHubJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) githubFail(code)
  return value as GitHubJsonObject
}

function stringArray(
  value: GitHubJsonValue | undefined,
  code: string,
  maximumEntries = 256,
  maximumStringLength = 512,
): readonly string[] {
  if (
    !Array.isArray(value)
    || value.length < 1
    || value.length > maximumEntries
    || value.some(item => typeof item !== 'string' || item.length > maximumStringLength)
  ) githubFail(code)
  const strings = value as readonly string[]
  if (new Set(strings).size !== strings.length) githubFail(code)
  return strings
}

function assertDiscovery(value: GitHubJsonObject): void {
  const code = 'RECOVERY_GITHUB_OIDC_HTTP_INVALID'
  if (!exactKeys(value, DISCOVERY_REQUIRED_KEYS, DISCOVERY_OPTIONAL_ARRAY_KEYS)) githubFail(code)
  if (value.issuer !== GITHUB_OIDC_ISSUER || value.jwks_uri !== GITHUB_OIDC_JWKS_URL) {
    githubFail(code)
  }
  const allowedValues: Readonly<Partial<Record<string, ReadonlySet<string>>>> = {
    id_token_signing_alg_values_supported: new Set(['RS256']),
    response_types_supported: new Set(['id_token']),
    subject_types_supported: new Set(['public', 'pairwise']),
    scopes_supported: new Set(['openid']),
  }
  for (const key of DISCOVERY_OPTIONAL_ARRAY_KEYS) {
    if (value[key] === undefined) continue
    const entries = stringArray(value[key], code)
    const values = allowedValues[key]
    if (values !== undefined && entries.some(entry => !values.has(entry))) githubFail(code)
  }
  const algorithms = value.id_token_signing_alg_values_supported
  if (algorithms !== undefined && !stringArray(algorithms, code).includes('RS256')) githubFail(code)
}

function canonicalStandardBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  }
  try {
    const bytes = Uint8Array.from(atob(value), part => part.charCodeAt(0))
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    if (btoa(binary) !== value) githubFail('RECOVERY_GITHUB_OIDC_INVALID')
    return bytes
  } catch {
    githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  }
}

type ValidatedRsaJwk = Readonly<{ jwk: JsonWebKey; signatureLength: number; kid: string; x5t?: string }>

function safeRsaJwk(value: GitHubJsonValue): ValidatedRsaJwk {
  const code = 'RECOVERY_GITHUB_OIDC_INVALID'
  const key = objectValue(value, code)
  const allowed = ['kty', 'alg', 'use', 'kid', 'n', 'e', 'x5c', 'x5t', 'x5t#S256'] as const
  if (!exactKeys(key, ['kty', 'alg', 'use', 'kid', 'n', 'e'], allowed.slice(6))) {
    githubFail(code)
  }
  if (
    key.kty !== 'RSA'
    || key.alg !== 'RS256'
    || key.use !== 'sig'
    || typeof key.kid !== 'string'
    || !/^[A-Za-z0-9._:-]{1,256}$/u.test(key.kid)
    || typeof key.n !== 'string'
    || typeof key.e !== 'string'
  ) githubFail(code)
  const modulus = decodeBase64Url(key.n)
  const exponent = decodeBase64Url(key.e)
  let exponentValue = 0n
  for (const byte of exponent) exponentValue = exponentValue * 256n + BigInt(byte)
  if (
    modulus.length < 256
    || modulus.length > 1_024
    || modulus[0] === 0
    || (modulus[modulus.length - 1]! & 1) === 0
    || exponent.length < 1
    || exponent.length > 8
    || exponent[0] === 0
    || exponentValue < 3n
    || exponentValue % 2n === 0n
  ) githubFail(code)
  const thumbprintLengths = { x5t: 20, 'x5t#S256': 32 } as const
  for (const name of Object.keys(thumbprintLengths) as Array<keyof typeof thumbprintLengths>) {
    const thumbprint = key[name]
    if (thumbprint !== undefined && (
      typeof thumbprint !== 'string'
      || decodeBase64Url(thumbprint).length !== thumbprintLengths[name]
    )) githubFail(code)
  }
  if (key.x5c !== undefined) {
    const chain = stringArray(key.x5c, code, 8, 16_384)
    if (
      chain.length < 1
      || chain.length > 8
      || chain.some(certificate => {
        const bytes = canonicalStandardBase64(certificate)
        return bytes.length < 1 || bytes.length > 12_288
      })
    ) githubFail(code)
  }
  return {
    jwk: { kty: 'RSA', alg: 'RS256', use: 'sig', n: key.n, e: key.e },
    signatureLength: modulus.length,
    kid: key.kid,
    ...(typeof key.x5t === 'string' ? { x5t: key.x5t } : {}),
  }
}

function safeInteger(value: GitHubJsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function safeNonnegativeInteger(value: GitHubJsonValue | undefined): value is number {
  return safeInteger(value) && value >= 0
}

function boundedString(value: GitHubJsonValue | undefined, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum
}

function githubIdentifier(value: GitHubJsonValue | undefined): value is string {
  return positive(value)
    && value.length <= 20
    && BigInt(value) <= 18_446_744_073_709_551_615n
}

function validOptionalClaims(claims: GitHubJsonObject, candidateCommit: string): boolean {
  const actor = claims.actor
  const baseRef = claims.base_ref
  const environmentNodeId = claims.environment_node_id
  const enterprise = claims.enterprise
  const headRef = claims.head_ref
  const issuerScope = claims.issuer_scope
  return (
    (actor === undefined || (
      typeof actor === 'string'
      && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(actor)
    ))
    && (claims.actor_id === undefined || positive(claims.actor_id))
    && (baseRef === undefined || (
      boundedString(baseRef, 256)
      && (baseRef === '' || /^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(baseRef))
    ))
    && (environmentNodeId === undefined || (
      typeof environmentNodeId === 'string'
      && /^[A-Za-z0-9_-]{1,256}$/u.test(environmentNodeId)
    ))
    && (enterprise === undefined || (
      typeof enterprise === 'string'
      && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,254}[A-Za-z0-9])?$/u.test(enterprise)
    ))
    && (claims.enterprise_id === undefined || positive(claims.enterprise_id))
    && (headRef === undefined || (
      boundedString(headRef, 256)
      && (headRef === '' || /^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(headRef))
    ))
    && (issuerScope === undefined || (
      typeof issuerScope === 'string'
      && issuerScope.length >= 1
      && issuerScope.length <= 256
      && !/[\0-\x1f\x7f]/u.test(issuerScope)
    ))
    && (claims.job_workflow_ref === undefined || claims.job_workflow_ref === GITHUB_WORKFLOW_REF)
    && (claims.job_workflow_sha === undefined || claims.job_workflow_sha === candidateCommit)
    && (claims.ref_type === undefined || claims.ref_type === 'branch')
    && (claims.repository_owner === undefined || claims.repository_owner === 'ael-dev3')
    && (claims.repository_visibility === undefined || claims.repository_visibility === 'public')
    && (claims.run_number === undefined || positive(claims.run_number))
  )
}

function githubHeaders(token: string): HeadersInit {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  }
}

type CorrelatedCheck = Readonly<{
  nodeId: string
  detailsUrl: string
  suiteId: string
  suiteUrl: string
}>

function validateCheckRun(
  check: GitHubJsonObject,
  checkRunId: string,
  candidateCommit: string,
  checkUrl: string,
): CorrelatedCheck {
  const code = 'RECOVERY_GITHUB_OIDC_INVALID'
  const suite = objectValue(check.check_suite, code)
  const app = objectValue(check.app, code)
  if (
    check.id !== checkRunId
    || check.name !== 'deploy-recovery'
    || check.head_sha !== candidateCommit
    || check.url !== checkUrl
    || typeof check.node_id !== 'string'
    || !/^[A-Za-z0-9_-]{1,256}$/u.test(check.node_id)
    || !boundedString(check.html_url, 2_048)
    || check.html_url !== `https://github.com/${GITHUB_REPOSITORY}/runs/${checkRunId}`
    || !boundedString(check.details_url, 2_048)
    || check.details_url.length < 1
    || check.status !== 'in_progress'
    || check.conclusion !== null
    || !positive(suite.id)
    || suite.head_branch !== 'main'
    || suite.head_sha !== candidateCommit
    || suite.status !== 'in_progress'
    || suite.conclusion !== null
    || !boundedString(suite.url, 2_048)
    || suite.url !== `https://api.github.com/repos/${GITHUB_REPOSITORY}/check-suites/${suite.id}`
    || app.slug !== 'github-actions'
    || app.name !== 'GitHub Actions'
    || app.id !== '15368'
  ) githubFail(code)
  return Object.freeze({
    nodeId: check.node_id,
    detailsUrl: check.details_url,
    suiteId: suite.id,
    suiteUrl: suite.url,
  })
}

function validatePagesRunAttempt(
  run: GitHubJsonObject,
  claims: GitHubJsonObject,
  candidateCommit: string,
  runUrl: string,
  check: CorrelatedCheck,
): void {
  const code = 'RECOVERY_GITHUB_OIDC_INVALID'
  const repository = objectValue(run.repository, code)
  const headRepository = objectValue(run.head_repository, code)
  const headCommit = objectValue(run.head_commit, code)
  if (
    run.id !== claims.run_id
    || run.run_attempt !== claims.run_attempt
    || run.name !== GITHUB_WORKFLOW_NAME
    || (run.path !== GITHUB_WORKFLOW_PATH && run.path !== `${GITHUB_WORKFLOW_PATH}@main`)
    || run.event !== 'workflow_run'
    || run.head_branch !== 'main'
    || run.head_sha !== candidateCommit
    || run.status !== 'in_progress'
    || run.conclusion !== null
    || run.url !== runUrl
    || run.jobs_url !== `${runUrl}/attempts/${claims.run_attempt}/jobs`
    || run.workflow_url !== `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${run.workflow_id}`
    || run.check_suite_id !== check.suiteId
    || run.check_suite_url !== check.suiteUrl
    || headCommit.id !== candidateCommit
    || !githubIdentifier(run.workflow_id)
    || !githubIdentifier(objectValue(run.actor, code).id)
    || !githubIdentifier(objectValue(run.triggering_actor, code).id)
    || repository.id !== '1273513252'
    || repository.name !== 'Warpkeep'
    || repository.full_name !== GITHUB_REPOSITORY
    || headRepository.id !== '1273513252'
    || headRepository.name !== 'Warpkeep'
    || headRepository.full_name !== GITHUB_REPOSITORY
    || (claims.run_number !== undefined && (
      !safeInteger(run.run_number)
      || run.run_number < 1
      || run.run_number.toString(10) !== claims.run_number
    ))
  ) githubFail(code)
}

function validateDeployRecoveryJob(
  jobsResponse: GitHubJsonObject,
  claims: GitHubJsonObject,
  candidateCommit: string,
  runUrl: string,
  checkUrl: string,
  check: CorrelatedCheck,
): void {
  const code = 'RECOVERY_GITHUB_OIDC_INVALID'
  const jobs = jobsResponse.jobs
  if (
    !safeNonnegativeInteger(jobsResponse.total_count)
    || jobsResponse.total_count > 100
    || !Array.isArray(jobs)
    || jobs.length !== jobsResponse.total_count
  ) githubFail(code)
  const namedJobs = jobs
    .map(value => objectValue(value, code))
    .filter(job => job.name === 'deploy-recovery')
  if (namedJobs.length !== 1) githubFail(code)
  const job = namedJobs[0]!
  const labels = stringArray(job.labels, code, 64, 256)
  if (
    job.id !== claims.check_run_id
    || job.run_id !== claims.run_id
    || job.run_attempt !== claims.run_attempt
    || job.workflow_name !== GITHUB_WORKFLOW_NAME
    || job.head_branch !== 'main'
    || job.head_sha !== candidateCommit
    || job.run_url !== runUrl
    || job.check_run_url !== checkUrl
    || job.url !== `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/jobs/${claims.check_run_id}`
    || job.node_id !== check.nodeId
    || job.html_url !== check.detailsUrl
    || job.status !== 'in_progress'
    || job.conclusion !== null
    || !labels.includes('ubuntu-latest')
    || labels.includes('self-hosted')
    || !githubIdentifier(job.runner_id)
    || !githubIdentifier(job.runner_group_id)
    || typeof job.runner_name !== 'string'
    || !/^GitHub Actions [A-Za-z0-9 ._-]{1,128}$/u.test(job.runner_name)
    || job.runner_group_name !== 'GitHub Actions'
  ) githubFail(code)
}

export async function verifyGitHubWorkflowIdentity(input: Readonly<{
  token: string
  candidateCommit: string
  environment: GitHubAppEnvironment
  fetch: typeof fetch
  nowSeconds: number
}>): Promise<GitHubWorkflowIdentity> {
  const inputSnapshot = snapshotExactDataObject(
    input,
    ['token', 'candidateCommit', 'environment', 'fetch', 'nowSeconds'],
    'RECOVERY_GITHUB_OIDC_INVALID',
  )
  const token = inputSnapshot.token
  const candidateCommit = inputSnapshot.candidateCommit
  const fetchImplementation = inputSnapshot.fetch
  const nowSeconds = inputSnapshot.nowSeconds
  if (
    typeof token !== 'string'
    || token.length < 1
    || token.length > 65_536
    || !commit(candidateCommit)
    || typeof fetchImplementation !== 'function'
    || typeof nowSeconds !== 'number'
    || !Number.isSafeInteger(nowSeconds)
    || nowSeconds < 1
  ) githubFail('RECOVERY_GITHUB_OIDC_INVALID')

  const segments = token.split('.')
  if (
    segments.length !== 3
    || segments[0]!.length > 2_048
    || segments[1]!.length > 32_768
    || segments[2]!.length > 2_048
  ) githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  const header = parseGitHubJsonObject(
    decodeBase64Url(segments[0]!),
    'RECOVERY_GITHUB_OIDC_INVALID',
    [],
  )
  const claims = parseGitHubJsonObject(
    decodeBase64Url(segments[1]!),
    'RECOVERY_GITHUB_OIDC_INVALID',
    [],
  )
  if (
    !exactKeys(header, ['alg', 'kid', 'typ'], ['x5t'])
    || header.alg !== 'RS256'
    || header.typ !== 'JWT'
    || typeof header.kid !== 'string'
    || !/^[A-Za-z0-9._:-]{1,256}$/u.test(header.kid)
    || (header.x5t !== undefined && (
      typeof header.x5t !== 'string'
      || decodeBase64Url(header.x5t).length !== 20
    ))
  ) githubFail('RECOVERY_GITHUB_OIDC_INVALID')

  const discovery = await json(
    fetchImplementation as typeof fetch,
    GITHUB_OIDC_DISCOVERY_URL,
    {},
    'RECOVERY_GITHUB_OIDC_HTTP_INVALID',
  )
  assertDiscovery(discovery)
  const jwks = await json(
    fetchImplementation as typeof fetch,
    GITHUB_OIDC_JWKS_URL,
    {},
    'RECOVERY_GITHUB_OIDC_HTTP_INVALID',
  )
  if (!exactKeys(jwks, ['keys']) || !Array.isArray(jwks.keys)) {
    githubFail('RECOVERY_GITHUB_OIDC_HTTP_INVALID')
  }
  if (jwks.keys.length < 1 || jwks.keys.length > 16) {
    githubFail('RECOVERY_GITHUB_OIDC_HTTP_INVALID')
  }
  const validatedKeys = jwks.keys.map(value => safeRsaJwk(value))
  if (
    new Set(validatedKeys.map(key => key.kid)).size !== validatedKeys.length
    || new Set(validatedKeys.map(key => `${key.jwk.n}.${key.jwk.e}`)).size !== validatedKeys.length
  ) githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  const matchingKeys = validatedKeys.filter(value => value.kid === header.kid)
  if (matchingKeys.length !== 1) githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  if (header.x5t !== undefined && matchingKeys[0]!.x5t !== header.x5t) githubFail('RECOVERY_GITHUB_OIDC_INVALID')

  try {
    const signature = Uint8Array.from(decodeBase64Url(segments[2]!))
    if (signature.byteLength !== matchingKeys[0]!.signatureLength) {
      githubFail('RECOVERY_GITHUB_OIDC_INVALID')
    }
    const key = await crypto.subtle.importKey(
      'jwk',
      matchingKeys[0]!.jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature,
      encoder.encode(`${segments[0]}.${segments[1]}`),
    )
    if (!valid) githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  } catch {
    githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  }

  if (!exactKeys(claims, REQUIRED_CLAIMS, OPTIONAL_CLAIMS)) githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  const issuedAt = claims.iat
  const notBefore = claims.nbf
  const expiresAt = claims.exp
  if (
    claims.iss !== GITHUB_OIDC_ISSUER
    || claims.aud !== GITHUB_RECOVERY_AUDIENCE
    || claims.sub !== 'repo:ael-dev3/Warpkeep:environment:github-pages'
    || claims.repository !== GITHUB_REPOSITORY
    || claims.repository_id !== '1273513252'
    || claims.repository_owner_id !== '183124839'
    || claims.ref !== 'refs/heads/main'
    || claims.sha !== candidateCommit
    || claims.ref_protected !== 'true'
    || claims.workflow !== 'Deploy GitHub Pages'
    || claims.workflow_ref !== 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
    || claims.workflow_sha !== candidateCommit
    || claims.environment !== 'github-pages'
    || claims.event_name !== 'workflow_run'
    || claims.runner_environment !== 'github-hosted'
    || !githubIdentifier(claims.check_run_id)
    || !githubIdentifier(claims.run_id)
    || !githubIdentifier(claims.run_attempt)
    || typeof claims.jti !== 'string'
    || !CANONICAL_UUID.test(claims.jti)
    || !validOptionalClaims(claims, candidateCommit)
    || !safeInteger(issuedAt)
    || !safeInteger(notBefore)
    || !safeInteger(expiresAt)
    || issuedAt < 1
    || notBefore < 1
    || expiresAt < 1
    || issuedAt > nowSeconds
    || notBefore > nowSeconds
    || expiresAt <= nowSeconds
    || notBefore < issuedAt - 600
    || notBefore > issuedAt
    || expiresAt <= notBefore
    || nowSeconds - issuedAt > 600
    || expiresAt - issuedAt > 600
  ) githubFail('RECOVERY_GITHUB_OIDC_INVALID')

  const checkRunId = claims.check_run_id
  const runId = claims.run_id
  const runAttempt = claims.run_attempt
  let installationToken: string
  try {
    installationToken = await mintGitHubInstallationToken(
      inputSnapshot.environment as GitHubAppEnvironment,
      fetchImplementation as typeof fetch,
      nowSeconds,
    )
  } catch {
    githubFail('RECOVERY_GITHUB_OIDC_INVALID')
  }
  const checkUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/check-runs/${checkRunId}`
  const runUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${runId}`
  const runAttemptUrl = `${runUrl}/attempts/${runAttempt}`
  const init = { headers: githubHeaders(installationToken) }
  const [checkResponse, run, jobs] = await Promise.all([
    json(
      fetchImplementation as typeof fetch,
      checkUrl,
      init,
      'RECOVERY_GITHUB_OIDC_INVALID',
      200,
      ['/id', '/check_suite/id', '/app/id'],
    ),
    json(
      fetchImplementation as typeof fetch,
      runAttemptUrl,
      init,
      'RECOVERY_GITHUB_OIDC_INVALID',
      200,
      [
        '/id',
        '/run_attempt',
        '/workflow_id',
        '/check_suite_id',
        '/actor/id',
        '/triggering_actor/id',
        '/repository/id',
        '/head_repository/id',
      ],
    ),
    json(
      fetchImplementation as typeof fetch,
      `${runAttemptUrl}/jobs?per_page=100`,
      init,
      'RECOVERY_GITHUB_OIDC_INVALID',
      200,
      [
        '/jobs/*/id',
        '/jobs/*/run_id',
        '/jobs/*/run_attempt',
        '/jobs/*/runner_id',
        '/jobs/*/runner_group_id',
      ],
    ),
  ])
  const correlatedCheck = validateCheckRun(
    checkResponse,
    checkRunId,
    candidateCommit,
    checkUrl,
  )
  validatePagesRunAttempt(run, claims, candidateCommit, runUrl, correlatedCheck)
  validateDeployRecoveryJob(
    jobs,
    claims,
    candidateCommit,
    runUrl,
    checkUrl,
    correlatedCheck,
  )

  return Object.freeze({
    repository: GITHUB_REPOSITORY,
    repositoryId: '1273513252',
    repositoryOwnerId: '183124839',
    ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    environment: 'github-pages',
    eventName: 'workflow_run',
    workflowSha: candidateCommit,
    pagesRunId: runId,
    pagesRunAttempt: runAttempt,
    checkRunId,
    oidcJti: claims.jti,
  })
}
