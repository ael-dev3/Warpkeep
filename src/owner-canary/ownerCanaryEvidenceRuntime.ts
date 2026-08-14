import type { FarcasterOidcSession } from '../farcaster/farcasterAuthTypes';
import type { OwnerCanaryPrivateSession } from './ownerCanaryAuthClient';
import { parseFarcasterOidcJwt } from '../farcaster/farcasterOidcSession';
import {
  awaitWarpkeepAuthorityOperation,
  connectWarpkeepAuthority,
  disconnectWarpkeepConfirmed,
  dispatchWarpkeepGreaterRealmWorker,
  readWarpkeepAdmissionStatus,
  readWarpkeepEntryAgreementStatus,
  readWarpkeepGreaterRealmWorkerControlState,
  recallWarpkeepProductionPlayerCanaryWorker,
  isWarpkeepAuthorityClosureUnconfirmed,
  type WarpkeepConnection,
} from '../spacetime/warpkeepConnection';
import {
  CANONICAL_WARPKEEP_AUTH_ORIGIN,
  DEFAULT_SPACETIMEDB_DATABASE,
  DEFAULT_SPACETIMEDB_URI,
  DEFAULT_WARPKEEP_OIDC_AUDIENCE,
  type WarpkeepRuntimeConfig,
} from '../spacetime/warpkeepConfig';
import type {
  ReadyGreaterRealmWorkerControlState,
} from '../greater-realm/greaterRealmWorkerControl';
import { CASTLE_WORKER_POLICY_VERSION } from '../components/realm/realmWorkerPresentation';
import { REALM_RESOURCE_POLICY_VERSION } from '../components/realm/realmResourcePresentation';
import {
  OWNER_CANARY_RESOURCE_KINDS,
  type OwnerCanaryJourneyEvidence,
  type OwnerCanaryResourceKind,
  type OwnerCanarySanitizedEvidence,
  type OwnerCanaryStateEvidence,
} from './ownerCanaryEvidence';
import type { OwnerCanaryEvidenceApi } from './ownerCanaryController';
import type {
  OwnerCanaryFreshPageRecoveryInput,
  OwnerCanaryRecoveryState,
  OwnerCanaryRuntime,
} from './ownerCanaryRuntime';
import {
  createOwnerCanaryRuntimePlanBoundary,
  type OwnerCanaryCommandOrdinal,
  type OwnerCanaryRecallRecoveryPlan,
  type OwnerCanaryRuntimePlan,
  type OwnerCanaryRuntimePlanBoundary,
} from './ownerCanaryRuntimePlan';
import { isExactOwnerCanaryProductionConfig } from './ownerCanaryProductionConfig';

export { isExactOwnerCanaryProductionConfig } from './ownerCanaryProductionConfig';

export const OWNER_CANARY_ROUTE_TRAVEL_MILLISECONDS_PER_STEP = 30_000;
export const OWNER_CANARY_MINIMUM_GATHERING_MILLISECONDS = 60_000;
export const OWNER_CANARY_MAXIMUM_GATHERING_MILLISECONDS = 120_000;
export const OWNER_CANARY_ACTION_CEILING_MILLISECONDS = 30_000;
export const OWNER_CANARY_RECOVERY_READ_CEILING_MILLISECONDS = 10_000;

const RUNTIME_PLAN_PROFILE =
  'warpkeep-production-player-canary-runtime-route-plan-v1';
const COMMAND_KEY_POLICY_VERSION =
  'warpkeep-production-player-canary-command-key-v2';
const SHA256 = /^[0-9a-f]{64}$/u;
const WORKER_ID = /^genesis-001-castle-[1-9][0-9]*-worker-0[1-4]$/u;
const LOCATION_ID = /^GRL-[A-Z2-7]{26}$/u;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

type OwnerCanaryAuthority = Readonly<{
  connection: WarpkeepConnection;
  subjectFid: number;
}>;

const recallRecoveryAuthorityBrand: unique symbol = Symbol(
  'OwnerCanaryRecallRecoveryAuthority',
);

type OwnerCanaryRecallRecoveryAuthority = Readonly<{
  connection: WarpkeepConnection;
  subjectFid: number;
  [recallRecoveryAuthorityBrand]: true;
}>;

const freshPageRecoveryAuthorityBrand: unique symbol = Symbol(
  'OwnerCanaryFreshPageRecoveryAuthority',
);

type OwnerCanaryFreshPageRecoveryAuthority = Readonly<{
  connection: WarpkeepConnection;
  subjectFid: number;
  [freshPageRecoveryAuthorityBrand]: true;
}>;

type PrivateRoute = Readonly<{
  ordinal: 1 | 2 | 3 | 4;
  workerId: string;
  resourceKind: OwnerCanaryResourceKind;
  locationId: string;
  atlasRevision: bigint;
  routeSteps: number;
  nodeCount: number;
}>;

type PrivateRuntimePlan = Readonly<{
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  commandSetCommitment: string;
  notAfterMicros: bigint;
  atlasRevision: bigint;
  equalRouteSteps: number;
  routes: readonly [PrivateRoute, PrivateRoute, PrivateRoute, PrivateRoute];
}>;

type DispatchedWorkerSnapshot = Readonly<{
  workerId: string;
  ordinal: number;
  resourceKind: OwnerCanaryResourceKind;
  siteId: string;
  status: 'outbound' | 'gathering';
  revision: bigint;
}>;

type DispatchObservation = Readonly<{
  worker: DispatchedWorkerSnapshot;
  observedAtMicros: bigint;
}>;

type PreDispatchWorkerRevisions = readonly [bigint, bigint, bigint, bigint];

export type OwnerCanaryReviewedPollPolicy = Readonly<{
  /** Review-selected cadence; this module intentionally supplies no default. */
  intervalMilliseconds: number;
  /** Review-selected finite cap; this module intentionally supplies no default. */
  maximumAttempts: number;
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
}>;

export type OwnerCanaryEvidenceRuntimeDependencies = Readonly<{
  config: WarpkeepRuntimeConfig;
  pollPolicy: OwnerCanaryReviewedPollPolicy;
  verifyPrivateSubject(input: Readonly<{
    privateSession: OwnerCanaryPrivateSession;
    latchedSubjectFid: number;
    reviewedAdmissionPlanDigest: string;
    signal: AbortSignal;
  }>): Promise<boolean>;
  acknowledgeSanitizedEvidence?(evidence: OwnerCanarySanitizedEvidence): Promise<void> | void;
  now?: () => number;
  connect?: typeof connectWarpkeepAuthority;
}>;

export type OwnerCanaryEvidenceRuntimeFailureCode =
  | 'configuration'
  | 'poll-policy'
  | 'authority-session'
  | 'runtime-plan'
  | 'founder-readiness'
  | 'control-state'
  | 'action-timeout'
  | 'poll-exhausted'
  | 'stage-invariant';

const failureCodes = new WeakMap<Error, OwnerCanaryEvidenceRuntimeFailureCode>();

export class OwnerCanaryEvidenceRuntimeError extends Error {
  override readonly name = 'OwnerCanaryEvidenceRuntimeError';

  constructor() {
    super('The owner canary evidence runtime stopped.');
  }
}

function failure(code: OwnerCanaryEvidenceRuntimeFailureCode) {
  const error = new OwnerCanaryEvidenceRuntimeError();
  failureCodes.set(error, code);
  return error;
}

export function ownerCanaryEvidenceRuntimeFailureCode(
  error: unknown,
): OwnerCanaryEvidenceRuntimeFailureCode | null {
  return error instanceof OwnerCanaryEvidenceRuntimeError
    ? failureCodes.get(error) ?? 'stage-invariant'
    : null;
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Reflect.ownKeys(value);
  return actual.every(key => typeof key === 'string')
    && actual.length === keys.length
    && [...actual as string[]].sort().join('\0') === [...keys].sort().join('\0');
}

function safeU32(value: unknown): number | undefined {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 0xffff_ffff
    ? value
    : undefined;
}

function safeU64(value: unknown): bigint | undefined {
  return typeof value === 'bigint' && value >= 0n && value <= U64_MAX
    ? value
    : undefined;
}

