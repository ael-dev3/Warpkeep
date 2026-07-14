import { hexDisc, hexKey, type HexCoord } from './hexCoordinates';
import {
  deriveChannelSeed,
  hashSeedString,
  seededSignedFloat
} from './realmSeed';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

export const DEFAULT_REALM_RADIUS = 2;
const TERRAIN_CELL_INDEX = new WeakMap<RealmTerrainMap, ReadonlyMap<string, TerrainCell>>();

function normalizedSeed(seed: string | number): number {
  return typeof seed === 'string' ? hashSeedString(seed) : seed >>> 0;
}

function boundedSigned(seed: number): number {
  return Math.max(-1, Math.min(1, seededSignedFloat(seed)));
}

export function createTerrainCellForCoord(worldSeed: number, coord: HexCoord): TerrainCell {
  const cellSeed = deriveChannelSeed(worldSeed, coord.q, coord.r, 'cell');
  return {
    coord,
    biome: 'temperate-lowland',
    seed: cellSeed,
    elevationBias: boundedSigned(deriveChannelSeed(worldSeed, coord.q, coord.r, 'elevation')),
    moisture: boundedSigned(deriveChannelSeed(worldSeed, coord.q, coord.r, 'moisture')),
    soilBias: boundedSigned(deriveChannelSeed(worldSeed, coord.q, coord.r, 'soil')),
    rockBias: boundedSigned(deriveChannelSeed(worldSeed, coord.q, coord.r, 'rock')),
    dryGrassBias: boundedSigned(deriveChannelSeed(worldSeed, coord.q, coord.r, 'dry-grass'))
  };
}

/**
 * Deterministically create a stable axial disc. The order is q-major, then r,
 * and is part of the serialized map contract.
 */
export function generateRealmTerrainMap(seed: string | number, radius = DEFAULT_REALM_RADIUS): RealmTerrainMap {
  const worldSeed = normalizedSeed(seed);
  const safeRadius = Math.max(0, Math.trunc(Number.isFinite(radius) ? radius : DEFAULT_REALM_RADIUS));
  const cells = hexDisc({ q: 0, r: 0 }, safeRadius)
    .map((coord) => createTerrainCellForCoord(worldSeed, coord));

  return {
    version: 1,
    worldSeed,
    radius: safeRadius,
    cells
  };
}

export function terrainCellByCoord(map: RealmTerrainMap, coord: HexCoord): TerrainCell | null {
  let index = TERRAIN_CELL_INDEX.get(map);
  if (!index) {
    index = new Map(map.cells.map((cell) => [hexKey(cell.coord), cell] as const));
    TERRAIN_CELL_INDEX.set(map, index);
  }
  return index.get(hexKey(coord)) ?? null;
}
