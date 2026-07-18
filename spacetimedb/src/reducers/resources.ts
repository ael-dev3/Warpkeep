import { SenderError, t } from 'spacetimedb/server';

import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../config';
import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import { markAccountIsConsistent } from '../marksAuthorityPolicy';
import {
  ResourceAuthorityError,
  assertGenesisResourceForFid,
  insertGenesisResourceAccount,
  inspectGenesisResourceGraph,
  planGenesisResourceBackfill,
} from '../resourceAuthority';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  ResourceAuthorityPolicyError,
  planResourceSettlement,
} from '../resourceAuthorityPolicy';
import warpkeep from '../schema';

const myResourceStateV1 = t.object('MyResourceStateV1', {
  fid: t.u64(),
  food: t.u64(),
  wood: t.u64(),
  stone: t.u64(),
  gold: t.u64(),
  pendingFood: t.u64(),
  pendingWood: t.u64(),
  pendingStone: t.u64(),
  pendingGold: t.u64(),
  marksBalanceMicros: t.u128(),
  observedAtMicros: t.u64(),
  settledThroughMicros: t.u64(),
  nextCollectAtMicros: t.u64(),
  revision: t.u64(),
  resourcePolicyVersion: t.string(),
  marksPolicyVersion: t.string(),
  terrainKind: t.string(),
});

const adminAlphaStatusV4 = t.object('AdminAlphaStatusV4', {
  allowedFids: t.u64(),
  castles: t.u64(),
  markAccounts: t.u64(),
  resourceAccounts: t.u64(),
  missingResourceAccounts: t.u64(),
  orphanedResourceAccounts: t.u64(),
  resourceInvariantViolations: t.u64(),
  protocolVersion: t.u32(),
  resourcePolicyVersion: t.string(),
});

function senderPolicyError(error: unknown): never {
  if (
    error instanceof ResourceAuthorityError
    || error instanceof ResourceAuthorityPolicyError
  ) throw new SenderError(error.code);
  throw error;
}

/**
 * Private caller-scoped projection. No FID, clock, rate, or balance is accepted
 * from the browser; all pending yield is calculated from server-owned state.
 */
export const getMyResourceStateV1 = warpkeep.procedure(
  { name: 'get_my_resource_state_v1' },
  myResourceStateV1,
  ctx => ctx.withTx(tx => {
    try {
      const { claims, account, terrainKind } = requireGameplayPlayerV1(tx);
      const marks = tx.db.markAccountV1.fid.find(claims.fid);
      if (marks === null || !markAccountIsConsistent(marks)) {
        throw new SenderError('MARK_ACCOUNT_INVARIANT');
      }
      const observedAtMicros = tx.timestamp.microsSinceUnixEpoch;
      const settlement = planResourceSettlement(account, terrainKind, observedAtMicros);
      return {
        fid: claims.fid,
        food: account.food,
        wood: account.wood,
        stone: account.stone,
        gold: account.gold,
        pendingFood: settlement.deltas.food,
        pendingWood: settlement.deltas.wood,
        pendingStone: settlement.deltas.stone,
        pendingGold: settlement.deltas.gold,
        marksBalanceMicros: marks.balanceMicros,
        observedAtMicros,
        settledThroughMicros: account.settledThroughMicros,
        nextCollectAtMicros: settlement.nextCollectAtMicros,
        revision: account.revision,
        resourcePolicyVersion: account.policyVersion,
        marksPolicyVersion: marks.policyVersion,
        terrainKind,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

/** Settle every complete production quantum exactly once for the caller. */
export const collectResourcesV1 = warpkeep.reducer(
  { name: 'collect_resources_v1' },
  ctx => {
    try {
      const { claims, account, terrainKind } = requireGameplayPlayerV1(ctx);
      const marksBefore = ctx.db.markAccountV1.fid.find(claims.fid);
      if (marksBefore === null || !markAccountIsConsistent(marksBefore)) {
        throw new SenderError('MARK_ACCOUNT_INVARIANT');
      }
      const settlement = planResourceSettlement(
        account,
        terrainKind,
        ctx.timestamp.microsSinceUnixEpoch,
      );
      if (settlement.completedQuanta === 0n) return;
      ctx.db.resourceAccountV1.fid.update({
        ...account,
        ...settlement.balances,
        settledThroughMicros: settlement.settledThroughMicros,
        revision: settlement.revision,
        policyVersion: settlement.policyVersion,
        updatedAt: ctx.timestamp,
      });
      const marksAfter = ctx.db.markAccountV1.fid.find(claims.fid);
      if (
        marksAfter === null
        || marksAfter.totalSnapBurnedMicros !== marksBefore.totalSnapBurnedMicros
        || marksAfter.earnedMicros !== marksBefore.earnedMicros
        || marksAfter.spentMicros !== marksBefore.spentMicros
        || marksAfter.balanceMicros !== marksBefore.balanceMicros
        || marksAfter.policyVersion !== marksBefore.policyVersion
        || !markAccountIsConsistent(marksAfter)
      ) throw new SenderError('MARK_ACCOUNT_INVARIANT');
      assertGenesisResourceForFid(ctx, claims.fid);
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Hermes-only, all-or-nothing migration of legacy founders. Exact reruns do
 * nothing and do not add another audit entry.
 */
export const adminBackfillResourceAccountsV1 = warpkeep.reducer(
  { name: 'admin_backfill_resource_accounts_v1' },
  { expectedFounderCount: t.u64(), policyVersion: t.string() },
  (ctx, { expectedFounderCount, policyVersion }) => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisResourceBackfill(ctx, expectedFounderCount, policyVersion);
      if (plan.missing.length === 0) return;
      for (const entry of plan.missing) {
        insertGenesisResourceAccount(ctx, entry.fid, entry.castle);
      }
      const aggregate = inspectGenesisResourceGraph(ctx);
      if (
        aggregate.resourceAccounts !== expectedFounderCount
        || aggregate.missingResourceAccounts !== 0n
        || aggregate.orphanedResourceAccounts !== 0n
        || aggregate.resourceInvariantViolations !== 0n
      ) throw new SenderError('RESOURCE_BACKFILL_INVARIANT');
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'backfill_resource_accounts_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `created=${plan.missing.length};expected=${expectedFounderCount};policy=${GENESIS_RESOURCE_POLICY_VERSION}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/** Counts-only resource migration and integrity inspection. */
export const adminGetAlphaStatusV4 = warpkeep.procedure(
  { name: 'admin_get_alpha_status_v4' },
  adminAlphaStatusV4,
  ctx => ctx.withTx(tx => {
    requireAdmin(tx);
    const aggregate = inspectGenesisResourceGraph(tx);
    return {
      allowedFids: tx.db.allowedFid.count(),
      castles: tx.db.castle.count(),
      markAccounts: tx.db.markAccountV1.count(),
      ...aggregate,
      protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
      resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    };
  }),
);
