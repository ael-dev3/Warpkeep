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
  createAuthoritativeRealmTerrainSurface,
  isPlayableRealmCoord,
  type RealmTerrainSurface
} from '../../game/map/realmTerrainSurface';
import {
  isRealmTerrainKind
} from '../../game/map/realmTerrainSemantics';
import { createHegemonyCastlePlacements } from '../../game/map/terrainPlacements';
import type { TerrainCell } from '../../game/map/terrainTypes';
import type {
  GraphicsPreference,
  GraphicsQualityTier
} from '../../settings/graphicsPreference';
import type {
  CanonicalWarpkeepRealmSnapshot,
  WarpkeepWorldTileMetadata
} from '../../spacetime/warpkeepBackendTypes';
import { isCanonicalGenesisSnapshot } from '../../spacetime/canonicalGenesisSnapshot';
import type { ReadyRealmResourcePresentation } from './realmResourcePresentation';
import { CastleInspectionPanel } from './CastleInspectionPanel';
import { FoodFarmInspectionPanel } from './FoodFarmInspectionPanel';
import { GoldMineInspectionPanel } from './GoldMineInspectionPanel';
import { LoggingCampInspectionPanel } from './LoggingCampInspectionPanel';
import { RealmAccessibilityControls } from './RealmAccessibilityControls';
import {
  RealmCastleLabels,
  type CastleLabelRecord
} from './RealmCastleLabels';
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
  resolveRealmGoldNodePresentations,
  type RealmGoldNodePresentation
} from './realmGoldNodePresentation';
import {
  resolveRealmFoodNodePresentations,
  type RealmFoodNodePresentation
} from './realmFoodNodePresentation';
import {
  resolveRealmWoodNodePresentations,
  type RealmWoodNodePresentation
} from './realmWoodNodePresentation';
import type { GoldExpeditionPresentation } from './realmGoldExpeditionPresentation';
import type { FoodExpeditionPresentation } from './realmFoodExpeditionPresentation';
import type { WoodExpeditionPresentation } from './realmWoodExpeditionPresentation';
import type { RealmGoldNodePresentationTelemetry } from './realmGoldNodeLayer';
import type { RealmFoodNodePresentationTelemetry } from './realmFoodNodeLayer';
import type { RealmWoodNodePresentationTelemetry } from './realmWoodNodeLayer';
import {
  createTerrainOverviewHull,
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
  type RealmQuality
} from './realmQuality';
import type { RealmIdentity } from './realmTypes';
import type { RealmCastleProjectionFrame } from './realmTypes';
import {
  CASTLE_LABEL_LAYOUT_MAX_CASTLES,
  castleProfileLabel,
  fallbackCastleProjection,
  publicProfileForCastle,
  resolvePersistentCastleLabels,
  type RealmLabelReservedRect,
  type VisibleCastleLabel
} from './realmCastlePresentation';
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
  /** Authenticated caller-only inventory, separate from the public snapshot. */
  resources?: ReadyRealmResourcePresentation;
  onCollectResources?: () => Promise<void>;
  /** Exact caller-only Gold expedition procedure projection. */
  goldExpedition?: GoldExpeditionPresentation;
  /** Guarded reducer boundary; never supplied to observer presentation. */
  onDispatchGoldExpedition?: (siteId: string, idempotencyKey: string) => Promise<void>;
  /** Guarded owner-only settlement reducer; never supplied to observers. */
  onClaimGoldExpedition?: () => Promise<void>;
  /** Exact caller-only Food expedition procedure projection. */
  foodExpedition?: FoodExpeditionPresentation;
  /** Guarded Food reducer boundary; never supplied to observer presentation. */
  onDispatchFoodExpedition?: (siteId: string, idempotencyKey: string) => Promise<void>;
  /** Guarded owner-only Food settlement reducer; never supplied to observers. */
  onClaimFoodExpedition?: () => Promise<void>;
  /** Exact caller-only Wood expedition procedure projection. */
  woodExpedition?: WoodExpeditionPresentation;
  /** Guarded Wood reducer boundary; never supplied to observer presentation. */
  onDispatchWoodExpedition?: (siteId: string, idempotencyKey: string) => Promise<void>;
  /** Guarded owner-only Wood settlement reducer; never supplied to observers. */
  onClaimWoodExpedition?: () => Promise<void>;
  graphicsPreference?: GraphicsPreference;
  resolvedGraphicsQuality?: GraphicsQualityTier;
  audioMuted?: boolean;
  onGraphicsPreferenceChange?: (preference: GraphicsPreference) => void;
  onAudioMutedChange?: (muted: boolean) => void;
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

