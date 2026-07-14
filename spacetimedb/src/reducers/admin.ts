import { SenderError, t } from 'spacetimedb/server';

import {
  AuthEpochExhaustedError,
  executeAllowFidTransition,
} from '../adminPolicy';
import {
  InvalidAdmissionEpochStateError,
  resolveAuthResolverAdmission,
} from '../admissionPolicy';
import {
  MAX_AUTH_EPOCH,
  WARPKEEP_BACKEND_PROTOCOL_VERSION,
} from '../config';
import {
  assertGenesisFounderForFid,
  ensureGenesisFounder,
} from '../foundingAuthority';
import {
  ETHEREUM_MAINNET_CHAIN_ID,
  MarksAuthorityPolicyError,
  SNAP_APPROVED_IMPLEMENTATION,
  SNAP_APPROVED_IMPLEMENTATION_CODE_HASH,
  SNAP_APPROVED_PROXY_CODE_HASH,
  SNAP_MARK_POLICY_VERSION,
  SNAP_PROXY_ADDRESS,
  SNAP_PROXY_DEPLOYMENT_BLOCK,
  WARPKEEP_ALPHA_TERMS_VERSION,
  applyOneToOneBurnCredit,
  markAccountIsConsistent,
  normalizeSnapBurnCredit,
  snapBurnCreditsEqual,
} from '../marksAuthorityPolicy';
import {
  FARCASTER_PROFILE_POLICY_VERSION,
  FARCASTER_WALLET_POLICY_VERSION,
  ProfileAuthorityPolicyError,
  normalizeTrustedPublicProfile,
  normalizeTrustedWalletAttribution,
  trustedProfilesEqual,
} from '../profileAuthorityPolicy';
import {
  FIRST_SCAN_PREVIOUS_BLOCK,
  MAX_U32,
  MAX_U64,
  SNAP_SCAN_CURSOR_KEY,
  ScanBatchPolicyError,
  WALLET_SNAPSHOT_KEY,
  applyScanBatchCredit,
  normalizePrivateStateId,
  normalizeScanBatchPlan,
  planWalletSnapshotTransition,
  scanBatchReadyToFinalize,
} from '../scanBatchPolicy';
import {
  requireAdmin,
  requireAuthEpochResolver,
  requireSupportedFid,
  requireWarpkeepMetadataConnection,
} from '../auth';
import warpkeep from '../schema';
import { seedCanonicalWorld } from './worldSeed';
import { HEGEMONY_GENESIS_001, HEGEMONY_WORLD_SEED } from '../world';
import { worldCastleGraphIsConsistent } from '../worldCastleIntegrity';
import {
  GenesisWorldDriftError,
  planCanonicalWorldSeed,
} from '../worldSeedPolicy';

function cleanAdminNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length > 512) {
    throw new SenderError('NOTE_TOO_LONG');
  }
  return trimmed;
}

function audit(
  ctx: Parameters<typeof requireAdmin>[0],
  action: string,
  targetFid: bigint | undefined,
  actorSubject: string,
  note: string,
): void {
  ctx.db.adminAudit.insert({
    id: 0n,
    action,
    targetFid,
    actorSubject,
    createdAt: ctx.timestamp,
    note,
  });
}

type AdminContext = Parameters<typeof requireAdmin>[0];

type WalletSnapshotLike = Readonly<{
  generation: bigint;
  snapshotId: string;
  attributionCount: number;
  policyVersion: string;
}>;

type ScanBatchLike = Readonly<{
  batchId: string;
  cursorKey: string;
  status: string;
  previousFinalizedBlock: bigint;
  previousFinalizedBlockHash: string;
  throughFinalizedBlock: bigint;
  throughFinalizedBlockHash: string;
  walletSnapshotGeneration: bigint;
  walletSnapshotId: string;
  walletAttributionCount: number;
  expectedCredits: number;
  expectedMicros: bigint;
  appliedCredits: number;
  appliedMicros: bigint;
  proxyCodeHash: string;
  implementationAddress: string;
  implementationCodeHash: string;
  finalizedAt?: unknown;
}>;

type NormalizedWalletSnapshotEntry = Readonly<{
  attributionKey: string;
  fid: bigint;
  address: string;
  addressType: string;
  source: string;
  attributionPolicyVersion: string;
  active: boolean;
}>;

function senderPolicyError(error: unknown): never {
  if (
    error instanceof MarksAuthorityPolicyError
    || error instanceof ProfileAuthorityPolicyError
    || error instanceof ScanBatchPolicyError
  ) throw new SenderError(error.code);
  throw error;
}

function normalizePrivateId(value: string, code: string): string {
  try {
    return normalizePrivateStateId(value, code);
  } catch (error) {
    return senderPolicyError(error);
  }
}

function walletSnapshotRowsReconcile(
  ctx: AdminContext,
  snapshot: Pick<WalletSnapshotLike, 'generation' | 'attributionCount'>,
): boolean {
  let count = 0;
  for (const row of ctx.db.fidWalletAttributionV1.bySnapshotAndAddress.filter(
    snapshot.generation,
  )) {
    if (row.snapshotGeneration !== snapshot.generation) return false;
    count += 1;
    if (count > MAX_U32) return false;
  }
  return count === snapshot.attributionCount;
}

function currentSnapshotMatchesBatch(
  ctx: AdminContext,
  batch: ScanBatchLike,
  verifyRows = false,
): boolean {
  const snapshot = ctx.db.walletAttributionSnapshotV1.snapshotKey.find(WALLET_SNAPSHOT_KEY);
  return snapshot !== null
    && snapshot.generation === batch.walletSnapshotGeneration
    && snapshot.snapshotId === batch.walletSnapshotId
    && snapshot.attributionCount === batch.walletAttributionCount
    && snapshot.policyVersion === FARCASTER_WALLET_POLICY_VERSION
    && (!verifyRows || walletSnapshotRowsReconcile(ctx, snapshot));
}

function cursorIsAtBatchPrevious(ctx: AdminContext, batch: ScanBatchLike): boolean {
  const cursor = ctx.db.snapScanCursorV1.cursorKey.find(SNAP_SCAN_CURSOR_KEY);
  if (cursor === null) {
    return batch.previousFinalizedBlock === FIRST_SCAN_PREVIOUS_BLOCK;
  }
  return cursor.chainId === ETHEREUM_MAINNET_CHAIN_ID
    && cursor.tokenContract === SNAP_PROXY_ADDRESS
    && cursor.policyVersion === SNAP_MARK_POLICY_VERSION
    && cursor.deploymentStartBlock === SNAP_PROXY_DEPLOYMENT_BLOCK
    && cursor.lastFinalizedBlock === batch.previousFinalizedBlock
    && cursor.lastFinalizedBlockHash === batch.previousFinalizedBlockHash
    && cursor.proxyCodeHash === SNAP_APPROVED_PROXY_CODE_HASH
    && cursor.implementationAddress === SNAP_APPROVED_IMPLEMENTATION
    && cursor.implementationCodeHash === SNAP_APPROVED_IMPLEMENTATION_CODE_HASH;
}

