// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ binding: vi.fn(), read: vi.fn(), request: vi.fn(), status: vi.fn(), claim: vi.fn() }));
vi.mock('../scripts/recovery-activation-candidate.mjs', () => ({ parseRecoveryBinding: mocks.binding }));
vi.mock('../scripts/recovery-claim-handoff.mjs', () => ({ readRecoveryClaimHandoffForDeployment: mocks.read }));
vi.mock('../scripts/recovery-authorization-client.mjs', () => ({ requestRecovery: mocks.request }));
vi.mock('../scripts/verify-recovery-status.mjs', () => ({ verifyRecoveryStatus: mocks.status }));
vi.mock('../scripts/verify-recovery-claim-receipt.mjs', () => ({ verifyRecoveryClaimReceipt: mocks.claim }));
import { checkPersistedRecoveryDeploymentBoundary as check } from '../scripts/recovery-workflow-deployment-boundary.mjs';
const expectedSource = JSON.stringify({ requestId: 'test-request', authorizationEpoch: 7 });
const result = { authorizationEpoch: 7, claimSequence: 1, issuedAt: 1000, expiresAt: 1120 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.binding.mockReturnValue({ recoveryAuthorizationRequestId: 'test-request', recoveryAuthorizationEpoch: 7 });
  mocks.read.mockReturnValue({ claimReceiptJws: 'private-claim', expectedSource });
  mocks.request.mockResolvedValue({ statusJws: 'signed-status' });
  mocks.claim.mockReturnValue(result);
});
it('reopens a persisted strict claim around a fresh fixed-endpoint status request', async () => {
  await expect(check('/private', 'binding', 'context')).resolves.toEqual(result);
  expect(mocks.read.mock.calls).toEqual([['/private', 'context'], ['/private', 'context']]);
  expect(mocks.request.mock.calls).toEqual([['status', '{}']]);
  expect(mocks.status).toHaveBeenCalledWith('signed-status', 7, expect.any(Number));
  expect(mocks.claim).toHaveBeenCalledWith('private-claim', expectedSource, expect.any(Number));
  expect(mocks.read.mock.invocationCallOrder[0]).toBeLessThan(mocks.request.mock.invocationCallOrder[0]!);
  expect(mocks.status.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[1]!);
});
it.each(['binding', 'read'] as const)('rejects invalid %s before any network request', async boundary => {
  mocks[boundary].mockImplementationOnce(() => { throw new Error('private-sentinel'); });
  await expect(check('/private', 'binding', 'context')).rejects.toThrow(/^RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID$/);
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each([
  { requestId: 'other', authorizationEpoch: 7 },
  { requestId: 'test-request', authorizationEpoch: 8 },
])('rejects a signed claim from a different current binding', async expected => {
  mocks.read.mockReturnValue({ claimReceiptJws: 'private-claim', expectedSource: JSON.stringify(expected) });
  await expect(check('/private', 'binding', 'context')).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID');
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each(['request', 'status'] as const)('rejects unavailable or invalid signed status at %s', async boundary => {
  mocks[boundary].mockImplementationOnce(() => { throw new Error('private-sentinel'); });
  await expect(check('/private', 'binding', 'context')).rejects.toThrow(/^RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID$/);
  expect(mocks.claim).not.toHaveBeenCalled();
});
it('rejects expiry while waiting for status', async () => {
  mocks.read.mockImplementationOnce(() => ({ claimReceiptJws: 'private-claim', expectedSource }))
    .mockImplementationOnce(() => { throw new Error('expired'); });
  await expect(check('/private', 'binding', 'context')).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID');
  expect(mocks.claim).not.toHaveBeenCalled();
});
it.each(['claimReceiptJws', 'expectedSource'])('rejects saved %s substitution across the network wait', async key => {
  mocks.read.mockReturnValueOnce({ claimReceiptJws: 'private-claim', expectedSource })
    .mockReturnValueOnce({ claimReceiptJws: 'private-claim', expectedSource, [key]: 'substituted' });
  await expect(check('/private', 'binding', 'context')).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID');
  expect(mocks.claim).not.toHaveBeenCalled();
});
it('requires the final strict receipt check and rejects caller override arguments', async () => {
  mocks.claim.mockImplementationOnce(() => { throw new Error('expired'); });
  await expect(check('/private', 'binding', 'context')).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID');
  mocks.request.mockClear();
  await expect(Reflect.apply(check, null, ['/private', 'binding', 'context', { ignoreExpiry: true }])).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID');
  expect(mocks.request).not.toHaveBeenCalled();
});
