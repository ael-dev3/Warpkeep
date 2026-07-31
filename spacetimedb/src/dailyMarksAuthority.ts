import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import type warpkeep from './schema';
import { MAX_AUTH_EPOCH, MAX_SUPPORTED_FID } from './config';
import { retainedEntryAgreementEvidenceExists } from './entryAgreementPolicy';
import {
  ADMITTED_DAILY_MARK_GRANT_MICROS,
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION,
  MAX_U128,
  MarksAuthorityPolicyError,
  admittedDailyMarkAccountIsConsistent,
  admittedDailyMarkUtcDay,
  applyAdmittedDailyMarkGrant,
  dailyMarkRolloutAccountIsConsistent,
  frozenLegacyZeroMarkAccountIsConsistent,
  migrateFrozenLegacyZeroMarkAccount,
  type MarkAccountState,
} from './marksAuthorityPolicy';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

export const DAILY_MARK_SWEEP_INTERVAL_MICROS = 60n * 60n * 1_000_000n;

export class DailyMarksAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DailyMarksAuthorityError';
  }
}

export type DailyMarkAdmissionState = Readonly<{
  fid: bigint;
  enabled: boolean;
  authEpoch: number;
}>;

export type DailyMarkGrantRecord = Readonly<{
  grantKey: string;
  fid: bigint;
  utcDay: bigint;
  amountMicros: bigint;
  policyVersion: string;
}>;

export type DailyMarksProfileProjection = Readonly<{
  communityStatsVisible: boolean;
  totalSnapBurnedMicros: bigint | undefined;
  marksEarnedMicros: bigint | undefined;
  marksSpentMicros: bigint | undefined;
  marksBalanceMicros: bigint | undefined;
  marksPolicyVersion: string | undefined;
}>;

export type DailyMarkAccountRecord = MarkAccountState & Readonly<{ fid: bigint }>;

export type DailyMarkBatchSource = Readonly<{
  admissions: Iterable<DailyMarkAdmissionState>;
  findAccount(fid: bigint): DailyMarkAccountRecord | null;
  findGrant(grantKey: string): DailyMarkGrantRecord | null;
  grantsForFid(fid: bigint): Iterable<DailyMarkGrantRecord>;
  findProfile(fid: bigint): DailyMarksProfileProjection | null;
  publicProjectionAuthorized(fid: bigint): boolean;
}>;

export type DailyMarkAccountUpdate = DailyMarkAccountRecord;

export type DailyMarkProfileUpdate = DailyMarksProfileProjection & Readonly<{
  fid: bigint;
}>;

export type PlannedDailyMarkCredit = Readonly<{
  account: DailyMarkAccountUpdate;
  grant: DailyMarkGrantRecord;
  profile: DailyMarkProfileUpdate;
}>;

export type DailyMarkBatchPlan = Readonly<{
  utcDay: bigint;
  eligibleAdmissions: number;
  existingGrants: number;
  credits: readonly PlannedDailyMarkCredit[];
}>;

export type DailyMarkBatchWriters = Readonly<{
  updateAccount(update: DailyMarkAccountUpdate): void;
  insertGrant(grant: DailyMarkGrantRecord): void;
  updateProfile(update: DailyMarkProfileUpdate): void;
}>;

function fail(code: string): never {
  throw new DailyMarksAuthorityError(code);
}

function admissionIsStructurallyValid(admission: DailyMarkAdmissionState): boolean {
  return admission.fid > 0n
    && admission.fid <= MAX_SUPPORTED_FID
    && typeof admission.enabled === 'boolean'
    && Number.isInteger(admission.authEpoch)
    && admission.authEpoch >= 1
    && admission.authEpoch <= MAX_AUTH_EPOCH;
}

export function dailyMarkGrantKey(fid: bigint, utcDay: bigint): string {
  if (fid <= 0n || fid > MAX_SUPPORTED_FID) fail('DAILY_MARK_FID_INVALID');
  if (utcDay < 0n) fail('DAILY_MARK_UTC_DAY_INVALID');
  return `${fid}:${utcDay}`;
}

