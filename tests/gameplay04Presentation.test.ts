import { expect, it, vi } from 'vitest';
import { decodeState04 } from '../src/ptr/gameplay04/gameplay04State';
import { buildingBenefit04, buildingDeficits04, PENDING_LABEL04, presentState04, quoteBuilding04 } from '../src/ptr/gameplay04/gameplay04Presentation';
import { ATLAS04, SCOPE04, MILL_PLACEMENT04, assignmentWire04, constructingWire04, expectDeepFrozen04, freshWire04, wireWithBuilding04 } from './fixtures/gameplay04Client';
import type { Building04 } from '../spacetimedb/gameplay04/policy';
import type { ReadWire04 } from '../src/ptr/gameplay04/ptrGameplay04Types';

const viewOf = (w: ReadWire04 = freshWire04()) => presentState04(decodeState04(w, SCOPE04), ATLAS04, 123);

it('quotes exact level-one Mill cost and duration and benefit 10 to 12', () => {
  const view = viewOf(); const quote = quoteBuilding04(view, 'city-mill', MILL_PLACEMENT04);
  expect(quote).toEqual({ revision: 1n, atlasRevision: 3n, policyVersion: view.state.policyVersion, layoutDigest: view.state.layoutDigest,
    kind: 'city-mill', targetLevel: 1, placement: MILL_PLACEMENT04, cost: { food: 20n, wood: 40n, stone: 20n, gold: 0n }, durationMicros: 120_000_000n });
  expect(buildingBenefit04(view, 'city-mill')).toEqual({ label: 'Food per 10-second quantum', current: 10n, next: 12n, unit: 'per-quantum' });
  expect(expectDeepFrozen04(quote)).toBe(true); expect(expectDeepFrozen04(view)).toBe(true);
});

const benefitCases: readonly [Building04, readonly bigint[], string, string][] = [
  ['city-mill', [10n, 12n, 14n, 16n, 18n, 20n], 'per-quantum', 'Food per 10-second quantum'],
  ['lumber-camp', [10n, 12n, 14n, 16n, 18n, 20n], 'per-quantum', 'Wood per 10-second quantum'],
  ['city-stoneworks', [10n, 12n, 14n, 16n, 18n, 20n], 'per-quantum', 'Stone per 10-second quantum'],
  ['city-goldworks', [10n, 12n, 14n, 16n, 18n, 20n], 'per-quantum', 'Gold per 10-second quantum'],
  ['city-barracks', [2_000_000n, 1_900_000n, 1_800_000n, 1_700_000n, 1_600_000n, 1_500_000n], 'micros', 'Travel time per edge'],
  ['grand-covenant-cathedral', [120_000_000n, 114_000_000n, 108_000_000n, 102_000_000n, 96_000_000n, 90_000_000n], 'micros', 'Future level-one build duration'],
];
for (const [kind, values, unit, label] of benefitCases) {
  it.each([0, 1, 2, 3, 4, 5])(`${kind} level %i uses only completed before/after effects`, level => {
    const benefit = buildingBenefit04(viewOf(wireWithBuilding04(kind, level)), kind);
    expect(benefit).toEqual({ current: values[level], next: values[Math.min(5, level + 1)], unit, label });
    expect(expectDeepFrozen04(benefit)).toBe(true);
  });
}

it('applies Cathedral integer policy duration to an upgrade and preserves its exact persisted transform', () => {
  const w = wireWithBuilding04('grand-covenant-cathedral', 3);
  const quote = quoteBuilding04(viewOf(w), 'grand-covenant-cathedral', { ...MILL_PLACEMENT04, kind: 'grand-covenant-cathedral', x: 20_000_000n, rotation: 90_000 });
  expect(quote.durationMicros).toBe(12_240_000_000n);
  expect(quote.placement).toEqual({ ...MILL_PLACEMENT04, kind: 'grand-covenant-cathedral' });
});