function cursorHasFinalizedBatch(ctx: AdminContext, batch: ScanBatchLike): boolean {
  const cursor = ctx.db.snapScanCursorV1.cursorKey.find(SNAP_SCAN_CURSOR_KEY);
  if (
    cursor === null
    || cursor.chainId !== ETHEREUM_MAINNET_CHAIN_ID
    || cursor.tokenContract !== SNAP_PROXY_ADDRESS
    || cursor.policyVersion !== SNAP_MARK_POLICY_VERSION
    || cursor.deploymentStartBlock !== SNAP_PROXY_DEPLOYMENT_BLOCK
    || cursor.proxyCodeHash !== SNAP_APPROVED_PROXY_CODE_HASH
    || cursor.implementationAddress !== SNAP_APPROVED_IMPLEMENTATION
    || cursor.implementationCodeHash !== SNAP_APPROVED_IMPLEMENTATION_CODE_HASH
    || cursor.walletSnapshotGeneration <= 0n
    || cursor.walletSnapshotGeneration > MAX_U64
    || cursor.lastFinalizedBlock < batch.throughFinalizedBlock
  ) return false;
  try {
    if (
      normalizePrivateStateId(cursor.walletSnapshotId, 'SCAN_CURSOR_SNAPSHOT_INVALID')
      !== cursor.walletSnapshotId
    ) return false;
  } catch {
    return false;
  }
  if (cursor.lastFinalizedBlock > batch.throughFinalizedBlock) return true;
  return cursor.lastFinalizedBlockHash === batch.throughFinalizedBlockHash
    && cursor.walletSnapshotGeneration === batch.walletSnapshotGeneration
    && cursor.walletSnapshotId === batch.walletSnapshotId;
}

function aggregateBatchReceipts(ctx: AdminContext, batchId: string): Readonly<{
  receiptCredits: number;
  receiptMicros: bigint;
  creditedAccounts: number;
}> {
  let receiptCredits = 0;
  let receiptMicros = 0n;
  const creditedFids = new Set<bigint>();
  for (const receipt of ctx.db.snapBurnCreditV1.batchId.filter(batchId)) {
    receiptCredits += 1;
    receiptMicros += receipt.amountMicros;
    creditedFids.add(receipt.attributedFid);
    if (receiptCredits > MAX_U32) throw new SenderError('SCAN_BATCH_RECEIPT_OVERFLOW');
  }
  return Object.freeze({
    receiptCredits,
    receiptMicros,
    creditedAccounts: creditedFids.size,
  });
}

const adminAlphaStatus = t.object('AdminAlphaStatus', {
  worldTiles: t.u64(),
  players: t.u64(),
  castles: t.u64(),
  allowedFids: t.u64(),
  enabledAllowedFids: t.u64(),
  auditEntries: t.u64(),
});

const adminAlphaStatusV2 = t.object('AdminAlphaStatusV2', {
  worldTiles: t.u64(),
  legacyPlayers: t.u64(),
  playersV2: t.u64(),
  playerOwnershipsV2: t.u64(),
  consistentPlayerPairsV2: t.u64(),
  orphanedPlayerRowsV2: t.u64(),
  orphanedOwnershipRowsV2: t.u64(),
  castles: t.u64(),
  allowedFids: t.u64(),
  enabledAllowedFids: t.u64(),
  auditEntries: t.u64(),
  protocolVersion: t.u32(),
  worldSeed: t.u32(),
  worldSeedName: t.string(),
});

const adminAlphaStatusV3 = t.object('AdminAlphaStatusV3', {
  worldTiles: t.u64(),
  occupiedWorldTiles: t.u64(),
  worldTileMeta: t.u64(),
  realms: t.u64(),
  castleSlots: t.u64(),
  castleSlotClaims: t.u64(),
  legacyPlayers: t.u64(),
  playersV2: t.u64(),
  playerOwnershipsV2: t.u64(),
  castles: t.u64(),
  realmProfiles: t.u64(),
  markAccounts: t.u64(),
  snapBurnCredits: t.u64(),
  walletAttributions: t.u64(),
  walletAttributionSnapshots: t.u64(),
  scanCursors: t.u64(),
  scanBatches: t.u64(),
  alphaTermsAcceptances: t.u64(),
  allowedFids: t.u64(),
  enabledAllowedFids: t.u64(),
  auditEntries: t.u64(),
  orphanedPlayerRowsV2: t.u64(),
  orphanedOwnershipRowsV2: t.u64(),
  orphanedCastleClaims: t.u64(),
  orphanedCastles: t.u64(),
  orphanedRealmProfiles: t.u64(),
  orphanedMarkAccounts: t.u64(),
  orphanedBurnCredits: t.u64(),
  orphanedTermsAcceptances: t.u64(),
  founderStateGaps: t.u64(),
  markAccountInvariantViolations: t.u64(),
  publicMarkProjectionViolations: t.u64(),
  duplicateBurnReferences: t.u64(),
  burnAccountReconciliationViolations: t.u64(),
  ambiguousActiveWalletAddresses: t.u64(),
  staticWorldDriftViolations: t.u64(),
  termsAcceptanceInvariantViolations: t.u64(),
  protocolVersion: t.u32(),
  worldSeed: t.u32(),
  worldSeedName: t.string(),
});

const alphaBackendInfo = t.object('AlphaBackendInfo', {
  protocolVersion: t.u32(),
  worldSeed: t.u32(),
  worldSeedName: t.string(),
});

const authResolverFidAdmissionV2 = t.object('AuthResolverFidAdmissionV2', {
  state: t.string(),
  authEpoch: t.u32(),
});

const walletSnapshotEntryV1 = t.object('WalletSnapshotEntryV1', {
  attributionKey: t.string(),
  fid: t.u64(),
  address: t.string(),
  addressType: t.string(),
  source: t.string(),
  attributionPolicyVersion: t.string(),
  active: t.bool(),
});

const adminSnapScanBatchAggregateV1 = t.object('AdminSnapScanBatchAggregateV1', {
  status: t.string(),
  expectedCredits: t.u32(),
  expectedMicros: t.u128(),
  appliedCredits: t.u32(),
  appliedMicros: t.u128(),
  receiptCredits: t.u32(),
  receiptMicros: t.u128(),
  creditedAccounts: t.u32(),
  cursorAdvanced: t.bool(),
  internallyConsistent: t.bool(),
});

/**
 * Safe for ordinary permitted connections. The QA snapshot principal is
 * intentionally rejected so it has exactly one callable procedure.
 */
export const getAlphaBackendInfo = warpkeep.procedure(
  { name: 'get_alpha_backend_info' },
  alphaBackendInfo,
  ctx =>
    ctx.withTx(tx => {
      requireWarpkeepMetadataConnection(tx);
      return {
        protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
        worldSeed: HEGEMONY_WORLD_SEED,
        worldSeedName: HEGEMONY_GENESIS_001,
      };
    }),
);

/**
 * Hermes-only inspection surface. It reports aggregate counts only, never
 * whitelist rows, player identities, token claims, or audit contents.
 */
