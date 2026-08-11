import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_WORKERS_PER_CASTLE,
} from './greaterRealmV17Policy';

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const U32_MAX = 0xffff_ffff;
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
  halted: Object.freeze(['rolled-back'] as const),
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

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expected.length
    || keys.some(key => typeof key !== 'string' || !expected.includes(key))
  ) fail(code);
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function requireU64(value: bigint, code: string, allowZero = true): bigint {
  if (typeof value !== 'bigint' || value < (allowZero ? 0n : 1n) || value > U64_MAX) fail(code);
  return value;
}

function requireActivationPhase(value: string): GreaterRealmActivationPhase {
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
  const candidate: unknown = checkpoint;
  if (!isRecord(candidate)) fail('GREATER_REALM_ACTIVATION_CHECKPOINT_INVALID');
  requireExactKeys(
    candidate,
    ['phase', 'everActive', 'postCanaryFoundingCount', 'postCanaryDispatchCount'],
    'GREATER_REALM_ACTIVATION_CHECKPOINT_INVALID',
  );
  requireActivationPhase(checkpoint.phase);
  if (typeof checkpoint.everActive !== 'boolean') {
    fail('GREATER_REALM_EVER_ACTIVE_INVALID');
  }
  requireInteger(
    checkpoint.postCanaryFoundingCount,
    0,
    GREATER_REALM_CASTLE_CAPACITY,
    'GREATER_REALM_POST_CANARY_FOUNDING_COUNT_INVALID',
  );
  requireInteger(
    checkpoint.postCanaryDispatchCount,
    0,
    GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT,
    'GREATER_REALM_POST_CANARY_DISPATCH_COUNT_INVALID',
  );
  if (
    (checkpoint.phase === 'prepared'
      || checkpoint.phase === 'draining'
      || checkpoint.phase === 'frozen'
      || checkpoint.phase === 'planned'
      || checkpoint.phase === 'rolled-back')
    && (checkpoint.postCanaryFoundingCount !== 0 || checkpoint.postCanaryDispatchCount !== 0)
  ) fail('GREATER_REALM_PRE_CANARY_COUNTER_INVALID');
  if (
    checkpoint.phase !== 'active'
    && checkpoint.phase !== 'halted'
    && checkpoint.everActive
  ) fail('GREATER_REALM_EVER_ACTIVE_PHASE_INVALID');
  if (checkpoint.phase === 'active' && !checkpoint.everActive) {
    fail('GREATER_REALM_ACTIVE_COMMIT_MISSING');
  }
}

export type GreaterRealmActivationTransitionPlanV1 = Readonly<{
  result: 'unchanged' | 'counter-advance' | 'phase-transition';
  checkpoint: GreaterRealmActivationCheckpointV1;
}>;

function freezeActivationCheckpoint(
  checkpoint: GreaterRealmActivationCheckpointV1,
): GreaterRealmActivationCheckpointV1 {
  return Object.freeze({
    phase: checkpoint.phase,
    everActive: checkpoint.everActive,
    postCanaryFoundingCount: checkpoint.postCanaryFoundingCount,
    postCanaryDispatchCount: checkpoint.postCanaryDispatchCount,
  });
}

/**
 * Plans one exact state change. Phase changes never smuggle counter changes;
 * same-phase counter progress is monotone and is permitted only in canary or
 * active. An exact retry is an immutable `unchanged` plan.
 */
