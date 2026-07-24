import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import {
  WOOD_GATHERING_DURATION_MICROS,
  WOOD_GATHER_RATE_PER_QUANTUM,
} from '../woodExpeditionPolicy';
import {
  collectActiveWoodExpedition,
  dispatchGenesisWoodExpedition,
  woodExpeditionErrorCode,
  insertGenesisTierIWoodSite,
  myWoodExpeditionState,
  planGenesisTierIWoodSiteSeed,
} from '../woodExpeditionAuthority';
import {
  WOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_WOOD_SITE_COUNT,
  GENESIS_TIER_I_WOOD_SITE_TIER,
} from '../woodSitePolicy';
import warpkeep from '../schema';

const myWoodExpeditionStateV1 = t.object('MyWoodExpeditionStateV1', {
  active: t.bool(),
  expeditionId: t.option(t.string()),
  siteId: t.option(t.string()),
  originCastleId: t.option(t.u64()),
  phase: t.option(t.string()),
  startedAtMicros: t.option(t.u64()),
  arrivesAtMicros: t.option(t.u64()),
  gatheringEndsAtMicros: t.option(t.u64()),
  returnsAtMicros: t.option(t.u64()),
  accruedWood: t.u64(),
  pendingWood: t.u64(),
  creditedWood: t.u64(),
  rateWoodPerMinute: t.u64(),
  gatheringDurationMicros: t.u64(),
  expeditionPolicyVersion: t.option(t.string()),
});

function senderPolicyError(error: unknown): never {
  const code = woodExpeditionErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

/**
 * Owner-only private Wood-wagon read. The public map receives only immutable
 * site rows and identity-minimized occupancy timing; pending Wood stays caller
 * scoped and never appears in a subscription.
 */
export const getMyWoodExpeditionStateV1 = warpkeep.procedure(
  { name: 'get_my_wood_expedition_state_v1' },
  myWoodExpeditionStateV1,
  ctx => ctx.withTx(tx => {
    try {
      const { claims } = requireGameplayPlayerV1(tx);
      const state = myWoodExpeditionState(tx, claims.fid);
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
          accruedWood: 0n,
          pendingWood: 0n,
          creditedWood: 0n,
          rateWoodPerMinute: WOOD_GATHER_RATE_PER_QUANTUM,
          gatheringDurationMicros: WOOD_GATHERING_DURATION_MICROS,
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
        accruedWood: state.accruedWood,
        pendingWood: state.pendingWood,
        creditedWood: expedition.creditedWood,
        rateWoodPerMinute: WOOD_GATHER_RATE_PER_QUANTUM,
        gatheringDurationMicros: WOOD_GATHERING_DURATION_MICROS,
        expeditionPolicyVersion: expedition.policyVersion,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

/**
 * The browser supplies only a reviewed Wood site ID and retry token. Founder
 * identity, castle, route, authoritative clock, raw passive-Wood capacity
 * reservation, duration, phase, and exact rate all remain server derived.
 */
export const dispatchWoodExpeditionV1 = warpkeep.reducer(
  { name: 'dispatch_wood_expedition_v1' },
  { siteId: t.string(), idempotencyKey: t.string() },
  (ctx, { siteId, idempotencyKey }) => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      dispatchGenesisWoodExpedition(ctx, {
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
 * Retained no-input settlement for completed whole Wood minutes. Repeated
 * calls transfer only uncredited authoritative accrual, while expiry settles
 * the exact remaining cursor once.
 */
export const collectWoodExpeditionV1 = warpkeep.reducer(
  { name: 'collect_wood_expedition_v1' },
  ctx => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      collectActiveWoodExpedition(ctx, claims.fid);
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Hermes-only additive seed for the fixed 96-site Tier-I Wood catalog. It
 * can add only exact missing canonical rows and never repairs drifted state.
 */
export const adminSeedGenesisTierIWoodSitesV1 = warpkeep.reducer(
  { name: 'admin_seed_genesis_tier_i_wood_sites_v1' },
  { expectedSiteCount: t.u64(), policyVersion: t.string() },
  (ctx, { expectedSiteCount, policyVersion }) => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisTierIWoodSiteSeed(ctx, expectedSiteCount, policyVersion);
      if (plan.missing.length === 0) return;
      for (const site of plan.missing) insertGenesisTierIWoodSite(ctx, site);
      const after = planGenesisTierIWoodSiteSeed(
        ctx,
        BigInt(GENESIS_TIER_I_WOOD_SITE_COUNT),
        WOOD_SITE_POLICY_VERSION,
      );
      if (after.missing.length !== 0 || ctx.db.woodSiteV1.count() !== expectedSiteCount) {
        throw new SenderError('WOOD_SITE_SEED_INTEGRITY');
      }
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'seed_genesis_tier_i_wood_sites_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `count=${GENESIS_TIER_I_WOOD_SITE_COUNT};tier=${GENESIS_TIER_I_WOOD_SITE_TIER};policy=${WOOD_SITE_POLICY_VERSION}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);
