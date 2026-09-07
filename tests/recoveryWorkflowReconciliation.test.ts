// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), oidc: vi.fn(), request: vi.fn(), terminal: vi.fn() }));
vi.mock('../scripts/recovery-claim-handoff.mjs', () => ({ readRecoveryClaimHandoffForReconciliation: mocks.read }));
vi.mock('../scripts/recovery-workflow-oidc.mjs', () => ({ requestFreshRecoveryOidc: mocks.oidc }));
vi.mock('../scripts/recovery-authorization-client.mjs', () => ({ requestRecovery: mocks.request }));
vi.mock('../scripts/verify-recovery-terminal.mjs', () => ({ verifyRecoveryTerminal: mocks.terminal }));
import { resumeRecoveryWorkflowReconciliation } from '../scripts/recovery-workflow-reconciliation.mjs';
const expected = JSON.stringify({ requestId: 'synthetic-request', candidateCommit: 'a'.repeat(40), sourceVerifyRunId: '123', sourceVerifyRunAttempt: '1', artifactId: '456' });
const result = { outcome: 'completed', completedAt: 1000, authorizationEpoch: 1, issuedAt: 1000, expiresAt: 1900 };
beforeEach(() => {
  vi.resetAllMocks(); let sequence = 0;
  mocks.read.mockReturnValue({ claimReceiptJws: 'private-claim', expectedSource: expected });
  mocks.oidc.mockImplementation(async () => `fresh-${++sequence}`);
  mocks.request.mockResolvedValue({ terminalJws: 'terminal' }); mocks.terminal.mockReturnValue(result);
});
it('reopens and reconciles only the retained claim, without reissue or deployment', async () => {
  const session = resumeRecoveryWorkflowReconciliation('/private-root', 'context');
  expect(Object.keys(session)).toEqual(['reconcile', 'dispose']);
  await expect(session.reconcile()).resolves.toEqual({ ...result, terminalJws: 'terminal' });
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.request.mock.calls.map(call => call[0])).toEqual(['reconcile']);
  const body = JSON.parse(mocks.request.mock.calls[0]![1]);
  expect(Object.keys(body)).toEqual(['requestId', 'candidateCommit', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId', 'oidcToken', 'claimReceiptJws']);
  expect(body.claimReceiptJws).toBe('private-claim');
  expect(mocks.terminal).toHaveBeenCalledWith('terminal', expected, expect.any(Number));
  await expect(session.reconcile()).rejects.toThrow('RECOVERY_WORKFLOW_RECONCILIATION_INVALID');
});
it('refuses missing or invalid handoff before requesting OIDC', () => {
  mocks.read.mockImplementation(() => { throw new Error('private-sentinel'); });
  expect(() => resumeRecoveryWorkflowReconciliation('/private-root', 'context')).toThrow(/^RECOVERY_WORKFLOW_RECONCILIATION_INVALID$/);
  expect(mocks.oidc).not.toHaveBeenCalled();
});
it('rejects handoff substitution while obtaining fresh OIDC', async () => {
  const session = resumeRecoveryWorkflowReconciliation('/private-root', 'context');
  mocks.read.mockReturnValueOnce({ claimReceiptJws: 'different', expectedSource: expected });
  await expect(session.reconcile()).rejects.toThrow('RECOVERY_WORKFLOW_RECONCILIATION_INVALID');
  expect(mocks.request).not.toHaveBeenCalled();
});
it('rechecks deadline after obtaining OIDC', async () => {
  const session = resumeRecoveryWorkflowReconciliation('/private-root', 'context');
  mocks.read.mockImplementationOnce(() => { throw new Error('deadline'); });
  await expect(session.reconcile()).rejects.toThrow('RECOVERY_WORKFLOW_RECONCILIATION_INVALID');
  expect(mocks.request).not.toHaveBeenCalled();
});
it('retries only reconciliation with fresh OIDC after an ambiguous response', async () => {
  const session = resumeRecoveryWorkflowReconciliation('/private-root', 'context');
  mocks.request.mockRejectedValueOnce(new Error('private-sentinel'));
  await expect(session.reconcile()).rejects.toThrow(/^RECOVERY_WORKFLOW_RECONCILIATION_INVALID$/);
  await expect(session.reconcile()).resolves.toEqual({ ...result, terminalJws: 'terminal' });
  expect(mocks.request.mock.calls.map(call => call[0])).toEqual(['reconcile', 'reconcile']);
  expect(mocks.request.mock.calls.map(call => JSON.parse(call[1]).oidcToken)).toEqual(['fresh-1', 'fresh-2']);
});
it('does not revive after disposal during OIDC acquisition', async () => {
  const session = resumeRecoveryWorkflowReconciliation('/private-root', 'context');
  let resolve!: (token: string) => void;
  mocks.oidc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = session.reconcile(); session.dispose(); resolve('late');
  await expect(pending).rejects.toThrow('RECOVERY_WORKFLOW_RECONCILIATION_INVALID');
  expect(mocks.request).not.toHaveBeenCalled();
  await expect(session.reconcile()).rejects.toThrow('RECOVERY_WORKFLOW_RECONCILIATION_INVALID');
});
it('does not report completion when terminal verification fails', async () => {
  const session = resumeRecoveryWorkflowReconciliation('/private-root', 'context');
  mocks.terminal.mockImplementationOnce(() => { throw new Error('wrong signature'); });
  await expect(session.reconcile()).rejects.toThrow('RECOVERY_WORKFLOW_RECONCILIATION_INVALID');
  await expect(session.reconcile()).resolves.toEqual({ ...result, terminalJws: 'terminal' });
});
it('rejects concurrent reconciliation without dispatching a duplicate request', async () => {
  const session = resumeRecoveryWorkflowReconciliation('/private-root', 'context');
  let resolve!: (token: string) => void;
  mocks.oidc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = session.reconcile();
  await expect(session.reconcile()).rejects.toThrow('RECOVERY_WORKFLOW_RECONCILIATION_INVALID');
  resolve('fresh-token'); await expect(pending).resolves.toEqual({ ...result, terminalJws: 'terminal' });
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
