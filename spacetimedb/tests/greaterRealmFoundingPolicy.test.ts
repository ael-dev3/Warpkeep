import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GREATER_REALM_FOUNDED_PASSIVE_TERRAIN_BY_YIELD_CLASS,
  GREATER_REALM_FOUNDED_PASSIVE_YIELD_POLICY_VERSION,
  greaterRealmFoundedPassiveTerrainForYieldClassV1,
  greaterRealmFoundingPolicyErrorCode,
} from '../src/greaterRealmFoundingPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  REALM_RESOURCE_BALANCE_CAP,
  REALM_RESOURCE_TERRAIN_RATES,
  RESOURCE_PRODUCTION_QUANTUM_MICROS,
  planResourceSettlement,
} from '../src/resourceAuthorityPolicy';

function code(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return greaterRealmFoundingPolicyErrorCode(error);
  }
  return undefined;
}

test('reviewed founded yield classes project onto the existing capped four-resource economy', () => {
  assert.equal(
    GREATER_REALM_FOUNDED_PASSIVE_YIELD_POLICY_VERSION,
    'greater-realm-founded-passive-yield-v1',
  );
  assert.deepEqual(GREATER_REALM_FOUNDED_PASSIVE_TERRAIN_BY_YIELD_CLASS, {
    1: 'lowland',
    2: 'meadow',
    3: 'ridge',
  });
  for (const yieldClass of [1, 2, 3]) {
    const terrain = greaterRealmFoundedPassiveTerrainForYieldClassV1(yieldClass);
    const rates = REALM_RESOURCE_TERRAIN_RATES[terrain];
    assert.deepEqual(Object.keys(rates).sort(), ['food', 'gold', 'stone', 'wood']);
    assert.equal(rates.gold, 0n, 'passive Gold remains expedition-only');
    const settlement = planResourceSettlement({
      food: REALM_RESOURCE_BALANCE_CAP - 1n,
      wood: REALM_RESOURCE_BALANCE_CAP - 1n,
      stone: REALM_RESOURCE_BALANCE_CAP - 1n,
      gold: REALM_RESOURCE_BALANCE_CAP - 1n,
      settledThroughMicros: 0n,
      revision: 0n,
      policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    }, terrain, RESOURCE_PRODUCTION_QUANTUM_MICROS * 1_000n);
    assert.equal(settlement.balances.food, REALM_RESOURCE_BALANCE_CAP);
    assert.equal(settlement.balances.wood, REALM_RESOURCE_BALANCE_CAP);
    assert.equal(settlement.balances.stone, REALM_RESOURCE_BALANCE_CAP);
    assert.equal(settlement.balances.gold, REALM_RESOURCE_BALANCE_CAP - 1n);
  }
});

test('unproductive, fractional, and future unreviewed yield classes fail closed', () => {
  for (const value of [0, 4, -1, 1.5, Number.NaN]) {
    assert.equal(
      code(() => greaterRealmFoundedPassiveTerrainForYieldClassV1(value)),
      'GREATER_REALM_FOUNDED_YIELD_CLASS_INVALID',
    );
  }
});
