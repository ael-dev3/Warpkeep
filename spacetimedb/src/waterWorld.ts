import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  HEGEMONY_REALM_ID,
  HEGEMONY_WORLD_SEED,
  deriveChannelSeed,
  hashSeedString,
  hexDistance,
  hexKey,
  neighboringHexes,
  mixUint32,
  type CanonicalWorldTile,
  type CanonicalWorldTileMeta,
} from './world';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from './goldSitePolicy';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from './foodSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from './woodSitePolicy';
import { CANONICAL_GENESIS_FOREST_INSTANCES_V1 } from './forestLayoutPolicy';
import { canonicalLowlandsTerrainCenterHeight } from './lowlandsSurface';

/**
 * Genesis water is an additive presentation/authority layer. The canonical
 * land set is never regenerated here; the water apron is the complete radius
 * 65 disc minus the already deployed 10,000 land cells.
 */
export const GENESIS_WATER_LAYOUT_VERSION = 1;
export const GENESIS_WATER_OCEAN_RADIUS = 65;
export const GENESIS_WATER_OCEAN_CELL_COUNT = 2_871;
export const GENESIS_OCEAN_FOG_START_DEPTH_CELLS = 3;
export const GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS = 5;
export const GENESIS_OCEAN_HIDDEN_BUFFER_CELLS = 2;
export const GENESIS_WATER_RIVER_COUNT = 12;
export const GENESIS_WATER_RIVER_MIN_CELLS = 360;
export const GENESIS_WATER_RIVER_MAX_CELLS = 480;
export const GENESIS_WATER_PATH_MIN_CELLS = 24;
export const GENESIS_WATER_PATH_MAX_CELLS = 72;
export const GENESIS_WATER_POLICY_VERSION = 'genesis-001-canonical-water-v1';
/** Fixed-point datum used by persisted Water elevations; world Y=0 is 1,000 milli. */
export const GENESIS_WATER_ELEVATION_DATUM_MILLI = 1_000;
/** Minimum center-point clearance between canonical terrain and a river surface. */
export const GENESIS_WATER_RIVER_CLEARANCE_MILLI = 4;
/** Minimum center-point clearance between canonical terrain and a lake surface. */
export const GENESIS_WATER_LAKE_CLEARANCE_MILLI = 4;
export const GENESIS_WATER_SEA_LEVEL_POLICY_VERSION =
  'coastal-median-minus-fixed-point-tide-v1';
export const GENESIS_WATER_ENVIRONMENT_EPOCH = 1n;
export const GENESIS_WATER_SUN_DIRECTION_MICRO = Object.freeze({
  x: 286_000,
  y: 890_000,
  z: 355_000,
});

export type GenesisWaterRegime = 'ocean' | 'lake' | 'river';

export type GenesisWaterCellV1 = Readonly<{
  realmId: string;
  cellKey: string;
  q: number;
  r: number;
  regime: GenesisWaterRegime;
  bodyId: string;
  depthCells: number;
  elevationMilli: number;
  surfaceLevelMilli: number;
  ring: number;
  s: number;
  underlyingTileKey?: string;
  riverOrdinal?: number;
  riverOrder?: number;
  downstreamWaterCellKey?: string;
  flowAccumulation: number;
  depthClass: number;
  oceanDepth: number;
  bankSeed: number;
  generationVersion: number;
  fogBand: 'clear' | 'haze' | 'full';
  layoutVersion: number;
}>;

export type GenesisWaterBodyV1 = Readonly<{
  bodyId: string;
  realmId: string;
  regime: GenesisWaterRegime;
  cellCount: number;
  sourceCellKey: string;
  mouthCellKey: string;
  surfaceLevelMilli: number;
  flowDirectionXQ15: number;
  flowDirectionZQ15: number;
  wavePreset: string;
  ordinal: number;
  seed: number;
  generationVersion: number;
  layoutVersion: number;
}>;

export type GenesisWaterRiverV1 = Readonly<{
  riverId: string;
  sector: number;
  sourceCellKey: string;
  mouthCellKey: string;
  orderedCellKeys: readonly string[];
  sourceElevationMilli: number;
  mouthElevationMilli: number;
}>;

/**
 * Frozen, browser/server-neutral drainage analysis. The parent pointer always
 * points one step closer to a coastal outlet, so it is a downstream DAG rather
 * than a runtime pathfinding result. All fields are fixed-point/integer values.
 */
export type GenesisHydrologyCellV1 = Readonly<{
  tileKey: string;
  elevationMilli: number;
  filledElevationMilli: number;
  downstreamTileKey?: string;
  flowAccumulation: number;
  distanceToCoast: number;
}>;

export type GenesisWaterLayoutV1 = Readonly<{
  realmId: string;
  layoutVersion: number;
  policyVersion: string;
  generationVersion: number;
  canonicalLandCellCount: number;
  oceanCellCount: number;
  lakeCellCount: number;
  lakeBodyCount: number;
  riverCount: number;
  riverCellCount: number;
  seaLevelMilli: number;
  seaLevelPolicyVersion: string;
  fogStartDepthCells: number;
  fogFullDepthCells: number;
  hiddenBufferCells: number;
  layoutDigest: string;
  sourceCommit: string;
}>;

export type GenesisWaterEnvironmentV1 = Readonly<{
  realmId: string;
  environmentEpoch: bigint;
  waterLayoutVersion: number;
  seaLevelMilli: number;
  sunDirectionXMicro: number;
  sunDirectionYMicro: number;
  sunDirectionZMicro: number;
}>;

