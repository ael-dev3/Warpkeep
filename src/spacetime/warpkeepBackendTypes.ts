import type { VerifiedFarcasterIdentity } from '../farcaster/farcasterAuthTypes';

export type WarpkeepAdmissionStatus =
  | 'not_admitted'
  | 'admitted_needs_bootstrap'
  | 'ready'
  | 'disabled';

export type WarpkeepBackendPhase =
  | 'idle'
  | 'connecting'
  | 'reconnecting'
  | 'checking-admission'
  | 'awaiting-terms'
  | 'denied'
  | 'bootstrapping'
  | 'accepting-terms'
  | 'opening-realm'
  | 'ready'
  | 'error';

export type WarpkeepWorldTile = Readonly<{
  key: string;
  q: number;
  r: number;
  biome: string;
  terrainSeed: number;
  occupantCastleId?: number;
}>;

export type WarpkeepWorldTileMetadata = Readonly<{
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

export type WarpkeepRealm = Readonly<{
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

export type WarpkeepPlayer = Readonly<{
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  status: string;
}>;

/**
 * Public, privacy-bounded realm presentation. Wallet associations, burn-event
 * receipts, authorization fields, and operator records must never enter this
 * browser-facing projection.
 */
export type WarpkeepRealmProfile = Readonly<{
  fid: number;
  canonicalUsername?: string;
  displayName?: string;
  pfpUrl?: string;
  publicBio?: string;
  admittedAt?: number;
  firstAuthenticatedAt?: number;
  publicStatus: string;
  communityStatsVisible: boolean;
  totalSnapBurnedMicros?: bigint;
  marksEarnedMicros?: bigint;
  marksSpentMicros?: bigint;
  marksBalanceMicros?: bigint;
  marksPolicyVersion?: string;
}>;

export type WarpkeepCastle = Readonly<{
  castleId: number;
  ownerFid: number;
  tileKey: string;
  q: number;
  r: number;
  level: number;
  name: string;
  foundedAt?: number;
}>;

/**
 * Untrusted projection assembled from the six public subscription tables.
 * It may represent a partially applied subscription and must not reach the
 * renderer until `validateCanonicalGenesisSnapshot` accepts it.
 */
export type WarpkeepRealmSnapshotCandidate = Readonly<{
  tiles: readonly WarpkeepWorldTile[];
  tileMetadata: readonly WarpkeepWorldTileMetadata[];
  players: readonly WarpkeepPlayer[];
  profiles: readonly WarpkeepRealmProfile[];
  castles: readonly WarpkeepCastle[];
  /** Every active public realm row; cardinality is part of validation. */
  activeRealms: readonly WarpkeepRealm[];
  ownCastle?: WarpkeepCastle;
}>;

/**
 * Canonical, immutable renderer authority. The runtime brand is intentionally
 * private to the validator module; the public fingerprint is an attestation
 * label, not a cryptographic digest.
 */
export type CanonicalWarpkeepRealmSnapshot = WarpkeepRealmSnapshotCandidate & Readonly<{
  protocolVersion: 3;
  canonicalFingerprint: string;
  realm: WarpkeepRealm;
  ownCastle: WarpkeepCastle;
}>;

/** Backward-compatible public name for the only snapshot allowed in ready state. */
export type WarpkeepRealmSnapshot = CanonicalWarpkeepRealmSnapshot;

export type WarpkeepBackendState = Readonly<{
  phase: WarpkeepBackendPhase;
  identity?: VerifiedFarcasterIdentity;
  admission?: WarpkeepAdmissionStatus;
  realm?: CanonicalWarpkeepRealmSnapshot;
}>;

export const IDLE_WARPKEEP_BACKEND_STATE: WarpkeepBackendState = Object.freeze({
  phase: 'idle'
});

export type WarpkeepBackendErrorCode = 'unconfigured' | 'unreachable' | 'unexpected';

export type WarpkeepBackendError = Readonly<{
  code: WarpkeepBackendErrorCode;
}>;
