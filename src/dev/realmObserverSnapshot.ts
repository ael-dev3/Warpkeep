import type { RealmIdentity } from '../components/realm/realmTypes';
import { WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH } from '../security/publicImageUrl';
import { validateCanonicalGenesisSnapshot } from '../spacetime/canonicalGenesisSnapshot';
import type {
  CanonicalWarpkeepRealmSnapshot,
  WarpkeepCastle,
  WarpkeepRealmProfile,
  WarpkeepRealmSnapshotCandidate
} from '../spacetime/warpkeepBackendTypes';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../spacetime/warpkeepProtocol';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META
} from '../../spacetimedb/src/world';

export const REALM_OBSERVER_SNAPSHOT_VERSION = 1;
export const REALM_OBSERVER_BROKER_ORIGIN = 'http://127.0.0.1:41731';
export const REALM_OBSERVER_SNAPSHOT_URL = `${REALM_OBSERVER_BROKER_ORIGIN}/snapshot`;
export const REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH =
  WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH;

const MAX_SNAPSHOT_BYTES = 256 * 1024;
const SYNTHETIC_OWNER_BASE = 8_000_000_000_000_000;
const SYNTHETIC_OWNER_SEED_STRIDE = 128;
const MAX_SYNTHETIC_OWNER_SEED = 1_000_000;
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff<>]/u;
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const PUBLIC_STATUSES = new Set(['founded', 'active']);

const CASTLE_KEYS = Object.freeze([
  'castleId',
  'tileKey',
  'q',
  'r',
  'level',
  'name',
  'canonicalUsername',
  'displayName',
  'publicBio',
  'portraitAvailable',
  'publicStatus'
]);

const REQUIRED_CASTLE_KEYS = Object.freeze([
  'castleId',
  'tileKey',
  'q',
  'r',
  'level',
  'name',
  'portraitAvailable',
  'publicStatus'
]);

const REALM_ATTESTATION_KEYS = Object.freeze([
  'realmId',
  'numericSeed',
  'generationVersion',
  'authoritativeRadius',
  'renderRadius',
  'playerCapacity'
]);

export type RealmObserverCastle = Readonly<{
  castleId: number;
  tileKey: string;
  q: number;
  r: number;
  level: number;
  name: string;
  canonicalUsername?: string;
  displayName?: string;
  publicBio?: string;
  portraitAvailable: boolean;
  publicStatus: string;
}>;

export type RealmObserverSnapshot = Readonly<{
  version: 1;
  protocolVersion: 3;
  worldSeed: number;
  worldSeedName: string;
  worldTileCount: number;
  worldTileMetaCount: number;
  realm: Readonly<{
    realmId: string;
    numericSeed: number;
    generationVersion: number;
    authoritativeRadius: number;
    renderRadius: number;
    playerCapacity: number;
  }>;
  castles: readonly RealmObserverCastle[];
}>;

export type RealmObserverHarnessRealm = Readonly<{
  identity: RealmIdentity;
  snapshot: CanonicalWarpkeepRealmSnapshot;
}>;

export class RealmObserverSnapshotError extends Error {
  constructor() {
    super('The local QA observer snapshot is unavailable or incompatible.');
    this.name = 'RealmObserverSnapshotError';
  }
}

function fail(): never {
  throw new RealmObserverSnapshotError();
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  required = allowed
) {
  const keys = Object.keys(value).sort();
  const sortedAllowed = [...allowed].sort();
  if (keys.some((key) => !sortedAllowed.includes(key))) fail();
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail();
}

function safeInteger(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail();
  }
  return value as number;
}

function cleanText(value: unknown, maximumLength: number) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || [...value].length > maximumLength
    || value.trim() !== value
    || FORBIDDEN_TEXT.test(value)
    || /\s{2,}/u.test(value)
  ) fail();
  return value;
}

function optionalText(
  value: Readonly<Record<string, unknown>>,
  key: string,
  maximumLength: number
) {
  return Object.prototype.hasOwnProperty.call(value, key)
    ? cleanText(value[key], maximumLength)
    : undefined;
}

