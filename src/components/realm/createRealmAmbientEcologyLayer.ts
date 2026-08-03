import * as THREE from 'three';

import type { RealmLivingRealmBudget } from './realmQuality';
import type { RealmSurfaceDisturbanceSnapshot } from './realmSurfaceDisturbanceField';

export type RealmAmbientEcologyTelemetry = Readonly<{
  enabled: boolean;
  animated: boolean;
  overviewHidden: boolean;
  birdCount: number;
  moteCount: number;
  transientParticleCount: number;
  transientParticleCapacity: number;
  drawCalls: number;
  triangleCount: number;
  plannerHz: number;
  plannerTickCount: number;
}>;

export type RealmAmbientEcologyLayer = Readonly<{
  group: THREE.Group;
  update: (
    elapsedSeconds: number,
    focus: Readonly<{ x: number; y?: number; z: number }>,
    mode: 'realm' | 'approach' | 'keep',
    disturbances?: RealmSurfaceDisturbanceSnapshot | null
  ) => boolean;
  isAnimationActive: () => boolean;
  getTelemetry: () => RealmAmbientEcologyTelemetry;
  dispose: () => void;
}>;

export type CreateRealmAmbientEcologyLayerOptions = Readonly<{
  budget: RealmLivingRealmBudget;
  /** Deterministic rendered-QA seam; production follows scheduler elapsed time. */
  frozenVisualTimeSeconds?: number;
}>;

const BIRD_TRIANGLES = 2;

function birdGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.1,
    -0.3, 0.02, -0.08,
    -0.04, 0, -0.02,
    0, 0, 0.1,
    0.04, 0, -0.02,
    0.3, 0.02, -0.08
  ], 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function hashUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 91.733 + salt * 47.119) * 43_758.5453;
  return value - Math.floor(value);
}

