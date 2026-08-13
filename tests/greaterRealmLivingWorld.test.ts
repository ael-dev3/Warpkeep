import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from '../scripts/atlas/greater-realm-biomes';
import {
  GREATER_REALM_AMBIENT_LIFE_CLASS,
  GREATER_REALM_ECOLOGY_CLASS,
  GREATER_REALM_LANDMARK_CLASS,
  GREATER_REALM_LIVING_WORLD_VERSION,
  GREATER_REALM_ROUTE_CLASS,
  clearGreaterRealmLivingWorldAuthority,
  deriveGreaterRealmLivingWorld,
  hasGreaterRealmCandidateScaleLivingWorldCapacity,
  type GreaterRealmLivingWorldCandidateCapacityMetrics,
  type GreaterRealmLivingWorldInput,
} from '../scripts/atlas/greater-realm-living-world';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

const NEIGHBOR_COUNT = 6;

function axialDistance(q: number, r: number): number {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

function coordinatesForRadius(radius: number): AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (axialDistance(q, r) <= radius) coordinates.push({ q, r });
    }
  }
  return coordinates;
}

function syntheticLivingWorldInput(radius = 36): GreaterRealmLivingWorldInput {
  const grid = indexGreaterRealmAxialGrid(coordinatesForRadius(radius));
  const waterRegime = new Uint8Array(grid.cellCount);
  const biomeId = new Uint8Array(grid.cellCount);
  const landformId = new Uint8Array(grid.cellCount);
  const elevation = new Int32Array(grid.cellCount);
  const slope = new Uint16Array(grid.cellCount);
  const moisture = new Int32Array(grid.cellCount);
  const temperature = new Int32Array(grid.cellCount);
  const wetnessIndex = new Uint16Array(grid.cellCount);
  const exposure = new Int32Array(grid.cellCount);
  const distanceToFreshwater = new Uint16Array(grid.cellCount);
  const distanceToCoast = new Uint16Array(grid.cellCount);
  const legacyProtectedCell = new Uint8Array(grid.cellCount);
  const castleSlot = new Uint8Array(grid.cellCount);
  const resourcePotential = new Uint8Array(grid.cellCount);
  const corePotential = new Uint8Array(grid.cellCount);
  const throneAnchor = new Uint8Array(grid.cellCount);
  const barrier = new Uint8Array(grid.cellCount);
  const gateCell = new Uint8Array(grid.cellCount);
  const gateApproachCell = new Uint8Array(grid.cellCount);

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const q = grid.q[cell]!;
    const r = grid.r[cell]!;
    const radiusAtCell = axialDistance(q, r);
    const micro = ((Math.imul(q, 73_856_093) ^ Math.imul(r, 19_349_663)) >>> 0) % 220;
    elevation[cell] = 4_000 + radiusAtCell * 35 + micro;
    slope[cell] = 180 + micro;
    exposure[cell] = (micro % 180) - 90;
    wetnessIndex[cell] = Math.max(0, 3_000 - Math.abs(q) * 90);
    distanceToFreshwater[cell] = Math.abs(q);
    distanceToCoast[cell] = Math.max(0, radius - radiusAtCell);

    if (radiusAtCell >= radius - 1) {
      waterRegime[cell] = 1;
      biomeId[cell] = GREATER_REALM_BIOME_ID.SALTWATER;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.ISLAND_SHELF;
      moisture[cell] = 6_000;
      temperature[cell] = 4_000;
      continue;
    }
    if (q === 0 && Math.abs(r) < radius - 4) {
      waterRegime[cell] = 4;
      biomeId[cell] = GREATER_REALM_BIOME_ID.RIVER_STREAM;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.WATERCOURSE;
      moisture[cell] = 8_000;
      temperature[cell] = 4_500;
      continue;
    }
    if (q < -23) {
      biomeId[cell] = GREATER_REALM_BIOME_ID.ALPINE_SNOW;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.ALPINE_PLATEAU;
      temperature[cell] = 100;
      moisture[cell] = 2_300;
      elevation[cell] = 11_000 + radiusAtCell * 80;
    } else if (q < -13) {
      biomeId[cell] = GREATER_REALM_BIOME_ID.PINE_FOREST;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.HILL;
      temperature[cell] = 2_400;
      moisture[cell] = 3_400;
    } else if (q < -4) {
      biomeId[cell] = GREATER_REALM_BIOME_ID.FLOWER_MEADOW;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.HILL;
      temperature[cell] = 4_400;
      moisture[cell] = 3_600;
    } else if (q <= 3) {
      biomeId[cell] = Math.abs(q) <= 2
        ? GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
        : GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND;
      landformId[cell] = Math.abs(q) <= 2
        ? GREATER_REALM_LANDFORM_ID.BASIN
        : GREATER_REALM_LANDFORM_ID.LOWLAND;
      temperature[cell] = 5_200;
      moisture[cell] = Math.abs(q) <= 2 ? 6_200 : 1_400;
      wetnessIndex[cell] = Math.abs(q) <= 2 ? 7_500 : wetnessIndex[cell];
    } else if (q < 12 && r > 2) {
      biomeId[cell] = GREATER_REALM_BIOME_ID.OAK_FOREST;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.FLOODPLAIN;
      temperature[cell] = 7_800;
      moisture[cell] = 5_200;
    } else if (q < 16) {
      biomeId[cell] = GREATER_REALM_BIOME_ID.SAVANNA;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.LOWLAND;
      temperature[cell] = 7_400;
      moisture[cell] = 800;
    } else if (q < 24) {
      biomeId[cell] = GREATER_REALM_BIOME_ID.DUNE_DESERT;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.DUNE;
      temperature[cell] = 8_100;
      moisture[cell] = -2_500;
    } else {
      biomeId[cell] = GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND;
      landformId[cell] = GREATER_REALM_LANDFORM_ID.MOUNTAIN;
      temperature[cell] = 2_700;
      moisture[cell] = 500;
      elevation[cell] = 16_000 + radiusAtCell * 60;
      slope[cell] = 1_100 + micro;
    }
  }

  const mark = (mask: Uint8Array, q: number, r: number) => {
    const cell = grid.indexOf({ q, r });
    if (cell < 0) throw new Error('SYNTHETIC_CELL_MISSING');
    mask[cell] = 1;
    return cell;
  };
  mark(legacyProtectedCell, -8, -2);
  mark(castleSlot, -6, -2);
  mark(resourcePotential, -4, -2);
  mark(corePotential, 4, -2);
  mark(throneAnchor, 6, -2);
  mark(barrier, 8, -2);
  mark(gateCell, 10, -2);
  mark(gateApproachCell, 12, -2);

  return Object.freeze({
    grid,
    seed: new Uint32Array([0x1234_5678, 0x9abc_def0, 0x1357_9bdf, 0x2468_ace0]),
    waterRegime,
    biomeId,
    landformId,
    elevation,
    slope,
    moisture,
    temperature,
    wetnessIndex,
    exposure,
    distanceToFreshwater,
    distanceToCoast,
    legacyProtectedCell,
    castleSlot,
    resourcePotential,
    corePotential,
    throneAnchor,
    barrier,
    gateCell,
    gateApproachCell,
  });
}

function outputAt(
  result: ReturnType<typeof deriveGreaterRealmLivingWorld>,
  cell: number,
): readonly number[] {
  return [
    result.ecologyClass[cell]!,
    result.vegetationDensity[cell]!,
    result.groundcoverDensity[cell]!,
    result.wildflowerDensity[cell]!,
    result.routeClass[cell]!,
    result.landmarkClass[cell]!,
    result.ambientLifeClass[cell]!,
  ];
}

function routeAtOrAdjacent(
  input: GreaterRealmLivingWorldInput,
  routeClass: Uint8Array,
  cell: number,
): boolean {
  if (routeClass[cell] !== GREATER_REALM_ROUTE_CLASS.NONE) return true;
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (neighbor >= 0 && routeClass[neighbor] !== GREATER_REALM_ROUTE_CLASS.NONE) return true;
  }
  return false;
}

