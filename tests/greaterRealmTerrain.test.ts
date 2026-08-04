import { Buffer } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

import {
  accumulateGreaterRealmSingleFlow,
  assertGreaterRealmSingleFlow,
  createGreaterRealmMultiscaleIntegerField,
  digestGreaterRealmTerrainStage,
  erodeGreaterRealmThermally,
  GREATER_REALM_AXIAL_DIRECTIONS,
  greaterRealmAxialNeighbors,
  greaterRealmCounterRandomU32,
  greaterRealmHexDistance,
  greaterRealmTerrainChannelId,
  indexGreaterRealmAxialGrid,
  priorityFloodGreaterRealmHexGrid,
  routeGreaterRealmSingleFlow,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

function axialDistance(coordinate: AxialCoordinate): number {
  return greaterRealmHexDistance(coordinate);
}

function hexDisc(radius: number): AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const coordinate = { q, r };
      if (axialDistance(coordinate) <= radius) coordinates.push(coordinate);
    }
  }
  return coordinates;
}

function valuesByCoordinate(
  grid: ReturnType<typeof indexGreaterRealmAxialGrid>,
  values: Readonly<Int32Array>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(Array.from({ length: grid.cellCount }, (_, index) => [
    `${grid.q[index]},${grid.r[index]}`,
    values[index],
  ]));
}

