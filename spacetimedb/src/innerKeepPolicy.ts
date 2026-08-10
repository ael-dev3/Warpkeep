/**
 * Canonical, additive Inner Keep construction policy.
 *
 * This file is the sole hand-authored source for building recipes, target-level
 * multipliers, durations, footprint requirements, and completed-building
 * discounts. Seeded public rows are projections of these constants; gameplay
 * authority revalidates those projections before accepting a project.
 */

export const INNER_KEEP_POLICY_VERSION = 'genesis-001-inner-keep-construction-v1';
export const INNER_KEEP_PROTOCOL_CAPABILITY = 'inner-keep-construction-v1';
export const INNER_KEEP_MAXIMUM_LEVEL = 5;
export const INNER_KEEP_DISCOUNT_BPS_PER_LEVEL = 500;
export const INNER_KEEP_DISCOUNT_CAP_BPS = 2_500;
export const INNER_KEEP_BASIS_POINTS = 10_000;
export const INNER_KEEP_COST_ROUNDING_QUANTUM = 10n;
export const INNER_KEEP_RESOURCE_BALANCE_CAP = 1_000_000n;
export const INNER_KEEP_U64_MAX = (1n << 64n) - 1n;

export type InnerKeepResourceKind = 'food' | 'wood' | 'stone' | 'gold';
export type InnerKeepBuildingKind =
  | 'city-mill'
  | 'lumber-camp'
  | 'city-stoneworks'
  | 'city-goldworks'
  | 'city-barracks'
  | 'grand-covenant-cathedral';
export type InnerKeepFootprintClass = 'medium' | 'large';

export type InnerKeepResourceCost = Readonly<{
  food: bigint;
  wood: bigint;
  stone: bigint;
  gold: bigint;
}>;

export type InnerKeepBuildingPolicy = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  publicLabel: string;
  category: 'economy' | 'military' | 'civic';
  footprintClass: InnerKeepFootprintClass;
  maximumLevel: number;
  uniquePerCastle: true;
  matchingDiscountResource: InnerKeepResourceKind | 'none';
  discountBasisPointsPerLevel: number;
  discountCapBasisPoints: number;
  runtimeAssetId: string;
  previewAssetId: string;
  active: true;
  policyVersion: string;
  baseCost: InnerKeepResourceCost;
}>;

export type InnerKeepLevelPolicy = Readonly<{
  levelKey: string;
  buildingKind: InnerKeepBuildingKind;
  targetLevel: number;
  baseFoodCost: bigint;
  baseWoodCost: bigint;
  baseStoneCost: bigint;
  baseGoldCost: bigint;
  levelMultiplierBasisPoints: number;
  durationMicros: bigint;
  policyVersion: string;
}>;

export class InnerKeepPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InnerKeepPolicyError';
  }
}

function fail(code: string): never {
  throw new InnerKeepPolicyError(code);
}

function freezeCost(cost: InnerKeepResourceCost): InnerKeepResourceCost {
  return Object.freeze(cost);
}

