import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import {
  REALM_CHAT_HISTORY_PAGE_LIMIT,
  REALM_CHAT_HOUR_WINDOW_MICROS,
  REALM_CHAT_POLICY_VERSION,
  REALM_CHAT_RECEIPTS_PER_FID,
  REALM_CHAT_RECENT_LIMIT,
  REALM_CHAT_REPORT_DAY_WINDOW_MICROS,
  REALM_CHAT_REPORT_MAX_PER_MESSAGE,
  REALM_CHAT_REPORT_PENDING_LIMIT,
  REALM_CHAT_REPORT_RATE_EVENTS_MAX,
  REALM_CHAT_REPORT_SEND_PAUSE_THRESHOLD,
  REALM_CHAT_SERVER_ACTIVATION_ALLOWED,
  REALM_CHAT_CHANNEL_KEY,
  REALM_CHAT_REALM_ID,
  RealmChatPolicyError,
  evaluateRealmChatReportRateLimit,
  evaluateRealmChatRateLimit,
  normalizeRealmChatBody,
  normalizeRealmChatReportDetails,
  realmChatBodyDigest,
  realmChatContextBounds,
  realmChatOperationKey,
  realmChatReportKey,
  requireRealmChatMessageId,
  requireRealmChatReportCategory,
  requireRealmChatRequestKey,
} from '../realmChatPolicy';
import warpkeep from '../schema';

const U64_MAXIMUM = (1n << 64n) - 1n;
const ADMIN_REPORT_PAGE_LIMIT = 20;
const REPORT_RESOLUTION_CODES = Object.freeze(['dismissed', 'actioned', 'escalated'] as const);
const MODERATION_CODES = Object.freeze([
  'conduct',
  'privacy',
  'legal',
  'security',
  'service_integrity',
] as const);

const realmChatMessageProjectionV1 = t.object('RealmChatMessageProjectionV1', {
  messageId: t.string(),
  sequence: t.u64(),
  senderFid: t.u64(),
  body: t.string(),
  sentAtMicros: t.u64(),
  visibility: t.string(),
});

const realmChatHistoryPageV1 = t.object('RealmChatHistoryPageV1', {
  channelKey: t.string(),
  policyVersion: t.string(),
  messages: t.array(realmChatMessageProjectionV1),
  nextBeforeSequence: t.option(t.u64()),
  hasMore: t.bool(),
});

const realmChatRecentPageV1 = t.object('RealmChatRecentPageV1', {
  channelKey: t.string(),
  policyVersion: t.string(),
  messages: t.array(realmChatMessageProjectionV1),
  nextAfterSequence: t.u64(),
  hasMore: t.bool(),
});

const adminRealmChatStatusV1 = t.object('AdminRealmChatStatusV1', {
  channelKey: t.string(),
  policyVersion: t.string(),
  mode: t.string(),
  nextSequence: t.u64(),
  archivedMessages: t.u64(),
  recentMessages: t.u64(),
  reports: t.u64(),
  rateEvents: t.u64(),
  reportRateEvents: t.u64(),
  sendReceipts: t.u64(),
  pendingReports: t.u32(),
  graphValid: t.bool(),
  activationCompiled: t.bool(),
});

const adminRealmChatReportEntryV1 = t.object('AdminRealmChatReportEntryV1', {
  reportOrdinal: t.u64(),
  reportId: t.string(),
  reporterFid: t.u64(),
  messageId: t.string(),
  reportedSenderFid: t.u64(),
  messageSequence: t.u64(),
  category: t.string(),
  details: t.string(),
  contextFirstSequence: t.u64(),
  contextLastSequence: t.u64(),
  createdAtMicros: t.u64(),
  status: t.string(),
  reviewedAtMicros: t.option(t.u64()),
  resolutionCode: t.option(t.string()),
});

const adminRealmChatReportPageV1 = t.object('AdminRealmChatReportPageV1', {
  reports: t.array(adminRealmChatReportEntryV1),
  nextBeforeOrdinal: t.option(t.u64()),
  hasMore: t.bool(),
  totalReports: t.u64(),
});

const adminRealmChatReportContextV1 = t.object('AdminRealmChatReportContextV1', {
  report: adminRealmChatReportEntryV1,
  messages: t.array(realmChatMessageProjectionV1),
});

type ChatContext = Parameters<typeof requireGameplayPlayerV1>[0];

function senderPolicyError(error: unknown): never {
  if (error instanceof RealmChatPolicyError) throw new SenderError(error.code);
  if (error instanceof SenderError) throw error;
  throw error;
}

