import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
// @vitest-environment node
import { preparationTransportFixture } from './fixtures/recoveryPreparationSigned.js';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, statSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSealedRealmsProductionPrivateState, SEALED_REALMS_PRIVATE_STATE_VERSION } from '../scripts/sealed-realms-production-private-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../scripts/recovery-public-key.mjs', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}));
const modulePath = '../scripts/sealed-realms-production-recovery-preparation-receipt.mjs';
const codec = await import(/* @vite-ignore */ modulePath).catch(() => ({})) as Record<string, any>;
const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA', d: '3Cfq7fh3QQUIL6yuWLcD7fYN4-26tQgG07i-8nj462o' } });
const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
function fixture(delta: Record<string, unknown> = {}) {
  const policy = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-policy-v1', enabled: true,
    authorizationEpoch: 3, workflowRef: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main',
    environment: 'notification-bridge-prepared', operation: 'activation-evidence-generate' };
  const intent = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-intent-v1',
    requestId: '123e4567-e89b-42d3-a456-426614174000', authorizationEpoch: 3,
    repository: 'ael-dev3/Warpkeep', repositoryId: '1273513252', repositoryOwnerId: '183124839',
    preparationCommit: 'c'.repeat(40), preparationTree: 'd'.repeat(40),
    policyDigest: createHash('sha256').update(`warpkeep-recovery-preparation-data-v1\n${JSON.stringify(policy)}`).digest('hex'),
    configuredArmingDigest: null, runId: '9007199254740995', runAttempt: '2', checkRunId: '9007199254740993', createdAt: 1700000000,
    ...delta };
  const payload = { schemaVersion: 1, profile: 'warpkeep-recovery-preparation-receipt-v1',
    iss: 'https://release-auth.warpkeep.com', aud: 'https://release-auth.warpkeep.com/preparation',
    purpose: 'activation-evidence-preparation', intent };
  const header = { alg: 'ES256', typ: 'warpkeep-recovery-preparation-receipt+jws', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode(header)}.${encode(payload)}`;
  const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  if (s > order / 2n) Buffer.from((order - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  return { compact: `${input}.${signature.toString('base64url')}`, intent };
}
it('verifies the actual service preparation domain and derives immutable signed identity', () => {
  expect(codec.verifySealedRealmsProductionRecoveryPreparationReceipt).toBeTypeOf('function');
  const f = fixture();
  const intent = codec.verifySealedRealmsProductionRecoveryPreparationReceipt(f.compact);
  expect(intent).toEqual(f.intent);
  expect(Object.isFrozen(intent)).toBe(true);
});
it('accepts the independently produced frozen service codec vector without rewrapping its bytes', () => {
  const vector = JSON.parse(readFileSync(new URL('./fixtures/recoveryPreparationServiceVector.json', import.meta.url), 'utf8'));
  expect(codec.verifySealedRealmsProductionRecoveryPreparationReceipt(vector.preparationReceiptJws)).toEqual(vector.intent);
});
it.each([{ repositoryId: '1' }, { authorizationEpoch: 0 }, { policyDigest: 'f'.repeat(64) },
  { requestId: 'not-a-uuid' }, { runAttempt: 2 }, { preparationTree: 'd'.repeat(64) },
  { configuredArmingDigest: '' }, { unexpected: true }])('refuses signed but invalid intent %j', delta => {
  expect(() => codec.verifySealedRealmsProductionRecoveryPreparationReceipt(fixture(delta).compact)).toThrow('SEALED_REALMS_RECOVERY_PREPARATION_RECEIPT_INVALID');
});
it('rejects signature tampering, high-S alternatives, and another signed object domain', () => {
  const parts = fixture().compact.split('.');
  const signature = Buffer.from(parts[2]!, 'base64url');
  const high = Buffer.from(signature);
  Buffer.from((order - BigInt(`0x${high.subarray(32).toString('hex')}`)).toString(16).padStart(64, '0'), 'hex').copy(high, 32);
  expect(() => codec.verifySealedRealmsProductionRecoveryPreparationReceipt(`${parts[0]}.${parts[1]}.${high.toString('base64url')}`)).toThrow();
  signature[0] ^= 1;
  expect(() => codec.verifySealedRealmsProductionRecoveryPreparationReceipt(`${parts[0]}.${parts[1]}.${signature.toString('base64url')}`)).toThrow();
  parts[0] = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-authorization+jwt', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1' })).toString('base64url');
  expect(() => codec.verifySealedRealmsProductionRecoveryPreparationReceipt(parts.join('.'))).toThrow();
});
const transportPath = '../scripts/sealed-realms-production-recovery-preparation-transport.mjs';
const transport = await import(/* @vite-ignore */ transportPath).catch(() => ({})) as Record<string, any>;
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const transportFixture = preparationTransportFixture;
it('uses the fixed OIDC audience and preparation endpoint without exporting request credentials', async () => {
  expect(transport.requestSealedRealmsProductionRecoveryPreparation).toBeTypeOf('function');
  const f = transportFixture();
  expect(await transport.requestSealedRealmsProductionRecoveryPreparation('c'.repeat(40))).toBe(f.compact);
  expect(f.requests.map(x => x.url)).toEqual([
    'https://example.actions.githubusercontent.com/token?api-version=2&audience=https%3A%2F%2Frelease-auth.warpkeep.com%2Fpreparation',
    'https://release-auth.warpkeep.com/v1/recovery/prepare',
  ]);
  expect(f.requests[0]!.init.headers).toMatchObject({ authorization: 'Bearer test-only-oidc-request-credential' });
  expect(f.requests[1]!.init.headers).not.toHaveProperty('authorization');
  expect(JSON.parse(f.requests[1]!.init.body as string)).toEqual({ oidcToken: 'signed.oidc.fixture', preparationCommit: 'c'.repeat(40) });
  expect(f.requests.every(x => x.init.redirect === 'error')).toBe(true);
});
const capabilityPath = '../scripts/sealed-realms-production-recovery-preparation.mjs';
it('acquires a fresh OIDC token for the fixed observation endpoint and refuses receipt substitution', async () => {
  const f = transportFixture();
  expect(await transport.requestSealedRealmsProductionRecoveryPreparationObservation('c'.repeat(40))).toBe(f.observationCompact);
  expect(f.requests.map(x => x.url)).toEqual([
    'https://example.actions.githubusercontent.com/token?api-version=2&audience=https%3A%2F%2Frelease-auth.warpkeep.com%2Fpreparation',
    'https://release-auth.warpkeep.com/v1/recovery/preparation-observation',
  ]);
  transportFixture(url => url.startsWith('https://release-auth.')
    ? Response.json({ preparationReceiptJws: f.compact }) : undefined);
  await expect(transport.requestSealedRealmsProductionRecoveryPreparationObservation('c'.repeat(40))).rejects.toThrow();
});
const capabilityModule = await import(/* @vite-ignore */ capabilityPath).catch(() => ({})) as Record<string, any>;
function ownedFixture() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-preparation-source-'));
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-preparation-private-')); roots.push(root, home);
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: process.platform === 'win32' ? 30000 : 15000 }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  writeFileSync(join(root, 'source'), 'actual source bytes\n'); git(['add', '.']); git(['commit', '-qm', 'S']);
  const commit = git(['rev-parse', 'HEAD']), tree = git(['rev-parse', 'HEAD^{tree}']);
  const authority = authenticateSealedRealmsProductionSourceAuthority({ operation: 'activation-evidence-generate', workflowInputSha: commit,
    readGit: () => commit + '\n', readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: verifiedSha => ({ verifiedSha }) });
  for (const suffix of ['audit/private', 'runtime', 'cache']) mkdirSync(join(sealedRealmsPrivateBase(home), suffix), { recursive: true, mode: 0o700 });
  const privateState = createSealedRealmsProductionPrivateState({ reportedHome: home, testOnlyOwnerUid: statSync(home).uid,
    testOnlyAllowPlatformMode: true, testOnlyFsync: () => {} });
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  return { root, home, commit, tree, authority, privateState };
}
it('owns a real signed service receipt in genuine private storage and authenticates retry, identity and disposal', async () => {
  expect(capabilityModule.createSealedRealmsProductionRecoveryPreparation).toBeTypeOf('function');
  const f = ownedFixture(), options = { privateState: f.privateState, authority: f.authority };
  const response = transportFixture(undefined, { preparationCommit: f.commit, preparationTree: f.tree });
  const cap = await capabilityModule.createSealedRealmsProductionRecoveryPreparation(options);
  const read = () => capabilityModule.readSealedRealmsProductionRecoveryPreparation({ capability: cap, ...options });
  expect(Object.keys(cap)).toEqual([]);
  expect(read()).toEqual({ recoveryAuthorizationRequestId: response.intent.requestId, recoveryAuthorizationEpoch: 3,
    recoveryAuthWorkerVersionId: response.observation.bridgeWorkerVersionId,
    recoveryAuthWorkerSourceCommit: response.observation.bridgeSourceCommit,
    recoveryAuthWorkerConfigIdentity: response.observation.bridgeConfigIdentity,
    recoveryAuthWorkerConfigEpoch: response.observation.bridgeConfigEpoch });
  expect(response.requests.map(x => x.url).filter(url => url.startsWith('https://release-auth.'))).toEqual([
    'https://release-auth.warpkeep.com/v1/recovery/prepare',
    'https://release-auth.warpkeep.com/v1/recovery/preparation-observation',
  ]);
  const observationFile = join(sealedRealmsPrivateBase(f.home), 'runtime', SEALED_REALMS_PRIVATE_STATE_VERSION,
    `recovery-preparation/${f.commit}/3/observations/${createHash('sha256').update(response.observationCompact).digest('hex')}.jws`);
  const retainedObservation = readFileSync(observationFile);
  writeFileSync(observationFile, `${response.compact}\n`);
  expect(read).toThrow();
  writeFileSync(observationFile, retainedObservation);
  const retry = await capabilityModule.createSealedRealmsProductionRecoveryPreparation(options);
  expect(capabilityModule.readSealedRealmsProductionRecoveryPreparation({ capability: retry, ...options })).toEqual(read());
  const clock = vi.spyOn(Date, 'now');
  clock.mockReturnValue(response.observation.expiresAt * 1000);
  expect(read).toThrow();
  clock.mockReturnValue((response.observation.issuedAt - 1) * 1000);
  expect(read).toThrow();
  clock.mockRestore();
  expect(() => capabilityModule.readSealedRealmsProductionRecoveryPreparation({ capability: { ...cap }, ...options })).toThrow();
  expect(() => capabilityModule.readSealedRealmsProductionRecoveryPreparation({ capability: cap, ...options, authority: { ...f.authority } })).toThrow();
  transportFixture(undefined, { preparationCommit: f.commit, preparationTree: f.tree, requestId: '123e4567-e89b-42d3-a456-426614174001' });
  await expect(capabilityModule.createSealedRealmsProductionRecoveryPreparation(options)).rejects.toThrow('SEALED_REALMS_RECOVERY_PREPARATION_INVALID');
  expect(read()).toEqual({ recoveryAuthorizationRequestId: response.intent.requestId, recoveryAuthorizationEpoch: 3,
    recoveryAuthWorkerVersionId: response.observation.bridgeWorkerVersionId,
    recoveryAuthWorkerSourceCommit: response.observation.bridgeSourceCommit,
    recoveryAuthWorkerConfigIdentity: response.observation.bridgeConfigIdentity,
    recoveryAuthWorkerConfigEpoch: response.observation.bridgeConfigEpoch });
  capabilityModule.disposeSealedRealmsProductionRecoveryPreparation(cap);
  expect(read).toThrow();
  writeFileSync(join(f.root, 'source'), 'changed');
  expect(() => capabilityModule.readSealedRealmsProductionRecoveryPreparation({ capability: retry, ...options })).toThrow();
  capabilityModule.disposeSealedRealmsProductionRecoveryPreparation(retry);
}, 60000);
it('refuses a genuinely signed receipt for another source tree before private persistence', async () => {
  const f = ownedFixture();
  const response = transportFixture(undefined, { preparationCommit: f.commit, preparationTree: 'e'.repeat(40) });
  await expect(capabilityModule.createSealedRealmsProductionRecoveryPreparation({ privateState: f.privateState, authority: f.authority })).rejects.toThrow('SEALED_REALMS_RECOVERY_PREPARATION_INVALID');
  expect(response.requests).toHaveLength(2);
  expect(f.privateState.list({ root: 'runtime' })).toEqual([]);
}, 60000);
it('refuses source drift after OIDC acquisition before the service can reserve', async () => {
  const f = ownedFixture();
  const response = transportFixture(url => { if (!url.startsWith('https://release-auth.')) writeFileSync(join(f.root, 'source'), 'changed'); return undefined; },
    { preparationCommit: f.commit, preparationTree: f.tree });
  await expect(capabilityModule.createSealedRealmsProductionRecoveryPreparation({ privateState: f.privateState, authority: f.authority })).rejects.toThrow();
  expect(response.requests).toHaveLength(1);
}, 60000);
it('refuses a foreign signed observation after retaining the genuine reservation', async () => {
  const f = ownedFixture();
  const response = transportFixture(undefined, { preparationCommit: f.commit, preparationTree: f.tree },
    { intent: { requestId: 'foreign' } });
  await expect(capabilityModule.createSealedRealmsProductionRecoveryPreparation({ privateState: f.privateState, authority: f.authority })).rejects.toThrow();
  expect(response.requests).toHaveLength(4);
  expect(f.privateState.list({ root: 'runtime', relativeDirectory: `recovery-preparation/${f.commit}` })).toEqual(['3.jws']);
}, 60000);
it('rechecks source after the observation OIDC await before sending the observation request', async () => {
  const f = ownedFixture();
  let oidcRequests = 0;
  const response = transportFixture(url => {
    if (!url.startsWith('https://release-auth.') && ++oidcRequests === 2) {
      writeFileSync(join(f.root, 'source'), 'changed during observation OIDC');
    }
    return undefined;
  }, { preparationCommit: f.commit, preparationTree: f.tree });
  await expect(capabilityModule.createSealedRealmsProductionRecoveryPreparation({ privateState: f.privateState, authority: f.authority })).rejects.toThrow();
  expect(response.requests).toHaveLength(3);
  expect(response.requests.some(request => request.url.endsWith('/preparation-observation'))).toBe(false);
}, 60000);
it.each(['GITHUB_SHA', 'GITHUB_EVENT_NAME', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN'])('refuses missing or mismatched %s before transport', async key => {
  const f = transportFixture(); vi.stubEnv(key, '');
  await expect(transport.requestSealedRealmsProductionRecoveryPreparation('c'.repeat(40))).rejects.toThrow('SEALED_REALMS_RECOVERY_PREPARATION_TRANSPORT_INVALID');
  expect(f.requests).toEqual([]);
});
it.each(['unknown', 'duplicate', 'oversize', 'status', 'encoding'])('refuses malformed %s service output with a fixed redacted error', async kind => {
  transportFixture(url => {
    if (!url.startsWith('https://release-auth.')) return;
    return new Response(kind === 'duplicate' ? '{"preparationReceiptJws":"a.b.c","preparationReceiptJws":"a.b.c"}'
      : kind === 'oversize' ? 'x'.repeat(32769) : '{"unknown":"secret-must-not-leak"}',
    { status: kind === 'status' ? 503 : 200, headers: { 'content-type': 'application/json', ...(kind === 'encoding' ? { 'content-encoding': 'gzip' } : {}) } });
  });
  await expect(transport.requestSealedRealmsProductionRecoveryPreparation('c'.repeat(40))).rejects.toThrow('SEALED_REALMS_RECOVERY_PREPARATION_TRANSPORT_INVALID');
});
