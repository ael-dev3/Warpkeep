import * as THREE from 'three';

import type { TerrainBounds } from './createTerrainGeometry';

export type RealmCameraMode = 'realm' | 'approach' | 'keep';

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
}>;

export const DEFAULT_REALM_CAMERA_SPEC: RealmCameraSpec = {
  overviewFov: 20,
  closeFov: 42,
  overviewPitchDegrees: 48,
  closePitchDegrees: 27,
  azimuthDegrees: 43,
  closeHalfHeight: 1.62,
  focusStart: 0.2,
  focusEnd: 0.8,
  zoomDamping: 10,
  panDamping: 13,
  panMargin: 0.72,
  fogNear: 28,
  fogFar: 58
};

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

const OVERVIEW_FIT_MARGIN = 1.02;

export function dampingAlpha(rate: number, deltaSeconds: number) {
  return 1 - Math.exp(-Math.max(0, finite(rate, 0)) * clamp(finite(deltaSeconds, 0), 0, 0.1));
}

export function normalizeWheelDelta(deltaY: number, deltaMode: number, viewportHeight: number) {
  const safeDelta = finite(deltaY, 0);
  if (deltaMode === 1) return safeDelta * 16;
  if (deltaMode === 2) return safeDelta * Math.max(1, finite(viewportHeight, 720));
  return safeDelta;
}

export function fitRealmOverview(
  bounds: TerrainBounds,
  aspect: number,
  pitchDegrees = DEFAULT_REALM_CAMERA_SPEC.overviewPitchDegrees,
  azimuthDegrees = DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees
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
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
  let maxRight = 0;
  let maxUp = 0;

  [bounds.minX, bounds.maxX].forEach((x) => {
    [bounds.minY, bounds.maxY + 1.4].forEach((y) => {
      [bounds.minZ, bounds.maxZ].forEach((z) => {
        const offset = { x: x - center.x, y: y - center.y, z: z - center.z };
        maxRight = Math.max(maxRight, Math.abs(offset.x * right.x + offset.y * right.y + offset.z * right.z));
        maxUp = Math.max(maxUp, Math.abs(offset.x * up.x + offset.y * up.y + offset.z * up.z));
      });
    });
  });
  return Math.max(
    2,
    maxUp * OVERVIEW_FIT_MARGIN,
    (maxRight * OVERVIEW_FIT_MARGIN) / safeAspect
  );
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

export function deriveRealmCameraPose(
  zoomInput: number,
  panInput: RealmCameraPan,
  bounds: TerrainBounds,
  keep: RealmKeepFocus,
  aspectInput: number,
  spec: RealmCameraSpec = DEFAULT_REALM_CAMERA_SPEC
): RealmCameraPose {
  const zoom = clamp(finite(zoomInput, 0), 0, 1);
  const aspect = Math.max(0.35, finite(aspectInput, 16 / 9));
  const curve = smootherstep(zoom);
  const focusBlend = smootherstep(
    (zoom - spec.focusStart) / Math.max(0.001, spec.focusEnd - spec.focusStart)
  );
  const overviewHalfHeight = fitRealmOverview(
    bounds,
    aspect,
    spec.overviewPitchDegrees,
    spec.azimuthDegrees
  );
  const closeHalfHeight = Math.max(
    spec.closeHalfHeight,
    (Math.max(0.001, finite(keep.footprintDiameter, 1.48)) * 0.55) / aspect
  );
  const visibleHalfHeight = geometricLerp(overviewHalfHeight, closeHalfHeight, curve);
  const clampedPan = clampRealmPan(panInput, bounds, zoom, visibleHalfHeight, aspect, spec.panMargin);
  const fov = lerp(spec.overviewFov, spec.closeFov, curve);
  const pitchDegrees = lerp(spec.overviewPitchDegrees, spec.closePitchDegrees, curve);
  const distance = visibleHalfHeight / Math.tan(radians(fov) / 2);
  const target = {
    x: lerp(clampedPan.x, keep.x, focusBlend),
    y: lerp(0, keep.y + keep.height * 0.38, focusBlend),
    z: lerp(clampedPan.z, keep.z, focusBlend)
  };
  const pitch = radians(pitchDegrees);
  const azimuth = radians(spec.azimuthDegrees);
  const horizontalDistance = Math.cos(pitch) * distance;
  const position = {
    x: target.x + Math.sin(azimuth) * horizontalDistance,
    y: target.y + Math.sin(pitch) * distance,
    z: target.z + Math.cos(azimuth) * horizontalDistance
  };
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const overviewFogNear = Math.max(spec.fogNear, distance - span * 0.2);
  const overviewFogFar = Math.max(spec.fogFar, distance + span * 1.28);
  const fogNear = lerp(overviewFogNear, 8, curve);
  const fogFar = Math.max(fogNear + 6, lerp(overviewFogFar, 22, curve));
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
    mode: zoom < 0.24 ? 'realm' : zoom < 0.76 ? 'approach' : 'keep'
  };
}

