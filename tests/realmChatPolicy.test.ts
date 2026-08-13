import { describe, expect, it } from 'vitest';

import {
  REALM_CHAT_HOUR_WINDOW_MICROS,
  REALM_CHAT_MAX_LINES,
  REALM_CHAT_MAX_PER_HOUR,
  REALM_CHAT_MAX_PER_MINUTE,
  REALM_CHAT_REPORT_DAY_WINDOW_MICROS,
  REALM_CHAT_REPORT_MAX_GLOBAL_DAY,
  REALM_CHAT_REPORT_MAX_GLOBAL_HOUR,
  REALM_CHAT_REPORT_MAX_PER_MESSAGE,
  REALM_CHAT_REPORT_MAX_PER_REPORTER_DAY,
  REALM_CHAT_REPORT_MAX_PER_REPORTER_HOUR,
  REALM_CHAT_REPORT_PENDING_LIMIT,
  REALM_CHAT_REPORT_SEND_PAUSE_THRESHOLD,
  RealmChatPolicyError,
  evaluateRealmChatReportRateLimit,
  evaluateRealmChatRateLimit,
  normalizeRealmChatBody,
  normalizeRealmChatReportDetails,
  realmChatBodyDigest,
  realmChatContextBounds,
  requireRealmChatMessageId,
  requireRealmChatReportCategory,
  requireRealmChatRequestKey,
} from '../spacetimedb/src/realmChatPolicy';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof RealmChatPolicyError ? error.code : undefined;
  }
}

