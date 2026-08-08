import * as THREE from 'three';

import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';
import {
  innerKeepPresentationIntegrity,
  type InnerKeepBuildingPresentation,
  type InnerKeepBuildingKind,
  type InnerKeepPresentation
} from './innerKeepPresentation';
import {
  INNER_KEEP_LAYOUT_V1_SLOTS
} from './innerKeepLayoutV1';
import {
  allInnerKeepStaticRuntimeAssetIds,
  createInnerKeepAuthoredBuilding,
  createInnerKeepAuthoredStaticPresentation,
  hasCompleteInnerKeepStaticRuntimeCoverage,
  type InnerKeepAuthoredStaticPresentation
} from './createInnerKeepAuthoredPresentation';
import {
  createInnerKeepEcology,
  type InnerKeepEcology
} from './createInnerKeepEcology';
import {
  createInnerKeepPopulationPresentation,
  type InnerKeepPopulationPresentation
} from './createInnerKeepPopulationPresentation';
import {
  createInnerKeepOuterWorldPresentation,
  type InnerKeepOuterWorldPresentation,
  type InnerKeepOuterWorldTelemetry
} from './createInnerKeepOuterWorldPresentation';
import {
  createInnerKeepRabbitPresentation,
  type InnerKeepRabbitPresentation,
  type InnerKeepRabbitPresentationStatus
} from './createInnerKeepRabbitPresentation';
import {
  createInnerKeepAmbientSimulationPlan,
  type InnerKeepAmbientSimulationPlan
} from './innerKeepAmbientTimeline';
import {
  loadInnerKeepRuntimeAssetBundle,
  type InnerKeepRuntimeAssetBundle
} from './loadInnerKeepRuntimeAssets';
import {
  INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
  INNER_KEEP_PRESENTATION_CLEARANCES
} from './innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_CITY_DISTRICT_ROADS,
  INNER_KEEP_CITY_EDGE_APRON_POINTS,
  INNER_KEEP_OUTER_WORLD_APPROACHES,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES,
  INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT,
  INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES,
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE,
  innerKeepOuterWorldTerrainHeightAt
} from './innerKeepOuterWorldPolicy';

export type InnerKeepSceneQuality = 'high' | 'balanced' | 'reduced';

/**
 * Hard visible scene-graph ceilings. Actual GPU calls are captured separately
 * by the QA renderer because high-quality shadow passes can redraw casters.
 */
export const INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ drawCalls: 390, triangles: 420_000 }),
  balanced: Object.freeze({ drawCalls: 310, triangles: 215_000 }),
  reduced: Object.freeze({ drawCalls: 235, triangles: 110_000 })
} satisfies Readonly<Record<InnerKeepSceneQuality, Readonly<{
  drawCalls: number;
  triangles: number;
}>>>);

export function innerKeepSceneGraphExceedsRenderBudget(
  quality: InnerKeepSceneQuality,
  telemetry: Pick<InnerKeepSceneTelemetry, 'drawCalls' | 'triangleCount'>
) {
  const budget = INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS[quality];
  return telemetry.drawCalls > budget.drawCalls
    || telemetry.triangleCount > budget.triangles;
}

export type InnerKeepSceneVisualContext = Readonly<{
  owningTerrainKind: RealmTerrainKind;
}>;

export type InnerKeepSceneTelemetry = Readonly<{
  status: 'empty' | 'ready' | 'unavailable';
  assetStatus: 'idle' | 'loading' | 'ready' | 'degraded';
  triangleCount: number;
  drawCalls: number;
  smokeSpriteCount: number;
  grassBladeCount: number;
  waterSurfaceCount: number;
  authoredAssetCount: number;
  authoredPlacementCount: number;
  authoredTreeCount: number;
  ambientActorCount: number;
  mountedActorCount: number;
  patrolUnitCount: number;
  activeConversationCount: number;
  animationMixerCount: number;
  runtimeAssetFailureCount: number;
  outerWorldStatus: 'idle' | InnerKeepOuterWorldTelemetry['status'];
  outerWorldRuntimeAssetFailureCount: number;
  topographicFeatureCount: number;
  terrainTriangleCount: number;
  terrainHeightRangeMillimeters: number;
  exteriorTreeCount: number;
  scenicResourceNodeCount: number;
  wildlifeAssetStatus: 'idle' | InnerKeepRabbitPresentationStatus;
  wildlifeCount: number;
  exactWildlifeCount: number;
  proceduralWildlifeCount: number;
  tradeWagonCount: number;
  exteriorActorCount: number;
  exteriorMountedActorCount: number;
  exteriorPatrolUnitCount: number;
  slotCount: number;
  completedBuildingCount: number;
  constructionSiteCount: number;
  completionRevealActive: boolean;
}>;

export type InnerKeepSlotProjection = Readonly<{
  slotId: string;
  /** Client-space center of the exact rendered pad bounds. */
  x: number;
  y: number;
  /** Client-space bounds of the exact rendered pad, before the CSS tap floor. */
  width: number;
  height: number;
  visible: boolean;
}>;

export type InnerKeepSlotProjectionFrame = Readonly<{
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  slots: readonly InnerKeepSlotProjection[];
}>;

export type InnerKeepSceneLayer = Readonly<{
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  dispose: () => void;
  getAnimationFrameCap: () => number;
  getSlotProjectionFrame: () => InnerKeepSlotProjectionFrame;
  getTelemetry: () => InnerKeepSceneTelemetry;
  isAnimationActive: () => boolean;
  panByPixels: (deltaX: number, deltaY: number) => void;
  pickSlot: (clientX: number, clientY: number) => string | null;
  reconcile: (
    presentation: InnerKeepPresentation | null,
    context?: InnerKeepSceneVisualContext
  ) => void;
  setSelectedSlot: (slotId: string | null) => void;
  setViewport: (width: number, height: number) => void;
  update: (elapsedSeconds: number) => boolean;
  zoomByWheel: (deltaY: number, deltaMode: number) => void;
}>;

export type CreateInnerKeepSceneLayerOptions = Readonly<{
  canvas: HTMLCanvasElement;
  quality: InnerKeepSceneQuality;
  reducedMotion: boolean;
  requestRender: () => void;
  baseUrl?: string;
  maxAnisotropy?: number;
  /** Local/unit-test escape hatch; production leaves exact asset loading on. */
  assetLoading?: 'auto' | 'disabled';
  /** Optional countryside models fail independently from the core bundle. */
  outerWorldAssetLoading?: 'auto' | 'disabled';
  /** Deterministic test seam; production always uses the integrity-pinned loader. */
  runtimeAssetLoader?: typeof loadInnerKeepRuntimeAssetBundle;
}>;

const SLOT_POSITIONS = new Map(INNER_KEEP_LAYOUT_V1_SLOTS.map((slot) => [
  slot.slotId,
  Object.freeze({
    x: Number(slot.localXMicrounits) / 1_000_000,
    z: Number(slot.localZMicrounits) / 1_000_000,
    rotation: slot.rotationMilliDegrees * Math.PI / 180_000,
    active: slot.active
  })
] as const));
type InnerKeepSlotPosition = NonNullable<ReturnType<typeof SLOT_POSITIONS.get>>;

const SMOKE_SPRITE_BUDGET: Readonly<Record<InnerKeepSceneQuality, number>> =
  Object.freeze({ high: 160, balanced: 96, reduced: 48 });
const SMOKE_FRAME_CAP: Readonly<Record<InnerKeepSceneQuality, number>> =
  Object.freeze({ high: 30, balanced: 24, reduced: 18 });
const LIVING_FRAME_CAP: Readonly<Record<InnerKeepSceneQuality, number>> =
  Object.freeze({ high: 30, balanced: 24, reduced: 0 });
const MAX_RUNTIME_ASSET_LOAD_ATTEMPTS = 2;
const INNER_KEEP_OUTER_WORLD_INITIAL_ZOOM = Object.freeze({
  landscape: 0.78,
  portrait: 0.72
});
const INNER_KEEP_OUTER_WORLD_PAN_BOUNDS = Object.freeze({
  x: Object.freeze([-14, 14] as const),
  z: Object.freeze([-17, 14] as const)
});

function deterministicUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function deterministicVisualSeed(
  presentation: InnerKeepPresentation,
  context: InnerKeepSceneVisualContext | undefined
) {
  const source = `${presentation.castleId}:${presentation.layoutVersion}:`
    + `${context?.owningTerrainKind ?? 'unknown'}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function setShadow(mesh: THREE.Mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function createSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const gradient = context.createRadialGradient(29, 27, 3, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(235, 226, 205, 0.92)');
  gradient.addColorStop(0.35, 'rgba(164, 154, 136, 0.72)');
  gradient.addColorStop(0.7, 'rgba(91, 83, 74, 0.36)');
  gradient.addColorStop(1, 'rgba(63, 55, 49, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildingPalette(kind: InnerKeepBuildingKind) {
  if (kind === 'city-mill') return { wall: 0xc7b58d, roof: 0x71513a, accent: 0xe4d5a4 };
  if (kind === 'lumber-camp') return { wall: 0x8a633d, roof: 0x4f382b, accent: 0xc5924e };
  if (kind === 'city-stoneworks') return { wall: 0xa7a39a, roof: 0x5c5a5d, accent: 0xd9d2bf };
  return { wall: 0x796a59, roof: 0x46382f, accent: 0xd39a3d };
}

function createBuilding(
  kind: InnerKeepBuildingKind,
  completedLevel: number,
  disposableMaterials: Set<THREE.Material>,
  disposableGeometries: Set<THREE.BufferGeometry>
) {
  const palette = buildingPalette(kind);
  const group = new THREE.Group();
  group.name = `inner-keep-completed-building:${kind}`;
  const material = new THREE.MeshStandardMaterial({
    color: palette.wall,
    roughness: 0.82,
    metalness: kind === 'city-goldworks' ? 0.16 : 0.03
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: palette.roof,
    roughness: 0.78
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: palette.accent,
    roughness: 0.68,
    metalness: kind === 'city-goldworks' ? 0.28 : 0.05
  });
  const dressingGreenMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f5d35,
    roughness: 0.94
  });
  disposableMaterials.add(material);
  disposableMaterials.add(roofMaterial);
  disposableMaterials.add(accentMaterial);
  disposableMaterials.add(dressingGreenMaterial);
  const addBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    selectedMaterial: THREE.Material = material
  ) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    disposableGeometries.add(geometry);
    const mesh = setShadow(new THREE.Mesh(geometry, selectedMaterial));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  addBox(2.55, 0.42, 2.1, 0, 0.28, 0, accentMaterial);

  if (kind === 'city-mill') {
    addBox(1.75, 1.75, 1.55, -0.18, 1.32, 0);
    const roofGeometry = new THREE.ConeGeometry(1.28, 0.92, 4);
    disposableGeometries.add(roofGeometry);
    const roof = setShadow(new THREE.Mesh(roofGeometry, roofMaterial));
    roof.position.set(-0.18, 2.55, 0);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const hubGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.46, 10);
    disposableGeometries.add(hubGeometry);
    const hub = setShadow(new THREE.Mesh(hubGeometry, accentMaterial));
    hub.position.set(-0.18, 1.65, -1.02);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
    for (let index = 0; index < 4; index += 1) {
      const blade = addBox(0.2, 1.25, 0.08, -0.18, 1.65, -1.28, accentMaterial);
      blade.rotation.z = index * Math.PI / 2;
    }
  } else if (kind === 'lumber-camp') {
    addBox(2.1, 1.35, 1.65, -0.1, 1.08, 0);
    const roofGeometry = new THREE.ConeGeometry(1.55, 0.82, 4);
    disposableGeometries.add(roofGeometry);
    const roof = setShadow(new THREE.Mesh(roofGeometry, roofMaterial));
    roof.position.set(-0.1, 2.08, 0);
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    for (let index = 0; index < 5; index += 1) {
      const logGeometry = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8);
      disposableGeometries.add(logGeometry);
      const log = setShadow(new THREE.Mesh(logGeometry, accentMaterial));
      log.rotation.z = Math.PI / 2;
      log.position.set(0.42, 0.58 + index * 0.16, 1.02);
      group.add(log);
    }
  } else if (kind === 'city-stoneworks') {
    addBox(1.9, 1.45, 1.7, -0.28, 1.12, 0);
    addBox(0.65, 2.2, 0.65, 0.72, 1.5, 0.35, roofMaterial);
    for (let index = 0; index < 5; index += 1) {
      addBox(
        0.58,
        0.42 + (index % 2) * 0.16,
        0.5,
        -1.05 + (index % 3) * 0.72,
        0.62,
        1.05 + Math.floor(index / 3) * 0.48,
        accentMaterial
      );
    }
  } else {
    addBox(2.0, 1.45, 1.7, -0.18, 1.1, 0);
    addBox(0.58, 2.45, 0.58, 0.72, 1.56, 0.3, roofMaterial);
    const capGeometry = new THREE.ConeGeometry(0.5, 0.72, 6);
    disposableGeometries.add(capGeometry);
    const cap = setShadow(new THREE.Mesh(capGeometry, accentMaterial));
    cap.position.set(0.72, 3.12, 0.3);
    group.add(cap);
  }

  if (completedLevel >= 2) {
    addBox(0.48, 0.46, 0.48, -0.88, 0.56, 1.05, accentMaterial);
    addBox(0.42, 0.34, 0.42, -0.38, 0.5, 1.16, roofMaterial);
    addBox(1.7, 0.12, 0.12, 0.52, 0.72, -1.0, roofMaterial);
  }
  if (completedLevel >= 3) {
    addBox(2.3, 0.12, 0.72, 0, 0.18, 1.42, accentMaterial);
    addBox(1.15, 0.14, 0.38, 0.78, 0.48, 1.12, roofMaterial);
  }
  if (completedLevel >= 4) {
    addBox(0.1, 1.55, 0.1, -1.02, 1.1, -0.72, roofMaterial);
    const dressingBannerGeometry = new THREE.PlaneGeometry(0.56, 0.78);
    disposableGeometries.add(dressingBannerGeometry);
    const dressingBanner = new THREE.Mesh(dressingBannerGeometry, accentMaterial);
    dressingBanner.position.set(-1.02, 1.52, -0.78);
    group.add(dressingBanner);
  }
  if (completedLevel >= 5) {
    for (const x of [-1.05, 1.05]) {
      const topiaryGeometry = new THREE.ConeGeometry(0.38, 1.25, 8);
      disposableGeometries.add(topiaryGeometry);
      const topiary = setShadow(new THREE.Mesh(
        topiaryGeometry,
        dressingGreenMaterial
      ));
      topiary.position.set(x, 0.86, 1.18);
      group.add(topiary);
    }
  }

  for (let level = 2; level <= Math.min(5, completedLevel); level += 1) {
    const marker = addBox(
      0.16,
      0.75 + level * 0.06,
      0.16,
      -1.12 + (level - 2) * 0.72,
      0.75,
      -0.95,
      accentMaterial
    );
    marker.rotation.z = level % 2 === 0 ? 0.08 : -0.08;
  }
  return group;
}

function createScaffold(
  disposableMaterials: Set<THREE.Material>,
  disposableGeometries: Set<THREE.BufferGeometry>
) {
  const group = new THREE.Group();
  group.name = 'inner-keep-construction-scaffold';
  const timber = new THREE.MeshStandardMaterial({ color: 0x76502d, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x817c70, roughness: 0.96 });
  disposableMaterials.add(timber);
  disposableMaterials.add(stone);
  const foundationGeometry = new THREE.BoxGeometry(2.75, 0.34, 2.25);
  disposableGeometries.add(foundationGeometry);
  const foundation = setShadow(new THREE.Mesh(foundationGeometry, stone));
  foundation.position.y = 0.25;
  group.add(foundation);
  const postGeometry = new THREE.BoxGeometry(0.13, 2.25, 0.13);
  const beamGeometry = new THREE.BoxGeometry(2.35, 0.13, 0.13);
  disposableGeometries.add(postGeometry);
  disposableGeometries.add(beamGeometry);
  for (const x of [-1.05, 1.05]) {
    for (const z of [-0.78, 0.78]) {
      const post = setShadow(new THREE.Mesh(postGeometry, timber));
      post.position.set(x, 1.45, z);
      group.add(post);
    }
  }
  for (const y of [0.85, 2.18]) {
    for (const z of [-0.78, 0.78]) {
      const beam = setShadow(new THREE.Mesh(beamGeometry, timber));
      beam.position.set(0, y, z);
      group.add(beam);
    }
    for (const x of [-1.05, 1.05]) {
      const beam = setShadow(new THREE.Mesh(beamGeometry, timber));
      beam.position.set(x, y, 0);
      beam.rotation.y = Math.PI / 2;
      group.add(beam);
    }
  }
  return group;
}

function setGroupOpacity(group: THREE.Object3D, opacity: number) {
  const bounded = Math.max(0, Math.min(1, opacity));
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      material.transparent = bounded < 1;
      material.opacity = bounded;
      material.depthWrite = bounded >= 0.98;
      material.needsUpdate = true;
    }
  });
}

function disposeInstancedMeshBuffers(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
}

function createDeterministicYardDressing(
  seed: number,
  terrainKind: RealmTerrainKind | undefined,
  disposableMaterials: Set<THREE.Material>,
  disposableGeometries: Set<THREE.BufferGeometry>
) {
  const group = new THREE.Group();
  const terrainGreen = terrainKind === 'forest'
    ? 0x29472b
    : terrainKind === 'heath'
      ? 0x4c5130
      : terrainKind === 'ridge' || terrainKind === 'ancient-stone'
        ? 0x43523a
        : 0x3b5c32;
  const shrubMaterial = new THREE.MeshStandardMaterial({
    color: terrainGreen,
    roughness: 0.97
  });
  const rubbleMaterial = new THREE.MeshStandardMaterial({
    color: terrainKind === 'ancient-stone' ? 0x77736b : 0x69665e,
    roughness: 0.98
  });
  disposableMaterials.add(shrubMaterial);
  disposableMaterials.add(rubbleMaterial);
  const shrubGeometry = new THREE.ConeGeometry(0.46, 0.92, 7);
  const rubbleGeometry = new THREE.DodecahedronGeometry(0.32, 0);
  disposableGeometries.add(shrubGeometry);
  disposableGeometries.add(rubbleGeometry);
  const salt = seed % 104_729;
  const safeAnchors = [
    [-6.3, 8.55],
    [6.3, 8.55],
    [-11.05, -0.1],
    [11.05, -0.1],
    [-6.8, -8.55],
    [6.8, -8.55]
  ] as const;
  safeAnchors.forEach(([anchorX, anchorZ], index) => {
    const x = anchorX + (deterministicUnit(index, salt + 1) - 0.5) * 0.58;
    const z = anchorZ + (deterministicUnit(index, salt + 2) - 0.5) * 0.42;
    const shrub = setShadow(new THREE.Mesh(shrubGeometry, shrubMaterial));
    const shrubScale = 0.72 + deterministicUnit(index, salt + 3) * 0.62;
    shrub.position.set(x, 0.46 * shrubScale, z);
    shrub.scale.setScalar(shrubScale);
    shrub.rotation.y = deterministicUnit(index, salt + 4) * Math.PI;
    group.add(shrub);
    const rubble = setShadow(new THREE.Mesh(rubbleGeometry, rubbleMaterial));
    const rubbleScale = 0.58 + deterministicUnit(index, salt + 5) * 0.62;
    rubble.position.set(
      x + (deterministicUnit(index, salt + 6) - 0.5) * 0.92,
      0.16 * rubbleScale,
      z + (deterministicUnit(index, salt + 7) - 0.5) * 0.82
    );
    rubble.scale.set(rubbleScale, rubbleScale * 0.7, rubbleScale);
    rubble.rotation.set(
      deterministicUnit(index, salt + 8) * 0.35,
      deterministicUnit(index, salt + 9) * Math.PI,
      deterministicUnit(index, salt + 10) * 0.28
    );
    group.add(rubble);
  });
  return group;
}

function geometryTriangleCount(geometry: THREE.BufferGeometry) {
  const indexCount = geometry.index?.count;
  if (indexCount !== undefined) return Math.floor(indexCount / 3);
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3);
}

type InnerKeepTerrainPathPoint = Readonly<{ x: number; z: number }>;

function createInnerKeepOuterTerrainGeometry(quality: InnerKeepSceneQuality) {
  const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  const [widthSegments, depthSegments] =
    INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS[quality].terrainSegments;
  const geometry = new THREE.PlaneGeometry(
    halfWidth * 2,
    halfDepth * 2,
    widthSegments,
    depthSegments,
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const lowland = new THREE.Color(0x657d50);
  const meadow = new THREE.Color(0x82905d);
  const ridge = new THREE.Color(0x77756a);
  const color = new THREE.Color();
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const height = innerKeepOuterWorldTerrainHeightAt(x, z);
    minimumHeight = Math.min(minimumHeight, height);
    maximumHeight = Math.max(maximumHeight, height);
    position.setY(index, height);
    const meadowMix = Math.max(0, Math.min(1, (height + 0.1) / 1.15));
    const ridgeMix = Math.max(0, Math.min(1, (height - 1.15) / 2.15));
    color.copy(lowland).lerp(meadow, meadowMix).lerp(ridge, ridgeMix);
    const variation = Math.sin(x * 0.72 + z * 0.39) * 0.025;
    color.offsetHSL(variation, 0, variation * 0.45);
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return Object.freeze({
    geometry,
    triangleCount: geometryTriangleCount(geometry),
    heightRangeMillimeters: Math.max(
      0,
      Math.round((maximumHeight - minimumHeight) * 1_000),
    ),
  });
}

function createInnerKeepOuterRoadGeometry(paths: readonly Readonly<{
  points: readonly InnerKeepTerrainPathPoint[];
  closed: boolean;
  halfWidthMeters: number;
}>[]) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const path of paths) {
    if (path.points.length < 2) continue;
    const vertexOffset = positions.length / 3;
    path.points.forEach((point, index) => {
      const before = path.points[
        path.closed
          ? (index - 1 + path.points.length) % path.points.length
          : Math.max(0, index - 1)
      ]!;
      const after = path.points[
        path.closed
          ? (index + 1) % path.points.length
          : Math.min(path.points.length - 1, index + 1)
      ]!;
      const tangentX = after.x - before.x;
      const tangentZ = after.z - before.z;
      const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentZ));
      const normalX = -tangentZ / tangentLength;
      const normalZ = tangentX / tangentLength;
      for (const side of [-1, 1] as const) {
        const x = point.x + normalX * path.halfWidthMeters * side;
        const z = point.z + normalZ * path.halfWidthMeters * side;
        positions.push(
          x,
          innerKeepOuterWorldTerrainHeightAt(x, z) + 0.035,
          z,
        );
      }
    });
    const segmentCount = path.closed ? path.points.length : path.points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const next = (index + 1) % path.points.length;
      const left = vertexOffset + index * 2;
      const right = left + 1;
      const nextLeft = vertexOffset + next * 2;
      const nextRight = nextLeft + 1;
      indices.push(left, nextLeft, right, right, nextLeft, nextRight);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createInnerKeepSceneLayer(
  options: CreateInnerKeepSceneLayerOptions
): InnerKeepSceneLayer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x667558);
  scene.fog = new THREE.Fog(0x667558, 34, 72);
  const camera = new THREE.OrthographicCamera(
    -INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth,
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth,
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.baseHalfHeight,
    -INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.baseHalfHeight,
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.near,
    INNER_KEEP_PRESENTATION_CAMERA_PRESETS.far
  );
  let focusX = 0;
  let focusZ = 0;
  let zoom: number = INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.initial;
  let cameraFramingMode: 'uninitialized' | 'landscape' | 'portrait' =
    'uninitialized';
  let cameraWasManuallyAdjusted = false;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let disposed = false;
  let selectedSlotId: string | null = null;
  let constructionPosition: Readonly<{ x: number; y: number; z: number }> | null = null;
  let completionReveal: Readonly<{
    building: THREE.Group;
    scaffold: THREE.Group;
    startedAtSeconds: number;
    durationSeconds: number;
  }> | null = null;
  let previousBuildingPhases = new Map<string, InnerKeepBuildingPresentation['phase']>();
  let lastElapsedSeconds = 0;
  let lastPresentation: InnerKeepPresentation | null = null;
  let lastVisualContext: InnerKeepSceneVisualContext | undefined;
  let currentVisualSeed = 0;
  let runtimeAssetBundle: InnerKeepRuntimeAssetBundle | null = null;
  let authoredPresentation: InnerKeepAuthoredStaticPresentation | null = null;
  let ambientPlan: InnerKeepAmbientSimulationPlan | null = null;
  let populationPresentation: InnerKeepPopulationPresentation | null = null;
  let ecology: InnerKeepEcology | null = null;
  let outerWorldPresentation: InnerKeepOuterWorldPresentation | null = null;
  let rabbitPresentation: InnerKeepRabbitPresentation | null = null;
  let assetLoadController: AbortController | null = null;
  let assetLoadGeneration = 0;
  let assetLoadKey = '';
  let assetLoadAttemptCount = 0;
  let assetStatus: InnerKeepSceneTelemetry['assetStatus'] = 'idle';
  let runtimeAssetFailureCount = 0;
  let telemetry: InnerKeepSceneTelemetry = Object.freeze({
    status: 'empty',
    assetStatus: 'idle',
    triangleCount: 0,
    drawCalls: 0,
    smokeSpriteCount: 0,
    grassBladeCount: 0,
    waterSurfaceCount: 0,
    authoredAssetCount: 0,
    authoredPlacementCount: 0,
    authoredTreeCount: 0,
    ambientActorCount: 0,
    mountedActorCount: 0,
    patrolUnitCount: 0,
    activeConversationCount: 0,
    animationMixerCount: 0,
    runtimeAssetFailureCount: 0,
    outerWorldStatus: 'idle',
    outerWorldRuntimeAssetFailureCount: 0,
    topographicFeatureCount: INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.length,
    terrainTriangleCount: 0,
    terrainHeightRangeMillimeters: 0,
    exteriorTreeCount: 0,
    scenicResourceNodeCount: 0,
    wildlifeAssetStatus: 'idle',
    wildlifeCount: 0,
    exactWildlifeCount: 0,
    proceduralWildlifeCount: 0,
    tradeWagonCount: 0,
    exteriorActorCount: 0,
    exteriorMountedActorCount: 0,
    exteriorPatrolUnitCount: 0,
    slotCount: 0,
    completedBuildingCount: 0,
    constructionSiteCount: 0,
    completionRevealActive: false
  });
  const disposableMaterials = new Set<THREE.Material>();
  const disposableGeometries = new Set<THREE.BufferGeometry>();
  const disposableTextures = new Set<THREE.Texture>();
  const dynamicMaterials = new Set<THREE.Material>();
  const dynamicGeometries = new Set<THREE.BufferGeometry>();
  const staticGroup = new THREE.Group();
  const proceduralFallbackGroup = new THREE.Group();
  proceduralFallbackGroup.name = 'inner-keep-procedural-asset-fallback';
  const authoredStaticGroup = new THREE.Group();
  authoredStaticGroup.name = 'inner-keep-authored-static-root';
  const ambientGroup = new THREE.Group();
  ambientGroup.name = 'inner-keep-persistent-ambient-root';
  const dynamicGroup = new THREE.Group();
  scene.add(staticGroup, proceduralFallbackGroup, authoredStaticGroup, ambientGroup, dynamicGroup);

  const outerTerrain = createInnerKeepOuterTerrainGeometry(options.quality);
  const groundGeometry = outerTerrain.geometry;
  disposableGeometries.add(groundGeometry);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.98,
    metalness: 0
  });
  disposableMaterials.add(groundMaterial);
  const ground = setShadow(new THREE.Mesh(groundGeometry, groundMaterial), false, true);
  ground.name = 'inner-keep-outer-topographic-terrain';
  ground.userData.presentationOnly = true;
  ground.userData.gameplayAuthorityClaimed = false;
  staticGroup.add(ground);

  const tradeRoadPoints = INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.map((point) => ({
    x: point[0],
    z: point[2],
  }));
  const resourceRoads = INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.map((site) => {
    const south = site.positionMeters[2] > 0;
    const approachZ = south
      ? INNER_KEEP_OUTER_WORLD_APPROACHES.southernResourceRoadZ
      : INNER_KEEP_OUTER_WORLD_APPROACHES.northernResourceRoadZ;
    return Object.freeze({
      points: Object.freeze([
        ...(south ? [Object.freeze({
          x: 0,
          z: INNER_KEEP_OUTER_WORLD_APPROACHES.gateOuterZ,
        })] : []),
        Object.freeze({ x: site.positionMeters[0] * 0.58, z: approachZ }),
        Object.freeze({
          x: site.positionMeters[0],
          z: site.positionMeters[2],
        }),
      ]),
      closed: false,
      halfWidthMeters: 0.46,
    });
  });
  const outerRoadGeometry = createInnerKeepOuterRoadGeometry([
    Object.freeze({
      points: INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.points,
      closed: true,
      halfWidthMeters: INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters,
    }),
    Object.freeze({
      points: tradeRoadPoints,
      closed: false,
      halfWidthMeters: 0.62,
    }),
    ...resourceRoads,
  ]);
  disposableGeometries.add(outerRoadGeometry);
  const outerRoadMaterial = new THREE.MeshStandardMaterial({
    color: 0x857251,
    roughness: 0.99,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposableMaterials.add(outerRoadMaterial);
  const outerRoad = new THREE.Mesh(outerRoadGeometry, outerRoadMaterial);
  outerRoad.name = 'inner-keep-outer-estate-road-network';
  outerRoad.receiveShadow = true;
  outerRoad.castShadow = false;
  outerRoad.userData.presentationOnly = true;
  outerRoad.userData.gameplayAuthorityClaimed = false;
  outerRoad.raycast = () => undefined;
  staticGroup.add(outerRoad);

  const cityEdgeApronGeometry = createInnerKeepOuterRoadGeometry([
    Object.freeze({
      points: INNER_KEEP_CITY_EDGE_APRON_POINTS,
      closed: true,
      halfWidthMeters: 1.72
    })
  ]);
  disposableGeometries.add(cityEdgeApronGeometry);
  const cityEdgeApronMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f6248,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1.4,
    polygonOffsetUnits: -2
  });
  disposableMaterials.add(cityEdgeApronMaterial);
  const cityEdgeApron = new THREE.Mesh(cityEdgeApronGeometry, cityEdgeApronMaterial);
  cityEdgeApron.name = 'inner-keep-city-edge-earth-apron';
  cityEdgeApron.receiveShadow = true;
  cityEdgeApron.castShadow = false;
  cityEdgeApron.userData.presentationOnly = true;
  cityEdgeApron.userData.gameplayAuthorityClaimed = false;
  cityEdgeApron.raycast = () => undefined;
  staticGroup.add(cityEdgeApron);

  const districtRoadGeometry = createInnerKeepOuterRoadGeometry(
    INNER_KEEP_CITY_DISTRICT_ROADS
  );
  disposableGeometries.add(districtRoadGeometry);
  const districtRoadMaterial = new THREE.MeshStandardMaterial({
    color: 0x826f50,
    roughness: 0.99,
    polygonOffset: true,
    polygonOffsetFactor: -1.2,
    polygonOffsetUnits: -2
  });
  disposableMaterials.add(districtRoadMaterial);
  const districtRoads = new THREE.Mesh(districtRoadGeometry, districtRoadMaterial);
  districtRoads.name = 'inner-keep-city-district-road-network';
  districtRoads.receiveShadow = true;
  districtRoads.castShadow = false;
  districtRoads.userData.presentationOnly = true;
  districtRoads.userData.gameplayAuthorityClaimed = false;
  districtRoads.raycast = () => undefined;
  staticGroup.add(districtRoads);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x8c7b5b, roughness: 0.96 });
  disposableMaterials.add(roadMaterial);
  const roadGeometryVertical = new THREE.BoxGeometry(2.6, 0.12, 36.5);
  const roadGeometryHorizontal = new THREE.BoxGeometry(35, 0.12, 2.15);
  disposableGeometries.add(roadGeometryVertical);
  disposableGeometries.add(roadGeometryHorizontal);
  const roadVertical = setShadow(new THREE.Mesh(roadGeometryVertical, roadMaterial), false, true);
  roadVertical.position.set(0, 0.08, -3);
  const roadHorizontal = setShadow(new THREE.Mesh(roadGeometryHorizontal, roadMaterial), false, true);
  roadHorizontal.position.set(0, 0.085, 0.2);
  proceduralFallbackGroup.add(roadVertical, roadHorizontal);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x745536, roughness: 0.92 });
  disposableMaterials.add(wallMaterial);
  const addWall = (width: number, depth: number, x: number, z: number) => {
    const geometry = new THREE.BoxGeometry(width, 1.25, depth);
    disposableGeometries.add(geometry);
    const wall = setShadow(new THREE.Mesh(geometry, wallMaterial));
    wall.position.set(x, 0.72, z);
    proceduralFallbackGroup.add(wall);
  };
  const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
  const wallWidth = wall.eastX - wall.westX;
  const wallDepth = wall.southZ - wall.northZ;
  const wallCenterZ = (wall.northZ + wall.southZ) * 0.5;
  addWall(wallWidth + 0.4, 0.36, 0, wall.northZ);
  addWall(0.36, wallDepth + 0.4, wall.westX, wallCenterZ);
  addWall(0.36, wallDepth + 0.4, wall.eastX, wallCenterZ);
  // The southern wall is deliberately split around the playable gate and
  // road approach; a decorative wall must never visually close the route.
  const southernWallRunWidth = (wallWidth - wall.southGateClearWidth) * 0.5;
  const southernWallCenterOffset = wall.southGateClearWidth * 0.5
    + southernWallRunWidth * 0.5;
  addWall(
    southernWallRunWidth,
    0.42,
    -southernWallCenterOffset,
    wall.southZ
  );
  addWall(
    southernWallRunWidth,
    0.42,
    southernWallCenterOffset,
    wall.southZ
  );

  const plazaMaterial = new THREE.MeshStandardMaterial({
    color: 0x9b8f78,
    roughness: 0.94
  });
  disposableMaterials.add(plazaMaterial);
  const plazaGeometry = new THREE.CylinderGeometry(3.15, 3.25, 0.14, 32);
  disposableGeometries.add(plazaGeometry);
  const plaza = setShadow(new THREE.Mesh(plazaGeometry, plazaMaterial), false, true);
  plaza.position.set(0, 0.12, 3.15);
  proceduralFallbackGroup.add(plaza);

  const keepMaterial = new THREE.MeshStandardMaterial({ color: 0x9a8b72, roughness: 0.84 });
  const keepRoofMaterial = new THREE.MeshStandardMaterial({ color: 0x4d3e3b, roughness: 0.72 });
  const bannerMaterial = new THREE.MeshStandardMaterial({ color: 0x63347f, roughness: 0.7 });
  disposableMaterials.add(keepMaterial);
  disposableMaterials.add(keepRoofMaterial);
  disposableMaterials.add(bannerMaterial);
  const keepGeometry = new THREE.BoxGeometry(8.6, 5.5, 7.2);
  disposableGeometries.add(keepGeometry);
  const keep = setShadow(new THREE.Mesh(keepGeometry, keepMaterial));
  keep.name = 'inner-keep-procedural-cathedral-fallback';
  keep.position.set(0, 2.85, -15.4);
  proceduralFallbackGroup.add(keep);
  for (const [x, z] of [[-4.25, -18.55], [4.25, -18.55], [-4.25, -12.25], [4.25, -12.25]]) {
    const towerGeometry = new THREE.CylinderGeometry(1.15, 1.3, 6.5, 10);
    const roofGeometry = new THREE.ConeGeometry(1.45, 1.5, 10);
    disposableGeometries.add(towerGeometry);
    disposableGeometries.add(roofGeometry);
    const tower = setShadow(new THREE.Mesh(towerGeometry, keepMaterial));
    tower.position.set(x!, 3.3, z!);
    const roof = setShadow(new THREE.Mesh(roofGeometry, keepRoofMaterial));
    roof.position.set(x!, 7.2, z!);
    proceduralFallbackGroup.add(tower, roof);
  }
  const bannerGeometry = new THREE.PlaneGeometry(0.9, 1.45);
  disposableGeometries.add(bannerGeometry);
  const banner = new THREE.Mesh(bannerGeometry, bannerMaterial);
  banner.position.set(0, 3.55, -11.76);
  proceduralFallbackGroup.add(banner);

  const fallbackBarracksGeometry = new THREE.BoxGeometry(5.7, 2.8, 4.6);
  const fallbackBarracksRoofGeometry = new THREE.ConeGeometry(4, 2.1, 4);
  disposableGeometries.add(fallbackBarracksGeometry);
  disposableGeometries.add(fallbackBarracksRoofGeometry);
  const fallbackBarracks = setShadow(new THREE.Mesh(
    fallbackBarracksGeometry,
    keepMaterial
  ));
  fallbackBarracks.name = 'inner-keep-procedural-barracks-fallback';
  fallbackBarracks.position.set(-16, 1.5, 0);
  const fallbackBarracksRoof = setShadow(new THREE.Mesh(
    fallbackBarracksRoofGeometry,
    keepRoofMaterial
  ));
  fallbackBarracksRoof.position.set(-16, 3.7, 0);
  fallbackBarracksRoof.rotation.y = Math.PI / 4;
  proceduralFallbackGroup.add(fallbackBarracks, fallbackBarracksRoof);

  const civicTimber = new THREE.MeshStandardMaterial({ color: 0x62401f, roughness: 0.92 });
  const civicStone = new THREE.MeshStandardMaterial({ color: 0x807b70, roughness: 0.95 });
  const civicIron = new THREE.MeshStandardMaterial({ color: 0x25252a, roughness: 0.66, metalness: 0.56 });
  const civicGreen = new THREE.MeshStandardMaterial({ color: 0x36522d, roughness: 0.96 });
  const lampGlow = new THREE.MeshStandardMaterial({
    color: 0xe6ad55,
    emissive: 0xc56f21,
    emissiveIntensity: 1.15,
    roughness: 0.44
  });
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a8b91,
    roughness: 0.3,
    metalness: 0.08
  });
  disposableMaterials.add(civicTimber);
  disposableMaterials.add(civicStone);
  disposableMaterials.add(civicIron);
  disposableMaterials.add(civicGreen);
  disposableMaterials.add(lampGlow);
  disposableMaterials.add(waterMaterial);
  const addCivicBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rotationY = 0
  ) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    disposableGeometries.add(geometry);
    const mesh = setShadow(new THREE.Mesh(geometry, material));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    proceduralFallbackGroup.add(mesh);
    return mesh;
  };
  const addCivicCylinder = (
    radiusTop: number,
    radiusBottom: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    segments = 12
  ) => {
    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments
    );
    disposableGeometries.add(geometry);
    const mesh = setShadow(new THREE.Mesh(geometry, material));
    mesh.position.set(x, y, z);
    proceduralFallbackGroup.add(mesh);
    return mesh;
  };

  // Open gate, approach standards, and readable civic landmarks.
  const fallbackGateWestPost = addCivicBox(
    0.48, 3.5, 0.48, -2.7, 1.85, 15, civicTimber
  );
  fallbackGateWestPost.name = 'inner-keep-procedural-south-gate-west-post';
  const fallbackGateEastPost = addCivicBox(
    0.48, 3.5, 0.48, 2.7, 1.85, 15, civicTimber
  );
  fallbackGateEastPost.name = 'inner-keep-procedural-south-gate-east-post';
  const fallbackGateFrame = addCivicBox(
    5.9, 0.42, 0.52, 0, 3.42, 15, civicTimber
  );
  fallbackGateFrame.name = 'inner-keep-procedural-south-gate-frame';
  for (const [side, x] of [['west', -2.55], ['east', 2.55]] as const) {
    const standard = addCivicBox(0.12, 3.1, 0.12, x, 1.63, 13.05, civicTimber);
    standard.name = `inner-keep-procedural-gate-standard-${side}`;
    const gateBannerGeometry = new THREE.PlaneGeometry(0.72, 1.28);
    disposableGeometries.add(gateBannerGeometry);
    const gateBanner = new THREE.Mesh(gateBannerGeometry, bannerMaterial);
    gateBanner.position.set(x, 2.38, 12.98);
    proceduralFallbackGroup.add(gateBanner);
  }

  // Builder noticeboard and directional sign beside the gate approach.
  addCivicBox(0.16, 1.7, 0.16, -3.64, 0.9, 11.65, civicTimber);
  addCivicBox(0.16, 1.7, 0.16, -2.36, 0.9, 11.65, civicTimber);
  const fallbackNoticeboard = addCivicBox(
    1.65, 0.92, 0.13, -3, 1.45, 11.65, civicTimber
  );
  fallbackNoticeboard.name = 'inner-keep-procedural-builder-noticeboard';
  addCivicBox(2, 0.18, 0.75, -3, 2.02, 11.65, keepRoofMaterial);
  addCivicBox(0.12, 1.42, 0.12, 3.65, 0.8, 11.7, civicTimber);
  const fallbackSign = addCivicBox(
    1.15, 0.18, 0.14, 4, 1.3, 11.7, civicTimber, -0.12
  );
  fallbackSign.name = 'inner-keep-procedural-civic-direction-sign';

  // Village well, benches, trough, and paired plaza braziers.
  addCivicCylinder(0.88, 0.98, 0.62, 2.25, 0.42, 3.4, civicStone, 18);
  addCivicCylinder(0.62, 0.62, 0.08, 2.25, 0.77, 3.4, waterMaterial, 18);
  addCivicBox(0.12, 1.7, 0.12, 1.48, 1.2, 3.4, civicTimber);
  addCivicBox(0.12, 1.7, 0.12, 3.02, 1.2, 3.4, civicTimber);
  addCivicBox(1.92, 0.18, 0.95, 2.25, 2.08, 3.4, keepRoofMaterial);
  for (const x of [-3.1, 3.1]) {
    addCivicBox(1.7, 0.18, 0.46, x, 0.58, 1.6, civicTimber);
    addCivicBox(1.7, 0.44, 0.12, x, 0.88, 1.85, civicTimber);
  }
  const fallbackTrough = addCivicBox(
    1.55, 0.54, 0.62, 5.2, 0.42, 12.7, civicTimber, Math.PI / 2
  );
  fallbackTrough.name = 'inner-keep-procedural-south-east-water-trough';
  for (const x of [-1.7, 1.7]) {
    addCivicCylinder(0.08, 0.11, 1.15, x, 0.72, 4.95, civicIron, 8);
    addCivicCylinder(0.24, 0.14, 0.28, x, 1.4, 4.95, lampGlow, 10);
  }
  for (const x of [-1.45, 1.45]) {
    addCivicCylinder(0.18, 0.25, 0.72, x, 0.48, 2.05, civicStone, 10);
    addCivicCylinder(0.34, 0.2, 0.24, x, 0.94, 2.05, civicIron, 12);
    addCivicCylinder(0.18, 0.08, 0.3, x, 1.17, 2.05, lampGlow, 9);
  }

  // Clipped hedges and restrained ruined masonry frame the authored yard.
  for (const [name, x, z, rotation] of [
    ['west-north', -12.5, -1.3, Math.PI / 2],
    ['east-north', 12.5, -1.3, Math.PI / 2],
    ['west-south', -12.5, 4.8, Math.PI / 2],
    ['east-south', 12.5, 4.8, Math.PI / 2]
  ] as const) {
    const hedge = addCivicBox(0.72, 0.72, 2.4, x, 0.48, z, civicGreen, rotation);
    hedge.name = `inner-keep-procedural-hedge-${name}`;
  }
  const fallbackCollapsedArch = addCivicCylinder(
    0.48, 0.56, 2.5, 0, 1.35, -9, civicStone, 10
  );
  fallbackCollapsedArch.name = 'inner-keep-procedural-north-collapsed-arch';
  addCivicCylinder(0.42, 0.5, 1.55, 1.37, 0.88, -9.26, civicStone, 10);
  addCivicBox(1.65, 0.3, 0.54, 2.5, 0.28, -9.08, civicStone, 0.28);

  const treeTrunkGeometry = new THREE.CylinderGeometry(0.11, 0.16, 1.25, 6);
  const treeCanopyGeometry = new THREE.ConeGeometry(0.72, 2.25, 8);
  disposableGeometries.add(treeTrunkGeometry);
  disposableGeometries.add(treeCanopyGeometry);
  const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4029, roughness: 0.96 });
  const treeCanopyMaterial = new THREE.MeshStandardMaterial({ color: 0x25472f, roughness: 0.92 });
  disposableMaterials.add(treeTrunkMaterial);
  disposableMaterials.add(treeCanopyMaterial);
  const treeCount = options.quality === 'reduced' ? 20 : options.quality === 'balanced' ? 30 : 40;
  const trunks = new THREE.InstancedMesh(treeTrunkGeometry, treeTrunkMaterial, treeCount);
  const canopies = new THREE.InstancedMesh(treeCanopyGeometry, treeCanopyMaterial, treeCount);
  trunks.castShadow = options.quality !== 'reduced';
  trunks.receiveShadow = true;
  canopies.castShadow = options.quality === 'high';
  canopies.receiveShadow = true;
  const treeMatrix = new THREE.Matrix4();
  for (let index = 0; index < treeCount; index += 1) {
    const side = index % 4;
    const alongX = deterministicUnit(index, 1) * 36 - 18;
    const alongZ = deterministicUnit(index, 6) * 30 - 16.5;
    const x = side < 2
      ? (side === 0 ? -21.5 : 21.5) + (deterministicUnit(index, 2) - 0.5) * 1.2
      : alongX;
    const z = side >= 2
      ? (side === 2 ? -22.4 : 16.4) + (deterministicUnit(index, 3) - 0.5) * 1.2
      : alongZ;
    const scale = 0.82 + deterministicUnit(index, 4) * 0.52;
    const terrainHeight = innerKeepOuterWorldTerrainHeightAt(x, z);
    treeMatrix.compose(
      new THREE.Vector3(x, terrainHeight + 0.72 * scale, z),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale)
    );
    trunks.setMatrixAt(index, treeMatrix);
    treeMatrix.compose(
      new THREE.Vector3(x, terrainHeight + 2.2 * scale, z),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        deterministicUnit(index, 5) * Math.PI
      ),
      new THREE.Vector3(scale, scale, scale)
    );
    canopies.setMatrixAt(index, treeMatrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  proceduralFallbackGroup.add(trunks, canopies);
  const innerTreePositions = [
    [-12.25, -1.8, 0.76],
    [12.25, -1.8, 0.82],
    [-11.55, 5.1, 0.68],
    [11.55, 5.1, 0.72]
  ] as const;
  const innerTrunks = new THREE.InstancedMesh(
    treeTrunkGeometry,
    treeTrunkMaterial,
    innerTreePositions.length
  );
  const innerCanopies = new THREE.InstancedMesh(
    treeCanopyGeometry,
    treeCanopyMaterial,
    innerTreePositions.length
  );
  innerTreePositions.forEach(([x, z, scale], index) => {
    treeMatrix.compose(
      new THREE.Vector3(x, 0.72 * scale, z),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale)
    );
    innerTrunks.setMatrixAt(index, treeMatrix);
    treeMatrix.compose(
      new THREE.Vector3(x, 2.2 * scale, z),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        index * 0.78
      ),
      new THREE.Vector3(scale, scale, scale)
    );
    innerCanopies.setMatrixAt(index, treeMatrix);
  });
  innerTrunks.instanceMatrix.needsUpdate = true;
  innerCanopies.instanceMatrix.needsUpdate = true;
  innerTrunks.castShadow = options.quality !== 'reduced';
  innerCanopies.castShadow = options.quality === 'high';
  proceduralFallbackGroup.add(innerTrunks, innerCanopies);

  const ambient = new THREE.HemisphereLight(0xfff1cf, 0x26351e, 1.75);
  const sun = new THREE.DirectionalLight(0xffe5b1, 2.65);
  sun.position.set(-12, 28, 18);
  sun.castShadow = options.quality !== 'reduced';
  sun.shadow.mapSize.set(
    options.quality === 'high' ? 2048 : 1024,
    options.quality === 'high' ? 2048 : 1024
  );
  sun.shadow.camera.left = -29;
  sun.shadow.camera.right = 29;
  sun.shadow.camera.top = 29;
  sun.shadow.camera.bottom = -29;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  scene.add(ambient, sun);

  const padGeometry = new THREE.CylinderGeometry(1.72, 1.85, 0.2, 24);
  disposableGeometries.add(padGeometry);
  const padMaterial = new THREE.MeshStandardMaterial({ color: 0x978867, roughness: 0.98 });
  const reservedPadMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f6258,
    roughness: 0.98
  });
  const selectedPadMaterial = new THREE.MeshStandardMaterial({
    color: 0xc5aa67,
    emissive: 0x4b3512,
    emissiveIntensity: 0.42,
    roughness: 0.88
  });
  disposableMaterials.add(padMaterial);
  disposableMaterials.add(reservedPadMaterial);
  disposableMaterials.add(selectedPadMaterial);
  const padMeshes = new Map<string, THREE.Mesh>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const projectionPoint = new THREE.Vector3();
  const smokeTexture = createSmokeTexture();
  if (smokeTexture) disposableTextures.add(smokeTexture);
  const smokeGeometry = new THREE.PlaneGeometry(0.9, 0.9);
  disposableGeometries.add(smokeGeometry);
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0xb4aa99,
    ...(smokeTexture === undefined ? {} : { map: smokeTexture }),
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  disposableMaterials.add(smokeMaterial);
  const smoke = new THREE.InstancedMesh(
    smokeGeometry,
    smokeMaterial,
    SMOKE_SPRITE_BUDGET[options.quality]
  );
  smoke.name = 'inner-keep-construction-smoke';
  smoke.count = 0;
  smoke.frustumCulled = false;
  smoke.renderOrder = 8;
  dynamicGroup.add(smoke);
  const smokeMatrix = new THREE.Matrix4();
  const smokePosition = new THREE.Vector3();
  const smokeScale = new THREE.Vector3();
  const smokeQuaternion = new THREE.Quaternion();
  let ecologySeed: number | null = null;
  let outerWorldSeed: number | null = null;
  let refreshOptionalPresentationTelemetry = () => {};

  const ensureEcology = (visualSeed: number) => {
    if (ecology && ecologySeed === visualSeed) return;
    ecology?.dispose();
    ecology = createInnerKeepEcology({
      quality: options.quality,
      reducedMotion: options.reducedMotion || options.quality === 'reduced',
      visualSeed
    });
    ecologySeed = visualSeed;
    ambientGroup.add(ecology.group);
  };

  const ensureOuterWorld = (visualSeed: number) => {
    if (outerWorldPresentation && outerWorldSeed === visualSeed) return;
    outerWorldPresentation?.dispose();
    rabbitPresentation?.dispose();
    const nextOuterWorldPresentation = createInnerKeepOuterWorldPresentation({
      quality: options.quality,
      visualSeed,
      reducedMotion: options.reducedMotion || options.quality === 'reduced',
      baseUrl: options.baseUrl ?? import.meta.env.BASE_URL,
      maxAnisotropy: options.maxAnisotropy,
      loadExactAssets: (
        options.outerWorldAssetLoading ?? options.assetLoading ?? 'auto'
      ) !== 'disabled',
      wildlifeMode: 'procedural',
      requestRender: options.requestRender,
      onTelemetryChange: () => refreshOptionalPresentationTelemetry(),
    });
    outerWorldPresentation = nextOuterWorldPresentation;
    const nextRabbitPresentation = createInnerKeepRabbitPresentation({
      quality: options.quality,
      visualSeed,
      reducedMotion: options.reducedMotion || options.quality === 'reduced',
      baseUrl: options.baseUrl ?? import.meta.env.BASE_URL,
      maxAnisotropy: options.maxAnisotropy,
      loadExactAsset: (
        options.outerWorldAssetLoading ?? options.assetLoading ?? 'auto'
      ) !== 'disabled',
      requestRender: options.requestRender,
      onTelemetryChange: (rabbitTelemetry) => {
        nextOuterWorldPresentation.setProceduralWildlifeVisible(
          rabbitTelemetry.status !== 'ready'
        );
        refreshOptionalPresentationTelemetry();
      }
    });
    rabbitPresentation = nextRabbitPresentation;
    nextOuterWorldPresentation.setProceduralWildlifeVisible(
      nextRabbitPresentation.getTelemetry().status !== 'ready'
    );
    outerWorldSeed = visualSeed;
    ambientGroup.add(
      nextOuterWorldPresentation.group,
      nextRabbitPresentation.group
    );
  };

  const clearRuntimePresentation = (disposeBundle: boolean) => {
    populationPresentation?.dispose();
    populationPresentation = null;
    if (authoredPresentation) {
      disposeInstancedMeshBuffers(authoredPresentation.group);
    }
    authoredPresentation?.group.removeFromParent();
    authoredPresentation = null;
    authoredStaticGroup.clear();
    if (disposeBundle) {
      runtimeAssetBundle?.dispose();
      runtimeAssetBundle = null;
    }
    proceduralFallbackGroup.visible = true;
  };

  const installRuntimePresentation = (
    bundle: InnerKeepRuntimeAssetBundle,
    plan: InnerKeepAmbientSimulationPlan,
    visualSeed: number
  ) => {
    clearRuntimePresentation(true);
    runtimeAssetBundle = bundle;
    ambientPlan = plan;
    const completeStaticCoverage = hasCompleteInnerKeepStaticRuntimeCoverage(bundle);
    if (completeStaticCoverage) {
      authoredPresentation = createInnerKeepAuthoredStaticPresentation({
        bundle,
        quality: options.quality,
        visualSeed
      });
      authoredStaticGroup.add(authoredPresentation.group);
    }
    populationPresentation = createInnerKeepPopulationPresentation({
      bundle,
      plan,
      terrainHeightAt: innerKeepOuterWorldTerrainHeightAt,
    });
    ambientGroup.add(populationPresentation.group);
    populationPresentation.update(lastElapsedSeconds);
    runtimeAssetFailureCount = bundle.failures.length;
    assetStatus = bundle.failures.length === 0 ? 'ready' : 'degraded';
    proceduralFallbackGroup.visible = !completeStaticCoverage;
    scene.userData.innerKeepAssetStatus = assetStatus;
    scene.userData.innerKeepRuntimeAssetFailures = bundle.failures;
    scene.userData.innerKeepAssetLoadAttemptCount = assetLoadAttemptCount;
  };

  const compareRuntimeBundleCoverage = (
    left: InnerKeepRuntimeAssetBundle,
    right: InnerKeepRuntimeAssetBundle
  ) => {
    const leftCoverage = [
      hasCompleteInnerKeepStaticRuntimeCoverage(left) ? 1 : 0,
      left.staticPrefabs.size,
      left.populationPrefabs.size,
      -left.failures.length
    ] as const;
    const rightCoverage = [
      hasCompleteInnerKeepStaticRuntimeCoverage(right) ? 1 : 0,
      right.staticPrefabs.size,
      right.populationPrefabs.size,
      -right.failures.length
    ] as const;
    for (let index = 0; index < leftCoverage.length; index += 1) {
      const difference = leftCoverage[index]! - rightCoverage[index]!;
      if (difference !== 0) return difference;
    }
    return 0;
  };

  const preservesRuntimeBundlePrefabIds = (
    candidate: InnerKeepRuntimeAssetBundle,
    settled: InnerKeepRuntimeAssetBundle
  ) => (
    [...settled.staticPrefabs.keys()].every((id) => candidate.staticPrefabs.has(id))
    && [...settled.populationPrefabs.keys()]
      .every((id) => candidate.populationPrefabs.has(id))
  );

  const retainRuntimePresentation = (
    bundle: InnerKeepRuntimeAssetBundle
  ) => {
    runtimeAssetFailureCount = bundle.failures.length;
    assetStatus = bundle.failures.length === 0 ? 'ready' : 'degraded';
    scene.userData.innerKeepAssetStatus = assetStatus;
    scene.userData.innerKeepRuntimeAssetFailures = bundle.failures;
    scene.userData.innerKeepAssetLoadAttemptCount = assetLoadAttemptCount;
  };

  const ensureRuntimeAssets = (
    plan: InnerKeepAmbientSimulationPlan,
    visualSeed: number
  ) => {
    if (options.assetLoading === 'disabled') return;
    const populationActorIds = plan.routines.map((routine) => routine.actor.actorId);
    const key = `${plan.planId}:${populationActorIds.join(',')}`;
    const sameKey = assetLoadKey === key;
    if (sameKey && assetStatus === 'loading') return;
    if (sameKey && runtimeAssetBundle && assetStatus === 'ready') return;
    if (
      sameKey
      && assetStatus === 'degraded'
      && assetLoadAttemptCount >= MAX_RUNTIME_ASSET_LOAD_ATTEMPTS
    ) return;
    if (!sameKey) {
      assetLoadKey = key;
      assetLoadAttemptCount = 0;
    }
    assetLoadAttemptCount += 1;
    const generation = ++assetLoadGeneration;
    assetLoadController?.abort();
    assetLoadController = new AbortController();
    const retainingSettledSameKeyBundle = sameKey && runtimeAssetBundle !== null;
    if (!retainingSettledSameKeyBundle) clearRuntimePresentation(true);
    assetStatus = 'loading';
    if (!retainingSettledSameKeyBundle) runtimeAssetFailureCount = 0;
    scene.userData.innerKeepAssetStatus = assetStatus;
    scene.userData.innerKeepAssetLoadAttemptCount = assetLoadAttemptCount;
    void (options.runtimeAssetLoader ?? loadInnerKeepRuntimeAssetBundle)({
      quality: options.quality,
      reducedMotion: options.reducedMotion,
      baseUrl: options.baseUrl ?? import.meta.env.BASE_URL,
      maxAnisotropy: options.maxAnisotropy,
      staticAssetIds: allInnerKeepStaticRuntimeAssetIds(),
      populationActorIds,
      signal: assetLoadController.signal
    }).then((bundle) => {
      if (disposed || generation !== assetLoadGeneration) {
        bundle.dispose();
        return;
      }
      const settledBundle = retainingSettledSameKeyBundle
        ? runtimeAssetBundle
        : null;
      if (
        settledBundle
        && (
          !preservesRuntimeBundlePrefabIds(bundle, settledBundle)
          || compareRuntimeBundleCoverage(bundle, settledBundle) < 0
        )
      ) {
        bundle.dispose();
        retainRuntimePresentation(settledBundle);
        if (lastPresentation) reconcile(lastPresentation, lastVisualContext);
        else options.requestRender();
        return;
      }
      installRuntimePresentation(bundle, plan, visualSeed);
      if (lastPresentation) reconcile(lastPresentation, lastVisualContext);
      else options.requestRender();
    }).catch((error: unknown) => {
      if (disposed || generation !== assetLoadGeneration) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      assetStatus = 'degraded';
      runtimeAssetFailureCount = populationActorIds.length
        + allInnerKeepStaticRuntimeAssetIds().length;
      scene.userData.innerKeepAssetStatus = assetStatus;
      scene.userData.innerKeepRuntimeAssetLoadError = error instanceof Error
        ? error.message.slice(0, 240)
        : 'Unknown Inner Keep asset load failure.';
      telemetry = Object.freeze({
        ...telemetry,
        assetStatus,
        runtimeAssetFailureCount
      });
      if (assetLoadAttemptCount < MAX_RUNTIME_ASSET_LOAD_ATTEMPTS) {
        ensureRuntimeAssets(plan, visualSeed);
      } else {
        options.requestRender();
      }
    });
  };

  const updateCamera = () => {
    const aspect = Math.max(0.2, viewportWidth / Math.max(1, viewportHeight));
    const minimumHalfWidth = INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth / zoom;
    const baseHalfHeight = (
      aspect < INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.minimumAspect
        ? INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.baseHalfHeight
        : INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.baseHalfHeight
    ) / zoom;
    const halfHeight = Math.max(baseHalfHeight, minimumHalfWidth / aspect);
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    const portraitFraming = cameraFramingMode === 'portrait';
    const [cameraX, cameraY, cameraZ] = portraitFraming
      ? INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.positionMeters
      : INNER_KEEP_PRESENTATION_CAMERA_PRESETS.positionMeters;
    const [targetX, targetY, targetZ] = portraitFraming
      ? INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.targetMeters
      : INNER_KEEP_PRESENTATION_CAMERA_PRESETS.targetMeters;
    camera.position.set(cameraX + focusX, cameraY, cameraZ + focusZ);
    camera.lookAt(targetX + focusX, targetY, targetZ + focusZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  const applyAutomaticFramingForViewport = () => {
    const aspect = Math.max(0.2, viewportWidth / Math.max(1, viewportHeight));
    const nextMode = aspect
      < INNER_KEEP_PRESENTATION_CAMERA_PRESETS.portrait.maximumAspectExclusive
      ? 'portrait'
      : 'landscape';
    if (
      cameraWasManuallyAdjusted
      || cameraFramingMode === nextMode
    ) return;
    cameraFramingMode = nextMode;
    const initialZoom = nextMode === 'portrait'
      ? INNER_KEEP_OUTER_WORLD_INITIAL_ZOOM.portrait
      : INNER_KEEP_OUTER_WORLD_INITIAL_ZOOM.landscape;
    zoom = Math.max(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.minimum,
      Math.min(
        INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.maximum,
        initialZoom
      )
    );
  };
  updateCamera();

  const getSlotProjectionFrame = (): InnerKeepSlotProjectionFrame => {
    const rect = options.canvas.getBoundingClientRect();
    const viewportWidth = Math.max(0, rect.width);
    const viewportHeight = Math.max(0, rect.height);
    if (disposed || viewportWidth <= 0 || viewportHeight <= 0) {
      return Object.freeze({
        viewportLeft: rect.left,
        viewportTop: rect.top,
        viewportWidth,
        viewportHeight,
        slots: Object.freeze([])
      });
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const slots = [...padMeshes.entries()].map(([slotId, pad]) => {
      if (pad.geometry.boundingBox === null) pad.geometry.computeBoundingBox();
      const bounds = pad.geometry.boundingBox;
      if (!bounds) {
        return Object.freeze({
          slotId,
          x: rect.left,
          y: rect.top,
          width: 0,
          height: 0,
          visible: false
        });
      }
      let minimumX = Number.POSITIVE_INFINITY;
      let maximumX = Number.NEGATIVE_INFINITY;
      let minimumY = Number.POSITIVE_INFINITY;
      let maximumY = Number.NEGATIVE_INFINITY;
      let minimumDepth = Number.POSITIVE_INFINITY;
      let maximumDepth = Number.NEGATIVE_INFINITY;
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            projectionPoint
              .set(x, y, z)
              .applyMatrix4(pad.matrixWorld)
              .project(camera);
            const clientX = rect.left + (projectionPoint.x + 1) * 0.5 * viewportWidth;
            const clientY = rect.top + (1 - projectionPoint.y) * 0.5 * viewportHeight;
            minimumX = Math.min(minimumX, clientX);
            maximumX = Math.max(maximumX, clientX);
            minimumY = Math.min(minimumY, clientY);
            maximumY = Math.max(maximumY, clientY);
            minimumDepth = Math.min(minimumDepth, projectionPoint.z);
            maximumDepth = Math.max(maximumDepth, projectionPoint.z);
          }
        }
      }
      const width = Math.max(0, maximumX - minimumX);
      const height = Math.max(0, maximumY - minimumY);
      const visible = Number.isFinite(minimumX)
        && Number.isFinite(maximumX)
        && Number.isFinite(minimumY)
        && Number.isFinite(maximumY)
        && minimumDepth <= 1
        && maximumDepth >= -1
        && maximumX >= rect.left
        && minimumX <= rect.right
        && maximumY >= rect.top
        && minimumY <= rect.bottom;
      return Object.freeze({
        slotId,
        x: (minimumX + maximumX) * 0.5,
        y: (minimumY + maximumY) * 0.5,
        width,
        height,
        visible
      });
    });
    return Object.freeze({
      viewportLeft: rect.left,
      viewportTop: rect.top,
      viewportWidth,
      viewportHeight,
      slots: Object.freeze(slots)
    });
  };

  const updateSmoke = (elapsedSeconds: number) => {
    if (!constructionPosition || smoke.count === 0) return false;
    const time = options.reducedMotion ? 0.42 : elapsedSeconds;
    smokeQuaternion.copy(camera.quaternion);
    for (let index = 0; index < smoke.count; index += 1) {
      const seed = deterministicUnit(index, 11);
      const phase = (seed + time * (0.028 + deterministicUnit(index, 12) * 0.022)) % 1;
      const angle = deterministicUnit(index, 13) * Math.PI * 2 + time * 0.12;
      const radius = 0.18 + deterministicUnit(index, 14) * 1.18;
      const height = options.reducedMotion
        ? 0.65 + deterministicUnit(index, 15) * 1.35
        : 0.45 + phase * 2.75;
      smokePosition.set(
        constructionPosition.x + Math.cos(angle) * radius,
        constructionPosition.y + height,
        constructionPosition.z + Math.sin(angle) * radius * 0.72
      );
      const scale = (0.42 + deterministicUnit(index, 16) * 0.78) * (0.82 + phase * 0.72);
      smokeScale.setScalar(scale);
      smokeMatrix.compose(smokePosition, smokeQuaternion, smokeScale);
      smoke.setMatrixAt(index, smokeMatrix);
    }
    smoke.instanceMatrix.needsUpdate = true;
    return !options.reducedMotion;
  };

  const updateCompletionReveal = (elapsedSeconds: number) => {
    const reveal = completionReveal;
    if (!reveal) return false;
    const progress = Math.max(0, Math.min(
      1,
      (elapsedSeconds - reveal.startedAtSeconds) / reveal.durationSeconds
    ));
    // Smoothstep keeps the authoritative swap calm without delaying the
    // completed building's existence or exposing an empty presentation frame.
    const eased = progress * progress * (3 - 2 * progress);
    setGroupOpacity(reveal.building, 0.12 + eased * 0.88);
    setGroupOpacity(reveal.scaffold, 1 - eased);
    smokeMaterial.opacity = 0.68 * (1 - eased);
    smokeMaterial.needsUpdate = true;
    if (progress < 1) return true;
    dynamicGroup.remove(reveal.scaffold);
    setGroupOpacity(reveal.building, 1);
    const previousSmokeCount = smoke.count;
    constructionPosition = null;
    smoke.count = 0;
    smokeMaterial.opacity = 0.68;
    smokeMaterial.needsUpdate = true;
    completionReveal = null;
    telemetry = Object.freeze({
      ...telemetry,
      triangleCount: Math.max(
        0,
        telemetry.triangleCount
          - geometryTriangleCount(smokeGeometry) * previousSmokeCount
      ),
      drawCalls: Math.max(0, telemetry.drawCalls - (previousSmokeCount > 0 ? 1 : 0)),
      smokeSpriteCount: 0,
      completionRevealActive: false
    });
    scene.userData.innerKeepSceneGraphRenderBudgetExceeded =
      innerKeepSceneGraphExceedsRenderBudget(options.quality, telemetry);
    return true;
  };

  const clearDynamicPresentation = () => {
    for (const child of [...dynamicGroup.children]) {
      if (child !== smoke) dynamicGroup.remove(child);
    }
    dynamicGeometries.forEach((geometry) => geometry.dispose());
    dynamicMaterials.forEach((material) => material.dispose());
    dynamicGeometries.clear();
    dynamicMaterials.clear();
    for (const mesh of padMeshes.values()) staticGroup.remove(mesh);
    padMeshes.clear();
    constructionPosition = null;
    completionReveal = null;
    smoke.count = 0;
    smokeMaterial.opacity = 0.68;
  };

  const measureTelemetry = (
    status: InnerKeepSceneTelemetry['status'],
    slotCount: number,
    completedBuildingCount: number,
    constructionSiteCount: number
  ) => {
    let triangleCount = 0;
    let drawCalls = 0;
    scene.traverseVisible((object) => {
      if (object instanceof THREE.Sprite) {
        triangleCount += 2;
        drawCalls += 1;
        return;
      }
      if (!(object instanceof THREE.Mesh)) return;
      const count = object instanceof THREE.InstancedMesh ? object.count : 1;
      triangleCount += geometryTriangleCount(object.geometry) * count;
      if (count > 0) drawCalls += Array.isArray(object.material)
        ? object.geometry.groups.length || object.material.length
        : 1;
    });
    const populationTelemetry = populationPresentation?.getTelemetry();
    const outerTelemetry = outerWorldPresentation?.getTelemetry();
    const rabbitTelemetry = rabbitPresentation?.getTelemetry();
    const exteriorRouteIds = new Set([
      'inner-keep-civic-mounted-loop-v1',
      'inner-keep-barracks-mounted-patrol-loop-v1',
      'inner-keep-outer-foot-escort-loop-v1'
    ]);
    const exteriorRoutines = populationTelemetry
      ? ambientPlan?.routines.filter(({ route }) => exteriorRouteIds.has(route.routeId)) ?? []
      : [];
    const exactWildlifeCount = rabbitTelemetry?.status === 'ready'
      ? rabbitTelemetry.rabbitCount
      : 0;
    const proceduralWildlifeCount = outerTelemetry?.proceduralWildlifeCount ?? 0;
    telemetry = Object.freeze({
      status,
      assetStatus,
      triangleCount,
      drawCalls,
      smokeSpriteCount: smoke.count,
      grassBladeCount: ecology?.grassBladeCount ?? 0,
      waterSurfaceCount: ecology?.waterSurfaceCount ?? 0,
      authoredAssetCount: authoredPresentation?.loadedAssetCount ?? 0,
      authoredPlacementCount: authoredPresentation?.placementInstanceCount ?? 0,
      authoredTreeCount: authoredPresentation?.authoredTreeCount ?? 0,
      ambientActorCount: populationTelemetry?.actorCount ?? 0,
      mountedActorCount: populationTelemetry?.mountedActorCount ?? 0,
      patrolUnitCount: populationTelemetry?.patrolUnitCount ?? 0,
      activeConversationCount: populationTelemetry?.activeConversationCount ?? 0,
      animationMixerCount: (populationTelemetry?.animationMixerCount ?? 0)
        + (rabbitTelemetry?.animationMixerCount ?? 0),
      runtimeAssetFailureCount,
      outerWorldStatus: outerTelemetry?.status ?? 'idle',
      outerWorldRuntimeAssetFailureCount: (outerTelemetry?.failures.length ?? 0)
        + (rabbitTelemetry?.runtimeAssetFailureCount ?? 0),
      topographicFeatureCount: INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.length,
      terrainTriangleCount: outerTerrain.triangleCount,
      terrainHeightRangeMillimeters: outerTerrain.heightRangeMillimeters,
      exteriorTreeCount: outerTelemetry?.treeCount ?? 0,
      scenicResourceNodeCount: outerTelemetry?.resourceCount ?? 0,
      wildlifeAssetStatus: rabbitTelemetry?.status ?? 'idle',
      wildlifeCount: exactWildlifeCount + proceduralWildlifeCount,
      exactWildlifeCount,
      proceduralWildlifeCount,
      tradeWagonCount: outerTelemetry?.supplyWagonCount ?? 0,
      exteriorActorCount: exteriorRoutines.length,
      exteriorMountedActorCount: exteriorRoutines.filter(({ actor }) => actor.mounted).length,
      exteriorPatrolUnitCount: exteriorRoutines.filter(({ actor }) => (
        actor.presentationRole === 'ceremonial-patrol'
      )).length,
      slotCount,
      completedBuildingCount,
      constructionSiteCount,
      completionRevealActive: completionReveal !== null
    });
    scene.userData.innerKeepSceneGraphRenderBudget =
      INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS[options.quality];
    scene.userData.innerKeepSceneGraphRenderBudgetExceeded =
      innerKeepSceneGraphExceedsRenderBudget(options.quality, telemetry);
  };

  refreshOptionalPresentationTelemetry = () => {
    if (disposed) return;
    measureTelemetry(
      telemetry.status,
      telemetry.slotCount,
      telemetry.completedBuildingCount,
      telemetry.constructionSiteCount
    );
    options.requestRender();
  };

  const reconcile = (
    presentation: InnerKeepPresentation | null,
    context?: InnerKeepSceneVisualContext
  ) => {
    if (disposed) return;
    lastPresentation = presentation;
    lastVisualContext = context;
    clearDynamicPresentation();
    if (!presentation) {
      ambientGroup.visible = false;
      authoredStaticGroup.visible = false;
      previousBuildingPhases = new Map();
      measureTelemetry('empty', 0, 0, 0);
      options.requestRender();
      return;
    }
    if (!innerKeepPresentationIntegrity(presentation)) {
      ambientGroup.visible = false;
      authoredStaticGroup.visible = false;
      previousBuildingPhases = new Map();
      measureTelemetry('unavailable', 0, 0, 0);
      options.requestRender();
      return;
    }
    const orderedSlots = [...presentation.slots].sort((left, right) => (
      left.sortOrder - right.sortOrder
    ));
    const visualSeed = deterministicVisualSeed(presentation, context);
    currentVisualSeed = visualSeed;
    ambientGroup.visible = true;
    authoredStaticGroup.visible = true;
    ensureEcology(visualSeed);
    ensureOuterWorld(visualSeed);
    const nextAmbientPlan = createInnerKeepAmbientSimulationPlan({
      seed: visualSeed,
      quality: options.quality,
      reducedMotion: options.reducedMotion
    });
    ambientPlan = nextAmbientPlan;
    ensureRuntimeAssets(nextAmbientPlan, visualSeed);
    scene.userData.innerKeepVisualSeed = visualSeed;
    scene.userData.innerKeepOwningTerrain = context?.owningTerrainKind ?? 'unknown';
    const groundColor = context?.owningTerrainKind === 'forest'
      ? 0xeaf3e5
      : context?.owningTerrainKind === 'heath'
        ? 0xf2eddc
        : context?.owningTerrainKind === 'ridge'
          || context?.owningTerrainKind === 'ancient-stone'
          ? 0xe8e8e4
          : 0xffffff;
    groundMaterial.color.setHex(groundColor).offsetHSL(
      (deterministicUnit(0, visualSeed % 10_007) - 0.5) * 0.018,
      0,
      (deterministicUnit(1, visualSeed % 10_007) - 0.5) * 0.045
    );
    dynamicGroup.add(createDeterministicYardDressing(
      visualSeed,
      context?.owningTerrainKind,
      dynamicMaterials,
      dynamicGeometries
    ));
    const positionBySlotId = new Map<string, InnerKeepSlotPosition>();
    orderedSlots.forEach((slot) => {
      const position = SLOT_POSITIONS.get(slot.slotId)!;
      positionBySlotId.set(slot.slotId, position);
      const pad = setShadow(new THREE.Mesh(
        padGeometry,
        slot.slotId === selectedSlotId
          ? selectedPadMaterial
          : position.active
            ? padMaterial
            : reservedPadMaterial
      ), false, true);
      const footprintScale = slot.footprintClass === 'large' ? 2.1 / 1.85 : 1;
      pad.scale.set(footprintScale, 1, footprintScale);
      pad.position.set(position.x, 0.16, position.z);
      pad.rotation.y = position.rotation;
      pad.userData.innerKeepSlotId = slot.slotId;
      pad.name = `inner-keep-slot-pad:${slot.slotId}`;
      padMeshes.set(slot.slotId, pad);
      staticGroup.add(pad);
    });

    let completedBuildingCount = 0;
    let constructionSiteCount = 0;
    const visuallyPendingCompletedSlots = new Set<string>();
    for (const building of presentation.buildings) {
      const position = positionBySlotId.get(building.slotId);
      if (!position) continue;
      if (building.phase === 'complete') {
        const terminalAssetFallback = options.assetLoading === 'disabled'
          || (
            assetStatus === 'degraded'
            && assetLoadAttemptCount >= MAX_RUNTIME_ASSET_LOAD_ATTEMPTS
          );
        const authoredModel = createInnerKeepAuthoredBuilding({
          bundle: authoredPresentation || terminalAssetFallback
            ? runtimeAssetBundle
            : null,
          buildingKind: building.buildingKind,
          completedLevel: building.completedLevel,
          disposableMaterials: dynamicMaterials
        });
        if (!authoredModel && !terminalAssetFallback) {
          const scaffold = createScaffold(dynamicMaterials, dynamicGeometries);
          scaffold.position.set(position.x, 0.25, position.z);
          scaffold.rotation.y = position.rotation;
          dynamicGroup.add(scaffold);
          constructionPosition = Object.freeze({
            x: position.x,
            y: 0.32,
            z: position.z
          });
          constructionSiteCount += 1;
          visuallyPendingCompletedSlots.add(building.slotId);
          continue;
        }
        const model = authoredModel ?? createBuilding(
          building.buildingKind,
          building.completedLevel,
          dynamicMaterials,
          dynamicGeometries
        );
        model.position.set(
          position.x,
          model.userData.innerKeepAuthoredAsset === true ? 0.13 : 0.26,
          position.z
        );
        model.rotation.y = position.rotation;
        dynamicGroup.add(model);
        if (
          !options.reducedMotion
          && !completionReveal
          && previousBuildingPhases.get(building.slotId) === 'constructing'
        ) {
          const revealScaffold = createScaffold(
            dynamicMaterials,
            dynamicGeometries
          );
          revealScaffold.position.set(position.x, 0.25, position.z);
          revealScaffold.rotation.y = position.rotation;
          setGroupOpacity(model, 0.12);
          dynamicGroup.add(revealScaffold);
          completionReveal = Object.freeze({
            building: model,
            scaffold: revealScaffold,
            startedAtSeconds: lastElapsedSeconds,
            durationSeconds: 1.1
          });
          constructionPosition = Object.freeze({
            x: position.x,
            y: 0.32,
            z: position.z
          });
        }
        completedBuildingCount += 1;
        continue;
      }
      const scaffold = createScaffold(dynamicMaterials, dynamicGeometries);
      scaffold.position.set(position.x, 0.25, position.z);
      scaffold.rotation.y = position.rotation;
      dynamicGroup.add(scaffold);
      constructionPosition = Object.freeze({
        x: position.x,
        y: 0.32,
        z: position.z
      });
      constructionSiteCount += 1;
    }
    smoke.count = constructionPosition
      ? SMOKE_SPRITE_BUDGET[options.quality]
      : 0;
    updateSmoke(lastElapsedSeconds);
    updateCompletionReveal(lastElapsedSeconds);
    previousBuildingPhases = new Map(presentation.buildings.map((building) => [
      building.slotId,
      visuallyPendingCompletedSlots.has(building.slotId)
        ? 'constructing'
        : building.phase
    ] as const));
    measureTelemetry(
      'ready',
      orderedSlots.length,
      completedBuildingCount,
      constructionSiteCount
    );
    options.requestRender();
  };

  return Object.freeze({
    scene,
    camera,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      assetLoadGeneration += 1;
      assetLoadController?.abort();
      assetLoadController = null;
      clearDynamicPresentation();
      clearRuntimePresentation(true);
      ecology?.dispose();
      ecology = null;
      ecologySeed = null;
      outerWorldPresentation?.dispose();
      outerWorldPresentation = null;
      rabbitPresentation?.dispose();
      rabbitPresentation = null;
      outerWorldSeed = null;
      scene.clear();
      disposableGeometries.forEach((geometry) => geometry.dispose());
      disposableMaterials.forEach((material) => material.dispose());
      disposableTextures.forEach((texture) => texture.dispose());
      disposableGeometries.clear();
      disposableMaterials.clear();
      disposableTextures.clear();
      padMeshes.clear();
    },
    getAnimationFrameCap: () => options.reducedMotion
      ? 0
      : Math.max(
          SMOKE_FRAME_CAP[options.quality],
          ambientPlan?.animationFrameCap ?? LIVING_FRAME_CAP[options.quality]
        ),
    getSlotProjectionFrame,
    getTelemetry: () => telemetry,
    isAnimationActive: () => (
      !disposed
      && !options.reducedMotion
      && (
        (constructionPosition !== null && smoke.count > 0)
        || completionReveal !== null
        || ecology?.isAnimationActive() === true
        || populationPresentation?.isAnimationActive() === true
        || outerWorldPresentation?.isAnimationActive() === true
        || rabbitPresentation?.isAnimationActive() === true
      )
    ),
    panByPixels: (deltaX, deltaY) => {
      if (disposed || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
      if (deltaX !== 0 || deltaY !== 0) cameraWasManuallyAdjusted = true;
      const scale = 0.012 / zoom;
      const [minimumX, maximumX] = INNER_KEEP_OUTER_WORLD_PAN_BOUNDS.x;
      const [minimumZ, maximumZ] = INNER_KEEP_OUTER_WORLD_PAN_BOUNDS.z;
      focusX = Math.max(minimumX, Math.min(maximumX, focusX - deltaX * scale));
      focusZ = Math.max(minimumZ, Math.min(maximumZ, focusZ - deltaY * scale));
      updateCamera();
      options.requestRender();
    },
    pickSlot: (clientX, clientY) => {
      if (disposed) return null;
      const rect = options.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...padMeshes.values()], false)[0];
      const slotId = hit?.object.userData.innerKeepSlotId;
      return typeof slotId === 'string' ? slotId : null;
    },
    reconcile,
    setSelectedSlot: (slotId) => {
      if (disposed || selectedSlotId === slotId) return;
      selectedSlotId = slotId;
      for (const [id, pad] of padMeshes) {
        pad.material = id === slotId
          ? selectedPadMaterial
          : SLOT_POSITIONS.get(id)?.active === true
            ? padMaterial
            : reservedPadMaterial;
      }
      options.requestRender();
    },
    setViewport: (width, height) => {
      if (disposed) return;
      viewportWidth = Math.max(1, width);
      viewportHeight = Math.max(1, height);
      applyAutomaticFramingForViewport();
      updateCamera();
    },
    update: (elapsedSeconds) => {
      if (disposed || !Number.isFinite(elapsedSeconds)) return false;
      lastElapsedSeconds = Math.max(0, elapsedSeconds);
      const smokeChanged = updateSmoke(lastElapsedSeconds);
      const revealChanged = updateCompletionReveal(lastElapsedSeconds);
      const ecologyChanged = ecology?.update(lastElapsedSeconds) === true;
      const populationChanged = populationPresentation?.update(lastElapsedSeconds) === true;
      const outerWorldChanged = outerWorldPresentation?.update(lastElapsedSeconds) === true;
      const rabbitChanged = rabbitPresentation?.update(lastElapsedSeconds) === true;
      if (populationChanged && populationPresentation) {
        const populationTelemetry = populationPresentation.getTelemetry();
        if (telemetry.activeConversationCount !== populationTelemetry.activeConversationCount) {
          const conversationDelta = populationTelemetry.activeConversationCount
            - telemetry.activeConversationCount;
          telemetry = Object.freeze({
            ...telemetry,
            triangleCount: Math.max(0, telemetry.triangleCount + conversationDelta * 4),
            drawCalls: Math.max(0, telemetry.drawCalls + conversationDelta * 2),
            activeConversationCount: populationTelemetry.activeConversationCount
          });
          scene.userData.innerKeepSceneGraphRenderBudgetExceeded =
            innerKeepSceneGraphExceedsRenderBudget(options.quality, telemetry);
        }
      }
      return smokeChanged
        || revealChanged
        || ecologyChanged
        || populationChanged
        || outerWorldChanged
        || rabbitChanged;
    },
    zoomByWheel: (deltaY, deltaMode) => {
      if (disposed || !Number.isFinite(deltaY)) return;
      if (deltaY !== 0) cameraWasManuallyAdjusted = true;
      const unit = deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? viewportHeight
          : 1;
      zoom = Math.max(
        INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.minimum,
        Math.min(
          INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.maximum,
          zoom * Math.exp(-deltaY * unit * 0.0012)
        )
      );
      updateCamera();
      options.requestRender();
    }
  });
}
