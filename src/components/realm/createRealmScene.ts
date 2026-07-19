import * as THREE from 'three';

import {
  axialToWorld,
  hexDisc,
  hexDistance,
  hexKey,
  parseHexKey,
  worldToNearestAxial,
  type HexCoord
} from '../../game/map/hexCoordinates';
import {
  generateRealmForestBiomes,
  REALM_FOREST_BIOME_BUDGETS,
  type RealmForestBiomeData
} from '../../game/map/realmForestBiomes';
import { resolveRealmSharedForestLayout } from '../../game/map/realmSharedForestPlacements';
import { generateTerrainDecorations } from '../../game/map/terrainDecorations';
import type { RealmGrassExclusion, RealmGrassTerrainKind } from '../../game/map/realmGrass';
import { generateRealmTerrainFeatures } from '../../game/map/realmTerrainFeatures';
import type { RealmTerrainFeaturePoint } from '../../game/map/realmTerrainFeatures';
import {
  indexRealmTerrainSemantics,
  type RealmTerrainKind,
  type RealmTerrainSemanticRow
} from '../../game/map/realmTerrainSemantics';
import { isPlayableRealmCoord, type RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import {
  createHegemonyCastlePlacements,
  type TerrainStructurePlacement
} from '../../game/map/terrainPlacements';
import { createTerrainDecorationLayers } from './createTerrainDecorations';
import { createRealmGrassLayer, type RealmGrassLayer, type RealmGrassTelemetry } from './createRealmGrassLayer';
import { createRealmTerrainFeatureLayers } from './createRealmTerrainFeatures';
import { createRealmForestLayer, type RealmForestLayer } from './realmForestLayer';
import {
  createTerrainGeometryData,
  createTerrainOverviewHull,
  pointyHexCorners
} from './createTerrainGeometry';
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
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel
} from './hegemonyTreeRuntimeAssets';
import {
  CASTLE_GROUND_LIFT,
  createRealmCastleInstanceLayer,
  type RealmCastleInstanceLayer,
  type RealmCastleInstancePresentationTelemetry,
  type RealmCastleInstanceRecord
} from './realmCastleInstanceLayer';
import {
  createRealmCameraController,
  DEFAULT_REALM_CAMERA_SPEC,
  type RealmCameraComposition,
  type RealmCameraMode,
  type RealmKeepFocus
} from './realmCameraController';
import {
  CASTLE_LABEL_GAP_PIXELS,
  realmCastleProjectionFrameKey
} from './realmCastlePresentation';
import {
  createRealmEnvironmentDepth,
  REALM_SUN_LIGHT_POSITION,
  REALM_SKY_FALLBACK_COLOR
} from './createRealmEnvironment';
import {
  castleSilhouetteIntersectsViewport,
  createCastleBoundsProjectionEnvelope,
  projectCastleSilhouetteScreenBounds,
  type RealmCastleProjectionEnvelope
} from './realmCastleProjectionGeometry';
import { createRealmAmbientScheduler, type RealmAmbientScheduler } from './realmAmbientScheduler';
import {
  createRealmWaterLayer,
  type RealmWaterLayer
} from './realmWaterLayer';
import type { GenesisWaterCellV1 } from '../../../spacetimedb/src/waterWorld';
import {
  createRealmGoldNodeLayer,
  HEGEMONY_EXPEDITION_ASSET_BUDGETS,
  type RealmGoldNodeLayer,
  type RealmGoldNodePresentationTelemetry,
  type RealmGoldNodeSceneRecord
} from './realmGoldNodeLayer';
import {
  createRealmFoodNodeLayer,
  HEGEMONY_FOOD_FARM_ASSET_BUDGETS,
  type RealmFoodNodeLayer,
  type RealmFoodNodePresentationTelemetry,
  type RealmFoodNodeSceneRecord
} from './realmFoodNodeLayer';
import {
  createRealmWoodNodeLayer,
  HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS,
  type RealmWoodNodeLayer,
  type RealmWoodNodePresentationTelemetry,
  type RealmWoodNodeSceneRecord
} from './realmWoodNodeLayer';
import {
  createRealmStoneNodeLayer,
  HEGEMONY_STONE_QUARRY_ASSET_BUDGETS,
  type RealmStoneNodeLayer,
  type RealmStoneNodePresentationTelemetry,
  type RealmStoneNodeSceneRecord
} from './realmStoneNodeLayer';
import { createRealmExpeditionSceneBudget } from './realmExpeditionPresentationBudget';
import {
  createRealmPointerGestureCoordinator,
  type RealmPointerGestureResult,
  type RealmPointerStartLane
} from './realmPointerGestureCoordinator';
import {
  REALM_LIGHTING_SPECS,
  resolveRealmPixelRatio,
  resolveRealmRenderPlan,
  type RealmQualitySpec
} from './realmQuality';
import type {
  KeepLoadStatus,
  RealmCastleProjectionFrame,
  RealmCastleScreenBounds
} from './realmTypes';

const HEX_SIZE = 1;
const OVERLAY_LIFT = 0.026;
const CAMERA_FILL_HORIZONTAL_DISTANCE = 10;
const CAMERA_FILL_HEIGHT = 1.2;
const CAMERA_FILL_FACE_IRRADIANCE = 0.42;
const CAMERA_FILL_INTENSITY = CAMERA_FILL_FACE_IRRADIANCE
  * Math.hypot(CAMERA_FILL_HORIZONTAL_DISTANCE, CAMERA_FILL_HEIGHT)
  / CAMERA_FILL_HORIZONTAL_DISTANCE;
let nextRealmSceneBuildSequence = 1;
/** Ordinary Realm view deliberately exposes a strategic neighborhood, not the full board. */
export const REALM_STRATEGIC_OVERVIEW_RADIUS = 28;

type RealmViewportDimensions = Readonly<{
  canvasWidth: number;
  canvasHeight: number;
  visualViewportWidth?: number;
  visualViewportHeight?: number;
  innerWidth?: number;
  innerHeight?: number;
}>;

function positiveViewportDimension(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : undefined;
}

/**
 * Safari may keep a fixed canvas at the layout-viewport size while its visible
 * viewport shrinks for browser chrome or the software keyboard. Rendering to
 * the smaller valid boundary keeps camera composition and pointer projection
 * aligned with what the player can actually see.
 */
export function resolveRealmViewportSize(input: RealmViewportDimensions) {
  const resolveAxis = (
    canvasValue: number,
    visualValue: number | undefined,
    innerValue: number | undefined
  ) => {
    const canvas = positiveViewportDimension(canvasValue);
    const visual = positiveViewportDimension(visualValue);
    if (canvas !== undefined && visual !== undefined) return Math.min(canvas, visual);
    return canvas ?? visual ?? positiveViewportDimension(innerValue) ?? 1;
  };
  return Object.freeze({
    width: resolveAxis(input.canvasWidth, input.visualViewportWidth, input.innerWidth),
    height: resolveAxis(input.canvasHeight, input.visualViewportHeight, input.innerHeight)
  });
}

function localPresentationNowMicros() {
  const now = Date.now();
  return Number.isSafeInteger(now) && now >= 0 ? BigInt(now) * 1_000n : 0n;
}

function localPresentationElapsedSeconds() {
  return typeof performance === 'undefined' || !Number.isFinite(performance.now())
    ? 0
    : performance.now() / 1_000;
}

function isMobileExpeditionPresentation() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(max-width: 760px), (pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Stable, object-readable coordinates for the bounded Alpha 0.3.6 lighting
 * revision. Daylight now comes primarily from the camera-visible key sun and
 * physical sky/ground bounce; the restrained horizontal fills preserve just a
 * trace of Realm identity without flattening sunlit masonry. No extra light,
 * render pass, or animation loop is added.
 */
export const REALM_CASTLE_READABILITY_LIGHTING = Object.freeze({
  revision: 'sunlit-lowlands-v3',
  cameraFillHorizontalDistance: CAMERA_FILL_HORIZONTAL_DISTANCE,
  cameraFillHeight: CAMERA_FILL_HEIGHT,
  cameraFillIntensity: CAMERA_FILL_INTENSITY,
  cameraFacingIrradiance: CAMERA_FILL_FACE_IRRADIANCE,
  cameraFillUpwardIrradiance: CAMERA_FILL_FACE_IRRADIANCE
    * CAMERA_FILL_HEIGHT
    / CAMERA_FILL_HORIZONTAL_DISTANCE,
  maximumCameraFillUpwardIrradiance: 0.09,
  amethystSideFillIntensity: 0.16,
  hemisphereSkyColour: '#dce8f5',
  hemisphereGroundColour: '#6f6049',
  hemisphereIntensity: 0.76
});
const DEFAULT_CASTLE_PROJECTION_ENVELOPE = createCastleBoundsProjectionEnvelope({
  minX: -0.74,
  minY: 0,
  minZ: -0.74,
  maxX: 0.74,
  maxY: 1.08,
  maxZ: 0.74
})!;

/** Semantic features remain their own family; grass only receives generic root circles. */
export function grassExclusionsForTerrainFeatures(
  points: readonly RealmTerrainFeaturePoint[]
): readonly RealmGrassExclusion[] {
  return Object.freeze(points.flatMap((point) => {
    const radius = point.kind === 'forest-tree' ? 0.085
      : point.kind === 'ridge-outcrop' ? 0.10
        : point.kind === 'ancient-monolith' ? 0.11
          : 0;
    return radius > 0 ? [Object.freeze({
      id: `terrain-feature:${point.kind}:${point.coord.q},${point.coord.r}`,
      world: point.world,
      radius
    })] : [];
  }));
}

/** Keep grass outside every rendered canonical tree footprint. */
export function grassExclusionsForForestTrees(
  points: RealmForestBiomeData['points']
): readonly RealmGrassExclusion[] {
  return Object.freeze(points.map((point, index) => Object.freeze({
    id: `forest-tree:${point.speciesId}:${point.coord.q},${point.coord.r}:${index}`,
    world: point.world,
    radius: Math.max(0.085, point.footprintDiameter * point.scale * 0.5 + 0.04)
  })));
}

type RealmResourceGrassExclusionRecord = Readonly<{
  siteId: string;
  coord: HexCoord;
}>;

/** Resource buildings are presentation roots, never grass interaction targets. */
export function grassExclusionsForResourceNodes(
  kind: 'gold' | 'food' | 'wood' | 'stone',
  nodes: readonly RealmResourceGrassExclusionRecord[],
  footprintDiameter: number
): readonly RealmGrassExclusion[] {
  const radius = Number.isFinite(footprintDiameter)
    ? Math.max(0, footprintDiameter) * 0.5 + 0.1
    : 0;
  return Object.freeze(nodes.flatMap((node) => (
    radius > 0
      && Number.isSafeInteger(node.coord.q)
      && Number.isSafeInteger(node.coord.r)
      ? [Object.freeze({
        id: `resource-site:${kind}:${node.siteId}`,
        world: axialToWorld(node.coord, HEX_SIZE),
        radius
      })]
      : []
  )));
}

function isGrassShaderContractFailure(error: unknown) {
  return error instanceof Error
    && error.message === 'REALM_GRASS_SHADER_BEGIN_VERTEX_CONTRACT_CHANGED';
}

type RealmCastleLabelScreenPoint = Readonly<{ x: number; y: number }>;

function validScreenBounds(
  bounds: RealmCastleScreenBounds | undefined
): bounds is RealmCastleScreenBounds {
  return bounds !== undefined
    && Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.right)
    && Number.isFinite(bounds.bottom)
    && bounds.right > bounds.left
    && bounds.bottom > bounds.top;
}

/**
 * Keep the identity strip attached immediately beneath the projected castle
 * foundation. The foundation edge is stable across camera motion and LOD swaps;
 * using it avoids the detached, roof-floating identity treatment that preceded
 * Alpha 0.3.5.
 */
export function resolveCastleLabelScreenAnchor(
  castleBounds: RealmCastleScreenBounds | undefined,
  fallback: RealmCastleLabelScreenPoint,
  gapPixels = CASTLE_LABEL_GAP_PIXELS
): RealmCastleLabelScreenPoint {
  if (!validScreenBounds(castleBounds)) return fallback;
  const gap = Number.isFinite(gapPixels) ? Math.max(0, gapPixels) : 0;
  return {
    x: (castleBounds.left + castleBounds.right) * 0.5,
    y: castleBounds.bottom + gap
  };
}

