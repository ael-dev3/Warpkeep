import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GREATER_REALM_ACTIVATION_PHASES,
  GREATER_REALM_ACTIVATION_TRANSITIONS,
  GREATER_REALM_JOURNEY_TABLES,
  GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT,
  GREATER_REALM_MAX_WORKER_RECEIPT_ROWS,
  GREATER_REALM_MAX_WORKER_ROWS,
  GREATER_REALM_PUBLIC_CAPACITY_MAX,
  GREATER_REALM_TIER_ONE_REGION_IDS,
  GREATER_REALM_WORKER_RECEIPTS_PER_CASTLE,
  advanceGreaterRealmPostCanaryCounterV1,
  formatGreaterRealmPublicCapacityLeaseIdV1,
  greaterRealmActivationPolicyErrorCode,
  greaterRealmAllocationRegionCountsV1,
  parseGreaterRealmPublicCapacityLeaseV1,
  planGreaterRealmActivationTransitionV1,
  planGreaterRealmExistingPopulationV1,
  requireGreaterRealmJourneyTablesEmptyV1,
  selectGreaterRealmCastleAllocationV1,
  selectGreaterRealmPublicCapacityLeaseV1,
  validateGreaterRealmAllocationSlotsV1,
  type GreaterRealmActivationCheckpointV1,
  type GreaterRealmAllocationSlotV1,
  type GreaterRealmCastleAllocationClaimV1,
} from '../src/greaterRealmActivationPolicy';
import { CASTLE_WORKERS_PER_CASTLE } from '../src/castleWorkerPolicy';
import { CASTLE_WORKER_MAX_CASTLES } from '../src/castleWorkerRolloutPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION,
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
} from '../src/greaterRealmV17Policy';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOPOLOGY_DIGEST = 'a'.repeat(64);
const ALTERNATE_TOPOLOGY_DIGEST = 'b'.repeat(64);
const CAPACITY_DIGEST = 'c'.repeat(64);
const ALTERNATE_CAPACITY_DIGEST = 'd'.repeat(64);

function opaqueSuffix(value: number): string {
  let remaining = value;
  let encoded = '';
  do {
    encoded = BASE32[remaining % BASE32.length]! + encoded;
    remaining = Math.floor(remaining / BASE32.length);
  } while (remaining > 0);
  return encoded.padStart(26, 'A');
}

function slots(): GreaterRealmAllocationSlotV1[] {
  return GREATER_REALM_TIER_ONE_REGION_IDS.flatMap((regionId, regionIndex) => (
    Array.from({ length: GREATER_REALM_CASTLES_PER_REGION }, (_unused, regionOrderRank) => ({
      slotId: `GRS-${opaqueSuffix(regionIndex * GREATER_REALM_CASTLES_PER_REGION + regionOrderRank)}`,
      regionId,
      tier: 1,
      regionOrderRank,
      allocationRank: regionIndex * GREATER_REALM_CASTLES_PER_REGION + regionOrderRank,
      topologyDigest: TOPOLOGY_DIGEST,
    }))
  ));
}

function privatelyRankedSlots(offset = 53): GreaterRealmAllocationSlotV1[] {
  const canonical = slots();
  const regionRanks = new Map<string, number>();
  return Array.from({ length: canonical.length }, (_unused, allocationRank) => {
    const sourceIndex = (allocationRank * 137 + offset) % canonical.length;
    const row = canonical[sourceIndex]!;
    const regionOrderRank = regionRanks.get(row.regionId) ?? 0;
    regionRanks.set(row.regionId, regionOrderRank + 1);
    return { ...row, allocationRank, regionOrderRank };
  });
}

function checkpoint(
  phase: GreaterRealmActivationCheckpointV1['phase'],
  postCanaryFoundingCount = 0,
  postCanaryDispatchCount = 0,
  everActive = phase === 'active',
): GreaterRealmActivationCheckpointV1 {
  return { phase, everActive, postCanaryFoundingCount, postCanaryDispatchCount };
}

function code(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return greaterRealmActivationPolicyErrorCode(error);
  }
  return undefined;
}

function claimRows(
  allocations: readonly Readonly<{
    castleId: bigint;
    slotId: string;
    allocationSequence: bigint;
    topologyDigest: string;
  }>[],
): GreaterRealmCastleAllocationClaimV1[] {
  return allocations.map(row => ({
    castleId: row.castleId,
    slotId: row.slotId,
    allocationSequence: row.allocationSequence,
    topologyDigest: row.topologyDigest,
  }));
}

