import {
  hexDisc,
  hexDistance,
  hexKey,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import { terrainCellByCoord } from '../../game/map/generateTerrainMap';
import type { RealmTerrainMap, TerrainCell } from '../../game/map/terrainTypes';

export type RealmGrassCameraMode = 'realm' | 'approach' | 'keep';

export type RealmGrassActiveWindowPlan = Readonly<{
  activeRadius: number;
  hysteresisRadius: number;
  edgeFadeCells: number;
  cacheLimit: number;
}>;

/** Quality-owned hard ceiling for the complete decorative grass layer. */
export type RealmGrassRenderPlan = Readonly<{
  enabled: boolean;
  geometryProfile: 'high' | 'balanced' | 'reduced';
  /** Full segmented patches live inside this camera-local radius. */
  nearRadius: number;
  /** Width of the stable stochastic near/mid topology handoff. */
  lodTransitionCells: number;
  /** Stable unsigned-rank subset retained by the lower-detail mid field. */
  midDensityMultiplier: number;
  maximumNearInstances: number;
  maximumMidInstances: number;
  maximumNearTriangles: number;
  maximumMidTriangles: number;
  maximumNearDrawCalls: number;
  maximumMidDrawCalls: number;
  maximumActiveInstances: number;
  maximumActiveTriangles: number;
  maximumActiveDrawCalls: number;
  activeRadius: number;
  hysteresisRadius: number;
  edgeFadeCells: number;
  animationFrameCap: number;
  cacheLimit: number;
  densityMultiplier: number;
  windStrengthMultiplier: number;
  overviewSuppressed: true;
}>;

export type RealmGrassLodWeights = Readonly<{
  nearCoverage: number;
  midCoverage: number;
}>;

export type RealmGrassActiveCell = Readonly<{
  cell: TerrainCell;
  edgeFade: number;
}>;

export type RealmGrassActiveWindow = Readonly<{
  mode: RealmGrassCameraMode;
  anchor: HexCoord | null;
  cells: readonly RealmGrassActiveCell[];
  overviewHidden: boolean;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeInteger(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function smoothstep(minimum: number, maximum: number, value: number) {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

/**
 * Resolve the deterministic blend weights used to drive the exclusive
 * near/mid topology handoff for one canonical root.
 */
export function resolveRealmGrassLodWeights(
  plan: Pick<RealmGrassRenderPlan, 'activeRadius' | 'nearRadius' | 'lodTransitionCells'>,
  distanceInput: number,
  edgeFadeInput = 1
): RealmGrassLodWeights {
  const activeRadius = Math.max(0, Number.isFinite(plan.activeRadius) ? plan.activeRadius : 0);
  const nearRadius = clamp(
    Number.isFinite(plan.nearRadius) ? plan.nearRadius : activeRadius,
    0,
    activeRadius
  );
  const transitionCells = Math.max(
    0.5,
    Number.isFinite(plan.lodTransitionCells) ? plan.lodTransitionCells : 1
  );
  const transitionStart = Math.max(0, nearRadius - transitionCells * 0.5);
  const transitionEnd = Math.min(activeRadius, nearRadius + transitionCells * 0.5);
  const distance = Math.max(0, Number.isFinite(distanceInput) ? distanceInput : activeRadius);
  const edgeFade = clamp(Number.isFinite(edgeFadeInput) ? edgeFadeInput : 0, 0, 1);
  const midMix = smoothstep(transitionStart, transitionEnd, distance);
  return Object.freeze({
    nearCoverage: edgeFade * (1 - midMix),
    midCoverage: edgeFade * midMix
  });
}

/**
 * Scramble the canonical point rank into an independent, stable LOD handoff
 * stream. Reusing the rank directly would correlate the handoff with the
 * lower-density mid subset, causing most retained roots to switch together.
 */
export function realmGrassLodHandoffUnit(rankInput: number) {
  let value = (Number.isFinite(rankInput) ? Math.trunc(rankInput) : 0xffffffff) >>> 0;
  value = (value ^ 0xa511e9b3) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x1_0000_0000;
}

/**
 * Resolve an exclusive topology assignment for one canonical grass root.
 *
 * A shared root must never feed ordinary alpha coverage to both the near and
 * mid meshes: alpha hash and alpha-to-coverage use monotonic masks, so two
 * half-covered copies overlap rather than form complementary halves. Instead,
 * a stable root rank selects exactly one topology as the transition advances.
 * Roots rejected from the sparse mid subset retain the ordinary near fade so
 * the field can thin without inventing a mid representation.
 */
export function resolveRealmGrassExclusiveLodWeights(
  plan: Pick<RealmGrassRenderPlan, 'activeRadius' | 'nearRadius' | 'lodTransitionCells'>,
  distanceInput: number,
  edgeFadeInput: number,
  midAccepted: boolean,
  handoffRankInput: number
): RealmGrassLodWeights {
  const blended = resolveRealmGrassLodWeights(plan, distanceInput, edgeFadeInput);
  if (!midAccepted) {
    return Object.freeze({
      nearCoverage: blended.nearCoverage,
      midCoverage: 0
    });
  }
  const totalCoverage = blended.nearCoverage + blended.midCoverage;
  if (totalCoverage <= 0) {
    return Object.freeze({ nearCoverage: 0, midCoverage: 0 });
  }
  const midMix = clamp(blended.midCoverage / totalCoverage, 0, 1);
  const useMid = midMix >= 1
    || (midMix > 0 && realmGrassLodHandoffUnit(handoffRankInput) < midMix);
  return Object.freeze({
    nearCoverage: useMid ? 0 : totalCoverage,
    midCoverage: useMid ? totalCoverage : 0
  });
}

/** Stable nested subset: lowering the multiplier can only remove roots. */
export function isRealmGrassMidRankAccepted(rankInput: number, multiplierInput: number) {
  const multiplier = clamp(
    Number.isFinite(multiplierInput) ? multiplierInput : 0,
    0,
    1
  );
  if (multiplier <= 0) return false;
  if (multiplier >= 1) return true;
  const rank = Number.isFinite(rankInput) ? Math.trunc(rankInput) >>> 0 : 0xffffffff;
  return rank / 0x1_0000_0000 < multiplier;
}

/**
 * Select only the camera-local axial disc. This intentionally uses point
 * lookups into the existing terrain map rather than filtering the complete
 * 10,981-cell render map on every camera motion.
 */
export function resolveRealmGrassActiveWindow(
  map: RealmTerrainMap,
  focus: HexWorldPosition,
  mode: RealmGrassCameraMode,
  plan: RealmGrassActiveWindowPlan,
  hexSize = 1
): RealmGrassActiveWindow {
  if (mode === 'realm') {
    return Object.freeze({
      mode,
      anchor: null,
      cells: Object.freeze([]),
      overviewHidden: true
    });
  }
  const activeRadius = safeInteger(plan.activeRadius, 0);
  const fadeCells = Math.max(0.5, Number.isFinite(plan.edgeFadeCells) ? plan.edgeFadeCells : 1.5);
  const anchor = worldToNearestAxial(focus, hexSize);
  const cells = hexDisc(anchor, activeRadius)
    .map((coord) => {
      const cell = terrainCellByCoord(map, coord);
      if (!cell) return undefined;
      const distance = hexDistance(anchor, coord);
      const edgeFade = clamp((activeRadius - distance) / fadeCells, 0, 1);
      return Object.freeze({ cell, edgeFade });
    })
    .filter((entry): entry is RealmGrassActiveCell => entry !== undefined);
  return Object.freeze({
    mode,
    anchor: Object.freeze({ q: anchor.q, r: anchor.r }),
    cells: Object.freeze(cells),
    overviewHidden: false
  });
}

export function shouldRepackRealmGrassWindow(
  previous: RealmGrassActiveWindow | null,
  next: RealmGrassActiveWindow,
  plan: Pick<RealmGrassActiveWindowPlan, 'hysteresisRadius'>
) {
  if (!previous) return true;
  if (previous.mode !== next.mode) return true;
  if (!previous.anchor || !next.anchor) return previous.anchor !== next.anchor;
  const threshold = Math.max(1, safeInteger(plan.hysteresisRadius, 1));
  return hexDistance(previous.anchor, next.anchor) >= threshold;
}

/** A tiny LRU for immutable per-cell generation results, bounded by quality. */
export function createRealmGrassCellCache<T>(limitInput: number) {
  const limit = safeInteger(limitInput, 0);
  const entries = new Map<string, T>();
  let disposed = false;
  return Object.freeze({
    get(key: string) {
      if (disposed) return undefined;
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key: string, value: T) {
      if (disposed || limit === 0) return;
      if (entries.has(key)) entries.delete(key);
      entries.set(key, value);
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    clear() {
      entries.clear();
    },
    dispose() {
      disposed = true;
      entries.clear();
    },
    get size() {
      return entries.size;
    },
    get limit() {
      return limit;
    }
  });
}

export function realmGrassWindowKey(window: RealmGrassActiveWindow) {
  return window.anchor ? `${window.mode}:${hexKey(window.anchor)}` : `${window.mode}:hidden`;
}
