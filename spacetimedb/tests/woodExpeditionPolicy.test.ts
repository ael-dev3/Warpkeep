import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  WOOD_EXPEDITION_POLICY_VERSION,
  WOOD_GATHERING_DURATION_MICROS,
  WOOD_GATHERING_TOTAL_WOOD,
  WOOD_GATHER_QUANTUM_MICROS,
  WoodExpeditionPolicyError,
  assertWoodExpeditionCapacity,
  assertWoodExpeditionIdempotencyKey,
  woodExpeditionStateIsConsistent,
  planWoodExpeditionAccrual,
  planWoodExpeditionTimeline,
} from '../src/woodExpeditionPolicy';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
  WOOD_SITE_CASTLE_CLEARANCE_STEPS,
  WOOD_SITE_CORRIDOR_CLEARANCE_STEPS,
  WOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_WOOD_SITE_CANDIDATE_COUNT,
  GENESIS_TIER_I_WOOD_SITE_COUNT,
  GENESIS_TIER_I_WOOD_SITE_DIGEST,
  canonicalTierIWoodSiteDigestInput,
} from '../src/woodSitePolicy';
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
  accruedWood: bigint;
  creditedWood: bigint;
  policyVersion: string;
}> = {}) {
  const timeline = planWoodExpeditionTimeline(START, 4);
  return {
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedWood: 0n,
    creditedWood: 0n,
    policyVersion: WOOD_EXPEDITION_POLICY_VERSION,
    ...change,
  };
}

test('the Tier-I Wood catalog is pinned to 96 broadly distributed forest sites', () => {
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
      && meta.terrainKind === 'forest'
      && !goldKeys.has(tile.key)
      && !foodKeys.has(tile.key)
      && !forestClearanceKeys.has(tile.key)
      && CANONICAL_CASTLE_SLOTS.every(slot => (
        hexDistance(tile, slot) > WOOD_SITE_CASTLE_CLEARANCE_STEPS
      ))
      && !hasCanonicalTravelCorridorClearance(tile, WOOD_SITE_CORRIDOR_CLEARANCE_STEPS);
  });

  // The exact pool is itself reviewable: it is broad enough for the 96-site
  // farthest-point catalog and includes the outer authoritative generation.
  assert.equal(GENESIS_TIER_I_WOOD_SITE_CANDIDATE_COUNT, 144);
  assert.equal(eligibleCandidates.length, GENESIS_TIER_I_WOOD_SITE_CANDIDATE_COUNT);
  assert.equal(CANONICAL_TIER_I_WOOD_SITES_V1.length, GENESIS_TIER_I_WOOD_SITE_COUNT);
  assert.equal(
    createHash('sha256').update(canonicalTierIWoodSiteDigestInput()).digest('hex'),
    GENESIS_TIER_I_WOOD_SITE_DIGEST,
  );

  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const site of CANONICAL_TIER_I_WOOD_SITES_V1) {
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
    assert.equal(meta?.terrainKind, 'forest');
    assert.equal(goldKeys.has(key), false);
    assert.equal(foodKeys.has(key), false);
    assert.equal(forestClearanceKeys.has(key), false);
    assert.equal(hasCanonicalTravelCorridorClearance(site, WOOD_SITE_CORRIDOR_CLEARANCE_STEPS), false);
    assert.equal(CANONICAL_CASTLE_SLOTS.some(slot => (
      hexDistance(site, slot) <= WOOD_SITE_CASTLE_CLEARANCE_STEPS
    )), false);
  }

  assert.equal(Math.min(...CANONICAL_TIER_I_WOOD_SITES_V1.map(site => hexDistance(site))), 22);
  assert.equal(Math.max(...CANONICAL_TIER_I_WOOD_SITES_V1.map(site => hexDistance(site))), 58);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(sector => (
    CANONICAL_TIER_I_WOOD_SITES_V1.filter(site => (
      canonicalMetaForKey(`${site.q},${site.r}`)?.sector === sector
    )).length
  )), [14, 16, 20, 12, 18, 16]);
  assert.equal(WOOD_SITE_POLICY_VERSION, 'genesis-001-tier1-wood-sites-v1');
});