describe('Greater Realm deterministic terrain core', () => {
  it('canonically indexes axial cells and stores the six established neighbor directions', () => {
    const coordinates = hexDisc(1);
    const grid = indexGreaterRealmAxialGrid([...coordinates].reverse());
    const center = grid.indexOf({ q: 0, r: 0 });

    expect(grid.cellCount).toBe(7);
    expect(GREATER_REALM_AXIAL_DIRECTIONS).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ]);
    expect(greaterRealmAxialNeighbors({ q: 0, r: 0 })).toEqual(
      GREATER_REALM_AXIAL_DIRECTIONS,
    );
    expect(greaterRealmHexDistance({ q: -2, r: 1 }, { q: 1, r: -1 })).toBe(3);
    expect(Array.from(grid.neighbors.slice(center * 6, center * 6 + 6)))
      .toEqual(GREATER_REALM_AXIAL_DIRECTIONS.map((coordinate) => grid.indexOf(coordinate)));
  });

  it('can retire the private coordinate lookup without mutating canonical arrays', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(1));
    const q = new Int32Array(grid.q);
    const r = new Int32Array(grid.r);
    const neighbors = new Int32Array(grid.neighbors);

    expect(grid.indexOf({ q: 0, r: 0 })).toBeGreaterThanOrEqual(0);
    expect(grid.clearIndex).toBeTypeOf('function');
    grid.clearIndex?.();

    expect(grid.indexOf({ q: 0, r: 0 })).toBe(-1);
    expect(grid.q).toEqual(q);
    expect(grid.r).toEqual(r);
    expect(grid.neighbors).toEqual(neighbors);
  });

  it('uses counter-addressed randomness without Math.random or traversal-order dependence', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('MATH_RANDOM_MUST_NOT_BE_USED');
    });
    try {
      const coordinates = hexDisc(3);
      const forwardGrid = indexGreaterRealmAxialGrid(coordinates);
      const reverseGrid = indexGreaterRealmAxialGrid([...coordinates].reverse());
      const layers = [
        { channel: 'macro-uplift', amplitude: 12_000, smoothingPasses: 8 },
        { channel: 'meso-relief', amplitude: 3_000, smoothingPasses: 2, selfWeight: 3 },
        { channel: 'local-relief', amplitude: 400, smoothingPasses: 0 },
      ] as const;
      const forward = createGreaterRealmMultiscaleIntegerField(forwardGrid, 0x1234_5678, layers);
      const reverse = createGreaterRealmMultiscaleIntegerField(reverseGrid, 0x1234_5678, layers);

      expect(valuesByCoordinate(forwardGrid, forward)).toEqual(valuesByCoordinate(reverseGrid, reverse));
      expect(digestGreaterRealmTerrainStage('relief', forwardGrid, { elevation: forward }))
        .toBe(digestGreaterRealmTerrainStage('relief', reverseGrid, { elevation: reverse }));

      const channel = greaterRealmTerrainChannelId('order-proof');
      const addresses = coordinates.map((coordinate, index) => ({ ...coordinate, index }));
      const first = new Map(addresses.map((address) => [
        `${address.q},${address.r},${address.index}`,
        greaterRealmCounterRandomU32(7, channel, address.q, address.r, address.index),
      ]));
      const second = new Map([...addresses].reverse().map((address) => [
        `${address.q},${address.r},${address.index}`,
        greaterRealmCounterRandomU32(7, channel, address.q, address.r, address.index),
      ]));
      expect(second).toEqual(first);
      expect(greaterRealmCounterRandomU32(
        [7, 0x1111_1111, 0x2222_2222, 0x3333_3333],
        channel,
        4,
        -2,
      )).not.toBe(greaterRealmCounterRandomU32([7, 0, 0, 0], channel, 4, -2));
      expect(greaterRealmCounterRandomU32(
        [0x0123_4567, 0x89ab_cdef, 0xfedc_ba98, 0x7654_3210],
        0xdeca_fbad,
        -42,
        77,
        9,
      )).toBe(4_088_950_175);
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('fills an enclosed depression and gives every cell a flat-safe path to an outlet', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(2));
    const elevation = new Int32Array(grid.cellCount);
    for (let index = 0; index < grid.cellCount; index += 1) {
      const distance = axialDistance({ q: grid.q[index]!, r: grid.r[index]! });
      elevation[index] = distance === 0 ? -8 : distance === 1 ? 12 : 0;
    }

    const flood = priorityFloodGreaterRealmHexGrid(grid, elevation);
    const routing = routeGreaterRealmSingleFlow(grid, flood);
    const center = grid.indexOf({ q: 0, r: 0 });

    expect(elevation[center]).toBe(-8);
    expect(flood.filledElevation[center]).toBe(12);
    assertGreaterRealmSingleFlow(grid, flood.filledElevation, routing);

    for (let start = 0; start < grid.cellCount; start += 1) {
      let cell = start;
      let steps = 0;
      while (routing.receiver[cell]! >= 0) {
        const receiver = routing.receiver[cell]!;
        expect(flood.filledElevation[receiver]).toBeLessThanOrEqual(flood.filledElevation[cell]);
        expect(routing.rank[receiver]).toBeLessThan(routing.rank[cell]);
        cell = receiver;
        steps += 1;
        expect(steps).toBeLessThan(grid.cellCount);
      }
      expect(routing.outlets[cell]).toBe(1);
    }
  });

  it('builds an acyclic accumulation graph whose outlet totals conserve all runoff', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(3));
    const elevation = createGreaterRealmMultiscaleIntegerField(grid, 99, [
      { channel: 'drainage-test', amplitude: 10_000, smoothingPasses: 3 },
    ]);
    const flood = priorityFloodGreaterRealmHexGrid(grid, elevation);
    const routing = routeGreaterRealmSingleFlow(grid, flood);
    const local = new Uint32Array(grid.cellCount);
    local.fill(7);
    const accumulation = accumulateGreaterRealmSingleFlow(
      grid,
      flood.filledElevation,
      routing,
      local,
    );

    let outletTotal = 0n;
    for (let index = 0; index < grid.cellCount; index += 1) {
      if (routing.outlets[index] === 1) outletTotal += accumulation[index]!;
      const receiver = routing.receiver[index]!;
      if (receiver < 0) continue;
      expect(flood.filledElevation[receiver]).toBeLessThanOrEqual(flood.filledElevation[index]);
      expect(routing.rank[receiver]).toBeLessThan(routing.rank[index]);
    }
    expect(outletTotal).toBe(BigInt(grid.cellCount * 7));
  });

  it('applies thermal erosion synchronously without mutating input or changing total material', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(2));
    const elevation = new Int32Array(grid.cellCount);
    const center = grid.indexOf({ q: 0, r: 0 });
    elevation[center] = 12_000;
    const original = new Int32Array(elevation);

    const result = erodeGreaterRealmThermally(grid, elevation, {
      iterations: 12,
      talus: 100,
      transferNumerator: 1,
      transferDenominator: 16,
    });

    expect(elevation).toEqual(original);
    expect(result.elevation).not.toEqual(original);
    expect(result.elevation[center]).toBeLessThan(original[center]);
    expect(result.movedMaterial).toBeGreaterThan(0n);
    expect(result.initialMass).toBe(12_000n);
    expect(result.finalMass).toBe(result.initialMass);
    expect(Array.from(result.elevation).reduce((sum, value) => sum + BigInt(value), 0n))
      .toBe(result.initialMass);
  });

  it('makes stage evidence sensitive to field values and integer array types', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(1));
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(5);
    const same = digestGreaterRealmTerrainStage('bedrock', grid, { elevation });
    const changed = new Int32Array(elevation);
    changed[0] += 1;

    expect(same).toMatch(/^[0-9a-f]{64}$/);
    expect(digestGreaterRealmTerrainStage('bedrock', grid, { elevation })).toBe(same);
    expect(digestGreaterRealmTerrainStage('bedrock', grid, { elevation: changed })).not.toBe(same);
    expect(digestGreaterRealmTerrainStage('bedrock', grid, {
      elevation: new Uint32Array(elevation),
    })).not.toBe(same);
    expect(digestGreaterRealmTerrainStage('bedrock', grid, {
      zeta: new Uint8Array(grid.cellCount),
      alpha: elevation,
    })).toBe(digestGreaterRealmTerrainStage('bedrock', grid, {
      alpha: elevation,
      zeta: new Uint8Array(grid.cellCount),
    }));
  });

  it('zeroes every owned metadata and encoded-field buffer after stage hashing', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(1));
    const elevation = new Int32Array(grid.cellCount);
    elevation.fill(0x1020_3040);
    const fillSpy = vi.spyOn(Buffer.prototype, 'fill');

    try {
      expect(digestGreaterRealmTerrainStage('zeroization-proof', grid, { elevation }))
        .toMatch(/^[0-9a-f]{64}$/);
      const clearedBuffers = fillSpy.mock.instances.filter(Buffer.isBuffer);
      expect(clearedBuffers.length).toBeGreaterThanOrEqual(12);
      expect(clearedBuffers.some(buffer => buffer.length === elevation.byteLength)).toBe(true);
      expect(clearedBuffers.every(buffer => buffer.every(byte => byte === 0))).toBe(true);
    } finally {
      fillSpy.mockRestore();
    }
  });
});
