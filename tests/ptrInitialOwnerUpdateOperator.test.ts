// @vitest-environment node
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ capture: vi.fn(), inspect: vi.fn(), prepare: vi.fn(), artifact: vi.fn(),
  create: vi.fn(), createRead: vi.fn(), request: vi.fn(), requestRead: vi.fn(), dispose: vi.fn(),
  stateRoot: vi.fn(), secret: vi.fn(), configuration: vi.fn() }));
vi.mock('../scripts/ptr-initial-owner-operator', () => ({ capturePtrInitialOwnerSource: mocks.capture,
  inspectPtrInitialOwnerState: mocks.inspect }));
vi.mock('../scripts/ptr-production-publisher.mjs', () => ({ preparePtrSourceBuiltArtifact: mocks.prepare,
  assertPtrSourceBuiltArtifact: mocks.artifact }));
vi.mock('../scripts/ptr-update-provider-credentials.mjs', async importOriginal => ({
  ...(await importOriginal<typeof import('../scripts/ptr-update-provider-credentials.mjs')>()),
  createPtrUpdateProviderCredentials: mocks.create, createPtrInspectionProviderCredentials: mocks.createRead,
  requestPtrUpdateProvider: mocks.request, requestPtrInspectionProvider: mocks.requestRead,
  disposePtrUpdateProviderCredentials: mocks.dispose,
}));
vi.mock('../scripts/production-admin-token-budget.mjs', async importOriginal => ({
  ...(await importOriginal<typeof import('../scripts/production-admin-token-budget.mjs')>()),
  ensureCanonicalProductionAdminStateDirectory: mocks.stateRoot, defaultProductionAdminStateDirectory: mocks.stateRoot,
}));
vi.mock('../scripts/ptr-production-admin-token', () => ({ takePtrProductionAdminSecret: mocks.secret }));
vi.mock('../scripts/auth-bridge-config-attestation.mjs', () => ({ verifyAuthBridgeRpcRoleAttestation: mocks.configuration }));
import { executePtrInitialOwnerUpdate, openPtrInitialOwnerUpdateJournal } from '../scripts/ptr-initial-owner-update-operator';
import { parsePtrUpdateDefinition } from '../scripts/ptr-update-definition-policy.mjs';
import { existingUpdateTokenDigest, updateDigest } from '../scripts/sealed-realms-existing-update-protocol.mjs';

const roots: string[] = [], hash = (value: string) => updateDigest(value);
const target = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
const program = hash('prior'), candidateProgram = hash('candidate'), SOURCE = '1'.repeat(40), TREE = '2'.repeat(40);
const sourceInput = { sourceCommit: SOURCE, sourceTree: TREE, signerFingerprint: `SHA256:${'a'.repeat(43)}`, signerIdentity: 'unit-source-signer' };
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value));
const section = (value: any, key: string) => value.sections.find((entry: any) => key in entry)[key];
const names = (value: any): string[] => section(value, 'ExplicitNames').entries.filter((entry: any) => entry.Table)
  .map((entry: any) => entry.Table.canonical_name).sort();
afterEach(() => { for (const root of roots.splice(0).reverse()) rmSync(root, { recursive: true, force: false }); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetAllMocks(); });
function privateRoot() { const root = mkdtempSync(join(tmpdir(), 'warpkeep-initial-update-test-')); chmodSync(root, 0o700); roots.push(root); return root; }

