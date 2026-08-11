import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_WORKERS_PER_CASTLE,
} from './greaterRealmV17Policy';

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const U32_MAX = 0xffff_ffff;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SLOT_ID_PATTERN = /^GRS-[A-Z2-7]{26}$/u;
const CAPACITY_LOCATION_PATTERN = /^GRL-[A-Z2-7]{26}$/u;
const CAPACITY_LEASE_PATTERN = /^(GRL-[A-Z2-7]{26}):((?:[1-9]|[12][0-9]|3[0-2]))$/u;

/** Existing per-founder receipt retention remains 64; legacy 100-castle bounds stay untouched. */
export const GREATER_REALM_WORKER_RECEIPTS_PER_CASTLE = 64;
export const GREATER_REALM_MAX_WORKER_ROWS =
  GREATER_REALM_CASTLE_CAPACITY * GREATER_REALM_WORKERS_PER_CASTLE;
export const GREATER_REALM_MAX_WORKER_RECEIPT_ROWS =
  GREATER_REALM_CASTLE_CAPACITY * GREATER_REALM_WORKER_RECEIPTS_PER_CASTLE;
/** Lifetime audit counter bound; unlike retained receipt rows, this value never rolls over. */
export const GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT = U32_MAX;
export const GREATER_REALM_PUBLIC_CAPACITY_MAX = 32;

export const GREATER_REALM_TIER_ONE_REGION_IDS = Object.freeze([
  'T1_LOWLANDS',
  'T1_FROSTMERE',
  'T1_SUNSCAR',
  'T1_MIREFEN',
  'T1_STONEWAKE',
  'T1_EMBERWOOD',
] as const);

/**
 * Tables that can contain an in-flight journey. Historical idempotency receipts
 * are deliberately absent: a quiet window preserves receipts and requires only
 * live occupations, journeys, assignments, and their schedules to be empty.
 */
export const GREATER_REALM_JOURNEY_TABLES = Object.freeze([
  'gold_node_occupation_v1',
  'gold_expedition_v1',
  'gold_expedition_schedule_v_1',
  'food_node_occupation_v1',
  'food_expedition_v1',
  'food_expedition_schedule_v_1',
  'wood_node_occupation_v1',
  'wood_expedition_v1',
  'wood_expedition_schedule_v_1',
  'stone_node_occupation_v1',
  'stone_expedition_v1',
  'stone_expedition_schedule_v_1',
  'worker_assignment_v1',
  'worker_node_occupation_v1',
  'worker_assignment_schedule_v_1',
] as const);

export type GreaterRealmJourneyTable = typeof GREATER_REALM_JOURNEY_TABLES[number];

export const GREATER_REALM_ACTIVATION_PHASES = Object.freeze([
  'prepared',
  'draining',
  'frozen',
  'planned',
  'canary',
  'active',
  'halted',
  'rolled-back',
] as const);

export type GreaterRealmActivationPhase = typeof GREATER_REALM_ACTIVATION_PHASES[number];

/**
 * Forward progress is linear. Any nonterminal forward phase may halt. A release
 * may be abandoned before active; entering active commits it irreversibly, though
 * it may still halt. `rolled-back` is terminal. Counter policy below independently
 * closes rollback after any post-canary founding or dispatch.
 */
export const GREATER_REALM_ACTIVATION_TRANSITIONS: Readonly<
  Record<GreaterRealmActivationPhase, readonly GreaterRealmActivationPhase[]>
> = Object.freeze({
  prepared: Object.freeze(['draining', 'halted', 'rolled-back'] as const),
  draining: Object.freeze(['frozen', 'halted', 'rolled-back'] as const),
  frozen: Object.freeze(['planned', 'halted', 'rolled-back'] as const),
  planned: Object.freeze(['canary', 'halted', 'rolled-back'] as const),
  canary: Object.freeze(['active', 'halted', 'rolled-back'] as const),
  active: Object.freeze(['halted'] as const),
  halted: Object.freeze(['active', 'rolled-back'] as const),
  'rolled-back': Object.freeze([] as const),
});

export class GreaterRealmActivationPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmActivationPolicyError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmActivationPolicyError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value) && typeof value === 'object';
}

