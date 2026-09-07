// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
let verifyInput: typeof import('../scripts/verify-recovery-authorization-jws.mjs').verifyRecoveryAuthorizationFromStdin;
beforeAll(async () => {
  vi.doMock('../scripts/recovery-public-key.mjs', () => ({ RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: jwk, RECOVERY_KEY_THUMBPRINT: thumbprint }));
  verify = (await import('../scripts/verify-recovery-authorization-jws.mjs')).verifyRecoveryAuthorization;
  verifyInput = (await import('../scripts/verify-recovery-authorization-jws.mjs')).verifyRecoveryAuthorizationFromStdin;
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
function inputEnvelope() {
  const f = recoveryAuthorizationFixture();
  return { authorizationJws: token(f.payload), bindingSource: f.bindingSource, expectedSource: JSON.stringify(f.context) };
}
it('verifies private binary input and clears its consumed bytes', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1100000);
  const bytes = Buffer.from(JSON.stringify(inputEnvelope()));
  const input = Readable.from([bytes]);
  try {
    const result = await verifyInput(input);
    expect(result.issuedAt).toBe(1010); expect(result.expiresAt).toBe(1910);
    expect(JSON.parse(result.claimExpectedSource).artifactId).toBe('789');
    expect(bytes.every(byte => byte === 0)).toBe(true); expect(input.destroyed).toBe(true);
  } finally { clock.mockRestore(); }
});
it('samples authorization expiry after the producer finishes', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1100000);
  const input = new PassThrough();
  try {
    const rejected = expect(verifyInput(input)).rejects.toThrow('RECOVERY_AUTHORIZATION_INVALID');
    input.write(Buffer.from(JSON.stringify(inputEnvelope())));
    clock.mockReturnValue(1910000); input.end(); await rejected;
  } finally { clock.mockRestore(); input.destroy(); }
});
it('rejects malformed, noncanonical and oversized private envelopes', async () => {
  const envelope = inputEnvelope();
  for (const source of ['', 'private-sentinel', 'A'.repeat(2162689), JSON.stringify(envelope, null, 2),
    `\ufeff${JSON.stringify(envelope)}`, JSON.stringify({ ...envelope, now: 1100 }),
    JSON.stringify(Object.fromEntries(Object.entries(envelope).reverse())),
    JSON.stringify(envelope).replace('{', '{"authorizationJws":"private-sentinel",')]) {
    const input = Readable.from([Buffer.from(source)]);
    await expect(verifyInput(input)).rejects.toThrowError(/^RECOVERY_AUTHORIZATION_INVALID$/);
    expect(input.destroyed).toBe(true);
  }
});
it('rejects text streams and caller clock overrides', async () => {
  await expect(verifyInput(Readable.from(['private-sentinel']))).rejects.toThrow('RECOVERY_AUTHORIZATION_INVALID');
  await expect(Reflect.apply(verifyInput, null, [Readable.from([]), 1100])).rejects.toThrow('RECOVERY_AUTHORIZATION_INVALID');
});
it('destroys unfinished input after five seconds and redacts producer errors', async () => {
  vi.useFakeTimers();
  const input = new PassThrough();
  try {
    const rejected = expect(verifyInput(input)).rejects.toThrow('RECOVERY_AUTHORIZATION_INVALID');
    input.write(Buffer.from('private-sentinel'));
    await vi.advanceTimersByTimeAsync(5000); await rejected; expect(input.destroyed).toBe(true);
  } finally { vi.useRealTimers(); input.destroy(); }
  const broken = new PassThrough();
  const rejected = expect(verifyInput(broken)).rejects.toThrowError(/^RECOVERY_AUTHORIZATION_INVALID$/);
  broken.destroy(new Error('private-sentinel')); await rejected;
});
it.each([[], ['--check'], ['--now', '1100'], ['--token', 'private-sentinel']])('CLI rejects private input or overrides without echo: %j', (...argv) => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-recovery-authorization-jws.mjs', import.meta.url)), ...argv],
    { input: 'private-sentinel', encoding: 'utf8', timeout: 10000 });
  expect(result.status).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr).toBe('RECOVERY_AUTHORIZATION_INVALID\n');
});
