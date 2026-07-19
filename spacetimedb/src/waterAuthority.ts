import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_LAYOUT_V1,
  matchesGenesisWaterLayoutV1,
  type GenesisWaterBodyV1,
  type GenesisWaterCellV1,
} from './waterWorld';
import {
  CANONICAL_REALM,
  canonicalMetaForKey,
  canonicalTileForKey,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
} from './world';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type WaterLayoutRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmWaterLayoutV1']['realmId']['find']>
>;
type WaterBodyRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmWaterBodyV1']['bodyId']['find']>
>;
type WaterCellRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmWaterCellV1']['cellKey']['find']>
>;

export class WaterLayoutAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WaterLayoutAuthorityError';
  }
}

function fail(code: string): never {
  throw new WaterLayoutAuthorityError(code);
}

function assertWorldPrecondition(ctx: WarpkeepReducerContext): void {
  const realm = ctx.db.realmV1.realmId.find(CANONICAL_REALM.realmId);
  if (realm === null || !matchesCanonicalRealm(realm)) fail('WATER_LAYOUT_REALM_DRIFT');
  if (ctx.db.worldTile.count() !== 10_000n || ctx.db.worldTileMetaV1.count() !== 10_000n) {
    fail('WATER_LAYOUT_WORLD_COUNT');
  }
  for (const cell of GENESIS_WATER_CELLS_V1) {
    const tile = canonicalTileForKey(cell.cellKey);
    const meta = canonicalMetaForKey(cell.cellKey);
    // Ocean cells live in the additive apron and deliberately have no
    // world_tile/world_tile_meta row. Lake and river cells must still match
    // the deployed land authority exactly.
    if (cell.regime === 'ocean' && tile === undefined && meta === undefined) continue;
    const storedTile = ctx.db.worldTile.key.find(cell.cellKey);
    const storedMeta = ctx.db.worldTileMetaV1.tileKey.find(cell.cellKey);
    if (
      tile === undefined || meta === undefined || storedTile === null || storedMeta === null
      || !matchesCanonicalTerrain(storedTile)
      || !matchesCanonicalWorldMeta(storedMeta)
      || storedTile.q !== cell.q
      || storedTile.r !== cell.r
    ) fail('WATER_LAYOUT_WORLD_DRIFT');
  }
}

function inspectLayout(ctx: WarpkeepReducerContext): WaterLayoutRow | undefined {
  let found: WaterLayoutRow | undefined;
  for (const row of ctx.db.realmWaterLayoutV1.iter()) {
    if (found !== undefined || !matchesGenesisWaterLayoutV1(row)) {
      fail('WATER_LAYOUT_METADATA_CONFLICT');
    }
    found = row;
  }
  return found;
}

function bodyMatches(row: WaterBodyRow, expected: GenesisWaterBodyV1): boolean {
  return row.bodyId === expected.bodyId
    && row.realmId === expected.realmId
    && row.regime === expected.regime
    && row.cellCount === expected.cellCount
    && row.sourceCellKey === expected.sourceCellKey
    && row.mouthCellKey === expected.mouthCellKey
    && row.surfaceLevelMilli === expected.surfaceLevelMilli
    && row.flowDirectionXQ15 === expected.flowDirectionXQ15
    && row.flowDirectionZQ15 === expected.flowDirectionZQ15
    && row.wavePreset === expected.wavePreset
    && row.ordinal === expected.ordinal
    && row.seed === expected.seed
    && row.generationVersion === expected.generationVersion
    && row.layoutVersion === expected.layoutVersion;
}

function cellMatches(row: WaterCellRow, expected: GenesisWaterCellV1): boolean {
  return row.cellKey === expected.cellKey
    && row.realmId === expected.realmId
    && row.q === expected.q
    && row.r === expected.r
    && row.regime === expected.regime
    && row.bodyId === expected.bodyId
    && row.depthCells === expected.depthCells
    && row.elevationMilli === expected.elevationMilli
    && row.surfaceLevelMilli === expected.surfaceLevelMilli
    && row.ring === expected.ring
    && row.s === expected.s
    && row.underlyingTileKey === (expected.underlyingTileKey ?? undefined)
    && row.riverOrdinal === (expected.riverOrdinal ?? undefined)
    && row.riverOrder === (expected.riverOrder ?? undefined)
    && row.downstreamWaterCellKey === (expected.downstreamWaterCellKey ?? undefined)
    && row.flowAccumulation === expected.flowAccumulation
    && row.depthClass === expected.depthClass
    && row.oceanDepth === expected.oceanDepth
    && row.bankSeed === expected.bankSeed
    && row.generationVersion === expected.generationVersion
    && row.fogBand === expected.fogBand
    && row.layoutVersion === expected.layoutVersion;
}

