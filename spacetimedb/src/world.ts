/** The original deployed disc is an immutable compatibility boundary. */
export const LEGACY_LOWLANDS_RADIUS = 4;
/** Genesis 001 generation-v2 authoritative gameplay radius. */
export const LOWLANDS_RADIUS = 20;
export const GENESIS_RENDER_RADIUS = 22;
export const GENESIS_PLAYER_CAPACITY = 100;
export const GENESIS_CASTLE_SLOT_COUNT = 100;
export const GENESIS_BLOCKER_COUNT = 160;
export const GENESIS_RESOURCE_SITE_COUNT = 250;
export const GENESIS_CORE_SITE_COUNT = 175;
export const GENESIS_EMPTY_SITE_COUNT = 400;
export const HEGEMONY_WORLD_GENERATION_VERSION = 2;
export const LOWLANDS_BIOME = 'temperate-lowland';
export const HEGEMONY_GENESIS_001 = 'HEGEMONY_GENESIS_001';
export const HEGEMONY_REALM_ID = 'GENESIS_001';

export type GenesisTerrainKind =
  | 'lowland'
  | 'meadow'
  | 'forest'
  | 'heath'
  | 'ridge'
  | 'lake'
  | 'ancient-stone';

export type GenesisStaticContentKind =
  | 'empty'
  | 'castle-slot'
  | 'resource-capable'
  | 'core-capable'
  | 'scenic-blocker'
  | 'reserve';

export type CanonicalWorldTile = Readonly<{
  key: string;
  q: number;
  r: number;
  biome: string;
  terrainSeed: number;
}>;

export type CanonicalWorldTileMeta = Readonly<{
  tileKey: string;
  realmId: string;
  s: number;
  ring: number;
  sector: number;
  terrainKind: GenesisTerrainKind;
  passable: boolean;
  movementCost: number;
  staticContentKind: GenesisStaticContentKind;
  generationVersion: number;
}>;

export type CanonicalCastleSlot = Readonly<{
  slotId: number;
  realmId: string;
  tileKey: string;
  q: number;
  r: number;
  generationVersion: number;
}>;

