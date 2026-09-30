// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cleanupGameplay04LocalSmoke, gameplay04LocalAdditionalForbiddenIdentities, gameplay04LocalSmokeReceipt } from '../scripts/qa-observer/ptr-gameplay04-local-smoke';
import { ptrProductionImportConfirmationDigest, PTR_PRODUCTION_IMPORT_TARGET } from '../scripts/ptr-production-import-core';

describe('PTR gameplay04 local smoke evidence and failure containment', () => {
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
