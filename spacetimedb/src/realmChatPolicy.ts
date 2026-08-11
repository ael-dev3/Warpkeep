/**
 * Realm Chat V1 is deliberately staged behind both a server mode and a client
 * entry flag. These limits become authoritative only after the separate legal
 * and activation gates are approved.
 */
export const REALM_CHAT_POLICY_VERSION = '2026-08-03-realm-chat-policy-v1';
export const REALM_CHAT_CHANNEL_KEY = 'realm:genesis-001';
export const REALM_CHAT_REALM_ID = 'HEGEMONY_GENESIS_001';
export const REALM_CHAT_SERVER_ACTIVATION_ALLOWED = false;

export const REALM_CHAT_RECENT_LIMIT = 128;
export const REALM_CHAT_HISTORY_PAGE_LIMIT = 50;
export const REALM_CHAT_MAX_SCALARS = 500;
export const REALM_CHAT_MAX_UTF8_BYTES = 2_048;
export const REALM_CHAT_MAX_LINES = 8;
export const REALM_CHAT_MIN_INTERVAL_MICROS = 2_000_000n;
export const REALM_CHAT_MINUTE_WINDOW_MICROS = 60_000_000n;
export const REALM_CHAT_HOUR_WINDOW_MICROS = 3_600_000_000n;
export const REALM_CHAT_MAX_PER_MINUTE = 10;
export const REALM_CHAT_MAX_PER_HOUR = 60;
export const REALM_CHAT_DUPLICATE_WINDOW_MICROS = 60_000_000n;
export const REALM_CHAT_RATE_EVENTS_PER_FID = REALM_CHAT_MAX_PER_HOUR;
export const REALM_CHAT_RECEIPTS_PER_FID = 64;
export const REALM_CHAT_REPORT_DETAILS_MAX_SCALARS = 250;
export const REALM_CHAT_REPORT_DETAILS_MAX_UTF8_BYTES = 512;
export const REALM_CHAT_REPORT_CONTEXT_RADIUS = 10n;
export const REALM_CHAT_REPORT_MAX_PER_REPORTER_HOUR = 5;
export const REALM_CHAT_REPORT_MAX_PER_REPORTER_DAY = 20;
export const REALM_CHAT_REPORT_MAX_GLOBAL_HOUR = 250;
export const REALM_CHAT_REPORT_MAX_GLOBAL_DAY = 1_000;
export const REALM_CHAT_REPORT_MAX_PER_MESSAGE = 20;
export const REALM_CHAT_REPORT_PENDING_LIMIT = 5_000;
export const REALM_CHAT_REPORT_SEND_PAUSE_THRESHOLD = 4_000;
export const REALM_CHAT_REPORT_DAY_WINDOW_MICROS = 86_400_000_000n;
export const REALM_CHAT_REPORT_RATE_EVENTS_MAX = REALM_CHAT_REPORT_MAX_GLOBAL_DAY;
export const REALM_CHAT_MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const REALM_CHAT_REPORT_CATEGORIES = Object.freeze([
  'threat_or_harm',
  'harassment_or_hate',
  'personal_information',
  'sexual_exploitation',
  'fraud_or_malware',
  'illegal_trade',
  'spam_or_disruption',
  'other',
] as const);

export type RealmChatReportCategory = typeof REALM_CHAT_REPORT_CATEGORIES[number];

export class RealmChatPolicyError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = 'RealmChatPolicyError';
  }
}

function fail(code: string): never {
  throw new RealmChatPolicyError(code);
}

function scalarCount(value: string): number {
  return [...value].length;
}

