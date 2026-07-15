import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';

import {
  axialToWorld,
  hexAdd,
  hexDistance,
  hexKey,
  type HexCoord
} from '../../game/map/hexCoordinates';
import { terrainCellByCoord } from '../../game/map/generateTerrainMap';
import {
  createRealmTerrainSurface,
  isPlayableRealmCoord,
  type RealmTerrainSurface
} from '../../game/map/realmTerrainSurface';
import {
  isRealmTerrainKind
} from '../../game/map/realmTerrainSemantics';
import { createHegemonyCastlePlacements } from '../../game/map/terrainPlacements';
import type { TerrainCell } from '../../game/map/terrainTypes';
import type {
  CanonicalWarpkeepRealmSnapshot,
  WarpkeepWorldTileMetadata
} from '../../spacetime/warpkeepBackendTypes';
import { isCanonicalGenesisSnapshot } from '../../spacetime/canonicalGenesisSnapshot';
import { CastleInspectionPanel } from './CastleInspectionPanel';
import { RealmAccessibilityControls } from './RealmAccessibilityControls';
import {
  RealmCastleLabels,
  type CastleLabelRecord
} from './RealmCastleLabels';
import {
  REALM_IDENTITY_CLUSTER_MAX_MEMBER_DISTANCE_PIXELS,
  realmCastleClusterMembershipSignature,
  realmCastleIdentityCoverageValid,
  resolveRealmCastleIdentityClusters,
  type RealmCastleIdentityCluster
} from './realmCastleIdentityClusters';
import { RealmHud } from './RealmHud';
import { RealmObserverHud } from './RealmObserverHud';
import {
  createRealmScene,
  type RealmInteractionTarget,
  type RealmPeerCastleMarker,
  type RealmSceneHandle,
  type RealmTerrainPresentationTelemetry
} from './createRealmScene';
import {
  pointyHexCorners,
  sampleLowlandsColor
} from './createTerrainGeometry';
import type { RealmCameraMode } from './realmCameraController';
import type {
  RealmCastleInstancePresentationTelemetry
} from './realmCastleInstanceLayer';
import {
  measuredRealmComposition,
  measuredVisibleRealmUiRects
} from './realmMeasuredComposition';
import {
  REALM_QUALITY_SPECS,
  selectRealmQuality,
  type RealmQuality
} from './realmQuality';
import type { RealmIdentity } from './realmTypes';
import type { RealmCastleProjectionFrame } from './realmTypes';
import {
  CASTLE_LABEL_FAR_DISTANCE,
  CASTLE_LABEL_COMPACT_HEIGHT,
  CASTLE_LABEL_COMPACT_WIDTH,
  CASTLE_LABEL_LAYOUT_MAX_CASTLES,
  castleProfileIdentityReady,
  castleProfileLabel,
  fallbackCastleProjection,
  publicProfileForCastle,
  realmCastleLabelLeaderGeometry,
  realmEligibleCastleProjectionCount,
  resolveVisibleCastleLabels,
  type VisibleCastleLabel
} from './realmCastlePresentation';
import {
  resolveMeasuredRealmLabelLayout,
  type RealmLabelPlacement,
  type RealmMeasuredLabelRectangle,
  type RealmScreenRect
} from './realmMeasuredLabelLayout';
import {
  createRealmInteractionState,
  realmInteractionReducer,
  resolveRealmEscape,
  type RealmCameraTarget
} from './realmInteractionState';
import './RealmMapScreen.css';
import './RealmCastlePresentation.css';

const HEX_SIZE = 1;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export type RealmCastleProjection = Readonly<{
  castleId: number;
  ownerFid: number;
  q: number;
  r: number;
  level: number;
  name: string;
  tileKey?: string;
  foundedAt?: number;
}>;

const EMPTY_PEER_CASTLE_MARKERS: readonly RealmPeerCastleMarker[] = Object.freeze([]);

type RealmMapScreenProps = Readonly<{
  identity: RealmIdentity;
  /** Privately branded, exact Genesis 001 renderer authority. */
  snapshot: CanonicalWarpkeepRealmSnapshot;
  onRequestReturn: () => void;
  qualityOverride?: RealmQuality;
  /** Explicit local QA presentation; it grants no backend or player authority. */
  presentationMode?: 'player' | 'observer';
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

function validRealmScreenRect(rect: RealmScreenRect | undefined): rect is RealmScreenRect {
  return rect !== undefined
    && Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.bottom)
    && rect.right > rect.left
    && rect.bottom > rect.top;
}

function realmScreenRectsOverlap(first: RealmScreenRect, second: RealmScreenRect) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function applyCastleLabelPlacement(
  button: HTMLButtonElement,
  leader: HTMLElement | undefined,
  placement: RealmLabelPlacement | undefined
) {
  if (!placement) {
    button.style.visibility = 'hidden';
    button.tabIndex = -1;
    button.dataset.displaced = 'false';
    if (leader) {
      leader.hidden = true;
      leader.dataset.active = 'false';
    }
    return;
  }

  const geometry = realmCastleLabelLeaderGeometry(placement);
  const labelX = `${placement.x.toFixed(2)}px`;
  const labelY = `${placement.y.toFixed(2)}px`;
  const anchorX = `${placement.projectedAnchor.x.toFixed(2)}px`;
  const anchorY = `${placement.projectedAnchor.y.toFixed(2)}px`;
  button.style.visibility = 'visible';
  button.tabIndex = 0;
  button.dataset.displaced = geometry.displaced ? 'true' : 'false';
  button.style.setProperty('--realm-castle-label-x', labelX);
  button.style.setProperty('--realm-castle-label-y', labelY);
  button.style.setProperty('--realm-castle-anchor-x', anchorX);
  button.style.setProperty('--realm-castle-anchor-y', anchorY);

  if (!leader) return;
  leader.hidden = !geometry.displaced;
  leader.dataset.active = geometry.displaced ? 'true' : 'false';
  leader.style.setProperty('--realm-castle-anchor-x', anchorX);
  leader.style.setProperty('--realm-castle-anchor-y', anchorY);
  leader.style.setProperty('--realm-castle-leader-length', `${geometry.length.toFixed(2)}px`);
  leader.style.setProperty('--realm-castle-leader-angle', `${geometry.angleRadians.toFixed(6)}rad`);
}

