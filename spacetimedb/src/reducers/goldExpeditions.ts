import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import {
  GOLD_GATHERING_DURATION_MICROS,
  GOLD_GATHER_RATE_PER_QUANTUM,
} from '../goldExpeditionPolicy';
import {
  collectActiveGoldExpedition,
  dispatchGenesisGoldExpedition,
  goldExpeditionErrorCode,
  insertGenesisTierIGoldSite,
  myGoldExpeditionState,
  planGenesisTierIGoldSiteSeed,
} from '../goldExpeditionAuthority';
import {
  GENESIS_TIER_I_GOLD_SITE_COUNT,
  GENESIS_TIER_I_GOLD_SITE_TIER,
  GOLD_SITE_POLICY_VERSION,
} from '../goldSitePolicy';
import warpkeep from '../schema';

const myGoldExpeditionStateV1 = t.object('MyGoldExpeditionStateV1', {
  active: t.bool(),
  expeditionId: t.option(t.string()),
  siteId: t.option(t.string()),
  originCastleId: t.option(t.u64()),
  phase: t.option(t.string()),
  startedAtMicros: t.option(t.u64()),
  arrivesAtMicros: t.option(t.u64()),
  gatheringEndsAtMicros: t.option(t.u64()),
  returnsAtMicros: t.option(t.u64()),
  accruedGold: t.u64(),
  pendingGold: t.u64(),
  creditedGold: t.u64(),
  rateGoldPerMinute: t.u64(),
  gatheringDurationMicros: t.u64(),
  expeditionPolicyVersion: t.option(t.string()),
});

function senderPolicyError(error: unknown): never {
  const code = goldExpeditionErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

/**
 * Owner-only private read. The public map subscribes only to the site catalog
 * and occupancy state; accrued/pending Gold never crosses that boundary.
 */
export const getMyGoldExpeditionStateV1 = warpkeep.procedure(
  { name: 'get_my_gold_expedition_state_v1' },
  myGoldExpeditionStateV1,
  ctx => ctx.withTx(tx => {
    try {
      const { claims } = requireGameplayPlayerV1(tx);
      const state = myGoldExpeditionState(tx, claims.fid);
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
          accruedGold: 0n,
          pendingGold: 0n,
          creditedGold: 0n,
          rateGoldPerMinute: GOLD_GATHER_RATE_PER_QUANTUM,
          gatheringDurationMicros: GOLD_GATHERING_DURATION_MICROS,
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
        accruedGold: state.accruedGold,
        pendingGold: state.pendingGold,
        creditedGold: expedition.creditedGold,
        rateGoldPerMinute: GOLD_GATHER_RATE_PER_QUANTUM,
        gatheringDurationMicros: GOLD_GATHERING_DURATION_MICROS,
        expeditionPolicyVersion: expedition.policyVersion,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

/**
 * The browser supplies only an approved site identifier and an idempotency
 * token. Its FID, castle, timestamp, route, duration, phase, and reward are
 * all established by the current private authority graph.
 */
export const dispatchGoldExpeditionV1 = warpkeep.reducer(
  { name: 'dispatch_gold_expedition_v1' },
  { siteId: t.string(), idempotencyKey: t.string() },
  (ctx, { siteId, idempotencyKey }) => {
    try {
      const { claims, account, castle } = requireGameplayPlayerV1(ctx);
      dispatchGenesisGoldExpedition(ctx, {
        fid: claims.fid,
        account,
        castle,
        siteId,
        idempotencyKey,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Retained no-input settlement for completed whole Gold minutes. Repeated
 * calls transfer only uncredited server-time accrual, and scheduled expiry
 * settles the remaining cursor exactly once.
 */
export const collectGoldExpeditionV1 = warpkeep.reducer(
  { name: 'collect_gold_expedition_v1' },
  ctx => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      collectActiveGoldExpedition(ctx, claims.fid);
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Hermes-only additive seed. It may create the exact missing records for the
 * reviewed Genesis pilot, but it never overwrites a drifted or unknown site.
 */
export const adminSeedGenesisTierIGoldSitesV1 = warpkeep.reducer(
  { name: 'admin_seed_genesis_tier_i_gold_sites_v1' },
  { expectedSiteCount: t.u64(), policyVersion: t.string() },
  (ctx, { expectedSiteCount, policyVersion }) => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisTierIGoldSiteSeed(ctx, expectedSiteCount, policyVersion);
      if (plan.missing.length === 0) return;
      for (const site of plan.missing) insertGenesisTierIGoldSite(ctx, site);
      const after = planGenesisTierIGoldSiteSeed(
        ctx,
        BigInt(GENESIS_TIER_I_GOLD_SITE_COUNT),
        GOLD_SITE_POLICY_VERSION,
      );
      if (after.missing.length !== 0 || ctx.db.goldSiteV1.count() !== expectedSiteCount) {
        throw new SenderError('GOLD_SITE_SEED_INTEGRITY');
      }
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'seed_genesis_tier_i_gold_sites_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `count=${GENESIS_TIER_I_GOLD_SITE_COUNT};tier=${GENESIS_TIER_I_GOLD_SITE_TIER};policy=${GOLD_SITE_POLICY_VERSION}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);
