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
  assertGenesisFoundingGraph,
  assertGenesisFounderForFid,
  assertGenesisFounderForProfileRepair,
  ensureGenesisFounder,
} from '../foundingAuthority';
import {
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  markAccountIsConsistent,
} from '../marksAuthorityPolicy';
import {
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
  WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS,
  retainedEntryAgreementEvidenceExists,
} from '../entryAgreementPolicy';
import {
  FARCASTER_PROFILE_POLICY_VERSION,
  ProfileAuthorityPolicyError,
  admissionProfileIsComplete,
  normalizeAdmissionReadyTrustedProfile,
  normalizeTrustedPublicProfile,
  trustedProfilesEqual,
} from '../profileAuthorityPolicy';
import {
  requireAdmin,
  requireAuthEpochResolver,
  requireSupportedFid,
  requireWarpkeepMetadataConnection,
} from '../auth';
import warpkeep from '../schema';
import { seedCanonicalWorld } from './worldSeed';
import {
  GENESIS_AUTHORITATIVE_CELL_COUNT,
  GENESIS_CASTLE_SLOT_COUNT,
  GENESIS_GENERATION_V2_REALM,
  GENESIS_GENERATION_V2_WORLD_TILE_META,
  GENESIS_GENERATION_V2_WORLD_TILES,
  HEGEMONY_GENESIS_001,
  HEGEMONY_REALM_ID,
  HEGEMONY_WORLD_GENERATION_VERSION,
  HEGEMONY_WORLD_SEED,
  matchesGenerationV2Realm,
} from '../world';
import { worldCastleGraphIsConsistent } from '../worldCastleIntegrity';
import {
  classifyGenesisStaticSnapshot,
} from '../worldSeedPolicy';
import {
  assertGenesisResourceForFid,
  inspectGenesisResourceGraph,
} from '../resourceAuthority';
import { grantDailyMarkIfActive } from '../dailyMarksAuthority';

type AdminContext = Parameters<typeof requireAdmin>[0];

/**
 * A public Marks projection can remain visible under its historical immutable
 * acceptance evidence. That preserves a prior explicit publication choice
 * while the current entry/gameplay gate still requires the newest bundle.
 */
function hasRetainedEntryAgreementEvidence(ctx: AdminContext, fid: bigint): boolean {
  return retainedEntryAgreementEvidenceExists(
    fid,
    acceptanceKey => ctx.db.alphaTermsAcceptanceV1.acceptanceKey.find(acceptanceKey),
  );
}

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

function applyAllowedFidTransition(
  ctx: Parameters<typeof requireAdmin>[0],
  input: Readonly<{
    fid: bigint;
    note: string;
    adminSubject: string;
    auditAction: 'allow_fid' | 'admit_founder_v1'
      | 'allow_fid_for_access_request_v1'
      | 'admit_founder_for_access_request_v2';
  }>,
): void {
  const existing = ctx.db.allowedFid.fid.find(input.fid);
  try {
    executeAllowFidTransition(existing, {
      insert: plan => {
        ctx.db.allowedFid.insert({
          fid: input.fid,
          enabled: plan.enabled,
          authEpoch: plan.authEpoch,
          invitedAt: ctx.timestamp,
          invitedBy: input.adminSubject,
          note: input.note,
        });
      },
      enabled: plan => {
        if (existing !== null && existing.note !== input.note) {
          ctx.db.allowedFid.fid.update({
            ...existing,
            enabled: plan.enabled,
            authEpoch: plan.authEpoch,
            note: input.note,
          });
        }
      },
      reenabled: plan => {
        if (existing === null) throw new Error('ALLOW_FID_POLICY_INVARIANT');
        ctx.db.allowedFid.fid.update({
          ...existing,
          enabled: plan.enabled,
          authEpoch: plan.authEpoch,
          note: input.note,
        });
      },
      audit: () => audit(
        ctx,
        input.auditAction,
        input.fid,
        input.adminSubject,
        input.note,
      ),
    });
  } catch (error) {
    if (error instanceof AuthEpochExhaustedError) {
      throw new SenderError(error.message);
    }
    throw error;
  }
}

/**
 * Exact access-request compare-and-swap guard shared by the request-CAS
 * admission reducers used by notification-gated Hermes. The module does not
 * observe a notification; it enforces only the authoritative admission kind
 * and database-derived request tuple. This helper performs no writes.
 */
