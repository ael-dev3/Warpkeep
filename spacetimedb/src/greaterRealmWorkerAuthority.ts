import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  advanceGreaterRealmPostCanaryCounterV1,
  greaterRealmActivationPolicyErrorCode,
  parseGreaterRealmPublicCapacityLeaseV1,
  selectGreaterRealmPublicCapacityLeaseV1,
} from './greaterRealmActivationPolicy';
import {
  currentGreaterRealmActivationRowV1,
  greaterRealmActivationCheckpointFromRowV1,
  greaterRealmActivationStateErrorCode,
} from './greaterRealmActivationState';
import {
  assertGreaterRealmCurrentWorldV1,
  assertGreaterRealmCurrentFounderForFidV1,
  greaterRealmCurrentAuthorityErrorCode,
} from './greaterRealmCurrentAuthority';
import {
  GREATER_REALM_MAX_ROUTE_DEPTH,
  GREATER_REALM_PUBLIC_REGIONS,
} from './greaterRealmV17Policy';
import {
  greaterRealmResourceLocationAuthorityErrorCode,
  resolveGreaterRealmResourceLocationV1,
} from './greaterRealmResourceLocationAuthority';
import {
  formatGreaterRealmWorkerDispatchReceiptKindV2,
  greaterRealmWorkerCapacityDigestV1,
  greaterRealmWorkerDispatchFingerprintV2,
  greaterRealmWorkerPolicyErrorCode,
  parseGreaterRealmWorkerDispatchReceiptKindV2,
} from './greaterRealmWorkerPolicy';
import { workerNodeKey } from './castleWorkerPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>
>;
type WorkerReceiptRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['workerCommandIdempotencyV1']['requestKey']['find']>
>;
type CellRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['greaterRealmCellV1']['cellKey']['find']>
>;

const AXIAL_DIRECTIONS = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([1, -1]), Object.freeze([0, -1]),
  Object.freeze([-1, 0]), Object.freeze([-1, 1]), Object.freeze([0, 1]),
] as const);

export class GreaterRealmWorkerAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmWorkerAuthorityError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmWorkerAuthorityError(code);
}

function translatePolicyError(error: unknown): never {
  const code = greaterRealmWorkerPolicyErrorCode(error)
    ?? greaterRealmCurrentAuthorityErrorCode(error)
    ?? greaterRealmActivationPolicyErrorCode(error)
    ?? greaterRealmActivationStateErrorCode(error)
    ?? greaterRealmResourceLocationAuthorityErrorCode(error);
  if (code !== undefined) fail(code);
  throw error;
}

function sameTimestamp(
  left: { microsSinceUnixEpoch: bigint } | undefined,
  right: { microsSinceUnixEpoch: bigint } | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.microsSinceUnixEpoch === right.microsSinceUnixEpoch;
}

export type GreaterRealmWorkerDispatchInputV2 = Readonly<{
  fid: bigint;
  castle: CastleRow;
  workerId: string;
  resourceKind: string;
  locationId: string;
  expectedRevision: bigint;
  idempotencyKey: string;
}>;

export type GreaterRealmWorkerDispatchTargetV2 = Readonly<{
  activationId: string;
  atlasId: string;
  atlasRevision: bigint;
  priorDispatchCount: number;
  leaseId: string;
  locationId: string;
  nodeCount: number;
  capacityDigest: string;
  routeSteps: number;
  receiptKind: string;
}>;

export type GreaterRealmWorkerReplayV2 = Readonly<{
  leaseId: string;
  locationId: string;
  nodeCount: number;
  capacityDigest: string;
}>;

export function validateGreaterRealmWorkerDispatchInputV2(
  input: GreaterRealmWorkerDispatchInputV2,
): string {
  try {
    return greaterRealmWorkerDispatchFingerprintV2({
      fid: input.fid,
      castleId: input.castle.castleId,
      workerId: input.workerId,
      resourceKind: input.resourceKind,
      locationId: input.locationId,
      expectedRevision: input.expectedRevision,
    });
  } catch (error) {
    return translatePolicyError(error);
  }
}

/**
 * Resolve a terminal receipt before reading the live capacity group. The
 * receipt contains the public lease, a private capacity-group commitment, and
 * a fingerprint of authenticated/public command inputs. The commitment never
 * crosses the private receipt boundary.
 */
