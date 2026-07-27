import {
  axialToWorld,
  hexDistance,
  hexKey,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import type { TerrainStructurePlacement } from './terrainPlacements';
import {
  createRealmWaterChannelPlan,
  type RealmWaterChannelPlan
} from '../../components/realm/realmWaterChannelPresentation';

export type RealmVegetationWaterCell = Readonly<{
  cellKey: string;
  q: number;
  r: number;
  regime: 'ocean' | 'lake' | 'river';
  bodyId?: string;
  riverOrder?: number;
  downstreamWaterCellKey?: string;
  flowAccumulation?: number;
  depthClass?: number;
  surfaceLevelMilli?: number;
  bankSeed?: number;
}>;

export type RealmVegetationClearanceCircle = Readonly<{
  id: string;
  world: HexWorldPosition;
  radius: number;
}>;

/**
 * A validated public presentation route. The mask never discovers routes or
 * invents permanent roads: callers supply only paths already accepted by the
 * canonical dry-route boundary.
 */
export type RealmVegetationRoutePath = Readonly<{
  id: string;
  coords: readonly HexCoord[];
}>;

export type RealmVegetationMaskTelemetry = Readonly<{
  oceanCellCount: number;
  riverCellCount: number;
  riverChannelBodyCount: number;
  riverFallbackBodyCount: number;
  riverFallbackCellCount: number;
  riverSegmentCount: number;
  routeSegmentCount: number;
  routePathCount: number;
  rejectedRoutePathCount: number;
  clearanceCircleCount: number;
}>;

export type RealmVegetationMask = Readonly<{
  isGrassExcluded: (world: HexWorldPosition) => boolean;
  isTreeExcluded: (world: HexWorldPosition) => boolean;
  telemetry: RealmVegetationMaskTelemetry;
}>;

export type CreateRealmVegetationMaskOptions = Readonly<{
  playableKeys: ReadonlySet<string>;
  waterCells?: readonly RealmVegetationWaterCell[];
  placements?: readonly TerrainStructurePlacement[];
  circles?: readonly RealmVegetationClearanceCircle[];
  /** Exact validated live paths; omitted means no route clearance. */
  routePaths?: readonly RealmVegetationRoutePath[];
  hexSize?: number;
  grassRiverClearance?: number;
  treeRiverClearance?: number;
  grassRouteClearance?: number;
  treeRouteClearance?: number;
  treeCirclePadding?: number;
}>;

type Segment = Readonly<{
  start: HexWorldPosition;
  end: HexWorldPosition;
}>;

type IndexedPrimitive = Readonly<{
  id: string;
  start: HexWorldPosition;
  end: HexWorldPosition;
  radius: number;
}>;

type PrimitiveIndex = Readonly<{
  get: (world: HexWorldPosition) => readonly IndexedPrimitive[];
}>;

const EMPTY_PRIMITIVES: readonly IndexedPrimitive[] = Object.freeze([]);

function finiteNonNegative(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value!) : fallback;
}

function isSafeCoord(coord: HexCoord) {
  return Number.isSafeInteger(coord.q) && Number.isSafeInteger(coord.r);
}

function segmentDistanceSquared(world: HexWorldPosition, segment: Segment) {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= Number.EPSILON) {
    const pointX = world.x - segment.start.x;
    const pointZ = world.z - segment.start.z;
    return pointX * pointX + pointZ * pointZ;
  }
  const progress = Math.min(1, Math.max(0, (
    (world.x - segment.start.x) * dx + (world.z - segment.start.z) * dz
  ) / lengthSquared));
  const closestX = segment.start.x + dx * progress;
  const closestZ = segment.start.z + dz * progress;
  const pointX = world.x - closestX;
  const pointZ = world.z - closestZ;
  return pointX * pointX + pointZ * pointZ;
}

