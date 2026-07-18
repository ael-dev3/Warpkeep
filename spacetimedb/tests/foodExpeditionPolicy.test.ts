import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  FOOD_EXPEDITION_POLICY_VERSION,
  FOOD_GATHERING_DURATION_MICROS,
  FOOD_GATHERING_TOTAL_FOOD,
  FOOD_GATHER_QUANTUM_MICROS,
  FoodExpeditionPolicyError,
  assertFoodExpeditionCapacity,
  assertFoodExpeditionIdempotencyKey,
  foodExpeditionStateIsConsistent,
  planFoodExpeditionAccrual,
  planFoodExpeditionTimeline,
} from '../src/foodExpeditionPolicy';
import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
  FOOD_SITE_CASTLE_CLEARANCE_STEPS,
  FOOD_SITE_CORRIDOR_CLEARANCE_STEPS,
  FOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_FOOD_SITE_CANDIDATE_COUNT,
  GENESIS_TIER_I_FOOD_SITE_COUNT,
  GENESIS_TIER_I_FOOD_SITE_DIGEST,
  canonicalTierIFoodSiteDigestInput,
} from '../src/foodSitePolicy';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
} from '../src/forestLayoutPolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../src/goldSitePolicy';
import {
  REALM_RESOURCE_POLICY_VERSION,
  RESOURCE_BALANCE_CAP,
  planRawResourceSettlement,
  planResourceSettlement,
  planResourceSettlementWithFoodReservation,
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
  accruedFood: bigint;
  creditedFood: bigint;
  policyVersion: string;
}> = {}) {
  const timeline = planFoodExpeditionTimeline(START, 4);
  return {
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedFood: 0n,
    creditedFood: 0n,
    policyVersion: FOOD_EXPEDITION_POLICY_VERSION,
    ...change,
  };
}

test('the Tier-I Food catalog is pinned to 96 broadly distributed lowland/meadow sites', () => {
  const goldKeys = new Set(CANONICAL_TIER_I_GOLD_SITES_V1.map(site => `${site.q},${site.r}`));
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
      && (meta.terrainKind === 'lowland' || meta.terrainKind === 'meadow')
      && !goldKeys.has(tile.key)
      && !forestClearanceKeys.has(tile.key)
      && CANONICAL_CASTLE_SLOTS.every(slot => (
        hexDistance(tile, slot) > FOOD_SITE_CASTLE_CLEARANCE_STEPS
      ))
      && !hasCanonicalTravelCorridorClearance(tile, FOOD_SITE_CORRIDOR_CLEARANCE_STEPS);
  });

  // The exact pool is itself reviewable: it is broad enough for the 96-site
  // farthest-point catalog and includes the outer authoritative generation.
  assert.equal(GENESIS_TIER_I_FOOD_SITE_CANDIDATE_COUNT, 295);
  assert.equal(eligibleCandidates.length, GENESIS_TIER_I_FOOD_SITE_CANDIDATE_COUNT);
  assert.equal(CANONICAL_TIER_I_FOOD_SITES_V1.length, GENESIS_TIER_I_FOOD_SITE_COUNT);
  assert.equal(
    createHash('sha256').update(canonicalTierIFoodSiteDigestInput()).digest('hex'),
    GENESIS_TIER_I_FOOD_SITE_DIGEST,
  );

  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const site of CANONICAL_TIER_I_FOOD_SITES_V1) {
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
    assert.ok(meta?.terrainKind === 'lowland' || meta?.terrainKind === 'meadow');
    assert.equal(goldKeys.has(key), false);
    assert.equal(forestClearanceKeys.has(key), false);
    assert.equal(hasCanonicalTravelCorridorClearance(site, FOOD_SITE_CORRIDOR_CLEARANCE_STEPS), false);
    assert.equal(CANONICAL_CASTLE_SLOTS.some(slot => (
      hexDistance(site, slot) <= FOOD_SITE_CASTLE_CLEARANCE_STEPS
    )), false);
  }

  assert.equal(Math.min(...CANONICAL_TIER_I_FOOD_SITES_V1.map(site => hexDistance(site))), 18);
  assert.equal(Math.max(...CANONICAL_TIER_I_FOOD_SITES_V1.map(site => hexDistance(site))), 58);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(sector => (
    CANONICAL_TIER_I_FOOD_SITES_V1.filter(site => (
      canonicalMetaForKey(`${site.q},${site.r}`)?.sector === sector
    )).length
  )), [16, 13, 20, 17, 14, 16]);
  assert.equal(FOOD_SITE_POLICY_VERSION, 'genesis-001-tier1-food-sites-v1');
});

