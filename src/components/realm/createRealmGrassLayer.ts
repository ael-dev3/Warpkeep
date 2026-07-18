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
import { createLowPolyGrassGeometry, REALM_GRASS_TRIANGLES_PER_RIBBON } from './createLowPolyGrassGeometry';
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
  triangleCount: number;
  drawCalls: number;
  cacheEntries: number;
  animated: boolean;
  targetAnimationCadence: number;
  countsByTerrain: Readonly<Record<RealmGrassTerrainKind, number>>;
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
}>;

export type RealmGrassLayer = Readonly<{
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
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

function emptyTelemetry(plan: RealmGrassRenderPlan): RealmGrassTelemetry {
  return Object.freeze({
    candidateCellCount: 0,
    activeCellCount: 0,
    instanceCount: 0,
    triangleCount: 0,
    drawCalls: 0,
    cacheEntries: 0,
    animated: false,
    targetAnimationCadence: plan.animationFrameCap,
    countsByTerrain: Object.freeze(emptyCounts()),
    completelyBareActiveCells: 0,
    rejectedByStructureClearance: 0,
    rejectedBySlope: 0,
    overviewHidden: true
  });
}

function safeCapacity(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Owns one fixed-capacity instance pool. It never scans the entire Realm or
 * reallocates on camera frames; only a meaningful active-window transition
 * writes matrices/attributes. Wind advances a single material uniform.
 */
export function createRealmGrassLayer(options: CreateRealmGrassLayerOptions): RealmGrassLayer {
  const plan = options.plan;
  const capacity = safeCapacity(plan.maximumActiveInstances);
  const hexSize = Number.isFinite(options.hexSize) && options.hexSize! > 0 ? options.hexSize! : 1;
  const exclusionIndex = createRealmGrassExclusionIndex(options.exclusions ?? [], hexSize);
  const group = new THREE.Group();
  group.name = 'realm-procedural-biome-grass';
  const geometry = createLowPolyGrassGeometry(plan.geometryProfile);
  const materialLayer = createRealmGrassMaterial(
    plan.windStrengthMultiplier,
    !options.reducedMotion && plan.animationFrameCap > 0
  );
  const mesh = new THREE.InstancedMesh(geometry, materialLayer.material, Math.max(1, capacity));
  mesh.name = 'realm-procedural-biome-grass-clumps';
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  // Decorative blades must never intercept terrain/castle interaction rays.
  mesh.raycast = () => {};
  group.add(mesh);

  const phaseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1);
  const stiffnessAttribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1);
  const windScaleAttribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1);
  const cellAttribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 2), 2);
  const edgeFadeAttribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1);
  geometry.setAttribute('grassPhase', phaseAttribute);
  geometry.setAttribute('grassStiffness', stiffnessAttribute);
  geometry.setAttribute('grassWindScale', windScaleAttribute);
  geometry.setAttribute('grassCell', cellAttribute);
  geometry.setAttribute('grassEdgeFade', edgeFadeAttribute);

  const cache = createRealmGrassCellCache<RealmGrassCellData>(plan.cacheLimit);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let currentWindow: RealmGrassActiveWindow | null = null;
  let telemetry = emptyTelemetry(plan);
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
    mesh.computeBoundingBox();
    if (mesh.boundingBox) mesh.boundingBox.expandByScalar(REALM_GRASS_MAX_WIND_SWAY);
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += REALM_GRASS_MAX_WIND_SWAY;
  };

  const repack = (window: RealmGrassActiveWindow) => {
    if (window.overviewHidden || !plan.enabled || capacity === 0) {
      mesh.count = 0;
      group.visible = false;
      materialLayer.setVisible(false);
      telemetry = Object.freeze({
        ...emptyTelemetry(plan),
        cacheEntries: cache.size,
        overviewHidden: true
      });
      return;
    }
    const collector = createDeterministicBudgetCollector<PackedPoint>(capacity);
    let order = 0;
    let completelyBareActiveCells = 0;
    let rejectedByStructureClearance = 0;
    let rejectedBySlope = 0;
    window.cells.forEach((activeCell) => {
      // At zero fade the opaque geometry would collapse at ground level. Do
      // not spend cache/instance capacity on that invisible boundary ring.
      if (activeCell.edgeFade <= 0) return;
      const data = cellDataFor(activeCell.cell);
      if (data.completelyBare) completelyBareActiveCells += 1;
      rejectedByStructureClearance += data.rejectedByStructure + data.rejectedByExclusion;
      rejectedBySlope += data.rejectedBySlope;
      const distance = window.anchor ? hexDistance(window.anchor, data.coord) : 0;
      data.points.forEach((point) => {
        collector.add({
          value: Object.freeze({ point, edgeFade: activeCell.edgeFade, distance }),
          group: distance,
          rank: point.rank,
          order: order++
        });
      });
    });
    const packed = collector.values();
    const counts = emptyCounts();
    packed.forEach(({ point, edgeFade }, index) => {
      position.set(point.world.x, point.groundY + 0.002, point.world.z);
      rotation.setFromAxisAngle(axis, point.yaw);
      scale.set(point.width, point.height, point.width);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, tint.setRGB(point.tint.r, point.tint.g, point.tint.b));
      phaseAttribute.setX(index, point.windPhase);
      stiffnessAttribute.setX(index, point.stiffness);
      windScaleAttribute.setX(index, point.windScale);
      cellAttribute.setXY(index, point.coord.q, point.coord.r);
      edgeFadeAttribute.setX(index, edgeFade);
      counts[point.terrainKind] += 1;
    });
    mesh.count = packed.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    phaseAttribute.needsUpdate = true;
    stiffnessAttribute.needsUpdate = true;
    windScaleAttribute.needsUpdate = true;
    cellAttribute.needsUpdate = true;
    edgeFadeAttribute.needsUpdate = true;
    updateBounds();
    group.visible = packed.length > 0;
    materialLayer.setVisible(packed.length > 0);
    const trianglesPerClump = REALM_GRASS_TRIANGLES_PER_RIBBON * (
      plan.geometryProfile === 'high' ? 5 : plan.geometryProfile === 'balanced' ? 4 : 3
    );
    telemetry = Object.freeze({
      candidateCellCount: window.cells.length,
      activeCellCount: window.cells.length,
      instanceCount: packed.length,
      triangleCount: packed.length * trianglesPerClump,
      drawCalls: packed.length > 0 ? 1 : 0,
      cacheEntries: cache.size,
      animated: packed.length > 0 && plan.animationFrameCap > 0 && !options.reducedMotion,
      targetAnimationCadence: plan.animationFrameCap,
      countsByTerrain: Object.freeze(counts),
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
    updateView: (focus, mode) => {
      if (disposed) return false;
      const next = resolveRealmGrassActiveWindow(
        options.surface.renderMap,
        focus,
        mode,
        plan,
        hexSize
      );
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
      group.remove(mesh);
      mesh.dispose();
      geometry.dispose();
      materialLayer.dispose();
    }
  });
}
