// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { assertPtrInitialAtlasBootstrapMarker, assertPtrInitialAtlasObservation,
  assertPtrInitialAtlasUpdateContinuation, assertPtrInitialAtlasUpdateReconciliationPair, coordinatePtrInitialAtlasImport, coordinatePtrInitialAtlasRecovery, ptrInitialAtlasRecoveryKey, ptrInitialAtlasTargets, ptrInitialAtlasConfirmation,
  ptrInitialAtlasImportMarker, ptrInitialAtlasImportChainVerified } from '../scripts/ptr-initial-owner-atlas-operator';
import { createPtrBootstrapInspection, PTR_BOOTSTRAP_TARGET as target, PTR_BOOTSTRAP_PROVIDER_OWNER as owner } from '../scripts/ptr-compatibility-bootstrap-core.mjs';
import { parsePtrUpdateDefinition } from '../scripts/ptr-update-definition-policy.mjs';
import { createPtrInitialOwnerUpdateInspection } from '../scripts/ptr-initial-owner-update-core.mjs';
import { existingUpdateTokenDigest, parseExistingUpdateSchema, updateDigest, updateCanonical } from '../scripts/sealed-realms-existing-update-protocol.mjs';
import { ptrProductionImportReceiptDigest, type PtrProductionImportReceipt } from '../scripts/ptr-production-import-core';
import { preparePtrInitialOwnerRuntimeRelease } from '../scripts/atlas/greater-realm-cli';
import { greaterRealmRuntimeReleaseTestSeams } from '../scripts/atlas/greater-realm-runtime-release';

