// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_REVIEWED_CHUNK_AXIS_SPAN,
  GREATER_REALM_CHUNK_AXIS_SPAN_CANDIDATES,
  GREATER_REALM_CHUNK_BENCHMARK_VERSION,
  benchmarkGreaterRealmChunkPartition,
} from '../scripts/atlas/greater-realm-chunk-benchmark';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';

function disc(radius: number) {
  const coordinates: Array<Readonly<{ q: number; r: number }>> = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) {
      // Carve an asymmetric coastline while retaining enough complete chunks
      // to exercise the same partition decision as the private continent.
      if (q > radius - 5 && r < -8) continue;
      if (r > radius - 4 && q < -11) continue;
      coordinates.push(Object.freeze({ q, r }));
    }
  }
  return indexGreaterRealmAxialGrid(coordinates);
}

describe('Greater Realm chunk benchmark', () => {
  it('selects the measured 225-cell axial bin deterministically', () => {
    const grid = disc(72);
    const first = benchmarkGreaterRealmChunkPartition({ grid, canvasRadius: 72 });
    const replay = benchmarkGreaterRealmChunkPartition({
      grid: indexGreaterRealmAxialGrid([...Array(grid.cellCount)].map((_, index) => ({
        q: grid.q[index]!,
        r: grid.r[index]!,
      })).reverse()),
      canvasRadius: 72,
    });

    expect(first.version).toBe(GREATER_REALM_CHUNK_BENCHMARK_VERSION);
    expect(GREATER_REALM_CHUNK_AXIS_SPAN_CANDIDATES).toEqual([14, 15, 16]);
    expect(first.selectedAxisSpan).toBe(GREATER_REALM_REVIEWED_CHUNK_AXIS_SPAN);
    expect(first.rows.map(row => row.nominalCellCapacity)).toEqual([196, 225, 256]);
    expect(first.rows.find(row => row.axisSpan === 15)?.medianPopulation)
      .toBeGreaterThanOrEqual(192);
    expect(first.rows.find(row => row.axisSpan === 15)?.p95Population)
      .toBeLessThanOrEqual(256);
    expect(first.proof).toBe(true);
    expect(replay).toEqual(first);
  });

  it('fails closed for malformed grids and canvas bounds', () => {
    const grid = disc(20);
    const malformed = {
      ...grid,
      neighbors: new Int32Array(grid.neighbors),
    };
    malformed.neighbors[0] = grid.cellCount;
    expect(() => benchmarkGreaterRealmChunkPartition({
      grid: malformed,
      canvasRadius: 20,
    })).toThrow('GREATER_REALM_CHUNK_BENCHMARK_INPUT_INVALID');
    expect(() => benchmarkGreaterRealmChunkPartition({
      grid,
      canvasRadius: 1,
    })).toThrow('GREATER_REALM_CHUNK_BENCHMARK_COORDINATE_INVALID');
  });
});
