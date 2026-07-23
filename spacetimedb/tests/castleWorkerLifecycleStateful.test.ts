import assert from 'node:assert/strict';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

import type * as CastleWorkerAuthority from '../src/castleWorkerAuthority';
import type * as CastleWorkerRolloutAuthority from '../src/castleWorkerRolloutAuthority';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
  workerResourcePolicy,
} from '../src/castleWorkerPolicy';
import {
  ensureCastleWorkerRoster,
  expectedWorkerRowsForCastle,
} from '../src/castleWorkerRoster';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
} from '../src/goldSitePolicy';
import {
  SNAP_MARK_POLICY_VERSION,
} from '../src/marksAuthorityPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  REALM_RESOURCE_QUANTUM_MICROS,
} from '../src/resourceAuthorityPolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  canonicalMetaForKey,
  canonicalTileForKey,
} from '../src/world';

const sdkRuntimeStub: Plugin = {
  name: 'warpkeep-spacetimedb-test-runtime',
  setup(buildContext) {
    buildContext.onResolve(
      { filter: /^spacetimedb(?:\/server)?$/ },
      args => ({
        path: args.path,
        namespace: 'warpkeep-spacetimedb-test-runtime',
      }),
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: 'warpkeep-spacetimedb-test-runtime' },
      args => ({
        loader: 'js',
        contents: args.path === 'spacetimedb'
          ? `
              export const ScheduleAt = Object.freeze({
                time(microsSinceUnixEpoch) {
                  return Object.freeze({
                    tag: 'Time',
                    value: Object.freeze({ microsSinceUnixEpoch }),
                  });
                },
              });
            `
          : `
              export class SenderError extends Error {
                constructor(message) {
                  super(message);
                  this.name = 'SenderError';
                }
              }
            `,
      }),
    );
  },
};

