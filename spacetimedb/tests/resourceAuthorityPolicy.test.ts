import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REALM_RESOURCE_BALANCE_CAP,
  REALM_RESOURCE_POLICY_VERSION,
  REALM_RESOURCE_QUANTUM_MICROS,
  REALM_RESOURCE_STARTING_BALANCES,
  REALM_RESOURCE_TERRAIN_RATES,
  RESOURCE_U64_MAX,
  createInitialRealmResourceState,
  planResourceSettlement,
  resourceAccountStateIsConsistent,
  settleRealmResources,
  type RealmResourceAuthorityState,
  type RealmResourceBalances,
} from '../src/resourceAuthorityPolicy';

const CURSOR = 1_800_000_000_000_000n;

function account(
  change: Partial<RealmResourceAuthorityState> = {},
): RealmResourceAuthorityState {
  return {
    ...REALM_RESOURCE_STARTING_BALANCES,
    settledThroughMicros: CURSOR,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
    ...change,
  };
}

function settle(
  state: RealmResourceAuthorityState,
  quanta: bigint,
  remainderMicros = 0n,
  terrainKind = 'lowland',
) {
  return settleRealmResources({
    account: state,
    terrainKind,
    observedAtMicros:
      state.settledThroughMicros + (quanta * REALM_RESOURCE_QUANTUM_MICROS) + remainderMicros,
  });
}

test('initial resources use whole-unit u64 balances and a server-supplied cursor', () => {
  const initial = createInitialRealmResourceState(CURSOR);
  assert.deepEqual(initial, {
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: CURSOR,
    revision: 0n,
    policyVersion: REALM_RESOURCE_POLICY_VERSION,
  });
  assert.equal(REALM_RESOURCE_QUANTUM_MICROS, 600_000_000n);
  assert.equal(REALM_RESOURCE_BALANCE_CAP, 1_000_000n);
  assert.equal(REALM_RESOURCE_POLICY_VERSION, 'genesis-resource-yield-v1');
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(resourceAccountStateIsConsistent(initial), true);
  assert.throws(
    () => createInitialRealmResourceState(-1n),
    /RESOURCE_CURSOR_INVALID/,
  );
  assert.throws(
    () => createInitialRealmResourceState(RESOURCE_U64_MAX + 1n),
    /RESOURCE_CURSOR_INVALID/,
  );
});

test('every canonical terrain has explicit deterministic production rates', () => {
  const expected = {
    lowland: { food: 8n, wood: 5n, stone: 3n, gold: 0n },
    meadow: { food: 10n, wood: 4n, stone: 2n, gold: 0n },
    forest: { food: 5n, wood: 10n, stone: 3n, gold: 0n },
    heath: { food: 5n, wood: 6n, stone: 5n, gold: 0n },
    ridge: { food: 3n, wood: 4n, stone: 10n, gold: 0n },
    lake: { food: 10n, wood: 4n, stone: 2n, gold: 0n },
    'ancient-stone': { food: 3n, wood: 4n, stone: 8n, gold: 0n },
  } as const;

  assert.deepEqual(REALM_RESOURCE_TERRAIN_RATES, expected);
  for (const [terrainKind, rates] of Object.entries(expected)) {
    const state = account();
    const plan = planResourceSettlement(
      state,
      terrainKind,
      state.settledThroughMicros + REALM_RESOURCE_QUANTUM_MICROS,
    );
    assert.deepEqual(plan.deltas, rates, terrainKind);
    assert.deepEqual(plan.balances, {
      food: REALM_RESOURCE_STARTING_BALANCES.food + rates.food,
      wood: REALM_RESOURCE_STARTING_BALANCES.wood + rates.wood,
      stone: REALM_RESOURCE_STARTING_BALANCES.stone + rates.stone,
      gold: REALM_RESOURCE_STARTING_BALANCES.gold + rates.gold,
    }, terrainKind);
  }
});

