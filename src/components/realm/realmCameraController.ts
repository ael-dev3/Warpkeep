import * as THREE from 'three';

import type { TerrainBounds } from './createTerrainGeometry';

export type RealmCameraMode = 'realm' | 'approach' | 'keep';

export type RealmCameraPoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

/**
 * Convex terrain-footprint points used only by full-realm contain fitting.
 * Integrations should pass the actual rendered perimeter, not its axis-aligned
 * bounding box; ordering is irrelevant to the projection fit.
 */
export type RealmOverviewHullPoint = Readonly<{
  x: number;
  z: number;
}>;

export type RealmCameraViewport = Readonly<{
  width: number;
  height: number;
}>;

export type RealmCameraInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export type RealmCameraInsetsInput = Readonly<Partial<RealmCameraInsets>>;

/**
 * UI insets are measured inward from the device-safe boundary. The resolver
 * adds them to the device safe-area insets and clamps pathological inputs to a
 * non-empty gameplay rectangle.
 */
export type RealmCameraComposition = Readonly<{
  insets?: RealmCameraInsetsInput;
  safeAreaInsets?: RealmCameraInsetsInput;
  focusPadding?: number;
}>;

export type RealmSafeViewport = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  aspect: number;
}>;

export type RealmScreenProjection = Readonly<{
  x: number;
  y: number;
  ndcX: number;
  ndcY: number;
  depth: number;
  visible: boolean;
}>;

export type RealmScreenBounds = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  visible: boolean;
}>;

export type RealmKeepFocus = Readonly<{
  x: number;
  y: number;
  z: number;
  height: number;
  footprintDiameter: number;
}>;

export type RealmCameraPan = Readonly<{ x: number; z: number }>;

export type RealmCameraSpec = Readonly<{
  overviewFov: number;
  closeFov: number;
  overviewPitchDegrees: number;
  closePitchDegrees: number;
  azimuthDegrees: number;
  closeHalfHeight: number;
  focusStart: number;
  focusEnd: number;
  zoomDamping: number;
  panDamping: number;
  compositionDamping?: number;
  panMargin: number;
  fogNear: number;
  fogFar: number;
}>;

export type RealmCameraPose = Readonly<{
  position: Readonly<{ x: number; y: number; z: number }>;
  target: Readonly<{ x: number; y: number; z: number }>;
  fov: number;
  distance: number;
  visibleHalfHeight: number;
  pitchDegrees: number;
  near: number;
  far: number;
  fogNear: number;
  fogFar: number;
  mode: RealmCameraMode;
  focus: RealmCameraPoint;
  safeViewport: RealmSafeViewport;
  viewport: RealmCameraViewport;
}>;

export const DEFAULT_REALM_CAMERA_SPEC: RealmCameraSpec = {
  overviewFov: 26,
  closeFov: 18,
  overviewPitchDegrees: 48,
  closePitchDegrees: 27,
  azimuthDegrees: 43,
  closeHalfHeight: 1.62,
  focusStart: 0.2,
  focusEnd: 0.8,
  zoomDamping: 10,
  panDamping: 13,
  compositionDamping: 11,
  panMargin: 0.72,
  fogNear: 28,
  fogFar: 58
};

const DEFAULT_FOCUS_PADDING = 24;
const MIN_SAFE_VIEWPORT_SIZE = 1;
export const REALM_INTERACTIVE_MIN_ZOOM = 0.16;
const ZERO_INSETS: RealmCameraInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function lerp(first: number, second: number, amount: number) {
  return first + (second - first) * amount;
}

function smootherstep(value: number) {
  const normalized = clamp(value, 0, 1);
  return normalized ** 3 * (normalized * (normalized * 6 - 15) + 10);
}

