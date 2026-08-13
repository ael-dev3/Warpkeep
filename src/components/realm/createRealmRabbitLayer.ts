import * as THREE from 'three';

import { loadRealmRabbitAsset, type RealmRabbitPrefab } from './loadRealmRabbitAsset';
import { REALM_RABBIT_RUNTIME_ASSET } from './realmRabbitRuntimeAsset';

export type RealmRabbitTelemetry = Readonly<{
  enabled: boolean;
  assetReady: boolean;
  overviewHidden: boolean;
  instanceCapacity: number;
  instanceCount: number;
  drawCalls: number;
  triangleCount: number;
  loadFallbackCount: number;
}>;

export type RealmRabbitLayer = Readonly<{
  group: THREE.Group;
  update: (
    elapsedSeconds: number,
    focus: Readonly<{ x: number; z: number }>,
    mode: 'realm' | 'approach' | 'keep'
  ) => boolean;
  isAnimationActive: () => boolean;
  getTelemetry: () => RealmRabbitTelemetry;
  dispose: () => void;
}>;

export type CreateRealmRabbitLayerOptions = Readonly<{
  instanceCount: number;
  baseUrl: string;
  heightAtWorld: (world: Readonly<{ x: number; z: number }>) => number;
  isHabitat?: (world: Readonly<{ x: number; z: number }>) => boolean;
  frozenVisualTimeSeconds?: number;
  onModelReady?: () => void;
  /** Test seam; production uses the loader's bounded default. */
  requestTimeoutMs?: number;
}>;

const ANCHOR_STEP = 3;
const HOME_ATTEMPTS = 12;
const MODEL_SCALE = 1.28;

function hashUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 71.417 + salt * 39.133) * 43_758.5453;
  return value - Math.floor(value);
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function createRealmRabbitLayer(
  options: CreateRealmRabbitLayerOptions
): RealmRabbitLayer {
  const capacity = Math.max(0, Math.min(16, Math.trunc(finite(options.instanceCount))));
  const group = new THREE.Group();
  group.name = 'realm-living-lowlands-rabbits';
  group.visible = false;
  const homesX = new Float32Array(capacity);
  const homesZ = new Float32Array(capacity);
  const abortController = new AbortController();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let prefab: RealmRabbitPrefab | null = null;
  let rabbitMesh: THREE.InstancedMesh | null = null;
  let rabbitMaterial: THREE.Material | null = null;
  let disposed = false;
  let overviewHidden = true;
  let assetReady = false;
  let activeCount = 0;
  let loadFallbackCount = 0;
  let lastAnchorX = Number.NaN;
  let lastAnchorZ = Number.NaN;
  let lastElapsedSeconds = 0;
  let lastFocusX = 0;
  let lastFocusZ = 0;
  let lastMode: 'realm' | 'approach' | 'keep' = 'realm';

  const visualTime = (elapsedSeconds: number) => Number.isFinite(
    options.frozenVisualTimeSeconds
  )
    ? Math.max(0, options.frozenVisualTimeSeconds!)
    : Math.max(0, finite(elapsedSeconds));

  const notifyModelReady = () => {
    try {
      options.onModelReady?.();
    } catch {
      // The optional notification cannot change asset or scene truth.
    }
  };

  const resolveHomes = (anchorX: number, anchorZ: number) => {
    activeCount = 0;
    const anchorSeed = Math.round(anchorX / ANCHOR_STEP) * 97
      + Math.round(anchorZ / ANCHOR_STEP) * 193;
    for (let index = 0; index < capacity; index += 1) {
      for (let attempt = 0; attempt < HOME_ATTEMPTS; attempt += 1) {
        const seedIndex = anchorSeed + index * HOME_ATTEMPTS + attempt;
        const angle = hashUnit(seedIndex, 3) * Math.PI * 2;
        const radius = 0.9 + hashUnit(seedIndex, 5) * 3.6;
        const world = {
          x: anchorX + Math.cos(angle) * radius,
          z: anchorZ + Math.sin(angle) * radius
        };
        if (options.isHabitat && !options.isHabitat(world)) continue;
        homesX[activeCount] = world.x;
        homesZ[activeCount] = world.z;
        activeCount += 1;
        break;
      }
    }
    if (rabbitMesh) rabbitMesh.count = activeCount;
  };

  const updateMatrices = (time: number) => {
    if (!rabbitMesh) return;
    for (let index = 0; index < activeCount; index += 1) {
      const phase = (time * (0.34 + hashUnit(index, 7) * 0.12)
        + hashUnit(index, 8)) % 1;
      const hopWindow = phase < 0.62 ? phase / 0.62 : 0;
      const stride = phase < 0.62 ? Math.sin(hopWindow * Math.PI * 2) * 0.11 : 0;
      const hop = phase < 0.62
        ? Math.max(0, Math.sin(hopWindow * Math.PI * 2)) * 0.052
        : 0;
      const heading = hashUnit(index, 9) * Math.PI * 2
        + Math.sin(time * 0.08 + index) * 0.28;
      const x = homesX[index]! + Math.sin(heading) * stride;
      const z = homesZ[index]! + Math.cos(heading) * stride;
      const groundY = finite(options.heightAtWorld({ x, z }));
      position.set(x, groundY + hop, z);
      rotation.setFromAxisAngle(up, heading);
      const individualScale = MODEL_SCALE * (0.92 + hashUnit(index, 10) * 0.16);
      const hopStretch = hop / 0.052;
      scale.set(
        individualScale * (1 - hopStretch * 0.035),
        individualScale * (1 + hopStretch * 0.07),
        individualScale * (1 - hopStretch * 0.035)
      );
      matrix.compose(position, rotation, scale);
      rabbitMesh.setMatrixAt(index, matrix);
    }
    rabbitMesh.instanceMatrix.needsUpdate = true;
  };

  const update = (
    elapsedSeconds: number,
    focus: Readonly<{ x: number; z: number }>,
    mode: 'realm' | 'approach' | 'keep'
  ) => {
    if (disposed || capacity === 0) return false;
    const time = visualTime(elapsedSeconds);
    const focusX = finite(focus.x);
    const focusZ = finite(focus.z);
    const anchorX = Math.round(focusX / ANCHOR_STEP) * ANCHOR_STEP;
    const anchorZ = Math.round(focusZ / ANCHOR_STEP) * ANCHOR_STEP;
    const nextOverviewHidden = mode === 'realm';
    const changed = time !== lastElapsedSeconds
      || nextOverviewHidden !== overviewHidden
      || anchorX !== lastAnchorX
      || anchorZ !== lastAnchorZ;
    lastElapsedSeconds = time;
    lastFocusX = focusX;
    lastFocusZ = focusZ;
    lastMode = mode;
    overviewHidden = nextOverviewHidden;
    if (anchorX !== lastAnchorX || anchorZ !== lastAnchorZ) {
      lastAnchorX = anchorX;
      lastAnchorZ = anchorZ;
      resolveHomes(anchorX, anchorZ);
    }
    group.visible = assetReady && !overviewHidden && activeCount > 0;
    if (group.visible) updateMatrices(time);
    return changed;
  };

  if (capacity > 0) {
    void loadRealmRabbitAsset({
      baseUrl: options.baseUrl,
      signal: abortController.signal,
      requestTimeoutMs: options.requestTimeoutMs
    }).then((loaded) => {
      if (disposed) {
        loaded.release();
        return;
      }
      let nextMaterial: THREE.Material | null = null;
      let nextMesh: THREE.InstancedMesh | null = null;
      try {
        nextMaterial = loaded.material.clone();
        nextMaterial.name = 'realm-lowlands-rabbit-compact-material';
        nextMesh = new THREE.InstancedMesh(
          loaded.geometry,
          nextMaterial,
          capacity
        );
        nextMesh.name = 'realm-lowlands-rabbit-compact-instances';
        nextMesh.count = 0;
        nextMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        nextMesh.frustumCulled = false;
        nextMesh.castShadow = false;
        nextMesh.receiveShadow = false;
        nextMesh.raycast = () => {};
        prefab = loaded;
        rabbitMaterial = nextMaterial;
        rabbitMesh = nextMesh;
        group.add(nextMesh);
        assetReady = true;
        update(lastElapsedSeconds, { x: lastFocusX, z: lastFocusZ }, lastMode);
      } catch (error) {
        nextMesh?.removeFromParent();
        try {
          nextMesh?.dispose();
        } catch {
          // Continue retiring the independently owned material and prefab.
        }
        try {
          nextMaterial?.dispose();
        } catch {
          // Continue retiring the verified source prefab.
        }
        try {
          loaded.release();
        } catch {
          // Preserve the adoption failure; no source resource may stay live.
        }
        if (prefab === loaded) prefab = null;
        if (rabbitMaterial === nextMaterial) rabbitMaterial = null;
        if (rabbitMesh === nextMesh) rabbitMesh = null;
        assetReady = false;
        activeCount = 0;
        group.visible = false;
        throw error;
      }
      notifyModelReady();
    }).catch(() => {
      if (disposed || abortController.signal.aborted) return;
      loadFallbackCount += 1;
      notifyModelReady();
    });
  }

  return Object.freeze({
    group,
    update,
    isAnimationActive: () => (
      !disposed && assetReady && !overviewHidden && activeCount > 0
    ),
    getTelemetry: () => Object.freeze({
      enabled: !disposed && capacity > 0,
      assetReady: !disposed && assetReady,
      overviewHidden,
      instanceCapacity: disposed ? 0 : capacity,
      instanceCount: disposed || overviewHidden || !assetReady ? 0 : activeCount,
      drawCalls: disposed || overviewHidden || !assetReady || activeCount === 0 ? 0 : 1,
      triangleCount: disposed || overviewHidden || !assetReady
        ? 0
        : activeCount * REALM_RABBIT_RUNTIME_ASSET.triangles,
      loadFallbackCount
    }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      abortController.abort();
      group.clear();
      try {
        rabbitMesh?.dispose();
      } catch {
        // Continue retiring independent Rabbit GPU resources.
      }
      try {
        rabbitMaterial?.dispose();
      } catch {
        // Continue retiring the verified source prefab.
      }
      try {
        prefab?.release();
      } catch {
        // Scene cleanup remains idempotent even on browser disposal failure.
      }
      prefab = null;
      rabbitMesh = null;
      rabbitMaterial = null;
      assetReady = false;
      activeCount = 0;
    }
  });
}
