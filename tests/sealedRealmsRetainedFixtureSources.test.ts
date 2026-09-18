// @vitest-environment node
// Composition fixtures replace native/private I/O. The retained source brand is
// real; signed private-record readers and actual GitHub transport have separate tests.
import { beforeEach, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({ runtime: Object.freeze({}), privateState: Object.freeze({}), store: Object.freeze({}),
  scope: Object.freeze({}), current: true, scenario: '', phase: '', token: undefined as Buffer | undefined,
  attest: vi.fn(), create: vi.fn(), refresh: vi.fn(), revoke: vi.fn(), git: vi.fn(),
  authenticate: vi.fn(), read: vi.fn(), discover: vi.fn() }));
const MAIN = 'a'.repeat(40), SOURCE = 'b'.repeat(40), ROOT = 'c'.repeat(40), MODULE = 'd'.repeat(40);
vi.mock('../scripts/sealed-realms-production-linux-preflight.mjs', () => ({
  createSealedRealmsProductionRetainedFixtureRuntime: (input: unknown) => { expect(input).toEqual({ operatingCommit: MAIN }); return boundary.runtime; },
  attestSealedRealmsProductionRetainedFixtureRuntime: boundary.attest,
}));
vi.mock('../scripts/sealed-realms-production-workflow-private-state.mjs', () => ({ resolveSealedRealmsProductionWorkflowPrivateState: () => boundary.privateState }));
vi.mock('../scripts/sealed-realms-production-continuation.mjs', () => ({ createSealedRealmsProductionContinuationStore: (input: unknown) => {
  expect(input).toEqual({ privateState: boundary.privateState }); return boundary.store;
} }));
vi.mock('../scripts/sealed-realms-production-workflow-evidence.mjs', () => ({
  createSealedRealmsProductionRetainedEvidence: boundary.create,
  refreshSealedRealmsProductionRetainedEvidence: boundary.refresh,
  verifySealedRealmsProductionRetainedEvidence: (scope: unknown, commit: string) => {
    expect(scope).toBe(boundary.scope); return { verifiedSha: commit };
  }, revokeSealedRealmsProductionRetainedEvidence: boundary.revoke,
}));
vi.mock('../scripts/ptr-production-existing-update-adapter.mjs', () => ({
  readG002RetainedUpdateSourceCommit: (input: unknown) => boundary.discover('g002', input),
  readPtrRetainedUpdateSourceCommit: (input: unknown) => boundary.discover('ptr', input),
}));
vi.mock('../scripts/sealed-realms-production-activation-records.mjs', () => ({
  authenticateSealedRealmsProductionG002HistoricalAdoption: (input: unknown) => boundary.authenticate('g002', input),
  authenticateSealedRealmsProductionPtrHistoricalAdoption: (input: unknown) => boundary.authenticate('ptr', input),
  readSealedRealmsProductionG002ExistingStateAdoptionEvidence: (input: unknown) => boundary.read('g002', input),
  readSealedRealmsProductionPtrExistingStateAdoptionEvidence: (input: unknown) => boundary.read('ptr', input),
}));
vi.mock('node:child_process', () => ({ execFileSync: boundary.git }));
import { readSealedRealmsProductionRetainedFixtureSources as readSources } from '../scripts/sealed-realms-production-retained-fixture-source.mjs';
import { readSealedRealmsProductionRetainedSource, sourceCommitFromSealedRealmsProductionAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';

beforeEach(() => {
  vi.clearAllMocks(); boundary.current = true; boundary.scenario = ''; boundary.phase = ''; boundary.token = undefined;
  boundary.attest.mockImplementation((runtime: unknown) => {
    expect(runtime).toBe(boundary.runtime); if (!boundary.current) throw Error('private host changed');
    return { operatingCommit: MAIN, operatingTree: 'e'.repeat(40) };
  });
  boundary.git.mockImplementation((executable: string, args: string[], options: any) => {
    expect(executable).toBe('/usr/bin/git'); expect(options.env.GIT_NO_REPLACE_OBJECTS).toBe('1');
    const last = args.at(-1)!;
    if (args.includes('show')) return Buffer.from(JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false, preparationSourceCommit: null }));
    const value = args.includes('merge-base') || last === `${SOURCE}^{commit}` ? SOURCE
      : last === `${SOURCE}^{tree}` ? ROOT
      : last.startsWith(`${SOURCE}:spacetimedb/`) ? MODULE : MAIN;
    return Buffer.from(value + '\n');
  });
  boundary.discover.mockImplementation((realm: string, input: unknown) => {
    expect(input).toEqual({ privateState: boundary.privateState });
    return boundary.scenario === 'missing-ptr' && realm === 'ptr' ? null : SOURCE;
  });
  boundary.create.mockImplementation(async (input: any) => {
    expect(input.operatingCommit).toBe(MAIN); expect(input.sourceCommits).toEqual([SOURCE]);
    expect(input.nativeRuntime).toBe(boundary.runtime); boundary.token = input.githubToken;
    if (boundary.scenario === 'changed-after-get') boundary.current = false;
    return boundary.scope;
  });
  boundary.refresh.mockImplementation(async (scope: unknown) => {
    expect(scope).toBe(boundary.scope); boundary.phase = 'refreshed';
    if (boundary.scenario === 'changed-after-refresh') boundary.current = false;
  });
  boundary.authenticate.mockImplementation(async (realm: 'g002' | 'ptr', input: any) => {
    expect(input.privateState).toBe(boundary.privateState); expect(input.store).toBe(boundary.store);
    expect(readSealedRealmsProductionRetainedSource(input.retainedSource, realm)).toMatchObject({ operatingCommit: MAIN, sourceCommit: SOURCE, sourceTree: ROOT });
    expect(() => sourceCommitFromSealedRealmsProductionAuthority(input.retainedSource)).toThrow();
    if (boundary.scenario === 'changed-after-signature') boundary.current = false;
    return Object.freeze({ realm });
  });
  boundary.read.mockImplementation((realm: string, input: any) => {
    expect(boundary.phase).toBe('refreshed'); expect(input.privateState).toBe(boundary.privateState);
    expect(input.sourceCommit).toBe(SOURCE); expect(input.evidence).toEqual({ realm });
    if (boundary.scenario === 'changed-record') throw Error('private receipt changed');
    return { sourceTree: boundary.scenario === 'wrong-root' ? MODULE : ROOT, adoptionReceiptDigest: 'f'.repeat(64),
      completionReceipt: { binding: { sourceCommit: SOURCE, moduleTreeId: boundary.scenario === 'wrong-module' ? ROOT : MODULE,
        databaseIdentity: boundary.scenario === 'wrong-database' ? '0'.repeat(64) : realm === 'g002'
          ? 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194' : 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
        candidateSha256: '1'.repeat(64), candidateProgram: '2'.repeat(64), dependencyClosureDigest: '3'.repeat(64) },
        privateFixtureBody: 'must remain private' } };
  });
});