/**
 * Selects one label envelope for the complete quality session. Active mesh LOD
 * is intentionally not an input: crossing an LOD threshold may change model
 * detail, but never the projected identity anchor or visibility silhouette.
 */
export function resolveStableCastleLabelEnvelope(
  envelopes: ReadonlyMap<CastleLod, RealmCastleProjectionEnvelope>,
  policy: Pick<CastleLodPolicy, 'maximumLod'>,
  fallback: RealmCastleProjectionEnvelope
) {
  return envelopes.get(policy.maximumLod) ?? fallback;
}

/**
 * Combines a conservative horizontal/base box with the actual projected roof
 * edge used by labels. The original conservative prism remains available to
 * callers as a separate projection field.
 */
export function resolveCastleLabelOcclusionBounds(
  conservativeBounds: RealmCastleScreenBounds | undefined,
  projectedRoofTop: number | undefined
): RealmCastleScreenBounds | undefined {
  if (!validScreenBounds(conservativeBounds)) return undefined;
  if (projectedRoofTop === undefined || !Number.isFinite(projectedRoofTop)) {
    return conservativeBounds;
  }
  const top = Math.max(conservativeBounds.top, projectedRoofTop);
  return top < conservativeBounds.bottom
    ? { ...conservativeBounds, top }
    : conservativeBounds;
}

export type RealmPeerCastleMarker = Readonly<{
  castleId: number;
  q: number;
  r: number;
}>;

export type RealmInteractionTarget =
  | Readonly<{ kind: 'castle'; castleId: number; coord: HexCoord }>
  | Readonly<{ kind: 'gold-site'; siteId: string; coord: HexCoord }>
  | Readonly<{ kind: 'food-site'; siteId: string; coord: HexCoord }>
  | Readonly<{ kind: 'wood-site'; siteId: string; coord: HexCoord }>
  | Readonly<{ kind: 'stone-site'; siteId: string; coord: HexCoord }>
  | Readonly<{ kind: 'terrain'; coord: HexCoord }>;

export type RealmTerrainPresentationTelemetry = Readonly<{
  terrainTriangleCount: number;
  terrainTriangleBudget: number;
  terrainDetailRadius: number;
  highDetailTerrainCellCount: number;
  coarseTerrainCellCount: number;
  terrainTransitionEdgeCount: number;
  semanticCellCount: number;
  semanticKindCount: number;
  semanticFeatureCount: number;
  semanticFeatureDrawCalls: number;
  totalDetailInstanceCount: number;
  totalDetailDrawCalls: number;
  /** Canonical shared rows render only when their full layout validates. */
  forestPlacementSource: 'legacy-fallback' | 'shared' | 'blocked';
  forestSharedTreeCount: number;
  grassCandidateCellCount: number;
  grassActiveCellCount: number;
  grassInstanceCount: number;
  grassTriangleCount: number;
  grassDrawCalls: number;
  grassCacheEntries: number;
  grassAnimated: boolean;
  grassTargetAnimationCadence: number;
  grassCountsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  grassCompletelyBareActiveCells: number;
  grassRejectedByStructureClearance: number;
  grassRejectedBySlope: number;
  grassOverviewHidden: boolean;
}>;

export type RealmSceneHandle = Readonly<{
  dispose: () => void;
  reconcileLiveGatheringState: (state: RealmLiveGatheringState) => void;
  getCameraAttestation: () => RealmCameraAttestation;
  getSceneBuildSequence: () => number;
  focusCastle: (castleId: number) => void;
  focusCell: (coord: HexCoord) => void;
  frameFoundingDistrict: () => void;
  focusKeep: () => void;
  recenterKeep: () => void;
  setHovered: (coord: HexCoord | null) => void;
  setPresentedCastleIds: (castleIds: readonly number[]) => void;
  setSelected: (coord: HexCoord | null) => void;
  setSelectedCastleId: (castleId: number | null) => void;
  setSelectedGoldSiteId: (siteId: string | null) => void;
  setSelectedFoodSiteId: (siteId: string | null) => void;
  setSelectedWoodSiteId: (siteId: string | null) => void;
  setSelectedStoneSiteId: (siteId: string | null) => void;
  setComposition: (composition: RealmCameraComposition) => void;
  showRealm: () => void;
}>;

export type RealmLiveGatheringState = Readonly<{
  goldNodes: readonly RealmGoldNodeSceneRecord[];
  foodNodes: readonly RealmFoodNodeSceneRecord[];
  woodNodes: readonly RealmWoodNodeSceneRecord[];
  stoneNodes: readonly RealmStoneNodeSceneRecord[];
  observedAtMicros: bigint;
}>;

export type RealmCameraAttestation = Readonly<{
  sceneBuildSequence: number;
  sceneId: string;
  canvasId: string;
  mode: RealmCameraMode;
  position: Readonly<{ x: number; y: number; z: number }>;
  target: Readonly<{ x: number; y: number; z: number }>;
  fov: number;
  zoom: number;
  selectedTerrainCoord: HexCoord | null;
  selectedCastleId: number | null;
  selectedGoldSiteId: string | null;
  selectedFoodSiteId: string | null;
  selectedWoodSiteId: string | null;
  selectedStoneSiteId: string | null;
}>;

export function foundingDistrictZoomForViewport(
  playableRadius: number,
  aspect: number
) {
  const radiusProgress = Math.min(1, Math.max(0, (playableRadius - 4) / 16));
  // Portrait already narrows the visible world through camera aspect. Apply
  // only a small readability lift; a larger correction crops edge castles and
  // defeats the roof-label solver on phones.
  const narrowViewportAdjustment = Math.min(0.025, Math.max(0, 1 - aspect) * 0.04);
  return Math.min(0.565, Math.max(
    0.12,
    0.3 + radiusProgress * 0.24 + narrowViewportAdjustment
  ));
}

/**
 * Frames the founding cluster attached to the current keep, never the global
 * midpoint of every admitted castle. This keeps a late canonical slot and its
 * nearest peers on screen even after the realm grows to 100 players.
 */
export function foundingDistrictFocusForKeep(
  keepCoord: HexCoord,
  castles: readonly RealmCastleInstanceRecord[],
  fallback: RealmKeepFocus,
  maximumHexDistance = 4
): RealmKeepFocus {
  const localCastles = castles.filter((castle) => (
    hexDistance(keepCoord, castle.coord) <= maximumHexDistance
  ));
  if (localCastles.length === 0) return fallback;
  const xValues = localCastles.map((castle) => castle.x);
  const zValues = localCastles.map((castle) => castle.z);
  return {
    x: (Math.min(...xValues) + Math.max(...xValues)) / 2,
    y: localCastles.reduce((total, castle) => total + castle.groundY, 0)
      / localCastles.length,
    z: (Math.min(...zValues) + Math.max(...zValues)) / 2,
    height: fallback.height,
    footprintDiameter: fallback.footprintDiameter
  };
}

export type CreateRealmSceneOptions = Readonly<{
  canvas: HTMLCanvasElement;
  surface: RealmTerrainSurface;
  keepCoord: HexCoord;
  ownCastleId?: number;
  otherCastles: readonly RealmPeerCastleMarker[];
  /** Validated public v5 sites/occupations; absent data renders no Gold nodes. */
  goldNodes?: readonly RealmGoldNodeSceneRecord[];
  /** Validated public Food sites/occupations; absent/malformed data renders no Food nodes. */
  foodNodes?: readonly RealmFoodNodeSceneRecord[];
  /** Validated public Wood sites/occupations; absent/malformed data renders no Wood nodes. */
  woodNodes?: readonly RealmWoodNodeSceneRecord[];
  /** Validated public Stone sites/occupations; absent/malformed data renders no Stone nodes. */
  stoneNodes?: readonly RealmStoneNodeSceneRecord[];
  /** Additive public `realm_forest_instance_v1` rows. */
  sharedForestTrees?: unknown;
  /** Additive public `realm_forest_layout_v1` metadata row. */
  sharedForestLayout?: unknown;
  /** Canonical realm id used to bind the shared forest table to this scene. */
  realmId?: string;
  /** Complete, digest-validated public water projection; absent means water is unavailable. */
  waterCells?: readonly GenesisWaterCellV1[];
  /**
   * Test/DEV-observer-only bridge for the retired deterministic preview.
   * Production player scenes must not synthesize a forest before the public
   * layout table is ready and seeded.
   */
  allowLegacyForestFallback?: boolean;
  terrainMetadata: readonly RealmTerrainSemanticRow[];
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
  /** Live counts derived from populated instance meshes after presentation masking. */
  onCastlePresentationTelemetry?: (
    telemetry: RealmCastleInstancePresentationTelemetry
  ) => void;
  onCastleProjection: (frame: RealmCastleProjectionFrame) => void;
  onTerrainPresentationTelemetry?: (telemetry: RealmTerrainPresentationTelemetry) => void;
  onGoldNodePresentationTelemetry?: (telemetry: RealmGoldNodePresentationTelemetry) => void;
  onFoodNodePresentationTelemetry?: (telemetry: RealmFoodNodePresentationTelemetry) => void;
  onWoodNodePresentationTelemetry?: (telemetry: RealmWoodNodePresentationTelemetry) => void;
  onStoneNodePresentationTelemetry?: (telemetry: RealmStoneNodePresentationTelemetry) => void;
  onRendererUnavailable: () => void;
  /** @deprecated Prefer onTargetSelect for castle identity-aware interaction. */
  onSelect: (coord: HexCoord) => void;
  onTargetSelect?: (target: RealmInteractionTarget) => void;
}>;

type RealmSceneCleanup = Readonly<{
  add: (dispose: () => void) => void;
  dispose: () => void;
  isDisposed: () => boolean;
}>;

