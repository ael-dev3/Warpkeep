import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ artifact: vi.fn(), directory: vi.fn(), begin: vi.fn(), boundary: vi.fn(), finish: vi.fn(), dispose: vi.fn() }));
vi.mock('../scripts/read-recovery-workflow-artifact.js', () => ({ readRecoveryWorkflowArtifact: mocks.artifact }));
vi.mock('../../../scripts/recovery-workflow-private-directory.mjs', () => ({ createRecoveryWorkflowPrivateDirectory: mocks.directory }));
vi.mock('../../../scripts/recovery-workflow-session.mjs', () => ({ beginRecoveryWorkflowSession: mocks.begin }));
import { prepareRecoveryWorkflowClaim as prepare } from '../scripts/prepare-recovery-workflow-claim.js';
const contextSource = JSON.stringify({ pagesRunId: '123', pagesRunAttempt: '2' });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.artifact.mockResolvedValue({ bindingSource: 'verified-binding', contextSource });
  mocks.directory.mockReturnValue('/fixed/private/run');
  mocks.begin.mockResolvedValue({ checkDeploymentBoundary: mocks.boundary, finish: mocks.finish, dispose: mocks.dispose });
  mocks.boundary.mockResolvedValue({ expiresAt: 1120 });
});
it('uses verified artifact coordinates to allocate storage and prepare one persisted claim', async () => {
  await expect(prepare()).resolves.toEqual({ claimPersisted: true });
  expect(mocks.directory).toHaveBeenCalledExactlyOnceWith('123', '2');
  expect(mocks.begin).toHaveBeenCalledExactlyOnceWith('verified-binding', contextSource, '/fixed/private/run');
  expect(mocks.artifact.mock.invocationCallOrder[0]).toBeLessThan(mocks.directory.mock.invocationCallOrder[0]!);
  expect(mocks.directory.mock.invocationCallOrder[0]).toBeLessThan(mocks.begin.mock.invocationCallOrder[0]!);
  expect(mocks.boundary).toHaveBeenCalledTimes(1); expect(mocks.finish).not.toHaveBeenCalled();
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
});
it.each(['artifact', 'directory'] as const)('does not request authority after %s failure', async boundary => {
  mocks[boundary].mockImplementationOnce(() => { throw new Error('private-sentinel'); });
  await expect(prepare()).rejects.toThrow(/^RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID$/);
  expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
});
it('does not retry ambiguous session startup or pretend a receipt was obtained', async () => {
  mocks.begin.mockRejectedValueOnce(new Error('private-sentinel'));
  await expect(prepare()).rejects.toThrow(/^RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID$/);
  expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.finish).not.toHaveBeenCalled();
});
it.each([false, true])('reconciles failed preparation and remains failed even when reconciliation fails=%s', async failed => {
  mocks.boundary.mockRejectedValueOnce(new Error('disabled-or-unpersisted'));
  if (failed) mocks.finish.mockRejectedValueOnce(new Error('private-reconciliation-error'));
  await expect(prepare()).rejects.toThrow(/^RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID$/);
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith('reconcile');
  expect(mocks.begin).toHaveBeenCalledTimes(1); expect(mocks.dispose).toHaveBeenCalledTimes(1);
});
it('accepts no caller paths, tokens, artifacts, or other overrides', async () => {
  await expect(prepare({ privateRoot: '/other' })).rejects.toThrow('RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID');
  expect(mocks.artifact).not.toHaveBeenCalled(); expect(mocks.directory).not.toHaveBeenCalled();
});
