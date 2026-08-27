import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS,
  GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT,
  assertGreaterRealmRepairOwnershipUnchanged,
  greaterRealmLowlandsRepairGateEdgeEligible,
  measureGreaterRealmStrategicShape,
  rankGreaterRealmLowlandsRepairBundleOptions,
  runGreaterRealmGateApronSearchLanes,
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

  it('enters the Lowlands repair lane only after a complete ordinary no-match', () => {
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

    for (const terminal of ['search-node-limit', 'complete-plan-limit'] as const) {
      const repairAfterLimit = vi.fn(() => Object.freeze({ outcome: 'no-match' as const }));
      expect(runGreaterRealmGateApronSearchLanes(
        () => Object.freeze({ outcome: terminal }),
        repairAfterLimit,
      )).toEqual({ lane: 'ordinary', result: { outcome: terminal } });
      expect(repairAfterLimit).not.toHaveBeenCalled();
    }

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

  it('caps the repair frontier at the unchanged complete-plan budget', () => {
    expect(GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS).toBe(16);
    expect(GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT).toBe(2);
    expect(
      GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS
      * GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT ** 3,
    ).toBe(128);
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