const BUILDING_POLICIES: Readonly<Record<InnerKeepBuildingKind, InnerKeepBuildingPolicy>> =
  Object.freeze({
    'city-mill': Object.freeze({
      buildingKind: 'city-mill',
      publicLabel: 'City Mill',
      category: 'economy',
      footprintClass: 'medium',
      maximumLevel: INNER_KEEP_MAXIMUM_LEVEL,
      uniquePerCastle: true,
      matchingDiscountResource: 'food',
      discountBasisPointsPerLevel: INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
      discountCapBasisPoints: INNER_KEEP_DISCOUNT_CAP_BPS,
      runtimeAssetId: 'warpkeep.city-buildings.city-mill',
      previewAssetId: 'warpkeep.inner-keep.preview.city-mill',
      active: true,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      baseCost: freezeCost({ food: 300n, wood: 900n, stone: 600n, gold: 0n }),
    }),
    'lumber-camp': Object.freeze({
      buildingKind: 'lumber-camp',
      publicLabel: 'Lumber Camp',
      category: 'economy',
      footprintClass: 'medium',
      maximumLevel: INNER_KEEP_MAXIMUM_LEVEL,
      uniquePerCastle: true,
      matchingDiscountResource: 'wood',
      discountBasisPointsPerLevel: INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
      discountCapBasisPoints: INNER_KEEP_DISCOUNT_CAP_BPS,
      runtimeAssetId: 'warpkeep.city-buildings.lumber-camp',
      previewAssetId: 'warpkeep.inner-keep.preview.lumber-camp',
      active: true,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      baseCost: freezeCost({ food: 500n, wood: 700n, stone: 650n, gold: 0n }),
    }),
    'city-stoneworks': Object.freeze({
      buildingKind: 'city-stoneworks',
      publicLabel: 'City Stoneworks',
      category: 'economy',
      footprintClass: 'medium',
      maximumLevel: INNER_KEEP_MAXIMUM_LEVEL,
      uniquePerCastle: true,
      matchingDiscountResource: 'stone',
      discountBasisPointsPerLevel: INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
      discountCapBasisPoints: INNER_KEEP_DISCOUNT_CAP_BPS,
      runtimeAssetId: 'warpkeep.city-buildings.city-stoneworks',
      previewAssetId: 'warpkeep.inner-keep.preview.city-stoneworks',
      active: true,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      baseCost: freezeCost({ food: 500n, wood: 900n, stone: 450n, gold: 0n }),
    }),
    'city-goldworks': Object.freeze({
      buildingKind: 'city-goldworks',
      publicLabel: 'City Goldworks',
      category: 'economy',
      footprintClass: 'medium',
      maximumLevel: INNER_KEEP_MAXIMUM_LEVEL,
      uniquePerCastle: true,
      matchingDiscountResource: 'gold',
      discountBasisPointsPerLevel: INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
      discountCapBasisPoints: INNER_KEEP_DISCOUNT_CAP_BPS,
      runtimeAssetId: 'warpkeep.city-buildings.city-goldworks',
      previewAssetId: 'warpkeep.inner-keep.preview.city-goldworks',
      active: true,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      baseCost: freezeCost({ food: 700n, wood: 1_200n, stone: 1_000n, gold: 500n }),
    }),
    'city-barracks': Object.freeze({
      buildingKind: 'city-barracks',
      publicLabel: 'City Barracks',
      category: 'military',
      footprintClass: 'large',
      maximumLevel: INNER_KEEP_MAXIMUM_LEVEL,
      uniquePerCastle: true,
      matchingDiscountResource: 'none',
      discountBasisPointsPerLevel: 0,
      discountCapBasisPoints: 0,
      runtimeAssetId: 'warpkeep.city-buildings.city-barracks',
      previewAssetId: 'warpkeep.inner-keep.preview.city-barracks',
      active: true,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      baseCost: freezeCost({ food: 800n, wood: 1_600n, stone: 1_400n, gold: 300n }),
    }),
    'grand-covenant-cathedral': Object.freeze({
      buildingKind: 'grand-covenant-cathedral',
      publicLabel: 'Grand Covenant Cathedral',
      category: 'civic',
      footprintClass: 'large',
      maximumLevel: INNER_KEEP_MAXIMUM_LEVEL,
      uniquePerCastle: true,
      matchingDiscountResource: 'none',
      discountBasisPointsPerLevel: 0,
      discountCapBasisPoints: 0,
      runtimeAssetId: 'warpkeep.city-buildings.grand-covenant-cathedral',
      previewAssetId: 'warpkeep.inner-keep.preview.grand-covenant-cathedral',
      active: true,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      baseCost: freezeCost({ food: 1_200n, wood: 1_800n, stone: 3_200n, gold: 1_200n }),
    }),
  });

const BUILDING_KINDS = Object.freeze([
  'city-mill',
  'lumber-camp',
  'city-stoneworks',
  'city-goldworks',
  'city-barracks',
  'grand-covenant-cathedral',
] as const satisfies readonly InnerKeepBuildingKind[]);

const TARGET_LEVELS = Object.freeze([
  Object.freeze({ targetLevel: 1, multiplierBasisPoints: 10_000, durationMicros: 86_400_000_000n }),
  Object.freeze({ targetLevel: 2, multiplierBasisPoints: 22_400, durationMicros: 172_800_000_000n }),
  Object.freeze({ targetLevel: 3, multiplierBasisPoints: 37_632, durationMicros: 280_800_000_000n }),
  Object.freeze({ targetLevel: 4, multiplierBasisPoints: 56_197, durationMicros: 403_200_000_000n }),
  Object.freeze({ targetLevel: 5, multiplierBasisPoints: 78_676, durationMicros: 543_600_000_000n }),
]);

