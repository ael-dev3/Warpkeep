import * as THREE from 'three';

import {
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_CLEARANCES,
  INNER_KEEP_PRESENTATION_LAYOUT_DIGEST,
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
import type {
  InnerKeepBuildingKind,
  InnerKeepPlacementTransform,
} from './innerKeepPresentation';
import { INNER_KEEP_FREE_PLACEMENT_ENVELOPES } from './innerKeepFreePlacementPolicy';
import type {
  InnerKeepRuntimeAssetBundle,
  InnerKeepRuntimePrefab,
} from './loadInnerKeepRuntimeAssets';
import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';
import {
  INNER_KEEP_CITY_DISTRICT_ROADS,
  INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS,
  INNER_KEEP_CITY_EDGE_APRON_POINTS,
  INNER_KEEP_OUTER_WORLD_AMBIENT_LANES,
  INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS,
  INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS,
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE,
  innerKeepOuterWorldTerrainHeightAt,
} from './innerKeepOuterWorldPolicy';
import {
  INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS,
  INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES,
  INNER_KEEP_PALISADE_GATE_LEAF_VISUAL_OVERRIDES,
  INNER_KEEP_PALISADE_SOUTH_WALL_VISUAL_OVERRIDES,
  INNER_KEEP_PALISADE_VISUAL_CORRECTION_POLICY,
  INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS,
  INNER_KEEP_WEATHERED_WALL_SKIRT_ASSET_ID,
  INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS,
} from './innerKeepTownAtmospherePolicy';

const INNER_KEEP_PALISADE_VISUAL_OVERRIDE_BY_PLACEMENT_ID = new Map(
  [
    ...INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES,
    ...INNER_KEEP_PALISADE_GATE_LEAF_VISUAL_OVERRIDES,
    ...INNER_KEEP_PALISADE_SOUTH_WALL_VISUAL_OVERRIDES,
  ].map((override) => [
    override.placementId,
    override,
  ] as const),
);

if (
  INNER_KEEP_PALISADE_VISUAL_CORRECTION_POLICY.sourcePresentationLayoutDigest
  !== INNER_KEEP_PRESENTATION_LAYOUT_DIGEST
) throw new Error('Inner Keep palisade visual correction targets a stale layout.');

export type InnerKeepAuthoredStaticPresentation = Readonly<{
  group: THREE.Group;
  loadedAssetCount: number;
  placementInstanceCount: number;
  authoredTreeCount: number;
  cathedralReady: boolean;
  barracksReady: boolean;
  reconcileBuildingExclusions: (
    buildings: readonly InnerKeepAuthoredBuildingExclusion[],
  ) => number;
}>;

export type InnerKeepAuthoredBuildingExclusion = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  placement: InnerKeepPlacementTransform;
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

type AuthoredCopyVisibilityController = Readonly<{
  setVisibleCopies: (visibleCopies: readonly boolean[]) => void;
}>;

type YieldingFixedPlacementGroup = Readonly<{
  controller: AuthoredCopyVisibilityController;
  placementIds: readonly string[];
}>;

type YieldingPerimeterTreeGroup = Readonly<{
  controller: AuthoredCopyVisibilityController;
  placements: readonly InnerKeepAuthoredPerimeterTreePlacement[];
}>;

const INNER_KEEP_FIXED_PLACEMENT_EXCLUSION_BY_ID = new Map(
  INNER_KEEP_FIXED_PLACEMENT_EXCLUSIONS.map((exclusion) => [
    exclusion.placementId,
    exclusion,
  ] as const),
);

/**
 * Decorative fixed dressing yields to every verified project envelope,
 * including authoritative projects and a currently valid local preview.
 * The props remain presentation-only and therefore never invalidate a legal
 * server placement; their reviewed clearance only decides when to hide them.
 */
export function innerKeepFixedDressingIntersectsBuilding(
  placementId: string,
  building: InnerKeepAuthoredBuildingExclusion,
) {
  const exclusion = INNER_KEEP_FIXED_PLACEMENT_EXCLUSION_BY_ID.get(placementId);
  if (!exclusion) return false;
  const envelope = INNER_KEEP_FREE_PLACEMENT_ENVELOPES[building.buildingKind];
  const quarterTurn = building.placement.rotationMilliDegrees === 90_000
    || building.placement.rotationMilliDegrees === 270_000;
  const buildingHalfX = quarterTurn
    ? envelope.halfExtentsMeters[1]
    : envelope.halfExtentsMeters[0];
  const buildingHalfZ = quarterTurn
    ? envelope.halfExtentsMeters[0]
    : envelope.halfExtentsMeters[1];
  const buildingX = Number(building.placement.localXMicrounits) / 1_000_000;
  const buildingZ = Number(building.placement.localZMicrounits) / 1_000_000;
  return Math.abs(buildingX - exclusion.center.x)
      <= buildingHalfX
        + exclusion.halfExtentsMeters[0]
        + exclusion.clearanceMarginMeters
    && Math.abs(buildingZ - exclusion.center.z)
      <= buildingHalfZ
        + exclusion.halfExtentsMeters[1]
        + exclusion.clearanceMarginMeters;
}

/** Full visual crown clearance; the much smaller trunk is never left inside a project. */
export function innerKeepAuthoredPerimeterTreeIntersectsBuilding(
  tree: InnerKeepAuthoredPerimeterTreePlacement,
  building: InnerKeepAuthoredBuildingExclusion,
) {
  const envelope = INNER_KEEP_FREE_PLACEMENT_ENVELOPES[building.buildingKind];
  const quarterTurn = building.placement.rotationMilliDegrees === 90_000
    || building.placement.rotationMilliDegrees === 270_000;
  const buildingHalfX = quarterTurn
    ? envelope.halfExtentsMeters[1]
    : envelope.halfExtentsMeters[0];
  const buildingHalfZ = quarterTurn
    ? envelope.halfExtentsMeters[0]
    : envelope.halfExtentsMeters[1];
  const buildingX = Number(building.placement.localXMicrounits) / 1_000_000;
  const buildingZ = Number(building.placement.localZMicrounits) / 1_000_000;
  return aabbOverlaps(
    [tree.positionMeters[0], tree.positionMeters[2]],
    tree.halfExtentsMeters,
    [buildingX, buildingZ],
    [buildingHalfX, buildingHalfZ],
    INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
  );
}

export type InnerKeepAuthoredPerimeterTreeSector =
  | 'west'
  | 'east'
  | 'north'
  | 'south';

export type InnerKeepAuthoredPerimeterTreePlacement = AuthoredCopy & Readonly<{
  speciesId: string;
  sector: InnerKeepAuthoredPerimeterTreeSector;
  placementIndex: number;
  candidateIndex: number;
  halfExtentsMeters: readonly [number, number];
}>;

/** Low trunk support used for traffic clearance; crowns may naturally overhang roads. */
export function innerKeepAuthoredPerimeterTreeTrunkRadiusMeters(
  placement: Pick<InnerKeepAuthoredPerimeterTreePlacement, 'halfExtentsMeters'>,
) {
  return Math.min(
    0.42,
    Math.max(0.18, Math.min(...placement.halfExtentsMeters) * 0.28),
  );
}

/**
 * Repeated static copies share immutable source geometry and materials. Empty
 * transform markers retain every stable placement name for QA and inspection.
 */
function addAuthoredCopies(
  target: THREE.Group,
  prefab: InnerKeepRuntimePrefab,
  copies: readonly AuthoredCopy[],
  mutableVisibility = false,
): AuthoredCopyVisibilityController {
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
    const sourceVisible = clone.visible;
    return Object.freeze({
      setVisibleCopies: (visibleCopies: readonly boolean[]) => {
        clone.visible = sourceVisible && visibleCopies[0] !== false;
      },
    });
  }

  const assetGroup = new THREE.Group();
  assetGroup.name = `inner-keep-authored-instanced-asset:${prefab.id}`;
  const markers: THREE.Group[] = [];
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
    markers.push(marker);
    return marker.matrix.clone();
  });

  prefab.root.updateWorldMatrix(true, true);
  const inverseRootMatrix = prefab.root.matrixWorld.clone().invert();
  const instanceRecords: Array<Readonly<{
    instances: THREE.InstancedMesh;
    relativeMatrix: THREE.Matrix4;
  }>> = [];
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
    instances.instanceMatrix.setUsage(
      mutableVisibility ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage,
    );
    instances.computeBoundingBox();
    instances.computeBoundingSphere();
    assetGroup.add(instances);
    instanceRecords.push(Object.freeze({ instances, relativeMatrix }));
    sourceMeshIndex += 1;
  });
  target.add(assetGroup);
  let previousVisibility = copies.map(() => true);
  return Object.freeze({
    setVisibleCopies: (visibleCopies: readonly boolean[]) => {
      const nextVisibility = copies.map((_, index) => visibleCopies[index] !== false);
      if (nextVisibility.every((visible, index) => (
        visible === previousVisibility[index]
      ))) return;
      const visibleIndices: number[] = [];
      nextVisibility.forEach((visible, index) => {
        markers[index]!.visible = visible;
        if (visible) visibleIndices.push(index);
      });
      for (const { instances, relativeMatrix } of instanceRecords) {
        visibleIndices.forEach((copyIndex, renderedIndex) => {
          instances.setMatrixAt(
            renderedIndex,
            copyMatrices[copyIndex]!.clone().multiply(relativeMatrix),
          );
        });
        instances.count = visibleIndices.length;
        instances.instanceMatrix.needsUpdate = true;
        if (visibleIndices.length > 0) {
          instances.computeBoundingBox();
          instances.computeBoundingSphere();
        }
      }
      previousVisibility = nextVisibility;
    },
  });
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
  high: Object.freeze({ drawCalls: 90, triangles: 142_916 }),
  balanced: Object.freeze({ drawCalls: 89, triangles: 78_532 }),
  reduced: Object.freeze({ drawCalls: 80, triangles: 37_523 }),
} satisfies Readonly<Record<InnerKeepSceneQuality, Readonly<{
  drawCalls: number;
  triangles: number;
}>>>);