function requireExactAccessRequest(
  ctx: Parameters<typeof requireAdmin>[0],
  fid: bigint,
  expectedRequestCycle: bigint,
  expectedRequestedAtMicros: bigint,
  requiredRequestCycle: bigint,
): void {
  const request = ctx.db.accessRequestV1.fid.find(fid);
  const storedRequestedAtMicros = request?.requestedAt.microsSinceUnixEpoch;
  if (
    expectedRequestCycle !== requiredRequestCycle
    || request === null
    || request.requestCycle !== expectedRequestCycle
    || storedRequestedAtMicros === undefined
    || storedRequestedAtMicros <= 0n
    || storedRequestedAtMicros !== expectedRequestedAtMicros
  ) {
    throw new SenderError('ACCESS_REQUEST_ADMISSION_CAS_MISMATCH');
  }
}

function assertExactGenesisDynamicGraph(ctx: Parameters<typeof requireAdmin>[0]) {
  assertGenesisFoundingGraph(ctx);
  const resource = inspectGenesisResourceGraph(ctx);
  const founderCount = ctx.db.allowedFid.count();
  const exactResourcePrebackfill = resource.resourceAccounts === 0n
    && resource.missingResourceAccounts === founderCount;
  const exactResourceReady = resource.resourceAccounts === founderCount
    && resource.missingResourceAccounts === 0n;
  if (
    (!exactResourcePrebackfill && !exactResourceReady)
    || resource.orphanedResourceAccounts !== 0n
    || resource.resourceInvariantViolations !== 0n
  ) {
    throw new SenderError('STATE_INTEGRITY');
  }
  return resource;
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

/**
 * Safe for ordinary permitted connections. The QA attestation principal is
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

      const staticWorldDriftViolations = classifyGenesisStaticSnapshot({
        worldTiles: tx.db.worldTile.iter(),
        realms: tx.db.realmV1.iter(),
        worldMeta: tx.db.worldTileMetaV1.iter(),
        castleSlots: tx.db.castleSlotV1.iter(),
      }) === 'invalid' ? 1n : 0n;

      let occupiedWorldTiles = 0n;
      for (const tile of tx.db.worldTile.iter()) {
        if (tile.occupantCastleId !== undefined) occupiedWorldTiles += 1n;
      }

      let enabledAllowedFids = 0n;
      // This deployed invariant remains structural. Repairable username/PFP
      // health is reported by the private profile-maintenance operator and is
      // never folded into a migration or gameplay readiness gate.
      let founderStateGaps = 0n;
      for (const row of tx.db.allowedFid.iter()) {
        if (row.enabled) enabledAllowedFids += 1n;
        const profile = tx.db.realmProfileV1.fid.find(row.fid);
        if (
          tx.db.castle.ownerFid.find(row.fid) === null
          || tx.db.castleSlotClaimV1.ownerFid.find(row.fid) === null
          || profile === null
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
          && hasRetainedEntryAgreementEvidence(tx, profile.fid)
          && (
            account.policyVersion === ADMITTED_DAILY_MARK_POLICY_VERSION
              ? profile.totalSnapBurnedMicros === undefined
              : profile.totalSnapBurnedMicros === account.totalSnapBurnedMicros
          )
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
      const entryAgreementAcceptanceCounts = new Map<bigint, number>();
      for (const acceptance of tx.db.alphaTermsAcceptanceV1.iter()) {
        const acceptanceCount = (entryAgreementAcceptanceCounts.get(acceptance.fid) ?? 0) + 1;
        entryAgreementAcceptanceCounts.set(acceptance.fid, acceptanceCount);
        if (
          acceptance.fid === 0n
          || acceptance.termsVersion.trim() === ''
          || acceptance.termsVersion.length > 64
          || acceptance.acceptanceKey !== `${acceptance.fid}:${acceptance.termsVersion}`
          || !WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.some(
            entryAgreementVersion => entryAgreementVersion === acceptance.termsVersion,
          )
          || acceptanceCount > WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM
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
      // Frozen v3 aggregate compatibility only. No reducer can create or
      // replace this retired snapshot after the daily-Marks migration.
      const currentWalletSnapshot = tx.db.walletAttributionSnapshotV1.snapshotKey.find('current');
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

/**
 * Protected generation-v3 creation/recovery. The deployed generation-v2
 * singleton is deliberately excluded so this routine operator cannot trigger
 * the reviewed world expansion by accident.
 */
export const adminSeedWorld = warpkeep.reducer(
  { name: 'admin_seed_world' },
  ctx => {
    const admin = requireAdmin(ctx);
    const existingRealm = ctx.db.realmV1.realmId.find(HEGEMONY_REALM_ID);
    if (existingRealm !== null && matchesGenerationV2Realm(existingRealm)) {
      throw new SenderError('WORLD_EXPANSION_REQUIRES_V3_REDUCER');
    }
    seedCanonicalWorld(ctx);
    // A partial recovery seed may fill missing canonical tiles, but it must not
    // commit if an existing castle still lacks the exact reverse occupancy
    // link. Reducer atomicity rolls every inserted tile back on this failure.
    if (!worldCastleGraphIsConsistent(ctx.db.worldTile.iter(), ctx.db.castle.iter())) {
      throw new SenderError('STATE_INTEGRITY');
    }
    assertExactGenesisDynamicGraph(ctx);
    audit(ctx, 'seed_world', undefined, admin.subject, 'genesis-001-generation-v3-cells-10000');
  },
);

/**
 * Exact-CAS production transition from the frozen generation-v2 world to the
 * 10,000-cell generation-v3 world. Reducer atomicity makes the 17,478 inserts
 * and singleton realm update visible together or not at all.
 */
export const adminExpandGenesisWorldV3 = warpkeep.reducer(
  { name: 'admin_expand_genesis_world_v3' },
  {
    expectedWorldTiles: t.u64(),
    expectedWorldTileMeta: t.u64(),
    expectedGenerationVersion: t.u32(),
  },
  (ctx, {
    expectedWorldTiles,
    expectedWorldTileMeta,
    expectedGenerationVersion,
  }) => {
    const admin = requireAdmin(ctx);
    const generationV2Expectation = expectedWorldTiles
      === BigInt(GENESIS_GENERATION_V2_WORLD_TILES.length)
      && expectedWorldTileMeta === BigInt(GENESIS_GENERATION_V2_WORLD_TILE_META.length)
      && expectedGenerationVersion === GENESIS_GENERATION_V2_REALM.generationVersion;
    const generationV3Expectation = expectedWorldTiles
      === BigInt(GENESIS_AUTHORITATIVE_CELL_COUNT)
      && expectedWorldTileMeta === BigInt(GENESIS_AUTHORITATIVE_CELL_COUNT)
      && expectedGenerationVersion === HEGEMONY_WORLD_GENERATION_VERSION;
    if (!generationV2Expectation && !generationV3Expectation) {
      throw new SenderError('WORLD_EXPANSION_PRECONDITION');
    }

    const snapshot = {
      worldTiles: ctx.db.worldTile.iter(),
      realms: ctx.db.realmV1.iter(),
      worldMeta: ctx.db.worldTileMetaV1.iter(),
      castleSlots: ctx.db.castleSlotV1.iter(),
    };
    const generation = classifyGenesisStaticSnapshot(snapshot);
    if (
      (generation === 'generation-v2' && !generationV2Expectation)
      || (generation === 'generation-v3' && !generationV3Expectation)
      || generation === 'invalid'
    ) {
      throw new SenderError('WORLD_EXPANSION_PRECONDITION');
    }
    if (!worldCastleGraphIsConsistent(ctx.db.worldTile.iter(), ctx.db.castle.iter())) {
      throw new SenderError('STATE_INTEGRITY');
    }
    const resourceBefore = assertExactGenesisDynamicGraph(ctx);

    // An exact generation-v3 target is a true no-op: no rows and no audit
    // entry change, so a bounded retry can prove idempotence byte-for-byte.
    if (generation === 'generation-v3') return;

    seedCanonicalWorld(ctx);
    if (
      ctx.db.worldTile.count() !== BigInt(GENESIS_AUTHORITATIVE_CELL_COUNT)
      || ctx.db.worldTileMetaV1.count() !== BigInt(GENESIS_AUTHORITATIVE_CELL_COUNT)
      || ctx.db.realmV1.count() !== 1n
      || ctx.db.castleSlotV1.count() !== BigInt(GENESIS_CASTLE_SLOT_COUNT)
      || classifyGenesisStaticSnapshot({
        worldTiles: ctx.db.worldTile.iter(),
        realms: ctx.db.realmV1.iter(),
        worldMeta: ctx.db.worldTileMetaV1.iter(),
        castleSlots: ctx.db.castleSlotV1.iter(),
      }) !== 'generation-v3'
      || !worldCastleGraphIsConsistent(ctx.db.worldTile.iter(), ctx.db.castle.iter())
    ) {
      throw new SenderError('STATE_INTEGRITY');
    }
    const resourceAfter = assertExactGenesisDynamicGraph(ctx);
    if (
      resourceAfter.resourceAccounts !== resourceBefore.resourceAccounts
      || resourceAfter.missingResourceAccounts !== resourceBefore.missingResourceAccounts
      || resourceAfter.orphanedResourceAccounts !== resourceBefore.orphanedResourceAccounts
      || resourceAfter.resourceInvariantViolations !== resourceBefore.resourceInvariantViolations
    ) {
      throw new SenderError('STATE_INTEGRITY');
    }
    audit(
      ctx,
      'expand_world_v3',
      undefined,
      admin.subject,
      'genesis-001-generation-v2-to-v3-cells-1261-to-10000',
    );
  },
);

/**
 * Legacy wire retained only for an already-founded player. First-time
 * admission must use the atomic profiled path below so a public castle can
 * never be created with an empty Farcaster presentation. Later presentation
 * health is repairable and is not a re-enablement authority signal.
 */
export const adminAllowFid = warpkeep.reducer(
  { name: 'admin_allow_fid' },
  { fid: t.u64(), note: t.string() },
  (ctx, { fid, note }) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(fid);
    const cleanNote = cleanAdminNote(note);
    const existing = ctx.db.allowedFid.fid.find(fid);
    if (existing === null) throw new SenderError('PROFILED_ADMISSION_REQUIRED');

    assertGenesisFounderForFid(ctx, fid);
    assertGenesisResourceForFid(ctx, fid);
    applyAllowedFidTransition(ctx, {
      fid,
      note: cleanNote,
      adminSubject: admin.subject,
      auditAction: 'allow_fid',
    });
    assertGenesisFounderForFid(ctx, fid);
    assertGenesisResourceForFid(ctx, fid);
    grantDailyMarkIfActive(ctx, fid);
  },
);

