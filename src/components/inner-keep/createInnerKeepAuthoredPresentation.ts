import * as THREE from 'three';

import {
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_CLEARANCES,
  INNER_KEEP_PRESENTATION_PLACEMENTS,
} from './innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_AMBIENT_ACTOR_CATALOG,
  INNER_KEEP_AMBIENT_EXCLUSIONS,
  INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS,
  INNER_KEEP_AMBIENT_ROUTES,
  innerKeepAmbientActorFootprintHalfExtents,
  type InnerKeepAmbientActorCategory,
  type InnerKeepAmbientRoute,
} from './innerKeepAmbientPolicy';
import { INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS } from './innerKeepFixedPlacementExclusions';
import type { InnerKeepBuildingKind } from './innerKeepPresentation';
import type {
  InnerKeepRuntimeAssetBundle,
  InnerKeepRuntimePrefab,
} from './loadInnerKeepRuntimeAssets';
import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';
import { innerKeepOuterWorldTerrainHeightAt } from './innerKeepOuterWorldPolicy';

export type InnerKeepAuthoredStaticPresentation = Readonly<{
  group: THREE.Group;
  loadedAssetCount: number;
  placementInstanceCount: number;
  authoredTreeCount: number;
  cathedralReady: boolean;
  barracksReady: boolean;
}>;

function deterministicUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function applyPlacementTransform(
  object: THREE.Object3D,
  positionMeters: readonly [number, number, number],
  rotationMilliDegrees: readonly [number, number, number],
  scalePermille: readonly [number, number, number],
) {
  object.position.set(...positionMeters);
  object.rotation.set(
    rotationMilliDegrees[0] * Math.PI / 180_000,
    rotationMilliDegrees[1] * Math.PI / 180_000,
    rotationMilliDegrees[2] * Math.PI / 180_000,
  );
  object.scale.set(
    scalePermille[0] / 1_000,
    scalePermille[1] / 1_000,
    scalePermille[2] / 1_000,
  );
}

type AuthoredCopy = Readonly<{
  name: string;
  positionMeters: readonly [number, number, number];
  rotationMilliDegrees: readonly [number, number, number];
  scalePermille: readonly [number, number, number];
}>;

export type InnerKeepAuthoredPerimeterTreePlacement = AuthoredCopy & Readonly<{
  speciesId: string;
  placementIndex: number;
  candidateIndex: number;
  halfExtentsMeters: readonly [number, number];
}>;

/**
 * Repeated static copies share immutable source geometry and materials. Empty
 * transform markers retain every stable placement name for QA and inspection.
 */
function addAuthoredCopies(
  target: THREE.Group,
  prefab: InnerKeepRuntimePrefab,
  copies: readonly AuthoredCopy[],
) {
  if (copies.length === 1) {
    const copy = copies[0]!;
    const clone = prefab.clone();
    clone.name = copy.name;
    applyPlacementTransform(
      clone,
      copy.positionMeters,
      copy.rotationMilliDegrees,
      copy.scalePermille,
    );
    target.add(clone);
    return;
  }

  const assetGroup = new THREE.Group();
  assetGroup.name = `inner-keep-authored-instanced-asset:${prefab.id}`;
  const copyMatrices = copies.map((copy) => {
    const marker = new THREE.Group();
    marker.name = copy.name;
    applyPlacementTransform(
      marker,
      copy.positionMeters,
      copy.rotationMilliDegrees,
      copy.scalePermille,
    );
    marker.updateMatrix();
    target.add(marker);
    return marker.matrix.clone();
  });

  prefab.root.updateWorldMatrix(true, true);
  const inverseRootMatrix = prefab.root.matrixWorld.clone().invert();
  let sourceMeshIndex = 0;
  prefab.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const relativeMatrix = inverseRootMatrix.clone().multiply(object.matrixWorld);
    const instances = new THREE.InstancedMesh(
      object.geometry,
      object.material,
      copyMatrices.length,
    );
    instances.name = `inner-keep-authored-instanced-mesh:${prefab.id}:${sourceMeshIndex}`;
    instances.castShadow = object.castShadow;
    instances.receiveShadow = object.receiveShadow;
    instances.renderOrder = object.renderOrder;
    instances.frustumCulled = object.frustumCulled;
    instances.layers.mask = object.layers.mask;
    instances.visible = object.visible;
    instances.customDepthMaterial = object.customDepthMaterial;
    instances.customDistanceMaterial = object.customDistanceMaterial;
    instances.userData.innerKeepRuntimeAssetId = prefab.id;
    instances.userData.innerKeepSourceMeshName = object.name;
    copyMatrices.forEach((copyMatrix, index) => {
      instances.setMatrixAt(index, copyMatrix.clone().multiply(relativeMatrix));
    });
    instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    instances.computeBoundingBox();
    instances.computeBoundingSphere();
    assetGroup.add(instances);
    sourceMeshIndex += 1;
  });
  target.add(assetGroup);
}