export type GenesisWaterEnvironmentState = 'missing' | 'exact' | 'conflict';

type Coord = Readonly<{ q: number; r: number; key: string }>;

const compareCoords = (left: Pick<Coord, 'q' | 'r'>, right: Pick<Coord, 'q' | 'r'>) => (
  left.q - right.q || left.r - right.r
);

function compareStableKeys(left: Coord, right: Coord): number {
  return compareCoords(left, right) || left.key.localeCompare(right.key);
}

function sectorForCoord(q: number, r: number): number {
  const s = -q - r;
  if (q === 0 && r === 0) return 0;
  if (q > 0 && r >= 0) return 1;
  if (r > 0 && q <= 0 && s < 0) return 2;
  if (q < 0 && r > 0 && s >= 0) return 3;
  if (q < 0 && r <= 0) return 4;
  if (r < 0 && q >= 0 && s > 0) return 5;
  return 6;
}

function hexDisc(radius: number): readonly Coord[] {
  const cells: Coord[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minR = Math.max(-radius, -q - radius);
    const maxR = Math.min(radius, -q + radius);
    for (let r = minR; r <= maxR; r += 1) {
      cells.push(Object.freeze({ q, r, key: hexKey(q, r) }));
    }
  }
  return Object.freeze(cells.sort(compareStableKeys));
}

const canonicalLandByKey = new Map(CANONICAL_WORLD_TILES.map(tile => [tile.key, tile]));
const canonicalMetaByKey = new Map(CANONICAL_WORLD_TILE_META.map(meta => [meta.tileKey, meta]));
const waterDisc = hexDisc(GENESIS_WATER_OCEAN_RADIUS);
const waterDiscByKey = new Map(waterDisc.map(cell => [cell.key, cell]));

if (CANONICAL_WORLD_TILES.length !== 10_000) throw new Error('GENESIS_WATER_LAND_COUNT');
if (waterDisc.length !== 12_871) throw new Error('GENESIS_WATER_DISC_COUNT');

const oceanCells = Object.freeze(waterDisc.filter(cell => !canonicalLandByKey.has(cell.key)));
if (oceanCells.length !== GENESIS_WATER_OCEAN_CELL_COUNT) {
  throw new Error('GENESIS_WATER_OCEAN_COUNT');
}

const oceanKeys = new Set(oceanCells.map(cell => cell.key));
const landKeys = new Set(CANONICAL_WORLD_TILES.map(tile => tile.key));

function oceanNeighbors(cell: Coord): Coord[] {
  return neighboringHexes(cell)
    .map(coord => waterDiscByKey.get(hexKey(coord.q, coord.r)))
    .filter((candidate): candidate is Coord => candidate !== undefined && oceanKeys.has(candidate.key));
}

function hasLandNeighbor(cell: Coord): boolean {
  return neighboringHexes(cell).some(coord => landKeys.has(hexKey(coord.q, coord.r)));
}

/** Distance from the canonical coast, measured only through the apron. */
function buildOceanDepths(): ReadonlyMap<string, number> {
  const depths = new Map<string, number>();
  const queue: Coord[] = [];
  for (const cell of oceanCells) {
    if (!hasLandNeighbor(cell)) continue;
    depths.set(cell.key, 1);
    queue.push(cell);
  }
  queue.sort(compareStableKeys);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const nextDepth = depths.get(current.key)! + 1;
    for (const neighbor of oceanNeighbors(current)) {
      if (depths.has(neighbor.key)) continue;
      depths.set(neighbor.key, nextDepth);
      queue.push(neighbor);
    }
  }
  if (depths.size !== oceanCells.length) throw new Error('GENESIS_WATER_OCEAN_DISCONNECTED');
  const maxDepth = Math.max(...depths.values());
  if (maxDepth < GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS + GENESIS_OCEAN_HIDDEN_BUFFER_CELLS) {
    throw new Error('GENESIS_WATER_FOG_BUFFER');
  }
  return depths;
}

export const GENESIS_OCEAN_DEPTH_BY_KEY = buildOceanDepths();

function fogBandForDepth(depth: number): GenesisWaterCellV1['fogBand'] {
  if (depth >= GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS) return 'full';
  if (depth >= GENESIS_OCEAN_FOG_START_DEPTH_CELLS) return 'haze';
  return 'clear';
}

/** The shared natural terrain field, quantized before any hydrology decision. */
export function genesisWaterElevationMilli(q: number, r: number): number {
  return GENESIS_WATER_ELEVATION_DATUM_MILLI
    + Math.round(canonicalLowlandsTerrainCenterHeight(HEGEMONY_WORLD_SEED, q, r) * 1_000);
}

/** Convert persisted fixed-point Water heights into the renderer's world-Y space. */
export function genesisWaterWorldHeightFromMilli(elevationMilli: number): number {
  return (elevationMilli - GENESIS_WATER_ELEVATION_DATUM_MILLI) / 1_000;
}

const canonicalElevations = new Map(
  CANONICAL_WORLD_TILES.map(tile => [tile.key, genesisWaterElevationMilli(tile.q, tile.r)]),
);

function elevationForKey(key: string): number {
  const land = canonicalLandByKey.get(key);
  if (land !== undefined) return canonicalElevations.get(key)!;
  const ocean = waterDiscByKey.get(key);
  if (ocean !== undefined) return genesisWaterElevationMilli(ocean.q, ocean.r);
  return 0;
}

