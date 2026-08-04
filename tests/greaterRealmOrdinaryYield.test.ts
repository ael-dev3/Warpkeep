// @vitest-environment node

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateGreaterRealmCandidate } from '../scripts/atlas/greater-realm-candidate-generator';
import { clearGreaterRealmPrivateCandidateBuffers } from '../scripts/atlas/greater-realm-candidate-package';

function ordinaryRoot(label: string): Uint8Array {
  return Uint8Array.from(createHash('sha256').update(`${label}\0`, 'utf8').digest());
}

describe('Greater Realm ordinary deterministic candidate yield', () => {
  it('retains a deterministic eligible candidate after generator hardening', () => {
    const cases = [
      ['greater-realm-yield-regression-b', 0],
    ] as const;

    for (const [label, candidateOrdinal] of cases) {
      const rootSeed = ordinaryRoot(label);
      let candidate: ReturnType<typeof generateGreaterRealmCandidate> | undefined;
      try {
        candidate = generateGreaterRealmCandidate({ rootSeed, candidateOrdinal });
        expect(candidate.aggregate.eligible, `${label}/${candidateOrdinal}`).toBe(true);
        expect(candidate.privateMetrics.eligibilityFailureCodes).toEqual([]);
        expect(candidate.gates).toHaveLength(18);
        expect(candidate.grid.cellCount).toBeGreaterThanOrEqual(100_000);
        expect(candidate.grid.cellCount).toBeLessThanOrEqual(150_000);
      } finally {
        rootSeed.fill(0);
        if (candidate) clearGreaterRealmPrivateCandidateBuffers(candidate);
      }
    }
  }, 60_000);
});
