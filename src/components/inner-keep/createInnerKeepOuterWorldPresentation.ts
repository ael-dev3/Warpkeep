import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import {
  HEGEMONY_GOLD_MINE_RUNTIME_ASSETS,
  HEGEMONY_LOGGING_CAMP_RUNTIME_ASSETS,
  HEGEMONY_STONE_QUARRY_RUNTIME_ASSETS,
  HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS,
  HEGEMONY_WHEAT_FARM_RUNTIME_ASSETS,
  acquireHegemonyExpeditionPrefab,
  type HegemonyExpeditionLod,
  type HegemonyExpeditionModel,
  type HegemonyExpeditionPrefabLease,
  type LoadHegemonyExpeditionModelOptions,
} from '../realm/loadHegemonyExpeditionAssets';
import {
  acquireHegemonyTreePrefab,
  type AcquireHegemonyTreePrefabOptions,
  type HegemonyTreePrefab,
  type HegemonyTreePrefabLease,
} from '../realm/loadHegemonyTreeAssets';
import {
  HEGEMONY_TREE_RUNTIME_ASSET_BY_ID,
  type HegemonyTreeLod,
} from '../realm/hegemonyTreeRuntimeAssets';
import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';
import {
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE,
  INNER_KEEP_OUTER_WORLD_TREE_BUDGETS,
  INNER_KEEP_OUTER_WORLD_TREE_SPECIES_IDS,
  innerKeepOuterWorldPointIsClear,
  innerKeepOuterWorldTerrainHeightAt,
} from './innerKeepOuterWorldPolicy';

