import { resolve } from 'node:path';

import {
  defaultNotificationPagesLiveReceiptDirectory,
  inspectPrivateNotificationPagesLiveReceiptForActivationPredecessor,
  inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit,
} from './notification-pages-live-receipt.mjs';
import {
  NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
  parseNotificationPagesLiveReleaseBinding,
} from './notification-pages-live-release-binding.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

export class NotificationPagesLiveHermesAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesLiveHermesAuthorityError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesLiveHermesAuthorityError(code);
}

export const EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY = Object.freeze({
  notificationPagesLiveReceiptDigest: null,
  notificationPagesLivePagesSourceCommit: null,
  notificationPagesLiveBridgeSourceCommit: null,
  notificationPagesLiveRootReceiptDigest: null,
  notificationPagesLiveRootPagesSourceCommit: null,
});

export function parseNotificationPagesLiveHermesAuthority(value, { required = false } = {}) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== Object.keys(
      EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY,
    ).sort().join(',')
  ) fail('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_INVALID');
  const fields = [
    value.notificationPagesLiveReceiptDigest,
    value.notificationPagesLivePagesSourceCommit,
    value.notificationPagesLiveBridgeSourceCommit,
    value.notificationPagesLiveRootReceiptDigest,
    value.notificationPagesLiveRootPagesSourceCommit,
  ];
  if (fields.every(field => field === null)) {
    if (required) fail('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_REQUIRED');
    return EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY;
  }
  if (
    typeof value.notificationPagesLiveReceiptDigest !== 'string'
    || !SHA256.test(value.notificationPagesLiveReceiptDigest)
    || typeof value.notificationPagesLivePagesSourceCommit !== 'string'
    || !COMMIT.test(value.notificationPagesLivePagesSourceCommit)
    || typeof value.notificationPagesLiveBridgeSourceCommit !== 'string'
    || !COMMIT.test(value.notificationPagesLiveBridgeSourceCommit)
    || typeof value.notificationPagesLiveRootReceiptDigest !== 'string'
    || !SHA256.test(value.notificationPagesLiveRootReceiptDigest)
    || typeof value.notificationPagesLiveRootPagesSourceCommit !== 'string'
    || !COMMIT.test(value.notificationPagesLiveRootPagesSourceCommit)
  ) fail('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_INVALID');
  return Object.freeze({ ...value });
}

/**
 * Resolve the exact live Pages/bridge authority for a trusted Hermes checkout.
 *
 * The short-lived bridge preparation is deliberately absent from this ABI.
 * Every populated result comes from the current protected source's fresh live
 * receipt, anchored to the separately reviewed immutable chain root.
 */
