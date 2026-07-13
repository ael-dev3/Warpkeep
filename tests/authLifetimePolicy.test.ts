import { describe, expect, it } from 'vitest';

import {
  CHALLENGE_TTL_MILLISECONDS,
  INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS,
} from '../services/auth-bridge/src/config';
import { FARCASTER_AUTH_REQUEST_TTL_MS } from '../src/farcaster/farcasterAuthContext';

describe('cross-layer authentication lifetime policy', () => {
  it('keeps the five-minute player challenge aligned while resolver credentials stay internal and brief', () => {
    expect(FARCASTER_AUTH_REQUEST_TTL_MS).toBe(300_000);
    expect(CHALLENGE_TTL_MILLISECONDS).toBe(300_000);
    expect(FARCASTER_AUTH_REQUEST_TTL_MS).toBe(CHALLENGE_TTL_MILLISECONDS);
    expect(INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS).toBe(15);
    expect(INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS * 1_000)
      .toBeLessThan(CHALLENGE_TTL_MILLISECONDS);
  });
});
