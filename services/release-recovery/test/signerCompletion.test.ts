import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerSignerClaimProjection } from '../src/ledgerV2.js'
import type { SignerIssueRuntime } from '../src/signerIssue.js'
import { completeRecoveryAuthorization } from '../src/signerCompletion.js'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), correlate: vi.fn(), observe: vi.fn(),
  sign: vi.fn(), secrets: vi.fn(), control: vi.fn() }))
vi.mock('../src/githubOidc.js', () => ({ verifyGitHubWorkflowIdentity: mocks.identity }))
vi.mock('../src/claimReceiptCorrelation.js', () => ({ verifyPostDeployClaimReceiptCorrelation: mocks.correlate }))
vi.mock('../src/reconciliationEvidence.js', () => ({ createDeploymentReconciliationProofReader: () => mocks.observe }))
vi.mock('../src/crypto.js', () => ({ signRecoveryTerminalJws: mocks.sign }))
vi.mock('../src/signerSecrets.js', () => ({ validateSignerSecrets: mocks.secrets }))
vi.mock('../src/signerControl.js', () => ({ parseSignerControl: mocks.control }))

const request = Object.freeze({ requestId: '123e4567-e89b-42d3-a456-426614174000',
  candidateCommit: 'a'.repeat(40), sourceVerifyRunId: '51', sourceVerifyRunAttempt: '1', artifactId: '73',
  oidcToken: 'signed-oidc-fixture', claimReceiptJws: 'signed-original-receipt-fixture' })
const originalIdentity = Object.freeze({ repository: 'ael-dev3/Warpkeep', repositoryId: '1273513252',
  repositoryOwnerId: '183124839', ref: 'refs/heads/main',
  workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
  environment: 'github-pages', eventName: 'workflow_run', workflowSha: request.candidateCommit,
  pagesRunId: '41', pagesRunAttempt: '1', checkRunId: '91' })
const original = { state: 'claimed', requestId: request.requestId, rowBindingDigest: 'b'.repeat(64),
  revision: 3, authorizationJwsSha256: 'c'.repeat(64),
  authorization: { locators: { requestId: request.requestId, candidateCommit: request.candidateCommit,
    sourceVerifyRunId: '51', sourceVerifyRunAttempt: '1', artifactId: '73' }, workflowIdentity: originalIdentity },
  claim: { claimedAt: 1_000, claimDeadline: 2_200 },
} as unknown as LedgerSignerClaimProjection

function runtime(outcome: 'completed' | 'not-deployed' = 'completed') {
  const ledger = { readClaimedProjection: vi.fn().mockResolvedValue(original),
    readTerminalProjection: vi.fn().mockResolvedValue({ ...original, state: outcome,
      terminal: { outcome, completedAt: 3_000 } }),
    complete: vi.fn().mockResolvedValue({}), reconcile: vi.fn().mockResolvedValue({}) }
  return { ledger, value: { githubApp: { GITHUB_WORKFLOW_TOKEN: `ghs_${'x'.repeat(36)}` },
    fetch: vi.fn(), observation: {}, requestLedger: () => ledger } as unknown as SignerIssueRuntime }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.identity.mockResolvedValue({ ...originalIdentity, pagesRunId: '42', pagesRunAttempt: '2', checkRunId: '92' })
  mocks.secrets.mockResolvedValue({ privateJwk: {} })
  mocks.sign.mockResolvedValue('terminal-fixture')
  mocks.observe.mockResolvedValue({ outcome: 'completed', rowBindingDigest: original.rowBindingDigest,
    deployStepConclusion: 'success', matchingPagesDeployment: true, deploymentAttestationMatches: true })
})

describe('authenticated keyless reconciliation', () => {
  it('allows a fresh workflow run to reconcile only original durable and provider facts', async () => {
    const fixture = runtime()
    await expect(completeRecoveryAuthorization('reconcile', request, {}, {}, fixture.value, () => 3_000))
      .resolves.toEqual({ terminalJws: 'terminal-fixture' })
    expect(mocks.observe).toHaveBeenCalledWith(original)
    expect(mocks.correlate).toHaveBeenCalledWith({ compact: request.claimReceiptJws, projection: original,
      nowSeconds: 3_000, purpose: 'reconcile' })
    expect(fixture.ledger.reconcile).toHaveBeenCalledWith({ requestId: request.requestId,
      proof: expect.objectContaining({ rowBindingDigest: original.rowBindingDigest }), now: 3_000 })
    expect(fixture.ledger.complete).not.toHaveBeenCalled()
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ pagesRunId: '41', pagesRunAttempt: '1' }), {})
  })

  it('retains the exact original job identity requirement for immediate completion', async () => {
    const fixture = runtime()
    await expect(completeRecoveryAuthorization('complete', request, {}, {}, fixture.value, () => 2_000))
      .rejects.toThrow('RECOVERY_CLAIM_RECEIPT_MISMATCH')
    expect(mocks.observe).not.toHaveBeenCalled()
    expect(fixture.ledger.complete).not.toHaveBeenCalled()
  })

  it.each(['repository', 'repositoryId', 'repositoryOwnerId', 'ref', 'workflowRef', 'environment', 'eventName', 'workflowSha'])
  ('rejects a reconciler that differs in %s', async name => {
    mocks.identity.mockResolvedValue({ ...originalIdentity, [name]: 'substituted' })
    const fixture = runtime()
    await expect(completeRecoveryAuthorization('reconcile', request, {}, {}, fixture.value, () => 3_000))
      .rejects.toThrow('RECOVERY_CLAIM_RECEIPT_MISMATCH')
    expect(mocks.observe).not.toHaveBeenCalled()
    expect(fixture.ledger.reconcile).not.toHaveBeenCalled()
  })

  it('leaves an ambiguous provider result pending', async () => {
    mocks.observe.mockResolvedValue({ outcome: 'ambiguous' })
    const fixture = runtime()
    await expect(completeRecoveryAuthorization('reconcile', request, {}, {}, fixture.value, () => 3_000))
      .rejects.toThrow('RECOVERY_LEDGER_COMPLETION_NOT_PROVEN')
    expect(fixture.ledger.reconcile).not.toHaveBeenCalled()
    expect(fixture.ledger.complete).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it('can retain a proven not-deployed result without creating any deployment authority', async () => {
    mocks.observe.mockResolvedValue({ outcome: 'not-deployed', rowBindingDigest: original.rowBindingDigest,
      authoritativeTerminalRun: true, pagesDeployStepStarted: false, matchingPagesDeploymentAbsent: true })
    const fixture = runtime('not-deployed')
    await expect(completeRecoveryAuthorization('reconcile', request, {}, {}, fixture.value, () => 3_000))
      .resolves.toEqual({ terminalJws: 'terminal-fixture' })
    expect(fixture.ledger.reconcile).toHaveBeenCalledOnce()
    expect(fixture.ledger.complete).not.toHaveBeenCalled()
  })
})
