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
  requireAdmin,
  requireAuthEpochResolver,
  requireSupportedFid,
  requireWarpkeepConnection,
} from '../auth';
import warpkeep from '../schema';
import { seedCanonicalWorld } from './worldSeed';
import { HEGEMONY_GENESIS_001, HEGEMONY_WORLD_SEED } from '../world';
import { worldCastleGraphIsConsistent } from '../worldCastleIntegrity';

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
 * Safe for any permitted Warpkeep connection. It exposes static compatibility
 * metadata only: no whitelist rows, identities, audit entries, or live
 * aggregate counts.
 */
export const getAlphaBackendInfo = warpkeep.procedure(
  { name: 'get_alpha_backend_info' },
  alphaBackendInfo,
  ctx =>
    ctx.withTx(tx => {
      requireWarpkeepConnection(tx);
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
    audit(ctx, 'seed_world', undefined, admin.subject, 'canonical-radius-4-lowlands');
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
    } catch (error) {
      if (error instanceof AuthEpochExhaustedError) {
        throw new SenderError(error.message);
      }
      throw error;
    }
  },
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
