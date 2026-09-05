import { describe, expect, it } from 'vitest';

import {
  Gameplay04JourneyError,
  dispatchJourney04,
  observeJourney04,
  recallJourney04,
  type Journey04,
} from '../spacetimedb/gameplay04/workerJourney';
import type { CompletedLevels04, Resource04 } from '../spacetimedb/gameplay04/policy';

const I64_MAX = 9_223_372_036_854_775_807n;

const EMPTY_LEVELS: CompletedLevels04 = Object.freeze({
  'city-mill': 0,
  'lumber-camp': 0,
  'city-stoneworks': 0,
  'city-goldworks': 0,
  'city-barracks': 0,
  'grand-covenant-cathedral': 0,
});

function levelsWith(overrides: Partial<CompletedLevels04>): CompletedLevels04 {
  return { ...EMPTY_LEVELS, ...overrides };
}

function dispatch(overrides: Partial<Parameters<typeof dispatchJourney04>[0]> = {}): Journey04 {
  return dispatchJourney04({
    resource: 'wood',
    dispatchedAt: 0n,
    routeEdges: 3,
    gatheringDurationMicros: 60_000_000n,
    completed: EMPTY_LEVELS,
    ...overrides,
  });
}

function rawJourney(overrides: Partial<Journey04> = {}): Journey04 {
  return {
    resource: 'wood',
    dispatchedAt: 0n,
    routeEdges: 3,
    travelPerEdgeMicros: 2_000_000n,
    gatheringDurationMicros: 60_000_000n,
    yieldPerQuantum: 10n,
    recalledAt: null,
    ...overrides,
  };
}

function expectInvalid(run: () => unknown, rawSentinel?: string): void {
  try {
    run();
    throw new Error('expected Gameplay04JourneyError');
  } catch (error) {
    expect(error).toBeInstanceOf(Gameplay04JourneyError);
    expect((error as Gameplay04JourneyError).code).toBe('GAMEPLAY04_JOURNEY_INVALID');
    if (rawSentinel !== undefined) {
      expect((error as Error).message).not.toContain(rawSentinel);
    }
  }
}