export function dailyMarkGrantRecordsEqual(
  left: DailyMarkGrantRecord,
  right: DailyMarkGrantRecord,
): boolean {
  return left.grantKey === right.grantKey
    && left.fid === right.fid
    && left.utcDay === right.utcDay
    && left.amountMicros === right.amountMicros
    && left.policyVersion === right.policyVersion;
}

/**
 * Preserve the existing consent-controlled public projection while ensuring
 * the frozen legacy schema option is never populated by the daily policy.
 */
export function projectAdmittedDailyMarks(
  communityStatsVisible: boolean,
  account: MarkAccountState,
): DailyMarksProfileProjection {
  if (!admittedDailyMarkAccountIsConsistent(account)) {
    fail('MARK_ACCOUNT_INVARIANT');
  }
  return Object.freeze({
    communityStatsVisible,
    totalSnapBurnedMicros: undefined,
    marksEarnedMicros: communityStatsVisible ? account.earnedMicros : undefined,
    marksSpentMicros: communityStatsVisible ? account.spentMicros : undefined,
    marksBalanceMicros: communityStatsVisible ? account.balanceMicros : undefined,
    marksPolicyVersion: communityStatsVisible ? account.policyVersion : undefined,
  });
}

export function admittedDailyMarksProjectionIsConsistent(
  profile: DailyMarksProfileProjection,
  account: MarkAccountState,
): boolean {
  if (!admittedDailyMarkAccountIsConsistent(account)) return false;
  const expected = projectAdmittedDailyMarks(profile.communityStatsVisible, account);
  return profile.totalSnapBurnedMicros === expected.totalSnapBurnedMicros
    && profile.marksEarnedMicros === expected.marksEarnedMicros
    && profile.marksSpentMicros === expected.marksSpentMicros
    && profile.marksBalanceMicros === expected.marksBalanceMicros
    && profile.marksPolicyVersion === expected.marksPolicyVersion;
}

function canonicalGrant(fid: bigint, utcDay: bigint): DailyMarkGrantRecord {
  return Object.freeze({
    grantKey: dailyMarkGrantKey(fid, utcDay),
    fid,
    utcDay,
    amountMicros: ADMITTED_DAILY_MARK_GRANT_MICROS,
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
  });
}

function assertGrantLedgerReconciles(
  fid: bigint,
  account: MarkAccountState,
  grants: Iterable<DailyMarkGrantRecord>,
): void {
  const seenUtcDays = new Set<bigint>();
  let total = 0n;
  for (const grant of grants) {
    const canonical = canonicalGrant(fid, grant.utcDay);
    if (
      grant.fid !== fid
      || !dailyMarkGrantRecordsEqual(grant, canonical)
      || seenUtcDays.has(grant.utcDay)
      || grant.amountMicros > MAX_U128 - total
    ) fail('DAILY_MARK_GRANT_LEDGER_INVARIANT');
    seenUtcDays.add(grant.utcDay);
    total += grant.amountMicros;
  }
  if (total !== account.earnedMicros) fail('DAILY_MARK_ACCOUNT_RECONCILIATION');
}

/**
 * Validate the complete enabled-admission set before returning any mutation.
 * Reducers should call this once inside their transaction, then pass the
 * immutable result to `applyDailyMarkGrantBatch`.
 */
