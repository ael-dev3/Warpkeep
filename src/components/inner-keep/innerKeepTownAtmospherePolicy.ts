/**
 * Presentation-only mood and lower-ward composition for the Inner Keep.
 *
 * This policy deliberately sits outside the canonical v15 layout digest. It
 * cannot create a building, occupy a construction slot, block a route, or
 * claim gameplay authority. The generic houses are background silhouettes;
 * build-catalogue assets remain exclusive to authoritative player projects.
 */

export const INNER_KEEP_TOWN_ATMOSPHERE_POLICY_VERSION =
  'inner-keep-weathered-lowlands-atmosphere-v1';

export const INNER_KEEP_TOWN_TONAL_PALETTE = Object.freeze({
  skyFog: 0x596560,
  fogNearMeters: 34,
  fogFarMeters: 80,
  terrain: Object.freeze({
    lowland: 0x5b604e,
    meadow: 0x6c6d57,
    ridge: 0x625e57,
    forestTint: 0x9aa38d,
    heathTint: 0xa39b83,
    ridgeTint: 0x999993,
    defaultTint: 0xa0a48f,
  }),
  roads: Object.freeze({
    outer: 0x5c4f40,
    apron: 0x4f463a,
    district: 0x574a3d,
    inner: 0x5e5040,
    plaza: 0x686052,
    wetRut: 0x252a28,
  }),
  foliage: Object.freeze({
    grass: 0x5c7447,
    trunk: 0x49372d,
    crown: 0x314a32,
  }),
  water: Object.freeze({
    deep: 0x172e34,
    shallow: 0x3d5a58,
    foam: 0x9da69a,
    sky: 0x66756f,
    bank: 0x625d50,
    bed: 0x243b3a,
  }),
  lighting: Object.freeze({
    hemisphereSky: 0xaeb3aa,
    hemisphereGround: 0x20251d,
    hemisphereIntensity: 1.65,
    sun: 0xcac1ad,
    sunIntensity: 2.1,
    sunPositionMeters: Object.freeze([-16, 22, 10] as const),
  }),
  rowHouse: Object.freeze({
    plaster: Object.freeze([0x9b927d, 0x858075, 0xa2977e, 0x80786a] as const),
    roof: Object.freeze([0x443832, 0x514138, 0x383735, 0x4a4035] as const),
    timber: 0x322820,
    window: 0xc58a42,
    smoke: 0x87908a,
  }),
});

export type InnerKeepLowerWardRowHouse = Readonly<{
  houseId: string;
  positionMeters: readonly [number, number];
  rotationMilliDegrees: number;
  heightScale: number;
  styleIndex: number;
}>;

/**
 * Alternating west/east priority keeps every quality tier visually balanced.
 * The 2.8 x 1.9 metre envelope is intentionally smaller than an economy slot.
 */
export const INNER_KEEP_LOWER_WARD_ROW_HOUSES:
readonly InnerKeepLowerWardRowHouse[] = Object.freeze([
  Object.freeze({ houseId: 'gate-west-croft', positionMeters: Object.freeze([-15.8, 18.7] as const), rotationMilliDegrees: 10_000, heightScale: 0.94, styleIndex: 0 }),
  Object.freeze({ houseId: 'gate-east-croft', positionMeters: Object.freeze([7.6, 19.1] as const), rotationMilliDegrees: -8_000, heightScale: 0.88, styleIndex: 1 }),
  Object.freeze({ houseId: 'tanners-west-row', positionMeters: Object.freeze([-20.2, 22.2] as const), rotationMilliDegrees: 28_000, heightScale: 1.02, styleIndex: 2 }),
  Object.freeze({ houseId: 'carters-east-row', positionMeters: Object.freeze([13, 20.2] as const), rotationMilliDegrees: -14_000, heightScale: 0.96, styleIndex: 3 }),
  Object.freeze({ houseId: 'alder-west-row', positionMeters: Object.freeze([-25.5, 24.8] as const), rotationMilliDegrees: 38_000, heightScale: 0.9, styleIndex: 1 }),
  Object.freeze({ houseId: 'mere-east-row', positionMeters: Object.freeze([18, 23.4] as const), rotationMilliDegrees: -26_000, heightScale: 1.04, styleIndex: 0 }),
  Object.freeze({ houseId: 'eastwall-croft', positionMeters: Object.freeze([24, 18.5] as const), rotationMilliDegrees: -18_000, heightScale: 0.92, styleIndex: 3 }),
  Object.freeze({ houseId: 'southfield-east-row', positionMeters: Object.freeze([21.6, 27.5] as const), rotationMilliDegrees: -35_000, heightScale: 0.98, styleIndex: 2 }),
]);