export type CanonicalRealm = Readonly<{
  realmId: string;
  publicName: string;
  seedName: string;
  numericSeed: number;
  generationVersion: number;
  authoritativeRadius: number;
  renderRadius: number;
  playerCapacity: number;
  active: boolean;
}>;

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexDistance(
  first: Readonly<{ q: number; r: number }>,
  second: Readonly<{ q: number; r: number }> = { q: 0, r: 0 },
): number {
  const q = first.q - second.q;
  const r = first.r - second.r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

const HEX_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

export function neighboringHexes(coord: Readonly<{ q: number; r: number }>) {
  return HEX_DIRECTIONS.map(direction => ({
    q: coord.q + direction.q,
    r: coord.r + direction.r,
  }));
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

export const CANONICAL_REALM = Object.freeze<CanonicalRealm>({
  realmId: HEGEMONY_REALM_ID,
  publicName: 'The Hegemony · Genesis 001',
  seedName: HEGEMONY_GENESIS_001,
  numericSeed: HEGEMONY_WORLD_SEED,
  generationVersion: HEGEMONY_WORLD_GENERATION_VERSION,
  authoritativeRadius: LOWLANDS_RADIUS,
  renderRadius: GENESIS_RENDER_RADIUS,
  playerCapacity: GENESIS_PLAYER_CAPACITY,
  active: true,
});

function compareSpawnOrder(
  left: Pick<CanonicalWorldTile, 'q' | 'r'>,
  right: Pick<CanonicalWorldTile, 'q' | 'r'>,
): number {
  return hexDistance(left) - hexDistance(right) || left.q - right.q || left.r - right.r;
}

function makeCanonicalWorldTiles(): readonly CanonicalWorldTile[] {
  const tiles: CanonicalWorldTile[] = [];

  for (let q = -LOWLANDS_RADIUS; q <= LOWLANDS_RADIUS; q += 1) {
    const minR = Math.max(-LOWLANDS_RADIUS, -q - LOWLANDS_RADIUS);
    const maxR = Math.min(LOWLANDS_RADIUS, -q + LOWLANDS_RADIUS);
    for (let r = minR; r <= maxR; r += 1) {
      tiles.push(Object.freeze({
        key: hexKey(q, r),
        q,
        r,
        biome: LOWLANDS_BIOME,
        terrainSeed: deriveChannelSeed(HEGEMONY_WORLD_SEED, q, r, 'cell'),
      }));
    }
  }

  return Object.freeze([...tiles].sort(compareSpawnOrder));
}

export const CANONICAL_WORLD_TILES = makeCanonicalWorldTiles();
export const LEGACY_CANONICAL_WORLD_TILES = Object.freeze(
  CANONICAL_WORLD_TILES.filter(tile => hexDistance(tile) <= LEGACY_LOWLANDS_RADIUS),
);

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

function sectorForCoord(q: number, r: number): number {
  if (q === 0 && r === 0) return 0;
  const s = -q - r;
  // Exact integer half-open wedges, beginning at the six axial rays. Avoid
  // floating-point angle boundaries in persisted authoritative metadata.
  if (q > 0 && r >= 0) return 1;
  if (r > 0 && q <= 0 && s < 0) return 2;
  if (q < 0 && r > 0 && s >= 0) return 3;
  if (q < 0 && r <= 0) return 4;
  if (r < 0 && q >= 0 && s > 0) return 5;
  return 6;
}

function rankedTiles(
  tiles: readonly CanonicalWorldTile[],
  channel: string,
): CanonicalWorldTile[] {
  return [...tiles].sort((left, right) => (
    deriveChannelSeed(HEGEMONY_WORLD_SEED, left.q, left.r, channel)
      - deriveChannelSeed(HEGEMONY_WORLD_SEED, right.q, right.r, channel)
    || compareSpawnOrder(left, right)
  ));
}

/**
 * Rings divisible by five and all six radial axes stay open. Together they
 * form redundant spokes and circumferential routes before scenic blockers are
 * selected, avoiding a generated single-corridor world.
 */
function protectedTravelCorridor(tile: CanonicalWorldTile): boolean {
  const ring = hexDistance(tile);
  const s = -tile.q - tile.r;
  return ring <= LEGACY_LOWLANDS_RADIUS
    || ring % 5 === 0
    || tile.q === 0
    || tile.r === 0
    || s === 0;
}

const BLOCKED_TILE_KEYS = new Set(
  rankedTiles(
    CANONICAL_WORLD_TILES.filter(tile => !protectedTravelCorridor(tile)),
    'genesis-v2-scenic-blocker',
  ).slice(0, GENESIS_BLOCKER_COUNT).map(tile => tile.key),
);

function passableNeighborCount(tile: CanonicalWorldTile): number {
  return neighboringHexes(tile).filter(coord => {
    const neighbor = CANONICAL_TILE_BY_KEY.get(hexKey(coord.q, coord.r));
    return neighbor !== undefined && !BLOCKED_TILE_KEYS.has(neighbor.key);
  }).length;
}

const FOUNDING_DISTRICT_COORDS = Object.freeze([
  Object.freeze({ q: 0, r: 0 }),
  Object.freeze({ q: 2, r: -1 }),
  Object.freeze({ q: -1, r: 2 }),
]);

function makeCanonicalCastleSlots(): readonly CanonicalCastleSlot[] {
  const selected = FOUNDING_DISTRICT_COORDS.map(coord => {
    const tile = CANONICAL_TILE_BY_KEY.get(hexKey(coord.q, coord.r));
    if (tile === undefined || BLOCKED_TILE_KEYS.has(tile.key)) {
      throw new Error('GENESIS_FOUNDING_SLOT_INVALID');
    }
    return tile;
  });
  const selectedKeys = new Set(selected.map(tile => tile.key));
  const candidates = CANONICAL_WORLD_TILES.filter(tile => (
    !selectedKeys.has(tile.key)
    && !BLOCKED_TILE_KEYS.has(tile.key)
    && hexDistance(tile) <= LOWLANDS_RADIUS - 2
    && passableNeighborCount(tile) >= 4
  ));

  while (selected.length < GENESIS_CASTLE_SLOT_COUNT) {
    let best: CanonicalWorldTile | undefined;
    let bestDistance = -1;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const tile of candidates) {
      if (selectedKeys.has(tile.key)) continue;
      const minimumDistance = Math.min(...selected.map(existing => hexDistance(tile, existing)));
      const rank = deriveChannelSeed(HEGEMONY_WORLD_SEED, tile.q, tile.r, 'genesis-v2-castle-slot');
      if (
        minimumDistance > bestDistance
        || (minimumDistance === bestDistance && rank < bestRank)
        || (
          minimumDistance === bestDistance
          && rank === bestRank
          && best !== undefined
          && compareSpawnOrder(tile, best) < 0
        )
      ) {
        best = tile;
        bestDistance = minimumDistance;
        bestRank = rank;
      }
    }
    if (best === undefined || bestDistance < 2) {
      throw new Error('GENESIS_CASTLE_SLOT_CAPACITY');
    }
    selected.push(best);
    selectedKeys.add(best.key);
  }

  // The permanent locations stay broadly distributed, while their stable
  // admission order grows out from the founding district. Every next founder
  // is therefore near an earlier keep instead of slot 4 jumping to ring 18.
  const ordered = selected.slice(0, FOUNDING_DISTRICT_COORDS.length);
  const pending = selected.slice(FOUNDING_DISTRICT_COORDS.length);
  while (pending.length > 0) {
    const ranked = pending.map((tile, index) => ({
      tile,
      index,
      nearestFoundedDistance: Math.min(...ordered.map(existing => hexDistance(tile, existing))),
    }));
    const nearby = ranked.some(candidate => candidate.nearestFoundedDistance <= 4)
      ? ranked.filter(candidate => candidate.nearestFoundedDistance <= 4)
      : ranked;
    nearby.sort((left, right) => (
      hexDistance(left.tile) - hexDistance(right.tile)
      || left.nearestFoundedDistance - right.nearestFoundedDistance
      || deriveChannelSeed(
        HEGEMONY_WORLD_SEED,
        left.tile.q,
        left.tile.r,
        'genesis-v2-castle-slot',
      ) - deriveChannelSeed(
        HEGEMONY_WORLD_SEED,
        right.tile.q,
        right.tile.r,
        'genesis-v2-castle-slot',
      )
      || compareSpawnOrder(left.tile, right.tile)
    ));
    const next = nearby[0];
    if (next === undefined) throw new Error('GENESIS_CASTLE_SLOT_ORDER');
    ordered.push(next.tile);
    pending.splice(next.index, 1);
  }

  return Object.freeze(ordered.map((tile, index) => Object.freeze({
    slotId: index + 1,
    realmId: HEGEMONY_REALM_ID,
    tileKey: tile.key,
    q: tile.q,
    r: tile.r,
    generationVersion: HEGEMONY_WORLD_GENERATION_VERSION,
  })));
}

export const CANONICAL_CASTLE_SLOTS = makeCanonicalCastleSlots();
export const FOUNDING_DISTRICT_SLOTS = Object.freeze(CANONICAL_CASTLE_SLOTS.slice(0, 3));
const CASTLE_SLOT_KEYS = new Set(CANONICAL_CASTLE_SLOTS.map(slot => slot.tileKey));

function makeProtectedEmptyKeys(): Set<string> {
  const empty = new Set<string>();
  for (const slot of CANONICAL_CASTLE_SLOTS) {
    const neighbors = neighboringHexes(slot)
      .map(coord => CANONICAL_TILE_BY_KEY.get(hexKey(coord.q, coord.r)))
      .filter((tile): tile is CanonicalWorldTile => (
        tile !== undefined
        && !BLOCKED_TILE_KEYS.has(tile.key)
        && !CASTLE_SLOT_KEYS.has(tile.key)
      ))
      .sort((left, right) => (
        deriveChannelSeed(HEGEMONY_WORLD_SEED, left.q, left.r, `slot-${slot.slotId}-empty`)
          - deriveChannelSeed(HEGEMONY_WORLD_SEED, right.q, right.r, `slot-${slot.slotId}-empty`)
        || compareSpawnOrder(left, right)
      ));
    if (neighbors.length < 3) throw new Error('GENESIS_CASTLE_SLOT_NEIGHBORHOOD');
    neighbors.slice(0, 3).forEach(tile => empty.add(tile.key));
  }
  return empty;
}

const EMPTY_TILE_KEYS = makeProtectedEmptyKeys();
for (const tile of rankedTiles(
  CANONICAL_WORLD_TILES.filter(tile => (
    !BLOCKED_TILE_KEYS.has(tile.key)
    && !CASTLE_SLOT_KEYS.has(tile.key)
    && !EMPTY_TILE_KEYS.has(tile.key)
  )),
  'genesis-v2-empty-site',
)) {
  if (EMPTY_TILE_KEYS.size >= GENESIS_EMPTY_SITE_COUNT) break;
  EMPTY_TILE_KEYS.add(tile.key);
}
if (EMPTY_TILE_KEYS.size !== GENESIS_EMPTY_SITE_COUNT) {
  throw new Error('GENESIS_EMPTY_SITE_CAPACITY');
}

const AVAILABLE_CONTENT_TILES = rankedTiles(
  CANONICAL_WORLD_TILES.filter(tile => (
    !BLOCKED_TILE_KEYS.has(tile.key)
    && !CASTLE_SLOT_KEYS.has(tile.key)
    && !EMPTY_TILE_KEYS.has(tile.key)
  )),
  'genesis-v2-static-content',
);
const RESOURCE_TILE_KEYS = new Set(
  AVAILABLE_CONTENT_TILES.slice(0, GENESIS_RESOURCE_SITE_COUNT).map(tile => tile.key),
);
const CORE_TILE_KEYS = new Set(
  AVAILABLE_CONTENT_TILES
    .slice(GENESIS_RESOURCE_SITE_COUNT, GENESIS_RESOURCE_SITE_COUNT + GENESIS_CORE_SITE_COUNT)
    .map(tile => tile.key),
);

function terrainKindForTile(tile: CanonicalWorldTile): GenesisTerrainKind {
  const signal = deriveChannelSeed(HEGEMONY_WORLD_SEED, tile.q, tile.r, 'genesis-v2-terrain-kind');
  if (BLOCKED_TILE_KEYS.has(tile.key)) {
    return (['ridge', 'lake', 'ancient-stone'] as const)[signal % 3]!;
  }
  return (['lowland', 'meadow', 'forest', 'heath'] as const)[signal % 4]!;
}

function movementCostForTerrain(terrainKind: GenesisTerrainKind): number {
  if (terrainKind === 'lowland' || terrainKind === 'meadow') return 1;
  if (terrainKind === 'forest' || terrainKind === 'heath') return 2;
  return 0;
}

function contentKindForTile(tile: CanonicalWorldTile): GenesisStaticContentKind {
  if (CASTLE_SLOT_KEYS.has(tile.key)) return 'castle-slot';
  if (BLOCKED_TILE_KEYS.has(tile.key)) return 'scenic-blocker';
  if (EMPTY_TILE_KEYS.has(tile.key)) return 'empty';
  if (RESOURCE_TILE_KEYS.has(tile.key)) return 'resource-capable';
  if (CORE_TILE_KEYS.has(tile.key)) return 'core-capable';
  return 'reserve';
}

export const CANONICAL_WORLD_TILE_META = Object.freeze(
  CANONICAL_WORLD_TILES.map(tile => {
    const terrainKind = terrainKindForTile(tile);
    return Object.freeze<CanonicalWorldTileMeta>({
      tileKey: tile.key,
      realmId: HEGEMONY_REALM_ID,
      s: -tile.q - tile.r,
      ring: hexDistance(tile),
      sector: sectorForCoord(tile.q, tile.r),
      terrainKind,
      passable: !BLOCKED_TILE_KEYS.has(tile.key),
      movementCost: movementCostForTerrain(terrainKind),
      staticContentKind: contentKindForTile(tile),
      generationVersion: HEGEMONY_WORLD_GENERATION_VERSION,
    });
  }),
);

const CANONICAL_META_BY_KEY = new Map(
  CANONICAL_WORLD_TILE_META.map(meta => [meta.tileKey, meta] as const),
);
const CANONICAL_SLOT_BY_ID = new Map(
  CANONICAL_CASTLE_SLOTS.map(slot => [slot.slotId, slot] as const),
);

export function canonicalMetaForKey(key: string): CanonicalWorldTileMeta | undefined {
  return CANONICAL_META_BY_KEY.get(key);
}

export function canonicalCastleSlotForId(slotId: number): CanonicalCastleSlot | undefined {
  return CANONICAL_SLOT_BY_ID.get(slotId);
}

export function matchesCanonicalWorldMeta(row: {
  tileKey: string;
  realmId: string;
  s: number;
  ring: number;
  sector: number;
  terrainKind: string;
  passable: boolean;
  movementCost: number;
  staticContentKind: string;
  generationVersion: number;
}): boolean {
  const expected = canonicalMetaForKey(row.tileKey);
  return expected !== undefined
    && expected.realmId === row.realmId
    && expected.s === row.s
    && expected.ring === row.ring
    && expected.sector === row.sector
    && expected.terrainKind === row.terrainKind
    && expected.passable === row.passable
    && expected.movementCost === row.movementCost
    && expected.staticContentKind === row.staticContentKind
    && expected.generationVersion === row.generationVersion;
}

export function matchesCanonicalCastleSlot(row: CanonicalCastleSlot): boolean {
  const expected = canonicalCastleSlotForId(row.slotId);
  return expected !== undefined
    && expected.realmId === row.realmId
    && expected.tileKey === row.tileKey
    && expected.q === row.q
    && expected.r === row.r
    && expected.generationVersion === row.generationVersion;
}

export function matchesCanonicalRealm(row: CanonicalRealm): boolean {
  return row.realmId === CANONICAL_REALM.realmId
    && row.publicName === CANONICAL_REALM.publicName
    && row.seedName === CANONICAL_REALM.seedName
    && row.numericSeed === CANONICAL_REALM.numericSeed
    && row.generationVersion === CANONICAL_REALM.generationVersion
    && row.authoritativeRadius === CANONICAL_REALM.authoritativeRadius
    && row.renderRadius === CANONICAL_REALM.renderRadius
    && row.playerCapacity === CANONICAL_REALM.playerCapacity
    && row.active === CANONICAL_REALM.active;
}
