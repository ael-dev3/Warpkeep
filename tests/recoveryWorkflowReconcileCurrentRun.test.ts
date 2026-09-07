// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mocks = vi.hoisted(() => ({ context: vi.fn(), resume: vi.fn(), reconcile: vi.fn(), dispose: vi.fn() }));
vi.mock('../scripts/recovery-workflow-current-context.mjs', () => ({ readRecoveryWorkflowCurrentContext: mocks.context }));
vi.mock('../scripts/recovery-workflow-reconciliation.mjs', () => ({ resumeRecoveryWorkflowReconciliation: mocks.resume }));
import { reconcileRecoveryWorkflowCurrentRun as reconcile } from '../scripts/recovery-workflow-reconcile-current-run.mjs';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ privateRoot: '/private/run', bindingSource: 'binding', contextSource: 'context' });
  mocks.resume.mockReturnValue({ reconcile: mocks.reconcile, dispose: mocks.dispose });
  mocks.reconcile.mockResolvedValue({ outcome: 'completed', completedAt: 100, privateSentinel: 'must not escape' });
});
it.each(['completed', 'not-deployed'])('projects the verified %s outcome and disposes the session', async outcome => {
  mocks.reconcile.mockResolvedValue({ outcome, privateSentinel: 'must not escape' });
  const result = await reconcile();
  expect(result).toEqual({ outcome }); expect(Object.isFrozen(result)).toBe(true);
  expect(mocks.resume).toHaveBeenCalledExactlyOnceWith('/private/run', 'context');
  expect(mocks.context.mock.invocationCallOrder[0]).toBeLessThan(mocks.resume.mock.invocationCallOrder[0]);
  expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.dispose).toHaveBeenCalledExactlyOnceWith();
});
it.each(['context', 'resume', 'reconcile'] as const)('redacts %s failure without retry or reissue', async key => {
  mocks[key].mockImplementation(() => { throw new Error('private sentinel'); });
  await expect(reconcile()).rejects.toThrow(/^RECOVERY_WORKFLOW_CURRENT_RUN_RECONCILIATION_INVALID$/);
  if (key === 'context') expect(mocks.resume).not.toHaveBeenCalled();
  if (key !== 'reconcile') expect(mocks.reconcile).not.toHaveBeenCalled();
  expect(mocks.dispose).toHaveBeenCalledTimes(key === 'reconcile' ? 1 : 0);
});
it('rejects an unexpected terminal outcome and still disposes', async () => {
  mocks.reconcile.mockResolvedValue({ outcome: 'pending' });
  await expect(reconcile()).rejects.toThrow(/^RECOVERY_WORKFLOW_CURRENT_RUN_RECONCILIATION_INVALID$/);
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('rejects overrides before context or claim access', async () => {
  await expect(Reflect.apply(reconcile, null, ['override'])).rejects.toThrow('RECOVERY_WORKFLOW_CURRENT_RUN_RECONCILIATION_INVALID');
  expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.resume).not.toHaveBeenCalled();
});
it('native CLI rejects arguments without secret-bearing output', () => {
  const path = fileURLToPath(new URL('../scripts/recovery-workflow-reconcile-current-run.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [path, 'override'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  expect(result.status).toBe(1); expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_WORKFLOW_CURRENT_RUN_RECONCILIATION_INVALID\n');
});