export const INNER_KEEP_AUTHORED_PERIMETER_TREE_CANDIDATES_PER_PLACEMENT = 512;
export const INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS = 0.16;
export const INNER_KEEP_AUTHORED_PERIMETER_TREE_GROUND_LIFT_METERS = 0.01;
const INNER_KEEP_AUTHORED_TRADE_ROAD_POINTS = Object.freeze(
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.map((point) => Object.freeze({
    x: point[0],
    z: point[2],
  })),
);

type InnerKeepPerimeterTreeSectorDefinition = Readonly<{
  sector: InnerKeepAuthoredPerimeterTreeSector;
  alongRangeMeters: readonly [number, number];
  crossRangeMeters: readonly [number, number];
}>;

const INNER_KEEP_PERIMETER_TREE_SECTORS:
readonly InnerKeepPerimeterTreeSectorDefinition[] = Object.freeze((() => {
  const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
  const [groundHalfWidth, groundHalfDepth] =
    INNER_KEEP_PRESENTATION_CLEARANCES.ground.halfExtentsMeters;
  const sideAlongRange = Object.freeze([
    wall.northZ + 2.4,
    wall.southZ - 2.4,
  ] as const);
  const horizontalAlongRange = Object.freeze([
    wall.westX + 2.8,
    wall.eastX - 2.8,
  ] as const);
  return [
    Object.freeze({
      sector: 'west' as const,
      alongRangeMeters: sideAlongRange,
      crossRangeMeters: Object.freeze([
        wall.westX + 1.75,
        wall.westX + 5.6,
      ] as const),
    }),
    Object.freeze({
      sector: 'east' as const,
      alongRangeMeters: sideAlongRange,
      crossRangeMeters: Object.freeze([
        wall.eastX - 5.6,
        wall.eastX - 1.75,
      ] as const),
    }),
    Object.freeze({
      sector: 'north' as const,
      alongRangeMeters: Object.freeze([
        horizontalAlongRange[0],
        -6.2,
      ] as const),
      crossRangeMeters: Object.freeze([
        wall.northZ + 1.75,
        wall.northZ + 5.35,
      ] as const),
    }),
    Object.freeze({
      sector: 'north' as const,
      alongRangeMeters: Object.freeze([
        6.2,
        horizontalAlongRange[1],
      ] as const),
      crossRangeMeters: Object.freeze([
        wall.northZ + 1.75,
        wall.northZ + 5.35,
      ] as const),
    }),
    Object.freeze({
      sector: 'south' as const,
      alongRangeMeters: horizontalAlongRange,
      crossRangeMeters: Object.freeze([
        wall.southZ - 5.35,
        wall.southZ - 1.75,
      ] as const),
    }),
    Object.freeze({
      sector: 'south' as const,
      alongRangeMeters: Object.freeze([
        wall.westX + 3.2,
        wall.eastX - 3.2,
      ] as const),
      crossRangeMeters: Object.freeze([
        wall.southZ + 1.8,
        Math.min(groundHalfDepth - 1.35, wall.southZ + 5.8),
      ] as const),
    }),
    Object.freeze({
      sector: 'west' as const,
      alongRangeMeters: Object.freeze([
        wall.northZ + 3,
        wall.southZ - 3,
      ] as const),
      crossRangeMeters: Object.freeze([
        Math.max(-groundHalfWidth + 1.35, wall.westX - 2.65),
        wall.westX - 1.55,
      ] as const),
    }),
    Object.freeze({
      sector: 'east' as const,
      alongRangeMeters: Object.freeze([
        wall.northZ + 3,
        wall.southZ - 3,
      ] as const),
      crossRangeMeters: Object.freeze([
        wall.eastX + 1.55,
        Math.min(groundHalfWidth - 1.35, wall.eastX + 2.65),
      ] as const),
    }),
  ];
})());

