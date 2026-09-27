import { describe, expect, it } from 'vitest'
import { verifyPtrObservationWorkflowIdentity } from '../src/ptrObservationOidc.js'
import { ptrObservationOidcFixture } from './ptrObservationOidcFixture.js'
import * as observationOidc from '../src/ptrObservationOidc.js'

async function verify(options: Parameters<typeof ptrObservationOidcFixture>[0] = {}) {
  const { calls, ...input } = await ptrObservationOidcFixture(options)
  return { ...await verifyPtrObservationWorkflowIdentity(input), calls }
}

describe('existing PTR observation GitHub authentication', () => {
  it('binds the dedicated current Linux job on false-protection main and exhausts every jobs page', async () => {
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
    { workflow_sha: 'e'.repeat(40) }, { ref_protected: undefined }, { ref_protected: 'False' },
    { ref_protected: false }, { event_name: 'pull_request' },
    { jti: '223e4567-e89b-42d3-a456-426614174000' },
    { check_run_id: '9007199254740994' },
    { job_workflow_ref: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main' },
  ])('refuses another purpose, request or execution context: %j', claims => {
    return expect(verify({ claims })).rejects.toThrow()
  })

  it('accepts an optional check_run_id only when it matches the authenticated current job', async () => {
    await expect(verify({ claims: { check_run_id: '9007199254740993' } }))
      .resolves.toMatchObject({ identity: { checkRunId: '9007199254740993' } })
  })
  it('also accepts explicit true protection flags when main has branch protection', async () => {
    await expect(verify({ claims: { ref_protected: 'true' }, mutate: (url, value) => {
      if (url.endsWith('/branches/main')) value.protected = true
    } })).resolves.toMatchObject({ identity: { sourceCommit: 'c'.repeat(40) } })
  })

  it.each(['0', '09007199254740993', 9007199254740993, null])('rejects a malformed optional check_run_id: %s', checkRunId => {
    return expect(verify({ claims: { check_run_id: checkRunId } })).rejects.toThrow()
  })

  it.each(['job-name', 'runner', 'active-sibling', 'truncated', 'rerun', 'branch',
    'missing branch flag', 'malformed branch flag'])(
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
        if (kind === 'branch' && url.endsWith('/branches/main')) value.commit = { sha: 'e'.repeat(40) }
        if (kind === 'missing branch flag' && url.endsWith('/branches/main')) delete value.protected
        if (kind === 'malformed branch flag' && url.endsWith('/branches/main')) value.protected = 'false'
      } })).rejects.toThrow()
    },
  )
  it.each([
    'Sealed Realms Production',
    `ptr-update-inspect @ ${'c'.repeat(40)}`,
    `ptr-state-inspect @ ${'e'.repeat(40)}`,
  ])('rejects a run name outside the PTR state operation and SHA: %s', name => {
    return expect(verify({ mutate: (url, value) => {
      if (url.endsWith('/attempts/2')) value.name = name
    } })).rejects.toThrow()
  })
})

