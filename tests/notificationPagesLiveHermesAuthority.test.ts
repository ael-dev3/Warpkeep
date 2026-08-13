import { describe, expect, it, vi } from 'vitest';

import {
  EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY,
  inspectHermesNotificationPagesLiveAuthority,
  parseNotificationPagesLiveHermesAuthority,
  sameNotificationPagesLiveHermesAuthority,
} from '../scripts/notification-pages-live-hermes-authority.mjs';

const ROOT_DIGEST = 'a'.repeat(64);
const ROOT_COMMIT = 'b'.repeat(40);
const RECEIPT_DIGEST = 'c'.repeat(64);
const PAGES_COMMIT = 'd'.repeat(40);
const BRIDGE_COMMIT = 'e'.repeat(40);

const rootBinding = Object.freeze({
  notificationPagesLiveRootReceiptDigest: ROOT_DIGEST,
  notificationPagesLiveRootPagesSourceCommit: ROOT_COMMIT,
});

const authority = Object.freeze({
  notificationPagesLiveReceiptDigest: RECEIPT_DIGEST,
  notificationPagesLivePagesSourceCommit: PAGES_COMMIT,
  notificationPagesLiveBridgeSourceCommit: BRIDGE_COMMIT,
  notificationPagesLiveRootReceiptDigest: ROOT_DIGEST,
  notificationPagesLiveRootPagesSourceCommit: ROOT_COMMIT,
});

describe('notification Pages live Hermes authority', () => {
  it('returns null authority without inspecting while the root is unbound', async () => {
    const inspectByPagesSourceCommit = vi.fn();
    await expect(inspectHermesNotificationPagesLiveAuthority({
      required: false,
      rootBinding: {
        notificationPagesLiveRootReceiptDigest: null,
        notificationPagesLiveRootPagesSourceCommit: null,
      },
    }, { inspectByPagesSourceCommit })).resolves.toBe(
      EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY,
    );
    expect(inspectByPagesSourceCommit).not.toHaveBeenCalled();
  });

  it('rejects a required unbound authority before filesystem or network work', async () => {
    const inspectByPagesSourceCommit = vi.fn();
    await expect(inspectHermesNotificationPagesLiveAuthority({
      required: true,
      rootBinding: {
        notificationPagesLiveRootReceiptDigest: null,
        notificationPagesLiveRootPagesSourceCommit: null,
      },
    }, { inspectByPagesSourceCommit })).rejects.toThrow(
      'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_REQUIRED',
    );
    expect(inspectByPagesSourceCommit).not.toHaveBeenCalled();
  });

  it('binds an exact current-source live receipt to the reviewed chain root', async () => {
    const inspectByPagesSourceCommit = vi.fn(async () => ({
      receiptDigest: RECEIPT_DIGEST,
      chainRootReceiptDigest: ROOT_DIGEST,
      chainRootPagesSourceCommit: ROOT_COMMIT,
      receipt: {
        pages: {
          sourceCommit: PAGES_COMMIT,
          notificationsPresentationEnabled: true,
          hermesExecutionApprovedAtActivation: false,
        },
        bridge: { sourceCommit: BRIDGE_COMMIT },
      },
    }));
    await expect(inspectHermesNotificationPagesLiveAuthority({
      required: true,
      rootBinding,
      pagesSourceCommit: PAGES_COMMIT,
      directory: '/private/receipts',
      repositoryRoot: '/checkout',
    }, {
      inspectByPagesSourceCommit:
        inspectByPagesSourceCommit as unknown as never,
    })).resolves.toEqual(authority);
    expect(inspectByPagesSourceCommit).toHaveBeenCalledWith({
      directory: '/private/receipts',
      repositoryRoot: '/checkout',
      pagesSourceCommit: PAGES_COMMIT,
      expectedChainRootReceiptDigest: ROOT_DIGEST,
      expectedChainRootPagesSourceCommit: ROOT_COMMIT,
    });
  });

  it('rejects mismatched roots, source, presentation, and activation provenance', async () => {
    for (const result of [
      {
        receiptDigest: RECEIPT_DIGEST,
        chainRootReceiptDigest: 'f'.repeat(64),
        chainRootPagesSourceCommit: ROOT_COMMIT,
        receipt: { pages: { sourceCommit: PAGES_COMMIT, notificationsPresentationEnabled: true,
          hermesExecutionApprovedAtActivation: false }, bridge: { sourceCommit: BRIDGE_COMMIT } },
      },
      {
        receiptDigest: RECEIPT_DIGEST,
        chainRootReceiptDigest: ROOT_DIGEST,
        chainRootPagesSourceCommit: ROOT_COMMIT,
        receipt: { pages: { sourceCommit: ROOT_COMMIT, notificationsPresentationEnabled: true,
          hermesExecutionApprovedAtActivation: false }, bridge: { sourceCommit: BRIDGE_COMMIT } },
      },
      {
        receiptDigest: RECEIPT_DIGEST,
        chainRootReceiptDigest: ROOT_DIGEST,
        chainRootPagesSourceCommit: ROOT_COMMIT,
        receipt: { pages: { sourceCommit: PAGES_COMMIT, notificationsPresentationEnabled: false,
          hermesExecutionApprovedAtActivation: false }, bridge: { sourceCommit: BRIDGE_COMMIT } },
      },
      {
        receiptDigest: RECEIPT_DIGEST,
        chainRootReceiptDigest: ROOT_DIGEST,
        chainRootPagesSourceCommit: ROOT_COMMIT,
        receipt: { pages: { sourceCommit: PAGES_COMMIT, notificationsPresentationEnabled: true,
          hermesExecutionApprovedAtActivation: true }, bridge: { sourceCommit: BRIDGE_COMMIT } },
      },
    ]) {
      await expect(inspectHermesNotificationPagesLiveAuthority({
        required: true,
        rootBinding,
        pagesSourceCommit: PAGES_COMMIT,
      }, {
        inspectByPagesSourceCommit:
          vi.fn(async () => result) as unknown as never,
      }))
        .rejects.toThrow('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_MISMATCH');
    }
  });

  it('parses only all-null or all-populated exact plan authority', () => {
    expect(parseNotificationPagesLiveHermesAuthority(authority, { required: true }))
      .toEqual(authority);
    expect(sameNotificationPagesLiveHermesAuthority(authority, { ...authority })).toBe(true);
    expect(sameNotificationPagesLiveHermesAuthority({
      schemaVersion: 4,
      kind: 'warpkeep-reviewed-founder-admission-plan',
      fid: '123',
      ...authority,
    }, {
      schemaVersion: 2,
      kind: 'warpkeep-reviewed-admission-notification-recovery-plan',
      fid: '123',
      ...authority,
    })).toBe(true);
    expect(sameNotificationPagesLiveHermesAuthority({
      schemaVersion: 4,
      kind: 'warpkeep-reviewed-founder-admission-plan',
      ...authority,
      notificationPagesLiveReceiptDigest: 'f'.repeat(64),
    }, authority)).toBe(false);
    expect(() => parseNotificationPagesLiveHermesAuthority({
      ...authority,
      notificationPagesLiveReceiptDigest: null,
    })).toThrow('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_INVALID');
    expect(() => parseNotificationPagesLiveHermesAuthority({
      ...authority,
      extra: true,
    })).toThrow('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_INVALID');
    expect(() => parseNotificationPagesLiveHermesAuthority({
      ...authority,
      notificationPagesLiveReceiptDigest: [RECEIPT_DIGEST],
    })).toThrow('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_INVALID');
  });
});
