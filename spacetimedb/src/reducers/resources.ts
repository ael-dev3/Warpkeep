import { SenderError, t } from 'spacetimedb/server';

import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../config';
import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import { castleWorkerErrorCode, settleAllWorkerAssignmentsForFid } from '../castleWorkerAuthority';
import { markAccountIsConsistent } from '../marksAuthorityPolicy';
import {
  ResourceAuthorityError,
  assertGenesisResourceForFid,
  insertGenesisResourceAccount,
  inspectGenesisResourceGraph,
  planGenesisResourceBackfill,
} from '../resourceAuthority';
import {
  collectActiveGoldExpedition,
  goldExpeditionErrorCode,
  myGoldExpeditionState,
} from '../goldExpeditionAuthority';
import {
  collectActiveFoodExpedition,
  foodExpeditionErrorCode,
  myFoodExpeditionState,
} from '../foodExpeditionAuthority';
import {
  collectActiveWoodExpedition,
  myWoodExpeditionState,
  woodExpeditionErrorCode,
} from '../woodExpeditionAuthority';
import {
  collectActiveStoneExpedition,
  myStoneExpeditionState,
  stoneExpeditionErrorCode,
} from '../stoneExpeditionAuthority';
import {
  ResourceExpeditionReservationAuthorityError,
  planResourceSettlementForActiveExpeditionReservations,
} from '../resourceExpeditionReservationAuthority';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  ResourceAuthorityPolicyError,
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
  const workerCode = castleWorkerErrorCode(error);
  if (workerCode !== undefined) throw new SenderError(workerCode);
  const foodExpeditionCode = foodExpeditionErrorCode(error);
  if (foodExpeditionCode !== undefined) throw new SenderError(foodExpeditionCode);
  const woodExpeditionCode = woodExpeditionErrorCode(error);
  if (woodExpeditionCode !== undefined) throw new SenderError(woodExpeditionCode);
  const stoneExpeditionCode = stoneExpeditionErrorCode(error);
  if (stoneExpeditionCode !== undefined) throw new SenderError(stoneExpeditionCode);
  const goldExpeditionCode = goldExpeditionErrorCode(error);
  if (goldExpeditionCode !== undefined) throw new SenderError(goldExpeditionCode);
  if (
    error instanceof ResourceAuthorityError
    || error instanceof ResourceExpeditionReservationAuthorityError
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
      const settlement = planResourceSettlementForActiveExpeditionReservations(
        tx,
        claims.fid,
        account,
        terrainKind,
        observedAtMicros,
      );
      const expedition = myGoldExpeditionState(tx, claims.fid);
      const foodExpedition = myFoodExpeditionState(tx, claims.fid);
      const woodExpedition = myWoodExpeditionState(tx, claims.fid);
      const stoneExpedition = myStoneExpeditionState(tx, claims.fid);
      return {
        fid: claims.fid,
        food: account.food,
        wood: account.wood,
        stone: account.stone,
        gold: account.gold,
        // A Food wagon and passive terrain yield share one private inventory,
        // so the existing HUD resource projection truthfully includes both
        // whole-minute expedition Food and pending ten-minute terrain Food.
        pendingFood: settlement.deltas.food + foodExpedition.pendingFood,
        // Wood follows the same private, server-time-only whole-minute
        // aggregation as Food; no public occupation row can alter this value.
        pendingWood: settlement.deltas.wood + woodExpedition.pendingWood,
        pendingStone: settlement.deltas.stone + stoneExpedition.pendingStone,
        // Passive terrain Gold is zero under the Tier-I pilot. This private
        // aggregate nevertheless carries any whole-minute, unclaimed wagon
        // Gold so the existing HUD state cannot silently under-report it.
        pendingGold: settlement.deltas.gold + expedition.pendingGold,
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
      const { claims } = requireGameplayPlayerV1(ctx);
      const marksBefore = ctx.db.markAccountV1.fid.find(claims.fid);
      if (marksBefore === null || !markAccountIsConsistent(marksBefore)) {
        throw new SenderError('MARK_ACCOUNT_INVARIANT');
      }
      // Claim all capacity-reserved expedition fields before one passive
      // settlement at the same server moment. This prevents a delayed Food,
      // Wood, or Stone schedule (or a resource-specific settlement) from
      // consuming another resource's remaining award with a capped passive
      // update first.
      collectActiveFoodExpedition(ctx, claims.fid);
      collectActiveWoodExpedition(ctx, claims.fid);
      collectActiveStoneExpedition(ctx, claims.fid);
      // Generic workers settle into the same private inventory at this exact
      // server timestamp. This keeps the legacy collect reducer compatible
      // while new clients use get_my_resource_state_v2 for no-write reads.
      settleAllWorkerAssignmentsForFid(ctx, claims.fid);
      const resourceAfterExpeditions = assertGenesisResourceForFid(ctx, claims.fid);
      const settlement = planResourceSettlementForActiveExpeditionReservations(
        ctx,
        claims.fid,
        resourceAfterExpeditions.account,
        resourceAfterExpeditions.terrainKind,
        ctx.timestamp.microsSinceUnixEpoch,
      );
      if (settlement.completedQuanta !== 0n) {
        ctx.db.resourceAccountV1.fid.update({
          ...resourceAfterExpeditions.account,
          ...settlement.balances,
          settledThroughMicros: settlement.settledThroughMicros,
          revision: settlement.revision,
          policyVersion: settlement.policyVersion,
          updatedAt: ctx.timestamp,
        });
      }
      // Whole-inventory collection also claims active Gold. Gold uses a
      // separate wagon table and balances only its Gold field, so a founder
      // may collect concurrent Food and Gold expeditions in one action.
      collectActiveGoldExpedition(ctx, claims.fid);
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
