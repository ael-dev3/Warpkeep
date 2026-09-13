// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { recoveryG002PtrAdoptionCandidate } from './fixtures/recoveryG002PtrAdoptionCandidate';
import { recoveryAuthorizationFixture } from './fixtures/recoveryAuthorizationFixture';
import { createRecoveryActivationBindingFromCandidate } from '../scripts/recovery-activation-candidate.mjs';
import { recoveryBindingKeys } from '../scripts/recovery-binding-projection.mjs';
import { verifySealedRealmsPublicActivationBytes } from '../scripts/verify-sealed-realms-public-activation-artifact.mjs';
import { verifySealedLaunchPagesBuildEnvironment } from '../scripts/verify-0.4.0-sealed-launch.mjs';

const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const kid = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
function token(payload: unknown) {
  const body = `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-authorization+jwt', kid })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(body), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from((s > order / 2n ? order - s : s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return `${body}.${signature.toString('base64url')}`;
}
function createBinding(version: 3 | 4 | 5, receipt = '9'.repeat(64), adoption = '8'.repeat(64)) {
  if (version === 5) return createRecoveryActivationBindingFromCandidate(document({ ...recoveryG002PtrAdoptionCandidate(),
    ptrExistingUpdateReceiptDigest: receipt, ptrExistingStateAdoptionReceiptDigest: adoption }));
  const values = { ...recoveryBindingCandidate(), schemaVersion: version,
    profile: version === 3 ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' : 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4',
    ptrExistingUpdateReceiptDigest: receipt, ptrExistingUpdateReceiptCommitment: null,
    ...(version === 4 ? { ptrExistingStateAdoptionReceiptDigest: adoption, ptrExistingStateAdoptionReceiptCommitment: null,
      ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0,
      ptrExpectedSealedStateHmacSha256: '7'.repeat(64), ptrExpectedOwnerInvariantHmacSha256: '6'.repeat(64) } : {}) } as Record<string, unknown>;
  const candidate = Object.fromEntries(recoveryBindingKeys(version).map(key => [key, values[key]]));
  return createRecoveryActivationBindingFromCandidate(`${JSON.stringify(candidate, null, 2)}\n`);
}
const document = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
let verify: typeof import('../scripts/verify-recovery-authorization-jws.mjs').verifyRecoveryAuthorization;
beforeAll(async () => {
  vi.doMock('../scripts/recovery-public-key.mjs', () => ({ RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: jwk, RECOVERY_KEY_THUMBPRINT: thumbprint }));
  verify = (await import('../scripts/verify-recovery-authorization-jws.mjs')).verifyRecoveryAuthorization;
});
describe.each([3, 4, 5] as const)('public recovery consumers V%s', version => {
  const binding = (receipt?: string, adoption?: string) => createBinding(version, receipt, adoption);
  it('accepts an explicit update artifact through the actual public privacy validator', () => {
    const bytes = Buffer.from(document(binding()));
    expect(verifySealedRealmsPublicActivationBytes(bytes)).toEqual(bytes);
  });
  it('verifies a signed authorization bound to the update receipt core', () => {
    const f = recoveryAuthorizationFixture(); const b = binding();
    const payload = { ...f.payload, recoveryAuthorizationCoreSha256: b.recoveryAuthorizationCoreSha256 };
    expect(verify(token(payload), document(b), JSON.stringify(f.context), 1100).issuedAt).toBe(1010);
  });
  it('binds the actual Pages build environment to the update PTR identity', () => {
    const b = binding();
    const environment = { VITE_WARPKEEP_PTR_ENABLED: 'true', VITE_PTR_SPACETIMEDB_DATABASE: String(b.ptrDatabaseIdentity) };
    expect(verifySealedLaunchPagesBuildEnvironment({ bindingSource: document(b), environment }))
      .toEqual({ ptrEnabled: true, ptrDatabaseIdentity: b.ptrDatabaseIdentity });
    expect(() => verifySealedLaunchPagesBuildEnvironment({ bindingSource: document(b),
      environment: { ...environment, VITE_PTR_SPACETIMEDB_DATABASE: String(b.g001DatabaseIdentity) } })).toThrow();
  });
  it('rejects a different valid update receipt under the original signed authorization', () => {
    const f = recoveryAuthorizationFixture(); const b = binding();
    const payload = { ...f.payload, recoveryAuthorizationCoreSha256: b.recoveryAuthorizationCoreSha256 };
    expect(() => verify(token(payload), document(binding('8'.repeat(64))), JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
  });
  it('rejects fresh authorization substituted for an update authorization', () => {
    const f = recoveryAuthorizationFixture();
    expect(() => verify(token(f.payload), document(binding()), JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
  });
  it.each([
    { ptrPublishReceiptDigest: 'a'.repeat(64) },
    { schemaVersion: 2 },
    { profile: 'warpkeep-0.4.0-sealed-launch-v2' },
    { ptrAdmissionsOpen: true },
  ])('rejects mixed or unsafe public update artifacts %j', change => {
    expect(() => verifySealedRealmsPublicActivationBytes(Buffer.from(document({ ...binding(), ...change })))).toThrow();
  });

  if (version === 4 || version === 5) it('rejects a different adoption envelope under the original signed authorization', () => {
    const f = recoveryAuthorizationFixture(); const b = binding();
    const payload = { ...f.payload, recoveryAuthorizationCoreSha256: b.recoveryAuthorizationCoreSha256 };
    expect(() => verify(token(payload), document(binding(undefined, '7'.repeat(64))), JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
  });
  if (version === 5) it('binds signed G002 adoption independently of the unchanged PTR adoption', () => {
    const f = recoveryAuthorizationFixture(), b = binding();
    const changed = createRecoveryActivationBindingFromCandidate(document({ ...recoveryG002PtrAdoptionCandidate(), g002ExistingStateAdoptionReceiptDigest: '4'.repeat(64) }));
    const payload = { ...f.payload, recoveryAuthorizationCoreSha256: b.recoveryAuthorizationCoreSha256 };
    expect(() => verify(token(payload), document(changed), JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
  });
});
