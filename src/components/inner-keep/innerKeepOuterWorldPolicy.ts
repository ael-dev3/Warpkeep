import type { InnerKeepSceneQuality } from './createInnerKeepSceneLayer';
import {
  INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS,
  INNER_KEEP_TOWN_SCENERY_SOLID_EXCLUSIONS,
  INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS,
} from './innerKeepTownAtmospherePolicy';

/**
 * Presentation-only landscape around the canonical Inner Keep compound.
 *
 * Nothing in this policy creates a resource node, changes a balance, or grants
 * a gameplay action. The shared sampler exists so decorative terrain, props,
 * and ambient actors can meet the same ground without becoming authoritative.
 */
export const INNER_KEEP_OUTER_WORLD_POLICY_VERSION =
  'inner-keep-outer-world-presentation-v5-free-placement-town';

export const INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS = Object.freeze([
  72,
  72,
] as const);

export const INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU = Object.freeze({
  minimumX: -55,
  maximumX: 55,
  minimumZ: -51,
  maximumZ: 43,
  centerX: 0,
  centerZ: -4,
  cornerRadiusMeters: 8,
  elevationMeters: 0,
  outerFeatherMeters: 10,
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
    centerMeters: Object.freeze([0, -66] as const),
    description: 'A broad northern rise that silhouettes the estate approach.',
  }),
  Object.freeze({
    featureId: 'goldvein-rise',
    name: 'Goldvein Rise',
    kind: 'ridge',
    centerMeters: Object.freeze([-18, -62] as const),
    description: 'A weathered north-west shoulder around the scenic gold site.',
  }),
  Object.freeze({
    featureId: 'granite-scar',
    name: 'Granite Scar',
    kind: 'shelf',
    centerMeters: Object.freeze([18, -62] as const),
    description: 'A stepped stone shelf carrying the scenic quarry.',
  }),
  Object.freeze({
    featureId: 'headwater-shelf',
    name: 'Headwater Shelf',
    kind: 'shelf',
    centerMeters: Object.freeze([62, -64] as const),
    description: 'High eastern ground where the visible watercourse begins.',
  }),
  Object.freeze({
    featureId: 'western-watch-hills',
    name: 'Western Watch Hills',
    kind: 'ridge',
    centerMeters: Object.freeze([-65, -4] as const),
    description: 'Rolling watch hills beyond the western wall.',
  }),
  Object.freeze({
    featureId: 'southfield-meadows',
    name: 'Southfield Meadows',
    kind: 'meadow',
    centerMeters: Object.freeze([-20, 59] as const),
    description: 'Open farm country around the wheat and logging clearings.',
  }),
  Object.freeze({
    featureId: 'alderwood-margin',
    name: 'Alderwood Margin',
    kind: 'woodland',
    centerMeters: Object.freeze([58, 55] as const),
    description: 'Willow and alder wetland between the lower canal and mere.',
  }),
  Object.freeze({
    featureId: 'eastwall-rill',
    name: 'Eastwall Canal',
    kind: 'watercourse',
    centerMeters: Object.freeze([60, -4] as const),
    description: 'A narrow headwater opening into a punt-width lower canal.',
  }),
  Object.freeze({
    featureId: 'south-eastern-mere',
    name: 'South-eastern Mere',
    kind: 'lake',
    centerMeters: Object.freeze([60, 56] as const),
    description: 'A reed-ringed lowland mere receiving the east-wall canal.',
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
    x: -20,
    y: 0.22,
    z: 59,
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
    x: 8,
    y: 0.3,
    z: 60,
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
    x: 18,
    y: 1.68,
    z: -62,
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
    x: -18,
    y: 1.54,
    z: -62,
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

export type InnerKeepOuterWorldResourcePad = Readonly<{
  visualSiteKey: string;
  instanceIndex: number;
  positionMeters: readonly [number, number, number];
  targetFootprintDiameter: number;
  padRadiusMeters: number;
  padFeatherMeters: number;
}>;

const RESOURCE_SECONDARY_PADS = Object.freeze({
  'southfield-wheat-farm': Object.freeze({ offset: Object.freeze([-3.2, 1] as const), scale: 0.46 }),
  'southfield-logging-camp': Object.freeze({ offset: Object.freeze([-3.7, 0] as const), scale: 0.46 }),
  'granite-scar-quarry': Object.freeze({ offset: Object.freeze([3.7, 2] as const), scale: 0.46 }),
  'goldvein-scenic-mine': Object.freeze({ offset: Object.freeze([-3.7, 2] as const), scale: 0.46 }),
} as const);

/**
 * Every rendered resource copy owns a fixed, seed-independent terrain pad.
 * This keeps the decorative high-tier copies grounded and lets every other
 * planner reserve their real footprint before placing trees or wildlife.
 */
export const INNER_KEEP_OUTER_WORLD_RESOURCE_PADS:
readonly InnerKeepOuterWorldResourcePad[] = Object.freeze(
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.flatMap((site) => {
    const secondary = RESOURCE_SECONDARY_PADS[
      site.siteId as keyof typeof RESOURCE_SECONDARY_PADS
    ];
    return [
      Object.freeze({
        visualSiteKey: site.siteId,
        instanceIndex: 0,
        positionMeters: site.positionMeters,
        targetFootprintDiameter: site.targetFootprintDiameter,
        padRadiusMeters: site.padRadiusMeters,
        padFeatherMeters: site.padFeatherMeters,
      }),
      Object.freeze({
        visualSiteKey: site.siteId,
        instanceIndex: 1,
        positionMeters: Object.freeze([
          site.positionMeters[0] + secondary.offset[0],
          site.positionMeters[1],
          site.positionMeters[2] + secondary.offset[1],
        ] as const),
        targetFootprintDiameter: site.targetFootprintDiameter * secondary.scale,
        padRadiusMeters: site.targetFootprintDiameter * secondary.scale * 0.5 + 0.16,
        padFeatherMeters: 0.8,
      }),
    ];
  }),
);

export type InnerKeepOuterWorldWaterPoint = Readonly<{
  x: number;
  z: number;
  width: number;
  y: number;
}>;

/** Narrow headwater -> punt-width lower canal -> lake inlet; strictly downhill. */
export const INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE:
readonly InnerKeepOuterWorldWaterPoint[] = Object.freeze([
  Object.freeze({ x: 62, z: -64, width: 0.74, y: 1.76 }),
  Object.freeze({ x: 61.9, z: -60, width: 0.78, y: 1.52 }),
  Object.freeze({ x: 61.6, z: -54, width: 0.84, y: 1.25 }),
  Object.freeze({ x: 61.2, z: -46, width: 0.96, y: 0.84 }),
  Object.freeze({ x: 60.8, z: -36, width: 1.3, y: 0.55 }),
  Object.freeze({ x: 60.5, z: -26, width: 2.2, y: 0.48 }),
  Object.freeze({ x: 60.2, z: -16, width: 2.45, y: 0.44 }),
  Object.freeze({ x: 60, z: -4, width: 2.6, y: 0.4 }),
  Object.freeze({ x: 59.8, z: 8, width: 2.7, y: 0.36 }),
  Object.freeze({ x: 59.6, z: 20, width: 2.8, y: 0.32 }),
  Object.freeze({ x: 59.5, z: 32, width: 2.9, y: 0.285 }),
  Object.freeze({ x: 59.5, z: 42, width: 3.05, y: 0.255 }),
  Object.freeze({ x: 59.7, z: 48, width: 3.2, y: 0.225 }),
  Object.freeze({ x: 60, z: 52, width: 3.4, y: 0.205 }),
  Object.freeze({ x: 60, z: 54, width: 4.9, y: 0.198 }),
  Object.freeze({ x: 60, z: 55, width: 6.05, y: 0.193 }),
  Object.freeze({ x: 60, z: 56, width: 6.4, y: 0.19 }),
]);

export const INNER_KEEP_OUTER_WORLD_LAKE = Object.freeze({
  center: Object.freeze({ x: 60, y: 0.19, z: 56 }),
  radii: Object.freeze({ x: 3.2, z: 4 }),
});

/** Visual punt route through the widened lower canal; it grants no traversal. */
export const INNER_KEEP_OUTER_WORLD_BOAT_ROUTE = Object.freeze({
  routeId: 'eastwall-lower-canal-punt-route',
  points: Object.freeze([
    ...INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE.slice(5).map((point) => Object.freeze({
      x: point.x,
      y: point.y,
      z: point.z,
      channelWidthMeters: point.width,
    })),
  ]),
  closed: false,
  vesselBeamMeters: 0.9,
  bankClearanceMeters: 0.55,
  presentationOnly: true as const,
  authoritativeTraversal: false as const,
  gameplayAuthority: 'none' as const,
});

/** Bounded south-east wetland used only by deterministic scenic presenters. */
export const INNER_KEEP_OUTER_WORLD_MARSH = Object.freeze({
  center: Object.freeze({ x: 58, z: 55 }),
  radii: Object.freeze({ x: 5, z: 6.1 }),
  presentationOnly: true as const,
  gameplayAuthority: 'none' as const,
});

export const INNER_KEEP_OUTER_WORLD_MARSH_BUDGETS = Object.freeze({
  high: Object.freeze({ wetGroundPatches: 6, reeds: 72, lilyPads: 18, deadSnags: 5 }),
  balanced: Object.freeze({ wetGroundPatches: 4, reeds: 44, lilyPads: 12, deadSnags: 3 }),
  reduced: Object.freeze({ wetGroundPatches: 1, reeds: 8, lilyPads: 3, deadSnags: 1 }),
} satisfies Readonly<Record<InnerKeepSceneQuality, Readonly<{
  wetGroundPatches: number;
  reeds: number;
  lilyPads: number;
  deadSnags: number;
}>>>);

export const INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS = Object.freeze([
  Object.freeze({ x: -70, z: -54 }),
  Object.freeze({ x: -68, z: -65 }),
  Object.freeze({ x: -52, z: -69 }),
  Object.freeze({ x: -28, z: -69 }),
  Object.freeze({ x: 0, z: -69 }),
  Object.freeze({ x: 28, z: -69 }),
  Object.freeze({ x: 52, z: -69 }),
  Object.freeze({ x: 68, z: -65 }),
  Object.freeze({ x: 70, z: -54 }),
  Object.freeze({ x: 68, z: -34 }),
  Object.freeze({ x: 68, z: -12 }),
  Object.freeze({ x: 68, z: 10 }),
  Object.freeze({ x: 68, z: 32 }),
  Object.freeze({ x: 70, z: 50 }),
  Object.freeze({ x: 70, z: 64 }),
  Object.freeze({ x: 58, z: 69 }),
  Object.freeze({ x: 36, z: 69 }),
  Object.freeze({ x: 12, z: 69 }),
  Object.freeze({ x: -12, z: 69 }),
  Object.freeze({ x: -36, z: 69 }),
  Object.freeze({ x: -58, z: 67 }),
  Object.freeze({ x: -67, z: 50 }),
  Object.freeze({ x: -68, z: 30 }),
  Object.freeze({ x: -68, z: 8 }),
  Object.freeze({ x: -68, z: -14 }),
  Object.freeze({ x: -68, z: -36 }),
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
  northernResourceRoadZ: -66,
  southernResourceRoadZ: 64,
  gateOuterZ: 38,
  gateInnerZ: 34,
});

export type InnerKeepCityPresentationRoad = Readonly<{
  roadId: string;
  points: readonly Readonly<{ x: number; z: number }>[];
  closed: boolean;
  halfWidthMeters: number;
  presentationOnly: true;
  gameplayAuthorityClaimed: false;
}>;

/** Presentation-only ground treatment that softens the palisade perimeter. */
export const INNER_KEEP_CITY_EDGE_APRON_POINTS = Object.freeze([
  Object.freeze({ x: -40, z: -44.15 }),
  Object.freeze({ x: -24, z: -44.28 }),
  Object.freeze({ x: -8, z: -44.12 }),
  Object.freeze({ x: 8, z: -44.26 }),
  Object.freeze({ x: 24, z: -44.1 }),
  Object.freeze({ x: 40, z: -44.2 }),
  Object.freeze({ x: 48.18, z: -36 }),
  Object.freeze({ x: 48.3, z: -20 }),
  Object.freeze({ x: 48.12, z: -4 }),
  Object.freeze({ x: 48.28, z: 12 }),
  Object.freeze({ x: 48.12, z: 28 }),
  Object.freeze({ x: 40, z: 36.08 }),
  Object.freeze({ x: 24, z: 36.22 }),
  Object.freeze({ x: 8, z: 36.1 }),
  Object.freeze({ x: -8, z: 36.24 }),
  Object.freeze({ x: -24, z: 36.06 }),
  Object.freeze({ x: -40, z: 36.2 }),
  Object.freeze({ x: -48.16, z: 28 }),
  Object.freeze({ x: -48.32, z: 12 }),
  Object.freeze({ x: -48.14, z: -4 }),
  Object.freeze({ x: -48.3, z: -20 }),
  Object.freeze({ x: -48.12, z: -36 }),
] as const);
export const INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS = 1.9;

/** Presentation-only district lanes shared by rendering and ecology clearance. */
export const INNER_KEEP_CITY_DISTRICT_ROADS:
readonly InnerKeepCityPresentationRoad[] = Object.freeze([]);

/**
 * Always-visible civic streets beneath the authored road tiles.
 *
 * The selected straight-road prefab is four metres long on its local X axis,
 * so the fixed north/south tile placements do not form a continuous street
 * after the procedural fallback is hidden. These draped surfaces preserve the
 * intended road hierarchy without changing the canonical authored layout.
 */
export const INNER_KEEP_CITY_CORE_ROADS:
readonly InnerKeepCityPresentationRoad[] = Object.freeze([
  Object.freeze({
    roadId: 'inner-keep-civic-spine-v1',
    points: Object.freeze([
      Object.freeze({ x: 0, z: 34 }),
      Object.freeze({ x: 0, z: 30 }),
      Object.freeze({ x: 0, z: 24 }),
      Object.freeze({ x: 0, z: 18 }),
      Object.freeze({ x: 0, z: 12 }),
      Object.freeze({ x: 0, z: 7 }),
      Object.freeze({ x: 0, z: 2 }),
      Object.freeze({ x: 0, z: -3 }),
    ]),
    closed: false,
    halfWidthMeters: 2,
    presentationOnly: true,
    gameplayAuthorityClaimed: false,
  }),
]);

export const INNER_KEEP_CITY_PRESENTATION_ROADS:
readonly InnerKeepCityPresentationRoad[] = Object.freeze([
  ...INNER_KEEP_CITY_CORE_ROADS,
  ...INNER_KEEP_CITY_DISTRICT_ROADS,
]);

export const INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS = Object.freeze({
  high: Object.freeze({
    terrainSegments: Object.freeze([112, 112] as const),
    grassBlades: 3_000,
    authoredTrees: 88,
    wildlifeActors: 10,
  }),
  balanced: Object.freeze({
    terrainSegments: Object.freeze([80, 80] as const),
    grassBlades: 1_800,
    authoredTrees: 56,
    wildlifeActors: 7,
  }),
  reduced: Object.freeze({
    terrainSegments: Object.freeze([48, 48] as const),
    grassBlades: 600,
    authoredTrees: 28,
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
  'warpkeep.tree.willow.lemon-weeping',
  'warpkeep.tree.willow.river-mist',
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

/** Signed distance from a point to the closed city-edge earth apron. */
export function innerKeepCityEdgeApronDistance(x: number, z: number) {
  let nearestEdge = Number.POSITIVE_INFINITY;
  for (let index = 0; index < INNER_KEEP_CITY_EDGE_APRON_POINTS.length; index += 1) {
    const from = INNER_KEEP_CITY_EDGE_APRON_POINTS[index]!;
    const to = INNER_KEEP_CITY_EDGE_APRON_POINTS[
      (index + 1) % INNER_KEEP_CITY_EDGE_APRON_POINTS.length
    ]!;
    nearestEdge = Math.min(
      nearestEdge,
      innerKeepOuterWorldDistanceToSegment(x, z, from.x, from.z, to.x, to.z)
        - INNER_KEEP_CITY_EDGE_APRON_HALF_WIDTH_METERS,
    );
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

export const INNER_KEEP_OUTER_WORLD_AUTHORED_TREE_RESERVE_METERS = 3.4;
const INNER_KEEP_OUTER_WORLD_AUTHORED_SOUTH_TREE_HALF_WIDTH_METERS = 45;

/** Keeps independently planned countryside actors beyond the authored grove. */
export function innerKeepOuterWorldClearsAuthoredTreeReserve(
  x: number,
  z: number,
  supportRadiusMeters = 0,
) {
  const support = Math.max(0, supportRadiusMeters);
  const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
  if (
    z <= plateau.maximumZ
    || Math.abs(x) > INNER_KEEP_OUTER_WORLD_AUTHORED_SOUTH_TREE_HALF_WIDTH_METERS + support
  ) return true;
  return z - plateau.maximumZ
    > INNER_KEEP_OUTER_WORLD_AUTHORED_TREE_RESERVE_METERS + support;
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
    + gaussian(x, z, 0, -66, 24, 5.5) * 3.9
    + gaussian(x, z, -18, -62, 8.5, 7) * 0.95
    + gaussian(x, z, 18, -62, 8, 6.7) * 1.15
    + gaussian(x, z, 62, -64, 7.8, 9.5) * 1.25
    + gaussian(x, z, -65, -4, 7.2, 18) * 1.45
    + gaussian(x, z, -20, 59, 18, 10.5) * 0.58
    + gaussian(x, z, 20, 59, 14, 10) * 0.42
    - gaussian(x, z, 60, 56, 5.2, 6.1) * 0.88;
}

function innerKeepOuterWorldTerrainHeightWithResourcePadsAt(
  x: number,
  z: number,
  resourcePads: readonly InnerKeepOuterWorldResourcePad[],
) {
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

  for (const pad of resourcePads) {
    const distance = Math.hypot(
      x - pad.positionMeters[0],
      z - pad.positionMeters[2],
    );
    if (distance <= pad.padRadiusMeters) {
      height = pad.positionMeters[1];
      break;
    }
    if (distance < pad.padRadiusMeters + pad.padFeatherMeters) {
      const blend = smoothstep01(
        1 - (distance - pad.padRadiusMeters) / pad.padFeatherMeters,
      );
      height += (pad.positionMeters[1] - height) * blend;
    }
  }

  return clamp(
    height,
    INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.minimum,
    INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.maximum,
  );
}

/** Terrain before any quality-dependent scenic worksite terraces are applied. */
export function innerKeepOuterWorldTerrainBaseHeightAt(x: number, z: number) {
  return innerKeepOuterWorldTerrainHeightWithResourcePadsAt(x, z, []);
}

/** Deterministic, finite policy elevation retaining every declared resource pad. */
export function innerKeepOuterWorldTerrainHeightAt(x: number, z: number) {
  return innerKeepOuterWorldTerrainHeightWithResourcePadsAt(
    x,
    z,
    INNER_KEEP_OUTER_WORLD_RESOURCE_PADS,
  );
}

export type InnerKeepOuterWorldRenderedTerrainSampler = Readonly<{
  quality: InnerKeepSceneQuality;
  heightAt: (x: number, z: number) => number;
}>;

export function innerKeepOuterWorldResourcePadsForQuality(
  quality: InnerKeepSceneQuality,
) {
  return Object.freeze(INNER_KEEP_OUTER_WORLD_RESOURCE_PADS.filter((pad) => {
    const site = INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.find(
      ({ siteId }) => siteId === pad.visualSiteKey,
    );
    return pad.instanceIndex < (site?.instancesByQuality[quality] ?? 0);
  }));
}

/**
 * Samples the exact piecewise-planar surface rendered by PlaneGeometry.
 *
 * The analytic landscape is evaluated only at the quality-specific grid
 * vertices and stored with the same Float32 precision as BufferGeometry.
 * Queries then use PlaneGeometry's real triangle diagonal instead of bilinear
 * interpolation, so props and draped surfaces meet what the player sees.
 */
export function createInnerKeepOuterWorldRenderedTerrainSampler(
  quality: InnerKeepSceneQuality,
): InnerKeepOuterWorldRenderedTerrainSampler {
  const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  const [widthSegments, depthSegments] =
    INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS[quality].terrainSegments;
  const widthStep = halfWidth * 2 / widthSegments;
  const depthStep = halfDepth * 2 / depthSegments;
  const cellDiagonal = Math.hypot(widthStep, depthStep);
  const activeResourcePads = innerKeepOuterWorldResourcePadsForQuality(quality);
  const rowLength = widthSegments + 1;
  const heights = new Float32Array(rowLength * (depthSegments + 1));
  for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
    const z = -halfDepth + depthIndex * depthStep;
    for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
      const x = -halfWidth + widthIndex * widthStep;
      let height = innerKeepOuterWorldTerrainBaseHeightAt(x, z);
      for (const pad of activeResourcePads) {
        const distance = Math.hypot(
          x - pad.positionMeters[0],
          z - pad.positionMeters[2],
        );
        // The loader normalizes each gathering model inside a D-by-D box. Its
        // half diagonal is the seed/yaw-independent support envelope. Adding
        // one terrain-cell diagonal forces every vertex of every intersecting
        // PlaneGeometry cell onto the same terrace.
        const flatRadius = pad.targetFootprintDiameter * 0.72 + cellDiagonal;
        const feather = pad.padFeatherMeters + cellDiagonal;
        if (distance <= flatRadius) {
          height = pad.positionMeters[1];
        } else if (distance < flatRadius + feather) {
          const blend = smoothstep01(
            1 - (distance - flatRadius) / feather,
          );
          height += (pad.positionMeters[1] - height) * blend;
        }
      }
      heights[depthIndex * rowLength + widthIndex] = height;
    }
  }

  const vertexHeight = (widthIndex: number, depthIndex: number) => (
    heights[depthIndex * rowLength + widthIndex]!
  );
  const heightAt = (x: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const gridX = clamp((x + halfWidth) / widthStep, 0, widthSegments);
    const gridZ = clamp((z + halfDepth) / depthStep, 0, depthSegments);
    const cellX = Math.min(widthSegments - 1, Math.floor(gridX));
    const cellZ = Math.min(depthSegments - 1, Math.floor(gridZ));
    const localX = gridX - cellX;
    const localZ = gridZ - cellZ;
    const height00 = vertexHeight(cellX, cellZ);
    const height01 = vertexHeight(cellX, cellZ + 1);
    const height10 = vertexHeight(cellX + 1, cellZ);
    const height11 = vertexHeight(cellX + 1, cellZ + 1);
    // PlaneGeometry indexes (00, 01, 10) and (01, 11, 10).
    if (localX + localZ <= 1) {
      return height00
        + localX * (height10 - height00)
        + localZ * (height01 - height00);
    }
    return height11
      + (1 - localX) * (height01 - height11)
      + (1 - localZ) * (height10 - height11);
  };
  return Object.freeze({ quality, heightAt });
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
  const stream = nearestWaterSample(x, z);
  const streamEdgeDistance = stream.distance - stream.width * 0.5;
  const lake = INNER_KEEP_OUTER_WORLD_LAKE;
  const normalizedLakeDistance = Math.hypot(
    (x - lake.center.x) / lake.radii.x,
    (z - lake.center.z) / lake.radii.z,
  );
  const lakeEdgeDistance = normalizedLakeDistance <= 1
    ? 0
    : (normalizedLakeDistance - 1) * Math.min(lake.radii.x, lake.radii.z);
  return Math.min(streamEdgeDistance, lakeEdgeDistance);
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
  return INNER_KEEP_OUTER_WORLD_RESOURCE_PADS.reduce((nearest, pad) => Math.min(
    nearest,
    Math.hypot(x - pad.positionMeters[0], z - pad.positionMeters[2])
      - pad.padRadiusMeters,
  ), Number.POSITIVE_INFINITY);
}

export type InnerKeepOuterWorldAmbientLane = Readonly<{
  laneId: string;
  halfWidthMeters: number;
  reservedHalfWidthMeters: number;
  points: readonly Readonly<{ x: number; z: number }>[];
  servesHouseId?: string;
  presentationOnly: true;
  gameplayAuthorityClaimed: false;
}>;

export const INNER_KEEP_WEST_VILLAGE_DELIVERY_LANE:
InnerKeepOuterWorldAmbientLane = Object.freeze({
  laneId: 'inner-keep-west-village-delivery-lane-v1',
  halfWidthMeters: 0.62,
  reservedHalfWidthMeters: 1.15,
  points: Object.freeze([
    Object.freeze({ x: -62, z: 12 }),
    Object.freeze({ x: -62, z: 20 }),
    Object.freeze({ x: -61, z: 28 }),
    Object.freeze({ x: -60, z: 36 }),
  ]),
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
});

export const INNER_KEEP_EAST_VILLAGE_SERVICE_LANE:
InnerKeepOuterWorldAmbientLane = Object.freeze({
  laneId: 'inner-keep-east-village-service-lane-v1',
  halfWidthMeters: 1.05,
  reservedHalfWidthMeters: 1.15,
  points: Object.freeze([
    Object.freeze({ x: 55, z: 38 }),
    Object.freeze({ x: 54, z: 42 }),
    Object.freeze({ x: 52, z: 46 }),
    Object.freeze({ x: 50, z: 50 }),
  ]),
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
});

export const INNER_KEEP_VILLAGE_COMMONS_SOCIAL_LANE:
InnerKeepOuterWorldAmbientLane = Object.freeze({
  laneId: 'inner-keep-village-commons-social-lane-v1',
  halfWidthMeters: 1.05,
  reservedHalfWidthMeters: 0.72,
  points: Object.freeze([
    Object.freeze({ x: 8, z: 52 }),
    Object.freeze({ x: 12, z: 54 }),
    Object.freeze({ x: 16, z: 55 }),
    Object.freeze({ x: 20, z: 56 }),
  ]),
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
});

/** A readable high street from the south gate to the ferry landing. */
export const INNER_KEEP_SOUTH_GATE_FERRY_MARKET_LANE:
InnerKeepOuterWorldAmbientLane = Object.freeze({
  laneId: 'inner-keep-south-gate-ferry-market-lane-v1',
  halfWidthMeters: 0.62,
  reservedHalfWidthMeters: 0.84,
  points: Object.freeze([
    Object.freeze({ x: 0, z: 38 }),
    Object.freeze({ x: 8, z: 39 }),
    Object.freeze({ x: 16, z: 40 }),
    Object.freeze({ x: 24, z: 40 }),
    Object.freeze({ x: 32, z: 40 }),
    Object.freeze({ x: 40, z: 40 }),
    Object.freeze({ x: 48, z: 43 }),
    Object.freeze({ x: 56, z: 48 }),
  ]),
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
});

/** Exterior quay serving both presentation-only canal landings. */
export const INNER_KEEP_EASTWALL_QUAY_LANE:
InnerKeepOuterWorldAmbientLane = Object.freeze({
  laneId: 'inner-keep-eastwall-quay-lane-v1',
  halfWidthMeters: 0.42,
  reservedHalfWidthMeters: 0.7,
  points: Object.freeze([
    Object.freeze({ x: 56, z: 48 }),
    Object.freeze({ x: 56.5, z: 44 }),
    Object.freeze({ x: 57, z: 40 }),
    Object.freeze({ x: 57, z: 36 }),
    Object.freeze({ x: 58, z: 32 }),
  ]),
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
});

/** Narrow frontage street through the eastern cottage row. */
export const INNER_KEEP_EAST_CROFT_MARKET_LANE:
InnerKeepOuterWorldAmbientLane = Object.freeze({
  laneId: 'inner-keep-east-croft-market-lane-v1',
  halfWidthMeters: 0.34,
  reservedHalfWidthMeters: 0.48,
  points: Object.freeze([
    Object.freeze({ x: 42, z: 42 }),
    Object.freeze({ x: 40, z: 43 }),
    Object.freeze({ x: 32, z: 43 }),
    Object.freeze({ x: 24, z: 43 }),
    Object.freeze({ x: 16, z: 43 }),
  ]),
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
});

function townFootpath(
  laneId: string,
  points: readonly Readonly<{ x: number; z: number }>[],
  halfWidthMeters = 0.28,
  reservedHalfWidthMeters = 0.48,
  servesHouseId?: string,
): InnerKeepOuterWorldAmbientLane {
  return Object.freeze({
    laneId,
    halfWidthMeters,
    reservedHalfWidthMeters,
    points: Object.freeze(points.map((point) => Object.freeze({ ...point }))),
    ...(servesHouseId === undefined ? {} : { servesHouseId }),
    presentationOnly: true,
    gameplayAuthorityClaimed: false,
  });
}

/** Short visual joins that make the lower-ward street graph continuous. */
export const INNER_KEEP_TOWN_JUNCTION_LANES:
readonly InnerKeepOuterWorldAmbientLane[] = Object.freeze([]);

export const INNER_KEEP_WEST_CROFT_DOORSTEP_PATHS:
readonly InnerKeepOuterWorldAmbientLane[] = Object.freeze([
  townFootpath('inner-keep-gate-west-croft-doorstep-v1', [
    { x: -17.8, z: 44.8 },
    { x: -16.8, z: 44 },
    { x: -15.8, z: 43.4 },
  ], 0.28, 0.48, 'gate-west-croft'),
  townFootpath('inner-keep-tanners-doorstep-v1', [
    { x: -27.8, z: 49.1 },
    { x: -27, z: 48.8 },
    { x: -26.2, z: 48.5 },
  ], 0.28, 0.48, 'tanners-west-row'),
  townFootpath('inner-keep-alder-row-doorstep-v1', [
    { x: -37.8, z: 54.1 },
    { x: -37, z: 52.8 },
    { x: -36, z: 51.4 },
  ], 0.28, 0.48, 'alder-west-row'),
]);

export const INNER_KEEP_EAST_CROFT_DOORSTEP_PATHS:
readonly InnerKeepOuterWorldAmbientLane[] = Object.freeze([
  townFootpath('inner-keep-eastwall-croft-doorstep-v1', [
    { x: 42, z: 46 },
    { x: 41, z: 46 },
    { x: 40, z: 46 },
  ], 0.28, 0.48, 'eastwall-croft'),
  townFootpath('inner-keep-southfield-row-doorstep-v1', [
    { x: 38, z: 58 },
    { x: 39, z: 57 },
    { x: 40, z: 56 },
  ], 0.28, 0.48, 'southfield-east-row'),
  townFootpath('inner-keep-alder-lane-croft-doorstep-v1', [
    { x: 24, z: 57 },
    { x: 24, z: 53 },
    { x: 24, z: 48 },
  ], 0.28, 0.48, 'alder-lane-croft'),
]);

/** Old-road footpath ending at the graveyard's open southern fence. */
export const INNER_KEEP_OLD_ROAD_GRAVEYARD_SPUR:
InnerKeepOuterWorldAmbientLane = townFootpath(
  'inner-keep-old-road-graveyard-spur-v1',
  [
    { x: -66, z: -4 },
    { x: -64, z: -6 },
    { x: -62, z: -8 },
    { x: -60, z: -10 },
  ],
  0.4,
  0.64,
);

export const INNER_KEEP_OUTER_WORLD_AMBIENT_LANES:
readonly InnerKeepOuterWorldAmbientLane[] = Object.freeze([
  INNER_KEEP_WEST_VILLAGE_DELIVERY_LANE,
  INNER_KEEP_EAST_VILLAGE_SERVICE_LANE,
  INNER_KEEP_VILLAGE_COMMONS_SOCIAL_LANE,
  INNER_KEEP_SOUTH_GATE_FERRY_MARKET_LANE,
  INNER_KEEP_EASTWALL_QUAY_LANE,
  INNER_KEEP_EAST_CROFT_MARKET_LANE,
  ...INNER_KEEP_TOWN_JUNCTION_LANES,
  ...INNER_KEEP_WEST_CROFT_DOORSTEP_PATHS,
  ...INNER_KEEP_EAST_CROFT_DOORSTEP_PATHS,
  INNER_KEEP_OLD_ROAD_GRAVEYARD_SPUR,
]);

/** Signed centerline-edge distance to the nearest presentation-only town lane. */
export function innerKeepOuterWorldDistanceToAmbientLane(x: number, z: number) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const lane of INNER_KEEP_OUTER_WORLD_AMBIENT_LANES) {
    for (let index = 0; index < lane.points.length - 1; index += 1) {
      const from = lane.points[index]!;
      const to = lane.points[index + 1]!;
      nearest = Math.min(
        nearest,
        innerKeepOuterWorldDistanceToSegment(x, z, from.x, from.z, to.x, to.z)
          - lane.reservedHalfWidthMeters,
      );
    }
  }
  return nearest;
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
  if (INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS.some((exclusion) => (
    Math.abs(x - exclusion.center.x)
      <= exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters + clearance
    && Math.abs(z - exclusion.center.z)
      <= exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters + clearance
  ))) return false;
  if (INNER_KEEP_TOWN_SCENERY_SOLID_EXCLUSIONS.some((exclusion) => (
    Math.abs(x - exclusion.center.x)
      <= exclusion.halfExtentsMeters[0] + exclusion.clearanceMarginMeters + clearance
    && Math.abs(z - exclusion.center.z)
      <= exclusion.halfExtentsMeters[1] + exclusion.clearanceMarginMeters + clearance
  ))) return false;
  if (INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS.some((exclusion) => (
    Math.hypot(x - exclusion.center.x, z - exclusion.center.z)
      <= exclusion.radiusMeters + clearance
  ))) return false;
  if (innerKeepOuterWorldDistanceToAmbientLane(x, z) <= clearance) return false;
  if (innerKeepOuterWorldCompoundPlateauSignedDistance(x, z) <= clearance) return false;
  const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
  if (Math.abs(x) > halfWidth - 0.35 - clearance) return false;
  if (Math.abs(z) > halfDepth - 0.35 - clearance) return false;
  const water = nearestWaterSample(x, z);
  if (water.distance <= water.width * 0.5 + 0.38 + clearance) return false;
  if (innerKeepOuterWorldDistanceToWater(x, z) <= 0.38 + clearance) return false;
  if (innerKeepOuterWorldDistanceToResourceSite(x, z) <= 0.45 + clearance) return false;
  if (innerKeepOuterWorldDistanceToRenderedRoadEdge(x, z) <= 0.22 + clearance) {
    return false;
  }
  return innerKeepOuterWorldTerrainSlopeAt(x, z) <= 0.62;
}

export const INNER_KEEP_OUTER_WORLD_TRADE_ROUTE = Object.freeze([
  Object.freeze([-44, innerKeepOuterWorldTerrainHeightAt(-44, 65), 65] as const),
  Object.freeze([-36, innerKeepOuterWorldTerrainHeightAt(-36, 62), 62] as const),
  Object.freeze([-28, innerKeepOuterWorldTerrainHeightAt(-28, 59), 59] as const),
  Object.freeze([-18, innerKeepOuterWorldTerrainHeightAt(-18, 53), 53] as const),
  Object.freeze([-8, innerKeepOuterWorldTerrainHeightAt(-8, 45), 45] as const),
  Object.freeze([0, innerKeepOuterWorldTerrainHeightAt(
    0,
    INNER_KEEP_OUTER_WORLD_APPROACHES.gateOuterZ,
  ), INNER_KEEP_OUTER_WORLD_APPROACHES.gateOuterZ] as const),
  Object.freeze([0, innerKeepOuterWorldTerrainHeightAt(
    0,
    INNER_KEEP_OUTER_WORLD_APPROACHES.gateInnerZ,
  ), INNER_KEEP_OUTER_WORLD_APPROACHES.gateInnerZ] as const),
] as const);

/** Conservative presentation footprint used to keep the supply road open. */
export const INNER_KEEP_OUTER_WORLD_SUPPLY_WAGON_FOOTPRINT_METERS = 2.35;
export const INNER_KEEP_OUTER_WORLD_TRADE_ROAD_HALF_WIDTH_METERS = 0.62;

export const INNER_KEEP_OUTER_WORLD_RESOURCE_ROAD_HALF_WIDTH_METERS = 0.46;

/** Visual service lanes connecting each scenic resource site to the estate road. */
export const INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS = Object.freeze(
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.map((site) => {
    const south = site.positionMeters[2] > 0;
    const approachZ = south
      ? INNER_KEEP_OUTER_WORLD_APPROACHES.southernResourceRoadZ
      : INNER_KEEP_OUTER_WORLD_APPROACHES.northernResourceRoadZ;
    return Object.freeze({
      roadId: `outer-resource-road:${site.siteId}`,
      points: Object.freeze([
        ...(south ? [Object.freeze({
          x: 0,
          z: INNER_KEEP_OUTER_WORLD_APPROACHES.gateOuterZ,
        })] : []),
        Object.freeze({ x: site.positionMeters[0] * 0.58, z: approachZ }),
        Object.freeze({
          x: site.positionMeters[0],
          z: site.positionMeters[2],
        }),
      ]),
      closed: false as const,
      halfWidthMeters: INNER_KEEP_OUTER_WORLD_RESOURCE_ROAD_HALF_WIDTH_METERS,
      presentationOnly: true as const,
      gameplayAuthority: 'none' as const,
    });
  }),
);

/** Signed edge distance across every road mesh rendered in the outer scene. */
export function innerKeepOuterWorldDistanceToRenderedRoadEdge(x: number, z: number) {
  let nearest = innerKeepOuterWorldDistanceToRoad(x, z)
    - INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters;
  for (let index = 0; index < INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.length - 1; index += 1) {
    const from = INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[index]!;
    const to = INNER_KEEP_OUTER_WORLD_TRADE_ROUTE[index + 1]!;
    nearest = Math.min(
      nearest,
      innerKeepOuterWorldDistanceToSegment(x, z, from[0], from[2], to[0], to[2])
        - INNER_KEEP_OUTER_WORLD_TRADE_ROAD_HALF_WIDTH_METERS,
    );
  }
  for (const road of INNER_KEEP_OUTER_WORLD_AMBIENT_LANES) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const from = road.points[index]!;
      const to = road.points[index + 1]!;
      nearest = Math.min(
        nearest,
        innerKeepOuterWorldDistanceToSegment(x, z, from.x, from.z, to.x, to.z)
          - road.halfWidthMeters,
      );
    }
  }
  for (const road of INNER_KEEP_OUTER_WORLD_RESOURCE_ROADS) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const from = road.points[index]!;
      const to = road.points[index + 1]!;
      nearest = Math.min(
        nearest,
        innerKeepOuterWorldDistanceToSegment(x, z, from.x, from.z, to.x, to.z)
          - road.halfWidthMeters,
      );
    }
  }
  return nearest;
}
