import { describe, expect, it } from 'vitest';

import {
  MARK_ATTRIBUTION_POLICY_ID,
  MAX_U128,
  checkedMarkMicrosTotal,
  formatMarkMicros,
  markBalanceMicros,
  snapMicrosToMarkMicros,
} from '../src/marks/marksPolicy';
import {
  SNAP_APPROVED_IMPLEMENTATION,
  SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
  SNAP_APPROVED_PROXY_CODE_HASH,
  SNAP_BURN_EVENT_TOPIC,
  SNAP_PROXY_ADDRESS,
  SNAP_PROXY_DEPLOYMENT_BLOCK,
  SnapBurnPolicyError,
  assertApprovedSnapImplementation,
  attributeCanonicalSnapBurns,
  decodeCanonicalSnapBurn,
  planBoundedBlockRanges,
  privacySafeAttributionSummary,
  reconcileFinalizedHeads,
  reconcileProviderBurns,
  type RawSnapBurnLog,
} from '../scripts/marks/snap-burn-policy';

const TX_HASH = `0x${'ab'.repeat(32)}`;
const BLOCK_HASH = `0x${'cd'.repeat(32)}`;
const SENDER = '0x1111111111111111111111111111111111111111';

function word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function burnLog(overrides: Partial<RawSnapBurnLog> = {}): RawSnapBurnLog {
  return {
    address: SNAP_PROXY_ADDRESS,
    topics: [
      SNAP_BURN_EVENT_TOPIC,
      `0x${word(7n)}`,
      `0x${'0'.repeat(24)}${SENDER.slice(2)}`,
      `0x${'42'.repeat(32)}`,
    ],
    data: `0x${word(250_000n)}${word(1n)}`,
    blockNumber: SNAP_PROXY_DEPLOYMENT_BLOCK + 10n,
    blockHash: BLOCK_HASH,
    transactionHash: TX_HASH,
    logIndex: 3,
    removed: false,
    ...overrides,
  };
}

describe('Marks fixed-point accounting', () => {
  it('maps SNAP micros to Mark micros exactly 1:1 without floating point', () => {
    expect(snapMicrosToMarkMicros(250_000n)).toBe(250_000n);
    expect(formatMarkMicros(250_000n)).toBe('0.25');
    expect(formatMarkMicros(1_000_001n)).toBe('1.000001');
    expect(MARK_ATTRIBUTION_POLICY_ID).toBe('snap-current-linked-wallet-1to1-v1');
  });

  it('enforces nonnegative balance and u64 totals', () => {
    expect(markBalanceMicros(3_000_000n, 1_000_000n)).toBe(2_000_000n);
    expect(checkedMarkMicrosTotal([MAX_U128 - 1n, 1n])).toBe(MAX_U128);
    expect(() => markBalanceMicros(1n, 2n)).toThrow('MARK_BALANCE_INVARIANT');
    expect(() => checkedMarkMicrosTotal([MAX_U128, 1n])).toThrow('MARK_TOTAL_OUT_OF_RANGE');
  });
});

