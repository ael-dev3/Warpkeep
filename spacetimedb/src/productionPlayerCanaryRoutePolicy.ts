import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import { assertCastleWorkerRoster } from './castleWorkerRoster';
import {
  assertGreaterRealmCurrentFounderForFidV1,
  assertGreaterRealmCurrentWorldV1,
} from './greaterRealmCurrentAuthority';
import {
  resolveGreaterRealmResourceLocationV1,
} from './greaterRealmResourceLocationAuthority';
import {
  greaterRealmWorkerRouteStepsWithinBoundV1,
} from './greaterRealmWorkerAuthority';
import { GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION } from './greaterRealmV17Policy';
import type warpkeep from './schema';
import { sha256Hex } from './sha256';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

export const PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_PROFILE =
  'warpkeep-production-player-canary-route-plan-v1';
export const PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION =
  'warpkeep-production-player-canary-command-key-v1';
export const PRODUCTION_PLAYER_CANARY_MAXIMUM_ROUTE_STEPS = 12;
export const PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS = Object.freeze([
  'food', 'wood', 'stone', 'gold',
] as const);

const SHA256 = /^[0-9a-f]{64}$/u;
const WORKER_ID = /^genesis-001-castle-[0-9]+-worker-0[1-4]$/u;
const LOCATION_ID = /^GRL-[A-Z2-7]{26}$/u;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

export type ProductionPlayerCanaryResourceKind =
  typeof PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS[number];

export type ProductionPlayerCanaryRouteV1 = Readonly<{
  ordinal: number;
  workerId: string;
  resourceKind: ProductionPlayerCanaryResourceKind;
  locationId: string;
  atlasRevision: bigint;
  routeSteps: number;
  nodeCount: number;
}>;

export type ProductionPlayerCanaryRoutePlanV1 = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_PROFILE;
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  atlasRevision: bigint;
  equalRouteSteps: number;
  routes: readonly ProductionPlayerCanaryRouteV1[];
}>;

export type ProductionPlayerCanaryCommandV1 = Readonly<{
  ordinal: number;
  dispatchIdempotencyKey: string;
  recallIdempotencyKey: string;
}>;

export type ProductionPlayerCanaryCommandAuthorityV1 = Readonly<{
  commandKeyPolicyVersion:
    typeof PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION;
  commandSetCommitment: string;
  commands: readonly ProductionPlayerCanaryCommandV1[];
}>;

export class ProductionPlayerCanaryRoutePolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProductionPlayerCanaryRoutePolicyError';
  }
}

function fail(code: string): never {
  throw new ProductionPlayerCanaryRoutePolicyError(code);
}

function framed(values: readonly (string | number | bigint | boolean)[]): string {
  return values.map((value) => {
    const text = value.toString();
    return `${new TextEncoder().encode(text).byteLength}:${text}`;
  }).join('|');
}

function requireSha256(value: string, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function requireU64(value: bigint, code: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) fail(code);
  return value;
}

function routeMaterial(route: ProductionPlayerCanaryRouteV1): string {
  return framed([
    route.ordinal,
    route.workerId,
    route.resourceKind,
    route.locationId,
    route.atlasRevision,
    route.routeSteps,
    route.nodeCount,
  ]);
}

