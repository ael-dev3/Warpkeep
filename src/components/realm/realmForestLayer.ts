import * as THREE from 'three';

import type { RealmForestBiomeData, RealmForestTreePoint } from '../../game/map/realmForestBiomes';
import {
  realmForestSilhouetteCoverageRatio,
  summarizeRealmForestStructure,
  type RealmForestStructureCounts
} from '../../game/map/realmForestEcology';
import { terrainHeightAtWorld } from '../../game/map/terrainHeight';
import type { TerrainStructurePlacement } from '../../game/map/terrainPlacements';
import type { RealmTerrainMap } from '../../game/map/terrainTypes';
import type { RealmNorthernSnowField } from '../../game/map/realmNorthernSnow';
import type { RealmSouthernDesertField } from '../../game/map/realmSouthernDesert';
import {
  HEGEMONY_TREE_TARGET_VISUAL_HEIGHT,
  HEGEMONY_TREE_RUNTIME_ASSET_BY_ID,
  type HegemonyTreeLod,
  type HegemonyTreeRuntimeAsset
} from './hegemonyTreeRuntimeAssets';
import {
  acquireHegemonyTreePrefab,
  type HegemonyTreePrefab,
  type HegemonyTreePrefabLease,
  type HegemonyTreePrefabPrimitive
} from './loadHegemonyTreeAssets';
import type { RealmQualitySpec } from './realmQuality';
import {
  createRealmProceduralForestFallbackGeometry,
  createRealmProceduralForestFallbackMaterial,
  applyRealmForestDrylandTint,
  applyRealmForestWinterTint,
  REALM_FOREST_CANOPY_MOTION_STATE,
  REALM_FOREST_DRYLAND_DUST_LINEAR,
  REALM_FOREST_SNOW_PEARL_LINEAR,
  REALM_PROCEDURAL_FOREST_FALLBACK_TYPE,
  realmForestAuthoredDryMix,
  realmForestAuthoredSnowMix,
  realmForestDrylandTintMix,
  realmForestFallbackInstanceColor,
  realmForestModelInstanceTint,
  realmForestWinterTintMix,
  sampleRealmForestSandCoverage,
  sampleRealmForestSnowCoverage,
  type RealmForestFallbackType,
  type RealmForestGroundingMode
} from './createRealmProceduralForestFallback';

const HEX_SIZE = 1;
const TREE_TERRAIN_LIFT = 0.002;
const FOREST_TINT_SNOW = 1;
const FOREST_TINT_DRY = 2;
/** A bounded parse/load pool prevents a High-quality world from spiking 22 GLBs at once. */
export const HEGEMONY_TREE_PREFAB_LOAD_CONCURRENCY = 4;

export type RealmForestLayerPresentationTelemetry = Readonly<{
  instanceCount: number;
  /** The forest is deliberately a single static draw call at every quality. */
  drawCalls: number;
  usingFallback: boolean;
  fallbackType: RealmForestFallbackType;
  contactShadowCount: number;
  groundingMode: RealmForestGroundingMode;
  canopyMotionState: typeof REALM_FOREST_CANOPY_MOTION_STATE;
  structureCellCounts: RealmForestStructureCounts;
  silhouetteCoverageRatio: number;
  /** Canonical selected-LOD total, independent of temporary fallback state. */
  canonicalTriangleCount: number;
  /** Actual currently attached fallback or authored-batch triangles. */
  triangleCount: number;
  /** Bounded aggregate only; no per-tree climate data leaves this layer. */
  snowTintedTreeCount: number;
  dryTintedTreeCount: number;
}>;

export type RealmForestLayer = Readonly<{
  group: THREE.Group;
  getPresentationTelemetry: () => RealmForestLayerPresentationTelemetry;
  dispose: () => void;
}>;

export type RealmForestPrefabAcquirer = (
  asset: HegemonyTreeRuntimeAsset,
  lod: HegemonyTreeLod,
  baseUrl: string,
  signal: AbortSignal
) => Promise<HegemonyTreePrefabLease>;

