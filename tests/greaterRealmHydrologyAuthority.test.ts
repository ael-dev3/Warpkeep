import { describe, expect, it, vi } from "vitest";

import {
  deriveGreaterRealmHydrologyAuthority,
  GREATER_REALM_DRY_SURFACE_LEVEL,
  GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION,
  GREATER_REALM_HYDROLOGY_GENERATION_VERSION,
  GREATER_REALM_WATER_DEPTH_CLASS_ID,
  GREATER_REALM_WATER_REGIME_ID,
} from "../scripts/atlas/greater-realm-hydrology-authority";
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from "../scripts/atlas/greater-realm-terrain";

const SEED = new Uint32Array([
  0x0123_4567, 0x89ab_cdef, 0xfedc_ba98, 0x7654_3210,
]);

function fixture(offset: AxialCoordinate = { q: 0, r: 0 }) {
  const coordinates = Array.from({ length: 9 }, (_, q) => ({
    q: q + offset.q,
    r: offset.r,
  }));
  const grid = indexGreaterRealmAxialGrid(coordinates);
  return Object.freeze({
    grid,
    seed: SEED,
    waterRegime: new Uint8Array([
      GREATER_REALM_WATER_REGIME_ID.OCEAN,
      GREATER_REALM_WATER_REGIME_ID.SEA,
      GREATER_REALM_WATER_REGIME_ID.LAKE,
      GREATER_REALM_WATER_REGIME_ID.RIVER,
      GREATER_REALM_WATER_REGIME_ID.RIVER,
      GREATER_REALM_WATER_REGIME_ID.STREAM,
      GREATER_REALM_WATER_REGIME_ID.DRY,
      GREATER_REALM_WATER_REGIME_ID.DRY,
      GREATER_REALM_WATER_REGIME_ID.DRY,
    ]),
    marshMask: new Uint8Array([0, 0, 0, 0, 0, 0, 1, 0, 0]),
    flowContinuityExemptionMask: new Uint8Array(9),
    elevation: new Int32Array([
      -4_000, -1_000, 50, 300, 500, 700, 800, 900, 1_000,
    ]),
    filledElevation: new Int32Array([
      0, 0, 100, 300, 500, 700, 800, 900, 1_000,
    ]),
    flowReceiver: new Int32Array([-1, 0, 1, 2, 3, 4, 5, 6, 7]),
    flowAccumulation: new BigUint64Array([9n, 8n, 7n, 6n, 5n, 4n, 3n, 2n, 1n]),
    seaLevel: 0,
  });
}

function metricSnapshot(
  metrics: ReturnType<typeof deriveGreaterRealmHydrologyAuthority>["metrics"],
) {
  return {
    waterCellCount: metrics.waterCellCount,
    waterBodyCount: metrics.waterBodyCount,
    waterCellCountsByRegime: Array.from(metrics.waterCellCountsByRegime),
    waterBodyCountsByRegime: Array.from(metrics.waterBodyCountsByRegime),
    waterCellCountsByDepthClass: Array.from(
      metrics.waterCellCountsByDepthClass,
    ),
    routingAcyclicProof: metrics.routingAcyclicProof,
    downstreamSurfaceProof: metrics.downstreamSurfaceProof,
    bodySurfaceProof: metrics.bodySurfaceProof,
    marshConnectivityProof: metrics.marshConnectivityProof,
    metadataCompletenessProof: metrics.metadataCompletenessProof,
    proof: metrics.proof,
  };
}

function everyTypedValueIsZero(values: ArrayLike<number | bigint>): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== 0 && values[index] !== 0n) return false;
  }
  return true;
}

