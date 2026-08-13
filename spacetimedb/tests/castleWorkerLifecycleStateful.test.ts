import assert from 'node:assert/strict';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

import type * as CastleWorkerAuthority from '../src/castleWorkerAuthority';
import type * as CastleWorkerRolloutAuthority from '../src/castleWorkerRolloutAuthority';
import {
  CASTLE_WORKER_PROTOCOL_CAPABILITY,
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
  workerNodeKey,
  workerResourcePolicy,
} from '../src/castleWorkerPolicy';
import {
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  CASTLE_WORKER_RESOURCE_STATE_VERSION,
  resourceRosterDigest,
} from '../src/castleWorkerRolloutPolicy';
import {
  ensureCastleWorkerRoster,
  expectedWorkerRowsForCastle,
} from '../src/castleWorkerRoster';
import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
} from '../src/foodSitePolicy';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
} from '../src/goldSitePolicy';
import {
  ADMITTED_DAILY_MARK_POLICY_VERSION,
} from '../src/marksAuthorityPolicy';
import {
  assertLegacyExpeditionDispatchAllowed,
} from '../src/resourceExpeditionReservationAuthority';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  REALM_RESOURCE_QUANTUM_MICROS,
} from '../src/resourceAuthorityPolicy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
} from '../src/stoneSitePolicy';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
} from '../src/woodSitePolicy';
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
  repairMissingWorkerReturnSchedule,
  recallAllCastleWorkers,
  recallCastleWorker,
  runCastleWorkerSchedule,
  settleAllWorkerAssignmentsForFid,
} = await loadExactProductionModule<typeof CastleWorkerAuthority>(
  new URL('../src/castleWorkerAuthority.ts', import.meta.url),
);
const {
  activateWorkerSystem,
  backfillWorkerRoster,
  beginWorkerLegacyDrain,
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

function legacyOccupationTable(rows: Map<string, AnyRow> = new Map()) {
  return {
    count: () => BigInt(rows.size),
    siteId: { find: (siteId: string) => rows.get(siteId) ?? null },
  };
}

type LifecycleFixtureOptions = Readonly<{
  initialWorkerSystem?: 'absent' | 'active';
  initialRoster?: 'empty' | 'complete';
}>;

function makeLifecycleFixture(
  options: LifecycleFixtureOptions = {},
) {
  const fid = 77_001n;
  const castleId = 1n;
  const startedAtMicros = 1_900_000_000_000_000n;
  const activatedAtMicros = startedAtMicros;
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
    options.initialRoster === 'empty'
      ? []
      : expectedWorkerRowsForCastle(castle)
        .map(row => [row.workerId, { ...row }] as const),
  );
  const assignments = new Map<string, AnyRow>();
  const occupations = new Map<string, AnyRow>();
  const receipts = new Map<string, AnyRow>();
  const schedules = new Map<bigint, AnyRow>();
  const legacyGoldOccupations = new Map<string, AnyRow>();
  let greaterRealmActivation: AnyRow | null = null;
  let nextScheduleId = 1n;
  let nextAssignmentId = 1;
  let workerSystem: AnyRow | null =
    options.initialWorkerSystem === 'absent'
      ? null
      : {
        realmId: CANONICAL_REALM.realmId,
        policyVersion: CASTLE_WORKER_POLICY_VERSION,
        workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
        expectedCastleCount: 1,
        expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
        rosterDigest: rosterDigestForCastleIds([castleId]),
        mode: 'active',
        legacyDrainRequired: false,
        createdAt: timestamp(startedAtMicros),
        activatedAt: timestamp(activatedAtMicros),
      };
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
      greaterRealmActivationV1: {
        count: () => greaterRealmActivation === null ? 0n : 1n,
        iter: () => greaterRealmActivation === null
          ? [][Symbol.iterator]()
          : [greaterRealmActivation].values(),
      },
      realmWorkerSystemV1: {
        count: () => workerSystem === null ? 0n : 1n,
        insert: (row: AnyRow) => {
          if (workerSystem !== null) throw new Error('duplicate worker system');
          workerSystem = row;
          return row;
        },
        realmId: {
          find: (realmId: string) => realmId === CANONICAL_REALM.realmId
            ? workerSystem
            : null,
          update: (row: AnyRow) => {
            if (workerSystem === null) throw new Error('missing worker system');
            workerSystem = row;
            return row;
          },
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
        insert: (row: AnyRow) => {
          if (workers.has(row.workerId)) throw new Error('duplicate worker');
          workers.set(row.workerId, row);
          return row;
        },
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
              policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
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
        iter: () => CANONICAL_TIER_I_GOLD_SITES_V1.values(),
        siteId: {
          find: (siteId: string) => (
            CANONICAL_TIER_I_GOLD_SITES_V1.find(
              site => site.siteId === siteId,
            ) ?? null
          ),
        },
      },
      foodSiteV1: {
        iter: () => CANONICAL_TIER_I_FOOD_SITES_V1.values(),
        siteId: {
          find: (siteId: string) => (
            CANONICAL_TIER_I_FOOD_SITES_V1.find(
              site => site.siteId === siteId,
            ) ?? null
          ),
        },
      },
      woodSiteV1: {
        iter: () => CANONICAL_TIER_I_WOOD_SITES_V1.values(),
        siteId: {
          find: (siteId: string) => (
            CANONICAL_TIER_I_WOOD_SITES_V1.find(
              site => site.siteId === siteId,
            ) ?? null
          ),
        },
      },
      stoneSiteV1: {
        iter: () => CANONICAL_TIER_I_STONE_SITES_V1.values(),
        siteId: {
          find: (siteId: string) => (
            CANONICAL_TIER_I_STONE_SITES_V1.find(
              site => site.siteId === siteId,
            ) ?? null
          ),
        },
      },
      goldExpeditionV1: legacyExpeditionTable(),
      foodExpeditionV1: legacyExpeditionTable(),
      woodExpeditionV1: legacyExpeditionTable(),
      stoneExpeditionV1: legacyExpeditionTable(),
      goldNodeOccupationV1: legacyOccupationTable(legacyGoldOccupations),
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
    occupations,
    account: () => account,
    workerSystem: () => workerSystem,
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
      if (workerSystem !== null) {
        workerSystem = {
          ...workerSystem,
          activatedAt: timestamp(value),
        };
      }
    },
    setGreaterRealmCanary: () => {
      const preparedAt = timestamp(startedAtMicros);
      greaterRealmActivation = {
        activationId: 'fixture:activation:1',
        atlasId: 'GRA-FIXTURE',
        mode: 'canary',
        postCanaryFoundingCount: 0,
        postCanaryDispatchCount: 0,
        preparedAt,
        drainingAt: preparedAt,
        frozenAt: preparedAt,
        plannedAt: preparedAt,
        canaryAt: preparedAt,
        activatedAt: undefined,
        haltedAt: undefined,
        rolledBackAt: undefined,
      };
    },
    setGreaterRealmRolledBack: () => {
      if (greaterRealmActivation === null) throw new Error('missing activation');
      greaterRealmActivation = {
        ...greaterRealmActivation,
        mode: 'rolled-back',
        rolledBackAt: timestamp(startedAtMicros),
      };
    },
    seedGenericOccupation: (resourceKind: string, siteId: string) => {
      const nodeKey = workerNodeKey(resourceKind, siteId);
      occupations.set(nodeKey, {
        nodeKey,
        resourceKind,
        siteId,
        workerId: 'fixture-worker',
      });
    },
    seedLegacyGoldOccupation: (siteId: string) => {
      legacyGoldOccupations.set(siteId, { siteId });
    },
    deleteAssignmentForWorker: (workerId: string) => {
      const row = [...assignments.values()].find(
        assignment => assignment.workerId === workerId,
      );
      if (row !== undefined) assignments.delete(row.assignmentId);
    },
  };
}

