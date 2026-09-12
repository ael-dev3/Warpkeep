import { expect, it } from 'vitest';
import { evaluatePlacement04, type Placement04 } from '../spacetimedb/gameplay04/placement';
import { initialPlacement04, nudgePlacement04, rotatePlacement04, placementMessage04 } from '../src/ptr/gameplay04/gameplay04Placement';
import { MILL_PLACEMENT04, expectDeepFrozen04 } from './fixtures/gameplay04Client';

it('searches in deterministic z/x order for the first legal half-metre Mill site', () => {
  const placement = initialPlacement04('city-mill', []);
  expect(placement).toEqual({ kind: 'city-mill', x: -38_000_000n, z: -35_000_000n, rotation: 0 });
  expect(evaluatePlacement04(placement!, []).valid).toBe(true);
  expect(expectDeepFrozen04(placement)).toBe(true);
});

it('nudges exactly half a metre and cycles quarter turns without mutating the draft', () => {
  const nudged = nudgePlacement04(MILL_PLACEMENT04, -1, 1);
  expect(nudged).toEqual({ ...MILL_PLACEMENT04, x: -24_500_000n, z: -19_500_000n });
  let draft = MILL_PLACEMENT04 as ReturnType<typeof rotatePlacement04>;
  for (const rotation of [90_000, 180_000, 270_000, 0]) { draft = rotatePlacement04(draft); expect(draft.rotation).toBe(rotation); }
  expect(MILL_PLACEMENT04.rotation).toBe(0); expect(expectDeepFrozen04(nudged)).toBe(true);
  expect(expectDeepFrozen04(draft)).toBe(true);
});

it('returns null after the finite search when no free site exists', () => {
  expect(initialPlacement04('city-mill', [MILL_PLACEMENT04])).toBeNull();
  const occupied: Placement04[] = [
    MILL_PLACEMENT04,
    { kind: 'lumber-camp', x: 24_000_000n, z: -20_000_000n, rotation: 0 },
    { kind: 'city-stoneworks', x: -24_000_000n, z: 17_000_000n, rotation: 0 },
    { kind: 'city-goldworks', x: 24_000_000n, z: 17_000_000n, rotation: 0 },
    { kind: 'city-barracks', x: 0n, z: -23_000_000n, rotation: 0 },
  ];
  for (let index = 0; index < occupied.length; index += 1) {
    expect(evaluatePlacement04(occupied[index], occupied.slice(0, index)).valid).toBe(true);
  }
  expect(initialPlacement04('grand-covenant-cathedral', occupied)).toBeNull();
});

it('uses shared road/civic legality and fixed messages for every result', () => {
  for (const z of [0n, 20_000_000n]) {
    const result = evaluatePlacement04({ ...MILL_PLACEMENT04, x: 0n, z }, []);
    expect(result.reason).toBe('reserved'); expect(placementMessage04(result.reason)).toBe('Keep roads and civic space clear.');
  }
  const reasons = ['valid', 'invalid', 'off-grid', 'rotation', 'outside', 'reserved', 'occupied', 'duplicate-kind', 'invalid-state'] as const;
  for (const reason of reasons) expect(placementMessage04(reason).length).toBeGreaterThan(0);
});
