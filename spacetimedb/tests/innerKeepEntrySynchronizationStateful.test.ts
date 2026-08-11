import assert from 'node:assert/strict';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

import type * as InnerKeepAuthority from '../src/innerKeepAuthority';
import { CANONICAL_INNER_KEEP_LAYOUT } from '../src/innerKeepLayoutPolicy';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  CANONICAL_INNER_KEEP_LEVEL_POLICIES,
  INNER_KEEP_POLICY_VERSION,
} from '../src/innerKeepPolicy';

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

async function loadExactProductionModule<Module>(sourceUrl: URL): Promise<Module> {
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
  const exactInput = relative(repositoryRoot, sourcePath).split(sep).join('/');
  assert.ok(Object.hasOwn(result.metafile.inputs, exactInput));
  const encoded = Buffer.from(result.outputFiles[0]!.contents).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`) as Promise<Module>;
}

const {
  InnerKeepAuthorityError,
  innerKeepEntryErrorCode,
  inspectInnerKeep,
  synchronizeMyInnerKeepEntry,
} = await loadExactProductionModule<typeof InnerKeepAuthority>(
  new URL('../src/innerKeepAuthority.ts', import.meta.url),
);

type AnyRow = Record<string, any>;
type SynchronizationContext = Parameters<typeof synchronizeMyInnerKeepEntry>[0];
type SynchronizationCastle = Parameters<typeof synchronizeMyInnerKeepEntry>[1];

const permitOverdueWrite = () => undefined;

function timestamp(microsSinceUnixEpoch: bigint) {
  return { microsSinceUnixEpoch };
}

function zeroCountTable() {
  return { count: () => 0n };
}

type FixtureOptions = Readonly<{
  active?: boolean;
  now?: 'on-time' | 'overdue';
  schedule?: 'exact' | 'missing' | 'corrupt' | 'wrong-time';
  builder?: 'canonical' | 'wrong-project';
}>;

function makeFixture(options: FixtureOptions = {}) {
  const fid = 77_001n;
  const castleId = 1n;
  const startedAtMicros = 1_900_000_000_000_000n;
  const level = CANONICAL_INNER_KEEP_LEVEL_POLICIES.find(row => (
    row.buildingKind === 'city-mill' && row.targetLevel === 1
  ))!;
  const completesAtMicros = startedAtMicros + level.durationMicros;
  const observedAtMicros = options.now === 'on-time'
    ? completesAtMicros - 1n
    : completesAtMicros + 1n;
  const castle: SynchronizationCastle = {
    castleId,
    ownerFid: fid,
    tileKey: 'fixture-tile',
    q: 0,
    r: 0,
    level: 1,
    name: 'Synchronization Keep',
    createdAt: timestamp(startedAtMicros),
  } as SynchronizationCastle;
  const layout = {
    ...CANONICAL_INNER_KEEP_LAYOUT,
    active: options.active !== false,
    createdAt: timestamp(startedAtMicros),
    activatedAt: timestamp(startedAtMicros),
  };
  const catalogs = new Map(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => {
    const { baseCost: _baseCost, ...stored } = row;
    return [stored.buildingKind, { ...stored }] as const;
  }));
  const levels = new Map(CANONICAL_INNER_KEEP_LEVEL_POLICIES.map(row => [
    row.levelKey,
    { ...row },
  ]));
  const buildingKey = `${castleId.toString()}:city-mill`;
  const buildings = new Map<string, AnyRow>([[buildingKey, {
    buildingKey,
    castleId,
    buildingKind: 'city-mill',
    localXMicrounits: -30_000_000n,
    localZMicrounits: -25_000_000n,
    rotationMilliDegrees: 0,
    completedLevel: 0,
    targetLevel: 1,
    phase: 'constructing',
    startedAtMicros,
    completesAtMicros,
    revision: 0n,
    policyVersion: INNER_KEEP_POLICY_VERSION,
  }]]);
  let builder: AnyRow = {
    castleId,
    fid,
    activeBuildingKey: options.builder === 'wrong-project' ? `${castleId}:lumber-camp` : buildingKey,
    busyUntilMicros: completesAtMicros,
    revision: 1n,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    createdAt: timestamp(startedAtMicros),
    updatedAt: timestamp(startedAtMicros),
  };
  const schedules = new Map<bigint, AnyRow>();
  if (options.schedule !== 'missing') {
    schedules.set(1n, {
      scheduleId: 1n,
      scheduledAt: {
        tag: 'Time',
        value: timestamp(options.schedule === 'wrong-time'
          ? completesAtMicros + 1n
          : completesAtMicros),
      },
      buildingKey,
      expectedRevision: options.schedule === 'corrupt' ? 9n : 0n,
      expectedTargetLevel: 1,
    });
  }
  const receipts = new Map([['77:entry-sync', {
    receiptKey: '77:entry-sync',
    localXMicrounits: -30_000_000n,
    localZMicrounits: -25_000_000n,
    rotationMilliDegrees: 0,
    deductedFood: 300n,
    deductedWood: 900n,
    deductedStone: 600n,
    deductedGold: 0n,
  }]]);
  const resources = new Map([[fid, {
    food: 700n,
    wood: 100n,
    stone: 400n,
    gold: 1_000n,
    revision: 1n,
  }]]);

  const ctx = {
    timestamp: timestamp(observedAtMicros),
    db: {
      innerKeepLayoutV1: {
        count: () => 1n,
        layoutId: { find: (key: string) => key === layout.layoutId ? layout : null },
      },
      innerKeepSlotV1: {
        count: () => 0n,
        slotId: { find: (_key: string) => null },
      },
      innerKeepBuildingCatalogV1: {
        count: () => BigInt(catalogs.size),
        buildingKind: { find: (key: string) => catalogs.get(key) ?? null },
      },
      innerKeepBuildLevelV1: {
        count: () => BigInt(levels.size),
        levelKey: { find: (key: string) => levels.get(key) ?? null },
      },
      castle: {
        count: () => 1n,
        iter: () => [castle],
        castleId: { find: (key: bigint) => key === castleId ? castle : null },
      },
      castleInnerBuilderV1: {
        count: () => 1n,
        iter: () => [builder],
        castleId: {
          find: (key: bigint) => key === castleId ? builder : null,
          update: (row: AnyRow) => {
            builder = { ...row };
            return builder;
          },
        },
        fid: { find: (key: bigint) => key === fid ? builder : null },
      },
      castleInnerKeepBuildingV1: {
        count: () => BigInt(buildings.size),
        iter: () => buildings.values(),
        byCastle: {
          filter: (key: bigint) => [...buildings.values()].filter(row => row.castleId === key),
        },
        buildingKey: {
          find: (key: string) => buildings.get(key) ?? null,
          update: (row: AnyRow) => {
            buildings.set(row.buildingKey, { ...row });
            return row;
          },
        },
      },
      castleInnerConstructionScheduleV1: {
        count: () => BigInt(schedules.size),
        iter: () => schedules.values(),
        byBuilding: {
          filter: (key: string) => [...schedules.values()].filter(row => row.buildingKey === key),
        },
        scheduleId: {
          delete: (key: bigint) => schedules.delete(key),
        },
      },
      castleInnerBuildReceiptV1: { count: () => BigInt(receipts.size) },
      realmWorkerSystemV1: {
        count: () => 1n,
        realmId: {
          find: (realmId: string) => realmId === 'GENESIS_001'
            ? {
              mode: 'active',
              legacyDrainRequired: false,
              expectedCastleCount: 1,
              expectedWorkerCount: 4,
            }
            : null,
        },
      },
      castleWorkerV1: { count: () => 4n },
      goldExpeditionV1: zeroCountTable(),
      foodExpeditionV1: zeroCountTable(),
      woodExpeditionV1: zeroCountTable(),
      stoneExpeditionV1: zeroCountTable(),
      goldNodeOccupationV1: zeroCountTable(),
      foodNodeOccupationV1: zeroCountTable(),
      woodNodeOccupationV1: zeroCountTable(),
      stoneNodeOccupationV1: zeroCountTable(),
      goldExpeditionScheduleV1: zeroCountTable(),
      foodExpeditionScheduleV1: zeroCountTable(),
      woodExpeditionScheduleV1: zeroCountTable(),
      stoneExpeditionScheduleV1: zeroCountTable(),
    },
  } as unknown as SynchronizationContext;

  const state = () => structuredClone({
    builder,
    buildings: [...buildings.entries()],
    schedules: [...schedules.entries()],
    receipts: [...receipts.entries()],
    resources: [...resources.entries()],
  });

  return {
    buildingKey,
    castle,
    ctx,
    getBuilder: () => builder,
    getBuilding: () => buildings.get(buildingKey)!,
    schedules,
    state,
  };
}

test('on-time entry validates the exact schedule without mutation', () => {
  const fixture = makeFixture({ now: 'on-time', schedule: 'exact' });
  const before = fixture.state();
  let guardCalls = 0;
  synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, () => {
    guardCalls += 1;
    throw new Error('on-time polling must not enter the mutation checkpoint');
  });
  assert.equal(guardCalls, 0);
  assert.deepEqual(fixture.state(), before);
});

test('overdue entry completes one exact scheduled project', () => {
  const fixture = makeFixture({ now: 'overdue', schedule: 'exact' });
  const before = fixture.state();
  let guardCalls = 0;
  synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, () => {
    guardCalls += 1;
    assert.deepEqual(fixture.state(), before);
  });
  assert.equal(guardCalls, 1);
  assert.equal(fixture.getBuilding().phase, 'complete');
  assert.equal(fixture.getBuilding().completedLevel, 1);
  assert.equal(fixture.getBuilding().revision, 1n);
  assert.equal(fixture.getBuilder().activeBuildingKey, undefined);
  assert.equal(fixture.getBuilder().busyUntilMicros, undefined);
  assert.equal(fixture.getBuilder().revision, 2n);
  assert.equal(fixture.schedules.size, 0);
});

test('overdue entry recovers a lost schedule once and never refunds or re-receipts', () => {
  const fixture = makeFixture({ now: 'overdue', schedule: 'missing' });
  const before = fixture.state();
  synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, permitOverdueWrite);
  const afterFirst = fixture.state();
  assert.equal(fixture.getBuilding().phase, 'complete');
  assert.deepEqual(afterFirst.receipts, before.receipts);
  assert.deepEqual(afterFirst.resources, before.resources);

  synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, permitOverdueWrite);
  assert.deepEqual(fixture.state(), afterFirst);
});

test('a rejected overdue mutation checkpoint preserves every row byte-for-byte', () => {
  const fixture = makeFixture({ now: 'overdue', schedule: 'exact' });
  const before = fixture.state();
  let guardCalls = 0;
  assert.throws(
    () => synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, () => {
      guardCalls += 1;
      assert.deepEqual(fixture.state(), before);
      throw new Error('FULL_GAMEPLAY_CHECKPOINT_REJECTED');
    }),
    /FULL_GAMEPLAY_CHECKPOINT_REJECTED/,
  );
  assert.equal(guardCalls, 1);
  assert.deepEqual(fixture.state(), before);
});

test('a missing on-time schedule fails without partial mutation', () => {
  const fixture = makeFixture({ now: 'on-time', schedule: 'missing' });
  const before = fixture.state();
  assert.throws(
    () => synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, permitOverdueWrite),
    /INNER_KEEP_SCHEDULE_INTEGRITY/,
  );
  assert.deepEqual(fixture.state(), before);
});

test('a corrupt overdue schedule fails without being erased or completing', () => {
  const fixture = makeFixture({ now: 'overdue', schedule: 'corrupt' });
  const before = fixture.state();
  assert.throws(
    () => synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, permitOverdueWrite),
    /INNER_KEEP_SCHEDULE_INTEGRITY/,
  );
  assert.deepEqual(fixture.state(), before);
});

test('a schedule at the wrong server time fails the shared exact predicate', () => {
  const fixture = makeFixture({ now: 'overdue', schedule: 'wrong-time' });
  const before = fixture.state();
  assert.throws(
    () => synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, permitOverdueWrite),
    /INNER_KEEP_SCHEDULE_INTEGRITY/,
  );
  assert.deepEqual(fixture.state(), before);
});

test('a corrupt Builder/project edge fails without partial mutation', () => {
  const fixture = makeFixture({
    builder: 'wrong-project',
    now: 'overdue',
    schedule: 'missing',
  });
  const before = fixture.state();
  assert.throws(
    () => synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, permitOverdueWrite),
    /INNER_KEEP_BUILDER_INTEGRITY/,
  );
  assert.deepEqual(fixture.state(), before);
});

test('inactive entry is explicitly projection-only even when a project is overdue', () => {
  const fixture = makeFixture({ active: false, now: 'overdue', schedule: 'missing' });
  const before = fixture.state();
  let guardCalls = 0;
  synchronizeMyInnerKeepEntry(fixture.ctx, fixture.castle, () => {
    guardCalls += 1;
  });
  assert.equal(guardCalls, 0);
  assert.deepEqual(fixture.state(), before);
  assert.equal(fixture.getBuilding().phase, 'constructing');
});

test('aggregate inspection catches missing schedules and project-to-Builder mismatches', () => {
  const missingSchedule = makeFixture({ now: 'on-time', schedule: 'missing' });
  const missingScheduleStatus = inspectInnerKeep(missingSchedule.ctx);
  assert.equal(missingScheduleStatus.invalidSchedules, 1n);
  assert.equal(missingScheduleStatus.builderProjectMismatches, 0n);

  const wrongBuilder = makeFixture({
    builder: 'wrong-project',
    now: 'on-time',
    schedule: 'exact',
  });
  const wrongBuilderStatus = inspectInnerKeep(wrongBuilder.ctx);
  assert.ok(wrongBuilderStatus.builderProjectMismatches >= 1n);

  const wrongTime = makeFixture({ now: 'on-time', schedule: 'wrong-time' });
  assert.equal(inspectInnerKeep(wrongTime.ctx).invalidSchedules, 1n);
});

test('entry error classification exposes availability but closes private graph failures', () => {
  assert.equal(
    innerKeepEntryErrorCode(new InnerKeepAuthorityError('INNER_KEEP_UNAVAILABLE')),
    'INNER_KEEP_UNAVAILABLE',
  );
  assert.equal(
    innerKeepEntryErrorCode(new InnerKeepAuthorityError('INNER_KEEP_BACKEND_SYNCHRONIZING')),
    'INNER_KEEP_BACKEND_SYNCHRONIZING',
  );
  assert.equal(
    innerKeepEntryErrorCode(new InnerKeepAuthorityError('INNER_KEEP_SCHEDULE_INTEGRITY')),
    'INNER_KEEP_STATE_INTEGRITY',
  );
  assert.equal(
    innerKeepEntryErrorCode(new InnerKeepAuthorityError('INNER_KEEP_BUILDER_INTEGRITY')),
    'INNER_KEEP_STATE_INTEGRITY',
  );
  assert.equal(innerKeepEntryErrorCode(new Error('private detail')), undefined);
});