test('settlement advances only through whole quanta and preserves the incomplete remainder', () => {
  const remainder = 123_456_789n;
  const plan = settle(account({ revision: 7n }), 2n, remainder, 'forest');
  assert.equal(plan.completedQuanta, 2n);
  assert.equal(plan.settledThroughMicros, CURSOR + (2n * REALM_RESOURCE_QUANTUM_MICROS));
  assert.equal(plan.nextCollectAtMicros, CURSOR + (3n * REALM_RESOURCE_QUANTUM_MICROS));
  assert.equal(plan.revision, 8n);
  assert.deepEqual(plan.deltas, { food: 10n, wood: 20n, stone: 6n, gold: 0n });

  const followupState = account({
    ...plan.balances,
    settledThroughMicros: plan.settledThroughMicros,
    revision: plan.revision,
  });
  const beforeNextQuantum = settleRealmResources({
    account: followupState,
    terrainKind: 'forest',
    observedAtMicros: plan.settledThroughMicros + remainder,
  });
  assert.equal(beforeNextQuantum.completedQuanta, 0n);
  assert.equal(beforeNextQuantum.revision, plan.revision);
  assert.deepEqual(beforeNextQuantum.deltas, { food: 0n, wood: 0n, stone: 0n, gold: 0n });
});

test('sub-quantum settlement is an immutable no-op plan', () => {
  const state = account({ revision: 12n });
  const plan = settle(state, 0n, REALM_RESOURCE_QUANTUM_MICROS - 1n);
  assert.deepEqual(plan.balances, {
    food: state.food,
    wood: state.wood,
    stone: state.stone,
    gold: state.gold,
  });
  assert.deepEqual(plan.deltas, { food: 0n, wood: 0n, stone: 0n, gold: 0n });
  assert.equal(plan.completedQuanta, 0n);
  assert.equal(plan.settledThroughMicros, CURSOR);
  assert.equal(plan.nextCollectAtMicros, CURSOR + REALM_RESOURCE_QUANTUM_MICROS);
  assert.equal(plan.revision, 12n);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.balances), true);
  assert.equal(Object.isFrozen(plan.deltas), true);
});

test('balances cap exactly while completed time and revision still advance', () => {
  const almostCapped: RealmResourceBalances = {
    food: REALM_RESOURCE_BALANCE_CAP - 2n,
    wood: REALM_RESOURCE_BALANCE_CAP - 20n,
    stone: REALM_RESOURCE_BALANCE_CAP,
    gold: REALM_RESOURCE_BALANCE_CAP - 1n,
  };
  const plan = settle(account({ ...almostCapped, revision: 9n }), 3n, 17n, 'lowland');
  assert.deepEqual(plan.balances, {
    food: REALM_RESOURCE_BALANCE_CAP,
    wood: REALM_RESOURCE_BALANCE_CAP - 5n,
    stone: REALM_RESOURCE_BALANCE_CAP,
    gold: REALM_RESOURCE_BALANCE_CAP - 1n,
  });
  assert.deepEqual(plan.deltas, { food: 2n, wood: 15n, stone: 0n, gold: 0n });
  assert.equal(plan.settledThroughMicros, CURSOR + (3n * REALM_RESOURCE_QUANTUM_MICROS));
  assert.equal(plan.revision, 10n);

  const capped = Object.freeze({
    food: REALM_RESOURCE_BALANCE_CAP,
    wood: REALM_RESOURCE_BALANCE_CAP,
    stone: REALM_RESOURCE_BALANCE_CAP,
    gold: 0n,
  });
  const cappedPlan = settle(account({ ...capped }), 5n, 99n, 'ancient-stone');
  assert.deepEqual(cappedPlan.balances, capped);
  assert.deepEqual(cappedPlan.deltas, { food: 0n, wood: 0n, stone: 0n, gold: 0n });
  assert.equal(cappedPlan.completedQuanta, 5n);
  assert.equal(cappedPlan.settledThroughMicros, CURSOR + (5n * REALM_RESOURCE_QUANTUM_MICROS));
  assert.equal(cappedPlan.revision, 1n);
});