function geometricLerp(first: number, second: number, amount: number) {
  return Math.exp(lerp(Math.log(Math.max(0.001, first)), Math.log(Math.max(0.001, second)), amount));
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function normalizeViewport(viewport: RealmCameraViewport): RealmCameraViewport {
  return {
    width: Math.max(1, finite(viewport.width, 1)),
    height: Math.max(1, finite(viewport.height, 1))
  };
}

function normalizeInsets(insets: RealmCameraInsetsInput | undefined): RealmCameraInsets {
  return {
    top: Math.max(0, finite(insets?.top ?? 0, 0)),
    right: Math.max(0, finite(insets?.right ?? 0, 0)),
    bottom: Math.max(0, finite(insets?.bottom ?? 0, 0)),
    left: Math.max(0, finite(insets?.left ?? 0, 0))
  };
}

function fitInsetPair(first: number, second: number, available: number) {
  const maximum = Math.max(0, available - MIN_SAFE_VIEWPORT_SIZE);
  const total = first + second;
  if (total <= maximum || total <= 0) return [first, second] as const;
  const scale = maximum / total;
  return [first * scale, second * scale] as const;
}

export function resolveRealmSafeViewport(
  viewportInput: RealmCameraViewport,
  composition: RealmCameraComposition = {}
): RealmSafeViewport {
  const viewport = normalizeViewport(viewportInput);
  const insets = normalizeInsets(composition.insets);
  const safeAreaInsets = normalizeInsets(composition.safeAreaInsets);
  const [left, right] = fitInsetPair(
    insets.left + safeAreaInsets.left,
    insets.right + safeAreaInsets.right,
    viewport.width
  );
  const [top, bottom] = fitInsetPair(
    insets.top + safeAreaInsets.top,
    insets.bottom + safeAreaInsets.bottom,
    viewport.height
  );
  const width = Math.max(MIN_SAFE_VIEWPORT_SIZE, viewport.width - left - right);
  const height = Math.max(MIN_SAFE_VIEWPORT_SIZE, viewport.height - top - bottom);
  return {
    top,
    right: viewport.width - right,
    bottom: viewport.height - bottom,
    left,
    width,
    height,
    centerX: left + width * 0.5,
    centerY: top + height * 0.5,
    aspect: Math.max(0.01, width / height)
  };
}

// Perspective depth makes the nearest hull edge project larger than its
// target-plane extent. Fourteen percent contains the complete radius-22 perimeter
// across desktop and mobile safe viewports without restoring the much larger
// nonexistent AABB corners.
const OVERVIEW_FIT_MARGIN = 1.14;

export function dampingAlpha(rate: number, deltaSeconds: number) {
  return 1 - Math.exp(-Math.max(0, finite(rate, 0)) * clamp(finite(deltaSeconds, 0), 0, 0.1));
}

export function normalizeWheelDelta(deltaY: number, deltaMode: number, viewportHeight: number) {
  const safeDelta = finite(deltaY, 0);
  if (deltaMode === 1) return safeDelta * 16;
  if (deltaMode === 2) return safeDelta * Math.max(1, finite(viewportHeight, 720));
  return safeDelta;
}

/**
 * Ordinary input cannot back out into the tiny-world endpoint. An explicit
 * Realm preset already below the floor remains there until the player zooms
 * inward, so another outward wheel/pinch gesture never jumps the camera closer.
 */
export function clampRealmInteractiveZoom(
  currentInput: number,
  nextInput: number,
  minimumInput = REALM_INTERACTIVE_MIN_ZOOM
) {
  const current = clamp(finite(currentInput, 0), 0, 1);
  const next = clamp(finite(nextInput, current), 0, 1);
  const minimum = clamp(finite(minimumInput, REALM_INTERACTIVE_MIN_ZOOM), 0, 1);
  if (current < minimum && next <= current) return current;
  return clamp(next, minimum, 1);
}

function overviewFootprintPoints(
  bounds: TerrainBounds,
  hull: readonly RealmOverviewHullPoint[] | undefined
): readonly RealmOverviewHullPoint[] {
  const finiteHull = hull?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  if (finiteHull && finiteHull.length >= 3) return finiteHull;
  return [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ }
  ];
}

export function fitRealmOverview(
  bounds: TerrainBounds,
  aspect: number,
  pitchDegrees = DEFAULT_REALM_CAMERA_SPEC.overviewPitchDegrees,
  azimuthDegrees = DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees,
  hull?: readonly RealmOverviewHullPoint[]
) {
  const safeAspect = Math.max(0.35, finite(aspect, 16 / 9));
  const pitch = radians(pitchDegrees);
  const azimuth = radians(azimuthDegrees);
  const right = {
    x: Math.cos(azimuth),
    y: 0,
    z: -Math.sin(azimuth)
  };
  const up = {
    x: -Math.sin(azimuth) * Math.sin(pitch),
    y: Math.cos(pitch),
    z: -Math.cos(azimuth) * Math.sin(pitch)
  };
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    // Full-realm focus is the world support plane, not the terrain AABB's
    // potentially biased relief midpoint. Fit around the same Y used by the
    // zoom-zero pose so asymmetric hills cannot invalidate containment.
    y: 0,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
  let maxRight = 0;
  let maxUp = 0;

  overviewFootprintPoints(bounds, hull).forEach(({ x, z }) => {
    [bounds.minY, bounds.maxY + 1.4].forEach((y) => {
      const offset = { x: x - center.x, y: y - center.y, z: z - center.z };
      maxRight = Math.max(maxRight, Math.abs(offset.x * right.x + offset.y * right.y + offset.z * right.z));
      maxUp = Math.max(maxUp, Math.abs(offset.x * up.x + offset.y * up.y + offset.z * up.z));
    });
  });
  return Math.max(
    2,
    maxUp * OVERVIEW_FIT_MARGIN,
    (maxRight * OVERVIEW_FIT_MARGIN) / safeAspect
  );
}

function normalizeKeepFocus(
  focus: RealmKeepFocus,
  fallback: RealmKeepFocus = { x: 0, y: 0, z: 0, height: 1, footprintDiameter: 1 }
): RealmKeepFocus {
  return {
    x: finite(focus.x, fallback.x),
    y: finite(focus.y, fallback.y),
    z: finite(focus.z, fallback.z),
    height: Math.max(0.001, finite(focus.height, fallback.height)),
    footprintDiameter: Math.max(
      0.001,
      finite(focus.footprintDiameter, fallback.footprintDiameter)
    )
  };
}

function focusPivot(focusInput: RealmKeepFocus): RealmCameraPoint {
  const focus = normalizeKeepFocus(focusInput);
  return {
    x: focus.x,
    y: focus.y + focus.height * 0.38,
    z: focus.z
  };
}

function focusBoundsCorners(focusInput: RealmKeepFocus): readonly RealmCameraPoint[] {
  const focus = normalizeKeepFocus(focusInput);
  const radius = focus.footprintDiameter * 0.5;
  const corners: RealmCameraPoint[] = [];
  [-radius, radius].forEach((xOffset) => {
    [0, focus.height].forEach((yOffset) => {
      [-radius, radius].forEach((zOffset) => {
        corners.push({
          x: focus.x + xOffset,
          y: focus.y + yOffset,
          z: focus.z + zOffset
        });
      });
    });
  });
  return corners;
}

