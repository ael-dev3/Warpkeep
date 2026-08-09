import {
  GREATER_REALM_AXIAL_DIRECTIONS,
  type IndexedAxialGrid,
} from './greater-realm-terrain';
import {
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from './greater-realm-biomes';
export { GREATER_REALM_COMPOSITION_PROOF_KEYS } from './greater-realm-contracts';

const HEX_NEIGHBOR_COUNT = GREATER_REALM_AXIAL_DIRECTIONS.length;
const BASIS_POINTS = 10_000;
const SIXTY_DEGREE_COSINE = 500_000;
const SIXTY_DEGREE_SINE = 866_025;
const ROTATION_SCALE = 1_000_000;
const HEX_X_SCALE = 866_025;
const HEX_Y_SCALE = 1_500_000;

export type GreaterRealmLandSilhouetteThresholds = Readonly<{
  maximumRotationalIou64BasisPoints: number;
  maximumRotationalIou256BasisPoints: number;
  maximumAlignedCoastRunShareBasisPoints: number;
  minimumDominantLandSolidityBasisPoints: number;
  maximumDominantLandSolidityBasisPoints: number;
  minimumCoastDetailGainBasisPoints: number;
  maximumCoastDetailGainBasisPoints: number;
}>;

export type GreaterRealmDominantContinentThresholds = Readonly<{
  minimumDominantLandShareBasisPoints: number;
  maximumDominantLandShareBasisPoints: number;
  minimumDominantToSecondRatioBasisPoints: number;
  minimumTierTwoOnDominantBasisPoints: number;
  minimumTierThreeOnDominantBasisPoints: number;
}>;

export type GreaterRealmOceanBreathingRoomThresholds = Readonly<{
  minimumBoundaryLandDistance: number;
  minimumBoundaryLandDistanceP05: number;
  minimumBoundaryLandDistanceP50: number;
  targetBoundaryLandDistance: number;
  minimumBoundaryAtTargetShareBasisPoints: number;
  sectorCount: number;
  minimumSectorMedianLandDistance: number;
}>;

export type GreaterRealmPatchCompositionThresholds = Readonly<{
  minimumShareBasisPoints: number;
  maximumShareBasisPoints: number;
  clusteredComponentMinimumCells: number;
  minimumClusteredShareBasisPoints: number;
  broadComponentMinimumCells: number;
  minimumBroadComponentCount: number;
  tinyComponentMaximumCells: number;
  maximumTinyShareBasisPoints: number;
  maximumLargestComponentShareBasisPoints: number;
}>;

export type GreaterRealmMountainBeltThresholds = Readonly<{
  minimumBeltCells: number;
  minimumMaximumAxialSpan: number;
  minimumCentroidOffset: number;
  minimumAxialAnisotropyBasisPoints: number;
}>;

export const GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS = Object.freeze({
  maximumRotationalIou64BasisPoints: 9_000,
  maximumRotationalIou256BasisPoints: 8_500,
  maximumAlignedCoastRunShareBasisPoints: 1_250,
  minimumDominantLandSolidityBasisPoints: 6_500,
  maximumDominantLandSolidityBasisPoints: 9_300,
  minimumCoastDetailGainBasisPoints: 10_250,
  maximumCoastDetailGainBasisPoints: 16_500,
} satisfies GreaterRealmLandSilhouetteThresholds);

export const GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS = Object.freeze({
  minimumDominantLandShareBasisPoints: 5_500,
  maximumDominantLandShareBasisPoints: 9_000,
  minimumDominantToSecondRatioBasisPoints: 14_000,
  minimumTierTwoOnDominantBasisPoints: 8_000,
  minimumTierThreeOnDominantBasisPoints: 8_000,
} satisfies GreaterRealmDominantContinentThresholds);

export const GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS = Object.freeze({
  minimumBoundaryLandDistance: 8,
  minimumBoundaryLandDistanceP05: 16,
  minimumBoundaryLandDistanceP50: 20,
  targetBoundaryLandDistance: 20,
  minimumBoundaryAtTargetShareBasisPoints: 7_000,
  sectorCount: 12,
  minimumSectorMedianLandDistance: 16,
} satisfies GreaterRealmOceanBreathingRoomThresholds);

export const GREATER_REALM_FOREST_PATCH_THRESHOLDS = Object.freeze({
  minimumShareBasisPoints: 800,
  maximumShareBasisPoints: 4_200,
  clusteredComponentMinimumCells: 64,
  minimumClusteredShareBasisPoints: 7_500,
  broadComponentMinimumCells: 256,
  minimumBroadComponentCount: 3,
  tinyComponentMaximumCells: 7,
  maximumTinyShareBasisPoints: 800,
  maximumLargestComponentShareBasisPoints: 4_500,
} satisfies GreaterRealmPatchCompositionThresholds);

export const GREATER_REALM_MOUNTAIN_PATCH_THRESHOLDS = Object.freeze({
  minimumShareBasisPoints: 300,
  maximumShareBasisPoints: 2_800,
  clusteredComponentMinimumCells: 64,
  minimumClusteredShareBasisPoints: 7_000,
  broadComponentMinimumCells: 64,
  minimumBroadComponentCount: 2,
  tinyComponentMaximumCells: 7,
  maximumTinyShareBasisPoints: 800,
  maximumLargestComponentShareBasisPoints: 6_000,
} satisfies GreaterRealmPatchCompositionThresholds);

export const GREATER_REALM_MOUNTAIN_BELT_THRESHOLDS = Object.freeze({
  minimumBeltCells: 128,
  minimumMaximumAxialSpan: 24,
  minimumCentroidOffset: 12,
  minimumAxialAnisotropyBasisPoints: 15_000,
} satisfies GreaterRealmMountainBeltThresholds);

export const GREATER_REALM_COMPOSITION_THRESHOLDS = Object.freeze({
  landSilhouette: GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS,
  dominantContinent: GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS,
  oceanBreathingRoom: GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS,
  forest: GREATER_REALM_FOREST_PATCH_THRESHOLDS,
  mountain: GREATER_REALM_MOUNTAIN_PATCH_THRESHOLDS,
  mountainBelt: GREATER_REALM_MOUNTAIN_BELT_THRESHOLDS,
});

export type GreaterRealmRasterSilhouetteMetrics = Readonly<{
  resolution: 64 | 256;
  landPixels: number;
  perimeterEdges: number;
  rotationalIouBasisPoints: number;
}>;

export type GreaterRealmLandSilhouetteMetrics = Readonly<{
  coastHalfEdgeCount: number;
  maximumAlignedCoastRunCells: number;
  maximumAlignedCoastRunShareBasisPoints: number;
  dominantLandConvexHullCapacity: number;
  dominantLandSolidityBasisPoints: number;
  raster64: GreaterRealmRasterSilhouetteMetrics;
  raster256: GreaterRealmRasterSilhouetteMetrics;
  coastDetailGainBasisPoints: number;
  proof: boolean;
}>;

export type GreaterRealmDominantContinentMetrics = Readonly<{
  landCellCount: number;
  landmassCount: number;
  dominantLandmassCells: number;
  secondLandmassCells: number;
  dominantLandShareBasisPoints: number;
  dominantToSecondRatioBasisPoints: number;
  tierTwoOnDominantBasisPoints: number;
  tierThreeOnDominantBasisPoints: number;
  componentSizesDescending: readonly number[];
  proof: boolean;
}>;

export type GreaterRealmOceanBreathingRoomMetrics = Readonly<{
  boundaryCellCount: number;
  saltwaterBoundaryBasisPoints: number;
  minimumBoundaryLandDistance: number;
  boundaryLandDistanceP05: number;
  boundaryLandDistanceP50: number;
  boundaryLandDistanceP95: number;
  boundaryAtTargetShareBasisPoints: number;
  sectorBoundaryCellCounts: readonly number[];
  sectorMedianLandDistances: readonly number[];
  proof: boolean;
}>;

export type GreaterRealmPatchCompositionMetrics = Readonly<{
  eligibleCellCount: number;
  patchCellCount: number;
  patchShareBasisPoints: number;
  componentCount: number;
  broadComponentCount: number;
  clusteredShareBasisPoints: number;
  tinyShareBasisPoints: number;
  largestComponentShareBasisPoints: number;
  componentSizeP50: number;
  componentSizeP90: number;
  componentSizesDescending: readonly number[];
  proof: boolean;
}>;

export type GreaterRealmMountainSystemMetrics = GreaterRealmPatchCompositionMetrics & Readonly<{
  offCentreBeltCount: number;
  maximumBeltCells: number;
  maximumBeltAxialSpan: number;
  maximumBeltCentroidOffset: number;
  maximumBeltAxialAnisotropyBasisPoints: number;
  proof: boolean;
}>;

export type GreaterRealmNaturalCompositionMetrics = Readonly<{
  landSilhouette: GreaterRealmLandSilhouetteMetrics;
  dominantContinent: GreaterRealmDominantContinentMetrics;
  oceanBreathingRoom: GreaterRealmOceanBreathingRoomMetrics;
  forestPatches: GreaterRealmPatchCompositionMetrics;
  mountainSystems: GreaterRealmMountainSystemMetrics;
}>;

type ComponentInventory = Readonly<{
  componentId: Int32Array;
  components: readonly number[][];
}>;

function clearComponentInventory(inventory: ComponentInventory): void {
  inventory.componentId.fill(-1);
  for (const component of inventory.components) component.fill(0);
}

function fail(code: string): never {
  throw new Error(code);
}

function assertGridFieldLengths(
  grid: IndexedAxialGrid,
  fields: readonly ArrayLike<unknown>[],
): void {
  if (fields.some(field => field.length !== grid.cellCount)) {
    fail('GREATER_REALM_COMPOSITION_FIELD_LENGTH_INVALID');
  }
}

function assertBinaryMask(mask: Uint8Array): void {
  for (const value of mask) {
    if (value !== 0 && value !== 1) fail('GREATER_REALM_COMPOSITION_MASK_INVALID');
  }
}

function assertNonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('GREATER_REALM_COMPOSITION_THRESHOLD_INVALID');
  }
}

