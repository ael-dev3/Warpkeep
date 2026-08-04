import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';

/**
 * Presentation-only landscape around the canonical Inner Keep compound.
 *
 * Nothing in this policy creates a resource node, changes a balance, or grants
 * a gameplay action. The shared sampler exists so decorative terrain, props,
 * and ambient actors can meet the same ground without becoming authoritative.
 */
export const INNER_KEEP_OUTER_WORLD_POLICY_VERSION =
  'inner-keep-outer-world-presentation-v2';

export const INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS = Object.freeze([
  34,
  38,
] as const);

export const INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU = Object.freeze({
  minimumX: -24.2,
  maximumX: 24.2,
  minimumZ: -25,
  maximumZ: 19,
  centerX: 0,
  centerZ: -3,
  cornerRadiusMeters: 5,
  elevationMeters: 0,
  outerFeatherMeters: 5.5,
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
    centerMeters: Object.freeze([0, -36] as const),
    description: 'A broad northern rise that silhouettes the estate approach.',
  }),
  Object.freeze({
    featureId: 'goldvein-rise',
    name: 'Goldvein Rise',
    kind: 'ridge',
    centerMeters: Object.freeze([-9, -31] as const),
    description: 'A weathered north-west shoulder around the scenic gold site.',
  }),
  Object.freeze({
    featureId: 'granite-scar',
    name: 'Granite Scar',
    kind: 'shelf',
    centerMeters: Object.freeze([12, -31] as const),
    description: 'A stepped stone shelf carrying the scenic quarry.',
  }),
  Object.freeze({
    featureId: 'headwater-shelf',
    name: 'Headwater Shelf',
    kind: 'shelf',
    centerMeters: Object.freeze([30, -33] as const),
    description: 'High eastern ground where the visible watercourse begins.',
  }),
  Object.freeze({
    featureId: 'western-watch-hills',
    name: 'Western Watch Hills',
    kind: 'ridge',
    centerMeters: Object.freeze([-31, -4] as const),
    description: 'Rolling watch hills beyond the western wall.',
  }),
  Object.freeze({
    featureId: 'southfield-meadows',
    name: 'Southfield Meadows',
    kind: 'meadow',
    centerMeters: Object.freeze([-10, 29] as const),
    description: 'Open farm country around the wheat and logging clearings.',
  }),
  Object.freeze({
    featureId: 'alderwood-margin',
    name: 'Alderwood Margin',
    kind: 'woodland',
    centerMeters: Object.freeze([14, 29] as const),
    description: 'A damp woodland edge between the road and the lower water.',
  }),
  Object.freeze({
    featureId: 'eastwall-rill',
    name: 'Eastwall Rill',
    kind: 'watercourse',
    centerMeters: Object.freeze([29, -3] as const),
    description: 'One connected stream descending along the eastern wall.',
  }),
  Object.freeze({
    featureId: 'south-eastern-mere',
    name: 'South-eastern Mere',
    kind: 'lake',
    centerMeters: Object.freeze([29, 27] as const),
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
    x: -10,
    y: 0.22,
    z: 28.5,
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
    x: 5,
    y: 0.3,
    z: 29,
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
    x: 12,
    y: 1.68,
    z: -31,
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
    x: -9,
    y: 1.54,
    z: -31,
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
  Object.freeze({ x: 30.2, z: -33.2, width: 0.78, y: 1.76 }),
  Object.freeze({ x: 30.4, z: -30.8, width: 0.8, y: 1.52 }),
  Object.freeze({ x: 30.5, z: -27.8, width: 0.76, y: 1.25 }),
  Object.freeze({ x: 30.1, z: -23.8, width: 0.68, y: 0.84 }),
  Object.freeze({ x: 29.4, z: -18, width: 0.58, y: 0.55 }),
  Object.freeze({ x: 28.9, z: -13, width: 0.6, y: 0.48 }),
  Object.freeze({ x: 28.7, z: -8, width: 0.62, y: 0.44 }),
  Object.freeze({ x: 28.6, z: -3, width: 0.62, y: 0.4 }),
  Object.freeze({ x: 28.7, z: 2, width: 0.64, y: 0.36 }),
  Object.freeze({ x: 28.6, z: 7, width: 0.66, y: 0.32 }),
  Object.freeze({ x: 28.5, z: 12, width: 0.7, y: 0.285 }),
  Object.freeze({ x: 30, z: 16.5, width: 0.8, y: 0.255 }),
  Object.freeze({ x: 30.2, z: 20.5, width: 0.94, y: 0.225 }),
  Object.freeze({ x: 29, z: 23.8, width: 1.12, y: 0.205 }),
]);