// Narrow adapter until the policy exposes the semantic wildlife-budget alias.
const INNER_KEEP_OUTER_WORLD_WILDLIFE_BUDGETS = Object.freeze({
  high: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.high.wildlifeActors,
  balanced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.balanced.wildlifeActors,
  reduced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.reduced.wildlifeActors,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

type OuterWorldAssetState = 'disabled' | 'loading' | 'exact' | 'fallback' | 'partial';
type OuterWorldStatus = 'loading' | 'ready' | 'fallback' | 'partial' | 'aborted' | 'disposed';

function disposeInstancedMeshBuffers(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
}

type OuterWorldFailureScope = 'tree' | 'resource' | 'supply-wagon';

export type InnerKeepOuterWorldFailure = Readonly<{
  scope: OuterWorldFailureScope;
  assetId: string;
  message: string;
}>;

export type InnerKeepOuterWorldTelemetry = Readonly<{
  status: OuterWorldStatus;
  treeAssetState: OuterWorldAssetState;
  resourceAssetState: OuterWorldAssetState;
  supplyWagonAssetState: OuterWorldAssetState;
  treeCount: number;
  exactTreeCount: number;
  fallbackTreeCount: number;
  treeSpeciesCount: number;
  exactTreeSpeciesCount: number;
  treeBatchDrawCallCount: number;
  resourceCount: number;
  exactResourceCount: number;
  fallbackResourceCount: number;
  resourceFamilyCount: number;
  exactResourceFamilyCount: number;
  failedResourceFamilyCount: number;
  wildlifeCount: number;
  proceduralWildlifeCount: number;
  supplyWagonCount: number;
  exactSupplyWagonCount: number;
  fallbackSupplyWagonCount: number;
  groundedTreeCount: number;
  groundedResourceCount: number;
  groundedWildlifeCount: number;
  groundedSupplyWagonCount: number;
  groundContactCount: number;
  pendingAssetLoadCount: number;
  exactCoreBundleRequired: false;
  coreBundleDependency: 'none';
  failures: readonly InnerKeepOuterWorldFailure[];
}>;

export type InnerKeepOuterWorldTreePlacement = Readonly<{
  instanceIndex: number;
  speciesId: string;
  positionMeters: readonly [number, number, number];
  rotationYRadians: number;
  scale: number;
}>;

export type InnerKeepOuterWorldResourcePlacement = Readonly<{
  instanceIndex: number;
  visualSiteKey: string;
  resourceKind: string;
  positionMeters: readonly [number, number, number];
  rotationYRadians: number;
  targetFootprintDiameter: number;
}>;

export type InnerKeepOuterWorldWildlifePlacement = Readonly<{
  instanceIndex: number;
  anchorMeters: readonly [number, number, number];
  phaseRadians: number;
  roamingRadiusMeters: number;
  speedRadiansPerSecond: number;
  scale: number;
}>;

export type InnerKeepOuterWorldPresentation = Readonly<{
  group: THREE.Group;
  ready: Promise<void>;
  update: (elapsedSeconds: number) => boolean;
  isAnimationActive: () => boolean;
  setReducedMotion: (reducedMotion: boolean) => boolean;
  /** Lets an exact wildlife presenter replace the temporary low-poly rabbits. */
  setProceduralWildlifeVisible: (visible: boolean) => boolean;
  getTelemetry: () => InnerKeepOuterWorldTelemetry;
  dispose: () => void;
}>;

export type AcquireOuterWorldTreePrefab = (
  options: AcquireHegemonyTreePrefabOptions,
) => Promise<HegemonyTreePrefabLease>;

export type AcquireOuterWorldExpeditionPrefab = (
  options: LoadHegemonyExpeditionModelOptions,
) => Promise<HegemonyExpeditionPrefabLease>;

export type CreateInnerKeepOuterWorldPresentationOptions = Readonly<{
  quality: InnerKeepSceneQuality;
  visualSeed: number;
  reducedMotion: boolean;
  baseUrl?: string;
  maxAnisotropy?: number;
  loadExactAssets?: boolean;
  wildlifeMode?: 'procedural' | 'none';
  signal?: AbortSignal;
  requestRender?: () => void;
  onTelemetryChange?: (telemetry: InnerKeepOuterWorldTelemetry) => void;
  acquireTreePrefab?: AcquireOuterWorldTreePrefab;
  acquireExpeditionPrefab?: AcquireOuterWorldExpeditionPrefab;
  terrainHeightAt?: (x: number, z: number) => number;
  pointIsClear?: (x: number, z: number, clearanceMeters: number) => boolean;
}>;

type MutableAssetStates = {
  trees: OuterWorldAssetState;
  resources: OuterWorldAssetState;
  wagon: OuterWorldAssetState;
};

type ResourceFamily = Readonly<{
  kind: string;
  asset: (typeof HEGEMONY_GOLD_MINE_RUNTIME_ASSETS);
}>;

const OUTER_TREE_CANDIDATES_PER_PLACEMENT = 768;
const OUTER_WILDLIFE_CANDIDATES_PER_PLACEMENT = 384;
const OUTER_TREE_MINIMUM_SPACING_METERS = 0.92;
const OUTER_WILDLIFE_MINIMUM_SPACING_METERS = 1.65;
const SUPPLY_WAGON_TARGET_FOOTPRINT_METERS = 2.35;

function deterministicUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function safeTerrainHeight(
  terrainHeightAt: (x: number, z: number) => number,
  x: number,
  z: number,
) {
  const height = terrainHeightAt(x, z);
  return Number.isFinite(height) ? height : 0;
}

function exteriorCandidate(index: number, seed: number) {
  const band = index % 4;
  const across = deterministicUnit(index, seed + 11);
  const depth = deterministicUnit(index, seed + 23);
  if (band === 0) return { x: -31.5 + depth * 11.8, z: -28.5 + across * 56 };
  if (band === 1) return { x: 19.7 + depth * 11.8, z: -28.5 + across * 56 };
  if (band === 2) return { x: -28.5 + across * 57, z: -29.5 + depth * 10.4 };
  return { x: -28.5 + across * 57, z: 12.2 + depth * 17.2 };
}

function wildlifeCandidate(index: number, seed: number) {
  const meadow = index % 3;
  const xUnit = deterministicUnit(index, seed + 37);
  const zUnit = deterministicUnit(index, seed + 59);
  if (meadow === 0) return { x: -28 + xUnit * 9, z: -8 + zUnit * 17 };
  if (meadow === 1) return { x: 19 + xUnit * 10, z: -6 + zUnit * 15 };
  return { x: -9 + xUnit * 18, z: 14 + zUnit * 12 };
}

function acceptsSpacing(
  accepted: readonly Readonly<{ x: number; z: number }>[],
  x: number,
  z: number,
  spacingMeters: number,
) {
  const minimumDistanceSquared = spacingMeters * spacingMeters;
  return accepted.every((candidate) => (
    (candidate.x - x) ** 2 + (candidate.z - z) ** 2 >= minimumDistanceSquared
  ));
}

/** Pure, bounded placement planning shared by rendering and QA tests. */
export function planInnerKeepOuterWorldTrees(options: Readonly<{
  quality: InnerKeepSceneQuality;
  visualSeed: number;
  terrainHeightAt?: (x: number, z: number) => number;
  pointIsClear?: (x: number, z: number, clearanceMeters: number) => boolean;
}>): readonly InnerKeepOuterWorldTreePlacement[] {
  const targetCount = INNER_KEEP_OUTER_WORLD_TREE_BUDGETS[options.quality];
  const speciesIds = INNER_KEEP_OUTER_WORLD_TREE_SPECIES_IDS.slice(0, 6);
  if (targetCount <= 0 || speciesIds.length === 0) return Object.freeze([]);
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const pointIsClear = options.pointIsClear ?? innerKeepOuterWorldPointIsClear;
  const positions: Array<{ x: number; z: number }> = [];
  const placements: InnerKeepOuterWorldTreePlacement[] = [];
  const maximumCandidates = Math.max(
    targetCount * OUTER_TREE_CANDIDATES_PER_PLACEMENT,
    OUTER_TREE_CANDIDATES_PER_PLACEMENT,
  );
  const speciesOffset = Math.floor(
    deterministicUnit(0, options.visualSeed + 83) * speciesIds.length,
  ) % speciesIds.length;
  for (let candidateIndex = 0; candidateIndex < maximumCandidates; candidateIndex += 1) {
    if (placements.length >= targetCount) break;
    const candidate = exteriorCandidate(candidateIndex, options.visualSeed);
    const scale = 3.15 + deterministicUnit(candidateIndex, options.visualSeed + 71) * 1.45;
    const clearance = 0.28 * scale;
    if (!pointIsClear(candidate.x, candidate.z, clearance)) continue;
    if (!acceptsSpacing(
      positions,
      candidate.x,
      candidate.z,
      Math.max(OUTER_TREE_MINIMUM_SPACING_METERS, clearance * 1.35),
    )) continue;
    const speciesIndex = (placements.length + speciesOffset) % speciesIds.length;
    positions.push(candidate);
    placements.push(Object.freeze({
      instanceIndex: placements.length,
      speciesId: speciesIds[speciesIndex]!,
      positionMeters: Object.freeze([
        candidate.x,
        safeTerrainHeight(terrainHeightAt, candidate.x, candidate.z),
        candidate.z,
      ] as const),
      rotationYRadians: deterministicUnit(candidateIndex, options.visualSeed + 97) * Math.PI * 2,
      scale,
    }));
  }
  return Object.freeze(placements);
}

/** Pure visual copies around each policy-owned scenic resource anchor. */
export function planInnerKeepOuterWorldResources(options: Readonly<{
  quality: InnerKeepSceneQuality;
  visualSeed: number;
  terrainHeightAt?: (x: number, z: number) => number;
}>): readonly InnerKeepOuterWorldResourcePlacement[] {
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const placements: InnerKeepOuterWorldResourcePlacement[] = [];
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.forEach((site, siteIndex) => {
    const count = site.instancesByQuality[options.quality];
    for (let instanceIndex = 0; instanceIndex < count; instanceIndex += 1) {
      const angle = instanceIndex === 0
        ? 0
        : deterministicUnit(instanceIndex, options.visualSeed + siteIndex * 31) * Math.PI * 2;
      const radius = instanceIndex === 0
        ? 0
        : site.targetFootprintDiameter * (0.42 + 0.16 * instanceIndex);
      const x = site.positionMeters[0] + Math.cos(angle) * radius;
      const z = site.positionMeters[2] + Math.sin(angle) * radius;
      placements.push(Object.freeze({
        instanceIndex: placements.length,
        visualSiteKey: site.siteId,
        resourceKind: site.resourceKind,
        positionMeters: Object.freeze([
          x,
          safeTerrainHeight(terrainHeightAt, x, z),
          z,
        ] as const),
        rotationYRadians: site.rotationYMilliDegrees * Math.PI / 180_000
          + (instanceIndex === 0 ? 0 : angle + Math.PI),
        targetFootprintDiameter: site.targetFootprintDiameter,
      }));
    }
  });
  return Object.freeze(placements);
}

/** Pure deterministic anchors for the temporary procedural rabbit presenter. */
export function planInnerKeepOuterWorldWildlife(options: Readonly<{
  quality: InnerKeepSceneQuality;
  visualSeed: number;
  terrainHeightAt?: (x: number, z: number) => number;
  pointIsClear?: (x: number, z: number, clearanceMeters: number) => boolean;
}>): readonly InnerKeepOuterWorldWildlifePlacement[] {
  const targetCount = INNER_KEEP_OUTER_WORLD_WILDLIFE_BUDGETS[options.quality];
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const pointIsClear = options.pointIsClear ?? innerKeepOuterWorldPointIsClear;
  const positions: Array<{ x: number; z: number }> = [];
  const placements: InnerKeepOuterWorldWildlifePlacement[] = [];
  const maximumCandidates = Math.max(
    targetCount * OUTER_WILDLIFE_CANDIDATES_PER_PLACEMENT,
    OUTER_WILDLIFE_CANDIDATES_PER_PLACEMENT,
  );
  for (let candidateIndex = 0; candidateIndex < maximumCandidates; candidateIndex += 1) {
    if (placements.length >= targetCount) break;
    const candidate = wildlifeCandidate(candidateIndex, options.visualSeed);
    if (!pointIsClear(candidate.x, candidate.z, 0.7)) continue;
    if (!acceptsSpacing(
      positions,
      candidate.x,
      candidate.z,
      OUTER_WILDLIFE_MINIMUM_SPACING_METERS,
    )) continue;
    positions.push(candidate);
    placements.push(Object.freeze({
      instanceIndex: placements.length,
      anchorMeters: Object.freeze([
        candidate.x,
        safeTerrainHeight(terrainHeightAt, candidate.x, candidate.z),
        candidate.z,
      ] as const),
      phaseRadians: deterministicUnit(candidateIndex, options.visualSeed + 113) * Math.PI * 2,
      roamingRadiusMeters: 0.2 + deterministicUnit(candidateIndex, options.visualSeed + 127) * 0.32,
      speedRadiansPerSecond: 0.24 + deterministicUnit(candidateIndex, options.visualSeed + 139) * 0.18,
      scale: 0.82 + deterministicUnit(candidateIndex, options.visualSeed + 151) * 0.28,
    }));
  }
  return Object.freeze(placements);
}

function disableAuthorityAndPicking(root: THREE.Object3D) {
  root.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.gameplayAuthorityClaimed = false;
    object.userData.pickable = false;
    object.castShadow = false;
    object.receiveShadow = false;
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.raycast = () => undefined;
    }
  });
}

