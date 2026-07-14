import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';

import {
  axialToWorld,
  hexAdd,
  hexKey,
  type HexCoord
} from '../../game/map/hexCoordinates';
import { terrainCellByCoord } from '../../game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../../game/map/realmSeed';
import {
  createRealmTerrainSurface,
  isPlayableRealmCoord,
  type RealmTerrainSurface
} from '../../game/map/realmTerrainSurface';
import { createHegemonyCastlePlacements } from '../../game/map/terrainPlacements';
import type { RealmTerrainMap, TerrainCell } from '../../game/map/terrainTypes';
import type {
  WarpkeepPlayer,
  WarpkeepWorldTile
} from '../../spacetime/warpkeepBackendTypes';
import { RealmAccessibilityControls } from './RealmAccessibilityControls';
import { RealmHud } from './RealmHud';
import {
  createRealmScene,
  type RealmPeerCastleMarker,
  type RealmSceneHandle
} from './createRealmScene';
import {
  pointyHexCorners,
  sampleLowlandsColor
} from './createTerrainGeometry';
import type { RealmCameraMode } from './realmCameraController';
import {
  REALM_QUALITY_SPECS,
  selectRealmQuality,
  type RealmQuality
} from './realmQuality';
import type { KeepLoadStatus, RealmIdentity } from './realmTypes';
import './RealmMapScreen.css';

const HEX_SIZE = 1;
const DEFAULT_KEEP_COORD = { q: 0, r: 0 } as const;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export type RealmCastleProjection = Readonly<{
  castleId: number;
  ownerFid: number;
  q: number;
  r: number;
  level: number;
  name: string;
}>;

const EMPTY_CASTLES: readonly RealmCastleProjection[] = Object.freeze([]);
const EMPTY_TILES: readonly WarpkeepWorldTile[] = Object.freeze([]);
const EMPTY_PLAYERS: readonly WarpkeepPlayer[] = Object.freeze([]);
const EMPTY_PEER_CASTLE_MARKERS: readonly RealmPeerCastleMarker[] = Object.freeze([]);

type RealmMapScreenProps = Readonly<{
  identity: RealmIdentity;
  map?: RealmTerrainMap;
  /** Server-owned coordinates/name/level replace the old fixed-center authority. */
  ownCastle?: RealmCastleProjection;
  /** Lightweight shared-world markers; only the owner loads the detailed GLB. */
  otherCastles?: readonly RealmCastleProjection[];
  /** Public shared state from the admission-gated subscription. */
  sharedTiles?: readonly WarpkeepWorldTile[];
  sharedPlayers?: readonly WarpkeepPlayer[];
  onRequestReturn: () => void;
  qualityOverride?: RealmQuality;
}>;

type RendererMode = 'loading' | 'webgl' | 'fallback';

type RealmViewBox = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sameCoord(first: HexCoord | null, second: HexCoord | null) {
  if (first === null || second === null) return first === second;
  return first.q === second.q && first.r === second.r;
}

function samePeerCastleMarkers(
  first: readonly RealmPeerCastleMarker[],
  second: readonly RealmPeerCastleMarker[]
) {
  return first.length === second.length && first.every((castle, index) => {
    const candidate = second[index];
    return candidate !== undefined
      && castle.castleId === candidate.castleId
      && castle.q === candidate.q
      && castle.r === candidate.r;
  });
}

/**
 * SpacetimeDB snapshots deliberately return fresh presentation objects. Keep
 * the renderer input stable when only unrelated player/tile state or castle
 * display metadata changed, while still replacing it for a real marker move.
 */
