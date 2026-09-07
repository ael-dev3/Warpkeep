// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { recoveryAuthorizationFixture } from './fixtures/recoveryAuthorizationFixture';
const mocks = vi.hoisted(() => ({ oidc: vi.fn(), request: vi.fn(), authorization: vi.fn(), claim: vi.fn(), correlation: vi.fn(), status: vi.fn(), terminal: vi.fn() }));
vi.mock('../scripts/recovery-workflow-oidc.mjs', () => ({ requestFreshRecoveryOidc: mocks.oidc }));
vi.mock('../scripts/recovery-authorization-client.mjs', () => ({ requestRecovery: mocks.request }));
vi.mock('../scripts/verify-recovery-authorization-jws.mjs', () => ({ verifyRecoveryAuthorization: mocks.authorization }));
vi.mock('../scripts/verify-recovery-claim-receipt.mjs', () => ({ verifyRecoveryClaimReceipt: mocks.claim, verifyRecoveryClaimCorrelation: mocks.correlation }));
vi.mock('../scripts/verify-recovery-status.mjs', () => ({ verifyRecoveryStatus: mocks.status }));
vi.mock('../scripts/verify-recovery-terminal.mjs', () => ({ verifyRecoveryTerminal: mocks.terminal }));
import { beginRecoveryWorkflowSession } from '../scripts/recovery-workflow-session.mjs';
const claim = { authorizationEpoch: 3, claimSequence: 1, issuedAt: 1000, expiresAt: 1120 };
const terminal = { outcome: 'completed', completedAt: 1050, authorizationEpoch: 3, issuedAt: 1050, expiresAt: 1950 };
const fixture = recoveryAuthorizationFixture();
function begin() { return beginRecoveryWorkflowSession(fixture.bindingSource, JSON.stringify(fixture.context)); }
beforeEach(() => {
  vi.resetAllMocks();
  let sequence = 0;
  mocks.oidc.mockImplementation(async () => `synthetic-oidc-${++sequence}`);
  mocks.request.mockImplementation(async (endpoint: string) => {
    if (endpoint === 'issue') return { authorizationJws: 'private-authorization' };
    if (endpoint === 'claim') return { claimReceiptJws: 'private-claim' };
    if (endpoint === 'status') return { statusJws: 'status' };
    return { terminalJws: 'terminal' };
  });
  mocks.authorization.mockReturnValue({ claimExpectedSource: 'private-context' });
  mocks.claim.mockReturnValue(claim); mocks.terminal.mockReturnValue(terminal);
});
it('composes issue, claim, two status checks, deployment boundary and terminal verification', async () => {
  const session = await begin();
  expect(Object.keys(session)).toEqual(['checkDeploymentBoundary', 'finish', 'dispose']);
  await expect(session.checkDeploymentBoundary()).resolves.toEqual(claim);
  await expect(session.finish('complete')).resolves.toEqual(terminal);
  expect(mocks.request.mock.calls.map(call => call[0])).toEqual(['issue', 'claim', 'status', 'status', 'complete']);
  const bodies = mocks.request.mock.calls.filter(call => call[0] !== 'status').map(call => JSON.parse(call[1]));
  expect(bodies.map(body => body.oidcToken)).toEqual(['synthetic-oidc-1', 'synthetic-oidc-2', 'synthetic-oidc-3']);
  expect(bodies[2]).not.toHaveProperty('authorizationJws');
  expect(bodies[2].claimReceiptJws).toBe('private-claim');
  expect(mocks.terminal).toHaveBeenCalledWith('terminal', 'private-context', expect.any(Number));
  await expect(session.finish('complete')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
});
it('does not claim an authorization which failed local verification', async () => {
  mocks.authorization.mockImplementation(() => { throw new Error('private-sentinel'); });
  await expect(begin()).rejects.toThrow(/^RECOVERY_WORKFLOW_SESSION_INVALID$/);
  expect(mocks.request.mock.calls.map(call => call[0])).toEqual(['issue']);
});
it('rejects reused OIDC bytes before making the claim request', async () => {
  mocks.oidc.mockResolvedValue('same-token');
  await expect(begin()).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('preserves reconciliation after an initial status failure without allowing deployment', async () => {
  mocks.status.mockImplementationOnce(() => { throw new Error('disabled'); });
  const session = await begin();
  await expect(session.checkDeploymentBoundary()).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(session.finish('complete')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(session.finish('reconcile')).resolves.toEqual(terminal);
});
it('rechecks claim expiry at the boundary and retains only reconciliation after failure', async () => {
  const session = await begin();
  mocks.claim.mockImplementationOnce(() => { throw new Error('expired'); });
  await expect(session.checkDeploymentBoundary()).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(session.finish('complete')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(session.finish('reconcile')).resolves.toEqual(terminal);
});
it('allows reconciliation but never repeats completion after an ambiguous response', async () => {
  const session = await begin(); await session.checkDeploymentBoundary();
  mocks.request.mockRejectedValueOnce(new Error('private-network-error'));
  await expect(session.finish('complete')).rejects.toThrow(/^RECOVERY_WORKFLOW_SESSION_INVALID$/);
  await expect(session.finish('complete')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(session.finish('reconcile')).resolves.toEqual(terminal);
});
it('disposes without exposing private material or permitting another operation', async () => {
  const session = await begin(); session.dispose();
  expect(JSON.stringify(session)).toBe('{}');
  await expect(session.checkDeploymentBoundary()).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(session.finish('reconcile')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
});
it('does not revive a disposed session when an in-flight status check returns', async () => {
  const session = await begin();
  let resolveStatus!: (value: { statusJws: string }) => void;
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
  const boundary = session.checkDeploymentBoundary();
  session.dispose(); resolveStatus({ statusJws: 'status' });
  await expect(boundary).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(session.finish('reconcile')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
});
it('does not send a terminal request after disposal during fresh OIDC acquisition', async () => {
  const session = await begin(); await session.checkDeploymentBoundary();
  let resolveOidc!: (value: string) => void;
  mocks.oidc.mockImplementationOnce(() => new Promise(resolve => { resolveOidc = resolve; }));
  const finishing = session.finish('complete'); session.dispose(); resolveOidc('late-token');
  await expect(finishing).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  expect(mocks.request.mock.calls.map(call => call[0])).toEqual(['issue', 'claim', 'status', 'status']);
});
it('does not send terminal requests when the signed correlation deadline has elapsed', async () => {
  const session = await begin(); await session.checkDeploymentBoundary();
  mocks.correlation.mockImplementation(() => { throw new Error('deadline elapsed'); });
  await expect(session.finish('complete')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  expect(mocks.request.mock.calls.map(call => call[0])).toEqual(['issue', 'claim', 'status', 'status']);
  await expect(session.checkDeploymentBoundary()).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
});