const coastalLandElevations = CANONICAL_WORLD_TILES.filter(tile => (
  neighboringHexes(tile).some(coord => oceanKeys.has(hexKey(coord.q, coord.r)))
)).map(tile => canonicalElevations.get(tile.key)!);
if (coastalLandElevations.length === 0) throw new Error('GENESIS_WATER_COAST_EMPTY');
coastalLandElevations.sort((left, right) => left - right);
const coastalMedian = coastalLandElevations[Math.floor(coastalLandElevations.length / 2)]!;

export type GenesisWaterCoastAnalysisV1 = Readonly<{
  sampleCount: number;
  minMilli: number;
  maxMilli: number;
  meanMilli: number;
  medianMilli: number;
  quantile10Milli: number;
  quantile90Milli: number;
  bySector: readonly Readonly<{
    sector: number;
    sampleCount: number;
    minMilli: number;
    maxMilli: number;
    medianMilli: number;
  }>[];
}>;

function quantile(values: readonly number[], fraction: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]!;
}

export const GENESIS_WATER_COAST_ANALYSIS_V1: GenesisWaterCoastAnalysisV1 = Object.freeze({
  sampleCount: coastalLandElevations.length,
  minMilli: coastalLandElevations[0]!,
  maxMilli: coastalLandElevations[coastalLandElevations.length - 1]!,
  meanMilli: Math.round(coastalLandElevations.reduce((sum, value) => sum + value, 0) / coastalLandElevations.length),
  medianMilli: coastalMedian,
  quantile10Milli: quantile(coastalLandElevations, 0.1),
  quantile90Milli: quantile(coastalLandElevations, 0.9),
  bySector: Object.freeze([...Array(6)].map((_, index) => {
    const sector = index + 1;
    const values = CANONICAL_WORLD_TILES
      .filter(tile => sectorForCoord(tile.q, tile.r) === sector
        && neighboringHexes(tile).some(coord => oceanKeys.has(hexKey(coord.q, coord.r))))
      .map(tile => canonicalElevations.get(tile.key)!)
      .sort((left, right) => left - right);
    return Object.freeze({
      sector,
      sampleCount: values.length,
      minMilli: values[0] ?? 0,
      maxMilli: values.length === 0 ? 0 : values[values.length - 1]!,
      medianMilli: values.length === 0 ? 0 : values[Math.floor(values.length / 2)]!,
    });
  })),
});
/** Fixed-point sea level is derived from the reviewed coastal median. */
export const GENESIS_WATER_SEA_LEVEL_MILLI = coastalMedian - 24;

export const GENESIS_WATER_ENVIRONMENT_V1: GenesisWaterEnvironmentV1 = Object.freeze({
  realmId: HEGEMONY_REALM_ID,
  environmentEpoch: GENESIS_WATER_ENVIRONMENT_EPOCH,
  waterLayoutVersion: GENESIS_WATER_LAYOUT_VERSION,
  seaLevelMilli: GENESIS_WATER_SEA_LEVEL_MILLI,
  sunDirectionXMicro: GENESIS_WATER_SUN_DIRECTION_MICRO.x,
  sunDirectionYMicro: GENESIS_WATER_SUN_DIRECTION_MICRO.y,
  sunDirectionZMicro: GENESIS_WATER_SUN_DIRECTION_MICRO.z,
});

export function matchesGenesisWaterEnvironmentV1(
  row: GenesisWaterEnvironmentV1,
): boolean {
  return row.realmId === GENESIS_WATER_ENVIRONMENT_V1.realmId
    && row.environmentEpoch === GENESIS_WATER_ENVIRONMENT_V1.environmentEpoch
    && row.waterLayoutVersion === GENESIS_WATER_ENVIRONMENT_V1.waterLayoutVersion
    && row.seaLevelMilli === GENESIS_WATER_ENVIRONMENT_V1.seaLevelMilli
    && row.sunDirectionXMicro === GENESIS_WATER_ENVIRONMENT_V1.sunDirectionXMicro
    && row.sunDirectionYMicro === GENESIS_WATER_ENVIRONMENT_V1.sunDirectionYMicro
    && row.sunDirectionZMicro === GENESIS_WATER_ENVIRONMENT_V1.sunDirectionZMicro;
}

export function classifyGenesisWaterEnvironmentV1(
  rows: Iterable<GenesisWaterEnvironmentV1>,
): GenesisWaterEnvironmentState {
  let count = 0;
  for (const row of rows) {
    count += 1;
    if (!matchesGenesisWaterEnvironmentV1(row)) return 'conflict';
  }
  if (count === 0) return 'missing';
  return count === 1 ? 'exact' : 'conflict';
}

function bodyIdFor(regime: GenesisWaterRegime, key: string): string {
  return `${GENESIS_WATER_POLICY_VERSION}:${regime}:${key}`;
}

