import { describe, expect, it, vi } from 'vitest';

vi.mock('viem', () => ({
  keccak256: (value: string) => {
    if (value === '0x6001') {
      return '0xa50288164ca4d99a6c559b6f601c35acc60fbf39e21b8c009d809ff35b955ed0';
    }
    if (value === '0x6002') {
      return '0x56d5edb395905863637b94ca9fde441c401b42e8353ad6f84deaf201182bf7c7';
    }
    throw new Error('unexpected fixture bytecode');
  },
}));

import {
  SNAP_APPROVED_IMPLEMENTATION,
  SNAP_BURN_EVENT_TOPIC,
  SNAP_PROXY_ADDRESS,
  SNAP_PROXY_DEPLOYMENT_BLOCK,
} from '../scripts/marks/snap-burn-policy';
import {
  EIP_1967_IMPLEMENTATION_SLOT,
  EIP_1967_UPGRADED_EVENT_TOPIC,
  MarksOperatorError,
  reconcilePrivacySafeAggregates,
  runDryScan,
} from '../scripts/marks/operator-core';
import type { EthereumReadProvider, RpcLog } from '../scripts/marks/operator-transport';

const SENDER = '0x1111111111111111111111111111111111111111';

function word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function blockHash(blockNumber: bigint): string {
  return `0x${blockNumber.toString(16).padStart(64, '0')}`;
}

