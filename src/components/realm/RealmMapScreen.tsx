import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';

import {
  axialToWorld,
  hexAdd,
  hexDistance,
  hexKey,
  type HexCoord
} from '../../game/map/hexCoordinates';
import {
  createCanonicalWaterNavigationGraph
} from '../../game/map/canonicalWaterNavigation';
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
import type {
  GraphicsPreference,
  GraphicsQualityTier
} from '../../settings/graphicsPreference';
import type { CanonicalWarpkeepRealmSnapshot } from '../../spacetime/warpkeepBackendTypes';
import {
  emitWarpkeepSfx,
  emitWarpkeepSfxBatch,
  type WarpkeepSfxEvent
} from '../audio/sfxEvents';
import {
  useMiniAppBackNavigation,
  useMiniAppHost
} from '../../farcaster/miniapp';
import { isCanonicalGenesisSnapshot } from '../../spacetime/canonicalGenesisSnapshot';
import type {
  ReadyRealmResourcePresentation,
  RealmEconomicResourceKey
} from './realmResourcePresentation';
import { CastleInspectionPanel } from './CastleInspectionPanel';
import { FoodFarmInspectionPanel } from './FoodFarmInspectionPanel';
import { GoldMineInspectionPanel } from './GoldMineInspectionPanel';
import { LoggingCampInspectionPanel } from './LoggingCampInspectionPanel';
import { StoneQuarryInspectionPanel } from './StoneQuarryInspectionPanel';
import { WaterInspectionPanel } from './WaterInspectionPanel';
import {
  RealmAccessibilityControls,
  type RealmNavigatorCloseReason,
  type RealmNavigatorResourceSite,
  type RealmNavigatorWorker
} from './RealmAccessibilityControls';
import {
  RealmCastleLabels,
  type CastleLabelRecord
} from './RealmCastleLabels';
import { RealmHud, type RealmActiveWagonMenuItem } from './RealmHud';
import { RealmObserverHud } from './RealmObserverHud';
import { RealmRendererRecoveryPanel } from './RealmRendererRecoveryPanel';
import { RealmResourceOccupantMarkers } from './RealmResourceOccupantMarkers';
import { RealmTerrainInspectionPanel } from './RealmTerrainInspectionPanel';
import { RealmWorkerPresenceMarkers } from './RealmWorkerPresenceMarkers';
import {
  createRealmScene,
  type RealmInteractionTarget,
  type RealmLiveGatheringState,
  type RealmResourceOccupantSceneRecord,
  type RealmSceneHandle,
  type RealmTerrainPresentationTelemetry
} from './createRealmScene';
import { resolveCanonicalWaterProjection } from './realmWaterProjection';
import { projectRealmWaterRevisionTerrainMetadata } from './realmWaterTerrainProjection';
import {
  realmWaterInspectionNavigation,
  realmWaterNavigatorBodies,
  resolveRealmWaterInspectionRecords,
  type RealmWaterInspectionRecord
} from './realmWaterInspectionPresentation';
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
import {
  resolveRealmStoneNodePresentations,
  type RealmStoneNodePresentation
} from './realmStoneNodePresentation';
import {
  applyRealmGenericWorkerSiteAvailability,
  realmResourceOccupantMarkerForKey,
  realmResourceOccupantMarkerKey,
  realmResourceOccupantRecallLegacyExpeditionId,
  realmResourceSiteWorldStates,
  resolveRealmResourceOccupantMarkerResolution,
  resolveRealmWorkerInspectionRoute,
  RESOURCE_KIND_LABELS,
  type RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';
import {
  goldExpeditionForNode,
  type GoldExpeditionPresentation
} from './realmGoldExpeditionPresentation';
import {
  foodExpeditionForNode,
  type FoodExpeditionPresentation
} from './realmFoodExpeditionPresentation';
import {
  woodExpeditionForNode,
  type WoodExpeditionPresentation
} from './realmWoodExpeditionPresentation';
import {
  stoneExpeditionForNode,
  type StoneExpeditionPresentation
} from './realmStoneExpeditionPresentation';
import type { RealmGoldNodePresentationTelemetry } from './realmGoldNodeLayer';
import type { RealmFoodNodePresentationTelemetry } from './realmFoodNodeLayer';
import type { RealmWoodNodePresentationTelemetry } from './realmWoodNodeLayer';
import type { RealmStoneNodePresentationTelemetry } from './realmStoneNodeLayer';
import {
  sampleLowlandsColor
} from './createTerrainGeometry';
import {
  realmCameraPresentationBand,
  type RealmCameraMode
} from './realmCameraController';
import type {
  RealmCastleInstancePresentationTelemetry
} from './realmCastleInstanceLayer';
import {
  measuredRealmComposition,
  measuredVisibleRealmUiRects,
  retainCastleProjectionWhileOccupiedResourceInspectorOpen
} from './realmMeasuredComposition';
import { settlePendingNavigatorCellFocus } from './realmNavigatorFocus';
import {
  REALM_QUALITY_SPECS,
  type RealmQuality
} from './realmQuality';
import type { RealmIdentity } from './realmTypes';
import type {
  RealmCastleProjectionFrame,
  RealmResourceProjectionFrame,
  RealmWorkerProjectionFrame
} from './realmTypes';
import {
  CASTLE_LABEL_COMPACT_MAXIMUM_CONTROL_WIDTH,
  CASTLE_LABEL_LAYOUT_MAX_CASTLES,
  CASTLE_LABEL_MAXIMUM_CONTROL_WIDTH,
  CASTLE_LABEL_MINIMUM_CONTROL_SIZE,
  castleProfileLabel,
  fallbackCastleIsInViewBox,
  fallbackCastleProjection,
  publicProfileForCastle,
  resolvePersistentCastleLabels,
  type RealmLabelReservedRect,
  type VisibleCastleLabel
} from './realmCastlePresentation';
import {
  realmSceneConstructionKey,
  realmSceneRecreationReason,
  realmSceneTopologyKey,
  useStableGatheringNodes,
  useStableGatheringNodeCatalog,
  useStablePeerCastleMarkers,
  useStableRealmTerrainMetadata,
  useStableRealmWaterSceneInputs,
  useStableSharedForestProjection,
  type RealmCastleProjection,
  type RealmSceneConstructionProfile,
  type RealmSceneRecreationReason
} from './realmMapProjectionStability';
import {
  REALM_HEX_SIZE as HEX_SIZE,
  applyCastleLabelPlacement,
  canUseWebGL,
  colorToCss,
  directionForKey,
  fallbackSurfacePresentation,
  initialQuality,
  pointsForSvg,
  sameCoord,
  selectedCellFor,
  useReducedMotionPreference
} from './realmMapPresentationHelpers';
import {
  createRealmInteractionState,
  realmInteractionReducer,
  resolveRealmEscape,
  type RealmCameraTarget
} from './realmInteractionState';
import {
  classifyRealmRendererFailure,
  initialRealmRendererLifecycle,
  REALM_RENDERER_CONTEXT_RESTORE_TIMEOUT_MS,
  REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS,
  REALM_RENDERER_RECOVERY_WALL_TIMEOUT_MS,
  REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS,
  REALM_RENDERER_STABILITY_WINDOW_MS,
  shouldRetryRealmRenderer,
  transitionRealmRendererLifecycle,
  type RealmRendererFailure,
  type RealmRendererLifecycle
} from './realmRendererRecovery';
import {
  canUseStaticRealmFallback,
  shouldRebalanceRealmRendererQuality
} from './realmRendererDiagnostics';
import {
  nextLowerRealmRendererQuality,
  readRealmRendererEmergencyQuality,
  resolveRealmRendererEmergencyQuality,
  retainRealmRendererEmergencyQuality
} from './realmRendererEmergencyQuality';
import './RealmMapScreen.css';
import './RealmCastlePresentation.css';
import { WorkerInspectionPanel } from './WorkerInspectionPanel';
import {
  realmSurfacePresentation,
  type RealmChromeMode
} from './realmChromePresentation';
import {
  type RealmSurfaceRoute
} from './realmSurfaceNavigation';
import { useRealmChromeMode } from './useRealmChromeMode';
import { useRealmSurfaceNavigation } from './useRealmSurfaceNavigation';
import type {
  RealmWorkerPresentationContinuityV1,
  RealmWorkerSceneRecord
} from './realmWorkerLayer';
import {
  resolveReadyPublicWorkerProjection,
  type ReadyPublicWorkerProjection,
  type ReadyWorkerProjection,
  type ReadyWorkerResourceState,
  type RealmWorkerPublicPresentation,
  type WorkerRosterPresentation
} from './realmWorkerPresentation';
import type { WarpkeepWorkerPrivateSyncStatus } from '../../spacetime/warpkeepBackendTypes';
import { resolveRealmWorldPortraitLayout } from './realmWorldPortraitLayout';
import { useRealmWorkerRecallLifecycle } from './useRealmWorkerRecallLifecycle';
import {
  realmWorkerSfxEvents,
  realmWorkerSfxSnapshot,
  type RealmWorkerSfxSnapshot
} from './realmWorkerSfxPresentation';

export {
  BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE,
  sharedForestProjectionSignature
} from './realmMapProjectionStability';
export type { RealmCastleProjection } from './realmMapProjectionStability';

type RealmMapScreenProps = Readonly<{
  identity: RealmIdentity;
  /** Privately branded, exact Genesis 001 renderer authority. */
  snapshot: CanonicalWarpkeepRealmSnapshot;
  /** Authenticated caller-only inventory, separate from the public snapshot. */
  resources?: ReadyRealmResourcePresentation;
  /** Exact caller-only Gold expedition procedure projection. */
  goldExpedition?: GoldExpeditionPresentation;
  /** Guarded reducer boundary; never supplied to observer presentation. */
  onDispatchGoldExpedition?: (siteId: string) => Promise<void>;
  /** Exact caller-only Food expedition procedure projection. */
  foodExpedition?: FoodExpeditionPresentation;
  /** Guarded Food reducer boundary; never supplied to observer presentation. */
  onDispatchFoodExpedition?: (siteId: string) => Promise<void>;
  /** Exact caller-only Wood expedition procedure projection. */
  woodExpedition?: WoodExpeditionPresentation;
  /** Guarded Wood reducer boundary; never supplied to observer presentation. */
  onDispatchWoodExpedition?: (siteId: string) => Promise<void>;
  /** Exact caller-only Stone expedition procedure projection. */
  stoneExpedition?: StoneExpeditionPresentation;
  /** Guarded Stone reducer boundary; never supplied to observer presentation. */
  onDispatchStoneExpedition?: (siteId: string) => Promise<void>;
  workerProjection?: ReadyWorkerProjection;
  workerRoster?: WorkerRosterPresentation;
  workerResourceState?: ReadyWorkerResourceState;
  /** Aggregate caller-private sync lifecycle only; contains no private payloads. */
  workerPrivateSync?: WarpkeepWorkerPrivateSyncStatus;
  onRetryWorkerPrivateSync?: () => void;
  onDispatchWorker?: (
    workerId: string,
    resourceKind: RealmEconomicResourceKey,
    siteId: string
  ) => Promise<void>;
  onRecallWorker?: (workerId: string) => Promise<void>;
  onRecallAllWorkers?: () => Promise<void>;
  onReturnLegacyExpedition?: (
    resourceKind: RealmEconomicResourceKey,
    expeditionId: string
  ) => Promise<void>;
  graphicsPreference?: GraphicsPreference;
  resolvedGraphicsQuality?: GraphicsQualityTier;
  audioMuted?: boolean;
  onGraphicsPreferenceChange?: (preference: GraphicsPreference) => void;
  onAudioMutedChange?: (muted: boolean) => void;
  onRequestReturn: () => void;
  qualityOverride?: RealmQuality;
  /** Explicit local QA presentation; it grants no backend or player authority. */
  presentationMode?: 'player' | 'observer';
  /** DEV-only phase/coordinate projection evidence for the synthetic QA fixture. */
  localQaWorkerProjectionTelemetry?: boolean;
}>;

type RendererMode = 'loading' | 'webgl' | 'fallback';
type RendererDeadlineKind = 'context-restore' | 'scene-build' | 'scene-rebuild';

function rendererTelemetryCount(value: string | undefined) {
  if (!value || !/^\d{1,9}$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

const REALM_KEYBOARD_INSTRUCTIONS_ID = 'realm-map-keyboard-instructions';
const RESOURCE_SELECTION_SFX_KINDS = Object.freeze({
  food: 'select-food',
  gold: 'select-gold',
  stone: 'select-stone',
  wood: 'select-wood'
} as const satisfies Readonly<Record<
  RealmEconomicResourceKey,
  Extract<WarpkeepSfxEvent, { kind: `select-${string}` }>['kind']
>>);

type PendingNavigatorTarget =
  | Readonly<{ kind: 'cell'; coord: HexCoord }>
  | Readonly<{ kind: 'castle'; castleId: number; coord: HexCoord }>
  | Readonly<{
      kind: 'worker';
      workerId: string;
      workerOrdinal: number;
      originCastleId: number;
      coord: HexCoord;
    }>
  | Readonly<{
      kind: 'resource-site';
      resource: RealmEconomicResourceKey;
      siteId: string;
      coord: HexCoord;
    }>
  | Readonly<{ kind: 'water'; cellKey: string; coord: HexCoord }>;

type PrivateExpeditionPresentation =
  | GoldExpeditionPresentation
  | FoodExpeditionPresentation
  | WoodExpeditionPresentation
  | StoneExpeditionPresentation;

type GatheringNodePresentation =
  | RealmGoldNodePresentation
  | RealmFoodNodePresentation
  | RealmWoodNodePresentation
  | RealmStoneNodePresentation;

function isRealmWorldSurfaceRoute(route: RealmSurfaceRoute | undefined) {
  return route?.kind === 'explore'
    || route?.kind === 'keep'
    || route?.kind === 'worker'
    || route?.kind === 'resource-site'
    || route?.kind === 'water'
    || route?.kind === 'terrain';
}

function unavailableNodeCatalog<Node extends GatheringNodePresentation>(
  nodes: readonly Node[]
): readonly Node[] {
  return Object.freeze(nodes.map((node) => {
    const {
      occupation: _occupation,
      originCastle: _originCastle,
      ...publicNode
    } = node;
    return Object.freeze({
      ...publicNode,
      availability: 'unavailable' as const,
      occupiedByViewer: false
    }) as Node;
  }));
}

function activeExpeditionSiteId(value: PrivateExpeditionPresentation | undefined) {
  return value?.status === 'ready' && value.active
    ? value.expedition?.siteId
    : undefined;
}

function workerControlSyncCopy(
  sync: WarpkeepWorkerPrivateSyncStatus | undefined
) {
  if (sync?.phase === 'failed-localized') {
    return 'Worker controls could not be synchronized. Public worker positions remain visible.';
  }
  if (sync?.phase === 'retry-wait') {
    return 'Worker controls are waiting to retry. Public worker positions remain visible.';
  }
  if (sync?.phase === 'stale-read-only') {
    return 'Refreshing worker controls. Public worker positions remain available in read-only mode.';
  }
  if (sync?.phase === 'ready' && sync.commandsEnabled) return undefined;
  return 'Synchronizing worker controls… Public worker positions remain available.';
}

function ownerExpeditionPublicJoin(node: GatheringNodePresentation | undefined) {
  if (!node?.occupiedByViewer || !node.occupation || !node.originCastle) return undefined;
  return Object.freeze({
    siteId: node.siteId,
    originCastleId: node.originCastle.castleId,
    phase: node.occupation.phase,
    startedAtMicros: node.occupation.startedAtMicros,
    arrivesAtMicros: node.occupation.arrivesAtMicros,
    gatheringEndsAtMicros: node.occupation.gatheringEndsAtMicros,
    returnsAtMicros: node.occupation.returnsAtMicros
  });
}

const applyDevWorkerProjectionTelemetry = import.meta.env.DEV
  ? (
      root: HTMLElement | null,
      enabled: boolean,
      frame: RealmWorkerProjectionFrame
    ) => {
      if (!root) return;
      if (!enabled) {
        delete root.dataset.realmLocalQaWorkerProjections;
        return;
      }
      root.dataset.realmLocalQaWorkerProjections = JSON.stringify(
        frame.markers
          .filter((marker) => (
            marker.phase === 'outbound' || marker.phase === 'returning'
          ))
          .map((marker) => Object.freeze({
            phase: marker.phase,
            x: marker.x,
            y: marker.y
          }))
      );
    }
  : undefined;

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

function CanonicalRealmMapScreen(props: RealmMapScreenProps) {
  const {
    identity,
    snapshot,
    resources,
    goldExpedition,
    onDispatchGoldExpedition,
    foodExpedition,
    onDispatchFoodExpedition,
    woodExpedition,
    onDispatchWoodExpedition,
    stoneExpedition,
    onDispatchStoneExpedition,
    workerProjection,
    workerRoster,
    workerResourceState,
    workerPrivateSync,
    onRetryWorkerPrivateSync,
    onDispatchWorker,
    onRecallWorker,
    onRecallAllWorkers,
    onReturnLegacyExpedition,
    graphicsPreference,
    resolvedGraphicsQuality,
    audioMuted,
    onGraphicsPreferenceChange,
    onAudioMutedChange,
    onRequestReturn,
    qualityOverride,
    presentationMode = 'player'
  } = props;
  // The observer is a development-only presentation of an already-sanitized
  // loopback snapshot. Compile the mode out of production even if a future
  // caller accidentally supplies the internal prop.
  const observerMode = import.meta.env.DEV && presentationMode === 'observer';
  const miniAppHost = useMiniAppHost();
  const resolvedChromeMode = useRealmChromeMode(miniAppHost.isMiniApp);
  const miniAppSafeAreaSignature = miniAppHost.context
    ? Object.values(miniAppHost.context.client.safeAreaInsets).join(':')
    : 'none';
  const surfaceNavigation = useRealmSurfaceNavigation({
    historyEnabled: true,
    identityKey: `${identity.fid}`
  });
  const surfaceChromeModeRef = useRef<RealmChromeMode>(resolvedChromeMode);
  if (surfaceNavigation.depth === 0) {
    surfaceChromeModeRef.current = resolvedChromeMode;
  }
  // A destination keeps the presentation semantics under which it opened.
  // Resizing cannot turn a compact history route into a desktop drawer (or
  // vice versa) halfway through its lifecycle.
  const chromeMode = surfaceNavigation.depth > 0
    ? surfaceChromeModeRef.current
    : resolvedChromeMode;
  const surfacePresentation = realmSurfacePresentation(chromeMode);
  const fullscreenDestinations = surfacePresentation === 'fullscreen-destination';
  const currentSurfaceRoute = surfaceNavigation.current;
  const workerRouteHostedByHud = !fullscreenDestinations
    && currentSurfaceRoute?.kind === 'worker'
    && surfaceNavigation.stack.at(-2)?.kind === 'workers';
  // Browser Forward may restore a compact world route after the viewport has
  // returned to desktop. It is then presented as a drawer, but it still owns a
  // history entry and must be closed through navigation rather than only
  // clearing local interaction state.
  const historyBackedWorldRoute = surfaceNavigation.depth > 0
    && isRealmWorldSurfaceRoute(currentSurfaceRoute)
    && !workerRouteHostedByHud;
  const surfaceOpen = surfaceNavigation.depth > 0;
  const surfaceOpenRef = useRef(surfaceOpen);
  surfaceOpenRef.current = surfaceOpen;
  const previousSurfaceStackRef = useRef(surfaceNavigation.stack);
  const previousFullscreenDestinationsRef = useRef(fullscreenDestinations);
  const [navigatorOpenGeneration, setNavigatorOpenGeneration] = useState(0);
  const pushSurface = surfaceNavigation.push;
  const replaceSurface = surfaceNavigation.replace;
  const backSurface = surfaceNavigation.back;
  const closeSurfacesToRealm = surfaceNavigation.closeToRealm;
  const pushWorldSurface = useCallback((route: RealmSurfaceRoute) => {
    if (fullscreenDestinations) pushSurface(route);
  }, [fullscreenDestinations, pushSurface]);
  const handleMiniAppBack = useCallback(() => {
    if (surfaceNavigation.depth > 0) {
      backSurface();
      return;
    }
    onRequestReturn();
  }, [backSurface, onRequestReturn, surfaceNavigation.depth]);
  // Direct-entry Mini Apps skip Warpkeep's menu, so keep the native host Back
  // control available at the Realm root as their explicit route to it. Nested
  // destinations still consume one navigation step before the root can leave.
  useMiniAppBackNavigation(surfaceNavigation.depth + 1, handleMiniAppBack);
  const workerProjectionTelemetryEnabled = import.meta.env.DEV
    ? props.localQaWorkerProjectionTelemetry === true
    : false;
  const workerProjectionTelemetryEnabledRef = useRef(
    workerProjectionTelemetryEnabled
  );
  workerProjectionTelemetryEnabledRef.current = workerProjectionTelemetryEnabled;
  const sharedForestProjection = useStableSharedForestProjection(
    snapshot.forestLayout,
    snapshot.forestTrees
  );
  const waterCells = useMemo(() => resolveCanonicalWaterProjection(
    snapshot.waterLayout,
    snapshot.waterBodies,
    snapshot.waterCells,
    snapshot.realmEnvironment,
    snapshot.waterRevision
  ), [
    snapshot.realmEnvironment,
    snapshot.waterBodies,
    snapshot.waterCells,
    snapshot.waterLayout,
    snapshot.waterRevision
  ]);
  const stableWaterSceneInputs = useStableRealmWaterSceneInputs({
    cells: waterCells,
    bodies: snapshot.waterBodies,
    environment: snapshot.realmEnvironment
  });
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSlotRefs = useRef<[
    HTMLCanvasElement | null,
    HTMLCanvasElement | null
  ]>([null, null]);
  const activeCanvasSlotRef = useRef<0 | 1>(0);
  const [activeCanvasSlot, setActiveCanvasSlot] = useState<0 | 1>(0);
  const [canvasSlotEpochs, setCanvasSlotEpochs] = useState<readonly [number, number]>(
    [0, 0]
  );
  const setPrimaryCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasSlotRefs.current[0] = canvas;
    if (activeCanvasSlotRef.current === 0) canvasRef.current = canvas;
  }, []);
  const setSecondaryCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasSlotRefs.current[1] = canvas;
    if (activeCanvasSlotRef.current === 1) canvasRef.current = canvas;
  }, []);
  const fallbackMapRef = useRef<SVGSVGElement>(null);
  const sceneRef = useRef<RealmSceneHandle | null>(null);
  const sceneSlotsRef = useRef<[
    RealmSceneHandle | null,
    RealmSceneHandle | null
  ]>([null, null]);
  const pendingSceneConstructionRef = useRef<Readonly<{
    key: string;
    recoveryNonce: number;
    generation: number;
    slot: 0 | 1;
    scene: RealmSceneHandle;
  }> | null>(null);
  const componentLifecycleEpochRef = useRef(0);
  const inspectorFocusRef = useRef<HTMLButtonElement>(null);
  const workerInspectorFocusRef = useRef<HTMLHeadingElement>(null);
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
  const projectedTileMetadata = useMemo(
    () => projectRealmWaterRevisionTerrainMetadata(sharedTileMetadata, waterCells),
    [sharedTileMetadata, waterCells]
  );
  const waterNavigationGraph = useMemo(
    () => createCanonicalWaterNavigationGraph(
      stableWaterSceneInputs.cells,
      stableWaterSceneInputs.bodies
    ),
    [stableWaterSceneInputs.bodies, stableWaterSceneInputs.cells]
  );
  const waterRecords = useMemo(
    () => resolveRealmWaterInspectionRecords(waterCells, projectedTileMetadata),
    [projectedTileMetadata, waterCells]
  );
  const waterRecordsByKey = useMemo(
    () => new Map(waterRecords.map((record) => [record.cellKey, record] as const)),
    [waterRecords]
  );
  const waterRecordsByKeyRef = useRef<ReadonlyMap<string, RealmWaterInspectionRecord>>(waterRecordsByKey);
  waterRecordsByKeyRef.current = waterRecordsByKey;
  const navigatorWaterBodies = useMemo(
    () => realmWaterNavigatorBodies(waterRecords),
    [waterRecords]
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
    projectedTileMetadata.map((metadata) => [metadata.tileKey, metadata] as const)
  ), [projectedTileMetadata]);
  const terrainCellsByKey = useMemo(() => new Map(
    surface.playableMap.cells.map((cell) => [hexKey(cell.coord), cell] as const)
  ), [surface]);
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
  const goldNodeCatalog = useStableGatheringNodeCatalog(goldNodes);
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
  const foodNodeCatalog = useStableGatheringNodeCatalog(foodNodes);
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
  const woodNodeCatalog = useStableGatheringNodeCatalog(woodNodes);
  const woodNodesRef = useRef(woodNodes);
  woodNodesRef.current = woodNodes;
  const woodNodesBySiteId = useMemo(() => new Map(
    woodNodes.map((node) => [node.siteId, node] as const)
  ), [woodNodes]);
  const resolvedStoneNodes = useMemo<readonly RealmStoneNodePresentation[]>(() => (
    resolveRealmStoneNodePresentations({
      sites: snapshot.stoneSites,
      occupations: snapshot.stoneNodeOccupations,
      castles: allCastles.map((castle) => ({
        castleId: castle.castleId,
        name: castle.name,
        q: castle.q,
        r: castle.r
      })),
      ownCastleId: observerMode ? undefined : ownCastle.castleId,
      isPlayableCoord: (coord) => isPlayableRealmCoord(surface, coord)
    })
  ), [allCastles, observerMode, ownCastle.castleId, snapshot.stoneNodeOccupations, snapshot.stoneSites, surface]);
  const stoneNodes = useStableGatheringNodes(resolvedStoneNodes);
  const stoneNodeCatalog = useStableGatheringNodeCatalog(stoneNodes);
  const stoneNodesRef = useRef(stoneNodes);
  stoneNodesRef.current = stoneNodes;
  const stoneNodesBySiteId = useMemo(() => new Map(
    stoneNodes.map((node) => [node.siteId, node] as const)
  ), [stoneNodes]);
  const workerResourceSites = useMemo(() => Object.freeze([
    ...foodNodeCatalog.map((node) => Object.freeze({
      resourceKind: 'food' as const,
      siteId: node.siteId,
      q: node.coord.q,
      r: node.coord.r
    })),
    ...woodNodeCatalog.map((node) => Object.freeze({
      resourceKind: 'wood' as const,
      siteId: node.siteId,
      q: node.coord.q,
      r: node.coord.r
    })),
    ...stoneNodeCatalog.map((node) => Object.freeze({
      resourceKind: 'stone' as const,
      siteId: node.siteId,
      q: node.coord.q,
      r: node.coord.r
    })),
    ...goldNodeCatalog.map((node) => Object.freeze({
      resourceKind: 'gold' as const,
      siteId: node.siteId,
      q: node.coord.q,
      r: node.coord.r
    }))
  ]), [foodNodeCatalog, goldNodeCatalog, stoneNodeCatalog, woodNodeCatalog]);
  const publicWorkerProjection = useMemo(() => resolveReadyPublicWorkerProjection({
    realmId: snapshot.realm.realmId,
    castleIds: allCastles.map((castle) => castle.castleId),
    ownCastleId: ownCastle.castleId,
    system: snapshot.workerSystem,
    workers: snapshot.workerWorkers,
    occupations: snapshot.workerOccupations,
    resourceSites: workerResourceSites
  }), [
    allCastles,
    ownCastle.castleId,
    snapshot.realm.realmId,
    snapshot.workerOccupations,
    snapshot.workerSystem,
    snapshot.workerWorkers,
    workerResourceSites
  ]);
  const publicWorkerProjectionRef = useRef<ReadyPublicWorkerProjection | undefined>(
    publicWorkerProjection
  );
  publicWorkerProjectionRef.current = publicWorkerProjection;
  const publicOwnedWorkers = useMemo(
    () => Object.freeze(
      publicWorkerProjection?.workers
        .filter((worker) => worker.ownedByViewer)
        .slice()
        .sort((left, right) => left.ordinal - right.ordinal) ?? []
    ),
    [publicWorkerProjection]
  );
  const workerSfxSnapshot = useMemo(
    () => realmWorkerSfxSnapshot(observerMode ? [] : publicOwnedWorkers),
    [observerMode, publicOwnedWorkers]
  );
  const workerSfxSignature = workerSfxSnapshot
    .map((worker) => `${worker.workerId}:${worker.status}`)
    .sort()
    .join('|');
  const previousWorkerSfxSnapshotRef = useRef<
    readonly RealmWorkerSfxSnapshot[] | undefined
  >(undefined);
  useEffect(() => {
    const previous = previousWorkerSfxSnapshotRef.current;
    previousWorkerSfxSnapshotRef.current = workerSfxSnapshot;
    if (!previous || workerSfxSnapshot.length === 0) return;
    emitWarpkeepSfxBatch(realmWorkerSfxEvents(previous, workerSfxSnapshot));
  }, [workerSfxSignature, workerSfxSnapshot]);
  const workerRecallLifecycle = useRealmWorkerRecallLifecycle({
    identityFid: identity.fid,
    workers: observerMode ? [] : publicOwnedWorkers,
    onRecallWorker: observerMode ? undefined : onRecallWorker,
    onRecallAllWorkers: observerMode ? undefined : onRecallAllWorkers
  });
  const guardedRecallWorker = workerRecallLifecycle.recallWorker;
  const guardedRecallAllWorkers = workerRecallLifecycle.recallAllWorkers;
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
  const workerSceneRecords = useMemo<readonly RealmWorkerSceneRecord[]>(() => {
    if (observerMode || publicWorkerProjection?.mode !== 'active') return Object.freeze([]);
    const castlesById = new Map(allCastles.map((castle) => [castle.castleId, castle] as const));
    const sitesByResource = Object.freeze({
      food: foodNodesBySiteId,
      wood: woodNodesBySiteId,
      stone: stoneNodesBySiteId,
      gold: goldNodesBySiteId
    });
    const records: RealmWorkerSceneRecord[] = [];
    for (const worker of publicWorkerProjection.workers) {
      const origin = castlesById.get(worker.originCastleId);
      if (!origin) return Object.freeze([]);
      const destination = worker.resourceKind && worker.siteId
        ? sitesByResource[worker.resourceKind].get(worker.siteId)
        : undefined;
      if (worker.status !== 'idle' && destination === undefined) return Object.freeze([]);
      const profile = profileRecords.get(worker.originCastleId)?.profile;
      records.push(Object.freeze({
        ...worker,
        originCoord: Object.freeze({ q: origin.q, r: origin.r }),
        ...(profile === undefined ? {} : { profile }),
        ...(destination === undefined
          ? {}
          : { destinationCoord: Object.freeze({ ...destination.coord }) })
      }));
    }
    return Object.freeze(records);
  }, [
    allCastles,
    foodNodesBySiteId,
    goldNodesBySiteId,
    observerMode,
    profileRecords,
    publicWorkerProjection,
    stoneNodesBySiteId,
    woodNodesBySiteId
  ]);
  const workerSceneRecordsRef = useRef(workerSceneRecords);
  workerSceneRecordsRef.current = workerSceneRecords;
  const navigatorWorkers = useMemo<readonly RealmNavigatorWorker[]>(() => (
    workerSceneRecords.map((worker) => Object.freeze({
      workerId: worker.workerId,
      ordinal: worker.ordinal,
      originCastleId: worker.originCastleId,
      originCastleName: worker.originCastleName,
      status: worker.status,
      ...(worker.status === 'idle'
        ? { coord: Object.freeze({ ...worker.originCoord }) }
        : {}),
      ownedByViewer: worker.ownedByViewer
    }))
  ), [workerSceneRecords]);
  const activeWagons = useMemo<readonly RealmActiveWagonMenuItem[]>(() => {
    if (observerMode) return Object.freeze([]);
    const items: RealmActiveWagonMenuItem[] = [];
    const foodNode = foodNodesBySiteId.get(activeExpeditionSiteId(foodExpedition) ?? '');
    const joinedFood = foodExpeditionForNode(
      foodExpedition,
      ownerExpeditionPublicJoin(foodNode)
    );
    if (joinedFood?.expedition) {
      items.push(Object.freeze({
        resource: 'food',
        siteId: joinedFood.expedition.siteId,
        phase: joinedFood.expedition.phase
      }));
    }
    const woodNode = woodNodesBySiteId.get(activeExpeditionSiteId(woodExpedition) ?? '');
    const joinedWood = woodExpeditionForNode(
      woodExpedition,
      ownerExpeditionPublicJoin(woodNode)
    );
    if (joinedWood?.expedition) {
      items.push(Object.freeze({
        resource: 'wood',
        siteId: joinedWood.expedition.siteId,
        phase: joinedWood.expedition.phase
      }));
    }
    const stoneNode = stoneNodesBySiteId.get(activeExpeditionSiteId(stoneExpedition) ?? '');
    const joinedStone = stoneExpeditionForNode(
      stoneExpedition,
      ownerExpeditionPublicJoin(stoneNode)
    );
    if (joinedStone?.expedition) {
      items.push(Object.freeze({
        resource: 'stone',
        siteId: joinedStone.expedition.siteId,
        phase: joinedStone.expedition.phase
      }));
    }
    const goldNode = goldNodesBySiteId.get(activeExpeditionSiteId(goldExpedition) ?? '');
    const joinedGold = goldExpeditionForNode(
      goldExpedition,
      ownerExpeditionPublicJoin(goldNode)
    );
    if (joinedGold?.expedition) {
      items.push(Object.freeze({
        resource: 'gold',
        siteId: joinedGold.expedition.siteId,
        phase: joinedGold.expedition.phase
      }));
    }
    return Object.freeze(items);
  }, [
    foodExpedition,
    foodNodesBySiteId,
    goldExpedition,
    goldNodesBySiteId,
    observerMode,
    stoneExpedition,
    stoneNodesBySiteId,
    woodExpedition,
    woodNodesBySiteId
  ]);
  const genericWorkerAuthorityActive = snapshot.workerSystem?.mode === 'active';
  const publicWorkerPresentationReady = publicWorkerProjection?.mode === 'active';
  const workerControlsStatus = !observerMode && genericWorkerAuthorityActive
    ? !publicWorkerPresentationReady
      ? 'Worker presentation is temporarily unavailable. Public records are recovering while the Realm remains open.'
      : onDispatchWorker === undefined
        ? workerControlSyncCopy(workerPrivateSync)
          ?? 'Worker controls are temporarily unavailable.'
        : undefined
    : undefined;
  const legacyExpeditionReturnAvailable = snapshot.workerSystem?.mode === 'staged'
    && snapshot.workerSystem.legacyDrainRequired;
  const legacyResourceDispatchBlocked = genericWorkerAuthorityActive
    || snapshot.workerSystem?.legacyDrainRequired === true;
  const resourceOccupantResolution = useMemo(() => (
    resolveRealmResourceOccupantMarkerResolution({
      buckets: [
        { resource: 'gold', nodes: goldNodes },
        { resource: 'food', nodes: foodNodes },
        { resource: 'wood', nodes: woodNodes },
        { resource: 'stone', nodes: stoneNodes }
      ],
      castles: allCastles,
      profiles: profileRecords,
      workerProjection: publicWorkerProjection,
      activeGenericModeExpected: genericWorkerAuthorityActive,
      ownCastleId: observerMode ? undefined : ownCastle.castleId
    })
  ), [
    allCastles,
    foodNodes,
    goldNodes,
    genericWorkerAuthorityActive,
    observerMode,
    ownCastle.castleId,
    profileRecords,
    publicWorkerProjection,
    stoneNodes,
    woodNodes
  ]);
  const resourceOccupantMarkers = resourceOccupantResolution.markers;
  const resourceOccupantMarkersRef = useRef(resourceOccupantMarkers);
  resourceOccupantMarkersRef.current = resourceOccupantMarkers;
  const resourceOccupancyUnavailable = genericWorkerAuthorityActive
    && resourceOccupantResolution.status === 'invalid';
  const sceneGoldNodes = useMemo(
    () => resourceOccupancyUnavailable
      ? unavailableNodeCatalog(goldNodes)
      : applyRealmGenericWorkerSiteAvailability(
          'gold',
          goldNodes,
          resourceOccupantResolution
        ),
    [goldNodes, resourceOccupancyUnavailable, resourceOccupantResolution]
  );
  const sceneFoodNodes = useMemo(
    () => resourceOccupancyUnavailable
      ? unavailableNodeCatalog(foodNodes)
      : applyRealmGenericWorkerSiteAvailability(
          'food',
          foodNodes,
          resourceOccupantResolution
        ),
    [foodNodes, resourceOccupancyUnavailable, resourceOccupantResolution]
  );
  const sceneWoodNodes = useMemo(
    () => resourceOccupancyUnavailable
      ? unavailableNodeCatalog(woodNodes)
      : applyRealmGenericWorkerSiteAvailability(
          'wood',
          woodNodes,
          resourceOccupantResolution
        ),
    [resourceOccupancyUnavailable, resourceOccupantResolution, woodNodes]
  );
  const sceneStoneNodes = useMemo(
    () => resourceOccupancyUnavailable
      ? unavailableNodeCatalog(stoneNodes)
      : applyRealmGenericWorkerSiteAvailability(
          'stone',
          stoneNodes,
          resourceOccupantResolution
        ),
    [resourceOccupancyUnavailable, resourceOccupantResolution, stoneNodes]
  );
  const navigatorResourceSites = useMemo<readonly RealmNavigatorResourceSite[]>(() => {
    const entries: RealmNavigatorResourceSite[] = [];
    const append = (
      resource: RealmEconomicResourceKey,
      nodes: readonly GatheringNodePresentation[]
    ) => {
      nodes.forEach((node, index) => {
        const availability = node.availability === 'available'
          ? 'available'
          : node.availability === 'gathering'
            ? 'occupied'
            : node.availability === 'outbound' || node.availability === 'returning'
              ? 'reserved'
              : 'unavailable';
        entries.push(Object.freeze({
          key: `${resource}:${node.siteId}`,
          resource,
          label: `${RESOURCE_KIND_LABELS[resource]} ${index + 1}`,
          tier: node.tier,
          availability
        }));
      });
    };
    append('food', sceneFoodNodes);
    append('wood', sceneWoodNodes);
    append('stone', sceneStoneNodes);
    append('gold', sceneGoldNodes);
    return Object.freeze(entries);
  }, [sceneFoodNodes, sceneGoldNodes, sceneStoneNodes, sceneWoodNodes]);
  const resourceSiteWorldStates = useMemo(() => Object.freeze({
    gold: realmResourceSiteWorldStates(
      'gold',
      goldNodes,
      resourceOccupantResolution
    ),
    food: realmResourceSiteWorldStates(
      'food',
      foodNodes,
      resourceOccupantResolution
    ),
    wood: realmResourceSiteWorldStates(
      'wood',
      woodNodes,
      resourceOccupantResolution
    ),
    stone: realmResourceSiteWorldStates(
      'stone',
      stoneNodes,
      resourceOccupantResolution
    )
  }), [
    foodNodes,
    goldNodes,
    resourceOccupantResolution,
    stoneNodes,
    woodNodes
  ]);
  const resourceOccupantSceneSignature = JSON.stringify(
    resourceOccupantMarkers.map((marker) => [
      marker.resource,
      marker.siteId,
      marker.nodeCoord.q,
      marker.nodeCoord.r
    ])
  );
  const resourceOccupantSceneCacheRef = useRef<Readonly<{
    signature: string;
    records: readonly RealmResourceOccupantSceneRecord[];
  }> | undefined>(undefined);
  if (resourceOccupantSceneCacheRef.current?.signature !== resourceOccupantSceneSignature) {
    resourceOccupantSceneCacheRef.current = Object.freeze({
      signature: resourceOccupantSceneSignature,
      records: Object.freeze(resourceOccupantMarkers.map((marker) => Object.freeze({
        resource: marker.resource,
        siteId: marker.siteId,
        coord: Object.freeze({ ...marker.nodeCoord })
      })))
    });
  }
  const resourceOccupantSceneRecords = resourceOccupantSceneCacheRef.current.records;
  const liveGatheringState = useMemo<RealmLiveGatheringState>(() => {
    let observedAtMicros = 0n;
    for (const node of [
      ...sceneGoldNodes,
      ...sceneFoodNodes,
      ...sceneWoodNodes,
      ...sceneStoneNodes
    ]) {
      const occupation = node.occupation;
      if (!occupation) continue;
      observedAtMicros = [
        observedAtMicros,
        occupation.startedAtMicros,
        occupation.arrivesAtMicros,
        occupation.gatheringEndsAtMicros,
        occupation.returnsAtMicros
      ].reduce((latest, candidate) => candidate > latest ? candidate : latest, observedAtMicros);
    }
    for (const worker of workerSceneRecords) {
      for (const candidate of [
        worker.startedAtMicros,
        worker.arrivesAtMicros,
        worker.gatheringEndsAtMicros,
        worker.returnStartedAtMicros,
        worker.returnsAtMicros
      ]) {
        if (candidate !== undefined && candidate > observedAtMicros) observedAtMicros = candidate;
      }
    }
    return Object.freeze({
      goldNodes: sceneGoldNodes,
      foodNodes: sceneFoodNodes,
      woodNodes: sceneWoodNodes,
      stoneNodes: sceneStoneNodes,
      workers: workerSceneRecords,
      resourceOccupants: resourceOccupantSceneRecords,
      resourceSiteWorldStates,
      observedAtMicros
    });
  }, [
    resourceOccupantSceneRecords,
    resourceSiteWorldStates,
    sceneFoodNodes,
    sceneGoldNodes,
    sceneStoneNodes,
    sceneWoodNodes,
    workerSceneRecords
  ]);
  const liveGatheringStateRef = useRef(liveGatheringState);
  liveGatheringStateRef.current = liveGatheringState;
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
  const requestedQuality = useMemo(
    () => initialQuality(qualityOverride),
    [qualityOverride]
  );
  const [emergencyQualityCeiling, setEmergencyQualityCeiling] = useState<
    RealmQuality | undefined
  >(readRealmRendererEmergencyQuality);
  const quality = useMemo(
    () => resolveRealmRendererEmergencyQuality(
      requestedQuality,
      emergencyQualityCeiling
    ),
    [emergencyQualityCeiling, requestedQuality]
  );
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const qualitySpec = REALM_QUALITY_SPECS[quality];
  const nonblockingSceneReplacementRef = useRef(false);
  const [rendererLifecycle, setRendererLifecycle] = useState<RealmRendererLifecycle>(
    initialRealmRendererLifecycle
  );
  const rendererMode: RendererMode = (
    rendererLifecycle.state === 'static-unsupported'
    || rendererLifecycle.state === 'static-degraded'
  )
    ? 'fallback'
    : rendererLifecycle.state === 'ready'
      || (
        rendererLifecycle.state === 'loading'
        && nonblockingSceneReplacementRef.current
        && sceneRef.current !== null
      )
      ? 'webgl'
      : 'loading';
  const rendererModeRef = useRef<RendererMode>('loading');
  rendererModeRef.current = rendererMode;
  const rendererLifecycleRef = useRef(rendererLifecycle);
  rendererLifecycleRef.current = rendererLifecycle;
  // Scene callbacks can arrive after React has already retired their effect.
  // Keep the active generation in a synchronous ref so stale scenes cannot
  // publish ready/failure state into a newer renderer.
  const activeRendererGenerationRef = useRef(0);
  const lastSuccessfulRendererGenerationRef = useRef(0);
  const nextRendererGenerationRef = useRef(1);
  const rendererDeadlineRef = useRef<{
    generation: number;
    kind: RendererDeadlineKind;
    expiresAt: number;
    wallExpiresAt: number;
    durationMilliseconds: number;
    token: number;
    timer: number;
    handleVisibilityChange: () => void;
  } | null>(null);
  const nextRendererDeadlineTokenRef = useRef(1);
  const rendererStabilityTimerRef = useRef<{
    generation: number;
    remainingMilliseconds: number;
    visibleStartedAt: number;
    timer: number;
    handleVisibilityChange: () => void;
  } | null>(null);
  const armRendererStabilityTimerRef = useRef<(generation: number) => void>(
    () => undefined
  );
  const rendererWebGLProbeAvailableRef = useRef<boolean | undefined>(undefined);
  const markRendererFailureRef = useRef<(
    failureInput?: RealmRendererFailure | unknown,
    reportedGeneration?: number
  ) => void>(() => undefined);
  const pendingEmergencyQualityRef = useRef<Readonly<{
    generation: number;
    quality: RealmQuality;
  }> | undefined>(undefined);
  const recoverySceneRebuildDeadlinePendingRef = useRef(false);
  const recoverySceneRebuildDeadlineKindRef = useRef<
    Exclude<RendererDeadlineKind, 'context-restore'> | undefined
  >(undefined);
  const recoverySceneRebuildDeadlineExpiresAtRef = useRef<number | undefined>(
    undefined
  );
  const recoverySceneRebuildDeadlineWallExpiresAtRef = useRef<number | undefined>(
    undefined
  );
  const rendererRecoveryNonceRef = useRef(0);
  const [rendererRecoveryNonce, setRendererRecoveryNonce] = useState(0);
  const rendererAttestationRef = useRef<ReturnType<RealmSceneHandle['getCameraAttestation']> | null>(null);
  const workerPresentationContinuityRef = useRef<Readonly<{
    topologyKey: string;
    snapshot: RealmWorkerPresentationContinuityV1;
  }> | null>(null);
  const sceneConstructionProfileRef = useRef<RealmSceneConstructionProfile | undefined>(undefined);
  const requestedSceneRecreationReasonRef = useRef<
    'renderer-recovery' | 'explicit-retry' | undefined
  >(undefined);
  const lastSceneRecreationReasonRef = useRef<RealmSceneRecreationReason>('initial-entry');
  const sceneCreationCountRef = useRef(0);
  const sceneDisposalCountRef = useRef(0);
  const sceneReplacementFailureCountRef = useRef(0);
  const rendererContextLossCountRef = useRef(0);
  const rendererContextRestoreCountRef = useRef(0);
  const rendererCanvasByGenerationRef = useRef(new Map<number, HTMLCanvasElement>());
  const rendererContextTelemetryByGenerationRef = useRef(new Map<number, Readonly<{
    losses: number;
    restores: number;
  }>>());
  const firstReadyAtRef = useRef<number | null>(null);
  const cameraAttestationRestoreCountRef = useRef(0);
  const [cameraMode, setCameraMode] = useState<RealmCameraMode>('realm');
  const cameraModeRef = useRef<RealmCameraMode>('realm');
  cameraModeRef.current = cameraMode;
  const selectionFeedbackSequenceRef = useRef(0);
  const selectionFeedbackTimerRef = useRef<number | null>(null);
  const pendingSelectionScreenXRef = useRef<number | undefined>(undefined);
  const lastSfxSelectionKeyRef = useRef<string | undefined>(undefined);
  const [worldSelectionFeedback, setWorldSelectionFeedback] = useState<
    Readonly<{ sequence: number; x: number; y: number }> | undefined
  >(undefined);
  useEffect(() => () => {
    if (selectionFeedbackTimerRef.current !== null) {
      window.clearTimeout(selectionFeedbackTimerRef.current);
    }
  }, []);
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
  const previousResolvedSurfacePresentationRef = useRef(
    realmSurfacePresentation(resolvedChromeMode)
  );
  useLayoutEffect(() => {
    const previousPresentation = previousResolvedSurfacePresentationRef.current;
    const nextPresentation = realmSurfacePresentation(resolvedChromeMode);
    previousResolvedSurfacePresentationRef.current = nextPresentation;
    if (
      surfaceNavigation.depth > 0
      || previousPresentation === nextPresentation
      || nextPresentation !== 'fullscreen-destination'
    ) return;

    // A stackless desktop inspector has no hosted Back route. If the viewport
    // becomes compact, close it focus-safely before adopting fullscreen
    // semantics instead of leaving an unreachable destination on screen.
    const current = interactionRef.current;
    if (current.inspectorOpen) {
      dispatchInteraction({ type: 'close-inspector' });
    }
    if (current.navigatorOpen) {
      dispatchInteraction({ type: 'close-navigator' });
    }
  }, [resolvedChromeMode, surfaceNavigation.depth]);
  useEffect(() => {
    if (!interaction.inspectorOpen) lastSfxSelectionKeyRef.current = undefined;
  }, [interaction.inspectorOpen]);
  const selectedCoord = interaction.selectedCell;
  const selectedCoordRef = useRef<HexCoord>(interaction.selectedCell);
  const hoveredCoordRef = useRef<HexCoord | null>(null);
  const hoveredCastleIdRef = useRef<number | undefined>(undefined);
  const [visibleCastleLabels, setVisibleCastleLabels] = useState<readonly VisibleCastleLabel[]>([]);
  const latestVisibleCastleLabelsRef = useRef<readonly VisibleCastleLabel[]>([]);
  const latestProjectionRef = useRef<RealmCastleProjectionFrame>({ width: 0, height: 0, castles: [] });
  const latestResourceProjectionRef = useRef<RealmResourceProjectionFrame>({
    width: 0,
    height: 0,
    markers: []
  });
  const latestWorkerProjectionRef = useRef<RealmWorkerProjectionFrame>({
    width: 0,
    height: 0,
    markers: []
  });
  const reservedUiRectsRef = useRef<readonly RealmLabelReservedRect[]>([]);
  const reservedCastleLabelRectsRef = useRef<readonly RealmLabelReservedRect[]>([]);
  const stableCameraCompositionRef = useRef<ReturnType<typeof measuredRealmComposition> | null>(null);
  const compositionRafRef = useRef<number | null>(null);
  const pendingNavigatorTargetRef = useRef<PendingNavigatorTarget | null>(null);
  const pendingNavigatorPermittedStackRef = useRef<
    readonly RealmSurfaceRoute[] | null
  >(null);
  const surfaceNavigationStackRef = useRef(surfaceNavigation.stack);
  surfaceNavigationStackRef.current = surfaceNavigation.stack;
  const activatePendingNavigatorTargetRef = useRef<
    (target: PendingNavigatorTarget) => void
  >(() => undefined);
  const labelMembershipSignatureRef = useRef('');
  const presentedCastleIdsRef = useRef<readonly number[]>([]);
  const handledKeyboardIntentSequenceRef = useRef(-1);
  const reducedMotion = useReducedMotionPreference();
  const sceneConstructionKeys = useMemo(() => {
    const input = {
      canonicalFingerprint: snapshot.canonicalFingerprint,
      realmId: snapshot.realm.realmId,
      numericSeed: snapshot.realm.numericSeed,
      authoritativeRadius: snapshot.realm.authoritativeRadius,
      renderRadius: snapshot.realm.renderRadius,
      ownCastleId: ownCastle.castleId,
      keepCoord,
      peerCastles,
      goldNodes: goldNodeCatalog,
      foodNodes: foodNodeCatalog,
      woodNodes: woodNodeCatalog,
      stoneNodes: stoneNodeCatalog,
      forestSignature: sharedForestProjection.signature,
      waterSignature: stableWaterSceneInputs.signature,
      quality: qualitySpec.id,
      reducedMotion,
      observerMode
    } as const;
    return Object.freeze({
      key: realmSceneConstructionKey(input),
      topologyKey: realmSceneTopologyKey(input)
    });
  }, [
    foodNodeCatalog,
    goldNodeCatalog,
    keepCoord,
    observerMode,
    ownCastle.castleId,
    peerCastles,
    qualitySpec.id,
    reducedMotion,
    sharedForestProjection.signature,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.numericSeed,
    snapshot.canonicalFingerprint,
    snapshot.realm.realmId,
    snapshot.realm.renderRadius,
    stableWaterSceneInputs.signature,
    stoneNodeCatalog,
    woodNodeCatalog
  ]);
  const sceneConstructionKey = sceneConstructionKeys.key;
  const sceneTopologyKey = sceneConstructionKeys.topologyKey;
  const fallbackSurface = useMemo(
    () => fallbackSurfacePresentation(surface, { focusCoord: keepCoord, radius: 16 }),
    [keepCoord, surface]
  );
  const viewBox = fallbackSurface.viewBox;
  const fallbackVisibleCastleIds = useMemo(() => new Set(
    allCastles
      .filter((castle) => fallbackCastleIsInViewBox(castle, viewBox))
      .map((castle) => castle.castleId)
  ), [allCastles, viewBox]);
  const visibleFallbackFoundations = useMemo(() => fallbackFoundations.filter((foundation) => {
    const castleId = foundation.id === 'own-keep'
      ? ownCastle.castleId
      : Number(foundation.id.replace(/^peer-castle-/, ''));
    return fallbackVisibleCastleIds.has(castleId);
  }), [fallbackFoundations, fallbackVisibleCastleIds, ownCastle.castleId]);
  const selectedCell = selectedCellFor(surface, selectedCoord, keepCoord);
  const selectedTerrainKindCandidate = tileMetadataByKey.get(hexKey(selectedCoord))?.terrainKind;
  const selectedTerrainKind = isRealmTerrainKind(selectedTerrainKindCandidate)
    ? selectedTerrainKindCandidate
    : undefined;
  const terrainSurfaceRoute = surfaceNavigation.current?.kind === 'terrain'
    ? surfaceNavigation.current
    : undefined;
  const terrainSurfaceCell = terrainSurfaceRoute
    ? terrainCellsByKey.get(terrainSurfaceRoute.tileKey)
    : undefined;
  const terrainSurfaceMetadata = terrainSurfaceRoute
    ? tileMetadataByKey.get(terrainSurfaceRoute.tileKey)
    : undefined;
  const terrainSurfaceKind = isRealmTerrainKind(terrainSurfaceMetadata?.terrainKind)
    ? terrainSurfaceMetadata.terrainKind
    : selectedTerrainKind;
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
  const inspectorStoneNode = selectedInspectorTarget !== null
    && 'stoneSiteId' in selectedInspectorTarget
    ? stoneNodesBySiteId.get(selectedInspectorTarget.stoneSiteId)
    : undefined;
  const selectedNavigatorResourceKey = inspectorGoldNode
    ? `gold:${inspectorGoldNode.siteId}`
    : inspectorFoodNode
      ? `food:${inspectorFoodNode.siteId}`
      : inspectorWoodNode
        ? `wood:${inspectorWoodNode.siteId}`
        : inspectorStoneNode
          ? `stone:${inspectorStoneNode.siteId}`
          : undefined;
  const inspectorGoldOccupant = inspectorGoldNode
    ? realmResourceOccupantMarkerForKey(
        resourceOccupantMarkers,
        `gold:${inspectorGoldNode.siteId}`
      ) ?? undefined
    : undefined;
  const inspectorFoodOccupant = inspectorFoodNode
    ? realmResourceOccupantMarkerForKey(
        resourceOccupantMarkers,
        `food:${inspectorFoodNode.siteId}`
      ) ?? undefined
    : undefined;
  const inspectorWoodOccupant = inspectorWoodNode
    ? realmResourceOccupantMarkerForKey(
        resourceOccupantMarkers,
        `wood:${inspectorWoodNode.siteId}`
      ) ?? undefined
    : undefined;
  const inspectorStoneOccupant = inspectorStoneNode
    ? realmResourceOccupantMarkerForKey(
        resourceOccupantMarkers,
        `stone:${inspectorStoneNode.siteId}`
      ) ?? undefined
    : undefined;
  const inspectorGoldLegacyExpeditionId = legacyExpeditionReturnAvailable
    && inspectorGoldOccupant
    ? realmResourceOccupantRecallLegacyExpeditionId(
        inspectorGoldOccupant,
        'gold',
        goldExpedition,
        ownCastle.castleId
      )
    : undefined;
  const inspectorFoodLegacyExpeditionId = legacyExpeditionReturnAvailable
    && inspectorFoodOccupant
    ? realmResourceOccupantRecallLegacyExpeditionId(
        inspectorFoodOccupant,
        'food',
        foodExpedition,
        ownCastle.castleId
      )
    : undefined;
  const inspectorWoodLegacyExpeditionId = legacyExpeditionReturnAvailable
    && inspectorWoodOccupant
    ? realmResourceOccupantRecallLegacyExpeditionId(
        inspectorWoodOccupant,
        'wood',
        woodExpedition,
        ownCastle.castleId
      )
    : undefined;
  const inspectorStoneLegacyExpeditionId = legacyExpeditionReturnAvailable
    && inspectorStoneOccupant
    ? realmResourceOccupantRecallLegacyExpeditionId(
        inspectorStoneOccupant,
        'stone',
        stoneExpedition,
        ownCastle.castleId
      )
    : undefined;
  const inspectorWater = selectedInspectorTarget !== null
    && 'cellKey' in selectedInspectorTarget
    ? waterRecordsByKey.get(selectedInspectorTarget.cellKey)
    : undefined;
  const inspectorWaterNavigation = useMemo(
    () => inspectorWater
      ? realmWaterInspectionNavigation(waterNavigationGraph, inspectorWater)
      : undefined,
    [inspectorWater, waterNavigationGraph]
  );
  const inspectorWorker = selectedInspectorTarget !== null
    && 'workerId' in selectedInspectorTarget
    ? publicWorkerProjection?.workers.find((worker) => (
      worker.workerId === selectedInspectorTarget.workerId
      && worker.ordinal === selectedInspectorTarget.workerOrdinal
      && worker.originCastleId === selectedInspectorTarget.originCastleId
    ))
    : undefined;
  const inspectorWorkerResourceTargetLabel = (() => {
    if (!inspectorWorker?.resourceKind) return undefined;
    const node = inspectorWorker.siteId
      ? ({
          gold: goldNodesBySiteId,
          food: foodNodesBySiteId,
          wood: woodNodesBySiteId,
          stone: stoneNodesBySiteId
        } as const)[inspectorWorker.resourceKind].get(inspectorWorker.siteId)
      : undefined;
    return node
      ? `${RESOURCE_KIND_LABELS[inspectorWorker.resourceKind]} · Tier ${node.tier}`
      : RESOURCE_KIND_LABELS[inspectorWorker.resourceKind];
  })();
  const selectedWorkerRouteId = inspectorWorker?.workerId ?? [
    inspectorGoldOccupant,
    inspectorFoodOccupant,
    inspectorWoodOccupant,
    inspectorStoneOccupant
  ].find((marker) => marker?.source === 'generic-worker')?.workerId;
  const selectedWorkerRouteIdRef = useRef<string | undefined>(
    selectedWorkerRouteId
  );
  selectedWorkerRouteIdRef.current = selectedWorkerRouteId;
  const selectedResourceOccupant = [
    inspectorGoldOccupant,
    inspectorFoodOccupant,
    inspectorWoodOccupant,
    inspectorStoneOccupant
  ].find((marker): marker is RealmResourceOccupantMarker => marker !== undefined);
  const selectedResourceOccupantKey = selectedResourceOccupant
    ? realmResourceOccupantMarkerKey(selectedResourceOccupant)
    : undefined;
  const selectedResourceOccupantKeyRef = useRef<string | undefined>(
    selectedResourceOccupantKey
  );
  selectedResourceOccupantKeyRef.current = selectedResourceOccupantKey;
  const hoveredWorkerPresenceIdRef = useRef<string | null>(null);
  const hoveredResourceOccupantKeyRef = useRef<string | null>(null);
  const goldNodeAtSelectedCell = goldNodes.find((node) => sameCoord(node.coord, selectedCoord));
  const foodNodeAtSelectedCell = foodNodes.find((node) => sameCoord(node.coord, selectedCoord));
  const woodNodeAtSelectedCell = woodNodes.find((node) => sameCoord(node.coord, selectedCoord));
  const stoneNodeAtSelectedCell = stoneNodes.find((node) => sameCoord(node.coord, selectedCoord));
  const waterAtSelectedCell = waterRecordsByKey.get(hexKey(selectedCoord));
  const ownProfile = profileRecords.get(ownCastle.castleId)?.profile;
  const focusedCastleId = interaction.cameraTarget.kind === 'castle'
    || interaction.cameraTarget.kind === 'castle-location'
    ? interaction.cameraTarget.castleId
    : undefined;
  const [visibleResourceOccupantPresenceKeys, setVisibleResourceOccupantPresenceKeys] =
    useState<readonly string[]>([]);
  const [visibleResourceOccupantKeys, setVisibleResourceOccupantKeys] =
    useState<readonly string[]>([]);
  const visibleResourceOccupantPresenceSignatureRef = useRef('');
  const visibleResourceOccupantSignatureRef = useRef('');
  const [visibleWorkerPresenceIds, setVisibleWorkerPresenceIds] =
    useState<readonly string[]>([]);
  const visibleWorkerPresenceSignatureRef = useRef('');
  const workerPresenceElementsRef = useRef(
    new Map<string, HTMLElement>()
  );
  const resourceOccupantElementsRef = useRef<readonly HTMLElement[]>([]);

  useEffect(() => {
    const route = surfaceNavigation.current;
    const previousStack = previousSurfaceStackRef.current;
    const previousFullscreenDestinations =
      previousFullscreenDestinationsRef.current;
    previousSurfaceStackRef.current = surfaceNavigation.stack;
    previousFullscreenDestinationsRef.current = fullscreenDestinations;
    const closingHistoryWorldRoute = route === undefined
      && isRealmWorldSurfaceRoute(previousStack.at(-1));
    const returningFromDirectWorldRoute = closingHistoryWorldRoute
      && previousStack.length === 1;
    const closingHostedStackAfterModeChange = !fullscreenDestinations
      && route === undefined
      && previousStack.length > 0
      && previousFullscreenDestinations;
    if (
      !fullscreenDestinations
      && route === undefined
      && !closingHostedStackAfterModeChange
      && !closingHistoryWorldRoute
    ) return;
    const current = interactionRef.current;
    const closeWorldRecords = () => {
      let restoredFocus = false;
      if (current.inspectorOpen) {
        dispatchInteraction({
          type: returningFromDirectWorldRoute
            ? 'close-inspector'
            : 'sync-close-inspector'
        });
        restoredFocus = returningFromDirectWorldRoute;
      }
      if (current.navigatorOpen) {
        dispatchInteraction({
          type: returningFromDirectWorldRoute
            ? 'close-navigator'
            : 'sync-close-navigator'
        });
        restoredFocus = returningFromDirectWorldRoute;
      }
      if (
        returningFromDirectWorldRoute
        && !restoredFocus
        && previousStack[0]?.kind === 'terrain'
      ) {
        // Terrain has no secondary interaction-state panel to close. A direct
        // hosted terrain route still unmounts a focused fullscreen heading, so
        // explicitly return keyboard ownership to the map.
        dispatchInteraction({ type: 'request-map-focus' });
      }
      if (route === undefined && pendingNavigatorTargetRef.current !== null) {
        dispatchInteraction({ type: 'request-map-focus' });
      }
    };

    if (
      route === undefined
      || route.kind === 'commands'
      || route.kind === 'settings'
      || route.kind === 'workers'
      || route.kind === 'resource-balance'
    ) {
      closeWorldRecords();
      return;
    }
    if (route.kind === 'explore') {
      if (!current.navigatorOpen) {
        dispatchInteraction({ type: 'open-navigator' });
      }
      return;
    }
    if (route.kind === 'keep') {
      const castle = allCastles.find(
        (candidate) => candidate.castleId === route.castleId
      );
      if (!castle) {
        backSurface();
        return;
      }
      const target = current.inspectorTarget;
      if (
        current.inspectorOpen
        && target !== null
        && 'castleId' in target
        && target.castleId === castle.castleId
      ) return;
      selectedCoordRef.current = { q: castle.q, r: castle.r };
      dispatchInteraction({
        type: 'activate-castle',
        castleId: castle.castleId,
        coord: { q: castle.q, r: castle.r }
      });
      return;
    }
    if (route.kind === 'resource-site') {
      const target = current.inspectorTarget;
      const alreadyOpen = current.inspectorOpen && target !== null && (
        route.resource === 'gold'
          ? 'siteId' in target && target.siteId === route.siteId
          : route.resource === 'food'
            ? 'foodSiteId' in target && target.foodSiteId === route.siteId
            : route.resource === 'wood'
              ? 'woodSiteId' in target && target.woodSiteId === route.siteId
              : 'stoneSiteId' in target && target.stoneSiteId === route.siteId
      );
      if (alreadyOpen) return;
      const node = route.resource === 'gold'
        ? goldNodesBySiteId.get(route.siteId)
        : route.resource === 'food'
          ? foodNodesBySiteId.get(route.siteId)
          : route.resource === 'wood'
            ? woodNodesBySiteId.get(route.siteId)
            : stoneNodesBySiteId.get(route.siteId);
      if (!node) {
        backSurface();
        return;
      }
      selectedCoordRef.current = { ...node.coord };
      dispatchInteraction({
        type: route.resource === 'gold'
          ? 'activate-gold-site'
          : route.resource === 'food'
            ? 'activate-food-site'
            : route.resource === 'wood'
              ? 'activate-wood-site'
              : 'activate-stone-site',
        siteId: node.siteId,
        coord: node.coord
      });
      return;
    }
    if (route.kind === 'water') {
      const record = waterRecordsByKey.get(route.cellKey);
      if (!record) {
        backSurface();
        return;
      }
      const target = current.inspectorTarget;
      if (
        current.inspectorOpen
        && target !== null
        && 'cellKey' in target
        && target.cellKey === record.cellKey
      ) return;
      selectedCoordRef.current = { ...record.coord };
      dispatchInteraction({
        type: 'activate-water-cell',
        cellKey: record.cellKey,
        bodyId: record.bodyId,
        regime: record.regime,
        coord: record.coord
      });
      return;
    }
    if (route.kind === 'worker') {
      const commandCenterWorkerRoute =
        surfaceNavigation.stack.at(-2)?.kind === 'workers';
      if (
        !fullscreenDestinations
        && commandCenterWorkerRoute
      ) {
        closeWorldRecords();
        return;
      }
      const worker = publicWorkerProjection?.workers.find(
        (candidate) => candidate.workerId === route.workerId
      );
      if (!worker) {
        backSurface();
        return;
      }
      if (!commandCenterWorkerRoute) {
        const canonicalRoute = resolveRealmWorkerInspectionRoute(
          resourceOccupantMarkers,
          worker
        );
        if (canonicalRoute.kind === 'resource-site') {
          replaceSurface({
            kind: 'resource-site',
            resource: canonicalRoute.marker.resource,
            siteId: canonicalRoute.marker.siteId
          });
          return;
        }
        if (canonicalRoute.kind === 'unavailable') {
          backSurface();
          return;
        }
      }
      const target = current.inspectorTarget;
      if (
        current.inspectorOpen
        && target !== null
        && 'workerId' in target
        && target.workerId === worker.workerId
      ) return;
      const sceneRecord = workerSceneRecords.find(
        (candidate) => candidate.workerId === worker.workerId
      );
      const originCastle = allCastles.find(
        (candidate) => candidate.castleId === worker.originCastleId
      );
      const coord = sceneRef.current?.getWorkerCurrentCoord?.(worker.workerId)
        ?? sceneRecord?.destinationCoord
        ?? sceneRecord?.originCoord
        ?? (originCastle ? { q: originCastle.q, r: originCastle.r } : undefined);
      if (!coord) {
        backSurface();
        return;
      }
      selectedCoordRef.current = { ...coord };
      dispatchInteraction({
        type: 'activate-worker',
        workerId: worker.workerId,
        workerOrdinal: worker.ordinal,
        originCastleId: worker.originCastleId,
        coord
      });
      return;
    }

    const cell = terrainCellsByKey.get(route.tileKey);
    if (!cell) {
      backSurface();
      return;
    }
    if (current.inspectorOpen) {
      dispatchInteraction({ type: 'sync-close-inspector' });
    }
    if (current.navigatorOpen) {
      dispatchInteraction({ type: 'sync-close-navigator' });
    }
    if (!sameCoord(current.selectedCell, cell.coord)) {
      selectedCoordRef.current = { ...cell.coord };
      dispatchInteraction({ type: 'select-cell', coord: cell.coord });
    }
  }, [
    allCastles,
    backSurface,
    foodNodesBySiteId,
    fullscreenDestinations,
    goldNodesBySiteId,
    publicWorkerProjection,
    replaceSurface,
    resourceOccupantMarkers,
    stoneNodesBySiteId,
    surfaceNavigation.current,
    surfaceNavigation.stack,
    terrainCellsByKey,
    waterRecordsByKey,
    woodNodesBySiteId,
    workerSceneRecords
  ]);

  const openNavigator = useCallback(() => {
    setNavigatorOpenGeneration((generation) => generation + 1);
    dispatchInteraction({ type: 'open-navigator' });
    pushWorldSurface({ kind: 'explore' });
  }, [pushWorldSurface]);

  const refreshWorkerPresenceElements = useCallback(() => {
    const root = rootRef.current;
    workerPresenceElementsRef.current = new Map(
      [...(root?.querySelectorAll<HTMLElement>('[data-worker-presence-id]') ?? [])]
        .map((element) => [
          element.dataset.workerPresenceId ?? '',
          element
        ] as const)
        .filter(([workerId]) => workerId.length > 0)
    );
  }, []);

  const refreshResourceOccupantElements = useCallback(() => {
    resourceOccupantElementsRef.current = Object.freeze([
      ...(rootRef.current
        ?.querySelectorAll<HTMLElement>('[data-resource-occupant-key]')
        ?? [])
    ]);
  }, []);

  const applyWorldPortraitProjection = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const layout = resolveRealmWorldPortraitLayout({
      cameraMode: cameraModeRef.current,
      workers: workerSceneRecordsRef.current,
      resourceOccupants: resourceOccupantMarkersRef.current,
      workerFrame: latestWorkerProjectionRef.current,
      resourceFrame: latestResourceProjectionRef.current,
      reservedRects: [
        ...reservedUiRectsRef.current,
        ...reservedCastleLabelRectsRef.current
      ],
      selectedWorkerId: selectedWorkerRouteIdRef.current,
      hoveredWorkerId: hoveredWorkerPresenceIdRef.current,
      selectedResourceKey: selectedResourceOccupantKeyRef.current,
      hoveredResourceKey: hoveredResourceOccupantKeyRef.current
    });
    const acceptedWorkerIds = layout.visibleWorkerIds;
    const acceptedResourceKeys = layout.visibleResourceControlKeys;
    const passiveResourceKeys = layout.visibleResourcePresenceKeys;
    const projectedWorkers = new Map(
      layout.workerProjections.map((projection) => [
        projection.workerId,
        projection
      ] as const)
    );
    const projectedResources = layout.resourceProjectionByKey;
    const acceptedWorkerIdSet = new Set(acceptedWorkerIds);
    const acceptedResourceKeySet = new Set(acceptedResourceKeys);
    const passiveResourceKeySet = new Set(passiveResourceKeys);
    const visibleResourceKeySet = new Set([
      ...acceptedResourceKeys,
      ...passiveResourceKeys
    ]);

    const hoveredWorkerId = hoveredWorkerPresenceIdRef.current;
    if (
      hoveredWorkerId !== null
      && !acceptedWorkerIdSet.has(hoveredWorkerId)
    ) {
      hoveredWorkerPresenceIdRef.current = null;
      sceneRef.current?.setHoveredWorkerId?.(null);
    }
    const hoveredResourceKey = hoveredResourceOccupantKeyRef.current;
    if (
      hoveredResourceKey !== null
      && !visibleResourceKeySet.has(hoveredResourceKey)
    ) {
      hoveredResourceOccupantKeyRef.current = null;
      sceneRef.current?.setHovered(null);
    }

    root.dataset.realmWorkerPresenceUiSuppressedCount = String(
      layout.suppressedWorkerCount
    );
    root.dataset.realmResourcePresenceUiSuppressedCount = String(
      layout.suppressedResourceCount
    );
    const workerSignature = acceptedWorkerIds.join('|');
    if (workerSignature !== visibleWorkerPresenceSignatureRef.current) {
      visibleWorkerPresenceSignatureRef.current = workerSignature;
      setVisibleWorkerPresenceIds(Object.freeze(acceptedWorkerIds));
    }
    const resourceSignature = acceptedResourceKeys.join('|');
    if (resourceSignature !== visibleResourceOccupantSignatureRef.current) {
      visibleResourceOccupantSignatureRef.current = resourceSignature;
      setVisibleResourceOccupantKeys(Object.freeze(acceptedResourceKeys));
    }
    const passiveSignature = passiveResourceKeys.join('|');
    if (
      passiveSignature
      !== visibleResourceOccupantPresenceSignatureRef.current
    ) {
      visibleResourceOccupantPresenceSignatureRef.current = passiveSignature;
      setVisibleResourceOccupantPresenceKeys(Object.freeze(passiveResourceKeys));
    }
    for (const [workerId, element] of workerPresenceElementsRef.current) {
      const marker = projectedWorkers.get(workerId);
      if (!marker || !acceptedWorkerIdSet.has(workerId)) {
        element.dataset.projectedVisible = 'false';
        continue;
      }
      element.style.setProperty('--realm-worker-presence-x', `${marker.x}px`);
      element.style.setProperty('--realm-worker-presence-y', `${marker.y}px`);
      element.dataset.projectedVisible = 'true';
    }
    for (const element of resourceOccupantElementsRef.current) {
      const key = element.dataset.resourceOccupantKey ?? '';
      const marker = projectedResources.get(key);
      const laneVisible = element.dataset.resourceOccupantLane === 'presence'
        ? passiveResourceKeySet.has(key)
        : acceptedResourceKeySet.has(key);
      if (!marker || !laneVisible) {
        element.dataset.projectedVisible = 'false';
        continue;
      }
      element.style.setProperty('--realm-resource-marker-x', `${marker.x}px`);
      element.style.setProperty('--realm-resource-marker-y', `${marker.y}px`);
      element.dataset.projectedVisible = 'true';
    }
  }, []);

  useEffect(() => {
    applyWorldPortraitProjection();
  }, [applyWorldPortraitProjection, cameraMode]);

  const applyLocalQaWorkerProjectionTelemetry = useCallback((
    frame: RealmWorkerProjectionFrame
  ) => {
    applyDevWorkerProjectionTelemetry?.(
      rootRef.current,
      workerProjectionTelemetryEnabledRef.current,
      frame
    );
  }, []);

  useEffect(() => {
    applyLocalQaWorkerProjectionTelemetry(latestWorkerProjectionRef.current);
  }, [
    applyLocalQaWorkerProjectionTelemetry,
    workerProjectionTelemetryEnabled
  ]);

  const updateWorkerProjection = useCallback((frame: RealmWorkerProjectionFrame) => {
    latestWorkerProjectionRef.current = frame;
    applyLocalQaWorkerProjectionTelemetry(frame);
    applyWorldPortraitProjection();
  }, [
    applyLocalQaWorkerProjectionTelemetry,
    applyWorldPortraitProjection
  ]);

  const applyLatestWorkerProjection = useCallback(() => {
    refreshWorkerPresenceElements();
    applyWorldPortraitProjection();
  }, [applyWorldPortraitProjection, refreshWorkerPresenceElements]);

  const updateResourceProjection = useCallback((frame: RealmResourceProjectionFrame) => {
    latestResourceProjectionRef.current = frame;
    applyWorldPortraitProjection();
  }, [applyWorldPortraitProjection]);

  const applyLatestResourceProjection = useCallback(() => {
    refreshResourceOccupantElements();
    applyWorldPortraitProjection();
  }, [applyWorldPortraitProjection, refreshResourceOccupantElements]);

  const hoverWorkerPresence = useCallback((workerId: string | null) => {
    hoveredWorkerPresenceIdRef.current = workerId;
    if (workerId !== null) hoveredResourceOccupantKeyRef.current = null;
    sceneRef.current?.setHoveredWorkerId?.(workerId);
    applyWorldPortraitProjection();
  }, [applyWorldPortraitProjection]);

  const hoverResourceOccupant = useCallback((key: string | null) => {
    hoveredResourceOccupantKeyRef.current = key;
    if (key !== null) hoveredWorkerPresenceIdRef.current = null;
    const marker = key === null
      ? undefined
      : resourceOccupantMarkersRef.current.find((candidate) => (
          realmResourceOccupantMarkerKey(candidate) === key
        ));
    sceneRef.current?.setHovered(marker?.nodeCoord ?? null);
    applyWorldPortraitProjection();
  }, [applyWorldPortraitProjection]);

  useLayoutEffect(() => {
    applyWorldPortraitProjection();
  }, [
    applyWorldPortraitProjection,
    selectedResourceOccupantKey,
    selectedWorkerRouteId
  ]);

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
    } else if (target.kind === 'worker-inspector') {
      workerInspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'gold-mine-inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'food-farm-inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'logging-camp-inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'stone-quarry-inspector') {
      inspectorFocusRef.current?.focus({ preventScroll: true });
    } else if (target.kind === 'water-inspector') {
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

  const consumeSelectionScreenX = useCallback(() => {
    const screenX = pendingSelectionScreenXRef.current;
    pendingSelectionScreenXRef.current = undefined;
    return screenX;
  }, []);

  const emitWorldSelectionSfx = useCallback((
    selectionKey: string,
    event: WarpkeepSfxEvent & Readonly<{ screenX?: number }>
  ) => {
    const screenX = consumeSelectionScreenX();
    if (lastSfxSelectionKeyRef.current === selectionKey) return;
    lastSfxSelectionKeyRef.current = selectionKey;
    emitWarpkeepSfx(Object.freeze({
      ...event,
      ...(screenX === undefined ? {} : { screenX })
    }));
  }, [consumeSelectionScreenX]);

  const selectCoord = useCallback((coord: HexCoord) => {
    consumeSelectionScreenX();
    if (
      !isPlayableRealmCoord(surfaceRef.current, coord)
      || tileMetadataByKeyRef.current.get(hexKey(coord))?.passable === false
    ) return;
    updateHoveredCastleId(undefined);
    selectedCoordRef.current = coord;
    dispatchInteraction({ type: 'select-cell', coord });
  }, [consumeSelectionScreenX, updateHoveredCastleId]);

  const selectCastle = useCallback((castle: RealmCastleProjection) => {
    emitWorldSelectionSfx(
      `keep:${castle.castleId}`,
      { kind: 'select-keep' }
    );
    selectedCoordRef.current = { q: castle.q, r: castle.r };
    dispatchInteraction({
      type: 'activate-castle',
      castleId: castle.castleId,
      coord: { q: castle.q, r: castle.r }
    });
    pushWorldSurface({ kind: 'keep', castleId: castle.castleId });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const focusResourceOccupantCastle = useCallback((marker: RealmResourceOccupantMarker) => {
    const castle = allCastlesRef.current.find(
      (candidate) => candidate.castleId === marker.castle.castleId
    );
    if (!castle) return;
    dispatchInteraction({
      type: 'set-camera-target',
      target: {
        kind: 'castle-location',
        castleId: castle.castleId,
        coord: { q: castle.q, r: castle.r }
      }
    });
    sceneRef.current?.locateCastle(castle.castleId);
  }, []);

  const selectGoldNode = useCallback((node: RealmGoldNodePresentation) => {
    emitWorldSelectionSfx(`gold:${node.siteId}`, { kind: 'select-gold' });
    selectedCoordRef.current = { ...node.coord };
    dispatchInteraction({
      type: 'activate-gold-site',
      siteId: node.siteId,
      coord: node.coord
    });
    pushWorldSurface({ kind: 'resource-site', resource: 'gold', siteId: node.siteId });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const selectFoodNode = useCallback((node: RealmFoodNodePresentation) => {
    emitWorldSelectionSfx(`food:${node.siteId}`, { kind: 'select-food' });
    selectedCoordRef.current = { ...node.coord };
    dispatchInteraction({
      type: 'activate-food-site',
      siteId: node.siteId,
      coord: node.coord
    });
    pushWorldSurface({ kind: 'resource-site', resource: 'food', siteId: node.siteId });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const selectWoodNode = useCallback((node: RealmWoodNodePresentation) => {
    emitWorldSelectionSfx(`wood:${node.siteId}`, { kind: 'select-wood' });
    selectedCoordRef.current = { ...node.coord };
    dispatchInteraction({
      type: 'activate-wood-site',
      siteId: node.siteId,
      coord: node.coord
    });
    pushWorldSurface({ kind: 'resource-site', resource: 'wood', siteId: node.siteId });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const selectStoneNode = useCallback((node: RealmStoneNodePresentation) => {
    emitWorldSelectionSfx(`stone:${node.siteId}`, { kind: 'select-stone' });
    selectedCoordRef.current = { ...node.coord };
    dispatchInteraction({
      type: 'activate-stone-site',
      siteId: node.siteId,
      coord: node.coord
    });
    pushWorldSurface({ kind: 'resource-site', resource: 'stone', siteId: node.siteId });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const openNavigatorResourceSite = useCallback((
    entry: RealmNavigatorResourceSite
  ) => {
    const siteId = entry.key.slice(entry.resource.length + 1);
    if (entry.resource === 'food') {
      const node = foodNodesBySiteId.get(siteId);
      if (node) selectFoodNode(node);
      return;
    }
    if (entry.resource === 'wood') {
      const node = woodNodesBySiteId.get(siteId);
      if (node) selectWoodNode(node);
      return;
    }
    if (entry.resource === 'stone') {
      const node = stoneNodesBySiteId.get(siteId);
      if (node) selectStoneNode(node);
      return;
    }
    const node = goldNodesBySiteId.get(siteId);
    if (node) selectGoldNode(node);
  }, [
    foodNodesBySiteId,
    goldNodesBySiteId,
    selectFoodNode,
    selectGoldNode,
    selectStoneNode,
    selectWoodNode,
    stoneNodesBySiteId,
    woodNodesBySiteId
  ]);

  const selectResourceOccupant = useCallback((marker: RealmResourceOccupantMarker) => {
    emitWorldSelectionSfx(
      `${marker.resource}:${marker.siteId}`,
      { kind: RESOURCE_SELECTION_SFX_KINDS[marker.resource] }
    );
    selectedCoordRef.current = { ...marker.nodeCoord };
    if (marker.resource === 'gold') {
      dispatchInteraction({
        type: 'activate-gold-site',
        siteId: marker.siteId,
        coord: marker.nodeCoord
      });
      pushWorldSurface({ kind: 'resource-site', resource: 'gold', siteId: marker.siteId });
      return;
    }
    if (marker.resource === 'food') {
      dispatchInteraction({
        type: 'activate-food-site',
        siteId: marker.siteId,
        coord: marker.nodeCoord
      });
      pushWorldSurface({ kind: 'resource-site', resource: 'food', siteId: marker.siteId });
      return;
    }
    if (marker.resource === 'wood') {
      dispatchInteraction({
        type: 'activate-wood-site',
        siteId: marker.siteId,
        coord: marker.nodeCoord
      });
      pushWorldSurface({ kind: 'resource-site', resource: 'wood', siteId: marker.siteId });
      return;
    }
    dispatchInteraction({
      type: 'activate-stone-site',
      siteId: marker.siteId,
      coord: marker.nodeCoord
    });
    pushWorldSurface({ kind: 'resource-site', resource: 'stone', siteId: marker.siteId });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const selectWaterCell = useCallback((record: RealmWaterInspectionRecord) => {
    emitWorldSelectionSfx(
      `water:${record.cellKey}`,
      { kind: 'select-water', regime: record.regime }
    );
    selectedCoordRef.current = { ...record.coord };
    dispatchInteraction({
      type: 'activate-water-cell',
      cellKey: record.cellKey,
      bodyId: record.bodyId,
      regime: record.regime,
      coord: record.coord
    });
    pushWorldSurface({ kind: 'water', cellKey: record.cellKey });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const selectWaterRecordByKey = useCallback((cellKey: string) => {
    const record = waterRecordsByKeyRef.current.get(cellKey);
    if (!record) return;
    emitWorldSelectionSfx(
      `water:${record.cellKey}`,
      { kind: 'select-water', regime: record.regime }
    );
    selectedCoordRef.current = { ...record.coord };
    dispatchInteraction({
      type: 'activate-water-cell',
      cellKey: record.cellKey,
      bodyId: record.bodyId,
      regime: record.regime,
      coord: record.coord
    });
    if (historyBackedWorldRoute) {
      replaceSurface({ kind: 'water', cellKey: record.cellKey });
    }
  }, [emitWorldSelectionSfx, historyBackedWorldRoute, replaceSurface]);

  const focusWaterRecordByKey = useCallback((cellKey: string) => {
    const record = waterRecordsByKeyRef.current.get(cellKey);
    if (!record) return;
    sceneRef.current?.locateCell(record.coord);
    dispatchInteraction({
      type: 'set-camera-target',
      target: { kind: 'cell-location', coord: record.coord }
    });
  }, []);

  const selectWorker = useCallback((worker: RealmWorkerPublicPresentation, coord: HexCoord) => {
    emitWorldSelectionSfx(
      `worker:${worker.workerId}`,
      { kind: 'select-worker' }
    );
    selectedCoordRef.current = { ...coord };
    dispatchInteraction({
      type: 'activate-worker',
      workerId: worker.workerId,
      workerOrdinal: worker.ordinal,
      originCastleId: worker.originCastleId,
      coord
    });
    pushWorldSurface({ kind: 'worker', workerId: worker.workerId });
  }, [emitWorldSelectionSfx, pushWorldSurface]);

  const selectWorkerOrOccupiedSite = useCallback((
    worker: RealmWorkerPublicPresentation,
    resolveCoord: () => HexCoord | null | undefined
  ) => {
    const route = resolveRealmWorkerInspectionRoute(
      resourceOccupantMarkersRef.current,
      worker
    );
    if (route.kind === 'resource-site') {
      selectResourceOccupant(route.marker);
      return;
    }
    // Active workers without an exact canonical occupation join must not open
    // a contradictory standalone record. Resolve (and potentially locate) a
    // worker coordinate only for idle/returning standalone records.
    if (route.kind !== 'worker') return;
    const coord = resolveCoord();
    if (coord) selectWorker(worker, coord);
  }, [selectResourceOccupant, selectWorker]);

  const selectWorkerAtCurrentPosition = useCallback((
    worker: RealmWorkerPublicPresentation
  ) => {
    selectWorkerOrOccupiedSite(
      worker,
      () => sceneRef.current?.getWorkerCurrentCoord?.(worker.workerId)
    );
  }, [selectWorkerOrOccupiedSite]);

  const locateWorkerAtCurrentPosition = useCallback((workerId: string) => {
    const worker = publicWorkerProjectionRef.current?.workers.find(
      (candidate) => candidate.workerId === workerId
    );
    if (!worker) return;
    if (worker.status === 'idle') {
      sceneRef.current?.locateCastle(worker.originCastleId);
      return;
    }
    sceneRef.current?.locateWorker?.(worker.workerId);
  }, []);

  const locateWorkerKeeper = useCallback((castleId: number) => {
    if (!allCastles.some((castle) => castle.castleId === castleId)) return;
    sceneRef.current?.locateCastle(castleId);
  }, [allCastles]);

  const activatePendingNavigatorTarget = useCallback((
    target: PendingNavigatorTarget
  ) => {
    const scene = sceneRef.current;
    if (target.kind === 'castle') {
      const castle = allCastlesRef.current.find(
        (candidate) => candidate.castleId === target.castleId
      );
      if (!castle) return;
      scene?.locateCastle(castle.castleId);
      dispatchInteraction({
        type: 'set-camera-target',
        target: {
          kind: 'castle-location',
          castleId: castle.castleId,
          coord: { q: castle.q, r: castle.r }
        }
      });
      selectCastle(castle);
      return;
    }
    if (target.kind === 'worker') {
      const worker = publicWorkerProjectionRef.current?.workers.find((candidate) => (
        candidate.workerId === target.workerId
        && candidate.ordinal === target.workerOrdinal
        && candidate.originCastleId === target.originCastleId
      ));
      if (!worker) return;
      if (worker.status === 'idle') {
        scene?.locateCastle(worker.originCastleId);
        dispatchInteraction({
          type: 'set-camera-target',
          target: {
            kind: 'castle-location',
            castleId: worker.originCastleId,
            coord: target.coord
          }
        });
        selectWorkerOrOccupiedSite(worker, () => target.coord);
        return;
      }
      const currentCoord = scene?.locateWorker(worker.workerId) ?? target.coord;
      dispatchInteraction({
        type: 'set-camera-target',
        target: { kind: 'cell-location', coord: currentCoord }
      });
      selectWorkerOrOccupiedSite(worker, () => currentCoord);
      return;
    }
    if (target.kind === 'resource-site') {
      scene?.locateCell(target.coord);
      dispatchInteraction({
        type: 'set-camera-target',
        target: { kind: 'cell-location', coord: target.coord }
      });
      if (target.resource === 'food') {
        const node = foodNodesBySiteId.get(target.siteId);
        if (node) selectFoodNode(node);
        return;
      }
      if (target.resource === 'wood') {
        const node = woodNodesBySiteId.get(target.siteId);
        if (node) selectWoodNode(node);
        return;
      }
      if (target.resource === 'stone') {
        const node = stoneNodesBySiteId.get(target.siteId);
        if (node) selectStoneNode(node);
        return;
      }
      const node = goldNodesBySiteId.get(target.siteId);
      if (node) selectGoldNode(node);
      return;
    }
    if (target.kind === 'water') {
      const record = waterRecordsByKeyRef.current.get(target.cellKey);
      if (!record) return;
      scene?.locateCell(record.coord);
      dispatchInteraction({
        type: 'set-camera-target',
        target: { kind: 'cell-location', coord: record.coord }
      });
      selectWaterCell(record);
      return;
    }
    scene?.locateCell(target.coord);
    dispatchInteraction({
      type: 'set-camera-target',
      target: { kind: 'cell-location', coord: target.coord }
    });
    selectCoord(target.coord);
    dispatchInteraction({ type: 'request-map-focus' });
  }, [
    foodNodesBySiteId,
    goldNodesBySiteId,
    selectCastle,
    selectCoord,
    selectFoodNode,
    selectGoldNode,
    selectStoneNode,
    selectWaterCell,
    selectWoodNode,
    selectWorkerOrOccupiedSite,
    stoneNodesBySiteId,
    woodNodesBySiteId
  ]);
  activatePendingNavigatorTargetRef.current = activatePendingNavigatorTarget;

  const openActiveWagon = useCallback((wagon: RealmActiveWagonMenuItem) => {
    if (!activeWagons.some((candidate) => (
      candidate.resource === wagon.resource && candidate.siteId === wagon.siteId
    ))) return;
    if (wagon.resource === 'food') {
      const node = foodNodesBySiteId.get(wagon.siteId);
      if (node) selectFoodNode(node);
      return;
    }
    if (wagon.resource === 'wood') {
      const node = woodNodesBySiteId.get(wagon.siteId);
      if (node) selectWoodNode(node);
      return;
    }
    if (wagon.resource === 'stone') {
      const node = stoneNodesBySiteId.get(wagon.siteId);
      if (node) selectStoneNode(node);
      return;
    }
    const node = goldNodesBySiteId.get(wagon.siteId);
    if (node) selectGoldNode(node);
  }, [
    activeWagons,
    foodNodesBySiteId,
    goldNodesBySiteId,
    selectFoodNode,
    selectGoldNode,
    selectStoneNode,
    selectWoodNode,
    stoneNodesBySiteId,
    woodNodesBySiteId
  ]);

  const clearRendererDeadline = useCallback((expected?: Readonly<{
    generation: number;
    kind: RendererDeadlineKind;
  }>) => {
    const deadline = rendererDeadlineRef.current;
    if (!deadline) return false;
    if (
      expected
      && (
        deadline.generation !== expected.generation
        || deadline.kind !== expected.kind
      )
    ) return false;
    window.clearTimeout(deadline.timer);
    document.removeEventListener('visibilitychange', deadline.handleVisibilityChange);
    window.removeEventListener('pageshow', deadline.handleVisibilityChange);
    rendererDeadlineRef.current = null;
    return true;
  }, []);

  const clearRendererStabilityTimer = useCallback(() => {
    const stability = rendererStabilityTimerRef.current;
    if (stability === null) return;
    window.clearTimeout(stability.timer);
    document.removeEventListener(
      'visibilitychange',
      stability.handleVisibilityChange
    );
    window.removeEventListener('pageshow', stability.handleVisibilityChange);
    rendererStabilityTimerRef.current = null;
  }, []);

  const captureRendererContextTelemetry = useCallback((
    generation: number,
    telemetry: DOMStringMap | undefined
  ) => {
    if (!Number.isSafeInteger(generation) || generation <= 0 || !telemetry) return;
    const current = Object.freeze({
      losses: rendererTelemetryCount(telemetry.realmRendererContextLossCount),
      restores: rendererTelemetryCount(telemetry.realmRendererContextRestoreCount)
    });
    const previous = rendererContextTelemetryByGenerationRef.current.get(generation)
      ?? { losses: 0, restores: 0 };
    rendererContextLossCountRef.current += Math.max(0, current.losses - previous.losses);
    rendererContextRestoreCountRef.current += Math.max(
      0,
      current.restores - previous.restores
    );
    rendererContextTelemetryByGenerationRef.current.set(generation, current);

    // Long-running QA sessions can create many explicit retry generations.
    // Keep only a bounded amount of non-sensitive counter state; callbacks
    // from older retired generations are rejected before reaching this path.
    if (rendererContextTelemetryByGenerationRef.current.size > 24) {
      const oldestGeneration = rendererContextTelemetryByGenerationRef.current
        .keys().next().value;
      if (typeof oldestGeneration === 'number') {
        rendererContextTelemetryByGenerationRef.current.delete(oldestGeneration);
      }
    }
  }, []);

  const armRendererStabilityTimer = useCallback((generation: number) => {
    clearRendererStabilityTimer();
    if (rendererLifecycleRef.current.attempt === 0) return;
    const stability = {
      generation,
      remainingMilliseconds: REALM_RENDERER_STABILITY_WINDOW_MS,
      visibleStartedAt: Date.now(),
      timer: 0,
      handleVisibilityChange: () => undefined
    };
    const publishStable = () => {
      if (rendererStabilityTimerRef.current !== stability) return;
      document.removeEventListener(
        'visibilitychange',
        stability.handleVisibilityChange
      );
      window.removeEventListener('pageshow', stability.handleVisibilityChange);
      rendererStabilityTimerRef.current = null;
      const current = rendererLifecycleRef.current;
      if (
        current.state !== 'ready'
        || current.generation !== generation
        || activeRendererGenerationRef.current !== generation
      ) return;
      const stableLifecycle = transitionRealmRendererLifecycle(current, {
        type: 'stable',
        generation
      });
      rendererLifecycleRef.current = stableLifecycle;
      setRendererLifecycle(stableLifecycle);
    };
    const schedule = () => {
      if (rendererStabilityTimerRef.current !== stability) return;
      window.clearTimeout(stability.timer);
      if (document.hidden) return;
      stability.visibleStartedAt = Date.now();
      stability.timer = window.setTimeout(
        publishStable,
        stability.remainingMilliseconds
      );
    };
    stability.handleVisibilityChange = () => {
      if (rendererStabilityTimerRef.current !== stability) return;
      if (document.hidden) {
        window.clearTimeout(stability.timer);
        stability.remainingMilliseconds = Math.max(
          0,
          stability.remainingMilliseconds - (Date.now() - stability.visibleStartedAt)
        );
        return;
      }
      schedule();
    };
    rendererStabilityTimerRef.current = stability;
    document.addEventListener('visibilitychange', stability.handleVisibilityChange);
    window.addEventListener('pageshow', stability.handleVisibilityChange);
    schedule();
  }, [clearRendererStabilityTimer]);
  armRendererStabilityTimerRef.current = armRendererStabilityTimer;

  const retireRendererGeneration = useCallback((generation: number) => {
    if (!Number.isSafeInteger(generation) || generation <= 0) return false;
    const scenes = new Set<RealmSceneHandle>();
    const pending = pendingSceneConstructionRef.current;
    if (pending?.generation === generation) {
      scenes.add(pending.scene);
      pendingSceneConstructionRef.current = null;
    }
    if (activeRendererGenerationRef.current === generation) {
      if (sceneRef.current) scenes.add(sceneRef.current);
      sceneRef.current = null;
      activeRendererGenerationRef.current = 0;
    }
    for (const slot of [0, 1] as const) {
      const candidate = sceneSlotsRef.current[slot];
      if (candidate && scenes.has(candidate)) {
        sceneSlotsRef.current[slot] = null;
      }
    }
    for (const scene of scenes) {
      try {
        scene.setPresentationActive(false);
      } catch {
        // Ownership is cleared before cleanup so a stalled renderer cannot
        // publish late state even if its presentation hook is unhealthy.
      }
      try {
        scene.dispose();
      } catch {
        // The terminal lifecycle remains authoritative when driver cleanup
        // itself fails inside a marginal WebView.
      }
      sceneDisposalCountRef.current += 1;
    }
    if (scenes.size > 0) {
      nonblockingSceneReplacementRef.current = false;
      const currentRoot = rootRef.current;
      if (currentRoot) {
        currentRoot.dataset.realmSceneDisposalCount = String(
          sceneDisposalCountRef.current
        );
      }
    }
    rendererCanvasByGenerationRef.current.delete(generation);
    rendererContextTelemetryByGenerationRef.current.delete(generation);
    return scenes.size > 0;
  }, []);

  const rotateRendererCanvasSlot = useCallback(() => {
    const nextSlot: 0 | 1 = activeCanvasSlotRef.current === 0 ? 1 : 0;
    activeCanvasSlotRef.current = nextSlot;
    canvasRef.current = canvasSlotRefs.current[nextSlot];
    for (const slot of [0, 1] as const) {
      const slotCanvas = canvasSlotRefs.current[slot];
      if (slotCanvas) slotCanvas.dataset.realmCanvasActive = String(slot === nextSlot);
    }
    // Replace the destination DOM node before a new scene is constructed.
    // Merely alternating between two persistent canvases can return to a
    // context that the browser never restored; an epoch key guarantees that
    // every recovery destination is a genuinely fresh context owner.
    setCanvasSlotEpochs((current) => {
      const next: [number, number] = [current[0], current[1]];
      next[nextSlot] += 1;
      return next;
    });
    setActiveCanvasSlot(nextSlot);
    return nextSlot;
  }, []);

  const armRendererDeadline = useCallback((
    kind: RendererDeadlineKind,
    generation: number,
    durationMilliseconds: number,
    absoluteExpiresAt?: number,
    absoluteWallExpiresAt?: number
  ) => {
    const existing = rendererDeadlineRef.current;
    if (existing?.generation === generation && existing.kind === kind) {
      // Duplicate context-loss events must not extend the original deadline.
      return;
    }
    clearRendererDeadline();
    const token = nextRendererDeadlineTokenRef.current;
    nextRendererDeadlineTokenRef.current += 1;
    const startedAt = Date.now();
    const deadline = {
      generation,
      kind,
      expiresAt: absoluteExpiresAt ?? startedAt + durationMilliseconds,
      wallExpiresAt: absoluteWallExpiresAt
        ?? startedAt + REALM_RENDERER_RECOVERY_WALL_TIMEOUT_MS,
      durationMilliseconds,
      token,
      timer: 0,
      handleVisibilityChange: () => undefined
    };
    const expire = () => {
      const deadline = rendererDeadlineRef.current;
      if (
        !deadline
        || deadline.token !== token
        || deadline.generation !== generation
        || deadline.kind !== kind
      ) return;
      const now = Date.now();
      if (
        document.hidden
        && now < deadline.wallExpiresAt
      ) {
        // A backgrounded WebView cannot render a completion frame. Preserve a
        // full visible recovery budget while retaining an absolute wall guard
        // against an abandoned tab living forever.
        deadline.expiresAt = Math.min(
          deadline.wallExpiresAt,
          now + deadline.durationMilliseconds
        );
        deadline.timer = window.setTimeout(
          expire,
          Math.max(0, deadline.wallExpiresAt - now)
        );
        return;
      }
      window.clearTimeout(deadline.timer);
      document.removeEventListener('visibilitychange', deadline.handleVisibilityChange);
      window.removeEventListener('pageshow', deadline.handleVisibilityChange);
      rendererDeadlineRef.current = null;
      if (kind !== 'context-restore') {
        recoverySceneRebuildDeadlineKindRef.current = undefined;
        recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
        recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
      }
      const latest = rendererLifecycleRef.current;
      const stillWaiting = latest.generation === generation && (
        kind === 'context-restore'
          ? latest.state === 'recovering' && latest.failure?.code === 'context-lost'
          : latest.state === 'loading'
      );
      if (!stillWaiting) return;
      recoverySceneRebuildDeadlinePendingRef.current = false;
      const timeoutFailure: RealmRendererFailure = kind === 'context-restore'
        ? {
            code: 'context-restore-timeout',
            retryable: true,
            phase: latest.state,
            message: 'The browser did not restore the Realm graphics context in time.'
          }
        : {
            code: kind === 'scene-build'
              ? 'scene-build-timeout'
              : 'scene-rebuild-timeout',
            retryable: true,
            phase: latest.state,
            message: kind === 'scene-build'
              ? 'The Realm scene did not become ready in time.'
              : 'The restored graphics context could not rebuild the Realm in time.'
          };
      const healthyPredecessorGeneration = activeRendererGenerationRef.current;
      const nonblockingCandidateTimedOut = (
        kind === 'scene-rebuild'
        && nonblockingSceneReplacementRef.current
        && healthyPredecessorGeneration > 0
        && healthyPredecessorGeneration !== generation
        && sceneRef.current !== null
      );
      retireRendererGeneration(generation);
      if (nonblockingCandidateTimedOut) {
        nonblockingSceneReplacementRef.current = false;
        sceneReplacementFailureCountRef.current += 1;
        rendererModeRef.current = 'webgl';
        const retainedLifecycle: RealmRendererLifecycle = Object.freeze({
          ...latest,
          state: 'ready',
          generation: healthyPredecessorGeneration,
          failure: undefined,
          lastFailure: timeoutFailure,
          everReady: true
        });
        rendererLifecycleRef.current = retainedLifecycle;
        setRendererLifecycle(retainedLifecycle);
        armRendererStabilityTimerRef.current(healthyPredecessorGeneration);
        const currentRoot = rootRef.current;
        if (currentRoot) {
          currentRoot.dataset.realmSceneReplacementFailureCount = String(
            sceneReplacementFailureCountRef.current
          );
          currentRoot.dataset.realmSceneDisposalCount = String(
            sceneDisposalCountRef.current
          );
        }
        return;
      }
      rendererModeRef.current = 'loading';
      markRendererFailureRef.current(timeoutFailure, generation);
    };
    const schedule = (grantVisibleBudget: boolean) => {
      if (rendererDeadlineRef.current !== deadline) return;
      const now = Date.now();
      window.clearTimeout(deadline.timer);
      if (!document.hidden && grantVisibleBudget) {
        deadline.expiresAt = Math.min(
          deadline.wallExpiresAt,
          now + deadline.durationMilliseconds
        );
      }
      const dueAt = document.hidden
        ? deadline.wallExpiresAt
        : Math.min(deadline.expiresAt, deadline.wallExpiresAt);
      deadline.timer = window.setTimeout(expire, Math.max(0, dueAt - now));
    };
    deadline.handleVisibilityChange = () => {
      schedule(!document.hidden);
    };
    rendererDeadlineRef.current = deadline;
    document.addEventListener('visibilitychange', deadline.handleVisibilityChange);
    window.addEventListener('pageshow', deadline.handleVisibilityChange);
    schedule(false);
  }, [clearRendererDeadline, retireRendererGeneration]);

  const applyPendingEmergencyQuality = useCallback((generation: number) => {
    const pending = pendingEmergencyQualityRef.current;
    if (!pending || pending.generation !== generation) return false;
    pendingEmergencyQualityRef.current = undefined;
    const retainedQuality = retainRealmRendererEmergencyQuality(pending.quality);
    setEmergencyQualityCeiling((current) => resolveRealmRendererEmergencyQuality(
      current ?? 'high',
      retainedQuality
    ));
    return true;
  }, []);

  const markRendererFailure = useCallback((
    failureInput?: RealmRendererFailure | unknown,
    reportedGeneration?: number
  ) => {
    const current = rendererLifecycleRef.current;
    const generation = reportedGeneration
      ?? (activeRendererGenerationRef.current > 0
        ? activeRendererGenerationRef.current
        : current.generation);
    const failure = failureInput && typeof failureInput === 'object' && 'code' in failureInput
      ? failureInput as RealmRendererFailure
      : classifyRealmRendererFailure(failureInput, current.state);
    if (
      generation === current.generation
      || generation === activeRendererGenerationRef.current
    ) {
      clearRendererStabilityTimer();
      captureRendererContextTelemetry(
        generation,
        rendererCanvasByGenerationRef.current.get(generation)?.dataset
      );
    }
    const publishTerminalLifecycle = (
      terminalFailure: RealmRendererFailure,
      terminalGeneration: number
    ) => {
      clearRendererDeadline();
      recoverySceneRebuildDeadlineKindRef.current = undefined;
      recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
      recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
      recoverySceneRebuildDeadlinePendingRef.current = false;
      pendingEmergencyQualityRef.current = undefined;
      rendererModeRef.current = canUseStaticRealmFallback(terminalFailure)
        ? 'fallback'
        : 'loading';
      const terminalLifecycle = canUseStaticRealmFallback(terminalFailure)
        ? transitionRealmRendererLifecycle(current, {
            type: 'static-fallback',
            failure: terminalFailure,
            generation: terminalGeneration
          })
        : transitionRealmRendererLifecycle(current, {
            type: 'failed',
            failure: terminalFailure,
            generation: terminalGeneration
          });
      rendererLifecycleRef.current = terminalLifecycle;
      setRendererLifecycle(terminalLifecycle);
    };
    if (failure.code === 'webgl-unavailable') {
      if (reportedGeneration !== undefined && generation !== current.generation) return;
      rendererModeRef.current = 'fallback';
      const nextLifecycle = transitionRealmRendererLifecycle(current, {
        type: 'webgl-unsupported',
        failure
      });
      rendererLifecycleRef.current = nextLifecycle;
      setRendererLifecycle(nextLifecycle);
      return;
    }
    if (generation !== current.generation) {
      const activePredecessorLostDuringReplacement = (
        failure.code === 'context-lost'
        && generation === activeRendererGenerationRef.current
        && pendingSceneConstructionRef.current?.generation === current.generation
      );
      if (!activePredecessorLostDuringReplacement) return;

      // A hidden candidate cannot safely be promoted after the scene it was
      // meant to replace loses its context. Retire both generations and start
      // one bounded recovery from the candidate's already-resolved tier.
      rendererModeRef.current = 'loading';
      if (rendererDeadlineRef.current?.generation === current.generation) {
        clearRendererDeadline();
      }
      recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
      recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
      recoverySceneRebuildDeadlineKindRef.current = undefined;
      const lowerQuality = shouldRebalanceRealmRendererQuality(failure)
        ? nextLowerRealmRendererQuality(qualityRef.current)
        : undefined;
      const retryable = shouldRetryRealmRenderer(current, failure);
      retireRendererGeneration(current.generation);
      retireRendererGeneration(generation);
      rotateRendererCanvasSlot();
      nonblockingSceneReplacementRef.current = false;
      if (!retryable) {
        publishTerminalLifecycle(failure, current.generation);
        return;
      }
      if (lowerQuality) {
        pendingEmergencyQualityRef.current = Object.freeze({
          generation: current.generation,
          quality: retainRealmRendererEmergencyQuality(lowerQuality)
        });
        applyPendingEmergencyQuality(current.generation);
      }
      const recoveryLifecycle = transitionRealmRendererLifecycle(current, {
        type: 'recover',
        failure,
        attempt: current.attempt + 1,
        generation: current.generation
      });
      rendererLifecycleRef.current = recoveryLifecycle;
      setRendererLifecycle(recoveryLifecycle);
      recoverySceneRebuildDeadlinePendingRef.current = true;
      recoverySceneRebuildDeadlineKindRef.current = 'scene-rebuild';
      requestedSceneRecreationReasonRef.current = 'renderer-recovery';
      rendererRecoveryNonceRef.current += 1;
      setRendererRecoveryNonce(rendererRecoveryNonceRef.current);
      return;
    }
    // Stop accepting pointer/camera mutations synchronously, before React has
    // committed the loading/recovering state to the DOM. The scene itself
    // applies the same guard while a WebGL context is lost.
    rendererModeRef.current = 'loading';
    const activeDeadline = rendererDeadlineRef.current;
    if (
      failure.code === 'context-lost'
      && activeDeadline?.generation === generation
      && activeDeadline.kind === 'context-restore'
    ) {
      // A browser may dispatch duplicate loss notifications for one lost
      // context. The first notification owns both the attempt and deadline.
      return;
    }
    if (
      activeDeadline?.generation === generation
    ) {
      recoverySceneRebuildDeadlineExpiresAtRef.current = (
        activeDeadline.kind === 'scene-rebuild'
        && failure.code !== 'context-lost'
      ) ? activeDeadline.expiresAt : undefined;
      recoverySceneRebuildDeadlineWallExpiresAtRef.current = (
        activeDeadline.kind === 'scene-rebuild'
        && failure.code !== 'context-lost'
      ) ? activeDeadline.wallExpiresAt : undefined;
      recoverySceneRebuildDeadlineKindRef.current = (
        activeDeadline.kind === 'scene-rebuild'
        && failure.code !== 'context-lost'
      ) ? 'scene-rebuild' : undefined;
      clearRendererDeadline();
    }
    const retryable = shouldRetryRealmRenderer(current, failure);
    if (failure.code === 'context-lost') {
      const lowerQuality = nextLowerRealmRendererQuality(qualityRef.current);
      if (!retryable) {
        retireRendererGeneration(generation);
        publishTerminalLifecycle(failure, generation);
        return;
      }
      // Retain the emergency ceiling immediately for a Return/Re-enter path,
      // but do not change the active quality until this context restores (or
      // the player explicitly retries). Recreating now would remove the only
      // listener capable of observing webglcontextrestored.
      if (lowerQuality) {
        pendingEmergencyQualityRef.current = Object.freeze({
          generation,
          quality: retainRealmRendererEmergencyQuality(lowerQuality)
        });
      }
    }
    if (retryable) {
      if (
        failure.code !== 'context-lost'
        && shouldRebalanceRealmRendererQuality(failure)
      ) {
        const lowerQuality = nextLowerRealmRendererQuality(qualityRef.current);
        if (lowerQuality) {
          pendingEmergencyQualityRef.current = Object.freeze({
            generation,
            quality: retainRealmRendererEmergencyQuality(lowerQuality)
          });
        }
        // A construction/rebuild fault receives a genuinely fresh canvas;
        // otherwise a permanently lost WebGL context can poison the retry.
        rotateRendererCanvasSlot();
      }
      const nextAttempt = current.attempt + 1;
      const nextLifecycle = transitionRealmRendererLifecycle(current, {
        type: 'recover',
        failure,
        attempt: nextAttempt,
        generation
      });
      rendererLifecycleRef.current = nextLifecycle;
      setRendererLifecycle(nextLifecycle);
      if (failure.code !== 'context-lost') {
        applyPendingEmergencyQuality(generation);
        recoverySceneRebuildDeadlinePendingRef.current = current.everReady;
        recoverySceneRebuildDeadlineKindRef.current = current.everReady
          ? recoverySceneRebuildDeadlineKindRef.current ?? 'scene-rebuild'
          : undefined;
        if (!current.everReady) {
          recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
          recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
        }
        requestedSceneRecreationReasonRef.current = 'renderer-recovery';
        rendererRecoveryNonceRef.current += 1;
        setRendererRecoveryNonce(rendererRecoveryNonceRef.current);
      } else {
        armRendererDeadline(
          'context-restore',
          generation,
          REALM_RENDERER_CONTEXT_RESTORE_TIMEOUT_MS
        );
      }
      return;
    }
    retireRendererGeneration(generation);
    publishTerminalLifecycle(failure, generation);
  }, [
    applyPendingEmergencyQuality,
    armRendererDeadline,
    captureRendererContextTelemetry,
    clearRendererDeadline,
    clearRendererStabilityTimer,
    retireRendererGeneration,
    rotateRendererCanvasSlot
  ]);
  markRendererFailureRef.current = markRendererFailure;

  const retryRenderer = useCallback(() => {
    clearRendererDeadline();
    clearRendererStabilityTimer();
    recoverySceneRebuildDeadlineKindRef.current = undefined;
    recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
    recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
    rotateRendererCanvasSlot();
    const current = rendererLifecycleRef.current;
    applyPendingEmergencyQuality(current.generation);
    recoverySceneRebuildDeadlinePendingRef.current = current.everReady;
    recoverySceneRebuildDeadlineKindRef.current = current.everReady
      ? 'scene-rebuild'
      : undefined;
    const loadingLifecycle = transitionRealmRendererLifecycle(current, {
      type: 'load-start',
      attempt: 0
    });
    rendererLifecycleRef.current = loadingLifecycle;
    setRendererLifecycle(loadingLifecycle);
    rendererModeRef.current = 'loading';
    requestedSceneRecreationReasonRef.current = 'explicit-retry';
    rendererRecoveryNonceRef.current += 1;
    setRendererRecoveryNonce(rendererRecoveryNonceRef.current);
  }, [
    applyPendingEmergencyQuality,
    clearRendererDeadline,
    clearRendererStabilityTimer,
    rotateRendererCanvasSlot
  ]);

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
    if (target?.kind === 'water-cell') {
      sceneRef.current?.setHoveredWorkerId?.(null);
      updateHoveredCastleId(undefined);
      hoveredCoordRef.current = null;
      sceneRef.current?.setHoveredWaterCellKey?.(target.cellKey);
      sceneRef.current?.setHovered(null);
      return;
    }
    if (target?.kind === 'worker') {
      sceneRef.current?.setHoveredWaterCellKey?.(null);
      updateHoveredCastleId(undefined);
      updateHoveredCoord(null);
      // setHovered intentionally clears worker hover, so the worker lane must
      // be applied last and remain the sole visual cue for this target.
      sceneRef.current?.setHoveredWorkerId?.(target.workerId);
      return;
    }
    sceneRef.current?.setHoveredWorkerId?.(null);
    sceneRef.current?.setHoveredWaterCellKey?.(null);
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
    if (target.kind === 'worker') {
      const worker = publicWorkerProjectionRef.current?.workers.find((candidate) => (
        candidate.workerId === target.workerId
        && candidate.ordinal === target.workerOrdinal
        && candidate.originCastleId === target.originCastleId
      ));
      if (worker) selectWorkerOrOccupiedSite(worker, () => target.coord);
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
    if (target.kind === 'stone-site') {
      const node = stoneNodesRef.current.find((candidate) => candidate.siteId === target.siteId);
      if (node) selectStoneNode(node);
      return;
    }
    if (target.kind === 'water-cell') {
      const record = waterRecordsByKeyRef.current.get(target.cellKey);
      if (record) selectWaterCell(record);
      return;
    }
    selectCoord(target.coord);
    pushWorldSurface({ kind: 'terrain', tileKey: hexKey(target.coord) });
  }, [
    pushWorldSurface,
    selectCastle,
    selectCoord,
    selectFoodNode,
    selectGoldNode,
    selectStoneNode,
    selectWaterCell,
    selectWoodNode,
    selectWorkerOrOccupiedSite
  ]);
  const handleWorldSelectionFeedback = useCallback((
    point: Readonly<{ x: number; y: number }>
  ) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const rootBounds = rootRef.current?.getBoundingClientRect();
    pendingSelectionScreenXRef.current = point.x + (rootBounds?.left ?? 0);
    if (selectionFeedbackTimerRef.current !== null) {
      window.clearTimeout(selectionFeedbackTimerRef.current);
    }
    selectionFeedbackSequenceRef.current += 1;
    const feedback = Object.freeze({
      sequence: selectionFeedbackSequenceRef.current,
      x: point.x,
      y: point.y
    });
    setWorldSelectionFeedback(feedback);
    selectionFeedbackTimerRef.current = window.setTimeout(() => {
      selectionFeedbackTimerRef.current = null;
      setWorldSelectionFeedback((current) => (
        current?.sequence === feedback.sequence ? undefined : current
      ));
    }, 480);
  }, []);

  const updateCastleProjection = useCallback((frame: RealmCastleProjectionFrame) => {
    latestProjectionRef.current = frame;
    const root = rootRef.current;
    if (!root || frame.width <= 0 || frame.height <= 0) return;

    const candidateCastles = frame.castles.slice(0, CASTLE_LABEL_LAYOUT_MAX_CASTLES);
    const candidateFrame = { ...frame, castles: candidateCastles };
    const eligibleLabels = resolvePersistentCastleLabels(candidateFrame);
    const retainMembership =
      retainCastleProjectionWhileOccupiedResourceInspectorOpen(root);
    const labels = retainMembership
      ? eligibleLabels
      : resolvePersistentCastleLabels(
          candidateFrame,
          { reservedRects: reservedUiRectsRef.current }
        );
    reservedCastleLabelRectsRef.current = Object.freeze(labels.map((label) => {
      const width = label.compact
        ? CASTLE_LABEL_COMPACT_MAXIMUM_CONTROL_WIDTH
        : CASTLE_LABEL_MAXIMUM_CONTROL_WIDTH;
      return Object.freeze({
        left: label.x - width / 2,
        top: label.y,
        right: label.x + width / 2,
        bottom: label.y + CASTLE_LABEL_MINIMUM_CONTROL_SIZE
      });
    }));
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

  const updateStoneNodePresentationTelemetry = useCallback((
    telemetry: RealmStoneNodePresentationTelemetry
  ) => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.publicStoneSiteCount = String(telemetry.publicSiteCount);
    root.dataset.occupiedStoneSiteCount = String(telemetry.occupiedSiteCount);
    root.dataset.renderedStoneQuarryCount = String(telemetry.renderedStoneQuarryCount);
    root.dataset.renderedStoneWagonCount = String(telemetry.renderedWagonCount);
    root.dataset.animatedStoneWagonCount = String(telemetry.animatedWagonCount);
    root.dataset.stoneMarkerOnlySiteCount = String(telemetry.markerOnlySiteCount);
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
    root.dataset.terrainSlopeCueMin = String(telemetry.terrainSlopeCueMin);
    root.dataset.terrainSlopeCueMax = String(telemetry.terrainSlopeCueMax);
    root.dataset.terrainConcavityCueMin = String(telemetry.terrainConcavityCueMin);
    root.dataset.terrainConcavityCueMax = String(telemetry.terrainConcavityCueMax);
    root.dataset.terrainVegetationCueMin = String(telemetry.terrainVegetationCueMin);
    root.dataset.terrainVegetationCueMax = String(telemetry.terrainVegetationCueMax);
    root.dataset.terrainWetnessCueMin = String(telemetry.terrainWetnessCueMin);
    root.dataset.terrainWetnessCueMax = String(telemetry.terrainWetnessCueMax);
    root.dataset.terrainRiverBankVertexCount = String(
      telemetry.terrainRiverBankVertexCount
    );
    root.dataset.terrainRiverBankInfluenceMax = String(
      telemetry.terrainRiverBankInfluenceMax
    );
    root.dataset.terrainShaderEnhanced = String(telemetry.terrainShaderEnhanced);
    root.dataset.terrainShaderFallbackActive = String(
      telemetry.terrainShaderFallbackActive
    );
    root.dataset.terrainShaderCompileAttemptCount = String(
      telemetry.terrainShaderCompileAttemptCount
    );
    root.dataset.snowFieldRevision = telemetry.snowFieldRevision;
    root.dataset.snowPreRetentionCellCountAbove015 = String(
      telemetry.snowPreRetentionCellCountAbove015
    );
    root.dataset.snowPreRetentionDeepCellCountAbove075 = String(
      telemetry.snowPreRetentionDeepCellCountAbove075
    );
    root.dataset.snowPreRetentionCoverageRatio = String(
      telemetry.snowPreRetentionCoverageRatio
    );
    root.dataset.snowPreRetentionDeepCoverageRatio = String(
      telemetry.snowPreRetentionDeepCoverageRatio
    );
    root.dataset.snowInnerRadiusLeakCount = String(
      telemetry.snowInnerRadiusLeakCount
    );
    root.dataset.snowSouthernLeakCount = String(telemetry.snowSouthernLeakCount);
    root.dataset.snowVertexCoverageMin = String(telemetry.snowVertexCoverageMin);
    root.dataset.snowVertexCoverageMax = String(telemetry.snowVertexCoverageMax);
    root.dataset.snowVertexCoverageMean = String(telemetry.snowVertexCoverageMean);
    root.dataset.snowAttributeBytes = String(telemetry.snowAttributeBytes);
    root.dataset.snowSampledPlayableLandCellCenterCount = String(
      telemetry.snowSampledPlayableLandCellCenterCount
    );
    root.dataset.snowRetainedCellCenterCountAbove015 = String(
      telemetry.snowRetainedCellCenterCountAbove015
    );
    root.dataset.snowRetainedDeepCellCenterCountAbove075 = String(
      telemetry.snowRetainedDeepCellCenterCountAbove075
    );
    root.dataset.snowRetainedCellCenterCoverageRatio = String(
      telemetry.snowRetainedCellCenterCoverageRatio
    );
    root.dataset.snowRetainedDeepCellCenterCoverageRatio = String(
      telemetry.snowRetainedDeepCellCenterCoverageRatio
    );
    root.dataset.snowRetainedCellCenterCoverageMean = String(
      telemetry.snowRetainedCellCenterCoverageMean
    );
    root.dataset.snowRetainedCellCenterInnerRadiusLeakCount = String(
      telemetry.snowRetainedCellCenterInnerRadiusLeakCount
    );
    root.dataset.snowRetainedCellCenterSouthernLeakCount = String(
      telemetry.snowRetainedCellCenterSouthernLeakCount
    );
    root.dataset.snowRetainedNorthernmostRowCoverageMean = String(
      telemetry.snowRetainedNorthernmostRowCoverageMean
    );
    root.dataset.snowFineReliefMode = telemetry.snowFineReliefMode;
    root.dataset.snowShaderEnhanced = String(telemetry.snowShaderEnhanced);
    root.dataset.snowShaderFallbackActive = String(
      telemetry.snowShaderFallbackActive
    );
    root.dataset.southernDesertFieldRevision =
      telemetry.southernDesertFieldRevision;
    root.dataset.desertClimateCellCountAbove015 = String(
      telemetry.desertClimateCellCountAbove015
    );
    root.dataset.desertDeepCellCountAbove075 = String(
      telemetry.desertDeepCellCountAbove075
    );
    root.dataset.desertPlayableCoverageRatio = String(
      telemetry.desertPlayableCoverageRatio
    );
    root.dataset.desertDeepCoverageRatio = String(
      telemetry.desertDeepCoverageRatio
    );
    root.dataset.desertInnerRadiusLeakCount = String(
      telemetry.desertInnerRadiusLeakCount
    );
    root.dataset.desertNorthernLeakCount = String(
      telemetry.desertNorthernLeakCount
    );
    root.dataset.desertSampledPlayableLandCellCenterCount = String(
      telemetry.desertSampledPlayableLandCellCenterCount
    );
    root.dataset.desertCellCenterCoverageMean = String(
      telemetry.desertCellCenterCoverageMean
    );
    root.dataset.desertSouthernmostRowCoverageMean = String(
      telemetry.desertSouthernmostRowCoverageMean
    );
    root.dataset.sandVertexCoverageMin = String(
      telemetry.sandVertexCoverageMin
    );
    root.dataset.sandVertexCoverageMax = String(
      telemetry.sandVertexCoverageMax
    );
    root.dataset.sandVertexCoverageMean = String(
      telemetry.sandVertexCoverageMean
    );
    root.dataset.sandAttributeBytes = String(telemetry.sandAttributeBytes);
    root.dataset.sandFineReliefMode = telemetry.sandFineReliefMode;
    root.dataset.sandShaderEnhanced = String(telemetry.sandShaderEnhanced);
    root.dataset.sandShaderFallbackActive = String(
      telemetry.sandShaderFallbackActive
    );
    root.dataset.sandSnowOverlapCellCount = String(
      telemetry.sandSnowOverlapCellCount
    );
    root.dataset.sandSnowOverlapVertexCount = String(
      telemetry.sandSnowOverlapVertexCount
    );
    root.dataset.semanticTerrainCellCount = String(telemetry.semanticCellCount);
    root.dataset.semanticTerrainKindCount = String(telemetry.semanticKindCount);
    root.dataset.semanticTerrainFeatureCount = String(telemetry.semanticFeatureCount);
    root.dataset.semanticTerrainFeatureDrawCalls = String(telemetry.semanticFeatureDrawCalls);
    root.dataset.semanticTerrainFeatureCounts = JSON.stringify(telemetry.semanticFeatureCounts);
    root.dataset.totalTerrainDetailInstanceCount = String(telemetry.totalDetailInstanceCount);
    root.dataset.totalTerrainDetailDrawCalls = String(telemetry.totalDetailDrawCalls);
    root.dataset.forestPlacementSource = telemetry.forestPlacementSource;
    root.dataset.sharedForestTreeCount = String(telemetry.forestSharedTreeCount);
    root.dataset.forestCanonicalTriangleCount = String(
      telemetry.forestCanonicalTriangleCount
    );
    root.dataset.forestVisibleTriangleCount = String(
      telemetry.forestVisibleTriangleCount
    );
    root.dataset.forestFallbackType = telemetry.forestFallbackType;
    root.dataset.forestContactShadowCount = String(
      telemetry.forestContactShadowCount
    );
    root.dataset.forestGroundingMode = telemetry.forestGroundingMode;
    root.dataset.forestCanopyMotionState = telemetry.forestCanopyMotionState;
    root.dataset.forestStructureCellCounts = JSON.stringify(
      telemetry.forestStructureCellCounts
    );
    root.dataset.forestCoreCellCount = String(
      telemetry.forestStructureCellCounts.core
    );
    root.dataset.forestBodyCellCount = String(
      telemetry.forestStructureCellCounts.body
    );
    root.dataset.forestFringeCellCount = String(
      telemetry.forestStructureCellCounts.fringe
    );
    root.dataset.forestClearingCellCount = String(
      telemetry.forestStructureCellCounts.clearing
    );
    root.dataset.forestSilhouetteCoverageRatio = String(
      telemetry.forestSilhouetteCoverageRatio
    );
    root.dataset.forestSnowTintedTreeCount = String(
      telemetry.forestSnowTintedTreeCount
    );
    root.dataset.forestDryTintedTreeCount = String(
      telemetry.forestDryTintedTreeCount
    );
    root.dataset.forestDecorativeRejectedBySand = String(
      telemetry.forestDecorativeRejectedBySand
    );
    root.dataset.forestDrylandRetainedCount = String(
      telemetry.forestDrylandRetainedCount
    );
    root.dataset.forestSandTintedTreeCount = String(
      telemetry.forestSandTintedTreeCount
    );
    root.dataset.forestDecorativeTreeCount = String(
      telemetry.forestDecorativeTreeCount
    );
    root.dataset.forestDecorativeTriangleCount = String(
      telemetry.forestDecorativeTriangleCount
    );
    root.dataset.forestDecorativeDrawCalls = String(
      telemetry.forestDecorativeDrawCalls
    );
    root.dataset.forestDecorativeCacheEntries = String(
      telemetry.forestDecorativeCacheEntries
    );
    root.dataset.forestDecorativeCacheLimit = String(
      telemetry.forestDecorativeCacheLimit
    );
    root.dataset.forestDecorativeCacheHighWaterMark = String(
      telemetry.forestDecorativeCacheHighWaterMark
    );
    root.dataset.forestDecorativeRepackCount = String(
      telemetry.forestDecorativeRepackCount
    );
    root.dataset.forestDecorativeModelReady = String(
      telemetry.forestDecorativeModelReady
    );
    root.dataset.forestDecorativeUsingFallback = String(
      telemetry.forestDecorativeUsingFallback
    );
    root.dataset.forestDecorativeFallbackType =
      telemetry.forestDecorativeFallbackType;
    root.dataset.forestDecorativeContactShadowCount = String(
      telemetry.forestDecorativeContactShadowCount
    );
    root.dataset.forestDecorativeGroundingMode =
      telemetry.forestDecorativeGroundingMode;
    root.dataset.forestDecorativeCanopyMotionState =
      telemetry.forestDecorativeCanopyMotionState;
    root.dataset.forestDecorativeStructureCellCounts = JSON.stringify(
      telemetry.forestDecorativeStructureCellCounts
    );
    root.dataset.forestDecorativeCoreCellCount = String(
      telemetry.forestDecorativeStructureCellCounts.core
    );
    root.dataset.forestDecorativeBodyCellCount = String(
      telemetry.forestDecorativeStructureCellCounts.body
    );
    root.dataset.forestDecorativeFringeCellCount = String(
      telemetry.forestDecorativeStructureCellCounts.fringe
    );
    root.dataset.forestDecorativeClearingCellCount = String(
      telemetry.forestDecorativeStructureCellCounts.clearing
    );
    root.dataset.forestDecorativeSilhouetteCoverageRatio = String(
      telemetry.forestDecorativeSilhouetteCoverageRatio
    );
    root.dataset.forestDecorativeCanonicalTriangleCount = String(
      telemetry.forestDecorativeCanonicalTriangleCount
    );
    root.dataset.forestDecorativeOverviewHidden = String(
      telemetry.forestDecorativeOverviewHidden
    );
    root.dataset.grassCandidateCellCount = String(telemetry.grassCandidateCellCount);
    root.dataset.grassActiveCellCount = String(telemetry.grassActiveCellCount);
    root.dataset.grassInstanceCount = String(telemetry.grassInstanceCount);
    root.dataset.grassTriangleCount = String(telemetry.grassTriangleCount);
    root.dataset.grassDrawCalls = String(telemetry.grassDrawCalls);
    root.dataset.grassCacheEntries = String(telemetry.grassCacheEntries);
    root.dataset.grassCacheLimit = String(telemetry.grassCacheLimit);
    root.dataset.grassCacheHighWaterMark = String(telemetry.grassCacheHighWaterMark);
    root.dataset.grassRepackCount = String(telemetry.grassRepackCount);
    root.dataset.grassAnimated = String(telemetry.grassAnimated);
    root.dataset.grassTargetAnimationCadence = String(telemetry.grassTargetAnimationCadence);
    root.dataset.grassCandidateCellsByTerrain = JSON.stringify(
      telemetry.grassCandidateCellsByTerrain
    );
    root.dataset.grassActiveCellsByTerrain = JSON.stringify(telemetry.grassActiveCellsByTerrain);
    root.dataset.grassCountsByTerrain = JSON.stringify(telemetry.grassCountsByTerrain);
    root.dataset.grassAverageRetainedPatchesByTerrain = JSON.stringify(
      telemetry.grassAverageRetainedPatchesByTerrain
    );
    root.dataset.grassPaletteLuminanceMin = String(telemetry.grassPaletteLuminanceMin);
    root.dataset.grassPaletteLuminanceMax = String(telemetry.grassPaletteLuminanceMax);
    root.dataset.grassPaletteDisplaySrgbSaturationMin = String(
      telemetry.grassPaletteDisplaySrgbSaturationMin
    );
    root.dataset.grassPaletteDisplaySrgbSaturationMax = String(
      telemetry.grassPaletteDisplaySrgbSaturationMax
    );
    root.dataset.grassPaletteGreenMin = String(telemetry.grassPaletteGreenMin);
    root.dataset.grassPaletteGreenMax = String(telemetry.grassPaletteGreenMax);
    root.dataset.grassShaderFallbackActive = String(
      telemetry.grassShaderFallbackActive
    );
    root.dataset.grassShaderFallbackCount = String(
      telemetry.grassShaderFallbackCount
    );
    root.dataset.grassShaderFallbackReason =
      telemetry.grassShaderFallbackReason ?? 'none';
    root.dataset.grassCompletelyBareActiveCells = String(telemetry.grassCompletelyBareActiveCells);
    root.dataset.grassRejectedByStructureClearance = String(
      telemetry.grassRejectedByStructureClearance
    );
    root.dataset.grassRejectedBySlope = String(telemetry.grassRejectedBySlope);
    root.dataset.grassRejectedBySnow = String(telemetry.grassRejectedBySnow);
    root.dataset.grassRetainedInSnowTransition = String(
      telemetry.grassRetainedInSnowTransition
    );
    root.dataset.grassAverageSnowCoverageOfActiveCells = String(
      telemetry.grassAverageSnowCoverageOfActiveCells
    );
    root.dataset.grassRejectedBySand = String(telemetry.grassRejectedBySand);
    root.dataset.grassRetainedInDryTransition = String(
      telemetry.grassRetainedInDryTransition
    );
    root.dataset.grassActiveSandCellCount = String(
      telemetry.grassActiveSandCellCount
    );
    root.dataset.grassAverageSandCoverageOfActiveCells = String(
      telemetry.grassAverageSandCoverageOfActiveCells
    );
    root.dataset.grassOverviewHidden = String(telemetry.grassOverviewHidden);
  }, []);

  const updateSceneComposition = useCallback(() => {
    if (compositionRafRef.current !== null) return;
    compositionRafRef.current = window.requestAnimationFrame(() => {
      compositionRafRef.current = null;
      const root = rootRef.current;
      if (root) {
        reservedUiRectsRef.current = measuredVisibleRealmUiRects(root);
        const cameraNeutralInspectorOpen = root.querySelector(
          '.realm-camera-neutral-inspector'
        ) !== null;
        if (!cameraNeutralInspectorOpen) {
          stableCameraCompositionRef.current = measuredRealmComposition(root);
        }
        // Mobile presentation may hide unrelated HUD chrome behind a record.
        // Keep the last non-record composition so merely inspecting a passive
        // entity cannot pan or zoom the scene through an inset change.
        const composition = stableCameraCompositionRef.current;
        const scene = sceneRef.current;
        const compositionApplied = composition !== null && scene !== null;
        if (compositionApplied) scene.setComposition(composition);
        let pendingNavigatorTarget = pendingNavigatorTargetRef.current;
        if (
          pendingNavigatorTarget !== null
          && surfaceOpenRef.current
          && pendingNavigatorPermittedStackRef.current
            !== surfaceNavigationStackRef.current
        ) {
          // A fresh destination opened after the target's source surface
          // retired. The newer command wins; never replay a stale map jump
          // under it or after it later closes.
          pendingNavigatorTargetRef.current = null;
          pendingNavigatorPermittedStackRef.current = null;
          pendingNavigatorTarget = null;
        }
        const remainingCoord = settlePendingNavigatorCellFocus({
          pendingCoord: pendingNavigatorTarget?.coord ?? null,
          navigatorOpen: interactionRef.current.navigatorOpen,
          navigatorDialogPresent: root.querySelector(
            '.realm-cell-navigator__dialog'
          ) !== null,
          compositionApplied,
          // The inspector is deliberately activated only after Explore has
          // unmounted and the scene has accepted the unobstructed composition.
          // Passive record selection never writes this pending ref.
          focusCell: () => {
            if (pendingNavigatorTarget) {
              activatePendingNavigatorTargetRef.current(pendingNavigatorTarget);
            }
          }
        });
        pendingNavigatorTargetRef.current = remainingCoord === null
          ? null
          : pendingNavigatorTarget;
        if (remainingCoord === null) {
          pendingNavigatorPermittedStackRef.current = null;
        }
        updateCastleProjection(latestProjectionRef.current);
        applyWorldPortraitProjection();
      }
    });
  }, [
    applyWorldPortraitProjection,
    updateCastleProjection
  ]);

  useEffect(() => {
    if (
      pendingNavigatorTargetRef.current !== null
      && surfaceOpen
      && pendingNavigatorPermittedStackRef.current
        !== surfaceNavigation.stack
    ) {
      pendingNavigatorTargetRef.current = null;
      pendingNavigatorPermittedStackRef.current = null;
    }
  }, [surfaceNavigation.stack, surfaceOpen]);

  useEffect(() => {
    if (
      surfaceNavigation.current !== undefined
      || interaction.navigatorOpen
      || pendingNavigatorTargetRef.current === null
    ) return;
    if (sceneRef.current !== null) {
      // Settle through the same post-layout composition boundary used by
      // every rendered scene. This preserves the open surface's camera while
      // browser history is still traversing.
      updateSceneComposition();
      return;
    }
    if (rendererMode !== 'fallback') return;
    // The static renderer has no imperative scene camera. It can safely
    // consume the deferred semantic target once Explore has unmounted.
    const pendingTarget = pendingNavigatorTargetRef.current;
    pendingNavigatorTargetRef.current = null;
    pendingNavigatorPermittedStackRef.current = null;
    activatePendingNavigatorTarget(pendingTarget);
  }, [
    activatePendingNavigatorTarget,
    interaction.navigatorOpen,
    rendererMode,
    surfaceNavigation.current,
    updateSceneComposition
  ]);

  useEffect(() => () => {
    if (compositionRafRef.current !== null) {
      window.cancelAnimationFrame(compositionRafRef.current);
      compositionRafRef.current = null;
    }
    pendingNavigatorTargetRef.current = null;
    pendingNavigatorPermittedStackRef.current = null;
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
        + '.castle-inspection, .realm-camera-neutral-inspector, .realm-cell-navigator'
      ).forEach((element) => observer?.observe(element));
    }
    window.addEventListener('resize', updateSceneComposition, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSceneComposition);
    };
  }, [
    chromeMode,
    interaction.inspectorOpen,
    interaction.navigatorOpen,
    miniAppSafeAreaSignature,
    rendererMode,
    updateSceneComposition
  ]);

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
      updateResourceProjection({
        width,
        height,
        markers: resourceOccupantSceneRecords.map((record, index) => {
          const projection = fallbackCastleProjection(
            {
              castleId: index + 1,
              q: record.coord.q,
              r: record.coord.r
            },
            viewBox,
            { width, height },
            svgViewport
          );
          const bounds = projection.castleBounds;
          return Object.freeze({
            resource: record.resource,
            siteId: record.siteId,
            x: projection.x,
            y: bounds ? (bounds.top + bounds.bottom) / 2 : projection.y,
            depth: 0,
            visible: projection.visible
          });
        })
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
  }, [
    allCastles,
    rendererMode,
    resourceOccupantSceneRecords,
    updateCastleProjection,
    updateResourceProjection,
    viewBox
  ]);

  useEffect(() => {
    if (
      sceneRef.current
      && rendererLifecycleRef.current.state === 'ready'
      && sceneConstructionProfileRef.current?.key === sceneConstructionKey
      && requestedSceneRecreationReasonRef.current === undefined
    ) {
      return undefined;
    }
    if (
      sceneRef.current
      && rendererLifecycleRef.current.state === 'recovering'
      && rendererLifecycleRef.current.failure?.code === 'context-lost'
      && activeRendererGenerationRef.current === rendererLifecycleRef.current.generation
      && requestedSceneRecreationReasonRef.current === undefined
    ) {
      // Only the matching restore callback, absolute timeout, or an explicit
      // retry may retire the scene that still owns webglcontextrestored.
      return undefined;
    }
    const pendingConstruction = pendingSceneConstructionRef.current;
    if (
      pendingConstruction
      && pendingConstruction.key === sceneConstructionKey
      && pendingConstruction.recoveryNonce === rendererRecoveryNonce
    ) {
      // React StrictMode deliberately replays effects in development. Reuse
      // the one in-flight scene instead of turning that diagnostic replay
      // into a second renderer generation and a false disposal.
      return undefined;
    }
    if (pendingConstruction) {
      if (
        rendererDeadlineRef.current?.generation === pendingConstruction.generation
        && rendererDeadlineRef.current.kind !== 'context-restore'
      ) {
        recoverySceneRebuildDeadlineKindRef.current = rendererDeadlineRef.current.kind;
        recoverySceneRebuildDeadlineExpiresAtRef.current =
          rendererDeadlineRef.current.expiresAt;
        recoverySceneRebuildDeadlineWallExpiresAtRef.current =
          rendererDeadlineRef.current.wallExpiresAt;
        clearRendererDeadline();
        recoverySceneRebuildDeadlinePendingRef.current = true;
      }
      pendingConstruction.scene.dispose();
      sceneDisposalCountRef.current += 1;
      sceneSlotsRef.current[pendingConstruction.slot] = null;
      if (sceneRef.current === pendingConstruction.scene) {
        sceneRef.current = null;
        activeRendererGenerationRef.current = 0;
      }
      pendingSceneConstructionRef.current = null;
      if (rootRef.current) {
        rootRef.current.dataset.realmSceneDisposalCount = String(
          sceneDisposalCountRef.current
        );
      }
    }
    const activeSceneIsHealthy = (
      rendererLifecycleRef.current.state === 'ready'
      || (
        rendererLifecycleRef.current.state === 'loading'
        && nonblockingSceneReplacementRef.current
      )
    );
    if (sceneRef.current && !activeSceneIsHealthy) {
      const unhealthyScene = sceneRef.current;
      try {
        rendererAttestationRef.current = unhealthyScene.getCameraAttestation();
      } catch {
        rendererAttestationRef.current = null;
      }
      try {
        const snapshot = unhealthyScene.getWorkerPresentationContinuity();
        const topologyKey = sceneConstructionProfileRef.current?.topologyKey;
        workerPresentationContinuityRef.current = snapshot && topologyKey
          ? Object.freeze({ topologyKey, snapshot })
          : null;
      } catch {
        workerPresentationContinuityRef.current = null;
      }
      unhealthyScene.dispose();
      sceneDisposalCountRef.current += 1;
      for (const slot of [0, 1] as const) {
        if (sceneSlotsRef.current[slot] === unhealthyScene) {
          sceneSlotsRef.current[slot] = null;
        }
      }
      sceneRef.current = null;
      activeRendererGenerationRef.current = 0;
      nonblockingSceneReplacementRef.current = false;
      const currentRoot = rootRef.current;
      if (currentRoot) {
        currentRoot.dataset.realmSceneDisposalCount = String(
          sceneDisposalCountRef.current
        );
      }
    }
    const replacingReadyScene = (
      activeSceneIsHealthy
      && sceneRef.current !== null
    );
    const candidateSlot: 0 | 1 = replacingReadyScene
      ? (activeCanvasSlotRef.current === 0 ? 1 : 0)
      : activeCanvasSlotRef.current;
    const canvas = canvasSlotRefs.current[candidateSlot] ?? canvasRef.current;
    const webgl2Available = canUseWebGL();
    rendererWebGLProbeAvailableRef.current = webgl2Available;
    if (!canvas) {
      nonblockingSceneReplacementRef.current = false;
      markRendererFailure({
        code: 'renderer-construction-failed',
        retryable: true,
        phase: 'probing',
        message: 'The Realm canvas was not available for renderer construction.'
      });
      return undefined;
    }
    if (!webgl2Available) {
      nonblockingSceneReplacementRef.current = false;
      sceneRef.current?.setPresentationActive(false);
      markRendererFailure({
        code: 'webgl-unavailable',
        retryable: true,
        phase: 'probing',
        message: 'WebGL is unavailable on this device.'
      });
      return undefined;
    }

    let scene: RealmSceneHandle | null = null;
    let retired = false;
    const previousActiveScene = sceneRef.current;
    const previousActiveSlot = activeCanvasSlotRef.current;
    const previousActiveGeneration = activeRendererGenerationRef.current;
    let candidatePresentationActive = !replacingReadyScene;
    let pendingCameraMode: RealmCameraMode | undefined;
    let pendingCastleTelemetry: RealmCastleInstancePresentationTelemetry | undefined;
    let pendingGoldTelemetry: RealmGoldNodePresentationTelemetry | undefined;
    let pendingFoodTelemetry: RealmFoodNodePresentationTelemetry | undefined;
    let pendingWoodTelemetry: RealmWoodNodePresentationTelemetry | undefined;
    let pendingStoneTelemetry: RealmStoneNodePresentationTelemetry | undefined;
    let pendingTerrainTelemetry: RealmTerrainPresentationTelemetry | undefined;
    let pendingCastleProjection: RealmCastleProjectionFrame | undefined;
    let pendingResourceProjection: RealmResourceProjectionFrame | undefined;
    let pendingWorkerProjection: RealmWorkerProjectionFrame | undefined;
    const publishBufferedCandidatePresentation = () => {
      if (pendingCameraMode !== undefined) setCameraMode(pendingCameraMode);
      if (pendingCastleTelemetry !== undefined) {
        updateCastlePresentationTelemetry(pendingCastleTelemetry);
      }
      if (pendingGoldTelemetry !== undefined) {
        updateGoldNodePresentationTelemetry(pendingGoldTelemetry);
      }
      if (pendingFoodTelemetry !== undefined) {
        updateFoodNodePresentationTelemetry(pendingFoodTelemetry);
      }
      if (pendingWoodTelemetry !== undefined) {
        updateWoodNodePresentationTelemetry(pendingWoodTelemetry);
      }
      if (pendingStoneTelemetry !== undefined) {
        updateStoneNodePresentationTelemetry(pendingStoneTelemetry);
      }
      if (pendingTerrainTelemetry !== undefined) {
        updateTerrainPresentationTelemetry(pendingTerrainTelemetry);
      }
      if (pendingCastleProjection !== undefined) {
        updateCastleProjection(pendingCastleProjection);
      }
      if (pendingResourceProjection !== undefined) {
        updateResourceProjection(pendingResourceProjection);
      }
      if (pendingWorkerProjection !== undefined) {
        updateWorkerProjection(pendingWorkerProjection);
      }
    };
    const synchronizeLatestInteraction = (
      targetScene: RealmSceneHandle,
      applyCameraTarget: boolean
    ) => {
      targetScene.setPresentedCastleIds(presentedCastleIdsRef.current);
      targetScene.setSelected(selectedCoordRef.current);
      targetScene.setSelectedCastleId(
        interactionRef.current.selectedCastle?.castleId ?? null
      );
      targetScene.setSelectedGoldSiteId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'siteId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.siteId
          : null
      );
      targetScene.setSelectedFoodSiteId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'foodSiteId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.foodSiteId
          : null
      );
      targetScene.setSelectedWoodSiteId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'woodSiteId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.woodSiteId
          : null
      );
      targetScene.setSelectedStoneSiteId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'stoneSiteId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.stoneSiteId
          : null
      );
      targetScene.setSelectedWorkerId?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'workerId' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.workerId
          : null
      );
      targetScene.setSelectedWorkerRouteId?.(
        selectedWorkerRouteIdRef.current ?? null
      );
      targetScene.setSelectedWaterCellKey?.(
        interactionRef.current.inspectorOpen
        && interactionRef.current.inspectorTarget !== null
        && 'cellKey' in interactionRef.current.inspectorTarget
          ? interactionRef.current.inspectorTarget.cellKey
          : null
      );
      targetScene.setHovered(hoveredCoordRef.current);
      if (!applyCameraTarget) return;
      const cameraTarget: RealmCameraTarget = interactionRef.current.cameraTarget;
      if (cameraTarget.kind === 'castle') targetScene.focusCastle(cameraTarget.castleId);
      else if (cameraTarget.kind === 'castle-location') {
        targetScene.locateCastle(cameraTarget.castleId);
      }
      else if (cameraTarget.kind === 'cell-location') {
        targetScene.locateCell(cameraTarget.coord);
      }
      else if (cameraTarget.kind === 'cell') targetScene.focusCell(cameraTarget.coord);
      else if (cameraTarget.kind === 'keep') targetScene.recenterKeep();
      else if (cameraTarget.kind === 'founding-district') {
        targetScene.frameFoundingDistrict();
      }
      else targetScene.showRealm();
    };
    let retainedAttestation: ReturnType<RealmSceneHandle['getCameraAttestation']> | null = null;
    if (previousActiveScene) {
      try {
        retainedAttestation = previousActiveScene.getCameraAttestation();
      } catch {
        retainedAttestation = null;
      }
    } else {
      retainedAttestation = rendererAttestationRef.current;
    }
    const rendererGeneration = nextRendererGenerationRef.current;
    nextRendererGenerationRef.current += 1;
    rendererCanvasByGenerationRef.current.set(rendererGeneration, canvas);
    if (rendererCanvasByGenerationRef.current.size > 24) {
      const oldestGeneration = rendererCanvasByGenerationRef.current.keys().next().value;
      if (typeof oldestGeneration === 'number') {
        rendererCanvasByGenerationRef.current.delete(oldestGeneration);
        rendererContextTelemetryByGenerationRef.current.delete(oldestGeneration);
      }
    }
    const constructionProfile: RealmSceneConstructionProfile = Object.freeze({
      key: sceneConstructionKey,
      topologyKey: sceneTopologyKey,
      quality: qualitySpec.id,
      reducedMotion
    });
    const recreationReason = realmSceneRecreationReason(
      sceneConstructionProfileRef.current,
      constructionProfile,
      requestedSceneRecreationReasonRef.current
    );
    const presentationOnlyReplacement = (
      recreationReason === 'graphics-quality-change'
      || recreationReason === 'reduced-motion-material-change'
    );
    requestedSceneRecreationReasonRef.current = undefined;
    lastSceneRecreationReasonRef.current = recreationReason;
    sceneCreationCountRef.current += 1;
    const root = rootRef.current;
    if (root) {
      root.dataset.realmSceneCreationCount = String(sceneCreationCountRef.current);
      root.dataset.realmSceneDisposalCount = String(sceneDisposalCountRef.current);
      root.dataset.realmLastSceneRecreationReason = recreationReason;
      root.dataset.realmSceneReplacementFailureCount = String(
        sceneReplacementFailureCountRef.current
      );
    }
    clearRendererStabilityTimer();
    const loadingLifecycle = transitionRealmRendererLifecycle(rendererLifecycleRef.current, {
      type: 'load-start',
      attempt: rendererLifecycleRef.current.attempt,
      generation: rendererGeneration
    });
    if (!replacingReadyScene) {
      activeRendererGenerationRef.current = rendererGeneration;
    }
    nonblockingSceneReplacementRef.current = replacingReadyScene;
    rendererLifecycleRef.current = loadingLifecycle;
    if (recoverySceneRebuildDeadlinePendingRef.current) {
      recoverySceneRebuildDeadlinePendingRef.current = false;
      const deadlineKind = recoverySceneRebuildDeadlineKindRef.current
        ?? 'scene-rebuild';
      const absoluteExpiresAt = recoverySceneRebuildDeadlineExpiresAtRef.current;
      const absoluteWallExpiresAt =
        recoverySceneRebuildDeadlineWallExpiresAtRef.current;
      recoverySceneRebuildDeadlineKindRef.current = undefined;
      recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
      recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
      armRendererDeadline(
        deadlineKind,
        rendererGeneration,
        deadlineKind === 'scene-build'
          ? REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS
          : REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS,
        absoluteExpiresAt,
        absoluteWallExpiresAt
      );
    } else if (!replacingReadyScene) {
      // The first scene and an explicit retry must also be bounded. This is
      // the path older devices take before any WebGL frame has ever become
      // ready, so it cannot rely on post-restore recovery state.
      armRendererDeadline(
        'scene-build',
        rendererGeneration,
        REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS
      );
    } else {
      // Quality and reduced-motion replacements remain visually nonblocking,
      // but their hidden renderer must still have a bounded lifetime. If it
      // stalls, the deadline retires only the candidate and keeps the healthy
      // predecessor active.
      armRendererDeadline(
        'scene-rebuild',
        rendererGeneration,
        REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS
      );
    }
    const updateSceneLifecycleTelemetry = () => {
      const currentRoot = rootRef.current;
      if (!currentRoot) return;
      currentRoot.dataset.realmSceneDisposalCount = String(
        sceneDisposalCountRef.current
      );
      currentRoot.dataset.realmSceneReplacementFailureCount = String(
        sceneReplacementFailureCountRef.current
      );
    };
    const rejectCandidate = (failure: RealmRendererFailure) => {
      if (retired) return;
      if (
        rendererDeadlineRef.current?.generation === rendererGeneration
        && rendererDeadlineRef.current.kind !== 'context-restore'
      ) {
        recoverySceneRebuildDeadlineKindRef.current = rendererDeadlineRef.current.kind;
        recoverySceneRebuildDeadlineExpiresAtRef.current =
          rendererDeadlineRef.current.expiresAt;
        recoverySceneRebuildDeadlineWallExpiresAtRef.current =
          rendererDeadlineRef.current.wallExpiresAt;
      }
      if (rendererDeadlineRef.current?.generation === rendererGeneration) {
        clearRendererDeadline();
      }
      retired = true;
      candidatePresentationActive = false;
      if (pendingSceneConstructionRef.current?.scene === scene) {
        pendingSceneConstructionRef.current = null;
      }
      if (scene) {
        scene.setPresentationActive(false);
        scene.dispose();
        sceneDisposalCountRef.current += 1;
      } else {
        // createRealmScene owns a cleanup scope before it can return a
        // handle; both a synchronous failure callback and a thrown
        // construction error retire that scope internally.
        sceneDisposalCountRef.current += 1;
      }
      captureRendererContextTelemetry(rendererGeneration, canvas.dataset);
      rendererCanvasByGenerationRef.current.delete(rendererGeneration);
      rendererContextTelemetryByGenerationRef.current.delete(rendererGeneration);
      if (sceneSlotsRef.current[candidateSlot] === scene) {
        sceneSlotsRef.current[candidateSlot] = null;
      }
      if (sceneRef.current === scene) sceneRef.current = null;
      sceneReplacementFailureCountRef.current += 1;

      const canRetainActiveScene = (
        presentationOnlyReplacement
        && nonblockingSceneReplacementRef.current
        && rendererLifecycleRef.current.state === 'loading'
        && previousActiveScene !== null
        && previousActiveScene === sceneRef.current
        && sceneSlotsRef.current[previousActiveSlot] === previousActiveScene
      );
      if (canRetainActiveScene) {
        recoverySceneRebuildDeadlinePendingRef.current = false;
        recoverySceneRebuildDeadlineKindRef.current = undefined;
        recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
        recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
        sceneRef.current = previousActiveScene;
        activeRendererGenerationRef.current = previousActiveGeneration;
        nonblockingSceneReplacementRef.current = false;
        const retainedLifecycle: RealmRendererLifecycle = Object.freeze({
          ...rendererLifecycleRef.current,
          state: 'ready',
          generation: activeRendererGenerationRef.current,
          failure: undefined,
          lastFailure: failure,
          everReady: true
        });
        rendererLifecycleRef.current = retainedLifecycle;
        setRendererLifecycle(retainedLifecycle);
        armRendererStabilityTimer(activeRendererGenerationRef.current);
        updateSceneLifecycleTelemetry();
        return;
      }

      if (previousActiveScene) {
        try {
          rendererAttestationRef.current = previousActiveScene.getCameraAttestation();
        } catch {
          rendererAttestationRef.current = null;
        }
        const ownedPreviousScene = (
          sceneRef.current === previousActiveScene
          || sceneSlotsRef.current.some((candidate) => candidate === previousActiveScene)
        );
        if (ownedPreviousScene) {
          previousActiveScene.setPresentationActive(false);
          previousActiveScene.dispose();
          sceneDisposalCountRef.current += 1;
        }
        for (const slot of [0, 1] as const) {
          if (sceneSlotsRef.current[slot] === previousActiveScene) {
            sceneSlotsRef.current[slot] = null;
          }
        }
        rendererCanvasByGenerationRef.current.delete(previousActiveGeneration);
        rendererContextTelemetryByGenerationRef.current.delete(
          previousActiveGeneration
        );
        if (sceneRef.current === previousActiveScene) sceneRef.current = null;
      }
      activeRendererGenerationRef.current = 0;
      nonblockingSceneReplacementRef.current = false;
      updateSceneLifecycleTelemetry();
      const reportableFailure: RealmRendererFailure = failure.code === 'context-lost'
        ? Object.freeze({
            ...failure,
            code: 'scene-build-failed',
            phase: 'loading',
            message: 'The replacement Realm scene lost its graphics context during construction.'
          })
        : failure;
      markRendererFailure(reportableFailure, rendererGeneration);
    };
    const constructionIsCurrent = () => (
      !retired
      && scene !== null
      && sceneSlotsRef.current[candidateSlot] === scene
      && (
        pendingSceneConstructionRef.current?.scene === scene
        || sceneRef.current === scene
      )
    );
    try {
      setRendererLifecycle(loadingLifecycle);
      if (!replacingReadyScene) {
        latestProjectionRef.current = { width: 0, height: 0, castles: [] };
        updateResourceProjection({ width: 0, height: 0, markers: [] });
        labelMembershipSignatureRef.current = '';
        latestVisibleCastleLabelsRef.current = [];
        reservedCastleLabelRectsRef.current = [];
        presentedCastleIdsRef.current = [];
      }
      if (!replacingReadyScene && rootRef.current) {
        rootRef.current.dataset.presentedModelCount = '0';
        rootRef.current.dataset.presentedLandscapeBaseCount = '0';
        rootRef.current.dataset.raycastTargetCount = '0';
        rootRef.current.dataset.semanticTerrainCellCount = '0';
        rootRef.current.dataset.semanticTerrainKindCount = '0';
        rootRef.current.dataset.semanticTerrainFeatureCount = '0';
        rootRef.current.dataset.semanticTerrainFeatureDrawCalls = '0';
        rootRef.current.dataset.semanticTerrainFeatureCounts = '{}';
        rootRef.current.dataset.waterPresentation = waterCells ? 'pending' : 'unavailable';
        rootRef.current.dataset.waterLayoutVersion = '0';
        rootRef.current.dataset.waterTriangleCount = '0';
        rootRef.current.dataset.waterDrawCalls = '0';
        rootRef.current.dataset.snowFieldRevision = 'pending';
        rootRef.current.dataset.snowPreRetentionCellCountAbove015 = '0';
        rootRef.current.dataset.snowPreRetentionDeepCellCountAbove075 = '0';
        rootRef.current.dataset.snowPreRetentionCoverageRatio = '0';
        rootRef.current.dataset.snowPreRetentionDeepCoverageRatio = '0';
        rootRef.current.dataset.snowInnerRadiusLeakCount = '0';
        rootRef.current.dataset.snowSouthernLeakCount = '0';
        rootRef.current.dataset.snowVertexCoverageMin = '0';
        rootRef.current.dataset.snowVertexCoverageMax = '0';
        rootRef.current.dataset.snowVertexCoverageMean = '0';
        rootRef.current.dataset.snowAttributeBytes = '0';
        rootRef.current.dataset.snowSampledPlayableLandCellCenterCount = '0';
        rootRef.current.dataset.snowRetainedCellCenterCountAbove015 = '0';
        rootRef.current.dataset.snowRetainedDeepCellCenterCountAbove075 = '0';
        rootRef.current.dataset.snowRetainedCellCenterCoverageRatio = '0';
        rootRef.current.dataset.snowRetainedDeepCellCenterCoverageRatio = '0';
        rootRef.current.dataset.snowRetainedCellCenterCoverageMean = '0';
        rootRef.current.dataset.snowRetainedCellCenterInnerRadiusLeakCount = '0';
        rootRef.current.dataset.snowRetainedCellCenterSouthernLeakCount = '0';
        rootRef.current.dataset.snowRetainedNorthernmostRowCoverageMean = '0';
        rootRef.current.dataset.snowFineReliefMode = 'none';
        rootRef.current.dataset.snowShaderEnhanced = 'false';
        rootRef.current.dataset.snowShaderFallbackActive = 'false';
        rootRef.current.dataset.southernDesertFieldRevision = 'pending';
        rootRef.current.dataset.desertClimateCellCountAbove015 = '0';
        rootRef.current.dataset.desertDeepCellCountAbove075 = '0';
        rootRef.current.dataset.desertPlayableCoverageRatio = '0';
        rootRef.current.dataset.desertDeepCoverageRatio = '0';
        rootRef.current.dataset.desertInnerRadiusLeakCount = '0';
        rootRef.current.dataset.desertNorthernLeakCount = '0';
        rootRef.current.dataset.desertSampledPlayableLandCellCenterCount = '0';
        rootRef.current.dataset.desertCellCenterCoverageMean = '0';
        rootRef.current.dataset.desertSouthernmostRowCoverageMean = '0';
        rootRef.current.dataset.sandVertexCoverageMin = '0';
        rootRef.current.dataset.sandVertexCoverageMax = '0';
        rootRef.current.dataset.sandVertexCoverageMean = '0';
        rootRef.current.dataset.sandAttributeBytes = '0';
        rootRef.current.dataset.sandFineReliefMode = 'none';
        rootRef.current.dataset.sandShaderEnhanced = 'false';
        rootRef.current.dataset.sandShaderFallbackActive = 'false';
        rootRef.current.dataset.sandSnowOverlapCellCount = '0';
        rootRef.current.dataset.sandSnowOverlapVertexCount = '0';
        rootRef.current.dataset.totalTerrainDetailInstanceCount = '0';
        rootRef.current.dataset.totalTerrainDetailDrawCalls = '0';
        rootRef.current.dataset.forestPlacementSource = 'blocked';
        rootRef.current.dataset.sharedForestTreeCount = '0';
        rootRef.current.dataset.forestCanonicalTriangleCount = '0';
        rootRef.current.dataset.forestVisibleTriangleCount = '0';
        rootRef.current.dataset.forestFallbackType = 'none';
        rootRef.current.dataset.forestContactShadowCount = '0';
        rootRef.current.dataset.forestGroundingMode = 'none';
        rootRef.current.dataset.forestCanopyMotionState = 'static';
        rootRef.current.dataset.forestStructureCellCounts =
          '{"core":0,"body":0,"fringe":0,"clearing":0}';
        rootRef.current.dataset.forestCoreCellCount = '0';
        rootRef.current.dataset.forestBodyCellCount = '0';
        rootRef.current.dataset.forestFringeCellCount = '0';
        rootRef.current.dataset.forestClearingCellCount = '0';
        rootRef.current.dataset.forestSilhouetteCoverageRatio = '0';
        rootRef.current.dataset.forestSnowTintedTreeCount = '0';
        rootRef.current.dataset.forestDryTintedTreeCount = '0';
        rootRef.current.dataset.forestDecorativeRejectedBySand = '0';
        rootRef.current.dataset.forestDrylandRetainedCount = '0';
        rootRef.current.dataset.forestSandTintedTreeCount = '0';
        rootRef.current.dataset.forestDecorativeTreeCount = '0';
        rootRef.current.dataset.forestDecorativeTriangleCount = '0';
        rootRef.current.dataset.forestDecorativeDrawCalls = '0';
        rootRef.current.dataset.forestDecorativeCacheEntries = '0';
        rootRef.current.dataset.forestDecorativeCacheLimit = '0';
        rootRef.current.dataset.forestDecorativeCacheHighWaterMark = '0';
        rootRef.current.dataset.forestDecorativeRepackCount = '0';
        rootRef.current.dataset.forestDecorativeModelReady = 'false';
        rootRef.current.dataset.forestDecorativeUsingFallback = 'false';
        rootRef.current.dataset.forestDecorativeFallbackType = 'none';
        rootRef.current.dataset.forestDecorativeContactShadowCount = '0';
        rootRef.current.dataset.forestDecorativeGroundingMode = 'none';
        rootRef.current.dataset.forestDecorativeCanopyMotionState = 'static';
        rootRef.current.dataset.forestDecorativeStructureCellCounts =
          '{"core":0,"body":0,"fringe":0,"clearing":0}';
        rootRef.current.dataset.forestDecorativeCoreCellCount = '0';
        rootRef.current.dataset.forestDecorativeBodyCellCount = '0';
        rootRef.current.dataset.forestDecorativeFringeCellCount = '0';
        rootRef.current.dataset.forestDecorativeClearingCellCount = '0';
        rootRef.current.dataset.forestDecorativeSilhouetteCoverageRatio = '0';
        rootRef.current.dataset.forestDecorativeCanonicalTriangleCount = '0';
        rootRef.current.dataset.forestDecorativeOverviewHidden = 'true';
        rootRef.current.dataset.grassCandidateCellCount = '0';
        rootRef.current.dataset.grassActiveCellCount = '0';
        rootRef.current.dataset.grassInstanceCount = '0';
        rootRef.current.dataset.grassTriangleCount = '0';
        rootRef.current.dataset.grassDrawCalls = '0';
        rootRef.current.dataset.grassCacheEntries = '0';
        rootRef.current.dataset.grassCacheLimit = '0';
        rootRef.current.dataset.grassCacheHighWaterMark = '0';
        rootRef.current.dataset.grassRepackCount = '0';
        rootRef.current.dataset.grassAnimated = 'false';
        rootRef.current.dataset.grassTargetAnimationCadence = '0';
        rootRef.current.dataset.grassCandidateCellsByTerrain = '{}';
        rootRef.current.dataset.grassActiveCellsByTerrain = '{}';
        rootRef.current.dataset.grassCountsByTerrain = '{}';
        rootRef.current.dataset.grassAverageRetainedPatchesByTerrain = '{}';
        rootRef.current.dataset.grassPaletteLuminanceMin = '0';
        rootRef.current.dataset.grassPaletteLuminanceMax = '0';
        rootRef.current.dataset.grassPaletteDisplaySrgbSaturationMin = '0';
        rootRef.current.dataset.grassPaletteDisplaySrgbSaturationMax = '0';
        rootRef.current.dataset.grassPaletteGreenMin = '0';
        rootRef.current.dataset.grassPaletteGreenMax = '0';
        rootRef.current.dataset.grassShaderFallbackActive = 'false';
        rootRef.current.dataset.grassShaderFallbackCount = '0';
        rootRef.current.dataset.grassShaderFallbackReason = 'none';
        rootRef.current.dataset.grassCompletelyBareActiveCells = '0';
        rootRef.current.dataset.grassRejectedByStructureClearance = '0';
        rootRef.current.dataset.grassRejectedBySlope = '0';
        rootRef.current.dataset.grassRejectedBySnow = '0';
        rootRef.current.dataset.grassRetainedInSnowTransition = '0';
        rootRef.current.dataset.grassAverageSnowCoverageOfActiveCells = '0';
        rootRef.current.dataset.grassRejectedBySand = '0';
        rootRef.current.dataset.grassRetainedInDryTransition = '0';
        rootRef.current.dataset.grassActiveSandCellCount = '0';
        rootRef.current.dataset.grassAverageSandCoverageOfActiveCells = '0';
        rootRef.current.dataset.grassOverviewHidden = 'true';
        rootRef.current.dataset.labelBaseAnchorViolationCount = '0';
        rootRef.current.dataset.publicGoldSiteCount = String(goldNodeCatalog.length);
        rootRef.current.dataset.occupiedGoldSiteCount = '0';
        rootRef.current.dataset.renderedGoldMineCount = '0';
        rootRef.current.dataset.renderedGoldWagonCount = '0';
        rootRef.current.dataset.animatedGoldWagonCount = '0';
        rootRef.current.dataset.goldMarkerOnlySiteCount = String(goldNodeCatalog.length);
        rootRef.current.dataset.publicFoodSiteCount = String(foodNodeCatalog.length);
        rootRef.current.dataset.occupiedFoodSiteCount = '0';
        rootRef.current.dataset.renderedFoodFarmCount = '0';
        rootRef.current.dataset.renderedFoodWagonCount = '0';
        rootRef.current.dataset.animatedFoodWagonCount = '0';
        rootRef.current.dataset.foodMarkerOnlySiteCount = String(foodNodeCatalog.length);
        rootRef.current.dataset.publicWoodSiteCount = String(woodNodeCatalog.length);
        rootRef.current.dataset.occupiedWoodSiteCount = '0';
        rootRef.current.dataset.renderedWoodCampCount = '0';
        rootRef.current.dataset.renderedWoodWagonCount = '0';
        rootRef.current.dataset.animatedWoodWagonCount = '0';
        rootRef.current.dataset.woodMarkerOnlySiteCount = String(woodNodeCatalog.length);
        rootRef.current.dataset.publicStoneSiteCount = String(stoneNodeCatalog.length);
        rootRef.current.dataset.occupiedStoneSiteCount = '0';
        rootRef.current.dataset.renderedStoneQuarryCount = '0';
        rootRef.current.dataset.renderedStoneWagonCount = '0';
        rootRef.current.dataset.animatedStoneWagonCount = '0';
        rootRef.current.dataset.stoneMarkerOnlySiteCount = String(stoneNodeCatalog.length);
      }
      if (!replacingReadyScene) setVisibleCastleLabels([]);
      scene = createRealmScene({
        canvas,
        surface,
        keepCoord,
        ownCastleId: observerMode ? undefined : ownCastle.castleId,
        otherCastles: peerCastles,
        goldNodes: liveGatheringStateRef.current.goldNodes,
        foodNodes: liveGatheringStateRef.current.foodNodes,
        woodNodes: liveGatheringStateRef.current.woodNodes,
        stoneNodes: liveGatheringStateRef.current.stoneNodes,
        workers: workerSceneRecordsRef.current,
        waitForWorkerModelBeforeReady: presentationOnlyReplacement,
        resourceOccupants: resourceOccupantSceneRecords,
        resourceSiteWorldStates: liveGatheringStateRef.current.resourceSiteWorldStates,
        sharedForestLayout: sharedForestProjection.layout,
        sharedForestTrees: sharedForestProjection.trees,
        waterCells: stableWaterSceneInputs.cells,
        waterBodies: stableWaterSceneInputs.bodies,
        waterEnvironment: stableWaterSceneInputs.environment,
        realmId: snapshot.realm.realmId,
        rendererGeneration,
        // The retired local planner is exposed only to the synthetic dev
        // observer. Player scenes wait for the paired shared public tables.
        allowLegacyForestFallback: observerMode,
        terrainMetadata: projectedTileMetadata,
        quality: qualitySpec,
        reducedMotion,
        baseUrl: import.meta.env.BASE_URL || '/',
        isCoordPassable: isSceneCoordPassable,
        onCameraModeChange: (mode) => {
          pendingCameraMode = mode;
          if (candidatePresentationActive) setCameraMode(mode);
        },
        onHover: () => undefined,
        onTargetHover: handleSceneTargetHover,
        onKeepStatusChange: () => undefined,
        onCastlesReady: (castleCount) => {
          if (!scene || !constructionIsCurrent()) return;
          if (castleCount !== expectedCastleCountRef.current) {
            const failure: RealmRendererFailure = {
              code: 'castle-count-mismatch',
              retryable: true,
              phase: 'loading',
              message: `Expected ${expectedCastleCountRef.current} castles, received ${castleCount}.`
            };
            if (replacingReadyScene) {
              rejectCandidate(failure);
              return;
            }
            scene.setPresentationActive(false);
            nonblockingSceneReplacementRef.current = false;
            markRendererFailure(failure, rendererGeneration);
            return;
          }
          scene.reconcileLiveGatheringState?.(liveGatheringStateRef.current);
          if (!constructionIsCurrent()) return;
          let activationAttestation = retainedAttestation;
          if (
            replacingReadyScene
            && previousActiveScene !== null
            && previousActiveScene === sceneRef.current
          ) {
            try {
              activationAttestation = previousActiveScene.getCameraAttestation();
            } catch {
              // Retain the construction-time attestation if the active
              // renderer was interrupted during candidate preparation.
            }
          }
          let activationWorkerContinuity: RealmWorkerPresentationContinuityV1 | null =
            null;
          if (
            presentationOnlyReplacement
            && previousActiveScene !== null
            && previousActiveScene === sceneRef.current
          ) {
            try {
              activationWorkerContinuity =
                previousActiveScene.getWorkerPresentationContinuity();
            } catch {
              activationWorkerContinuity = null;
            }
          } else if (
            (
              recreationReason === 'renderer-recovery'
              || recreationReason === 'explicit-retry'
            )
            && workerPresentationContinuityRef.current?.topologyKey
              === sceneTopologyKey
          ) {
            activationWorkerContinuity =
              workerPresentationContinuityRef.current.snapshot;
          }
          if (activationWorkerContinuity) {
            // Presentation continuity is best-effort and renderer-only. A
            // rejected or stale snapshot leaves the candidate's current
            // authoritative Worker presentation untouched.
            try {
              scene.restoreWorkerPresentationContinuity(
                activationWorkerContinuity
              );
            } catch (error) {
              // A thrown restoration means the candidate renderer is no
              // longer trustworthy. Preserve a healthy presentation-only
              // predecessor, or retire the blocking candidate through the
              // normal bounded recovery lifecycle.
              if (!constructionIsCurrent()) return;
              rejectCandidate(classifyRealmRendererFailure(error, 'loading'));
              return;
            }
          }
          if (activationAttestation && scene.restoreCameraAttestation) {
            scene.restoreCameraAttestation(activationAttestation);
            rendererAttestationRef.current = activationAttestation;
            cameraAttestationRestoreCountRef.current += 1;
          }
          if (!constructionIsCurrent()) return;
          if (replacingReadyScene) {
            synchronizeLatestInteraction(scene, false);
            if (!constructionIsCurrent()) return;
            // Preflight the candidate's visible render synchronously while
            // the prior scene still owns all active refs. If this render
            // fails, rejectCandidate can retain a healthy presentation-only
            // predecessor without ever publishing candidate telemetry.
            scene.setPresentationActive(true);
            if (!constructionIsCurrent()) return;
          }
          const oldScene = replacingReadyScene ? previousActiveScene : null;
          const oldSlot = previousActiveSlot;
          sceneRef.current = scene;
          sceneSlotsRef.current[candidateSlot] = scene;
          activeRendererGenerationRef.current = rendererGeneration;
          candidatePresentationActive = true;
          // The first scene and every replacement share one explicit
          // presentation lifecycle. Opaque destinations keep the long-lived
          // renderer mounted but idle until the Realm is visible again.
          scene.setPresentationActive(!surfaceOpenRef.current);
          oldScene?.setPresentationActive(false);
          for (const slot of [0, 1] as const) {
            const slotCanvas = canvasSlotRefs.current[slot];
            if (slotCanvas) {
              slotCanvas.dataset.realmCanvasActive = String(slot === candidateSlot);
            }
          }
          if (pendingSceneConstructionRef.current?.scene === scene) {
            pendingSceneConstructionRef.current = null;
          }
          activeCanvasSlotRef.current = candidateSlot;
          canvasRef.current = canvas;
          setActiveCanvasSlot(candidateSlot);
          if (oldScene && oldScene !== scene) {
            if (sceneSlotsRef.current[oldSlot] === oldScene) {
              oldScene.dispose();
              sceneDisposalCountRef.current += 1;
              sceneSlotsRef.current[oldSlot] = null;
              rendererCanvasByGenerationRef.current.delete(previousActiveGeneration);
              rendererContextTelemetryByGenerationRef.current.delete(
                previousActiveGeneration
              );
              const latestRoot = rootRef.current;
              if (latestRoot) {
                latestRoot.dataset.realmSceneDisposalCount = String(
                  sceneDisposalCountRef.current
                );
              }
            }
          }
          if (replacingReadyScene) {
            publishBufferedCandidatePresentation();
            if (!constructionIsCurrent()) return;
          }
          sceneConstructionProfileRef.current = constructionProfile;
          workerPresentationContinuityRef.current = null;
          nonblockingSceneReplacementRef.current = false;
          rendererModeRef.current = 'webgl';
          if (rendererDeadlineRef.current?.generation === rendererGeneration) {
            clearRendererDeadline();
          }
          recoverySceneRebuildDeadlineKindRef.current = undefined;
          recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
          recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
          const activeLod = canvas.dataset.realmCastleActiveLod;
          lastSuccessfulRendererGenerationRef.current = rendererGeneration;
          if (firstReadyAtRef.current === null) {
            firstReadyAtRef.current = Math.max(0, Math.round(performance.now()));
          }
          const readyLifecycle = transitionRealmRendererLifecycle(rendererLifecycleRef.current, {
            type: 'ready',
            generation: rendererGeneration,
            degradedQuality: activeLod === 'compact' || activeLod === 'balanced'
              ? activeLod
              : undefined
          });
          rendererLifecycleRef.current = readyLifecycle;
          setRendererLifecycle(readyLifecycle);
          armRendererStabilityTimer(rendererGeneration);
          const currentRoot = rootRef.current;
          if (currentRoot) {
            currentRoot.dataset.realmFirstReady = 'true';
            currentRoot.dataset.realmFirstReadyAt = String(firstReadyAtRef.current);
            currentRoot.dataset.realmCameraAttestationRestoreCount = String(
              cameraAttestationRestoreCountRef.current
            );
          }
          updateSceneComposition();
        },
        onCastleLodChange: (activeLod) => {
          if (activeRendererGenerationRef.current !== rendererGeneration) return;
          const currentLifecycle = rendererLifecycleRef.current;
          // An optional model can settle while a WebGL context is lost. Its
          // presentation upgrade must not clear the recovering/failed state.
          if (currentLifecycle.state !== 'ready') return;
          const readyLifecycle = transitionRealmRendererLifecycle(currentLifecycle, {
            type: 'ready',
            generation: rendererGeneration,
            degradedQuality: activeLod === 'compact' || activeLod === 'balanced'
              ? activeLod
              : undefined
          });
          rendererLifecycleRef.current = readyLifecycle;
          setRendererLifecycle(readyLifecycle);
        },
        onCastlePresentationTelemetry: (telemetry) => {
          pendingCastleTelemetry = telemetry;
          if (candidatePresentationActive) updateCastlePresentationTelemetry(telemetry);
        },
        onGoldNodePresentationTelemetry: (telemetry) => {
          pendingGoldTelemetry = telemetry;
          if (candidatePresentationActive) updateGoldNodePresentationTelemetry(telemetry);
        },
        onFoodNodePresentationTelemetry: (telemetry) => {
          pendingFoodTelemetry = telemetry;
          if (candidatePresentationActive) updateFoodNodePresentationTelemetry(telemetry);
        },
        onWoodNodePresentationTelemetry: (telemetry) => {
          pendingWoodTelemetry = telemetry;
          if (candidatePresentationActive) updateWoodNodePresentationTelemetry(telemetry);
        },
        onStoneNodePresentationTelemetry: (telemetry) => {
          pendingStoneTelemetry = telemetry;
          if (candidatePresentationActive) updateStoneNodePresentationTelemetry(telemetry);
        },
        onTerrainPresentationTelemetry: (telemetry) => {
          pendingTerrainTelemetry = telemetry;
          if (candidatePresentationActive) updateTerrainPresentationTelemetry(telemetry);
        },
        onCastleProjection: (frame) => {
          pendingCastleProjection = frame;
          if (candidatePresentationActive) updateCastleProjection(frame);
        },
        onResourceProjection: (frame) => {
          pendingResourceProjection = frame;
          if (candidatePresentationActive) updateResourceProjection(frame);
        },
        onWorkerProjection: (frame) => {
          pendingWorkerProjection = frame;
          if (candidatePresentationActive) updateWorkerProjection(frame);
        },
        onRendererFailure: (failure) => {
          if (retired) return;
          if (
            scene !== null
            && sceneRef.current !== scene
            && pendingSceneConstructionRef.current?.scene !== scene
            && !sceneSlotsRef.current.some((candidate) => candidate === scene)
          ) return;
          const hiddenReplacementCandidate = (
            replacingReadyScene
            && (
              scene === null
              || sceneRef.current !== scene
            )
          );
          if (hiddenReplacementCandidate) {
            rejectCandidate(failure);
            return;
          }
          if (scene === null) {
            // createRealmScene can report and internally dispose a failed
            // synchronous construction before returning its handle. Retire
            // this attempt so that disposed handle is never installed below.
            retired = true;
            activeRendererGenerationRef.current = 0;
            sceneDisposalCountRef.current += 1;
            nonblockingSceneReplacementRef.current = false;
            updateSceneLifecycleTelemetry();
            markRendererFailure(failure.code === 'context-lost'
              ? {
                  ...failure,
                  code: 'scene-build-failed',
                  phase: 'loading',
                  message: 'The Realm scene lost its graphics context during construction.'
                }
              : failure, rendererGeneration);
            return;
          }
          const activeSceneOwnsFailure = (
            activeRendererGenerationRef.current === rendererGeneration
            && sceneRef.current === scene
            && sceneSlotsRef.current[candidateSlot] === scene
          );
          if (activeSceneOwnsFailure) {
            if (pendingSceneConstructionRef.current?.scene === scene) {
              pendingSceneConstructionRef.current = null;
            }
            if (failure.code !== 'context-lost') {
              retired = true;
              candidatePresentationActive = false;
              try {
                rendererAttestationRef.current = scene.getCameraAttestation();
              } catch {
                rendererAttestationRef.current = null;
              }
              try {
                const snapshot = scene.getWorkerPresentationContinuity();
                workerPresentationContinuityRef.current = snapshot
                  ? Object.freeze({ topologyKey: sceneTopologyKey, snapshot })
                  : null;
              } catch {
                workerPresentationContinuityRef.current = null;
              }
              sceneRef.current = null;
              sceneSlotsRef.current[candidateSlot] = null;
              activeRendererGenerationRef.current = 0;
              try {
                scene.setPresentationActive(false);
              } catch {
                // Ownership is already cleared; disposal remains authoritative.
              }
              try {
                scene.dispose();
              } catch {
                // Recovery must continue even if renderer cleanup is incomplete.
              }
              sceneDisposalCountRef.current += 1;
              const currentRoot = rootRef.current;
              if (currentRoot) {
                currentRoot.dataset.realmSceneDisposalCount = String(
                  sceneDisposalCountRef.current
                );
              }
            }
            nonblockingSceneReplacementRef.current = false;
            markRendererFailure(failure, rendererGeneration);
          }
        },
        onRendererContextRestored: () => {
          if (activeRendererGenerationRef.current !== rendererGeneration) return;
          captureRendererContextTelemetry(rendererGeneration, canvas.dataset);
          if (!clearRendererDeadline({
            generation: rendererGeneration,
            kind: 'context-restore'
          })) return;
          applyPendingEmergencyQuality(rendererGeneration);
          recoverySceneRebuildDeadlineKindRef.current = 'scene-rebuild';
          recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
          recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
          recoverySceneRebuildDeadlinePendingRef.current = true;
          requestedSceneRecreationReasonRef.current = 'renderer-recovery';
          rendererRecoveryNonceRef.current += 1;
          setRendererRecoveryNonce(rendererRecoveryNonceRef.current);
        },
        onRendererUnavailable: () => undefined,
        onSelect: () => undefined,
        onTargetSelect: handleSceneTargetSelect,
        onWorldSelectionFeedback: handleWorldSelectionFeedback
      });
      if (retired) return undefined;
      sceneSlotsRef.current[candidateSlot] = scene;
      pendingSceneConstructionRef.current = Object.freeze({
        key: sceneConstructionKey,
        recoveryNonce: rendererRecoveryNonce,
        generation: rendererGeneration,
        slot: candidateSlot,
        scene
      });
      if (!replacingReadyScene) {
        sceneRef.current = scene;
        activeCanvasSlotRef.current = candidateSlot;
        canvasRef.current = canvas;
        canvas.dataset.realmCanvasActive = 'true';
      }
      synchronizeLatestInteraction(scene, true);
    } catch (error) {
      if (replacingReadyScene) {
        rejectCandidate(classifyRealmRendererFailure(error, 'loading'));
      } else if (activeRendererGenerationRef.current === rendererGeneration) {
        retired = true;
        if (scene) {
          try {
            rendererAttestationRef.current = scene.getCameraAttestation();
          } catch {
            rendererAttestationRef.current = null;
          }
          if (pendingSceneConstructionRef.current?.scene === scene) {
            pendingSceneConstructionRef.current = null;
          }
          if (sceneRef.current === scene) sceneRef.current = null;
          for (const slot of [0, 1] as const) {
            if (sceneSlotsRef.current[slot] === scene) {
              sceneSlotsRef.current[slot] = null;
            }
          }
          try {
            scene.setPresentationActive(false);
          } catch {
            // Ownership is already cleared; disposal remains authoritative.
          }
          try {
            scene.dispose();
          } catch {
            // Report the original construction failure without masking it.
          }
        }
        activeRendererGenerationRef.current = 0;
        // createRealmScene internally retires its cleanup scope when it
        // throws before returning; assigned handles are retired above.
        sceneDisposalCountRef.current += 1;
        nonblockingSceneReplacementRef.current = false;
        updateSceneLifecycleTelemetry();
        markRendererFailure(
          classifyRealmRendererFailure(error, 'loading'),
          rendererGeneration
        );
      }
    }

    return () => {
      if (
        scene
        && (
          sceneRef.current === scene
          || pendingSceneConstructionRef.current?.scene === scene
        )
      ) {
        return;
      }
      retired = true;
      if (
        scene
        && sceneRef.current !== scene
        && sceneSlotsRef.current[candidateSlot] === scene
      ) {
        scene.dispose();
        sceneDisposalCountRef.current += 1;
        sceneSlotsRef.current[candidateSlot] = null;
        const currentRoot = rootRef.current;
        if (currentRoot) {
          currentRoot.dataset.realmSceneDisposalCount = String(
            sceneDisposalCountRef.current
          );
        }
      }
    };
  }, [
    applyPendingEmergencyQuality,
    armRendererDeadline,
    armRendererStabilityTimer,
    captureRendererContextTelemetry,
    clearRendererDeadline,
    clearRendererStabilityTimer,
    foodNodeCatalog,
    goldNodeCatalog,
    handleSceneTargetHover,
    handleSceneTargetSelect,
    handleWorldSelectionFeedback,
    isSceneCoordPassable,
    keepCoord,
    markRendererFailure,
    observerMode,
    ownCastle.castleId,
    peerCastles,
    projectedTileMetadata,
    qualitySpec,
    reducedMotion,
    rendererRecoveryNonce,
    sceneConstructionKey,
    sceneTopologyKey,
    sharedForestProjection,
    snapshot.realm.realmId,
    stableWaterSceneInputs,
    stoneNodeCatalog,
    surface,
    updateCastlePresentationTelemetry,
    updateCastleProjection,
    updateFoodNodePresentationTelemetry,
    updateGoldNodePresentationTelemetry,
    updateResourceProjection,
    updateSceneComposition,
    updateStoneNodePresentationTelemetry,
    updateTerrainPresentationTelemetry,
    updateWoodNodePresentationTelemetry,
    updateWorkerProjection,
    woodNodeCatalog
  ]);

  useEffect(() => {
    componentLifecycleEpochRef.current += 1;
    const lifecycleEpoch = componentLifecycleEpochRef.current;
    return () => {
      // React StrictMode rehearses an effect cleanup followed immediately by
      // another setup. Defer ownership retirement by one microtask so that
      // replay can advance the epoch and retain the one real renderer.
      queueMicrotask(() => {
        if (componentLifecycleEpochRef.current !== lifecycleEpoch) return;
        const scenes = new Set(sceneSlotsRef.current.filter(
          (candidate): candidate is RealmSceneHandle => candidate !== null
        ));
        for (const scene of scenes) {
          try {
            rendererAttestationRef.current = scene.getCameraAttestation();
          } catch {
            rendererAttestationRef.current = null;
          }
          scene.dispose();
          sceneDisposalCountRef.current += 1;
        }
        sceneSlotsRef.current = [null, null];
        pendingSceneConstructionRef.current = null;
        sceneRef.current = null;
        nonblockingSceneReplacementRef.current = false;
        workerPresentationContinuityRef.current = null;
        pendingNavigatorTargetRef.current = null;
        pendingNavigatorPermittedStackRef.current = null;
        activeRendererGenerationRef.current = 0;
        rendererCanvasByGenerationRef.current.clear();
        rendererContextTelemetryByGenerationRef.current.clear();
        clearRendererDeadline();
        clearRendererStabilityTimer();
        recoverySceneRebuildDeadlineKindRef.current = undefined;
        recoverySceneRebuildDeadlineExpiresAtRef.current = undefined;
        recoverySceneRebuildDeadlineWallExpiresAtRef.current = undefined;
      });
    };
  }, [clearRendererDeadline, clearRendererStabilityTimer]);

  useEffect(() => {
    sceneRef.current?.reconcileLiveGatheringState?.(liveGatheringState);
  }, [liveGatheringState]);

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
    sceneRef.current?.setSelectedStoneSiteId?.(inspectorStoneNode?.siteId ?? null);
  }, [inspectorStoneNode?.siteId]);

  useEffect(() => {
    sceneRef.current?.setSelectedWorkerId?.(
      inspectorWorker?.workerId ?? null
    );
  }, [inspectorWorker?.workerId]);

  useEffect(() => {
    sceneRef.current?.setSelectedWorkerRouteId?.(
      selectedWorkerRouteId ?? null
    );
  }, [selectedWorkerRouteId]);

  useEffect(() => {
    sceneRef.current?.setSelectedWaterCellKey?.(inspectorWater?.cellKey ?? null);
  }, [inspectorWater?.cellKey]);

  useEffect(() => {
    sceneRef.current?.setPresentationActive(!surfaceOpen);
    const root = rootRef.current;
    if (root) {
      root.dataset.realmMapPresentationActive = String(!surfaceOpen);
    }
  }, [surfaceOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      // Treat one physical Escape press as one hierarchy step. Ignoring the
      // browser's auto-repeat prevents a held key from closing a surface and
      // then immediately returning the player to the menu.
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
      if (
        interactionRef.current.navigatorOpen
        && surfaceNavigation.current?.kind === 'explore'
      ) {
        event.preventDefault();
        backSurface();
        return;
      }
      if (surfaceNavigation.depth > 0) {
        event.preventDefault();
        backSurface();
        return;
      }
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
  }, [
    backSurface,
    onRequestReturn,
    surfaceNavigation.current,
    surfaceNavigation.depth
  ]);

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

  const closeInspectorSurface = useCallback(() => {
    if (historyBackedWorldRoute) {
      closeSurfacesToRealm();
      return;
    }
    dispatchInteraction({ type: 'close-inspector' });
  }, [closeSurfacesToRealm, historyBackedWorldRoute]);

  const closeNavigatorSurface = useCallback((reason: RealmNavigatorCloseReason) => {
    if (surfaceNavigation.current?.kind === 'explore') {
      if (reason === 'camera-preset') closeSurfacesToRealm();
      else backSurface();
      return;
    }
    dispatchInteraction({ type: 'close-navigator' });
  }, [
    backSurface,
    closeSurfacesToRealm,
    surfaceNavigation.current
  ]);

  const focusResourceOccupantCastleFromSurface = useCallback((
    marker: RealmResourceOccupantMarker
  ) => {
    if (historyBackedWorldRoute) closeSurfacesToRealm();
    focusResourceOccupantCastle(marker);
  }, [
    closeSurfacesToRealm,
    focusResourceOccupantCastle,
    historyBackedWorldRoute
  ]);

  const locateWorkerFromSurface = useCallback((workerId: string) => {
    if (historyBackedWorldRoute) closeSurfacesToRealm();
    locateWorkerAtCurrentPosition(workerId);
  }, [
    closeSurfacesToRealm,
    historyBackedWorldRoute,
    locateWorkerAtCurrentPosition
  ]);

  const locateWorkerKeeperFromSurface = useCallback((castleId: number) => {
    if (historyBackedWorldRoute) closeSurfacesToRealm();
    locateWorkerKeeper(castleId);
  }, [
    closeSurfacesToRealm,
    historyBackedWorldRoute,
    locateWorkerKeeper
  ]);

  const focusWaterRecordFromSurface = useCallback((cellKey: string) => {
    if (historyBackedWorldRoute) closeSurfacesToRealm();
    focusWaterRecordByKey(cellKey);
  }, [
    closeSurfacesToRealm,
    focusWaterRecordByKey,
    historyBackedWorldRoute
  ]);

  const queueNavigatorTarget = useCallback((target: PendingNavigatorTarget) => {
    const pendingTarget = Object.freeze({
      ...target,
      coord: Object.freeze({ ...target.coord })
    }) as PendingNavigatorTarget;
    const historyBackRequired = surfaceNavigation.current?.kind === 'explore';
    if (historyBackRequired) {
      closeSurfacesToRealm();
    } else {
      dispatchInteraction({ type: 'close-navigator' });
    }
    if (historyBackRequired) {
      pendingNavigatorTargetRef.current = pendingTarget;
      pendingNavigatorPermittedStackRef.current = surfaceNavigation.stack;
      return;
    }
    if (sceneRef.current === null) {
      activatePendingNavigatorTarget(pendingTarget);
      return;
    }
    pendingNavigatorTargetRef.current = pendingTarget;
    pendingNavigatorPermittedStackRef.current = surfaceNavigation.stack;
  }, [
    activatePendingNavigatorTarget,
    closeSurfacesToRealm,
    surfaceNavigation.current,
    surfaceNavigation.stack
  ]);

  const selectFromNavigator = useCallback((coord: HexCoord) => {
    // A browser-restored Explore route remains history-backed even if it is
    // now presented on desktop. Retire the complete branch before the
    // deferred camera command may settle; otherwise a nested ancestor can
    // retain the target and replay it unexpectedly much later.
    queueNavigatorTarget({ kind: 'cell', coord });
  }, [queueNavigatorTarget]);

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
      } else if (stoneNodeAtSelectedCell) {
        selectStoneNode(stoneNodeAtSelectedCell);
      } else if (waterAtSelectedCell) {
        selectWaterCell(waterAtSelectedCell);
      } else if (fullscreenDestinations) {
        pushWorldSurface({ kind: 'terrain', tileKey: hexKey(selectedCoord) });
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

  // The scene mirrors these counters onto the canvas so a context event can
  // be diagnosed without exposing implementation details in user copy.
  const rendererDiagnosticFailure = rendererLifecycle.failure
    ?? rendererLifecycle.lastFailure;
  const rendererContextLossCount = String(rendererContextLossCountRef.current);
  const rendererContextRestoreCount = String(rendererContextRestoreCountRef.current);
  const blockingLoadingOverlayVisible = (
    rendererLifecycle.state !== 'ready'
    && rendererLifecycle.state !== 'static-unsupported'
    && rendererLifecycle.state !== 'static-degraded'
    && !nonblockingSceneReplacementRef.current
  );
  const nonblockingSceneUpdateVisible = (
    rendererLifecycle.state === 'loading'
    && nonblockingSceneReplacementRef.current
  );
  const rendererRecoveryLoading = (
    rendererLifecycle.state === 'recovering'
    || (
      rendererLifecycle.state === 'loading'
      && rendererLifecycle.lastFailure !== undefined
      && !nonblockingSceneReplacementRef.current
    )
  );
  return (
    <main
      ref={rootRef}
      className="realm-map-screen"
      data-presentation-mode={observerMode ? 'observer' : 'player'}
      data-realm-chrome-mode={chromeMode}
      data-realm-surface-presentation={surfacePresentation}
      data-realm-surface-depth={String(surfaceNavigation.depth)}
      data-realm-surface-motion={surfaceNavigation.motion ?? 'idle'}
      data-realm-camera-mode={cameraMode}
      data-realm-camera-presentation-band={realmCameraPresentationBand(cameraMode)}
      data-realm-camera-target-kind={interaction.cameraTarget.kind}
      data-realm-selected-cell-key={hexKey(selectedCoord)}
      data-water-navigation-status={waterNavigationGraph.telemetry.status}
      data-water-navigation-node-count={String(waterNavigationGraph.telemetry.nodeCount)}
      data-water-navigation-river-node-count={String(
        waterNavigationGraph.telemetry.riverNodeCount
      )}
      data-water-navigation-ocean-node-count={String(
        waterNavigationGraph.telemetry.oceanNodeCount
      )}
      data-water-navigation-issue-count={String(
        waterNavigationGraph.telemetry.issueCount
      )}
      data-renderer={rendererMode}
      data-renderer-state={rendererLifecycle.state}
      data-renderer-ever-ready={String(rendererLifecycle.everReady)}
      data-renderer-recovery-attempt={String(rendererLifecycle.attempt)}
      data-renderer-failure={rendererLifecycle.failure?.code ?? 'none'}
      data-renderer-failure-code={rendererLifecycle.failure?.code ?? 'none'}
      data-renderer-last-failure-code={rendererLifecycle.lastFailure?.code ?? 'none'}
      data-renderer-generation={String(rendererLifecycle.generation)}
      data-renderer-deadline-kind={rendererDeadlineRef.current?.kind ?? 'none'}
      data-renderer-requested-quality={requestedQuality}
      data-renderer-emergency-quality={emergencyQualityCeiling ?? 'none'}
      data-renderer-effective-quality={quality}
      data-renderer-last-successful-generation={String(lastSuccessfulRendererGenerationRef.current)}
      data-renderer-context-loss-count={rendererContextLossCount}
      data-renderer-context-restore-count={rendererContextRestoreCount}
      data-renderer-degraded-quality={rendererLifecycle.degradedQuality ?? 'none'}
      data-realm-scene-creation-count={String(sceneCreationCountRef.current)}
      data-realm-scene-disposal-count={String(sceneDisposalCountRef.current)}
      data-realm-scene-replacement-failure-count={String(
        sceneReplacementFailureCountRef.current
      )}
      data-realm-last-scene-recreation-reason={lastSceneRecreationReasonRef.current}
      data-realm-first-ready={String(rendererLifecycle.everReady)}
      data-realm-first-ready-at={String(firstReadyAtRef.current ?? 0)}
      data-realm-blocking-loading-overlay-visible={String(blockingLoadingOverlayVisible)}
      data-realm-camera-attestation-restore-count={String(
        cameraAttestationRestoreCountRef.current
      )}
      data-worker-private-sync-phase={
        observerMode ? 'not-required' : workerPrivateSync?.phase ?? 'not-required'
      }
      data-worker-private-sync-commands-enabled={String(
        !observerMode && (workerPrivateSync?.commandsEnabled ?? false)
      )}
      data-quality={quality}
      tabIndex={surfaceOpen ? -1 : 0}
      aria-label={observerMode ? 'Hegemony realm QA observer' : 'Hegemony realm'}
      aria-describedby={surfaceOpen ? undefined : REALM_KEYBOARD_INSTRUCTIONS_ID}
      aria-busy={rendererLifecycle.state === 'probing'
        || rendererLifecycle.state === 'loading'
        || rendererLifecycle.state === 'recovering'}
      onKeyDown={surfaceOpen ? undefined : handleKeyDown}
    >
      <p
        aria-hidden={surfaceOpen || undefined}
        className="warpkeep-visually-hidden"
        id={REALM_KEYBOARD_INSTRUCTIONS_ID}
      >
        {observerMode
          ? 'Use the arrow keys to move the selected cell. Press Enter or Space to inspect the selected castle, resource, or water cell. Press Home to show the whole realm. Press Escape to close the current panel or exit the observer.'
          : 'Use the arrow keys to move the selected cell. Press Enter or Space to inspect the selected castle, resource, or water cell. Press Home to return to your keep. Press Escape to close the current panel or return to the menu.'}
      </p>
      <div className="realm-safe-area-probe" aria-hidden="true" />
      {([
        activeCanvasSlot,
        activeCanvasSlot === 0 ? 1 : 0
      ] as const).map((slot) => (
        <canvas
          key={`realm-canvas-${slot}-${canvasSlotEpochs[slot]}`}
          ref={slot === 0 ? setPrimaryCanvasRef : setSecondaryCanvasRef}
          className="realm-map-screen__canvas"
          data-realm-canvas-active={String(slot === activeCanvasSlot)}
          data-realm-canvas-epoch={String(canvasSlotEpochs[slot])}
          data-realm-canvas-slot={String(slot)}
          aria-hidden="true"
        />
      ))}
      {worldSelectionFeedback ? (
        <span
          aria-hidden="true"
          className="realm-world-selection-feedback"
          data-realm-world-selection-feedback="true"
          key={worldSelectionFeedback.sequence}
          style={{
            '--realm-selection-feedback-x': `${worldSelectionFeedback.x}px`,
            '--realm-selection-feedback-y': `${worldSelectionFeedback.y}px`
          } as CSSProperties}
        />
      ) : null}

      {rendererMode === 'fallback' ? (
        <div
          aria-hidden={surfaceOpen || undefined}
          className="realm-map-screen__fallback"
          data-testid="realm-static-fallback"
          inert={surfaceOpen || undefined}
        >
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
              {visibleFallbackFoundations.map((foundation) => (
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
              {visibleFallbackFoundations.map((foundation) => (
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
            {!observerMode && fallbackVisibleCastleIds.has(ownCastle.castleId) ? (
              <g
                className="realm-map-screen__fallback-keep"
                data-castle-id={ownCastle.castleId}
                data-testid="realm-keep-marker"
                aria-label={observerMode
                  ? `Your Hegemony keep at cell ${keepCoord.q},${keepCoord.r}`
                  : 'Your Hegemony keep'}
                transform={`translate(${axialToWorld(keepCoord, HEX_SIZE).x} ${-axialToWorld(keepCoord, HEX_SIZE).z})`}
              >
                <path d="M-0.55 0.36V-0.28H-0.36V-0.52H-0.18V-0.28H0.18V-0.52H0.36V-0.28H0.55V0.36Z" fill="#ddd0ad" stroke="#5b4936" strokeWidth="0.035" />
                <path d="M-0.64 0.36H0.64L0.52 0.5H-0.52Z" fill="#766146" />
                <path d="M-0.11 0.36V0.02Q0-0.11 0.11 0.02V0.36Z" fill="#433c32" />
                <path d="M-0.52-0.28L-0.36-0.62L-0.2-0.28M0.2-0.28L0.36-0.62L0.52-0.28" fill="#a58949" stroke="#5b4936" strokeWidth="0.025" />
              </g>
            ) : null}
            {peerCastles.filter((castle) => (
              fallbackVisibleCastleIds.has(castle.castleId)
            )).map((castle) => {
              const world = axialToWorld({ q: castle.q, r: castle.r }, HEX_SIZE);
              return (
                <g
                  aria-label={observerMode
                    ? `Hegemony castle marker at cell ${castle.q},${castle.r}`
                    : 'Hegemony castle marker'}
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
            <g aria-hidden="true" className="realm-map-screen__fallback-stone-sites">
              {stoneNodes.map((node) => {
                const world = axialToWorld(node.coord, HEX_SIZE);
                const occupied = node.availability !== 'available'
                  && node.availability !== 'unavailable';
                return (
                  <g
                    data-site-state={node.availability}
                    data-stone-site-id={node.siteId}
                    key={node.siteId}
                    transform={`translate(${world.x} ${-world.z})`}
                  >
                    {occupied ? (
                      <circle
                        fill="none"
                        r="0.34"
                        stroke="#e0b7ff"
                        strokeOpacity="0.94"
                        strokeWidth="0.045"
                      />
                    ) : null}
                    <path
                      d="M-0.28 0.25L-0.2 -0.2L0 -0.34L0.24 -0.16L0.28 0.25Z"
                      fill={node.availability === 'unavailable' ? '#77747c' : '#a69db3'}
                      stroke="#494451"
                      strokeWidth="0.04"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M-0.12 0.06L0.02 -0.18L0.14 0.08"
                      fill="none"
                      stroke="#eee7ff"
                      strokeLinecap="round"
                      strokeWidth="0.035"
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      ) : null}

      {rendererMode === 'fallback' ? (
        <div
          aria-hidden={surfaceOpen || undefined}
          className="realm-map-screen__fallback-copy"
          inert={surfaceOpen || undefined}
        >
          <RealmRendererRecoveryPanel
            attempt={rendererLifecycle.attempt}
            contextLossCount={rendererContextLossCount}
            contextRestoreCount={rendererContextRestoreCount}
            effectiveQuality={quality}
            emergencyQuality={emergencyQualityCeiling}
            everReady={rendererLifecycle.everReady}
            failure={rendererDiagnosticFailure}
            generation={rendererLifecycle.generation}
            host={chromeMode === 'miniapp' ? 'miniapp' : 'web'}
            mode="fallback"
            observerMode={observerMode}
            onRetry={retryRenderer}
            onReturn={onRequestReturn}
            requestedQuality={requestedQuality}
            webgl2Available={rendererWebGLProbeAvailableRef.current}
          />
        </div>
      ) : null}

      {blockingLoadingOverlayVisible ? (
        <div
          aria-hidden={surfaceOpen || undefined}
          className={`realm-map-screen__loading realm-map-screen__loading--${rendererLifecycle.state}`}
          aria-label="Preparing Hegemony realm"
          inert={surfaceOpen || undefined}
        >
          {rendererLifecycle.state === 'failed' || rendererRecoveryLoading ? (
            <RealmRendererRecoveryPanel
              attempt={rendererLifecycle.attempt}
              contextLossCount={rendererContextLossCount}
              contextRestoreCount={rendererContextRestoreCount}
              effectiveQuality={quality}
              emergencyQuality={emergencyQualityCeiling}
              everReady={rendererLifecycle.everReady}
              failure={rendererDiagnosticFailure}
              generation={rendererLifecycle.generation}
              host={chromeMode === 'miniapp' ? 'miniapp' : 'web'}
              mode={rendererLifecycle.state === 'failed' ? 'failed' : 'recovering'}
              observerMode={observerMode}
              onRetry={rendererLifecycle.state === 'failed' ? retryRenderer : undefined}
              onReturn={onRequestReturn}
              requestedQuality={requestedQuality}
              webgl2Available={rendererWebGLProbeAvailableRef.current}
            />
          ) : (
            <div>
              <strong role="status">Surveying the bright lowlands…</strong>
              <span>Preparing every canonical castle before the realm is revealed.</span>
              <button type="button" onClick={onRequestReturn}>
                {observerMode ? 'Close QA Observer' : 'Return to Menu'}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {nonblockingSceneUpdateVisible ? (
        <div
          aria-hidden={surfaceOpen || undefined}
          className="realm-map-screen__visual-update"
          role="status"
        >
          Updating Realm visuals…
        </div>
      ) : null}

      {rendererMode !== 'loading' ? (
        <>
          <div
            aria-hidden={surfaceOpen || undefined}
            className="realm-map-screen__world-markers"
            inert={surfaceOpen || undefined}
          >
            <RealmCastleLabels
              labels={latestVisibleCastleLabelsRef.current}
              records={profileRecords}
              selectedCastleId={selectedCastle?.castleId}
              inspectorCastleId={inspectorCastle?.castleId}
              focusedCastleId={focusedCastleId}
              hoveredCastleId={hoveredCastleIdRef.current}
              ownCastleId={observerMode ? undefined : ownCastle.castleId}
              showDiagnostics={observerMode}
              inspectorId={inspectorId}
              inspectorOpen={interaction.inspectorOpen}
              onActivate={selectCastle}
            />

            <RealmWorkerPresenceMarkers
              focusFallbackRef={rootRef}
              selectedWorkerId={selectedWorkerRouteId}
              workers={workerSceneRecords}
              visibleWorkerIds={visibleWorkerPresenceIds}
              onHover={hoverWorkerPresence}
              onLayout={applyLatestWorkerProjection}
              onSelect={selectWorkerAtCurrentPosition}
            />

            <RealmResourceOccupantMarkers
              markers={resourceOccupantMarkers}
              showDiagnostics={observerMode}
              presenceMarkerKeys={visibleResourceOccupantPresenceKeys}
              selectedMarkerKey={selectedResourceOccupantKey}
              visibleMarkerKeys={visibleResourceOccupantKeys}
              onHover={hoverResourceOccupant}
              onMarkerLayout={applyLatestResourceProjection}
              onSelect={selectResourceOccupant}
            />
          </div>

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
              profileTriggerRef={navigatorTriggerRef}
              foundedCastleCount={navigatorCastles.length}
              graphicsPreference={graphicsPreference}
              resolvedGraphicsQuality={resolvedGraphicsQuality}
              audioMuted={audioMuted}
              onGraphicsPreferenceChange={onGraphicsPreferenceChange}
              onAudioMutedChange={onAudioMutedChange}
              onRequestExplore={openNavigator}
              resourceSites={navigatorResourceSites}
              onOpenResourceSite={openNavigatorResourceSite}
              showDiagnostics={observerMode}
              activeWagons={activeWagons}
              onOpenActiveWagon={openActiveWagon}
              publicWorkerSystemActive={
                snapshot.workerSystem?.mode === 'active'
              }
              publicWorkerProjection={publicWorkerProjection}
              workerProjection={observerMode ? undefined : workerProjection}
              workerRoster={observerMode ? undefined : workerRoster}
              workerResourceState={observerMode ? undefined : workerResourceState}
              workerPrivateSync={observerMode ? undefined : workerPrivateSync}
              onRetryWorkerPrivateSync={
                observerMode ? undefined : onRetryWorkerPrivateSync
              }
              onLocateWorker={observerMode ? undefined : locateWorkerAtCurrentPosition}
              awaitingRecallWorkerIds={[
                ...workerRecallLifecycle.awaitingWorkerIds
              ]}
              recallAllAwaitingAuthority={
                workerRecallLifecycle.recallAllAwaitingAuthority
              }
              onRecallWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : guardedRecallWorker
              }
              onRecallAllWorkers={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : guardedRecallAllWorkers
              }
              keepCoord={keepCoord}
              selectedCell={selectedCell}
              selectedTerrainKind={selectedTerrainKind}
              selectedCastle={selectedCastle}
              selectedCastleProfile={selectedCastle
                ? profileRecords.get(selectedCastle.castleId)?.profile
                : undefined}
              onRecenterKeep={recenterKeep}
              onRequestReturn={onRequestReturn}
              chromeMode={chromeMode}
              surfaceNavigation={surfaceNavigation}
            />
          )}

          {inspectorCastle && profileRecords.get(inspectorCastle.castleId) ? (
            <CastleInspectionPanel
              id={inspectorId}
              castle={inspectorCastle}
              profile={profileRecords.get(inspectorCastle.castleId)!.profile}
              own={!observerMode && inspectorCastle.ownerFid === identity.fid}
              observer={observerMode}
              hostedDestination={fullscreenDestinations}
              onRequestBack={historyBackedWorldRoute && surfaceNavigation.depth > 1
                ? backSurface
                : undefined}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={closeInspectorSurface}
            />
          ) : null}

          {inspectorGoldNode ? (
            <GoldMineInspectionPanel
              id={`${inspectorId}-gold-${inspectorGoldNode.siteId}`}
              mine={{ name: 'Gold Mine', tier: inspectorGoldNode.tier }}
              node={inspectorGoldNode}
              workers={observerMode || publicWorkerProjection?.mode !== 'active'
                ? undefined
                : publicOwnedWorkers}
              onDispatchWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : onDispatchWorker
              }
              workerControlsStatus={workerControlsStatus}
              publicOccupant={inspectorGoldOccupant}
              showDiagnostics={observerMode}
              occupancyUnavailable={resourceOccupancyUnavailable}
              onFocusOccupantCastle={focusResourceOccupantCastleFromSurface}
              workerRecallAwaitingAuthority={
                workerRecallLifecycle.recallAllAwaitingAuthority
                || (
                  inspectorGoldOccupant?.workerId !== undefined
                  && workerRecallLifecycle.awaitingWorkerIds.has(
                    inspectorGoldOccupant.workerId
                  )
                )
              }
              onRecallWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : guardedRecallWorker
              }
              legacyExpeditionId={observerMode
                ? undefined
                : inspectorGoldLegacyExpeditionId}
              onReturnLegacyExpedition={observerMode || !legacyExpeditionReturnAvailable
                ? undefined
                : onReturnLegacyExpedition}
              legacyDispatchBlocked={legacyResourceDispatchBlocked}
              privateExpedition={observerMode ? undefined : goldExpedition}
              onDispatchGoldExpedition={
                observerMode || legacyResourceDispatchBlocked
                  ? undefined
                  : onDispatchGoldExpedition
              }
              hostedDestination={fullscreenDestinations}
              onRequestBack={historyBackedWorldRoute && surfaceNavigation.depth > 1
                ? backSurface
                : undefined}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={closeInspectorSurface}
            />
          ) : null}

          {inspectorFoodNode ? (
            <FoodFarmInspectionPanel
              id={`${inspectorId}-food-${inspectorFoodNode.siteId}`}
              farm={{ name: 'Wheat Farm', tier: inspectorFoodNode.tier }}
              node={inspectorFoodNode}
              workers={observerMode || publicWorkerProjection?.mode !== 'active'
                ? undefined
                : publicOwnedWorkers}
              onDispatchWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : onDispatchWorker
              }
              workerControlsStatus={workerControlsStatus}
              publicOccupant={inspectorFoodOccupant}
              showDiagnostics={observerMode}
              occupancyUnavailable={resourceOccupancyUnavailable}
              onFocusOccupantCastle={focusResourceOccupantCastleFromSurface}
              workerRecallAwaitingAuthority={
                workerRecallLifecycle.recallAllAwaitingAuthority
                || (
                  inspectorFoodOccupant?.workerId !== undefined
                  && workerRecallLifecycle.awaitingWorkerIds.has(
                    inspectorFoodOccupant.workerId
                  )
                )
              }
              onRecallWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : guardedRecallWorker
              }
              legacyExpeditionId={observerMode
                ? undefined
                : inspectorFoodLegacyExpeditionId}
              onReturnLegacyExpedition={observerMode || !legacyExpeditionReturnAvailable
                ? undefined
                : onReturnLegacyExpedition}
              legacyDispatchBlocked={legacyResourceDispatchBlocked}
              privateExpedition={observerMode ? undefined : foodExpedition}
              onDispatchFoodExpedition={
                observerMode || legacyResourceDispatchBlocked
                  ? undefined
                  : onDispatchFoodExpedition
              }
              hostedDestination={fullscreenDestinations}
              onRequestBack={historyBackedWorldRoute && surfaceNavigation.depth > 1
                ? backSurface
                : undefined}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={closeInspectorSurface}
            />
          ) : null}

          {inspectorWoodNode ? (
            <LoggingCampInspectionPanel
              id={`${inspectorId}-wood-${inspectorWoodNode.siteId}`}
              camp={{ name: 'Logging Camp', tier: inspectorWoodNode.tier }}
              node={inspectorWoodNode}
              workers={observerMode || publicWorkerProjection?.mode !== 'active'
                ? undefined
                : publicOwnedWorkers}
              onDispatchWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : onDispatchWorker
              }
              workerControlsStatus={workerControlsStatus}
              publicOccupant={inspectorWoodOccupant}
              showDiagnostics={observerMode}
              occupancyUnavailable={resourceOccupancyUnavailable}
              onFocusOccupantCastle={focusResourceOccupantCastleFromSurface}
              workerRecallAwaitingAuthority={
                workerRecallLifecycle.recallAllAwaitingAuthority
                || (
                  inspectorWoodOccupant?.workerId !== undefined
                  && workerRecallLifecycle.awaitingWorkerIds.has(
                    inspectorWoodOccupant.workerId
                  )
                )
              }
              onRecallWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : guardedRecallWorker
              }
              legacyExpeditionId={observerMode
                ? undefined
                : inspectorWoodLegacyExpeditionId}
              onReturnLegacyExpedition={observerMode || !legacyExpeditionReturnAvailable
                ? undefined
                : onReturnLegacyExpedition}
              legacyDispatchBlocked={legacyResourceDispatchBlocked}
              privateExpedition={observerMode ? undefined : woodExpedition}
              onDispatchWoodExpedition={
                observerMode || legacyResourceDispatchBlocked
                  ? undefined
                  : onDispatchWoodExpedition
              }
              hostedDestination={fullscreenDestinations}
              onRequestBack={historyBackedWorldRoute && surfaceNavigation.depth > 1
                ? backSurface
                : undefined}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={closeInspectorSurface}
            />
          ) : null}

          {inspectorStoneNode ? (
            <StoneQuarryInspectionPanel
              id={`${inspectorId}-stone-${inspectorStoneNode.siteId}`}
              quarry={{ name: 'Stone Quarry', tier: inspectorStoneNode.tier }}
              node={inspectorStoneNode}
              workers={observerMode || publicWorkerProjection?.mode !== 'active'
                ? undefined
                : publicOwnedWorkers}
              onDispatchWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : onDispatchWorker
              }
              workerControlsStatus={workerControlsStatus}
              publicOccupant={inspectorStoneOccupant}
              showDiagnostics={observerMode}
              occupancyUnavailable={resourceOccupancyUnavailable}
              onFocusOccupantCastle={focusResourceOccupantCastleFromSurface}
              workerRecallAwaitingAuthority={
                workerRecallLifecycle.recallAllAwaitingAuthority
                || (
                  inspectorStoneOccupant?.workerId !== undefined
                  && workerRecallLifecycle.awaitingWorkerIds.has(
                    inspectorStoneOccupant.workerId
                  )
                )
              }
              onRecallWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : guardedRecallWorker
              }
              legacyExpeditionId={observerMode
                ? undefined
                : inspectorStoneLegacyExpeditionId}
              onReturnLegacyExpedition={observerMode || !legacyExpeditionReturnAvailable
                ? undefined
                : onReturnLegacyExpedition}
              legacyDispatchBlocked={legacyResourceDispatchBlocked}
              privateExpedition={observerMode ? undefined : stoneExpedition}
              onDispatchStoneExpedition={
                observerMode || legacyResourceDispatchBlocked
                  ? undefined
                  : onDispatchStoneExpedition
              }
              hostedDestination={fullscreenDestinations}
              onRequestBack={historyBackedWorldRoute && surfaceNavigation.depth > 1
                ? backSurface
                : undefined}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={closeInspectorSurface}
            />
          ) : null}

          {inspectorWorker ? (
            <WorkerInspectionPanel
              awaitingAuthoritativeRecall={
                workerRecallLifecycle.recallAllAwaitingAuthority
                || workerRecallLifecycle.awaitingWorkerIds.has(
                  inspectorWorker.workerId
                )
              }
              focusTargetRef={workerInspectorFocusRef}
              id={`${inspectorId}-worker-${inspectorWorker.workerId}`}
              keeperProfile={profileRecords.get(inspectorWorker.originCastleId)?.profile}
              onLocateKeeper={locateWorkerKeeperFromSurface}
              onLocateWorker={locateWorkerFromSurface}
              onRecallWorker={
                observerMode || !publicWorkerPresentationReady
                  ? undefined
                  : guardedRecallWorker
              }
              controlsStatus={workerControlsStatus}
              onCloseToRealm={historyBackedWorldRoute
                ? closeSurfacesToRealm
                : undefined}
              onRequestClose={historyBackedWorldRoute
                ? backSurface
                : closeInspectorSurface}
              resourceTargetLabel={inspectorWorkerResourceTargetLabel}
              worker={inspectorWorker}
              hostedDestination={fullscreenDestinations}
            />
          ) : null}

          {inspectorWater ? (
            <WaterInspectionPanel
              id={`${inspectorId}-water-${inspectorWater.cellKey}`}
              record={inspectorWater}
              navigation={inspectorWaterNavigation}
              showDiagnostics={observerMode}
              hostedDestination={fullscreenDestinations}
              focusTargetRef={inspectorFocusRef}
              onRequestClose={closeInspectorSurface}
              onRequestBack={historyBackedWorldRoute && surfaceNavigation.depth > 1
                ? backSurface
                : undefined}
              onSelectCell={selectWaterRecordByKey}
              onFocusCell={focusWaterRecordFromSurface}
              onViewUnderlyingCell={observerMode && inspectorWater.underlyingTileKey
                ? () => selectCoord(inspectorWater.coord)
                : undefined}
            />
          ) : null}

          {historyBackedWorldRoute && terrainSurfaceRoute && terrainSurfaceCell ? (
            <RealmTerrainInspectionPanel
              onBack={backSurface}
              onCloseToRealm={closeSurfacesToRealm}
              onLocate={() => {
                closeSurfacesToRealm();
                sceneRef.current?.locateCell(terrainSurfaceCell.coord);
                dispatchInteraction({
                  type: 'set-camera-target',
                  target: {
                    kind: 'cell-location',
                    coord: terrainSurfaceCell.coord
                  }
                });
              }}
              passable={terrainSurfaceMetadata?.passable}
              terrainKind={terrainSurfaceKind}
            />
          ) : null}

          <RealmAccessibilityControls
            id={navigatorId}
            open={interaction.navigatorOpen}
            castles={navigatorCastles}
            workers={navigatorWorkers}
            resourceSites={navigatorResourceSites}
            waterBodies={navigatorWaterBodies}
            ownCastleId={observerMode ? undefined : ownCastle.castleId}
            selectedCastleId={selectedCastle?.castleId}
            selectedWorkerId={inspectorWorker?.workerId}
            selectedResourceKey={selectedNavigatorResourceKey}
            triggerRef={navigatorTriggerRef}
            triggerVisible={observerMode}
            showDiagnostics={observerMode}
            hostedDestination={fullscreenDestinations}
            hostedNavigationResetKey={`${identity.fid}:${navigatorOpenGeneration}`}
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
            onRequestOpen={openNavigator}
            onRequestClose={closeNavigatorSurface}
            onActivateCastle={(entry) => {
              const castle = allCastles.find((candidate) => candidate.castleId === entry.castleId);
              if (!castle) return;
              if (fullscreenDestinations) {
                selectCastle(castle);
                return;
              }
              queueNavigatorTarget({
                kind: 'castle',
                castleId: castle.castleId,
                coord: { q: castle.q, r: castle.r }
              });
            }}
            onActivateWorker={(entry) => {
              const worker = publicWorkerProjectionRef.current?.workers.find((candidate) => (
                candidate.workerId === entry.workerId
                && candidate.ordinal === entry.ordinal
                && candidate.originCastleId === entry.originCastleId
              ));
              if (!worker) return;
              const sceneRecord = workerSceneRecordsRef.current.find((candidate) => (
                candidate.workerId === entry.workerId
                && candidate.ordinal === entry.ordinal
                && candidate.originCastleId === entry.originCastleId
              ));
              const coord = sceneRef.current?.getWorkerCurrentCoord?.(worker.workerId)
                ?? entry.coord
                ?? (
                  worker.status === 'returning'
                    ? sceneRecord?.originCoord
                    : sceneRecord?.destinationCoord ?? sceneRecord?.originCoord
              );
              if (!coord) return;
              if (fullscreenDestinations) {
                selectWorkerOrOccupiedSite(worker, () => coord);
                return;
              }
              queueNavigatorTarget({
                kind: 'worker',
                workerId: worker.workerId,
                workerOrdinal: worker.ordinal,
                originCastleId: worker.originCastleId,
                coord
              });
            }}
            onActivateResourceSite={(entry) => {
              if (fullscreenDestinations) {
                openNavigatorResourceSite(entry);
                return;
              }
              const siteId = entry.key.slice(entry.resource.length + 1);
              const node = entry.resource === 'food'
                ? foodNodesBySiteId.get(siteId)
                : entry.resource === 'wood'
                  ? woodNodesBySiteId.get(siteId)
                  : entry.resource === 'stone'
                    ? stoneNodesBySiteId.get(siteId)
                    : goldNodesBySiteId.get(siteId);
              if (!node) return;
              queueNavigatorTarget({
                kind: 'resource-site',
                resource: entry.resource,
                siteId,
                coord: node.coord
              });
            }}
            onActivateWaterCell={(cellKey) => {
              const record = waterRecordsByKeyRef.current.get(cellKey);
              if (!record) return;
              if (fullscreenDestinations) {
                selectWaterCell(record);
                return;
              }
              queueNavigatorTarget({
                kind: 'water',
                cellKey,
                coord: record.coord
              });
            }}
            coordinateJump={observerMode ? {
              validate: (coord) => (
                isPlayableRealmCoord(surface, coord)
                && tileMetadataByKey.get(hexKey(coord))?.passable !== false
              ),
              onActivate: selectFromNavigator
            } : undefined}
          />
        </>
      ) : null}
    </main>
  );
}
