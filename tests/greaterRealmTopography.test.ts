import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  clearGreaterRealmCandidateSecret,
  generateGreaterRealmCandidate,
} from '../scripts/atlas/greater-realm-candidate-generator';
import {
  GREATER_REALM_BIOME_CATALOG,
  GREATER_REALM_BIOME_CLASS_COUNT,
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_CATALOG,
  GREATER_REALM_LANDFORM_CLASS_COUNT,
  GREATER_REALM_LANDFORM_ID,
} from '../scripts/atlas/greater-realm-biomes';
import { GREATER_REALM_WATER_REGIME_ID } from '../scripts/atlas/greater-realm-hydrology-authority';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';
import { deriveGreaterRealmTopography } from '../scripts/atlas/greater-realm-topography';

// This exercises full private candidate generation plus two independent
// topography derivations while CI permits one other test worker.
const FULL_CANDIDATE_TOPOGRAPHY_TIMEOUT_MS = 180_000;

function canonicalRoot(): Uint8Array {
  return Uint8Array.from(createHash('sha256')
    .update('greater-realm-ordinary-parent-a\0', 'utf8')
    .digest());
}

const DRY_COMPATIBLE_PAIRS = new Set([
  '1:3', '1:4',
  '2:3', '2:5',
  '3:1',
  '4:3', '4:5',
  '5:1', '5:3', '5:5', '5:15',
  '6:7', '6:14',
  '7:6', '7:7', '7:14',
  '8:3', '8:4', '8:14',
  '9:3', '9:4',
  '10:3', '10:4',
  '11:9', '11:13',
  '12:6', '12:9', '12:13',
  '13:9',
  '14:7', '14:12',
  '15:3', '15:4', '15:7', '15:12',
  '16:12',
  '17:12',
  '18:11',
  '19:5', '19:6', '19:7',
  '23:0', '23:17',
]);

function independentlyCompatiblePair(regime: number, biome: number, landform: number): boolean {
  if (regime === 1 || regime === 5) return biome === 20 && landform === 16;
  if (regime === 2) return biome === 21 && landform === 10;
  if (regime === 3 || regime === 4) return biome === 22 && landform === 2;
  if (regime === GREATER_REALM_WATER_REGIME_ID.MARSH) {
    return (
      biome === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
      || biome === GREATER_REALM_BIOME_ID.SALT_MARSH
    ) && landform === GREATER_REALM_LANDFORM_ID.BASIN;
  }
  return regime === 0 && DRY_COMPATIBLE_PAIRS.has(`${biome}:${landform}`);
}