function symbolResult(symbol: string): string {
  const bytes = [...new TextEncoder().encode(symbol)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
  return `0x${word(32n)}${word(BigInt(bytes.length / 2))}${bytes.padEnd(64, '0')}`;
}

function burnLog(amount = 250_000n): RpcLog {
  const blockNumber = SNAP_PROXY_DEPLOYMENT_BLOCK + 10n;
  return Object.freeze({
    address: SNAP_PROXY_ADDRESS,
    topics: Object.freeze([
      SNAP_BURN_EVENT_TOPIC,
      `0x${word(7n)}`,
      `0x${'0'.repeat(24)}${SENDER.slice(2)}`,
      `0x${'42'.repeat(32)}`,
    ]),
    data: `0x${word(amount)}${word(1n)}`,
    blockNumber: `0x${blockNumber.toString(16)}`,
    blockHash: blockHash(blockNumber),
    transactionHash: `0x${'ab'.repeat(32)}`,
    logIndex: '0x3',
    removed: false,
  });
}

class FixtureProvider implements EthereumReadProvider {
  constructor(
    private readonly finalizedOffset: bigint,
    private readonly amount = 250_000n,
    private readonly cursorHashOverride?: string,
    private readonly chainId = 1n,
    private readonly upgradeImplementation?: string,
    private readonly storageImplementation = SNAP_APPROVED_IMPLEMENTATION,
  ) {}

  async getChainId() {
    return this.chainId;
  }

  async getFinalizedHead() {
    const number = SNAP_PROXY_DEPLOYMENT_BLOCK + this.finalizedOffset;
    return { number, hash: blockHash(number) };
  }

  async getBlock(blockNumber: bigint) {
    return {
      number: blockNumber,
      hash: this.cursorHashOverride && blockNumber === SNAP_PROXY_DEPLOYMENT_BLOCK + 9n
        ? this.cursorHashOverride
        : blockHash(blockNumber),
    };
  }

  async getStorageAt(address: string, slot: string, blockNumber: bigint) {
    expect(address).toBe(SNAP_PROXY_ADDRESS);
    expect(slot).toBe(EIP_1967_IMPLEMENTATION_SLOT);
    const implementation = blockNumber === SNAP_PROXY_DEPLOYMENT_BLOCK + 10n
      ? this.storageImplementation
      : SNAP_APPROVED_IMPLEMENTATION;
    return `0x${'0'.repeat(24)}${implementation.slice(2)}`;
  }

  async getCode(address: string) {
    return address === SNAP_PROXY_ADDRESS ? '0x6001' : '0x6002';
  }

  async call(_address: string, data: string) {
    return data === '0x313ce567' ? `0x${word(6n)}` : symbolResult('SNAP');
  }

  async getLogs(input: Readonly<{ topic0: string; fromBlock: bigint; toBlock: bigint }>) {
    const eventBlock = SNAP_PROXY_DEPLOYMENT_BLOCK + 10n;
    if (input.fromBlock > eventBlock || input.toBlock < eventBlock) return [];
    if (input.topic0 === SNAP_BURN_EVENT_TOPIC) return [burnLog(this.amount)];
    if (input.topic0 === EIP_1967_UPGRADED_EVENT_TOPIC && this.upgradeImplementation) {
      return [{
        address: SNAP_PROXY_ADDRESS,
        topics: [
          EIP_1967_UPGRADED_EVENT_TOPIC,
          `0x${'0'.repeat(24)}${this.upgradeImplementation.slice(2)}`,
        ],
        data: '0x',
        blockNumber: `0x${eventBlock.toString(16)}`,
        blockHash: blockHash(eventBlock),
        transactionHash: `0x${'cd'.repeat(32)}`,
        logIndex: '0x4',
        removed: false,
      }];
    }
    return [];
  }
}

describe('Marks operator scan core', () => {
  it('reconciles at a common finalized block, attests the proxy, and scans 2,000-block chunks', async () => {
    const report = await runDryScan({
      providers: [new FixtureProvider(2_500n), new FixtureProvider(2_501n)],
      trustedWallets: [{ fid: 123n, address: SENDER, active: true, whitelisted: true }],
    });
    expect(report.finalizedHead.blockNumber).toBe((SNAP_PROXY_DEPLOYMENT_BLOCK + 2_500n).toString());
    expect(report.range).toMatchObject({
      rangesProcessed: 2,
      maximumBlocksPerRange: '2000',
      completeThroughFinalizedHead: true,
    });
    expect(report.attribution).toMatchObject({
      creditedEvents: 1,
      creditedAccounts: 1,
      creditedMicros: '250000',
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(SENDER);
    expect(serialized).not.toContain('abababab');
    expect(serialized).not.toContain('"fid"');
  });

  it('uses a stdin-only key to emit stable opaque account aliases', async () => {
    const report = await runDryScan({
      providers: [new FixtureProvider(10n), new FixtureProvider(10n)],
      trustedWallets: [{ fid: 123n, address: SENDER, active: true, whitelisted: true }],
      reportAliasKey: 'fixture-key-that-is-at-least-thirty-two-bytes',
    });
    expect(report.accountTotals).toEqual([{
      accountAlias: expect.stringMatching(/^acct_[0-9a-f]{24}$/),
      creditedMicros: '250000',
    }]);
    expect(JSON.stringify(report.accountTotals)).not.toContain('123');
  });

  it('bounds range allocation before planning against an implausibly distant head', async () => {
    const enormousOffset = 10n ** 30n;
    const report = await runDryScan({
      providers: [new FixtureProvider(enormousOffset), new FixtureProvider(enormousOffset)],
      trustedWallets: [],
      maximumRanges: 1,
    });

    expect(report.range).toEqual({
      fromBlock: SNAP_PROXY_DEPLOYMENT_BLOCK.toString(),
      throughBlock: (SNAP_PROXY_DEPLOYMENT_BLOCK + 1_999n).toString(),
      rangesProcessed: 1,
      maximumBlocksPerRange: '2000',
      completeThroughFinalizedHead: false,
    });
  });

  it('fails closed on provider event disagreement before attribution', async () => {
    await expect(runDryScan({
      providers: [new FixtureProvider(10n, 250_000n), new FixtureProvider(10n, 1n)],
      trustedWallets: [],
    })).rejects.toThrow('SNAP_PROVIDER_DISAGREEMENT');
  });

  it('reads and requires Ethereum mainnet from both providers', async () => {
    await expect(runDryScan({
      providers: [
        new FixtureProvider(10n, 250_000n, undefined, 1n),
        new FixtureProvider(10n, 250_000n, undefined, 10n),
      ],
      trustedWallets: [],
    })).rejects.toThrow('MARKS_CHAIN_ID_MISMATCH');
  });

  it('stops on a reconciled upgrade to an unapproved historical implementation', async () => {
    const unapproved = '0x2222222222222222222222222222222222222222';
    await expect(runDryScan({
      providers: [
        new FixtureProvider(10n, 250_000n, undefined, 1n, unapproved),
        new FixtureProvider(10n, 250_000n, undefined, 1n, unapproved),
      ],
      trustedWallets: [],
    })).rejects.toThrow('MARKS_UNAPPROVED_HISTORICAL_UPGRADE');
  });

  it('attests the approved implementation again at every burn block', async () => {
    const unapproved = '0x2222222222222222222222222222222222222222';
    await expect(runDryScan({
      providers: [
        new FixtureProvider(11n, 250_000n, undefined, 1n, undefined, unapproved),
        new FixtureProvider(11n, 250_000n, undefined, 1n, undefined, unapproved),
      ],
      trustedWallets: [],
    })).rejects.toThrow('MARKS_EVENT_BLOCK_IMPLEMENTATION_MISMATCH');
  });

  it('stops on cursor reorg evidence', async () => {
    const cursorBlock = SNAP_PROXY_DEPLOYMENT_BLOCK + 9n;
    await expect(runDryScan({
      providers: [new FixtureProvider(10n), new FixtureProvider(10n, 250_000n, `0x${'ff'.repeat(32)}`)],
      trustedWallets: [],
      cursor: {
        lastFinalizedBlock: cursorBlock,
        lastFinalizedBlockHash: blockHash(cursorBlock),
      },
    })).rejects.toThrow('MARKS_CURSOR_REORG_DETECTED');
  });

  it('reconciles only privacy-safe exact aggregates', () => {
    const aggregate = {
      policyId: 'snap-current-linked-wallet-1to1-v1',
      creditedEvents: 3,
      creditedAccounts: 2,
      creditedMicros: '500000',
    };
    expect(reconcilePrivacySafeAggregates({ scan: aggregate, database: aggregate })).toMatchObject({
      command: 'reconcile',
      reconciled: true,
    });
    expect(() => reconcilePrivacySafeAggregates({
      scan: aggregate,
      database: { ...aggregate, creditedMicros: '500001' },
    })).toThrow('MARKS_RECONCILIATION_MISMATCH');
    expect(() => reconcilePrivacySafeAggregates({
      scan: { ...aggregate, creditedMicros: (1n << 128n).toString() },
      database: aggregate,
    })).toThrow('MARKS_RECONCILIATION_INPUT_INVALID');
  });

  it('uses generic operator errors for local policy failures', async () => {
    try {
      await runDryScan({
        providers: [new FixtureProvider(10n), new FixtureProvider(10n)],
        trustedWallets: [],
        maximumRanges: 0,
      });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MarksOperatorError);
      expect((error as MarksOperatorError).code).toBe('MARKS_MAX_RANGES_INVALID');
    }
  });
});
