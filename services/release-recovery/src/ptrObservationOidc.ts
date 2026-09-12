import { commit, githubFail, snapshotExactDataObject, type GitHubAppEnvironment } from './config.js'
import { mintGitHubInstallationToken } from './githubEvidence.js'
import { verifyGitHubOidcSignature } from './githubOidc.js'
import { json, type GitHubJsonObject } from './http.js'
import { PTR_OBSERVATION_AUDIENCE, PTR_OBSERVATION_JOB, snapshotPtrObservationIdentity,
  type PtrObservationIdentity } from './ptrObservation.js'

const CODE = 'RECOVERY_PTR_OBSERVATION_OIDC_INVALID'
const API = 'https://api.github.com/repos/ael-dev3/Warpkeep'
const WORKFLOW = '.github/workflows/sealed-realms-production.yml'
const WORKFLOW_REF = 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main'
const ENVIRONMENT = 'notification-bridge-prepared'
const ID = /^[1-9][0-9]{0,19}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const LABELS = ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive'] as const

function object(value: unknown): GitHubJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) githubFail(CODE)
  return value as GitHubJsonObject
}

async function workflowJobs(fetcher: typeof fetch, url: string, init: RequestInit): Promise<readonly GitHubJsonObject[]> {
  const jobs: GitHubJsonObject[] = []
  let total: number | undefined
  for (let page = 1; page <= 10; page += 1) {
    const result = await json(fetcher, `${url}?per_page=100&page=${page}`, init, CODE, 200,
      ['/jobs/*/id', '/jobs/*/run_id', '/jobs/*/run_attempt'], undefined,
      ['/jobs/*/runner_id', '/jobs/*/runner_group_id'])
    if (!Number.isSafeInteger(result.total_count) || (result.total_count as number) < 1
      || (result.total_count as number) > 1000 || !Array.isArray(result.jobs)) githubFail(CODE)
    if (total === undefined) total = result.total_count as number
    if (result.total_count !== total) githubFail(CODE)
    const expected = Math.min(100, total - jobs.length)
    if (expected < 1 || result.jobs.length !== expected) githubFail(CODE)
    for (const value of result.jobs) jobs.push(object(value))
    if (jobs.length === total) return Object.freeze(jobs)
  }
  return githubFail(CODE)
}

