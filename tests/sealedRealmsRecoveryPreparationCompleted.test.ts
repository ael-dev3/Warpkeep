// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import { signedPreparationFixture, signedPreparationObservationFixture } from './fixtures/recoveryPreparationSigned';
import { createSealedRealmsProductionPrivateState, SEALED_REALMS_PRIVATE_STATE_VERSION } from '../scripts/sealed-realms-production-private-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';
import { readSealedRealmsProductionCompletedRecoveryPreparation, readSealedRealmsProductionRecoveryPreparation } from '../scripts/sealed-realms-production-recovery-preparation.mjs';

const seams = vi.hoisted(() => ({ context: vi.fn(), closure: vi.fn(), git: vi.fn() }));
// Completed-family ownership/reconciliation is exercised in the activation-records
// suites. This boundary suite keeps real signed codecs and private storage.
vi.mock('../scripts/sealed-realms-production-activation-records.mjs', () => ({
  readSealedRealmsProductionCompletedGenerationContext: seams.context,
}));
vi.mock('../scripts/recovery-source-closure.mjs', () => ({ assertRecoverySourceClosureSnapshot: seams.closure }));
vi.mock('node:child_process', () => ({ execFileSync: seams.git }));
vi.mock('../scripts/recovery-public-key.mjs', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}));
const roots: string[] = [], commit = 'c'.repeat(40), tree = 'd'.repeat(40);
const invalid = 'SEALED_REALMS_RECOVERY_PREPARATION_INVALID';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(1800000000000));
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('No completed read may request provider evidence'); }));
  seams.context.mockReset(); seams.closure.mockReset(); seams.git.mockReset();
  seams.git.mockReturnValue(`${tree}\n`);
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function fixture(generatedAt = 1700000050) {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-completed-preparation-')); roots.push(home);
  for (const suffix of ['audit/private', 'runtime', 'cache']) mkdirSync(join(sealedRealmsPrivateBase(home), suffix), { recursive: true, mode: 0o700 });
  const privateState = createSealedRealmsProductionPrivateState({ reportedHome: home, testOnlyOwnerUid: statSync(home).uid,
    testOnlyAllowPlatformMode: true, testOnlyFsync: () => {} });
  const authority = authenticateSealedRealmsProductionSourceAuthority({ operation: 'activation-evidence-generate', workflowInputSha: commit,
    readGit: () => `${commit}\n`, readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: verifiedSha => ({ verifiedSha }) });
  const intent = signedPreparationFixture(), observation = signedPreparationObservationFixture(intent.intent);
  const records = Object.freeze({}) as never, readContext = Object.freeze({}) as never;
  const input = { privateState, authority, records, readContext };
  const facts = {
    recoveryAuthorizationRequestId: intent.intent.requestId, recoveryAuthorizationEpoch: intent.intent.authorizationEpoch,
    recoveryAuthWorkerVersionId: observation.observation.bridgeWorkerVersionId,
    recoveryAuthWorkerSourceCommit: observation.observation.bridgeSourceCommit,
    recoveryAuthWorkerConfigIdentity: observation.observation.bridgeConfigIdentity,
    recoveryAuthWorkerConfigEpoch: observation.observation.bridgeConfigEpoch,
  };
  const context = { generatedAt: new Date(generatedAt * 1000).toISOString(),
    bindingCandidate: { preparationSourceCommit: commit, preparationSourceTree: tree, ...facts } as Record<string, unknown> };
  const readContextFixture = (value: typeof input) => {
    if (Object.keys(value).length !== 4 || Object.entries(input).some(([key, item]) => value[key as keyof typeof input] !== item)) throw Error('Fixture completed context owner mismatch');
    return Object.freeze(structuredClone(context));
  };
  seams.context.mockImplementation(readContextFixture);
  const intentPath = `recovery-preparation/${commit}/3.jws`, directory = `recovery-preparation/${commit}/3/observations`;
  const put = (path: string, compact: string) => privateState.write({ root: 'runtime', relativePath: path, bytes: Buffer.from(`${compact}\n`) });
  const file = (path: string) => join(sealedRealmsPrivateBase(home), 'runtime', SEALED_REALMS_PRIVATE_STATE_VERSION, path);
  const addObservation = (signed: ReturnType<typeof signedPreparationObservationFixture>) => {
    const path = `${directory}/${createHash('sha256').update(signed.compact).digest('hex')}.jws`;
    put(path, signed.compact); return path;
  };
  put(intentPath, intent.compact);
  const observationPath = addObservation(observation);
  return { input, intent, observation, facts, context, directory, intentPath, observationPath, file, put, addObservation, readContextFixture,
    read: () => readSealedRealmsProductionCompletedRecoveryPreparation(input) };
}
it('reopens authentic retained signatures at the completed time after wall-clock expiry without provider calls or fresh authority', () => {
  const f = fixture();
  const before = readFileSync(f.file(f.intentPath)), observationBefore = readFileSync(f.file(f.observationPath));
  const facts = f.read();
  expect(facts).toEqual(f.facts); expect(Object.isFrozen(facts)).toBe(true);
  expect(seams.context).toHaveBeenCalledTimes(3); expect(fetch).not.toHaveBeenCalled();
  expect(readFileSync(f.file(f.intentPath))).toEqual(before);
  expect(readFileSync(f.file(f.observationPath))).toEqual(observationBefore);
  expect(() => readSealedRealmsProductionRecoveryPreparation({ privateState: f.input.privateState,
    authority: f.input.authority, capability: facts as never })).toThrow(invalid);
});
it.each([1700000011, 1700000101])('rejects support not valid at the original generation time %s', generatedAt => {
  expect(fixture(generatedAt).read).toThrow(invalid);
});
it('allows equivalent retained signatures and ignores authenticated observations outside the completed time', () => {
  const f = fixture(1700000095);
  f.addObservation(signedPreparationObservationFixture(f.intent.intent, { observedFrom: 1700000012, observedThrough: 1700000013,
    issuedAt: 1700000014, expiresAt: 1700000103 }));
  f.addObservation(signedPreparationObservationFixture(f.intent.intent, { observedFrom: 1700000001, observedThrough: 1700000001,
    issuedAt: 1700000001, expiresAt: 1700000091, bridgeConfigEpoch: 9 }));
  f.addObservation(signedPreparationObservationFixture(f.intent.intent, { observedFrom: 1700000200, observedThrough: 1700000200,
    issuedAt: 1700000200, expiresAt: 1700000290, bridgeConfigEpoch: 9 }));
  expect(f.read()).toEqual(f.facts);
});
it.each(['recoveryAuthWorkerVersionId', 'recoveryAuthWorkerSourceCommit', 'recoveryAuthWorkerConfigIdentity', 'recoveryAuthWorkerConfigEpoch',
  'recoveryAuthorizationRequestId', 'recoveryAuthorizationEpoch', 'preparationSourceCommit', 'preparationSourceTree'])('rejects a completed candidate conflicting at %s', key => {
  const f = fixture(); f.context.bindingCandidate[key] = key.endsWith('Epoch') ? 99 : 'foreign';
  expect(f.read).toThrow(invalid);
});
it('rejects ambiguous signed configuration even when one observation matches exactly', () => {
  const f = fixture();
  f.addObservation(signedPreparationObservationFixture(f.intent.intent, { bridgeConfigEpoch: 6 }));
  expect(f.read).toThrow(invalid);
});
it('rejects a foreign signed intent in the fixed reservation path', () => {
  const f = fixture(), foreign = signedPreparationFixture({ preparationTree: 'e'.repeat(40) });
  writeFileSync(f.file(f.intentPath), `${foreign.compact}\n`);
  expect(f.read).toThrow(invalid);
});
it('rejects malformed signatures and hash-name substitution instead of treating them as expired support', () => {
  const f = fixture();
  const parts = f.observation.compact.split('.'), signature = Buffer.from(parts[2]!, 'base64url');
  signature[0] = signature[0]! ^ 1;
  const compact = `${parts[0]}.${parts[1]}.${signature.toString('base64url')}`;
  f.put(`${f.directory}/${createHash('sha256').update(compact).digest('hex')}.jws`, compact);
  expect(f.read).toThrow(invalid);
  unlinkSync(f.file(`${f.directory}/${createHash('sha256').update(compact).digest('hex')}.jws`));
  f.put(`${f.directory}/${'1'.repeat(64)}.jws`, f.observation.compact);
  expect(f.read).toThrow(invalid);
});
it('rejects missing support and unexpected observation members', () => {
  const f = fixture(); unlinkSync(f.file(f.observationPath)); expect(f.read).toThrow(invalid);
  f.put(`${f.directory}/unexpected.jws`, f.observation.compact); expect(f.read).toThrow(invalid);
});
it.each(['now', 'candidate', 'transport'])('does not accept caller-supplied %s', key => {
  const f = fixture();
  expect(() => readSealedRealmsProductionCompletedRecoveryPreparation({ ...f.input, [key]: f.context.generatedAt } as never)).toThrow(invalid);
});
it.each(['records', 'readContext', 'authority', 'privateState'])('refuses a copied or foreign %s', key => {
  const f = fixture();
  expect(() => readSealedRealmsProductionCompletedRecoveryPreparation({ ...f.input, [key]: {} } as never)).toThrow(invalid);
});
it.each([2, 3])('rejects a completed context revoked during reopening %s', call => {
  const f = fixture(); let reads = 0;
  seams.context.mockImplementation(value => { if (++reads === call) throw Error('Completed reconciliation ended'); return f.readContextFixture(value); });
  expect(f.read).toThrow(invalid);
});
it.each(['generatedAt', 'bindingCandidate'])('rejects changed authenticated %s between reads', key => {
  const f = fixture(); let reads = 0;
  seams.context.mockImplementation(value => {
    if (++reads === 2) {
      if (key === 'generatedAt') f.context.generatedAt = new Date(1700000051000).toISOString();
      else f.context.bindingCandidate.recoveryAuthWorkerConfigEpoch = 6;
    }
    return f.readContextFixture(value);
  });
  expect(f.read).toThrow(invalid);
});
it.each([2, 3].flatMap(call => ['intent', 'observation', 'addition', 'removal'].map(change => ({ call, change }))))('detects retained $change changing during completed-context read $call', ({ call, change }) => {
  const f = fixture(); let reads = 0;
  seams.context.mockImplementation(value => {
    if (++reads === call) {
      if (change === 'intent') writeFileSync(f.file(f.intentPath), `${signedPreparationFixture({ requestId: '123e4567-e89b-42d3-a456-426614174001' }).compact}\n`);
      else if (change === 'observation') writeFileSync(f.file(f.observationPath), `${signedPreparationObservationFixture(f.intent.intent, { bridgeConfigEpoch: 6 }).compact}\n`);
      else if (change === 'addition') f.addObservation(signedPreparationObservationFixture(f.intent.intent, { bridgeConfigEpoch: 6 }));
      else unlinkSync(f.file(f.observationPath));
    }
    return f.readContextFixture(value);
  });
  expect(f.read).toThrow(invalid);
});
it('rechecks the actual source snapshot before releasing completed facts', () => {
  const f = fixture(); seams.closure.mockImplementationOnce(() => undefined).mockImplementation(() => { throw Error('Source changed'); });
  expect(f.read).toThrow(invalid);
});