function applyCastleLabelPlacement(
  button: HTMLButtonElement,
  placement: VisibleCastleLabel | undefined
) {
  if (!placement) {
    button.style.visibility = 'hidden';
    button.tabIndex = -1;
    button.dataset.displaced = 'false';
    return;
  }

  const labelX = `${placement.x.toFixed(2)}px`;
  const labelY = `${placement.y.toFixed(2)}px`;
  const anchorX = `${placement.projectedAnchor.x.toFixed(2)}px`;
  const anchorY = `${placement.projectedAnchor.y.toFixed(2)}px`;
  button.style.visibility = 'visible';
  button.dataset.displaced = 'false';
  button.style.setProperty('--realm-castle-label-x', labelX);
  button.style.setProperty('--realm-castle-label-y', labelY);
  button.style.setProperty('--realm-castle-anchor-x', anchorX);
  button.style.setProperty('--realm-castle-anchor-y', anchorY);
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

type RealmGatheringNodePresentation =
  | RealmGoldNodePresentation
  | RealmFoodNodePresentation
  | RealmWoodNodePresentation;

function sameGatheringNodes<T extends RealmGatheringNodePresentation>(
  first: readonly T[],
  second: readonly T[]
) {
  return first.length === second.length && first.every((node, index) => {
    const candidate = second[index];
    if (
      candidate === undefined
      || node.siteId !== candidate.siteId
      || node.coord.q !== candidate.coord.q
      || node.coord.r !== candidate.coord.r
      || node.tier !== candidate.tier
      || node.availability !== candidate.availability
      || node.occupiedByViewer !== candidate.occupiedByViewer
    ) return false;
    const occupation = node.occupation;
    const candidateOccupation = candidate.occupation;
    if ((occupation === undefined) !== (candidateOccupation === undefined)) return false;
    if (
      occupation !== undefined
      && candidateOccupation !== undefined
      && (
        occupation.siteId !== candidateOccupation.siteId
        || occupation.originCastleId !== candidateOccupation.originCastleId
        || occupation.phase !== candidateOccupation.phase
        || occupation.startedAtMicros !== candidateOccupation.startedAtMicros
        || occupation.arrivesAtMicros !== candidateOccupation.arrivesAtMicros
        || occupation.gatheringEndsAtMicros !== candidateOccupation.gatheringEndsAtMicros
        || occupation.returnsAtMicros !== candidateOccupation.returnsAtMicros
      )
    ) return false;
    const origin = node.originCastle;
    const candidateOrigin = candidate.originCastle;
    return (origin === undefined) === (candidateOrigin === undefined)
      && (
        origin === undefined
        || candidateOrigin === undefined
        || (
          origin.castleId === candidateOrigin.castleId
          && origin.name === candidateOrigin.name
          && origin.q === candidateOrigin.q
          && origin.r === candidateOrigin.r
        )
      );
  });
}

/** Do not recreate a GPU Realm scene for unrelated profile/name snapshot churn. */
function useStableGatheringNodes<T extends RealmGatheringNodePresentation>(nodes: readonly T[]) {
  const stableNodesRef = useRef(nodes);
  if (!sameGatheringNodes(stableNodesRef.current, nodes)) stableNodesRef.current = nodes;
  return stableNodesRef.current;
}

/**
 * Canonical terrain metadata is immutable for one fingerprint. Avoid scanning
 * all 10,000 rows when a profile/castle subscription publishes a fresh
 * presentation snapshot with the same validated world identity.
 */
function useStableRealmTerrainMetadata(
  rows: readonly WarpkeepWorldTileMetadata[],
  canonicalFingerprint: string
) {
  const stableRowsRef = useRef({ canonicalFingerprint, rows });
  if (stableRowsRef.current.canonicalFingerprint !== canonicalFingerprint) {
    stableRowsRef.current = { canonicalFingerprint, rows };
  }
  return stableRowsRef.current.rows;
}

type RealmForestSnapshotProjection = Readonly<{
  layout: unknown;
  trees: unknown;
}>;

function primitiveForestSignature(value: unknown) {
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
    || value === undefined
    || value === null
  ) return `${typeof value}:${String(value)}`;
  return 'other';
}

function forestRecordSignature(value: unknown, fields: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const row = value as Readonly<Record<string, unknown>>;
  return fields.map((field) => `${field}=${primitiveForestSignature(row[field])}`).join(';');
}

/**
 * Snapshots deliberately use fresh public table arrays. Retain an unchanged
 * forest projection so profile/resource churn never destroys and recreates a
 * valid static GPU forest; every policy-relevant fixed-point field is part of
 * this signature, so a real table update still replaces the scene input.
 */
function sharedForestProjectionSignature(layout: unknown, trees: unknown) {
  const layoutSignature = Array.isArray(layout)
    ? `array:${layout.length}:${layout.map((row) => forestRecordSignature(row, [
      'realmId',
      'layoutVersion',
      'policyVersion',
      'layoutDigest',
      'assetCatalogDigest',
      'instanceCount'
    ])).sort().join('|')}`
    : forestRecordSignature(layout, [
      'realmId',
      'layoutVersion',
      'policyVersion',
      'layoutDigest',
      'assetCatalogDigest',
      'instanceCount'
    ]);
  if (trees === undefined) return `layout:${layoutSignature}|trees:undefined`;
  if (!Array.isArray(trees)) return `layout:${layoutSignature}|trees:invalid`;
  const treeFields = [
    'treeId',
    'realmId',
    'tileKey',
    'q',
    'r',
    'localXMicrounits',
    'localZMicrounits',
    'worldXMicrounits',
    'worldZMicrounits',
    'rotationMilliDegrees',
    'scaleBasisPoints',
    'speciesId',
    'habitat',
    'layoutVersion'
  ] as const;
  return `layout:${layoutSignature}|trees:${trees.length}:${trees
    .map((row) => forestRecordSignature(row, treeFields))
    .sort()
    .join('|')}`;
}