export function planGreaterRealmActivationTransitionV1(
  current: GreaterRealmActivationCheckpointV1,
  next: GreaterRealmActivationCheckpointV1,
): GreaterRealmActivationTransitionPlanV1 {
  validateGreaterRealmActivationCheckpointV1(current);
  validateGreaterRealmActivationCheckpointV1(next);
  if (
    next.phase === 'rolled-back'
    && (
      current.everActive
      || current.postCanaryFoundingCount !== 0
      || current.postCanaryDispatchCount !== 0
    )
  ) fail('GREATER_REALM_ROLLBACK_WINDOW_CLOSED');
  if (current.everActive && !next.everActive) fail('GREATER_REALM_EVER_ACTIVE_ROLLBACK');
  if (
    next.postCanaryFoundingCount < current.postCanaryFoundingCount
    || next.postCanaryDispatchCount < current.postCanaryDispatchCount
  ) fail('GREATER_REALM_POST_CANARY_COUNTER_ROLLBACK');

  const countersChanged = next.postCanaryFoundingCount !== current.postCanaryFoundingCount
    || next.postCanaryDispatchCount !== current.postCanaryDispatchCount;
  const activeCommitChanged = current.everActive !== next.everActive;
  if (current.phase === next.phase) {
    if (activeCommitChanged) fail('GREATER_REALM_EVER_ACTIVE_TRANSITION_INVALID');
    if (!countersChanged) {
      return Object.freeze({ result: 'unchanged', checkpoint: freezeActivationCheckpoint(next) });
    }
    if (current.phase !== 'canary' && current.phase !== 'active') {
      fail('GREATER_REALM_POST_CANARY_COUNTER_PHASE_INVALID');
    }
    const foundingDelta = next.postCanaryFoundingCount - current.postCanaryFoundingCount;
    const dispatchDelta = next.postCanaryDispatchCount - current.postCanaryDispatchCount;
    if (
      !((foundingDelta === 1 && dispatchDelta === 0)
        || (foundingDelta === 0 && dispatchDelta === 1))
    ) fail('GREATER_REALM_POST_CANARY_COUNTER_ADVANCE_INVALID');
    return Object.freeze({ result: 'counter-advance', checkpoint: freezeActivationCheckpoint(next) });
  }
  if (countersChanged) fail('GREATER_REALM_ACTIVATION_TRANSITION_COUNTER_CHANGED');
  if (!GREATER_REALM_ACTIVATION_TRANSITIONS[current.phase].includes(next.phase)) {
    fail('GREATER_REALM_ACTIVATION_TRANSITION_INVALID');
  }
  const commitsActivation = current.phase === 'canary'
    && next.phase === 'active'
    && !current.everActive
    && next.everActive;
  if (activeCommitChanged && !commitsActivation) {
    fail('GREATER_REALM_EVER_ACTIVE_TRANSITION_INVALID');
  }
  return Object.freeze({ result: 'phase-transition', checkpoint: freezeActivationCheckpoint(next) });
}

export function advanceGreaterRealmPostCanaryCounterV1(
  current: GreaterRealmActivationCheckpointV1,
  kind: 'founding' | 'dispatch',
): GreaterRealmActivationCheckpointV1 {
  validateGreaterRealmActivationCheckpointV1(current);
  if (kind !== 'founding' && kind !== 'dispatch') {
    fail('GREATER_REALM_POST_CANARY_COUNTER_KIND_INVALID');
  }
  if (current.phase !== 'canary' && current.phase !== 'active') {
    fail('GREATER_REALM_POST_CANARY_COUNTER_PHASE_INVALID');
  }
  const next = kind === 'founding'
    ? {
        ...current,
        postCanaryFoundingCount: requireInteger(
          current.postCanaryFoundingCount + 1,
          1,
          GREATER_REALM_CASTLE_CAPACITY,
          'GREATER_REALM_POST_CANARY_FOUNDING_COUNT_INVALID',
        ),
      }
    : {
        ...current,
        postCanaryDispatchCount: requireInteger(
          current.postCanaryDispatchCount + 1,
          1,
          GREATER_REALM_MAX_POST_CANARY_DISPATCH_COUNT,
          'GREATER_REALM_POST_CANARY_DISPATCH_COUNT_INVALID',
        ),
      };
  planGreaterRealmActivationTransitionV1(current, next);
  return freezeActivationCheckpoint(next);
}

export function requireGreaterRealmJourneyTablesEmptyV1(value: unknown): void {
  if (!isRecord(value)) fail('GREATER_REALM_JOURNEY_GATE_INVALID');
  requireExactKeys(value, GREATER_REALM_JOURNEY_TABLES, 'GREATER_REALM_JOURNEY_GATE_INVALID');
  for (const table of GREATER_REALM_JOURNEY_TABLES) {
    if (value[table] !== 0n) fail('GREATER_REALM_JOURNEY_GATE_NOT_EMPTY');
  }
}

