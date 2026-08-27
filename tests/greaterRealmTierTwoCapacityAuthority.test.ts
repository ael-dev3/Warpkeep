// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateGreaterRealmCandidate } from '../scripts/atlas/greater-realm-candidate-generator';
import { clearGreaterRealmPrivateCandidateBuffers } from '../scripts/atlas/greater-realm-candidate-package';

// The candidate itself is intentionally full-size. Hosted two-worker runs can
// overlap it with another 100k+ cell replay, so retain a bounded budget that
// covers scheduler contention without weakening any authority assertion.
const FULL_CANDIDATE_TIER_TWO_TIMEOUT_MS = 120_000;

function publicRoot(label: string): Uint8Array {
  return Uint8Array.from(createHash('sha256').update(`${label}\0`, 'utf8').digest());
}

function publicRepairRoot(label: string): Uint8Array {
  return Uint8Array.from(createHash('sha256')
    .update(label, 'utf8')
    .update(Uint8Array.of(92, 48))
    .digest());
}

describe('Greater Realm Tier-II capacity authority', () => {
  it('retains one fordable Tier-II spine between both dry strategic frontiers', () => {
    const rootSeed = publicRoot('greater-realm-ordinary-parent-a');
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

  it('reclassifies post-hydrology topography while preserving repair ownership', () => {
    const rootSeed = publicRepairRoot('greater-realm-lowlands-repair-public-g');
    const visitedLanes: Array<'ordinary' | 'lowlands-repair'> = [];
    let candidate: ReturnType<typeof generateGreaterRealmCandidate> | undefined;
    try {
      candidate = generateGreaterRealmCandidate({
        rootSeed,
        candidateOrdinal: 18,
        onGateApronSearchLane: lane => visitedLanes.push(lane),
      });

      expect(visitedLanes).toEqual(['ordinary', 'lowlands-repair']);
      let mutatedReserveCellCount = 0;
      for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
        if (
          candidate.legacyLowlandsReserveCell[cell] === 1
          && candidate.regionId[cell] !== 0
        ) mutatedReserveCellCount += 1;
      }
      expect(mutatedReserveCellCount).toBe(0);

      expect(candidate.aggregate.eligible).toBe(true);
      expect(candidate.aggregate.gateCount).toBe(18);
      expect(candidate.aggregate.proofs.gateApproaches).toBe(true);
      expect(candidate.aggregate.proofs.gateGraph).toBe(true);
      expect(candidate.aggregate.proofs.regionGraph).toBe(true);
      expect(candidate.aggregate.proofs.regionPassableLand).toBe(true);
      expect(candidate.privateMetrics.topographicQa.biomeElevationConsistency).toMatchObject({
        inconsistentCellCount: 0,
        highGradientMarshCellCount: 0,
        marshClassificationMismatchCount: 0,
      });
      expect(candidate.privateMetrics.topographicQa.regionalHydrogeomorphology.proof).toBe(true);
      expect(candidate.privateMetrics.eligibilityFailureCodes).toEqual([]);

    } finally {
      rootSeed.fill(0);
      if (candidate) clearGreaterRealmPrivateCandidateBuffers(candidate);
    }
  }, FULL_CANDIDATE_TIER_TWO_TIMEOUT_MS);
});