/** Authenticates the one read-only PTR observer job against protected current main. */
export async function verifyPtrObservationWorkflowIdentity(input: Readonly<{
  token: string
  sourceCommit: string
  requestId: string
  environment: GitHubAppEnvironment
  fetch: typeof fetch
  nowSeconds: number
}>): Promise<Readonly<{ identity: PtrObservationIdentity; expiresAt: number }>> {
  const source = snapshotExactDataObject(input,
    ['token', 'sourceCommit', 'requestId', 'environment', 'fetch', 'nowSeconds'], CODE)
  if (typeof source.token !== 'string' || !commit(source.sourceCommit) || typeof source.requestId !== 'string'
    || !UUID.test(source.requestId) || typeof source.fetch !== 'function'
    || !Number.isSafeInteger(source.nowSeconds) || (source.nowSeconds as number) < 1) githubFail(CODE)
  const fetcher = source.fetch as typeof fetch, now = source.nowSeconds as number, sha = source.sourceCommit
  const claims = await verifyGitHubOidcSignature(source.token, fetcher)
  if (claims.iss !== 'https://token.actions.githubusercontent.com' || claims.aud !== PTR_OBSERVATION_AUDIENCE
    || claims.sub !== `repo:ael-dev3/Warpkeep:environment:${ENVIRONMENT}`
    || claims.repository !== 'ael-dev3/Warpkeep' || claims.repository_id !== '1273513252'
    || claims.repository_owner_id !== '183124839' || claims.ref !== 'refs/heads/main'
    || claims.sha !== sha || claims.workflow_sha !== sha || claims.ref_protected !== 'true'
    || claims.workflow !== 'Sealed Realms Production' || claims.workflow_ref !== WORKFLOW_REF
    || claims.environment !== ENVIRONMENT || claims.event_name !== 'workflow_dispatch'
    || claims.runner_environment !== 'self-hosted'
    || claims.job_workflow_ref !== undefined || claims.job_workflow_sha !== undefined
    || typeof claims.run_id !== 'string' || !ID.test(claims.run_id)
    || typeof claims.run_attempt !== 'string' || !ID.test(claims.run_attempt)
    || claims.check_run_id !== undefined
    || typeof claims.jti !== 'string' || claims.jti !== source.requestId || !UUID.test(claims.jti)
    || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf) || !Number.isSafeInteger(claims.exp)
    || (claims.iat as number) < 1 || (claims.nbf as number) < 1
    || (claims.iat as number) > now || (claims.nbf as number) > now || (claims.exp as number) <= now
    || now - (claims.iat as number) > 600 || (claims.exp as number) - (claims.iat as number) > 600
    || (claims.nbf as number) > (claims.iat as number) || (claims.nbf as number) < (claims.iat as number) - 600) githubFail(CODE)

  const installationToken = await mintGitHubInstallationToken(source.environment as GitHubAppEnvironment, fetcher, now)
  const init = { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${installationToken}`,
    'x-github-api-version': '2022-11-28' } }
  const runUrl = `${API}/actions/runs/${claims.run_id}`
  const [run, jobs, workflow, revision] = await Promise.all([
    json(fetcher, `${runUrl}/attempts/${claims.run_attempt}`, init, CODE, 200,
      ['/id', '/run_attempt', '/workflow_id', '/check_suite_id', '/repository/id', '/repository/owner/id', '/head_repository/id']),
    workflowJobs(fetcher, `${runUrl}/attempts/${claims.run_attempt}/jobs`, init),
    json(fetcher, `${API}/actions/workflows/sealed-realms-production.yml`, init, CODE, 200, ['/id']),
    json(fetcher, `${API}/git/commits/${sha}`, init, CODE),
  ])
  const repository = object(run.repository)
  if (run.id !== claims.run_id || run.run_attempt !== claims.run_attempt || run.head_sha !== sha
    || run.head_branch !== 'main' || run.event !== 'workflow_dispatch' || run.status !== 'in_progress'
    || run.conclusion !== null || run.name !== 'Sealed Realms Production'
    || (run.path !== WORKFLOW && run.path !== `${WORKFLOW}@main`)
    || repository.id !== '1273513252' || repository.full_name !== 'ael-dev3/Warpkeep'
    || object(repository.owner).id !== '183124839' || object(run.head_repository).id !== '1273513252'
    || typeof workflow.id !== 'string' || !ID.test(workflow.id) || workflow.id !== run.workflow_id
    || typeof run.check_suite_id !== 'string' || !ID.test(run.check_suite_id)
    || workflow.path !== WORKFLOW || workflow.state !== 'active'
    || revision.sha !== sha || !commit(object(revision.tree).sha)) githubFail(CODE)

  const ids = new Set<string>(), targets: GitHubJsonObject[] = []
  for (const job of jobs) {
    if (typeof job.id !== 'string' || !ID.test(job.id) || ids.has(job.id)
      || job.run_id !== claims.run_id || job.run_attempt !== claims.run_attempt || job.head_sha !== sha
      || typeof job.name !== 'string' || job.name.length < 1 || job.name.length > 256
      || typeof job.check_run_url !== 'string' || job.check_run_url !== `${API}/check-runs/${job.id}`) githubFail(CODE)
    ids.add(job.id)
    if (job.name === PTR_OBSERVATION_JOB) targets.push(job)
    else if (job.status !== 'completed' || job.conclusion !== 'skipped') githubFail(CODE)
  }
  if (targets.length !== 1) githubFail(CODE)
  const job = targets[0]!, observedLabels = job.labels, checkRunId = job.id as string
  const checkUrl = `${API}/check-runs/${checkRunId}`
  if (job.name !== PTR_OBSERVATION_JOB || job.status !== 'in_progress' || job.conclusion !== null
    || job.check_run_url !== checkUrl || job.runner_name !== 'warpkeep-wsl-production-01'
    || job.runner_group_name !== 'Default' || !Array.isArray(observedLabels)
    || observedLabels.length !== LABELS.length || new Set(observedLabels).size !== LABELS.length
    || LABELS.some(label => !observedLabels.includes(label))) githubFail(CODE)

  const check = await json(fetcher, checkUrl, init, CODE, 200, ['/id', '/app/id', '/check_suite/id'])
  if (check.id !== checkRunId || check.head_sha !== sha || check.name !== PTR_OBSERVATION_JOB
    || check.status !== 'in_progress' || check.conclusion !== null || check.url !== checkUrl
    || object(check.app).id !== '15368' || object(check.app).slug !== 'github-actions'
    || object(check.check_suite).id !== run.check_suite_id) githubFail(CODE)

  const latest = await json(fetcher, runUrl, init, CODE, 200, ['/id', '/run_attempt'])
  if (latest.id !== claims.run_id || latest.run_attempt !== claims.run_attempt || latest.head_sha !== sha
    || latest.status !== 'in_progress' || latest.conclusion !== null) githubFail(CODE)
  const branch = await json(fetcher, `${API}/branches/main`, init, CODE)
  if (branch.name !== 'main' || branch.protected !== true || object(branch.commit).sha !== sha) githubFail(CODE)
  return Object.freeze({ identity: snapshotPtrObservationIdentity({ sourceCommit: sha,
    sourceTree: object(revision.tree).sha, runId: claims.run_id, runAttempt: claims.run_attempt,
    checkRunId, requestId: claims.jti }), expiresAt: claims.exp as number })
}
