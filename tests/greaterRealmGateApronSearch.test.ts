import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_GATE_APRON_MAX_EDGE_CANDIDATES,
  GREATER_REALM_GATE_APRON_MAX_BUNDLE_OPTIONS,
  GREATER_REALM_GATE_APRON_MAX_CHILD_BUNDLE_OPTIONS,
  GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS,
  GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT,
  assertGreaterRealmRepairOwnershipUnchanged,
  chooseGreaterRealmLowlandsRepairSiblingPairs,
  greaterRealmLowlandsRepairGateEdgeEligible,
  measureGreaterRealmStrategicShape,
  rankGreaterRealmLowlandsRepairBorrowedBundleOptions,
  rankGreaterRealmLowlandsRepairBundleOptions,
  selectGreaterRealmLowlandsRepairBundleOptions,
  selectGreaterRealmGateApronChildBundleOptions,
  runGreaterRealmGateApronSearchLanes,
  selectBalancedGreaterRealmGateApronPairs,
  sealGreaterRealmRepairBarrierPockets,
  searchGreaterRealmRankedSiblingAlternatives,
  type GreaterRealmRankedSiblingSearchOption,
} from '../scripts/atlas/greater-realm-candidate-generator';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';

type SyntheticOption = GreaterRealmRankedSiblingSearchOption & Readonly<{
  id: string;
}>;

type SyntheticDescriptor = Readonly<{
  id: string;
  footprints: readonly SyntheticOption[];
}>;

const option = (
  id: string,
  tierOneCells: readonly number[],
  tierTwoCells: readonly number[],
): SyntheticOption => Object.freeze({
  id,
  tierOneCells: Object.freeze([...tierOneCells]),
  tierTwoCells: Object.freeze([...tierTwoCells]),
});

const descriptor = (
  id: string,
  ...footprints: readonly SyntheticOption[]
): SyntheticDescriptor => Object.freeze({
  id,
  footprints: Object.freeze([...footprints]),
});