export const adminGetAlphaStatus = warpkeep.procedure(
  { name: 'admin_get_alpha_status' },
  adminAlphaStatus,
  ctx =>
    ctx.withTx(tx => {
      requireAdmin(tx);

      let enabledAllowedFids = 0n;
      for (const row of tx.db.allowedFid.iter()) {
        if (row.enabled) enabledAllowedFids += 1n;
      }

      return {
        worldTiles: tx.db.worldTile.count(),
        players: tx.db.player.count(),
        castles: tx.db.castle.count(),
        allowedFids: tx.db.allowedFid.count(),
        enabledAllowedFids,
        auditEntries: tx.db.adminAudit.count(),
      };
    }),
);

/**
 * Protocol-v2 aggregate inspection. It exposes counts and static compatibility
 * state only, including enough pair counts to reveal one-sided v2 rows without
 * disclosing a FID, Identity, profile, note, or audit entry.
 */
export const adminGetAlphaStatusV2 = warpkeep.procedure(
  { name: 'admin_get_alpha_status_v2' },
  adminAlphaStatusV2,
  ctx =>
    ctx.withTx(tx => {
      requireAdmin(tx);
      if (!worldCastleGraphIsConsistent(tx.db.worldTile.iter(), tx.db.castle.iter())) {
        throw new SenderError('STATE_INTEGRITY');
      }

      let enabledAllowedFids = 0n;
      for (const row of tx.db.allowedFid.iter()) {
        if (row.enabled) enabledAllowedFids += 1n;
      }

      let consistentPlayerPairsV2 = 0n;
      let orphanedPlayerRowsV2 = 0n;
      for (const row of tx.db.playerV2.iter()) {
        if (tx.db.playerOwnershipV2.fid.find(row.fid) === null) {
          orphanedPlayerRowsV2 += 1n;
        } else {
          consistentPlayerPairsV2 += 1n;
        }
      }

      let orphanedOwnershipRowsV2 = 0n;
      for (const row of tx.db.playerOwnershipV2.iter()) {
        if (tx.db.playerV2.fid.find(row.fid) === null) {
          orphanedOwnershipRowsV2 += 1n;
        }
      }

      return {
        worldTiles: tx.db.worldTile.count(),
        legacyPlayers: tx.db.player.count(),
        playersV2: tx.db.playerV2.count(),
        playerOwnershipsV2: tx.db.playerOwnershipV2.count(),
        consistentPlayerPairsV2,
        orphanedPlayerRowsV2,
        orphanedOwnershipRowsV2,
        castles: tx.db.castle.count(),
        allowedFids: tx.db.allowedFid.count(),
        enabledAllowedFids,
        auditEntries: tx.db.adminAudit.count(),
        protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
        worldSeed: HEGEMONY_WORLD_SEED,
        worldSeedName: HEGEMONY_GENESIS_001,
      };
    }),
);

/**
 * Protocol-v3 inspection remains counts-only. It exposes enough reconciliation
 * counters to stop a migration or operator run without disclosing a FID,
 * Identity, profile value, wallet address, event receipt, or audit note.
 */
