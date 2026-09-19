vi.mock('../scripts/sealed-realms-production-recovery-source-closure.mjs', () => ({ readSealedRealmsProductionRecoverySourceClosure: seams.closure }));
vi.mock('../scripts/sealed-realms-production-recovery-approval-facts.ts', () => ({ readSealedRealmsProductionRecoveryApprovalFacts: seams.approvals }));
// @vitest-environment node
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { recoveryG002PtrAdoptionCandidate } from './fixtures/recoveryG002PtrAdoptionCandidate';
const seams = vi.hoisted(() => ({ closure: vi.fn(), git: vi.fn(), corpus: vi.fn(), approvals: vi.fn(), bridge: vi.fn(),
  preparation: vi.fn(), completedBridge: vi.fn(), completedPreparation: vi.fn(), records: new WeakSet<object>() }));
vi.mock('node:child_process', () => ({ execFileSync: seams.git }));
// Isolate corpus/source I/O, not candidate policy or source authority validation.
vi.mock('../scripts/sealed-realms-production-activation-records.mjs', () => ({
  assertSealedRealmsProductionActivationRecordsAuthority: ({ records }: { records: object }) => {
    if (!seams.records.has(records)) throw Error('Fixture corpus capability required');
  },
  readSealedRealmsProductionRecoveryCandidateRecords: seams.corpus,
}));
vi.mock('../scripts/sealed-realms-production-auth-bridge-state.mjs', () => ({ readSealedRealmsProductionRecoveryBridgeFacts: seams.bridge,
  readSealedRealmsProductionCompletedRecoveryBridgeFacts: seams.completedBridge }));
// These facts are I/O seams only; signed/private-store acceptance belongs to the
// preparation and completed-generation suites. Candidate assembly stays real.
vi.mock('../scripts/sealed-realms-production-recovery-preparation.mjs', () => ({ readSealedRealmsProductionRecoveryPreparation: seams.preparation,
  readSealedRealmsProductionCompletedRecoveryPreparation: seams.completedPreparation }));
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';
import { inspectSealedRealmsProductionRecoveryCandidate, readSealedRealmsProductionRecoveryCandidate } from '../scripts/sealed-realms-production-recovery-candidate.mjs';
import { RECOVERY_BINDING_KEYS_V2, RECOVERY_BINDING_KEYS_V3, RECOVERY_BINDING_KEYS_V4, RECOVERY_BINDING_KEYS_V5, RECOVERY_BINDING_KEYS_V6 } from '../scripts/recovery-binding-projection.mjs';
import { validateRecoveryActivationCandidate, validateRecoveryActivationCandidateV3, validateRecoveryActivationCandidateV4, validateRecoveryActivationCandidateV5, validateRecoveryActivationCandidateV6 } from '../scripts/recovery-activation-candidate.mjs';
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
beforeEach(() => { seams.closure.mockReset(); seams.git.mockReset(); seams.corpus.mockReset(); seams.bridge.mockReset();
  seams.preparation.mockReset(); seams.completedBridge.mockReset(); seams.completedPreparation.mockReset(); });