export function planDailyMarkGrantBatch(
  nowMicros: bigint,
  source: DailyMarkBatchSource,
): DailyMarkBatchPlan {
  let utcDay: bigint;
  try {
    utcDay = admittedDailyMarkUtcDay(nowMicros);
  } catch (error) {
    if (error instanceof MarksAuthorityPolicyError) fail(error.code);
    throw error;
  }

  const seenFids = new Set<bigint>();
  const credits: PlannedDailyMarkCredit[] = [];
  let eligibleAdmissions = 0;
  let existingGrants = 0;

  for (const admission of source.admissions) {
    if (!admissionIsStructurallyValid(admission)) fail('DAILY_MARK_ADMISSION_INVALID');
    if (seenFids.has(admission.fid)) fail('DAILY_MARK_ADMISSION_DUPLICATE');
    seenFids.add(admission.fid);
    if (!admission.enabled) continue;
    eligibleAdmissions += 1;

    const account = source.findAccount(admission.fid);
    const profile = source.findProfile(admission.fid);
    if (
      account === null
      || account.fid !== admission.fid
      || !admittedDailyMarkAccountIsConsistent(account)
    ) fail('MARK_ACCOUNT_INVARIANT');
    if (
      profile === null
      || (profile.communityStatsVisible && !source.publicProjectionAuthorized(admission.fid))
      || !admittedDailyMarksProjectionIsConsistent(profile, account)
    ) fail('DAILY_MARK_PROFILE_INVARIANT');
    const grant = canonicalGrant(admission.fid, utcDay);
    const existing = source.findGrant(grant.grantKey);
    if (existing !== null) {
      if (!dailyMarkGrantRecordsEqual(existing, grant)) {
        fail('DAILY_MARK_GRANT_CONFLICT');
      }
    }

    let nextAccount: MarkAccountState | undefined;
    if (existing === null) {
      try {
        nextAccount = applyAdmittedDailyMarkGrant(account);
      } catch (error) {
        if (error instanceof MarksAuthorityPolicyError) fail(error.code);
        throw error;
      }
    }

    assertGrantLedgerReconciles(
      admission.fid,
      account,
      source.grantsForFid(admission.fid),
    );

    if (existing !== null) {
      existingGrants += 1;
      continue;
    }
    credits.push(Object.freeze({
      account: Object.freeze({ fid: admission.fid, ...nextAccount! }),
      grant,
      profile: Object.freeze({
        fid: admission.fid,
        ...projectAdmittedDailyMarks(profile.communityStatsVisible, nextAccount!),
      }),
    }));
  }

  return Object.freeze({
    utcDay,
    eligibleAdmissions,
    existingGrants,
    credits: Object.freeze(credits),
  });
}

/**
 * Apply only a fully validated immutable plan. SpacetimeDB reducer atomicity
 * rolls handler writes back together if a storage operation itself fails.
 */
export function applyDailyMarkGrantBatch(
  plan: DailyMarkBatchPlan,
  writers: DailyMarkBatchWriters,
): Readonly<{ credited: number; existing: number; eligible: number }> {
  for (const credit of plan.credits) {
    writers.updateAccount(credit.account);
    writers.insertGrant(credit.grant);
    writers.updateProfile(credit.profile);
  }
  return Object.freeze({
    credited: plan.credits.length,
    existing: plan.existingGrants,
    eligible: plan.eligibleAdmissions,
  });
}

type DailyMarkScheduleRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['dailyMarkScheduleV1']['scheduleId']['find']
>>;

function contextBatchSource(
  ctx: WarpkeepReducerContext,
  admissions: Iterable<DailyMarkAdmissionState> = ctx.db.allowedFid.iter(),
): DailyMarkBatchSource {
  return Object.freeze({
    admissions,
    findAccount: fid => ctx.db.markAccountV1.fid.find(fid),
    findGrant: grantKey => ctx.db.dailyMarkGrantV1.grantKey.find(grantKey),
    grantsForFid: fid => ctx.db.dailyMarkGrantV1.fid.filter(fid),
    findProfile: fid => ctx.db.realmProfileV1.fid.find(fid),
    publicProjectionAuthorized: fid => {
      const profile = ctx.db.realmProfileV1.fid.find(fid);
      return profile !== null && dailyMarksPublicProjectionIsAuthorized(ctx, profile);
    },
  });
}

