// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPtrBootstrapInspection, validatePtrBootstrapInspection, classifyPtrBootstrapAfter, performPtrBootstrapOnce,
  parsePtrBootstrapMetadata, PTR_BOOTSTRAP_TARGET as target, PTR_BOOTSTRAP_PROVIDER_OWNER as owner } from '../scripts/ptr-compatibility-bootstrap-core.mjs';
import { parsePtrUpdateDefinition } from '../scripts/ptr-update-definition-policy.mjs';
import { inspectPtrInitialOwnerState } from '../scripts/ptr-initial-owner-operator';
import { parseExistingOpaqueUpdatePlan, parseExistingUpdatePlan, parseExistingUpdateSchema,
  updateDigest } from '../scripts/sealed-realms-existing-update-protocol.mjs';

// Actual checked-in provider-format fixtures, combined with explicit synthetic operation controls.
// These are local parser/operator tests; neither this fixture nor its fake transport is production proof.
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const copy = <T>(value: T): T => structuredClone(value);
const fixture = (path: string) => JSON.parse(readFileSync(resolve('tests/fixtures', path), 'utf8'));
const section = (value: any, name: string) => value.sections.find((entry: any) => name in entry)[name];
function setup() {
  const candidate = fixture('ptr-artifact-description-2.6.1/first.json').V10, prior = copy(candidate);
  const tables = section(prior, 'Tables'), mappings = section(prior, 'ExplicitNames').entries;
  const removed = new Set(mappings.filter((entry: any) => entry.Table?.canonical_name.startsWith('gameplay04_')).map((entry: any) => entry.Table.source_name));
  const indexes = new Set(tables.filter((table: any) => removed.has(table.source_name)).flatMap((table: any) => table.indexes.flatMap((index: any) => [index.source_name.some, index.accessor_name.some].filter(Boolean))));
  section(prior, 'Tables').splice(0, tables.length, ...tables.filter((table: any) => !removed.has(table.source_name)));
  section(prior, 'ExplicitNames').entries = mappings.filter((entry: any) => entry.Table ? !removed.has(entry.Table.source_name) : !entry.Index || !indexes.has(entry.Index.source_name));
  section(prior, 'Schedules').splice(0, section(prior, 'Schedules').length, ...section(prior, 'Schedules').filter((entry: any) => !entry.table_name.startsWith('gameplay04_')));
  const priorV9 = bytes(fixture('existing-update-definitions-2.6.1/ptr.a.schema.json'));
  const installedV9 = bytes(fixture('existing-update-definitions-2.6.1/ptr.b.schema.json'));
  const metadata = { database_identity: { __identity__: `0x${target}` }, owner_identity: { __identity__: `0x${owner}` }, host_type: 'Js', initial_program: '9'.repeat(64) };
  const plan = fixture('existing-update-plans-2.6.1.json').find((entry: any) => entry.name === 'ptr-add-gameplay').response;
  const binding = { sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40), databaseIdentity: target,
    candidateProgram: updateDigest('candidate-program'), candidateSha256: updateDigest('candidate-bytes'),
    candidateDescriptionDigest: parsePtrUpdateDefinition(bytes(candidate)).fullDigest, moduleTreeId: '3'.repeat(40),
    dependencyClosureDigest: updateDigest('dependencies'), cliDigest: updateDigest('cli'), cliConfigDigest: updateDigest('config') };
  const input = () => ({ binding, metadataBytes: bytes(metadata), claimedProviderIdentity: owner, priorV9,
    priorV10: bytes(prior), candidateDefinition: candidate, planBytes: bytes(plan) });
  const record = createPtrBootstrapInspection(input());
  const schema = parseExistingUpdateSchema(installedV9);
  const state = { program: binding.candidateProgram, schemaDigest: schema.digest, definitionPolicy: schema.definitionPolicy,
    tables: schema.names.map(name => ({ name, count: name.startsWith('gameplay04_') ? 0 : 9,
      rowsDigest: name.startsWith('gameplay04_') ? updateDigest([]) : updateDigest(`observed:${name}`),
      schemaDigest: updateDigest(`result-schema:${name}`), installedTableSchemaDigest: schema.tableSchemas[name] })),
    owner: { state: 'unrecognized', enabled: null, authEpoch: null }, atlas: { state: 'unrecognized' } };
  const after = () => ({ state: copy(state), installedV9: Buffer.from(installedV9), installedV10: bytes(candidate) });
  return { prior, candidate, metadata, plan, binding, priorV9, input, record, state, after };
}
function operation(f: ReturnType<typeof setup>) {
  const events: string[] = [], slots = new Map<string, unknown>(); let puts = 0;
  const dependencies = { assert: () => { events.push('assert'); }, journal: {
    present: (kind: string, key: string) => slots.has(`${kind}:${key}`),
    write: (kind: string, key: string, value: unknown) => { const k = `${kind}:${key}`;
      if (slots.has(k)) throw new Error('exclusive'); slots.set(k, value); events.push(`${kind}:fsynced`); },
  }, observeBefore: async () => f.record, observeAfter: async () => f.after(),
  apply: async (_token: string, beforeSend: () => void) => { beforeSend(); puts++; events.push('PUT');
    return bytes({ Success: { domain: null, database_identity: target, op: 'updated' } }); } };
  return { dependencies, events, slots, puts: () => puts };
}