test('Greater Realm derives 600-castle bounds without widening frozen legacy limits', () => {
  assert.equal(CASTLE_WORKER_MAX_CASTLES, 100);
  assert.equal(CASTLE_WORKERS_PER_CASTLE, 4);
  assert.equal(GREATER_REALM_CASTLE_CAPACITY, 600);
  assert.equal(GREATER_REALM_WORKER_RECEIPTS_PER_CASTLE, 64);
  assert.equal(GREATER_REALM_MAX_WORKER_ROWS, 2_400);
  assert.equal(GREATER_REALM_MAX_WORKER_RECEIPT_ROWS, 38_400);
  assert.equal(GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT, 4_294_967_295);
  assert.equal(GREATER_REALM_PUBLIC_CAPACITY_MAX, 32);
  assert.equal(GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION, 32);
  assert.equal(GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED, false);
  assert.equal(GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED, false);
});

test('the activation phase matrix is exact and every exact retry is immutable', () => {
  assert.deepEqual(GREATER_REALM_ACTIVATION_TRANSITIONS, {
    prepared: ['draining', 'halted', 'rolled-back'],
    draining: ['frozen', 'halted', 'rolled-back'],
    frozen: ['planned', 'halted', 'rolled-back'],
    planned: ['canary', 'halted', 'rolled-back'],
    canary: ['active', 'halted', 'rolled-back'],
    active: ['halted'],
    halted: ['active', 'rolled-back'],
    'rolled-back': [],
  });
  for (const from of GREATER_REALM_ACTIVATION_PHASES) {
    for (const to of GREATER_REALM_ACTIVATION_PHASES) {
      const expected = from === to || GREATER_REALM_ACTIVATION_TRANSITIONS[from].includes(to);
      const current = checkpoint(
        from,
        0,
        0,
        from === 'active' || (from === 'halted' && to === 'active'),
      );
      const next = checkpoint(
        to,
        0,
        0,
        to === 'active' || current.everActive,
      );
      if (expected) {
        const plan = planGreaterRealmActivationTransitionV1(current, next);
        assert.equal(plan.result, from === to ? 'unchanged' : 'phase-transition');
        assert.deepEqual(plan.checkpoint, next);
        assert.equal(Object.isFrozen(plan), true);
        assert.equal(Object.isFrozen(plan.checkpoint), true);
      } else {
        assert.notEqual(code(() => planGreaterRealmActivationTransitionV1(current, next)), undefined);
      }
    }
  }
});

test('post-commit counters are monotone, phase-bound, bounded, and close rollback', () => {
  const active = checkpoint('active');
  const founded = advanceGreaterRealmPostCanaryCounterV1(active, 'founding');
  const dispatched = advanceGreaterRealmPostCanaryCounterV1(founded, 'dispatch');
  assert.deepEqual(dispatched, checkpoint('active', 1, 1));
  assert.equal(
    planGreaterRealmActivationTransitionV1(active, founded).result,
    'counter-advance',
  );
  assert.equal(
    planGreaterRealmActivationTransitionV1(founded, dispatched).result,
    'counter-advance',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(active, checkpoint('active', 1, 1))),
    'GREATER_REALM_POST_CANARY_COUNTER_ADVANCE_INVALID',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(active, checkpoint('active', 2, 0))),
    'GREATER_REALM_POST_CANARY_COUNTER_ADVANCE_INVALID',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(dispatched, checkpoint('active', 0, 1))),
    'GREATER_REALM_POST_CANARY_COUNTER_ROLLBACK',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(dispatched, checkpoint('rolled-back'))),
    'GREATER_REALM_ROLLBACK_WINDOW_CLOSED',
  );
  const halted = planGreaterRealmActivationTransitionV1(
    dispatched,
    checkpoint('halted', 1, 1, true),
  ).checkpoint;
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(halted, checkpoint('rolled-back'))),
    'GREATER_REALM_ROLLBACK_WINDOW_CLOSED',
  );
  assert.equal(
    code(() => advanceGreaterRealmPostCanaryCounterV1(checkpoint('planned'), 'founding')),
    'GREATER_REALM_POST_CANARY_COUNTER_PHASE_INVALID',
  );
  assert.equal(
    code(() => advanceGreaterRealmPostCanaryCounterV1(checkpoint('canary'), 'founding')),
    'GREATER_REALM_POST_CANARY_COUNTER_PHASE_INVALID',
  );
  for (const kind of ['unknown', 'Dispatch', 0, null, undefined]) {
    assert.equal(
      code(() => advanceGreaterRealmPostCanaryCounterV1(
        checkpoint('active'),
        kind as unknown as 'dispatch',
      )),
      'GREATER_REALM_POST_CANARY_COUNTER_KIND_INVALID',
    );
  }
  assert.equal(
    code(() => advanceGreaterRealmPostCanaryCounterV1(
      checkpoint('active', GREATER_REALM_CASTLE_CAPACITY, 0),
      'founding',
    )),
    'GREATER_REALM_POST_CANARY_FOUNDING_COUNT_INVALID',
  );
  assert.equal(
    code(() => advanceGreaterRealmPostCanaryCounterV1(
      checkpoint('active', 0, GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT),
      'dispatch',
    )),
    'GREATER_REALM_POST_CANARY_DISPATCH_COUNT_INVALID',
  );
  assert.deepEqual(
    advanceGreaterRealmPostCanaryCounterV1(
      checkpoint('active', 0, GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT - 1),
      'dispatch',
    ),
    checkpoint('active', 0, GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT),
  );
  assert.deepEqual(
    advanceGreaterRealmPostCanaryCounterV1(
      checkpoint('active', 0, GREATER_REALM_MAX_WORKER_RECEIPT_ROWS),
      'dispatch',
    ),
    checkpoint('active', 0, GREATER_REALM_MAX_WORKER_RECEIPT_ROWS + 1),
  );
  assert.equal(
    planGreaterRealmActivationTransitionV1(checkpoint('canary'), checkpoint('rolled-back')).result,
    'phase-transition',
  );
});

