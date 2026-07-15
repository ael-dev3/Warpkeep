const TOP_LEVEL_KEYS = Object.freeze([
  'version',
  'protocolVersion',
  'worldSeed',
  'worldSeedName',
  'worldTileCount',
  'worldTileMetaCount',
  'realm',
  'aggregates',
]);
const REALM_KEYS = Object.freeze([
  'realmId',
  'numericSeed',
  'generationVersion',
  'authoritativeRadius',
  'renderRadius',
  'playerCapacity',
]);
const AGGREGATE_KEYS = Object.freeze([
  'castleCount',
  'profileCount',
  'foundedCount',
  'activeCount',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function freezeSnapshot(value) {
  return Object.freeze({
    ...value,
    realm: Object.freeze({ ...value.realm }),
    aggregates: Object.freeze({ ...value.aggregates }),
  });
}

/**
 * Defense-in-depth validation for the native helper boundary. The helper and
 * Worker perform the same closed-shape checks independently; the owner-private
 * broker never forwards arbitrary JSON to browser JavaScript.
 */
export function parseQaObserverSnapshot(value) {
  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS)) return undefined;
  if (
    value.version !== 2
    || value.protocolVersion !== 3
    || value.worldSeed !== 3_445_214_658
    || value.worldSeedName !== 'HEGEMONY_GENESIS_001'
    || value.worldTileCount !== 1_261
    || value.worldTileMetaCount !== 1_261
    || !isRecord(value.realm)
    || !hasExactKeys(value.realm, REALM_KEYS)
    || value.realm.realmId !== 'GENESIS_001'
    || value.realm.numericSeed !== value.worldSeed
    || value.realm.generationVersion !== 2
    || value.realm.authoritativeRadius !== 20
    || value.realm.renderRadius !== 22
    || value.realm.playerCapacity !== 100
    || !isRecord(value.aggregates)
    || !hasExactKeys(value.aggregates, AGGREGATE_KEYS)
    || !safeInteger(value.aggregates.castleCount, 1, value.realm.playerCapacity)
    || value.aggregates.profileCount !== value.aggregates.castleCount
    || !safeInteger(value.aggregates.foundedCount, 0, value.aggregates.castleCount)
    || !safeInteger(value.aggregates.activeCount, 0, value.aggregates.castleCount)
    || value.aggregates.foundedCount + value.aggregates.activeCount
      !== value.aggregates.castleCount
  ) return undefined;

  return freezeSnapshot({
    version: value.version,
    protocolVersion: value.protocolVersion,
    worldSeed: value.worldSeed,
    worldSeedName: value.worldSeedName,
    worldTileCount: value.worldTileCount,
    worldTileMetaCount: value.worldTileMetaCount,
    realm: {
      realmId: value.realm.realmId,
      numericSeed: value.realm.numericSeed,
      generationVersion: value.realm.generationVersion,
      authoritativeRadius: value.realm.authoritativeRadius,
      renderRadius: value.realm.renderRadius,
      playerCapacity: value.realm.playerCapacity,
    },
    aggregates: {
      castleCount: value.aggregates.castleCount,
      profileCount: value.aggregates.profileCount,
      foundedCount: value.aggregates.foundedCount,
      activeCount: value.aggregates.activeCount,
    },
  });
}
