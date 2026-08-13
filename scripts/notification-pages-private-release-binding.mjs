/**
 * Checked-in, candidate-specific private inputs for the one-time notification
 * Pages activation. The files themselves remain owner-private; source names
 * only their immutable content digests and the reviewed founder count.
 *
 * This binding is empty during closed review and after the durable Pages root
 * replaces the expiring activation handoff. A separately reviewed activation
 * commit populates all three fields together.
 */
export const NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING = Object.freeze({
  notificationPagesActiveV17EvidenceDigest: null,
  notificationPagesDeployedModuleReceiptDigest: null,
  notificationPagesExpectedFounderCount: null,
});

const SHA256 = /^[0-9a-f]{64}$/u;
const FOUNDER_COUNT = /^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u;
const EXACT_KEYS = Object.freeze([
  'notificationPagesActiveV17EvidenceDigest',
  'notificationPagesDeployedModuleReceiptDigest',
  'notificationPagesExpectedFounderCount',
]);

export class NotificationPagesPrivateReleaseBindingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesPrivateReleaseBindingError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesPrivateReleaseBindingError(code);
}

/** Parse only the exact all-null or all-populated activation input binding. */
export function parseNotificationPagesPrivateReleaseBinding(
  value,
  { required = false } = {},
) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(EXACT_KEYS)
  ) fail('NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING_INVALID');
  const activeDigest = value.notificationPagesActiveV17EvidenceDigest;
  const moduleDigest = value.notificationPagesDeployedModuleReceiptDigest;
  const founderCount = value.notificationPagesExpectedFounderCount;
  if (activeDigest === null && moduleDigest === null && founderCount === null) {
    if (required) fail('NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING_REQUIRED');
    return Object.freeze({
      notificationPagesActiveV17EvidenceDigest: null,
      notificationPagesDeployedModuleReceiptDigest: null,
      notificationPagesExpectedFounderCount: null,
    });
  }
  if (
    typeof activeDigest !== 'string'
    || !SHA256.test(activeDigest)
    || typeof moduleDigest !== 'string'
    || !SHA256.test(moduleDigest)
    || !Number.isSafeInteger(founderCount)
    || !FOUNDER_COUNT.test(String(founderCount))
  ) fail('NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING_INVALID');
  return Object.freeze({
    notificationPagesActiveV17EvidenceDigest: activeDigest,
    notificationPagesDeployedModuleReceiptDigest: moduleDigest,
    notificationPagesExpectedFounderCount: founderCount,
  });
}