test('very large server time settles with bigint math while an unrepresentable next boundary fails closed', () => {
  const state = account({ settledThroughMicros: 0n, revision: RESOURCE_U64_MAX - 1n });
  const safeObservedAt = RESOURCE_U64_MAX - REALM_RESOURCE_QUANTUM_MICROS;
  const plan = settleRealmResources({
    account: state,
    terrainKind: 'meadow',
    observedAtMicros: safeObservedAt,
  });
  assert.equal(plan.completedQuanta, safeObservedAt / REALM_RESOURCE_QUANTUM_MICROS);
  assert.ok(plan.settledThroughMicros <= RESOURCE_U64_MAX);
  assert.ok(plan.nextCollectAtMicros <= RESOURCE_U64_MAX);
  assert.ok(plan.nextCollectAtMicros > plan.settledThroughMicros);
  assert.deepEqual(plan.balances, {
    food: REALM_RESOURCE_BALANCE_CAP,
    wood: REALM_RESOURCE_BALANCE_CAP,
    stone: REALM_RESOURCE_BALANCE_CAP,
    gold: 0n,
  });
  assert.equal(plan.revision, RESOURCE_U64_MAX);
  assert.throws(
    () => settleRealmResources({
      account: state,
      terrainKind: 'meadow',
      observedAtMicros: RESOURCE_U64_MAX,
    }),
    /RESOURCE_ARITHMETIC_OVERFLOW/,
  );
});

test('unknown policy and non-canonical terrain values fail closed', () => {
  assert.throws(
    () => settle(account({ policyVersion: 'resource-policy-v0' }), 1n),
    /RESOURCE_POLICY_MISMATCH/,
  );
  for (const terrainKind of ['', 'desert', 'Lowland', '__proto__', 'constructor']) {
    assert.throws(
      () => settle(account(), 1n, 0n, terrainKind),
      /RESOURCE_TERRAIN_INVALID/,
      terrainKind,
    );
  }
});

test('future, invalid, and non-bigint server times fail closed', () => {
  assert.throws(
    () => settleRealmResources({
      account: account(),
      terrainKind: 'lowland',
      observedAtMicros: CURSOR - 1n,
    }),
    /RESOURCE_CURSOR_IN_FUTURE/,
  );
  for (const observedAtMicros of [-1n, RESOURCE_U64_MAX + 1n]) {
    assert.throws(
      () => settleRealmResources({
        account: account(),
        terrainKind: 'lowland',
        observedAtMicros,
      }),
      /RESOURCE_OBSERVED_TIME_INVALID/,
    );
  }
  assert.throws(
    () => settleRealmResources({
      account: account(),
      terrainKind: 'lowland',
      observedAtMicros: 123 as unknown as bigint,
    }),
    /RESOURCE_OBSERVED_TIME_INVALID/,
  );
  for (const settledThroughMicros of [-1n, RESOURCE_U64_MAX + 1n]) {
    assert.throws(
      () => settleRealmResources({
        account: account({ settledThroughMicros }),
        terrainKind: 'lowland',
        observedAtMicros: CURSOR,
      }),
      /RESOURCE_CURSOR_INVALID/,
    );
  }
});

test('negative, oversized, missing, and non-bigint balances are rejected as corruption', () => {
  const corruptStates: RealmResourceAuthorityState[] = [
    account({ food: -1n }),
    account({ wood: REALM_RESOURCE_BALANCE_CAP + 1n }),
    account({ stone: RESOURCE_U64_MAX + 1n }),
    account({ gold: 0 as unknown as bigint }),
    {
      food: 0n,
      wood: 0n,
      stone: 0n,
      settledThroughMicros: CURSOR,
      revision: 0n,
      policyVersion: REALM_RESOURCE_POLICY_VERSION,
    } as unknown as RealmResourceAuthorityState,
  ];
  for (const state of corruptStates) {
    assert.equal(resourceAccountStateIsConsistent(state), false);
    assert.throws(
      () => settle(state, 1n),
      /RESOURCE_BALANCE_CORRUPT/,
    );
  }
});

test('revision bounds are checked and exhaustion fails closed', () => {
  assert.throws(
    () => settle(account({ revision: -1n }), 1n),
    /RESOURCE_REVISION_INVALID/,
  );
  assert.throws(
    () => settle(account({ revision: RESOURCE_U64_MAX + 1n }), 1n),
    /RESOURCE_REVISION_INVALID/,
  );
  assert.throws(
    () => settle(account({ revision: RESOURCE_U64_MAX }), 0n),
    /RESOURCE_REVISION_EXHAUSTED/,
  );
  assert.throws(
    () => settle(account({ revision: 1 as unknown as bigint }), 1n),
    /RESOURCE_REVISION_INVALID/,
  );
});
