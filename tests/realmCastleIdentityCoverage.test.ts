import { describe, expect, it } from 'vitest';

import {
  realmCastleIdentityCoverageValid,
  type RealmCastleIdentityCoverageInput
} from '../src/components/realm/realmCastleIdentityClusters';

function coverage(
  overrides: Partial<RealmCastleIdentityCoverageInput> = {}
): RealmCastleIdentityCoverageInput {
  return {
    eligibleCastleIds: [1, 2, 3, 4],
    individualCastleIds: [1],
    clusters: [{ castleIds: [2, 3], representativeCastleId: 2 }],
    overflowCastleIds: [4],
    exploreCastleIds: [1, 2, 3, 4, 5],
    ...overrides
  };
}

describe('realm castle identity coverage', () => {
  it('accepts a unique, disjoint, complete map outcome with Explore coverage', () => {
    expect(realmCastleIdentityCoverageValid(coverage())).toBe(true);
  });

  it.each([
    ['duplicate eligible ID', { eligibleCastleIds: [1, 2, 2, 3, 4] }],
    ['duplicate individual ID', { individualCastleIds: [1, 1] }],
    ['duplicate Explore ID', { exploreCastleIds: [1, 2, 3, 4, 4] }],
    ['overlapping outcomes', { individualCastleIds: [1, 2] }],
    ['duplicate cluster membership', {
      clusters: [
        { castleIds: [2, 3], representativeCastleId: 2 },
        { castleIds: [3], representativeCastleId: 3 }
      ]
    }],
    ['missing outcome', { overflowCastleIds: [] }],
    ['extra outcome', { overflowCastleIds: [4, 5] }],
    ['missing Explore identity', { exploreCastleIds: [1, 2, 3] }],
    ['invalid cluster representative', {
      clusters: [{ castleIds: [2, 3], representativeCastleId: 4 }]
    }],
    ['invalid identifier', { overflowCastleIds: [0] }]
  ] as const)('rejects %s', (_label, overrides) => {
    expect(realmCastleIdentityCoverageValid(coverage(overrides))).toBe(false);
  });
});