function assertShareBasisPoints(value: number): void {
  assertNonnegativeInteger(value);
  if (value > BASIS_POINTS) fail('GREATER_REALM_COMPOSITION_THRESHOLD_INVALID');
}

function assertOrdered(minimum: number, maximum: number): void {
  if (minimum > maximum) fail('GREATER_REALM_COMPOSITION_THRESHOLD_INVALID');
}

function validateLandSilhouetteThresholds(
  thresholds: GreaterRealmLandSilhouetteThresholds,
): void {
  assertShareBasisPoints(thresholds.maximumRotationalIou64BasisPoints);
  assertShareBasisPoints(thresholds.maximumRotationalIou256BasisPoints);
  assertShareBasisPoints(thresholds.maximumAlignedCoastRunShareBasisPoints);
  assertShareBasisPoints(thresholds.minimumDominantLandSolidityBasisPoints);
  assertShareBasisPoints(thresholds.maximumDominantLandSolidityBasisPoints);
  assertNonnegativeInteger(thresholds.minimumCoastDetailGainBasisPoints);
  assertNonnegativeInteger(thresholds.maximumCoastDetailGainBasisPoints);
  assertOrdered(
    thresholds.minimumDominantLandSolidityBasisPoints,
    thresholds.maximumDominantLandSolidityBasisPoints,
  );
  assertOrdered(
    thresholds.minimumCoastDetailGainBasisPoints,
    thresholds.maximumCoastDetailGainBasisPoints,
  );
}

function validateDominantContinentThresholds(
  thresholds: GreaterRealmDominantContinentThresholds,
): void {
  assertShareBasisPoints(thresholds.minimumDominantLandShareBasisPoints);
  assertShareBasisPoints(thresholds.maximumDominantLandShareBasisPoints);
  assertNonnegativeInteger(thresholds.minimumDominantToSecondRatioBasisPoints);
  assertShareBasisPoints(thresholds.minimumTierTwoOnDominantBasisPoints);
  assertShareBasisPoints(thresholds.minimumTierThreeOnDominantBasisPoints);
  assertOrdered(
    thresholds.minimumDominantLandShareBasisPoints,
    thresholds.maximumDominantLandShareBasisPoints,
  );
}

function validateOceanThresholds(
  thresholds: GreaterRealmOceanBreathingRoomThresholds,
): void {
  for (const value of [
    thresholds.minimumBoundaryLandDistance,
    thresholds.minimumBoundaryLandDistanceP05,
    thresholds.minimumBoundaryLandDistanceP50,
    thresholds.targetBoundaryLandDistance,
    thresholds.minimumSectorMedianLandDistance,
  ]) assertNonnegativeInteger(value);
  assertShareBasisPoints(thresholds.minimumBoundaryAtTargetShareBasisPoints);
  if (thresholds.sectorCount !== TWELVE_SECTOR_NORMALS.length) {
    fail('GREATER_REALM_COMPOSITION_SECTOR_COUNT_INVALID');
  }
}

function validatePatchThresholds(
  thresholds: GreaterRealmPatchCompositionThresholds,
): void {
  for (const value of [
    thresholds.minimumShareBasisPoints,
    thresholds.maximumShareBasisPoints,
    thresholds.minimumClusteredShareBasisPoints,
    thresholds.maximumTinyShareBasisPoints,
    thresholds.maximumLargestComponentShareBasisPoints,
  ]) assertShareBasisPoints(value);
  for (const value of [
    thresholds.clusteredComponentMinimumCells,
    thresholds.broadComponentMinimumCells,
    thresholds.minimumBroadComponentCount,
    thresholds.tinyComponentMaximumCells,
  ]) assertNonnegativeInteger(value);
  assertOrdered(thresholds.minimumShareBasisPoints, thresholds.maximumShareBasisPoints);
  if (
    thresholds.clusteredComponentMinimumCells < 1
    || thresholds.broadComponentMinimumCells < 1
    || thresholds.minimumBroadComponentCount < 1
  ) fail('GREATER_REALM_COMPOSITION_THRESHOLD_INVALID');
}

function validateMountainBeltThresholds(
  thresholds: GreaterRealmMountainBeltThresholds,
): void {
  for (const value of Object.values(thresholds)) assertNonnegativeInteger(value);
  if (
    thresholds.minimumBeltCells < 1
    || thresholds.minimumMaximumAxialSpan < 1
    || thresholds.minimumAxialAnisotropyBasisPoints < BASIS_POINTS
  ) fail('GREATER_REALM_COMPOSITION_THRESHOLD_INVALID');
}

function roundedBasisPoints(numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(numerator)
    || !Number.isSafeInteger(denominator)
    || numerator < 0
    || denominator <= 0
  ) fail('GREATER_REALM_COMPOSITION_RATIO_INVALID');
  return Math.round((numerator * BASIS_POINTS) / denominator);
}

