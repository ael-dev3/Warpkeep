import { createHash } from 'node:crypto';

import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  GENESIS_AUTHORITATIVE_CELL_COUNT,
  GENESIS_CASTLE_SLOT_COUNT,
  HEGEMONY_REALM_ID,
  hexKey,
  matchesCanonicalCastleSlot,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
} from '../../spacetimedb/src/world';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
  GENESIS_TIER_I_GOLD_SITE_COUNT,
  GENESIS_TIER_I_GOLD_SITE_DIGEST,
  GOLD_SITE_POLICY_VERSION,
  canonicalTierIGoldSiteDigestInput,
  matchesCanonicalTierIGoldSiteV1,
} from '../../spacetimedb/src/goldSitePolicy';
import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
  FOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_FOOD_SITE_COUNT,
  GENESIS_TIER_I_FOOD_SITE_DIGEST,
  canonicalTierIFoodSiteDigestInput,
  matchesCanonicalTierIFoodSiteV1,
} from '../../spacetimedb/src/foodSitePolicy';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
  GENESIS_TIER_I_WOOD_SITE_COUNT,
  GENESIS_TIER_I_WOOD_SITE_DIGEST,
  WOOD_SITE_POLICY_VERSION,
  canonicalTierIWoodSiteDigestInput,
  matchesCanonicalTierIWoodSiteV1,
} from '../../spacetimedb/src/woodSitePolicy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
  GENESIS_TIER_I_STONE_SITE_COUNT,
  GENESIS_TIER_I_STONE_SITE_DIGEST,
  STONE_SITE_POLICY_VERSION,
  canonicalTierIStoneSiteDigestInput,
  matchesCanonicalTierIStoneSiteV1,
} from '../../spacetimedb/src/stoneSitePolicy';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1,
  canonicalGenesisForestAssetCatalogV1DigestInput,
  canonicalGenesisForestLayoutV1DigestInput,
  isCompleteCanonicalGenesisForestLayoutV1,
} from '../../spacetimedb/src/forestLayoutPolicy';
import {
  GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_TREE_COUNT,
} from '../../spacetimedb/src/forestLayoutContract';
import {
  GENESIS_WATER_BODIES_V1,
  GENESIS_WATER_CELLS_V1,
  GENESIS_WATER_LAYOUT_DIGEST,
  GENESIS_WATER_LAYOUT_V1,
  matchesGenesisWaterLayoutV1,
} from '../../spacetimedb/src/waterWorld';
import {
  CANONICAL_GENESIS_WATER_REVISION_V1,
  GENESIS_WATER_REVISION_DIGEST,
  GENESIS_WATER_REVISION_ENABLED_BODIES_V1,
  GENESIS_WATER_REVISION_ENABLED_BODY_COUNT,
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_ENABLED_CELL_COUNT,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1,
  canonicalGenesisWaterRevisionV1DigestInput,
  matchesCanonicalGenesisWaterRevisionV1,
} from '../../spacetimedb/src/waterRevision';

/**
 * This module is an input boundary for offline atlas generation only. Nothing
 * in SpacetimeDB or the shipped client imports it, and its exact coordinates
 * must never be passed to the aggregate-only public candidate report.
 */
export const GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_SCHEMA =
  'warpkeep.greater-realm.private-legacy-lowlands-patch.v1' as const;
export const GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_CLASSIFICATION =
  'private-generator-input-only-never-public-report' as const;
export const GREATER_REALM_LOWLANDS_REGION_ID = 'T1_LOWLANDS' as const;
export const GREATER_REALM_LEGACY_BRIDGE_VERSION = 1;

export const LEGACY_LOWLANDS_AXIAL_ROTATION_STEPS = Object.freeze([
  0, 1, 2, 3, 4, 5,
] as const);

export type LegacyLowlandsAxialRotationSteps =
  (typeof LEGACY_LOWLANDS_AXIAL_ROTATION_STEPS)[number];

export type AxialCoordinate = Readonly<{
  q: number;
  r: number;
}>;

export type LegacyLowlandsAtlasTransform = Readonly<{
  rotationSteps: LegacyLowlandsAxialRotationSteps;
  globalOffsetQ: number;
  globalOffsetR: number;
}>;

