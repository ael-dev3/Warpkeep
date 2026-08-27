import { describe, expect, it, vi } from "vitest";

import {
  GREATER_REALM_COASTAL_CLASS,
  GREATER_REALM_GEOMORPHOLOGY_VERSION,
  repairGreaterRealmFinalFjordCoastalClass,
  shapeGreaterRealmGeomorphology,
} from "../scripts/atlas/greater-realm-geomorphology";
import {
  greaterRealmHexDistance,
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
  type GreaterRealmTerrainSeed,
} from "../scripts/atlas/greater-realm-terrain";

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
    const volcanicDistance = greaterRealmHexDistance(
      coordinate,
      volcanicCenter,
    );
    let height =
      radiusFromCenter >= 23
        ? -800 - (radiusFromCenter - 23) * 500
        : radiusFromCenter === 22
          ? 300
          : radiusFromCenter === 21
            ? 1_200
            : 5_500 - radiusFromCenter * 120;
    if (grid.r[cell]! <= -5 && radiusFromCenter < 23) {
      height += 4_000 + Math.min(2_000, (-grid.r[cell]! - 5) * 100);
    }
    if (grid.r[cell]! >= 5 && radiusFromCenter < 21) height += 500;
    elevation[cell] = height;
    tectonicUplift[cell] = grid.r[cell]! <= -5 ? 4_500 : 1_000;
    if (volcanicDistance <= 4) tectonicUplift[cell] = 8_000;
    rockResistance[cell] =
      grid.r[cell]! >= 5 ? 3_500 : grid.q[cell]! >= 0 ? 7_500 : 4_000;
    volcanicPotential[cell] = Math.max(500, 10_000 - volcanicDistance * 850);
    if (radiusFromCenter <= 2) legacyReserveCell[cell] = 1;
    temperature[cell] =
      grid.r[cell]! <= -5 ? 0 : grid.r[cell]! >= 5 ? 8_000 : 4_500;
    moisture[cell] =
      grid.r[cell]! >= 5 ? -4_000 : grid.r[cell]! <= -5 ? 1_000 : 0;
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