function parsePrivateRuntimePlan(value: unknown): PrivateRuntimePlan {
  if (!exactRecord(value, [
    'profile',
    'reviewedAdmissionPlanDigest',
    'serverBaselineCommitment',
    'routeSetCommitment',
    'commandKeyPolicyVersion',
    'commandSetCommitment',
    'notAfterMicros',
    'atlasRevision',
    'equalRouteSteps',
    'routes',
  ])) throw failure('runtime-plan');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const reviewedAdmissionPlanDigest = descriptors.reviewedAdmissionPlanDigest?.value;
  const serverBaselineCommitment = descriptors.serverBaselineCommitment?.value;
  const routeSetCommitment = descriptors.routeSetCommitment?.value;
  const commandSetCommitment = descriptors.commandSetCommitment?.value;
  const notAfterMicros = safeU64(descriptors.notAfterMicros?.value);
  const atlasRevision = safeU64(descriptors.atlasRevision?.value);
  const equalRouteSteps = safeU32(descriptors.equalRouteSteps?.value);
  const rawRoutes = descriptors.routes?.value;
  if (
    descriptors.profile?.value !== RUNTIME_PLAN_PROFILE
    || descriptors.commandKeyPolicyVersion?.value !== COMMAND_KEY_POLICY_VERSION
    || typeof reviewedAdmissionPlanDigest !== 'string'
    || !SHA256.test(reviewedAdmissionPlanDigest)
    || typeof serverBaselineCommitment !== 'string'
    || !SHA256.test(serverBaselineCommitment)
    || typeof routeSetCommitment !== 'string'
    || !SHA256.test(routeSetCommitment)
    || typeof commandSetCommitment !== 'string'
    || !SHA256.test(commandSetCommitment)
    || notAfterMicros === undefined
    || notAfterMicros < 1n
    || atlasRevision === undefined
    || atlasRevision < 1n
    || equalRouteSteps === undefined
    || equalRouteSteps < 1
    || equalRouteSteps > 12
    || !Array.isArray(rawRoutes)
    || rawRoutes.length !== 4
  ) throw failure('runtime-plan');
  const routeArrayKeys = Reflect.ownKeys(rawRoutes);
  if (
    routeArrayKeys.some(key => typeof key !== 'string')
    || routeArrayKeys.length !== 5
    || !['0', '1', '2', '3', 'length'].every(key => routeArrayKeys.includes(key))
  ) throw failure('runtime-plan');
  const rawRouteDescriptors = Object.getOwnPropertyDescriptors(rawRoutes);

  const routes: PrivateRoute[] = [];
  const workerIds = new Set<string>();
  const locationIds = new Set<string>();
  for (let index = 0; index < 4; index += 1) {
    const rawRoute = rawRouteDescriptors[index]?.value;
    if (!exactRecord(rawRoute, [
      'ordinal', 'workerId', 'resourceKind', 'locationId',
      'atlasRevision', 'routeSteps', 'nodeCount',
    ])) throw failure('runtime-plan');
    const route = Object.getOwnPropertyDescriptors(rawRoute);
    const ordinal = safeU32(route.ordinal?.value);
    const workerId = route.workerId?.value;
    const resourceKind = route.resourceKind?.value;
    const locationId = route.locationId?.value;
    const routeAtlasRevision = safeU64(route.atlasRevision?.value);
    const routeSteps = safeU32(route.routeSteps?.value);
    const nodeCount = safeU32(route.nodeCount?.value);
    if (
      ordinal !== index + 1
      || resourceKind !== OWNER_CANARY_RESOURCE_KINDS[index]
      || typeof workerId !== 'string'
      || !WORKER_ID.test(workerId)
      || workerIds.has(workerId)
      || typeof locationId !== 'string'
      || !LOCATION_ID.test(locationId)
      || locationIds.has(locationId)
      || routeAtlasRevision !== atlasRevision
      || routeSteps !== equalRouteSteps
      || nodeCount === undefined
      || nodeCount < 1
      || nodeCount > 32
    ) throw failure('runtime-plan');
    workerIds.add(workerId);
    locationIds.add(locationId);
    routes.push(Object.freeze({
      ordinal: ordinal as 1 | 2 | 3 | 4,
      workerId,
      resourceKind,
      locationId,
      atlasRevision: routeAtlasRevision,
      routeSteps,
      nodeCount,
    }));
  }
  return Object.freeze({
    reviewedAdmissionPlanDigest,
    serverBaselineCommitment,
    routeSetCommitment,
    commandSetCommitment,
    notAfterMicros,
    atlasRevision,
    equalRouteSteps,
    routes: Object.freeze(routes) as PrivateRuntimePlan['routes'],
  });
}

function samePrivatePlan(left: PrivateRuntimePlan, right: PrivateRuntimePlan): boolean {
  return left.reviewedAdmissionPlanDigest === right.reviewedAdmissionPlanDigest
    && left.serverBaselineCommitment === right.serverBaselineCommitment
    && left.routeSetCommitment === right.routeSetCommitment
    && left.commandSetCommitment === right.commandSetCommitment
    && left.notAfterMicros === right.notAfterMicros
    && left.atlasRevision === right.atlasRevision
    && left.equalRouteSteps === right.equalRouteSteps
    && left.routes.every((route, index) => {
      const other = right.routes[index];
      return other !== undefined
        && route.ordinal === other.ordinal
        && route.workerId === other.workerId
        && route.resourceKind === other.resourceKind
        && route.locationId === other.locationId
        && route.atlasRevision === other.atlasRevision
        && route.routeSteps === other.routeSteps
        && route.nodeCount === other.nodeCount;
    });
}

function validatePollPolicy(policy: OwnerCanaryReviewedPollPolicy): void {
  if (
    typeof policy !== 'object'
    || policy === null
    || !Number.isSafeInteger(policy.intervalMilliseconds)
    || policy.intervalMilliseconds < 1
    || policy.intervalMilliseconds >= OWNER_CANARY_MINIMUM_GATHERING_MILLISECONDS
    || !Number.isSafeInteger(policy.maximumAttempts)
    || policy.maximumAttempts < 2
    || typeof policy.wait !== 'function'
  ) throw failure('poll-policy');
}

function stateObservedAt(state: ReadyGreaterRealmWorkerControlState): bigint {
  return state.value.resourceState.observedAtMicros;
}

function pendingResourcesAreZero(state: ReadyGreaterRealmWorkerControlState): boolean {
  return OWNER_CANARY_RESOURCE_KINDS.every(kind => (
    state.value.resourceState.pending[kind] === 0n
  ));
}

function resourcesDidNotDecrease(
  baseline: ReadyGreaterRealmWorkerControlState,
  terminal: ReadyGreaterRealmWorkerControlState,
): boolean {
  return OWNER_CANARY_RESOURCE_KINDS.every(kind => (
    terminal.value.resourceState.available[kind]
      >= baseline.value.resourceState.available[kind]
  ));
}

function requireControlState(
  value: ReadyGreaterRealmWorkerControlState | Readonly<{ status: 'invalid' }> | undefined,
  plan?: PrivateRuntimePlan,
  expectedAtlasId?: string,
): ReadyGreaterRealmWorkerControlState {
  if (value?.status !== 'ready' || value.value.roster.workers.length !== 4) {
    throw failure('control-state');
  }
  if (
    value.value.roster.observedAtMicros !== value.value.resourceState.observedAtMicros
    || value.value.resourceState.workerSystemMode !== 'active'
    || value.value.resourceState.workerPolicyVersion !== CASTLE_WORKER_POLICY_VERSION
    || value.value.resourceState.resourcePolicyVersion !== REALM_RESOURCE_POLICY_VERSION
    || (plan !== undefined && value.atlasRevision !== plan.atlasRevision)
    || (expectedAtlasId !== undefined && value.atlasId !== expectedAtlasId)
    || (plan !== undefined && plan.routes.some((route, index) => {
      const worker = value.value.roster.workers[index];
      return worker === undefined
        || worker.ordinal !== route.ordinal
        || worker.workerId !== route.workerId;
    }))
  ) throw failure('control-state');
  return value;
}

function sanitizedState(
  value: ReadyGreaterRealmWorkerControlState,
): OwnerCanaryStateEvidence {
  const available = value.value.resourceState.available;
  return Object.freeze({
    tier: 1,
    atlasRevision: value.atlasRevision.toString(),
    observedAtMicros: value.value.resourceState.observedAtMicros.toString(),
    workers: Object.freeze(value.value.roster.workers.map(worker => Object.freeze({
      ordinal: worker.ordinal,
      status: worker.status,
      resourceKind: worker.resourceKind ?? null,
      accruedAmount: worker.accruedAmount.toString(),
      materializedAmount: worker.materializedAmount.toString(),
      availableAmount: worker.availableAmount.toString(),
    }))),
    resources: Object.freeze({
      food: available.food.toString(),
      wood: available.wood.toString(),
      stone: available.stone.toString(),
      gold: available.gold.toString(),
    }),
  });
}

function allWorkersIdle(value: ReadyGreaterRealmWorkerControlState): boolean {
  return value.value.roster.workers.every(worker => (
    worker.status === 'idle'
    && worker.resourceKind === undefined
    && worker.siteId === undefined
  ));
}

function routeCapacityLeaseMatches(siteId: string | undefined, route: PrivateRoute): boolean {
  if (typeof siteId !== 'string') return false;
  const match = new RegExp(`^${route.locationId}:([1-9]|[12][0-9]|3[0-2])$`, 'u')
    .exec(siteId);
  if (!match) return false;
  const ordinal = Number(match[1]);
  return Number.isSafeInteger(ordinal)
    && ordinal >= 1
    && ordinal <= route.nodeCount;
}

