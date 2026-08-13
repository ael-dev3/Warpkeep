import * as THREE from 'three';

import {
  createRealmGrassExclusionIndex,
  generateRealmGrassCells,
  type RealmGrassCellData,
  type RealmGrassExclusion,
  type RealmGrassPoint,
  type RealmGrassTerrainKind
} from '../../game/map/realmGrass';
import {
  hexDistance,
  hexKey,
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';
import type { RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import type { TerrainStructurePlacement } from '../../game/map/terrainPlacements';
import type { RealmVegetationField } from '../../game/map/realmVegetationField';
import type { RealmNorthernSnowField } from '../../game/map/realmNorthernSnow';
import type { RealmSouthernDesertField } from '../../game/map/realmSouthernDesert';
import { realmGrassColorMetrics } from '../../game/map/realmGrassPalette';
import { createDeterministicBudgetCollector } from '../../game/map/deterministicBudget';
import {
  createLowPolyGrassGeometry,
  REALM_GRASS_BLADES_PER_PATCH,
  REALM_GRASS_MID_BLADES_PER_PATCH,
  REALM_GRASS_MID_TRIANGLES_PER_PATCH,
  REALM_GRASS_TRIANGLES_PER_PATCH,
  REALM_GRASS_VARIANT_COUNTS
} from './createLowPolyGrassGeometry';
import {
  createRealmGrassMaterial,
  REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS
} from './createRealmGrassMaterial';
import type { RealmLivingRealmBudget } from './realmQuality';
import type { RealmSurfaceDisturbanceSnapshot } from './realmSurfaceDisturbanceField';
import {
  createRealmWildflowerLayer,
  type RealmWildflowerLayer,
  type RealmWildflowerTelemetry
} from './createRealmWildflowerLayer';
import {
  createRealmGrassCellCache,
  isRealmGrassMidRankAccepted,
  resolveRealmGrassActiveWindow,
  resolveRealmGrassExclusiveLodWeights,
  resolveRealmGrassLodWeights,
  shouldRepackRealmGrassWindow,
  type RealmGrassActiveWindow,
  type RealmGrassCameraMode,
  type RealmGrassRenderPlan
} from './realmGrassActiveWindow';

export type RealmGrassTelemetry = Readonly<{
  candidateCellCount: number;
  activeCellCount: number;
  instanceCount: number;
  nearInstanceCount: number;
  midInstanceCount: number;
  bladeCount: number;
  triangleCount: number;
  nearTriangleCount: number;
  midTriangleCount: number;
  drawCalls: number;
  nearDrawCalls: number;
  midDrawCalls: number;
  lodTransitionInstanceCount: number;
  wildflowers: RealmWildflowerTelemetry;
  variantCounts: readonly number[];
  cacheEntries: number;
  cacheLimit?: number;
  cacheHighWaterMark?: number;
  repackCount?: number;
  animated: boolean;
  targetAnimationCadence: number;
  averageRetainedPatchesPerActiveCell: number;
  averagePatchFootprint: number;
  averageBladeHeight: number;
  paletteLuminanceMin: number;
  paletteLuminanceMax: number;
  paletteDisplaySrgbSaturationMin?: number;
  paletteDisplaySrgbSaturationMax?: number;
  paletteGreenMin: number;
  paletteGreenMax: number;
  alphaHashActive: boolean;
  alphaToCoverageActive: boolean;
  shaderFallbackActive: boolean;
  shaderFallbackCount?: number;
  shaderFallbackReason?: string | null;
  edgeFadeCount: number;
  candidateCellsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  activeCellsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  countsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  averageRetainedPatchesByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  completelyBareActiveCells: number;
  rejectedByStructureClearance: number;
  rejectedBySlope: number;
  rejectedBySnow: number;
  retainedInSnowTransition: number;
  averageSnowCoverageOfActiveCells: number;
  rejectedBySand: number;
  retainedInDryTransition: number;
  activeSandCellCount: number;
  averageSandCoverageOfActiveCells: number;
  overviewHidden: boolean;
  disturbanceSlotCount: number;
  activeDisturbanceCount: number;
}>;

export type CreateRealmGrassLayerOptions = Readonly<{
  surface: RealmTerrainSurface;
  terrainKindsByKey: ReadonlyMap<string, RealmTerrainKind>;
  castleSlotKeys: ReadonlySet<string>;
  placements: readonly TerrainStructurePlacement[];
  exclusions?: readonly RealmGrassExclusion[];
  plan: RealmGrassRenderPlan;
  reducedMotion: boolean;
  hexSize?: number;
  alphaToCoverage?: boolean;
  vegetationField?: RealmVegetationField;
  northernSnow?: RealmNorthernSnowField;
  southernDesert?: RealmSouthernDesertField;
  isWorldExcluded?: (world: HexWorldPosition) => boolean;
  visualizeLegacyLakes?: boolean;
  suppressCastleSlots?: boolean;
  livingBudget?: RealmLivingRealmBudget;
}>;

export type RealmGrassLayer = Readonly<{
  group: THREE.Group;
  /** Primary mesh retained for existing scene/test callers. */
  mesh: THREE.InstancedMesh;
  meshes: readonly THREE.InstancedMesh[];
  nearMeshes: readonly THREE.InstancedMesh[];
  midMeshes: readonly THREE.InstancedMesh[];
  wildflowers: RealmWildflowerLayer;
  updateView: (focus: HexWorldPosition, mode: RealmGrassCameraMode) => boolean;
  /** Mark camera-local trunk/root exclusions dirty for the next view update. */
  invalidateExclusions: () => boolean;
  updateWind: (seconds: number, disturbances?: RealmSurfaceDisturbanceSnapshot | null) => boolean;
  activateShaderFallback: (kind: 'grass' | 'wildflower', reason: string) => void;
  setInteraction: (selected: HexCoord | null, hovered: HexCoord | null) => void;
  isAnimationActive: () => boolean;
  getTelemetry: () => RealmGrassTelemetry;
  dispose: () => void;
}>;

type PackedPoint = Readonly<{
  point: RealmGrassPoint;
  coverage: number;
  lodTransition: boolean;
}>;

const REALM_GRASS_TERRAIN_KINDS: readonly RealmGrassTerrainKind[] = Object.freeze([
  'meadow',
  'lowland',
  'forest',
  'heath',
  'ridge',
  'lake',
  'ancient-stone',
  'apron'
]);

function emptyCounts(): Record<RealmGrassTerrainKind, number> {
  return {
    meadow: 0,
    lowland: 0,
    forest: 0,
    heath: 0,
    ridge: 0,
    lake: 0,
    'ancient-stone': 0,
    apron: 0
  };
}

function averageCounts(
  totals: Readonly<Record<RealmGrassTerrainKind, number>>,
  divisors: Readonly<Record<RealmGrassTerrainKind, number>>
) {
  const averages = emptyCounts();
  REALM_GRASS_TERRAIN_KINDS.forEach((kind) => {
    averages[kind] = totals[kind] / Math.max(1, divisors[kind]);
  });
  return averages;
}

function emptyTelemetry(plan: RealmGrassRenderPlan, alphaToCoverage = false): RealmGrassTelemetry {
  return Object.freeze({
    candidateCellCount: 0,
    activeCellCount: 0,
    instanceCount: 0,
    nearInstanceCount: 0,
    midInstanceCount: 0,
    bladeCount: 0,
    triangleCount: 0,
    nearTriangleCount: 0,
    midTriangleCount: 0,
    drawCalls: 0,
    nearDrawCalls: 0,
    midDrawCalls: 0,
    lodTransitionInstanceCount: 0,
    wildflowers: Object.freeze({
      candidateCount: 0,
      instanceCount: 0,
      triangleCount: 0,
      drawCalls: 0,
      budget: plan.geometryProfile === 'high' ? 512
        : plan.geometryProfile === 'balanced' ? 256 : 0,
      animated: false,
      alphaHashActive: !alphaToCoverage,
      alphaToCoverageActive: alphaToCoverage,
      shaderFallbackActive: false,
      shaderFallbackCount: 0,
      shaderFallbackReason: null,
      overviewHidden: true
    }),
    variantCounts: Object.freeze([]),
    cacheEntries: 0,
    cacheLimit: plan.cacheLimit,
    cacheHighWaterMark: 0,
    repackCount: 0,
    animated: false,
    targetAnimationCadence: plan.animationFrameCap,
    averageRetainedPatchesPerActiveCell: 0,
    averagePatchFootprint: 0,
    averageBladeHeight: 0,
    paletteLuminanceMin: 0,
    paletteLuminanceMax: 0,
    paletteDisplaySrgbSaturationMin: 0,
    paletteDisplaySrgbSaturationMax: 0,
    paletteGreenMin: 0,
    paletteGreenMax: 0,
    alphaHashActive: !alphaToCoverage,
    alphaToCoverageActive: alphaToCoverage,
    shaderFallbackActive: false,
    shaderFallbackCount: 0,
    shaderFallbackReason: null,
    edgeFadeCount: 0,
    candidateCellsByTerrain: Object.freeze(emptyCounts()),
    activeCellsByTerrain: Object.freeze(emptyCounts()),
    countsByTerrain: Object.freeze(emptyCounts()),
    averageRetainedPatchesByTerrain: Object.freeze(emptyCounts()),
    completelyBareActiveCells: 0,
    rejectedByStructureClearance: 0,
    rejectedBySlope: 0,
    rejectedBySnow: 0,
    retainedInSnowTransition: 0,
    averageSnowCoverageOfActiveCells: 0,
    rejectedBySand: 0,
    retainedInDryTransition: 0,
    activeSandCellCount: 0,
    averageSandCoverageOfActiveCells: 0,
    overviewHidden: true,
    disturbanceSlotCount: 0,
    activeDisturbanceCount: 0
  });
}

function safeCapacity(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function createAttributeSet(capacity: number) {
  return {
    phase: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
      .setUsage(THREE.DynamicDrawUsage),
    stiffness: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
      .setUsage(THREE.DynamicDrawUsage),
    windScale: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
      .setUsage(THREE.DynamicDrawUsage),
    cell: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2)
      .setUsage(THREE.DynamicDrawUsage),
    edgeFade: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
      .setUsage(THREE.DynamicDrawUsage)
  };
}

/**
 * Owns bounded variant instance pools. It never scans the entire Realm or
 * reallocates on camera frames; only a meaningful active-window transition
 * writes matrices/attributes. Wind advances a single shared material uniform.
 */
export function createRealmGrassLayer(options: CreateRealmGrassLayerOptions): RealmGrassLayer {
  const plan = options.plan;
  const capacity = safeCapacity(plan.maximumActiveInstances);
  const nearCapacity = Math.min(safeCapacity(plan.maximumNearInstances), capacity);
  const midCapacity = Math.min(
    safeCapacity(plan.maximumMidInstances),
    Math.max(0, capacity - nearCapacity)
  );
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0 ? options.hexSize! : 1;
  const exclusionIndex = createRealmGrassExclusionIndex(options.exclusions ?? [], hexSize);
  const group = new THREE.Group();
  group.name = 'realm-procedural-biome-grass';
  const variantCount = REALM_GRASS_VARIANT_COUNTS[plan.geometryProfile];
  let constructionMaterial: ReturnType<typeof createRealmGrassMaterial> | undefined;
  let constructionWildflowers: RealmWildflowerLayer | undefined;
  const constructionGeometries = new Set<THREE.BufferGeometry>();
  const constructionMeshes = new Set<THREE.InstancedMesh>();
  try {
  const materialLayer = constructionMaterial = createRealmGrassMaterial(
    options.reducedMotion ? 0 : plan.windStrengthMultiplier,
    !options.reducedMotion && plan.animationFrameCap > 0,
    options.alphaToCoverage ?? false,
    options.livingBudget?.grassDisturbanceSlots ?? 0
  );
  const wildflowers = constructionWildflowers = createRealmWildflowerLayer({
    plan,
    reducedMotion: options.reducedMotion,
    alphaToCoverage: options.alphaToCoverage
  });
  group.add(wildflowers.mesh);
  const createPool = (lod: 'near' | 'mid', poolCapacity: number) => {
    // Floor keeps each complete variant family at or below its own ceiling.
    const variantCapacity = Math.max(
      1,
      Math.floor(Math.max(1, poolCapacity) / variantCount)
    );
    const geometries = Array.from({ length: variantCount }, (_, variant) => {
      const geometry = createLowPolyGrassGeometry(plan.geometryProfile, variant, lod);
      constructionGeometries.add(geometry);
      return geometry;
    });
    const attributes = geometries.map((geometry) => {
      const set = createAttributeSet(variantCapacity);
      geometry.setAttribute('grassPhase', set.phase);
      geometry.setAttribute('grassStiffness', set.stiffness);
      geometry.setAttribute('grassWindScale', set.windScale);
      geometry.setAttribute('grassCell', set.cell);
      geometry.setAttribute('grassEdgeFade', set.edgeFade);
      return set;
    });
    const meshes = geometries.map((geometry, variant) => {
      const currentMesh = new THREE.InstancedMesh(
        geometry,
        materialLayer.material,
        variantCapacity
      );
      constructionMeshes.add(currentMesh);
      currentMesh.name = `realm-procedural-biome-grass-${lod}-variant-${variant}`;
      currentMesh.userData.realmGrassLod = lod;
      currentMesh.count = 0;
      currentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      currentMesh.castShadow = false;
      currentMesh.receiveShadow = false;
      // Bounds are recomputed after every repack and expanded for shader wind.
      currentMesh.frustumCulled = true;
      // Decorative blades must never intercept terrain/castle interaction rays.
      currentMesh.raycast = () => {};
      group.add(currentMesh);
      return currentMesh;
    });
    return { variantCapacity, geometries, attributes, meshes };
  };
  const nearPool = createPool('near', nearCapacity);
  const midPool = createPool('mid', midCapacity);
  const nearMeshes = nearPool.meshes;
  const midMeshes = midPool.meshes;
  const meshes = [...nearMeshes, ...midMeshes];
  const geometries = [...nearPool.geometries, ...midPool.geometries];
  const mesh = nearMeshes[0]!;

  const cache = createRealmGrassCellCache<RealmGrassCellData>(plan.cacheLimit);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const surfaceRotation = new THREE.Quaternion();
  const yawRotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const surfaceNormal = new THREE.Vector3();
  const tint = new THREE.Color();
  let currentWindow: RealmGrassActiveWindow | null = null;
  let telemetry = emptyTelemetry(plan, options.alphaToCoverage ?? false);
  let disposed = false;
  let exclusionsDirty = false;
  let cacheHighWaterMark = 0;
  let repackCount = 0;
  let lastWindUpdateSeconds = Number.NEGATIVE_INFINITY;

  const cellDataFor = (cell: RealmGrassActiveWindow['cells'][number]['cell']) => {
    const key = `${cell.coord.q},${cell.coord.r}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const generated = generateRealmGrassCells({
      map: options.surface.renderMap,
      cells: [cell],
      terrainKindsByKey: options.terrainKindsByKey,
      playableKeys: options.surface.playableKeys,
      playableRadius: options.surface.playableMap.radius,
      renderRadius: options.surface.renderMap.radius,
      quality: plan.geometryProfile,
      placements: options.placements,
      castleSlotKeys: options.castleSlotKeys,
      exclusionIndex,
      hexSize,
      densityMultiplier: plan.densityMultiplier,
      vegetationField: options.vegetationField,
      northernSnow: options.northernSnow,
      southernDesert: options.southernDesert,
      isWorldExcluded: options.isWorldExcluded,
      visualizeLegacyLakes: options.visualizeLegacyLakes,
      suppressCastleSlots: options.suppressCastleSlots
    }).cells[0]!;
    cache.set(key, generated);
    cacheHighWaterMark = Math.max(cacheHighWaterMark, cache.size);
    return generated;
  };

  const telemetryTerrainKindFor = (
    cell: RealmGrassActiveWindow['cells'][number]['cell']
  ): RealmGrassTerrainKind => {
    const key = hexKey(cell.coord);
    if (!options.surface.playableKeys.has(key)) return 'apron';
    const kind = options.terrainKindsByKey.get(key) ?? 'lowland';
    return options.visualizeLegacyLakes === true && kind === 'lake' ? 'lowland' : kind;
  };

  const updateBounds = () => {
    meshes.forEach((currentMesh) => {
      currentMesh.computeBoundingBox();
      if (currentMesh.boundingBox) {
        currentMesh.boundingBox.expandByScalar(REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS);
      }
      currentMesh.computeBoundingSphere();
      if (currentMesh.boundingSphere) {
        currentMesh.boundingSphere.radius += REALM_GRASS_MAX_WORLD_DEFORMATION_RADIUS;
      }
    });
  };

  const repack = (window: RealmGrassActiveWindow) => {
    repackCount += 1;
    wildflowers.beginRepack(window.overviewHidden || !plan.enabled || capacity === 0);
    if (window.overviewHidden || !plan.enabled || capacity === 0) {
      meshes.forEach((currentMesh) => {
        currentMesh.count = 0;
      });
      group.visible = false;
      materialLayer.setVisible(false);
      const flowerTelemetry = wildflowers.commitRepack();
      telemetry = Object.freeze({
        ...emptyTelemetry(plan, options.alphaToCoverage ?? false),
        wildflowers: flowerTelemetry,
        cacheEntries: cache.size,
        cacheLimit: cache.limit,
        cacheHighWaterMark,
        repackCount,
        overviewHidden: true
      });
      return;
    }
    const nearCollectors = Array.from({ length: variantCount }, () =>
      createDeterministicBudgetCollector<PackedPoint>(
        nearCapacity > 0 ? nearPool.variantCapacity : 0
      )
    );
    const midCollectors = Array.from({ length: variantCount }, () =>
      createDeterministicBudgetCollector<PackedPoint>(
        midCapacity > 0 ? midPool.variantCapacity : 0
      )
    );
    let nearOrder = 0;
    let midOrder = 0;
    let completelyBareActiveCells = 0;
    let rejectedByStructureClearance = 0;
    let rejectedBySlope = 0;
    let rejectedBySnow = 0;
    let retainedInSnowTransition = 0;
    let activeCellSnowCoverageTotal = 0;
    let rejectedBySand = 0;
    let retainedInDryTransition = 0;
    let activeSandCellCount = 0;
    let activeCellSandCoverageTotal = 0;
    // Both records are fixed to the eight presentation terrain kinds. The
    // outer ring is classified without generating or caching invisible grass.
    const candidateCellsByTerrain = emptyCounts();
    const activeCellsByTerrain = emptyCounts();
    window.cells.forEach((activeCell) => {
      candidateCellsByTerrain[telemetryTerrainKindFor(activeCell.cell)] += 1;
      // At zero fade the stochastic cutout is fully discarded. Do not
      // spend cache/instance capacity on that invisible boundary ring.
      if (activeCell.edgeFade <= 0) return;
      const data = cellDataFor(activeCell.cell);
      activeCellsByTerrain[data.terrainKind] += 1;
      if (data.completelyBare) completelyBareActiveCells += 1;
      rejectedByStructureClearance += data.rejectedByStructure + data.rejectedByExclusion;
      rejectedBySlope += data.rejectedBySlope;
      rejectedBySnow += data.rejectedBySnow;
      retainedInSnowTransition += data.retainedInSnowTransition;
      activeCellSnowCoverageTotal += data.snowCoverage;
      rejectedBySand += data.rejectedBySand;
      retainedInDryTransition += data.retainedInDryTransition;
      activeCellSandCoverageTotal += data.sandCoverage;
      if (data.sandCoverage >= 0.15) activeSandCellCount += 1;
      const distance = window.anchor ? hexDistance(window.anchor, data.coord) : 0;
      const blendedLodWeights = resolveRealmGrassLodWeights(
        plan,
        distance,
        activeCell.edgeFade
      );
      const lodTransition = blendedLodWeights.nearCoverage > 0
        && blendedLodWeights.midCoverage > 0;
      data.points.forEach((point) => {
        const variant = point.variant % variantCount;
        const midAccepted = blendedLodWeights.midCoverage > 0
          && isRealmGrassMidRankAccepted(point.rank, plan.midDensityMultiplier);
        const lodWeights = resolveRealmGrassExclusiveLodWeights(
          plan,
          distance,
          activeCell.edgeFade,
          midAccepted,
          point.rank
        );
        if (blendedLodWeights.nearCoverage > 0) {
          wildflowers.addCandidate({
            point,
            // Flowers belong to the visual near band, not to the grass
            // topology lottery. Preserve the smooth near-band fade even when
            // this root has already handed its grass patch to the mid mesh.
            nearCoverage: blendedLodWeights.nearCoverage,
            distance
          });
        }
        if (lodWeights.nearCoverage > 0) {
          nearCollectors[variant]!.add({
            value: Object.freeze({
              point,
              coverage: lodWeights.nearCoverage,
              lodTransition
            }),
            group: distance,
            rank: point.rank,
            order: nearOrder++
          });
        }
        if (lodWeights.midCoverage > 0) {
          midCollectors[variant]!.add({
            value: Object.freeze({
              point,
              coverage: lodWeights.midCoverage,
              lodTransition
            }),
            // The rank, rather than camera distance, selects a stable sparse
            // field across the complete mid disc. Capacity remains a strict
            // emergency ceiling for adversarial/custom generation inputs.
            group: 0,
            rank: point.rank,
            order: midOrder++
          });
        }
      });
    });
    const nearPackedByVariant = nearCollectors.map((collector) => collector.values());
    const midPackedByVariant = midCollectors.map((collector) => collector.values());
    const nearPacked = nearPackedByVariant.flat();
    const midPacked = midPackedByVariant.flat();
    const packed = [...nearPacked, ...midPacked];
    // A transition root now occupies exactly one topology. Count those retained
    // one-of-two instances directly rather than looking for duplicate roots.
    const lodTransitionInstanceCount = packed.reduce((total, point) => (
      point.lodTransition ? total + 1 : total
    ), 0);
    const activeCellCount = Object.values(activeCellsByTerrain)
      .reduce((total, count) => total + count, 0);
    const counts = emptyCounts();
    let footprintTotal = 0;
    let heightTotal = 0;
    let luminanceMin = Number.POSITIVE_INFINITY;
    let luminanceMax = 0;
    let saturationMin = Number.POSITIVE_INFINITY;
    let saturationMax = 0;
    let greenMin = Number.POSITIVE_INFINITY;
    let greenMax = 0;
    let edgeFadeCount = 0;
    const packPool = (
      packedByVariant: readonly (readonly PackedPoint[])[],
      poolMeshes: readonly THREE.InstancedMesh[],
      poolAttributes: readonly ReturnType<typeof createAttributeSet>[]
    ) => packedByVariant.forEach((variantPoints, variant) => {
      const currentMesh = poolMeshes[variant]!;
      const currentAttributes = poolAttributes[variant]!;
      variantPoints.forEach(({ point, coverage }, index) => {
        position.set(point.world.x, point.groundY, point.world.z);
        surfaceNormal.set(
          point.surfaceNormal.x,
          point.surfaceNormal.y,
          point.surfaceNormal.z
        ).normalize();
        surfaceRotation.setFromUnitVectors(axis, surfaceNormal);
        yawRotation.setFromAxisAngle(surfaceNormal, point.yaw);
        rotation.copy(yawRotation).multiply(surfaceRotation).normalize();
        scale.set(point.width, point.height, point.width);
        matrix.compose(position, rotation, scale);
        currentMesh.setMatrixAt(index, matrix);
        currentMesh.setColorAt(index, tint.setRGB(point.tint.r, point.tint.g, point.tint.b));
        currentAttributes.phase.setX(index, point.windPhase);
        currentAttributes.stiffness.setX(index, point.stiffness);
        currentAttributes.windScale.setX(index, point.windScale);
        currentAttributes.cell.setXY(index, point.coord.q, point.coord.r);
        currentAttributes.edgeFade.setX(index, coverage);
        counts[point.terrainKind] += 1;
        footprintTotal += point.width * 0.46;
        heightTotal += point.height;
        const colourMetrics = realmGrassColorMetrics(point.tint);
        const luminance = colourMetrics.linearLuminance;
        luminanceMin = Math.min(luminanceMin, luminance);
        luminanceMax = Math.max(luminanceMax, luminance);
        saturationMin = Math.min(
          saturationMin,
          colourMetrics.displaySrgbSaturation
        );
        saturationMax = Math.max(
          saturationMax,
          colourMetrics.displaySrgbSaturation
        );
        greenMin = Math.min(greenMin, point.tint.g);
        greenMax = Math.max(greenMax, point.tint.g);
        if (coverage < 0.999) edgeFadeCount += 1;
      });
      currentMesh.count = variantPoints.length;
      currentMesh.instanceMatrix.needsUpdate = true;
      if (currentMesh.instanceColor) {
        currentMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        currentMesh.instanceColor.needsUpdate = true;
      }
      currentAttributes.phase.needsUpdate = true;
      currentAttributes.stiffness.needsUpdate = true;
      currentAttributes.windScale.needsUpdate = true;
      currentAttributes.cell.needsUpdate = true;
      currentAttributes.edgeFade.needsUpdate = true;
    });
    packPool(nearPackedByVariant, nearMeshes, nearPool.attributes);
    packPool(midPackedByVariant, midMeshes, midPool.attributes);
    updateBounds();
    group.visible = packed.length > 0;
    materialLayer.setVisible(packed.length > 0);
    const nearTrianglesPerPatch = REALM_GRASS_TRIANGLES_PER_PATCH[plan.geometryProfile];
    const midTrianglesPerPatch = REALM_GRASS_MID_TRIANGLES_PER_PATCH[plan.geometryProfile];
    const alphaHash =
      (
        materialLayer.material as THREE.MeshStandardMaterial & {
          alphaHash?: boolean;
        }
      ).alphaHash === true;
    const alphaCoverage =
      (
        materialLayer.material as THREE.MeshStandardMaterial & {
          alphaToCoverage?: boolean;
        }
      ).alphaToCoverage === true;
    const shaderTelemetry = materialLayer.getShaderTelemetry();
    const flowerTelemetry = wildflowers.commitRepack();
    group.visible = packed.length > 0 || flowerTelemetry.instanceCount > 0;
    const nearTriangleCount = nearPacked.length * nearTrianglesPerPatch;
    const midTriangleCount = midPacked.length * midTrianglesPerPatch;
    const nearDrawCalls = nearPackedByVariant
      .filter((variantPoints) => variantPoints.length > 0).length;
    const midDrawCalls = midPackedByVariant
      .filter((variantPoints) => variantPoints.length > 0).length;
    telemetry = Object.freeze({
      candidateCellCount: window.cells.length,
      activeCellCount,
      instanceCount: packed.length,
      nearInstanceCount: nearPacked.length,
      midInstanceCount: midPacked.length,
      bladeCount:
        nearPacked.length * REALM_GRASS_BLADES_PER_PATCH[plan.geometryProfile]
        + midPacked.length * REALM_GRASS_MID_BLADES_PER_PATCH[plan.geometryProfile],
      triangleCount: nearTriangleCount + midTriangleCount,
      nearTriangleCount,
      midTriangleCount,
      drawCalls: nearDrawCalls + midDrawCalls,
      nearDrawCalls,
      midDrawCalls,
      lodTransitionInstanceCount,
      wildflowers: flowerTelemetry,
      variantCounts: Object.freeze([
        ...nearPackedByVariant.map((variantPoints) => variantPoints.length),
        ...midPackedByVariant.map((variantPoints) => variantPoints.length)
      ]),
      cacheEntries: cache.size,
      cacheLimit: cache.limit,
      cacheHighWaterMark,
      repackCount,
      animated: (packed.length > 0
        && plan.animationFrameCap > 0
        && !options.reducedMotion
        && !shaderTelemetry.fallbackActive) || flowerTelemetry.animated,
      targetAnimationCadence: plan.animationFrameCap,
      averageRetainedPatchesPerActiveCell: packed.length / Math.max(1, activeCellCount),
      averagePatchFootprint: packed.length > 0 ? footprintTotal / packed.length : 0,
      averageBladeHeight: packed.length > 0 ? heightTotal / packed.length : 0,
      paletteLuminanceMin: Number.isFinite(luminanceMin) ? luminanceMin : 0,
      paletteLuminanceMax: luminanceMax,
      paletteDisplaySrgbSaturationMin: Number.isFinite(saturationMin)
        ? saturationMin
        : 0,
      paletteDisplaySrgbSaturationMax: saturationMax,
      paletteGreenMin: Number.isFinite(greenMin) ? greenMin : 0,
      paletteGreenMax: greenMax,
      alphaHashActive: alphaHash,
      alphaToCoverageActive: alphaCoverage,
      shaderFallbackActive: shaderTelemetry.fallbackActive,
      shaderFallbackCount: shaderTelemetry.fallbackCount,
      shaderFallbackReason: shaderTelemetry.fallbackReason,
      edgeFadeCount,
      candidateCellsByTerrain: Object.freeze(candidateCellsByTerrain),
      activeCellsByTerrain: Object.freeze(activeCellsByTerrain),
      countsByTerrain: Object.freeze(counts),
      averageRetainedPatchesByTerrain: Object.freeze(averageCounts(counts, activeCellsByTerrain)),
      completelyBareActiveCells,
      rejectedByStructureClearance,
      rejectedBySlope,
      rejectedBySnow,
      retainedInSnowTransition,
      averageSnowCoverageOfActiveCells:
        activeCellSnowCoverageTotal / Math.max(1, activeCellCount),
      rejectedBySand,
      retainedInDryTransition,
      activeSandCellCount,
      averageSandCoverageOfActiveCells:
        activeCellSandCoverageTotal / Math.max(1, activeCellCount),
      overviewHidden: false,
      disturbanceSlotCount: shaderTelemetry.disturbanceSlotCount,
      activeDisturbanceCount: shaderTelemetry.activeDisturbanceCount
    });
    if (telemetry.triangleCount > plan.maximumActiveTriangles) {
      throw new Error('REALM_GRASS_TRIANGLE_BUDGET_EXCEEDED');
    }
    if (
      telemetry.instanceCount > plan.maximumActiveInstances
      || telemetry.nearInstanceCount > plan.maximumNearInstances
      || telemetry.midInstanceCount > plan.maximumMidInstances
    ) {
      throw new Error('REALM_GRASS_INSTANCE_BUDGET_EXCEEDED');
    }
    if (
      telemetry.nearTriangleCount > plan.maximumNearTriangles
      || telemetry.midTriangleCount > plan.maximumMidTriangles
    ) {
      throw new Error('REALM_GRASS_LOD_TRIANGLE_BUDGET_EXCEEDED');
    }
    if (
      telemetry.drawCalls > plan.maximumActiveDrawCalls
      || telemetry.nearDrawCalls > plan.maximumNearDrawCalls
      || telemetry.midDrawCalls > plan.maximumMidDrawCalls
    ) {
      throw new Error('REALM_GRASS_DRAW_BUDGET_EXCEEDED');
    }
  };

  const getCurrentTelemetry = (): RealmGrassTelemetry => {
    const shaderTelemetry = materialLayer.getShaderTelemetry();
    const flowerTelemetry = wildflowers.getTelemetry();
    const grassAnimated = telemetry.instanceCount > 0
      && plan.animationFrameCap > 0
      && !options.reducedMotion
      && !shaderTelemetry.fallbackActive;
    const animated = grassAnimated || flowerTelemetry.animated;
    if (
      telemetry.animated === animated
      && telemetry.wildflowers === flowerTelemetry
      && telemetry.shaderFallbackActive === shaderTelemetry.fallbackActive
      && telemetry.shaderFallbackCount === shaderTelemetry.fallbackCount
      && telemetry.shaderFallbackReason === shaderTelemetry.fallbackReason
      && telemetry.disturbanceSlotCount === shaderTelemetry.disturbanceSlotCount
      && telemetry.activeDisturbanceCount === shaderTelemetry.activeDisturbanceCount
    ) return telemetry;
    return Object.freeze({
      ...telemetry,
      animated,
      wildflowers: flowerTelemetry,
      shaderFallbackActive: shaderTelemetry.fallbackActive,
      shaderFallbackCount: shaderTelemetry.fallbackCount,
      shaderFallbackReason: shaderTelemetry.fallbackReason,
      disturbanceSlotCount: shaderTelemetry.disturbanceSlotCount,
      activeDisturbanceCount: shaderTelemetry.activeDisturbanceCount
    });
  };

  const layer: RealmGrassLayer = Object.freeze({
    group,
    mesh,
    meshes: Object.freeze(meshes),
    nearMeshes: Object.freeze(nearMeshes),
    midMeshes: Object.freeze(midMeshes),
    wildflowers,
    updateView: (focus, mode) => {
      if (disposed) return false;
      const next = resolveRealmGrassActiveWindow(options.surface.renderMap, focus, mode, plan, hexSize);
      if (!exclusionsDirty && !shouldRepackRealmGrassWindow(currentWindow, next, plan)) {
        return false;
      }
      currentWindow = next;
      exclusionsDirty = false;
      repack(next);
      return true;
    },
    invalidateExclusions: () => {
      if (disposed) return false;
      cache.clear();
      exclusionsDirty = true;
      return true;
    },
    updateWind: (seconds, disturbances = null) => {
      if (
        disposed
        || !getCurrentTelemetry().animated
        || !Number.isFinite(seconds)
        || plan.animationFrameCap <= 0
      ) return false;
      const safeSeconds = Math.max(0, seconds);
      const disturbancesChanged = materialLayer.setDisturbances(disturbances);
      const minimumInterval = 1 / plan.animationFrameCap;
      if (
        Number.isFinite(lastWindUpdateSeconds)
        && safeSeconds >= lastWindUpdateSeconds
        && safeSeconds - lastWindUpdateSeconds + Number.EPSILON < minimumInterval
      ) return disturbancesChanged;
      lastWindUpdateSeconds = safeSeconds;
      const grassChanged = materialLayer.getShaderTelemetry().fallbackActive
        ? false
        : materialLayer.setTime(safeSeconds);
      const flowersChanged = wildflowers.updateWind(safeSeconds);
      return disturbancesChanged || grassChanged || flowersChanged;
    },
    activateShaderFallback: (kind, reason) => {
      if (disposed) return;
      if (kind === 'wildflower') wildflowers.activateShaderFallback(reason);
      else materialLayer.activateShaderFallback(reason);
    },
    setInteraction: (selected, hovered) => {
      if (disposed) return;
      materialLayer.setInteraction(selected, hovered);
    },
    isAnimationActive: () => !disposed && getCurrentTelemetry().animated,
    getTelemetry: () => getCurrentTelemetry(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cache.dispose();
      meshes.forEach((currentMesh, index) => {
        group.remove(currentMesh);
        currentMesh.dispose();
        geometries[index]!.dispose();
      });
      group.remove(wildflowers.mesh);
      wildflowers.dispose();
      materialLayer.dispose();
    }
  });
  constructionMeshes.clear();
  constructionGeometries.clear();
  constructionWildflowers = undefined;
  constructionMaterial = undefined;
  return layer;
  } catch (error) {
    constructionMeshes.forEach((currentMesh) => {
      group.remove(currentMesh);
      currentMesh.dispose();
    });
    constructionGeometries.forEach((geometry) => geometry.dispose());
    if (constructionWildflowers) {
      group.remove(constructionWildflowers.mesh);
      constructionWildflowers.dispose();
    }
    constructionMaterial?.dispose();
    throw error;
  }
}