describe('interrupted import chain admission', () => {
  it('retains the fixed runtime validation code without copying rejected input', () => {
    const rejected = { toString: () => 'synthetic-private-input' };
    try {
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(rejected);
      throw new Error('expected validation failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID', message: 'GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID' });
      expect(JSON.stringify(error)).not.toContain('synthetic-private-input');
    }
  });
  it('permits read-only reconciliation without claiming a verified chain', () => {
    expect(ptrInitialAtlasImportChainVerified('reconcile-import', null)).toBe(false);
  });
  it.each(['import', 'inspect', 'inspect-owner', 'provision-owner'] as const)('keeps %s closed without completion evidence', command => {
    expect(() => ptrInitialAtlasImportChainVerified(command, null)).toThrow('IMPORT_CHAIN_RECEIPT_MISSING');
  });
});

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
function continuationSetup(overrides: { sourceCommit?: string } = {}) {
  const f = setup(), updateProgram = updateDigest('post-bootstrap module'), config: any = {
    profile: 'warpkeep-auth-v2', digest: updateDigest('bridge-current'),
    farcasterRpcEndpointRoleFingerprints: { primary: updateDigest('rpc-primary'), secondary: updateDigest('rpc-secondary') },
    notificationDeliveryEnabled: true, notificationTransportConfigured: true, notificationClientCount: 1,
    publicAuthEnabled: true, accessExpectedFidRequired: false, ptrEnabled: true,
    ptrSpacetimeDbDatabase: target, ptrAudience: 'warpkeep-ptr-spacetimedb',
  };
  const before: any = structuredClone(f.state); before.atlas = { state: 'absent' };
  const bound: any = { ...f.binding, sourceCommit: overrides.sourceCommit ?? '8'.repeat(40), sourceTree: '9'.repeat(40), moduleTreeId: '9'.repeat(40),
    candidateProgram: updateProgram, candidateSha256: updateDigest('post-bootstrap bytes') };
  const plan = fixture('existing-update-plans-2.6.1.json').find((entry: any) => entry.name === 'ptr-no-op').response;
  plan.AutoMigrate.token = `0x${Buffer.from(existingUpdateTokenDigest(target, before.program, updateProgram), 'hex').reverse().toString('hex')}`;
  const update = createPtrInitialOwnerUpdateInspection({ binding: bound, before, configuration: config,
    priorV10: f.observation.installedV10, candidateDefinition: JSON.parse(f.observation.installedV10.toString()), planBytes: bytes(plan) });
  const submission = { inspectionDigest: update.inspectionDigest, binding: update.binding,
    beforeProgram: update.before.program, submissionState: 'possibly-submitted' };
  const acknowledgement = { inspectionDigest: update.inspectionDigest, responseSha256: updateDigest('provider response'),
    response: 'fixed-target-update-success' };
  const installed = structuredClone(before); installed.program = updateProgram;
  const observation = { state: installed, configuration: config, installedV10: f.observation.installedV10 };
  const resolve = (overrides: Partial<{ bootstrap: any; update: any; submissionMarker: unknown; acknowledgementPresent: boolean;
    acknowledgementMarker: unknown; observation: any }> = {}) => assertPtrInitialAtlasUpdateContinuation({
      bootstrap: f.record, update, requestedInspectionDigest: update.inspectionDigest, submissionMarker: submission,
      acknowledgementPresent: true, acknowledgementMarker: acknowledgement, observation, ...overrides } as any);
  return { ...f, installedV9: f.observation.installedV9, update, bound, before, config, submission, acknowledgement, installed, observation, resolve };
}
function successiveSetup(mutate?: (before: any, configuration: any) => void) {
  const first = continuationSetup(), before = structuredClone(first.installed);
  const configuration = structuredClone(first.config);
  mutate?.(before, configuration);
  const candidateProgram = updateDigest('second post-bootstrap module');
  const binding = { ...first.bound, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), moduleTreeId: 'b'.repeat(40),
    candidateProgram, candidateSha256: updateDigest('second post-bootstrap bytes') };
  const plan = fixture('existing-update-plans-2.6.1.json').find((entry: any) => entry.name === 'ptr-no-op').response;
  plan.AutoMigrate.token = `0x${Buffer.from(existingUpdateTokenDigest(target, before.program, candidateProgram), 'hex').reverse().toString('hex')}`;
  const update = createPtrInitialOwnerUpdateInspection({ binding, before, configuration,
    priorV10: first.observation.installedV10, candidateDefinition: JSON.parse(first.observation.installedV10.toString()), planBytes: bytes(plan) });
  const priorUpdates = [{ update: first.update, requestedInspectionDigest: first.update.inspectionDigest,
    submissionMarker: first.submission, acknowledgementPresent: true, acknowledgementMarker: first.acknowledgement }];
  const input = { bootstrap: first.record, update, requestedInspectionDigest: update.inspectionDigest,
    submissionMarker: { inspectionDigest: update.inspectionDigest, binding: update.binding,
      beforeProgram: update.before.program, submissionState: 'possibly-submitted' }, acknowledgementPresent: true,
    acknowledgementMarker: { inspectionDigest: update.inspectionDigest, response: 'fixed-target-update-success',
      responseSha256: updateDigest('second response') }, priorUpdates,
    observation: { ...first.observation, state: { ...structuredClone(before), program: candidateProgram } } };
  return { first, input };
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
function controls(marker: any = { program: 'a'.repeat(64), release: 'b'.repeat(64) }) {
  const events: string[] = [], slots = new Map<string, unknown>();
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

describe('initial atlas protected targets', () => {
  it.each([undefined, '', 'invented', 'A'.repeat(64), target,
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'])('rejects invalid or overlapping G002 identity %s', value => {
    expect(() => ptrInitialAtlasTargets(value)).toThrow('PTR_INITIAL_OWNER_ATLAS_PROTECTED_TARGET_INVALID');
  });
  it('keeps the exact PTR target and a nonempty immutable G002 exclusion', () => {
    const targets = ptrInitialAtlasTargets('4'.repeat(64));
    expect(targets.databaseIdentity).toBe(target);
    expect(targets.disallowedDatabaseIdentities).toEqual(['4'.repeat(64)]);
    expect(Object.isFrozen(targets.disallowedDatabaseIdentities)).toBe(true);
  });
});

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
    const protectedDigest = ptrInitialAtlasConfirmation({ ...base, genesis002DatabaseIdentity: '4'.repeat(64) });
    expect(protectedDigest).not.toBe(digest);
    expect(ptrInitialAtlasConfirmation({ ...base, genesis002DatabaseIdentity: '5'.repeat(64) })).not.toBe(protectedDigest);
    expect(() => ptrInitialAtlasConfirmation({ ...base, genesis002DatabaseIdentity: target })).toThrow();
  });
});
describe('retained post-bootstrap PTR update continuation', () => {
  it('verifies two recorded updates and the final fresh installed observation', () => {
    const { input } = successiveSetup(), result = assertPtrInitialAtlasUpdateContinuation(input);
    expect(result).toMatchObject({ profile: 'warpkeep-ptr-initial-atlas-update-continuation-v2',
      installedProgram: input.update.binding.candidateProgram, installationProvenByReadback: true });
    expect(result.chain).toHaveLength(2);
    expect(() => ptrInitialAtlasImportMarker({ bootstrapInspection: input.bootstrap.inspectionDigest,
      binding: input.update.binding, atlasSourceCommit: 'c'.repeat(40), releaseSha256: 'd'.repeat(64), continuation: result })).not.toThrow();
  });
  it.each(['missing', 'duplicate', 'reversed', 'oversized', 'marker', 'ack', 'noAck', 'tool', 'rows', 'configuration', 'program'] as const)(
    'rejects a successive update chain with %s evidence', change => {
      const { input } = successiveSetup(), changed: any = structuredClone(input);
      if (change === 'missing') changed.priorUpdates = [];
      if (change === 'duplicate') changed.priorUpdates.push(changed.priorUpdates[0]);
      if (change === 'reversed') { const last = { ...changed }; changed.update = changed.priorUpdates[0].update;
        changed.requestedInspectionDigest = changed.update.inspectionDigest; changed.priorUpdates = [last]; }
      if (change === 'oversized') changed.priorUpdates = Array(16).fill(changed.priorUpdates[0]);
      if (change === 'marker') changed.priorUpdates[0].submissionMarker.beforeProgram = updateDigest('wrong');
      if (change === 'ack') changed.priorUpdates[0].acknowledgementMarker.inspectionDigest = updateDigest('wrong');
      if (change === 'noAck') { changed.priorUpdates[0].acknowledgementPresent = false; delete changed.priorUpdates[0].acknowledgementMarker; }
      if (change === 'tool') changed.priorUpdates[0].update.binding.cliDigest = updateDigest('wrong');
      if (change === 'rows') changed.update.before.tables[0].rowsDigest = updateDigest('wrong');
      if (change === 'configuration') changed.update.configuration.notificationDeliveryEnabled = false;
      if (change === 'program') changed.observation.state.program = updateDigest('wrong');
      expect(() => assertPtrInitialAtlasUpdateContinuation(changed)).toThrow();
    });
  it.each(['rows', 'configuration', 'owner', 'atlas'] as const)(
    'rejects a correctly sealed successor inspection with changed historical %s', change => {
      const { input } = successiveSetup((before, configuration) => {
        if (change === 'rows') before.tables[0].rowsDigest = updateDigest('changed historical rows');
        if (change === 'configuration') configuration.notificationDeliveryEnabled = false;
        if (change === 'owner') { before.owner = { state: 'disabled', enabled: false, authEpoch: 1 };
          const anchor = before.tables.find((table: any) => table.name === 'ptr_owner_anchor_v1');
          anchor.count = 1; anchor.rowsDigest = updateDigest('unexpected owner'); }
        if (change === 'atlas') before.atlas = { state: 'unrecognized' };
      });
      expect(() => assertPtrInitialAtlasUpdateContinuation(input)).toThrow();
    });
  it('retains the original single-update digest serialization', () => {
    const f = continuationSetup(), result = f.resolve();
    const facts = { profile: 'warpkeep-ptr-initial-atlas-update-continuation-v1',
      bootstrapInspectionDigest: f.record.inspectionDigest, updateInspectionDigest: f.update.inspectionDigest,
      predecessorProgram: f.before.program, installedProgram: f.update.binding.candidateProgram,
      installedSourceCommit: f.update.binding.sourceCommit, installedModuleSha256: f.update.binding.candidateSha256,
      submissionMarkerDigest: updateDigest(f.submission), acknowledgementPresent: true,
      acknowledgementDigest: updateDigest(f.acknowledgement) };
    expect(result.continuationDigest).toBe(updateDigest(facts));
  });

  it('resolves the exact update inspection and proves preserved pre-import rows/configuration', () => {
    const f = continuationSetup(), value = f.resolve();
    expect(value).toMatchObject({ binding: f.update.binding, continuationDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      installedProgram: f.update.binding.candidateProgram, installedSourceCommit: f.update.binding.sourceCommit,
      acknowledgementPresent: true, providerAckReceived: true, installationProvenByReadback: true,
      configurationDigest: updateDigest(f.config), productionAuthorized: false });
    expect(value).not.toHaveProperty('inspection');
    expect(JSON.stringify(value)).not.toContain(f.update.plan.token);
  });
  it('accepts a lost update ACK only with the real submission marker and records ACK absence explicitly', () => {
    const f = continuationSetup(), value = f.resolve({ acknowledgementPresent: false, acknowledgementMarker: undefined });
    expect(value).toMatchObject({ acknowledgementPresent: false, providerAckReceived: false, installationProvenByReadback: true,
      acknowledgementDigest: null });
    expect(() => f.resolve({ submissionMarker: undefined, acknowledgementPresent: false, acknowledgementMarker: undefined }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_SUBMISSION_INVALID');
    expect(() => f.resolve({ submissionMarker: { ...f.submission, submissionState: 'applied' }, acknowledgementPresent: false,
      acknowledgementMarker: undefined })).toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_SUBMISSION_INVALID');
  });
  it('requires two exact read-only update reconciliations before recovering a missing ACK', () => {
    const f = continuationSetup(), continuation = f.resolve({ acknowledgementPresent: false, acknowledgementMarker: undefined });
    const makeReconcileReceipt = (overrides: Record<string, unknown> = {}) => ({
      profile: 'warpkeep-ptr-initial-owner-update-operation-v1', command: 'reconcile',
      inspectionDigest: f.update.inspectionDigest, commandSucceeded: true, operationComplete: true,
      resolutionComplete: true, candidateInstallationObserved: true, sourcePreserved: true, cleanupCompleted: true,
      privateConfigurationObserved: true, acknowledgementReceived: false,
      result: { outcome: 'observed-preserved-candidate', candidateProgram: f.update.binding.candidateProgram,
        installedStateDigest: continuation.preservedRowsDigest, currentConfigurationDigest: continuation.configurationDigest,
        privateConfigurationPreservationObserved: true }, ...overrides });
    const first = makeReconcileReceipt(), second = makeReconcileReceipt();
    expect(assertPtrInitialAtlasUpdateReconciliationPair({ continuation, first, second })).toMatchObject({
      inspectionDigest: f.update.inspectionDigest, candidateProgram: f.update.binding.candidateProgram,
      installedStateDigest: continuation.preservedRowsDigest, currentConfigurationDigest: continuation.configurationDigest,
      reconciliationCount: 2, acknowledgementPresent: false, providerAckReceived: false, installationProvenByReadback: true });
    expect(() => assertPtrInitialAtlasUpdateReconciliationPair({ continuation, first,
      second: makeReconcileReceipt({ acknowledgementReceived: true }) }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_RECONCILIATION_INVALID');
    expect(() => assertPtrInitialAtlasUpdateReconciliationPair({ continuation, first,
      second: { ...second, result: { ...second.result, installedStateDigest: updateDigest('changed rows') } } }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_RECONCILIATION_CHANGED');
    expect(() => assertPtrInitialAtlasUpdateReconciliationPair({ continuation, first,
      second: { ...second, result: { ...second.result, currentConfigurationDigest: updateDigest('changed config') } } }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_RECONCILIATION_CHANGED');
    expect(() => assertPtrInitialAtlasUpdateReconciliationPair({ continuation, first,
      second: makeReconcileReceipt({ privateConfigurationObserved: false }) }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_RECONCILIATION_INVALID');
    expect(() => assertPtrInitialAtlasUpdateReconciliationPair({ continuation: f.resolve(), first, second }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_RECONCILIATION_INVALID');
  });
  it('rejects forged or mismatched ACK records while preserving the missing-ACK state as distinct', () => {
    const f = continuationSetup();
    expect(() => f.resolve({ acknowledgementMarker: { ...f.acknowledgement, responseSha256: 'bad' } }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_ACKNOWLEDGEMENT_INVALID');
    expect(() => f.resolve({ acknowledgementMarker: { ...f.acknowledgement, inspectionDigest: '0'.repeat(64) } }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_ACKNOWLEDGEMENT_INVALID');
    expect(() => f.resolve({ acknowledgementPresent: false, acknowledgementMarker: f.acknowledgement }))
      .toThrow('PTR_INITIAL_OWNER_ATLAS_UPDATE_CONTINUATION_ACKNOWLEDGEMENT_INVALID');
  });
  it.each(['program', 'schema', 'configuration', 'rows'] as const)('rejects update readback with a changed %s', change => {
    const f = continuationSetup(), state = structuredClone(f.installed), configuration = structuredClone(f.config);
    let installedV10 = f.observation.installedV10;
    if (change === 'program') state.program = updateDigest('wrong installed program');
    if (change === 'schema') installedV10 = bytes(fixture('ptr-artifact-description-2.6.1/first.json').V10.sections);
    if (change === 'configuration') configuration.notificationDeliveryEnabled = false;
    if (change === 'rows') state.tables[0]!.rowsDigest = updateDigest('changed pre-import row');
    expect(() => f.resolve({ observation: { state, configuration, installedV10 } })).toThrow();
  });
  it('binds source lineage into continuation, confirmation and the immutable import marker', () => {
    const f = continuationSetup(), otherSource = continuationSetup({ sourceCommit: 'a'.repeat(40) }), value = f.resolve(), other = otherSource.resolve();
    expect(value.continuationDigest).not.toBe(other.continuationDigest);
    const base = { bootstrapInspection: f.record.inspectionDigest, sourceCommit: 'b'.repeat(40),
      installedSourceCommit: f.update.binding.sourceCommit, program: f.update.binding.candidateProgram,
      releaseSha256: 'e'.repeat(64), atlasSourceCommit: 'f'.repeat(40) };
    const confirmation = ptrInitialAtlasConfirmation({ ...base, continuationDigest: value.continuationDigest });
    expect(ptrInitialAtlasConfirmation({ ...base, continuationDigest: other.continuationDigest })).not.toBe(confirmation);
    const marker = ptrInitialAtlasImportMarker({ bootstrapInspection: f.record.inspectionDigest, binding: f.update.binding,
      atlasSourceCommit: 'f'.repeat(40), releaseSha256: 'e'.repeat(64), continuation: value });
    expect(marker).toMatchObject({ profile: 'warpkeep-ptr-initial-atlas-possibly-submitted-v2',
      updateInspection: f.update.inspectionDigest, continuationDigest: value.continuationDigest,
      program: f.update.binding.candidateProgram, installedModuleSourceCommit: f.update.binding.sourceCommit,
      providerAckReceived: true });
    expect(() => ptrInitialAtlasImportMarker({ bootstrapInspection: f.record.inspectionDigest,
      binding: { ...f.update.binding, sourceCommit: '0'.repeat(40) }, atlasSourceCommit: 'f'.repeat(40),
      releaseSha256: 'e'.repeat(64), continuation: value })).toThrow('PTR_INITIAL_OWNER_ATLAS_IMPORT_MARKER_CONTINUATION_INVALID');
  });
  it('uses resolved module/schema/owner/atlas checks after import, allowing legitimate table mutations', () => {
    const f = continuationSetup(), postImport = structuredClone(f.installed);
    postImport.atlas = { state: 'ready' };
    postImport.tables[1]!.count++;
    postImport.tables[1]!.rowsDigest = updateDigest('legitimate atlas-imported rows');
    const observed = assertPtrInitialAtlasObservation(f.record,
      { state: postImport, installedV9: f.installedV9, installedV10: f.observation.installedV10 }, f.update.binding);
    expect(observed).toMatchObject({ candidateProgram: f.update.binding.candidateProgram, atlas: { state: 'ready' },
      preBootstrapRowEqualityObserved: false, productionAuthorized: false });
    expect(() => f.resolve({ observation: { ...f.observation, state: postImport } })).toThrow();
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
  it('reconciles continuation-bound imports without resubmitting after a retained marker exists', async () => {
    const f = continuationSetup(), resolved = f.resolve(), marker = ptrInitialAtlasImportMarker({
      bootstrapInspection: f.record.inspectionDigest, binding: f.update.binding, atlasSourceCommit: 'f'.repeat(40),
      releaseSha256: 'e'.repeat(64), continuation: resolved }), o = controls(marker);
    expect(await coordinatePtrInitialAtlasImport(o.input)).toEqual(receipt());
    expect(o.journal.read('submission', updateDigest(marker)).value).toEqual(marker);
    await expect(coordinatePtrInitialAtlasImport(o.input)).rejects.toThrow('IMPORT_SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY');
    expect(await coordinatePtrInitialAtlasImport({ ...o.input, command: 'reconcile-import' })).toEqual(receipt());
    expect(o.execute).toHaveBeenCalledTimes(1);
  });
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

describe('once-only staged continuation provenance', () => {
  function recoveryControls() {
    const f = controls(), key = updateDigest(f.marker);
    f.journal.write('submission', key, f.marker); f.events.length = 0;
    return { ...f, recoveryInput: { ...f.input, recovery: { sourceCommit: 'c'.repeat(40), stagedStatusDigest: 'd'.repeat(64) } } };
  }
  it('persists recovery before reducers and genuine provenance before the original completion ACK', async () => {
    const f = recoveryControls(), result = await coordinatePtrInitialAtlasRecovery(f.recoveryInput);
    expect(result.importReceiptDigest).toBe(receipt().importReceiptDigest);
    expect(f.events).toEqual(['submission:fsynced', 'reducer', 'acknowledgement:fsynced', 'acknowledgement:fsynced']);
    expect(f.journal.read('submission', updateDigest(f.marker)).value).toEqual(f.marker);
    expect(f.journal.read('acknowledgement', ptrInitialAtlasRecoveryKey(f.marker)).value).toMatchObject({
      originalMarkerDigest: updateDigest(f.marker), recoveryDigest: updateDigest(f.recoveryInput.recovery), receiptJson: JSON.stringify(receipt()) });
    const retained = await coordinatePtrInitialAtlasImport({ ...f.input, command: 'reconcile-import' });
    expect(retained).toEqual(result);
  });
  it('retains both markers without completion after ambiguous continuation and rejects another source checkpoint', async () => {
    const f = recoveryControls(), execute = vi.fn(async (beforeSend: () => void) => { beforeSend(); throw new Error('ambiguous'); });
    await expect(coordinatePtrInitialAtlasRecovery({ ...f.recoveryInput, execute })).rejects.toThrow('ambiguous');
    expect(f.slots.size).toBe(2);
    await expect(coordinatePtrInitialAtlasRecovery({ ...f.recoveryInput, recovery: { sourceCommit: 'e'.repeat(40) } }))
      .rejects.toThrow('RECOVERY_ALREADY_MARKED_RECONCILE_ONLY');
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('never submits if durable marker persistence fails', async () => {
    const f = recoveryControls(); f.journal.write = () => { throw new Error('fsync failed'); };
    await expect(coordinatePtrInitialAtlasRecovery(f.recoveryInput)).rejects.toThrow('fsync failed');
    expect(f.events).toEqual([]);
  });
  it('cannot acknowledge a fabricated continuation receipt', async () => {
    const f = recoveryControls(), execute = async (beforeSend: () => void) => { beforeSend(); return { ...receipt(), importReceiptDigest: '0'.repeat(64) }; };
    await expect(coordinatePtrInitialAtlasRecovery({ ...f.recoveryInput, execute })).rejects.toThrow('invalid receipt');
    expect(f.slots.size).toBe(2);
  });
  it('requires the original retained submission and refuses completed imports', async () => {
    const f = recoveryControls(); f.slots.clear();
    await expect(coordinatePtrInitialAtlasRecovery(f.recoveryInput)).rejects.toThrow('RECOVERY_ORIGINAL_MARKER_DIFFERENT');
    expect(f.execute).not.toHaveBeenCalled();
  });
});

describe('retained recovery completion integrity', () => {
  it('rejects a changed recovery marker after executor completion before acknowledging anything', async () => {
    const f = controls(), original = updateDigest(f.marker), recovery = { checkpoint: 'first' };
    f.journal.write('submission', original, f.marker); f.events.length = 0;
    await expect(coordinatePtrInitialAtlasRecovery({ ...f.input, recovery, execute: async beforeSend => {
      beforeSend(); f.slots.set(`submission:${ptrInitialAtlasRecoveryKey(f.marker)}`, { checkpoint: 'changed' }); return receipt();
    } })).rejects.toThrow('RECOVERY_MARKER_DIFFERENT');
    expect(f.slots.size).toBe(2);
  });
  it('requires exact recovery provenance when reconciling its original completion ACK', async () => {
    const f = controls(), original = updateDigest(f.marker), recovery = { checkpoint: 'first' };
    f.journal.write('submission', original, f.marker);
    await coordinatePtrInitialAtlasRecovery({ ...f.input, recovery });
    f.slots.delete(`acknowledgement:${ptrInitialAtlasRecoveryKey(f.marker)}`);
    await expect(coordinatePtrInitialAtlasImport({ ...f.input, command: 'reconcile-import' })).rejects.toThrow('RECOVERY_COMPLETION_MISSING');
  });
});
