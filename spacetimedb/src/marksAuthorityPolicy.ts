/** One visible Mark is represented by one million integer micros. */
export const MARK_MICROS_PER_MARK = 1_000_000n;

/** Current server-owned Community Marks policy. */
export const ADMITTED_DAILY_MARK_POLICY_VERSION = 'admitted-daily-mark-v1';

/** Stable reducer-facing name for the current daily policy. */
export const DAILY_MARK_POLICY_VERSION = ADMITTED_DAILY_MARK_POLICY_VERSION;

/** Every eligible FID receives exactly this many micros per UTC day. */
export const ADMITTED_DAILY_MARK_GRANT_MICROS = MARK_MICROS_PER_MARK;

/** Stable reducer-facing name for the fixed daily credit. */
export const DAILY_MARK_GRANT_MICROS = ADMITTED_DAILY_MARK_GRANT_MICROS;

/** UTC is derived solely from the authoritative SpacetimeDB transaction clock. */
export const UTC_DAY_MICROS = 24n * 60n * 60n * 1_000_000n;

/**
 * Frozen predecessor identifier. It is accepted only for an all-zero account
 * while the additive daily-Marks backfill is incomplete. No credit path may
 * create or mutate an account under this policy.
 */
export const FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION =
  'snap-current-linked-wallet-1to1-v1';

export const MAX_U128 = (1n << 128n) - 1n;

/** Compatibility re-export; entry-agreement authority remains separately owned. */
export {
  WARPKEEP_ALPHA_TERMS_VERSION,
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
} from './entryAgreementPolicy';

export class MarksAuthorityPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MarksAuthorityPolicyError';
  }
}

export type MarkAccountState = Readonly<{
  /** Frozen deployed compatibility column; daily Marks always keep it zero. */
  totalSnapBurnedMicros: bigint;
  earnedMicros: bigint;
  spentMicros: bigint;
  balanceMicros: bigint;
  policyVersion: string;
}>;

function boundedU128(value: bigint): boolean {
  return value >= 0n && value <= MAX_U128;
}

/** The only legacy state accepted by the additive rollout boundary. */
export function frozenLegacyZeroMarkAccountIsConsistent(
  account: MarkAccountState,
): boolean {
  return account.policyVersion === FROZEN_LEGACY_ZERO_MARK_POLICY_VERSION
    && account.totalSnapBurnedMicros === 0n
    && account.earnedMicros === 0n
    && account.spentMicros === 0n
    && account.balanceMicros === 0n;
}

/** Current daily-account invariant. Spending is deliberately not active. */
export function admittedDailyMarkAccountIsConsistent(
  account: MarkAccountState,
): boolean {
  return account.policyVersion === ADMITTED_DAILY_MARK_POLICY_VERSION
    && account.totalSnapBurnedMicros === 0n
    && boundedU128(account.earnedMicros)
    && account.spentMicros === 0n
    && account.balanceMicros === account.earnedMicros;
}

/** Explicitly transitional predicate; activation must require the daily form. */
export function dailyMarkRolloutAccountIsConsistent(
  account: MarkAccountState,
): boolean {
  return admittedDailyMarkAccountIsConsistent(account)
    || frozenLegacyZeroMarkAccountIsConsistent(account);
}

/**
 * Stable publication/backfill predicate used by existing founding and resource
 * guards. Active-v14 checks must use `admittedDailyMarkAccountIsConsistent`.
 */
export const markAccountIsConsistent = dailyMarkRolloutAccountIsConsistent;

/** Deterministic zero-state conversion used by the all-or-nothing backfill. */
export function migrateFrozenLegacyZeroMarkAccount(
  account: MarkAccountState,
): MarkAccountState {
  if (admittedDailyMarkAccountIsConsistent(account)) return account;
  if (!frozenLegacyZeroMarkAccountIsConsistent(account)) {
    throw new MarksAuthorityPolicyError('MARK_ACCOUNT_BACKFILL_INVARIANT');
  }
  return Object.freeze({
    totalSnapBurnedMicros: 0n,
    earnedMicros: 0n,
    spentMicros: 0n,
    balanceMicros: 0n,
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
  });
}

/**
 * Apply one fixed daily grant. The legacy compatibility column never changes,
 * and every overflow check happens before a successor state is returned.
 */
export function applyAdmittedDailyMarkGrant(
  account: MarkAccountState,
): MarkAccountState {
  if (!admittedDailyMarkAccountIsConsistent(account)) {
    throw new MarksAuthorityPolicyError('MARK_ACCOUNT_INVARIANT');
  }
  if (
    ADMITTED_DAILY_MARK_GRANT_MICROS > MAX_U128 - account.earnedMicros
    || ADMITTED_DAILY_MARK_GRANT_MICROS > MAX_U128 - account.balanceMicros
  ) {
    throw new MarksAuthorityPolicyError('MARK_ACCOUNT_OVERFLOW');
  }
  return Object.freeze({
    totalSnapBurnedMicros: 0n,
    earnedMicros: account.earnedMicros + ADMITTED_DAILY_MARK_GRANT_MICROS,
    spentMicros: 0n,
    balanceMicros: account.balanceMicros + ADMITTED_DAILY_MARK_GRANT_MICROS,
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
  });
}

/** Convert a non-negative authoritative Unix timestamp into its UTC day. */
export function admittedDailyMarkUtcDay(nowMicros: bigint): bigint {
  if (nowMicros < 0n) {
    throw new MarksAuthorityPolicyError('MARK_SERVER_TIME_INVALID');
  }
  return nowMicros / UTC_DAY_MICROS;
}