export async function inspectHermesNotificationPagesLiveAuthority(
  input,
  dependencies = {},
) {
  const root = parseNotificationPagesLiveReleaseBinding(
    input?.rootBinding ?? NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
    { required: input?.required === true },
  );
  if (root.notificationPagesLiveRootReceiptDigest === null) {
    return EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY;
  }
  if (
    input === null
    || typeof input !== 'object'
    || typeof input.pagesSourceCommit !== 'string'
    || !COMMIT.test(input.pagesSourceCommit)
  ) fail('NOTIFICATION_PAGES_LIVE_HERMES_SOURCE_INVALID');
  const inspected = await (
    dependencies.inspectByPagesSourceCommit
      ?? inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit
  )({
    directory: input.directory ?? defaultNotificationPagesLiveReceiptDirectory(),
    repositoryRoot: input.repositoryRoot ?? resolve(import.meta.dirname, '..'),
    pagesSourceCommit: input.pagesSourceCommit,
    expectedChainRootReceiptDigest: root.notificationPagesLiveRootReceiptDigest,
    expectedChainRootPagesSourceCommit:
      root.notificationPagesLiveRootPagesSourceCommit,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  const receipt = inspected?.receipt;
  if (
    inspected?.receiptDigest === undefined
    || !SHA256.test(inspected.receiptDigest)
    || inspected.chainRootReceiptDigest
      !== root.notificationPagesLiveRootReceiptDigest
    || inspected.chainRootPagesSourceCommit
      !== root.notificationPagesLiveRootPagesSourceCommit
    || receipt?.pages?.sourceCommit !== input.pagesSourceCommit
    || receipt.pages.notificationsPresentationEnabled !== true
    || receipt.pages.hermesExecutionApprovedAtActivation !== false
    || typeof receipt.bridge?.sourceCommit !== 'string'
    || !COMMIT.test(receipt.bridge.sourceCommit)
  ) fail('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_MISMATCH');
  return parseNotificationPagesLiveHermesAuthority({
    notificationPagesLiveReceiptDigest: inspected.receiptDigest,
    notificationPagesLivePagesSourceCommit: receipt.pages.sourceCommit,
    notificationPagesLiveBridgeSourceCommit: receipt.bridge.sourceCommit,
    notificationPagesLiveRootReceiptDigest: inspected.chainRootReceiptDigest,
    notificationPagesLiveRootPagesSourceCommit: inspected.chainRootPagesSourceCommit,
  }, { required: true });
}

/**
 * Resolve the exact live C6 Hermes authority from an exact clean C7 checkout.
 * The ordinary current-source API above intentionally remains HEAD-bound.
 */
export async function inspectActivationPredecessorHermesNotificationPagesLiveAuthority(
  input,
  dependencies = {},
) {
  const root = parseNotificationPagesLiveReleaseBinding(
    input?.rootBinding ?? NOTIFICATION_PAGES_LIVE_RELEASE_BINDING,
    { required: true },
  );
  if (
    input === null
    || typeof input !== 'object'
    || typeof input.pagesSourceCommit !== 'string'
    || !COMMIT.test(input.pagesSourceCommit)
    || typeof input.candidatePagesSourceCommit !== 'string'
    || !COMMIT.test(input.candidatePagesSourceCommit)
    || input.candidatePagesSourceCommit === input.pagesSourceCommit
  ) fail('NOTIFICATION_PAGES_LIVE_HERMES_PREDECESSOR_SOURCE_INVALID');
  const inspected = await (
    dependencies.inspectActivationPredecessor
      ?? inspectPrivateNotificationPagesLiveReceiptForActivationPredecessor
  )({
    directory: input.directory ?? defaultNotificationPagesLiveReceiptDirectory(),
    repositoryRoot: input.repositoryRoot ?? resolve(import.meta.dirname, '..'),
    candidatePagesSourceCommit: input.candidatePagesSourceCommit,
    pagesSourceCommit: input.pagesSourceCommit,
    expectedChainRootReceiptDigest: root.notificationPagesLiveRootReceiptDigest,
    expectedChainRootPagesSourceCommit:
      root.notificationPagesLiveRootPagesSourceCommit,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  const receipt = inspected?.receipt;
  if (
    inspected?.receiptDigest === undefined
    || !SHA256.test(inspected.receiptDigest)
    || inspected.chainRootReceiptDigest
      !== root.notificationPagesLiveRootReceiptDigest
    || inspected.chainRootPagesSourceCommit
      !== root.notificationPagesLiveRootPagesSourceCommit
    || receipt?.pages?.sourceCommit !== input.pagesSourceCommit
    || receipt.pages.notificationsPresentationEnabled !== true
    || receipt.pages.hermesExecutionApprovedAtActivation !== false
    || typeof receipt.bridge?.sourceCommit !== 'string'
    || !COMMIT.test(receipt.bridge.sourceCommit)
  ) fail('NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY_MISMATCH');
  return parseNotificationPagesLiveHermesAuthority({
    notificationPagesLiveReceiptDigest: inspected.receiptDigest,
    notificationPagesLivePagesSourceCommit: receipt.pages.sourceCommit,
    notificationPagesLiveBridgeSourceCommit: receipt.bridge.sourceCommit,
    notificationPagesLiveRootReceiptDigest: inspected.chainRootReceiptDigest,
    notificationPagesLiveRootPagesSourceCommit: inspected.chainRootPagesSourceCommit,
  }, { required: true });
}

export function sameNotificationPagesLiveHermesAuthority(left, right) {
  const project = value => parseNotificationPagesLiveHermesAuthority({
    notificationPagesLiveReceiptDigest:
      value?.notificationPagesLiveReceiptDigest,
    notificationPagesLivePagesSourceCommit:
      value?.notificationPagesLivePagesSourceCommit,
    notificationPagesLiveBridgeSourceCommit:
      value?.notificationPagesLiveBridgeSourceCommit,
    notificationPagesLiveRootReceiptDigest:
      value?.notificationPagesLiveRootReceiptDigest,
    notificationPagesLiveRootPagesSourceCommit:
      value?.notificationPagesLiveRootPagesSourceCommit,
  });
  const first = project(left);
  const second = project(right);
  return Object.keys(EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY)
    .every(key => first[key] === second[key]);
}
