export const SNAP_DECIMALS = 6;
export const MARK_DECIMALS = 6;
export const MICROS_PER_MARK = 1_000_000n;
export const MAX_U128 = 0xffff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;
export const MARK_ATTRIBUTION_POLICY_ID = 'snap-current-linked-wallet-1to1-v1';

export class MarksPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MarksPolicyError';
  }
}

export function snapMicrosToMarkMicros(snapMicros: bigint): bigint {
  if (snapMicros <= 0n) throw new MarksPolicyError('MARK_AMOUNT_NOT_POSITIVE');
  if (snapMicros > MAX_U128) throw new MarksPolicyError('MARK_AMOUNT_OUT_OF_RANGE');
  return snapMicros;
}

export function checkedMarkMicrosTotal(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) {
    if (value < 0n || value > MAX_U128 - total) {
      throw new MarksPolicyError('MARK_TOTAL_OUT_OF_RANGE');
    }
    total += value;
  }
  return total;
}

export function formatMarkMicros(markMicros: bigint): string {
  if (markMicros < 0n || markMicros > MAX_U128) {
    throw new MarksPolicyError('MARK_BALANCE_OUT_OF_RANGE');
  }
  const whole = markMicros / MICROS_PER_MARK;
  const fraction = markMicros % MICROS_PER_MARK;
  if (fraction === 0n) return whole.toString();
  return `${whole.toString()}.${fraction.toString().padStart(MARK_DECIMALS, '0').replace(/0+$/, '')}`;
}

export function markBalanceMicros(earnedMicros: bigint, spentMicros: bigint): bigint {
  if (
    earnedMicros < 0n
    || spentMicros < 0n
    || earnedMicros > MAX_U128
    || spentMicros > earnedMicros
  ) {
    throw new MarksPolicyError('MARK_BALANCE_INVARIANT');
  }
  return earnedMicros - spentMicros;
}
