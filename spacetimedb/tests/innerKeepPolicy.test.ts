import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  CANONICAL_INNER_KEEP_LEVEL_POLICIES,
  INNER_KEEP_BASIS_POINTS,
  INNER_KEEP_COST_ROUNDING_QUANTUM,
  INNER_KEEP_DISCOUNT_CAP_BPS,
  INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
  INNER_KEEP_MAXIMUM_LEVEL,
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION,
  INNER_KEEP_RESOURCE_BALANCE_CAP,
  InnerKeepPolicyError,
  canonicalInnerKeepBuildingKinds,
  canonicalInnerKeepCost,
  canonicalInnerKeepPolicyDigestInput,
  innerKeepDiscountBasisPoints,
  innerKeepActivationRowsAreSafe,
  matchesCanonicalInnerKeepBuildingPolicy,
  matchesCanonicalInnerKeepLevelPolicy,
} from '../src/innerKeepPolicy';
import {
  CANONICAL_INNER_KEEP_LAYOUT,
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LARGE_SLOT_COUNT,
  INNER_KEEP_LAYOUT_DIGEST,
  INNER_KEEP_MEDIUM_SLOT_COUNT,
  INNER_KEEP_SLOT_COUNT,
  canonicalInnerKeepLayoutDigestInput,
  innerKeepActivationLifecycle,
  innerKeepLifecycleRequiresBuilders,
  matchesCanonicalInnerKeepLayout,
  matchesCanonicalInnerKeepSlot,
} from '../src/innerKeepLayoutPolicy';

test('Inner Keep pins four unique economy buildings and twenty exact level rows', () => {
  assert.deepEqual(canonicalInnerKeepBuildingKinds(), [
    'city-mill',
    'lumber-camp',
    'city-stoneworks',
    'city-goldworks',
  ]);
  assert.equal(CANONICAL_INNER_KEEP_BUILDING_CATALOG.length, 4);
  assert.equal(new Set(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => row.publicLabel)).size, 4);
  assert.equal(new Set(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => row.runtimeAssetId)).size, 4);
  assert.deepEqual(
    new Set(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => row.matchingDiscountResource)),
    new Set(['food', 'wood', 'stone', 'gold']),
  );
  assert.equal(CANONICAL_INNER_KEEP_LEVEL_POLICIES.length, 20);
  assert.equal(new Set(CANONICAL_INNER_KEEP_LEVEL_POLICIES.map(row => row.levelKey)).size, 20);
  assert.equal(Object.isFrozen(CANONICAL_INNER_KEEP_BUILDING_CATALOG), true);
  assert.equal(Object.isFrozen(CANONICAL_INNER_KEEP_LEVEL_POLICIES), true);
  for (const building of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
    assert.equal(building.maximumLevel, INNER_KEEP_MAXIMUM_LEVEL);
    assert.equal(building.footprintClass, 'medium');
    assert.equal(building.uniquePerCastle, true);
    assert.equal(building.active, true);
    assert.equal(building.policyVersion, INNER_KEEP_POLICY_VERSION);
    const { baseCost, ...publicRow } = building;
    assert.equal(matchesCanonicalInnerKeepBuildingPolicy(publicRow), true);
    assert.equal(Object.isFrozen(baseCost), true);
  }
  for (const level of CANONICAL_INNER_KEEP_LEVEL_POLICIES) {
    assert.equal(matchesCanonicalInnerKeepLevelPolicy(level), true);
  }
});

test('Inner Keep base recipes, multipliers, and durations are exact', () => {
  const expectedBase = {
    'city-mill': { food: 300n, wood: 900n, stone: 600n, gold: 0n },
    'lumber-camp': { food: 500n, wood: 700n, stone: 650n, gold: 0n },
    'city-stoneworks': { food: 500n, wood: 900n, stone: 450n, gold: 0n },
    'city-goldworks': { food: 700n, wood: 1_200n, stone: 1_000n, gold: 500n },
  } as const;
  const expectedMultipliers = [10_000, 22_400, 37_632, 56_197, 78_676];
  const expectedDurations = [
    86_400_000_000n,
    172_800_000_000n,
    280_800_000_000n,
    403_200_000_000n,
    543_600_000_000n,
  ];
  for (const building of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
    assert.deepEqual(building.baseCost, expectedBase[building.buildingKind]);
    const levels = CANONICAL_INNER_KEEP_LEVEL_POLICIES.filter(
      level => level.buildingKind === building.buildingKind,
    );
    assert.deepEqual(levels.map(level => level.targetLevel), [1, 2, 3, 4, 5]);
    assert.deepEqual(levels.map(level => level.levelMultiplierBasisPoints), expectedMultipliers);
    assert.deepEqual(levels.map(level => level.durationMicros), expectedDurations);
  }
});

