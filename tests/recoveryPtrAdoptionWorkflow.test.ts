// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { recoveryG002PtrAdoptionCandidate } from './fixtures/recoveryG002PtrAdoptionCandidate';
import { recoveryAuthorizationFixture } from './fixtures/recoveryAuthorizationFixture';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { createRecoveryActivationBindingFromCandidate } from '../scripts/recovery-activation-candidate.mjs';
import { recoveryBindingKeys } from '../scripts/recovery-binding-projection.mjs';

// The external network and private-storage boundary are controlled here. All
// binding parsing and authorization/claim/status cryptography remain real.
const external = vi.hoisted(() => ({ oidc: vi.fn(), request: vi.fn(), preflight: vi.fn(), write: vi.fn(), read: vi.fn() }));
vi.mock('../scripts/recovery-workflow-oidc.mjs', () => ({ requestFreshRecoveryOidc: external.oidc }));
vi.mock('../scripts/recovery-authorization-client.mjs', () => ({ requestRecovery: external.request }));
vi.mock('../scripts/recovery-claim-handoff.mjs', () => ({ preflightRecoveryClaimHandoff: external.preflight,
  writeRecoveryClaimHandoff: external.write, readRecoveryClaimHandoffForDeployment: external.read }));

const fixture = recoveryAuthorizationFixture();
const kid = fixture.payload.kid;
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
const document = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const context = JSON.stringify(fixture.context);
let currentVersion: 4 | 5 = 4;
function binding(adoption = '8'.repeat(64)) {
  if (currentVersion === 5) return createRecoveryActivationBindingFromCandidate(document({ ...recoveryG002PtrAdoptionCandidate(), ptrExistingStateAdoptionReceiptDigest: adoption }));
  const values: Record<string, unknown> = { ...recoveryBindingCandidate(), schemaVersion: 4,
    profile: 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4',
    ptrExistingUpdateReceiptDigest: '9'.repeat(64), ptrExistingUpdateReceiptCommitment: null,
    ptrExistingStateAdoptionReceiptDigest: adoption, ptrExistingStateAdoptionReceiptCommitment: null,
    ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0,
    ptrExpectedSealedStateHmacSha256: '7'.repeat(64), ptrExpectedOwnerInvariantHmacSha256: '6'.repeat(64) };
  return createRecoveryActivationBindingFromCandidate(document(Object.fromEntries(recoveryBindingKeys(4).map(key => [key, values[key]]))));
}
function token(kind: 'authorization' | 'claim' | 'status', payload: unknown) {
  const body = `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: `warpkeep-0.4.0-recovery-${kind}+jwt`, kid })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(body), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from((s > order / 2n ? order - s : s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return `${body}.${signature.toString('base64url')}`;
}
let begin: typeof import('../scripts/recovery-workflow-session.mjs').beginRecoveryWorkflowSession;
let persistedBoundary: typeof import('../scripts/recovery-workflow-deployment-boundary.mjs').checkPersistedRecoveryDeploymentBoundary;
let verify: typeof import('../scripts/verify-recovery-authorization-jws.mjs').verifyRecoveryAuthorization;
let retained: { claimReceiptJws: string; expectedSource: string } | undefined;
let authorizationJws: string;
const expectedClaim = { authorizationEpoch: 3, claimSequence: 1, issuedAt: 1100, expiresAt: 1220 };
beforeAll(async () => {
  vi.doMock('../scripts/recovery-public-key.mjs', () => ({ RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: jwk, RECOVERY_KEY_THUMBPRINT: thumbprint }));
  verify = (await import('../scripts/verify-recovery-authorization-jws.mjs')).verifyRecoveryAuthorization;
  begin = (await import('../scripts/recovery-workflow-session.mjs')).beginRecoveryWorkflowSession;
  persistedBoundary = (await import('../scripts/recovery-workflow-deployment-boundary.mjs')).checkPersistedRecoveryDeploymentBoundary;
});
function setup() {
  vi.resetAllMocks(); retained = undefined;
  vi.spyOn(Date, 'now').mockReturnValue(1100 * 1000);
  let sequence = 0;
  external.oidc.mockImplementation(async () => `synthetic-oidc-${++sequence}`);
  authorizationJws = token('authorization', { ...fixture.payload, recoveryAuthorizationCoreSha256: binding().recoveryAuthorizationCoreSha256 });
  external.request.mockImplementation(async (endpoint: string) => {
    if (endpoint === 'issue') return { authorizationJws };
    if (endpoint === 'claim') {
      const expected = JSON.parse(verify(authorizationJws, document(binding()), context, 1100).claimExpectedSource);
      return { claimReceiptJws: token('claim', { schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-claim-v1',
        iss: fixture.payload.iss, aud: fixture.payload.aud, sub: 'warpkeep-0.4.0-recovery-deployment-claim', kid,
        ...expected, claimSequence: 1, claimedAt: 1100, claimDeadline: 2300, iat: 1100, nbf: 1100, exp: 1220 }) };
    }
    if (endpoint === 'status') return { statusJws: token('status', { schemaVersion: 1,
      profile: 'warpkeep-0.4.0-recovery-status-v1', iss: fixture.payload.iss, aud: fixture.payload.aud,
      sub: 'warpkeep-0.4.0-recovery-control-status', kid, enabled: true, authorizationEpoch: 3,
      iat: 1100, nbf: 1100, exp: 1160 }) };
    throw new Error('Unexpected external operation');
  });
  external.write.mockImplementation((_root: string, claimReceiptJws: string, expectedSource: string) => {
    retained = { claimReceiptJws, expectedSource };
  });
  external.read.mockImplementation(() => {
    if (!retained) throw new Error('Missing synthetic storage');
    return { ...retained };
  });
}
afterEach(() => vi.restoreAllMocks());

describe.each([4, 5] as const)('signed V%i adoption workflow', version => {
beforeEach(() => { currentVersion = version; setup(); });
it('carries real signed authorization and claim through both workflow deployment boundaries', async () => {
  const session = await begin(document(binding()), context, '/synthetic-private-root');
  try {
    await expect(session.checkDeploymentBoundary()).resolves.toEqual(expectedClaim);
    await expect(persistedBoundary('/synthetic-private-root', document(binding()), context)).resolves.toEqual(expectedClaim);
    expect(external.request.mock.calls.map(([endpoint]) => endpoint)).toEqual(['issue', 'claim', 'status', 'status', 'status']);
  } finally { session.dispose(); }
});
it('rejects a valid authorization for a different adoption before requesting a claim', async () => {
  authorizationJws = token('authorization', { ...fixture.payload, recoveryAuthorizationCoreSha256: binding('5'.repeat(64)).recoveryAuthorizationCoreSha256 });
  await expect(begin(document(binding()), context, '/synthetic-private-root')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  expect(external.request.mock.calls.map(([endpoint]) => endpoint)).toEqual(['issue']);
  expect(retained).toBeUndefined();
});
it('rejects mixed profiles in both real workflow consumers before external access', async () => {
  const source = document({ ...binding(), profile: 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' });
  await expect(begin(source, context, '/synthetic-private-root')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  await expect(persistedBoundary('/synthetic-private-root', source, context)).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID');
  expect(external.request).not.toHaveBeenCalled();
  expect(external.read).not.toHaveBeenCalled();
});
it('requires fresh signed status and current claim validity for the retained handoff', async () => {
  const session = await begin(document(binding()), context, '/synthetic-private-root');
  try {
    vi.spyOn(Date, 'now').mockReturnValue(1160 * 1000);
    await expect(persistedBoundary('/synthetic-private-root', document(binding()), context)).rejects.toThrow('RECOVERY_WORKFLOW_DEPLOYMENT_BOUNDARY_INVALID');
  } finally { session.dispose(); }
});
it('rejects a valid authorization for another version before claiming', async () => {
  currentVersion = version === 4 ? 5 : 4;
  authorizationJws = token('authorization', { ...fixture.payload, recoveryAuthorizationCoreSha256: binding().recoveryAuthorizationCoreSha256 });
  currentVersion = version;
  await expect(begin(document(binding()), context, '/synthetic-private-root')).rejects.toThrow('RECOVERY_WORKFLOW_SESSION_INVALID');
  expect(external.request.mock.calls.map(([endpoint]) => endpoint)).toEqual(['issue']);
});
});
