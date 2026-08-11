import { GREATER_REALM_BIOME_ID, GREATER_REALM_LANDFORM_ID } from './greater-realm-biomes';
import {
  GREATER_REALM_WATER_DEPTH_CLASS_ID,
  GREATER_REALM_WATER_REGIME_ID,
} from './greater-realm-hydrology-authority';
import {
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
} from './greater-realm-legacy-lowlands';
import {
  GREATER_REALM_AMBIENT_LIFE_CLASS,
  GREATER_REALM_ECOLOGY_CLASS,
  GREATER_REALM_LANDMARK_CLASS,
  GREATER_REALM_ROUTE_CLASS,
} from './greater-realm-living-world';
import type { GreaterRealmRuntimeReleaseSource } from './greater-realm-runtime-release';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from './greater-realm-terrain';

export const GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT = 'a'.repeat(40);

export function greaterRealmRuntimeReleaseFixtureSeed(offset = 0): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (index + offset) & 0xff);
}

export const GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LOWLANDS_TILE_KEYS = Object.freeze(
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.world.tiles.map(tile => tile.key),
);

export const GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LEGACY_RESOURCE_COUNT = Object.values(
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.resources,
).reduce((sum, resource) => sum + resource.sites.length, 0);

export function createGreaterRealmRuntimeReleaseFixtureSource(options: Readonly<{
  fillUnusedOwnerSelectionChannel?: boolean;
}> = {}): GreaterRealmRuntimeReleaseSource {
  const coordinates: AxialCoordinate[] = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1
    .world.tiles.map(tile => ({ q: tile.q, r: tile.r }));
  const regionByCoordinate = new Map<string, number>();
  for (const coordinate of coordinates) regionByCoordinate.set(`${coordinate.q},${coordinate.r}`, 0);
  for (let region = 1; region < 6; region += 1) {
    const originQ = region * 1_000;
    const originR = region * -1_000;
    for (let q = 0; q < 30; q += 1) {
      for (let r = 0; r < 24; r += 1) {
        const coordinate = { q: originQ + q, r: originR + r };
        coordinates.push(coordinate);
        regionByCoordinate.set(`${coordinate.q},${coordinate.r}`, region);
      }
    }
  }
  // A disconnected Tier-I island proves that zero-slot components are kept.
  for (const coordinate of [
    // This four-cell island straddles both edges of an axial bin. Its center
    // gives the LOD tests a one-cell core with a larger explicit apron.
    { q: 50_009, r: -49_995 },
    { q: 50_010, r: -49_995 },
    { q: 50_010, r: -49_996 },
    { q: 50_009, r: -49_996 },
  ]) {
    coordinates.push(coordinate);
    regionByCoordinate.set(`${coordinate.q},${coordinate.r}`, 1);
  }
  // Hidden geometry is present in the verified source but must never cross
  // the Tier-I declassification boundary.
  for (let offset = 0; offset < 8; offset += 1) {
    const coordinate = { q: 20_000 + offset, r: -20_000 };
    coordinates.push(coordinate);
    regionByCoordinate.set(`${coordinate.q},${coordinate.r}`, 6);
  }
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const count = grid.cellCount;
  const legacyLowlandsCell = new Uint8Array(count);
  const legacyLowlandsCastleSlot = new Uint8Array(count);
  const elevation = new Int32Array(count);
  const regionId = new Uint8Array(count);
  const tierId = new Uint8Array(count);
  const waterRegime = new Uint8Array(count);
  const waterBodyId = new Uint32Array(count);
  const waterDepthClass = new Uint8Array(count);
  const waterSurfaceLevel = new Int32Array(count).fill(-0x8000_0000);
  const waterDownstream = new Int32Array(count).fill(-1);
  const flowAccumulation = new BigUint64Array(count).fill(1n);
  const waterBankSeed = new Uint32Array(count).fill(0xdead_beef);
  const waterGenerationVersion = new Uint16Array(count).fill(1);
  const biomeId = new Uint8Array(count).fill(GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND);
  const landformId = new Uint8Array(count).fill(GREATER_REALM_LANDFORM_ID.LOWLAND);
  const slope = new Uint16Array(count).fill(600);
  const aspect = new Uint8Array(count).fill(6);
  const profileCurvature = new Int32Array(count).fill(17);
  const planCurvature = new Int32Array(count).fill(-19);
  const ridgeId = new Int32Array(count).fill(-1);
  const geologicalBarrierBand = new Uint8Array(count);
  const wetnessIndex = new Uint16Array(count).fill(1_000);
  const exposure = new Int32Array(count).fill(250);
  const distanceToCoast = new Uint16Array(count).fill(200);
  const distanceToFreshwater = new Uint16Array(count).fill(40);
  const temperature = new Int32Array(count).fill(4_000);
  const moisture = new Int32Array(count).fill(5_000);
  const barrier = new Uint8Array(count);
  const castleSlot = new Uint8Array(count);
  const resourcePotential = new Uint8Array(count);
  const corePotential = new Uint8Array(count);
  if (options.fillUnusedOwnerSelectionChannel === true) corePotential.fill(1);
  const ecologyClass = new Uint8Array(count).fill(GREATER_REALM_ECOLOGY_CLASS.PLAINS);
  const vegetationDensity = new Uint8Array(count).fill(128);
  const groundcoverDensity = new Uint8Array(count).fill(96);
  const wildflowerDensity = new Uint8Array(count).fill(32);
  const routeClass = new Uint8Array(count).fill(GREATER_REALM_ROUTE_CLASS.TRACK);
  const landmarkClass = new Uint8Array(count).fill(GREATER_REALM_LANDMARK_CLASS.NONE);
  const ambientLifeClass = new Uint8Array(count)
    .fill(GREATER_REALM_AMBIENT_LIFE_CLASS.RABBIT_HABITAT);

  const canonicalKeys = new Set(GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LOWLANDS_TILE_KEYS);
  const legacySlotByKey = new Map(
    GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.castleSlots.rows
      .map(slot => [slot.tileKey, slot.slotId] as const),
  );
  const regionCells: number[][] = Array.from({ length: 7 }, () => []);
  for (let cell = 0; cell < count; cell += 1) {
    const key = `${grid.q[cell]},${grid.r[cell]}`;
    const region = regionByCoordinate.get(key);
    if (region === undefined) throw new Error('GREATER_REALM_RUNTIME_RELEASE_TEST_REGION_MISSING');
    regionId[cell] = region;
    tierId[cell] = region < 6 ? 1 : 2;
    regionCells[region]!.push(cell);
    if (canonicalKeys.has(key)) legacyLowlandsCell[cell] = 1;
    if (legacySlotByKey.has(key)) {
      legacyLowlandsCastleSlot[cell] = 1;
      castleSlot[cell] = 1;
    }
  }
  for (let region = 1; region < 6; region += 1) {
    for (const cell of regionCells[region]!.slice(0, 100)) castleSlot[cell] = 1;
  }
  for (let region = 0; region < 6; region += 1) {
    let selected = 0;
    for (const cell of regionCells[region]!) {
      if (castleSlot[cell] === 1) continue;
      resourcePotential[cell] = 1;
      selected += 1;
      if (selected === 560) break;
    }
    if (selected !== 560) throw new Error('GREATER_REALM_RUNTIME_RELEASE_TEST_MARGIN_MISSING');
  }
  const wetCells = regionCells[1]!.filter(cell => (
    castleSlot[cell] === 0 && resourcePotential[cell] === 0
  )).slice(0, 3);
  for (const cell of wetCells.slice(0, 2)) {
    waterRegime[cell] = GREATER_REALM_WATER_REGIME_ID.LAKE;
    waterBodyId[cell] = 777;
    waterDepthClass[cell] = GREATER_REALM_WATER_DEPTH_CLASS_ID.SHALLOW;
    waterSurfaceLevel[cell] = 120;
    biomeId[cell] = GREATER_REALM_BIOME_ID.LAKE;
    landformId[cell] = GREATER_REALM_LANDFORM_ID.LAKE_BASIN;
  }
  const fordCell = wetCells[2]!;
  waterRegime[fordCell] = GREATER_REALM_WATER_REGIME_ID.RIVER;
  waterBodyId[fordCell] = 888;
  waterDepthClass[fordCell] = GREATER_REALM_WATER_DEPTH_CLASS_ID.SHALLOW;
  waterSurfaceLevel[fordCell] = 110;
  routeClass[fordCell] = GREATER_REALM_ROUTE_CLASS.FORD;
  for (const cell of regionCells[1]!.slice(100, 200)) ridgeId[cell] = 42;
  return Object.freeze({
    grid,
    legacyLowlandsTransform: Object.freeze({ rotationSteps: 0, globalOffsetQ: 0, globalOffsetR: 0 }),
    legacyLowlandsCell,
    legacyLowlandsCastleSlot,
    elevation,
    regionId,
    tierId,
    waterRegime,
    waterBodyId,
    waterDepthClass,
    waterSurfaceLevel,
    waterDownstream,
    flowAccumulation,
    waterBankSeed,
    waterGenerationVersion,
    biomeId,
    landformId,
    slope,
    aspect,
    profileCurvature,
    planCurvature,
    ridgeId,
    geologicalBarrierBand,
    wetnessIndex,
    exposure,
    distanceToCoast,
    distanceToFreshwater,
    temperature,
    moisture,
    barrier,
    castleSlot,
    resourcePotential,
    corePotential,
    ecologyClass,
    vegetationDensity,
    groundcoverDensity,
    wildflowerDensity,
    routeClass,
    landmarkClass,
    ambientLifeClass,
  });
}
