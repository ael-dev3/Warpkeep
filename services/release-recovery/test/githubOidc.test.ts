import { beforeAll, describe, expect, it } from 'vitest'

import type { GitHubAppEnvironment } from '../src/githubEvidence.js'
import { verifyGitHubWorkflowIdentity } from '../src/githubOidc.js'
import { base64UrlEncode } from '../src/protocol.js'

const text = new TextEncoder()
const candidateCommit = 'a'.repeat(40)
const now = 1_700_000_000
const repository = 'ael-dev3/Warpkeep'
const CAPTURED_SPARSE_CHECK_RUN_JSON = '{"id":91,"node_id":"CR_kwDOfixture","name":"deploy-recovery","head_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","external_id":"pages-deploy-recovery","url":"https://api.github.com/repos/ael-dev3/Warpkeep/check-runs/91","html_url":"https://github.com/ael-dev3/Warpkeep/actions/runs/41/job/91","details_url":"https://github.com/ael-dev3/Warpkeep/actions/runs/41/job/91","status":"in_progress","conclusion":null,"started_at":"2026-09-03T00:00:00Z","completed_at":null,"output":{"title":null,"summary":null,"text":null,"annotations_count":0,"annotations_url":"https://api.github.com/repos/ael-dev3/Warpkeep/check-runs/91/annotations"},"check_suite":{"id":77},"app":{"id":15368,"slug":"github-actions","name":"GitHub Actions"},"pull_requests":[]}'
const CAPTURED_HOSTED_AND_SKIPPED_JOBS_JSON = '{"total_count":2,"jobs":[{"id":91,"run_id":41,"workflow_name":"Deploy GitHub Pages","head_branch":"main","run_url":"https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/41","run_attempt":2,"node_id":"CR_kwDOfixture","head_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","url":"https://api.github.com/repos/ael-dev3/Warpkeep/actions/jobs/91","html_url":"https://github.com/ael-dev3/Warpkeep/actions/runs/41/job/91","status":"in_progress","conclusion":null,"created_at":"2026-09-03T00:00:00Z","started_at":"2026-09-03T00:00:10Z","completed_at":null,"name":"deploy-recovery","steps":[{"name":"Request recovery authority","status":"in_progress","conclusion":null,"number":6,"started_at":"2026-09-03T00:01:00Z","completed_at":null}],"check_run_url":"https://api.github.com/repos/ael-dev3/Warpkeep/check-runs/91","labels":["ubuntu-latest"],"runner_id":1001,"runner_name":"GitHub Actions 1","runner_group_id":0,"runner_group_name":"GitHub Actions"},{"id":92,"run_id":41,"workflow_name":"Deploy GitHub Pages","head_branch":"main","run_url":"https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/41","run_attempt":2,"node_id":"CR_kwDOskipped","head_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","url":"https://api.github.com/repos/ael-dev3/Warpkeep/actions/jobs/92","html_url":"https://github.com/ael-dev3/Warpkeep/actions/runs/41/job/92","status":"completed","conclusion":"skipped","created_at":"2026-09-03T00:00:00Z","started_at":null,"completed_at":"2026-09-03T00:00:01Z","name":"build-skipped","steps":[],"check_run_url":"https://api.github.com/repos/ael-dev3/Warpkeep/check-runs/92","labels":["ubuntu-latest"],"runner_id":null,"runner_name":null,"runner_group_id":null,"runner_group_name":null}]}'
const workflowRef = 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
const installationUrl = 'https://api.github.com/app/installations/23/access_tokens'

let oidcPrivateKey: CryptoKey
let oidcPublicJwk: JsonWebKey
let appEnvironment: GitHubAppEnvironment

