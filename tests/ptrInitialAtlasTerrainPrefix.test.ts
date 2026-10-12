import { describe, expect, it } from 'vitest';
import { Sha256, updateLengthFramedSha256 } from '../spacetimedb/ptr/src/sha256';
import { updateSha256 } from '../scripts/sealed-realms-existing-update-protocol.mjs';
import { verifyPtrInitialAtlasTerrainPrefix } from '../scripts/ptr-initial-atlas-terrain-prefix';
const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').replace(/([a-z])([0-9])/gu, '$1_$2').toLowerCase();
function fixture() {
  const cell: Record<string, unknown> = { cellKey: 'WATER:0:0', atlasCoordKey: 'A:0:0', releaseOrdinal: 0,
    atlasId: 'atlas', chunkHandle: 'chunk', regionId: 'WATER', localQ: 0, localR: 0, atlasQ: 0, atlasR: 0,
    tier: 1, passable: false, elevation: -1, slope: 0, aspect: 0, profileCurvature: 0, planCurvature: 0,
    geologicalBarrierBand: 0, biomeClass: 0, landformClass: 0, yieldClass: 0, movementCost: 0,
    sealedBoundaryMask: 0, hydroRegime: 0, hydroDepthClass: 0, hydroSurfaceMilli: 0, flowAccumulation: '0',
    bankVariant: 0, hydrologyRevision: 0, travelClass: 0, wetness: 0, exposure: 0, coastDistance: 0,
    freshwaterDistance: 0, temperature: 0, moisture: 0, habitatClass: 0, canopyBasisPoints: 0,
    groundcoverBasisPoints: 0, wildflowerBasisPoints: 0, featureClass: 0, ambienceClass: 0, presentationVariant: 0 };
  const payload = { schema: 'warpkeep.greater-realm.runtime-import-chunk.v1', publicReleaseId: 'release',
    chunkHandle: 'chunk', importOrdinal: 0, cells: [cell], apronCellKeys: [], lod1CellKeys: [cell.cellKey],
    lod2CellKeys: [cell.cellKey], lod3CellKeys: [cell.cellKey], castleSlots: [], resourceNodes: [],
    importBatches: { castleSlots: [], resourceNodes: [] }, sectionDigests: {
      cellsSha256: updateSha256(Buffer.from(`${JSON.stringify([cell])}\n`)),
      apronSha256: updateSha256(Buffer.from('[]\n')),
      lodSha256: updateSha256(Buffer.from(`${JSON.stringify({ lod1: [cell.cellKey], lod2: [cell.cellKey], lod3: [cell.cellKey] })}\n`)),
      castleSlotsSha256: updateSha256(Buffer.from('[]\n')), resourceNodesSha256: updateSha256(Buffer.from('[]\n')) } };
  const payloadJson = `${JSON.stringify(payload)}\n`, payloadSha256 = updateSha256(Buffer.from(payloadJson));
  const releaseHeaderJson = '{}\n';
  const hash = new Sha256().update('warpkeep.greater-realm.release.v1\n');
  updateLengthFramedSha256(hash, new TextEncoder().encode(releaseHeaderJson));
  updateLengthFramedSha256(hash, new TextEncoder().encode(payloadJson));
  const chunk = { chunkHandle: 'chunk', atlasId: 'atlas', chunkCoordKey: 'B:0:0', importOrdinal: 0,
    binQ: 0, binR: 0, firstCellOrdinal: 0, coreCellCount: 1, apronCellCount: 0, lod0CellCount: 1,
    lod1CellCount: 1, lod2CellCount: 1, lod3CellCount: 1, payloadSha256, payloadJson, importedAt: [1791703718701004] };
  const cellRow = Object.fromEntries(Object.entries(cell).map(([key, value]) => [snake(key), value]));
  for (const key of ['componentKey', 'ridgeId', 'hydroBodyId', 'hydroFlowDirection', 'routeParentDirection', 'routeDepth']) cellRow[snake(key)] = [1, []];
  return { atlasId: 'atlas', releaseHeaderJson, chunks: [{ payloadJson, payloadSha256 }],
    chunkRows: [Object.fromEntries(Object.entries(chunk).map(([key, value]) => [snake(key), value])) as Record<string, unknown>],
    cellRows: [cellRow], slotRows: [] as Record<string, unknown>[], resourceRows: [] as Record<string, unknown>[],
    release: { atlas_id: 'atlas', next_chunk_ordinal: 1, imported_passable_cell_count: 0, verification_digest: hash.serialize() } };
}
describe('retained terrain prefix', () => {
  it('accepts exact indexed SQL rows and serialized length-framed hash state', () => {
    const input = fixture(); input.cellRows[0]!.flow_accumulation = 0;
    expect(verifyPtrInitialAtlasTerrainPrefix(input)).toMatchObject({ chunkCount: 1, cellCount: 1 });
  });
  for (const key of Object.keys(fixture().cellRows[0]!)) it(`rejects changed indexed cell ${key}`, () => {
    const input = fixture(); input.cellRows[0]![key] = 'tampered';
    expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow('PTR_INITIAL_ATLAS_TERRAIN_PREFIX_DIFFERENT');
  });
  for (const key of Object.keys(fixture().chunkRows[0]!)) it(`rejects changed indexed chunk ${key}`, () => {
    const input = fixture(); input.chunkRows[0]![key] = 'tampered';
    expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
  });
  it.each(['cellRows', 'chunkRows', 'slotRows', 'resourceRows'] as const)('rejects extra %s', key => {
    const input = fixture(); input[key].push({ ...input.cellRows[0] });
    expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
  });
  it('rejects zero prefix and missing indexed cells', () => {
    const input = fixture(); input.chunkRows.length = 0; expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
    const other = fixture(); other.cellRows.length = 0; expect(() => verifyPtrInitialAtlasTerrainPrefix(other)).toThrow();
  });
  it.each(['next_chunk_ordinal', 'imported_passable_cell_count', 'verification_digest', 'atlas_id'] as const)('rejects changed release %s', key => {
    const input = fixture(); (input.release as Record<string, unknown>)[key] = 'wrong';
    expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
  });
  it.each(['passable', 'componentKey', 'castleSlots', 'resourceNodes'])('rejects nonwater authority %s even when payload hash is recomputed', key => {
    const input = fixture(); const payload = JSON.parse(input.chunks[0]!.payloadJson);
    if (key === 'passable') payload.cells[0].passable = true;
    else if (key === 'componentKey') payload.cells[0].componentKey = 'component';
    else payload[key].push({});
    input.chunks[0]!.payloadJson = `${JSON.stringify(payload)}\n`;
    input.chunks[0]!.payloadSha256 = updateSha256(Buffer.from(input.chunks[0]!.payloadJson));
    expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
  });
  it('accepts SATS some fields and canonical u64 above JavaScript precision', () => {
    const input = fixture(), payload = JSON.parse(input.chunks[0]!.payloadJson);
    payload.cells[0].ridgeId = 'ridge'; payload.cells[0].hydroFlowDirection = 2;
    payload.cells[0].flowAccumulation = '9007199254740993';
    input.cellRows[0]!.ridge_id = [0, 'ridge']; input.cellRows[0]!.hydro_flow_direction = [0, 2];
    input.cellRows[0]!.flow_accumulation = '9007199254740993';
    input.chunks[0]!.payloadJson = `${JSON.stringify(payload)}\n`;
    input.chunks[0]!.payloadSha256 = updateSha256(Buffer.from(input.chunks[0]!.payloadJson));
    input.chunkRows[0]!.payload_json = input.chunks[0]!.payloadJson;
    input.chunkRows[0]!.payload_sha_256 = input.chunks[0]!.payloadSha256;
    const hash = new Sha256().update('warpkeep.greater-realm.release.v1\n');
    updateLengthFramedSha256(hash, new TextEncoder().encode(input.releaseHeaderJson));
    updateLengthFramedSha256(hash, new TextEncoder().encode(input.chunks[0]!.payloadJson));
    input.release.verification_digest = hash.serialize();
    expect(verifyPtrInitialAtlasTerrainPrefix(input).cellCount).toBe(1);
  });
  it('rejects noncanonical u64, invalid SATS none and unexpected fields', () => {
    for (const edit of [(row: Record<string, unknown>) => { row.flow_accumulation = '00'; },
      (row: Record<string, unknown>) => { row.component_key = [1, [0]]; },
      (row: Record<string, unknown>) => { row.extra = 1; }]) {
      const input = fixture(); edit(input.cellRows[0]!); expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
    }
  });
});


it('rejects timestamps outside the backend signed-microsecond range', () => {
  const input = fixture(); input.chunkRows[0]!.imported_at = ['9223372036854775808'];
  expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
});


it('matches the actual SQL LOD field names with an underscore after the ordinal', () => {
  const input = fixture();
  const row = input.chunkRows[0]!;
  expect(Object.keys(row).filter(key => key.startsWith('lod_')).sort()).toEqual([
    'lod_0_cell_count', 'lod_1_cell_count', 'lod_2_cell_count', 'lod_3_cell_count',
  ]);
  expect(verifyPtrInitialAtlasTerrainPrefix(input).chunkCount).toBe(1);
  row.lod_0cell_count = row.lod_0_cell_count; delete row.lod_0_cell_count;
  expect(() => verifyPtrInitialAtlasTerrainPrefix(input)).toThrow();
});
