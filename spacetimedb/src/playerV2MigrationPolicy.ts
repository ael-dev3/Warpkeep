export type LegacyPlayerFixture<Identity, JoinedAt> = Readonly<{
  fid: bigint;
  identity: Identity;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  joinedAt: JoinedAt;
  status: string;
}>;

export type PlayerV2Fixture<JoinedAt> = Readonly<{
  fid: bigint;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  joinedAt: JoinedAt;
  status: string;
}>;

export type PlayerOwnershipV2Fixture<Identity> = Readonly<{
  fid: bigint;
  identity: Identity;
}>;

export class PlayerV2MigrationIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'PlayerV2MigrationIntegrityError';
  }
}

export type PlayerV2ReconciliationPlan<Identity, JoinedAt> = Readonly<{
  classification: 'empty' | 'requires_reconciliation' | 'already_reconciled';
  legacyRows: number;
  retainedV2Rows: number;
  insertPlayersV2: readonly PlayerV2Fixture<JoinedAt>[];
  insertOwnershipsV2: readonly PlayerOwnershipV2Fixture<Identity>[];
}>;

function projectionFor<Identity, JoinedAt>(
  row: LegacyPlayerFixture<Identity, JoinedAt>,
): PlayerV2Fixture<JoinedAt> {
  return {
    fid: row.fid,
    username: row.username,
    displayName: row.displayName,
    pfpUrl: row.pfpUrl,
    joinedAt: row.joinedAt,
    status: row.status,
  };
}

function projectionsMatch<JoinedAt>(
  left: PlayerV2Fixture<JoinedAt>,
  right: PlayerV2Fixture<JoinedAt>,
): boolean {
  return left.fid === right.fid
    && left.username === right.username
    && left.displayName === right.displayName
    && left.pfpUrl === right.pfpUrl
    && left.joinedAt === right.joinedAt
    && left.status === right.status;
}

function uniqueByFid<Row extends { fid: bigint }>(rows: readonly Row[], code: string) {
  const result = new Map<bigint, Row>();
  for (const row of rows) {
    if (result.has(row.fid)) throw new PlayerV2MigrationIntegrityError(code);
    result.set(row.fid, row);
  }
  return result;
}

/**
 * Pure, offline reconciliation planner for synthetic/disaster-recovery tests.
 * It is intentionally not exported as a reducer and is never invoked by the
 * empty-production publication path. Any existing one-sided or conflicting
 * v2 state stops instead of being silently repaired.
 */
export function planPlayerV2Reconciliation<Identity, JoinedAt>(
  legacyRows: readonly LegacyPlayerFixture<Identity, JoinedAt>[],
  playerRowsV2: readonly PlayerV2Fixture<JoinedAt>[],
  ownershipRowsV2: readonly PlayerOwnershipV2Fixture<Identity>[],
  identityKey: (identity: Identity) => string,
): PlayerV2ReconciliationPlan<Identity, JoinedAt> {
  const legacyByFid = uniqueByFid(legacyRows, 'DUPLICATE_LEGACY_FID');
  const playersByFid = uniqueByFid(playerRowsV2, 'DUPLICATE_PLAYER_V2_FID');
  const ownershipsByFid = uniqueByFid(ownershipRowsV2, 'DUPLICATE_OWNERSHIP_V2_FID');
  const seenIdentities = new Set<string>();
  for (const row of ownershipRowsV2) {
    const key = identityKey(row.identity);
    if (seenIdentities.has(key)) {
      throw new PlayerV2MigrationIntegrityError('DUPLICATE_OWNERSHIP_V2_IDENTITY');
    }
    seenIdentities.add(key);
  }

  for (const fid of new Set([...playersByFid.keys(), ...ownershipsByFid.keys()])) {
    if (!playersByFid.has(fid) || !ownershipsByFid.has(fid)) {
      throw new PlayerV2MigrationIntegrityError('PARTIAL_PLAYER_V2_PAIR');
    }
  }

  const insertPlayersV2: PlayerV2Fixture<JoinedAt>[] = [];
  const insertOwnershipsV2: PlayerOwnershipV2Fixture<Identity>[] = [];
  const plannedIdentityKeys = new Set(seenIdentities);

  for (const legacy of legacyRows) {
    const expectedPlayer = projectionFor(legacy);
    const expectedIdentityKey = identityKey(legacy.identity);
    const existingPlayer = playersByFid.get(legacy.fid);
    const existingOwnership = ownershipsByFid.get(legacy.fid);

    if ((existingPlayer === undefined) !== (existingOwnership === undefined)) {
      throw new PlayerV2MigrationIntegrityError('PARTIAL_PLAYER_V2_PAIR');
    }
    if (existingPlayer !== undefined && existingOwnership !== undefined) {
      if (!projectionsMatch(existingPlayer, expectedPlayer)) {
        throw new PlayerV2MigrationIntegrityError('PLAYER_V2_PROJECTION_MISMATCH');
      }
      if (identityKey(existingOwnership.identity) !== expectedIdentityKey) {
        throw new PlayerV2MigrationIntegrityError('PLAYER_V2_IDENTITY_MISMATCH');
      }
      continue;
    }

    if (plannedIdentityKeys.has(expectedIdentityKey)) {
      throw new PlayerV2MigrationIntegrityError('DUPLICATE_LEGACY_IDENTITY');
    }
    plannedIdentityKeys.add(expectedIdentityKey);
    insertPlayersV2.push(expectedPlayer);
    insertOwnershipsV2.push({ fid: legacy.fid, identity: legacy.identity });
  }

  if (legacyByFid.size === 0) {
    return {
      classification: 'empty',
      legacyRows: 0,
      retainedV2Rows: playersByFid.size,
      insertPlayersV2,
      insertOwnershipsV2,
    };
  }
  return {
    classification: insertPlayersV2.length === 0
      ? 'already_reconciled'
      : 'requires_reconciliation',
    legacyRows: legacyByFid.size,
    retainedV2Rows: playersByFid.size,
    insertPlayersV2,
    insertOwnershipsV2,
  };
}

export type AdditiveV2PublicationCounts = Readonly<{
  worldTiles: bigint;
  legacyPlayers: bigint;
  playersV2: bigint;
  playerOwnershipsV2: bigint;
  orphanedPlayerRowsV2: bigint;
  orphanedOwnershipRowsV2: bigint;
  castles: bigint;
  allowedFids: bigint;
  enabledAllowedFids: bigint;
}>;

/** The only approved production publication state is the empty alpha baseline. */
export function classifyAdditiveV2PublicationState(
  counts: AdditiveV2PublicationCounts,
): 'ready' | 'legacy_reconciliation_required' | 'unexpected_v2_state' | 'unexpected_alpha_state' {
  if (counts.legacyPlayers !== 0n) return 'legacy_reconciliation_required';
  if (
    counts.playersV2 !== 0n
    || counts.playerOwnershipsV2 !== 0n
    || counts.orphanedPlayerRowsV2 !== 0n
    || counts.orphanedOwnershipRowsV2 !== 0n
  ) return 'unexpected_v2_state';
  if (
    counts.worldTiles !== 61n
    || counts.castles !== 0n
    || counts.allowedFids !== 0n
    || counts.enabledAllowedFids !== 0n
  ) return 'unexpected_alpha_state';
  return 'ready';
}
