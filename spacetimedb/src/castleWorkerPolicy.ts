import {
  FOOD_EXPEDITION_POLICY_VERSION,
  FOOD_GATHERING_DURATION_MICROS,
  FOOD_GATHER_QUANTUM_MICROS,
  FOOD_GATHER_RATE_PER_QUANTUM,
} from './foodExpeditionPolicy';
import {
  GENESIS_TIER_I_FOOD_SITE_COUNT,
  GENESIS_TIER_I_FOOD_SITE_DIGEST,
  FOOD_SITE_POLICY_VERSION,
  canonicalFoodSiteV1ForId,
  matchesCanonicalTierIFoodSiteV1,
} from './foodSitePolicy';
import {
  GOLD_EXPEDITION_POLICY_VERSION,
  GOLD_GATHERING_DURATION_MICROS,
  GOLD_GATHER_QUANTUM_MICROS,
  GOLD_GATHER_RATE_PER_QUANTUM,
} from './goldExpeditionPolicy';
import {
  GENESIS_TIER_I_GOLD_SITE_COUNT,
  GENESIS_TIER_I_GOLD_SITE_DIGEST,
  GOLD_SITE_POLICY_VERSION,
  canonicalGoldSiteV1ForId,
  matchesCanonicalTierIGoldSiteV1,
  canonicalPassableRouteSteps,
} from './goldSitePolicy';
import {
  STONE_EXPEDITION_POLICY_VERSION,
  STONE_GATHERING_DURATION_MICROS,
  STONE_GATHER_QUANTUM_MICROS,
  STONE_GATHER_RATE_PER_QUANTUM,
} from './stoneExpeditionPolicy';
import {
  GENESIS_TIER_I_STONE_SITE_COUNT,
  GENESIS_TIER_I_STONE_SITE_DIGEST,
  STONE_SITE_POLICY_VERSION,
  canonicalStoneSiteV1ForId,
  matchesCanonicalTierIStoneSiteV1,
} from './stoneSitePolicy';
import {
  WOOD_EXPEDITION_POLICY_VERSION,
  WOOD_GATHERING_DURATION_MICROS,
  WOOD_GATHER_QUANTUM_MICROS,
  WOOD_GATHER_RATE_PER_QUANTUM,
} from './woodExpeditionPolicy';
import {
  GENESIS_TIER_I_WOOD_SITE_COUNT,
  GENESIS_TIER_I_WOOD_SITE_DIGEST,
  WOOD_SITE_POLICY_VERSION,
  canonicalWoodSiteV1ForId,
  matchesCanonicalTierIWoodSiteV1,
} from './woodSitePolicy';

export const CASTLE_WORKERS_PER_CASTLE = 4;
export const CASTLE_WORKER_POLICY_VERSION = 'genesis-001-castle-workers-v1';
export const CASTLE_WORKER_GATHER_QUANTUM_MICROS = 60_000_000n;
export const CASTLE_WORKER_TRAVEL_MICROS_PER_STEP = 30_000_000n;
export const CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS = 30n * 24n * 60n * 60n * 1_000_000n;
export const CASTLE_WORKER_U64_MAX = (1n << 64n) - 1n;
export const CASTLE_WORKER_PROTOCOL_CAPABILITY = 'generic-castle-workers-v1';

export type WorkerResourceKind = 'gold' | 'food' | 'wood' | 'stone';
export type CastleWorkerPhase = 'outbound' | 'gathering' | 'returning';
export type CastleWorkerStatus = 'idle' | CastleWorkerPhase;

export type CastleWorkerSiteShape = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

export type CastleWorkerResourcePolicy = Readonly<{
  kind: WorkerResourceKind;
  siteTable: string;
  sitePolicyVersion: string;
  siteCatalogDigest: string;
  canonicalSiteCount: number;
  expeditionPolicyVersion: string;
  quantumMicros: bigint;
  ratePerQuantum: bigint;
  gatheringDurationMicros: bigint;
  gatheringTotal: bigint;
  canonicalSiteForId: (siteId: string) => CastleWorkerSiteShape | undefined;
  matchesCanonicalSite: (site: CastleWorkerSiteShape) => boolean;
}>;

