import * as THREE from 'three';

import { axialToWorld, worldToNearestAxial, type HexCoord } from '../../game/map/hexCoordinates';
import { generateTerrainDecorations } from '../../game/map/terrainDecorations';
import { isPlayableRealmCoord, type RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import {
  createHegemonyCastlePlacements,
  type TerrainStructurePlacement
} from '../../game/map/terrainPlacements';
import { createTerrainDecorationLayers } from './createTerrainDecorations';
import { createTerrainGeometryData, pointyHexCorners } from './createTerrainGeometry';
import {
  DEFAULT_CASTLE_LOD_POLICY,
  type CastleLod,
  type CastleLodPolicy
} from './castleInstancePlanning';
import {
  createHegemonyKeepPrefabRepository,
  type HegemonyKeepPrefabLease
} from './hegemonyKeepPrefabRepository';
import {
  createRealmCastleInstanceLayer,
  type RealmCastleInstanceLayer,
  type RealmCastleInstanceRecord
} from './realmCastleInstanceLayer';
import {
  createRealmCameraController,
  DEFAULT_REALM_CAMERA_SPEC,
  type RealmCameraComposition,
  type RealmCameraMode
} from './realmCameraController';
import { realmCastleProjectionFrameKey } from './realmCastlePresentation';
import {
  REALM_LIGHTING_SPECS,
  resolveRealmPixelRatio,
  resolveRealmRenderPlan,
  type RealmQualitySpec
} from './realmQuality';
import type { KeepLoadStatus } from './realmTypes';
import type { RealmCastleProjectionFrame } from './realmTypes';

const HEX_SIZE = 1;
const OVERLAY_LIFT = 0.026;

export type RealmPeerCastleMarker = Readonly<{
  castleId: number;
  q: number;
  r: number;
}>;

export type RealmInteractionTarget =
  | Readonly<{ kind: 'castle'; castleId: number; coord: HexCoord }>
  | Readonly<{ kind: 'terrain'; coord: HexCoord }>;

export type RealmSceneHandle = Readonly<{
  dispose: () => void;
  focusCastle: (castleId: number) => void;
  focusCell: (coord: HexCoord) => void;
  frameFoundingDistrict: () => void;
  focusKeep: () => void;
  recenterKeep: () => void;
  setHovered: (coord: HexCoord | null) => void;
  setSelected: (coord: HexCoord | null) => void;
  setSelectedCastleId: (castleId: number | null) => void;
  setComposition: (composition: RealmCameraComposition) => void;
  showRealm: () => void;
}>;

export function foundingDistrictZoomForViewport(
  playableRadius: number,
  aspect: number
) {
  const radiusProgress = Math.min(1, Math.max(0, (playableRadius - 4) / 16));
  const narrowViewportAdjustment = Math.min(0.16, Math.max(0, 1 - aspect) * 0.34);
  return Math.min(0.54, Math.max(
    0.12,
    0.3 + radiusProgress * 0.24 - narrowViewportAdjustment
  ));
}

export type CreateRealmSceneOptions = Readonly<{
  canvas: HTMLCanvasElement;
  surface: RealmTerrainSurface;
  keepCoord: HexCoord;
  ownCastleId?: number;
  otherCastles: readonly RealmPeerCastleMarker[];
  quality: RealmQualitySpec;
  reducedMotion: boolean;
  baseUrl: string;
  /** Optional authoritative metadata boundary for camera navigation. */
  isCoordPassable?: (coord: HexCoord) => boolean;
  onCameraModeChange: (mode: RealmCameraMode) => void;
  /** @deprecated Prefer onTargetHover for castle identity-aware interaction. */
  onHover: (coord: HexCoord | null) => void;
  onTargetHover?: (target: RealmInteractionTarget | null) => void;
  onKeepStatusChange: (status: KeepLoadStatus) => void;
  /** Fired only after every authoritative castle has a real GLB instance. */
  onCastlesReady?: (castleCount: number) => void;
  onCastleProjection: (frame: RealmCastleProjectionFrame) => void;
  onRendererUnavailable: () => void;
  /** @deprecated Prefer onTargetSelect for castle identity-aware interaction. */
  onSelect: (coord: HexCoord) => void;
  onTargetSelect?: (target: RealmInteractionTarget) => void;
}>;

type PointerSample = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  originX: number;
  originY: number;
  dragged: boolean;
};