function setStaticInstanceMatrices(
  mesh: THREE.InstancedMesh,
  matrices: readonly THREE.Matrix4[],
) {
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.count = matrices.length;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function placementMatrix(
  positionMeters: readonly [number, number, number],
  rotationYRadians: number,
  scale = 1,
) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...positionMeters),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationYRadians),
    new THREE.Vector3(scale, scale, scale),
  );
}

function createExactTreeBatch(
  prefab: HegemonyTreePrefab,
  placements: readonly InnerKeepOuterWorldTreePlacement[],
) {
  const group = new THREE.Group();
  group.name = `inner-keep-outer-exact-tree-batch:${prefab.assetId}`;
  group.userData.innerKeepOuterWorldAssetId = prefab.assetId;
  prefab.primitives.forEach((primitive, primitiveIndex) => {
    const mesh = new THREE.InstancedMesh(
      primitive.geometry,
      primitive.material,
      Math.max(1, placements.length),
    );
    mesh.name = `inner-keep-outer-exact-tree-mesh:${prefab.assetId}:${primitiveIndex}`;
    const localMatrix = new THREE.Matrix4().fromArray([...primitive.localMatrixElements]);
    setStaticInstanceMatrices(mesh, placements.map((placement) => (
      placementMatrix(
        placement.positionMeters,
        placement.rotationYRadians,
        placement.scale,
      ).multiply(localMatrix)
    )));
    group.add(mesh);
  });
  disableAuthorityAndPicking(group);
  return group;
}

function createExactExpeditionBatch(
  label: string,
  model: HegemonyExpeditionModel,
  placements: readonly InnerKeepOuterWorldResourcePlacement[],
) {
  const group = new THREE.Group();
  group.name = `inner-keep-outer-exact-resource-batch:${label}`;
  model.root.updateWorldMatrix(true, true);
  const inverseRootMatrix = model.root.matrixWorld.clone().invert();
  let primitiveIndex = 0;
  model.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = new THREE.InstancedMesh(
      object.geometry,
      object.material,
      Math.max(1, placements.length),
    );
    mesh.name = `inner-keep-outer-exact-resource-mesh:${label}:${primitiveIndex}`;
    const localMatrix = inverseRootMatrix.clone().multiply(object.matrixWorld);
    setStaticInstanceMatrices(mesh, placements.map((placement) => (
      placementMatrix(placement.positionMeters, placement.rotationYRadians).multiply(localMatrix)
    )));
    group.add(mesh);
    primitiveIndex += 1;
  });
  if (primitiveIndex === 0) throw new Error(`${label} contains no renderable meshes.`);
  disableAuthorityAndPicking(group);
  return group;
}

function normalizedResourceFamily(resourceKind: string): ResourceFamily | null {
  const normalized = resourceKind.toLowerCase();
  if (normalized === 'gold' || normalized === 'gold-mine') {
    return { kind: 'gold', asset: HEGEMONY_GOLD_MINE_RUNTIME_ASSETS };
  }
  if (normalized === 'food' || normalized === 'wheat' || normalized === 'wheat-farm') {
    return { kind: 'food', asset: HEGEMONY_WHEAT_FARM_RUNTIME_ASSETS };
  }
  if (normalized === 'wood' || normalized === 'logging-camp') {
    return { kind: 'wood', asset: HEGEMONY_LOGGING_CAMP_RUNTIME_ASSETS };
  }
  if (normalized === 'stone' || normalized === 'stone-quarry') {
    return { kind: 'stone', asset: HEGEMONY_STONE_QUARRY_RUNTIME_ASSETS };
  }
  return null;
}