function roundDivide(numerator: number, denominator: number): number {
  if (
    !Number.isSafeInteger(numerator)
    || !Number.isSafeInteger(denominator)
    || denominator <= 0
  ) fail('GREATER_REALM_COMPOSITION_DIVISION_INVALID');
  const sign = numerator < 0 ? -1 : 1;
  const magnitude = Math.abs(numerator);
  const quotient = Math.floor(magnitude / denominator);
  const remainder = magnitude % denominator;
  return sign * (quotient + (remainder * 2 >= denominator ? 1 : 0));
}

function axialDistance(q: number, r: number, otherQ = 0, otherR = 0): number {
  const deltaQ = q - otherQ;
  const deltaR = r - otherR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(-deltaQ - deltaR));
}

function percentile(sortedAscending: readonly number[], basisPoints: number): number {
  if (sortedAscending.length === 0) return 0;
  const index = Math.floor(((sortedAscending.length - 1) * basisPoints) / BASIS_POINTS);
  return sortedAscending[index]!;
}

function components(grid: IndexedAxialGrid, mask: Uint8Array): ComponentInventory {
  assertGridFieldLengths(grid, [mask]);
  assertBinaryMask(mask);
  const componentId = new Int32Array(grid.cellCount);
  componentId.fill(-1);
  const queue = new Uint32Array(grid.cellCount);
  const found: number[][] = [];
  let completed = false;
  try {
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (mask[start] !== 1 || componentId[start] >= 0) continue;
      const id = found.length;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      componentId[start] = id;
      const cells: number[] = [];
      while (head < tail) {
        const cell = queue[head++]!;
        cells.push(cell);
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || mask[neighbor] !== 1 || componentId[neighbor] >= 0) continue;
          componentId[neighbor] = id;
          queue[tail++] = neighbor;
        }
      }
      found.push(cells);
    }
    const inventory = Object.freeze({ componentId, components: Object.freeze(found) });
    completed = true;
    return inventory;
  } finally {
    queue.fill(0);
    if (!completed) {
      componentId.fill(-1);
      for (const component of found) component.fill(0);
    }
  }
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

function maskCentroid(
  grid: IndexedAxialGrid,
  mask: Uint8Array,
): Readonly<{ q: number; r: number }> {
  let count = 0;
  let qTotal = 0;
  let rTotal = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (mask[cell] !== 1) continue;
    count += 1;
    qTotal += grid.q[cell]!;
    rTotal += grid.r[cell]!;
  }
  if (count === 0) fail('GREATER_REALM_COMPOSITION_MASK_EMPTY');
  return Object.freeze({
    q: roundDivide(qTotal, count),
    r: roundDivide(rTotal, count),
  });
}

export function createGreaterRealmTopographicLandMask(
  elevation: ArrayLike<number>,
  seaLevel = 0,
): Uint8Array {
  if (!Number.isSafeInteger(seaLevel)) fail('GREATER_REALM_COMPOSITION_SEA_LEVEL_INVALID');
  const mask = new Uint8Array(elevation.length);
  let completed = false;
  try {
    for (let cell = 0; cell < elevation.length; cell += 1) {
      const value = elevation[cell]!;
      if (!Number.isSafeInteger(value)) fail('GREATER_REALM_COMPOSITION_ELEVATION_INVALID');
      if (value > seaLevel) mask[cell] = 1;
    }
    completed = true;
    return mask;
  } finally {
    if (!completed) mask.fill(0);
  }
}

function projectedRasterCoordinate(
  q: number,
  r: number,
  canvasRadius: number,
  resolution: 64 | 256,
): Readonly<{ x: number; y: number }> {
  const halfSpan = HEX_X_SCALE * canvasRadius * 2;
  const projectedX = HEX_X_SCALE * (q * 2 + r);
  const projectedY = HEX_Y_SCALE * r;
  const denominator = halfSpan * 2 + 1;
  return Object.freeze({
    x: Math.max(0, Math.min(
      resolution - 1,
      Math.floor(((projectedX + halfSpan) * resolution) / denominator),
    )),
    y: Math.max(0, Math.min(
      resolution - 1,
      Math.floor(((projectedY + halfSpan) * resolution) / denominator),
    )),
  });
}

function rasterizeLand(
  grid: IndexedAxialGrid,
  landMask: Uint8Array,
  canvasRadius: number,
  resolution: 64 | 256,
): Uint8Array {
  if (!Number.isSafeInteger(canvasRadius) || canvasRadius < 1 || canvasRadius > 10_000) {
    fail('GREATER_REALM_COMPOSITION_CANVAS_RADIUS_INVALID');
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (axialDistance(grid.q[cell]!, grid.r[cell]!) > canvasRadius) {
      fail('GREATER_REALM_COMPOSITION_CANVAS_RADIUS_INVALID');
    }
  }
  const raster = new Uint8Array(resolution * resolution);
  const brushRadius = Math.max(0, Math.ceil(resolution / (canvasRadius * 4)) - 1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const q = grid.q[cell]!;
    const r = grid.r[cell]!;
    if (landMask[cell] !== 1) continue;
    const center = projectedRasterCoordinate(q, r, canvasRadius, resolution);
    for (let offsetY = -brushRadius; offsetY <= brushRadius; offsetY += 1) {
      const y = center.y + offsetY;
      if (y < 0 || y >= resolution) continue;
      for (let offsetX = -brushRadius; offsetX <= brushRadius; offsetX += 1) {
        const x = center.x + offsetX;
        if (x < 0 || x >= resolution) continue;
        raster[y * resolution + x] = 1;
      }
    }
  }
  return raster;
}

function rasterPerimeter(raster: Uint8Array, resolution: number): number {
  let perimeter = 0;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      if (raster[y * resolution + x] !== 1) continue;
      if (x === 0 || raster[y * resolution + x - 1] !== 1) perimeter += 1;
      if (x + 1 === resolution || raster[y * resolution + x + 1] !== 1) perimeter += 1;
      if (y === 0 || raster[(y - 1) * resolution + x] !== 1) perimeter += 1;
      if (y + 1 === resolution || raster[(y + 1) * resolution + x] !== 1) perimeter += 1;
    }
  }
  return perimeter;
}

function rotatedRasterIou(
  raster: Uint8Array,
  resolution: 64 | 256,
  sine: number,
): number {
  let landPixels = 0;
  let xTotal = 0;
  let yTotal = 0;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      if (raster[y * resolution + x] !== 1) continue;
      landPixels += 1;
      xTotal += x;
      yTotal += y;
    }
  }
  if (landPixels === 0) return 0;
  const denominator = landPixels * ROTATION_SCALE;
  const rotated = new Uint8Array(raster.length);
  try {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        if (raster[y * resolution + x] !== 1) continue;
        const deltaX = x * landPixels - xTotal;
        const deltaY = y * landPixels - yTotal;
        const rotatedXNumerator = SIXTY_DEGREE_COSINE * deltaX
          - sine * deltaY
          + xTotal * ROTATION_SCALE;
        const rotatedYNumerator = sine * deltaX
          + SIXTY_DEGREE_COSINE * deltaY
          + yTotal * ROTATION_SCALE;
        const rotatedX = roundDivide(rotatedXNumerator, denominator);
        const rotatedY = roundDivide(rotatedYNumerator, denominator);
        if (
          rotatedX >= 0
          && rotatedX < resolution
          && rotatedY >= 0
          && rotatedY < resolution
        ) rotated[rotatedY * resolution + rotatedX] = 1;
      }
    }
    let intersection = 0;
    let union = 0;
    for (let pixel = 0; pixel < raster.length; pixel += 1) {
      const first = raster[pixel] === 1;
      const second = rotated[pixel] === 1;
      if (first && second) intersection += 1;
      if (first || second) union += 1;
    }
    return union === 0 ? 0 : roundedBasisPoints(intersection, union);
  } finally {
    rotated.fill(0);
  }
}