beforeAll(async () => {
  const oidcPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  oidcPrivateKey = oidcPair.privateKey
  oidcPublicJwk = await crypto.subtle.exportKey('jwk', oidcPair.publicKey)

  const appPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', appPair.privateKey))
  appEnvironment = Object.freeze({
    GITHUB_APP_ID: '17',
    GITHUB_APP_INSTALLATION_ID: '23',
    GITHUB_APP_PRIVATE_KEY_PEM: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`,
  })
})

function responseAt(url: string, body: string, init: ResponseInit = {}): Response {
  const response = new Response(body, {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function canonicalX5t(length: number, byte: number): string {
  return base64UrlEncode(new Uint8Array(length).fill(byte))
}

function defaultClaims(): Record<string, unknown> {
  return {
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'warpkeep-release-recovery',
    sub: 'repo:ael-dev3/Warpkeep:environment:github-pages',
    repository,
    repository_id: '1273513252',
    repository_owner_id: '183124839',
    ref: 'refs/heads/main',
    sha: candidateCommit,
    ref_protected: 'true',
    workflow: 'Deploy GitHub Pages',
    workflow_ref: workflowRef,
    workflow_sha: candidateCommit,
    environment: 'github-pages',
    event_name: 'workflow_run',
    runner_environment: 'github-hosted',
    check_run_id: '91',
    run_id: '41',
    run_attempt: '2',
    jti: '123e4567-e89b-42d3-a456-426614174000',
    iat: now - 5,
    nbf: now - 5,
    exp: now + 60,
    actor: 'ael-dev3',
    actor_id: '183124839',
    base_ref: '',
    environment_node_id: 'EN_kwDOabc123',
    head_ref: '',
    job_workflow_ref: workflowRef,
    job_workflow_sha: candidateCommit,
    ref_type: 'branch',
    repository_owner: 'ael-dev3',
    repository_visibility: 'public',
    run_number: '300',
  }
}

function defaultDiscovery(claimNames: readonly string[]): Record<string, unknown> {
  return {
    issuer: 'https://token.actions.githubusercontent.com',
    jwks_uri: 'https://token.actions.githubusercontent.com/.well-known/jwks',
    subject_types_supported: ['public', 'pairwise'],
    response_types_supported: ['id_token'],
    claims_supported: claimNames,
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid'],
  }
}

function defaultJwks(): Record<string, unknown> {
  return {
    keys: [{
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      kid: 'fixture',
      n: oidcPublicJwk.n,
      e: oidcPublicJwk.e,
      x5c: [btoa('fixture certificate')],
      x5t: canonicalX5t(20, 1),
      'x5t#S256': canonicalX5t(32, 2),
    }],
  }
}

function defaultCheckRun(checkUrl: string, runId: string, checkRunId: string): Record<string, unknown> {
  const jobUrl = `https://github.com/${repository}/actions/runs/${runId}/job/${checkRunId}`
  return {
    id: Number(checkRunId),
    node_id: 'CR_kwDOfixture',
    name: 'deploy-recovery',
    head_sha: candidateCommit,
    external_id: 'pages-deploy-recovery',
    url: checkUrl,
    html_url: jobUrl,
    details_url: jobUrl,
    status: 'in_progress',
    conclusion: null,
    started_at: '2026-09-03T00:00:00Z',
    completed_at: null,
    output: {
      title: null,
      summary: null,
      text: null,
      annotations_count: 0,
      annotations_url: `${checkUrl}/annotations`,
    },
    check_suite: { id: 77 },
    app: {
      id: 15368,
      slug: 'github-actions',
      name: 'GitHub Actions',
    },
    pull_requests: [],
  }
}

function defaultRunAttempt(runId: string, runAttempt: string): Record<string, unknown> {
  const runUrl = `https://api.github.com/repos/${repository}/actions/runs/${runId}`
  return {
    id: Number(runId),
    name: 'Deploy GitHub Pages',
    node_id: 'WFR_kwDOfixture',
    head_branch: 'main',
    head_sha: candidateCommit,
    path: '.github/workflows/deploy-pages.yml@main',
    display_title: 'Deploy GitHub Pages',
    run_number: 300,
    event: 'workflow_run',
    status: 'in_progress',
    conclusion: null,
    workflow_id: 309643090,
    check_suite_id: 77,
    check_suite_node_id: 'CS_kwDOfixture',
    url: runUrl,
    html_url: 'https://github.com/ael-dev3/Warpkeep/actions/runs/41',
    pull_requests: [],
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:01:00Z',
    actor: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' },
    triggering_actor: { login: 'github-actions[bot]', id: 41898282, type: 'Bot' },
    run_attempt: Number(runAttempt),
    referenced_workflows: [],
    run_started_at: '2026-09-03T00:00:00Z',
    jobs_url: `${runUrl}/attempts/${runAttempt}/jobs`,
    logs_url: `${runUrl}/logs`,
    check_suite_url: `https://api.github.com/repos/${repository}/check-suites/77`,
    artifacts_url: `${runUrl}/artifacts`,
    cancel_url: `${runUrl}/cancel`,
    rerun_url: `${runUrl}/rerun`,
    previous_attempt_url: null,
    workflow_url: `https://api.github.com/repos/${repository}/actions/workflows/309643090`,
    head_commit: {
      id: candidateCommit,
      tree_id: 'b'.repeat(40),
      message: 'activate recovery',
      timestamp: '2026-09-03T00:00:00Z',
      author: { name: 'Warpkeep', email: 'noreply@example.invalid' },
      committer: { name: 'Warpkeep', email: 'noreply@example.invalid' },
    },
    repository: { id: 1273513252, name: 'Warpkeep', full_name: repository },
    head_repository: { id: 1273513252, name: 'Warpkeep', full_name: repository },
  }
}

function defaultJobs(runId: string, runAttempt: string, checkUrl: string): Record<string, unknown> {
  const runUrl = `https://api.github.com/repos/${repository}/actions/runs/${runId}`
  return {
    total_count: 2,
    jobs: [{
      id: 91,
      run_id: Number(runId),
      workflow_name: 'Deploy GitHub Pages',
      head_branch: 'main',
      run_url: runUrl,
      run_attempt: Number(runAttempt),
      node_id: 'CR_kwDOfixture',
      head_sha: candidateCommit,
      url: `https://api.github.com/repos/${repository}/actions/jobs/91`,
      html_url: 'https://github.com/ael-dev3/Warpkeep/actions/runs/41/job/91',
      status: 'in_progress',
      conclusion: null,
      created_at: '2026-09-03T00:00:00Z',
      started_at: '2026-09-03T00:00:10Z',
      completed_at: null,
      name: 'deploy-recovery',
      steps: [{
        name: 'Request recovery authority',
        status: 'in_progress',
        conclusion: null,
        number: 6,
        started_at: '2026-09-03T00:01:00Z',
        completed_at: null,
      }],
      check_run_url: checkUrl,
      labels: ['ubuntu-latest'],
      runner_id: 1001,
      runner_name: 'GitHub Actions 1',
      runner_group_id: 0,
      runner_group_name: 'GitHub Actions',
    }, {
      id: 92,
      run_id: Number(runId),
      workflow_name: 'Deploy GitHub Pages',
      head_branch: 'main',
      run_url: runUrl,
      run_attempt: Number(runAttempt),
      node_id: 'CR_kwDOskipped',
      head_sha: candidateCommit,
      url: `https://api.github.com/repos/${repository}/actions/jobs/92`,
      html_url: `https://github.com/${repository}/actions/runs/${runId}/job/92`,
      status: 'completed',
      conclusion: 'skipped',
      created_at: '2026-09-03T00:00:00Z',
      started_at: null,
      completed_at: '2026-09-03T00:00:01Z',
      name: 'build-skipped',
      steps: [],
      check_run_url: `https://api.github.com/repos/${repository}/check-runs/92`,
      labels: ['ubuntu-latest'],
      runner_id: null,
      runner_name: null,
      runner_group_id: null,
      runner_group_name: null,
    }],
  }
}

type FixtureOptions = Readonly<{
  mutateHeader?: (header: Record<string, unknown>) => void
  mutateClaims?: (claims: Record<string, unknown>) => void
  headerText?: (header: Record<string, unknown>) => string
  claimsText?: (claims: Record<string, unknown>) => string
  mutateDiscovery?: (discovery: Record<string, unknown>) => void
  mutateJwks?: (jwks: Record<string, unknown>) => void
  mutateCheckRun?: (checkRun: Record<string, unknown>) => void
  checkRunText?: (checkRun: Record<string, unknown>) => string
  mutateRunAttempt?: (runAttempt: Record<string, unknown>) => void
  mutateJobs?: (jobs: Record<string, unknown>) => void
  jobsText?: (jobs: Record<string, unknown>) => string
  mutateInstallation?: (response: Record<string, unknown>) => void
  mutateSignature?: (signature: string) => string
}>

async function signedFixture(options: FixtureOptions = {}) {
  const header: Record<string, unknown> = {
    alg: 'RS256',
    kid: 'fixture',
    typ: 'JWT',
    x5t: canonicalX5t(20, 1),
  }
  options.mutateHeader?.(header)
  const claims = defaultClaims()
  options.mutateClaims?.(claims)
  const headerJson = options.headerText?.(header) ?? JSON.stringify(header)
  const claimsJson = options.claimsText?.(claims) ?? JSON.stringify(claims)
  const headerSegment = base64UrlEncode(text.encode(headerJson))
  const claimsSegment = base64UrlEncode(text.encode(claimsJson))
  const rawSignature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    oidcPrivateKey,
    text.encode(`${headerSegment}.${claimsSegment}`),
  ))
  const validSignature = base64UrlEncode(rawSignature)
  const signatureSegment = options.mutateSignature?.(validSignature) ?? validSignature
  const token = `${headerSegment}.${claimsSegment}.${signatureSegment}`

  const runId = typeof claims.run_id === 'string' ? claims.run_id : '41'
  const runAttempt = typeof claims.run_attempt === 'string' ? claims.run_attempt : '2'
  const checkRunId = typeof claims.check_run_id === 'string' ? claims.check_run_id : '91'
  const checkUrl = `https://api.github.com/repos/${repository}/check-runs/${checkRunId}`
  const runAttemptUrl = `https://api.github.com/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}`
  const jobsUrl = `${runAttemptUrl}/jobs?per_page=100`
  const discovery = defaultDiscovery(Object.keys(claims))
  options.mutateDiscovery?.(discovery)
  const jwks = defaultJwks()
  options.mutateJwks?.(jwks)
  const checkRun = defaultCheckRun(checkUrl, runId, checkRunId)
  options.mutateCheckRun?.(checkRun)
  const run = defaultRunAttempt(runId, runAttempt)
  options.mutateRunAttempt?.(run)
  const jobs = defaultJobs(runId, runAttempt, checkUrl)
  options.mutateJobs?.(jobs)

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('openid-configuration')) return responseAt(url, JSON.stringify(discovery))
    if (url.endsWith('/jwks')) return responseAt(url, JSON.stringify(jwks))
    if (url === installationUrl) {
      const authorization = new Headers(init?.headers).get('authorization') ?? ''
      if (init?.method !== 'POST' || !authorization.startsWith('Bearer ey')) {
        return responseAt(url, '{"message":"denied"}', { status: 401 })
      }
      const installation: Record<string, unknown> = {
        expires_at: new Date((now + 3_600) * 1_000).toISOString(),
        permissions: {
          actions: 'read',
          checks: 'read',
          contents: 'read',
          deployments: 'read',
          metadata: 'read',
          pages: 'read',
        },
        repository_selection: 'selected',
        repositories_url: 'https://api.github.com/installation/repositories',
        has_multiple_single_files: false,
        single_file: null,
        single_file_paths: [],
        token_last_eight: 'on-token',
        repositories: [{
          full_name: repository,
          id: 1273513252,
          node_id: 'R_kgDOL5fixture',
          name: 'Warpkeep',
          private: false,
          owner: { login: 'ael-dev3', id: 183124839 },
        }],
        token: 'installation-token',
      }
      options.mutateInstallation?.(installation)
      return responseAt(url, JSON.stringify(installation), { status: 201 })
    }
    const authenticated = new Headers(init?.headers).get('authorization') === 'Bearer installation-token'
    if (!authenticated) return responseAt(url, '{"message":"denied"}', { status: 401 })
    if (url === checkUrl) {
      return responseAt(url, options.checkRunText?.(checkRun) ?? JSON.stringify(checkRun))
    }
    if (url === runAttemptUrl) return responseAt(url, JSON.stringify(run))
    if (url === jobsUrl) return responseAt(url, options.jobsText?.(jobs) ?? JSON.stringify(jobs))
    throw new Error(`unexpected fake transport: ${url}`)
  }) as typeof globalThis.fetch

  return { token, fetch: fakeFetch, environment: appEnvironment }
}