function makeLakeBodies(): {
  bodies: readonly GenesisWaterBodyV1[];
  cells: readonly GenesisWaterCellV1[];
} {
  const lakeMeta = new Map(
    CANONICAL_WORLD_TILE_META
      .filter(meta => meta.terrainKind === 'lake')
      .map(meta => [meta.tileKey, meta]),
  );
  const seen = new Set<string>();
  const bodies: GenesisWaterBodyV1[] = [];
  const cells: GenesisWaterCellV1[] = [];
  for (const meta of [...lakeMeta.values()].sort((a, b) => a.tileKey.localeCompare(b.tileKey))) {
    if (seen.has(meta.tileKey)) continue;
    const component: CanonicalWorldTileMeta[] = [];
    const queue = [meta];
    seen.add(meta.tileKey);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      component.push(current);
      const currentTile = canonicalLandByKey.get(current.tileKey)!;
      for (const neighbor of neighboringHexes(currentTile)) {
        const neighborMeta = lakeMeta.get(hexKey(neighbor.q, neighbor.r));
        if (neighborMeta !== undefined && !seen.has(neighborMeta.tileKey)) {
          seen.add(neighborMeta.tileKey);
          queue.push(neighborMeta);
        }
      }
    }
    component.sort((a, b) => a.tileKey.localeCompare(b.tileKey));
    const first = component[0]!;
    const firstTile = canonicalLandByKey.get(first.tileKey)!;
    const bodyId = bodyIdFor('lake', first.tileKey);
    const surfaceLevelMilli = Math.max(
      GENESIS_WATER_SEA_LEVEL_MILLI + 12,
      Math.max(...component.map(item => elevationForKey(item.tileKey)))
        + GENESIS_WATER_LAKE_CLEARANCE_MILLI,
    );
    bodies.push(Object.freeze({
      bodyId,
      realmId: HEGEMONY_REALM_ID,
      regime: 'lake',
      cellCount: component.length,
      sourceCellKey: first.tileKey,
      mouthCellKey: first.tileKey,
      surfaceLevelMilli,
      flowDirectionXQ15: 0,
      flowDirectionZQ15: 0,
      wavePreset: 'lake-ripple-v1',
      ordinal: bodies.length,
      seed: deriveChannelSeed(HEGEMONY_WORLD_SEED, firstTile.q, firstTile.r, 'genesis-water-lake-body'),
      generationVersion: 3,
      layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
    }));
    for (const lakeCell of component) {
      const lakeTile = canonicalLandByKey.get(lakeCell.tileKey)!;
      cells.push(Object.freeze({
        realmId: HEGEMONY_REALM_ID,
        cellKey: lakeCell.tileKey,
        q: lakeTile.q,
        r: lakeTile.r,
        regime: 'lake',
        bodyId,
        depthCells: 0,
        elevationMilli: elevationForKey(lakeCell.tileKey),
        surfaceLevelMilli,
        ring: lakeTile.q === 0 && lakeTile.r === 0 ? 0 : hexDistance(lakeTile),
        s: -lakeTile.q - lakeTile.r,
        underlyingTileKey: lakeCell.tileKey,
        riverOrdinal: undefined,
        riverOrder: undefined,
        downstreamWaterCellKey: undefined,
        flowAccumulation: 1,
        depthClass: 1,
        oceanDepth: 0,
        bankSeed: deriveChannelSeed(HEGEMONY_WORLD_SEED, lakeTile.q, lakeTile.r, 'genesis-water-v1-bank'),
        generationVersion: 3,
        fogBand: 'clear',
        layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
      }));
    }
  }
  bodies.sort((a, b) => a.bodyId.localeCompare(b.bodyId));
  cells.sort((a, b) => a.cellKey.localeCompare(b.cellKey));
  return { bodies: Object.freeze(bodies), cells: Object.freeze(cells) };
}

export const GENESIS_LAKE_LAYOUT = makeLakeBodies();

const canonicalStaticExclusions = new Set<string>([
  ...CANONICAL_CASTLE_SLOTS.map(slot => slot.tileKey),
  ...CANONICAL_TIER_I_GOLD_SITES_V1.map(site => hexKey(site.q, site.r)),
  ...CANONICAL_TIER_I_FOOD_SITES_V1.map(site => hexKey(site.q, site.r)),
  ...CANONICAL_TIER_I_WOOD_SITES_V1.map(site => hexKey(site.q, site.r)),
  ...CANONICAL_GENESIS_FOREST_INSTANCES_V1.map(tree => tree.tileKey),
]);

const hydrologyAllowedKeys = new Set(
  CANONICAL_WORLD_TILES
    .filter(tile => {
      const meta = canonicalMetaByKey.get(tile.key);
      return meta !== undefined
        && meta.passable
        && !canonicalStaticExclusions.has(tile.key)
        && meta.terrainKind !== 'lake'
        && meta.terrainKind !== 'ancient-stone';
    })
    .map(tile => tile.key),
);

/**
 * Deterministic coast-distance drainage over the eligible canonical land
 * graph. Every parent is exactly one breadth-first step nearer a low coastal
 * outlet. This makes the frozen downstream relation an acyclic graph and
 * gives the reverse traversal a stable flow-accumulation order.
 */