const REGION_ID_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;

function fail(code: string): never {
  // Exact coordinates are deliberately omitted from failures: callers may
  // surface codes in review automation, while private layout data stays local.
  throw new Error(`GREATER_REALM_LEGACY_LOWLANDS_${code}`);
}

function assertSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value)) fail(code);
}

function assertAxialCoordinate(coordinate: AxialCoordinate): void {
  assertSafeInteger(coordinate.q, 'AXIAL_Q');
  assertSafeInteger(coordinate.r, 'AXIAL_R');
  assertSafeInteger(-coordinate.q - coordinate.r, 'AXIAL_S');
}

function assertRotationSteps(
  rotationSteps: number,
): asserts rotationSteps is LegacyLowlandsAxialRotationSteps {
  if (!(LEGACY_LOWLANDS_AXIAL_ROTATION_STEPS as readonly number[]).includes(rotationSteps)) {
    fail('ROTATION_STEPS');
  }
}

/** Exact canonical key for one private axial coordinate. */
export function privateAxialCoordinateKey(coordinate: AxialCoordinate): string {
  assertAxialCoordinate(coordinate);
  return hexKey(coordinate.q, coordinate.r);
}

/**
 * Region-scoped key format required by the future bridge. Region validation
 * makes the delimiter unambiguous rather than relying on escaping.
 */
export function privateRegionAxialCoordinateKey(
  regionId: string,
  coordinate: AxialCoordinate,
): string {
  if (!REGION_ID_PATTERN.test(regionId)) fail('REGION_ID');
  return `${regionId}:${privateAxialCoordinateKey(coordinate)}`;
}

/**
 * Clockwise rotation around the axial origin in exact 60-degree increments.
 * In cube terms `(q, s, r) -> (-r, -q, -s)`; no floating point is involved.
 */
export function rotateAxialCoordinate60(
  coordinate: AxialCoordinate,
  rotationSteps: LegacyLowlandsAxialRotationSteps,
): AxialCoordinate {
  assertAxialCoordinate(coordinate);
  assertRotationSteps(rotationSteps);
  let q = coordinate.q;
  let r = coordinate.r;
  for (let step = 0; step < rotationSteps; step += 1) {
    const nextQ = -r;
    const nextR = q + r;
    assertAxialCoordinate({ q: nextQ, r: nextR });
    q = nextQ;
    r = nextR;
  }
  return Object.freeze({ q, r });
}

/** Applies a reviewed rotation followed by an exact global axial translation. */
export function transformLegacyLowlandsToGlobal(
  localCoordinate: AxialCoordinate,
  transform: LegacyLowlandsAtlasTransform,
): AxialCoordinate {
  assertRotationSteps(transform.rotationSteps);
  assertSafeInteger(transform.globalOffsetQ, 'GLOBAL_OFFSET_Q');
  assertSafeInteger(transform.globalOffsetR, 'GLOBAL_OFFSET_R');
  const rotated = rotateAxialCoordinate60(localCoordinate, transform.rotationSteps);
  const globalCoordinate = {
    q: rotated.q + transform.globalOffsetQ,
    r: rotated.r + transform.globalOffsetR,
  };
  assertAxialCoordinate(globalCoordinate);
  return Object.freeze(globalCoordinate);
}

/** Exactly reverses translation and the selected 60-degree rotation. */
export function inverseGlobalToLegacyLowlands(
  globalCoordinate: AxialCoordinate,
  transform: LegacyLowlandsAtlasTransform,
): AxialCoordinate {
  assertAxialCoordinate(globalCoordinate);
  assertRotationSteps(transform.rotationSteps);
  assertSafeInteger(transform.globalOffsetQ, 'GLOBAL_OFFSET_Q');
  assertSafeInteger(transform.globalOffsetR, 'GLOBAL_OFFSET_R');
  const translated = {
    q: globalCoordinate.q - transform.globalOffsetQ,
    r: globalCoordinate.r - transform.globalOffsetR,
  };
  assertAxialCoordinate(translated);
  const inverseSteps = ((6 - transform.rotationSteps) % 6) as LegacyLowlandsAxialRotationSteps;
  return rotateAxialCoordinate60(translated, inverseSteps);
}