export type GreaterRealmAllocationSlotV1 = Readonly<{
  slotId: string;
  regionId: string;
  tier: number;
  regionOrderRank: number;
  allocationRank: number;
}>;

type ValidatedSlotTopology = Readonly<{
  ordered: readonly GreaterRealmAllocationSlotV1[];
  byId: ReadonlyMap<string, GreaterRealmAllocationSlotV1>;
}>;

function validateSlotTopology(rows: readonly GreaterRealmAllocationSlotV1[]): ValidatedSlotTopology {
  if (!Array.isArray(rows) || rows.length !== GREATER_REALM_CASTLE_CAPACITY) {
    fail('GREATER_REALM_SLOT_TOPOLOGY_COUNT_INVALID');
  }
  const byId = new Map<string, GreaterRealmAllocationSlotV1>();
  const allocationRanks = new Set<number>();
  const byRegion = new Map<string, GreaterRealmAllocationSlotV1[]>(
    GREATER_REALM_TIER_ONE_REGION_IDS.map(regionId => [regionId, []]),
  );
  for (const row of rows) {
    const candidate: unknown = row;
    if (!isRecord(candidate)) fail('GREATER_REALM_SLOT_TOPOLOGY_ROW_INVALID');
    requireExactKeys(
      candidate,
      ['slotId', 'regionId', 'tier', 'regionOrderRank', 'allocationRank'],
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
    const validatedRow: GreaterRealmAllocationSlotV1 = {
      slotId: candidate.slotId,
      regionId: candidate.regionId,
      tier: candidate.tier,
      regionOrderRank: candidate.regionOrderRank,
      allocationRank: candidate.allocationRank,
    };
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
  return Object.freeze({
    ordered: Object.freeze([...rows].sort(
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
}>;

export type GreaterRealmCastleAllocationV1 = Readonly<{
  castleId: bigint;
  slotId: string;
  regionId: string;
  regionOrderRank: number;
  allocationRank: number;
  allocationSequence: bigint;
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
  if (!Array.isArray(claims) || claims.length > GREATER_REALM_CASTLE_CAPACITY) {
    fail('GREATER_REALM_ALLOCATION_CLAIM_COUNT_INVALID');
  }
  const ordered = [...claims].sort((left, right) => (
    left.allocationSequence < right.allocationSequence ? -1
      : left.allocationSequence > right.allocationSequence ? 1
        : 0
  ));
  const byCastle = new Map<bigint, GreaterRealmCastleAllocationClaimV1>();
  const claimedSlotIds = new Set<string>();
  const regionCounts = new Map<string, number>(
    GREATER_REALM_TIER_ONE_REGION_IDS.map(regionId => [regionId, 0]),
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const claim = ordered[index]!;
    requireU64(claim.castleId, 'GREATER_REALM_CASTLE_ID_INVALID', false);
    requireU64(claim.allocationSequence, 'GREATER_REALM_ALLOCATION_SEQUENCE_INVALID');
    if (claim.allocationSequence !== BigInt(index)) {
      fail('GREATER_REALM_ALLOCATION_SEQUENCE_INVALID');
    }
    if (typeof claim.slotId !== 'string' || byCastle.has(claim.castleId)) {
      fail('GREATER_REALM_ALLOCATION_CASTLE_DUPLICATE');
    }
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
  });
  return Object.freeze({ result: 'allocated', allocation: allocationFor(topology, claim) });
}

/** Canonicalizes existing castles by numeric ID before constructing the balanced plan. */
export function planGreaterRealmExistingPopulationV1(
  slots: readonly GreaterRealmAllocationSlotV1[],
  castleIds: readonly bigint[],
): readonly GreaterRealmCastleAllocationV1[] {
  if (!Array.isArray(castleIds) || castleIds.length > GREATER_REALM_CASTLE_CAPACITY) {
    fail('GREATER_REALM_EXISTING_POPULATION_COUNT_INVALID');
  }
  const topology = validateSlotTopology(slots);
  const orderedCastleIds = [...castleIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const unique = new Set<bigint>();
  const claims: GreaterRealmCastleAllocationClaimV1[] = [];
  const claimedSlotIds = new Set<string>();
  const regionCounts = new Map<string, number>(
    GREATER_REALM_TIER_ONE_REGION_IDS.map(regionId => [regionId, 0]),
  );
  for (let index = 0; index < orderedCastleIds.length; index += 1) {
    const castleId = requireU64(
      orderedCastleIds[index]!,
      'GREATER_REALM_CASTLE_ID_INVALID',
      false,
    );
    if (unique.has(castleId)) fail('GREATER_REALM_ALLOCATION_CASTLE_DUPLICATE');
    unique.add(castleId);
    const slot = chooseNextSlot(topology, claimedSlotIds, regionCounts);
    claims.push(Object.freeze({ castleId, slotId: slot.slotId, allocationSequence: BigInt(index) }));
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
  }
>;

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
  if (!isRecord(value)) fail('GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID');
  requireExactKeys(value, ['leaseId', 'nodeCount'], 'GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID');
  if (typeof value.leaseId !== 'string' || typeof value.nodeCount !== 'number') {
    fail('GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID');
  }
  const match = CAPACITY_LEASE_PATTERN.exec(value.leaseId);
  if (match === null) fail('GREATER_REALM_PUBLIC_CAPACITY_LEASE_INVALID');
  const nodeCount = requireInteger(
    value.nodeCount,
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
 * dispatch-v2 lease is returned before live occupancy selection, even after its
 * journey completed and freed (or another journey reused) that ordinal.
 */
export function selectGreaterRealmPublicCapacityLeaseV1(
  value: unknown,
): GreaterRealmPublicCapacityLeaseSelectionV1 {
  if (!isRecord(value)) fail('GREATER_REALM_PUBLIC_CAPACITY_SELECTION_INVALID');
  requireExactKeys(
    value,
    ['locationId', 'nodeCount', 'occupiedCapacityOrdinals', 'priorLeaseId'],
    'GREATER_REALM_PUBLIC_CAPACITY_SELECTION_INVALID',
  );
  const locationId = requireCapacityLocationId(value.locationId);
  if (typeof value.nodeCount !== 'number') {
    fail('GREATER_REALM_PUBLIC_CAPACITY_NODE_COUNT_INVALID');
  }
  const nodeCount = requireInteger(
    value.nodeCount,
    1,
    GREATER_REALM_PUBLIC_CAPACITY_MAX,
    'GREATER_REALM_PUBLIC_CAPACITY_NODE_COUNT_INVALID',
  );
  if (value.priorLeaseId !== null) {
    if (typeof value.priorLeaseId !== 'string') {
      fail('GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID');
    }
    let prior: GreaterRealmPublicCapacityLeaseV1;
    try {
      prior = parseGreaterRealmPublicCapacityLeaseV1({
        leaseId: value.priorLeaseId,
        nodeCount,
      });
    } catch {
      fail('GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID');
    }
    if (prior.locationId !== locationId) {
      fail('GREATER_REALM_PUBLIC_CAPACITY_REPLAY_INVALID');
    }
    return Object.freeze({
      result: 'unchanged',
      leaseId: value.priorLeaseId,
      locationId,
      capacityOrdinal: prior.capacityOrdinal,
      nodeCount,
    });
  }
  if (!Array.isArray(value.occupiedCapacityOrdinals)) {
    fail('GREATER_REALM_PUBLIC_CAPACITY_OCCUPANCY_INVALID');
  }
  const occupied = new Set<number>();
  for (const ordinal of value.occupiedCapacityOrdinals) {
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
      });
    }
  }
  fail('GREATER_REALM_PUBLIC_CAPACITY_EXHAUSTED');
}

export function greaterRealmActivationPolicyErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmActivationPolicyError ? error.code : undefined;
}
