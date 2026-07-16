import * as THREE from 'three';

import type { HexCoord } from '../../game/map/hexCoordinates';
import {
  CASTLE_LODS,
  packCastleInstances,
  type CastleInstancePacking,
  type CastleLod,
  type CastleLodPolicy,
  type CastleLodState
} from './castleInstancePlanning';
import type { HegemonyKeepPrefab } from './hegemonyKeepPrefabRepository';

export const CASTLE_GROUND_LIFT = 0.006;

export type RealmCastleInstanceRecord = Readonly<{
  castleId: number;
  coord: HexCoord;
  x: number;
  groundY: number;
  z: number;
}>;

export type RealmCastleInstanceHit = Readonly<{
  castleId: number;
  coord: HexCoord;
}>;

/**
 * Live evidence derived from the populated InstancedMesh buckets themselves.
 * These counts intentionally do not trust the requested presentation mask.
 */
export type RealmCastleInstancePresentationTelemetry = Readonly<{
  presentedModelCount: number;
  presentedLandscapeBaseCount: number;
  raycastTargetCount: number;
}>;

export type RealmCastleInstanceLayer = Readonly<{
  group: THREE.Group;
  /** Repack visible castles when screen-space LOD or frustum membership changes. */
  update: (
    camera: THREE.PerspectiveCamera,
    viewportHeight: number,
    selectedCastleId?: number
  ) => void;
  /**
   * Exact castle identities intersecting the live instance-layer frustum on
   * the latest update, before the presentation mask is applied. The immutable
   * snapshot lets the DOM projection lane follow the same visibility test
   * without making a prior label mask prevent a newly entering castle.
   */
  getFrustumVisibleCastleIds: () => readonly number[];
  /**
   * Limits rendering and raycasting to the current viewport presentation set.
   * Direct identity labels derive membership from the separate pre-mask
   * frustum snapshot. `null` is the initialization state before the first
   * projection frame.
   */
  setPresentedCastleIds: (castleIds: readonly number[] | null) => void;
  /** Raycasts only castle instances. Terrain fallback belongs to the scene. */
  raycast: (raycaster: THREE.Raycaster) => RealmCastleInstanceHit | null;
  /** Detaches instance nodes without disposing repository-owned resources. */
  clear: () => void;
  /** Releases only layer-owned accents; prefab leases remain scene-owned. */
  dispose: () => void;
  getPacking: () => CastleInstancePacking<RealmCastleInstanceRecord>;
  getPresentationTelemetry: () => RealmCastleInstancePresentationTelemetry;
  /** Validates exact castle/base identity, LOD, and placement correspondence. */
  hasExactCastleLandscapeBasePairing: () => boolean;
}>;

export type CreateRealmCastleInstanceLayerOptions = Readonly<{
  castles: readonly RealmCastleInstanceRecord[];
  prefabs: ReadonlyMap<CastleLod, HegemonyKeepPrefab>;
  policy: CastleLodPolicy;
  dynamicShadows: boolean;
}>;

type LodMeshes = Readonly<{
  lod: CastleLod;
  meshes: readonly THREE.InstancedMesh[];
  localMatrices: readonly THREE.Matrix4[];
  roles: readonly ('castle' | 'landscape-base')[];
}>;

function projectedDiameterPixels(
  camera: THREE.PerspectiveCamera,
  center: THREE.Vector3,
  radius: number,
  viewportHeight: number
) {
  const distance = Math.max(radius, center.distanceTo(camera.position));
  const halfFovRadians = THREE.MathUtils.degToRad(camera.fov * 0.5);
  return radius * Math.max(1, viewportHeight)
    / Math.max(0.001, distance * Math.tan(halfFovRadians));
}

/**
 * A footprint diameter bounds each horizontal axis, not their diagonal. The
 * conservative sphere therefore includes two horizontal half-extents plus
 * the vertical half-extent so edge castles cannot disappear prematurely.
 */
export function castleFrustumRadius(footprintDiameter: number, visualHeight: number) {
  const halfFootprint = Math.max(0, footprintDiameter) * 0.5;
  const halfHeight = Math.max(0, visualHeight) * 0.5;
  return Math.hypot(halfFootprint, halfFootprint, halfHeight);
}

