import { mixUint32 } from '../../../spacetimedb/src/world';

export type RealmWaterPhaseInput = Readonly<{
  environmentEpoch: bigint;
  /** Canonical scalar emitted by `validateCanonicalGenesisSnapshot`. */
  environmentUpdatedAtMicros?: bigint;
  /** A host clock sample; correction from it is presentation-only and bounded. */
  synchronizedServerTimeMicros?: bigint;
  localMonotonicSeconds: number;
  previousLocalMonotonicSeconds?: number;
  previousUnwrappedPhaseSeconds?: number;
  reducedMotion?: boolean;
  bodySeed?: number;
  wavePreset?: string;
}>;

export type RealmWaterPhase = Readonly<{
  /** Shader-facing phase, always wrapped into one short finite period. */
  phaseSeconds: number;
  /** Internal continuity lane; never moves backward between valid samples. */
  unwrappedPhaseSeconds: number;
  localMonotonicSeconds: number;
  source: 'server-estimate' | 'server-boundary' | 'local-monotonic' | 'deterministic-freeze';
  driftSeconds: number;
  correctionSeconds: number;
}>;

const PHASE_PERIOD_SECONDS = 97;
const PHASE_PERIOD_MICROS = 97_000_000n;
const MAX_DRIFT_CORRECTION_RATE = 0.18;
const MAX_LOCAL_STEP_SECONDS = 0.25;

function finiteNonNegative(value: number | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function wrapPhase(value: number) {
  if (!Number.isFinite(value)) return 0;
  return ((value % PHASE_PERIOD_SECONDS) + PHASE_PERIOD_SECONDS) % PHASE_PERIOD_SECONDS;
}

function shortestWrappedDelta(target: number, current: number) {
  const half = PHASE_PERIOD_SECONDS * 0.5;
  return ((target - current + half) % PHASE_PERIOD_SECONDS + PHASE_PERIOD_SECONDS)
    % PHASE_PERIOD_SECONDS - half;
}

function phaseSeed(epoch: bigint, bodySeed: number, wavePreset: string) {
  const epochLow = Number(epoch & 0xffff_ffffn) >>> 0;
  let presetHash = 2_166_136_261;
  for (let index = 0; index < wavePreset.length; index += 1) {
    presetHash ^= wavePreset.charCodeAt(index);
    presetHash = Math.imul(presetHash, 16_777_619);
  }
  return (mixUint32(epochLow ^ (bodySeed >>> 0) ^ presetHash) / 0x1_0000_0000)
    * PHASE_PERIOD_SECONDS;
}

function sharedTargetPhase(
  seedSeconds: number,
  boundaryMicros: bigint | undefined,
  nowMicros: bigint | undefined
) {
  if (
    boundaryMicros === undefined
    || nowMicros === undefined
    || boundaryMicros < 0n
    || nowMicros < 0n
  ) return undefined;
  const elapsed = nowMicros > boundaryMicros ? nowMicros - boundaryMicros : 0n;
  const elapsedWithinPeriod = elapsed % PHASE_PERIOD_MICROS;
  return wrapPhase(seedSeconds + Number(elapsedWithinPeriod) / 1_000_000);
}

/**
 * Resolve one shared Water clock sample. Wall/server time can align clients,
 * but it never drives a backward or unbounded jump: local monotonic time owns
 * continuity and clock drift is eased at a fixed fraction of each local step.
 */
export function resolveRealmWaterPhase(input: RealmWaterPhaseInput): RealmWaterPhase {
  const epoch = input.environmentEpoch >= 0n ? input.environmentEpoch : 0n;
  const seedSeconds = phaseSeed(
    epoch,
    typeof input.bodySeed === 'number' && Number.isFinite(input.bodySeed)
      ? Math.trunc(input.bodySeed)
      : 0,
    typeof input.wavePreset === 'string' ? input.wavePreset : 'genesis-water'
  );
  const localMonotonicSeconds = finiteNonNegative(input.localMonotonicSeconds);
  if (input.reducedMotion) {
    return Object.freeze({
      phaseSeconds: seedSeconds,
      unwrappedPhaseSeconds: seedSeconds,
      localMonotonicSeconds,
      source: 'deterministic-freeze',
      driftSeconds: 0,
      correctionSeconds: 0
    });
  }

  const target = sharedTargetPhase(
    seedSeconds,
    input.environmentUpdatedAtMicros,
    input.synchronizedServerTimeMicros
  );
  const previousPhase = typeof input.previousUnwrappedPhaseSeconds === 'number'
    && Number.isFinite(input.previousUnwrappedPhaseSeconds)
    && input.previousUnwrappedPhaseSeconds >= 0
    ? input.previousUnwrappedPhaseSeconds
    : undefined;
  if (previousPhase === undefined) {
    const first = target ?? seedSeconds;
    return Object.freeze({
      phaseSeconds: wrapPhase(first),
      unwrappedPhaseSeconds: first,
      localMonotonicSeconds,
      source: target === undefined
        ? input.environmentUpdatedAtMicros === undefined
          ? 'local-monotonic'
          : 'server-boundary'
        : 'server-estimate',
      driftSeconds: 0,
      correctionSeconds: 0
    });
  }

  const previousLocal = finiteNonNegative(
    input.previousLocalMonotonicSeconds,
    localMonotonicSeconds
  );
  const localStep = Math.min(
    MAX_LOCAL_STEP_SECONDS,
    Math.max(0, localMonotonicSeconds - previousLocal)
  );
  const predicted = previousPhase + localStep;
  const driftSeconds = target === undefined
    ? 0
    : shortestWrappedDelta(target, wrapPhase(predicted));
  const maximumCorrection = localStep * MAX_DRIFT_CORRECTION_RATE;
  const correctionSeconds = Math.max(
    -maximumCorrection,
    Math.min(maximumCorrection, driftSeconds)
  );
  // Since the correction rate is strictly below one, a valid sample cannot
  // reverse the clock even when the external estimate moves backward.
  const unwrappedPhaseSeconds = Math.max(previousPhase, predicted + correctionSeconds);
  return Object.freeze({
    phaseSeconds: wrapPhase(unwrappedPhaseSeconds),
    unwrappedPhaseSeconds,
    localMonotonicSeconds,
    source: target === undefined
      ? input.environmentUpdatedAtMicros === undefined
        ? 'local-monotonic'
        : 'server-boundary'
      : 'server-estimate',
    driftSeconds,
    correctionSeconds
  });
}

export const REALM_WATER_PHASE_PERIOD_SECONDS = PHASE_PERIOD_SECONDS;
export const REALM_WATER_MAX_DRIFT_CORRECTION_RATE = MAX_DRIFT_CORRECTION_RATE;
export const REALM_WATER_MAX_LOCAL_STEP_SECONDS = MAX_LOCAL_STEP_SECONDS;
