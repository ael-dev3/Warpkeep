import { describe, expect, it } from 'vitest';

import {
  REALM_CHAT_POLL_INTERVAL_MILLISECONDS,
  REALM_CHAT_POLL_MAX_BACKOFF_MILLISECONDS,
  realmChatPollDelayMilliseconds
} from '../src/spacetime/WarpkeepSpacetimeProvider';

describe('Realm Chat visibility polling backoff', () => {
  it('uses the normal cadence after success and caps exponential failure delay', () => {
    expect(REALM_CHAT_POLL_INTERVAL_MILLISECONDS).toBe(2_000);
    expect(REALM_CHAT_POLL_MAX_BACKOFF_MILLISECONDS).toBe(30_000);
    expect([0, 1, 2, 3, 4, 5, 50].map(realmChatPollDelayMilliseconds))
      .toEqual([2_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });

  it('fails closed to maximum delay for malformed failure state', () => {
    expect(realmChatPollDelayMilliseconds(-1)).toBe(30_000);
    expect(realmChatPollDelayMilliseconds(Number.POSITIVE_INFINITY)).toBe(30_000);
  });
});