// These use actual exclusive/fsynced files. They neither submit nor assert provider/source authority.
describe.runIf(process.platform === 'linux')('initial update journal IO', () => {
  it('writes one immutable entry with private mode and verifies its exact readback', () => {
    const root = privateRoot(), journal = openPtrInitialOwnerUpdateJournal(root, true), key = hash('entry');
    const entry = journal.write('submission', key, { submissionState: 'possibly-submitted' });
    expect(lstatSync(entry.path).mode & 0o777).toBe(0o600);
    expect(journal.read('submission', key).sha256).toBe(entry.sha256);
    expect(() => journal.write('submission', key, {})).toThrow();
  });
  it('refuses partial markers without erasing them and preserves the occupied submission slot', () => {
    const root = privateRoot(), journal = openPtrInitialOwnerUpdateJournal(root, true), key = hash('partial');
    const path = join(root, 'ptr-initial-owner-updates-v1', `submission-${key}.json`);
    writeFileSync(path, '{', { mode: 0o600 });
    expect(journal.present('submission', key)).toBe(true); expect(() => journal.read('submission', key)).toThrow();
    expect(() => journal.write('submission', key, {})).toThrow(); expect(readFileSync(path, 'utf8')).toBe('{');
  });
  it('does not create a missing journal on read-only reopen', () => {
    const root = privateRoot(); expect(() => openPtrInitialOwnerUpdateJournal(root)).toThrow('JOURNAL_ABSENT');
    expect(readdirSync(root)).toEqual([]);
  });
  it('rejects symlink entries and a replaced or writable journal directory', () => {
    const root = privateRoot(), journal = openPtrInitialOwnerUpdateJournal(root, true), key = hash('link');
    const privateFile = join(root, 'private.json'); writeFileSync(privateFile, '{}', { mode: 0o600 });
    symlinkSync(privateFile, join(root, 'ptr-initial-owner-updates-v1', `inspection-${key}.json`));
    expect(() => journal.read('inspection', key)).toThrow();
    chmodSync(join(root, 'ptr-initial-owner-updates-v1'), 0o777); expect(() => journal.assert()).toThrow();
  });
  it('rejects caller-selected traversal keys and a noncanonical or extra-field record', () => {
    const root = privateRoot(), journal = openPtrInitialOwnerUpdateJournal(root, true), key = hash('canonical');
    expect(() => journal.write('submission', '../outside', {})).toThrow('JOURNAL_KEY_INVALID');
    const entry = journal.write('inspection', key, {}); const raw = JSON.parse(readFileSync(entry.path, 'utf8'));
    writeFileSync(entry.path, JSON.stringify({ ...raw, authority: true }), { mode: 0o600 });
    expect(() => journal.read('inspection', key)).toThrow('JOURNAL_RECORD_INVALID');
  });
});