async function verify(options: FixtureOptions = {}) {
  const fixture = await signedFixture(options)
  return verifyGitHubWorkflowIdentity({
    token: fixture.token,
    candidateCommit,
    environment: fixture.environment,
    fetch: fixture.fetch,
    nowSeconds: now,
  })
}

function invalidOidc(options: FixtureOptions) {
  return expect(verify(options)).rejects.toThrowError('RECOVERY_GITHUB_OIDC_INVALID')
}

describe('GitHub recovery OIDC identity', () => {
  it('verifies a realistic GitHub token, discovery, JWKS, run attempt, job, and check run', async () => {
    await expect(verify()).resolves.toEqual({
      repository,
      repositoryId: '1273513252',
      repositoryOwnerId: '183124839',
      ref: 'refs/heads/main',
      workflowRef,
      environment: 'github-pages',
      eventName: 'workflow_run',
      workflowSha: candidateCommit,
      pagesRunId: '41',
      pagesRunAttempt: '2',
      checkRunId: '91',
      oidcJti: '123e4567-e89b-42d3-a456-426614174000',
    })
  })

  it('accepts a sparse check suite and a skipped sibling with null runner assignment', async () => {
    await expect(verify()).resolves.toMatchObject({ pagesRunId: '41', checkRunId: '91' })
  })

  it('accepts immutable sanitized current-wire sparse check and hosted/null-peer job JSON', async () => {
    await expect(verify({
      checkRunText: () => CAPTURED_SPARSE_CHECK_RUN_JSON,
      jobsText: () => CAPTURED_HOSTED_AND_SKIPPED_JOBS_JSON,
    })).resolves.toMatchObject({ pagesRunId: '41', checkRunId: '91' })
  })

  it.each([
    ['extra permission', (value: Record<string, unknown>) => { (value.permissions as Record<string, unknown>).issues = 'read' }],
    ['write permission', (value: Record<string, unknown>) => { (value.permissions as Record<string, unknown>).contents = 'write' }],
    ['all repositories', (value: Record<string, unknown>) => { value.repository_selection = 'all' }],
    ['wrong repository', (value: Record<string, unknown>) => { ((value.repositories as Record<string, unknown>[])[0]!).full_name = 'attacker/fork' }],
    ['second repository', (value: Record<string, unknown>) => { (value.repositories as Record<string, unknown>[]).push({ ...(value.repositories as Record<string, unknown>[])[0]! }) }],
  ])('rejects additive installation-token response with %s', async (_name, mutateInstallation) => {
    await invalidOidc({ mutateInstallation })
  })

  it('accepts bounded additive claim names advertised by GitHub discovery', async () => {
    await expect(verify({
      mutateDiscovery: discovery => {
        (discovery.claims_supported as string[]).push('future_github_claim')
      },
    })).resolves.toMatchObject({ checkRunId: '91' })
  })

  it('accepts the known bounded non-authoritative issuer_scope claim', async () => {
    await expect(verify({ mutateClaims: claims => { claims.issuer_scope = 'repo:ael-dev3/Warpkeep' } }))
      .resolves.toMatchObject({ pagesRunId: '41' })
  })

  it.each(['', 'x'.repeat(257), { hostile: true }])('rejects invalid issuer_scope claim %j', async issuerScope => {
    await invalidOidc({ mutateClaims: claims => { claims.issuer_scope = issuerScope } })
  })

  it('rejects a redirected discovery response before selecting a foreign JWKS', async () => {
    const fixture = await signedFixture()
    const redirect = (async () => new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.test' },
    })) as typeof fetch

    await expect(verifyGitHubWorkflowIdentity({
      token: fixture.token,
      candidateCommit,
      environment: fixture.environment,
      fetch: redirect,
      nowSeconds: now,
    })).rejects.toThrowError('RECOVERY_GITHUB_OIDC_HTTP_INVALID')
  })

  it.each([
    ['issuer', 'iss', 'https://attacker.test'],
    ['audience', 'aud', 'wrong-audience'],
    ['subject', 'sub', 'repo:ael-dev3/Warpkeep:ref:refs/heads/main'],
    ['repository', 'repository', 'attacker/fork'],
    ['repository ID', 'repository_id', '1273513253'],
    ['repository owner ID', 'repository_owner_id', '183124840'],
    ['protected ref', 'ref', 'refs/heads/release'],
    ['candidate SHA', 'sha', 'b'.repeat(40)],
    ['protected-ref flag', 'ref_protected', 'false'],
    ['workflow name', 'workflow', 'Attacker workflow'],
    ['workflow ref', 'workflow_ref', 'attacker/fork/.github/workflows/deploy-pages.yml@refs/heads/main'],
    ['workflow SHA', 'workflow_sha', 'b'.repeat(40)],
    ['environment', 'environment', 'preview'],
    ['event', 'event_name', 'pull_request'],
    ['runner environment', 'runner_environment', 'self-hosted'],
  ])('rejects a substituted fixed %s claim', async (_name, key, replacement) => {
    await invalidOidc({ mutateClaims: claims => { claims[key] = replacement } })
  })

  it.each([
    ['zero check-run ID', 'check_run_id', '0'],
    ['leading-zero check-run ID', 'check_run_id', '091'],
    ['zero Pages run ID', 'run_id', '0'],
    ['leading-zero Pages run attempt', 'run_attempt', '02'],
    ['numeric Pages run ID', 'run_id', 41],
  ])('rejects a noncanonical %s claim', async (_name, key, replacement) => {
    await invalidOidc({ mutateClaims: claims => { claims[key] = replacement } })
  })

  it.each([
    ['future issue', { iat: now + 1, nbf: now + 1, exp: now + 60 }],
    ['future not-before', { iat: now, nbf: now + 1, exp: now + 60 }],
    ['expired token', { iat: now - 60, nbf: now - 60, exp: now }],
    ['stale token', { iat: now - 601, nbf: now - 601, exp: now + 1 }],
    ['not-before after issue time', { iat: now - 5, nbf: now - 4, exp: now + 1 }],
    ['not-before more than ten minutes before issue', { iat: now - 5, nbf: now - 606, exp: now + 1 }],
    ['nonpositive issue time', { iat: 0, nbf: 0, exp: 1 }],
    ['lifetime over ten minutes', { iat: now - 1, nbf: now - 1, exp: now + 600 }],
  ])('rejects a %s', async (_name, times) => {
    await invalidOidc({ mutateClaims: claims => Object.assign(claims, times) })
  })

  it('accepts the exact ten-minute lifetime boundary', async () => {
    await expect(verify({
      mutateClaims: claims => Object.assign(claims, {
        iat: now,
        nbf: now,
        exp: now + 600,
      }),
    })).resolves.toMatchObject({ pagesRunId: '41' })
  })

  it('accepts the documented ten-minute not-before skew boundary', async () => {
    await expect(verify({
      mutateClaims: claims => Object.assign(claims, {
        iat: now,
        nbf: now - 600,
        exp: now + 60,
      }),
    })).resolves.toMatchObject({ pagesRunId: '41' })
  })

  it.each([
    ['empty JTI', ''],
    ['uppercase JTI', '123E4567-E89B-42D3-A456-426614174000'],
    ['non-UUID JTI', 'abcdefghijklmnop'],
  ])('rejects a %s', async (_name, jti) => {
    await invalidOidc({ mutateClaims: claims => { claims.jti = jti } })
  })

  it('rejects a duplicate signed claim even when the signature covers both values', async () => {
    await invalidOidc({
      claimsText: claims => JSON.stringify(claims).replace(
        '"iss":"https://token.actions.githubusercontent.com"',
        '"iss":"https://attacker.test","iss":"https://token.actions.githubusercontent.com"',
      ),
    })
  })

  it('rejects an undocumented extra signed claim', async () => {
    await invalidOidc({ mutateClaims: claims => { claims.untrusted = 'value' } })
  })

  it.each([
    ['actor', 'actor', '-invalid'],
    ['actor ID', 'actor_id', 183124839],
    ['base ref', 'base_ref', 'refs/tags/v0.4.0'],
    ['environment node ID', 'environment_node_id', ''],
    ['enterprise', 'enterprise', '-invalid'],
    ['enterprise ID', 'enterprise_id', '0'],
    ['head ref', 'head_ref', 'refs/tags/v0.4.0'],
    ['job workflow ref', 'job_workflow_ref', 'attacker/fork/.github/workflows/deploy.yml@refs/heads/main'],
    ['job workflow SHA', 'job_workflow_sha', 'b'.repeat(40)],
    ['ref type', 'ref_type', 'tag'],
    ['repository owner', 'repository_owner', 'attacker'],
    ['repository visibility', 'repository_visibility', 'private'],
    ['run number', 'run_number', '0300'],
  ])('rejects a documented optional %s claim with the wrong value or shape', async (
    _name,
    key,
    replacement,
  ) => {
    await invalidOidc({ mutateClaims: claims => { claims[key] = replacement } })
  })

  it.each([
    ['unsupported algorithm', (header: Record<string, unknown>) => { header.alg = 'none' }],
    ['wrong type', (header: Record<string, unknown>) => { header.typ = 'JOSE' }],
    ['empty key ID', (header: Record<string, unknown>) => { header.kid = '' }],
    ['extra parameter', (header: Record<string, unknown>) => { header.jku = 'https://attacker.test/jwks' }],
  ])('rejects a strict protected header with %s', async (_name, mutateHeader) => {
    await invalidOidc({ mutateHeader })
  })

  it('rejects duplicate protected-header names', async () => {
    await invalidOidc({
      headerText: header => JSON.stringify(header).replace(
        '"kid":"fixture"',
        '"kid":"attacker","kid":"fixture"',
      ),
    })
  })

  it.each([
    ['noncanonical x5t', 'not-base64url='],
    ['wrong-length x5t', canonicalX5t(19, 1)],
  ])('rejects a protected header with %s', async (_name, x5t) => {
    await invalidOidc({ mutateHeader: header => { header.x5t = x5t } })
  })

  it('rejects a protected-header x5t that differs from the selected JWKS key', async () => {
    await invalidOidc({ mutateHeader: header => { header.x5t = canonicalX5t(20, 9) } })
  })

  it('rejects a protected-header x5t when the selected key has no matching x5t metadata', async () => {
    await invalidOidc({ mutateJwks: jwks => { delete (jwks.keys as Record<string, unknown>[])[0]!.x5t } })
  })

  it('accepts a current minimal RSA JWKS key without certificate metadata', async () => {
    await expect(verify({
      mutateHeader: header => { delete header.x5t },
      mutateJwks: jwks => {
        const key = (jwks.keys as Record<string, unknown>[])[0]!
        delete key.x5c; delete key.x5t; delete key['x5t#S256']
      },
    })).resolves.toMatchObject({ checkRunId: '91' })
  })

  it('accepts an x5c/x5t JWKS key without x5t#S256', async () => {
    await expect(verify({ mutateJwks: jwks => { delete (jwks.keys as Record<string, unknown>[])[0]!['x5t#S256'] } }))
      .resolves.toMatchObject({ checkRunId: '91' })
  })

  it.each([
    ['padded header', (segments: string[]) => { segments[0] = `${segments[0]}=` }],
    ['invalid claims alphabet', (segments: string[]) => { segments[1] = `*${segments[1]!.slice(1)}` }],
    ['missing signature segment', (segments: string[]) => { segments.pop() }],
    ['extra compact segment', (segments: string[]) => { segments.push('extra') }],
  ])('rejects a compact JWT with a %s', async (_name, mutateSegments) => {
    const fixture = await signedFixture()
    const segments = fixture.token.split('.')
    mutateSegments(segments)
    await expect(verifyGitHubWorkflowIdentity({
      token: segments.join('.'),
      candidateCommit,
      environment: fixture.environment,
      fetch: fixture.fetch,
      nowSeconds: now,
    })).rejects.toThrowError('RECOVERY_GITHUB_OIDC_INVALID')
  })

  it.each([
    ['noncanonical base64url', (signature: string) => `${signature}=`],
    ['changed signature', (signature: string) => `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`],
    ['truncated signature', (signature: string) => signature.slice(0, -2)],
  ])('rejects a %s signature segment', async (_name, mutateSignature) => {
    await invalidOidc({ mutateSignature })
  })

  it('rejects duplicate JWKS key IDs as ambiguous', async () => {
    await invalidOidc({
      mutateJwks: jwks => {
        const keys = jwks.keys as Array<Record<string, unknown>>
        keys.push({ ...keys[0] })
      },
    })
  })

  it('rejects the same RSA authority under two different JWKS key IDs', async () => {
    await invalidOidc({
      mutateJwks: jwks => {
        const keys = jwks.keys as Array<Record<string, unknown>>
        keys.push({ ...keys[0], kid: 'alias' })
      },
    })
  })

  it.each([
    ['key type', 'kty', 'EC'],
    ['algorithm', 'alg', 'RS512'],
    ['use', 'use', 'enc'],
    ['noncanonical exponent', 'e', 'AQAB='],
    ['extra authority field', 'jku', 'https://attacker.test/jwks'],
  ])('rejects a JWKS key with unsupported %s', async (_name, key, replacement) => {
    await invalidOidc({
      mutateJwks: jwks => {
        const first = (jwks.keys as Array<Record<string, unknown>>)[0]!
        first[key] = replacement
      },
    })
  })

  it('rejects a noncanonical RSA modulus', async () => {
    await invalidOidc({
      mutateJwks: jwks => {
        const first = (jwks.keys as Array<Record<string, unknown>>)[0]!
        first.n = `${oidcPublicJwk.n}=`
      },
    })
  })

  it.each([
    ['certificate chain', 'x5c', ['not canonical base64!']],
    ['certificate-chain count', 'x5c', Array.from({ length: 9 }, () => btoa('certificate'))],
    ['certificate size', 'x5c', [btoa('a'.repeat(12_289))]],
    ['SHA-1 thumbprint', 'x5t', 'short'],
    ['SHA-256 thumbprint', 'x5t#S256', canonicalX5t(31, 2)],
  ])('rejects malformed bounded JWKS %s metadata', async (_name, key, replacement) => {
    await invalidOidc({
      mutateJwks: jwks => {
        const first = (jwks.keys as Array<Record<string, unknown>>)[0]!
        first[key] = replacement
      },
    })
  })

  it.each([
    ['unknown metadata', (discovery: Record<string, unknown>) => { discovery.authorization_endpoint = 'https://attacker.test' }],
    ['wrong issuer', (discovery: Record<string, unknown>) => { discovery.issuer = 'https://attacker.test' }],
    ['wrong JWKS URL', (discovery: Record<string, unknown>) => { discovery.jwks_uri = 'https://attacker.test/jwks' }],
    ['unsupported algorithms', (discovery: Record<string, unknown>) => { discovery.id_token_signing_alg_values_supported = ['RS512'] }],
    ['malformed claim list', (discovery: Record<string, unknown>) => { discovery.claims_supported = [1] }],
  ])('rejects discovery with %s', async (_name, mutateDiscovery) => {
    await expect(verify({ mutateDiscovery })).rejects.toThrowError('RECOVERY_GITHUB_OIDC_HTTP_INVALID')
  })

  it('does not alias distinct check-run IDs above 2^53', async () => {
    await invalidOidc({
      mutateClaims: claims => { claims.check_run_id = '9007199254740992' },
      checkRunText: checkRun => JSON.stringify(checkRun).replace(
        '"id":91',
        '"id":9007199254740993',
      ),
    })
  })

  it.each([
    ['ID', (checkRun: Record<string, unknown>) => { checkRun.id = 92 }],
    ['job name', (checkRun: Record<string, unknown>) => { checkRun.name = 'build' }],
    ['candidate SHA', (checkRun: Record<string, unknown>) => { checkRun.head_sha = 'b'.repeat(40) }],
    ['API URL', (checkRun: Record<string, unknown>) => { checkRun.url = 'https://api.github.com/repos/ael-dev3/Warpkeep/check-runs/92' }],
    ['HTML URL', (checkRun: Record<string, unknown>) => { checkRun.html_url = 'https://github.com/ael-dev3/Warpkeep/runs/91' }],
    ['details URL', (checkRun: Record<string, unknown>) => { checkRun.details_url = 'https://github.com/ael-dev3/Warpkeep/actions/runs/42/job/91' }],
    ['completed state at issuance', (checkRun: Record<string, unknown>) => { checkRun.status = 'completed'; checkRun.conclusion = 'success' }],
    ['check-suite candidate', (checkRun: Record<string, unknown>) => { (checkRun.check_suite as Record<string, unknown>).head_sha = 'b'.repeat(40) }],
    ['check-suite branch', (checkRun: Record<string, unknown>) => { (checkRun.check_suite as Record<string, unknown>).head_branch = 'release' }],
    ['check-suite status', (checkRun: Record<string, unknown>) => { (checkRun.check_suite as Record<string, unknown>).status = 'completed' }],
    ['check-suite ID', (checkRun: Record<string, unknown>) => { (checkRun.check_suite as Record<string, unknown>).id = 78 }],
    ['non-Actions app', (checkRun: Record<string, unknown>) => { (checkRun.app as Record<string, unknown>).slug = 'attacker-app' }],
    ['wrong Actions app name', (checkRun: Record<string, unknown>) => { (checkRun.app as Record<string, unknown>).name = 'Attacker Actions' }],
  ])('rejects mismatched check-run %s metadata', async (_name, mutateCheckRun) => {
    await invalidOidc({ mutateCheckRun })
  })

  it.each([
    ['run ID', (run: Record<string, unknown>) => { run.id = 42 }],
    ['run attempt', (run: Record<string, unknown>) => { run.run_attempt = 3 }],
    ['workflow name', (run: Record<string, unknown>) => { run.name = 'Other workflow' }],
    ['workflow path', (run: Record<string, unknown>) => { run.path = '.github/workflows/other.yml@main' }],
    ['workflow path ref', (run: Record<string, unknown>) => { run.path = '.github/workflows/deploy-pages.yml@release' }],
    ['event', (run: Record<string, unknown>) => { run.event = 'push' }],
    ['branch', (run: Record<string, unknown>) => { run.head_branch = 'release' }],
    ['candidate SHA', (run: Record<string, unknown>) => { run.head_sha = 'b'.repeat(40) }],
    ['API URL', (run: Record<string, unknown>) => { run.url = 'https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/42' }],
    ['jobs URL', (run: Record<string, unknown>) => { run.jobs_url = 'https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/41/jobs' }],
    ['workflow URL', (run: Record<string, unknown>) => { run.workflow_url = 'https://api.github.com/repos/ael-dev3/Warpkeep/actions/workflows/20' }],
    ['check-suite ID', (run: Record<string, unknown>) => { run.check_suite_id = 78 }],
    ['check-suite URL', (run: Record<string, unknown>) => { run.check_suite_url = 'https://api.github.com/repos/ael-dev3/Warpkeep/check-suites/78' }],
    ['head commit', (run: Record<string, unknown>) => { (run.head_commit as Record<string, unknown>).id = 'b'.repeat(40) }],
    ['repository name', (run: Record<string, unknown>) => { (run.repository as Record<string, unknown>).full_name = 'attacker/fork' }],
    ['repository ID', (run: Record<string, unknown>) => { (run.repository as Record<string, unknown>).id = 1 }],
    ['head repository', (run: Record<string, unknown>) => { (run.head_repository as Record<string, unknown>).full_name = 'attacker/fork' }],
    ['completed state at issuance', (run: Record<string, unknown>) => { run.status = 'completed'; run.conclusion = 'success' }],
  ])('rejects mismatched Pages run-attempt %s metadata', async (_name, mutateRunAttempt) => {
    await invalidOidc({ mutateRunAttempt })
  })

  it('accepts the exact bare workflow path shape returned by live run-attempt responses', async () => {
    await expect(verify({ mutateRunAttempt: run => { run.path = '.github/workflows/deploy-pages.yml' } }))
      .resolves.toMatchObject({ pagesRunId: '41' })
  })

  it('rejects a Pages attempt with no deploy-recovery job', async () => {
    await invalidOidc({ mutateJobs: jobs => { jobs.total_count = 0; jobs.jobs = [] } })
  })

  it('rejects a Pages attempt with multiple deploy-recovery jobs', async () => {
    await invalidOidc({
      mutateJobs: jobs => {
        const entries = jobs.jobs as Array<Record<string, unknown>>
        entries.push({ ...entries[0], id: 92 })
        jobs.total_count = entries.length
      },
    })
  })

  it.each([
    ['ID', (job: Record<string, unknown>) => { job.id = 92 }],
    ['run ID', (job: Record<string, unknown>) => { job.run_id = 42 }],
    ['run attempt', (job: Record<string, unknown>) => { job.run_attempt = 3 }],
    ['workflow name', (job: Record<string, unknown>) => { job.workflow_name = 'Other workflow' }],
    ['branch', (job: Record<string, unknown>) => { job.head_branch = 'release' }],
    ['candidate SHA', (job: Record<string, unknown>) => { job.head_sha = 'b'.repeat(40) }],
    ['run URL', (job: Record<string, unknown>) => { job.run_url = 'https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/42' }],
    ['check-run URL', (job: Record<string, unknown>) => { job.check_run_url = 'https://api.github.com/repos/ael-dev3/Warpkeep/check-runs/92' }],
    ['job API URL', (job: Record<string, unknown>) => { job.url = 'https://api.github.com/repos/ael-dev3/Warpkeep/check-runs/92' }],
    ['check node ID', (job: Record<string, unknown>) => { job.node_id = 'CR_attacker' }],
    ['job HTML URL', (job: Record<string, unknown>) => { job.html_url = 'https://github.com/ael-dev3/Warpkeep/actions/runs/42/job/91' }],
    ['completed state at issuance', (job: Record<string, unknown>) => { job.status = 'completed'; job.conclusion = 'success' }],
    ['runner label', (job: Record<string, unknown>) => { job.labels = ['self-hosted'] }],
    ['runner name', (job: Record<string, unknown>) => { job.runner_name = 'self-hosted-1' }],
    ['runner group', (job: Record<string, unknown>) => { job.runner_group_name = 'Default' }],
    ['runner group ID', (job: Record<string, unknown>) => { job.runner_group_id = 1 }],
    ['null selected runner ID', (job: Record<string, unknown>) => { job.runner_id = null }],
    ['null selected runner group ID', (job: Record<string, unknown>) => { job.runner_group_id = null }],
  ])('rejects mismatched deploy-recovery job %s metadata', async (_name, mutateJob) => {
    await invalidOidc({
      mutateJobs: jobs => mutateJob((jobs.jobs as Array<Record<string, unknown>>)[0]!),
    })
  })

  it('rejects a partially null runner assignment on a non-selected sibling', async () => {
    await invalidOidc({
      mutateJobs: jobs => {
        const sibling = (jobs.jobs as Array<Record<string, unknown>>)[1]!
        sibling.runner_name = 'GitHub Actions 2'
      },
    })
  })

  it.each([
    ['exponent runner ID', (body: string) => body.replace('"runner_id":1001', '"runner_id":1e3')],
    ['leading-zero group ID', (body: string) => body.replace('"runner_group_id":0', '"runner_group_id":00')],
    ['fractional group ID', (body: string) => body.replace('"runner_group_id":0', '"runner_group_id":0.0')],
    ['negative runner ID', (body: string) => body.replace('"runner_id":1001', '"runner_id":-1')],
  ])('rejects malformed nullable job identity with %s', async (_name, mutate) => {
    await invalidOidc({ jobsText: jobs => mutate(JSON.stringify(jobs)) })
  })

  it('rejects an accessor input with the stable OIDC code', async () => {
    const input: Record<string, unknown> = {
      candidateCommit,
      environment: appEnvironment,
      fetch: (() => undefined) as unknown as typeof fetch,
      nowSeconds: now,
    }
    Object.defineProperty(input, 'token', {
      enumerable: true,
      get() { throw new Error('getter secret') },
    })

    await expect(verifyGitHubWorkflowIdentity(input as never))
      .rejects.toThrowError('RECOVERY_GITHUB_OIDC_INVALID')
  })

  it('rejects a hostile proxy input before using its otherwise valid values', async () => {
    const fixture = await signedFixture()
    const input = new Proxy({
      token: fixture.token,
      candidateCommit,
      environment: fixture.environment,
      fetch: fixture.fetch,
      nowSeconds: now,
    }, {
      getOwnPropertyDescriptor() { throw new Error('proxy secret') },
    })

    await expect(verifyGitHubWorkflowIdentity(input))
      .rejects.toThrowError('RECOVERY_GITHUB_OIDC_INVALID')
  })
})