test('entering active is an irreversible commit even before founding or dispatch', () => {
  const committed = planGreaterRealmActivationTransitionV1(
    checkpoint('canary'),
    checkpoint('active'),
  ).checkpoint;
  assert.equal(committed.everActive, true);
  const halted = planGreaterRealmActivationTransitionV1(
    committed,
    checkpoint('halted', 0, 0, true),
  ).checkpoint;
  assert.equal(
    planGreaterRealmActivationTransitionV1(
      halted,
      checkpoint('active', 0, 0, true),
    ).result,
    'phase-transition',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(halted, checkpoint('rolled-back'))),
    'GREATER_REALM_ROLLBACK_WINDOW_CLOSED',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(
      committed,
      checkpoint('halted', 0, 0, false),
    )),
    'GREATER_REALM_EVER_ACTIVE_ROLLBACK',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(
      { ...checkpoint('canary'), activatedAt: 1n },
      checkpoint('active'),
    )),
    'GREATER_REALM_ACTIVATION_CHECKPOINT_INVALID',
  );
});

test('activation checkpoints reject accessors before any transition field can change', () => {
  const hostile = Object.defineProperties({}, {
    phase: { enumerable: true, get: () => 'draining' },
    everActive: { enumerable: true, value: false },
    postCanaryFoundingCount: { enumerable: true, value: 0 },
    postCanaryDispatchCount: { enumerable: true, value: 0 },
  }) as GreaterRealmActivationCheckpointV1;
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(checkpoint('prepared'), hostile)),
    'GREATER_REALM_ACTIVATION_CHECKPOINT_INVALID',
  );
  const hidden = { ...checkpoint('draining') };
  Object.defineProperty(hidden, 'phase', { enumerable: false, value: 'draining' });
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(
      checkpoint('prepared'),
      hidden as GreaterRealmActivationCheckpointV1,
    )),
    'GREATER_REALM_ACTIVATION_CHECKPOINT_INVALID',
  );
  assert.equal(
    code(() => planGreaterRealmActivationTransitionV1(
      checkpoint('prepared'),
      { ...checkpoint('draining'), [Symbol('private')]: 'PRIVATE' },
    )),
    'GREATER_REALM_ACTIVATION_CHECKPOINT_INVALID',
  );
});