function utf8ByteCount(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function containsDisallowedControl(value: string): boolean {
  for (const scalar of value) {
    const code = scalar.codePointAt(0)!;
    if (
      code === 0x7f
      || (code >= 0 && code <= 0x08)
      || (code >= 0x0b && code <= 0x0c)
      || (code >= 0x0e && code <= 0x1f)
      || (code >= 0x80 && code <= 0x9f)
      // Directional isolates and overrides can make moderation evidence look
      // different from the stored text. Ordinary RTL scripts remain valid.
      || code === 0x061c
      || code === 0x200e
      || code === 0x200f
      || (code >= 0x202a && code <= 0x202e)
      || (code >= 0x2066 && code <= 0x2069)
    ) return true;
  }
  return false;
}

/** Normalize platform line endings and Unicode before any length/rate check. */
export function normalizeRealmChatBody(input: string): string {
  if (typeof input !== 'string' || input.length > REALM_CHAT_MAX_UTF8_BYTES) {
    fail('REALM_CHAT_BODY_INVALID');
  }
  const body = input
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .trim();
  if (body.length === 0) fail('REALM_CHAT_BODY_EMPTY');
  if (containsDisallowedControl(body)) fail('REALM_CHAT_BODY_CONTROL');
  if (body.split('\n').length > REALM_CHAT_MAX_LINES) fail('REALM_CHAT_BODY_LINES');
  if (scalarCount(body) > REALM_CHAT_MAX_SCALARS) fail('REALM_CHAT_BODY_SCALARS');
  if (utf8ByteCount(body) > REALM_CHAT_MAX_UTF8_BYTES) fail('REALM_CHAT_BODY_BYTES');
  return body;
}

export function normalizeRealmChatReportDetails(input: string): string {
  if (
    typeof input !== 'string'
    || input.length > REALM_CHAT_REPORT_DETAILS_MAX_UTF8_BYTES
  ) fail('REALM_CHAT_REPORT_DETAILS_INVALID');
  const details = input.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  if (containsDisallowedControl(details)) fail('REALM_CHAT_REPORT_DETAILS_CONTROL');
  if (scalarCount(details) > REALM_CHAT_REPORT_DETAILS_MAX_SCALARS) {
    fail('REALM_CHAT_REPORT_DETAILS_SCALARS');
  }
  if (utf8ByteCount(details) > REALM_CHAT_REPORT_DETAILS_MAX_UTF8_BYTES) {
    fail('REALM_CHAT_REPORT_DETAILS_BYTES');
  }
  return details;
}

export function requireRealmChatReportCategory(
  input: string,
): RealmChatReportCategory {
  if (typeof input !== 'string' || input.length > 32) {
    return fail('REALM_CHAT_REPORT_CATEGORY_INVALID');
  }
  if ((REALM_CHAT_REPORT_CATEGORIES as readonly string[]).includes(input)) {
    return input as RealmChatReportCategory;
  }
  return fail('REALM_CHAT_REPORT_CATEGORY_INVALID');
}

/** Canonical lowercase UUIDv4/v7 request IDs keep operation keys bounded. */
export function requireRealmChatRequestKey(input: string): string {
  if (
    typeof input !== 'string'
    || input.length !== 36
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input)
  ) {
    fail('REALM_CHAT_REQUEST_KEY_INVALID');
  }
  return input;
}

export function requireRealmChatMessageId(input: string): string {
  if (
    typeof input !== 'string'
    || input.length !== 36
    || !REALM_CHAT_MESSAGE_ID_PATTERN.test(input)
  ) fail('REALM_CHAT_MESSAGE_ID_INVALID');
  return input;
}