export const adminGetAlphaStatusV3 = warpkeep.procedure(
  { name: 'admin_get_alpha_status_v3' },
  adminAlphaStatusV3,
  ctx =>
    ctx.withTx(tx => {
      requireAdmin(tx);

      let staticWorldDriftViolations = 0n;
      try {
        planCanonicalWorldSeed({
          worldTiles: tx.db.worldTile.iter(),
          realms: tx.db.realmV1.iter(),
          worldMeta: tx.db.worldTileMetaV1.iter(),
          castleSlots: tx.db.castleSlotV1.iter(),
        });
      } catch (error) {
        if (error instanceof GenesisWorldDriftError) staticWorldDriftViolations = 1n;
        else throw error;
      }

      let occupiedWorldTiles = 0n;
      for (const tile of tx.db.worldTile.iter()) {
        if (tile.occupantCastleId !== undefined) occupiedWorldTiles += 1n;
      }

      let enabledAllowedFids = 0n;
      let founderStateGaps = 0n;
      for (const row of tx.db.allowedFid.iter()) {
        if (row.enabled) enabledAllowedFids += 1n;
        if (
          tx.db.castle.ownerFid.find(row.fid) === null
          || tx.db.castleSlotClaimV1.ownerFid.find(row.fid) === null
          || tx.db.realmProfileV1.fid.find(row.fid) === null
          || tx.db.markAccountV1.fid.find(row.fid) === null
        ) founderStateGaps += 1n;
      }

      let orphanedPlayerRowsV2 = 0n;
      for (const row of tx.db.playerV2.iter()) {
        if (
          tx.db.playerOwnershipV2.fid.find(row.fid) === null
          || tx.db.allowedFid.fid.find(row.fid) === null
        ) orphanedPlayerRowsV2 += 1n;
      }
      let orphanedOwnershipRowsV2 = 0n;
      for (const row of tx.db.playerOwnershipV2.iter()) {
        if (
          tx.db.playerV2.fid.find(row.fid) === null
          || tx.db.allowedFid.fid.find(row.fid) === null
        ) orphanedOwnershipRowsV2 += 1n;
      }

      let orphanedCastleClaims = 0n;
      for (const claim of tx.db.castleSlotClaimV1.iter()) {
        const slot = tx.db.castleSlotV1.slotId.find(claim.slotId);
        const castle = tx.db.castle.castleId.find(claim.castleId);
        const tile = slot === null ? null : tx.db.worldTile.key.find(slot.tileKey);
        if (
          slot === null
          || castle === null
          || tile === null
          || castle.ownerFid !== claim.ownerFid
          || castle.tileKey !== slot.tileKey
          || castle.q !== slot.q
          || castle.r !== slot.r
          || tile.occupantCastleId !== claim.castleId
        ) orphanedCastleClaims += 1n;
      }
      let orphanedCastles = 0n;
      for (const row of tx.db.castle.iter()) {
        if (tx.db.castleSlotClaimV1.castleId.find(row.castleId) === null) orphanedCastles += 1n;
      }

      let orphanedRealmProfiles = 0n;
      let publicMarkProjectionViolations = 0n;
      for (const profile of tx.db.realmProfileV1.iter()) {
        const account = tx.db.markAccountV1.fid.find(profile.fid);
        if (
          tx.db.allowedFid.fid.find(profile.fid) === null
          || tx.db.castle.ownerFid.find(profile.fid) === null
        ) orphanedRealmProfiles += 1n;
        const hiddenProjectionClean = profile.totalSnapBurnedMicros === undefined
          && profile.marksEarnedMicros === undefined
          && profile.marksSpentMicros === undefined
          && profile.marksBalanceMicros === undefined
          && profile.marksPolicyVersion === undefined;
        const visibleProjectionMatches = account !== null
          && profile.firstAuthenticatedAt !== undefined
          && tx.db.alphaTermsAcceptanceV1.acceptanceKey.find(
            `${profile.fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`,
          )?.termsVersion === WARPKEEP_ALPHA_TERMS_VERSION
          && profile.totalSnapBurnedMicros === account.totalSnapBurnedMicros
          && profile.marksEarnedMicros === account.earnedMicros
          && profile.marksSpentMicros === account.spentMicros
          && profile.marksBalanceMicros === account.balanceMicros
          && profile.marksPolicyVersion === account.policyVersion;
        if (
          (!profile.communityStatsVisible && !hiddenProjectionClean)
          || (profile.communityStatsVisible && !visibleProjectionMatches)
        ) publicMarkProjectionViolations += 1n;
      }

      let orphanedMarkAccounts = 0n;
      let markAccountInvariantViolations = 0n;
      for (const account of tx.db.markAccountV1.iter()) {
        if (
          tx.db.allowedFid.fid.find(account.fid) === null
          || tx.db.realmProfileV1.fid.find(account.fid) === null
        ) orphanedMarkAccounts += 1n;
        if (!markAccountIsConsistent(account)) markAccountInvariantViolations += 1n;
      }

      let orphanedTermsAcceptances = 0n;
      let termsAcceptanceInvariantViolations = 0n;
      for (const acceptance of tx.db.alphaTermsAcceptanceV1.iter()) {
        if (
          acceptance.fid === 0n
          || acceptance.termsVersion.trim() === ''
          || acceptance.termsVersion.length > 64
          || acceptance.acceptanceKey !== `${acceptance.fid}:${acceptance.termsVersion}`
        ) termsAcceptanceInvariantViolations += 1n;
        if (
          tx.db.allowedFid.fid.find(acceptance.fid) === null
          || tx.db.playerV2.fid.find(acceptance.fid) === null
          || tx.db.playerOwnershipV2.fid.find(acceptance.fid) === null
          || tx.db.realmProfileV1.fid.find(acceptance.fid) === null
          || tx.db.markAccountV1.fid.find(acceptance.fid) === null
        ) orphanedTermsAcceptances += 1n;
      }

      const burnTotals = new Map<bigint, bigint>();
      const burnReferences = new Set<string>();
      let orphanedBurnCredits = 0n;
      let duplicateBurnReferences = 0n;
      for (const receipt of tx.db.snapBurnCreditV1.iter()) {
        if (
          tx.db.markAccountV1.fid.find(receipt.attributedFid) === null
          || tx.db.snapScanBatchV1.batchId.find(receipt.batchId) === null
        ) {
          orphanedBurnCredits += 1n;
        }
        if (burnReferences.has(receipt.burnReference)) duplicateBurnReferences += 1n;
        burnReferences.add(receipt.burnReference);
        burnTotals.set(
          receipt.attributedFid,
          (burnTotals.get(receipt.attributedFid) ?? 0n) + receipt.amountMicros,
        );
      }
      let burnAccountReconciliationViolations = 0n;
      for (const account of tx.db.markAccountV1.iter()) {
        if ((burnTotals.get(account.fid) ?? 0n) !== account.totalSnapBurnedMicros) {
          burnAccountReconciliationViolations += 1n;
        }
      }

      const activeWalletFids = new Map<string, Set<bigint>>();
      const currentWalletSnapshot = tx.db.walletAttributionSnapshotV1.snapshotKey.find(
        WALLET_SNAPSHOT_KEY,
      );
      if (currentWalletSnapshot !== null) {
        for (const row of tx.db.fidWalletAttributionV1.bySnapshotAndAddress.filter(
          currentWalletSnapshot.generation,
        )) {
          if (!row.active) continue;
          const fids = activeWalletFids.get(row.address) ?? new Set<bigint>();
          fids.add(row.fid);
          activeWalletFids.set(row.address, fids);
        }
      }
      let ambiguousActiveWalletAddresses = 0n;
      for (const fids of activeWalletFids.values()) {
        if (fids.size > 1) ambiguousActiveWalletAddresses += 1n;
      }

      return {
        worldTiles: tx.db.worldTile.count(),
        occupiedWorldTiles,
        worldTileMeta: tx.db.worldTileMetaV1.count(),
        realms: tx.db.realmV1.count(),
        castleSlots: tx.db.castleSlotV1.count(),
        castleSlotClaims: tx.db.castleSlotClaimV1.count(),
        legacyPlayers: tx.db.player.count(),
        playersV2: tx.db.playerV2.count(),
        playerOwnershipsV2: tx.db.playerOwnershipV2.count(),
        castles: tx.db.castle.count(),
        realmProfiles: tx.db.realmProfileV1.count(),
        markAccounts: tx.db.markAccountV1.count(),
        snapBurnCredits: tx.db.snapBurnCreditV1.count(),
        walletAttributions: tx.db.fidWalletAttributionV1.count(),
        walletAttributionSnapshots: tx.db.walletAttributionSnapshotV1.count(),
        scanCursors: tx.db.snapScanCursorV1.count(),
        scanBatches: tx.db.snapScanBatchV1.count(),
        alphaTermsAcceptances: tx.db.alphaTermsAcceptanceV1.count(),
        allowedFids: tx.db.allowedFid.count(),
        enabledAllowedFids,
        auditEntries: tx.db.adminAudit.count(),
        orphanedPlayerRowsV2,
        orphanedOwnershipRowsV2,
        orphanedCastleClaims,
        orphanedCastles,
        orphanedRealmProfiles,
        orphanedMarkAccounts,
        orphanedBurnCredits,
        orphanedTermsAcceptances,
        founderStateGaps,
        markAccountInvariantViolations,
        publicMarkProjectionViolations,
        duplicateBurnReferences,
        burnAccountReconciliationViolations,
        ambiguousActiveWalletAddresses,
        staticWorldDriftViolations,
        termsAcceptanceInvariantViolations,
        protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
        worldSeed: HEGEMONY_WORLD_SEED,
        worldSeedName: HEGEMONY_GENESIS_001,
      };
    }),
);

/**
 * Bridge/Hermes can resolve the currently valid player-token epoch without
 * learning whitelist contents. Missing rows intentionally return baseline 0.
 */
export const adminGetFidAuthEpoch = warpkeep.procedure(
  { name: 'admin_get_fid_auth_epoch' },
  { fid: t.u64() },
  t.u32(),
  (ctx, { fid }) =>
    ctx.withTx(tx => {
      requireAdmin(tx);
      requireSupportedFid(fid);
      return tx.db.allowedFid.fid.find(fid)?.authEpoch ?? 0;
    }),
);

/** Single-purpose resolver view; it reveals neither rows nor disabled epochs. */
export const authResolverGetFidAdmissionV2 = warpkeep.procedure(
  { name: 'auth_resolver_get_fid_admission_v2' },
  { fid: t.u64() },
  authResolverFidAdmissionV2,
  (ctx, { fid }) =>
    ctx.withTx(tx => {
      requireSupportedFid(fid);
      requireAuthEpochResolver(tx, fid);

      try {
        return resolveAuthResolverAdmission(tx.db.allowedFid.fid.find(fid));
      } catch (error) {
        if (error instanceof InvalidAdmissionEpochStateError) {
          throw new SenderError(error.message);
        }
        throw error;
      }
    }),
);

/** Protected and idempotent canonical world seeding. */
export const adminSeedWorld = warpkeep.reducer(
  { name: 'admin_seed_world' },
  ctx => {
    const admin = requireAdmin(ctx);
    seedCanonicalWorld(ctx);
    // A partial recovery seed may fill missing canonical tiles, but it must not
    // commit if an existing castle still lacks the exact reverse occupancy
    // link. Reducer atomicity rolls every inserted tile back on this failure.
    if (!worldCastleGraphIsConsistent(ctx.db.worldTile.iter(), ctx.db.castle.iter())) {
      throw new SenderError('STATE_INTEGRITY');
    }
    audit(ctx, 'seed_world', undefined, admin.subject, 'genesis-001-generation-v2-radius-20');
  },
);