function fixture(version: 2 | 3 | 4 | 5 | 6, completed = false) {
  const old = recoveryBindingCandidate();
  const keys = version === 6 ? RECOVERY_BINDING_KEYS_V6 : version === 5 ? RECOVERY_BINDING_KEYS_V5 : version === 4 ? RECOVERY_BINDING_KEYS_V4 : version === 3 ? RECOVERY_BINDING_KEYS_V3 : RECOVERY_BINDING_KEYS_V2;
  // Public scalar fixtures isolate candidate composition; they grant no adoption authority.
  const values: Record<string, unknown> = { ...old, schemaVersion: version,
    profile: version === 4 ? 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4'
      : version === 3 ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' : old.profile,
    ptrExistingUpdateReceiptDigest: '9'.repeat(64), ptrExistingUpdateReceiptCommitment: null,
    ptrExistingStateAdoptionReceiptDigest: '8'.repeat(64), ptrExistingStateAdoptionReceiptCommitment: null,
    ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1,
    ptrGeneralAdmissionCount: 0, ptrExpectedSealedStateHmacSha256: '7'.repeat(64),
    ptrExpectedOwnerInvariantHmacSha256: '6'.repeat(64) };
  const linuxValues: Record<string, unknown> = { ...recoveryG002PtrAdoptionCandidate(), schemaVersion: 6,
    profile: 'warpkeep-0.4.0-sealed-launch-g001-linux-freeze-v6',
    g001AdmissionControlProfile: 'warpkeep-genesis-001-server-freeze-v1',
    g001FreezeConfirmationReceiptDigest: '1'.repeat(64), g001FreezeConfirmationReceiptCommitment: null,
    g001FreezeCurrentStateReceiptDigest: '2'.repeat(64), g001FreezeCurrentStateReceiptCommitment: null };
  const candidate = version === 5 ? recoveryG002PtrAdoptionCandidate()
    : Object.fromEntries(keys.map(key => [key, (version === 6 ? linuxValues : values)[key]]));
  const commit = String(old.preparationSourceCommit), tree = old.preparationSourceTree, blob = 'b'.repeat(40), body = Buffer.from('fixture bootstrap bytes');
  const bootstrap = version === 6 ? { profile: 'warpkeep-g001-linux-policy-observation-v1',
    preparationSourceCommit: commit, preparationSourceTree: tree, operatorBlob: blob,
    operatorSha256: createHash('sha256').update(body).digest('hex') }
    : { preparationSourceCommit: commit, preparationSourceTree: tree, bootstrapBlob: blob,
      bootstrapSha256: createHash('sha256').update(body).digest('hex') };
  const corpus = { bootstrap, projection: candidate };
  seams.approvals.mockReturnValue({g002PublicApprovalReceiptId:candidate.g002PublicApprovalReceiptId,ptrPublicApprovalReceiptId:candidate.ptrPublicApprovalReceiptId});
  seams.corpus.mockImplementation(() => structuredClone(corpus));
  seams.git.mockImplementation((_executable, argv) => {
    const args = argv.slice(6);
    if (args[0] === 'cat-file') return Buffer.from(body);
    if (args[0] === 'ls-tree') return Buffer.from(`100644 blob ${blob}\t${version === 6 ? 'scripts/genesis001-linux-census-operator.ts' : 'scripts/greater-realm-production-bootstrap.mjs'}\0`);
    if (args[0] !== 'rev-parse') throw Error('Unexpected Git');
    return Buffer.from(args[1] === '--show-toplevel' ? `${realpathSync(process.cwd())}\n` : args[2] === `${commit}^{tree}` ? `${tree}\n` : `${commit}\n`);
  });
  const authority = authenticateSealedRealmsProductionSourceAuthority({ operation: 'activation-evidence-generate', workflowInputSha: commit,
    readGit: () => `${commit}\n`, readBinding: () => ({schemaVersion:1,profile:'warpkeep-0.4.0-sealed-launch-v1',pagesDeploymentApproved:false,preparationSourceCommit:null}),
    verifyEvidence: verifiedSha => ({verifiedSha}) });
  const records = Object.freeze({}); seams.records.add(records);
  const completedGeneration = Object.freeze({}) as never, readContext = Object.freeze({}) as never;
  const completedBridgeFacts = Object.fromEntries(['recoveryAuthWorkerVersionId', 'recoveryAuthWorkerSourceCommit',
    'authBridgeSourceCommit', 'admissionRequestSuspensionReceiptDigest'].map(key => [key, candidate[key]]));
  const completedPreparationFacts = Object.fromEntries(['recoveryAuthorizationRequestId', 'recoveryAuthorizationEpoch',
    'recoveryAuthWorkerVersionId', 'recoveryAuthWorkerSourceCommit', 'recoveryAuthWorkerConfigIdentity',
    'recoveryAuthWorkerConfigEpoch'].map(key => [key, candidate[key]]));
  if (completed) {
    corpus.projection = { ...candidate };
    for (const key of [...Object.keys(completedBridgeFacts), ...Object.keys(completedPreparationFacts)]) delete corpus.projection[key];
    seams.completedBridge.mockReturnValue(completedBridgeFacts);
    seams.completedPreparation.mockReturnValue(completedPreparationFacts);
  }
  return { input: {records: records as never, privateState: {} as never, authority,
    ...(completed ? { completedGeneration, readContext } : {})}, corpus, candidate,
    completedGeneration, readContext, completedBridgeFacts, completedPreparationFacts };
}
it.each([2, 3, 4, 5] as const)('derives ordered V%i bytes through the actual reader and semantic validator', version => {
  const f=fixture(version); const source=readSealedRealmsProductionRecoveryCandidate(f.input);
  expect(source).toBe(encode(f.candidate));
  expect((version === 5 ? validateRecoveryActivationCandidateV5 : version === 4 ? validateRecoveryActivationCandidateV4 : version === 3
    ? validateRecoveryActivationCandidateV3 : validateRecoveryActivationCandidate)(source)).toEqual(f.candidate);
});
it('requires both V5 adoptions, rejects old G002 facts, and reopens the corpus', () => {
  const f = fixture(5);
  delete f.corpus.projection.g002ExpectedSealedStateHmacSha256;
  expect(inspectSealedRealmsProductionRecoveryCandidate(f.input).missingFields).toEqual(['g002ExpectedSealedStateHmacSha256']);
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  f.corpus.projection.g002ExpectedSealedStateHmacSha256 = '3'.repeat(64);
  for (const key of ['g002AtlasImportReceiptDigest', 'g002PlayersV2', 'admissionNotificationsEnabled']) {
    f.corpus.projection[key] = recoveryBindingCandidate()[key]!;
    expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
    delete f.corpus.projection[key];
  }
  delete f.corpus.projection.ptrExistingStateAdoptionReceiptDigest;
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  f.corpus.projection.ptrExistingStateAdoptionReceiptDigest = '8'.repeat(64);
  seams.corpus.mockImplementationOnce(() => structuredClone(f.corpus));
  seams.corpus.mockImplementation(() => ({ ...f.corpus, projection: { ...f.candidate,
    g002ExistingStateAdoptionReceiptDigest: '7'.repeat(64) } }));
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
});
it('requires complete V4 evidence and rejects obsolete initialization fields', () => {
  const f = fixture(4);
  delete f.corpus.projection.ptrExpectedOwnerInvariantHmacSha256;
  expect(inspectSealedRealmsProductionRecoveryCandidate(f.input).missingFields).toEqual(['ptrExpectedOwnerInvariantHmacSha256']);
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  f.corpus.projection.ptrExpectedOwnerInvariantHmacSha256 = '6'.repeat(64);
  f.corpus.projection.ptrAtlasImportReceiptDigest = '5'.repeat(64);
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  delete f.corpus.projection.ptrAtlasImportReceiptDigest;
  delete f.corpus.projection.ptrExistingUpdateReceiptDigest;
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
});
it('rechecks the adoption corpus and retains V4 semantic safety checks', () => {
  const f = fixture(4);
  f.corpus.projection.ptrAdmissionsOpen = true;
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  f.corpus.projection.ptrAdmissionsOpen = false;
  seams.corpus.mockImplementationOnce(() => structuredClone(f.corpus));
  seams.corpus.mockImplementation(() => ({ ...f.corpus, projection: { ...f.candidate,
    ptrExistingStateAdoptionReceiptDigest: '7'.repeat(64) } }));
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
});
it('reports only V3 missing fields and never asks for obsolete fresh-publication fields', () => {
  const f=fixture(3); delete f.corpus.projection.ptrExistingUpdateReceiptDigest;
  f.corpus.projection.ptrExistingUpdateReceiptDigest = null;
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  f.corpus.projection.ptrExistingUpdateReceiptDigest='9'.repeat(64);
  delete f.corpus.projection.ptrDatabaseIdentity;
  const inspection=inspectSealedRealmsProductionRecoveryCandidate(f.input);
  expect(inspection.facts.schemaVersion).toBe(3); expect(inspection.missingFields).toContain('ptrDatabaseIdentity');
  expect(inspection.missingFields).not.toContain('ptrPublishReceiptDigest');
});
it('rejects mixed receipt families and unknown corpus facts', () => {
  const f=fixture(3); f.corpus.projection.ptrPublishReceiptDigest='8'.repeat(64);
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  delete f.corpus.projection.ptrPublishReceiptDigest; f.corpus.projection.unrecognizedFact='x';
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
});
it('preserves real V3 semantic validation rather than accepting well-shaped unsafe facts', () => {
  const f=fixture(3); f.corpus.projection.ptrAdmissionsOpen=true;
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
});
it('rejects changed corpus between source reads and forged source authority', () => {
  const f=fixture(3); seams.corpus.mockImplementationOnce(() => structuredClone(f.corpus));
  seams.corpus.mockImplementation(() => ({...f.corpus, projection:{...f.candidate,ptrExistingUpdateReceiptDigest:'7'.repeat(64)}}));
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
  expect(() => inspectSealedRealmsProductionRecoveryCandidate({...f.input,authority:{...f.input.authority} as never})).toThrow();
});

