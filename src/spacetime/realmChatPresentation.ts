import {
  WARPKEEP_REALM_CHAT_CHANNEL_KEY,
  WARPKEEP_REALM_CHAT_POLICY_VERSION
} from '../legal/realmChatPolicy';
import { WARPKEEP_EXPECTED_WORLD_SEED_NAME } from './warpkeepProtocol';

export const REALM_CHAT_RECENT_LIMIT = 128;
export const REALM_CHAT_HISTORY_PAGE_LIMIT = 50;
const REALM_CHAT_MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_JAVASCRIPT_DATE_MICROS = 8_640_000_000_000_000_000n;

export type RealmChatMode = 'staged' | 'active' | 'disabled';

export type RealmChatMessagePresentation = Readonly<{
  messageId: string;
  sequence: bigint;
  senderFid: number;
  body: string;
  sentAtMicros: bigint;
  visibility: 'visible' | 'tombstoned';
}>;

export type RealmChatPresentation = Readonly<{
  availability: 'unavailable' | 'ready';
  channelKey?: string;
  policyVersion?: string;
  mode?: RealmChatMode;
  messages: readonly RealmChatMessagePresentation[];
}>;

export type RealmChatHistoryPagePresentation = Readonly<{
  messages: readonly RealmChatMessagePresentation[];
  nextBeforeSequence?: bigint;
  hasMore: boolean;
}>;

export const UNAVAILABLE_REALM_CHAT_PRESENTATION: RealmChatPresentation =
  Object.freeze({ availability: 'unavailable', messages: Object.freeze([]) });

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function safePositiveFid(value: unknown): number | undefined {
  if (typeof value !== 'bigint') return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function safeTimestampMicros(value: unknown): bigint | undefined {
  const candidate = record(value)?.microsSinceUnixEpoch;
  return typeof candidate === 'bigint'
    && candidate > 0n
    && candidate <= MAX_JAVASCRIPT_DATE_MICROS
    ? candidate
    : undefined;
}

function boundedVisibleBody(value: unknown, visibility: 'visible' | 'tombstoned') {
  if (typeof value !== 'string') return undefined;
  if (visibility === 'tombstoned') return value.length === 0 ? '' : undefined;
  if (
    value.length === 0
    || [...value].length > 500
    || new TextEncoder().encode(value).byteLength > 2_048
    || value.split('\n').length > 8
  ) return undefined;
  return value;
}

export function decodeRealmChatMessage(
  value: unknown,
  timestampField: 'sentAt' | 'sentAtMicros'
): RealmChatMessagePresentation | undefined {
  const row = record(value);
  if (row === undefined) return undefined;
  const senderFid = safePositiveFid(row.senderFid);
  const sentAtMicros = timestampField === 'sentAt'
    ? safeTimestampMicros(row.sentAt)
    : typeof row.sentAtMicros === 'bigint'
      && row.sentAtMicros > 0n
      && row.sentAtMicros <= MAX_JAVASCRIPT_DATE_MICROS
      ? row.sentAtMicros
      : undefined;
  const visibility = row.visibility === 'visible' || row.visibility === 'tombstoned'
    ? row.visibility
    : undefined;
  const body = visibility === undefined
    ? undefined
    : boundedVisibleBody(row.body, visibility);
  if (
    typeof row.messageId !== 'string'
    || !REALM_CHAT_MESSAGE_ID_PATTERN.test(row.messageId)
    || (timestampField === 'sentAt'
      && row.channelKey !== WARPKEEP_REALM_CHAT_CHANNEL_KEY)
    || typeof row.sequence !== 'bigint'
    || row.sequence <= 0n
    || senderFid === undefined
    || sentAtMicros === undefined
    || visibility === undefined
    || body === undefined
  ) return undefined;
  return Object.freeze({
    messageId: row.messageId,
    sequence: row.sequence,
    senderFid,
    body,
    sentAtMicros,
    visibility
  });
}

export function decodeRealmChatProjection(input: Readonly<{
  statusRows: Iterable<unknown>;
  messageRows: Iterable<unknown>;
}>): RealmChatPresentation {
  const statusRows = [...input.statusRows];
  const messageRows = [...input.messageRows];
  if (statusRows.length === 0 && messageRows.length === 0) {
    return UNAVAILABLE_REALM_CHAT_PRESENTATION;
  }
  if (statusRows.length !== 1 || messageRows.length > REALM_CHAT_RECENT_LIMIT) {
    throw new Error('Realm Chat projection is invalid.');
  }
  const status = record(statusRows[0]);
  const mode = status?.mode === 'staged' || status?.mode === 'active' || status?.mode === 'disabled'
    ? status.mode
    : undefined;
  if (
    status?.channelKey !== WARPKEEP_REALM_CHAT_CHANNEL_KEY
    || status.realmId !== WARPKEEP_EXPECTED_WORLD_SEED_NAME
    || status.policyVersion !== WARPKEEP_REALM_CHAT_POLICY_VERSION
    || status.recentLimit !== REALM_CHAT_RECENT_LIMIT
    || status.historyPageLimit !== REALM_CHAT_HISTORY_PAGE_LIMIT
    || mode === undefined
  ) throw new Error('Realm Chat projection is invalid.');

  const messages = messageRows.map(row => decodeRealmChatMessage(row, 'sentAt'));
  if (messages.some(message => message === undefined)) {
    throw new Error('Realm Chat projection is invalid.');
  }
  const sorted = (messages as RealmChatMessagePresentation[])
    .sort((left, right) => left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].sequence >= sorted[index].sequence) {
      throw new Error('Realm Chat projection is invalid.');
    }
  }
  return Object.freeze({
    availability: 'ready',
    channelKey: WARPKEEP_REALM_CHAT_CHANNEL_KEY,
    policyVersion: WARPKEEP_REALM_CHAT_POLICY_VERSION,
    mode,
    messages: Object.freeze(sorted)
  });
}

export function decodeRealmChatHistoryPage(value: unknown): RealmChatHistoryPagePresentation {
  const page = record(value);
  if (
    page?.channelKey !== WARPKEEP_REALM_CHAT_CHANNEL_KEY
    || page.policyVersion !== WARPKEEP_REALM_CHAT_POLICY_VERSION
    || !Array.isArray(page.messages)
    || page.messages.length > REALM_CHAT_HISTORY_PAGE_LIMIT
    || typeof page.hasMore !== 'boolean'
    || (page.nextBeforeSequence !== undefined
      && (typeof page.nextBeforeSequence !== 'bigint' || page.nextBeforeSequence <= 0n))
  ) throw new Error('Realm Chat history is invalid.');
  const messages = page.messages.map(row => decodeRealmChatMessage(row, 'sentAtMicros'));
  if (messages.some(message => message === undefined)) {
    throw new Error('Realm Chat history is invalid.');
  }
  const decoded = messages as RealmChatMessagePresentation[];
  for (let index = 1; index < decoded.length; index += 1) {
    if (decoded[index - 1].sequence <= decoded[index].sequence) {
      throw new Error('Realm Chat history is invalid.');
    }
  }
  if (
    decoded.length === 0
      ? page.nextBeforeSequence !== undefined || page.hasMore
      : page.nextBeforeSequence !== decoded[decoded.length - 1].sequence
  ) throw new Error('Realm Chat history is invalid.');
  return Object.freeze({
    messages: Object.freeze(decoded),
    ...(page.nextBeforeSequence === undefined ? {} : {
      nextBeforeSequence: page.nextBeforeSequence as bigint
    }),
    hasMore: page.hasMore
  });
}
