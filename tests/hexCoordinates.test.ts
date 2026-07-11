import { describe, expect, it } from 'vitest';

import {
  axialToCube,
  axialToWorld,
  cubeToAxial,
  hexDisc,
  hexDistance,
  hexKey,
  hexNeighbors,
  parseHexKey,
  worldToNearestAxial
} from '../src/game/map/hexCoordinates';

describe('pointy-top axial hex coordinates', () => {
  it('enumerates exactly 19 unique coordinates in a stable radius-two disc', () => {
    const disc = hexDisc({ q: 0, r: 0 }, 2);
    const keys = disc.map(hexKey);

    expect(disc).toHaveLength(19);
    expect(new Set(keys).size).toBe(19);
    expect(disc).toEqual([...disc].sort((first, second) => first.q - second.q || first.r - second.r));
    expect(disc.every((coord) => hexDistance({ q: 0, r: 0 }, coord) <= 2)).toBe(true);
  });

  it('round-trips axial coordinates through cube coordinates and stable keys', () => {
    const coordinate = { q: -2, r: 1 };

    expect(cubeToAxial(axialToCube(coordinate))).toEqual(coordinate);
    expect(hexKey(coordinate)).toBe('-2,1');
    expect(parseHexKey('-2,1')).toEqual(coordinate);
    expect(parseHexKey('not-a-coordinate')).toBeNull();
  });

  it('uses six canonical neighbors at distance one', () => {
    const origin = { q: 0, r: 0 };
    const neighbors = hexNeighbors(origin);

    expect(neighbors).toHaveLength(6);
    expect(new Set(neighbors.map(hexKey)).size).toBe(6);
    expect(neighbors.every((neighbor) => hexDistance(origin, neighbor) === 1)).toBe(true);
  });

  it('round-trips pointy-top world centers back to their nearest axial cell', () => {
    const coordinates = [
      { q: 0, r: 0 },
      { q: 2, r: -1 },
      { q: -2, r: 1 },
      { q: 1, r: 1 }
    ] as const;

    coordinates.forEach((coordinate) => {
      const world = axialToWorld(coordinate, 1);
      expect(worldToNearestAxial(world, 1)).toEqual(coordinate);
    });
  });

  it('measures distance symmetrically through cube space', () => {
    const first = { q: -2, r: 1 };
    const second = { q: 1, r: -1 };

    expect(hexDistance(first, second)).toBe(hexDistance(second, first));
    expect(hexDistance(first, second)).toBe(3);
  });
});
