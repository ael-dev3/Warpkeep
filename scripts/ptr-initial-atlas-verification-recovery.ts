import type { openPtrInitialOwnerUpdateJournal } from './ptr-initial-owner-update-operator';
import { ptrProductionImportReceiptDigest, type PtrProductionImportReceipt } from './ptr-production-import-core';
import { parseExistingUpdateJson, updateCanonical, updateDigest } from './sealed-realms-existing-update-protocol.mjs';

const PROFILE = 'warpkeep-ptr-initial-atlas-verification-recovery-v1' as const;
const COMPLETION = 'warpkeep-ptr-initial-atlas-verification-recovery-completion-v1' as const;
const HASH = /^[a-f0-9]{64}$/u;
function fail(code: string): never {
  throw Object.assign(new Error(`PTR_INITIAL_ATLAS_VERIFICATION_${code}`), { code: `PTR_INITIAL_ATLAS_VERIFICATION_${code}` });
}
export type PtrInitialAtlasVerificationRecovery = Readonly<{
  profile: typeof PROFILE; originalMarkerDigest: string;
  priorTerrainRecoveryV2Key: string; priorTerrainRecoveryV2Digest: string;
  currentUpdateInspectionDigest: string; currentContinuationDigest: string;
  prefixDigest: string; auditDigest: string; boundaryDigest: string; stagedStatusDigest: string;
}>;
type Common = Readonly<{
  journal: ReturnType<typeof openPtrInitialOwnerUpdateJournal>; marker: unknown;
  recovery: PtrInitialAtlasVerificationRecovery; assert: () => void;
  /** Guards all five retained submissions and the absence of four historical recovery ACKs. */
  validatePrior: () => void;
  validateReceipt: (value: unknown) => PtrProductionImportReceipt;
}>;
function priorV2Key(marker: unknown): string {
  const originalMarkerDigest = updateDigest(marker);
  const staged = updateDigest({ profile: 'warpkeep-ptr-initial-atlas-staged-recovery-v1', originalMarkerDigest });
  const region = updateDigest({ profile: 'warpkeep-ptr-initial-atlas-region-recovery-v1', originalMarkerDigest, priorRecoveryKey: staged });
  const terrain = updateDigest({ profile: 'warpkeep-ptr-initial-atlas-terrain-recovery-v1', originalMarkerDigest, priorRegionRecoveryKey: region });
  return updateDigest({ profile: 'warpkeep-ptr-initial-atlas-terrain-recovery-v2', originalMarkerDigest, priorTerrainRecoveryKey: terrain });
}
/** One fixed continuation slot. Source, cursor, module and attempts never change this key. */
export function ptrInitialAtlasVerificationRecoveryKey(marker: unknown): string {
  return updateDigest({ profile: PROFILE, originalMarkerDigest: updateDigest(marker), priorTerrainRecoveryV2Key: priorV2Key(marker) });
}
export function assertPtrInitialAtlasVerificationReducer(reducer: unknown): void {
  if (reducer !== 'admin_verify_greater_realm_batch_v1' && reducer !== 'admin_finalize_greater_realm_release_v1')
    fail('REDUCER_FORBIDDEN');
}
function validateRecovery(input: Common): void {
  const expected = ['profile', 'originalMarkerDigest', 'priorTerrainRecoveryV2Key', 'priorTerrainRecoveryV2Digest',
    'currentUpdateInspectionDigest', 'currentContinuationDigest', 'prefixDigest', 'auditDigest', 'boundaryDigest', 'stagedStatusDigest'];
  const recovery = input.recovery;
  if (!recovery || Object.getPrototypeOf(recovery) !== Object.prototype
    || Reflect.ownKeys(recovery).some(key => typeof key !== 'string')
    || Object.getOwnPropertyNames(recovery).sort().join('\0') !== expected.sort().join('\0')
    || Object.values(Object.getOwnPropertyDescriptors(recovery)).some(property => !property.enumerable || !Object.hasOwn(property, 'value'))
    || recovery.profile !== PROFILE
    || Object.entries(recovery).some(([key, value]) => key !== 'profile' && (typeof value !== 'string' || !HASH.test(value)))
    || recovery.originalMarkerDigest !== updateDigest(input.marker) || recovery.priorTerrainRecoveryV2Key !== priorV2Key(input.marker))
    fail('RECOVERY_BINDING_DIFFERENT');
}
function assertPrior(input: Common): void {
  input.assert(); input.journal.assert(); input.validatePrior(); input.assert(); input.journal.assert();
  const original = updateDigest(input.marker);
  if (!input.journal.present('submission', original)
    || updateCanonical(input.journal.read('submission', original).value) !== updateCanonical(input.marker))
    fail('ORIGINAL_MARKER_DIFFERENT');
}
function checkedReceipt(input: Common, value: unknown): PtrProductionImportReceipt {
  const receipt = input.validateReceipt(value);
  const { importReceiptDigest, ...body } = receipt;
  if (importReceiptDigest !== ptrProductionImportReceiptDigest(body)) fail('RECEIPT_DIFFERENT');
  return receipt;
}
function completion(input: Common, receiptJson: string) {
  return { profile: COMPLETION, originalMarkerDigest: updateDigest(input.marker),
    recoveryDigest: updateDigest(input.recovery), receiptJson };
}