function buildGenesisHydrology(): ReadonlyMap<string, GenesisHydrologyCellV1> {
  const outlets = CANONICAL_WORLD_TILES
    .filter(tile => hydrologyAllowedKeys.has(tile.key)
      && elevationForKey(tile.key)
        <= GENESIS_WATER_SEA_LEVEL_MILLI - GENESIS_WATER_RIVER_CLEARANCE_MILLI
      && neighboringHexes(tile).some(coord => oceanKeys.has(hexKey(coord.q, coord.r))))
    .sort(compareStableKeys);
  if (outlets.length === 0) throw new Error('GENESIS_WATER_HYDROLOGY_NO_OUTLETS');

  const filled = new Map<string, number>();
  const downstream = new Map<string, string | undefined>();
  const distanceToCoast = new Map<string, number>();
  const order: string[] = [];
  const queue: CanonicalWorldTile[] = [];
  for (const outlet of outlets) {
    filled.set(outlet.key, GENESIS_WATER_SEA_LEVEL_MILLI);
    downstream.set(outlet.key, undefined);
    distanceToCoast.set(outlet.key, 0);
    queue.push(outlet);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    order.push(current.key);
    const currentDistance = distanceToCoast.get(current.key)!;
    const neighbors = neighboringHexes(current)
      .map(coord => canonicalLandByKey.get(hexKey(coord.q, coord.r)))
      .filter((neighbor): neighbor is CanonicalWorldTile => (
        neighbor !== undefined
        && hydrologyAllowedKeys.has(neighbor.key)
        && !filled.has(neighbor.key)
      ))
      .sort((left, right) => (
        elevationForKey(left.key) - elevationForKey(right.key)
        || deriveChannelSeed(HEGEMONY_WORLD_SEED, left.q, left.r, 'genesis-water-v1-hydrology')
          - deriveChannelSeed(HEGEMONY_WORLD_SEED, right.q, right.r, 'genesis-water-v1-hydrology')
        || compareCoords(left, right)
      ));
    for (const neighbor of neighbors) {
      const nextFilled = Math.max(elevationForKey(neighbor.key), filled.get(current.key)!);
      filled.set(neighbor.key, nextFilled);
      downstream.set(neighbor.key, current.key);
      distanceToCoast.set(neighbor.key, currentDistance + 1);
      queue.push(neighbor);
    }
  }
  if (order.length !== hydrologyAllowedKeys.size) {
    throw new Error(`GENESIS_WATER_HYDROLOGY_UNREACHABLE_${hydrologyAllowedKeys.size - order.length}`);
  }

  const accumulation = new Map<string, number>(order.map(key => [key, 1]));
  for (const key of [...order].reverse()) {
    const parent = downstream.get(key);
    if (parent !== undefined) accumulation.set(parent, accumulation.get(parent)! + accumulation.get(key)!);
  }
  return new Map(order.map(key => [key, Object.freeze({
    tileKey: key,
    elevationMilli: elevationForKey(key),
    filledElevationMilli: filled.get(key)!,
    downstreamTileKey: downstream.get(key),
    flowAccumulation: accumulation.get(key)!,
    distanceToCoast: distanceToCoast.get(key)!,
  })]));
}

export const GENESIS_HYDROLOGY_V1 = buildGenesisHydrology();

function flowDirectionForPath(path: readonly string[]): Readonly<{ x: number; z: number }> {
  const source = canonicalLandByKey.get(path[0]!)!;
  const mouth = canonicalLandByKey.get(path[path.length - 1]!)!;
  const deltaQ = mouth.q - source.q;
  const deltaR = mouth.r - source.r;
  const dx = Math.sqrt(3) * (deltaQ + deltaR * 0.5);
  const dz = 1.5 * deltaR;
  const length = Math.max(1, Math.hypot(dx, dz));
  return Object.freeze({
    x: Math.round((dx / length) * 32_767),
    z: Math.round((dz / length) * 32_767),
  });
}

function riverSurfaceLevels(path: readonly string[]): ReadonlyMap<string, number> {
  const levels = new Map<string, number>();
  const mouthIndex = path.length - 1;
  const mouthKey = path[mouthIndex]!;
  if (elevationForKey(mouthKey) + GENESIS_WATER_RIVER_CLEARANCE_MILLI
    > GENESIS_WATER_SEA_LEVEL_MILLI) {
    throw new Error('GENESIS_WATER_RIVER_MOUTH_CLEARANCE');
  }
  levels.set(mouthKey, GENESIS_WATER_SEA_LEVEL_MILLI);
  let downstreamLevel = GENESIS_WATER_SEA_LEVEL_MILLI;
  for (let index = mouthIndex - 1; index >= 0; index -= 1) {
    const key = path[index]!;
    const level = Math.max(
      elevationForKey(key) + GENESIS_WATER_RIVER_CLEARANCE_MILLI,
      downstreamLevel,
    );
    levels.set(key, level);
    downstreamLevel = level;
  }
  return levels;
}

function riverAllowed(meta: CanonicalWorldTileMeta | undefined, key: string): boolean {
  if (meta === undefined || !meta.passable || canonicalStaticExclusions.has(key)) return false;
  // `staticContentKind` resource/core rows are capability anchors, not placed
  // structures. The exact reviewed Gold/Food/Wood/forest/castle coordinates
  // above are the placement authority; routing around every future-capable
  // anchor would make the twelve-sector capacity contract unsatisfiable on
  // this frozen base. A river remains presentation-only and never mutates
  // those gameplay rows.
  // A river must not consume a scenic lake or a non-traversable blocker.
  return meta.terrainKind !== 'lake' && meta.terrainKind !== 'ancient-stone';
}

const riverAllowedKeys = new Set(
  CANONICAL_WORLD_TILES
    .filter(tile => riverAllowed(canonicalMetaByKey.get(tile.key), tile.key))
    .map(tile => tile.key),
);
function pathToHydrologyOutlet(sourceKey: string): readonly string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = sourceKey;
  while (cursor !== undefined) {
    if (seen.has(cursor)) throw new Error('GENESIS_WATER_HYDROLOGY_CYCLE');
    seen.add(cursor);
    path.push(cursor);
    const hydrology = GENESIS_HYDROLOGY_V1.get(cursor);
    if (hydrology === undefined) throw new Error('GENESIS_WATER_HYDROLOGY_ROUTE_MISSING');
    cursor = hydrology.downstreamTileKey;
  }
  return Object.freeze(path);
}

