import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
  parseNotificationPagesLiveReleaseBinding,
} from '../scripts/notification-pages-live-release-binding.mjs';
import {
  GREATER_REALM_NOTIFICATION_RELEASE_PHASE,
  parseGreaterRealmNotificationReleaseAuthority,
} from '../scripts/verify-greater-realm-release-gates.mjs';

describe('notification Pages live release binding', () => {
  it('keeps the durable live chain unbound before the reviewed activation', () => {
    expect(Object.keys(NOTIFICATION_PAGES_LIVE_RELEASE_BINDING)).toEqual([
      'notificationPagesLiveRootReceiptDigest',
      'notificationPagesLiveRootPagesSourceCommit',
    ]);
    expect(NOTIFICATION_PAGES_LIVE_RELEASE_BINDING).toEqual({
      notificationPagesLiveRootReceiptDigest: null,
      notificationPagesLiveRootPagesSourceCommit: null,
    });
    expect(Object.isFrozen(NOTIFICATION_PAGES_LIVE_RELEASE_BINDING)).toBe(true);
    expect(parseNotificationPagesLiveReleaseBinding(
      NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
    )).toEqual(NOTIFICATION_PAGES_LIVE_RELEASE_BINDING);
    expect(() => parseNotificationPagesLiveReleaseBinding(
      NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
      { required: true },
    )).toThrow('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_REQUIRED');
  });

  it('accepts only one exact all-populated chain root', () => {
    const binding = {
      notificationPagesLiveRootReceiptDigest: 'a'.repeat(64),
      notificationPagesLiveRootPagesSourceCommit: 'b'.repeat(40),
    };
    const parsed = parseNotificationPagesLiveReleaseBinding(binding, { required: true });
    expect(parsed).toEqual(binding);
    expect(Object.isFrozen(parsed)).toBe(true);

    for (const value of [
      null,
      [],
      {},
      { ...binding, unexpected: true },
      { ...binding, notificationPagesLiveRootReceiptDigest: null },
      { ...binding, notificationPagesLiveRootPagesSourceCommit: null },
      { ...binding, notificationPagesLiveRootReceiptDigest: 'A'.repeat(64) },
      { ...binding, notificationPagesLiveRootPagesSourceCommit: 'B'.repeat(40) },
    ]) {
      expect(() => parseNotificationPagesLiveReleaseBinding(value)).toThrow(
        'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_INVALID',
      );
    }
  });

  it('never permits Hermes final authority with the checked-in null root', () => {
    expect(() => parseGreaterRealmNotificationReleaseAuthority({
      phase: GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL,
      notificationPreparedReceiptDigest: null,
      notificationPreparedBridgeSourceCommit: null,
      ...NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
    })).toThrow('GREATER_REALM_NOTIFICATION_PAGES_LIVE_ROOT_BINDING_REQUIRED');
  });
});