export function replayGreaterRealmWorkerDispatchV2(
  receipt: WorkerReceiptRow,
  input: GreaterRealmWorkerDispatchInputV2,
  validatedFingerprint = validateGreaterRealmWorkerDispatchInputV2(input),
): GreaterRealmWorkerReplayV2 {
  try {
    const metadata = parseGreaterRealmWorkerDispatchReceiptKindV2(receipt.commandKind);
    if (
      receipt.fid !== input.fid
      || receipt.workerId !== input.workerId
      || receipt.resourceKind !== input.resourceKind
      || receipt.siteId === undefined
      || receipt.assignmentId === undefined
      || metadata.expectedRevision !== input.expectedRevision
      || metadata.fingerprint !== validatedFingerprint
    ) fail('WORKER_IDEMPOTENCY_CONFLICT');
    const prior = parseGreaterRealmPublicCapacityLeaseV1({
      leaseId: receipt.siteId,
      nodeCount: metadata.nodeCount,
    });
    if (prior.locationId !== input.locationId) fail('WORKER_IDEMPOTENCY_CONFLICT');
    const selected = selectGreaterRealmPublicCapacityLeaseV1({
      locationId: input.locationId,
      nodeCount: metadata.nodeCount,
      capacityDigest: metadata.capacityDigest,
      occupiedCapacityOrdinals: [],
      priorReceipt: {
        leaseId: receipt.siteId,
        nodeCount: metadata.nodeCount,
        capacityDigest: metadata.capacityDigest,
      },
    });
    if (selected.result !== 'unchanged' || selected.leaseId !== receipt.siteId) {
      fail('WORKER_IDEMPOTENCY_STALE');
    }
    return Object.freeze({
      leaseId: selected.leaseId,
      locationId: selected.locationId,
      nodeCount: selected.nodeCount,
      capacityDigest: selected.capacityDigest,
    });
  } catch (error) {
    if (error instanceof GreaterRealmWorkerAuthorityError) throw error;
    return translatePolicyError(error);
  }
}

function parentCell(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  atlasId: string,
  componentKey: string,
  row: CellRow,
): CellRow | null {
  if (row.routeDepth === undefined || row.routeDepth === 0) return null;
  if (
    row.routeDepth > GREATER_REALM_MAX_ROUTE_DEPTH
    || row.routeParentDirection === undefined
    || row.routeParentDirection > 5
    || (row.sealedBoundaryMask & (1 << row.routeParentDirection)) !== 0
  ) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  const direction = AXIAL_DIRECTIONS[row.routeParentDirection];
  if (direction === undefined) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  const parent = ctx.db.greaterRealmCellV1.atlasCoordKey.find(
    `A:${row.atlasQ + direction[0]}:${row.atlasR + direction[1]}`,
  );
  if (
    parent === null
    || parent.atlasId !== atlasId
    || parent.componentKey !== componentKey
    || parent.tier !== 1
    || !parent.passable
    || parent.routeDepth !== row.routeDepth - 1
  ) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  return parent;
}

function routeChain(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  atlasId: string,
  componentKey: string,
  start: CellRow,
  rootCellKey: string,
): readonly CellRow[] {
  if (
    start.atlasId !== atlasId
    || start.componentKey !== componentKey
    || start.tier !== 1
    || !start.passable
    || start.routeDepth === undefined
    || start.routeDepth > GREATER_REALM_MAX_ROUTE_DEPTH
  ) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  const chain: CellRow[] = [];
  let current: CellRow | null = start;
  while (current !== null) {
    if (
      chain.length > GREATER_REALM_MAX_ROUTE_DEPTH
      || current.routeDepth !== start.routeDepth - chain.length
    ) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
    chain.push(current);
    if (current.routeDepth === 0) break;
    current = parentCell(ctx, atlasId, componentKey, current);
  }
  const root = chain[chain.length - 1];
  if (
    root === undefined
    || root.routeDepth !== 0
    || root.routeParentDirection !== undefined
    || root.cellKey !== rootCellKey
  ) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  return Object.freeze(chain);
}

/** Exact tree distance in edges through the verified bounded parent/LCA authority. */
export function greaterRealmWorkerRouteStepsV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  atlasId: string,
  componentKey: string,
  rootCellKey: string,
  origin: CellRow,
  destination: CellRow,
): number {
  const originChain = routeChain(ctx, atlasId, componentKey, origin, rootCellKey);
  const destinationChain = routeChain(ctx, atlasId, componentKey, destination, rootCellKey);
  const originIndexes = new Map(originChain.map((cell, index) => [cell.cellKey, index]));
  let routeSteps: number | undefined;
  for (let index = 0; index < destinationChain.length; index += 1) {
    const originIndex = originIndexes.get(destinationChain[index]!.cellKey);
    if (originIndex !== undefined) {
      routeSteps = originIndex + index;
      break;
    }
  }
  if (
    routeSteps === undefined
    || routeSteps <= 0
    || routeSteps > GREATER_REALM_MAX_ROUTE_DEPTH * 2
  ) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  return routeSteps;
}

