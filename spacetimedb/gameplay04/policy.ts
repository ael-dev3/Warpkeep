export type Resource04 = 'food' | 'wood' | 'stone' | 'gold';

export type Building04 =
  | 'city-mill'
  | 'lumber-camp'
  | 'city-stoneworks'
  | 'city-goldworks'
  | 'city-barracks'
  | 'grand-covenant-cathedral';

export type Cost04 = Readonly<Record<Resource04, bigint>>;
export type CompletedLevels04 = Readonly<Record<Building04, number>>;

export const GAMEPLAY04_POLICY_VERSION = 'warpkeep-0.4-gameplay-v1';
export const GAMEPLAY04_BALANCE_CAP = 1_000_000n;
export const GAMEPLAY04_WORKER_COUNT = 4;
export const GAMEPLAY04_GATHER_QUANTUM_MICROS = 10_000_000n;

const RESOURCES = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);
const BUILDINGS = Object.freeze([
  'city-mill',
  'lumber-camp',
  'city-stoneworks',
  'city-goldworks',
  'city-barracks',
  'grand-covenant-cathedral',
] as const);

const BASE_COSTS: Readonly<Record<Building04, readonly [bigint, bigint, bigint, bigint]>> = Object.freeze({
  'city-mill': Object.freeze([20n, 40n, 20n, 0n] as const),
  'lumber-camp': Object.freeze([20n, 20n, 40n, 0n] as const),
  'city-stoneworks': Object.freeze([40n, 20n, 20n, 0n] as const),
  'city-goldworks': Object.freeze([40n, 60n, 40n, 20n] as const),
  'city-barracks': Object.freeze([60n, 80n, 80n, 40n] as const),
  'grand-covenant-cathedral': Object.freeze([80n, 100n, 120n, 60n] as const),
});

const COST_MULTIPLIERS = Object.freeze([1n, 3n, 7n, 15n, 31n] as const);
const BUILD_DURATIONS_MICROS = Object.freeze([
  120_000_000n,
  900_000_000n,
  3_600_000_000n,
  14_400_000_000n,
  43_200_000_000n,
] as const);

export const GAMEPLAY04_GATHER_DURATIONS_MICROS: readonly bigint[] = Object.freeze([
  60_000_000n,
  600_000_000n,
  3_600_000_000n,
  28_800_000_000n,
]);

const MATCHING_ECONOMY_BUILDING: Readonly<Record<Resource04, Building04>> = Object.freeze({
  food: 'city-mill',
  wood: 'lumber-camp',
  stone: 'city-stoneworks',
  gold: 'city-goldworks',
});

const INPUT_ERROR_CODE = 'GAMEPLAY04_POLICY_INPUT_INVALID';
const U64_MAX = 18_446_744_073_709_551_615n;

export class Gameplay04PolicyError extends Error {
  readonly code = INPUT_ERROR_CODE;

  constructor() {
    super('Invalid gameplay 0.4 policy input.');
    this.name = 'Gameplay04PolicyError';
  }
}

function invalidInput(): never {
  throw new Gameplay04PolicyError();
}

function requireResource(resource: unknown): asserts resource is Resource04 {
  if (typeof resource !== 'string' || !RESOURCES.includes(resource as Resource04)) {
    invalidInput();
  }
}

function requireBuilding(building: unknown): asserts building is Building04 {
  if (typeof building !== 'string' || !BUILDINGS.includes(building as Building04)) {
    invalidInput();
  }
}

function requireTargetLevel(targetLevel: unknown): asserts targetLevel is number {
  if (
    typeof targetLevel !== 'number'
    || !Number.isInteger(targetLevel)
    || targetLevel < 1
    || targetLevel > 5
  ) {
    invalidInput();
  }
}

function requireCompletedLevels(completed: unknown): asserts completed is CompletedLevels04 {
  if (completed === null || typeof completed !== 'object' || Array.isArray(completed)) {
    invalidInput();
  }

  const enumerableKeys = Reflect.ownKeys(completed).filter((key) => (
    Object.prototype.propertyIsEnumerable.call(completed, key)
  ));
  if (
    enumerableKeys.length !== BUILDINGS.length
    || enumerableKeys.some((key) => typeof key !== 'string' || !BUILDINGS.includes(key as Building04))
  ) {
    invalidInput();
  }

  for (const building of BUILDINGS) {
    if (!Object.prototype.hasOwnProperty.call(completed, building)) {
      invalidInput();
    }
    const level = (completed as Record<Building04, unknown>)[building];
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > 5) {
      invalidInput();
    }
  }
}

function ceilBps(base: bigint, bps: bigint): bigint {
  return (base * bps + 9_999n) / 10_000n;
}

export function buildingCost04(kind: Building04, targetLevel: number): Cost04 {
  requireBuilding(kind);
  requireTargetLevel(targetLevel);

  const [food, wood, stone, gold] = BASE_COSTS[kind];
  const multiplier = COST_MULTIPLIERS[targetLevel - 1];
  return Object.freeze({
    food: food * multiplier,
    wood: wood * multiplier,
    stone: stone * multiplier,
    gold: gold * multiplier,
  });
}

export function buildingDuration04(targetLevel: number, completed: CompletedLevels04): bigint {
  requireTargetLevel(targetLevel);
  requireCompletedLevels(completed);

  const reductionBps = BigInt(completed['grand-covenant-cathedral']) * 500n;
  return ceilBps(BUILD_DURATIONS_MICROS[targetLevel - 1], 10_000n - reductionBps);
}

export function gatheringYield04(resource: Resource04, completed: CompletedLevels04): bigint {
  requireResource(resource);
  requireCompletedLevels(completed);

  return 10n + BigInt(completed[MATCHING_ECONOMY_BUILDING[resource]]) * 2n;
}

export function travelPerEdge04(completed: CompletedLevels04): bigint {
  requireCompletedLevels(completed);

  const reductionBps = BigInt(completed['city-barracks']) * 500n;
  return ceilBps(2_000_000n, 10_000n - reductionBps);
}

export function requireGatherDuration04(durationMicros: bigint): bigint {
  if (
    typeof durationMicros !== 'bigint'
    || !GAMEPLAY04_GATHER_DURATIONS_MICROS.includes(durationMicros)
  ) {
    invalidInput();
  }
  return durationMicros;
}

export function creditResource04(
  balance: bigint,
  earned: bigint,
): Readonly<{ balance: bigint; credited: bigint; overflow: bigint }> {
  if (typeof balance !== 'bigint' || balance < 0n || balance > GAMEPLAY04_BALANCE_CAP) {
    invalidInput();
  }
  if (typeof earned !== 'bigint' || earned < 0n || earned > U64_MAX) {
    invalidInput();
  }

  const available = GAMEPLAY04_BALANCE_CAP - balance;
  const credited = earned < available ? earned : available;
  return Object.freeze({
    balance: balance + credited,
    credited,
    overflow: earned - credited,
  });
}
