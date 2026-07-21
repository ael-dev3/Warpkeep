import * as THREE from 'three';

import {
  createRealmGrassExclusionIndex,
  generateRealmGrassCells,
  type RealmGrassCellData,
  type RealmGrassExclusion,
  type RealmGrassPoint,
  type RealmGrassTerrainKind
} from '../../game/map/realmGrass';
import { hexDistance, type HexCoord, type HexWorldPosition } from '../../game/map/hexCoordinates';
import type { RealmTerrainKind } from '../../game/map/realmTerrainSemantics';
import type { RealmTerrainSurface } from '../../game/map/realmTerrainSurface';
import type { TerrainStructurePlacement } from '../../game/map/terrainPlacements';
import { createDeterministicBudgetCollector } from '../../game/map/deterministicBudget';
import {
  createLowPolyGrassGeometry,
  REALM_GRASS_BLADES_PER_PATCH,
  REALM_GRASS_TRIANGLES_PER_PATCH,
  REALM_GRASS_VARIANT_COUNTS
} from './createLowPolyGrassGeometry';
import { createRealmGrassMaterial, REALM_GRASS_MAX_WIND_SWAY } from './createRealmGrassMaterial';
import {
  createRealmGrassCellCache,
  resolveRealmGrassActiveWindow,
  shouldRepackRealmGrassWindow,
  type RealmGrassActiveWindow,
  type RealmGrassCameraMode,
  type RealmGrassRenderPlan
} from './realmGrassActiveWindow';

export type RealmGrassTelemetry = Readonly<{
  candidateCellCount: number;
  activeCellCount: number;
  instanceCount: number;
  bladeCount: number;
  triangleCount: number;
  drawCalls: number;
  variantCounts: readonly number[];
  cacheEntries: number;
  animated: boolean;
  targetAnimationCadence: number;
  averageRetainedPatchesPerActiveCell: number;
  averagePatchFootprint: number;
  averageBladeHeight: number;
  paletteLuminanceMin: number;
  paletteLuminanceMax: number;
  paletteGreenMin: number;
  paletteGreenMax: number;
  alphaHashActive: boolean;
  alphaToCoverageActive: boolean;
  shaderFallbackActive: boolean;
  edgeFadeCount: number;
  candidateCellsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  activeCellsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  countsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  averageVegetationDensityByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
  completelyBareActiveCells: number;
  rejectedByStructureClearance: number;
  rejectedBySlope: number;
  overviewHidden: boolean;
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
}>;

export type RealmGrassLayer = Readonly<{
  group: THREE.Group;
  /** Primary mesh retained for existing scene/test callers. */
  mesh: THREE.InstancedMesh;
  meshes: readonly THREE.InstancedMesh[];
  updateView: (focus: HexWorldPosition, mode: RealmGrassCameraMode) => boolean;
  updateWind: (seconds: number) => boolean;
  setInteraction: (selected: HexCoord | null, hovered: HexCoord | null) => void;
  isAnimationActive: () => boolean;
  getTelemetry: () => RealmGrassTelemetry;
  dispose: () => void;
}>;

type PackedPoint = Readonly<{
  point: RealmGrassPoint;
  edgeFade: number;
  distance: number;
}>;

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

function emptyTelemetry(plan: RealmGrassRenderPlan, alphaToCoverage = false): RealmGrassTelemetry {
  return Object.freeze({
    candidateCellCount: 0,
    activeCellCount: 0,
    instanceCount: 0,
    bladeCount: 0,
    triangleCount: 0,
    drawCalls: 0,
    variantCounts: Object.freeze([]),
    cacheEntries: 0,
    animated: false,
    targetAnimationCadence: plan.animationFrameCap,
    averageRetainedPatchesPerActiveCell: 0,
    averagePatchFootprint: 0,
    averageBladeHeight: 0,
    paletteLuminanceMin: 0,
    paletteLuminanceMax: 0,
    paletteGreenMin: 0,
    paletteGreenMax: 0,
    alphaHashActive: true,
    alphaToCoverageActive: alphaToCoverage,
    shaderFallbackActive: false,
    edgeFadeCount: 0,
    candidateCellsByTerrain: Object.freeze(emptyCounts()),
    activeCellsByTerrain: Object.freeze(emptyCounts()),
    countsByTerrain: Object.freeze(emptyCounts()),
    averageVegetationDensityByTerrain: Object.freeze(emptyCounts()),
    completelyBareActiveCells: 0,
    rejectedByStructureClearance: 0,
    rejectedBySlope: 0,
    overviewHidden: true
  });
}

