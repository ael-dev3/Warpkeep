import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  matchesCanonicalCastleSlot,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
  type CanonicalCastleSlot,
  type CanonicalRealm,
  type CanonicalWorldTile,
  type CanonicalWorldTileMeta,
} from './world';

type ExistingWorldTile = CanonicalWorldTile;
type ExistingRealm = CanonicalRealm;
type ExistingWorldMeta = Readonly<{
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
}>;
type ExistingCastleSlot = CanonicalCastleSlot;

export type GenesisSeedSnapshot = Readonly<{
  worldTiles: Iterable<ExistingWorldTile>;
  realms: Iterable<ExistingRealm>;
  worldMeta: Iterable<ExistingWorldMeta>;
  castleSlots: Iterable<ExistingCastleSlot>;
}>;

export type GenesisSeedPlan = Readonly<{
  worldTiles: readonly CanonicalWorldTile[];
  realm: CanonicalRealm | undefined;
  worldMeta: readonly CanonicalWorldTileMeta[];
  castleSlots: readonly CanonicalCastleSlot[];
}>;

export class GenesisWorldDriftError extends Error {
  constructor() {
    super('WORLD_SEED_CONFLICT');
    this.name = 'GenesisWorldDriftError';
  }
}

function validateUniqueRows<T>(
  rows: Iterable<T>,
  keyFor: (row: T) => string | number,
  matches: (row: T) => boolean,
): Set<string | number> {
  const seen = new Set<string | number>();
  for (const row of rows) {
    const key = keyFor(row);
    if (seen.has(key) || !matches(row)) throw new GenesisWorldDriftError();
    seen.add(key);
  }
  return seen;
}

/**
 * Produces only missing generation-v2 static rows. Any unknown, duplicate, or
 * changed row fails before a write plan exists, so a second seed is a no-op and
 * drift is never silently overwritten.
 */
export function planCanonicalWorldSeed(snapshot: GenesisSeedSnapshot): GenesisSeedPlan {
  const worldKeys = validateUniqueRows(
    snapshot.worldTiles,
    row => row.key,
    matchesCanonicalTerrain,
  );
  const metaKeys = validateUniqueRows(
    snapshot.worldMeta,
    row => row.tileKey,
    matchesCanonicalWorldMeta,
  );
  const slotIds = validateUniqueRows(
    snapshot.castleSlots,
    row => row.slotId,
    matchesCanonicalCastleSlot,
  );
  const realms = [...snapshot.realms];
  if (realms.length > 1 || (realms[0] !== undefined && !matchesCanonicalRealm(realms[0]))) {
    throw new GenesisWorldDriftError();
  }

  return Object.freeze({
    worldTiles: Object.freeze(CANONICAL_WORLD_TILES.filter(tile => !worldKeys.has(tile.key))),
    realm: realms.length === 0 ? CANONICAL_REALM : undefined,
    worldMeta: Object.freeze(CANONICAL_WORLD_TILE_META.filter(meta => !metaKeys.has(meta.tileKey))),
    castleSlots: Object.freeze(CANONICAL_CASTLE_SLOTS.filter(slot => !slotIds.has(slot.slotId))),
  });
}