function landmarkAtOrAdjacent(
  input: GreaterRealmLivingWorldInput,
  landmarkClass: Uint8Array,
  cell: number,
): boolean {
  if (landmarkClass[cell] !== GREATER_REALM_LANDMARK_CLASS.NONE) return true;
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (neighbor >= 0 && landmarkClass[neighbor] !== GREATER_REALM_LANDMARK_CLASS.NONE) {
      return true;
    }
  }
  return false;
}

function adjacentToAnyMask(
  input: GreaterRealmLivingWorldInput,
  cell: number,
  masks: readonly Uint8Array[],
): boolean {
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (neighbor >= 0 && masks.some(mask => mask[neighbor] !== 0)) return true;
  }
  return false;
}

describe('Greater Realm private living-world authority', () => {
  it('freezes serialized living-world class identifiers', () => {
    expect(GREATER_REALM_LIVING_WORLD_VERSION)
      .toBe('greater-realm-private-living-world-v4');
    expect(GREATER_REALM_ECOLOGY_CLASS).toEqual({
      NONE: 0,
      PLAINS: 1,
      FOREST: 2,
      TAIGA: 3,
      JUNGLE: 4,
      SWAMP: 5,
      SAVANNA: 6,
      DESERT: 7,
      ALPINE: 8,
      SNOW: 9,
    });
    expect(GREATER_REALM_ROUTE_CLASS).toEqual({
      NONE: 0,
      TRACK: 1,
      ROAD: 2,
      CARRIAGEWAY: 3,
      FORD: 4,
    });
    expect(GREATER_REALM_LANDMARK_CLASS).toEqual({
      NONE: 0,
      ABANDONED_RUIN: 1,
      RUINED_WALL: 2,
      WAYSTONE: 3,
      LAMP_POST: 4,
    });
    expect(GREATER_REALM_AMBIENT_LIFE_CLASS).toEqual({
      NONE: 0,
      RABBIT_HABITAT: 1,
      CIVILIAN_FOOTFALL: 2,
      GUARD_POST: 3,
      COURIER_ROUTE: 4,
      EXOTIC_COURIER_ROUTE: 5,
    });
  });

  it('accepts candidate-scale living-world capacity at conservative boundaries', () => {
    const lowerBoundary: GreaterRealmLivingWorldCandidateCapacityMetrics = {
      dressingEligibleCellCount: 100_000,
      ecologyCellCounts: {
        plains: 45_000,
        forest: 25_000,
        taiga: 5_000,
        jungle: 2_500,
        swamp: 2_500,
        savanna: 7_000,
        desert: 3_000,
        alpine: 6_000,
        snow: 4_000,
      },
      eligibleLandVegetatedBasisPoints: 2_500,
      eligibleLandOpenBasisPoints: 7_500,
      groundcoverCellCount: 35_000,
      wildflowerCellCount: 700,
      eligibleLandGroundcoverBasisPoints: 3_500,
      groundcoveredLandWildflowerBasisPoints: 200,
      groundcoverPatchCount: 8,
      largestGroundcoverPatchBasisPoints: 6_000,
      groundcoverDistinctDensityValueCount: 32,
      wildflowerPatchCount: 8,
      largestWildflowerPatchBasisPoints: 3_000,
      wildflowerDistinctDensityValueCount: 16,
      routeCellCounts: {
        track: 1_000,
        road: 2_500,
        carriageway: 1_500,
        ford: 500,
      },
      landmarkCellCounts: {
        abandonedRuin: 32,
        ruinedWall: 64,
        waystone: 64,
        lampPost: 96,
      },
      ambientLifeCellCounts: {
        rabbitHabitat: 128,
        civilianFootfall: 64,
        guardPost: 16,
        courierRoute: 32,
        exoticCourierRoute: 4,
      },
    };
    expect(
      hasGreaterRealmCandidateScaleLivingWorldCapacity(lowerBoundary),
    ).toBe(true);
    expect(
      hasGreaterRealmCandidateScaleLivingWorldCapacity({
        ...lowerBoundary,
        eligibleLandVegetatedBasisPoints: 8_500,
        eligibleLandOpenBasisPoints: 1_500,
        groundcoverCellCount: 85_000,
        wildflowerCellCount: 17_000,
        eligibleLandGroundcoverBasisPoints: 8_500,
        groundcoveredLandWildflowerBasisPoints: 2_000,
        routeCellCounts: {
          track: 4_000,
          road: 12_000,
          carriageway: 4_000,
          ford: 1_000,
        },
        landmarkCellCounts: {
          ...lowerBoundary.landmarkCellCounts,
          ruinedWall: 96,
        },
        ambientLifeCellCounts: {
          ...lowerBoundary.ambientLifeCellCounts,
          rabbitHabitat: 1_884,
        },
      }),
    ).toBe(true);
  });

  it('rejects every candidate-scale living-world capacity boundary violation', () => {
    const valid: GreaterRealmLivingWorldCandidateCapacityMetrics = {
      dressingEligibleCellCount: 100_000,
      ecologyCellCounts: {
        plains: 45_000,
        forest: 25_000,
        taiga: 5_000,
        jungle: 2_500,
        swamp: 2_500,
        savanna: 7_000,
        desert: 3_000,
        alpine: 6_000,
        snow: 4_000,
      },
      eligibleLandVegetatedBasisPoints: 5_000,
      eligibleLandOpenBasisPoints: 5_000,
      groundcoverCellCount: 60_000,
      wildflowerCellCount: 6_000,
      eligibleLandGroundcoverBasisPoints: 6_000,
      groundcoveredLandWildflowerBasisPoints: 1_000,
      groundcoverPatchCount: 80,
      largestGroundcoverPatchBasisPoints: 2_000,
      groundcoverDistinctDensityValueCount: 180,
      wildflowerPatchCount: 120,
      largestWildflowerPatchBasisPoints: 500,
      wildflowerDistinctDensityValueCount: 100,
      routeCellCounts: {
        track: 2_000,
        road: 6_000,
        carriageway: 1_000,
        ford: 1_000,
      },
      landmarkCellCounts: {
        abandonedRuin: 32,
        ruinedWall: 80,
        waystone: 64,
        lampPost: 96,
      },
      ambientLifeCellCounts: {
        rabbitHabitat: 128,
        civilianFootfall: 64,
        guardPost: 16,
        courierRoute: 32,
        exoticCourierRoute: 4,
      },
    };
    const cases: ReadonlyArray<
      readonly [string, GreaterRealmLivingWorldCandidateCapacityMetrics]
    > = [
      ['empty eligible surface', { ...valid, dressingEligibleCellCount: 0 }],
      [
        'ecology partition mismatch',
        {
          ...valid,
          ecologyCellCounts: { ...valid.ecologyCellCounts, plains: 45_001 },
        },
      ],
      [
        'vegetation/open partition mismatch',
        { ...valid, eligibleLandOpenBasisPoints: 4_999 },
      ],
      [
        'ecology class floor',
        {
          ...valid,
          ecologyCellCounts: {
            ...valid.ecologyCellCounts,
            plains: 47_993,
            desert: 7,
          },
        },
      ],
      [
        'lush ecology floor',
        {
          ...valid,
          ecologyCellCounts: {
            ...valid.ecologyCellCounts,
            plains: 55_000,
            forest: 14_999,
            jungle: 2_500,
            swamp: 2_500,
            savanna: 7_001,
          },
        },
      ],
      [
        'cold ecology floor',
        {
          ...valid,
          ecologyCellCounts: {
            ...valid.ecologyCellCounts,
            plains: 52_001,
            taiga: 8,
            alpine: 3_991,
            snow: 4_000,
          },
        },
      ],
      [
        'arid ecology floor',
        {
          ...valid,
          ecologyCellCounts: {
            ...valid.ecologyCellCounts,
            plains: 52_001,
            savanna: 1_991,
            desert: 1_008,
          },
        },
      ],
      [
        'single ecology cap',
        {
          ...valid,
          ecologyCellCounts: {
            ...valid.ecologyCellCounts,
            plains: 55_001,
            forest: 15_000,
            taiga: 4_999,
          },
        },
      ],
      [
        'vegetation floor',
        {
          ...valid,
          eligibleLandVegetatedBasisPoints: 2_499,
          eligibleLandOpenBasisPoints: 7_501,
        },
      ],
      [
        'vegetation cap / open-country floor',
        {
          ...valid,
          eligibleLandVegetatedBasisPoints: 8_501,
          eligibleLandOpenBasisPoints: 1_499,
        },
      ],
      [
        'groundcover floor',
        {
          ...valid,
          groundcoverCellCount: 34_994,
          wildflowerCellCount: 3_499,
          eligibleLandGroundcoverBasisPoints: 3_499,
          groundcoveredLandWildflowerBasisPoints: 1_000,
        },
      ],
      [
        'groundcover cap',
        {
          ...valid,
          groundcoverCellCount: 85_006,
          wildflowerCellCount: 8_501,
          eligibleLandGroundcoverBasisPoints: 8_501,
          groundcoveredLandWildflowerBasisPoints: 1_000,
        },
      ],
      [
        'wildflower floor',
        {
          ...valid,
          wildflowerCellCount: 1_196,
          groundcoveredLandWildflowerBasisPoints: 199,
        },
      ],
      [
        'wildflower cap',
        {
          ...valid,
          wildflowerCellCount: 12_004,
          groundcoveredLandWildflowerBasisPoints: 2_001,
        },
      ],
      [
        'wildflowers exceed groundcover',
        {
          ...valid,
          wildflowerCellCount: 60_001,
          groundcoveredLandWildflowerBasisPoints: 10_000,
        },
      ],
      [
        'groundcover count/basis mismatch',
        {
          ...valid,
          groundcoverCellCount: 60_006,
        },
      ],
      [
        'groundcover patch floor',
        { ...valid, groundcoverPatchCount: 7 },
      ],
      [
        'groundcover largest-patch cap',
        { ...valid, largestGroundcoverPatchBasisPoints: 6_001 },
      ],
      [
        'groundcover density-diversity floor',
        { ...valid, groundcoverDistinctDensityValueCount: 31 },
      ],
      [
        'groundcover patch cardinality contradiction',
        { ...valid, groundcoverPatchCount: 10_001 },
      ],
      [
        'groundcover density-diversity contradiction',
        { ...valid, groundcoverDistinctDensityValueCount: 256 },
      ],
      [
        'wildflower patch floor',
        { ...valid, wildflowerPatchCount: 7 },
      ],
      [
        'wildflower largest-patch cap',
        { ...valid, largestWildflowerPatchBasisPoints: 3_001 },
      ],
      [
        'wildflower density-diversity floor',
        { ...valid, wildflowerDistinctDensityValueCount: 15 },
      ],
      [
        'wildflower patch cardinality contradiction',
        { ...valid, wildflowerPatchCount: 2_001 },
      ],
      [
        'wildflower density-diversity contradiction',
        { ...valid, wildflowerDistinctDensityValueCount: 256 },
      ],
      [
        'route floor',
        {
          ...valid,
          routeCellCounts: {
            track: 1_000,
            road: 2_499,
            carriageway: 1_500,
            ford: 50_000,
          },
        },
      ],
      [
        'route cap',
        {
          ...valid,
          routeCellCounts: {
            track: 4_000,
            road: 12_001,
            carriageway: 4_000,
            ford: 0,
          },
        },
      ],
      [
        'ruin floor',
        {
          ...valid,
          landmarkCellCounts: {
            ...valid.landmarkCellCounts,
            abandonedRuin: 31,
          },
        },
      ],
      [
        'ruin-wall floor',
        {
          ...valid,
          landmarkCellCounts: { ...valid.landmarkCellCounts, ruinedWall: 63 },
        },
      ],
      [
        'ruin-wall cap',
        {
          ...valid,
          landmarkCellCounts: { ...valid.landmarkCellCounts, ruinedWall: 97 },
        },
      ],
      [
        'waystone floor',
        {
          ...valid,
          landmarkCellCounts: { ...valid.landmarkCellCounts, waystone: 63 },
        },
      ],
      [
        'lamp floor',
        {
          ...valid,
          landmarkCellCounts: { ...valid.landmarkCellCounts, lampPost: 95 },
        },
      ],
      ...(
        [
          ['rabbitHabitat', 127],
          ['civilianFootfall', 63],
          ['guardPost', 15],
          ['courierRoute', 31],
          ['exoticCourierRoute', 3],
        ] as const
      ).map(
        ([key, count]) =>
          [
            `${key} floor`,
            {
              ...valid,
              ambientLifeCellCounts: {
                ...valid.ambientLifeCellCounts,
                [key]: count,
              },
            },
          ] as const,
      ),
      [
        'ambient cap',
        {
          ...valid,
          ambientLifeCellCounts: {
            ...valid.ambientLifeCellCounts,
            rabbitHabitat: 1_885,
          },
        },
      ],
      [
        'invalid count',
        {
          ...valid,
          routeCellCounts: { ...valid.routeCellCounts, ford: -1 },
        },
      ],
    ];
    for (const [label, metrics] of cases) {
      expect(
        hasGreaterRealmCandidateScaleLivingWorldCapacity(metrics),
        label,
      ).toBe(false);
    }
  });

  it('is deterministic, offline-only in shape, and does not mutate or alias candidate inputs', () => {
    const input = syntheticLivingWorldInput();
    const before = {
      seed: new Uint32Array(input.seed),
      waterRegime: new Uint8Array(input.waterRegime),
      biomeId: new Uint8Array(input.biomeId),
      landformId: new Uint8Array(input.landformId),
      elevation: new Int32Array(input.elevation),
      slope: new Uint16Array(input.slope),
      moisture: new Int32Array(input.moisture),
      temperature: new Int32Array(input.temperature),
      wetnessIndex: new Uint16Array(input.wetnessIndex),
      exposure: new Int32Array(input.exposure),
      distanceToFreshwater: new Uint16Array(input.distanceToFreshwater),
      distanceToCoast: new Uint16Array(input.distanceToCoast),
      legacyProtectedCell: new Uint8Array(input.legacyProtectedCell),
      castleSlot: new Uint8Array(input.castleSlot),
      resourcePotential: new Uint8Array(input.resourcePotential),
      corePotential: new Uint8Array(input.corePotential),
      throneAnchor: new Uint8Array(input.throneAnchor),
      barrier: new Uint8Array(input.barrier),
      gateCell: new Uint8Array(input.gateCell),
      gateApproachCell: new Uint8Array(input.gateApproachCell),
    };
    const first = deriveGreaterRealmLivingWorld(input);
    const second = deriveGreaterRealmLivingWorld(input);

    expect(first.version).toBe(GREATER_REALM_LIVING_WORLD_VERSION);
    expect(first.dressingExcluded).toEqual(second.dressingExcluded);
    expect(first.ecologyClass).toEqual(second.ecologyClass);
    expect(first.vegetationDensity).toEqual(second.vegetationDensity);
    expect(first.groundcoverDensity).toEqual(second.groundcoverDensity);
    expect(first.wildflowerDensity).toEqual(second.wildflowerDensity);
    expect(first.routeClass).toEqual(second.routeClass);
    expect(first.landmarkClass).toEqual(second.landmarkClass);
    expect(first.ambientLifeClass).toEqual(second.ambientLifeClass);
    expect(first.metrics).toEqual(second.metrics);
    expect(input.seed).toEqual(before.seed);
    expect(input.waterRegime).toEqual(before.waterRegime);
    expect(input.biomeId).toEqual(before.biomeId);
    expect(input.landformId).toEqual(before.landformId);
    expect(input.elevation).toEqual(before.elevation);
    expect(input.slope).toEqual(before.slope);
    expect(input.moisture).toEqual(before.moisture);
    expect(input.temperature).toEqual(before.temperature);
    expect(input.wetnessIndex).toEqual(before.wetnessIndex);
    expect(input.exposure).toEqual(before.exposure);
    expect(input.distanceToFreshwater).toEqual(before.distanceToFreshwater);
    expect(input.distanceToCoast).toEqual(before.distanceToCoast);
    expect(input.legacyProtectedCell).toEqual(before.legacyProtectedCell);
    expect(input.castleSlot).toEqual(before.castleSlot);
    expect(input.resourcePotential).toEqual(before.resourcePotential);
    expect(input.corePotential).toEqual(before.corePotential);
    expect(input.throneAnchor).toEqual(before.throneAnchor);
    expect(input.barrier).toEqual(before.barrier);
    expect(input.gateCell).toEqual(before.gateCell);
    expect(input.gateApproachCell).toEqual(before.gateApproachCell);

    const editableCell = first.dressingExcluded.findIndex(value => value === 0);
    expect(editableCell).toBeGreaterThanOrEqual(0);
    const originalBiome = input.biomeId[editableCell]!;
    first.ecologyClass[editableCell] = GREATER_REALM_ECOLOGY_CLASS.NONE;
    expect(input.biomeId[editableCell]).toBe(originalBiome);
    expect(second.ecologyClass[editableCell]).not.toBe(GREATER_REALM_ECOLOGY_CLASS.NONE);
  });

  it('hard-excludes water, frozen Lowlands, deployed sites, barriers, gates, and approaches', () => {
    const input = syntheticLivingWorldInput();
    const marshCell = input.grid.indexOf({ q: 2, r: 8 });
    expect(marshCell).toBeGreaterThanOrEqual(0);
    input.waterRegime[marshCell] = 6;
    const result = deriveGreaterRealmLivingWorld(input);
    const masks = [
      input.legacyProtectedCell,
      input.castleSlot,
      input.throneAnchor,
      input.barrier,
      input.gateCell,
      input.gateApproachCell,
    ];
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const reserved = masks.some(mask => mask[cell] !== 0);
      const water = input.waterRegime[cell] !== 0;
      const excluded = water || reserved;
      if (!excluded) continue;
      expect(result.dressingExcluded[cell]).toBe(1);
      if (reserved || input.waterRegime[cell] === 1
        || input.waterRegime[cell] === 2 || input.waterRegime[cell] === 5
        || input.waterRegime[cell] === 6) {
        expect(outputAt(result, cell)).toEqual([0, 0, 0, 0, 0, 0, 0]);
      } else {
        expect(result.ecologyClass[cell]).toBe(0);
        expect(result.vegetationDensity[cell]).toBe(0);
        expect([
          GREATER_REALM_ROUTE_CLASS.NONE,
          GREATER_REALM_ROUTE_CLASS.FORD,
        ]).toContain(result.routeClass[cell]);
        expect(result.landmarkClass[cell]).toBe(0);
        expect(result.ambientLifeClass[cell]).toBe(0);
      }
    }
    for (const potential of [input.resourcePotential, input.corePotential]) {
      const cell = potential.findIndex(value => value !== 0);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(input.waterRegime[cell]).toBe(0);
      expect(result.dressingExcluded[cell]).toBe(0);
    }
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.castleSlot[cell] !== 1) continue;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor >= 0) expect(result.landmarkClass[neighbor]).toBe(0);
      }
    }
    expect(result.metrics.legacyPreservationViolationCount).toBe(0);
    expect(result.metrics.waterExclusionViolationCount).toBe(0);
    expect(result.metrics.reservedSiteExclusionViolationCount).toBe(0);
    expect(result.invariants.legacyProtectedCellsPreserved).toBe(true);
    expect(result.invariants.waterExcluded).toBe(true);
    expect(result.invariants.reservedSitesExcluded).toBe(true);
  });

  it('fails closed on an unknown water regime', () => {
    const input = syntheticLivingWorldInput();
    input.waterRegime[0] = 7;
    expect(() => deriveGreaterRealmLivingWorld(input))
      .toThrow('GREATER_REALM_LIVING_WORLD_WATER_REGIME_INVALID');
  });

  it('maps broad climate and topography into compatible natural ecology classes', () => {
    const input = syntheticLivingWorldInput();
    const cell = (q: number, r: number) => input.grid.indexOf({ q, r });
    const cases = [
      { at: cell(-5, 10), biome: GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
        landform: GREATER_REALM_LANDFORM_ID.LOWLAND, temperature: 4_500, moisture: 1_000,
        elevation: 4_000, expected: GREATER_REALM_ECOLOGY_CLASS.PLAINS },
      { at: cell(-8, 8), biome: GREATER_REALM_BIOME_ID.FLOWER_MEADOW,
        landform: GREATER_REALM_LANDFORM_ID.HILL, temperature: 4_500, moisture: 3_500,
        elevation: 4_000, expected: GREATER_REALM_ECOLOGY_CLASS.PLAINS },
      { at: cell(-10, 8), biome: GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST,
        landform: GREATER_REALM_LANDFORM_ID.LOWLAND, temperature: 4_500, moisture: 1_000,
        elevation: 4_000, expected: GREATER_REALM_ECOLOGY_CLASS.FOREST },
      { at: cell(-11, 8), biome: GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST,
        landform: GREATER_REALM_LANDFORM_ID.HILL, temperature: 2_500, moisture: 1_000,
        elevation: 5_000, expected: GREATER_REALM_ECOLOGY_CLASS.TAIGA },
      { at: cell(-12, 8), biome: GREATER_REALM_BIOME_ID.PINE_FOREST,
        landform: GREATER_REALM_LANDFORM_ID.HILL, temperature: 2_500, moisture: 3_000,
        elevation: 5_000, expected: GREATER_REALM_ECOLOGY_CLASS.TAIGA },
      { at: cell(10, 8), biome: GREATER_REALM_BIOME_ID.OAK_FOREST,
        landform: GREATER_REALM_LANDFORM_ID.FLOODPLAIN,
        temperature: 8_000, moisture: 5_000,
        elevation: 4_000, expected: GREATER_REALM_ECOLOGY_CLASS.JUNGLE },
      { at: cell(2, 8), biome: GREATER_REALM_BIOME_ID.FRESHWATER_MARSH,
        landform: GREATER_REALM_LANDFORM_ID.BASIN, temperature: 5_000, moisture: 6_000,
        elevation: 3_000, expected: GREATER_REALM_ECOLOGY_CLASS.SWAMP },
      { at: cell(14, 0), biome: GREATER_REALM_BIOME_ID.SAVANNA,
        landform: GREATER_REALM_LANDFORM_ID.LOWLAND, temperature: 7_500, moisture: 800,
        elevation: 4_000, expected: GREATER_REALM_ECOLOGY_CLASS.SAVANNA },
      { at: cell(20, 0), biome: GREATER_REALM_BIOME_ID.DUNE_DESERT,
        landform: GREATER_REALM_LANDFORM_ID.DUNE, temperature: 8_000, moisture: -2_500,
        elevation: 4_000, expected: GREATER_REALM_ECOLOGY_CLASS.DESERT },
      { at: cell(25, -5), biome: GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
        landform: GREATER_REALM_LANDFORM_ID.MOUNTAIN,
        temperature: 2_500, moisture: 500,
        elevation: 16_000, expected: GREATER_REALM_ECOLOGY_CLASS.ALPINE },
      { at: cell(-25, 5), biome: GREATER_REALM_BIOME_ID.ALPINE_SNOW,
        landform: GREATER_REALM_LANDFORM_ID.ALPINE_PLATEAU,
        temperature: 100, moisture: 2_000,
        elevation: 11_000, expected: GREATER_REALM_ECOLOGY_CLASS.SNOW },
    ] as const;
    for (const entry of cases) {
      expect(entry.at).toBeGreaterThanOrEqual(0);
      input.waterRegime[entry.at] = 0;
      input.biomeId[entry.at] = entry.biome;
      input.landformId[entry.at] = entry.landform;
      input.temperature[entry.at] = entry.temperature;
      input.moisture[entry.at] = entry.moisture;
      input.elevation[entry.at] = entry.elevation;
      input.slope[entry.at] = 300;
      input.wetnessIndex[entry.at] = entry.expected === GREATER_REALM_ECOLOGY_CLASS.SWAMP
        ? 7_000
        : 1_000;
    }
    const result = deriveGreaterRealmLivingWorld(input);
    for (const entry of cases) expect(result.ecologyClass[entry.at]).toBe(entry.expected);
    expect(Object.values(result.metrics.ecologyCellCounts).every(count => count > 0)).toBe(true);
    expect(result.metrics.ecologicalCompatibilityViolationCount).toBe(0);
    expect(result.invariants.ecologiesCompatible).toBe(true);
  });

  it('builds an anchor-connected backbone with exact river/stream fords', () => {
    const input = syntheticLivingWorldInput();
    const result = deriveGreaterRealmLivingWorld(input);
    const mandatorySiteMasks = [
      input.castleSlot,
      input.throneAnchor,
    ];
    expect(Object.values(result.metrics.routeCellCounts).every(count => count > 0)).toBe(true);
    expect(result.metrics.requiredRouteAnchorCount).toBeGreaterThan(0);
    expect(result.metrics.unreachableMandatorySiteCount).toBe(0);
    expect(result.metrics.coveredRouteAnchorCount).toBe(
      result.metrics.requiredRouteAnchorCount,
    );
    expect(result.metrics.uncoveredRouteAnchorCount).toBe(0);
    expect(result.metrics.gateApproachComponentCount).toBeGreaterThan(0);
    expect(result.metrics.unsupportedGateApproachComponentCount).toBe(0);
    expect(result.metrics.routeComponentCount).toBeGreaterThan(0);
    expect(result.metrics.anchorBearingRouteComponentCount).toBe(
      result.metrics.routeComponentCount,
    );
    expect(result.metrics.anchorlessRouteComponentCount).toBe(0);
    expect(result.metrics.fordCellCount).toBeGreaterThan(0);
    expect(result.metrics.forbiddenWaterRouteViolationCount).toBe(0);
    expect(result.metrics.fordRegimeViolationCount).toBe(0);
    expect(result.metrics.sealedGateRouteViolationCount).toBe(0);

    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (mandatorySiteMasks.some(mask => mask[cell] !== 0)) {
        expect(routeAtOrAdjacent(input, result.routeClass, cell)).toBe(true);
      }
      if (input.gateCell[cell] !== 0 || input.gateApproachCell[cell] !== 0) {
        expect(result.routeClass[cell]).toBe(GREATER_REALM_ROUTE_CLASS.NONE);
      }
      const route = result.routeClass[cell]!;
      const regime = input.waterRegime[cell]!;
      if (route === GREATER_REALM_ROUTE_CLASS.FORD) {
        expect([3, 4]).toContain(regime);
        let hasOpposingRoutedBanks = false;
        for (let direction = 0; direction < 3; direction += 1) {
          const first = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          const second = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction + 3]!;
          if (
            first >= 0
            && second >= 0
            && input.waterRegime[first] === 0
            && input.waterRegime[second] === 0
            && result.routeClass[first] !== GREATER_REALM_ROUTE_CLASS.NONE
            && result.routeClass[second] !== GREATER_REALM_ROUTE_CLASS.NONE
          ) hasOpposingRoutedBanks = true;
        }
        expect(hasOpposingRoutedBanks).toBe(true);
      }
      if (regime === 1 || regime === 2 || regime === 5) {
        expect(route).toBe(GREATER_REALM_ROUTE_CLASS.NONE);
      }
    }
    for (const potential of [input.resourcePotential, input.corePotential]) {
      let represented = false;
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        if (potential[cell] !== 0 && routeAtOrAdjacent(input, result.routeClass, cell)) {
          represented = true;
          break;
        }
      }
      expect(represented).toBe(true);
    }
    expect(result.invariants.requiredRouteAnchorsCovered).toBe(true);
    expect(result.invariants.mandatoryRouteAnchorsReachable).toBe(true);
    expect(result.invariants.gateApproachesSupported).toBe(true);
    expect(result.invariants.everyRouteComponentAnchorBearing).toBe(true);
    expect(result.invariants.fordsPresentAndValid).toBe(true);
    expect(result.invariants.sealedGateEndpointsClear).toBe(true);
  });

  it('gives a clear mandatory castle two distinct exterior major-route approaches', () => {
    const input = syntheticLivingWorldInput(12);
    const castle = input.castleSlot.findIndex(value => value !== 0);
    expect(castle).toBeGreaterThanOrEqual(0);
    input.waterRegime.fill(0);
    input.legacyProtectedCell.fill(0);
    input.resourcePotential.fill(0);
    input.corePotential.fill(0);
    input.throneAnchor.fill(0);
    input.barrier.fill(0);
    input.gateCell.fill(0);
    input.gateApproachCell.fill(0);

    const result = deriveGreaterRealmLivingWorld(input);
    const exteriorMajorRoutes: number[] = [];
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[castle * NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && (
          result.routeClass[neighbor] === GREATER_REALM_ROUTE_CLASS.ROAD
          || result.routeClass[neighbor] === GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY
        )
      ) exteriorMajorRoutes.push(neighbor);
    }
    expect(result.routeClass[castle]).toBe(GREATER_REALM_ROUTE_CLASS.NONE);
    expect(new Set(exteriorMajorRoutes).size).toBeGreaterThanOrEqual(2);
    expect(exteriorMajorRoutes.every(
      terminal => result.routeClass[terminal] === GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY,
    )).toBe(true);
    expect(result.metrics.unreachableMandatorySiteCount).toBe(0);
    expect(result.metrics.uncoveredRouteAnchorCount).toBe(0);
    expect(result.invariants.mandatoryRouteAnchorsReachable).toBe(true);
  });

  it('prefers an adjacent perimeter pair over cheaper disconnected alternatives', () => {
    const input = syntheticLivingWorldInput(12);
    const castle = input.castleSlot.findIndex(value => value !== 0);
    expect(castle).toBeGreaterThanOrEqual(0);
    input.waterRegime.fill(0);
    input.legacyProtectedCell.fill(0);
    input.resourcePotential.fill(0);
    input.corePotential.fill(0);
    input.throneAnchor.fill(0);
    input.gateCell.fill(0);
    input.gateApproachCell.fill(0);
    input.barrier.fill(1);
    input.barrier[castle] = 0;

    const firstEntry = input.grid.neighbors[castle * NEIGHBOR_COUNT]!;
    const connector = input.grid.neighbors[castle * NEIGHBOR_COUNT + 1]!;
    const secondEntry = input.grid.neighbors[castle * NEIGHBOR_COUNT + 2]!;
    const isolatedCheaperEntry = input.grid.neighbors[castle * NEIGHBOR_COUNT + 4]!;
    for (const entry of [
      firstEntry,
      connector,
      secondEntry,
      isolatedCheaperEntry,
    ]) {
      expect(entry).toBeGreaterThanOrEqual(0);
      input.barrier[entry] = 0;
      input.exposure[entry] = 0;
      input.distanceToFreshwater[entry] = 0;
    }
    input.slope[isolatedCheaperEntry] = 0;
    input.slope[firstEntry] = 100;
    input.slope[secondEntry] = 300;
    input.slope[connector] = 1_500;

    const result = deriveGreaterRealmLivingWorld(input);
    expect(result.routeClass[isolatedCheaperEntry])
      .toBe(GREATER_REALM_ROUTE_CLASS.NONE);
    for (const entry of [firstEntry, connector]) {
      expect(result.routeClass[entry]).toBe(GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY);
    }
    expect(result.routeClass[secondEntry]).toBe(GREATER_REALM_ROUTE_CLASS.NONE);
    expect(result.metrics.routeComponentCount).toBe(1);
    expect(result.metrics.unreachableMandatorySiteCount).toBe(0);
    expect(result.metrics.uncoveredRouteAnchorCount).toBe(0);
  });

  it('connects a non-adjacent fallback pair only through a short dry local road', () => {
    const input = syntheticLivingWorldInput(12);
    const castle = input.castleSlot.findIndex(value => value !== 0);
    expect(castle).toBeGreaterThanOrEqual(0);
    input.waterRegime.fill(0);
    input.legacyProtectedCell.fill(0);
    input.resourcePotential.fill(0);
    input.corePotential.fill(0);
    input.throneAnchor.fill(0);
    input.gateCell.fill(0);
    input.gateApproachCell.fill(0);
    input.barrier.fill(1);
    input.barrier[castle] = 0;

    const q = input.grid.q[castle]!;
    const r = input.grid.r[castle]!;
    const localPath = [
      { q: q + 1, r },
      { q: q + 2, r: r - 1 },
      { q: q + 2, r: r - 2 },
      { q: q + 1, r: r - 2 },
      { q, r: r - 2 },
      { q: q - 1, r: r - 1 },
      { q: q - 1, r },
    ].map(coordinate => input.grid.indexOf(coordinate));
    expect(localPath.every(cell => cell >= 0)).toBe(true);
    for (const pathCell of localPath) {
      input.barrier[pathCell] = 0;
      input.slope[pathCell] = 200;
      input.exposure[pathCell] = 0;
      input.distanceToFreshwater[pathCell] = 0;
    }

    const result = deriveGreaterRealmLivingWorld(input);
    expect(localPath.map(cell => result.routeClass[cell])).toEqual([
      GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY,
      GREATER_REALM_ROUTE_CLASS.ROAD,
      GREATER_REALM_ROUTE_CLASS.ROAD,
      GREATER_REALM_ROUTE_CLASS.ROAD,
      GREATER_REALM_ROUTE_CLASS.ROAD,
      GREATER_REALM_ROUTE_CLASS.ROAD,
      GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY,
    ]);
    for (const connectorCell of localPath.slice(1, -1)) {
      expect(result.routeClass[connectorCell]).toBe(GREATER_REALM_ROUTE_CLASS.ROAD);
      expect(input.waterRegime[connectorCell]).toBe(0);
      expect(input.barrier[connectorCell]).toBe(0);
    }
    expect(result.metrics.routeComponentCount).toBe(1);
    expect(result.metrics.requiredRouteAnchorCount).toBe(1);
    expect(result.metrics.coveredRouteAnchorCount).toBe(1);
    expect(result.metrics.unreachableMandatorySiteCount).toBe(0);
    expect(result.metrics.uncoveredRouteAnchorCount).toBe(0);
  });

  it('independently reports a mandatory castle or throne with no legal route neighbour', () => {
    const input = syntheticLivingWorldInput();
    const castle = input.castleSlot.findIndex(value => value !== 0);
    expect(castle).toBeGreaterThanOrEqual(0);
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[castle * NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0) input.barrier[neighbor] = 1;
    }
    const result = deriveGreaterRealmLivingWorld(input);
    expect(result.metrics.unreachableMandatorySiteCount).toBeGreaterThan(0);
    expect(result.invariants.mandatoryRouteAnchorsReachable).toBe(false);
  });

  it('routes an adjacent mandatory-site cluster through its legal perimeter', () => {
    const input = syntheticLivingWorldInput();
    const castle = input.castleSlot.findIndex(value => value !== 0);
    expect(castle).toBeGreaterThanOrEqual(0);
    const throne = input.grid.neighbors[castle * NEIGHBOR_COUNT]!;
    expect(throne).toBeGreaterThanOrEqual(0);
    input.throneAnchor[throne] = 1;

    // Seal every direct exit from the castle except the adjacent throne. The
    // castle has no legal neighbour by itself, while the combined two-cell
    // footprint still has a legal perimeter around the throne.
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[castle * NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && neighbor !== throne) input.barrier[neighbor] = 1;
    }

    const result = deriveGreaterRealmLivingWorld(input);
    expect(routeAtOrAdjacent(input, result.routeClass, castle)).toBe(false);
    expect(routeAtOrAdjacent(input, result.routeClass, throne)).toBe(true);
    expect(result.metrics.unreachableMandatorySiteCount).toBe(0);
    expect(result.metrics.uncoveredRouteAnchorCount).toBe(0);
    expect(result.invariants.requiredRouteAnchorsCovered).toBe(true);
    expect(result.invariants.mandatoryRouteAnchorsReachable).toBe(true);
  });

  it('bridges a mandatory site through an open reserved gate-approach component', () => {
    const input = syntheticLivingWorldInput();
    const castle = input.castleSlot.findIndex(value => value !== 0);
    expect(castle).toBeGreaterThanOrEqual(0);
    const approachCells: number[] = [];
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[castle * NEIGHBOR_COUNT + direction]!;
      expect(neighbor).toBeGreaterThanOrEqual(0);
      if (direction < 4) {
        input.gateApproachCell[neighbor] = 1;
        approachCells.push(neighbor);
      } else {
        input.barrier[neighbor] = 1;
      }
    }

    const result = deriveGreaterRealmLivingWorld(input);
    expect(routeAtOrAdjacent(input, result.routeClass, castle)).toBe(false);
    for (const approachCell of approachCells) {
      expect(result.routeClass[approachCell]).toBe(GREATER_REALM_ROUTE_CLASS.NONE);
    }
    expect(result.metrics.unreachableMandatorySiteCount).toBe(0);
    expect(result.metrics.uncoveredRouteAnchorCount).toBe(0);
    expect(result.metrics.unsupportedGateApproachComponentCount).toBe(0);
    expect(result.invariants.requiredRouteAnchorsCovered).toBe(true);
    expect(result.invariants.mandatoryRouteAnchorsReachable).toBe(true);
    expect(result.invariants.gateApproachesSupported).toBe(true);
    expect(result.invariants.sealedGateEndpointsClear).toBe(true);
  });

  it('forms coherent vegetation masses and removes isolated dressing speckles', () => {
    const input = syntheticLivingWorldInput();
    const result = deriveGreaterRealmLivingWorld(input);
    expect(result.metrics.vegetatedCellCount).toBeGreaterThan(input.grid.cellCount / 3);
    expect(result.metrics.vegetationPatchCount).toBeGreaterThan(0);
    expect(result.metrics.minimumVegetationPatchSize).toBeGreaterThanOrEqual(6);
    expect(result.metrics.isolatedVegetationCellCount).toBe(0);
    expect(result.metrics.smallVegetationPatchCellCount).toBe(0);
    expect(result.invariants.vegetationNaturallyClustered).toBe(true);

    let supportedVegetationCells = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (result.vegetationDensity[cell] === 0) continue;
      let vegetatedNeighbors = 0;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor >= 0 && result.vegetationDensity[neighbor] !== 0) vegetatedNeighbors += 1;
      }
      supportedVegetationCells += vegetatedNeighbors > 0 ? 1 : 0;
    }
    expect(supportedVegetationCells).toBe(result.metrics.vegetatedCellCount);
  });

  it('derives coherent groundcover and subordinate biome-compatible wildflowers', () => {
    const input = syntheticLivingWorldInput();
    const result = deriveGreaterRealmLivingWorld(input);
    expect(result.metrics.groundcoverCellCount).toBeGreaterThan(input.grid.cellCount / 4);
    expect(result.metrics.wildflowerCellCount).toBeGreaterThan(0);
    expect(result.metrics.groundcoverPatchCount).toBeGreaterThan(0);
    expect(result.metrics.minimumGroundcoverPatchSize).toBeGreaterThanOrEqual(6);
    expect(result.metrics.isolatedGroundcoverCellCount).toBe(0);
    expect(result.metrics.smallGroundcoverPatchCellCount).toBe(0);
    expect(result.metrics.wildflowerPatchCount).toBeGreaterThan(0);
    expect(result.metrics.minimumWildflowerPatchSize).toBeGreaterThanOrEqual(3);
    expect(result.metrics.isolatedWildflowerCellCount).toBe(0);
    expect(result.metrics.smallWildflowerPatchCellCount).toBe(0);
    expect(result.metrics.groundcoveredLandWildflowerBasisPoints)
      .toBeGreaterThanOrEqual(500);
    expect(result.metrics.groundcoveredLandWildflowerBasisPoints)
      .toBeLessThanOrEqual(1_500);
    expect(result.metrics.groundcoverPatchCount).toBeGreaterThan(1);
    expect(result.metrics.largestGroundcoverPatchBasisPoints).toBeGreaterThan(0);
    expect(result.metrics.largestGroundcoverPatchBasisPoints).toBeLessThanOrEqual(9_000);
    expect(result.metrics.groundcoverDistinctDensityValueCount).toBeGreaterThanOrEqual(8);
    expect(result.metrics.wildflowerPatchCount).toBeGreaterThan(1);
    expect(result.metrics.largestWildflowerPatchBasisPoints).toBeGreaterThan(0);
    expect(result.metrics.largestWildflowerPatchBasisPoints).toBeLessThanOrEqual(9_500);
    expect(result.metrics.wildflowerDistinctDensityValueCount).toBeGreaterThanOrEqual(4);

    let groundcoverDiffersFromVegetation = false;
    let groundcoverWithoutVegetation = 0;
    let vegetationGroundcoverIntersection = 0;
    let vegetationGroundcoverUnion = 0;
    const clearanceMasks = [
      input.legacyProtectedCell,
      input.castleSlot,
      input.throneAnchor,
      input.barrier,
      input.gateCell,
      input.gateApproachCell,
    ];
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const vegetation = result.vegetationDensity[cell]!;
      const groundcover = result.groundcoverDensity[cell]!;
      const wildflowers = result.wildflowerDensity[cell]!;
      if (groundcover !== vegetation) groundcoverDiffersFromVegetation = true;
      const hasVegetation = vegetation !== 0;
      const hasGroundcover = groundcover !== 0;
      if (hasVegetation || hasGroundcover) vegetationGroundcoverUnion += 1;
      if (hasVegetation && hasGroundcover) vegetationGroundcoverIntersection += 1;
      if (!hasVegetation && hasGroundcover) groundcoverWithoutVegetation += 1;
      expect(wildflowers).toBeLessThanOrEqual(groundcover);
      if (result.dressingExcluded[cell] !== 0) {
        expect(groundcover).toBe(0);
        expect(wildflowers).toBe(0);
      }
      if (
        landmarkAtOrAdjacent(input, result.landmarkClass, cell)
        || (
          result.dressingExcluded[cell] === 0
          && adjacentToAnyMask(input, cell, clearanceMasks)
        )
      ) {
        expect(groundcover).toBe(0);
        expect(wildflowers).toBe(0);
      }
      if (wildflowers !== 0) {
        expect([
          GREATER_REALM_ECOLOGY_CLASS.PLAINS,
          GREATER_REALM_ECOLOGY_CLASS.FOREST,
          GREATER_REALM_ECOLOGY_CLASS.TAIGA,
          GREATER_REALM_ECOLOGY_CLASS.SAVANNA,
          GREATER_REALM_ECOLOGY_CLASS.ALPINE,
        ]).toContain(result.ecologyClass[cell]);
      }
    }
    expect(groundcoverDiffersFromVegetation).toBe(true);
    expect(groundcoverWithoutVegetation).toBeGreaterThan(0);
    expect(groundcoverWithoutVegetation * 100)
      .toBeGreaterThanOrEqual(result.metrics.groundcoverCellCount);
    expect(result.metrics.groundcoverWithoutVegetationCellCount)
      .toBe(groundcoverWithoutVegetation);
    expect(result.metrics.vegetationGroundcoverJaccardBasisPoints).toBe(
      Math.round(vegetationGroundcoverIntersection * 10_000 / vegetationGroundcoverUnion),
    );
    expect(result.metrics.vegetationGroundcoverJaccardBasisPoints).toBeLessThanOrEqual(9_500);
    expect(result.metrics.groundcoverCompatibilityViolationCount).toBe(0);
    expect(result.metrics.wildflowerCompatibilityViolationCount).toBe(0);
    expect(result.metrics.wildflowerGroundcoverViolationCount).toBe(0);
    expect(result.metrics.groundcoverReservedClearanceViolationCount).toBe(0);
    expect(result.metrics.groundcoverLandmarkClearanceViolationCount).toBe(0);
    expect(result.invariants.groundcoverNaturallyClustered).toBe(true);
    expect(result.invariants.wildflowersNaturallyClustered).toBe(true);
    expect(result.invariants.groundcoverCompatible).toBe(true);
    expect(result.invariants.groundcoverIndependentFromWoodyVegetation).toBe(true);
    expect(result.invariants.wildflowersCompatibleWithGroundcover).toBe(true);
    expect(result.invariants.groundcoverClearancesPreserved).toBe(true);
  });

  it('reports empty groundcover topology with zero-valued patch shares', () => {
    const input = syntheticLivingWorldInput();
    input.slope.fill(1_800);
    const result = deriveGreaterRealmLivingWorld(input);
    expect(result.metrics.groundcoverCellCount).toBe(0);
    expect(result.metrics.groundcoverPatchCount).toBe(0);
    expect(result.metrics.largestGroundcoverPatchBasisPoints).toBe(0);
    expect(result.metrics.groundcoverDistinctDensityValueCount).toBe(0);
    expect(result.metrics.wildflowerCellCount).toBe(0);
    expect(result.metrics.wildflowerPatchCount).toBe(0);
    expect(result.metrics.largestWildflowerPatchBasisPoints).toBe(0);
    expect(result.metrics.wildflowerDistinctDensityValueCount).toBe(0);
  });

  it('separates open grassland density from canopy while retaining savanna cover', () => {
    const deriveAtComparableSite = (biome: number) => {
      const input = syntheticLivingWorldInput();
      const cell = input.grid.indexOf({ q: -8, r: 8 });
      expect(cell).toBeGreaterThanOrEqual(0);
      input.waterRegime[cell] = 0;
      input.biomeId[cell] = biome;
      input.landformId[cell] = GREATER_REALM_LANDFORM_ID.LOWLAND;
      input.temperature[cell] = 4_500;
      input.moisture[cell] = 2_200;
      input.wetnessIndex[cell] = 2_500;
      input.elevation[cell] = 4_000;
      input.slope[cell] = 250;
      input.exposure[cell] = 0;
      return { cell, result: deriveGreaterRealmLivingWorld(input) };
    };

    const meadow = deriveAtComparableSite(GREATER_REALM_BIOME_ID.FLOWER_MEADOW);
    const oldGrowth = deriveAtComparableSite(GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST);
    const savanna = deriveAtComparableSite(GREATER_REALM_BIOME_ID.SAVANNA);
    expect(meadow.result.groundcoverDensity[meadow.cell]).toBeGreaterThan(
      oldGrowth.result.groundcoverDensity[oldGrowth.cell]!,
    );
    expect(savanna.result.vegetationDensity[savanna.cell]).toBeLessThan(
      oldGrowth.result.vegetationDensity[oldGrowth.cell]!,
    );
    expect(savanna.result.groundcoverDensity[savanna.cell]).toBeGreaterThanOrEqual(64);

    const grassland = deriveGreaterRealmLivingWorld(syntheticLivingWorldInput());
    const grassWithoutCanopy = grassland.groundcoverDensity.findIndex(
      (density, cell) => density !== 0 && grassland.vegetationDensity[cell] === 0,
    );
    expect(grassWithoutCanopy).toBeGreaterThanOrEqual(0);
    expect([
      GREATER_REALM_ECOLOGY_CLASS.PLAINS,
      GREATER_REALM_ECOLOGY_CLASS.FOREST,
      GREATER_REALM_ECOLOGY_CLASS.TAIGA,
      GREATER_REALM_ECOLOGY_CLASS.JUNGLE,
      GREATER_REALM_ECOLOGY_CLASS.SWAMP,
      GREATER_REALM_ECOLOGY_CLASS.SAVANNA,
      GREATER_REALM_ECOLOGY_CLASS.ALPINE,
    ]).toContain(grassland.ecologyClass[grassWithoutCanopy]);
  });

  it('keeps harsh ecologies sparse and clears landmark and reservation buffers', () => {
    const input = syntheticLivingWorldInput();
    const volcanicCell = input.grid.indexOf({ q: -3, r: 10 });
    const ashCell = input.grid.indexOf({ q: -2, r: 10 });
    expect(volcanicCell).toBeGreaterThanOrEqual(0);
    expect(ashCell).toBeGreaterThanOrEqual(0);
    input.biomeId[volcanicCell] = GREATER_REALM_BIOME_ID.VOLCANIC_UPLAND;
    input.biomeId[ashCell] = GREATER_REALM_BIOME_ID.ASH_MEADOW;
    for (const cell of [volcanicCell, ashCell]) {
      input.waterRegime[cell] = 0;
      input.landformId[cell] = GREATER_REALM_LANDFORM_ID.LOWLAND;
      input.temperature[cell] = 5_000;
      input.moisture[cell] = 6_000;
      input.wetnessIndex[cell] = 5_000;
      input.slope[cell] = 100;
      input.exposure[cell] = 0;
    }
    const result = deriveGreaterRealmLivingWorld(input);
    const caps = [0, 158, 245, 220, 255, 210, 142, 46, 54, 26] as const;
    const clearanceMasks = [
      input.legacyProtectedCell,
      input.castleSlot,
      input.throneAnchor,
      input.barrier,
      input.gateCell,
      input.gateApproachCell,
    ];
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      expect(result.vegetationDensity[cell]).toBeLessThanOrEqual(
        caps[result.ecologyClass[cell]!]!,
      );
      if (landmarkAtOrAdjacent(input, result.landmarkClass, cell)) {
        expect(result.vegetationDensity[cell]).toBe(0);
      }
      if (
        result.dressingExcluded[cell] === 0
        && adjacentToAnyMask(input, cell, clearanceMasks)
      ) expect(result.vegetationDensity[cell]).toBe(0);
    }
    expect(result.vegetationDensity[volcanicCell]).toBeLessThanOrEqual(48);
    expect(result.vegetationDensity[ashCell]).toBeLessThanOrEqual(112);
    expect(result.metrics.eligibleLandVegetatedBasisPoints
      + result.metrics.eligibleLandOpenBasisPoints).toBe(10_000);
    expect(result.metrics.ecologicalCompatibilityViolationCount).toBe(0);
    expect(result.invariants.ecologiesCompatible).toBe(true);
    expect(result.metrics.vegetationReservedClearanceViolationCount).toBe(0);
    expect(result.metrics.vegetationLandmarkClearanceViolationCount).toBe(0);
    expect(result.invariants.vegetationClearancesPreserved).toBe(true);
  });

  it('spaces landmark compounds and keeps every anchor beside a route', () => {
    const input = syntheticLivingWorldInput();
    const result = deriveGreaterRealmLivingWorld(input);
    expect(result.metrics.landmarkCellCounts.abandonedRuin).toBeGreaterThan(0);
    expect(result.metrics.landmarkCellCounts.ruinedWall).toBeGreaterThanOrEqual(
      result.metrics.landmarkCellCounts.abandonedRuin * 2,
    );
    expect(result.metrics.landmarkCellCounts.waystone).toBeGreaterThan(0);
    expect(result.metrics.landmarkCellCounts.lampPost).toBeGreaterThan(0);

    const anchors: Array<Readonly<{ cell: number; kind: number }>> = [];
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const landmark = result.landmarkClass[cell]!;
      if (landmark === GREATER_REALM_LANDMARK_CLASS.RUINED_WALL) {
        let touchesRuin = false;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor >= 0 && result.landmarkClass[neighbor]
            === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN) touchesRuin = true;
        }
        expect(touchesRuin).toBe(true);
        continue;
      }
      if (landmark === GREATER_REALM_LANDMARK_CLASS.NONE) continue;
      if (landmark === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN) {
        let adjacentWalls = 0;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && result.landmarkClass[neighbor]
              === GREATER_REALM_LANDMARK_CLASS.RUINED_WALL
          ) adjacentWalls += 1;
        }
        expect(adjacentWalls).toBeGreaterThanOrEqual(2);
        expect(adjacentWalls).toBeLessThanOrEqual(3);
      }
      expect(routeAtOrAdjacent(input, result.routeClass, cell)).toBe(true);
      anchors.push({ cell, kind: landmark });
    }
    for (let first = 0; first < anchors.length; first += 1) {
      for (let second = first + 1; second < anchors.length; second += 1) {
        const a = anchors[first]!;
        const b = anchors[second]!;
        const distance = axialDistance(
          input.grid.q[a.cell]! - input.grid.q[b.cell]!,
          input.grid.r[a.cell]! - input.grid.r[b.cell]!,
        );
        const required = a.kind === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
          && b.kind === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
          ? 12
          : a.kind === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
            && b.kind === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
            ? 3
            : a.kind === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
              || b.kind === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
              ? 1
            : a.kind === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
              || b.kind === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
              ? 4
              : 6;
        expect(distance).toBeGreaterThanOrEqual(required);
      }
    }
    expect(result.metrics.landmarkSpacingViolationCount).toBe(0);
    expect(result.metrics.landmarkRouteAdjacencyViolationCount).toBe(0);
    expect(result.metrics.orphanedRuinWallCount).toBe(0);
    expect(result.metrics.ruinWallCardinalityViolationCount).toBe(0);
    expect(result.invariants.landmarksSpaced).toBe(true);
    expect(result.invariants.landmarksRouteAdjacent).toBe(true);
    expect(result.invariants.ruinWallsAnchored).toBe(true);
  });

  it('keeps ambient-life potentials compatible with habitat, routes, and sites', () => {
    const input = syntheticLivingWorldInput();
    const result = deriveGreaterRealmLivingWorld(input);
    const totalAmbient = Object.values(result.metrics.ambientLifeCellCounts)
      .reduce((total, count) => total + count, 0);
    expect(totalAmbient).toBeGreaterThan(0);
    expect(result.metrics.ambientLifeCellCounts.rabbitHabitat).toBeGreaterThan(0);
    expect(result.metrics.ambientLifeCellCounts.courierRoute
      + result.metrics.ambientLifeCellCounts.exoticCourierRoute).toBeGreaterThan(0);

    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const ambient = result.ambientLifeClass[cell]!;
      const ecology = result.ecologyClass[cell]!;
      if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.NONE) continue;
      expect(result.dressingExcluded[cell]).toBe(0);
      expect(result.landmarkClass[cell]).toBe(GREATER_REALM_LANDMARK_CLASS.NONE);
      if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.RABBIT_HABITAT) {
        expect(result.routeClass[cell]).toBe(GREATER_REALM_ROUTE_CLASS.NONE);
        expect([
          GREATER_REALM_ECOLOGY_CLASS.PLAINS,
          GREATER_REALM_ECOLOGY_CLASS.FOREST,
          GREATER_REALM_ECOLOGY_CLASS.TAIGA,
          GREATER_REALM_ECOLOGY_CLASS.SAVANNA,
        ]).toContain(ecology);
      } else if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.GUARD_POST) {
        expect(routeAtOrAdjacent(input, result.routeClass, cell)).toBe(true);
        expect(landmarkAtOrAdjacent(input, result.landmarkClass, cell)).toBe(true);
      } else if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE) {
        expect(result.routeClass[cell]).not.toBe(GREATER_REALM_ROUTE_CLASS.NONE);
        expect([
          GREATER_REALM_ECOLOGY_CLASS.JUNGLE,
          GREATER_REALM_ECOLOGY_CLASS.SAVANNA,
          GREATER_REALM_ECOLOGY_CLASS.DESERT,
        ]).toContain(ecology);
      } else {
        expect(routeAtOrAdjacent(input, result.routeClass, cell)).toBe(true);
      }
    }
    expect(result.metrics.ambientConstraintViolationCount).toBe(0);
    expect(result.metrics.rabbitDensityViolationCount).toBe(0);
    expect(result.metrics.courierDisconnectedRouteViolationCount).toBe(0);
    expect(result.invariants.ambientLifeCompatible).toBe(true);
    expect(result.invariants.rabbitHabitatVegetated).toBe(true);
    expect(result.invariants.couriersUseConnectedRoutes).toBe(true);
  });

  it('overwrites every exact living-world field when its private authority retires', () => {
    const result = deriveGreaterRealmLivingWorld(syntheticLivingWorldInput());
    expect(result.vegetationDensity.some(value => value !== 0)).toBe(true);
    expect(result.routeClass.some(value => value !== 0)).toBe(true);

    clearGreaterRealmLivingWorldAuthority(result);

    for (const field of [
      result.dressingExcluded,
      result.ecologyClass,
      result.vegetationDensity,
      result.groundcoverDensity,
      result.wildflowerDensity,
      result.routeClass,
      result.landmarkClass,
      result.ambientLifeClass,
    ]) expect(field.every(value => value === 0)).toBe(true);
  });

  it('runs the connected authority under budget on a 100k-cell synthetic atlas', () => {
    const input = syntheticLivingWorldInput(183);
    expect(input.grid.cellCount).toBeGreaterThan(100_000);
    expect(input.grid.cellCount).toBeLessThan(110_000);
    const startedAt = Date.now();
    const result = deriveGreaterRealmLivingWorld(input);
    const elapsedMs = Date.now() - startedAt;
    expect(result.metrics.cellCount).toBe(input.grid.cellCount);
    expect(Object.values(result.invariants).every(Boolean)).toBe(true);
    expect(elapsedMs).toBeLessThan(5_000);
  });
});
