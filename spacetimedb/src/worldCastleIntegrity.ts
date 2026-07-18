import {
  CANONICAL_WORLD_TILES,
  GENESIS_GENERATION_V2_WORLD_TILES,
  matchesCanonicalTerrain,
} from './world';

const GENERATION_V2_TILE_KEYS = new Set(
  GENESIS_GENERATION_V2_WORLD_TILES.map(tile => tile.key),
);

type WorldTileLink = Readonly<{
  key: string;
  q: number;
  r: number;
  biome: string;
  terrainSeed: number;
  occupantCastleId?: bigint;
}>;

type CastleLink = Readonly<{
  castleId: bigint;
  tileKey: string;
  q: number;
  r: number;
}>;

/**
 * Bounded bidirectional integrity check for the fixed Genesis 001 world.
 * A castle and its occupied tile must name each other and share coordinates;
 * canonical terrain must not be missing, duplicated, or replaced.
 */
export function worldCastleGraphIsConsistent(
  worldTiles: Iterable<WorldTileLink>,
  castles: Iterable<CastleLink>,
): boolean {
  const tilesByKey = new Map<string, WorldTileLink>();
  for (const tile of worldTiles) {
    if (tilesByKey.has(tile.key) || !matchesCanonicalTerrain(tile)) return false;
    tilesByKey.set(tile.key, tile);
  }
  const completeGenerationV2 = tilesByKey.size === GENESIS_GENERATION_V2_WORLD_TILES.length
    && [...tilesByKey.keys()].every(key => GENERATION_V2_TILE_KEYS.has(key));
  const completeGenerationV3 = tilesByKey.size === CANONICAL_WORLD_TILES.length;
  if (!completeGenerationV2 && !completeGenerationV3) return false;

  const castlesById = new Map<bigint, CastleLink>();
  for (const castle of castles) {
    if (castlesById.has(castle.castleId)) return false;
    castlesById.set(castle.castleId, castle);
    const tile = tilesByKey.get(castle.tileKey);
    if (
      tile === undefined
      || tile.q !== castle.q
      || tile.r !== castle.r
      || tile.occupantCastleId !== castle.castleId
    ) return false;
  }

  for (const tile of tilesByKey.values()) {
    if (tile.occupantCastleId === undefined) continue;
    const castle = castlesById.get(tile.occupantCastleId);
    if (
      castle === undefined
      || castle.tileKey !== tile.key
      || castle.q !== tile.q
      || castle.r !== tile.r
    ) return false;
  }
  return true;
}