export const INNER_KEEP_AUTHORED_PERIMETER_TREE_BUDGETS = Object.freeze({
  high: 18,
  balanced: 12,
  reduced: 6,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

export const INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES = Object.freeze([
  'courtyard-linden-teardrop',
  'pruned-ornamental-three-tier',
  'giant-ancient-cedar',
] as const);

export const INNER_KEEP_AUTHORED_STATIC_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ drawCalls: 91, triangles: 199_620 }),
  balanced: Object.freeze({ drawCalls: 90, triangles: 102_412 }),
  reduced: Object.freeze({ drawCalls: 81, triangles: 49_601 }),
} satisfies Readonly<Record<InnerKeepSceneQuality, Readonly<{
  drawCalls: number;
  triangles: number;
}>>>);

export const INNER_KEEP_AUTHORED_PERIMETER_TREE_CANDIDATES_PER_PLACEMENT = 512;
export const INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS = 0.16;

type InnerKeepPerimeterTreeBand = Readonly<{
  sideX: number;
  northZ: number;
  southZ: number;
  alongX: readonly [number, number];
  alongZ: readonly [number, number];
  southOnly?: boolean;
  southField?: boolean;
  cedarReserve?: boolean;
  smallTreeReserve?: boolean;
}>;

const INNER_KEEP_PERIMETER_TREE_BANDS: readonly InnerKeepPerimeterTreeBand[] =
Object.freeze([
  Object.freeze({
    sideX: 0,
    northZ: 15.85,
    southZ: 15.85,
    alongX: Object.freeze([-12.5, 12.5] as const),
    alongZ: Object.freeze([0, 0] as const),
    cedarReserve: true,
  }),
  Object.freeze({
    sideX: 0,
    northZ: 12.65,
    southZ: 12.65,
    alongX: Object.freeze([-14.25, 14.25] as const),
    alongZ: Object.freeze([0, 0] as const),
    smallTreeReserve: true,
  }),
  Object.freeze({
    sideX: 13.35,
    northZ: -14.05,
    southZ: 7.8,
    alongX: Object.freeze([-13.7, 13.7] as const),
    alongZ: Object.freeze([-13.8, 7.9] as const),
  }),
  // Smaller crowns can use the narrow planted verge immediately inside the
  // wall; scaled-bound rejection naturally keeps oversized cedars out.
  Object.freeze({
    sideX: 14.35,
    northZ: -14.75,
    southZ: 8.65,
    alongX: Object.freeze([-14.4, 14.4] as const),
    alongZ: Object.freeze([-14.7, 8.7] as const),
  }),
  Object.freeze({
    sideX: 12.15,
    northZ: -12.9,
    southZ: 6.65,
    alongX: Object.freeze([-12.8, 12.8] as const),
    alongZ: Object.freeze([-12.8, 6.8] as const),
  }),
  // A third inner lane increases candidate density without leaving the terrain.
  Object.freeze({
    sideX: 10.9,
    northZ: -11.5,
    southZ: 5.45,
    alongX: Object.freeze([-11.5, 11.5] as const),
    alongZ: Object.freeze([-11.4, 5.7] as const),
  }),
  Object.freeze({
    sideX: 9.6,
    northZ: -10.35,
    southZ: 4.35,
    alongX: Object.freeze([-10.2, 10.2] as const),
    alongZ: Object.freeze([-10.25, 4.55] as const),
  }),
  Object.freeze({
    sideX: 0,
    northZ: 12.25,
    southZ: 14.05,
    alongX: Object.freeze([-14.8, 14.8] as const),
    alongZ: Object.freeze([0, 0] as const),
    southOnly: true,
  }),
  Object.freeze({
    sideX: 0,
    northZ: 12.2,
    southZ: 15.45,
    alongX: Object.freeze([-14.8, 14.8] as const),
    alongZ: Object.freeze([0, 0] as const),
    southField: true,
  }),
  // The final bounded fallback is a pair of grounded lanes beyond the south
  // wall, still inside the authored terrain and portrait camera envelope.
  Object.freeze({
    sideX: 0,
    northZ: 13.65,
    southZ: 15.35,
    alongX: Object.freeze([-14.8, 14.8] as const),
    alongZ: Object.freeze([0, 0] as const),
    southOnly: true,
  }),
]);

