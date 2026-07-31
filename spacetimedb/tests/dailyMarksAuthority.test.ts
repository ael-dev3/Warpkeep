import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDailyMarkGrantBatch,
  dailyMarkGrantKey,
  planDailyMarkGrantBatch,
  projectAdmittedDailyMarks,
  type DailyMarkAccountRecord,
  type DailyMarkAdmissionState,
  type DailyMarkGrantRecord,
  type DailyMarksProfileProjection,
} from '../src/dailyMarksAuthority';
import {
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  MAX_U128,
  UTC_DAY_MICROS,
} from '../src/marksAuthorityPolicy';

function account(fid: bigint, balanceMicros = 0n): DailyMarkAccountRecord {
  return Object.freeze({
    fid,
    totalSnapBurnedMicros: 0n,
    earnedMicros: balanceMicros,
    spentMicros: 0n,
    balanceMicros,
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
  });
}

function profile(
  source: DailyMarkAccountRecord,
  communityStatsVisible = true,
): DailyMarksProfileProjection {
  return projectAdmittedDailyMarks(communityStatsVisible, source);
}

function fixture(input?: Readonly<{
  admissions?: readonly DailyMarkAdmissionState[];
  accounts?: readonly DailyMarkAccountRecord[];
  grants?: readonly DailyMarkGrantRecord[];
  visible?: boolean;
  projectionAuthorized?: boolean;
}>) {
  const admissions = input?.admissions ?? [
    { fid: 1n, enabled: true, authEpoch: 1 },
    { fid: 2n, enabled: false, authEpoch: 4 },
  ];
  const accounts = new Map(
    (input?.accounts ?? [account(1n), account(2n)]).map(row => [row.fid, row]),
  );
  const grants = new Map((input?.grants ?? []).map(row => [row.grantKey, row]));
  const profiles = new Map(
    [...accounts.values()].map(row => [row.fid, profile(row, input?.visible ?? true)]),
  );
  return {
    admissions,
    accounts,
    grants,
    profiles,
    source: {
      admissions,
      findAccount: (fid: bigint) => accounts.get(fid) ?? null,
      findGrant: (key: string) => grants.get(key) ?? null,
      grantsForFid: (fid: bigint) => [...grants.values()].filter(grant => grant.fid === fid),
      findProfile: (fid: bigint) => profiles.get(fid) ?? null,
      publicProjectionAuthorized: () => input?.projectionAuthorized ?? true,
    },
  };
}

function applyPlan(target: ReturnType<typeof fixture>, plan: ReturnType<typeof planDailyMarkGrantBatch>) {
  const calls: string[] = [];
  const result = applyDailyMarkGrantBatch(plan, {
    updateAccount: update => {
      calls.push(`account:${update.fid}`);
      target.accounts.set(update.fid, update);
    },
    insertGrant: grant => {
      calls.push(`grant:${grant.fid}`);
      target.grants.set(grant.grantKey, grant);
    },
    updateProfile: update => {
      calls.push(`profile:${update.fid}`);
      target.profiles.set(update.fid, update);
    },
  });
  return { calls, result };
}

test('enabled admission receives one Mark while disabled admission remains untouched', () => {
  const state = fixture();
  const plan = planDailyMarkGrantBatch(UTC_DAY_MICROS * 100n, state.source);
  assert.equal(plan.utcDay, 100n);
  assert.equal(plan.eligibleAdmissions, 1);
  assert.equal(plan.credits.length, 1);
  assert.equal(plan.credits[0]?.grant.grantKey, '1:100');

  const applied = applyPlan(state, plan);
  assert.deepEqual(applied.result, { credited: 1, existing: 0, eligible: 1 });
  assert.deepEqual(applied.calls, ['account:1', 'grant:1', 'profile:1']);
  assert.equal(state.accounts.get(1n)?.balanceMicros, 1_000_000n);
  assert.equal(state.accounts.get(2n)?.balanceMicros, 0n);
  assert.equal(state.profiles.get(1n)?.totalSnapBurnedMicros, undefined);
  assert.equal(state.profiles.get(1n)?.marksBalanceMicros, 1_000_000n);
});

test('same UTC-day retry is inert and the next UTC day credits exactly once', () => {
  const state = fixture();
  applyPlan(state, planDailyMarkGrantBatch(UTC_DAY_MICROS * 7n, state.source));

  const retry = planDailyMarkGrantBatch(UTC_DAY_MICROS * 8n - 1n, state.source);
  assert.equal(retry.utcDay, 7n);
  assert.equal(retry.existingGrants, 1);
  assert.equal(retry.credits.length, 0);
  assert.deepEqual(applyPlan(state, retry).calls, []);
  assert.equal(state.accounts.get(1n)?.balanceMicros, 1_000_000n);

  applyPlan(state, planDailyMarkGrantBatch(UTC_DAY_MICROS * 8n, state.source));
  assert.equal(state.accounts.get(1n)?.balanceMicros, 2_000_000n);
  assert.equal(state.grants.size, 2);
});

