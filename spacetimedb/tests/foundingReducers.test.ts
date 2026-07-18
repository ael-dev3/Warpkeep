import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('legacy admin allow rejects first-time admission and only re-enables a complete founder graph', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminAllowFid');
  const end = admin.indexOf('export const adminAdmitFounderV1', start);
  const reducer = admin.slice(start, end);

  assert.match(reducer, /if \(existing === null\) throw new SenderError\('PROFILED_ADMISSION_REQUIRED'\)/);
  assert.match(reducer, /assertGenesisFounderForFid\(ctx, fid\)/);
  assert.match(reducer, /assertGenesisResourceForFid\(ctx, fid\)/);
  assert.match(reducer, /profile === null \|\| !admissionProfileIsComplete\(profile\)/);
  assert.match(reducer, /throw new SenderError\('FOUNDER_PROFILE_INCOMPLETE'\)/);
  assert.match(reducer, /applyAllowedFidTransition/);
  assert.match(reducer, /auditAction: 'allow_fid'/);
  assert.ok(
    reducer.indexOf("throw new SenderError('PROFILED_ADMISSION_REQUIRED')")
      < reducer.indexOf('applyAllowedFidTransition'),
  );
  assert.ok(
    reducer.indexOf('!admissionProfileIsComplete(profile)')
      < reducer.indexOf('applyAllowedFidTransition'),
  );
  assert.doesNotMatch(reducer, /ensureGenesisFounder/);
  assert.doesNotMatch(reducer, /realmProfileV1\.(?:insert|update)/);
  assert.doesNotMatch(reducer, /playerV2\.(?:insert|update)|playerOwnershipV2\.(?:insert|update)/);

  const transitionStart = admin.indexOf('function applyAllowedFidTransition');
  const transitionEnd = admin.indexOf('function assertExactGenesisDynamicGraph', transitionStart);
  const transition = admin.slice(transitionStart, transitionEnd);
  assert.match(transition, /reenabled: plan =>/);
  assert.match(transition, /allowedFid\.fid\.update/);
  assert.match(transition, /auditAction: 'allow_fid' \| 'admit_founder_v1'/);
});

test('profiled admission validates before writes and atomically creates the complete founder graph', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminAdmitFounderV1');
  const end = admin.indexOf('export const adminUpsertRealmProfileV1', start);
  const reducer = admin.slice(start, end);

  assert.match(reducer, /name: 'admin_admit_founder_v1'/);
  assert.match(reducer, /canonicalUsername: t\.string\(\)/);
  assert.match(reducer, /pfpUrl: t\.string\(\)/);
  assert.match(reducer, /profilePolicyVersion !== FARCASTER_PROFILE_POLICY_VERSION/);
  assert.match(reducer, /normalizeAdmissionReadyTrustedProfile\(input\)/);
  assert.match(reducer, /allowedFid\.fid\.find\(input\.fid\) !== null/);
  assert.match(reducer, /FOUNDER_ALREADY_ADMITTED/);
  assert.match(reducer, /applyAllowedFidTransition/);
  assert.match(reducer, /auditAction: 'admit_founder_v1'/);
  assert.match(reducer, /ensureGenesisFounder\(ctx, input\.fid, normalized\)/);
  assert.doesNotMatch(reducer, /realmProfileV1\.fid\.update/);
  assert.match(reducer, /admissionProfileIsComplete\(verifiedProfile\)/);
  assert.match(reducer, /trustedProfilesEqual\(verifiedProfile, normalized\)/);
  assert.match(reducer, /assertGenesisFounderForFid\(ctx, input\.fid\)/);
  assert.match(reducer, /assertGenesisResourceForFid\(ctx, input\.fid\)/);
  assert.ok(
    reducer.indexOf('normalizeAdmissionReadyTrustedProfile(input)')
      < reducer.indexOf('applyAllowedFidTransition'),
  );
  assert.ok(
    reducer.indexOf('FOUNDER_ALREADY_ADMITTED')
      < reducer.indexOf('applyAllowedFidTransition'),
  );
  assert.ok(
    reducer.indexOf('applyAllowedFidTransition')
      < reducer.indexOf('ensureGenesisFounder(ctx, input.fid, normalized)'),
  );
  assert.ok(
    reducer.indexOf('ensureGenesisFounder(ctx, input.fid, normalized)')
      < reducer.indexOf('admissionProfileIsComplete(verifiedProfile)'),
  );
  assert.doesNotMatch(reducer, /playerV2\.(?:insert|update)|playerOwnershipV2\.(?:insert|update)/);

  const authority = source('../src/foundingAuthority.ts');
  assert.match(authority, /selectNextPermanentCastleSlot/);
  assert.match(
    authority,
    /realmProfileV1\.insert\(\{[\s\S]*canonicalUsername: admissionProfile\.canonicalUsername[\s\S]*pfpUrl: admissionProfile\.pfpUrl/,
  );
  assert.match(authority, /admissionProfileIsComplete\(profile\)/);
  assert.match(authority, /trustedProfilesEqual\(profile, admissionProfile\)/);
  assert.match(authority, /markAccountV1\.insert/);
  assert.match(authority, /resourceAccountV1\.insert/);
  assert.match(authority, /castle\.insert/);
  assert.match(authority, /castleSlotClaimV1\.insert/);
  assert.match(authority, /worldTile\.key\.update/);
  assert.match(authority, /communityStatsVisible: false/);
});

test('profile maintenance cannot clear the required canonical founder presentation', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminUpsertRealmProfileV1');
  const end = admin.indexOf('export const adminUpsertFidWalletAttributionV1', start);
  const reducer = admin.slice(start, end);

  assert.match(reducer, /normalizeAdmissionReadyTrustedProfile\(input\)/);
  assert.match(reducer, /assertGenesisFounderForProfileRepair\(ctx, input\.fid\)/);
  assert.match(reducer, /realmProfileV1\.fid\.update/);
  assert.match(reducer, /admissionProfileIsComplete\(verifiedProfile\)/);
  assert.match(reducer, /trustedProfilesEqual\(verifiedProfile, normalized\)/);
  assert.ok(
    reducer.indexOf('normalizeAdmissionReadyTrustedProfile(input)')
      < reducer.indexOf('realmProfileV1.fid.update'),
  );
  assert.ok(
    reducer.indexOf('realmProfileV1.fid.update')
      < reducer.indexOf('admissionProfileIsComplete(verifiedProfile)'),
  );
  assert.doesNotMatch(reducer, /playerV2\.(?:insert|update)|playerOwnershipV2\.(?:insert|update)/);
});