function rasterMetrics(
  grid: IndexedAxialGrid,
  landMask: Uint8Array,
  canvasRadius: number,
  resolution: 64 | 256,
): GreaterRealmRasterSilhouetteMetrics {
  const raster = rasterizeLand(grid, landMask, canvasRadius, resolution);
  try {
    return Object.freeze({
      resolution,
      landPixels: countMask(raster),
      perimeterEdges: rasterPerimeter(raster, resolution),
      rotationalIouBasisPoints: Math.max(
        rotatedRasterIou(raster, resolution, SIXTY_DEGREE_SINE),
        rotatedRasterIou(raster, resolution, -SIXTY_DEGREE_SINE),
      ),
    });
  } finally {
    raster.fill(0);
  }
}

function alignedCoastRun(
  grid: IndexedAxialGrid,
  dominantMask: Uint8Array,
): Readonly<{
  coastHalfEdgeCount: number;
  maximumRunCells: number;
}> {
  let coastHalfEdgeCount = 0;
  let maximumRunCells = 0;
  const queue = new Uint32Array(grid.cellCount);
  try {
    for (let normal = 0; normal < HEX_NEIGHBOR_COUNT; normal += 1) {
      const edgeMask = new Uint8Array(grid.cellCount);
      const seen = new Uint8Array(grid.cellCount);
      try {
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (dominantMask[cell] !== 1) continue;
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + normal]!;
          if (neighbor >= 0 && dominantMask[neighbor] === 1) continue;
          edgeMask[cell] = 1;
          coastHalfEdgeCount += 1;
        }
        const tangentDirections = [(normal + 2) % 6, (normal + 5) % 6] as const;
        for (let start = 0; start < grid.cellCount; start += 1) {
          if (edgeMask[start] !== 1 || seen[start] === 1) continue;
          let head = 0;
          let tail = 0;
          queue[tail++] = start;
          seen[start] = 1;
          while (head < tail) {
            const cell = queue[head++]!;
            for (const direction of tangentDirections) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor < 0
                || edgeMask[neighbor] !== 1
                || seen[neighbor] === 1
              ) continue;
              seen[neighbor] = 1;
              queue[tail++] = neighbor;
            }
          }
          maximumRunCells = Math.max(maximumRunCells, tail);
        }
      } finally {
        edgeMask.fill(0);
        seen.fill(0);
      }
    }
    return Object.freeze({ coastHalfEdgeCount, maximumRunCells });
  } finally {
    queue.fill(0);
  }
}

function greatestCommonDivisor(first: number, second: number): number {
  let left = Math.abs(first);
  let right = Math.abs(second);
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

function dominantConvexHullCapacity(
  grid: IndexedAxialGrid,
  cells: readonly number[],
): number {
  type MutableAxialPoint = { q: number; r: number };
  const points: MutableAxialPoint[] = cells.map(cell => ({
    q: grid.q[cell]!,
    r: grid.r[cell]!,
  })).sort((first, second) => first.q - second.q || first.r - second.r);
  try {
    if (points.length <= 2) return points.length;
    const cross = (
      first: Readonly<MutableAxialPoint>,
      second: Readonly<MutableAxialPoint>,
      third: Readonly<MutableAxialPoint>,
    ) => (second.q - first.q) * (third.r - first.r)
      - (second.r - first.r) * (third.q - first.q);
    const halfHull = (
      ordered: readonly Readonly<MutableAxialPoint>[],
    ): Array<Readonly<MutableAxialPoint>> => {
      const hull: Array<Readonly<MutableAxialPoint>> = [];
      for (const point of ordered) {
        while (
          hull.length >= 2
          && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, point) <= 0
        ) hull.pop();
        hull.push(point);
      }
      return hull;
    };
    const lower = halfHull(points);
    const upper = halfHull([...points].reverse());
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    if (hull.length < 3) return points.length;
    let signedDoubleArea = 0;
    let boundaryLatticePoints = 0;
    for (let index = 0; index < hull.length; index += 1) {
      const first = hull[index]!;
      const second = hull[(index + 1) % hull.length]!;
      signedDoubleArea += first.q * second.r - first.r * second.q;
      boundaryLatticePoints += greatestCommonDivisor(
        second.q - first.q,
        second.r - first.r,
      );
    }
    // Pick's theorem on the axial integer lattice. This returns the number of
    // cell centers inside or on the convex hull, which equals the exact cell
    // count for a filled axial hexagon and avoids a floating-point ellipse fit.
    const numerator = Math.abs(signedDoubleArea) + boundaryLatticePoints;
    if (numerator % 2 !== 0) fail('GREATER_REALM_COMPOSITION_HULL_INVALID');
    return numerator / 2 + 1;
  } finally {
    for (const point of points) {
      point.q = 0;
      point.r = 0;
    }
  }
}

export function isGreaterRealmNaturalLandSilhouette(
  metrics: Omit<GreaterRealmLandSilhouetteMetrics, 'proof'>,
  thresholds: GreaterRealmLandSilhouetteThresholds = GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS,
): boolean {
  validateLandSilhouetteThresholds(thresholds);
  return metrics.coastHalfEdgeCount > 0
    && metrics.raster64.landPixels > 0
    && metrics.raster256.landPixels > 0
    && metrics.raster64.perimeterEdges > 0
    && metrics.raster256.perimeterEdges > 0
    && metrics.raster64.rotationalIouBasisPoints
      <= thresholds.maximumRotationalIou64BasisPoints
    && metrics.raster256.rotationalIouBasisPoints
      <= thresholds.maximumRotationalIou256BasisPoints
    && metrics.maximumAlignedCoastRunShareBasisPoints
      <= thresholds.maximumAlignedCoastRunShareBasisPoints
    && metrics.dominantLandSolidityBasisPoints
      >= thresholds.minimumDominantLandSolidityBasisPoints
    && metrics.dominantLandSolidityBasisPoints
      <= thresholds.maximumDominantLandSolidityBasisPoints
    && metrics.coastDetailGainBasisPoints >= thresholds.minimumCoastDetailGainBasisPoints
    && metrics.coastDetailGainBasisPoints <= thresholds.maximumCoastDetailGainBasisPoints;
}

