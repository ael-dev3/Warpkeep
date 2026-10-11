// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { coordinatePtrInitialAtlasVerificationRecovery, reconcilePtrInitialAtlasVerificationRecovery,
  ptrInitialAtlasVerificationRecoveryKey, assertPtrInitialAtlasVerificationReducer,
  type PtrInitialAtlasVerificationRecovery } from '../scripts/ptr-initial-atlas-verification-recovery';
import { ptrInitialAtlasRecoveryKey, ptrInitialAtlasRegionRecoveryKey, ptrInitialAtlasTerrainRecoveryKey,
  ptrInitialAtlasTerrainRecoveryV2Key } from '../scripts/ptr-initial-owner-atlas-operator';
import { PTR_PRODUCTION_IMPORT_TARGET, ptrProductionImportReceiptDigest } from '../scripts/ptr-production-import-core';
import { updateCanonical, updateDigest } from '../scripts/sealed-realms-existing-update-protocol.mjs';

// Explicit synthetic receipts qualify coordinator boundaries, not a live deployment or authenticated player.
function receipt() {
  const body = { schemaVersion: 1 as const, profile: 'warpkeep.ptr.production-import.v1' as const, outcome: 'ready' as const,
    databaseIdentity: '9'.repeat(64), moduleIdentity: PTR_PRODUCTION_IMPORT_TARGET.moduleIdentity,
    moduleSourceCommit: 'a'.repeat(40), moduleSha256: 'a'.repeat(64), moduleTreeId: 'b'.repeat(40), dependencyClosureDigest: 'b'.repeat(64),
    spacetimeExecutableSha256: 'c'.repeat(64), atlasId: PTR_PRODUCTION_IMPORT_TARGET.atlasId, atlasSourceCommit: 'c'.repeat(40),
    publicReleaseId: `GRR-${'A'.repeat(26)}`, releaseManifestSha256: 'd'.repeat(64), expectedReleaseSha256: 'e'.repeat(64),
    releaseHeaderSha256: 'f'.repeat(64), verificationDigest: '1'.repeat(64), importEpoch: '1', operationsSubmitted: 2,
    operationChainDigest: '2'.repeat(64), zeroPopulationBoundary: true as const, importsExact: true as const, ready: true as const,
    atlasFinalized: true as const, atlasWritesClosedByFinalization: true as const,
    importMutationsCompiled: true as const, activationMutationsCompiled: false as const };
  return { ...body, importReceiptDigest: ptrProductionImportReceiptDigest(body) };
}
function fixture() {
  const marker = { profile: 'synthetic-retained-original', program: 'a'.repeat(64) };
  const original = updateDigest(marker), key = ptrInitialAtlasVerificationRecoveryKey(marker);
  const oldKeys = [original, ptrInitialAtlasRecoveryKey(marker), ptrInitialAtlasRegionRecoveryKey(marker),
    ptrInitialAtlasTerrainRecoveryKey(marker), ptrInitialAtlasTerrainRecoveryV2Key(marker)];
  const oldValues = [marker, ...oldKeys.slice(1).map((key, index) => ({ profile: `synthetic-retained-${index}`, key }))];
  const slots = new Map<string, unknown>(oldKeys.map((key, index) => [`submission:${key}`, structuredClone(oldValues[index])]));
  const events: string[] = [];
  const journal = { assert: vi.fn(), present: (kind: string, key: string) => slots.has(`${kind}:${key}`),
    read: (kind: string, key: string) => ({ value: slots.get(`${kind}:${key}`) }),
    write: vi.fn((kind: string, key: string, value: unknown) => {
      if (slots.has(`${kind}:${key}`)) throw Error('exclusive journal collision');
      slots.set(`${kind}:${key}`, structuredClone(value)); events.push(`${kind}:${key}`);
    }) };
  const recovery: PtrInitialAtlasVerificationRecovery = { profile: 'warpkeep-ptr-initial-atlas-verification-recovery-v1',
    originalMarkerDigest: original, priorTerrainRecoveryV2Key: oldKeys[4]!, priorTerrainRecoveryV2Digest: updateDigest(oldValues[4]),
    currentUpdateInspectionDigest: '3'.repeat(64), currentContinuationDigest: '4'.repeat(64), prefixDigest: '5'.repeat(64),
    auditDigest: '6'.repeat(64), boundaryDigest: '7'.repeat(64), stagedStatusDigest: '8'.repeat(64) };
  const validatePrior = vi.fn(() => {
    for (let index = 0; index < oldKeys.length; index++) {
      if (updateCanonical(slots.get(`submission:${oldKeys[index]}`)) !== updateCanonical(oldValues[index])) throw Error('retained prior changed');
      if (index > 0 && slots.has(`acknowledgement:${oldKeys[index]}`)) throw Error('historical ACK invented');
    }
  });
  const genuine = receipt();
  const validateReceipt = vi.fn((value: unknown) => {
    if (updateCanonical(value) !== updateCanonical(genuine)) throw Error('receipt binding different');
    return genuine;
  });
  const execute = vi.fn(async (beforeSend: () => void) => {
    assertPtrInitialAtlasVerificationReducer('admin_verify_greater_realm_batch_v1'); beforeSend();
    events.push('send:verify');
    assertPtrInitialAtlasVerificationReducer('admin_finalize_greater_realm_release_v1'); beforeSend();
    events.push('send:finalize'); return genuine;
  });
  return { marker, recovery, journal, slots, events, original, key, oldKeys, oldValues, execute, genuine,
    input: { marker, recovery, journal: journal as never, assert: vi.fn(), validatePrior, validateReceipt, execute } };
}
describe('distinct verification-only recovery coordinator', () => {
  it('marks before sending, records new completion before original ACK and preserves all five submissions', async () => {
    const f = fixture(); expect(await coordinatePtrInitialAtlasVerificationRecovery(f.input)).toEqual(f.genuine);
    expect(f.events).toEqual([`submission:${f.key}`, 'send:verify', 'send:finalize',
      `acknowledgement:${f.key}`, `acknowledgement:${f.original}`]);
    expect(f.input.validatePrior.mock.calls.length).toBeGreaterThanOrEqual(8);
    f.input.validatePrior();
    for (const key of f.oldKeys.slice(1)) expect(f.slots.has(`acknowledgement:${key}`)).toBe(false);
    expect(reconcilePtrInitialAtlasVerificationRecovery(f.input)).toEqual(f.genuine);
    expect(f.execute).toHaveBeenCalledOnce();
  });
  it('uses one key independent of current module, source, cursor or retry facts', async () => {
    const f = fixture(); await coordinatePtrInitialAtlasVerificationRecovery(f.input);
    await expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input,
      recovery: { ...f.recovery, currentContinuationDigest: 'f'.repeat(64), prefixDigest: 'e'.repeat(64) } }))
      .rejects.toThrow('RECOVERY_ALREADY_MARKED_RECONCILE_ONLY');
    expect(f.execute).toHaveBeenCalledOnce();
  });
  it('retains an ambiguous marked failure without creating completion and refuses another executor', async () => {
    const f = fixture(), execute = vi.fn(async (beforeSend: () => void) => { beforeSend(); throw Error('ambiguous effect'); });
    await expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute })).rejects.toThrow('ambiguous effect');
    expect(f.slots.has(`submission:${f.key}`)).toBe(true); expect(f.slots.has(`acknowledgement:${f.key}`)).toBe(false);
    await expect(coordinatePtrInitialAtlasVerificationRecovery(f.input)).rejects.toThrow('RECONCILE_ONLY');
    expect(() => reconcilePtrInitialAtlasVerificationRecovery(f.input)).toThrow('COMPLETION_MISSING_RECONCILE_ONLY');
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('lets at most one contending invocation pass the durable marker', async () => {
    const f = fixture(); let release!: () => void;
    const first = coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute: async beforeSend => {
      beforeSend(); await new Promise<void>(resolve => { release = resolve; }); return f.genuine;
    } });
    await expect(coordinatePtrInitialAtlasVerificationRecovery(f.input)).rejects.toThrow('RECONCILE_ONLY');
    expect(f.execute).not.toHaveBeenCalled(); release(); await first;
    expect(f.events.filter(event => event === `submission:${f.key}`)).toHaveLength(1);
  });
  it('allows only one send when two contenders both enter the executor before either marks', async () => {
    const f = fixture(); let entering = 0, release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const execute = vi.fn(async (beforeSend: () => void) => {
      entering++; if (entering === 2) release(); await barrier;
      beforeSend(); f.events.push('contended-send'); return f.genuine;
    });
    const results = await Promise.allSettled([
      coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute }),
      coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(f.events.filter(event => event === 'contended-send')).toHaveLength(1);
    expect(f.events.filter(event => event === `submission:${f.key}`)).toHaveLength(1);
  });
  it('cannot claim completion without a send marker or from an invalid returned receipt', async () => {
    const f = fixture();
    await expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute: async () => f.genuine })).rejects.toThrow('SUBMISSION_NOT_MARKED');
    expect(f.journal.write).not.toHaveBeenCalled();
    await expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute: async beforeSend => {
      beforeSend(); return { ...f.genuine, ready: false } as never;
    } })).rejects.toThrow('receipt binding different');
    expect(f.slots.has(`acknowledgement:${f.key}`)).toBe(false);
  });
  it('independently validates receipt structure and digest even if a callback returns unchecked data', async () => {
    const f = fixture();
    await expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input,
      validateReceipt: value => value as never, execute: async beforeSend => {
        beforeSend(); return { ...f.genuine, importReceiptDigest: '0'.repeat(64) };
      } })).rejects.toThrow('RECEIPT_DIFFERENT');
    expect(f.slots.has(`acknowledgement:${f.key}`)).toBe(false);
  });
  it.each(['missing-field', 'extra-field', 'symbol-field', 'getter', 'wrong-key', 'bad-hash', 'wrong-profile'])('rejects changed binding before executor: %s', mode => {
    const f = fixture(), recovery: any = { ...f.recovery };
    if (mode === 'missing-field') delete recovery.auditDigest;
    if (mode === 'extra-field') recovery.retry = 2;
    if (mode === 'symbol-field') recovery[Symbol('retry')] = 2;
    if (mode === 'getter') Object.defineProperty(recovery, 'prefixDigest', { enumerable: true, get: () => { throw Error('getter must not execute'); } });
    if (mode === 'wrong-key') recovery.priorTerrainRecoveryV2Key = '0'.repeat(64);
    if (mode === 'bad-hash') recovery.boundaryDigest = 'not-a-digest';
    if (mode === 'wrong-profile') recovery.profile += '-v2';
    return expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, recovery })).rejects.toThrow('RECOVERY_BINDING_DIFFERENT');
  });
  it('checks prior immutability again immediately before marking', async () => {
    const f = fixture();
    await expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute: async beforeSend => {
      f.slots.set(`submission:${f.oldKeys[4]}`, { changed: true }); beforeSend(); return f.genuine;
    } })).rejects.toThrow('retained prior changed');
    expect(f.journal.write).not.toHaveBeenCalled();
  });
  it('refuses any invented historical recovery acknowledgement before execution', async () => {
    const f = fixture(); f.slots.set(`acknowledgement:${f.oldKeys[4]}`, { invented: true });
    await expect(coordinatePtrInitialAtlasVerificationRecovery(f.input)).rejects.toThrow('historical ACK invented');
    expect(f.execute).not.toHaveBeenCalled(); expect(f.journal.write).not.toHaveBeenCalled();
  });
  it('cannot write the original ACK if the new completion write fails', async () => {
    const f = fixture(), write = f.journal.write.getMockImplementation()!;
    f.journal.write.mockImplementation((kind, key, value) => {
      if (kind === 'acknowledgement' && key === f.key) throw Error('fsync failure'); write(kind, key, value);
    });
    await expect(coordinatePtrInitialAtlasVerificationRecovery(f.input)).rejects.toThrow('fsync failure');
    expect(f.slots.has(`acknowledgement:${f.original}`)).toBe(false);
  });
  it.each(['missing-completion', 'missing-original', 'completion-digest', 'receipt-json', 'original-receipt', 'submission'])
    ('read-only reconciliation refuses incomplete or changed chain: %s', async mode => {
      const f = fixture(); await coordinatePtrInitialAtlasVerificationRecovery(f.input);
      if (mode === 'missing-completion') f.slots.delete(`acknowledgement:${f.key}`);
      if (mode === 'missing-original') f.slots.delete(`acknowledgement:${f.original}`);
      const completed: any = f.slots.get(`acknowledgement:${f.key}`);
      if (mode === 'completion-digest') completed.recoveryDigest = '0'.repeat(64);
      if (mode === 'receipt-json') completed.receiptJson = '{}';
      if (mode === 'original-receipt') (f.slots.get(`acknowledgement:${f.original}`) as any).receiptJson = '{}';
      if (mode === 'submission') f.slots.set(`submission:${f.key}`, { ...f.recovery, prefixDigest: '0'.repeat(64) });
      const writes = f.journal.write.mock.calls.length;
      expect(() => reconcilePtrInitialAtlasVerificationRecovery(f.input)).toThrow();
      expect(f.journal.write).toHaveBeenCalledTimes(writes); expect(f.execute).toHaveBeenCalledOnce();
    });
  it.each(['admin_stage_greater_realm_release_v1', 'admin_import_greater_realm_components_v1',
    'admin_import_greater_realm_regions_v1', 'admin_import_greater_realm_chunk_v1', 'admin_begin_greater_realm_verification_v1',
    'admin_provision_ptr_owner_v1', 'unknown', undefined])('rejects forbidden reducer before a durable marker: %s', async reducer => {
    const f = fixture(); await expect(coordinatePtrInitialAtlasVerificationRecovery({ ...f.input, execute: async beforeSend => {
      assertPtrInitialAtlasVerificationReducer(reducer); beforeSend(); return f.genuine;
    } })).rejects.toThrow('REDUCER_FORBIDDEN'); expect(f.journal.write).not.toHaveBeenCalled();
  });
});