test('the quiet-window journey gate is the exact 15 live-state tables', () => {
  assert.equal(GREATER_REALM_JOURNEY_TABLES.length, 15);
  assert.deepEqual(GREATER_REALM_JOURNEY_TABLES, [
    'gold_node_occupation_v1', 'gold_expedition_v1', 'gold_expedition_schedule_v_1',
    'food_node_occupation_v1', 'food_expedition_v1', 'food_expedition_schedule_v_1',
    'wood_node_occupation_v1', 'wood_expedition_v1', 'wood_expedition_schedule_v_1',
    'stone_node_occupation_v1', 'stone_expedition_v1', 'stone_expedition_schedule_v_1',
    'worker_assignment_v1', 'worker_node_occupation_v1', 'worker_assignment_schedule_v_1',
  ]);
  const empty = Object.fromEntries(GREATER_REALM_JOURNEY_TABLES.map(name => [name, 0n]));
  requireGreaterRealmJourneyTablesEmptyV1(empty);
  const missing = { ...empty };
  delete missing.gold_expedition_v1;
  assert.equal(
    code(() => requireGreaterRealmJourneyTablesEmptyV1(missing)),
    'GREATER_REALM_JOURNEY_GATE_INVALID',
  );
  assert.equal(
    code(() => requireGreaterRealmJourneyTablesEmptyV1({ ...empty, unknown_table: 0n })),
    'GREATER_REALM_JOURNEY_GATE_INVALID',
  );
  assert.equal(
    code(() => requireGreaterRealmJourneyTablesEmptyV1({ ...empty, food_expedition_v1: 1n })),
    'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY',
  );
  assert.equal(
    code(() => requireGreaterRealmJourneyTablesEmptyV1({ ...empty, food_expedition_v1: 0 })),
    'GREATER_REALM_JOURNEY_GATE_NOT_EMPTY',
  );
});

test('slot topology is exactly 600 unique ranked Tier-I slots, 100 per allowlisted region', () => {
  const valid = slots();
  validateGreaterRealmAllocationSlotsV1([...valid].reverse());
  assert.deepEqual(GREATER_REALM_TIER_ONE_REGION_IDS, [
    'T1_LOWLANDS', 'T1_FROSTMERE', 'T1_SUNSCAR',
    'T1_MIREFEN', 'T1_STONEWAKE', 'T1_EMBERWOOD',
  ]);
  assert.equal(
    code(() => validateGreaterRealmAllocationSlotsV1(valid.slice(0, -1))),
    'GREATER_REALM_SLOT_TOPOLOGY_COUNT_INVALID',
  );
  for (const regionId of ['T2_CROWNWOOD', 'T3_THRONEHEART']) {
    const changed = valid.map((row, index) => index === 0 ? { ...row, regionId } : row);
    assert.equal(
      code(() => validateGreaterRealmAllocationSlotsV1(changed)),
      'GREATER_REALM_SLOT_TOPOLOGY_ROW_INVALID',
    );
  }
  assert.equal(
    code(() => validateGreaterRealmAllocationSlotsV1(
      valid.map((row, index) => index === 0 ? { ...row, tier: 2 } : row),
    )),
    'GREATER_REALM_SLOT_TOPOLOGY_ROW_INVALID',
  );
  assert.equal(
    code(() => validateGreaterRealmAllocationSlotsV1(
      valid.map((row, index) => index === 1 ? { ...row, slotId: valid[0]!.slotId } : row),
    )),
    'GREATER_REALM_SLOT_ID_DUPLICATE',
  );
  assert.equal(
    code(() => validateGreaterRealmAllocationSlotsV1(
      valid.map((row, index) => index === 1 ? { ...row, allocationRank: 0 } : row),
    )),
    'GREATER_REALM_SLOT_ALLOCATION_RANK_DUPLICATE',
  );
  assert.equal(
    code(() => validateGreaterRealmAllocationSlotsV1(
      valid.map((row, index) => index === 1 ? { ...row, regionOrderRank: 2 } : row),
    )),
    'GREATER_REALM_SLOT_REGION_RANK_SET_INVALID',
  );
  assert.equal(
    code(() => validateGreaterRealmAllocationSlotsV1(
      valid.map((row, index) => index === 0
        ? { ...row, topologyDigest: TOPOLOGY_DIGEST.toUpperCase() }
        : row),
    )),
    'GREATER_REALM_TOPOLOGY_DIGEST_INVALID',
  );
  assert.equal(
    code(() => validateGreaterRealmAllocationSlotsV1(
      valid.map((row, index) => index === 0
        ? { ...row, topologyDigest: ALTERNATE_TOPOLOGY_DIGEST }
        : row),
    )),
    'GREATER_REALM_TOPOLOGY_DIGEST_MISMATCH',
  );
  const accessorRow = { ...valid[0]! };
  Object.defineProperty(accessorRow, 'slotId', {
    enumerable: true,
    get: () => valid[0]!.slotId,
  });
  for (const changedRow of [
    { ...valid[0]!, nodeId: 'PRIVATE' },
    accessorRow,
  ]) {
    assert.equal(
      code(() => validateGreaterRealmAllocationSlotsV1(
        valid.map((row, index) => index === 0 ? changedRow : row),
      )),
      'GREATER_REALM_SLOT_TOPOLOGY_ROW_INVALID',
    );
  }
});

