import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import {
  hexAdd,
  hexKey,
  worldToNearestAxial,
  type HexCoord
} from '../../game/map/hexCoordinates';
import { generateRealmTerrainMap, terrainCellByCoord } from '../../game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../../game/map/realmSeed';
import { globalLowlandHeight } from '../../game/map/terrainHeight';
import type { RealmTerrainMap, TerrainCell } from '../../game/map/terrainTypes';
import {
  createTerrainGeometryData,
  pointyHexCorners
} from './createTerrainGeometry';
import './RealmMapScreen.css';

const HEX_SIZE = 1;
const MAP_VIEWBOX_SIZE = 9.4;
const SELECTION_LIFT = 0.018;

type RealmMapScreenProps = Readonly<{
  map?: RealmTerrainMap;
  onRequestReturn: () => void;
}>;

type RendererMode = 'loading' | 'webgl' | 'fallback';

type RealmSceneHandle = Readonly<{
  setHovered: (coord: HexCoord | null) => void;
  setSelected: (coord: HexCoord | null) => void;
}>;

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

function pointsForOverlay(map: RealmTerrainMap, coord: HexCoord): THREE.Vector3[] {
  return pointyHexCorners(coord, HEX_SIZE).map((corner) => new THREE.Vector3(
    corner.x,
    globalLowlandHeight(map.worldSeed, corner) + SELECTION_LIFT,
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
  return terrainCellByCoord(map, selected ?? { q: 0, r: 0 }) ?? map.cells[0];
}

export function RealmMapScreen({ map: suppliedMap, onRequestReturn }: RealmMapScreenProps) {
  const map = useMemo(
    () => suppliedMap ?? generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2),
    [suppliedMap]
  );
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneHandleRef = useRef<RealmSceneHandle | null>(null);
  const selectedRef = useRef<HexCoord>({ q: 0, r: 0 });
  const hoveredRef = useRef<HexCoord | null>(null);
  const [rendererMode, setRendererMode] = useState<RendererMode>('loading');
  const [selectedCoord, setSelectedCoord] = useState<HexCoord>({ q: 0, r: 0 });
  const [hoveredCoord, setHoveredCoord] = useState<HexCoord | null>(null);
  const selectedCell = getSelectedCell(map, selectedCoord);

  const selectCell = useCallback((coord: HexCoord) => {
    if (!terrainCellByCoord(map, coord)) return;
    selectedRef.current = coord;
    setSelectedCoord(coord);
    sceneHandleRef.current?.setSelected(coord);
  }, [map]);

  const hoverCell = useCallback((coord: HexCoord | null) => {
    if (coord && !terrainCellByCoord(map, coord)) return;
    if (isSameCoord(hoveredRef.current, coord)) return;
    hoveredRef.current = coord;
    setHoveredCoord(coord);
    sceneHandleRef.current?.setHovered(coord);
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
      return undefined;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let observer: ResizeObserver | null = null;
    let disposed = false;
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const dragOrigin = new THREE.Vector2();
    const cameraPanOrigin = new THREE.Vector2();
    let pointerDown = false;
    let terrainMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
    let hoverLine: THREE.LineLoop | null = null;
    let selectionLine: THREE.LineLoop | null = null;
    let camera: THREE.OrthographicCamera | null = null;

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#9da7a2');
      scene.fog = new THREE.Fog('#9da7a2', 8, 16);
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.92;
      renderer.shadowMap.enabled = false;

      const geometryData = createTerrainGeometryData(map, HEX_SIZE);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(geometryData.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(geometryData.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(geometryData.indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        metalness: 0,
        flatShading: false
      });
      terrainMesh = new THREE.Mesh(geometry, material);
      terrainMesh.receiveShadow = false;
      scene.add(terrainMesh);

      scene.add(new THREE.HemisphereLight('#cfdeea', '#6b613e', 1.7));
      const sun = new THREE.DirectionalLight('#fff4dd', 1.5);
      sun.position.set(-3.8, 7.5, 4.2);
      scene.add(sun);

      hoverLine = createOverlay('#e3c575', 0.82);
      selectionLine = createOverlay('#b79bcf', 0.98);
      scene.add(hoverLine, selectionLine);

      camera = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 80);
      camera.position.set(6.8, 8.6, 8.6);
      camera.lookAt(0, 0, 0);

      const render = () => {
        if (!disposed && renderer && camera) renderer.render(scene, camera);
      };
      const resize = () => {
        if (!renderer || !camera || disposed) return;
        const bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width || canvas.clientWidth || window.innerWidth));
        const height = Math.max(1, Math.floor(bounds.height || canvas.clientHeight || window.innerHeight));
        const aspect = width / height;
        const halfHeight = Math.max(3.8, 4.5 / Math.max(0.48, aspect));
        camera.left = -halfHeight * aspect;
        camera.right = halfHeight * aspect;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.updateProjectionMatrix();
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
          const scale = (camera.top - camera.bottom) / Math.max(1, bounds.height);
          camera.position.x = cameraPanOrigin.x - (event.clientX - dragOrigin.x) * scale;
          camera.position.z = cameraPanOrigin.y + (event.clientY - dragOrigin.y) * scale;
          camera.lookAt(camera.position.x - 6.8, 0, camera.position.z - 8.6);
          render();
          return;
        }
        const coord = coordinateFromEvent(event);
        hoverCell(coord);
        canvas.style.cursor = coord ? 'pointer' : 'grab';
      };
      const onPointerDown = (event: PointerEvent) => {
        if (!camera) return;
        pointerDown = true;
        dragOrigin.set(event.clientX, event.clientY);
        cameraPanOrigin.set(camera.position.x, camera.position.z);
        canvas.setPointerCapture?.(event.pointerId);
        canvas.style.cursor = 'grabbing';
      };
      const onPointerUp = (event: PointerEvent) => {
        const moved = Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y);
        pointerDown = false;
        canvas.releasePointerCapture?.(event.pointerId);
        const coord = coordinateFromEvent(event);
        if (moved < 7 && coord) selectCell(coord);
        hoverCell(coord);
        canvas.style.cursor = coord ? 'pointer' : 'grab';
      };
      const onPointerLeave = () => {
        if (!pointerDown) hoverCell(null);
      };
      const onWheel = (event: WheelEvent) => {
        if (!camera) return;
        event.preventDefault();
        camera.zoom = Math.min(1.55, Math.max(0.72, camera.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
        camera.updateProjectionMatrix();
        render();
      };

      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', resize);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
      }
      sceneHandleRef.current = { setHovered, setSelected };
      setSelected(selectedRef.current);
      resize();
      setRendererMode('webgl');

      return () => {
        disposed = true;
        sceneHandleRef.current = null;
        observer?.disconnect();
        window.removeEventListener('resize', resize);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('wheel', onWheel);
        hoverLine?.geometry.dispose();
        selectionLine?.geometry.dispose();
        (hoverLine?.material as THREE.Material | undefined)?.dispose();
        (selectionLine?.material as THREE.Material | undefined)?.dispose();
        terrainMesh?.geometry.dispose();
        terrainMesh?.material.dispose();
        renderer?.dispose();
        renderer?.forceContextLoss();
      };
    } catch {
      sceneHandleRef.current = null;
      renderer?.dispose();
      renderer?.forceContextLoss();
      setRendererMode('fallback');
      return undefined;
    }
  }, [hoverCell, map, selectCell]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
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

  return (
    <main
      ref={rootRef}
      className="realm-map-screen"
      data-renderer={rendererMode}
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
            viewBox={`${-MAP_VIEWBOX_SIZE / 2} ${-MAP_VIEWBOX_SIZE / 2} ${MAP_VIEWBOX_SIZE} ${MAP_VIEWBOX_SIZE}`}
            aria-hidden="true"
          >
            <rect
              x={-MAP_VIEWBOX_SIZE / 2}
              y={-MAP_VIEWBOX_SIZE / 2}
              width={MAP_VIEWBOX_SIZE}
              height={MAP_VIEWBOX_SIZE}
              fill="#6d7745"
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
                  fill="transparent"
                  stroke={selected ? '#b79bcf' : hovered ? '#e3c575' : 'none'}
                  strokeWidth={selected || hovered ? 0.036 : 0}
                />
              );
            })}
          </svg>
          <p className="realm-map-screen__fallback-copy">
            WebGL terrain preview is unavailable. This static overview still uses the live deterministic map data.
          </p>
        </div>
      ) : null}

      <section className="realm-map-screen__hud" aria-labelledby="realm-heading">
        <div className="realm-map-screen__heading">
          <span>HEGEMONY REALM // GENESIS 001</span>
          <h1 id="realm-heading">Hegemony Lowlands</h1>
          <p>19 deterministic pointy-top cells · procedural terrain foundation</p>
        </div>
        <div className="realm-map-screen__selected" aria-live="polite">
          <span>Temperate Lowlands</span>
          <strong>Coordinates: {selectedCell.coord.q}, {selectedCell.coord.r}</strong>
          <small>
            Elevation {selectedCell.elevationBias.toFixed(2)} · Soil {selectedCell.soilBias.toFixed(2)} · No structure assigned
          </small>
        </div>
        <div className="realm-map-screen__actions">
          <button className="realm-map-screen__return" type="button" onClick={onRequestReturn}>
            Return to Menu
          </button>
          <span>Drag to pan · wheel to zoom · arrows move selection · Escape returns</span>
        </div>
      </section>

      <div className="realm-map-screen__cell-list" role="group" aria-label="Realm cells">
        {map.cells.map((cell) => {
          const selected = isSameCoord(selectedCoord, cell.coord);
          return (
            <button
              key={hexKey(cell.coord)}
              type="button"
              aria-label={`Select cell ${cell.coord.q},${cell.coord.r}`}
              aria-pressed={selected}
              className="realm-map-screen__cell-button"
              onFocus={() => hoverCell(cell.coord)}
              onBlur={() => hoverCell(null)}
              onClick={() => selectCell(cell.coord)}
            >
              {cell.coord.q},{cell.coord.r}
            </button>
          );
        })}
      </div>
    </main>
  );
}
