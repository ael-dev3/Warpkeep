import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin } from '../auth';
import {
  DAILY_MARK_SWEEP_INTERVAL_MICROS,
  activateDailyMarks,
  admittedDailyMarksProjectionIsConsistent,
  backfillDailyMarks,
  dailyMarkGrantKey,
  dailyMarksPublicProjectionIsAuthorized,
  dailyMarksErrorCode,
} from '../dailyMarksAuthority';
import {
  ADMITTED_DAILY_MARK_GRANT_MICROS,
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION,
  admittedDailyMarkAccountIsConsistent,
  admittedDailyMarkUtcDay,
  frozenLegacyZeroMarkAccountIsConsistent,
} from '../marksAuthorityPolicy';
import warpkeep from '../schema';

const adminDailyMarksStatusV1 = t.object('AdminDailyMarksStatusV1', {
  policyVersion: t.string(),
  utcDay: t.u64(),
  allowedFids: t.u64(),
  enabledAllowedFids: t.u64(),
  markAccounts: t.u64(),
  dailyAccounts: t.u64(),
  legacyZeroAccounts: t.u64(),
  invalidAccounts: t.u64(),
  realmProfiles: t.u64(),
  profileProjectionViolations: t.u64(),
  missingFounderState: t.u64(),
  grants: t.u64(),
  currentDayGrants: t.u64(),
  grantInvariantViolations: t.u64(),
  grantAccountReconciliationViolations: t.u64(),
  scheduleRows: t.u64(),
  scheduleConfigValid: t.bool(),
  legacyCompatibilityRows: t.u64(),
  readyForBackfill: t.bool(),
  readyForActivation: t.bool(),
  active: t.bool(),
});

function senderPolicyError(error: unknown): never {
  const code = dailyMarksErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  if (error instanceof SenderError) throw error;
  throw error;
}

function frozenLegacyProjectionIsConsistent(profile: Readonly<{
  communityStatsVisible: boolean;
  totalSnapBurnedMicros?: bigint;
  marksEarnedMicros?: bigint;
  marksSpentMicros?: bigint;
  marksBalanceMicros?: bigint;
  marksPolicyVersion?: string;
}>): boolean {
  if (!profile.communityStatsVisible) {
    return profile.totalSnapBurnedMicros === undefined
      && profile.marksEarnedMicros === undefined
      && profile.marksSpentMicros === undefined
      && profile.marksBalanceMicros === undefined
      && profile.marksPolicyVersion === undefined;
  }
  return profile.totalSnapBurnedMicros === 0n
    && profile.marksEarnedMicros === 0n
    && profile.marksSpentMicros === 0n
    && profile.marksBalanceMicros === 0n
    && profile.marksPolicyVersion === FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION;
}