function snapshotExactDataRecord(
  value: unknown,
  expected: readonly string[],
  code: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) fail(code);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expected.length
    || keys.some(key => typeof key !== 'string' || !expected.includes(key))
  ) fail(code);
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) fail(code);
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function snapshotExactArray(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
): readonly unknown[] {
  if (!Array.isArray(value)) fail(code);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    lengthDescriptor === undefined
    || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < minimum
    || lengthDescriptor.value > maximum
  ) fail(code);
  const length = lengthDescriptor.value as number;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== length + 1
    || keys.some((key) => {
      if (key === 'length') return false;
      if (typeof key !== 'string') return true;
      const index = Number(key);
      return !Number.isSafeInteger(index)
        || index < 0
        || index >= length
        || String(index) !== key;
    })
  ) fail(code);
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) fail(code);
    snapshot.push(descriptor.value);
  }
  return Object.freeze(snapshot);
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function requireU64(value: bigint, code: string, allowZero = true): bigint {
  if (typeof value !== 'bigint' || value < (allowZero ? 0n : 1n) || value > U64_MAX) fail(code);
  return value;
}

function requireSha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(code);
  return value;
}

function requireActivationPhase(value: unknown): GreaterRealmActivationPhase {
  if (!GREATER_REALM_ACTIVATION_PHASES.includes(value as GreaterRealmActivationPhase)) {
    fail('GREATER_REALM_ACTIVATION_PHASE_INVALID');
  }
  return value as GreaterRealmActivationPhase;
}

export type GreaterRealmActivationCheckpointV1 = Readonly<{
  phase: GreaterRealmActivationPhase;
  /** Derived from activatedAt by the future reducer; true is irreversible. */
  everActive: boolean;
  postCanaryFoundingCount: number;
  postCanaryDispatchCount: number;
}>;

export function validateGreaterRealmActivationCheckpointV1(
  checkpoint: GreaterRealmActivationCheckpointV1,
): void {
  snapshotActivationCheckpoint(checkpoint);
}

function snapshotActivationCheckpoint(
  checkpoint: unknown,
): GreaterRealmActivationCheckpointV1 {
  const candidate = snapshotExactDataRecord(
    checkpoint,
    ['phase', 'everActive', 'postCanaryFoundingCount', 'postCanaryDispatchCount'],
    'GREATER_REALM_ACTIVATION_CHECKPOINT_INVALID',
  );
  const phase = requireActivationPhase(candidate.phase);
  if (typeof candidate.everActive !== 'boolean') {
    fail('GREATER_REALM_EVER_ACTIVE_INVALID');
  }
  if (typeof candidate.postCanaryFoundingCount !== 'number') {
    fail('GREATER_REALM_POST_CANARY_FOUNDING_COUNT_INVALID');
  }
  const postCanaryFoundingCount = requireInteger(
    candidate.postCanaryFoundingCount,
    0,
    GREATER_REALM_CASTLE_CAPACITY,
    'GREATER_REALM_POST_CANARY_FOUNDING_COUNT_INVALID',
  );
  if (typeof candidate.postCanaryDispatchCount !== 'number') {
    fail('GREATER_REALM_POST_CANARY_DISPATCH_COUNT_INVALID');
  }
  const postCanaryDispatchCount = requireInteger(
    candidate.postCanaryDispatchCount,
    0,
    GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT,
    'GREATER_REALM_POST_CANARY_DISPATCH_COUNT_INVALID',
  );
  if (
    (phase === 'prepared'
      || phase === 'draining'
      || phase === 'frozen'
      || phase === 'planned'
      || phase === 'canary'
      || phase === 'rolled-back')
    && (postCanaryFoundingCount !== 0 || postCanaryDispatchCount !== 0)
  ) fail('GREATER_REALM_PRE_CANARY_COUNTER_INVALID');
  if (
    phase !== 'active'
    && phase !== 'halted'
    && candidate.everActive
  ) fail('GREATER_REALM_EVER_ACTIVE_PHASE_INVALID');
  if (phase === 'active' && !candidate.everActive) {
    fail('GREATER_REALM_ACTIVE_COMMIT_MISSING');
  }
  return Object.freeze({
    phase,
    everActive: candidate.everActive,
    postCanaryFoundingCount,
    postCanaryDispatchCount,
  });
}

export type GreaterRealmActivationTransitionPlanV1 = Readonly<{
  result: 'unchanged' | 'counter-advance' | 'phase-transition';
  checkpoint: GreaterRealmActivationCheckpointV1;
}>;

/**
 * Plans one exact state change. Phase changes never smuggle counter changes;
 * same-phase counter progress is monotone and is permitted only in canary or
 * active. An exact retry is an immutable `unchanged` plan.
 */