type BoundedRouteCell = Pick<
  CellRow,
  | 'cellKey' | 'atlasId' | 'componentKey' | 'tier' | 'passable'
  | 'routeDepth' | 'routeParentDirection' | 'sealedBoundaryMask'
  | 'atlasQ' | 'atlasR'
>;

/**
 * Exact parent-tree distance with work bounded by `maximumSteps`. Unlike the
 * general route projection this never walks either branch to a potentially
 * 4,096-deep root before rejecting a short canary route.
 */
export function greaterRealmWorkerRouteStepsWithinBoundV1(
  ctx: Pick<WarpkeepReducerContext, 'db'>,
  atlasId: string,
  componentKey: string,
  rootCellKey: string,
  origin: CellRow,
  destination: CellRow,
  maximumSteps: number,
): number | undefined {
  if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1) {
    fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  }
  const root = ctx.db.greaterRealmCellV1.cellKey.find(rootCellKey);
  if (root === null) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  for (const row of [root, origin, destination]) {
    if (
      row.atlasId !== atlasId
      || row.componentKey !== componentKey
      || row.tier !== 1
      || !row.passable
      || row.routeDepth === undefined
      || row.routeDepth > GREATER_REALM_MAX_ROUTE_DEPTH
    ) fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  }
  if (root.routeDepth !== 0 || root.routeParentDirection !== undefined) {
    fail('GREATER_REALM_WORKER_ROUTE_INVALID');
  }
  if (origin.cellKey === destination.cellKey) return undefined;

  let left: BoundedRouteCell = origin;
  let right: BoundedRouteCell = destination;
  let distance = 0;
  while (left.routeDepth! > right.routeDepth!) {
    if (distance >= maximumSteps) return undefined;
    const next = parentCell(ctx, atlasId, componentKey, left as CellRow);
    if (next === null) return undefined;
    left = next;
    distance += 1;
  }
  while (right.routeDepth! > left.routeDepth!) {
    if (distance >= maximumSteps) return undefined;
    const next = parentCell(ctx, atlasId, componentKey, right as CellRow);
    if (next === null) return undefined;
    right = next;
    distance += 1;
  }
  while (left.cellKey !== right.cellKey) {
    if (distance + 2 > maximumSteps) return undefined;
    const leftParent = parentCell(ctx, atlasId, componentKey, left as CellRow);
    const rightParent = parentCell(ctx, atlasId, componentKey, right as CellRow);
    if (leftParent === null || rightParent === null) return undefined;
    left = leftParent;
    right = rightParent;
    distance += 2;
  }
  return distance > 0 ? distance : undefined;
}

function requireActiveDispatchRoots(
  ctx: WarpkeepReducerContext,
  input: GreaterRealmWorkerDispatchInputV2,
) {
  let founder;
  let currentWorld;
  try {
    currentWorld = assertGreaterRealmCurrentWorldV1(ctx, 'active');
    founder = assertGreaterRealmCurrentFounderForFidV1(ctx, input.fid);
  } catch (error) {
    return translatePolicyError(error);
  }
  const { activation, release, atlas } = currentWorld;
  const checkpoint = greaterRealmActivationCheckpointFromRowV1(activation);
  if (
    founder.source !== 'v17'
    || founder.castle.castleId !== input.castle.castleId
    || founder.castle.ownerFid !== input.fid
    || checkpoint.phase !== 'active'
    || !checkpoint.everActive
    || release.atlasId !== activation.atlasId
    || release.state !== 'active'
    || atlas.atlasId !== activation.atlasId
    || atlas.revision !== input.expectedRevision
    || atlas.mode !== 'active'
    || !sameTimestamp(atlas.activatedAt, activation.activatedAt)
  ) fail('GREATER_REALM_WORKER_NOT_ACTIVE');
  return Object.freeze({ founder, activation, release, atlas });
}