const RESOURCE_POLICIES: Readonly<Record<WorkerResourceKind, CastleWorkerResourcePolicy>> = Object.freeze({
  gold: Object.freeze({
    kind: 'gold',
    siteTable: 'goldSiteV1',
    sitePolicyVersion: GOLD_SITE_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_GOLD_SITE_DIGEST,
    canonicalSiteCount: GENESIS_TIER_I_GOLD_SITE_COUNT,
    expeditionPolicyVersion: GOLD_EXPEDITION_POLICY_VERSION,
    quantumMicros: GOLD_GATHER_QUANTUM_MICROS,
    ratePerQuantum: GOLD_GATHER_RATE_PER_QUANTUM,
    gatheringDurationMicros: GOLD_GATHERING_DURATION_MICROS,
    gatheringTotal: (GOLD_GATHERING_DURATION_MICROS / GOLD_GATHER_QUANTUM_MICROS) * GOLD_GATHER_RATE_PER_QUANTUM,
    canonicalSiteForId: canonicalGoldSiteV1ForId,
    matchesCanonicalSite: matchesCanonicalTierIGoldSiteV1,
  }),
  food: Object.freeze({
    kind: 'food',
    siteTable: 'foodSiteV1',
    sitePolicyVersion: FOOD_SITE_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_FOOD_SITE_DIGEST,
    canonicalSiteCount: GENESIS_TIER_I_FOOD_SITE_COUNT,
    expeditionPolicyVersion: FOOD_EXPEDITION_POLICY_VERSION,
    quantumMicros: FOOD_GATHER_QUANTUM_MICROS,
    ratePerQuantum: FOOD_GATHER_RATE_PER_QUANTUM,
    gatheringDurationMicros: FOOD_GATHERING_DURATION_MICROS,
    gatheringTotal: (FOOD_GATHERING_DURATION_MICROS / FOOD_GATHER_QUANTUM_MICROS) * FOOD_GATHER_RATE_PER_QUANTUM,
    canonicalSiteForId: canonicalFoodSiteV1ForId,
    matchesCanonicalSite: matchesCanonicalTierIFoodSiteV1,
  }),
  wood: Object.freeze({
    kind: 'wood',
    siteTable: 'woodSiteV1',
    sitePolicyVersion: WOOD_SITE_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_WOOD_SITE_DIGEST,
    canonicalSiteCount: GENESIS_TIER_I_WOOD_SITE_COUNT,
    expeditionPolicyVersion: WOOD_EXPEDITION_POLICY_VERSION,
    quantumMicros: WOOD_GATHER_QUANTUM_MICROS,
    ratePerQuantum: WOOD_GATHER_RATE_PER_QUANTUM,
    gatheringDurationMicros: WOOD_GATHERING_DURATION_MICROS,
    gatheringTotal: (WOOD_GATHERING_DURATION_MICROS / WOOD_GATHER_QUANTUM_MICROS) * WOOD_GATHER_RATE_PER_QUANTUM,
    canonicalSiteForId: canonicalWoodSiteV1ForId,
    matchesCanonicalSite: matchesCanonicalTierIWoodSiteV1,
  }),
  stone: Object.freeze({
    kind: 'stone',
    siteTable: 'stoneSiteV1',
    sitePolicyVersion: STONE_SITE_POLICY_VERSION,
    siteCatalogDigest: GENESIS_TIER_I_STONE_SITE_DIGEST,
    canonicalSiteCount: GENESIS_TIER_I_STONE_SITE_COUNT,
    expeditionPolicyVersion: STONE_EXPEDITION_POLICY_VERSION,
    quantumMicros: STONE_GATHER_QUANTUM_MICROS,
    ratePerQuantum: STONE_GATHER_RATE_PER_QUANTUM,
    gatheringDurationMicros: STONE_GATHERING_DURATION_MICROS,
    gatheringTotal: (STONE_GATHERING_DURATION_MICROS / STONE_GATHER_QUANTUM_MICROS) * STONE_GATHER_RATE_PER_QUANTUM,
    canonicalSiteForId: canonicalStoneSiteV1ForId,
    matchesCanonicalSite: matchesCanonicalTierIStoneSiteV1,
  }),
});