const INNER_KEEP_PERIMETER_TREE_SECTOR_ORDER = Object.freeze([
  'west',
  'east',
  'north',
  'south',
] as const);

function interpolateRange(
  range: readonly [number, number],
  progress: number,
) {
  return range[0] + (range[1] - range[0]) * progress;
}

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
  if (
    route.kind === 'citizen-approach'
    || route.kind === 'citizen-work-shuttle'
  ) return Object.freeze(['citizen']);
  if (route.kind === 'civic-mounted-shuttle') return Object.freeze(['civic-mounted']);
  if (route.kind === 'mounted-duty-shuttle') return Object.freeze(['mounted-patrol']);
  return Object.freeze(['foot-patrol']);
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
  terrainHeightAt: (x: number, z: number) => number,
): Readonly<{
  sector: InnerKeepAuthoredPerimeterTreeSector;
  positionMeters: readonly [number, number, number];
}> {
  const grounded = (x: number, z: number) => Object.freeze([
    x,
    terrainHeightAt(x, z) + INNER_KEEP_AUTHORED_PERIMETER_TREE_GROUND_LIFT_METERS,
    z,
  ] as const);
  const sector = INNER_KEEP_PERIMETER_TREE_SECTORS[
    candidateIndex % INNER_KEEP_PERIMETER_TREE_SECTORS.length
  ]!;
  const ordinal = Math.floor(
    candidateIndex / INNER_KEEP_PERIMETER_TREE_SECTORS.length,
  );
  // Both axes span real planting depth. A low-discrepancy stagger keeps the
  // grove organic without the near-constant reserve rows used previously.
  const alongUnit = (
    deterministicUnit(ordinal, visualSeed + 31)
    + ordinal * 0.618_033_988_75
  ) % 1;
  const crossUnit = 0.08 + 0.84 * deterministicUnit(
    ordinal,
    visualSeed + 47 + candidateIndex % INNER_KEEP_PERIMETER_TREE_SECTORS.length,
  );
  const along = interpolateRange(sector.alongRangeMeters, alongUnit);
  const cross = interpolateRange(sector.crossRangeMeters, crossUnit);
  const [x, z] = sector.sector === 'west' || sector.sector === 'east'
    ? [cross, along]
    : [along, cross];
  return Object.freeze({
    sector: sector.sector,
    positionMeters: grounded(x, z),
  });
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
  if (INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS.some((exclusion) => aabbOverlaps(
    center,
    candidate.halfExtentsMeters,
    [exclusion.center.x, exclusion.center.z],
    exclusion.halfExtentsMeters,
    exclusion.clearanceMarginMeters,
  ))) return false;
  if (INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS.some((exclusion) => aabbOverlaps(
    center,
    candidate.halfExtentsMeters,
    [exclusion.center.x, exclusion.center.z],
    [exclusion.radiusMeters, exclusion.radiusMeters],
    0,
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
  const trunkRadiusMeters = innerKeepAuthoredPerimeterTreeTrunkRadiusMeters(candidate);
  const trunkHalfExtents = [trunkRadiusMeters, trunkRadiusMeters] as const;
  for (let index = 0; index < INNER_KEEP_AUTHORED_TRADE_ROAD_POINTS.length - 1; index += 1) {
    if (segmentTouchesExpandedAabb(
      INNER_KEEP_AUTHORED_TRADE_ROAD_POINTS[index]!,
      INNER_KEEP_AUTHORED_TRADE_ROAD_POINTS[index + 1]!,
      center,
      trunkHalfExtents,
      INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS * 0.5
        + INNER_KEEP_AMBIENT_MINIMUM_BODY_CLEARANCE_METERS,
    )) return false;
  }
  for (const lane of INNER_KEEP_OUTER_WORLD_AMBIENT_LANES) {
    for (let index = 0; index < lane.points.length - 1; index += 1) {
      if (segmentTouchesExpandedAabb(
        lane.points[index]!,
        lane.points[index + 1]!,
        center,
        trunkHalfExtents,
        lane.reservedHalfWidthMeters
          + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
      )) return false;
    }
  }
  for (const road of INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      if (segmentTouchesExpandedAabb(
        road.points[index]!,
        road.points[index + 1]!,
        center,
        trunkHalfExtents,
        road.halfWidthMeters + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
      )) return false;
    }
  }
  for (let index = 0; index < INNER_KEEP_CITY_EDGE_APRON_POINTS.length; index += 1) {
    if (segmentTouchesExpandedAabb(
      INNER_KEEP_CITY_EDGE_APRON_POINTS[index]!,
      INNER_KEEP_CITY_EDGE_APRON_POINTS[
        (index + 1) % INNER_KEEP_CITY_EDGE_APRON_POINTS.length
      ]!,
      center,
      trunkHalfExtents,
      INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS
        + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
    )) return false;
  }
  for (const road of INNER_KEEP_CITY_DISTRICT_ROADS) {
    const segmentCount = road.closed ? road.points.length : road.points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      if (segmentTouchesExpandedAabb(
        road.points[index]!,
        road.points[(index + 1) % road.points.length]!,
        center,
        trunkHalfExtents,
        road.halfWidthMeters + INNER_KEEP_AUTHORED_PERIMETER_TREE_CLEARANCE_METERS,
      )) return false;
    }
  }
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
  terrainHeightAt?: (x: number, z: number) => number;
}>): readonly InnerKeepAuthoredPerimeterTreePlacement[] {
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
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
        const sector = INNER_KEEP_PERIMETER_TREE_SECTORS[
          candidateIndex % INNER_KEEP_PERIMETER_TREE_SECTORS.length
        ]!.sector;
        const sectorIndex = INNER_KEEP_PERIMETER_TREE_SECTOR_ORDER.indexOf(sector);
        const preferredSectorIndex = placementIndex
          % INNER_KEEP_PERIMETER_TREE_SECTOR_ORDER.length;
        const clockwiseDistance = (
          sectorIndex - preferredSectorIndex + INNER_KEEP_PERIMETER_TREE_SECTOR_ORDER.length
        ) % INNER_KEEP_PERIMETER_TREE_SECTOR_ORDER.length;
        const sectorRank = Math.min(
          clockwiseDistance,
          INNER_KEEP_PERIMETER_TREE_SECTOR_ORDER.length - clockwiseDistance,
        );
        return Object.freeze({
          candidateIndex,
          variationIndex,
          rank: sectorRank * 2
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
      const candidatePosition = treeCandidatePosition(
        candidate.candidateIndex,
        options.visualSeed,
        terrainHeightAt,
      );
      const placement = Object.freeze({
        speciesId,
        sector: candidatePosition.sector,
        placementIndex,
        candidateIndex: candidate.candidateIndex,
        name: `inner-keep-authored-perimeter-tree:${speciesId}:${placementIndex}`,
        positionMeters: candidatePosition.positionMeters,
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
  terrainHeightAt: (x: number, z: number) => number,
) {
  const treeGroup = new THREE.Group();
  treeGroup.name = 'inner-keep-authored-perimeter-trees';
  treeGroup.userData.presentationOnly = true;
  treeGroup.userData.gameplayAuthorityClaimed = false;
  treeGroup.userData.pickable = false;
  const copiesBySpecies = new Map<string, AuthoredCopy[]>();
  const placementsBySpecies = new Map<
    string,
    InnerKeepAuthoredPerimeterTreePlacement[]
  >();
  const yieldingGroups: YieldingPerimeterTreeGroup[] = [];
  const plan = planInnerKeepAuthoredPerimeterTrees({
    bundle,
    quality,
    visualSeed,
    terrainHeightAt,
  });
  for (const placement of plan) {
    const copies = copiesBySpecies.get(placement.speciesId) ?? [];
    copies.push(placement);
    copiesBySpecies.set(placement.speciesId, copies);
    const placements = placementsBySpecies.get(placement.speciesId) ?? [];
    placements.push(placement);
    placementsBySpecies.set(placement.speciesId, placements);
  }
  copiesBySpecies.forEach((copies, speciesId) => {
    const prefab = bundle.staticPrefabs.get(speciesId);
    const placements = placementsBySpecies.get(speciesId);
    if (!prefab || !placements) return;
    yieldingGroups.push(Object.freeze({
      controller: addAuthoredCopies(treeGroup, prefab, copies, true),
      placements: Object.freeze(placements),
    }));
  });
  treeGroup.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.gameplayAuthorityClaimed = false;
    object.userData.pickable = false;
    object.raycast = () => undefined;
  });
  target.add(treeGroup);
  return Object.freeze({
    count: plan.length,
    yieldingGroups: Object.freeze(yieldingGroups),
  });
}

function addWeatheredWallSkirt(
  target: THREE.Group,
  bundle: InnerKeepRuntimeAssetBundle,
) {
  const prefab = bundle.staticPrefabs.get(INNER_KEEP_WEATHERED_WALL_SKIRT_ASSET_ID);
  if (!prefab) return;
  const group = new THREE.Group();
  group.name = 'inner-keep-weathered-masonry-skirt';
  group.userData.presentationOnly = true;
  group.userData.gameplayAuthorityClaimed = false;
  group.userData.authoritativeBuilding = false;
  addAuthoredCopies(group, prefab, INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS.map(
    (placement) => Object.freeze({
      name: `inner-keep-weathered-wall-skirt:${placement.placementId}`,
      positionMeters: placement.positionMeters,
      rotationMilliDegrees: placement.rotationMilliDegrees,
      scalePermille: placement.scalePermille,
    }),
  ));
  group.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.gameplayAuthorityClaimed = false;
    object.userData.authoritativeBuilding = false;
    object.raycast = () => undefined;
  });
  target.add(group);
}

