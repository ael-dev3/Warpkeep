import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
} from './castleWorkerPolicy';
import type {
  GreaterRealmIndexedPublicReadAuthorityV1,
} from './greaterRealmPublicReadAuthority';
import { GREATER_REALM_CASTLE_CAPACITY } from './greaterRealmV17Policy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

export class GreaterRealmWorkerReadAuthorityError extends Error {
  constructor(readonly code = 'GREATER_REALM_WORKER_CONTROL_UNAVAILABLE') {
    super(code);
    this.name = 'GreaterRealmWorkerReadAuthorityError';
  }
}

function fail(): never {
  throw new GreaterRealmWorkerReadAuthorityError();
}

function sameTimestamp(
  left: { microsSinceUnixEpoch: bigint } | undefined,
  right: { microsSinceUnixEpoch: bigint } | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.microsSinceUnixEpoch === right.microsSinceUnixEpoch;
}

/** Exact O(1) Worker roots layered on the Worker-independent public-read gate. */
export function assertGreaterRealmWorkerReadRootsV2(
  ctx: WarpkeepReducerContext,
  authority: GreaterRealmIndexedPublicReadAuthorityV1 | undefined,
) {
  if (authority === undefined) fail();
  const { activation, atlas } = authority;
  const worker = ctx.db.realmWorkerSystemV2.atlasId.find(activation.atlasId);
  const workerV1 = ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001');
  const expectedCastleCount = activation.snapshotCastleCount
    + activation.postCanaryFoundingCount;
  const expectedWorkerCount = expectedCastleCount * CASTLE_WORKERS_PER_CASTLE;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const workerV1CreatedAt = workerV1?.createdAt.microsSinceUnixEpoch;
  const workerV1ActivatedAt = workerV1?.activatedAt?.microsSinceUnixEpoch;
  if (
    worker === null
    || workerV1 === null
    || ctx.db.realmWorkerSystemV2.count() !== 1n
    || ctx.db.realmWorkerSystemV1.count() !== 1n
    || !Number.isSafeInteger(expectedCastleCount)
    || expectedCastleCount < 0
    || expectedCastleCount > GREATER_REALM_CASTLE_CAPACITY
    || !Number.isSafeInteger(expectedWorkerCount)
    || expectedWorkerCount !== expectedCastleCount * CASTLE_WORKERS_PER_CASTLE
    || ctx.db.castleWorkerV1.count() !== BigInt(expectedWorkerCount)
    || worker.atlasId !== activation.atlasId
    || atlas.mode !== activation.mode
    || worker.mode !== activation.mode
    || worker.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || worker.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || worker.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || worker.currentCastleCount !== expectedCastleCount
    || worker.currentWorkerCount !== expectedWorkerCount
    || !sameTimestamp(worker.createdAt, activation.canaryAt)
    || !sameTimestamp(worker.activatedAt, activation.activatedAt)
    || workerV1.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || workerV1.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || workerV1.expectedCastleCount !== expectedCastleCount
    || workerV1.expectedWorkerCount !== expectedWorkerCount
    || workerV1.mode !== 'active'
    || workerV1.legacyDrainRequired
    || typeof workerV1CreatedAt !== 'bigint'
    || typeof workerV1ActivatedAt !== 'bigint'
    || workerV1CreatedAt < 0n
    || workerV1ActivatedAt < workerV1CreatedAt
    || workerV1ActivatedAt > now
    || workerV1.rosterDigest !== worker.rosterDigest
    || !/^[0-9a-f]{16}$/u.test(worker.rosterDigest)
    || (activation.mode !== 'canary'
      && activation.mode !== 'active'
      && activation.mode !== 'halted')
  ) fail();
  return Object.freeze({ atlas, worker });
}