export type CreateRealmForestLayerOptions = Readonly<{
  data: RealmForestBiomeData;
  map: RealmTerrainMap;
  terrainPlacements: readonly TerrainStructurePlacement[];
  quality: RealmQualitySpec;
  baseUrl: string;
  /** Called after the local static GLB batch replaces the immediate fallback. */
  onModelReady?: () => void;
  /** Decorative outer-Realm infill always requests the compact reviewed LOD. */
  lod?: HegemonyTreeLod;
  /** Keeps authoritative and decorative batches distinct in scene inspection. */
  presentationName?: string;
  /** Internal test seam; production always uses the digest-pinned acquirer. */
  acquirePrefab?: RealmForestPrefabAcquirer;
  /** Immutable renderer-only climate sampled only during static batch builds. */
  northernSnow?: RealmNorthernSnowField;
  /** Immutable renderer-only climate sampled only during static batch builds. */
  southernDesert?: RealmSouthernDesertField;
}>;

type MutableTreeGeometry = {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  hasCompleteNormals: boolean;
};

function lodForQuality(quality: RealmQualitySpec): HegemonyTreeLod {
  if (quality.id === 'high') return 'high';
  if (quality.id === 'balanced') return 'balanced';
  return 'compact';
}

function materialColor(material: THREE.Material) {
  const candidate = material as THREE.Material & Readonly<{ color?: THREE.Color }>;
  return candidate.color ?? new THREE.Color(1, 1, 1);
}

type TreeBufferAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function component(attribute: TreeBufferAttribute, index: number, componentIndex: number) {
  if (componentIndex === 0) return attribute.getX(index);
  if (componentIndex === 1) return attribute.getY(index);
  return attribute.getZ(index);
}

/**
 * Copies immutable GLB primitive data into one per-scene mesh. We purposely do
 * not retain a source mesh in the live scene: all tree models remain static,
 * non-pickable, unshadowed presentation geometry and cost exactly one draw
 * call after their local, digest-pinned bytes have loaded.
 */
function appendPrimitive(
  output: MutableTreeGeometry,
  primitive: HegemonyTreePrefabPrimitive,
  instanceMatrix: THREE.Matrix4,
  habitat: RealmForestTreePoint['habitat'],
  snowCoverage: number,
  sandCoverage: number
) {
  const position = primitive.geometry.getAttribute('position');
  if (!position || position.count === 0) return 0;
  const normal = primitive.geometry.getAttribute('normal');
  const color = primitive.geometry.getAttribute('color');
  const normalAttribute = normal ?? undefined;
  const colorAttribute = color ?? undefined;
  const localMatrix = new THREE.Matrix4().fromArray(primitive.localMatrixElements);
  const transform = instanceMatrix.clone().multiply(localMatrix);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
  const sourceColor = materialColor(primitive.material);
  const habitatTint = new THREE.Color(realmForestModelInstanceTint(habitat));
  const positionVector = new THREE.Vector3();
  const normalVector = new THREE.Vector3();
  const vertexOffset = output.positions.length / 3;
  const groundY = instanceMatrix.elements[13] ?? 0;
  const dryMix = realmForestAuthoredDryMix(sandCoverage);
  let tintFlags = dryMix > 0 ? FOREST_TINT_DRY : 0;

  for (let index = 0; index < position.count; index += 1) {
    positionVector
      .set(component(position, index, 0), component(position, index, 1), component(position, index, 2))
      .applyMatrix4(transform);
    output.positions.push(positionVector.x, positionVector.y, positionVector.z);

    if (normalAttribute) {
      normalVector
        .set(
          component(normalAttribute, index, 0),
          component(normalAttribute, index, 1),
          component(normalAttribute, index, 2)
        )
        .applyMatrix3(normalMatrix)
        .normalize();
      output.normals.push(normalVector.x, normalVector.y, normalVector.z);
    } else {
      output.hasCompleteNormals = false;
      output.normals.push(0, 1, 0);
    }

    const red = colorAttribute ? component(colorAttribute, index, 0) : 1;
    const green = colorAttribute ? component(colorAttribute, index, 1) : 1;
    const blue = colorAttribute ? component(colorAttribute, index, 2) : 1;
    const baseBlend = THREE.MathUtils.smoothstep(
      Math.max(0, positionVector.y - groundY),
      0.025,
      0.16
    );
    const baseShade = THREE.MathUtils.lerp(0.74, 1, baseBlend);
    const baseRed = THREE.MathUtils.clamp(
      red * sourceColor.r * habitatTint.r * baseShade,
      0,
      1
    );
    const baseGreen = THREE.MathUtils.clamp(
      green * sourceColor.g * habitatTint.g * baseShade,
      0,
      1
    );
    const baseBlue = THREE.MathUtils.clamp(
      blue * sourceColor.b * habitatTint.b * baseShade,
      0,
      1
    );
    const snowMix = normalAttribute
      ? realmForestAuthoredSnowMix(snowCoverage, normalVector.y)
      : 0;
    if (snowMix > 0) tintFlags |= FOREST_TINT_SNOW;
    const dryRed = dryMix > 0
      ? THREE.MathUtils.lerp(
        baseRed,
        REALM_FOREST_DRYLAND_DUST_LINEAR.r,
        dryMix
      )
      : baseRed;
    const dryGreen = dryMix > 0
      ? THREE.MathUtils.lerp(
        baseGreen,
        REALM_FOREST_DRYLAND_DUST_LINEAR.g,
        dryMix
      )
      : baseGreen;
    const dryBlue = dryMix > 0
      ? THREE.MathUtils.lerp(
        baseBlue,
        REALM_FOREST_DRYLAND_DUST_LINEAR.b,
        dryMix
      )
      : baseBlue;
    output.colors.push(
      THREE.MathUtils.lerp(dryRed, REALM_FOREST_SNOW_PEARL_LINEAR.r, snowMix),
      THREE.MathUtils.lerp(dryGreen, REALM_FOREST_SNOW_PEARL_LINEAR.g, snowMix),
      THREE.MathUtils.lerp(dryBlue, REALM_FOREST_SNOW_PEARL_LINEAR.b, snowMix)
    );
  }

  const sourceIndex = primitive.geometry.getIndex();
  if (sourceIndex) {
    for (let index = 0; index < sourceIndex.count; index += 1) {
      output.indices.push(vertexOffset + sourceIndex.getX(index));
    }
    return tintFlags;
  }
  for (let index = 0; index < position.count; index += 1) output.indices.push(vertexOffset + index);
  return tintFlags;
}

