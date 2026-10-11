import {
  stageGreaterRealmReleaseV1, importGreaterRealmComponentsV1, importGreaterRealmRegionsV1,
  importGreaterRealmChunkPayloadV1, beginGreaterRealmVerificationV1, verifyGreaterRealmBatchV1,
  type GreaterRealmRegionImportV1,
} from '../spacetimedb/ptr/src/atlasAuthority';
import { GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS, GREATER_REALM_MAX_VERIFY_ROWS,
  type GreaterRealmReleaseInputV1, type GreaterRealmComponentInputV1 } from '../spacetimedb/ptr/src/atlasPolicy';
import type { PtrContext } from '../spacetimedb/ptr/src/context';
import { updateCanonical, updateDigest } from './sealed-realms-existing-update-protocol.mjs';

type Row = Readonly<Record<string, unknown>>;
const BOUNDARIES = ['greater_realm_activation_v1', 'greater_realm_castle_claim_v1',
  'greater_realm_cell_occupancy_v1', 'realm_atlas_v1', 'realm_atlas_visible_region_v1', 'realm_worker_system_v2'] as const;
function fail(): never { throw Object.assign(new Error('PTR_INITIAL_ATLAS_VERIFICATION_PREFIX_DIFFERENT'),
  { code: 'PTR_INITIAL_ATLAS_VERIFICATION_PREFIX_DIFFERENT' }); }
const sqlName = (name: string) => name.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').replace(/([a-z])([0-9])/gu, '$1_$2').toLowerCase();
function decimal(value: unknown, maximum = (1n << 64n) - 1n): bigint {
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail(); value = String(value); }
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) fail();
  const result = BigInt(value); if (result > maximum) fail(); return result;
}
function timestamp(value: unknown): { microsSinceUnixEpoch: bigint } {
  if (!Array.isArray(value) || value.length !== 1) fail();
  const microsSinceUnixEpoch = decimal(value[0], (1n << 63n) - 1n);
  if (microsSinceUnixEpoch === 0n) fail();
  return { microsSinceUnixEpoch };
}
const OPTIONAL: Readonly<Record<string, readonly string[]>> = {
  greaterRealmReleaseV1: ['publicName', 'regionManifestJson', 'legacyTransformRotation', 'legacyTransformOffsetQ', 'legacyTransformOffsetR', 'readyAt'],
  greaterRealmCellV1: ['componentKey', 'ridgeId', 'hydroBodyId', 'hydroFlowDirection', 'routeParentDirection', 'routeDepth'],
  greaterRealmCastleSlotV1: ['legacySlotId'], greaterRealmResourceNodeV1: ['legacyCatalogId'],
};
const TABLES = {
  greaterRealmReleaseV1: ['atlasId'],
  greaterRealmNavigationComponentV1: ['componentKey', 'componentOrdinal'],
  greaterRealmChunkV1: ['chunkHandle', 'importOrdinal'],
  greaterRealmCellV1: ['cellKey', 'atlasCoordKey', 'releaseOrdinal', 'chunkHandle'],
  greaterRealmCastleSlotV1: ['slotId', 'cellKey', 'releaseOrdinal'],
  greaterRealmResourceNodeV1: ['nodeId', 'releaseOrdinal', 'cellKey', 'locationId'],
} as const;

/** Private indexed memory, never a provider/context supplied by the caller. */
function memoryTable(name: string, indexes: readonly string[]) {
  const rows = new Map<unknown, Record<string, any>>();
  const maps = Object.fromEntries(indexes.map(key => [key, new Map<unknown, Set<unknown>>() ]));
  const primary = indexes[0]!;
  const store = (row: Record<string, any>, inserting: boolean) => {
    const key = row[primary], old = rows.get(key);
    if (key === undefined || (inserting ? old !== undefined : old === undefined)) fail();
    const captured = { ...row };
    for (const option of OPTIONAL[name] ?? []) if (!Object.hasOwn(captured, option)) captured[option] = undefined;
    if (old) for (const index of indexes) {
      const set = maps[index]!.get(old[index]); set?.delete(key);
      if (set?.size === 0) maps[index]!.delete(old[index]);
    }
    rows.set(key, captured);
    for (const index of indexes) {
      const set = maps[index]!.get(captured[index]) ?? new Set<unknown>();
      set.add(key); maps[index]!.set(captured[index], set);
    }
    return captured;
  };
  const table: Record<string, any> = { count: () => BigInt(rows.size), iter: () => rows.values(),
    insert: (row: Record<string, any>) => store(row, true) };
  for (const index of indexes) table[index] = {
    find: (value: unknown) => {
      const keys = maps[index]!.get(value);
      if (!keys?.size) return null;
      if (keys.size !== 1) fail();
      return rows.get(keys.values().next().value)!;
    },
    filter: function* (value: unknown) { for (const key of maps[index]!.get(value) ?? []) yield rows.get(key)!; },
    update: (row: Record<string, any>) => store(row, false),
  };
  return table;
}

