import { describe, expect, it } from 'vitest';

import {
  GAMEPLAY04_LAYOUT_VERSION,
  evaluatePlacement04,
  placementDigestInput04,
  type Placement04,
} from '../spacetimedb/gameplay04/placement';
import type { Building04 } from '../spacetimedb/gameplay04/policy';

const BUILDINGS: readonly Building04[] = [
  'city-mill',
  'lumber-camp',
  'city-stoneworks',
  'city-goldworks',
  'city-barracks',
  'grand-covenant-cathedral',
];

const ROTATIONS = [0, 90_000, 180_000, 270_000] as const;

const CAMP = Object.freeze({
  kind: 'lumber-camp',
  x: -20_000_000n,
  z: -20_000_000n,
  rotation: 0,
} as const);

const COMPLETE_LAYOUT: readonly Placement04[] = Object.freeze([
  Object.freeze({ kind: 'city-mill', x: -15_000_000n, z: 15_000_000n, rotation: 0 }),
  Object.freeze({ kind: 'lumber-camp', x: -15_000_000n, z: 26_000_000n, rotation: 0 }),
  Object.freeze({ kind: 'city-stoneworks', x: 15_000_000n, z: 10_000_000n, rotation: 0 }),
  Object.freeze({ kind: 'city-goldworks', x: 15_000_000n, z: 22_000_000n, rotation: 0 }),
  Object.freeze({ kind: 'city-barracks', x: 20_000_000n, z: -30_000_000n, rotation: 0 }),
  Object.freeze({
    kind: 'grand-covenant-cathedral',
    x: -25_500_000n,
    z: -23_500_000n,
    rotation: 0,
  }),
]);

const EXPECTED_DIGEST_INPUT = '["warpkeep-0.4-placement-v1","533ff0c18624445af874f97b71d1d3ae4c6cb4a61f8b7732ba905ee10a61b443","500000",[0,90000,180000,270000],["-44000000","44000000","-40000000","32000000"],[["city-mill","5650000","4750000"],["lumber-camp","5300000","4400000"],["city-stoneworks","5500000","4600000"],["city-goldworks","5500000","4600000"],["city-barracks","9250000","7750000"],["grand-covenant-cathedral","18500000","16010000"]],[["gate-spine","0","14500000","3000000","17500000"],["civic-commons","0","2000000","5000000","5000000"],["gate-approach","0","30000000","4000000","2000000"]]]\n';

function malformedPlacement(value: unknown): Placement04 {
  return value as Placement04;
}

function malformedOccupied(value: unknown): readonly Placement04[] {
  return value as readonly Placement04[];
}