export function measureGreaterRealmLandSilhouette(input: Readonly<{
  grid: IndexedAxialGrid;
  landMask: Uint8Array;
  canvasRadius: number;
  thresholds?: GreaterRealmLandSilhouetteThresholds;
}>): GreaterRealmLandSilhouetteMetrics {
  assertGridFieldLengths(input.grid, [input.landMask]);
  assertBinaryMask(input.landMask);
  const inventory = components(input.grid, input.landMask);
  const dominantMask = new Uint8Array(input.grid.cellCount);
  try {
    if (inventory.components.length === 0) fail('GREATER_REALM_COMPOSITION_LAND_EMPTY');
    let dominantId = 0;
    for (let id = 1; id < inventory.components.length; id += 1) {
      if (
        inventory.components[id]!.length > inventory.components[dominantId]!.length
        || (
          inventory.components[id]!.length === inventory.components[dominantId]!.length
          && inventory.components[id]![0]! < inventory.components[dominantId]![0]!
        )
      ) dominantId = id;
    }
    for (const cell of inventory.components[dominantId]!) dominantMask[cell] = 1;
    const coast = alignedCoastRun(input.grid, dominantMask);
    const dominantLandConvexHullCapacity = dominantConvexHullCapacity(
      input.grid,
      inventory.components[dominantId]!,
    );
    const raster64 = rasterMetrics(input.grid, dominantMask, input.canvasRadius, 64);
    const raster256 = rasterMetrics(input.grid, dominantMask, input.canvasRadius, 256);
    const coastDetailGainBasisPoints = raster64.perimeterEdges === 0
      ? 0
      : roundedBasisPoints(raster256.perimeterEdges, raster64.perimeterEdges * 4);
    const withoutProof = Object.freeze({
      coastHalfEdgeCount: coast.coastHalfEdgeCount,
      maximumAlignedCoastRunCells: coast.maximumRunCells,
      maximumAlignedCoastRunShareBasisPoints: coast.coastHalfEdgeCount === 0
        ? BASIS_POINTS
        : roundedBasisPoints(coast.maximumRunCells, coast.coastHalfEdgeCount),
      dominantLandConvexHullCapacity,
      dominantLandSolidityBasisPoints: roundedBasisPoints(
        inventory.components[dominantId]!.length,
        dominantLandConvexHullCapacity,
      ),
      raster64,
      raster256,
      coastDetailGainBasisPoints,
    });
    return Object.freeze({
      ...withoutProof,
      proof: isGreaterRealmNaturalLandSilhouette(
        withoutProof,
        input.thresholds ?? GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS,
      ),
    });
  } finally {
    dominantMask.fill(0);
    clearComponentInventory(inventory);
  }
}

export function isGreaterRealmDominantContinentComposition(
  metrics: Omit<GreaterRealmDominantContinentMetrics, 'componentSizesDescending' | 'proof'>,
  thresholds: GreaterRealmDominantContinentThresholds = GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS,
): boolean {
  validateDominantContinentThresholds(thresholds);
  return metrics.landCellCount > 0
    && metrics.landmassCount >= 2
    && metrics.secondLandmassCells > 0
    && metrics.dominantLandShareBasisPoints >= thresholds.minimumDominantLandShareBasisPoints
    && metrics.dominantLandShareBasisPoints <= thresholds.maximumDominantLandShareBasisPoints
    && metrics.dominantToSecondRatioBasisPoints
      >= thresholds.minimumDominantToSecondRatioBasisPoints
    && metrics.tierTwoOnDominantBasisPoints >= thresholds.minimumTierTwoOnDominantBasisPoints
    && metrics.tierThreeOnDominantBasisPoints >= thresholds.minimumTierThreeOnDominantBasisPoints;
}

export function measureGreaterRealmDominantContinent(input: Readonly<{
  grid: IndexedAxialGrid;
  landMask: Uint8Array;
  tierId: Uint8Array;
  tierTwoId?: number;
  tierThreeId?: number;
  thresholds?: GreaterRealmDominantContinentThresholds;
}>): GreaterRealmDominantContinentMetrics {
  assertGridFieldLengths(input.grid, [input.landMask, input.tierId]);
  assertBinaryMask(input.landMask);
  const tierTwoId = input.tierTwoId ?? 2;
  const tierThreeId = input.tierThreeId ?? 3;
  if (!Number.isSafeInteger(tierTwoId) || !Number.isSafeInteger(tierThreeId)) {
    fail('GREATER_REALM_COMPOSITION_TIER_INVALID');
  }
  const inventory = components(input.grid, input.landMask);
  try {
    if (inventory.components.length === 0) fail('GREATER_REALM_COMPOSITION_LAND_EMPTY');
    const orderedIds = inventory.components.map((_, id) => id).sort((first, second) => (
      inventory.components[second]!.length - inventory.components[first]!.length
      || inventory.components[first]![0]! - inventory.components[second]![0]!
    ));
    const dominantId = orderedIds[0]!;
    const componentSizesDescending = Object.freeze(orderedIds.map(
      id => inventory.components[id]!.length,
    ));
    const landCellCount = componentSizesDescending.reduce(
      (total, size) => total + size,
      0,
    );
    const dominantLandmassCells = componentSizesDescending[0]!;
    const secondLandmassCells = componentSizesDescending[1] ?? 0;
    let tierTwoCells = 0;
    let tierThreeCells = 0;
    let tierTwoDominantCells = 0;
    let tierThreeDominantCells = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.landMask[cell] !== 1) continue;
      if (input.tierId[cell] === tierTwoId) {
        tierTwoCells += 1;
        if (inventory.componentId[cell] === dominantId) tierTwoDominantCells += 1;
      }
      if (input.tierId[cell] === tierThreeId) {
        tierThreeCells += 1;
        if (inventory.componentId[cell] === dominantId) tierThreeDominantCells += 1;
      }
    }
    const withoutVectors = Object.freeze({
      landCellCount,
      landmassCount: inventory.components.length,
      dominantLandmassCells,
      secondLandmassCells,
      dominantLandShareBasisPoints: roundedBasisPoints(
        dominantLandmassCells,
        landCellCount,
      ),
      dominantToSecondRatioBasisPoints: secondLandmassCells === 0
        ? Number.MAX_SAFE_INTEGER
        : roundedBasisPoints(dominantLandmassCells, secondLandmassCells),
      tierTwoOnDominantBasisPoints: tierTwoCells === 0
        ? 0
        : roundedBasisPoints(tierTwoDominantCells, tierTwoCells),
      tierThreeOnDominantBasisPoints: tierThreeCells === 0
        ? 0
        : roundedBasisPoints(tierThreeDominantCells, tierThreeCells),
    });
    return Object.freeze({
      ...withoutVectors,
      componentSizesDescending,
      proof: isGreaterRealmDominantContinentComposition(
        withoutVectors,
        input.thresholds ?? GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS,
      ),
    });
  } finally {
    clearComponentInventory(inventory);
  }
}

function distanceFromLand(grid: IndexedAxialGrid, landMask: Uint8Array): Uint32Array {
  const unreachable = 0xffff_ffff;
  const distance = new Uint32Array(grid.cellCount);
  distance.fill(unreachable);
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  let completed = false;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (landMask[cell] !== 1) continue;
    distance[cell] = 0;
    queue[tail++] = cell;
  }
  try {
    if (tail === 0) fail('GREATER_REALM_COMPOSITION_LAND_EMPTY');
    while (head < tail) {
      const cell = queue[head++]!;
      const nextDistance = distance[cell]! + 1;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || distance[neighbor]! <= nextDistance) continue;
        distance[neighbor] = nextDistance;
        queue[tail++] = neighbor;
      }
    }
    for (const value of distance) {
      if (value === unreachable) fail('GREATER_REALM_COMPOSITION_GRID_DISCONNECTED');
    }
    completed = true;
    return distance;
  } finally {
    queue.fill(0);
    if (!completed) distance.fill(0);
  }
}

const TWELVE_SECTOR_NORMALS = Object.freeze([
  Object.freeze([1_000, 0] as const),
  Object.freeze([866, 500] as const),
  Object.freeze([500, 866] as const),
  Object.freeze([0, 1_000] as const),
  Object.freeze([-500, 866] as const),
  Object.freeze([-866, 500] as const),
  Object.freeze([-1_000, 0] as const),
  Object.freeze([-866, -500] as const),
  Object.freeze([-500, -866] as const),
  Object.freeze([0, -1_000] as const),
  Object.freeze([500, -866] as const),
  Object.freeze([866, -500] as const),
]);

