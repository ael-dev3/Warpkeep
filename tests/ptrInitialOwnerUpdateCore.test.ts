// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PtrInitialOwnerUpdateSnapshot } from '../scripts/ptr-initial-owner-update-core.mjs';
import { PTR_INITIAL_OWNER_UPDATE_TARGET as target, createPtrInitialOwnerUpdateInspection as prepare,
  assertPtrInitialOwnerUpdatePreflight as preflight, classifyPtrInitialOwnerUpdateObservation as observe, assertPtrInitialOwnerUpdateCandidateSnapshot as historical } from '../scripts/ptr-initial-owner-update-core.mjs';
import { parsePtrUpdateDefinition } from '../scripts/ptr-update-definition-policy.mjs';
import { existingUpdateTokenDigest, updateDigest } from '../scripts/sealed-realms-existing-update-protocol.mjs';

// These are pure parser/preservation controls, never a production artifact or admission fixture.
const bytes = (x: unknown) => Buffer.from(JSON.stringify(x));
const copy = <T>(x: T): T => structuredClone(x);
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/ptr-artifact-description-2.6.1/first.json', import.meta.url), 'utf8')).V10;
const section = (value: any, name: string) => value.sections.find((entry: any) => name in entry)[name];
const names = (value: any): string[] => section(value, 'ExplicitNames').entries.filter((entry: any) => entry.Table)
  .map((entry: any) => entry.Table.canonical_name).sort();
