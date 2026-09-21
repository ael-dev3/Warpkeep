import { describe, expect, it } from 'vitest'
import { verifyPreparationWorkflowIdentity } from '../src/preparationOidc.js'
import { preparationFixture } from './preparationFixture.js'

async function verify(options: Parameters<typeof preparationFixture>[0] = {}) {
  const { calls, ...input } = await preparationFixture(options)
  return { ...await verifyPreparationWorkflowIdentity(input), calls }
}
describe('preparation-specific GitHub authentication', () => {
  it('authenticates ordinary workflow with genuine signatures and preserves large integer metadata IDs', async () => {
    const result = await verify()
    expect(result.identity).toEqual({ preparationCommit: 'c'.repeat(40), preparationTree: 'd'.repeat(40),
      runId: '9007199254740995', runAttempt: '2', checkRunId: '9007199254740993' })
    expect(result.calls.at(-1)).toContain('/branches/main')
  })
  it.each([
    { aud: 'warpkeep-release-recovery' }, { environment: 'github-pages' },
    { workflow_sha: 'e'.repeat(40) }, { repository_id: '123' }, { event_name: 'pull_request' },
    { job_workflow_ref: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main' },
  ])('refuses another purpose or execution context: %j', claims => {
    return expect(verify({ claims })).rejects.toThrow()
  })
  it.each(['branch', 'job', 'check', 'workflow', 'rerun'])('refuses authenticated metadata mismatch: %s', kind => {
    return expect(verify({ mutate: (url, value) => {
      if (kind === 'branch' && url.endsWith('/branches/main')) value.protected = false
      if (kind === 'job' && url.includes('/jobs?per_page=100&page=')) (value.jobs as Record<string, unknown>[]).at(-1)!.head_sha = 'e'.repeat(40)
      if (kind === 'check' && url.includes('/check-runs/')) value.head_sha = 'e'.repeat(40)
      if (kind === 'workflow' && url.includes('/actions/workflows/')) value.state = 'disabled_manually'
      if (kind === 'rerun' && url.endsWith('/actions/runs/9007199254740995')) value.run_attempt = 3
    } })).rejects.toThrow()
  })
  it('does not correlate two absent workflow IDs as equal', () => {
    return expect(verify({ mutate: (url, value) => {
      if (url.includes('/actions/workflows/')) delete value.id
      if (url.endsWith('/attempts/2')) delete value.workflow_id
    } })).rejects.toThrow()
  })

  it('finds the active job after paginating skipped siblings without a check_run_id claim', async () => {
    const result = await verify({ jobCount: 101 })
    expect(result.identity.checkRunId).toBe('9007199254740993')
    expect(result.calls.filter(url => url.includes('/jobs?'))).toEqual([
      expect.stringContaining('per_page=100&page=1'), expect.stringContaining('per_page=100&page=2'),
    ])
  })

  it('accepts a matching optional check_run_id claim', async () => {
    await expect(verify({ claims: { check_run_id: '9007199254740993' } }))
      .resolves.toMatchObject({ identity: { checkRunId: '9007199254740993' } })
  })

  it.each(['91', '09007199254740993', 9007199254740993, null])('refuses a mismatched or malformed optional check_run_id: %s', checkRunId => {
    return expect(verify({ claims: { check_run_id: checkRunId } })).rejects.toThrow()
  })

  it.each(['duplicate target', 'missing target', 'active sibling', 'duplicate ID', 'truncated page', 'changed total'])
    ('rejects ambiguous or incomplete current job metadata: %s', kind => {
      return expect(verify({ jobCount: 101, mutate: (url, body) => {
        if (!url.includes('/jobs?')) return
        const jobs = body.jobs as Record<string, unknown>[]
        if (kind === 'duplicate target' && url.endsWith('page=1')) jobs[0]!.name = 'operate'
        if (kind === 'missing target' && url.endsWith('page=2')) jobs[0]!.name = 'other'
        if (kind === 'active sibling' && url.endsWith('page=1')) jobs[0]!.status = 'in_progress'
        if (kind === 'duplicate ID' && url.endsWith('page=1')) jobs[1]!.id = jobs[0]!.id
        if (kind === 'truncated page' && url.endsWith('page=1')) jobs.pop()
        if (kind === 'changed total' && url.endsWith('page=2')) body.total_count = 102
      } })).rejects.toThrow()
    })

  it('uses a request-scoped workflow token only for API reads after signed OIDC verification', async () => {
    const fixture = await preparationFixture()
    const calls: string[] = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)
      if (url.startsWith('https://api.github.com/')) {
        expect(url).not.toContain('/app/installations/')
        expect(init?.method ?? 'GET').toBe('GET')
        const headers = new Headers(init?.headers)
        expect(headers.get('authorization')).toBe('Bearer workflow-token')
        headers.set('authorization', 'Bearer installation-token')
        return fixture.fetch(input, { ...init, headers })
      }
      return fixture.fetch(input, init)
    }) as typeof fetch
    await expect(verifyPreparationWorkflowIdentity({ token: fixture.token, preparationCommit: fixture.preparationCommit,
      environment: { GITHUB_WORKFLOW_TOKEN: 'workflow-token' }, fetch: fetcher, nowSeconds: fixture.nowSeconds }))
      .resolves.toMatchObject({ identity: { checkRunId: '9007199254740993' } })
    expect(calls.slice(0, 2)).toEqual([expect.stringContaining('openid-configuration'), expect.stringContaining('/jwks')])
  })

  it('rejects invalid signed workflow context before using the supplied API token', async () => {
    const fixture = await preparationFixture({ claims: { repository: 'attacker/fork' } })
    await expect(verifyPreparationWorkflowIdentity({ token: fixture.token, preparationCommit: fixture.preparationCommit,
      environment: { GITHUB_WORKFLOW_TOKEN: 'workflow-token' }, fetch: fixture.fetch, nowSeconds: fixture.nowSeconds }))
      .rejects.toThrow()
    expect(fixture.calls.some(url => url.startsWith('https://api.github.com/'))).toBe(false)
  })
})
