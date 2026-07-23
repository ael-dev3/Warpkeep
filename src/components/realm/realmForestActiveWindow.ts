import {
  hexDisc,
  hexDistance,
  hexKey,
  worldToFractionalAxial,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import { terrainCellByCoord } from '../../game/map/generateTerrainMap';
import type { RealmTerrainMap, TerrainCell } from '../../game/map/terrainTypes';
import type { RealmForestEcologyQuality } from '../../game/map/realmForestEcology';

export type RealmForestCameraMode = 'realm' | 'approach' | 'keep';
export type RealmForestActiveWindowPlan = Readonly<{
  activeRadius: number;
  hysteresisRadius: number;
  edgeFadeCells: number;
  cacheLimit: number;
}>;
export type RealmForestViewportCoverage = Readonly<{
  /** Conservative radius, in hex cells, covered by the visible ground plane. */
  radiusCells: number;
}>;
export type RealmForestCameraGroundCoverage = Readonly<{
  position: Readonly<{ x: number; y: number; z: number }>;
  target: Readonly<{ x: number; y: number; z: number }>;
  focus: HexWorldPosition;
  verticalFovDegrees: number;
  aspect: number;
  minimumGroundY: number;
}>;
export type RealmForestWindowDescriptor = Readonly<{
  mode: RealmForestCameraMode;
  anchor: HexCoord | null;
  viewportRadiusCells: number;
  /** Quantized global reveal; zero keeps the fixed-radius window hidden. */
  reveal: number;
  overviewHidden: boolean;
}>;
export type RealmForestActiveCell = Readonly<{ cell: TerrainCell; edgeFade: number }>;
export type RealmForestActiveWindow = RealmForestWindowDescriptor & Readonly<{
  cells: readonly RealmForestActiveCell[];
}>;

export const REALM_FOREST_REVEAL_STEPS = 8;
export const REALM_FOREST_ACTIVE_WINDOW_PLANS: Readonly<Record<
  RealmForestEcologyQuality,
  RealmForestActiveWindowPlan
>> = Object.freeze({
  high: Object.freeze({ activeRadius: 14, hysteresisRadius: 2, edgeFadeCells: 2, cacheLimit: 2_048 }),
  balanced: Object.freeze({ activeRadius: 13, hysteresisRadius: 2, edgeFadeCells: 2, cacheLimit: 1_024 }),
  reduced: Object.freeze({ activeRadius: 11, hysteresisRadius: 1, edgeFadeCells: 1.5, cacheLimit: 512 })
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function activeRadiusFor(plan: Pick<RealmForestActiveWindowPlan, 'activeRadius'>) {
  return Math.trunc(safeNonNegative(plan.activeRadius, 0));
}

function edgeMarginFor(plan: Pick<RealmForestActiveWindowPlan, 'edgeFadeCells'>) {
  return Math.max(0.5, safeNonNegative(plan.edgeFadeCells, 1.5));
}

function quantizedReveal(value: number) {
  const normalized = clamp(value, 0, 1);
  if (normalized >= 1) return 1;
  return Math.floor(normalized * REALM_FOREST_REVEAL_STEPS + 1e-9)
    / REALM_FOREST_REVEAL_STEPS;
}

/**
 * Intersect all four full-viewport corner rays with the lowest rendered terrain
 * plane. The resulting footprint includes camera pitch, FOV, aspect, and UI
 * composition offsets instead of approximating the ground from image-plane
 * height. One cell of canopy margin keeps tree crowns beyond the last centre.
 */
export function estimateRealmForestViewportRadiusCells(
  camera: RealmForestCameraGroundCoverage,
  hexSizeInput = 1
) {
  const hexSize = Number.isFinite(hexSizeInput) && hexSizeInput > 0
    ? hexSizeInput
    : 1;
  const values = [
    camera.position.x,
    camera.position.y,
    camera.position.z,
    camera.target.x,
    camera.target.y,
    camera.target.z,
    camera.focus.x,
    camera.focus.z,
    camera.verticalFovDegrees,
    camera.aspect,
    camera.minimumGroundY
  ];
  if (
    values.some((value) => !Number.isFinite(value))
    || camera.verticalFovDegrees <= 0
    || camera.verticalFovDegrees >= 179
    || camera.aspect <= 0
  ) return Number.POSITIVE_INFINITY;
  const forward = {
    x: camera.target.x - camera.position.x,
    y: camera.target.y - camera.position.y,
    z: camera.target.z - camera.position.z
  };
  const forwardLength = Math.hypot(forward.x, forward.y, forward.z);
  if (forwardLength <= 0.000001) return Number.POSITIVE_INFINITY;
  forward.x /= forwardLength;
  forward.y /= forwardLength;
  forward.z /= forwardLength;
  const rightLength = Math.hypot(forward.z, forward.x);
  if (rightLength <= 0.000001) return Number.POSITIVE_INFINITY;
  const right = {
    x: -forward.z / rightLength,
    y: 0,
    z: forward.x / rightLength
  };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x
  };
  const halfFovTangent = Math.tan(camera.verticalFovDegrees * Math.PI / 360);
  let maximumGroundHexRadius = 0;
  for (const ndcX of [-1, 1]) {
    for (const ndcY of [-1, 1]) {
      const direction = {
        x: forward.x + right.x * ndcX * halfFovTangent * camera.aspect
          + up.x * ndcY * halfFovTangent,
        y: forward.y + up.y * ndcY * halfFovTangent,
        z: forward.z + right.z * ndcX * halfFovTangent * camera.aspect
          + up.z * ndcY * halfFovTangent
      };
      const directionLength = Math.hypot(direction.x, direction.y, direction.z);
      if (directionLength <= 0.000001) return Number.POSITIVE_INFINITY;
      direction.x /= directionLength;
      direction.y /= directionLength;
      direction.z /= directionLength;
      if (direction.y >= -0.000001) return Number.POSITIVE_INFINITY;
      const distanceAlongRay = (
        camera.minimumGroundY - camera.position.y
      ) / direction.y;
      if (!Number.isFinite(distanceAlongRay) || distanceAlongRay < 0) {
        return Number.POSITIVE_INFINITY;
      }
      const groundX = camera.position.x + direction.x * distanceAlongRay;
      const groundZ = camera.position.z + direction.z * distanceAlongRay;
      const fractional = worldToFractionalAxial({
        x: groundX - camera.focus.x,
        z: groundZ - camera.focus.z
      }, hexSize);
      maximumGroundHexRadius = Math.max(
        maximumGroundHexRadius,
        Math.abs(fractional.q),
        Math.abs(fractional.r),
        Math.abs(fractional.s)
      );
    }
  }
  return maximumGroundHexRadius + 1;
}

/**
 * Resolve only the state required to decide whether a fixed active window must
 * be rebuilt. No terrain cells or hex discs are materialized on this path.
 */
export function resolveRealmForestWindowDescriptor(
  focus: HexWorldPosition,
  mode: RealmForestCameraMode,
  plan: RealmForestActiveWindowPlan,
  viewportCoverage: RealmForestViewportCoverage,
  hexSize = 1
): RealmForestWindowDescriptor {
  if (
    mode === 'realm'
    || !Number.isFinite(focus.x)
    || !Number.isFinite(focus.z)
  ) {
    return Object.freeze({
      mode,
      anchor: null,
      viewportRadiusCells: Number.POSITIVE_INFINITY,
      reveal: 0,
      overviewHidden: true
    });
  }
  const safeHexSize = Number.isFinite(hexSize) && hexSize > 0 ? hexSize : 1;
  const anchor = worldToNearestAxial(focus, safeHexSize);
  const viewportRadiusCells = Number.isFinite(viewportCoverage.radiusCells)
    && viewportCoverage.radiusCells >= 0
    ? viewportCoverage.radiusCells
    : Number.POSITIVE_INFINITY;
  const reveal = quantizedReveal((
    activeRadiusFor(plan) - viewportRadiusCells
  ) / edgeMarginFor(plan));
  return Object.freeze({
    mode,
    anchor: Object.freeze({ ...anchor }),
    viewportRadiusCells,
    reveal,
    overviewHidden: reveal === 0
  });
}

/** Materialize the bounded cell disc only after the descriptor requires it. */
export function materializeRealmForestActiveWindow(
  map: RealmTerrainMap,
  descriptor: RealmForestWindowDescriptor,
  plan: RealmForestActiveWindowPlan
): RealmForestActiveWindow {
  if (descriptor.overviewHidden || !descriptor.anchor) {
    return Object.freeze({ ...descriptor, cells: Object.freeze([]) });
  }
  const radius = activeRadiusFor(plan);
  const fadeCells = edgeMarginFor(plan);
  const anchor = descriptor.anchor;
  const cells = hexDisc(anchor, radius)
    .map((coord) => {
      const cell = terrainCellByCoord(map, coord);
      if (!cell) return undefined;
      return Object.freeze({
        cell,
        edgeFade: clamp((radius - hexDistance(anchor, coord)) / fadeCells, 0, 1)
      });
    })
    .filter((entry): entry is RealmForestActiveCell => entry !== undefined);
  return Object.freeze({ ...descriptor, cells: Object.freeze(cells) });
}

/**
 * Compatibility resolver for existing callers. New render loops should resolve
 * a descriptor, compare hysteresis, then materialize only when required.
 */
export function resolveRealmForestActiveWindow(
  map: RealmTerrainMap,
  focus: HexWorldPosition,
  mode: RealmForestCameraMode,
  plan: RealmForestActiveWindowPlan,
  hexSize = 1
): RealmForestActiveWindow {
  return materializeRealmForestActiveWindow(
    map,
    resolveRealmForestWindowDescriptor(
      focus,
      mode,
      plan,
      { radiusCells: 0 },
      hexSize
    ),
    plan
  );
}

export function shouldMaterializeRealmForestWindow(
  previous: RealmForestWindowDescriptor | null,
  next: RealmForestWindowDescriptor,
  plan: Pick<RealmForestActiveWindowPlan, 'hysteresisRadius'>
) {
  if (!previous) return true;
  if (previous.overviewHidden !== next.overviewHidden) return true;
  if (next.overviewHidden) return false;
  if (!previous.anchor || !next.anchor) return previous.anchor !== next.anchor;
  const hysteresisRadius = Math.max(
    1,
    Math.trunc(safeNonNegative(plan.hysteresisRadius, 1))
  );
  return hexDistance(previous.anchor, next.anchor) >= hysteresisRadius;
}

/** @deprecated Prefer shouldMaterializeRealmForestWindow for descriptor-first callers. */
export function shouldRepackRealmForestWindow(
  previous: RealmForestWindowDescriptor | null,
  next: RealmForestWindowDescriptor,
  plan: Pick<RealmForestActiveWindowPlan, 'hysteresisRadius'>
) {
  return shouldMaterializeRealmForestWindow(previous, next, plan);
}

/** Bounded LRU shared by all camera-local ecology cells. */
export function createRealmForestCellCache<T>(limitInput: number) {
  const limit = Math.trunc(safeNonNegative(limitInput, 0));
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
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    clear: () => entries.clear(),
    dispose: () => { disposed = true; entries.clear(); },
    get size() { return entries.size; },
    get limit() { return limit; }
  });
}

export function realmForestWindowKey(window: RealmForestWindowDescriptor) {
  return !window.overviewHidden && window.anchor
    ? `${window.mode}:${hexKey(window.anchor)}:${window.reveal}`
    : `${window.mode}:hidden`;
}