it('merges authenticated bridge facts without silently overwriting conflicting corpus or source facts', () => {
  const f=fixture(3), bridgeState = Object.freeze({});
  seams.bridge.mockReturnValue({ authBridgeSourceCommit: f.candidate.authBridgeSourceCommit });
  const options={...f.input, bridgeState: bridgeState as never};
  expect(inspectSealedRealmsProductionRecoveryCandidate(options).missingFields).toEqual([]);
  expect(seams.bridge).toHaveBeenCalledTimes(2);
  expect(seams.bridge).toHaveBeenCalledWith({bridgeState,privateState:f.input.privateState,authority:f.input.authority});
  seams.bridge.mockReturnValue({ authBridgeSourceCommit: 'f'.repeat(40) });
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(options)).toThrow();
  delete f.corpus.projection.authBridgeSourceCommit;
  seams.bridge.mockReturnValue({ preparationSourceCommit: 'f'.repeat(40) });
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(options)).toThrow();
});
it('rejects bridge changes across candidate derivation and supplied undefined or forged context', () => {
  const f=fixture(3), options={...f.input,bridgeState:{} as never};
  delete f.corpus.projection.authBridgeSourceCommit;
  seams.bridge.mockReturnValueOnce({authBridgeSourceCommit:'a'.repeat(40)}).mockReturnValue({authBridgeSourceCommit:'b'.repeat(40)});
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(options)).toThrow();
  seams.bridge.mockImplementation(() => { throw Error('Bridge authority invalid'); });
  expect(() => inspectSealedRealmsProductionRecoveryCandidate({...f.input,bridgeState:undefined})).toThrow();
});
it('rejects corpus source duplicates that conflict with authenticated source', () => {
  const f=fixture(3); f.corpus.projection.preparationSourceCommit='f'.repeat(40);
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
});