/**
 * Re-establish consent authority at every server path that may publish a
 * private Mark balance. Hidden projections require no acceptance lookup.
 */
export function dailyMarksPublicProjectionIsAuthorized(
  ctx: WarpkeepReducerContext,
  profile: Readonly<{
    fid: bigint;
    communityStatsVisible: boolean;
    firstAuthenticatedAt?: unknown;
  }>,
): boolean {
  if (!profile.communityStatsVisible) return true;
  if (profile.firstAuthenticatedAt === undefined) return false;
  return retainedEntryAgreementEvidenceExists(
    profile.fid,
    acceptanceKey => ctx.db.alphaTermsAcceptanceV1.acceptanceKey.find(acceptanceKey),
  );
}

function applyContextBatch(
  ctx: WarpkeepReducerContext,
  plan: DailyMarkBatchPlan,
): Readonly<{ credited: number; existing: number; eligible: number }> {
  return applyDailyMarkGrantBatch(plan, {
    updateAccount: update => {
      const existing = ctx.db.markAccountV1.fid.find(update.fid);
      if (existing === null) fail('MARK_ACCOUNT_INVARIANT');
      ctx.db.markAccountV1.fid.update({
        ...existing,
        ...update,
        updatedAt: ctx.timestamp,
      });
    },
    insertGrant: grant => {
      ctx.db.dailyMarkGrantV1.insert({ ...grant, grantedAt: ctx.timestamp });
    },
    updateProfile: update => {
      const existing = ctx.db.realmProfileV1.fid.find(update.fid);
      if (existing === null) fail('DAILY_MARK_PROFILE_INVARIANT');
      ctx.db.realmProfileV1.fid.update({ ...existing, ...update });
    },
  });
}

function scheduleIsCanonical(schedule: DailyMarkScheduleRow): boolean {
  return schedule.policyVersion === ADMITTED_DAILY_MARK_POLICY_VERSION
    && schedule.scheduledAt.tag === 'Interval'
    && schedule.scheduledAt.value.micros === DAILY_MARK_SWEEP_INTERVAL_MICROS;
}

function activeDailyMarkSchedule(
  ctx: WarpkeepReducerContext,
): DailyMarkScheduleRow | undefined {
  const schedules = [...ctx.db.dailyMarkScheduleV1.iter()];
  if (schedules.length === 0) return undefined;
  if (schedules.length !== 1 || !scheduleIsCanonical(schedules[0]!)) {
    fail('DAILY_MARK_SCHEDULE_INVARIANT');
  }
  return schedules[0];
}

/**
 * Admission/re-enable hook. It is inert before activation, rejects malformed
 * active state, and returns true only when this transaction credits the FID.
 */
export function grantDailyMarkIfActive(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): boolean {
  if (activeDailyMarkSchedule(ctx) === undefined) return false;
  const admission = ctx.db.allowedFid.fid.find(fid);
  if (admission === null || !admission.enabled) return false;
  const plan = planDailyMarkGrantBatch(
    ctx.timestamp.microsSinceUnixEpoch,
    contextBatchSource(ctx, [admission]),
  );
  return applyContextBatch(ctx, plan).credited === 1;
}

/** Scheduler-only sweep; its row, cadence, policy, and singleton all attest. */
export function runDailyMarkSchedule(
  ctx: WarpkeepReducerContext,
  schedule: DailyMarkScheduleRow,
): void {
  const active = activeDailyMarkSchedule(ctx);
  if (
    active === undefined
    || active.scheduleId !== schedule.scheduleId
    || !scheduleIsCanonical(schedule)
  ) fail('DAILY_MARK_SCHEDULE_INVARIANT');
  const plan = planDailyMarkGrantBatch(
    ctx.timestamp.microsSinceUnixEpoch,
    contextBatchSource(ctx),
  );
  applyContextBatch(ctx, plan);
}

