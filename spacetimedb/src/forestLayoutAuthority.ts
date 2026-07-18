import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1,
  matchesCanonicalGenesisForestInstanceV1,
  matchesCanonicalGenesisForestLayoutV1,
  type CanonicalForestInstanceV1,
} from './forestLayoutPolicy';
import type warpkeep from './schema';
import {
  CANONICAL_REALM,
  canonicalMetaForKey,
  canonicalTileForKey,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
} from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type ForestLayoutRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmForestLayoutV1']['realmId']['find']>
>;
type ForestInstanceRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['realmForestInstanceV1']['treeId']['find']>
>;

export class ForestLayoutAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ForestLayoutAuthorityError';
  }
}

function fail(code: string): never {
  throw new ForestLayoutAuthorityError(code);
}

function isFoliageTerrain(kind: string) {
  return kind === 'forest' || kind === 'lowland' || kind === 'meadow';
}

/**
 * The reviewed catalog may decorate future resource/core/reserve tiles, but
 * it must never occupy a permanent keep foundation or a scenic blocker. Gold
 * occupation and wagon state are intentionally absent: neither may change
 * the shared forest transform catalog.
 */
function isStaticForestPlacementCompatible(kind: string) {
  return kind !== 'castle-slot' && kind !== 'scenic-blocker';
}

/**
 * A tree layout is presentation state, but its location must still be rooted
 * in the complete canonical world. This prevents a malformed public row from
 * smuggling an out-of-bounds or impassable coordinate into the shared map.
 */
function assertForestInstanceWorldRows(
  ctx: WarpkeepReducerContext,
  instance: Pick<CanonicalForestInstanceV1, 'tileKey' | 'q' | 'r'>,
): void {
  const expectedTile = canonicalTileForKey(instance.tileKey);
  const expectedMeta = canonicalMetaForKey(instance.tileKey);
  const storedTile = ctx.db.worldTile.key.find(instance.tileKey);
  const storedMeta = ctx.db.worldTileMetaV1.tileKey.find(instance.tileKey);
  if (
    expectedTile === undefined
    || expectedMeta === undefined
    || storedTile === null
    || storedMeta === null
    || !matchesCanonicalTerrain(storedTile)
    || !matchesCanonicalWorldMeta(storedMeta)
    || storedTile.q !== instance.q
    || storedTile.r !== instance.r
    || !storedMeta.passable
    || !isFoliageTerrain(storedMeta.terrainKind)
    || !isStaticForestPlacementCompatible(storedMeta.staticContentKind)
  ) fail('FOREST_LAYOUT_WORLD_INTEGRITY');
}

function assertStoredForestInstance(
  ctx: WarpkeepReducerContext,
  row: ForestInstanceRow,
): void {
  if (!matchesCanonicalGenesisForestInstanceV1(row)) {
    fail('FOREST_LAYOUT_INSTANCE_CONFLICT');
  }
  assertForestInstanceWorldRows(ctx, row);
}

function inspectStoredLayout(ctx: WarpkeepReducerContext): ForestLayoutRow | undefined {
  let found: ForestLayoutRow | undefined;
  for (const row of ctx.db.realmForestLayoutV1.iter()) {
    if (found !== undefined || !matchesCanonicalGenesisForestLayoutV1(row)) {
      fail('FOREST_LAYOUT_METADATA_CONFLICT');
    }
    found = row;
  }
  return found;
}

export type ForestLayoutSeedPlan = Readonly<{
  metadataMissing: boolean;
  missingInstances: readonly CanonicalForestInstanceV1[];
}>;

/**
 * Compute only missing records. Every stored record is compared field-for-
 * field to the reviewed static catalog before an insert plan can exist. The
 * reducer takes no browser/operator layout inputs, so a future visual change
 * must introduce a new reviewed layout version and migration path.
 */
export function planGenesisForestLayoutSeed(
  ctx: WarpkeepReducerContext,
): ForestLayoutSeedPlan {
  const realm = ctx.db.realmV1.realmId.find(CANONICAL_REALM.realmId);
  if (realm === null || !matchesCanonicalRealm(realm)) {
    fail('FOREST_LAYOUT_SEED_PRECONDITION');
  }

  const layout = inspectStoredLayout(ctx);
  const seen = new Set<string>();
  for (const row of ctx.db.realmForestInstanceV1.iter()) {
    if (seen.has(row.treeId)) fail('FOREST_LAYOUT_INSTANCE_CONFLICT');
    seen.add(row.treeId);
    assertStoredForestInstance(ctx, row);
  }
  if (seen.size > CANONICAL_GENESIS_FOREST_LAYOUT_V1.instanceCount) {
    fail('FOREST_LAYOUT_INSTANCE_CONFLICT');
  }

  const missingInstances: CanonicalForestInstanceV1[] = [];
  for (const instance of CANONICAL_GENESIS_FOREST_INSTANCES_V1) {
    const existing = ctx.db.realmForestInstanceV1.treeId.find(instance.treeId);
    if (existing === null) {
      assertForestInstanceWorldRows(ctx, instance);
      missingInstances.push(instance);
      continue;
    }
    assertStoredForestInstance(ctx, existing);
  }

  // An atomic seed always creates metadata and every missing row together.
  // Metadata paired with a partial instance set therefore signals drift,
  // rather than inviting an operator to silently repair unknown state.
  if (layout !== undefined && missingInstances.length > 0) {
    fail('FOREST_LAYOUT_METADATA_PARTIAL');
  }

  return Object.freeze({
    metadataMissing: layout === undefined,
    missingInstances: Object.freeze(missingInstances),
  });
}

export function insertGenesisForestLayoutMetadata(
  ctx: WarpkeepReducerContext,
): ForestLayoutRow {
  if (ctx.db.realmForestLayoutV1.realmId.find(CANONICAL_GENESIS_FOREST_LAYOUT_V1.realmId) !== null) {
    fail('FOREST_LAYOUT_METADATA_CONFLICT');
  }
  return ctx.db.realmForestLayoutV1.insert({
    ...CANONICAL_GENESIS_FOREST_LAYOUT_V1,
    seededAt: ctx.timestamp,
  });
}

export function insertGenesisForestInstance(
  ctx: WarpkeepReducerContext,
  instance: CanonicalForestInstanceV1,
): ForestInstanceRow {
  if (ctx.db.realmForestInstanceV1.treeId.find(instance.treeId) !== null) {
    fail('FOREST_LAYOUT_INSTANCE_CONFLICT');
  }
  if (!matchesCanonicalGenesisForestInstanceV1(instance)) {
    fail('FOREST_LAYOUT_INSTANCE_CONFLICT');
  }
  assertForestInstanceWorldRows(ctx, instance);
  return ctx.db.realmForestInstanceV1.insert(instance);
}

export function forestLayoutErrorCode(error: unknown): string | undefined {
  return error instanceof ForestLayoutAuthorityError ? error.code : undefined;
}
