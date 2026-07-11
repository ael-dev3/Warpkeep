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
  playableRadius = 4,
  renderRadius = 5
): RealmTerrainSurface {
  const safePlayableRadius = Math.max(0, Math.trunc(playableRadius));
  const safeRenderRadius = Math.max(safePlayableRadius, Math.trunc(renderRadius));
  const playableMap = generateRealmTerrainMap(seed, safePlayableRadius);
  const renderMap = generateRealmTerrainMap(seed, safeRenderRadius);
  const playableKeys = new Set(playableMap.cells.map((cell) => hexKey(cell.coord)));
  const apronCells = renderMap.cells.filter((cell) => !playableKeys.has(hexKey(cell.coord)));
  return { playableMap, renderMap, apronCells, playableKeys };
}
export function isPlayableRealmCoord(surface: RealmTerrainSurface, coord: HexCoord) {
  return surface.playableKeys.has(hexKey(coord));
}

export function isApronCoord(coord: HexCoord, playableRadius = 4) {
  return hexDistance({ q: 0, r: 0 }, coord) > playableRadius;
}
