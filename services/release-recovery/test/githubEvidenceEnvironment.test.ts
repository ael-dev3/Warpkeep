import { describe, expect, it, vi } from 'vitest'
import { resolveGitHubEvidenceToken, snapshotGitHubEvidenceEnvironment } from '../src/githubEvidence.js'
import { verifyPtrObservationWorkflowIdentity } from '../src/ptrObservationOidc.js'
import { ptrObservationOidcFixture } from './ptrObservationOidcFixture.js'

const code = 'RECOVERY_GITHUB_EVIDENCE_INVALID'
const legacy = { GITHUB_APP_ID: '17', GITHUB_APP_INSTALLATION_ID: '23', GITHUB_APP_PRIVATE_KEY_PEM: 'fixture'.repeat(16) }

describe('request-scoped GitHub evidence credentials', () => {
  it('copies and freezes a single transient job token independently of its bindings', async () => {
    const source = { GITHUB_WORKFLOW_TOKEN: 'github-job-token' }
    const snapshot = snapshotGitHubEvidenceEnvironment(source)
    source.GITHUB_WORKFLOW_TOKEN = 'changed'
    expect(snapshot).toEqual({ GITHUB_WORKFLOW_TOKEN: 'github-job-token' })
    expect(Object.isFrozen(snapshot)).toBe(true)
    const fetcher = vi.fn()
    await expect(resolveGitHubEvidenceToken(snapshot, fetcher as typeof fetch, 1_700_000_000))
      .resolves.toBe('github-job-token')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('retains a separate immutable legacy App environment without mixing credentials', () => {
    const snapshot = snapshotGitHubEvidenceEnvironment(legacy)
    expect(snapshot).toEqual(legacy)
    expect(snapshot).not.toBe(legacy)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(() => snapshotGitHubEvidenceEnvironment({ ...legacy, GITHUB_WORKFLOW_TOKEN: 'job-token' })).toThrow(code)
  })

  it.each(['', 'with space', 'tab\there', 'line\r\nbreak', '\u0000', '\u007f', '\u0080', 'x'.repeat(4097), null, 7])
    ('rejects malformed bearer token value %#', value => {
      expect(() => snapshotGitHubEvidenceEnvironment({ GITHUB_WORKFLOW_TOKEN: value })).toThrow(code)
    })

  it.each([undefined, null, {}, [], { GITHUB_WORKFLOW_TOKEN: 'token', other: true }, Object.create({ GITHUB_WORKFLOW_TOKEN: 'token' })])
    ('rejects unknown or inherited credential shapes %#', value => {
      expect(() => snapshotGitHubEvidenceEnvironment(value)).toThrow(code)
    })

  it('rejects accessors and proxies without running their code', () => {
    const getter = vi.fn(() => 'secret')
    const accessor = Object.defineProperty({}, 'GITHUB_WORKFLOW_TOKEN', { enumerable: true, get: getter })
    expect(() => snapshotGitHubEvidenceEnvironment(accessor)).toThrow(code)
    const trap = vi.fn(() => { throw new Error('must not run') })
    const proxy = new Proxy({ GITHUB_WORKFLOW_TOKEN: 'secret' }, { getOwnPropertyDescriptor: trap })
    expect(() => snapshotGitHubEvidenceEnvironment(proxy)).toThrow(code)
    expect(getter).not.toHaveBeenCalled()
    expect(trap).not.toHaveBeenCalled()
  })

  it('accepts a bounded token in null-prototype bindings and rejects symbols', () => {
    const source = Object.assign(Object.create(null), { GITHUB_WORKFLOW_TOKEN: 'x'.repeat(4096) })
    expect(snapshotGitHubEvidenceEnvironment(source)).toEqual({ GITHUB_WORKFLOW_TOKEN: 'x'.repeat(4096) })
    source[Symbol('unknown')] = true
    expect(() => snapshotGitHubEvidenceEnvironment(source)).toThrow(code)
  })

  it('uses a job token for PTR observation only after signed context verification', async () => {
    const { calls, ...input } = await ptrObservationOidcFixture()
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('https://api.github.com/')) {
        expect(String(url)).not.toContain('/app/installations/')
        expect(init?.method ?? 'GET').toBe('GET')
        const headers = new Headers(init?.headers)
        expect(headers.get('authorization')).toBe('Bearer workflow-token')
        headers.set('authorization', 'Bearer installation-token')
        return input.fetch(url, { ...init, headers })
      }
      return input.fetch(url, init)
    }) as typeof fetch
    await expect(verifyPtrObservationWorkflowIdentity({ ...input,
      environment: { GITHUB_WORKFLOW_TOKEN: 'workflow-token' }, fetch: fetcher }))
      .resolves.toMatchObject({ identity: { checkRunId: '9007199254740993' } })
    expect(calls.slice(0, 2)).toEqual([expect.stringContaining('openid-configuration'), expect.stringContaining('/jwks')])
    expect(calls.at(-1)).toContain('/branches/main')
  })

  it('does not use the job token when PTR signed context is invalid', async () => {
    const { calls, ...input } = await ptrObservationOidcFixture({ claims: { ref_protected: 'false' } })
    await expect(verifyPtrObservationWorkflowIdentity({ ...input, environment: { GITHUB_WORKFLOW_TOKEN: 'workflow-token' } }))
      .rejects.toThrow()
    expect(calls.some(url => url.startsWith('https://api.github.com/'))).toBe(false)
  })
})
