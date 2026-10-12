import { Sha256, updateLengthFramedSha256 } from '../spacetimedb/ptr/src/sha256';
import { updateCanonical, updateDigest, updateSha256 } from './sealed-realms-existing-update-protocol.mjs';

type Row = Readonly<Record<string, unknown>>;
const fail = (): never => { throw Object.assign(new Error('PTR_INITIAL_ATLAS_TERRAIN_PREFIX_DIFFERENT'),
  { code: 'PTR_INITIAL_ATLAS_TERRAIN_PREFIX_DIFFERENT' }); };
const sqlName = (name: string) => name.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').replace(/([a-z])([0-9])/gu, '$1_$2').toLowerCase();
const optionKeys = ['componentKey', 'ridgeId', 'hydroBodyId', 'hydroFlowDirection', 'routeParentDirection', 'routeDepth'];
const cellKeys = ('cellKey atlasCoordKey releaseOrdinal atlasId chunkHandle regionId componentKey localQ localR atlasQ atlasR tier passable elevation slope aspect profileCurvature planCurvature ridgeId geologicalBarrierBand biomeClass landformClass yieldClass movementCost sealedBoundaryMask hydroRegime hydroBodyId hydroDepthClass hydroSurfaceMilli hydroFlowDirection flowAccumulation bankVariant hydrologyRevision routeParentDirection routeDepth travelClass wetness exposure coastDistance freshwaterDistance temperature moisture habitatClass canopyBasisPoints groundcoverBasisPoints wildflowerBasisPoints featureClass ambienceClass presentationVariant').split(' ');
const decimal = (value: unknown): string => {
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || value < 0) fail(); value = String(value); }
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/u.test(value) || BigInt(value) > (1n << 64n) - 1n) fail();
  return value as string;
};
function equalRow(actual: Row, expected: Row) {
  const normalized = { ...actual };
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === 'number') {
      if (typeof normalized[key] === 'string' && /^-?(?:0|[1-9][0-9]*)$/u.test(normalized[key] as string)) normalized[key] = Number(normalized[key]);
      if (!Number.isSafeInteger(normalized[key])) fail();
    }
    if (key === 'flow_accumulation') normalized[key] = decimal(normalized[key]);
  }
  if (updateCanonical(normalized) !== updateCanonical(expected)) fail();
}