function chooseRiverSources(): readonly GenesisWaterRiverV1[] {
  const candidatesBySector = new Map<number, CanonicalWorldTile[]>();
  for (const tile of CANONICAL_WORLD_TILES) {
    const sector = sectorForCoord(tile.q, tile.r);
    const meta = canonicalMetaByKey.get(tile.key);
    if (sector === 0 || hexDistance(tile) < 10 || hexDistance(tile) > 34) continue;
    if (!riverAllowed(meta, tile.key)) continue;
    const candidates = candidatesBySector.get(sector) ?? [];
    candidates.push(tile);
    candidatesBySector.set(sector, candidates);
  }
  for (const candidates of candidatesBySector.values()) {
    candidates.sort((left, right) => (
      elevationForKey(right.key) - elevationForKey(left.key)
      || deriveChannelSeed(HEGEMONY_WORLD_SEED, left.q, left.r, 'genesis-water-river-source')
        - deriveChannelSeed(HEGEMONY_WORLD_SEED, right.q, right.r, 'genesis-water-river-source')
      || compareCoords(left, right)
    ));
  }

  const selected: GenesisWaterRiverV1[] = [];
  const occupied = new Set<string>();
  const mouths = new Set<string>();
  const sources: CanonicalWorldTile[] = [];
  for (let sector = 1; sector <= 6; sector += 1) {
    const candidates = candidatesBySector.get(sector) ?? [];
    for (let riverInSector = 0; riverInSector < 2; riverInSector += 1) {
      let chosen: GenesisWaterRiverV1 | undefined;
      for (const source of candidates) {
        if (sources.some(existing => hexDistance(existing, source) < 10)) continue;
        const path = pathToHydrologyOutlet(source.key);
        if (path.length < GENESIS_WATER_PATH_MIN_CELLS
          || path.length > GENESIS_WATER_PATH_MAX_CELLS
          || path.some(key => occupied.has(key))) continue;
        const mouth = canonicalLandByKey.get(path[path.length - 1]!)!;
        if (sectorForCoord(mouth.q, mouth.r) !== sector || mouths.has(mouth.key)) continue;
        if (selected.some(existing => hexDistance(
          canonicalLandByKey.get(existing.mouthCellKey)!, mouth,
        ) < 5)) continue;
        chosen = Object.freeze({
          riverId: `genesis-001-river-${String(selected.length + 1).padStart(2, '0')}`,
          sector,
          sourceCellKey: source.key,
          mouthCellKey: mouth.key,
          orderedCellKeys: path,
          sourceElevationMilli: elevationForKey(source.key),
          mouthElevationMilli: elevationForKey(mouth.key),
        });
        if (chosen !== undefined) break;
      }
      if (chosen === undefined) throw new Error(`GENESIS_WATER_RIVER_SELECTION_${sector}_${riverInSector}`);
      selected.push(chosen);
      sources.push(canonicalLandByKey.get(chosen.sourceCellKey)!);
      mouths.add(chosen.mouthCellKey);
      chosen.orderedCellKeys.forEach(key => occupied.add(key));
    }
  }
  const riverCellCount = [...occupied].length;
  if (riverCellCount < GENESIS_WATER_RIVER_MIN_CELLS || riverCellCount > GENESIS_WATER_RIVER_MAX_CELLS) {
    throw new Error(`GENESIS_WATER_RIVER_CELL_COUNT_${riverCellCount}`);
  }
  return Object.freeze(selected);
}

export const GENESIS_RIVERS_V1 = chooseRiverSources();

function riverCells(): readonly GenesisWaterCellV1[] {
  const cells: GenesisWaterCellV1[] = [];
  for (const river of GENESIS_RIVERS_V1) {
    const surfaceLevels = riverSurfaceLevels(river.orderedCellKeys);
    for (let index = 0; index < river.orderedCellKeys.length; index += 1) {
      const key = river.orderedCellKeys[index]!;
      const tile = canonicalLandByKey.get(key)!;
      const depthCells = Math.min(index + 1, GENESIS_WATER_PATH_MAX_CELLS);
      const hydrology = GENESIS_HYDROLOGY_V1.get(key);
      const downstreamKey = index + 1 < river.orderedCellKeys.length
        ? river.orderedCellKeys[index + 1]
        : undefined;
      if (hydrology === undefined || hydrology.downstreamTileKey !== downstreamKey) {
        throw new Error('GENESIS_WATER_RIVER_DRAINAGE_DRIFT');
      }
      cells.push(Object.freeze({
        realmId: HEGEMONY_REALM_ID,
        cellKey: key,
        q: tile.q,
        r: tile.r,
        regime: 'river',
        bodyId: bodyIdFor('river', river.riverId),
        depthCells,
        elevationMilli: elevationForKey(key),
        surfaceLevelMilli: surfaceLevels.get(key)!,
        ring: hexDistance(tile),
        s: -tile.q - tile.r,
        underlyingTileKey: key,
        riverOrdinal: GENESIS_RIVERS_V1.indexOf(river),
        riverOrder: index,
        downstreamWaterCellKey: downstreamKey,
        flowAccumulation: hydrology.flowAccumulation,
        depthClass: Math.max(1, Math.min(3, Math.floor((index + 1) / 12) + 1)),
        oceanDepth: 0,
        bankSeed: deriveChannelSeed(HEGEMONY_WORLD_SEED, tile.q, tile.r, 'genesis-water-v1-bank'),
        generationVersion: 3,
        fogBand: 'clear',
        layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
      }));
    }
  }
  return Object.freeze(cells);
}