function createFallbackTrees(
  capacity: number,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
) {
  const group = new THREE.Group();
  group.name = 'inner-keep-outer-fallback-tree-batches';
  const trunkGeometry = new THREE.CylinderGeometry(0.055, 0.08, 0.42, 5);
  const crownGeometry = new THREE.ConeGeometry(0.27, 0.48, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x624631, roughness: 0.94 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x35663e, roughness: 0.9 });
  geometries.add(trunkGeometry);
  geometries.add(crownGeometry);
  materials.add(trunkMaterial);
  materials.add(crownMaterial);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, Math.max(1, capacity));
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, Math.max(1, capacity));
  trunks.name = 'inner-keep-outer-fallback-tree-trunks';
  crowns.name = 'inner-keep-outer-fallback-tree-crowns';
  group.add(trunks, crowns);
  disableAuthorityAndPicking(group);
  return { group, trunks, crowns };
}

function applyFallbackTreePlacements(
  fallback: ReturnType<typeof createFallbackTrees>,
  placements: readonly InnerKeepOuterWorldTreePlacement[],
) {
  const trunkMatrices = placements.map((placement) => {
    const [x, y, z] = placement.positionMeters;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + 0.21 * placement.scale, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationYRadians),
      new THREE.Vector3(placement.scale, placement.scale, placement.scale),
    );
  });
  const crownMatrices = placements.map((placement) => {
    const [x, y, z] = placement.positionMeters;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + 0.62 * placement.scale, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationYRadians),
      new THREE.Vector3(placement.scale, placement.scale, placement.scale),
    );
  });
  setStaticInstanceMatrices(fallback.trunks, trunkMatrices);
  setStaticInstanceMatrices(fallback.crowns, crownMatrices);
}

function createFallbackResourceFamily(
  kind: string,
  placements: readonly InnerKeepOuterWorldResourcePlacement[],
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
) {
  const group = new THREE.Group();
  group.name = `inner-keep-outer-fallback-resource:${kind}`;
  const baseGeometry = new THREE.CylinderGeometry(0.5, 0.62, 0.18, 7);
  const landmarkGeometry = kind === 'wood'
    ? new THREE.CylinderGeometry(0.16, 0.21, 0.72, 6)
    : kind === 'food'
      ? new THREE.ConeGeometry(0.48, 0.72, 8)
      : new THREE.DodecahedronGeometry(0.46, 0);
  const colors: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
    gold: Object.freeze([0x705529, 0xd5a846] as const),
    food: Object.freeze([0x6f7135, 0xd0a84e] as const),
    wood: Object.freeze([0x4f4935, 0x76502e] as const),
    stone: Object.freeze([0x5b5e61, 0xa4a09a] as const),
  });
  const palette = colors[kind] ?? colors.stone!;
  const baseMaterial = new THREE.MeshStandardMaterial({ color: palette[0], roughness: 0.96 });
  const landmarkMaterial = new THREE.MeshStandardMaterial({ color: palette[1], roughness: 0.86 });
  geometries.add(baseGeometry);
  geometries.add(landmarkGeometry);
  materials.add(baseMaterial);
  materials.add(landmarkMaterial);
  const bases = new THREE.InstancedMesh(baseGeometry, baseMaterial, Math.max(1, placements.length));
  const landmarks = new THREE.InstancedMesh(
    landmarkGeometry,
    landmarkMaterial,
    Math.max(1, placements.length),
  );
  bases.name = `inner-keep-outer-fallback-resource-base:${kind}`;
  landmarks.name = `inner-keep-outer-fallback-resource-landmark:${kind}`;
  setStaticInstanceMatrices(bases, placements.map((placement) => {
    const scale = placement.targetFootprintDiameter * 0.55;
    return placementMatrix([
      placement.positionMeters[0],
      placement.positionMeters[1] + 0.09 * scale,
      placement.positionMeters[2],
    ], placement.rotationYRadians, scale);
  }));
  setStaticInstanceMatrices(landmarks, placements.map((placement) => {
    const scale = placement.targetFootprintDiameter * 0.42;
    const contactLift = kind === 'stone' || kind === 'gold' ? 0.46 : 0.36;
    return placementMatrix([
      placement.positionMeters[0],
      placement.positionMeters[1] + contactLift * scale,
      placement.positionMeters[2],
    ], placement.rotationYRadians, scale);
  }));
  group.add(bases, landmarks);
  disableAuthorityAndPicking(group);
  return group;
}

function createRabbitBatches(
  capacity: number,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
) {
  const group = new THREE.Group();
  group.name = 'inner-keep-outer-procedural-wildlife';
  const bodyGeometry = new THREE.SphereGeometry(0.22, 7, 5);
  const headGeometry = new THREE.SphereGeometry(0.13, 7, 5);
  const earGeometry = new THREE.ConeGeometry(0.045, 0.22, 5);
  const tailGeometry = new THREE.SphereGeometry(0.065, 6, 4);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x9a856d, roughness: 0.96 });
  const earMaterial = new THREE.MeshStandardMaterial({ color: 0xb79a86, roughness: 0.94 });
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xd7c8b5, roughness: 0.98 });
  [bodyGeometry, headGeometry, earGeometry, tailGeometry].forEach((value) => geometries.add(value));
  [bodyMaterial, earMaterial, tailMaterial].forEach((value) => materials.add(value));
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, Math.max(1, capacity));
  const heads = new THREE.InstancedMesh(headGeometry, bodyMaterial, Math.max(1, capacity));
  const ears = new THREE.InstancedMesh(earGeometry, earMaterial, Math.max(1, capacity * 2));
  const tails = new THREE.InstancedMesh(tailGeometry, tailMaterial, Math.max(1, capacity));
  bodies.name = 'inner-keep-outer-rabbit-bodies';
  heads.name = 'inner-keep-outer-rabbit-heads';
  ears.name = 'inner-keep-outer-rabbit-ears';
  tails.name = 'inner-keep-outer-rabbit-tails';
  group.add(bodies, heads, ears, tails);
  disableAuthorityAndPicking(group);
  return { group, bodies, heads, ears, tails };
}