describe('Greater Realm ranked gate-apron search', () => {
  it('balances a bounded bundle frontier across edge endpoints deterministically', () => {
    const completePairs = Object.freeze(Array.from({ length: 8 }, (_, firstIndex) => firstIndex)
      .flatMap(firstIndex => Array.from(
        { length: 7 - firstIndex },
        (_, offset) => Object.freeze({
          firstIndex,
          secondIndex: firstIndex + offset + 1,
          score: firstIndex * 8 + offset,
        }),
      )));
    const selected = selectBalancedGreaterRealmGateApronPairs(completePairs, 4);
    const repeated = selectBalancedGreaterRealmGateApronPairs(completePairs, 4);
    const endpointUse = new Map<number, number>();
    for (const pair of selected) {
      endpointUse.set(pair.firstIndex, (endpointUse.get(pair.firstIndex) ?? 0) + 1);
      endpointUse.set(pair.secondIndex, (endpointUse.get(pair.secondIndex) ?? 0) + 1);
    }
    expect(selected).toEqual(repeated);
    expect(selected).toHaveLength(4);
    expect(Math.max(...endpointUse.values())).toBe(1);
    expect([...selected].map(pair => pair.score)).toEqual(
      [...selected].map(pair => pair.score).sort((first, second) => first - second),
    );
  });

  it('retains a physically novel pair beyond the endpoint-only overflow frontier', () => {
    const edgeCount = 4;
    const maximumPairs = 4;
    const pairs = Object.freeze(Array.from({ length: edgeCount - 1 }, (_, firstIndex) => (
      Array.from({ length: edgeCount - firstIndex - 1 }, (_, offset) => Object.freeze({
        firstIndex,
        secondIndex: firstIndex + offset + 1,
        score: firstIndex * edgeCount + firstIndex + offset + 1,
      }))
    )).flat());
    const endpointOnly = selectBalancedGreaterRealmGateApronPairs(pairs, maximumPairs);
    expect(pairs).toHaveLength(6);
    expect(endpointOnly).toHaveLength(maximumPairs);

    const commonFootprint = (_pair: typeof pairs[number], visitCell: (tier: 'tier-one' | 'tier-two', cell: number) => void) => {
      visitCell('tier-one', 0);
      visitCell('tier-one', 0);
    };
    const endpointAndCommonFootprint = selectBalancedGreaterRealmGateApronPairs(
      pairs,
      maximumPairs,
      commonFootprint,
    );
    const endpointAndCommonKeys = new Set(endpointAndCommonFootprint
      .map(pair => `${pair.firstIndex}:${pair.secondIndex}`));
    const physicallyNovel = pairs.find(pair => pair.firstIndex === 1 && pair.secondIndex === 3);
    expect(physicallyNovel).toMatchObject({ firstIndex: 1, secondIndex: 3 });
    expect(endpointAndCommonKeys.has('1:3')).toBe(false);
    const visitor = (pair: typeof pairs[number], visitCell: (tier: 'tier-one' | 'tier-two', cell: number) => void) => {
      visitCell('tier-one', pair === physicallyNovel ? 1 : 0);
    };
    const diverse = selectBalancedGreaterRealmGateApronPairs(
      pairs,
      maximumPairs,
      visitor,
    );

    expect(endpointAndCommonFootprint).not.toContainEqual(physicallyNovel);
    expect(diverse).toContainEqual(physicallyNovel);
    expect(pairs[0]).toEqual({ firstIndex: 0, secondIndex: 1, score: 1 });
    expect(Object.isFrozen(diverse)).toBe(true);
  });

  it('skips footprint work for untruncated pair frontiers and rejects invalid cells', () => {
    const pair = Object.freeze({ firstIndex: 0, secondIndex: 1, score: 1 });
    const unused = vi.fn(() => { throw new Error('UNUSED_PAIR_FOOTPRINT'); });
    expect(selectBalancedGreaterRealmGateApronPairs([pair], 8_192, unused)).toEqual([pair]);
    expect(unused).not.toHaveBeenCalled();

    expect(() => selectBalancedGreaterRealmGateApronPairs([
      pair,
      Object.freeze({ firstIndex: 0, secondIndex: 2, score: 2 }),
    ], 1, (_selected, visitCell) => visitCell('tier-one', -1))).toThrow(
      'GREATER_REALM_GATE_APRON_PAIR_FOOTPRINT_INVALID',
    );
  });

  it('widens endpoint capacity only when the viable pair graph has no disjoint continuation', () => {
    expect(selectBalancedGreaterRealmGateApronPairs(Object.freeze([
      Object.freeze({ firstIndex: 0, secondIndex: 1, score: 2 }),
      Object.freeze({ firstIndex: 0, secondIndex: 2, score: 1 }),
    ]), 2)).toEqual([
      { firstIndex: 0, secondIndex: 2, score: 1 },
      { firstIndex: 0, secondIndex: 1, score: 2 },
    ]);
  });

  it('rejects duplicate or malformed bundle-pair descriptors', () => {
    expect(() => selectBalancedGreaterRealmGateApronPairs(Object.freeze([
      Object.freeze({ firstIndex: 0, secondIndex: 1, score: 1 }),
      Object.freeze({ firstIndex: 0, secondIndex: 1, score: 2 }),
    ]))).toThrow('GREATER_REALM_GATE_APRON_PAIR_DUPLICATE');
    expect(() => selectBalancedGreaterRealmGateApronPairs(Object.freeze([
      Object.freeze({ firstIndex: 1, secondIndex: 1, score: 1 }),
    ]))).toThrow('GREATER_REALM_GATE_APRON_PAIR_INVALID');
  });

  it('separates immutable perimeter from passable semantic-interface compactness', () => {
    const coordinates = Array.from({ length: 91 }, (_, index) => {
      const radius = 5;
      let seen = 0;
      for (let q = -radius; q <= radius; q += 1) {
        for (let r = -radius; r <= radius; r += 1) {
          if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) > radius) continue;
          if (seen === index) return { q, r };
          seen += 1;
        }
      }
      throw new Error('synthetic hex cell missing');
    });
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const tierId = new Uint8Array(grid.cellCount);
    tierId.fill(2);
    const regionId = new Uint8Array(grid.cellCount);
    regionId.fill(6);
    const shape = measureGreaterRealmStrategicShape({
      grid,
      tierId,
      regionId,
      waterRegime: new Uint8Array(grid.cellCount),
      barrier: new Uint8Array(grid.cellCount),
    });

    expect(shape.semanticInterfaceDensityBasisPoints[6]).toBe(0);
    expect(shape.immutablePerimeterDensityBasisPoints[6]).toBeGreaterThan(0);
  });

  it('rejects adversarially interleaved passable semantic regions', () => {
    const coordinates = [];
    for (let q = -5; q <= 5; q += 1) {
      for (let r = -5; r <= 5; r += 1) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 5) {
          coordinates.push({ q, r });
        }
      }
    }
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const tierId = new Uint8Array(grid.cellCount);
    tierId.fill(2);
    const regionId = Uint8Array.from(
      coordinates,
      ({ q, r }) => (q + r) % 2 === 0 ? 6 : 7,
    );
    const shape = measureGreaterRealmStrategicShape({
      grid,
      tierId,
      regionId,
      waterRegime: new Uint8Array(grid.cellCount),
      barrier: new Uint8Array(grid.cellCount),
    });

    expect(shape.semanticInterfaceDensityBasisPoints[6]).toBeGreaterThan(1_000);
    expect(shape.semanticInterfaceDensityBasisPoints[7]).toBeGreaterThan(1_000);
    expect(shape.compactnessProof).toBe(false);
  });

  it('keeps one-cell tendrils visible to their independent proof', () => {
    const grid = indexGreaterRealmAxialGrid(Array.from(
      { length: 70 },
      (_, q) => Object.freeze({ q, r: 0 }),
    ));
    const tierId = new Uint8Array(grid.cellCount);
    tierId.fill(2);
    const regionId = new Uint8Array(grid.cellCount);
    regionId.fill(6);
    const shape = measureGreaterRealmStrategicShape({
      grid,
      tierId,
      regionId,
      waterRegime: new Uint8Array(grid.cellCount),
      barrier: new Uint8Array(grid.cellCount),
    });

    expect(shape.semanticInterfaceDensityBasisPoints[6]).toBe(0);
    expect(shape.immutablePerimeterDensityBasisPoints[6]).toBeGreaterThan(1_000);
    expect(shape.tendrilSharesBasisPoints[6]).toBeGreaterThan(150);
    expect(shape.tendrilProof).toBe(false);
  });

  it('keeps disconnected islands visible to passable-region topology', () => {
    const coordinates = [];
    for (const offsetQ of [0, 30]) {
      for (let q = -5; q <= 5; q += 1) {
        for (let r = -5; r <= 5; r += 1) {
          if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 5) {
            coordinates.push({ q: q + offsetQ, r });
          }
        }
      }
    }
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const tierId = new Uint8Array(grid.cellCount);
    tierId.fill(2);
    const regionId = new Uint8Array(grid.cellCount);
    regionId.fill(6);
    const shape = measureGreaterRealmStrategicShape({
      grid,
      tierId,
      regionId,
      waterRegime: new Uint8Array(grid.cellCount),
      barrier: new Uint8Array(grid.cellCount),
    });

    expect(shape.semanticInterfaceDensityBasisPoints[6]).toBe(0);
    expect(shape.largestPassableRegionSharesBasisPoints[6]).toBe(5_000);
    expect(shape.passableRegionProof).toBe(false);
  });

  it('seals only bounded geological pockets left inside the repair barrier', () => {
    const grid = indexGreaterRealmAxialGrid(Array.from(
      { length: 6 },
      (_, q) => Object.freeze({ q, r: 0 }),
    ));
    const regionId = new Uint8Array(grid.cellCount);
    regionId.fill(6);
    const tierId = new Uint8Array(grid.cellCount);
    tierId.fill(2);
    const waterRegime = new Uint8Array(grid.cellCount);
    const barrier = new Uint8Array(grid.cellCount);
    barrier[3] = 1;
    const geologicalBarrierBand = new Uint8Array(grid.cellCount);
    geologicalBarrierBand[4] = 1;
    geologicalBarrierBand[5] = 1;
    const tierTwoSpineOwner = new Int8Array(grid.cellCount);
    tierTwoSpineOwner.fill(-1);
    const repairImmutableCell = new Uint8Array(grid.cellCount);

    expect(sealGreaterRealmRepairBarrierPockets({
      grid,
      regionId,
      tierId,
      waterRegime,
      barrier,
      geologicalBarrierBand,
      legacyProtectedCell: new Uint8Array(grid.cellCount),
      repairImmutableCell,
      protectedApproachCells: new Set(),
      gates: Object.freeze([]),
      tierTwoSpineOwner,
    })).toEqual({ sealedCellCount: 2, sealedComponentCount: 1 });
    expect(Array.from(barrier)).toEqual([0, 0, 0, 1, 1, 1]);

    barrier.set([0, 0, 0, 1, 0, 0]);
    repairImmutableCell[4] = 1;
    expect(sealGreaterRealmRepairBarrierPockets({
      grid,
      regionId,
      tierId,
      waterRegime,
      barrier,
      geologicalBarrierBand,
      legacyProtectedCell: new Uint8Array(grid.cellCount),
      repairImmutableCell,
      protectedApproachCells: new Set(),
      gates: Object.freeze([]),
      tierTwoSpineOwner,
    })).toEqual({ sealedCellCount: 0, sealedComponentCount: 0 });
    expect(Array.from(barrier)).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it('falls through an incompatible optimum to an alternate assignment and remains bounded', () => {
    const alternatives = Object.freeze(['primary', 'alternate'] as const);
    const groups = Object.freeze({
      primary: Object.freeze([
        Object.freeze([
          option('primary-overlap', [1], [11]),
          option('primary-later', [2], [12]),
        ]),
        Object.freeze([option('primary-sibling', [1], [13])]),
      ]),
      alternate: Object.freeze([
        Object.freeze([option('alternate-first', [1], [11])]),
        Object.freeze([option('alternate-second', [3], [13])]),
      ]),
    });
    const visited: string[] = [];

    const result = searchGreaterRealmRankedSiblingAlternatives(
      alternatives,
      alternative => groups[alternative],
      (alternative, selected) => {
        visited.push(`${alternative}:${selected.map(value => value.id).join('+')}`);
        return alternative === 'alternate';
      },
      Object.freeze({ maximumSearchNodes: 64, maximumCompletePlans: 8 }),
    );

    expect(result.outcome).toBe('match');
    if (result.outcome !== 'match') throw new Error('expected match');
    expect(result.alternative).toBe('alternate');
    expect(result.options.map(value => value.id)).toEqual([
      'alternate-first',
      'alternate-second',
    ]);
    expect(visited).toEqual([
      'primary:primary-later+primary-sibling',
      'alternate:alternate-first+alternate-second',
    ]);

    let completePlans = 0;
    const exhausted = searchGreaterRealmRankedSiblingAlternatives(
      alternatives,
      alternative => groups[alternative],
      () => {
        completePlans += 1;
        return false;
      },
      Object.freeze({ maximumSearchNodes: 64, maximumCompletePlans: 1 }),
    );
    expect(exhausted).toEqual({ outcome: 'complete-plan-limit' });
    expect(completePlans).toBe(1);
  });

  it('distinguishes a complete no-match from both bounded terminal limits', () => {
    const noMatch = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['only'] as const),
      () => Object.freeze([]),
      () => false,
      Object.freeze({ maximumSearchNodes: 4, maximumCompletePlans: 4 }),
    );
    expect(noMatch).toEqual({ outcome: 'no-match' });

    const exactBoundaryNoMatch = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['only'] as const),
      () => Object.freeze([
        Object.freeze([option('only', [1], [11])]),
      ]),
      () => false,
      Object.freeze({ maximumSearchNodes: 1, maximumCompletePlans: 1 }),
    );
    expect(exactBoundaryNoMatch).toEqual({ outcome: 'no-match' });

    const nodeLimited = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['only'] as const),
      () => Object.freeze([
        Object.freeze([option('first', [1], [11])]),
        Object.freeze([option('second', [2], [12])]),
      ]),
      () => false,
      Object.freeze({ maximumSearchNodes: 1, maximumCompletePlans: 4 }),
    );
    expect(nodeLimited).toEqual({ outcome: 'search-node-limit' });

    let footprintReads = 0;
    const planLimited = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['first', 'second'] as const),
      alternative => Object.freeze([
        Object.freeze([descriptor(
          alternative,
          option(`${alternative}-footprint`, [1], [11]),
        )]),
      ]),
      () => false,
      Object.freeze({ maximumSearchNodes: 99, maximumCompletePlans: 1 }),
      value => {
        footprintReads += 1;
        return value.footprints;
      },
    );
    expect(planLimited).toEqual({ outcome: 'complete-plan-limit' });
    expect(footprintReads).toBe(1);

    let conflictTailFootprintReads = 0;
    let conflictTailAccepts = 0;
    const conflictTail = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['valid', 'conflict'] as const),
      alternative => alternative === 'valid'
        ? Object.freeze([Object.freeze([
            descriptor('valid', option('valid-footprint', [1], [11])),
          ])])
        : Object.freeze([
            Object.freeze([
              descriptor('conflict-first', option('conflict-first-footprint', [2], [12])),
            ]),
            Object.freeze([
              descriptor('conflict-second', option('conflict-second-footprint', [2], [13])),
            ]),
          ]),
      () => {
        conflictTailAccepts += 1;
        return false;
      },
      Object.freeze({ maximumSearchNodes: 99, maximumCompletePlans: 1 }),
      value => {
        conflictTailFootprintReads += 1;
        return value.footprints;
      },
    );
    expect(conflictTail).toEqual({ outcome: 'complete-plan-limit' });
    expect(conflictTailAccepts).toBe(1);
    expect(conflictTailFootprintReads).toBe(1);

    let completePlans = 0;
    const emptyTailGroups = (alternative: 'full' | 'empty-one' | 'empty-two') => (
      alternative === 'full'
        ? Object.freeze([Object.freeze([
            option('full-first', [1], [11]),
            option('full-second', [2], [12]),
            option('full-third', [3], [13]),
          ])])
        : Object.freeze([])
    );
    const exactPlanBoundaryWithEmptyTail = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['full', 'empty-one', 'empty-two'] as const),
      emptyTailGroups,
      () => {
        completePlans += 1;
        return false;
      },
      Object.freeze({ maximumSearchNodes: 99, maximumCompletePlans: 3 }),
    );
    expect(exactPlanBoundaryWithEmptyTail).toEqual({ outcome: 'no-match' });
    expect(completePlans).toBe(3);

    const exactNodeBoundaryWithEmptyTail = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['full', 'empty-one', 'empty-two'] as const),
      emptyTailGroups,
      () => false,
      Object.freeze({ maximumSearchNodes: 6, maximumCompletePlans: 99 }),
    );
    expect(exactNodeBoundaryWithEmptyTail).toEqual({ outcome: 'no-match' });
  });

  it('reaches a later ranked option without charging impossible suffix ranks', () => {
    const choices = Object.freeze([
      option('first', [1], [11]),
      option('second', [2], [12]),
      option('third', [3], [13]),
    ]);
    const visited: string[] = [];
    const result = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['only']),
      () => Object.freeze([choices]),
      (_alternative, selected) => {
        visited.push(selected[0]!.id);
        return selected[0] === choices[2];
      },
      Object.freeze({ maximumSearchNodes: 3, maximumCompletePlans: 3 }),
    );
    expect(result).toEqual({
      outcome: 'match', alternative: 'only', options: [choices[2]],
    });
    expect(visited).toEqual(['first', 'second', 'third']);
  });

  it('prunes impossible residual ranks through the real sibling-footprint adapter', () => {
    const choices = Object.freeze([
      descriptor('first', option('first-footprint', [1], [11])),
      descriptor('second', option('second-footprint', [2], [12])),
      descriptor('third', option('third-footprint', [3], [13])),
    ]);
    const sibling = descriptor('sibling', option('sibling-footprint', [4], [14]));
    const result = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['only']),
      () => Object.freeze([choices, Object.freeze([sibling])]),
      (_alternative, selected) => selected[0] === choices[2],
      Object.freeze({ maximumSearchNodes: 6, maximumCompletePlans: 3 }),
      value => value.footprints,
    );
    expect(result).toEqual({
      outcome: 'match', alternative: 'only', options: [choices[2], sibling],
    });
  });

  it('preserves every feasible plan and its established diagonal traversal order', () => {
    const first = Object.freeze([
      option('a0', [1], [11]),
      option('a1', [2], [12]),
      option('a2', [3], [13]),
    ]);
    const second = Object.freeze([
      option('b0', [4], [14]),
      option('b1', [5], [15]),
    ]);
    const visited: string[] = [];
    const result = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['only']),
      () => Object.freeze([first, second]),
      (_alternative, selected) => {
        visited.push(selected.map(value => value.id).join('+'));
        return false;
      },
      Object.freeze({ maximumSearchNodes: 99, maximumCompletePlans: 99 }),
    );
    expect(result).toEqual({ outcome: 'no-match' });
    expect(visited).toEqual([
      'a0+b0', 'a0+b1', 'a1+b0', 'a2+b0', 'a1+b1', 'a2+b1',
    ]);
  });

  it('searches sibling descriptors through their existing bundle footprints', () => {
    const overlapping = descriptor(
      'overlapping',
      option('overlapping-first', [1], [11]),
      option('overlapping-second', [2], [12]),
    );
    const fallback = descriptor(
      'fallback',
      option('fallback-first', [3], [13]),
      option('fallback-second', [4], [14]),
    );
    const sibling = descriptor(
      'sibling',
      option('sibling-first', [2], [15]),
      option('sibling-second', [5], [16]),
    );
    const visited: string[] = [];

    const result = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['only'] as const),
      () => Object.freeze([
        Object.freeze([overlapping, fallback]),
        Object.freeze([sibling]),
      ]),
      (_alternative, selected) => {
        visited.push(selected.map(value => value.id).join('+'));
        return true;
      },
      Object.freeze({ maximumSearchNodes: 16, maximumCompletePlans: 4 }),
      value => value.footprints,
    );

    expect(result.outcome).toBe('match');
    if (result.outcome !== 'match') throw new Error('expected match');
    expect(result.options.map(value => value.id)).toEqual(['fallback', 'sibling']);
    expect(visited).toEqual(['fallback+sibling']);
    expect('tierOneCells' in fallback).toBe(false);
    expect('tierTwoCells' in fallback).toBe(false);
  });

  it('prefers ordinary matches and lets bounded repair recover a valid plan', () => {
    const ordinaryMatch = vi.fn(() => Object.freeze({
      outcome: 'match' as const,
      alternative: 'ordinary',
      options: Object.freeze([]),
    }));
    const repairAfterMatch = vi.fn(() => Object.freeze({ outcome: 'no-match' as const }));
    expect(runGreaterRealmGateApronSearchLanes(ordinaryMatch, repairAfterMatch)).toEqual({
      lane: 'ordinary',
      result: { outcome: 'match', alternative: 'ordinary', options: [] },
    });
    expect(repairAfterMatch).not.toHaveBeenCalled();

    const repair = vi.fn(() => Object.freeze({
      outcome: 'match' as const,
      alternative: 'repair',
      options: Object.freeze([]),
    }));
    expect(runGreaterRealmGateApronSearchLanes(
      () => Object.freeze({ outcome: 'no-match' as const }),
      repair,
    )).toEqual({
      lane: 'lowlands-repair',
      result: { outcome: 'match', alternative: 'repair', options: [] },
    });
    expect(repair).toHaveBeenCalledTimes(1);

    for (const terminal of ['search-node-limit', 'complete-plan-limit'] as const) {
      const repairAfterLimit = vi.fn(() => Object.freeze({
        outcome: 'match' as const,
        alternative: 'repair',
        options: Object.freeze([]),
      }));
      expect(runGreaterRealmGateApronSearchLanes(
        () => Object.freeze({ outcome: terminal }),
        repairAfterLimit,
      )).toEqual({
        lane: 'lowlands-repair',
        result: { outcome: 'match', alternative: 'repair', options: [] },
      });
      expect(repairAfterLimit).toHaveBeenCalledTimes(1);

      const failedRepair = vi.fn(() => Object.freeze({ outcome: 'no-match' as const }));
      expect(runGreaterRealmGateApronSearchLanes(
        () => Object.freeze({ outcome: terminal }),
        failedRepair,
      )).toEqual({ lane: 'ordinary', result: { outcome: terminal } });
      expect(failedRepair).toHaveBeenCalledTimes(1);

      const repairLimit = terminal === 'search-node-limit'
        ? 'complete-plan-limit'
        : 'search-node-limit';
      expect(runGreaterRealmGateApronSearchLanes(
        () => Object.freeze({ outcome: terminal }),
        () => Object.freeze({ outcome: repairLimit }),
      )).toEqual({ lane: 'ordinary', result: { outcome: terminal } });
    }
  });

  it('admits only dry child-zero reserve edges with immutable Lowlands ownership', () => {
    const valid = Object.freeze({
      child: 0,
      tierOneEndpointDry: true,
      tierTwoEndpointDry: true,
      tierOneEndpointProtected: false,
      tierTwoEndpointProtected: false,
      tierOneEndpointReserve: true,
      tierTwoEndpointReserve: false,
      tierOneOriginalRegion: 0,
      tierOneTrialRegion: 0,
      tierOneCorridorProtected: false,
      tierOneCorridorForeignOwned: false,
      tierTwoCorridorProtected: false,
      tierTwoCorridorReserve: false,
    });
    expect(greaterRealmLowlandsRepairGateEdgeEligible(valid)).toBe(true);
    for (const invalid of [
      { ...valid, child: 1 },
      { ...valid, tierOneEndpointDry: false },
      { ...valid, tierTwoEndpointDry: false },
      { ...valid, tierOneEndpointProtected: true },
      { ...valid, tierTwoEndpointProtected: true },
      { ...valid, tierOneEndpointReserve: false },
      { ...valid, tierTwoEndpointReserve: true },
      { ...valid, tierOneOriginalRegion: 1 },
      { ...valid, tierOneTrialRegion: 1 },
      { ...valid, tierOneCorridorProtected: true },
      { ...valid, tierOneCorridorForeignOwned: true },
      { ...valid, tierTwoCorridorProtected: true },
      { ...valid, tierTwoCorridorReserve: true },
    ]) expect(greaterRealmLowlandsRepairGateEdgeEligible(invalid)).toBe(false);
  });

  it('ranks repair bundles deterministically and borrows only when own terrain is absent', () => {
    const bundles = Object.freeze([
      Object.freeze({ id: 'borrow-b', child: 4, score: 1, endpoint: 8 }),
      Object.freeze({ id: 'own-b', child: 2, score: 7, endpoint: 4 }),
      Object.freeze({ id: 'borrow-a', child: 1, score: 1, endpoint: 3 }),
      Object.freeze({ id: 'own-a', child: 2, score: 7, endpoint: 2 }),
      Object.freeze({ id: 'lowlands', child: 0, score: 0, endpoint: 1 }),
    ]);
    expect(rankGreaterRealmLowlandsRepairBundleOptions(
      bundles,
      2,
      value => value.child,
      value => value.score,
      value => value.endpoint,
    ).map(value => value.id)).toEqual(['own-a', 'own-b']);
    expect(rankGreaterRealmLowlandsRepairBundleOptions(
      bundles,
      3,
      value => value.child,
      value => value.score,
      value => value.endpoint,
    ).map(value => value.id)).toEqual(['borrow-a', 'borrow-b', 'own-a', 'own-b']);
    expect(rankGreaterRealmLowlandsRepairBundleOptions(
      [...bundles].reverse(),
      3,
      value => value.child,
      value => value.score,
      value => value.endpoint,
    ).map(value => value.id)).toEqual(['borrow-a', 'borrow-b', 'own-a', 'own-b']);
  });

  it('ranks borrowed fallback bundles without reusing the requested child or Lowlands', () => {
    const bundles = Object.freeze([
      Object.freeze({ id: 'borrow-b', child: 4, score: 1, endpoint: 8 }),
      Object.freeze({ id: 'own', child: 2, score: 0, endpoint: 1 }),
      Object.freeze({ id: 'borrow-a', child: 1, score: 1, endpoint: 3 }),
      Object.freeze({ id: 'lowlands', child: 0, score: 0, endpoint: 0 }),
    ]);
    const rank = (options: typeof bundles, child: number) => (
      rankGreaterRealmLowlandsRepairBorrowedBundleOptions(
        options,
        child,
        value => value.child,
        value => value.score,
        value => value.endpoint,
      ).map(value => value.id)
    );
    expect(rank(bundles, 2)).toEqual(['borrow-a', 'borrow-b']);
    expect(rank(Object.freeze([...bundles].reverse()), 2)).toEqual([
      'borrow-a',
      'borrow-b',
    ]);
    expect(rank(bundles, 0)).toEqual([]);
  });

  it('retains each child own bundles while admitting a sibling donor fallback', () => {
    const bundles = Object.freeze([
      Object.freeze({ id: 'borrow-b', child: 4, score: 1, endpoint: 8 }),
      Object.freeze({ id: 'own', child: 2, score: 0, endpoint: 1 }),
      Object.freeze({ id: 'borrow-a', child: 1, score: 1, endpoint: 3 }),
      Object.freeze({ id: 'lowlands', child: 0, score: 0, endpoint: 0 }),
    ]);
    const select = (child: number) => (
      selectGreaterRealmLowlandsRepairBundleOptions(
        bundles,
        child,
        value => value.child,
        value => value.score,
        value => value.endpoint,
        true,
      ).map(value => value.id)
    );
    expect(select(0)).toEqual(['lowlands']);
    const firstChildOptions = select(2);
    const secondChildOptions = select(3);
    expect(firstChildOptions).toEqual(['own', 'borrow-a', 'borrow-b']);
    expect(secondChildOptions).toEqual(['own', 'borrow-a', 'borrow-b']);
    const mixedOwnAndDonorPairs = firstChildOptions.flatMap(first => (
      secondChildOptions
        .filter(second => first === 'own' && second === 'borrow-b')
        .map(second => Object.freeze({ first, second }))
    ));
    expect(mixedOwnAndDonorPairs).toEqual([
      Object.freeze({ first: 'own', second: 'borrow-b' }),
    ]);
  });

  it('keeps child bundle frontiers deterministic, bounded, and represented by origin', () => {
    const ranked = Object.freeze(Array.from({ length: 270 }, (_, index) => Object.freeze({
      child: index < 260 ? 2 : index === 260 ? 4 : 6,
      score: index,
    })));
    const selected = selectGreaterRealmGateApronChildBundleOptions(
      ranked,
      option => option.child,
    );
    expect(GREATER_REALM_GATE_APRON_MAX_CHILD_BUNDLE_OPTIONS).toBe(256);
    expect(selected).toHaveLength(256);
    expect(selected[0]).toBe(ranked[0]);
    expect(selected).toContain(ranked[260]);
    expect(selected).toContain(ranked[261]);
    expect(selected.map(option => option.score)).toEqual(
      [...selected].map(option => option.score).sort((first, second) => first - second),
    );
    expect(Object.isFrozen(selected)).toBe(true);

    expect(() => selectGreaterRealmGateApronChildBundleOptions(
      Object.freeze(Array.from({ length: 257 }, (_, index) => Object.freeze({
        child: index === 256 ? -1 : 2,
      }))),
      option => option.child,
    )).toThrow('GREATER_REALM_GATE_APRON_CHILD_OPTION_ORIGIN_INVALID');

    const lowlandsRepair = selectGreaterRealmLowlandsRepairBundleOptions(
      Array.from({ length: 270 }, (_, score) => Object.freeze({
        child: 1,
        score,
        endpoint: score,
      })),
      1,
      bundle => bundle.child,
      bundle => bundle.score,
      bundle => bundle.endpoint,
    );
    expect(lowlandsRepair).toHaveLength(256);
    expect(lowlandsRepair[0]?.score).toBe(0);
    expect(lowlandsRepair.at(-1)?.score).toBe(255);
  });

  it.each(['ordinary', 'repair'] as const)(
    'retains a same-origin compatible footprint through the actual %s child frontier',
    lane => {
      const pairs = selectBalancedGreaterRealmGateApronPairs(Object.freeze([
        ...Array.from({ length: 257 }, (_, index) => Object.freeze({
          firstIndex: 0,
          secondIndex: index + 1,
          score: index + 1,
        })),
        Object.freeze({ firstIndex: 1, secondIndex: 258, score: 1000 }),
      ]));
      const ranked = Object.freeze(pairs.map(pair => Object.freeze({
        ...pair,
        ...option(
          `pair-${pair.firstIndex}-${pair.secondIndex}`,
          [pair.firstIndex, pair.secondIndex],
          [],
        ),
        child: 2,
      })));
      const compatible = ranked.find(bundle => bundle.firstIndex === 1)!;
      const competing = option('competing-sibling', [0], [1000]);
      const search = (frontier: typeof ranked) => searchGreaterRealmRankedSiblingAlternatives(
        Object.freeze(['same-capacity-assignment']),
        () => Object.freeze([frontier, Object.freeze([competing])]),
        (_alternative, selected) => selected[0]?.id === compatible.id,
        Object.freeze({ maximumSearchNodes: 640_000, maximumCompletePlans: 512 }),
        bundle => Object.freeze([bundle]),
      );

      // The raw pair cap already retains this real physical alternative.
      expect(pairs).toHaveLength(258);
      const scorePrefix = Object.freeze(ranked.slice(0, 256));
      expect(search(scorePrefix)).toEqual({ outcome: 'no-match' });
      const sameBoundControl = Object.freeze([...scorePrefix.slice(0, 255), compatible]);
      expect(search(sameBoundControl).outcome).toBe('match');

      const selected = lane === 'ordinary'
        ? selectGreaterRealmGateApronChildBundleOptions(
          ranked, bundle => bundle.child, bundle => bundle,
        )
        : selectGreaterRealmLowlandsRepairBundleOptions(
          ranked, 2, bundle => bundle.child, bundle => bundle.score,
          bundle => bundle.firstIndex, false, bundle => bundle,
        );
      expect(selected).toHaveLength(256);
      expect(selected[0]).toBe(ranked[0]);
      expect(search(selected).outcome).toBe('match');
      expect(selected.map(bundle => bundle.score)).toEqual(
        [...selected].map(bundle => bundle.score).sort((first, second) => first - second),
      );
      expect(Object.isFrozen(selected)).toBe(true);
      expect(ranked[0]?.tierOneCells).toEqual([0, 1]);
      expect(compatible.tierOneCells).toEqual([1, 258]);
    },
  );

  it.each(['ordinary', 'repair'] as const)(
    'retains a feasible %s alternative behind a mandatory same-origin corridor',
    lane => {
      const ranked = Object.freeze(Array.from({ length: 257 }, (_, index) => Object.freeze({
        ...option(String(index), index === 256 ? [0, 999] : [0, 1, index + 2], []),
        child: 2, score: index, endpoint: index,
      })));
      const competing = option('competing', [1], []);
      const search = (frontier: typeof ranked) => searchGreaterRealmRankedSiblingAlternatives(
        ['capacity'], () => [frontier, [competing]],
        (_alternative, selected) => selected[0]?.id === '256',
        { maximumSearchNodes: 640_000, maximumCompletePlans: 512 },
        bundle => [bundle],
      );
      expect(search(Object.freeze(ranked.slice(0, 256))).outcome).toBe('no-match');
      const selected = lane === 'ordinary'
        ? selectGreaterRealmGateApronChildBundleOptions(ranked, bundle => bundle.child, bundle => bundle)
        : selectGreaterRealmLowlandsRepairBundleOptions(
          ranked, 2, bundle => bundle.child, bundle => bundle.score,
          bundle => bundle.endpoint, false, bundle => bundle,
        );
      expect(selected).toHaveLength(256);
      expect(selected[0]).toBe(ranked[0]);
      expect(selected).toContain(ranked[256]);
      expect(search(selected).outcome).toBe('match');
      expect(ranked[0]?.tierOneCells).toEqual([0, 1, 2]);
    },
  );

  it('discounts mandatory cells per origin and tier without changing collision authority', () => {
    const ranked = Object.freeze(Array.from({ length: 270 }, (_, index) => Object.freeze({
      ...option(String(index),
        index === 268 ? [5, 1] : index === 269 ? [0, 999] : [0, 1, index + 2],
        index === 268 ? [0] : [],
      ),
      child: index === 268 ? 4 : 2,
    })));
    const selected = selectGreaterRealmGateApronChildBundleOptions(
      ranked, bundle => bundle.child, bundle => bundle,
    );
    expect(selected).toHaveLength(256);
    expect(selected).toContain(ranked[0]);
    expect(selected).toContain(ranked[268]);
    expect(selected).toContain(ranked[269]);
    expect(ranked[268]?.tierOneCells).toEqual([5, 1]);
    expect(ranked[268]?.tierTwoCells).toEqual([0]);
    const duplicated = Object.freeze(ranked.map(bundle => Object.freeze({
      ...bundle,
      tierOneCells: Object.freeze(bundle.tierOneCells.flatMap(cell => [cell, cell])),
      tierTwoCells: Object.freeze(bundle.tierTwoCells.flatMap(cell => [cell, cell])),
    })));
    expect(selectGreaterRealmGateApronChildBundleOptions(
      duplicated, bundle => bundle.child, bundle => bundle,
    ).map(bundle => bundle.id)).toEqual(selected.map(bundle => bundle.id));
    const collision = searchGreaterRealmRankedSiblingAlternatives(
      ['capacity'], () => [[ranked[0]!], [ranked[268]!]], () => true,
      { maximumSearchNodes: 640_000, maximumCompletePlans: 512 }, bundle => [bundle],
    );
    expect(collision.outcome).toBe('no-match');
  });

  it('keeps tiers distinct and treats repeated cells as one physical footprint', () => {
    const ranked = Object.freeze(Array.from({ length: 270 }, (_, index) => Object.freeze({
      ...option(String(index), index < 269 ? [0, index + 1] : [], index === 269 ? [0] : []),
      child: 2,
    })));
    const footprint = vi.fn((bundle: typeof ranked[number]) => bundle);
    const selected = selectGreaterRealmGateApronChildBundleOptions(
      ranked, bundle => bundle.child, footprint,
    );
    expect(selected).toContain(ranked[269]);
    expect(footprint).toHaveBeenCalledTimes(ranked.length);
    expect(selected).toHaveLength(256);
    const duplicated = Object.freeze(ranked.map(bundle => Object.freeze({
      ...bundle,
      tierOneCells: Object.freeze(bundle.tierOneCells.flatMap(cell => [cell, cell, cell])),
      tierTwoCells: Object.freeze(bundle.tierTwoCells.flatMap(cell => [cell, cell, cell])),
    })));
    expect(selectGreaterRealmGateApronChildBundleOptions(
      duplicated, bundle => bundle.child, bundle => bundle,
    ).map(bundle => bundle.id)).toEqual(selected.map(bundle => bundle.id));
    expect(duplicated[0]?.tierOneCells).toEqual([0, 0, 0, 1, 1, 1]);
    expect(ranked[269]?.tierTwoCells).toEqual([0]);
  });

  it('preserves mandatory origins sharing a corridor while retaining physical alternatives', () => {
    const ranked = Object.freeze(Array.from({ length: 270 }, (_, index) => Object.freeze({
      ...option(String(index), index < 269 ? [0, index + 1] : [200, 201], []),
      child: index === 1 ? 4 : 2,
    })));
    const select = () => selectGreaterRealmGateApronChildBundleOptions(
      ranked, bundle => bundle.child, bundle => bundle,
    );
    const selected = select();
    expect(selected).toContain(ranked[0]);
    expect(selected).toContain(ranked[1]);
    expect(selected).toContain(ranked[269]);
    expect(selected).toHaveLength(256);
    expect(selected).toEqual(select());
    expect(selected.map(bundle => Number(bundle.id))).toEqual(
      selected.map(bundle => Number(bundle.id)).sort((first, second) => first - second),
    );
  });

  it('keeps repair authority and own-first order when diverse donors survive overflow', () => {
    const own = Array.from({ length: 270 }, (_, score) => Object.freeze({
      ...option(`own-${score}`, [0, score + 1], []), child: 2, score, endpoint: score,
    }));
    const donor = Object.freeze({
      ...option('donor', [200, 201], []), child: 4, score: -2, endpoint: 200,
    });
    const lowlands = Object.freeze({
      ...option('lowlands', [202, 203], []), child: 0, score: -3, endpoint: 202,
    });
    const bundles = Object.freeze([...own, donor, lowlands]);
    const select = (child: number, includeBorrowed: boolean) => (
      selectGreaterRealmLowlandsRepairBundleOptions(
        bundles, child, bundle => bundle.child, bundle => bundle.score,
        bundle => bundle.endpoint, includeBorrowed, bundle => bundle,
      )
    );
    expect(select(2, true)).toHaveLength(256);
    expect(select(2, true)[0]).toBe(own[0]);
    expect(select(2, true).at(-1)).toBe(donor);
    expect(select(2, true)).not.toContain(lowlands);
    expect(select(2, false).every(bundle => bundle.child === 2)).toBe(true);
    expect(select(0, true)).toEqual([lowlands]);
  });

  it('leaves small frontiers unchanged without inspecting unused footprints', () => {
    const ranked = Object.freeze(Array.from({ length: 256 }, (_, index) => Object.freeze({
      ...option(String(index), [index], []), child: 2,
    })));
    const unused = vi.fn(() => { throw new Error('UNUSED_FOOTPRINT'); });
    const selected = selectGreaterRealmGateApronChildBundleOptions(
      ranked, bundle => bundle.child, unused,
    );
    expect(selected).toEqual(ranked);
    expect(selected).not.toBe(ranked);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(unused).not.toHaveBeenCalled();
  });

  it.each([-1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid physical cell %s without changing the frontier',
    invalidCell => {
      const ranked = Object.freeze(Array.from({ length: 257 }, (_, index) => Object.freeze({
        ...option(String(index), index === 256 ? [invalidCell] : [index], []), child: 2,
      })));
      expect(() => selectGreaterRealmGateApronChildBundleOptions(
        ranked, bundle => bundle.child, bundle => bundle,
      )).toThrow('GREATER_REALM_GATE_APRON_CHILD_OPTION_FOOTPRINT_INVALID');
      expect(ranked[0]?.tierOneCells).toEqual([0]);
      expect(ranked[256]?.tierOneCells[0]).toBe(invalidCell);
    },
  );

  it('retains a borrowed pair so global footprint conflicts can be resolved', () => {
    type Pair = Readonly<{ id: string }>;
    const ownPair: Pair = Object.freeze({ id: 'own-compatible-pair' });
    const ownAlternative: Pair = Object.freeze({ id: 'own-compatible-alternative' });
    const borrowedPairs: readonly Pair[] = Object.freeze([
      Object.freeze({ id: 'borrowed-first' }),
      Object.freeze({ id: 'borrowed-second' }),
      Object.freeze({ id: 'borrowed-overflow' }),
    ]);
    expect(chooseGreaterRealmLowlandsRepairSiblingPairs(
      Object.freeze([ownPair, ownAlternative]),
      borrowedPairs,
    )).toEqual([ownPair, borrowedPairs[0]]);
    expect(chooseGreaterRealmLowlandsRepairSiblingPairs(
      Object.freeze([ownPair, ownAlternative]),
      Object.freeze([]),
    )).toEqual([ownPair, ownAlternative]);
    expect(chooseGreaterRealmLowlandsRepairSiblingPairs(
      Object.freeze([]),
      borrowedPairs,
    )).toEqual(borrowedPairs.slice(0, 2));
    expect(chooseGreaterRealmLowlandsRepairSiblingPairs(
      Object.freeze([]),
      Object.freeze([]),
    )).toEqual([]);

    const ownFootprintPair = descriptor(
      'own',
      option('own-first', [1], [10]),
      option('own-second', [2], [20]),
    );
    const borrowedFootprintPair = descriptor(
      'borrowed',
      option('borrowed-first', [3], [30]),
      option('borrowed-second', [4], [40]),
    );
    const competingParentPair = descriptor(
      'competing-parent',
      option('competing-first', [5], [10]),
      option('competing-second', [6], [50]),
    );
    const retainedPairs = chooseGreaterRealmLowlandsRepairSiblingPairs(
      Object.freeze([ownFootprintPair]),
      Object.freeze([borrowedFootprintPair]),
    );
    const repairedAssignment = searchGreaterRealmRankedSiblingAlternatives(
      Object.freeze(['same-capacity-assignment']),
      () => Object.freeze([
        retainedPairs,
        Object.freeze([competingParentPair]),
      ]),
      (_alternative, selected) => (
        selected[0]?.id === 'borrowed'
        && selected[1]?.id === 'competing-parent'
      ),
      Object.freeze({ maximumSearchNodes: 32, maximumCompletePlans: 32 }),
      pair => pair.footprints,
    );
    expect(repairedAssignment).toEqual({
      outcome: 'match',
      alternative: 'same-capacity-assignment',
      options: [borrowedFootprintPair, competingParentPair],
    });
  });

  it.each(['borrowed', 'own-only'] as const)(
    'retains a physically distinct repair pair in the bounded %s frontier',
    lane => {
      const first = descriptor('first', option('first-corridor', [1], [10]));
      const duplicate = descriptor('duplicate', option('duplicate-corridor', [1], [10]));
      const alternative = descriptor('alternative', option('alternative-corridor', [2], [20]));
      const competitor = descriptor('competitor', option('other-parent', [1], [30]));
      const own = lane === 'borrowed' ? [first] : [first, duplicate, alternative];
      const fallback = lane === 'borrowed' ? [duplicate, alternative] : [];
      const search = (pairs: readonly SyntheticDescriptor[]) => searchGreaterRealmRankedSiblingAlternatives(
        ['same-capacity-assignment'],
        () => [pairs, [competitor]],
        () => true,
        { maximumSearchNodes: 32, maximumCompletePlans: 32 },
        pair => pair.footprints,
      );
      const rankOnly = chooseGreaterRealmLowlandsRepairSiblingPairs(own, fallback);
      expect(search(rankOnly)).toEqual({ outcome: 'no-match' });
      const retained = chooseGreaterRealmLowlandsRepairSiblingPairs(
        own, fallback, pair => pair.footprints,
      );
      expect(retained).toEqual([first, alternative]);
      expect(retained).toHaveLength(GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT);
      expect(search(retained)).toMatchObject({ outcome: 'match', options: [alternative, competitor] });
      expect(Object.isFrozen(retained)).toBe(true);
      expect(first.footprints[0]?.tierOneCells).toEqual([1]);
    },
  );

  it('counts repair pair cells once per tier and preserves ranked overlap ties', () => {
    const first = descriptor('first', option('first-corridor', [1, 1], [2, 2]));
    const repeated = descriptor('repeated', option('repeated-cell', [1, 1, 1], []));
    const tied = descriptor('tied', option('other-tier', [], [2]));
    const crossTier = descriptor('cross-tier', option('distinct-authority', [2], [1]));
    expect(chooseGreaterRealmLowlandsRepairSiblingPairs(
      [first], [repeated, tied], pair => pair.footprints,
    )).toEqual([first, repeated]);
    expect(chooseGreaterRealmLowlandsRepairSiblingPairs(
      [first], [repeated, tied, crossTier], pair => pair.footprints,
    )).toEqual([first, crossTier]);
    expect(repeated.footprints[0]?.tierOneCells).toEqual([1, 1, 1]);
  });

  it('rejects invalid repair pair cells before selecting an alternative', () => {
    const first = descriptor('first', option('first-corridor', [1], [10]));
    const invalid = descriptor('invalid', option('invalid-corridor', [-1], []));
    const alternative = descriptor('alternative', option('alternative-corridor', [2], []));
    expect(() => chooseGreaterRealmLowlandsRepairSiblingPairs(
      [first], [invalid, alternative], pair => pair.footprints,
    )).toThrowError('GREATER_REALM_LOWLANDS_REPAIR_PAIR_FOOTPRINT_INVALID');
    expect(invalid.footprints[0]?.tierOneCells).toEqual([-1]);
  });

  it('leaves untruncated repair pairs intact without inspecting footprints', () => {
    const own = descriptor('own', option('own-corridor', [1], [10]));
    const fallback = descriptor('fallback', option('fallback-corridor', [2], [20]));
    const footprints = vi.fn(() => { throw new Error('unused footprint'); });
    expect(chooseGreaterRealmLowlandsRepairSiblingPairs([own], [fallback], footprints))
      .toEqual([own, fallback]);
    expect(footprints).not.toHaveBeenCalled();
  });

  it('widens bounded gate-apron frontiers after repeated truncation', () => {
    expect(GREATER_REALM_GATE_APRON_MAX_EDGE_CANDIDATES).toBe(1024);
    expect(GREATER_REALM_GATE_APRON_MAX_BUNDLE_OPTIONS).toBe(65_536);
  });

  it('keeps the Lowlands repair frontier within the complete-plan budget', () => {
    expect(GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS).toBe(32);
    expect(GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT).toBe(2);
    expect(
      GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS
      * GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT ** 3,
    ).toBe(256);
  });

  it('rejects every tier or region mutation inside the repair authority mask', () => {
    const immutableCell = Uint8Array.of(0, 1, 1, 0);
    const originalTierId = Uint8Array.of(1, 1, 2, 2);
    const originalRegionId = Uint8Array.of(1, 0, 6, 7);

    expect(() => assertGreaterRealmRepairOwnershipUnchanged({
      immutableCell,
      originalTierId,
      originalRegionId,
      tierId: new Uint8Array(originalTierId),
      regionId: new Uint8Array(originalRegionId),
    })).not.toThrow();

    const changedTierId = new Uint8Array(originalTierId);
    changedTierId[1] = 2;
    expect(() => assertGreaterRealmRepairOwnershipUnchanged({
      immutableCell,
      originalTierId,
      originalRegionId,
      tierId: changedTierId,
      regionId: new Uint8Array(originalRegionId),
    })).toThrowError('GREATER_REALM_LOWLANDS_REPAIR_AUTHORITY_CHANGED');

    const changedRegionId = new Uint8Array(originalRegionId);
    changedRegionId[2] = 8;
    expect(() => assertGreaterRealmRepairOwnershipUnchanged({
      immutableCell,
      originalTierId,
      originalRegionId,
      tierId: new Uint8Array(originalTierId),
      regionId: changedRegionId,
    })).toThrowError('GREATER_REALM_LOWLANDS_REPAIR_AUTHORITY_CHANGED');
  });
});
