const RADIUS = 4;
const BIOME = 'temperate-lowland';

function hashSeedString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixUint32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function deriveCellSeed(worldSeed: number, q: number, r: number): number {
  let seed = mixUint32(worldSeed);
  seed = mixUint32(seed ^ Math.imul(q >>> 0, 0x9e3779b1));
  seed = mixUint32(seed ^ Math.imul(r >>> 0, 0x85ebca77));
  seed = mixUint32(seed ^ hashSeedString('cell'));
  return mixUint32(seed);
}

const worldSeed = hashSeedString('HEGEMONY_GENESIS_001');

export const FIXTURE_WORLD_TILES = Object.freeze((() => {
  const rows: Array<Readonly<{
    key: string;
    q: number;
    r: number;
    biome: string;
    terrainSeed: number;
  }>> = [];
  for (let q = -RADIUS; q <= RADIUS; q += 1) {
    const minR = Math.max(-RADIUS, -q - RADIUS);
    const maxR = Math.min(RADIUS, -q + RADIUS);
    for (let r = minR; r <= maxR; r += 1) {
      rows.push({
        key: `${q},${r}`,
        q,
        r,
        biome: BIOME,
        terrainSeed: deriveCellSeed(worldSeed, q, r),
      });
    }
  }
  return rows;
})());