export const INNER_KEEP_OUTER_WORLD_LAKE = Object.freeze({
  center: Object.freeze({ x: 29, y: 0.19, z: 27 }),
  radii: Object.freeze({ x: 2.2, z: 3.2 }),
});

export const INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS = Object.freeze([
  Object.freeze({ x: -31, z: -29 }),
  Object.freeze({ x: -27, z: -33.5 }),
  Object.freeze({ x: -20, z: -35 }),
  Object.freeze({ x: -10, z: -35 }),
  Object.freeze({ x: 0, z: -35 }),
  Object.freeze({ x: 10, z: -35 }),
  Object.freeze({ x: 20, z: -35 }),
  Object.freeze({ x: 27, z: -35.5 }),
  Object.freeze({ x: 31.8, z: -35.4 }),
  Object.freeze({ x: 32.8, z: -31 }),
  Object.freeze({ x: 32, z: -22 }),
  Object.freeze({ x: 32, z: -12 }),
  Object.freeze({ x: 32, z: -2 }),
  Object.freeze({ x: 32, z: 8 }),
  Object.freeze({ x: 32, z: 18 }),
  Object.freeze({ x: 32.7, z: 23.5 }),
  Object.freeze({ x: 32.84, z: 30.5 }),
  Object.freeze({ x: 32.84, z: 33 }),
  Object.freeze({ x: 26, z: 33 }),
  Object.freeze({ x: 16, z: 33 }),
  Object.freeze({ x: 5, z: 33 }),
  Object.freeze({ x: -6, z: 33 }),
  Object.freeze({ x: -17, z: 33 }),
  Object.freeze({ x: -26, z: 32 }),
  Object.freeze({ x: -31, z: 27 }),
  Object.freeze({ x: -32, z: 18 }),
  Object.freeze({ x: -32, z: 8 }),
  Object.freeze({ x: -32, z: -2 }),
  Object.freeze({ x: -32, z: -12 }),
  Object.freeze({ x: -32, z: -22 }),
] as const);

export const INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT = Object.freeze({
  roadId: 'outer-estate-patrol-road',
  closed: true,
  halfWidthMeters: 1.15,
  points: INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS,
  presentationOnly: true,
  gameplayAuthority: 'none',
});

export const INNER_KEEP_OUTER_WORLD_APPROACHES = Object.freeze({
  northernResourceRoadZ: -35,
  southernResourceRoadZ: 33,
  gateOuterZ: 16.8,
  gateInnerZ: 13.6,
});

export type InnerKeepCityPresentationRoad = Readonly<{
  points: readonly Readonly<{ x: number; z: number }>[];
  closed: boolean;
  halfWidthMeters: number;
}>;