test('Wood timing is a deterministic round trip with exactly thirty days at one Wood/minute', () => {
  const timeline = planWoodExpeditionTimeline(START, 7);
  assert.equal(timeline.arrivesAtMicros, START + 210_000_000n);
  assert.equal(
    timeline.gatheringEndsAtMicros - timeline.arrivesAtMicros,
    WOOD_GATHERING_DURATION_MICROS,
  );
  assert.equal(timeline.returnsAtMicros - timeline.gatheringEndsAtMicros, 210_000_000n);
  assert.throws(
    () => planWoodExpeditionTimeline(START, 0),
    /WOOD_EXPEDITION_ROUTE_INVALID/,
  );

  const initial = state();
  const afterThreeMinutes = planWoodExpeditionAccrual(
    initial,
    initial.arrivesAtMicros + (3n * WOOD_GATHER_QUANTUM_MICROS) + 11n,
  );
  assert.equal(afterThreeMinutes.newlyAccruedWood, 3n);
  assert.equal(afterThreeMinutes.accruedWood, 3n);
  const end = planWoodExpeditionAccrual(initial, initial.gatheringEndsAtMicros);
  assert.equal(end.completedQuanta, WOOD_GATHERING_TOTAL_WOOD);
  assert.equal(end.accruedWood, 43_200n);
  assert.equal(end.accruedWood, WOOD_GATHERING_TOTAL_WOOD);
});