async function updateFixture(options: Parameters<typeof ptrObservationOidcFixture>[0] = {}) {
  return ptrObservationOidcFixture({ ...options, operation: options.operation ?? 'ptr-update-inspect',
    claims: { aud: 'https://release-auth.warpkeep.com/ptr-update-observation', ...options.claims },
    mutate(url, value) {
      if (url.includes('/jobs?')) for (const job of value.jobs as Record<string, unknown>[])
        if (job.name === 'observe_ptr') job.name = 'operate_ptr'
      if (value.name === 'observe_ptr') value.name = 'operate_ptr'
      options.mutate?.(url, value)
    } })
}
describe('separate PTR update observation GitHub authentication', () => {
  it('authenticates the exact operate_ptr job with a distinct audience and lossless original job coordinates', async () => {
    expect(typeof observationOidc.verifyPtrUpdateObservationWorkflowIdentity).toBe('function')
    const { calls, ...input } = await updateFixture({ jobCount: 101 })
    const result = await observationOidc.verifyPtrUpdateObservationWorkflowIdentity(input)
    expect(result.identity).toMatchObject({ runId: '9007199254740995', checkRunId: '9007199254740993', runAttempt: '2' })
    expect(calls.filter(url => url.includes('/jobs?'))).toHaveLength(2)
    await expect(verifyPtrObservationWorkflowIdentity(input)).rejects.toThrow()
  })
  it('accepts either PTR update operation on the exact source SHA', async () => {
    for (const operation of ['ptr-update-inspect', 'ptr-update-apply'] as const) {
      const { calls: _calls, ...input } = await updateFixture({ operation })
      await expect(observationOidc.verifyPtrUpdateObservationWorkflowIdentity(input))
        .resolves.toMatchObject({ identity: { sourceCommit: 'c'.repeat(40) } })
    }
  })
  it.each([
    'Sealed Realms Production',
    `g002-update-inspect @ ${'c'.repeat(40)}`,
    `ptr-update-inspect @ ${'e'.repeat(40)}`,
  ])('rejects a PTR update run outside its operation and SHA allowlist: %s', name => {
    return updateFixture({ mutate: (url, value) => {
      if (url.endsWith('/attempts/2')) value.name = name
    } }).then(({ calls: _calls, ...input }) =>
      expect(observationOidc.verifyPtrUpdateObservationWorkflowIdentity(input)).rejects.toThrow())
  })
  it('rejects a proxy before reading its selected identity or transport', async () => {
    const { calls: _calls, ...input } = await updateFixture()
    let trapped = false
    await expect(observationOidc.verifyPtrUpdateObservationWorkflowIdentity(new Proxy(input, {
      ownKeys(target) { trapped = true; return Reflect.ownKeys(target) },
    }))).rejects.toThrow()
    expect(trapped).toBe(false)
  })
  it.each(['audience', 'observe-job', 'foreign-event', 'active-sibling', 'duplicate-target', 'wrong-runner', 'rerun', 'branch-moved', 'wrong-tree'])(
    'refuses mismatched update identity: %s', async kind => {
      const { calls: _calls, ...input } = await updateFixture({
        claims: kind === 'audience' ? { aud: 'https://release-auth.warpkeep.com/ptr-observation' }
          : kind === 'foreign-event' ? { event_name: 'pull_request' } : {},
        mutate(url, value) {
          if (url.includes('/jobs?')) {
            const jobs = value.jobs as Record<string, unknown>[]
            if (kind === 'observe-job') jobs.at(-1)!.name = 'observe_ptr'
            if (kind === 'active-sibling') Object.assign(jobs[0]!, { status: 'in_progress', conclusion: null })
            if (kind === 'duplicate-target') jobs[0]!.name = 'operate_ptr'
            if (kind === 'wrong-runner') jobs.at(-1)!.runner_name = 'untrusted'
          }
          if (kind === 'rerun' && url.endsWith('/actions/runs/9007199254740995')) value.run_attempt = 3
          if (kind === 'branch-moved' && url.endsWith('/branches/main')) value.commit = { sha: 'e'.repeat(40) }
          if (kind === 'wrong-tree' && url.includes('/git/commits/')) value.tree = { sha: 'bad' }
        } })
      await expect(observationOidc.verifyPtrUpdateObservationWorkflowIdentity(input)).rejects.toThrow()
    })
})

describe('separate G002 update observation GitHub authentication', () => {
  async function g002Fixture(operation: 'g002-update-inspect' | 'g002-update-apply') {
    return ptrObservationOidcFixture({ operation,
      claims: { aud: 'https://release-auth.warpkeep.com/g002-update-observation' },
      mutate(url, value) {
        if (url.includes('/jobs?')) for (const job of value.jobs as Record<string, unknown>[])
          if (job.name === 'observe_ptr') job.name = 'operate_g002'
        if (value.name === 'observe_ptr') value.name = 'operate_g002'
      } })
  }
  it.each(['g002-update-inspect', 'g002-update-apply'] as const)(
    'accepts the exact G002 %s run with false protection flags', async operation => {
      const { calls: _calls, ...input } = await g002Fixture(operation)
      await expect(observationOidc.verifyG002UpdateObservationWorkflowIdentity(input))
        .resolves.toMatchObject({ identity: { sourceCommit: 'c'.repeat(40) } })
    })
  it('rejects a PTR update operation even with a valid G002 audience and job', async () => {
    const { calls: _calls, ...input } = await ptrObservationOidcFixture({ operation: 'ptr-update-apply',
      claims: { aud: 'https://release-auth.warpkeep.com/g002-update-observation' },
      mutate(url, value) {
        if (url.includes('/jobs?')) for (const job of value.jobs as Record<string, unknown>[])
          if (job.name === 'observe_ptr') job.name = 'operate_g002'
        if (value.name === 'observe_ptr') value.name = 'operate_g002'
      } })
    await expect(observationOidc.verifyG002UpdateObservationWorkflowIdentity(input)).rejects.toThrow()
  })
})
