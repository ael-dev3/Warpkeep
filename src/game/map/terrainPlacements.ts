import {
  axialToWorld,
  hexDisc,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';

export type TerrainStructurePlacement = Readonly<{
  id: string;
  coord: HexCoord;
  footprintRadius: number;
  blendRadius: number;
  /** Decorative exclusion only; it never widens terrain-height influence. */
  decorationClearanceRadius?: number;
  targetHeightMode: 'cell-center' | 'average-footprint';
}>;

export type TerrainCastleLocation = Readonly<{
  id: string;
  coord: HexCoord;
}>;

const HEGEMONY_KEEP_FOUNDATION = Object.freeze({
  // The normalized castle spans 1.48 world units. Keep most of that base on a
  // calm, level plinth, then blend before the pointy-hex inradius so adjacent
  // founders remain visually close without floating or cross-cell seams.
  footprintRadius: 0.62,
  blendRadius: 0.78,
  decorationClearanceRadius: 1.08,
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
  'hegemony-main-castle',
  { q: 0, r: 0 }
);

export const HEGEMONY_TERRAIN_PLACEMENTS: readonly TerrainStructurePlacement[] = Object.freeze([
  HEGEMONY_KEEP_PLACEMENT
]);
export const EMPTY_TERRAIN_PLACEMENTS: readonly TerrainStructurePlacement[] = Object.freeze([]);

type TerrainPlacementIndex = Readonly<{
  byCoord: ReadonlyMap<string, readonly TerrainStructurePlacement[]>;
  orderByPlacement: ReadonlyMap<TerrainStructurePlacement, number>;
  maxInfluenceRadius: number;
  maxDecorationClearanceRadius: number;
  boundedQuerySafe: boolean;
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
  let maxDecorationClearanceRadius = 0;
  let boundedQuerySafe = true;
  let cacheable = Object.isFrozen(placements);
  const orderByPlacement = new Map<TerrainStructurePlacement, number>();
  placements.forEach((placement, placementIndex) => {
    cacheable = cacheable
      && Object.isFrozen(placement)
      && Object.isFrozen(placement.coord);
    boundedQuerySafe = boundedQuerySafe
      && Number.isSafeInteger(placement.coord.q)
      && Number.isSafeInteger(placement.coord.r);
    const placementRadius = Number.isFinite(placement.blendRadius)
      && placement.blendRadius >= 0
      && Number.isFinite(placement.footprintRadius)
      && placement.footprintRadius >= 0
      ? Math.max(placement.blendRadius, placement.footprintRadius)
      : Number.POSITIVE_INFINITY;
    maxInfluenceRadius = Number.isFinite(placementRadius)
      ? Math.max(maxInfluenceRadius, placementRadius)
      : Number.POSITIVE_INFINITY;
    const clearanceCandidate = placement.decorationClearanceRadius;
    boundedQuerySafe = boundedQuerySafe
      && (clearanceCandidate === undefined || (
        Number.isFinite(clearanceCandidate) && clearanceCandidate >= 0
      ));
    const decorationClearanceRadius = typeof clearanceCandidate === 'number'
      && Number.isFinite(clearanceCandidate)
      && clearanceCandidate >= 0
      ? clearanceCandidate
      : placementRadius;
    maxDecorationClearanceRadius = Number.isFinite(decorationClearanceRadius)
      ? Math.max(maxDecorationClearanceRadius, decorationClearanceRadius)
      : Number.POSITIVE_INFINITY;
    const key = hexKey(placement.coord);
    const existing = mutableIndex.get(key);
    if (existing) existing.push(placement);
    else mutableIndex.set(key, [placement]);
    if (!orderByPlacement.has(placement)) {
      orderByPlacement.set(placement, placementIndex);
    }
  });
  const index = Object.freeze({
    byCoord: new Map<string, readonly TerrainStructurePlacement[]>(
      [...mutableIndex].map(([key, values]) => [key, Object.freeze(values)] as const)
    ),
    orderByPlacement,
    maxInfluenceRadius,
    maxDecorationClearanceRadius,
    boundedQuerySafe
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
 * inside one pointy-top hex. Wider finite radii use a bounded axial disc over
 * the coordinate index. The disc is conservatively circumscribed around the
 * target hex, so it cannot omit a placement whose radius can reach any point
 * in that cell. Invalid, unbounded, or pathologically large inputs fall back
 * to the complete set; small sets do the same when that is cheaper than the
 * indexed lookup.
 */
export function terrainPlacementsForCell(
  placements: readonly TerrainStructurePlacement[],
  coord: HexCoord,
  hexSize: number,
  clearance = 0
): readonly TerrainStructurePlacement[] {
  if (placements.length === 0) return EMPTY_TERRAIN_PLACEMENTS;
  const index = indexTerrainPlacements(placements);
  if (
    !index.boundedQuerySafe
    || !Number.isFinite(hexSize)
    || hexSize <= 0
    || !Number.isFinite(clearance)
    || !Number.isSafeInteger(coord.q)
    || !Number.isSafeInteger(coord.r)
  ) return placements;

  const normalizedCoord = {
    q: coord.q,
    r: coord.r
  };

  const safeClearance = Math.max(0, clearance);
  const nearestForeignCenterAtBoundary = hexSize * Math.sqrt(3) / 2;
  const relevantRadius = safeClearance > 0
    ? Math.max(index.maxInfluenceRadius, index.maxDecorationClearanceRadius)
    : index.maxInfluenceRadius;
  const reachFromPlacementCenter = relevantRadius + safeClearance;
  if (!Number.isFinite(reachFromPlacementCenter)) return placements;

  // A foreign cell center cannot reach the target hex while its radius is
  // strictly below the shared-edge distance. Keep this hot terrain sampling
  // path as one direct map lookup (decoration-only radii are ignored at zero
  // clearance).
  if (reachFromPlacementCenter < nearestForeignCenterAtBoundary) {
    return index.byCoord.get(hexKey(normalizedCoord)) ?? EMPTY_TERRAIN_PLACEMENTS;
  }

  // The target pointy-top hex fits inside a circle of radius `hexSize`. Any
  // placement capable of intersecting it must therefore have its center no
  // farther away than this conservative center-to-center reach. A triangular
  // lattice center at axial distance n is at least 1.5 * hexSize * n away,
  // which gives the bounded disc radius below.
  const centerReach = reachFromPlacementCenter + hexSize;
  const axialRadius = Math.ceil((2 * centerReach) / (3 * hexSize));
  const MAX_BOUNDED_AXIAL_RADIUS = 256;
  if (
    !Number.isSafeInteger(axialRadius)
    || axialRadius < 0
    || axialRadius > MAX_BOUNDED_AXIAL_RADIUS
  ) return placements;

  const discCellCount = 1 + 3 * axialRadius * (axialRadius + 1);
  if (!Number.isSafeInteger(discCellCount) || discCellCount >= placements.length) {
    return placements;
  }

  const targetCenter = axialToWorld(normalizedCoord, hexSize);
  const nearby: TerrainStructurePlacement[] = [];
  hexDisc(normalizedCoord, axialRadius).forEach((candidateCoord) => {
    const candidateCenter = axialToWorld(candidateCoord, hexSize);
    const centerDistance = Math.hypot(
      candidateCenter.x - targetCenter.x,
      candidateCenter.z - targetCenter.z
    );
    const tolerance = Number.EPSILON * Math.max(1, centerDistance, centerReach) * 16;
    if (centerDistance > centerReach + tolerance) return;
    const bucket = index.byCoord.get(hexKey(candidateCoord));
    if (bucket) nearby.push(...bucket);
  });

  if (nearby.length === 0) return EMPTY_TERRAIN_PLACEMENTS;
  if (nearby.length === placements.length) return placements;
  nearby.sort((left, right) => (
    (index.orderByPlacement.get(left) ?? 0) - (index.orderByPlacement.get(right) ?? 0)
  ));
  return Object.freeze(nearby);
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
    distanceToPlacement(placement, world, hexSize) >= Math.max(
      placement.blendRadius,
      placement.decorationClearanceRadius ?? placement.blendRadius
    ) + clearance
  ));
}