function inspectRows(ctx: WarpkeepReducerContext): {
  layout: WaterLayoutRow | undefined;
  missingBodies: readonly GenesisWaterBodyV1[];
  missingCells: readonly GenesisWaterCellV1[];
} {
  const layout = inspectLayout(ctx);
  const expectedBodies = new Map(GENESIS_WATER_BODIES_V1.map(body => [body.bodyId, body]));
  const expectedCells = new Map(GENESIS_WATER_CELLS_V1.map(cell => [cell.cellKey, cell]));
  const missingBodies: GenesisWaterBodyV1[] = [];
  const missingCells: GenesisWaterCellV1[] = [];

  for (const row of ctx.db.realmWaterBodyV1.iter()) {
    const expected = expectedBodies.get(row.bodyId);
    if (expected === undefined || !bodyMatches(row, expected)) fail('WATER_LAYOUT_BODY_CONFLICT');
    expectedBodies.delete(row.bodyId);
  }
  for (const row of ctx.db.realmWaterCellV1.iter()) {
    const expected = expectedCells.get(row.cellKey);
    if (expected === undefined || !cellMatches(row, expected)) fail('WATER_LAYOUT_CELL_CONFLICT');
    expectedCells.delete(row.cellKey);
  }
  missingBodies.push(...expectedBodies.values());
  missingCells.push(...expectedCells.values());
  if (layout !== undefined && (missingBodies.length > 0 || missingCells.length > 0)) {
    fail('WATER_LAYOUT_METADATA_PARTIAL');
  }
  if (layout === undefined && (ctx.db.realmWaterBodyV1.count() > 0n || ctx.db.realmWaterCellV1.count() > 0n)) {
    fail('WATER_LAYOUT_ORPHAN_ROWS');
  }
  return {
    layout,
    missingBodies: Object.freeze(missingBodies),
    missingCells: Object.freeze(missingCells),
  };
}

export function planGenesisWaterLayoutSeed(ctx: WarpkeepReducerContext) {
  assertWorldPrecondition(ctx);
  return inspectRows(ctx);
}

export function insertGenesisWaterLayoutMetadata(ctx: WarpkeepReducerContext): WaterLayoutRow {
  if (ctx.db.realmWaterLayoutV1.realmId.find(GENESIS_WATER_LAYOUT_V1.realmId) !== null) {
    fail('WATER_LAYOUT_METADATA_CONFLICT');
  }
  return ctx.db.realmWaterLayoutV1.insert({
    ...GENESIS_WATER_LAYOUT_V1,
    activated: false,
    seededAt: ctx.timestamp,
    activatedAt: undefined,
  });
}

export function insertGenesisWaterBody(
  ctx: WarpkeepReducerContext,
  body: GenesisWaterBodyV1,
): WaterBodyRow {
  if (ctx.db.realmWaterBodyV1.bodyId.find(body.bodyId) !== null) fail('WATER_LAYOUT_BODY_CONFLICT');
  return ctx.db.realmWaterBodyV1.insert(body);
}

export function insertGenesisWaterCell(
  ctx: WarpkeepReducerContext,
  cell: GenesisWaterCellV1,
): WaterCellRow {
  if (ctx.db.realmWaterCellV1.cellKey.find(cell.cellKey) !== null) fail('WATER_LAYOUT_CELL_CONFLICT');
  return ctx.db.realmWaterCellV1.insert({
    ...cell,
    underlyingTileKey: cell.underlyingTileKey,
    riverOrdinal: cell.riverOrdinal,
    riverOrder: cell.riverOrder,
    downstreamWaterCellKey: cell.downstreamWaterCellKey,
  });
}

export function activateGenesisWaterLayout(ctx: WarpkeepReducerContext): WaterLayoutRow {
  const plan = planGenesisWaterLayoutSeed(ctx);
  if (plan.layout === undefined || plan.missingBodies.length !== 0 || plan.missingCells.length !== 0) {
    fail('WATER_LAYOUT_NOT_READY');
  }
  if (plan.layout.activated) return plan.layout;
  return ctx.db.realmWaterLayoutV1.realmId.update({
    ...plan.layout,
    activated: true,
    activatedAt: ctx.timestamp,
  });
}

export function waterLayoutErrorCode(error: unknown): string | undefined {
  return error instanceof WaterLayoutAuthorityError ? error.code : undefined;
}
