import {
  GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_POLICY_VERSION,
  GENESIS_FOREST_LAYOUT_V1_ROTATION_MILLIDEGREE_SCALE,
  GENESIS_FOREST_LAYOUT_V1_SCALE_BASIS_POINTS,
  GENESIS_FOREST_LAYOUT_V1_TRANSFORM_MICROUNITS,
  GENESIS_FOREST_LAYOUT_V1_TREE_COUNT,
  GENESIS_FOREST_LAYOUT_V1_VERSION
} from '../../../spacetimedb/src/forestLayoutContract';
import { matchesCanonicalGenesisForestInstanceV1 } from '../../../spacetimedb/src/forestLayoutPolicy';
import {
  axialToWorld,
  hexKey,
  parseHexKey,
  type HexCoord
} from './hexCoordinates';
import {
  REALM_FOREST_BIOME_BUDGETS,
  REALM_FOREST_TREE_MINIMUM_SEPARATION,
  type RealmForestBiomeData,
  type RealmForestSpecies,
  type RealmForestTreePoint
} from './realmForestBiomes';
import { pointyHexBoundaryDistance } from './terrainHeight';
import type { RealmTerrainKind } from './realmTerrainSemantics';
import type { RealmTerrainMap } from './terrainTypes';

/** Rows are seeded inside this interior margin by the canonical layout policy. */
export const REALM_SHARED_FOREST_MAXIMUM_BOUNDARY_DISTANCE = 0.8;

const SHA_256_HEX = /^[a-f0-9]{64}$/;
const SAFE_SHARED_STRING = /^[^\u0000-\u001f\u007f]{1,160}$/;
const TREE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,159}$/i;
const FOREST_HABITATS = new Set<RealmForestTreePoint['habitat']>([
  'grove',
  'forest',
  'fringe'
]);
const MICRO_UNIT_TOLERANCE = 2 / GENESIS_FOREST_LAYOUT_V1_TRANSFORM_MICROUNITS;
const SCALE_BASIS_POINTS = BigInt(GENESIS_FOREST_LAYOUT_V1_SCALE_BASIS_POINTS);
const MILLI_DEGREES_PER_TURN = BigInt(360 * GENESIS_FOREST_LAYOUT_V1_ROTATION_MILLIDEGREE_SCALE);

/** Browser-facing structural shape of public `realm_forest_layout_v1`. */
export type RealmSharedForestLayoutRecord = Readonly<{
  realmId: string;
  layoutVersion: number;
  policyVersion: string;
  layoutDigest: string;
  assetCatalogDigest: string;
  instanceCount: number;
}>;

/** Browser-facing structural shape of public `realm_forest_instance_v1`. */
export type RealmSharedForestTreeRecord = Readonly<{
  treeId: string;
  realmId: string;
  tileKey: string;
  q: number;
  r: number;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  worldXMicrounits: bigint;
  worldZMicrounits: bigint;
  rotationMilliDegrees: bigint;
  scaleBasisPoints: bigint;
  speciesId: string;
  habitat: RealmForestTreePoint['habitat'];
  layoutVersion: number;
}>;

export type ResolveRealmSharedForestLayoutOptions = Readonly<{
  /** Paired public metadata row; it must arrive with the tree rows. */
  layout: unknown;
  /** Paired public instance rows; the client never accepts a partial array. */
  rows: unknown;
  /** Explicit DEV/test-only preview bridge for an older service. */
  allowLegacyFallback?: boolean;
  realmId: string;
  renderMap: RealmTerrainMap;
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>;
  species: readonly RealmForestSpecies[];
  protectedTileKeys?: ReadonlySet<string>;
  isCoordPassable?: (coord: HexCoord) => boolean;
  hexSize?: number;
  maximumInstanceCount?: number;
  maximumTriangleCount?: number;
}>;

/** A fully attested, immutable renderer input. No raw database row escapes it. */
export type RealmValidatedSharedForestLayout = Readonly<{
  layout: RealmSharedForestLayoutRecord;
  data: RealmForestBiomeData;
}>;

export type RealmSharedForestLayoutResolution =
  | Readonly<{ source: 'legacy-fallback' }>
  | Readonly<{ source: 'shared'; shared: RealmValidatedSharedForestLayout }>
  | Readonly<{ source: 'blocked' }>;

type ValidatedTree = Readonly<{
  row: RealmSharedForestTreeRecord;
  point: RealmForestTreePoint;
}>;

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function safeString(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && SAFE_SHARED_STRING.test(value);
}

function asObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function asInteger(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value;
  if (safeInteger(value)) return BigInt(value);
  return undefined;
}

