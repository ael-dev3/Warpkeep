import { describe, expect, it } from 'vitest';

import { createDeterministicBudgetCollector } from '../src/game/map/deterministicBudget';

describe('deterministic renderer budget collector', () => {
  it('retains deterministic top-k priority while restoring canonical encounter order', () => {
    const collector = createDeterministicBudgetCollector<string>(3);
    [
      { value: 'outer', group: 1, rank: 0, order: 0 },
      { value: 'inner-nine', group: 0, rank: 9, order: 1 },
      { value: 'inner-one', group: 0, rank: 1, order: 2 },
      { value: 'inner-five', group: 0, rank: 5, order: 3 },
      { value: 'inner-five-late', group: 0, rank: 5, order: 4 }
    ].forEach((candidate) => collector.add(candidate));

    expect(collector.values()).toEqual(['inner-one', 'inner-five', 'inner-five-late']);
    expect(collector.values()).toEqual(['inner-one', 'inner-five', 'inner-five-late']);
  });

  it('never exposes more than its finite ceiling and supports an empty budget', () => {
    const collector = createDeterministicBudgetCollector<number>(7);
    for (let order = 0; order < 10_000; order += 1) {
      collector.add({ value: order, group: order % 3, rank: 10_000 - order, order });
    }
    expect(collector.values()).toHaveLength(7);

    const empty = createDeterministicBudgetCollector<number>(0);
    empty.add({ value: 1, group: 0, rank: 0, order: 0 });
    expect(empty.values()).toEqual([]);
  });
});