function exactRoutes(
  routes: readonly ProductionPlayerCanaryRouteV1[],
): readonly ProductionPlayerCanaryRouteV1[] {
  if (!Array.isArray(routes) || routes.length !== 4) {
    fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
  }
  const result: ProductionPlayerCanaryRouteV1[] = [];
  let commonRouteSteps: number | undefined;
  const locations = new Set<string>();
  for (let index = 0; index < 4; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(routes, index)) {
      fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
    }
    const route = routes[index]!;
    const ordinal = index + 1;
    const resourceKind = PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS[index]!;
    if (
      route === null
      || typeof route !== 'object'
      || route.ordinal !== ordinal
      || route.resourceKind !== resourceKind
      || typeof route.workerId !== 'string'
      || !WORKER_ID.test(route.workerId)
      || typeof route.locationId !== 'string'
      || !LOCATION_ID.test(route.locationId)
      || locations.has(route.locationId)
      || requireU64(route.atlasRevision, 'PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID') < 1n
      || !Number.isSafeInteger(route.routeSteps)
      || route.routeSteps < 1
      || route.routeSteps > PRODUCTION_PLAYER_CANARY_MAXIMUM_ROUTE_STEPS
      || !Number.isSafeInteger(route.nodeCount)
      || route.nodeCount < 1
      || route.nodeCount > GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION
      || (commonRouteSteps !== undefined && route.routeSteps !== commonRouteSteps)
    ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
    commonRouteSteps = route.routeSteps;
    locations.add(route.locationId);
    result.push(Object.freeze({ ...route }));
  }
  if (
    new Set(result.map(route => route.workerId)).size !== 4
    || new Set(result.map(route => route.atlasRevision)).size !== 1
  ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
  return Object.freeze(result);
}

export function productionPlayerCanaryRouteSetCommitmentV1(input: Readonly<{
  evidenceNonce: string;
  reviewedAdmissionPlanDigest: string;
  routes: readonly ProductionPlayerCanaryRouteV1[];
}>): string {
  requireSha256(
    input.evidenceNonce,
    'PRODUCTION_PLAYER_CANARY_ROUTE_COMMITMENT_INVALID',
  );
  requireSha256(
    input.reviewedAdmissionPlanDigest,
    'PRODUCTION_PLAYER_CANARY_ROUTE_COMMITMENT_INVALID',
  );
  const routes = exactRoutes(input.routes);
  return sha256Hex(`${framed([
    'warpkeep.production-player-canary.route-set.v1',
    input.evidenceNonce,
    input.reviewedAdmissionPlanDigest,
    ...routes.map(routeMaterial),
  ])}\n`);
}

function commandKey(input: Readonly<{
  evidenceNonce: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  operation: 'dispatch' | 'recall';
  ordinal: number;
}>): string {
  const digest = sha256Hex(`${framed([
    'warpkeep.production-player-canary.command-key.v1',
    input.evidenceNonce,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
    input.operation,
    input.ordinal,
  ])}\n`);
  const operation = input.operation === 'dispatch' ? 'd' : 'r';
  return `pc1-${operation}${input.ordinal.toString().padStart(2, '0')}-${digest}`;
}

export function productionPlayerCanaryCommandAuthorityV1(input: Readonly<{
  evidenceNonce: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
}>): ProductionPlayerCanaryCommandAuthorityV1 {
  for (const value of [
    input.evidenceNonce,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
  ]) requireSha256(value, 'PRODUCTION_PLAYER_CANARY_COMMAND_AUTHORITY_INVALID');
  const commands = Object.freeze(Array.from({ length: 4 }, (_, index) => {
    const ordinal = index + 1;
    return Object.freeze({
      ordinal,
      dispatchIdempotencyKey: commandKey({ ...input, operation: 'dispatch', ordinal }),
      recallIdempotencyKey: commandKey({ ...input, operation: 'recall', ordinal }),
    });
  }));
  const orderedKeys = commands.flatMap(command => [
    command.dispatchIdempotencyKey,
    command.recallIdempotencyKey,
  ]);
  if (new Set(orderedKeys).size !== 8) {
    fail('PRODUCTION_PLAYER_CANARY_COMMAND_AUTHORITY_INVALID');
  }
  return Object.freeze({
    commandKeyPolicyVersion: PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION,
    commandSetCommitment: sha256Hex(`${framed([
      'warpkeep.production-player-canary.command-set.v1',
      input.evidenceNonce,
      input.reviewedAdmissionPlanDigest,
      input.serverBaselineCommitment,
      input.routeSetCommitment,
      ...orderedKeys,
    ])}\n`),
    commands,
  });
}

type RoutePlannerInput = Readonly<{
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  evidenceNonce: string;
  challengeDigest: string;
  serverBaselineCommitment: string;
  castleId: bigint;
  atlasId: string;
  atlasRevision: bigint;
}>;

type Candidate = Readonly<{
  resourceKind: ProductionPlayerCanaryResourceKind;
  locationId: string;
  routeSteps: number;
  nodeCount: number;
}>;

function expectedNodeCount(
  component: Readonly<Record<string, unknown>>,
  resourceKind: ProductionPlayerCanaryResourceKind,
): number {
  const key = resourceKind === 'food' ? 'expectedFoodNodeCount'
    : resourceKind === 'wood' ? 'expectedWoodNodeCount'
      : resourceKind === 'stone' ? 'expectedStoneNodeCount'
        : 'expectedGoldNodeCount';
  const value = component[key];
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) {
    fail('PRODUCTION_PLAYER_CANARY_ROUTE_CATALOG_INVALID');
  }
  return value as number;
}

function boundedRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= maximum) {
      fail('PRODUCTION_PLAYER_CANARY_ROUTE_CATALOG_OVERSIZED');
    }
    result.push(row);
  }
  return Object.freeze(result);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Pure deterministic selector used by the DB planner and fixed-vector tests. */