it('rejects approval facts inconsistent with the selected corpus projection',()=>{
 const f=fixture(3);seams.approvals.mockReturnValue({g002PublicApprovalReceiptId:'different',ptrPublicApprovalReceiptId:f.candidate.ptrPublicApprovalReceiptId});expect(()=>inspectSealedRealmsProductionRecoveryCandidate(f.input)).toThrow();
});

it('merges source closure capability facts and rereads without permitting corpus conflicts', () => {
  const f = fixture(3);
  const sourceClosure = Object.freeze({}) as never;
  const digest = f.candidate.sourceClosureSha256;
  const options = { ...f.input, sourceClosure };
  delete f.corpus.projection.sourceClosureSha256;
  expect(inspectSealedRealmsProductionRecoveryCandidate(f.input).missingFields).toEqual(['sourceClosureSha256']);
  seams.closure.mockReturnValue({ sourceClosureSha256: digest });
  expect(inspectSealedRealmsProductionRecoveryCandidate(options).missingFields).toEqual([]);
  expect(seams.closure).toHaveBeenCalledTimes(2);
  expect(seams.closure).toHaveBeenCalledWith({ capability: sourceClosure, privateState: f.input.privateState, authority: f.input.authority });
  f.corpus.projection.sourceClosureSha256 = 'f'.repeat(64);
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(options)).toThrow();
  delete f.corpus.projection.sourceClosureSha256;
  seams.closure.mockReturnValueOnce({ sourceClosureSha256: digest }).mockReturnValue({ sourceClosureSha256: 'e'.repeat(64) });
  expect(() => inspectSealedRealmsProductionRecoveryCandidate(options)).toThrow();
});

it('derives V6 through the actual reader using the census operator and rejects a policy-only producer', () => {
  const f = fixture(6);
  const git = seams.git.getMockImplementation()!;
  const source = readSealedRealmsProductionRecoveryCandidate(f.input);
  expect(source).toBe(encode(f.candidate));
  expect(validateRecoveryActivationCandidateV6(source)).toEqual(f.candidate);
  seams.git.mockImplementation((executable, argv) => argv.includes('ls-tree')
    ? Buffer.from(`100644 blob ${f.corpus.bootstrap.operatorBlob}\tscripts/genesis001-linux-policy-operator.ts\0`) : git(executable, argv));
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow('SOURCE_INVALID');
});

