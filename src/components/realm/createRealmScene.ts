import * as THREE from 'three';

import {
  axialToWorld,
  hexDistance,
  worldToNearestAxial,
  type HexCoord
} from '../../game/map/hexCoordinates';
import { generateTerrainDecorations } from '../../game/map/terrainDecorations';
import { generateRealmTerrainFeatures } from '../../game/map/realmTerrainFeatures';
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
import { createRealmTerrainFeatureLayers } from './createRealmTerrainFeatures';
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
import { createRealmAmbientScheduler } from './realmAmbientScheduler';
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
const CAMERA_FILL_HEIGHT = 3;
// Preserve the former neutral fill's upward irradiance while moving its
// horizontal direction onto the fixed Realm camera azimuth. This reveals
// camera-facing castle materials without globally brightening the terrain.
const CAMERA_FILL_UPWARD_IRRADIANCE = 0.1094;
const CAMERA_FILL_INTENSITY = CAMERA_FILL_UPWARD_IRRADIANCE
  * Math.hypot(CAMERA_FILL_HORIZONTAL_DISTANCE, CAMERA_FILL_HEIGHT)
  / CAMERA_FILL_HEIGHT;
const DEFAULT_CASTLE_PROJECTION_ENVELOPE = createCastleBoundsProjectionEnvelope({
  minX: -0.74,
  minY: 0,
  minZ: -0.74,
  maxX: 0.74,
  maxY: 1.08,
  maxZ: 0.74
})!;

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
  | Readonly<{ kind: 'terrain'; coord: HexCoord }>;

export type RealmTerrainPresentationTelemetry = Readonly<{
  semanticCellCount: number;
  semanticKindCount: number;
  semanticFeatureCount: number;
  semanticFeatureDrawCalls: number;
  totalDetailInstanceCount: number;
  totalDetailDrawCalls: number;
}>;

