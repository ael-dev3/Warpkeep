// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ calls: [] as string[] }));
// These unit tests exercise proof comparison and private-memory wiring. Qualification
// with the retained accepted atlas must additionally run the real backend functions.
vi.mock('../spacetimedb/ptr/src/atlasAuthority', () => ({
  stageGreaterRealmReleaseV1: (ctx: any, input: any) => {
    backend.calls.push('stage'); ctx.db.greaterRealmReleaseV1.insert({ ...input,
      approvedAt: ctx.timestamp, stagedAt: ctx.timestamp, state: 'importing',
      verificationPhase: 'components', verificationCursor: 0n, verificationDigest: 'initial',
      verifiedComponentCount: 0, verifiedChunkCount: 0, verifiedCellCount: 0,
      regionVerificationJson: '[]\n' });
  },
  importGreaterRealmComponentsV1: (ctx: any, _atlas: string, _epoch: bigint, rows: any[]) => {
    backend.calls.push('components'); for (const row of rows)
      ctx.db.greaterRealmNavigationComponentV1.insert({ ...row, verifiedCellCount: 0, verificationDigest: 'initial-component',
        regionVerificationJson: '[]\n', active: false });
  },
  importGreaterRealmRegionsV1: () => backend.calls.push('regions'),
  importGreaterRealmChunkPayloadV1: (ctx: any, atlasId: string, _epoch: bigint, payloadSha256: string, payloadJson: string) => {
    backend.calls.push('chunk'); const payload = JSON.parse(payloadJson);
    ctx.db.greaterRealmChunkV1.insert({ chunkHandle: 'CHUNK', importOrdinal: 0, atlasId, payloadSha256, payloadJson, importedAt: ctx.timestamp });
    for (const row of payload.cells) ctx.db.greaterRealmCellV1.insert(row);
    for (const row of payload.slots) ctx.db.greaterRealmCastleSlotV1.insert(row);
    for (const row of payload.resources) ctx.db.greaterRealmResourceNodeV1.insert(row);
  },
  beginGreaterRealmVerificationV1: (ctx: any, atlasId: string) => {
    backend.calls.push('begin'); const release = ctx.db.greaterRealmReleaseV1.atlasId.find(atlasId);
    ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release, state: 'verifying' });
  },
  verifyGreaterRealmBatchV1: (ctx: any, atlasId: string, _epoch: bigint, requested: number) => {
    backend.calls.push('verify'); const release = ctx.db.greaterRealmReleaseV1.atlasId.find(atlasId);
    if (release.verificationPhase === 'components') ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release,
      verificationPhase: 'chunks', verifiedComponentCount: 1 });
    else if (release.verificationPhase === 'chunks') ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release,
      verificationPhase: 'cells', verifiedChunkCount: 1 });
    else {
      const end = Number(release.verificationCursor) + requested;
      ctx.db.greaterRealmReleaseV1.atlasId.update({ ...release, verificationCursor: BigInt(end), verifiedCellCount: end,
        verificationDigest: `verified:${end}`, regionVerificationJson: `regions:${end}` });
      const component = ctx.db.greaterRealmNavigationComponentV1.componentKey.find('COMPONENT');
      ctx.db.greaterRealmNavigationComponentV1.componentKey.update({ ...component, verifiedCellCount: end,
        verificationDigest: `component:${end}`, regionVerificationJson: `component-regions:${end}` });
    }
  },
}));
import { verifyPtrInitialAtlasVerificationPrefix, type PtrInitialAtlasVerificationPrefixInput } from '../scripts/ptr-initial-atlas-verification-prefix';
beforeEach(() => { backend.calls.length = 0; });
const option = (value: unknown) => value === undefined ? [1, []] : [0, value];
function fixture(): PtrInitialAtlasVerificationPrefixInput {
  const releaseInput = { atlasId: 'PTR_GREATER_REALM', importEpoch: 1n,
    expectedCellCount: 3, expectedChunkCount: 1, expectedComponentCount: 1, expectedReleaseSha256: 'a'.repeat(64) } as any;
  const cells = Array.from({ length: 3 }, (_, releaseOrdinal) => ({ cellKey: `CELL:${releaseOrdinal}`,
    atlasCoordKey: `A:${releaseOrdinal}:0`, releaseOrdinal, atlasId: releaseInput.atlasId, chunkHandle: 'CHUNK',
    componentKey: 'COMPONENT', flowAccumulation: '0', passable: true }));
  const slots = [{ slotId: 'SLOT', releaseOrdinal: 0, cellKey: 'CELL:0', componentKey: 'COMPONENT', active: false }];
  const resources = [{ nodeId: 'NODE', releaseOrdinal: 0, cellKey: 'CELL:1', locationId: 'LOCATION', componentKey: 'COMPONENT', active: false }];
  const payloadJson = JSON.stringify({ cells, slots, resources });
  return { releaseInput, releaseHeaderJson: '{}\n', components: [{ componentKey: 'COMPONENT', componentOrdinal: 0 } as any], regions: [],
    chunks: [{ payloadJson, payloadSha256: 'b'.repeat(64) }],
    release: { atlas_id: releaseInput.atlasId, import_epoch: '1', expected_cell_count: 3, expected_chunk_count: 1,
      expected_component_count: 1, expected_release_sha_256: 'a'.repeat(64), approved_at: ['123'], staged_at: ['123'],
      state: 'verifying', verification_phase: 'cells', verification_cursor: '1', verification_digest: 'verified:1',
      verified_component_count: 1, verified_chunk_count: 1, verified_cell_count: 1, region_verification_json: 'regions:1',
      public_name: option(undefined), region_manifest_json: option(undefined), legacy_transform_rotation: option(undefined),
      legacy_transform_offset_q: option(undefined), legacy_transform_offset_r: option(undefined), ready_at: option(undefined) },
    componentRows: [{ component_key: 'COMPONENT', component_ordinal: 0, verified_cell_count: 1,
      verification_digest: 'component:1', region_verification_json: 'component-regions:1', active: false }],
    chunkRows: [{ chunk_handle: 'CHUNK', import_ordinal: 0, atlas_id: releaseInput.atlasId, payload_sha_256: 'b'.repeat(64),
      payload_json: payloadJson, imported_at: ['124'] }],
    cellRows: cells.map(row => ({ cell_key: row.cellKey, atlas_coord_key: row.atlasCoordKey,
      release_ordinal: row.releaseOrdinal, atlas_id: row.atlasId, chunk_handle: row.chunkHandle,
      component_key: option(row.componentKey), flow_accumulation: row.flowAccumulation, passable: row.passable,
      ridge_id: option(undefined), hydro_body_id: option(undefined), hydro_flow_direction: option(undefined),
      route_parent_direction: option(undefined), route_depth: option(undefined) })),
    slotRows: [{ slot_id: 'SLOT', release_ordinal: 0, cell_key: 'CELL:0', component_key: 'COMPONENT', active: false, legacy_slot_id: option(undefined) }],
    resourceRows: [{ node_id: 'NODE', release_ordinal: 0, cell_key: 'CELL:1', location_id: 'LOCATION', component_key: 'COMPONENT', active: false,
      legacy_catalog_id: option(undefined) }],
    emptyBoundaryCounts: { greater_realm_activation_v1: 0, greater_realm_castle_claim_v1: 0, greater_realm_cell_occupancy_v1: 0,
      realm_atlas_v1: 0, realm_atlas_visible_region_v1: 0, realm_worker_system_v2: 0 } };
}
describe('verification-prefix proof private-memory boundary', () => {
  it('replays imports and preceding verification phases, compares all tables and proves no completion', () => {
    const input = fixture(), before = JSON.stringify(input, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
    const proof = verifyPtrInitialAtlasVerificationPrefix(input);
    expect(proof).toMatchObject({ verificationPhase: 'cells', verificationCursor: 1, chunkCount: 1,
      cellCount: 3, slotCount: 1, resourceCount: 1, providerWritesAttempted: false, completionProven: false });
    expect(backend.calls).toEqual(['stage', 'components', 'regions', 'chunk', 'begin', 'verify', 'verify', 'verify']);
    expect(proof.digest).toMatch(/^[a-f0-9]{64}$/); expect(Object.keys(proof.tableDigests)).toHaveLength(6);
    expect(JSON.stringify(input, (_key, value) => typeof value === 'bigint' ? value.toString() : value)).toBe(before);
  });
  it.each(['release-digest', 'release-counter', 'region-accumulator', 'component-digest', 'component-counter',
    'component-region', 'cell', 'slot', 'resource', 'payload', 'extra-column', 'missing-cell', 'duplicate-cell', 'missing-slot', 'missing-resource'])
    ('rejects altered complete evidence: %s', mode => {
      const input = fixture() as any;
      if (mode === 'release-digest') input.release.verification_digest = 'forged';
      if (mode === 'release-counter') input.release.verified_cell_count = 2;
      if (mode === 'region-accumulator') input.release.region_verification_json = 'forged';
      if (mode === 'component-digest') input.componentRows[0].verification_digest = 'forged';
      if (mode === 'component-counter') input.componentRows[0].verified_cell_count = 2;
      if (mode === 'component-region') input.componentRows[0].region_verification_json = 'forged';
      if (mode === 'cell') input.cellRows[2].passable = false;
      if (mode === 'slot') input.slotRows[0].active = true;
      if (mode === 'resource') input.resourceRows[0].location_id = 'OTHER';
      if (mode === 'payload') input.chunkRows[0].payload_json += ' ';
      if (mode === 'extra-column') input.cellRows[0].unexpected = 1;
      if (mode === 'missing-cell') input.cellRows.pop();
      if (mode === 'duplicate-cell') input.cellRows[2] = input.cellRows[0];
      if (mode === 'missing-slot') input.slotRows.pop();
      if (mode === 'missing-resource') input.resourceRows.pop();
      expect(() => verifyPtrInitialAtlasVerificationPrefix(input)).toThrow('PTR_INITIAL_ATLAS_VERIFICATION_PREFIX_DIFFERENT');
    });
  it.each(['ready', 'importing', 'phase', 'cursor-zero', 'cursor-complete', 'activation', 'missing-boundary', 'timestamp'])
    ('rejects unsupported admission: %s', mode => {
      const input = fixture() as any;
      if (mode === 'ready' || mode === 'importing') input.release.state = mode;
      if (mode === 'phase') input.release.verification_phase = 'slots';
      if (mode === 'cursor-zero') input.release.verification_cursor = '0';
      if (mode === 'cursor-complete') input.release.verification_cursor = '3';
      if (mode === 'activation') input.emptyBoundaryCounts.greater_realm_activation_v1 = 1;
      if (mode === 'missing-boundary') delete input.emptyBoundaryCounts.realm_atlas_v1;
      if (mode === 'timestamp') input.release.staged_at = ['-1'];
      expect(() => verifyPtrInitialAtlasVerificationPrefix(input)).toThrow('PTR_INITIAL_ATLAS_VERIFICATION_PREFIX_DIFFERENT');
      expect(backend.calls).toEqual([]);
    });
  it('rejects an imported timestamp preceding staging before local chunk replay', () => {
    const input = fixture() as any; input.chunkRows[0].imported_at = ['122'];
    expect(() => verifyPtrInitialAtlasVerificationPrefix(input)).toThrow('PTR_INITIAL_ATLAS_VERIFICATION_PREFIX_DIFFERENT');
    expect(backend.calls).not.toContain('chunk');
  });
});