test('Food timing is a deterministic round trip with exactly thirty days at one Food/minute', () => {
  const timeline = planFoodExpeditionTimeline(START, 7);
  assert.equal(timeline.arrivesAtMicros, START + 210_000_000n);
  assert.equal(
    timeline.gatheringEndsAtMicros - timeline.arrivesAtMicros,
    FOOD_GATHERING_DURATION_MICROS,
  );
  assert.equal(timeline.returnsAtMicros - timeline.gatheringEndsAtMicros, 210_000_000n);
  assert.throws(
    () => planFoodExpeditionTimeline(START, 0),
    /FOOD_EXPEDITION_ROUTE_INVALID/,
  );

  const initial = state();
  const afterThreeMinutes = planFoodExpeditionAccrual(
    initial,
    initial.arrivesAtMicros + (3n * FOOD_GATHER_QUANTUM_MICROS) + 11n,
  );
  assert.equal(afterThreeMinutes.newlyAccruedFood, 3n);
  assert.equal(afterThreeMinutes.accruedFood, 3n);
  const end = planFoodExpeditionAccrual(initial, initial.gatheringEndsAtMicros);
  assert.equal(end.completedQuanta, FOOD_GATHERING_TOTAL_FOOD);
  assert.equal(end.accruedFood, 43_200n);
  assert.equal(end.accruedFood, FOOD_GATHERING_TOTAL_FOOD);
});

