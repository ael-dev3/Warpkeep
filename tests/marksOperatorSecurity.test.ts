import { chmodSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  executeOperator,
  parseOperatorArguments,
} from '../scripts/marks/marks-operator';
import { MarksOperatorError } from '../scripts/marks/operator-core';
import {
  inspectPrivateOperatorReports,
  withExclusiveOperatorLock,
  writePrivateOperatorReport,
} from '../scripts/marks/operator-report';
import {
  BoundedEthereumRpcProvider,
  assertIndependentProviderEndpoints,
  fetchBoundedJson,
} from '../scripts/marks/operator-transport';

function privateDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'warpkeep-marks-'));
  chmodSync(path, 0o700);
  return path;
}

describe('Marks operator local safety boundaries', () => {
  it('rejects RPC endpoints and credential-shaped values in argv', () => {
    expect(() => parseOperatorArguments(['scan', '--dry-run', 'https://rpc.example']))
      .toThrow('MARKS_PRIVATE_INPUT_IN_ARGV');
    expect(() => parseOperatorArguments(['scan', '--rpc=private']))
      .toThrow('MARKS_PRIVATE_INPUT_IN_ARGV');
    expect(() => parseOperatorArguments(['scan', '--token', 'private']))
      .toThrow('MARKS_PRIVATE_INPUT_IN_ARGV');
  });

  it('requires stdin and an explicit dry-run flag before scan can use a network', async () => {
    expect(() => parseOperatorArguments(['scan', '--dry-run'])).not.toThrow();
    const parsed = parseOperatorArguments(['scan', '--dry-run', '--report-dir', privateDirectory()]);
    await expect(executeOperator(parsed)).rejects.toThrow('MARKS_PRIVATE_INPUT_REQUIRED');
    const withoutDryRun = parseOperatorArguments(['scan', '--input-stdin', '--report-dir', privateDirectory()]);
    await expect(executeOperator(withoutDryRun)).rejects.toThrow('MARKS_SCAN_DRY_RUN_REQUIRED');
  });

  it('hard-disables apply even with confirmation and before reading stdin', async () => {
    const parsed = parseOperatorArguments(['apply', '--confirm', '--report-dir', privateDirectory()]);
    await expect(executeOperator(parsed)).rejects.toThrow('MARKS_APPLY_DISABLED');
  });

  it('writes only mode-0600 privacy-screened reports in a mode-0700 directory', () => {
    const directory = privateDirectory();
    writePrivateOperatorReport({
      reportDirectory: directory,
      command: 'plan',
      report: { schemaVersion: 1, command: 'plan', blockHash: `0x${'aa'.repeat(32)}` },
      now: new Date('2026-07-14T10:00:00.000Z'),
    });
    const filename = readFileNames(directory).find(name => name.endsWith('.json')) as string;
    expect(statSync(directory).mode & 0o077).toBe(0);
    expect(statSync(join(directory, filename)).mode & 0o077).toBe(0);
    expect(JSON.parse(readFileSync(join(directory, filename), 'utf8'))).toMatchObject({ command: 'plan' });
    expect(inspectPrivateOperatorReports(directory)).toMatchObject({
      reportCount: 1,
      lockPresent: false,
      byCommand: { plan: 1 },
    });
    expect(() => writePrivateOperatorReport({
      reportDirectory: directory,
      command: 'scan',
      report: { senderAddress: '0x1111111111111111111111111111111111111111' },
    })).toThrow('MARKS_REPORT_SENSITIVE_FIELD');
  });

  it('prevents overlapping operator instances without deleting another lock', async () => {
    const directory = privateDirectory();
    writeFileSync(join(directory, '.operator.lock'), '{}\n', { mode: 0o600 });
    await expect(withExclusiveOperatorLock(directory, async () => true))
      .rejects.toThrow('MARKS_OPERATOR_ALREADY_RUNNING');
    expect(readFileSync(join(directory, '.operator.lock'), 'utf8')).toBe('{}\n');
  });

  it('accepts only HTTPS or loopback endpoints and requires distinct provider origins', async () => {
    expect(() => new BoundedEthereumRpcProvider({ url: 'http://rpc.example' }))
      .toThrow('MARKS_ENDPOINT_INVALID');
    expect(() => new BoundedEthereumRpcProvider({ url: 'https://user:pass@rpc.example' }))
      .toThrow('MARKS_ENDPOINT_INVALID');
    expect(() => assertIndependentProviderEndpoints([
      { url: 'https://rpc.example/a' },
      { url: 'https://rpc.example/b' },
    ])).toThrow('MARKS_INDEPENDENT_PROVIDERS_REQUIRED');
    expect(() => assertIndependentProviderEndpoints([
      { url: 'https://rpc-one.example' },
      { url: 'https://rpc-two.example' },
    ])).not.toThrow();

    const fetchImpl = vi.fn<typeof fetch>();
    const provider = new BoundedEthereumRpcProvider(
      { url: 'http://127.0.0.1:8545' },
      { fetchImpl },
    );
    await expect(provider.getLogs({
      address: '0x0000000000000000000000000000000000000000',
      topic0: `0x${'00'.repeat(32)}`,
      fromBlock: 1n,
      toBlock: 2_001n,
    })).rejects.toThrow('MARKS_LOG_RANGE_INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cancels oversized streaming responses before unbounded buffering', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('1234'));
        controller.enqueue(new TextEncoder().encode('5'));
      },
      cancel,
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 200 }));
    await expect(fetchBoundedJson(
      { url: 'http://127.0.0.1:8787' },
      { fetchImpl, maximumBytes: 4 },
    )).rejects.toThrow('MARKS_RESPONSE_TOO_LARGE');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects a JSON-RPC response with the wrong protocol or request id', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 999,
      result: { number: '0x1', hash: `0x${'11'.repeat(32)}` },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const provider = new BoundedEthereumRpcProvider(
      { url: 'http://127.0.0.1:8545' },
      { fetchImpl },
    );
    await expect(provider.getFinalizedHead()).rejects.toThrow('MARKS_RPC_REQUEST_FAILED');
  });

  it('reads chain identity through an exact eth_chainId request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const provider = new BoundedEthereumRpcProvider(
      { url: 'http://127.0.0.1:8545' },
      { fetchImpl },
    );

    await expect(provider.getChainId()).resolves.toBe(1n);
  });

  it('uses generic typed errors for local lock failures', async () => {
    const directory = privateDirectory();
    writeFileSync(join(directory, '.operator.lock'), '{}', { mode: 0o600 });
    try {
      await withExclusiveOperatorLock(directory, async () => true);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MarksOperatorError);
      expect((error as MarksOperatorError).code).toBe('MARKS_OPERATOR_ALREADY_RUNNING');
    }
  });
});

function readFileNames(directory: string): string[] {
  return readdirSync(directory);
}
