import { SenderError, t } from 'spacetimedb/server';

import {
  MAX_AUTH_EPOCH,
  WARPKEEP_BACKEND_PROTOCOL_VERSION,
} from '../config';
import {
  requireAdmin,
  requireSupportedFid,
  requireWarpkeepConnection,
} from '../auth';
import warpkeep from '../schema';
import { seedCanonicalWorld } from './worldSeed';
import { HEGEMONY_GENESIS_001, HEGEMONY_WORLD_SEED } from '../world';

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

const alphaBackendInfo = t.object('AlphaBackendInfo', {
  protocolVersion: t.u32(),
  worldSeed: t.u32(),
  worldSeedName: t.string(),
});

/**
 * Safe for any authenticated Warpkeep connection, including a valid but
 * unadmitted player. It exposes static compatibility metadata only: no
 * whitelist rows, identities, audit entries, or live aggregate counts.
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

/** Protected and idempotent canonical world seeding. */
export const adminSeedWorld = warpkeep.reducer(
  { name: 'admin_seed_world' },
  ctx => {
    const admin = requireAdmin(ctx);
    seedCanonicalWorld(ctx);
    audit(ctx, 'seed_world', undefined, admin.subject, 'canonical-radius-4-lowlands');
  },
);

/**
 * A repeated allow call is intentionally safe. It can re-enable an existing
 * invite but preserves its auth epoch, so a new epoch is always explicit.
 */
export const adminAllowFid = warpkeep.reducer(
  { name: 'admin_allow_fid' },
  { fid: t.u64(), note: t.string() },
  (ctx, { fid, note }) => {
    const admin = requireAdmin(ctx);
    requireSupportedFid(fid);
    const cleanNote = cleanAdminNote(note);
    const existing = ctx.db.allowedFid.fid.find(fid);

    if (existing === null) {
      ctx.db.allowedFid.insert({
        fid,
        enabled: true,
        authEpoch: 0,
        invitedAt: ctx.timestamp,
        invitedBy: admin.subject,
        note: cleanNote,
      });
    } else if (!existing.enabled || existing.note !== cleanNote) {
      ctx.db.allowedFid.fid.update({
        ...existing,
        enabled: true,
        note: cleanNote,
      });
    }

    audit(ctx, 'allow_fid', fid, admin.subject, cleanNote);
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
