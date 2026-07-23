import * as THREE from 'three';

import type { RealmForestBiomeQuality, RealmForestSpecies, RealmForestTreePoint } from '../../game/map/realmForestBiomes';
import {
  generateRealmForestCellEcology,
  REALM_FOREST_ECOLOGY_MAX_CANDIDATES_PER_CELL,
  selectRealmForestEcologySpeciesPalette,
  type RealmForestCellEcology,
  type RealmForestEcologyCandidate,
  type RealmForestEcologyHabitat
} from '../../game/map/realmForestEcology';
import { hexKey, type HexWorldPosition } from '../../game/map/hexCoordinates';
import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';
import type { RealmTerrainMap, TerrainCell } from '../../game/map/terrainTypes';
import type { TerrainStructurePlacement } from '../../game/map/terrainPlacements';
import type { RealmVegetationField } from '../../game/map/realmVegetationField';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import {
  HEGEMONY_TREE_TARGET_VISUAL_HEIGHT,
  HEGEMONY_TREE_RUNTIME_ASSET_BY_ID,
  type HegemonyTreeLod,
  type HegemonyTreeRuntimeAsset
} from './hegemonyTreeRuntimeAssets';
import {
  acquireHegemonyTreePrefab,
  type HegemonyTreePrefabLease,
  type HegemonyTreePrefab
} from './loadHegemonyTreeAssets';
import type { RealmForestPrefabAcquirer } from './realmForestLayer';
import {
  createRealmForestCellCache,
  materializeRealmForestActiveWindow,
  REALM_FOREST_ACTIVE_WINDOW_PLANS,
  resolveRealmForestWindowDescriptor,
  shouldMaterializeRealmForestWindow,
  type RealmForestActiveWindow,
  type RealmForestCameraMode,
  type RealmForestViewportCoverage
} from './realmForestActiveWindow';
import type { RealmQualitySpec } from './realmQuality';

export const REALM_DECORATIVE_FOREST_RENDER_BUDGETS: Readonly<Record<
  RealmForestBiomeQuality,
  Readonly<{ instances: number; triangles: number; drawCalls: number }>
>> = Object.freeze({
  high: Object.freeze({ instances: 1_200, triangles: 320_000, drawCalls: 5 }),
  balanced: Object.freeze({ instances: 600, triangles: 160_000, drawCalls: 5 }),
  reduced: Object.freeze({ instances: 180, triangles: 45_000, drawCalls: 5 })
});
const REALM_FOREST_STABLE_BUDGET_UTILIZATION = 0.84;

export type RealmDecorativeForestTelemetry = Readonly<{
  canonicalTreeCount: number;
  activeCandidateCount: number;
  activeInstanceCount: number;
  activeCellCount: number;
  cacheEntries: number;
  cacheLimit: number;
  cacheHighWaterMark: number;
  clusterCount: number;
  instancesByHabitat: Readonly<Record<RealmForestEcologyHabitat, number>>;
  instancesBySpecies: Readonly<Record<string, number>>;
  instancesByLod: Readonly<Record<HegemonyTreeLod, number>>;
  triangleCount: number;
  drawCalls: number;
  repackCount: number;
  lastRepackMilliseconds: number;
  modelReady: boolean;
  usingFallback: boolean;
  overviewHidden: boolean;
  reveal: number;
}>;

export type CreateRealmDecorativeForestLayerOptions = Readonly<{
  map: RealmTerrainMap;
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>;
  vegetationField: RealmVegetationField;
  playableKeys: ReadonlySet<string>;
  species: readonly RealmForestSpecies[];
  canonicalTrees: readonly RealmForestTreePoint[];
  terrainPlacements: readonly TerrainStructurePlacement[];
  quality: RealmQualitySpec;
  baseUrl: string;
  hexSize?: number;
  isWorldExcluded?: (world: HexWorldPosition) => boolean;
  isCoordPassable?: (coord: { q: number; r: number }) => boolean;
  onActivePointsChange?: (points: readonly RealmForestEcologyCandidate[]) => void;
  onTelemetryChange?: (telemetry: RealmDecorativeForestTelemetry) => void;
  onModelReady?: () => void;
  acquirePrefab?: RealmForestPrefabAcquirer;
}>;

