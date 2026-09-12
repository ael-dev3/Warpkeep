import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production admin connection dependency boundary', () => {
  it('loads the G001 transport without the unrelated Hermes notification CLI', () => {
    const source = readFileSync('scripts/greater-realm-production-transport.ts', 'utf8');
    expect(source).not.toContain("from './hermes-admin'");
    expect(source).toContain("from './production-admin-connection'");
  });
});


import { afterEach, vi } from 'vitest';
import {
  HermesCliError, HermesOperationTimeoutError, connect, requestAdminToken,
  readProductionAdminBridgeTrustedTime, withOperationTimeout,
} from '../scripts/production-admin-connection';

afterEach(() => vi.useRealTimers());

describe('shared production transport behavior', () => {
  it('preserves bounded canonical trusted-clock validation', async () => {
    const now = Date.UTC(2026, 8, 9);
    const fetcher = vi.fn(async (_input: string | URL | Request) => new Response('', { headers: { date: new Date(now).toUTCString() } }));
    await expect(readProductionAdminBridgeTrustedTime('https://auth.warpkeep.com', fetcher, () => now)).resolves.toBe(now);
    expect(fetcher.mock.calls[0]?.[0]?.toString()).toBe('https://auth.warpkeep.com/healthz');
    await expect(readProductionAdminBridgeTrustedTime('https://other.invalid', fetcher, () => now)).rejects.toBeInstanceOf(HermesCliError);
    await expect(readProductionAdminBridgeTrustedTime('https://auth.warpkeep.com', fetcher, () => now + 60001)).rejects.toBeInstanceOf(HermesCliError);
  });

  it('records the token attempt before transport and retains the fixed readiness delay', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const token = 'aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc';
    const recordAttempt = vi.fn(async () => { events.push('budget'); });
    const fetcher = vi.fn(async () => { events.push('request'); return Response.json({ token, tokenType: 'spacetime-access' }); });
    const result = requestAdminToken('https://auth.warpkeep.com', 'synthetic-secret', fetcher, { recordAttempt: recordAttempt as never });
    let settled = false; void result.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(19999);
    expect(events).toEqual(['budget', 'request']); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(token);
    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it('refuses invalid token bodies and never requests when budget fails', async () => {
    const fetcher = vi.fn(async () => Response.json({ token: 'invalid', tokenType: 'spacetime-access' }));
    await expect(requestAdminToken('https://auth.warpkeep.com', 'synthetic-secret', fetcher, { recordAttempt: (async () => { throw Error('private'); }) as never })).rejects.toBeInstanceOf(HermesCliError);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(requestAdminToken('https://auth.warpkeep.com', 'synthetic-secret', fetcher, { recordAttempt: (async () => {}) as never })).rejects.toBeInstanceOf(HermesCliError);
  });

  it('preserves timeout class identity and clears settled timers', async () => {
    vi.useFakeTimers();
    const timed = withOperationTimeout(new Promise(() => {}));
    const rejected = expect(timed).rejects.toBeInstanceOf(HermesOperationTimeoutError);
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    await expect(withOperationTimeout(Promise.resolve('done'))).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disconnects both timed-out and late-arriving sessions', async () => {
    vi.useFakeTimers();
    let connected: (c: unknown) => void = () => {};
    const pending = { isDisconnectRequested: false, disconnect: vi.fn() };
    const late = { isDisconnectRequested: false, disconnect: vi.fn() };
    const builder = { withUri() { return this; }, withDatabaseName() { return this; }, withToken() { return this; },
      onConnect(callback: typeof connected) { connected = callback; return this; }, onConnectError() { return this; }, build() { return pending; } };
    const result = connect('wss://example.invalid', 'database', 'synthetic', (() => builder) as never);
    const rejected = expect(result).rejects.toThrow('Could not connect to the Warpkeep database.');
    await vi.advanceTimersByTimeAsync(30000); await rejected;
    expect(pending.disconnect).toHaveBeenCalledOnce(); connected(late); expect(late.disconnect).toHaveBeenCalledOnce();
  });
});
