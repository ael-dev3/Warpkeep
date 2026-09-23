import { describe, expect, it } from 'vitest';

import {
  formatRealmRemainingDuration,
  localRealmNowMicros,
  realmIntervalProgressPercent
} from '../src/components/realm/realmAuthoritySchedule';

describe('Realm authority schedule', () => {
  it('formats only authoritative future deadlines as time remaining', () => {
    const now = 2_000_000_000_000_000n;

    expect(formatRealmRemainingDuration(now + 30_000_000n, now))
      .toBe('<1m remaining');
    expect(formatRealmRemainingDuration(now + 90_000_000n, now))
      .toBe('2m remaining');
    expect(formatRealmRemainingDuration(now + 3_660_000_000n, now))
      .toBe('1h 1m remaining');
    expect(formatRealmRemainingDuration(now + 90_060_000_000n, now))
      .toBe('1d 1h 1m remaining');
  });

  it('fails closed for missing or invalid clocks and marks elapsed schedules stale', () => {
    const now = 2_000_000_000_000_000n;

    expect(formatRealmRemainingDuration(undefined, now)).toBeUndefined();
    expect(formatRealmRemainingDuration(0n, now)).toBeUndefined();
    expect(formatRealmRemainingDuration(now, now)).toBe('Awaiting Realm update');
    expect(formatRealmRemainingDuration(now - 1n, now)).toBe('Awaiting Realm update');
    expect(formatRealmRemainingDuration(now + 1n, undefined)).toBeUndefined();
    expect(localRealmNowMicros(Number.NaN)).toBeUndefined();
    expect(localRealmNowMicros(Number.MAX_SAFE_INTEGER + 1)).toBeUndefined();
  });

  it('projects honest percentage progress and waits for Realm confirmation at the deadline', () => {
    const startedAt = 1_000n;
    const completesAt = 11_000n;

    expect(realmIntervalProgressPercent(startedAt, completesAt, 0n)).toBe(0);
    expect(realmIntervalProgressPercent(startedAt, completesAt, 1_100n)).toBe(1);
    expect(realmIntervalProgressPercent(startedAt, completesAt, 6_000n)).toBe(50);
    expect(realmIntervalProgressPercent(startedAt, completesAt, 10_900n)).toBe(99);
    expect(realmIntervalProgressPercent(startedAt, completesAt, completesAt)).toBe(99);
    expect(realmIntervalProgressPercent(startedAt, completesAt, completesAt + 1n)).toBe(99);
    expect(realmIntervalProgressPercent(startedAt, completesAt, undefined)).toBeUndefined();
    expect(realmIntervalProgressPercent(startedAt, startedAt, 1_000n)).toBeUndefined();
  });
});
