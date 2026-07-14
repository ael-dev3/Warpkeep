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
  createHegemonyKeepPlaceholder,
  disposeRealmObject,
  loadHegemonyKeep
} from './loadHegemonyKeep';
import {
  createRealmCameraController,
  DEFAULT_REALM_CAMERA_SPEC,
  type RealmCameraMode
} from './realmCameraController';
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

export type RealmSceneHandle = Readonly<{
  dispose: () => void;
  frameFoundingDistrict: () => void;
  focusKeep: () => void;
  recenterKeep: () => void;
  setHovered: (coord: HexCoord | null) => void;
  setSelected: (coord: HexCoord | null) => void;
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
  onCameraModeChange: (mode: RealmCameraMode) => void;
  onHover: (coord: HexCoord | null) => void;
  onKeepStatusChange: (status: KeepLoadStatus) => void;
  onCastleProjection: (frame: RealmCastleProjectionFrame) => void;
  onRendererUnavailable: () => void;
  onSelect: (coord: HexCoord) => void;
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

type PickResult = Readonly<{
  coord: HexCoord;
  keep: boolean;
}>;

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
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { data, geometry };
}

function createOverlay(color: THREE.ColorRepresentation, opacity: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(6 * 3), 3).setUsage(THREE.DynamicDrawUsage)
  );
  const overlay = new THREE.LineLoop(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    })
  );
  overlay.frustumCulled = false;
  overlay.renderOrder = 4;
  overlay.visible = false;
  return overlay;
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

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
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

