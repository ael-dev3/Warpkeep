import { describe, expect, it } from 'vitest';

import {
  WARPKEEP_REALM_CHAT_CHANNEL_KEY,
  WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED,
  WARPKEEP_REALM_CHAT_POLICY_VERSION,
  WARPKEEP_REALM_CHAT_REVIEW_STATUS,
} from '../src/legal/realmChatPolicy';

describe('disabled Realm Chat legal contract', () => {
  it('keeps the proposed social feature unavailable pending explicit review and activation', () => {
    expect(WARPKEEP_REALM_CHAT_POLICY_VERSION)
      .toBe('2026-08-03-realm-chat-policy-v1');
    expect(WARPKEEP_REALM_CHAT_CHANNEL_KEY).toBe('realm:genesis-001');
    expect(WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED).toBe(false);
    expect(WARPKEEP_REALM_CHAT_REVIEW_STATUS)
      .toBe('pending-owner-and-qualified-legal-review');
  });
});
