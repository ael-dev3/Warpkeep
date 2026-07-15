import {
  normalizeTrustedPublicProfile,
  trustedProfilesEqual,
} from './profileAuthorityPolicy';
import {
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META,
  type CanonicalCastleSlot,
  type CanonicalRealm,
} from './world';
import { worldCastleGraphIsConsistent } from './worldCastleIntegrity';
import {
  GenesisWorldDriftError,
  planCanonicalWorldSeed,
} from './worldSeedPolicy';

export const QA_OBSERVER_ATTESTATION_VERSION = 2;
export const QA_OBSERVER_MAX_CASTLES = 100;
export const QA_OBSERVER_MAX_CASTLE_NAME_CHARACTERS = 80;

type QaObserverWorldTileSource = Readonly<{
  key: string;
  q: number;
  r: number;
  biome: string;
  terrainSeed: number;
  occupantCastleId?: bigint;
}>;

type QaObserverWorldMetaSource = Readonly<{
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

export type QaObserverCastleSource = Readonly<{
  castleId: bigint;
  ownerFid: bigint;
  tileKey: string;
  q: number;
  r: number;
  level: number;
  name: string;
}>;

export type QaObserverProfileSource = Readonly<{
  fid: bigint;
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
  publicStatus: string;
}>;

export type QaObserverSnapshotSource = Readonly<{
  worldTiles: Iterable<QaObserverWorldTileSource>;
  worldMeta: Iterable<QaObserverWorldMetaSource>;
  realms: Iterable<CanonicalRealm>;
  castleSlots: Iterable<CanonicalCastleSlot>;
  castles: Iterable<QaObserverCastleSource>;
  profiles: Iterable<QaObserverProfileSource>;
}>;

export type QaObserverRealmAttestationV2 = Readonly<{
  version: 2;
  protocolVersion: number;
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
  aggregates: Readonly<{
    castleCount: number;
    profileCount: number;
    foundedCount: number;
    activeCount: number;
  }>;
}>;

export class QaObserverSnapshotError extends Error {
  constructor() {
    super('QA_OBSERVER_SNAPSHOT_INVALID');
    this.name = 'QaObserverSnapshotError';
  }
}

function fail(): never {
  throw new QaObserverSnapshotError();
}

function normalizeBoundedPublicText(value: string, maximumCharacters: number): string | undefined {
  const cleaned = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  return [...cleaned].slice(0, maximumCharacters).join('');
}

function readCastleName(value: string): string {
  const normalized = normalizeBoundedPublicText(
    value,
    QA_OBSERVER_MAX_CASTLE_NAME_CHARACTERS,
  );
  if (normalized === undefined || normalized !== value) fail();
  return normalized;
}

function validateStaticState(source: QaObserverSnapshotSource): {
  worldTiles: readonly QaObserverWorldTileSource[];
  castles: readonly QaObserverCastleSource[];
} {
  const worldTiles = [...source.worldTiles];
  const worldMeta = [...source.worldMeta];
  const realms = [...source.realms];
  const castleSlots = [...source.castleSlots];
  const castles = [...source.castles];
  try {
    const plan = planCanonicalWorldSeed({
      worldTiles,
      realms,
      worldMeta,
      castleSlots,
    });
    if (
      plan.worldTiles.length !== 0
      || plan.realm !== undefined
      || plan.worldMeta.length !== 0
      || plan.castleSlots.length !== 0
      || worldTiles.length !== CANONICAL_WORLD_TILES.length
      || worldMeta.length !== CANONICAL_WORLD_TILE_META.length
      || realms.length !== 1
      || !worldCastleGraphIsConsistent(worldTiles, castles)
    ) fail();
  } catch (error) {
    if (error instanceof QaObserverSnapshotError) throw error;
    if (error instanceof GenesisWorldDriftError) fail();
    fail();
  }
  return { worldTiles: Object.freeze(worldTiles), castles: Object.freeze(castles) };
}

/**
 * Construct the only bridge-visible QA attestation. Private and public player
 * fields are inspected transiently to verify the founding graph, but no
 * per-player value, identifier, label, coordinate, or portrait signal can be
 * represented by the output type.
 */
export function buildQaObserverRealmAttestationV2(
  source: QaObserverSnapshotSource,
  protocolVersion: number,
): QaObserverRealmAttestationV2 {
  if (
    !Number.isInteger(protocolVersion)
    || protocolVersion < 0
    || protocolVersion > 0xffff_ffff
  ) fail();
  const { castles } = validateStaticState(source);
  if (castles.length < 1 || castles.length > QA_OBSERVER_MAX_CASTLES) fail();

  const profilesByFid = new Map<bigint, QaObserverProfileSource>();
  for (const profile of source.profiles) {
    if (profile.fid <= 0n || profilesByFid.has(profile.fid)) fail();
    profilesByFid.set(profile.fid, profile);
  }
  if (profilesByFid.size !== castles.length) fail();

  const ownerFids = new Set<bigint>();
  let foundedCount = 0;
  let activeCount = 0;
  for (const castle of castles) {
    if (castle.castleId <= 0n || castle.ownerFid <= 0n || ownerFids.has(castle.ownerFid)) fail();
    ownerFids.add(castle.ownerFid);
    const profile = profilesByFid.get(castle.ownerFid);
    if (profile === undefined) fail();
    if (profile.publicStatus !== 'founded' && profile.publicStatus !== 'active') fail();

    let normalizedProfile;
    try {
      normalizedProfile = normalizeTrustedPublicProfile(profile);
    } catch {
      fail();
    }
    if (!trustedProfilesEqual(profile, normalizedProfile)) fail();
    readCastleName(castle.name);
    if (profile.publicStatus === 'active') activeCount += 1;
    else foundedCount += 1;
  }

  return Object.freeze({
    version: QA_OBSERVER_ATTESTATION_VERSION,
    protocolVersion,
    worldSeed: CANONICAL_REALM.numericSeed,
    worldSeedName: CANONICAL_REALM.seedName,
    worldTileCount: CANONICAL_WORLD_TILES.length,
    worldTileMetaCount: CANONICAL_WORLD_TILE_META.length,
    realm: Object.freeze({
      realmId: CANONICAL_REALM.realmId,
      numericSeed: CANONICAL_REALM.numericSeed,
      generationVersion: CANONICAL_REALM.generationVersion,
      authoritativeRadius: CANONICAL_REALM.authoritativeRadius,
      renderRadius: CANONICAL_REALM.renderRadius,
      playerCapacity: CANONICAL_REALM.playerCapacity,
    }),
    aggregates: Object.freeze({
      castleCount: castles.length,
      profileCount: profilesByFid.size,
      foundedCount,
      activeCount,
    }),
  });
}