describe('separate PTR compatibility bootstrap observations', () => {
  it('keeps the real opaque token and unknown pre-program/rows without recomputing or inventing them', () => {
    const f = setup(); expect(f.record.programBefore).toBeNull(); expect(f.record.rowsBefore).toBeNull();
    expect(f.record.plan.token).toBe(f.plan.AutoMigrate.token); expect(f.record.transportPolicy).toBe('BreakClients');
    expect(f.record.preservation.addedTables).toHaveLength(7); expect(f.record.preRowEqualityObserved).toBe(false);
    expect(validatePtrBootstrapInspection(f.record)).toEqual(f.record);
  });
  it('does not interpret metadata initial_program as the current deployed program', () => {
    const f = setup(); f.metadata.initial_program = '7'.repeat(64); expect(createPtrBootstrapInspection(f.input()).programBefore).toBeNull();
  });
  it.each(['database', 'owner', 'claim', 'host'] as const)('rejects foreign metadata %s', change => {
    const f = setup(); if (change === 'database') f.metadata.database_identity.__identity__ = `0x${'4'.repeat(64)}`;
    if (change === 'owner') f.metadata.owner_identity.__identity__ = `0x${'4'.repeat(64)}`;
    if (change === 'host') f.metadata.host_type = 'Wasm';
    expect(() => parsePtrBootstrapMetadata(bytes(f.metadata), change === 'claim' ? '4'.repeat(64) : owner)).toThrow();
  });
  it.each(['index', 'constraint', 'type', 'schedule', 'table'] as const)('rejects changed old %s', change => {
    const f = setup(), table = section(f.candidate, 'Tables')[0];
    if (change === 'index') table.indexes.pop(); if (change === 'constraint') table.constraints.pop();
    if (change === 'type') section(f.candidate, 'Typespace').types[table.product_type_ref].Product.elements[0].algebraic_type = { Bool: [] };
    if (change === 'schedule') section(f.candidate, 'Schedules').push({ source_name: { some: 'changed' }, table_name: 'castle', schedule_at_col: 0, function_name: 'on_connect' });
    if (change === 'table') section(f.candidate, 'ExplicitNames').entries.find((entry: any) => entry.Table?.canonical_name === 'castle').Table.canonical_name = 'foreign';
    f.binding.candidateDescriptionDigest = parsePtrUpdateDefinition(bytes(f.candidate)).fullDigest;
    expect(() => createPtrBootstrapInspection(f.input())).toThrow();
  });
  it.each(['breaking', 'major', 'manual', 'token', 'deletion', 'public'] as const)('rejects unsafe %s plan', change => {
    const f = setup(); const plan: any = copy(f.plan);
    if (change === 'breaking') plan.AutoMigrate.break_clients = true; if (change === 'major') plan.AutoMigrate.major_version_upgrade = true;
    if (change === 'manual') { plan.ManualMigrate = { reason: 'manual', major_version_upgrade: false }; delete plan.AutoMigrate; }
    if (change === 'token') plan.AutoMigrate.token = 'invented';
    if (change === 'deletion') plan.AutoMigrate.migrate_plan += '▸ Deleted user table: castle\n';
    if (change === 'public') plan.AutoMigrate.migrate_plan = plan.AutoMigrate.migrate_plan.replace('(private)', '(public)');
    expect(() => createPtrBootstrapInspection({ ...f.input(), planBytes: bytes(plan) })).toThrow();
  });
  it('retains the legacy parser exact known predecessor token check', () => {
    const f = fixture('existing-update-plans-2.6.1.json').find((entry: any) => entry.name === 'ptr-add-gameplay');
    expect(parseExistingUpdatePlan(bytes(f.response), f.databaseIdentity, f.predecessorProgram, f.candidateProgram).token).toBe(f.response.AutoMigrate.token);
    const changed = copy(f.response); changed.AutoMigrate.token = '0x1';
    expect(() => parseExistingUpdatePlan(bytes(changed), f.databaseIdentity, f.predecessorProgram, f.candidateProgram)).toThrow();
    expect(parseExistingOpaqueUpdatePlan(bytes(changed)).token).toBe('0x1'); // Shape only, never authenticated authority.
  });
  it('accepts a full actual-format after snapshot without asserting old row equality or owner readiness', () => {
    const f = setup(), result = classifyPtrBootstrapAfter(f.record, f.after());
    expect(result.tableCount).toBe(31); expect(result.preRowEqualityObserved).toBe(false); expect(result.usableOwnerPtrVerified).toBe(false);
    expect(result.owner.state).toBe('unrecognized'); expect(result.retryAuthorized).toBe(false);
  });
  it.each(['program', 'missingTable', 'duplicateTable', 'newRows', 'oldSchema', 'missingOwner'] as const)('rejects incomplete/conflicting after %s', change => {
    const f = setup(), after = f.after();
    if (change === 'program') after.state.program = '5'.repeat(64); if (change === 'missingTable') after.state.tables.pop();
    if (change === 'duplicateTable') after.state.tables[1] = copy(after.state.tables[0]!);
    if (change === 'newRows') after.state.tables.find(row => row.name.startsWith('gameplay04_'))!.count++;
    if (change === 'oldSchema') after.state.tables[0]!.installedTableSchemaDigest = '5'.repeat(64);
    if (change === 'missingOwner') delete (after.state as any).owner;
    expect(() => classifyPtrBootstrapAfter(f.record, after)).toThrow();
  });
  it.each(['alpha-only', 'unavailable'] as const)('completes maintained private snapshots with %s bridge configuration without claiming owner readiness', async configurationMode => {
    const f = setup(), v9 = fixture('existing-update-definitions-2.6.1/ptr.b.schema.json'), buffers: Buffer[] = [];
    const sql = (schema: unknown, rows: unknown[]) => bytes([{ schema, rows, total_duration_micros: 1,
      stats: { rows_inserted: 0, rows_deleted: 0, rows_updated: 0 } }]);
    const observed = await inspectPtrInitialOwnerState({ assertSource: () => {}, configuration: async () => {
      if (configurationMode === 'unavailable') throw new Error('fixture missing current contract');
      return { profile: 'warpkeep-auth-v2', digest: 'c'.repeat(64), farcasterRpcEndpointRoleFingerprints: { primary: 'd'.repeat(64), secondary: 'e'.repeat(64) },
        notificationDeliveryEnabled: true, notificationTransportConfigured: true, notificationClientCount: 1,
        publicAuthEnabled: true, accessExpectedFidRequired: true, ptrEnabled: false, ptrSpacetimeDbDatabase: null, ptrAudience: null };
    }, request: async operation => {
      let body: Buffer;
      if (operation === 'program') body = sql({ elements: [{ name: { some: 'program_hash' }, algebraic_type: { U256: [] } }] }, [[`0x${Buffer.from(f.binding.candidateProgram, 'hex').reverse().toString('hex')}`]]);
      else if (operation === 'schema-v9') body = bytes(v9);
      else { const name = operation.slice('rows:'.length), table = v9.tables.find((row: any) => row.name === name);
        if (!table || !operation.startsWith('rows:')) throw new Error('unexpected fixed read');
        body = sql(v9.typespace.types[table.product_type_ref].Product, []); }
      buffers.push(body); return body;
    } });
    expect(observed.status).toBe('blocked'); expect(observed.blockers).toContain('BRIDGE_PTR_BINDING_NOT_READY');
    expect(observed.preservation.installedStateObservedEqual).toBe(true); expect(observed.after.tables).toHaveLength(31);
    const result = classifyPtrBootstrapAfter(f.record, { state: observed.after, installedV9: bytes(v9), installedV10: bytes(f.candidate) });
    expect(result.outcome).toBe('observed-bootstrap-candidate'); expect(result.usableOwnerPtrVerified).toBe(false);
    expect(result.owner.state).toBe('ownerless'); expect(result.atlas.state).toBe('absent');
    expect(buffers.every(body => body.every(value => value === 0))).toBe(true);
  });
});