function boundarySector(
  q: number,
  r: number,
  centroid: Readonly<{ q: number; r: number }>,
  sectorCount: number,
): number {
  if (sectorCount !== TWELVE_SECTOR_NORMALS.length) {
    fail('GREATER_REALM_COMPOSITION_SECTOR_COUNT_INVALID');
  }
  const deltaQ = q - centroid.q;
  const deltaR = r - centroid.r;
  const x = 1_732 * (deltaQ * 2 + deltaR);
  const y = 3_000 * deltaR;
  let selected = 0;
  let selectedDot = Number.NEGATIVE_INFINITY;
  for (let sector = 0; sector < TWELVE_SECTOR_NORMALS.length; sector += 1) {
    const normal = TWELVE_SECTOR_NORMALS[sector]!;
    const dot = x * normal[0] + y * normal[1];
    if (dot > selectedDot) {
      selected = sector;
      selectedDot = dot;
    }
  }
  return selected;
}

export function isGreaterRealmDeepOceanBreathingRoom(
  metrics: Omit<GreaterRealmOceanBreathingRoomMetrics, 'proof'>,
  thresholds: GreaterRealmOceanBreathingRoomThresholds =
    GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS,
): boolean {
  validateOceanThresholds(thresholds);
  return metrics.boundaryCellCount > 0
    && metrics.saltwaterBoundaryBasisPoints === BASIS_POINTS
    && metrics.minimumBoundaryLandDistance >= thresholds.minimumBoundaryLandDistance
    && metrics.boundaryLandDistanceP05 >= thresholds.minimumBoundaryLandDistanceP05
    && metrics.boundaryLandDistanceP50 >= thresholds.minimumBoundaryLandDistanceP50
    && metrics.boundaryAtTargetShareBasisPoints
      >= thresholds.minimumBoundaryAtTargetShareBasisPoints
    && metrics.sectorBoundaryCellCounts.length === thresholds.sectorCount
    && metrics.sectorMedianLandDistances.length === thresholds.sectorCount
    && metrics.sectorBoundaryCellCounts.every(count => count > 0)
    && metrics.sectorMedianLandDistances.every(
      distance => distance >= thresholds.minimumSectorMedianLandDistance,
    );
}

export function measureGreaterRealmOceanBreathingRoom(input: Readonly<{
  grid: IndexedAxialGrid;
  landMask: Uint8Array;
  saltwaterMask: Uint8Array;
  thresholds?: GreaterRealmOceanBreathingRoomThresholds;
}>): GreaterRealmOceanBreathingRoomMetrics {
  assertGridFieldLengths(input.grid, [input.landMask, input.saltwaterMask]);
  assertBinaryMask(input.landMask);
  assertBinaryMask(input.saltwaterMask);
  const thresholds = input.thresholds ?? GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS;
  validateOceanThresholds(thresholds);
  const centroid = maskCentroid(input.grid, input.landMask);
  const distance = distanceFromLand(input.grid, input.landMask);
  const boundaryDistances: number[] = [];
  const sectorDistances = Array.from({ length: thresholds.sectorCount }, () => [] as number[]);
  try {
    let saltwaterBoundaryCells = 0;
    let boundaryAtTargetCells = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      let boundary = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (input.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) {
          boundary = true;
          break;
        }
      }
      if (!boundary) continue;
      const cellDistance = distance[cell]!;
      boundaryDistances.push(cellDistance);
      if (input.saltwaterMask[cell] === 1) saltwaterBoundaryCells += 1;
      if (cellDistance >= thresholds.targetBoundaryLandDistance) boundaryAtTargetCells += 1;
      sectorDistances[boundarySector(
        input.grid.q[cell]!,
        input.grid.r[cell]!,
        centroid,
        thresholds.sectorCount,
      )]!.push(cellDistance);
    }
    if (boundaryDistances.length === 0) fail('GREATER_REALM_COMPOSITION_BOUNDARY_EMPTY');
    boundaryDistances.sort((first, second) => first - second);
    const sortedSectorDistances = sectorDistances.map(values => (
      values.sort((first, second) => first - second)
    ));
    const withoutProof = Object.freeze({
      boundaryCellCount: boundaryDistances.length,
      saltwaterBoundaryBasisPoints: roundedBasisPoints(
        saltwaterBoundaryCells,
        boundaryDistances.length,
      ),
      minimumBoundaryLandDistance: boundaryDistances[0]!,
      boundaryLandDistanceP05: percentile(boundaryDistances, 500),
      boundaryLandDistanceP50: percentile(boundaryDistances, 5_000),
      boundaryLandDistanceP95: percentile(boundaryDistances, 9_500),
      boundaryAtTargetShareBasisPoints: roundedBasisPoints(
        boundaryAtTargetCells,
        boundaryDistances.length,
      ),
      sectorBoundaryCellCounts: Object.freeze(
        sortedSectorDistances.map(values => values.length),
      ),
      sectorMedianLandDistances: Object.freeze(sortedSectorDistances.map(
        values => percentile(values, 5_000),
      )),
    });
    return Object.freeze({
      ...withoutProof,
      proof: isGreaterRealmDeepOceanBreathingRoom(withoutProof, thresholds),
    });
  } finally {
    boundaryDistances.fill(0);
    for (const values of sectorDistances) values.fill(0);
    distance.fill(0);
  }
}

export function isGreaterRealmPatchComposition(
  metrics: Omit<GreaterRealmPatchCompositionMetrics, 'componentSizesDescending' | 'proof'>,
  thresholds: GreaterRealmPatchCompositionThresholds,
): boolean {
  validatePatchThresholds(thresholds);
  return metrics.eligibleCellCount > 0
    && metrics.patchCellCount > 0
    && metrics.patchShareBasisPoints >= thresholds.minimumShareBasisPoints
    && metrics.patchShareBasisPoints <= thresholds.maximumShareBasisPoints
    && metrics.clusteredShareBasisPoints >= thresholds.minimumClusteredShareBasisPoints
    && metrics.broadComponentCount >= thresholds.minimumBroadComponentCount
    && metrics.tinyShareBasisPoints <= thresholds.maximumTinyShareBasisPoints
    && metrics.largestComponentShareBasisPoints
      <= thresholds.maximumLargestComponentShareBasisPoints;
}

export function measureGreaterRealmPatchComposition(input: Readonly<{
  grid: IndexedAxialGrid;
  eligibleMask: Uint8Array;
  patchMask: Uint8Array;
  thresholds: GreaterRealmPatchCompositionThresholds;
}>): GreaterRealmPatchCompositionMetrics {
  assertGridFieldLengths(input.grid, [input.eligibleMask, input.patchMask]);
  assertBinaryMask(input.eligibleMask);
  assertBinaryMask(input.patchMask);
  validatePatchThresholds(input.thresholds);
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (input.patchMask[cell] === 1 && input.eligibleMask[cell] !== 1) {
      fail('GREATER_REALM_COMPOSITION_PATCH_OUTSIDE_ELIGIBLE');
    }
  }
  const eligibleCellCount = countMask(input.eligibleMask);
  const patchCellCount = countMask(input.patchMask);
  if (eligibleCellCount === 0) fail('GREATER_REALM_COMPOSITION_ELIGIBLE_EMPTY');
  const inventory = components(input.grid, input.patchMask);
  try {
    const ascending = inventory.components.map(component => component.length)
      .sort((first, second) => first - second);
    const componentSizesDescending = Object.freeze([...ascending].reverse());
    const clusteredCells = ascending
      .filter(size => size >= input.thresholds.clusteredComponentMinimumCells)
      .reduce((total, size) => total + size, 0);
    const tinyCells = ascending
      .filter(size => size <= input.thresholds.tinyComponentMaximumCells)
      .reduce((total, size) => total + size, 0);
    const broadComponentCount = ascending.filter(
      size => size >= input.thresholds.broadComponentMinimumCells,
    ).length;
    const withoutVectors = Object.freeze({
      eligibleCellCount,
      patchCellCount,
      patchShareBasisPoints: patchCellCount === 0
        ? 0
        : roundedBasisPoints(patchCellCount, eligibleCellCount),
      componentCount: ascending.length,
      broadComponentCount,
      clusteredShareBasisPoints: patchCellCount === 0
        ? 0
        : roundedBasisPoints(clusteredCells, patchCellCount),
      tinyShareBasisPoints: patchCellCount === 0
        ? 0
        : roundedBasisPoints(tinyCells, patchCellCount),
      largestComponentShareBasisPoints: patchCellCount === 0
        ? 0
        : roundedBasisPoints(componentSizesDescending[0] ?? 0, patchCellCount),
      componentSizeP50: percentile(ascending, 5_000),
      componentSizeP90: percentile(ascending, 9_000),
    });
    return Object.freeze({
      ...withoutVectors,
      componentSizesDescending,
      proof: isGreaterRealmPatchComposition(withoutVectors, input.thresholds),
    });
  } finally {
    clearComponentInventory(inventory);
  }
}