export const GENESIS_RIVER_CELLS_V1 = riverCells();

export const GENESIS_OCEAN_BODY_V1: GenesisWaterBodyV1 = Object.freeze({
  bodyId: bodyIdFor('ocean', 'GENESIS_001'),
  realmId: HEGEMONY_REALM_ID,
  regime: 'ocean',
  cellCount: oceanCells.length,
  sourceCellKey: oceanCells[0]!.key,
  mouthCellKey: oceanCells[oceanCells.length - 1]!.key,
  surfaceLevelMilli: GENESIS_WATER_SEA_LEVEL_MILLI,
  flowDirectionXQ15: 0,
  flowDirectionZQ15: 0,
  wavePreset: 'ocean-swell-v1',
  ordinal: 0,
  seed: deriveChannelSeed(HEGEMONY_WORLD_SEED, 0, 0, 'genesis-water-ocean-body'),
  generationVersion: 3,
  layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
});

export const GENESIS_WATER_BODIES_V1 = Object.freeze([
  GENESIS_OCEAN_BODY_V1,
  ...GENESIS_LAKE_LAYOUT.bodies,
  ...GENESIS_RIVERS_V1.map((river, index) => Object.freeze({
    bodyId: bodyIdFor('river', river.riverId),
    realmId: HEGEMONY_REALM_ID,
    regime: 'river' as const,
    cellCount: river.orderedCellKeys.length,
    sourceCellKey: river.sourceCellKey,
    mouthCellKey: river.mouthCellKey,
    surfaceLevelMilli: riverSurfaceLevels(river.orderedCellKeys).get(river.sourceCellKey)!,
    flowDirectionXQ15: flowDirectionForPath(river.orderedCellKeys).x,
    flowDirectionZQ15: flowDirectionForPath(river.orderedCellKeys).z,
    wavePreset: 'river-flow-v1',
    ordinal: index + 1,
    seed: deriveChannelSeed(HEGEMONY_WORLD_SEED, river.sector, river.orderedCellKeys.length, 'genesis-water-river-body'),
    generationVersion: 3,
    layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
  })),
]);

export const GENESIS_OCEAN_CELLS_V1 = Object.freeze(oceanCells.map(cell => Object.freeze({
  realmId: HEGEMONY_REALM_ID,
  cellKey: cell.key,
  q: cell.q,
  r: cell.r,
  regime: 'ocean' as const,
  bodyId: GENESIS_OCEAN_BODY_V1.bodyId,
  depthCells: GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.key)!,
  elevationMilli: elevationForKey(cell.key),
  surfaceLevelMilli: GENESIS_WATER_SEA_LEVEL_MILLI,
  downstreamWaterCellKey: undefined,
  ring: hexDistance(cell),
  s: -cell.q - cell.r,
  underlyingTileKey: undefined,
  riverOrdinal: undefined,
  riverOrder: undefined,
  flowAccumulation: 0,
  depthClass: GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.key)! >= 5 ? 3 : 1,
  oceanDepth: GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.key)!,
  bankSeed: deriveChannelSeed(HEGEMONY_WORLD_SEED, cell.q, cell.r, 'genesis-water-v1-bank'),
  generationVersion: 3,
  fogBand: fogBandForDepth(GENESIS_OCEAN_DEPTH_BY_KEY.get(cell.key)!),
  layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
})));

export const GENESIS_WATER_CELLS_V1 = Object.freeze([
  ...GENESIS_OCEAN_CELLS_V1,
  ...GENESIS_LAKE_LAYOUT.cells,
  ...GENESIS_RIVER_CELLS_V1,
]);

function digestPart(): string {
  return [
    GENESIS_WATER_POLICY_VERSION,
    GENESIS_WATER_LAYOUT_VERSION,
    GENESIS_WATER_OCEAN_RADIUS,
    GENESIS_WATER_OCEAN_CELL_COUNT,
    GENESIS_WATER_SEA_LEVEL_MILLI,
    [...GENESIS_OCEAN_DEPTH_BY_KEY.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [...GENESIS_HYDROLOGY_V1.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, cell]) => [
      key,
      cell.elevationMilli,
      cell.filledElevationMilli,
      cell.downstreamTileKey,
      cell.flowAccumulation,
      cell.distanceToCoast,
    ]),
    ...GENESIS_WATER_BODIES_V1.map(body => [
      body.bodyId,
      body.cellCount,
      body.surfaceLevelMilli,
      body.flowDirectionXQ15,
      body.flowDirectionZQ15,
      body.wavePreset,
      body.ordinal,
    ]),
    ...GENESIS_WATER_CELLS_V1.map(cell => [
      cell.cellKey,
      cell.regime,
      cell.bodyId,
      cell.surfaceLevelMilli,
      cell.downstreamWaterCellKey,
      cell.flowAccumulation,
      cell.depthClass,
      cell.oceanDepth,
    ]),
  ].map(value => JSON.stringify(value)).join('|');
}

function stableDigest(value: string): string {
  const seed = hashSeedString(value);
  return Array.from({ length: 8 }, (_, index) => (
    mixUint32(seed ^ Math.imul(index + 1, 0x9e3779b1)).toString(16).padStart(8, '0')
  )).join('');
}

export const GENESIS_WATER_LAYOUT_DIGEST = stableDigest(digestPart());