type RealmCameraGeometry = Readonly<{
  position: RealmCameraPoint;
  target: RealmCameraPoint;
  distance: number;
}>;

function deriveFramedCameraGeometry(
  focus: RealmCameraPoint,
  visibleHalfHeight: number,
  fov: number,
  pitchDegrees: number,
  azimuthDegrees: number,
  viewportInput: RealmCameraViewport,
  safeViewport: RealmSafeViewport
): RealmCameraGeometry {
  const viewport = normalizeViewport(viewportInput);
  const aspect = viewport.width / viewport.height;
  const pitch = radians(pitchDegrees);
  const azimuth = radians(azimuthDegrees);
  const right = {
    x: Math.cos(azimuth),
    y: 0,
    z: -Math.sin(azimuth)
  };
  const up = {
    x: -Math.sin(azimuth) * Math.sin(pitch),
    y: Math.cos(pitch),
    z: -Math.cos(azimuth) * Math.sin(pitch)
  };
  const desiredNdcX = (safeViewport.centerX / viewport.width) * 2 - 1;
  const desiredNdcY = 1 - (safeViewport.centerY / viewport.height) * 2;
  const shiftRight = -desiredNdcX * visibleHalfHeight * aspect;
  const shiftUp = -desiredNdcY * visibleHalfHeight;
  const target = {
    x: focus.x + right.x * shiftRight + up.x * shiftUp,
    y: focus.y + right.y * shiftRight + up.y * shiftUp,
    z: focus.z + right.z * shiftRight + up.z * shiftUp
  };
  const distance = visibleHalfHeight / Math.tan(radians(fov) / 2);
  const horizontalDistance = Math.cos(pitch) * distance;
  return {
    target,
    position: {
      x: target.x + Math.sin(azimuth) * horizontalDistance,
      y: target.y + Math.sin(pitch) * distance,
      z: target.z + Math.cos(azimuth) * horizontalDistance
    },
    distance
  };
}

function projectRealmPointFromView(
  position: RealmCameraPoint,
  target: RealmCameraPoint,
  fov: number,
  point: RealmCameraPoint,
  viewportInput: RealmCameraViewport
): RealmScreenProjection {
  const viewport = normalizeViewport(viewportInput);
  const forwardVector = {
    x: target.x - position.x,
    y: target.y - position.y,
    z: target.z - position.z
  };
  const forwardLength = Math.max(
    0.000001,
    Math.hypot(forwardVector.x, forwardVector.y, forwardVector.z)
  );
  const forward = {
    x: forwardVector.x / forwardLength,
    y: forwardVector.y / forwardLength,
    z: forwardVector.z / forwardLength
  };
  const rightLength = Math.max(0.000001, Math.hypot(forward.z, forward.x));
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
  const offset = {
    x: point.x - position.x,
    y: point.y - position.y,
    z: point.z - position.z
  };
  const depth = offset.x * forward.x + offset.y * forward.y + offset.z * forward.z;
  const cameraX = offset.x * right.x + offset.y * right.y + offset.z * right.z;
  const cameraY = offset.x * up.x + offset.y * up.y + offset.z * up.z;
  const verticalScale = Math.max(0.000001, depth * Math.tan(radians(fov) / 2));
  const ndcX = cameraX / (verticalScale * (viewport.width / viewport.height));
  const ndcY = cameraY / verticalScale;
  const x = (ndcX * 0.5 + 0.5) * viewport.width;
  const y = (-ndcY * 0.5 + 0.5) * viewport.height;
  return {
    x,
    y,
    ndcX,
    ndcY,
    depth,
    visible: depth > 0
      && Number.isFinite(x)
      && Number.isFinite(y)
      && ndcX >= -1
      && ndcX <= 1
      && ndcY >= -1
      && ndcY <= 1
  };
}

export function projectRealmPointToViewport(
  pose: RealmCameraPose,
  point: RealmCameraPoint,
  viewport: RealmCameraViewport = pose.viewport
): RealmScreenProjection {
  return projectRealmPointFromView(pose.position, pose.target, pose.fov, point, viewport);
}

function intersectRealmGroundAtViewportPoint(
  pose: RealmCameraPose,
  xInput: number,
  yInput: number,
  viewportInput: RealmCameraViewport = pose.viewport
): RealmCameraPoint | null {
  const viewport = normalizeViewport(viewportInput);
  const x = finite(xInput, viewport.width * 0.5);
  const y = finite(yInput, viewport.height * 0.5);
  const forwardOffset = {
    x: pose.target.x - pose.position.x,
    y: pose.target.y - pose.position.y,
    z: pose.target.z - pose.position.z
  };
  const forwardLength = Math.hypot(
    forwardOffset.x,
    forwardOffset.y,
    forwardOffset.z
  );
  if (!Number.isFinite(forwardLength) || forwardLength < 0.000001) return null;
  const forward = {
    x: forwardOffset.x / forwardLength,
    y: forwardOffset.y / forwardLength,
    z: forwardOffset.z / forwardLength
  };
  const rightLength = Math.hypot(forward.z, forward.x);
  if (!Number.isFinite(rightLength) || rightLength < 0.000001) return null;
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
  const ndcX = (x / viewport.width) * 2 - 1;
  const ndcY = 1 - (y / viewport.height) * 2;
  const verticalScale = Math.tan(radians(pose.fov) * 0.5);
  const horizontalScale = verticalScale * (viewport.width / viewport.height);
  const ray = {
    x: forward.x + right.x * ndcX * horizontalScale + up.x * ndcY * verticalScale,
    y: forward.y + right.y * ndcX * horizontalScale + up.y * ndcY * verticalScale,
    z: forward.z + right.z * ndcX * horizontalScale + up.z * ndcY * verticalScale
  };
  if (!Number.isFinite(ray.y) || Math.abs(ray.y) < 0.000001) return null;
  const distance = -pose.position.y / ray.y;
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const point = {
    x: pose.position.x + ray.x * distance,
    y: 0,
    z: pose.position.z + ray.z * distance
  };
  return Object.values(point).every(Number.isFinite) ? point : null;
}

