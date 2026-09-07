// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PassThrough, Readable } from 'node:stream';
import { beforeAll, expect, it, vi } from 'vitest';
const kid = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
const expected = () => ({ requestId: '123e4567-e89b-42d3-a456-426614174000',
  authorizationJti: '123e4567-e89b-42d3-a456-426614174001', authorizationJwsSha256: '1'.repeat(64),
  pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
  candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40), artifactId: '789', artifactName: 'github-pages-recovery-123-1',
  githubArtifactArchiveSha256: '2'.repeat(64), innerArtifactTarSha256: '3'.repeat(64),
  contentManifestSha256: '4'.repeat(64), deploymentAttestationSha256: '5'.repeat(64),
  operation: 'github-pages-production-deploy', canonicalOrigin: 'https://warpkeep.com', authorizationEpoch: 7 });
const payload = () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-claim-v1',
  iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-deployment-claim', kid, ...expected(),
  claimSequence: 1, claimedAt: 1001, claimDeadline: 2201, iat: 1001, nbf: 1001, exp: 1121 });
function token(value: unknown = payload()) {
  const input = `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-claim+jwt', kid })).toString('base64url')}.${Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from((s > order / 2n ? order - s : s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return `${input}.${signature.toString('base64url')}`;
}
let verify: typeof import('../scripts/verify-recovery-claim-receipt.mjs').verifyRecoveryClaimReceipt;
let verifyInput: typeof import('../scripts/verify-recovery-claim-receipt.mjs').verifyRecoveryClaimReceiptFromStdin;
beforeAll(async () => {
  vi.doMock('../scripts/recovery-public-key.mjs', () => ({ RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: jwk, RECOVERY_KEY_THUMBPRINT: thumbprint }));
  verify = (await import('../scripts/verify-recovery-claim-receipt.mjs')).verifyRecoveryClaimReceipt;
  verifyInput = (await import('../scripts/verify-recovery-claim-receipt.mjs')).verifyRecoveryClaimReceiptFromStdin;
});
it('verifies a signed claim bound to independently expected authorization and artifact coordinates', () => {
  expect(verify(token(), JSON.stringify(expected()), 1030)).toEqual({ authorizationEpoch: 7, claimSequence: 1, issuedAt: 1001, expiresAt: 1121 });
});
it.each(Object.keys(expected()))('rejects independently mismatched expected %s', key => {
  const value: Record<string, unknown> = expected(); value[key] = 'substituted';
  expect(() => verify(token(), JSON.stringify(value), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
});
it.each(Object.keys(payload()))('rejects a signed claim missing %s', key => {
  const value: Record<string, unknown> = payload(); delete value[key];
  expect(() => verify(token(value), JSON.stringify(expected()), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
});
it.each([1000, 1121, 1122, 2199, 2200])('rejects use outside receipt lifetime at %s, including before ledger deadline', now => {
  expect(() => verify(token(), JSON.stringify(expected()), now)).toThrow('RECOVERY_CLAIM_INVALID');
});
it.each([
  ['claimDeadline', 2202], ['claimSequence', 0], ['claimedAt', 1002], ['exp', 1122], ['nbf', 1000],
  ['schemaVersion', 2], ['profile', 'wrong'], ['iss', 'wrong'], ['aud', 'wrong'], ['sub', 'wrong'], ['kid', 'wrong'],
] as const)('rejects signed invalid %s', (key, value) => {
  expect(() => verify(token({ ...payload(), [key]: value }), JSON.stringify(expected()), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
});
it.each([
  ['requestId', 'wrong'], ['authorizationJti', 'wrong'], ['authorizationJwsSha256', 'A'.repeat(64)],
  ['pagesRunId', '0123'], ['pagesRunAttempt', '0'], ['sourceVerifyRunId', '123'], ['sourceVerifyRunAttempt', '1.5'],
  ['candidateCommit', 'a'.repeat(39)], ['candidateTree', 'B'.repeat(40)], ['artifactId', '0'], ['artifactName', 'wrong'],
  ['githubArtifactArchiveSha256', 'x'.repeat(64)], ['innerArtifactTarSha256', 'x'.repeat(64)],
  ['contentManifestSha256', 'x'.repeat(64)], ['deploymentAttestationSha256', 'x'.repeat(64)],
  ['operation', 'wrong'], ['canonicalOrigin', 'https://other.example'], ['authorizationEpoch', 0],
] as const)('rejects invalid signed %s even when expected data agrees', (key, value) => {
  expect(() => verify(token({ ...payload(), [key]: value }), JSON.stringify({ ...expected(), [key]: value }), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
});
it('rejects noncanonical, duplicate, reordered and extra fields despite valid signatures', () => {
  for (const value of [JSON.stringify(payload(), null, 2), `\ufeff${JSON.stringify(payload())}`,
    JSON.stringify(payload()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    Object.fromEntries(Object.entries(payload()).reverse()), { ...payload(), extra: true }]) {
    expect(() => verify(token(value), JSON.stringify(expected()), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
  }
});
it('rejects extra or reordered expected fields and caller expiry overrides', () => {
  for (const value of [{ ...expected(), extra: true }, Object.fromEntries(Object.entries(expected()).reverse())]) {
    expect(() => verify(token(), JSON.stringify(value), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
  }
  expect(() => Reflect.apply(verify, null, [token(), JSON.stringify(expected()), 1122, { allowExpired: true }])).toThrow('RECOVERY_CLAIM_INVALID');
});
it('rejects a sequence other than the one durable claim', () => {
  expect(() => verify(token({ ...payload(), claimSequence: 2 }), JSON.stringify(expected()), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
});
it('rejects a receipt issued after a different stored claim timestamp', () => {
  expect(() => verify(token({ ...payload(), claimedAt: 1000, claimDeadline: 2200 }), JSON.stringify(expected()), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
});
it.each(['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'])(
  'preserves full canonical decimal %s without Number coercion', key => {
    const coordinates: Record<string, string | number> = { ...expected(), [key]: '18446744073709551615' };
    coordinates.artifactName = `github-pages-recovery-${coordinates.pagesRunId}-${coordinates.pagesRunAttempt}`;
    expect(verify(token({ ...payload(), ...coordinates }), JSON.stringify(coordinates), 1030)).toEqual({ authorizationEpoch: 7, claimSequence: 1, issuedAt: 1001, expiresAt: 1121 });
  });
it('rejects the test signer through the unmodified production entrypoint', async () => {
  vi.doUnmock('../scripts/recovery-public-key.mjs'); vi.resetModules();
  const production = await import('../scripts/verify-recovery-claim-receipt.mjs');
  expect(() => production.verifyRecoveryClaimReceipt(token(), JSON.stringify(expected()), 1030)).toThrow('RECOVERY_CLAIM_INVALID');
});
it('rejects unsupported CLI arguments without exposing private data', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-recovery-claim-receipt.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  expect(result.status).toBe(1); expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_CLAIM_INVALID\n');
});
it('verifies a private stdin envelope and wipes the consumed buffer', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1030000);
  const bytes = Buffer.from(JSON.stringify({ claimReceiptJws: token(), expectedSource: JSON.stringify(expected()) }));
  const input = Readable.from([bytes]);
  try {
    await expect(verifyInput(input)).resolves.toEqual({ authorizationEpoch: 7, claimSequence: 1, issuedAt: 1001, expiresAt: 1121 });
    expect(bytes.every(byte => byte === 0)).toBe(true);
    expect(input.destroyed).toBe(true);
  } finally { clock.mockRestore(); }
});
it('rejects expiry while the private envelope is being read', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1030000);
  const input = new PassThrough();
  try {
    const rejected = expect(verifyInput(input)).rejects.toThrow('RECOVERY_CLAIM_INVALID');
    input.write(Buffer.from(JSON.stringify({ claimReceiptJws: token(), expectedSource: JSON.stringify(expected()) })));
    clock.mockReturnValue(1121000); input.end();
    await rejected;
  } finally { clock.mockRestore(); input.destroy(); }
});
it('rejects malformed, oversized, text-mode and extra-field envelopes', async () => {
  for (const source of ['', 'private-sentinel', 'A'.repeat(65537), JSON.stringify({ claimReceiptJws: token(), expectedSource: JSON.stringify(expected()), allowExpired: true })]) {
    const input = Readable.from([Buffer.from(source)]);
    await expect(verifyInput(input)).rejects.toThrowError(/^RECOVERY_CLAIM_INVALID$/);
    expect(input.destroyed).toBe(true);
  }
  await expect(verifyInput(Readable.from(['private-sentinel']))).rejects.toThrow('RECOVERY_CLAIM_INVALID');
});
it('terminates an incomplete private envelope after five seconds', async () => {
  vi.useFakeTimers();
  const input = new PassThrough();
  try {
    const rejected = expect(verifyInput(input)).rejects.toThrow('RECOVERY_CLAIM_INVALID');
    input.write(Buffer.from('private-sentinel'));
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(input.destroyed).toBe(true);
  } finally { vi.useRealTimers(); input.destroy(); }
});
it('rejects duplicate, reordered, BOM-prefixed and noncanonical envelope bytes', async () => {
  const envelope = { claimReceiptJws: token(), expectedSource: JSON.stringify(expected()) };
  for (const source of [JSON.stringify(envelope, null, 2), `\ufeff${JSON.stringify(envelope)}`,
    JSON.stringify({ expectedSource: envelope.expectedSource, claimReceiptJws: envelope.claimReceiptJws }),
    JSON.stringify(envelope).replace('{', '{"claimReceiptJws":"private-sentinel",')]) {
    await expect(verifyInput(Readable.from([Buffer.from(source)]))).rejects.toThrow('RECOVERY_CLAIM_INVALID');
  }
});
it('redacts stream errors and rejects clock override arguments', async () => {
  const input = new PassThrough();
  const rejected = expect(verifyInput(input)).rejects.toThrowError(/^RECOVERY_CLAIM_INVALID$/);
  input.destroy(new Error('private-sentinel')); await rejected;
  await expect(Reflect.apply(verifyInput, null, [Readable.from([]), 1030])).rejects.toThrow('RECOVERY_CLAIM_INVALID');
});
it.each([[], ['--now', '1030'], ['--token', 'private-sentinel']])('CLI redacts private stdin and rejects overrides: %j', (...argv) => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-recovery-claim-receipt.mjs', import.meta.url)), ...argv],
    { input: 'private-sentinel', encoding: 'utf8', timeout: 10000 });
  expect(result.status).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr).toBe('RECOVERY_CLAIM_INVALID\n');
});