/**
 * Builds visual-only fixed placements from the exact runtime selection.
 * Constructible outcomes remain under reconcile() because only server
 * projections decide whether a player-placed building exists.
 */
export function createInnerKeepAuthoredStaticPresentation(options: Readonly<{
  bundle: InnerKeepRuntimeAssetBundle;
  quality: InnerKeepSceneQuality;
  visualSeed: number;
  terrainHeightAt?: (x: number, z: number) => number;
}>): InnerKeepAuthoredStaticPresentation {
  const terrainHeightAt = options.terrainHeightAt ?? innerKeepOuterWorldTerrainHeightAt;
  const group = new THREE.Group();
  group.name = 'inner-keep-authored-static-presentation';
  const yieldingFixedPlacementGroups: YieldingFixedPlacementGroup[] = [];
  let placementInstanceCount = 0;
  for (const placement of INNER_KEEP_PRESENTATION_PLACEMENTS) {
    if (placement.anchor !== 'fixed') continue;
    const prefab = options.bundle.staticPrefabs.get(placement.assetId);
    if (!prefab) continue;
    const copies = placement.instances.map((instance) => {
      const candidateVisualOverride =
        INNER_KEEP_PALISADE_VISUAL_OVERRIDE_BY_PLACEMENT_ID.get(
          instance.placementId,
        );
      const visualOverride = candidateVisualOverride?.assetId === placement.assetId
        ? candidateVisualOverride
        : undefined;
      return Object.freeze({
        name: `inner-keep-authored-placement:${instance.placementId}`,
        positionMeters: visualOverride?.positionMeters ?? instance.positionMeters,
        rotationMilliDegrees: visualOverride?.rotationMilliDegrees
          ?? instance.rotationMilliDegrees,
        scalePermille: visualOverride?.scalePermille ?? instance.scalePermille,
      });
    });
    const yieldsToBuildings =
      placement.collisionClearanceRole === 'decorative-slot-clearance';
    const controller = addAuthoredCopies(
      group,
      prefab,
      copies,
      yieldsToBuildings,
    );
    if (yieldsToBuildings) {
      yieldingFixedPlacementGroups.push(Object.freeze({
        controller,
        placementIds: Object.freeze(placement.instances.map(
          ({ placementId }) => placementId,
        )),
      }));
    }
    placementInstanceCount += placement.instances.length;
  }
  addWeatheredWallSkirt(group, options.bundle);
  const perimeterTrees = addPerimeterTrees(
    group,
    options.bundle,
    options.quality,
    options.visualSeed,
    terrainHeightAt,
  );
  return Object.freeze({
    group,
    loadedAssetCount: options.bundle.staticPrefabs.size,
    placementInstanceCount,
    authoredTreeCount: perimeterTrees.count,
    cathedralReady: options.bundle.staticPrefabs.has('grand-covenant-cathedral'),
    barracksReady: options.bundle.staticPrefabs.has('city-barracks'),
    reconcileBuildingExclusions: (
      buildings: readonly InnerKeepAuthoredBuildingExclusion[],
    ) => {
      let hiddenPlacementCount = 0;
      for (const yieldingGroup of yieldingFixedPlacementGroups) {
        const visibleCopies = yieldingGroup.placementIds.map((placementId) => {
          const visible = !buildings.some((building) => (
            innerKeepFixedDressingIntersectsBuilding(placementId, building)
          ));
          if (!visible) hiddenPlacementCount += 1;
          return visible;
        });
        yieldingGroup.controller.setVisibleCopies(visibleCopies);
      }
      for (const yieldingGroup of perimeterTrees.yieldingGroups) {
        yieldingGroup.controller.setVisibleCopies(yieldingGroup.placements.map((tree) => (
          !buildings.some((building) => (
            innerKeepAuthoredPerimeterTreeIntersectsBuilding(tree, building)
          ))
        )));
      }
      return hiddenPlacementCount;
    },
  });
}