function applyCastleClusterPlacement(
  button: HTMLButtonElement,
  leader: HTMLElement | undefined,
  cluster: RealmCastleIdentityCluster | undefined
) {
  if (!cluster) {
    button.style.visibility = 'hidden';
    button.tabIndex = -1;
    button.dataset.displaced = 'false';
    if (leader) {
      leader.hidden = true;
      leader.dataset.active = 'false';
    }
    return;
  }

  const geometry = realmCastleLabelLeaderGeometry({
    x: cluster.x,
    y: cluster.y,
    projectedAnchor: cluster.anchor
  });
  const clusterX = `${cluster.x.toFixed(2)}px`;
  const clusterY = `${cluster.y.toFixed(2)}px`;
  const anchorX = `${cluster.anchor.x.toFixed(2)}px`;
  const anchorY = `${cluster.anchor.y.toFixed(2)}px`;
  button.style.visibility = 'visible';
  button.tabIndex = 0;
  button.dataset.displaced = geometry.displaced ? 'true' : 'false';
  button.style.setProperty('--realm-castle-cluster-x', clusterX);
  button.style.setProperty('--realm-castle-cluster-y', clusterY);
  button.style.setProperty('--realm-castle-cluster-width', `${cluster.width.toFixed(2)}px`);
  button.style.setProperty('--realm-castle-anchor-x', anchorX);
  button.style.setProperty('--realm-castle-anchor-y', anchorY);

  if (!leader) return;
  leader.hidden = !geometry.displaced;
  leader.dataset.active = geometry.displaced ? 'true' : 'false';
  leader.style.setProperty('--realm-castle-anchor-x', anchorX);
  leader.style.setProperty('--realm-castle-anchor-y', anchorY);
  leader.style.setProperty('--realm-castle-leader-length', `${geometry.length.toFixed(2)}px`);
  leader.style.setProperty('--realm-castle-leader-angle', `${geometry.angleRadians.toFixed(6)}rad`);
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
  ownFid: number | undefined,
  surface: RealmTerrainSurface
) {
  const stableMarkersRef = useRef<readonly RealmPeerCastleMarker[]>(EMPTY_PEER_CASTLE_MARKERS);
  const nextMarkers: RealmPeerCastleMarker[] = [];
  for (const castle of castles) {
    if (
      (ownFid === undefined || castle.ownerFid !== ownFid)
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

function sameRealmTerrainMetadata(
  first: readonly WarpkeepWorldTileMetadata[],
  second: readonly WarpkeepWorldTileMetadata[]
) {
  if (first === second) return true;
  return first.length === second.length && first.every((row, index) => {
    const candidate = second[index];
    return candidate !== undefined
      && row.tileKey === candidate.tileKey
      && row.realmId === candidate.realmId
      && row.s === candidate.s
      && row.ring === candidate.ring
      && row.sector === candidate.sector
      && row.terrainKind === candidate.terrainKind
      && row.passable === candidate.passable
      && row.movementCost === candidate.movementCost
      && row.staticContentKind === candidate.staticContentKind
      && row.generationVersion === candidate.generationVersion;
  });
}

/** Preserve the GPU scene when a fresh snapshot changes presentation only. */
function useStableRealmTerrainMetadata(rows: readonly WarpkeepWorldTileMetadata[]) {
  const stableRowsRef = useRef(rows);
  if (!sameRealmTerrainMetadata(stableRowsRef.current, rows)) {
    stableRowsRef.current = rows;
  }
  return stableRowsRef.current;
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

function CanonicalRealmUnavailable({
  onRequestReturn
}: Readonly<{ onRequestReturn: () => void }>) {
  return (
    <main className="realm-map-screen realm-map-screen--unavailable" role="alert">
      <div className="realm-map-screen__loading">
        <strong>Genesis 001 is unavailable</strong>
        <span>The canonical realm records did not pass validation.</span>
        <button type="button" onClick={onRequestReturn}>Return to Menu</button>
      </div>
    </main>
  );
}

/**
 * Keep the private canonical brand check outside the hook-heavy renderer.
 * Invalid or malformed runtime input must not be dereferenced, generate a
 * terrain surface, or register WebGL/browser effects before failing closed.
 */
export function RealmMapScreen(props: RealmMapScreenProps) {
  if (!isCanonicalGenesisSnapshot(props.snapshot, props.identity.fid)) {
    return <CanonicalRealmUnavailable onRequestReturn={props.onRequestReturn} />;
  }
  return <CanonicalRealmMapScreen {...props} />;
}

function CanonicalRealmMapScreen({
  identity,
  snapshot,
  onRequestReturn,
  qualityOverride,
  presentationMode = 'player'
}: RealmMapScreenProps) {
  // The observer is a development-only presentation of an already-sanitized
  // loopback snapshot. Compile the mode out of production even if a future
  // caller accidentally supplies the internal prop.
  const observerMode = import.meta.env.DEV && presentationMode === 'observer';
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackMapRef = useRef<SVGSVGElement>(null);
  const sceneRef = useRef<RealmSceneHandle | null>(null);
  const inspectorFocusRef = useRef<HTMLButtonElement>(null);
  const navigatorTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorId = useId();
  const navigatorId = useId();
  const ownCastle = snapshot.ownCastle;
  const sharedPlayers = snapshot.players;
  const sharedProfiles = snapshot.profiles;
  const sharedTileMetadata = useStableRealmTerrainMetadata(snapshot.tileMetadata);
  const otherCastles = snapshot.castles;
  const surface = useMemo(
    () => createRealmTerrainSurface(
      snapshot.realm.numericSeed,
      snapshot.realm.authoritativeRadius,
      snapshot.realm.renderRadius
    ),
    [
      snapshot.realm.authoritativeRadius,
      snapshot.realm.numericSeed,
      snapshot.realm.renderRadius
    ]
  );
  const tileMetadataByKey = useMemo(() => new Map(
    sharedTileMetadata.map((metadata) => [metadata.tileKey, metadata] as const)
  ), [sharedTileMetadata]);
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const tileMetadataByKeyRef = useRef(tileMetadataByKey);
  tileMetadataByKeyRef.current = tileMetadataByKey;
  const ownCastleQ = ownCastle.q;
  const ownCastleR = ownCastle.r;
  const keepCoord = useMemo<HexCoord>(
    () => ({ q: ownCastleQ, r: ownCastleR }),
    [ownCastleQ, ownCastleR]
  );
  const peerCastles = useStablePeerCastleMarkers(
    otherCastles,
    observerMode ? undefined : identity.fid,
    surface
  );
  const hasNearbyFoundingKeeps = peerCastles.some((castle) => (
    hexDistance(keepCoord, castle) <= 4
  ));
  const allCastles = useMemo<readonly RealmCastleProjection[]>(() => {
    const byId = new Map<number, RealmCastleProjection>();
    for (const castle of otherCastles) {
      if (isPlayableRealmCoord(surface, castle)) byId.set(castle.castleId, castle);
    }
    if (isPlayableRealmCoord(surface, ownCastle)) {
      byId.set(ownCastle.castleId, ownCastle);
    }
    return [...byId.values()].sort((left, right) => left.castleId - right.castleId);
  }, [otherCastles, ownCastle, surface]);
  const allCastlesRef = useRef(allCastles);
  allCastlesRef.current = allCastles;
  const expectedCastleCountRef = useRef(allCastles.length);
  expectedCastleCountRef.current = allCastles.length;
  const profileRecords = useMemo(() => {
    return new Map<number, CastleLabelRecord>(allCastles.map((castle) => [
      castle.castleId,
      {
        castle,
        profile: publicProfileForCastle(
          castle.ownerFid,
          sharedProfiles,
          sharedPlayers,
          observerMode ? undefined : identity
        )
      }
    ]));
  }, [allCastles, identity, observerMode, sharedPlayers, sharedProfiles]);
  const identityReadyCastleIds = useMemo(() => new Set(
    [...profileRecords].flatMap(([castleId, record]) => (
      castleProfileIdentityReady(record.profile) ? [castleId] : []
    ))
  ), [profileRecords]);
  const identityReadyCastleIdsRef = useRef(identityReadyCastleIds);
  identityReadyCastleIdsRef.current = identityReadyCastleIds;
  const navigatorCastles = useMemo(() => allCastles.map((castle) => ({
    castleId: castle.castleId,
    label: castleProfileLabel(profileRecords.get(castle.castleId)!.profile),
    name: castle.name,
    q: castle.q,
    r: castle.r
  })), [allCastles, profileRecords]);
  const terrainPlacements = useMemo(() => createHegemonyCastlePlacements([
    ...(observerMode ? [] : [{ id: 'own-keep', coord: keepCoord }]),
    ...peerCastles.map((castle) => ({
      id: `peer-castle-${castle.castleId}`,
      coord: { q: castle.q, r: castle.r }
    }))
  ]), [keepCoord, observerMode, peerCastles]);
  const fallbackFoundations = useMemo(() => terrainPlacements.map((placement, index) => {
    const world = axialToWorld(placement.coord, HEX_SIZE);
    const cell = terrainCellByCoord(surface.renderMap, placement.coord);
    const terrainKindCandidate = tileMetadataByKey.get(
      hexKey(placement.coord)
    )?.terrainKind;
    const color = sampleLowlandsColor(surface.renderMap.worldSeed, world, {
      cell: cell ?? undefined,
      hexSize: HEX_SIZE,
      playableRadius: surface.playableMap.radius,
      renderRadius: surface.renderMap.radius,
      terrainKind: isRealmTerrainKind(terrainKindCandidate)
        ? terrainKindCandidate
        : undefined,
      placements: terrainPlacements
    });
    return {
      ...placement,
      color: colorToCss(color),
      gradientId: `realm-fallback-foundation-${index}`,
      world
    };
  }), [surface, terrainPlacements, tileMetadataByKey]);
  const quality = useMemo(() => initialQuality(qualityOverride), [qualityOverride]);
  const qualitySpec = REALM_QUALITY_SPECS[quality];
  const [rendererMode, setRendererMode] = useState<RendererMode>('loading');
  const rendererModeRef = useRef<RendererMode>('loading');
  rendererModeRef.current = rendererMode;
  const [cameraMode, setCameraMode] = useState<RealmCameraMode>('realm');
  const [interaction, dispatchInteraction] = useReducer(
    realmInteractionReducer,
    { keepCoord, hasNearbyFoundingKeeps },
    ({ keepCoord: initialCoord, hasNearbyFoundingKeeps: hasNearby }) => ({
      ...createRealmInteractionState(initialCoord),
      cameraTarget: hasNearby
        ? { kind: 'founding-district' as const }
        : { kind: 'realm' as const }
    })
  );
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;
  const selectedCoord = interaction.selectedCell;
  const selectedCoordRef = useRef<HexCoord>(interaction.selectedCell);
  const hoveredCoordRef = useRef<HexCoord | null>(null);
  const [hoveredCastleId, setHoveredCastleId] = useState<number>();
  const [visibleCastleLabels, setVisibleCastleLabels] = useState<readonly VisibleCastleLabel[]>([]);
  const [visibleCastleClusters, setVisibleCastleClusters] = useState<readonly RealmCastleIdentityCluster[]>([]);
  const latestProjectionRef = useRef<RealmCastleProjectionFrame>({ width: 0, height: 0, castles: [] });
  const previousLabelLayoutRef = useRef<readonly RealmLabelPlacement[]>([]);
  const labelProjectionRafRef = useRef<number | null>(null);
  const compositionRafRef = useRef<number | null>(null);
  const safeAreaInsetsRef = useRef({ top: 0, right: 0, bottom: 0, left: 0 });
  const labelMembershipSignatureRef = useRef('');
  const clusterLayoutSignatureRef = useRef('');
  const presentedCastleIdsRef = useRef<readonly number[]>([]);
  const handledKeyboardIntentSequenceRef = useRef(-1);
  const labelMeasurementCacheRef = useRef(new Map<string, Readonly<{
    element: HTMLElement;
    measurement: RealmMeasuredLabelRectangle;
    text: string;
  }>>());
  const reducedMotion = useReducedMotionPreference();
  const viewBox = useMemo(() => viewBoxForSurface(surface), [surface]);
  const selectedCell = selectedCellFor(surface, selectedCoord, keepCoord);
  const selectedTerrainKindCandidate = tileMetadataByKey.get(hexKey(selectedCoord))?.terrainKind;
  const selectedTerrainKind = isRealmTerrainKind(selectedTerrainKindCandidate)
    ? selectedTerrainKindCandidate
    : undefined;
  const selectedCastle = interaction.selectedCastle
    ? allCastles.find((castle) => castle.castleId === interaction.selectedCastle?.castleId)
    : undefined;
  const castleAtSelectedCell = allCastles.find((castle) => sameCoord(castle, selectedCoord));
  const inspectorCastle = interaction.inspectorOpen && interaction.inspectorTarget
    ? allCastles.find((castle) => castle.castleId === interaction.inspectorTarget?.castleId)
    : undefined;
  const ownProfile = profileRecords.get(ownCastle.castleId)?.profile;
  const marksStatus = ownProfile?.communityStatsVisible && ownProfile.marksBalanceMicros !== undefined
      ? 'ready'
      : 'unavailable';
  const focusedCastleId = interaction.cameraTarget.kind === 'castle'
    ? interaction.cameraTarget.castleId
    : interaction.cameraTarget.kind === 'castle-cluster'
      ? interaction.cameraTarget.representativeCastleId
      : undefined;
  const labelLayoutContextRef = useRef({
    ownCastleId: observerMode ? undefined : ownCastle.castleId,
    selectedCastleId: selectedCastle?.castleId,
    hoveredCastleId,
    focusedCastleId
  });
  labelLayoutContextRef.current = {
    ownCastleId: observerMode ? undefined : ownCastle.castleId,
    selectedCastleId: selectedCastle?.castleId,
    hoveredCastleId,
    focusedCastleId
  };

  useEffect(() => {
    // RealmMapScreen mounts only on entry. Focus once so keyboard navigation is
    // immediately available, then leave focus wherever the player moves it.
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const target = interaction.keyboardIntent.target;
    if (handledKeyboardIntentSequenceRef.current === interaction.keyboardIntent.sequence) {
      if (target.kind === 'castle-label') {
        const label = rootRef.current
          ?.querySelector<HTMLButtonElement>(`.realm-castle-label[data-castle-id="${target.castleId}"]`);
        const activeElement = document.activeElement;
        // Camera animation can briefly remove and recreate the newly revealed
        // label after focus was transferred. Recover only when focus fell back
        // to the document/map; never steal it from another control the player
        // deliberately reached.
        if (
          label
          && label.tabIndex >= 0
          && label.style.visibility !== 'hidden'
          && (
            activeElement === null
            || activeElement === document.body
            || activeElement === document.documentElement
            || activeElement === rootRef.current
          )
        ) label.focus({ preventScroll: true });
      }
      return;
    }
    if (target.kind === 'map') {
      rootRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'castle-label') {
      const label = rootRef.current
        ?.querySelector<HTMLButtonElement>(`.realm-castle-label[data-castle-id="${target.castleId}"]`)
      if (label && label.tabIndex >= 0 && label.style.visibility !== 'hidden') {
        label.focus({ preventScroll: true });
      }
      // A cluster activation makes its representative mandatory, but measured
      // placement lands on the following projection frame. Keep the intent
      // pending until the revealed label exists instead of dropping focus to
      // the document when the cluster button unmounts.
      if (document.activeElement !== label) return;
    } else if (target.kind === 'navigator-trigger') {
      navigatorTriggerRef.current?.focus({ preventScroll: true });
    }
    handledKeyboardIntentSequenceRef.current = interaction.keyboardIntent.sequence;
  }, [interaction.keyboardIntent, visibleCastleLabels]);

  useEffect(() => {
    selectedCoordRef.current = keepCoord;
    dispatchInteraction({ type: 'select-cell', coord: keepCoord });
  }, [keepCoord]);

  const selectCoord = useCallback((coord: HexCoord) => {
    if (
      !isPlayableRealmCoord(surfaceRef.current, coord)
      || tileMetadataByKeyRef.current.get(hexKey(coord))?.passable === false
    ) return;
    setHoveredCastleId(undefined);
    selectedCoordRef.current = coord;
    dispatchInteraction({ type: 'select-cell', coord });
  }, []);

  const selectCastle = useCallback((castle: RealmCastleProjection) => {
    selectedCoordRef.current = { q: castle.q, r: castle.r };
    dispatchInteraction({
      type: 'activate-castle',
      castleId: castle.castleId,
      coord: { q: castle.q, r: castle.r }
    });
    sceneRef.current?.focusCastle(castle.castleId);
  }, []);

  const markRendererUnavailable = useCallback(() => {
    rendererModeRef.current = 'fallback';
    setRendererMode('fallback');
  }, []);

  const isSceneCoordPassable = useCallback((coord: HexCoord) => (
    isPlayableRealmCoord(surfaceRef.current, coord)
    && tileMetadataByKeyRef.current.get(hexKey(coord))?.passable !== false
  ), []);

  const updateHoveredCoord = useCallback((coord: HexCoord | null) => {
    // Hover is an imperative WebGL concern. It never enters durable React
    // selection/HUD/inspector state, even under high-frequency pointer input.
    if (sameCoord(hoveredCoordRef.current, coord)) return;
    hoveredCoordRef.current = coord;
    sceneRef.current?.setHovered(coord);
  }, []);

  const handleSceneTargetHover = useCallback((target: RealmInteractionTarget | null) => {
    if (rendererModeRef.current !== 'webgl') return;
    // Both terrain and castle hits receive the same restrained ground outline.
    // This keeps hover feedback clear without mutating durable selection state
    // or applying a bright post-process effect to the castle model.
    updateHoveredCoord(target?.coord ?? null);
    setHoveredCastleId((current) => {
      const next = target?.kind === 'castle' ? target.castleId : undefined;
      return current === next ? current : next;
    });
  }, [updateHoveredCoord]);

  const handleSceneTargetSelect = useCallback((target: RealmInteractionTarget) => {
    if (rendererModeRef.current !== 'webgl') return;
    if (target.kind === 'castle') {
      const castle = allCastlesRef.current.find((candidate) => candidate.castleId === target.castleId);
      if (castle) selectCastle(castle);
      return;
    }
    selectCoord(target.coord);
  }, [selectCastle, selectCoord]);

  const updateCastleProjection = useCallback((frame: RealmCastleProjectionFrame) => {
    latestProjectionRef.current = frame;
    if (labelProjectionRafRef.current !== null) return;
    labelProjectionRafRef.current = window.requestAnimationFrame(() => {
      labelProjectionRafRef.current = null;
      const frame = latestProjectionRef.current;
      const root = rootRef.current;
      if (!root || frame.width <= 0 || frame.height <= 0) return;
      const context = labelLayoutContextRef.current;
      const candidateCastles = frame.castles.slice(0, CASTLE_LABEL_LAYOUT_MAX_CASTLES);
      // Castle existence is a world concern, not a label-layout concern. Keep
      // every canonical candidate available to the scene's own frustum/LOD
      // culling so a crowded nameplate can never erase its castle or raycast
      // target and leave a detached identity affordance behind.
      const renderableCastleIds = candidateCastles.map((castle) => castle.castleId);
      // Every visible keep receives a trustworthy public label. Missing
      // profile data falls back to a neutral keep name instead of silently
      // removing the castle from the spatial identity layer.
      const labelCastles = candidateCastles;
      const maximumLabels = labelCastles.length;
      const eligibleLabelCount = realmEligibleCastleProjectionCount({
        ...frame,
        castles: candidateCastles
      });
      const provisional = resolveVisibleCastleLabels(
        { ...frame, castles: labelCastles },
        context.ownCastleId,
        context.selectedCastleId,
        maximumLabels,
        context.hoveredCastleId ?? context.focusedCastleId
      );
      const buttons = new Map<number, HTMLButtonElement>();
      root.querySelectorAll<HTMLButtonElement>('button.realm-castle-label[data-castle-id]')
        .forEach((button) => {
          const castleId = Number(button.dataset.castleId);
          if (Number.isSafeInteger(castleId)) buttons.set(castleId, button);
        });
      const leaders = new Map<number, HTMLElement>();
      root.querySelectorAll<HTMLElement>('[data-realm-label-leader][data-castle-id]')
        .forEach((leader) => {
          const castleId = Number(leader.dataset.castleId);
          if (Number.isSafeInteger(castleId)) leaders.set(castleId, leader);
        });
      const clusterButtons = new Map<string, HTMLButtonElement>();
      root.querySelectorAll<HTMLButtonElement>(
        'button[data-realm-castle-cluster][data-cluster-key]'
      ).forEach((button) => {
        const clusterKey = button.dataset.clusterKey;
        if (clusterKey) clusterButtons.set(clusterKey, button);
      });
      const clusterLeaders = new Map<string, HTMLElement>();
      root.querySelectorAll<HTMLElement>(
        '[data-realm-cluster-leader][data-cluster-key]'
      ).forEach((leader) => {
        const clusterKey = leader.dataset.clusterKey;
        if (clusterKey) clusterLeaders.set(clusterKey, leader);
      });
      const measurementLabels = new Map<number, HTMLElement>();
      root.querySelectorAll<HTMLElement>('.realm-castle-label--measurement[data-measure-castle-id]')
        .forEach((label) => {
          const castleId = Number(label.dataset.measureCastleId);
          if (Number.isSafeInteger(castleId)) measurementLabels.set(castleId, label);
        });
      const compactMeasurementLabels = new Map<number, HTMLElement>();
      root.querySelectorAll<HTMLElement>(
        '.realm-castle-label--measurement[data-measure-compact-castle-id]'
      ).forEach((label) => {
        const castleId = Number(label.dataset.measureCompactCastleId);
        if (Number.isSafeInteger(castleId)) compactMeasurementLabels.set(castleId, label);
      });
      for (const cacheKey of labelMeasurementCacheRef.current.keys()) {
        const [castleIdCopy, presentation] = cacheKey.split(':');
        const castleId = Number(castleIdCopy);
        const current = presentation === 'compact'
          ? compactMeasurementLabels
          : measurementLabels;
        if (!Number.isSafeInteger(castleId) || !current.has(castleId)) {
          labelMeasurementCacheRef.current.delete(cacheKey);
        }
      }
      if (measurementLabels.size === 0) {
        const eligibleCastleIds = candidateCastles.filter((castle) => (
          castle.visible
          && Number.isFinite(castle.x)
          && Number.isFinite(castle.y)
          && castle.x >= 0
          && castle.x <= frame.width
          && castle.y >= 0
          && castle.y <= frame.height
        )).map((castle) => castle.castleId);
        const placedCastleIds = provisional.map((label) => label.castleId);
        const placedCastleIdSet = new Set(placedCastleIds);
        const overflowCastleIds = eligibleCastleIds.filter((castleId) => (
          !placedCastleIdSet.has(castleId)
        ));
        presentedCastleIdsRef.current = renderableCastleIds;
        sceneRef.current?.setPresentedCastleIds(renderableCastleIds);
        root.dataset.labelEligibleCount = String(eligibleLabelCount);
        root.dataset.labelPlacedCount = String(provisional.length);
        root.dataset.labelUnplacedCount = String(Math.max(0, eligibleLabelCount - provisional.length));
        root.dataset.individualCastleCount = String(provisional.length);
        root.dataset.labelClusteredCount = '0';
        root.dataset.clusterRepresentativeAnchorViolationCount = '0';
        root.dataset.clusterCastleOverlapCount = '0';
        root.dataset.clusterMemberDistanceViolationCount = '0';
        root.dataset.labelClusterOverflowCount = String(Math.max(
          0,
          eligibleLabelCount - provisional.length
        ));
        root.dataset.labelAccountingValid = String(realmCastleIdentityCoverageValid({
          eligibleCastleIds,
          individualCastleIds: placedCastleIds,
          clusters: [],
          overflowCastleIds,
          exploreCastleIds: allCastlesRef.current.map((castle) => castle.castleId)
        }));
        root.dataset.labelMissingIdentityCount = String(candidateCastles.filter((castle) => (
          castle.visible
          && castle.x >= 0
          && castle.x <= frame.width
          && castle.y >= 0
          && castle.y <= frame.height
          && !identityReadyCastleIdsRef.current.has(castle.castleId)
        )).length);
        const signature = provisional.map((label) => `${label.castleId}:${label.compact}`).join('|');
        if (signature !== labelMembershipSignatureRef.current) {
          labelMembershipSignatureRef.current = signature;
          setVisibleCastleLabels(provisional);
        }
        if (clusterLayoutSignatureRef.current !== '') {
          clusterLayoutSignatureRef.current = '';
          setVisibleCastleClusters([]);
        }
        return;
      }

      const reservedUiRects = measuredVisibleRealmUiRects(root, [
        '.realm-hud',
        '.castle-inspection',
        '.realm-hud__actions',
        '.realm-cell-navigator > button',
        '.realm-cell-navigator__dialog'
      ]);
      const anchors = labelCastles.map((castle) => {
        const measurementLabel = measurementLabels.get(castle.castleId);
        const compactMeasurementLabel = compactMeasurementLabels.get(castle.castleId);
        const measuredRectangle = (
          element: HTMLElement | undefined,
          presentation: 'full' | 'compact'
        ) => {
          if (!element) return undefined;
          const cacheKey = `${castle.castleId}:${presentation}`;
          const text = element.textContent ?? '';
          const cached = labelMeasurementCacheRef.current.get(cacheKey);
          if (cached && cached.element === element && cached.text === text) {
            return cached.measurement;
          }
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const measurement = {
              offsetX: -rect.width / 2,
              offsetY: -rect.height,
              width: rect.width,
              height: rect.height
            };
            labelMeasurementCacheRef.current.set(cacheKey, {
              element,
              measurement,
              text
            });
            return measurement;
          }
          return undefined;
        };
        const full = measuredRectangle(measurementLabel, 'full');
        const compact = measuredRectangle(compactMeasurementLabel, 'compact') ?? {
          offsetX: -CASTLE_LABEL_COMPACT_WIDTH / 2,
          offsetY: -CASTLE_LABEL_COMPACT_HEIGHT,
          width: CASTLE_LABEL_COMPACT_WIDTH,
          height: CASTLE_LABEL_COMPACT_HEIGHT
        };
        return {
          castleId: castle.castleId,
          x: castle.x,
          y: castle.y,
          inFrontOfCamera: castle.visible,
          priority: castle.castleId === context.selectedCastleId
            ? 'selected' as const
            : castle.castleId === context.hoveredCastleId
                || castle.castleId === context.focusedCastleId
              ? 'hovered' as const
              : castle.castleId === context.ownCastleId
                ? 'own' as const
                : castle.distance > CASTLE_LABEL_FAR_DISTANCE ? 'far' as const : 'near' as const,
          distance: castle.distance,
          occlusionBounds: castle.castleBounds,
          measurements: {
            full,
            compact
          }
        };
      });
      const safeAreaBounds = {
        left: safeAreaInsetsRef.current.left + 8,
        top: safeAreaInsetsRef.current.top + 8,
        right: frame.width - safeAreaInsetsRef.current.right - 8,
        bottom: frame.height - safeAreaInsetsRef.current.bottom - 8
      };
      const mandatoryCastleIds = [
        context.selectedCastleId,
        context.hoveredCastleId,
        context.focusedCastleId,
        context.ownCastleId
      ].filter((castleId): castleId is number => (
        castleId !== undefined
        && candidateCastles.some((castle) => castle.castleId === castleId)
      ));
      const layout = resolveMeasuredRealmLabelLayout({
        anchors,
        viewportBounds: { left: 0, top: 0, right: frame.width, bottom: frame.height },
        safeAreaBounds,
        reservedUiRects,
        maximumLabels,
        mandatoryCastleIds,
        previousPlacements: previousLabelLayoutRef.current,
        hysteresis: { membershipDistance: 5, anchorJitterPixels: 2 },
        collisionPaddingPixels: 4
      });
      const eligibleCastleIds = new Set(candidateCastles.filter((castle) => (
        castle.visible
        && Number.isFinite(castle.x)
        && Number.isFinite(castle.y)
        && castle.x >= 0
        && castle.x <= frame.width
        && castle.y >= 0
        && castle.y <= frame.height
      )).map((castle) => castle.castleId));
      const placedCastleIds = new Set(layout.placements.map((placement) => placement.castleId));
      const clusterCastleIds = [...eligibleCastleIds]
        .filter((castleId) => !placedCastleIds.has(castleId))
        .sort((left, right) => left - right);
      const castleCollisionBounds = candidateCastles
        .filter((castle) => castle.visible)
        .map((castle) => castle.castleBounds)
        .filter(validRealmScreenRect);
      const clusterLayout = resolveRealmCastleIdentityClusters({
        projections: candidateCastles,
        clusterCastleIds,
        preferredRepresentativeCastleIds: identityReadyCastleIdsRef.current,
        safeAreaBounds,
        occupiedRects: [
          ...reservedUiRects,
          ...layout.placements.map((placement) => placement.bounds)
        ],
        protectedCastleRects: castleCollisionBounds,
        maximumClusters: frame.width <= 680 ? 3 : 6,
        collisionPaddingPixels: 4
      });
      const eligibleCullReasons = new Map<string, number>();
      layout.culled.forEach((entry) => {
        if (!eligibleCastleIds.has(entry.castleId)) return;
        eligibleCullReasons.set(
          entry.reason,
          (eligibleCullReasons.get(entry.reason) ?? 0) + 1
        );
      });
      root.dataset.labelEligibleCount = String(eligibleLabelCount);
      root.dataset.labelPlacedCount = String(layout.placements.length);
      root.dataset.labelUnplacedCount = String(Math.max(
        0,
        eligibleLabelCount - layout.placements.length
      ));
      root.dataset.labelCullReasons = [...eligibleCullReasons]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([reason, count]) => `${reason}:${count}`)
        .join(',');
      root.dataset.individualCastleCount = String(layout.placements.length);
      root.dataset.labelClusteredCount = String(clusterLayout.clusters.reduce((count, cluster) => (
        count + cluster.castleIds.length
      ), 0));
      root.dataset.labelClusterOverflowCount = String(clusterLayout.overflowCastleIds.length);
      const clusterProjectionById = new Map(candidateCastles.map((castle) => [
        castle.castleId,
        castle
      ]));
      root.dataset.clusterRepresentativeAnchorViolationCount = String(
        clusterLayout.clusters.filter((cluster) => {
          const representative = clusterProjectionById.get(cluster.representativeCastleId);
          return representative === undefined || Math.hypot(
            representative.x - cluster.anchor.x,
            representative.y - cluster.anchor.y
          ) > 0.015;
        }).length
      );
      root.dataset.clusterCastleOverlapCount = String(
        clusterLayout.clusters.filter((cluster) => castleCollisionBounds.some((bounds) => (
          realmScreenRectsOverlap(cluster.bounds, bounds)
        ))).length
      );
      root.dataset.clusterMemberDistanceViolationCount = String(
        clusterLayout.clusters.filter((cluster) => {
          const representative = clusterProjectionById.get(cluster.representativeCastleId);
          return representative === undefined || cluster.castleIds.some((castleId) => {
            const member = clusterProjectionById.get(castleId);
            return member === undefined || Math.hypot(
              member.x - representative.x,
              member.y - representative.y
            ) > REALM_IDENTITY_CLUSTER_MAX_MEMBER_DISTANCE_PIXELS;
          });
        }).length
      );
      root.dataset.labelAccountingValid = String(realmCastleIdentityCoverageValid({
        eligibleCastleIds: [...eligibleCastleIds],
        individualCastleIds: layout.placements.map((placement) => placement.castleId),
        clusters: clusterLayout.clusters,
        overflowCastleIds: clusterLayout.overflowCastleIds,
        exploreCastleIds: allCastlesRef.current.map((castle) => castle.castleId)
      }));
      root.dataset.labelMissingIdentityCount = String([...eligibleCastleIds].filter((castleId) => (
        !identityReadyCastleIdsRef.current.has(castleId)
      )).length);
      previousLabelLayoutRef.current = layout.placements;
      const projectionById = new Map(labelCastles.map((castle) => [castle.castleId, castle]));
      const nextLabels = layout.placements.flatMap((placement): VisibleCastleLabel[] => {
        const projection = projectionById.get(placement.castleId);
        return projection ? [{
          ...projection,
          x: placement.x,
          y: placement.y,
          compact: placement.presentation === 'compact',
          projectedAnchor: placement.projectedAnchor
        }] : [];
      });
      const signature = nextLabels.map((label) => `${label.castleId}:${label.compact}`).join('|');
      if (signature !== labelMembershipSignatureRef.current) {
        labelMembershipSignatureRef.current = signature;
        setVisibleCastleLabels(nextLabels);
      }
      const clusterSignature = realmCastleClusterMembershipSignature(clusterLayout.clusters);
      if (clusterSignature !== clusterLayoutSignatureRef.current) {
        clusterLayoutSignatureRef.current = clusterSignature;
        setVisibleCastleClusters(clusterLayout.clusters);
      }
      presentedCastleIdsRef.current = renderableCastleIds;
      sceneRef.current?.setPresentedCastleIds(renderableCastleIds);
      const placementsById = new Map(layout.placements.map((placement) => [placement.castleId, placement]));
      for (const [castleId, button] of buttons) {
        applyCastleLabelPlacement(button, leaders.get(castleId), placementsById.get(castleId));
      }
      const clustersByKey = new Map(clusterLayout.clusters.map((cluster) => [cluster.key, cluster]));
      for (const [clusterKey, button] of clusterButtons) {
        applyCastleClusterPlacement(
          button,
          clusterLeaders.get(clusterKey),
          clustersByKey.get(clusterKey)
        );
      }
    });
  }, []);

  const updateCastlePresentationTelemetry = useCallback((
    telemetry: RealmCastleInstancePresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.presentedModelCount = String(telemetry.presentedModelCount);
    root.dataset.raycastTargetCount = String(telemetry.raycastTargetCount);
  }, []);

  const updateTerrainPresentationTelemetry = useCallback((
    telemetry: RealmTerrainPresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.semanticTerrainCellCount = String(telemetry.semanticCellCount);
    root.dataset.semanticTerrainKindCount = String(telemetry.semanticKindCount);
    root.dataset.semanticTerrainFeatureCount = String(telemetry.semanticFeatureCount);
    root.dataset.semanticTerrainFeatureDrawCalls = String(telemetry.semanticFeatureDrawCalls);
    root.dataset.totalTerrainDetailInstanceCount = String(telemetry.totalDetailInstanceCount);
    root.dataset.totalTerrainDetailDrawCalls = String(telemetry.totalDetailDrawCalls);
  }, []);

  const updateSceneComposition = useCallback(() => {
    if (compositionRafRef.current !== null) return;
    compositionRafRef.current = window.requestAnimationFrame(() => {
      compositionRafRef.current = null;
      const root = rootRef.current;
      if (root) {
        const composition = measuredRealmComposition(root);
        safeAreaInsetsRef.current = {
          top: composition.safeAreaInsets?.top ?? 0,
          right: composition.safeAreaInsets?.right ?? 0,
          bottom: composition.safeAreaInsets?.bottom ?? 0,
          left: composition.safeAreaInsets?.left ?? 0
        };
        sceneRef.current?.setComposition(composition);
        updateCastleProjection(latestProjectionRef.current);
      }
    });
  }, [updateCastleProjection]);

  useEffect(() => () => {
    if (labelProjectionRafRef.current !== null) {
      window.cancelAnimationFrame(labelProjectionRafRef.current);
      labelProjectionRafRef.current = null;
    }
    if (compositionRafRef.current !== null) {
      window.cancelAnimationFrame(compositionRafRef.current);
      compositionRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    updateSceneComposition();
    const root = rootRef.current;
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(updateSceneComposition)
      : undefined;
    if (root) {
      observer?.observe(root);
      root.querySelectorAll<HTMLElement>(
        '.realm-hud, .realm-hud__actions, .castle-inspection, .realm-cell-navigator'
      ).forEach((element) => observer?.observe(element));
    }
    window.addEventListener('resize', updateSceneComposition, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSceneComposition);
    };
  }, [interaction.inspectorOpen, interaction.navigatorOpen, rendererMode, updateSceneComposition]);

  useEffect(() => {
    updateCastleProjection(latestProjectionRef.current);
  }, [focusedCastleId, hoveredCastleId, interaction.inspectorOpen, interaction.navigatorOpen, profileRecords, selectedCastle?.castleId, updateCastleProjection, visibleCastleLabels]);

  useEffect(() => {
    if (rendererMode !== 'fallback') return undefined;
    const updateFallbackProjection = () => {
      const rootRect = rootRef.current?.getBoundingClientRect();
      const svgRect = fallbackMapRef.current?.getBoundingClientRect();
      const width = Math.max(1, rootRect?.width || window.innerWidth || 1);
      const height = Math.max(1, rootRect?.height || window.innerHeight || 1);
      const svgViewport = svgRect
        && rootRect
        && svgRect.width > 0
        && svgRect.height > 0
        ? {
            left: svgRect.left - rootRect.left,
            top: svgRect.top - rootRect.top,
            width: Math.max(1, svgRect.width),
            height: Math.max(1, svgRect.height)
          }
        : { left: 0, top: 0, width, height };
      updateCastleProjection({
        width,
        height,
        castles: allCastles.map((castle) => fallbackCastleProjection(
          castle,
          viewBox,
          { width, height },
          svgViewport
        ))
      });
    };
    updateFallbackProjection();
    window.addEventListener('resize', updateFallbackProjection, { passive: true });
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(updateFallbackProjection)
      : undefined;
    if (rootRef.current) observer?.observe(rootRef.current);
    if (fallbackMapRef.current) observer?.observe(fallbackMapRef.current);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateFallbackProjection);
    };
  }, [allCastles, rendererMode, updateCastleProjection, viewBox]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canUseWebGL()) {
      markRendererUnavailable();
      return undefined;
    }

    let scene: RealmSceneHandle | null = null;
    try {
      rendererModeRef.current = 'loading';
      setRendererMode('loading');
      latestProjectionRef.current = { width: 0, height: 0, castles: [] };
      previousLabelLayoutRef.current = [];
      labelMembershipSignatureRef.current = '';
      clusterLayoutSignatureRef.current = '';
      presentedCastleIdsRef.current = [];
      if (rootRef.current) {
        rootRef.current.dataset.presentedModelCount = '0';
        rootRef.current.dataset.raycastTargetCount = '0';
        rootRef.current.dataset.semanticTerrainCellCount = '0';
        rootRef.current.dataset.semanticTerrainKindCount = '0';
        rootRef.current.dataset.semanticTerrainFeatureCount = '0';
        rootRef.current.dataset.semanticTerrainFeatureDrawCalls = '0';
        rootRef.current.dataset.totalTerrainDetailInstanceCount = '0';
        rootRef.current.dataset.totalTerrainDetailDrawCalls = '0';
      }
      setVisibleCastleLabels([]);
      setVisibleCastleClusters([]);
      setCameraMode('realm');
      scene = createRealmScene({
        canvas,
        surface,
        keepCoord,
        ownCastleId: observerMode ? undefined : ownCastle.castleId,
        otherCastles: peerCastles,
        terrainMetadata: sharedTileMetadata,
        quality: qualitySpec,
        reducedMotion,
        baseUrl: import.meta.env.BASE_URL || '/',
        isCoordPassable: isSceneCoordPassable,
        onCameraModeChange: setCameraMode,
        onHover: () => undefined,
        onTargetHover: handleSceneTargetHover,
        onKeepStatusChange: () => undefined,
        onCastlesReady: (castleCount) => {
          if (castleCount !== expectedCastleCountRef.current) {
            markRendererUnavailable();
            return;
          }
          rendererModeRef.current = 'webgl';
          setRendererMode('webgl');
          updateSceneComposition();
        },
        onCastlePresentationTelemetry: updateCastlePresentationTelemetry,
        onTerrainPresentationTelemetry: updateTerrainPresentationTelemetry,
        onCastleProjection: updateCastleProjection,
        onRendererUnavailable: markRendererUnavailable,
        onSelect: () => undefined,
        onTargetSelect: handleSceneTargetSelect
      });
      sceneRef.current = scene;
      scene.setPresentedCastleIds(presentedCastleIdsRef.current);
      scene.setSelected(selectedCoordRef.current);
      scene.setSelectedCastleId(interactionRef.current.selectedCastle?.castleId ?? null);
      scene.setHovered(hoveredCoordRef.current);
      const cameraTarget: RealmCameraTarget = interactionRef.current.cameraTarget;
      if (cameraTarget.kind === 'castle') scene.focusCastle(cameraTarget.castleId);
      else if (cameraTarget.kind === 'castle-cluster') {
        scene.focusCastleGroup(cameraTarget.castleIds);
      }
      else if (cameraTarget.kind === 'cell') scene.focusCell(cameraTarget.coord);
      else if (cameraTarget.kind === 'keep') scene.recenterKeep();
      else if (cameraTarget.kind === 'founding-district') scene.frameFoundingDistrict();
      else scene.showRealm();
    } catch {
      markRendererUnavailable();
    }

    return () => {
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [handleSceneTargetHover, handleSceneTargetSelect, hasNearbyFoundingKeeps, isSceneCoordPassable, keepCoord, markRendererUnavailable, observerMode, ownCastle.castleId, peerCastles, qualitySpec, reducedMotion, sharedTileMetadata, surface, updateCastlePresentationTelemetry, updateCastleProjection, updateSceneComposition, updateTerrainPresentationTelemetry]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedCoord);
  }, [selectedCoord]);

  useEffect(() => {
    sceneRef.current?.setSelectedCastleId(selectedCastle?.castleId ?? null);
  }, [selectedCastle?.castleId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      // Treat one physical Escape press as one hierarchy step. Ignoring the
      // browser's auto-repeat prevents a held key from closing a surface and
      // then immediately returning the player to the menu.
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
      const result = resolveRealmEscape(interactionRef.current);
      if (result.decision === 'close-inspector') {
        event.preventDefault();
        dispatchInteraction({ type: 'close-inspector' });
      } else if (result.decision === 'close-navigator') {
        event.preventDefault();
        dispatchInteraction({ type: 'close-navigator' });
      } else {
        onRequestReturn();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onRequestReturn]);

  const recenterKeep = useCallback(() => {
    selectCoord(keepCoord);
    dispatchInteraction({ type: 'set-camera-target', target: { kind: 'keep' } });
    sceneRef.current?.recenterKeep();
  }, [keepCoord, selectCoord]);

  const viewKeep = useCallback(() => {
    selectCoord(keepCoord);
    dispatchInteraction({ type: 'set-camera-target', target: { kind: 'keep' } });
    sceneRef.current?.focusKeep();
  }, [keepCoord, selectCoord]);

  const showRealm = useCallback(() => {
    setHoveredCastleId(undefined);
    dispatchInteraction({ type: 'set-camera-target', target: { kind: 'realm' } });
    sceneRef.current?.showRealm();
  }, []);

  const frameFoundingDistrict = useCallback(() => {
    setHoveredCastleId(undefined);
    dispatchInteraction({
      type: 'set-camera-target',
      target: { kind: 'founding-district' }
    });
    sceneRef.current?.frameFoundingDistrict();
  }, []);

  const focusCastleCluster = useCallback((cluster: RealmCastleIdentityCluster) => {
    const castle = allCastlesRef.current.find((candidate) => (
      candidate.castleId === cluster.representativeCastleId
    ));
    if (!castle) return;
    if (rendererModeRef.current !== 'webgl') {
      selectCastle(castle);
      return;
    }
    dispatchInteraction({
      type: 'set-camera-target',
      target: {
        kind: 'castle-cluster',
        castleIds: cluster.castleIds,
        representativeCastleId: castle.castleId
      }
    });
    dispatchInteraction({
      type: 'request-castle-label-focus',
      castleId: castle.castleId
    });
    sceneRef.current?.focusCastleGroup(cluster.castleIds);
  }, [selectCastle]);

  const selectFromNavigator = useCallback((coord: HexCoord) => {
    selectCoord(coord);
    dispatchInteraction({ type: 'set-camera-target', target: { kind: 'cell', coord } });
    sceneRef.current?.focusCell(coord);
    dispatchInteraction({ type: 'close-navigator' });
    dispatchInteraction({ type: 'request-map-focus' });
  }, [selectCoord]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // The realm itself owns map-navigation shortcuts. Let nested controls keep
    // their native keyboard behavior instead of turning Enter, Space, Home, or
    // arrow keys on a HUD/navigator control into an unrelated map command.
    if (event.target !== event.currentTarget) return;
    if (rendererMode === 'loading') return;

    if (event.key === 'Home') {
      event.preventDefault();
      if (observerMode) showRealm();
      else recenterKeep();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (castleAtSelectedCell) {
        selectCastle(castleAtSelectedCell);
      } else {
        sceneRef.current?.focusCell(selectedCoord);
        dispatchInteraction({
          type: 'set-camera-target',
          target: { kind: 'cell', coord: selectedCoord }
        });
      }
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
      data-presentation-mode={observerMode ? 'observer' : 'player'}
      data-renderer={rendererMode}
      data-quality={quality}
      tabIndex={0}
      aria-label={observerMode ? 'Hegemony realm QA observer' : 'Hegemony realm'}
      aria-busy={rendererMode === 'loading'}
      onKeyDown={handleKeyDown}
    >
      <div className="realm-safe-area-probe" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="realm-map-screen__canvas"
        aria-hidden="true"
      />

      {rendererMode === 'fallback' ? (
        <div className="realm-map-screen__fallback" data-testid="realm-static-fallback">
          <svg
            ref={fallbackMapRef}
            className="realm-map-screen__fallback-map"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            role="img"
            aria-label={observerMode
              ? 'Deterministic illustrated Hegemony lowlands observer map'
              : 'Deterministic illustrated Hegemony lowlands'}
          >
            <title>{observerMode
              ? 'Hegemony lowlands with public frontier castles'
              : 'Hegemony lowlands with your authoritative frontier keep'}</title>
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
              const realmCell = isPlayableRealmCoord(surface, cell.coord);
              const tileMetadata = tileMetadataByKey.get(hexKey(cell.coord));
              const passable = realmCell && tileMetadata?.passable !== false;
              const selected = sameCoord(selectedCoord, cell.coord);
              const center = pointyHexCorners(cell.coord, HEX_SIZE)
                .reduce((sum, point) => ({ x: sum.x + point.x / 6, z: sum.z + point.z / 6 }), { x: 0, z: 0 });
              const color = sampleLowlandsColor(surface.renderMap.worldSeed, center, {
                cell,
                hexSize: HEX_SIZE,
                playableRadius: surface.playableMap.radius,
                renderRadius: surface.renderMap.radius,
                terrainKind: isRealmTerrainKind(tileMetadata?.terrainKind)
                  ? tileMetadata.terrainKind
                  : undefined
              });
              return (
                <polygon
                  key={hexKey(cell.coord)}
                  data-playable={passable ? 'true' : 'false'}
                  data-realm-cell={realmCell ? 'true' : 'false'}
                  data-static-content={tileMetadata?.staticContentKind}
                  data-terrain-kind={tileMetadata?.terrainKind}
                  points={pointsForSvg(cell.coord)}
                  fill={colorToCss(color)}
                  fillOpacity={passable ? 1 : realmCell ? 0.84 : 0.72}
                  stroke={selected ? '#fff1b8' : passable ? '#788454' : realmCell ? '#565d4a' : '#859076'}
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
            {!observerMode ? (
              <g
                className="realm-map-screen__fallback-keep"
                data-castle-id={ownCastle.castleId}
                data-testid="realm-keep-marker"
                aria-label={`Your Hegemony keep at cell ${keepCoord.q},${keepCoord.r}`}
                transform={`translate(${axialToWorld(keepCoord, HEX_SIZE).x} ${-axialToWorld(keepCoord, HEX_SIZE).z})`}
              >
                <path d="M-0.55 0.36V-0.28H-0.36V-0.52H-0.18V-0.28H0.18V-0.52H0.36V-0.28H0.55V0.36Z" fill="#ddd0ad" stroke="#5b4936" strokeWidth="0.035" />
                <path d="M-0.64 0.36H0.64L0.52 0.5H-0.52Z" fill="#766146" />
                <path d="M-0.11 0.36V0.02Q0-0.11 0.11 0.02V0.36Z" fill="#433c32" />
                <path d="M-0.52-0.28L-0.36-0.62L-0.2-0.28M0.2-0.28L0.36-0.62L0.52-0.28" fill="#a58949" stroke="#5b4936" strokeWidth="0.025" />
              </g>
            ) : null}
            {peerCastles.map((castle) => {
              const world = axialToWorld({ q: castle.q, r: castle.r }, HEX_SIZE);
              return (
                <g
                  aria-label={`Hegemony castle marker at cell ${castle.q},${castle.r}`}
                  className="realm-map-screen__fallback-peer-castle"
                  data-castle-id={castle.castleId}
                  key={castle.castleId}
                  transform={`translate(${world.x} ${-world.z})`}
                >
                  <path d="M-0.55 0.36V-0.28H-0.36V-0.52H-0.18V-0.28H0.18V-0.52H0.36V-0.28H0.55V0.36Z" fill="#c9b0d3" stroke="#4f374f" strokeWidth="0.035" />
                  <path d="M-0.64 0.36H0.64L0.52 0.5H-0.52Z" fill="#725176" />
                  <path d="M-0.11 0.36V0.02Q0-0.11 0.11 0.02V0.36Z" fill="#3d3041" />
                  <path d="M-0.52-0.28L-0.36-0.62L-0.2-0.28M0.2-0.28L0.36-0.62L0.52-0.28" fill="#b38e4e" stroke="#59414f" strokeWidth="0.025" />
                </g>
              );
            })}
          </svg>
          <p className="realm-map-screen__fallback-copy">
            Detailed terrain is unavailable. Showing the canonical Genesis 001 realm map.
          </p>
        </div>
      ) : null}

      {rendererMode === 'loading' ? (
        <div
          className="realm-map-screen__loading"
          aria-label="Preparing Hegemony realm"
        >
          <div>
            <strong role="status">Surveying the bright lowlands…</strong>
            <span>Preparing every canonical castle before the realm is revealed.</span>
            <button type="button" onClick={onRequestReturn}>
              {observerMode ? 'Close QA Observer' : 'Return to Menu'}
            </button>
          </div>
        </div>
      ) : null}

      {rendererMode !== 'loading' ? (
        <>
          <RealmCastleLabels
            labels={visibleCastleLabels}
            clusters={visibleCastleClusters}
            records={profileRecords}
            selectedCastleId={selectedCastle?.castleId}
            inspectorCastleId={inspectorCastle?.castleId}
            focusedCastleId={focusedCastleId}
            ownCastleId={observerMode ? undefined : ownCastle.castleId}
            inspectorId={inspectorId}
            inspectorOpen={interaction.inspectorOpen}
            onActivate={selectCastle}
            onActivateCluster={focusCastleCluster}
          />

          {observerMode ? (
            <RealmObserverHud
              selectedCell={selectedCell}
              selectedTerrainKind={selectedTerrainKind}
              selectedCastle={selectedCastle}
              selectedCastleProfile={selectedCastle
                ? profileRecords.get(selectedCastle.castleId)?.profile
                : undefined}
              onShowRealm={showRealm}
              onRequestReturn={onRequestReturn}
            />
          ) : (
            <RealmHud
              identity={identity}
              ownCastle={ownCastle}
              ownProfile={ownProfile}
              marksStatus={marksStatus}
              keepCoord={keepCoord}
              selectedCell={selectedCell}
              selectedTerrainKind={selectedTerrainKind}
              selectedCastle={selectedCastle}
              selectedCastleProfile={selectedCastle
                ? profileRecords.get(selectedCastle.castleId)?.profile
                : undefined}
              onRecenterKeep={recenterKeep}
              onRequestReturn={onRequestReturn}
            />
          )}

          {inspectorCastle && profileRecords.get(inspectorCastle.castleId) ? (
            <CastleInspectionPanel
              id={inspectorId}
              castle={inspectorCastle}
              profile={profileRecords.get(inspectorCastle.castleId)!.profile}
              own={!observerMode && inspectorCastle.ownerFid === identity.fid}
              observer={observerMode}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={() => dispatchInteraction({ type: 'close-inspector' })}
            />
          ) : null}

          <RealmAccessibilityControls
            id={navigatorId}
            open={interaction.navigatorOpen}
            castles={navigatorCastles}
            ownCastleId={observerMode ? undefined : ownCastle.castleId}
            selectedCastleId={selectedCastle?.castleId}
            triggerRef={navigatorTriggerRef}
            cameraPresets={[
              {
                id: 'realm',
                label: 'Realm',
                active: cameraMode === 'realm',
                onActivate: showRealm
              },
              ...(rendererMode === 'webgl' && hasNearbyFoundingKeeps ? [{
                id: 'founders',
                label: 'Founders',
                active: cameraMode === 'approach',
                onActivate: frameFoundingDistrict
              }] : []),
              ...(!observerMode ? [{
                id: 'keep',
                label: 'My Keep',
                active: cameraMode === 'keep',
                onActivate: viewKeep
              }] : [])
            ]}
            onRequestOpen={() => dispatchInteraction({ type: 'open-navigator' })}
            onRequestClose={() => dispatchInteraction({ type: 'close-navigator' })}
            onActivateCastle={(entry) => {
              const castle = allCastles.find((candidate) => candidate.castleId === entry.castleId);
              if (castle) selectCastle(castle);
            }}
            coordinateJump={{
              validate: (coord) => (
                isPlayableRealmCoord(surface, coord)
                && tileMetadataByKey.get(hexKey(coord))?.passable !== false
              ),
              onActivate: selectFromNavigator
            }}
          />
        </>
      ) : null}
    </main>
  );
}
