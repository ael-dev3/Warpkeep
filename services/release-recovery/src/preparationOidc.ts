import { commit, githubFail, snapshotExactDataObject, type GitHubAppEnvironment } from './config.js'
import { mintGitHubInstallationToken } from './githubEvidence.js'
import { verifyGitHubOidcSignature } from './githubOidc.js'
import { json, type GitHubJsonObject } from './http.js'
import { PREPARATION_AUDIENCE, PREPARATION_ENVIRONMENT, PREPARATION_WORKFLOW_REF } from './preparationPolicy.js'
import { snapshotPreparationIdentity, type PreparationIdentity } from './preparationIntent.js'

const CODE = 'RECOVERY_PREPARATION_OIDC_INVALID'
const API = 'https://api.github.com/repos/ael-dev3/Warpkeep'
const WORKFLOW = '.github/workflows/sealed-realms-production.yml'
const ID = /^[1-9][0-9]{0,19}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
function object(value: unknown): GitHubJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) githubFail(CODE)
  return value as GitHubJsonObject
}

/** Ordinary protected workflow identity. Reusable-workflow claims are deliberately not required. */
export async function verifyPreparationWorkflowIdentity(input: Readonly<{
  token: string; preparationCommit: string; environment: GitHubAppEnvironment; fetch: typeof fetch; nowSeconds: number
}>): Promise<Readonly<{ identity: PreparationIdentity; expiresAt: number }>> {
  const source = snapshotExactDataObject(input, ['token', 'preparationCommit', 'environment', 'fetch', 'nowSeconds'], CODE)
  if (typeof source.token !== 'string' || !commit(source.preparationCommit) || typeof source.fetch !== 'function'
    || !Number.isSafeInteger(source.nowSeconds) || (source.nowSeconds as number) < 1) githubFail(CODE)
  const fetcher = source.fetch as typeof fetch
  const now = source.nowSeconds as number
  const sha = source.preparationCommit
  const claims = await verifyGitHubOidcSignature(source.token, fetcher)
  if (claims.iss !== 'https://token.actions.githubusercontent.com' || claims.aud !== PREPARATION_AUDIENCE
    || claims.sub !== `repo:ael-dev3/Warpkeep:environment:${PREPARATION_ENVIRONMENT}`
    || claims.repository !== 'ael-dev3/Warpkeep' || claims.repository_id !== '1273513252'
    || claims.repository_owner_id !== '183124839' || claims.ref !== 'refs/heads/main'
    || claims.sha !== sha || claims.workflow_sha !== sha || claims.ref_protected !== 'true'
    || claims.workflow !== 'Sealed Realms Production' || claims.workflow_ref !== PREPARATION_WORKFLOW_REF
    || claims.environment !== PREPARATION_ENVIRONMENT || claims.event_name !== 'workflow_dispatch'
    || claims.runner_environment !== 'self-hosted'
    || claims.job_workflow_ref !== undefined || claims.job_workflow_sha !== undefined
    || typeof claims.run_id !== 'string' || !ID.test(claims.run_id)
    || typeof claims.run_attempt !== 'string' || !ID.test(claims.run_attempt)
    || typeof claims.check_run_id !== 'string' || !ID.test(claims.check_run_id)
    || typeof claims.jti !== 'string' || !UUID.test(claims.jti)
    || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf) || !Number.isSafeInteger(claims.exp)
    || (claims.iat as number) < 1 || (claims.nbf as number) < 1
    || (claims.iat as number) > now || (claims.nbf as number) > now || (claims.exp as number) <= now
    || now - (claims.iat as number) > 600 || (claims.exp as number) - (claims.iat as number) > 600
    || (claims.nbf as number) > (claims.iat as number) || (claims.nbf as number) < (claims.iat as number) - 600) githubFail(CODE)
  const installationToken = await mintGitHubInstallationToken(source.environment as GitHubAppEnvironment, fetcher, now)
  const init = { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${installationToken}`, 'x-github-api-version': '2022-11-28' } }
  const runUrl = `${API}/actions/runs/${claims.run_id}`
  const checkUrl = `${API}/check-runs/${claims.check_run_id}`
  const [run, check, jobs, workflow, revision] = await Promise.all([
    json(fetcher, `${runUrl}/attempts/${claims.run_attempt}`, init, CODE, 200,
      ['/id', '/run_attempt', '/workflow_id', '/check_suite_id', '/repository/id', '/repository/owner/id', '/head_repository/id']),
    json(fetcher, checkUrl, init, CODE, 200, ['/id', '/app/id', '/check_suite/id']),
    json(fetcher, `${runUrl}/attempts/${claims.run_attempt}/jobs?per_page=100`, init, CODE, 200,
      ['/jobs/*/id', '/jobs/*/run_id', '/jobs/*/run_attempt'], undefined, ['/jobs/*/runner_id', '/jobs/*/runner_group_id']),
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
    || check.id !== claims.check_run_id || check.head_sha !== sha || check.name !== 'operate'
    || check.status !== 'in_progress' || check.conclusion !== null || check.url !== checkUrl
    || object(check.app).id !== '15368' || object(check.app).slug !== 'github-actions'
    || object(check.check_suite).id !== run.check_suite_id
    || !Array.isArray(jobs.jobs) || jobs.jobs.length !== 1 || jobs.total_count !== 1
    || revision.sha !== sha || !commit(object(revision.tree).sha)) githubFail(CODE)
  const job = object(jobs.jobs[0])
  const labels = ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive']
  const observedLabels = job.labels
  if (job.id !== claims.check_run_id || job.run_id !== claims.run_id || job.run_attempt !== claims.run_attempt
    || job.head_sha !== sha || job.name !== 'operate' || job.status !== 'in_progress' || job.conclusion !== null
    || job.check_run_url !== checkUrl || job.runner_name !== 'warpkeep-wsl-production-01'
    || job.runner_group_name !== 'Default' || !Array.isArray(observedLabels)
    || observedLabels.length !== labels.length || labels.some(label => !observedLabels.includes(label))) githubFail(CODE)
  // The attempts/N endpoint remains historical after a rerun. Correlate the current run as well.
  const latest = await json(fetcher, runUrl, init, CODE, 200, ['/id', '/run_attempt'])
  if (latest.id !== claims.run_id || latest.run_attempt !== claims.run_attempt || latest.head_sha !== sha
    || latest.status !== 'in_progress' || latest.conclusion !== null) githubFail(CODE)
  // Observe the protected head last, after all other authenticated metadata.
  const branch = await json(fetcher, `${API}/branches/main`, init, CODE)
  if (branch.name !== 'main' || branch.protected !== true || object(branch.commit).sha !== sha) githubFail(CODE)
  return Object.freeze({ identity: snapshotPreparationIdentity({ preparationCommit: sha, preparationTree: object(revision.tree).sha,
    runId: claims.run_id, runAttempt: claims.run_attempt, checkRunId: claims.check_run_id }), expiresAt: claims.exp as number })
}