function instanceMatrixForPoint(
  point: RealmForestTreePoint,
  map: RealmTerrainMap,
  terrainPlacements: readonly TerrainStructurePlacement[]
) {
  const position = new THREE.Vector3(
    point.world.x,
    terrainHeightAtWorld(map, point.world, HEX_SIZE, terrainPlacements) + TREE_TERRAIN_LIFT,
    point.world.z
  );
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), point.rotation);
  // `point.scale` is produced in the immutable catalog's [0.9, 1.1] range.
  // Do not add a second random or quality multiplier here.
  const scale = new THREE.Vector3(point.scale, point.scale, point.scale);
  return new THREE.Matrix4().compose(position, rotation, scale);
}

function createMergedTreeMesh(
  points: readonly RealmForestTreePoint[],
  prefabByAssetId: ReadonlyMap<string, HegemonyTreePrefab>,
  map: RealmTerrainMap,
  terrainPlacements: readonly TerrainStructurePlacement[],
  northernSnow: RealmNorthernSnowField | undefined,
  southernDesert: RealmSouthernDesertField | undefined
) {
  const source: MutableTreeGeometry = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    hasCompleteNormals: true
  };
  let snowTintedTreeCount = 0;
  let dryTintedTreeCount = 0;
  points.forEach((point) => {
    const prefab = prefabByAssetId.get(point.speciesId);
    if (!prefab) throw new Error('Missing loaded tree prefab for ' + point.speciesId + '.');
    const matrix = instanceMatrixForPoint(point, map, terrainPlacements);
    const snowCoverage = sampleRealmForestSnowCoverage(
      northernSnow,
      point.world
    );
    const sandCoverage = sampleRealmForestSandCoverage(
      southernDesert,
      point.world
    );
    let treeTintFlags = 0;
    prefab.primitives.forEach((primitive) => {
      treeTintFlags |= appendPrimitive(
        source,
        primitive,
        matrix,
        point.habitat,
        snowCoverage,
        sandCoverage
      );
    });
    if ((treeTintFlags & FOREST_TINT_SNOW) !== 0) snowTintedTreeCount += 1;
    if ((treeTintFlags & FOREST_TINT_DRY) !== 0) dryTintedTreeCount += 1;
  });
  if (source.positions.length === 0 || source.indices.length === 0) {
    throw new Error('Loaded Hegemony trees produced no renderable geometry.');
  }
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
    side: THREE.DoubleSide
  });
  try {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(source.colors, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(source.indices, 1));
    if (!source.hasCompleteNormals) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'realm-hegemony-tree-static-batch';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    return Object.freeze({
      mesh,
      triangleCount: source.indices.length / 3,
      snowTintedTreeCount,
      dryTintedTreeCount
    });
  } catch (error) {
    geometry.dispose();
    material.dispose();
    throw error;
  }
}