async function loadExactProductionModule<Module>(
  sourceUrl: URL,
): Promise<Module> {
  const sourcePath = fileURLToPath(sourceUrl);
  const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
  const result = await build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    entryPoints: [sourcePath],
    format: 'esm',
    logLevel: 'silent',
    metafile: true,
    platform: 'node',
    plugins: [sdkRuntimeStub],
    target: 'node22',
    treeShaking: true,
    write: false,
  });
  assert.equal(result.outputFiles.length, 1);
  const exactInput = relative(repositoryRoot, sourcePath)
    .split(sep)
    .join('/');
  assert.ok(
    Object.hasOwn(result.metafile.inputs, exactInput),
    `bundle did not include exact production source ${sourcePath}`,
  );
  const encoded = Buffer.from(result.outputFiles[0]!.contents).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`) as Promise<Module>;
}

const {
  dispatchCastleWorker,
  inspectCastleWorkerGraph,
  recallAllCastleWorkers,
  recallCastleWorker,
  runCastleWorkerSchedule,
} = await loadExactProductionModule<typeof CastleWorkerAuthority>(
  new URL('../src/castleWorkerAuthority.ts', import.meta.url),
);
const {
  inspectWorkerRollout,
  stageWorkerSystem,
} = await loadExactProductionModule<typeof CastleWorkerRolloutAuthority>(
  new URL('../src/castleWorkerRolloutAuthority.ts', import.meta.url),
);

type AnyRow = Record<string, any>;
type WorkerContext = Parameters<typeof dispatchCastleWorker>[0];
type WorkerCastle = Parameters<typeof dispatchCastleWorker>[1]['castle'];

function timestamp(microsSinceUnixEpoch: bigint) {
  return { microsSinceUnixEpoch };
}

function countOnly() {
  return { count: () => 0n };
}

function legacyExpeditionTable() {
  return {
    count: () => 0n,
    fid: { find: () => null },
  };
}

function legacyOccupationTable() {
  return {
    count: () => 0n,
    siteId: { find: () => null },
  };
}

function makeLifecycleFixture() {
  const fid = 77_001n;
  const castleId = 1n;
  const startedAtMicros = 1_900_000_000_000_000n;
  let activatedAtMicros = startedAtMicros;
  const slot = CANONICAL_CASTLE_SLOTS[0]!;
  const castle = {
    castleId,
    ownerFid: fid,
    tileKey: slot.tileKey,
    q: slot.q,
    r: slot.r,
    level: 1,
    name: 'Lifecycle Keep',
    createdAt: timestamp(startedAtMicros),
  };
  const sites = CANONICAL_TIER_I_GOLD_SITES_V1.slice(
    0,
    CASTLE_WORKERS_PER_CASTLE,
  );
  assert.equal(sites.length, CASTLE_WORKERS_PER_CASTLE);

  const workers = new Map<string, AnyRow>(
    expectedWorkerRowsForCastle(castle)
      .map(row => [row.workerId, { ...row }] as const),
  );
  const assignments = new Map<string, AnyRow>();
  const occupations = new Map<string, AnyRow>();
  const receipts = new Map<string, AnyRow>();
  const schedules = new Map<bigint, AnyRow>();
  let nextScheduleId = 1n;
  let nextAssignmentId = 1;
  let account: AnyRow = {
    fid,
    castleId,
    realmId: CANONICAL_REALM.realmId,
    food: 0n,
    wood: 0n,
    stone: 0n,
    gold: 0n,
    settledThroughMicros: startedAtMicros,
    revision: 0n,
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    createdAt: timestamp(startedAtMicros),
    updatedAt: timestamp(startedAtMicros),
  };

  const worldTiles = new Map<string, AnyRow>();
  const worldMeta = new Map<string, AnyRow>();
  const castleTile = canonicalTileForKey(slot.tileKey)!;
  worldTiles.set(slot.tileKey, {
    ...castleTile,
    occupantCastleId: castleId,
  });
  worldMeta.set(slot.tileKey, canonicalMetaForKey(slot.tileKey)!);
  for (const site of sites) {
    const key = `${site.q},${site.r}`;
    worldTiles.set(key, {
      ...canonicalTileForKey(key)!,
      occupantCastleId: undefined,
    });
    worldMeta.set(key, canonicalMetaForKey(key)!);
  }

  const ctx: AnyRow = {
    timestamp: timestamp(startedAtMicros),
    newUuidV7: () => ({
      toString: () => `assignment-${nextAssignmentId++}`,
    }),
    db: {
      realmWorkerSystemV1: {
        count: () => 1n,
        realmId: {
          find: (realmId: string) => realmId === CANONICAL_REALM.realmId
            ? {
              realmId,
              policyVersion: CASTLE_WORKER_POLICY_VERSION,
              workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
              expectedCastleCount: 1,
              expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
              rosterDigest: rosterDigestForCastleIds([castleId]),
              mode: 'active',
              legacyDrainRequired: false,
              createdAt: timestamp(startedAtMicros),
              activatedAt: timestamp(activatedAtMicros),
            }
            : null,
        },
      },
      castle: {
        count: () => 1n,
        iter: () => [castle].values(),
        castleId: {
          find: (value: bigint) => value === castleId ? castle : null,
        },
        ownerFid: {
          find: (value: bigint) => value === fid ? castle : null,
        },
      },
      castleWorkerV1: {
        count: () => BigInt(workers.size),
        iter: () => workers.values(),
        workerId: {
          find: (workerId: string) => workers.get(workerId) ?? null,
          update: (row: AnyRow) => {
            if (!workers.has(row.workerId)) throw new Error('missing worker');
            workers.set(row.workerId, row);
            return row;
          },
        },
        byOriginCastle: {
          filter: (value: bigint) => [...workers.values()]
            .filter(row => row.originCastleId === value),
        },
      },
      workerAssignmentV1: {
        count: () => BigInt(assignments.size),
        iter: () => assignments.values(),
        insert: (row: AnyRow) => {
          if (
            assignments.has(row.assignmentId)
            || [...assignments.values()].some(
              existing => existing.workerId === row.workerId,
            )
          ) throw new Error('duplicate assignment');
          assignments.set(row.assignmentId, row);
          return row;
        },
        assignmentId: {
          find: (assignmentId: string) => (
            assignments.get(assignmentId) ?? null
          ),
          update: (row: AnyRow) => {
            if (!assignments.has(row.assignmentId)) {
              throw new Error('missing assignment');
            }
            assignments.set(row.assignmentId, row);
            return row;
          },
          delete: (assignmentId: string) => assignments.delete(assignmentId),
        },
        workerId: {
          find: (workerId: string) => (
            [...assignments.values()].find(
              row => row.workerId === workerId,
            ) ?? null
          ),
        },
        byFid: {
          filter: (value: bigint) => [...assignments.values()]
            .filter(row => row.fid === value),
        },
      },
      workerNodeOccupationV1: {
        count: () => BigInt(occupations.size),
        iter: () => occupations.values(),
        insert: (row: AnyRow) => {
          if (occupations.has(row.nodeKey)) {
            throw new Error('duplicate occupation');
          }
          occupations.set(row.nodeKey, row);
          return row;
        },
        nodeKey: {
          find: (nodeKey: string) => occupations.get(nodeKey) ?? null,
          update: (row: AnyRow) => {
            if (!occupations.has(row.nodeKey)) {
              throw new Error('missing occupation');
            }
            occupations.set(row.nodeKey, row);
            return row;
          },
          delete: (nodeKey: string) => occupations.delete(nodeKey),
        },
        byWorker: {
          filter: (workerId: string) => [...occupations.values()]
            .filter(row => row.workerId === workerId),
        },
      },
      workerCommandIdempotencyV1: {
        count: () => BigInt(receipts.size),
        iter: () => receipts.values(),
        insert: (row: AnyRow) => {
          if (receipts.has(row.requestKey)) throw new Error('duplicate receipt');
          receipts.set(row.requestKey, row);
          return row;
        },
        requestKey: {
          find: (requestKey: string) => receipts.get(requestKey) ?? null,
          delete: (requestKey: string) => receipts.delete(requestKey),
        },
        byFid: {
          filter: (value: bigint) => [...receipts.values()]
            .filter(row => row.fid === value),
        },
      },
      workerAssignmentScheduleV1: {
        count: () => BigInt(schedules.size),
        iter: () => schedules.values(),
        insert: (input: AnyRow) => {
          const row = {
            ...input,
            scheduleId: input.scheduleId === 0n
              ? nextScheduleId++
              : input.scheduleId,
          };
          schedules.set(row.scheduleId, row);
          return row;
        },
        scheduleId: {
          find: (scheduleId: bigint) => schedules.get(scheduleId) ?? null,
          delete: (scheduleId: bigint) => schedules.delete(scheduleId),
        },
        byAssignment: {
          filter: (assignmentId: string) => [...schedules.values()]
            .filter(row => row.assignmentId === assignmentId),
        },
        byWorker: {
          filter: (workerId: string) => [...schedules.values()]
            .filter(row => row.workerId === workerId),
        },
      },
      resourceAccountV1: {
        count: () => 1n,
        iter: () => [account].values(),
        fid: {
          find: (value: bigint) => value === fid ? account : null,
          update: (row: AnyRow) => {
            account = row;
            return row;
          },
        },
        castleId: {
          find: (value: bigint) => value === castleId ? account : null,
        },
      },
      allowedFid: {
        fid: {
          find: (value: bigint) => value === fid
            ? { fid, enabled: true, authEpoch: 1 }
            : null,
        },
      },
      realmProfileV1: {
        fid: {
          find: (value: bigint) => value === fid
            ? {
              fid,
              communityStatsVisible: false,
              firstAuthenticatedAt: undefined,
              totalSnapBurnedMicros: undefined,
              marksEarnedMicros: undefined,
              marksSpentMicros: undefined,
              marksBalanceMicros: undefined,
              marksPolicyVersion: undefined,
            }
            : null,
        },
      },
      markAccountV1: {
        fid: {
          find: (value: bigint) => value === fid
            ? {
              fid,
              totalSnapBurnedMicros: 0n,
              earnedMicros: 0n,
              spentMicros: 0n,
              balanceMicros: 0n,
              policyVersion: SNAP_MARK_POLICY_VERSION,
            }
            : null,
        },
      },
      castleSlotClaimV1: {
        ownerFid: {
          find: (value: bigint) => value === fid
            ? {
              slotId: slot.slotId,
              ownerFid: fid,
              castleId,
              generationVersion: slot.generationVersion,
            }
            : null,
        },
      },
      castleSlotV1: {
        slotId: {
          find: (slotId: number) => slotId === slot.slotId ? slot : null,
        },
      },
      realmV1: {
        realmId: {
          find: (realmId: string) => realmId === CANONICAL_REALM.realmId
            ? CANONICAL_REALM
            : null,
        },
      },
      worldTile: {
        key: {
          find: (key: string) => worldTiles.get(key) ?? null,
        },
      },
      worldTileMetaV1: {
        tileKey: {
          find: (key: string) => worldMeta.get(key) ?? null,
        },
      },
      goldSiteV1: {
        siteId: {
          find: (siteId: string) => (
            sites.find(site => site.siteId === siteId) ?? null
          ),
        },
      },
      foodSiteV1: { siteId: { find: () => null } },
      woodSiteV1: { siteId: { find: () => null } },
      stoneSiteV1: { siteId: { find: () => null } },
      goldExpeditionV1: legacyExpeditionTable(),
      foodExpeditionV1: legacyExpeditionTable(),
      woodExpeditionV1: legacyExpeditionTable(),
      stoneExpeditionV1: legacyExpeditionTable(),
      goldNodeOccupationV1: legacyOccupationTable(),
      foodNodeOccupationV1: legacyOccupationTable(),
      woodNodeOccupationV1: legacyOccupationTable(),
      stoneNodeOccupationV1: legacyOccupationTable(),
      goldExpeditionScheduleV1: countOnly(),
      foodExpeditionScheduleV1: countOnly(),
      woodExpeditionScheduleV1: countOnly(),
      stoneExpeditionScheduleV1: countOnly(),
    },
  };

  const scheduleTime = (row: AnyRow): bigint => {
    const value = row.scheduledAt.value;
    assert.equal(row.scheduledAt.tag, 'Time');
    assert.equal(typeof value?.microsSinceUnixEpoch, 'bigint');
    return value.microsSinceUnixEpoch;
  };
  const scheduleFor = (workerId: string, stage: string): AnyRow => {
    const row = [...schedules.values()].find(
      candidate => candidate.workerId === workerId && candidate.stage === stage,
    );
    assert.ok(row, `missing ${stage} schedule for ${workerId}`);
    return row;
  };
  const runSchedule = (row: AnyRow, noEarlierThan?: bigint) => {
    const scheduledAt = scheduleTime(row);
    ctx.timestamp = timestamp(
      noEarlierThan !== undefined && noEarlierThan > scheduledAt
        ? noEarlierThan
        : scheduledAt,
    );
    runCastleWorkerSchedule(ctx as WorkerContext, row as never);
  };
  const counts = () => ({
    assignments: assignments.size,
    occupations: occupations.size,
    schedules: schedules.size,
    receipts: receipts.size,
  });

  return {
    fid,
    castle: castle as WorkerCastle,
    sites,
    ctx: ctx as WorkerContext,
    workers,
    assignments,
    schedules,
    account: () => account,
    advanceResourceCursor: (settledThroughMicros: bigint) => {
      account = {
        ...account,
        settledThroughMicros,
        revision: account.revision + 1n,
        updatedAt: timestamp(settledThroughMicros),
      };
    },
    scheduleFor,
    runSchedule,
    counts,
    setWorker: (workerId: string, next: AnyRow) => {
      workers.delete(workerId);
      workers.set(next.workerId, next);
    },
    setActivatedAtMicros: (value: bigint) => {
      activatedAtMicros = value;
    },
    deleteAssignmentForWorker: (workerId: string) => {
      const row = [...assignments.values()].find(
        assignment => assignment.workerId === workerId,
      );
      if (row !== undefined) assignments.delete(row.assignmentId);
    },
  };
}

test('four workers share one resource across distinct nodes through replay, schedules, recall, and settlement', () => {
  const fixture = makeLifecycleFixture();
  const workerIds = [...fixture.workers.keys()].sort();
  const dispatches = workerIds.map((workerId, index) => dispatchCastleWorker(
    fixture.ctx,
    {
      fid: fixture.fid,
      castle: fixture.castle,
      workerId,
      resourceKind: 'gold',
      siteId: fixture.sites[index]!.siteId,
      idempotencyKey: `dispatch-worker-${String(index + 1).padStart(2, '0')}`,
    },
  ));
  assert.ok(dispatches.every(result => !result.idempotent));
  assert.deepEqual(fixture.counts(), {
    assignments: 4,
    occupations: 4,
    schedules: 4,
    receipts: 4,
  });
  assert.equal(
    new Set(dispatches.map(result => result.assignment.resourceKind)).size,
    1,
  );
  assert.equal(
    new Set(dispatches.map(result => result.assignment.siteId)).size,
    4,
  );

  const beforeDispatchReplay = fixture.counts();
  const replay = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: workerIds[0]!,
    resourceKind: 'gold',
    siteId: fixture.sites[0]!.siteId,
    idempotencyKey: 'dispatch-worker-01',
  });
  assert.equal(replay.idempotent, true);
  assert.deepEqual(fixture.counts(), beforeDispatchReplay);

  const automaticWorker = workerIds[3]!;
  fixture.runSchedule(fixture.scheduleFor(automaticWorker, 'arrival'));
  assert.equal(
    [...fixture.assignments.values()].find(
      row => row.workerId === automaticWorker,
    )?.phase,
    'gathering',
  );
  fixture.runSchedule(
    fixture.scheduleFor(automaticWorker, 'gathering-expiry'),
  );
  const automaticReturning = [...fixture.assignments.values()].find(
    row => row.workerId === automaticWorker,
  )!;
  assert.equal(automaticReturning.phase, 'returning');
  assert.equal(
    automaticReturning.materializedAmount,
    workerResourcePolicy('gold').gatheringTotal,
  );
  assert.ok(fixture.account().gold > 0n);
  fixture.runSchedule(
    fixture.scheduleFor(automaticWorker, 'return-complete'),
  );
  assert.equal(
    [...fixture.assignments.values()].some(
      row => row.workerId === automaticWorker,
    ),
    false,
  );
  assert.equal(fixture.workers.get(automaticWorker)?.status, 'idle');

  recallCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: workerIds[0]!,
    idempotencyKey: 'recall-worker-one-0001',
  });
  assert.equal(fixture.counts().occupations, 2);
  const afterRecall = fixture.counts();
  recallCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: workerIds[0]!,
    idempotencyKey: 'recall-worker-one-0001',
  });
  assert.deepEqual(fixture.counts(), afterRecall);

  recallAllCastleWorkers(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    idempotencyKey: 'recall-all-workers-0001',
  });
  assert.equal(fixture.counts().occupations, 0);
  assert.ok(
    [...fixture.assignments.values()].every(row => row.phase === 'returning'),
  );
  const afterRecallAll = fixture.counts();
  recallAllCastleWorkers(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    idempotencyKey: 'recall-all-workers-0001',
  });
  assert.deepEqual(fixture.counts(), afterRecallAll);

  const monotonicNow = (fixture.ctx as AnyRow).timestamp
    .microsSinceUnixEpoch as bigint;
  for (const schedule of [...fixture.schedules.values()]) {
    fixture.runSchedule(schedule, monotonicNow);
  }
  assert.deepEqual(fixture.counts(), {
    assignments: 0,
    occupations: 0,
    schedules: 0,
    receipts: 6,
  });
  assert.ok(
    [...fixture.workers.values()].every(worker => worker.status === 'idle'),
  );
  assert.equal(
    fixture.account().gold,
    workerResourcePolicy('gold').gatheringTotal
      * BigInt(CASTLE_WORKERS_PER_CASTLE),
  );
});

test('activation inspection rejects malformed roster identity and non-idle workers without authority', () => {
  for (const mutate of [
    (fixture: ReturnType<typeof makeLifecycleFixture>, workerId: string) => {
      fixture.setWorker(workerId, {
        ...fixture.workers.get(workerId)!,
        ordinal: 9,
      });
    },
    (fixture: ReturnType<typeof makeLifecycleFixture>, workerId: string) => {
      fixture.setWorker(workerId, {
        ...fixture.workers.get(workerId)!,
        workerId: 'genesis-001-castle-2-worker-01',
      });
    },
    (fixture: ReturnType<typeof makeLifecycleFixture>, workerId: string) => {
      fixture.setWorker(workerId, {
        ...fixture.workers.get(workerId)!,
        originCastleId: 2n,
      });
    },
  ]) {
    const fixture = makeLifecycleFixture();
    const workerId = [...fixture.workers.keys()][0]!;
    mutate(fixture, workerId);
    const graph = inspectCastleWorkerGraph(fixture.ctx);
    assert.ok(
      graph.malformedWorkerIds > 0n
      || graph.orphanWorkers > 0n
      || graph.castlesMissingWorkers > 0n,
    );
  }

  const missingAuthority = makeLifecycleFixture();
  const workerId = [...missingAuthority.workers.keys()][0]!;
  dispatchCastleWorker(missingAuthority.ctx, {
    fid: missingAuthority.fid,
    castle: missingAuthority.castle,
    workerId,
    resourceKind: 'gold',
    siteId: missingAuthority.sites[0]!.siteId,
    idempotencyKey: 'dispatch-orphan-state-01',
  });
  missingAuthority.deleteAssignmentForWorker(workerId);
  const graph = inspectCastleWorkerGraph(missingAuthority.ctx);
  assert.ok(graph.assignmentPublicMismatches > 0n);
});

test('future activation timestamps fail closed for gameplay and admin graph inspection', () => {
  const fixture = makeLifecycleFixture();
  fixture.setActivatedAtMicros(
    (fixture.ctx as AnyRow).timestamp.microsSinceUnixEpoch + 1n,
  );
  const workerId = [...fixture.workers.keys()][0]!;
  assert.throws(
    () => dispatchCastleWorker(fixture.ctx, {
      fid: fixture.fid,
      castle: fixture.castle,
      workerId,
      resourceKind: 'gold',
      siteId: fixture.sites[0]!.siteId,
      idempotencyKey: 'future-activation-dispatch',
    }),
    /WORKER_SYSTEM_NOT_READY/,
  );
  assert.equal(inspectCastleWorkerGraph(fixture.ctx).systemConfigValid, false);
});

test('late automatic expiry settles at server time after a preadvanced resource cursor', () => {
  const fixture = makeLifecycleFixture();
  const workerId = [...fixture.workers.keys()][0]!;
  const result = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId: fixture.sites[0]!.siteId,
    idempotencyKey: 'late-expiry-dispatch',
  });
  fixture.runSchedule(fixture.scheduleFor(workerId, 'arrival'));
  const gatheringEndsAtMicros = result.assignment.gatheringEndsAtMicros;
  const preadvancedCursor =
    gatheringEndsAtMicros + REALM_RESOURCE_QUANTUM_MICROS;
  const delayedSchedulerTime =
    preadvancedCursor + REALM_RESOURCE_QUANTUM_MICROS;
  fixture.advanceResourceCursor(preadvancedCursor);
  const expirySchedule = fixture.scheduleFor(
    workerId,
    'gathering-expiry',
  );

  assert.doesNotThrow(() => fixture.runSchedule(
    expirySchedule,
    delayedSchedulerTime,
  ));
  const returning = [...fixture.assignments.values()].find(
    assignment => assignment.workerId === workerId,
  );
  assert.equal(returning?.phase, 'returning');
  assert.equal(returning?.returnStartedAtMicros, gatheringEndsAtMicros);
  assert.equal(
    returning?.materializedAmount,
    workerResourcePolicy('gold').gatheringTotal,
  );
  assert.equal(fixture.account().settledThroughMicros, delayedSchedulerTime);
  assert.equal(
    fixture.account().gold,
    workerResourcePolicy('gold').gatheringTotal,
  );

  fixture.runSchedule(expirySchedule, delayedSchedulerTime + 60_000_000n);
  assert.equal(
    fixture.account().gold,
    workerResourcePolicy('gold').gatheringTotal,
  );
  fixture.runSchedule(
    fixture.scheduleFor(workerId, 'return-complete'),
    delayedSchedulerTime + 60_000_000n,
  );
  assert.equal(fixture.assignments.size, 0);
  assert.equal(fixture.workers.get(workerId)?.status, 'idle');
});

test('foreign worker-system singleton rows fail before roster scans or writes', () => {
  let stageTouchedRealm = false;
  const stagedContext = {
    timestamp: timestamp(100n),
    db: {
      realmWorkerSystemV1: {
        count: () => 1n,
        realmId: {
          find: () => null,
        },
        insert: () => {
          stageTouchedRealm = true;
          throw new Error('unexpected insert');
        },
      },
      castle: {
        iter: () => {
          stageTouchedRealm = true;
          throw new Error('unexpected scan');
        },
      },
    },
  } as unknown as Parameters<typeof stageWorkerSystem>[0];
  assert.throws(
    () => stageWorkerSystem(stagedContext),
    /WORKER_SYSTEM_INTEGRITY/,
  );
  assert.equal(stageTouchedRealm, false);

  let ensureTouchedRoster = false;
  const ensureContext = {
    db: {
      realmWorkerSystemV1: {
        count: () => 1n,
        realmId: {
          find: () => null,
        },
      },
      castleWorkerV1: {
        insert: () => {
          ensureTouchedRoster = true;
          throw new Error('unexpected insert');
        },
      },
      castle: {
        iter: () => {
          ensureTouchedRoster = true;
          throw new Error('unexpected scan');
        },
      },
    },
  } as unknown as Parameters<typeof ensureCastleWorkerRoster>[0];
  assert.throws(
    () => ensureCastleWorkerRoster(
      ensureContext,
      { castleId: 1n } as Parameters<typeof ensureCastleWorkerRoster>[1],
    ),
    /WORKER_SYSTEM_INTEGRITY/,
  );
  assert.equal(ensureTouchedRoster, false);
});

test('rollout inspection rejects every oversized graph before opening an iterator', () => {
  const limits = {
    realmWorkerSystemV1: 1,
    castle: 100,
    castleWorkerV1: 400,
    workerAssignmentV1: 400,
    workerNodeOccupationV1: 400,
    workerAssignmentScheduleV1: 400,
    workerCommandIdempotencyV1: 6_400,
    resourceAccountV1: 100,
  } as const;

  for (const [oversizedTable, limit] of Object.entries(limits)) {
    let openedIterator = false;
    const countTable = (tableName: string) => ({
      count: () => BigInt(
        tableName === oversizedTable ? limit + 1 : 0,
      ),
      iter: () => {
        openedIterator = true;
        throw new Error('unexpected iterator');
      },
    });
    const realmWorkerSystemV1 = {
      ...countTable('realmWorkerSystemV1'),
      realmId: {
        find: () => {
          openedIterator = true;
          throw new Error('unexpected lookup');
        },
      },
    };
    const ctx = {
      db: {
        realmWorkerSystemV1,
        castle: countTable('castle'),
        castleWorkerV1: countTable('castleWorkerV1'),
        workerAssignmentV1: countTable('workerAssignmentV1'),
        workerNodeOccupationV1: countTable('workerNodeOccupationV1'),
        workerAssignmentScheduleV1: countTable('workerAssignmentScheduleV1'),
        workerCommandIdempotencyV1: countTable(
          'workerCommandIdempotencyV1',
        ),
        resourceAccountV1: countTable('resourceAccountV1'),
      },
    } as unknown as Parameters<typeof inspectWorkerRollout>[0];
    assert.throws(
      () => inspectWorkerRollout(ctx),
      /WORKER_INSPECTION_CAPACITY/,
      oversizedTable,
    );
    assert.equal(openedIterator, false, oversizedTable);
  }
});