/** Read-only admission for the retained water-only import prefix; never a completion proof. */
export function verifyPtrInitialAtlasTerrainPrefix(input: Readonly<{
  chunkRows: readonly Row[]; cellRows: readonly Row[]; slotRows: readonly Row[]; resourceRows: readonly Row[];
  release: Row; atlasId: string; releaseHeaderJson: string;
  chunks: readonly Readonly<{ payloadJson: string; payloadSha256: string }>[];
}>) {
  const count = input.chunkRows.length;
  if (count < 1 || count > input.chunks.length || input.slotRows.length !== 0 || input.resourceRows.length !== 0
    || input.release.atlas_id !== input.atlasId || decimal(input.release.next_chunk_ordinal) !== String(count)
    || decimal(input.release.imported_passable_cell_count) !== '0') fail();
  const hash = new Sha256().update('warpkeep.greater-realm.release.v1\n');
  updateLengthFramedSha256(hash, new TextEncoder().encode(input.releaseHeaderJson));
  const initialVerificationDigest = hash.serialize();
  const ordered = [...input.chunkRows].sort((a, b) => Number(a.import_ordinal) - Number(b.import_ordinal));
  const expectedCells: Row[] = [];
  for (let index = 0; index < count; index++) {
    const artifact = input.chunks[index]!;
    if (!/^[a-f0-9]{64}$/u.test(artifact.payloadSha256) || updateSha256(Buffer.from(artifact.payloadJson)) !== artifact.payloadSha256) fail();
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(artifact.payloadJson); } catch { fail(); }
    if (!payload! || typeof payload! !== 'object' || Array.isArray(payload!) || `${JSON.stringify(payload!)}\n` !== artifact.payloadJson || payload!.schema !== 'warpkeep.greater-realm.runtime-import-chunk.v1'
      || payload!.importOrdinal !== index || !Array.isArray(payload!.cells) || payload!.cells.length === 0
      || !Array.isArray(payload!.castleSlots) || payload!.castleSlots.length !== 0
      || !Array.isArray(payload!.resourceNodes) || payload!.resourceNodes.length !== 0) fail();
    for (const key of ['apronCellKeys', 'lod1CellKeys', 'lod2CellKeys', 'lod3CellKeys']) if (!Array.isArray(payload![key])) fail();
    const cells = payload!.cells as Row[];
    for (const cell of cells) {
      if (!cell || typeof cell !== 'object' || Array.isArray(cell) || cell.passable !== false || Object.hasOwn(cell, 'componentKey') || cell.atlasId !== input.atlasId
        || cell.chunkHandle !== payload!.chunkHandle || cell.releaseOrdinal !== expectedCells.length
        || Object.keys(cell).some(key => !cellKeys.includes(key))) fail();
      const expected: Record<string, unknown> = {};
      for (const key of cellKeys) {
        if (optionKeys.includes(key)) expected[sqlName(key)] = Object.hasOwn(cell, key) ? [0, cell[key]] : [1, []];
        else { if (!Object.hasOwn(cell, key)) fail(); expected[sqlName(key)] = key === 'flowAccumulation' ? decimal(cell[key]) : cell[key]; }
      }
      expectedCells.push(expected);
    }
    const first = cells[0]!;
    if (!Number.isSafeInteger(first.atlasQ) || !Number.isSafeInteger(first.atlasR)) fail();
    const binQ = Math.floor(Number(first.atlasQ) / 15), binR = Math.floor(Number(first.atlasR) / 15);
    if (cells.some(cell => Math.floor(Number(cell.atlasQ) / 15) !== binQ || Math.floor(Number(cell.atlasR) / 15) !== binR)) fail();
    const expected: Record<string, unknown> = { chunkHandle: payload!.chunkHandle, atlasId: input.atlasId,
      chunkCoordKey: `B:${binQ}:${binR}`, importOrdinal: index, binQ, binR, firstCellOrdinal: first.releaseOrdinal,
      coreCellCount: cells.length, apronCellCount: (payload!.apronCellKeys as unknown[]).length, lod0CellCount: cells.length,
      lod1CellCount: (payload!.lod1CellKeys as unknown[]).length, lod2CellCount: (payload!.lod2CellKeys as unknown[]).length,
      lod3CellCount: (payload!.lod3CellKeys as unknown[]).length, payloadSha256: artifact.payloadSha256, payloadJson: artifact.payloadJson };
    const actual = { ...ordered[index] };
    const timestamp = actual.imported_at;
    if (!Array.isArray(timestamp) || timestamp.length !== 1 || decimal(timestamp[0]) === '0' || BigInt(decimal(timestamp[0])) > (1n << 63n) - 1n) fail();
    delete actual.imported_at;
    equalRow(actual, Object.fromEntries(Object.entries(expected).map(([key, value]) => [sqlName(key), value])));
    updateLengthFramedSha256(hash, new TextEncoder().encode(artifact.payloadJson));
  }
  const cells = [...input.cellRows].sort((a, b) => Number(a.release_ordinal) - Number(b.release_ordinal));
  if (cells.length !== expectedCells.length) fail();
  cells.forEach((row, index) => equalRow(row, expectedCells[index]!));
  const verificationDigest = hash.serialize();
  if (input.release.verification_digest !== verificationDigest) fail();
  return Object.freeze({ chunkCount: count, cellCount: expectedCells.length,
    digest: updateDigest({ chunkRows: ordered, cellRows: cells, verificationDigest, initialVerificationDigest }),
    verificationDigest, initialVerificationDigest });
}