export function createGreaterRealmForestMask(input: Readonly<{
  waterRegime: Uint8Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  legacyProtectedCell: Uint8Array;
  dryWaterRegime?: number;
}>): Uint8Array {
  if (
    input.waterRegime.length !== input.biomeId.length
    || input.waterRegime.length !== input.landformId.length
    || input.waterRegime.length !== input.legacyProtectedCell.length
  ) fail('GREATER_REALM_COMPOSITION_FIELD_LENGTH_INVALID');
  const dryWaterRegime = input.dryWaterRegime ?? 0;
  const mask = new Uint8Array(input.waterRegime.length);
  for (let cell = 0; cell < mask.length; cell += 1) {
    // The frozen Lowlands surface is compatibility authority, not a sample of
    // the new generator's patch composition. It is preserved exactly and is
    // therefore excluded from both numerator and denominator below.
    if (
      input.waterRegime[cell] !== dryWaterRegime
      || input.legacyProtectedCell[cell] === 1
    ) continue;
    const biome = input.biomeId[cell]!;
    if (
      biome === GREATER_REALM_BIOME_ID.OAK_FOREST
      || biome === GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST
      // Pine visuals are also used by glacial valleys. Snow and ice are not
      // forest merely because the cool-forest family shares a visual ID.
      || (
        biome === GREATER_REALM_BIOME_ID.PINE_FOREST
        && input.landformId[cell] !== GREATER_REALM_LANDFORM_ID.GLACIAL_VALLEY
      )
    ) mask[cell] = 1;
  }
  return mask;
}

export function measureGreaterRealmForestPatchComposition(input: Readonly<{
  grid: IndexedAxialGrid;
  waterRegime: Uint8Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  legacyProtectedCell: Uint8Array;
  dryWaterRegime?: number;
  thresholds?: GreaterRealmPatchCompositionThresholds;
}>): GreaterRealmPatchCompositionMetrics {
  assertGridFieldLengths(input.grid, [
    input.waterRegime,
    input.biomeId,
    input.landformId,
    input.legacyProtectedCell,
  ]);
  const dryWaterRegime = input.dryWaterRegime ?? 0;
  const eligibleMask = Uint8Array.from(
    input.waterRegime,
    (value, cell) => (
      value === dryWaterRegime && input.legacyProtectedCell[cell] !== 1 ? 1 : 0
    ),
  );
  let forestMask: Uint8Array | undefined;
  try {
    forestMask = createGreaterRealmForestMask({
      waterRegime: input.waterRegime,
      biomeId: input.biomeId,
      landformId: input.landformId,
      legacyProtectedCell: input.legacyProtectedCell,
      dryWaterRegime,
    });
    return measureGreaterRealmPatchComposition({
      grid: input.grid,
      eligibleMask,
      patchMask: forestMask,
      thresholds: input.thresholds ?? GREATER_REALM_FOREST_PATCH_THRESHOLDS,
    });
  } finally {
    eligibleMask.fill(0);
    forestMask?.fill(0);
  }
}

export function createGreaterRealmMountainMask(input: Readonly<{
  grid: IndexedAxialGrid;
  waterRegime: Uint8Array;
  ridgeId: Int32Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  elevation: Int32Array;
  slope: Uint16Array;
  dryWaterRegime?: number;
}>): Uint8Array {
  assertGridFieldLengths(input.grid, [
    input.waterRegime,
    input.ridgeId,
    input.biomeId,
    input.landformId,
    input.elevation,
    input.slope,
  ]);
  const dryWaterRegime = input.dryWaterRegime ?? 0;
  const core = new Uint8Array(input.grid.cellCount);
  let mask: Uint8Array | undefined;
  let completed = false;
  try {
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.waterRegime[cell] !== dryWaterRegime) continue;
      if (
        input.ridgeId[cell]! > 0
        || (
          input.biomeId[cell] === GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND
          && input.landformId[cell] === GREATER_REALM_LANDFORM_ID.HIGHLAND
        )
        || input.landformId[cell] === GREATER_REALM_LANDFORM_ID.MOUNTAIN
      ) core[cell] = 1;
    }
    mask = new Uint8Array(core);
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (
        mask[cell] === 1
        || input.waterRegime[cell] !== dryWaterRegime
        || input.elevation[cell]! < 5_500
        || input.slope[cell]! < 600
      ) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor >= 0 && core[neighbor] === 1) {
          mask[cell] = 1;
          break;
        }
      }
    }
    completed = true;
    return mask;
  } finally {
    core.fill(0);
    if (!completed) mask?.fill(0);
  }
}

function componentBeltMetrics(
  grid: IndexedAxialGrid,
  cells: readonly number[],
  landCentroid: Readonly<{ q: number; r: number }>,
): Readonly<{
  cells: number;
  maximumAxialSpan: number;
  centroidOffset: number;
  axialAnisotropyBasisPoints: number;
}> {
  let minimumQ = Number.POSITIVE_INFINITY;
  let maximumQ = Number.NEGATIVE_INFINITY;
  let minimumR = Number.POSITIVE_INFINITY;
  let maximumR = Number.NEGATIVE_INFINITY;
  let minimumS = Number.POSITIVE_INFINITY;
  let maximumS = Number.NEGATIVE_INFINITY;
  let qTotal = 0;
  let rTotal = 0;
  for (const cell of cells) {
    const q = grid.q[cell]!;
    const r = grid.r[cell]!;
    const s = -q - r;
    minimumQ = Math.min(minimumQ, q);
    maximumQ = Math.max(maximumQ, q);
    minimumR = Math.min(minimumR, r);
    maximumR = Math.max(maximumR, r);
    minimumS = Math.min(minimumS, s);
    maximumS = Math.max(maximumS, s);
    qTotal += q;
    rTotal += r;
  }
  const spans = [maximumQ - minimumQ, maximumR - minimumR, maximumS - minimumS]
    .sort((first, second) => first - second);
  // A one-cell-wide axial chain has a zero transverse span. Treat that as a
  // bounded width of one cell instead of skipping to the next (longitudinal)
  // span, otherwise the clearest natural belt is incorrectly scored 1:1.
  const boundedMinimumSpan = Math.max(1, spans[0]!);
  const maximumAxialSpan = spans[2]!;
  const centroidQ = roundDivide(qTotal, cells.length);
  const centroidR = roundDivide(rTotal, cells.length);
  return Object.freeze({
    cells: cells.length,
    maximumAxialSpan,
    centroidOffset: axialDistance(centroidQ, centroidR, landCentroid.q, landCentroid.r),
    axialAnisotropyBasisPoints: roundedBasisPoints(maximumAxialSpan, boundedMinimumSpan),
  });
}