describe("Greater Realm geomorphic shaping", () => {
  it("repairs only post-hydrology coast cells with complete cold-incised glacial evidence", () => {
    const coordinates: AxialCoordinate[] = [];
    for (let system = 0; system < 9; system += 1) {
      coordinates.push({ q: system * 10, r: 0 }, { q: system * 10 + 1, r: 0 });
    }
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const coastalClass = new Uint8Array(grid.cellCount);
    const waterRegime = new Uint8Array(grid.cellCount);
    const temperature = new Int32Array(grid.cellCount);
    temperature.fill(2_000);
    const slope = new Uint16Array(grid.cellCount);
    slope.fill(500);
    const glacialMask = new Uint8Array(grid.cellCount);
    const protectedCell = new Uint8Array(grid.cellCount);
    const reserveCell = new Uint8Array(grid.cellCount);
    for (let system = 0; system < 9; system += 1) {
      glacialMask[system * 2] = 1;
      waterRegime[system * 2 + 1] = 1;
    }
    coastalClass[2] = GREATER_REALM_COASTAL_CLASS.deltaEstuary;
    protectedCell[4] = 1;
    temperature[6] = 2_001;
    slope[8] = 499;
    glacialMask[10] = 0;
    waterRegime[13] = 2;
    waterRegime[14] = 3;
    reserveCell[16] = 1;

    const originalWater = new Uint8Array(waterRegime);
    const originalTemperature = new Int32Array(temperature);
    const originalSlope = new Uint16Array(slope);
    const originalGlacialMask = new Uint8Array(glacialMask);
    const originalProtected = new Uint8Array(protectedCell);
    const originalReserve = new Uint8Array(reserveCell);
    const first = repairGreaterRealmFinalFjordCoastalClass({
      grid,
      coastalClass,
      waterRegime,
      temperature,
      slope,
      glacialMask,
      protectedCell,
      reserveCell,
      dryWaterRegime: 0,
      oceanWaterRegime: 1,
      seaWaterRegime: 5,
    });

    expect(first).toEqual({ reclassifiedCellCount: 1 });
    expect(Array.from(coastalClass)).toEqual([
      4, 0,
      3, 0,
      0, 0,
      0, 0,
      0, 0,
      0, 0,
      0, 0,
      0, 0,
      0, 0,
    ]);
    expect(waterRegime).toEqual(originalWater);
    expect(temperature).toEqual(originalTemperature);
    expect(slope).toEqual(originalSlope);
    expect(glacialMask).toEqual(originalGlacialMask);
    expect(protectedCell).toEqual(originalProtected);
    expect(reserveCell).toEqual(originalReserve);
    expect(repairGreaterRealmFinalFjordCoastalClass({
      grid,
      coastalClass,
      waterRegime,
      temperature,
      slope,
      glacialMask,
      protectedCell,
      reserveCell,
      dryWaterRegime: 0,
      oceanWaterRegime: 1,
      seaWaterRegime: 5,
    })).toEqual({ reclassifiedCellCount: 0 });
  });

  it("does not infer fjords from cold steep coast without glacial-process authority", () => {
    const grid = indexGreaterRealmAxialGrid([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    const coastalClass = new Uint8Array(grid.cellCount);

    expect(repairGreaterRealmFinalFjordCoastalClass({
      grid,
      coastalClass,
      waterRegime: Uint8Array.of(0, 1),
      temperature: Int32Array.of(-2_000, -2_000),
      slope: Uint16Array.of(4_000, 0),
      glacialMask: new Uint8Array(grid.cellCount),
      protectedCell: new Uint8Array(grid.cellCount),
      dryWaterRegime: 0,
      oceanWaterRegime: 1,
      seaWaterRegime: 5,
    })).toEqual({ reclassifiedCellCount: 0 });
    expect(coastalClass).toEqual(new Uint8Array(grid.cellCount));
  });

  it("makes deterministic, bounded, coherent changes without touching the legacy reserve", () => {
    const fixture = syntheticFixture();
    const originalElevation = new Int32Array(fixture.elevation);
    const input = {
      ...fixture,
      candidateSeed: new Uint32Array([
        0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001,
      ]),
    } as const;
    const first = shapeGreaterRealmGeomorphology(input);
    const second = shapeGreaterRealmGeomorphology(input);

    expect(GREATER_REALM_GEOMORPHOLOGY_VERSION).toBe(
      "greater-realm-geomorphology-v5",
    );
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
    expect(first.metrics.terraces.changedCellCount).toBeGreaterThan(0);
    expect(first.metrics.terraces.plateauCellCount).toBeGreaterThan(
      first.metrics.terraces.rampCellCount,
    );
    expect(first.metrics.terraces.rampCellCount).toBeGreaterThan(0);
    expect(
      first.metrics.terraces.realizedPlateauCellCount * 100,
    ).toBeGreaterThanOrEqual(first.metrics.terraces.eligibleCellCount * 35);
    expect(first.metrics.terraces.realizedRampCellCount).toBeGreaterThan(0);
    expect(first.metrics.terraces.spatialRampCellCount).toBeGreaterThan(0);
    expect(first.metrics.terraces.fullStepEdgeCount).toBe(0);
    expect(first.metrics.terraces.weatheredDetailCellCount).toBeGreaterThan(0);
    expect(
      first.metrics.terraces.domainWarpSampledCellCount * 5,
    ).toBeGreaterThanOrEqual(first.metrics.terraces.eligibleCellCount);
    expect(
      first.metrics.terraces.domainWarpChangedCarrierCellCount * 4,
    ).toBeGreaterThanOrEqual(
      first.metrics.terraces.domainWarpSampledCellCount * 3,
    );
    expect(
      first.metrics.terraces.domainWarpOutputChangedCellCount,
    ).toBeGreaterThan(0);
    expect(
      first.metrics.terraces.domainWarpMaximumDistance,
    ).toBeGreaterThanOrEqual(1);
    expect(first.metrics.terraces.domainWarpMaximumDistance).toBeLessThanOrEqual(
      5,
    );
    expect(
      Math.abs(first.metrics.terraces.netElevationDelta),
    ).toBeLessThanOrEqual(first.metrics.terraces.eligibleCellCount * 300);
    expect(first.metrics.endogenicUpliftUnits).toBeGreaterThan(0);
    expect(first.metrics.volcanicAnchorCount).toBeGreaterThan(0);
    expect(first.metrics.glacial.minimumSystemCellCount).toBeGreaterThanOrEqual(
      6,
    );
    expect(first.metrics.arid.minimumSystemCellCount).toBeGreaterThanOrEqual(8);
    expect(first.metrics.coastalClassCount).toBeGreaterThanOrEqual(2);
    expect(first.metrics.glacialClimateCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.aridClimateCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.volcanicTectonicCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.coastalProximityCompatibilityBasisPoints).toBe(10_000);
    expect(first.metrics.erodedMaterialUnits).toBe(
      first.metrics.depositedMaterialUnits +
        first.metrics.exportedMaterialUnits,
    );
    expect(sum(first.totalDelta)).toBe(
      first.metrics.terraces.netElevationDelta +
        first.metrics.endogenicUpliftUnits -
        first.metrics.exportedMaterialUnits,
    );
    expect(
      first.metrics.ridgeUpliftAlignmentBasisPoints,
    ).toBeGreaterThanOrEqual(0);
    expect(first.metrics.ridgeUpliftAlignmentBasisPoints).toBeLessThanOrEqual(
      10_000,
    );
    expect(
      first.metrics.riverValleyAlignmentBasisPoints,
    ).toBeGreaterThanOrEqual(0);
    expect(first.metrics.riverValleyAlignmentBasisPoints).toBeLessThanOrEqual(
      10_000,
    );

    for (let cell = 0; cell < fixture.grid.cellCount; cell += 1) {
      expect(first.totalDelta[cell]).toBe(
        first.terraceDelta[cell]! +
          first.glacialDelta[cell]! +
          first.aridDelta[cell]! +
          first.volcanicDelta[cell]! +
          first.coastalDelta[cell]!,
      );
      expect(first.elevation[cell]).toBe(
        fixture.elevation[cell]! + first.totalDelta[cell]!,
      );
      if (fixture.legacyReserveCell[cell] === 1) {
        expect(first.totalDelta[cell]).toBe(0);
        expect(first.elevation[cell]).toBe(fixture.elevation[cell]);
      }
    }
  });

  it("removes isolated climate-compatible speckles before shaping", () => {
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

  it("preserves the complete land/sea sign even on one-unit coastlines", () => {
    const fixture = syntheticFixture(8);
    const originalElevation = new Int32Array(fixture.grid.cellCount);
    for (let cell = 0; cell < fixture.grid.cellCount; cell += 1) {
      const distance = greaterRealmHexDistance({
        q: fixture.grid.q[cell]!,
        r: fixture.grid.r[cell]!,
      });
      fixture.elevation[cell] =
        distance <= 4
          ? distance === 4 && fixture.grid.q[cell]! % 2 === 0
            ? 100
            : 1
          : -1;
      fixture.legacyReserveCell[cell] = 0;
      fixture.tectonicUplift[cell] = 1_000;
      fixture.rockResistance[cell] = 4_000;
      fixture.volcanicPotential[cell] = 0;
      fixture.climate.temperature[cell] = 7_000;
      fixture.climate.moisture[cell] = -3_000;
      originalElevation[cell] = fixture.elevation[cell]!;
    }

    const result = shapeGreaterRealmGeomorphology({
      ...fixture,
      candidateSeed: new Uint32Array([0xa, 0xb, 0xc, 0xd]),
    });

    let overlappingCoastalErosion = 0;
    for (let cell = 0; cell < fixture.grid.cellCount; cell += 1) {
      expect(result.elevation[cell]! > 0).toBe(originalElevation[cell]! > 0);
      if (result.aridDelta[cell]! < 0 && result.coastalDelta[cell]! < 0) {
        overlappingCoastalErosion += 1;
      }
    }
    expect(overlappingCoastalErosion).toBeGreaterThan(0);
    expect(result.metrics.erodedMaterialUnits).toBe(
      result.metrics.depositedMaterialUnits +
        result.metrics.exportedMaterialUnits,
    );
  });

  it("selects separated volcanic anchors from a domain-wide potential plateau", () => {
    const fixture = syntheticFixture();
    fixture.volcanicPotential.fill(8_500);
    fixture.tectonicUplift.fill(6_000);
    const result = shapeGreaterRealmGeomorphology({
      ...fixture,
      candidateSeed: new Uint32Array([
        0x0bad_f00d, 0x1020_3040, 0x5060_7080, 0x90a0_b0c0,
      ]),
    });
    const anchors = [...result.volcanicAnchorMask]
      .map((value, cell) => (value === 1 ? cell : -1))
      .filter((cell) => cell >= 0);

    expect(result.metrics.volcanicAnchorCount).toBe(2);
    expect(anchors).toHaveLength(2);
    expect(result.metrics.volcanicTectonicCompatibilityBasisPoints).toBe(
      10_000,
    );
    expect(
      greaterRealmHexDistance(
        { q: fixture.grid.q[anchors[0]!]!, r: fixture.grid.r[anchors[0]!]! },
        { q: fixture.grid.q[anchors[1]!]!, r: fixture.grid.r[anchors[1]!]! },
      ),
    ).toBeGreaterThanOrEqual(14);
  });

  it("derives its production climate from independent named integer fields", () => {
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

  it("derives smooth uplift rain shadows and windward lift without changing reserve climate", () => {
    const { climate: _fixtureClimate, ...fixture } = syntheticFixture();
    const noUplift = new Int32Array(fixture.grid.cellCount);
    const candidateSeed = new Uint32Array([
      0x4411_2200, 0x8877_6655, 0xccbb_aa99, 0x1020_3040,
    ]);
    const shadowed = shapeGreaterRealmGeomorphology({
      ...fixture,
      candidateSeed,
    });
    const repeated = shapeGreaterRealmGeomorphology({
      ...fixture,
      candidateSeed: new Uint32Array(candidateSeed),
    });
    const unshadowed = shapeGreaterRealmGeomorphology({
      ...fixture,
      tectonicUplift: noUplift,
      candidateSeed: new Uint32Array(candidateSeed),
    });

    expect(shadowed.moisture).toEqual(repeated.moisture);
    let strictlyDrierCellCount = 0;
    let strictlyWetterCellCount = 0;
    const shadowDelta = new Int32Array(fixture.grid.cellCount);
    for (let cell = 0; cell < fixture.grid.cellCount; cell += 1) {
      if (fixture.legacyReserveCell[cell] === 1) {
        expect(shadowed.moisture[cell]).toBe(unshadowed.moisture[cell]);
        continue;
      }
      if (shadowed.moisture[cell]! < unshadowed.moisture[cell]!) {
        strictlyDrierCellCount += 1;
      } else if (shadowed.moisture[cell]! > unshadowed.moisture[cell]!) {
        strictlyWetterCellCount += 1;
      }
      shadowDelta[cell] = unshadowed.moisture[cell]!
        - shadowed.moisture[cell]!;
    }
    expect(strictlyDrierCellCount).toBeGreaterThan(0);
    expect(strictlyWetterCellCount).toBeGreaterThan(0);
    const axisDeltaSums = [0, 0, 0];
    const axisEdgeCounts = [0, 0, 0];
    for (let cell = 0; cell < fixture.grid.cellCount; cell += 1) {
      if (
        fixture.legacyReserveCell[cell] === 1
        || fixture.elevation[cell]! <= 0
      ) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        const neighbor = fixture.grid.neighbors[cell * 6 + axis]!;
        if (
          neighbor < 0
          || fixture.legacyReserveCell[neighbor] === 1
          || fixture.elevation[neighbor]! <= 0
        ) continue;
        axisDeltaSums[axis] += Math.abs(
          shadowDelta[cell]! - shadowDelta[neighbor]!,
        );
        axisEdgeCounts[axis] += 1;
      }
    }
    const axisMeanDeltas = axisDeltaSums.map((total, axis) => (
      Math.round(total / axisEdgeCounts[axis]!)
    ));
    const maximumAxisMeanDelta = Math.max(...axisMeanDeltas);
    const minimumAxisMeanDelta = Math.min(...axisMeanDeltas);
    expect(maximumAxisMeanDelta).toBeGreaterThan(0);
    expect(Math.round(
      ((maximumAxisMeanDelta - minimumAxisMeanDelta) * 10_000)
        / maximumAxisMeanDelta,
    )).toBeLessThanOrEqual(7_000);
    expect(shadowed.metrics.aridClimateCompatibilityBasisPoints).toBe(10_000);
    expect(fixture.tectonicUplift).not.toEqual(noUplift);
    shadowDelta.fill(0);
  });

  it("zeroizes owned buffers after a late geomorphology failure", () => {
    const { climate: _fixtureClimate, ...fixture } = syntheticFixture();
    const originalElevation = new Int32Array(fixture.elevation);
    const originalTectonicUplift = new Int32Array(fixture.tectonicUplift);
    const originalRockResistance = new Int32Array(fixture.rockResistance);
    const originalVolcanicPotential = new Int32Array(fixture.volcanicPotential);
    const originalLegacyReserveCell = new Uint8Array(fixture.legacyReserveCell);
    const allocations: Array<{
      array:
        Int32Array | Uint8Array | Uint16Array | Uint32Array | BigUint64Array;
      owner: string;
    }> = [];
    type TrackedConstructor = typeof Int32Array;
    const track = (name: string, constructor: TrackedConstructor): void => {
      vi.stubGlobal(
        name,
        new Proxy(constructor, {
          construct(target, argumentsList) {
            const array = Reflect.construct(target, argumentsList) as
              | Int32Array
              | Uint8Array
              | Uint16Array
              | Uint32Array
              | BigUint64Array;
            const owner =
              (new Error().stack ?? "")
                .split("\n")
                .find((line) => line.includes("/scripts/atlas/")) ?? "";
            allocations.push({ array, owner });
            return array;
          },
        }),
      );
    };
    track("Int32Array", Int32Array);
    track("Uint8Array", Uint8Array as unknown as TrackedConstructor);
    track("Uint16Array", Uint16Array as unknown as TrackedConstructor);
    track("Uint32Array", Uint32Array as unknown as TrackedConstructor);
    track("BigUint64Array", BigUint64Array as unknown as TrackedConstructor);

    const words = [0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001] as const;
    let seedValidationCount = 0;
    const lateFailSeed = {
      0: words[0],
      1: words[1],
      2: words[2],
      3: words[3],
      length: 4,
      *[Symbol.iterator]() {
        seedValidationCount += 1;
        if (seedValidationCount === 6) {
          throw new Error("CONTROLLED_GEOMORPHOLOGY_LATE_FAILURE");
        }
        yield* words;
      },
    } as unknown as GreaterRealmTerrainSeed;

    try {
      expect(() =>
        shapeGreaterRealmGeomorphology({
          ...fixture,
          candidateSeed: lateFailSeed,
        }),
      ).toThrow("CONTROLLED_GEOMORPHOLOGY_LATE_FAILURE");
      expect(seedValidationCount).toBe(6);

      const directlyOwned = allocations.filter(
        ({ owner }) =>
          owner.includes("/greater-realm-geomorphology.ts:") ||
          owner.includes("/greater-realm-terraces.ts:"),
      );
      expect(directlyOwned.length).toBeGreaterThan(20);
      for (const { array } of directlyOwned) {
        for (let index = 0; index < array.length; index += 1) {
          const value = array[index];
          expect(value === 0 || value === 0n).toBe(true);
        }
      }

      expect(fixture.elevation).toEqual(originalElevation);
      expect(fixture.tectonicUplift).toEqual(originalTectonicUplift);
      expect(fixture.rockResistance).toEqual(originalRockResistance);
      expect(fixture.volcanicPotential).toEqual(originalVolcanicPotential);
      expect(fixture.legacyReserveCell).toEqual(originalLegacyReserveCell);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