it('assembles exact completed V6 bytes from retained bridge and preparation facts using the same callback context', () => {
  const f = fixture(6, true);
  const source = readSealedRealmsProductionRecoveryCandidate(f.input);
  expect(source).toBe(encode(f.candidate));
  expect(validateRecoveryActivationCandidateV6(source)).toEqual(f.candidate);
  const common = { records: f.input.records, privateState: f.input.privateState, authority: f.input.authority, readContext: f.readContext };
  expect(seams.completedBridge).toHaveBeenCalledTimes(2);
  expect(seams.completedBridge).toHaveBeenNthCalledWith(1, { capability: f.completedGeneration, ...common });
  expect(seams.completedBridge).toHaveBeenNthCalledWith(2, { capability: f.completedGeneration, ...common });
  expect(seams.completedPreparation).toHaveBeenCalledTimes(2);
  expect(seams.completedPreparation).toHaveBeenNthCalledWith(1, common);
  expect(seams.completedPreparation).toHaveBeenNthCalledWith(2, common);
  for (const [input] of [...seams.completedBridge.mock.calls, ...seams.completedPreparation.mock.calls]) {
    expect(input.records).toBe(f.input.records); expect(input.privateState).toBe(f.input.privateState);
    expect(input.authority).toBe(f.input.authority); expect(input.readContext).toBe(f.readContext);
  }
  for (const [input] of seams.completedBridge.mock.calls) expect(input.capability).toBe(f.completedGeneration);
  expect(seams.corpus).toHaveBeenNthCalledWith(1, f.input.records, f.readContext);
  expect(seams.corpus).toHaveBeenNthCalledWith(2, f.input.records, f.readContext);
  for (const [records, context] of seams.corpus.mock.calls) {
    expect(records).toBe(f.input.records); expect(context).toBe(f.readContext);
  }
  expect(seams.bridge).not.toHaveBeenCalled(); expect(seams.preparation).not.toHaveBeenCalled();
});
it.each(['bridge', 'preparation'] as const)('rejects retained %s facts that conflict with the other retained reader', reader => {
  const f = fixture(6, true);
  const mock = reader === 'bridge' ? seams.completedBridge : seams.completedPreparation;
  const facts = reader === 'bridge' ? f.completedBridgeFacts : f.completedPreparationFacts;
  mock.mockReturnValue({ ...facts, recoveryAuthWorkerSourceCommit: 'f'.repeat(40) });
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow('SEALED_REALMS_RECOVERY_CANDIDATE_INVALID');
});
it.each(['bridge', 'preparation'] as const)('rejects retained %s facts that change during the candidate reread', reader => {
  const f = fixture(6, true);
  const mock = reader === 'bridge' ? seams.completedBridge : seams.completedPreparation;
  const facts = reader === 'bridge' ? f.completedBridgeFacts : f.completedPreparationFacts;
  mock.mockReturnValueOnce(facts).mockReturnValue({ ...facts, recoveryAuthWorkerSourceCommit: 'f'.repeat(40) });
  expect(() => readSealedRealmsProductionRecoveryCandidate(f.input)).toThrow('SEALED_REALMS_RECOVERY_CANDIDATE_INVALID');
  expect(mock).toHaveBeenCalledTimes(2);
});
it.each(['bridgeState', 'preparation'] as const)('rejects mixing completed generation with fresh %s before reading facts', key => {
  const f = fixture(6, true);
  expect(() => readSealedRealmsProductionRecoveryCandidate({ ...f.input, [key]: {} } as never)).toThrow('SEALED_REALMS_RECOVERY_CANDIDATE_INVALID');
  expect(seams.corpus).not.toHaveBeenCalled(); expect(seams.completedBridge).not.toHaveBeenCalled();
  expect(seams.completedPreparation).not.toHaveBeenCalled(); expect(seams.bridge).not.toHaveBeenCalled();
  expect(seams.preparation).not.toHaveBeenCalled();
});
it('rejects completed generation without its callback context before selecting any retained route', () => {
  const f = fixture(6, true), { readContext: _readContext, ...input } = f.input;
  expect(() => readSealedRealmsProductionRecoveryCandidate(input)).toThrow('SEALED_REALMS_RECOVERY_CANDIDATE_INVALID');
  expect(seams.completedBridge).not.toHaveBeenCalled(); expect(seams.completedPreparation).not.toHaveBeenCalled();
});