function idleControlStateIsClean(value: ReadyGreaterRealmWorkerControlState): boolean {
  return allWorkersIdle(value)
    && pendingResourcesAreZero(value)
    && value.value.roster.workers.every(worker => (
      worker.accruedAmount === 0n
      && worker.materializedAmount === 0n
      && worker.availableAmount === 0n
    ));
}

function workerIsCleanIdle(
  worker: ReadyGreaterRealmWorkerControlState['value']['roster']['workers'][number],
): boolean {
  return worker.status === 'idle'
    && worker.resourceKind === undefined
    && worker.siteId === undefined
    && worker.accruedAmount === 0n
    && worker.materializedAmount === 0n
    && worker.availableAmount === 0n;
}

function recoveryWorkerMatchesRoute(
  worker: ReadyGreaterRealmWorkerControlState['value']['roster']['workers'][number],
  route: PrivateRoute,
): boolean {
  return worker.workerId === route.workerId
    && worker.ordinal === route.ordinal
    && worker.resourceKind === route.resourceKind
    && routeCapacityLeaseMatches(worker.siteId, route);
}

function workerMatchesFreshDispatchRevision(
  worker: Readonly<{ status: string; revision: bigint }>,
  preDispatchRevision: bigint,
): boolean {
  return (worker.status === 'outbound'
      && worker.revision === preDispatchRevision + 1n)
    || (worker.status === 'gathering'
      && worker.revision === preDispatchRevision + 2n);
}

function validateRecoveryControlState(
  value: ReadyGreaterRealmWorkerControlState,
  plan: PrivateRuntimePlan,
  attemptedOrdinals: ReadonlySet<OwnerCanaryCommandOrdinal>,
  preDispatchRevisions: PreDispatchWorkerRevisions,
  allowActive: boolean,
): void {
  for (const route of plan.routes) {
    const worker = value.value.roster.workers[route.ordinal - 1];
    const baselineRevision = preDispatchRevisions[route.ordinal - 1];
    if (!worker || worker.workerId !== route.workerId || worker.ordinal !== route.ordinal) {
      throw failure('control-state');
    }
    if (
      baselineRevision === undefined
      || baselineRevision > U64_MAX - 4n
      || worker.revision < baselineRevision
      || worker.revision > baselineRevision + 4n
    ) throw failure('control-state');
    if (!attemptedOrdinals.has(route.ordinal)) {
      if (!workerIsCleanIdle(worker) || worker.revision !== baselineRevision) {
        throw failure('control-state');
      }
      continue;
    }
    if (
      workerIsCleanIdle(worker)
      && (
        worker.revision === baselineRevision
        || worker.revision === baselineRevision + 3n
        || worker.revision === baselineRevision + 4n
      )
    ) continue;
    if (
      ((worker.status === 'returning'
          && (
            worker.revision === baselineRevision + 2n
            || worker.revision === baselineRevision + 3n
          ))
        || (allowActive && worker.status === 'outbound'
          && worker.revision === baselineRevision + 1n)
        || (allowActive && worker.status === 'gathering'
          && worker.revision === baselineRevision + 2n))
      && recoveryWorkerMatchesRoute(worker, route)
    ) continue;
    throw failure('control-state');
  }
}

function workersMatchDispatchedRoutes(
  value: ReadyGreaterRealmWorkerControlState,
  plan: PrivateRuntimePlan,
): boolean {
  return value.value.roster.workers.every((worker, index) => {
    const route = plan.routes[index];
    return route !== undefined
      && worker.workerId === route.workerId
      && worker.ordinal === route.ordinal
      && worker.resourceKind === route.resourceKind
      && routeCapacityLeaseMatches(worker.siteId, route)
      && (worker.status === 'outbound' || worker.status === 'gathering');
  });
}

function dispatchedWorkerSnapshot(
  value: ReadyGreaterRealmWorkerControlState,
  plan: PrivateRuntimePlan,
): readonly DispatchedWorkerSnapshot[] {
  if (!workersMatchDispatchedRoutes(value, plan)) throw failure('control-state');
  return Object.freeze(value.value.roster.workers.map(worker => Object.freeze({
    workerId: worker.workerId,
    ordinal: worker.ordinal,
    resourceKind: worker.resourceKind!,
    siteId: worker.siteId!,
    status: worker.status as 'outbound' | 'gathering',
    revision: worker.revision,
  })));
}

function dispatchedRouteSnapshot(
  value: ReadyGreaterRealmWorkerControlState,
  plan: PrivateRuntimePlan,
  routeIndex: number,
): DispatchedWorkerSnapshot {
  const route = plan.routes[routeIndex];
  const worker = value.value.roster.workers[routeIndex];
  const siteId = worker?.siteId;
  if (
    !route
    || !worker
    || worker.workerId !== route.workerId
    || worker.ordinal !== route.ordinal
    || worker.resourceKind !== route.resourceKind
    || !routeCapacityLeaseMatches(siteId, route)
    || (worker.status !== 'outbound' && worker.status !== 'gathering')
  ) throw failure('control-state');
  return Object.freeze({
    workerId: worker.workerId,
    ordinal: worker.ordinal,
    resourceKind: worker.resourceKind,
    siteId: siteId!,
    status: worker.status,
    revision: worker.revision,
  });
}

function replayMatchesDispatch(
  value: ReadyGreaterRealmWorkerControlState,
  snapshot: readonly DispatchedWorkerSnapshot[],
): readonly [boolean, boolean, boolean, boolean] {
  const results = value.value.roster.workers.map((worker, index) => {
    const expected = snapshot[index];
    return expected !== undefined
      && worker.workerId === expected.workerId
      && worker.ordinal === expected.ordinal
      && worker.resourceKind === expected.resourceKind
      && worker.siteId === expected.siteId
      && worker.revision >= expected.revision
      && (expected.status === 'outbound'
        ? worker.status === 'outbound' || worker.status === 'gathering'
        : worker.status === 'gathering');
  });
  if (results.some(result => !result)) throw failure('control-state');
  return Object.freeze(results) as [boolean, boolean, boolean, boolean];
}

function workersMatchRecallProgress(
  value: ReadyGreaterRealmWorkerControlState,
  snapshot: readonly DispatchedWorkerSnapshot[],
): boolean {
  return value.value.roster.workers.every((worker, index) => {
    const expected = snapshot[index];
    if (
      !expected
      || worker.workerId !== expected.workerId
      || worker.ordinal !== expected.ordinal
      || worker.revision <= expected.revision
    ) return false;
    return worker.status === 'idle'
      ? worker.resourceKind === undefined && worker.siteId === undefined
      : worker.status === 'returning'
        && worker.resourceKind === expected.resourceKind
        && worker.siteId === expected.siteId;
  });
}

function workersMatchGatheringSnapshot(
  value: ReadyGreaterRealmWorkerControlState,
  snapshot: readonly DispatchedWorkerSnapshot[],
): boolean {
  return value.value.roster.workers.every((worker, index) => {
    const expected = snapshot[index];
    return expected !== undefined
      && worker.workerId === expected.workerId
      && worker.ordinal === expected.ordinal
      && worker.status === 'gathering'
      && worker.resourceKind === expected.resourceKind
      && worker.siteId === expected.siteId
      && worker.revision >= expected.revision
      && worker.accruedAmount > 0n
      && worker.availableAmount > 0n;
  });
}

