import { generateRealmTerrainMap } from './generateTerrainMap';
import { hexDistance, hexKey, type HexCoord } from './hexCoordinates';
import type { RealmTerrainMap, TerrainCell } from './terrainTypes';

export type RealmTerrainSurface = Readonly<{
  playableMap: RealmTerrainMap;
  renderMap: RealmTerrainMap;
  apronCells: readonly TerrainCell[];
  playableKeys: ReadonlySet<string>;
}>;

export function createRealmTerrainSurface(
  seed: string | number,
  playableRadius: number,
  renderRadius: number
): RealmTerrainSurface {
  if (
    !Number.isSafeInteger(playableRadius)
    || !Number.isSafeInteger(renderRadius)
    || playableRadius < 0
    || renderRadius < playableRadius
  ) throw new RangeError('REALM_TERRAIN_SURFACE_RADIUS_INVALID');
  const safePlayableRadius = playableRadius;
  const safeRenderRadius = renderRadius;
  const playableMap = generateRealmTerrainMap(seed, safePlayableRadius);
  const renderMap = generateRealmTerrainMap(seed, safeRenderRadius);
  const playableKeys = new Set(playableMap.cells.map((cell) => hexKey(cell.coord)));
  const apronCells = renderMap.cells.filter((cell) => !playableKeys.has(hexKey(cell.coord)));
  return { playableMap, renderMap, apronCells, playableKeys };
}
export function isPlayableRealmCoord(surface: RealmTerrainSurface, coord: HexCoord) {
  return surface.playableKeys.has(hexKey(coord));
}

export function isApronCoord(coord: HexCoord, playableRadius: number) {
  return hexDistance({ q: 0, r: 0 }, coord) > playableRadius;
}