export const INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS = Object.freeze({
  high: 8,
  balanced: 6,
  reduced: 4,
} as const);

export const INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS = Object.freeze({
  width: 2.8,
  depth: 1.9,
  maximumHeight: 3.2,
  clearanceMargin: 0.22,
});

export type InnerKeepTownSolidExclusion = Readonly<{
  exclusionId: string;
  center: Readonly<{ x: number; z: number }>;
  halfExtentsMeters: readonly [number, number];
  clearanceMarginMeters: number;
}>;

function rotatedRowHouseHalfExtents(rotationMilliDegrees: number) {
  const radians = rotationMilliDegrees * Math.PI / 180_000;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfWidth = INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.width * 0.5;
  const halfDepth = INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.depth * 0.5;
  return Object.freeze([
    cosine * halfWidth + sine * halfDepth,
    sine * halfWidth + cosine * halfDepth,
  ] as const);
}

/** Shared conservative bounds consumed by grass, trees, wildlife, and QA. */
export const INNER_KEEP_LOWER_WARD_SOLID_EXCLUSIONS:
readonly InnerKeepTownSolidExclusion[] = Object.freeze(
  INNER_KEEP_LOWER_WARD_ROW_HOUSES.map((house) => Object.freeze({
    exclusionId: `lower-ward-row-house:${house.houseId}`,
    center: Object.freeze({
      x: house.positionMeters[0],
      z: house.positionMeters[1],
    }),
    halfExtentsMeters: rotatedRowHouseHalfExtents(house.rotationMilliDegrees),
    clearanceMarginMeters:
      INNER_KEEP_LOWER_WARD_ROW_HOUSE_ENVELOPE_METERS.clearanceMargin,
  })),
);

export type InnerKeepWetRutPlacement = Readonly<{
  rutId: string;
  positionMeters: readonly [number, number];
  rotationMilliDegrees: number;
  radiiMeters: readonly [number, number];
  surfaceLiftMeters: number;
}>;

