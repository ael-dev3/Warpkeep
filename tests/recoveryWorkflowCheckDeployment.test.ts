// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mocks = vi.hoisted(() => ({ context: vi.fn(), boundary: vi.fn() }));
vi.mock('../scripts/recovery-workflow-current-context.mjs', () => ({ readRecoveryWorkflowCurrentContext: mocks.context }));
vi.mock('../scripts/recovery-workflow-deployment-boundary.mjs', () => ({ checkPersistedRecoveryDeploymentBoundary: mocks.boundary }));
import { checkRecoveryWorkflowDeployment as check } from '../scripts/recovery-workflow-check-deployment.mjs';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ privateRoot: '/private/run', bindingSource: 'binding', contextSource: 'context' });
  mocks.boundary.mockResolvedValue({ authorizationEpoch: 1, expiresAt: 100 });
});
it('checks independently read context before the strict persisted boundary and returns no receipt', async () => {
  expect(await check()).toEqual({ boundaryChecked: true });
  expect(mocks.boundary).toHaveBeenCalledExactlyOnceWith('/private/run', 'binding', 'context');
  expect(mocks.context.mock.invocationCallOrder[0]).toBeLessThan(mocks.boundary.mock.invocationCallOrder[0]);
});
it.each(['context', 'boundary'] as const)('redacts %s rejection without a successful acknowledgment', async key => {
  mocks[key].mockRejectedValue(new Error('private value'));
  await expect(check()).rejects.toThrow(/^RECOVERY_WORKFLOW_DEPLOYMENT_CHECK_INVALID$/);
  if (key === 'context') expect(mocks.boundary).not.toHaveBeenCalled();
});
it('rejects caller overrides before any read or status request', async () => {
  await expect(Reflect.apply(check, null, ['override'])).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_CHECK_INVALID');
  expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.boundary).not.toHaveBeenCalled();
});
it('native CLI rejects arguments with fixed stderr and empty stdout', () => {
  const path = fileURLToPath(new URL('../scripts/recovery-workflow-check-deployment.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [path, 'override'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  expect(result.status).toBe(1); expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_WORKFLOW_DEPLOYMENT_CHECK_INVALID\n');
});