function comparable(actual: Row, expected: Record<string, any>, options: readonly string[]): Row {
  const normalized: Record<string, unknown> = {};
  const keys = Object.keys(expected).map(sqlName);
  if (Object.keys(actual).sort().join('\0') !== keys.sort().join('\0')) fail();
  for (const [name, value] of Object.entries(expected)) {
    const key = sqlName(name); let observed = actual[key];
    if (value === undefined) {
      if (updateCanonical(observed) !== updateCanonical([1, []])) fail();
      normalized[name] = null; continue;
    }
    if (options.includes(name)) {
      if (!Array.isArray(observed) || observed.length !== 2 || observed[0] !== 0) fail();
      observed = observed[1];
    }
    if (typeof value === 'bigint') normalized[name] = decimal(observed).toString();
    else if (value && typeof value === 'object' && Object.hasOwn(value, 'microsSinceUnixEpoch'))
      normalized[name] = timestamp(observed).microsSinceUnixEpoch.toString();
    else if (typeof value === 'number') {
      if (typeof observed === 'string' && /^-?(?:0|[1-9][0-9]*)$/u.test(observed)) observed = Number(observed);
      if (!Number.isSafeInteger(observed)) fail(); normalized[name] = observed;
    } else normalized[name] = observed;
  }
  return normalized;
}
function canonicalExpected(expected: Record<string, any>): Row {
  return Object.fromEntries(Object.entries(expected).map(([key, value]) => [key,
    value === undefined ? null : typeof value === 'bigint' ? value.toString() : value && typeof value === 'object'
      && Object.hasOwn(value, 'microsSinceUnixEpoch') ? value.microsSinceUnixEpoch.toString() : value]));
}
function compareRows(actual: readonly Row[], table: Record<string, any>, primary: string, tableName: string): string {
  const expected = [...table.iter()] as Record<string, any>[];
  if (actual.length !== expected.length) fail();
  const byKey = new Map(expected.map(row => [row[primary], row]));
  const seen = new Set<unknown>(), canonical: string[] = [];
  for (const row of actual) {
    const key = row[sqlName(primary)], target = byKey.get(key);
    if (!target || seen.has(key)) fail(); seen.add(key);
    const normalized = comparable(row, target, OPTIONAL[tableName] ?? []), projected = canonicalExpected(target);
    if (updateCanonical(normalized) !== updateCanonical(projected)) fail();
    canonical.push(updateCanonical(normalized));
  }
  return updateDigest(canonical.sort());
}

export type PtrInitialAtlasVerificationPrefixInput = Readonly<{
  releaseInput: GreaterRealmReleaseInputV1; releaseHeaderJson: string;
  components: readonly GreaterRealmComponentInputV1[]; regions: readonly GreaterRealmRegionImportV1[];
  chunks: readonly Readonly<{ payloadJson: string; payloadSha256: string }>[];
  release: Row; componentRows: readonly Row[]; chunkRows: readonly Row[];
  cellRows: readonly Row[]; slotRows: readonly Row[]; resourceRows: readonly Row[];
  emptyBoundaryCounts: Readonly<Record<typeof BOUNDARIES[number], number | string>>;
}>;

