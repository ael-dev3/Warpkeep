import {
  GAMEPLAY04_GATHER_QUANTUM_MICROS,
  gatheringYield04,
  requireGatherDuration04,
  travelPerEdge04,
  type CompletedLevels04,
  type Resource04,
} from './policy';

export type Journey04 = Readonly<{
  resource: Resource04;
  dispatchedAt: bigint;
  routeEdges: number;
  travelPerEdgeMicros: bigint;
  gatheringDurationMicros: bigint;
  yieldPerQuantum: bigint;
  recalledAt: bigint | null;
}>;

export type JourneyObservation04 = Readonly<{
  phase: 'outbound' | 'gathering' | 'returning' | 'complete';
  arrivesAt: bigint;
  gatheringStopsAt: bigint;
  returnsAt: bigint;
  earned: bigint;
  nextDueAt: bigint | null;
}>;

const JOURNEY_ERROR_CODE = 'GAMEPLAY04_JOURNEY_INVALID';
const I64_MAX = 9_223_372_036_854_775_807n;
const MAX_ROUTE_EDGES = 8192;
const RESOURCES = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);
const TRAVEL_PER_EDGE_VALUES = Object.freeze([
  2_000_000n,
  1_900_000n,
  1_800_000n,
  1_700_000n,
  1_600_000n,
  1_500_000n,
] as const);
const YIELD_PER_QUANTUM_VALUES = Object.freeze([10n, 12n, 14n, 16n, 18n, 20n] as const);
const DISPATCH_FIELDS = Object.freeze([
  'resource',
  'dispatchedAt',
  'routeEdges',
  'gatheringDurationMicros',
  'completed',
] as const);
const JOURNEY_FIELDS = Object.freeze([
  'resource',
  'dispatchedAt',
  'routeEdges',
  'travelPerEdgeMicros',
  'gatheringDurationMicros',
  'yieldPerQuantum',
  'recalledAt',
] as const);

type JourneyDerivation04 = Readonly<{
  journey: Journey04;
  arrivesAt: bigint;
  automaticStop: bigint;
  stop: bigint;
  returnsAt: bigint;
}>;

export class Gameplay04JourneyError extends Error {
  readonly code = JOURNEY_ERROR_CODE;

  constructor() {
    super('Invalid gameplay 0.4 Worker journey.');
    this.name = 'Gameplay04JourneyError';
  }
}

function invalidJourney(): never {
  throw new Gameplay04JourneyError();
}

function requireExactEnumerableFields(
  value: unknown,
  expectedFields: readonly string[],
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalidJourney();
  }

  let enumerableKeys: PropertyKey[];
  try {
    enumerableKeys = Reflect.ownKeys(value).filter((key) => (
      Object.prototype.propertyIsEnumerable.call(value, key)
    ));
  } catch {
    invalidJourney();
  }

  if (
    enumerableKeys.length !== expectedFields.length
    || enumerableKeys.some((key) => typeof key !== 'string' || !expectedFields.includes(key))
    || expectedFields.some((field) => !Object.prototype.hasOwnProperty.call(value, field))
  ) {
    invalidJourney();
  }
}

function requireResource(value: unknown): asserts value is Resource04 {
  if (typeof value !== 'string' || !RESOURCES.includes(value as Resource04)) {
    invalidJourney();
  }
}

function requireTimestamp(value: unknown): asserts value is bigint {
  if (typeof value !== 'bigint' || value < 0n || value > I64_MAX) {
    invalidJourney();
  }
}

function requireRouteEdges(value: unknown): asserts value is number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_ROUTE_EDGES
  ) {
    invalidJourney();
  }
}

function requireCapturedTravel(value: unknown): asserts value is bigint {
  if (
    typeof value !== 'bigint'
    || !TRAVEL_PER_EDGE_VALUES.includes(value as (typeof TRAVEL_PER_EDGE_VALUES)[number])
  ) {
    invalidJourney();
  }
}

function requireCapturedYield(value: unknown): asserts value is bigint {
  if (
    typeof value !== 'bigint'
    || !YIELD_PER_QUANTUM_VALUES.includes(value as (typeof YIELD_PER_QUANTUM_VALUES)[number])
  ) {
    invalidJourney();
  }
}

function requireGatherDuration(value: unknown): asserts value is bigint {
  try {
    requireGatherDuration04(value as bigint);
  } catch {
    invalidJourney();
  }
}

function checkedAdd(left: bigint, right: bigint): bigint {
  const result = left + right;
  if (result > I64_MAX) {
    invalidJourney();
  }
  return result;
}