function boundsFromProjections(
  projections: readonly RealmScreenProjection[]
): RealmScreenBounds {
  const minX = Math.min(...projections.map((projection) => projection.x));
  const maxX = Math.max(...projections.map((projection) => projection.x));
  const minY = Math.min(...projections.map((projection) => projection.y));
  const maxY = Math.max(...projections.map((projection) => projection.y));
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    visible: projections.every((projection) => projection.visible)
  };
}

export function projectRealmFocusBounds(
  pose: RealmCameraPose,
  focus: RealmKeepFocus,
  viewport: RealmCameraViewport = pose.viewport
): RealmScreenBounds {
  return boundsFromProjections(
    focusBoundsCorners(focus).map((corner) => projectRealmPointToViewport(pose, corner, viewport))
  );
}

export function isRealmScreenBoundsInsideSafeViewport(
  bounds: RealmScreenBounds,
  safeViewport: RealmSafeViewport,
  padding = 0
) {
  const safePadding = clamp(
    finite(padding, 0),
    0,
    Math.max(0, Math.min(safeViewport.width, safeViewport.height) * 0.45)
  );
  return bounds.visible
    && bounds.minX >= safeViewport.left + safePadding - 0.000001
    && bounds.maxX <= safeViewport.right - safePadding + 0.000001
    && bounds.minY >= safeViewport.top + safePadding - 0.000001
    && bounds.maxY <= safeViewport.bottom - safePadding + 0.000001;
}

export type RealmFocusFitOptions = Readonly<{
  fov?: number;
  pitchDegrees?: number;
  azimuthDegrees?: number;
  minimumHalfHeight?: number;
}>;

export function fitRealmFocusHalfHeight(
  focus: RealmKeepFocus,
  viewportInput: RealmCameraViewport,
  composition: RealmCameraComposition = {},
  options: RealmFocusFitOptions = {}
) {
  const viewport = normalizeViewport(viewportInput);
  const safeViewport = resolveRealmSafeViewport(viewport, composition);
  const fov = clamp(finite(options.fov ?? DEFAULT_REALM_CAMERA_SPEC.closeFov, 18), 1, 120);
  const pitchDegrees = clamp(
    finite(options.pitchDegrees ?? DEFAULT_REALM_CAMERA_SPEC.closePitchDegrees, 27),
    1,
    89
  );
  const azimuthDegrees = finite(
    options.azimuthDegrees ?? DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees,
    43
  );
  const minimumHalfHeight = Math.max(
    0.05,
    finite(options.minimumHalfHeight ?? DEFAULT_REALM_CAMERA_SPEC.closeHalfHeight, 1.62)
  );
  const padding = clamp(
    finite(composition.focusPadding ?? DEFAULT_FOCUS_PADDING, DEFAULT_FOCUS_PADDING),
    0,
    Math.max(0, Math.min(safeViewport.width, safeViewport.height) * 0.45)
  );
  const pivot = focusPivot(focus);
  const corners = focusBoundsCorners(focus);
  const fits = (visibleHalfHeight: number) => {
    const geometry = deriveFramedCameraGeometry(
      pivot,
      visibleHalfHeight,
      fov,
      pitchDegrees,
      azimuthDegrees,
      viewport,
      safeViewport
    );
    const bounds = boundsFromProjections(corners.map((corner) => projectRealmPointFromView(
      geometry.position,
      geometry.target,
      fov,
      corner,
      viewport
    )));
    return isRealmScreenBoundsInsideSafeViewport(bounds, safeViewport, padding);
  };

  if (fits(minimumHalfHeight)) return minimumHalfHeight;
  let lower = minimumHalfHeight;
  let upper = minimumHalfHeight;
  for (let attempt = 0; attempt < 24 && !fits(upper); attempt += 1) {
    lower = upper;
    upper = Math.min(100_000, upper * 1.5);
  }
  for (let iteration = 0; iteration < 36; iteration += 1) {
    const middle = (lower + upper) * 0.5;
    if (fits(middle)) upper = middle;
    else lower = middle;
  }
  return upper;
}

export function clampRealmPan(
  pan: RealmCameraPan,
  bounds: TerrainBounds,
  zoom: number,
  visibleHalfHeight: number,
  aspect: number,
  margin = DEFAULT_REALM_CAMERA_SPEC.panMargin
): RealmCameraPan {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const halfSpanX = (bounds.maxX - bounds.minX) / 2;
  const halfSpanZ = (bounds.maxZ - bounds.minZ) / 2;
  const freedom = smootherstep(clamp(zoom * 1.25, 0, 1));
  const visibleHalfWidth = Math.max(0, visibleHalfHeight * Math.max(0.35, aspect));
  const maxX = Math.max(0, halfSpanX - visibleHalfWidth * 0.48) * freedom + margin * freedom;
  const maxZ = Math.max(0, halfSpanZ - visibleHalfHeight * 0.5) * freedom + margin * freedom;
  return {
    x: clamp(finite(pan.x, centerX), centerX - maxX, centerX + maxX),
    z: clamp(finite(pan.z, centerZ), centerZ - maxZ, centerZ + maxZ)
  };
}

