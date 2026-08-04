import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_COMPOSITION_PROOF_KEYS,
  GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS,
  GREATER_REALM_FOREST_PATCH_THRESHOLDS,
  GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS,
  GREATER_REALM_MOUNTAIN_PATCH_THRESHOLDS,
  GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS,
  createGreaterRealmForestMask,
  createGreaterRealmMountainMask,
  createGreaterRealmTopographicLandMask,
  isGreaterRealmDeepOceanBreathingRoom,
  isGreaterRealmDominantContinentComposition,
  isGreaterRealmNaturalLandSilhouette,
  isGreaterRealmPatchComposition,
  measureGreaterRealmDominantContinent,
  measureGreaterRealmLandSilhouette,
  measureGreaterRealmMountainSystemComposition,
  measureGreaterRealmNaturalComposition,
  measureGreaterRealmOceanBreathingRoom,
  measureGreaterRealmPatchComposition,
} from '../scripts/atlas/greater-realm-composition';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
  type IndexedAxialGrid,
} from '../scripts/atlas/greater-realm-terrain';

function axialDistance(q: number, r: number, otherQ = 0, otherR = 0): number {
  const deltaQ = q - otherQ;
  const deltaR = r - otherR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(-deltaQ - deltaR));
}

function axialDisc(radius: number): readonly AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  return coordinates;
}

function maskFrom(
  grid: IndexedAxialGrid,
  predicate: (q: number, r: number) => boolean,
): Uint8Array {
  return Uint8Array.from(
    { length: grid.cellCount },
    (_, cell) => predicate(grid.q[cell]!, grid.r[cell]!) ? 1 : 0,
  );
}

function rotateAxial(coordinate: AxialCoordinate): AxialCoordinate {
  return Object.freeze({ q: -coordinate.r, r: coordinate.q + coordinate.r });
}

function transformMask(
  grid: IndexedAxialGrid,
  mask: Uint8Array,
  transform: (coordinate: AxialCoordinate) => AxialCoordinate,
): Uint8Array {
  const transformed = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (mask[cell] !== 1) continue;
    const target = grid.indexOf(transform({ q: grid.q[cell]!, r: grid.r[cell]! }));
    if (target >= 0) transformed[target] = 1;
  }
  return transformed;
}

function irregularContinent(grid: IndexedAxialGrid): Uint8Array {
  const cuts = Object.freeze([
    Object.freeze([-27, 5] as const),
    Object.freeze([-23, 16] as const),
    Object.freeze([-10, 25] as const),
    Object.freeze([5, 15] as const),
    Object.freeze([21, -4] as const),
    Object.freeze([8, -20] as const),
  ]);
  return maskFrom(grid, (q, r) => {
    let land = axialDistance(q, r, -8, 2) <= 22
      || axialDistance(q, r, 15, -8) <= 14
      || axialDistance(q, r, -4, 20) <= 12;
    if (axialDistance(q, r, 22, 4) <= 8) land = false;
    for (const [cutQ, cutR] of cuts) {
      if (axialDistance(q, r, cutQ, cutR) <= 2) land = false;
    }
    if (q >= 19 && q <= 34 && r >= -15 && r <= -12) land = true;
    return land;
  });
}

function productionScaleIrregularContinent(grid: IndexedAxialGrid): Uint8Array {
  const cuts = Object.freeze([
    Object.freeze([-108, 20] as const),
    Object.freeze([-92, 64] as const),
    Object.freeze([-40, 100] as const),
    Object.freeze([20, 60] as const),
    Object.freeze([84, -16] as const),
    Object.freeze([32, -80] as const),
  ]);
  return maskFrom(grid, (q, r) => {
    let land = axialDistance(q, r, -32, 8) <= 88
      || axialDistance(q, r, 60, -32) <= 56
      || axialDistance(q, r, -16, 80) <= 48;
    if (axialDistance(q, r, 88, 16) <= 32) land = false;
    for (const [cutQ, cutR] of cuts) {
      if (axialDistance(q, r, cutQ, cutR) <= 8) land = false;
    }
    if (q >= 76 && q <= 136 && r >= -60 && r <= -48) land = true;
    return land;
  });
}