test('existing population plans are deterministic and balanced at every prefix', () => {
  const topology = slots();
  const ids = Array.from({ length: 600 }, (_unused, index) => BigInt(index + 1));
  const forward = planGreaterRealmExistingPopulationV1(topology, ids);
  const reordered = planGreaterRealmExistingPopulationV1(
    [...topology].reverse(),
    [...ids].reverse(),
  );
  assert.deepEqual(reordered, forward);
  assert.equal(new Set(forward.map(row => row.slotId)).size, 600);
  assert.equal(new Set(forward.map(row => row.castleId)).size, 600);
  assert.deepEqual(
    Object.values(greaterRealmAllocationRegionCountsV1(forward)),
    [100, 100, 100, 100, 100, 100],
  );
  for (let length = 1; length <= forward.length; length += 1) {
    const counts = Object.values(greaterRealmAllocationRegionCountsV1(forward.slice(0, length)));
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `unbalanced prefix ${length}`);
  }
  const firstHundred = forward.slice(0, 100);
  const firstHundredCounts = Object.values(greaterRealmAllocationRegionCountsV1(firstHundred));
  assert.deepEqual(firstHundredCounts, [17, 17, 17, 17, 16, 16]);
  assert.deepEqual(
    [...firstHundredCounts].sort((left, right) => left - right),
    [16, 16, 17, 17, 17, 17],
  );
  assert.deepEqual(
    firstHundred.map(row => row.castleId),
    Array.from({ length: 100 }, (_unused, index) => BigInt(index + 1)),
  );
});

test('frozen private ranks break balanced region ties and bind exact replay', () => {
  const topology = privatelyRankedSlots();
  validateGreaterRealmAllocationSlotsV1([...topology].reverse());
  const ids = Array.from({ length: 100 }, (_unused, index) => BigInt(index + 1));
  const plan = planGreaterRealmExistingPopulationV1(topology, ids);
  assert.deepEqual(
    Object.values(greaterRealmAllocationRegionCountsV1(plan)).sort((left, right) => left - right),
    [16, 16, 17, 17, 17, 17],
  );
  assert.equal(plan[0]!.allocationRank, 0);
  assert.deepEqual(
    planGreaterRealmExistingPopulationV1([...topology].reverse(), [...ids].reverse()),
    plan,
  );

  const first = selectGreaterRealmCastleAllocationV1(topology, [], 101n);
  const frozenClaim = [{
    castleId: first.allocation.castleId,
    slotId: first.allocation.slotId,
    allocationSequence: first.allocation.allocationSequence,
    topologyDigest: first.allocation.topologyDigest,
  }];
  const retry = selectGreaterRealmCastleAllocationV1(
    [...topology].reverse(),
    frozenClaim,
    101n,
  );
  assert.equal(retry.result, 'unchanged');
  assert.deepEqual(retry.allocation, first.allocation);
  assert.equal(
    code(() => selectGreaterRealmCastleAllocationV1(
      privatelyRankedSlots(54),
      frozenClaim,
      101n,
    )),
    'GREATER_REALM_ALLOCATION_ORDER_INVALID',
  );
});

test('allocation replay rejects an authority-bound topology swap', () => {
  const topology = slots();
  const first = selectGreaterRealmCastleAllocationV1(topology, [], 1n);
  const claim = claimRows([first.allocation]);
  const swapped = topology.map(row => ({ ...row, topologyDigest: ALTERNATE_TOPOLOGY_DIGEST }));
  [swapped[0]!.regionId, swapped[100]!.regionId] = [
    swapped[100]!.regionId,
    swapped[0]!.regionId,
  ];
  const regionRanks = new Map<string, number>();
  for (const row of swapped) {
    row.regionOrderRank = regionRanks.get(row.regionId) ?? 0;
    regionRanks.set(row.regionId, row.regionOrderRank + 1);
  }
  validateGreaterRealmAllocationSlotsV1(swapped);
  assert.equal(
    code(() => selectGreaterRealmCastleAllocationV1(swapped, claim, 1n)),
    'GREATER_REALM_ALLOCATION_TOPOLOGY_DIGEST_MISMATCH',
  );
});

