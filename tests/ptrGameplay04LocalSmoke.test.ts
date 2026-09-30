// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { cleanupGameplay04LocalSmoke, gameplay04LocalAdditionalForbiddenIdentities, gameplay04LocalSmokeReceipt, invalidateGameplay04LocalSmokeReceipt } from '../scripts/qa-observer/ptr-gameplay04-local-smoke';
import { ptrProductionImportConfirmationDigest, PTR_PRODUCTION_IMPORT_TARGET } from '../scripts/ptr-production-import-core';

async function withReceiptFixture(run: (directory: string) => Promise<void>) {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(join(parent, 'warpkeep-ptr-smoke-receipt-'));
  try { await run(directory); }
  finally {
    expect(dirname(directory)).toBe(parent);
    expect(basename(directory)).toMatch(/^warpkeep-ptr-smoke-receipt-/u);
    await rm(directory, { recursive: true, force: true });
  }
}

describe('PTR gameplay04 local smoke evidence and failure containment', () => {
  it('removes an old same-source pass before a failed new attempt', async () => {
    await withReceiptFixture(async directory => {
      const path = join(directory, 'ptr-gameplay04-local-smoke.json');
      const oldPass = { ...gameplay04LocalSmokeReceipt('a'.repeat(40), [
        'initialized', 'gathered', 'staleQuoteUnsent', 'exactRetry', 'deductedOnce',
        'completed', 'improvedReturn', 'renewed', 'reconnected',
      ], 300_000), cleanupComplete: true };
      await writeFile(path, JSON.stringify(oldPass));
      expect(JSON.parse(await readFile(path, 'utf8')).cleanupComplete).toBe(true);
      await invalidateGameplay04LocalSmokeReceipt(path);
      await expect(cleanupGameplay04LocalSmoke([() => { throw new Error('new attempt failed'); }]))
        .rejects.toThrow('PTR_GAMEPLAY04_LOCAL_CLEANUP_FAILED');
      await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(invalidateGameplay04LocalSmokeReceipt(path)).resolves.toBeUndefined();
    });
  });

  it('preserves receipts reached through a linked directory', async () => {
    await withReceiptFixture(async directory => {
      const target = join(directory, 'target'); const alias = join(directory, 'alias');
      await mkdir(target);
      const path = join(target, 'ptr-gameplay04-local-smoke.json');
      await writeFile(path, 'preserved receipt');
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(invalidateGameplay04LocalSmokeReceipt(join(alias, basename(path))))
        .rejects.toThrow('PTR_GAMEPLAY04_LOCAL_RECEIPT_UNSAFE');
      expect(await readFile(path, 'utf8')).toBe('preserved receipt');
    });
  });

  it('preserves a multiply linked receipt instead of deleting an unexpected object', async () => {
    await withReceiptFixture(async directory => {
      const path = join(directory, 'ptr-gameplay04-local-smoke.json');
      await writeFile(path, 'preserved receipt');
      await link(path, join(directory, 'other.json'));
      await expect(invalidateGameplay04LocalSmokeReceipt(path))
        .rejects.toThrow('PTR_GAMEPLAY04_LOCAL_RECEIPT_UNSAFE');
      expect(await readFile(path, 'utf8')).toBe('preserved receipt');
    });
  });

  it('fits the real import guard while excluding all production databases', () => {
    const databaseIdentity = 'a'.repeat(64);
    const disallowedDatabaseIdentities = gameplay04LocalAdditionalForbiddenIdentities(databaseIdentity);
    expect(disallowedDatabaseIdentities).not.toContain(PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity);
    expect(ptrProductionImportConfirmationDigest({ databaseIdentity, disallowedDatabaseIdentities,
      moduleSourceCommit: 'b'.repeat(40), moduleTreeId: 'c'.repeat(40), moduleSha256: 'd'.repeat(64),
      dependencyClosureDigest: 'e'.repeat(64), spacetimeExecutableSha256: 'f'.repeat(64),
      spacetimeCliConfigSha256: '1'.repeat(64), publishReceiptDigest: '2'.repeat(64),
      atlasSourceCommit: '3'.repeat(40), releaseSha256: '4'.repeat(64),
      publicReleaseId: `GRR-${'A'.repeat(26)}`, importEpoch: 1n })).toMatch(/^[a-f0-9]{64}$/u);
    for (const identity of [PTR_PRODUCTION_IMPORT_TARGET.genesis001DatabaseIdentity, ...disallowedDatabaseIdentities]) {
      expect(() => gameplay04LocalAdditionalForbiddenIdentities(identity)).toThrow();
    }
  });

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