export function createRealmAmbientEcologyLayer(
  options: CreateRealmAmbientEcologyLayerOptions
): RealmAmbientEcologyLayer {
  const budget = options.budget;
  const group = new THREE.Group();
  group.name = 'realm-living-ambient-ecology';
  group.visible = false;
  const enabled = budget.birdInstances > 0
    || budget.moteCount > 0
    || budget.transientParticleCount > 0;
  let birdMesh: THREE.InstancedMesh | undefined;
  let birdMaterial: THREE.MeshBasicMaterial | undefined;
  let birds: THREE.BufferGeometry | undefined;
  let pointCloud: THREE.Points | undefined;
  let pointMaterial: THREE.PointsMaterial | undefined;
  let points: THREE.BufferGeometry | undefined;
  let pointPositions: THREE.BufferAttribute | undefined;
  if (budget.birdInstances > 0) {
    birds = birdGeometry();
    birdMaterial = new THREE.MeshBasicMaterial({
      color: '#53655a',
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      fog: true,
      toneMapped: true
    });
    birdMesh = new THREE.InstancedMesh(
      birds,
      birdMaterial,
      budget.birdInstances
    );
    birdMesh.name = 'realm-living-birds';
    birdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    birdMesh.frustumCulled = false;
    birdMesh.raycast = () => {};
    group.add(birdMesh);
  }
  const pointCapacity = budget.moteCount + budget.transientParticleCount;
  if (pointCapacity > 0) {
    points = new THREE.BufferGeometry();
    pointPositions = new THREE.BufferAttribute(
      new Float32Array(pointCapacity * 3),
      3
    );
    pointPositions.setUsage(THREE.DynamicDrawUsage);
    points.setAttribute('position', pointPositions);
    points.setDrawRange(0, 0);
    points.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 16);
    pointMaterial = new THREE.PointsMaterial({
      color: '#f1d486',
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      fog: true,
      toneMapped: true
    });
    pointCloud = new THREE.Points(points, pointMaterial);
    pointCloud.name = 'realm-living-motes-and-transients';
    pointCloud.frustumCulled = false;
    pointCloud.raycast = () => {};
    group.add(pointCloud);
  }
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let disposed = false;
  let overviewHidden = true;
  let lastTime = -1;
  let lastFocusX = Number.NaN;
  let lastFocusY = Number.NaN;
  let lastFocusZ = Number.NaN;
  let lastPlannerSeconds = Number.NEGATIVE_INFINITY;
  let plannerTickCount = 0;
  let transientParticleCount = 0;

  const visualTime = (elapsedSeconds: number) => Number.isFinite(
    options.frozenVisualTimeSeconds
  )
    ? Math.max(0, options.frozenVisualTimeSeconds!)
    : Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);

  const telemetry = (): RealmAmbientEcologyTelemetry => Object.freeze({
    enabled: enabled && !disposed,
    animated: enabled && !disposed && !overviewHidden,
    overviewHidden,
    birdCount: disposed || overviewHidden ? 0 : budget.birdInstances,
    moteCount: disposed || overviewHidden ? 0 : budget.moteCount,
    transientParticleCount: disposed || overviewHidden ? 0 : transientParticleCount,
    transientParticleCapacity: disposed ? 0 : budget.transientParticleCount,
    drawCalls: disposed || overviewHidden
      ? 0
      : Number(budget.birdInstances > 0) + Number(pointCapacity > 0),
    triangleCount: disposed || overviewHidden
      ? 0
      : budget.birdInstances * BIRD_TRIANGLES,
    plannerHz: budget.plannerHz,
    plannerTickCount
  });

  return Object.freeze({
    group,
    update: (elapsedSeconds, focus, mode, disturbances = null) => {
      if (disposed || !enabled) return false;
      const time = visualTime(elapsedSeconds);
      const focusX = Number.isFinite(focus.x) ? focus.x : 0;
      const focusY = Number.isFinite(focus.y) ? focus.y! : 0;
      const focusZ = Number.isFinite(focus.z) ? focus.z : 0;
      const nextOverviewHidden = mode === 'realm';
      const changed = nextOverviewHidden !== overviewHidden
        || time !== lastTime
        || focusX !== lastFocusX
        || focusY !== lastFocusY
        || focusZ !== lastFocusZ;
      overviewHidden = nextOverviewHidden;
      group.visible = !overviewHidden;
      if (overviewHidden) {
        lastTime = time;
        lastFocusX = focusX;
        lastFocusY = focusY;
        lastFocusZ = focusZ;
        transientParticleCount = 0;
        return changed;
      }
      if (budget.plannerHz > 0 && time - lastPlannerSeconds >= 1 / budget.plannerHz) {
        lastPlannerSeconds = time;
        plannerTickCount += 1;
      }
      if (birdMesh) {
        for (let index = 0; index < budget.birdInstances; index += 1) {
          const lane = index % 3;
          const orbit = time * (0.12 + lane * 0.018) + hashUnit(index, 2) * Math.PI * 2;
          const radius = 2.8 + hashUnit(index, 3) * 3.6;
          position.set(
            focusX + Math.cos(orbit) * radius,
            focusY + 1.15 + hashUnit(index, 4) * 0.72 + Math.sin(time * 0.8 + index) * 0.08,
            focusZ + Math.sin(orbit) * radius
          );
          rotation.setFromAxisAngle(up, -orbit + Math.PI * 0.5);
          const flap = 0.82 + Math.sin(time * 4.2 + index * 1.7) * 0.12;
          scale.set(flap, 1, 0.82);
          matrix.compose(position, rotation, scale);
          birdMesh.setMatrixAt(index, matrix);
        }
        birdMesh.instanceMatrix.needsUpdate = true;
      }
      transientParticleCount = Math.min(
        budget.transientParticleCount,
        Math.max(0, Math.trunc(disturbances?.count ?? 0)) * 12
      );
      if (points && pointPositions) {
        for (let index = 0; index < budget.moteCount; index += 1) {
          const angle = hashUnit(index, 11) * Math.PI * 2 + time * 0.035;
          const radius = 0.8 + hashUnit(index, 12) * 4.8;
          pointPositions.setXYZ(
            index,
            focusX + Math.cos(angle) * radius,
            focusY + 0.12 + hashUnit(index, 13) * 0.72
              + Math.sin(time * 0.48 + index) * 0.06,
            focusZ + Math.sin(angle) * radius
          );
        }
        for (let index = 0; index < transientParticleCount; index += 1) {
          const sourceCount = Math.max(1, Math.trunc(disturbances?.count ?? 0));
          const source = index % sourceCount;
          const centerX = disturbances?.centers[source * 2] ?? focusX;
          const centerZ = disturbances?.centers[source * 2 + 1] ?? focusZ;
          const age = disturbances?.params[source * 4 + 2] ?? 0;
          const angle = hashUnit(index, 21) * Math.PI * 2;
          const radius = (0.08 + hashUnit(index, 22) * 0.5) * (0.3 + age);
          pointPositions.setXYZ(
            budget.moteCount + index,
            centerX + Math.cos(angle) * radius,
            focusY + 0.035 + hashUnit(index, 23) * 0.16 + age * 0.12,
            centerZ + Math.sin(angle) * radius
          );
        }
        points.setDrawRange(0, budget.moteCount + transientParticleCount);
        pointPositions.needsUpdate = true;
      }
      lastTime = time;
      lastFocusX = focusX;
      lastFocusY = focusY;
      lastFocusZ = focusZ;
      return changed || transientParticleCount > 0;
    },
    isAnimationActive: () => enabled && !disposed && !overviewHidden,
    getTelemetry: telemetry,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      group.clear();
      birds?.dispose();
      birdMaterial?.dispose();
      points?.dispose();
      pointMaterial?.dispose();
    }
  });
}
