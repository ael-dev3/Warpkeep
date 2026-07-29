import { describe, expect, it } from 'vitest';

import {
  createRealmNorthernSnowField,
  summarizeRealmNorthernSnowCoverage
} from '../src/game/map/realmNorthernSnow';
import {
  axialToWorld,
  hexDistance,
  hexKey,
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
    expect(summary.playableCoverageRatio).toBeGreaterThanOrEqual(0.22);
    expect(summary.playableCoverageRatio).toBeLessThanOrEqual(0.30);
    expect(summary.deepCoverageRatio).toBeGreaterThanOrEqual(0.09);
    expect(summary.deepCoverageRatio).toBeLessThanOrEqual(0.15);
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

  it('does not depend on iteration order in aggregate summaries', () => {
    const { field, visibleLand } = canonicalField();
    const reversed = [...visibleLand].reverse();
    expect(summarizeRealmNorthernSnowCoverage(field, reversed))
      .toEqual(summarizeRealmNorthernSnowCoverage(field, visibleLand));
    expect(visibleLand.every((coord: HexCoord) => hexDistance({ q: 0, r: 0 }, coord) <= 58))
      .toBe(true);
  });
});