export function planGreaterRealmActivationTransitionV1(
  current: GreaterRealmActivationCheckpointV1,
  next: GreaterRealmActivationCheckpointV1,
): GreaterRealmActivationTransitionPlanV1 {
  const currentSnapshot = snapshotActivationCheckpoint(current);
  const nextSnapshot = snapshotActivationCheckpoint(next);
  if (
    nextSnapshot.phase === 'rolled-back'
    && (
      currentSnapshot.everActive
      || currentSnapshot.postCanaryFoundingCount !== 0
      || currentSnapshot.postCanaryDispatchCount !== 0
    )
  ) fail('GREATER_REALM_ROLLBACK_WINDOW_CLOSED');
  if (currentSnapshot.everActive && !nextSnapshot.everActive) {
    fail('GREATER_REALM_EVER_ACTIVE_ROLLBACK');
  }
  if (
    nextSnapshot.postCanaryFoundingCount < currentSnapshot.postCanaryFoundingCount
    || nextSnapshot.postCanaryDispatchCount < currentSnapshot.postCanaryDispatchCount
  ) fail('GREATER_REALM_POST_CANARY_COUNTER_ROLLBACK');

  const countersChanged = nextSnapshot.postCanaryFoundingCount
      !== currentSnapshot.postCanaryFoundingCount
    || nextSnapshot.postCanaryDispatchCount !== currentSnapshot.postCanaryDispatchCount;
  const activeCommitChanged = currentSnapshot.everActive !== nextSnapshot.everActive;
  if (currentSnapshot.phase === nextSnapshot.phase) {
    if (activeCommitChanged) fail('GREATER_REALM_EVER_ACTIVE_TRANSITION_INVALID');
    if (!countersChanged) {
      return Object.freeze({ result: 'unchanged', checkpoint: nextSnapshot });
    }
    if (currentSnapshot.phase !== 'active') {
      fail('GREATER_REALM_POST_CANARY_COUNTER_PHASE_INVALID');
    }
    const foundingDelta = nextSnapshot.postCanaryFoundingCount
      - currentSnapshot.postCanaryFoundingCount;
    const dispatchDelta = nextSnapshot.postCanaryDispatchCount
      - currentSnapshot.postCanaryDispatchCount;
    if (
      !((foundingDelta === 1 && dispatchDelta === 0)
        || (foundingDelta === 0 && dispatchDelta === 1))
    ) fail('GREATER_REALM_POST_CANARY_COUNTER_ADVANCE_INVALID');
    return Object.freeze({ result: 'counter-advance', checkpoint: nextSnapshot });
  }
  if (countersChanged) fail('GREATER_REALM_ACTIVATION_TRANSITION_COUNTER_CHANGED');
  if (!GREATER_REALM_ACTIVATION_TRANSITIONS[currentSnapshot.phase].includes(nextSnapshot.phase)) {
    fail('GREATER_REALM_ACTIVATION_TRANSITION_INVALID');
  }
  const commitsActivation = currentSnapshot.phase === 'canary'
    && nextSnapshot.phase === 'active'
    && !currentSnapshot.everActive
    && nextSnapshot.everActive;
  if (activeCommitChanged && !commitsActivation) {
    fail('GREATER_REALM_EVER_ACTIVE_TRANSITION_INVALID');
  }
  return Object.freeze({ result: 'phase-transition', checkpoint: nextSnapshot });
}

export function advanceGreaterRealmPostCanaryCounterV1(
  current: GreaterRealmActivationCheckpointV1,
  kind: 'founding' | 'dispatch',
): GreaterRealmActivationCheckpointV1 {
  const currentSnapshot = snapshotActivationCheckpoint(current);
  if (kind !== 'founding' && kind !== 'dispatch') {
    fail('GREATER_REALM_POST_CANARY_COUNTER_KIND_INVALID');
  }
  if (currentSnapshot.phase !== 'active') {
    fail('GREATER_REALM_POST_CANARY_COUNTER_PHASE_INVALID');
  }
  let next: GreaterRealmActivationCheckpointV1;
  if (kind === 'founding') {
    next = Object.freeze({
      ...currentSnapshot,
      postCanaryFoundingCount: requireInteger(
        currentSnapshot.postCanaryFoundingCount + 1,
        1,
        GREATER_REALM_CASTLE_CAPACITY,
        'GREATER_REALM_POST_CANARY_FOUNDING_COUNT_INVALID',
      ),
    });
  } else if (kind === 'dispatch') {
    next = Object.freeze({
      ...currentSnapshot,
      postCanaryDispatchCount: requireInteger(
        currentSnapshot.postCanaryDispatchCount + 1,
        1,
        GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT,
        'GREATER_REALM_POST_CANARY_DISPATCH_COUNT_INVALID',
      ),
    });
  } else {
    fail('GREATER_REALM_POST_CANARY_COUNTER_KIND_INVALID');
  }
  return planGreaterRealmActivationTransitionV1(currentSnapshot, next).checkpoint;
}