export function canonicalInnerKeepBuildingKinds(): readonly InnerKeepBuildingKind[] {
  return BUILDING_KINDS;
}

export function canonicalInnerKeepBuildingPolicy(kind: string): InnerKeepBuildingPolicy {
  if (!BUILDING_KINDS.includes(kind as InnerKeepBuildingKind)) {
    fail('INNER_KEEP_BUILDING_KIND_INVALID');
  }
  return BUILDING_POLICIES[kind as InnerKeepBuildingKind];
}

export const CANONICAL_INNER_KEEP_BUILDING_CATALOG = Object.freeze(
  BUILDING_KINDS.map(kind => BUILDING_POLICIES[kind]),
);

export const CANONICAL_INNER_KEEP_LEVEL_POLICIES = Object.freeze(
  BUILDING_KINDS.flatMap(buildingKind => TARGET_LEVELS.map(level => {
    const baseCost = BUILDING_POLICIES[buildingKind].baseCost;
    return Object.freeze({
      levelKey: `${buildingKind}:${level.targetLevel}`,
      buildingKind,
      targetLevel: level.targetLevel,
      baseFoodCost: baseCost.food,
      baseWoodCost: baseCost.wood,
      baseStoneCost: baseCost.stone,
      baseGoldCost: baseCost.gold,
      levelMultiplierBasisPoints: level.multiplierBasisPoints,
      durationMicros: level.durationMicros,
      policyVersion: INNER_KEEP_POLICY_VERSION,
    });
  })),
);

export function canonicalInnerKeepLevelPolicy(
  buildingKind: string,
  targetLevel: number,
): InnerKeepLevelPolicy {
  canonicalInnerKeepBuildingPolicy(buildingKind);
  if (!Number.isSafeInteger(targetLevel) || targetLevel < 1 || targetLevel > INNER_KEEP_MAXIMUM_LEVEL) {
    fail('INNER_KEEP_TARGET_LEVEL_INVALID');
  }
  const row = CANONICAL_INNER_KEEP_LEVEL_POLICIES.find(candidate => (
    candidate.buildingKind === buildingKind && candidate.targetLevel === targetLevel
  ));
  if (row === undefined) fail('INNER_KEEP_LEVEL_POLICY_MISSING');
  return row;
}

function assertU64(value: bigint, code: string): void {
  if (value < 0n || value > INNER_KEEP_U64_MAX) fail(code);
}

function checkedProduct(left: bigint, right: bigint, code: string): bigint {
  assertU64(left, code);
  assertU64(right, code);
  if (left !== 0n && right > INNER_KEEP_U64_MAX / left) fail(code);
  return left * right;
}

function checkedCeilDiv(numerator: bigint, denominator: bigint, code: string): bigint {
  assertU64(numerator, code);
  if (denominator <= 0n || denominator > INNER_KEEP_U64_MAX) fail(code);
  if (numerator === 0n) return 0n;
  if (numerator > INNER_KEEP_U64_MAX - (denominator - 1n)) fail(code);
  return (numerator + denominator - 1n) / denominator;
}

/** Round an exact non-negative rational numerator/divisor upward to whole tens. */
function roundedRationalToTen(numerator: bigint, divisor: bigint): bigint {
  const tens = checkedCeilDiv(
    numerator,
    checkedProduct(divisor, INNER_KEEP_COST_ROUNDING_QUANTUM, 'INNER_KEEP_COST_OVERFLOW'),
    'INNER_KEEP_COST_OVERFLOW',
  );
  return checkedProduct(tens, INNER_KEEP_COST_ROUNDING_QUANTUM, 'INNER_KEEP_COST_OVERFLOW');
}

export function innerKeepDiscountBasisPoints(completedLevel: number): number {
  if (!Number.isSafeInteger(completedLevel) || completedLevel < 0 || completedLevel > INNER_KEEP_MAXIMUM_LEVEL) {
    fail('INNER_KEEP_COMPLETED_LEVEL_INVALID');
  }
  return Math.min(
    INNER_KEEP_DISCOUNT_CAP_BPS,
    completedLevel * INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
  );
}

export type InnerKeepActivationRowSnapshot = Readonly<{
  previouslyActivated: boolean;
  buildingRows: bigint;
  activeProjects: bigint;
  receiptRows: bigint;
  scheduleRows: bigint;
}>;

