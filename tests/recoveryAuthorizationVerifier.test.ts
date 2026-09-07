// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, expect, it, vi } from 'vitest';
import { recoveryAuthorizationFixture } from './fixtures/recoveryAuthorizationFixture';
const kid = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
function token(value: unknown) {
  const input = `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-authorization+jwt', kid })).toString('base64url')}.${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from((s > order / 2n ? order - s : s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return `${input}.${signature.toString('base64url')}`;
}
let verify: typeof import('../scripts/verify-recovery-authorization-jws.mjs').verifyRecoveryAuthorization;
beforeAll(async () => {
  vi.doMock('../scripts/recovery-public-key.mjs', () => ({ RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: jwk, RECOVERY_KEY_THUMBPRINT: thumbprint }));
  verify = (await import('../scripts/verify-recovery-authorization-jws.mjs')).verifyRecoveryAuthorization;
});
it('verifies signed authorization against the static binding and independent runtime context', () => {
  const f = recoveryAuthorizationFixture(); const compact = token(f.payload);
  const result = verify(compact, f.bindingSource, JSON.stringify(f.context), 1100);
  expect(result.issuedAt).toBe(1010); expect(result.expiresAt).toBe(1910);
  const claim = JSON.parse(result.claimExpectedSource);
  expect(claim.authorizationJwsSha256).toBe(createHash('sha256').update(compact).digest('hex'));
  expect(claim.authorizationJti).toBe('123e4567-e89b-42d3-a456-426614174005');
  expect(claim.candidateCommit).toBe('a'.repeat(40)); expect(claim.artifactId).toBe('789');
});
it.each(Object.keys(recoveryAuthorizationFixture().payload))('rejects signed authorization missing %s', key => {
  const f = recoveryAuthorizationFixture(); const p: Record<string, unknown> = { ...f.payload }; delete p[key];
  expect(() => verify(token(p), f.bindingSource, JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
it.each(Object.keys(recoveryAuthorizationFixture().payload))('rejects independently invalid signed field %s', key => {
  const f = recoveryAuthorizationFixture(); const p: Record<string, unknown> = { ...f.payload };
  p[key] = typeof p[key] === 'boolean' ? !p[key] : typeof p[key] === 'number' ? -1 : 'invalid';
  expect(() => verify(token(p), f.bindingSource, JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
it.each(Object.keys(recoveryAuthorizationFixture().context))('rejects independently mismatched runtime %s', key => {
  const f = recoveryAuthorizationFixture(); const context = { ...f.context, [key]: 'substituted' };
  expect(() => verify(token(f.payload), f.bindingSource, JSON.stringify(context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
it.each([
  ['authorizationEpoch', 9], ['requestId', '123e4567-e89b-42d3-a456-426614174009'], ['jti', 'wrong'],
  ['g001PlayerAccessEnabled', false], ['g002Sealed', false], ['ptrGeneralAdmissionCount', 1],
  ['genesis002Database', 'f'.repeat(64)], ['predecessorCommit', 'f'.repeat(40)], ['workflowSha', 'f'.repeat(40)],
  ['recoveryAuthorizationCoreSha256', 'f'.repeat(64)], ['g001BaselineAbiSha256', 'f'.repeat(64)],
  ['exp', 1911], ['observedFrom', 889], ['observedThrough', 1011], ['nbf', 1009],
] as const)('rejects invalid signed authorization %s', (key, value) => {
  const f = recoveryAuthorizationFixture();
  expect(() => verify(token({ ...f.payload, [key]: value }), f.bindingSource, JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
it.each([1009, 1910, 1911])('rejects authorization outside lifetime at %s', now => {
  const f = recoveryAuthorizationFixture();
  expect(() => verify(token(f.payload), f.bindingSource, JSON.stringify(f.context), now)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
it('accepts the exact 120-second observation-age boundary and rejects 121 seconds', () => {
  const f = recoveryAuthorizationFixture();
  expect(verify(token({ ...f.payload, observedFrom: 890 }), f.bindingSource, JSON.stringify(f.context), 1100).issuedAt).toBe(1010);
  expect(() => verify(token({ ...f.payload, observedFrom: 889 }), f.bindingSource, JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
it.each(['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'])(
  'preserves full decimal runtime %s without coercion', key => {
    const f = recoveryAuthorizationFixture();
    const context = { ...f.context, [key]: '18446744073709551615' };
    const p = { ...f.payload, ...context, artifactName: `github-pages-recovery-${context.pagesRunId}-${context.pagesRunAttempt}` };
    const result = verify(token(p), f.bindingSource, JSON.stringify(context), 1100);
    expect(JSON.parse(result.claimExpectedSource)[key]).toBe('18446744073709551615');
  });
it('rejects a modified static binding before deriving claim expectations', () => {
  const f = recoveryAuthorizationFixture(); const binding = JSON.parse(f.bindingSource);
  binding.g001PlayerAccessEnabled = false;
  expect(() => verify(token(f.payload), `${JSON.stringify(binding, null, 2)}\n`, JSON.stringify(f.context), 1100)).toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
