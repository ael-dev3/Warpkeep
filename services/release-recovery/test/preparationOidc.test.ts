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
      if (kind === 'job' && url.endsWith('/jobs?per_page=100')) (value.jobs as Record<string, unknown>[])[0]!.head_sha = 'e'.repeat(40)
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
})