/**
 * First activation must begin from zero gameplay. A forward-safe reactivation
 * may preserve completed buildings and immutable receipts, but never resumes
 * while a project or construction schedule is active.
 */
export function innerKeepActivationRowsAreSafe(snapshot: InnerKeepActivationRowSnapshot): boolean {
  if (
    snapshot.buildingRows < 0n
    || snapshot.activeProjects < 0n
    || snapshot.receiptRows < 0n
    || snapshot.scheduleRows < 0n
    || snapshot.activeProjects > snapshot.buildingRows
    || snapshot.activeProjects !== 0n
    || snapshot.scheduleRows !== 0n
  ) return false;
  return snapshot.previouslyActivated
    || (snapshot.buildingRows === 0n && snapshot.receiptRows === 0n);
}

export type InnerKeepCompletedLevels = Readonly<Partial<Record<InnerKeepBuildingKind, number>>>;

export type InnerKeepCostPlan = Readonly<{
  buildingKind: InnerKeepBuildingKind;
  targetLevel: number;
  durationMicros: bigint;
  rawCost: InnerKeepResourceCost;
  effectiveCost: InnerKeepResourceCost;
  discountBasisPoints: Readonly<Record<InnerKeepResourceKind, number>>;
  policyVersion: string;
}>;

function completedLevelFor(
  completedLevels: InnerKeepCompletedLevels,
  buildingKind: InnerKeepBuildingKind,
): number {
  const value = completedLevels[buildingKind] ?? 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > INNER_KEEP_MAXIMUM_LEVEL) {
    fail('INNER_KEEP_COMPLETED_LEVEL_INVALID');
  }
  return value;
}

function discountBuildingForResource(
  resource: InnerKeepResourceKind,
): InnerKeepBuildingKind {
  const matches = CANONICAL_INNER_KEEP_BUILDING_CATALOG.filter(
    policy => policy.matchingDiscountResource === resource,
  );
  if (matches.length !== 1) fail('INNER_KEEP_BUILDING_KIND_INVALID');
  return matches[0]!.buildingKind;
}

/**
 * Compute the exact authoritative cost for one target level.
 * Only completed levels are accepted; callers never pass a constructing target.
 */
export function canonicalInnerKeepCost(
  buildingKind: string,
  targetLevel: number,
  completedLevels: InnerKeepCompletedLevels = Object.freeze({}),
): InnerKeepCostPlan {
  const building = canonicalInnerKeepBuildingPolicy(buildingKind);
  const level = canonicalInnerKeepLevelPolicy(buildingKind, targetLevel);
  const rawCost = {} as Record<InnerKeepResourceKind, bigint>;
  const effectiveCost = {} as Record<InnerKeepResourceKind, bigint>;
  const discountBasisPoints = {} as Record<InnerKeepResourceKind, number>;
  for (const resource of ['food', 'wood', 'stone', 'gold'] as const) {
    const base = building.baseCost[resource];
    const raw = roundedRationalToTen(
      checkedProduct(base, BigInt(level.levelMultiplierBasisPoints), 'INNER_KEEP_COST_OVERFLOW'),
      BigInt(INNER_KEEP_BASIS_POINTS),
    );
    const discount = innerKeepDiscountBasisPoints(
      completedLevelFor(completedLevels, discountBuildingForResource(resource)),
    );
    const effective = roundedRationalToTen(
      checkedProduct(raw, BigInt(INNER_KEEP_BASIS_POINTS - discount), 'INNER_KEEP_COST_OVERFLOW'),
      BigInt(INNER_KEEP_BASIS_POINTS),
    );
    if (effective > INNER_KEEP_RESOURCE_BALANCE_CAP) fail('INNER_KEEP_COST_EXCEEDS_ACCOUNT_CAP');
    rawCost[resource] = raw;
    effectiveCost[resource] = effective;
    discountBasisPoints[resource] = discount;
  }
  return Object.freeze({
    buildingKind: building.buildingKind,
    targetLevel,
    durationMicros: level.durationMicros,
    rawCost: freezeCost(rawCost),
    effectiveCost: freezeCost(effectiveCost),
    discountBasisPoints: Object.freeze(discountBasisPoints),
    policyVersion: INNER_KEEP_POLICY_VERSION,
  });
}