async function withActionCeiling<Result>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> {
  if (signal.aborted) throw failure('stage-invariant');
  const action = new AbortController();
  const cancel = () => action.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    action.abort();
  }, OWNER_CANARY_ACTION_CEILING_MILLISECONDS);
  try {
    const result = await operation(action.signal);
    if (timedOut) throw failure('action-timeout');
    if (signal.aborted || action.signal.aborted) throw failure('stage-invariant');
    return result;
  } catch (error) {
    if (timedOut) throw failure('action-timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

async function withRecoveryReadCeiling<Result>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> {
  if (signal.aborted) throw failure('stage-invariant');
  const read = new AbortController();
  const cancel = () => read.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    read.abort();
  }, OWNER_CANARY_RECOVERY_READ_CEILING_MILLISECONDS);
  try {
    const result = await operation(read.signal);
    if (timedOut) throw failure('action-timeout');
    if (signal.aborted || read.signal.aborted) throw failure('stage-invariant');
    return result;
  } catch (error) {
    if (timedOut) throw failure('action-timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

async function pollControlState(input: Readonly<{
  authority: OwnerCanaryAuthority;
  signal: AbortSignal;
  policy: OwnerCanaryReviewedPollPolicy;
  plan: PrivateRuntimePlan;
  expectedAtlasId: string;
  minimumObservedAtMicros: bigint;
  earliestObservedAtMicros?: bigint;
  latestObservedAtMicros: bigint;
  accept(value: ReadyGreaterRealmWorkerControlState): boolean;
}>): Promise<ReadyGreaterRealmWorkerControlState> {
  let lastObservedAtMicros = input.minimumObservedAtMicros;
  for (let attempt = 0; attempt < input.policy.maximumAttempts; attempt += 1) {
    const candidate = requireControlState(await withActionCeiling(
      input.signal,
      readSignal => awaitWarpkeepAuthorityOperation(
        () => readWarpkeepGreaterRealmWorkerControlState(
          input.authority.connection,
          input.authority.subjectFid,
        ),
        readSignal,
      ),
    ), input.plan, input.expectedAtlasId);
    const observedAt = stateObservedAt(candidate);
    if (observedAt < lastObservedAtMicros) {
      throw failure('control-state');
    }
    lastObservedAtMicros = observedAt;
    if (observedAt >= input.latestObservedAtMicros) throw failure('poll-exhausted');
    if (
      (input.earliestObservedAtMicros === undefined
        || observedAt >= input.earliestObservedAtMicros)
      && input.accept(candidate)
    ) return candidate;
    if (attempt + 1 >= input.policy.maximumAttempts) break;
    await input.policy.wait(input.policy.intervalMilliseconds, input.signal);
    if (input.signal.aborted) throw failure('stage-invariant');
  }
  throw failure('poll-exhausted');
}

async function readRuntimePlan(
  authority: OwnerCanaryAuthority,
  input: Readonly<{
    evidenceNonce: string;
    reviewedAdmissionPlanDigest: string;
    routeSetCommitment: string;
  }>,
  signal: AbortSignal,
): Promise<PrivateRuntimePlan> {
  const request = Object.freeze({
    evidenceNonce: input.evidenceNonce,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    routeSetCommitment: input.routeSetCommitment,
  });
  const raw = await awaitWarpkeepAuthorityOperation(
    () => authority.connection.procedures.getProductionPlayerCanaryRuntimeV1(request),
    signal,
  );
  const plan = parsePrivateRuntimePlan(raw);
  if (
    plan.reviewedAdmissionPlanDigest !== input.reviewedAdmissionPlanDigest
    || plan.routeSetCommitment !== input.routeSetCommitment
  ) throw failure('runtime-plan');
  return plan;
}

function makePlanBoundary(
  plan: PrivateRuntimePlan,
  evidenceNonce: string,
): OwnerCanaryRuntimePlanBoundary<OwnerCanaryAuthority> {
  return createOwnerCanaryRuntimePlanBoundary(async command => {
    const route = plan.routes[command.ordinal - 1];
    if (!route) throw failure('stage-invariant');
    const operation = command.operation === 'dispatch'
      ? () => dispatchWarpkeepGreaterRealmWorker(
          command.authority.connection,
          route.workerId,
          route.resourceKind,
          route.locationId,
          route.atlasRevision,
          command.idempotencyKey,
        )
      : () => recallWarpkeepProductionPlayerCanaryWorker(
          command.authority.connection,
          plan.reviewedAdmissionPlanDigest,
          evidenceNonce,
          command.ordinal,
        );
    await awaitWarpkeepAuthorityOperation(operation, command.signal);
  });
}

function exactFreshPageRecoveryInput(
  value: unknown,
): OwnerCanaryFreshPageRecoveryInput | undefined {
  if (!exactRecord(value, ['evidenceNonce', 'reviewedAdmissionPlanDigest'])) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const evidenceNonce = descriptors.evidenceNonce?.value;
  const reviewedAdmissionPlanDigest = descriptors.reviewedAdmissionPlanDigest?.value;
  return typeof evidenceNonce === 'string'
    && SHA256.test(evidenceNonce)
    && typeof reviewedAdmissionPlanDigest === 'string'
    && SHA256.test(reviewedAdmissionPlanDigest)
    ? Object.freeze({ evidenceNonce, reviewedAdmissionPlanDigest })
    : undefined;
}

async function runRecallOrFence(
  authority: Readonly<{ connection: WarpkeepConnection }>,
  input: OwnerCanaryFreshPageRecoveryInput,
  signal: AbortSignal,
): Promise<void> {
  const reducer = (authority.connection.reducers as unknown as Readonly<{
    recallProductionPlayerCanaryWorkerV1?: (request: Readonly<{
      reviewedAdmissionPlanDigest: string;
      evidenceNonce: string;
      ordinal: number;
    }>) => Promise<unknown>;
  }>).recallProductionPlayerCanaryWorkerV1;
  if (typeof reducer !== 'function') throw failure('stage-invariant');
  await awaitWarpkeepAuthorityOperation(() => reducer(Object.freeze({
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    evidenceNonce: input.evidenceNonce,
    ordinal: 0,
  })), signal);
}

export function createOwnerCanaryEvidenceRuntime(
  dependencies: OwnerCanaryEvidenceRuntimeDependencies,
): OwnerCanaryRuntime<
  OwnerCanaryAuthority,
  OwnerCanaryRecallRecoveryAuthority,
  OwnerCanaryFreshPageRecoveryAuthority
> {
  if (
    !isExactOwnerCanaryProductionConfig(dependencies.config)
    || typeof dependencies.verifyPrivateSubject !== 'function'
    || (dependencies.acknowledgeSanitizedEvidence !== undefined
      && typeof dependencies.acknowledgeSanitizedEvidence !== 'function')
    || (dependencies.connect !== undefined && typeof dependencies.connect !== 'function')
  ) throw failure('configuration');
  validatePollPolicy(dependencies.pollPolicy);
  const now = dependencies.now ?? Date.now;
  const connect = dependencies.connect ?? connectWarpkeepAuthority;
  type RecoveryRecord = Readonly<{
    boundary: OwnerCanaryRuntimePlanBoundary<OwnerCanaryAuthority>;
    handle: OwnerCanaryRecallRecoveryPlan;
    plan: PrivateRuntimePlan;
    expectedAtlasId: string;
    expectedSubjectFid: number;
    evidenceNonce: string;
    attemptedOrdinals: ReadonlySet<OwnerCanaryCommandOrdinal>;
    preDispatchRevisions: PreDispatchWorkerRevisions;
  }>;
  let mainRunConsumed = false;
  let recoveryState: OwnerCanaryRecoveryState = 'none';
  let recoveryRecord: RecoveryRecord | undefined;
  let authorityLifecyclePoisoned = false;
  let recoveryAuthorityLifecyclePoisoned = false;
  let freshPageRecoveryOnly = false;
  let freshPageRecoverySubjectFid: number | undefined;
  let openMainAuthorityCount = 0;
  const authorityLifecycleAbort = new AbortController();
  const recoveryAuthorityLifecycleAbort = new AbortController();
  const mainAuthorities = new WeakSet<object>();
  const recallRecoveryAuthorities = new WeakSet<object>();
  const freshPageRecoveryAuthorities = new WeakSet<object>();
  const poisonAuthorityLifecycle = () => {
    authorityLifecyclePoisoned = true;
    authorityLifecycleAbort.abort(failure('authority-session'));
  };
  const poisonRecoveryAuthorityLifecycle = () => {
    recoveryAuthorityLifecyclePoisoned = true;
    recoveryState = 'unconfirmed';
    recoveryAuthorityLifecycleAbort.abort(failure('authority-session'));
  };

  const recoveryApi = Object.freeze({
    state: () => recoveryState,
    async recover(
      authority: OwnerCanaryRecallRecoveryAuthority,
      callerSignal: AbortSignal,
    ): Promise<void> {
      const retained = recoveryRecord;
      const signal = AbortSignal.any([
        callerSignal,
        recoveryAuthorityLifecycleAbort.signal,
      ]);
      if (
        !retained
        || (recoveryState !== 'required' && recoveryState !== 'unconfirmed')
        || signal.aborted
        || recoveryAuthorityLifecyclePoisoned
        || !recallRecoveryAuthorities.has(authority)
        || authority.subjectFid !== retained.expectedSubjectFid
      ) throw failure('stage-invariant');
      recoveryState = 'running';
      try {
        if (authorityLifecyclePoisoned) {
          await withActionCeiling(
            signal,
            actionSignal => runRecallOrFence(authority, Object.freeze({
              evidenceNonce: retained.evidenceNonce,
              reviewedAdmissionPlanDigest: retained.plan.reviewedAdmissionPlanDigest,
            }), actionSignal),
          );
          recoveryState = 'unconfirmed';
          throw failure('authority-session');
        }
        const before = requireControlState(await withRecoveryReadCeiling(
          signal,
          readSignal => awaitWarpkeepAuthorityOperation(
            () => readWarpkeepGreaterRealmWorkerControlState(
              authority.connection,
              authority.subjectFid,
            ),
            readSignal,
          ),
        ), retained.plan, retained.expectedAtlasId);
        validateRecoveryControlState(
          before,
          retained.plan,
          retained.attemptedOrdinals,
          retained.preDispatchRevisions,
          true,
        );
        const activeOrdinals = retained.plan.routes
          .filter(route => {
            const worker = before.value.roster.workers[route.ordinal - 1];
            return retained.attemptedOrdinals.has(route.ordinal)
              && (worker?.status === 'outbound' || worker?.status === 'gathering');
          })
          .map(route => route.ordinal);
        let commandFailure: unknown;
        let poisonedRecallOrFenceCompleted = false;
        await withActionCeiling(signal, async actionSignal => {
          if (authorityLifecyclePoisoned) {
            await runRecallOrFence(authority, Object.freeze({
              evidenceNonce: retained.evidenceNonce,
              reviewedAdmissionPlanDigest: retained.plan.reviewedAdmissionPlanDigest,
            }), actionSignal);
            poisonedRecallOrFenceCompleted = true;
            return;
          }
          for (const ordinal of activeOrdinals) {
            if (authorityLifecyclePoisoned) {
              await runRecallOrFence(authority, Object.freeze({
                evidenceNonce: retained.evidenceNonce,
                reviewedAdmissionPlanDigest: retained.plan.reviewedAdmissionPlanDigest,
              }), actionSignal);
              poisonedRecallOrFenceCompleted = true;
              break;
            }
            try {
              await retained.boundary.runRecoveryRecall({
                plan: retained.handle,
                ordinal,
                authority,
                signal: actionSignal,
              });
            } catch (error) {
              commandFailure ??= error;
            }
          }
        });
        if (authorityLifecyclePoisoned) {
          if (!poisonedRecallOrFenceCompleted) {
            await withActionCeiling(
              signal,
              actionSignal => runRecallOrFence(authority, Object.freeze({
                evidenceNonce: retained.evidenceNonce,
                reviewedAdmissionPlanDigest: retained.plan.reviewedAdmissionPlanDigest,
              }), actionSignal),
            );
          }
          recoveryState = 'unconfirmed';
          throw failure('authority-session');
        }
        const after = requireControlState(await withRecoveryReadCeiling(
          signal,
          readSignal => awaitWarpkeepAuthorityOperation(
            () => readWarpkeepGreaterRealmWorkerControlState(
              authority.connection,
              authority.subjectFid,
            ),
            readSignal,
          ),
        ), retained.plan, retained.expectedAtlasId);
        if (stateObservedAt(after) < stateObservedAt(before)) {
          throw failure('control-state');
        }
        validateRecoveryControlState(
          after,
          retained.plan,
          retained.attemptedOrdinals,
          retained.preDispatchRevisions,
          false,
        );
        if (after.value.roster.workers.some((worker, index) => (
          worker.revision < before.value.roster.workers[index]!.revision
        ))) throw failure('control-state');
        if (authorityLifecyclePoisoned) {
          // Fence every reviewed dispatch key before leaving an ambiguous old
          // main connection to repeated admin inspection. This reducer is
          // atomic: it either recalls the exact active canary assignments or
          // commits the permanent no-dispatch marker.
          await withActionCeiling(
            signal,
            actionSignal => runRecallOrFence(authority, Object.freeze({
              evidenceNonce: retained.evidenceNonce,
              reviewedAdmissionPlanDigest: retained.plan.reviewedAdmissionPlanDigest,
            }), actionSignal),
          );
          recoveryState = 'unconfirmed';
          throw failure('authority-session');
        }
        retained.boundary.disposeRecallRecovery(retained.handle);
        recoveryRecord = undefined;
        recoveryState = 'safe';
        // A reducer response may have been lost. Exact post-read safety is the
        // authority for recovery, not whether every invocation returned.
        void commandFailure;
      } catch (error) {
        recoveryState = 'unconfirmed';
        throw error;
      }
    },
  });

  const freshPageRecoveryApi = Object.freeze({
    async recover(
      authority: OwnerCanaryFreshPageRecoveryAuthority,
      candidate: OwnerCanaryFreshPageRecoveryInput,
      callerSignal: AbortSignal,
    ): Promise<void> {
      const input = exactFreshPageRecoveryInput(candidate);
      const signal = AbortSignal.any([
        callerSignal,
        recoveryAuthorityLifecycleAbort.signal,
      ]);
      if (
        !freshPageRecoveryOnly
        || !input
        || signal.aborted
        || recoveryAuthorityLifecyclePoisoned
        || !freshPageRecoveryAuthorities.has(authority)
      ) throw failure('stage-invariant');
      await withActionCeiling(
        signal,
        actionSignal => runRecallOrFence(authority, input, actionSignal),
      );
    },
  });

  return Object.freeze({
    recoveryApi,
    freshPageRecoveryApi,
    verifyPrivateSubject: dependencies.verifyPrivateSubject,
    async openAuthority(
      session: FarcasterOidcSession,
      signal: AbortSignal,
    ): Promise<OwnerCanaryAuthority> {
      if (authorityLifecyclePoisoned || freshPageRecoveryOnly) {
        throw failure('authority-session');
      }
      const observedNow = now();
      const parsed = Number.isSafeInteger(observedNow) && observedNow >= 0
        ? parseFarcasterOidcJwt(session.jwt, {
            issuer: CANONICAL_WARPKEEP_AUTH_ORIGIN,
            audience: DEFAULT_WARPKEEP_OIDC_AUDIENCE,
            now: observedNow,
          })
        : undefined;
      if (
        !parsed
        || parsed.session.issuer !== session.issuer
        || parsed.session.audience !== session.audience
        || parsed.session.expiresAt !== session.expiresAt
      ) throw failure('authority-session');
      let connection: WarpkeepConnection;
      try {
        connection = await connect(
          dependencies.config,
          parsed.session.jwt,
          signal,
          Object.freeze({
            onAuthorityClosureUnconfirmed: poisonAuthorityLifecycle,
          }),
        );
      } catch (error) {
        if (isWarpkeepAuthorityClosureUnconfirmed(error)) {
          poisonAuthorityLifecycle();
        }
        throw error;
      }
      if (signal.aborted || authorityLifecycleAbort.signal.aborted) {
        try {
          await disconnectWarpkeepConfirmed(connection);
        } catch (error) {
          poisonAuthorityLifecycle();
          throw error;
        }
        throw failure('authority-session');
      }
      const authority = Object.freeze({
        connection,
        subjectFid: parsed.claims.fid,
      });
      mainAuthorities.add(authority);
      openMainAuthorityCount += 1;
      return authority;
    },
    closeAuthority: async authority => {
      if (!mainAuthorities.has(authority)) throw failure('authority-session');
      const alreadyPoisoned = authorityLifecyclePoisoned;
      try {
        await disconnectWarpkeepConfirmed(authority.connection);
      } catch (error) {
        poisonAuthorityLifecycle();
        throw error;
      }
      mainAuthorities.delete(authority);
      openMainAuthorityCount -= 1;
      if (alreadyPoisoned || authorityLifecyclePoisoned) {
        throw failure('authority-session');
      }
    },
    async openRecallRecoveryAuthority(
      session: FarcasterOidcSession,
      signal: AbortSignal,
    ): Promise<OwnerCanaryRecallRecoveryAuthority> {
      if (
        recoveryAuthorityLifecyclePoisoned
        || !recoveryRecord
        || (recoveryState !== 'required' && recoveryState !== 'unconfirmed')
      ) throw failure('authority-session');
      const observedNow = now();
      const parsed = Number.isSafeInteger(observedNow) && observedNow >= 0
        ? parseFarcasterOidcJwt(session.jwt, {
            issuer: CANONICAL_WARPKEEP_AUTH_ORIGIN,
            audience: DEFAULT_WARPKEEP_OIDC_AUDIENCE,
            now: observedNow,
          })
        : undefined;
      if (
        !parsed
        || parsed.session.issuer !== session.issuer
        || parsed.session.audience !== session.audience
        || parsed.session.expiresAt !== session.expiresAt
        || parsed.claims.fid !== recoveryRecord.expectedSubjectFid
      ) throw failure('authority-session');
      let connection: WarpkeepConnection;
      try {
        connection = await connect(
          dependencies.config,
          parsed.session.jwt,
          signal,
          Object.freeze({
            onAuthorityClosureUnconfirmed: poisonRecoveryAuthorityLifecycle,
          }),
        );
      } catch (error) {
        if (isWarpkeepAuthorityClosureUnconfirmed(error)) {
          poisonRecoveryAuthorityLifecycle();
        }
        throw error;
      }
      if (signal.aborted || recoveryAuthorityLifecycleAbort.signal.aborted) {
        try {
          await disconnectWarpkeepConfirmed(connection);
        } catch (error) {
          poisonRecoveryAuthorityLifecycle();
          throw error;
        }
        throw failure('authority-session');
      }
      const authority = Object.freeze({
        connection,
        subjectFid: parsed.claims.fid,
        [recallRecoveryAuthorityBrand]: true as const,
      });
      recallRecoveryAuthorities.add(authority);
      return authority;
    },
    closeRecallRecoveryAuthority: async authority => {
      if (!recallRecoveryAuthorities.has(authority)) {
        throw failure('authority-session');
      }
      const alreadyPoisoned = recoveryAuthorityLifecyclePoisoned;
      try {
        await disconnectWarpkeepConfirmed(authority.connection);
      } catch (error) {
        poisonRecoveryAuthorityLifecycle();
        throw error;
      }
      recallRecoveryAuthorities.delete(authority);
      if (alreadyPoisoned || recoveryAuthorityLifecyclePoisoned) {
        poisonRecoveryAuthorityLifecycle();
        throw failure('authority-session');
      }
    },
    async openFreshPageRecoveryAuthority(
      session: FarcasterOidcSession,
      signal: AbortSignal,
    ): Promise<OwnerCanaryFreshPageRecoveryAuthority> {
      if (
        recoveryAuthorityLifecyclePoisoned
        || openMainAuthorityCount !== 0
        || (!freshPageRecoveryOnly && mainRunConsumed)
      ) throw failure('authority-session');
      // This mode is permanent even when parsing, connecting, or the reducer
      // fails. Main evidence and dispatch authority can never follow it.
      freshPageRecoveryOnly = true;
      mainRunConsumed = true;
      const observedNow = now();
      const parsed = Number.isSafeInteger(observedNow) && observedNow >= 0
        ? parseFarcasterOidcJwt(session.jwt, {
            issuer: CANONICAL_WARPKEEP_AUTH_ORIGIN,
            audience: DEFAULT_WARPKEEP_OIDC_AUDIENCE,
            now: observedNow,
          })
        : undefined;
      if (
        !parsed
        || parsed.session.issuer !== session.issuer
        || parsed.session.audience !== session.audience
        || parsed.session.expiresAt !== session.expiresAt
      ) throw failure('authority-session');
      const expectedSubjectFid = freshPageRecoverySubjectFid
        ?? parsed.claims.fid;
      if (parsed.claims.fid !== expectedSubjectFid) {
        throw failure('authority-session');
      }
      // Latch before connection establishment: even a failed first transport
      // cannot be followed by a different owner subject in this page realm.
      freshPageRecoverySubjectFid = expectedSubjectFid;
      let connection: WarpkeepConnection;
      try {
        connection = await connect(
          dependencies.config,
          parsed.session.jwt,
          signal,
          Object.freeze({
            onAuthorityClosureUnconfirmed: poisonRecoveryAuthorityLifecycle,
          }),
        );
      } catch (error) {
        if (isWarpkeepAuthorityClosureUnconfirmed(error)) {
          poisonRecoveryAuthorityLifecycle();
        }
        throw error;
      }
      if (signal.aborted || recoveryAuthorityLifecycleAbort.signal.aborted) {
        try {
          await disconnectWarpkeepConfirmed(connection);
        } catch (error) {
          poisonRecoveryAuthorityLifecycle();
          throw error;
        }
        throw failure('authority-session');
      }
      const authority = Object.freeze({
        connection,
        subjectFid: parsed.claims.fid,
        [freshPageRecoveryAuthorityBrand]: true as const,
      });
      freshPageRecoveryAuthorities.add(authority);
      return authority;
    },
    closeFreshPageRecoveryAuthority: async authority => {
      if (!freshPageRecoveryAuthorities.has(authority)) {
        throw failure('authority-session');
      }
      const alreadyPoisoned = recoveryAuthorityLifecyclePoisoned;
      try {
        await disconnectWarpkeepConfirmed(authority.connection);
      } catch (error) {
        poisonRecoveryAuthorityLifecycle();
        throw error;
      }
      freshPageRecoveryAuthorities.delete(authority);
      if (alreadyPoisoned || recoveryAuthorityLifecyclePoisoned) {
        poisonRecoveryAuthorityLifecycle();
        throw failure('authority-session');
      }
    },
    acceptSanitizedEvidence: async evidence => {
      await dependencies.acknowledgeSanitizedEvidence?.(evidence);
    },
    evidenceApi: Object.freeze({
      async run(
        input: Parameters<OwnerCanaryEvidenceApi<OwnerCanaryAuthority>['run']>[0],
      ): Promise<OwnerCanaryJourneyEvidence> {
        if (mainRunConsumed) throw failure('stage-invariant');
        mainRunConsumed = true;
        let privatePlan: PrivateRuntimePlan | undefined;
        let runtimeSubjectFid: number | undefined;
        let planBoundary: OwnerCanaryRuntimePlanBoundary<OwnerCanaryAuthority> | undefined;
        let planHandle: OwnerCanaryRuntimePlan | undefined;
        let recallRecoveryHandle: OwnerCanaryRecallRecoveryPlan | undefined;
        const attemptedDispatchOrdinals = new Set<OwnerCanaryCommandOrdinal>();
        let completedSafe = false;
        let baseline: ReadyGreaterRealmWorkerControlState | undefined;
        let postDispatch: ReadyGreaterRealmWorkerControlState | undefined;
        let postDispatchWorkers: readonly DispatchedWorkerSnapshot[] | undefined;
        let dispatchObservations: readonly DispatchObservation[] | undefined;
        let preDispatchObservedAtMicros: bigint | undefined;
        let preDispatchWorkerRevisions: PreDispatchWorkerRevisions | undefined;
        let journeyLatestObservedAtMicros: bigint | undefined;
        let postRecall: ReadyGreaterRealmWorkerControlState | undefined;
        let gathered: ReadyGreaterRealmWorkerControlState | undefined;
        let terminal: ReadyGreaterRealmWorkerControlState | undefined;
        let gatheringEvidence: OwnerCanaryJourneyEvidence['gathering'] | undefined;
        const dispatches = OWNER_CANARY_RESOURCE_KINDS.map((resourceKind, index) => Object.freeze({
          ordinal: index + 1,
          resourceKind,
          accepted: true,
        }));
        let replays: readonly [boolean, boolean, boolean, boolean] | undefined;
        const runAuthorityStage = <Result>(
          stage: Parameters<typeof input.runStage>[0],
          operation: (
            authority: OwnerCanaryAuthority,
            signal: AbortSignal,
          ) => Promise<Result>,
        ): Promise<Result> => input.runStage(stage, async (authority, stageSignal) => {
          const signal = AbortSignal.any([
            stageSignal,
            authorityLifecycleAbort.signal,
          ]);
          if (
            signal.aborted
            || !mainAuthorities.has(authority)
            || (runtimeSubjectFid !== undefined
              && authority.subjectFid !== runtimeSubjectFid)
          ) throw failure('authority-session');
          runtimeSubjectFid ??= authority.subjectFid;
          const result = stage === 'gathering' || stage === 'terminal'
            ? await operation(authority, signal)
            : await withActionCeiling(
                signal,
                actionSignal => operation(authority, actionSignal),
              );
          if (authorityLifecycleAbort.signal.aborted) {
            throw failure('authority-session');
          }
          return result;
        });

        try {
          await runAuthorityStage('baseline', async (authority, signal) => {
            privatePlan = await readRuntimePlan(authority, input, signal);
            baseline = requireControlState(await awaitWarpkeepAuthorityOperation(
              () => readWarpkeepGreaterRealmWorkerControlState(
                authority.connection,
                authority.subjectFid,
              ),
              signal,
            ), privatePlan);
            if (!idleControlStateIsClean(baseline)) throw failure('control-state');
          });

          await runAuthorityStage('founder', async (authority, signal) => {
            if (!privatePlan) throw failure('stage-invariant');
            const [admission, agreement, repeatedPlan, control] = await Promise.all([
              awaitWarpkeepAuthorityOperation(
                () => readWarpkeepAdmissionStatus(authority.connection),
                signal,
              ),
              awaitWarpkeepAuthorityOperation(
                () => readWarpkeepEntryAgreementStatus(authority.connection),
                signal,
              ),
              readRuntimePlan(authority, input, signal),
              awaitWarpkeepAuthorityOperation(
                () => readWarpkeepGreaterRealmWorkerControlState(
                  authority.connection,
                  authority.subjectFid,
                ),
                signal,
              ),
            ]);
            const ready = requireControlState(control, privatePlan, baseline?.atlasId);
            if (
              admission !== 'ready'
              || agreement !== true
              || !samePrivatePlan(privatePlan, repeatedPlan)
              || !idleControlStateIsClean(ready)
              || (baseline !== undefined
                && stateObservedAt(ready) < stateObservedAt(baseline))
            ) throw failure('founder-readiness');
          });

          await runAuthorityStage('routes', async (authority, signal) => {
            if (!privatePlan) throw failure('stage-invariant');
            const repeatedPlan = await readRuntimePlan(authority, input, signal);
            if (!samePrivatePlan(privatePlan, repeatedPlan)) throw failure('runtime-plan');
            planBoundary = makePlanBoundary(privatePlan, input.evidenceNonce);
            planHandle = await planBoundary.prepare({
              evidenceNonce: input.evidenceNonce,
              reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
              serverBaselineCommitment: privatePlan.serverBaselineCommitment,
              routeSetCommitment: input.routeSetCommitment,
              expectedCommandSetCommitment: privatePlan.commandSetCommitment,
            });
          });

          await runAuthorityStage('dispatch', async (authority, signal) => {
            if (!privatePlan || !planBoundary || !planHandle) {
              throw failure('stage-invariant');
            }
            const [currentPlan, before] = await Promise.all([
              readRuntimePlan(authority, input, signal),
              awaitWarpkeepAuthorityOperation(
                () => readWarpkeepGreaterRealmWorkerControlState(
                  authority.connection,
                  authority.subjectFid,
                ),
                signal,
              ),
            ]);
            if (!samePrivatePlan(privatePlan, currentPlan)) throw failure('runtime-plan');
            const readyBefore = requireControlState(before, privatePlan, baseline?.atlasId);
            if (
              !idleControlStateIsClean(readyBefore)
              || (baseline !== undefined
                && stateObservedAt(readyBefore) < stateObservedAt(baseline))
            ) throw failure('control-state');
            preDispatchObservedAtMicros = stateObservedAt(readyBefore);
            if (preDispatchObservedAtMicros >= privatePlan.notAfterMicros) {
              throw failure('runtime-plan');
            }
            preDispatchWorkerRevisions = Object.freeze([
              readyBefore.value.roster.workers[0]!.revision,
              readyBefore.value.roster.workers[1]!.revision,
              readyBefore.value.roster.workers[2]!.revision,
              readyBefore.value.roster.workers[3]!.revision,
            ] as const);
            if (preDispatchWorkerRevisions.some(revision => (
              revision > U64_MAX - 4n
            ))) throw failure('control-state');
            const dispatchBaselineRevisions = preDispatchWorkerRevisions;
            const observedDispatches: DispatchObservation[] = [];
            postDispatch = await withActionCeiling(signal, async actionSignal => {
              for (const route of privatePlan!.routes) {
                attemptedDispatchOrdinals.add(route.ordinal);
                try {
                  await planBoundary!.runCommand({
                    plan: planHandle!,
                    operation: 'dispatch',
                    ordinal: route.ordinal,
                    authority,
                    signal: actionSignal,
                  });
                } finally {
                  recallRecoveryHandle ??=
                    planBoundary!.takeRecallRecoveryPlan(planHandle!);
                }
                const observed = requireControlState(await awaitWarpkeepAuthorityOperation(
                  () => readWarpkeepGreaterRealmWorkerControlState(
                    authority.connection,
                    authority.subjectFid,
                  ),
                  actionSignal,
                ), privatePlan, baseline?.atlasId);
                if (
                  stateObservedAt(observed) < preDispatchObservedAtMicros!
                  || stateObservedAt(observed) >= privatePlan!.notAfterMicros
                  || (observedDispatches.length > 0
                    && stateObservedAt(observed)
                      < observedDispatches[observedDispatches.length - 1]!.observedAtMicros)
                ) throw failure('control-state');
                const worker = dispatchedRouteSnapshot(
                  observed,
                  privatePlan!,
                  route.ordinal - 1,
                );
                if (!workerMatchesFreshDispatchRevision(
                  worker,
                  dispatchBaselineRevisions[route.ordinal - 1]!,
                )) throw failure('control-state');
                observedDispatches.push(Object.freeze({
                  worker,
                  observedAtMicros: stateObservedAt(observed),
                }));
              }
              return requireControlState(await awaitWarpkeepAuthorityOperation(
                () => readWarpkeepGreaterRealmWorkerControlState(
                  authority.connection,
                  authority.subjectFid,
                ),
                actionSignal,
              ), privatePlan, baseline?.atlasId);
            });
            if (
              !workersMatchDispatchedRoutes(postDispatch, privatePlan)
              || postDispatch.value.roster.workers.some((worker, index) => (
                !workerMatchesFreshDispatchRevision(
                  worker,
                  dispatchBaselineRevisions[index]!,
                )
              ))
              || preDispatchObservedAtMicros >= privatePlan.notAfterMicros
              || stateObservedAt(postDispatch) < preDispatchObservedAtMicros
              || stateObservedAt(postDispatch) >= privatePlan.notAfterMicros
              || stateObservedAt(postDispatch)
                < observedDispatches[observedDispatches.length - 1]!.observedAtMicros
              || stateObservedAt(postDispatch) - preDispatchObservedAtMicros
                > BigInt(OWNER_CANARY_ACTION_CEILING_MILLISECONDS) * 1_000n
              || observedDispatches.some((observation, index) => {
                const worker = postDispatch!.value.roster.workers[index];
                return worker === undefined
                  || worker.workerId !== observation.worker.workerId
                  || worker.ordinal !== observation.worker.ordinal
                  || worker.resourceKind !== observation.worker.resourceKind
                  || worker.siteId !== observation.worker.siteId
                  || worker.revision < observation.worker.revision
                  || (observation.worker.status === 'outbound'
                    ? worker.status !== 'outbound' && worker.status !== 'gathering'
                    : worker.status !== 'gathering');
              })
            ) throw failure('control-state');
            postDispatchWorkers = dispatchedWorkerSnapshot(postDispatch, privatePlan);
            dispatchObservations = Object.freeze(observedDispatches);
            journeyLatestObservedAtMicros = stateObservedAt(postDispatch);
          });

          await runAuthorityStage('dispatch-replay', async (authority, signal) => {
            if (
              !privatePlan
              || !planBoundary
              || !planHandle
              || !postDispatch
              || !postDispatchWorkers
            ) {
              throw failure('stage-invariant');
            }
            await withActionCeiling(signal, async actionSignal => {
              for (const route of privatePlan!.routes) {
                await planBoundary!.runCommand({
                  plan: planHandle!,
                  operation: 'dispatch',
                  ordinal: route.ordinal,
                  authority,
                  signal: actionSignal,
                });
              }
            });
            const replayed = requireControlState(await awaitWarpkeepAuthorityOperation(
              () => readWarpkeepGreaterRealmWorkerControlState(
                authority.connection,
                authority.subjectFid,
              ),
              signal,
            ), privatePlan, baseline?.atlasId);
            replays = replayMatchesDispatch(replayed, postDispatchWorkers);
            if (stateObservedAt(replayed) < stateObservedAt(postDispatch)) {
              throw failure('control-state');
            }
            journeyLatestObservedAtMicros = stateObservedAt(replayed);
          });

          await runAuthorityStage('gathering', async (authority, signal) => {
            if (
              !privatePlan
              || !postDispatch
              || !postDispatchWorkers
              || !dispatchObservations
              || preDispatchObservedAtMicros === undefined
            ) {
              throw failure('stage-invariant');
            }
            const travelMicros = BigInt(privatePlan.equalRouteSteps)
              * BigInt(OWNER_CANARY_ROUTE_TRAVEL_MILLISECONDS_PER_STEP)
              * 1_000n;
            const earliest = stateObservedAt(postDispatch)
              + travelMicros
              + BigInt(OWNER_CANARY_MINIMUM_GATHERING_MILLISECONDS) * 1_000n;
            const latest = preDispatchObservedAtMicros
              + travelMicros
              + BigInt(OWNER_CANARY_MAXIMUM_GATHERING_MILLISECONDS) * 1_000n;
            if (earliest >= latest) throw failure('stage-invariant');
            const acceptedGathering = await pollControlState({
              authority,
              signal,
              policy: dependencies.pollPolicy,
              plan: privatePlan,
              expectedAtlasId: baseline!.atlasId,
              minimumObservedAtMicros: journeyLatestObservedAtMicros!,
              earliestObservedAtMicros: earliest,
              latestObservedAtMicros: latest,
              accept: candidate => workersMatchGatheringSnapshot(
                candidate,
                postDispatchWorkers!,
              ),
            });
            gathered = acceptedGathering;
            const elapsedByRoute = dispatchObservations.map(observation => Number(
              (stateObservedAt(acceptedGathering) - observation.observedAtMicros - travelMicros)
                / 1_000n,
            ));
            if (elapsedByRoute.some(elapsed => (
              !Number.isSafeInteger(elapsed)
              || elapsed < OWNER_CANARY_MINIMUM_GATHERING_MILLISECONDS
              || elapsed >= OWNER_CANARY_MAXIMUM_GATHERING_MILLISECONDS
            ))) throw failure('stage-invariant');
            if (
              journeyLatestObservedAtMicros !== undefined
              && stateObservedAt(acceptedGathering) < journeyLatestObservedAtMicros
            ) throw failure('control-state');
            journeyLatestObservedAtMicros = stateObservedAt(acceptedGathering);
            gatheringEvidence = Object.freeze(privatePlan.routes.map((route, index) => Object.freeze({
              ordinal: route.ordinal,
              resourceKind: route.resourceKind,
              gatheringElapsedMs: elapsedByRoute[index]!,
              completedQuantumCount: 1,
            })));
          });

          await runAuthorityStage('recall', async (authority, signal) => {
            if (
              !privatePlan
              || !planBoundary
              || !planHandle
              || !gatheringEvidence
              || !gathered
              || preDispatchObservedAtMicros === undefined
              || !postDispatchWorkers
            ) {
              throw failure('stage-invariant');
            }
            const preRecall = requireControlState(
              await awaitWarpkeepAuthorityOperation(
                () => readWarpkeepGreaterRealmWorkerControlState(
                  authority.connection,
                  authority.subjectFid,
                ),
                signal,
              ),
              privatePlan,
              baseline?.atlasId,
            );
            if (
              stateObservedAt(preRecall) < stateObservedAt(gathered)
              || !workersMatchGatheringSnapshot(preRecall, postDispatchWorkers)
            ) throw failure('control-state');
            const preRecallObservedAtMicros = stateObservedAt(preRecall);
            postRecall = await withActionCeiling(signal, async actionSignal => {
              for (const route of privatePlan!.routes) {
                await planBoundary!.runCommand({
                  plan: planHandle!,
                  operation: 'recall',
                  ordinal: route.ordinal,
                  authority,
                  signal: actionSignal,
                });
              }
              return requireControlState(await awaitWarpkeepAuthorityOperation(
                () => readWarpkeepGreaterRealmWorkerControlState(
                  authority.connection,
                  authority.subjectFid,
                ),
                actionSignal,
              ), privatePlan, baseline?.atlasId);
            });
            if (!workersMatchRecallProgress(postRecall, postDispatchWorkers)) {
              throw failure('control-state');
            }
            const recallObservedAt = stateObservedAt(postRecall);
            const recallLatest = preDispatchObservedAtMicros
              + BigInt(privatePlan.equalRouteSteps)
                * BigInt(OWNER_CANARY_ROUTE_TRAVEL_MILLISECONDS_PER_STEP)
                * 1_000n
              + BigInt(OWNER_CANARY_MAXIMUM_GATHERING_MILLISECONDS) * 1_000n;
            if (
              recallObservedAt < preRecallObservedAtMicros
              || recallObservedAt - preRecallObservedAtMicros
                > BigInt(OWNER_CANARY_ACTION_CEILING_MILLISECONDS) * 1_000n
              || (journeyLatestObservedAtMicros !== undefined
                && recallObservedAt < journeyLatestObservedAtMicros)
              || recallObservedAt >= recallLatest
            ) throw failure('control-state');
            journeyLatestObservedAtMicros = recallObservedAt;
          });

          await runAuthorityStage('returning', async (authority, signal) => {
            if (!privatePlan || !postRecall || !postDispatchWorkers) {
              throw failure('stage-invariant');
            }
            const current = requireControlState(await awaitWarpkeepAuthorityOperation(
              () => readWarpkeepGreaterRealmWorkerControlState(
                authority.connection,
                authority.subjectFid,
              ),
              signal,
            ), privatePlan, baseline?.atlasId);
            if (!workersMatchRecallProgress(current, postDispatchWorkers)) {
              throw failure('control-state');
            }
            if (stateObservedAt(current) < stateObservedAt(postRecall)) {
              throw failure('control-state');
            }
            journeyLatestObservedAtMicros = stateObservedAt(current);
          });

          await runAuthorityStage('terminal', async (authority, signal) => {
            if (!privatePlan || !postRecall) throw failure('stage-invariant');
            const travelMicros = BigInt(privatePlan.equalRouteSteps)
              * BigInt(OWNER_CANARY_ROUTE_TRAVEL_MILLISECONDS_PER_STEP)
              * 1_000n;
            terminal = await pollControlState({
              authority,
              signal,
              policy: dependencies.pollPolicy,
              plan: privatePlan,
              expectedAtlasId: baseline!.atlasId,
              minimumObservedAtMicros: journeyLatestObservedAtMicros!,
              latestObservedAtMicros: stateObservedAt(postRecall)
                + travelMicros
                + BigInt(OWNER_CANARY_ACTION_CEILING_MILLISECONDS) * 1_000n,
              accept: allWorkersIdle,
            });
            if (
              stateObservedAt(terminal) < stateObservedAt(postRecall)
              || (journeyLatestObservedAtMicros !== undefined
                && stateObservedAt(terminal) < journeyLatestObservedAtMicros)
              || terminal.atlasId !== baseline?.atlasId
              || terminal.value.roster.workers.some(worker => (
                worker.accruedAmount !== 0n
                || worker.materializedAmount !== 0n
                || worker.availableAmount !== 0n
              ))
              || !pendingResourcesAreZero(terminal)
              || (baseline !== undefined && stateObservedAt(terminal) <= stateObservedAt(baseline))
              || (baseline !== undefined
                && terminal.value.resourceState.revision
                  <= baseline.value.resourceState.revision)
              || postDispatchWorkers?.some((worker, index) => (
                terminal!.value.roster.workers[index]?.revision <= worker.revision
              )) === true
              || (baseline !== undefined && !resourcesDidNotDecrease(baseline, terminal))
            ) throw failure('control-state');
            journeyLatestObservedAtMicros = stateObservedAt(terminal);
          });

          const evidence = await runAuthorityStage('evidence', async (authority, signal) => {
            if (
              !privatePlan
              || !baseline
              || !terminal
              || !gatheringEvidence
              || !replays
              || !postDispatchWorkers
            ) {
              throw failure('stage-invariant');
            }
            const [confirmedPlan, finalControl] = await Promise.all([
              readRuntimePlan(authority, input, signal),
              awaitWarpkeepAuthorityOperation(
                () => readWarpkeepGreaterRealmWorkerControlState(
                  authority.connection,
                  authority.subjectFid,
                ),
                signal,
              ),
            ]);
            if (!samePrivatePlan(privatePlan, confirmedPlan)) throw failure('runtime-plan');
            const confirmedTerminal = requireControlState(
              finalControl,
              privatePlan,
              baseline.atlasId,
            );
            if (
              !allWorkersIdle(confirmedTerminal)
              || confirmedTerminal.atlasId !== baseline.atlasId
              || stateObservedAt(confirmedTerminal) < stateObservedAt(terminal)
              || confirmedTerminal.value.roster.workers.some(worker => (
                worker.accruedAmount !== 0n
                || worker.materializedAmount !== 0n
                || worker.availableAmount !== 0n
              ))
              || !pendingResourcesAreZero(confirmedTerminal)
              || !resourcesDidNotDecrease(baseline, confirmedTerminal)
              || !resourcesDidNotDecrease(terminal, confirmedTerminal)
              || confirmedTerminal.value.resourceState.revision
                < terminal.value.resourceState.revision
              || postDispatchWorkers.some((worker, index) => (
                confirmedTerminal.value.roster.workers[index]?.revision <= worker.revision
              ))
              || confirmedTerminal.value.roster.workers.some((worker, index) => (
                worker.revision < terminal!.value.roster.workers[index]!.revision
              ))
            ) throw failure('control-state');
            return Object.freeze({
              baseline: sanitizedState(baseline),
              terminal: sanitizedState(confirmedTerminal),
              routes: Object.freeze(privatePlan.routes.map(route => Object.freeze({
                resourceKind: route.resourceKind,
                routeLength: route.routeSteps + 1,
                nodeCount: route.nodeCount,
              }))),
              dispatches: Object.freeze(dispatches),
              replays,
              gathering: gatheringEvidence,
            });
          });
          completedSafe = true;
          recoveryState = 'safe';
          return evidence;
        } finally {
          if (planHandle && planBoundary) {
            recallRecoveryHandle ??= planBoundary.takeRecallRecoveryPlan(planHandle);
          }
          if (
            !completedSafe
            && recallRecoveryHandle
            && planBoundary
            && privatePlan
            && baseline
            && preDispatchWorkerRevisions
          ) {
            recoveryRecord = Object.freeze({
              boundary: planBoundary,
              handle: recallRecoveryHandle,
              plan: privatePlan,
              expectedAtlasId: baseline.atlasId,
              expectedSubjectFid: runtimeSubjectFid!,
              evidenceNonce: input.evidenceNonce,
              attemptedOrdinals: new Set(attemptedDispatchOrdinals),
              preDispatchRevisions: preDispatchWorkerRevisions,
            });
            recoveryState = 'required';
          } else if (recallRecoveryHandle && planBoundary) {
            planBoundary.disposeRecallRecovery(recallRecoveryHandle);
          }
          if (planHandle && planBoundary) planBoundary.dispose(planHandle);
          planHandle = undefined;
          planBoundary = undefined;
          privatePlan = undefined;
          runtimeSubjectFid = undefined;
          baseline = undefined;
          preDispatchWorkerRevisions = undefined;
          postDispatch = undefined;
          postDispatchWorkers = undefined;
          dispatchObservations = undefined;
          postRecall = undefined;
          terminal = undefined;
          replays = undefined;
          gatheringEvidence = undefined;
        }
      },
    }),
  });
}
