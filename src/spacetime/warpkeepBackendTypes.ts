import type { VerifiedFarcasterIdentity } from '../farcaster/farcasterAuthTypes';
import type { ReadyRealmResourcePresentation } from '../components/realm/realmResourcePresentation';
import type { ReadyGoldExpeditionPresentation } from '../components/realm/realmGoldExpeditionPresentation';
import type { ReadyFoodExpeditionPresentation } from '../components/realm/realmFoodExpeditionPresentation';
import type { ReadyWoodExpeditionPresentation } from '../components/realm/realmWoodExpeditionPresentation';
import type { ReadyStoneExpeditionPresentation } from '../components/realm/realmStoneExpeditionPresentation';
import type {
  RealmWorkerNodeOccupation,
  RealmWorkerPublicPresentation,
  RealmWorkerSystemPresentation,
  WorkerRosterPresentation,
  ReadyWorkerResourceState,
  ReadyWorkerProjection
} from '../components/realm/realmWorkerPresentation';

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

/** Public v5 Gold-site projection. It carries no ownership or economy data. */
export type WarpkeepGoldSite = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

/** Public occupancy only; player-private accrual stays in the procedure view. */
export type WarpkeepGoldNodeOccupation = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: 'outbound' | 'gathering' | 'returning';
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

/** Public v7 Food-site projection. It carries no ownership or economy data. */
export type WarpkeepFoodSite = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

/** Public timing/occupancy only; Food accrual remains caller-private. */
export type WarpkeepFoodNodeOccupation = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: 'outbound' | 'gathering' | 'returning';
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

/** Public v8 Wood-site projection. It carries no ownership or economy data. */
export type WarpkeepWoodSite = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

/** Public timing/occupancy only; Wood accrual remains caller-private. */
export type WarpkeepWoodNodeOccupation = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: 'outbound' | 'gathering' | 'returning';
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

/** Public v10 Stone Quarry-site projection. */
export type WarpkeepStoneSite = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