describe('Greater Realm biome and landform catalogs', () => {
  it('pins every biome ID to one unique canonical entry', () => {
    const expected = [
      [0, 'unclassified', 'Unclassified'],
      [1, 'temperate-lowland', 'Temperate lowland'],
      [2, 'flower-meadow', 'Flower meadow'],
      [3, 'oak-forest', 'Oak forest'],
      [4, 'old-growth-forest', 'Old-growth forest'],
      [5, 'pine-forest', 'Pine forest'],
      [6, 'alpine-snow', 'Alpine snow'],
      [7, 'tundra', 'Tundra'],
      [8, 'heathland', 'Heathland'],
      [9, 'savanna', 'Savanna'],
      [10, 'warm-scrub', 'Warm scrub'],
      [11, 'dune-desert', 'Dune desert'],
      [12, 'rocky-desert', 'Rocky desert'],
      [13, 'red-badlands', 'Red badlands'],
      [14, 'volcanic-upland', 'Volcanic upland'],
      [15, 'ash-meadow', 'Ash meadow'],
      [16, 'freshwater-marsh', 'Freshwater marsh'],
      [17, 'salt-marsh', 'Salt marsh'],
      [18, 'river-delta', 'River delta'],
      [19, 'rocky-highland', 'Rocky highland'],
      [20, 'saltwater', 'Saltwater'],
      [21, 'lake', 'Lake'],
      [22, 'river-stream', 'River or stream'],
      [23, 'coastal', 'Coastal'],
    ] as const;

    expect(GREATER_REALM_BIOME_CATALOG.map(({ id, key, label }) => [id, key, label]))
      .toEqual(expected);
    expect(Object.values(GREATER_REALM_BIOME_ID)).toEqual(expected.map(([id]) => id));
    expect(GREATER_REALM_BIOME_CLASS_COUNT).toBe(expected.length);
    expect(new Set(GREATER_REALM_BIOME_CATALOG.map(entry => entry.id)).size)
      .toBe(expected.length);
    expect(new Set(GREATER_REALM_BIOME_CATALOG.map(entry => entry.key)).size)
      .toBe(expected.length);
    expect(GREATER_REALM_BIOME_CATALOG.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(GREATER_REALM_BIOME_CATALOG)).toBe(true);
    expect(Object.isFrozen(GREATER_REALM_BIOME_ID)).toBe(true);
  });

  it('pins every landform ID to one unique canonical entry', () => {
    const expected = [
      [0, 'coastal-plain', 'Coastal plain'],
      [1, 'floodplain', 'Floodplain'],
      [2, 'watercourse', 'Watercourse'],
      [3, 'lowland', 'Lowland'],
      [4, 'rolling-lowland', 'Rolling lowland'],
      [5, 'hill', 'Hill'],
      [6, 'highland', 'Highland'],
      [7, 'mountain', 'Mountain'],
      [8, 'canyon', 'Canyon'],
      [9, 'badlands', 'Badlands'],
      [10, 'lake-basin', 'Lake basin'],
      [11, 'delta', 'Delta'],
      [12, 'basin', 'Basin'],
      [13, 'dune', 'Dune'],
      [14, 'alpine-plateau', 'Alpine plateau'],
      [15, 'glacial-valley', 'Glacial valley'],
      [16, 'island-shelf', 'Island shelf'],
      [17, 'sea-cliff', 'Sea cliff'],
    ] as const;

    expect(GREATER_REALM_LANDFORM_CATALOG.map(({ id, key, label }) => [id, key, label]))
      .toEqual(expected);
    expect(Object.values(GREATER_REALM_LANDFORM_ID)).toEqual(expected.map(([id]) => id));
    expect(GREATER_REALM_LANDFORM_CLASS_COUNT).toBe(expected.length);
    expect(new Set(GREATER_REALM_LANDFORM_CATALOG.map(entry => entry.id)).size)
      .toBe(expected.length);
    expect(new Set(GREATER_REALM_LANDFORM_CATALOG.map(entry => entry.key)).size)
      .toBe(expected.length);
    expect(GREATER_REALM_LANDFORM_CATALOG.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(GREATER_REALM_LANDFORM_CATALOG)).toBe(true);
    expect(Object.isFrozen(GREATER_REALM_LANDFORM_ID)).toBe(true);
  });
});