function microsToNumber(value: bigint) {
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber)
    ? asNumber / GENESIS_FOREST_LAYOUT_V1_TRANSFORM_MICROUNITS
    : undefined;
}

function isFoliageTerrain(kind: RealmTerrainKind | undefined) {
  return kind === 'forest' || kind === 'lowland' || kind === 'meadow';
}

function isPassable(
  coord: HexCoord,
  isCoordPassable: ResolveRealmSharedForestLayoutOptions['isCoordPassable']
) {
  if (!isCoordPassable) return true;
  try {
    return isCoordPassable(coord) === true;
  } catch {
    return false;
  }
}

function oneLayoutRow(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.length === 1 ? value[0] : undefined;
}

function readLayoutRow(value: unknown): RealmSharedForestLayoutRecord | undefined {
  const row = asObject(oneLayoutRow(value));
  if (
    !row
    || !safeString(row.realmId)
    || !safeInteger(row.layoutVersion)
    || !safeString(row.policyVersion)
    || typeof row.layoutDigest !== 'string'
    || typeof row.assetCatalogDigest !== 'string'
    || !safeInteger(row.instanceCount)
  ) return undefined;
  if (
    !SHA_256_HEX.test(row.layoutDigest)
    || !SHA_256_HEX.test(row.assetCatalogDigest)
    || row.instanceCount < 0
  ) return undefined;
  return Object.freeze({
    realmId: row.realmId,
    layoutVersion: row.layoutVersion,
    policyVersion: row.policyVersion,
    layoutDigest: row.layoutDigest,
    assetCatalogDigest: row.assetCatalogDigest,
    instanceCount: row.instanceCount
  });
}

function readTreeRow(value: unknown): RealmSharedForestTreeRecord | undefined {
  const row = asObject(value);
  if (
    !row
    || !safeString(row.treeId)
    || !TREE_ID_PATTERN.test(row.treeId)
    || !safeString(row.realmId)
    || !safeString(row.tileKey)
    || !safeInteger(row.q)
    || !safeInteger(row.r)
    || !safeString(row.speciesId)
    || !safeString(row.habitat)
    || !safeInteger(row.layoutVersion)
  ) return undefined;
  const localXMicrounits = asInteger(row.localXMicrounits);
  const localZMicrounits = asInteger(row.localZMicrounits);
  const worldXMicrounits = asInteger(row.worldXMicrounits);
  const worldZMicrounits = asInteger(row.worldZMicrounits);
  const rotationMilliDegrees = asInteger(row.rotationMilliDegrees);
  const scaleBasisPoints = asInteger(row.scaleBasisPoints);
  if (
    localXMicrounits === undefined
    || localZMicrounits === undefined
    || worldXMicrounits === undefined
    || worldZMicrounits === undefined
    || rotationMilliDegrees === undefined
    || scaleBasisPoints === undefined
    || !FOREST_HABITATS.has(row.habitat as RealmForestTreePoint['habitat'])
    || rotationMilliDegrees < 0n
    || rotationMilliDegrees >= MILLI_DEGREES_PER_TURN
    || scaleBasisPoints < SCALE_BASIS_POINTS * 9n / 10n
    || scaleBasisPoints > SCALE_BASIS_POINTS * 11n / 10n
  ) return undefined;
  return Object.freeze({
    treeId: row.treeId,
    realmId: row.realmId,
    tileKey: row.tileKey,
    q: row.q,
    r: row.r,
    localXMicrounits,
    localZMicrounits,
    worldXMicrounits,
    worldZMicrounits,
    rotationMilliDegrees,
    scaleBasisPoints,
    speciesId: row.speciesId,
    habitat: row.habitat as RealmForestTreePoint['habitat'],
    layoutVersion: row.layoutVersion
  });
}

function indexedSpecies(species: readonly RealmForestSpecies[]) {
  const indexed = new Map<string, RealmForestSpecies>();
  for (const candidate of species) {
    if (
      !safeString(candidate.id)
      || indexed.has(candidate.id)
      || !safeInteger(candidate.triangles)
      || candidate.triangles <= 0
      || !finiteNumber(candidate.footprintDiameter)
      || candidate.footprintDiameter <= 0
    ) return undefined;
    indexed.set(candidate.id, candidate);
  }
  return indexed;
}

function canopyWeight(habitat: RealmForestTreePoint['habitat']) {
  if (habitat === 'grove') return 1;
  if (habitat === 'forest') return 0.68;
  return 0.42;
}

