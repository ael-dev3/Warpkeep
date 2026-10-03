// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { assertPtrInitialAtlasBootstrapMarker, assertPtrInitialAtlasObservation,
  coordinatePtrInitialAtlasImport, ptrInitialAtlasConfirmation } from '../scripts/ptr-initial-owner-atlas-operator';
import { createPtrBootstrapInspection, PTR_BOOTSTRAP_TARGET as target, PTR_BOOTSTRAP_PROVIDER_OWNER as owner } from '../scripts/ptr-compatibility-bootstrap-core.mjs';
import { parsePtrUpdateDefinition } from '../scripts/ptr-update-definition-policy.mjs';
import { parseExistingUpdateSchema, updateDigest, updateCanonical } from '../scripts/sealed-realms-existing-update-protocol.mjs';
import { ptrProductionImportReceiptDigest, type PtrProductionImportReceipt } from '../scripts/ptr-production-import-core';
import { preparePtrInitialOwnerRuntimeRelease } from '../scripts/atlas/greater-realm-cli';

// Real provider-format fixtures exercise the parser boundary. Synthetic journal/transport controls grant no provider authority.
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const fixture = (path: string) => JSON.parse(readFileSync(resolve('tests/fixtures', path), 'utf8'));
const section = (value: any, name: string) => value.sections.find((entry: any) => name in entry)[name];
function setup() {
  const candidate = fixture('ptr-artifact-description-2.6.1/first.json').V10, prior = structuredClone(candidate);
  const tables = section(prior, 'Tables'), mappings = section(prior, 'ExplicitNames').entries;
  const removed = new Set(mappings.filter((entry: any) => entry.Table?.canonical_name.startsWith('gameplay04_')).map((entry: any) => entry.Table.source_name));
  const indexes = new Set(tables.filter((table: any) => removed.has(table.source_name)).flatMap((table: any) => table.indexes.flatMap((index: any) => [index.source_name.some, index.accessor_name.some].filter(Boolean))));
  section(prior, 'Tables').splice(0, tables.length, ...tables.filter((table: any) => !removed.has(table.source_name)));
  section(prior, 'ExplicitNames').entries = mappings.filter((entry: any) => entry.Table ? !removed.has(entry.Table.source_name) : !entry.Index || !indexes.has(entry.Index.source_name));
  section(prior, 'Schedules').splice(0, section(prior, 'Schedules').length, ...section(prior, 'Schedules').filter((entry: any) => !entry.table_name.startsWith('gameplay04_')));
  const installedV9 = bytes(fixture('existing-update-definitions-2.6.1/ptr.b.schema.json'));
  const binding = { sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40), databaseIdentity: target,
    candidateProgram: updateDigest('candidate-program'), candidateSha256: updateDigest('candidate-bytes'),
    candidateDescriptionDigest: parsePtrUpdateDefinition(bytes(candidate)).fullDigest, moduleTreeId: '2'.repeat(40),
    dependencyClosureDigest: updateDigest('dependencies'), cliDigest: updateDigest('cli'), cliConfigDigest: updateDigest('config') };
  const record = createPtrBootstrapInspection({ binding,
    metadataBytes: bytes({ database_identity: { __identity__: `0x${target}` }, owner_identity: { __identity__: `0x${owner}` }, host_type: { Js: [] }, initial_program: '9'.repeat(64) }),
    claimedProviderIdentity: owner, priorV9: bytes(fixture('existing-update-definitions-2.6.1/ptr.a.schema.json')),
    priorV10: bytes(prior), candidateDefinition: candidate,
    planBytes: bytes(fixture('existing-update-plans-2.6.1.json').find((entry: any) => entry.name === 'ptr-add-gameplay').response) });
  const schema = parseExistingUpdateSchema(installedV9);
  const state = { program: binding.candidateProgram, schemaDigest: schema.digest, definitionPolicy: schema.definitionPolicy,
    tables: schema.names.map(name => ({ name, count: name === 'ptr_owner_anchor_v1' ? 0 : 3,
      rowsDigest: name === 'ptr_owner_anchor_v1' ? updateDigest([]) : updateDigest(`rows:${name}`),
      schemaDigest: updateDigest(`result:${name}`), installedTableSchemaDigest: schema.tableSchemas[name] })),
    owner: { state: 'ownerless', enabled: false, authEpoch: null as number | null }, atlas: { state: 'ready' } };
  return { record, binding, state, observation: { state, installedV9, installedV10: bytes(candidate) } };
}
function receipt(): PtrProductionImportReceipt {
  const body = { schemaVersion: 1, profile: 'warpkeep.ptr.production-import.v1', outcome: 'ready', databaseIdentity: target,
    moduleIdentity: 'warpkeep-ptr-owner-view-v1', moduleSourceCommit: '1'.repeat(40), moduleSha256: '2'.repeat(64),
    moduleTreeId: '3'.repeat(40), dependencyClosureDigest: '4'.repeat(64), spacetimeExecutableSha256: '5'.repeat(64),
    atlasId: 'PTR_GREATER_REALM', atlasSourceCommit: '6'.repeat(40), publicReleaseId: `GRR-${'A'.repeat(26)}`,
    releaseManifestSha256: '7'.repeat(64), expectedReleaseSha256: '8'.repeat(64), releaseHeaderSha256: '9'.repeat(64),
    verificationDigest: 'a'.repeat(64), importEpoch: '1', operationsSubmitted: 7, operationChainDigest: 'b'.repeat(64),
    zeroPopulationBoundary: true, importsExact: true, ready: true, atlasFinalized: true, atlasWritesClosedByFinalization: true,
    importMutationsCompiled: true, activationMutationsCompiled: false } as const;
  return { ...body, importReceiptDigest: ptrProductionImportReceiptDigest(body) };
}
function controls() {
  const events: string[] = [], slots = new Map<string, unknown>(), marker = { program: 'a'.repeat(64), release: 'b'.repeat(64) };
  const journal = { assert: () => {}, present: (kind: string, key: string) => slots.has(`${kind}:${key}`),
    read: (kind: string, key: string) => ({ value: slots.get(`${kind}:${key}`) }),
    write: (kind: string, key: string, value: unknown) => { const k = `${kind}:${key}`; if (slots.has(k)) throw new Error('exclusive');
      slots.set(k, structuredClone(value)); events.push(`${kind}:fsynced`); } };
  const validateReceipt = (value: unknown) => { const r = value as PtrProductionImportReceipt, { importReceiptDigest, ...body } = r;
    if (ptrProductionImportReceiptDigest(body) !== importReceiptDigest) throw new Error('invalid receipt'); return r; };
  const execute = vi.fn(async (beforeSend: () => void) => { beforeSend(); events.push('reducer'); return receipt(); });
  const input = { command: 'import' as const, journal: journal as never, marker, assert: () => {}, validateReceipt, execute };
  return { input, journal, marker, slots, events, execute };
}

