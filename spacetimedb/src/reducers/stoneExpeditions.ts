import { SenderError, t } from 'spacetimedb/server';

import { requireAdmin, requireGameplayPlayerV1 } from '../auth';
import {
  STONE_GATHERING_DURATION_MICROS,
  STONE_GATHER_RATE_PER_QUANTUM,
} from '../stoneExpeditionPolicy';
import {
  collectActiveStoneExpedition,
  dispatchGenesisStoneExpedition,
  stoneExpeditionErrorCode,
  insertGenesisTierIStoneSite,
  myStoneExpeditionState,
  planGenesisTierIStoneSiteSeed,
} from '../stoneExpeditionAuthority';
import {
  STONE_SITE_POLICY_VERSION,
  GENESIS_TIER_I_STONE_SITE_COUNT,
  GENESIS_TIER_I_STONE_SITE_TIER,
} from '../stoneSitePolicy';
import warpkeep from '../schema';

const myStoneExpeditionStateV1 = t.object('MyStoneExpeditionStateV1', {
  active: t.bool(),
  expeditionId: t.option(t.string()),
  siteId: t.option(t.string()),
  originCastleId: t.option(t.u64()),
  phase: t.option(t.string()),
  startedAtMicros: t.option(t.u64()),
  arrivesAtMicros: t.option(t.u64()),
  gatheringEndsAtMicros: t.option(t.u64()),
  returnsAtMicros: t.option(t.u64()),
  accruedStone: t.u64(),
  pendingStone: t.u64(),
  creditedStone: t.u64(),
  rateStonePerMinute: t.u64(),
  gatheringDurationMicros: t.u64(),
  expeditionPolicyVersion: t.option(t.string()),
});

function senderPolicyError(error: unknown): never {
  const code = stoneExpeditionErrorCode(error);
  if (code !== undefined) throw new SenderError(code);
  throw error;
}

/**
 * Owner-only private Stone-wagon read. The public map receives only immutable
 * site rows and identity-minimized occupancy timing; pending Stone stays caller
 * scoped and never appears in a subscription.
 */
export const getMyStoneExpeditionStateV1 = warpkeep.procedure(
  { name: 'get_my_stone_expedition_state_v1' },
  myStoneExpeditionStateV1,
  ctx => ctx.withTx(tx => {
    try {
      const { claims } = requireGameplayPlayerV1(tx);
      const state = myStoneExpeditionState(tx, claims.fid);
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
          accruedStone: 0n,
          pendingStone: 0n,
          creditedStone: 0n,
          rateStonePerMinute: STONE_GATHER_RATE_PER_QUANTUM,
          gatheringDurationMicros: STONE_GATHERING_DURATION_MICROS,
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
        accruedStone: state.accruedStone,
        pendingStone: state.pendingStone,
        creditedStone: expedition.creditedStone,
        rateStonePerMinute: STONE_GATHER_RATE_PER_QUANTUM,
        gatheringDurationMicros: STONE_GATHERING_DURATION_MICROS,
        expeditionPolicyVersion: expedition.policyVersion,
      };
    } catch (error) {
      return senderPolicyError(error);
    }
  }),
);

/**
 * The browser supplies only a reviewed Stone site ID and retry token. Founder
 * identity, castle, route, authoritative clock, raw passive-Stone capacity
 * reservation, duration, phase, and exact rate all remain server derived.
 */
export const dispatchStoneExpeditionV1 = warpkeep.reducer(
  { name: 'dispatch_stone_expedition_v1' },
  { siteId: t.string(), idempotencyKey: t.string() },
  (ctx, { siteId, idempotencyKey }) => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      dispatchGenesisStoneExpedition(ctx, {
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
 * Explicit no-input claim for completed whole Stone minutes. It is safe to
 * repeat: only uncredited authoritative accrual is transferred, while the
 * expiry schedule settles the exact remaining cursor once.
 */
export const collectStoneExpeditionV1 = warpkeep.reducer(
  { name: 'collect_stone_expedition_v1' },
  ctx => {
    try {
      const { claims } = requireGameplayPlayerV1(ctx);
      collectActiveStoneExpedition(ctx, claims.fid);
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);

/**
 * Hermes-only additive seed for the fixed 96-site Tier-I Stone catalog. It
 * can add only exact missing canonical rows and never repairs drifted state.
 */
export const adminSeedGenesisTierIStoneSitesV1 = warpkeep.reducer(
  { name: 'admin_seed_genesis_tier_i_stone_sites_v1' },
  { expectedSiteCount: t.u64(), policyVersion: t.string() },
  (ctx, { expectedSiteCount, policyVersion }) => {
    try {
      const admin = requireAdmin(ctx);
      const plan = planGenesisTierIStoneSiteSeed(ctx, expectedSiteCount, policyVersion);
      if (plan.missing.length === 0) return;
      for (const site of plan.missing) insertGenesisTierIStoneSite(ctx, site);
      const after = planGenesisTierIStoneSiteSeed(
        ctx,
        BigInt(GENESIS_TIER_I_STONE_SITE_COUNT),
        STONE_SITE_POLICY_VERSION,
      );
      if (after.missing.length !== 0 || ctx.db.stoneSiteV1.count() !== expectedSiteCount) {
        throw new SenderError('STONE_SITE_SEED_INTEGRITY');
      }
      ctx.db.adminAudit.insert({
        id: 0n,
        action: 'seed_genesis_tier_i_stone_sites_v1',
        targetFid: undefined,
        actorSubject: admin.subject,
        createdAt: ctx.timestamp,
        note: `count=${GENESIS_TIER_I_STONE_SITE_COUNT};tier=${GENESIS_TIER_I_STONE_SITE_TIER};policy=${STONE_SITE_POLICY_VERSION}`,
      });
    } catch (error) {
      return senderPolicyError(error);
    }
  },
);
