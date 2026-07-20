import * as THREE from 'three';

import { hexKey, worldToNearestAxial } from '../../game/map/hexCoordinates';
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

export type RealmCameraNavigationBoundary = Readonly<{
  maximumCenterHexRadius: number;
  hexSize: number;
  blockedCenterCellKeys?: ReadonlySet<string>;
}>;

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
 * Realm preset below the floor moves inward continuously, rather than turning
 * the first trackpad tick into a hard jump to the floor. Outward input cannot
 * move that explicit pose farther away.
 */
export function clampRealmInteractiveZoom(
  currentInput: number,
  nextInput: number,
  minimumInput = REALM_INTERACTIVE_MIN_ZOOM
) {
  const current = clamp(finite(currentInput, 0), 0, 1);
  const next = clamp(finite(nextInput, current), 0, 1);
  const minimum = clamp(finite(minimumInput, REALM_INTERACTIVE_MIN_ZOOM), 0, 1);
  if (current < minimum) return next <= current ? current : next;
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
  viewportInput: RealmCameraViewport = pose.viewport,
  planeYInput = 0
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
  const planeY = finite(planeYInput, 0);
  const distance = (planeY - pose.position.y) / ray.y;
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const point = {
    x: pose.position.x + ray.x * distance,
    y: planeY,
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
  _zoom: number,
  visibleHalfHeight: number,
  aspect: number,
  margin = DEFAULT_REALM_CAMERA_SPEC.panMargin
): RealmCameraPan {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const halfSpanX = (bounds.maxX - bounds.minX) / 2;
  const halfSpanZ = (bounds.maxZ - bounds.minZ) / 2;
  const visibleHalfWidth = Math.max(0, visibleHalfHeight * Math.max(0.35, aspect));
  // The viewport footprint already provides the correct zoom-sensitive
  // boundary. Multiplying that boundary by zoom used to pin the strategic
  // overview to the world origin, which made the coast and ocean unreachable
  // until the player zoomed in first. Keep the same fog/terrain envelope at
  // every zoom level and let the visible footprint be the sole clamp.
  const maxX = Math.max(0, halfSpanX - visibleHalfWidth * 0.48) + margin;
  const maxZ = Math.max(0, halfSpanZ - visibleHalfHeight * 0.5) + margin;
  return {
    x: clamp(finite(pan.x, centerX), centerX - maxX, centerX + maxX),
    z: clamp(finite(pan.z, centerZ), centerZ - maxZ, centerZ + maxZ)
  };
}

function isBlockedRealmCameraCenter(
  pan: RealmCameraPan,
  boundary: RealmCameraNavigationBoundary
) {
  return boundary.blockedCenterCellKeys?.has(hexKey(
    worldToNearestAxial(pan, boundary.hexSize)
  )) === true;
}

/** Clamp a planar camera center to the exact non-full-fog ocean contour. */
export function clampRealmPanToHexBoundary(
  pan: RealmCameraPan,
  boundary: RealmCameraNavigationBoundary | undefined
): RealmCameraPan {
  if (
    !boundary
    || !Number.isFinite(boundary.maximumCenterHexRadius)
    || boundary.maximumCenterHexRadius <= 0
    || !Number.isFinite(boundary.hexSize)
    || boundary.hexSize <= 0
  ) return pan;
  const x = finite(pan.x, 0);
  const z = finite(pan.z, 0);
  const r = (z * 2) / (boundary.hexSize * 3);
  const q = x / (boundary.hexSize * Math.sqrt(3)) - r * 0.5;
  const s = -q - r;
  const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  const radialScale = distance <= boundary.maximumCenterHexRadius + 1e-9
    ? 1
    : boundary.maximumCenterHexRadius / Math.max(distance, 0.000001);
  const radial = { x: x * radialScale, z: z * radialScale };
  if (!isBlockedRealmCameraCenter(radial, boundary)) return radial;

  // Full-fog cells follow the coast but are not a perfect axial ring. Search
  // the request ray for the last exact non-blocked center rather than using a
  // global radius that admits recessed full-fog cells such as -63,0.
  let allowedScale = 0;
  let blockedScale = radialScale;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const candidateScale = (allowedScale + blockedScale) * 0.5;
    const candidate = { x: x * candidateScale, z: z * candidateScale };
    if (isBlockedRealmCameraCenter(candidate, boundary)) blockedScale = candidateScale;
    else allowedScale = candidateScale;
  }
  const clamped = { x: x * allowedScale, z: z * allowedScale };
  if (!isBlockedRealmCameraCenter(clamped, boundary)) return clamped;
  return { x: 0, z: 0 };
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
  beginDirectManipulation: () => void;
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  endDirectManipulation: () => void;
  frameAt: (focus: RealmKeepFocus, zoom: number) => void;
  focusAt: (focus: RealmKeepFocus) => void;
  focusKeep: () => void;
  getMode: () => RealmCameraMode;
  getPose: () => RealmCameraPose;
  getSafeViewport: () => RealmSafeViewport;
  getZoom: () => number;
  manipulateViewport: (
    previousLocalX: number,
    previousLocalY: number,
    localX: number,
    localY: number,
    zoomAmount?: number
  ) => void;
  panBetweenViewportPoints: (
    previousLocalX: number,
    previousLocalY: number,
    localX: number,
    localY: number
  ) => void;
  panByPixels: (deltaX: number, deltaY: number) => void;
  projectPoint: (point: RealmCameraPoint) => RealmScreenProjection;
  recenterKeep: () => void;
  restorePose?: (pose: Readonly<{
    position: RealmCameraPoint;
    target: RealmCameraPoint;
    fov: number;
  }>) => void;
  setComposition: (composition: RealmCameraComposition) => void;
  setKeepFocus: (focus: RealmKeepFocus) => void;
  setViewport: (width: number, height: number) => void;
  showRealm: () => void;
  zoomBy: (amount: number) => void;
  zoomByAt: (amount: number, localX: number, localY: number) => void;
  zoomByWheel: (
    deltaY: number,
    deltaMode: number,
    localX?: number,
    localY?: number
  ) => void;
  zoomByWheelAtWorld: (
    deltaY: number,
    deltaMode: number,
    worldAnchor: RealmCameraPoint,
    localX: number,
    localY: number
  ) => void;
}>;