describe('gameplay 0.4 placement validation', () => {
  it('accepts a clear snapped placement and returns only a frozen result', () => {
    const result = evaluatePlacement04(CAMP, Object.freeze([]));

    expect(result).toEqual({ valid: true, reason: 'valid' });
    expect(Reflect.ownKeys(result)).toEqual(['valid', 'reason']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(GAMEPLAY04_LAYOUT_VERSION).toBe('warpkeep-0.4-placement-v1');
  });

  it('evaluates every building kind at every allowed quarter turn', () => {
    for (const kind of BUILDINGS) {
      for (const rotation of ROTATIONS) {
        expect(evaluatePlacement04({
          kind,
          x: -25_000_000n,
          z: -20_000_000n,
          rotation,
        }, [])).toEqual({ valid: true, reason: 'valid' });
      }
    }
  });

  it('rejects reserved, off-grid, unsupported, and duplicate-kind candidates in contract order', () => {
    expect(evaluatePlacement04({ ...CAMP, x: 0n, z: 0n }, [])).toEqual({
      valid: false,
      reason: 'reserved',
    });
    expect(evaluatePlacement04({ ...CAMP, x: -20_000_001n }, []).reason).toBe('off-grid');
    expect(evaluatePlacement04({ ...CAMP, z: -20_000_001n }, []).reason).toBe('off-grid');
    expect(evaluatePlacement04({
      kind: 'grand-covenant-cathedral',
      x: -26_000_000n,
      z: -20_000_000n,
      rotation: 0,
    }, []).reason).toBe('outside');
    expect(evaluatePlacement04({ ...CAMP, x: 20_000_000n }, [CAMP]).reason).toBe(
      'duplicate-kind',
    );
    expect(evaluatePlacement04(CAMP, [CAMP]).reason).toBe('duplicate-kind');
  });

  it('rejects non-quarter-turn rotations including fractional and non-finite numbers', () => {
    for (const rotation of [45_000, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = evaluatePlacement04({ ...CAMP, rotation }, []);
      expect(result).toEqual({ valid: false, reason: 'rotation' });
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('rejects malformed candidates, unknown kinds, extra enumerable keys, and signed-i64 overflow', () => {
    const enumerableSymbol = Object.assign({ ...CAMP }, { [Symbol('extra')]: true });
    const malformed: unknown[] = [
      null,
      [],
      'placement',
      { ...CAMP, kind: 'city-forge' },
      { kind: CAMP.kind, x: CAMP.x, z: CAMP.z },
      { ...CAMP, x: '-20000000' },
      { ...CAMP, z: -20_000_000 },
      { ...CAMP, extra: true },
      enumerableSymbol,
      { ...CAMP, x: -9_223_372_036_854_775_809n },
      { ...CAMP, z: 9_223_372_036_854_775_808n },
    ];

    for (const candidate of malformed) {
      const result = evaluatePlacement04(malformedPlacement(candidate), []);
      expect(result).toEqual({ valid: false, reason: 'invalid' });
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('allows support and exclusion touching but rejects any strict geometric overlap', () => {
    expect(evaluatePlacement04({
      kind: 'grand-covenant-cathedral',
      x: -25_500_000n,
      z: -20_000_000n,
      rotation: 0,
    }, []).reason).toBe('valid');
    expect(evaluatePlacement04({
      kind: 'grand-covenant-cathedral',
      x: 25_500_000n,
      z: -20_000_000n,
      rotation: 180_000,
    }, []).reason).toBe('valid');

    const touchesGateSpine: Placement04 = {
      kind: 'city-stoneworks',
      x: -8_500_000n,
      z: 14_500_000n,
      rotation: 0,
    };
    expect(evaluatePlacement04(touchesGateSpine, []).reason).toBe('valid');
    expect(evaluatePlacement04({ ...touchesGateSpine, x: -8_000_000n }, []).reason).toBe(
      'reserved',
    );

    const touchesCamp: Placement04 = {
      kind: 'city-stoneworks',
      x: -20_000_000n,
      z: -11_000_000n,
      rotation: 0,
    };
    expect(evaluatePlacement04(touchesCamp, [CAMP]).reason).toBe('valid');
    expect(evaluatePlacement04({ ...touchesCamp, z: -11_500_000n }, [CAMP]).reason).toBe(
      'occupied',
    );
  });

  it('swaps rectangular half-extents for quarter turns', () => {
    const unrotated: Placement04 = {
      kind: 'grand-covenant-cathedral',
      x: -25_500_000n,
      z: 15_500_000n,
      rotation: 0,
    };
    const quarterTurn = { ...unrotated, rotation: 90_000 } as const;

    expect(evaluatePlacement04(unrotated, []).reason).toBe('valid');
    expect(evaluatePlacement04(quarterTurn, []).reason).toBe('outside');
  });

  it('rejects malformed occupied graphs before evaluating the candidate', () => {
    const sparse = new Array<Placement04>(1);
    const arrayWithExtra = Object.assign([CAMP], { extra: true });
    const individuallyInvalid = Object.freeze({ ...CAMP, x: -20_000_001n });
    const reservedExisting = Object.freeze({ ...CAMP, x: 0n, z: 0n });
    const tooMany = Array.from({ length: 7 }, (_, index) => ({
      ...CAMP,
      x: BigInt(index) * 500_000n,
    }));
    const malformedGraphs: unknown[] = [
      null,
      {},
      sparse,
      arrayWithExtra,
      [individuallyInvalid],
      [reservedExisting],
      tooMany,
    ];

    for (const occupied of malformedGraphs) {
      expect(evaluatePlacement04(
        malformedPlacement({ ...CAMP, extra: true }),
        malformedOccupied(occupied),
      )).toEqual({ valid: false, reason: 'invalid-state' });
    }
  });

  it('rejects duplicate kinds and mutually overlapping buildings in occupied state', () => {
    const duplicateKinds: readonly Placement04[] = [
      CAMP,
      { ...CAMP, x: 20_000_000n },
    ];
    const overlapping: readonly Placement04[] = [
      CAMP,
      { kind: 'city-mill', x: -20_000_000n, z: -20_000_000n, rotation: 0 },
    ];
    const candidate: Placement04 = {
      kind: 'city-stoneworks',
      x: 20_000_000n,
      z: -10_000_000n,
      rotation: 0,
    };

    expect(evaluatePlacement04(candidate, duplicateKinds).reason).toBe('invalid-state');
    expect(evaluatePlacement04(candidate, overlapping).reason).toBe('invalid-state');
  });

  it('fits the complete six-building regression layout and accepts its occupied graph', () => {
    for (let index = 0; index < COMPLETE_LAYOUT.length; index += 1) {
      expect(evaluatePlacement04(
        COMPLETE_LAYOUT[index],
        COMPLETE_LAYOUT.slice(0, index),
      )).toEqual({ valid: true, reason: 'valid' });
    }

    expect(evaluatePlacement04({
      kind: 'city-mill',
      x: 35_000_000n,
      z: 20_000_000n,
      rotation: 0,
    }, COMPLETE_LAYOUT)).toEqual({ valid: false, reason: 'duplicate-kind' });
  });

  it('does not mutate frozen inputs and freezes every returned result', () => {
    const candidate = Object.freeze({ ...CAMP });
    const occupiedRecord = Object.freeze({
      kind: 'city-mill',
      x: 20_000_000n,
      z: -20_000_000n,
      rotation: 0,
    } as const);
    const occupied = Object.freeze([occupiedRecord]);
    const candidateBefore = { ...candidate };
    const occupiedBefore = occupied.map((placement) => ({ ...placement }));

    const validResult = evaluatePlacement04(candidate, occupied);
    const invalidResult = evaluatePlacement04({ ...candidate, x: 0n, z: 0n }, occupied);

    expect(candidate).toEqual(candidateBefore);
    expect(occupied).toEqual(occupiedBefore);
    expect(Object.isFrozen(validResult)).toBe(true);
    expect(Object.isFrozen(invalidResult)).toBe(true);
  });

  it('emits the independent canonical newline-terminated digest input snapshot', () => {
    const digestInput = placementDigestInput04();

    expect(digestInput).toBe(EXPECTED_DIGEST_INPUT);
    expect(digestInput.endsWith('\n')).toBe(true);
  });
});
