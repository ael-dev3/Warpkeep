vi.mock('../scripts/sealed-realms-production-recovery-approval-facts.ts', () => ({ readSealedRealmsProductionRecoveryApprovalFacts: seams.approvals }));
// @vitest-environment node
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
const seams = vi.hoisted(() => ({ git: vi.fn(), corpus: vi.fn(), approvals: vi.fn(), bridge: vi.fn(), records: new WeakSet<object>() }));
vi.mock('node:child_process', () => ({ execFileSync: seams.git }));
// Isolate corpus/source I/O, not candidate policy or source authority validation.
vi.mock('../scripts/sealed-realms-production-activation-records.mjs', () => ({
  assertSealedRealmsProductionActivationRecordsAuthority: ({ records }: { records: object }) => {
    if (!seams.records.has(records)) throw Error('Fixture corpus capability required');
  },
  readSealedRealmsProductionRecoveryCandidateRecords: seams.corpus,
}));
vi.mock('../scripts/sealed-realms-production-auth-bridge-state.mjs', () => ({ readSealedRealmsProductionRecoveryBridgeFacts: seams.bridge }));
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';
import { inspectSealedRealmsProductionRecoveryCandidate, readSealedRealmsProductionRecoveryCandidate } from '../scripts/sealed-realms-production-recovery-candidate.mjs';
import { RECOVERY_BINDING_KEYS_V2, RECOVERY_BINDING_KEYS_V3 } from '../scripts/recovery-binding-projection.mjs';
import { validateRecoveryActivationCandidate, validateRecoveryActivationCandidateV3 } from '../scripts/recovery-activation-candidate.mjs';
const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
beforeEach(() => { seams.git.mockReset(); seams.corpus.mockReset(); seams.bridge.mockReset(); });
function fixture(version: 2 | 3) {
  const old = recoveryBindingCandidate();
  const keys = version === 2 ? RECOVERY_BINDING_KEYS_V2 : RECOVERY_BINDING_KEYS_V3;
  const candidate = Object.fromEntries(keys.map(key => [key, key === 'schemaVersion' ? version : key === 'profile' && version === 3
    ? 'warpkeep-0.4.0-sealed-launch-ptr-update-v3' : key === 'ptrExistingUpdateReceiptDigest' ? '9'.repeat(64)
      : key === 'ptrExistingUpdateReceiptCommitment' ? null : old[key]]));
  const commit = String(old.preparationSourceCommit), tree = old.preparationSourceTree, blob = 'b'.repeat(40), body = Buffer.from('fixture bootstrap bytes');
  const bootstrap = { preparationSourceCommit: commit, preparationSourceTree: tree, bootstrapBlob: blob,
    bootstrapSha256: createHash('sha256').update(body).digest('hex') };
  const corpus = { bootstrap, projection: candidate };
  seams.approvals.mockReturnValue({g002PublicApprovalReceiptId:candidate.g002PublicApprovalReceiptId,ptrPublicApprovalReceiptId:candidate.ptrPublicApprovalReceiptId});
  seams.corpus.mockImplementation(() => structuredClone(corpus));
  seams.git.mockImplementation((_executable, argv) => {
    const args = argv.slice(6);
    if (args[0] === 'cat-file') return Buffer.from(body);
    if (args[0] === 'ls-tree') return Buffer.from(`100644 blob ${blob}\tscripts/greater-realm-production-bootstrap.mjs\0`);
    if (args[0] !== 'rev-parse') throw Error('Unexpected Git');
    return Buffer.from(args[1] === '--show-toplevel' ? `${realpathSync(process.cwd())}\n` : args[2] === `${commit}^{tree}` ? `${tree}\n` : `${commit}\n`);
  });
  const authority = authenticateSealedRealmsProductionSourceAuthority({ operation: 'activation-evidence-generate', workflowInputSha: commit,
    readGit: () => `${commit}\n`, readBinding: () => ({schemaVersion:1,profile:'warpkeep-0.4.0-sealed-launch-v1',pagesDeploymentApproved:false,preparationSourceCommit:null}),
    verifyEvidence: verifiedSha => ({verifiedSha}) });
  const records = Object.freeze({}); seams.records.add(records);
  return { input: {records: records as never, privateState: {} as never, authority}, corpus, candidate };
}
it.each([2, 3] as const)('derives ordered V%i bytes through the actual reader and semantic validator', version => {
  const f=fixture(version); const source=readSealedRealmsProductionRecoveryCandidate(f.input);
  expect(source).toBe(encode(f.candidate));
  expect((version === 2 ? validateRecoveryActivationCandidate : validateRecoveryActivationCandidateV3)(source)).toEqual(f.candidate);
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