describe('Greater Realm pure composition metrics', () => {
  it('reserves the exact aggregate proof names for later generator integration', () => {
    expect(GREATER_REALM_COMPOSITION_PROOF_KEYS).toEqual([
      'naturalLandSilhouette',
      'dominantContinentComposition',
      'deepOceanBreathingRoom',
      'forestPatchComposition',
      'mountainSystemComposition',
    ]);
  });

  it('derives the continental footprint from elevation rather than surface-water overlays', () => {
    expect(createGreaterRealmTopographicLandMask(Int32Array.from([
      -1, 0, 1, 20, -20,
    ]))).toEqual(Uint8Array.from([0, 0, 1, 1, 0]));
    expect(createGreaterRealmTopographicLandMask(Int32Array.from([
      4, 5, 6,
    ]), 5)).toEqual(Uint8Array.from([0, 0, 1]));
  });

  it('rejects geometric and noisy coasts while accepting an irregular multiscale silhouette', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(50));
    const regularHex = maskFrom(grid, (q, r) => axialDistance(q, r) <= 25);
    const smoothEllipse = maskFrom(grid, (q, r) => {
      const x = q * 2 + r;
      const y = r * 3;
      return x * x * 60 * 60 + y * y * 30 * 30 <= 30 * 30 * 60 * 60;
    });
    const noisy = maskFrom(grid, (q, r) => {
      const distance = axialDistance(q, r);
      const hash = ((q * 17 + r * 31) % 3 + 3) % 3;
      return distance <= 25 && !(distance >= 22 && hash === 0);
    });
    const natural = irregularContinent(grid);

    const hexMetrics = measureGreaterRealmLandSilhouette({
      grid,
      landMask: regularHex,
      canvasRadius: 50,
    });
    const ellipseMetrics = measureGreaterRealmLandSilhouette({
      grid,
      landMask: smoothEllipse,
      canvasRadius: 50,
    });
    const noisyMetrics = measureGreaterRealmLandSilhouette({
      grid,
      landMask: noisy,
      canvasRadius: 50,
    });
    const naturalMetrics = measureGreaterRealmLandSilhouette({
      grid,
      landMask: natural,
      canvasRadius: 50,
    });

    expect(hexMetrics.proof).toBe(false);
    expect(hexMetrics.dominantLandSolidityBasisPoints).toBe(10_000);
    expect(ellipseMetrics.proof).toBe(false);
    expect(ellipseMetrics.dominantLandSolidityBasisPoints).toBe(10_000);
    expect(noisyMetrics.proof).toBe(false);
    expect(noisyMetrics.coastDetailGainBasisPoints)
      .toBeGreaterThan(GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS
        .maximumCoastDetailGainBasisPoints);
    expect(naturalMetrics.proof).toBe(true);
    expect(naturalMetrics.dominantLandSolidityBasisPoints).toBeGreaterThanOrEqual(
      GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.minimumDominantLandSolidityBasisPoints,
    );
    expect(naturalMetrics.dominantLandSolidityBasisPoints).toBeLessThanOrEqual(
      GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.maximumDominantLandSolidityBasisPoints,
    );
  });

  it('keeps the silhouette verdict stable under axial rotation and bounded translation', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(50));
    const natural = irregularContinent(grid);
    const rotated = transformMask(grid, natural, rotateAxial);
    const translated = transformMask(grid, natural, coordinate => Object.freeze({
      q: coordinate.q + 2,
      r: coordinate.r - 1,
    }));
    const verdicts = [natural, rotated, translated].map(landMask => (
      measureGreaterRealmLandSilhouette({
        grid,
        landMask,
        canvasRadius: 50,
      }).proof
    ));
    expect(verdicts).toEqual([true, true, true]);
  });

  it('calibrates the silhouette proof on a 100k-plus production-scale grid', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(210));
    expect(grid.cellCount).toBeGreaterThanOrEqual(100_000);
    expect(grid.cellCount).toBeLessThanOrEqual(150_000);
    const regularHex = maskFrom(grid, (q, r) => axialDistance(q, r) <= 100);
    const natural = productionScaleIrregularContinent(grid);
    const regularMetrics = measureGreaterRealmLandSilhouette({
      grid,
      landMask: regularHex,
      canvasRadius: 270,
    });
    const naturalMetrics = measureGreaterRealmLandSilhouette({
      grid,
      landMask: natural,
      canvasRadius: 270,
    });
    expect(regularMetrics.proof).toBe(false);
    expect(naturalMetrics.proof).toBe(true);
  });

  it('requires one materially dominant continent carrying Tier II and Tier III land', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(45));
    const dominant = (q: number, r: number) => axialDistance(q, r, -18, 2) <= 12;
    const secondary = (q: number, r: number) => axialDistance(q, r, 18, -4) <= 7;
    const island = (q: number, r: number) => axialDistance(q, r, 2, 30) <= 3;
    const landMask = maskFrom(grid, (q, r) => dominant(q, r) || secondary(q, r) || island(q, r));
    const tierId = new Uint8Array(grid.cellCount);
    tierId.fill(1);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (!dominant(grid.q[cell]!, grid.r[cell]!)) continue;
      tierId[cell] = grid.q[cell]! % 2 === 0 ? 2 : 3;
    }
    const valid = measureGreaterRealmDominantContinent({ grid, landMask, tierId });
    expect(valid.proof).toBe(true);
    expect(valid.componentSizesDescending).toEqual([469, 169, 37]);

    const peerLandmasses = maskFrom(grid, (q, r) => (
      axialDistance(q, r, -16, 2) <= 10
      || axialDistance(q, r, 16, -2) <= 9
      || island(q, r)
    ));
    const peerTierId = new Uint8Array(grid.cellCount);
    peerTierId.fill(2);
    expect(measureGreaterRealmDominantContinent({
      grid,
      landMask: peerLandmasses,
      tierId: peerTierId,
    }).proof).toBe(false);

    const offshoreTiers = new Uint8Array(tierId);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (secondary(grid.q[cell]!, grid.r[cell]!)) offshoreTiers[cell] = 3;
      else if (dominant(grid.q[cell]!, grid.r[cell]!)) offshoreTiers[cell] = 1;
    }
    expect(measureGreaterRealmDominantContinent({
      grid,
      landMask,
      tierId: offshoreTiers,
    }).proof).toBe(false);
  });

  it('proves global and directional deep-ocean breathing room', () => {
    const broadGrid = indexGreaterRealmAxialGrid(axialDisc(40));
    const broadLand = maskFrom(broadGrid, (q, r) => axialDistance(q, r) <= 15);
    const broadSaltwater = Uint8Array.from(broadLand, value => value === 1 ? 0 : 1);
    const broad = measureGreaterRealmOceanBreathingRoom({
      grid: broadGrid,
      landMask: broadLand,
      saltwaterMask: broadSaltwater,
    });
    expect(broad.proof).toBe(true);
    expect(broad.minimumBoundaryLandDistance).toBe(25);
    expect(new Set(broad.sectorMedianLandDistances)).toEqual(new Set([25]));

    const crampedCoordinates = axialDisc(40).filter(({ q, r }) => {
      const eastWedge = q > 0 && Math.abs(r * 2 + q) * 2 <= q;
      return !eastWedge || axialDistance(q, r) <= 30;
    });
    const crampedGrid = indexGreaterRealmAxialGrid(crampedCoordinates);
    const crampedLand = maskFrom(crampedGrid, (q, r) => axialDistance(q, r) <= 15);
    const crampedSaltwater = Uint8Array.from(crampedLand, value => value === 1 ? 0 : 1);
    const cramped = measureGreaterRealmOceanBreathingRoom({
      grid: crampedGrid,
      landMask: crampedLand,
      saltwaterMask: crampedSaltwater,
    });
    expect(cramped.boundaryLandDistanceP50).toBe(25);
    expect(Math.min(...cramped.sectorMedianLandDistances)).toBe(15);
    expect(cramped.proof).toBe(false);
  });

  it('distinguishes clustered forests from equal-area speckles and blanket cover', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(50));
    const eligibleMask = new Uint8Array(grid.cellCount);
    eligibleMask.fill(1);
    const clustered = maskFrom(grid, (q, r) => (
      axialDistance(q, r, -25, 5) <= 9
      || axialDistance(q, r, 20, -20) <= 9
      || axialDistance(q, r, 10, 20) <= 9
    ));
    const clusteredMetrics = measureGreaterRealmPatchComposition({
      grid,
      eligibleMask,
      patchMask: clustered,
      thresholds: GREATER_REALM_FOREST_PATCH_THRESHOLDS,
    });
    expect(clusteredMetrics.proof).toBe(true);
    expect(clusteredMetrics.componentSizesDescending).toEqual([271, 271, 271]);

    const scattered = new Uint8Array(grid.cellCount);
    let remaining = clusteredMetrics.patchCellCount;
    for (let cell = 0; cell < grid.cellCount && remaining > 0; cell += 1) {
      const residue = ((grid.q[cell]! - grid.r[cell]!) % 3 + 3) % 3;
      if (residue !== 0) continue;
      scattered[cell] = 1;
      remaining -= 1;
    }
    const scatteredMetrics = measureGreaterRealmPatchComposition({
      grid,
      eligibleMask,
      patchMask: scattered,
      thresholds: GREATER_REALM_FOREST_PATCH_THRESHOLDS,
    });
    expect(scatteredMetrics.patchCellCount).toBe(clusteredMetrics.patchCellCount);
    expect(scatteredMetrics.proof).toBe(false);
    expect(scatteredMetrics.tinyShareBasisPoints).toBe(10_000);

    expect(measureGreaterRealmPatchComposition({
      grid,
      eligibleMask,
      patchMask: eligibleMask,
      thresholds: GREATER_REALM_FOREST_PATCH_THRESHOLDS,
    }).proof).toBe(false);
  });

  it('treats only reviewed forest-family biomes as forest', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(2));
    const waterRegime = new Uint8Array(grid.cellCount);
    const biomeId = new Uint8Array(grid.cellCount);
    const landformId = new Uint8Array(grid.cellCount);
    const protectedCell = new Uint8Array(grid.cellCount);
    const forestBiomes = [2, 5, 3, 4, 4];
    for (let cell = 0; cell < forestBiomes.length; cell += 1) {
      biomeId[cell] = forestBiomes[cell]!;
    }
    protectedCell[3] = 1;
    waterRegime[2] = 1;
    landformId[1] = 15;
    const forest = createGreaterRealmForestMask({
      waterRegime,
      biomeId,
      landformId,
      legacyProtectedCell: protectedCell,
    });
    expect(forest.slice(0, 5)).toEqual(Uint8Array.from([1, 0, 0, 0, 0]));
  });

  it('requires clustered, off-centre mountain belts rather than a centered ring', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(50));
    const landMask = new Uint8Array(grid.cellCount);
    landMask.fill(1);
    const belts = maskFrom(grid, (q, r) => (
      (q >= -36 && q <= -10 && r >= -12 && r <= -6)
      || (q >= 9 && q <= 35 && r >= -25 && r <= -19)
      || (q >= 3 && q <= 29 && r >= 16 && r <= 22)
    ));
    const beltMetrics = measureGreaterRealmMountainSystemComposition({
      grid,
      landMask,
      mountainMask: belts,
    });
    expect(beltMetrics.proof).toBe(true);
    expect(beltMetrics.offCentreBeltCount).toBe(3);

    const centeredRing = maskFrom(grid, (q, r) => {
      const distance = axialDistance(q, r);
      return distance >= 15 && distance <= 17;
    });
    const ringMetrics = measureGreaterRealmMountainSystemComposition({
      grid,
      landMask,
      mountainMask: centeredRing,
    });
    expect(ringMetrics.proof).toBe(false);
    expect(ringMetrics.offCentreBeltCount).toBe(0);
  });

  it('builds mountain mass from ridge and visual authority plus bounded shoulders', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(2));
    const waterRegime = new Uint8Array(grid.cellCount);
    const ridgeId = new Int32Array(grid.cellCount);
    const biomeId = new Uint8Array(grid.cellCount);
    const landformId = new Uint8Array(grid.cellCount);
    const elevation = new Int32Array(grid.cellCount);
    const slope = new Uint16Array(grid.cellCount);
    const core = grid.indexOf({ q: 0, r: 0 });
    const shoulder = grid.indexOf({ q: 1, r: 0 });
    const lowShoulder = grid.indexOf({ q: 0, r: 1 });
    const isolatedHighland = grid.indexOf({ q: -2, r: 0 });
    ridgeId[core] = 1;
    biomeId[isolatedHighland] = 19;
    landformId[isolatedHighland] = 5;
    for (const cell of [shoulder, lowShoulder, isolatedHighland]) {
      elevation[cell] = 6_000;
      slope[cell] = 700;
    }
    slope[lowShoulder] = 599;
    const mountain = createGreaterRealmMountainMask({
      grid,
      waterRegime,
      ridgeId,
      biomeId,
      landformId,
      elevation,
      slope,
    });
    expect(mountain[core]).toBe(1);
    expect(mountain[shoulder]).toBe(1);
    expect(mountain[lowShoulder]).toBe(0);
    expect(mountain[isolatedHighland]).toBe(0);
  });

  it('uses inclusive frozen thresholds and fails one unit beyond each boundary', () => {
    const silhouette = {
      coastHalfEdgeCount: 100,
      maximumAlignedCoastRunCells: 1,
      maximumAlignedCoastRunShareBasisPoints:
        GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.maximumAlignedCoastRunShareBasisPoints,
      dominantLandConvexHullCapacity: 100,
      dominantLandSolidityBasisPoints:
        GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.maximumDominantLandSolidityBasisPoints,
      raster64: {
        resolution: 64 as const,
        landPixels: 10,
        perimeterEdges: 10,
        rotationalIouBasisPoints:
          GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.maximumRotationalIou64BasisPoints,
      },
      raster256: {
        resolution: 256 as const,
        landPixels: 40,
        perimeterEdges: 41,
        rotationalIouBasisPoints:
          GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.maximumRotationalIou256BasisPoints,
      },
      coastDetailGainBasisPoints:
        GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.minimumCoastDetailGainBasisPoints,
    };
    expect(isGreaterRealmNaturalLandSilhouette(silhouette)).toBe(true);
    expect(isGreaterRealmNaturalLandSilhouette({
      ...silhouette,
      maximumAlignedCoastRunShareBasisPoints:
        GREATER_REALM_LAND_SILHOUETTE_THRESHOLDS.maximumAlignedCoastRunShareBasisPoints + 1,
    })).toBe(false);

    const dominant = {
      landCellCount: 100,
      landmassCount: 2,
      dominantLandmassCells: 55,
      secondLandmassCells: 39,
      dominantLandShareBasisPoints:
        GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS.minimumDominantLandShareBasisPoints,
      dominantToSecondRatioBasisPoints:
        GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS.minimumDominantToSecondRatioBasisPoints,
      tierTwoOnDominantBasisPoints:
        GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS.minimumTierTwoOnDominantBasisPoints,
      tierThreeOnDominantBasisPoints:
        GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS.minimumTierThreeOnDominantBasisPoints,
    };
    expect(isGreaterRealmDominantContinentComposition(dominant)).toBe(true);
    expect(isGreaterRealmDominantContinentComposition({
      ...dominant,
      tierThreeOnDominantBasisPoints:
        GREATER_REALM_DOMINANT_CONTINENT_THRESHOLDS.minimumTierThreeOnDominantBasisPoints - 1,
    })).toBe(false);

    const ocean = {
      boundaryCellCount: 12,
      saltwaterBoundaryBasisPoints: 10_000,
      minimumBoundaryLandDistance:
        GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS.minimumBoundaryLandDistance,
      boundaryLandDistanceP05:
        GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS.minimumBoundaryLandDistanceP05,
      boundaryLandDistanceP50:
        GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS.minimumBoundaryLandDistanceP50,
      boundaryLandDistanceP95: 24,
      boundaryAtTargetShareBasisPoints:
        GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS
          .minimumBoundaryAtTargetShareBasisPoints,
      sectorBoundaryCellCounts: Object.freeze(Array<number>(12).fill(1)),
      sectorMedianLandDistances: Object.freeze(Array<number>(12).fill(
        GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS.minimumSectorMedianLandDistance,
      )),
    };
    expect(isGreaterRealmDeepOceanBreathingRoom(ocean)).toBe(true);
    expect(isGreaterRealmDeepOceanBreathingRoom({
      ...ocean,
      sectorMedianLandDistances: Object.freeze([
        ...ocean.sectorMedianLandDistances.slice(0, 11),
        GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS.minimumSectorMedianLandDistance - 1,
      ]),
    })).toBe(false);

    const forestPatch = {
      eligibleCellCount: 1_000,
      patchCellCount: 100,
      patchShareBasisPoints: GREATER_REALM_FOREST_PATCH_THRESHOLDS.minimumShareBasisPoints,
      componentCount: 3,
      broadComponentCount: GREATER_REALM_FOREST_PATCH_THRESHOLDS.minimumBroadComponentCount,
      clusteredShareBasisPoints:
        GREATER_REALM_FOREST_PATCH_THRESHOLDS.minimumClusteredShareBasisPoints,
      tinyShareBasisPoints: GREATER_REALM_FOREST_PATCH_THRESHOLDS.maximumTinyShareBasisPoints,
      largestComponentShareBasisPoints:
        GREATER_REALM_FOREST_PATCH_THRESHOLDS.maximumLargestComponentShareBasisPoints,
      componentSizeP50: 64,
      componentSizeP90: 256,
    };
    expect(isGreaterRealmPatchComposition(
      forestPatch,
      GREATER_REALM_FOREST_PATCH_THRESHOLDS,
    )).toBe(true);
    expect(isGreaterRealmPatchComposition({
      ...forestPatch,
      largestComponentShareBasisPoints:
        GREATER_REALM_FOREST_PATCH_THRESHOLDS.maximumLargestComponentShareBasisPoints + 1,
    }, GREATER_REALM_FOREST_PATCH_THRESHOLDS)).toBe(false);

    expect(GREATER_REALM_MOUNTAIN_PATCH_THRESHOLDS.minimumBroadComponentCount).toBe(2);
  });

  it('fails closed on disconnected ocean distance and malformed threshold overrides', () => {
    const disconnected = indexGreaterRealmAxialGrid(Object.freeze([
      Object.freeze({ q: 0, r: 0 }),
      Object.freeze({ q: 3, r: 0 }),
    ]));
    expect(() => measureGreaterRealmOceanBreathingRoom({
      grid: disconnected,
      landMask: Uint8Array.from([1, 0]),
      saltwaterMask: Uint8Array.from([0, 1]),
    })).toThrow('GREATER_REALM_COMPOSITION_GRID_DISCONNECTED');

    const grid = indexGreaterRealmAxialGrid(axialDisc(4));
    const landMask = maskFrom(grid, (q, r) => axialDistance(q, r) <= 1);
    const saltwaterMask = Uint8Array.from(landMask, value => value === 1 ? 0 : 1);
    expect(() => measureGreaterRealmOceanBreathingRoom({
      grid,
      landMask,
      saltwaterMask,
      thresholds: {
        ...GREATER_REALM_OCEAN_BREATHING_ROOM_THRESHOLDS,
        sectorCount: 11,
      },
    })).toThrow('GREATER_REALM_COMPOSITION_SECTOR_COUNT_INVALID');
    expect(() => isGreaterRealmPatchComposition({
      eligibleCellCount: 10,
      patchCellCount: 1,
      patchShareBasisPoints: 1_000,
      componentCount: 1,
      broadComponentCount: 1,
      clusteredShareBasisPoints: 10_000,
      tinyShareBasisPoints: 0,
      largestComponentShareBasisPoints: 10_000,
      componentSizeP50: 1,
      componentSizeP90: 1,
    }, {
      ...GREATER_REALM_FOREST_PATCH_THRESHOLDS,
      maximumShareBasisPoints: 10_001,
    })).toThrow('GREATER_REALM_COMPOSITION_THRESHOLD_INVALID');
  });

  it('excludes dry below-sea visual authority instead of aborting composition', () => {
    const grid = indexGreaterRealmAxialGrid(axialDisc(3));
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(1);
    const belowSea = grid.indexOf({ q: 0, r: 0 });
    elevation[belowSea] = -1;
    const tierId = new Uint8Array(grid.cellCount);
    tierId.fill(2);
    const waterRegime = new Uint8Array(grid.cellCount);
    const biomeId = new Uint8Array(grid.cellCount);
    biomeId.fill(1);
    biomeId[belowSea] = 19;
    const landformId = new Uint8Array(grid.cellCount);
    landformId.fill(3);
    landformId[belowSea] = 6;
    const ridgeId = new Int32Array(grid.cellCount);
    ridgeId[belowSea] = 1;
    const metrics = measureGreaterRealmNaturalComposition({
      grid,
      canvasRadius: 3,
      elevation,
      tierId,
      waterRegime,
      biomeId,
      legacyProtectedCell: new Uint8Array(grid.cellCount),
      ridgeId,
      landformId,
      slope: new Uint16Array(grid.cellCount),
    });
    expect(metrics.mountainSystems.patchCellCount).toBe(0);
    expect(metrics.mountainSystems.proof).toBe(false);
  });
});