function validateAndDeriveJourney(journeyValue: unknown): JourneyDerivation04 {
  requireExactEnumerableFields(journeyValue, JOURNEY_FIELDS);

  let resource: unknown;
  let dispatchedAt: unknown;
  let routeEdges: unknown;
  let travelPerEdgeMicros: unknown;
  let gatheringDurationMicros: unknown;
  let yieldPerQuantum: unknown;
  let recalledAt: unknown;
  try {
    ({
      resource,
      dispatchedAt,
      routeEdges,
      travelPerEdgeMicros,
      gatheringDurationMicros,
      yieldPerQuantum,
      recalledAt,
    } = journeyValue);
  } catch {
    invalidJourney();
  }

  requireResource(resource);
  requireTimestamp(dispatchedAt);
  requireRouteEdges(routeEdges);
  requireCapturedTravel(travelPerEdgeMicros);
  requireGatherDuration(gatheringDurationMicros);
  requireCapturedYield(yieldPerQuantum);
  if (recalledAt !== null) {
    requireTimestamp(recalledAt);
  }

  const journey: Journey04 = {
    resource,
    dispatchedAt,
    routeEdges,
    travelPerEdgeMicros,
    gatheringDurationMicros,
    yieldPerQuantum,
    recalledAt,
  };
  const travel = BigInt(routeEdges) * travelPerEdgeMicros;
  const arrivesAt = checkedAdd(dispatchedAt, travel);
  const automaticStop = checkedAdd(arrivesAt, gatheringDurationMicros);
  checkedAdd(automaticStop, travel);

  if (recalledAt !== null && (recalledAt < dispatchedAt || recalledAt >= automaticStop)) {
    invalidJourney();
  }

  const stop = recalledAt === null ? automaticStop : recalledAt;
  const returnTravel = stop < arrivesAt ? stop - dispatchedAt : travel;
  const returnsAt = checkedAdd(stop, returnTravel);
  return Object.freeze({ journey, arrivesAt, automaticStop, stop, returnsAt });
}

function requireNow(now: unknown, derivation: JourneyDerivation04): asserts now is bigint {
  requireTimestamp(now);
  if (
    now < derivation.journey.dispatchedAt
    || (derivation.journey.recalledAt !== null && now < derivation.journey.recalledAt)
  ) {
    invalidJourney();
  }
}

export function dispatchJourney04(input: Readonly<{
  resource: Resource04;
  dispatchedAt: bigint;
  routeEdges: number;
  gatheringDurationMicros: bigint;
  completed: CompletedLevels04;
}>): Journey04 {
  requireExactEnumerableFields(input, DISPATCH_FIELDS);

  let resource: unknown;
  let dispatchedAt: unknown;
  let routeEdges: unknown;
  let gatheringDurationMicros: unknown;
  let completed: unknown;
  try {
    ({ resource, dispatchedAt, routeEdges, gatheringDurationMicros, completed } = input);
  } catch {
    invalidJourney();
  }

  requireResource(resource);
  requireTimestamp(dispatchedAt);
  requireRouteEdges(routeEdges);
  requireGatherDuration(gatheringDurationMicros);

  let capturedTravel: bigint;
  let capturedYield: bigint;
  try {
    capturedTravel = travelPerEdge04(completed as CompletedLevels04);
    capturedYield = gatheringYield04(resource, completed as CompletedLevels04);
  } catch {
    invalidJourney();
  }

  const journey: Journey04 = {
    resource,
    dispatchedAt,
    routeEdges,
    travelPerEdgeMicros: capturedTravel,
    gatheringDurationMicros,
    yieldPerQuantum: capturedYield,
    recalledAt: null,
  };
  validateAndDeriveJourney(journey);
  return Object.freeze(journey);
}

export function observeJourney04(journey: Journey04, now: bigint): JourneyObservation04 {
  const derivation = validateAndDeriveJourney(journey);
  requireNow(now, derivation);

  const gatheredUntil = now < derivation.stop ? now : derivation.stop;
  const elapsedGather = gatheredUntil > derivation.arrivesAt
    ? gatheredUntil - derivation.arrivesAt
    : 0n;
  const earned = (
    elapsedGather / GAMEPLAY04_GATHER_QUANTUM_MICROS
  ) * derivation.journey.yieldPerQuantum;

  if (now >= derivation.returnsAt) {
    return Object.freeze({
      phase: 'complete',
      arrivesAt: derivation.arrivesAt,
      gatheringStopsAt: derivation.stop,
      returnsAt: derivation.returnsAt,
      earned,
      nextDueAt: null,
    });
  }
  if (now >= derivation.stop) {
    return Object.freeze({
      phase: 'returning',
      arrivesAt: derivation.arrivesAt,
      gatheringStopsAt: derivation.stop,
      returnsAt: derivation.returnsAt,
      earned,
      nextDueAt: derivation.returnsAt,
    });
  }
  if (now >= derivation.arrivesAt) {
    return Object.freeze({
      phase: 'gathering',
      arrivesAt: derivation.arrivesAt,
      gatheringStopsAt: derivation.stop,
      returnsAt: derivation.returnsAt,
      earned,
      nextDueAt: derivation.stop,
    });
  }
  return Object.freeze({
    phase: 'outbound',
    arrivesAt: derivation.arrivesAt,
    gatheringStopsAt: derivation.stop,
    returnsAt: derivation.returnsAt,
    earned,
    nextDueAt: derivation.arrivesAt < derivation.stop ? derivation.arrivesAt : derivation.stop,
  });
}

export function recallJourney04(journey: Journey04, now: bigint): Journey04 {
  const derivation = validateAndDeriveJourney(journey);
  requireNow(now, derivation);

  if (derivation.journey.recalledAt !== null || now >= derivation.stop) {
    return Object.isFrozen(journey) ? journey : Object.freeze({ ...derivation.journey });
  }

  const recalled = Object.freeze({ ...derivation.journey, recalledAt: now });
  validateAndDeriveJourney(recalled);
  return recalled;
}