describe("Greater Realm final hydrology authority", () => {
  it("materializes complete deterministic metadata for every water regime, including marsh", () => {
    const input = fixture();
    const original = {
      waterRegime: new Uint8Array(input.waterRegime),
      marshMask: new Uint8Array(input.marshMask),
      elevation: new Int32Array(input.elevation),
      filledElevation: new Int32Array(input.filledElevation),
      flowReceiver: new Int32Array(input.flowReceiver),
      flowAccumulation: new BigUint64Array(input.flowAccumulation),
    };
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("MATH_RANDOM_MUST_NOT_BE_USED");
    });
    try {
      const first = deriveGreaterRealmHydrologyAuthority(input);
      const replay = deriveGreaterRealmHydrologyAuthority(input);

      expect(GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION).toBe(
        "greater-realm-hydrology-authority-v1",
      );
      expect(GREATER_REALM_HYDROLOGY_GENERATION_VERSION).toBe(1);
      expect(first.waterRegime).toEqual(
        new Uint8Array([1, 5, 2, 3, 3, 4, 6, 0, 0]),
      );
      expect(first.waterBodyId).toEqual(
        new Uint32Array([1, 2, 3, 4, 4, 5, 6, 0, 0]),
      );
      expect(first.depthClass).toEqual(
        new Uint8Array([
          GREATER_REALM_WATER_DEPTH_CLASS_ID.DEEP,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.CHANNEL,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.SHALLOW,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.SHALLOW,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.SHALLOW,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.SHALLOW,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.SHALLOW,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY,
          GREATER_REALM_WATER_DEPTH_CLASS_ID.DRY,
        ]),
      );
      expect(first.surfaceLevel).toEqual(
        new Int32Array([
          0,
          0,
          100,
          300,
          500,
          700,
          800,
          GREATER_REALM_DRY_SURFACE_LEVEL,
          GREATER_REALM_DRY_SURFACE_LEVEL,
        ]),
      );
      expect(first.downstream).toEqual(
        new Int32Array([-1, -1, 1, 2, 3, 4, 5, -1, -1]),
      );
      expect(first.flowAccumulation).toEqual(input.flowAccumulation);
      expect(first.generationVersion).toEqual(
        new Uint16Array([1, 1, 1, 1, 1, 1, 1, 0, 0]),
      );
      expect(first.bankSeed.slice(0, 7).every((value) => value !== 0)).toBe(
        true,
      );
      expect(first.bankSeed.slice(7).every((value) => value === 0)).toBe(true);
      expect(first.metrics).toMatchObject({
        waterCellCount: 7,
        waterBodyCount: 6,
        routingAcyclicProof: true,
        downstreamSurfaceProof: true,
        bodySurfaceProof: true,
        marshConnectivityProof: true,
        metadataCompletenessProof: true,
        proof: true,
      });
      expect(first.waterRegime).toEqual(replay.waterRegime);
      expect(first.waterBodyId).toEqual(replay.waterBodyId);
      expect(first.depthClass).toEqual(replay.depthClass);
      expect(first.surfaceLevel).toEqual(replay.surfaceLevel);
      expect(first.downstream).toEqual(replay.downstream);
      expect(first.bankSeed).toEqual(replay.bankSeed);
      expect(metricSnapshot(first.metrics)).toEqual(
        metricSnapshot(replay.metrics),
      );
      expect(input.waterRegime).toEqual(original.waterRegime);
      expect(input.marshMask).toEqual(original.marshMask);
      expect(input.elevation).toEqual(original.elevation);
      expect(input.filledElevation).toEqual(original.filledElevation);
      expect(input.flowReceiver).toEqual(original.flowReceiver);
      expect(input.flowAccumulation).toEqual(original.flowAccumulation);
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("keeps review metrics coordinate-free while bank dressing stays coordinate-addressed", () => {
    const original = deriveGreaterRealmHydrologyAuthority(fixture());
    const translated = deriveGreaterRealmHydrologyAuthority(
      fixture({ q: 40, r: -17 }),
    );

    expect(metricSnapshot(translated.metrics)).toEqual(
      metricSnapshot(original.metrics),
    );
    expect(translated.waterRegime).toEqual(original.waterRegime);
    expect(translated.waterBodyId).toEqual(original.waterBodyId);
    expect(translated.depthClass).toEqual(original.depthClass);
    expect(translated.surfaceLevel).toEqual(original.surfaceLevel);
    expect(translated.downstream).toEqual(original.downstream);
    expect(translated.bankSeed).not.toEqual(original.bankSeed);
  });

  it("fails closed on invalid authority and wipes every allocated typed output", () => {
    const valid = fixture();
    const malformed = {
      ...valid,
      waterRegime: new Uint8Array(valid.waterRegime),
    };
    malformed.waterRegime[4] = 255;
    const uint8Fill = vi.spyOn(Uint8Array.prototype, "fill");
    const uint16Fill = vi.spyOn(Uint16Array.prototype, "fill");
    const uint32Fill = vi.spyOn(Uint32Array.prototype, "fill");
    const int32Fill = vi.spyOn(Int32Array.prototype, "fill");
    const uint64Fill = vi.spyOn(BigUint64Array.prototype, "fill");
    try {
      expect(() => deriveGreaterRealmHydrologyAuthority(malformed)).toThrow(
        "GREATER_REALM_HYDROLOGY_REGIME_INVALID",
      );
      const allocated = [
        ...(uint8Fill.mock.instances as unknown as Uint8Array[]),
        ...(uint16Fill.mock.instances as unknown as Uint16Array[]),
        ...(uint32Fill.mock.instances as unknown as Uint32Array[]),
        ...(int32Fill.mock.instances as unknown as Int32Array[]),
        ...(uint64Fill.mock.instances as unknown as BigUint64Array[]),
      ].filter((values) => values.length === valid.grid.cellCount);
      expect(allocated.length).toBeGreaterThanOrEqual(12);
      expect(allocated.every((values) => everyTypedValueIsZero(values))).toBe(
        true,
      );
    } finally {
      uint8Fill.mockRestore();
      uint16Fill.mockRestore();
      uint32Fill.mockRestore();
      int32Fill.mockRestore();
      uint64Fill.mockRestore();
    }
  });

  it("rejects a missing canonical neighbor even when every remaining edge is reciprocal", () => {
    const malformed = fixture();
    const neighbors = new Int32Array(malformed.grid.neighbors);
    const right = neighbors[0]!;
    expect(right).toBe(1);
    neighbors[0] = -1;
    neighbors[right * 6 + 3] = -1;

    expect(() => deriveGreaterRealmHydrologyAuthority({
      ...malformed,
      grid: Object.freeze({ ...malformed.grid, neighbors }),
    })).toThrow("GREATER_REALM_HYDROLOGY_GRID_INVALID");
  });

  it("rejects an isolated marsh component and can explicitly retire successful authority", () => {
    const isolated = fixture();
    isolated.marshMask.fill(0);
    isolated.marshMask[8] = 1;
    isolated.flowReceiver[8] = -1;
    expect(() => deriveGreaterRealmHydrologyAuthority(isolated)).toThrow(
      "GREATER_REALM_HYDROLOGY_MARSH_CONNECTIVITY_INVARIANT",
    );

    const authority = deriveGreaterRealmHydrologyAuthority(fixture());
    expect(authority.bankSeed.some((value) => value !== 0)).toBe(true);
    authority.clear();
    for (const values of [
      authority.waterRegime,
      authority.waterBodyId,
      authority.depthClass,
      authority.surfaceLevel,
      authority.downstream,
      authority.flowAccumulation,
      authority.bankSeed,
      authority.generationVersion,
    ])
      expect(everyTypedValueIsZero(values)).toBe(true);
    expect(authority.metrics.waterCellCountsByRegime).toEqual([
      0, 1, 1, 2, 1, 1, 1,
    ]);
  });

  it("keeps adjacent unequal standing-water levels fatal", () => {
    const incompatible = fixture();
    incompatible.waterRegime[2] = GREATER_REALM_WATER_REGIME_ID.SEA;

    expect(() => deriveGreaterRealmHydrologyAuthority(incompatible)).toThrow(
      "GREATER_REALM_HYDROLOGY_BODY_SURFACE_INVARIANT",
    );
  });

  it("keeps an ocean body isolated from the active boundary fatal", () => {
    const grid = indexGreaterRealmAxialGrid([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
    const center = grid.indexOf({ q: 0, r: 0 });
    const waterRegime = new Uint8Array(grid.cellCount);
    waterRegime[center] = GREATER_REALM_WATER_REGIME_ID.OCEAN;
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(100);
    elevation[center] = -100;
    const flowAccumulation = new BigUint64Array(grid.cellCount);
    flowAccumulation.fill(1n);

    expect(() => deriveGreaterRealmHydrologyAuthority({
      grid,
      seed: SEED,
      waterRegime,
      marshMask: new Uint8Array(grid.cellCount),
      elevation,
      filledElevation: new Int32Array(elevation),
      flowReceiver: new Int32Array(grid.cellCount).fill(-1),
      flowAccumulation,
      seaLevel: 0,
    })).toThrow("GREATER_REALM_HYDROLOGY_BODY_SURFACE_INVARIANT");
  });
});