export function createRealmScene(options: CreateRealmSceneOptions): RealmSceneHandle {
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
  scene.background = new THREE.Color('#aebfc0');
  const fog = new THREE.Fog('#aebfc0', options.quality.fogNear, options.quality.fogFar);
  scene.fog = fog;

  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: options.quality.id !== 'reduced',
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const lighting = REALM_LIGHTING_SPECS[options.quality.id];
  renderer.toneMappingExposure = lighting.toneMappingExposure;
  renderer.shadowMap.enabled = renderPlan.dynamicShadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor('#aebfc0', 1);

  const { data: terrainData, geometry: terrainGeometry } = createTerrainGeometry(
    options.surface,
    renderPlan.subdivisionsPerEdge,
    terrainPlacements
  );
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    dithering: true
  });
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
  scene.add(decorations.group);

  const hemisphere = new THREE.HemisphereLight('#f4efd9', '#46523b', 1.1);
  const sun = new THREE.DirectionalLight('#ffe1a8', lighting.sunIntensity);
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
  const skyFill = new THREE.DirectionalLight('#bdd9e3', 0.42);
  skyFill.position.set(8, 6.5, -9);
  const warmFill = new THREE.DirectionalLight('#d9a95f', 0.2);
  warmFill.position.set(-5, 4, -6);
  scene.add(hemisphere, sun, skyFill, warmFill);

  const hoverOverlay = createOverlay('#f4df9a', 0.72);
  const selectedOverlay = createOverlay('#fff1b8', 1);
  scene.add(hoverOverlay, selectedOverlay);

  const keepWorld = axialToWorld(options.keepCoord, HEX_SIZE);
  const keepGroundY = terrainHeightAtWorld(
    options.surface.renderMap,
    keepWorld,
    HEX_SIZE,
    terrainPlacements
  );
  const keepAnchor = new THREE.Group();
  keepAnchor.name = 'hegemony-keep-anchor';
  keepAnchor.position.set(keepWorld.x, keepGroundY + 0.006, keepWorld.z);
  scene.add(keepAnchor);

  // Shared-state peers intentionally remain lightweight markers; only the
  // authenticated player's own keep loads the detailed GLB.
  const peerMarkerGroup = new THREE.Group();
  peerMarkerGroup.name = 'hegemony-peer-castle-markers';
  const peerMarkerGeometry = new THREE.ConeGeometry(0.13, 0.36, 5);
  const peerMarkerMaterial = new THREE.MeshStandardMaterial({
    color: '#8f58a2',
    emissive: '#341946',
    emissiveIntensity: 0.18,
    roughness: 0.78,
    metalness: 0.04
  });
  const peerMarkerInstances = new THREE.InstancedMesh(
    peerMarkerGeometry,
    peerMarkerMaterial,
    options.otherCastles.length
  );
  peerMarkerInstances.name = 'hegemony-peer-castle-instances';
  const peerMarkerMatrix = new THREE.Matrix4();
  const peerMarkerPosition = new THREE.Vector3();
  const peerMarkerRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 5
  );
  const peerMarkerScale = new THREE.Vector3(1, 1, 1);
  options.otherCastles.forEach((castle, index) => {
    const world = axialToWorld({ q: castle.q, r: castle.r }, HEX_SIZE);
    peerMarkerPosition.set(
      world.x,
      terrainHeightAtWorld(options.surface.renderMap, world, HEX_SIZE, terrainPlacements) + 0.2,
      world.z
    );
    peerMarkerMatrix.compose(peerMarkerPosition, peerMarkerRotation, peerMarkerScale);
    peerMarkerInstances.setMatrixAt(index, peerMarkerMatrix);
  });
  peerMarkerInstances.instanceMatrix.needsUpdate = true;
  peerMarkerInstances.computeBoundingSphere();
  peerMarkerGroup.add(peerMarkerInstances);
  scene.add(peerMarkerGroup);

  const castleLabelAnchors = [
    ...(options.ownCastleId === undefined ? [] : [{
      castleId: options.ownCastleId,
      q: options.keepCoord.q,
      r: options.keepCoord.r,
      x: keepWorld.x,
      y: keepGroundY + 1.12,
      z: keepWorld.z
    }]),
    ...options.otherCastles.map((castle) => {
      const world = axialToWorld(castle, HEX_SIZE);
      return {
        castleId: castle.castleId,
        q: castle.q,
        r: castle.r,
        x: world.x,
        y: terrainHeightAtWorld(
          options.surface.renderMap,
          world,
          HEX_SIZE,
          terrainPlacements
        ) + 0.58,
        z: world.z
      };
    })
  ];

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.69, 40),
    new THREE.MeshBasicMaterial({
      color: '#283020',
      opacity: renderPlan.dynamicShadows ? 0.11 : 0.19,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    })
  );
  contactShadow.name = 'keep-contact-shadow';
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.005;
  contactShadow.renderOrder = 1;
  keepAnchor.add(contactShadow);

  let keepObject = createHegemonyKeepPlaceholder(false);
  keepAnchor.add(keepObject);
  options.onKeepStatusChange('loading');

  let disposed = false;
  let lastCastleProjectionKey = '';
  const projectionPoint = new THREE.Vector3();
  const projectCastleLabels = () => {
    const width = Math.max(1, options.canvas.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, options.canvas.clientHeight || window.innerHeight || 1);
    const castles = castleLabelAnchors.map((anchor) => {
      projectionPoint.set(anchor.x, anchor.y, anchor.z);
      const distance = projectionPoint.distanceTo(cameraController.camera.position);
      projectionPoint.project(cameraController.camera);
      return {
        castleId: anchor.castleId,
        q: anchor.q,
        r: anchor.r,
        x: (projectionPoint.x * 0.5 + 0.5) * width,
        y: (-projectionPoint.y * 0.5 + 0.5) * height,
        distance,
        visible: projectionPoint.z >= -1
          && projectionPoint.z <= 1
          && projectionPoint.x >= -1.05
          && projectionPoint.x <= 1.05
          && projectionPoint.y >= -1.08
          && projectionPoint.y <= 1.08
      };
    });
    const projectionKey = `${width}:${height}:${castles.map((castle) => (
      `${castle.castleId}:${Math.round(castle.x)}:${Math.round(castle.y)}:${castle.visible ? 1 : 0}`
    )).join('|')}`;
    if (projectionKey === lastCastleProjectionKey) return;
    lastCastleProjectionKey = projectionKey;
    options.onCastleProjection({ width, height, castles });
  };
  const render = () => {
    if (!disposed) {
      renderer.render(scene, cameraController.camera);
      projectCastleLabels();
    }
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

  const raycaster = new THREE.Raycaster();
  const normalizedPointer = new THREE.Vector2();
  const pointers = new Map<number, PointerSample>();
  let lastPinchDistance = 0;
  let resizeObserver: ResizeObserver | null = null;

  const pick = (clientX: number, clientY: number): PickResult | null => {
    const bounds = options.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    normalizedPointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1
    );
    raycaster.setFromCamera(normalizedPointer, cameraController.camera);
    const intersections = raycaster.intersectObjects([keepAnchor, terrain], true);
    for (const intersection of intersections) {
      if (isDescendantOf(intersection.object, keepAnchor)) {
        return { coord: options.keepCoord, keep: true };
      }
      if (intersection.object === terrain) {
        const coord = worldToNearestAxial(
          { x: intersection.point.x, z: intersection.point.z },
          HEX_SIZE
        );
        if (isPlayableRealmCoord(options.surface, coord)) return { coord, keep: false };
      }
    }
    return null;
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
    options.canvas.dataset.dragging = 'true';
    options.onHover(null);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const sample = pointers.get(event.pointerId);
    if (!sample) {
      options.onHover(pick(event.clientX, event.clientY)?.coord ?? null);
      return;
    }
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
        options.onSelect(picked.coord);
        if (picked.keep) cameraController.focusKeep();
      }
    }
    lastPinchDistance = activePinchDistance(pointers);
    if (pointers.size === 0) {
      delete options.canvas.dataset.dragging;
      options.onHover(pick(event.clientX, event.clientY)?.coord ?? null);
    }
  };

  const handlePointerUp = (event: PointerEvent) => finishPointer(event, false);
  const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
  const handlePointerLeave = () => {
    if (pointers.size === 0) options.onHover(null);
  };
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    cameraController.zoomByWheel(event.deltaY, event.deltaMode);
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (disposed) return;
    disposeScene();
    options.onRendererUnavailable();
  };

  options.canvas.addEventListener('pointerdown', handlePointerDown);
  options.canvas.addEventListener('pointermove', handlePointerMove);
  options.canvas.addEventListener('pointerup', handlePointerUp);
  options.canvas.addEventListener('pointercancel', handlePointerCancel);
  options.canvas.addEventListener('pointerleave', handlePointerLeave);
  options.canvas.addEventListener('wheel', handleWheel, { passive: false });
  options.canvas.addEventListener('webglcontextlost', handleContextLost);

  const resize = () => {
    if (disposed) return;
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
  resizeObserver?.observe(options.canvas);
  window.addEventListener('resize', resize);
  resize();

  void loadHegemonyKeep({
    quality: runtimeQuality,
    baseUrl: options.baseUrl,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
  }).then((loaded) => {
    if (disposed) {
      disposeRealmObject(loaded.root);
      return;
    }
    keepAnchor.remove(keepObject);
    disposeRealmObject(keepObject);
    keepObject = loaded.root;
    keepAnchor.add(keepObject);
    cameraController.setKeepFocus({
      x: keepWorld.x,
      y: keepGroundY,
      z: keepWorld.z,
      height: loaded.visualHeight,
      footprintDiameter: loaded.footprintDiameter
    });
    options.onKeepStatusChange('ready');
    render();
  }).catch(() => {
    if (disposed) return;
    keepAnchor.remove(keepObject);
    disposeRealmObject(keepObject);
    keepObject = createHegemonyKeepPlaceholder(true);
    keepAnchor.add(keepObject);
    cameraController.setKeepFocus({
      x: keepWorld.x,
      y: keepGroundY,
      z: keepWorld.z,
      height: 0.82,
      footprintDiameter: 1.48
    });
    options.onKeepStatusChange('fallback');
    render();
  });

  function disposeScene() {
    if (disposed) return;
    disposed = true;
    options.canvas.removeEventListener('pointerdown', handlePointerDown);
    options.canvas.removeEventListener('pointermove', handlePointerMove);
    options.canvas.removeEventListener('pointerup', handlePointerUp);
    options.canvas.removeEventListener('pointercancel', handlePointerCancel);
    options.canvas.removeEventListener('pointerleave', handlePointerLeave);
    options.canvas.removeEventListener('wheel', handleWheel);
    options.canvas.removeEventListener('webglcontextlost', handleContextLost);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', resize);
    pointers.clear();
    lastPinchDistance = 0;
    delete options.canvas.dataset.dragging;
    cameraController.dispose();
    decorations.dispose();
    terrainGeometry.dispose();
    terrainMaterial.dispose();
    disposeOverlay(hoverOverlay);
    disposeOverlay(selectedOverlay);
    disposeRealmObject(keepObject);
    peerMarkerGeometry.dispose();
    peerMarkerMaterial.dispose();
    contactShadow.geometry.dispose();
    (contactShadow.material as THREE.Material).dispose();
    renderer.dispose();
  }

  return {
    dispose: disposeScene,
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
      if (disposed) return;
      setOverlay(hoverOverlay, options.surface, coord, terrainPlacements);
      render();
    },
    setSelected: (coord) => {
      if (disposed) return;
      setOverlay(selectedOverlay, options.surface, coord, terrainPlacements);
      render();
    },
    showRealm: cameraController.showRealm
  };
}