function sharedCounts(
  points: readonly RealmForestTreePoint[],
  renderMap: RealmTerrainMap,
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  protectedTileKeys: ReadonlySet<string>,
  isCoordPassable: ResolveRealmSharedForestLayoutOptions['isCoordPassable']
) {
  const pointKeys = new Set(points.map((point) => hexKey(point.coord)));
  const groveKeys = new Set(points
    .filter((point) => point.habitat === 'grove')
    .map((point) => hexKey(point.coord)));
  const fringeKeys = new Set(points
    .filter((point) => point.habitat === 'fringe')
    .map((point) => hexKey(point.coord)));
  let forestSemanticCellCount = 0;
  let eligibleFoliageCellCount = 0;
  let openFoliageCellCount = 0;
  let openCellCount = 0;
  for (const cell of renderMap.cells) {
    const key = hexKey(cell.coord);
    const kind = terrainKindsByKey.get(key);
    if (kind === 'forest') forestSemanticCellCount += 1;
    const eligible = kind !== undefined
      && isFoliageTerrain(kind)
      && !protectedTileKeys.has(key)
      && isPassable(cell.coord, isCoordPassable);
    if (!eligible) {
      openCellCount += 1;
      continue;
    }
    eligibleFoliageCellCount += 1;
    if (!pointKeys.has(key)) {
      openFoliageCellCount += 1;
      openCellCount += 1;
    }
  }
  return Object.freeze({
    forestSemanticCellCount,
    groveCellCount: groveKeys.size,
    fringeCellCount: fringeKeys.size,
    eligibleFoliageCellCount,
    openFoliageCellCount,
    openCellCount,
    treeCount: points.length,
    speciesCount: new Set(points.map((point) => point.speciesId)).size,
    estimatedTriangleCount: points.reduce((total, point) => total + point.estimatedTriangles, 0)
  });
}

/**
 * Decode the paired public tables into one immutable renderer input. Both
 * records are checked against the compiled canonical policy constants before
 * a model can load. A one-sided, malformed, unseeded, or over-budget table is
 * intentionally `blocked`; only an explicit DEV/test opt-in can use the old
 * deterministic preview while neither additive table exists.
 */