function useStableSharedForestProjection(layout: unknown, trees: unknown) {
  const signature = sharedForestProjectionSignature(layout, trees);
  const projectionRef = useRef<Readonly<{
    signature: string;
    projection: RealmForestSnapshotProjection;
  }> | undefined>(undefined);
  if (projectionRef.current?.signature !== signature) {
    projectionRef.current = Object.freeze({
      signature,
      projection: Object.freeze({ layout, trees })
    });
  }
  return projectionRef.current.projection;
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

type RealmFallbackSurfacePresentation = Readonly<{
  viewBox: RealmViewBox;
  renderHullPoints: string;
  playableHullPoints: string;
}>;

function svgHullPoints(points: readonly Readonly<{ x: number; z: number }>[]) {
  return points.map((point) => `${point.x.toFixed(4)},${(-point.z).toFixed(4)}`).join(' ');
}

function fallbackSurfacePresentation(
  surface: RealmTerrainSurface
): RealmFallbackSurfacePresentation {
  const renderHull = createTerrainOverviewHull(surface.renderMap, HEX_SIZE);
  const playableHull = createTerrainOverviewHull(surface.playableMap, HEX_SIZE);
  const points = renderHull;
  if (points.length === 0) {
    return {
      viewBox: { x: -2, y: -2, width: 4, height: 4 },
      renderHullPoints: '',
      playableHullPoints: ''
    };
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  const padding = 0.88;
  return {
    viewBox: {
      x: minX - padding,
      y: -maxZ - padding,
      width: maxX - minX + padding * 2,
      height: maxZ - minZ + padding * 2
    },
    renderHullPoints: svgHullPoints(renderHull),
    playableHullPoints: svgHullPoints(playableHull)
  };
}

function linearChannelToSrgb(value: number) {
  const channel = clamp(value, 0, 1);
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function colorToCss(color: Readonly<{ r: number; g: number; b: number }>) {
  const channel = (value: number) => Math.round(linearChannelToSrgb(value) * 255);
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
  return override ?? 'high';
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
  if (
    !isCanonicalGenesisSnapshot(props.snapshot, props.identity.fid)
    || (props.resources !== undefined && props.resources.fid !== BigInt(props.identity.fid))
  ) {
    return <CanonicalRealmUnavailable onRequestReturn={props.onRequestReturn} />;
  }
  return <CanonicalRealmMapScreen {...props} />;
}

function CanonicalRealmMapScreen({
  identity,
  snapshot,
  resources,
  onCollectResources,
  goldExpedition,
  onDispatchGoldExpedition,
  onClaimGoldExpedition,
  foodExpedition,
  onDispatchFoodExpedition,
  onClaimFoodExpedition,
  woodExpedition,
  onDispatchWoodExpedition,
  onClaimWoodExpedition,
  graphicsPreference,
  resolvedGraphicsQuality,
  audioMuted,
  onGraphicsPreferenceChange,
  onAudioMutedChange,
  onRequestReturn,
  qualityOverride,
  presentationMode = 'player'
}: RealmMapScreenProps) {
  // The observer is a development-only presentation of an already-sanitized
  // loopback snapshot. Compile the mode out of production even if a future
  // caller accidentally supplies the internal prop.
  const observerMode = import.meta.env.DEV && presentationMode === 'observer';
  const sharedForestProjection = useStableSharedForestProjection(
    snapshot.forestLayout,
    snapshot.forestTrees
  );
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
  const sharedTileMetadata = useStableRealmTerrainMetadata(
    snapshot.tileMetadata,
    snapshot.canonicalFingerprint
  );
  const otherCastles = snapshot.castles;
  const surface = useMemo(
    () => createAuthoritativeRealmTerrainSurface(
      snapshot.realm.numericSeed,
      snapshot.tiles,
      snapshot.realm.authoritativeRadius,
      snapshot.realm.renderRadius
    ),
    [
      snapshot.canonicalFingerprint,
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
  const resolvedGoldNodes = useMemo<readonly RealmGoldNodePresentation[]>(() => (
    resolveRealmGoldNodePresentations({
      sites: snapshot.goldSites,
      occupations: snapshot.goldNodeOccupations,
      castles: allCastles.map((castle) => ({
        castleId: castle.castleId,
        name: castle.name,
        q: castle.q,
        r: castle.r
      })),
      ownCastleId: observerMode ? undefined : ownCastle.castleId,
      isPlayableCoord: (coord) => isPlayableRealmCoord(surface, coord)
    })
  ), [allCastles, observerMode, ownCastle.castleId, snapshot.goldNodeOccupations, snapshot.goldSites, surface]);
  const goldNodes = useStableGatheringNodes(resolvedGoldNodes);
  const goldNodesRef = useRef(goldNodes);
  goldNodesRef.current = goldNodes;
  const goldNodesBySiteId = useMemo(() => new Map(
    goldNodes.map((node) => [node.siteId, node] as const)
  ), [goldNodes]);
  const resolvedFoodNodes = useMemo<readonly RealmFoodNodePresentation[]>(() => (
    resolveRealmFoodNodePresentations({
      sites: snapshot.foodSites,
      occupations: snapshot.foodNodeOccupations,
      castles: allCastles.map((castle) => ({
        castleId: castle.castleId,
        name: castle.name,
        q: castle.q,
        r: castle.r
      })),
      ownCastleId: observerMode ? undefined : ownCastle.castleId,
      isPlayableCoord: (coord) => isPlayableRealmCoord(surface, coord)
    })
  ), [allCastles, observerMode, ownCastle.castleId, snapshot.foodNodeOccupations, snapshot.foodSites, surface]);
  const foodNodes = useStableGatheringNodes(resolvedFoodNodes);
  const foodNodesRef = useRef(foodNodes);
  foodNodesRef.current = foodNodes;
  const foodNodesBySiteId = useMemo(() => new Map(
    foodNodes.map((node) => [node.siteId, node] as const)
  ), [foodNodes]);
  const resolvedWoodNodes = useMemo<readonly RealmWoodNodePresentation[]>(() => (
    resolveRealmWoodNodePresentations({
      sites: snapshot.woodSites,
      occupations: snapshot.woodNodeOccupations,
      castles: allCastles.map((castle) => ({
        castleId: castle.castleId,
        name: castle.name,
        q: castle.q,
        r: castle.r
      })),
      ownCastleId: observerMode ? undefined : ownCastle.castleId,
      isPlayableCoord: (coord) => isPlayableRealmCoord(surface, coord)
    })
  ), [allCastles, observerMode, ownCastle.castleId, snapshot.woodNodeOccupations, snapshot.woodSites, surface]);
  const woodNodes = useStableGatheringNodes(resolvedWoodNodes);
  const woodNodesRef = useRef(woodNodes);
  woodNodesRef.current = woodNodes;
  const woodNodesBySiteId = useMemo(() => new Map(
    woodNodes.map((node) => [node.siteId, node] as const)
  ), [woodNodes]);
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
  const hoveredCastleIdRef = useRef<number | undefined>(undefined);
  const [visibleCastleLabels, setVisibleCastleLabels] = useState<readonly VisibleCastleLabel[]>([]);
  const latestVisibleCastleLabelsRef = useRef<readonly VisibleCastleLabel[]>([]);
  const latestProjectionRef = useRef<RealmCastleProjectionFrame>({ width: 0, height: 0, castles: [] });
  const reservedUiRectsRef = useRef<readonly RealmLabelReservedRect[]>([]);
  const compositionRafRef = useRef<number | null>(null);
  const labelMembershipSignatureRef = useRef('');
  const presentedCastleIdsRef = useRef<readonly number[]>([]);
  const handledKeyboardIntentSequenceRef = useRef(-1);
  const reducedMotion = useReducedMotionPreference();
  const fallbackSurface = useMemo(
    () => fallbackSurfacePresentation(surface),
    [surface]
  );
  const viewBox = fallbackSurface.viewBox;
  const selectedCell = selectedCellFor(surface, selectedCoord, keepCoord);
  const selectedTerrainKindCandidate = tileMetadataByKey.get(hexKey(selectedCoord))?.terrainKind;
  const selectedTerrainKind = isRealmTerrainKind(selectedTerrainKindCandidate)
    ? selectedTerrainKindCandidate
    : undefined;
  const selectedCastle = interaction.selectedCastle
    ? allCastles.find((castle) => castle.castleId === interaction.selectedCastle?.castleId)
    : undefined;
  const castleAtSelectedCell = allCastles.find((castle) => sameCoord(castle, selectedCoord));
  const selectedInspectorTarget = interaction.inspectorOpen ? interaction.inspectorTarget : null;
  const inspectorCastle = selectedInspectorTarget !== null
    && 'castleId' in selectedInspectorTarget
    ? allCastles.find((castle) => castle.castleId === selectedInspectorTarget.castleId)
    : undefined;
  const inspectorGoldNode = selectedInspectorTarget !== null
    && 'siteId' in selectedInspectorTarget
    ? goldNodesBySiteId.get(selectedInspectorTarget.siteId)
    : undefined;
  const inspectorFoodNode = selectedInspectorTarget !== null
    && 'foodSiteId' in selectedInspectorTarget
    ? foodNodesBySiteId.get(selectedInspectorTarget.foodSiteId)
    : undefined;
  const inspectorWoodNode = selectedInspectorTarget !== null
    && 'woodSiteId' in selectedInspectorTarget
    ? woodNodesBySiteId.get(selectedInspectorTarget.woodSiteId)
    : undefined;
  const goldNodeAtSelectedCell = goldNodes.find((node) => sameCoord(node.coord, selectedCoord));
  const foodNodeAtSelectedCell = foodNodes.find((node) => sameCoord(node.coord, selectedCoord));
  const woodNodeAtSelectedCell = woodNodes.find((node) => sameCoord(node.coord, selectedCoord));
  const ownProfile = profileRecords.get(ownCastle.castleId)?.profile;
  const focusedCastleId = interaction.cameraTarget.kind === 'castle'
    ? interaction.cameraTarget.castleId
    : undefined;

  const updateHoveredCastleId = useCallback((next: number | undefined) => {
    if (hoveredCastleIdRef.current === next) return;
    const root = rootRef.current;
    const previous = hoveredCastleIdRef.current;
    if (previous !== undefined) {
      const previousButton = root?.querySelector<HTMLButtonElement>(
        `button.realm-castle-label[data-castle-id="${previous}"]`
      );
      if (previousButton) previousButton.dataset.hovered = 'false';
    }
    hoveredCastleIdRef.current = next;
    if (next !== undefined) {
      const nextButton = root?.querySelector<HTMLButtonElement>(
        `button.realm-castle-label[data-castle-id="${next}"]`
      );
      if (nextButton) nextButton.dataset.hovered = 'true';
    }
  }, []);

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
        // Recover focus after a legitimate offscreen-to-onscreen transition,
        // but never steal it from another control the player deliberately
        // reached. Zoom and LOD changes preserve the same label node.
        if (
          label
          && label.style.visibility !== 'hidden'
          && (
            activeElement === null
            || activeElement === document.body
            || activeElement === document.documentElement
            || activeElement === rootRef.current
          )
        ) {
          rootRef.current
            ?.querySelectorAll<HTMLButtonElement>('.realm-castle-label')
            .forEach((candidate) => { candidate.tabIndex = candidate === label ? 0 : -1; });
          label.focus({ preventScroll: true });
        }
      }
      return;
    }
    if (target.kind === 'map') {
      rootRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'gold-mine-inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'food-farm-inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'logging-camp-inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'castle-label') {
      const label = rootRef.current
        ?.querySelector<HTMLButtonElement>(`.realm-castle-label[data-castle-id="${target.castleId}"]`)
      if (label && label.style.visibility !== 'hidden') {
        rootRef.current
          ?.querySelectorAll<HTMLButtonElement>('.realm-castle-label')
          .forEach((candidate) => { candidate.tabIndex = candidate === label ? 0 : -1; });
        label.focus({ preventScroll: true });
      }
      // Keep keyboard intent pending until an offscreen castle enters the
      // projection. Persistent labels do not otherwise unmount during camera
      // motion.
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
    updateHoveredCastleId(undefined);
    selectedCoordRef.current = coord;
    dispatchInteraction({ type: 'select-cell', coord });
  }, [updateHoveredCastleId]);

  const selectCastle = useCallback((castle: RealmCastleProjection) => {
    selectedCoordRef.current = { q: castle.q, r: castle.r };
    dispatchInteraction({
      type: 'activate-castle',
      castleId: castle.castleId,
      coord: { q: castle.q, r: castle.r }
    });
    sceneRef.current?.focusCastle(castle.castleId);
  }, []);

  const selectGoldNode = useCallback((node: RealmGoldNodePresentation) => {
    selectedCoordRef.current = { ...node.coord };
    dispatchInteraction({
      type: 'activate-gold-site',
      siteId: node.siteId,
      coord: node.coord
    });
    // This is a camera/readability affordance only. The public node record
    // remains the source of availability and the panel owns no local state.
    sceneRef.current?.focusCell(node.coord);
  }, []);

  const selectFoodNode = useCallback((node: RealmFoodNodePresentation) => {
    selectedCoordRef.current = { ...node.coord };
    dispatchInteraction({
      type: 'activate-food-site',
      siteId: node.siteId,
      coord: node.coord
    });
    sceneRef.current?.focusCell(node.coord);
  }, []);

  const selectWoodNode = useCallback((node: RealmWoodNodePresentation) => {
    selectedCoordRef.current = { ...node.coord };
    dispatchInteraction({
      type: 'activate-wood-site',
      siteId: node.siteId,
      coord: node.coord
    });
    sceneRef.current?.focusCell(node.coord);
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
    // The scene reserves its restrained ground outline for unoccupied terrain;
    // castle identity and raycasting provide the occupied-cell cue without a
    // depth-tested line cutting through the wider authored landscape base.
    updateHoveredCoord(target?.coord ?? null);
    updateHoveredCastleId(target?.kind === 'castle' ? target.castleId : undefined);
  }, [updateHoveredCastleId, updateHoveredCoord]);

  const handleSceneTargetSelect = useCallback((target: RealmInteractionTarget) => {
    if (rendererModeRef.current !== 'webgl') return;
    if (target.kind === 'castle') {
      const castle = allCastlesRef.current.find((candidate) => candidate.castleId === target.castleId);
      if (castle) selectCastle(castle);
      return;
    }
    if (target.kind === 'gold-site') {
      const node = goldNodesRef.current.find((candidate) => candidate.siteId === target.siteId);
      if (node) selectGoldNode(node);
      return;
    }
    if (target.kind === 'food-site') {
      const node = foodNodesRef.current.find((candidate) => candidate.siteId === target.siteId);
      if (node) selectFoodNode(node);
      return;
    }
    if (target.kind === 'wood-site') {
      const node = woodNodesRef.current.find((candidate) => candidate.siteId === target.siteId);
      if (node) selectWoodNode(node);
      return;
    }
    selectCoord(target.coord);
  }, [selectCastle, selectCoord, selectFoodNode, selectGoldNode, selectWoodNode]);

  const updateCastleProjection = useCallback((frame: RealmCastleProjectionFrame) => {
    latestProjectionRef.current = frame;
    const root = rootRef.current;
    if (!root || frame.width <= 0 || frame.height <= 0) return;

    const candidateCastles = frame.castles.slice(0, CASTLE_LABEL_LAYOUT_MAX_CASTLES);
    const candidateFrame = { ...frame, castles: candidateCastles };
    const eligibleLabels = resolvePersistentCastleLabels(candidateFrame);
    const labels = resolvePersistentCastleLabels(
      candidateFrame,
      { reservedRects: reservedUiRectsRef.current }
    );
    const reservedUiCullCount = eligibleLabels.length - labels.length;
    // React owns label membership while the projection lane owns moving
    // coordinates. Retain the latest complete snapshot so an unrelated
    // React render cannot reconcile an older state snapshot back over the
    // imperatively updated custom properties.
    latestVisibleCastleLabelsRef.current = labels;
    const renderableCastleIds = candidateCastles.map((castle) => castle.castleId);
    const renderableCastleIdSet = new Set(renderableCastleIds);
    const eligibleCastleIdSet = new Set(eligibleLabels.map((label) => label.castleId));
    const labelsById = new Map(labels.map((label) => [label.castleId, label]));
    const buttons = new Map<number, HTMLButtonElement>();
    root.querySelectorAll<HTMLButtonElement>('button.realm-castle-label[data-castle-id]')
      .forEach((button) => {
        const castleId = Number(button.dataset.castleId);
        if (Number.isSafeInteger(castleId)) buttons.set(castleId, button);
      });
    // Exact direct coverage is the presentation contract. Density may create
    // overlap in a realm overview, but collision geometry never replaces,
    // relocates, aggregates, or hides an on-screen founded identity.
    root.dataset.labelPersistence = 'foundation';
    root.dataset.labelEligibleCount = String(eligibleLabels.length);
    root.dataset.labelPlacedCount = String(labels.length);
    root.dataset.labelUnplacedCount = String(reservedUiCullCount);
    root.dataset.labelBaseAnchorViolationCount = String(labels.filter((label) => (
      Math.hypot(
        label.x - label.projectedAnchor.x,
        label.y - label.projectedAnchor.y
      ) > 0.015
    )).length);
    root.dataset.labelCullReasons = reservedUiCullCount > 0
      ? `reserved-ui:${reservedUiCullCount}`
      : '';
    root.dataset.individualCastleCount = String(labels.length);
    root.dataset.labelClusteredCount = '0';
    root.dataset.labelClusterOverflowCount = '0';
    root.dataset.clusterRepresentativeAnchorViolationCount = '0';
    root.dataset.clusterCastleOverlapCount = '0';
    root.dataset.clusterMemberDistanceViolationCount = '0';
    root.dataset.labelAccountingValid = String(
      labelsById.size === labels.length
      && labels.length + reservedUiCullCount === eligibleLabels.length
      && labels.every((label) => eligibleCastleIdSet.has(label.castleId))
      && labels.every((label) => renderableCastleIdSet.has(label.castleId))
    );
    root.dataset.labelMissingIdentityCount = '0';

    const signature = labels.map((label) => `${label.castleId}:${label.compact}`).join('|');
    if (signature !== labelMembershipSignatureRef.current) {
      labelMembershipSignatureRef.current = signature;
      setVisibleCastleLabels(labels);
    }
    for (const [castleId, button] of buttons) {
      button.dataset.hovered = castleId === hoveredCastleIdRef.current ? 'true' : 'false';
      applyCastleLabelPlacement(
        button,
        labelsById.get(castleId)
      );
    }

    presentedCastleIdsRef.current = renderableCastleIds;
    sceneRef.current?.setPresentedCastleIds(renderableCastleIds);
  }, []);

  const updateCastlePresentationTelemetry = useCallback((
    telemetry: RealmCastleInstancePresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.presentedModelCount = String(telemetry.presentedModelCount);
    root.dataset.presentedLandscapeBaseCount = String(
      telemetry.presentedLandscapeBaseCount
    );
    root.dataset.raycastTargetCount = String(telemetry.raycastTargetCount);
  }, []);

  const updateGoldNodePresentationTelemetry = useCallback((
    telemetry: RealmGoldNodePresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.publicGoldSiteCount = String(telemetry.publicSiteCount);
    root.dataset.occupiedGoldSiteCount = String(telemetry.occupiedSiteCount);
    root.dataset.renderedGoldMineCount = String(telemetry.renderedGoldMineCount);
    root.dataset.renderedGoldWagonCount = String(telemetry.renderedWagonCount);
    root.dataset.animatedGoldWagonCount = String(telemetry.animatedWagonCount);
    root.dataset.goldMarkerOnlySiteCount = String(telemetry.markerOnlySiteCount);
  }, []);

  const updateFoodNodePresentationTelemetry = useCallback((
    telemetry: RealmFoodNodePresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.publicFoodSiteCount = String(telemetry.publicSiteCount);
    root.dataset.occupiedFoodSiteCount = String(telemetry.occupiedSiteCount);
    root.dataset.renderedFoodFarmCount = String(telemetry.renderedFoodFarmCount);
    root.dataset.renderedFoodWagonCount = String(telemetry.renderedWagonCount);
    root.dataset.animatedFoodWagonCount = String(telemetry.animatedWagonCount);
    root.dataset.foodMarkerOnlySiteCount = String(telemetry.markerOnlySiteCount);
  }, []);

  const updateWoodNodePresentationTelemetry = useCallback((
    telemetry: RealmWoodNodePresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.publicWoodSiteCount = String(telemetry.publicSiteCount);
    root.dataset.occupiedWoodSiteCount = String(telemetry.occupiedSiteCount);
    root.dataset.renderedWoodCampCount = String(telemetry.renderedWoodCampCount);
    root.dataset.renderedWoodWagonCount = String(telemetry.renderedWagonCount);
    root.dataset.animatedWoodWagonCount = String(telemetry.animatedWagonCount);
    root.dataset.woodMarkerOnlySiteCount = String(telemetry.markerOnlySiteCount);
  }, []);

  const updateTerrainPresentationTelemetry = useCallback((
    telemetry: RealmTerrainPresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.terrainTriangleCount = String(telemetry.terrainTriangleCount);
    root.dataset.terrainTriangleBudget = String(telemetry.terrainTriangleBudget);
    root.dataset.terrainDetailRadius = String(telemetry.terrainDetailRadius);
    root.dataset.highDetailTerrainCellCount = String(telemetry.highDetailTerrainCellCount);
    root.dataset.coarseTerrainCellCount = String(telemetry.coarseTerrainCellCount);
    root.dataset.terrainTransitionEdgeCount = String(telemetry.terrainTransitionEdgeCount);
    root.dataset.semanticTerrainCellCount = String(telemetry.semanticCellCount);
    root.dataset.semanticTerrainKindCount = String(telemetry.semanticKindCount);
    root.dataset.semanticTerrainFeatureCount = String(telemetry.semanticFeatureCount);
    root.dataset.semanticTerrainFeatureDrawCalls = String(telemetry.semanticFeatureDrawCalls);
    root.dataset.totalTerrainDetailInstanceCount = String(telemetry.totalDetailInstanceCount);
    root.dataset.totalTerrainDetailDrawCalls = String(telemetry.totalDetailDrawCalls);
    root.dataset.forestPlacementSource = telemetry.forestPlacementSource;
    root.dataset.sharedForestTreeCount = String(telemetry.forestSharedTreeCount);
    root.dataset.grassCandidateCellCount = String(telemetry.grassCandidateCellCount);
    root.dataset.grassActiveCellCount = String(telemetry.grassActiveCellCount);
    root.dataset.grassInstanceCount = String(telemetry.grassInstanceCount);
    root.dataset.grassTriangleCount = String(telemetry.grassTriangleCount);
    root.dataset.grassDrawCalls = String(telemetry.grassDrawCalls);
    root.dataset.grassCacheEntries = String(telemetry.grassCacheEntries);
    root.dataset.grassAnimated = String(telemetry.grassAnimated);
    root.dataset.grassTargetAnimationCadence = String(telemetry.grassTargetAnimationCadence);
    root.dataset.grassCountsByTerrain = JSON.stringify(telemetry.grassCountsByTerrain);
    root.dataset.grassCompletelyBareActiveCells = String(telemetry.grassCompletelyBareActiveCells);
    root.dataset.grassRejectedByStructureClearance = String(
      telemetry.grassRejectedByStructureClearance
    );
    root.dataset.grassRejectedBySlope = String(telemetry.grassRejectedBySlope);
    root.dataset.grassOverviewHidden = String(telemetry.grassOverviewHidden);
  }, []);

  const updateSceneComposition = useCallback(() => {
    if (compositionRafRef.current !== null) return;
    compositionRafRef.current = window.requestAnimationFrame(() => {
      compositionRafRef.current = null;
      const root = rootRef.current;
      if (root) {
        const composition = measuredRealmComposition(root);
        reservedUiRectsRef.current = measuredVisibleRealmUiRects(root);
        sceneRef.current?.setComposition(composition);
        updateCastleProjection(latestProjectionRef.current);
      }
    });
  }, [updateCastleProjection]);

  useEffect(() => () => {
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
        '.realm-hud, .realm-hud__actions, .realm-profile-trigger, .realm-resource-rail, '
        + '.castle-inspection, .gold-mine-inspection, .food-farm-inspection, .logging-camp-inspection, .realm-cell-navigator'
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
  }, [updateCastleProjection]);

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
      labelMembershipSignatureRef.current = '';
      latestVisibleCastleLabelsRef.current = [];
      presentedCastleIdsRef.current = [];
      if (rootRef.current) {
        rootRef.current.dataset.presentedModelCount = '0';
        rootRef.current.dataset.presentedLandscapeBaseCount = '0';
        rootRef.current.dataset.raycastTargetCount = '0';
        rootRef.current.dataset.semanticTerrainCellCount = '0';
        rootRef.current.dataset.semanticTerrainKindCount = '0';
        rootRef.current.dataset.semanticTerrainFeatureCount = '0';
        rootRef.current.dataset.semanticTerrainFeatureDrawCalls = '0';
        rootRef.current.dataset.totalTerrainDetailInstanceCount = '0';
        rootRef.current.dataset.totalTerrainDetailDrawCalls = '0';
        rootRef.current.dataset.forestPlacementSource = 'blocked';
        rootRef.current.dataset.sharedForestTreeCount = '0';
        rootRef.current.dataset.grassCandidateCellCount = '0';
        rootRef.current.dataset.grassActiveCellCount = '0';
        rootRef.current.dataset.grassInstanceCount = '0';
        rootRef.current.dataset.grassTriangleCount = '0';
        rootRef.current.dataset.grassDrawCalls = '0';
        rootRef.current.dataset.grassCacheEntries = '0';
        rootRef.current.dataset.grassAnimated = 'false';
        rootRef.current.dataset.grassTargetAnimationCadence = '0';
        rootRef.current.dataset.grassCountsByTerrain = '{}';
        rootRef.current.dataset.grassCompletelyBareActiveCells = '0';
        rootRef.current.dataset.grassRejectedByStructureClearance = '0';
        rootRef.current.dataset.grassRejectedBySlope = '0';
        rootRef.current.dataset.grassOverviewHidden = 'true';
        rootRef.current.dataset.labelBaseAnchorViolationCount = '0';
        rootRef.current.dataset.publicGoldSiteCount = String(goldNodes.length);
        rootRef.current.dataset.occupiedGoldSiteCount = '0';
        rootRef.current.dataset.renderedGoldMineCount = '0';
        rootRef.current.dataset.renderedGoldWagonCount = '0';
        rootRef.current.dataset.animatedGoldWagonCount = '0';
        rootRef.current.dataset.goldMarkerOnlySiteCount = String(goldNodes.length);
        rootRef.current.dataset.publicFoodSiteCount = String(foodNodes.length);
        rootRef.current.dataset.occupiedFoodSiteCount = '0';
        rootRef.current.dataset.renderedFoodFarmCount = '0';
        rootRef.current.dataset.renderedFoodWagonCount = '0';
        rootRef.current.dataset.animatedFoodWagonCount = '0';
        rootRef.current.dataset.foodMarkerOnlySiteCount = String(foodNodes.length);
        rootRef.current.dataset.publicWoodSiteCount = String(woodNodes.length);
        rootRef.current.dataset.occupiedWoodSiteCount = '0';
        rootRef.current.dataset.renderedWoodCampCount = '0';
        rootRef.current.dataset.renderedWoodWagonCount = '0';
        rootRef.current.dataset.animatedWoodWagonCount = '0';
        rootRef.current.dataset.woodMarkerOnlySiteCount = String(woodNodes.length);
      }
      setVisibleCastleLabels([]);
      setCameraMode('realm');
      scene = createRealmScene({
        canvas,
        surface,
        keepCoord,
        ownCastleId: observerMode ? undefined : ownCastle.castleId,
        otherCastles: peerCastles,
        goldNodes,
        foodNodes,
        woodNodes,
        sharedForestLayout: sharedForestProjection.layout,
        sharedForestTrees: sharedForestProjection.trees,
        realmId: snapshot.realm.realmId,
        // The retired local planner is exposed only to the synthetic dev
        // observer. Player scenes wait for the paired shared public tables.
        allowLegacyForestFallback: observerMode,
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
        onGoldNodePresentationTelemetry: updateGoldNodePresentationTelemetry,
        onFoodNodePresentationTelemetry: updateFoodNodePresentationTelemetry,
        onWoodNodePresentationTelemetry: updateWoodNodePresentationTelemetry,
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
      scene.setSelectedGoldSiteId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'siteId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.siteId
          : null
      );
      scene.setSelectedFoodSiteId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'foodSiteId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.foodSiteId
          : null
      );
      scene.setSelectedWoodSiteId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'woodSiteId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.woodSiteId
          : null
      );
      scene.setHovered(hoveredCoordRef.current);
      const cameraTarget: RealmCameraTarget = interactionRef.current.cameraTarget;
      if (cameraTarget.kind === 'castle') scene.focusCastle(cameraTarget.castleId);
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
  }, [foodNodes, goldNodes, handleSceneTargetHover, handleSceneTargetSelect, hasNearbyFoundingKeeps, isSceneCoordPassable, keepCoord, markRendererUnavailable, observerMode, ownCastle.castleId, peerCastles, qualitySpec, reducedMotion, sharedForestProjection, sharedTileMetadata, snapshot.realm.realmId, surface, updateCastlePresentationTelemetry, updateCastleProjection, updateFoodNodePresentationTelemetry, updateGoldNodePresentationTelemetry, updateSceneComposition, updateTerrainPresentationTelemetry, updateWoodNodePresentationTelemetry, woodNodes]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedCoord);
  }, [selectedCoord]);

  useEffect(() => {
    sceneRef.current?.setSelectedCastleId(selectedCastle?.castleId ?? null);
  }, [selectedCastle?.castleId]);

  useEffect(() => {
    sceneRef.current?.setSelectedGoldSiteId?.(inspectorGoldNode?.siteId ?? null);
  }, [inspectorGoldNode?.siteId]);

  useEffect(() => {
    sceneRef.current?.setSelectedFoodSiteId?.(inspectorFoodNode?.siteId ?? null);
  }, [inspectorFoodNode?.siteId]);

  useEffect(() => {
    sceneRef.current?.setSelectedWoodSiteId?.(inspectorWoodNode?.siteId ?? null);
  }, [inspectorWoodNode?.siteId]);

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
    updateHoveredCastleId(undefined);
    selectedCoordRef.current = keepCoord;
    dispatchInteraction({ type: 'recenter-keep', coord: keepCoord });
    sceneRef.current?.recenterKeep();
  }, [keepCoord, updateHoveredCastleId]);

  const viewKeep = useCallback(() => {
    selectCoord(keepCoord);
    dispatchInteraction({ type: 'set-camera-target', target: { kind: 'keep' } });
    sceneRef.current?.focusKeep();
  }, [keepCoord, selectCoord]);

  const showRealm = useCallback(() => {
    updateHoveredCastleId(undefined);
    dispatchInteraction({ type: 'set-camera-target', target: { kind: 'realm' } });
    sceneRef.current?.showRealm();
  }, [updateHoveredCastleId]);

  const frameFoundingDistrict = useCallback(() => {
    updateHoveredCastleId(undefined);
    dispatchInteraction({
      type: 'set-camera-target',
      target: { kind: 'founding-district' }
    });
    sceneRef.current?.frameFoundingDistrict();
  }, [updateHoveredCastleId]);

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
      } else if (goldNodeAtSelectedCell) {
        selectGoldNode(goldNodeAtSelectedCell);
      } else if (foodNodeAtSelectedCell) {
        selectFoodNode(foodNodeAtSelectedCell);
      } else if (woodNodeAtSelectedCell) {
        selectWoodNode(woodNodeAtSelectedCell);
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
            <polygon
              className="realm-map-screen__fallback-surface realm-map-screen__fallback-surface--apron"
              data-surface-layer="render-apron"
              points={fallbackSurface.renderHullPoints}
            />
            <polygon
              className="realm-map-screen__fallback-surface realm-map-screen__fallback-surface--playable"
              data-authoritative-cell-count={surface.playableMap.cells.length}
              data-surface-layer="authoritative"
              points={fallbackSurface.playableHullPoints}
            />
            <polygon
              className="realm-map-screen__fallback-selection"
              data-q={selectedCoord.q}
              data-r={selectedCoord.r}
              points={pointsForSvg(selectedCoord)}
              vectorEffect="non-scaling-stroke"
            />
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
            <g aria-hidden="true" className="realm-map-screen__fallback-gold-sites">
              {goldNodes.map((node) => {
                const world = axialToWorld(node.coord, HEX_SIZE);
                const occupied = node.availability !== 'available'
                  && node.availability !== 'unavailable';
                return (
                  <g
                    data-gold-site-id={node.siteId}
                    data-site-state={node.availability}
                    key={node.siteId}
                    transform={`translate(${world.x} ${-world.z})`}
                  >
                    {occupied ? (
                      <circle
                        fill="none"
                        r="0.34"
                        stroke="#f7d366"
                        strokeOpacity="0.94"
                        strokeWidth="0.045"
                      />
                    ) : null}
                    <path
                      d="M0 -0.3L0.25 -0.02L0.13 0.28H-0.13L-0.25 -0.02Z"
                      fill={node.availability === 'unavailable' ? '#84775a' : '#efbb35'}
                      stroke="#6e4810"
                      strokeWidth="0.04"
                    />
                    <path d="M0 -0.21L0.12 -0.02L0 0.19L-0.12 -0.02Z" fill="#fff1a7" />
                  </g>
                );
              })}
            </g>
            <g aria-hidden="true" className="realm-map-screen__fallback-food-sites">
              {foodNodes.map((node) => {
                const world = axialToWorld(node.coord, HEX_SIZE);
                const occupied = node.availability !== 'available'
                  && node.availability !== 'unavailable';
                return (
                  <g
                    data-food-site-id={node.siteId}
                    data-site-state={node.availability}
                    key={node.siteId}
                    transform={`translate(${world.x} ${-world.z})`}
                  >
                    {occupied ? (
                      <circle
                        fill="none"
                        r="0.34"
                        stroke="#ddef8b"
                        strokeOpacity="0.94"
                        strokeWidth="0.045"
                      />
                    ) : null}
                    <path
                      d="M0 -0.34L0.23 -0.08L0.17 0.25H-0.17L-0.23 -0.08Z"
                      fill={node.availability === 'unavailable' ? '#708062' : '#b8d957'}
                      stroke="#435a26"
                      strokeWidth="0.04"
                    />
                    <path
                      d="M-0.1 0.12V-0.17M0 0.16V-0.25M0.1 0.12V-0.17"
                      fill="none"
                      stroke="#fff8bb"
                      strokeLinecap="round"
                      strokeWidth="0.035"
                    />
                  </g>
                );
              })}
            </g>
            <g aria-hidden="true" className="realm-map-screen__fallback-wood-sites">
              {woodNodes.map((node) => {
                const world = axialToWorld(node.coord, HEX_SIZE);
                const occupied = node.availability !== 'available'
                  && node.availability !== 'unavailable';
                return (
                  <g
                    data-wood-site-id={node.siteId}
                    data-site-state={node.availability}
                    key={node.siteId}
                    transform={`translate(${world.x} ${-world.z})`}
                  >
                    {occupied ? (
                      <circle
                        fill="none"
                        r="0.34"
                        stroke="#b9e28d"
                        strokeOpacity="0.94"
                        strokeWidth="0.045"
                      />
                    ) : null}
                    <path
                      d="M-0.28 0.25L-0.17 -0.28H0.02L0.28 0.25ZM-0.08 -0.28V0.2M0.1 -0.28V0.2"
                      fill={node.availability === 'unavailable' ? '#657260' : '#6eaa61'}
                      stroke="#28482c"
                      strokeWidth="0.04"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M-0.16 0.04H0.16M-0.12 -0.08H0.12"
                      fill="none"
                      stroke="#e2f5b7"
                      strokeLinecap="round"
                      strokeWidth="0.035"
                    />
                  </g>
                );
              })}
            </g>
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
            labels={latestVisibleCastleLabelsRef.current}
            records={profileRecords}
            selectedCastleId={selectedCastle?.castleId}
            inspectorCastleId={inspectorCastle?.castleId}
            focusedCastleId={focusedCastleId}
            hoveredCastleId={hoveredCastleIdRef.current}
            ownCastleId={observerMode ? undefined : ownCastle.castleId}
            inspectorId={inspectorId}
            inspectorOpen={interaction.inspectorOpen}
            onActivate={selectCastle}
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
              resources={resources}
              onCollectResources={onCollectResources}
              profileTriggerRef={navigatorTriggerRef}
              foundedCastleCount={navigatorCastles.length}
              graphicsPreference={graphicsPreference}
              resolvedGraphicsQuality={resolvedGraphicsQuality}
              audioMuted={audioMuted}
              onGraphicsPreferenceChange={onGraphicsPreferenceChange}
              onAudioMutedChange={onAudioMutedChange}
              onRequestExplore={() => dispatchInteraction({ type: 'open-navigator' })}
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

          {inspectorGoldNode ? (
            <GoldMineInspectionPanel
              id={`${inspectorId}-gold-${inspectorGoldNode.siteId}`}
              mine={{ name: 'Gold Mine', tier: inspectorGoldNode.tier }}
              node={inspectorGoldNode}
              privateExpedition={observerMode ? undefined : goldExpedition}
              onDispatchGoldExpedition={observerMode ? undefined : onDispatchGoldExpedition}
              onClaimGoldExpedition={observerMode ? undefined : onClaimGoldExpedition}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={() => dispatchInteraction({ type: 'close-inspector' })}
            />
          ) : null}

          {inspectorFoodNode ? (
            <FoodFarmInspectionPanel
              id={`${inspectorId}-food-${inspectorFoodNode.siteId}`}
              farm={{ name: 'Wheat Farm', tier: inspectorFoodNode.tier }}
              node={inspectorFoodNode}
              privateExpedition={observerMode ? undefined : foodExpedition}
              onDispatchFoodExpedition={observerMode ? undefined : onDispatchFoodExpedition}
              onClaimFoodExpedition={observerMode ? undefined : onClaimFoodExpedition}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={() => dispatchInteraction({ type: 'close-inspector' })}
            />
          ) : null}

          {inspectorWoodNode ? (
            <LoggingCampInspectionPanel
              id={`${inspectorId}-wood-${inspectorWoodNode.siteId}`}
              camp={{ name: 'Logging Camp', tier: inspectorWoodNode.tier }}
              node={inspectorWoodNode}
              privateExpedition={observerMode ? undefined : woodExpedition}
              onDispatchWoodExpedition={observerMode ? undefined : onDispatchWoodExpedition}
              onClaimWoodExpedition={observerMode ? undefined : onClaimWoodExpedition}
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
            triggerVisible={observerMode}
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
