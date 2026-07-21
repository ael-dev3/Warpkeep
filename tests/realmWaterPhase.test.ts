import { describe, expect, it } from 'vitest';

import {
  REALM_WATER_MAX_DRIFT_CORRECTION_SECONDS,
  resolveRealmWaterPhase
} from '../src/components/realm/realmWaterPhase';

describe('shared Water phase', () => {
  it('freezes reduced motion at a deterministic epoch/seed phase', () => {
    const first = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      localMonotonicSeconds: 0,
      reducedMotion: true,
      bodySeed: 44,
      wavePreset: 'ocean'
    });
    const second = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      localMonotonicSeconds: 999,
      reducedMotion: true,
      bodySeed: 44,
      wavePreset: 'ocean'
    });
    expect(second).toEqual(first);
    expect(first.source).toBe('deterministic-freeze');
  });

  it('converges two clients from the same persisted boundary', () => {
    const input = {
      environmentEpoch: 2n,
      environmentUpdatedAt: new Date('2026-07-21T00:00:00.000Z'),
      synchronizedServerTimeMicros: BigInt(Date.parse('2026-07-21T00:00:14.000Z')) * 1_000n,
      bodySeed: 91,
      wavePreset: 'broad-swell'
    } as const;
    const first = resolveRealmWaterPhase({ ...input, localMonotonicSeconds: 0 });
    const second = resolveRealmWaterPhase({ ...input, localMonotonicSeconds: 0.4 });
    expect(first.phaseSeconds).toBe(second.phaseSeconds);
    expect(Math.abs(first.driftSeconds)).toBeGreaterThan(REALM_WATER_MAX_DRIFT_CORRECTION_SECONDS);
    expect(first.source).toBe('server-estimate');
  });

  it('does not fast-forward when a tab resumes without synchronization', () => {
    const normal = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      environmentUpdatedAt: new Date('2026-07-21T00:00:00.000Z'),
      localMonotonicSeconds: 2
    });
    const resumed = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      environmentUpdatedAt: new Date('2026-07-21T00:00:00.000Z'),
      localMonotonicSeconds: 2.2
    });
    expect(resumed.phaseSeconds - normal.phaseSeconds).toBeCloseTo(0.2, 6);
  });

  it('eases a later large synchronization correction within the frame bound', () => {
    const target = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      environmentUpdatedAt: new Date('2026-07-21T00:00:00.000Z'),
      synchronizedServerTimeMicros: BigInt(Date.parse('2026-07-21T00:10:00.000Z')) * 1_000n,
      localMonotonicSeconds: 0
    });
    const corrected = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      environmentUpdatedAt: new Date('2026-07-21T00:00:00.000Z'),
      synchronizedServerTimeMicros: BigInt(Date.parse('2026-07-21T00:10:00.000Z')) * 1_000n,
      localMonotonicSeconds: 0.1,
      previousPhaseSeconds: 0
    });
    expect(target.source).toBe('server-estimate');
    expect(corrected.phaseSeconds).toBeCloseTo(REALM_WATER_MAX_DRIFT_CORRECTION_SECONDS, 6);
  });
});