test('Food preflight reserves raw passive Food through the gathering deadline', () => {
  const timeline = planFoodExpeditionTimeline(START, 4);
  const exactCapacityAccount = {
    food: 913_600n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  const exactRawProjection = planRawResourceSettlement(
    exactCapacityAccount,
    'meadow',
    timeline.gatheringEndsAtMicros,
  );
  assert.equal(exactRawProjection.rawDeltas.food, 43_200n);
  assert.equal(exactRawProjection.rawBalances.food, 956_800n);
  assert.doesNotThrow(() => assertFoodExpeditionCapacity(
    exactRawProjection.rawBalances.food,
    0n,
    RESOURCE_BALANCE_CAP,
  ));

  const oneOverAccount = { ...exactCapacityAccount, food: 913_601n };
  const oneOverRawProjection = planRawResourceSettlement(
    oneOverAccount,
    'meadow',
    timeline.gatheringEndsAtMicros,
  );
  assert.throws(
    () => assertFoodExpeditionCapacity(
      oneOverRawProjection.rawBalances.food,
      0n,
      RESOURCE_BALANCE_CAP,
    ),
    /FOOD_EXPEDITION_ACCOUNT_CAPACITY/,
  );

  // A capped ordinary settlement would obscure this future passive Food.
  // The raw projection must not: dispatch needs capacity for it plus 43,200
  // gathering Food before an expedition can start.
  const nearCapAccount = { ...exactCapacityAccount, food: RESOURCE_BALANCE_CAP - 1n };
  const ordinary = planResourceSettlement(
    nearCapAccount,
    'meadow',
    timeline.gatheringEndsAtMicros,
  );
  const raw = planRawResourceSettlement(
    nearCapAccount,
    'meadow',
    timeline.gatheringEndsAtMicros,
  );
  assert.equal(ordinary.balances.food, RESOURCE_BALANCE_CAP);
  assert.ok(raw.rawBalances.food > RESOURCE_BALANCE_CAP);
  assert.throws(
    () => assertFoodExpeditionCapacity(raw.rawBalances.food, 0n, RESOURCE_BALANCE_CAP),
    (error: unknown) => error instanceof FoodExpeditionPolicyError
      && error.code === 'FOOD_EXPEDITION_ACCOUNT_CAPACITY',
  );
});

test('reserved passive Food remains below the outstanding award through delayed expiry and partial claims', () => {
  const timeline = planFoodExpeditionTimeline(START, 4);
  const delayedAfterGathering = timeline.gatheringEndsAtMicros + (17n * 600_000_000n);
  const activeAccount = {
    // This is the dispatch boundary: 43,200 passive meadow Food through the
    // gathering end plus the 43,200 Food award exactly fits the account.
    food: 913_600n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };

  // A normal passive plan would consume the entire account cap. The active
  // Food reserve leaves the exact future award available even after a delayed
  // scheduler or resource collection reaches well past gathering expiry.
  const lateReservedSettlement = planResourceSettlementWithFoodReservation(
    activeAccount,
    'meadow',
    delayedAfterGathering,
    FOOD_GATHERING_TOTAL_FOOD,
  );
  assert.equal(
    lateReservedSettlement.balances.food,
    RESOURCE_BALANCE_CAP - FOOD_GATHERING_TOTAL_FOOD,
  );
  const creditedAtLateExpiry = lateReservedSettlement.balances.food + FOOD_GATHERING_TOTAL_FOOD;
  assert.equal(creditedAtLateExpiry, RESOURCE_BALANCE_CAP);

  // Partial Food collection releases only its matching portion of capacity.
  // The next passive collection may grow to the new cap, never erase the
  // uncredited 43,080-Food remainder and never need a cursor rewind.
  const partialCredit = 120n;
  const partialAccount = {
    ...lateReservedSettlement.balances,
    food: (RESOURCE_BALANCE_CAP - FOOD_GATHERING_TOTAL_FOOD) + partialCredit,
    settledThroughMicros: lateReservedSettlement.settledThroughMicros,
    revision: lateReservedSettlement.revision,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  const partialReserve = FOOD_GATHERING_TOTAL_FOOD - partialCredit;
  const afterPartialPassive = planResourceSettlementWithFoodReservation(
    partialAccount,
    'meadow',
    delayedAfterGathering + (5n * 600_000_000n),
    partialReserve,
  );
  assert.equal(
    afterPartialPassive.balances.food,
    RESOURCE_BALANCE_CAP - partialReserve,
  );
  assert.equal(
    afterPartialPassive.balances.food + partialReserve,
    RESOURCE_BALANCE_CAP,
  );

  // Once the full award is credited, the reservation becomes zero. A replay
  // cannot issue another award: policy state with credited=total accrues zero.
  const completed = planFoodExpeditionAccrual({
    ...state(),
    settledThroughMicros: timeline.gatheringEndsAtMicros,
    accruedFood: FOOD_GATHERING_TOTAL_FOOD,
    creditedFood: FOOD_GATHERING_TOTAL_FOOD,
  }, delayedAfterGathering);
  assert.equal(completed.newlyAccruedFood, 0n);
  assert.equal(completed.accruedFood, FOOD_GATHERING_TOTAL_FOOD);
  const noReservePlan = planResourceSettlementWithFoodReservation(
    {
      ...afterPartialPassive.balances,
      settledThroughMicros: afterPartialPassive.settledThroughMicros,
      revision: afterPartialPassive.revision,
      policyVersion: REALM_RESOURCE_POLICY_VERSION,
    },
    'meadow',
    afterPartialPassive.settledThroughMicros,
    0n,
  );
  assert.equal(noReservePlan.deltas.food, 0n);
});

test('Food persisted state and retry keys fail closed on malformed input', () => {
  assert.equal(foodExpeditionStateIsConsistent(state()), true);
  assert.equal(foodExpeditionStateIsConsistent(state({ phase: 'teleporting' })), false);
  assert.equal(foodExpeditionStateIsConsistent(state({ creditedFood: 1n })), false);
  assert.equal(foodExpeditionStateIsConsistent(state({ phase: 'returning' })), false);
  assert.throws(
    () => planFoodExpeditionAccrual(state({ phase: 'teleporting' }), START),
    /FOOD_EXPEDITION_STATE_INVALID/,
  );
  assert.doesNotThrow(() => assertFoodExpeditionIdempotencyKey(
    '00000000-0000-4000-8000-000000000000',
  ));
  for (const key of ['', 'short', 'UPPERCASE-0000-0000-0000', 'a'.repeat(81)]) {
    assert.throws(() => assertFoodExpeditionIdempotencyKey(key), /FOOD_EXPEDITION_IDEMPOTENCY_KEY_INVALID/);
  }
});
