import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';

/**
 * Presentation-only landscape around the canonical Inner Keep compound.
 *
 * Nothing in this policy creates a resource node, changes a balance, or grants
 * a gameplay action. The shared sampler exists so decorative terrain, props,
 * and ambient actors can meet the same ground without becoming authoritative.
 */
export const INNER_KEEP_OUTER_WORLD_POLICY_VERSION =
  'inner-keep-outer-world-presentation-v1';

export const INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS = Object.freeze([
  24,
  26,
] as const);

export const INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU = Object.freeze({
  minimumX: -16.55,
  maximumX: 16.55,
  minimumZ: -17.35,
  maximumZ: 10.85,
  elevationMeters: 0,
  outerFeatherMeters: 3,
});

export const INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS = Object.freeze({
  minimum: -0.72,
  maximum: 4.8,
});

export type InnerKeepOuterWorldTopographicFeature = Readonly<{
  featureId: string;
  name: string;
  kind: 'ridge' | 'shelf' | 'meadow' | 'woodland' | 'watercourse' | 'lake';
  centerMeters: readonly [number, number];
  description: string;
}>;

export const INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES:
readonly InnerKeepOuterWorldTopographicFeature[] = Object.freeze([
  Object.freeze({
    featureId: 'northern-crown-ridge',
    name: 'Northern Crown Ridge',
    kind: 'ridge',
    centerMeters: Object.freeze([0, -24] as const),
    description: 'A broad northern rise that silhouettes the estate approach.',
  }),
  Object.freeze({
    featureId: 'goldvein-rise',
    name: 'Goldvein Rise',
    kind: 'ridge',
    centerMeters: Object.freeze([-6.5, -23.7] as const),
    description: 'A weathered north-west shoulder around the scenic gold site.',
  }),
  Object.freeze({
    featureId: 'granite-scar',
    name: 'Granite Scar',
    kind: 'shelf',
    centerMeters: Object.freeze([10.2, -23.7] as const),
    description: 'A stepped stone shelf carrying the scenic quarry.',
  }),
  Object.freeze({
    featureId: 'headwater-shelf',
    name: 'Headwater Shelf',
    kind: 'shelf',
    centerMeters: Object.freeze([21, -23] as const),
    description: 'High eastern ground where the visible watercourse begins.',
  }),
  Object.freeze({
    featureId: 'western-watch-hills',
    name: 'Western Watch Hills',
    kind: 'ridge',
    centerMeters: Object.freeze([-21, -4] as const),
    description: 'Rolling watch hills beyond the western wall.',
  }),
  Object.freeze({
    featureId: 'southfield-meadows',
    name: 'Southfield Meadows',
    kind: 'meadow',
    centerMeters: Object.freeze([-7, 18] as const),
    description: 'Open farm country around the wheat and logging clearings.',
  }),
  Object.freeze({
    featureId: 'alderwood-margin',
    name: 'Alderwood Margin',
    kind: 'woodland',
    centerMeters: Object.freeze([13, 18] as const),
    description: 'A damp woodland edge between the road and the lower water.',
  }),
  Object.freeze({
    featureId: 'eastwall-rill',
    name: 'Eastwall Rill',
    kind: 'watercourse',
    centerMeters: Object.freeze([17.5, 0] as const),
    description: 'One connected stream descending along the eastern wall.',
  }),
  Object.freeze({
    featureId: 'south-eastern-mere',
    name: 'South-eastern Mere',
    kind: 'lake',
    centerMeters: Object.freeze([18.6, 17.5] as const),
    description: 'A visible lowland lake receiving the east-wall stream.',
  }),
]);

export type InnerKeepOuterWorldResourceKind = 'gold' | 'food' | 'wood' | 'stone';

export type InnerKeepOuterWorldResourceSite = Readonly<{
  siteId: string;
  name: string;
  resourceKind: InnerKeepOuterWorldResourceKind;
  assetId: string;
  positionMeters: readonly [number, number, number];
  rotationYMilliDegrees: number;
  targetFootprintDiameter: number;
  padRadiusMeters: number;
  padFeatherMeters: number;
  instancesByQuality: Readonly<Record<InnerKeepSceneQuality, number>>;
  presentationOnly: true;
  authoritativeResourceNode: false;
  gameplayAuthority: 'none';
}>;