function legacyMarkTablesAreEmpty(ctx: WarpkeepReducerContext): boolean {
  return ctx.db.snapBurnCreditV1.count() === 0n
    && ctx.db.fidWalletAttributionV1.count() === 0n
    && ctx.db.walletAttributionSnapshotV1.count() === 0n
    && ctx.db.snapScanCursorV1.count() === 0n
    && ctx.db.snapScanBatchV1.count() === 0n;
}

function hiddenProfileProjectionIsEmpty(profile: DailyMarksProfileProjection): boolean {
  return profile.totalSnapBurnedMicros === undefined
    && profile.marksEarnedMicros === undefined
    && profile.marksSpentMicros === undefined
    && profile.marksBalanceMicros === undefined
    && profile.marksPolicyVersion === undefined;
}

function frozenLegacyProfileProjectionIsConsistent(
  profile: DailyMarksProfileProjection,
): boolean {
  if (!profile.communityStatsVisible) return hiddenProfileProjectionIsEmpty(profile);
  return profile.totalSnapBurnedMicros === 0n
    && profile.marksEarnedMicros === 0n
    && profile.marksSpentMicros === 0n
    && profile.marksBalanceMicros === 0n
    && profile.marksPolicyVersion === FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION;
}

function validExpectedFounderCount(value: bigint): boolean {
  return value >= 0n && value <= 100n;
}

/**
 * All-or-nothing conversion of the proven-zero predecessor accounts. New
 * daily-policy accounts created during the rollout are verified and preserved.
 */
export function backfillDailyMarks(
  ctx: WarpkeepReducerContext,
  expectedFounderCount: bigint,
): Readonly<{ migrated: number; preserved: number }> {
  if (
    !validExpectedFounderCount(expectedFounderCount)
    || ctx.db.allowedFid.count() !== expectedFounderCount
    || ctx.db.castle.count() !== expectedFounderCount
    || ctx.db.realmProfileV1.count() !== expectedFounderCount
    || ctx.db.markAccountV1.count() !== expectedFounderCount
    || ctx.db.dailyMarkGrantV1.count() !== 0n
    || ctx.db.dailyMarkScheduleV1.count() !== 0n
    || !legacyMarkTablesAreEmpty(ctx)
  ) fail('DAILY_MARK_BACKFILL_PRECONDITION');

  const updates: Array<Readonly<{
    fid: bigint;
    account: MarkAccountState;
    profile: DailyMarksProfileProjection;
  }>> = [];
  let preserved = 0;
  for (const admission of ctx.db.allowedFid.iter()) {
    if (!admissionIsStructurallyValid(admission)) fail('DAILY_MARK_ADMISSION_INVALID');
    const account = ctx.db.markAccountV1.fid.find(admission.fid);
    const profile = ctx.db.realmProfileV1.fid.find(admission.fid);
    if (
      account === null
      || profile === null
      || ctx.db.castle.ownerFid.find(admission.fid) === null
      || !dailyMarkRolloutAccountIsConsistent(account)
      || !dailyMarksPublicProjectionIsAuthorized(ctx, profile)
    ) fail('DAILY_MARK_BACKFILL_INVARIANT');
    if (admittedDailyMarkAccountIsConsistent(account)) {
      if (!admittedDailyMarksProjectionIsConsistent(profile, account)) {
        fail('DAILY_MARK_PROFILE_INVARIANT');
      }
      preserved += 1;
      continue;
    }
    if (
      !frozenLegacyZeroMarkAccountIsConsistent(account)
      || !frozenLegacyProfileProjectionIsConsistent(profile)
    ) fail('DAILY_MARK_BACKFILL_INVARIANT');
    const nextAccount = migrateFrozenLegacyZeroMarkAccount(account);
    updates.push(Object.freeze({
      fid: admission.fid,
      account: nextAccount,
      profile: projectAdmittedDailyMarks(profile.communityStatsVisible, nextAccount),
    }));
  }

  // No write occurs until the complete predecessor graph has been validated.
  for (const update of updates) {
    const account = ctx.db.markAccountV1.fid.find(update.fid);
    const profile = ctx.db.realmProfileV1.fid.find(update.fid);
    if (account === null || profile === null) fail('DAILY_MARK_BACKFILL_INVARIANT');
    ctx.db.markAccountV1.fid.update({
      ...account,
      ...update.account,
      updatedAt: ctx.timestamp,
    });
    ctx.db.realmProfileV1.fid.update({ ...profile, ...update.profile });
  }
  return Object.freeze({ migrated: updates.length, preserved });
}