function rotatedTreeHalfExtents(
  boundsMeters: readonly [number, number, number],
  scale: number,
  rotationMilliDegrees: number,
): readonly [number, number] {
  const radians = rotationMilliDegrees / 1_000 * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfX = boundsMeters[0] * scale * 0.5;
  const halfZ = boundsMeters[2] * scale * 0.5;
  return Object.freeze([
    cosine * halfX + sine * halfZ,
    sine * halfX + cosine * halfZ,
  ] as const);
}

function aabbOverlaps(
  leftCenter: readonly [number, number],
  leftHalfExtents: readonly [number, number],
  rightCenter: readonly [number, number],
  rightHalfExtents: readonly [number, number],
  clearanceMeters: number,
) {
  return Math.abs(leftCenter[0] - rightCenter[0])
      <= leftHalfExtents[0] + rightHalfExtents[0] + clearanceMeters
    && Math.abs(leftCenter[1] - rightCenter[1])
      <= leftHalfExtents[1] + rightHalfExtents[1] + clearanceMeters;
}

function segmentTouchesExpandedAabb(
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  center: readonly [number, number],
  halfExtents: readonly [number, number],
  expansionMeters: number,
) {
  const minimum = [
    center[0] - halfExtents[0] - expansionMeters,
    center[1] - halfExtents[1] - expansionMeters,
  ] as const;
  const maximum = [
    center[0] + halfExtents[0] + expansionMeters,
    center[1] + halfExtents[1] + expansionMeters,
  ] as const;
  const origin = [from.x, from.z] as const;
  const delta = [to.x - from.x, to.z - from.z] as const;
  let entry = 0;
  let exit = 1;
  for (let axis = 0; axis < 2; axis += 1) {
    if (Math.abs(delta[axis]!) <= 0.000_001) {
      if (origin[axis]! < minimum[axis]! || origin[axis]! > maximum[axis]!) {
        return false;
      }
      continue;
    }
    const inverse = 1 / delta[axis]!;
    let near = (minimum[axis]! - origin[axis]!) * inverse;
    let far = (maximum[axis]! - origin[axis]!) * inverse;
    if (near > far) [near, far] = [far, near];
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) return false;
  }
  return true;
}

function routeActorCategories(
  route: InnerKeepAmbientRoute,
): readonly InnerKeepAmbientActorCategory[] {
  if (route.kind === 'citizen-approach') return Object.freeze(['citizen']);
  if (route.kind === 'civic-mounted-loop') return Object.freeze(['civic-mounted']);
  if (route.kind === 'mounted-patrol-loop') return Object.freeze(['mounted-patrol']);
  return Object.freeze(['citizen', 'foot-patrol']);
}