test('allocation is retry-safe through the 600th castle and rejects the 601st', () => {
  const topology = slots();
  const first599 = planGreaterRealmExistingPopulationV1(
    topology,
    Array.from({ length: 599 }, (_unused, index) => BigInt(index + 1)),
  );
  const claims = claimRows(first599);
  const final = selectGreaterRealmCastleAllocationV1(topology, claims, 600n);
  assert.equal(final.result, 'allocated');
  assert.equal(final.allocation.allocationSequence, 599n);
  const fullClaims = [...claims, {
    castleId: final.allocation.castleId,
    slotId: final.allocation.slotId,
    allocationSequence: final.allocation.allocationSequence,
    topologyDigest: final.allocation.topologyDigest,
  }];
  const retry = selectGreaterRealmCastleAllocationV1([...topology].reverse(), fullClaims, 600n);
  assert.equal(retry.result, 'unchanged');
  assert.deepEqual(retry.allocation, final.allocation);
  assert.equal(
    code(() => selectGreaterRealmCastleAllocationV1(topology, fullClaims, 601n)),
    'GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED',
  );
  assert.equal(
    code(() => planGreaterRealmExistingPopulationV1(
      topology,
      Array.from({ length: 601 }, (_unused, index) => BigInt(index + 1)),
    )),
    'GREATER_REALM_EXISTING_POPULATION_COUNT_INVALID',
  );
});

test('allocation rejects duplicate castles, slots, sequences, and noncanonical persisted order', () => {
  const topology = slots();
  assert.equal(
    code(() => planGreaterRealmExistingPopulationV1(topology, [1n, 1n])),
    'GREATER_REALM_ALLOCATION_CASTLE_DUPLICATE',
  );
  const firstTwo = claimRows(planGreaterRealmExistingPopulationV1(topology, [1n, 2n]));
  const adversarial = [
    {
      rows: [firstTwo[0]!, { ...firstTwo[1]!, castleId: firstTwo[0]!.castleId }],
      expected: 'GREATER_REALM_ALLOCATION_CASTLE_DUPLICATE',
    },
    {
      rows: [firstTwo[0]!, { ...firstTwo[1]!, slotId: firstTwo[0]!.slotId }],
      expected: 'GREATER_REALM_ALLOCATION_SLOT_DUPLICATE',
    },
    {
      rows: [firstTwo[0]!, { ...firstTwo[1]!, allocationSequence: 2n }],
      expected: 'GREATER_REALM_ALLOCATION_SEQUENCE_INVALID',
    },
    {
      rows: [
        { ...firstTwo[0]!, slotId: firstTwo[1]!.slotId },
        { ...firstTwo[1]!, slotId: firstTwo[0]!.slotId },
      ],
      expected: 'GREATER_REALM_ALLOCATION_ORDER_INVALID',
    },
  ];
  for (const row of adversarial) {
    assert.equal(
      code(() => selectGreaterRealmCastleAllocationV1(topology, row.rows, 3n)),
      row.expected,
    );
  }
  const accessorClaim = { ...firstTwo[0]! };
  Object.defineProperty(accessorClaim, 'slotId', {
    enumerable: true,
    get: () => firstTwo[0]!.slotId,
  });
  for (const malformed of [
    null,
    { ...firstTwo[0]!, nodeId: 'PRIVATE' },
    accessorClaim,
  ]) {
    assert.equal(
      code(() => selectGreaterRealmCastleAllocationV1(
        topology,
        [malformed] as unknown as GreaterRealmCastleAllocationClaimV1[],
        3n,
      )),
      'GREATER_REALM_ALLOCATION_CLAIM_ROW_INVALID',
    );
  }
});

