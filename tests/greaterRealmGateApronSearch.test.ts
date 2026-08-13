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

    expect(result?.alternative).toBe('alternate');
    expect(result?.options.map(value => value.id)).toEqual([
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
    expect(exhausted).toBeUndefined();
    expect(completePlans).toBe(1);
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

    expect(result?.options.map(value => value.id)).toEqual(['fallback', 'sibling']);
    expect(visited).toEqual(['fallback+sibling']);
    expect('tierOneCells' in fallback).toBe(false);
    expect('tierTwoCells' in fallback).toBe(false);
  });
});