function routeSweepRadiusMeters(
  route: InnerKeepAmbientRoute,
  quality: InnerKeepSceneQuality,
) {
  const categories = new Set(routeActorCategories(route));
  const exactActorRadii = INNER_KEEP_AMBIENT_ACTOR_CATALOG
    .filter(({ category }) => categories.has(category))
    .map((actor) => Math.hypot(
      ...innerKeepAmbientActorFootprintHalfExtents(actor, quality),
    ));
  return Math.max(route.actorRadiusMeters, ...exactActorRadii);
}

function treeTouchesSweptRoute(
  placement: InnerKeepAuthoredPerimeterTreePlacement,
  route: InnerKeepAmbientRoute,
  sweepRadiusMeters: number,
) {
  const points = route.path.points;
  const segmentCount = route.path.closed ? points.length : points.length - 1;
  const expansionMeters = sweepRadiusMeters
    + INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    if (segmentTouchesExpandedAabb(
      points[segmentIndex]!,
      points[(segmentIndex + 1) % points.length]!,
      [placement.positionMeters[0], placement.positionMeters[2]],
      placement.halfExtentsMeters,
      expansionMeters,
    )) return true;
  }
  return false;
}

function treeCandidatePosition(
  candidateIndex: number,
  visualSeed: number,
): readonly [number, number, number] {
  const grounded = (x: number, z: number) => Object.freeze([
    x,
    innerKeepOuterWorldTerrainHeightAt(x, z) + 0.08,
    z,
  ] as const);
  const side = candidateIndex % 4;
  const bandIndex = Math.floor(candidateIndex / 4)
    % INNER_KEEP_PERIMETER_TREE_BANDS.length;
  const band = INNER_KEEP_PERIMETER_TREE_BANDS[bandIndex]!;
  const along = deterministicUnit(candidateIndex, visualSeed + 31);
  const reserveOrdinal = Math.floor(
    candidateIndex / (INNER_KEEP_PERIMETER_TREE_BANDS.length * 4),
  );
  if (band.cedarReserve === true) {
    const x = -12.5 + (reserveOrdinal % 6) * 5
      + (deterministicUnit(candidateIndex, visualSeed + 32) - 0.5) * 0.24;
    const z = 15.85 + (deterministicUnit(candidateIndex, visualSeed + 33) - 0.5) * 0.12;
    return grounded(x, z);
  }
  if (band.smallTreeReserve === true) {
    const x = -14.25 + (reserveOrdinal % 12) * (28.5 / 11)
      + (deterministicUnit(candidateIndex, visualSeed + 32) - 0.5) * 0.1;
    const z = 12.65 + (deterministicUnit(candidateIndex, visualSeed + 33) - 0.5) * 0.08;
    return grounded(x, z);
  }
  const crossJitter = (deterministicUnit(candidateIndex, visualSeed + 32) - 0.5)
    * (band.southOnly === true || band.southField === true ? 0.35 : 0.55);
  if (band.southField === true) {
    const x = band.alongX[0] + (band.alongX[1] - band.alongX[0]) * along;
    const z = band.northZ + (band.southZ - band.northZ)
      * deterministicUnit(candidateIndex, visualSeed + 33);
    return grounded(x, z);
  }
  if (band.southOnly === true) {
    const x = band.alongX[0] + (band.alongX[1] - band.alongX[0]) * along;
    const z = (side % 2 === 0 ? band.northZ : band.southZ) + crossJitter;
    return grounded(x, z);
  }
  if (side === 0 || side === 1) {
    const x = (side === 0 ? -band.sideX : band.sideX) + crossJitter;
    const z = band.alongZ[0] + (band.alongZ[1] - band.alongZ[0]) * along;
    return grounded(x, z);
  }
  const x = band.alongX[0] + (band.alongX[1] - band.alongX[0]) * along;
  const z = (side === 2 ? band.northZ : band.southZ) + crossJitter;
  return grounded(x, z);
}