/**
 * Atomic owner-only founding path. The trusted operator resolves and reviews
 * Farcaster presentation before submission; the module re-normalizes it before
 * any write, then admits, founds, hydrates, and verifies one complete founder
 * graph in the same transaction. Player ownership remains caller-bound on the
 * founder's first authenticated session and is never forged by administration.
 */
export const adminAdmitFounderV1 = warpkeep.reducer(
  { name: 'admin_admit_founder_v1' },
  {
    fid: t.u64(),
    note: t.string(),
    canonicalUsername: t.string(),
    displayName: t.option(t.string()),
    pfpUrl: t.string(),
    publicBio: t.option(t.string()),
    profilePolicyVersion: t.string(),
  },
  (ctx, input) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(input.fid);
    const cleanNote = cleanAdminNote(input.note);
    if (input.profilePolicyVersion !== FARCASTER_PROFILE_POLICY_VERSION) {
      throw new SenderError('PROFILE_POLICY_MISMATCH');
    }

    let normalized;
    try {
      normalized = normalizeAdmissionReadyTrustedProfile(input);
    } catch (error) {
      if (error instanceof ProfileAuthorityPolicyError) throw new SenderError(error.code);
      throw error;
    }

    if (ctx.db.allowedFid.fid.find(input.fid) !== null) {
      throw new SenderError('FOUNDER_ALREADY_ADMITTED');
    }

    applyAllowedFidTransition(ctx, {
      fid: input.fid,
      note: cleanNote,
      adminSubject: admin.subject,
      auditAction: 'admit_founder_v1',
    });
    ensureGenesisFounder(ctx, input.fid, normalized);
    const verifiedProfile = ctx.db.realmProfileV1.fid.find(input.fid);
    if (
      verifiedProfile === null
      || !admissionProfileIsComplete(verifiedProfile)
      || !trustedProfilesEqual(verifiedProfile, normalized)
    ) throw new SenderError('FOUNDER_PROFILE_INCOMPLETE');
    assertGenesisFounderForFid(ctx, input.fid);
    assertGenesisResourceForFid(ctx, input.fid);
    grantDailyMarkIfActive(ctx, input.fid);
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
    assertGenesisFounderForProfileRepair(ctx, input.fid);

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
    const verifiedProfile = ctx.db.realmProfileV1.fid.find(input.fid);
    if (
      verifiedProfile === null
      || !trustedProfilesEqual(verifiedProfile, normalized)
    ) throw new SenderError('STATE_INTEGRITY');
    audit(
      ctx,
      'profile_snapshot_v1',
      input.fid,
      admin.subject,
      FARCASTER_PROFILE_POLICY_VERSION,
    );
  },
);

