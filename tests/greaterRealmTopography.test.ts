import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  clearGreaterRealmCandidateSecret,
  generateGreaterRealmCandidate,
} from '../scripts/atlas/greater-realm-candidate-generator';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';
import { deriveGreaterRealmTopography } from '../scripts/atlas/greater-realm-topography';

function root(index: number): Uint8Array {
  return Uint8Array.from(createHash('sha256')
    .update('greater-realm-test-root\0', 'utf8')
    .update(String(index), 'utf8')
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
  return regime === 0 && DRY_COMPATIBLE_PAIRS.has(`${biome}:${landform}`);
}

describe('Greater Realm derived topography', () => {
  it('derives deterministic bounded geomorphology from final routed authority', () => {
    const seed = root(52);
    const candidate = generateGreaterRealmCandidate({ rootSeed: seed, candidateOrdinal: 3 });
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
  }, 30_000);

  it('smooths visual classification as a compatible pair without moving protected process cells', () => {
    const coordinates: Array<{ q: number; r: number }> = [];
    for (let q = -2; q <= 2; q += 1) {
      for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r += 1) {
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
    const oceanCell = grid.indexOf({ q: 2, r: 0 });
    const seaCell = grid.indexOf({ q: 2, r: -1 });
    const lakeCell = grid.indexOf({ q: -2, r: 0 });
    const waterRegime = new Uint8Array(grid.cellCount);
    waterRegime[oceanCell] = 1;
    waterRegime[seaCell] = 5;
    waterRegime[lakeCell] = 2;
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
    geomorphicMoisture.fill(1_500);
    geomorphicMoisture[center] = -3_000;

    const result = deriveGreaterRealmTopography({
      grid,
      elevation: new Int32Array(grid.cellCount).fill(1_000),
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
      geomorphicTemperature: new Int32Array(grid.cellCount).fill(4_000),
      geomorphicMoisture,
      geomorphicGlacialMask,
      geomorphicAridMask,
      geomorphicVolcanicMask,
      geomorphicCoastalClass,
    });

    // Four ordinary forest neighbors outvote the center's initial grassland
    // class. The matching forest landform must move with the biome.
    expect(result.biomeId[center]).toBe(2);
    expect(result.landformId[center]).toBe(5);
    expect(result.biomeId[protectedCell]).toBe(4);
    expect(result.landformId[protectedCell]).toBe(3);
    expect(result.biomeId[glacialCell]).toBe(5);
    expect(result.landformId[glacialCell]).toBe(15);
    expect(result.biomeId[aridCell]).toBe(11);
    expect(result.landformId[aridCell]).toBe(13);
    expect(result.biomeId[volcanicCell]).toBe(14);
    expect(result.landformId[volcanicCell]).toBe(12);
    expect(result.biomeId[coastalCell]).toBe(23);
    expect(result.landformId[coastalCell]).toBe(17);
    expect(result.biomeId[seaCell]).toBe(20);
    expect(result.landformId[seaCell]).toBe(16);
    expect(result.biomeMetrics.incompatibleBiomeLandformPairCount).toBe(0);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      expect(independentlyCompatiblePair(
        waterRegime[cell]!,
        result.biomeId[cell]!,
        result.landformId[cell]!,
      )).toBe(true);
    }
  });
});