function candidateIsClear(
  candidate: InnerKeepAuthoredPerimeterTreePlacement,
  accepted: readonly InnerKeepAuthoredPerimeterTreePlacement[],
  routeSweeps: readonly Readonly<{
    route: InnerKeepAmbientRoute;
    radiusMeters: number;
  }>[],
) {
  const center = [
    candidate.positionMeters[0],
    candidate.positionMeters[2],
  ] as const;
  const [groundHalfWidth, groundHalfDepth] =
    INNER_KEEP_PRESENTATION_CLEARANCES.ground.halfExtentsMeters;
  if (
    Math.abs(center[0]) + candidate.halfExtentsMeters[0] > groundHalfWidth
    || Math.abs(center[1]) + candidate.halfExtentsMeters[1] > groundHalfDepth
  ) return false;
  if (INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS.some((fixed) => aabbOverlaps(
    center,
    candidate.halfExtentsMeters,
    [fixed.center.x, fixed.center.z],
    fixed.halfExtentsMeters,
    fixed.clearanceMarginMeters,
  ))) return false;
  if (INNER_KEEP_AMBIENT_EXCLUSIONS.some((exclusion) => aabbOverlaps(
    center,
    candidate.halfExtentsMeters,
    [exclusion.center.x, exclusion.center.z],
    exclusion.halfExtentsMeters,
    exclusion.additionalClearanceMeters,
  ))) return false;
  if (routeSweeps.some(({ route, radiusMeters }) => (
    treeTouchesSweptRoute(candidate, route, radiusMeters)
  ))) return false;
  return !accepted.some((tree) => aabbOverlaps(
    center,
    candidate.halfExtentsMeters,
    [tree.positionMeters[0], tree.positionMeters[2]],
    tree.halfExtentsMeters,
    INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
  ));
}

/**
 * Deterministically reranks a bounded perimeter pool and accepts only trees
 * whose actual scaled X/Z bounds clear authored geometry and every actor lane.
 */