/**
 * Owner-only request-CAS re-admission used by notification-gated Hermes. This
 * reducer does not observe notification delivery or acknowledgement; it
 * enforces only the exact disabled admission kind and request tuple. Founder
 * and resource state remain permanent.
 */
export const adminAllowFidForAccessRequestV1 = warpkeep.reducer(
  { name: 'admin_allow_fid_for_access_request_v1' },
  {
    fid: t.u64(),
    note: t.string(),
    expectedRequestCycle: t.u64(),
    expectedRequestedAtMicros: t.u64(),
  },
  (ctx, {
    fid,
    note,
    expectedRequestCycle,
    expectedRequestedAtMicros,
  }) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(fid);
    const cleanNote = cleanAdminNote(note);
    const existing = ctx.db.allowedFid.fid.find(fid);
    if (existing === null || existing.enabled) {
      throw new SenderError('ACCESS_REQUEST_ADMISSION_CAS_MISMATCH');
    }
    requireExactAccessRequest(
      ctx,
      fid,
      expectedRequestCycle,
      expectedRequestedAtMicros,
      BigInt(existing.authEpoch) + 1n,
    );

    assertGenesisFounderForFid(ctx, fid);
    assertGenesisResourceForFid(ctx, fid);
    applyAllowedFidTransition(ctx, {
      fid,
      note: cleanNote,
      adminSubject: admin.subject,
      auditAction: 'allow_fid_for_access_request_v1',
    });
    assertGenesisFounderForFid(ctx, fid);
    assertGenesisResourceForFid(ctx, fid);
    grantDailyMarkIfActive(ctx, fid);
  },
);

