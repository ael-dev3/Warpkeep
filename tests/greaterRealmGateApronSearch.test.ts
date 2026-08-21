import { describe, expect, it } from 'vitest';

import {
  searchGreaterRealmRankedSiblingAlternatives,
  type GreaterRealmRankedSiblingSearchOption,
} from '../scripts/atlas/greater-realm-candidate-generator';

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
});