test('authoritative cost arithmetic rounds each rational upward to tens', () => {
  assert.deepEqual(canonicalInnerKeepCost('city-mill', 1).effectiveCost, {
    food: 300n,
    wood: 900n,
    stone: 600n,
    gold: 0n,
  });
  assert.deepEqual(canonicalInnerKeepCost('city-mill', 2).effectiveCost, {
    food: 680n,
    wood: 2_020n,
    stone: 1_350n,
    gold: 0n,
  });
  assert.deepEqual(canonicalInnerKeepCost('city-goldworks', 5).effectiveCost, {
    food: 5_510n,
    wood: 9_450n,
    stone: 7_870n,
    gold: 3_940n,
  });
  for (const building of canonicalInnerKeepBuildingKinds()) {
    for (let targetLevel = 1; targetLevel <= 5; targetLevel += 1) {
      const plan = canonicalInnerKeepCost(building, targetLevel);
      for (const amount of Object.values(plan.effectiveCost)) {
        assert.equal(amount % 10n, 0n);
        assert.equal(amount <= 1_000_000n, true);
      }
    }
  }
});

test('only completed levels discount the matching future resource, including own upgrade', () => {
  const undiscounted = canonicalInnerKeepCost('lumber-camp', 2);
  const oneCompleted = canonicalInnerKeepCost('lumber-camp', 2, { 'lumber-camp': 1 });
  assert.equal(oneCompleted.discountBasisPoints.wood, 500);
  assert.equal(oneCompleted.effectiveCost.wood, 1_500n);
  assert.equal(undiscounted.effectiveCost.wood, 1_570n);
  assert.equal(oneCompleted.effectiveCost.food, undiscounted.effectiveCost.food);
  assert.equal(oneCompleted.effectiveCost.stone, undiscounted.effectiveCost.stone);
  assert.equal(oneCompleted.effectiveCost.gold, 0n);

  for (const policy of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
    const plan = canonicalInnerKeepCost('city-goldworks', 1, {
      [policy.buildingKind]: 1,
    });
    for (const resource of ['food', 'wood', 'stone', 'gold'] as const) {
      assert.equal(
        plan.discountBasisPoints[resource],
        resource === policy.matchingDiscountResource
          ? INNER_KEEP_DISCOUNT_BPS_PER_LEVEL
          : 0,
      );
    }
  }

  const capped = canonicalInnerKeepCost('city-goldworks', 5, {
    'city-mill': 5,
    'lumber-camp': 5,
    'city-stoneworks': 5,
    'city-goldworks': 5,
  });
  assert.deepEqual(capped.discountBasisPoints, {
    food: INNER_KEEP_DISCOUNT_CAP_BPS,
    wood: INNER_KEEP_DISCOUNT_CAP_BPS,
    stone: INNER_KEEP_DISCOUNT_CAP_BPS,
    gold: INNER_KEEP_DISCOUNT_CAP_BPS,
  });
  assert.equal(innerKeepDiscountBasisPoints(5), INNER_KEEP_DISCOUNT_CAP_BPS);
});

test('invalid levels, kinds, and overflowing inputs fail closed', () => {
  assert.throws(() => canonicalInnerKeepCost('barracks', 1), (error: unknown) => (
    error instanceof InnerKeepPolicyError && error.code === 'INNER_KEEP_BUILDING_KIND_INVALID'
  ));
  assert.throws(() => canonicalInnerKeepCost('city-mill', 0), (error: unknown) => (
    error instanceof InnerKeepPolicyError && error.code === 'INNER_KEEP_TARGET_LEVEL_INVALID'
  ));
  assert.throws(() => canonicalInnerKeepCost('city-mill', 6), (error: unknown) => (
    error instanceof InnerKeepPolicyError && error.code === 'INNER_KEEP_TARGET_LEVEL_INVALID'
  ));
  assert.throws(() => canonicalInnerKeepCost('city-mill', 2, { 'city-mill': 6 }), (error: unknown) => (
    error instanceof InnerKeepPolicyError && error.code === 'INNER_KEEP_COMPLETED_LEVEL_INVALID'
  ));
});

