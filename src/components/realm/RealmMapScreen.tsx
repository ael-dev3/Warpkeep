import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import * as THREE from 'three';

import {
  axialToWorld,
  hexAdd,
  hexKey,
  worldToNearestAxial,
  type HexCoord
} from '../../game/map/hexCoordinates';
import { generateRealmTerrainMap, terrainCellByCoord } from '../../game/map/generateTerrainMap';
import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';
import { HEGEMONY_GENESIS_001 } from '../../game/map/realmSeed';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import type { RealmTerrainMap, TerrainCell } from '../../game/map/terrainTypes';
import {
  createTerrainGeometryData,
  pointyHexCorners,
  sampleLowlandsColor,
  type TerrainBounds
} from './createTerrainGeometry';
import './RealmMapScreen.css';

const HEX_SIZE = 1;
const RUNTIME_REALM_RADIUS = 5;
const SELECTION_LIFT = 0.028;
const KEEP_FOUNDATION_HEIGHT = 0.12;
const KEEP_SCALE = 1;
const CAMERA_OFFSET = new THREE.Vector3(12.6, 15.4, 11.8);

type RealmMapScreenProps = Readonly<{
  map?: RealmTerrainMap;
  onRequestReturn: () => void;
}>;

type RendererMode = 'loading' | 'webgl' | 'fallback';
type KeepLoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

type RealmSceneHandle = Readonly<{
  setHovered: (coord: HexCoord | null) => void;
  setSelected: (coord: HexCoord | null) => void;
  setKeep: (coord: HexCoord) => void;
}>;

type RealmViewBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function getInitialKeepCoord(map: RealmTerrainMap): HexCoord {
  return terrainCellByCoord(map, HEGEMONY_FRONTIER_KEEP.initialCoord)?.coord
    ?? map.cells[0]?.coord
    ?? { q: 0, r: 0 };
}

function pointsForOverlay(map: RealmTerrainMap, coord: HexCoord): THREE.Vector3[] {
  return pointyHexCorners(coord, HEX_SIZE).map((corner) => new THREE.Vector3(
    corner.x,
    terrainHeightAtWorld(map, corner, HEX_SIZE) + SELECTION_LIFT,
    corner.z
  ));
}

function createOverlay(color: THREE.ColorRepresentation, opacity: number) {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false
  });
  const line = new THREE.LineLoop(new THREE.BufferGeometry(), material);
  line.visible = false;
  return line;
}

function setOverlayPosition(line: THREE.LineLoop, map: RealmTerrainMap, coord: HexCoord | null) {
  if (!coord) {
    line.visible = false;
    return;
  }
  const nextGeometry = new THREE.BufferGeometry().setFromPoints(pointsForOverlay(map, coord));
  line.geometry.dispose();
  line.geometry = nextGeometry;
  line.visible = true;
}

function svgPoints(coord: HexCoord) {
  return pointyHexCorners(coord, HEX_SIZE)
    .map((point) => `${point.x.toFixed(4)},${(-point.z).toFixed(4)}`)
    .join(' ');
}

function isSameCoord(first: HexCoord | null, second: HexCoord | null) {
  return first?.q === second?.q && first?.r === second?.r;
}

function directionForKey(key: string): HexCoord | null {
  switch (key) {
    case 'ArrowRight': return { q: 1, r: 0 };
    case 'ArrowLeft': return { q: -1, r: 0 };
    case 'ArrowUp': return { q: 0, r: -1 };
    case 'ArrowDown': return { q: 0, r: 1 };
    default: return null;
  }
}

function getSelectedCell(map: RealmTerrainMap, selected: HexCoord | null): TerrainCell {
  return terrainCellByCoord(map, selected ?? getInitialKeepCoord(map)) ?? map.cells[0];
}

function getRealmViewBox(map: RealmTerrainMap): RealmViewBox {
  const points = map.cells.flatMap((cell) => pointyHexCorners(cell.coord, HEX_SIZE));
  if (points.length === 0) return { x: -2, y: -2, width: 4, height: 4 };

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const padding = HEX_SIZE * 0.9;
  return {
    x: minX - padding,
    y: -maxZ - padding,
    width: maxX - minX + padding * 2,
    height: maxZ - minZ + padding * 2
  };
}

