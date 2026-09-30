// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cleanupGameplay04LocalSmoke, gameplay04LocalSmokeReceipt } from '../scripts/qa-observer/ptr-gameplay04-local-smoke';

describe('PTR gameplay04 local smoke evidence and failure containment', () => {
  it('labels only bounded synthetic local outcomes and rejects unrecognized receipt data', () => {
    const receipt = gameplay04LocalSmokeReceipt('a'.repeat(40), ['initialized', 'exactRetry'], 100);
    expect(receipt).toMatchObject({ authority: 'ephemeral-signed-local-fixture', atlas: 'synthetic-fixture', owner: 'synthetic-fid', productionPtrVerified: false,
      outcomes: { initialized: true, exactRetry: true, completed: false, reconnected: false } });
    expect(JSON.stringify(receipt)).not.toMatch(/accessToken|privateKey|databaseIdentity|ownerFid/u);
    expect(() => gameplay04LocalSmokeReceipt('invalid', [], 1)).toThrow();
    expect(() => gameplay04LocalSmokeReceipt('a'.repeat(40), ['initialized', 'initialized'], 1)).toThrow();
    expect(() => gameplay04LocalSmokeReceipt('a'.repeat(40), ['credential' as never], 1)).toThrow();
  });

  it('still terminates the server and removes owned private files after earlier cleanup failure without leaking its error', async () => {
    const calls: string[] = [];
    await expect(cleanupGameplay04LocalSmoke([
      () => { calls.push('connection'); throw new Error('fixture-private-key-content'); },
      () => { calls.push('server'); },
      async () => { calls.push('files'); },
    ])).rejects.toThrow(/^PTR_GAMEPLAY04_LOCAL_CLEANUP_FAILED$/u);
    expect(calls).toEqual(['connection', 'server', 'files']);
    await expect(cleanupGameplay04LocalSmoke([() => { calls.push('clean'); }])).resolves.toBeUndefined();
  });
});