export function requireGreaterRealmJourneyTablesEmptyV1(value: unknown): void {
  const snapshot = snapshotExactDataRecord(
    value,
    GREATER_REALM_JOURNEY_TABLES,
    'GREATER_REALM_JOURNEY_GATE_INVALID',
  );
  for (const table of GREATER_REALM_JOURNEY_TABLES) {
    if (snapshot[table] !== 0n) fail('GREATER_REALM_JOURNEY_GATE_NOT_EMPTY');
  }
}

/**
 * Pure projection of one frozen slot. A later authority must derive
 * `topologyDigest` from the activation row's exact relocation/topology digest
 * bound to the authoritative atlas; it is never a player-supplied value.
 */
export type GreaterRealmAllocationSlotV1 = Readonly<{
  slotId: string;
  regionId: string;
  tier: number;
  regionOrderRank: number;
  allocationRank: number;
  /** Authority-supplied digest of the frozen activation/atlas topology binding. */
  topologyDigest: string;
}>;

type ValidatedSlotTopology = Readonly<{
  topologyDigest: string;
  ordered: readonly GreaterRealmAllocationSlotV1[];
  byId: ReadonlyMap<string, GreaterRealmAllocationSlotV1>;
}>;

function validateSlotTopology(rows: readonly GreaterRealmAllocationSlotV1[]): ValidatedSlotTopology {
  const rowValues = snapshotExactArray(
    rows,
    GREATER_REALM_CASTLE_CAPACITY,
    GREATER_REALM_CASTLE_CAPACITY,
    'GREATER_REALM_SLOT_TOPOLOGY_COUNT_INVALID',
  );
  const byId = new Map<string, GreaterRealmAllocationSlotV1>();
  const allocationRanks = new Set<number>();
  const byRegion = new Map<string, GreaterRealmAllocationSlotV1[]>(
    GREATER_REALM_TIER_ONE_REGION_IDS.map(regionId => [regionId, []]),
  );
  let topologyDigest: string | undefined;
  for (const row of rowValues) {
    const candidate = snapshotExactDataRecord(
      row,
      [
        'slotId', 'regionId', 'tier', 'regionOrderRank', 'allocationRank',
        'topologyDigest',
      ],
      'GREATER_REALM_SLOT_TOPOLOGY_ROW_INVALID',
    );
    if (
      typeof candidate.slotId !== 'string'
      || !SLOT_ID_PATTERN.test(candidate.slotId)
      || typeof candidate.regionId !== 'string'
      || !GREATER_REALM_TIER_ONE_REGION_IDS.includes(
        candidate.regionId as typeof GREATER_REALM_TIER_ONE_REGION_IDS[number],
      )
      || candidate.tier !== 1
      || typeof candidate.regionOrderRank !== 'number'
      || typeof candidate.allocationRank !== 'number'
    ) fail('GREATER_REALM_SLOT_TOPOLOGY_ROW_INVALID');
    const rowTopologyDigest = requireSha256(
      candidate.topologyDigest,
      'GREATER_REALM_TOPOLOGY_DIGEST_INVALID',
    );
    if (topologyDigest !== undefined && rowTopologyDigest !== topologyDigest) {
      fail('GREATER_REALM_TOPOLOGY_DIGEST_MISMATCH');
    }
    topologyDigest = rowTopologyDigest;
    const validatedRow: GreaterRealmAllocationSlotV1 = Object.freeze({
      slotId: candidate.slotId,
      regionId: candidate.regionId,
      tier: candidate.tier,
      regionOrderRank: candidate.regionOrderRank,
      allocationRank: candidate.allocationRank,
      topologyDigest: rowTopologyDigest,
    });
    requireInteger(
      validatedRow.regionOrderRank,
      0,
      GREATER_REALM_CASTLES_PER_REGION - 1,
      'GREATER_REALM_SLOT_REGION_RANK_INVALID',
    );
    requireInteger(
      validatedRow.allocationRank,
      0,
      GREATER_REALM_CASTLE_CAPACITY - 1,
      'GREATER_REALM_SLOT_ALLOCATION_RANK_INVALID',
    );
    if (byId.has(validatedRow.slotId)) fail('GREATER_REALM_SLOT_ID_DUPLICATE');
    if (allocationRanks.has(validatedRow.allocationRank)) {
      fail('GREATER_REALM_SLOT_ALLOCATION_RANK_DUPLICATE');
    }
    byId.set(validatedRow.slotId, validatedRow);
    allocationRanks.add(validatedRow.allocationRank);
    byRegion.get(validatedRow.regionId)!.push(validatedRow);
  }
  for (let rank = 0; rank < GREATER_REALM_CASTLE_CAPACITY; rank += 1) {
    if (!allocationRanks.has(rank)) fail('GREATER_REALM_SLOT_ALLOCATION_RANK_SET_INVALID');
  }
  for (const regionId of GREATER_REALM_TIER_ONE_REGION_IDS) {
    const regionRows = byRegion.get(regionId)!;
    if (regionRows.length !== GREATER_REALM_CASTLES_PER_REGION) {
      fail('GREATER_REALM_SLOT_REGION_CAPACITY_INVALID');
    }
    regionRows.sort((left, right) => left.allocationRank - right.allocationRank);
    for (let rank = 0; rank < regionRows.length; rank += 1) {
      if (regionRows[rank]!.regionOrderRank !== rank) {
        fail('GREATER_REALM_SLOT_REGION_RANK_SET_INVALID');
      }
    }
  }
  if (topologyDigest === undefined) fail('GREATER_REALM_TOPOLOGY_DIGEST_INVALID');
  return Object.freeze({
    topologyDigest,
    ordered: Object.freeze([...byId.values()].sort(
      (left, right) => left.allocationRank - right.allocationRank,
    )),
    byId,
  });
}

