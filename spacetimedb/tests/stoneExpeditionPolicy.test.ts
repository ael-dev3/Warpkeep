import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  STONE_EXPEDITION_POLICY_VERSION,
  STONE_GATHERING_DURATION_MICROS,
  STONE_GATHERING_TOTAL_STONE,
  STONE_GATHER_QUANTUM_MICROS,
  StoneExpeditionPolicyError,
  assertStoneExpeditionCapacity,
  assertStoneExpeditionIdempotencyKey,
  stoneExpeditionStateIsConsistent,
  planStoneExpeditionAccrual,
  planStoneExpeditionTimeline,
} from '../src/stoneExpeditionPolicy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
  STONE_SITE_CASTLE_CLEARANCE_STEPS,
  STONE_SITE_CORRIDOR_CLEARANCE_STEPS,
  STONE_SITE_POLICY_VERSION,
  GENESIS_TIER_I_STONE_SITE_CANDIDATE_COUNT,
  GENESIS_TIER_I_STONE_SITE_COUNT,
  GENESIS_TIER_I_STONE_SITE_DIGEST,
  canonicalTierIStoneSiteDigestInput,
} from '../src/stoneSitePolicy';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
} from '../src/forestLayoutPolicy';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../src/foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../src/goldSitePolicy';
import {
  REALM_RESOURCE_POLICY_VERSION,
  RESOURCE_BALANCE_CAP,
  planRawResourceSettlement,
  planResourceSettlement,
  planResourceSettlementWithExpeditionReservations,
} from '../src/resourceAuthorityPolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_WORLD_TILES,
  canonicalMetaForKey,
  hasCanonicalTravelCorridorClearance,
  hexDistance,
  hexKey,
  neighboringHexes,
} from '../src/world';

const START = 1_800_000_000_000_000n;

function state(change: Partial<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedStone: bigint;
  creditedStone: bigint;
  policyVersion: string;
}> = {}) {
  const timeline = planStoneExpeditionTimeline(START, 4);
  return {
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedStone: 0n,
    creditedStone: 0n,
    policyVersion: STONE_EXPEDITION_POLICY_VERSION,
    ...change,
  };
}