function useStablePeerCastleMarkers(
  castles: readonly RealmCastleProjection[],
  ownFid: number,
  surface: RealmTerrainSurface
) {
  const stableMarkersRef = useRef<readonly RealmPeerCastleMarker[]>(EMPTY_PEER_CASTLE_MARKERS);
  const nextMarkers: RealmPeerCastleMarker[] = [];
  for (const castle of castles) {
    if (
      castle.ownerFid !== ownFid
      && isPlayableRealmCoord(surface, { q: castle.q, r: castle.r })
    ) {
      nextMarkers.push({ castleId: castle.castleId, q: castle.q, r: castle.r });
    }
  }
  nextMarkers.sort((left, right) => (
    left.castleId - right.castleId
    || left.q - right.q
    || left.r - right.r
  ));

  if (!samePeerCastleMarkers(stableMarkersRef.current, nextMarkers)) {
    stableMarkersRef.current = nextMarkers;
  }
  return stableMarkersRef.current;
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

function createSurface(map?: RealmTerrainMap): RealmTerrainSurface {
  const generated = createRealmTerrainSurface(map?.worldSeed ?? HEGEMONY_GENESIS_001, 4, 5);
  if (!map || map.radius !== 4 || map.cells.length !== 61) return generated;
  const playableKeys = new Set(map.cells.map((cell) => hexKey(cell.coord)));
  return {
    ...generated,
    playableMap: map,
    playableKeys,
    apronCells: generated.renderMap.cells.filter((cell) => !playableKeys.has(hexKey(cell.coord)))
  };
}

function pointsForSvg(coord: HexCoord) {
  return pointyHexCorners(coord, HEX_SIZE)
    .map((point) => `${point.x.toFixed(4)},${(-point.z).toFixed(4)}`)
    .join(' ');
}

function viewBoxForSurface(surface: RealmTerrainSurface): RealmViewBox {
  const points = surface.renderMap.cells.flatMap((cell) => pointyHexCorners(cell.coord, HEX_SIZE));
  if (points.length === 0) return { x: -2, y: -2, width: 4, height: 4 };
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const padding = 0.88;
  return {
    x: minX - padding,
    y: -maxZ - padding,
    width: maxX - minX + padding * 2,
    height: maxZ - minZ + padding * 2
  };
}

function colorToCss(color: Readonly<{ r: number; g: number; b: number }>) {
  const channel = (value: number) => Math.round(clamp(value, 0, 1) * 255);
  return `rgb(${channel(color.r)} ${channel(color.g)} ${channel(color.b)})`;
}

function readReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const preference = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();

    if (typeof preference.addEventListener === 'function') {
      preference.addEventListener('change', updatePreference);
      return () => preference.removeEventListener('change', updatePreference);
    }

    if (typeof preference.addListener === 'function') {
      preference.addListener(updatePreference);
      return () => preference.removeListener(updatePreference);
    }
    return undefined;
  }, []);

  return reducedMotion;
}

function initialQuality(override?: RealmQuality) {
  if (override) return override;
  let maxTextureSize: number | undefined;
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2');
    maxTextureSize = context?.getParameter(context.MAX_TEXTURE_SIZE) as number | undefined;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    maxTextureSize = undefined;
  }
  return selectRealmQuality({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
    maxTextureSize
  });
}

function selectedCellFor(
  surface: RealmTerrainSurface,
  coord: HexCoord,
  fallback: HexCoord
): TerrainCell {
  return terrainCellByCoord(surface.playableMap, coord)
    ?? terrainCellByCoord(surface.playableMap, fallback)
    ?? surface.playableMap.cells[0];
}