function buildingTemplateScale(buildingKind: InnerKeepBuildingKind) {
  const placement = INNER_KEEP_PRESENTATION_PLACEMENTS.find((candidate) => (
    candidate.assetId === buildingKind
    && candidate.anchor === 'free-placement-template'
  ));
  return (placement?.instances[0]?.scalePermille[0] ?? 1_000) / 1_000;
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
  root.scale.setScalar(buildingTemplateScale(options.buildingKind));
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

/** Exact native-scale project outcomes; none is an initial static placement. */
export function allInnerKeepConstructibleRuntimeAssetIds() {
  return Object.freeze(INNER_KEEP_PRESENTATION_PLACEMENTS
    .filter(({ anchor }) => anchor === 'free-placement-template')
    .map(({ assetId }) => assetId));
}

/** Fixed scenery can install even when an unbuilt project prefab is unavailable. */
export function allInnerKeepStaticSceneryRuntimeAssetIds() {
  return Object.freeze(INNER_KEEP_PRESENTATION_PLACEMENTS
    .filter(({ anchor }) => anchor === 'fixed')
    .map(({ assetId }) => assetId));
}

export function hasCompleteInnerKeepStaticRuntimeCoverage(
  bundle: Pick<InnerKeepRuntimeAssetBundle, 'staticPrefabs'>,
) {
  return allInnerKeepStaticSceneryRuntimeAssetIds().every((assetId) => (
    bundle.staticPrefabs.has(assetId)
  ));
}
