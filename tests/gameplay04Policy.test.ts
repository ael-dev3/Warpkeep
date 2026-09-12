import { describe, expect, it } from 'vitest';

import {
  GAMEPLAY04_BALANCE_CAP,
  GAMEPLAY04_GATHER_DURATIONS_MICROS,
  GAMEPLAY04_GATHER_QUANTUM_MICROS,
  GAMEPLAY04_POLICY_VERSION,
  GAMEPLAY04_WORKER_COUNT,
  Gameplay04PolicyError,
  buildingCost04,
  buildingDuration04,
  creditResource04,
  gatheringYield04,
  requireGatherDuration04,
  travelPerEdge04,
  type Building04,
  type CompletedLevels04,
  type Resource04,
} from '../spacetimedb/gameplay04/policy';

const EMPTY_LEVELS: CompletedLevels04 = Object.freeze({
  'city-mill': 0,
  'lumber-camp': 0,
  'city-stoneworks': 0,
  'city-goldworks': 0,
  'city-barracks': 0,
  'grand-covenant-cathedral': 0,
});

const BUILDINGS: readonly Building04[] = [
  'city-mill',
  'lumber-camp',
  'city-stoneworks',
  'city-goldworks',
  'city-barracks',
  'grand-covenant-cathedral',
];

const RESOURCES: readonly Resource04[] = ['food', 'wood', 'stone', 'gold'];

function levelsWith(overrides: Partial<CompletedLevels04>): CompletedLevels04 {
  return { ...EMPTY_LEVELS, ...overrides };
}

function expectInvalid(run: () => unknown): void {
  try {
    run();
    throw new Error('expected Gameplay04PolicyError');
  } catch (error) {
    expect(error).toBeInstanceOf(Gameplay04PolicyError);
    expect((error as Gameplay04PolicyError).code).toBe('GAMEPLAY04_POLICY_INPUT_INVALID');
  }
}