/**
 * First admission starts at epoch 1. Repeating an enabled allow is idempotent,
 * while re-enabling a disabled row rotates exactly once before it becomes live.
 */
export const adminAllowFid = warpkeep.reducer(
  { name: 'admin_allow_fid' },
  { fid: t.u64(), note: t.string() },
  (ctx, { fid, note }) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(fid);
    const cleanNote = cleanAdminNote(note);
    const existing = ctx.db.allowedFid.fid.find(fid);
    // Exhaustion must fail before any table or audit callback runs.
    try {
      executeAllowFidTransition(existing, {
        insert: plan => {
          ctx.db.allowedFid.insert({
            fid,
            enabled: plan.enabled,
            authEpoch: plan.authEpoch,
            invitedAt: ctx.timestamp,
            invitedBy: admin.subject,
            note: cleanNote,
          });
        },
        enabled: plan => {
          if (existing !== null && existing.note !== cleanNote) {
            ctx.db.allowedFid.fid.update({
              ...existing,
              enabled: plan.enabled,
              authEpoch: plan.authEpoch,
              note: cleanNote,
            });
          }
        },
        reenabled: plan => {
          if (existing === null) throw new Error('ALLOW_FID_POLICY_INVARIANT');
          ctx.db.allowedFid.fid.update({
            ...existing,
            enabled: plan.enabled,
            authEpoch: plan.authEpoch,
            note: cleanNote,
          });
        },
        audit: () => audit(ctx, 'allow_fid', fid, admin.subject, cleanNote),
      });
      ensureGenesisFounder(ctx, fid);
    } catch (error) {
      if (error instanceof AuthEpochExhaustedError) {
        throw new SenderError(error.message);
      }
      throw error;
    }
  },
);

/** Trusted local-operator profile projection; never accepts browser claims. */
export const adminUpsertRealmProfileV1 = warpkeep.reducer(
  { name: 'admin_upsert_realm_profile_v1' },
  {
    fid: t.u64(),
    canonicalUsername: t.option(t.string()),
    displayName: t.option(t.string()),
    pfpUrl: t.option(t.string()),
    publicBio: t.option(t.string()),
    profilePolicyVersion: t.string(),
  },
  (ctx, input) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(input.fid);
    if (input.profilePolicyVersion !== FARCASTER_PROFILE_POLICY_VERSION) {
      throw new SenderError('PROFILE_POLICY_MISMATCH');
    }
    assertGenesisFounderForFid(ctx, input.fid);

    let normalized;
    try {
      normalized = normalizeTrustedPublicProfile(input);
    } catch (error) {
      if (error instanceof ProfileAuthorityPolicyError) throw new SenderError(error.code);
      throw error;
    }
    const existing = ctx.db.realmProfileV1.fid.find(input.fid);
    if (existing === null) throw new SenderError('STATE_INTEGRITY');
    if (trustedProfilesEqual(existing, normalized)) return;

    ctx.db.realmProfileV1.fid.update({
      ...existing,
      ...normalized,
      profileUpdatedAt: ctx.timestamp,
    });
    audit(
      ctx,
      'profile_snapshot_v1',
      input.fid,
      admin.subject,
      FARCASTER_PROFILE_POLICY_VERSION,
    );
  },
);

/** Retired single-row mutation path; complete snapshots are required. */
export const adminUpsertFidWalletAttributionV1 = warpkeep.reducer(
  { name: 'admin_upsert_fid_wallet_attribution_v1' },
  {
    attributionKey: t.string(),
    fid: t.u64(),
    address: t.string(),
    addressType: t.string(),
    source: t.string(),
    attributionPolicyVersion: t.string(),
    active: t.bool(),
  },
  (ctx, _input) => {
    requireAdmin(ctx);
    throw new SenderError('WALLET_SNAPSHOT_REPLACEMENT_REQUIRED');
  },
);

/**
 * Atomically replaces the complete current attribution snapshot. Historical
 * generations remain immutable, and a pending scan freezes replacement.
 */
export const adminReplaceFidWalletSnapshotV1 = warpkeep.reducer(
  { name: 'admin_replace_fid_wallet_snapshot_v1' },
  {
    expectedGeneration: t.u64(),
    snapshotId: t.string(),
    entries: t.array(walletSnapshotEntryV1),
  },
  (ctx, input) => {
    const admin = requireAdmin(ctx);
    const existing = ctx.db.walletAttributionSnapshotV1.snapshotKey.find(WALLET_SNAPSHOT_KEY);
    const singletonCount = ctx.db.walletAttributionSnapshotV1.count();
    if (singletonCount > 1n || (singletonCount === 1n) !== (existing !== null)) {
      throw new SenderError('WALLET_SNAPSHOT_STATE_INTEGRITY');
    }

    let transition;
    try {
      transition = planWalletSnapshotTransition({
        existing,
        expectedGeneration: input.expectedGeneration,
        snapshotId: input.snapshotId,
        attributionCount: input.entries.length,
      });
    } catch (error) {
      return senderPolicyError(error);
    }

    const normalizedEntries: NormalizedWalletSnapshotEntry[] = [];
    const attributionKeys = new Set<string>();
    const semanticLinks = new Set<string>();
    for (const entry of input.entries) {
      requireSupportedFid(entry.fid);
      assertGenesisFounderForFid(ctx, entry.fid);
      const allowed = ctx.db.allowedFid.fid.find(entry.fid);
      if (allowed === null || !allowed.enabled) {
        throw new SenderError('WALLET_SNAPSHOT_FID_NOT_ADMITTED');
      }
      let normalized;
      try {
        normalized = normalizeTrustedWalletAttribution(entry);
      } catch (error) {
        return senderPolicyError(error);
      }
      if (!normalized.active) throw new SenderError('WALLET_SNAPSHOT_INACTIVE_ENTRY');
      if (attributionKeys.has(normalized.attributionKey)) {
        throw new SenderError('WALLET_SNAPSHOT_DUPLICATE_KEY');
      }
      const semanticLink = `${entry.fid}:${normalized.address}`;
      if (semanticLinks.has(semanticLink)) {
        throw new SenderError('WALLET_SNAPSHOT_DUPLICATE_LINK');
      }
      attributionKeys.add(normalized.attributionKey);
      semanticLinks.add(semanticLink);
      normalizedEntries.push(Object.freeze({ ...normalized, fid: entry.fid }));
    }

    if (transition.kind === 'retry') {
      if (existing === null || !walletSnapshotRowsReconcile(ctx, existing)) {
        throw new SenderError('WALLET_SNAPSHOT_RETRY_CONFLICT');
      }
      for (const entry of normalizedEntries) {
        const snapshotAttributionKey = `${transition.generation}:${entry.attributionKey}`;
        const row = ctx.db.fidWalletAttributionV1.snapshotAttributionKey.find(
          snapshotAttributionKey,
        );
        if (
          row === null
          || row.attributionKey !== entry.attributionKey
          || row.snapshotGeneration !== transition.generation
          || row.fid !== entry.fid
          || row.address !== entry.address
          || row.addressType !== entry.addressType
          || row.source !== entry.source
          || row.attributionPolicyVersion !== entry.attributionPolicyVersion
          || row.active !== entry.active
        ) throw new SenderError('WALLET_SNAPSHOT_RETRY_CONFLICT');
      }
      return;
    }

    for (const _pending of ctx.db.snapScanBatchV1.byCursorAndStatus.filter([
      SNAP_SCAN_CURSOR_KEY,
      'pending',
    ])) {
      throw new SenderError('WALLET_SNAPSHOT_FROZEN_BY_PENDING_BATCH');
    }
    if (existing === null && ctx.db.fidWalletAttributionV1.count() !== 0n) {
      throw new SenderError('WALLET_SNAPSHOT_STATE_INTEGRITY');
    }

    for (const entry of normalizedEntries) {
      ctx.db.fidWalletAttributionV1.insert({
        snapshotAttributionKey: `${transition.generation}:${entry.attributionKey}`,
        attributionKey: entry.attributionKey,
        snapshotGeneration: transition.generation,
        fid: entry.fid,
        address: entry.address,
        addressType: entry.addressType,
        source: entry.source,
        snapshotAt: ctx.timestamp,
        attributionPolicyVersion: entry.attributionPolicyVersion,
        active: entry.active,
      });
    }
    const nextSnapshot = {
      snapshotKey: WALLET_SNAPSHOT_KEY,
      generation: transition.generation,
      snapshotId: transition.snapshotId,
      policyVersion: transition.policyVersion,
      attributionCount: transition.attributionCount,
      snapshotAt: ctx.timestamp,
    };
    if (existing === null) ctx.db.walletAttributionSnapshotV1.insert(nextSnapshot);
    else ctx.db.walletAttributionSnapshotV1.snapshotKey.update(nextSnapshot);
    audit(
      ctx,
      'replace_wallet_snapshot_v1',
      undefined,
      admin.subject,
      `count=${transition.attributionCount};policy=${transition.policyVersion}`,
    );
  },
);