/** Complete import and partial-cell verification proof, never a completion receipt or authentication proof. */
export function verifyPtrInitialAtlasVerificationPrefix(input: PtrInitialAtlasVerificationPrefixInput) {
  try {
    if (input.release.state !== 'verifying' || input.release.verification_phase !== 'cells'
      || input.release.ready_at === undefined || updateCanonical(input.release.ready_at) !== updateCanonical([1, []])
      || Object.keys(input.emptyBoundaryCounts).sort().join('\0') !== [...BOUNDARIES].sort().join('\0')
      || BOUNDARIES.some(name => decimal(input.emptyBoundaryCounts[name]) !== 0n)) fail();
    const cursor = Number(decimal(input.release.verification_cursor, 0xffff_ffffn));
    if (cursor < 1 || cursor >= input.releaseInput.expectedCellCount
      || input.chunks.length !== input.releaseInput.expectedChunkCount
      || input.components.length !== input.releaseInput.expectedComponentCount) fail();
    const staged = timestamp(input.release.staged_at);
    if (timestamp(input.release.approved_at).microsSinceUnixEpoch !== staged.microsSinceUnixEpoch) fail();
    const db: Record<string, any> = Object.fromEntries(Object.entries(TABLES).map(([name, indexes]) => [name, memoryTable(name, indexes)]));
    for (const name of ['greaterRealmActivationV1', 'greaterRealmCastleClaimV1', 'greaterRealmCellOccupancyV1',
      'realmAtlasV1', 'realmAtlasVisibleRegionV1', 'realmWorkerSystemV2']) db[name] = { count: () => 0n };
    const ctx = { db, timestamp: staged } as unknown as PtrContext;
    const { atlasId, importEpoch } = input.releaseInput;
    stageGreaterRealmReleaseV1(ctx, input.releaseInput, input.releaseHeaderJson);
    for (let index = 0; index < input.components.length; index += GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS)
      importGreaterRealmComponentsV1(ctx, atlasId, importEpoch, input.components.slice(index, index + GREATER_REALM_MAX_COMPONENT_IMPORT_ROWS));
    importGreaterRealmRegionsV1(ctx, atlasId, importEpoch, input.regions);
    if (input.chunkRows.length !== input.chunks.length) fail();
    const chunksByOrdinal = new Map(input.chunkRows.map(row => [Number(decimal(row.import_ordinal, 0xffff_ffffn)), row]));
    if (chunksByOrdinal.size !== input.chunkRows.length) fail();
    let previousTimestamp = staged.microsSinceUnixEpoch;
    for (let index = 0; index < input.chunks.length; index++) {
      const row = chunksByOrdinal.get(index); if (!row) fail();
      const importedAt = timestamp(row.imported_at);
      if (importedAt.microsSinceUnixEpoch < previousTimestamp) fail(); previousTimestamp = importedAt.microsSinceUnixEpoch;
      (ctx as unknown as { timestamp: typeof importedAt }).timestamp = importedAt;
      const chunk = input.chunks[index]!;
      importGreaterRealmChunkPayloadV1(ctx, atlasId, importEpoch, chunk.payloadSha256, chunk.payloadJson);
    }
    beginGreaterRealmVerificationV1(ctx, atlasId, importEpoch);
    // Earlier phases must complete through the actual backend; no observed counters seed this memory state.
    while (db.greaterRealmReleaseV1.atlasId.find(atlasId).verificationPhase !== 'cells') {
      const phase = db.greaterRealmReleaseV1.atlasId.find(atlasId).verificationPhase;
      if (!['components', 'chunks'].includes(phase)) fail();
      verifyGreaterRealmBatchV1(ctx, atlasId, importEpoch, GREATER_REALM_MAX_VERIFY_ROWS);
    }
    while (Number(db.greaterRealmReleaseV1.atlasId.find(atlasId).verificationCursor) < cursor) {
      const start = Number(db.greaterRealmReleaseV1.atlasId.find(atlasId).verificationCursor);
      verifyGreaterRealmBatchV1(ctx, atlasId, importEpoch, Math.min(GREATER_REALM_MAX_VERIFY_ROWS, cursor - start));
    }
    const tableDigests = {
      release: compareRows([input.release], db.greaterRealmReleaseV1, 'atlasId', 'greaterRealmReleaseV1'),
      components: compareRows(input.componentRows, db.greaterRealmNavigationComponentV1, 'componentKey', 'greaterRealmNavigationComponentV1'),
      chunks: compareRows(input.chunkRows, db.greaterRealmChunkV1, 'chunkHandle', 'greaterRealmChunkV1'),
      cells: compareRows(input.cellRows, db.greaterRealmCellV1, 'cellKey', 'greaterRealmCellV1'),
      slots: compareRows(input.slotRows, db.greaterRealmCastleSlotV1, 'slotId', 'greaterRealmCastleSlotV1'),
      resources: compareRows(input.resourceRows, db.greaterRealmResourceNodeV1, 'nodeId', 'greaterRealmResourceNodeV1'),
    };
    const proof = { profile: 'warpkeep-ptr-initial-atlas-verification-prefix-v1' as const,
      atlasId, expectedReleaseSha256: input.releaseInput.expectedReleaseSha256,
      chunkCount: input.chunkRows.length, cellCount: input.cellRows.length, slotCount: input.slotRows.length,
      resourceCount: input.resourceRows.length, componentCount: input.componentRows.length,
      verificationPhase: 'cells' as const, verificationCursor: cursor,
      verificationDigest: input.release.verification_digest, tableDigests,
      providerWritesAttempted: false as const, completionProven: false as const };
    return Object.freeze({ ...proof, digest: updateDigest(proof) });
  } catch { fail(); }
}