export const INNER_KEEP_WET_RUT_PLACEMENTS:
readonly InnerKeepWetRutPlacement[] = Object.freeze([
  Object.freeze({ rutId: 'gate-inner-west', positionMeters: Object.freeze([-0.42, 11.1] as const), rotationMilliDegrees: 4_000, radiiMeters: Object.freeze([0.34, 0.86] as const), surfaceLiftMeters: 0.148 }),
  Object.freeze({ rutId: 'gate-inner-east', positionMeters: Object.freeze([0.48, 8.1] as const), rotationMilliDegrees: -5_000, radiiMeters: Object.freeze([0.3, 0.72] as const), surfaceLiftMeters: 0.148 }),
  Object.freeze({ rutId: 'plaza-south', positionMeters: Object.freeze([-0.55, 5.7] as const), rotationMilliDegrees: 7_000, radiiMeters: Object.freeze([0.38, 0.66] as const), surfaceLiftMeters: 0.198 }),
  Object.freeze({ rutId: 'plaza-west', positionMeters: Object.freeze([-5.8, 0.25] as const), rotationMilliDegrees: 83_000, radiiMeters: Object.freeze([0.28, 0.9] as const), surfaceLiftMeters: 0.153 }),
  Object.freeze({ rutId: 'plaza-east', positionMeters: Object.freeze([6.1, 0.08] as const), rotationMilliDegrees: 96_000, radiiMeters: Object.freeze([0.31, 0.78] as const), surfaceLiftMeters: 0.153 }),
  Object.freeze({ rutId: 'north-spine-one', positionMeters: Object.freeze([0.5, -3.1] as const), rotationMilliDegrees: -6_000, radiiMeters: Object.freeze([0.3, 0.82] as const), surfaceLiftMeters: 0.148 }),
  Object.freeze({ rutId: 'north-spine-two', positionMeters: Object.freeze([-0.42, -7.2] as const), rotationMilliDegrees: 5_000, radiiMeters: Object.freeze([0.28, 0.7] as const), surfaceLiftMeters: 0.148 }),
  Object.freeze({ rutId: 'west-district', positionMeters: Object.freeze([-17.24, 5.9] as const), rotationMilliDegrees: -2_000, radiiMeters: Object.freeze([0.24, 0.62] as const), surfaceLiftMeters: 0.055 }),
  Object.freeze({ rutId: 'east-district', positionMeters: Object.freeze([17.32, -7.1] as const), rotationMilliDegrees: 3_000, radiiMeters: Object.freeze([0.25, 0.68] as const), surfaceLiftMeters: 0.055 }),
  Object.freeze({ rutId: 'outer-gate', positionMeters: Object.freeze([0.52, 17.3] as const), rotationMilliDegrees: -4_000, radiiMeters: Object.freeze([0.34, 0.88] as const), surfaceLiftMeters: 0.055 }),
  Object.freeze({ rutId: 'trade-road-west', positionMeters: Object.freeze([-12.9, 23.7] as const), rotationMilliDegrees: 56_000, radiiMeters: Object.freeze([0.3, 0.82] as const), surfaceLiftMeters: 0.055 }),
  Object.freeze({ rutId: 'trade-road-east', positionMeters: Object.freeze([5.2, 19.8] as const), rotationMilliDegrees: -29_000, radiiMeters: Object.freeze([0.26, 0.66] as const), surfaceLiftMeters: 0.055 }),
]);

export const INNER_KEEP_WET_RUT_BUDGETS = Object.freeze({
  high: 12,
  balanced: 8,
  reduced: 4,
} as const);

export type InnerKeepWeatheredWallPlacement = Readonly<{
  placementId: string;
  positionMeters: readonly [number, number, number];
  rotationMilliDegrees: readonly [number, number, number];
  scalePermille: readonly [number, number, number];
}>;

function wallSkirt(
  placementId: string,
  x: number,
  z: number,
  rotationY = 0,
): InnerKeepWeatheredWallPlacement {
  return Object.freeze({
    placementId,
    positionMeters: Object.freeze([x, 0.02, z] as const),
    rotationMilliDegrees: Object.freeze([0, rotationY, 0] as const),
    scalePermille: Object.freeze([1_000, 720, 1_000] as const),
  });
}

/** Exact selected wall asset, instanced as a non-authoritative masonry skirt. */
export const INNER_KEEP_WEATHERED_WALL_SKIRT_ASSET_ID = 'breached-keep-wall';
export const INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS:
readonly InnerKeepWeatheredWallPlacement[] = Object.freeze([
  ...[-16, -12, -8, 8, 12, 16].map((x) => wallSkirt(`north-${x}`, x, -20.45)),
  ...[-17, -13, -9, 7, 11].map((z) => wallSkirt(`west-${z}`, -19.65, z, 90_000)),
  ...[-17, -13, -9, -5, 3, 7, 11].map((z) => wallSkirt(`east-${z}`, 19.65, z, 90_000)),
  ...[-16, -12, -8, 8, 12, 16].map((x) => wallSkirt(`south-${x}`, x, 14.45)),
]);

export const INNER_KEEP_TOWN_ATMOSPHERE_AUTHORITY = Object.freeze({
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
  authoritativeBuildingCount: 0,
  authoritativeResourceNodeCount: 0,
  changesCanonicalLayoutDigest: false,
});