export function deriveRealmCameraPoseForViewport(
  zoomInput: number,
  panInput: RealmCameraPan,
  bounds: TerrainBounds,
  keep: RealmKeepFocus,
  viewportInput: RealmCameraViewport,
  composition: RealmCameraComposition = {},
  spec: RealmCameraSpec = DEFAULT_REALM_CAMERA_SPEC,
  overviewHull?: readonly RealmOverviewHullPoint[]
): RealmCameraPose {
  const viewport = normalizeViewport(viewportInput);
  const safeViewport = resolveRealmSafeViewport(viewport, composition);
  const normalizedKeep = normalizeKeepFocus(keep);
  const zoom = clamp(finite(zoomInput, 0), 0, 1);
  const aspect = viewport.width / viewport.height;
  const curve = smootherstep(zoom);
  const focusBlend = smootherstep(
    (zoom - spec.focusStart) / Math.max(0.001, spec.focusEnd - spec.focusStart)
  );
  const overviewFov = clamp(finite(spec.overviewFov, 26), 1, 120);
  const closeFov = Math.min(overviewFov, clamp(finite(spec.closeFov, 18), 1, 120));
  const overviewPitchDegrees = clamp(finite(spec.overviewPitchDegrees, 48), 1, 89);
  const closePitchDegrees = clamp(finite(spec.closePitchDegrees, 27), 1, 89);
  const overviewHalfHeight = fitRealmOverview(
    bounds,
    safeViewport.aspect,
    overviewPitchDegrees,
    spec.azimuthDegrees,
    overviewHull
  ) * (viewport.height / safeViewport.height);
  const closeMinimumHalfHeight = Math.max(
    Math.max(0.05, finite(spec.closeHalfHeight, 1.62))
      * (viewport.height / safeViewport.height),
    normalizedKeep.footprintDiameter
      * 0.55
      * (viewport.height / safeViewport.width)
  );
  const closeHalfHeight = fitRealmFocusHalfHeight(
    normalizedKeep,
    viewport,
    composition,
    {
      fov: closeFov,
      pitchDegrees: closePitchDegrees,
      azimuthDegrees: spec.azimuthDegrees,
      minimumHalfHeight: closeMinimumHalfHeight
    }
  );
  const visibleHalfHeight = geometricLerp(overviewHalfHeight, closeHalfHeight, curve);
  const safeVisibleHalfHeight = visibleHalfHeight * (safeViewport.height / viewport.height);
  const clampedPan = clampRealmPan(
    panInput,
    bounds,
    zoom,
    safeVisibleHalfHeight,
    safeViewport.aspect,
    spec.panMargin
  );
  const fov = lerp(overviewFov, closeFov, curve);
  const pitchDegrees = lerp(overviewPitchDegrees, closePitchDegrees, curve);
  const keepPivot = focusPivot(normalizedKeep);
  const focus = {
    x: lerp(clampedPan.x, normalizedKeep.x, focusBlend),
    y: lerp(0, keepPivot.y, focusBlend),
    z: lerp(clampedPan.z, normalizedKeep.z, focusBlend)
  };
  const geometry = deriveFramedCameraGeometry(
    focus,
    visibleHalfHeight,
    fov,
    pitchDegrees,
    spec.azimuthDegrees,
    viewport,
    safeViewport
  );
  const { distance, position, target } = geometry;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const overviewFogNear = Math.max(spec.fogNear, distance - span * 0.2);
  const overviewFogFar = Math.max(spec.fogFar, distance + span * 1.28);
  const closeFogNear = distance + Math.max(2, normalizedKeep.footprintDiameter * 1.6);
  const closeFogFar = Math.max(closeFogNear + 6, distance + 22);
  const fogNear = lerp(overviewFogNear, closeFogNear, curve);
  const fogFar = Math.max(fogNear + 6, lerp(overviewFogFar, closeFogFar, curve));
  return {
    position,
    target,
    fov,
    distance,
    visibleHalfHeight,
    pitchDegrees,
    near: Math.max(0.04, distance * 0.018),
    far: Math.max(60, distance + span * 4),
    fogNear,
    fogFar,
    mode: zoom < 0.24 ? 'realm' : zoom < 0.76 ? 'approach' : 'keep',
    focus,
    safeViewport,
    viewport
  };
}

/**
 * Backwards-compatible aspect-only derivation. New integrations should prefer
 * deriveRealmCameraPoseForViewport so UI and device insets can participate in
 * composition.
 */
export function deriveRealmCameraPose(
  zoomInput: number,
  panInput: RealmCameraPan,
  bounds: TerrainBounds,
  keep: RealmKeepFocus,
  aspectInput: number,
  spec: RealmCameraSpec = DEFAULT_REALM_CAMERA_SPEC,
  overviewHull?: readonly RealmOverviewHullPoint[]
): RealmCameraPose {
  const aspect = Math.max(0.35, finite(aspectInput, 16 / 9));
  return deriveRealmCameraPoseForViewport(
    zoomInput,
    panInput,
    bounds,
    keep,
    { width: aspect * 1_000, height: 1_000 },
    {},
    spec,
    overviewHull
  );
}