const RESOURCE_SITE_DEFINITIONS = Object.freeze([
  Object.freeze({
    siteId: 'southfield-wheat-farm',
    name: 'Southfield Wheat Farm',
    resourceKind: 'food',
    assetId: 'hegemony-wheat-farm',
    x: -8.7,
    y: 0.22,
    z: 18.2,
    rotationYMilliDegrees: 9_000,
    targetFootprintDiameter: 3.6,
    padRadiusMeters: 2.65,
    padFeatherMeters: 1.15,
    instancesByQuality: Object.freeze({ high: 2, balanced: 1, reduced: 1 }),
  }),
  Object.freeze({
    siteId: 'southfield-logging-camp',
    name: 'Southfield Logging Camp',
    resourceKind: 'wood',
    assetId: 'hegemony-logging-camp',
    x: 4,
    y: 0.3,
    z: 18.4,
    rotationYMilliDegrees: -12_000,
    targetFootprintDiameter: 3.8,
    padRadiusMeters: 2.8,
    padFeatherMeters: 1.2,
    instancesByQuality: Object.freeze({ high: 2, balanced: 2, reduced: 1 }),
  }),
  Object.freeze({
    siteId: 'granite-scar-quarry',
    name: 'Granite Scar Quarry',
    resourceKind: 'stone',
    assetId: 'hegemony-stone-quarry',
    x: 10.2,
    y: 1.68,
    z: -23.7,
    rotationYMilliDegrees: 168_000,
    targetFootprintDiameter: 3.8,
    padRadiusMeters: 2.15,
    padFeatherMeters: 0.9,
    instancesByQuality: Object.freeze({ high: 2, balanced: 2, reduced: 1 }),
  }),
  Object.freeze({
    siteId: 'goldvein-scenic-mine',
    name: 'Goldvein Scenic Mine',
    resourceKind: 'gold',
    assetId: 'hegemony-gold-mine',
    x: -6.5,
    y: 1.54,
    z: -23.7,
    rotationYMilliDegrees: 194_000,
    targetFootprintDiameter: 3.4,
    padRadiusMeters: 2.1,
    padFeatherMeters: 0.9,
    instancesByQuality: Object.freeze({ high: 2, balanced: 1, reduced: 1 }),
  }),
] as const);

export const INNER_KEEP_OUTER_WORLD_RESOURCE_SITES:
readonly InnerKeepOuterWorldResourceSite[] = Object.freeze(
  RESOURCE_SITE_DEFINITIONS.map((site) => Object.freeze({
    siteId: site.siteId,
    name: site.name,
    resourceKind: site.resourceKind,
    assetId: site.assetId,
    positionMeters: Object.freeze([site.x, site.y, site.z] as const),
    rotationYMilliDegrees: site.rotationYMilliDegrees,
    targetFootprintDiameter: site.targetFootprintDiameter,
    padRadiusMeters: site.padRadiusMeters,
    padFeatherMeters: site.padFeatherMeters,
    instancesByQuality: site.instancesByQuality,
    presentationOnly: true as const,
    authoritativeResourceNode: false as const,
    gameplayAuthority: 'none' as const,
  })),
);

export type InnerKeepOuterWorldWaterPoint = Readonly<{
  x: number;
  z: number;
  width: number;
  y: number;
}>;

/** Headwater -> east-wall rill -> lake inlet; every point is strictly downhill. */
export const INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE:
readonly InnerKeepOuterWorldWaterPoint[] = Object.freeze([
  Object.freeze({ x: 20.4, z: -22.8, width: 0.78, y: 1.76 }),
  Object.freeze({ x: 20.3, z: -20.7, width: 0.8, y: 1.52 }),
  Object.freeze({ x: 20.15, z: -18.3, width: 0.76, y: 1.25 }),
  Object.freeze({ x: 19.8, z: -14.8, width: 0.68, y: 0.84 }),
  Object.freeze({ x: 17.5, z: -8.8, width: 0.58, y: 0.42 }),
  Object.freeze({ x: 17.5, z: -6.1, width: 0.6, y: 0.401 }),
  Object.freeze({ x: 17.5, z: -3.35, width: 0.62, y: 0.382 }),
  Object.freeze({ x: 17.5, z: -0.55, width: 0.62, y: 0.363 }),
  Object.freeze({ x: 17.5, z: 2.25, width: 0.64, y: 0.344 }),
  Object.freeze({ x: 17.5, z: 4.9, width: 0.66, y: 0.325 }),
  Object.freeze({ x: 17.5, z: 6.85, width: 0.7, y: 0.306 }),
  Object.freeze({ x: 20.6, z: 8.2, width: 0.8, y: 0.278 }),
  Object.freeze({ x: 20.5, z: 11.8, width: 0.94, y: 0.247 }),
  Object.freeze({ x: 18.6, z: 14.8, width: 1.12, y: 0.205 }),
]);

