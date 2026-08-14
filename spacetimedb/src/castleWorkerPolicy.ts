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
/** Strictly below two gather quanta: the canary can accrue exactly one. */
export const PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS = 119_999_999n;
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

/** Resource kind is not a capacity bucket; only this exact node key is. */
export function workerNodeKey(resourceKind: string, siteId: string): string {
  workerResourcePolicy(resourceKind);
  const legacySite = /^[a-z0-9][a-z0-9:-]*$/.test(siteId);
  const greaterRealmLease = /^GRL-[A-Z2-7]{26}:(?:[1-9]|[12][0-9]|3[0-2])$/u.test(siteId);
  const reservedGreaterRealmPrefix = /^grl-/iu.test(siteId);
  if (
    typeof siteId !== 'string'
    || siteId.length === 0
    || siteId.length > 128
    || (reservedGreaterRealmPrefix ? !greaterRealmLease : !legacySite)
  ) fail('WORKER_SITE_ID_INVALID');
  return `${resourceKind}:${siteId}`;
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

export type WorkerIdempotencyReceiptPruneCandidateV1 = Readonly<{
  requestKey: string;
  fid: bigint;
  assignmentId?: string;
  createdAtMicros: bigint;
}>;

function workerCommandKeyFromRequestKey(
  requestKey: string,
  fid: bigint,
): string {
  const prefix = `${fid.toString()}:`;
  if (!requestKey.startsWith(prefix)) {
    fail('WORKER_IDEMPOTENCY_RECEIPT_INVALID');
  }
  const commandKey = requestKey.slice(prefix.length);
  assertWorkerCommandKey(commandKey);
  return commandKey;
}

/**
 * Production-canary command rows are durable safety authority. Capacity
 * maintenance may evict only the oldest ordinary command rows and must fail
 * closed if an incoming row cannot fit without deleting a pc1/pc2 row.
 */
export function planWorkerIdempotencyReceiptPruneV1(input: Readonly<{
  fid: bigint;
  maximumReceiptCount: number;
  activeAssignmentIds: readonly string[];
  receipts: readonly WorkerIdempotencyReceiptPruneCandidateV1[];
}>): readonly string[] {
  if (
    input.fid <= 0n
    || !Number.isSafeInteger(input.maximumReceiptCount)
    || input.maximumReceiptCount < 1
    || input.receipts.length > input.maximumReceiptCount
  ) fail('WORKER_IDEMPOTENCY_RECEIPT_INVALID');
  const activeAssignmentIds = new Set(input.activeAssignmentIds);
  if (
    activeAssignmentIds.size !== input.activeAssignmentIds.length
    || input.activeAssignmentIds.some(assignmentId => (
      typeof assignmentId !== 'string' || assignmentId.length < 1
    ))
  ) fail('WORKER_IDEMPOTENCY_RECEIPT_INVALID');
  const seen = new Set<string>();
  const candidates = input.receipts.map((receipt) => {
    if (
      receipt.fid !== input.fid
      || receipt.createdAtMicros < 0n
      || seen.has(receipt.requestKey)
    ) fail('WORKER_IDEMPOTENCY_RECEIPT_INVALID');
    seen.add(receipt.requestKey);
    const commandKey = workerCommandKeyFromRequestKey(receipt.requestKey, input.fid);
    return Object.freeze({
      ...receipt,
      commandKey,
    });
  });
  const completedRecoveryFencePresent = candidates.some(candidate => (
    candidate.commandKey.startsWith('pc2-f00-')
  ));
  const deleteCount = Math.max(
    0,
    candidates.length - input.maximumReceiptCount + 1,
  );
  if (deleteCount === 0) return Object.freeze([]);
  const deletable = candidates
    .filter(candidate => !(
      candidate.commandKey.startsWith('pc1-')
      || candidate.commandKey.startsWith('pc2-')
      || candidate.assignmentId !== undefined
        && (
          activeAssignmentIds.has(candidate.assignmentId)
          || completedRecoveryFencePresent
        )
    ))
    .sort((left, right) => (
      left.createdAtMicros < right.createdAtMicros ? -1
        : left.createdAtMicros > right.createdAtMicros ? 1
          : left.requestKey.localeCompare(right.requestKey)
    ));
  if (deletable.length < deleteCount) {
    fail('WORKER_IDEMPOTENCY_RESERVED_CAPACITY');
  }
  return Object.freeze(
    deletable.slice(0, deleteCount).map(receipt => receipt.requestKey),
  );
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

export function clampProductionPlayerCanaryTimeline(
  timeline: CastleWorkerTimeline,
): CastleWorkerTimeline {
  const travelMicros = timeline.arrivesAtMicros - timeline.startedAtMicros;
  if (
    travelMicros <= 0n
    || timeline.gatheringEndsAtMicros !== checkedSum(
      timeline.arrivesAtMicros,
      CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS,
      'WORKER_TIME_OVERFLOW',
    )
    || timeline.returnsAtMicros !== checkedSum(
      timeline.gatheringEndsAtMicros,
      travelMicros,
      'WORKER_TIME_OVERFLOW',
    )
  ) fail('WORKER_TIME_INVALID');
  const gatheringEndsAtMicros = checkedSum(
    timeline.arrivesAtMicros,
    PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
    'WORKER_TIME_OVERFLOW',
  );
  return Object.freeze({
    startedAtMicros: timeline.startedAtMicros,
    arrivesAtMicros: timeline.arrivesAtMicros,
    gatheringEndsAtMicros,
    returnsAtMicros: checkedSum(
      gatheringEndsAtMicros,
      travelMicros,
      'WORKER_TIME_OVERFLOW',
    ),
  });
}

/**
 * Plan the short canary journey and prove the complete return is inside the
 * half-open approval window. Equality is outside the approved interval.
 */
export function planProductionPlayerCanaryTimelineBeforeCutoff(
  startedAtMicros: bigint,
  routeSteps: number,
  notAfterMicros: bigint,
): CastleWorkerTimeline {
  assertU64(notAfterMicros, 'PRODUCTION_PLAYER_CANARY_TIMELINE_CUTOFF_INVALID');
  const timeline = clampProductionPlayerCanaryTimeline(
    planCastleWorkerTimeline(startedAtMicros, routeSteps),
  );
  if (timeline.returnsAtMicros >= notAfterMicros) {
    fail('PRODUCTION_PLAYER_CANARY_TIMELINE_CUTOFF_INVALID');
  }
  return timeline;
}

/**
 * Validate immutable pc2 replay timing without constraining the mutable
 * returnsAt of an assignment that has already begun returning.
 */
export function productionPlayerCanaryReplayTimelineIsValid(input: Readonly<{
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  routeSteps: number;
  approvedRouteSteps: number;
  notAfterMicros: bigint;
}>): boolean {
  try {
    if (
      input.routeSteps !== input.approvedRouteSteps
      || !Number.isSafeInteger(input.approvedRouteSteps)
      || input.approvedRouteSteps < 1
    ) return false;
    const travelMicros = checkedProduct(
      BigInt(input.approvedRouteSteps),
      CASTLE_WORKER_TRAVEL_MICROS_PER_STEP,
      'WORKER_TIME_OVERFLOW',
    );
    return input.arrivesAtMicros === checkedSum(
      input.startedAtMicros,
      travelMicros,
      'WORKER_TIME_OVERFLOW',
    )
      && input.gatheringEndsAtMicros === checkedSum(
        input.arrivesAtMicros,
        PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
        'WORKER_TIME_OVERFLOW',
      )
      && checkedSum(
        input.gatheringEndsAtMicros,
        travelMicros,
        'WORKER_TIME_OVERFLOW',
      ) < input.notAfterMicros;
  } catch {
    return false;
  }
}

export type DueCastleWorkerScheduleV1 = Readonly<{
  assignmentId: string;
  scheduleId: string | bigint;
}>;

/**
 * Run at most three due transitions for one assignment. The live schema uses
 * this same loop with a dynamic indexed lookup after each transition.
 */
export function runBoundedDueCastleWorkerScheduleDrainV1<
  Schedule extends DueCastleWorkerScheduleV1,
>(
  initial: Schedule,
  observedAtMicros: bigint,
  run: (schedule: Schedule) => void,
  schedulesForAssignment: (assignmentId: string) => readonly Schedule[],
  scheduledAtMicros: (schedule: Schedule) => bigint | undefined,
): void {
  let current = initial;
  for (let transition = 0; transition < 3; transition += 1) {
    run(current);
    if (transition === 2) return;
    const due = schedulesForAssignment(initial.assignmentId)
      .filter(schedule => {
        const scheduledAt = scheduledAtMicros(schedule);
        return schedule.assignmentId === initial.assignmentId
          && schedule.scheduleId !== current.scheduleId
          && scheduledAt !== undefined
          && scheduledAt <= observedAtMicros;
      })
      .sort((left, right) => {
        const leftAt = scheduledAtMicros(left)!;
        const rightAt = scheduledAtMicros(right)!;
        const leftId = left.scheduleId;
        const rightId = right.scheduleId;
        const idOrder = typeof leftId === 'bigint' && typeof rightId === 'bigint'
          ? leftId < rightId ? -1 : leftId > rightId ? 1 : 0
          : leftId.toString() < rightId.toString() ? -1
            : leftId.toString() > rightId.toString() ? 1 : 0;
        return leftAt < rightAt ? -1
          : leftAt > rightAt ? 1
            : idOrder;
      });
    if (due.length === 0) return;
    current = due[0]!;
  }
}

export type CastleWorkerAccrualState = Readonly<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnStartedAtMicros: bigint | undefined;
  returnsAtMicros: bigint;
  routeSteps: number;
  returnStartProgressBasisPoints: number;
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
    if (state.returnStartedAtMicros !== undefined) {
      assertU64(state.returnStartedAtMicros, 'WORKER_TIME_INVALID');
    }
    assertU64(state.settledThroughMicros, 'WORKER_CURSOR_INVALID');
    assertU64(state.accruedAmount, 'WORKER_ACCRUAL_INVALID');
    assertU64(state.materializedAmount, 'WORKER_MATERIALIZED_INVALID');
    if (
      !Number.isSafeInteger(state.routeSteps)
      || state.routeSteps <= 0
      || !Number.isSafeInteger(state.returnStartProgressBasisPoints)
      || state.returnStartProgressBasisPoints < 0
      || state.returnStartProgressBasisPoints > 10_000
    ) return false;
    const travelMicros = checkedProduct(
      BigInt(state.routeSteps),
      CASTLE_WORKER_TRAVEL_MICROS_PER_STEP,
      'WORKER_TIME_OVERFLOW',
    );
    const canonicalArrivesAtMicros = checkedSum(
      state.startedAtMicros,
      travelMicros,
      'WORKER_TIME_OVERFLOW',
    );
    const canonicalGatheringEndsAtMicros = checkedSum(
      canonicalArrivesAtMicros,
      CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS,
      'WORKER_TIME_OVERFLOW',
    );
    const canaryGatheringEndsAtMicros = checkedSum(
      canonicalArrivesAtMicros,
      PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
      'WORKER_TIME_OVERFLOW',
    );
    const canaryDuration = state.gatheringEndsAtMicros
      === canaryGatheringEndsAtMicros;
    const gatheringAccrualCap = canaryDuration
      ? policy.ratePerQuantum
      : policy.gatheringTotal;
    if (
      state.policyVersion !== CASTLE_WORKER_POLICY_VERSION
      || (state.phase !== 'outbound' && state.phase !== 'gathering' && state.phase !== 'returning')
      || !(state.startedAtMicros < state.arrivesAtMicros
        && state.arrivesAtMicros < state.gatheringEndsAtMicros)
      || state.arrivesAtMicros > state.settledThroughMicros
      || state.settledThroughMicros > state.gatheringEndsAtMicros
      || state.materializedAmount > state.accruedAmount
      || state.accruedAmount > gatheringAccrualCap
      || state.arrivesAtMicros !== canonicalArrivesAtMicros
      || (state.gatheringEndsAtMicros !== canonicalGatheringEndsAtMicros
        && !canaryDuration)
    ) return false;
    if (state.phase !== 'returning') {
      return state.returnStartedAtMicros === undefined
        && state.returnStartProgressBasisPoints === 0
        && state.returnsAtMicros === checkedSum(
          state.gatheringEndsAtMicros,
          travelMicros,
          'WORKER_TIME_OVERFLOW',
        );
    }
    if (
      state.returnStartedAtMicros === undefined
      || state.returnStartedAtMicros < state.startedAtMicros
      || state.returnStartedAtMicros > state.gatheringEndsAtMicros
      || state.returnsAtMicros < state.returnStartedAtMicros
    ) return false;
    const expectedProgress = state.returnStartedAtMicros >= state.arrivesAtMicros
      ? 10_000
      : Number(
        ((state.returnStartedAtMicros - state.startedAtMicros) * 10_000n)
        / travelMicros,
      );
    if (state.returnStartProgressBasisPoints !== expectedProgress) return false;
    const expectedReturnsAtMicros = checkedSum(
      state.returnStartedAtMicros,
      (travelMicros * BigInt(expectedProgress)) / 10_000n,
      'WORKER_TIME_OVERFLOW',
    );
    if (state.returnsAtMicros !== expectedReturnsAtMicros) return false;
    // An outbound recall starts before gathering can begin. Its settlement
    // cursor remains pinned to arrival and it can never have earned value.
    if (state.returnStartedAtMicros < state.arrivesAtMicros) {
      return state.settledThroughMicros === state.arrivesAtMicros
        && state.accruedAmount === 0n
        && state.materializedAmount === 0n;
    }
    // Gathering recalls may retain only complete quanta observed no later
    // than the immutable return-start boundary.
    return state.settledThroughMicros <= state.returnStartedAtMicros;
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
  const phaseCeiling = state.phase === 'returning'
    ? state.returnStartedAtMicros
    : observedAtMicros;
  if (phaseCeiling === undefined) fail('WORKER_ASSIGNMENT_STATE_INVALID');
  const ceiling = phaseCeiling < state.gatheringEndsAtMicros
    ? phaseCeiling
    : state.gatheringEndsAtMicros;
  if (ceiling <= state.settledThroughMicros) {
    return Object.freeze({ accruedAmount: state.accruedAmount, newlyAccruedAmount: 0n, completedQuanta: 0n, settledThroughMicros: state.settledThroughMicros });
  }
  const completedQuanta = (ceiling - state.settledThroughMicros) / policy.quantumMicros;
  const elapsed = checkedProduct(completedQuanta, policy.quantumMicros, 'WORKER_ACCRUAL_OVERFLOW');
  const settledThroughMicros = checkedSum(state.settledThroughMicros, elapsed, 'WORKER_ACCRUAL_OVERFLOW');
  const newlyAccruedAmount = checkedProduct(completedQuanta, policy.ratePerQuantum, 'WORKER_ACCRUAL_OVERFLOW');
  const accruedAmount = checkedSum(state.accruedAmount, newlyAccruedAmount, 'WORKER_ACCRUAL_OVERFLOW');
  const gatheringDurationMicros = state.gatheringEndsAtMicros
    - state.arrivesAtMicros;
  const gatheringAccrualCap = gatheringDurationMicros
    === PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS
    ? policy.ratePerQuantum
    : policy.gatheringTotal;
  if (accruedAmount > gatheringAccrualCap) fail('WORKER_ACCRUAL_CAP');
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
    hash = appendCastleWorkerRosterHash(hash, castleId);
  }
  return hash.toString(16).padStart(16, '0');
}

function appendCastleWorkerRosterHash(hash: bigint, castleId: bigint): bigint {
  let next = hash;
  for (const workerId of Array.from(
    { length: CASTLE_WORKERS_PER_CASTLE },
    (_, index) => workerIdForCastle(castleId, index + 1),
  )) {
    for (const byte of new TextEncoder().encode(workerId)) {
      next ^= BigInt(byte);
      next = (next * 0x100000001b3n) & CASTLE_WORKER_U64_MAX;
    }
  }
  return next;
}

/** Extend the attested digest when an auto-incremented castle is appended. */
export function appendCastleWorkerRosterDigest(digest: string, castleId: bigint): string {
  if (!/^[0-9a-f]{16}$/.test(digest)) fail('WORKER_ROSTER_DIGEST_INVALID');
  return appendCastleWorkerRosterHash(BigInt(`0x${digest}`), castleId)
    .toString(16)
    .padStart(16, '0');
}