export function validateGreaterRealmAllocationSlotsV1(
  rows: readonly GreaterRealmAllocationSlotV1[],
): void {
  validateSlotTopology(rows);
}

export type GreaterRealmCastleAllocationClaimV1 = Readonly<{
  castleId: bigint;
  slotId: string;
  allocationSequence: bigint;
  topologyDigest: string;
}>;

export type GreaterRealmCastleAllocationV1 = Readonly<{
  castleId: bigint;
  slotId: string;
  regionId: string;
  regionOrderRank: number;
  allocationRank: number;
  allocationSequence: bigint;
  topologyDigest: string;
}>;

export type GreaterRealmAllocationSelectionV1 = Readonly<{
  result: 'allocated' | 'unchanged';
  allocation: GreaterRealmCastleAllocationV1;
}>;

function chooseNextSlot(
  topology: ValidatedSlotTopology,
  claimedSlotIds: ReadonlySet<string>,
  regionCounts: ReadonlyMap<string, number>,
): GreaterRealmAllocationSlotV1 {
  let minimum = GREATER_REALM_CASTLES_PER_REGION + 1;
  for (const regionId of GREATER_REALM_TIER_ONE_REGION_IDS) {
    minimum = Math.min(minimum, regionCounts.get(regionId) ?? 0);
  }
  const selected = topology.ordered.find(slot => (
    !claimedSlotIds.has(slot.slotId) && (regionCounts.get(slot.regionId) ?? 0) === minimum
  ));
  if (selected === undefined) fail('GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED');
  return selected;
}

type ValidatedClaims = Readonly<{
  ordered: readonly GreaterRealmCastleAllocationClaimV1[];
  byCastle: ReadonlyMap<bigint, GreaterRealmCastleAllocationClaimV1>;
  claimedSlotIds: ReadonlySet<string>;
  regionCounts: ReadonlyMap<string, number>;
}>;