/** Presentation-only ground treatment that softens the palisade perimeter. */
export const INNER_KEEP_CITY_EDGE_APRON_POINTS = Object.freeze([
  Object.freeze({ x: -16, z: -21.15 }),
  Object.freeze({ x: -8.1, z: -21.34 }),
  Object.freeze({ x: 0.2, z: -21.12 }),
  Object.freeze({ x: 8.15, z: -21.3 }),
  Object.freeze({ x: 16, z: -21.08 }),
  Object.freeze({ x: 20.18, z: -17 }),
  Object.freeze({ x: 20.34, z: -9.1 }),
  Object.freeze({ x: 20.12, z: -1 }),
  Object.freeze({ x: 20.3, z: 7.1 }),
  Object.freeze({ x: 20.12, z: 11 }),
  Object.freeze({ x: 16.05, z: 15.08 }),
  Object.freeze({ x: 8.2, z: 15.22 }),
  Object.freeze({ x: 0, z: 15.1 }),
  Object.freeze({ x: -8.15, z: 15.25 }),
  Object.freeze({ x: -16.1, z: 15.06 }),
  Object.freeze({ x: -20.16, z: 11 }),
  Object.freeze({ x: -20.32, z: 7 }),
  Object.freeze({ x: -20.14, z: -1.1 }),
  Object.freeze({ x: -20.3, z: -9 }),
  Object.freeze({ x: -20.12, z: -17.05 }),
] as const);

/** Presentation-only district lanes shared by rendering and ecology clearance. */
export const INNER_KEEP_CITY_DISTRICT_ROADS:
readonly InnerKeepCityPresentationRoad[] = Object.freeze([
  Object.freeze({
    points: Object.freeze([
      Object.freeze({ x: -17.2, z: -15.7 }),
      Object.freeze({ x: -17.4, z: -7.8 }),
      Object.freeze({ x: -17.15, z: 0 }),
      Object.freeze({ x: -17.35, z: 7.8 }),
      Object.freeze({ x: -16.2, z: 11.5 }),
    ]),
    closed: false,
    halfWidthMeters: 0.62,
  }),
  Object.freeze({
    points: Object.freeze([
      Object.freeze({ x: 17.2, z: -15.7 }),
      Object.freeze({ x: 17.4, z: -7.8 }),
      Object.freeze({ x: 17.15, z: 0 }),
      Object.freeze({ x: 17.35, z: 7.8 }),
      Object.freeze({ x: 16.2, z: 11.5 }),
    ]),
    closed: false,
    halfWidthMeters: 0.62,
  }),
  Object.freeze({
    points: Object.freeze([
      Object.freeze({ x: -16.2, z: 11.5 }),
      Object.freeze({ x: -10, z: 12.45 }),
      Object.freeze({ x: 0, z: 13.15 }),
      Object.freeze({ x: 10, z: 12.45 }),
      Object.freeze({ x: 16.2, z: 11.5 }),
    ]),
    closed: false,
    halfWidthMeters: 0.68,
  }),
  Object.freeze({
    points: Object.freeze([
      Object.freeze({ x: -17.2, z: -0.15 }),
      Object.freeze({ x: -13.2, z: -0.1 }),
    ]),
    closed: false,
    halfWidthMeters: 0.52,
  }),
  Object.freeze({
    points: Object.freeze([
      Object.freeze({ x: 13.2, z: -0.1 }),
      Object.freeze({ x: 17.2, z: -0.15 }),
    ]),
    closed: false,
    halfWidthMeters: 0.52,
  }),
  Object.freeze({
    points: Object.freeze([
      Object.freeze({ x: -17.2, z: -15.7 }),
      Object.freeze({ x: -13.1, z: -18.2 }),
      Object.freeze({ x: -7.4, z: -19.2 }),
    ]),
    closed: false,
    halfWidthMeters: 0.54,
  }),
  Object.freeze({
    points: Object.freeze([
      Object.freeze({ x: 7.4, z: -19.2 }),
      Object.freeze({ x: 13.1, z: -18.2 }),
      Object.freeze({ x: 17.2, z: -15.7 }),
    ]),
    closed: false,
    halfWidthMeters: 0.54,
  }),
]);

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