function setDynamicMatrices(mesh: THREE.InstancedMesh, matrices: readonly THREE.Matrix4[]) {
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.count = matrices.length;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function applyRabbitPlacements(
  rabbits: ReturnType<typeof createRabbitBatches>,
  placements: readonly InnerKeepOuterWorldWildlifePlacement[],
  elapsedSeconds: number,
  motionEnabled: boolean,
  terrainHeightAt: (x: number, z: number) => number,
  pointIsClear: (x: number, z: number, clearanceMeters: number) => boolean,
) {
  const bodyMatrices: THREE.Matrix4[] = [];
  const headMatrices: THREE.Matrix4[] = [];
  const earMatrices: THREE.Matrix4[] = [];
  const tailMatrices: THREE.Matrix4[] = [];
  placements.forEach((placement) => {
    const phase = placement.phaseRadians
      + (motionEnabled ? elapsedSeconds * placement.speedRadiansPerSecond : 0);
    const movingX = placement.anchorMeters[0] + Math.cos(phase) * placement.roamingRadiusMeters;
    const movingZ = placement.anchorMeters[2] + Math.sin(phase * 0.83) * placement.roamingRadiusMeters;
    const x = pointIsClear(movingX, movingZ, 0.34) ? movingX : placement.anchorMeters[0];
    const z = pointIsClear(movingX, movingZ, 0.34) ? movingZ : placement.anchorMeters[2];
    const y = safeTerrainHeight(terrainHeightAt, x, z);
    const yaw = phase + Math.PI * 0.5;
    const scale = placement.scale;
    const hop = motionEnabled ? Math.max(0, Math.sin(phase * 4)) * 0.055 : 0;
    const transform = (offset: THREE.Vector3, componentScale: THREE.Vector3) => (
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + hop, z).add(
          offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(scale),
        ),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        componentScale.multiplyScalar(scale),
      )
    );
    bodyMatrices.push(transform(new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(1.15, 0.86, 1)));
    headMatrices.push(transform(new THREE.Vector3(0, 0.28, -0.25), new THREE.Vector3(1, 1, 1)));
    earMatrices.push(transform(new THREE.Vector3(-0.055, 0.47, -0.26), new THREE.Vector3(1, 1, 1)));
    earMatrices.push(transform(new THREE.Vector3(0.055, 0.47, -0.26), new THREE.Vector3(1, 1, 1)));
    tailMatrices.push(transform(new THREE.Vector3(0, 0.25, 0.25), new THREE.Vector3(1, 1, 1)));
  });
  setDynamicMatrices(rabbits.bodies, bodyMatrices);
  setDynamicMatrices(rabbits.heads, headMatrices);
  setDynamicMatrices(rabbits.ears, earMatrices);
  setDynamicMatrices(rabbits.tails, tailMatrices);
}

function createFallbackWagon(
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
) {
  const group = new THREE.Group();
  group.name = 'inner-keep-outer-fallback-supply-wagon';
  const cartGeometry = new THREE.BoxGeometry(1.25, 0.55, 0.8);
  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 9);
  const material = new THREE.MeshStandardMaterial({ color: 0x6f4829, roughness: 0.9 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x302a27, roughness: 0.95 });
  geometries.add(cartGeometry);
  geometries.add(wheelGeometry);
  materials.add(material);
  materials.add(wheelMaterial);
  const cart = new THREE.Mesh(cartGeometry, material);
  cart.position.y = 0.62;
  group.add(cart);
  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.48, 0.48]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.x = Math.PI * 0.5;
      wheel.position.set(x, 0.34, z);
      group.add(wheel);
    }
  }
  group.scale.setScalar(0.72);
  disableAuthorityAndPicking(group);
  return group;
}

function routePoints() {
  return INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.map((point) => Object.freeze({
    x: point[0],
    z: point[2],
  }));
}

function sampleOpenRoutePingPong(elapsedSeconds: number) {
  const points = routePoints();
  if (points.length === 0) return { x: 0, z: 15, yaw: 0 };
  if (points.length === 1) return { ...points[0]!, yaw: 0 };
  const lengths = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]!;
    return Math.hypot(next.x - point.x, next.z - point.z);
  });
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const cycleDistance = ((Math.max(0, elapsedSeconds) * 1.15) % (totalLength * 2)
    + totalLength * 2) % (totalLength * 2);
  const reversing = cycleDistance > totalLength;
  let distance = reversing ? totalLength * 2 - cycleDistance : cycleDistance;
  for (let index = 0; index < lengths.length; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const length = lengths[index]!;
    if (distance > length && index < lengths.length - 1) {
      distance -= length;
      continue;
    }
    const progress = length <= 0.000_001 ? 0 : Math.min(1, distance / length);
    return {
      x: from.x + (to.x - from.x) * progress,
      z: from.z + (to.z - from.z) * progress,
      yaw: Math.atan2(
        (to.x - from.x) * (reversing ? -1 : 1),
        (to.z - from.z) * (reversing ? -1 : 1),
      ),
    };
  }
  return { ...points.at(-1)!, yaw: 0 };
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return String(error);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError';
}

/**
 * Creates an optional, visual-only countryside layer. Exact asset failures are
 * isolated here: the canonical Inner Keep bundle, authority, and interaction
 * surfaces never depend on this presenter's readiness.
 */