function validateClaims(
  topology: ValidatedSlotTopology,
  claims: readonly GreaterRealmCastleAllocationClaimV1[],
): ValidatedClaims {
  const claimValues = snapshotExactArray(
    claims,
    0,
    GREATER_REALM_CASTLE_CAPACITY,
    'GREATER_REALM_ALLOCATION_CLAIM_COUNT_INVALID',
  );
  const validatedClaims = claimValues.map((claim) => {
    const candidate = snapshotExactDataRecord(
      claim,
      ['castleId', 'slotId', 'allocationSequence', 'topologyDigest'],
      'GREATER_REALM_ALLOCATION_CLAIM_ROW_INVALID',
    );
    const castleId = requireU64(
      candidate.castleId as bigint,
      'GREATER_REALM_CASTLE_ID_INVALID',
      false,
    );
    const allocationSequence = requireU64(
      candidate.allocationSequence as bigint,
      'GREATER_REALM_ALLOCATION_SEQUENCE_INVALID',
    );
    if (typeof candidate.slotId !== 'string' || !SLOT_ID_PATTERN.test(candidate.slotId)) {
      fail('GREATER_REALM_ALLOCATION_SLOT_INVALID');
    }
    const topologyDigest = requireSha256(
      candidate.topologyDigest,
      'GREATER_REALM_TOPOLOGY_DIGEST_INVALID',
    );
    if (topologyDigest !== topology.topologyDigest) {
      fail('GREATER_REALM_ALLOCATION_TOPOLOGY_DIGEST_MISMATCH');
    }
    return Object.freeze({ castleId, slotId: candidate.slotId, allocationSequence, topologyDigest });
  });
  const ordered = Object.freeze([...validatedClaims].sort((left, right) => (
    left.allocationSequence < right.allocationSequence ? -1
      : left.allocationSequence > right.allocationSequence ? 1
        : 0
  )));
  const byCastle = new Map<bigint, GreaterRealmCastleAllocationClaimV1>();
  const claimedSlotIds = new Set<string>();
  const regionCounts = new Map<string, number>(
    GREATER_REALM_TIER_ONE_REGION_IDS.map(regionId => [regionId, 0]),
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const claim = ordered[index]!;
    if (claim.allocationSequence !== BigInt(index)) {
      fail('GREATER_REALM_ALLOCATION_SEQUENCE_INVALID');
    }
    if (byCastle.has(claim.castleId)) fail('GREATER_REALM_ALLOCATION_CASTLE_DUPLICATE');
    if (claimedSlotIds.has(claim.slotId)) fail('GREATER_REALM_ALLOCATION_SLOT_DUPLICATE');
    const slot = topology.byId.get(claim.slotId);
    if (slot === undefined) fail('GREATER_REALM_ALLOCATION_SLOT_INVALID');
    const expected = chooseNextSlot(topology, claimedSlotIds, regionCounts);
    if (expected.slotId !== slot.slotId) fail('GREATER_REALM_ALLOCATION_ORDER_INVALID');
    byCastle.set(claim.castleId, claim);
    claimedSlotIds.add(claim.slotId);
    regionCounts.set(slot.regionId, regionCounts.get(slot.regionId)! + 1);
  }
  return Object.freeze({ ordered, byCastle, claimedSlotIds, regionCounts });
}

function allocationFor(
  topology: ValidatedSlotTopology,
  claim: GreaterRealmCastleAllocationClaimV1,
): GreaterRealmCastleAllocationV1 {
  const slot = topology.byId.get(claim.slotId);
  if (slot === undefined) fail('GREATER_REALM_ALLOCATION_SLOT_INVALID');
  return Object.freeze({
    castleId: claim.castleId,
    slotId: slot.slotId,
    regionId: slot.regionId,
    regionOrderRank: slot.regionOrderRank,
    allocationRank: slot.allocationRank,
    allocationSequence: claim.allocationSequence,
    topologyDigest: topology.topologyDigest,
  });
}

/**
 * Selects across least-populated Tier-I regions by the lowest available global
 * persisted allocation rank. The frozen private shuffle therefore breaks region
 * ties without introducing a predictable public-region preference.
 */
export function selectGreaterRealmCastleAllocationV1(
  slots: readonly GreaterRealmAllocationSlotV1[],
  claims: readonly GreaterRealmCastleAllocationClaimV1[],
  castleId: bigint,
): GreaterRealmAllocationSelectionV1 {
  requireU64(castleId, 'GREATER_REALM_CASTLE_ID_INVALID', false);
  const topology = validateSlotTopology(slots);
  const state = validateClaims(topology, claims);
  const prior = state.byCastle.get(castleId);
  if (prior !== undefined) {
    return Object.freeze({ result: 'unchanged', allocation: allocationFor(topology, prior) });
  }
  if (state.ordered.length >= GREATER_REALM_CASTLE_CAPACITY) {
    fail('GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED');
  }
  const slot = chooseNextSlot(topology, state.claimedSlotIds, state.regionCounts);
  const claim = Object.freeze({
    castleId,
    slotId: slot.slotId,
    allocationSequence: BigInt(state.ordered.length),
    topologyDigest: topology.topologyDigest,
  });
  return Object.freeze({ result: 'allocated', allocation: allocationFor(topology, claim) });
}

