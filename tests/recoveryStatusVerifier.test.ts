// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable, PassThrough } from 'node:stream';
import { beforeAll, expect, it, vi } from 'vitest';

const kid = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
const payload = () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-status-v1',
  iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
  sub: 'warpkeep-0.4.0-recovery-control-status', kid, enabled: true,
  authorizationEpoch: 7, iat: 1000, nbf: 1000, exp: 1060 });
function token(value: unknown = payload(), header = JSON.stringify({ alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-status+jwt', kid })) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  const input = `${Buffer.from(header).toString('base64url')}.${Buffer.from(body).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from((s > order / 2n ? order - s : s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return `${input}.${signature.toString('base64url')}`;
}
let verify: typeof import('../scripts/verify-recovery-status.mjs').verifyRecoveryStatus;
let verifyInput: typeof import('../scripts/verify-recovery-status.mjs').verifyRecoveryStatusFromStdin;
beforeAll(async () => {
  vi.doMock('../scripts/recovery-public-key.mjs', () => ({ RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: jwk, RECOVERY_KEY_THUMBPRINT: thumbprint }));
  verify = (await import('../scripts/verify-recovery-status.mjs')).verifyRecoveryStatus;
  verifyInput = (await import('../scripts/verify-recovery-status.mjs')).verifyRecoveryStatusFromStdin;
});
it('verifies a signed enabled status and returns only safe gate coordinates', () => {
  expect(verify(token(), 7, 1030)).toEqual({ authorizationEpoch: 7, issuedAt: 1000, expiresAt: 1060 });
});
it.each([
  ['schemaVersion', 2], ['profile', 'wrong'], ['iss', 'https://other.example'],
  ['aud', 'warpkeep-release-recovery'], ['sub', 'wrong'], ['kid', 'wrong'],
  ['enabled', false], ['authorizationEpoch', 8], ['iat', 1001], ['nbf', 999],
  ['exp', 1061], ['exp', 1000], ['authorizationEpoch', 0],
] as const)('rejects signed invalid %s=%s', (key, value) => {
  expect(() => verify(token({ ...payload(), [key]: value }), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it.each([999, 1060, 1061, -1, 1000.5])('rejects invalid observation time %s', now => {
  expect(() => verify(token(), 7, now)).toThrow('RECOVERY_STATUS_INVALID');
});
it('rejects duplicate keys, extra keys, noncanonical JSON and alternate header algorithms', () => {
  for (const body of [JSON.stringify(payload()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    JSON.stringify({ ...payload(), extra: true }), JSON.stringify(payload(), null, 2)]) {
    expect(() => verify(token(body), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
  }
  expect(() => verify(token(payload(), JSON.stringify({ alg: 'none', typ: 'warpkeep-0.4.0-recovery-status+jwt', kid })), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it('rejects changed signatures and high-S malleability', () => {
  const compact = token(); const [header, body, encoded] = compact.split('.') as [string, string, string];
  const signature = Buffer.from(encoded, 'base64url');
  signature[0] = signature[0]! ^ 1;
  expect(() => verify(`${header}.${body}.${signature.toString('base64url')}`, 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
  const original = Buffer.from(encoded, 'base64url');
  const highS = order - BigInt(`0x${original.subarray(32).toString('hex')}`);
  Buffer.from(highS.toString(16).padStart(64, '0'), 'hex').copy(original, 32);
  expect(() => verify(`${header}.${body}.${original.toString('base64url')}`, 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it('rejects signed UTF-8 BOM prefixes rather than normalizing wire bytes', () => {
  expect(() => verify(token(`\ufeff${JSON.stringify(payload())}`), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
  const header = JSON.stringify({ alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-status+jwt', kid });
  expect(() => verify(token(payload(), `\ufeff${header}`), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it.each(Object.keys(payload()))('rejects signed payload missing %s', key => {
  const value: Record<string, unknown> = payload();
  delete value[key];
  expect(() => verify(token(value), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it('rejects a correctly signed payload with reordered canonical keys', () => {
  const reordered = Object.fromEntries(Object.entries(payload()).reverse());
  expect(() => verify(token(reordered), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it.each([
  { typ: 'warpkeep-0.4.0-recovery-status+jwt', kid },
  { alg: 'ES256', kid },
  { alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-status+jwt' },
  { alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-status+jwt', kid, extra: true },
  { kid, typ: 'warpkeep-0.4.0-recovery-status+jwt', alg: 'ES256' },
  { alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-claim+jwt', kid },
  { alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-status+jwt', kid: 'other' },
])('rejects signed malformed protected header %j', header => {
  expect(() => verify(token(payload(), JSON.stringify(header)), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it.each([63, 65])('rejects a %s-byte P1363 signature', length => {
  const [header, body, encoded] = token().split('.') as [string, string, string];
  const signature = Buffer.alloc(length);
  Buffer.from(encoded, 'base64url').copy(signature);
  expect(() => verify(`${header}.${body}.${signature.toString('base64url')}`, 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it('rejects malformed or oversized compact encodings without leaking input', () => {
  for (const compact of ['', 'private-status-sentinel', 'A'.repeat(16385), `${token()}=`, `${token()}.extra`]) {
    expect(() => verify(compact, 7, 1030)).toThrowError(/^RECOVERY_STATUS_INVALID$/);
  }
});
it('rejects caller-selected keys and invalid expected epochs', () => {
  expect(() => Reflect.apply(verify, null, [token(), 7, 1030, jwk])).toThrow('RECOVERY_STATUS_INVALID');
  for (const epoch of [0, -1, 7.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => verify(token(), epoch, 1030)).toThrow('RECOVERY_STATUS_INVALID');
  }
});
it('does not accept the test signer through the unmodified production key entrypoint', async () => {
  vi.doUnmock('../scripts/recovery-public-key.mjs');
  vi.resetModules();
  const production = await import('../scripts/verify-recovery-status.mjs');
  expect(() => production.verifyRecoveryStatus(token(), 7, 1030)).toThrow('RECOVERY_STATUS_INVALID');
});
it('rejects unsupported CLI arguments without printing input', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-recovery-status.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_STATUS_INVALID\n');
});

it('verifies bounded binary stdin using the current clock after input completes', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1030000);
  try {
    const bytes = Buffer.from(token());
    const input = Readable.from([bytes.subarray(0, 100), bytes.subarray(100)]);
    await expect(verifyInput(input, 7)).resolves.toEqual({ authorizationEpoch: 7, issuedAt: 1000, expiresAt: 1060 });
    expect(input.destroyed).toBe(true);
    expect(bytes.every(byte => byte === 0)).toBe(true);
  } finally { clock.mockRestore(); }
});
it('rejects a token which expires while stdin is still being read', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1030000);
  const input = new PassThrough();
  try {
    const result = verifyInput(input, 7);
    const rejected = expect(result).rejects.toThrow('RECOVERY_STATUS_INVALID');
    input.write(Buffer.from(token()));
    clock.mockReturnValue(1060000);
    input.end();
    await rejected;
  } finally { clock.mockRestore(); input.destroy(); }
});
it.each([
  ['--epoch', '7'], ['--epoch', '07'], ['--epoch', '0'],
  ['--epoch', '7', '--now', '1030'], ['--epoch', '7', '--token', 'private-token-sentinel'],
])('rejects invalid stdin or CLI overrides without exposing bytes: %j', (...argv) => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-recovery-status.mjs', import.meta.url)), ...argv],
    { input: 'private-token-sentinel', encoding: 'utf8', timeout: 10000 });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_STATUS_INVALID\n');
});
it('rejects oversized, empty, text-mode and failed stdin with redacted errors', async () => {
  for (const input of [Readable.from([Buffer.alloc(16385, 65)]), Readable.from([]), Readable.from(['private-token-sentinel'])]) {
    await expect(verifyInput(input, 7)).rejects.toThrowError(/^RECOVERY_STATUS_INVALID$/);
    expect(input.destroyed).toBe(true);
  }
  const broken = new PassThrough();
  const result = verifyInput(broken, 7);
  broken.destroy(new Error('private-token-sentinel'));
  await expect(result).rejects.toThrowError(/^RECOVERY_STATUS_INVALID$/);
});
it('rejects stdin that never reaches EOF within five seconds', async () => {
  vi.useFakeTimers();
  const input = new PassThrough();
  try {
    const result = verifyInput(input, 7);
    const rejected = expect(result).rejects.toThrowError(/^RECOVERY_STATUS_INVALID$/);
    input.write(Buffer.from('private-token-sentinel'));
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(input.destroyed).toBe(true);
  } finally { vi.useRealTimers(); input.destroy(); }
});
it('terminates a real CLI process whose stdin producer never closes', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/verify-recovery-status.mjs', import.meta.url)), '--epoch', '7'],
    { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.stdin.on('error', () => {});
  const emergency = setTimeout(() => child.kill(), 8000);
  try {
    child.stdin.write('private-token-sentinel');
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe('RECOVERY_STATUS_INVALID\n');
  } finally { clearTimeout(emergency); child.kill(); }
}, 10000);
