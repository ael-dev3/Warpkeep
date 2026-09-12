import { describe, expect, it } from 'vitest'
import { verifyPtrObservationWorkflowIdentity } from '../src/ptrObservationOidc.js'
import { ptrObservationOidcFixture } from './ptrObservationOidcFixture.js'

async function verify(options: Parameters<typeof ptrObservationOidcFixture>[0] = {}) {
  const { calls, ...input } = await ptrObservationOidcFixture(options)
  return { ...await verifyPtrObservationWorkflowIdentity(input), calls }
}

describe('existing PTR observation GitHub authentication', () => {
  it('binds the dedicated current Linux job and exhausts every jobs page before protected main', async () => {
    const result = await verify({ jobCount: 101 })
    expect(result.identity).toEqual({ sourceCommit: 'c'.repeat(40), sourceTree: 'd'.repeat(40),
      runId: '9007199254740995', runAttempt: '2', checkRunId: '9007199254740993',
      requestId: '123e4567-e89b-42d3-a456-426614174000' })
    expect(result.calls.filter(url => url.includes('/jobs?'))).toEqual([
      expect.stringContaining('per_page=100&page=1'), expect.stringContaining('per_page=100&page=2')])
    expect(result.calls.at(-1)).toContain('/branches/main')
  })

  it.each([
    { aud: 'https://release-auth.warpkeep.com/preparation' }, { environment: 'production' },
    { workflow_sha: 'e'.repeat(40) }, { ref_protected: 'false' }, { event_name: 'pull_request' },
    { jti: '223e4567-e89b-42d3-a456-426614174000' },
    { check_run_id: '9007199254740993' },
    { job_workflow_ref: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main' },
  ])('refuses another purpose, request or execution context: %j', claims => {
    return expect(verify({ claims })).rejects.toThrow()
  })

  it.each(['job-name', 'runner', 'active-sibling', 'truncated', 'rerun', 'branch'])(
    'refuses incomplete or mismatched authenticated workflow metadata: %s', kind => {
      return expect(verify({ jobCount: 101, mutate: (url, value) => {
        if (kind === 'job-name' && url.includes('/jobs?') && new URL(url).searchParams.get('page') === '2')
          (value.jobs as Record<string, unknown>[]).at(-1)!.name = 'operate_ptr'
        if (kind === 'runner' && url.includes('/jobs?') && new URL(url).searchParams.get('page') === '2')
          (value.jobs as Record<string, unknown>[]).at(-1)!.runner_name = 'github-hosted'
        if (kind === 'active-sibling' && url.includes('/jobs?') && new URL(url).searchParams.get('page') === '1')
          Object.assign((value.jobs as Record<string, unknown>[])[0]!, { status: 'in_progress', conclusion: null })
        if (kind === 'truncated' && url.includes('/jobs?') && new URL(url).searchParams.get('page') === '2')
          (value.jobs as Record<string, unknown>[]).pop()
        if (kind === 'rerun' && url.endsWith('/actions/runs/9007199254740995')) value.run_attempt = 3
        if (kind === 'branch' && url.endsWith('/branches/main')) value.protected = false
      } })).rejects.toThrow()
    },
  )
})
