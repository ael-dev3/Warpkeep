import { describe, expect, it } from 'vitest';

import {
  REALM_CHAT_HOUR_WINDOW_MICROS,
  REALM_CHAT_MAX_LINES,
  REALM_CHAT_MAX_PER_HOUR,
  REALM_CHAT_MAX_PER_MINUTE,
  RealmChatPolicyError,
  evaluateRealmChatRateLimit,
  normalizeRealmChatBody,
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
});
