import {
  axialToWorld,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';

export type TerrainStructurePlacement = Readonly<{
  id: string;
  coord: HexCoord;
  footprintRadius: number;
  blendRadius: number;
  targetHeightMode: 'cell-center' | 'average-footprint';
}>;

export type TerrainCastleLocation = Readonly<{
  id: string;
  coord: HexCoord;
}>;

const HEGEMONY_KEEP_FOUNDATION = Object.freeze({
  footprintRadius: 0.43,
  blendRadius: 0.7,
  targetHeightMode: 'cell-center' as const
});

export function createHegemonyKeepPlacement(
  id: string,
  coord: HexCoord
): TerrainStructurePlacement {
  const normalizedCoord = Object.freeze({
    q: Number.isFinite(coord.q) ? Math.trunc(coord.q) : 0,
    r: Number.isFinite(coord.r) ? Math.trunc(coord.r) : 0
  });
  return Object.freeze({
    id,
    coord: normalizedCoord,
    ...HEGEMONY_KEEP_FOUNDATION
  });
}

/**
 * Build a stable foundation set from authoritative castle locations.
 *
 * Exact tile collisions are collapsed defensively so an inconsistent snapshot
 * cannot apply the same blend twice. Adjacent castles are deliberately kept:
 * each admitted FID still receives its own close, independent foundation.
 */
export function createHegemonyCastlePlacements(
  locations: readonly TerrainCastleLocation[]
): readonly TerrainStructurePlacement[] {
  const byCoord = new Map<string, TerrainStructurePlacement>();
  const placements = locations
    .map((location) => createHegemonyKeepPlacement(location.id, location.coord))
    .sort((left, right) => (
      left.coord.q - right.coord.q
      || left.coord.r - right.coord.r
      || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    ));
  placements.forEach((placement) => {
    const key = hexKey(placement.coord);
    if (!byCoord.has(key)) byCoord.set(key, placement);
  });
  return Object.freeze([...byCoord.values()]);
}

export const HEGEMONY_KEEP_PLACEMENT = createHegemonyKeepPlacement(
  'hegemony-frontier-keep',
  { q: 0, r: 0 }
);

export const HEGEMONY_TERRAIN_PLACEMENTS: readonly TerrainStructurePlacement[] = Object.freeze([
  HEGEMONY_KEEP_PLACEMENT
]);
export const EMPTY_TERRAIN_PLACEMENTS: readonly TerrainStructurePlacement[] = Object.freeze([]);

type TerrainPlacementIndex = Readonly<{
  byCoord: ReadonlyMap<string, readonly TerrainStructurePlacement[]>;
  maxInfluenceRadius: number;
}>;

const PLACEMENT_INDEX = new WeakMap<
  readonly TerrainStructurePlacement[],
  TerrainPlacementIndex
>();

function indexTerrainPlacements(
  placements: readonly TerrainStructurePlacement[]
): TerrainPlacementIndex {
  const cached = PLACEMENT_INDEX.get(placements);
  if (cached) return cached;

  const mutableIndex = new Map<string, TerrainStructurePlacement[]>();
  let maxInfluenceRadius = 0;
  let cacheable = Object.isFrozen(placements);
  placements.forEach((placement) => {
    cacheable = cacheable
      && Object.isFrozen(placement)
      && Object.isFrozen(placement.coord);
    const placementRadius = Number.isFinite(placement.blendRadius)
      && placement.blendRadius >= 0
      && Number.isFinite(placement.footprintRadius)
      && placement.footprintRadius >= 0
      ? Math.max(placement.blendRadius, placement.footprintRadius)
      : Number.POSITIVE_INFINITY;
    maxInfluenceRadius = Number.isFinite(placementRadius)
      ? Math.max(maxInfluenceRadius, placementRadius)
      : Number.POSITIVE_INFINITY;
    const key = hexKey(placement.coord);
    const existing = mutableIndex.get(key);
    if (existing) existing.push(placement);
    else mutableIndex.set(key, [placement]);
  });
  const index = Object.freeze({
    byCoord: new Map<string, readonly TerrainStructurePlacement[]>(
      [...mutableIndex].map(([key, values]) => [key, Object.freeze(values)] as const)
    ),
    maxInfluenceRadius
  });
  // Readonly is a compile-time contract. Only retain indexes whose complete
  // coordinate identity is also immutable at runtime; mutable fixtures are
  // rebuilt so later edits cannot return stale buckets.
  if (cacheable) PLACEMENT_INDEX.set(placements, index);
  return index;
}

/** Reuses one coordinate index for every terrain sample in a scene build. */
export function terrainPlacementsAtCoord(
  placements: readonly TerrainStructurePlacement[],
  coord: HexCoord
): readonly TerrainStructurePlacement[] {
  if (placements.length === 0) return EMPTY_TERRAIN_PLACEMENTS;
  return indexTerrainPlacements(placements).byCoord.get(hexKey(coord))
    ?? EMPTY_TERRAIN_PLACEMENTS;
}

/**
 * Returns the exact coordinate bucket while every influence radius remains
 * inside one pointy-top hex. Unusually large/custom placements fall back to
 * the complete set, preserving the generic terrain API without putting the
 * normal keep-only render path back on an O(samples × castles) scan.
 */
export function terrainPlacementsForCell(
  placements: readonly TerrainStructurePlacement[],
  coord: HexCoord,
  hexSize: number,
  clearance = 0
): readonly TerrainStructurePlacement[] {
  if (placements.length === 0) return EMPTY_TERRAIN_PLACEMENTS;
  const index = indexTerrainPlacements(placements);
  const safeHexSize = Number.isFinite(hexSize) && hexSize > 0 ? hexSize : 0;
  const safeClearance = Number.isFinite(clearance) && clearance > 0 ? clearance : 0;
  const nearestForeignCenterAtBoundary = safeHexSize * Math.sqrt(3) / 2;
  if (index.maxInfluenceRadius + safeClearance > nearestForeignCenterAtBoundary) {
    return placements;
  }
  return index.byCoord.get(hexKey(coord)) ?? EMPTY_TERRAIN_PLACEMENTS;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
function smootherstep(value: number) {
  const normalized = clamp(value, 0, 1);
  return normalized ** 3 * (normalized * (normalized * 6 - 15) + 10);
}

export function distanceToPlacement(
  placement: TerrainStructurePlacement,
  world: HexWorldPosition,
  hexSize: number
) {
  const center = axialToWorld(placement.coord, hexSize);
  return Math.hypot(world.x - center.x, world.z - center.z);
}

export function placementInfluenceAtWorld(
  placement: TerrainStructurePlacement,
  world: HexWorldPosition,
  hexSize: number
) {
  const distance = distanceToPlacement(placement, world, hexSize);
  if (distance <= placement.footprintRadius) return 1;
  if (distance >= placement.blendRadius) return 0;
  const blend = (distance - placement.footprintRadius)
    / Math.max(0.001, placement.blendRadius - placement.footprintRadius);
  return 1 - smootherstep(blend);
}

export function isPlacementClear(
  placements: readonly TerrainStructurePlacement[],
  world: HexWorldPosition,
  hexSize: number,
  clearance = 0.08
) {
  return placements.every((placement) => (
    distanceToPlacement(placement, world, hexSize) >= placement.blendRadius + clearance
  ));
}