/** Stable non-cryptographic digest used only for exact duplicate throttling. */
export function realmChatBodyDigest(body: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(body)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export type RealmChatRateEvent = Readonly<{
  acceptedAtMicros: bigint;
  bodyDigest: string;
}>;

export type RealmChatReportRateEvent = Readonly<{
  reporterFid: bigint;
  acceptedAtMicros: bigint;
}>;

export type RealmChatRateDecision = Readonly<{
  retained: readonly RealmChatRateEvent[];
  retryAfterMicros: bigint;
}>;

/**
 * Evaluate exact rolling windows from the bounded accepted-event ledger.
 * Rejected attempts never consume quota.
 */
export function evaluateRealmChatRateLimit(
  events: Iterable<RealmChatRateEvent>,
  nowMicros: bigint,
  bodyDigest: string,
): RealmChatRateDecision {
  if (nowMicros <= 0n) fail('REALM_CHAT_TIME_INVALID');
  const all = [...events];
  if (all.length > REALM_CHAT_RATE_EVENTS_PER_FID) {
    fail('REALM_CHAT_RATE_STATE_INTEGRITY');
  }
  if (all.some(event => (
    event.acceptedAtMicros <= 0n
    || event.acceptedAtMicros > nowMicros
    || !/^[0-9a-f]{16}$/.test(event.bodyDigest)
  ))) fail('REALM_CHAT_RATE_STATE_INTEGRITY');
  const retained = all
    .filter(event => (
      nowMicros - event.acceptedAtMicros < REALM_CHAT_HOUR_WINDOW_MICROS
    ))
    .sort((left, right) => (
      left.acceptedAtMicros < right.acceptedAtMicros ? -1
        : left.acceptedAtMicros > right.acceptedAtMicros ? 1 : 0
    ));
  const latest = retained.length === 0 ? undefined : retained[retained.length - 1];
  if (latest !== undefined && nowMicros - latest.acceptedAtMicros < REALM_CHAT_MIN_INTERVAL_MICROS) {
    fail('REALM_CHAT_RATE_COOLDOWN');
  }
  const duplicate = retained.find(event => (
    event.bodyDigest === bodyDigest
    && nowMicros - event.acceptedAtMicros < REALM_CHAT_DUPLICATE_WINDOW_MICROS
  ));
  if (duplicate !== undefined) fail('REALM_CHAT_RATE_DUPLICATE');

  const minute = retained.filter(event => (
    nowMicros - event.acceptedAtMicros < REALM_CHAT_MINUTE_WINDOW_MICROS
  ));
  if (minute.length >= REALM_CHAT_MAX_PER_MINUTE) fail('REALM_CHAT_RATE_MINUTE');
  if (retained.length >= REALM_CHAT_MAX_PER_HOUR) fail('REALM_CHAT_RATE_HOUR');

  const retryCandidates = [
    latest === undefined
      ? 0n
      : REALM_CHAT_MIN_INTERVAL_MICROS - (nowMicros - latest.acceptedAtMicros),
    minute.length === 0
      ? 0n
      : REALM_CHAT_MINUTE_WINDOW_MICROS - (nowMicros - minute[0].acceptedAtMicros),
    retained.length === 0
      ? 0n
      : REALM_CHAT_HOUR_WINDOW_MICROS - (nowMicros - retained[0].acceptedAtMicros),
  ];
  return Object.freeze({
    retained: Object.freeze(retained),
    retryAfterMicros: retryCandidates.reduce(
      (maximum, value) => value > maximum ? value : maximum,
      0n,
    ),
  });
}

/**
 * Evaluate the absolute report-ingress envelope from a globally bounded
 * server-time ledger. The one-day global ceiling also bounds this ledger to
 * 1,000 rows; rejected reports never consume quota.
 */
export function evaluateRealmChatReportRateLimit(
  events: Iterable<RealmChatReportRateEvent>,
  nowMicros: bigint,
  reporterFid: bigint,
): readonly RealmChatReportRateEvent[] {
  if (nowMicros <= 0n || reporterFid <= 0n) {
    fail('REALM_CHAT_REPORT_RATE_STATE_INTEGRITY');
  }
  const all = [...events];
  if (all.length > REALM_CHAT_REPORT_RATE_EVENTS_MAX) {
    fail('REALM_CHAT_REPORT_RATE_STATE_INTEGRITY');
  }
  if (all.some(event => (
    event.reporterFid <= 0n
    || event.acceptedAtMicros <= 0n
    || event.acceptedAtMicros > nowMicros
  ))) fail('REALM_CHAT_REPORT_RATE_STATE_INTEGRITY');

  const retained = all.filter(event => (
    nowMicros - event.acceptedAtMicros < REALM_CHAT_REPORT_DAY_WINDOW_MICROS
  ));
  const globalHour = retained.filter(event => (
    nowMicros - event.acceptedAtMicros < REALM_CHAT_HOUR_WINDOW_MICROS
  ));
  const reporterDay = retained.filter(event => event.reporterFid === reporterFid);
  const reporterHour = globalHour.filter(event => event.reporterFid === reporterFid);
  if (reporterHour.length >= REALM_CHAT_REPORT_MAX_PER_REPORTER_HOUR) {
    fail('REALM_CHAT_REPORT_RATE_REPORTER_HOUR');
  }
  if (reporterDay.length >= REALM_CHAT_REPORT_MAX_PER_REPORTER_DAY) {
    fail('REALM_CHAT_REPORT_RATE_REPORTER_DAY');
  }
  if (globalHour.length >= REALM_CHAT_REPORT_MAX_GLOBAL_HOUR) {
    fail('REALM_CHAT_REPORT_RATE_GLOBAL_HOUR');
  }
  if (retained.length >= REALM_CHAT_REPORT_MAX_GLOBAL_DAY) {
    fail('REALM_CHAT_REPORT_RATE_GLOBAL_DAY');
  }
  return Object.freeze(retained);
}

export function realmChatOperationKey(fid: bigint, requestKey: string): string {
  if (fid <= 0n) fail('REALM_CHAT_FID_INVALID');
  return `${fid}:${requireRealmChatRequestKey(requestKey)}`;
}

export function realmChatReportKey(fid: bigint, messageId: string): string {
  if (fid <= 0n) {
    fail('REALM_CHAT_REPORT_KEY_INVALID');
  }
  return `${fid}:${requireRealmChatMessageId(messageId)}`;
}

export function realmChatContextBounds(
  sequence: bigint,
  availableLastSequence: bigint,
): Readonly<{
  first: bigint;
  last: bigint;
}> {
  if (sequence <= 0n || availableLastSequence < sequence) {
    fail('REALM_CHAT_SEQUENCE_INVALID');
  }
  return Object.freeze({
    first: sequence > REALM_CHAT_REPORT_CONTEXT_RADIUS
      ? sequence - REALM_CHAT_REPORT_CONTEXT_RADIUS
      : 1n,
    last: sequence + REALM_CHAT_REPORT_CONTEXT_RADIUS < availableLastSequence
      ? sequence + REALM_CHAT_REPORT_CONTEXT_RADIUS
      : availableLastSequence,
  });
}