test('the Tier-I Stone catalog is pinned to 96 broadly distributed heath sites', () => {
  const goldKeys = new Set(CANONICAL_TIER_I_GOLD_SITES_V1.map(site => `${site.q},${site.r}`));
  const foodKeys = new Set(CANONICAL_TIER_I_FOOD_SITES_V1.map(site => `${site.q},${site.r}`));
  const forestClearanceKeys = new Set(
    CANONICAL_GENESIS_FOREST_INSTANCES_V1.flatMap(instance => [
      instance.tileKey,
      ...neighboringHexes(instance).map(neighbor => hexKey(neighbor.q, neighbor.r)),
    ]),
  );
  const eligibleCandidates = CANONICAL_WORLD_TILES.filter(tile => {
    const meta = canonicalMetaForKey(tile.key);
    return meta?.passable === true
      && meta.staticContentKind === 'resource-capable'
      && meta.terrainKind === 'heath'
      && !goldKeys.has(tile.key)
      && !foodKeys.has(tile.key)
      && !forestClearanceKeys.has(tile.key)
      && CANONICAL_CASTLE_SLOTS.every(slot => (
        hexDistance(tile, slot) > STONE_SITE_CASTLE_CLEARANCE_STEPS
      ))
      && !hasCanonicalTravelCorridorClearance(tile, STONE_SITE_CORRIDOR_CLEARANCE_STEPS);
  });

  // The exact pool is itself reviewable: it is broad enough for the 96-site
  // farthest-point catalog and includes the outer authoritative generation.
  assert.equal(GENESIS_TIER_I_STONE_SITE_CANDIDATE_COUNT, 169);
  assert.equal(eligibleCandidates.length, GENESIS_TIER_I_STONE_SITE_CANDIDATE_COUNT);
  assert.equal(CANONICAL_TIER_I_STONE_SITES_V1.length, GENESIS_TIER_I_STONE_SITE_COUNT);
  assert.equal(
    createHash('sha256').update(canonicalTierIStoneSiteDigestInput()).digest('hex'),
    GENESIS_TIER_I_STONE_SITE_DIGEST,
  );

  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const site of CANONICAL_TIER_I_STONE_SITES_V1) {
    const key = `${site.q},${site.r}`;
    const meta = canonicalMetaForKey(key);
    assert.equal(ids.has(site.siteId), false);
    assert.equal(coordinates.has(key), false);
    ids.add(site.siteId);
    coordinates.add(key);
    assert.equal(site.active, true);
    assert.equal(site.tier, 1);
    assert.ok(meta !== undefined);
    assert.equal(meta?.passable, true);
    assert.equal(meta?.staticContentKind, 'resource-capable');
    assert.equal(meta?.terrainKind, 'heath');
    assert.equal(goldKeys.has(key), false);
    assert.equal(foodKeys.has(key), false);
    assert.equal(forestClearanceKeys.has(key), false);
    assert.equal(hasCanonicalTravelCorridorClearance(site, STONE_SITE_CORRIDOR_CLEARANCE_STEPS), false);
    assert.equal(CANONICAL_CASTLE_SLOTS.some(slot => (
      hexDistance(site, slot) <= STONE_SITE_CASTLE_CLEARANCE_STEPS
    )), false);
  }

  assert.equal(Math.min(...CANONICAL_TIER_I_STONE_SITES_V1.map(site => hexDistance(site))), 22);
  assert.equal(Math.max(...CANONICAL_TIER_I_STONE_SITES_V1.map(site => hexDistance(site))), 58);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(sector => (
    CANONICAL_TIER_I_STONE_SITES_V1.filter(site => (
      canonicalMetaForKey(`${site.q},${site.r}`)?.sector === sector
    )).length
  )), [16, 11, 19, 13, 16, 21]);
  assert.equal(STONE_SITE_POLICY_VERSION, 'genesis-001-tier1-stone-sites-v2');
});

test('Stone timing is a deterministic round trip with exactly thirty days at one Stone/minute', () => {
  const timeline = planStoneExpeditionTimeline(START, 7);
  assert.equal(timeline.arrivesAtMicros, START + 210_000_000n);
  assert.equal(
    timeline.gatheringEndsAtMicros - timeline.arrivesAtMicros,
    STONE_GATHERING_DURATION_MICROS,
  );
  assert.equal(timeline.returnsAtMicros - timeline.gatheringEndsAtMicros, 210_000_000n);
  assert.throws(
    () => planStoneExpeditionTimeline(START, 0),
    /STONE_EXPEDITION_ROUTE_INVALID/,
  );

  const initial = state();
  const afterThreeMinutes = planStoneExpeditionAccrual(
    initial,
    initial.arrivesAtMicros + (3n * STONE_GATHER_QUANTUM_MICROS) + 11n,
  );
  assert.equal(afterThreeMinutes.newlyAccruedStone, 3n);
  assert.equal(afterThreeMinutes.accruedStone, 3n);
  const end = planStoneExpeditionAccrual(initial, initial.gatheringEndsAtMicros);
  assert.equal(end.completedQuanta, STONE_GATHERING_TOTAL_STONE);
  assert.equal(end.accruedStone, 43_200n);
  assert.equal(end.accruedStone, STONE_GATHERING_TOTAL_STONE);
});