export function createInnerKeepOuterWorldPresentation(
  options: CreateInnerKeepOuterWorldPresentationOptions,
): InnerKeepOuterWorldPresentation {
  const group = new THREE.Group();
  group.name = 'inner-keep-outer-world-presentation';
  group.userData.presentationOnly = true;
  group.userData.gameplayAuthorityClaimed = false;
  group.userData.pickable = false;
  group.userData.exactCoreBundleRequired = false;
  const exactLayer = new THREE.Group();
  exactLayer.name = 'inner-keep-outer-world-exact-assets';
  const fallbackLayer = new THREE.Group();
  fallbackLayer.name = 'inner-keep-outer-world-fallback-assets';
  group.add(fallbackLayer, exactLayer);

  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const pointIsClear = options.pointIsClear ?? innerKeepOuterWorldPointIsClear;
  const treePlacements = planInnerKeepOuterWorldTrees({
    quality: options.quality,
    visualSeed: options.visualSeed,
    terrainHeightAt,
    pointIsClear,
  });
  const resourcePlacements = planInnerKeepOuterWorldResources({
    quality: options.quality,
    visualSeed: options.visualSeed,
    terrainHeightAt,
  });
  const wildlifePlacements = options.wildlifeMode === 'none'
    ? Object.freeze([])
    : planInnerKeepOuterWorldWildlife({
      quality: options.quality,
      visualSeed: options.visualSeed,
      terrainHeightAt,
      pointIsClear,
    });
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const exactTreeGroups = new Map<string, THREE.Group>();
  const exactResourceGroups = new Map<string, THREE.Group>();
  const fallbackResourceGroups = new Map<string, THREE.Group>();
  const treeLeases = new Map<string, HegemonyTreePrefabLease>();
  const expeditionLeases = new Map<string, HegemonyExpeditionPrefabLease>();
  const exactTreeSpecies = new Set<string>();
  const exactResourceFamilies = new Set<string>();
  const failedResourceFamilies = new Set<string>();
  const failures: InnerKeepOuterWorldFailure[] = [];
  const internalAbortController = new AbortController();
  let disposed = false;
  let aborted = false;
  let reducedMotion = options.reducedMotion;
  let wildlifeVisible = options.wildlifeMode !== 'none';
  let pendingAssetLoadCount = 0;
  let wagonExact = false;
  let wagonMixer: THREE.AnimationMixer | null = null;
  let wagonModel: THREE.Group | null = null;
  let lastElapsedSeconds = 0;
  let telemetry!: InnerKeepOuterWorldTelemetry;
  const assetStates: MutableAssetStates = {
    trees: 'fallback',
    resources: 'fallback',
    wagon: 'fallback',
  };

  const fallbackTrees = createFallbackTrees(treePlacements.length, geometries, materials);
  applyFallbackTreePlacements(fallbackTrees, treePlacements);
  fallbackLayer.add(fallbackTrees.group);
  treePlacements.forEach((placement) => {
    const marker = new THREE.Group();
    marker.name = `inner-keep-outer-tree-contact:${placement.instanceIndex}`;
    marker.position.set(...placement.positionMeters);
    marker.userData.innerKeepOuterWorldSpeciesId = placement.speciesId;
    marker.userData.innerKeepOuterWorldGroundContact = true;
    fallbackLayer.add(marker);
  });

  const resourcePlacementsByKind = new Map<string, InnerKeepOuterWorldResourcePlacement[]>();
  resourcePlacements.forEach((placement) => {
    const family = normalizedResourceFamily(placement.resourceKind);
    const kind = family?.kind ?? placement.resourceKind;
    const familyPlacements = resourcePlacementsByKind.get(kind) ?? [];
    familyPlacements.push(placement);
    resourcePlacementsByKind.set(kind, familyPlacements);
    const marker = new THREE.Group();
    marker.name = `inner-keep-outer-resource-contact:${placement.instanceIndex}`;
    marker.position.set(...placement.positionMeters);
    marker.userData.innerKeepOuterWorldResourceKind = kind;
    marker.userData.innerKeepOuterWorldVisualSiteKey = placement.visualSiteKey;
    marker.userData.innerKeepOuterWorldGroundContact = true;
    fallbackLayer.add(marker);
  });
  resourcePlacementsByKind.forEach((placements, kind) => {
    const fallback = createFallbackResourceFamily(kind, placements, geometries, materials);
    fallbackResourceGroups.set(kind, fallback);
    fallbackLayer.add(fallback);
  });

  const rabbits = createRabbitBatches(wildlifePlacements.length, geometries, materials);
  applyRabbitPlacements(
    rabbits,
    wildlifePlacements,
    0,
    !reducedMotion,
    terrainHeightAt,
    pointIsClear,
  );
  rabbits.group.visible = wildlifeVisible;
  fallbackLayer.add(rabbits.group);

  const wagonWrapper = new THREE.Group();
  wagonWrapper.name = 'inner-keep-outer-supply-wagon';
  wagonWrapper.userData.innerKeepOuterWorldGroundContact = true;
  const fallbackWagon = createFallbackWagon(geometries, materials);
  wagonWrapper.add(fallbackWagon);
  fallbackLayer.add(wagonWrapper);

  const refreshFallbackTrees = () => {
    applyFallbackTreePlacements(
      fallbackTrees,
      treePlacements.filter(({ speciesId }) => !exactTreeSpecies.has(speciesId)),
    );
  };

  const deriveStatus = (): OuterWorldStatus => {
    if (disposed) return 'disposed';
    if (aborted) return 'aborted';
    if (pendingAssetLoadCount > 0) return 'loading';
    const hasFailure = failures.length > 0;
    const hasExact = exactTreeSpecies.size > 0 || exactResourceFamilies.size > 0 || wagonExact;
    if (hasFailure && hasExact) return 'partial';
    if (hasFailure || !hasExact) return 'fallback';
    return 'ready';
  };

  const refreshTelemetry = () => {
    const exactTreeCount = treePlacements.filter(({ speciesId }) => (
      exactTreeSpecies.has(speciesId)
    )).length;
    const exactResourceCount = [...resourcePlacementsByKind.entries()]
      .filter(([kind]) => exactResourceFamilies.has(kind))
      .reduce((count, [, placements]) => count + placements.length, 0);
    let treeBatchDrawCallCount = 0;
    exactTreeGroups.forEach((treeGroup) => {
      treeGroup.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) treeBatchDrawCallCount += 1;
      });
    });
    if (exactTreeCount < treePlacements.length) treeBatchDrawCallCount += 2;
    const proceduralWildlifeCount = wildlifeVisible ? wildlifePlacements.length : 0;
    telemetry = Object.freeze({
      status: deriveStatus(),
      treeAssetState: assetStates.trees,
      resourceAssetState: assetStates.resources,
      supplyWagonAssetState: assetStates.wagon,
      treeCount: treePlacements.length,
      exactTreeCount,
      fallbackTreeCount: treePlacements.length - exactTreeCount,
      treeSpeciesCount: new Set(treePlacements.map(({ speciesId }) => speciesId)).size,
      exactTreeSpeciesCount: exactTreeSpecies.size,
      treeBatchDrawCallCount,
      resourceCount: resourcePlacements.length,
      exactResourceCount,
      fallbackResourceCount: resourcePlacements.length - exactResourceCount,
      resourceFamilyCount: resourcePlacementsByKind.size,
      exactResourceFamilyCount: exactResourceFamilies.size,
      failedResourceFamilyCount: failedResourceFamilies.size,
      wildlifeCount: proceduralWildlifeCount,
      proceduralWildlifeCount,
      supplyWagonCount: 1,
      exactSupplyWagonCount: wagonExact ? 1 : 0,
      fallbackSupplyWagonCount: wagonExact ? 0 : 1,
      groundedTreeCount: treePlacements.length,
      groundedResourceCount: resourcePlacements.length,
      groundedWildlifeCount: proceduralWildlifeCount,
      groundedSupplyWagonCount: 1,
      groundContactCount: treePlacements.length + resourcePlacements.length
        + proceduralWildlifeCount + 1,
      pendingAssetLoadCount,
      exactCoreBundleRequired: false,
      coreBundleDependency: 'none',
      failures: Object.freeze([...failures]),
    });
    options.onTelemetryChange?.(telemetry);
  };

  const notifyPresentationChanged = () => {
    if (disposed) return;
    refreshTelemetry();
    options.requestRender?.();
  };

  const recordFailure = (
    scope: OuterWorldFailureScope,
    assetId: string,
    error: unknown,
  ) => {
    if (aborted || disposed || isAbortError(error)) return;
    failures.push(Object.freeze({ scope, assetId, message: errorMessage(error) }));
  };

  const finishLoad = () => {
    pendingAssetLoadCount = Math.max(0, pendingAssetLoadCount - 1);
    notifyPresentationChanged();
  };

  const exactAssetsEnabled = options.loadExactAssets !== false;
  const treeSpeciesIds = [...new Set(treePlacements.map(({ speciesId }) => speciesId))];
  const acquireTree = options.acquireTreePrefab ?? acquireHegemonyTreePrefab;
  const acquireExpedition = options.acquireExpeditionPrefab ?? acquireHegemonyExpeditionPrefab;
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
  // Even the High overview is wide enough that Balanced outer assets preserve
  // visible character while reserving the detail budget for the compound.
  const lod: HegemonyTreeLod = options.quality === 'reduced' ? 'compact' : 'balanced';
  const expeditionLod: HegemonyExpeditionLod = lod;
  const loadTasks: Promise<void>[] = [];

  if (exactAssetsEnabled && treeSpeciesIds.length > 0) {
    assetStates.trees = 'loading';
    treeSpeciesIds.forEach((speciesId) => {
      const asset = HEGEMONY_TREE_RUNTIME_ASSET_BY_ID[speciesId];
      pendingAssetLoadCount += 1;
      const task = (asset
        ? acquireTree({
          asset,
          lod,
          baseUrl,
          signal: internalAbortController.signal,
        })
        : Promise.reject(new Error(`Unknown exact tree asset ${speciesId}.`)))
        .then((lease) => {
          if (disposed || aborted) {
            lease.release();
            return;
          }
          const placements = treePlacements.filter((placement) => (
            placement.speciesId === speciesId
          ));
          let exactBatch: THREE.Group;
          try {
            exactBatch = createExactTreeBatch(lease.prefab, placements);
          } catch (error) {
            lease.release();
            throw error;
          }
          treeLeases.set(speciesId, lease);
          exactTreeGroups.set(speciesId, exactBatch);
          exactTreeSpecies.add(speciesId);
          exactLayer.add(exactBatch);
          refreshFallbackTrees();
        })
        .catch((error: unknown) => recordFailure('tree', speciesId, error))
        .finally(finishLoad);
      loadTasks.push(task);
    });
  } else {
    assetStates.trees = treePlacements.length > 0 ? 'fallback' : 'disabled';
  }

  if (exactAssetsEnabled && resourcePlacementsByKind.size > 0) {
    assetStates.resources = 'loading';
    resourcePlacementsByKind.forEach((placements, kind) => {
      const family = normalizedResourceFamily(kind);
      pendingAssetLoadCount += 1;
      const task = (family
        ? acquireExpedition({
          label: `Inner Keep outer ${family.kind} presentation ${expeditionLod}`,
          asset: family.asset[expeditionLod],
          materialRole: 'gathering-node',
          baseUrl,
          targetFootprintDiameter: placements[0]?.targetFootprintDiameter ?? 3,
          dynamicShadows: false,
          maxAnisotropy: Math.max(1, Math.trunc(options.maxAnisotropy ?? 1)),
          signal: internalAbortController.signal,
        })
        : Promise.reject(new Error(`Unknown scenic resource family ${kind}.`)))
        .then((lease) => {
          if (disposed || aborted) {
            lease.release();
            return;
          }
          let exactBatch: THREE.Group;
          try {
            exactBatch = createExactExpeditionBatch(kind, lease.model, placements);
          } catch (error) {
            lease.release();
            throw error;
          }
          expeditionLeases.set(`resource:${kind}`, lease);
          exactResourceGroups.set(kind, exactBatch);
          exactResourceFamilies.add(kind);
          fallbackResourceGroups.get(kind)!.visible = false;
          exactLayer.add(exactBatch);
        })
        .catch((error: unknown) => {
          failedResourceFamilies.add(kind);
          recordFailure('resource', kind, error);
        })
        .finally(finishLoad);
      loadTasks.push(task);
    });
  } else {
    assetStates.resources = resourcePlacements.length > 0 ? 'fallback' : 'disabled';
  }

  if (exactAssetsEnabled && routePoints().length > 1) {
    assetStates.wagon = 'loading';
    pendingAssetLoadCount += 1;
    const task = acquireExpedition({
      label: `Inner Keep outer supply wagon ${expeditionLod}`,
      asset: HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS[expeditionLod],
      materialRole: 'wagon',
      baseUrl,
      targetFootprintDiameter: SUPPLY_WAGON_TARGET_FOOTPRINT_METERS,
      dynamicShadows: false,
      maxAnisotropy: Math.max(1, Math.trunc(options.maxAnisotropy ?? 1)),
      signal: internalAbortController.signal,
    }).then((lease) => {
      if (disposed || aborted) {
        lease.release();
        return;
      }
      let exactModel: THREE.Group | null = null;
      let nextMixer: THREE.AnimationMixer | null = null;
      try {
        exactModel = cloneSkinned(lease.model.root) as THREE.Group;
        exactModel.name = 'inner-keep-outer-exact-supply-wagon-model';
        disableAuthorityAndPicking(exactModel);
        if (lease.model.clips.length > 0 && !reducedMotion) {
          nextMixer = new THREE.AnimationMixer(exactModel);
          lease.model.clips.forEach((clip) => nextMixer!.clipAction(clip).play());
        }
        wagonWrapper.remove(fallbackWagon);
        wagonWrapper.add(exactModel);
      } catch (error) {
        nextMixer?.stopAllAction();
        if (nextMixer && exactModel) nextMixer.uncacheRoot(exactModel);
        exactModel?.removeFromParent();
        if (fallbackWagon.parent !== wagonWrapper) wagonWrapper.add(fallbackWagon);
        lease.release();
        throw error;
      }
      wagonModel = exactModel;
      wagonMixer = nextMixer;
      wagonExact = true;
      expeditionLeases.set('supply-wagon', lease);
    }).catch((error: unknown) => recordFailure('supply-wagon', 'supply-wagon', error))
      .finally(finishLoad);
    loadTasks.push(task);
  } else {
    assetStates.wagon = routePoints().length > 1 ? 'fallback' : 'disabled';
  }

  const finalizeAssetStates = () => {
    if (assetStates.trees === 'loading') {
      assetStates.trees = exactTreeSpecies.size === treeSpeciesIds.length
        ? 'exact'
        : exactTreeSpecies.size > 0 ? 'partial' : 'fallback';
    }
    if (assetStates.resources === 'loading') {
      assetStates.resources = exactResourceFamilies.size === resourcePlacementsByKind.size
        ? 'exact'
        : exactResourceFamilies.size > 0 ? 'partial' : 'fallback';
    }
    if (assetStates.wagon === 'loading') assetStates.wagon = wagonExact ? 'exact' : 'fallback';
    notifyPresentationChanged();
  };

  const handleExternalAbort = () => {
    if (disposed || aborted) return;
    aborted = true;
    internalAbortController.abort();
    notifyPresentationChanged();
  };
  options.signal?.addEventListener('abort', handleExternalAbort, { once: true });
  if (options.signal?.aborted) handleExternalAbort();

  const ready = Promise.allSettled(loadTasks).then(() => {
    finalizeAssetStates();
  });

  const updateWagon = (elapsedSeconds: number) => {
    const sample = sampleOpenRoutePingPong(reducedMotion ? 0 : elapsedSeconds);
    wagonWrapper.position.set(
      sample.x,
      safeTerrainHeight(terrainHeightAt, sample.x, sample.z),
      sample.z,
    );
    wagonWrapper.rotation.y = sample.yaw;
  };
  updateWagon(0);
  disableAuthorityAndPicking(group);
  refreshTelemetry();

  return Object.freeze({
    group,
    ready,
    update: (elapsedSeconds) => {
      if (disposed || aborted || !Number.isFinite(elapsedSeconds)) return false;
      const boundedElapsedSeconds = Math.max(0, elapsedSeconds);
      const animationActive = !reducedMotion && (
        wildlifeVisible && wildlifePlacements.length > 0 || routePoints().length > 1
      );
      if (!animationActive) return false;
      const deltaSeconds = Math.max(0, Math.min(0.1, boundedElapsedSeconds - lastElapsedSeconds));
      lastElapsedSeconds = boundedElapsedSeconds;
      if (wildlifeVisible) {
        applyRabbitPlacements(
          rabbits,
          wildlifePlacements,
          boundedElapsedSeconds,
          true,
          terrainHeightAt,
          pointIsClear,
        );
      }
      updateWagon(boundedElapsedSeconds);
      if (wagonMixer && deltaSeconds > 0) wagonMixer.update(deltaSeconds);
      return true;
    },
    isAnimationActive: () => !disposed && !aborted && !reducedMotion && (
      wildlifeVisible && wildlifePlacements.length > 0 || routePoints().length > 1
    ),
    setReducedMotion: (nextReducedMotion) => {
      if (disposed || reducedMotion === nextReducedMotion) return false;
      reducedMotion = nextReducedMotion;
      if (reducedMotion && wagonMixer) wagonMixer.timeScale = 0;
      if (!reducedMotion && wagonMixer) wagonMixer.timeScale = 1;
      applyRabbitPlacements(
        rabbits,
        wildlifePlacements,
        reducedMotion ? 0 : lastElapsedSeconds,
        !reducedMotion,
        terrainHeightAt,
        pointIsClear,
      );
      updateWagon(reducedMotion ? 0 : lastElapsedSeconds);
      options.requestRender?.();
      return true;
    },
    setProceduralWildlifeVisible: (visible) => {
      if (disposed || wildlifeVisible === visible || options.wildlifeMode === 'none') return false;
      wildlifeVisible = visible;
      rabbits.group.visible = visible;
      notifyPresentationChanged();
      return true;
    },
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      internalAbortController.abort();
      options.signal?.removeEventListener('abort', handleExternalAbort);
      wagonMixer?.stopAllAction();
      if (wagonMixer && wagonModel) wagonMixer.uncacheRoot(wagonModel);
      wagonMixer = null;
      wagonModel = null;
      exactTreeGroups.clear();
      exactResourceGroups.clear();
      treeLeases.forEach((lease) => lease.release());
      expeditionLeases.forEach((lease) => lease.release());
      treeLeases.clear();
      expeditionLeases.clear();
      disposeInstancedMeshBuffers(group);
      group.removeFromParent();
      group.clear();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      geometries.clear();
      materials.clear();
      refreshTelemetry();
    },
  });
}