function makeMissingReturnScheduleFixture() {
  const fixture = makeLifecycleFixture();
  const [returningWorkerId, replacementWorkerId] = [
    ...fixture.workers.keys(),
  ].sort();
  const siteId = fixture.sites[0]!.siteId;
  dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: returningWorkerId!,
    resourceKind: 'gold',
    siteId,
    idempotencyKey: 'repair-returning-worker-dispatch',
  });
  recallCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: returningWorkerId!,
    idempotencyKey: 'repair-returning-worker-recall',
  });
  dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: replacementWorkerId!,
    resourceKind: 'gold',
    siteId,
    idempotencyKey: 'repair-replacement-worker-dispatch',
  });
  const missingSchedule = fixture.scheduleFor(
    returningWorkerId!,
    'return-complete',
  );
  assert.equal(fixture.schedules.delete(missingSchedule.scheduleId), true);
  const input: Parameters<typeof repairMissingWorkerReturnSchedule>[1] = {
    capability: 'genesis-001-worker-return-schedule-repair-v1',
    sourceCommit: 'a'.repeat(40),
    moduleArtifactDigest: 'b'.repeat(64),
    expectedCastleCount: 1,
    expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
    expectedAssignments: 2,
    expectedOccupations: 1,
    expectedSchedules: 1,
    expectedReturningWorkers: 1,
    expectedMissingSchedules: 1,
    rosterDigest: rosterDigestForCastleIds([fixture.castle.castleId]),
  };
  return {
    fixture,
    returningWorkerId: returningWorkerId!,
    replacementWorkerId: replacementWorkerId!,
    siteId,
    missingSchedule,
    input,
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
  assert.ok(dispatches.every(result => result.assignment !== undefined));
  const activeAssignments = dispatches.map(result => result.assignment!);
  assert.deepEqual(fixture.counts(), {
    assignments: 4,
    occupations: 4,
    schedules: 4,
    receipts: 4,
  });
  assert.equal(
    new Set(activeAssignments.map(assignment => assignment.resourceKind)).size,
    1,
  );
  assert.equal(
    new Set(activeAssignments.map(assignment => assignment.siteId)).size,
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

test('Greater Realm cutover permits historical retry but closes every fresh legacy worker dispatch', () => {
  const fixture = makeLifecycleFixture();
  const workerIds = [...fixture.workers.keys()].sort();
  const firstInput = {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: workerIds[0]!,
    resourceKind: 'gold',
    siteId: fixture.sites[0]!.siteId,
    idempotencyKey: 'pre-cutover-worker-dispatch',
  };
  assert.equal(dispatchCastleWorker(fixture.ctx, firstInput).idempotent, false);
  fixture.setGreaterRealmCanary();
  const beforeRetry = fixture.counts();
  assert.equal(dispatchCastleWorker(fixture.ctx, firstInput).idempotent, true);
  assert.deepEqual(fixture.counts(), beforeRetry);
  assert.throws(
    () => dispatchCastleWorker(fixture.ctx, {
      ...firstInput,
      workerId: workerIds[1]!,
      siteId: fixture.sites[1]!.siteId,
      idempotencyKey: 'post-cutover-worker-dispatch',
    }),
    /GREATER_REALM_LEGACY_DISPATCH_CLOSED/,
  );
  assert.deepEqual(fixture.counts(), beforeRetry);
  fixture.setGreaterRealmRolledBack();
  assert.equal(dispatchCastleWorker(fixture.ctx, {
    ...firstInput,
    workerId: workerIds[1]!,
    siteId: fixture.sites[1]!.siteId,
    idempotencyKey: 'post-rollback-worker-dispatch',
  }).idempotent, false);
});

test('same-timestamp settlement preserves an active Worker reservation and materializes it once', () => {
  const fixture = makeLifecycleFixture();
  const workerId = [...fixture.workers.keys()].sort()[0]!;
  const siteId = fixture.sites[0]!.siteId;
  const dispatched = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId,
    idempotencyKey: 'settle-active-reservation-01',
  });
  assert.ok(dispatched.assignment);
  fixture.runSchedule(fixture.scheduleFor(workerId, 'arrival'));
  const gathering = [...fixture.assignments.values()].find(
    assignment => assignment.workerId === workerId,
  )!;
  const observedAtMicros = gathering.arrivesAtMicros
    + 2n * REALM_RESOURCE_QUANTUM_MICROS;
  assert.ok(observedAtMicros < gathering.gatheringEndsAtMicros);
  (fixture.ctx as AnyRow).timestamp = timestamp(observedAtMicros);

  const workersBefore = structuredClone([...fixture.workers.entries()]);
  const occupationsBefore = structuredClone([...fixture.occupations.entries()]);
  const schedulesBefore = structuredClone([...fixture.schedules.entries()]);
  const accountBefore = structuredClone(fixture.account());
  settleAllWorkerAssignmentsForFid(
    fixture.ctx,
    fixture.fid,
    observedAtMicros,
  );

  const materialized = [...fixture.assignments.values()].find(
    assignment => assignment.workerId === workerId,
  )!;
  const goldPolicy = workerResourcePolicy('gold');
  const expectedCredit = (
    (observedAtMicros - gathering.arrivesAtMicros) / goldPolicy.quantumMicros
  ) * goldPolicy.ratePerQuantum;
  assert.equal(materialized.phase, 'gathering');
  assert.equal(materialized.siteId, siteId);
  assert.equal(materialized.resourceKind, 'gold');
  assert.equal(materialized.materializedAmount, expectedCredit);
  assert.equal(materialized.accruedAmount, expectedCredit);
  assert.deepEqual([...fixture.workers.entries()], workersBefore);
  assert.deepEqual([...fixture.occupations.entries()], occupationsBefore);
  assert.deepEqual([...fixture.schedules.entries()], schedulesBefore);
  assert.equal(fixture.assignments.size, 1);
  assert.equal(fixture.occupations.size, 1);
  assert.equal(fixture.schedules.size, 1);
  assert.equal(fixture.account().revision, accountBefore.revision + 1n);
  assert.equal(fixture.account().gold, accountBefore.gold + expectedCredit);

  const afterFirstSettlement = structuredClone({
    account: fixture.account(),
    assignments: [...fixture.assignments.entries()],
    occupations: [...fixture.occupations.entries()],
    schedules: [...fixture.schedules.entries()],
    workers: [...fixture.workers.entries()],
  });
  settleAllWorkerAssignmentsForFid(
    fixture.ctx,
    fixture.fid,
    observedAtMicros,
  );
  assert.deepEqual({
    account: fixture.account(),
    assignments: [...fixture.assignments.entries()],
    occupations: [...fixture.occupations.entries()],
    schedules: [...fixture.schedules.entries()],
    workers: [...fixture.workers.entries()],
  }, afterFirstSettlement);
});