test('first JWT bootstrap only binds and reuses the pre-founded castle', () => {
  const admission = source('../src/reducers/admission.ts');
  const start = admission.indexOf('export const bootstrapPlayerV2');
  const end = admission.indexOf('/**\n * Records the explicit current Alpha agreement', start);
  const reducer = admission.slice(start, end);
  assert.match(reducer, /assertExistingPlayerV2Consistency/);
  assert.match(admission, /function assertExistingPlayerV2Consistency[\s\S]*assertGenesisFounderForFid/);
  assert.match(
    source('../src/foundingAuthority.ts'),
    /assertGenesisFounderForFid[\s\S]*admissionProfileIsComplete\(profile\)/,
  );
  assert.match(reducer, /playerOwnershipV2\.insert/);
  assert.match(reducer, /playerV2\.insert/);
  assert.match(reducer, /admissionProfileIsComplete\(profile\)/);
  assert.match(reducer, /FOUNDER_PROFILE_INCOMPLETE/);
  assert.match(reducer, /firstAuthenticatedAt:/);
  assert.doesNotMatch(reducer, /castle\.(?:insert|update|delete)/);
  assert.doesNotMatch(reducer, /worldTile\.(?:insert|update|delete)/);
});

test('player admission, bootstrap, and terms paths never scan the full realm', () => {
  const admission = source('../src/reducers/admission.ts');
  assert.doesNotMatch(admission, /\.iter\s*\(/);

  const authority = source('../src/foundingAuthority.ts');
  const localStart = authority.indexOf('function requireGenesisFounderStructureForFid');
  const localEnd = authority.indexOf('/** Exact-admin recovery gate', localStart);
  const localAssertion = authority.slice(localStart, localEnd);
  assert.match(localAssertion, /castle\.ownerFid\.find/);
  assert.match(localAssertion, /castleSlotClaimV1\.ownerFid\.find/);
  assert.match(localAssertion, /markAccountV1\.fid\.find/);
  assert.doesNotMatch(localAssertion, /\.iter\s*\(/);
});

test('public Mark projection is gated by an exact authenticated terms transition', () => {
  const admission = source('../src/reducers/admission.ts');
  const start = admission.indexOf('export const acceptAlphaTermsV1');
  const reducer = admission.slice(start);
  assert.match(reducer, /requireAdmittedPlayer/);
  assert.match(reducer, /termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION/);
  assert.match(reducer, /!accepted/);
  assert.match(reducer, /alphaTermsAcceptanceV1\.insert/);
  assert.ok(
    reducer.indexOf('alphaTermsAcceptanceV1.insert')
      < reducer.indexOf('if (profile.communityStatsVisible) return'),
  );
  assert.match(reducer, /ALPHA_TERMS_ACCEPTANCE_CONFLICT/);
  assert.match(reducer, /communityStatsVisible: true/);
  assert.match(reducer, /marksBalanceMicros: account\.balanceMicros/);
});

test('crediting is admin-only, receipt-immutable, fixed-policy, and never publishes private fields', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminCreditSnapBurnV1');
  const end = admin.indexOf('/** Reconciles the exact batch receipt set', start);
  const reducer = admin.slice(start, end);
  assert.match(reducer, /requireAdmin\(ctx\)/);
  assert.match(reducer, /normalizeSnapBurnCredit/);
  assert.match(reducer, /snapBurnCreditsEqual/);
  assert.match(reducer, /applyOneToOneBurnCredit/);
  assert.match(reducer, /SNAP_BURN_REFERENCE_CONFLICT/);
  assert.match(reducer, /SNAP_ATTRIBUTION_AMBIGUOUS/);
  assert.match(reducer, /SCAN_BATCH_NOT_PENDING/);
  assert.match(reducer, /applyScanBatchCredit/);
  assert.match(reducer, /burnReference\.find/);
  assert.match(reducer, /bySnapshotAndAddress\.filter/);
  assert.doesNotMatch(reducer, /snapBurnCreditV1\.iter/);
  assert.doesNotMatch(reducer, /fidWalletAttributionV1\.iter/);
  assert.doesNotMatch(reducer, /realmProfileV1\.fid\.update\(\{[\s\S]*transactionHash/);
});

test('wallet snapshots and scan batches are atomic, resumable, and fail closed', () => {
  const admin = source('../src/reducers/admin.ts');
  const snapshotStart = admin.indexOf('export const adminReplaceFidWalletSnapshotV1');
  const beginStart = admin.indexOf('export const adminBeginSnapScanBatchV1', snapshotStart);
  const creditStart = admin.indexOf('export const adminCreditSnapBurnV1', beginStart);
  const finalizeStart = admin.indexOf('export const adminFinalizeSnapScanBatchV1', creditStart);
  const aggregateStart = admin.indexOf('export const adminGetSnapScanBatchAggregateV1', finalizeStart);
  const snapshot = admin.slice(snapshotStart, beginStart);
  const begin = admin.slice(beginStart, creditStart);
  const finalize = admin.slice(finalizeStart, aggregateStart);
  const aggregate = admin.slice(aggregateStart, admin.indexOf('export const adminDisableFid'));

  assert.match(snapshot, /planWalletSnapshotTransition/);
  assert.match(snapshot, /WALLET_SNAPSHOT_FROZEN_BY_PENDING_BATCH/);
  assert.match(snapshot, /snapshotAttributionKey: `\$\{transition\.generation\}/);
  assert.doesNotMatch(snapshot, /fidWalletAttributionV1\.(?:delete|snapshotAttributionKey\.update)/);
  assert.match(begin, /normalizeScanBatchPlan/);
  assert.match(begin, /existing\.appliedCredits === receipts\.receiptCredits/);
  assert.match(begin, /existing\.finalizedAt === undefined/);
  assert.doesNotMatch(begin, /snapScanCursorV1\.(?:insert|cursorKey\.update)/);
  assert.match(finalize, /scanBatchReadyToFinalize/);
  assert.match(finalize, /batch\.finalizedAt === undefined/);
  assert.match(finalize, /batch\.finalizedAt !== undefined/);
  assert.match(finalize, /snapScanCursorV1\.(?:insert|cursorKey\.update)/);
  assert.match(finalize, /status: 'finalized'/);
  assert.match(aggregate, /internallyConsistent/);
  assert.match(aggregate, /batch\.finalizedAt !== undefined/);
  assert.match(aggregate, /batch\.finalizedAt === undefined/);
  assert.doesNotMatch(aggregate, /(?:transactionHash|senderAddress|walletSnapshotId):/);
});

test('v3 admin status is counts-only and includes founder and ledger orphan signals', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminGetAlphaStatusV3');
  const end = admin.indexOf('/**\n * Bridge/Hermes can resolve', start);
  const procedure = admin.slice(start, end);
  assert.match(procedure, /requireAdmin\(tx\)/);
  for (const field of [
    'founderStateGaps',
    'occupiedWorldTiles',
    'orphanedCastleClaims',
    'markAccountInvariantViolations',
    'publicMarkProjectionViolations',
    'duplicateBurnReferences',
    'burnAccountReconciliationViolations',
    'ambiguousActiveWalletAddresses',
    'staticWorldDriftViolations',
    'orphanedTermsAcceptances',
    'termsAcceptanceInvariantViolations',
    'walletAttributionSnapshots',
    'scanBatches',
    'alphaTermsAcceptances',
  ]) assert.match(procedure, new RegExp(field));
  assert.match(procedure, /classifyGenesisStaticSnapshot/);
  assert.match(procedure, /=== 'invalid' \? 1n : 0n/);
  assert.match(procedure, /tile\.occupantCastleId !== undefined/);
  assert.match(procedure, /!admissionProfileIsComplete\(profile\)/);
  assert.match(procedure, /walletAttributionSnapshotV1\.count/);
  assert.match(procedure, /snapScanBatchV1\.count/);
  assert.match(procedure, /alphaTermsAcceptanceV1\.count/);
  assert.match(procedure, /playerOwnershipV2\.fid\.find\(row\.fid\) === null[\s\S]*allowedFid\.fid\.find\(row\.fid\) === null/);
  assert.match(procedure, /playerV2\.fid\.find\(row\.fid\) === null[\s\S]*allowedFid\.fid\.find\(row\.fid\) === null/);
  assert.doesNotMatch(procedure, /return\s*\{[\s\S]*(?:canonicalUsername|displayName|pfpUrl|transactionHash|senderAddress)/);
});
