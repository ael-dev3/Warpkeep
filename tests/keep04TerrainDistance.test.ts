import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createKeep04TerrainGeometry, distanceToPolyline, insideField, keep04RiverDistance, keep04RoadDistance, nearLot,
  KEEP04_FIELDS, KEEP04_LOTS, KEEP04_RIVER, KEEP04_ROADS, KEEP04_TERRAIN_EXTENT,
} from '../src/components/keep04/keep04Terrain';

// The original per-query implementations, kept here as the reference.
const referenceRiver = (x: number, z: number) => distanceToPolyline(x, z, KEEP04_RIVER).distance;
const referenceRoad = (x: number, z: number) => Math.min(...KEEP04_ROADS.map(road => distanceToPolyline(x, z, road).distance));
const referenceInsideField = (x: number, z: number, margin: number) => KEEP04_FIELDS.find(field => {
  const cos = Math.cos(field.yaw); const sin = Math.sin(field.yaw); const dx = x - field.x; const dz = z - field.z;
  return Math.abs(dx * cos - dz * sin) <= field.w / 2 + margin && Math.abs(dx * sin + dz * cos) <= field.d / 2 + margin;
}) ?? null;
const RADII = { cottage: 6, barn: 8, windmill: 7, watermill: 8, pasture: 14, pond: 11, grove: 6 } as const;
const referenceNearLot = (x: number, z: number, margin: number) => KEEP04_LOTS.some(lot => Math.hypot(x - lot.x, z - lot.z) < RADII[lot.kind] + margin);

function samplePoints() {
  const points: Array<readonly [number, number]> = [];
  for (let x = -KEEP04_TERRAIN_EXTENT - 12; x <= KEEP04_TERRAIN_EXTENT + 12; x += 3.7) {
    for (let z = -KEEP04_TERRAIN_EXTENT - 12; z <= KEEP04_TERRAIN_EXTENT + 12; z += 3.7) points.push([x, z]);
  }
  let seed = 0x9e3779b9;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 4000; i++) points.push([(random() - .5) * 600, (random() - .5) * 600]);
  // Points on and right beside the authored lines, where nearest segments compete.
  for (const line of [KEEP04_RIVER, ...KEEP04_ROADS]) for (const [x, z] of line) points.push([x, z], [x + .01, z - .01], [x + 3.3, z + 2.2]);
  return points;
}

describe('keep vale terrain queries', () => {
  it('return exactly the original river and road distances', () => {
    for (const [x, z] of samplePoints()) {
      expect(Object.is(keep04RiverDistance(x, z), referenceRiver(x, z)), `river ${x},${z}`).toBe(true);
      expect(Object.is(keep04RoadDistance(x, z), referenceRoad(x, z)), `road ${x},${z}`).toBe(true);
      // Repeating a query (the memo path) returns the same value.
      expect(Object.is(keep04RiverDistance(x, z), referenceRiver(x, z))).toBe(true);
    }
  });

  it('keep the original field and lot membership', () => {
    for (const [x, z] of samplePoints()) for (const margin of [0, .5, 1.5, 4]) {
      expect(insideField(x, z, margin)).toBe(referenceInsideField(x, z, margin));
      expect(nearLot(x, z, margin)).toBe(referenceNearLot(x, z, margin));
    }
  });

  it('build the same terrain bytes at every quality', () => {
    // Pinned from the per-query implementation before the indexed queries replaced it.
    const digests = Object.fromEntries((['high', 'balanced', 'reduced'] as const).map(quality => {
      const geometry = createKeep04TerrainGeometry(quality);
      const hash = createHash('sha256');
      for (const name of ['position', 'color', 'normal'] as const) hash.update(new Uint8Array((geometry.getAttribute(name).array as Float32Array).buffer));
      hash.update(new Uint8Array(new Uint32Array(geometry.getIndex()!.array as ArrayLike<number>).buffer));
      geometry.dispose();
      return [quality, hash.digest('hex')];
    }));
    expect(digests).toEqual(TERRAIN_DIGESTS);
  });
});

const TERRAIN_DIGESTS = {
  high: '61f7a83fcf5a7e231e15912ff8224952fbb8a61c7e1672e64577f7ff5c8416b6',
  balanced: '7acae83183884718ab38e8c18305830d2c1fbf1532f9ce102ba7f5e4ee31d83d',
  reduced: 'a552a88f0e26fe7a89de4123030d98ed11b8815532164ec78533a0e76f4b1984',
};