function colorToCss({ r, g, b }: Readonly<{ r: number; g: number; b: number }>) {
  const channel = (value: number) => Math.round(clamp(value, 0, 1) * 255);
  return `rgb(${channel(r)} ${channel(g)} ${channel(b)})`;
}

function assetUrl(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

function disposeMaterial(material: THREE.Material, textures: Set<THREE.Texture>) {
  const textureMaterial = material as THREE.Material & Record<string, unknown>;
  [
    'alphaMap',
    'aoMap',
    'bumpMap',
    'displacementMap',
    'emissiveMap',
    'map',
    'metalnessMap',
    'normalMap',
    'roughnessMap'
  ].forEach((key) => {
    const texture = textureMaterial[key];
    if (texture instanceof THREE.Texture && !textures.has(texture)) {
      textures.add(texture);
      texture.dispose();
    }
  });
  material.dispose();
}

function disposeObject3D(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => disposeMaterial(material, textures));
  });
}

function tuneKeepMaterial(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.metalness = Math.min(material.metalness, 0.12);
  material.roughness = Math.max(material.roughness, 0.7);
  material.envMapIntensity = Math.min(material.envMapIntensity, 0.35);
  if (material.emissiveMap) material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.06);
  material.needsUpdate = true;
}

function prepareKeepModel(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(tuneKeepMaterial);
  });
}

function createKeepFoundation() {
  const geometry = new THREE.CylinderGeometry(1.02, 1.13, KEEP_FOUNDATION_HEIGHT, 6);
  const material = new THREE.MeshStandardMaterial({
    color: '#4d4b41',
    roughness: 0.88,
    metalness: 0
  });
  const foundation = new THREE.Mesh(geometry, material);
  foundation.rotation.y = Math.PI / 6;
  foundation.position.y = KEEP_FOUNDATION_HEIGHT / 2;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  return foundation;
}

function positionKeep(anchor: THREE.Group, map: RealmTerrainMap, coord: HexCoord) {
  const world = axialToWorld(coord, HEX_SIZE);
  anchor.position.set(world.x, terrainHeightAtWorld(map, world, HEX_SIZE), world.z);
}

function fitCameraToTerrain(
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
  bounds: TerrainBounds,
  aspect: number
) {
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const corner = new THREE.Vector3();
  let maxRight = 0;
  let maxUp = 0;
  const highY = bounds.maxY + 1.65;

  [bounds.minX, bounds.maxX].forEach((x) => {
    [bounds.minZ, bounds.maxZ].forEach((z) => {
      [bounds.minY, highY].forEach((y) => {
        corner.set(x, y, z).sub(target);
        maxRight = Math.max(maxRight, Math.abs(corner.dot(right)));
        maxUp = Math.max(maxUp, Math.abs(corner.dot(up)));
      });
    });
  });

  const paddedRight = maxRight * 1.04;
  const paddedUp = maxUp * 1.04;
  return Math.max(4.15, paddedUp, paddedRight / Math.max(0.46, aspect));
}

function setCameraFrustum(camera: THREE.OrthographicCamera, halfHeight: number, aspect: number) {
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

function cameraGroundDirection(camera: THREE.OrthographicCamera) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  return direction.lengthSq() > 0 ? direction.normalize() : new THREE.Vector3(0, 0, -1);
}