test('public capacity leases use only exact GRL location capacity and never expose node identity', () => {
  const locationId = `GRL-${'A'.repeat(26)}`;
  assert.equal(formatGreaterRealmPublicCapacityLeaseIdV1(locationId, 32, 32), `${locationId}:32`);
  assert.equal(
    code(() => formatGreaterRealmPublicCapacityLeaseIdV1(locationId, 2, 1)),
    'GREATER_REALM_PUBLIC_CAPACITY_ORDINAL_INVALID',
  );
  assert.deepEqual(parseGreaterRealmPublicCapacityLeaseV1({
    leaseId: `${locationId}:1`,
    nodeCount: 1,
  }), { locationId, capacityOrdinal: 1, nodeCount: 1 });
  const maximum = parseGreaterRealmPublicCapacityLeaseV1({
    leaseId: `${locationId}:32`,
    nodeCount: 32,
  });
  assert.deepEqual(maximum, { locationId, capacityOrdinal: 32, nodeCount: 32 });
  assert.deepEqual(Object.keys(maximum), ['locationId', 'capacityOrdinal', 'nodeCount']);
  assert.equal(Object.isFrozen(maximum), true);

  for (const leaseId of [
    `${locationId}:0`, `${locationId}:01`, `${locationId}:33`,
    `${locationId}:1 `, ` ${locationId}:1`, `${locationId.toLowerCase()}:1`,
    `GRL-${'0'.repeat(26)}:1`, `GRL-${'A'.repeat(25)}:1`,
    `GRL-${'A'.repeat(27)}:1`, `${locationId}:1\n`,
  ]) {
    assert.equal(
      code(() => parseGreaterRealmPublicCapacityLeaseV1({ leaseId, nodeCount: 32 })),
      'GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID',
      leaseId,
    );
  }
  for (const nodeCount of [0, 33, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      code(() => parseGreaterRealmPublicCapacityLeaseV1({
        leaseId: `${locationId}:1`,
        nodeCount,
      })),
      'GREATER_REALM_PUBLIC_CAPACITY_NODE_COUNT_INVALID',
    );
  }
  assert.equal(
    code(() => parseGreaterRealmPublicCapacityLeaseV1({
      leaseId: `${locationId}:2`,
      nodeCount: 1,
    })),
    'GREATER_REALM_PUBLIC_CAPACITY_ORDINAL_INVALID',
  );
  for (const privateField of ['nodeId', 'legacyCatalogId', 'candidateHandle']) {
    assert.equal(
      code(() => parseGreaterRealmPublicCapacityLeaseV1({
        leaseId: `${locationId}:1`,
        nodeCount: 1,
        [privateField]: 'PRIVATE',
      })),
      'GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID',
    );
  }
  const accessorLease = Object.defineProperties({}, {
    leaseId: { enumerable: true, get: () => `${locationId}:1` },
    nodeCount: { enumerable: true, value: 1 },
  });
  assert.equal(
    code(() => parseGreaterRealmPublicCapacityLeaseV1(accessorLease)),
    'GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID',
  );
});

test('public capacity selection is first-free, deterministic, and terminal-retry safe', () => {
  const locationId = `GRL-${'A'.repeat(26)}`;
  const selection = {
    locationId,
    nodeCount: 4,
    capacityDigest: CAPACITY_DIGEST,
    occupiedCapacityOrdinals: [3, 1],
    priorReceipt: null,
  };
  const allocated = selectGreaterRealmPublicCapacityLeaseV1(selection);
  assert.deepEqual(allocated, {
    result: 'allocated',
    leaseId: `${locationId}:2`,
    locationId,
    capacityOrdinal: 2,
    nodeCount: 4,
    capacityDigest: CAPACITY_DIGEST,
  });
  assert.deepEqual(
    selectGreaterRealmPublicCapacityLeaseV1({
      ...selection,
      occupiedCapacityOrdinals: [1, 3],
    }),
    allocated,
  );
  assert.deepEqual(
    selectGreaterRealmPublicCapacityLeaseV1({
      locationId,
      nodeCount: 32,
      capacityDigest: CAPACITY_DIGEST,
      occupiedCapacityOrdinals: Array.from({ length: 31 }, (_unused, index) => index + 1),
      priorReceipt: null,
    }),
    {
      result: 'allocated',
      leaseId: `${locationId}:32`,
      locationId,
      capacityOrdinal: 32,
      nodeCount: 32,
      capacityDigest: CAPACITY_DIGEST,
    },
  );
  const priorReceipt = {
    leaseId: `${locationId}:3`,
    nodeCount: 4,
    capacityDigest: CAPACITY_DIGEST,
  };
  const replayed = selectGreaterRealmPublicCapacityLeaseV1({
    ...selection,
    priorReceipt,
  });
  assert.deepEqual(replayed, {
    result: 'unchanged',
    leaseId: `${locationId}:3`,
    locationId,
    capacityOrdinal: 3,
    nodeCount: 4,
    capacityDigest: CAPACITY_DIGEST,
  });
  assert.deepEqual(Object.keys(replayed), [
    'result', 'leaseId', 'locationId', 'capacityOrdinal', 'nodeCount', 'capacityDigest',
  ]);
  assert.equal(Object.isFrozen(replayed), true);
  for (const occupiedCapacityOrdinals of [[], [3], [1, 1]]) {
    assert.deepEqual(
      selectGreaterRealmPublicCapacityLeaseV1({
        ...selection,
        occupiedCapacityOrdinals,
        priorReceipt,
      }),
      replayed,
    );
  }
  let occupancyReads = 0;
  const hostileLiveOccupancy = new Array<unknown>(1);
  Object.defineProperty(hostileLiveOccupancy, '0', {
    enumerable: true,
    get: () => {
      occupancyReads += 1;
      return 1;
    },
  });
  assert.deepEqual(
    selectGreaterRealmPublicCapacityLeaseV1({
      ...selection,
      occupiedCapacityOrdinals: hostileLiveOccupancy,
      priorReceipt,
    }),
    replayed,
  );
  assert.equal(occupancyReads, 0);
});