/** Public timing/occupancy only; Stone accrual remains caller-private. */
export type WarpkeepStoneNodeOccupation = Readonly<{
  siteId: string;
  originCastleId: number;
  phase: 'outbound' | 'gathering' | 'returning';
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type WarpkeepRealmWorkerSystem = RealmWorkerSystemPresentation;
export type WarpkeepCastleWorker = RealmWorkerPublicPresentation;
export type WarpkeepWorkerNodeOccupation = RealmWorkerNodeOccupation;

/**
 * Public, immutable realm-wide forest layout metadata. This is visual state
 * only: server-side seeding authority and all administrative reducers remain
 * outside the player graph.
 */
export type WarpkeepForestLayout = Readonly<{
  realmId: string;
  layoutVersion: number;
  policyVersion: string;
  layoutDigest: string;
  assetCatalogDigest: string;
  instanceCount: number;
}>;

/**
 * One fixed-point tree transform from the public realm-wide forest layout.
 * BigInt coordinates retain the exact server values until the renderer's
 * canonical policy decoder verifies and converts them.
 */
export type WarpkeepForestTree = Readonly<{
  treeId: string;
  realmId: string;
  tileKey: string;
  q: number;
  r: number;
  localXMicrounits: bigint;
  localZMicrounits: bigint;
  worldXMicrounits: bigint;
  worldZMicrounits: bigint;
  rotationMilliDegrees: number;
  scaleBasisPoints: number;
  speciesId: string;
  habitat: string;
  layoutVersion: number;
}>;

/** Public, fixed-point Genesis water layout metadata. */
export type WarpkeepWaterLayout = Readonly<{
  realmId: string;
  layoutVersion: number;
  policyVersion: string;
  generationVersion: number;
  canonicalLandCellCount: number;
  oceanCellCount: number;
  lakeCellCount: number;
  lakeBodyCount: number;
  riverCount: number;
  riverCellCount: number;
  seaLevelMilli: number;
  seaLevelPolicyVersion: string;
  fogStartDepthCells: number;
  fogFullDepthCells: number;
  hiddenBufferCells: number;
  layoutDigest: string;
  sourceCommit: string;
  activated: boolean;
}>;

export type WarpkeepWaterBody = Readonly<{
  bodyId: string;
  realmId: string;
  regime: string;
  cellCount: number;
  sourceCellKey: string;
  mouthCellKey: string;
  surfaceLevelMilli: number;
  flowDirectionXQ15: number;
  flowDirectionZQ15: number;
  wavePreset: string;
  ordinal: number;
  seed: number;
  generationVersion: number;
  layoutVersion: number;
}>;

export type WarpkeepWaterCell = Readonly<{
  cellKey: string;
  realmId: string;
  q: number;
  r: number;
  regime: string;
  bodyId: string;
  depthCells: number;
  elevationMilli: number;
  surfaceLevelMilli: number;
  ring: number;
  s: number;
  underlyingTileKey?: string;
  riverOrdinal?: number;
  riverOrder?: number;
  downstreamWaterCellKey?: string;
  flowAccumulation: number;
  depthClass: number;
  oceanDepth: number;
  bankSeed: number;
  generationVersion: number;
  fogBand: string;
  layoutVersion: number;
}>;

/** Shared fixed-point atmosphere clock and sun vector for all water clients. */
export type WarpkeepRealmEnvironment = Readonly<{
  realmId: string;
  environmentEpoch: bigint;
  waterLayoutVersion: number;
  seaLevelMilli: number;
  sunDirectionXMicro: number;
  sunDirectionYMicro: number;
  sunDirectionZMicro: number;
  /** Raw generated timestamp exists only before canonical snapshot normalization. */
  updatedAt?: unknown;
  /** Browser-safe canonical timestamp used by renderer-only shared phase. */
  updatedAtMicros?: bigint;
}>;

/** Public additive policy selecting a reviewed subset of immutable Water v1. */
export type WarpkeepWaterRevision = Readonly<{
  realmId: string;
  revisionVersion: number;
  policyVersion: string;
  baseLayoutVersion: number;
  baseLayoutDigest: string;
  oceanBodyCount: number;
  riverBodyCount: number;
  enabledBodyCount: number;
  oceanCellCount: number;
  riverCellCount: number;
  enabledCellCount: number;
  lakeBodyCount: number;
  lakeCellCount: number;
  riverWidthCells: number;
  navigationFogBoundaryDepthCells: number;
  hiddenBufferCells: number;
  revisionDigest: string;
  sourceCommit: string;
  activated: boolean;
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
  /** Omitted while the additive v5 public projection is unavailable. */
  goldSites?: readonly WarpkeepGoldSite[];
  /** Omitted with `goldSites`; absent/invalid data renders no Gold nodes. */
  goldNodeOccupations?: readonly WarpkeepGoldNodeOccupation[];
  /** Omitted while the additive public Food projection is unavailable. */
  foodSites?: readonly WarpkeepFoodSite[];
  /** Omitted with `foodSites`; absent/invalid data renders no Food nodes. */
  foodNodeOccupations?: readonly WarpkeepFoodNodeOccupation[];
  /** Omitted while the additive public Wood projection is unavailable. */
  woodSites?: readonly WarpkeepWoodSite[];
  /** Omitted with `woodSites`; absent/invalid data renders no Wood nodes. */
  woodNodeOccupations?: readonly WarpkeepWoodNodeOccupation[];
  /** Omitted while the additive public Stone projection is unavailable. */
  stoneSites?: readonly WarpkeepStoneSite[];
  /** Omitted with `stoneSites`; absent/invalid data renders no Stone nodes. */
  stoneNodeOccupations?: readonly WarpkeepStoneNodeOccupation[];
  /** Additive generic-worker public projection; absent keeps legacy mode. */
  workerSystem?: WarpkeepRealmWorkerSystem;
  workerWorkers?: readonly WarpkeepCastleWorker[];
  workerOccupations?: readonly WarpkeepWorkerNodeOccupation[];
  /**
   * Additive public forest metadata. The connection publishes the pair only
   * after one atomic subscription applies; a one-sided test/malformed value
   * is still preserved through validation so the renderer can fail closed.
   */
  forestLayout?: unknown;
  /** Paired public rows; absent or incompatible data renders no trees. */
  forestTrees?: readonly unknown[];
  /** Paired public canonical water projection; malformed data stays present-invalid. */
  waterLayout?: unknown;
  waterBodies?: readonly unknown[];
  waterCells?: readonly unknown[];
  realmEnvironment?: unknown;
  /** Optional v11 policy row; absence keeps the exact active Water v1 view. */
  waterRevision?: unknown;
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
  resources?: ReadyRealmResourcePresentation;
  /** Caller-only, exact procedure projection for the active Gold expedition. */
  goldExpedition?: ReadyGoldExpeditionPresentation;
  /** Caller-only, exact procedure projection for the active Food expedition. */
  foodExpedition?: ReadyFoodExpeditionPresentation;
  /** Caller-only, exact procedure projection for the active Wood expedition. */
  woodExpedition?: ReadyWoodExpeditionPresentation;
  /** Caller-only, exact procedure projection for the active Stone expedition. */
  stoneExpedition?: ReadyStoneExpeditionPresentation;
  /** Caller-private generic roster, never copied into the public snapshot. */
  workerRoster?: WorkerRosterPresentation;
  /** v2 resource balances used by the active worker HUD. */
  workerResourceState?: ReadyWorkerResourceState;
  workerProjection?: ReadyWorkerProjection;
}>;

export const IDLE_WARPKEEP_BACKEND_STATE: WarpkeepBackendState = Object.freeze({
  phase: 'idle'
});

export type WarpkeepBackendErrorCode = 'unconfigured' | 'unreachable' | 'unexpected';

export type WarpkeepBackendError = Readonly<{
  code: WarpkeepBackendErrorCode;
}>;
