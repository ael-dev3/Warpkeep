import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING,
  parseNotificationPagesPrivateReleaseBinding,
} from '../scripts/notification-pages-private-release-binding.mjs';

describe('notification Pages private release binding', () => {
  it('is exactly empty until the reviewed one-time activation commit', () => {
    expect(Object.keys(NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING)).toEqual([
      'notificationPagesActiveV17EvidenceDigest',
      'notificationPagesDeployedModuleReceiptDigest',
      'notificationPagesExpectedFounderCount',
    ]);
    expect(NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING).toEqual({
      notificationPagesActiveV17EvidenceDigest: null,
      notificationPagesDeployedModuleReceiptDigest: null,
      notificationPagesExpectedFounderCount: null,
    });
    expect(Object.isFrozen(NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING)).toBe(true);
    expect(() => parseNotificationPagesPrivateReleaseBinding(
      NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING,
      { required: true },
    )).toThrow('NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING_REQUIRED');
  });

  it('accepts one exact all-populated immutable input tuple', () => {
    const binding = {
      notificationPagesActiveV17EvidenceDigest: 'a'.repeat(64),
      notificationPagesDeployedModuleReceiptDigest: 'b'.repeat(64),
      notificationPagesExpectedFounderCount: 417,
    };
    const parsed = parseNotificationPagesPrivateReleaseBinding(binding, {
      required: true,
    });
    expect(parsed).toEqual(binding);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('rejects partial, reordered, malformed, and out-of-range authority', () => {
    const valid = {
      notificationPagesActiveV17EvidenceDigest: 'a'.repeat(64),
      notificationPagesDeployedModuleReceiptDigest: 'b'.repeat(64),
      notificationPagesExpectedFounderCount: 417,
    };
    for (const value of [
      null,
      [],
      {},
      { ...valid, unexpected: true },
      {
        notificationPagesDeployedModuleReceiptDigest:
          valid.notificationPagesDeployedModuleReceiptDigest,
        notificationPagesActiveV17EvidenceDigest:
          valid.notificationPagesActiveV17EvidenceDigest,
        notificationPagesExpectedFounderCount: valid.notificationPagesExpectedFounderCount,
      },
      { ...valid, notificationPagesActiveV17EvidenceDigest: null },
      { ...valid, notificationPagesDeployedModuleReceiptDigest: null },
      { ...valid, notificationPagesExpectedFounderCount: null },
      { ...valid, notificationPagesActiveV17EvidenceDigest: 'A'.repeat(64) },
      { ...valid, notificationPagesDeployedModuleReceiptDigest: 'b'.repeat(63) },
      { ...valid, notificationPagesExpectedFounderCount: 0 },
      { ...valid, notificationPagesExpectedFounderCount: 601 },
      { ...valid, notificationPagesExpectedFounderCount: 1.5 },
    ]) {
      expect(() => parseNotificationPagesPrivateReleaseBinding(value)).toThrow(
        'NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING_INVALID',
      );
    }
  });
});
