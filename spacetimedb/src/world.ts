/** Canonical gameplay disc; the renderer's 30-cell apron is not persisted. */
export const LOWLANDS_RADIUS = 4;
export const LOWLANDS_BIOME = 'temperate-lowland';
export const HEGEMONY_GENESIS_001 = 'HEGEMONY_GENESIS_001';

export type CanonicalWorldTile = Readonly<{
  key: string;
  q: number;
  r: number;
  biome: string;
  terrainSeed: number;
}>;

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** FNV-1a, preserved from the existing browser Lowlands seed contract. */
export function hashSeedString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mixUint32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function signedIntegerBits(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;
}

export function deriveChannelSeed(
  worldSeed: number,
  q: number,
  r: number,
  channel: string,
): number {
  let seed = mixUint32(worldSeed);
  seed = mixUint32(seed ^ Math.imul(signedIntegerBits(q), 0x9e3779b1));
  seed = mixUint32(seed ^ Math.imul(signedIntegerBits(r), 0x85ebca77));
  seed = mixUint32(seed ^ hashSeedString(channel));
  return mixUint32(seed);
}

export const HEGEMONY_WORLD_SEED = hashSeedString(HEGEMONY_GENESIS_001);

function compareSpawnOrder(
  left: Pick<CanonicalWorldTile, 'q' | 'r'>,
  right: Pick<CanonicalWorldTile, 'q' | 'r'>,
): number {
  const leftCenter = left.q === 0 && left.r === 0;
  const rightCenter = right.q === 0 && right.r === 0;
  if (leftCenter !== rightCenter) return leftCenter ? -1 : 1;
  return left.q - right.q || left.r - right.r;
}

function makeCanonicalWorldTiles(): readonly CanonicalWorldTile[] {
  const tiles: CanonicalWorldTile[] = [];

  for (let q = -LOWLANDS_RADIUS; q <= LOWLANDS_RADIUS; q += 1) {
    const minR = Math.max(-LOWLANDS_RADIUS, -q - LOWLANDS_RADIUS);
    const maxR = Math.min(LOWLANDS_RADIUS, -q + LOWLANDS_RADIUS);
    for (let r = minR; r <= maxR; r += 1) {
      tiles.push({
        key: hexKey(q, r),
        q,
        r,
        biome: LOWLANDS_BIOME,
        terrainSeed: deriveChannelSeed(HEGEMONY_WORLD_SEED, q, r, 'cell'),
      });
    }
  }

  return Object.freeze([...tiles].sort(compareSpawnOrder));
}

export const CANONICAL_WORLD_TILES = makeCanonicalWorldTiles();

const CANONICAL_TILE_BY_KEY = new Map(
  CANONICAL_WORLD_TILES.map(tile => [tile.key, tile] as const),
);

export function canonicalTileForKey(key: string): CanonicalWorldTile | undefined {
  return CANONICAL_TILE_BY_KEY.get(key);
}

export function matchesCanonicalTerrain(row: {
  key: string;
  q: number;
  r: number;
  biome: string;
  terrainSeed: number;
}): boolean {
  const expected = canonicalTileForKey(row.key);
  return (
    expected !== undefined &&
    expected.q === row.q &&
    expected.r === row.r &&
    expected.biome === row.biome &&
    expected.terrainSeed === row.terrainSeed
  );
}
