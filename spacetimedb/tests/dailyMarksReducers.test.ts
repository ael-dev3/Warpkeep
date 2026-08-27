import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, start: string, end?: string): string {
  const startAt = text.indexOf(start);
  assert.notEqual(startAt, -1, `Missing source marker: ${start}`);
  const endAt = end === undefined ? text.length : text.indexOf(end, startAt);
  assert.notEqual(endAt, -1, `Missing source marker: ${end}`);
  return text.slice(startAt, endAt);
}

test('v14 appends private daily receipt and identity-free schedule tables', () => {
  const schema = source('../src/schema.ts');
  const registration = section(schema, 'const warpkeep = schema({', '});');
  assert.ok(registration.indexOf('accessRequestV1') < registration.indexOf('dailyMarkGrantV1'));
  assert.ok(registration.indexOf('dailyMarkGrantV1') < registration.indexOf('dailyMarkScheduleV1'));

  const grants = section(schema, 'export const dailyMarkGrantV1', 'export const dailyMarkScheduleV1');
  assert.match(grants, /name: 'daily_mark_grant_v1'/);
  assert.doesNotMatch(grants, /public:\s*true/);
  assert.match(grants, /grantKey: t\.string\(\)\.primaryKey\(\)/);
  assert.match(grants, /fid: t\.u64\(\)\.index\(\)/);
  assert.match(grants, /utcDay: t\.u64\(\)\.index\(\)/);

  const schedule = section(schema, 'export const dailyMarkScheduleV1', 'export const innerKeepLayoutV1');
  assert.match(schedule, /name: 'daily_mark_schedule_v_1'/);
  assert.doesNotMatch(schedule, /fid|amountMicros|public:\s*true/);
  assert.match(schedule, /scheduled: \(\): any => runDailyMarkScheduleV1/);
  assert.match(schedule, /policyVersion: t\.string\(\)\.unique\(\)/);
  assert.match(schema, /name: 'run_daily_mark_schedule_v_1'/);
});

test('backfill and activation are admin-only exact-count transitions', () => {
  const reducers = source('../src/reducers/dailyMarks.ts');
  const backfill = section(
    reducers,
    'export const adminBackfillDailyMarkAccountsV1',
    'export const adminActivateDailyMarksV1',
  );
  assert.match(backfill, /requireAdmin\(ctx\)/);
  assert.match(backfill, /expectedFounderCount: t\.u64\(\)/);
  assert.match(backfill, /before\.readyForBackfill/);
  assert.match(backfill, /backfillDailyMarks\(ctx, expectedFounderCount\)/);
  assert.match(backfill, /after\.readyForActivation/);

  const activation = section(reducers, 'export const adminActivateDailyMarksV1');
  assert.match(activation, /requireAdmin\(ctx\)/);
  assert.match(activation, /expectedFounderCount: t\.u64\(\)/);
  assert.match(activation, /expectedEnabledCount: t\.u64\(\)/);
  assert.match(activation, /expectedUtcDay: t\.u64\(\)/);
  assert.match(activation, /admittedDailyMarkUtcDay\(ctx\.timestamp\.microsSinceUnixEpoch\)/);
  assert.match(activation, /activateDailyMarks\(ctx, expectedFounderCount, expectedEnabledCount\)/);
  assert.match(activation, /after\.currentDayGrants !== after\.enabledAllowedFids/);
});

test('the operator status is counts-only and proves retired state is empty', () => {
  const reducers = source('../src/reducers/dailyMarks.ts');
  const status = section(
    reducers,
    'export const adminGetDailyMarksStatusV1',
    'export const adminBackfillDailyMarkAccountsV1',
  );
  assert.match(status, /requireAdmin\(tx\)/);
  assert.doesNotMatch(status, /fid:\s*t\.u64|balanceMicros:\s*t\.u128|grantKey:\s*t\.string/);

  const inspection = section(reducers, 'function inspectDailyMarks', '/** Counts-only Hermes');
  for (const legacyTable of [
    'snapBurnCreditV1',
    'fidWalletAttributionV1',
    'walletAttributionSnapshotV1',
    'snapScanCursorV1',
    'snapScanBatchV1',
  ]) assert.match(inspection, new RegExp(`${legacyTable}\\.count`));
  assert.match(inspection, /grantAccountReconciliationViolations/);
  assert.match(inspection, /profileProjectionViolations/);
  assert.match(inspection, /dailyMarksPublicProjectionIsAuthorized\(ctx, profile\)/);
  assert.match(inspection, /scheduleConfigValid/);
  assert.match(
    inspection,
    /grant\.utcDay === utcDay && admission\?\.enabled/,
  );
});