test('an exact dispatch retry after normal completion is a terminal idempotent no-op', () => {
  const fixture = makeLifecycleFixture();
  const workerId = [...fixture.workers.keys()].sort()[0]!;
  const siteId = fixture.sites[0]!.siteId;
  const idempotencyKey = 'lost-response-terminal-dispatch';
  const dispatched = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId,
    idempotencyKey,
  });
  assert.ok(dispatched.assignment);

  fixture.runSchedule(fixture.scheduleFor(workerId, 'arrival'));
  fixture.runSchedule(fixture.scheduleFor(workerId, 'gathering-expiry'));
  fixture.runSchedule(fixture.scheduleFor(workerId, 'return-complete'));
  assert.equal(fixture.assignments.size, 0);
  assert.equal(fixture.workers.get(workerId)?.status, 'idle');
  const countsAfterCompletion = fixture.counts();

  const replay = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId,
    idempotencyKey,
  });
  assert.equal(replay.idempotent, true);
  assert.equal(replay.assignment, undefined);
  assert.deepEqual(fixture.counts(), countsAfterCompletion);

  const laterSiteId = fixture.sites[1]!.siteId;
  const laterDispatch = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId: laterSiteId,
    idempotencyKey: 'distinct-later-worker-dispatch',
  });
  assert.ok(laterDispatch.assignment);
  const laterState = {
    counts: fixture.counts(),
    assignments: structuredClone([...fixture.assignments.values()]),
    occupations: structuredClone([...fixture.occupations.values()]),
    schedules: structuredClone([...fixture.schedules.values()]),
  };

  const replayDuringLaterAssignment = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId,
    idempotencyKey,
  });
  assert.equal(replayDuringLaterAssignment.idempotent, true);
  assert.equal(replayDuringLaterAssignment.assignment, undefined);
  assert.deepEqual(fixture.counts(), laterState.counts);
  assert.deepEqual([...fixture.assignments.values()], laterState.assignments);
  assert.deepEqual([...fixture.occupations.values()], laterState.occupations);
  assert.deepEqual([...fixture.schedules.values()], laterState.schedules);

  assert.throws(
    () => dispatchCastleWorker(fixture.ctx, {
      fid: fixture.fid,
      castle: fixture.castle,
      workerId,
      resourceKind: 'gold',
      siteId: laterSiteId,
      idempotencyKey,
    }),
    /WORKER_IDEMPOTENCY_CONFLICT/,
  );
  assert.deepEqual(fixture.counts(), laterState.counts);
  assert.deepEqual([...fixture.assignments.values()], laterState.assignments);
  assert.deepEqual([...fixture.occupations.values()], laterState.occupations);
  assert.deepEqual([...fixture.schedules.values()], laterState.schedules);
});