describe('initial-quality PTR atlas installed observations', () => {
  it('accepts a ready imported atlas with populated gameplay tables without asserting bootstrap emptiness', () => {
    const f = setup(), result = assertPtrInitialAtlasObservation(f.record, f.observation as never);
    expect(result).toMatchObject({ tableCount: 31, atlas: { state: 'ready' }, productionAuthorized: false,
      preBootstrapRowEqualityObserved: false, usableOwnerPtrVerified: false });
    expect(result.snapshotDigest).toBe(updateDigest(f.state));
  });
  it('observes an enabled owner without inventing session or journey acceptance', () => {
    const f = setup(); f.state.owner = { state: 'enabled', enabled: true, authEpoch: 7 };
    f.state.tables.find(row => row.name === 'ptr_owner_anchor_v1')!.count = 1;
    f.state.tables.find(row => row.name === 'ptr_owner_anchor_v1')!.rowsDigest = updateDigest('one owner');
    expect(assertPtrInitialAtlasObservation(f.record, f.observation as never).usableOwnerPtrVerified).toBe(false);
  });
  it.each(['program', 'missing', 'duplicate', 'schema', 'definition', 'negativeCount', 'badDigest', 'unknownOwner', 'unknownAtlas'] as const)
    ('refuses conflicting installed %s', mutation => {
      const f = setup();
      if (mutation === 'program') f.state.program = '0'.repeat(64);
      if (mutation === 'missing') f.state.tables.pop();
      if (mutation === 'duplicate') f.state.tables[1] = structuredClone(f.state.tables[0]!);
      if (mutation === 'schema') f.state.tables[0]!.installedTableSchemaDigest = '0'.repeat(64);
      if (mutation === 'definition') f.observation.installedV10 = bytes(fixture('ptr-artifact-description-2.6.1/first.json').V10.sections);
      if (mutation === 'negativeCount') f.state.tables[0]!.count = -1;
      if (mutation === 'badDigest') f.state.tables[0]!.rowsDigest = 'invented';
      if (mutation === 'unknownOwner') f.state.owner.state = 'unrecognized';
      if (mutation === 'unknownAtlas') f.state.atlas.state = 'unrecognized';
      expect(() => assertPtrInitialAtlasObservation(f.record, f.observation as never)).toThrow();
    });
  it.each(['owner', 'atlas'] as const)('rejects an installed report missing %s before returning a narrowed observation', field => {
    const f = setup(), observation = { ...f.observation, state: { ...f.state, [field]: undefined } };
    expect(() => assertPtrInitialAtlasObservation(f.record, observation as never))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_INSTALLED_STATE_INVALID');
  });
  it('requires the exact immutable real bootstrap binding, retaining unknown pre-program and rows', () => {
    const f = setup(), marker = { inspectionDigest: f.record.inspectionDigest, binding: f.binding,
      programBefore: null, rowsBefore: null, submissionState: 'possibly-submitted' };
    expect(() => assertPtrInitialAtlasBootstrapMarker(f.record, marker)).not.toThrow();
    expect(() => assertPtrInitialAtlasBootstrapMarker(f.record, { ...marker, programBefore: f.binding.candidateProgram })).toThrow();
    expect(() => assertPtrInitialAtlasBootstrapMarker(f.record, { ...marker, binding: { ...f.binding, databaseIdentity: 'a'.repeat(64) } })).toThrow();
  });
  it('binds explicit confirmation to current source, installed source, program and actual runtime', () => {
    const base = { bootstrapInspection: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), installedSourceCommit: 'c'.repeat(40),
      program: 'd'.repeat(64), releaseSha256: 'e'.repeat(64), atlasSourceCommit: 'f'.repeat(40) };
    const digest = ptrInitialAtlasConfirmation(base);
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      expect(ptrInitialAtlasConfirmation({ ...base, [key]: '0'.repeat(base[key].length) })).not.toBe(digest);
    }
    expect(() => ptrInitialAtlasConfirmation({ ...base, program: 'invented' })).toThrow();
  });
});
describe('explicit private runtime selection boundary', () => {
  it.each([
    { command: 'select', workspaceRoot: '/private', batchHandle: 'bad', candidateHandle: `GR-A-${'A'.repeat(16)}`, approvalReference: 'OWNER-EXPLICIT1' },
    { command: 'select', workspaceRoot: 'relative', batchHandle: `GR-B-${'A'.repeat(16)}`, candidateHandle: `GR-A-${'A'.repeat(16)}`, approvalReference: 'OWNER-EXPLICIT1' },
    { command: 'prepare', workspaceRoot: '/private', batchHandle: `GR-B-${'A'.repeat(16)}`, candidateHandle: `GR-A-${'A'.repeat(16)}` },
    { command: 'select', workspaceRoot: '/private', batchHandle: `GR-B-${'A'.repeat(16)}`, candidateHandle: `GR-A-${'A'.repeat(16)}` },
  ] as const)('rejects malformed or implicit private selection before source/private IO: $command', async input => {
    const assertSource = vi.fn();
    await expect(preparePtrInitialOwnerRuntimeRelease({ ...input, assertSource })).rejects.toThrow('GREATER_REALM_PTR_INITIAL_ARGUMENT_INVALID');
    expect(assertSource).not.toHaveBeenCalled();
  });
});
describe('durable initial atlas import coordinator used by the real CLI', () => {
  it('fsyncs the exclusive marker before the reducer and retains the actual ordered receipt before publication', async () => {
    const o = controls(); expect(await coordinatePtrInitialAtlasImport(o.input)).toEqual(receipt());
    expect(o.events).toEqual(['submission:fsynced', 'reducer', 'acknowledgement:fsynced']);
    expect(o.execute).toHaveBeenCalledTimes(1);
    expect(await coordinatePtrInitialAtlasImport({ ...o.input, command: 'reconcile-import' })).toEqual(receipt());
    expect(o.execute).toHaveBeenCalledTimes(1);
  });
  it('allows multiple reducers only within the same original invocation, with one durable marker', async () => {
    const o = controls(); o.execute.mockImplementation(async beforeSend => { beforeSend(); beforeSend(); return receipt(); });
    await coordinatePtrInitialAtlasImport(o.input);
    expect(o.events.filter(event => event === 'submission:fsynced')).toHaveLength(1);
    await expect(coordinatePtrInitialAtlasImport(o.input)).rejects.toThrow('IMPORT_SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY');
    expect(o.execute).toHaveBeenCalledTimes(1);
  });
  it('never replays a possibly-submitted lost ACK and exposes missing retained receipt on read-only reconcile', async () => {
    const o = controls(); o.execute.mockImplementation(async beforeSend => { beforeSend(); throw new Error('lost ACK'); });
    await expect(coordinatePtrInitialAtlasImport(o.input)).rejects.toThrow('lost ACK');
    await expect(coordinatePtrInitialAtlasImport(o.input)).rejects.toThrow('IMPORT_SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY');
    expect(await coordinatePtrInitialAtlasImport({ ...o.input, command: 'reconcile-import' })).toBeNull();
    expect(o.execute).toHaveBeenCalledTimes(1);
  });
  it('retains an interrupted marker but does not send when durable marker persistence throws', async () => {
    const o = controls(), write = o.journal.write; let sends = 0;
    o.journal.write = (kind, key, value) => { write(kind, key, value); throw new Error('fsync failed'); };
    o.execute.mockImplementation(async beforeSend => { beforeSend(); sends++; return receipt(); });
    await expect(coordinatePtrInitialAtlasImport(o.input)).rejects.toThrow('fsync failed'); expect(sends).toBe(0);
    await expect(coordinatePtrInitialAtlasImport(o.input)).rejects.toThrow('IMPORT_SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY');
  });
  it('does not invent a real receipt when validation or receipt persistence fails', async () => {
    const o = controls(); o.execute.mockImplementation(async beforeSend => { beforeSend(); return { ...receipt(), importReceiptDigest: '0'.repeat(64) }; });
    await expect(coordinatePtrInitialAtlasImport(o.input)).rejects.toThrow('invalid receipt');
    expect(await coordinatePtrInitialAtlasImport({ ...o.input, command: 'reconcile-import' })).toBeNull();
  });
  it('refuses a changed marker or receipt and never calls the mutation executor during reconciliation', async () => {
    const o = controls(); await coordinatePtrInitialAtlasImport(o.input);
    o.slots.set(`submission:${updateDigest(o.marker)}`, { ...o.marker, program: 'c'.repeat(64) });
    await expect(coordinatePtrInitialAtlasImport({ ...o.input, command: 'reconcile-import' })).rejects.toThrow('IMPORT_MARKER_DIFFERENT');
    o.slots.set(`submission:${updateDigest(o.marker)}`, o.marker);
    const ack = o.slots.get(`acknowledgement:${updateDigest(o.marker)}`) as { markerDigest: string; receiptJson: string };
    o.slots.set(`acknowledgement:${updateDigest(o.marker)}`, { ...ack, markerDigest: '0'.repeat(64) });
    await expect(coordinatePtrInitialAtlasImport({ ...o.input, command: 'reconcile-import' })).rejects.toThrow('IMPORT_RECEIPT_INVALID');
    expect(o.execute).toHaveBeenCalledTimes(1);
  });
  it('requires a genuine prior marker for reconciliation', async () => {
    const o = controls(); await expect(coordinatePtrInitialAtlasImport({ ...o.input, command: 'reconcile-import' })).rejects.toThrow('IMPORT_SUBMISSION_NOT_MARKED');
    expect(o.execute).not.toHaveBeenCalled(); expect(updateCanonical([...o.slots])).toBe('[]');
  });
});