describe('Greater Realm derived topography', () => {
  it('derives deterministic bounded geomorphology from final routed authority', () => {
    const seed = canonicalRoot();
    const candidate = generateGreaterRealmCandidate({ rootSeed: seed, candidateOrdinal: 9 });
    try {
      const input = {
        grid: candidate.grid,
        elevation: candidate.elevation,
        flowReceiver: candidate.flowReceiver,
        flowAccumulation: candidate.flowAccumulation,
        waterRegime: candidate.waterRegime,
        geologyId: candidate.geologyId,
        tectonicUplift: candidate.tectonicUplift,
        rockResistance: candidate.rockResistance,
        regionId: candidate.regionId,
        tierId: candidate.tierId,
        legacyProtectedCell: candidate.legacyLowlandsProtectedCell,
        protectedBiomeId: candidate.biomeId,
        protectedLandformId: candidate.landformId,
        geomorphicTemperature: candidate.geomorphologyTemperature,
        geomorphicMoisture: candidate.geomorphologyMoisture,
        geomorphicGlacialMask: candidate.geomorphologyGlacialMask,
        geomorphicAridMask: candidate.geomorphologyAridMask,
        geomorphicVolcanicMask: candidate.geomorphologyVolcanicMask,
        geomorphicCoastalClass: candidate.geomorphologyCoastalClass,
      } as const;
      const first = deriveGreaterRealmTopography(input);
      const second = deriveGreaterRealmTopography(input);

      expect(first).toEqual(second);
      for (const field of [
        first.slope,
        first.aspect,
        first.profileCurvature,
        first.planCurvature,
        first.wetnessIndex,
        first.exposure,
        first.distanceToCoast,
        first.distanceToFreshwater,
        first.watershedId,
        first.ridgeId,
        first.temperature,
        first.moisture,
        first.biomeId,
        first.landformId,
      ]) expect(field.length).toBe(candidate.grid.cellCount);
      expect(first.topographyMetrics.elevationMinimum).toBeLessThan(0);
      expect(first.topographyMetrics.elevationMaximum).toBeGreaterThan(0);
      expect(first.topographyMetrics.slopeP95).toBeGreaterThanOrEqual(
        first.topographyMetrics.slopeP50,
      );
      expect(first.topographyMetrics.ridgeCells).toBeGreaterThan(0);
      expect(first.topographyMetrics.coastCells).toBeGreaterThan(0);
      expect(first.biomeMetrics.visualBiomeClassCount).toBeGreaterThanOrEqual(8);
      expect(first.biomeMetrics.minimumRegionVisualBiomeClassCount).toBeGreaterThanOrEqual(3);
      expect(first.biomeMetrics.minimumTierIVisualBiomeClassCount).toBeGreaterThanOrEqual(6);
      expect(first.biomeMetrics.minimumTierIIVisualBiomeClassCount).toBeGreaterThanOrEqual(5);
      expect(first.biomeMetrics.tierIIIVisualBiomeClassCount).toBeGreaterThanOrEqual(3);
      expect(first.biomeMetrics.minimumTierIMajorVisualBiomeClassCount).toBeGreaterThanOrEqual(4);
      expect(first.biomeMetrics.minimumTierITransitionVisualBiomeClassCount).toBeGreaterThanOrEqual(2);
      expect(first.biomeMetrics.minimumTierIIMajorVisualBiomeClassCount).toBeGreaterThanOrEqual(5);
      expect(first.biomeMetrics.tierIIIMajorVisualBiomeClassCount).toBeGreaterThanOrEqual(3);
      expect(first.biomeMetrics.maximumTierISingleBiomeShareBasisPoints).toBeLessThanOrEqual(5_500);
      expect(first.biomeMetrics.incompatibleVisualBiomeAdjacencyCount).toBe(0);
      expect(first.biomeMetrics.incompatibleBiomeLandformPairCount).toBe(0);
      expect([...first.aspect].every(value => value <= 6)).toBe(true);
      expect([...first.watershedId].every(value => value > 0)).toBe(true);
      for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
        expect(independentlyCompatiblePair(
          candidate.waterRegime[cell]!,
          first.biomeId[cell]!,
          first.landformId[cell]!,
        )).toBe(true);
        if (candidate.legacyLowlandsProtectedCell[cell] !== 1) continue;
        expect(first.biomeId[cell]).toBe(candidate.biomeId[cell]);
        expect(first.landformId[cell]).toBe(candidate.landformId[cell]);
      }
    } finally {
      seed.fill(0);
      clearGreaterRealmCandidateSecret(candidate);
    }
  }, FULL_CANDIDATE_TOPOGRAPHY_TIMEOUT_MS);

  it('smooths compatible pairs without crossing physical climate or protected process authority', () => {
    const coordinates: Array<{ q: number; r: number }> = [];
    // Use a production-representative connected patch large enough to survive
    // the generated-forest deconfetti pass; this test remains focused on the
    // earlier compatible-pair smoothing behavior.
    for (let q = -8; q <= 8; q += 1) {
      for (let r = Math.max(-8, -q - 8); r <= Math.min(8, -q + 8); r += 1) {
        coordinates.push({ q, r });
      }
    }
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const center = grid.indexOf({ q: 0, r: 0 });
    const protectedCell = grid.indexOf({ q: -1, r: 0 });
    const glacialCell = grid.indexOf({ q: 1, r: 0 });
    const aridCell = grid.indexOf({ q: 0, r: 2 });
    const volcanicCell = grid.indexOf({ q: 0, r: -2 });
    const coastalCell = grid.indexOf({ q: 2, r: -2 });
    const oceanCell = grid.indexOf({ q: 8, r: 0 });
    const seaCell = grid.indexOf({ q: 8, r: -1 });
    const lakeCell = grid.indexOf({ q: -8, r: 0 });
    const saltMarshCell = grid.indexOf({ q: 7, r: 0 });
    const freshwaterMarshCell = grid.indexOf({ q: -7, r: 0 });
    const waterRegime = new Uint8Array(grid.cellCount);
    waterRegime[oceanCell] = 1;
    waterRegime[seaCell] = 5;
    waterRegime[lakeCell] = 2;
    waterRegime[saltMarshCell] = GREATER_REALM_WATER_REGIME_ID.MARSH;
    waterRegime[freshwaterMarshCell] = GREATER_REALM_WATER_REGIME_ID.MARSH;
    const legacyProtectedCell = new Uint8Array(grid.cellCount);
    legacyProtectedCell[protectedCell] = 1;
    const protectedBiomeId = new Uint8Array(grid.cellCount);
    const protectedLandformId = new Uint8Array(grid.cellCount);
    protectedBiomeId[protectedCell] = 4;
    protectedLandformId[protectedCell] = 3;
    const geomorphicGlacialMask = new Uint8Array(grid.cellCount);
    geomorphicGlacialMask[glacialCell] = 1;
    const geomorphicAridMask = new Uint8Array(grid.cellCount);
    geomorphicAridMask[aridCell] = 1;
    const geomorphicVolcanicMask = new Uint8Array(grid.cellCount);
    geomorphicVolcanicMask[volcanicCell] = 1;
    const geomorphicCoastalClass = new Uint8Array(grid.cellCount);
    geomorphicCoastalClass[coastalCell] = 2;
    const geomorphicMoisture = new Int32Array(grid.cellCount);
    geomorphicMoisture.fill(3_000);
    geomorphicMoisture[center] = 500;
    const elevation = new Int32Array(grid.cellCount).fill(1_000);
    const geomorphicTemperature = new Int32Array(grid.cellCount).fill(4_000);

    const derive = (waterRegimeIsAuthoritative = false) => deriveGreaterRealmTopography({
      grid,
      elevation,
      flowReceiver: new Int32Array(grid.cellCount).fill(-1),
      flowAccumulation: new BigUint64Array(grid.cellCount).fill(1n),
      waterRegime,
      geologyId: new Uint8Array(grid.cellCount),
      tectonicUplift: new Int32Array(grid.cellCount),
      rockResistance: new Int32Array(grid.cellCount),
      regionId: new Uint8Array(grid.cellCount),
      tierId: new Uint8Array(grid.cellCount).fill(1),
      legacyProtectedCell,
      protectedBiomeId,
      protectedLandformId,
      geomorphicTemperature,
      geomorphicMoisture,
      geomorphicGlacialMask,
      geomorphicAridMask,
      geomorphicVolcanicMask,
      geomorphicCoastalClass,
      waterRegimeIsAuthoritative,
    });

    // Four ordinary forest neighbors outvote the center's initial grassland
    // class. The matching forest landform must move with the biome.
    const smoothedResult = derive();
    expect(smoothedResult.biomeId[center]).toBe(GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST);
    expect(smoothedResult.landformId[center]).toBe(GREATER_REALM_LANDFORM_ID.LOWLAND);

    // The same target is initially a dune at the canonical physical aridity
    // threshold. Its four forest neighbors must not overwrite that authority.
    geomorphicMoisture[center] = -3_000;
    const result = derive();
    expect(result.moisture[center]).toBeLessThan(-1_200);
    expect(result.biomeId[center]).toBe(GREATER_REALM_BIOME_ID.DUNE_DESERT);
    expect(result.landformId[center]).toBe(GREATER_REALM_LANDFORM_ID.DUNE);
    expect(result.biomeId[center]).not.toBe(GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST);
    expect(result.biomeId[protectedCell]).toBe(GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST);
    expect(result.landformId[protectedCell]).toBe(GREATER_REALM_LANDFORM_ID.LOWLAND);
    expect(result.biomeId[glacialCell]).toBe(GREATER_REALM_BIOME_ID.PINE_FOREST);
    expect(result.landformId[glacialCell]).toBe(GREATER_REALM_LANDFORM_ID.GLACIAL_VALLEY);
    expect(result.biomeId[aridCell]).toBe(GREATER_REALM_BIOME_ID.DUNE_DESERT);
    expect(result.landformId[aridCell]).toBe(GREATER_REALM_LANDFORM_ID.DUNE);
    expect(result.biomeId[volcanicCell]).toBe(GREATER_REALM_BIOME_ID.VOLCANIC_UPLAND);
    expect(result.landformId[volcanicCell]).toBe(GREATER_REALM_LANDFORM_ID.BASIN);
    expect(result.biomeId[coastalCell]).toBe(GREATER_REALM_BIOME_ID.COASTAL);
    expect(result.landformId[coastalCell]).toBe(GREATER_REALM_LANDFORM_ID.SEA_CLIFF);
    expect(result.biomeId[seaCell]).toBe(GREATER_REALM_BIOME_ID.SALTWATER);
    expect(result.landformId[seaCell]).toBe(GREATER_REALM_LANDFORM_ID.ISLAND_SHELF);
    expect(result.biomeId[saltMarshCell]).toBe(GREATER_REALM_BIOME_ID.SALT_MARSH);
    expect(result.landformId[saltMarshCell]).toBe(GREATER_REALM_LANDFORM_ID.BASIN);
    expect(result.biomeId[freshwaterMarshCell])
      .toBe(GREATER_REALM_BIOME_ID.FRESHWATER_MARSH);
    expect(result.landformId[freshwaterMarshCell])
      .toBe(GREATER_REALM_LANDFORM_ID.BASIN);
    expect(result.biomeMetrics.incompatibleBiomeLandformPairCount).toBe(0);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      expect(independentlyCompatiblePair(
        waterRegime[cell]!,
        result.biomeId[cell]!,
        result.landformId[cell]!,
      )).toBe(true);
    }

    // The reciprocal boundary is equally important: a moist target cannot
    // inherit an arid visual pair merely because four process neighbors agree.
    geomorphicMoisture.fill(3_000);
    geomorphicAridMask.fill(0);
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = grid.neighbors[center * 6 + direction]!;
      if (neighbor !== protectedCell && neighbor !== glacialCell) {
        geomorphicAridMask[neighbor] = 1;
      }
    }
    const moistResult = derive();
    expect(moistResult.moisture[center]).toBeGreaterThan(-1_200);
    expect([
      GREATER_REALM_BIOME_ID.DUNE_DESERT,
      GREATER_REALM_BIOME_ID.ROCKY_DESERT,
      GREATER_REALM_BIOME_ID.RED_BADLANDS,
    ]).not.toContain(moistResult.biomeId[center]);

    // Tundra uses the wider canonical cold boundary even though only the
    // sub-500 frozen extreme locks a target outright. A warm center therefore
    // cannot inherit four neighboring tundra/mountain pairs.
    geomorphicAridMask.fill(0);
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = grid.neighbors[center * 6 + direction]!;
      if (neighbor !== protectedCell && neighbor !== glacialCell) {
        elevation[neighbor] = 14_000;
        geomorphicTemperature[neighbor] = 1_000;
      }
    }
    const warmResult = derive();
    expect(warmResult.temperature[center]).toBe(4_000);
    expect([
      GREATER_REALM_BIOME_ID.TUNDRA,
      GREATER_REALM_BIOME_ID.ALPINE_SNOW,
    ]).not.toContain(warmResult.biomeId[center]);

    // The preliminary pass may nominate saturated dry land as marsh for the
    // hydrology authority to accept or reject. Once hydrology is final, the
    // same dry cells must receive a genuinely dry visual classification.
    elevation.fill(1_000);
    geomorphicTemperature.fill(4_000);
    geomorphicMoisture.fill(6_000);
    geomorphicGlacialMask.fill(0);
    geomorphicAridMask.fill(0);
    geomorphicVolcanicMask.fill(0);
    geomorphicCoastalClass.fill(0);
    const provisionalMarsh = derive();
    const authoritative = derive(true);
    const dryMarshCount = (biomeId: Uint8Array) => Array.from(
      biomeId,
      (biome, cell) => waterRegime[cell] === 0 && (
        biome === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
        || biome === GREATER_REALM_BIOME_ID.SALT_MARSH
      ) ? 1 : 0,
    ).reduce<number>((total, value) => total + value, 0);
    expect(dryMarshCount(provisionalMarsh.biomeId)).toBeGreaterThan(0);
    expect(dryMarshCount(authoritative.biomeId)).toBe(0);
  });
});
