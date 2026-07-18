import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('admin allow performs founding in the same reducer after the positive-epoch transition', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminAllowFid');
  const end = admin.indexOf('/** Trusted local-operator', start);
  const reducer = admin.slice(start, end);
  assert.match(reducer, /executeAllowFidTransition/);
  assert.match(reducer, /ensureGenesisFounder\(ctx, fid\)/);
  assert.match(reducer, /audit: \(\) => audit\(ctx, 'allow_fid'/);
  assert.doesNotMatch(reducer, /playerV2\.(?:insert|update)|playerOwnershipV2\.(?:insert|update)/);

  const authority = source('../src/foundingAuthority.ts');
  assert.match(authority, /selectNextPermanentCastleSlot/);
  assert.match(authority, /realmProfileV1\.insert/);
  assert.match(authority, /markAccountV1\.insert/);
  assert.match(authority, /castle\.insert/);
  assert.match(authority, /castleSlotClaimV1\.insert/);
  assert.match(authority, /worldTile\.key\.update/);
  assert.match(authority, /communityStatsVisible: false/);
});

test('first JWT bootstrap only binds and reuses the pre-founded castle', () => {
  const admission = source('../src/reducers/admission.ts');
  const start = admission.indexOf('export const bootstrapPlayerV2');
  const end = admission.indexOf('/**\n * Records the explicit current Alpha agreement', start);
  const reducer = admission.slice(start, end);
  assert.match(reducer, /assertExistingPlayerV2Consistency/);
  assert.match(admission, /function assertExistingPlayerV2Consistency[\s\S]*assertGenesisFounderForFid/);
  assert.match(reducer, /playerOwnershipV2\.insert/);
  assert.match(reducer, /playerV2\.insert/);
  assert.match(reducer, /firstAuthenticatedAt:/);
  assert.doesNotMatch(reducer, /castle\.(?:insert|update|delete)/);
  assert.doesNotMatch(reducer, /worldTile\.(?:insert|update|delete)/);
});

test('player admission, bootstrap, and terms paths never scan the full realm', () => {
  const admission = source('../src/reducers/admission.ts');
  assert.doesNotMatch(admission, /\.iter\s*\(/);

  const authority = source('../src/foundingAuthority.ts');
  const localStart = authority.indexOf('export function assertGenesisFounderForFid');
  const localEnd = authority.indexOf('/**\n * Creates the complete permanent founder state', localStart);
  const localAssertion = authority.slice(localStart, localEnd);
  assert.match(localAssertion, /castle\.ownerFid\.find/);
  assert.match(localAssertion, /castleSlotClaimV1\.ownerFid\.find/);
  assert.match(localAssertion, /markAccountV1\.fid\.find/);
  assert.doesNotMatch(localAssertion, /\.iter\s*\(/);
});

test('public Mark projection is gated by an exact authenticated current entry-agreement transition', () => {
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
  assert.doesNotMatch(reducer, /ENTRY_AGREEMENT_EVIDENCE_VERSIONS/);
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
  assert.match(procedure, /walletAttributionSnapshotV1\.count/);
  assert.match(procedure, /snapScanBatchV1\.count/);
  assert.match(procedure, /alphaTermsAcceptanceV1\.count/);
  assert.match(procedure, /playerOwnershipV2\.fid\.find\(row\.fid\) === null[\s\S]*allowedFid\.fid\.find\(row\.fid\) === null/);
  assert.match(procedure, /playerV2\.fid\.find\(row\.fid\) === null[\s\S]*allowedFid\.fid\.find\(row\.fid\) === null/);
  assert.doesNotMatch(procedure, /return\s*\{[\s\S]*(?:canonicalUsername|displayName|pfpUrl|transactionHash|senderAddress)/);
});