/**
 * Starts one resumable batch without advancing the finalized cursor. The
 * cursor, wallet snapshot, range totals, and code attestation are frozen.
 */
export const adminBeginSnapScanBatchV1 = warpkeep.reducer(
  { name: 'admin_begin_snap_scan_batch_v1' },
  {
    batchId: t.string(),
    previousFinalizedBlock: t.u64(),
    previousFinalizedBlockHash: t.string(),
    throughFinalizedBlock: t.u64(),
    throughFinalizedBlockHash: t.string(),
    walletSnapshotGeneration: t.u64(),
    walletSnapshotId: t.string(),
    expectedCredits: t.u32(),
    expectedMicros: t.u128(),
    proxyCodeHash: t.string(),
    implementationAddress: t.string(),
    implementationCodeHash: t.string(),
  },
  (ctx, input) => {
    const admin = requireAdmin(ctx);
    const snapshot = ctx.db.walletAttributionSnapshotV1.snapshotKey.find(WALLET_SNAPSHOT_KEY);
    if (
      snapshot === null
      || ctx.db.walletAttributionSnapshotV1.count() !== 1n
      || !walletSnapshotRowsReconcile(ctx, snapshot)
    ) throw new SenderError('WALLET_SNAPSHOT_STATE_INTEGRITY');
    const cursor = ctx.db.snapScanCursorV1.cursorKey.find(SNAP_SCAN_CURSOR_KEY);

    let plan;
    try {
      plan = normalizeScanBatchPlan(input, cursor, snapshot);
    } catch (error) {
      return senderPolicyError(error);
    }
    const existing = ctx.db.snapScanBatchV1.batchId.find(plan.batchId);
    if (existing !== null) {
      const receipts = aggregateBatchReceipts(ctx, plan.batchId);
      const exactRetry = existing.status === 'pending'
        && existing.finalizedAt === undefined
        && existing.cursorKey === SNAP_SCAN_CURSOR_KEY
        && existing.previousFinalizedBlock === plan.previousFinalizedBlock
        && existing.previousFinalizedBlockHash === plan.previousFinalizedBlockHash
        && existing.throughFinalizedBlock === plan.throughFinalizedBlock
        && existing.throughFinalizedBlockHash === plan.throughFinalizedBlockHash
        && existing.walletSnapshotGeneration === plan.walletSnapshotGeneration
        && existing.walletSnapshotId === plan.walletSnapshotId
        && existing.walletAttributionCount === snapshot.attributionCount
        && existing.expectedCredits === plan.expectedCredits
        && existing.expectedMicros === plan.expectedMicros
        && existing.appliedCredits === receipts.receiptCredits
        && existing.appliedMicros === receipts.receiptMicros
        && existing.proxyCodeHash === plan.proxyCodeHash
        && existing.implementationAddress === plan.implementationAddress
        && existing.implementationCodeHash === plan.implementationCodeHash;
      if (!exactRetry) throw new SenderError('SCAN_BATCH_RETRY_CONFLICT');
      for (const pending of ctx.db.snapScanBatchV1.byCursorAndStatus.filter([
        SNAP_SCAN_CURSOR_KEY,
        'pending',
      ])) {
        if (pending.batchId !== plan.batchId) {
          throw new SenderError('SCAN_BATCH_ALREADY_PENDING');
        }
      }
      return;
    }
    for (const _pending of ctx.db.snapScanBatchV1.byCursorAndStatus.filter([
      SNAP_SCAN_CURSOR_KEY,
      'pending',
    ])) {
      throw new SenderError('SCAN_BATCH_ALREADY_PENDING');
    }

    ctx.db.snapScanBatchV1.insert({
      batchId: plan.batchId,
      cursorKey: SNAP_SCAN_CURSOR_KEY,
      status: 'pending',
      previousFinalizedBlock: plan.previousFinalizedBlock,
      previousFinalizedBlockHash: plan.previousFinalizedBlockHash,
      throughFinalizedBlock: plan.throughFinalizedBlock,
      throughFinalizedBlockHash: plan.throughFinalizedBlockHash,
      walletSnapshotGeneration: plan.walletSnapshotGeneration,
      walletSnapshotId: plan.walletSnapshotId,
      walletAttributionCount: snapshot.attributionCount,
      expectedCredits: plan.expectedCredits,
      expectedMicros: plan.expectedMicros,
      appliedCredits: 0,
      appliedMicros: 0n,
      proxyCodeHash: plan.proxyCodeHash,
      implementationAddress: plan.implementationAddress,
      implementationCodeHash: plan.implementationCodeHash,
      startedAt: ctx.timestamp,
      finalizedAt: undefined,
    });
    audit(
      ctx,
      'begin_snap_scan_batch_v1',
      undefined,
      admin.subject,
      `count=${plan.expectedCredits};policy=${SNAP_MARK_POLICY_VERSION}`,
    );
  },
);

/**
 * Applies one receipt inside the frozen pending batch. Exact receipt retries
 * are allowed after finalization, while all new credits require pending state.
 */
