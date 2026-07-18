import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  GOLD_EXPEDITION_POLICY_VERSION,
  GOLD_GATHERING_DURATION_MICROS,
  GOLD_GATHERING_TOTAL_GOLD,
  GOLD_GATHER_QUANTUM_MICROS,
  GoldExpeditionPolicyError,
  assertGoldExpeditionCapacity,
  assertGoldExpeditionIdempotencyKey,
  goldExpeditionStateIsConsistent,
  planGoldExpeditionAccrual,
  planGoldExpeditionTimeline,
} from '../src/goldExpeditionPolicy';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
  GENESIS_TIER_I_GOLD_SITE_COUNT,
  GENESIS_TIER_I_GOLD_SITE_DIGEST,
  GOLD_SITE_POLICY_VERSION,
  canonicalPassableRouteSteps,
  canonicalTierIGoldSiteDigestInput,
} from '../src/goldSitePolicy';
import { RESOURCE_BALANCE_CAP } from '../src/resourceAuthorityPolicy';
import { canonicalMetaForKey } from '../src/world';

const START = 1_800_000_000_000_000n;

function state(change: Partial<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedGold: bigint;
  creditedGold: bigint;
  policyVersion: string;
}> = {}) {
  const timeline = planGoldExpeditionTimeline(START, 4);
  return {
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedGold: 0n,
    creditedGold: 0n,
    policyVersion: GOLD_EXPEDITION_POLICY_VERSION,
    ...change,
  };
}

test('the Tier-I pilot is exactly 24 active resource-capable Genesis sites with a pinned digest', () => {
  assert.equal(CANONICAL_TIER_I_GOLD_SITES_V1.length, GENESIS_TIER_I_GOLD_SITE_COUNT);
  assert.equal(
    createHash('sha256').update(canonicalTierIGoldSiteDigestInput()).digest('hex'),
    GENESIS_TIER_I_GOLD_SITE_DIGEST,
  );
  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const site of CANONICAL_TIER_I_GOLD_SITES_V1) {
    assert.equal(ids.has(site.siteId), false);
    assert.equal(coordinates.has(`${site.q},${site.r}`), false);
    ids.add(site.siteId);
    coordinates.add(`${site.q},${site.r}`);
    assert.equal(site.active, true);
    assert.equal(site.tier, 1);
    const meta = canonicalMetaForKey(`${site.q},${site.r}`);
    assert.equal(meta?.passable, true);
    assert.equal(meta?.staticContentKind, 'resource-capable');
  }
  assert.equal(GOLD_SITE_POLICY_VERSION, 'genesis-001-tier1-gold-sites-v2');
});

test('a wagon route uses the canonical passable graph rather than a browser-supplied distance', () => {
  const site = CANONICAL_TIER_I_GOLD_SITES_V1[0]!;
  const route = canonicalPassableRouteSteps({ q: 0, r: 0 }, site);
  assert.equal(typeof route, 'number');
  assert.ok(route! > 0);
  assert.equal(canonicalPassableRouteSteps(site, site), 0);
  assert.equal(canonicalPassableRouteSteps({ q: 999, r: 999 }, site), undefined);
});

test('timeline has a deterministic round trip and exactly thirty days of gathering', () => {
  const timeline = planGoldExpeditionTimeline(START, 7);
  assert.equal(timeline.arrivesAtMicros, START + 210_000_000n);
  assert.equal(
    timeline.gatheringEndsAtMicros - timeline.arrivesAtMicros,
    GOLD_GATHERING_DURATION_MICROS,
  );
  assert.equal(timeline.returnsAtMicros - timeline.gatheringEndsAtMicros, 210_000_000n);
  assert.throws(
    () => planGoldExpeditionTimeline(START, 0),
    /GOLD_EXPEDITION_ROUTE_INVALID/,
  );
});

test('one Gold per completed minute is visible as private pending accrual without per-minute writes', () => {
  const initial = state();
  const beforeArrival = planGoldExpeditionAccrual(
    initial,
    initial.arrivesAtMicros - 1n,
  );
  assert.deepEqual(beforeArrival, {
    accruedGold: 0n,
    newlyAccruedGold: 0n,
    completedQuanta: 0n,
    settledThroughMicros: initial.arrivesAtMicros,
  });
  const afterThreeMinutes = planGoldExpeditionAccrual(
    initial,
    initial.arrivesAtMicros + (3n * GOLD_GATHER_QUANTUM_MICROS) + 11n,
  );
  assert.equal(afterThreeMinutes.newlyAccruedGold, 3n);
  assert.equal(afterThreeMinutes.accruedGold, 3n);
  assert.equal(afterThreeMinutes.settledThroughMicros,
    initial.arrivesAtMicros + (3n * GOLD_GATHER_QUANTUM_MICROS));

  const end = planGoldExpeditionAccrual(initial, initial.gatheringEndsAtMicros);
  assert.equal(end.completedQuanta, GOLD_GATHERING_TOTAL_GOLD);
  assert.equal(end.accruedGold, 43_200n);
  assert.equal(end.accruedGold, GOLD_GATHERING_TOTAL_GOLD);
  const replay = planGoldExpeditionAccrual({
    ...initial,
    settledThroughMicros: end.settledThroughMicros,
    accruedGold: end.accruedGold,
    creditedGold: end.accruedGold,
  }, initial.returnsAtMicros);
  assert.equal(replay.newlyAccruedGold, 0n);
  assert.equal(replay.accruedGold, GOLD_GATHERING_TOTAL_GOLD);
});

test('corrupt cursors, unknown phase, and insufficient full-trip capacity fail closed', () => {
  assert.equal(goldExpeditionStateIsConsistent(state()), true);
  assert.equal(goldExpeditionStateIsConsistent(state({ phase: 'teleporting' })), false);
  assert.equal(goldExpeditionStateIsConsistent(state({ creditedGold: 1n })), false);
  assert.throws(
    () => planGoldExpeditionAccrual(state({ phase: 'teleporting' }), START),
    (error: unknown) => error instanceof GoldExpeditionPolicyError
      && error.code === 'GOLD_EXPEDITION_STATE_INVALID',
  );
  assert.doesNotThrow(() => assertGoldExpeditionCapacity(
    RESOURCE_BALANCE_CAP - GOLD_GATHERING_TOTAL_GOLD,
    RESOURCE_BALANCE_CAP,
  ));
  assert.throws(
    () => assertGoldExpeditionCapacity(
      RESOURCE_BALANCE_CAP - GOLD_GATHERING_TOTAL_GOLD + 1n,
      RESOURCE_BALANCE_CAP,
    ),
    /GOLD_EXPEDITION_ACCOUNT_CAPACITY/,
  );
});

test('idempotency keys are bounded UUID-like client request tokens', () => {
  assert.doesNotThrow(() => assertGoldExpeditionIdempotencyKey('00000000-0000-4000-8000-000000000000'));
  for (const key of ['', 'short', 'UPPERCASE-0000-0000-0000', 'a'.repeat(81), 'key:breakout-0000-0000']) {
    assert.throws(() => assertGoldExpeditionIdempotencyKey(key), /GOLD_EXPEDITION_IDEMPOTENCY_KEY_INVALID/);
  }
});
