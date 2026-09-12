// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, expect, it, vi } from 'vitest';
const kid = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
const expected = { requestId: '123e4567-e89b-42d3-a456-426614174000', authorizationJti: '123e4567-e89b-42d3-a456-426614174001',
  authorizationJwsSha256: '1'.repeat(64), pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
  candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40), artifactId: '789', artifactName: 'github-pages-recovery-123-1',
  githubArtifactArchiveSha256: '2'.repeat(64), innerArtifactTarSha256: '3'.repeat(64), contentManifestSha256: '4'.repeat(64),
  deploymentAttestationSha256: '5'.repeat(64), operation: 'github-pages-production-deploy', canonicalOrigin: 'https://warpkeep.com', authorizationEpoch: 7 };
const source = JSON.stringify(expected);
function payload() {
  const e = expected;
  return { schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-terminal-v1', iss: 'https://release-auth.warpkeep.com',
    aud: 'warpkeep-0.4.0-sealed-launch', sub: 'warpkeep-0.4.0-recovery-terminal-attestation', kid,
    requestId: e.requestId, authorizationJti: e.authorizationJti, authorizationJwsSha256: e.authorizationJwsSha256,
    candidateCommit: e.candidateCommit, candidateTree: e.candidateTree, artifactId: e.artifactId, artifactName: e.artifactName,
    githubArtifactArchiveSha256: e.githubArtifactArchiveSha256, innerArtifactTarSha256: e.innerArtifactTarSha256,
    contentManifestSha256: e.contentManifestSha256, deploymentAttestationSha256: e.deploymentAttestationSha256,
    operation: e.operation, canonicalOrigin: e.canonicalOrigin, pagesRunId: e.pagesRunId, pagesRunAttempt: e.pagesRunAttempt,
    sourceVerifyRunId: e.sourceVerifyRunId, sourceVerifyRunAttempt: e.sourceVerifyRunAttempt, authorizationEpoch: e.authorizationEpoch,
    completedAt: 990, outcome: 'completed', iat: 1000, nbf: 1000, exp: 1900 };
}
function token(value: unknown = payload()) {
  const input = `${Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-terminal+jwt', kid })).toString('base64url')}.${Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from((s > order / 2n ? order - s : s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return `${input}.${signature.toString('base64url')}`;
}
let verify: typeof import('../scripts/verify-recovery-terminal.mjs').verifyRecoveryTerminal;
beforeAll(async () => {
  vi.doMock('../scripts/recovery-public-key.mjs', () => ({ RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: jwk, RECOVERY_KEY_THUMBPRINT: thumbprint }));
  verify = (await import('../scripts/verify-recovery-terminal.mjs')).verifyRecoveryTerminal;
});
it.each(['completed', 'not-deployed'])('verifies signed %s without returning private claim coordinates', outcome => {
  expect(verify(token({ ...payload(), outcome }), source, 1100)).toEqual({ outcome, completedAt: 990, authorizationEpoch: 7, issuedAt: 1000, expiresAt: 1900 });
});
it.each(Object.keys(expected))('rejects a different expected %s', key => {
  expect(() => verify(token(), JSON.stringify({ ...expected, [key]: 'wrong' }), 1100)).toThrow('RECOVERY_TERMINAL_INVALID');
});
it.each([['schemaVersion', 2], ['profile', 'wrong'], ['iss', 'wrong'], ['aud', 'wrong'], ['sub', 'wrong'], ['kid', 'wrong'],
  ['completedAt', 1001], ['completedAt', -1], ['outcome', 'pending'], ['iat', 1101], ['nbf', 999], ['exp', 1901], ['exp', 1000]])
  ('rejects signed invalid %s', (key, value) => {
    expect(() => verify(token({ ...payload(), [key as string]: value }), source, 1100)).toThrow('RECOVERY_TERMINAL_INVALID');
  });
it.each([999, 1900, -1, 1100.5])('rejects invalid verification time %s', now => {
  expect(() => verify(token(), source, now)).toThrow('RECOVERY_TERMINAL_INVALID');
});
it('rejects noncanonical and substituted signatures', () => {
  for (const value of [JSON.stringify(payload(), null, 2), { ...payload(), extra: true }, Object.fromEntries(Object.entries(payload()).reverse())]) {
    expect(() => verify(token(value), source, 1100)).toThrow('RECOVERY_TERMINAL_INVALID');
  }
  const [header, body, encoded] = token().split('.') as [string, string, string];
  const signature = Buffer.from(encoded, 'base64url'); signature[0] = signature[0]! ^ 1;
  expect(() => verify(`${header}.${body}.${signature.toString('base64url')}`, source, 1100)).toThrow('RECOVERY_TERMINAL_INVALID');
});
it('keeps the test key out of the production verifier', async () => {
  vi.doUnmock('../scripts/recovery-public-key.mjs'); vi.resetModules();
  const production = await import('../scripts/verify-recovery-terminal.mjs');
  expect(() => production.verifyRecoveryTerminal(token(), source, 1100)).toThrow('RECOVERY_TERMINAL_INVALID');
});
it.each(Object.keys(payload()))('rejects a terminal payload missing %s', key => {
  const value: Record<string, unknown> = payload(); delete value[key];
  expect(() => verify(token(value), source, 1100)).toThrow('RECOVERY_TERMINAL_INVALID');
});
it('rejects high-S signatures and caller-selected verification keys', () => {
  const [header, body, encoded] = token().split('.') as [string, string, string];
  const signature = Buffer.from(encoded, 'base64url');
  const high = order - BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from(high.toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  expect(() => verify(`${header}.${body}.${signature.toString('base64url')}`, source, 1100)).toThrow('RECOVERY_TERMINAL_INVALID');
  expect(() => Reflect.apply(verify, null, [token(), source, 1100, jwk])).toThrow('RECOVERY_TERMINAL_INVALID');
});