function fixture() {
  // Existing builder/credential factories are mocked only at their unit boundaries. No fixture is a genuine artifact.
  const root = privateRoot(), config = join(root, 'cli.toml'), executable = join(root, 'spacetime');
  writeFileSync(config, 'unit private config', { mode: 0o600 });
  writeFileSync(executable, 'unit executable', { mode: 0o755 }); chmodSync(executable, 0o755);
  const candidate = JSON.parse(readFileSync(new URL('./fixtures/ptr-artifact-description-2.6.1/first.json', import.meta.url), 'utf8')).V10;
  const prior = structuredClone(candidate), tables = section(prior, 'Tables'), mappings = section(prior, 'ExplicitNames').entries;
  const removed = new Set(mappings.filter((entry: any) => entry.Table?.canonical_name.startsWith('gameplay04_')).map((entry: any) => entry.Table.source_name));
  const indexes = new Set(tables.filter((table: any) => removed.has(table.source_name)).flatMap((table: any) =>
    table.indexes.flatMap((index: any) => [index.source_name.some, index.accessor_name.some].filter(Boolean))));
  section(prior, 'Tables').splice(0, tables.length, ...tables.filter((table: any) => !removed.has(table.source_name)));
  section(prior, 'ExplicitNames').entries = mappings.filter((entry: any) => entry.Table ? !removed.has(entry.Table.source_name)
    : !entry.Index || !indexes.has(entry.Index.source_name));
  section(prior, 'Schedules').splice(0, section(prior, 'Schedules').length,
    ...section(prior, 'Schedules').filter((schedule: any) => !schedule.table_name.startsWith('gameplay04_')));
  const plan = JSON.parse(readFileSync(new URL('./fixtures/existing-update-plans-2.6.1.json', import.meta.url), 'utf8'))
    .find((entry: any) => entry.name === 'ptr-add-gameplay').response;
  plan.AutoMigrate.token = `0x${Buffer.from(existingUpdateTokenDigest(target, program, candidateProgram), 'hex').reverse().toString('hex')}`;
  const before = { program, schemaDigest: hash('V9 prior'), definitionPolicy: 'warpkeep-raw-module-v9-no-views-rls-defaults-v1',
    tables: names(prior).map(name => ({ name, count: 0, rowsDigest: updateDigest([]), schemaDigest: hash(`row:${name}`),
      installedTableSchemaDigest: hash(`schema:${name}`) })), owner: { state: 'ownerless', enabled: false, authEpoch: null }, atlas: { state: 'absent' } };
  const after = { ...structuredClone(before), program: candidateProgram, schemaDigest: hash('V9 candidate'),
    tables: names(candidate).map(name => structuredClone(before.tables.find(table => table.name === name)
      ?? { name, count: 0, rowsDigest: updateDigest([]), schemaDigest: hash(`row:${name}`), installedTableSchemaDigest: hash(`schema:${name}`) })) };
  const sourceAssert = vi.fn(), artifactAssert = vi.fn(), cleanup = vi.fn();
  const source = { facts: { ...sourceInput, acceptedMainAuthority: false, productionAuthorized: false }, assert: sourceAssert };
  const shaBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex') as string;
  const artifact = { sourceCommit: SOURCE, moduleProgramHash: candidateProgram, moduleSha256: hash('bundle'),
    artifactDescription: { definition: candidate, descriptionSha256: parsePtrUpdateDefinition(encoded(candidate)).fullDigest },
    moduleTreeId: '3'.repeat(40), dependencyClosureDigest: hash('locked dependency closure'), artifactDescriptor: 123,
    spacetimeExecutable: executable, spacetimeExecutableSha256: shaBytes(readFileSync(executable)),
    spacetimeCliRootDirectory: root, spacetimeCliConfigPath: config, spacetimeCliConfigSha256: shaBytes(readFileSync(config)),
    assertSourceAndArtifact: artifactAssert, assertCliConfig: vi.fn(), cleanup };
  const state = { installed: false, putCount: 0, lostAck: false, changedRows: false, observedCalls: 0, requestEvents: [] as string[], buffers: [] as Buffer[] };
  const writer = Object.freeze({ role: 'unit-writer' }), reader = Object.freeze({ role: 'unit-reader' });
  mocks.capture.mockReturnValue(source); mocks.stateRoot.mockReturnValue(root); mocks.prepare.mockReturnValue(artifact);
  mocks.artifact.mockImplementation(value => { if (value !== artifact) throw Error('not a genuine test boundary object'); artifactAssert(); return artifact; });
  mocks.create.mockReturnValue(writer); mocks.createRead.mockReturnValue(reader);
  mocks.secret.mockImplementation(() => { throw Error('private config intentionally unavailable'); });
  mocks.inspect.mockImplementation(async ({ assertSource }: { assertSource: () => void }) => {
    assertSource(); state.observedCalls++; const current = structuredClone(state.installed ? after : before);
    if (state.changedRows && state.observedCalls > 1) current.tables[0]!.rowsDigest = hash('changed');
    return { preservation: { installedStateObservedEqual: true, privateConfigurationObservedEqual: false },
      after: current, beforeConfiguration: null, afterConfiguration: null,
      blockers: ['OWNER_NOT_ENABLED', 'ATLAS_READY_NOT_OBSERVED', 'PRIVATE_BRIDGE_CONFIG_UNOBSERVED'] };
  });
  const response = (value: unknown) => { const bytes = encoded(value); state.buffers.push(bytes); return { bytes, claimedProviderIdentity: hash('CLI identity only') }; };
  mocks.request.mockImplementation(async (capability: object, request: any) => {
    expect(capability).toBe(writer); state.requestEvents.push(request.operation);
    if (request.operation === 'health') return response({ version: '2.10.2', package_name: 'spacetimedb-cloud' });
    if (request.operation === 'schema') return response(state.installed ? candidate : prior);
    if (request.operation === 'plan') return response(plan);
    if (request.operation === 'apply') {
      expect(request.migrationToken).toBe(plan.AutoMigrate.token);
      request.beforeSend();
      const marker = openPtrInitialOwnerUpdateJournal(root).read('submission', program);
      expect(marker.value.submissionState).toBe('possibly-submitted');
      state.putCount++; state.installed = true;
      if (state.lostAck) throw Error('secret-bearing transport error must not escape');
      return response({ Success: { domain: null, database_identity: target, op: 'updated' } });
    }
    throw Error('unexpected or unsafe request');
  });
  mocks.requestRead.mockImplementation(async (capability: object, request: { operation: string }) => {
    expect(capability).toBe(reader); expect(request.operation).toBe('schema-v10'); return response(state.installed ? candidate : prior);
  });
  const environment = { WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: root, WARPKEEP_SPACETIME_CLI_CONFIG_PATH: config, SPACETIME_BIN: executable };
  const run = (command: 'prepare-update' | 'apply' | 'reconcile', inspectionDigest?: string) => executePtrInitialOwnerUpdate({ command,
    source: sourceInput, environment, ...(inspectionDigest === undefined ? {} : { inspectionDigest }) });
  return { root, environment, run, state, artifact, sourceAssert, artifactAssert, cleanup, before, after };
}