export const INNER_KEEP_OUTER_WORLD_LAKE = Object.freeze({
  center: Object.freeze({ x: 18.6, y: 0.19, z: 17.5 }),
  radii: Object.freeze({ x: 2.5, z: 2.7 }),
});

export const INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS = Object.freeze([
  Object.freeze({ x: -20.5, z: -20.4 }),
  Object.freeze({ x: -12, z: -20.4 }),
  Object.freeze({ x: 0, z: -20.4 }),
  Object.freeze({ x: 7, z: -20.4 }),
  Object.freeze({ x: 14.7, z: -20.4 }),
  Object.freeze({ x: 15.2, z: -23.8 }),
  Object.freeze({ x: 18, z: -25 }),
  Object.freeze({ x: 22.6, z: -24 }),
  Object.freeze({ x: 22.8, z: -17 }),
  Object.freeze({ x: 22.8, z: -8 }),
  Object.freeze({ x: 22.8, z: 1 }),
  Object.freeze({ x: 22.8, z: 9 }),
  Object.freeze({ x: 22.8, z: 15 }),
  Object.freeze({ x: 22.7, z: 21.5 }),
  Object.freeze({ x: 17, z: 23 }),
  Object.freeze({ x: 9, z: 23 }),
  Object.freeze({ x: 0, z: 23 }),
  Object.freeze({ x: -9, z: 22.8 }),
  Object.freeze({ x: -16, z: 21 }),
  Object.freeze({ x: -20, z: 16 }),
  Object.freeze({ x: -20.5, z: 8 }),
  Object.freeze({ x: -20.5, z: 0 }),
  Object.freeze({ x: -20.3, z: -9 }),
  Object.freeze({ x: -20.5, z: -15 }),
] as const);

export const INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT = Object.freeze({
  roadId: 'outer-estate-patrol-road',
  closed: true,
  halfWidthMeters: 1.15,
  points: INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS,
  presentationOnly: true,
  gameplayAuthority: 'none',
});

export const INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS = Object.freeze({
  high: Object.freeze({
    terrainSegments: Object.freeze([64, 70] as const),
    grassBlades: 2_400,
    authoredTrees: 72,
    wildlifeActors: 10,
  }),
  balanced: Object.freeze({
    terrainSegments: Object.freeze([48, 54] as const),
    grassBlades: 1_400,
    authoredTrees: 44,
    wildlifeActors: 7,
  }),
  reduced: Object.freeze({
    terrainSegments: Object.freeze([30, 34] as const),
    grassBlades: 480,
    authoredTrees: 22,
    wildlifeActors: 4,
  }),
} satisfies Readonly<Record<InnerKeepSceneQuality, Readonly<{
  terrainSegments: readonly [number, number];
  grassBlades: number;
  authoredTrees: number;
  wildlifeActors: number;
}>>>);

export const INNER_KEEP_OUTER_WORLD_TREE_SPECIES_IDS = Object.freeze([
  'warpkeep.tree.birch.fresh-slender',
  'warpkeep.tree.cypress.ancient-dark',
  'warpkeep.tree.maple.meadow-round',
  'warpkeep.tree.oak.spring-broad',
  'warpkeep.tree.pine.alpine',
  'warpkeep.tree.spruce.deep-narrow',
] as const);

/** Backward-compatible semantic alias for presenters that call these assets. */
export const INNER_KEEP_OUTER_WORLD_TREE_ASSET_IDS =
  INNER_KEEP_OUTER_WORLD_TREE_SPECIES_IDS;