export type InnerKeepBuildingPolicyRowLike = Readonly<{
  buildingKind: string;
  publicLabel: string;
  category: string;
  footprintClass: string;
  maximumLevel: number;
  uniquePerCastle: boolean;
  matchingDiscountResource: string;
  discountBasisPointsPerLevel: number;
  discountCapBasisPoints: number;
  runtimeAssetId: string;
  previewAssetId: string;
  active: boolean;
  policyVersion: string;
}>;

export function matchesCanonicalInnerKeepBuildingPolicy(
  row: InnerKeepBuildingPolicyRowLike,
): boolean {
  try {
    const expected = canonicalInnerKeepBuildingPolicy(row.buildingKind);
    return row.publicLabel === expected.publicLabel
      && row.category === expected.category
      && row.footprintClass === expected.footprintClass
      && row.maximumLevel === expected.maximumLevel
      && row.uniquePerCastle === expected.uniquePerCastle
      && row.matchingDiscountResource === expected.matchingDiscountResource
      && row.discountBasisPointsPerLevel === expected.discountBasisPointsPerLevel
      && row.discountCapBasisPoints === expected.discountCapBasisPoints
      && row.runtimeAssetId === expected.runtimeAssetId
      && row.previewAssetId === expected.previewAssetId
      && row.active === expected.active
      && row.policyVersion === expected.policyVersion;
  } catch (error) {
    if (error instanceof InnerKeepPolicyError) return false;
    throw error;
  }
}

export type InnerKeepLevelPolicyRowLike = Readonly<{
  levelKey: string;
  buildingKind: string;
  targetLevel: number;
  baseFoodCost: bigint;
  baseWoodCost: bigint;
  baseStoneCost: bigint;
  baseGoldCost: bigint;
  levelMultiplierBasisPoints: number;
  durationMicros: bigint;
  policyVersion: string;
}>;

export function matchesCanonicalInnerKeepLevelPolicy(row: InnerKeepLevelPolicyRowLike): boolean {
  try {
    const expected = canonicalInnerKeepLevelPolicy(row.buildingKind, row.targetLevel);
    return row.levelKey === expected.levelKey
      && row.baseFoodCost === expected.baseFoodCost
      && row.baseWoodCost === expected.baseWoodCost
      && row.baseStoneCost === expected.baseStoneCost
      && row.baseGoldCost === expected.baseGoldCost
      && row.levelMultiplierBasisPoints === expected.levelMultiplierBasisPoints
      && row.durationMicros === expected.durationMicros
      && row.policyVersion === expected.policyVersion;
  } catch (error) {
    if (error instanceof InnerKeepPolicyError) return false;
    throw error;
  }
}

/** Stable source for the SHA-256 policy digest pinned below. */
export function canonicalInnerKeepPolicyDigestInput(): string {
  return [
    INNER_KEEP_POLICY_VERSION,
    INNER_KEEP_MAXIMUM_LEVEL,
    INNER_KEEP_BASIS_POINTS,
    INNER_KEEP_COST_ROUNDING_QUANTUM,
    INNER_KEEP_DISCOUNT_BPS_PER_LEVEL,
    INNER_KEEP_DISCOUNT_CAP_BPS,
    INNER_KEEP_RESOURCE_BALANCE_CAP,
    ...CANONICAL_INNER_KEEP_BUILDING_CATALOG.flatMap(row => [
      row.buildingKind,
      row.publicLabel,
      row.category,
      row.footprintClass,
      row.maximumLevel,
      row.uniquePerCastle,
      row.matchingDiscountResource,
      row.discountBasisPointsPerLevel,
      row.discountCapBasisPoints,
      row.runtimeAssetId,
      row.previewAssetId,
      row.active,
      row.baseCost.food,
      row.baseCost.wood,
      row.baseCost.stone,
      row.baseCost.gold,
    ]),
    ...CANONICAL_INNER_KEEP_LEVEL_POLICIES.flatMap(row => [
      row.levelKey,
      row.levelMultiplierBasisPoints,
      row.durationMicros,
    ]),
  ].join('|');
}

// SHA-256 of canonicalInnerKeepPolicyDigestInput(). This literal keeps the
// deterministic module independent of Node's crypto implementation.
export const INNER_KEEP_POLICY_DIGEST =
  'cbffcdc223b5d99625cab7549f3a5ae211c725893574b629aa83f8260668a779';
