export type WarpkeepWaterAmbienceRegime = 'none' | 'river' | 'ocean';

/**
 * Presentation-only Water context. It deliberately carries no cell, player,
 * Realm, or identity key, so the local audio graph cannot become telemetry or
 * an alternate source of world authority.
 */
export type WarpkeepWaterAmbienceState = Readonly<{
  regime: WarpkeepWaterAmbienceRegime;
  relevance: number;
  character: number;
  selected: boolean;
}>;

export const WARPKEEP_WATER_AMBIENCE_OFF: WarpkeepWaterAmbienceState =
  Object.freeze({
    regime: 'none',
    relevance: 0,
    character: 0,
    selected: false
  });

function clampUnit(value: number) {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

export function normalizeWarpkeepWaterAmbience(
  state: WarpkeepWaterAmbienceState
): WarpkeepWaterAmbienceState {
  const relevance = clampUnit(state.relevance);
  if (
    state.regime !== 'river'
    && state.regime !== 'ocean'
  ) return WARPKEEP_WATER_AMBIENCE_OFF;
  if (relevance <= 0) return WARPKEEP_WATER_AMBIENCE_OFF;
  return Object.freeze({
    regime: state.regime,
    relevance,
    character: clampUnit(state.character),
    selected: state.selected === true
  });
}

function stateKey(state: WarpkeepWaterAmbienceState) {
  return [
    state.regime,
    state.relevance.toFixed(4),
    state.character.toFixed(4),
    Number(state.selected)
  ].join(':');
}

type WaterAmbienceListener = (state: WarpkeepWaterAmbienceState) => void;

const publisherStates = new Map<symbol, WarpkeepWaterAmbienceState>();
const listeners = new Set<WaterAmbienceListener>();
let resolvedState = WARPKEEP_WATER_AMBIENCE_OFF;
let resolvedStateKey = stateKey(resolvedState);

function resolvePublishedState() {
  let strongest = WARPKEEP_WATER_AMBIENCE_OFF;
  let strongestScore = 0;
  for (const state of publisherStates.values()) {
    const score = state.relevance + Number(state.selected) * 0.04
      + Number(state.regime === 'river') * 0.002;
    if (score <= strongestScore) continue;
    strongest = state;
    strongestScore = score;
  }
  const nextKey = stateKey(strongest);
  if (nextKey === resolvedStateKey) return;
  resolvedState = strongest;
  resolvedStateKey = nextKey;
  for (const listener of listeners) listener(resolvedState);
}

export type WarpkeepWaterAmbiencePublisher = Readonly<{
  publish: (state: WarpkeepWaterAmbienceState) => void;
  dispose: () => void;
}>;

/**
 * Multiple renderer generations can overlap briefly during context recovery.
 * An opaque publisher token prevents an old scene from silencing the newer
 * active scene when it finally disposes.
 */
export function createWarpkeepWaterAmbiencePublisher(): WarpkeepWaterAmbiencePublisher {
  const token = Symbol('warpkeep-water-ambience-publisher');
  let disposed = false;
  let lastKey = '';
  return Object.freeze({
    publish: (input) => {
      if (disposed) return;
      const state = normalizeWarpkeepWaterAmbience(input);
      const key = stateKey(state);
      if (key === lastKey) return;
      lastKey = key;
      if (state.regime === 'none') publisherStates.delete(token);
      else publisherStates.set(token, state);
      resolvePublishedState();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      publisherStates.delete(token);
      resolvePublishedState();
    }
  });
}

export function subscribeWarpkeepWaterAmbience(
  listener: WaterAmbienceListener
) {
  listeners.add(listener);
  listener(resolvedState);
  return () => listeners.delete(listener);
}
