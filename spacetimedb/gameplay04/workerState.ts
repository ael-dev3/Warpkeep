import { observeJourney04, type Journey04 } from './workerJourney';
import type { Resource04 } from './policy';

export type RoutePoint04 = Readonly<{ q: number; r: number }>;
export type Assignment04 = Readonly<{
  nodeId: string;
  locationId: string;
  destinationCellKey: string;
  route: readonly RoutePoint04[];
  journey: Journey04;
}>;
export type ReturnOutcome04 = Readonly<{
  assignmentRevision: bigint;
  resource: Resource04;
  returnedAtMicros: bigint;
  earned: bigint;
  credited: bigint;
  overflow: bigint;
}>;

const U64_MAX = 18_446_744_073_709_551_615n;
const I64_MAX = 9_223_372_036_854_775_807n;
const I32_MIN = -0x8000_0000;
const I32_MAX = 0x7fff_ffff;
const MAX_TEXT = 256;
const RESOURCES = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);
const ASSIGNMENT_FIELDS = Object.freeze([
  'nodeId', 'locationId', 'destinationCellKey', 'route', 'journey',
] as const);
const OUTCOME_FIELDS = Object.freeze([
  'assignmentRevision', 'resource', 'returnedAtMicros', 'earned', 'credited', 'overflow',
] as const);

export class Gameplay04WorkerStateError extends Error {
  readonly code = 'GAMEPLAY04_WORKER_STATE_INVALID';
  constructor() {
    super('GAMEPLAY04_WORKER_STATE_INVALID');
    this.name = 'Gameplay04WorkerStateError';
  }
}

function invalid(): never { throw new Gameplay04WorkerStateError(); }

function exact(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  const keys = Reflect.ownKeys(value).filter(key => (
    Object.prototype.propertyIsEnumerable.call(value, key)
  ));
  if (
    keys.length !== fields.length
    || keys.some(key => typeof key !== 'string' || !fields.includes(key))
    || fields.some(field => !Object.prototype.hasOwnProperty.call(value, field))
  ) invalid();
}

function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT) invalid();
}

function u64(value: unknown): asserts value is bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) invalid();
}

function timestamp(value: unknown): asserts value is bigint {
  if (typeof value !== 'bigint' || value < 0n || value > I64_MAX) invalid();
}

function resource(value: unknown): asserts value is Resource04 {
  if (typeof value !== 'string' || !RESOURCES.includes(value as Resource04)) invalid();
}

export function validateRoute04(route: unknown): readonly RoutePoint04[] {
  if (!Array.isArray(route) || route.length < 1 || route.length > 8193) invalid();
  const copy: RoutePoint04[] = [];
  for (let index = 0; index < route.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(route, index)) invalid();
    const point = route[index];
    exact(point, ['q', 'r']);
    if (
      typeof point.q !== 'number' || !Number.isSafeInteger(point.q)
      || point.q < I32_MIN || point.q > I32_MAX
      || typeof point.r !== 'number' || !Number.isSafeInteger(point.r)
      || point.r < I32_MIN || point.r > I32_MAX
    ) invalid();
    if (index > 0) {
      const prior = copy[index - 1]!;
      const dq = point.q - prior.q;
      const dr = point.r - prior.r;
      if (!(
        (dq === 1 && dr === 0) || (dq === 1 && dr === -1)
        || (dq === 0 && dr === -1) || (dq === -1 && dr === 0)
        || (dq === -1 && dr === 1) || (dq === 0 && dr === 1)
      )) invalid();
    }
    copy.push(Object.freeze({ q: point.q, r: point.r }));
  }
  return Object.freeze(copy);
}

export function validateAssignment04(value: unknown): Assignment04 {
  exact(value, ASSIGNMENT_FIELDS);
  text(value.nodeId);
  text(value.locationId);
  text(value.destinationCellKey);
  const route = validateRoute04(value.route);
  let journey: Journey04;
  try {
    journey = value.journey as Journey04;
    observeJourney04(journey, journey.recalledAt ?? journey.dispatchedAt);
  } catch { invalid(); }
  if (journey.routeEdges !== route.length - 1) invalid();
  return Object.freeze({
    nodeId: value.nodeId,
    locationId: value.locationId,
    destinationCellKey: value.destinationCellKey,
    route,
    journey: Object.freeze({ ...journey }),
  });
}

export function validateReturnOutcome04(value: unknown): ReturnOutcome04 {
  exact(value, OUTCOME_FIELDS);
  u64(value.assignmentRevision);
  if (value.assignmentRevision === 0n) invalid();
  resource(value.resource);
  timestamp(value.returnedAtMicros);
  u64(value.earned);
  u64(value.credited);
  u64(value.overflow);
  if (value.credited + value.overflow !== value.earned) invalid();
  return Object.freeze({
    assignmentRevision: value.assignmentRevision,
    resource: value.resource,
    returnedAtMicros: value.returnedAtMicros,
    earned: value.earned,
    credited: value.credited,
    overflow: value.overflow,
  });
}
