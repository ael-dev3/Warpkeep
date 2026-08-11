import { describe, expect, it } from 'vitest';
import { Timestamp } from 'spacetimedb';

import {
  decodeRealmChatHistoryPage,
  decodeRealmChatProjection
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
  channelKey: WARPKEEP_REALM_CHAT_CHANNEL_KEY,
  senderFid: 1n,
  body: `Message ${sequence}`,
  sentAt: new Timestamp(1_000_000n + sequence),
  visibility: 'visible'
});

describe('Realm Chat browser projection', () => {
  it('sorts the bounded live window without joining it to the world snapshot', () => {
    const projection = decodeRealmChatProjection({
      statusRows: [status],
      messageRows: [message(2n), message(1n)]
    });
    expect(projection.mode).toBe('active');
    expect(projection.messages.map(row => row.sequence)).toEqual([1n, 2n]);
  });

  it('rejects public bodies that violate the server projection contract', () => {
    expect(() => decodeRealmChatProjection({
      statusRows: [status],
      messageRows: [{ ...message(1n), visibility: 'tombstoned', body: 'still public' }]
    })).toThrow(/projection is invalid/i);
  });

  it('rejects status and message rows outside the canonical realm channel', () => {
    expect(() => decodeRealmChatProjection({
      statusRows: [{ ...status, realmId: 'FOREIGN_REALM' }],
      messageRows: []
    })).toThrow(/projection is invalid/i);
    expect(() => decodeRealmChatProjection({
      statusRows: [status],
      messageRows: [{ ...message(1n), channelKey: 'realm:foreign' }]
    })).toThrow(/projection is invalid/i);
  });

  it('rejects timestamps that cannot be rendered by the browser date model', () => {
    expect(() => decodeRealmChatProjection({
      statusRows: [status],
      messageRows: [{
        ...message(1n),
        sentAt: new Timestamp(8_640_000_000_000_000_001n)
      }]
    })).toThrow(/projection is invalid/i);
  });

  it('requires descending, exclusive-cursor history pages', () => {
    const history = decodeRealmChatHistoryPage({
      channelKey: WARPKEEP_REALM_CHAT_CHANNEL_KEY,
      policyVersion: WARPKEEP_REALM_CHAT_POLICY_VERSION,
      messages: [
        { ...message(2n), sentAtMicros: 1_000_002n },
        { ...message(1n), sentAtMicros: 1_000_001n }
      ],
      nextBeforeSequence: 1n,
      hasMore: false
    });
    expect(history.messages.map(row => row.sequence)).toEqual([2n, 1n]);
  });
});