test('first activation is zero-state while reactivation preserves completed history', () => {
  assert.equal(innerKeepActivationRowsAreSafe({
    previouslyActivated: false,
    buildingRows: 0n,
    activeProjects: 0n,
    receiptRows: 0n,
    scheduleRows: 0n,
  }), true);
  assert.equal(innerKeepActivationRowsAreSafe({
    previouslyActivated: false,
    buildingRows: 1n,
    activeProjects: 0n,
    receiptRows: 1n,
    scheduleRows: 0n,
  }), false);
  assert.equal(innerKeepActivationRowsAreSafe({
    previouslyActivated: true,
    buildingRows: 4n,
    activeProjects: 0n,
    receiptRows: 20n,
    scheduleRows: 0n,
  }), true);
  assert.equal(innerKeepActivationRowsAreSafe({
    previouslyActivated: true,
    buildingRows: 4n,
    activeProjects: 1n,
    receiptRows: 20n,
    scheduleRows: 1n,
  }), false);
});

test('deactivation preserves the ever-activated lifecycle for founder Builder coverage', () => {
  assert.equal(innerKeepActivationLifecycle({
    active: false,
    activatedAt: undefined,
  }), 'never-activated');
  const firstActivation = { microsSinceUnixEpoch: 123n };
  assert.equal(innerKeepActivationLifecycle({
    active: true,
    activatedAt: firstActivation,
  }), 'active');
  assert.equal(innerKeepActivationLifecycle({
    active: false,
    activatedAt: firstActivation,
  }), 'inactive-after-activation');
  assert.equal(innerKeepLifecycleRequiresBuilders('never-activated'), false);
  assert.equal(innerKeepLifecycleRequiresBuilders('active'), true);
  assert.equal(innerKeepLifecycleRequiresBuilders('inactive-after-activation'), true);
  assert.equal(innerKeepLifecycleRequiresBuilders('invalid'), false);
  assert.equal(innerKeepActivationLifecycle({
    active: true,
    activatedAt: undefined,
  }), 'invalid');
});

test('Inner Keep policy and layout digests detect checked-in drift', () => {
  assert.deepEqual(
    canonicalInnerKeepPolicyDigestInput().split('|').slice(0, 7),
    [
      INNER_KEEP_POLICY_VERSION,
      INNER_KEEP_MAXIMUM_LEVEL.toString(),
      INNER_KEEP_BASIS_POINTS.toString(),
      INNER_KEEP_COST_ROUNDING_QUANTUM.toString(),
      INNER_KEEP_DISCOUNT_BPS_PER_LEVEL.toString(),
      INNER_KEEP_DISCOUNT_CAP_BPS.toString(),
      INNER_KEEP_RESOURCE_BALANCE_CAP.toString(),
    ],
  );
  assert.equal(
    createHash('sha256').update(canonicalInnerKeepPolicyDigestInput()).digest('hex'),
    INNER_KEEP_POLICY_DIGEST,
  );
  assert.equal(
    createHash('sha256').update(canonicalInnerKeepLayoutDigestInput()).digest('hex'),
    INNER_KEEP_LAYOUT_DIGEST,
  );
  assert.match(INNER_KEEP_ASSET_CATALOG_DIGEST, /^[0-9a-f]{64}$/);
  assert.equal(matchesCanonicalInnerKeepLayout(CANONICAL_INNER_KEEP_LAYOUT), true);
  assert.equal(matchesCanonicalInnerKeepLayout({
    ...CANONICAL_INNER_KEEP_LAYOUT,
    layoutVersion: 2,
  }), false);
});

test('layout contains eight active medium and four reserved large slots', () => {
  assert.equal(CANONICAL_INNER_KEEP_SLOTS.length, INNER_KEEP_SLOT_COUNT);
  assert.equal(new Set(CANONICAL_INNER_KEEP_SLOTS.map(slot => slot.slotId)).size, 12);
  assert.equal(new Set(CANONICAL_INNER_KEEP_SLOTS.map(slot => slot.sortOrder)).size, 12);
  assert.equal(
    CANONICAL_INNER_KEEP_SLOTS.filter(slot => slot.footprintClass === 'medium').length,
    INNER_KEEP_MEDIUM_SLOT_COUNT,
  );
  assert.equal(
    CANONICAL_INNER_KEEP_SLOTS.filter(slot => slot.footprintClass === 'large').length,
    INNER_KEEP_LARGE_SLOT_COUNT,
  );
  for (const slot of CANONICAL_INNER_KEEP_SLOTS) {
    assert.equal(matchesCanonicalInnerKeepSlot(slot), true);
    assert.equal(slot.active, slot.footprintClass === 'medium');
  }
});