export function selectProductionPlayerCanaryEqualRoutesV1(input: Readonly<{
  atlasRevision: bigint;
  workers: readonly Readonly<{ ordinal: number; workerId: string }>[];
  candidates: readonly Candidate[];
}>): readonly ProductionPlayerCanaryRouteV1[] {
  requireU64(input.atlasRevision, 'PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
  if (
    input.atlasRevision < 1n
    || !Array.isArray(input.workers)
    || input.workers.length !== 4
    || !Array.isArray(input.candidates)
  ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
  for (let index = 0; index < 4; index += 1) {
    const worker = input.workers[index];
    if (
      worker === undefined
      || worker.ordinal !== index + 1
      || typeof worker.workerId !== 'string'
      || !WORKER_ID.test(worker.workerId)
    ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_ROSTER_INVALID');
  }
  const candidatesByKind = new Map<ProductionPlayerCanaryResourceKind, Candidate[]>();
  for (const resourceKind of PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS) {
    candidatesByKind.set(resourceKind, []);
  }
  const candidateKeys = new Set<string>();
  for (const candidate of input.candidates) {
    if (
      candidate === null
      || typeof candidate !== 'object'
      || !PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS.includes(candidate.resourceKind)
      || typeof candidate.locationId !== 'string'
      || !LOCATION_ID.test(candidate.locationId)
      || !Number.isSafeInteger(candidate.routeSteps)
      || candidate.routeSteps < 1
      || candidate.routeSteps > PRODUCTION_PLAYER_CANARY_MAXIMUM_ROUTE_STEPS
      || !Number.isSafeInteger(candidate.nodeCount)
      || candidate.nodeCount < 1
      || candidate.nodeCount > GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION
    ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
    const key = `${candidate.resourceKind}:${candidate.locationId}`;
    if (candidateKeys.has(key)) fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INVALID');
    candidateKeys.add(key);
    candidatesByKind.get(candidate.resourceKind)!.push(Object.freeze({ ...candidate }));
  }

  let equalRouteSteps: number | undefined;
  for (let routeSteps = 1;
    routeSteps <= PRODUCTION_PLAYER_CANARY_MAXIMUM_ROUTE_STEPS;
    routeSteps += 1) {
    if (PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS.every(resourceKind => (
      candidatesByKind.get(resourceKind)!.some(candidate => candidate.routeSteps === routeSteps)
    ))) {
      equalRouteSteps = routeSteps;
      break;
    }
  }
  if (equalRouteSteps === undefined) {
    fail('PRODUCTION_PLAYER_CANARY_EQUAL_ROUTE_PLAN_UNAVAILABLE');
  }
  return exactRoutes(PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS.map(
    (resourceKind, index) => {
      const selected = candidatesByKind.get(resourceKind)!
        .filter(candidate => candidate.routeSteps === equalRouteSteps)
        .sort((left, right) => (
          right.nodeCount - left.nodeCount
          || asciiCompare(left.locationId, right.locationId)
        ))[0];
      if (selected === undefined) {
        fail('PRODUCTION_PLAYER_CANARY_EQUAL_ROUTE_PLAN_UNAVAILABLE');
      }
      return Object.freeze({
        ordinal: index + 1,
        workerId: input.workers[index]!.workerId,
        resourceKind,
        locationId: selected.locationId,
        atlasRevision: input.atlasRevision,
        routeSteps: selected.routeSteps,
        nodeCount: selected.nodeCount,
      });
    },
  ));
}

/**
 * Select one immutable, equal-length route for each Worker/resource kind. The
 * server scans only the founder's verified navigation component and uses the
 * exact compound resource index. No caller supplies a location or route.
 */
export function planProductionPlayerCanaryRouteSetV1(
  ctx: WarpkeepReducerContext,
  input: RoutePlannerInput,
): ProductionPlayerCanaryRoutePlanV1 {
  requireU64(input.fid, 'PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INPUT_INVALID');
  requireU64(input.castleId, 'PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INPUT_INVALID');
  requireU64(input.atlasRevision, 'PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INPUT_INVALID');
  for (const value of [
    input.reviewedAdmissionPlanDigest,
    input.evidenceNonce,
    input.challengeDigest,
  ]) requireSha256(value, 'PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INPUT_INVALID');
  if (
    input.fid < 1n
    || input.castleId < 1n
    || input.atlasRevision < 1n
    || input.atlasId.length < 1
    || (input.serverBaselineCommitment !== ''
      && !SHA256.test(input.serverBaselineCommitment))
  ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_INPUT_INVALID');

  const world = assertGreaterRealmCurrentWorldV1(ctx, 'active');
  const founder = assertGreaterRealmCurrentFounderForFidV1(ctx, input.fid);
  const claim = founder.greaterRealmClaim;
  const castle = founder.castle;
  const origin = ctx.db.greaterRealmCellV1.cellKey.find(castle.tileKey);
  const component = origin?.componentKey === undefined
    ? null
    : ctx.db.greaterRealmNavigationComponentV1.componentKey.find(origin.componentKey);
  if (
    founder.source !== 'v17'
    || claim === undefined
    || claim.claimKind !== 'founded'
    || claim.state !== 'active'
    || castle.castleId !== input.castleId
    || castle.ownerFid !== input.fid
    || claim.castleId !== input.castleId
    || claim.atlasId !== input.atlasId
    || claim.activationId !== world.activation.activationId
    || world.atlas.atlasId !== input.atlasId
    || world.atlas.revision !== input.atlasRevision
    || origin === null
    || component === null
    || origin.atlasId !== input.atlasId
    || origin.componentKey !== component.componentKey
    || origin.cellKey !== castle.tileKey
    || origin.atlasQ !== castle.q
    || origin.atlasR !== castle.r
    || origin.tier !== 1
    || !origin.passable
    || component.atlasId !== input.atlasId
    || !component.active
  ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_ROOT_CHANGED');

  const roster = [...assertCastleWorkerRoster(ctx, castle.castleId)]
    .sort((left, right) => left.ordinal - right.ordinal);
  const candidatesByKind = new Map<ProductionPlayerCanaryResourceKind, readonly Candidate[]>();
  for (const resourceKind of PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS) {
    const expected = expectedNodeCount(component, resourceKind);
    const indexed = boundedRows(
      ctx.db.greaterRealmResourceNodeV1.byComponentAndResourceKind.filter([
        component.componentKey,
        resourceKind,
      ]),
      expected + 1,
    );
    if (indexed.length !== expected) {
      fail('PRODUCTION_PLAYER_CANARY_ROUTE_CATALOG_INVALID');
    }
    const locationIds = [...new Set(indexed.map(row => {
      if (
        row.atlasId !== input.atlasId
        || row.componentKey !== component.componentKey
        || row.resourceKind !== resourceKind
      ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_CATALOG_INVALID');
      return row.locationId;
    }))].sort(asciiCompare);
    const candidates: Candidate[] = [];
    for (const locationId of locationIds) {
      const location = resolveGreaterRealmResourceLocationV1(
        ctx,
        input.atlasId,
        locationId,
      );
      if (
        location.componentKey !== component.componentKey
        || location.resourceKind !== resourceKind
        || location.nodeCount < 1
        || location.nodeCount > GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION
      ) fail('PRODUCTION_PLAYER_CANARY_ROUTE_CATALOG_INVALID');
      if (location.destination.cellKey === origin.cellKey) continue;
      const routeSteps = greaterRealmWorkerRouteStepsWithinBoundV1(
        ctx,
        input.atlasId,
        component.componentKey,
        component.rootCellKey,
        origin,
        location.destination,
        PRODUCTION_PLAYER_CANARY_MAXIMUM_ROUTE_STEPS,
      );
      if (routeSteps === undefined) continue;
      candidates.push(Object.freeze({
        resourceKind,
        locationId,
        routeSteps,
        nodeCount: location.nodeCount,
      }));
    }
    candidatesByKind.set(resourceKind, Object.freeze(candidates));
  }

  const routes = selectProductionPlayerCanaryEqualRoutesV1({
    atlasRevision: input.atlasRevision,
    workers: roster.map(worker => ({
      ordinal: worker.ordinal,
      workerId: worker.workerId,
    })),
    candidates: PRODUCTION_PLAYER_CANARY_RESOURCE_KINDS.flatMap(
      resourceKind => candidatesByKind.get(resourceKind)!,
    ),
  });
  const routeSetCommitment = productionPlayerCanaryRouteSetCommitmentV1({
    evidenceNonce: input.evidenceNonce,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    routes,
  });
  return Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_ROUTE_PLAN_PROFILE,
    challengeDigest: input.challengeDigest,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: input.serverBaselineCommitment,
    routeSetCommitment,
    atlasRevision: input.atlasRevision,
    equalRouteSteps: routes[0]!.routeSteps,
    routes,
  });
}

export function productionPlayerCanaryRoutePolicyErrorCode(
  error: unknown,
): string | undefined {
  return error instanceof ProductionPlayerCanaryRoutePolicyError
    ? error.code
    : undefined;
}