function createPrimitiveIndex(
  primitives: readonly IndexedPrimitive[],
  bucketSize: number
): PrimitiveIndex {
  const buckets = new Map<string, IndexedPrimitive[]>();
  primitives.forEach((primitive) => {
    const minimumX = Math.floor((Math.min(primitive.start.x, primitive.end.x) - primitive.radius) / bucketSize);
    const maximumX = Math.floor((Math.max(primitive.start.x, primitive.end.x) + primitive.radius) / bucketSize);
    const minimumZ = Math.floor((Math.min(primitive.start.z, primitive.end.z) - primitive.radius) / bucketSize);
    const maximumZ = Math.floor((Math.max(primitive.start.z, primitive.end.z) + primitive.radius) / bucketSize);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let z = minimumZ; z <= maximumZ; z += 1) {
        const key = `${x},${z}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(primitive);
        else buckets.set(key, [primitive]);
      }
    }
  });
  const immutableBuckets = new Map<string, readonly IndexedPrimitive[]>(
    [...buckets].map(([key, bucket]) => [key, Object.freeze(bucket)] as const)
  );
  return Object.freeze({
    get: (world) => immutableBuckets.get(
      `${Math.floor(world.x / bucketSize)},${Math.floor(world.z / bucketSize)}`
    ) ?? EMPTY_PRIMITIVES
  });
}

function segmentKey(first: HexCoord, second: HexCoord) {
  const firstKey = hexKey(first);
  const secondKey = hexKey(second);
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

function createRouteSegments(
  paths: readonly RealmVegetationRoutePath[],
  playableKeys: ReadonlySet<string>,
  hexSize: number
) {
  const segments = new Map<string, Segment>();
  const seenIds = new Set<string>();
  let routePathCount = 0;
  let rejectedRoutePathCount = 0;
  [...paths].sort((left, right) => left.id.localeCompare(right.id)).forEach((path) => {
    const validId = typeof path.id === 'string'
      && path.id.length > 0
      && path.id.trim() === path.id
      && !seenIds.has(path.id);
    const coords = Array.isArray(path.coords) ? path.coords : [];
    const validCoords = coords.length >= 2
      && coords.every((coord) => (
        isSafeCoord(coord)
        && playableKeys.has(hexKey(coord))
      ))
      && coords.slice(1).every((coord, index) => (
        hexDistance(coords[index]!, coord) === 1
      ));
    if (!validId || !validCoords) {
      rejectedRoutePathCount += 1;
      return;
    }
    seenIds.add(path.id);
    routePathCount += 1;
    for (let index = 1; index < coords.length; index += 1) {
      const first = coords[index - 1]!;
      const second = coords[index]!;
      const keyForSegment = segmentKey(first, second);
      if (segments.has(keyForSegment)) continue;
      segments.set(keyForSegment, Object.freeze({
        start: Object.freeze(axialToWorld(first, hexSize)),
        end: Object.freeze(axialToWorld(second, hexSize))
      }));
    }
  });
  return Object.freeze({
    segments: Object.freeze([...segments].sort(([left], [right]) => (
      left.localeCompare(right)
    )).map(([, segment]) => segment)),
    routePathCount,
    rejectedRoutePathCount
  });
}

function validCircle(circle: RealmVegetationClearanceCircle) {
  return typeof circle.id === 'string'
    && circle.id.length > 0
    && Number.isFinite(circle.world.x)
    && Number.isFinite(circle.world.z)
    && Number.isFinite(circle.radius)
    && circle.radius >= 0;
}

function placementCircles(
  placements: readonly TerrainStructurePlacement[],
  hexSize: number
): readonly RealmVegetationClearanceCircle[] {
  return Object.freeze(placements.flatMap((placement) => {
    if (!isSafeCoord(placement.coord)) return [];
    const candidate = placement.decorationClearanceRadius ?? placement.blendRadius;
    if (!Number.isFinite(candidate) || candidate < 0) return [];
    return [Object.freeze({
      id: `occupied-structure:${placement.id}`,
      world: Object.freeze(axialToWorld(placement.coord, hexSize)),
      radius: candidate
    })];
  }));
}

function primitivesFor(
  prefix: string,
  segments: readonly Segment[],
  radius: number
): readonly IndexedPrimitive[] {
  return Object.freeze(segments.map((segment, index) => Object.freeze({
    id: `${prefix}:${index}`,
    start: segment.start,
    end: segment.end,
    radius
  })));
}

function riverPrimitivesFor(
  prefix: string,
  plan: RealmWaterChannelPlan,
  minimumRadius: number,
  bankPadding: number
): readonly IndexedPrimitive[] {
  return Object.freeze(plan.bodies.flatMap((body) => {
    if (body.mode !== 'channel') return [];
    return body.sections.slice(1).map((section, index) => {
      const previous = body.sections[index]!;
      return Object.freeze({
        id: `${prefix}:${body.bodyId}:${index}`,
        start: previous.world,
        end: section.world,
        radius: Math.max(
          minimumRadius,
          Math.max(previous.halfWidth, section.halfWidth) + bankPadding
        )
      });
    });
  }));
}

function circlePrimitives(
  circles: readonly RealmVegetationClearanceCircle[],
  padding: number
): readonly IndexedPrimitive[] {
  return Object.freeze(circles.map((circle) => Object.freeze({
    id: circle.id,
    start: circle.world,
    end: circle.world,
    radius: circle.radius + padding
  })));
}

function intersects(index: PrimitiveIndex, world: HexWorldPosition) {
  return index.get(world).some((primitive) => (
    segmentDistanceSquared(world, primitive) < primitive.radius * primitive.radius
  ));
}

/**
 * Presentation-only clearance shared by grass and decorative tree infill.
 * Ocean and active lake cells are exact full-cell exclusions. Valid river
 * bodies use the same deterministic channel plus bank corridor as the Water
 * renderer; a malformed river body falls back to exact full-cell exclusions.
 * Canonical rows are never changed by this presentation mask.
 *
 * Route clearances are intentionally caller-supplied. Older revisions drew a
 * synthetic spoke/ring network through the Realm, which implied permanent
 * infrastructure unrelated to live public Worker state.
 */
export function createRealmVegetationMask(
  options: CreateRealmVegetationMaskOptions
): RealmVegetationMask {
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0
    ? options.hexSize!
    : 1;
  const grassRiverClearance = finiteNonNegative(options.grassRiverClearance, 0.36 * hexSize);
  const treeRiverClearance = finiteNonNegative(options.treeRiverClearance, 0.5 * hexSize);
  const grassRiverBankPadding = 0.08 * hexSize;
  const treeRiverBankPadding = 0.14 * hexSize;
  const grassRouteClearance = finiteNonNegative(options.grassRouteClearance, 0.14 * hexSize);
  const treeRouteClearance = finiteNonNegative(options.treeRouteClearance, 0.32 * hexSize);
  const treeCirclePadding = finiteNonNegative(options.treeCirclePadding, 0.08 * hexSize);
  const waterCells = options.waterCells ?? [];
  const oceanKeys = new Set(waterCells.flatMap((cell) => (
    cell.regime === 'ocean' && isSafeCoord(cell) ? [hexKey(cell)] : []
  )));
  const riverKeys = new Set(waterCells.flatMap((cell) => (
    cell.regime === 'river' && isSafeCoord(cell) ? [hexKey(cell)] : []
  )));
  const channelPlan = createRealmWaterChannelPlan(waterCells, hexSize);
  const fallbackRiverKeys = new Set(channelPlan.bodies.flatMap((body) => (
    body.mode === 'full-cell-fallback' ? body.cellKeys : []
  )));
  const fullCellWaterKeys = new Set(waterCells.flatMap((cell) => (
    isSafeCoord(cell)
      && (cell.regime !== 'river' || fallbackRiverKeys.has(cell.cellKey))
      ? [hexKey(cell)]
      : []
  )));
  const riverSegmentCount = channelPlan.bodies.reduce((sum, body) => (
    sum + (body.mode === 'channel' ? Math.max(0, body.sections.length - 1) : 0)
  ), 0);
  const routeData = createRouteSegments(
    options.routePaths ?? [],
    options.playableKeys,
    hexSize
  );
  const routeSegments = routeData.segments;
  const circles = Object.freeze([
    ...(options.circles ?? []).filter(validCircle),
    ...placementCircles(options.placements ?? [], hexSize)
  ]);
  const bucketSize = Math.max(0.5, hexSize);
  const grassIndex = createPrimitiveIndex(Object.freeze([
    ...riverPrimitivesFor(
      'river',
      channelPlan,
      grassRiverClearance,
      grassRiverBankPadding
    ),
    ...primitivesFor('route', routeSegments, grassRouteClearance),
    ...circlePrimitives(circles, 0)
  ]), bucketSize);
  const treeIndex = createPrimitiveIndex(Object.freeze([
    ...riverPrimitivesFor(
      'river',
      channelPlan,
      treeRiverClearance,
      treeRiverBankPadding
    ),
    ...primitivesFor('route', routeSegments, treeRouteClearance),
    ...circlePrimitives(circles, treeCirclePadding)
  ]), bucketSize);
  const isValidatedWater = (world: HexWorldPosition) => {
    const key = hexKey(worldToNearestAxial(world, hexSize));
    return fullCellWaterKeys.has(key);
  };

  return Object.freeze({
    isGrassExcluded: (world) => isValidatedWater(world) || intersects(grassIndex, world),
    isTreeExcluded: (world) => isValidatedWater(world) || intersects(treeIndex, world),
    telemetry: Object.freeze({
      oceanCellCount: oceanKeys.size,
      riverCellCount: riverKeys.size,
      riverChannelBodyCount: channelPlan.channelBodyCount,
      riverFallbackBodyCount: channelPlan.fallbackBodyCount,
      riverFallbackCellCount: channelPlan.fallbackCellCount,
      riverSegmentCount,
      routeSegmentCount: routeSegments.length,
      routePathCount: routeData.routePathCount,
      rejectedRoutePathCount: routeData.rejectedRoutePathCount,
      clearanceCircleCount: circles.length
    })
  });
}