type RealmSceneCleanup = Readonly<{
  add: (dispose: () => void) => void;
  dispose: () => void;
  isDisposed: () => boolean;
}>;

function createRealmSceneCleanup(): RealmSceneCleanup {
  const disposers: Array<() => void> = [];
  let disposed = false;

  const safelyDispose = (dispose: () => void) => {
    try {
      dispose();
    } catch {
      // Cleanup must continue so one faulty browser or Three.js release path
      // cannot strand the remaining GPU resources or event listeners.
    }
  };

  return {
    add: (dispose) => {
      if (disposed) {
        safelyDispose(dispose);
        return;
      }
      disposers.push(dispose);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      while (disposers.length > 0) {
        const dispose = disposers.pop();
        if (dispose) safelyDispose(dispose);
      }
    },
    isDisposed: () => disposed
  };
}

function createTerrainGeometry(
  surface: RealmTerrainSurface,
  subdivisionsPerEdge: number,
  placements: readonly TerrainStructurePlacement[]
) {
  const data = createTerrainGeometryData(surface.renderMap, HEX_SIZE, {
    subdivisionsPerEdge,
    playableRadius: surface.playableMap.radius,
    placements
  });
  const geometry = new THREE.BufferGeometry();
  try {
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { data, geometry };
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

function createOverlay(color: THREE.ColorRepresentation, opacity: number) {
  const geometry = new THREE.BufferGeometry();
  let material: THREE.LineBasicMaterial | null = null;
  try {
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6 * 3), 3).setUsage(THREE.DynamicDrawUsage)
    );
    material = new THREE.LineBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    });
    const overlay = new THREE.LineLoop(geometry, material);
    overlay.frustumCulled = false;
    overlay.renderOrder = 4;
    overlay.visible = false;
    return overlay;
  } catch (error) {
    material?.dispose();
    geometry.dispose();
    throw error;
  }
}

function setOverlay(
  overlay: THREE.LineLoop,
  surface: RealmTerrainSurface,
  coord: HexCoord | null,
  placements: readonly TerrainStructurePlacement[]
) {
  if (!coord || !isPlayableRealmCoord(surface, coord)) {
    overlay.visible = false;
    return;
  }
  const corners = pointyHexCorners(coord, HEX_SIZE);
  const positions = overlay.geometry.getAttribute('position') as THREE.BufferAttribute;
  corners.forEach((corner, index) => {
    positions.setXYZ(
      index,
      corner.x,
      terrainHeightAtWorld(surface.renderMap, corner, HEX_SIZE, placements) + OVERLAY_LIFT,
      corner.z
    );
  });
  positions.needsUpdate = true;
  overlay.visible = true;
}

function disposeOverlay(overlay: THREE.LineLoop) {
  overlay.geometry.dispose();
  (overlay.material as THREE.Material).dispose();
}

function pointerDistance(first: PointerSample, second: PointerSample) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function activePinchDistance(pointers: ReadonlyMap<number, PointerSample>) {
  const iterator = pointers.values();
  const first = iterator.next().value;
  const second = iterator.next().value;
  return first && second ? pointerDistance(first, second) : 0;
}

function castleLodPolicyForQuality(quality: RealmQualitySpec): CastleLodPolicy {
  const maximumLod: CastleLod = quality.id === 'high'
    ? 'high'
    : quality.id === 'balanced' ? 'balanced' : 'compact';
  return Object.freeze({
    ...DEFAULT_CASTLE_LOD_POLICY,
    maximumLod,
    selectedMinimumLod: maximumLod,
    highInstanceBudget: maximumLod === 'high'
      ? DEFAULT_CASTLE_LOD_POLICY.highInstanceBudget
      : 0,
    balancedInstanceBudget: maximumLod === 'compact'
      ? 0
      : DEFAULT_CASTLE_LOD_POLICY.balancedInstanceBudget
  });
}