describe('Realm Chat policy', () => {
  it('normalizes line endings and Unicode while preserving ordinary RTL text', () => {
    expect(normalizeRealmChatBody('  Cafe\u0301\r\nمرحبا  ')).toBe('Café\nمرحبا');
    expect(code(() => normalizeRealmChatBody('\u202eevil'))).toBe('REALM_CHAT_BODY_CONTROL');
    expect(code(() => normalizeRealmChatBody('   '))).toBe('REALM_CHAT_BODY_EMPTY');
    expect(code(() => normalizeRealmChatBody(
      Array.from({ length: REALM_CHAT_MAX_LINES + 1 }, () => 'line').join('\n'),
    ))).toBe('REALM_CHAT_BODY_LINES');
  });

  it('enforces Unicode-scalar and UTF-8 byte limits independently', () => {
    expect(normalizeRealmChatBody('😀'.repeat(500))).toBe('😀'.repeat(500));
    expect(code(() => normalizeRealmChatBody('😀'.repeat(501))))
      .toBe('REALM_CHAT_BODY_SCALARS');
    expect(code(() => normalizeRealmChatBody('€'.repeat(500))))
      .toBeUndefined();
  });

  it('uses canonical operation identifiers and fixed report categories', () => {
    expect(requireRealmChatRequestKey('018f7b44-5f2f-7c54-8c0d-3f521d46b193'))
      .toBe('018f7b44-5f2f-7c54-8c0d-3f521d46b193');
    expect(code(() => requireRealmChatRequestKey('../not-an-operation')))
      .toBe('REALM_CHAT_REQUEST_KEY_INVALID');
    expect(requireRealmChatMessageId('018f7b44-5f2f-7c54-8c0d-3f521d46b193'))
      .toBe('018f7b44-5f2f-7c54-8c0d-3f521d46b193');
    expect(code(() => requireRealmChatMessageId('018f7b44-5f2f-4c54-8c0d-3f521d46b193')))
      .toBe('REALM_CHAT_MESSAGE_ID_INVALID');
    expect(requireRealmChatReportCategory('spam_or_disruption')).toBe('spam_or_disruption');
    expect(code(() => requireRealmChatReportCategory('ban_player')))
      .toBe('REALM_CHAT_REPORT_CATEGORY_INVALID');
  });

  it('bounds optional report details to 250 Unicode scalars and 512 UTF-8 bytes', () => {
    expect(normalizeRealmChatReportDetails('a'.repeat(250))).toBe('a'.repeat(250));
    expect(code(() => normalizeRealmChatReportDetails('a'.repeat(251))))
      .toBe('REALM_CHAT_REPORT_DETAILS_SCALARS');
    expect(normalizeRealmChatReportDetails(`${'€'.repeat(170)}ab`))
      .toBe(`${'€'.repeat(170)}ab`);
    expect(code(() => normalizeRealmChatReportDetails('€'.repeat(171))))
      .toBe('REALM_CHAT_REPORT_DETAILS_BYTES');
  });

  it('pins the pre-activation report and moderation-backlog envelope', () => {
    expect({
      reporterHour: REALM_CHAT_REPORT_MAX_PER_REPORTER_HOUR,
      reporterDay: REALM_CHAT_REPORT_MAX_PER_REPORTER_DAY,
      perMessage: REALM_CHAT_REPORT_MAX_PER_MESSAGE,
      globalHour: REALM_CHAT_REPORT_MAX_GLOBAL_HOUR,
      globalDay: REALM_CHAT_REPORT_MAX_GLOBAL_DAY,
      sendPause: REALM_CHAT_REPORT_SEND_PAUSE_THRESHOLD,
      pendingLimit: REALM_CHAT_REPORT_PENDING_LIMIT,
    }).toEqual({
      reporterHour: 5,
      reporterDay: 20,
      perMessage: 20,
      globalHour: 250,
      globalDay: 1_000,
      sendPause: 4_000,
      pendingLimit: 5_000,
    });
  });

  it('enforces cooldown, duplicate, exact rolling minute, and rolling hour limits', () => {
    const now = 4_000_000_000n;
    const digest = realmChatBodyDigest('hello');
    expect(code(() => evaluateRealmChatRateLimit([
      { acceptedAtMicros: now - 1_000_000n, bodyDigest: realmChatBodyDigest('other') },
    ], now, digest))).toBe('REALM_CHAT_RATE_COOLDOWN');
    expect(code(() => evaluateRealmChatRateLimit([
      { acceptedAtMicros: now - 3_000_000n, bodyDigest: digest },
    ], now, digest))).toBe('REALM_CHAT_RATE_DUPLICATE');
    expect(code(() => evaluateRealmChatRateLimit(
      Array.from({ length: REALM_CHAT_MAX_PER_MINUTE }, (_, index) => ({
        acceptedAtMicros: now - 59_000_000n + BigInt(index) * 3_000_000n,
        bodyDigest: realmChatBodyDigest(`minute-${index}`),
      })),
      now,
      digest,
    ))).toBe('REALM_CHAT_RATE_MINUTE');
    expect(code(() => evaluateRealmChatRateLimit(
      Array.from({ length: REALM_CHAT_MAX_PER_HOUR }, (_, index) => ({
        acceptedAtMicros: now - REALM_CHAT_HOUR_WINDOW_MICROS + 1n
          + BigInt(index) * 60_000_000n,
        bodyDigest: realmChatBodyDigest(`hour-${index}`),
      })),
      now,
      digest,
    ))).toBe('REALM_CHAT_RATE_HOUR');
  });

  it('prunes expired rate events and bounds report context at sequence one', () => {
    const now = 4_000_000_000n;
    const decision = evaluateRealmChatRateLimit([
      {
        acceptedAtMicros: now - REALM_CHAT_HOUR_WINDOW_MICROS,
        bodyDigest: realmChatBodyDigest('expired'),
      },
    ], now, realmChatBodyDigest('new'));
    expect(decision.retained).toEqual([]);
    expect(realmChatContextBounds(1n, 1n)).toEqual({ first: 1n, last: 1n });
    expect(realmChatContextBounds(100n, 105n)).toEqual({ first: 90n, last: 105n });
    expect(realmChatContextBounds(100n, 120n)).toEqual({ first: 90n, last: 110n });
  });

  it('enforces exact rolling reporter report quotas using server-time events', () => {
    const now = 100_000_000_000n;
    const reporter = 7n;
    expect(code(() => evaluateRealmChatReportRateLimit(
      Array.from({ length: REALM_CHAT_REPORT_MAX_PER_REPORTER_HOUR }, (_, index) => ({
        reporterFid: reporter,
        acceptedAtMicros: now - 1n - BigInt(index),
      })),
      now,
      reporter,
    ))).toBe('REALM_CHAT_REPORT_RATE_REPORTER_HOUR');

    expect(code(() => evaluateRealmChatReportRateLimit(
      Array.from({ length: REALM_CHAT_REPORT_MAX_PER_REPORTER_DAY }, (_, index) => ({
        reporterFid: reporter,
        acceptedAtMicros: now - REALM_CHAT_HOUR_WINDOW_MICROS - 1n - BigInt(index),
      })),
      now,
      reporter,
    ))).toBe('REALM_CHAT_REPORT_RATE_REPORTER_DAY');
  });

  it('enforces exact global report quotas and expires the day boundary', () => {
    const now = 100_000_000_000n;
    expect(code(() => evaluateRealmChatReportRateLimit(
      Array.from({ length: REALM_CHAT_REPORT_MAX_GLOBAL_HOUR }, (_, index) => ({
        reporterFid: BigInt(index + 1),
        acceptedAtMicros: now - 1n - BigInt(index),
      })),
      now,
      10_000n,
    ))).toBe('REALM_CHAT_REPORT_RATE_GLOBAL_HOUR');

    expect(code(() => evaluateRealmChatReportRateLimit(
      Array.from({ length: REALM_CHAT_REPORT_MAX_GLOBAL_DAY }, (_, index) => ({
        reporterFid: BigInt(index + 1),
        acceptedAtMicros: now - REALM_CHAT_HOUR_WINDOW_MICROS - 1n - BigInt(index),
      })),
      now,
      10_000n,
    ))).toBe('REALM_CHAT_REPORT_RATE_GLOBAL_DAY');

    expect(evaluateRealmChatReportRateLimit([{
      reporterFid: 1n,
      acceptedAtMicros: now - REALM_CHAT_REPORT_DAY_WINDOW_MICROS,
    }], now, 1n)).toEqual([]);
  });
});