/**
 * Fails without disclosing the colliding key. The returned count is safe for
 * private validation summaries but contains no coordinate material.
 */
export function assertAxialKeyCollisionFree(
  coordinates: Iterable<AxialCoordinate>,
): number {
  const keys = new Set<string>();
  let count = 0;
  for (const coordinate of coordinates) {
    const key = privateAxialCoordinateKey(coordinate);
    if (keys.has(key)) fail('AXIAL_KEY_COLLISION');
    keys.add(key);
    count += 1;
  }
  return count;
}

export const GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1 = Object.freeze({
  worldCellCount: 10_000,
  worldGenerationDigest: '4c111ec1f5e127c7cfd8f42f87c4085f94a4bc46bdacbdc9779866dfdb3edab6',
  castleSlotCount: 100,
  castleSlotDigest: 'd770a084b7c8f59abbc505239a026a98e17bd55d3507c204cd1517858db017ed',
  waterLayoutDigest: 'e6e3601063254a232a80bcc2921e6717b7564f8fce7b276207ffca39c1843dba',
  waterBaseCellCount: 3_680,
  waterRevisionDigest: '82c18efe71afff1e1dcd4db17b2f6bd1815042d88c7471793bf6cd6d03780aec',
  waterEnabledBodyCount: 13,
  waterEnabledCellCount: 3_271,
  waterReclaimedLakeCellCount: 409,
  goldSiteCount: 24,
  goldSiteDigest: '84ea3eed9ff5cd3eb7e4704aee6fb562ef3f969c490e95d3bf88645abded7d7d',
  foodSiteCount: 96,
  foodSiteDigest: '10756337e27138b536a250ad6bf704c603a8c3946c72a1f0d3a041630610ce72',
  woodSiteCount: 96,
  woodSiteDigest: '3f0ae99d2052c32b7fec9aec6126e86f53031c13d619fcef12dd42a02b4063d6',
  stoneSiteCount: 96,
  stoneSiteDigest: '22c902d5bfb033e7faf3eaa303e89228d9aad0cff712853618dc34b994d28467',
  forestInstanceCount: 210,
  forestLayoutDigest: '8a7e7c290e319f9495c3ca2485114659a52f84411e7864a4ed0127ac248b52b2',
  forestAssetCatalogDigest: 'e544942ee29a61215c2afce360b8a19f943ff703957e84b20973452f1b93cde7',
} as const);

/**
 * The exact deployed Lowlands patch. The arrays below are the frozen canonical
 * source objects, not regenerated copies. This descriptor is intentionally not
 * exported from an application index or consumed by public report tooling.
 */
export const GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1 = Object.freeze({
  schema: GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_SCHEMA,
  classification: GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_CLASSIFICATION,
  bridgeVersion: GREATER_REALM_LEGACY_BRIDGE_VERSION,
  regionId: GREATER_REALM_LOWLANDS_REGION_ID,
  coordinateSpace: 'region-local-axial' as const,
  realm: CANONICAL_REALM,
  world: Object.freeze({
    generationDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldGenerationDigest,
    tiles: CANONICAL_WORLD_TILES,
    metadata: CANONICAL_WORLD_TILE_META,
  }),
  castleSlots: Object.freeze({
    catalogDigest: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotDigest,
    rows: CANONICAL_CASTLE_SLOTS,
  }),
  water: Object.freeze({
    layoutDigest: GENESIS_WATER_LAYOUT_DIGEST,
    layout: GENESIS_WATER_LAYOUT_V1,
    bodies: GENESIS_WATER_BODIES_V1,
    cells: GENESIS_WATER_CELLS_V1,
    activeRevision: CANONICAL_GENESIS_WATER_REVISION_V1,
    enabledBodies: GENESIS_WATER_REVISION_ENABLED_BODIES_V1,
    enabledCells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
    reclaimedLakeCellKeys: GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1,
  }),
  resources: Object.freeze({
    gold: Object.freeze({
      policyVersion: GOLD_SITE_POLICY_VERSION,
      catalogDigest: GENESIS_TIER_I_GOLD_SITE_DIGEST,
      sites: CANONICAL_TIER_I_GOLD_SITES_V1,
    }),
    food: Object.freeze({
      policyVersion: FOOD_SITE_POLICY_VERSION,
      catalogDigest: GENESIS_TIER_I_FOOD_SITE_DIGEST,
      sites: CANONICAL_TIER_I_FOOD_SITES_V1,
    }),
    wood: Object.freeze({
      policyVersion: WOOD_SITE_POLICY_VERSION,
      catalogDigest: GENESIS_TIER_I_WOOD_SITE_DIGEST,
      sites: CANONICAL_TIER_I_WOOD_SITES_V1,
    }),
    stone: Object.freeze({
      policyVersion: STONE_SITE_POLICY_VERSION,
      catalogDigest: GENESIS_TIER_I_STONE_SITE_DIGEST,
      sites: CANONICAL_TIER_I_STONE_SITES_V1,
    }),
  }),
  forest: Object.freeze({
    layoutDigest: GENESIS_FOREST_LAYOUT_V1_DIGEST,
    assetCatalogDigest: GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
    layout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
    instances: CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  }),
});

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertEqual(actual: unknown, expected: unknown, code: string): void {
  if (actual !== expected) fail(code);
}

