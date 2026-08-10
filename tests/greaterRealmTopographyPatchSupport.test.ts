// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_TOPOGRAPHY_PATCH_REQUIRED_FIELDS,
  GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORTED_LEVELS,
  measureGreaterRealmTopographyPatchSupport,
} from '../scripts/atlas/greater-realm-topography-patch-support';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

function disc(radius: number): readonly AxialCoordinate[] {
  const result: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (
      let r = Math.max(-radius, -q - radius);
      r <= Math.min(radius, -q + radius);
      r += 1
    ) result.push({ q, r });
  }
  return result;
}

function fixture() {
  const grid = indexGreaterRealmAxialGrid(disc(8));
  const elevation = new Int32Array(grid.cellCount);
  const waterRegime = new Uint8Array(grid.cellCount);
  const waterDepthClass = new Uint8Array(grid.cellCount);
  const waterSurfaceLevel = new Int32Array(grid.cellCount);
  const bankSeed = new Uint32Array(grid.cellCount);
  const landformId = new Uint8Array(grid.cellCount);
  const geologicalBarrierBand = new Uint8Array(grid.cellCount);
  const slope = new Uint16Array(grid.cellCount);
  const aspect = new Uint8Array(grid.cellCount);
  const profileCurvature = new Int32Array(grid.cellCount);
  const planCurvature = new Int32Array(grid.cellCount);
  const ridgeId = new Int32Array(grid.cellCount);
  const routeClass = new Uint8Array(grid.cellCount);
  waterSurfaceLevel.fill(-0x8000_0000);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    elevation[cell] = grid.q[cell]! * 120 + grid.r[cell]! * 70;
    slope[cell] = Math.abs(grid.q[cell]!) * 150;
    aspect[cell] = (cell % 6) + 1;
    profileCurvature[cell] = grid.q[cell]! * 8;
    planCurvature[cell] = grid.r[cell]! * 8;
    if (grid.q[cell] === 0) ridgeId[cell] = 1;
    if (grid.q[cell] === 1) geologicalBarrierBand[cell] = 1;
    if (grid.r[cell] === 2) routeClass[cell] = 2;
    if (grid.r[cell] !== 0) continue;
    waterRegime[cell] = 3;
    waterDepthClass[cell] = 2;
    waterSurfaceLevel[cell] = elevation[cell] + 20;
    bankSeed[cell] = cell + 1;
  }
  return {
    grid,
    elevation,
    waterRegime,
    waterDepthClass,
    waterSurfaceLevel,
    bankSeed,
    landformId,
    geologicalBarrierBand,
    slope,
    aspect,
    profileCurvature,
    planCurvature,
    ridgeId,
    routeClass,
  };
}

describe('Greater Realm private topography patch support', () => {
  it('proves deterministic subcell reconstruction and measured LOD support', () => {
    const input = fixture();
    const first = measureGreaterRealmTopographyPatchSupport(input);
    const replay = measureGreaterRealmTopographyPatchSupport(input);
    expect(first).toEqual(replay);
    expect(first.proof).toBe(true);
    expect(first.lodSampleCounts).toHaveLength(4);
    expect(first.lodSampleCounts[0]).toBe(input.grid.cellCount);
    expect(first.lodSampleCounts).toEqual(
      GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORTED_LEVELS.map(level => {
        const divisor = 1 << level;
        return new Set(Array.from(
          { length: input.grid.cellCount },
          (_, cell) => (
            `${Math.floor(input.grid.q[cell]! / divisor)},`
              + `${Math.floor(input.grid.r[cell]! / divisor)}`
          ),
        )).size;
      }),
    );
    expect(first.lodSampleCounts.at(-1)).toBeLessThan(first.lodSampleCounts[0]!);
    expect(GREATER_REALM_TOPOGRAPHY_PATCH_SUPPORTED_LEVELS).toEqual([0, 1, 2, 3]);
    expect(GREATER_REALM_TOPOGRAPHY_PATCH_REQUIRED_FIELDS).toHaveLength(13);
    expect(JSON.stringify(first)).not.toMatch(/(?:\bq\b|\br\b|coord|cellIndex)/iu);
  });

  it('fails closed for malformed fields and inconsistent water metadata', () => {
    const input = fixture();
    expect(() => measureGreaterRealmTopographyPatchSupport({
      ...input,
      routeClass: new Uint8Array(input.grid.cellCount - 1),
    })).toThrow('GREATER_REALM_TOPOGRAPHY_PATCH_FIELD_INVALID');
    const dryCell = input.waterRegime.findIndex(regime => regime === 0);
    expect(dryCell).toBeGreaterThanOrEqual(0);
    input.waterDepthClass[dryCell] = 1;
    expect(() => measureGreaterRealmTopographyPatchSupport(input))
      .toThrow('GREATER_REALM_TOPOGRAPHY_PATCH_WATER_METADATA_INVALID');
  });
});