function createFallbackForestMesh(
  points: readonly RealmForestTreePoint[],
  map: RealmTerrainMap,
  terrainPlacements: readonly TerrainStructurePlacement[],
  northernSnow: RealmNorthernSnowField | undefined,
  southernDesert: RealmSouthernDesertField | undefined
) {
  const fallback = createRealmProceduralForestFallbackGeometry(
    HEGEMONY_TREE_TARGET_VISUAL_HEIGHT
  );
  const { geometry } = fallback;
  const material = createRealmProceduralForestFallbackMaterial();
  let mesh: THREE.InstancedMesh;
  try {
    mesh = new THREE.InstancedMesh(geometry, material, points.length);
  } catch (error) {
    geometry.dispose();
    material.dispose();
    throw error;
  }
  mesh.name = 'realm-hegemony-tree-static-fallback';
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  const color = new THREE.Color();
  let snowTintedTreeCount = 0;
  let dryTintedTreeCount = 0;
  points.forEach((point, index) => {
    mesh.setMatrixAt(index, instanceMatrixForPoint(point, map, terrainPlacements));
    color.set(realmForestFallbackInstanceColor(point.habitat));
    const snowCoverage = sampleRealmForestSnowCoverage(
      northernSnow,
      point.world
    );
    const sandCoverage = sampleRealmForestSandCoverage(
      southernDesert,
      point.world
    );
    if (realmForestWinterTintMix(snowCoverage) > 0) {
      snowTintedTreeCount += 1;
    }
    if (realmForestDrylandTintMix(sandCoverage) > 0) {
      dryTintedTreeCount += 1;
    }
    applyRealmForestDrylandTint(color, sandCoverage);
    applyRealmForestWinterTint(color, snowCoverage);
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return Object.freeze({
    mesh,
    triangleCount: fallback.triangleCount * points.length,
    snowTintedTreeCount,
    dryTintedTreeCount
  });
}

function disposeMesh(mesh: THREE.Mesh | THREE.InstancedMesh) {
  mesh.removeFromParent();
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => material.dispose());
}

async function acquireTreePrefabsStaged(
  assets: readonly HegemonyTreeRuntimeAsset[],
  lod: HegemonyTreeLod,
  baseUrl: string,
  signal: AbortSignal,
  acquirePrefab: RealmForestPrefabAcquirer
) {
  const leases: HegemonyTreePrefabLease[] = [];
  let nextAssetIndex = 0;
  let failed = false;
  const workerCount = Math.min(HEGEMONY_TREE_PREFAB_LOAD_CONCURRENCY, assets.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!signal.aborted && !failed) {
      const index = nextAssetIndex;
      nextAssetIndex += 1;
      const asset = assets[index];
      if (!asset) return;
      try {
        const lease = await acquirePrefab(asset, lod, baseUrl, signal);
        leases.push(lease);
      } catch {
        failed = true;
        return;
      }
    }
  });
  await Promise.all(workers);
  return Object.freeze({
    leases: Object.freeze(leases),
    succeeded: !signal.aborted && !failed && leases.length === assets.length
  });
}

/**
 * Creates an immediate single-call fallback, then lazily parses only the
 * species that the deterministic biome planner actually selected. All source
 * GLB bytes are same-origin, digest-pinned static files; this layer performs
 * no remote discovery, collision, raycasting, shadow, or animation work.
 */
