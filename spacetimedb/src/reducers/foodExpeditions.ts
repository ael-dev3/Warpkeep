import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import {
  FOOD_GATHERING_DURATION_MICROS,
  FOOD_GATHER_RATE_PER_QUANTUM,
} from '../foodExpeditionPolicy';
import {
  collectActiveFoodExpedition,
  dispatchGenesisFoodExpedition,
  foodExpeditionErrorCode,
  insertGenesisTierIFoodSite,
  myFoodExpeditionState,
  planGenesisTierIFoodSiteSeed,
} from '../foodExpeditionAuthority';
import {
  FOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_FOOD_SITE_COUNT,
  GENESIS_TIER_I_FOOD_SITE_TIER,
} from '../foodSitePolicy';
import warpkeep from '../schema';

const myFoodExpeditionStateV1 = t.object('MyFoodExpeditionStateV1', {
  active: t.bool(),
  expeditionId: t.option(t.string()),
  siteId: t.option(t.string()),
  originCastleId: t.option(t.u64()),
  phase: t.option(t.string()),
  startedAtMicros: t.option(t.u64()),
  arrivesAtMicros: t.option(t.u64()),
  gatheringEndsAtMicros: t.option(t.u64()),
  returnsAtMicros: t.option(t.u64()),
  accruedFood: t.u64(),
  pendingFood: t.u64(),
  creditedFood: t.u64(),
  rateFoodPerMinute: t.u64(),
  gatheringDurationMicros: t.u64(),
  expeditionPolicyVersion: t.option(t.string()),
});

function senderPolicyError(error: unknown): never {
  const code = foodExpeditionErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

/**
 * Owner-only private Food-wagon read. The public map receives only immutable
 * site rows and identity-minimized occupancy timing; pending Food stays caller
 * scoped and never appears in a subscription.
 */
export const getMyFoodExpeditionStateV1 = warpkeep.procedure(
  { name: 'get_my_food_expedition_state_v1' },
  myFoodExpeditionStateV1,
  ctx => ctx.withTx(tx => {
    try {
      const { claims } = requireGameplayPlayerV1(tx);
      const state = myFoodExpeditionState(tx, claims.fid);
      const expedition = state.expedition;
      if (expedition === undefined) {
        return {
          active: false,
          expeditionId: undefined,
          siteId: undefined,
          originCastleId: undefined,
          phase: undefined,
          startedAtMicros: undefined,
          arrivesAtMicros: undefined,
          gatheringEndsAtMicros: undefined,
          returnsAtMicros: undefined,
          accruedFood: 0n,
          pendingFood: 0n,
          creditedFood: 0n,
          rateFoodPerMinute: FOOD_GATHER_RATE_PER_QUANTUM,
          gatheringDurationMicros: FOOD_GATHERING_DURATION_MICROS,
          expeditionPolicyVersion: undefined,
        };
      }
      return {
        active: true,
        expeditionId: expedition.expeditionId,
        siteId: expedition.siteId,
        originCastleId: expedition.originCastleId,
        phase: expedition.phase,
        startedAtMicros: expedition.startedAtMicros,
        arrivesAtMicros: expedition.arrivesAtMicros,
        gatheringEndsAtMicros: expedition.gatheringEndsAtMicros,
        returnsAtMicros: expedition.returnsAtMicros,
        accruedFood: state.accruedFood,
        pendingFood: state.pendingFood,
        creditedFood: expedition.creditedFood,
        rateFoodPerMinute: FOOD_GATHER_RATE_PER_QUANTUM,
        gatheringDurationMicros: FOOD_GATHERING_DURATION_MICROS,
        expeditionPolicyVersion: expedition.policyVersion,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

/**
 * The browser supplies only a reviewed Food site ID and retry token. Founder
 * identity, castle, route, authoritative clock, raw passive-Food capacity
 * reservation, duration, phase, and exact rate all remain server derived.
 */
export const dispatchFoodExpeditionV1 = warpkeep.reducer(
  { name: 'dispatch_food_expedition_v1' },
  { siteId: t.string(), idempotencyKey: t.string() },
  (ctx, { siteId, idempotencyKey }) => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      dispatchGenesisFoodExpedition(ctx, {
        fid: claims.fid,
        siteId,
        idempotencyKey,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Explicit no-input claim for completed whole Food minutes. It is safe to
 * repeat: only uncredited authoritative accrual is transferred, while the
 * expiry schedule settles the exact remaining cursor once.
 */
export const collectFoodExpeditionV1 = warpkeep.reducer(
  { name: 'collect_food_expedition_v1' },
  ctx => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      collectActiveFoodExpedition(ctx, claims.fid);
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Hermes-only additive seed for the fixed 96-site Tier-I Food catalog. It
 * can add only exact missing canonical rows and never repairs drifted state.
 */
export const adminSeedGenesisTierIFoodSitesV1 = warpkeep.reducer(
  { name: 'admin_seed_genesis_tier_i_food_sites_v1' },
  { expectedSiteCount: t.u64(), policyVersion: t.string() },
  (ctx, { expectedSiteCount, policyVersion }) => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisTierIFoodSiteSeed(ctx, expectedSiteCount, policyVersion);
      if (plan.missing.length === 0) return;
      for (const site of plan.missing) insertGenesisTierIFoodSite(ctx, site);
      const after = planGenesisTierIFoodSiteSeed(
        ctx,
        BigInt(GENESIS_TIER_I_FOOD_SITE_COUNT),
        FOOD_SITE_POLICY_VERSION,
      );
      if (after.missing.length !== 0 || ctx.db.foodSiteV1.count() !== expectedSiteCount) {
        throw new SenderError('FOOD_SITE_SEED_INTEGRITY');
      }
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'seed_genesis_tier_i_food_sites_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `count=${GENESIS_TIER_I_FOOD_SITE_COUNT};tier=${GENESIS_TIER_I_FOOD_SITE_TIER};policy=${FOOD_SITE_POLICY_VERSION}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);
