import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_GEOMORPHOLOGY_VERSION,
  shapeGreaterRealmGeomorphology,
} from '../scripts/atlas/greater-realm-geomorphology';
import {
  greaterRealmHexDistance,
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

function syntheticFixture(radius = 28) {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const elevation = new Int32Array(grid.cellCount);
  const tectonicUplift = new Int32Array(grid.cellCount);
  const rockResistance = new Int32Array(grid.cellCount);
  const volcanicPotential = new Int32Array(grid.cellCount);
  const legacyReserveCell = new Uint8Array(grid.cellCount);
  const temperature = new Int32Array(grid.cellCount);
  const moisture = new Int32Array(grid.cellCount);
  const volcanicCenter = Object.freeze({ q: 8, r: -1 });

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const coordinate = Object.freeze({ q: grid.q[cell]!, r: grid.r[cell]! });
    const radiusFromCenter = greaterRealmHexDistance(coordinate);
    const volcanicDistance = greaterRealmHexDistance(coordinate, volcanicCenter);
    let height = radiusFromCenter >= 23
      ? -800 - (radiusFromCenter - 23) * 500
      : radiusFromCenter === 22 ? 300
        : radiusFromCenter === 21 ? 1_200
          : 5_500 - radiusFromCenter * 120;
    if (grid.r[cell]! <= -5 && radiusFromCenter < 23) {
      height += 4_000 + Math.min(2_000, (-grid.r[cell]! - 5) * 100);
    }
    if (grid.r[cell]! >= 5 && radiusFromCenter < 21) height += 500;
    elevation[cell] = height;
    tectonicUplift[cell] = grid.r[cell]! <= -5 ? 4_500 : 1_000;
    if (volcanicDistance <= 4) tectonicUplift[cell] = 8_000;
    rockResistance[cell] = grid.r[cell]! >= 5 ? 3_500 : grid.q[cell]! >= 0 ? 7_500 : 4_000;
    volcanicPotential[cell] = Math.max(500, 10_000 - volcanicDistance * 850);
    if (radiusFromCenter <= 2) legacyReserveCell[cell] = 1;
    temperature[cell] = grid.r[cell]! <= -5 ? 0 : grid.r[cell]! >= 5 ? 8_000 : 4_500;
    moisture[cell] = grid.r[cell]! >= 5 ? -4_000 : grid.r[cell]! <= -5 ? 1_000 : 0;
  }
  return Object.freeze({
    grid,
    elevation,
    tectonicUplift,
    rockResistance,
    volcanicPotential,
    legacyReserveCell,
    climate: Object.freeze({ temperature, moisture }),
  });
}

function sum(values: Int32Array): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

