import * as THREE from 'three';

import { createDeterministicBudgetCollector } from '../../game/map/deterministicBudget';
import type { RealmGrassPoint } from '../../game/map/realmGrass';
import { deriveChannelSeed, seededUnitFloat } from '../../game/map/realmSeed';
import { createRealmWildflowerGeometry, REALM_WILDFLOWER_TRIANGLES_PER_INSTANCE } from './createRealmWildflowerGeometry';
import {
  createRealmWildflowerMaterial,
  REALM_WILDFLOWER_MAX_WORLD_DEFORMATION_RADIUS
} from './createRealmWildflowerMaterial';
import type { RealmGrassRenderPlan } from './realmGrassActiveWindow';

export const REALM_WILDFLOWER_BUDGETS = Object.freeze({
  high: 512,
  balanced: 256,
  reduced: 0
} satisfies Readonly<Record<RealmGrassRenderPlan['geometryProfile'], number>>);

export type RealmWildflowerCandidate = Readonly<{
  point: RealmGrassPoint;
  nearCoverage: number;
  distance: number;
}>;

export type RealmWildflowerTelemetry = Readonly<{
  candidateCount: number;
  instanceCount: number;
  triangleCount: number;
  drawCalls: number;
  budget: number;
  animated: boolean;
  alphaHashActive: boolean;
  alphaToCoverageActive: boolean;
  shaderFallbackActive: boolean;
  shaderFallbackCount: number;
  shaderFallbackReason: string | null;
  overviewHidden: boolean;
}>;

export type RealmWildflowerLayer = Readonly<{
  mesh: THREE.InstancedMesh;
  beginRepack: (hidden: boolean) => void;
  addCandidate: (candidate: RealmWildflowerCandidate) => void;
  commitRepack: () => RealmWildflowerTelemetry;
  updateWind: (seconds: number) => boolean;
  activateShaderFallback: (reason: string) => void;
  getTelemetry: () => RealmWildflowerTelemetry;
  dispose: () => void;
}>;

const FLOWER_PALETTE = Object.freeze([
  Object.freeze({ r: 0.91, g: 0.52, b: 0.46 }),
  Object.freeze({ r: 0.91, g: 0.71, b: 0.38 }),
  Object.freeze({ r: 0.70, g: 0.58, b: 0.89 }),
  Object.freeze({ r: 0.94, g: 0.79, b: 0.72 })
]);

type SelectedFlower = Readonly<{
  candidate: RealmWildflowerCandidate;
  selectionRank: number;
}>;

function flowerChannel(point: RealmGrassPoint, channel: string) {
  return deriveChannelSeed(point.rank, point.coord.q, point.coord.r, channel, point.candidateIndex);
}

/** Independent flower stream derived from accepted ecology, not grass edge order. */
export function realmWildflowerSelectionRank(point: RealmGrassPoint) {
  return flowerChannel(point, 'realm-wildflower-selection-rank-v1') >>> 0;
}

export function isRealmWildflowerCandidate(point: RealmGrassPoint) {
  if (point.apron || point.snowCoverage >= 0.24 || point.sandCoverage >= 0.24) return false;
  const terrainRetention = point.terrainKind === 'meadow' ? 0.16
    : point.terrainKind === 'lowland' ? 0.10
      : point.terrainKind === 'heath' ? 0.08
        : point.terrainKind === 'forest' ? 0.035
          : 0;
  return seededUnitFloat(flowerChannel(point, 'realm-wildflower-retention-v1')) < terrainRetention;
}

function emptyTelemetry(
  budget: number,
  alphaToCoverage = false,
  hidden = true
): RealmWildflowerTelemetry {
  return Object.freeze({
    candidateCount: 0,
    instanceCount: 0,
    triangleCount: 0,
    drawCalls: 0,
    budget,
    animated: false,
    alphaHashActive: !alphaToCoverage,
    alphaToCoverageActive: alphaToCoverage,
    shaderFallbackActive: false,
    shaderFallbackCount: 0,
    shaderFallbackReason: null,
    overviewHidden: hidden
  });
}

