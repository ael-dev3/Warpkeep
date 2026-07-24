import { describe, expect, it } from 'vitest';

import {
  formatRealmRemainingDuration,
  localRealmNowMicros
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
});