test('a returning worker completes after its former node is reused without touching the replacement worker', () => {
  const fixture = makeLifecycleFixture();
  const [returningWorkerId, replacementWorkerId] = [
    ...fixture.workers.keys(),
  ].sort();
  const siteId = fixture.sites[0]!.siteId;
  dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: returningWorkerId!,
    resourceKind: 'gold',
    siteId,
    idempotencyKey: 'reuse-returning-worker-dispatch',
  });
  recallCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: returningWorkerId!,
    idempotencyKey: 'reuse-returning-worker-recall',
  });
  dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: replacementWorkerId!,
    resourceKind: 'gold',
    siteId,
    idempotencyKey: 'reuse-replacement-worker-dispatch',
  });

  const replacementAssignment = structuredClone(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === replacementWorkerId,
    )!,
  );
  const replacementOccupation = structuredClone(
    fixture.occupations.get(workerNodeKey('gold', siteId))!,
  );
  const replacementSchedule = structuredClone(
    fixture.scheduleFor(replacementWorkerId!, 'arrival'),
  );
  const graphBeforeCompletion = inspectCastleWorkerGraph(fixture.ctx);
  assert.equal(graphBeforeCompletion.assignments, 2n);
  assert.equal(graphBeforeCompletion.occupations, 1n);
  assert.equal(graphBeforeCompletion.schedules, 2n);
  assert.equal(graphBeforeCompletion.occupationSiteMismatches, 0n);
  assert.equal(graphBeforeCompletion.assignmentsMissingOccupation, 0n);
  assert.equal(graphBeforeCompletion.assignmentsWithoutSingleSchedule, 0n);

  const nodeKey = workerNodeKey('gold', siteId);
  fixture.occupations.set(nodeKey, {
    ...replacementOccupation,
    workerOrdinal: fixture.workers.get(returningWorkerId!)!.ordinal,
  });
  assert.ok(
    inspectCastleWorkerGraph(fixture.ctx).occupationSiteMismatches > 0n,
    'a malformed replacement-owned occupation must not hide behind a returning assignment',
  );
  fixture.occupations.set(nodeKey, replacementOccupation);

  fixture.runSchedule(
    fixture.scheduleFor(returningWorkerId!, 'return-complete'),
  );

  assert.equal(fixture.workers.get(returningWorkerId!)?.status, 'idle');
  assert.equal(
    [...fixture.assignments.values()].some(
      assignment => assignment.workerId === returningWorkerId,
    ),
    false,
  );
  assert.deepEqual(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === replacementWorkerId,
    ),
    replacementAssignment,
  );
  assert.deepEqual(
    fixture.occupations.get(workerNodeKey('gold', siteId)),
    replacementOccupation,
  );
  assert.deepEqual(
    fixture.scheduleFor(replacementWorkerId!, 'arrival'),
    replacementSchedule,
  );
  assert.deepEqual(fixture.counts(), {
    assignments: 1,
    occupations: 1,
    schedules: 1,
    receipts: 3,
  });
  const graphAfterCompletion = inspectCastleWorkerGraph(fixture.ctx);
  assert.equal(graphAfterCompletion.occupationSiteMismatches, 0n);
  assert.equal(graphAfterCompletion.assignmentsMissingOccupation, 0n);
  assert.equal(graphAfterCompletion.assignmentsWithoutSingleSchedule, 0n);
});

