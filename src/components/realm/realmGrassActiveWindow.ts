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
  maximumActiveInstances: number;
  maximumActiveTriangles: number;
  activeRadius: number;
  hysteresisRadius: number;
  edgeFadeCells: number;
  animationFrameCap: number;
  cacheLimit: number;
  densityMultiplier: number;
  windStrengthMultiplier: number;
  overviewSuppressed: true;
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