test('revocation pauses grants and re-enable resumes without duplicate credit', () => {
  const admission = { fid: 1n, enabled: true, authEpoch: 1 };
  const state = fixture({ admissions: [admission] });
  applyPlan(state, planDailyMarkGrantBatch(UTC_DAY_MICROS * 7n, state.source));

  admission.enabled = false;
  const revoked = planDailyMarkGrantBatch(UTC_DAY_MICROS * 8n, state.source);
  assert.equal(revoked.eligibleAdmissions, 0);
  assert.equal(revoked.credits.length, 0);
  assert.deepEqual(applyPlan(state, revoked).calls, []);

  admission.enabled = true;
  const reEnabled = planDailyMarkGrantBatch(UTC_DAY_MICROS * 8n, state.source);
  assert.equal(reEnabled.eligibleAdmissions, 1);
  assert.equal(reEnabled.credits.length, 1);
  applyPlan(state, reEnabled);

  const retry = planDailyMarkGrantBatch(UTC_DAY_MICROS * 9n - 1n, state.source);
  assert.equal(retry.existingGrants, 1);
  assert.equal(retry.credits.length, 0);
  assert.equal(state.accounts.get(1n)?.balanceMicros, 2_000_000n);
  assert.equal(state.grants.has(dailyMarkGrantKey(1n, 7n)), true);
  assert.equal(state.grants.has(dailyMarkGrantKey(1n, 8n)), true);
});

test('a conflicting receipt fails closed instead of becoming an idempotent retry', () => {
  const day = 30n;
  const key = dailyMarkGrantKey(1n, day);
  const state = fixture({
    grants: [{
      grantKey: key,
      fid: 1n,
      utcDay: day,
      amountMicros: 2_000_000n,
      policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
    }],
  });
  assert.throws(
    () => planDailyMarkGrantBatch(UTC_DAY_MICROS * day, state.source),
    /DAILY_MARK_GRANT_CONFLICT/,
  );
  assert.equal(state.accounts.get(1n)?.balanceMicros, 0n);
  assert.equal(state.grants.size, 1);
});

test('hidden projections stay private when their account is credited', () => {
  const state = fixture({ visible: false, projectionAuthorized: false });
  const plan = planDailyMarkGrantBatch(UTC_DAY_MICROS, state.source);
  applyPlan(state, plan);
  const projected = state.profiles.get(1n);
  assert.equal(projected?.communityStatsVisible, false);
  assert.equal(projected?.totalSnapBurnedMicros, undefined);
  assert.equal(projected?.marksEarnedMicros, undefined);
  assert.equal(projected?.marksSpentMicros, undefined);
  assert.equal(projected?.marksBalanceMicros, undefined);
  assert.equal(projected?.marksPolicyVersion, undefined);
});

test('a visible projection without retained agreement authority fails before writes', () => {
  const state = fixture({ visible: true, projectionAuthorized: false });
  assert.throws(
    () => planDailyMarkGrantBatch(UTC_DAY_MICROS, state.source),
    /DAILY_MARK_PROFILE_INVARIANT/,
  );
  assert.equal(state.accounts.get(1n)?.balanceMicros, 0n);
  assert.equal(state.grants.size, 0);
});

test('receipt ledger and account totals must reconcile before writes', () => {
  const state = fixture({ accounts: [account(1n, 1_000_000n), account(2n)] });
  assert.throws(
    () => planDailyMarkGrantBatch(UTC_DAY_MICROS * 12n, state.source),
    /DAILY_MARK_ACCOUNT_RECONCILIATION/,
  );
  assert.equal(state.grants.size, 0);
});

test('overflow in any enabled account aborts full-batch planning before writers run', () => {
  const nearMaximum = MAX_U128 - 500_000n;
  const state = fixture({
    admissions: [
      { fid: 1n, enabled: true, authEpoch: 1 },
      { fid: 2n, enabled: true, authEpoch: 2 },
    ],
    accounts: [account(1n), account(2n, nearMaximum)],
  });
  const calls: string[] = [];
  assert.throws(
    () => planDailyMarkGrantBatch(UTC_DAY_MICROS * 3n, state.source),
    /MARK_ACCOUNT_OVERFLOW/,
  );
  assert.deepEqual(calls, []);
  assert.equal(state.accounts.get(1n)?.balanceMicros, 0n);
  assert.equal(state.accounts.get(2n)?.balanceMicros, nearMaximum);
  assert.equal(state.grants.size, 0);

  // No plan exists to pass to these writers: planning is the all-or-nothing
  // validation boundary rather than a per-account streaming mutation.
  assert.deepEqual(calls, []);
});

test('duplicate, malformed, or enabled-without-state admissions fail closed', () => {
  const duplicate = fixture({
    admissions: [
      { fid: 1n, enabled: true, authEpoch: 1 },
      { fid: 1n, enabled: true, authEpoch: 1 },
    ],
  });
  assert.throws(
    () => planDailyMarkGrantBatch(0n, duplicate.source),
    /DAILY_MARK_ADMISSION_DUPLICATE/,
  );

  const invalidEpoch = fixture({
    admissions: [{ fid: 1n, enabled: true, authEpoch: 0 }],
  });
  assert.throws(
    () => planDailyMarkGrantBatch(0n, invalidEpoch.source),
    /DAILY_MARK_ADMISSION_INVALID/,
  );

  const missing = fixture({
    admissions: [{ fid: 3n, enabled: true, authEpoch: 1 }],
    accounts: [],
  });
  assert.throws(
    () => planDailyMarkGrantBatch(0n, missing.source),
    /MARK_ACCOUNT_INVARIANT/,
  );
});
