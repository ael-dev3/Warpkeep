import { describe, expect, it } from 'vitest';
import { Timestamp } from 'spacetimedb';

import {
  decodeRealmChatHistoryPage,
  decodeRealmChatRecentPage,
  decodeRealmChatStatusProjection,
  mergeRealmChatRecentPage
} from '../src/spacetime/realmChatPresentation';
import {
  WARPKEEP_REALM_CHAT_CHANNEL_KEY,
  WARPKEEP_REALM_CHAT_POLICY_VERSION
} from '../src/legal/realmChatPolicy';

const status = {
  channelKey: WARPKEEP_REALM_CHAT_CHANNEL_KEY,
  realmId: 'HEGEMONY_GENESIS_001',
  policyVersion: WARPKEEP_REALM_CHAT_POLICY_VERSION,
  mode: 'active',
  recentLimit: 128,
  historyPageLimit: 50,
  updatedAt: new Timestamp(1_000_000n)
};

const message = (sequence: bigint) => ({
  sequence,
  messageId: `018f7b44-5f2f-7c54-8c0d-${sequence.toString().padStart(12, '0')}`,
  senderFid: 1n,
  body: `Message ${sequence}`,
  sentAtMicros: 1_000_000n + sequence,
  visibility: 'visible'
});

const recentPage = (sequences: readonly bigint[], hasMore = false) => ({
  channelKey: WARPKEEP_REALM_CHAT_CHANNEL_KEY,
  policyVersion: WARPKEEP_REALM_CHAT_POLICY_VERSION,
  messages: sequences.map(message),
  nextAfterSequence: sequences.at(-1) ?? 0n,
  hasMore
});

describe('Realm Chat browser projection', () => {
  it('keeps the public readiness projection body-free', () => {
    const projection = decodeRealmChatStatusProjection({ statusRows: [status] });
    expect(projection).toMatchObject({ mode: 'active', messages: [] });
  });

  it('decodes and merges bounded caller-authenticated recent pages', () => {
    const projection = decodeRealmChatStatusProjection({ statusRows: [status] });
    const first = decodeRealmChatRecentPage(recentPage([1n, 2n]));
    const current = mergeRealmChatRecentPage(projection, projection, first);
    const second = decodeRealmChatRecentPage(recentPage([3n]));
    expect(mergeRealmChatRecentPage(projection, current, second).messages.map(row => row.sequence))
      .toEqual([1n, 2n, 3n]);
  });

  it('rejects recent bodies and ordering that violate the private procedure contract', () => {
    expect(() => decodeRealmChatRecentPage({
      ...recentPage([1n]),
      messages: [{ ...message(1n), visibility: 'tombstoned', body: 'still exposed' }]
    })).toThrow(/recent page is invalid/i);
    expect(() => decodeRealmChatRecentPage(recentPage([2n, 1n])))
      .toThrow(/recent page is invalid/i);
  });

  it('rejects status and recent pages outside the canonical realm channel', () => {
    expect(() => decodeRealmChatStatusProjection({
      statusRows: [{ ...status, realmId: 'FOREIGN_REALM' }]
    })).toThrow(/projection is invalid/i);
    expect(() => decodeRealmChatRecentPage({
      ...recentPage([1n]),
      channelKey: 'realm:foreign'
    })).toThrow(/recent page is invalid/i);
  });

  it('rejects timestamps that cannot be rendered by the browser date model', () => {
    expect(() => decodeRealmChatRecentPage({
      ...recentPage([1n]),
      messages: [{ ...message(1n), sentAtMicros: 8_640_000_000_000_000_001n }]
    })).toThrow(/recent page is invalid/i);
  });

  it('requires descending, exclusive-cursor history pages', () => {
    const history = decodeRealmChatHistoryPage({
      channelKey: WARPKEEP_REALM_CHAT_CHANNEL_KEY,
      policyVersion: WARPKEEP_REALM_CHAT_POLICY_VERSION,
      messages: [message(2n), message(1n)],
      nextBeforeSequence: 1n,
      hasMore: false
    });
    expect(history.messages.map(row => row.sequence)).toEqual([2n, 1n]);
  });
});