describe('gameplay 0.4 Worker journey transitions', () => {
  it('classifies one microsecond before, at, and after every automatic boundary', () => {
    const journey = dispatch();
    const observations = [
      [0n, 'outbound', 6_000_000n],
      [5_999_999n, 'outbound', 6_000_000n],
      [6_000_000n, 'gathering', 66_000_000n],
      [6_000_001n, 'gathering', 66_000_000n],
      [65_999_999n, 'gathering', 66_000_000n],
      [66_000_000n, 'returning', 72_000_000n],
      [66_000_001n, 'returning', 72_000_000n],
      [71_999_999n, 'returning', 72_000_000n],
      [72_000_000n, 'complete', null],
      [72_000_001n, 'complete', null],
      [I64_MAX, 'complete', null],
    ] as const;

    for (const [now, phase, nextDueAt] of observations) {
      expect(observeJourney04(journey, now)).toMatchObject({
        phase,
        arrivesAt: 6_000_000n,
        gatheringStopsAt: 66_000_000n,
        returnsAt: 72_000_000n,
        nextDueAt,
      });
    }
    expect(observeJourney04(journey, 72_000_000n).earned).toBe(60n);
  });

  it('credits only complete gather quanta at one-microsecond boundaries', () => {
    const journey = dispatch();
    const expected = [
      [15_999_999n, 0n],
      [16_000_000n, 10n],
      [16_000_001n, 10n],
      [25_999_999n, 10n],
      [26_000_000n, 20n],
      [65_999_999n, 50n],
      [66_000_000n, 60n],
      [72_000_000n, 60n],
    ] as const;

    for (const [now, earned] of expected) {
      expect(observeJourney04(journey, now).earned).toBe(earned);
    }
  });

  it('supports zero-edge routes and completes an immediate recall at its stop timestamp', () => {
    const journey = dispatch({ routeEdges: 0, dispatchedAt: 100n });
    expect(observeJourney04(journey, 100n)).toMatchObject({
      phase: 'gathering',
      arrivesAt: 100n,
      gatheringStopsAt: 60_000_100n,
      returnsAt: 60_000_100n,
      earned: 0n,
      nextDueAt: 60_000_100n,
    });

    const recalled = recallJourney04(journey, 100n);
    expect(observeJourney04(recalled, 100n)).toEqual({
      phase: 'complete',
      arrivesAt: 100n,
      gatheringStopsAt: 100n,
      returnsAt: 100n,
      earned: 0n,
      nextDueAt: null,
    });
  });

  it('recalls outbound travel with symmetric elapsed return time and no earnings', () => {
    const journey = dispatch();
    const recalled = recallJourney04(journey, 3_000_001n);

    expect(recalled.recalledAt).toBe(3_000_001n);
    expect(observeJourney04(journey, 3_000_000n)).toMatchObject({
      phase: 'outbound',
      earned: 0n,
      nextDueAt: 6_000_000n,
    });
    expect(observeJourney04(recalled, 3_000_001n)).toMatchObject({
      phase: 'returning',
      returnsAt: 6_000_002n,
      earned: 0n,
      nextDueAt: 6_000_002n,
    });
    expect(observeJourney04(recalled, 6_000_001n).phase).toBe('returning');
    expect(observeJourney04(recalled, 6_000_002n)).toMatchObject({
      phase: 'complete',
      earned: 0n,
      nextDueAt: null,
    });
  });

  it('completes an immediate outbound recall at the dispatch timestamp', () => {
    const recalled = recallJourney04(dispatch(), 0n);

    expect(observeJourney04(recalled, 0n)).toEqual({
      phase: 'complete',
      arrivesAt: 6_000_000n,
      gatheringStopsAt: 0n,
      returnsAt: 0n,
      earned: 0n,
      nextDueAt: null,
    });
  });

  it('recalls exactly at arrival using the full planned return travel', () => {
    const journey = dispatch();
    const recalled = recallJourney04(journey, 6_000_000n);

    expect(observeJourney04(recalled, 6_000_000n)).toMatchObject({
      phase: 'returning',
      gatheringStopsAt: 6_000_000n,
      returnsAt: 12_000_000n,
      earned: 0n,
    });
    expect(observeJourney04(recalled, 12_000_000n).phase).toBe('complete');
  });

  it('caps recalled gathering at the recall instant and returns after full route travel', () => {
    const journey = dispatch();
    const recalled = recallJourney04(journey, 25_999_999n);

    expect(observeJourney04(journey, 25_999_998n)).toMatchObject({ phase: 'gathering', earned: 10n });
    expect(observeJourney04(recalled, 25_999_999n)).toMatchObject({
      phase: 'returning',
      gatheringStopsAt: 25_999_999n,
      returnsAt: 31_999_999n,
      earned: 10n,
    });
    expect(observeJourney04(recalled, 31_999_998n).phase).toBe('returning');
    expect(observeJourney04(recalled, 31_999_999n)).toMatchObject({ phase: 'complete', earned: 10n });
    expect(observeJourney04(recalled, I64_MAX).earned).toBe(10n);
  });

  it('retains the original immutable plan on repeat recall and after automatic return starts', () => {
    const journey = dispatch();
    const recalled = recallJourney04(journey, 16_000_000n);

    expect(observeJourney04(recalled, 16_000_000n)).toMatchObject({ phase: 'returning', earned: 10n });
    expect(recallJourney04(recalled, 16_000_001n)).toBe(recalled);
    expect(recallJourney04(journey, 66_000_000n)).toBe(journey);
    expect(recallJourney04(journey, 72_000_000n)).toBe(journey);
    expect(recallJourney04(journey, I64_MAX)).toBe(journey);
  });

  it('captures travel and yield policy at dispatch despite later completed-level changes', () => {
    const completed: Record<keyof CompletedLevels04, number> = {
      ...EMPTY_LEVELS,
      'lumber-camp': 2,
      'city-barracks': 3,
    };
    const input = Object.freeze({
      resource: 'wood' as const,
      dispatchedAt: 10n,
      routeEdges: 2,
      gatheringDurationMicros: 60_000_000n,
      completed,
    });
    const journey = dispatchJourney04(input);

    expect(journey).toEqual({
      resource: 'wood',
      dispatchedAt: 10n,
      routeEdges: 2,
      travelPerEdgeMicros: 1_700_000n,
      gatheringDurationMicros: 60_000_000n,
      yieldPerQuantum: 14n,
      recalledAt: null,
    });
    completed['lumber-camp'] = 5;
    completed['city-barracks'] = 5;
    expect(observeJourney04(journey, 63_400_010n).earned).toBe(84n);
    expect(journey.travelPerEdgeMicros).toBe(1_700_000n);
  });

  it('accepts every gather duration and the maximum route length', () => {
    const durations = [60_000_000n, 600_000_000n, 3_600_000_000n, 28_800_000_000n] as const;
    for (const gatheringDurationMicros of durations) {
      const journey = dispatch({ gatheringDurationMicros, routeEdges: 8192 });
      expect(observeJourney04(journey, 16_384_000_000n)).toMatchObject({
        phase: 'gathering',
        arrivesAt: 16_384_000_000n,
        gatheringStopsAt: 16_384_000_000n + gatheringDurationMicros,
      });
    }
  });

  it('accepts every captured travel and yield policy value', () => {
    const travelValues = [2_000_000n, 1_900_000n, 1_800_000n, 1_700_000n, 1_600_000n, 1_500_000n] as const;
    const yieldValues = [10n, 12n, 14n, 16n, 18n, 20n] as const;

    for (let index = 0; index < travelValues.length; index += 1) {
      const journey = rawJourney({
        routeEdges: 0,
        travelPerEdgeMicros: travelValues[index],
        yieldPerQuantum: yieldValues[index],
      });
      expect(observeJourney04(journey, 60_000_000n)).toMatchObject({
        phase: 'complete',
        earned: yieldValues[index] * 6n,
      });
    }
  });

  it('keeps inputs and outputs immutable and repeated observations pure', () => {
    const completed = Object.freeze(levelsWith({ 'lumber-camp': 1, 'city-barracks': 1 }));
    const input = Object.freeze({
      resource: 'wood' as const,
      dispatchedAt: 11n,
      routeEdges: 3,
      gatheringDurationMicros: 60_000_000n,
      completed,
    });
    const beforeInput = { ...input };
    const beforeLevels = { ...completed };
    const journey = dispatchJourney04(input);
    const beforeJourney = { ...journey };
    const first = observeJourney04(journey, 30_000_011n);
    const second = observeJourney04(journey, 30_000_011n);
    const recalled = recallJourney04(journey, 30_000_011n);

    expect(input).toEqual(beforeInput);
    expect(completed).toEqual(beforeLevels);
    expect(journey).toEqual(beforeJourney);
    expect(first).toEqual(second);
    expect(Object.isFrozen(journey)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(recalled)).toBe(true);
  });

  it('rejects malformed dispatch records, resource, timestamps, edges, and durations', () => {
    const valid = {
      resource: 'wood' as const,
      dispatchedAt: 0n,
      routeEdges: 3,
      gatheringDurationMicros: 60_000_000n,
      completed: EMPTY_LEVELS,
    };
    const missing = { ...valid } as Record<string, unknown>;
    delete missing.resource;
    const symbol = Object.assign({ ...valid }, { [Symbol('extra')]: true });
    const malformedRecords: unknown[] = [null, [], 'dispatch', 0, missing, { ...valid, extra: true }, symbol];

    for (const malformed of malformedRecords) {
      expectInvalid(() => dispatchJourney04(malformed as Parameters<typeof dispatchJourney04>[0]));
    }

    for (const resource of ['iron', '', 1, null, undefined]) {
      expectInvalid(() => dispatch({ resource: resource as Resource04 }));
    }
    for (const dispatchedAt of [-1n, I64_MAX + 1n, 0, '0', null, undefined]) {
      expectInvalid(() => dispatch({ dispatchedAt: dispatchedAt as bigint }));
    }
    for (const routeEdges of [-1, 8193, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 0n, '0', null]) {
      expectInvalid(() => dispatch({ routeEdges: routeEdges as number }));
    }
    for (const gatheringDurationMicros of [59_999_999n, 60_000_001n, -1n, 60_000_000, '60000000', null]) {
      expectInvalid(() => dispatch({ gatheringDurationMicros: gatheringDurationMicros as bigint }));
    }
    const malformedLevels: unknown[] = [
      null,
      [],
      { ...EMPTY_LEVELS, 'city-mill': -1 },
      { ...EMPTY_LEVELS, extra: 0 },
    ];
    for (const completed of malformedLevels) {
      expectInvalid(() => dispatch({ completed: completed as CompletedLevels04 }));
    }
  });

  it('rejects malformed journey records and every invalid captured policy value', () => {
    const valid = rawJourney();
    const missing = { ...valid } as Record<string, unknown>;
    delete missing.resource;
    const symbol = Object.assign({ ...valid }, { [Symbol('extra')]: true });
    const malformedRecords: unknown[] = [null, [], 'journey', 0, missing, { ...valid, extra: true }, symbol];

    for (const malformed of malformedRecords) {
      expectInvalid(() => observeJourney04(malformed as Journey04, 0n));
      expectInvalid(() => recallJourney04(malformed as Journey04, 0n));
    }

    const invalidByField: Readonly<Record<keyof Journey04, readonly unknown[]>> = {
      resource: ['iron', '', 1, null, undefined],
      dispatchedAt: [-1n, I64_MAX + 1n, 0, '0', null, undefined],
      routeEdges: [-1, 8193, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 0n, '0', null],
      travelPerEdgeMicros: [2_000_001n, 1_499_999n, 2_000_000, '2000000', null],
      gatheringDurationMicros: [59_999_999n, 60_000_001n, 60_000_000, '60000000', null],
      yieldPerQuantum: [9n, 11n, 22n, 10, '10', null],
      recalledAt: [-1n, I64_MAX + 1n, 0, '0', undefined],
    };

    for (const [field, invalidValues] of Object.entries(invalidByField) as [keyof Journey04, readonly unknown[]][]) {
      for (const invalid of invalidValues) {
        const malformed = { ...valid, [field]: invalid } as Journey04;
        expectInvalid(() => observeJourney04(malformed, 0n));
        expectInvalid(() => recallJourney04(malformed, 0n));
      }
    }
  });

  it('rejects malformed observation and recall times and inconsistent recall timestamps', () => {
    const journey = dispatch();
    for (const now of [-1n, I64_MAX + 1n, 0, '0', null, undefined]) {
      expectInvalid(() => observeJourney04(journey, now as bigint));
      expectInvalid(() => recallJourney04(journey, now as bigint));
    }

    const dispatchedAt = 100n;
    const future = dispatch({ dispatchedAt });
    expectInvalid(() => observeJourney04(future, 99n));
    expectInvalid(() => recallJourney04(future, 99n));
    expectInvalid(() => observeJourney04(rawJourney({ dispatchedAt, recalledAt: 99n }), 100n));
    expectInvalid(() => observeJourney04(rawJourney({ recalledAt: 20n }), 19n));
    expectInvalid(() => recallJourney04(rawJourney({ recalledAt: 20n }), 19n));
    expectInvalid(() => observeJourney04(rawJourney({ recalledAt: 66_000_000n }), 66_000_000n));
    expectInvalid(() => observeJourney04(rawJourney({ recalledAt: 72_000_000n }), 72_000_000n));
  });

  it('checks the automatic deadline even when recall would select an earlier safe return', () => {
    const overflowing = rawJourney({
      dispatchedAt: I64_MAX - 60_000_001n,
      routeEdges: 1,
      travelPerEdgeMicros: 2_000_000n,
      recalledAt: I64_MAX - 60_000_000n,
    });

    expectInvalid(() => observeJourney04(overflowing, I64_MAX - 60_000_000n));
    expectInvalid(() => recallJourney04(overflowing, I64_MAX - 60_000_000n));
  });

  it('accepts the exact i64 deadline bound and rejects dispatch overflow', () => {
    const exact = dispatch({
      dispatchedAt: I64_MAX - 64_000_000n,
      routeEdges: 1,
    });
    expect(observeJourney04(exact, I64_MAX)).toEqual({
      phase: 'complete',
      arrivesAt: I64_MAX - 62_000_000n,
      gatheringStopsAt: I64_MAX - 2_000_000n,
      returnsAt: I64_MAX,
      earned: 60n,
      nextDueAt: null,
    });

    expectInvalid(() => dispatch({
      dispatchedAt: I64_MAX - 63_999_999n,
      routeEdges: 1,
    }));
  });

  it('does not expose raw invalid values through errors', () => {
    const sentinel = 'do-not-echo-this-resource';
    expectInvalid(() => dispatch({ resource: sentinel as Resource04 }), sentinel);
    expectInvalid(() => observeJourney04(rawJourney({ resource: sentinel as Resource04 }), 0n), sentinel);
  });
});
