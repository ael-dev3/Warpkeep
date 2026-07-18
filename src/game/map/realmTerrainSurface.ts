import {
  createTerrainCellForCoord,
  generateRealmTerrainMap
} from './generateTerrainMap';
import { hexDistance, hexKey, type HexCoord } from './hexCoordinates';
import { hashSeedString } from './realmSeed';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

export type RealmTerrainSurface = Readonly<{
  playableMap: RealmTerrainMap;
  renderMap: RealmTerrainMap;
  apronCells: readonly TerrainCell[];
  playableKeys: ReadonlySet<string>;
}>;

export type AuthoritativeRealmTerrainCell = Readonly<{
  q: number;
  r: number;
  terrainSeed?: number;
}>;

function normalizedSeed(seed: string | number) {
  return typeof seed === 'string' ? hashSeedString(seed) : seed >>> 0;
}

function validatedSurfaceRadii(playableRadius: number, renderRadius: number) {
  if (
    !Number.isSafeInteger(playableRadius)
    || !Number.isSafeInteger(renderRadius)
    || playableRadius < 0
    || renderRadius < playableRadius
  ) throw new RangeError('REALM_TERRAIN_SURFACE_RADIUS_INVALID');
  return { playableRadius, renderRadius };
}

export function createRealmTerrainSurface(
  seed: string | number,
  playableRadius: number,
  renderRadius: number
): RealmTerrainSurface {
  const {
    playableRadius: safePlayableRadius,
    renderRadius: safeRenderRadius
  } = validatedSurfaceRadii(playableRadius, renderRadius);
  const playableMap = generateRealmTerrainMap(seed, safePlayableRadius);
  const renderMap = generateRealmTerrainMap(seed, safeRenderRadius);
  const playableKeys = new Set(playableMap.cells.map((cell) => hexKey(cell.coord)));
  const apronCells = renderMap.cells.filter((cell) => !playableKeys.has(hexKey(cell.coord)));
  return { playableMap, renderMap, apronCells, playableKeys };
}

/**
 * Build the rendered terrain from an exact server-owned playable key set.
 * Genesis 001 no longer has to pretend that every coordinate in its maximum
 * ring is authoritative: a partial perimeter remains exact, while the full
 * render radius supplies a continuous non-interactive visual apron.
 */
export function createAuthoritativeRealmTerrainSurface(
  seed: string | number,
  authoritativeCells: readonly AuthoritativeRealmTerrainCell[],
  authoritativeRadius: number,
  renderRadius: number
): RealmTerrainSurface {
  const radii = validatedSurfaceRadii(authoritativeRadius, renderRadius);
  const worldSeed = normalizedSeed(seed);
  const playableKeys = new Set<string>();

  for (const row of authoritativeCells) {
    if (
      !Number.isSafeInteger(row.q)
      || !Number.isSafeInteger(row.r)
      || hexDistance({ q: 0, r: 0 }, row) > radii.playableRadius
    ) throw new RangeError('REALM_TERRAIN_AUTHORITY_INVALID');
    const key = hexKey(row);
    if (playableKeys.has(key)) throw new RangeError('REALM_TERRAIN_AUTHORITY_INVALID');
    const expected = createTerrainCellForCoord(worldSeed, row);
    if (row.terrainSeed !== undefined && row.terrainSeed !== expected.seed) {
      throw new RangeError('REALM_TERRAIN_AUTHORITY_INVALID');
    }
    playableKeys.add(key);
  }

  const renderMap = generateRealmTerrainMap(worldSeed, radii.renderRadius);
  const playableCells = renderMap.cells.filter((cell) => playableKeys.has(hexKey(cell.coord)));
  if (playableCells.length !== authoritativeCells.length) {
    throw new RangeError('REALM_TERRAIN_AUTHORITY_INVALID');
  }
  const playableMap: RealmTerrainMap = {
    version: 1,
    worldSeed,
    radius: radii.playableRadius,
    cells: playableCells
  };
  const apronCells = renderMap.cells.filter((cell) => !playableKeys.has(hexKey(cell.coord)));
  return { playableMap, renderMap, apronCells, playableKeys };
}
export function isPlayableRealmCoord(surface: RealmTerrainSurface, coord: HexCoord) {
  return surface.playableKeys.has(hexKey(coord));
}

export function isApronCoord(coord: HexCoord, playableRadius: number) {
  return hexDistance({ q: 0, r: 0 }, coord) > playableRadius;
}
