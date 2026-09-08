import { base64UrlEncode } from '../src/protocol.js'
import { PREPARATION_AUDIENCE, PREPARATION_ENVIRONMENT, PREPARATION_WORKFLOW_REF } from '../src/preparationPolicy.js'

export const preparationPolicy = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-policy-v1', enabled: true,
  authorizationEpoch: 3, workflowRef: PREPARATION_WORKFLOW_REF, environment: PREPARATION_ENVIRONMENT,
  operation: 'activation-evidence-generate' }
export const preparationPrivateJwk = { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
  y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA', d: '3Cfq7fh3QQUIL6yuWLcD7fYN4-26tQgG07i-8nj462o' }
export async function preparationFixture(options: Readonly<{
  now?: number; claims?: Record<string, unknown>; mutate?: (url: string, value: Record<string, unknown>) => void
}> = {}) {
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const sha = 'c'.repeat(40), tree = 'd'.repeat(40)
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const environment = { GITHUB_APP_ID: '17', GITHUB_APP_INSTALLATION_ID: '23',
    GITHUB_APP_PRIVATE_KEY_PEM: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----` }
  const claims = { iss: 'https://token.actions.githubusercontent.com', aud: PREPARATION_AUDIENCE,
    sub: `repo:ael-dev3/Warpkeep:environment:${PREPARATION_ENVIRONMENT}`, repository: 'ael-dev3/Warpkeep',
    repository_id: '1273513252', repository_owner_id: '183124839', ref: 'refs/heads/main', sha,
    ref_protected: 'true', workflow: 'Sealed Realms Production', workflow_ref: PREPARATION_WORKFLOW_REF,
    workflow_sha: sha, environment: PREPARATION_ENVIRONMENT, event_name: 'workflow_dispatch', runner_environment: 'self-hosted',
    check_run_id: '9007199254740993', run_id: '9007199254740995', run_attempt: '2',
    jti: '123e4567-e89b-42d3-a456-426614174000', iat: now - 5, nbf: now - 5, exp: now + 300, ...options.claims }
  const encoder = new TextEncoder()
  const unsigned = `${base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', kid: 'fixture', typ: 'JWT' })))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`
  const token = `${unsigned}.${base64UrlEncode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(unsigned))))}`
  const calls: string[] = []
  const api = 'https://api.github.com/repos/ael-dev3/Warpkeep'
  const checkUrl = `${api}/check-runs/${claims.check_run_id}`
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    let body: Record<string, unknown>
    let status = 200
    if (url.endsWith('/openid-configuration')) body = { issuer: 'https://token.actions.githubusercontent.com', jwks_uri: 'https://token.actions.githubusercontent.com/.well-known/jwks' }
    else if (url.endsWith('/jwks')) body = { keys: [{ kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'fixture', n: jwk.n, e: jwk.e }] }
    else if (url === 'https://api.github.com/app/installations/23/access_tokens') {
      if (init?.method !== 'POST' || !new Headers(init.headers).get('authorization')?.startsWith('Bearer ey')) throw new Error('unauthenticated installation')
      status = 201
      body = { token: 'installation-token', expires_at: new Date((now + 3600) * 1000).toISOString(),
        permissions: { actions: 'read', checks: 'read', contents: 'read', deployments: 'read', metadata: 'read', pages: 'read' },
        repository_selection: 'selected', repositories: [{ full_name: 'ael-dev3/Warpkeep', id: 1273513252,
          name: 'Warpkeep', private: false, owner: { login: 'ael-dev3', id: 183124839 } }] }
    } else {
      if (new Headers(init?.headers).get('authorization') !== 'Bearer installation-token') throw new Error('unauthenticated metadata')
      if (url === checkUrl) body = { id: '__CHECK__', head_sha: sha, name: 'operate', status: 'in_progress', conclusion: null,
        url: checkUrl, app: { id: 15368, slug: 'github-actions' }, check_suite: { id: 77 } }
      else if (url.endsWith('/jobs?per_page=100')) body = { total_count: 1, jobs: [{ id: '__CHECK__', run_id: '__RUN__', run_attempt: 2,
        head_sha: sha, name: 'operate', status: 'in_progress', conclusion: null, check_run_url: checkUrl,
        labels: ['self-hosted', 'Linux', 'X64', 'warpkeep-production-admin', 'warpkeep-repository-exclusive'],
        runner_name: 'warpkeep-wsl-production-01', runner_group_name: 'Default', runner_id: 1, runner_group_id: 1 }] }
      else if (url.endsWith('/attempts/2')) body = { id: '__RUN__', run_attempt: 2, head_sha: sha, head_branch: 'main',
        event: 'workflow_dispatch', status: 'in_progress', conclusion: null, name: 'Sealed Realms Production',
        path: '.github/workflows/sealed-realms-production.yml', workflow_id: 42, check_suite_id: 77,
        repository: { id: 1273513252, full_name: 'ael-dev3/Warpkeep', owner: { id: 183124839 } }, head_repository: { id: 1273513252 } }
      else if (url.endsWith(`/actions/runs/${claims.run_id}`)) body = { id: '__RUN__', run_attempt: 2, head_sha: sha, status: 'in_progress', conclusion: null }
      else if (url.endsWith('/actions/workflows/sealed-realms-production.yml')) body = { id: 42, path: '.github/workflows/sealed-realms-production.yml', state: 'active' }
      else if (url === `${api}/git/commits/${sha}`) body = { sha, tree: { sha: tree } }
      else if (url.endsWith('/branches/main')) body = { name: 'main', protected: true, commit: { sha } }
      else throw new Error(`unexpected fixture URL: ${url}`)
    }
    options.mutate?.(url, body)
    // Exact JSON integer lexemes intentionally exceed Number.MAX_SAFE_INTEGER.
    const serialized = JSON.stringify(body).replaceAll('"__CHECK__"', '9007199254740993').replaceAll('"__RUN__"', '9007199254740995')
    const response = new Response(serialized, { status, headers: { 'content-type': 'application/json' } })
    Object.defineProperty(response, 'url', { value: url })
    return response
  }) as typeof fetch
  return { token, preparationCommit: sha, environment, fetch: fakeFetch, nowSeconds: now, calls }
}