it('reads both real source brands with one deduplicated transport and exports only fixed source facts', async () => {
  const token = Buffer.from('synthetic-token-' + 'x'.repeat(32));
  const result: any = await readSources({ operatingCommit: MAIN, githubToken: token });
  expect(result).toMatchObject({ profile: 'warpkeep-release-recovery-authenticated-adoption-sources-v1', operatingCommit: MAIN,
    sources: { g002: { sourceCommit: SOURCE, sourceRootTree: ROOT, sourceTree: MODULE }, ptr: { installedProgramKeccak256: '2'.repeat(64) } } });
  expect(Object.keys(result.sources.ptr)).toEqual(['sourceAuthority', 'adoptionReceiptSha256', 'updateReceiptSha256',
    'databaseIdentity', 'sourceCommit', 'sourceRootTree', 'sourceTree', 'installedModuleSha256', 'installedProgramKeccak256', 'historicalDependencyClosureSha256']);
  expect(JSON.stringify(result)).not.toContain('must remain private'); expect(JSON.stringify(result)).not.toContain(token.toString('ascii'));
  expect(boundary.create).toHaveBeenCalledTimes(1); expect(boundary.refresh).toHaveBeenCalledTimes(1);
  expect(boundary.revoke).toHaveBeenCalledExactlyOnceWith(boundary.scope);
  expect(boundary.token?.every(byte => byte === 0)).toBe(true); expect(token.some(byte => byte !== 0)).toBe(true);
});
it.each(['missing-ptr', 'changed-after-get', 'changed-after-signature', 'changed-after-refresh', 'changed-record', 'wrong-root', 'wrong-module', 'wrong-database'])(
  'fails closed for %s with no legacy fallback or private diagnostics', async scenario => {
    boundary.scenario = scenario;
    await expect(readSources({ operatingCommit: MAIN, githubToken: null })).rejects.toThrow(/^SEALED_REALMS_RETAINED_FIXTURE_SOURCE_INVALID$/u);
    if (scenario === 'missing-ptr') expect(boundary.create).not.toHaveBeenCalled();
    else expect(boundary.revoke).toHaveBeenCalledExactlyOnceWith(boundary.scope);
  });
it('refuses supplied verifier, copied receipt and accessor authority before host work', async () => {
  const get = vi.fn(() => MAIN);
  for (const input of [{ operatingCommit: MAIN, githubToken: null, verifyEvidence: () => true },
    { operatingCommit: MAIN, githubToken: null, receipt: {} },
    { get operatingCommit() { return get(); }, githubToken: null }]) {
    await expect(readSources(input as never)).rejects.toThrow('SEALED_REALMS_RETAINED_FIXTURE_SOURCE_INVALID');
  }
  expect(get).not.toHaveBeenCalled(); expect(boundary.git).not.toHaveBeenCalled(); expect(boundary.create).not.toHaveBeenCalled();
});