function packingKey(packing: CastleInstancePacking<RealmCastleInstanceRecord>) {
  return CASTLE_LODS.map((lod) => (
    `${lod}:${packing.buckets[lod].map((entry) => entry.castleId).join(',')}`
  )).join('|');
}

function materialArgument(materials: readonly THREE.Material[]) {
  return materials.length === 1 ? materials[0] : [...materials];
}

function approximatelyEqualMatrix(
  left: THREE.Matrix4,
  right: THREE.Matrix4,
  epsilon = 2e-5
) {
  return left.elements.every((value, index) => {
    const other = right.elements[index] ?? Number.NaN;
    return Number.isFinite(value)
      && Number.isFinite(other)
      && Math.abs(value - other) <= epsilon * Math.max(1, Math.abs(value), Math.abs(other));
  });
}

function requirePrefab(
  prefabs: ReadonlyMap<CastleLod, HegemonyKeepPrefab>,
  lod: CastleLod
) {
  const prefab = prefabs.get(lod);
  if (!prefab) throw new Error(`Missing Hegemony keep ${lod} prefab.`);
  return prefab;
}

/**
 * Builds a scene-lifetime instance layer. Prefab geometry and materials remain
 * repository-owned: clear() only removes references so one final lease release
 * can dispose each shared GPU resource exactly once.
 */
