import {
  axialToWorld,
  hexDistance,
  hexKey,
  hexNeighbors,
  parseHexKey,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from './hexCoordinates';
import type { TerrainStructurePlacement } from './terrainPlacements';

export type RealmVegetationWaterCell = Readonly<{
  cellKey: string;
  q: number;
  r: number;
  regime: 'ocean' | 'lake' | 'river';
  bodyId?: string;
  riverOrder?: number;
}>;

export type RealmVegetationClearanceCircle = Readonly<{
  id: string;
  world: HexWorldPosition;
  radius: number;
}>;

export type RealmVegetationMaskTelemetry = Readonly<{
  oceanCellCount: number;
  riverCellCount: number;
  riverSegmentCount: number;
  routeSegmentCount: number;
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
const INNER_ROUTE_RING = 4;
const ROUTE_RING_INTERVAL = 5;

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

function isAxialRoute(coord: HexCoord) {
  return coord.q === 0 || coord.r === 0 || -coord.q - coord.r === 0;
}

function createRouteSegments(playableKeys: ReadonlySet<string>, hexSize: number) {
  const segments = new Map<string, Segment>();
  playableKeys.forEach((key) => {
    const coord = parseHexKey(key);
    if (!coord || !isSafeCoord(coord)) return;
    const ring = hexDistance({ q: 0, r: 0 }, coord);
    hexNeighbors(coord).forEach((neighbor) => {
      const neighborKey = hexKey(neighbor);
      if (!playableKeys.has(neighborKey)) return;
      const neighborRing = hexDistance({ q: 0, r: 0 }, neighbor);
      const spoke = isAxialRoute(coord) && isAxialRoute(neighbor);
      const circumferential = ring > INNER_ROUTE_RING
        && ring % ROUTE_RING_INTERVAL === 0
        && neighborRing === ring;
      if (!spoke && !circumferential) return;
      const keyForSegment = segmentKey(coord, neighbor);
      if (segments.has(keyForSegment)) return;
      segments.set(keyForSegment, Object.freeze({
        start: Object.freeze(axialToWorld(coord, hexSize)),
        end: Object.freeze(axialToWorld(neighbor, hexSize))
      }));
    });
  });
  return Object.freeze([...segments.values()]);
}

function createRiverSegments(
  cells: readonly RealmVegetationWaterCell[],
  hexSize: number
) {
  const byBody = new Map<string, RealmVegetationWaterCell[]>();
  cells.forEach((cell) => {
    if (
      cell.regime !== 'river'
      || !isSafeCoord(cell)
      || typeof cell.cellKey !== 'string'
    ) return;
    const bodyId = typeof cell.bodyId === 'string' && cell.bodyId.length > 0
      ? cell.bodyId
      : 'river';
    const bucket = byBody.get(bodyId);
    if (bucket) bucket.push(cell);
    else byBody.set(bodyId, [cell]);
  });
  const segments: Segment[] = [];
  [...byBody].sort(([left], [right]) => left.localeCompare(right)).forEach(([, rows]) => {
    const ordered = [...rows].sort((left, right) => (
      (left.riverOrder ?? Number.MAX_SAFE_INTEGER) - (right.riverOrder ?? Number.MAX_SAFE_INTEGER)
      || left.cellKey.localeCompare(right.cellKey)
    ));
    if (ordered.length === 1) {
      const point = Object.freeze(axialToWorld(ordered[0]!, hexSize));
      segments.push(Object.freeze({ start: point, end: point }));
      return;
    }
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (hexDistance(previous, current) !== 1) continue;
      segments.push(Object.freeze({
        start: Object.freeze(axialToWorld(previous, hexSize)),
        end: Object.freeze(axialToWorld(current, hexSize))
      }));
    }
  });
  return Object.freeze(segments);
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
 * Ocean cells are exact full-cell exclusions; rivers and canonical travel
 * routes are narrow world-space ribbons so open land is not cleared by tile.
 * Every currently supplied water row is an exact full-cell exclusion. The
 * activation projection removes legacy lakes when they become scenic land,
 * so vegetation appears only after that validated boundary changes.
 */
export function createRealmVegetationMask(
  options: CreateRealmVegetationMaskOptions
): RealmVegetationMask {
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0
    ? options.hexSize!
    : 1;
  const grassRiverClearance = finiteNonNegative(options.grassRiverClearance, 0.36 * hexSize);
  const treeRiverClearance = finiteNonNegative(options.treeRiverClearance, 0.5 * hexSize);
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
  const waterKeys = new Set(waterCells.flatMap((cell) => (
    isSafeCoord(cell) ? [hexKey(cell)] : []
  )));
  const riverSegments = createRiverSegments(waterCells, hexSize);
  const routeSegments = createRouteSegments(options.playableKeys, hexSize);
  const circles = Object.freeze([
    ...(options.circles ?? []).filter(validCircle),
    ...placementCircles(options.placements ?? [], hexSize)
  ]);
  const bucketSize = Math.max(0.5, hexSize);
  const grassIndex = createPrimitiveIndex(Object.freeze([
    ...primitivesFor('river', riverSegments, grassRiverClearance),
    ...primitivesFor('route', routeSegments, grassRouteClearance),
    ...circlePrimitives(circles, 0)
  ]), bucketSize);
  const treeIndex = createPrimitiveIndex(Object.freeze([
    ...primitivesFor('river', riverSegments, treeRiverClearance),
    ...primitivesFor('route', routeSegments, treeRouteClearance),
    ...circlePrimitives(circles, treeCirclePadding)
  ]), bucketSize);
  const isValidatedWater = (world: HexWorldPosition) => {
    const key = hexKey(worldToNearestAxial(world, hexSize));
    return waterKeys.has(key);
  };

  return Object.freeze({
    isGrassExcluded: (world) => isValidatedWater(world) || intersects(grassIndex, world),
    isTreeExcluded: (world) => isValidatedWater(world) || intersects(treeIndex, world),
    telemetry: Object.freeze({
      oceanCellCount: oceanKeys.size,
      riverCellCount: riverKeys.size,
      riverSegmentCount: riverSegments.length,
      routeSegmentCount: routeSegments.length,
      clearanceCircleCount: circles.length
    })
  });
}