export function resolveRealmSharedForestLayout(
  options: ResolveRealmSharedForestLayoutOptions
): RealmSharedForestLayoutResolution {
  if (options.layout === undefined && options.rows === undefined) {
    // This remains a local visual fixture only. The production bundle must
    // never accept a caller-provided switch that revives procedural tree
    // positions after the shared layout migration.
    return import.meta.env.DEV && options.allowLegacyFallback === true
      ? Object.freeze({ source: 'legacy-fallback' })
      : Object.freeze({ source: 'blocked' });
  }
  if (options.layout === undefined || options.rows === undefined || !Array.isArray(options.rows)) {
    return Object.freeze({ source: 'blocked' });
  }
  const layout = readLayoutRow(options.layout);
  if (
    !layout
    || !safeString(options.realmId)
    || layout.realmId !== options.realmId
    || layout.layoutVersion !== GENESIS_FOREST_LAYOUT_V1_VERSION
    || layout.policyVersion !== GENESIS_FOREST_LAYOUT_V1_POLICY_VERSION
    || layout.layoutDigest !== GENESIS_FOREST_LAYOUT_V1_DIGEST
    || layout.assetCatalogDigest !== GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST
    || layout.instanceCount !== GENESIS_FOREST_LAYOUT_V1_TREE_COUNT
    || options.rows.length !== GENESIS_FOREST_LAYOUT_V1_TREE_COUNT
  ) return Object.freeze({ source: 'blocked' });

  const maximumInstanceCount = Number.isSafeInteger(options.maximumInstanceCount)
    ? Math.max(0, options.maximumInstanceCount!)
    : REALM_FOREST_BIOME_BUDGETS.high.instances;
  const maximumTriangleCount = Number.isSafeInteger(options.maximumTriangleCount)
    ? Math.max(0, options.maximumTriangleCount!)
    : REALM_FOREST_BIOME_BUDGETS.high.triangles;
  if (GENESIS_FOREST_LAYOUT_V1_TREE_COUNT > maximumInstanceCount) {
    return Object.freeze({ source: 'blocked' });
  }
  const speciesById = indexedSpecies(options.species);
  if (!speciesById) return Object.freeze({ source: 'blocked' });
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0
    ? options.hexSize!
    : 1;
  const protectedTileKeys = options.protectedTileKeys ?? new Set<string>();
  const treeIds = new Set<string>();
  const validated: ValidatedTree[] = [];
  let estimatedTriangles = 0;

  for (const rawRow of options.rows) {
    const row = readTreeRow(rawRow);
    if (
      !row
      || row.realmId !== layout.realmId
      || row.layoutVersion !== layout.layoutVersion
      || treeIds.has(row.treeId)
    ) return Object.freeze({ source: 'blocked' });
    const tileCoord = parseHexKey(row.tileKey);
    const localX = microsToNumber(row.localXMicrounits);
    const localZ = microsToNumber(row.localZMicrounits);
    const worldX = microsToNumber(row.worldXMicrounits);
    const worldZ = microsToNumber(row.worldZMicrounits);
    if (
      !tileCoord
      || localX === undefined
      || localZ === undefined
      || worldX === undefined
      || worldZ === undefined
      || tileCoord.q !== row.q
      || tileCoord.r !== row.r
      || row.tileKey !== hexKey(tileCoord)
      || protectedTileKeys.has(row.tileKey)
      || !isFoliageTerrain(options.terrainKindsByKey.get(row.tileKey))
      || !isPassable(tileCoord, options.isCoordPassable)
    ) return Object.freeze({ source: 'blocked' });
    // Metadata declares the expected content-addressed layout, but this exact
    // row comparison proves that the subscribed instance data actually is
    // that compiled layout before any mutable browser mesh is constructed.
    if (!matchesCanonicalGenesisForestInstanceV1({
      treeId: row.treeId,
      realmId: row.realmId,
      tileKey: row.tileKey,
      q: row.q,
      r: row.r,
      localXMicrounits: row.localXMicrounits,
      localZMicrounits: row.localZMicrounits,
      worldXMicrounits: row.worldXMicrounits,
      worldZMicrounits: row.worldZMicrounits,
      rotationMilliDegrees: Number(row.rotationMilliDegrees),
      scaleBasisPoints: Number(row.scaleBasisPoints),
      speciesId: row.speciesId,
      habitat: row.habitat,
      layoutVersion: row.layoutVersion
    })) return Object.freeze({ source: 'blocked' });
    const center = axialToWorld(tileCoord, hexSize);
    if (
      Math.abs(worldX - (center.x + localX)) > MICRO_UNIT_TOLERANCE
      || Math.abs(worldZ - (center.z + localZ)) > MICRO_UNIT_TOLERANCE
      || pointyHexBoundaryDistance({ x: localX, z: localZ }, hexSize)
        > REALM_SHARED_FOREST_MAXIMUM_BOUNDARY_DISTANCE
    ) return Object.freeze({ source: 'blocked' });
    const species = speciesById.get(row.speciesId);
    if (!species || species.footprintDiameter === undefined) {
      return Object.freeze({ source: 'blocked' });
    }
    estimatedTriangles += species.triangles;
    if (estimatedTriangles > maximumTriangleCount) return Object.freeze({ source: 'blocked' });
    const point = Object.freeze({
      speciesId: row.speciesId,
      coord: Object.freeze({ q: row.q, r: row.r }),
      world: Object.freeze({ x: worldX, z: worldZ }),
      rotation: Number(row.rotationMilliDegrees) * Math.PI
        / (180 * GENESIS_FOREST_LAYOUT_V1_ROTATION_MILLIDEGREE_SCALE),
      scale: Number(row.scaleBasisPoints) / Number(SCALE_BASIS_POINTS),
      habitat: row.habitat,
      estimatedTriangles: species.triangles,
      footprintDiameter: species.footprintDiameter
    });
    // The shared catalog is identical at every quality tier. Its safety gate
    // therefore cannot depend on an LOD-specific mesh footprint: that would
    // make a valid server layout disappear on only one device. Retain the
    // catalog-independent minimum spacing while exact row matching remains
    // the authority for the reviewed broader canopy composition.
    if (validated.some((candidate) => (
      Math.hypot(
        candidate.point.world.x - point.world.x,
        candidate.point.world.z - point.world.z
      ) < REALM_FOREST_TREE_MINIMUM_SEPARATION * hexSize
    ))) return Object.freeze({ source: 'blocked' });
    treeIds.add(row.treeId);
    validated.push(Object.freeze({ row, point }));
  }

  validated.sort((left, right) => left.row.treeId.localeCompare(right.row.treeId));
  const points = Object.freeze(validated.map((tree) => tree.point));
  const canopyByTileKey = new Map<string, number>();
  points.forEach((point) => {
    const key = hexKey(point.coord);
    canopyByTileKey.set(key, Math.max(
      canopyByTileKey.get(key) ?? 0,
      canopyWeight(point.habitat)
    ));
  });
  const data: RealmForestBiomeData = Object.freeze({
    points,
    canopyByTileKey,
    counts: sharedCounts(
      points,
      options.renderMap,
      options.terrainKindsByKey,
      protectedTileKeys,
      options.isCoordPassable
    ),
    instanceBudget: maximumInstanceCount,
    triangleBudget: maximumTriangleCount
  });
  return Object.freeze({
    source: 'shared',
    shared: Object.freeze({ layout, data })
  });
}
