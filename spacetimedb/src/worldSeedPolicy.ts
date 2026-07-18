import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILE_META,
  GENESIS_GENERATION_V2_WORLD_TILES,
  matchesCanonicalCastleSlot,
  matchesCanonicalRealm,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
  matchesGenerationV2Realm,
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
  realmTransition: GenesisRealmSeedTransition;
  worldMeta: readonly CanonicalWorldTileMeta[];
  castleSlots: readonly CanonicalCastleSlot[];
}>;

export type GenesisRealmSeedTransition =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'insert'; realm: CanonicalRealm }>
  | Readonly<{
      kind: 'update';
      previous: CanonicalRealm;
      realm: CanonicalRealm;
    }>;

export class GenesisWorldDriftError extends Error {
  constructor() {
    super('WORLD_SEED_CONFLICT');
    this.name = 'GenesisWorldDriftError';
  }
}

export type GenesisStaticSnapshotGeneration = 'generation-v2' | 'generation-v3' | 'invalid';

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

function containsExactKeys<T>(
  actual: ReadonlySet<string | number>,
  expected: readonly T[],
  keyFor: (row: T) => string | number,
): boolean {
  return actual.size === expected.length && expected.every(row => actual.has(keyFor(row)));
}

/**
 * Classifies only the two complete static snapshots that may bracket the v3
 * rollout. A partial recovery, duplicated row, unknown row, or same-count mix
 * of v2/v3 rows is invalid rather than being mistaken for a deployment state.
 */
export function classifyGenesisStaticSnapshot(
  snapshot: GenesisSeedSnapshot,
): GenesisStaticSnapshotGeneration {
  try {
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
    if (realms.length !== 1) return 'invalid';

    const hasCanonicalSlots = containsExactKeys(
      slotIds,
      CANONICAL_CASTLE_SLOTS,
      row => row.slotId,
    );
    if (!hasCanonicalSlots) return 'invalid';

    if (
      matchesGenerationV2Realm(realms[0]!)
      && containsExactKeys(
        worldKeys,
        GENESIS_GENERATION_V2_WORLD_TILES,
        row => row.key,
      )
      && containsExactKeys(
        metaKeys,
        GENESIS_GENERATION_V2_WORLD_TILE_META,
        row => row.tileKey,
      )
    ) return 'generation-v2';

    if (
      matchesCanonicalRealm(realms[0]!)
      && containsExactKeys(worldKeys, CANONICAL_WORLD_TILES, row => row.key)
      && containsExactKeys(metaKeys, CANONICAL_WORLD_TILE_META, row => row.tileKey)
    ) return 'generation-v3';

    return 'invalid';
  } catch (error) {
    if (error instanceof GenesisWorldDriftError) return 'invalid';
    throw error;
  }
}

/**
 * Produces only missing canonical static rows plus an explicit singleton realm
 * transition. The sole accepted update source is the exact deployed v2 realm;
 * all other unknown, duplicate, or changed rows fail before a write plan exists.
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
  if (realms.length > 1) {
    throw new GenesisWorldDriftError();
  }
  const existingRealm = realms[0];
  let realmTransition: GenesisRealmSeedTransition;
  if (existingRealm === undefined) {
    realmTransition = Object.freeze({ kind: 'insert', realm: CANONICAL_REALM });
  } else if (matchesCanonicalRealm(existingRealm)) {
    realmTransition = Object.freeze({ kind: 'none' });
  } else if (matchesGenerationV2Realm(existingRealm)) {
    realmTransition = Object.freeze({
      kind: 'update',
      previous: GENESIS_GENERATION_V2_REALM,
      realm: CANONICAL_REALM,
    });
  } else {
    throw new GenesisWorldDriftError();
  }

  return Object.freeze({
    worldTiles: Object.freeze(CANONICAL_WORLD_TILES.filter(tile => !worldKeys.has(tile.key))),
    realmTransition,
    worldMeta: Object.freeze(CANONICAL_WORLD_TILE_META.filter(meta => !metaKeys.has(meta.tileKey))),
    castleSlots: Object.freeze(CANONICAL_CASTLE_SLOTS.filter(slot => !slotIds.has(slot.slotId))),
  });
}