export const INNER_KEEP_OUTER_WORLD_TREE_BUDGETS = Object.freeze({
  high: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.high.authoredTrees,
  balanced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.balanced.authoredTrees,
  reduced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.reduced.authoredTrees,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

export const INNER_KEEP_OUTER_WORLD_WILDLIFE_BUDGETS = Object.freeze({
  high: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.high.wildlifeActors,
  balanced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.balanced.wildlifeActors,
  reduced: INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.reduced.wildlifeActors,
} satisfies Readonly<Record<InnerKeepSceneQuality, number>>);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep01(value: number) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function gaussian(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
) {
  const normalizedX = (x - centerX) / radiusX;
  const normalizedZ = (z - centerZ) / radiusZ;
  return Math.exp(-(normalizedX * normalizedX + normalizedZ * normalizedZ));
}

export function innerKeepOuterWorldDistanceToSegment(
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
) {
  const deltaX = toX - fromX;
  const deltaZ = toZ - fromZ;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const progress = lengthSquared <= 0.000_001
    ? 0
    : clamp(((x - fromX) * deltaX + (z - fromZ) * deltaZ) / lengthSquared, 0, 1);
  return Math.hypot(
    x - (fromX + deltaX * progress),
    z - (fromZ + deltaZ * progress),
  );
}

function outsidePlateauDistance(x: number, z: number) {
  const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
  const deltaX = Math.max(plateau.minimumX - x, 0, x - plateau.maximumX);
  const deltaZ = Math.max(plateau.minimumZ - z, 0, z - plateau.maximumZ);
  return Math.hypot(deltaX, deltaZ);
}

function nearestWaterSample(x: number, z: number) {
  const nearest = { distance: Number.POSITIVE_INFINITY, width: 0, y: 0 };
  for (let index = 0; index < INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE.length - 1; index += 1) {
    const from = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[index]!;
    const to = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[index + 1]!;
    const deltaX = to.x - from.x;
    const deltaZ = to.z - from.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const progress = lengthSquared <= 0.000_001
      ? 0
      : clamp(((x - from.x) * deltaX + (z - from.z) * deltaZ) / lengthSquared, 0, 1);
    const distance = Math.hypot(
      x - (from.x + deltaX * progress),
      z - (from.z + deltaZ * progress),
    );
    if (distance < nearest.distance) {
      nearest.distance = distance;
      nearest.width = from.width + (to.width - from.width) * progress;
      nearest.y = from.y + (to.y - from.y) * progress;
    }
  }
  return nearest;
}

function rawTerrainHeightAt(x: number, z: number) {
  const rollingNoise = Math.sin(x * 0.28 + z * 0.11) * 0.16
    + Math.cos(z * 0.24 - x * 0.08) * 0.13
    + Math.sin((x + z) * 0.47) * 0.07;
  return 0.16
    + rollingNoise
    + gaussian(x, z, 0, -24, 13, 4.2) * 3.05
    + gaussian(x, z, -8, -22, 5.8, 4.6) * 1.15
    + gaussian(x, z, 10.5, -21.5, 5.2, 4.1) * 1.35
    + gaussian(x, z, 21, -21, 4.8, 7.2) * 1.45
    + gaussian(x, z, -21, -4, 4.5, 10.5) * 1.65
    + gaussian(x, z, -8, 19, 10, 6.5) * 0.58
    + gaussian(x, z, 12.5, 18, 7.5, 6.2) * 0.42
    - gaussian(x, z, 18.6, 17.5, 4.5, 4.5) * 0.88;
}

/** Deterministic, finite ground elevation shared by all outer-world presenters. */
export function innerKeepOuterWorldTerrainHeightAt(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  let height = rawTerrainHeightAt(x, z);

  const water = nearestWaterSample(x, z);
  const waterValleyRadius = water.width * 0.5 + 1.55;
  if (water.distance < waterValleyRadius) {
    const blend = smoothstep01(1 - water.distance / waterValleyRadius);
    height += (water.y - 0.16 - height) * blend;
  }

  const lake = INNER_KEEP_OUTER_WORLD_LAKE;
  const lakeDistance = Math.hypot(
    (x - lake.center.x) / (lake.radii.x + 1.2),
    (z - lake.center.z) / (lake.radii.z + 1.2),
  );
  if (lakeDistance < 1) {
    const blend = smoothstep01(1 - lakeDistance);
    height += (lake.center.y - 0.2 - height) * blend;
  }

  for (const site of RESOURCE_SITE_DEFINITIONS) {
    const distance = Math.hypot(x - site.x, z - site.z);
    if (distance <= site.padRadiusMeters) {
      height = site.y;
      break;
    }
    if (distance < site.padRadiusMeters + site.padFeatherMeters) {
      const blend = smoothstep01(
        1 - (distance - site.padRadiusMeters) / site.padFeatherMeters,
      );
      height += (site.y - height) * blend;
    }
  }

  const plateauDistance = outsidePlateauDistance(x, z);
  if (plateauDistance <= 0) return 0;
  height *= smoothstep01(
    plateauDistance / INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU.outerFeatherMeters,
  );
  return clamp(
    height,
    INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.minimum,
    INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.maximum,
  );
}

export function innerKeepOuterWorldTerrainSlopeAt(x: number, z: number) {
  const sampleStepMeters = 0.2;
  const deltaX = (
    innerKeepOuterWorldTerrainHeightAt(x + sampleStepMeters, z)
    - innerKeepOuterWorldTerrainHeightAt(x - sampleStepMeters, z)
  ) / (sampleStepMeters * 2);
  const deltaZ = (
    innerKeepOuterWorldTerrainHeightAt(x, z + sampleStepMeters)
    - innerKeepOuterWorldTerrainHeightAt(x, z - sampleStepMeters)
  ) / (sampleStepMeters * 2);
  return Math.hypot(deltaX, deltaZ);
}

export function innerKeepOuterWorldDistanceToWater(x: number, z: number) {
  const streamDistance = nearestWaterSample(x, z).distance;
  const lake = INNER_KEEP_OUTER_WORLD_LAKE;
  const normalizedLakeDistance = Math.hypot(
    (x - lake.center.x) / lake.radii.x,
    (z - lake.center.z) / lake.radii.z,
  );
  const lakeEdgeDistance = normalizedLakeDistance <= 1
    ? 0
    : (normalizedLakeDistance - 1) * Math.min(lake.radii.x, lake.radii.z);
  return Math.min(streamDistance, lakeEdgeDistance);
}

export function innerKeepOuterWorldDistanceToRoad(x: number, z: number) {
  let nearest = Number.POSITIVE_INFINITY;
  const points = INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.points;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    nearest = Math.min(
      nearest,
      innerKeepOuterWorldDistanceToSegment(x, z, from.x, from.z, to.x, to.z),
    );
  }
  return nearest;
}

export function innerKeepOuterWorldDistanceToResourceSite(x: number, z: number) {
  return INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.reduce((nearest, site) => Math.min(
    nearest,
    Math.hypot(x - site.positionMeters[0], z - site.positionMeters[2])
      - site.padRadiusMeters,
  ), Number.POSITIVE_INFINITY);
}

/** Clear of the terrain edge, water, scenic sites, roads, and unsafe slopes. */
export function innerKeepOuterWorldPointIsClear(
  x: number,
  z: number,
  clearanceMeters = 0,
) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(clearanceMeters)) {
    return false;
  }
  const clearance = Math.max(0, clearanceMeters);
  const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
  if (
    x >= plateau.minimumX - clearance
    && x <= plateau.maximumX + clearance
    && z >= plateau.minimumZ - clearance
    && z <= plateau.maximumZ + clearance
  ) return false;
  const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  if (Math.abs(x) > halfWidth - 0.35 - clearance) return false;
  if (Math.abs(z) > halfDepth - 0.35 - clearance) return false;
  const water = nearestWaterSample(x, z);
  if (water.distance <= water.width * 0.5 + 0.38 + clearance) return false;
  if (innerKeepOuterWorldDistanceToWater(x, z) <= 0.38 + clearance) return false;
  if (innerKeepOuterWorldDistanceToResourceSite(x, z) <= 0.45 + clearance) return false;
  if (
    innerKeepOuterWorldDistanceToRoad(x, z)
    <= INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters + 0.22 + clearance
  ) return false;
  return innerKeepOuterWorldTerrainSlopeAt(x, z) <= 0.62;
}

export const INNER_KEEP_OUTER_WORLD_TRADE_ROUTE = Object.freeze([
  Object.freeze([-22.4, innerKeepOuterWorldTerrainHeightAt(-22.4, 20.6), 20.6] as const),
  Object.freeze([-16.4, innerKeepOuterWorldTerrainHeightAt(-16.4, 17.8), 17.8] as const),
  Object.freeze([-11.8, innerKeepOuterWorldTerrainHeightAt(-11.8, 15.4), 15.4] as const),
  Object.freeze([-5.8, innerKeepOuterWorldTerrainHeightAt(-5.8, 12.8), 12.8] as const),
  Object.freeze([0, innerKeepOuterWorldTerrainHeightAt(0, 11.7), 11.7] as const),
  Object.freeze([0, innerKeepOuterWorldTerrainHeightAt(0, 9.2), 9.2] as const),
] as const);