/** Signed distance from a point to the nearest presentation-only district lane. */
export function innerKeepCityDistrictRoadEdgeDistance(x: number, z: number) {
  let nearestEdge = Number.POSITIVE_INFINITY;
  for (const road of INNER_KEEP_CITY_DISTRICT_ROADS) {
    const segmentCount = road.closed ? road.points.length : road.points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const from = road.points[index]!;
      const to = road.points[(index + 1) % road.points.length]!;
      nearestEdge = Math.min(
        nearestEdge,
        innerKeepOuterWorldDistanceToSegment(x, z, from.x, from.z, to.x, to.z)
          - road.halfWidthMeters,
      );
    }
  }
  return nearestEdge;
}

/** Signed distance to the rounded, level city shoulder; negative is inside. */
export function innerKeepOuterWorldCompoundPlateauSignedDistance(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return Number.POSITIVE_INFINITY;
  const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
  const halfWidth = (plateau.maximumX - plateau.minimumX) * 0.5;
  const halfDepth = (plateau.maximumZ - plateau.minimumZ) * 0.5;
  const radius = Math.min(plateau.cornerRadiusMeters, halfWidth, halfDepth);
  const coreHalfWidth = halfWidth - radius;
  const coreHalfDepth = halfDepth - radius;
  const deltaX = Math.abs(x - plateau.centerX) - coreHalfWidth;
  const deltaZ = Math.abs(z - plateau.centerZ) - coreHalfDepth;
  return Math.hypot(Math.max(deltaX, 0), Math.max(deltaZ, 0))
    + Math.min(Math.max(deltaX, deltaZ), 0)
    - radius;
}

function outsidePlateauDistance(x: number, z: number) {
  const signedDistance = innerKeepOuterWorldCompoundPlateauSignedDistance(x, z);
  return signedDistance <= 0.000_000_001 ? 0 : signedDistance;
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
  const rollingNoise = Math.sin(x * 0.24 + z * 0.09) * 0.13
    + Math.cos(z * 0.2 - x * 0.07) * 0.1
    + Math.sin((x + z) * 0.39) * 0.055;
  return 0.14
    + rollingNoise
    + gaussian(x, z, 0, -36, 14, 3.5) * 3.9
    + gaussian(x, z, -9, -31, 6.5, 5) * 0.95
    + gaussian(x, z, 12, -31, 6, 4.7) * 1.15
    + gaussian(x, z, 30, -33, 5.8, 7.5) * 1.25
    + gaussian(x, z, -31, -4, 5.2, 13) * 1.45
    + gaussian(x, z, -10, 29, 12, 7.5) * 0.58
    + gaussian(x, z, 14, 29, 9, 7) * 0.42
    - gaussian(x, z, 29, 27, 4.2, 5) * 0.88;
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

  const plateauDistance = outsidePlateauDistance(x, z);
  if (plateauDistance <= 0) return 0;
  height *= smoothstep01(
    plateauDistance / INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU.outerFeatherMeters,
  );

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
  if (innerKeepOuterWorldCompoundPlateauSignedDistance(x, z) <= clearance) return false;
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
  Object.freeze([-26, innerKeepOuterWorldTerrainHeightAt(-26, 32), 32] as const),
  Object.freeze([-21, innerKeepOuterWorldTerrainHeightAt(-21, 28), 28] as const),
  Object.freeze([-15, innerKeepOuterWorldTerrainHeightAt(-15, 24), 24] as const),
  Object.freeze([-8, innerKeepOuterWorldTerrainHeightAt(-8, 20.5), 20.5] as const),
  Object.freeze([0, innerKeepOuterWorldTerrainHeightAt(
    0,
    INNER_KEEP_OUTER_WORLD_APPROACHES.gateOuterZ,
  ), INNER_KEEP_OUTER_WORLD_APPROACHES.gateOuterZ] as const),
  Object.freeze([0, innerKeepOuterWorldTerrainHeightAt(
    0,
    INNER_KEEP_OUTER_WORLD_APPROACHES.gateInnerZ,
  ), INNER_KEEP_OUTER_WORLD_APPROACHES.gateInnerZ] as const),
] as const);