function parseRealmAttestation(value: unknown) {
  const candidate = record(value);
  exactKeys(candidate, REALM_ATTESTATION_KEYS);
  const attestation = Object.freeze({
    realmId: cleanText(candidate.realmId, 64),
    numericSeed: safeInteger(candidate.numericSeed, 0, 0xffff_ffff),
    generationVersion: safeInteger(candidate.generationVersion, 1, 0xffff_ffff),
    authoritativeRadius: safeInteger(candidate.authoritativeRadius, 1, 1_000),
    renderRadius: safeInteger(candidate.renderRadius, 1, 1_000),
    playerCapacity: safeInteger(candidate.playerCapacity, 1, 10_000)
  });
  if (
    attestation.realmId !== CANONICAL_REALM.realmId
    || attestation.numericSeed !== CANONICAL_REALM.numericSeed
    || attestation.generationVersion !== CANONICAL_REALM.generationVersion
    || attestation.authoritativeRadius !== CANONICAL_REALM.authoritativeRadius
    || attestation.renderRadius !== CANONICAL_REALM.renderRadius
    || attestation.playerCapacity !== CANONICAL_REALM.playerCapacity
  ) fail();
  return attestation;
}

function parseCastle(value: unknown, slotByTile: ReadonlyMap<string, (typeof CANONICAL_CASTLE_SLOTS)[number]>) {
  const candidate = record(value);
  exactKeys(candidate, CASTLE_KEYS, REQUIRED_CASTLE_KEYS);
  const tileKey = cleanText(candidate.tileKey, 32);
  const slot = slotByTile.get(tileKey);
  if (!slot) fail();
  const canonicalUsername = optionalText(candidate, 'canonicalUsername', 64);
  if (canonicalUsername !== undefined && !USERNAME.test(canonicalUsername)) fail();
  const publicStatus = cleanText(candidate.publicStatus, 48);
  if (!PUBLIC_STATUSES.has(publicStatus)) fail();
  if (typeof candidate.portraitAvailable !== 'boolean') fail();
  const displayName = optionalText(candidate, 'displayName', 80);
  const publicBio = optionalText(candidate, 'publicBio', 320);

  const castle = Object.freeze({
    castleId: safeInteger(candidate.castleId, 1, Number.MAX_SAFE_INTEGER),
    tileKey,
    q: safeInteger(candidate.q, -20, 20),
    r: safeInteger(candidate.r, -20, 20),
    level: safeInteger(candidate.level, 1, 1_000),
    name: cleanText(candidate.name, 80),
    ...(canonicalUsername === undefined ? {} : { canonicalUsername }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(publicBio === undefined ? {} : { publicBio }),
    portraitAvailable: candidate.portraitAvailable,
    publicStatus
  });
  if (castle.q !== slot.q || castle.r !== slot.r) fail();
  return castle;
}

export function parseRealmObserverSnapshot(value: unknown): RealmObserverSnapshot {
  const candidate = record(value);
  exactKeys(candidate, [
    'version',
    'protocolVersion',
    'worldSeed',
    'worldSeedName',
    'worldTileCount',
    'worldTileMetaCount',
    'realm',
    'castles'
  ]);
  if (
    candidate.version !== REALM_OBSERVER_SNAPSHOT_VERSION
    || candidate.protocolVersion !== WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
    || candidate.worldSeed !== CANONICAL_REALM.numericSeed
    || candidate.worldSeedName !== CANONICAL_REALM.seedName
    || candidate.worldTileCount !== CANONICAL_WORLD_TILES.length
    || candidate.worldTileMetaCount !== CANONICAL_WORLD_TILE_META.length
    || !Array.isArray(candidate.castles)
    || candidate.castles.length < 1
    || candidate.castles.length > CANONICAL_REALM.playerCapacity
  ) fail();

  const slotByTile = new Map(CANONICAL_CASTLE_SLOTS.map((slot) => [slot.tileKey, slot] as const));
  const castles = candidate.castles.map((castle) => parseCastle(castle, slotByTile));
  const castleIds = new Set<number>();
  const tileKeys = new Set<string>();
  let previousCastleId = 0;
  for (const castle of castles) {
    if (
      castleIds.has(castle.castleId)
      || tileKeys.has(castle.tileKey)
      || castle.castleId <= previousCastleId
    ) fail();
    castleIds.add(castle.castleId);
    tileKeys.add(castle.tileKey);
    previousCastleId = castle.castleId;
  }

  return Object.freeze({
    version: REALM_OBSERVER_SNAPSHOT_VERSION,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION,
    worldSeed: CANONICAL_REALM.numericSeed,
    worldSeedName: CANONICAL_REALM.seedName,
    worldTileCount: CANONICAL_WORLD_TILES.length,
    worldTileMetaCount: CANONICAL_WORLD_TILE_META.length,
    realm: parseRealmAttestation(candidate.realm),
    castles: Object.freeze(castles)
  });
}

function randomSyntheticOwnerSeed() {
  if (!globalThis.crypto?.getRandomValues) fail();
  const random = new Uint32Array(1);
  globalThis.crypto.getRandomValues(random);
  return (random[0]! % MAX_SYNTHETIC_OWNER_SEED) + 1;
}

/**
 * Converts a privacy-bounded external snapshot into the existing privately
 * branded renderer authority. Synthetic numeric owner keys exist only in this
 * dev-only adapter and are regenerated for every observer run.
 */
export function createRealmObserverHarnessRealm(
  observer: RealmObserverSnapshot,
  syntheticOwnerSeed = randomSyntheticOwnerSeed()
): RealmObserverHarnessRealm {
  safeInteger(syntheticOwnerSeed, 1, MAX_SYNTHETIC_OWNER_SEED);
  const syntheticOwnerKeys = observer.castles.map((_, index) => (
    SYNTHETIC_OWNER_BASE + syntheticOwnerSeed * SYNTHETIC_OWNER_SEED_STRIDE + index
  ));
  const castles: readonly WarpkeepCastle[] = observer.castles.map((castle, index) => Object.freeze({
    castleId: castle.castleId,
    ownerFid: syntheticOwnerKeys[index]!,
    tileKey: castle.tileKey,
    q: castle.q,
    r: castle.r,
    level: castle.level,
    name: castle.name
  }));
  const profiles: readonly WarpkeepRealmProfile[] = observer.castles.map((castle, index) => Object.freeze({
    fid: syntheticOwnerKeys[index]!,
    ...(castle.canonicalUsername === undefined
      ? {}
      : { canonicalUsername: castle.canonicalUsername }),
    ...(castle.displayName === undefined ? {} : { displayName: castle.displayName }),
    ...(castle.publicBio === undefined ? {} : { publicBio: castle.publicBio }),
    ...(castle.portraitAvailable
      ? { pfpUrl: REALM_OBSERVER_PORTRAIT_PLACEHOLDER_PATH }
      : {}),
    publicStatus: castle.publicStatus,
    communityStatsVisible: false
  }));
  const castleByTile = new Map(castles.map((castle) => [castle.tileKey, castle.castleId] as const));
  const ownCastle = castles[0]!;
  const candidate: WarpkeepRealmSnapshotCandidate = {
    activeRealms: [{ ...CANONICAL_REALM }],
    tiles: CANONICAL_WORLD_TILES.map((tile) => {
      const occupantCastleId = castleByTile.get(tile.key);
      return { ...tile, ...(occupantCastleId === undefined ? {} : { occupantCastleId }) };
    }),
    tileMetadata: CANONICAL_WORLD_TILE_META.map((metadata) => ({ ...metadata })),
    players: [],
    profiles,
    castles,
    ownCastle
  };
  const snapshot = validateCanonicalGenesisSnapshot(candidate, {
    ownFid: ownCastle.ownerFid,
    protocolVersion: observer.protocolVersion
  });
  return Object.freeze({
    identity: Object.freeze({ fid: ownCastle.ownerFid }),
    snapshot
  });
}

async function readBoundedSnapshotBody(response: Response) {
  const advertised = response.headers.get('content-length');
  if (
    advertised !== null
    && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_SNAPSHOT_BYTES)
  ) fail();
  if (!response.body) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      if (!result.value) continue;
      total += result.value.byteLength;
      if (total > MAX_SNAPSHOT_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size violation remains authoritative.
        }
        fail();
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof RealmObserverSnapshotError) throw error;
    return fail();
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail();
  }
}

export async function fetchRealmObserverSnapshot(
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<RealmObserverSnapshot> {
  let response: Response;
  try {
    response = await fetchImpl(REALM_OBSERVER_SNAPSHOT_URL, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' }
    });
  } catch {
    return fail();
  }
  if (!response.ok || response.status !== 200) fail();
  if (response.url && response.url !== REALM_OBSERVER_SNAPSHOT_URL) fail();
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) {
    fail();
  }
  const body = await readBoundedSnapshotBody(response);
  try {
    return parseRealmObserverSnapshot(JSON.parse(body) as unknown);
  } catch (error) {
    if (error instanceof RealmObserverSnapshotError) throw error;
    return fail();
  }
}