/** Canonicalizes existing castles by numeric ID before constructing the balanced plan. */
export function planGreaterRealmExistingPopulationV1(
  slots: readonly GreaterRealmAllocationSlotV1[],
  castleIds: readonly bigint[],
): readonly GreaterRealmCastleAllocationV1[] {
  const castleIdValues = snapshotExactArray(
    castleIds,
    0,
    GREATER_REALM_CASTLE_CAPACITY,
    'GREATER_REALM_EXISTING_POPULATION_COUNT_INVALID',
  );
  const topology = validateSlotTopology(slots);
  const orderedCastleIds = castleIdValues.map(value => (
    requireU64(value as bigint, 'GREATER_REALM_CASTLE_ID_INVALID', false)
  )).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const unique = new Set<bigint>();
  const claims: GreaterRealmCastleAllocationClaimV1[] = [];
  const claimedSlotIds = new Set<string>();
  const regionCounts = new Map<string, number>(
    GREATER_REALM_TIER_ONE_REGION_IDS.map(regionId => [regionId, 0]),
  );
  for (let index = 0; index < orderedCastleIds.length; index += 1) {
    const castleId = orderedCastleIds[index]!;
    if (unique.has(castleId)) fail('GREATER_REALM_ALLOCATION_CASTLE_DUPLICATE');
    unique.add(castleId);
    const slot = chooseNextSlot(topology, claimedSlotIds, regionCounts);
    claims.push(Object.freeze({
      castleId,
      slotId: slot.slotId,
      allocationSequence: BigInt(index),
      topologyDigest: topology.topologyDigest,
    }));
    claimedSlotIds.add(slot.slotId);
    regionCounts.set(slot.regionId, regionCounts.get(slot.regionId)! + 1);
  }
  const counts = [...regionCounts.values()];
  if (Math.max(...counts) - Math.min(...counts) > 1) {
    fail('GREATER_REALM_ALLOCATION_BALANCE_INVALID');
  }
  return Object.freeze(claims.map(claim => allocationFor(topology, claim)));
}

export function greaterRealmAllocationRegionCountsV1(
  allocations: readonly Pick<GreaterRealmCastleAllocationV1, 'regionId'>[],
): Readonly<Record<string, number>> {
  const counts = Object.fromEntries(
    GREATER_REALM_TIER_ONE_REGION_IDS.map(regionId => [regionId, 0]),
  ) as Record<string, number>;
  for (const allocation of allocations) {
    if (!GREATER_REALM_TIER_ONE_REGION_IDS.includes(
      allocation.regionId as typeof GREATER_REALM_TIER_ONE_REGION_IDS[number],
    )) fail('GREATER_REALM_REGION_INVALID');
    counts[allocation.regionId] += 1;
  }
  return Object.freeze(counts);
}

export type GreaterRealmPublicCapacityLeaseV1 = Readonly<{
  locationId: string;
  capacityOrdinal: number;
  nodeCount: number;
}>;

export type GreaterRealmPublicCapacityLeaseSelectionV1 = Readonly<
  GreaterRealmPublicCapacityLeaseV1 & {
    result: 'allocated' | 'unchanged';
    leaseId: string;
    capacityDigest: string;
  }
>;

/**
 * Exact private projection of a terminal dispatch-v2 receipt. The later authority
 * must persist this binding in versioned receipt metadata (for example,
 * `commandKind`) and must never accept it from the caller.
 */
export type GreaterRealmPublicCapacityReceiptV1 = Readonly<{
  leaseId: string;
  nodeCount: number;
  capacityDigest: string;
}>;

function requireCapacityLocationId(value: unknown): string {
  if (typeof value !== 'string' || !CAPACITY_LOCATION_PATTERN.test(value)) {
    fail('GREATER_REALM_PUBLIC_CAPACITY_LOCATION_INVALID');
  }
  return value;
}

/** Formats the public location-and-ordinal lease without accepting node identity. */
export function formatGreaterRealmPublicCapacityLeaseIdV1(
  locationId: string,
  capacityOrdinal: number,
  nodeCount: number,
): string {
  requireCapacityLocationId(locationId);
  requireInteger(
    nodeCount,
    1,
    GREATER_REALM_PUBLIC_CAPACITY_MAX,
    'GREATER_REALM_PUBLIC_CAPACITY_NODE_COUNT_INVALID',
  );
  requireInteger(
    capacityOrdinal,
    1,
    nodeCount,
    'GREATER_REALM_PUBLIC_CAPACITY_ORDINAL_INVALID',
  );
  return `${locationId}:${capacityOrdinal}`;
}

/**
 * Parses only the declassified location capacity lease. Private resource-node
 * identity is neither accepted nor returned by this boundary.
 */
export function parseGreaterRealmPublicCapacityLeaseV1(value: unknown): GreaterRealmPublicCapacityLeaseV1 {
  const candidate = snapshotExactDataRecord(
    value,
    ['leaseId', 'nodeCount'],
    'GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID',
  );
  if (typeof candidate.leaseId !== 'string' || typeof candidate.nodeCount !== 'number') {
    fail('GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID');
  }
  const match = CAPACITY_LEASE_PATTERN.exec(candidate.leaseId);
  if (match === null) fail('GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID');
  const nodeCount = requireInteger(
    candidate.nodeCount,
    1,
    GREATER_REALM_PUBLIC_CAPACITY_MAX,
    'GREATER_REALM_PUBLIC_CAPACITY_NODE_COUNT_INVALID',
  );
  const capacityOrdinal = Number(match[2]);
  if (capacityOrdinal > nodeCount) fail('GREATER_REALM_PUBLIC_CAPACITY_ORDINAL_INVALID');
  return Object.freeze({ locationId: match[1]!, capacityOrdinal, nodeCount });
}