test('return completion fails closed while the returning worker still owns any occupation', () => {
  const fixture = makeLifecycleFixture();
  const workerId = [...fixture.workers.keys()].sort()[0]!;
  const siteId = fixture.sites[0]!.siteId;
  dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId,
    idempotencyKey: 'owned-occupation-worker-dispatch',
  });
  recallCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    idempotencyKey: 'owned-occupation-worker-recall',
  });
  const returningAssignment = structuredClone(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === workerId,
    )!,
  );
  const returnSchedule = structuredClone(
    fixture.scheduleFor(workerId, 'return-complete'),
  );
  const nodeKey = workerNodeKey('gold', siteId);
  fixture.occupations.set(nodeKey, {
    nodeKey,
    resourceKind: 'gold',
    siteId,
    workerId,
    workerOrdinal: fixture.workers.get(workerId)!.ordinal,
    originCastleId: fixture.castle.castleId,
    phase: 'returning',
    startedAtMicros: returningAssignment.startedAtMicros,
    arrivesAtMicros: returningAssignment.arrivesAtMicros,
    gatheringEndsAtMicros: returningAssignment.gatheringEndsAtMicros,
    timelineRevision: returningAssignment.timelineRevision,
  });

  assert.throws(
    () => fixture.runSchedule(returnSchedule),
    /WORKER_OCCUPATION_INTEGRITY/,
  );
  assert.deepEqual(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === workerId,
    ),
    returningAssignment,
  );
  assert.deepEqual(
    fixture.scheduleFor(workerId, 'return-complete'),
    returnSchedule,
  );
  assert.equal(fixture.workers.get(workerId)?.status, 'returning');
  assert.equal(fixture.occupations.get(nodeKey)?.workerId, workerId);
});

