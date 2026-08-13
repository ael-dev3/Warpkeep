import { describe, expect, it, vi } from 'vitest';

import {
  realmChatSendAttemptFor,
  type RealmChatSendAttempt
} from '../src/spacetime/WarpkeepSpacetimeProvider';

describe('Realm Chat send retry identity', () => {
  it('reuses one operation only for a short exact FID/body retry window', () => {
    const create = vi.fn(() => '018f7b44-5f2f-4c54-8c0d-3f521d46b193');
    const first = realmChatSendAttemptFor(undefined, 1, 'hello', 1_000, create);
    expect(first).toBeDefined();
    expect(create).toHaveBeenCalledTimes(1);

    const retry = realmChatSendAttemptFor(first, 1, 'hello', 120_000, create);
    expect(retry).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);

    const changedBody = realmChatSendAttemptFor(first, 1, 'hello!', 120_000, create);
    expect(changedBody).not.toBe(first);
    const changedFid = realmChatSendAttemptFor(first, 2, 'hello', 120_000, create);
    expect(changedFid).not.toBe(first);
    const expired = realmChatSendAttemptFor(first, 1, 'hello', 121_001, create);
    expect(expired).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(4);
  });

  it('rejects clock rollback and unavailable request-key generation', () => {
    const retained: RealmChatSendAttempt = Object.freeze({
      fid: 1,
      body: 'hello',
      requestKey: '018f7b44-5f2f-4c54-8c0d-3f521d46b193',
      createdAtMilliseconds: 1_000
    });
    expect(realmChatSendAttemptFor(retained, 1, 'hello', 999, () => undefined))
      .toBeUndefined();
  });
});