export function isGreaterRealmMountainSystemComposition(
  metrics: Omit<GreaterRealmMountainSystemMetrics, 'componentSizesDescending' | 'proof'>,
  patchThresholds: GreaterRealmPatchCompositionThresholds =
    GREATER_REALM_MOUNTAIN_PATCH_THRESHOLDS,
): boolean {
  return isGreaterRealmPatchComposition(metrics, patchThresholds)
    && metrics.offCentreBeltCount > 0;
}

export function measureGreaterRealmMountainSystemComposition(input: Readonly<{
  grid: IndexedAxialGrid;
  landMask: Uint8Array;
  mountainMask: Uint8Array;
  patchThresholds?: GreaterRealmPatchCompositionThresholds;
  beltThresholds?: GreaterRealmMountainBeltThresholds;
}>): GreaterRealmMountainSystemMetrics {
  assertGridFieldLengths(input.grid, [input.landMask, input.mountainMask]);
  assertBinaryMask(input.landMask);
  assertBinaryMask(input.mountainMask);
  const patchThresholds = input.patchThresholds ?? GREATER_REALM_MOUNTAIN_PATCH_THRESHOLDS;
  const beltThresholds = input.beltThresholds ?? GREATER_REALM_MOUNTAIN_BELT_THRESHOLDS;
  validatePatchThresholds(patchThresholds);
  validateMountainBeltThresholds(beltThresholds);
  const patch = measureGreaterRealmPatchComposition({
    grid: input.grid,
    eligibleMask: input.landMask,
    patchMask: input.mountainMask,
    thresholds: patchThresholds,
  });
  const landCentroid = maskCentroid(input.grid, input.landMask);
  const inventory = components(input.grid, input.mountainMask);
  try {
    const belts = inventory.components.map(component => (
      componentBeltMetrics(input.grid, component, landCentroid)
    ));
    const acceptedBelts = belts.filter(belt => (
      belt.cells >= beltThresholds.minimumBeltCells
      && belt.maximumAxialSpan >= beltThresholds.minimumMaximumAxialSpan
      && belt.centroidOffset >= beltThresholds.minimumCentroidOffset
      && belt.axialAnisotropyBasisPoints
        >= beltThresholds.minimumAxialAnisotropyBasisPoints
    ));
    let maximumBeltCells = 0;
    let maximumBeltAxialSpan = 0;
    let maximumBeltCentroidOffset = 0;
    let maximumBeltAxialAnisotropyBasisPoints = 0;
    for (const belt of acceptedBelts) {
      maximumBeltCells = Math.max(maximumBeltCells, belt.cells);
      maximumBeltAxialSpan = Math.max(maximumBeltAxialSpan, belt.maximumAxialSpan);
      maximumBeltCentroidOffset = Math.max(
        maximumBeltCentroidOffset,
        belt.centroidOffset,
      );
      maximumBeltAxialAnisotropyBasisPoints = Math.max(
        maximumBeltAxialAnisotropyBasisPoints,
        belt.axialAnisotropyBasisPoints,
      );
    }
    const withoutProof = Object.freeze({
      ...patch,
      offCentreBeltCount: acceptedBelts.length,
      maximumBeltCells,
      maximumBeltAxialSpan,
      maximumBeltCentroidOffset,
      maximumBeltAxialAnisotropyBasisPoints,
    });
    return Object.freeze({
      ...withoutProof,
      proof: isGreaterRealmMountainSystemComposition(withoutProof, patchThresholds),
    });
  } finally {
    clearComponentInventory(inventory);
  }
}

/**
 * Measures the complete owner-review composition contract from final terrain
 * authority. The temporary masks are intentionally kept out of both the
 * private package and the sanitized aggregate evidence.
 */
export function measureGreaterRealmNaturalComposition(input: Readonly<{
  grid: IndexedAxialGrid;
  canvasRadius: number;
  elevation: Int32Array;
  tierId: Uint8Array;
  waterRegime: Uint8Array;
  biomeId: Uint8Array;
  legacyProtectedCell: Uint8Array;
  ridgeId: Int32Array;
  landformId: Uint8Array;
  slope: Uint16Array;
  seaLevel?: number;
  dryWaterRegime?: number;
  oceanWaterRegime?: number;
  seaWaterRegime?: number;
}>): GreaterRealmNaturalCompositionMetrics {
  assertGridFieldLengths(input.grid, [
    input.elevation,
    input.tierId,
    input.waterRegime,
    input.biomeId,
    input.legacyProtectedCell,
    input.ridgeId,
    input.landformId,
    input.slope,
  ]);
  const dryWaterRegime = input.dryWaterRegime ?? 0;
  const oceanWaterRegime = input.oceanWaterRegime ?? 1;
  const seaWaterRegime = input.seaWaterRegime ?? 5;
  let landMask: Uint8Array | undefined;
  let saltwaterMask: Uint8Array | undefined;
  let forestMask: Uint8Array | undefined;
  let dryMask: Uint8Array | undefined;
  let mountainMask: Uint8Array | undefined;
  try {
    const topographicLandMask = createGreaterRealmTopographicLandMask(
      input.elevation,
      input.seaLevel ?? 0,
    );
    landMask = topographicLandMask;
    saltwaterMask = Uint8Array.from(
      input.waterRegime,
      value => value === oceanWaterRegime || value === seaWaterRegime ? 1 : 0,
    );
    forestMask = createGreaterRealmForestMask({
      waterRegime: input.waterRegime,
      biomeId: input.biomeId,
      landformId: input.landformId,
      legacyProtectedCell: input.legacyProtectedCell,
      dryWaterRegime,
    });
    dryMask = Uint8Array.from(
      input.waterRegime,
      (value, cell) => (
        value === dryWaterRegime
          && input.legacyProtectedCell[cell] !== 1
          && topographicLandMask[cell] === 1
          ? 1
          : 0
      ),
    );
    mountainMask = createGreaterRealmMountainMask({
      grid: input.grid,
      waterRegime: input.waterRegime,
      ridgeId: input.ridgeId,
      biomeId: input.biomeId,
      landformId: input.landformId,
      elevation: input.elevation,
      slope: input.slope,
      dryWaterRegime,
    });
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (dryMask[cell] === 1) continue;
      forestMask[cell] = 0;
      mountainMask[cell] = 0;
    }
    return Object.freeze({
      landSilhouette: measureGreaterRealmLandSilhouette({
        grid: input.grid,
        landMask,
        canvasRadius: input.canvasRadius,
      }),
      dominantContinent: measureGreaterRealmDominantContinent({
        grid: input.grid,
        landMask,
        tierId: input.tierId,
      }),
      oceanBreathingRoom: measureGreaterRealmOceanBreathingRoom({
        grid: input.grid,
        landMask,
        saltwaterMask,
      }),
      forestPatches: measureGreaterRealmPatchComposition({
        grid: input.grid,
        eligibleMask: dryMask,
        patchMask: forestMask,
        thresholds: GREATER_REALM_FOREST_PATCH_THRESHOLDS,
      }),
      mountainSystems: measureGreaterRealmMountainSystemComposition({
        grid: input.grid,
        landMask: dryMask,
        mountainMask,
      }),
    });
  } finally {
    landMask?.fill(0);
    saltwaterMask?.fill(0);
    forestMask?.fill(0);
    dryMask?.fill(0);
    mountainMask?.fill(0);
  }
}