export const adminCreditSnapBurnV1 = warpkeep.reducer(
  { name: 'admin_credit_snap_burn_v1' },
  {
    batchId: t.string(),
    eventKey: t.string(),
    chainId: t.u32(),
    tokenContract: t.string(),
    transactionHash: t.string(),
    logIndex: t.u32(),
    burnReference: t.string(),
    burnMethod: t.string(),
    senderAddress: t.string(),
    blockNumber: t.u64(),
    blockHash: t.string(),
    amountMicros: t.u128(),
    attributedFid: t.u64(),
    attributionPolicyVersion: t.string(),
    implementationAddress: t.string(),
    contractCodeHash: t.string(),
  },
  (ctx, input) => {
    const admin = requireAdmin(ctx);
    const batchId = normalizePrivateId(input.batchId, 'SCAN_BATCH_ID_INVALID');
    let credit;
    try {
      credit = normalizeSnapBurnCredit(input);
    } catch (error) {
      return senderPolicyError(error);
    }
    requireSupportedFid(credit.attributedFid);

    const existingReceipt = ctx.db.snapBurnCreditV1.eventKey.find(credit.eventKey);
    if (existingReceipt !== null) {
      if (existingReceipt.batchId !== batchId || !snapBurnCreditsEqual(existingReceipt, credit)) {
        throw new SenderError('SNAP_EVENT_CONFLICT');
      }
      assertGenesisFounderForFid(ctx, credit.attributedFid);
      const account = ctx.db.markAccountV1.fid.find(credit.attributedFid);
      const existingBatch = ctx.db.snapScanBatchV1.batchId.find(batchId);
      if (account === null || !markAccountIsConsistent(account)) {
        throw new SenderError('MARK_ACCOUNT_INVARIANT');
      }
      if (
        existingBatch === null
        || existingBatch.appliedCredits < 1
        || existingBatch.appliedMicros < credit.amountMicros
      ) throw new SenderError('SNAP_EVENT_STATE_INTEGRITY');
      return;
    }
    const duplicateReference = ctx.db.snapBurnCreditV1.burnReference.find(credit.burnReference);
    if (duplicateReference !== null) throw new SenderError('SNAP_BURN_REFERENCE_CONFLICT');

    const batch = ctx.db.snapScanBatchV1.batchId.find(batchId);
    if (batch === null) throw new SenderError('SCAN_BATCH_NOT_FOUND');
    if (batch.status !== 'pending' || batch.finalizedAt !== undefined) {
      throw new SenderError('SCAN_BATCH_NOT_PENDING');
    }
    if (
      batch.cursorKey !== SNAP_SCAN_CURSOR_KEY
      || !cursorIsAtBatchPrevious(ctx, batch)
    ) throw new SenderError('SCAN_CURSOR_MISMATCH');
    if (!currentSnapshotMatchesBatch(ctx, batch)) {
      throw new SenderError('SCAN_BATCH_WALLET_SNAPSHOT_MISMATCH');
    }
    if (
      batch.proxyCodeHash !== SNAP_APPROVED_PROXY_CODE_HASH
      || batch.implementationAddress !== input.implementationAddress.trim().toLowerCase()
      || batch.implementationCodeHash !== credit.contractCodeHash
    ) throw new SenderError('SCAN_BATCH_ATTESTATION_MISMATCH');
    if (
      credit.blockNumber <= batch.previousFinalizedBlock
      || credit.blockNumber > batch.throughFinalizedBlock
      || (
        credit.blockNumber === batch.throughFinalizedBlock
        && credit.blockHash !== batch.throughFinalizedBlockHash
      )
    ) throw new SenderError('SNAP_EVENT_OUTSIDE_BATCH');

    assertGenesisFounderForFid(ctx, credit.attributedFid);
    const attributedAllowed = ctx.db.allowedFid.fid.find(credit.attributedFid);
    if (attributedAllowed === null || !attributedAllowed.enabled) {
      throw new SenderError('SNAP_ATTRIBUTION_NOT_ADMITTED');
    }
    const currentFids = new Set<bigint>();
    for (const attribution of ctx.db.fidWalletAttributionV1.bySnapshotAndAddress.filter([
      batch.walletSnapshotGeneration,
      credit.senderAddress,
    ])) {
      if (
        !attribution.active
        || attribution.snapshotGeneration !== batch.walletSnapshotGeneration
        || attribution.attributionPolicyVersion !== FARCASTER_WALLET_POLICY_VERSION
      ) continue;
      const allowed = ctx.db.allowedFid.fid.find(attribution.fid);
      if (allowed !== null && allowed.enabled) currentFids.add(attribution.fid);
    }
    if (currentFids.size !== 1 || !currentFids.has(credit.attributedFid)) {
      throw new SenderError('SNAP_ATTRIBUTION_AMBIGUOUS');
    }

    const account = ctx.db.markAccountV1.fid.find(credit.attributedFid);
    const profile = ctx.db.realmProfileV1.fid.find(credit.attributedFid);
    if (account === null || profile === null) throw new SenderError('STATE_INTEGRITY');
    let nextAccount;
    let nextBatchTotals;
    try {
      nextAccount = applyOneToOneBurnCredit(account, credit.amountMicros);
      nextBatchTotals = applyScanBatchCredit({
        appliedCredits: batch.appliedCredits,
        appliedMicros: batch.appliedMicros,
        expectedCredits: batch.expectedCredits,
        expectedMicros: batch.expectedMicros,
        amountMicros: credit.amountMicros,
      });
    } catch (error) {
      return senderPolicyError(error);
    }

    ctx.db.snapBurnCreditV1.insert({ ...credit, batchId, creditedAt: ctx.timestamp });
    ctx.db.snapScanBatchV1.batchId.update({
      ...batch,
      appliedCredits: nextBatchTotals.appliedCredits,
      appliedMicros: nextBatchTotals.appliedMicros,
    });
    ctx.db.markAccountV1.fid.update({
      ...account,
      ...nextAccount,
      updatedAt: ctx.timestamp,
    });
    if (profile.communityStatsVisible) {
      const acceptanceKey = `${credit.attributedFid}:${WARPKEEP_ALPHA_TERMS_VERSION}`;
      const acceptance = ctx.db.alphaTermsAcceptanceV1.acceptanceKey.find(acceptanceKey);
      if (
        profile.firstAuthenticatedAt === undefined
        || acceptance?.fid !== credit.attributedFid
        || acceptance.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION
      ) throw new SenderError('STATE_INTEGRITY');
      ctx.db.realmProfileV1.fid.update({
        ...profile,
        totalSnapBurnedMicros: nextAccount.totalSnapBurnedMicros,
        marksEarnedMicros: nextAccount.earnedMicros,
        marksSpentMicros: nextAccount.spentMicros,
        marksBalanceMicros: nextAccount.balanceMicros,
        marksPolicyVersion: nextAccount.policyVersion,
      });
    }
    audit(
      ctx,
      'credit_snap_burn_v1',
      credit.attributedFid,
      admin.subject,
      credit.attributionPolicyVersion,
    );
  },
);

