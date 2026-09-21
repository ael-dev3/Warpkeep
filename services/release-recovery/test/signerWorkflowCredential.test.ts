import { expect, it } from 'vitest'
import { githubEvidenceFromBindings, withWorkflowCredential } from '../src/signerWorkflowCredential.js'

it('keeps each workflow credential isolated from Worker bindings and other requests', () => {
  const binding = { RECOVERY_ENABLED: 'false', GITHUB_APP_ID: undefined }
  const first = withWorkflowCredential(binding, ['test-only-job-one'])
  const second = withWorkflowCredential(binding, ['test-only-job-two'])
  expect(first).not.toBe(binding)
  expect(githubEvidenceFromBindings(first)).toEqual({ GITHUB_WORKFLOW_TOKEN: 'test-only-job-one' })
  expect(githubEvidenceFromBindings(second)).toEqual({ GITHUB_WORKFLOW_TOKEN: 'test-only-job-two' })
  expect(binding).not.toHaveProperty('GITHUB_WORKFLOW_TOKEN')
  expect(withWorkflowCredential(binding, [])).toBe(binding)
  expect(() => githubEvidenceFromBindings(binding)).toThrow()
})

it.each([[undefined], [''], ['a', 'b'], [{ token: 'test-only' }], ['with whitespace'], ['x'.repeat(32769)]].map(extra => ({ extra })))(
  'rejects malformed RPC credentials without mutating the environment: %#', ({ extra }) => {
    const env = Object.freeze({ GITHUB_APP_ID: '1' })
    expect(() => withWorkflowCredential(env, extra)).toThrow()
    expect(env).toEqual({ GITHUB_APP_ID: '1' })
  },
)