function canonicalMessageId(input: string): string {
  try {
    return requireRealmChatMessageId(input);
  } catch (error) {
    return senderPolicyError(error);
  }
}

function statusMatchesChannel(ctx: ChatContext): boolean {
  const channel = ctx.db.realmChatChannelV1.channelKey.find(REALM_CHAT_CHANNEL_KEY);
  const status = ctx.db.realmChatStatusV1.channelKey.find(REALM_CHAT_CHANNEL_KEY);
  return channel !== null
    && status !== null
    && channel.realmId === REALM_CHAT_REALM_ID
    && status.realmId === REALM_CHAT_REALM_ID
    && channel.policyVersion === REALM_CHAT_POLICY_VERSION
    && status.policyVersion === REALM_CHAT_POLICY_VERSION
    && channel.mode === status.mode
    && status.recentLimit === REALM_CHAT_RECENT_LIMIT
    && status.historyPageLimit === REALM_CHAT_HISTORY_PAGE_LIMIT
    && channel.nextSequence > 0n;
}

function requireChannel(ctx: ChatContext, active: boolean) {
  if (!statusMatchesChannel(ctx)) throw new SenderError('REALM_CHAT_STATE_INTEGRITY');
  const channel = ctx.db.realmChatChannelV1.channelKey.find(REALM_CHAT_CHANNEL_KEY)!;
  if (active && channel.mode !== 'active') throw new SenderError('REALM_CHAT_UNAVAILABLE');
  return channel;
}

function boundedFidRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
  code: string,
): Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    result.push(row);
    if (result.length > maximum) throw new SenderError(code);
  }
  return result;
}

function boundedRowCount<Row>(rows: Iterable<Row>, maximum: number): number | undefined {
  let count = 0;
  for (const _row of rows) {
    if (count === maximum) return undefined;
    count += 1;
  }
  return count;
}

function pruneExpiredRateEvents(
  ctx: ChatContext,
  rows: readonly { eventId: string; acceptedAtMicros: bigint }[],
  nowMicros: bigint,
): void {
  for (const row of rows) {
    if (
      row.acceptedAtMicros > 0n
      && row.acceptedAtMicros <= nowMicros
      && nowMicros - row.acceptedAtMicros >= REALM_CHAT_HOUR_WINDOW_MICROS
    ) ctx.db.realmChatRateEventV1.eventId.delete(row.eventId);
  }
}

function pruneExpiredReportRateEvents(
  ctx: ChatContext,
  rows: readonly { eventId: string; acceptedAtMicros: bigint }[],
  nowMicros: bigint,
): void {
  for (const row of rows) {
    if (
      row.acceptedAtMicros > 0n
      && row.acceptedAtMicros <= nowMicros
      && nowMicros - row.acceptedAtMicros >= REALM_CHAT_REPORT_DAY_WINDOW_MICROS
    ) ctx.db.realmChatReportRateEventV1.eventId.delete(row.eventId);
  }
}

function pruneSendReceipts(ctx: ChatContext, fid: bigint): void {
  const receipts = boundedFidRows(
    ctx.db.realmChatSendReceiptV1.fid.filter(fid),
    REALM_CHAT_RECEIPTS_PER_FID,
    'REALM_CHAT_RECEIPT_STATE_INTEGRITY',
  ).sort((left, right) => {
    const leftMicros = left.createdAt.microsSinceUnixEpoch;
    const rightMicros = right.createdAt.microsSinceUnixEpoch;
    return leftMicros < rightMicros ? -1
      : leftMicros > rightMicros ? 1
        : left.operationKey.localeCompare(right.operationKey);
  });
  const deleteCount = Math.max(0, receipts.length - REALM_CHAT_RECEIPTS_PER_FID + 1);
  for (const receipt of receipts.slice(0, deleteCount)) {
    ctx.db.realmChatSendReceiptV1.operationKey.delete(receipt.operationKey);
  }
}

function pruneRecentProjection(ctx: ChatContext): void {
  const overflow = ctx.db.realmChatRecentV1.count() - BigInt(REALM_CHAT_RECENT_LIMIT);
  if (overflow <= 0n) return;
  if (overflow !== 1n) throw new SenderError('REALM_CHAT_RECENT_STATE_INTEGRITY');
  let oldest: bigint | undefined;
  for (const row of ctx.db.realmChatRecentV1.iter()) {
    if (oldest === undefined || row.sequence < oldest) oldest = row.sequence;
  }
  if (oldest === undefined || !ctx.db.realmChatRecentV1.sequence.delete(oldest)) {
    throw new SenderError('REALM_CHAT_RECENT_STATE_INTEGRITY');
  }
}