export function createRealmWildflowerLayer(options: Readonly<{
  plan: RealmGrassRenderPlan;
  reducedMotion: boolean;
  alphaToCoverage?: boolean;
}>): RealmWildflowerLayer {
  const budget = REALM_WILDFLOWER_BUDGETS[options.plan.geometryProfile];
  let constructionGeometry: THREE.BufferGeometry | undefined;
  let constructionMaterial: ReturnType<typeof createRealmWildflowerMaterial> | undefined;
  let constructionMesh: THREE.InstancedMesh | undefined;
  try {
  const geometry = constructionGeometry = createRealmWildflowerGeometry();
  const materialLayer = constructionMaterial = createRealmWildflowerMaterial(
    options.reducedMotion ? 0 : options.plan.windStrengthMultiplier,
    options.alphaToCoverage ?? false
  );
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(budget), 1)
    .setUsage(THREE.DynamicDrawUsage);
  const windScale = new THREE.InstancedBufferAttribute(new Float32Array(budget), 1)
    .setUsage(THREE.DynamicDrawUsage);
  const coverage = new THREE.InstancedBufferAttribute(new Float32Array(budget), 1)
    .setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('flowerPhase', phase);
  geometry.setAttribute('flowerWindScale', windScale);
  geometry.setAttribute('flowerCoverage', coverage);
  const mesh = constructionMesh = new THREE.InstancedMesh(
    geometry,
    materialLayer.material,
    Math.max(1, budget)
  );
  mesh.name = 'realm-procedural-wildflower-accents';
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.raycast = () => {};
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const surfaceNormal = new THREE.Vector3();
  const surfaceRotation = new THREE.Quaternion();
  const yawRotation = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  let hidden = true;
  let candidateCount = 0;
  let order = 0;
  let collector = createDeterministicBudgetCollector<SelectedFlower>(budget);
  let telemetry = emptyTelemetry(budget, options.alphaToCoverage === true);
  let disposed = false;

  const beginRepack = (nextHidden: boolean) => {
    if (disposed) return;
    hidden = nextHidden || budget === 0;
    candidateCount = 0;
    order = 0;
    collector = createDeterministicBudgetCollector<SelectedFlower>(budget);
  };

  const layer: RealmWildflowerLayer = Object.freeze({
    mesh,
    beginRepack,
    addCandidate: (candidate) => {
      if (disposed || hidden || candidate.nearCoverage <= 0) return;
      if (!isRealmWildflowerCandidate(candidate.point)) return;
      candidateCount += 1;
      const selectionRank = realmWildflowerSelectionRank(candidate.point);
      collector.add({
        value: Object.freeze({ candidate, selectionRank }),
        group: candidate.distance,
        rank: selectionRank,
        order: order++
      });
    },
    commitRepack: () => {
      if (disposed || hidden) {
        mesh.count = 0;
        mesh.visible = false;
        materialLayer.setVisible(false);
        const shaderTelemetry = materialLayer.getShaderTelemetry();
        telemetry = Object.freeze({
          ...emptyTelemetry(budget, options.alphaToCoverage === true, true),
          shaderFallbackActive: shaderTelemetry.fallbackActive,
          shaderFallbackCount: shaderTelemetry.fallbackCount,
          shaderFallbackReason: shaderTelemetry.fallbackReason
        });
        return telemetry;
      }
      const selected = collector.values();
      selected.forEach(({ candidate, selectionRank }, index) => {
        const point = candidate.point;
        const height = point.height * (0.82 + seededUnitFloat(
          flowerChannel(point, 'realm-wildflower-height-v1')
        ) * 0.42);
        const width = Math.max(0.055, point.width * 0.24);
        position.set(point.world.x, point.groundY + 0.002, point.world.z);
        surfaceNormal.set(point.surfaceNormal.x, point.surfaceNormal.y, point.surfaceNormal.z).normalize();
        surfaceRotation.setFromUnitVectors(axis, surfaceNormal);
        yawRotation.setFromAxisAngle(surfaceNormal, seededUnitFloat(
          flowerChannel(point, 'realm-wildflower-yaw-v1')
        ) * Math.PI * 2);
        rotation.copy(yawRotation).multiply(surfaceRotation).normalize();
        scale.set(width, height, width);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);
        const palette = FLOWER_PALETTE[selectionRank % FLOWER_PALETTE.length]!;
        mesh.setColorAt(index, tint.setRGB(palette.r, palette.g, palette.b));
        phase.setX(index, point.windPhase);
        windScale.setX(index, point.windScale * 0.72);
        coverage.setX(index, candidate.nearCoverage);
      });
      mesh.count = selected.length;
      mesh.visible = selected.length > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor.needsUpdate = true;
      }
      phase.needsUpdate = true;
      windScale.needsUpdate = true;
      coverage.needsUpdate = true;
      mesh.computeBoundingBox();
      if (mesh.boundingBox) {
        mesh.boundingBox.expandByScalar(REALM_WILDFLOWER_MAX_WORLD_DEFORMATION_RADIUS);
      }
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) {
        mesh.boundingSphere.radius += REALM_WILDFLOWER_MAX_WORLD_DEFORMATION_RADIUS;
      }
      materialLayer.setVisible(selected.length > 0);
      const shaderTelemetry = materialLayer.getShaderTelemetry();
      const renderable = selected.length > 0 && !shaderTelemetry.fallbackActive;
      mesh.visible = renderable;
      telemetry = Object.freeze({
        candidateCount,
        instanceCount: renderable ? selected.length : 0,
        triangleCount: renderable
          ? selected.length * REALM_WILDFLOWER_TRIANGLES_PER_INSTANCE
          : 0,
        drawCalls: renderable ? 1 : 0,
        budget,
        animated: selected.length > 0 && !options.reducedMotion
          && options.plan.animationFrameCap > 0
          && !shaderTelemetry.fallbackActive,
        alphaHashActive: (materialLayer.material as THREE.MeshStandardMaterial & {
          alphaHash?: boolean;
        }).alphaHash === true,
        alphaToCoverageActive: (materialLayer.material as THREE.MeshStandardMaterial & {
          alphaToCoverage?: boolean;
        }).alphaToCoverage === true,
        shaderFallbackActive: shaderTelemetry.fallbackActive,
        shaderFallbackCount: shaderTelemetry.fallbackCount,
        shaderFallbackReason: shaderTelemetry.fallbackReason,
        overviewHidden: false
      });
      return telemetry;
    },
    updateWind: (seconds) => !disposed && telemetry.animated && materialLayer.setTime(seconds),
    activateShaderFallback: (reason) => {
      if (disposed) return;
      materialLayer.activateShaderFallback(reason);
      mesh.visible = false;
    },
    getTelemetry: () => {
      const shaderTelemetry = materialLayer.getShaderTelemetry();
      if (shaderTelemetry.fallbackActive) mesh.visible = false;
      if (
        telemetry.shaderFallbackActive === shaderTelemetry.fallbackActive
        && telemetry.shaderFallbackCount === shaderTelemetry.fallbackCount
        && telemetry.shaderFallbackReason === shaderTelemetry.fallbackReason
      ) return telemetry;
      telemetry = Object.freeze({
        ...telemetry,
        animated: telemetry.animated && !shaderTelemetry.fallbackActive,
        instanceCount: shaderTelemetry.fallbackActive ? 0 : telemetry.instanceCount,
        triangleCount: shaderTelemetry.fallbackActive ? 0 : telemetry.triangleCount,
        drawCalls: shaderTelemetry.fallbackActive ? 0 : telemetry.drawCalls,
        shaderFallbackActive: shaderTelemetry.fallbackActive,
        shaderFallbackCount: shaderTelemetry.fallbackCount,
        shaderFallbackReason: shaderTelemetry.fallbackReason
      });
      return telemetry;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      geometry.dispose();
      materialLayer.dispose();
    }
  });
  constructionMesh = undefined;
  constructionGeometry = undefined;
  constructionMaterial = undefined;
  return layer;
  } catch (error) {
    constructionMesh?.dispose();
    constructionGeometry?.dispose();
    constructionMaterial?.dispose();
    throw error;
  }
}