export function RealmMapScreen({ map: suppliedMap, onRequestReturn }: RealmMapScreenProps) {
  const map = useMemo(
    () => suppliedMap ?? generateRealmTerrainMap(HEGEMONY_GENESIS_001, RUNTIME_REALM_RADIUS),
    [suppliedMap]
  );
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneHandleRef = useRef<RealmSceneHandle | null>(null);
  const initialCoord = getInitialKeepCoord(map);
  const selectedRef = useRef<HexCoord>(initialCoord);
  const hoveredRef = useRef<HexCoord | null>(null);
  const keepCoordRef = useRef<HexCoord>(initialCoord);
  const [rendererMode, setRendererMode] = useState<RendererMode>('loading');
  const [keepLoadStatus, setKeepLoadStatus] = useState<KeepLoadStatus>('idle');
  const [selectedCoord, setSelectedCoord] = useState<HexCoord>(initialCoord);
  const [hoveredCoord, setHoveredCoord] = useState<HexCoord | null>(null);
  const [keepCoord, setKeepCoord] = useState<HexCoord>(initialCoord);
  const viewBox = useMemo(() => getRealmViewBox(map), [map]);
  const selectedCell = getSelectedCell(map, selectedCoord);
  const selectedHasKeep = isSameCoord(selectedCoord, keepCoord);

  const selectCell = useCallback((coord: HexCoord) => {
    if (!terrainCellByCoord(map, coord)) return;
    selectedRef.current = coord;
    setSelectedCoord(coord);
    sceneHandleRef.current?.setSelected(coord);
    rootRef.current?.focus({ preventScroll: true });
  }, [map]);

  const hoverCell = useCallback((coord: HexCoord | null) => {
    if (coord && !terrainCellByCoord(map, coord)) return;
    if (isSameCoord(hoveredRef.current, coord)) return;
    hoveredRef.current = coord;
    setHoveredCoord(coord);
    sceneHandleRef.current?.setHovered(coord);
  }, [map]);

  const placeKeep = useCallback(() => {
    if (!terrainCellByCoord(map, selectedCoord)) return;
    keepCoordRef.current = selectedCoord;
    setKeepCoord(selectedCoord);
    sceneHandleRef.current?.setKeep(selectedCoord);
  }, [map, selectedCoord]);

  useEffect(() => {
    const nextCoord = getInitialKeepCoord(map);
    selectedRef.current = nextCoord;
    hoveredRef.current = null;
    keepCoordRef.current = nextCoord;
    setSelectedCoord(nextCoord);
    setHoveredCoord(null);
    setKeepCoord(nextCoord);
    sceneHandleRef.current?.setSelected(nextCoord);
    sceneHandleRef.current?.setHovered(null);
    sceneHandleRef.current?.setKeep(nextCoord);
  }, [map]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onRequestReturn();
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [onRequestReturn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canUseWebGL()) {
      setRendererMode('fallback');
      setKeepLoadStatus('idle');
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let observer: ResizeObserver | null = null;
    let disposed = false;
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const dragOrigin = new THREE.Vector2();
    const cameraPanOrigin = new THREE.Vector2();
    const cameraTarget = new THREE.Vector3();
    let pointerDown = false;
    let terrainMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
    let hoverLine: THREE.LineLoop | null = null;
    let selectionLine: THREE.LineLoop | null = null;
    let keepAnchor: THREE.Group | null = null;
    let camera: THREE.OrthographicCamera | null = null;
    let onContextLost: EventListener | undefined;

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#9eb5b6');
      scene.fog = new THREE.Fog('#a6bcaf', 34, 70);
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.98;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;

      onContextLost = (event: Event) => {
        event.preventDefault();
        if (disposed) return;
        disposed = true;
        sceneHandleRef.current = null;
        setRendererMode('fallback');
        setKeepLoadStatus('idle');
      };
      canvas.addEventListener('webglcontextlost', onContextLost);

      const geometryData = createTerrainGeometryData(map, HEX_SIZE);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(geometryData.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(geometryData.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(geometryData.indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0,
        flatShading: false
      });
      terrainMesh = new THREE.Mesh(geometry, material);
      terrainMesh.receiveShadow = true;
      scene.add(terrainMesh);

      scene.add(new THREE.HemisphereLight('#d7edf0', '#667047', 1.45));
      const fill = new THREE.DirectionalLight('#cadff2', 0.42);
      fill.position.set(8, 10, -10);
      scene.add(fill);
      const sun = new THREE.DirectionalLight('#fff0cb', 2.35);
      sun.position.set(-11, 18, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 0.5;
      sun.shadow.camera.far = 44;
      sun.shadow.camera.left = -14;
      sun.shadow.camera.right = 14;
      sun.shadow.camera.top = 14;
      sun.shadow.camera.bottom = -14;
      sun.shadow.bias = -0.00035;
      sun.target.position.set(0, 0, 0);
      scene.add(sun, sun.target);

      hoverLine = createOverlay('#f3d680', 0.88);
      selectionLine = createOverlay('#c5a1e5', 1);
      scene.add(hoverLine, selectionLine);

      camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 80);
      camera.zoom = 1.12;
      cameraTarget.set(
        (geometryData.bounds.minX + geometryData.bounds.maxX) / 2,
        0,
        (geometryData.bounds.minZ + geometryData.bounds.maxZ) / 2
      );
      const updateCameraPose = () => {
        if (!camera) return;
        camera.position.copy(cameraTarget).add(CAMERA_OFFSET);
        camera.lookAt(cameraTarget);
        camera.updateMatrixWorld(true);
      };
      updateCameraPose();

      const render = () => {
        if (!disposed && renderer && camera) renderer.render(scene, camera);
      };
      const resize = () => {
        if (!renderer || !camera || disposed) return;
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width || canvas.clientWidth || window.innerWidth));
        const height = Math.max(1, Math.floor(bounds.height || canvas.clientHeight || window.innerHeight));
        const aspect = width / height;
        updateCameraPose();
        setCameraFrustum(camera, fitCameraToTerrain(camera, cameraTarget, geometryData.bounds, aspect), aspect);
        renderer.setSize(width, height, false);
        render();
      };
      const setHovered = (coord: HexCoord | null) => {
        if (!hoverLine) return;
        setOverlayPosition(hoverLine, map, coord);
        render();
      };
      const setSelected = (coord: HexCoord | null) => {
        if (!selectionLine) return;
        setOverlayPosition(selectionLine, map, coord);
        render();
      };
      const setKeep = (coord: HexCoord) => {
        if (!keepAnchor) return;
        positionKeep(keepAnchor, map, coord);
        render();
      };
      const coordinateFromEvent = (event: PointerEvent) => {
        if (!renderer || !camera || !terrainMesh) return null;
        const bounds = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
        pointer.y = -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(terrainMesh, false)[0];
        if (!hit) return null;
        const coord = worldToNearestAxial({ x: hit.point.x, z: hit.point.z }, HEX_SIZE);
        return terrainCellByCoord(map, coord) ? coord : null;
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!camera) return;
        if (pointerDown) {
          const bounds = canvas.getBoundingClientRect();
          const visibleScale = (camera.top - camera.bottom) / Math.max(1, bounds.height) / camera.zoom;
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
          const forward = cameraGroundDirection(camera);
          const deltaX = event.clientX - dragOrigin.x;
          const deltaY = event.clientY - dragOrigin.y;
          const panRangeX = Math.max(1.4, (geometryData.bounds.maxX - geometryData.bounds.minX) * 0.28);
          const panRangeZ = Math.max(1.4, (geometryData.bounds.maxZ - geometryData.bounds.minZ) * 0.28);
          cameraTarget.x = clamp(
            cameraPanOrigin.x - right.x * deltaX * visibleScale + forward.x * deltaY * visibleScale,
            geometryData.bounds.minX - panRangeX,
            geometryData.bounds.maxX + panRangeX
          );
          cameraTarget.z = clamp(
            cameraPanOrigin.y - right.z * deltaX * visibleScale + forward.z * deltaY * visibleScale,
            geometryData.bounds.minZ - panRangeZ,
            geometryData.bounds.maxZ + panRangeZ
          );
          updateCameraPose();
          render();
          return;
        }
        const coord = coordinateFromEvent(event);
        hoverCell(coord);
        canvas.style.cursor = coord ? 'pointer' : 'grab';
      };
      const onPointerDown = (event: PointerEvent) => {
        if (!camera || event.button !== 0) return;
        pointerDown = true;
        dragOrigin.set(event.clientX, event.clientY);
        cameraPanOrigin.set(cameraTarget.x, cameraTarget.z);
        canvas.setPointerCapture?.(event.pointerId);
        canvas.style.cursor = 'grabbing';
      };
      const onPointerUp = (event: PointerEvent) => {
        if (!pointerDown) return;
        const moved = Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y);
        pointerDown = false;
        canvas.releasePointerCapture?.(event.pointerId);
        const coord = coordinateFromEvent(event);
        if (moved < 7 && coord) selectCell(coord);
        hoverCell(coord);
        canvas.style.cursor = coord ? 'pointer' : 'grab';
      };
      const onPointerCancel = () => {
        pointerDown = false;
        canvas.style.cursor = 'grab';
      };
      const onPointerLeave = () => {
        if (!pointerDown) hoverCell(null);
      };
      const onWheel = (event: WheelEvent) => {
        if (!camera) return;
        event.preventDefault();
        camera.zoom = clamp(camera.zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.7, 1.8);
        camera.updateProjectionMatrix();
        render();
      };

      keepAnchor = new THREE.Group();
      keepAnchor.name = HEGEMONY_FRONTIER_KEEP.id;
      keepAnchor.add(createKeepFoundation());
      positionKeep(keepAnchor, map, keepCoordRef.current);
      scene.add(keepAnchor);

      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerCancel);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', resize);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
      }
      sceneHandleRef.current = { setHovered, setSelected, setKeep };
      setSelected(selectedRef.current);
      setKeep(keepCoordRef.current);
      resize();
      setRendererMode('webgl');
      setKeepLoadStatus('loading');

      const loadFrontierKeep = async () => {
        try {
          const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
            import('three/addons/loaders/GLTFLoader.js'),
            import('three/addons/libs/meshopt_decoder.module.js')
          ]);
          const loader = new GLTFLoader();
          loader.setMeshoptDecoder(MeshoptDecoder);
          const loaded = await loader.loadAsync(assetUrl(HEGEMONY_FRONTIER_KEEP.runtimeAssetPath));
          if (disposed || !keepAnchor) {
            disposeObject3D(loaded.scene);
            return;
          }

          prepareKeepModel(loaded.scene);
          loaded.scene.scale.setScalar(KEEP_SCALE);
          loaded.scene.updateMatrixWorld(true);
          const modelBounds = new THREE.Box3().setFromObject(loaded.scene);
          loaded.scene.position.y += KEEP_FOUNDATION_HEIGHT - modelBounds.min.y;
          keepAnchor.add(loaded.scene);
          positionKeep(keepAnchor, map, keepCoordRef.current);
          setKeepLoadStatus('ready');
          render();
        } catch {
          if (!disposed) {
            setKeepLoadStatus('unavailable');
            render();
          }
        }
      };
      void loadFrontierKeep();

      return () => {
        disposed = true;
        sceneHandleRef.current = null;
        observer?.disconnect();
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerCancel);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('wheel', onWheel);
        if (onContextLost) canvas.removeEventListener('webglcontextlost', onContextLost);
        hoverLine?.geometry.dispose();
        selectionLine?.geometry.dispose();
        (hoverLine?.material as THREE.Material | undefined)?.dispose();
        (selectionLine?.material as THREE.Material | undefined)?.dispose();
        if (keepAnchor) {
          scene.remove(keepAnchor);
          disposeObject3D(keepAnchor);
        }
        terrainMesh?.geometry.dispose();
        terrainMesh?.material.dispose();
        renderer?.dispose();
        renderer?.forceContextLoss();
      };
    } catch {
      if (onContextLost) canvas.removeEventListener('webglcontextlost', onContextLost);
      sceneHandleRef.current = null;
      renderer?.dispose();
      renderer?.forceContextLoss();
      setRendererMode('fallback');
      setKeepLoadStatus('idle');
      return undefined;
    }
  }, [hoverCell, map, selectCell]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onRequestReturn();
      return;
    }
    const direction = directionForKey(event.key);
    if (!direction) return;
    const next = hexAdd(selectedRef.current, direction);
    if (!terrainCellByCoord(map, next)) return;
    event.preventDefault();
    selectCell(next);
  };

  const keepStatusCopy = rendererMode !== 'webgl'
    ? 'Static landmark marker is shown while WebGL is unavailable.'
    : keepLoadStatus === 'loading'
      ? 'Loading the low-bandwidth 3D keep…'
      : keepLoadStatus === 'unavailable'
        ? 'The 3D keep could not load; its placement foundation remains visible.'
        : '3D keep is grounded to the live terrain surface.';

  return (
    <main
      ref={rootRef}
      className="realm-map-screen"
      data-renderer={rendererMode}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="realm-map-screen__canvas"
        data-testid="realm-webgl-canvas"
      />
      {rendererMode !== 'webgl' ? (
        <div className="realm-map-screen__fallback" data-testid="realm-static-fallback">
          <svg
            className="realm-map-screen__fallback-map"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            aria-hidden="true"
          >
            <rect
              x={viewBox.x}
              y={viewBox.y}
              width={viewBox.width}
              height={viewBox.height}
              fill="#71855b"
            />
            {map.cells.map((cell) => {
              const selected = isSameCoord(selectedCoord, cell.coord);
              const hovered = isSameCoord(hoveredCoord, cell.coord);
              return (
                <polygon
                  key={hexKey(cell.coord)}
                  data-selected={selected ? 'true' : 'false'}
                  data-hovered={hovered ? 'true' : 'false'}
                  points={svgPoints(cell.coord)}
                  fill={colorToCss(sampleLowlandsColor(map.worldSeed, axialToWorld(cell.coord, HEX_SIZE)))}
                  fillOpacity={0.94}
                  stroke={selected ? '#c5a1e5' : hovered ? '#f3d680' : '#49603e'}
                  strokeOpacity={selected || hovered ? 1 : 0.34}
                  strokeWidth={selected || hovered ? 0.052 : 0.016}
                />
              );
            })}
            <g
              className="realm-map-screen__fallback-keep"
              data-testid="realm-keep-marker"
              transform={`translate(${axialToWorld(keepCoord, HEX_SIZE).x} ${-axialToWorld(keepCoord, HEX_SIZE).z})`}
            >
              <circle r="0.52" fill="#2b2132" fillOpacity="0.74" stroke="#d8b862" strokeWidth="0.045" />
              <path
                d="M -0.32 0.29 V -0.14 L -0.19 -0.14 V -0.39 L -0.04 -0.56 L 0.1 -0.39 V -0.14 L 0.27 -0.14 V 0.29 Z"
                fill="#d8c8a3"
                stroke="#352d2c"
                strokeWidth="0.035"
                strokeLinejoin="round"
              />
              <path d="M -0.08 0.29 V 0.06 H 0.06 V 0.29" fill="none" stroke="#4b3550" strokeWidth="0.04" />
            </g>
          </svg>
          <p className="realm-map-screen__fallback-copy">
            WebGL terrain preview is unavailable. This overview still renders the live {map.cells.length}-cell terrain map and keep placement.
          </p>
        </div>
      ) : null}

      <section className="realm-map-screen__hud" aria-labelledby="realm-heading">
        <div className="realm-map-screen__heading">
          <span>HEGEMONY REALM // GENESIS 001</span>
          <h1 id="realm-heading">Hegemony Lowlands</h1>
          <p>{map.cells.length} deterministic pointy-top cells · sunlit procedural terrain</p>
        </div>
        <div className="realm-map-screen__selected" aria-live="polite">
          <span>Temperate Lowlands</span>
          <strong>Selected: {selectedCell.coord.q}, {selectedCell.coord.r}</strong>
          <small>
            Elevation {selectedCell.elevationBias.toFixed(2)} · Soil {selectedCell.soilBias.toFixed(2)} · {selectedHasKeep ? 'Frontier Keep established here' : 'Available for the Frontier Keep'}
          </small>
        </div>
        <div className="realm-map-screen__keep-status">
          <span>{HEGEMONY_FRONTIER_KEEP.name}</span>
          <strong>Position: {keepCoord.q}, {keepCoord.r}</strong>
          <small>{keepStatusCopy}</small>
        </div>
        <div className="realm-map-screen__actions">
          <button className="realm-map-screen__return" type="button" onClick={onRequestReturn}>
            Return to Menu
          </button>
          <button
            className="realm-map-screen__place-keep"
            type="button"
            onClick={placeKeep}
            disabled={selectedHasKeep}
          >
            {selectedHasKeep ? 'Keep Established' : 'Place Frontier Keep'}
          </button>
          <span>Drag to pan · wheel to zoom · arrows move selection · Escape returns</span>
        </div>
      </section>

      <div className="realm-map-screen__cell-list" role="group" aria-label="Realm cells">
        {map.cells.map((cell) => {
          const selected = isSameCoord(selectedCoord, cell.coord);
          const hasKeep = isSameCoord(keepCoord, cell.coord);
          return (
            <button
              key={hexKey(cell.coord)}
              type="button"
              aria-label={`Select cell ${cell.coord.q},${cell.coord.r}${hasKeep ? ', Frontier Keep' : ''}`}
              aria-pressed={selected}
              data-has-keep={hasKeep ? 'true' : 'false'}
              className="realm-map-screen__cell-button"
              onFocus={() => hoverCell(cell.coord)}
              onBlur={() => hoverCell(null)}
              onClick={() => selectCell(cell.coord)}
            >
              {hasKeep ? '◆ ' : ''}{cell.coord.q},{cell.coord.r}
            </button>
          );
        })}
      </div>
    </main>
  );
}