function projectMessage(message: Readonly<{
  messageId: string;
  sequence: bigint;
  senderFid: bigint;
  body: string;
  sentAt: Readonly<{ microsSinceUnixEpoch: bigint }>;
  visibility: string;
}>) {
  return {
    messageId: message.messageId,
    sequence: message.sequence,
    senderFid: message.senderFid,
    body: message.visibility === 'visible' ? message.body : '',
    sentAtMicros: message.sentAt.microsSinceUnixEpoch,
    visibility: message.visibility,
  };
}

/** Private moderator evidence retains the original body after public tombstoning. */
function projectEvidenceMessage(message: Parameters<typeof projectMessage>[0]) {
  return {
    ...projectMessage(message),
    body: message.body,
  };
}

/**
 * The private table is a bounded cache, not an independent source of truth.
 * Admin health checks verify that it is the exact newest archive window and
 * that tombstoned bodies cannot survive in the caller-gated projection.
 */
function recentProjectionMatchesArchive(
  ctx: ChatContext,
  channel: Readonly<{ channelKey: string; nextSequence: bigint }>,
): boolean {
  const archiveCount = ctx.db.realmChatMessageV1.count();
  const expectedCount = archiveCount < BigInt(REALM_CHAT_RECENT_LIMIT)
    ? archiveCount
    : BigInt(REALM_CHAT_RECENT_LIMIT);
  if (ctx.db.realmChatRecentV1.count() !== expectedCount) return false;

  const firstSequence = channel.nextSequence - expectedCount;
  for (let sequence = firstSequence; sequence < channel.nextSequence; sequence += 1n) {
    const archive = ctx.db.realmChatMessageV1.sequence.find(sequence);
    const recent = ctx.db.realmChatRecentV1.sequence.find(sequence);
    if (
      archive === null
      || recent === null
      || archive.channelKey !== channel.channelKey
      || recent.channelKey !== channel.channelKey
      || recent.messageId !== archive.messageId
      || recent.senderFid !== archive.senderFid
      || recent.body !== (archive.visibility === 'visible' ? archive.body : '')
      || recent.sentAt.microsSinceUnixEpoch !== archive.sentAt.microsSinceUnixEpoch
      || recent.visibility !== archive.visibility
    ) return false;
  }
  return true;
}

function reportEntry(report: Readonly<{
  reportOrdinal: bigint;
  reportId: string;
  reporterFid: bigint;
  messageId: string;
  reportedSenderFid: bigint;
  messageSequence: bigint;
  category: string;
  details: string;
  contextFirstSequence: bigint;
  contextLastSequence: bigint;
  createdAt: Readonly<{ microsSinceUnixEpoch: bigint }>;
  status: string;
  reviewedAt?: Readonly<{ microsSinceUnixEpoch: bigint }>;
  resolutionCode?: string;
}>) {
  return {
    reportOrdinal: report.reportOrdinal,
    reportId: report.reportId,
    reporterFid: report.reporterFid,
    messageId: report.messageId,
    reportedSenderFid: report.reportedSenderFid,
    messageSequence: report.messageSequence,
    category: report.category,
    details: report.details,
    contextFirstSequence: report.contextFirstSequence,
    contextLastSequence: report.contextLastSequence,
    createdAtMicros: report.createdAt.microsSinceUnixEpoch,
    status: report.status,
    reviewedAtMicros: report.reviewedAt?.microsSinceUnixEpoch,
    resolutionCode: report.resolutionCode,
  };
}