test('repair restores exactly one missing return schedule and a retry is an aggregate-only no-op', () => {
  const {
    fixture,
    returningWorkerId,
    replacementWorkerId,
    siteId,
    input,
  } = makeMissingReturnScheduleFixture();
  const returningAssignment = structuredClone(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === returningWorkerId,
    )!,
  );
  const replacementAssignment = structuredClone(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === replacementWorkerId,
    )!,
  );
  const replacementOccupation = structuredClone(
    fixture.occupations.get(workerNodeKey('gold', siteId))!,
  );
  const replacementSchedule = structuredClone(
    fixture.scheduleFor(replacementWorkerId, 'arrival'),
  );
  const overdueNow = returningAssignment.returnsAtMicros + 60_000_000n;
  Object.assign(fixture.ctx, { timestamp: timestamp(overdueNow) });
  assert.ok(returningAssignment.returnsAtMicros < overdueNow);

  const repaired = repairMissingWorkerReturnSchedule(fixture.ctx, input);
  assert.deepEqual(repaired, {
    repaired: true,
    beforeAssignments: 2n,
    beforeOccupations: 1n,
    beforeSchedules: 1n,
    afterAssignments: 2n,
    afterOccupations: 1n,
    afterSchedules: 2n,
  });
  const restored = fixture.scheduleFor(
    returningWorkerId,
    'return-complete',
  );
  assert.equal(restored.assignmentId, returningAssignment.assignmentId);
  assert.equal(
    restored.scheduledAt.value.microsSinceUnixEpoch,
    returningAssignment.returnsAtMicros,
  );
  assert.deepEqual(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === returningWorkerId,
    ),
    returningAssignment,
  );
  assert.deepEqual(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === replacementWorkerId,
    ),
    replacementAssignment,
  );
  assert.deepEqual(
    fixture.occupations.get(workerNodeKey('gold', siteId)),
    replacementOccupation,
  );
  assert.deepEqual(
    fixture.scheduleFor(replacementWorkerId, 'arrival'),
    replacementSchedule,
  );

  const scheduleRowsBeforeRetry = [...fixture.schedules.values()]
    .map(row => structuredClone(row));
  assert.throws(
    () => repairMissingWorkerReturnSchedule(
      fixture.ctx,
      {
        ...input,
        expectedReturningWorkers: 2,
      },
    ),
    /WORKER_RETURN_REPAIR_STATE_DRIFT/,
  );
  assert.deepEqual([...fixture.schedules.values()], scheduleRowsBeforeRetry);
  const retry = repairMissingWorkerReturnSchedule(fixture.ctx, input);
  assert.deepEqual(retry, {
    repaired: false,
    beforeAssignments: 2n,
    beforeOccupations: 1n,
    beforeSchedules: 2n,
    afterAssignments: 2n,
    afterOccupations: 1n,
    afterSchedules: 2n,
  });
  assert.deepEqual([...fixture.schedules.values()], scheduleRowsBeforeRetry);

  fixture.runSchedule(restored, overdueNow);
  assert.equal(fixture.workers.get(returningWorkerId)?.status, 'idle');
  assert.deepEqual(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === replacementWorkerId,
    ),
    replacementAssignment,
  );
  assert.deepEqual(
    fixture.occupations.get(workerNodeKey('gold', siteId)),
    replacementOccupation,
  );
  assert.deepEqual(
    fixture.scheduleFor(replacementWorkerId, 'arrival'),
    replacementSchedule,
  );
  const completedRetry = repairMissingWorkerReturnSchedule(
    fixture.ctx,
    input,
  );
  assert.deepEqual(completedRetry, {
    repaired: false,
    beforeAssignments: 1n,
    beforeOccupations: 1n,
    beforeSchedules: 1n,
    afterAssignments: 1n,
    afterOccupations: 1n,
    afterSchedules: 1n,
  });
});

test('return-schedule repair rejects oversized state before opening an iterator', () => {
  const { fixture, input } = makeMissingReturnScheduleFixture();
  const template = structuredClone([...fixture.assignments.values()][0]!);
  for (let index = fixture.assignments.size; index <= 400; index += 1) {
    fixture.assignments.set(`oversized-assignment-${index}`, {
      ...template,
      assignmentId: `oversized-assignment-${index}`,
      workerId: `oversized-worker-${index}`,
    });
  }
  let iteratorOpened = false;
  const assignmentTable = (
    fixture.ctx.db as unknown as {
      workerAssignmentV1: { iter: () => Iterable<AnyRow> };
    }
  ).workerAssignmentV1;
  assignmentTable.iter = () => {
    iteratorOpened = true;
    return fixture.assignments.values();
  };

  assert.throws(
    () => repairMissingWorkerReturnSchedule(fixture.ctx, input),
    /WORKER_RETURN_REPAIR_CAPACITY/,
  );
  assert.equal(iteratorOpened, false);
});

test('return-schedule repair rejects every attestation drift without writes', () => {
  const cases: ReadonlyArray<Readonly<{
    name: string;
    mutate: (
      input: Parameters<typeof repairMissingWorkerReturnSchedule>[1],
    ) => Parameters<typeof repairMissingWorkerReturnSchedule>[1];
  }>> = [
    {
      name: 'capability',
      mutate: input => ({ ...input, capability: 'wrong-capability' }),
    },
    {
      name: 'source commit',
      mutate: input => ({ ...input, sourceCommit: 'a'.repeat(39) }),
    },
    {
      name: 'module digest',
      mutate: input => ({ ...input, moduleArtifactDigest: 'b'.repeat(63) }),
    },
    {
      name: 'castle and worker counts',
      mutate: input => ({
        ...input,
        expectedCastleCount: 2,
        expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE * 2,
      }),
    },
    {
      name: 'worker count',
      mutate: input => ({ ...input, expectedWorkerCount: 3 }),
    },
    {
      name: 'assignments',
      mutate: input => ({ ...input, expectedAssignments: 1 }),
    },
    {
      name: 'occupations',
      mutate: input => ({ ...input, expectedOccupations: 0 }),
    },
    {
      name: 'schedules',
      mutate: input => ({ ...input, expectedSchedules: 0 }),
    },
    {
      name: 'returning workers',
      mutate: input => ({ ...input, expectedReturningWorkers: 2 }),
    },
    {
      name: 'missing schedules',
      mutate: input => ({ ...input, expectedMissingSchedules: 2 }),
    },
    {
      name: 'roster digest',
      mutate: input => ({ ...input, rosterDigest: '0'.repeat(16) }),
    },
  ];

  for (const drift of cases) {
    const { fixture, input } = makeMissingReturnScheduleFixture();
    const assignmentsBefore = [...fixture.assignments.values()]
      .map(row => structuredClone(row));
    const occupationsBefore = [...fixture.occupations.values()]
      .map(row => structuredClone(row));
    const schedulesBefore = [...fixture.schedules.values()]
      .map(row => structuredClone(row));
    assert.throws(
      () => repairMissingWorkerReturnSchedule(
        fixture.ctx,
        drift.mutate(input),
      ),
      /WORKER_RETURN_REPAIR_/,
      drift.name,
    );
    assert.deepEqual(
      [...fixture.assignments.values()],
      assignmentsBefore,
      drift.name,
    );
    assert.deepEqual(
      [...fixture.occupations.values()],
      occupationsBefore,
      drift.name,
    );
    assert.deepEqual(
      [...fixture.schedules.values()],
      schedulesBefore,
      drift.name,
    );
  }
});