export function RealmMapScreen({
  identity,
  map,
  ownCastle,
  otherCastles = EMPTY_CASTLES,
  sharedTiles = EMPTY_TILES,
  sharedPlayers = EMPTY_PLAYERS,
  onRequestReturn,
  qualityOverride
}: RealmMapScreenProps) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RealmSceneHandle | null>(null);
  const surface = useMemo(() => createSurface(map), [map]);
  const ownCastleQ = ownCastle?.q ?? DEFAULT_KEEP_COORD.q;
  const ownCastleR = ownCastle?.r ?? DEFAULT_KEEP_COORD.r;
  const keepCoord = useMemo<HexCoord>(() => {
    const candidate = { q: ownCastleQ, r: ownCastleR };
    return isPlayableRealmCoord(surface, candidate) ? candidate : DEFAULT_KEEP_COORD;
  }, [ownCastleQ, ownCastleR, surface]);
  const peerCastles = useStablePeerCastleMarkers(otherCastles, identity.fid, surface);
  const terrainPlacements = useMemo(() => createHegemonyCastlePlacements([
    { id: 'own-keep', coord: keepCoord },
    ...peerCastles.map((castle) => ({
      id: `peer-castle-${castle.castleId}`,
      coord: { q: castle.q, r: castle.r }
    }))
  ]), [keepCoord, peerCastles]);
  const fallbackFoundations = useMemo(() => terrainPlacements.map((placement, index) => {
    const world = axialToWorld(placement.coord, HEX_SIZE);
    const cell = terrainCellByCoord(surface.renderMap, placement.coord);
    const color = sampleLowlandsColor(surface.renderMap.worldSeed, world, {
      cell: cell ?? undefined,
      hexSize: HEX_SIZE,
      playableRadius: 4,
      renderRadius: 5,
      placements: terrainPlacements
    });
    return {
      ...placement,
      color: colorToCss(color),
      gradientId: `realm-fallback-foundation-${index}`,
      world
    };
  }), [surface, terrainPlacements]);
  const quality = useMemo(() => initialQuality(qualityOverride), [qualityOverride]);
  const qualitySpec = REALM_QUALITY_SPECS[quality];
  const [rendererMode, setRendererMode] = useState<RendererMode>('loading');
  const [keepLoadStatus, setKeepLoadStatus] = useState<KeepLoadStatus>('idle');
  const [cameraMode, setCameraMode] = useState<RealmCameraMode>('realm');
  const [selectedCoord, setSelectedCoord] = useState<HexCoord>(keepCoord);
  const selectedCoordRef = useRef<HexCoord>(keepCoord);
  const [hoveredCoord, setHoveredCoord] = useState<HexCoord | null>(null);
  const hoveredCoordRef = useRef<HexCoord | null>(null);
  const reducedMotion = useReducedMotionPreference();
  const viewBox = useMemo(() => viewBoxForSurface(surface), [surface]);
  const selectedCell = selectedCellFor(surface, selectedCoord, keepCoord);
  const hoveredCell = hoveredCoord ? selectedCellFor(surface, hoveredCoord, keepCoord) : null;
  const selectedIsKeep = sameCoord(selectedCoord, keepCoord);

  useEffect(() => {
    // RealmMapScreen mounts only on entry. Focus once so keyboard navigation is
    // immediately available, then leave focus wherever the player moves it.
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    selectedCoordRef.current = keepCoord;
    setSelectedCoord(keepCoord);
  }, [keepCoord]);

  const selectCoord = useCallback((coord: HexCoord) => {
    if (!isPlayableRealmCoord(surface, coord)) return;
    selectedCoordRef.current = coord;
    setSelectedCoord(coord);
  }, [surface]);

  const markRendererUnavailable = useCallback(() => {
    setRendererMode('fallback');
    setKeepLoadStatus('fallback');
  }, []);

  const updateHoveredCoord = useCallback((coord: HexCoord | null) => {
    // Re-upload and redraw the WebGL overlay only when the hovered territory
    // actually changes; pointermove can otherwise emit dozens of duplicates.
    if (sameCoord(hoveredCoordRef.current, coord)) return;
    hoveredCoordRef.current = coord;
    sceneRef.current?.setHovered(coord);
    setHoveredCoord(coord);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canUseWebGL()) {
      markRendererUnavailable();
      return undefined;
    }

    let scene: RealmSceneHandle | null = null;
    try {
      setRendererMode('loading');
      setKeepLoadStatus('loading');
      setCameraMode('realm');
      scene = createRealmScene({
        canvas,
        surface,
        keepCoord,
        otherCastles: peerCastles,
        quality: qualitySpec,
        reducedMotion,
        baseUrl: import.meta.env.BASE_URL || '/',
        onCameraModeChange: setCameraMode,
        onHover: updateHoveredCoord,
        onKeepStatusChange: setKeepLoadStatus,
        onRendererUnavailable: markRendererUnavailable,
        onSelect: selectCoord
      });
      sceneRef.current = scene;
      scene.setSelected(selectedCoordRef.current);
      scene.setHovered(hoveredCoordRef.current);
      setRendererMode('webgl');
    } catch {
      markRendererUnavailable();
    }

    return () => {
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [keepCoord, markRendererUnavailable, peerCastles, qualitySpec, reducedMotion, selectCoord, surface, updateHoveredCoord]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedCoord);
  }, [selectedCoord]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onRequestReturn();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onRequestReturn]);

  const focusKeep = useCallback(() => {
    selectCoord(keepCoord);
    sceneRef.current?.focusKeep();
  }, [keepCoord, selectCoord]);

  const recenterKeep = useCallback(() => {
    selectCoord(keepCoord);
    sceneRef.current?.recenterKeep();
  }, [keepCoord, selectCoord]);

  const showRealm = useCallback(() => {
    sceneRef.current?.showRealm();
  }, []);

  const selectFromNavigator = useCallback((coord: HexCoord) => {
    selectCoord(coord);
    rootRef.current?.focus({ preventScroll: true });
  }, [selectCoord]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // The realm itself owns map-navigation shortcuts. Let nested controls keep
    // their native keyboard behavior instead of turning Enter, Space, Home, or
    // arrow keys on a HUD/navigator control into an unrelated map command.
    if (event.target !== event.currentTarget) return;

    if (event.key === 'Home') {
      event.preventDefault();
      recenterKeep();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && selectedIsKeep) {
      event.preventDefault();
      focusKeep();
      return;
    }
    const direction = directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    const next = hexAdd(selectedCoord, direction);
    if (isPlayableRealmCoord(surface, next)) selectCoord(next);
  };

  return (
    <main
      ref={rootRef}
      className="realm-map-screen"
      data-renderer={rendererMode}
      data-quality={quality}
      tabIndex={0}
      aria-label="Hegemony realm"
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        className="realm-map-screen__canvas"
        aria-hidden="true"
      />

      {rendererMode === 'fallback' ? (
        <div className="realm-map-screen__fallback" data-testid="realm-static-fallback">
          <svg
            className="realm-map-screen__fallback-map"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            role="img"
            aria-label="Deterministic illustrated Hegemony lowlands"
          >
            <title>Hegemony lowlands with your authoritative frontier keep</title>
            <defs>
              {fallbackFoundations.map((foundation) => (
                <radialGradient id={foundation.gradientId} key={foundation.id}>
                  <stop offset="0%" stopColor={foundation.color} />
                  <stop
                    offset={`${(foundation.footprintRadius / foundation.blendRadius) * 100}%`}
                    stopColor={foundation.color}
                    stopOpacity="0.96"
                  />
                  <stop offset="100%" stopColor={foundation.color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>
            {surface.renderMap.cells.map((cell) => {
              const playable = isPlayableRealmCoord(surface, cell.coord);
              const selected = sameCoord(selectedCoord, cell.coord);
              const center = pointyHexCorners(cell.coord, HEX_SIZE)
                .reduce((sum, point) => ({ x: sum.x + point.x / 6, z: sum.z + point.z / 6 }), { x: 0, z: 0 });
              const color = sampleLowlandsColor(surface.renderMap.worldSeed, center, {
                cell,
                hexSize: HEX_SIZE,
                playableRadius: 4,
                renderRadius: 5
              });
              return (
                <polygon
                  key={hexKey(cell.coord)}
                  data-playable={playable ? 'true' : 'false'}
                  points={pointsForSvg(cell.coord)}
                  fill={colorToCss(color)}
                  fillOpacity={playable ? 1 : 0.72}
                  stroke={selected ? '#fff1b8' : playable ? '#788454' : '#859076'}
                  strokeWidth={selected ? 0.07 : 0.018}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <g aria-hidden="true">
              {fallbackFoundations.map((foundation) => (
                <circle
                  className="realm-map-screen__fallback-foundation"
                  data-foundation-id={foundation.id}
                  data-q={foundation.coord.q}
                  data-r={foundation.coord.r}
                  fill={`url(#${foundation.gradientId})`}
                  key={foundation.id}
                  r={foundation.blendRadius}
                  transform={`translate(${foundation.world.x} ${-foundation.world.z})`}
                />
              ))}
            </g>
            <g
              className="realm-map-screen__fallback-keep"
              data-testid="realm-keep-marker"
              aria-label={`Your Hegemony keep at cell ${keepCoord.q},${keepCoord.r}`}
              transform={`translate(${axialToWorld(keepCoord, HEX_SIZE).x} ${-axialToWorld(keepCoord, HEX_SIZE).z})`}
            >
              <path d="M-0.55 0.36V-0.28H-0.36V-0.52H-0.18V-0.28H0.18V-0.52H0.36V-0.28H0.55V0.36Z" fill="#ddd0ad" stroke="#5b4936" strokeWidth="0.035" />
              <path d="M-0.64 0.36H0.64L0.52 0.5H-0.52Z" fill="#766146" />
              <path d="M-0.11 0.36V0.02Q0-0.11 0.11 0.02V0.36Z" fill="#433c32" />
              <path d="M-0.52-0.28L-0.36-0.62L-0.2-0.28M0.2-0.28L0.36-0.62L0.52-0.28" fill="#a58949" stroke="#5b4936" strokeWidth="0.025" />
            </g>
            {peerCastles.map((castle) => {
              const world = axialToWorld({ q: castle.q, r: castle.r }, HEX_SIZE);
              return (
                <g
                  aria-label={`Frontier keep marker at cell ${castle.q},${castle.r}`}
                  className="realm-map-screen__fallback-peer-castle"
                  key={castle.castleId}
                  transform={`translate(${world.x} ${-world.z})`}
                >
                  <circle cx="0" cy="0" fill="#7d4d90" r="0.16" stroke="#ecd3a3" strokeWidth="0.035" />
                  <path d="M-0.13 0.04L0-0.22L0.13 0.04Z" fill="#d7ae5e" />
                </g>
              );
            })}
          </svg>
          <p className="realm-map-screen__fallback-copy">
            <strong>61 playable cells · 91 rendered.</strong>{' '}
            WebGL terrain preview is unavailable, so this deterministic lowlands chart preserves the same authoritative keep foundations and playable boundary.
          </p>
        </div>
      ) : null}

      {rendererMode === 'loading' ? (
        <div className="realm-map-screen__loading" role="status">
          Surveying the bright lowlands…
        </div>
      ) : null}

      <RealmHud
        identity={identity}
        ownCastle={ownCastle}
        keepCoord={keepCoord}
        sharedTileCount={sharedTiles.length || undefined}
        sharedPlayerCount={sharedPlayers.length}
        sharedCastleCount={peerCastles.length + (ownCastle ? 1 : 0)}
        selectedCell={selectedCell}
        hoveredCell={hoveredCell}
        keepLoadStatus={keepLoadStatus}
        cameraMode={cameraMode}
        quality={quality}
        onFocusKeep={focusKeep}
        onRecenterKeep={recenterKeep}
        onShowRealm={showRealm}
        onRequestReturn={onRequestReturn}
      />

      <RealmAccessibilityControls
        cells={surface.playableMap.cells}
        keepCoord={keepCoord}
        selectedCoord={selectedCoord}
        onHover={updateHoveredCoord}
        onSelect={selectFromNavigator}
      />
    </main>
  );
}