export function planInnerKeepAuthoredPerimeterTrees(options: Readonly<{
  bundle: InnerKeepRuntimeAssetBundle;
  quality: InnerKeepSceneQuality;
  visualSeed: number;
}>): readonly InnerKeepAuthoredPerimeterTreePlacement[] {
  const budget = INNER_KEEP_AUTHORED_PERIMETER_TREE_BUDGETS[options.quality];
  const accepted: InnerKeepAuthoredPerimeterTreePlacement[] = [];
  const routeSweeps = INNER_KEEP_AMBIENT_ROUTES.map((route) => Object.freeze({
    route,
    radiusMeters: routeSweepRadiusMeters(route, options.quality),
  }));
  // Place the broadest species first so smaller crowns cannot fragment every
  // valid cedar site before the bounded reranker reaches it.
  const placementIndices = Array.from({ length: budget }, (_, index) => index)
    .sort((left, right) => {
      const leftSpecies = INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES[
        left % INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES.length
      ]!;
      const rightSpecies = INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES[
        right % INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES.length
      ]!;
      const leftPriority = leftSpecies === 'giant-ancient-cedar' ? 0 : 1;
      const rightPriority = rightSpecies === 'giant-ancient-cedar' ? 0 : 1;
      return leftPriority - rightPriority || left - right;
    });
  for (const placementIndex of placementIndices) {
    const speciesId = INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES[
      placementIndex % INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES.length
    ]!;
    const prefab = options.bundle.staticPrefabs.get(speciesId);
    if (!prefab) {
      throw new Error(`Inner Keep perimeter tree prefab ${speciesId} is unavailable.`);
    }
    const pool = Array.from(
      { length: INNER_KEEP_AUTHORED_PERIMETER_TREE_CANDIDATES_PER_PLACEMENT },
      (_, attemptIndex) => {
        const candidateIndex = attemptIndex;
        const variationIndex = placementIndex
          * INNER_KEEP_AUTHORED_PERIMETER_TREE_CANDIDATES_PER_PLACEMENT
          + candidateIndex;
        const bandIndex = Math.floor(candidateIndex / 4)
          % INNER_KEEP_PERIMETER_TREE_BANDS.length;
        const band = INNER_KEEP_PERIMETER_TREE_BANDS[bandIndex]!;
        const bandRank = speciesId === 'giant-ancient-cedar'
          ? band.cedarReserve === true
            ? 0
            : band.southOnly === true || band.southField === true ? 1 : bandIndex + 2
          : band.smallTreeReserve === true
            ? 0
            : band.cedarReserve === true ? 100 : bandIndex + 1;
        return Object.freeze({
          candidateIndex,
          variationIndex,
          rank: bandRank * 2
            + deterministicUnit(variationIndex, options.visualSeed + 91),
        });
      },
    ).sort((left, right) => (
      left.rank - right.rank || left.candidateIndex - right.candidateIndex
    ));
    let selected: InnerKeepAuthoredPerimeterTreePlacement | null = null;
    for (const candidate of pool) {
      const baseScale = speciesId === 'giant-ancient-cedar' ? 0.2 : 0.52;
      const scale = baseScale * (
        0.78 + deterministicUnit(candidate.variationIndex, options.visualSeed + 35) * 0.36
      );
      const rotationMilliDegrees = deterministicUnit(
        candidate.variationIndex,
        options.visualSeed + 36,
      ) * 360_000;
      const placement = Object.freeze({
        speciesId,
        placementIndex,
        candidateIndex: candidate.candidateIndex,
        name: `inner-keep-authored-perimeter-tree:${speciesId}:${placementIndex}`,
        positionMeters: treeCandidatePosition(candidate.candidateIndex, options.visualSeed),
        rotationMilliDegrees: Object.freeze([
          0,
          rotationMilliDegrees,
          0,
        ] as const),
        scalePermille: Object.freeze([
          scale * 1_000,
          scale * 1_000,
          scale * 1_000,
        ] as const),
        halfExtentsMeters: rotatedTreeHalfExtents(
          prefab.boundsMeters,
          scale,
          rotationMilliDegrees,
        ),
      });
      if (!candidateIsClear(placement, accepted, routeSweeps)) continue;
      selected = placement;
      break;
    }
    if (!selected) {
      throw new Error(
        `Inner Keep ${options.quality} perimeter tree pool exhausted at `
        + `placement ${placementIndex + 1}/${budget} for seed ${options.visualSeed}.`,
      );
    }
    accepted.push(selected);
  }
  return Object.freeze([...accepted].sort((left, right) => (
    left.placementIndex - right.placementIndex
  )));
}

function addPerimeterTrees(
  target: THREE.Group,
  bundle: InnerKeepRuntimeAssetBundle,
  quality: InnerKeepSceneQuality,
  visualSeed: number,
) {
  const copiesBySpecies = new Map<string, AuthoredCopy[]>();
  const plan = planInnerKeepAuthoredPerimeterTrees({ bundle, quality, visualSeed });
  for (const placement of plan) {
    const copies = copiesBySpecies.get(placement.speciesId) ?? [];
    copies.push(placement);
    copiesBySpecies.set(placement.speciesId, copies);
  }
  copiesBySpecies.forEach((copies, speciesId) => {
    const prefab = bundle.staticPrefabs.get(speciesId);
    if (prefab) addAuthoredCopies(target, prefab, copies);
  });
  return plan.length;
}

/**
 * Builds visual-only fixed placements from the exact runtime selection. Slot
 * occupants remain under reconcile() because only server projections decide
 * whether an economy building exists.
 */