export type CreateRealmCameraControllerOptions = Readonly<{
  bounds: TerrainBounds;
  navigationBoundary?: RealmCameraNavigationBoundary;
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
  let manualPlanarControl = false;
  let directManipulation = false;
  let zoomAnchor: Readonly<{
    localX: number;
    localY: number;
    world: RealmCameraPoint;
  }> | null = null;
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

  const deriveStatePose = (
    zoom: number,
    pan: RealmCameraPan,
    focus: RealmKeepFocus,
    composition: RealmCompositionState
  ) => deriveRealmCameraPoseForViewport(
    zoom,
    pan,
    options.bounds,
    focus,
    { width, height },
    stateComposition(composition),
    spec,
    options.overviewHull
  );

  const clampPlanarState = (
    zoom: number,
    pan: RealmCameraPan,
    focus: RealmKeepFocus,
    composition: RealmCompositionState
  ) => {
    const pose = deriveStatePose(zoom, pan, focus, composition);
    const rectangularPan = clampRealmPan(
      pan,
      options.bounds,
      zoom,
      pose.visibleHalfHeight * (pose.safeViewport.height / height),
      pose.safeViewport.aspect,
      spec.panMargin
    );
    const clampedPan = clampRealmPanToHexBoundary(
      rectangularPan,
      options.navigationBoundary
    );
    const delta = {
      x: clampedPan.x - pan.x,
      z: clampedPan.z - pan.z
    };
    return {
      pan: clampedPan,
      focus: {
        ...focus,
        x: focus.x + delta.x,
        z: focus.z + delta.z
      }
    };
  };

  const anchorPlanarState = (
    zoom: number,
    pan: RealmCameraPan,
    focus: RealmKeepFocus,
    composition: RealmCompositionState,
    anchor: RealmCameraPoint,
    localX: number,
    localY: number
  ) => {
    const pose = deriveStatePose(zoom, pan, focus, composition);
    const projectedAnchor = intersectRealmGroundAtViewportPoint(
      pose,
      localX,
      localY,
      { width, height },
      anchor.y
    );
    if (!projectedAnchor) return { pan, focus };
    const requestedPan = {
      x: pan.x + anchor.x - projectedAnchor.x,
      z: pan.z + anchor.z - projectedAnchor.z
    };
    const rectangularPan = clampRealmPan(
      requestedPan,
      options.bounds,
      zoom,
      pose.visibleHalfHeight * (pose.safeViewport.height / height),
      pose.safeViewport.aspect,
      spec.panMargin
    );
    const clampedPan = clampRealmPanToHexBoundary(
      rectangularPan,
      options.navigationBoundary
    );
    const actualShift = {
      x: clampedPan.x - pan.x,
      z: clampedPan.z - pan.z
    };
    return {
      pan: clampedPan,
      focus: {
        ...focus,
        x: focus.x + actualShift.x,
        z: focus.z + actualShift.z
      }
    };
  };

  const detachSemanticFocus = () => {
    if (manualPlanarControl) return;
    const targetPose = deriveStatePose(
      targetZoom,
      targetPan,
      targetFocus,
      targetComposition
    );
    currentPan = { x: lastPose.focus.x, z: lastPose.focus.z };
    currentFocus = {
      ...currentFocus,
      x: lastPose.focus.x,
      z: lastPose.focus.z
    };
    targetPan = { x: targetPose.focus.x, z: targetPose.focus.z };
    targetFocus = {
      ...targetFocus,
      x: targetPose.focus.x,
      z: targetPose.focus.z
    };
    targetFocusIsKeep = false;
    manualPlanarControl = true;
  };

  const settleImmediately = () => {
    currentZoom = targetZoom;
    currentPan = { ...targetPan };
    currentFocus = { ...targetFocus };
    currentComposition = { ...targetComposition };
    zoomAnchor = null;
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
    if (zoomAnchor) {
      const anchored = anchorPlanarState(
        currentZoom,
        currentPan,
        currentFocus,
        currentComposition,
        zoomAnchor.world,
        zoomAnchor.localX,
        zoomAnchor.localY
      );
      currentPan = anchored.pan;
      currentFocus = anchored.focus;
    }
    const unsettled = isUnsettled();
    if (!unsettled) {
      currentZoom = targetZoom;
      currentPan = { ...targetPan };
      currentFocus = { ...targetFocus };
      currentComposition = { ...targetComposition };
      zoomAnchor = null;
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
    zoomAnchor = null;
    targetZoom = clamp(next, 0, 1);
    const clamped = clampPlanarState(
      targetZoom,
      targetPan,
      targetFocus,
      targetComposition
    );
    targetPan = clamped.pan;
    targetFocus = clamped.focus;
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

  const beginDirectManipulation = () => {
    if (disposed || directManipulation) return;
    detachSemanticFocus();
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    targetZoom = currentZoom;
    targetPan = { ...currentPan };
    targetFocus = { ...currentFocus };
    zoomAnchor = null;
    directManipulation = true;
  };

  const endDirectManipulation = () => {
    if (!directManipulation) return;
    directManipulation = false;
    if (isUnsettled()) invalidate();
  };

  const applyPanBetweenViewportPoints = (
    previousLocalX: number,
    previousLocalY: number,
    localX: number,
    localY: number
  ) => {
    const pose = deriveStatePose(
      currentZoom,
      currentPan,
      currentFocus,
      currentComposition
    );
    const previousGround = intersectRealmGroundAtViewportPoint(
      pose,
      previousLocalX,
      previousLocalY,
      { width, height }
    );
    const nextGround = intersectRealmGroundAtViewportPoint(
      pose,
      localX,
      localY,
      { width, height }
    );
    let shift: RealmCameraPan;
    if (previousGround && nextGround) {
      shift = {
        x: previousGround.x - nextGround.x,
        z: previousGround.z - nextGround.z
      };
    } else {
      const worldPerPixel = (pose.visibleHalfHeight * 2) / Math.max(1, height);
      const deltaX = finite(localX, 0) - finite(previousLocalX, 0);
      const deltaY = finite(localY, 0) - finite(previousLocalY, 0);
      const azimuth = radians(spec.azimuthDegrees);
      shift = {
        x: -Math.cos(azimuth) * deltaX * worldPerPixel
          - Math.sin(azimuth) * deltaY * worldPerPixel,
        z: Math.sin(azimuth) * deltaX * worldPerPixel
          - Math.cos(azimuth) * deltaY * worldPerPixel
      };
    }
    if (Math.abs(shift.x) <= 0.000001 && Math.abs(shift.z) <= 0.000001) return false;
    const clamped = clampPlanarState(
      currentZoom,
      { x: currentPan.x + shift.x, z: currentPan.z + shift.z },
      {
        ...currentFocus,
        x: currentFocus.x + shift.x,
        z: currentFocus.z + shift.z
      },
      currentComposition
    );
    currentPan = clamped.pan;
    currentFocus = clamped.focus;
    targetPan = { ...currentPan };
    targetFocus = { ...currentFocus };
    zoomAnchor = null;
    return true;
  };

  const panBetweenViewportPoints = (
    previousLocalX: number,
    previousLocalY: number,
    localX: number,
    localY: number
  ) => {
    if (disposed) return;
    if (!directManipulation) beginDirectManipulation();
    if (!applyPanBetweenViewportPoints(previousLocalX, previousLocalY, localX, localY)) return;
    applyPose();
    options.render();
  };

  const zoomAt = (
    amount: number,
    localXInput: number,
    localYInput: number,
    worldAnchor?: RealmCameraPoint,
    renderDirect = true
  ) => {
    if (disposed) return false;
    detachSemanticFocus();
    const nextZoom = clampRealmInteractiveZoom(
      targetZoom,
      targetZoom + finite(amount, 0)
    );
    if (Math.abs(nextZoom - targetZoom) <= 0.000001) return false;
    const localX = clamp(finite(localXInput, width * 0.5), 0, width);
    const localY = clamp(finite(localYInput, height * 0.5), 0, height);
    const visibleAnchor = worldAnchor
      && Number.isFinite(worldAnchor.x)
      && Number.isFinite(worldAnchor.y)
      && Number.isFinite(worldAnchor.z)
      ? { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z }
      : intersectRealmGroundAtViewportPoint(
          directManipulation
            ? deriveStatePose(currentZoom, currentPan, currentFocus, currentComposition)
            : lastPose,
          localX,
          localY,
          { width, height }
        );
    targetZoom = nextZoom;
    const clamped = clampPlanarState(
      targetZoom,
      targetPan,
      targetFocus,
      targetComposition
    );
    targetPan = clamped.pan;
    targetFocus = clamped.focus;
    if (visibleAnchor) {
      const anchored = anchorPlanarState(
        targetZoom,
        targetPan,
        targetFocus,
        targetComposition,
        visibleAnchor,
        localX,
        localY
      );
      targetPan = anchored.pan;
      targetFocus = anchored.focus;
      zoomAnchor = Object.freeze({
        localX,
        localY,
        world: Object.freeze({ ...visibleAnchor })
      });
    } else {
      zoomAnchor = null;
    }
    if (directManipulation) {
      currentZoom = targetZoom;
      currentPan = { ...targetPan };
      currentFocus = { ...targetFocus };
      zoomAnchor = null;
      if (renderDirect) {
        applyPose();
        options.render();
      }
      return true;
    }
    invalidate();
    return true;
  };

  const manipulateViewport = (
    previousLocalX: number,
    previousLocalY: number,
    localX: number,
    localY: number,
    zoomAmount = 0
  ) => {
    if (disposed) return;
    if (!directManipulation) beginDirectManipulation();
    const panned = applyPanBetweenViewportPoints(
      previousLocalX,
      previousLocalY,
      localX,
      localY
    );
    const zoomed = Math.abs(finite(zoomAmount, 0)) > 0.000001
      && zoomAt(zoomAmount, localX, localY, undefined, false);
    if (!panned && !zoomed) return;
    applyPose();
    options.render();
  };

  return {
    beginDirectManipulation,
    camera,
    dispose: () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', handleVisibility);
    },
    endDirectManipulation,
    frameAt: (next, zoom) => {
      directManipulation = false;
      manualPlanarControl = false;
      targetFocusIsKeep = false;
      targetFocus = normalizeKeepFocus(next, targetFocus);
      targetPan = { x: targetFocus.x, z: targetFocus.z };
      setZoomTarget(zoom);
    },
    focusAt: (next) => {
      directManipulation = false;
      manualPlanarControl = false;
      targetFocusIsKeep = false;
      targetFocus = normalizeKeepFocus(next, targetFocus);
      targetPan = { x: targetFocus.x, z: targetFocus.z };
      setZoomTarget(1);
    },
    focusKeep: () => {
      directManipulation = false;
      manualPlanarControl = false;
      targetFocusIsKeep = true;
      targetFocus = { ...keepFocus };
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      setZoomTarget(1);
    },
    getMode: () => mode,
    getPose: () => lastPose,
    getSafeViewport: () => lastPose.safeViewport,
    getZoom: () => targetZoom,
    manipulateViewport,
    panBetweenViewportPoints,
    panByPixels: (deltaX, deltaY) => {
      detachSemanticFocus();
      const pose = deriveStatePose(
        targetZoom,
        targetPan,
        targetFocus,
        targetComposition
      );
      const worldPerPixel = (pose.visibleHalfHeight * 2) / Math.max(1, height);
      const azimuth = radians(spec.azimuthDegrees);
      const requestedShift = {
        x: -Math.cos(azimuth) * deltaX * worldPerPixel
          - Math.sin(azimuth) * deltaY * worldPerPixel,
        z: Math.sin(azimuth) * deltaX * worldPerPixel
          - Math.cos(azimuth) * deltaY * worldPerPixel
      };
      const clamped = clampPlanarState(
        targetZoom,
        {
          x: targetPan.x + requestedShift.x,
          z: targetPan.z + requestedShift.z
        },
        {
          ...targetFocus,
          x: targetFocus.x + requestedShift.x,
          z: targetFocus.z + requestedShift.z
        },
        targetComposition
      );
      targetPan = clamped.pan;
      targetFocus = clamped.focus;
      invalidate();
    },
    projectPoint: (point) => projectRealmPointToViewport(lastPose, point, { width, height }),
    recenterKeep: () => {
      directManipulation = false;
      manualPlanarControl = false;
      targetFocusIsKeep = true;
      targetFocus = { ...keepFocus };
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      zoomAnchor = null;
      invalidate();
    },
    restorePose: (pose) => {
      if (disposed) return;
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      targetVector.set(pose.target.x, pose.target.y, pose.target.z);
      camera.fov = clamp(finite(pose.fov, camera.fov), 1, 120);
      camera.lookAt(targetVector);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      options.render();
    },
    setComposition: (next) => {
      // Insets change the projection beneath a screen-space zoom anchor. Drop
      // the old anchor so the camera can converge on the newly composed target
      // instead of continuously correcting toward incompatible geometry.
      zoomAnchor = null;
      targetComposition = compositionState(next);
      invalidate();
    },
    setKeepFocus: (next) => {
      keepFocus = normalizeKeepFocus(next, keepFocus);
      if (targetFocusIsKeep) targetFocus = { ...keepFocus };
      invalidate();
    },
    setViewport: (nextWidth, nextHeight) => {
      // Pointer coordinates belong to the viewport that produced them. A
      // resize invalidates that coordinate space; retaining the old anchor can
      // otherwise keep demand rendering alive indefinitely.
      zoomAnchor = null;
      width = Math.max(1, finite(nextWidth, 1));
      height = Math.max(1, finite(nextHeight, 1));
      const nextTarget = clampPlanarState(
        targetZoom,
        targetPan,
        targetFocus,
        targetComposition
      );
      targetPan = nextTarget.pan;
      targetFocus = nextTarget.focus;
      const nextCurrent = clampPlanarState(
        currentZoom,
        currentPan,
        currentFocus,
        currentComposition
      );
      currentPan = nextCurrent.pan;
      currentFocus = nextCurrent.focus;
      if (options.reducedMotion) settleImmediately();
      else {
        applyPose();
        options.render();
        if (isUnsettled()) invalidate();
      }
    },
    showRealm: () => {
      directManipulation = false;
      manualPlanarControl = false;
      targetFocusIsKeep = false;
      const center = {
        x: (options.bounds.minX + options.bounds.maxX) * 0.5,
        z: (options.bounds.minZ + options.bounds.maxZ) * 0.5
      };
      targetFocus = { ...keepFocus, x: center.x, z: center.z };
      targetPan = center;
      setZoomTarget(0);
    },
    zoomBy: (amount) => zoomAt(amount, width * 0.5, height * 0.5),
    zoomByAt: zoomAt,
    zoomByWheel: (deltaY, deltaMode, localX = width * 0.5, localY = height * 0.5) => {
      const normalized = normalizeWheelDelta(deltaY, deltaMode, height);
      zoomAt(-normalized * 0.00072, localX, localY);
    },
    zoomByWheelAtWorld: (deltaY, deltaMode, worldAnchor, localX, localY) => {
      const normalized = normalizeWheelDelta(deltaY, deltaMode, height);
      zoomAt(-normalized * 0.00072, localX, localY, worldAnchor);
    }
  };
}