export const GENESIS_WATER_LAYOUT_V1: GenesisWaterLayoutV1 = Object.freeze({
  realmId: HEGEMONY_REALM_ID,
  layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
  policyVersion: GENESIS_WATER_POLICY_VERSION,
  generationVersion: 3,
  canonicalLandCellCount: CANONICAL_WORLD_TILES.length,
  oceanCellCount: oceanCells.length,
  lakeCellCount: GENESIS_LAKE_LAYOUT.cells.length,
  lakeBodyCount: GENESIS_LAKE_LAYOUT.bodies.length,
  riverCount: GENESIS_RIVERS_V1.length,
  riverCellCount: GENESIS_RIVER_CELLS_V1.length,
  seaLevelMilli: GENESIS_WATER_SEA_LEVEL_MILLI,
  seaLevelPolicyVersion: GENESIS_WATER_SEA_LEVEL_POLICY_VERSION,
  fogStartDepthCells: GENESIS_OCEAN_FOG_START_DEPTH_CELLS,
  fogFullDepthCells: GENESIS_OCEAN_FOG_FULL_DEPTH_CELLS,
  hiddenBufferCells: GENESIS_OCEAN_HIDDEN_BUFFER_CELLS,
  layoutDigest: GENESIS_WATER_LAYOUT_DIGEST,
  // This branch is intentionally frozen from the protected main snapshot.
  sourceCommit: 'f23643c0d07e91847cadd5445a294d965ad76e1c',
});

export function genesisWaterCellV1ForKey(cellKey: string): GenesisWaterCellV1 | undefined {
  const ocean = GENESIS_OCEAN_DEPTH_BY_KEY.get(cellKey);
  if (ocean !== undefined) {
    const coord = waterDiscByKey.get(cellKey)!;
    return Object.freeze({
      realmId: HEGEMONY_REALM_ID,
      cellKey,
      q: coord.q,
      r: coord.r,
      regime: 'ocean',
      bodyId: bodyIdFor('ocean', 'GENESIS_001'),
      depthCells: ocean,
      elevationMilli: elevationForKey(cellKey),
      surfaceLevelMilli: GENESIS_WATER_SEA_LEVEL_MILLI,
      downstreamWaterCellKey: undefined,
      ring: hexDistance(coord),
      s: -coord.q - coord.r,
      flowAccumulation: 0,
      depthClass: ocean >= 5 ? 3 : 1,
      oceanDepth: ocean,
      bankSeed: deriveChannelSeed(HEGEMONY_WORLD_SEED, coord.q, coord.r, 'genesis-water-v1-bank'),
      generationVersion: 3,
      fogBand: fogBandForDepth(ocean),
      layoutVersion: GENESIS_WATER_LAYOUT_VERSION,
    });
  }
  return GENESIS_LAKE_LAYOUT.cells.find(cell => cell.cellKey === cellKey)
    ?? GENESIS_RIVER_CELLS_V1.find(cell => cell.cellKey === cellKey);
}

export function genesisWaterRiverCellSet(): ReadonlySet<string> {
  return new Set(GENESIS_RIVER_CELLS_V1.map(cell => cell.cellKey));
}

export function matchesGenesisWaterLayoutV1(row: GenesisWaterLayoutV1): boolean {
  return row.realmId === GENESIS_WATER_LAYOUT_V1.realmId
    && row.layoutVersion === GENESIS_WATER_LAYOUT_V1.layoutVersion
    && row.policyVersion === GENESIS_WATER_LAYOUT_V1.policyVersion
    && row.generationVersion === GENESIS_WATER_LAYOUT_V1.generationVersion
    && row.canonicalLandCellCount === GENESIS_WATER_LAYOUT_V1.canonicalLandCellCount
    && row.oceanCellCount === GENESIS_WATER_LAYOUT_V1.oceanCellCount
    && row.lakeCellCount === GENESIS_WATER_LAYOUT_V1.lakeCellCount
    && row.lakeBodyCount === GENESIS_WATER_LAYOUT_V1.lakeBodyCount
    && row.riverCount === GENESIS_WATER_LAYOUT_V1.riverCount
    && row.riverCellCount === GENESIS_WATER_LAYOUT_V1.riverCellCount
    && row.seaLevelMilli === GENESIS_WATER_LAYOUT_V1.seaLevelMilli
    && row.seaLevelPolicyVersion === GENESIS_WATER_LAYOUT_V1.seaLevelPolicyVersion
    && row.fogStartDepthCells === GENESIS_WATER_LAYOUT_V1.fogStartDepthCells
    && row.fogFullDepthCells === GENESIS_WATER_LAYOUT_V1.fogFullDepthCells
    && row.hiddenBufferCells === GENESIS_WATER_LAYOUT_V1.hiddenBufferCells
    && row.layoutDigest === GENESIS_WATER_LAYOUT_V1.layoutDigest
    && row.sourceCommit === GENESIS_WATER_LAYOUT_V1.sourceCommit;
}

// Keep this import-time assertion close to the layout so any future change to
// the canonical land or water policy fails closed before it can be seeded.
if (GENESIS_WATER_LAYOUT_V1.canonicalLandCellCount !== 10_000
  || GENESIS_WATER_LAYOUT_V1.oceanCellCount !== GENESIS_WATER_OCEAN_CELL_COUNT
  || GENESIS_WATER_LAYOUT_V1.lakeCellCount !== 409
  || GENESIS_WATER_LAYOUT_V1.riverCount !== GENESIS_WATER_RIVER_COUNT) {
  throw new Error('GENESIS_WATER_LAYOUT_POLICY_DRIFT');
}