type SiteRow = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

function assertSiteCatalog<T extends SiteRow>(
  sites: readonly T[],
  expectedCount: number,
  expectedDigest: string,
  digestInput: () => string,
  matchesCanonical: (site: T) => boolean,
  worldKeys: ReadonlySet<string>,
  occupiedSiteKeys: Set<string>,
): void {
  assertEqual(sites.length, expectedCount, 'RESOURCE_SITE_COUNT_DRIFT');
  assertEqual(sha256(digestInput()), expectedDigest, 'RESOURCE_SITE_DIGEST_DRIFT');
  const ids = new Set<string>();
  for (const site of sites) {
    const key = privateAxialCoordinateKey(site);
    if (
      ids.has(site.siteId)
      || occupiedSiteKeys.has(key)
      || !worldKeys.has(key)
      || !matchesCanonical(site)
    ) fail('RESOURCE_SITE_CATALOG_DRIFT');
    ids.add(site.siteId);
    occupiedSiteKeys.add(key);
  }
}

/** Re-runnable fail-closed audit used before any private candidate generation. */
export function assertGreaterRealmLegacyLowlandsPatchLocked(): void {
  const pins = GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1;
  const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;

  assertEqual(patch.realm.realmId, HEGEMONY_REALM_ID, 'REALM_ID_DRIFT');
  if (!matchesCanonicalRealm(patch.realm)) fail('REALM_DRIFT');
  assertEqual(patch.world.tiles.length, GENESIS_AUTHORITATIVE_CELL_COUNT, 'WORLD_COUNT_POLICY');
  assertEqual(patch.world.tiles.length, pins.worldCellCount, 'WORLD_COUNT_DRIFT');
  assertEqual(patch.world.metadata.length, pins.worldCellCount, 'WORLD_META_COUNT_DRIFT');
  assertEqual(assertAxialKeyCollisionFree(patch.world.tiles), pins.worldCellCount, 'WORLD_KEY_COUNT');

  const worldKeys = new Set<string>();
  for (const tile of patch.world.tiles) {
    if (tile.key !== privateAxialCoordinateKey(tile) || !matchesCanonicalTerrain(tile)) {
      fail('WORLD_TILE_DRIFT');
    }
    worldKeys.add(tile.key);
  }
  for (const meta of patch.world.metadata) {
    if (!worldKeys.has(meta.tileKey) || !matchesCanonicalWorldMeta(meta)) {
      fail('WORLD_META_DRIFT');
    }
  }

  assertEqual(
    sha256(JSON.stringify({
      realm: patch.realm,
      tiles: patch.world.tiles,
      meta: patch.world.metadata,
      slots: patch.castleSlots.rows,
    })),
    pins.worldGenerationDigest,
    'WORLD_DIGEST_DRIFT',
  );

  assertEqual(patch.castleSlots.rows.length, GENESIS_CASTLE_SLOT_COUNT, 'CASTLE_COUNT_POLICY');
  assertEqual(patch.castleSlots.rows.length, pins.castleSlotCount, 'CASTLE_COUNT_DRIFT');
  assertEqual(sha256(JSON.stringify(patch.castleSlots.rows)), pins.castleSlotDigest, 'CASTLE_DIGEST_DRIFT');
  assertEqual(assertAxialKeyCollisionFree(patch.castleSlots.rows), pins.castleSlotCount, 'CASTLE_KEY_COUNT');
  const slotIds = new Set<number>();
  for (const slot of patch.castleSlots.rows) {
    const key = privateAxialCoordinateKey(slot);
    if (
      slotIds.has(slot.slotId)
      || slot.tileKey !== key
      || !worldKeys.has(key)
      || !matchesCanonicalCastleSlot(slot)
    ) fail('CASTLE_CATALOG_DRIFT');
    slotIds.add(slot.slotId);
  }

  if (!matchesGenesisWaterLayoutV1(patch.water.layout)) fail('WATER_LAYOUT_DRIFT');
  if (!matchesCanonicalGenesisWaterRevisionV1(patch.water.activeRevision)) {
    fail('WATER_REVISION_DRIFT');
  }
  assertEqual(patch.water.layoutDigest, pins.waterLayoutDigest, 'WATER_LAYOUT_DIGEST_DRIFT');
  assertEqual(GENESIS_WATER_LAYOUT_DIGEST, pins.waterLayoutDigest, 'WATER_LAYOUT_PIN_DRIFT');
  assertEqual(patch.water.cells.length, pins.waterBaseCellCount, 'WATER_BASE_CELL_COUNT_DRIFT');
  assertEqual(patch.water.enabledBodies.length, pins.waterEnabledBodyCount, 'WATER_BODY_COUNT_DRIFT');
  assertEqual(patch.water.enabledCells.length, pins.waterEnabledCellCount, 'WATER_CELL_COUNT_DRIFT');
  assertEqual(
    patch.water.reclaimedLakeCellKeys.length,
    pins.waterReclaimedLakeCellCount,
    'WATER_RECLAIMED_COUNT_DRIFT',
  );
  assertEqual(
    sha256(canonicalGenesisWaterRevisionV1DigestInput()),
    pins.waterRevisionDigest,
    'WATER_REVISION_DIGEST_DRIFT',
  );
  assertEqual(GENESIS_WATER_REVISION_DIGEST, pins.waterRevisionDigest, 'WATER_REVISION_PIN_DRIFT');
  assertEqual(GENESIS_WATER_REVISION_ENABLED_BODY_COUNT, pins.waterEnabledBodyCount, 'WATER_BODY_POLICY');
  assertEqual(GENESIS_WATER_REVISION_ENABLED_CELL_COUNT, pins.waterEnabledCellCount, 'WATER_CELL_POLICY');
  assertEqual(
    GENESIS_WATER_REVISION_RECLAIMED_LAKE_CELL_COUNT,
    pins.waterReclaimedLakeCellCount,
    'WATER_RECLAIMED_POLICY',
  );

  const bodyIds = new Set<string>();
  for (const body of patch.water.bodies) {
    if (bodyIds.has(body.bodyId)) fail('WATER_BODY_CATALOG_DRIFT');
    bodyIds.add(body.bodyId);
  }
  assertEqual(assertAxialKeyCollisionFree(patch.water.cells), patch.water.cells.length, 'WATER_KEY_COUNT');
  for (const cell of patch.water.cells) {
    if (cell.cellKey !== privateAxialCoordinateKey(cell) || !bodyIds.has(cell.bodyId)) {
      fail('WATER_CELL_CATALOG_DRIFT');
    }
    if (cell.underlyingTileKey !== undefined && !worldKeys.has(cell.underlyingTileKey)) {
      fail('WATER_UNDERLYING_TILE_DRIFT');
    }
  }

  const occupiedSiteKeys = new Set<string>();
  assertSiteCatalog(
    patch.resources.gold.sites,
    pins.goldSiteCount,
    pins.goldSiteDigest,
    canonicalTierIGoldSiteDigestInput,
    matchesCanonicalTierIGoldSiteV1,
    worldKeys,
    occupiedSiteKeys,
  );
  assertSiteCatalog(
    patch.resources.food.sites,
    pins.foodSiteCount,
    pins.foodSiteDigest,
    canonicalTierIFoodSiteDigestInput,
    matchesCanonicalTierIFoodSiteV1,
    worldKeys,
    occupiedSiteKeys,
  );
  assertSiteCatalog(
    patch.resources.wood.sites,
    pins.woodSiteCount,
    pins.woodSiteDigest,
    canonicalTierIWoodSiteDigestInput,
    matchesCanonicalTierIWoodSiteV1,
    worldKeys,
    occupiedSiteKeys,
  );
  assertSiteCatalog(
    patch.resources.stone.sites,
    pins.stoneSiteCount,
    pins.stoneSiteDigest,
    canonicalTierIStoneSiteDigestInput,
    matchesCanonicalTierIStoneSiteV1,
    worldKeys,
    occupiedSiteKeys,
  );
  assertEqual(GENESIS_TIER_I_GOLD_SITE_COUNT, pins.goldSiteCount, 'GOLD_COUNT_POLICY');
  assertEqual(GENESIS_TIER_I_FOOD_SITE_COUNT, pins.foodSiteCount, 'FOOD_COUNT_POLICY');
  assertEqual(GENESIS_TIER_I_WOOD_SITE_COUNT, pins.woodSiteCount, 'WOOD_COUNT_POLICY');
  assertEqual(GENESIS_TIER_I_STONE_SITE_COUNT, pins.stoneSiteCount, 'STONE_COUNT_POLICY');
  assertEqual(GENESIS_TIER_I_GOLD_SITE_DIGEST, pins.goldSiteDigest, 'GOLD_DIGEST_POLICY');
  assertEqual(GENESIS_TIER_I_FOOD_SITE_DIGEST, pins.foodSiteDigest, 'FOOD_DIGEST_POLICY');
  assertEqual(GENESIS_TIER_I_WOOD_SITE_DIGEST, pins.woodSiteDigest, 'WOOD_DIGEST_POLICY');
  assertEqual(GENESIS_TIER_I_STONE_SITE_DIGEST, pins.stoneSiteDigest, 'STONE_DIGEST_POLICY');

  if (!isCompleteCanonicalGenesisForestLayoutV1(patch.forest.layout, patch.forest.instances)) {
    fail('FOREST_CATALOG_DRIFT');
  }
  assertEqual(patch.forest.instances.length, GENESIS_FOREST_LAYOUT_V1_TREE_COUNT, 'FOREST_COUNT_POLICY');
  assertEqual(patch.forest.instances.length, pins.forestInstanceCount, 'FOREST_COUNT_DRIFT');
  assertEqual(
    sha256(canonicalGenesisForestLayoutV1DigestInput()),
    pins.forestLayoutDigest,
    'FOREST_LAYOUT_DIGEST_DRIFT',
  );
  assertEqual(
    sha256(canonicalGenesisForestAssetCatalogV1DigestInput()),
    pins.forestAssetCatalogDigest,
    'FOREST_ASSET_DIGEST_DRIFT',
  );
  assertEqual(GENESIS_FOREST_LAYOUT_V1_DIGEST, pins.forestLayoutDigest, 'FOREST_LAYOUT_POLICY');
  assertEqual(
    GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
    pins.forestAssetCatalogDigest,
    'FOREST_ASSET_POLICY',
  );
  const treeIds = new Set<string>();
  const treeWorldCoordinates = new Set<string>();
  for (const instance of patch.forest.instances) {
    const worldCoordinateKey = `${instance.worldXMicrounits},${instance.worldZMicrounits}`;
    if (
      treeIds.has(instance.treeId)
      || treeWorldCoordinates.has(worldCoordinateKey)
      || instance.tileKey !== privateAxialCoordinateKey(instance)
      || !worldKeys.has(instance.tileKey)
    ) fail('FOREST_COORDINATE_DRIFT');
    treeIds.add(instance.treeId);
    treeWorldCoordinates.add(worldCoordinateKey);
  }

  if (
    !Object.isFrozen(patch)
    || !Object.isFrozen(patch.world)
    || !Object.isFrozen(patch.castleSlots)
    || !Object.isFrozen(patch.water)
    || !Object.isFrozen(patch.resources)
    || !Object.isFrozen(patch.forest)
  ) fail('PATCH_NOT_LOCKED');
}

assertGreaterRealmLegacyLowlandsPatchLocked();