describe('canonical SNAP burn receipt policy', () => {
  it('decodes only the proxy Burned log and ignores its opaque recipient for attribution', () => {
    const decoded = decodeCanonicalSnapBurn(burnLog());
    expect(decoded).toMatchObject({
      burnId: 7n,
      sender: SENDER,
      amountMicros: 250_000n,
      markMicros: 250_000n,
      eventKey: `1:${TX_HASH}:3`,
    });
    expect(decoded).not.toHaveProperty('hypersnapRecipient');
    expect(decoded).not.toHaveProperty('opaqueRecipient');
  });

  it.each([
    ['SNAP_BURN_PROXY_MISMATCH', { address: '0x2222222222222222222222222222222222222222' }],
    ['SNAP_BURN_REMOVED', { removed: true }],
    ['SNAP_BURN_BEFORE_DEPLOYMENT', { blockNumber: SNAP_PROXY_DEPLOYMENT_BLOCK - 1n }],
    ['SNAP_BURN_TOPIC_MISMATCH', { topics: [`0x${'ef'.repeat(32)}`, ...burnLog().topics.slice(1)] }],
    ['SNAP_BURN_CHAIN_MISMATCH', { data: `0x${word(250_000n)}${word(10n)}` }],
    ['SNAP_BURN_AMOUNT_OUT_OF_RANGE', { data: `0x${word(0n)}${word(1n)}` }],
  ])('rejects malformed or noncanonical logs (%s)', (code, override) => {
    expect(() => decodeCanonicalSnapBurn(burnLog(override))).toThrow(code);
  });

  it('attributes only a current wallet linked to exactly one FID', () => {
    const burn = decodeCanonicalSnapBurn(burnLog());
    const result = attributeCanonicalSnapBurns([burn], [
      { fid: 123n, address: SENDER, active: true },
      { fid: 456n, address: '0x2222222222222222222222222222222222222222', active: true },
    ]);
    expect(result.credited).toHaveLength(1);
    expect(result.credited[0].fid).toBe(123n);
    expect(result.creditedMicros).toBe(250_000n);
    expect(privacySafeAttributionSummary(result)).toEqual({
      policyId: 'snap-current-linked-wallet-1to1-v1',
      decodedEvents: 1,
      creditedEvents: 1,
      quarantinedEvents: 0,
      creditedAccounts: 1,
      creditedMicros: '250000',
    });
  });

  it('quarantines missing and ambiguous current-link attribution', () => {
    const burn = decodeCanonicalSnapBurn(burnLog());
    expect(attributeCanonicalSnapBurns([burn], []).quarantined[0].reason).toBe('missing_attribution');
    expect(attributeCanonicalSnapBurns([burn], [
      { fid: 123n, address: SENDER, active: true },
      { fid: 456n, address: SENDER, active: true },
    ]).quarantined[0].reason).toBe('ambiguous_attribution');
  });

  it('fails closed on duplicate event keys and duplicate burn IDs', () => {
    const first = decodeCanonicalSnapBurn(burnLog());
    expect(() => attributeCanonicalSnapBurns([first, first], [])).toThrow('SNAP_DUPLICATE_EVENT_KEY');
    const second = decodeCanonicalSnapBurn(burnLog({
      transactionHash: `0x${'de'.repeat(32)}`,
      logIndex: 4,
    }));
    expect(() => attributeCanonicalSnapBurns([first, second], [])).toThrow('SNAP_DUPLICATE_BURN_ID');
  });

  it('requires independent providers to agree exactly', () => {
    const burn = decodeCanonicalSnapBurn(burnLog());
    expect(reconcileProviderBurns([burn], [burn])).toEqual([burn]);
    const changed = { ...burn, amountMicros: 1n, markMicros: 1n };
    expect(() => reconcileProviderBurns([burn], [changed])).toThrow('SNAP_PROVIDER_DISAGREEMENT');
    const differentOpaqueWord = decodeCanonicalSnapBurn(burnLog({
      topics: [...burnLog().topics.slice(0, 3), `0x${'43'.repeat(32)}`],
    }));
    expect(() => reconcileProviderBurns([burn], [differentOpaqueWord]))
      .toThrow('SNAP_PROVIDER_DISAGREEMENT');
  });

  it('pins chain, proxy, implementation, code hashes, symbol, and decimals', () => {
    expect(() => assertApprovedSnapImplementation({
      chainId: 1,
      proxyAddress: SNAP_PROXY_ADDRESS,
      proxyCodeHash: SNAP_APPROVED_PROXY_CODE_HASH,
      implementationAddress: SNAP_APPROVED_IMPLEMENTATION,
      implementationCodeHash: SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
      decimals: 6,
      symbol: 'SNAP',
    })).not.toThrow();
    expect(() => assertApprovedSnapImplementation({
      chainId: 1,
      proxyAddress: SNAP_PROXY_ADDRESS,
      proxyCodeHash: SNAP_APPROVED_PROXY_CODE_HASH,
      implementationAddress: SNAP_APPROVED_IMPLEMENTATION,
      implementationCodeHash: `0x${'00'.repeat(32)}`,
      decimals: 6,
      symbol: 'SNAP',
    })).toThrow('SNAP_ATTESTATION_IMPLEMENTATION_CODE_MISMATCH');
  });

  it('requires identical finalized heads and creates bounded inclusive ranges', () => {
    const head = { blockNumber: SNAP_PROXY_DEPLOYMENT_BLOCK + 4_500n, blockHash: BLOCK_HASH };
    expect(reconcileFinalizedHeads(head, head)).toEqual(head);
    expect(planBoundedBlockRanges(SNAP_PROXY_DEPLOYMENT_BLOCK, head.blockNumber)).toEqual([
      { fromBlock: SNAP_PROXY_DEPLOYMENT_BLOCK, toBlock: SNAP_PROXY_DEPLOYMENT_BLOCK + 1_999n },
      { fromBlock: SNAP_PROXY_DEPLOYMENT_BLOCK + 2_000n, toBlock: SNAP_PROXY_DEPLOYMENT_BLOCK + 3_999n },
      { fromBlock: SNAP_PROXY_DEPLOYMENT_BLOCK + 4_000n, toBlock: SNAP_PROXY_DEPLOYMENT_BLOCK + 4_500n },
    ]);
    expect(() => reconcileFinalizedHeads(head, { ...head, blockHash: `0x${'ee'.repeat(32)}` }))
      .toThrow('SNAP_FINALIZED_HEAD_DISAGREEMENT');
  });

  it('uses generic policy errors suitable for fail-closed operator handling', () => {
    try {
      decodeCanonicalSnapBurn(burnLog({ removed: true }));
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(SnapBurnPolicyError);
      expect((error as SnapBurnPolicyError).code).toBe('SNAP_BURN_REMOVED');
    }
  });
});