test('return-schedule repair rejects two missing schedules without writes', () => {
  const { fixture, input, replacementWorkerId } =
    makeMissingReturnScheduleFixture();
  const replacementSchedule = fixture.scheduleFor(
    replacementWorkerId,
    'arrival',
  );
  assert.equal(fixture.schedules.delete(replacementSchedule.scheduleId), true);
  const assignmentsBefore = [...fixture.assignments.values()]
    .map(row => structuredClone(row));
  const occupationsBefore = [...fixture.occupations.values()]
    .map(row => structuredClone(row));

  assert.throws(
    () => repairMissingWorkerReturnSchedule(
      fixture.ctx,
      {
        ...input,
        expectedSchedules: 0,
      },
    ),
    /WORKER_RETURN_REPAIR_/,
  );
  assert.deepEqual([...fixture.assignments.values()], assignmentsBefore);
  assert.deepEqual([...fixture.occupations.values()], occupationsBefore);
  assert.equal(fixture.schedules.size, 0);
});

test('return-schedule repair refuses a single missing nonreturning schedule', () => {
  const {
    fixture,
    returningWorkerId,
    replacementWorkerId,
    missingSchedule,
    input,
  } = makeMissingReturnScheduleFixture();
  fixture.schedules.set(missingSchedule.scheduleId, missingSchedule);
  const outboundSchedule = fixture.scheduleFor(
    replacementWorkerId,
    'arrival',
  );
  assert.equal(fixture.schedules.delete(outboundSchedule.scheduleId), true);
  const schedulesBefore = [...fixture.schedules.values()]
    .map(row => structuredClone(row));

  assert.throws(
    () => repairMissingWorkerReturnSchedule(fixture.ctx, input),
    /WORKER_RETURN_REPAIR_TARGET_INVALID/,
  );
  assert.deepEqual([...fixture.schedules.values()], schedulesBefore);
  assert.equal(
    fixture.scheduleFor(returningWorkerId, 'return-complete').scheduleId,
    missingSchedule.scheduleId,
  );
  assert.equal(
    [...fixture.assignments.values()].find(
      assignment => assignment.workerId === replacementWorkerId,
    )?.phase,
    'outbound',
  );
});

test('occupied nodes reject a second generic worker and generic-legacy overlap without writes', () => {
  const fixture = makeLifecycleFixture();
  const [firstWorkerId, secondWorkerId] = [...fixture.workers.keys()].sort();
  const siteId = fixture.sites[0]!.siteId;
  dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId: firstWorkerId!,
    resourceKind: 'gold',
    siteId,
    idempotencyKey: 'occupied-node-first-dispatch',
  });
  const afterFirstDispatch = fixture.counts();
  assert.throws(
    () => dispatchCastleWorker(fixture.ctx, {
      fid: fixture.fid,
      castle: fixture.castle,
      workerId: secondWorkerId!,
      resourceKind: 'gold',
      siteId,
      idempotencyKey: 'occupied-node-second-dispatch',
    }),
    /WORKER_SITE_OCCUPIED/,
  );
  assert.deepEqual(fixture.counts(), afterFirstDispatch);
  assert.equal(fixture.workers.get(secondWorkerId!)?.status, 'idle');

  const legacyCollision = makeLifecycleFixture();
  legacyCollision.seedLegacyGoldOccupation(siteId);
  const legacyCollisionBefore = legacyCollision.counts();
  assert.throws(
    () => dispatchCastleWorker(legacyCollision.ctx, {
      fid: legacyCollision.fid,
      castle: legacyCollision.castle,
      workerId: [...legacyCollision.workers.keys()].sort()[0]!,
      resourceKind: 'gold',
      siteId,
      idempotencyKey: 'legacy-node-collision',
    }),
    /WORKER_LEGACY_DRAIN_REQUIRED/,
  );
  assert.deepEqual(legacyCollision.counts(), legacyCollisionBefore);

  const stagedCollision = makeLifecycleFixture({
    initialWorkerSystem: 'absent',
    initialRoster: 'empty',
  });
  stageWorkerSystem(stagedCollision.ctx);
  backfillWorkerRoster(stagedCollision.ctx);
  stagedCollision.seedGenericOccupation('gold', siteId);
  assert.throws(
    () => assertLegacyExpeditionDispatchAllowed(
      stagedCollision.ctx,
      'gold',
      siteId,
    ),
    /LEGACY_SITE_OCCUPIED_BY_WORKER/,
  );
});