describe('Greater Realm geomorphic shaping', () => {
  it('makes deterministic, bounded, coherent changes without touching the legacy reserve', () => {
    const fixture = syntheticFixture();
    const originalElevation = new Int32Array(fixture.elevation);
    const input = {
      ...fixture,
      candidateSeed: new Uint32Array([0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001]),
    } as const;
    const first = shapeGreaterRealmGeomorphology(input);
    const second = shapeGreaterRealmGeomorphology(input);

    expect(GREATER_REALM_GEOMORPHOLOGY_VERSION).toBe('greater-realm-geomorphology-v2');
    expect(first).toEqual(second);
    expect(fixture.elevation).toEqual(originalElevation);
    expect(first.metrics.changedCellCount).toBeGreaterThan(0);
    expect(first.metrics.maximumAbsoluteCellDelta).toBeGreaterThan(0);
    expect(first.metrics.maximumAbsoluteCellDelta).toBeLessThanOrEqual(8_192);
    expect(first.metrics.protectedCellCount).toBeGreaterThan(0);
    expect(first.metrics.protectedChangedCellCount).toBe(0);
    expect(first.metrics.glacial.changedCellCount).toBeGreaterThan(0);
    expect(first.metrics.arid.changedCellCount).toBeGreaterThan(0);
    expect(first.metrics.coastal.changedCellCount).toBeGreaterThan(0);
    expect(first.metrics.endogenicUpliftUnits).toBeGreaterThan(0);
    expect(first.metrics.volcanicAnchorCount).toBeGreaterThan(0);
    expect(first.metrics.glacial.minimumSystemCellCount).toBeGreaterThanOrEqual(6);
    expect(first.metrics.arid.minimumSystemCellCount).toBeGreaterThanOrEqual(8);
    expect(first.metrics.coastalClassCount).toBeGreaterThanOrEqual(2);
    expect(first.metrics.glacialClimateCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.aridClimateCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.volcanicTectonicCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.coastalProximityCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.erodedMaterialUnits).toBe(
      first.metrics.depositedMaterialUnits + first.metrics.exportedMaterialUnits,
    );
    expect(sum(first.totalDelta)).toBe(
      first.metrics.endogenicUpliftUnits - first.metrics.exportedMaterialUnits,
    );
    expect(first.metrics.ridgeUpliftAlignmentBasisPoints).toBeGreaterThanOrEqual(0);
    expect(first.metrics.ridgeUpliftAlignmentBasisPoints).toBeLessThanOrEqual(10_000);
    expect(first.metrics.riverValleyAlignmentBasisPoints).toBeGreaterThanOrEqual(0);
    expect(first.metrics.riverValleyAlignmentBasisPoints).toBeLessThanOrEqual(10_000);

    for (let cell = 0; cell < fixture.grid.cellCount; cell += 1) {
      expect(first.totalDelta[cell]).toBe(
        first.glacialDelta[cell]! + first.aridDelta[cell]! + first.volcanicDelta[cell]!
          + first.coastalDelta[cell]!,
      );
      expect(first.elevation[cell]).toBe(fixture.elevation[cell]! + first.totalDelta[cell]!);
      if (fixture.legacyReserveCell[cell] === 1) {
        expect(first.totalDelta[cell]).toBe(0);
        expect(first.elevation[cell]).toBe(fixture.elevation[cell]);
      }
    }
  });

  it('removes isolated climate-compatible speckles before shaping', () => {
    const fixture = syntheticFixture();
    const temperature = new Int32Array(fixture.grid.cellCount);
    temperature.fill(4_000);
    const moisture = new Int32Array(fixture.grid.cellCount);
    const isolated = fixture.grid.indexOf({ q: -8, r: -2 });
    expect(isolated).toBeGreaterThanOrEqual(0);
    temperature[isolated] = 0;
    fixture.elevation[isolated] = 10_000;
    const result = shapeGreaterRealmGeomorphology({
      ...fixture,
      candidateSeed: new Uint32Array([1, 2, 3, 4]),
      climate: Object.freeze({ temperature, moisture }),
    });

    expect(result.metrics.glacial.sourceCellCount).toBe(0);
    expect(result.metrics.glacial.systemCount).toBe(0);
    expect(result.metrics.arid.sourceCellCount).toBe(0);
    expect(result.metrics.arid.systemCount).toBe(0);
  });

  it('selects separated volcanic anchors from a domain-wide potential plateau', () => {
    const fixture = syntheticFixture();
    fixture.volcanicPotential.fill(8_500);
    fixture.tectonicUplift.fill(6_000);
    const result = shapeGreaterRealmGeomorphology({
      ...fixture,
      candidateSeed: new Uint32Array([0x0bad_f00d, 0x1020_3040, 0x5060_7080, 0x90a0_b0c0]),
    });
    const anchors = [...result.volcanicAnchorMask]
      .map((value, cell) => value === 1 ? cell : -1)
      .filter(cell => cell >= 0);

    expect(result.metrics.volcanicAnchorCount).toBe(2);
    expect(anchors).toHaveLength(2);
    expect(result.metrics.volcanicTectonicCompatibilityBasisPoints).toBe(10_000);
    expect(greaterRealmHexDistance(
      { q: fixture.grid.q[anchors[0]!]!, r: fixture.grid.r[anchors[0]!]! },
      { q: fixture.grid.q[anchors[1]!]!, r: fixture.grid.r[anchors[1]!]! },
    )).toBeGreaterThanOrEqual(14);
  });

  it('derives its production climate from independent named integer fields', () => {
    const { climate: _fixtureClimate, ...fixture } = syntheticFixture();
    const input = {
      ...fixture,
      candidateSeed: new Uint32Array([9, 8, 7, 6]),
    } as const;
    const first = shapeGreaterRealmGeomorphology(input);
    const second = shapeGreaterRealmGeomorphology(input);

    expect(first.temperature).toEqual(second.temperature);
    expect(first.moisture).toEqual(second.moisture);
    expect(first.temperature.length).toBe(fixture.grid.cellCount);
    expect(first.moisture.length).toBe(fixture.grid.cellCount);
    expect(new Set(first.temperature).size).toBeGreaterThan(1);
    expect(new Set(first.moisture).size).toBeGreaterThan(1);
  });
});