test('Wood preflight reserves raw passive Wood through the gathering deadline', () => {
  const timeline = planWoodExpeditionTimeline(START, 4);
  const exactCapacityAccount = {
    food: 0n,
    wood: 913_600n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  const exactRawProjection = planRawResourceSettlement(
    exactCapacityAccount,
    'forest',
    timeline.gatheringEndsAtMicros,
  );
  assert.equal(exactRawProjection.rawDeltas.wood, 43_200n);
  assert.equal(exactRawProjection.rawBalances.wood, 956_800n);
  assert.doesNotThrow(() => assertWoodExpeditionCapacity(
    exactRawProjection.rawBalances.wood,
    0n,
    RESOURCE_BALANCE_CAP,
  ));

  const oneOverAccount = { ...exactCapacityAccount, wood: 913_601n };
  const oneOverRawProjection = planRawResourceSettlement(
    oneOverAccount,
    'forest',
    timeline.gatheringEndsAtMicros,
  );
  assert.throws(
    () => assertWoodExpeditionCapacity(
      oneOverRawProjection.rawBalances.wood,
      0n,
      RESOURCE_BALANCE_CAP,
    ),
    /WOOD_EXPEDITION_ACCOUNT_CAPACITY/,
  );

  // A capped ordinary settlement would obscure this future passive Wood.
  // The raw projection must not: dispatch needs capacity for it plus 43,200
  // gathering Wood before an expedition can start.
  const nearCapAccount = { ...exactCapacityAccount, wood: RESOURCE_BALANCE_CAP - 1n };
  const ordinary = planResourceSettlement(
    nearCapAccount,
    'forest',
    timeline.gatheringEndsAtMicros,
  );
  const raw = planRawResourceSettlement(
    nearCapAccount,
    'forest',
    timeline.gatheringEndsAtMicros,
  );
  assert.equal(ordinary.balances.wood, RESOURCE_BALANCE_CAP);
  assert.ok(raw.rawBalances.wood > RESOURCE_BALANCE_CAP);
  assert.throws(
    () => assertWoodExpeditionCapacity(raw.rawBalances.wood, 0n, RESOURCE_BALANCE_CAP),
    (error: unknown) => error instanceof WoodExpeditionPolicyError
      && error.code === 'WOOD_EXPEDITION_ACCOUNT_CAPACITY',
  );
});

test('reserved passive Wood remains below the outstanding award through delayed expiry and partial claims', () => {
  const timeline = planWoodExpeditionTimeline(START, 4);
  const delayedAfterGathering = timeline.gatheringEndsAtMicros + (17n * 600_000_000n);
  const activeAccount = {
    // This is the dispatch boundary: 43,200 passive forest Wood through the
    // gathering end plus the 43,200 Wood award exactly fits the account.
    food: 0n,
    wood: 913_600n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };

  // A normal passive plan would consume the entire account cap. The active
  // Wood reserve leaves the exact future award available even after a delayed
  // scheduler or resource collection reaches well past gathering expiry.
  const lateReservedSettlement = planResourceSettlementWithExpeditionReservations(
    activeAccount,
    'forest',
    delayedAfterGathering,
    { food: 0n, wood: WOOD_GATHERING_TOTAL_WOOD },
  );
  assert.equal(
    lateReservedSettlement.balances.wood,
    RESOURCE_BALANCE_CAP - WOOD_GATHERING_TOTAL_WOOD,
  );
  const creditedAtLateExpiry = lateReservedSettlement.balances.wood + WOOD_GATHERING_TOTAL_WOOD;
  assert.equal(creditedAtLateExpiry, RESOURCE_BALANCE_CAP);

  // Partial Wood collection releases only its matching portion of capacity.
  // The next passive collection may grow to the new cap, never erase the
  // uncredited 43,080-Wood remainder and never need a cursor rewind.
  const partialCredit = 120n;
  const partialAccount = {
    ...lateReservedSettlement.balances,
    wood: (RESOURCE_BALANCE_CAP - WOOD_GATHERING_TOTAL_WOOD) + partialCredit,
    settledThroughMicros: lateReservedSettlement.settledThroughMicros,
    revision: lateReservedSettlement.revision,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  const partialReserve = WOOD_GATHERING_TOTAL_WOOD - partialCredit;
  const afterPartialPassive = planResourceSettlementWithExpeditionReservations(
    partialAccount,
    'forest',
    delayedAfterGathering + (5n * 600_000_000n),
    { food: 0n, wood: partialReserve },
  );
  assert.equal(
    afterPartialPassive.balances.wood,
    RESOURCE_BALANCE_CAP - partialReserve,
  );
  assert.equal(
    afterPartialPassive.balances.wood + partialReserve,
    RESOURCE_BALANCE_CAP,
  );

  // Once the full award is credited, the reservation becomes zero. A replay
  // cannot issue another award: policy state with credited=total accrues zero.
  const completed = planWoodExpeditionAccrual({
    ...state(),
    settledThroughMicros: timeline.gatheringEndsAtMicros,
    accruedWood: WOOD_GATHERING_TOTAL_WOOD,
    creditedWood: WOOD_GATHERING_TOTAL_WOOD,
  }, delayedAfterGathering);
  assert.equal(completed.newlyAccruedWood, 0n);
  assert.equal(completed.accruedWood, WOOD_GATHERING_TOTAL_WOOD);
  const noReservePlan = planResourceSettlementWithExpeditionReservations(
    {
      ...afterPartialPassive.balances,
      settledThroughMicros: afterPartialPassive.settledThroughMicros,
      revision: afterPartialPassive.revision,
      policyVersion: REALM_RESOURCE_POLICY_VERSION,
    },
    'forest',
    afterPartialPassive.settledThroughMicros,
    { food: 0n, wood: 0n },
  );
  assert.equal(noReservePlan.deltas.wood, 0n);
});

test('paired Food and Wood reservations cap their inventory fields independently', () => {
  const reserve = WOOD_GATHERING_TOTAL_WOOD;
  const account = {
    food: RESOURCE_BALANCE_CAP - reserve,
    wood: RESOURCE_BALANCE_CAP - reserve,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: START,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  };
  assert.doesNotThrow(() => planResourceSettlementWithExpeditionReservations(
    account,
    'forest',
    START,
    { food: reserve, wood: reserve },
  ));
  assert.throws(
    () => planResourceSettlementWithExpeditionReservations(
      { ...account, food: account.food + 1n },
      'forest',
      START,
      { food: reserve, wood: reserve },
    ),
    /RESOURCE_FOOD_RESERVATION_BREACH/,
  );
  assert.throws(
    () => planResourceSettlementWithExpeditionReservations(
      { ...account, wood: account.wood + 1n },
      'forest',
      START,
      { food: reserve, wood: reserve },
    ),
    /RESOURCE_WOOD_RESERVATION_BREACH/,
  );
});

test('Wood persisted state and retry keys fail closed on malformed input', () => {
  assert.equal(woodExpeditionStateIsConsistent(state()), true);
  assert.equal(woodExpeditionStateIsConsistent(state({ phase: 'teleporting' })), false);
  assert.equal(woodExpeditionStateIsConsistent(state({ creditedWood: 1n })), false);
  assert.equal(woodExpeditionStateIsConsistent(state({ phase: 'returning' })), false);
  assert.throws(
    () => planWoodExpeditionAccrual(state({ phase: 'teleporting' }), START),
    /WOOD_EXPEDITION_STATE_INVALID/,
  );
  assert.doesNotThrow(() => assertWoodExpeditionIdempotencyKey(
    '00000000-0000-4000-8000-000000000000',
  ));
  for (const key of ['', 'short', 'UPPERCASE-0000-0000-0000', 'a'.repeat(81)]) {
    assert.throws(() => assertWoodExpeditionIdempotencyKey(key), /WOOD_EXPEDITION_IDEMPOTENCY_KEY_INVALID/);
  }
});