type RealmCompositionState = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
  focusPadding: number;
}>;

function compositionState(composition: RealmCameraComposition = {}): RealmCompositionState {
  const insets = normalizeInsets(composition.insets);
  const safeAreaInsets = normalizeInsets(composition.safeAreaInsets);
  return {
    top: insets.top + safeAreaInsets.top,
    right: insets.right + safeAreaInsets.right,
    bottom: insets.bottom + safeAreaInsets.bottom,
    left: insets.left + safeAreaInsets.left,
    focusPadding: Math.max(
      0,
      finite(composition.focusPadding ?? DEFAULT_FOCUS_PADDING, DEFAULT_FOCUS_PADDING)
    )
  };
}

function stateComposition(state: RealmCompositionState): RealmCameraComposition {
  return {
    insets: {
      top: state.top,
      right: state.right,
      bottom: state.bottom,
      left: state.left
    },
    safeAreaInsets: ZERO_INSETS,
    focusPadding: state.focusPadding
  };
}

function lerpFocus(
  current: RealmKeepFocus,
  target: RealmKeepFocus,
  amount: number
): RealmKeepFocus {
  return {
    x: lerp(current.x, target.x, amount),
    y: lerp(current.y, target.y, amount),
    z: lerp(current.z, target.z, amount),
    height: lerp(current.height, target.height, amount),
    footprintDiameter: lerp(current.footprintDiameter, target.footprintDiameter, amount)
  };
}

function lerpComposition(
  current: RealmCompositionState,
  target: RealmCompositionState,
  amount: number
): RealmCompositionState {
  return {
    top: lerp(current.top, target.top, amount),
    right: lerp(current.right, target.right, amount),
    bottom: lerp(current.bottom, target.bottom, amount),
    left: lerp(current.left, target.left, amount),
    focusPadding: lerp(current.focusPadding, target.focusPadding, amount)
  };
}

function focusDistance(first: RealmKeepFocus, second: RealmKeepFocus) {
  return Math.max(
    Math.abs(first.x - second.x),
    Math.abs(first.y - second.y),
    Math.abs(first.z - second.z),
    Math.abs(first.height - second.height),
    Math.abs(first.footprintDiameter - second.footprintDiameter)
  );
}

function compositionDistance(first: RealmCompositionState, second: RealmCompositionState) {
  return Math.max(
    Math.abs(first.top - second.top),
    Math.abs(first.right - second.right),
    Math.abs(first.bottom - second.bottom),
    Math.abs(first.left - second.left),
    Math.abs(first.focusPadding - second.focusPadding)
  );
}

export type RealmCameraController = Readonly<{
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  frameAt: (focus: RealmKeepFocus, zoom: number) => void;
  focusAt: (focus: RealmKeepFocus) => void;
  focusKeep: () => void;
  getMode: () => RealmCameraMode;
  getPose: () => RealmCameraPose;
  getSafeViewport: () => RealmSafeViewport;
  getZoom: () => number;
  panByPixels: (deltaX: number, deltaY: number) => void;
  projectPoint: (point: RealmCameraPoint) => RealmScreenProjection;
  recenterKeep: () => void;
  setComposition: (composition: RealmCameraComposition) => void;
  setKeepFocus: (focus: RealmKeepFocus) => void;
  setViewport: (width: number, height: number) => void;
  showRealm: () => void;
  zoomBy: (amount: number) => void;
  zoomByAt: (amount: number, localX: number, localY: number) => void;
  zoomByWheel: (deltaY: number, deltaMode: number) => void;
}>;

export type CreateRealmCameraControllerOptions = Readonly<{
  bounds: TerrainBounds;
  overviewHull?: readonly RealmOverviewHullPoint[];
  keepFocus: RealmKeepFocus;
  fog: THREE.Fog;
  reducedMotion: boolean;
  render: () => void;
  onModeChange?: (mode: RealmCameraMode) => void;
  composition?: RealmCameraComposition;
  spec?: RealmCameraSpec;
}>;