// Production execution is Linux UID1000; other platforms may still exercise the pure core, not impersonate this host.
describe.runIf(process.platform === 'linux' && process.arch === 'x64' && process.getuid?.() === 1000)('real initial update operator wiring (mocked provider boundaries)', () => {
  it('prepares from the captured signed source using the genuine artifact factory and never submits', async () => {
    const f = fixture(), prepared = await f.run('prepare-update');
    expect(prepared).toMatchObject({ operationComplete: true, commandSucceeded: true, candidateInstallationObserved: null, resolutionComplete: null, applyRequested: false, submissionMarked: false,
      productionAuthorized: false, usableOwnerPtrVerified: false, privateConfigurationObserved: false });
    expect(mocks.capture).toHaveBeenCalledWith(expect.any(String), sourceInput);
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ sourceCommit: SOURCE, cliConfigSourcePath: f.environment.WARPKEEP_SPACETIME_CLI_CONFIG_PATH }));
    expect(mocks.prepare.mock.calls[0]![0].reattestSource()).toBe(SOURCE);
    expect(f.state.requestEvents).not.toContain('apply'); expect(f.cleanup).toHaveBeenCalledOnce();
    expect(f.state.buffers.every(buffer => buffer.every(byte => byte === 0))).toBe(true);
    expect(JSON.stringify(prepared)).not.toContain('migrate_plan');
  });
  it.each([
    { version: '2.10.0', package_name: 'spacetimedb-cloud' },
    { version: '2.10.3', package_name: 'spacetimedb-cloud' },
    { version: '2.10.2', package_name: 'different-server' },
  ])('rejects unsupported host health %j before schema, plan or marker', async health => {
    const f = fixture(), raw = encoded(health);
    mocks.request.mockImplementationOnce(async () => ({ bytes: raw }));
    const value = await f.run('prepare-update');
    expect(value).toMatchObject({ error: 'PTR_INITIAL_OWNER_UPDATE_HOST_UNSUPPORTED', commandSucceeded: false,
      operationComplete: false, applyRequested: false, submissionMarked: false });
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith(expect.any(Object), { operation: 'health' });
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(readdirSync(join(f.root, 'ptr-initial-owner-updates-v1'))).toEqual([]);
    expect(raw.every(byte => byte === 0)).toBe(true); expect(f.cleanup).toHaveBeenCalledOnce();
  });
  it('resubmits no inspection; explicit apply records the durable marker before one fixed-target request and preserves ownerless state', async () => {
    const f = fixture(), prepared = await f.run('prepare-update'), applied = await f.run('apply', prepared.inspectionDigest!);
    expect(applied).toMatchObject({ operationComplete: true, commandSucceeded: true, candidateInstallationObserved: true, resolutionComplete: true, applyRequested: true, submissionMarked: true, acknowledgementReceived: true,
      retryAuthorized: false, usableOwnerPtrVerified: false, result: { outcome: 'observed-preserved-candidate' } });
    expect(f.state.requestEvents.filter(value => value === 'apply')).toHaveLength(1);
    expect((await f.run('apply', prepared.inspectionDigest!)).error).toContain('RECONCILE_ONLY');
    expect(f.state.requestEvents.filter(value => value === 'apply')).toHaveLength(1);
  });
  it('two explicit contenders share one exclusive predecessor slot and can observe at most one mocked PUT', async () => {
    const f = fixture(), prepared = await f.run('prepare-update');
    const contenders = await Promise.all([f.run('apply', prepared.inspectionDigest!), f.run('apply', prepared.inspectionDigest!)]);
    expect(f.state.putCount).toBe(1);
    expect(contenders.filter(value => value.operationComplete)).toHaveLength(1);
    expect(openPtrInitialOwnerUpdateJournal(f.root).present('submission', program)).toBe(true);
    expect(contenders.every(value => value.retryAuthorized === false)).toBe(true);
  });
  it('retains a lost acknowledgement and reconciles by read-only V10/row observations without rebuilding or retrying', async () => {
    const f = fixture(), prepared = await f.run('prepare-update'); f.state.lostAck = true;
    const lost = await f.run('apply', prepared.inspectionDigest!);
    expect(lost).toMatchObject({ operationComplete: false, commandSucceeded: false, candidateInstallationObserved: false, resolutionComplete: false, submissionMarked: true, acknowledgementReceived: false, submissionOutcome: 'uncertain' });
    expect(lost.error).not.toContain('secret-bearing'); const buildCount = mocks.prepare.mock.calls.length, writeCount = mocks.request.mock.calls.length;
    const reconciled = await f.run('reconcile', prepared.inspectionDigest!);
    expect(reconciled).toMatchObject({ operationComplete: true, commandSucceeded: true, candidateInstallationObserved: true, resolutionComplete: true, retryAuthorized: false, result: { outcome: 'observed-preserved-candidate' } });
    expect(mocks.prepare).toHaveBeenCalledTimes(buildCount); expect(mocks.request).toHaveBeenCalledTimes(writeCount);
    expect(mocks.createRead).toHaveBeenCalledOnce(); expect(mocks.requestRead).toHaveBeenCalledTimes(2);
  });
  it('keeps predecessor installation uncertain after a marker, never certifying no effect or permitting retry', async () => {
    const f = fixture(), prepared = await f.run('prepare-update'); f.state.lostAck = true; await f.run('apply', prepared.inspectionDigest!);
    f.state.installed = false; const value = await f.run('reconcile', prepared.inspectionDigest!);
    expect(value.result).toMatchObject({ outcome: 'not-observed-applied', submissionOutcome: 'uncertain', retryAuthorized: false });
    expect(value).toMatchObject({ operationComplete: true, commandSucceeded: false, candidateInstallationObserved: false,
      resolutionComplete: false, submissionOutcome: 'uncertain' });
  });
  it('refuses changed live rows before marker and transport submission', async () => {
    const f = fixture(), prepared = await f.run('prepare-update'); f.state.changedRows = true;
    const value = await f.run('apply', prepared.inspectionDigest!);
    expect(value.error).toContain('STATE_OR_CONFIG_CHANGED'); expect(value.submissionMarked).toBe(false);
    expect(f.state.requestEvents).not.toContain('apply');
  });
  it('an occupied partial marker blocks apply and remains available for manual diagnosis', async () => {
    const f = fixture(), prepared = await f.run('prepare-update');
    const path = join(f.root, 'ptr-initial-owner-updates-v1', `submission-${program}.json`);
    writeFileSync(path, '{', { mode: 0o600 });
    const value = await f.run('apply', prepared.inspectionDigest!); expect(value.error).toContain('RECONCILE_ONLY');
    expect(readFileSync(path, 'utf8')).toBe('{'); expect(f.state.requestEvents).not.toContain('apply');
    const reconciliation = await f.run('reconcile', prepared.inspectionDigest!);
    expect(reconciliation.operationComplete).toBe(false); expect(f.state.requestEvents).not.toContain('apply');
  });
  it('holds source/config inside beforeSend; a changed source cannot reach the mocked PUT', async () => {
    const f = fixture(), prepared = await f.run('prepare-update');
    let marked = false;
    f.sourceAssert.mockImplementation(() => { if (marked) throw Error('source changed'); });
    mocks.request.mockImplementationOnce(async () => ({ bytes: encoded({ version: '2.10.2', package_name: 'spacetimedb-cloud' }) }));
    const actual = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (cap, request) => {
      if (request.operation !== 'apply') return actual(cap, request);
      marked = true; request.beforeSend(); throw Error('must not reach transport');
    });
    const value = await f.run('apply', prepared.inspectionDigest!);
    expect(value.operationComplete).toBe(false); expect(f.state.installed).toBe(false);
    expect(existsSync(join(f.root, 'ptr-initial-owner-updates-v1', `submission-${program}.json`))).toBe(false);
  });
  it('refuses forged artifact objects before any submission request', async () => {
    const f = fixture(), prepared = await f.run('prepare-update');
    mocks.artifact.mockImplementation(() => { throw Error('forged artifact'); });
    expect((await f.run('apply', prepared.inspectionDigest!)).operationComplete).toBe(false);
    expect(f.state.requestEvents).not.toContain('apply'); expect(f.cleanup).toHaveBeenCalledTimes(2);
  });
  it('reports a real cleanup failure rather than claiming cleanup or operation success', async () => {
    const f = fixture(); mocks.dispose.mockImplementation(() => { throw Error('private cleanup detail'); });
    const value = await f.run('prepare-update');
    expect(value).toMatchObject({ operationComplete: false, cleanupCompleted: false, credentialCleanupCompleted: false });
    expect(value.error).toBe('PTR_INITIAL_OWNER_UPDATE_CREDENTIAL_CLEANUP_FAILED');
  });
  it('rejects destination overrides before artifact or network access', async () => {
    const f = fixture(); await expect(executePtrInitialOwnerUpdate({ command: 'prepare-update', source: sourceInput,
      environment: { ...f.environment, WARPKEEP_SPACETIMEDB_URI: 'https://other.invalid' } })).rejects.toThrow('ENVIRONMENT_INVALID');
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
});