export type RealmSceneHandle = Readonly<{
  dispose: () => void;
  focusCastle: (castleId: number) => void;
  /** Frames a named collision cluster at approach distance, preserving context. */
  focusCastleGroup: (castleIds: readonly number[]) => void;
  focusCell: (coord: HexCoord) => void;
  frameFoundingDistrict: () => void;
  focusKeep: () => void;
  recenterKeep: () => void;
  setHovered: (coord: HexCoord | null) => void;
  setPresentedCastleIds: (castleIds: readonly number[]) => void;
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
  placements: readonly TerrainStructurePlacement[],
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>
) {
  const data = createTerrainGeometryData(surface.renderMap, HEX_SIZE, {
    subdivisionsPerEdge,
    playableRadius: surface.playableMap.radius,
    placements,
    terrainKindsByKey
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

  const { data: terrainData, geometry: terrainGeometry } = createTerrainGeometry(
    options.surface,
    renderPlan.subdivisionsPerEdge,
    terrainPlacements,
    terrainSemantics.terrainKindsByKey
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
    terrainPlacements,
    terrainSemantics.terrainKindsByKey
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

  const semanticFeatureData = generateRealmTerrainFeatures(
    options.surface.renderMap,
    terrainSemantics.terrainKindsByKey,
    runtimeQuality.id,
    HEX_SIZE,
    terrainPlacements,
    terrainSemantics.castleSlotKeys
  );
  const totalDetailInstanceCount = decorationData.points.length
    + semanticFeatureData.points.length;
  if (totalDetailInstanceCount > renderPlan.decorationInstanceBudget) {
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
  options.onTerrainPresentationTelemetry?.(Object.freeze({
    semanticCellCount: terrainSemantics.terrainKindsByKey.size,
    semanticKindCount: Object.values(terrainSemantics.terrainKindCounts)
      .filter((count) => count > 0).length,
    semanticFeatureCount: semanticFeatures.instanceCount,
    semanticFeatureDrawCalls: semanticFeatures.drawCalls,
    totalDetailInstanceCount,
    totalDetailDrawCalls: decorations.drawCalls + semanticFeatures.drawCalls
  }));

  const hemisphere = new THREE.HemisphereLight('#ece9f4', '#332c3c', 0.84);
  const sun = new THREE.DirectionalLight('#ffddb0', lighting.sunIntensity);
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
  const skyFill = new THREE.DirectionalLight('#a991d0', 0.56);
  skyFill.position.set(8, 6.5, -9);
  const cameraAzimuth = THREE.MathUtils.degToRad(DEFAULT_REALM_CAMERA_SPEC.azimuthDegrees);
  const neutralFill = new THREE.DirectionalLight('#d5d9e2', CAMERA_FILL_INTENSITY);
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

  const castleLabelAnchors = authoritativeCastles.map((castle) => ({
    castleId: castle.castleId,
    q: castle.coord.q,
    r: castle.coord.r,
    x: castle.x,
    renderY: castle.groundY + CASTLE_GROUND_LIFT,
    z: castle.z
  }));

  let castleLayer: RealmCastleInstanceLayer | null = null;
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
  let presentedCastleIds: ReadonlySet<number> | null = null;
  let presentedCastleKey = '*';
  let renderPendingWhileHidden = false;
  let pendingCastlesReadyCount: number | null = null;
  const projectionPoint = new THREE.Vector3();
  const projectionBoundsPoint = new THREE.Vector3();
  const projectCastleLabels = () => {
    const width = Math.max(1, options.canvas.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, options.canvas.clientHeight || window.innerHeight || 1);
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
      const activeLod = castleLayer
        ?.getPacking()
        .lodByCastleId[String(anchor.castleId)];
      const projectionEnvelope = activeLod
        ? castleProjectionEnvelopeByLod.get(activeLod)
          ?? fallbackCastleProjectionEnvelope
        : fallbackCastleProjectionEnvelope;
      const renderEnvelope = activeLod
        ? castleRenderEnvelopeByLod.get(activeLod)
          ?? fallbackCastleRenderEnvelope
        : fallbackCastleRenderEnvelope;
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
      const visible = castleSilhouetteIntersectsViewport(
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
    const viewportHeight = Math.max(
      1,
      options.canvas.clientHeight || window.innerHeight || 1
    );
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
    environmentGroup?.position.copy(cameraController.camera.position);
    renderer.render(scene, cameraController.camera);
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
        presentationTelemetry.presentedLandscapeBaseCount
        !== presentationTelemetry.presentedModelCount
      ) {
        throw new Error('Hegemony castle landscape-base presentation is incomplete.');
      }
      pendingCastlesReadyCount = null;
      options.onCastlesReady?.(castleCount);
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
  cleanup.add(cameraController.dispose);
  const handleRenderVisibility = () => {
    if (!document.hidden && renderPendingWhileHidden && !cleanup.isDisposed()) render();
  };
  document.addEventListener('visibilitychange', handleRenderVisibility);
  cleanup.add(() => document.removeEventListener('visibilitychange', handleRenderVisibility));
  const ambientScheduler = createRealmAmbientScheduler({
    enabled: decorations.animated
      && options.quality.id !== 'reduced'
      && !options.reducedMotion,
    onStep: (elapsedSeconds) => {
      if (!cleanup.isDisposed() && decorations.updateWind(elapsedSeconds)) render();
    }
  });
  cleanup.add(ambientScheduler.dispose);

  const raycaster = new THREE.Raycaster();
  const normalizedPointer = new THREE.Vector2();
  const pointers = new Map<number, PointerSample>();
  let lastPinchGesture: RealmPinchGesture | null = null;
  let pendingHoverPoint: Readonly<{ x: number; y: number }> | null = null;
  let hoverAnimationFrame = 0;
  let resizeObserver: ResizeObserver | null = null;
  cleanup.add(() => {
    if (hoverAnimationFrame !== 0) window.cancelAnimationFrame(hoverAnimationFrame);
    hoverAnimationFrame = 0;
    pendingHoverPoint = null;
    pointers.clear();
    lastPinchGesture = null;
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
      lastPinchGesture = resolveRealmPinchGesture(pointers);
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
      const nextPinchGesture = resolveRealmPinchGesture(pointers);
      if (lastPinchGesture && nextPinchGesture) {
        const centroidDeltaX = nextPinchGesture.centroid.x - lastPinchGesture.centroid.x;
        const centroidDeltaY = nextPinchGesture.centroid.y - lastPinchGesture.centroid.y;
        if (Math.abs(centroidDeltaX) >= 0.01 || Math.abs(centroidDeltaY) >= 0.01) {
          cameraController.panByPixels(centroidDeltaX, centroidDeltaY);
        }
        if (lastPinchGesture.distance > 0 && nextPinchGesture.distance > 0) {
          const canvasBounds = options.canvas.getBoundingClientRect();
          cameraController.zoomByAt(
            Math.log(nextPinchGesture.distance / lastPinchGesture.distance) * 0.78,
            nextPinchGesture.centroid.x - canvasBounds.left,
            nextPinchGesture.centroid.y - canvasBounds.top
          );
        }
      }
      lastPinchGesture = nextPinchGesture;
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
    lastPinchGesture = resolveRealmPinchGesture(pointers);
    if (pointers.size === 1) {
      pointers.forEach((remaining) => {
        remaining.previousX = remaining.x;
        remaining.previousY = remaining.y;
      });
    }
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
    focusCastleGroup: (castleIds) => {
      if (cleanup.isDisposed()) return;
      const requestedIds = new Set(castleIds.filter((castleId) => Number.isSafeInteger(castleId)));
      const castles = authoritativeCastles.filter((castle) => requestedIds.has(castle.castleId));
      if (castles.length === 0) return;
      const minimumX = Math.min(...castles.map((castle) => castle.x));
      const maximumX = Math.max(...castles.map((castle) => castle.x));
      const minimumZ = Math.min(...castles.map((castle) => castle.z));
      const maximumZ = Math.max(...castles.map((castle) => castle.z));
      const groupFootprint = Math.max(
        castleFocusSize.footprintDiameter,
        maximumX - minimumX + castleFocusSize.footprintDiameter,
        maximumZ - minimumZ + castleFocusSize.footprintDiameter
      );
      cameraController.frameAt({
        x: (minimumX + maximumX) / 2,
        y: castles.reduce((sum, castle) => sum + castle.groundY, 0) / castles.length,
        z: (minimumZ + maximumZ) / 2,
        height: castleFocusSize.height,
        footprintDiameter: groupFootprint
      }, 0.68);
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
      setOverlay(hoverOverlay, options.surface, coord, terrainPlacements);
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