export class CastleWorkerPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CastleWorkerPolicyError';
  }
}

function fail(code: string): never {
  throw new CastleWorkerPolicyError(code);
}

function assertU64(value: unknown, code: string): asserts value is bigint {
  if (typeof value !== 'bigint' || value < 0n || value > CASTLE_WORKER_U64_MAX) fail(code);
}

function checkedSum(left: bigint, right: bigint, code: string): bigint {
  assertU64(left, code);
  assertU64(right, code);
  if (right > CASTLE_WORKER_U64_MAX - left) fail(code);
  return left + right;
}

function checkedProduct(left: bigint, right: bigint, code: string): bigint {
  assertU64(left, code);
  assertU64(right, code);
  if (left !== 0n && right > CASTLE_WORKER_U64_MAX / left) fail(code);
  return left * right;
}

export function workerResourcePolicy(kind: string): CastleWorkerResourcePolicy {
  if (kind !== 'gold' && kind !== 'food' && kind !== 'wood' && kind !== 'stone') {
    fail('WORKER_RESOURCE_UNSUPPORTED');
  }
  return RESOURCE_POLICIES[kind];
}

export function workerResourceKinds(): readonly WorkerResourceKind[] {
  return Object.freeze(['gold', 'food', 'wood', 'stone']);
}

export function workerIdForCastle(castleId: bigint, ordinal: number): string {
  if (castleId < 0n || !Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > CASTLE_WORKERS_PER_CASTLE) {
    fail('WORKER_ROSTER_ORDINAL_INVALID');
  }
  return `genesis-001-castle-${castleId.toString()}-worker-${String(ordinal).padStart(2, '0')}`;
}

export function assertCastleWorkerId(workerId: string): void {
  if (!/^genesis-001-castle-[0-9]+-worker-0[1-4]$/.test(workerId)) {
    fail('WORKER_ID_INVALID');
  }
}

export function assertWorkerCommandKey(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{15,79}$/.test(value)) fail('WORKER_COMMAND_KEY_INVALID');
}

export type CastleWorkerTimeline = Readonly<{
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export function planCastleWorkerTimeline(startedAtMicros: bigint, routeSteps: number): CastleWorkerTimeline {
  assertU64(startedAtMicros, 'WORKER_START_TIME_INVALID');
  if (!Number.isSafeInteger(routeSteps) || routeSteps <= 0) fail('WORKER_ROUTE_INVALID');
  const travelMicros = checkedProduct(BigInt(routeSteps), CASTLE_WORKER_TRAVEL_MICROS_PER_STEP, 'WORKER_TIME_OVERFLOW');
  const arrivesAtMicros = checkedSum(startedAtMicros, travelMicros, 'WORKER_TIME_OVERFLOW');
  const gatheringEndsAtMicros = checkedSum(arrivesAtMicros, CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS, 'WORKER_TIME_OVERFLOW');
  const returnsAtMicros = checkedSum(gatheringEndsAtMicros, travelMicros, 'WORKER_TIME_OVERFLOW');
  return Object.freeze({ startedAtMicros, arrivesAtMicros, gatheringEndsAtMicros, returnsAtMicros });
}

export type CastleWorkerAccrualState = Readonly<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedAmount: bigint;
  materializedAmount: bigint;
  resourceKind: string;
  policyVersion: string;
}>;

export type CastleWorkerAccrualPlan = Readonly<{
  accruedAmount: bigint;
  newlyAccruedAmount: bigint;
  completedQuanta: bigint;
  settledThroughMicros: bigint;
}>;