test('every visible daily Marks projection requires retained agreement authority', () => {
  const authority = source('../src/dailyMarksAuthority.ts');
  assert.match(
    authority,
    /import \{ retainedEntryAgreementEvidenceExists \} from '\.\/entryAgreementPolicy'/,
  );
  const authorization = section(
    authority,
    'export function dailyMarksPublicProjectionIsAuthorized',
    'function applyContextBatch',
  );
  assert.match(authorization, /if \(!profile\.communityStatsVisible\) return true/);
  assert.match(authorization, /if \(profile\.firstAuthenticatedAt === undefined\) return false/);
  assert.match(authorization, /return retainedEntryAgreementEvidenceExists\(/);
  assert.match(
    authorization,
    /ctx\.db\.alphaTermsAcceptanceV1\.acceptanceKey\.find\(acceptanceKey\)/,
  );

  const batchSource = section(authority, 'function contextBatchSource', '/**\n * Re-establish');
  assert.match(batchSource, /dailyMarksPublicProjectionIsAuthorized\(ctx, profile\)/);
  const backfill = section(authority, 'export function backfillDailyMarks', '/**\n * Exact-count activation');
  assert.match(backfill, /!dailyMarksPublicProjectionIsAuthorized\(ctx, profile\)/);
  const activation = section(authority, 'export function activateDailyMarks');
  assert.match(activation, /!dailyMarksPublicProjectionIsAuthorized\(ctx, profile\)/);
});

test('admission and re-enable grant only after authoritative founder state exists', () => {
  const admin = source('../src/reducers/admin.ts');
  const allow = section(admin, 'export const adminAllowFid', 'export const adminAdmitFounderV1');
  assert.ok(
    allow.indexOf('applyAllowedFidTransition') < allow.indexOf('grantDailyMarkIfActive(ctx, fid)'),
  );
  const admit = section(
    admin,
    'export const adminAdmitFounderV1',
    'export const adminUpsertRealmProfileV1',
  );
  assert.ok(
    admit.indexOf('ensureGenesisFounder')
      < admit.indexOf('grantDailyMarkIfActive(ctx, input.fid)'),
  );
});

test('current agreement acceptance preserves the frozen projection until v14 backfill', () => {
  const admission = source('../src/reducers/admission.ts');
  const accept = section(admission, 'export const acceptAlphaTermsV1');
  assert.match(accept, /frozenLegacyZeroMarkAccountIsConsistent\(account\)/);
  assert.match(accept, /totalSnapBurnedMicros: frozenLegacyAccount \? 0n : undefined/);

  const fixture = source('../migration-fixtures/additive-v11-schema/src/index.ts');
  const predecessor = section(
    fixture,
    'export const fixtureSeedWorkerCutoverV11',
    'export const fixtureRewindResourceOneQuantum',
  );
  assert.match(predecessor, /communityStatsVisible: false/);
  assert.match(predecessor, /totalSnapBurnedMicros: undefined/);

  const verifier = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const rollout = section(
    verifier,
    "stage = 'daily-marks-v14-rollout'",
    "stage = 'preactivation'",
  );
  const acceptAt = rollout.indexOf("'accept_alpha_terms_v1'");
  const agreementBeforeAt = rollout.indexOf('agreementBeforeAcceptance');
  const agreementAfterAt = rollout.indexOf('agreementAfterAcceptance');
  const acceptedStatusAt = rollout.indexOf('dailyMarksAfterAcceptance');
  const backfillAt = rollout.indexOf("'admin_backfill_daily_mark_accounts_v1'");
  assert.ok(
    agreementBeforeAt >= 0
      && acceptAt > agreementBeforeAt
      && agreementAfterAt > acceptAt
      && acceptedStatusAt > agreementAfterAt
      && backfillAt > acceptedStatusAt,
  );
  assert.match(rollout, /agreementBeforeAcceptance\[0\] !== alphaTermsVersion/);
  assert.match(rollout, /agreementBeforeAcceptance\[1\] !== false/);
  assert.match(rollout, /agreementAfterAcceptance\[1\] !== true/);
  assert.match(rollout, /dailyMarksAfterAcceptance\.profileProjectionViolations !== 0n/);
  assert.match(rollout, /!dailyMarksAfterAcceptance\.readyForBackfill/);
});

test('the v14 runtime proof preserves daily Marks while current revocation is sealed', () => {
  const verifier = source('../../scripts/verify-spacetime-additive-migration.mjs');
  const rollout = section(
    verifier,
    "stage = 'daily-marks-v14-rollout'",
    "stage = 'preactivation'",
  );
  const activationAt = rollout.indexOf('const dailyMarksActive');
  const disableAt = rollout.indexOf("'admin_disable_fid'", activationAt);
  const sealedStatusAt = rollout.indexOf('const dailyMarksAfterSealedDisable', disableAt);
  const sealedRetryAt = rollout.indexOf("'admin_activate_daily_marks_v1'", sealedStatusAt);
  assert.ok(
    activationAt >= 0
      && disableAt > activationAt
      && sealedStatusAt > disableAt
      && sealedRetryAt > sealedStatusAt,
  );
  assert.match(rollout, /'admin_disable_fid'[\s\S]*530/);
  assert.match(rollout, /sealedDisableResponse\.trim\(\), 'ADMISSIONS_SEALED'/);
  assert.match(
    rollout,
    /assert\.deepEqual\(dailyMarksAfterSealedDisable, dailyMarksActive\)/,
  );
  assert.match(rollout, /playerAuthEpoch !== 1/);
  assert.match(
    rollout,
    /JSON\.stringify\(\[1, 1, Number\(dailyMarksActive\.utcDay\)\]\)/,
  );
  assert.match(rollout, /assert\.deepEqual\(dailyMarksSealedRetry, dailyMarksActive\)/);
  assert.doesNotMatch(rollout, /'admin_allow_fid'|playerAuthEpoch = 2/);
});

test('no current module export exposes a burn or wallet credit writer', () => {
  const index = source('../src/index.ts');
  const schema = source('../src/schema.ts');
  for (const wire of [
    'admin_credit_snap_burn_v1',
    'admin_begin_snap_scan_batch_v1',
    'admin_finalize_snap_scan_batch_v1',
    'admin_replace_fid_wallet_snapshot_v1',
  ]) {
    assert.doesNotMatch(index, new RegExp(wire, 'i'));
    assert.doesNotMatch(schema.slice(schema.indexOf('// SpacetimeDB 2.6')), new RegExp(wire, 'i'));
  }
});