export function resolveGreaterRealmWorkerDispatchTargetV2(
  ctx: WarpkeepReducerContext,
  input: GreaterRealmWorkerDispatchInputV2,
  validatedFingerprint = validateGreaterRealmWorkerDispatchInputV2(input),
): GreaterRealmWorkerDispatchTargetV2 {
  const { founder, activation, release, atlas } = requireActiveDispatchRoots(ctx, input);
  let resolved: ReturnType<typeof resolveGreaterRealmResourceLocationV1>;
  try {
    resolved = resolveGreaterRealmResourceLocationV1(
      ctx,
      activation.atlasId,
      input.locationId,
    );
  } catch (error) {
    return translatePolicyError(error);
  }
  const rows = resolved.rows;
  const first = rows[0]!;
  if (resolved.resourceKind !== input.resourceKind) {
    fail('GREATER_REALM_WORKER_LOCATION_INTEGRITY');
  }
  if (
    release.expectedResourceNodeCount <= 0
    || ctx.db.greaterRealmResourceNodeV1.count()
      !== BigInt(release.expectedResourceNodeCount)
  ) fail('GREATER_REALM_WORKER_RESOURCE_ROOT_INVALID');
  const component = resolved.component;
  const destination = resolved.destination;
  const origin = ctx.db.greaterRealmCellV1.cellKey.find(founder.castle.tileKey);
  if (
    origin === null
    || !GREATER_REALM_PUBLIC_REGIONS.some(candidate => candidate.id === first.regionId)
    || component.componentKey !== first.componentKey
    || origin.atlasId !== activation.atlasId
    || origin.cellKey !== founder.castle.tileKey
    || origin.componentKey !== first.componentKey
    || origin.tier !== 1
    || !origin.passable
  ) fail('GREATER_REALM_WORKER_LOCATION_INTEGRITY');

  const capacityDigest = greaterRealmWorkerCapacityDigestV1({
    atlasId: activation.atlasId,
    atlasRevision: atlas.revision,
    locationId: input.locationId,
    cellKey: first.cellKey,
    regionId: first.regionId,
    componentKey: first.componentKey,
    resourceKind: first.resourceKind,
    tier: first.tier,
    policyVersion: first.policyVersion,
    nodeCount: rows.length,
  });
  const occupiedCapacityOrdinals: number[] = [];
  for (let capacityOrdinal = 1; capacityOrdinal <= rows.length; capacityOrdinal += 1) {
    const leaseId = `${input.locationId}:${capacityOrdinal}`;
    if (
      ctx.db.workerNodeOccupationV1.nodeKey.find(
        workerNodeKey(input.resourceKind, leaseId),
      ) !== null
    ) occupiedCapacityOrdinals.push(capacityOrdinal);
  }
  const selected = selectGreaterRealmPublicCapacityLeaseV1({
    locationId: input.locationId,
    nodeCount: rows.length,
    capacityDigest,
    occupiedCapacityOrdinals,
    priorReceipt: null,
  });
  if (selected.result !== 'allocated') fail('GREATER_REALM_WORKER_CAPACITY_INVALID');
  const routeSteps = greaterRealmWorkerRouteStepsV1(
    ctx,
    activation.atlasId,
    component.componentKey,
    component.rootCellKey,
    origin,
    destination,
  );
  return Object.freeze({
    activationId: activation.activationId,
    atlasId: activation.atlasId,
    atlasRevision: atlas.revision,
    priorDispatchCount: activation.postCanaryDispatchCount,
    leaseId: selected.leaseId,
    locationId: selected.locationId,
    nodeCount: selected.nodeCount,
    capacityDigest: selected.capacityDigest,
    routeSteps,
    receiptKind: formatGreaterRealmWorkerDispatchReceiptKindV2({
      expectedRevision: atlas.revision,
      nodeCount: selected.nodeCount,
      capacityDigest: selected.capacityDigest,
      fingerprint: validatedFingerprint,
    }),
  });
}

/** Advance only the private lifetime dispatch counter after a fresh graph write. */
export function advanceGreaterRealmWorkerDispatchCounterV1(
  ctx: WarpkeepReducerContext,
  target: GreaterRealmWorkerDispatchTargetV2,
): void {
  const row = currentGreaterRealmActivationRowV1(ctx);
  if (
    row === undefined
    || row.activationId !== target.activationId
    || row.atlasId !== target.atlasId
    || row.mode !== 'active'
    || row.postCanaryDispatchCount !== target.priorDispatchCount
  ) fail('GREATER_REALM_WORKER_ACTIVATION_CHANGED');
  const next = advanceGreaterRealmPostCanaryCounterV1(
    greaterRealmActivationCheckpointFromRowV1(row),
    'dispatch',
  );
  ctx.db.greaterRealmActivationV1.activationId.update({
    ...row,
    postCanaryDispatchCount: next.postCanaryDispatchCount,
  });
  const updated = currentGreaterRealmActivationRowV1(ctx);
  if (
    updated === undefined
    || updated.activationId !== row.activationId
    || updated.postCanaryDispatchCount !== row.postCanaryDispatchCount + 1
    || updated.postCanaryFoundingCount !== row.postCanaryFoundingCount
    || updated.nextAllocationSequence !== row.nextAllocationSequence
  ) fail('GREATER_REALM_WORKER_COUNTER_POSTCONDITION');
}

export function greaterRealmWorkerAuthorityErrorCode(error: unknown): string | undefined {
  return error instanceof GreaterRealmWorkerAuthorityError ? error.code : undefined;
}
