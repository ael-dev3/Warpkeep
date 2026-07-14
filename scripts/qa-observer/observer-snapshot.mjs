const TOP_LEVEL_KEYS = Object.freeze([
  'version',
  'protocolVersion',
  'worldSeed',
  'worldSeedName',
  'worldTileCount',
  'worldTileMetaCount',
  'realm',
  'castles',
]);
const REALM_KEYS = Object.freeze([
  'realmId',
  'numericSeed',
  'generationVersion',
  'authoritativeRadius',
  'renderRadius',
  'playerCapacity',
]);
const REQUIRED_CASTLE_KEYS = Object.freeze([
  'castleId', 'tileKey', 'q', 'r', 'level', 'name', 'portraitAvailable', 'publicStatus',
]);
const OPTIONAL_CASTLE_KEYS = Object.freeze([
  'canonicalUsername', 'displayName', 'publicBio',
]);
const CASTLE_KEYS = new Set([...REQUIRED_CASTLE_KEYS, ...OPTIONAL_CASTLE_KEYS]);
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff<>]/u;
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const PUBLIC_STATUSES = new Set(['founded', 'active']);

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

function safeString(value, maximum, allowEmpty = false) {
  return typeof value === 'string'
    && [...value].length <= maximum
    && (allowEmpty || [...value].length > 0)
    && value === value.trim()
    && !FORBIDDEN_TEXT.test(value)
    && !/\s{2,}/u.test(value);
}

function optionalString(value, maximum) {
  return value === undefined || safeString(value, maximum);
}

function freezeSnapshot(value) {
  const castles = Object.freeze(value.castles.map(castle => Object.freeze({ ...castle })));
  return Object.freeze({
    ...value,
    realm: Object.freeze({ ...value.realm }),
    castles,
  });
}

/**
 * Defense-in-depth validation for the native helper boundary. The helper and
 * Worker perform the same closed-shape checks independently; the loopback
 * broker never forwards arbitrary JSON to the QA page.
 */
export function parseQaObserverSnapshot(value) {
  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS)) return undefined;
  if (
    value.version !== 1
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
    || !Array.isArray(value.castles)
    || value.castles.length < 1
    || value.castles.length > value.realm.playerCapacity
  ) return undefined;

  const castleIds = new Set();
  const tileKeys = new Set();
  const castles = [];
  let previousCastleId = 0;
  for (const candidate of value.castles) {
    if (!isRecord(candidate)) return undefined;
    const keys = Object.keys(candidate);
    if (
      keys.some(key => !CASTLE_KEYS.has(key))
      || REQUIRED_CASTLE_KEYS.some(key => !Object.hasOwn(candidate, key))
      || !safeInteger(candidate.castleId, 1, Number.MAX_SAFE_INTEGER)
      || !safeInteger(candidate.q, -20, 20)
      || !safeInteger(candidate.r, -20, 20)
      || Math.max(Math.abs(candidate.q), Math.abs(candidate.r), Math.abs(-candidate.q - candidate.r)) > 20
      || !safeInteger(candidate.level, 1, 1_000)
      || !safeString(candidate.tileKey, 32)
      || candidate.tileKey !== `${candidate.q},${candidate.r}`
      || !safeString(candidate.name, 80)
      || typeof candidate.portraitAvailable !== 'boolean'
      || !safeString(candidate.publicStatus, 16)
      || !PUBLIC_STATUSES.has(candidate.publicStatus)
      || !optionalString(candidate.canonicalUsername, 64)
      || (candidate.canonicalUsername !== undefined && !USERNAME.test(candidate.canonicalUsername))
      || !optionalString(candidate.displayName, 80)
      || !optionalString(candidate.publicBio, 320)
      || castleIds.has(candidate.castleId)
      || tileKeys.has(candidate.tileKey)
      || candidate.castleId <= previousCastleId
    ) return undefined;
    castleIds.add(candidate.castleId);
    tileKeys.add(candidate.tileKey);
    previousCastleId = candidate.castleId;
    castles.push({
      castleId: candidate.castleId,
      tileKey: candidate.tileKey,
      q: candidate.q,
      r: candidate.r,
      level: candidate.level,
      name: candidate.name,
      portraitAvailable: candidate.portraitAvailable,
      publicStatus: candidate.publicStatus,
      ...(candidate.canonicalUsername === undefined
        ? {} : { canonicalUsername: candidate.canonicalUsername }),
      ...(candidate.displayName === undefined ? {} : { displayName: candidate.displayName }),
      ...(candidate.publicBio === undefined ? {} : { publicBio: candidate.publicBio }),
    });
  }
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
    castles,
  });
}
