/**
 * Presentation-only mood and lower-ward composition for the Inner Keep.
 *
 * This policy deliberately sits outside the canonical v15 layout digest. It
 * cannot create a building, occupy a construction slot, block a route, or
 * claim gameplay authority. The generic houses are background silhouettes;
 * build-catalogue assets remain exclusive to authoritative player projects.
 */

export const INNER_KEEP_TOWN_ATMOSPHERE_POLICY_VERSION =
  'inner-keep-sunlit-lowlands-atmosphere-v3';

export const INNER_KEEP_TOWN_TONAL_PALETTE = Object.freeze({
  skyFog: 0xc3dce5,
  fogNearMeters: 48,
  fogFarMeters: 108,
  terrain: Object.freeze({
    lowland: 0x7d9862,
    meadow: 0x91ad6d,
    ridge: 0x7f926c,
    forestTint: 0xa9b997,
    heathTint: 0xb8ad87,
    ridgeTint: 0xaaa995,
    defaultTint: 0xafbd94,
  }),
  roads: Object.freeze({
    outer: 0x8b7558,
    apron: 0x786a54,
    district: 0x846e51,
    inner: 0x8d7657,
    plaza: 0x9b8a70,
    wetRut: 0x4a5147,
  }),
  foliage: Object.freeze({
    grass: 0x78a452,
    trunk: 0x5a422d,
    crown: 0x3e6d3d,
  }),
  water: Object.freeze({
    deep: 0x24566a,
    shallow: 0x4d8f91,
    foam: 0xd9eee0,
    sky: 0x92c8d5,
    bank: 0x756d52,
    bed: 0x355e57,
  }),
  lighting: Object.freeze({
    hemisphereSky: 0xd8eff6,
    hemisphereGround: 0x536b3d,
    hemisphereIntensity: 2.05,
    sun: 0xffe4ad,
    sunIntensity: 3.05,
    sunPositionMeters: Object.freeze([-19, 29, 17] as const),
  }),
  rowHouse: Object.freeze({
    plaster: Object.freeze([0xd9caa2, 0xc9b68d, 0xe1d1ad, 0xbfa77c] as const),
    roof: Object.freeze([0x76513d, 0x8a5e42, 0x5e4a37, 0x9a6845] as const),
    timber: 0x493321,
    window: 0xe6b764,
    smoke: 0xc6c9bd,
    door: 0x65442b,
    shutter: 0x6d5034,
    garden: Object.freeze([0x6f963e, 0x819f49, 0x5f8739] as const),
    linen: Object.freeze([0xe8ddbd, 0xb5c8ad, 0xd7a178] as const),
  }),
  graveyard: Object.freeze({
    stone: Object.freeze([0x8e9385, 0xa7a594, 0x777e74] as const),
    timber: 0x574631,
    path: 0x87785b,
  }),
  dock: Object.freeze({
    timber: 0x765033,
    weathered: 0x947052,
    rope: 0xc0a26e,
    hull: Object.freeze([0x5d3527, 0x74432d] as const),
    cargo: 0xb69058,
  }),
  animals: Object.freeze({
    chicken: 0xc77c3c,
    goose: 0xe2dfcf,
    goat: 0x987b60,
    dark: 0x49382d,
    beak: 0xd79b38,
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
  Object.freeze({ houseId: 'eastwall-croft', positionMeters: Object.freeze([17, 27] as const), rotationMilliDegrees: -18_000, heightScale: 0.92, styleIndex: 3 }),
  Object.freeze({ houseId: 'southfield-east-row', positionMeters: Object.freeze([21.6, 27.5] as const), rotationMilliDegrees: -35_000, heightScale: 0.98, styleIndex: 2 }),
  Object.freeze({ houseId: 'watch-hill-croft', positionMeters: Object.freeze([-26, 3] as const), rotationMilliDegrees: 54_000, heightScale: 0.91, styleIndex: 0 }),
  Object.freeze({ houseId: 'orchard-edge-croft', positionMeters: Object.freeze([-27, 18] as const), rotationMilliDegrees: 35_000, heightScale: 0.93, styleIndex: 1 }),
  Object.freeze({ houseId: 'sunward-market-row', positionMeters: Object.freeze([20, 19.5] as const), rotationMilliDegrees: -35_000, heightScale: 1.01, styleIndex: 2 }),
  Object.freeze({ houseId: 'alder-lane-croft', positionMeters: Object.freeze([13, 25] as const), rotationMilliDegrees: -20_000, heightScale: 0.89, styleIndex: 3 }),
]);

export const INNER_KEEP_LOWER_WARD_ROW_HOUSE_BUDGETS = Object.freeze({
  high: 12,
  balanced: 9,
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
  reduced: 2,
} as const);

export type InnerKeepGraveMarkerPlacement = Readonly<{
  markerId: string;
  positionMeters: readonly [number, number];
  rotationMilliDegrees: number;
  scale: number;
  kind: 'headstone' | 'cross';
}>;

export const INNER_KEEP_GRAVEYARD_PLOT = Object.freeze({
  centerMeters: Object.freeze([-26, -9.5] as const),
  halfExtentsMeters: Object.freeze([2.35, 3.7] as const),
  entranceSide: 'south' as const,
});

export const INNER_KEEP_GRAVEYARD_SOLID_EXCLUSION:
InnerKeepTownSolidExclusion = Object.freeze({
  exclusionId: 'town-scenery:old-road-graveyard',
  center: Object.freeze({
    x: INNER_KEEP_GRAVEYARD_PLOT.centerMeters[0],
    z: INNER_KEEP_GRAVEYARD_PLOT.centerMeters[1],
  }),
  halfExtentsMeters: INNER_KEEP_GRAVEYARD_PLOT.halfExtentsMeters,
  clearanceMarginMeters: 0.3,
});

/** Shared scenic bounds for ecology planners; they carry no gameplay collision. */
export const INNER_KEEP_TOWN_SCENERY_SOLID_EXCLUSIONS:
readonly InnerKeepTownSolidExclusion[] = Object.freeze([
  INNER_KEEP_GRAVEYARD_SOLID_EXCLUSION,
]);

export const INNER_KEEP_GRAVEYARD_FOOTPATH = Object.freeze({
  centerMeters: INNER_KEEP_GRAVEYARD_PLOT.centerMeters,
  radiiMeters: Object.freeze([0.48, 3.15] as const),
});

const GRAVE_MARKER_GRID = Object.freeze([
  [-27.35, -12.5], [-24.65, -12.4],
  [-27.2, -11.7], [-24.8, -11.6],
  [-27.4, -10.9], [-24.6, -10.8],
  [-27.15, -10.1], [-24.85, -10],
  [-27.35, -9.3], [-24.65, -9.2],
  [-27.2, -8.5], [-24.8, -8.4],
  [-27.4, -7.7], [-24.6, -7.6],
  [-27.15, -6.9], [-24.85, -6.8],
  [-27.35, -6.1], [-24.65, -6],
] as const);

export const INNER_KEEP_GRAVE_MARKER_PLACEMENTS:
readonly InnerKeepGraveMarkerPlacement[] = Object.freeze(
  GRAVE_MARKER_GRID.map(([x, z], index) => Object.freeze({
    markerId: `old-road-grave-${String(index + 1).padStart(2, '0')}`,
    positionMeters: Object.freeze([x, z] as const),
    rotationMilliDegrees: ((index * 17_000) % 31_000) - 15_000,
    scale: 0.84 + (index % 4) * 0.07,
    kind: index % 4 === 1 ? 'cross' as const : 'headstone' as const,
  })),
);

export const INNER_KEEP_GRAVE_MARKER_BUDGETS = Object.freeze({
  high: 18,
  balanced: 12,
  reduced: 4,
} as const);

export const INNER_KEEP_GRAVEYARD_FENCE_BUDGETS = Object.freeze({
  high: 10,
  balanced: 10,
  reduced: 4,
} as const);

export const INNER_KEEP_CANAL_BOAT_BUDGETS = Object.freeze({
  high: 1,
  balanced: 1,
  reduced: 1,
} as const);

export const INNER_KEEP_CANAL_DOCK_PLACEMENTS = Object.freeze([
  Object.freeze({
    dockId: 'eastwall-lower-landing',
    positionMeters: Object.freeze([25.2, 0.39, 7] as const),
    rotationMilliDegrees: 0,
  }),
  Object.freeze({
    dockId: 'mere-ferry-landing',
    positionMeters: Object.freeze([25, 0.315, 16.8] as const),
    rotationMilliDegrees: 0,
  }),
] as const);

export const INNER_KEEP_CANAL_DOCK_BUDGETS = Object.freeze({
  high: 2,
  balanced: 1,
  reduced: 1,
} as const);

/** Conservative local X/Z bounds shared by animal-clearance QA. */
export const INNER_KEEP_CANAL_DOCK_HALF_EXTENTS_METERS = Object.freeze([
  1.42,
  0.75,
] as const);

export type InnerKeepVillageAnimalPlacement = Readonly<{
  animalId: string;
  species: 'chicken' | 'goose' | 'goat';
  anchorMeters: readonly [number, number];
  headingMilliDegrees: number;
  roamRadiusMeters: number;
  phase: number;
}>;

export const INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS:
readonly InnerKeepVillageAnimalPlacement[] = Object.freeze([
  Object.freeze({ animalId: 'orchard-goat', species: 'goat', anchorMeters: Object.freeze([-23.4, 17] as const), headingMilliDegrees: 14_000, roamRadiusMeters: 0.34, phase: 0.04 }),
  Object.freeze({ animalId: 'landing-goose', species: 'goose', anchorMeters: Object.freeze([25.7, 10] as const), headingMilliDegrees: -32_000, roamRadiusMeters: 0.35, phase: 0.31 }),
  Object.freeze({ animalId: 'market-hen', species: 'chicken', anchorMeters: Object.freeze([15.8, 16.5] as const), headingMilliDegrees: 64_000, roamRadiusMeters: 0.35, phase: 0.57 }),
  Object.freeze({ animalId: 'gate-hen', species: 'chicken', anchorMeters: Object.freeze([8.8, 23.5] as const), headingMilliDegrees: -18_000, roamRadiusMeters: 0.3, phase: 0.76 }),
  Object.freeze({ animalId: 'orchard-kid', species: 'goat', anchorMeters: Object.freeze([-29, 13] as const), headingMilliDegrees: 41_000, roamRadiusMeters: 0.28, phase: 0.19 }),
  Object.freeze({ animalId: 'ferry-goose', species: 'goose', anchorMeters: Object.freeze([22.8, 8.8] as const), headingMilliDegrees: 20_000, roamRadiusMeters: 0.3, phase: 0.43 }),
  Object.freeze({ animalId: 'tanners-hen', species: 'chicken', anchorMeters: Object.freeze([-28.5, 21.5] as const), headingMilliDegrees: -47_000, roamRadiusMeters: 0.35, phase: 0.68 }),
  Object.freeze({ animalId: 'croft-hen', species: 'chicken', anchorMeters: Object.freeze([-3, 27.5] as const), headingMilliDegrees: 8_000, roamRadiusMeters: 0.35, phase: 0.9 }),
  Object.freeze({ animalId: 'mere-goose', species: 'goose', anchorMeters: Object.freeze([25.7, 14.8] as const), headingMilliDegrees: -8_000, roamRadiusMeters: 0.32, phase: 0.12 }),
  Object.freeze({ animalId: 'watch-goat', species: 'goat', anchorMeters: Object.freeze([-27, 8] as const), headingMilliDegrees: 74_000, roamRadiusMeters: 0.3, phase: 0.83 }),
]);

export const INNER_KEEP_VILLAGE_ANIMAL_BUDGETS = Object.freeze({
  high: 10,
  balanced: 7,
  reduced: 3,
} as const);

export const INNER_KEEP_VILLAGE_ANIMAL_FOOTPRINT_RADIUS_METERS = Object.freeze({
  chicken: 0.58,
  goose: 0.58,
  goat: 0.82,
} satisfies Readonly<Record<InnerKeepVillageAnimalPlacement['species'], number>>);

export const INNER_KEEP_VILLAGE_ANIMAL_ROAMING_EXCLUSIONS = Object.freeze(
  INNER_KEEP_VILLAGE_ANIMAL_PLACEMENTS.map((animal) => Object.freeze({
    exclusionId: `village-animal-roam:${animal.animalId}`,
    center: Object.freeze({
      x: animal.anchorMeters[0],
      z: animal.anchorMeters[1],
    }),
    radiusMeters: Math.SQRT2 * animal.roamRadiusMeters
      + INNER_KEEP_VILLAGE_ANIMAL_FOOTPRINT_RADIUS_METERS[animal.species],
  })),
);

export function sampleInnerKeepVillageAnimalPosition(
  animal: InnerKeepVillageAnimalPlacement,
  elapsedSeconds: number,
) {
  const elapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const cycle = elapsed * (animal.species === 'goat' ? 0.18 : 0.3)
    + animal.phase * Math.PI * 2;
  return Object.freeze({
    x: animal.anchorMeters[0] + Math.cos(cycle) * animal.roamRadiusMeters,
    z: animal.anchorMeters[1] + Math.sin(cycle * 0.83) * animal.roamRadiusMeters,
    headingRadians: animal.headingMilliDegrees * Math.PI / 180_000
      + Math.sin(cycle * 0.7) * 0.32,
  });
}

export type InnerKeepWeatheredWallPlacement = Readonly<{
  placementId: string;
  positionMeters: readonly [number, number, number];
  rotationMilliDegrees: readonly [number, number, number];
  scalePermille: readonly [number, number, number];
}>;

export type InnerKeepPalisadeVisualOverride = Readonly<{
  assetId:
    | 'palisade-wall-corner-90'
    | 'palisade-gate-leaf-left'
    | 'palisade-gate-leaf-right';
  placementId: string;
  positionMeters: readonly [number, number, number];
  rotationMilliDegrees: readonly [number, number, number];
  scalePermille: readonly [number, number, number];
}>;

/**
 * The exact corner prefab is centered on its four-meter tile, while its elbow
 * sits roughly 1.66 meters off that origin on both axes. These presentation-
 * only transforms put the wooden elbow on the canonical wall intersection and
 * tuck both arms into the straight runs. The canonical placement/digest and
 * four-meter collision envelope remain unchanged.
 */
export const INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES:
readonly InnerKeepPalisadeVisualOverride[] = Object.freeze([
  Object.freeze({
    assetId: 'palisade-wall-corner-90',
    placementId: 'wall-corner-north-west',
    positionMeters: Object.freeze([-19.2, 0, -20] as const),
    rotationMilliDegrees: Object.freeze([0, 270_000, 0] as const),
    scalePermille: Object.freeze([600, 1_000, 600] as const),
  }),
  Object.freeze({
    assetId: 'palisade-wall-corner-90',
    placementId: 'wall-corner-north-east',
    positionMeters: Object.freeze([19.2, 0, -20] as const),
    rotationMilliDegrees: Object.freeze([0, 180_000, 0] as const),
    scalePermille: Object.freeze([600, 1_000, 600] as const),
  }),
  Object.freeze({
    assetId: 'palisade-wall-corner-90',
    placementId: 'wall-corner-south-east',
    positionMeters: Object.freeze([19.2, 0, 14] as const),
    rotationMilliDegrees: Object.freeze([0, 90_000, 0] as const),
    scalePermille: Object.freeze([600, 1_000, 600] as const),
  }),
  Object.freeze({
    assetId: 'palisade-wall-corner-90',
    placementId: 'wall-corner-south-west',
    positionMeters: Object.freeze([-19.2, 0, 14] as const),
    rotationMilliDegrees: Object.freeze([0, 0, 0] as const),
    scalePermille: Object.freeze([600, 1_000, 600] as const),
  }),
]);

/**
 * Runtime assets are normalized around their measured X/Z bounds before the
 * placement wrapper is transformed. These centered-wrapper transforms put the
 * leaves' original hinge pivots at x=+/-2.1, z=15.6 and fold them north beside
 * the gateway. The resulting 3.1949-meter visual opening clears both the
 * 2.35-meter supply wagon and the reviewed 3.1-meter road-side buffer.
 */
export const INNER_KEEP_PALISADE_GATE_LEAF_VISUAL_OVERRIDES:
readonly InnerKeepPalisadeVisualOverride[] = Object.freeze([
  Object.freeze({
    assetId: 'palisade-gate-leaf-left',
    placementId: 'south-gate-leaf-left-open',
    positionMeters: Object.freeze([
      -1.917_669_413_449_723_2,
      0,
      14.565_951_859_337_181,
    ] as const),
    rotationMilliDegrees: Object.freeze([0, 80_000, 0] as const),
    scalePermille: Object.freeze([1_000, 1_000, 1_000] as const),
  }),
  Object.freeze({
    assetId: 'palisade-gate-leaf-right',
    placementId: 'south-gate-leaf-right-open',
    positionMeters: Object.freeze([
      1.917_669_413_449_723_2,
      0,
      14.565_951_859_337_181,
    ] as const),
    rotationMilliDegrees: Object.freeze([0, -80_000, 0] as const),
    scalePermille: Object.freeze([1_000, 1_000, 1_000] as const),
  }),
]);

export const INNER_KEEP_PALISADE_VISUAL_CORRECTION_POLICY = Object.freeze({
  policyVersion: 'inner-keep-palisade-visual-correction-v1',
  sourcePresentationLayoutDigest:
    '0a976765d6f6e740eb6282fca90f59b412ecbd7ed382f001da89a0b7abeca756',
  presentationOnly: true,
  gameplayAuthorityClaimed: false,
  changesCanonicalLayoutDigest: false,
  cornerOverrides: INNER_KEEP_PALISADE_CORNER_VISUAL_OVERRIDES,
  gateLeafOverrides: INNER_KEEP_PALISADE_GATE_LEAF_VISUAL_OVERRIDES,
});

/** Stable UTF-8 input for the reviewed visual-correction SHA-256. */
export function canonicalInnerKeepPalisadeVisualCorrectionDigestInput() {
  return JSON.stringify(INNER_KEEP_PALISADE_VISUAL_CORRECTION_POLICY);
}

// SHA-256 of canonicalInnerKeepPalisadeVisualCorrectionDigestInput().
export const INNER_KEEP_PALISADE_VISUAL_CORRECTION_DIGEST =
  '2972e25e56e3ccfc81f892e5bce9b4680d5f95ab0b1b3e5712bf101300d13899';

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