/** Executes a distinct verification-only invocation once; marked failures can only reconcile. */
export async function coordinatePtrInitialAtlasVerificationRecovery(input: Common & Readonly<{
  execute: (beforeSend: () => void) => Promise<PtrProductionImportReceipt>;
}>) {
  validateRecovery(input); assertPrior(input);
  const key = ptrInitialAtlasVerificationRecoveryKey(input.marker), original = updateDigest(input.marker), journal = input.journal;
  if (journal.present('submission', key)) fail('RECOVERY_ALREADY_MARKED_RECONCILE_ONLY');
  if (journal.present('acknowledgement', original) || journal.present('acknowledgement', key)) fail('RECOVERY_ALREADY_COMPLETE');
  let marked = false;
  const check = () => {
    assertPrior(input);
    if (journal.present('acknowledgement', original)) fail('RECOVERY_ALREADY_COMPLETE');
    if (marked && (!journal.present('submission', key)
      || updateCanonical(journal.read('submission', key).value) !== updateCanonical(input.recovery))) fail('RECOVERY_MARKER_DIFFERENT');
  };
  const receipt = checkedReceipt(input, await input.execute(() => {
    check();
    if (!marked) {
      if (journal.present('submission', key)) fail('RECOVERY_ALREADY_MARKED_RECONCILE_ONLY');
      journal.write('submission', key, input.recovery); marked = true;
    }
    check();
  }));
  if (!marked) fail('RECOVERY_SUBMISSION_NOT_MARKED');
  const receiptJson = JSON.stringify(receipt);
  if (Buffer.byteLength(receiptJson) > 64 * 1024) fail('RECEIPT_BOUND');
  check(); journal.write('acknowledgement', key, completion(input, receiptJson)); check();
  if (updateCanonical(journal.read('acknowledgement', key).value) !== updateCanonical(completion(input, receiptJson)))
    fail('COMPLETION_DIFFERENT');
  check(); journal.write('acknowledgement', original, { markerDigest: original, receiptJson });
  assertPrior(input);
  if (updateCanonical(journal.read('acknowledgement', original).value) !== updateCanonical({ markerDigest: original, receiptJson }))
    fail('COMPLETION_DIFFERENT');
  return receipt;
}

/** Complete retained acknowledgement chain only; never invokes an executor or writes a journal. */
export function reconcilePtrInitialAtlasVerificationRecovery(input: Common): PtrProductionImportReceipt {
  validateRecovery(input); assertPrior(input);
  const journal = input.journal, key = ptrInitialAtlasVerificationRecoveryKey(input.marker), original = updateDigest(input.marker);
  if (!journal.present('submission', key)) fail('RECOVERY_SUBMISSION_MISSING');
  if (updateCanonical(journal.read('submission', key).value) !== updateCanonical(input.recovery)) fail('RECOVERY_MARKER_DIFFERENT');
  if (!journal.present('acknowledgement', key) || !journal.present('acknowledgement', original)) fail('RECOVERY_COMPLETION_MISSING_RECONCILE_ONLY');
  const value = journal.read('acknowledgement', key).value as ReturnType<typeof completion>;
  if (!value || typeof value.receiptJson !== 'string' || Buffer.byteLength(value.receiptJson) > 64 * 1024
    || updateCanonical(value) !== updateCanonical(completion(input, value.receiptJson))
    || updateCanonical(journal.read('acknowledgement', original).value)
      !== updateCanonical({ markerDigest: original, receiptJson: value.receiptJson })) fail('COMPLETION_DIFFERENT');
  const bytes = Buffer.from(value.receiptJson);
  try { const receipt = checkedReceipt(input, parseExistingUpdateJson(bytes)); assertPrior(input); return receipt; }
  finally { bytes.fill(0); }
}