test('Stone preflight reserves raw passive Stone through the gathering deadline', () => {
  const timeline = planStoneExpeditionTimeline(START, 4);
  const exactCapacityAccount = {
    food: 0n,
    wood: 0n,
    stone: 935_200n,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  const exactRawProjection = planRawResourceSettlement(
    exactCapacityAccount,
    'heath',
    timeline.gatheringEndsAtMicros,
  );
  assert.equal(exactRawProjection.rawDeltas.stone, 21_600n);
  assert.equal(exactRawProjection.rawBalances.stone, 956_800n);
  assert.doesNotThrow(() => assertStoneExpeditionCapacity(
    exactRawProjection.rawBalances.stone,
    0n,
    RESOURCE_BALANCE_CAP,
  ));

  const oneOverAccount = { ...exactCapacityAccount, stone: 935_201n };
  const oneOverRawProjection = planRawResourceSettlement(
    oneOverAccount,
    'heath',
    timeline.gatheringEndsAtMicros,
  );
  assert.throws(
    () => assertStoneExpeditionCapacity(
      oneOverRawProjection.rawBalances.stone,
      0n,
      RESOURCE_BALANCE_CAP,
    ),
    /STONE_EXPEDITION_ACCOUNT_CAPACITY/,
  );

  // A capped ordinary settlement would obscure this future passive Stone.
  // The raw projection must not: dispatch needs capacity for it plus 43,200
  // gathering Stone before an expedition can start.
  const nearCapAccount = { ...exactCapacityAccount, stone: RESOURCE_BALANCE_CAP - 1n };
  const ordinary = planResourceSettlement(
    nearCapAccount,
    'heath',
    timeline.gatheringEndsAtMicros,
  );
  const raw = planRawResourceSettlement(
    nearCapAccount,
    'heath',
    timeline.gatheringEndsAtMicros,
  );
  assert.equal(ordinary.balances.stone, RESOURCE_BALANCE_CAP);
  assert.ok(raw.rawBalances.stone > RESOURCE_BALANCE_CAP);
  assert.throws(
    () => assertStoneExpeditionCapacity(raw.rawBalances.stone, 0n, RESOURCE_BALANCE_CAP),
    (error: unknown) => error instanceof StoneExpeditionPolicyError
      && error.code === 'STONE_EXPEDITION_ACCOUNT_CAPACITY',
  );
});

test('reserved passive Stone remains below the outstanding award through delayed expiry and partial claims', () => {
  const timeline = planStoneExpeditionTimeline(START, 4);
  const delayedAfterGathering = timeline.gatheringEndsAtMicros + (17n * 600_000_000n);
  const activeAccount = {
    // This is the dispatch boundary: 21,600 passive heath Stone through the
    // gathering end plus the 43,200 Stone award exactly fits the account.
    food: 0n,
    wood: 0n,
    stone: 935_200n,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };

  // A normal passive plan would consume the entire account cap. The active
  // Stone reserve leaves the exact future award available even after a delayed
  // scheduler or resource collection reaches well past gathering expiry.
  const lateReservedSettlement = planResourceSettlementWithExpeditionReservations(
    activeAccount,
    'heath',
    delayedAfterGathering,
    { food: 0n, wood: 0n, stone: STONE_GATHERING_TOTAL_STONE },
  );
  assert.equal(
    lateReservedSettlement.balances.stone,
    RESOURCE_BALANCE_CAP - STONE_GATHERING_TOTAL_STONE,
  );
  const creditedAtLateExpiry = lateReservedSettlement.balances.stone + STONE_GATHERING_TOTAL_STONE;
  assert.equal(creditedAtLateExpiry, RESOURCE_BALANCE_CAP);

  // Partial Stone collection releases only its matching portion of capacity.
  // The next passive collection may grow to the new cap, never erase the
  // uncredited 43,080-Stone remainder and never need a cursor rewind.
  const partialCredit = 120n;
  const partialAccount = {
    ...lateReservedSettlement.balances,
    stone: (RESOURCE_BALANCE_CAP - STONE_GATHERING_TOTAL_STONE) + partialCredit,
    settledThroughMicros: lateReservedSettlement.settledThroughMicros,
    revision: lateReservedSettlement.revision,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  const partialReserve = STONE_GATHERING_TOTAL_STONE - partialCredit;
  const afterPartialPassive = planResourceSettlementWithExpeditionReservations(
    partialAccount,
    'heath',
    delayedAfterGathering + (5n * 600_000_000n),
    { food: 0n, wood: 0n, stone: partialReserve },
  );
  assert.equal(
    afterPartialPassive.balances.stone,
    RESOURCE_BALANCE_CAP - partialReserve,
  );
  assert.equal(
    afterPartialPassive.balances.stone + partialReserve,
    RESOURCE_BALANCE_CAP,
  );

  // Once the full award is credited, the reservation becomes zero. A replay
  // cannot issue another award: policy state with credited=total accrues zero.
  const completed = planStoneExpeditionAccrual({
    ...state(),
    settledThroughMicros: timeline.gatheringEndsAtMicros,
    accruedStone: STONE_GATHERING_TOTAL_STONE,
    creditedStone: STONE_GATHERING_TOTAL_STONE,
  }, delayedAfterGathering);
  assert.equal(completed.newlyAccruedStone, 0n);
  assert.equal(completed.accruedStone, STONE_GATHERING_TOTAL_STONE);
  const noReservePlan = planResourceSettlementWithExpeditionReservations(
    {
      ...afterPartialPassive.balances,
      settledThroughMicros: afterPartialPassive.settledThroughMicros,
      revision: afterPartialPassive.revision,
      policyVersion: REALM_RESOURCE_POLICY_VERSION,
    },
    'heath',
    afterPartialPassive.settledThroughMicros,
    { food: 0n, wood: 0n, stone: 0n },
  );
  assert.equal(noReservePlan.deltas.stone, 0n);
});

test('paired Food and Stone reservations cap their inventory fields independently', () => {
  const reserve = STONE_GATHERING_TOTAL_STONE;
  const account = {
    food: RESOURCE_BALANCE_CAP - reserve,
    wood: 0n,
    stone: RESOURCE_BALANCE_CAP - reserve,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  assert.doesNotThrow(() => planResourceSettlementWithExpeditionReservations(
    account,
    'heath',
    START,
    { food: reserve, wood: 0n, stone: reserve },
  ));
  assert.throws(
    () => planResourceSettlementWithExpeditionReservations(
      { ...account, food: account.food + 1n },
      'heath',
      START,
      { food: reserve, wood: 0n, stone: reserve },
    ),
    /RESOURCE_FOOD_RESERVATION_BREACH/,
  );
  assert.throws(
    () => planResourceSettlementWithExpeditionReservations(
      { ...account, stone: account.stone + 1n },
      'heath',
      START,
      { food: reserve, wood: 0n, stone: reserve },
    ),
    /RESOURCE_STONE_RESERVATION_BREACH/,
  );
});

test('Stone persisted state and retry keys fail closed on malformed input', () => {
  assert.equal(stoneExpeditionStateIsConsistent(state()), true);
  assert.equal(stoneExpeditionStateIsConsistent(state({ phase: 'teleporting' })), false);
  assert.equal(stoneExpeditionStateIsConsistent(state({ creditedStone: 1n })), false);
  assert.equal(stoneExpeditionStateIsConsistent(state({ phase: 'returning' })), false);
  assert.throws(
    () => planStoneExpeditionAccrual(state({ phase: 'teleporting' }), START),
    /STONE_EXPEDITION_STATE_INVALID/,
  );
  assert.doesNotThrow(() => assertStoneExpeditionIdempotencyKey(
    '00000000-0000-4000-8000-000000000000',
  ));
  for (const key of ['', 'short', 'UPPERCASE-0000-0000-0000', 'a'.repeat(81)]) {
    assert.throws(() => assertStoneExpeditionIdempotencyKey(key), /STONE_EXPEDITION_IDEMPOTENCY_KEY_INVALID/);
  }
});