it('preserves captured Worker rates and returned earned totals as pending, never spendable or future earnings', () => {
  const w = wireWithBuilding04('city-mill', 5); w.food = 7n;
  w.workers[0] = { ordinal: 0, assignmentRevision: 2n, assignment: { ...assignmentWire04(), phase: 'gathering', earned: 30n },
    lastReturn: { assignmentRevision: 1n, resource: 'food', returnedAtMicros: 0n, earned: 60n, credited: 40n, overflow: 20n } };
  w.workers[1] = { ordinal: 1, assignmentRevision: 1n, assignment: { ...assignmentWire04(), resource: 'wood', phase: 'gathering', earned: 20n }, lastReturn: undefined };
  const view = viewOf(w);
  expect(view.balances).toEqual({ food: 7n, wood: 0n, stone: 0n, gold: 0n });
  expect(view.pending).toEqual({ food: 30n, wood: 20n, stone: 0n, gold: 0n });
  expect(view.workers[0]).toMatchObject({ capturedYield: 10n, phase: 'gathering', lastCredited: 40n, lastOverflow: 20n });
  expect(view.workers[2]).toEqual({ ordinal: 2, assignmentRevision: 0n, phase: 'idle', resource: null, route: [], returnsAtMicros: null, capturedYield: null, lastCredited: null, lastOverflow: null });
  expect(PENDING_LABEL04).toBe('pending · not spendable');
  expect(expectDeepFrozen04(view)).toBe(true);
});

it('reports all resource deficits from balances alone and clamps surplus and max-level deficits to zero', () => {
  const w = freshWire04(); Object.assign(w, { food: 10n, wood: 200n, stone: 5n, gold: 7n });
  w.workers[0].assignmentRevision = 1n; w.workers[0].assignment = { ...assignmentWire04(), phase: 'returning', earned: 60n };
  const deficits = buildingDeficits04(viewOf(w), 'grand-covenant-cathedral');
  expect(deficits).toEqual({ food: 70n, wood: 0n, stone: 115n, gold: 53n });
  expect(expectDeepFrozen04(deficits)).toBe(true);
  expect(buildingDeficits04(viewOf(wireWithBuilding04('city-mill', 5)), 'city-mill')).toEqual({ food: 0n, wood: 0n, stone: 0n, gold: 0n });
});

it('presents a project without claiming completion from wall time and rejects busy quotes', () => {
  const view = viewOf(constructingWire04());
  expect(view.buildings[0]).toEqual({ kind: 'city-mill', placement: MILL_PLACEMENT04, completedLevel: 0, targetLevel: 1,
    phase: 'constructing', startsAtMicros: 5n, completesAtMicros: 120_000_005n });
  expect(buildingBenefit04(view, 'city-mill').current).toBe(10n);
  expect(() => quoteBuilding04(view, 'city-mill', MILL_PLACEMENT04)).toThrow('Builder is busy.');
});

it('rejects missing atlas, max level, malformed placement, mismatched kind, and illegal new sites with fixed local errors', () => {
  const view = viewOf();
  expect(() => quoteBuilding04({ ...view, atlas: null }, 'city-mill', MILL_PLACEMENT04)).toThrow('Atlas is unavailable.');
  expect(() => quoteBuilding04(viewOf(wireWithBuilding04('city-mill', 5)), 'city-mill', MILL_PLACEMENT04)).toThrow('Building is at maximum level.');
  for (const placement of [{ ...MILL_PLACEMENT04, x: 1n }, { ...MILL_PLACEMENT04, token: 'secret' }, { ...MILL_PLACEMENT04, x: 0n, z: 20_000_000n }]) {
    expect(() => quoteBuilding04(view, 'city-mill', placement)).toThrow('Placement is invalid.');
  }
  expect(() => quoteBuilding04(view, 'lumber-camp', MILL_PLACEMENT04)).toThrow('Placement kind does not match.');
  const getter = vi.fn(() => 0n);
  const unsafe = { ...MILL_PLACEMENT04 };
  Object.defineProperty(unsafe, 'x', { enumerable: true, get: getter });
  expect(() => quoteBuilding04(view, 'city-mill', unsafe)).toThrow('Placement is invalid.');
  expect(getter).not.toHaveBeenCalled();
});

it('copies atlas metadata rather than freezing or retaining the caller object', () => {
  const atlas = { ...ATLAS04 }; const view = presentState04(decodeState04(freshWire04(), SCOPE04), atlas, 42);
  atlas.revision = 99n; expect(view.atlas?.revision).toBe(3n); expect(view.receivedAtMs).toBe(42); expect(Object.isFrozen(atlas)).toBe(false);
});