test('public capacity selection rejects invalid occupancy, stale receipts, and private fields', () => {
  const locationId = `GRL-${'A'.repeat(26)}`;
  const alternateLocationId = `GRL-${'B'.repeat(26)}`;
  const base = {
    locationId,
    nodeCount: 2,
    capacityDigest: CAPACITY_DIGEST,
    occupiedCapacityOrdinals: [1],
    priorReceipt: null,
  };
  assert.equal(
    code(() => selectGreaterRealmPublicCapacityLeaseV1({
      ...base,
      occupiedCapacityOrdinals: [1, 1],
    })),
    'GREATER_REALM_PUBLIC_CAPACITY_OCCUPANCY_DUPLICATE',
  );
  for (const occupiedCapacityOrdinals of [[0], [3], [1.5], ['1']]) {
    assert.equal(
      code(() => selectGreaterRealmPublicCapacityLeaseV1({
        ...base,
        occupiedCapacityOrdinals,
      })),
      'GREATER_REALM_PUBLIC_CAPACITY_OCCUPANCY_INVALID',
    );
  }
  assert.equal(
    code(() => selectGreaterRealmPublicCapacityLeaseV1({
      ...base,
      occupiedCapacityOrdinals: [2, 1],
    })),
    'GREATER_REALM_PUBLIC_CAPACITY_EXHAUSTED',
  );
  for (const priorReceipt of [
    { leaseId: `${alternateLocationId}:1`, nodeCount: 2, capacityDigest: CAPACITY_DIGEST },
    { leaseId: `${locationId}:3`, nodeCount: 2, capacityDigest: CAPACITY_DIGEST },
    { leaseId: `${locationId}:01`, nodeCount: 2, capacityDigest: CAPACITY_DIGEST },
    { leaseId: `${locationId}:1`, nodeCount: 1, capacityDigest: CAPACITY_DIGEST },
    { leaseId: `${locationId}:1`, nodeCount: 2, capacityDigest: ALTERNATE_CAPACITY_DIGEST },
  ]) {
    assert.equal(
      code(() => selectGreaterRealmPublicCapacityLeaseV1({ ...base, priorReceipt })),
      'GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID',
      JSON.stringify(priorReceipt),
    );
  }
  for (const privateField of ['nodeId', 'legacyCatalogId', 'candidateHandle']) {
    assert.equal(
      code(() => selectGreaterRealmPublicCapacityLeaseV1({
        ...base,
        [privateField]: 'PRIVATE',
      })),
      'GREATER_REALM_PUBLIC_CAPACITY_SELECTION_INVALID',
    );
    assert.equal(
      code(() => selectGreaterRealmPublicCapacityLeaseV1({
        ...base,
        priorReceipt: {
          leaseId: `${locationId}:1`,
          nodeCount: 2,
          capacityDigest: CAPACITY_DIGEST,
          [privateField]: 'PRIVATE',
        },
      })),
      'GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID',
    );
  }
  assert.equal(
    code(() => selectGreaterRealmPublicCapacityLeaseV1({
      ...base,
      capacityDigest: CAPACITY_DIGEST.toUpperCase(),
    })),
    'GREATER_REALM_PUBLIC_CAPACITY_DIGEST_INVALID',
  );
  const accessorSelection = Object.defineProperties({}, {
    locationId: { enumerable: true, value: locationId },
    nodeCount: { enumerable: true, value: 2 },
    capacityDigest: { enumerable: true, get: () => CAPACITY_DIGEST },
    occupiedCapacityOrdinals: { enumerable: true, value: [1] },
    priorReceipt: { enumerable: true, value: null },
  });
  assert.equal(
    code(() => selectGreaterRealmPublicCapacityLeaseV1(accessorSelection)),
    'GREATER_REALM_PUBLIC_CAPACITY_SELECTION_INVALID',
  );
  const accessorReceipt = Object.defineProperties({}, {
    leaseId: { enumerable: true, get: () => `${locationId}:1` },
    nodeCount: { enumerable: true, value: 2 },
    capacityDigest: { enumerable: true, value: CAPACITY_DIGEST },
  });
  assert.equal(
    code(() => selectGreaterRealmPublicCapacityLeaseV1({
      ...base,
      priorReceipt: accessorReceipt,
    })),
    'GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID',
  );
});
