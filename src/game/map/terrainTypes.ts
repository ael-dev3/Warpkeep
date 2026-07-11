import type { HexCoord } from './hexCoordinates';

export type TerrainBiome = 'temperate-lowland';

/** Serializable, renderer-free terrain information for one logical gameplay cell. */
export type TerrainCell = Readonly<{
  coord: HexCoord;
  biome: TerrainBiome;
  seed: number;
  elevationBias: number;
  moisture: number;
  soilBias: number;
  rockBias: number;
  dryGrassBias: number;
}>;

/** Serializable deterministic terrain map that can later move to server state. */
export type RealmTerrainMap = Readonly<{
  version: 1;
  worldSeed: number;
  radius: number;
  cells: readonly TerrainCell[];
}>;
