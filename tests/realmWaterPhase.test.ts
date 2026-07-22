import { describe, expect, it } from 'vitest';

import {
  REALM_WATER_MAX_DRIFT_CORRECTION_RATE,
  REALM_WATER_MAX_LOCAL_STEP_SECONDS,
  REALM_WATER_PHASE_PERIOD_SECONDS,
  resolveRealmWaterPhase
} from '../src/components/realm/realmWaterPhase';

describe('shared Water phase', () => {
  it('freezes reduced motion at one deterministic epoch and body phase', () => {
    const first = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      localMonotonicSeconds: 0,
      reducedMotion: true,
      bodySeed: 44,
      wavePreset: 'ocean'
    });
    const later = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      localMonotonicSeconds: 999,
      reducedMotion: true,
      bodySeed: 44,
      wavePreset: 'ocean'
    });

    expect(later.phaseSeconds).toBe(first.phaseSeconds);
    expect(later.source).toBe('deterministic-freeze');
  });

  it('gives clients the same wrapped phase from the same canonical boundary and clock sample', () => {
    const shared = {
      environmentEpoch: 2n,
      environmentUpdatedAtMicros: 1_000_000_000n,
      synchronizedServerTimeMicros: 1_014_000_000n,
      bodySeed: 91,
      wavePreset: 'broad-swell'
    } as const;
    const first = resolveRealmWaterPhase({ ...shared, localMonotonicSeconds: 0 });
    const second = resolveRealmWaterPhase({ ...shared, localMonotonicSeconds: 42 });

    expect(first.phaseSeconds).toBe(second.phaseSeconds);
    expect(first.source).toBe('server-estimate');
  });

  it('remains monotonic internally while wrapping the finite shader phase', () => {
    const previous = REALM_WATER_PHASE_PERIOD_SECONDS - 0.05;
    const phase = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      localMonotonicSeconds: 1.2,
      previousLocalMonotonicSeconds: 1,
      previousUnwrappedPhaseSeconds: previous
    });

    expect(phase.unwrappedPhaseSeconds).toBeGreaterThan(previous);
    expect(phase.phaseSeconds).toBeGreaterThanOrEqual(0);
    expect(phase.phaseSeconds).toBeLessThan(1);
  });

  it('bounds external-clock correction and never reverses on a backward sample', () => {
    const phase = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      environmentUpdatedAtMicros: 1_000_000_000n,
      synchronizedServerTimeMicros: 1_000_000_000n,
      localMonotonicSeconds: 10.1,
      previousLocalMonotonicSeconds: 10,
      previousUnwrappedPhaseSeconds: 80
    });

    expect(Math.abs(phase.correctionSeconds)).toBeLessThanOrEqual(
      0.1 * REALM_WATER_MAX_DRIFT_CORRECTION_RATE + Number.EPSILON
    );
    expect(phase.unwrappedPhaseSeconds).toBeGreaterThan(80);
  });

  it('clamps a resumed local clock instead of fast-forwarding a sleeping tab', () => {
    const phase = resolveRealmWaterPhase({
      environmentEpoch: 1n,
      localMonotonicSeconds: 5_000,
      previousLocalMonotonicSeconds: 1,
      previousUnwrappedPhaseSeconds: 20
    });

    expect(phase.unwrappedPhaseSeconds - 20).toBeLessThanOrEqual(
      REALM_WATER_MAX_LOCAL_STEP_SECONDS
    );
  });
});
