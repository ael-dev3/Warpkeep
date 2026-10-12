// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertPtrInitialAtlasImportedUpdateBoundary } from '../scripts/ptr-initial-atlas-update-boundary';
import { createPtrInitialOwnerUpdateInspection } from '../scripts/ptr-initial-owner-update-core.mjs';
import { parsePtrUpdateDefinition } from '../scripts/ptr-update-definition-policy.mjs';
import { existingUpdateTokenDigest, parseExistingUpdateSchema, updateDigest } from '../scripts/sealed-realms-existing-update-protocol.mjs';

// Synthetic sealed inspection and already-qualified prefix footprints exercise
// metadata continuity only. They do not stand in for package/audit qualification.
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/${name}`, 'utf8'));
function setup() {
  const candidate = fixture('ptr-artifact-description-2.6.1/first.json').V10;
  const schema = parseExistingUpdateSchema(bytes(fixture('existing-update-definitions-2.6.1/ptr.b.schema.json')));
  const target = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
  const binding = { sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40), databaseIdentity: target,
    candidateProgram: 'b'.repeat(64), candidateSha256: '3'.repeat(64),
    candidateDescriptionDigest: parsePtrUpdateDefinition(bytes(candidate)).fullDigest,
    moduleTreeId: '2'.repeat(40), dependencyClosureDigest: '4'.repeat(64), cliDigest: '5'.repeat(64), cliConfigDigest: '6'.repeat(64) };
  const before: any = { program: 'a'.repeat(64), schemaDigest: schema.digest, definitionPolicy: schema.definitionPolicy,
    tables: schema.names.map(name => ({ name, count: 0, rowsDigest: updateDigest([]),
      schemaDigest: updateDigest(`schema:${name}`), installedTableSchemaDigest: schema.tableSchemas[name] })),
    owner: { state: 'ownerless', enabled: false, authEpoch: null }, atlas: { state: 'absent' } };
  const configuration: any = { profile: 'warpkeep-auth-v2', digest: updateDigest('config'),
    farcasterRpcEndpointRoleFingerprints: { primary: '7'.repeat(64), secondary: '8'.repeat(64) },
    notificationDeliveryEnabled: true, notificationTransportConfigured: true, notificationClientCount: 1,
    publicAuthEnabled: true, accessExpectedFidRequired: false, ptrEnabled: true,
    ptrSpacetimeDbDatabase: target, ptrAudience: 'warpkeep-ptr-spacetimedb' };
  const seal = (binding: any, before: any, configuration: any) => {
    const plan = fixture('existing-update-plans-2.6.1.json').find((entry: any) => entry.name === 'ptr-no-op').response;
    plan.AutoMigrate.token = `0x${Buffer.from(existingUpdateTokenDigest(target, before.program, binding.candidateProgram), 'hex').reverse().toString('hex')}`;
    return createPtrInitialOwnerUpdateInspection({ binding, before, configuration,
      priorV10: bytes(candidate), candidateDefinition: candidate, planBytes: bytes(plan) });
  };
  const historicalUpdate = seal(binding, before, configuration);
  const prefixFacts: any = { profile: 'warpkeep-ptr-initial-atlas-verification-prefix-v1', atlasId: 'PTR_GREATER_REALM',
    expectedReleaseSha256: '9'.repeat(64), chunkCount: 1, cellCount: 2, slotCount: 1, resourceCount: 1,
    componentCount: 1, verificationPhase: 'cells', verificationCursor: 1, verificationDigest: 'd'.repeat(64),
    tableDigests: {}, providerWritesAttempted: false, completionProven: false };
  const prefix = { ...prefixFacts, digest: updateDigest(prefixFacts) };
  const counts: Record<string, number> = { admin_audit: 8, greater_realm_release_v1: 1,
    greater_realm_navigation_component_v1: 1, greater_realm_chunk_v1: 1, greater_realm_cell_v1: 2,
    greater_realm_castle_slot_v1: 1, greater_realm_resource_node_v1: 1 };
  const nextBefore = structuredClone(before); nextBefore.program = binding.candidateProgram;
  nextBefore.atlas = { state: 'verifying', verificationPhase: 'cells', importEpoch: '1', atlasSourceCommit: 'c'.repeat(40),
    releaseDigest: prefix.expectedReleaseSha256, fullImportStatusAuthority: false };
  for (const table of nextBefore.tables) if (Object.hasOwn(counts, table.name)) {
    table.count = counts[table.name]; table.rowsDigest = updateDigest(`imported:${table.name}`);
  }
  const nextBinding = { ...binding, candidateProgram: 'e'.repeat(64), candidateSha256: 'f'.repeat(64) };
  const currentUpdate = seal(nextBinding, nextBefore, configuration);
  const auditFacts: any = { profile: 'warpkeep-ptr-initial-atlas-import-audit-v1', atlasId: prefix.atlasId,
    rowCount: 8, firstId: '1', lastId: '8', componentCount: 1, regionCount: 6, chunkCount: 1,
    verificationCursor: 1, componentImportCalls: 1, verifyCalls: { components: 1, chunks: 1, cells: 1 },
    rowsDigest: 'd'.repeat(64), emptyHistoricalBaseline: true, providerWritesAttempted: false, receiptProven: false };
  const input = { historicalUpdate, currentUpdate, prefix, audit: { ...auditFacts, digest: updateDigest(auditFacts) },
    importedTables: currentUpdate.before.tables.filter(table => Object.hasOwn(counts, table.name)) };
  return { input, seal, nextBefore, nextBinding, configuration };
}
describe('qualified initial import between preserved module checkpoints', () => {
  it('admits only qualified imported footprints while keeping ordinary preservation strict', () => {
    const { input } = setup();
    expect(assertPtrInitialAtlasImportedUpdateBoundary(input)).toMatchObject({
      installationProvenByReadback: false, completionProven: false, providerWritesAttempted: false });
  });
  it.each(['other-rows', 'owner', 'program', 'configuration', 'schema', 'epoch', 'release'])(
    'rejects a correctly sealed successor with changed %s', kind => {
      const f = setup();
      if (kind === 'other-rows') f.nextBefore.tables.find((row: any) => row.name === 'ptr_owner_anchor_v1').rowsDigest = updateDigest('changed');
      if (kind === 'owner') {
        f.nextBefore.owner = { state: 'enabled', enabled: true, authEpoch: 1 };
        const anchor = f.nextBefore.tables.find((row: any) => row.name === 'ptr_owner_anchor_v1');
        anchor.count = 1; anchor.rowsDigest = updateDigest('unexpected owner');
      }
      if (kind === 'program') f.nextBefore.program = '0'.repeat(64);
      if (kind === 'configuration') f.configuration.notificationDeliveryEnabled = false;
      if (kind === 'schema') f.nextBefore.tables.find((row: any) => row.name === 'admin_audit').schemaDigest = '0'.repeat(64);
      if (kind === 'epoch') f.nextBefore.atlas.importEpoch = '2';
      if (kind === 'release') f.nextBefore.atlas.releaseDigest = '0'.repeat(64);
      const currentUpdate = f.seal(f.nextBinding, f.nextBefore, f.configuration);
      const importedTables = currentUpdate.before.tables.filter(table => f.input.importedTables.some(row => row.name === table.name));
      expect(() => assertPtrInitialAtlasImportedUpdateBoundary({ ...f.input, currentUpdate, importedTables })).toThrow();
    });
  it.each(['missing', 'duplicate', 'digest', 'count', 'prefix', 'audit'])(
    'rejects incomplete or changed qualified proof: %s', kind => {
      const { input } = setup(); const changed: any = structuredClone(input);
      if (kind === 'missing') changed.importedTables.pop();
      if (kind === 'duplicate') changed.importedTables[0] = changed.importedTables[1]!;
      if (kind === 'digest') changed.importedTables[0]!.rowsDigest = '0'.repeat(64);
      if (kind === 'count') changed.importedTables[0]!.count++;
      if (kind === 'prefix') changed.prefix.verificationCursor++;
      if (kind === 'audit') changed.audit.rowCount++;
      expect(() => assertPtrInitialAtlasImportedUpdateBoundary(changed)).toThrow();
    });
  it.each(['componentCount', 'chunkCount', 'verificationCursor', 'regionCount'])(
    'rejects a separately sealed audit proof for different %s', field => {
      const { input } = setup(); const changed: any = structuredClone(input);
      changed.audit[field]++;
      const { digest: _digest, ...facts } = changed.audit;
      changed.audit.digest = updateDigest(facts);
      expect(() => assertPtrInitialAtlasImportedUpdateBoundary(changed)).toThrow();
    });
});
