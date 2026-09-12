// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mocks = vi.hoisted(() => ({ live: vi.fn(), reconcile: vi.fn(), signed: vi.fn() }));
vi.mock('../scripts/recovery-workflow-live-postflight.mjs', () => ({ verifyRecoveryWorkflowLivePostflight: mocks.live }));
vi.mock('../scripts/recovery-workflow-reconcile-current-run.mjs', () => ({ reconcileRecoveryWorkflowCurrentRun: mocks.reconcile }));
vi.mock('../scripts/recovery-authorization-protocol.mjs', () => ({ verifyRecoverySignedPayload: mocks.signed }));
import { runRecoveryWorkflowPostflight as run } from '../scripts/recovery-workflow-postflight.mjs';
const digest = 'a'.repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.live.mockResolvedValue({ liveAttestationVerified: true, deploymentAttestationSha256: digest });
  mocks.reconcile.mockResolvedValue({ outcome: 'completed', terminalJws: 'signed-terminal', privateSentinel: 'not-output' });
  mocks.signed.mockReturnValue({ outcome: 'completed', deploymentAttestationSha256: digest });
});
it('requires matching live and signed completion evidence and returns only public projection', async () => {
  const result = await run();
  expect(result).toEqual({ outcome: 'completed', deploymentAttestationSha256: digest, terminalJws: 'signed-terminal' });
  expect(Object.isFrozen(result)).toBe(true);
  expect(mocks.live).toHaveBeenCalledExactlyOnceWith(); expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.live.mock.invocationCallOrder[0]).toBeLessThan(mocks.reconcile.mock.invocationCallOrder[0]);
  expect(mocks.signed).toHaveBeenCalledExactlyOnceWith('signed-terminal', 'terminal');
});
it('still reconciles after a failed public check but never reports success', async () => {
  mocks.live.mockRejectedValue(new Error('private sentinel'));
  await expect(run()).rejects.toThrow(/^RECOVERY_WORKFLOW_POSTFLIGHT_INVALID$/);
  expect(mocks.reconcile).toHaveBeenCalledOnce();
});
it.each(['reconcile', 'signed'] as const)('redacts %s errors', async key => {
  mocks[key].mockImplementation(() => { throw new Error('private sentinel'); });
  await expect(run()).rejects.toThrow(/^RECOVERY_WORKFLOW_POSTFLIGHT_INVALID$/);
});
it('rejects a signed attestation for different public bytes', async () => {
  mocks.signed.mockReturnValue({ outcome: 'completed', deploymentAttestationSha256: 'b'.repeat(64) });
  await expect(run()).rejects.toThrow(/^RECOVERY_WORKFLOW_POSTFLIGHT_INVALID$/);
});
it.each(['response', 'payload'])('rejects not-deployed %s as release success', async kind => {
  if (kind === 'response') mocks.reconcile.mockResolvedValue({ outcome: 'not-deployed', terminalJws: 'signed-terminal' });
  else mocks.signed.mockReturnValue({ outcome: 'not-deployed', deploymentAttestationSha256: digest });
  await expect(run()).rejects.toThrow(/^RECOVERY_WORKFLOW_POSTFLIGHT_INVALID$/);
});
it('rejects overrides before reads or reconciliation', async () => {
  await expect(Reflect.apply(run, null, ['override'])).rejects.toThrow('RECOVERY_WORKFLOW_POSTFLIGHT_INVALID');
  expect(mocks.live).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
});
it('native CLI rejects arguments with no stdout', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/recovery-workflow-postflight.mjs', import.meta.url)), 'override'],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  expect(result.status).toBe(1); expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_WORKFLOW_POSTFLIGHT_INVALID\n');
});
