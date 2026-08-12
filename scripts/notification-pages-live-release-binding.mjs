/**
 * Checked-in root of trust for the durable notification Pages release chain.
 *
 * Both fields stay null until the first notification-enabled Pages release has
 * completed its live postflight and installed the generation-zero private
 * receipt.  A later, separately reviewed commit changes both fields together
 * to that immutable root.  Current-source receipts are then discovered only
 * through the authenticated chain rooted here; this file never points at a
 * short-lived bridge-preparation receipt.
 */
export const NOTIFICATION_PAGES_LIVE_RELEASE_BINDING = Object.freeze({
  notificationPagesLiveRootReceiptDigest: null,
  notificationPagesLiveRootPagesSourceCommit: null,
});

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const EXACT_KEYS = Object.freeze([
  'notificationPagesLiveRootPagesSourceCommit',
  'notificationPagesLiveRootReceiptDigest',
]);

export class NotificationPagesLiveReleaseBindingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesLiveReleaseBindingError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesLiveReleaseBindingError(code);
}

/** Parse the exact all-null or all-populated durable chain-root binding. */
export function parseNotificationPagesLiveReleaseBinding(
  value,
  { required = false } = {},
) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== EXACT_KEYS.join(',')
  ) fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_INVALID');
  const digest = value.notificationPagesLiveRootReceiptDigest;
  const sourceCommit = value.notificationPagesLiveRootPagesSourceCommit;
  if (digest === null && sourceCommit === null) {
    if (required) fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_REQUIRED');
    return Object.freeze({
      notificationPagesLiveRootReceiptDigest: null,
      notificationPagesLiveRootPagesSourceCommit: null,
    });
  }
  if (
    typeof digest !== 'string'
    || !SHA256.test(digest)
    || typeof sourceCommit !== 'string'
    || !COMMIT.test(sourceCommit)
  ) fail('NOTIFICATION_PAGES_LIVE_RELEASE_BINDING_INVALID');
  return Object.freeze({
    notificationPagesLiveRootReceiptDigest: digest,
    notificationPagesLiveRootPagesSourceCommit: sourceCommit,
  });
}
