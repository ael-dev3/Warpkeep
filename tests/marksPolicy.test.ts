import { describe, expect, it } from 'vitest';

import {
  MARK_DAILY_GRANT_POLICY_ID,
  MAX_U128,
  MICROS_PER_MARK,
  checkedMarkMicrosTotal,
  formatMarkMicros,
  markBalanceMicros,
} from '../src/marks/marksPolicy';

describe('Marks fixed-point accounting', () => {
  it('uses one exact Mark per admitted-player daily grant', () => {
    expect(MICROS_PER_MARK).toBe(1_000_000n);
    expect(formatMarkMicros(MICROS_PER_MARK)).toBe('1');
    expect(formatMarkMicros(250_000n)).toBe('0.25');
    expect(formatMarkMicros(1_000_001n)).toBe('1.000001');
    expect(MARK_DAILY_GRANT_POLICY_ID).toBe('admitted-daily-mark-v1');
  });

  it('enforces nonnegative balance and bounded totals', () => {
    expect(markBalanceMicros(3_000_000n, 1_000_000n)).toBe(2_000_000n);
    expect(checkedMarkMicrosTotal([MAX_U128 - 1n, 1n])).toBe(MAX_U128);
    expect(() => markBalanceMicros(1n, 2n)).toThrow('MARK_BALANCE_INVARIANT');
    expect(() => checkedMarkMicrosTotal([MAX_U128, 1n]))
      .toThrow('MARK_TOTAL_OUT_OF_RANGE');
  });
});
