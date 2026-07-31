import { describe, expect, it } from 'vitest';

import {
  createRealmNorthernSnowField
} from '../src/game/map/realmNorthernSnow';
import {
  createRealmSouthernDesertField,
  summarizeRealmSouthernDesertCoverage
} from '../src/game/map/realmSouthernDesert';
import {
  axialNorthwardProgress,
  axialSouthwardProgress,
  axialToWorld,
  GEOGRAPHIC_SOUTH,
  hexKey,
  worldNorthwardProgress,
  worldSouthwardProgress
} from '../src/game/map/hexCoordinates';
import { createAuthoritativeRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { GENESIS_RIVER_CELLS_V1 } from '../spacetimedb/src/waterWorld';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function canonicalFields() {
  const snapshot = createCanonicalGenesisSnapshot();
  const surface = createAuthoritativeRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.tiles,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  const options = {
    worldSeed: surface.playableMap.worldSeed,
    hexSize: 1,
    playableRadius: surface.playableMap.radius,
    renderRadius: surface.renderMap.radius
  } as const;
  const riverKeys = new Set(GENESIS_RIVER_CELLS_V1.map((cell) => cell.cellKey));
  return {
    desert: createRealmSouthernDesertField(options),
    snow: createRealmNorthernSnowField(options),
    visibleLand: surface.playableMap.cells
      .filter((cell) => !riverKeys.has(hexKey(cell.coord)))
      .map((cell) => cell.coord)
  };
}

describe('Realm Southern desert field', () => {
  it('freezes geographic south and keeps it exactly opposite geographic north', () => {
    expect(Object.isFrozen(GEOGRAPHIC_SOUTH)).toBe(true);
    expect(GEOGRAPHIC_SOUTH).toEqual({
      axialRDirection: 1,
      worldZDirection: 1
    });

    const fartherNorth = { q: 27, r: -12 };
    const fartherSouth = { q: -27, r: 12 };
    expect(axialSouthwardProgress(fartherSouth))
      .toBeGreaterThan(axialSouthwardProgress(fartherNorth));
    expect(axialSouthwardProgress({ q: 999, r: fartherSouth.r }))
      .toBe(axialSouthwardProgress(fartherSouth));

    const northWorld = axialToWorld(fartherNorth, 1);
    const southWorld = axialToWorld(fartherSouth, 1);
    expect(worldSouthwardProgress(southWorld))
      .toBeGreaterThan(worldSouthwardProgress(northWorld));
    expect(worldSouthwardProgress({ x: -99_999, z: southWorld.z }))
      .toBe(worldSouthwardProgress({ x: 99_999, z: southWorld.z }));

    expect(axialSouthwardProgress(fartherSouth))
      .toBe(-axialNorthwardProgress(fartherSouth));
    expect(worldSouthwardProgress(southWorld))
      .toBe(-worldNorthwardProgress(southWorld));
  });

  it('is immutable, deterministic, order independent, and coordinate equivalent', () => {
    const { desert } = canonicalFields();
    const coord = { q: 7, r: 41 };
    const world = axialToWorld(coord, 1);
    const first = desert.sampleWorld(world);
    desert.sampleWorld(axialToWorld({ q: -12, r: -18 }, 1));
    const second = desert.sampleWorld(world);

    expect(Object.isFrozen(desert)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(second).toEqual(first);
    expect(desert.sampleCoord(coord)).toEqual(first);
  });

  it('fails invalid construction and maps invalid sample input to safe zero', () => {
    expect(() => createRealmSouthernDesertField({
      worldSeed: 1,
      hexSize: 1,
      playableRadius: 60,
      renderRadius: 58
    })).toThrow('REALM_SOUTHERN_DESERT_FIELD_OPTIONS_INVALID');

    const { desert } = canonicalFields();
    expect(desert.sampleWorld({ x: Number.NaN, z: Number.NEGATIVE_INFINITY })).toEqual({
      climate: 0,
      exposure: 0,
      sand: 0
    });
  });

  it('protects center and north while forming a sand-dominant irregular south', () => {
    const { desert, snow, visibleLand } = canonicalFields();
    const summary = summarizeRealmSouthernDesertCoverage(desert, visibleLand, snow);

    expect(desert.sampleCoord({ q: 0, r: 0 }).sand).toBe(0);
    expect(desert.sampleCoord({ q: 8, r: -46 }).sand).toBeLessThan(0.01);
    expect(desert.sampleCoord({ q: -8, r: 46 }).sand).toBeGreaterThan(0.75);
    expect(summary.playableCoverageRatio).toBeGreaterThanOrEqual(0.22);
    expect(summary.playableCoverageRatio).toBeLessThanOrEqual(0.30);
    expect(summary.deepCoverageRatio).toBeGreaterThanOrEqual(0.09);
    expect(summary.deepCoverageRatio).toBeLessThanOrEqual(0.15);
    expect(summary.innerRadiusLeakCount).toBe(0);
    expect(summary.northernLeakCount).toBe(0);
    expect(summary.southernmostRowMean).toBeGreaterThan(0.75);
    expect(summary.snowOverlapCellCount).toBe(0);
  });

  it('stays continuous across cell edges and varies the dry front across q', () => {
    const { desert } = canonicalFields();
    const center = axialToWorld({ q: 0, r: 29 }, 1);
    const left = desert.sandAtWorld({ x: center.x - 0.000_01, z: center.z });
    const right = desert.sandAtWorld({ x: center.x + 0.000_01, z: center.z });
    expect(Math.abs(left - right)).toBeLessThan(0.000_1);

    const crossings: number[] = [];
    for (const q of [-24, -12, 0, 12, 24]) {
      let crossing = 0;
      for (let r = 18; r <= 50; r += 1) {
        if (desert.sampleCoord({ q, r }).sand > 0.5) {
          crossing = r;
          break;
        }
      }
      crossings.push(crossing);
    }
    expect(Math.max(...crossings) - Math.min(...crossings)).toBeGreaterThanOrEqual(3);
  });

  it('continues through the apron and applies bounded semantic retention', () => {
    const { desert } = canonicalFields();
    expect(desert.sampleCoord({ q: 0, r: 60 }).sand).toBeGreaterThan(0.75);
    const world = axialToWorld({ q: 0, r: 48 }, 1);
    const open = desert.retainedSandAtWorld(world, {
      slope: 0,
      concavity: 0.6,
      vegetation: 0,
      canopy: 0,
      wetness: 0,
      semanticRetention: 1,
      placementInfluence: 0
    });
    const forested = desert.retainedSandAtWorld(world, {
      slope: 0.7,
      concavity: -0.6,
      vegetation: 1,
      canopy: 1,
      wetness: 0.8,
      semanticRetention: 0.55,
      placementInfluence: 0
    });
    const structure = desert.retainedSandAtWorld(world, {
      slope: 0,
      concavity: 0,
      vegetation: 0,
      canopy: 0,
      wetness: 0,
      semanticRetention: 1,
      placementInfluence: 1
    });
    expect(open).toBeGreaterThan(forested);
    expect(structure).toBeLessThan(0.1);
  });

  it('produces order-independent bounded summaries', () => {
    const { desert, snow, visibleLand } = canonicalFields();
    expect(summarizeRealmSouthernDesertCoverage(desert, [...visibleLand].reverse(), snow))
      .toEqual(summarizeRealmSouthernDesertCoverage(desert, visibleLand, snow));
  });
});