/**
 * Owner-only first-founding request CAS used by notification-gated Hermes. This
 * reducer does not observe a notification; the absent admission row and exact
 * cycle-zero request tuple are its authority preconditions. Trusted profile
 * validation, atomic founding, graph assertions, and daily Marks behavior match
 * admin_admit_founder_v1.
 */
export const adminAdmitFounderForAccessRequestV2 = warpkeep.reducer(
  { name: 'admin_admit_founder_for_access_request_v2' },
  {
    fid: t.u64(),
    note: t.string(),
    expectedRequestCycle: t.u64(),
    expectedRequestedAtMicros: t.u64(),
    canonicalUsername: t.string(),
    displayName: t.option(t.string()),
    pfpUrl: t.string(),
    publicBio: t.option(t.string()),
    profilePolicyVersion: t.string(),
  },
  (ctx, input) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(input.fid);
    const cleanNote = cleanAdminNote(input.note);
    if (input.profilePolicyVersion !== FARCASTER_PROFILE_POLICY_VERSION) {
      throw new SenderError('PROFILE_POLICY_MISMATCH');
    }

    let normalized;
    try {
      normalized = normalizeAdmissionReadyTrustedProfile(input);
    } catch (error) {
      if (error instanceof ProfileAuthorityPolicyError) throw new SenderError(error.code);
      throw error;
    }

    if (ctx.db.allowedFid.fid.find(input.fid) !== null) {
      throw new SenderError('ACCESS_REQUEST_ADMISSION_CAS_MISMATCH');
    }
    requireExactAccessRequest(
      ctx,
      input.fid,
      input.expectedRequestCycle,
      input.expectedRequestedAtMicros,
      0n,
    );

    applyAllowedFidTransition(ctx, {
      fid: input.fid,
      note: cleanNote,
      adminSubject: admin.subject,
      auditAction: 'admit_founder_for_access_request_v2',
    });
    ensureGenesisFounder(ctx, input.fid, normalized);
    const verifiedProfile = ctx.db.realmProfileV1.fid.find(input.fid);
    if (
      verifiedProfile === null
      || !admissionProfileIsComplete(verifiedProfile)
      || !trustedProfilesEqual(verifiedProfile, normalized)
    ) throw new SenderError('FOUNDER_PROFILE_INCOMPLETE');
    assertGenesisFounderForFid(ctx, input.fid);
    assertGenesisResourceForFid(ctx, input.fid);
    grantDailyMarkIfActive(ctx, input.fid);
  },
);

/** Burn and wallet-attribution mutation wires were retired in Alpha 0.3.33. */
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