export type RealmCameraController = Readonly<{
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  focusKeep: () => void;
  getMode: () => RealmCameraMode;
  getZoom: () => number;
  panByPixels: (deltaX: number, deltaY: number) => void;
  recenterKeep: () => void;
  setKeepFocus: (focus: RealmKeepFocus) => void;
  setViewport: (width: number, height: number) => void;
  showRealm: () => void;
  zoomBy: (amount: number) => void;
  zoomByWheel: (deltaY: number, deltaMode: number) => void;
}>;

export type CreateRealmCameraControllerOptions = Readonly<{
  bounds: TerrainBounds;
  keepFocus: RealmKeepFocus;
  fog: THREE.Fog;
  reducedMotion: boolean;
  render: () => void;
  onModeChange?: (mode: RealmCameraMode) => void;
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
  let keepFocus = { ...options.keepFocus };
  let previousTime = 0;
  let frame = 0;
  let disposed = false;
  let mode: RealmCameraMode = 'realm';

  const applyPose = () => {
    const pose = deriveRealmCameraPose(
      currentZoom,
      currentPan,
      options.bounds,
      keepFocus,
      width / Math.max(1, height),
      spec
    );
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
    applyPose();
    options.render();
  };

  const isUnsettled = () => Math.abs(currentZoom - targetZoom) > 0.0004
    || Math.abs(currentPan.x - targetPan.x) > 0.001
    || Math.abs(currentPan.z - targetPan.z) > 0.001;

  const tick = (time: number) => {
    frame = 0;
    if (disposed || document.hidden) return;
    const deltaSeconds = previousTime > 0 ? Math.min(0.1, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    const zoomAlpha = dampingAlpha(spec.zoomDamping, deltaSeconds);
    const panAlpha = dampingAlpha(spec.panDamping, deltaSeconds);
    currentZoom = lerp(currentZoom, targetZoom, zoomAlpha);
    currentPan = {
      x: lerp(currentPan.x, targetPan.x, panAlpha),
      z: lerp(currentPan.z, targetPan.z, panAlpha)
    };
    const unsettled = isUnsettled();
    if (!unsettled) {
      currentZoom = targetZoom;
      currentPan = { ...targetPan };
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
    targetPan = clampRealmPan(
      targetPan,
      options.bounds,
      targetZoom,
      deriveRealmCameraPose(targetZoom, targetPan, options.bounds, keepFocus, width / height, spec).visibleHalfHeight,
      width / height,
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
    focusKeep: () => {
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      setZoomTarget(1);
    },
    getMode: () => mode,
    getZoom: () => targetZoom,
    panByPixels: (deltaX, deltaY) => {
      const pose = deriveRealmCameraPose(
        targetZoom,
        targetPan,
        options.bounds,
        keepFocus,
        width / Math.max(1, height),
        spec
      );
      const worldPerPixel = (pose.visibleHalfHeight * 2) / Math.max(1, height);
      const azimuth = radians(spec.azimuthDegrees);
      targetPan = clampRealmPan({
        x: targetPan.x - Math.cos(azimuth) * deltaX * worldPerPixel
          - Math.sin(azimuth) * deltaY * worldPerPixel,
        z: targetPan.z + Math.sin(azimuth) * deltaX * worldPerPixel
          - Math.cos(azimuth) * deltaY * worldPerPixel
      }, options.bounds, targetZoom, pose.visibleHalfHeight, width / Math.max(1, height), spec.panMargin);
      invalidate();
    },
    recenterKeep: () => {
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      invalidate();
    },
    setKeepFocus: (next) => {
      keepFocus = { ...next };
      invalidate();
    },
    setViewport: (nextWidth, nextHeight) => {
      width = Math.max(1, finite(nextWidth, 1));
      height = Math.max(1, finite(nextHeight, 1));
      targetPan = clampRealmPan(
        targetPan,
        options.bounds,
        targetZoom,
        deriveRealmCameraPose(targetZoom, targetPan, options.bounds, keepFocus, width / height, spec).visibleHalfHeight,
        width / height,
        spec.panMargin
      );
      const currentPose = deriveRealmCameraPose(
        currentZoom,
        currentPan,
        options.bounds,
        keepFocus,
        width / height,
        spec
      );
      currentPan = clampRealmPan(
        currentPan,
        options.bounds,
        currentZoom,
        currentPose.visibleHalfHeight,
        width / height,
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
      targetPan = { x: keepFocus.x, z: keepFocus.z };
      setZoomTarget(0);
    },
    zoomBy: (amount) => setZoomTarget(targetZoom + finite(amount, 0)),
    zoomByWheel: (deltaY, deltaMode) => {
      const normalized = normalizeWheelDelta(deltaY, deltaMode, height);
      setZoomTarget(targetZoom - normalized * 0.00072);
    }
  };
}
