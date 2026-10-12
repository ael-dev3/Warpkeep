import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  clearGreaterRealmCandidateSecret,
  generateGreaterRealmCandidate,
  type GreaterRealmPrivateCandidate,
} from '../scripts/atlas/greater-realm-candidate-generator';

it('measures regional topology from the final marsh and barrier authority', () => {
  const root = Uint8Array.from(createHash('sha256')
    .update('greater-realm-ordinary-parent-a\0').digest());
  let candidate: GreaterRealmPrivateCandidate | undefined;
  let seen: Uint8Array | undefined;
  try {
    candidate = generateGreaterRealmCandidate({ rootSeed: root, candidateOrdinal: 10 });
    const current = candidate;
    const counts = Array<number>(10).fill(0);
    const largest = Array<number>(10).fill(0);
    seen = new Uint8Array(current.grid.cellCount);
    const passable = (cell: number) => (
      [0, 3, 4].includes(current.waterRegime[cell]!) && current.barrier[cell] === 0
    );
    for (let cell = 0; cell < current.grid.cellCount; cell++) {
      if (!passable(cell)) continue;
      const region = current.regionId[cell]!;
      counts[region]++;
      if (seen[cell]) continue;
      const queue = [cell];
      seen[cell] = 1;
      for (let head = 0; head < queue.length; head++) {
        for (let direction = 0; direction < 6; direction++) {
          const neighbor = current.grid.neighbors[queue[head]! * 6 + direction]!;
          if (neighbor < 0 || seen[neighbor] || current.regionId[neighbor] !== region
            || !passable(neighbor)) continue;
          seen[neighbor] = 1;
          queue.push(neighbor);
        }
      }
      largest[region] = Math.max(largest[region]!, queue.length);
    }
    const shares = counts.map((count, region) => (
      count ? Math.round(largest[region]! * 10_000 / count) : 0
    ));
    expect(current.waterRegime.some(value => value === 6)).toBe(true);
    expect(current.privateMetrics.tierThreePassableLandCells).toBe(counts[9]);
    expect(current.privateMetrics.smallestOtherRegionPassableLandCells)
      .toBe(Math.min(...counts.slice(0, 9)));
    expect(current.privateMetrics.largestPassableRegionSharesBasisPoints).toEqual(shares);
    expect(current.aggregate.proofs.regionPassableLand).toBe(shares.every((share, region) => (
      region < 6 ? share >= (region === 4 ? 5_500 : 8_000)
        : region < 9 ? share >= 8_500 : share >= 9_000
    )));
  } finally {
    root.fill(0);
    seen?.fill(0);
    if (candidate) clearGreaterRealmCandidateSecret(candidate);
  }
}, 120_000);
