import { describe, expect, it } from 'vitest';

import {
  createRealmNorthernSnowField,
  realmNorthernSnowRetentionSlope,
  summarizeRealmNorthernSnowCoverage
} from '../src/game/map/realmNorthernSnow';
import {
  axialNorthwardProgress,
  axialToWorld,
  GEOGRAPHIC_NORTH,
  hexDistance,
  hexKey,
  worldNorthwardProgress,
  type HexCoord
} from '../src/game/map/hexCoordinates';
import { createAuthoritativeRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { GENESIS_RIVER_CELLS_V1 } from '../spacetimedb/src/waterWorld';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function canonicalField() {
  const snapshot = createCanonicalGenesisSnapshot();
  const surface = createAuthoritativeRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.tiles,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  const riverKeys = new Set(GENESIS_RIVER_CELLS_V1.map((cell) => cell.cellKey));
  const visibleLand = surface.playableMap.cells
    .filter((cell) => !riverKeys.has(hexKey(cell.coord)))
    .map((cell) => cell.coord);
  return {
    field: createRealmNorthernSnowField({
      worldSeed: surface.playableMap.worldSeed,
      hexSize: 1,
      playableRadius: surface.playableMap.radius,
      renderRadius: surface.renderMap.radius
    }),
    visibleLand
  };
}

describe('Realm Northern snow field', () => {
  it('freezes geographic north independently of q, world x, and camera framing', () => {
    expect(Object.isFrozen(GEOGRAPHIC_NORTH)).toBe(true);
    expect(GEOGRAPHIC_NORTH).toEqual({
      axialRDirection: -1,
      worldZDirection: -1
    });

    const fartherNorth = { q: 27, r: -12 };
    const fartherSouth = { q: -27, r: 12 };
    expect(axialNorthwardProgress(fartherNorth))
      .toBeGreaterThan(axialNorthwardProgress(fartherSouth));
    expect(axialNorthwardProgress({ q: -999, r: fartherNorth.r }))
      .toBe(axialNorthwardProgress(fartherNorth));

    const northWorld = axialToWorld(fartherNorth, 1);
    const southWorld = axialToWorld(fartherSouth, 1);
    expect(northWorld.z).toBeLessThan(southWorld.z);
    expect(worldNorthwardProgress(northWorld))
      .toBeGreaterThan(worldNorthwardProgress(southWorld));
    expect(worldNorthwardProgress({ x: -99_999, z: northWorld.z }))
      .toBe(worldNorthwardProgress({ x: 99_999, z: northWorld.z }));
    expect(axialNorthwardProgress({ q: 0, r: 1 })).toBeLessThan(0);
    expect(worldNorthwardProgress({ x: 0, z: 1 })).toBeLessThan(0);
  });

  it('is immutable, deterministic, order independent, and coordinate equivalent', () => {
    const { field } = canonicalField();
    const coord = { q: -7, r: -41 };
    const world = axialToWorld(coord, 1);
    const first = field.sampleWorld(world);
    field.sampleWorld(axialToWorld({ q: 12, r: 18 }, 1));
    const second = field.sampleWorld(world);

    expect(Object.isFrozen(field)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(second).toEqual(first);
    expect(field.sampleCoord(coord)).toEqual(first);
  });

  it('fails invalid construction and maps invalid sample input to safe zero', () => {
    expect(() => createRealmNorthernSnowField({
      worldSeed: 1,
      hexSize: 0,
      playableRadius: 58,
      renderRadius: 60
    })).toThrow('REALM_NORTHERN_SNOW_FIELD_OPTIONS_INVALID');

    const { field } = canonicalField();
    expect(field.sampleWorld({ x: Number.NaN, z: Number.POSITIVE_INFINITY })).toEqual({
      climate: 0,
      exposure: 0,
      coverage: 0
    });
  });

  it('protects the Lowlands while forming a snow-dominant irregular north', () => {
    const { field, visibleLand } = canonicalField();
    const summary = summarizeRealmNorthernSnowCoverage(field, visibleLand);
    const center = field.sampleCoord({ q: 0, r: 0 });
    const south = field.sampleCoord({ q: -8, r: 46 });
    const north = field.sampleCoord({ q: 8, r: -46 });

    expect(center.coverage).toBe(0);
    expect(south.coverage).toBeLessThan(0.01);
    expect(north.coverage).toBeGreaterThan(0.75);
    expect(summary.preRetentionCoverageRatio).toBeGreaterThanOrEqual(0.22);
    expect(summary.preRetentionCoverageRatio).toBeLessThanOrEqual(0.30);
    expect(summary.preRetentionDeepCoverageRatio).toBeGreaterThanOrEqual(0.09);
    expect(summary.preRetentionDeepCoverageRatio).toBeLessThanOrEqual(0.15);
    expect(summary.innerRadiusLeakCount).toBe(0);
    expect(summary.southernLeakCount).toBe(0);
    expect(summary.northernmostRowMean).toBeGreaterThan(0.75);
  });

  it('stays continuous across cell edges and varies the frostline across q', () => {
    const { field } = canonicalField();
    const center = axialToWorld({ q: 0, r: -29 }, 1);
    const left = field.coverageAtWorld({ x: center.x - 0.000_01, z: center.z });
    const right = field.coverageAtWorld({ x: center.x + 0.000_01, z: center.z });
    expect(Math.abs(left - right)).toBeLessThan(0.000_1);

    const crossings: number[] = [];
    for (const q of [-24, -12, 0, 12, 24]) {
      let crossing = 0;
      for (let r = -18; r >= -50; r -= 1) {
        if (field.sampleCoord({ q, r }).coverage > 0.5) {
          crossing = r;
          break;
        }
      }
      crossings.push(crossing);
    }
    expect(Math.max(...crossings) - Math.min(...crossings)).toBeGreaterThanOrEqual(3);
  });

  it('continues through the render apron and bounds final retention cues', () => {
    const { field } = canonicalField();
    const apron = field.sampleCoord({ q: 0, r: -60 });
    expect(apron.coverage).toBeGreaterThan(0.75);
    expect(field.retainedCoverageAtWorld(
      axialToWorld({ q: 0, r: -48 }, 1),
      { slope: 0, concavity: 0.7, placementInfluence: 0 }
    )).toBeGreaterThan(field.retainedCoverageAtWorld(
      axialToWorld({ q: 0, r: -48 }, 1),
      { slope: 0.8, concavity: -0.7, placementInfluence: 0 }
    ));
    expect(field.retainedCoverageAtWorld(
      axialToWorld({ q: 0, r: -48 }, 1),
      { slope: 0, concavity: 0, placementInfluence: 1 }
    )).toBeLessThan(0.1);
  });

  it('shares one bounded slope-retention cue across terrain and ecology', () => {
    expect(realmNorthernSnowRetentionSlope(0, 1)).toBe(0);
    expect(realmNorthernSnowRetentionSlope(0.1, 1))
      .toBeCloseTo(0.1 / Math.hypot(0.1, 1) * 2.8);
    expect(realmNorthernSnowRetentionSlope(1, 0)).toBe(1);
    expect(realmNorthernSnowRetentionSlope(Number.NaN, 1)).toBe(0);
  });

  it('does not depend on iteration order in aggregate summaries', () => {
    const { field, visibleLand } = canonicalField();
    const reversed = [...visibleLand].reverse();
    expect(summarizeRealmNorthernSnowCoverage(field, reversed))
      .toEqual(summarizeRealmNorthernSnowCoverage(field, visibleLand));
    expect(visibleLand.every((coord: HexCoord) => hexDistance({ q: 0, r: 0 }, coord) <= 58))
      .toBe(true);
  });
});