function castleLodsForQuality(quality: RealmQualitySpec): readonly CastleLod[] {
  if (quality.id === 'high') return ['compact', 'balanced', 'high'];
  if (quality.id === 'balanced') return ['compact', 'balanced'];
  return ['compact'];
}

export function createRealmScene(options: CreateRealmSceneOptions): RealmSceneHandle {
  const cleanup = createRealmSceneCleanup();
  try {
    return initializeRealmScene(options, cleanup);
  } catch (error) {
    cleanup.dispose();
    throw error;
  }
}

function initializeRealmScene(
  options: CreateRealmSceneOptions,
  cleanup: RealmSceneCleanup
): RealmSceneHandle {
  const renderPlan = resolveRealmRenderPlan(options.quality, {
    playableRadius: options.surface.playableMap.radius,
    renderRadius: options.surface.renderMap.radius,
    playableCellCount: options.surface.playableMap.cells.length,
    renderCellCount: options.surface.renderMap.cells.length
  });
  const runtimeQuality: RealmQualitySpec = {
    ...options.quality,
    dynamicShadows: renderPlan.dynamicShadows,
    shadowMapSize: renderPlan.shadowMapSize
  };
  const terrainPlacements = createHegemonyCastlePlacements([
    { id: 'own-keep', coord: options.keepCoord },
    ...options.otherCastles.map((castle) => ({
      id: `peer-castle-${castle.castleId}`,
      coord: { q: castle.q, r: castle.r }
    }))
  ]);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9498a6');
  const fog = new THREE.Fog('#9498a6', options.quality.fogNear, options.quality.fogFar);
  scene.fog = fog;

  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: options.quality.id !== 'reduced',
    alpha: false,
    powerPreference: 'high-performance'
  });
  cleanup.add(() => renderer.dispose());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const lighting = REALM_LIGHTING_SPECS[options.quality.id];
  renderer.toneMappingExposure = lighting.toneMappingExposure;
  renderer.shadowMap.enabled = renderPlan.dynamicShadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor('#9498a6', 1);

  const { data: terrainData, geometry: terrainGeometry } = createTerrainGeometry(
    options.surface,
    renderPlan.subdivisionsPerEdge,
    terrainPlacements
  );
  cleanup.add(() => terrainGeometry.dispose());
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    dithering: true
  });
  cleanup.add(() => terrainMaterial.dispose());
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'hegemony-lowlands-surface';
  terrain.receiveShadow = renderPlan.dynamicShadows;
  scene.add(terrain);

  const decorationData = generateTerrainDecorations(
    options.surface.renderMap,
    {
      ...renderPlan.decorationDensity,
      playableRadius: options.surface.playableMap.radius
    },
    HEX_SIZE,
    terrainPlacements
  );
  const decorations = createTerrainDecorationLayers(
    decorationData,
    options.surface.renderMap,
    runtimeQuality,
    HEX_SIZE,
    terrainPlacements
  );
  cleanup.add(decorations.dispose);
  scene.add(decorations.group);

  const hemisphere = new THREE.HemisphereLight('#ece9f4', '#332c3c', 0.84);
  const sun = new THREE.DirectionalLight('#ffddb0', lighting.sunIntensity);
  sun.position.set(-7.5, 13.5, 8.5);
  sun.castShadow = renderPlan.dynamicShadows;
  if (renderPlan.shadowMapSize > 0) {
    sun.shadow.mapSize.set(renderPlan.shadowMapSize, renderPlan.shadowMapSize);
    sun.shadow.camera.left = -renderPlan.shadowCameraHalfExtent;
    sun.shadow.camera.right = renderPlan.shadowCameraHalfExtent;
    sun.shadow.camera.top = renderPlan.shadowCameraHalfExtent;
    sun.shadow.camera.bottom = -renderPlan.shadowCameraHalfExtent;
    sun.shadow.camera.near = 0.4;
    sun.shadow.camera.far = 38;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.018;
  }
  const skyFill = new THREE.DirectionalLight('#a991d0', 0.56);
  skyFill.position.set(8, 6.5, -9);
  const neutralFill = new THREE.DirectionalLight('#d5d9e2', 0.24);
  neutralFill.position.set(-5, 4, -6);
  scene.add(hemisphere, sun, skyFill, neutralFill);

  const hoverOverlay = createOverlay('#f4df9a', 0.72);
  cleanup.add(() => disposeOverlay(hoverOverlay));
  const selectedOverlay = createOverlay('#fff1b8', 1);
  cleanup.add(() => disposeOverlay(selectedOverlay));
  scene.add(hoverOverlay, selectedOverlay);

  const keepWorld = axialToWorld(options.keepCoord, HEX_SIZE);
  const keepGroundY = terrainHeightAtWorld(
    options.surface.renderMap,
    keepWorld,
    HEX_SIZE,
    terrainPlacements
  );
  const authoritativeCastles: readonly RealmCastleInstanceRecord[] = [
    ...(options.ownCastleId === undefined ? [] : [Object.freeze({
      castleId: options.ownCastleId,
      coord: Object.freeze({ q: options.keepCoord.q, r: options.keepCoord.r }),
      x: keepWorld.x,
      groundY: keepGroundY,
      z: keepWorld.z
    })]),
    ...options.otherCastles.map((castle) => {
      const coord = Object.freeze({ q: castle.q, r: castle.r });
      const world = axialToWorld(coord, HEX_SIZE);
      return Object.freeze({
        castleId: castle.castleId,
        coord,
        x: world.x,
        groundY: terrainHeightAtWorld(
          options.surface.renderMap,
          world,
          HEX_SIZE,
          terrainPlacements
        ),
        z: world.z
      });
    })
  ];

  const castleLabelAnchors = authoritativeCastles.map((castle) => ({
    castleId: castle.castleId,
    q: castle.coord.q,
    r: castle.coord.r,
    x: castle.x,
    y: castle.groundY + 1.12,
    groundY: castle.groundY,
    z: castle.z
  }));

  let castleLayer: RealmCastleInstanceLayer | null = null;
  let selectedCastleId: number | undefined;
  let castleFocusSize: Readonly<{ height: number; footprintDiameter: number }> = Object.freeze({
    height: 1.08,
    footprintDiameter: 1.48
  });
  options.onKeepStatusChange(authoritativeCastles.length > 0 ? 'loading' : 'ready');

  let lastCastleProjectionKey = '';
  let renderPendingWhileHidden = false;
  const projectionPoint = new THREE.Vector3();
  const projectionBoundsPoint = new THREE.Vector3();
  const projectCastleBounds = (
    anchor: (typeof castleLabelAnchors)[number],
    width: number,
    height: number
  ) => {
    const halfFootprint = castleFocusSize.footprintDiameter * 0.5;
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const xOffset of [-halfFootprint, halfFootprint]) {
      for (const yOffset of [0, castleFocusSize.height]) {
        for (const zOffset of [-halfFootprint, halfFootprint]) {
          projectionBoundsPoint
            .set(anchor.x + xOffset, anchor.groundY + yOffset, anchor.z + zOffset)
            .project(cameraController.camera);
          const x = (projectionBoundsPoint.x * 0.5 + 0.5) * width;
          const y = (-projectionBoundsPoint.y * 0.5 + 0.5) * height;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    }
    return right > left && bottom > top ? { left, top, right, bottom } : undefined;
  };
  const projectCastleLabels = () => {
    const width = Math.max(1, options.canvas.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, options.canvas.clientHeight || window.innerHeight || 1);
    const castles = castleLabelAnchors.map((anchor) => {
      projectionPoint.set(anchor.x, anchor.y, anchor.z);
      const distance = projectionPoint.distanceTo(cameraController.camera.position);
      projectionPoint.project(cameraController.camera);
      const visible = projectionPoint.z >= -1
        && projectionPoint.z <= 1
        && projectionPoint.x >= -1.05
        && projectionPoint.x <= 1.05
        && projectionPoint.y >= -1.08
        && projectionPoint.y <= 1.08;
      return {
        castleId: anchor.castleId,
        q: anchor.q,
        r: anchor.r,
        x: (projectionPoint.x * 0.5 + 0.5) * width,
        y: (-projectionPoint.y * 0.5 + 0.5) * height,
        distance,
        castleBounds: visible ? projectCastleBounds(anchor, width, height) : undefined,
        visible
      };
    });
    const frame = { width, height, castles };
    const projectionKey = realmCastleProjectionFrameKey(frame);
    if (projectionKey === lastCastleProjectionKey) return;
    lastCastleProjectionKey = projectionKey;
    options.onCastleProjection(frame);
  };
  const render = () => {
    if (cleanup.isDisposed()) return;
    if (document.hidden) {
      renderPendingWhileHidden = true;
      return;
    }
    renderPendingWhileHidden = false;
    const viewportHeight = Math.max(
      1,
      options.canvas.clientHeight || window.innerHeight || 1
    );
    castleLayer?.update(
      cameraController.camera,
      viewportHeight,
      selectedCastleId
    );
    renderer.render(scene, cameraController.camera);
    projectCastleLabels();
  };
  const cameraController = createRealmCameraController({
    bounds: terrainData.bounds,
    keepFocus: {
      x: keepWorld.x,
      y: keepGroundY,
      z: keepWorld.z,
      height: 1.08,
      footprintDiameter: 1.48
    },
    fog,
    reducedMotion: options.reducedMotion,
    render,
    onModeChange: options.onCameraModeChange,
    spec: {
      ...DEFAULT_REALM_CAMERA_SPEC,
      fogNear: options.quality.fogNear,
      fogFar: options.quality.fogFar
    }
  });
  cleanup.add(cameraController.dispose);
  const handleRenderVisibility = () => {
    if (!document.hidden && renderPendingWhileHidden && !cleanup.isDisposed()) render();
  };
  document.addEventListener('visibilitychange', handleRenderVisibility);
  cleanup.add(() => document.removeEventListener('visibilitychange', handleRenderVisibility));

  const raycaster = new THREE.Raycaster();
  const normalizedPointer = new THREE.Vector2();
  const pointers = new Map<number, PointerSample>();
  let lastPinchDistance = 0;
  let pendingHoverPoint: Readonly<{ x: number; y: number }> | null = null;
  let hoverAnimationFrame = 0;
  let resizeObserver: ResizeObserver | null = null;
  cleanup.add(() => {
    if (hoverAnimationFrame !== 0) window.cancelAnimationFrame(hoverAnimationFrame);
    hoverAnimationFrame = 0;
    pendingHoverPoint = null;
    pointers.clear();
    lastPinchDistance = 0;
    delete options.canvas.dataset.dragging;
  });

  const dispatchHover = (target: RealmInteractionTarget | null) => {
    options.onTargetHover?.(target);
    options.onHover(target?.coord ?? null);
  };

  const dispatchSelect = (target: RealmInteractionTarget) => {
    options.onTargetSelect?.(target);
    options.onSelect(target.coord);
  };

  const pick = (clientX: number, clientY: number): RealmInteractionTarget | null => {
    const bounds = options.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    normalizedPointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1
    );
    raycaster.setFromCamera(normalizedPointer, cameraController.camera);
    // Castle identity is authoritative and must win even when the terrain is
    // geometrically closer at the base of a model.
    const castleHit = castleLayer?.raycast(raycaster);
    if (castleHit) {
      return Object.freeze({
        kind: 'castle',
        castleId: castleHit.castleId,
        coord: castleHit.coord
      });
    }
    const intersections = raycaster.intersectObject(terrain, false);
    for (const intersection of intersections) {
      const coord = worldToNearestAxial(
        { x: intersection.point.x, z: intersection.point.z },
        HEX_SIZE
      );
      if (isPlayableRealmCoord(options.surface, coord)) {
        return Object.freeze({ kind: 'terrain', coord });
      }
    }
    return null;
  };

  const cancelPendingHover = () => {
    pendingHoverPoint = null;
    if (hoverAnimationFrame === 0) return;
    window.cancelAnimationFrame(hoverAnimationFrame);
    hoverAnimationFrame = 0;
  };

  const scheduleHover = (clientX: number, clientY: number) => {
    pendingHoverPoint = { x: clientX, y: clientY };
    if (hoverAnimationFrame !== 0) return;
    hoverAnimationFrame = window.requestAnimationFrame(() => {
      hoverAnimationFrame = 0;
      const point = pendingHoverPoint;
      pendingHoverPoint = null;
      if (cleanup.isDisposed() || pointers.size > 0 || !point) return;
      dispatchHover(pick(point.x, point.y));
    });
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    event.preventDefault();
    options.canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      previousX: event.clientX,
      previousY: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      dragged: false
    });
    if (pointers.size > 1) {
      pointers.forEach((sample) => { sample.dragged = true; });
      lastPinchDistance = activePinchDistance(pointers);
    }
    cancelPendingHover();
    options.canvas.dataset.dragging = 'true';
    dispatchHover(null);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const sample = pointers.get(event.pointerId);
    if (!sample) {
      scheduleHover(event.clientX, event.clientY);
      return;
    }
    cancelPendingHover();
    event.preventDefault();
    sample.previousX = sample.x;
    sample.previousY = sample.y;
    sample.x = event.clientX;
    sample.y = event.clientY;
    if (Math.hypot(sample.x - sample.originX, sample.y - sample.originY) > 5) {
      sample.dragged = true;
    }
    if (pointers.size >= 2) {
      const nextDistance = activePinchDistance(pointers);
      if (lastPinchDistance > 0 && nextDistance > 0) {
        cameraController.zoomBy(Math.log(nextDistance / lastPinchDistance) * 0.78);
      }
      lastPinchDistance = nextDistance;
      return;
    }
    if (!sample.dragged) return;
    cameraController.panByPixels(
      sample.x - sample.previousX,
      sample.y - sample.previousY
    );
  };

  const finishPointer = (event: PointerEvent, cancelled: boolean) => {
    const sample = pointers.get(event.pointerId);
    const wasOnlyPointer = pointers.size === 1;
    pointers.delete(event.pointerId);
    if (options.canvas.hasPointerCapture?.(event.pointerId)) {
      options.canvas.releasePointerCapture?.(event.pointerId);
    }
    if (!cancelled && sample && wasOnlyPointer && !sample.dragged) {
      const picked = pick(event.clientX, event.clientY);
      if (picked) {
        selectedCastleId = picked.kind === 'castle' ? picked.castleId : undefined;
        dispatchSelect(picked);
        render();
        if (
          picked.kind === 'castle'
          && picked.castleId === options.ownCastleId
        ) {
          cameraController.focusKeep();
        }
      }
    }
    lastPinchDistance = activePinchDistance(pointers);
    if (pointers.size === 0) {
      delete options.canvas.dataset.dragging;
      if (cancelled) dispatchHover(null);
      else scheduleHover(event.clientX, event.clientY);
    }
  };

  const handlePointerUp = (event: PointerEvent) => finishPointer(event, false);
  const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
  const handlePointerLeave = () => {
    if (pointers.size === 0) {
      cancelPendingHover();
      dispatchHover(null);
    }
  };
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    cameraController.zoomByWheel(event.deltaY, event.deltaMode);
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (cleanup.isDisposed()) return;
    disposeScene();
    options.onRendererUnavailable();
  };

  options.canvas.addEventListener('pointerdown', handlePointerDown);
  cleanup.add(() => options.canvas.removeEventListener('pointerdown', handlePointerDown));
  options.canvas.addEventListener('pointermove', handlePointerMove);
  cleanup.add(() => options.canvas.removeEventListener('pointermove', handlePointerMove));
  options.canvas.addEventListener('pointerup', handlePointerUp);
  cleanup.add(() => options.canvas.removeEventListener('pointerup', handlePointerUp));
  options.canvas.addEventListener('pointercancel', handlePointerCancel);
  cleanup.add(() => options.canvas.removeEventListener('pointercancel', handlePointerCancel));
  options.canvas.addEventListener('pointerleave', handlePointerLeave);
  cleanup.add(() => options.canvas.removeEventListener('pointerleave', handlePointerLeave));
  options.canvas.addEventListener('wheel', handleWheel, { passive: false });
  cleanup.add(() => options.canvas.removeEventListener('wheel', handleWheel));
  options.canvas.addEventListener('webglcontextlost', handleContextLost);
  cleanup.add(() => options.canvas.removeEventListener('webglcontextlost', handleContextLost));

  const resize = () => {
    if (cleanup.isDisposed()) return;
    const width = Math.max(1, options.canvas.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, options.canvas.clientHeight || window.innerHeight || 1);
    renderer.setPixelRatio(resolveRealmPixelRatio(
      width,
      height,
      window.devicePixelRatio || 1,
      options.quality
    ));
    renderer.setSize(width, height, false);
    cameraController.setViewport(width, height);
  };
  resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  if (resizeObserver) cleanup.add(() => resizeObserver?.disconnect());
  resizeObserver?.observe(options.canvas);
  window.addEventListener('resize', resize);
  cleanup.add(() => window.removeEventListener('resize', resize));
  resize();

  const castleLodPolicy = castleLodPolicyForQuality(runtimeQuality);
  const usedCastleLods = castleLodsForQuality(runtimeQuality);
  const prefabRepository = createHegemonyKeepPrefabRepository({
    baseUrl: options.baseUrl,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
  });

  const releaseLeases = (leases: readonly HegemonyKeepPrefabLease[]) => {
    leases.forEach((lease) => {
      try {
        lease.release();
      } catch {
        // One faulty WebGL disposal must not strand the remaining shared LODs.
      }
    });
  };

  const initializeCastleInstances = async () => {
    if (authoritativeCastles.length === 0) {
      if (!cleanup.isDisposed()) {
        options.onCastlesReady?.(0);
        render();
      }
      return;
    }

    const leases: HegemonyKeepPrefabLease[] = [];
    let acquisitionStopped = false;
    try {
      await Promise.all(usedCastleLods.map(async (lod) => {
        try {
          const lease = await prefabRepository.acquire(lod);
          if (acquisitionStopped || cleanup.isDisposed()) {
            releaseLeases([lease]);
            return;
          }
          leases.push(lease);
        } catch (error) {
          acquisitionStopped = true;
          throw error;
        }
      }));
    } catch (error) {
      acquisitionStopped = true;
      releaseLeases(leases);
      throw error;
    }
    if (cleanup.isDisposed()) {
      releaseLeases(leases);
      return;
    }

    const prefabs = new Map(leases.map((lease) => [lease.prefab.lod, lease.prefab]));
    let nextLayer: RealmCastleInstanceLayer;
    try {
      nextLayer = createRealmCastleInstanceLayer({
        castles: authoritativeCastles,
        prefabs,
        policy: castleLodPolicy,
        dynamicShadows: renderPlan.dynamicShadows
      });
    } catch (error) {
      releaseLeases(leases);
      throw error;
    }
    if (cleanup.isDisposed()) {
      try {
        nextLayer.dispose();
      } finally {
        releaseLeases(leases);
      }
      return;
    }

    castleLayer = nextLayer;
    scene.add(nextLayer.group);
    let released = false;
    cleanup.add(() => {
      if (released) return;
      released = true;
      try {
        scene.remove(nextLayer.group);
      } finally {
        try {
          nextLayer.dispose();
        } finally {
          if (castleLayer === nextLayer) castleLayer = null;
          releaseLeases(leases);
        }
      }
    });

    const focusPrefab = prefabs.get(castleLodPolicy.maximumLod)
      ?? prefabs.get('compact');
    if (focusPrefab) {
      castleFocusSize = Object.freeze({
        height: focusPrefab.visualHeight,
        footprintDiameter: focusPrefab.footprintDiameter
      });
      cameraController.setKeepFocus({
        x: keepWorld.x,
        y: keepGroundY,
        z: keepWorld.z,
        height: focusPrefab.visualHeight,
        footprintDiameter: focusPrefab.footprintDiameter
      });
    }
    options.onKeepStatusChange('ready');
    if (cleanup.isDisposed()) return;
    options.onCastlesReady?.(authoritativeCastles.length);
    render();
  };

  void initializeCastleInstances().catch(() => {
    if (cleanup.isDisposed()) return;
    try {
      options.onKeepStatusChange('fallback');
    } catch {
      // Renderer fallback still has to engage when a status observer fails.
    }
    disposeScene();
    options.onRendererUnavailable();
  });

  function disposeScene() {
    cleanup.dispose();
  }

  return {
    dispose: disposeScene,
    focusCastle: (castleId) => {
      if (cleanup.isDisposed()) return;
      const castle = authoritativeCastles.find((candidate) => candidate.castleId === castleId);
      if (!castle) return;
      cameraController.focusAt({
        x: castle.x,
        y: castle.groundY,
        z: castle.z,
        height: castleFocusSize.height,
        footprintDiameter: castleFocusSize.footprintDiameter
      });
    },
    focusCell: (coord) => {
      if (cleanup.isDisposed() || !isPlayableRealmCoord(options.surface, coord)) return;
      try {
        if (options.isCoordPassable && !options.isCoordPassable(coord)) return;
      } catch {
        // Authoritative metadata uncertainty must never move the camera.
        return;
      }
      const world = axialToWorld(coord, HEX_SIZE);
      cameraController.focusAt({
        x: world.x,
        y: terrainHeightAtWorld(
          options.surface.renderMap,
          world,
          HEX_SIZE,
          terrainPlacements
        ),
        z: world.z,
        height: 0.18,
        footprintDiameter: 1.24
      });
    },
    frameFoundingDistrict: () => {
      cameraController.recenterKeep();
      const width = Math.max(1, options.canvas.clientWidth || window.innerWidth || 1);
      const height = Math.max(1, options.canvas.clientHeight || window.innerHeight || 1);
      const targetZoom = foundingDistrictZoomForViewport(
        options.surface.playableMap.radius,
        width / height
      );
      cameraController.zoomBy(targetZoom - cameraController.getZoom());
    },
    focusKeep: cameraController.focusKeep,
    recenterKeep: cameraController.recenterKeep,
    setHovered: (coord) => {
      if (cleanup.isDisposed()) return;
      setOverlay(hoverOverlay, options.surface, coord, terrainPlacements);
      render();
    },
    setSelected: (coord) => {
      if (cleanup.isDisposed()) return;
      selectedCastleId = coord
        ? authoritativeCastles.find((castle) => (
          castle.coord.q === coord.q && castle.coord.r === coord.r
        ))?.castleId
        : undefined;
      setOverlay(selectedOverlay, options.surface, coord, terrainPlacements);
      render();
    },
    setSelectedCastleId: (castleId) => {
      if (cleanup.isDisposed()) return;
      selectedCastleId = castleId === null ? undefined : castleId;
      render();
    },
    setComposition: (composition) => cameraController.setComposition(composition),
    showRealm: cameraController.showRealm
  };
}
