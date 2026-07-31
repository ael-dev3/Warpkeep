import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMITTED_DAILY_MARK_GRANT_MICROS,
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION,
  MARK_MICROS_PER_MARK,
  MAX_U128,
  UTC_DAY_MICROS,
  admittedDailyMarkAccountIsConsistent,
  admittedDailyMarkUtcDay,
  applyAdmittedDailyMarkGrant,
  dailyMarkRolloutAccountIsConsistent,
  frozenLegacyZeroMarkAccountIsConsistent,
  migrateFrozenLegacyZeroMarkAccount,
} from '../src/marksAuthorityPolicy';

const dailyZero = Object.freeze({
  totalSnapBurnedMicros: 0n,
  earnedMicros: 0n,
  spentMicros: 0n,
  balanceMicros: 0n,
  policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
});

const legacyZero = Object.freeze({
  ...dailyZero,
  policyVersion: FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION,
});

test('one daily Mark is exactly one million integer micros', () => {
  assert.equal(MARK_MICROS_PER_MARK, 1_000_000n);
  assert.equal(ADMITTED_DAILY_MARK_GRANT_MICROS, MARK_MICROS_PER_MARK);
  assert.equal(ADMITTED_DAILY_MARK_POLICY_VERSION, 'admitted-daily-mark-v1');

  const credited = applyAdmittedDailyMarkGrant(dailyZero);
  assert.deepEqual(credited, {
    totalSnapBurnedMicros: 0n,
    earnedMicros: 1_000_000n,
    spentMicros: 0n,
    balanceMicros: 1_000_000n,
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
  });
  assert.equal(admittedDailyMarkAccountIsConsistent(credited), true);
});

test('UTC day boundaries use only whole authoritative Unix-day micros', () => {
  assert.equal(admittedDailyMarkUtcDay(0n), 0n);
  assert.equal(admittedDailyMarkUtcDay(UTC_DAY_MICROS - 1n), 0n);
  assert.equal(admittedDailyMarkUtcDay(UTC_DAY_MICROS), 1n);
  assert.equal(admittedDailyMarkUtcDay(UTC_DAY_MICROS * 20_000n + 1n), 20_000n);
  assert.throws(() => admittedDailyMarkUtcDay(-1n), /MARK_SERVER_TIME_INVALID/);
});

test('legacy compatibility accepts only an exact all-zero frozen account', () => {
  assert.equal(frozenLegacyZeroMarkAccountIsConsistent(legacyZero), true);
  assert.equal(dailyMarkRolloutAccountIsConsistent(legacyZero), true);
  assert.equal(admittedDailyMarkAccountIsConsistent(legacyZero), false);
  for (const mutation of [
    { totalSnapBurnedMicros: 1n },
    { earnedMicros: 1n },
    { spentMicros: 1n },
    { balanceMicros: 1n },
    { policyVersion: 'another-policy' },
  ]) {
    assert.equal(frozenLegacyZeroMarkAccountIsConsistent({ ...legacyZero, ...mutation }), false);
  }
  assert.deepEqual(migrateFrozenLegacyZeroMarkAccount(legacyZero), dailyZero);
  assert.equal(migrateFrozenLegacyZeroMarkAccount(dailyZero), dailyZero);
  assert.throws(
    () => migrateFrozenLegacyZeroMarkAccount({ ...legacyZero, earnedMicros: 1n }),
    /MARK_ACCOUNT_BACKFILL_INVARIANT/,
  );
});

test('daily accounts freeze legacy and spending fields and fail closed at u128 overflow', () => {
  assert.equal(admittedDailyMarkAccountIsConsistent({
    ...dailyZero,
    earnedMicros: 10n,
    balanceMicros: 10n,
  }), true);
  assert.equal(admittedDailyMarkAccountIsConsistent({
    ...dailyZero,
    totalSnapBurnedMicros: 1n,
  }), false);
  assert.equal(admittedDailyMarkAccountIsConsistent({
    ...dailyZero,
    spentMicros: 1n,
  }), false);
  assert.equal(admittedDailyMarkAccountIsConsistent({
    ...dailyZero,
    earnedMicros: 2n,
    balanceMicros: 1n,
  }), false);
  assert.throws(
    () => applyAdmittedDailyMarkGrant({
      ...dailyZero,
      earnedMicros: MAX_U128,
      balanceMicros: MAX_U128,
    }),
    /MARK_ACCOUNT_OVERFLOW/,
  );
  assert.throws(() => applyAdmittedDailyMarkGrant(legacyZero), /MARK_ACCOUNT_INVARIANT/);
});