export function createRealmCastleInstanceLayer(
  options: CreateRealmCastleInstanceLayerOptions
): RealmCastleInstanceLayer {
  const orderedCastles = [...options.castles].sort((left, right) => (
    left.castleId - right.castleId
  ));
  const castleById = new Map<number, RealmCastleInstanceRecord>();
  orderedCastles.forEach((castle) => {
    if (!Number.isSafeInteger(castle.castleId) || castle.castleId < 0) {
      throw new Error(`Invalid castle ID: ${castle.castleId}.`);
    }
    if (castleById.has(castle.castleId)) {
      throw new Error(`Duplicate castle ID: ${castle.castleId}.`);
    }
    castleById.set(castle.castleId, castle);
  });

  // Compact is the fail-closed base of every policy; higher ceilings require
  // all intermediate LODs so hysteresis can never select an absent prefab.
  requirePrefab(options.prefabs, 'compact');
  if (options.policy.maximumLod !== 'compact') requirePrefab(options.prefabs, 'balanced');
  if (options.policy.maximumLod === 'high') requirePrefab(options.prefabs, 'high');

  const group = new THREE.Group();
  group.name = 'hegemony-castle-instance-layer';
  const capacity = orderedCastles.length;
  const meshOwners = new Map<THREE.InstancedMesh, Readonly<{
    lod: CastleLod;
    role: 'castle' | 'landscape-base';
  }>>();
  const meshesByLod = new Map<CastleLod, LodMeshes>();

  CASTLE_LODS.forEach((lod) => {
    const prefab = options.prefabs.get(lod);
    if (!prefab) return;
    const meshes: THREE.InstancedMesh[] = [];
    const localMatrices: THREE.Matrix4[] = [];
    const roles: Array<'castle' | 'landscape-base'> = [];
    prefab.primitives.forEach((primitive, primitiveIndex) => {
      const role = primitive.role === 'landscape-base' ? 'landscape-base' : 'castle';
      const mesh = new THREE.InstancedMesh(
        primitive.geometry,
        materialArgument(primitive.materials),
        capacity
      );
      mesh.name = role === 'landscape-base'
        ? `hegemony-castle-landscape-bases-${lod}-${primitiveIndex}`
        : `hegemony-castles-${lod}-${primitiveIndex}`;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = options.dynamicShadows;
      mesh.receiveShadow = options.dynamicShadows;
      // Visibility is packed per castle below. Aggregate InstancedMesh bounds
      // must not make the renderer cull a bucket whose instances moved.
      mesh.frustumCulled = false;
      meshOwners.set(mesh, Object.freeze({ lod, role }));
      meshes.push(mesh);
      localMatrices.push(new THREE.Matrix4().fromArray(primitive.localMatrixElements));
      roles.push(role);
      group.add(mesh);
    });
    meshesByLod.set(lod, Object.freeze({
      lod,
      meshes: Object.freeze(meshes),
      localMatrices: Object.freeze(localMatrices),
      roles: Object.freeze(roles)
    }));
  });

  const hasCompleteLandscapeBaseFamily = [...options.prefabs.values()].every((prefab) => (
    prefab.landscapeBasePrimitiveCount > 0
  ));

  const contactShadowGeometry = new THREE.CircleGeometry(1, 28);
  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    color: '#283020',
    opacity: options.dynamicShadows ? 0.075 : 0.16,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const contactShadows = new THREE.InstancedMesh(
    contactShadowGeometry,
    contactShadowMaterial,
    capacity
  );
  contactShadows.name = 'hegemony-castle-contact-shadows';
  contactShadows.count = 0;
  contactShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  contactShadows.frustumCulled = false;
  contactShadows.renderOrder = 1;
  if (!hasCompleteLandscapeBaseFamily) group.add(contactShadows);

  // The decorative island mesh is deliberately not a physics collider. A
  // simple, non-rendered oval keeps the whole authored base clickable without
  // letting trees, flowers, or overlapping triangle detail steal identity.
  const baseColliderGeometry = new THREE.CylinderGeometry(1, 1, 1, 24);
  const baseColliderMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const baseColliders = new THREE.InstancedMesh(
    baseColliderGeometry,
    baseColliderMaterial,
    capacity
  );
  baseColliders.name = 'hegemony-castle-landscape-base-pick-volumes';
  baseColliders.count = 0;
  baseColliders.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  baseColliders.frustumCulled = false;
  baseColliders.updateMatrixWorld(true);
  const baseColliderCastleIds: number[] = [];

  const loadedPrefabs = [...options.prefabs.values()];
  const maximumFootprint = Math.max(...loadedPrefabs.map((prefab) => prefab.footprintDiameter));
  const maximumHeight = Math.max(...loadedPrefabs.map((prefab) => prefab.visualHeight));
  const castleRadius = castleFrustumRadius(maximumFootprint, maximumHeight);
  const renderBounds = loadedPrefabs.reduce((bounds, prefab) => {
    const local = prefab.renderProjectionEnvelope.localBounds;
    return {
      minX: Math.min(bounds.minX, local.minX),
      minY: Math.min(bounds.minY, local.minY),
      minZ: Math.min(bounds.minZ, local.minZ),
      maxX: Math.max(bounds.maxX, local.maxX),
      maxY: Math.max(bounds.maxY, local.maxY),
      maxZ: Math.max(bounds.maxZ, local.maxZ)
    };
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  });
  const renderCenterOffset = new THREE.Vector3(
    (renderBounds.minX + renderBounds.maxX) * 0.5,
    (renderBounds.minY + renderBounds.maxY) * 0.5,
    (renderBounds.minZ + renderBounds.maxZ) * 0.5
  );
  const renderRadius = Math.hypot(
    (renderBounds.maxX - renderBounds.minX) * 0.5,
    (renderBounds.maxY - renderBounds.minY) * 0.5,
    (renderBounds.maxZ - renderBounds.minZ) * 0.5
  );
  const center = new THREE.Vector3();
  const sphere = new THREE.Sphere(center, castleRadius);
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const placementMatrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const shadowPosition = new THREE.Vector3();
  const shadowRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2
  );
  const colliderRotation = new THREE.Quaternion();
  const shadowScale = new THREE.Vector3();
  let previousLods: CastleLodState = Object.freeze({});
  let lastPackingKey = '';
  let cleared = false;
  let disposed = false;
  let packing = packCastleInstances<RealmCastleInstanceRecord>([], {
    policy: options.policy
  });
  let frustumVisibleCastleIds: readonly number[] = Object.freeze([]);
  let presentedCastleIds: ReadonlySet<number> | null = null;
  let presentedCastleKey = '*';

  const update = (
    camera: THREE.PerspectiveCamera,
    viewportHeight: number,
    selectedCastleId?: number
  ) => {
    if (cleared) return;
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);

    const nextFrustumVisibleCastleIds: number[] = [];
    packing = packCastleInstances(orderedCastles.map((castle) => {
      center.set(castle.x, castle.groundY + maximumHeight * 0.5, castle.z);
      const cameraDistance = center.distanceTo(camera.position);
      sphere.center.set(
        castle.x + renderCenterOffset.x,
        castle.groundY + CASTLE_GROUND_LIFT + renderCenterOffset.y,
        castle.z + renderCenterOffset.z
      );
      sphere.radius = renderRadius;
      const visibleInFrustum = frustum.intersectsSphere(sphere);
      if (visibleInFrustum) nextFrustumVisibleCastleIds.push(castle.castleId);
      return {
        castleId: castle.castleId,
        projectedDiameterPixels: projectedDiameterPixels(
          camera,
          center,
          castleRadius,
          viewportHeight
        ),
        cameraDistance,
        visible: visibleInFrustum
          && (presentedCastleIds === null || presentedCastleIds.has(castle.castleId)),
        data: castle
      };
    }), {
      policy: options.policy,
      previousLods,
      selectedCastleId
    });
    // Replace rather than mutate the published snapshot. Consumers can retain
    // one frame safely while this layer evaluates the next camera position.
    frustumVisibleCastleIds = Object.freeze(nextFrustumVisibleCastleIds);
    previousLods = packing.lodByCastleId;

    const nextPackingKey = packingKey(packing);
    if (nextPackingKey === lastPackingKey) return;
    lastPackingKey = nextPackingKey;

    CASTLE_LODS.forEach((lod) => {
      const lodMeshes = meshesByLod.get(lod);
      if (!lodMeshes) return;
      const bucket = packing.buckets[lod];
      lodMeshes.meshes.forEach((mesh, primitiveIndex) => {
        bucket.forEach((entry) => {
          placementMatrix.makeTranslation(
            entry.data.x,
            entry.data.groundY + CASTLE_GROUND_LIFT,
            entry.data.z
          );
          instanceMatrix.multiplyMatrices(
            placementMatrix,
            lodMeshes.localMatrices[primitiveIndex]
          );
          mesh.setMatrixAt(entry.instanceId, instanceMatrix);
        });
        mesh.count = bucket.length;
        mesh.instanceMatrix.needsUpdate = true;
        // Raycasting uses the aggregate sphere even though render culling is
        // manual. Refresh it after every deterministic repack.
        mesh.computeBoundingSphere();
      });
    });

    let shadowInstanceId = 0;
    if (!hasCompleteLandscapeBaseFamily) {
      CASTLE_LODS.forEach((lod) => {
        const prefab = options.prefabs.get(lod);
        if (!prefab) return;
        const radius = prefab.footprintDiameter * 0.466;
        packing.buckets[lod].forEach((entry) => {
          shadowPosition.set(
            entry.data.x,
            entry.data.groundY + CASTLE_GROUND_LIFT * 0.85,
            entry.data.z
          );
          shadowScale.set(radius, radius, 1);
          instanceMatrix.compose(shadowPosition, shadowRotation, shadowScale);
          contactShadows.setMatrixAt(shadowInstanceId, instanceMatrix);
          shadowInstanceId += 1;
        });
      });
    }
    contactShadows.count = shadowInstanceId;
    contactShadows.instanceMatrix.needsUpdate = true;
    contactShadows.computeBoundingSphere();

    let colliderInstanceId = 0;
    baseColliderCastleIds.length = 0;
    CASTLE_LODS.forEach((lod) => {
      const envelope = options.prefabs.get(lod)?.landscapeBaseProjectionEnvelope;
      if (!envelope) return;
      const bounds = envelope.localBounds;
      const halfX = Math.max(0.05, (bounds.maxX - bounds.minX) * 0.5);
      const halfZ = Math.max(0.05, (bounds.maxZ - bounds.minZ) * 0.5);
      const height = Math.max(0.08, bounds.maxY - bounds.minY);
      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerY = (bounds.minY + bounds.maxY) * 0.5;
      const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
      packing.buckets[lod].forEach((entry) => {
        shadowPosition.set(
          entry.data.x + centerX,
          entry.data.groundY + CASTLE_GROUND_LIFT + centerY,
          entry.data.z + centerZ
        );
        shadowScale.set(halfX, height, halfZ);
        instanceMatrix.compose(shadowPosition, colliderRotation, shadowScale);
        baseColliders.setMatrixAt(colliderInstanceId, instanceMatrix);
        baseColliderCastleIds.push(entry.castleId);
        colliderInstanceId += 1;
      });
    });
    baseColliders.count = colliderInstanceId;
    baseColliders.instanceMatrix.needsUpdate = true;
    baseColliders.computeBoundingSphere();
  };

  const raycast = (raycaster: THREE.Raycaster): RealmCastleInstanceHit | null => {
    if (cleared || packing.totalVisible === 0) return null;
    const castleMeshes = [...meshOwners.entries()].flatMap(([mesh, owner]) => (
      owner.role === 'castle' ? [mesh] : []
    ));
    const intersections = raycaster.intersectObjects(castleMeshes, false);
    let castleCandidate: Readonly<{
      hit: RealmCastleInstanceHit;
      distance: number;
    }> | undefined;
    for (const intersection of intersections) {
      if (intersection.instanceId === undefined) continue;
      const owner = meshOwners.get(intersection.object as THREE.InstancedMesh);
      if (!owner) continue;
      const castleId = packing.resolveCastleId(owner.lod, intersection.instanceId);
      if (castleId === undefined) continue;
      const castle = castleById.get(castleId);
      if (castle) {
        castleCandidate = {
          hit: { castleId, coord: castle.coord },
          distance: intersection.distance
        };
        break;
      }
    }
    const baseIntersections = raycaster.intersectObject(baseColliders, false);
    for (const intersection of baseIntersections) {
      if (intersection.instanceId === undefined) continue;
      const castleId = baseColliderCastleIds[intersection.instanceId];
      const castle = castleId === undefined ? undefined : castleById.get(castleId);
      if (!castle) continue;
      if (!castleCandidate || intersection.distance < castleCandidate.distance) {
        return { castleId, coord: castle.coord };
      }
      break;
    }
    return castleCandidate?.hit ?? null;
  };

  const clear = () => {
    if (cleared) return;
    cleared = true;
    meshesByLod.forEach((lodMeshes) => {
      lodMeshes.meshes.forEach((mesh) => { mesh.count = 0; });
    });
    contactShadows.count = 0;
    baseColliders.count = 0;
    baseColliderCastleIds.length = 0;
    frustumVisibleCastleIds = Object.freeze([]);
    group.clear();
    meshOwners.clear();
  };

  const disposeInstanceBuffers = () => {
    let firstError: unknown;
    meshesByLod.forEach((lodMeshes) => {
      lodMeshes.meshes.forEach((mesh) => {
        try {
          // InstancedMesh owns its instanceMatrix/instanceColor GPU buffers.
          // This does not dispose repository-owned geometry or materials.
          mesh.dispose();
        } catch (error) {
          firstError ??= error;
        }
      });
    });
    try {
      contactShadows.dispose();
    } catch (error) {
      firstError ??= error;
    }
    try {
      baseColliders.dispose();
    } catch (error) {
      firstError ??= error;
    }
    if (firstError) throw firstError;
  };

  const getPresentationTelemetry = (): RealmCastleInstancePresentationTelemetry => {
    if (cleared) {
      return Object.freeze({
        presentedModelCount: 0,
        presentedLandscapeBaseCount: 0,
        raycastTargetCount: 0
      });
    }

    let presentedModelCount = 0;
    let presentedLandscapeBaseCount = 0;
    CASTLE_LODS.forEach((lod) => {
      const lodMeshes = meshesByLod.get(lod);
      if (!lodMeshes || lodMeshes.meshes.length === 0) return;
      // Any populated prefab primitive can put castle pixels on screen, so use
      // the highest live primitive count. Deliberately do not clamp this to the
      // packing plan: even one stale/unmasked primitive must remain observable
      // to the probe instead of being hidden by the requested mask.
      const castleCounts = lodMeshes.meshes.flatMap((mesh, index) => (
        lodMeshes.roles[index] === 'castle' ? [mesh.count] : []
      ));
      const landscapeBaseCounts = lodMeshes.meshes.flatMap((mesh, index) => (
        lodMeshes.roles[index] === 'landscape-base' ? [mesh.count] : []
      ));
      if (castleCounts.length > 0) presentedModelCount += Math.max(...castleCounts);
      if (landscapeBaseCounts.length > 0) {
        presentedLandscapeBaseCount += Math.max(...landscapeBaseCounts);
      }
    });

    const raycastTargetIds = new Set<number>();
    meshOwners.forEach((owner, mesh) => {
      const liveTargetCount = Math.min(mesh.count, packing.buckets[owner.lod].length);
      for (let instanceId = 0; instanceId < liveTargetCount; instanceId += 1) {
        const castleId = packing.resolveCastleId(owner.lod, instanceId);
        if (castleId !== undefined) raycastTargetIds.add(castleId);
      }
    });

    return Object.freeze({
      presentedModelCount,
      presentedLandscapeBaseCount,
      raycastTargetCount: raycastTargetIds.size
    });
  };

  const hasExactCastleLandscapeBasePairing = () => {
    if (cleared) return false;
    const observedMatrix = new THREE.Matrix4();
    const expectedMatrix = new THREE.Matrix4();
    const expectedPlacement = new THREE.Matrix4();

    for (const lod of CASTLE_LODS) {
      const lodMeshes = meshesByLod.get(lod);
      if (!lodMeshes) continue;
      const castlePrimitiveIndexes = lodMeshes.roles.flatMap((role, index) => (
        role === 'castle' ? [index] : []
      ));
      const landscapeBasePrimitiveIndexes = lodMeshes.roles.flatMap((role, index) => (
        role === 'landscape-base' ? [index] : []
      ));
      if (
        castlePrimitiveIndexes.length === 0
        || landscapeBasePrimitiveIndexes.length === 0
      ) return false;

      const bucket = packing.buckets[lod];
      if (lodMeshes.meshes.some((mesh) => mesh.count !== bucket.length)) return false;
      for (let instanceId = 0; instanceId < bucket.length; instanceId += 1) {
        const entry = bucket[instanceId];
        if (
          !entry
          || entry.instanceId !== instanceId
          || entry.data.castleId !== entry.castleId
          || packing.resolveCastleId(lod, instanceId) !== entry.castleId
        ) return false;
        expectedPlacement.makeTranslation(
          entry.data.x,
          entry.data.groundY + CASTLE_GROUND_LIFT,
          entry.data.z
        );
        for (let primitiveIndex = 0; primitiveIndex < lodMeshes.meshes.length; primitiveIndex += 1) {
          const mesh = lodMeshes.meshes[primitiveIndex];
          const localMatrix = lodMeshes.localMatrices[primitiveIndex];
          if (!mesh || !localMatrix) return false;
          mesh.getMatrixAt(instanceId, observedMatrix);
          expectedMatrix.multiplyMatrices(expectedPlacement, localMatrix);
          if (!approximatelyEqualMatrix(observedMatrix, expectedMatrix)) return false;
        }
      }
    }
    return true;
  };

  return Object.freeze({
    group,
    update,
    getFrustumVisibleCastleIds: () => frustumVisibleCastleIds,
    setPresentedCastleIds: (castleIds) => {
      if (cleared) return;
      if (castleIds === null) {
        if (presentedCastleIds === null) return;
        presentedCastleIds = null;
        presentedCastleKey = '*';
        lastPackingKey = '';
        return;
      }
      const ordered = [...new Set(castleIds)].sort((left, right) => left - right);
      if (ordered.some((castleId) => (
        !Number.isSafeInteger(castleId) || !castleById.has(castleId)
      ))) {
        throw new Error('Invalid presented castle identity set.');
      }
      const key = ordered.join(',');
      if (key === presentedCastleKey) return;
      presentedCastleIds = new Set(ordered);
      presentedCastleKey = key;
      lastPackingKey = '';
    },
    raycast,
    clear,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      let firstError: unknown;
      try {
        disposeInstanceBuffers();
      } catch (error) {
        firstError = error;
      }
      clear();
      try {
        contactShadowGeometry.dispose();
      } catch (error) {
        firstError ??= error;
      }
      try {
        contactShadowMaterial.dispose();
      } catch (error) {
        firstError ??= error;
      }
      try {
        baseColliderGeometry.dispose();
      } catch (error) {
        firstError ??= error;
      }
      try {
        baseColliderMaterial.dispose();
      } catch (error) {
        firstError ??= error;
      }
      if (firstError) throw firstError;
    },
    getPacking: () => packing,
    getPresentationTelemetry,
    hasExactCastleLandscapeBasePairing
  });
}
