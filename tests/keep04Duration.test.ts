import { describe, expect, it } from 'vitest';
import { formatKeep04Duration } from '../src/components/keep04/formatKeep04Duration';
import { estimatedTime04 } from '../src/components/keep04/Keep04WorkerPanel';

describe('formatKeep04Duration', () => {
  it('uses readable units while preserving exact sub-minute precision', () => {
    expect(formatKeep04Duration(0n)).toBe('0 s');
    expect(formatKeep04Duration(1_000_000n)).toBe('1 s');
    expect(formatKeep04Duration(1_900_000n)).toBe('1.9 s');
    expect(formatKeep04Duration(60_000_000n)).toBe('1 min');
    expect(formatKeep04Duration(114_000_000n)).toBe('1 min 54 s');
    expect(formatKeep04Duration(3_600_000_000n)).toBe('1 hr');
    expect(formatKeep04Duration(43_200_000_000n)).toBe('12 hr');
  });

  it('keeps worker estimates alive through a partial-second boundary', () => {
    const nowMs = 1_000;
    expect(estimatedTime04(2_001_001n, nowMs)).toBe('2 s');
    expect(estimatedTime04(2_000_000n, nowMs)).toBe('1 s');
    expect(estimatedTime04(1_000_000n, nowMs)).toBe('Awaiting Realm update');
    expect(estimatedTime04(1_000_000n, Number.NaN)).toBe('Awaiting Realm update');
  });
});
