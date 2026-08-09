// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateGreaterRealmCandidate } from '../scripts/atlas/greater-realm-candidate-generator';
import { clearGreaterRealmPrivateCandidateBuffers } from '../scripts/atlas/greater-realm-candidate-package';

// The candidate itself is intentionally full-size. Hosted two-worker runs can
// overlap it with another 100k+ cell replay, so retain a bounded budget that
// covers scheduler contention without weakening any authority assertion.
const FULL_CANDIDATE_TIER_TWO_TIMEOUT_MS = 60_000;

describe('Greater Realm Tier-II capacity authority', () => {
  it('retains one fordable Tier-II spine between both dry strategic frontiers', () => {
    const rootSeed = Uint8Array.from(createHash('sha256')
      .update('greater-realm-ordinary-parent-a\0', 'utf8')
      .digest());
    let candidate: ReturnType<typeof generateGreaterRealmCandidate> | undefined;
    try {
      candidate = generateGreaterRealmCandidate({ rootSeed, candidateOrdinal: 9 });
      for (const region of [6, 7, 8]) {
        const seen = new Uint8Array(candidate.grid.cellCount);
        const queue: Uint32Array = new Uint32Array(candidate.grid.cellCount);
        let head = 0;
        let tail = 0;
        for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
          if (
            candidate.regionId[cell] !== region
            || candidate.waterRegime[cell] !== 0
          ) continue;
          let touchesOuter = false;
          for (let direction = 0; direction < 6; direction += 1) {
            const neighbor = candidate.grid.neighbors[cell * 6 + direction]!;
            if (
              neighbor >= 0
              && candidate.tierId[neighbor] === 1
              && candidate.waterRegime[neighbor] === 0
            ) {
              touchesOuter = true;
              break;
            }
          }
          if (!touchesOuter) continue;
          seen[cell] = 1;
          queue[tail++] = cell;
        }
        let reachesInner = false;
        while (head < tail && !reachesInner) {
          const cell: number = queue[head++]!;
          for (let direction = 0; direction < 6; direction += 1) {
            const neighbor = candidate.grid.neighbors[cell * 6 + direction]!;
            if (neighbor < 0) continue;
            if (
              candidate.tierId[neighbor] === 3
              && candidate.waterRegime[neighbor] === 0
            ) {
              reachesInner = true;
              break;
            }
            if (
              seen[neighbor] === 0
              && candidate.regionId[neighbor] === region
              && (
                candidate.waterRegime[neighbor] === 0
                || candidate.waterRegime[neighbor] === 3
                || candidate.waterRegime[neighbor] === 4
              )
            ) {
              seen[neighbor] = 1;
              queue[tail++] = neighbor;
            }
          }
        }
        expect(reachesInner, `Tier-II region ${region}`).toBe(true);
      }
    } finally {
      rootSeed.fill(0);
      if (candidate) clearGreaterRealmPrivateCandidateBuffers(candidate);
    }
  }, FULL_CANDIDATE_TIER_TWO_TIMEOUT_MS);
});