function safeCapacity(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function createAttributeSet(capacity: number) {
  return {
    phase: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
    stiffness: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
    windScale: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
    cell: new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
    edgeFade: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
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
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0 ? options.hexSize! : 1;
  const exclusionIndex = createRealmGrassExclusionIndex(options.exclusions ?? [], hexSize);
  const group = new THREE.Group();
  group.name = 'realm-procedural-biome-grass';
  const variantCount = REALM_GRASS_VARIANT_COUNTS[plan.geometryProfile];
  // Floor keeps the sum of variant pools at or below the quality ceiling.
  const variantCapacity = Math.max(1, Math.floor(Math.max(1, capacity) / variantCount));
  const materialLayer = createRealmGrassMaterial(
    plan.windStrengthMultiplier,
    !options.reducedMotion && plan.animationFrameCap > 0,
    options.alphaToCoverage ?? false
  );
  const geometries = Array.from({ length: variantCount }, (_, variant) =>
    createLowPolyGrassGeometry(plan.geometryProfile, variant)
  );
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
    const mesh = new THREE.InstancedMesh(geometry, materialLayer.material, variantCapacity);
    mesh.name = `realm-procedural-biome-grass-variant-${variant}`;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    // Decorative blades must never intercept terrain/castle interaction rays.
    mesh.raycast = () => {};
    group.add(mesh);
    return mesh;
  });
  const mesh = meshes[0]!;

  const cache = createRealmGrassCellCache<RealmGrassCellData>(plan.cacheLimit);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let currentWindow: RealmGrassActiveWindow | null = null;
  let telemetry = emptyTelemetry(plan, options.alphaToCoverage ?? false);
  let disposed = false;

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
      densityMultiplier: plan.densityMultiplier
    }).cells[0]!;
    cache.set(key, generated);
    return generated;
  };

  const updateBounds = () => {
    meshes.forEach((currentMesh) => {
      currentMesh.computeBoundingBox();
      if (currentMesh.boundingBox) currentMesh.boundingBox.expandByScalar(REALM_GRASS_MAX_WIND_SWAY);
      currentMesh.computeBoundingSphere();
      if (currentMesh.boundingSphere) currentMesh.boundingSphere.radius += REALM_GRASS_MAX_WIND_SWAY;
    });
  };

  const repack = (window: RealmGrassActiveWindow) => {
    if (window.overviewHidden || !plan.enabled || capacity === 0) {
      meshes.forEach((currentMesh) => {
        currentMesh.count = 0;
      });
      group.visible = false;
      materialLayer.setVisible(false);
      telemetry = Object.freeze({
        ...emptyTelemetry(plan, options.alphaToCoverage ?? false),
        cacheEntries: cache.size,
        overviewHidden: true
      });
      return;
    }
    const collectors = Array.from({ length: variantCount }, () =>
      createDeterministicBudgetCollector<PackedPoint>(variantCapacity)
    );
    let order = 0;
    let completelyBareActiveCells = 0;
    let rejectedByStructureClearance = 0;
    let rejectedBySlope = 0;
    const candidateCellsByTerrain = emptyCounts();
    const activeCellsByTerrain = emptyCounts();
    window.cells.forEach((activeCell) => {
      const data = cellDataFor(activeCell.cell);
      candidateCellsByTerrain[data.terrainKind] += 1;
      // At zero fade the alpha-hashed geometry is fully discarded. Do not
      // spend cache/instance capacity on that invisible boundary ring.
      if (activeCell.edgeFade <= 0) return;
      activeCellsByTerrain[data.terrainKind] += 1;
      if (data.completelyBare) completelyBareActiveCells += 1;
      rejectedByStructureClearance += data.rejectedByStructure + data.rejectedByExclusion;
      rejectedBySlope += data.rejectedBySlope;
      const distance = window.anchor ? hexDistance(window.anchor, data.coord) : 0;
      data.points.forEach((point) => {
        collectors[point.variant % variantCount]!.add({
          value: Object.freeze({
            point,
            edgeFade: activeCell.edgeFade,
            distance
          }),
          group: distance,
          rank: point.rank,
          order: order++
        });
      });
    });
    const packedByVariant = collectors.map((collector) => collector.values());
    const packed = packedByVariant.flat();
    const counts = emptyCounts();
    let footprintTotal = 0;
    let heightTotal = 0;
    let luminanceMin = Number.POSITIVE_INFINITY;
    let luminanceMax = 0;
    let greenMin = Number.POSITIVE_INFINITY;
    let greenMax = 0;
    let edgeFadeCount = 0;
    packedByVariant.forEach((variantPoints, variant) => {
      const currentMesh = meshes[variant]!;
      const currentAttributes = attributes[variant]!;
      variantPoints.forEach(({ point, edgeFade }, index) => {
        position.set(point.world.x, point.groundY + 0.002, point.world.z);
        rotation.setFromAxisAngle(axis, point.yaw);
        scale.set(point.width, point.height, point.width);
        matrix.compose(position, rotation, scale);
        currentMesh.setMatrixAt(index, matrix);
        currentMesh.setColorAt(index, tint.setRGB(point.tint.r, point.tint.g, point.tint.b));
        currentAttributes.phase.setX(index, point.windPhase);
        currentAttributes.stiffness.setX(index, point.stiffness);
        currentAttributes.windScale.setX(index, point.windScale);
        currentAttributes.cell.setXY(index, point.coord.q, point.coord.r);
        currentAttributes.edgeFade.setX(index, edgeFade);
        counts[point.terrainKind] += 1;
        footprintTotal += point.width * 0.46;
        heightTotal += point.height;
        const luminance = 0.2126 * point.tint.r + 0.7152 * point.tint.g + 0.0722 * point.tint.b;
        luminanceMin = Math.min(luminanceMin, luminance);
        luminanceMax = Math.max(luminanceMax, luminance);
        greenMin = Math.min(greenMin, point.tint.g);
        greenMax = Math.max(greenMax, point.tint.g);
        if (edgeFade < 0.999) edgeFadeCount += 1;
      });
      currentMesh.count = variantPoints.length;
      currentMesh.instanceMatrix.needsUpdate = true;
      if (currentMesh.instanceColor) currentMesh.instanceColor.needsUpdate = true;
      currentAttributes.phase.needsUpdate = true;
      currentAttributes.stiffness.needsUpdate = true;
      currentAttributes.windScale.needsUpdate = true;
      currentAttributes.cell.needsUpdate = true;
      currentAttributes.edgeFade.needsUpdate = true;
    });
    updateBounds();
    group.visible = packed.length > 0;
    materialLayer.setVisible(packed.length > 0);
    const trianglesPerPatch = REALM_GRASS_TRIANGLES_PER_PATCH[plan.geometryProfile];
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
    telemetry = Object.freeze({
      candidateCellCount: window.cells.length,
      activeCellCount: window.cells.length,
      instanceCount: packed.length,
      bladeCount: packed.length * REALM_GRASS_BLADES_PER_PATCH[plan.geometryProfile],
      triangleCount: packed.length * trianglesPerPatch,
      drawCalls: packedByVariant.filter((variantPoints) => variantPoints.length > 0).length,
      variantCounts: Object.freeze(packedByVariant.map((variantPoints) => variantPoints.length)),
      cacheEntries: cache.size,
      animated: packed.length > 0 && plan.animationFrameCap > 0 && !options.reducedMotion,
      targetAnimationCadence: plan.animationFrameCap,
      averageRetainedPatchesPerActiveCell: packed.length / Math.max(1, window.cells.length),
      averagePatchFootprint: packed.length > 0 ? footprintTotal / packed.length : 0,
      averageBladeHeight: packed.length > 0 ? heightTotal / packed.length : 0,
      paletteLuminanceMin: Number.isFinite(luminanceMin) ? luminanceMin : 0,
      paletteLuminanceMax: luminanceMax,
      paletteGreenMin: Number.isFinite(greenMin) ? greenMin : 0,
      paletteGreenMax: greenMax,
      alphaHashActive: alphaHash,
      alphaToCoverageActive: alphaCoverage,
      shaderFallbackActive: false,
      edgeFadeCount,
      candidateCellsByTerrain: Object.freeze(candidateCellsByTerrain),
      activeCellsByTerrain: Object.freeze(activeCellsByTerrain),
      countsByTerrain: Object.freeze(counts),
      averageVegetationDensityByTerrain: Object.freeze(Object.fromEntries(
        (Object.keys(candidateCellsByTerrain) as RealmGrassTerrainKind[]).map((kind) => [
          kind,
          counts[kind] / Math.max(1, activeCellsByTerrain[kind])
        ])
      ) as Record<RealmGrassTerrainKind, number>),
      completelyBareActiveCells,
      rejectedByStructureClearance,
      rejectedBySlope,
      overviewHidden: false
    });
    if (telemetry.triangleCount > plan.maximumActiveTriangles) {
      throw new Error('REALM_GRASS_TRIANGLE_BUDGET_EXCEEDED');
    }
  };

  return Object.freeze({
    group,
    mesh,
    meshes: Object.freeze(meshes),
    updateView: (focus, mode) => {
      if (disposed) return false;
      const next = resolveRealmGrassActiveWindow(options.surface.renderMap, focus, mode, plan, hexSize);
      if (!shouldRepackRealmGrassWindow(currentWindow, next, plan)) return false;
      currentWindow = next;
      repack(next);
      return true;
    },
    updateWind: (seconds) => {
      if (disposed || !telemetry.animated) return false;
      return materialLayer.setTime(seconds);
    },
    setInteraction: (selected, hovered) => {
      if (disposed) return;
      materialLayer.setInteraction(selected, hovered);
    },
    isAnimationActive: () => !disposed && telemetry.animated,
    getTelemetry: () => telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cache.dispose();
      meshes.forEach((currentMesh, index) => {
        group.remove(currentMesh);
        currentMesh.dispose();
        geometries[index]!.dispose();
      });
      materialLayer.dispose();
    }
  });
}
