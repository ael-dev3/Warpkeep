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
        || input.waterRegime[cell] === 2 || input.waterRegime[cell] === 5) {
        expect(outputAt(result, cell)).toEqual([0, 0, 0, 0, 0]);
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
    expect(result.metrics.legacyPreservationViolationCount).toBe(0);
    expect(result.metrics.waterExclusionViolationCount).toBe(0);
    expect(result.metrics.reservedSiteExclusionViolationCount).toBe(0);
    expect(result.invariants.legacyProtectedCellsPreserved).toBe(true);
    expect(result.invariants.waterExcluded).toBe(true);
    expect(result.invariants.reservedSitesExcluded).toBe(true);
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
        elevation: 4_000, expected: GREATER_REALM_ECOLOGY_CLASS.FOREST },
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

  it('routes an adjacent mandatory-site cluster through one legal perimeter terminal', () => {
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