export function workerAssignmentStateIsConsistent(state: CastleWorkerAccrualState): boolean {
  try {
    const policy = workerResourcePolicy(state.resourceKind);
    assertU64(state.startedAtMicros, 'WORKER_TIME_INVALID');
    assertU64(state.arrivesAtMicros, 'WORKER_TIME_INVALID');
    assertU64(state.gatheringEndsAtMicros, 'WORKER_TIME_INVALID');
    assertU64(state.returnsAtMicros, 'WORKER_TIME_INVALID');
    assertU64(state.settledThroughMicros, 'WORKER_CURSOR_INVALID');
    assertU64(state.accruedAmount, 'WORKER_ACCRUAL_INVALID');
    assertU64(state.materializedAmount, 'WORKER_MATERIALIZED_INVALID');
    if (
      state.policyVersion !== CASTLE_WORKER_POLICY_VERSION
      || (state.phase !== 'outbound' && state.phase !== 'gathering' && state.phase !== 'returning')
      || !(state.startedAtMicros < state.arrivesAtMicros
        && state.arrivesAtMicros < state.gatheringEndsAtMicros
        && state.gatheringEndsAtMicros < state.returnsAtMicros)
      || state.arrivesAtMicros > state.settledThroughMicros
      || state.settledThroughMicros > state.gatheringEndsAtMicros
      || state.materializedAmount > state.accruedAmount
      || state.accruedAmount > policy.gatheringTotal
    ) return false;
    // A recall can begin during outbound travel, so a returning assignment may
    // legitimately have zero or partial gathering accrual. Scheduled expiry
    // still settles the full cap before opening the return timeline.
    return true;
  } catch {
    return false;
  }
}

export function planCastleWorkerAccrual(
  state: CastleWorkerAccrualState,
  observedAtMicros: bigint,
): CastleWorkerAccrualPlan {
  if (!workerAssignmentStateIsConsistent(state)) fail('WORKER_ASSIGNMENT_STATE_INVALID');
  assertU64(observedAtMicros, 'WORKER_OBSERVED_TIME_INVALID');
  const policy = workerResourcePolicy(state.resourceKind);
  const ceiling = observedAtMicros < state.gatheringEndsAtMicros ? observedAtMicros : state.gatheringEndsAtMicros;
  if (ceiling <= state.settledThroughMicros) {
    return Object.freeze({ accruedAmount: state.accruedAmount, newlyAccruedAmount: 0n, completedQuanta: 0n, settledThroughMicros: state.settledThroughMicros });
  }
  const completedQuanta = (ceiling - state.settledThroughMicros) / policy.quantumMicros;
  const elapsed = checkedProduct(completedQuanta, policy.quantumMicros, 'WORKER_ACCRUAL_OVERFLOW');
  const settledThroughMicros = checkedSum(state.settledThroughMicros, elapsed, 'WORKER_ACCRUAL_OVERFLOW');
  const newlyAccruedAmount = checkedProduct(completedQuanta, policy.ratePerQuantum, 'WORKER_ACCRUAL_OVERFLOW');
  const accruedAmount = checkedSum(state.accruedAmount, newlyAccruedAmount, 'WORKER_ACCRUAL_OVERFLOW');
  if (accruedAmount > policy.gatheringTotal) fail('WORKER_ACCRUAL_CAP');
  return Object.freeze({ accruedAmount, newlyAccruedAmount, completedQuanta, settledThroughMicros });
}

/** Route authority is shared across all four canonical site catalogs. */
export function canonicalWorkerRouteSteps(
  origin: Readonly<{ q: number; r: number }>,
  destination: Readonly<{ q: number; r: number }>,
): number | undefined {
  return canonicalPassableRouteSteps(origin, destination);
}

/** Stable roster digest; order and worker identity are part of the boundary. */
export function rosterDigestForCastleIds(castleIds: readonly bigint[]): string {
  const ids = [...castleIds].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  let hash = 0xcbf29ce484222325n;
  for (const castleId of ids) {
    for (const workerId of Array.from({ length: CASTLE_WORKERS_PER_CASTLE }, (_, i) => workerIdForCastle(castleId, i + 1))) {
      for (const byte of new TextEncoder().encode(workerId)) {
        hash ^= BigInt(byte);
        hash = (hash * 0x100000001b3n) & CASTLE_WORKER_U64_MAX;
      }
    }
  }
  return hash.toString(16).padStart(16, '0');
}