/** Reconciles the exact batch receipt set, then advances the cursor atomically. */
export const adminFinalizeSnapScanBatchV1 = warpkeep.reducer(
  { name: 'admin_finalize_snap_scan_batch_v1' },
  { batchId: t.string() },
  (ctx, { batchId: rawBatchId }) => {
    const admin = requireAdmin(ctx);
    const batchId = normalizePrivateId(rawBatchId, 'SCAN_BATCH_ID_INVALID');
    const batch = ctx.db.snapScanBatchV1.batchId.find(batchId);
    if (batch === null) throw new SenderError('SCAN_BATCH_NOT_FOUND');
    const receipts = aggregateBatchReceipts(ctx, batchId);
    const totalsReconcile = batch.expectedCredits === batch.appliedCredits
      && batch.expectedMicros === batch.appliedMicros
      && batch.appliedCredits === receipts.receiptCredits
      && batch.appliedMicros === receipts.receiptMicros;

    if (batch.status === 'finalized') {
      if (
        batch.finalizedAt === undefined
        || !totalsReconcile
        || !cursorHasFinalizedBatch(ctx, batch)
      ) {
        throw new SenderError('SCAN_BATCH_FINALIZED_STATE_MISMATCH');
      }
      return;
    }
    if (batch.status !== 'pending') throw new SenderError('SCAN_BATCH_STATUS_INVALID');
    if (batch.finalizedAt !== undefined) throw new SenderError('SCAN_BATCH_STATUS_INVALID');
    if (!cursorIsAtBatchPrevious(ctx, batch)) throw new SenderError('SCAN_CURSOR_MISMATCH');
    if (!currentSnapshotMatchesBatch(ctx, batch, true)) {
      throw new SenderError('SCAN_BATCH_WALLET_SNAPSHOT_MISMATCH');
    }
    if (!scanBatchReadyToFinalize({
      status: batch.status,
      expectedCredits: batch.expectedCredits,
      expectedMicros: batch.expectedMicros,
      appliedCredits: batch.appliedCredits,
      appliedMicros: batch.appliedMicros,
      receiptCredits: receipts.receiptCredits,
      receiptMicros: receipts.receiptMicros,
    })) throw new SenderError('SCAN_BATCH_NOT_RECONCILED');

    const cursor = ctx.db.snapScanCursorV1.cursorKey.find(SNAP_SCAN_CURSOR_KEY);
    const finalizedCursor = {
      cursorKey: SNAP_SCAN_CURSOR_KEY,
      chainId: ETHEREUM_MAINNET_CHAIN_ID,
      tokenContract: SNAP_PROXY_ADDRESS,
      policyVersion: SNAP_MARK_POLICY_VERSION,
      deploymentStartBlock: SNAP_PROXY_DEPLOYMENT_BLOCK,
      lastFinalizedBlock: batch.throughFinalizedBlock,
      lastFinalizedBlockHash: batch.throughFinalizedBlockHash,
      proxyCodeHash: batch.proxyCodeHash,
      implementationAddress: batch.implementationAddress,
      implementationCodeHash: batch.implementationCodeHash,
      walletSnapshotGeneration: batch.walletSnapshotGeneration,
      walletSnapshotId: batch.walletSnapshotId,
      scannedAt: ctx.timestamp,
    };
    if (cursor === null) ctx.db.snapScanCursorV1.insert(finalizedCursor);
    else ctx.db.snapScanCursorV1.cursorKey.update(finalizedCursor);
    ctx.db.snapScanBatchV1.batchId.update({
      ...batch,
      status: 'finalized',
      finalizedAt: ctx.timestamp,
    });
    audit(
      ctx,
      'finalize_snap_scan_batch_v1',
      undefined,
      admin.subject,
      `count=${batch.expectedCredits};policy=${SNAP_MARK_POLICY_VERSION}`,
    );
  },
);

/** Counts-only private reconciliation view; it never returns event or wallet data. */
export const adminGetSnapScanBatchAggregateV1 = warpkeep.procedure(
  { name: 'admin_get_snap_scan_batch_aggregate_v1' },
  { batchId: t.string() },
  adminSnapScanBatchAggregateV1,
  (ctx, { batchId: rawBatchId }) =>
    ctx.withTx(tx => {
      requireAdmin(tx);
      const batchId = normalizePrivateId(rawBatchId, 'SCAN_BATCH_ID_INVALID');
      const batch = tx.db.snapScanBatchV1.batchId.find(batchId);
      if (batch === null) throw new SenderError('SCAN_BATCH_NOT_FOUND');
      const receipts = aggregateBatchReceipts(tx, batchId);
      const cursorAdvanced = cursorHasFinalizedBatch(tx, batch);
      const receiptCountersReconcile = batch.appliedCredits === receipts.receiptCredits
        && batch.appliedMicros === receipts.receiptMicros
        && batch.appliedCredits <= batch.expectedCredits
        && batch.appliedMicros <= batch.expectedMicros;
      const complete = batch.expectedCredits === batch.appliedCredits
        && batch.expectedMicros === batch.appliedMicros;
      const stateReconciles = batch.status === 'finalized'
        ? batch.finalizedAt !== undefined && cursorAdvanced && complete
        : batch.status === 'pending'
          && batch.finalizedAt === undefined
          && cursorIsAtBatchPrevious(tx, batch)
          && currentSnapshotMatchesBatch(tx, batch);
      return {
        status: batch.status,
        expectedCredits: batch.expectedCredits,
        expectedMicros: batch.expectedMicros,
        appliedCredits: batch.appliedCredits,
        appliedMicros: batch.appliedMicros,
        receiptCredits: receipts.receiptCredits,
        receiptMicros: receipts.receiptMicros,
        creditedAccounts: receipts.creditedAccounts,
        cursorAdvanced,
        internallyConsistent: receiptCountersReconcile && stateReconciles,
      };
    }),
);

export const adminDisableFid = warpkeep.reducer(
  { name: 'admin_disable_fid' },
  { fid: t.u64(), note: t.string() },
  (ctx, { fid, note }) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(fid);
    const cleanNote = cleanAdminNote(note);
    const existing = ctx.db.allowedFid.fid.find(fid);

    if (existing !== null && existing.enabled) {
      ctx.db.allowedFid.fid.update({ ...existing, enabled: false, note: cleanNote });
    }

    audit(ctx, 'disable_fid', fid, admin.subject, cleanNote);
  },
);

export const adminBumpAuthEpoch = warpkeep.reducer(
  { name: 'admin_bump_auth_epoch' },
  { fid: t.u64(), note: t.string() },
  (ctx, { fid, note }) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(fid);
    const cleanNote = cleanAdminNote(note);
    const existing = ctx.db.allowedFid.fid.find(fid);

    if (existing === null) {
      throw new SenderError('FID_NOT_FOUND');
    }
    if (existing.authEpoch >= MAX_AUTH_EPOCH) {
      throw new SenderError('AUTH_EPOCH_EXHAUSTED');
    }

    ctx.db.allowedFid.fid.update({
      ...existing,
      authEpoch: existing.authEpoch + 1,
      note: cleanNote,
    });
    audit(ctx, 'bump_auth_epoch', fid, admin.subject, cleanNote);
  },
);
