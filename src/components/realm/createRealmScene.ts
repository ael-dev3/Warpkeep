import * as THREE from 'three';

import { axialToWorld, worldToNearestAxial, type HexCoord } from '../../game/map/hexCoordinates';
import { generateTerrainDecorations } from '../../game/map/terrainDecorations';
import { isPlayableRealmCoord, type RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
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
import { resolveRealmPixelRatio, type RealmQualitySpec } from './realmQuality';
import type { KeepLoadStatus } from './realmTypes';

const HEX_SIZE = 1;
const OVERLAY_LIFT = 0.026;

export type RealmPeerCastleMarker = Readonly<{
  castleId: number;
  q: number;
  r: number;
}>;

export type RealmSceneHandle = Readonly<{
  dispose: () => void;
  focusKeep: () => void;
  recenterKeep: () => void;
  setHovered: (coord: HexCoord | null) => void;
  setSelected: (coord: HexCoord | null) => void;
  showRealm: () => void;
}>;

export type CreateRealmSceneOptions = Readonly<{
  canvas: HTMLCanvasElement;
  surface: RealmTerrainSurface;
  keepCoord: HexCoord;
  otherCastles: readonly RealmPeerCastleMarker[];
  quality: RealmQualitySpec;
  reducedMotion: boolean;
  baseUrl: string;
  onCameraModeChange: (mode: RealmCameraMode) => void;
  onHover: (coord: HexCoord | null) => void;
  onKeepStatusChange: (status: KeepLoadStatus) => void;
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
  quality: RealmQualitySpec
) {
  const data = createTerrainGeometryData(surface.renderMap, HEX_SIZE, {
    subdivisionsPerEdge: quality.subdivisionsPerEdge,
    playableRadius: quality.playableRadius
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
  coord: HexCoord | null
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
      terrainHeightAtWorld(surface.renderMap, corner, HEX_SIZE) + OVERLAY_LIFT,
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b7c8c3');
  const fog = new THREE.Fog('#b7c8c3', options.quality.fogNear, options.quality.fogFar);
  scene.fog = fog;

  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: options.quality.id !== 'reduced',
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.quality.id === 'high' ? 1.03 : 1;
  renderer.shadowMap.enabled = options.quality.dynamicShadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor('#b7c8c3', 1);

  const { data: terrainData, geometry: terrainGeometry } = createTerrainGeometry(
    options.surface,
    options.quality
  );
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    dithering: true
  });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'hegemony-lowlands-surface';
  terrain.receiveShadow = true;
  scene.add(terrain);

  const decorationData = generateTerrainDecorations(options.surface.renderMap, options.quality);
  const decorations = createTerrainDecorationLayers(
    decorationData,
    options.surface.renderMap,
    options.quality,
    HEX_SIZE
  );
  scene.add(decorations.group);

  const hemisphere = new THREE.HemisphereLight('#fff4dc', '#52613d', 1.42);
  const sun = new THREE.DirectionalLight('#ffedc7', options.quality.dynamicShadows ? 2.25 : 2.05);
  sun.position.set(-7.5, 13.5, 8.5);
  sun.castShadow = options.quality.dynamicShadows;
  if (options.quality.shadowMapSize > 0) {
    sun.shadow.mapSize.set(options.quality.shadowMapSize, options.quality.shadowMapSize);
    sun.shadow.camera.left = -10.5;
    sun.shadow.camera.right = 10.5;
    sun.shadow.camera.top = 10.5;
    sun.shadow.camera.bottom = -10.5;
    sun.shadow.camera.near = 0.4;
    sun.shadow.camera.far = 38;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.018;
  }
  const skyFill = new THREE.DirectionalLight('#c6dcdf', 0.58);
  skyFill.position.set(8, 6.5, -9);
  const warmFill = new THREE.DirectionalLight('#edc67c', 0.25);
  warmFill.position.set(-5, 4, -6);
  scene.add(hemisphere, sun, skyFill, warmFill);

  const hoverOverlay = createOverlay('#f4df9a', 0.72);
  const selectedOverlay = createOverlay('#fff1b8', 1);
  scene.add(hoverOverlay, selectedOverlay);

  const keepWorld = axialToWorld(options.keepCoord, HEX_SIZE);
  const keepGroundY = terrainHeightAtWorld(options.surface.renderMap, keepWorld, HEX_SIZE);
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
  for (const castle of options.otherCastles) {
    const world = axialToWorld({ q: castle.q, r: castle.r }, HEX_SIZE);
    const marker = new THREE.Mesh(peerMarkerGeometry, peerMarkerMaterial);
    marker.name = `peer-castle-${castle.castleId}`;
    marker.position.set(
      world.x,
      terrainHeightAtWorld(options.surface.renderMap, world, HEX_SIZE) + 0.2,
      world.z
    );
    marker.rotation.y = Math.PI / 5;
    peerMarkerGroup.add(marker);
  }
  scene.add(peerMarkerGroup);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.69, 40),
    new THREE.MeshBasicMaterial({
      color: '#283020',
      opacity: options.quality.dynamicShadows ? 0.11 : 0.19,
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
  const render = () => {
    if (!disposed) renderer.render(scene, cameraController.camera);
  };
  const cameraController = createRealmCameraController({
    bounds: terrainData.bounds,
    keepFocus: { x: keepWorld.x, y: keepGroundY, z: keepWorld.z, height: 1.08 },
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
    quality: options.quality,
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
      height: loaded.visualHeight
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
      height: 0.82
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
    focusKeep: cameraController.focusKeep,
    recenterKeep: cameraController.recenterKeep,
    setHovered: (coord) => {
      if (disposed) return;
      setOverlay(hoverOverlay, options.surface, coord);
      render();
    },
    setSelected: (coord) => {
      if (disposed) return;
      setOverlay(selectedOverlay, options.surface, coord);
      render();
    },
    showRealm: cameraController.showRealm
  };
}