type PendingRealmDirectGesture =
  | {
      kind: 'pan';
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
  | {
      kind: 'pinch';
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      zoomAmount: number;
    };

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

/**
 * The static tree batch replaces a synchronous fallback after its local GLBs
 * finish parsing. Keep this tiny callback independently testable: model-ready
 * must repaint once, while a disposed map may never receive a late render.
 */
export function createRealmForestModelReadyRenderCallback(
  isDisposed: () => boolean,
  render: () => void
) {
  return () => {
    if (!isDisposed()) render();
  };
}

function createTerrainGeometry(
  surface: RealmTerrainSurface,
  subdivisionsPerEdge: number,
  adaptiveDetailRadius: number,
  placements: readonly TerrainStructurePlacement[],
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>,
  forestCanopyByKey?: ReadonlyMap<string, number>
) {
  const data = createTerrainGeometryData(surface.renderMap, HEX_SIZE, {
    subdivisionsPerEdge,
    adaptiveDetailRadius,
    playableRadius: surface.playableMap.radius,
    placements,
    terrainKindsByKey,
    forestCanopyByKey
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

function pointerDistance(
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>
) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export type RealmPinchGesture = Readonly<{
  centroid: Readonly<{ x: number; y: number }>;
  distance: number;
}>;

export function resolveRealmPinchGesture(
  pointers: ReadonlyMap<number, Readonly<{ x: number; y: number }>>
): RealmPinchGesture | null {
  const iterator = pointers.values();
  const first = iterator.next().value;
  const second = iterator.next().value;
  if (!first || !second) return null;
  return Object.freeze({
    centroid: Object.freeze({
      x: (first.x + second.x) * 0.5,
      y: (first.y + second.y) * 0.5
    }),
    distance: pointerDistance(first, second)
  });
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

function addForestPresentationDisc(
  protectedTileKeys: Set<string>,
  coord: HexCoord,
  radius: number
) {
  hexDisc(coord, radius).forEach((candidate) => protectedTileKeys.add(hexKey(candidate)));
}

/**
 * This belt follows the already-visible direct wagon presentation segment;
 * it is deliberately not a route finder and is never supplied to gameplay or
 * persistence. Its only purpose is to leave a calm, readable strip of open
 * ground beneath a rendered Gold expedition.
 */
function reserveVisibleResourceTravelBelt(
  protectedTileKeys: Set<string>,
  from: HexCoord,
  to: HexCoord
) {
  const origin = axialToWorld(from, HEX_SIZE);
  const destination = axialToWorld(to, HEX_SIZE);
  const samples = Math.max(1, hexDistance(from, to) * 3);
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const coord = worldToNearestAxial({
      x: THREE.MathUtils.lerp(origin.x, destination.x, progress),
      z: THREE.MathUtils.lerp(origin.z, destination.z, progress)
    }, HEX_SIZE);
    addForestPresentationDisc(protectedTileKeys, coord, 1);
  }
}

/**
 * Forest exclusions live entirely at the scene boundary. They preserve clear
 * presentation around canonical structures and visible resource expeditions,
 * while leaving terrain semantics, passability, routes, and SpacetimeDB state
 * untouched.
 */
function forestPresentationProtectedTileKeys(
  options: Pick<CreateRealmSceneOptions, 'goldNodes' | 'foodNodes' | 'woodNodes' | 'stoneNodes' | 'terrainMetadata'>,
  terrainSemantics: ReturnType<typeof indexRealmTerrainSemantics>,
  placements: readonly TerrainStructurePlacement[],
  includeResourcePresentationReservations = true
) {
  const protectedTileKeys = new Set<string>();
  options.terrainMetadata.forEach((row) => {
    // Reserve every non-empty canonical static role. This includes future
    // resource/core slots as well as existing scenic blockers, instead of
    // making a renderer heuristic accidentally hide a gameplay landmark.
    if (row.staticContentKind === 'empty') return;
    const coord = parseHexKey(row.tileKey);
    if (!coord) return;
    addForestPresentationDisc(
      protectedTileKeys,
      coord,
      row.staticContentKind === 'castle-slot' ? 1 : 0
    );
  });
  terrainSemantics.terrainKindsByKey.forEach((kind, key) => {
    if (kind === 'lake' || kind === 'ridge' || kind === 'ancient-stone') {
      protectedTileKeys.add(key);
    }
  });
  terrainSemantics.castleSlotKeys.forEach((key) => {
    const coord = parseHexKey(key);
    if (coord) addForestPresentationDisc(protectedTileKeys, coord, 1);
  });
  placements.forEach((placement) => {
    // The normalized castle island and its decorative clearance cross the
    // owning hex edge, so reserve the six immediate neighboring cells too.
    addForestPresentationDisc(protectedTileKeys, placement.coord, 1);
  });
  if (!includeResourcePresentationReservations) return protectedTileKeys;
  [...(options.goldNodes ?? []), ...(options.foodNodes ?? []), ...(options.woodNodes ?? []), ...(options.stoneNodes ?? [])].forEach((node) => {
    addForestPresentationDisc(protectedTileKeys, node.coord, 1);
    // Occupation-specific wagon routes are local, changing presentation. They
    // keep the legacy fallback clear, but cannot invalidate an otherwise
    // canonical shared forest row simply because one viewer's expedition is
    // currently active.
    if (!node.originCastle) return;
    const origin = { q: node.originCastle.q, r: node.originCastle.r };
    addForestPresentationDisc(protectedTileKeys, origin, 1);
    reserveVisibleResourceTravelBelt(protectedTileKeys, origin, node.coord);
  });
  return protectedTileKeys;
}

/**
 * Immutable shared forest rows were seeded against this deliberately narrow
 * static contract. Do not let resource-capable/core/reserve slots, Gold
 * occupations, or wagon presentation state change which authoritative trees
 * render for a player. The legacy planner keeps its broader local clarity
 * rules above; the shared layout must match every client exactly.
 */
function sharedForestLayoutProtectedTileKeys(
  options: Pick<CreateRealmSceneOptions, 'terrainMetadata'>,
  terrainSemantics: ReturnType<typeof indexRealmTerrainSemantics>
) {
  const protectedTileKeys = new Set<string>();
  options.terrainMetadata.forEach((row) => {
    if (row.staticContentKind !== 'castle-slot' && row.staticContentKind !== 'scenic-blocker') {
      return;
    }
    const coord = parseHexKey(row.tileKey);
    if (!coord) return;
    addForestPresentationDisc(
      protectedTileKeys,
      coord,
      0
    );
  });
  // These terrain semantics are intrinsically non-foliage; retain them as
  // static policy exclusions without importing any player-local runtime state.
  terrainSemantics.terrainKindsByKey.forEach((kind, key) => {
    if (kind === 'lake' || kind === 'ridge' || kind === 'ancient-stone') {
      protectedTileKeys.add(key);
    }
  });
  // Foundation clearance was reviewed into the exact server catalog and is
  // proven by the canonical row matcher. Do not infer it from current castle
  // occupancy or broaden it to neighbor cells: either makes player-specific
  // state change a supposedly shared forest layout.
  return protectedTileKeys;
}

function emptyForestBiomeData(
  instanceBudget: number,
  triangleBudget: number
): RealmForestBiomeData {
  return Object.freeze({
    points: Object.freeze([]),
    canopyByTileKey: new Map(),
    counts: Object.freeze({
      forestSemanticCellCount: 0,
      groveCellCount: 0,
      fringeCellCount: 0,
      eligibleFoliageCellCount: 0,
      openFoliageCellCount: 0,
      openCellCount: 0,
      treeCount: 0,
      speciesCount: 0,
      estimatedTriangleCount: 0
    }),
    instanceBudget,
    triangleBudget
  });
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
  const sceneBuildSequence = nextRealmSceneBuildSequence++;
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
  // Pure quality policy is needed by the first resize/projection callback;
  // initialize it before any observer or render loop can run.
  const castleLodPolicy = castleLodPolicyForQuality(runtimeQuality);
  const terrainSemantics = indexRealmTerrainSemantics(
    options.surface,
    options.terrainMetadata
  );
  const terrainPlacements = createHegemonyCastlePlacements([
    ...(options.ownCastleId === undefined
      ? []
      : [{ id: 'own-keep', coord: options.keepCoord }]),
    ...options.otherCastles.map((castle) => ({
      id: `peer-castle-${castle.castleId}`,
      coord: { q: castle.q, r: castle.r }
    }))
  ]);
  const scene = new THREE.Scene();
  const canvasId = options.canvas.dataset.realmCanvasIdentity
    ?? `realm-canvas-${sceneBuildSequence}`;
  options.canvas.dataset.realmCanvasIdentity = canvasId;
  options.canvas.dataset.realmSceneBuildSequence = String(sceneBuildSequence);
  options.canvas.dataset.realmSceneIdentity = scene.uuid;
  scene.background = new THREE.Color(REALM_SKY_FALLBACK_COLOR);
  const fog = new THREE.Fog(
    REALM_SKY_FALLBACK_COLOR,
    options.quality.fogNear,
    options.quality.fogFar
  );
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
  const rendererContext = typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  const grassAlphaToCoverage = rendererContext?.getContextAttributes?.()?.antialias === true;
  options.canvas.dataset.realmLighting = REALM_CASTLE_READABILITY_LIGHTING.revision;
  renderer.shadowMap.enabled = renderPlan.dynamicShadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(REALM_SKY_FALLBACK_COLOR, 1);

  let environmentGroup: THREE.Group | undefined;
  try {
    const environment = createRealmEnvironmentDepth(options.quality.id);
    cleanup.add(environment.dispose);
    scene.add(environment.group);
    environmentGroup = environment.group;
    scene.environment = environment.environmentMap;
    scene.environmentIntensity = environment.environmentIntensity;
    options.canvas.dataset.environmentLighting = 'procedural';
  } catch {
    // Direct lights and the solid sky fallback remain sufficient for play.
    // Controlled local browser QA attests this aggregate state separately.
    options.canvas.dataset.environmentLighting = 'direct-light-fallback';
  }

  const decorationData = generateTerrainDecorations(
    options.surface.renderMap,
    {
      ...renderPlan.stoneDecorationDensity,
      playableRadius: options.surface.playableMap.radius
    },
    HEX_SIZE,
    terrainPlacements,
    terrainSemantics.terrainKindsByKey,
    {
      maximumPoints: renderPlan.stoneDecorationInstanceBudget,
      preserveRadius: 20,
      playableKeys: options.surface.playableKeys
    }
  );
  // The original semantic layer still owns heath, lake, ridge, and ancient
  // accents. Forest cones are held back until the static-tree layer has been
  // constructed successfully, so an asset/device failure can retain the
  // existing visual fallback rather than silently removing all woodland.
  const nonForestSemanticFeatureData = generateRealmTerrainFeatures(
    options.surface.renderMap,
    terrainSemantics.terrainKindsByKey,
    runtimeQuality.id,
    HEX_SIZE,
    terrainPlacements,
    terrainSemantics.castleSlotKeys,
    { includeForestTrees: false }
  );
  const legacyForestProtectedTileKeys = forestPresentationProtectedTileKeys(
    options,
    terrainSemantics,
    terrainPlacements
  );
  const sharedForestProtectedTileKeys = sharedForestLayoutProtectedTileKeys(
    options,
    terrainSemantics
  );
  const forestLod = runtimeQuality.id === 'high'
    ? 'high'
    : runtimeQuality.id === 'balanced' ? 'balanced' : 'compact';
  const forestDetailBudget = Math.max(
    0,
    renderPlan.decorationInstanceBudget
      - decorationData.points.length
      - nonForestSemanticFeatureData.points.length
  );
  const forestSpecies = HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => Object.freeze({
    id: asset.id,
    triangles: hegemonyTreeModel(asset, forestLod).triangles,
    footprintDiameter: hegemonyTreeModel(asset, forestLod).normalizedFootprintDiameter,
    biomes: asset.biomes
  }));
  const sharedForestLayout = resolveRealmSharedForestLayout({
    layout: options.sharedForestLayout,
    rows: options.sharedForestTrees,
    allowLegacyFallback: options.allowLegacyForestFallback === true,
    realmId: options.realmId ?? '',
    renderMap: options.surface.renderMap,
    terrainKindsByKey: terrainSemantics.terrainKindsByKey,
    species: forestSpecies,
    hexSize: HEX_SIZE,
    protectedTileKeys: sharedForestProtectedTileKeys,
    isCoordPassable: options.isCoordPassable
  });
  // A local preview can exist only behind the explicit DEV/test opt-in. Every
  // normal player scene remains empty until both public tables attest the full
  // canonical layout; a present but malformed or unseeded projection never
  // falls back to independently generated tree positions.
  const forestBiomeData = sharedForestLayout.source === 'legacy-fallback'
    ? generateRealmForestBiomes(
      options.surface.renderMap,
      terrainSemantics.terrainKindsByKey,
      {
        quality: runtimeQuality.id,
        species: forestSpecies,
        hexSize: HEX_SIZE,
        placements: terrainPlacements,
        protectedTileKeys: legacyForestProtectedTileKeys,
        isCoordPassable: options.isCoordPassable,
        maximumInstanceCount: forestDetailBudget,
        maximumTriangleCount: REALM_FOREST_BIOME_BUDGETS[runtimeQuality.id].triangles
      }
    )
    : sharedForestLayout.source === 'shared'
      ? sharedForestLayout.shared.data
      : emptyForestBiomeData(
        forestDetailBudget,
        REALM_FOREST_BIOME_BUDGETS[runtimeQuality.id].triangles
      );

  const { data: terrainData, geometry: terrainGeometry } = createTerrainGeometry(
    options.surface,
    renderPlan.subdivisionsPerEdge,
    renderPlan.terrainDetailRadius,
    terrainPlacements,
    terrainSemantics.terrainKindsByKey,
    forestBiomeData.canopyByTileKey
  );
  cleanup.add(() => terrainGeometry.dispose());
  if (
    terrainData.triangleCount !== renderPlan.estimatedTerrainTriangles
    || terrainData.triangleCount > renderPlan.terrainTriangleBudget
    || terrainData.highDetailCellCount !== renderPlan.highDetailTerrainCellCount
    || terrainData.coarseCellCount !== renderPlan.coarseTerrainCellCount
    || terrainData.transitionEdgeCount !== renderPlan.terrainTransitionEdgeCount
  ) throw new Error('REALM_TERRAIN_TOPOLOGY_ATTESTATION_FAILED');
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

  let waterLayer: RealmWaterLayer | null = null;
  if (options.waterCells !== undefined) {
    try {
      waterLayer = createRealmWaterLayer({
        cells: options.waterCells,
        quality: runtimeQuality,
        reducedMotion: options.reducedMotion,
        hexSize: HEX_SIZE,
        heightAt: (coord) => terrainHeightAtWorld(
          options.surface.renderMap,
          axialToWorld(coord, HEX_SIZE),
          HEX_SIZE,
          terrainPlacements
        )
      });
      scene.add(waterLayer.group);
      options.canvas.dataset.waterPresentation = 'ready';
      options.canvas.dataset.waterLayoutVersion = String(waterLayer.getTelemetry().layoutVersion);
      options.canvas.dataset.waterTriangleCount = String(waterLayer.getTelemetry().triangleCount);
      options.canvas.dataset.waterDrawCalls = String(waterLayer.getTelemetry().drawCalls);
      cleanup.add(() => {
        const layer = waterLayer;
        if (!layer) return;
        scene.remove(layer.group);
        layer.dispose();
        if (waterLayer === layer) waterLayer = null;
      });
    } catch {
      options.canvas.dataset.waterPresentation = 'unavailable';
    }
  } else {
    options.canvas.dataset.waterPresentation = 'unavailable';
  }

  const decorations = createTerrainDecorationLayers(
    decorationData,
    options.surface.renderMap,
    runtimeQuality,
    HEX_SIZE,
    terrainPlacements
  );
  cleanup.add(decorations.dispose);
  scene.add(decorations.group);
  let requestForestModelRender = () => {};
  let emitTerrainPresentationTelemetry = () => {};
  let forestLayer: RealmForestLayer | null = null;
  let semanticFeatureData = nonForestSemanticFeatureData;
  if (forestBiomeData.points.length > 0) {
    try {
      const nextForestLayer = createRealmForestLayer({
        data: forestBiomeData,
        map: options.surface.renderMap,
        terrainPlacements,
        quality: runtimeQuality,
        baseUrl: options.baseUrl,
        onModelReady: () => {
          emitTerrainPresentationTelemetry();
          requestForestModelRender();
        }
      });
      forestLayer = nextForestLayer;
      scene.add(nextForestLayer.group);
      cleanup.add(() => {
        scene.remove(nextForestLayer.group);
        nextForestLayer.dispose();
        if (forestLayer === nextForestLayer) forestLayer = null;
      });
    } catch {
      // Forest presentation is optional, but canonical rows must never be
      // replaced with client-invented positions after a model/device failure.
      forestLayer = null;
    }
  }
  if (!forestLayer && sharedForestLayout.source === 'legacy-fallback') {
    semanticFeatureData = generateRealmTerrainFeatures(
      options.surface.renderMap,
      terrainSemantics.terrainKindsByKey,
      runtimeQuality.id,
      HEX_SIZE,
      terrainPlacements,
      terrainSemantics.castleSlotKeys
    );
  }
  const forestTelemetry = forestLayer?.getPresentationTelemetry();
  // The shared 210-tree layout is a separately bounded, one-draw-call static
  // world layer. Do not subject it to the former quality-scaled procedural
  // foliage cap: every device must retain the same canonical placement ids,
  // changing only its selected GLB LOD. Legacy preview generation remains
  // inside the ordinary detail budget.
  const budgetedDetailInstanceCount = decorationData.points.length
    + semanticFeatureData.points.length
    + (sharedForestLayout.source === 'shared' ? 0 : (forestTelemetry?.instanceCount ?? 0));
  if (budgetedDetailInstanceCount > renderPlan.decorationInstanceBudget) {
    throw new Error('REALM_TERRAIN_TOTAL_DETAIL_BUDGET_EXCEEDED');
  }
  const semanticFeatures = createRealmTerrainFeatureLayers(
    semanticFeatureData,
    options.surface.renderMap,
    runtimeQuality,
    HEX_SIZE,
    terrainPlacements
  );
  cleanup.add(semanticFeatures.dispose);
  scene.add(semanticFeatures.group);
  let grassLayer: RealmGrassLayer | null = null;
  try {
    grassLayer = createRealmGrassLayer({
      surface: options.surface,
      terrainKindsByKey: terrainSemantics.terrainKindsByKey,
      castleSlotKeys: terrainSemantics.castleSlotKeys,
      placements: terrainPlacements,
      exclusions: Object.freeze([
        ...grassExclusionsForTerrainFeatures(semanticFeatureData.points),
        ...grassExclusionsForForestTrees(forestLayer ? forestBiomeData.points : []),
        ...grassExclusionsForResourceNodes(
          'gold',
          options.goldNodes ?? [],
          HEGEMONY_EXPEDITION_ASSET_BUDGETS.goldMineTargetFootprint
        ),
        ...grassExclusionsForResourceNodes(
          'food',
          options.foodNodes ?? [],
          HEGEMONY_FOOD_FARM_ASSET_BUDGETS.wheatFarmTargetFootprint
        ),
        ...grassExclusionsForResourceNodes(
          'wood',
          options.woodNodes ?? [],
          HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS.loggingCampTargetFootprint
        ),
        ...grassExclusionsForResourceNodes(
          'stone',
          options.stoneNodes ?? [],
          HEGEMONY_STONE_QUARRY_ASSET_BUDGETS.stoneQuarryTargetFootprint
        )
      ]),
      plan: renderPlan.grass,
      reducedMotion: options.reducedMotion,
      hexSize: HEX_SIZE,
      alphaToCoverage: grassAlphaToCoverage
    });
    cleanup.add(grassLayer.dispose);
    scene.add(grassLayer.group);
    options.canvas.dataset.grassPresentation = 'ready';
  } catch {
    // Decorative failure must not take the terrain, input, or castle layer down.
    options.canvas.dataset.grassPresentation = 'unavailable';
  }
  const emptyGrassTelemetry: RealmGrassTelemetry = Object.freeze({
    candidateCellCount: 0,
    activeCellCount: 0,
    instanceCount: 0,
    bladeCount: 0,
    triangleCount: 0,
    drawCalls: 0,
    variantCounts: Object.freeze([]),
    cacheEntries: 0,
    animated: false,
    targetAnimationCadence: renderPlan.grass.animationFrameCap,
    averageRetainedPatchesPerActiveCell: 0,
    averagePatchFootprint: 0,
    averageBladeHeight: 0,
    paletteLuminanceMin: 0,
    paletteLuminanceMax: 0,
    alphaHashActive: true,
    alphaToCoverageActive: grassAlphaToCoverage,
    shaderFallbackActive: false,
    edgeFadeCount: 0,
    countsByTerrain: Object.freeze({
      meadow: 0, lowland: 0, forest: 0, heath: 0, ridge: 0, lake: 0,
      'ancient-stone': 0, apron: 0
    }),
    completelyBareActiveCells: 0,
    rejectedByStructureClearance: 0,
    rejectedBySlope: 0,
    overviewHidden: true
  });
  const terrainPresentationTelemetry = () => {
    const grass = grassLayer?.getTelemetry() ?? emptyGrassTelemetry;
    const currentForestTelemetry = forestLayer?.getPresentationTelemetry();
    return Object.freeze({
      terrainTriangleCount: terrainData.triangleCount,
      terrainTriangleBudget: renderPlan.terrainTriangleBudget,
      terrainDetailRadius: terrainData.detailRadius,
      highDetailTerrainCellCount: terrainData.highDetailCellCount,
      coarseTerrainCellCount: terrainData.coarseCellCount,
      terrainTransitionEdgeCount: terrainData.transitionEdgeCount,
      semanticCellCount: terrainSemantics.terrainKindsByKey.size,
      semanticKindCount: Object.values(terrainSemantics.terrainKindCounts)
        .filter((count) => count > 0).length,
      semanticFeatureCount: semanticFeatures.instanceCount
        + (currentForestTelemetry?.instanceCount ?? 0),
      semanticFeatureDrawCalls: semanticFeatures.drawCalls
        + (currentForestTelemetry?.drawCalls ?? 0),
      totalDetailInstanceCount: decorationData.points.length
        + semanticFeatures.instanceCount
        + (currentForestTelemetry?.instanceCount ?? 0),
      totalDetailDrawCalls: decorations.drawCalls
        + semanticFeatures.drawCalls
        + (currentForestTelemetry?.drawCalls ?? 0),
      forestPlacementSource: sharedForestLayout.source,
      forestSharedTreeCount: sharedForestLayout.source === 'shared'
        ? forestBiomeData.points.length
        : 0,
      grassCandidateCellCount: grass.candidateCellCount,
      grassActiveCellCount: grass.activeCellCount,
      grassInstanceCount: grass.instanceCount,
      grassTriangleCount: grass.triangleCount,
      grassDrawCalls: grass.drawCalls,
      grassCacheEntries: grass.cacheEntries,
      grassAnimated: grass.animated,
      grassTargetAnimationCadence: grass.targetAnimationCadence,
      grassCountsByTerrain: grass.countsByTerrain,
      grassCompletelyBareActiveCells: grass.completelyBareActiveCells,
      grassRejectedByStructureClearance: grass.rejectedByStructureClearance,
      grassRejectedBySlope: grass.rejectedBySlope,
      grassOverviewHidden: grass.overviewHidden
    } satisfies RealmTerrainPresentationTelemetry);
  };
  let lastTerrainTelemetrySignature = '';
  emitTerrainPresentationTelemetry = () => {
    const telemetry = terrainPresentationTelemetry();
    const signature = [
      telemetry.semanticFeatureCount,
      telemetry.semanticFeatureDrawCalls,
      telemetry.totalDetailInstanceCount,
      telemetry.totalDetailDrawCalls,
      telemetry.forestPlacementSource,
      telemetry.forestSharedTreeCount,
      telemetry.grassActiveCellCount,
      telemetry.grassInstanceCount,
      telemetry.grassTriangleCount,
      telemetry.grassCacheEntries,
      telemetry.grassAnimated,
      Object.values(telemetry.grassCountsByTerrain).join(','),
      telemetry.grassCompletelyBareActiveCells,
      telemetry.grassRejectedByStructureClearance,
      telemetry.grassRejectedBySlope,
      telemetry.grassOverviewHidden
    ].join(':');
    if (signature === lastTerrainTelemetrySignature) return;
    lastTerrainTelemetrySignature = signature;
    options.onTerrainPresentationTelemetry?.(telemetry);
  };
  emitTerrainPresentationTelemetry();

  const hemisphere = new THREE.HemisphereLight(
    REALM_CASTLE_READABILITY_LIGHTING.hemisphereSkyColour,
    REALM_CASTLE_READABILITY_LIGHTING.hemisphereGroundColour,
    REALM_CASTLE_READABILITY_LIGHTING.hemisphereIntensity
  );
  const sun = new THREE.DirectionalLight('#fff2c9', lighting.sunIntensity);
  sun.position.set(
    REALM_SUN_LIGHT_POSITION.x,
    REALM_SUN_LIGHT_POSITION.y,
    REALM_SUN_LIGHT_POSITION.z
  );
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
  const skyFill = new THREE.DirectionalLight(
    '#a991d0',
    REALM_CASTLE_READABILITY_LIGHTING.amethystSideFillIntensity
  );
  skyFill.name = 'realm-amethyst-side-fill';
  skyFill.position.set(8, 6.5, -9);
  const cameraAzimuth = THREE.MathUtils.degToRad(DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees);
  const neutralFill = new THREE.DirectionalLight('#dce8f5', CAMERA_FILL_INTENSITY);
  neutralFill.name = 'realm-camera-facing-fill';
  neutralFill.position.set(
    Math.sin(cameraAzimuth) * CAMERA_FILL_HORIZONTAL_DISTANCE,
    CAMERA_FILL_HEIGHT,
    Math.cos(cameraAzimuth) * CAMERA_FILL_HORIZONTAL_DISTANCE
  );
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
  const authoritativeCastleById = new Map(
    authoritativeCastles.map((castle) => [castle.castleId, castle])
  );
  const occupiedCastleCoordinateKeys = new Set(
    authoritativeCastles.map((castle) => hexKey(castle.coord))
  );
  const goldNodeCoordinateKeys = new Set(
    (options.goldNodes ?? []).map((node) => hexKey(node.coord))
  );
  const foodNodeCoordinateKeys = new Set(
    (options.foodNodes ?? []).map((node) => hexKey(node.coord))
  );
  const woodNodeCoordinateKeys = new Set(
    (options.woodNodes ?? []).map((node) => hexKey(node.coord))
  );
  const stoneNodeCoordinateKeys = new Set(
    (options.stoneNodes ?? []).map((node) => hexKey(node.coord))
  );
  const terrainOverlayCoord = (coord: HexCoord | null) => (
    coord
      && !occupiedCastleCoordinateKeys.has(hexKey(coord))
      && !goldNodeCoordinateKeys.has(hexKey(coord))
      && !foodNodeCoordinateKeys.has(hexKey(coord))
      && !woodNodeCoordinateKeys.has(hexKey(coord))
      && !stoneNodeCoordinateKeys.has(hexKey(coord))
      ? coord
      : null
  );

  const castleLabelAnchors = authoritativeCastles.map((castle) => ({
    castleId: castle.castleId,
    q: castle.coord.q,
    r: castle.coord.r,
    x: castle.x,
    renderY: castle.groundY + CASTLE_GROUND_LIFT,
    z: castle.z
  }));

  let castleLayer: RealmCastleInstanceLayer | null = null;
  let goldNodeLayer: RealmGoldNodeLayer | null = null;
  let foodNodeLayer: RealmFoodNodeLayer | null = null;
  let woodNodeLayer: RealmWoodNodeLayer | null = null;
  let stoneNodeLayer: RealmStoneNodeLayer | null = null;
  let castleProjectionEnvelopeByLod: ReadonlyMap<
    CastleLod,
    RealmCastleProjectionEnvelope
  > = new Map();
  let castleRenderEnvelopeByLod: ReadonlyMap<
    CastleLod,
    RealmCastleProjectionEnvelope
  > = new Map();
  let fallbackCastleProjectionEnvelope = DEFAULT_CASTLE_PROJECTION_ENVELOPE;
  let fallbackCastleRenderEnvelope = DEFAULT_CASTLE_PROJECTION_ENVELOPE;
  let selectedCastleId: number | undefined;
  let selectedGoldSiteId: string | undefined;
  let selectedFoodSiteId: string | undefined;
  let selectedWoodSiteId: string | undefined;
  let selectedStoneSiteId: string | undefined;
  let selectedTerrainCoord: HexCoord | null = null;
  let hoveredTerrainCoord: HexCoord | null = null;
  let castleFocusSize: Readonly<{ height: number; footprintDiameter: number }> = Object.freeze({
    height: 1.08,
    footprintDiameter: 1.48
  });
  const foundingDistrictFocus = () => foundingDistrictFocusForKeep(
    options.keepCoord,
    authoritativeCastles,
    {
      x: keepWorld.x,
      y: keepGroundY,
      z: keepWorld.z,
      ...castleFocusSize
    }
  );
  options.onKeepStatusChange(authoritativeCastles.length > 0 ? 'loading' : 'ready');

  let lastCastleProjectionKey = '';
  let lastCastlePresentationTelemetryKey = '';
  let lastGoldNodePresentationTelemetryKey = '';
  let lastFoodNodePresentationTelemetryKey = '';
  let lastWoodNodePresentationTelemetryKey = '';
  let lastStoneNodePresentationTelemetryKey = '';
  const expeditionSceneBudget = createRealmExpeditionSceneBudget({
    quality: runtimeQuality.id,
    goldNodeCount: options.goldNodes?.length ?? 0,
    foodNodeCount: options.foodNodes?.length ?? 0,
    woodNodeCount: options.woodNodes?.length ?? 0,
    stoneNodeCount: options.stoneNodes?.length ?? 0,
    mobile: isMobileExpeditionPresentation()
  });
  let presentedCastleIds: ReadonlySet<number> | null = null;
  let presentedCastleKey = '*';
  let renderPendingWhileHidden = false;
  let pendingCastlesReadyCount: number | null = null;
  let ambientScheduler: RealmAmbientScheduler | null = null;
  const ambientIsNeeded = () => !options.reducedMotion
    && renderPlan.grass.animationFrameCap > 0
    && (
      grassLayer?.isAnimationActive() === true
      || decorations.animated
      || goldNodeLayer?.hasMovingWagons() === true
      || foodNodeLayer?.hasMovingWagons() === true
      || woodNodeLayer?.hasMovingWagons() === true
      || stoneNodeLayer?.hasMovingWagons() === true
      || waterLayer?.isAnimationActive() === true
    );
  const disableGrassPresentation = () => {
    const layer = grassLayer;
    if (!layer) return false;
    grassLayer = null;
    scene.remove(layer.group);
    try {
      layer.dispose();
    } catch {
      // The decorative layer is already detached; do not turn a shader
      // contract fallback into a gameplay/scene failure.
    }
    options.canvas.dataset.grassPresentation = 'unavailable';
    ambientScheduler?.setActive(ambientIsNeeded());
    emitTerrainPresentationTelemetry();
    return true;
  };
  const projectionPoint = new THREE.Vector3();
  const projectionBoundsPoint = new THREE.Vector3();
  const projectCastleLabels = () => {
    const width = Math.max(1, options.canvas.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, options.canvas.clientHeight || window.innerHeight || 1);
    const projectionEnvelope = resolveStableCastleLabelEnvelope(
      castleProjectionEnvelopeByLod,
      castleLodPolicy,
      fallbackCastleProjectionEnvelope
    );
    const renderEnvelope = resolveStableCastleLabelEnvelope(
      castleRenderEnvelopeByLod,
      castleLodPolicy,
      fallbackCastleRenderEnvelope
    );
    // The instance layer owns the authoritative render-frustum calculation.
    // Read its pre-mask identities so labels cannot outlive their models at an
    // edge, while a label mask from the prior frame cannot hide a castle that
    // has just entered the camera frustum.
    const frustumVisibleCastleIds = new Set(
      castleLayer?.getFrustumVisibleCastleIds() ?? []
    );
    const castles = castleLabelAnchors.map((anchor) => {
      projectionPoint.set(
        anchor.x,
        anchor.renderY + castleFocusSize.height,
        anchor.z
      );
      const distance = projectionPoint.distanceTo(cameraController.camera.position);
      projectionPoint.project(cameraController.camera);
      const withinCameraDepth = projectionPoint.z >= -1
        && projectionPoint.z <= 1;
      const projectedFallbackCenter = {
        x: (projectionPoint.x * 0.5 + 0.5) * width,
        y: (-projectionPoint.y * 0.5 + 0.5) * height
      };
      // Project every depth-valid keep before deciding screen visibility. A
      // partially visible edge keep can have its roof center outside the
      // canvas; dropping its envelope would let a foreign username cover the
      // rendered model while the overlap telemetry incorrectly reported zero.
      const castleBounds = withinCameraDepth
        ? projectCastleSilhouetteScreenBounds(
            projectionEnvelope,
            anchor,
            cameraController.camera,
            width,
            height,
            projectionBoundsPoint
          )
        : undefined;
      const conservativeCastleBounds = withinCameraDepth
        ? projectCastleSilhouetteScreenBounds(
            renderEnvelope,
            anchor,
            cameraController.camera,
            width,
            height,
            projectionBoundsPoint
          )
        : undefined;
      const visible = frustumVisibleCastleIds.has(anchor.castleId)
        && castleSilhouetteIntersectsViewport(
          conservativeCastleBounds,
          width,
          height
        );
      const labelAnchor = resolveCastleLabelScreenAnchor(castleBounds, {
        x: projectedFallbackCenter.x,
        y: projectedFallbackCenter.y
      });
      return {
        castleId: anchor.castleId,
        q: anchor.q,
        r: anchor.r,
        x: labelAnchor.x,
        y: labelAnchor.y,
        distance,
        castleBounds,
        conservativeCastleBounds,
        visible,
        presented: visible
          && (presentedCastleIds === null || presentedCastleIds.has(anchor.castleId))
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
    const pose = cameraController.getPose();
    if (grassLayer?.updateView(pose.focus, pose.mode)) {
      emitTerrainPresentationTelemetry();
    }
    ambientScheduler?.setActive(ambientIsNeeded());
    const viewportHeight = resolveRealmViewportSize({
      canvasWidth: options.canvas.clientWidth,
      canvasHeight: options.canvas.clientHeight,
      visualViewportWidth: window.visualViewport?.width,
      visualViewportHeight: window.visualViewport?.height,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight
    }).height;
    castleLayer?.update(
      cameraController.camera,
      viewportHeight,
      selectedCastleId
    );
    const presentationTelemetry = castleLayer?.getPresentationTelemetry()
      ?? Object.freeze({
        presentedModelCount: 0,
        presentedLandscapeBaseCount: 0,
        raycastTargetCount: 0
      });
    const presentationTelemetryKey = (
      `${presentationTelemetry.presentedModelCount}:`
      + `${presentationTelemetry.presentedLandscapeBaseCount}:`
      + `${presentationTelemetry.raycastTargetCount}`
    );
    if (presentationTelemetryKey !== lastCastlePresentationTelemetryKey) {
      lastCastlePresentationTelemetryKey = presentationTelemetryKey;
      options.onCastlePresentationTelemetry?.(presentationTelemetry);
    }
    const expeditionPresentationNowMicros = localPresentationNowMicros();
    const expeditionPresentationElapsedSeconds = localPresentationElapsedSeconds();
    goldNodeLayer?.update(
      cameraController.camera,
      expeditionPresentationNowMicros,
      expeditionPresentationElapsedSeconds
    );
    foodNodeLayer?.update(
      cameraController.camera,
      expeditionPresentationNowMicros,
      expeditionPresentationElapsedSeconds
    );
    woodNodeLayer?.update(
      cameraController.camera,
      expeditionPresentationNowMicros,
      expeditionPresentationElapsedSeconds
    );
    stoneNodeLayer?.update(
      cameraController.camera,
      expeditionPresentationNowMicros,
      expeditionPresentationElapsedSeconds
    );
    const goldNodeTelemetry = goldNodeLayer?.getPresentationTelemetry();
    if (goldNodeTelemetry) {
      const goldNodeTelemetryKey = [
        goldNodeTelemetry.publicSiteCount,
        goldNodeTelemetry.occupiedSiteCount,
        goldNodeTelemetry.renderedGoldMineCount,
        goldNodeTelemetry.renderedWagonCount,
        goldNodeTelemetry.animatedWagonCount,
        goldNodeTelemetry.markerOnlySiteCount
      ].join(':');
      if (goldNodeTelemetryKey !== lastGoldNodePresentationTelemetryKey) {
        lastGoldNodePresentationTelemetryKey = goldNodeTelemetryKey;
        options.onGoldNodePresentationTelemetry?.(goldNodeTelemetry);
      }
    }
    const foodNodeTelemetry = foodNodeLayer?.getPresentationTelemetry();
    if (foodNodeTelemetry) {
      const foodNodeTelemetryKey = [
        foodNodeTelemetry.publicSiteCount,
        foodNodeTelemetry.occupiedSiteCount,
        foodNodeTelemetry.renderedFoodFarmCount,
        foodNodeTelemetry.renderedWagonCount,
        foodNodeTelemetry.animatedWagonCount,
        foodNodeTelemetry.markerOnlySiteCount
      ].join(':');
      if (foodNodeTelemetryKey !== lastFoodNodePresentationTelemetryKey) {
        lastFoodNodePresentationTelemetryKey = foodNodeTelemetryKey;
        options.onFoodNodePresentationTelemetry?.(foodNodeTelemetry);
      }
    }
    const woodNodeTelemetry = woodNodeLayer?.getPresentationTelemetry();
    if (woodNodeTelemetry) {
      const woodNodeTelemetryKey = [
        woodNodeTelemetry.publicSiteCount,
        woodNodeTelemetry.occupiedSiteCount,
        woodNodeTelemetry.renderedWoodCampCount,
        woodNodeTelemetry.renderedWagonCount,
        woodNodeTelemetry.animatedWagonCount,
        woodNodeTelemetry.markerOnlySiteCount
      ].join(':');
      if (woodNodeTelemetryKey !== lastWoodNodePresentationTelemetryKey) {
        lastWoodNodePresentationTelemetryKey = woodNodeTelemetryKey;
        options.onWoodNodePresentationTelemetry?.(woodNodeTelemetry);
      }
    }
    const stoneNodeTelemetry = stoneNodeLayer?.getPresentationTelemetry();
    if (stoneNodeTelemetry) {
      const stoneNodeTelemetryKey = [
        stoneNodeTelemetry.publicSiteCount,
        stoneNodeTelemetry.occupiedSiteCount,
        stoneNodeTelemetry.renderedStoneQuarryCount,
        stoneNodeTelemetry.renderedWagonCount,
        stoneNodeTelemetry.animatedWagonCount,
        stoneNodeTelemetry.markerOnlySiteCount
      ].join(':');
      if (stoneNodeTelemetryKey !== lastStoneNodePresentationTelemetryKey) {
        lastStoneNodePresentationTelemetryKey = stoneNodeTelemetryKey;
        options.onStoneNodePresentationTelemetry?.(stoneNodeTelemetry);
      }
    }
    environmentGroup?.position.copy(cameraController.camera.position);
    try {
      renderer.render(scene, cameraController.camera);
    } catch (error) {
      if (!isGrassShaderContractFailure(error) || !disableGrassPresentation()) throw error;
      // `onBeforeCompile` runs during rendering. Retry the same frame without
      // only the grass layer if its pinned shader chunk contract has changed.
      renderer.render(scene, cameraController.camera);
    }
    projectCastleLabels();
    if (pendingCastlesReadyCount !== null) {
      const castleCount = pendingCastlesReadyCount;
      if (
        castleCount > 0
        && (presentedCastleIds === null || presentedCastleIds.size > 0)
        && (castleLayer?.getPacking().totalVisible ?? 0) === 0
      ) {
        throw new Error('Hegemony castle instances produced no visible rendered packing.');
      }
      if (
        castleCount > 0
        && !castleLayer?.hasExactCastleLandscapeBasePairing()
      ) {
        throw new Error('Hegemony castle landscape-base presentation is incomplete.');
      }
      pendingCastlesReadyCount = null;
      options.onCastlesReady?.(castleCount);
    }
  };
  // The forest's digest-pinned GLBs resolve after the immediate static
  // fallback. Repaint as soon as that batch is ready so it cannot remain a
  // cone forest until the player next pans, taps, or zooms.
  requestForestModelRender = createRealmForestModelReadyRenderCallback(
    cleanup.isDisposed,
    render
  );
  const strategicOverviewMap = {
    ...options.surface.renderMap,
    radius: REALM_STRATEGIC_OVERVIEW_RADIUS,
    cells: options.surface.renderMap.cells.filter((cell) => (
      hexDistance(cell.coord, { q: 0, r: 0 }) <= REALM_STRATEGIC_OVERVIEW_RADIUS
    ))
  } as const;
  const cameraController = createRealmCameraController({
    bounds: terrainData.bounds,
    // Keep the full generated terrain available to pan/clamp, but make the
    // ordinary overview a readable strategic footprint. The authoritative
    // water apron and outer fog remain outside the initial camera composition.
    overviewHull: createTerrainOverviewHull(strategicOverviewMap, HEX_SIZE),
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
  try {
    goldNodeLayer = createRealmGoldNodeLayer({
      sites: options.goldNodes ?? [],
      surface: options.surface,
      terrainPlacements,
      quality: runtimeQuality,
      baseUrl: options.baseUrl,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      reducedMotion: options.reducedMotion,
      presentationBudget: expeditionSceneBudget.gold,
      onModelReady: render
    });
    scene.add(goldNodeLayer.group);
    cleanup.add(() => {
      const layer = goldNodeLayer;
      if (!layer) return;
      scene.remove(layer.group);
      layer.dispose();
      if (goldNodeLayer === layer) goldNodeLayer = null;
    });
  } catch {
    // Resource visuals are non-authoritative enhancement. A malformed model
    // or exhausted graphics device may not revoke the canonical Realm.
    goldNodeLayer = null;
  }
  try {
    foodNodeLayer = createRealmFoodNodeLayer({
      sites: options.foodNodes ?? [],
      surface: options.surface,
      terrainPlacements,
      quality: runtimeQuality,
      baseUrl: options.baseUrl,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      reducedMotion: options.reducedMotion,
      presentationBudget: expeditionSceneBudget.food,
      onModelReady: render
    });
    scene.add(foodNodeLayer.group);
    cleanup.add(() => {
      const layer = foodNodeLayer;
      if (!layer) return;
      scene.remove(layer.group);
      layer.dispose();
      if (foodNodeLayer === layer) foodNodeLayer = null;
    });
  } catch {
    // Food presentation is independently additive. An asset or graphics
    // failure leaves Food empty but must not revoke Gold or core Realm state.
    foodNodeLayer = null;
  }
  try {
    woodNodeLayer = createRealmWoodNodeLayer({
      sites: options.woodNodes ?? [],
      surface: options.surface,
      terrainPlacements,
      quality: runtimeQuality,
      baseUrl: options.baseUrl,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      reducedMotion: options.reducedMotion,
      presentationBudget: expeditionSceneBudget.wood,
      onModelReady: render
    });
    scene.add(woodNodeLayer.group);
    cleanup.add(() => {
      const layer = woodNodeLayer;
      if (!layer) return;
      scene.remove(layer.group);
      layer.dispose();
      if (woodNodeLayer === layer) woodNodeLayer = null;
    });
  } catch {
    // Wood presentation is independently additive. A model or graphics
    // failure leaves Wood empty without revoking Food, Gold, or core Realm.
    woodNodeLayer = null;
  }
  try {
    stoneNodeLayer = createRealmStoneNodeLayer({
      sites: options.stoneNodes ?? [],
      surface: options.surface,
      terrainPlacements,
      quality: runtimeQuality,
      baseUrl: options.baseUrl,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      reducedMotion: options.reducedMotion,
      presentationBudget: expeditionSceneBudget.stone,
      onModelReady: render
    });
    scene.add(stoneNodeLayer.group);
    cleanup.add(() => {
      const layer = stoneNodeLayer;
      if (!layer) return;
      scene.remove(layer.group);
      layer.dispose();
      if (stoneNodeLayer === layer) stoneNodeLayer = null;
    });
  } catch {
    stoneNodeLayer = null;
  }
  const handleRenderVisibility = () => {
    if (!document.hidden && renderPendingWhileHidden && !cleanup.isDisposed()) render();
  };
  document.addEventListener('visibilitychange', handleRenderVisibility);
  cleanup.add(() => document.removeEventListener('visibilitychange', handleRenderVisibility));
  ambientScheduler = createRealmAmbientScheduler({
    frameCap: renderPlan.grass.animationFrameCap,
    active: ambientIsNeeded(),
    onStep: (elapsedSeconds) => {
      if (cleanup.isDisposed()) return;
      const grassChanged = grassLayer?.updateWind(elapsedSeconds) === true;
      const terrainChanged = decorations.updateWind(elapsedSeconds);
      const wagonsMoving = goldNodeLayer?.hasMovingWagons() === true;
      const foodWagonsMoving = foodNodeLayer?.hasMovingWagons() === true;
      const woodWagonsMoving = woodNodeLayer?.hasMovingWagons() === true;
      const stoneWagonsMoving = stoneNodeLayer?.hasMovingWagons() === true;
      const waterChanged = waterLayer?.updateEnvironment(elapsedSeconds) === true;
      if (
        grassChanged
        || terrainChanged
        || wagonsMoving
        || foodWagonsMoving
        || woodWagonsMoving
        || stoneWagonsMoving
        || waterChanged
      ) render();
    }
  });
  cleanup.add(() => ambientScheduler?.dispose());

  const raycaster = new THREE.Raycaster();
  const normalizedPointer = new THREE.Vector2();
  const interactionRoot = options.canvas.closest<HTMLElement>('.realm-map-screen')
    ?? options.canvas.parentElement
    ?? options.canvas;
  const pointerGestures = createRealmPointerGestureCoordinator({
    capturePointer: (pointerId) => {
      if (typeof interactionRoot.setPointerCapture !== 'function') return false;
      interactionRoot.setPointerCapture(pointerId);
      return typeof interactionRoot.hasPointerCapture !== 'function'
        || interactionRoot.hasPointerCapture(pointerId);
    },
    releasePointer: (pointerId) => {
      if (
        typeof interactionRoot.hasPointerCapture === 'function'
        && !interactionRoot.hasPointerCapture(pointerId)
      ) return;
      interactionRoot.releasePointerCapture?.(pointerId);
    }
  });
  const labelPointerTargets = new Map<number, HTMLElement>();
  let suppressedLabelClickTarget: HTMLElement | null = null;
  let labelClickSuppressionTimer = 0;
  let pendingDirectGesture: PendingRealmDirectGesture | null = null;
  let directGestureFrame = 0;
  let pendingHoverPoint: Readonly<{ x: number; y: number }> | null = null;
  let hoverAnimationFrame = 0;
  let resizeObserver: ResizeObserver | null = null;
  let resizeFrame = 0;
  cleanup.add(() => {
    if (hoverAnimationFrame !== 0) window.cancelAnimationFrame(hoverAnimationFrame);
    hoverAnimationFrame = 0;
    pendingHoverPoint = null;
    if (directGestureFrame !== 0) window.cancelAnimationFrame(directGestureFrame);
    directGestureFrame = 0;
    if (resizeFrame !== 0) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    pendingDirectGesture = null;
    if (labelClickSuppressionTimer !== 0) window.clearTimeout(labelClickSuppressionTimer);
    labelClickSuppressionTimer = 0;
    suppressedLabelClickTarget = null;
    labelPointerTargets.clear();
    pointerGestures.dispose();
    cameraController.endDirectManipulation();
    delete options.canvas.dataset.dragging;
    delete interactionRoot.dataset.cameraInteracting;
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
    const goldNodeHit = goldNodeLayer?.raycast(raycaster);
    if (goldNodeHit) {
      return Object.freeze({
        kind: 'gold-site',
        siteId: goldNodeHit.siteId,
        coord: goldNodeHit.coord
      });
    }
    const foodNodeHit = foodNodeLayer?.raycast(raycaster);
    if (foodNodeHit) {
      return Object.freeze({
        kind: 'food-site',
        siteId: foodNodeHit.siteId,
        coord: foodNodeHit.coord
      });
    }
    const woodNodeHit = woodNodeLayer?.raycast(raycaster);
    if (woodNodeHit) {
      return Object.freeze({
        kind: 'wood-site',
        siteId: woodNodeHit.siteId,
        coord: woodNodeHit.coord
      });
    }
    const stoneNodeHit = stoneNodeLayer?.raycast(raycaster);
    if (stoneNodeHit) {
      return Object.freeze({
        kind: 'stone-site',
        siteId: stoneNodeHit.siteId,
        coord: stoneNodeHit.coord
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
      if (cleanup.isDisposed() || pointerGestures.snapshot().pointerCount > 0 || !point) return;
      dispatchHover(pick(point.x, point.y));
    });
  };

  const laneForTarget = (target: EventTarget | null): RealmPointerStartLane | null => {
    if (target === options.canvas) return 'canvas';
    if (!(target instanceof Element)) return null;
    const label = target.closest('.realm-castle-label');
    return label && interactionRoot.contains(label) ? 'label' : null;
  };

  const localPoint = (clientX: number, clientY: number) => {
    const bounds = options.canvas.getBoundingClientRect();
    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top
    };
  };

  const syncGesturePhase = (result: RealmPointerGestureResult) => {
    const manipulating = result.phase === 'dragging' || result.phase === 'pinching';
    if (manipulating) {
      options.canvas.dataset.dragging = 'true';
      interactionRoot.dataset.cameraInteracting = result.phase;
      return;
    }
    if (result.pointerCount > 0) return;
    cameraController.endDirectManipulation();
    delete options.canvas.dataset.dragging;
    delete interactionRoot.dataset.cameraInteracting;
  };

  const flushDirectGesture = () => {
    if (directGestureFrame !== 0) window.cancelAnimationFrame(directGestureFrame);
    directGestureFrame = 0;
    const gesture = pendingDirectGesture;
    pendingDirectGesture = null;
    if (!gesture || cleanup.isDisposed()) return;
    cameraController.manipulateViewport(
      gesture.startX,
      gesture.startY,
      gesture.endX,
      gesture.endY,
      gesture.kind === 'pinch' ? gesture.zoomAmount : 0
    );
  };

  const scheduleDirectGesture = () => {
    if (directGestureFrame !== 0) return;
    directGestureFrame = window.requestAnimationFrame(() => {
      directGestureFrame = 0;
      flushDirectGesture();
    });
  };

  const queueGesture = (
    result: RealmPointerGestureResult,
    clientX: number,
    clientY: number
  ) => {
    if (result.panDelta) {
      cameraController.beginDirectManipulation();
      const current = localPoint(clientX, clientY);
      if (pendingDirectGesture?.kind === 'pinch') flushDirectGesture();
      if (pendingDirectGesture?.kind === 'pan') {
        pendingDirectGesture.endX = current.x;
        pendingDirectGesture.endY = current.y;
      } else {
        pendingDirectGesture = {
          kind: 'pan',
          startX: current.x - result.panDelta.x,
          startY: current.y - result.panDelta.y,
          endX: current.x,
          endY: current.y
        };
      }
      scheduleDirectGesture();
    }
    if (!result.pinch) return;
    cameraController.beginDirectManipulation();
    if (result.pinch.reset) {
      flushDirectGesture();
      return;
    }
    const current = localPoint(result.pinch.centroid.x, result.pinch.centroid.y);
    const zoomAmount = result.pinch.scaleRatio > 0
      ? Math.log(result.pinch.scaleRatio) * 0.78
      : 0;
    const hasTranslation = Math.abs(result.pinch.centroidDelta.x) >= 0.01
      || Math.abs(result.pinch.centroidDelta.y) >= 0.01;
    if (!hasTranslation && Math.abs(zoomAmount) < 0.000001) return;
    if (pendingDirectGesture?.kind === 'pan') flushDirectGesture();
    if (pendingDirectGesture?.kind === 'pinch') {
      pendingDirectGesture.endX = current.x;
      pendingDirectGesture.endY = current.y;
      pendingDirectGesture.zoomAmount += zoomAmount;
    } else {
      pendingDirectGesture = {
        kind: 'pinch',
        startX: current.x - result.pinch.centroidDelta.x,
        startY: current.y - result.pinch.centroidDelta.y,
        endX: current.x,
        endY: current.y,
        zoomAmount
      };
    }
    scheduleDirectGesture();
  };

  const clearLabelClickSuppression = () => {
    if (labelClickSuppressionTimer !== 0) window.clearTimeout(labelClickSuppressionTimer);
    labelClickSuppressionTimer = 0;
    suppressedLabelClickTarget = null;
    pointerGestures.consumeLabelClickSuppression();
  };

  const armLabelClickSuppression = (target: HTMLElement) => {
    if (labelClickSuppressionTimer !== 0) window.clearTimeout(labelClickSuppressionTimer);
    suppressedLabelClickTarget = target;
    // Compatibility clicks follow pointerup in the same user-interaction task.
    // Expire after that task so stale guards cannot affect later input.
    labelClickSuppressionTimer = window.setTimeout(clearLabelClickSuppression, 0);
  };

  const handlePointerDown = (event: PointerEvent) => {
    const lane = laneForTarget(event.target);
    if (!lane || (event.pointerType !== 'touch' && event.button !== 0)) return;
    if (pointerGestures.snapshot().pointerCount === 0) clearLabelClickSuppression();
    const result = pointerGestures.start({
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      lane,
      x: event.clientX,
      y: event.clientY
    });
    if (!result.accepted) return;
    if (lane === 'label' && event.target instanceof Element) {
      const label = event.target.closest<HTMLElement>('.realm-castle-label');
      if (label) labelPointerTargets.set(event.pointerId, label);
    }
    if (lane === 'canvas' || result.phase === 'pinching') event.preventDefault();
    cancelPendingHover();
    dispatchHover(null);
    queueGesture(result, event.clientX, event.clientY);
    syncGesturePhase(result);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerGestures.snapshot().pointerCount === 0) {
      if (event.target === options.canvas) scheduleHover(event.clientX, event.clientY);
      return;
    }
    const coalesced = event.getCoalescedEvents?.() ?? [];
    const sample = coalesced.at(-1) ?? event;
    const result = pointerGestures.move({
      pointerId: sample.pointerId,
      pointerType: sample.pointerType,
      buttons: sample.buttons,
      x: sample.clientX,
      y: sample.clientY
    });
    if (!result.accepted) return;
    cancelPendingHover();
    if (result.phase !== 'pending' || result.cancelled) event.preventDefault();
    queueGesture(result, sample.clientX, sample.clientY);
    if (result.cancelled) {
      labelPointerTargets.delete(sample.pointerId);
      flushDirectGesture();
      clearLabelClickSuppression();
    }
    syncGesturePhase(result);
  };

  const activateCanvasTap = (clientX: number, clientY: number) => {
    const picked = pick(clientX, clientY);
    if (!picked) return;
    selectedCastleId = picked.kind === 'castle' ? picked.castleId : undefined;
    selectedGoldSiteId = picked.kind === 'gold-site' ? picked.siteId : undefined;
    selectedFoodSiteId = picked.kind === 'food-site' ? picked.siteId : undefined;
    selectedWoodSiteId = picked.kind === 'wood-site' ? picked.siteId : undefined;
    selectedStoneSiteId = picked.kind === 'stone-site' ? picked.siteId : undefined;
    goldNodeLayer?.setSelectedSiteId(selectedGoldSiteId ?? null);
    foodNodeLayer?.setSelectedSiteId(selectedFoodSiteId ?? null);
    woodNodeLayer?.setSelectedSiteId(selectedWoodSiteId ?? null);
    stoneNodeLayer?.setSelectedSiteId(selectedStoneSiteId ?? null);
    dispatchSelect(picked);
    render();
    if (picked.kind === 'castle' && picked.castleId === options.ownCastleId) {
      cameraController.focusKeep();
    }
  };

  const handlePointerUp = (event: PointerEvent) => {
    const labelTarget = labelPointerTargets.get(event.pointerId);
    labelPointerTargets.delete(event.pointerId);
    const result = pointerGestures.end({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    });
    if (!result.accepted) return;
    queueGesture(result, event.clientX, event.clientY);
    flushDirectGesture();
    if (labelTarget && !result.tap) armLabelClickSuppression(labelTarget);
    if (result.tap?.lane === 'canvas') activateCanvasTap(result.tap.x, result.tap.y);
    syncGesturePhase(result);
    if (result.pointerCount === 0) {
      const hitTarget = document.elementFromPoint?.(event.clientX, event.clientY) ?? event.target;
      if (laneForTarget(hitTarget)) scheduleHover(event.clientX, event.clientY);
      else dispatchHover(null);
    }
  };

  const handlePointerCancel = (event: PointerEvent) => {
    labelPointerTargets.delete(event.pointerId);
    const result = pointerGestures.cancel(event.pointerId);
    if (!result.accepted) return;
    flushDirectGesture();
    clearLabelClickSuppression();
    dispatchHover(null);
    syncGesturePhase(result);
  };

  const handleLostPointerCapture = (event: PointerEvent) => {
    labelPointerTargets.delete(event.pointerId);
    const result = pointerGestures.lostCapture(event.pointerId);
    if (!result.accepted) return;
    flushDirectGesture();
    clearLabelClickSuppression();
    dispatchHover(null);
    syncGesturePhase(result);
  };

  const cancelAllPointers = (result: RealmPointerGestureResult) => {
    if (!result.accepted) return;
    labelPointerTargets.clear();
    flushDirectGesture();
    clearLabelClickSuppression();
    cancelPendingHover();
    dispatchHover(null);
    syncGesturePhase(result);
  };

  const handleWindowBlur = () => cancelAllPointers(pointerGestures.blur());
  const handlePointerVisibility = () => {
    cancelAllPointers(pointerGestures.visibilityChanged(document.hidden));
  };

  const handleLabelClickCapture = (event: MouseEvent) => {
    // Keyboard and assistive-technology activation carries no mouse click
    // count and must never be consumed by a prior pointer gesture.
    if (event.detail === 0 || !(event.target instanceof Element)) return;
    const label = event.target.closest<HTMLElement>('.realm-castle-label');
    if (!label || label !== suppressedLabelClickTarget) return;
    if (!pointerGestures.consumeLabelClickSuppression()) return;
    if (labelClickSuppressionTimer !== 0) window.clearTimeout(labelClickSuppressionTimer);
    labelClickSuppressionTimer = 0;
    suppressedLabelClickTarget = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handlePointerLeave = () => {
    if (pointerGestures.snapshot().pointerCount === 0) {
      cancelPendingHover();
      dispatchHover(null);
    }
  };
  const handleWheel = (event: WheelEvent) => {
    const lane = laneForTarget(event.target);
    if (!lane) return;
    event.preventDefault();
    // Camera motion invalidates the last canvas hit. Clear it immediately so
    // a stationary pointer cannot leave a label highlighted after its castle
    // has moved elsewhere on screen; the next pointer move performs a fresh
    // identity-aware raycast.
    cancelPendingHover();
    dispatchHover(null);
    const label = lane === 'label' && event.target instanceof Element
      ? event.target.closest<HTMLElement>('.realm-castle-label')
      : null;
    const castleId = Number(label?.dataset.castleId);
    const castle = Number.isSafeInteger(castleId)
      ? authoritativeCastleById.get(castleId)
      : undefined;
    if (castle) {
      const foundation = {
        x: castle.x,
        y: castle.groundY + CASTLE_GROUND_LIFT,
        z: castle.z
      };
      const projected = cameraController.projectPoint(foundation);
      if (projected.visible) {
        cameraController.zoomByWheelAtWorld(
          event.deltaY,
          event.deltaMode,
          foundation,
          projected.x,
          projected.y
        );
        return;
      }
    }
    const point = localPoint(event.clientX, event.clientY);
    cameraController.zoomByWheel(event.deltaY, event.deltaMode, point.x, point.y);
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    if (cleanup.isDisposed()) return;
    disposeScene();
    options.onRendererUnavailable();
  };

  interactionRoot.addEventListener('pointerdown', handlePointerDown, {
    capture: true,
    passive: false
  });
  cleanup.add(() => interactionRoot.removeEventListener('pointerdown', handlePointerDown, true));
  if (interactionRoot === options.canvas) {
    interactionRoot.addEventListener('pointermove', handlePointerMove, { passive: false });
    cleanup.add(() => interactionRoot.removeEventListener('pointermove', handlePointerMove));
    interactionRoot.addEventListener('pointerup', handlePointerUp);
    cleanup.add(() => interactionRoot.removeEventListener('pointerup', handlePointerUp));
    interactionRoot.addEventListener('pointercancel', handlePointerCancel);
    cleanup.add(() => interactionRoot.removeEventListener('pointercancel', handlePointerCancel));
  } else {
    window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
    cleanup.add(() => window.removeEventListener('pointermove', handlePointerMove, true));
    window.addEventListener('pointerup', handlePointerUp, true);
    cleanup.add(() => window.removeEventListener('pointerup', handlePointerUp, true));
    window.addEventListener('pointercancel', handlePointerCancel, true);
    cleanup.add(() => window.removeEventListener('pointercancel', handlePointerCancel, true));
  }
  interactionRoot.addEventListener('lostpointercapture', handleLostPointerCapture);
  cleanup.add(() => interactionRoot.removeEventListener(
    'lostpointercapture',
    handleLostPointerCapture
  ));
  window.addEventListener('blur', handleWindowBlur);
  cleanup.add(() => window.removeEventListener('blur', handleWindowBlur));
  document.addEventListener('visibilitychange', handlePointerVisibility);
  cleanup.add(() => document.removeEventListener('visibilitychange', handlePointerVisibility));
  interactionRoot.addEventListener('click', handleLabelClickCapture, true);
  cleanup.add(() => interactionRoot.removeEventListener('click', handleLabelClickCapture, true));
  options.canvas.addEventListener('pointerleave', handlePointerLeave);
  cleanup.add(() => options.canvas.removeEventListener('pointerleave', handlePointerLeave));
  interactionRoot.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  cleanup.add(() => interactionRoot.removeEventListener('wheel', handleWheel, true));
  options.canvas.addEventListener('webglcontextlost', handleContextLost);
  cleanup.add(() => options.canvas.removeEventListener('webglcontextlost', handleContextLost));

  const resize = () => {
    if (cleanup.isDisposed()) return;
    const visualViewport = window.visualViewport;
    const { width, height } = resolveRealmViewportSize({
      canvasWidth: options.canvas.clientWidth,
      canvasHeight: options.canvas.clientHeight,
      visualViewportWidth: visualViewport?.width,
      visualViewportHeight: visualViewport?.height,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight
    });
    renderer.setPixelRatio(resolveRealmPixelRatio(
      width,
      height,
      window.devicePixelRatio || 1,
      options.quality
    ));
    renderer.setSize(width, height, false);
    cameraController.setViewport(width, height);
  };
  const scheduleResize = () => {
    if (resizeFrame !== 0 || cleanup.isDisposed()) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  };
  resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(scheduleResize);
  if (resizeObserver) cleanup.add(() => resizeObserver?.disconnect());
  resizeObserver?.observe(options.canvas);
  window.addEventListener('resize', scheduleResize);
  cleanup.add(() => window.removeEventListener('resize', scheduleResize));
  const visualViewport = window.visualViewport;
  visualViewport?.addEventListener('resize', scheduleResize, { passive: true });
  visualViewport?.addEventListener('scroll', scheduleResize, { passive: true });
  cleanup.add(() => {
    visualViewport?.removeEventListener('resize', scheduleResize);
    visualViewport?.removeEventListener('scroll', scheduleResize);
  });
  resize();

  const usedCastleLods = castleLodsForQuality(runtimeQuality);
  const prefabRepository = createHegemonyKeepPrefabRepository({
    baseUrl: options.baseUrl,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
  });
  const castleLoadAbortController = new AbortController();
  cleanup.add(() => castleLoadAbortController.abort());

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
        pendingCastlesReadyCount = 0;
        render();
      }
      return;
    }

    const leases: HegemonyKeepPrefabLease[] = [];
    let acquisitionStopped = false;
    try {
      await Promise.all(usedCastleLods.map(async (lod) => {
        try {
          const lease = await prefabRepository.acquire(
            lod,
            castleLoadAbortController.signal
          );
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
    const nextProjectionEnvelopeByLod = new Map([...prefabs].map(([lod, prefab]) => [
      lod,
      prefab.projectionEnvelope
    ] as const));
    const nextRenderEnvelopeByLod = new Map([...prefabs].map(([lod, prefab]) => [
      lod,
      prefab.renderProjectionEnvelope
    ] as const));
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

    if (presentedCastleIds !== null) {
      nextLayer.setPresentedCastleIds([...presentedCastleIds]);
    }
    castleLayer = nextLayer;
    castleProjectionEnvelopeByLod = nextProjectionEnvelopeByLod;
    castleRenderEnvelopeByLod = nextRenderEnvelopeByLod;
    fallbackCastleProjectionEnvelope = nextProjectionEnvelopeByLod
      .get(castleLodPolicy.maximumLod)
      ?? nextProjectionEnvelopeByLod.get('compact')
      ?? DEFAULT_CASTLE_PROJECTION_ENVELOPE;
    fallbackCastleRenderEnvelope = nextRenderEnvelopeByLod
      .get(castleLodPolicy.maximumLod)
      ?? nextRenderEnvelopeByLod.get('compact')
      ?? DEFAULT_CASTLE_PROJECTION_ENVELOPE;
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
    pendingCastlesReadyCount = authoritativeCastles.length;
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

  let liveReconciliationCount = 0;
  let rejectedLiveReconciliationCount = 0;
  const recordLiveReconciliationTelemetry = (accepted: boolean) => {
    if (accepted) liveReconciliationCount += 1;
    else rejectedLiveReconciliationCount += 1;
    options.canvas.dataset.realmDynamicReconciliationCount = String(liveReconciliationCount);
    options.canvas.dataset.realmDynamicReconciliationRejected = String(
      rejectedLiveReconciliationCount
    );
  };
  const matchesStaticCatalog = <T extends {
    siteId: string;
    coord: HexCoord;
    tier: number;
  }>(next: readonly T[], initial: readonly T[]) => {
    if (next.length !== initial.length) return false;
    const initialBySiteId = new Map(initial.map((record) => [record.siteId, record]));
    const seen = new Set<string>();
    for (const record of next) {
      const initialRecord = initialBySiteId.get(record.siteId);
      if (
        !initialRecord
        || seen.has(record.siteId)
        || record.coord.q !== initialRecord.coord.q
        || record.coord.r !== initialRecord.coord.r
        || record.tier !== initialRecord.tier
      ) return false;
      seen.add(record.siteId);
    }
    return seen.size === initialBySiteId.size;
  };
  const reconcileLiveGatheringState = (state: RealmLiveGatheringState) => {
    if (
      cleanup.isDisposed()
      || typeof state?.observedAtMicros !== 'bigint'
      || state.observedAtMicros < 0n
      || !Array.isArray(state.goldNodes)
      || !Array.isArray(state.foodNodes)
      || !Array.isArray(state.woodNodes)
      || !Array.isArray(state.stoneNodes)
      || !matchesStaticCatalog(state.goldNodes, options.goldNodes ?? [])
      || !matchesStaticCatalog(state.foodNodes, options.foodNodes ?? [])
      || !matchesStaticCatalog(state.woodNodes, options.woodNodes ?? [])
      || !matchesStaticCatalog(state.stoneNodes, options.stoneNodes ?? [])
    ) {
      recordLiveReconciliationTelemetry(false);
      return;
    }
    const accepted = (
      goldNodeLayer?.canReconcile(state.goldNodes) ?? true
    ) && (
      foodNodeLayer?.canReconcile(state.foodNodes) ?? true
    ) && (
      woodNodeLayer?.canReconcile(state.woodNodes) ?? true
    ) && (
      stoneNodeLayer?.canReconcile(state.stoneNodes) ?? true
    );
    if (accepted) {
      goldNodeLayer?.reconcile(state.goldNodes);
      foodNodeLayer?.reconcile(state.foodNodes);
      woodNodeLayer?.reconcile(state.woodNodes);
      stoneNodeLayer?.reconcile(state.stoneNodes);
    }
    recordLiveReconciliationTelemetry(accepted);
    if (accepted) render();
  };
  const getCameraAttestation = (): RealmCameraAttestation => {
    const pose = cameraController.getPose();
    return Object.freeze({
      sceneBuildSequence,
      sceneId: scene.uuid,
      canvasId,
      mode: cameraController.getMode(),
      position: Object.freeze({ ...pose.position }),
      target: Object.freeze({ ...pose.target }),
      fov: pose.fov,
      zoom: cameraController.getZoom(),
      selectedTerrainCoord: selectedTerrainCoord
        ? Object.freeze({ ...selectedTerrainCoord })
        : null,
      selectedCastleId: selectedCastleId ?? null,
      selectedGoldSiteId: selectedGoldSiteId ?? null,
      selectedFoodSiteId: selectedFoodSiteId ?? null,
      selectedWoodSiteId: selectedWoodSiteId ?? null,
      selectedStoneSiteId: selectedStoneSiteId ?? null
    });
  };

  return {
    dispose: disposeScene,
    reconcileLiveGatheringState,
    getCameraAttestation,
    getSceneBuildSequence: () => sceneBuildSequence,
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
      const width = Math.max(1, options.canvas.clientWidth || window.innerWidth || 1);
      const height = Math.max(1, options.canvas.clientHeight || window.innerHeight || 1);
      const targetZoom = foundingDistrictZoomForViewport(
        options.surface.playableMap.radius,
        width / height
      );
      cameraController.frameAt(foundingDistrictFocus(), targetZoom);
    },
    focusKeep: cameraController.focusKeep,
    recenterKeep: cameraController.recenterKeep,
    setHovered: (coord) => {
      if (cleanup.isDisposed()) return;
      hoveredTerrainCoord = coord;
      grassLayer?.setInteraction(selectedTerrainCoord, hoveredTerrainCoord);
      // A terrain hex runs through the wider authored landscape-base mesh.
      // Castle identity and raycasting already provide the occupied-cell cue,
      // so reserve this outline for empty terrain instead of drawing through
      // the model and presenting the intersection as base clipping.
      setOverlay(
        hoverOverlay,
        options.surface,
        terrainOverlayCoord(coord),
        terrainPlacements
      );
      render();
    },
    setPresentedCastleIds: (castleIds) => {
      if (cleanup.isDisposed()) return;
      const ordered = [...new Set(castleIds)].sort((left, right) => left - right);
      const key = ordered.join(',');
      if (key === presentedCastleKey) return;
      presentedCastleIds = new Set(ordered);
      presentedCastleKey = key;
      castleLayer?.setPresentedCastleIds(ordered);
      lastCastleProjectionKey = '';
      render();
    },
    setSelected: (coord) => {
      if (cleanup.isDisposed()) return;
      selectedTerrainCoord = coord;
      grassLayer?.setInteraction(selectedTerrainCoord, hoveredTerrainCoord);
      selectedCastleId = coord
        ? authoritativeCastles.find((castle) => (
          castle.coord.q === coord.q && castle.coord.r === coord.r
        ))?.castleId
        : undefined;
      setOverlay(
        selectedOverlay,
        options.surface,
        terrainOverlayCoord(coord),
        terrainPlacements
      );
      render();
    },
    setSelectedCastleId: (castleId) => {
      if (cleanup.isDisposed()) return;
      selectedCastleId = castleId === null ? undefined : castleId;
      if (castleId !== null) {
        selectedTerrainCoord = null;
        grassLayer?.setInteraction(selectedTerrainCoord, hoveredTerrainCoord);
        setOverlay(selectedOverlay, options.surface, null, terrainPlacements);
      }
      render();
    },
    setSelectedGoldSiteId: (siteId) => {
      if (cleanup.isDisposed()) return;
      selectedGoldSiteId = siteId === null ? undefined : siteId;
      goldNodeLayer?.setSelectedSiteId(siteId);
      if (siteId !== null) setOverlay(selectedOverlay, options.surface, null, terrainPlacements);
      render();
    },
    setSelectedFoodSiteId: (siteId) => {
      if (cleanup.isDisposed()) return;
      selectedFoodSiteId = siteId === null ? undefined : siteId;
      foodNodeLayer?.setSelectedSiteId(siteId);
      if (siteId !== null) setOverlay(selectedOverlay, options.surface, null, terrainPlacements);
      render();
    },
    setSelectedWoodSiteId: (siteId) => {
      if (cleanup.isDisposed()) return;
      selectedWoodSiteId = siteId === null ? undefined : siteId;
      woodNodeLayer?.setSelectedSiteId(siteId);
      if (siteId !== null) setOverlay(selectedOverlay, options.surface, null, terrainPlacements);
      render();
    },
    setSelectedStoneSiteId: (siteId) => {
      if (cleanup.isDisposed()) return;
      selectedStoneSiteId = siteId === null ? undefined : siteId;
      stoneNodeLayer?.setSelectedSiteId(siteId);
      if (siteId !== null) setOverlay(selectedOverlay, options.surface, null, terrainPlacements);
      render();
    },
    setComposition: (composition) => cameraController.setComposition(composition),
    showRealm: cameraController.showRealm
  };
}