test('stateful rollout stages, deterministically backfills, drains, and activates exact authority', () => {
  const fixture = makeLifecycleFixture({
    initialWorkerSystem: 'absent',
    initialRoster: 'empty',
  });
  assert.equal(fixture.workerSystem(), null);
  assert.equal(fixture.workers.size, 0);

  const staged = stageWorkerSystem(fixture.ctx);
  assert.equal(staged.mode, 'staged');
  assert.equal(staged.legacyDrainRequired, false);
  assert.equal(fixture.workers.size, 0);
  assert.deepEqual(fixture.counts(), {
    assignments: 0,
    occupations: 0,
    schedules: 0,
    receipts: 0,
  });

  const firstBackfill = backfillWorkerRoster(fixture.ctx);
  assert.equal(firstBackfill.insertedWorkers, CASTLE_WORKERS_PER_CASTLE);
  assert.deepEqual(
    [...fixture.workers.keys()].sort(),
    expectedWorkerRowsForCastle(fixture.castle)
      .map(worker => worker.workerId)
      .sort(),
  );
  const rosterAfterFirstBackfill = [...fixture.workers.values()];
  const replayedBackfill = backfillWorkerRoster(fixture.ctx);
  assert.equal(replayedBackfill.insertedWorkers, 0);
  assert.deepEqual(
    [...fixture.workers.values()],
    rosterAfterFirstBackfill,
  );

  const draining = beginWorkerLegacyDrain(fixture.ctx);
  assert.equal(draining.mode, 'staged');
  assert.equal(draining.legacyDrainRequired, true);
  assert.throws(
    () => dispatchCastleWorker(fixture.ctx, {
      fid: fixture.fid,
      castle: fixture.castle,
      workerId: [...fixture.workers.keys()].sort()[0]!,
      resourceKind: 'gold',
      siteId: fixture.sites[0]!.siteId,
      idempotencyKey: 'dispatch-before-worker-activation',
    }),
    /WORKER_SYSTEM_STAGED/,
  );
  assert.deepEqual(fixture.counts(), {
    assignments: 0,
    occupations: 0,
    schedules: 0,
    receipts: 0,
  });

  const reviewed: Parameters<typeof activateWorkerSystem>[1] = Object.freeze({
    capability: CASTLE_WORKER_PROTOCOL_CAPABILITY,
    clientRelease: 'alpha-0.3.14',
    clientArtifactDigest: 'a'.repeat(64),
    moduleArtifactDigest: 'c'.repeat(64),
    sourceCommit: 'b'.repeat(40),
    resourceStateVersion: CASTLE_WORKER_RESOURCE_STATE_VERSION,
    resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
    expectedCastleCount: 1,
    expectedWorkerCount: CASTLE_WORKERS_PER_CASTLE,
    rosterDigest: rosterDigestForCastleIds([fixture.castle.castleId]),
    resourceRosterDigest: resourceRosterDigest([fixture.account()]),
  });
  const ready = inspectWorkerRollout(fixture.ctx, reviewed);
  assert.equal(ready.phase, 'draining');
  assert.equal(ready.activationReady, true);
  assert.deepEqual(ready.activationBlockers, []);

  const active = activateWorkerSystem(fixture.ctx, reviewed);
  assert.equal(active.mode, 'active');
  assert.equal(active.legacyDrainRequired, false);
  assert.deepEqual(fixture.counts(), {
    assignments: 0,
    occupations: 0,
    schedules: 0,
    receipts: 0,
  });

  const workerId = [...fixture.workers.keys()].sort()[0]!;
  const dispatched = dispatchCastleWorker(fixture.ctx, {
    fid: fixture.fid,
    castle: fixture.castle,
    workerId,
    resourceKind: 'gold',
    siteId: fixture.sites[0]!.siteId,
    idempotencyKey: 'dispatch-after-worker-activation',
  });
  assert.equal(dispatched.idempotent, false);
  assert.ok(dispatched.assignment);
  assert.equal(dispatched.assignment.workerId, workerId);
  assert.deepEqual(fixture.counts(), {
    assignments: 1,
    occupations: 1,
    schedules: 1,
    receipts: 1,
  });
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
  assert.throws(
    () => dispatchCastleWorker(missingAuthority.ctx, {
      fid: missingAuthority.fid,
      castle: missingAuthority.castle,
      workerId,
      resourceKind: 'gold',
      siteId: missingAuthority.sites[0]!.siteId,
      idempotencyKey: 'dispatch-orphan-state-01',
    }),
    /WORKER_IDEMPOTENCY_STALE/,
  );
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
  assert.ok(result.assignment);
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
