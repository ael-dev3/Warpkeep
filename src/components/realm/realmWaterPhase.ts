import { mixUint32 } from '../../../spacetimedb/src/world';

/** Inputs for the renderer-only shared Water phase clock. */
export type RealmWaterPhaseInput = Readonly<{
  environmentEpoch: bigint;
  /** The persisted server timestamp at the environment boundary. */
  environmentUpdatedAt?: unknown;
  /** A synchronized server-time estimate, when the host has one. */
  synchronizedServerTimeMicros?: bigint | number;
  /** Previous emitted phase, used to ease a large synchronization correction. */
  previousPhaseSeconds?: number;
  /** Monotonic seconds elapsed since the current scene became visible. */
  localMonotonicSeconds: number;
  reducedMotion?: boolean;
  bodySeed?: number;
  wavePreset?: string;
}>;

export type RealmWaterPhase = Readonly<{
  phaseSeconds: number;
  phaseCycles: number;
  source: 'server-boundary' | 'server-estimate' | 'deterministic-freeze';
  driftSeconds: number;
}>;

const MICROS_PER_SECOND = 1_000_000n;
const PHASE_PERIOD_SECONDS = 97;
const MAX_DRIFT_CORRECTION_SECONDS = 0.18;

function finiteSeconds(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function timestampMicros(value: unknown): bigint | undefined {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.trunc(value * 1_000));
  }
  if (value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() >= 0) {
    return BigInt(value.getTime()) * 1_000n;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 0) return BigInt(parsed) * 1_000n;
  }
  if (value !== null && typeof value === 'object') {
    const candidate = value as Readonly<{ microsSinceUnixEpoch?: unknown; toMillis?: () => unknown }>;
    if (typeof candidate.microsSinceUnixEpoch === 'bigint') return timestampMicros(candidate.microsSinceUnixEpoch);
    if (typeof candidate.toMillis === 'function') {
      try {
        return timestampMicros(candidate.toMillis());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function phaseSeed(epoch: bigint, bodySeed: number, wavePreset: string) {
  const epochLow = Number(epoch & 0xffffffffn) >>> 0;
  let presetHash = 2166136261;
  for (let index = 0; index < wavePreset.length; index += 1) {
    presetHash ^= wavePreset.charCodeAt(index);
    presetHash = Math.imul(presetHash, 16777619);
  }
  return mixUint32(epochLow ^ (bodySeed >>> 0) ^ presetHash) / 0xffffffff;
}

/**
 * Resolve one deterministic Water phase. The server boundary is the anchor;
 * monotonic time only advances between synchronizations. A caller can provide
 * a synchronized server estimate to converge reconnecting clients without
 * making Date.now() an authority input.
 */
export function resolveRealmWaterPhase(input: RealmWaterPhaseInput): RealmWaterPhase {
  const seed = phaseSeed(input.environmentEpoch, input.bodySeed ?? 0, input.wavePreset ?? 'ocean');
  const seedSeconds = seed * PHASE_PERIOD_SECONDS;
  if (input.reducedMotion) {
    return Object.freeze({
      phaseSeconds: seedSeconds,
      phaseCycles: seedSeconds / PHASE_PERIOD_SECONDS,
      source: 'deterministic-freeze',
      driftSeconds: 0
    });
  }

  const localSeconds = finiteSeconds(input.localMonotonicSeconds);
  const boundaryMicros = timestampMicros(input.environmentUpdatedAt);
  const synchronizedMicros = typeof input.synchronizedServerTimeMicros === 'bigint'
    ? input.synchronizedServerTimeMicros
    : typeof input.synchronizedServerTimeMicros === 'number'
      && Number.isFinite(input.synchronizedServerTimeMicros)
      ? BigInt(Math.max(0, Math.trunc(input.synchronizedServerTimeMicros)))
      : undefined;

  if (boundaryMicros !== undefined && synchronizedMicros !== undefined) {
    const deltaMicros = synchronizedMicros >= boundaryMicros
      ? synchronizedMicros - boundaryMicros
      : 0n;
    const serverSeconds = Number(deltaMicros / 1_000n) / 1_000;
    const desired = seedSeconds + serverSeconds;
    const local = seedSeconds + localSeconds;
    const previous = Number.isFinite(input.previousPhaseSeconds)
      ? input.previousPhaseSeconds!
      : undefined;
    const drift = desired - (previous ?? local);
    // A first synchronized sample snaps to the shared target so reconnecting
    // clients agree. Once a phase has been emitted, large corrections ease by
    // a small bounded amount each sample instead of popping the surface.
    const corrected = previous === undefined
      ? desired
      : previous + Math.max(-MAX_DRIFT_CORRECTION_SECONDS, Math.min(MAX_DRIFT_CORRECTION_SECONDS, drift));
    return Object.freeze({
      phaseSeconds: corrected,
      phaseCycles: corrected / PHASE_PERIOD_SECONDS,
      source: 'server-estimate',
      driftSeconds: drift
    });
  }

  return Object.freeze({
    phaseSeconds: seedSeconds + localSeconds,
    phaseCycles: (seedSeconds + localSeconds) / PHASE_PERIOD_SECONDS,
    source: boundaryMicros === undefined ? 'deterministic-freeze' : 'server-boundary',
    driftSeconds: 0
  });
}

export const REALM_WATER_PHASE_PERIOD_SECONDS = PHASE_PERIOD_SECONDS;
export const REALM_WATER_MAX_DRIFT_CORRECTION_SECONDS = MAX_DRIFT_CORRECTION_SECONDS;
export const REALM_WATER_MICROS_PER_SECOND = MICROS_PER_SECOND;