function inspectDailyMarks(ctx: Parameters<typeof requireAdmin>[0]) {
  const utcDay = admittedDailyMarkUtcDay(ctx.timestamp.microsSinceUnixEpoch);
  let enabledAllowedFids = 0n;
  let missingFounderState = 0n;
  for (const admission of ctx.db.allowedFid.iter()) {
    if (admission.enabled) enabledAllowedFids += 1n;
    if (
      ctx.db.castle.ownerFid.find(admission.fid) === null
      || ctx.db.realmProfileV1.fid.find(admission.fid) === null
      || ctx.db.markAccountV1.fid.find(admission.fid) === null
    ) missingFounderState += 1n;
  }

  let dailyAccounts = 0n;
  let legacyZeroAccounts = 0n;
  let invalidAccounts = 0n;
  for (const account of ctx.db.markAccountV1.iter()) {
    if (admittedDailyMarkAccountIsConsistent(account)) dailyAccounts += 1n;
    else if (frozenLegacyZeroMarkAccountIsConsistent(account)) legacyZeroAccounts += 1n;
    else invalidAccounts += 1n;
    if (
      ctx.db.allowedFid.fid.find(account.fid) === null
      || ctx.db.realmProfileV1.fid.find(account.fid) === null
    ) invalidAccounts += 1n;
  }

  let profileProjectionViolations = 0n;
  for (const profile of ctx.db.realmProfileV1.iter()) {
    const account = ctx.db.markAccountV1.fid.find(profile.fid);
    const projectionValid = account !== null
      && dailyMarksPublicProjectionIsAuthorized(ctx, profile)
      && (
      admittedDailyMarkAccountIsConsistent(account)
        ? admittedDailyMarksProjectionIsConsistent(profile, account)
        : frozenLegacyZeroMarkAccountIsConsistent(account)
          && frozenLegacyProjectionIsConsistent(profile)
      );
    if (!projectionValid) profileProjectionViolations += 1n;
  }

  const grantTotals = new Map<bigint, bigint>();
  let currentDayGrants = 0n;
  let grantInvariantViolations = 0n;
  for (const grant of ctx.db.dailyMarkGrantV1.iter()) {
    const admission = ctx.db.allowedFid.fid.find(grant.fid);
    let expectedKey = '';
    try {
      expectedKey = dailyMarkGrantKey(grant.fid, grant.utcDay);
    } catch {
      grantInvariantViolations += 1n;
      continue;
    }
    if (
      grant.grantKey !== expectedKey
      || grant.amountMicros !== ADMITTED_DAILY_MARK_GRANT_MICROS
      || grant.policyVersion !== ADMITTED_DAILY_MARK_POLICY_VERSION
      || admission === null
      || ctx.db.markAccountV1.fid.find(grant.fid) === null
    ) grantInvariantViolations += 1n;
    // The activation/recovery checkpoint compares against the current enabled
    // set. A same-day revocation retains its immutable receipt but no longer
    // contributes to this eligibility-scoped count.
    if (grant.utcDay === utcDay && admission?.enabled) currentDayGrants += 1n;
    grantTotals.set(grant.fid, (grantTotals.get(grant.fid) ?? 0n) + grant.amountMicros);
  }

  let grantAccountReconciliationViolations = 0n;
  for (const account of ctx.db.markAccountV1.iter()) {
    const receiptTotal = grantTotals.get(account.fid) ?? 0n;
    if (
      (admittedDailyMarkAccountIsConsistent(account) && receiptTotal !== account.earnedMicros)
      || (frozenLegacyZeroMarkAccountIsConsistent(account) && receiptTotal !== 0n)
    ) grantAccountReconciliationViolations += 1n;
  }

  let scheduleRows = 0n;
  let canonicalScheduleRows = 0n;
  for (const schedule of ctx.db.dailyMarkScheduleV1.iter()) {
    scheduleRows += 1n;
    if (
      schedule.policyVersion === ADMITTED_DAILY_MARK_POLICY_VERSION
      && schedule.scheduledAt.tag === 'Interval'
      && schedule.scheduledAt.value.micros === DAILY_MARK_SWEEP_INTERVAL_MICROS
    ) canonicalScheduleRows += 1n;
  }
  const scheduleConfigValid = scheduleRows === 0n
    || (scheduleRows === 1n && canonicalScheduleRows === 1n);
  const legacyCompatibilityRows = ctx.db.snapBurnCreditV1.count()
    + ctx.db.fidWalletAttributionV1.count()
    + ctx.db.walletAttributionSnapshotV1.count()
    + ctx.db.snapScanCursorV1.count()
    + ctx.db.snapScanBatchV1.count();
  const exactFounderGraph = ctx.db.allowedFid.count() === ctx.db.castle.count()
    && ctx.db.allowedFid.count() === ctx.db.realmProfileV1.count()
    && ctx.db.allowedFid.count() === ctx.db.markAccountV1.count()
    && missingFounderState === 0n;
  const commonReady = exactFounderGraph
    && invalidAccounts === 0n
    && profileProjectionViolations === 0n
    && legacyCompatibilityRows === 0n
    && grantInvariantViolations === 0n
    && grantAccountReconciliationViolations === 0n;
  const readyForBackfill = commonReady
    && ctx.db.dailyMarkGrantV1.count() === 0n
    && scheduleRows === 0n;
  const readyForActivation = commonReady
    && legacyZeroAccounts === 0n
    && dailyAccounts === ctx.db.markAccountV1.count()
    && ctx.db.dailyMarkGrantV1.count() === 0n
    && scheduleRows === 0n;
  const active = commonReady
    && legacyZeroAccounts === 0n
    && dailyAccounts === ctx.db.markAccountV1.count()
    && scheduleRows === 1n
    && scheduleConfigValid;

  return {
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
    utcDay,
    allowedFids: ctx.db.allowedFid.count(),
    enabledAllowedFids,
    markAccounts: ctx.db.markAccountV1.count(),
    dailyAccounts,
    legacyZeroAccounts,
    invalidAccounts,
    realmProfiles: ctx.db.realmProfileV1.count(),
    profileProjectionViolations,
    missingFounderState,
    grants: ctx.db.dailyMarkGrantV1.count(),
    currentDayGrants,
    grantInvariantViolations,
    grantAccountReconciliationViolations,
    scheduleRows,
    scheduleConfigValid,
    legacyCompatibilityRows,
    readyForBackfill,
    readyForActivation,
    active,
  };
}

/** Counts-only Hermes review surface; it never reveals a FID or balance. */
export const adminGetDailyMarksStatusV1 = warpkeep.procedure(
  { name: 'admin_get_daily_marks_status_v1' },
  adminDailyMarksStatusV1,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    return inspectDailyMarks(tx);
  }),
);

/** Convert only an exact, proven-zero predecessor ledger. */
export const adminBackfillDailyMarkAccountsV1 = warpkeep.reducer(
  { name: 'admin_backfill_daily_mark_accounts_v1' },
  { expectedFounderCount: t.u64() },
  (ctx, { expectedFounderCount }) => {
    try {
      const admin = requireAdmin(ctx);
      const before = inspectDailyMarks(ctx);
      if (!before.readyForBackfill) throw new SenderError('DAILY_MARK_BACKFILL_NOT_READY');
      const result = backfillDailyMarks(ctx, expectedFounderCount);
      const after = inspectDailyMarks(ctx);
      if (!after.readyForActivation) throw new SenderError('DAILY_MARK_BACKFILL_INTEGRITY');
      if (result.migrated === 0) return;
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'backfill_daily_mark_accounts_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `migrated=${result.migrated};preserved=${result.preserved}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Credit the current UTC day and install the singleton recurring schedule. */
export const adminActivateDailyMarksV1 = warpkeep.reducer(
  { name: 'admin_activate_daily_marks_v1' },
  {
    expectedFounderCount: t.u64(),
    expectedEnabledCount: t.u64(),
    expectedUtcDay: t.u64(),
  },
  (ctx, { expectedFounderCount, expectedEnabledCount, expectedUtcDay }) => {
    try {
      const admin = requireAdmin(ctx);
      if (admittedDailyMarkUtcDay(ctx.timestamp.microsSinceUnixEpoch) !== expectedUtcDay) {
        throw new SenderError('DAILY_MARK_UTC_DAY_CHANGED');
      }
      const result = activateDailyMarks(ctx, expectedFounderCount, expectedEnabledCount);
      const after = inspectDailyMarks(ctx);
      if (!after.active || after.currentDayGrants !== after.enabledAllowedFids) {
        throw new SenderError('DAILY_MARK_ACTIVATION_INTEGRITY');
      }
      if (!result.activated) return;
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'activate_daily_marks_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `day=${result.utcDay};credited=${result.credited};existing=${result.existing}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);