export function createRealmForestLayer(
  options: CreateRealmForestLayerOptions
): RealmForestLayer {
  const group = new THREE.Group();
  group.name = options.presentationName ?? 'realm-hegemony-forest-presentation';
  const points = options.data.points;
  const canonicalTriangleCount = points.reduce(
    (total, point) => total + point.estimatedTriangles,
    0
  );
  const structureCellCounts = summarizeRealmForestStructure(
    points,
    options.data.counts.openFoliageCellCount
  );
  const silhouetteCoverageRatio = realmForestSilhouetteCoverageRatio(
    points,
    options.data.canopyByTileKey.size,
    HEX_SIZE
  );
  if (points.length === 0) {
    let disposed = false;
    return Object.freeze({
      group,
      getPresentationTelemetry: () => Object.freeze({
        instanceCount: 0,
        drawCalls: 0,
        usingFallback: false,
        fallbackType: 'none',
        contactShadowCount: 0,
        groundingMode: 'none',
        canopyMotionState: REALM_FOREST_CANOPY_MOTION_STATE,
        structureCellCounts,
        silhouetteCoverageRatio: 0,
        canonicalTriangleCount,
        triangleCount: 0,
        snowTintedTreeCount: 0,
        dryTintedTreeCount: 0
      }),
      dispose: () => {
        if (disposed) return;
        disposed = true;
      }
    });
  }

  const fallback = createFallbackForestMesh(
    points,
    options.map,
    options.terrainPlacements,
    options.northernSnow,
    options.southernDesert
  );
  group.add(fallback.mesh);
  let activeMesh: THREE.Mesh | THREE.InstancedMesh = fallback.mesh;
  let activeTriangleCount = fallback.triangleCount;
  let activeSnowTintedTreeCount = fallback.snowTintedTreeCount;
  let activeDryTintedTreeCount = fallback.dryTintedTreeCount;
  let usingFallback = true;
  let disposed = false;
  const abortController = new AbortController();
  const lod = options.lod ?? lodForQuality(options.quality);
  const acquirePrefab = options.acquirePrefab ?? ((asset, requestedLod, baseUrl, signal) => (
    acquireHegemonyTreePrefab({ asset, lod: requestedLod, baseUrl, signal })
  ));
  const assetIds = [...new Set(points.map((point) => point.speciesId))].sort();
  const assets: HegemonyTreeRuntimeAsset[] = [];
  assetIds.forEach((assetId) => {
    const asset = HEGEMONY_TREE_RUNTIME_ASSET_BY_ID[assetId];
    if (!asset) throw new Error('Unknown Hegemony tree runtime asset ' + assetId + '.');
    assets.push(asset);
  });

  const releaseLeases = (leases: readonly HegemonyTreePrefabLease[]) => {
    leases.forEach((lease) => {
      try {
        lease.release();
      } catch {
        // One browser-side disposal failure must not leave the other parsed
        // source assets resident after the static copy is complete.
      }
    });
  };

  void acquireTreePrefabsStaged(
    assets,
    lod,
    options.baseUrl,
    abortController.signal,
    acquirePrefab
  ).then(({ leases, succeeded }) => {
    try {
      if (disposed || !succeeded) return;
      const prefabs = new Map(leases.map((lease) => [lease.prefab.assetId, lease.prefab]));
      const next = createMergedTreeMesh(
        points,
        prefabs,
        options.map,
        options.terrainPlacements,
        options.northernSnow,
        options.southernDesert
      );
      if (disposed) {
        disposeMesh(next.mesh);
        return;
      }
      group.add(next.mesh);
      const previousMesh = activeMesh;
      activeMesh = next.mesh;
      activeTriangleCount = next.triangleCount;
      activeSnowTintedTreeCount = next.snowTintedTreeCount;
      activeDryTintedTreeCount = next.dryTintedTreeCount;
      usingFallback = false;
      disposeMesh(previousMesh);
      options.onModelReady?.();
    } catch {
      // The fallback remains a complete non-authoritative forest when a local
      // asset is malformed or a device rejects the static batch.
    } finally {
      releaseLeases(leases);
    }
  });

  return Object.freeze({
    group,
    getPresentationTelemetry: () => Object.freeze({
      instanceCount: disposed ? 0 : points.length,
      drawCalls: disposed ? 0 : 1,
      usingFallback: !disposed && usingFallback,
      fallbackType: !disposed && usingFallback
        ? REALM_PROCEDURAL_FOREST_FALLBACK_TYPE
        : 'none',
      // Grounding comes from canopy/base tint and fallback root geometry, not
      // a shadow mesh or shadow pass.
      contactShadowCount: 0,
      groundingMode: disposed
        ? 'none'
        : usingFallback
          ? 'terrain-canopy-procedural-root-contact'
          : 'terrain-canopy-baked-base',
      canopyMotionState: REALM_FOREST_CANOPY_MOTION_STATE,
      structureCellCounts,
      silhouetteCoverageRatio: disposed ? 0 : silhouetteCoverageRatio,
      canonicalTriangleCount,
      triangleCount: disposed ? 0 : activeTriangleCount,
      snowTintedTreeCount: disposed ? 0 : activeSnowTintedTreeCount,
      dryTintedTreeCount: disposed ? 0 : activeDryTintedTreeCount
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      abortController.abort();
      disposeMesh(activeMesh);
    }
  });
}