const hash = (x: string) => updateDigest(x);
const program = hash('installed'), candidateProgram = hash('candidate');
function setup() {
  const candidate = fixture(), prior = copy(candidate);
  const tables = section(prior, 'Tables');
  const mappings = section(prior, 'ExplicitNames').entries;
  const removed = new Set(mappings.filter((entry: any) => entry.Table?.canonical_name.startsWith('gameplay04_'))
    .map((entry: any) => entry.Table.source_name));
  const removedIndexes = new Set(tables.filter((table: any) => removed.has(table.source_name)).flatMap((table: any) =>
    table.indexes.flatMap((index: any) => [index.source_name.some, index.accessor_name.some].filter(Boolean))));
  section(prior, 'Tables').splice(0, tables.length, ...tables.filter((table: any) => !removed.has(table.source_name)));
  section(prior, 'ExplicitNames').entries = mappings.filter((entry: any) => entry.Table
    ? !removed.has(entry.Table.source_name) : !entry.Index || !removedIndexes.has(entry.Index.source_name));
  section(prior, 'Schedules').splice(0, section(prior, 'Schedules').length,
    ...section(prior, 'Schedules').filter((schedule: any) => !schedule.table_name.startsWith('gameplay04_')));
  const bound = { sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40), databaseIdentity: target,
    candidateProgram, candidateSha256: hash('candidate-bytes'), candidateDescriptionDigest: parsePtrUpdateDefinition(bytes(candidate)).fullDigest,
    moduleTreeId: '3'.repeat(40), dependencyClosureDigest: hash('dependencies'), cliDigest: hash('cli'), cliConfigDigest: hash('private-config') };
  const config = { profile: 'warpkeep-auth-v2' as const, digest: hash('bridge-current'),
    farcasterRpcEndpointRoleFingerprints: { primary: hash('rpc-primary'), secondary: hash('rpc-secondary') },
    notificationDeliveryEnabled: true, notificationTransportConfigured: true, notificationClientCount: 1,
    publicAuthEnabled: true, accessExpectedFidRequired: false, ptrEnabled: false, ptrSpacetimeDbDatabase: null, ptrAudience: null };
  const before = { program, schemaDigest: hash('V9-before'), definitionPolicy: 'warpkeep-raw-module-v9-no-views-rls-defaults-v1' as const,
    tables: names(prior).map(name => ({ name, count: name === 'ptr_owner_anchor_v1' ? 1 : 2,
      rowsDigest: hash(`rows:${name}`), schemaDigest: hash(`result:${name}`),
      installedTableSchemaDigest: hash(`table:${name}`) })), owner: { state: 'enabled' as const, enabled: true as const, authEpoch: 7 },
    atlas: { state: 'ready' as const, verificationPhase: 'complete', importEpoch: '9', atlasSourceCommit: '4'.repeat(40),
      releaseDigest: hash('atlas-release'), fullImportStatusAuthority: false as const } };
  const plan = JSON.parse(readFileSync(new URL('./fixtures/existing-update-plans-2.6.1.json', import.meta.url), 'utf8'))
    .find((entry: any) => entry.name === 'ptr-add-gameplay').response;
  plan.AutoMigrate.token = `0x${Buffer.from(existingUpdateTokenDigest(target, program, candidateProgram), 'hex').reverse().toString('hex')}`;
  const record = prepare({ binding: bound, before, configuration: config, priorV10: bytes(prior), candidateDefinition: candidate, planBytes: bytes(plan) });
  const after = { ...copy(before), program: candidateProgram, schemaDigest: hash('V9-after'), tables: names(candidate).map(name =>
    copy(before.tables.find(table => table.name === name) ?? { name, count: 0, rowsDigest: updateDigest([]),
      schemaDigest: hash(`result:${name}`), installedTableSchemaDigest: hash(`table:${name}`) })) };
  return { prior, candidate, bound, config, before, plan, record, after };
}
describe('initial owner PTR pure update observations', () => {
  it('checks historical continuity without claiming live installation', () => {
    const f = setup();
    expect(historical(f.record, { state: f.after, configuration: f.config,
      installedDescriptionDigest: f.bound.candidateDescriptionDigest })).toEqual({
      historicalPreservationObserved: true, productionAuthorized: false,
      globalReleaseAuthority: false, installationProvenByReadback: false });
  });
  it.each(['rows', 'addedRows', 'configuration', 'description', 'program'] as const)(
    'rejects a historical successor with changed %s', change => {
      const f = setup(), state = copy(f.after), configuration = copy(f.config);
      let installedDescriptionDigest = f.bound.candidateDescriptionDigest;
      if (change === 'rows') state.tables.find(table => !table.name.startsWith('gameplay04_'))!.rowsDigest = hash('changed');
      if (change === 'addedRows') state.tables.find(table => table.name.startsWith('gameplay04_'))!.count = 1;
      if (change === 'configuration') configuration.notificationDeliveryEnabled = false;
      if (change === 'description') installedDescriptionDigest = hash('changed-definition');
      if (change === 'program') state.program = hash('changed-program');
      expect(() => historical(f.record, { state, configuration, installedDescriptionDigest })).toThrow();
    });

  it('compares actual inner V10 and preserves notification-enabled/PTR-disabled baseline without changing it', () => {
    const f = setup(); expect(f.record.preservation.addedTables).toHaveLength(7);
    expect(f.record.configuration!.notificationDeliveryEnabled).toBe(true);
    expect(f.record.configuration!.ptrEnabled).toBe(false);
    expect(f.record.productionAuthorized).toBe(false);
    expect(Object.isFrozen(f.record.before.tables)).toBe(true);
  });
  it('requires a freshly identical binding, rows/config, policy and full plan before submission', () => {
    const f = setup(); const observed = preflight(f.record, { binding: f.bound, state: f.before, configuration: f.config,
      priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(f.plan) });
    expect(observed.exactPreflightObserved).toBe(true); expect(observed.productionAuthorized).toBe(false);
  });
  it.each(['owner', 'rows', 'config', 'candidate', 'token'] as const)('refuses changed %s before submission', change => {
    const f = setup(); const before = copy(f.before), config = copy(f.config), bound = copy(f.bound), plan = copy(f.plan);
    if (change === 'owner') before.owner.authEpoch++;
    if (change === 'rows') before.tables[0]!.rowsDigest = hash('changed');
    if (change === 'config') config.notificationDeliveryEnabled = false;
    if (change === 'candidate') bound.candidateSha256 = hash('other-bundle');
    if (change === 'token') plan.AutoMigrate.token = '0x1';
    expect(() => preflight(f.record, { binding: bound, state: before, configuration: config,
      priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(plan) })).toThrow();
  });
  it('allows read-only installed-candidate reconciliation only with preserved old rows and empty additions', () => {
    const f = setup(); const value = observe(f.record, { state: f.after, configuration: f.config, installedV10: bytes(f.candidate) });
    expect(value.outcome).toBe('observed-preserved-candidate'); expect(value.retryAuthorized).toBe(false);
    expect(value.ownerAuthTokenVerified).toBe(false); expect(value.atomicDatabaseSnapshot).toBe(false);
  });
  it('never grants a retry or no-effect proof when the predecessor remains installed', () => {
    const f = setup(); const value = observe(f.record, { state: f.before, configuration: f.config, installedV10: bytes(f.prior) });
    expect(value).toMatchObject({ outcome: 'not-observed-applied', submissionOutcome: 'uncertain', retryAuthorized: false });
  });
  it.each(['oldRows', 'addedRows', 'ownerEpoch', 'atlas', 'notification', 'program', 'description'] as const)(
    'rejects installed %s conflict without asserting data loss', change => {
      const f = setup(); const after = copy(f.after), config = copy(f.config), candidate = copy(f.candidate);
      if (change === 'oldRows') after.tables.find(table => !table.name.startsWith('gameplay04_'))!.count++;
      if (change === 'addedRows') after.tables.find(table => table.name.startsWith('gameplay04_'))!.count++;
      if (change === 'ownerEpoch') after.owner.authEpoch++;
      if (change === 'atlas') after.atlas.importEpoch = '10';
      if (change === 'notification') config.notificationDeliveryEnabled = false;
      if (change === 'program') after.program = hash('unrelated-program');
      if (change === 'description') section(candidate, 'Reducers')[0].params.elements = [];
      expect(() => observe(f.record, { state: after, configuration: config, installedV10: bytes(candidate) })).toThrow();
    });
  it('rejects a V9 envelope or wrapped standalone V10 as a server V10 description', () => {
    const f = setup(); for (const raw of [{ typespace: {}, tables: [] }, { V10: f.prior }]) {
      expect(() => prepare({ binding: f.bound, before: f.before, configuration: f.config,
        priorV10: bytes(raw), candidateDefinition: f.candidate, planBytes: bytes(f.plan) })).toThrow();
    }
  });
  it('refuses a valid token/formatter that omits the actual additive table set', () => {
    const f = setup(); const plan = copy(f.plan);
    plan.AutoMigrate.migrate_plan = `${'━'.repeat(60)}\nDatabase Migration Plan\n${'━'.repeat(60)}\n\n`;
    expect(() => prepare({ binding: f.bound, before: f.before, configuration: f.config,
      priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(plan) })).toThrow('VISIBLE_PLAN_TABLE_SET_DIFFERENT');
  });
  it('binds the fixed PTR target and refuses caller-echoed authority', () => {
    const f = setup(); expect(() => prepare({ binding: { ...f.bound, databaseIdentity: 'f'.repeat(64) }, before: f.before,
      configuration: f.config, priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(f.plan) } as any)).toThrow();
    expect(() => observe({ ...f.record, productionAuthorized: true } as any,
      { state: f.after, configuration: f.config, installedV10: bytes(f.candidate) })).toThrow();
  });
  it('preserves ownerless/disabled/unready states and explicitly unknown config without inventing usable PTR', () => {
    const f = setup();
    for (const owner of [{ state: 'ownerless', enabled: false, authEpoch: null },
      { ...f.before.owner, enabled: false, state: 'disabled' }, { state: 'unrecognized', enabled: null, authEpoch: null }] as PtrInitialOwnerUpdateSnapshot['owner'][]) {
      const before = { ...copy(f.before), owner, atlas: { state: 'absent' as const } };
      if (owner.state === 'ownerless') before.tables.find(t => t.name === 'ptr_owner_anchor_v1')!.count = 0;
      const record = prepare({ binding: f.bound, before, configuration: null,
        priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(f.plan) });
      const after = { ...copy(f.after), owner, atlas: { state: 'absent' as const } };
      after.tables.find(t => t.name === 'ptr_owner_anchor_v1')!.count = before.tables.find(t => t.name === 'ptr_owner_anchor_v1')!.count;
      const observed = observe(record, { state: after, configuration: null, installedV10: bytes(f.candidate) });
      expect(record.configuration).toBeNull(); expect(observed.outcome).toBe('observed-preserved-candidate');
      expect(observed).toMatchObject({ usableOwnerPtrVerified: false, privateConfigurationPreservationObserved: false });
    }
    const record = prepare({ binding: f.bound, before: { ...f.before, atlas: { ...f.before.atlas, state: 'importing' } },
      configuration: f.config, priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(f.plan) });
    expect(record.before.atlas.state).toBe('importing');
  });
  it('records an observed bridge pointing elsewhere without redirecting the fixed backend update or claiming usable PTR', () => {
    const f = setup(); const config = { ...f.config, ptrEnabled: true, ptrSpacetimeDbDatabase: hash('other PTR'), ptrAudience: 'warpkeep-ptr-spacetimedb' as const };
    const record = prepare({ binding: f.bound, before: f.before, configuration: config,
      priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(f.plan) });
    expect(record.binding.databaseIdentity).toBe(target); expect(record.configuration!.ptrSpacetimeDbDatabase).toBe(hash('other PTR'));
    expect(observe(record, { state: f.after, configuration: config, installedV10: bytes(f.candidate) })).toMatchObject({ usableOwnerPtrVerified: false });
  });
  it('refuses an observed-to-unobserved configuration change, retaining uncertainty', () => {
    const f = setup(); expect(() => preflight(f.record, { binding: f.bound, state: f.before, configuration: null,
      priorV10: bytes(f.prior), candidateDefinition: f.candidate, planBytes: bytes(f.plan) })).toThrow('STATE_OR_CONFIG_CHANGED');
  });
  it('requires the genuine empty-row digest for added empty tables', () => {
    const f = setup(); f.after.tables.find(t => t.name.startsWith('gameplay04_'))!.rowsDigest = hash('not-empty');
    expect(() => observe(f.record, { state: f.after, configuration: f.config, installedV10: bytes(f.candidate) })).toThrow('ROWS_NOT_PRESERVED');
  });
});