/** Exactly-once, server-authored send path. Rejected attempts write nothing. */
export const sendRealmChatMessageV1 = warpkeep.reducer(
  { name: 'send_realm_chat_message_v1' },
  { requestKey: t.string(), body: t.string() },
  (ctx, { requestKey, body }) => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      const normalizedBody = normalizeRealmChatBody(body);
      const normalizedRequestKey = requireRealmChatRequestKey(requestKey);
      const digest = realmChatBodyDigest(normalizedBody);
      const operationKey = realmChatOperationKey(claims.fid, normalizedRequestKey);
      const existing = ctx.db.realmChatSendReceiptV1.operationKey.find(operationKey);
      if (existing !== null) {
        const message = ctx.db.realmChatMessageV1.messageId.find(existing.messageId);
        if (
          existing.fid !== claims.fid
          || existing.requestKey !== normalizedRequestKey
          || existing.bodyDigest !== digest
          || message === null
          || message.sequence !== existing.sequence
          || realmChatBodyDigest(message.body) !== digest
        ) throw new SenderError('REALM_CHAT_IDEMPOTENCY_CONFLICT');
        return;
      }

      const channel = requireChannel(ctx, true);
      if (channel.pendingReports >= REALM_CHAT_REPORT_SEND_PAUSE_THRESHOLD) {
        throw new SenderError('REALM_CHAT_MODERATION_BACKLOG');
      }
      const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
      const rateRows = boundedFidRows(
        ctx.db.realmChatRateEventV1.fid.filter(claims.fid),
        60,
        'REALM_CHAT_RATE_STATE_INTEGRITY',
      );
      evaluateRealmChatRateLimit(rateRows, nowMicros, digest);
      pruneExpiredRateEvents(ctx, rateRows, nowMicros);
      pruneSendReceipts(ctx, claims.fid);

      if (channel.nextSequence <= 0n || channel.nextSequence === U64_MAXIMUM) {
        throw new SenderError('REALM_CHAT_SEQUENCE_EXHAUSTED');
      }
      const message = ctx.db.realmChatMessageV1.insert({
        messageId: ctx.newUuidV7().toString(),
        sequence: channel.nextSequence,
        channelKey: channel.channelKey,
        senderFid: claims.fid,
        body: normalizedBody,
        sentAt: ctx.timestamp,
        visibility: 'visible',
        moderatedAt: undefined,
        moderationCode: undefined,
      });
      ctx.db.realmChatChannelV1.channelKey.update({
        ...channel,
        nextSequence: channel.nextSequence + 1n,
        updatedAt: ctx.timestamp,
      });
      ctx.db.realmChatRecentV1.insert({
        sequence: message.sequence,
        messageId: message.messageId,
        channelKey: message.channelKey,
        senderFid: message.senderFid,
        body: message.body,
        sentAt: message.sentAt,
        visibility: message.visibility,
      });
      ctx.db.realmChatRateEventV1.insert({
        eventId: message.messageId,
        fid: claims.fid,
        acceptedAtMicros: nowMicros,
        bodyDigest: digest,
      });
      ctx.db.realmChatSendReceiptV1.insert({
        operationKey,
        fid: claims.fid,
        requestKey: normalizedRequestKey,
        bodyDigest: digest,
        messageId: message.messageId,
        sequence: message.sequence,
        createdAt: ctx.timestamp,
      });
      pruneRecentProjection(ctx);
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Caller-authenticated live window. Every poll rechecks admission, current
 * agreement, resource graph, and active-channel state before returning bodies.
 */
export const getRealmChatRecentV1 = warpkeep.procedure(
  { name: 'get_realm_chat_recent_v1' },
  { afterSequence: t.u64(), limit: t.u32() },
  realmChatRecentPageV1,
  (ctx, { afterSequence, limit }) => ctx.withTx(tx => {
    try {
      requireGameplayPlayerV1(tx);
      const channel = requireChannel(tx, true);
      if (!Number.isInteger(limit) || limit < 1 || limit > REALM_CHAT_RECENT_LIMIT) {
        throw new SenderError('REALM_CHAT_RECENT_LIMIT');
      }
      const latestSequence = channel.nextSequence - 1n;
      if (afterSequence > latestSequence) throw new SenderError('REALM_CHAT_RECENT_CURSOR');
      if (!recentProjectionMatchesArchive(tx, channel)) {
        throw new SenderError('REALM_CHAT_RECENT_STATE_INTEGRITY');
      }
      const rows = boundedFidRows(
        tx.db.realmChatRecentV1.iter(),
        REALM_CHAT_RECENT_LIMIT,
        'REALM_CHAT_RECENT_STATE_INTEGRITY',
      ).sort((left, right) => (
        left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0
      ));
      const candidates = rows.filter(row => row.sequence > afterSequence);
      const messages = candidates.slice(0, limit).map(projectMessage);
      return {
        channelKey: channel.channelKey,
        policyVersion: channel.policyVersion,
        messages,
        nextAfterSequence: messages.length === 0
          ? afterSequence
          : messages[messages.length - 1]!.sequence,
        hasMore: candidates.length > messages.length,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

/** Caller-gated, exclusive-cursor history. It reads at most 50 sequence keys. */
export const getRealmChatHistoryV1 = warpkeep.procedure(
  { name: 'get_realm_chat_history_v1' },
  { beforeSequence: t.u64(), limit: t.u32() },
  realmChatHistoryPageV1,
  (ctx, { beforeSequence, limit }) => ctx.withTx(tx => {
    try {
      requireGameplayPlayerV1(tx);
      const channel = requireChannel(tx, true);
      if (!Number.isInteger(limit) || limit < 1 || limit > REALM_CHAT_HISTORY_PAGE_LIMIT) {
        throw new SenderError('REALM_CHAT_HISTORY_LIMIT');
      }
      if (beforeSequence > channel.nextSequence) {
        throw new SenderError('REALM_CHAT_HISTORY_CURSOR');
      }
      let cursor = beforeSequence === 0n ? channel.nextSequence : beforeSequence;
      const messages = [];
      while (cursor > 1n && messages.length < limit) {
        cursor -= 1n;
        const message = tx.db.realmChatMessageV1.sequence.find(cursor);
        if (message === null || message.channelKey !== channel.channelKey) {
          throw new SenderError('REALM_CHAT_HISTORY_INTEGRITY');
        }
        messages.push(projectMessage(message));
      }
      return {
        channelKey: channel.channelKey,
        policyVersion: channel.policyVersion,
        messages,
        nextBeforeSequence: messages.length === 0
          ? undefined
          : messages[messages.length - 1].sequence,
        hasMore: cursor > 1n,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

/** One private report per caller/message; recording never changes visibility. */
export const reportRealmChatMessageV1 = warpkeep.reducer(
  { name: 'report_realm_chat_message_v1' },
  { messageId: t.string(), category: t.string(), details: t.string() },
  (ctx, { messageId, category, details }) => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      const channel = requireChannel(ctx, false);
      const message = ctx.db.realmChatMessageV1.messageId.find(
        canonicalMessageId(messageId),
      );
      if (message === null || message.channelKey !== REALM_CHAT_CHANNEL_KEY) {
        throw new SenderError('REALM_CHAT_MESSAGE_NOT_FOUND');
      }
      if (message.senderFid === claims.fid) throw new SenderError('REALM_CHAT_REPORT_SELF');
      const normalizedCategory = requireRealmChatReportCategory(category);
      const normalizedDetails = normalizeRealmChatReportDetails(details);
      const key = realmChatReportKey(claims.fid, message.messageId);
      const existing = ctx.db.realmChatReportV1.reportKey.find(key);
      if (existing !== null) {
        if (
          existing.reporterFid !== claims.fid
          || existing.messageId !== message.messageId
          || existing.category !== normalizedCategory
          || existing.details !== normalizedDetails
        ) throw new SenderError('REALM_CHAT_REPORT_ALREADY_EXISTS');
        return;
      }
      if (channel.pendingReports >= REALM_CHAT_REPORT_PENDING_LIMIT) {
        throw new SenderError('REALM_CHAT_REPORT_BACKLOG_FULL');
      }
      const reportsForMessage = boundedFidRows(
        ctx.db.realmChatReportV1.messageId.filter(message.messageId),
        REALM_CHAT_REPORT_MAX_PER_MESSAGE,
        'REALM_CHAT_REPORT_TARGET_STATE_INTEGRITY',
      );
      if (reportsForMessage.length >= REALM_CHAT_REPORT_MAX_PER_MESSAGE) {
        throw new SenderError('REALM_CHAT_REPORT_TARGET_SATURATED');
      }
      const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
      const reportRateRows = boundedFidRows(
        ctx.db.realmChatReportRateEventV1.iter(),
        REALM_CHAT_REPORT_RATE_EVENTS_MAX,
        'REALM_CHAT_REPORT_RATE_STATE_INTEGRITY',
      );
      evaluateRealmChatReportRateLimit(reportRateRows, nowMicros, claims.fid);
      const context = realmChatContextBounds(message.sequence, channel.nextSequence - 1n);
      const reportId = ctx.newUuidV7().toString();
      ctx.db.realmChatReportV1.insert({
        reportOrdinal: 0n,
        reportKey: key,
        reportId,
        reporterFid: claims.fid,
        messageId: message.messageId,
        reportedSenderFid: message.senderFid,
        messageSequence: message.sequence,
        category: normalizedCategory,
        details: normalizedDetails,
        contextFirstSequence: context.first,
        contextLastSequence: context.last,
        createdAt: ctx.timestamp,
        status: 'pending',
        reviewedAt: undefined,
        resolutionCode: undefined,
      });
      pruneExpiredReportRateEvents(ctx, reportRateRows, nowMicros);
      ctx.db.realmChatReportRateEventV1.insert({
        eventId: reportId,
        reporterFid: claims.fid,
        acceptedAtMicros: nowMicros,
      });
      ctx.db.realmChatChannelV1.channelKey.update({
        ...channel,
        pendingReports: channel.pendingReports + 1,
        updatedAt: ctx.timestamp,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

function inspectRealmChat(ctx: ChatContext) {
  const channel = ctx.db.realmChatChannelV1.channelKey.find(REALM_CHAT_CHANNEL_KEY);
  const pendingReportCount = boundedRowCount(
    ctx.db.realmChatReportV1.status.filter('pending'),
    REALM_CHAT_REPORT_PENDING_LIMIT,
  );
  return {
    channelKey: REALM_CHAT_CHANNEL_KEY,
    policyVersion: REALM_CHAT_POLICY_VERSION,
    mode: channel?.mode ?? 'unconfigured',
    nextSequence: channel?.nextSequence ?? 0n,
    archivedMessages: ctx.db.realmChatMessageV1.count(),
    recentMessages: ctx.db.realmChatRecentV1.count(),
    reports: ctx.db.realmChatReportV1.count(),
    rateEvents: ctx.db.realmChatRateEventV1.count(),
    reportRateEvents: ctx.db.realmChatReportRateEventV1.count(),
    sendReceipts: ctx.db.realmChatSendReceiptV1.count(),
    pendingReports: channel?.pendingReports ?? 0,
    graphValid: channel === null
      ? ctx.db.realmChatStatusV1.count() === 0n
        && ctx.db.realmChatChannelV1.count() === 0n
        && ctx.db.realmChatMessageV1.count() === 0n
        && ctx.db.realmChatRecentV1.count() === 0n
        && ctx.db.realmChatRateEventV1.count() === 0n
        && ctx.db.realmChatReportRateEventV1.count() === 0n
        && ctx.db.realmChatSendReceiptV1.count() === 0n
        && ctx.db.realmChatReportV1.count() === 0n
      : ctx.db.realmChatStatusV1.count() === 1n
        && ctx.db.realmChatChannelV1.count() === 1n
        && statusMatchesChannel(ctx)
        && channel.pendingReports <= REALM_CHAT_REPORT_PENDING_LIMIT
        && ctx.db.realmChatReportRateEventV1.count()
          <= BigInt(REALM_CHAT_REPORT_RATE_EVENTS_MAX)
        && pendingReportCount !== undefined
        && pendingReportCount === channel.pendingReports
        && channel.nextSequence === ctx.db.realmChatMessageV1.count() + 1n
        && recentProjectionMatchesArchive(ctx, channel),
    activationCompiled: REALM_CHAT_SERVER_ACTIVATION_ALLOWED,
  };
}

export const adminGetRealmChatStatusV1 = warpkeep.procedure(
  { name: 'admin_get_realm_chat_status_v1' },
  adminRealmChatStatusV1,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    return inspectRealmChat(tx);
  }),
);

/** Append-only schema can be staged, but this build cannot activate it. */
export const adminStageRealmChatV1 = warpkeep.reducer(
  { name: 'admin_stage_realm_chat_v1' },
  ctx => {
    const admin = requireAdmin(ctx);
    const before = inspectRealmChat(ctx);
    if (!before.graphValid) throw new SenderError('REALM_CHAT_STATE_INTEGRITY');
    const existing = ctx.db.realmChatChannelV1.channelKey.find(REALM_CHAT_CHANNEL_KEY);
    if (existing !== null) {
      if (existing.mode !== 'staged') throw new SenderError('REALM_CHAT_ALREADY_CONFIGURED');
      return;
    }
    ctx.db.realmChatChannelV1.insert({
      channelKey: REALM_CHAT_CHANNEL_KEY,
      realmId: REALM_CHAT_REALM_ID,
      policyVersion: REALM_CHAT_POLICY_VERSION,
      mode: 'staged',
      nextSequence: 1n,
      pendingReports: 0,
      updatedAt: ctx.timestamp,
    });
    ctx.db.realmChatStatusV1.insert({
      channelKey: REALM_CHAT_CHANNEL_KEY,
      realmId: REALM_CHAT_REALM_ID,
      policyVersion: REALM_CHAT_POLICY_VERSION,
      mode: 'staged',
      recentLimit: REALM_CHAT_RECENT_LIMIT,
      historyPageLimit: REALM_CHAT_HISTORY_PAGE_LIMIT,
      updatedAt: ctx.timestamp,
    });
    ctx.db.adminAudit.insert({
      id: 0n,
      action: 'realm_chat_staged_v1',
      targetFid: undefined,
      actorSubject: admin.subject,
      createdAt: ctx.timestamp,
      note: `channel=${REALM_CHAT_CHANNEL_KEY};policy=${REALM_CHAT_POLICY_VERSION}`,
    });
  },
);

export const adminActivateRealmChatV1 = warpkeep.reducer(
  { name: 'admin_activate_realm_chat_v1' },
  { expectedPolicyVersion: t.string() },
  (ctx, { expectedPolicyVersion }) => {
    const admin = requireAdmin(ctx);
    if (!REALM_CHAT_SERVER_ACTIVATION_ALLOWED) {
      throw new SenderError('REALM_CHAT_ACTIVATION_NOT_COMPILED');
    }
    if (expectedPolicyVersion !== REALM_CHAT_POLICY_VERSION) {
      throw new SenderError('REALM_CHAT_POLICY_MISMATCH');
    }
    const channel = requireChannel(ctx, false);
    if (channel.mode === 'active') return;
    if (channel.mode !== 'staged') throw new SenderError('REALM_CHAT_NOT_STAGED');
    const status = ctx.db.realmChatStatusV1.channelKey.find(channel.channelKey)!;
    ctx.db.realmChatChannelV1.channelKey.update({ ...channel, mode: 'active', updatedAt: ctx.timestamp });
    ctx.db.realmChatStatusV1.channelKey.update({ ...status, mode: 'active', updatedAt: ctx.timestamp });
    ctx.db.adminAudit.insert({
      id: 0n,
      action: 'realm_chat_activated_v1',
      targetFid: undefined,
      actorSubject: admin.subject,
      createdAt: ctx.timestamp,
      note: `channel=${REALM_CHAT_CHANNEL_KEY};policy=${REALM_CHAT_POLICY_VERSION}`,
    });
  },
);

export const adminDisableRealmChatV1 = warpkeep.reducer(
  { name: 'admin_disable_realm_chat_v1' },
  ctx => {
    const admin = requireAdmin(ctx);
    const channel = requireChannel(ctx, false);
    const status = ctx.db.realmChatStatusV1.channelKey.find(channel.channelKey)!;
    if (channel.mode === 'disabled') return;
    ctx.db.realmChatChannelV1.channelKey.update({ ...channel, mode: 'disabled', updatedAt: ctx.timestamp });
    ctx.db.realmChatStatusV1.channelKey.update({ ...status, mode: 'disabled', updatedAt: ctx.timestamp });
    ctx.db.adminAudit.insert({
      id: 0n,
      action: 'realm_chat_disabled_v1',
      targetFid: undefined,
      actorSubject: admin.subject,
      createdAt: ctx.timestamp,
      note: `channel=${REALM_CHAT_CHANNEL_KEY}`,
    });
  },
);

export const adminTombstoneRealmChatMessageV1 = warpkeep.reducer(
  { name: 'admin_tombstone_realm_chat_message_v1' },
  { messageId: t.string(), moderationCode: t.string() },
  (ctx, { messageId, moderationCode }) => {
    const admin = requireAdmin(ctx);
    if (!(MODERATION_CODES as readonly string[]).includes(moderationCode)) {
      throw new SenderError('REALM_CHAT_MODERATION_CODE_INVALID');
    }
    const message = ctx.db.realmChatMessageV1.messageId.find(
      canonicalMessageId(messageId),
    );
    if (message === null) throw new SenderError('REALM_CHAT_MESSAGE_NOT_FOUND');
    if (message.visibility === 'tombstoned') return;
    if (message.visibility !== 'visible') throw new SenderError('REALM_CHAT_VISIBILITY_INVALID');
    ctx.db.realmChatMessageV1.messageId.update({
      ...message,
      visibility: 'tombstoned',
      moderatedAt: ctx.timestamp,
      moderationCode,
    });
    const recent = ctx.db.realmChatRecentV1.sequence.find(message.sequence);
    if (recent !== null) {
      ctx.db.realmChatRecentV1.sequence.update({
        ...recent,
        body: '',
        visibility: 'tombstoned',
      });
    }
    ctx.db.adminAudit.insert({
      id: 0n,
      action: 'realm_chat_message_tombstoned_v1',
      targetFid: message.senderFid,
      actorSubject: admin.subject,
      createdAt: ctx.timestamp,
      note: `message=${message.messageId};code=${moderationCode}`,
    });
  },
);

export const adminListRealmChatReportsV1 = warpkeep.procedure(
  { name: 'admin_list_realm_chat_reports_v1' },
  { beforeOrdinal: t.u64(), limit: t.u32() },
  adminRealmChatReportPageV1,
  (ctx, { beforeOrdinal, limit }) => ctx.withTx(tx => {
    requireAdmin(tx);
    if (!Number.isInteger(limit) || limit < 1 || limit > ADMIN_REPORT_PAGE_LIMIT) {
      throw new SenderError('REALM_CHAT_REPORT_PAGE_LIMIT');
    }
    const totalReports = tx.db.realmChatReportV1.count();
    if (beforeOrdinal > totalReports + 1n) throw new SenderError('REALM_CHAT_REPORT_CURSOR');
    let cursor = beforeOrdinal === 0n ? totalReports + 1n : beforeOrdinal;
    const reports = [];
    while (cursor > 1n && reports.length < limit) {
      cursor -= 1n;
      const report = tx.db.realmChatReportV1.reportOrdinal.find(cursor);
      if (report === null) throw new SenderError('REALM_CHAT_REPORT_STATE_INTEGRITY');
      reports.push(reportEntry(report));
    }
    return {
      reports,
      nextBeforeOrdinal: reports.length === 0
        ? undefined
        : reports[reports.length - 1].reportOrdinal,
      hasMore: cursor > 1n,
      totalReports,
    };
  }),
);

export const adminGetRealmChatReportContextV1 = warpkeep.procedure(
  { name: 'admin_get_realm_chat_report_context_v1' },
  { reportId: t.string() },
  adminRealmChatReportContextV1,
  (ctx, { reportId }) => ctx.withTx(tx => {
    requireAdmin(tx);
    const report = tx.db.realmChatReportV1.reportId.find(
      canonicalMessageId(reportId),
    );
    if (report === null) throw new SenderError('REALM_CHAT_REPORT_NOT_FOUND');
    const messages = [];
    for (
      let sequence = report.contextFirstSequence;
      sequence <= report.contextLastSequence;
      sequence += 1n
    ) {
      const message = tx.db.realmChatMessageV1.sequence.find(sequence);
      if (message !== null) messages.push(projectEvidenceMessage(message));
      if (sequence === U64_MAXIMUM) break;
    }
    return { report: reportEntry(report), messages };
  }),
);

export const adminResolveRealmChatReportV1 = warpkeep.reducer(
  { name: 'admin_resolve_realm_chat_report_v1' },
  { reportId: t.string(), resolutionCode: t.string() },
  (ctx, { reportId, resolutionCode }) => {
    const admin = requireAdmin(ctx);
    if (!(REPORT_RESOLUTION_CODES as readonly string[]).includes(resolutionCode)) {
      throw new SenderError('REALM_CHAT_REPORT_RESOLUTION_INVALID');
    }
    const report = ctx.db.realmChatReportV1.reportId.find(
      canonicalMessageId(reportId),
    );
    if (report === null) throw new SenderError('REALM_CHAT_REPORT_NOT_FOUND');
    if (report.status === 'resolved') {
      if (report.resolutionCode !== resolutionCode) {
        throw new SenderError('REALM_CHAT_REPORT_ALREADY_RESOLVED');
      }
      return;
    }
    if (report.status !== 'pending') throw new SenderError('REALM_CHAT_REPORT_STATE_INTEGRITY');
    const channel = requireChannel(ctx, false);
    if (channel.pendingReports <= 0) throw new SenderError('REALM_CHAT_REPORT_STATE_INTEGRITY');
    ctx.db.realmChatReportV1.reportOrdinal.update({
      ...report,
      status: 'resolved',
      reviewedAt: ctx.timestamp,
      resolutionCode,
    });
    ctx.db.realmChatChannelV1.channelKey.update({
      ...channel,
      pendingReports: channel.pendingReports - 1,
      updatedAt: ctx.timestamp,
    });
    ctx.db.adminAudit.insert({
      id: 0n,
      action: 'realm_chat_report_resolved_v1',
      targetFid: report.reportedSenderFid,
      actorSubject: admin.subject,
      createdAt: ctx.timestamp,
      note: `report=${report.reportId};resolution=${resolutionCode}`,
    });
  },
);