export function createInnerKeepAuthoredStaticPresentation(options: Readonly<{
  bundle: InnerKeepRuntimeAssetBundle;
  quality: InnerKeepSceneQuality;
  visualSeed: number;
}>): InnerKeepAuthoredStaticPresentation {
  const group = new THREE.Group();
  group.name = 'inner-keep-authored-static-presentation';
  let placementInstanceCount = 0;
  for (const placement of INNER_KEEP_PRESENTATION_PLACEMENTS) {
    if (placement.anchor !== 'fixed') continue;
    const prefab = options.bundle.staticPrefabs.get(placement.assetId);
    if (!prefab) continue;
    addAuthoredCopies(group, prefab, placement.instances.map((instance) => Object.freeze({
      name: `inner-keep-authored-placement:${instance.placementId}`,
      positionMeters: instance.positionMeters,
      rotationMilliDegrees: instance.rotationMilliDegrees,
      scalePermille: instance.scalePermille,
    })));
    placementInstanceCount += placement.instances.length;
  }
  const authoredTreeCount = addPerimeterTrees(
    group,
    options.bundle,
    options.quality,
    options.visualSeed,
  );
  return Object.freeze({
    group,
    loadedAssetCount: options.bundle.staticPrefabs.size,
    placementInstanceCount,
    authoredTreeCount,
    cathedralReady: options.bundle.staticPrefabs.has('grand-covenant-cathedral'),
    barracksReady: options.bundle.staticPrefabs.has('city-barracks'),
  });
}

function buildingTemplateScale(buildingKind: InnerKeepBuildingKind) {
  const placement = INNER_KEEP_PRESENTATION_PLACEMENTS.find((candidate) => (
    candidate.assetId === buildingKind
    && candidate.anchor === 'active-medium-slot-template'
  ));
  return (placement?.instances[0]?.scalePermille[0] ?? 300) / 1_000;
}

function cloneMaterialsForReveal(
  root: THREE.Object3D,
  disposableMaterials: Set<THREE.Material>,
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => {
        const clone = material.clone();
        disposableMaterials.add(clone);
        return clone;
      });
    } else {
      const clone = object.material.clone();
      disposableMaterials.add(clone);
      object.material = clone;
    }
  });
}

export function createInnerKeepAuthoredBuilding(options: Readonly<{
  bundle: InnerKeepRuntimeAssetBundle | null;
  buildingKind: InnerKeepBuildingKind;
  completedLevel: number;
  disposableMaterials: Set<THREE.Material>;
}>): THREE.Group | null {
  const prefab: InnerKeepRuntimePrefab | undefined = options.bundle
    ?.staticPrefabs.get(options.buildingKind);
  if (!prefab) return null;
  const root = prefab.clone();
  root.name = `inner-keep-completed-building:${options.buildingKind}`;
  cloneMaterialsForReveal(root, options.disposableMaterials);
  const levelLift = 1 + Math.max(0, Math.min(4, options.completedLevel - 1)) * 0.025;
  root.scale.setScalar(buildingTemplateScale(options.buildingKind) * levelLift);
  root.userData.innerKeepAuthoredAsset = true;
  root.userData.innerKeepCompletedLevel = options.completedLevel;
  return root;
}

export function allInnerKeepStaticRuntimeAssetIds() {
  const priority: ReadonlyMap<string, number> = new Map([
    ['grand-covenant-cathedral', 0],
    ['city-barracks', 1],
    ['city-mill', 2],
    ['lumber-camp', 3],
    ['city-stoneworks', 4],
    ['city-goldworks', 5],
  ] as const);
  return Object.freeze([...INNER_KEEP_PRESENTATION_ASSETS]
    .sort((left, right) => (
      (priority.get(left.assetId) ?? 10)
      - (priority.get(right.assetId) ?? 10)
      || left.assetId.localeCompare(right.assetId)
    ))
    .map((asset) => asset.assetId));
}

export function hasCompleteInnerKeepStaticRuntimeCoverage(
  bundle: Pick<InnerKeepRuntimeAssetBundle, 'staticPrefabs'>,
) {
  return allInnerKeepStaticRuntimeAssetIds().every((assetId) => (
    bundle.staticPrefabs.has(assetId)
  ));
}