export type RealmDecorativeForestLayer = Readonly<{
  group: THREE.Group;
  updateView: (
    focus: HexWorldPosition,
    mode: RealmForestCameraMode,
    viewportCoverage: RealmForestViewportCoverage
  ) => boolean;
  getTelemetry: () => RealmDecorativeForestTelemetry;
  dispose: () => void;
}>;

export type RealmDecorativeForestCandidate =
  RealmForestEcologyCandidate & Readonly<{ edgeFade: number }>;

function emptyHabitatCounts(): Record<RealmForestEcologyHabitat, number> {
  return { grove: 0, forest: 0, fringe: 0 };
}

function lodForQuality(quality: RealmQualitySpec): HegemonyTreeLod {
  return quality.id === 'high' ? 'high' : quality.id === 'balanced' ? 'balanced' : 'compact';
}

function createFallback(
  points: readonly RealmDecorativeForestCandidate[],
  map: RealmTerrainMap,
  placements: readonly TerrainStructurePlacement[],
  hexSize: number
) {
  const geometry = new THREE.ConeGeometry(
    0.13,
    HEGEMONY_TREE_TARGET_VISUAL_HEIGHT,
    6,
    1
  );
  geometry.translate(0, HEGEMONY_TREE_TARGET_VISUAL_HEIGHT * 0.5, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#3f7546', roughness: 0.94, metalness: 0, vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, points.length));
  mesh.name = 'realm-hegemony-forest-decorative-ecology-fallback';
  mesh.count = points.length;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const verticalAxis = new THREE.Vector3(0, 1, 0);
  points.forEach((point, index) => {
    position.set(point.world.x, terrainHeightAtWorld(map, point.world, hexSize, placements) + 0.002, point.world.z);
    rotation.setFromAxisAngle(verticalAxis, point.rotation);
    const edgeScale = 0.92 + point.edgeFade * 0.08;
    scale.set(point.scale * edgeScale, point.scale * edgeScale, point.scale * edgeScale);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    color.set(point.habitat === 'grove' ? '#477d43' : point.habitat === 'forest' ? '#416f3e' : '#4f8248');
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function disposeFallback(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.removeFromParent();
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => material.dispose());
}

function emptyTelemetry(canonicalTreeCount: number, plan: RealmForestBiomeQuality, cacheEntries = 0): RealmDecorativeForestTelemetry {
  const cacheLimit = REALM_FOREST_ACTIVE_WINDOW_PLANS[plan].cacheLimit;
  return Object.freeze({
    canonicalTreeCount,
    activeCandidateCount: 0,
    activeInstanceCount: 0,
    activeCellCount: 0,
    cacheEntries,
    cacheLimit,
    cacheHighWaterMark: cacheEntries,
    clusterCount: 0,
    instancesByHabitat: Object.freeze(emptyHabitatCounts()),
    instancesBySpecies: Object.freeze({}),
    instancesByLod: Object.freeze({ high: 0, balanced: 0, compact: 0 }),
    triangleCount: 0,
    drawCalls: 0,
    repackCount: 0,
    lastRepackMilliseconds: 0,
    modelReady: false,
    usingFallback: false,
    overviewHidden: true,
    reveal: 0
  });
}

export type RealmDecorativeForestSelection = Readonly<{
  points: readonly RealmDecorativeForestCandidate[];
  triangleCount: number;
}>;

type ForestOccupancyCircle = Readonly<{ x: number; z: number; radius: number }>;

function createForestOccupancyIndex(bucketSizeInput: number) {
  const bucketSize = Math.max(0.25, bucketSizeInput);
  const buckets = new Map<string, ForestOccupancyCircle[]>();
  let maximumRadius = 0;
  const bucketKey = (x: number, z: number) =>
    `${Math.floor(x / bucketSize)},${Math.floor(z / bucketSize)}`;
  const add = (circle: ForestOccupancyCircle) => {
    const key = bucketKey(circle.x, circle.z);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(circle);
    else buckets.set(key, [circle]);
    maximumRadius = Math.max(maximumRadius, circle.radius);
  };
  const overlaps = (circle: ForestOccupancyCircle) => {
    const centerX = Math.floor(circle.x / bucketSize);
    const centerZ = Math.floor(circle.z / bucketSize);
    const reach = Math.max(1, Math.ceil((circle.radius + maximumRadius) / bucketSize));
    for (let x = centerX - reach; x <= centerX + reach; x += 1) {
      for (let z = centerZ - reach; z <= centerZ + reach; z += 1) {
        const bucket = buckets.get(`${x},${z}`);
        if (bucket?.some((other) => (
          Math.hypot(other.x - circle.x, other.z - circle.z) < other.radius + circle.radius
        ))) return true;
      }
    }
    return false;
  };
  return Object.freeze({ add, overlaps });
}

/**
 * Stable rank thresholds do the ordinary thinning before the hard safety cap.
 * A camera shift therefore changes boundary cells rather than globally
 * reshuffling the retained interior whenever the triangle ceiling is near.
 */
export function selectRealmDecorativeForestCandidates(
  candidates: readonly RealmDecorativeForestCandidate[],
  canonicalTrees: readonly RealmForestTreePoint[],
  quality: RealmForestBiomeQuality,
  activeRadius: number,
  revealInput: number,
  hexSize = 1
): RealmDecorativeForestSelection {
  const budget = REALM_DECORATIVE_FOREST_RENDER_BUDGETS[quality];
  const reveal = Math.min(1, Math.max(0, revealInput));
  const radius = Math.max(0, Math.trunc(activeRadius));
  const maximumCellCount = 1 + 3 * radius * (radius + 1);
  const maximumCandidateSlots = Math.max(
    1,
    maximumCellCount * REALM_FOREST_ECOLOGY_MAX_CANDIDATES_PER_CELL[quality]
  );
  const stableInstanceProbability = Math.min(
    1,
    budget.instances * REALM_FOREST_STABLE_BUDGET_UTILIZATION / maximumCandidateSlots
  );
  const stableTriangleAllowance = budget.triangles
    * REALM_FOREST_STABLE_BUDGET_UTILIZATION
    / maximumCandidateSlots;
  const eligible = candidates.filter((candidate) => {
    const triangleProbability = stableTriangleAllowance
      / Math.max(1, candidate.estimatedTriangles);
    const stableProbability = Math.min(1, stableInstanceProbability, triangleProbability);
    const presentationProbability = stableProbability
      * reveal
      * Math.min(1, Math.max(0, candidate.edgeFade));
    return presentationProbability > 0 && candidate.rank >= 1 - presentationProbability;
  }).sort((left, right) => right.rank - left.rank
    || left.cellKey.localeCompare(right.cellKey)
    || left.speciesId.localeCompare(right.speciesId));
  const occupancy = createForestOccupancyIndex(Math.max(0.25, hexSize * 0.5));
  canonicalTrees.forEach((tree) => occupancy.add({
    x: tree.world.x,
    z: tree.world.z,
    radius: Math.max(0.11, tree.footprintDiameter * tree.scale * 0.42)
  }));
  const selected: RealmDecorativeForestCandidate[] = [];
  let triangleCount = 0;
  eligible.forEach((candidate) => {
    if (
      selected.length >= budget.instances
      || triangleCount + candidate.estimatedTriangles > budget.triangles
    ) return;
    const circle = {
      x: candidate.world.x,
      z: candidate.world.z,
      radius: Math.max(0.11, candidate.footprintDiameter * candidate.scale * 0.42)
    };
    if (occupancy.overlaps(circle)) return;
    occupancy.add(circle);
    selected.push(candidate);
    triangleCount += candidate.estimatedTriangles;
  });
  return Object.freeze({
    points: Object.freeze(selected),
    triangleCount
  });
}

export function createRealmDecorativeForestLayer(options: CreateRealmDecorativeForestLayerOptions): RealmDecorativeForestLayer {
  const group = new THREE.Group();
  group.name = 'realm-hegemony-forest-decorative-ecology';
  const quality = options.quality.id as RealmForestBiomeQuality;
  const budget = REALM_DECORATIVE_FOREST_RENDER_BUDGETS[quality];
  const species = selectRealmForestEcologySpeciesPalette(
    options.species,
    options.map.worldSeed,
    budget.drawCalls
  );
  const plan = REALM_FOREST_ACTIVE_WINDOW_PLANS[quality];
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0 ? options.hexSize! : 1;
  const cache = createRealmForestCellCache<RealmForestCellEcology>(plan.cacheLimit);
  const loadAbortController = new AbortController();
  const lod = lodForQuality(options.quality);
  const acquirePrefab = options.acquirePrefab ?? ((asset, requestedLod, baseUrl, signal) => acquireHegemonyTreePrefab({ asset, lod: requestedLod, baseUrl, signal }));
  let currentWindow: RealmForestActiveWindow | null = null;
  let fallback: THREE.InstancedMesh | null = null;
  let modelMeshes: THREE.InstancedMesh[] = [];
  const retainedLeases = new Map<string, HegemonyTreePrefabLease>();
  const loadingAssetIds = new Set<string>();
  const failedAssetIds = new Set<string>();
  let activePoints: readonly RealmDecorativeForestCandidate[] = Object.freeze([]);
  let modelReady = false;
  let disposed = false;
  let cacheHighWaterMark = 0;
  let telemetry = emptyTelemetry(options.canonicalTrees.length, quality);

  const releaseLeases = (values: readonly HegemonyTreePrefabLease[]) => values.forEach((lease) => { try { lease.release(); } catch { /* best effort */ } });
  const disposeModelMeshes = () => {
    modelMeshes.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.dispose();
    });
    modelMeshes = [];
  };
  const releaseRetainedLeases = () => {
    releaseLeases([...retainedLeases.values()]);
    retainedLeases.clear();
  };
  const replaceFallback = (points: readonly RealmDecorativeForestCandidate[]) => {
    disposeFallback(fallback);
    fallback = points.length > 0
      ? createFallback(points, options.map, options.terrainPlacements, hexSize)
      : null;
    if (fallback) group.add(fallback);
  };
  const publishTelemetry = () => {
    options.onTelemetryChange?.(telemetry);
  };
  const cellDataFor = (cell: TerrainCell) => {
    const key = hexKey(cell.coord);
    const cached = cache.get(key);
    if (cached) return cached;
    const generated = generateRealmForestCellEcology(cell, {
      worldSeed: options.map.worldSeed,
      quality,
      species,
      vegetation: options.vegetationField.sampleCell(cell.coord),
      terrainKind: options.terrainKindsByKey.get(key) ?? 'meadow',
      playable: options.playableKeys.has(key),
      hexSize,
      placements: options.terrainPlacements,
      authoritativeTrees: options.canonicalTrees,
      isWorldExcluded: options.isWorldExcluded,
      isCoordPassable: options.isCoordPassable
    });
    cache.set(key, generated);
    cacheHighWaterMark = Math.max(cacheHighWaterMark, cache.size);
    return generated;
  };

  const buildModelMeshes = (
    points: readonly RealmDecorativeForestCandidate[]
  ) => {
    const prefabs = new Map(
      [...retainedLeases].map(([assetId, lease]) => [assetId, lease.prefab] as const)
    );
    const availableSpecies = [...new Set(points.map((point) => point.speciesId))]
      .filter((assetId) => prefabs.has(assetId))
      .sort();
    const selectedSpeciesCount = new Set(points.map((point) => point.speciesId)).size;
    if (
      availableSpecies.length === 0
      || availableSpecies.length !== selectedSpeciesCount
    ) return false;
    const totalPrimitiveCount = availableSpecies.reduce(
      (total, assetId) => total + prefabs.get(assetId)!.primitives.length,
      0
    );
    if (totalPrimitiveCount > budget.drawCalls) return false;
    const modelSpecies = new Set(availableSpecies);
    const buckets = new Map<string, {
      prefab: HegemonyTreePrefab;
      primitiveIndex: number;
      points: RealmDecorativeForestCandidate[];
    }>();
    points.forEach((point) => {
      if (!modelSpecies.has(point.speciesId)) return;
      const prefab = prefabs.get(point.speciesId)!;
      prefab.primitives.forEach((_primitive, primitiveIndex) => {
        const key = `${point.speciesId}:${primitiveIndex}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.points.push(point);
        else buckets.set(key, { prefab, primitiveIndex, points: [point] });
      });
    });
    const nextMeshes: THREE.InstancedMesh[] = [];
    const matrix = new THREE.Matrix4();
    const localMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const verticalAxis = new THREE.Vector3(0, 1, 0);
    try {
      buckets.forEach(({ prefab, primitiveIndex, points: bucketPoints }) => {
        const primitive = prefab.primitives[primitiveIndex]!;
        localMatrix.fromArray(primitive.localMatrixElements);
        const mesh = new THREE.InstancedMesh(
          primitive.geometry,
          primitive.material,
          bucketPoints.length
        );
        mesh.name = `realm-hegemony-forest-decorative-${prefab.assetId}-${primitiveIndex}`;
        mesh.count = bucketPoints.length;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        bucketPoints.forEach((point, index) => {
          position.set(
            point.world.x,
            terrainHeightAtWorld(
              options.map,
              point.world,
              hexSize,
              options.terrainPlacements
            ) + 0.002,
            point.world.z
          );
          rotation.setFromAxisAngle(verticalAxis, point.rotation);
          scale.setScalar(point.scale * (0.92 + point.edgeFade * 0.08));
          matrix.compose(position, rotation, scale).multiply(localMatrix);
          mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        nextMeshes.push(mesh);
      });
    } catch {
      nextMeshes.forEach((mesh) => mesh.dispose());
      return false;
    }
    disposeModelMeshes();
    replaceFallback(Object.freeze([]));
    nextMeshes.forEach((mesh) => group.add(mesh));
    modelMeshes = nextMeshes;
    modelReady = modelMeshes.length > 0;
    telemetry = Object.freeze({
      ...telemetry,
      modelReady,
      usingFallback: fallback !== null,
      drawCalls: modelMeshes.length + (fallback ? 1 : 0)
    });
    return modelReady;
  };

  const loadModels = (
    points: readonly RealmDecorativeForestCandidate[]
  ) => {
    const requestedAssetIds = [...new Set(points.map((point) => point.speciesId))]
      .filter((assetId) => (
        !retainedLeases.has(assetId)
        && !loadingAssetIds.has(assetId)
        && !failedAssetIds.has(assetId)
      ))
      .sort()
      .slice(0, budget.drawCalls);
    requestedAssetIds.forEach((assetId) => {
      const asset: HegemonyTreeRuntimeAsset | undefined =
        HEGEMONY_TREE_RUNTIME_ASSET_BY_ID[assetId];
      if (!asset) {
        failedAssetIds.add(assetId);
        return;
      }
      loadingAssetIds.add(assetId);
      void acquirePrefab(
        asset,
        lod,
        options.baseUrl,
        loadAbortController.signal
      ).then((lease) => {
        loadingAssetIds.delete(assetId);
        if (disposed) {
          releaseLeases([lease]);
          return;
        }
        const existing = retainedLeases.get(assetId);
        if (existing) {
          releaseLeases([lease]);
          return;
        }
        retainedLeases.set(assetId, lease);
        if (
          group.visible
          && activePoints.length > 0
          && !modelReady
          && buildModelMeshes(activePoints)
        ) {
          publishTelemetry();
          options.onModelReady?.();
        }
      }).catch(() => {
        loadingAssetIds.delete(assetId);
        if (!disposed && !loadAbortController.signal.aborted) {
          failedAssetIds.add(assetId);
        }
      });
    });
  };

  const repack = (window: RealmForestActiveWindow) => {
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    const finishRepackTelemetry = () => {
      telemetry = Object.freeze({
        ...telemetry,
        lastRepackMilliseconds:
          (typeof performance !== 'undefined' ? performance.now() : 0) - started
      });
      publishTelemetry();
    };
    if (window.overviewHidden || !window.anchor) {
      group.visible = false;
      activePoints = Object.freeze([]);
      replaceFallback(Object.freeze([]));
      disposeModelMeshes();
      modelReady = false;
      options.onActivePointsChange?.(Object.freeze([]));
      telemetry = Object.freeze({
        ...emptyTelemetry(options.canonicalTrees.length, quality, cache.size),
        cacheHighWaterMark,
        repackCount: telemetry.repackCount + 1,
        lastRepackMilliseconds: 0,
        overviewHidden: true
      });
      finishRepackTelemetry();
      return;
    }
    group.visible = true;
    const all: RealmDecorativeForestCandidate[] = [];
    window.cells.forEach(({ cell, edgeFade }) => {
      if (edgeFade <= 0) return;
      cellDataFor(cell).candidates.forEach((candidate) => {
        all.push(Object.freeze({ ...candidate, edgeFade }));
      });
    });
    const selection = selectRealmDecorativeForestCandidates(
      all,
      options.canonicalTrees,
      quality,
      plan.activeRadius,
      window.reveal,
      hexSize
    );
    const selected = selection.points;
    activePoints = selected;
    const byHabitat = emptyHabitatCounts();
    const bySpecies: Record<string, number> = {};
    selected.forEach((point) => {
      byHabitat[point.habitat] += 1;
      bySpecies[point.speciesId] = (bySpecies[point.speciesId] ?? 0) + 1;
    });
    options.onActivePointsChange?.(Object.freeze(selected));
    telemetry = Object.freeze({
      ...telemetry,
      activeCandidateCount: all.length,
      activeInstanceCount: selected.length,
      activeCellCount: window.cells.length,
      cacheEntries: cache.size,
      cacheLimit: cache.limit,
      cacheHighWaterMark,
      clusterCount: new Set(selected.map((point) => point.cellKey)).size,
      instancesByHabitat: Object.freeze(byHabitat),
      instancesBySpecies: Object.freeze(bySpecies),
      instancesByLod: Object.freeze({
        high: lod === 'high' ? selected.length : 0,
        balanced: lod === 'balanced' ? selected.length : 0,
        compact: lod === 'compact' ? selected.length : 0
      }),
      triangleCount: selection.triangleCount,
      drawCalls: 0,
      repackCount: telemetry.repackCount + 1,
      lastRepackMilliseconds: (typeof performance !== 'undefined' ? performance.now() : 0) - started,
      modelReady: false,
      usingFallback: false,
      overviewHidden: false,
      reveal: window.reveal
    });
    if (selected.length === 0) {
      replaceFallback(Object.freeze([]));
      disposeModelMeshes();
      modelReady = false;
      finishRepackTelemetry();
      return;
    }
    const builtFromRetainedModels = buildModelMeshes(selected);
    if (!builtFromRetainedModels) {
      disposeModelMeshes();
      replaceFallback(selected);
      modelReady = false;
      telemetry = Object.freeze({
        ...telemetry,
        drawCalls: 1,
        modelReady: false,
        usingFallback: true
      });
    }
    finishRepackTelemetry();
    loadModels(selected);
  };

  return Object.freeze({
    group,
    updateView: (focus, mode, viewportCoverage) => {
      if (disposed) return false;
      const descriptor = resolveRealmForestWindowDescriptor(
        focus,
        mode,
        plan,
        viewportCoverage,
        hexSize
      );
      const shouldMaterialize = shouldMaterializeRealmForestWindow(
        currentWindow,
        descriptor,
        plan
      );
      const revealChanged = currentWindow?.reveal !== descriptor.reveal;
      if (!shouldMaterialize && !revealChanged) return false;
      const next = shouldMaterialize
        ? materializeRealmForestActiveWindow(options.map, descriptor, plan)
        : Object.freeze({
          ...currentWindow!,
          mode: descriptor.mode,
          viewportRadiusCells: descriptor.viewportRadiusCells,
          reveal: descriptor.reveal,
          overviewHidden: descriptor.overviewHidden
        });
      currentWindow = next;
      repack(next);
      return true;
    },
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      loadAbortController.abort();
      loadingAssetIds.clear();
      cache.dispose();
      disposeFallback(fallback);
      fallback = null;
      disposeModelMeshes();
      releaseRetainedLeases();
      failedAssetIds.clear();
      activePoints = Object.freeze([]);
      group.visible = false;
      options.onActivePointsChange?.(Object.freeze([]));
    }
  });
}
