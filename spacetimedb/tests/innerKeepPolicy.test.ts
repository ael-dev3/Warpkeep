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
  CANONICAL_INNER_KEEP_PLACEMENT_EXCLUSIONS,
  CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS,
  CANONICAL_INNER_KEEP_LAYOUT,
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_BUILDABLE_SUPPORT,
  INNER_KEEP_LARGE_SLOT_COUNT,
  INNER_KEEP_LAYOUT_DIGEST,
  INNER_KEEP_MEDIUM_SLOT_COUNT,
  INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES,
  INNER_KEEP_PLACEMENT_SNAP_MICROUNITS,
  INNER_KEEP_SLOT_COUNT,
  canonicalInnerKeepLayoutDigestInput,
  evaluateCanonicalInnerKeepPlacement,
  innerKeepActivationLifecycle,
  innerKeepLifecycleRequiresBuilders,
  matchesCanonicalInnerKeepLayout,
  matchesCanonicalInnerKeepSlot,
} from '../src/innerKeepLayoutPolicy';

test('Inner Keep pins six unique placeable buildings and thirty exact level rows', () => {
  assert.deepEqual(canonicalInnerKeepBuildingKinds(), [
    'city-mill',
    'lumber-camp',
    'city-stoneworks',
    'city-goldworks',
    'city-barracks',
    'grand-covenant-cathedral',
  ]);
  assert.equal(CANONICAL_INNER_KEEP_BUILDING_CATALOG.length, 6);
  assert.equal(new Set(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => row.publicLabel)).size, 6);
  assert.equal(new Set(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => row.runtimeAssetId)).size, 6);
  assert.deepEqual(
    new Set(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => row.matchingDiscountResource)),
    new Set(['food', 'wood', 'stone', 'gold', 'none']),
  );
  assert.deepEqual(
    Object.fromEntries(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => [
      row.buildingKind,
      {
        category: row.category,
        footprintClass: row.footprintClass,
        matchingDiscountResource: row.matchingDiscountResource,
        discountBasisPointsPerLevel: row.discountBasisPointsPerLevel,
        discountCapBasisPoints: row.discountCapBasisPoints,
      },
    ])),
    {
      'city-mill': {
        category: 'economy', footprintClass: 'medium', matchingDiscountResource: 'food',
        discountBasisPointsPerLevel: 500, discountCapBasisPoints: 2_500,
      },
      'lumber-camp': {
        category: 'economy', footprintClass: 'medium', matchingDiscountResource: 'wood',
        discountBasisPointsPerLevel: 500, discountCapBasisPoints: 2_500,
      },
      'city-stoneworks': {
        category: 'economy', footprintClass: 'medium', matchingDiscountResource: 'stone',
        discountBasisPointsPerLevel: 500, discountCapBasisPoints: 2_500,
      },
      'city-goldworks': {
        category: 'economy', footprintClass: 'medium', matchingDiscountResource: 'gold',
        discountBasisPointsPerLevel: 500, discountCapBasisPoints: 2_500,
      },
      'city-barracks': {
        category: 'military', footprintClass: 'large', matchingDiscountResource: 'none',
        discountBasisPointsPerLevel: 0, discountCapBasisPoints: 0,
      },
      'grand-covenant-cathedral': {
        category: 'civic', footprintClass: 'large', matchingDiscountResource: 'none',
        discountBasisPointsPerLevel: 0, discountCapBasisPoints: 0,
      },
    },
  );
  assert.equal(CANONICAL_INNER_KEEP_LEVEL_POLICIES.length, 30);
  assert.equal(new Set(CANONICAL_INNER_KEEP_LEVEL_POLICIES.map(row => row.levelKey)).size, 30);
  assert.equal(Object.isFrozen(CANONICAL_INNER_KEEP_BUILDING_CATALOG), true);
  assert.equal(Object.isFrozen(CANONICAL_INNER_KEEP_LEVEL_POLICIES), true);
  for (const building of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
    assert.equal(building.maximumLevel, INNER_KEEP_MAXIMUM_LEVEL);
    assert.equal(
      building.footprintClass,
      building.category === 'economy' ? 'medium' : 'large',
    );
    assert.equal(
      building.matchingDiscountResource === 'none',
      building.category !== 'economy',
    );
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
    'city-barracks': { food: 800n, wood: 1_600n, stone: 1_400n, gold: 300n },
    'grand-covenant-cathedral': { food: 1_200n, wood: 1_800n, stone: 3_200n, gold: 1_200n },
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
    buildingRows: 6n,
    activeProjects: 0n,
    receiptRows: 30n,
    scheduleRows: 0n,
  }), true);
  assert.equal(innerKeepActivationRowsAreSafe({
    previouslyActivated: true,
    buildingRows: 6n,
    activeProjects: 1n,
    receiptRows: 30n,
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
  assert.equal(
    INNER_KEEP_POLICY_DIGEST,
    'cbffcdc223b5d99625cab7549f3a5ae211c725893574b629aa83f8260668a779',
  );
  assert.equal(
    INNER_KEEP_LAYOUT_DIGEST,
    '1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7',
  );
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

test('layout retains an empty compatibility slot catalog for free placement', () => {
  assert.equal(CANONICAL_INNER_KEEP_SLOTS.length, INNER_KEEP_SLOT_COUNT);
  assert.equal(INNER_KEEP_SLOT_COUNT, 0);
  assert.equal(INNER_KEEP_MEDIUM_SLOT_COUNT, 0);
  assert.equal(INNER_KEEP_LARGE_SLOT_COUNT, 0);
  assert.equal(matchesCanonicalInnerKeepSlot({
    slotId: 'retired-slot',
    layoutId: CANONICAL_INNER_KEEP_LAYOUT.layoutId,
    footprintClass: 'medium',
    localXMicrounits: 0n,
    localZMicrounits: 0n,
    rotationMilliDegrees: 0,
    sortOrder: 0,
    active: false,
  }), false);
});

test('free-placement geometry pins grid, quarter turns, support, exclusions, and footprints', () => {
  assert.equal(INNER_KEEP_PLACEMENT_SNAP_MICROUNITS, 500_000n);
  assert.deepEqual(INNER_KEEP_PLACEMENT_ROTATIONS_MILLI_DEGREES, [0, 90_000, 180_000, 270_000]);
  assert.deepEqual(INNER_KEEP_BUILDABLE_SUPPORT, {
    minimumXMicrounits: -44_000_000n,
    maximumXMicrounits: 44_000_000n,
    minimumZMicrounits: -40_000_000n,
    maximumZMicrounits: 32_000_000n,
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(CANONICAL_INNER_KEEP_PLACEMENT_FOOTPRINTS).map(
      ([kind, row]) => [kind, [row.halfXMicrounits, row.halfZMicrounits]],
    )),
    {
      'city-mill': [5_650_000n, 4_750_000n],
      'lumber-camp': [5_300_000n, 4_400_000n],
      'city-stoneworks': [5_500_000n, 4_600_000n],
      'city-goldworks': [5_500_000n, 4_600_000n],
      'city-barracks': [9_250_000n, 7_750_000n],
      'grand-covenant-cathedral': [18_500_000n, 16_010_000n],
    },
  );
  assert.deepEqual(
    CANONICAL_INNER_KEEP_PLACEMENT_EXCLUSIONS,
    [
      {
        exclusionId: 'inner-keep-permanent-gate-spine',
        centerXMicrounits: 0n,
        centerZMicrounits: 14_500_000n,
        halfXMicrounits: 3_000_000n,
        halfZMicrounits: 17_500_000n,
      },
      {
        exclusionId: 'inner-keep-permanent-civic-commons',
        centerXMicrounits: 0n,
        centerZMicrounits: 2_000_000n,
        halfXMicrounits: 5_000_000n,
        halfZMicrounits: 5_000_000n,
      },
      {
        exclusionId: 'inner-keep-permanent-gate-approach',
        centerXMicrounits: 0n,
        centerZMicrounits: 30_000_000n,
        halfXMicrounits: 4_000_000n,
        halfZMicrounits: 2_000_000n,
      },
    ],
  );
});

test('placement validation rejects off-grid, rotation, boundary, reserved, and overlap while allowing touch', () => {
  const evaluateMill = (
    localXMicrounits: bigint,
    localZMicrounits: bigint,
    rotationMilliDegrees = 0,
  ) => evaluateCanonicalInnerKeepPlacement('city-mill', {
    localXMicrounits,
    localZMicrounits,
    rotationMilliDegrees,
  }, []);
  assert.deepEqual(evaluateMill(-30_250_000n, -25_000_000n), {
    valid: false,
    reason: 'INNER_KEEP_PLACEMENT_OFF_GRID',
  });
  assert.deepEqual(evaluateMill(-30_000_000n, -25_000_000n, 45_000), {
    valid: false,
    reason: 'INNER_KEEP_PLACEMENT_ROTATION',
  });
  assert.deepEqual(evaluateMill(-38_500_000n, -25_000_000n), {
    valid: false,
    reason: 'INNER_KEEP_PLACEMENT_OUTSIDE',
  });
  assert.deepEqual(evaluateMill(0n, 0n), {
    valid: false,
    reason: 'INNER_KEEP_PLACEMENT_RESERVED',
    conflictId: 'inner-keep-permanent-gate-spine',
  });

  const occupied = [{
    buildingKey: '1:city-stoneworks',
    buildingKind: 'city-stoneworks' as const,
    localXMicrounits: -20_000_000n,
    localZMicrounits: -20_000_000n,
    rotationMilliDegrees: 0,
  }];
  assert.deepEqual(evaluateCanonicalInnerKeepPlacement('city-goldworks', {
    localXMicrounits: -9_500_000n,
    localZMicrounits: -20_000_000n,
    rotationMilliDegrees: 0,
  }, occupied), {
    valid: false,
    reason: 'INNER_KEEP_PLACEMENT_OCCUPIED',
    conflictId: '1:city-stoneworks',
  });
  assert.deepEqual(evaluateCanonicalInnerKeepPlacement('city-goldworks', {
    localXMicrounits: -9_000_000n,
    localZMicrounits: -20_000_000n,
    rotationMilliDegrees: 0,
  }, occupied), { valid: true });
});