/**
 * Selects the first free ordinal for an exact public location capacity. A prior
 * terminal dispatch-v2 receipt is returned before live occupancy selection, even
 * after its journey completed and freed (or another journey reused) that ordinal.
 */
export function selectGreaterRealmPublicCapacityLeaseV1(
  value: unknown,
): GreaterRealmPublicCapacityLeaseSelectionV1 {
  const candidate = snapshotExactDataRecord(
    value,
    [
      'locationId', 'nodeCount', 'capacityDigest', 'occupiedCapacityOrdinals',
      'priorReceipt',
    ],
    'GREATER_REALM_PUBLIC_CAPACITY_SELECTION_INVALID',
  );
  const locationId = requireCapacityLocationId(candidate.locationId);
  if (typeof candidate.nodeCount !== 'number') {
    fail('GREATER_REALM_PUBLIC_CAPACITY_NODE_COUNT_INVALID');
  }
  const nodeCount = requireInteger(
    candidate.nodeCount,
    1,
    GREATER_REALM_PUBLIC_CAPACITY_MAX,
    'GREATER_REALM_PUBLIC_CAPACITY_NODE_COUNT_INVALID',
  );
  const capacityDigest = requireSha256(
    candidate.capacityDigest,
    'GREATER_REALM_PUBLIC_CAPACITY_DIGEST_INVALID',
  );
  if (candidate.priorReceipt !== null) {
    let receipt: GreaterRealmPublicCapacityReceiptV1;
    let prior: GreaterRealmPublicCapacityLeaseV1;
    try {
      const receiptCandidate = snapshotExactDataRecord(
        candidate.priorReceipt,
        ['leaseId', 'nodeCount', 'capacityDigest'],
        'GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID',
      );
      if (typeof receiptCandidate.leaseId !== 'string') {
        fail('GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID');
      }
      if (typeof receiptCandidate.nodeCount !== 'number') {
        fail('GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID');
      }
      receipt = Object.freeze({
        leaseId: receiptCandidate.leaseId,
        nodeCount: requireInteger(
          receiptCandidate.nodeCount,
          1,
          GREATER_REALM_PUBLIC_CAPACITY_MAX,
          'GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID',
        ),
        capacityDigest: requireSha256(
          receiptCandidate.capacityDigest,
          'GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID',
        ),
      });
      prior = parseGreaterRealmPublicCapacityLeaseV1({
        leaseId: receipt.leaseId,
        nodeCount: receipt.nodeCount,
      });
    } catch {
      fail('GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID');
    }
    if (
      prior.locationId !== locationId
      || receipt.nodeCount !== nodeCount
      || receipt.capacityDigest !== capacityDigest
    ) {
      fail('GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID');
    }
    return Object.freeze({
      result: 'unchanged',
      leaseId: receipt.leaseId,
      locationId,
      capacityOrdinal: prior.capacityOrdinal,
      nodeCount,
      capacityDigest,
    });
  }
  const occupiedCapacityOrdinals = snapshotExactArray(
    candidate.occupiedCapacityOrdinals,
    0,
    nodeCount,
    'GREATER_REALM_PUBLIC_CAPACITY_OCCUPANCY_INVALID',
  );
  const occupied = new Set<number>();
  for (const ordinal of occupiedCapacityOrdinals) {
    if (typeof ordinal !== 'number') fail('GREATER_REALM_PUBLIC_CAPACITY_OCCUPANCY_INVALID');
    requireInteger(
      ordinal,
      1,
      nodeCount,
      'GREATER_REALM_PUBLIC_CAPACITY_OCCUPANCY_INVALID',
    );
    if (occupied.has(ordinal)) fail('GREATER_REALM_PUBLIC_CAPACITY_OCCUPANCY_DUPLICATE');
    occupied.add(ordinal);
  }
  for (let capacityOrdinal = 1; capacityOrdinal <= nodeCount; capacityOrdinal += 1) {
    if (!occupied.has(capacityOrdinal)) {
      return Object.freeze({
        result: 'allocated',
        leaseId: formatGreaterRealmPublicCapacityLeaseIdV1(
          locationId,
          capacityOrdinal,
          nodeCount,
        ),
        locationId,
        capacityOrdinal,
        nodeCount,
        capacityDigest,
      });
    }
  }
  fail('GREATER_REALM_PUBLIC_CAPACITY_EXHAUSTED');
}

export function greaterRealmActivationPolicyErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmActivationPolicyError ? error.code : undefined;
}