describe('one-submission bootstrap coordinator used by the CLI', () => {
  it('requires two identical preflights and the fsynced marker before exactly one PUT', async () => {
    const f = setup(), o = operation(f); const value = await performPtrBootstrapOnce(o.dependencies);
    expect(o.puts()).toBe(1); expect(o.events.indexOf('submission:fsynced')).toBeLessThan(o.events.indexOf('PUT'));
    expect(value.acknowledgementReceived).toBe(true); expect(value.candidateInstallationObserved).toBe(true);
    expect(value.productionAuthorized).toBe(false); expect(value.preRowEqualityObserved).toBe(false);
  });
  it('refuses changed preflight before marker/PUT', async () => {
    const f = setup(), o = operation(f); let count = 0;
    o.dependencies.observeBefore = async () => { if (++count === 1) return f.record; const other = setup();
      other.plan.AutoMigrate.token = '0x1'; return createPtrBootstrapInspection(other.input()); };
    const value = await performPtrBootstrapOnce(o.dependencies); expect(value.error).toContain('PREFLIGHT_CHANGED'); expect(o.puts()).toBe(0);
  });
  it('retains a partial marker and never sends when durable marker persistence throws', async () => {
    const f = setup(), o = operation(f), write = o.dependencies.journal.write;
    o.dependencies.journal.write = (kind, key, value) => { write(kind, key, value); if (kind === 'submission') throw new Error('fsync failed'); };
    const value = await performPtrBootstrapOnce(o.dependencies); expect(o.puts()).toBe(0);
    expect(o.slots.has(`submission:${target}`)).toBe(true); expect(value.submissionSlotPresent).toBe(true);
    expect(value.submissionMarked).toBe(false); expect(value.submissionOutcome).toBe('uncertain'); expect(value.retryAuthorized).toBe(false);
    const second = await performPtrBootstrapOnce(o.dependencies); expect(second.error).toContain('RECONCILE_ONLY'); expect(o.puts()).toBe(0);
  });
  it('reconciles a lost acknowledgement read-only and preserves the original error', async () => {
    const f = setup(), o = operation(f);
    o.dependencies.apply = async (_token, beforeSend) => { beforeSend(); throw new Error('504'); };
    const value = await performPtrBootstrapOnce(o.dependencies); expect(value.acknowledgementError).not.toBeNull();
    expect(value.acknowledgementReceived).toBe(false); expect(value.candidateInstallationObserved).toBe(true); expect(value.retryAuthorized).toBe(false);
  });
  it('leaves a failed after-read uncertain and never replays the marked submission', async () => {
    const f = setup(), o = operation(f); o.dependencies.observeAfter = async () => { throw new Error('403'); };
    const value = await performPtrBootstrapOnce(o.dependencies); expect(value.submissionOutcome).toBe('uncertain'); expect(value.candidateInstallationObserved).toBe(false);
    await performPtrBootstrapOnce(o.dependencies); expect(o.puts()).toBe(1); expect(value.retryAuthorized).toBe(false);
  });
});