export function createRealmCameraController(
  options: CreateRealmCameraControllerOptions
): RealmCameraController {
  const spec = options.spec ?? DEFAULT_REALM_CAMERA_SPEC;
  const camera = new THREE.PerspectiveCamera(spec.overviewFov, 16 / 9, 0.1, 100);
  const targetVector = new THREE.Vector3();
  let width = 1280;
  let height = 720;
  let currentZoom = 0;
  let targetZoom = 0;
  let currentPan = {
    x: (options.bounds.minX + options.bounds.maxX) / 2,
    z: (options.bounds.minZ + options.bounds.maxZ) / 2
  };
  let targetPan = { ...currentPan };
  let keepFocus = normalizeKeepFocus(options.keepFocus);
  let currentFocus = { ...keepFocus };
  let targetFocus = { ...keepFocus };
  let targetFocusIsKeep = true;
  let currentComposition = compositionState(options.composition);
  let targetComposition = { ...currentComposition };
  let previousTime = 0;
  let frame = 0;
  let disposed = false;
  let mode: RealmCameraMode = 'realm';
  let lastPose = deriveRealmCameraPoseForViewport(
    currentZoom,
    currentPan,
    options.bounds,
    currentFocus,
    { width, height },
    stateComposition(currentComposition),
    spec,
    options.overviewHull
  );

  const applyPose = () => {
    const pose = deriveRealmCameraPoseForViewport(
      currentZoom,
      currentPan,
      options.bounds,
      currentFocus,
      { width, height },
      stateComposition(currentComposition),
      spec,
      options.overviewHull
    );
    lastPose = pose;
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    targetVector.set(pose.target.x, pose.target.y, pose.target.z);
    camera.fov = pose.fov;
    camera.aspect = width / Math.max(1, height);
    camera.near = pose.near;
    camera.far = pose.far;
    camera.lookAt(targetVector);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    options.fog.near = pose.fogNear;
    options.fog.far = pose.fogFar;
    if (pose.mode !== mode) {
      mode = pose.mode;
      options.onModeChange?.(mode);
    }
  };

  const settleImmediately = () => {
    currentZoom = targetZoom;
    currentPan = { ...targetPan };
    currentFocus = { ...targetFocus };
    currentComposition = { ...targetComposition };
    applyPose();
    options.render();
  };

  const isUnsettled = () => Math.abs(currentZoom - targetZoom) > 0.0004
    || Math.abs(currentPan.x - targetPan.x) > 0.001
    || Math.abs(currentPan.z - targetPan.z) > 0.001
    || focusDistance(currentFocus, targetFocus) > 0.0005
    || compositionDistance(currentComposition, targetComposition) > 0.02;

  const tick = (time: number) => {
    frame = 0;
    if (disposed || document.hidden) return;
    const deltaSeconds = previousTime > 0 ? Math.min(0.1, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    const zoomAlpha = dampingAlpha(spec.zoomDamping, deltaSeconds);
    const panAlpha = dampingAlpha(spec.panDamping, deltaSeconds);
    const compositionAlpha = dampingAlpha(
      finite(spec.compositionDamping ?? DEFAULT_REALM_CAMERA_SPEC.compositionDamping ?? 11, 11),
      deltaSeconds
    );
    currentZoom = lerp(currentZoom, targetZoom, zoomAlpha);
    currentPan = {
      x: lerp(currentPan.x, targetPan.x, panAlpha),
      z: lerp(currentPan.z, targetPan.z, panAlpha)
    };
    currentFocus = lerpFocus(currentFocus, targetFocus, panAlpha);
    currentComposition = lerpComposition(
      currentComposition,
      targetComposition,
      compositionAlpha
    );
    const unsettled = isUnsettled();
    if (!unsettled) {
      currentZoom = targetZoom;
      currentPan = { ...targetPan };
      currentFocus = { ...targetFocus };
      currentComposition = { ...targetComposition };
    }
    applyPose();
    options.render();
    if (unsettled) frame = window.requestAnimationFrame(tick);
  };

  const invalidate = () => {
    if (disposed) return;
    if (options.reducedMotion) {
      settleImmediately();
      return;
    }
    if (!frame && !document.hidden) {
      previousTime = 0;
      frame = window.requestAnimationFrame(tick);
    }
  };

  const setZoomTarget = (next: number) => {
    targetZoom = clamp(next, 0, 1);
    const targetPose = deriveRealmCameraPoseForViewport(
      targetZoom,
      targetPan,
      options.bounds,
      targetFocus,
      { width, height },
      stateComposition(targetComposition),
      spec,
      options.overviewHull
    );
    targetPan = clampRealmPan(
      targetPan,
      options.bounds,
      targetZoom,
      targetPose.visibleHalfHeight * (targetPose.safeViewport.height / height),
      targetPose.safeViewport.aspect,
      spec.panMargin
    );
    invalidate();
  };

  const handleVisibility = () => {
    if (document.hidden && frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      return;
    }
    if (!document.hidden && isUnsettled()) invalidate();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  applyPose();

  return {
    camera,
    dispose: () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', handleVisibility);
    },
    frameAt: (next, zoom) => {
      targetFocusIsKeep = false;
      targetFocus = normalizeKeepFocus(next, targetFocus);
      targetPan = { x: targetFocus.x, z: targetFocus.z };
      setZoomTarget(zoom);
    },
    focusAt: (next) => {
      targetFocusIsKeep = false;
      targetFocus = normalizeKeepFocus(next, targetFocus);
      targetPan = { x: targetFocus.x, z: targetFocus.z };
      setZoomTarget(1);
    },
    focusKeep: () => {
      targetFocusIsKeep = true;
      targetFocus = { ...keepFocus };
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      setZoomTarget(1);
    },
    getMode: () => mode,
    getPose: () => lastPose,
    getSafeViewport: () => lastPose.safeViewport,
    getZoom: () => targetZoom,
    panByPixels: (deltaX, deltaY) => {
      const pose = deriveRealmCameraPoseForViewport(
        targetZoom,
        targetPan,
        options.bounds,
        targetFocus,
        { width, height },
        stateComposition(targetComposition),
        spec,
        options.overviewHull
      );
      const worldPerPixel = (pose.visibleHalfHeight * 2) / Math.max(1, height);
      const azimuth = radians(spec.azimuthDegrees);
      const previousPan = targetPan;
      const nextPan = clampRealmPan({
        x: targetPan.x - Math.cos(azimuth) * deltaX * worldPerPixel
          - Math.sin(azimuth) * deltaY * worldPerPixel,
        z: targetPan.z + Math.sin(azimuth) * deltaX * worldPerPixel
          - Math.cos(azimuth) * deltaY * worldPerPixel
      },
      options.bounds,
      targetZoom,
      pose.visibleHalfHeight * (pose.safeViewport.height / height),
      pose.safeViewport.aspect,
      spec.panMargin);
      const actualDelta = {
        x: nextPan.x - previousPan.x,
        z: nextPan.z - previousPan.z
      };
      targetPan = nextPan;
      if (Math.abs(actualDelta.x) > 0.000001 || Math.abs(actualDelta.z) > 0.000001) {
        targetFocusIsKeep = false;
        targetFocus = {
          ...targetFocus,
          x: targetFocus.x + actualDelta.x,
          z: targetFocus.z + actualDelta.z
        };
      }
      invalidate();
    },
    projectPoint: (point) => projectRealmPointToViewport(lastPose, point, { width, height }),
    recenterKeep: () => {
      targetFocusIsKeep = true;
      targetFocus = { ...keepFocus };
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      invalidate();
    },
    setComposition: (next) => {
      targetComposition = compositionState(next);
      invalidate();
    },
    setKeepFocus: (next) => {
      keepFocus = normalizeKeepFocus(next, keepFocus);
      if (targetFocusIsKeep) targetFocus = { ...keepFocus };
      invalidate();
    },
    setViewport: (nextWidth, nextHeight) => {
      width = Math.max(1, finite(nextWidth, 1));
      height = Math.max(1, finite(nextHeight, 1));
      const targetPose = deriveRealmCameraPoseForViewport(
        targetZoom,
        targetPan,
        options.bounds,
        targetFocus,
        { width, height },
        stateComposition(targetComposition),
        spec,
        options.overviewHull
      );
      targetPan = clampRealmPan(
        targetPan,
        options.bounds,
        targetZoom,
        targetPose.visibleHalfHeight * (targetPose.safeViewport.height / height),
        targetPose.safeViewport.aspect,
        spec.panMargin
      );
      const currentPose = deriveRealmCameraPoseForViewport(
        currentZoom,
        currentPan,
        options.bounds,
        currentFocus,
        { width, height },
        stateComposition(currentComposition),
        spec,
        options.overviewHull
      );
      currentPan = clampRealmPan(
        currentPan,
        options.bounds,
        currentZoom,
        currentPose.visibleHalfHeight * (currentPose.safeViewport.height / height),
        currentPose.safeViewport.aspect,
        spec.panMargin
      );
      if (options.reducedMotion) settleImmediately();
      else {
        applyPose();
        options.render();
        if (isUnsettled()) invalidate();
      }
    },
    showRealm: () => {
      targetFocusIsKeep = true;
      targetFocus = { ...keepFocus };
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      setZoomTarget(0);
    },
    zoomBy: (amount) => setZoomTarget(clampRealmInteractiveZoom(
      targetZoom,
      targetZoom + finite(amount, 0)
    )),
    zoomByAt: (amount, localX, localY) => {
      const nextZoom = clampRealmInteractiveZoom(
        targetZoom,
        targetZoom + finite(amount, 0)
      );
      if (Math.abs(nextZoom - targetZoom) <= 0.000001) return;
      const viewport = { width, height };
      const composition = stateComposition(targetComposition);
      const beforePose = deriveRealmCameraPoseForViewport(
        targetZoom,
        targetPan,
        options.bounds,
        targetFocus,
        viewport,
        composition,
        spec,
        options.overviewHull
      );
      const beforeAnchor = intersectRealmGroundAtViewportPoint(
        beforePose,
        localX,
        localY,
        viewport
      );
      const preliminaryPose = deriveRealmCameraPoseForViewport(
        nextZoom,
        targetPan,
        options.bounds,
        targetFocus,
        viewport,
        composition,
        spec,
        options.overviewHull
      );
      const basePan = clampRealmPan(
        targetPan,
        options.bounds,
        nextZoom,
        preliminaryPose.visibleHalfHeight * (preliminaryPose.safeViewport.height / height),
        preliminaryPose.safeViewport.aspect,
        spec.panMargin
      );
      const afterPose = deriveRealmCameraPoseForViewport(
        nextZoom,
        basePan,
        options.bounds,
        targetFocus,
        viewport,
        composition,
        spec,
        options.overviewHull
      );
      const afterAnchor = intersectRealmGroundAtViewportPoint(
        afterPose,
        localX,
        localY,
        viewport
      );
      targetZoom = nextZoom;
      targetPan = basePan;
      if (beforeAnchor && afterAnchor) {
        const desiredShift = {
          x: beforeAnchor.x - afterAnchor.x,
          z: beforeAnchor.z - afterAnchor.z
        };
        const shiftedPan = clampRealmPan(
          {
            x: basePan.x + desiredShift.x,
            z: basePan.z + desiredShift.z
          },
          options.bounds,
          nextZoom,
          afterPose.visibleHalfHeight * (afterPose.safeViewport.height / height),
          afterPose.safeViewport.aspect,
          spec.panMargin
        );
        const actualShift = {
          x: shiftedPan.x - basePan.x,
          z: shiftedPan.z - basePan.z
        };
        targetPan = shiftedPan;
        if (Math.abs(actualShift.x) > 0.000001 || Math.abs(actualShift.z) > 0.000001) {
          targetFocusIsKeep = false;
          targetFocus = {
            ...targetFocus,
            x: targetFocus.x + actualShift.x,
            z: targetFocus.z + actualShift.z
          };
        }
      }
      invalidate();
    },
    zoomByWheel: (deltaY, deltaMode) => {
      const normalized = normalizeWheelDelta(deltaY, deltaMode, height);
      setZoomTarget(clampRealmInteractiveZoom(
        targetZoom,
        targetZoom - normalized * 0.00072
      ));
    }
  };
}