/**
 * Exact-count activation. The current UTC day is credited before the one
 * recurring private schedule is installed in the same transaction.
 */
export function activateDailyMarks(
  ctx: WarpkeepReducerContext,
  expectedFounderCount: bigint,
  expectedEnabledCount: bigint,
): Readonly<{
  activated: boolean;
  credited: number;
  existing: number;
  utcDay: bigint;
}> {
  if (
    !validExpectedFounderCount(expectedFounderCount)
    || expectedEnabledCount < 0n
    || expectedEnabledCount > expectedFounderCount
    || ctx.db.allowedFid.count() !== expectedFounderCount
    || ctx.db.castle.count() !== expectedFounderCount
    || ctx.db.realmProfileV1.count() !== expectedFounderCount
    || ctx.db.markAccountV1.count() !== expectedFounderCount
    || !legacyMarkTablesAreEmpty(ctx)
  ) fail('DAILY_MARK_ACTIVATION_PRECONDITION');

  let enabledCount = 0n;
  for (const admission of ctx.db.allowedFid.iter()) {
    if (!admissionIsStructurallyValid(admission)) fail('DAILY_MARK_ADMISSION_INVALID');
    if (admission.enabled) enabledCount += 1n;
    const account = ctx.db.markAccountV1.fid.find(admission.fid);
    const profile = ctx.db.realmProfileV1.fid.find(admission.fid);
    if (
      account === null
      || profile === null
      || ctx.db.castle.ownerFid.find(admission.fid) === null
      || !admittedDailyMarkAccountIsConsistent(account)
      || !admittedDailyMarksProjectionIsConsistent(profile, account)
      || !dailyMarksPublicProjectionIsAuthorized(ctx, profile)
    ) fail('DAILY_MARK_ACTIVATION_INVARIANT');
  }
  if (enabledCount !== expectedEnabledCount) fail('DAILY_MARK_ACTIVATION_PRECONDITION');

  const existingSchedule = activeDailyMarkSchedule(ctx);
  if (existingSchedule === undefined && ctx.db.dailyMarkGrantV1.count() !== 0n) {
    fail('DAILY_MARK_ACTIVATION_INVARIANT');
  }
  const plan = planDailyMarkGrantBatch(
    ctx.timestamp.microsSinceUnixEpoch,
    contextBatchSource(ctx),
  );
  if (BigInt(plan.eligibleAdmissions) !== expectedEnabledCount) {
    fail('DAILY_MARK_ACTIVATION_PRECONDITION');
  }
  const result = applyContextBatch(ctx, plan);
  if (existingSchedule === undefined) {
    ctx.db.dailyMarkScheduleV1.insert({
      scheduleId: 0n,
      scheduledAt: ScheduleAt.interval(DAILY_MARK_SWEEP_INTERVAL_MICROS),
      policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
    });
    if (activeDailyMarkSchedule(ctx) === undefined) fail('DAILY_MARK_SCHEDULE_INVARIANT');
  }
  return Object.freeze({
    activated: existingSchedule === undefined,
    credited: result.credited,
    existing: result.existing,
    utcDay: plan.utcDay,
  });
}

export function dailyMarksErrorCode(error: unknown): string | undefined {
  if (
    error instanceof DailyMarksAuthorityError
    || error instanceof MarksAuthorityPolicyError
  ) return error.code;
  return undefined;
}