describe('gameplay 0.4 numeric policy', () => {
  it('publishes the immutable version, worker, cap, quantum, and gather duration contract', () => {
    expect(GAMEPLAY04_POLICY_VERSION).toBe('warpkeep-0.4-gameplay-v1');
    expect(GAMEPLAY04_BALANCE_CAP).toBe(1_000_000n);
    expect(GAMEPLAY04_WORKER_COUNT).toBe(4);
    expect(GAMEPLAY04_GATHER_QUANTUM_MICROS).toBe(10_000_000n);
    expect(GAMEPLAY04_GATHER_DURATIONS_MICROS).toEqual([
      60_000_000n,
      600_000_000n,
      3_600_000_000n,
      28_800_000_000n,
    ]);
    expect(Object.isFrozen(GAMEPLAY04_GATHER_DURATIONS_MICROS)).toBe(true);
  });

  it('prices all six recipes at every target level from independent base and multiplier fixtures', () => {
    const expectedBases: Readonly<Record<Building04, readonly [bigint, bigint, bigint, bigint]>> = {
      'city-mill': [20n, 40n, 20n, 0n],
      'lumber-camp': [20n, 20n, 40n, 0n],
      'city-stoneworks': [40n, 20n, 20n, 0n],
      'city-goldworks': [40n, 60n, 40n, 20n],
      'city-barracks': [60n, 80n, 80n, 40n],
      'grand-covenant-cathedral': [80n, 100n, 120n, 60n],
    };
    const expectedMultipliers = [1n, 3n, 7n, 15n, 31n] as const;

    for (const kind of BUILDINGS) {
      for (let index = 0; index < expectedMultipliers.length; index += 1) {
        const [food, wood, stone, gold] = expectedBases[kind];
        const multiplier = expectedMultipliers[index];
        const cost = buildingCost04(kind, index + 1);
        expect(cost).toEqual({
          food: food * multiplier,
          wood: wood * multiplier,
          stone: stone * multiplier,
          gold: gold * multiplier,
        });
        expect(Object.isFrozen(cost)).toBe(true);
      }
    }

    expect(buildingCost04('lumber-camp', 1)).toEqual({ food: 20n, wood: 20n, stone: 40n, gold: 0n });
    expect(buildingCost04('lumber-camp', 5)).toEqual({ food: 620n, wood: 620n, stone: 1_240n, gold: 0n });
  });

  it('applies every Cathedral level to every build duration with ceiling basis-point arithmetic', () => {
    const expectedByTargetLevel = [
      [120_000_000n, 114_000_000n, 108_000_000n, 102_000_000n, 96_000_000n, 90_000_000n],
      [900_000_000n, 855_000_000n, 810_000_000n, 765_000_000n, 720_000_000n, 675_000_000n],
      [3_600_000_000n, 3_420_000_000n, 3_240_000_000n, 3_060_000_000n, 2_880_000_000n, 2_700_000_000n],
      [14_400_000_000n, 13_680_000_000n, 12_960_000_000n, 12_240_000_000n, 11_520_000_000n, 10_800_000_000n],
      [43_200_000_000n, 41_040_000_000n, 38_880_000_000n, 36_720_000_000n, 34_560_000_000n, 32_400_000_000n],
    ] as const;

    for (let targetIndex = 0; targetIndex < expectedByTargetLevel.length; targetIndex += 1) {
      for (let cathedralLevel = 0; cathedralLevel <= 5; cathedralLevel += 1) {
        expect(buildingDuration04(
          targetIndex + 1,
          levelsWith({ 'grand-covenant-cathedral': cathedralLevel }),
        )).toBe(expectedByTargetLevel[targetIndex][cathedralLevel]);
      }
    }

    expect(buildingDuration04(1, EMPTY_LEVELS)).toBe(120_000_000n);
    expect(buildingDuration04(1, levelsWith({ 'grand-covenant-cathedral': 5 }))).toBe(90_000_000n);
  });

  it('applies only the matching economy building to resource yield at completed levels zero through five', () => {
    const matchingBuilding: Readonly<Record<Resource04, Building04>> = {
      food: 'city-mill',
      wood: 'lumber-camp',
      stone: 'city-stoneworks',
      gold: 'city-goldworks',
    };
    const expectedYields = [10n, 12n, 14n, 16n, 18n, 20n] as const;

    for (const resource of RESOURCES) {
      for (let level = 0; level <= 5; level += 1) {
        expect(gatheringYield04(resource, levelsWith({ [matchingBuilding[resource]]: level }))).toBe(
          expectedYields[level],
        );
      }

      for (const otherBuilding of BUILDINGS.filter((kind) => kind !== matchingBuilding[resource])) {
        expect(gatheringYield04(resource, levelsWith({ [otherBuilding]: 5 }))).toBe(10n);
      }
    }

    expect(gatheringYield04('wood', levelsWith({ 'lumber-camp': 1 }))).toBe(12n);
    expect(gatheringYield04('food', levelsWith({ 'lumber-camp': 5 }))).toBe(10n);
  });

  it('applies every Barracks travel reduction with ceiling basis-point arithmetic', () => {
    const expectedTravel = [2_000_000n, 1_900_000n, 1_800_000n, 1_700_000n, 1_600_000n, 1_500_000n] as const;

    for (let level = 0; level <= 5; level += 1) {
      expect(travelPerEdge04(levelsWith({ 'city-barracks': level }))).toBe(expectedTravel[level]);
    }
    expect(travelPerEdge04(levelsWith({ 'city-barracks': 5 }))).toBe(1_500_000n);
  });

  it('accepts exactly the four gathering durations and rejects each adjacent bigint', () => {
    for (const duration of GAMEPLAY04_GATHER_DURATIONS_MICROS) {
      expect(requireGatherDuration04(duration)).toBe(duration);
      expectInvalid(() => requireGatherDuration04(duration - 1n));
      expectInvalid(() => requireGatherDuration04(duration + 1n));
    }
  });

  it('caps credits deterministically including exact-cap and zero-credit boundaries', () => {
    expect(creditResource04(999_995n, 12n)).toEqual({ balance: 1_000_000n, credited: 5n, overflow: 7n });
    expect(creditResource04(1_000_000n, 12n)).toEqual({ balance: 1_000_000n, credited: 0n, overflow: 12n });
    expect(creditResource04(1_000_000n, 0n)).toEqual({ balance: 1_000_000n, credited: 0n, overflow: 0n });
    expect(creditResource04(0n, 0n)).toEqual({ balance: 0n, credited: 0n, overflow: 0n });
    expect(creditResource04(0n, 18_446_744_073_709_551_615n)).toEqual({
      balance: 1_000_000n,
      credited: 1_000_000n,
      overflow: 18_446_744_073_708_551_615n,
    });
    expect(Object.isFrozen(creditResource04(0n, 1n))).toBe(true);
  });

  it('rejects invalid resource, building, target-level, duration, and money runtime inputs', () => {
    expectInvalid(() => gatheringYield04('iron' as Resource04, EMPTY_LEVELS));
    expectInvalid(() => gatheringYield04(4 as unknown as Resource04, EMPTY_LEVELS));
    expectInvalid(() => buildingCost04('city-forge' as Building04, 1));
    expectInvalid(() => buildingCost04(null as unknown as Building04, 1));

    const invalidTargets: unknown[] = [0, 6, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', 1n, null];
    for (const target of invalidTargets) {
      expectInvalid(() => buildingCost04('city-mill', target as number));
      expectInvalid(() => buildingDuration04(target as number, EMPTY_LEVELS));
    }

    for (const duration of [60_000_000, '60000000', null, -1n]) {
      expectInvalid(() => requireGatherDuration04(duration as bigint));
    }

    for (const balance of [-1n, 1_000_001n, 0, '0', null]) {
      expectInvalid(() => creditResource04(balance as bigint, 0n));
    }
    for (const earned of [-1n, 18_446_744_073_709_551_616n, 0, '0', null]) {
      expectInvalid(() => creditResource04(0n, earned as bigint));
    }
  });

  it('rejects malformed completed-level records and every invalid completed level', () => {
    const missingKey = {
      'city-mill': 0,
      'lumber-camp': 0,
      'city-stoneworks': 0,
      'city-goldworks': 0,
      'city-barracks': 0,
    };
    const extraKey = { ...EMPTY_LEVELS, keep: 0 };
    const symbolKey = Object.assign({ ...EMPTY_LEVELS }, { [Symbol('keep')]: 0 });
    const malformedRecords: unknown[] = [null, [], missingKey, extraKey, symbolKey, 'levels', 0];

    for (const malformed of malformedRecords) {
      expectInvalid(() => buildingDuration04(1, malformed as CompletedLevels04));
      expectInvalid(() => gatheringYield04('food', malformed as CompletedLevels04));
      expectInvalid(() => travelPerEdge04(malformed as CompletedLevels04));
    }

    const invalidLevels: unknown[] = [-1, 6, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0', 0n, null];
    for (const invalidLevel of invalidLevels) {
      for (const building of BUILDINGS) {
        const malformed = { ...EMPTY_LEVELS, [building]: invalidLevel } as unknown as CompletedLevels04;
        expectInvalid(() => buildingDuration04(1, malformed));
        expectInvalid(() => gatheringYield04('food', malformed));
        expectInvalid(() => travelPerEdge04(malformed));
      }
    }
  });

  it('does not mutate frozen inputs or leak raw invalid input through errors', () => {
    const frozenLevels = Object.freeze(levelsWith({
      'city-mill': 2,
      'lumber-camp': 3,
      'city-stoneworks': 4,
      'city-goldworks': 5,
      'city-barracks': 1,
      'grand-covenant-cathedral': 2,
    }));
    const before = { ...frozenLevels };

    buildingDuration04(3, frozenLevels);
    gatheringYield04('gold', frozenLevels);
    travelPerEdge04(frozenLevels);
    expect(frozenLevels).toEqual(before);

    const rawSentinel = 'do-not-echo-this-building';
    try {
      buildingCost04(rawSentinel as Building04, 1);
      throw new Error('expected Gameplay04PolicyError');
    } catch (error) {
      expect(error).toBeInstanceOf(Gameplay04PolicyError);
      expect((error as Error).message).not.toContain(rawSentinel);
    }
  });
});
