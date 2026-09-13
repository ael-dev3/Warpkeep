import { base64UrlEncode } from '../src/protocol.js'
import { PTR_OBSERVATION_AUDIENCE } from '../src/ptrObservation.js'

const environmentName = 'notification-bridge-prepared'
const workflowRef = 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main'

export async function ptrObservationOidcFixture(options: Readonly<{
  now?: number
  claims?: Record<string, unknown>
  jobCount?: number
  runId?: string
  checkRunId?: string
  requestId?: string
  mutate?: (url: string, value: Record<string, unknown>) => void
}> = {}) {
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const sourceCommit = 'c'.repeat(40), sourceTree = 'd'.repeat(40)
  const requestId = options.requestId ?? '123e4567-e89b-42d3-a456-426614174000'
  const checkRunId = options.checkRunId ?? '9007199254740993', runId = options.runId ?? '9007199254740995'
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const environment = { GITHUB_APP_ID: '17', GITHUB_APP_INSTALLATION_ID: '23',
    GITHUB_APP_PRIVATE_KEY_PEM: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----` }
  const claims = { iss: 'https://token.actions.githubusercontent.com', aud: PTR_OBSERVATION_AUDIENCE,
    sub: `repo:ael-dev3/Warpkeep:environment:${environmentName}`, repository: 'ael-dev3/Warpkeep',
    repository_id: '1273513252', repository_owner_id: '183124839', ref: 'refs/heads/main', sha: sourceCommit,
    ref_protected: 'true', workflow: 'Sealed Realms Production', workflow_ref: workflowRef,
    workflow_sha: sourceCommit, environment: environmentName, event_name: 'workflow_dispatch', runner_environment: 'self-hosted',
    run_id: runId, run_attempt: '2', jti: requestId,
    iat: now - 5, nbf: now - 5, exp: now + 300, ...options.claims }
  const encoder = new TextEncoder()
  const unsigned = `${base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', kid: 'fixture', typ: 'JWT' })))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`
  const token = `${unsigned}.${base64UrlEncode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(unsigned))))}`
  const calls: string[] = [], api = 'https://api.github.com/repos/ael-dev3/Warpkeep'
  const checkUrl = `${api}/check-runs/${checkRunId}`
  const jobCount = options.jobCount ?? 5
  const jobs = Array.from({ length: jobCount }, (_, index) => index === jobCount - 1
    ? { id: '__CHECK__', run_id: '__RUN__', run_attempt: 2, head_sha: sourceCommit, name: 'observe_ptr',
        status: 'in_progress', conclusion: null, check_run_url: checkUrl,
        labels: ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive'],
        runner_name: 'warpkeep-wsl-production-01', runner_group_name: 'Default', runner_id: 1, runner_group_id: 1 }
    : { id: index + 1, run_id: '__RUN__', run_attempt: 2, head_sha: sourceCommit, name: `skipped-${index}`,
        status: 'completed', conclusion: 'skipped', check_run_url: `${api}/check-runs/${index + 1}`,
        labels: ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive'],
        runner_name: null, runner_group_name: null, runner_id: null, runner_group_id: null })
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    let body: Record<string, unknown>, status = 200
    if (url.endsWith('/openid-configuration')) body = { issuer: 'https://token.actions.githubusercontent.com', jwks_uri: 'https://token.actions.githubusercontent.com/.well-known/jwks' }
    else if (url.endsWith('/jwks')) body = { keys: [{ kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'fixture', n: jwk.n, e: jwk.e }] }
    else if (url === `${api}/app/installations/23/access_tokens`) throw new Error('bad API root')
    else if (url === 'https://api.github.com/app/installations/23/access_tokens') {
      if (init?.method !== 'POST' || !new Headers(init.headers).get('authorization')?.startsWith('Bearer ey')) throw new Error('unauthenticated installation')
      status = 201
      body = { token: 'installation-token', expires_at: new Date((now + 3600) * 1000).toISOString(),
        permissions: { actions: 'read', checks: 'read', contents: 'read', deployments: 'read', metadata: 'read', pages: 'read' },
        repository_selection: 'selected', repositories: [{ full_name: 'ael-dev3/Warpkeep', id: 1273513252,
          name: 'Warpkeep', private: false, owner: { login: 'ael-dev3', id: 183124839 } }] }
    } else {
      if (new Headers(init?.headers).get('authorization') !== 'Bearer installation-token') throw new Error('unauthenticated metadata')
      if (url === checkUrl) body = { id: '__CHECK__', head_sha: sourceCommit, name: 'observe_ptr', status: 'in_progress', conclusion: null,
        url: checkUrl, app: { id: 15368, slug: 'github-actions' }, check_suite: { id: 77 } }
      else if (url.includes('/jobs?per_page=100&page=')) {
        const page = Number(new URL(url).searchParams.get('page'))
        body = { total_count: jobCount, jobs: jobs.slice((page - 1) * 100, page * 100) }
      } else if (url.endsWith('/attempts/2')) body = { id: '__RUN__', run_attempt: 2, head_sha: sourceCommit, head_branch: 'main',
        event: 'workflow_dispatch', status: 'in_progress', conclusion: null, name: 'Sealed Realms Production',
        path: '.github/workflows/sealed-realms-production.yml', workflow_id: 42, check_suite_id: 77,
        repository: { id: 1273513252, full_name: 'ael-dev3/Warpkeep', owner: { id: 183124839 } }, head_repository: { id: 1273513252 } }
      else if (url.endsWith(`/actions/runs/${claims.run_id}`)) body = { id: '__RUN__', run_attempt: 2, head_sha: sourceCommit, status: 'in_progress', conclusion: null }
      else if (url.endsWith('/actions/workflows/sealed-realms-production.yml')) body = { id: 42, path: '.github/workflows/sealed-realms-production.yml', state: 'active' }
      else if (url === `${api}/git/commits/${sourceCommit}`) body = { sha: sourceCommit, tree: { sha: sourceTree } }
      else if (url.endsWith('/branches/main')) body = { name: 'main', protected: true, commit: { sha: sourceCommit } }
      else throw new Error(`unexpected fixture URL: ${url}`)
    }
    options.mutate?.(url, body)
    const serialized = JSON.stringify(body).replaceAll('"__CHECK__"', checkRunId).replaceAll('"__RUN__"', runId)
    const response = new Response(serialized, { status, headers: { 'content-type': 'application/json' } })
    Object.defineProperty(response, 'url', { value: url })
    return response
  }) as typeof fetch
  return { token, sourceCommit, requestId, environment, fetch: fakeFetch, nowSeconds: now, calls }
}
