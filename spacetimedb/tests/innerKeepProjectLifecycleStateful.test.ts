import assert from 'node:assert/strict';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';

import type * as InnerKeepAuthority from '../src/innerKeepAuthority';
import {
  CANONICAL_INNER_KEEP_LAYOUT,
  INNER_KEEP_LAYOUT_DIGEST,
  type InnerKeepPlacementTransform,
} from '../src/innerKeepLayoutPolicy';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  CANONICAL_INNER_KEEP_LEVEL_POLICIES,
  canonicalInnerKeepCost,
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION,
  INNER_KEEP_RESOURCE_BALANCE_CAP,
  type InnerKeepBuildingKind,
} from '../src/innerKeepPolicy';

const productionDependencyHarness: Plugin = {
  name: 'warpkeep-inner-keep-stateful-runtime',
  setup(buildContext) {
    buildContext.onResolve(
      { filter: /^spacetimedb(?:\/server)?$/ },
      args => ({ path: args.path, namespace: 'warpkeep-inner-keep-sdk' }),
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: 'warpkeep-inner-keep-sdk' },
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
    buildContext.onResolve(
      { filter: /castleWorkerAuthority$/ },
      () => ({ path: 'castle-worker-authority', namespace: 'warpkeep-inner-keep-dependency' }),
    );
    buildContext.onResolve(
      { filter: /resourceAuthority$/ },
      () => ({ path: 'resource-authority', namespace: 'warpkeep-inner-keep-dependency' }),
    );
    buildContext.onLoad(
      { filter: /.*/, namespace: 'warpkeep-inner-keep-dependency' },
      args => ({
        loader: 'js',
        contents: args.path === 'castle-worker-authority'
          ? `
              export function settleAllWorkerAssignmentsForFid(ctx, fid, now) {
                ctx.__innerKeepTestSettle(fid, now);
              }
              export function projectMyWorkerStateForCurrentGameplayV1(ctx, fid, now) {
                return ctx.__innerKeepTestProject(fid, now);
              }
            `
          : `
              export function assertGenesisResourceForFid(ctx, fid) {
                return { account: ctx.__innerKeepTestResource(fid) };
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
    plugins: [productionDependencyHarness],
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
  runInnerKeepConstructionSchedule,
  startInnerKeepProject,
} = await loadExactProductionModule<typeof InnerKeepAuthority>(
  new URL('../src/innerKeepAuthority.ts', import.meta.url),
);

type AnyRow = Record<string, any>;
type StartContext = Parameters<typeof startInnerKeepProject>[0];
type StartCastle = Parameters<typeof startInnerKeepProject>[1]['castle'];
type ScheduleInput = Parameters<typeof runInnerKeepConstructionSchedule>[1];

const STARTED_AT_MICROS = 1_900_000_000_000_000n;
const FID = 77_001n;
const CASTLE_ID = 1n;

const DEFAULT_PLACEMENTS: Readonly<Record<InnerKeepBuildingKind, InnerKeepPlacementTransform>> =
  Object.freeze({
    'city-mill': Object.freeze({
      localXMicrounits: -30_000_000n,
      localZMicrounits: -25_000_000n,
      rotationMilliDegrees: 0,
    }),
    'lumber-camp': Object.freeze({
      localXMicrounits: -17_000_000n,
      localZMicrounits: -25_000_000n,
      rotationMilliDegrees: 90_000,
    }),
    'city-stoneworks': Object.freeze({
      localXMicrounits: 18_000_000n,
      localZMicrounits: -25_000_000n,
      rotationMilliDegrees: 0,
    }),
    'city-goldworks': Object.freeze({
      localXMicrounits: 31_000_000n,
      localZMicrounits: -25_000_000n,
      rotationMilliDegrees: 90_000,
    }),
    'city-barracks': Object.freeze({
      localXMicrounits: -30_000_000n,
      localZMicrounits: 15_000_000n,
      rotationMilliDegrees: 0,
    }),
    'grand-covenant-cathedral': Object.freeze({
      localXMicrounits: 24_000_000n,
      localZMicrounits: 12_000_000n,
      rotationMilliDegrees: 0,
    }),
  });

function timestamp(microsSinceUnixEpoch: bigint) {
  return { microsSinceUnixEpoch };
}

function zeroCountTable() {
  return { count: () => 0n };
}

function requestKey(label: string, ordinal = 0): string {
  return `inner-keep-${label}-${ordinal.toString().padStart(3, '0')}`;
}

function replaceMap<Key, Value>(map: Map<Key, Value>, entries: readonly (readonly [Key, Value])[]): void {
  map.clear();
  for (const [key, value] of entries) map.set(key, structuredClone(value));
}

type FixtureOptions = Readonly<{
  balance?: bigint;
  settlementAward?: bigint;
}>;

function makeFixture(options: FixtureOptions = {}) {
  const layout = {
    ...CANONICAL_INNER_KEEP_LAYOUT,
    active: true,
    createdAt: timestamp(STARTED_AT_MICROS - 1_000_000n),
    activatedAt: timestamp(STARTED_AT_MICROS - 500_000n),
  };
  const catalogs = new Map(CANONICAL_INNER_KEEP_BUILDING_CATALOG.map(row => {
    const { baseCost: _baseCost, ...stored } = row;
    return [stored.buildingKind, { ...stored }] as const;
  }));
  const levels = new Map(CANONICAL_INNER_KEEP_LEVEL_POLICIES.map(row => [row.levelKey, { ...row }]));
  const castle: StartCastle = {
    castleId: CASTLE_ID,
    ownerFid: FID,
    tileKey: '0,0',
    q: 0,
    r: 0,
    level: 1,
    name: 'Stateful Keep',
    createdAt: timestamp(STARTED_AT_MICROS - 2_000_000n),
  } as StartCastle;
  let builder: AnyRow = {
    castleId: CASTLE_ID,
    fid: FID,
    activeBuildingKey: undefined,
    busyUntilMicros: undefined,
    revision: 0n,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    createdAt: timestamp(STARTED_AT_MICROS - 500_000n),
    updatedAt: timestamp(STARTED_AT_MICROS - 500_000n),
  };
  let resource: AnyRow = {
    fid: FID,
    castleId: CASTLE_ID,
    realmId: 'GENESIS_001',
    food: options.balance ?? 10_000n,
    wood: options.balance ?? 10_000n,
    stone: options.balance ?? 10_000n,
    gold: options.balance ?? 10_000n,
    settledThroughMicros: STARTED_AT_MICROS - 60_000_000n,
    revision: 0n,
    policyVersion: 'genesis-001-resources-v1',
    createdAt: timestamp(STARTED_AT_MICROS - 1_000_000n),
    updatedAt: timestamp(STARTED_AT_MICROS - 1_000_000n),
  };
  const buildings = new Map<string, AnyRow>();
  const receipts = new Map<string, AnyRow>();
  const schedules = new Map<bigint, AnyRow>();
  let nextScheduleId = 1n;
  let now = STARTED_AT_MICROS;
  let corruptCompletionWrite = false;
  const settlementCalls: Array<Readonly<{ fid: bigint; now: bigint }>> = [];
  const snapshot = () => structuredClone({
    builder,
    resource,
    buildings: [...buildings.entries()],
    receipts: [...receipts.entries()],
    schedules: [...schedules.entries()],
    nextScheduleId,
  });

  const restore = (state: ReturnType<typeof snapshot>) => {
    builder = structuredClone(state.builder);
    resource = structuredClone(state.resource);
    replaceMap(buildings, state.buildings);
    replaceMap(receipts, state.receipts);
    replaceMap(schedules, state.schedules);
    nextScheduleId = state.nextScheduleId;
  };

  const ctx = {
    get timestamp() {
      return timestamp(now);
    },
    __innerKeepTestSettle(fid: bigint, observedAtMicros: bigint) {
      assert.equal(fid, FID);
      settlementCalls.push(Object.freeze({ fid, now: observedAtMicros }));
      if (observedAtMicros <= resource.settledThroughMicros) return;
      const award = options.settlementAward ?? 0n;
      if (award > 0n) {
        resource = {
          ...resource,
          food: resource.food + award > INNER_KEEP_RESOURCE_BALANCE_CAP
            ? INNER_KEEP_RESOURCE_BALANCE_CAP
            : resource.food + award,
          wood: resource.wood + award > INNER_KEEP_RESOURCE_BALANCE_CAP
            ? INNER_KEEP_RESOURCE_BALANCE_CAP
            : resource.wood + award,
          stone: resource.stone + award > INNER_KEEP_RESOURCE_BALANCE_CAP
            ? INNER_KEEP_RESOURCE_BALANCE_CAP
            : resource.stone + award,
          gold: resource.gold + award > INNER_KEEP_RESOURCE_BALANCE_CAP
            ? INNER_KEEP_RESOURCE_BALANCE_CAP
            : resource.gold + award,
          settledThroughMicros: observedAtMicros,
          revision: resource.revision + 1n,
          updatedAt: timestamp(observedAtMicros),
        };
      }
    },
    __innerKeepTestProject(fid: bigint) {
      assert.equal(fid, FID);
      return { balances: resource };
    },
    __innerKeepTestResource(fid: bigint) {
      assert.equal(fid, FID);
      return resource;
    },
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
        castleId: { find: (key: bigint) => key === CASTLE_ID ? castle : null },
      },
      castleInnerBuilderV1: {
        castleId: {
          find: (key: bigint) => key === CASTLE_ID ? builder : null,
          update: (row: AnyRow) => {
            builder = corruptCompletionWrite
              && row.activeBuildingKey === undefined
              && builder.activeBuildingKey !== undefined
              ? { ...row, activeBuildingKey: builder.activeBuildingKey, busyUntilMicros: builder.busyUntilMicros }
              : { ...row };
            return builder;
          },
        },
        fid: { find: (key: bigint) => key === FID ? builder : null },
      },
      castleInnerKeepBuildingV1: {
        count: () => BigInt(buildings.size),
        byCastle: {
          filter: (key: bigint) => [...buildings.values()].filter(row => row.castleId === key),
        },
        buildingKey: {
          find: (key: string) => buildings.get(key) ?? null,
          update: (row: AnyRow) => {
            if (!buildings.has(row.buildingKey)) throw new Error('TEST_BUILDING_UPDATE_MISSING');
            buildings.set(row.buildingKey, { ...row });
            return row;
          },
        },
        insert: (row: AnyRow) => {
          if (buildings.has(row.buildingKey)) throw new Error('TEST_BUILDING_DUPLICATE');
          buildings.set(row.buildingKey, { ...row });
          return row;
        },
      },
      castleInnerBuildReceiptV1: {
        count: () => BigInt(receipts.size),
        receiptKey: { find: (key: string) => receipts.get(key) ?? null },
        insert: (row: AnyRow) => {
          if (receipts.has(row.receiptKey)) throw new Error('TEST_RECEIPT_DUPLICATE');
          receipts.set(row.receiptKey, { ...row });
          return row;
        },
      },
      castleInnerConstructionScheduleV1: {
        count: () => BigInt(schedules.size),
        byBuilding: {
          filter: (key: string) => [...schedules.values()].filter(row => row.buildingKey === key),
        },
        scheduleId: {
          find: (key: bigint) => schedules.get(key) ?? null,
          delete: (key: bigint) => schedules.delete(key),
        },
        insert: (row: AnyRow) => {
          const inserted = { ...row, scheduleId: nextScheduleId };
          schedules.set(nextScheduleId, inserted);
          nextScheduleId += 1n;
          return inserted;
        },
      },
      resourceAccountV1: {
        fid: {
          find: (key: bigint) => key === FID ? resource : null,
          update: (row: AnyRow) => {
            resource = { ...row };
            return resource;
          },
        },
      },
      realmWorkerSystemV1: {
        count: () => 1n,
        realmId: {
          find: (key: string) => key === 'GENESIS_001'
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
  } as unknown as StartContext;

  function transaction<Result>(work: () => Result): Result {
    const before = snapshot();
    try {
      return work();
    } catch (error) {
      restore(before);
      throw error;
    }
  }

  function start(
    buildingKind: InnerKeepBuildingKind,
    key: string,
    placement: InnerKeepPlacementTransform = DEFAULT_PLACEMENTS[buildingKind],
    expected: Readonly<{
      expectedTargetLevel?: number;
      expectedProjectRevision?: string;
      expectedPolicyDigest?: string;
      expectedLayoutDigest?: string;
    }> = {},
  ) {
    const existing = buildings.get(`${CASTLE_ID.toString()}:${buildingKind}`);
    const projectRevision = builder.revision
      + resource.revision
      + [...buildings.values()].reduce((sum, building) => sum + building.revision, 0n);
    return transaction(() => startInnerKeepProject(ctx, {
      fid: FID,
      castle,
      buildingKind,
      localXMicrounits: placement.localXMicrounits,
      localZMicrounits: placement.localZMicrounits,
      rotationMilliDegrees: placement.rotationMilliDegrees,
      requestKey: key,
      expectedTargetLevel: expected.expectedTargetLevel ?? ((existing?.completedLevel ?? 0) + 1),
      expectedProjectRevision: expected.expectedProjectRevision ?? projectRevision.toString(),
      expectedPolicyDigest: expected.expectedPolicyDigest ?? INNER_KEEP_POLICY_DIGEST,
      expectedLayoutDigest: expected.expectedLayoutDigest ?? INNER_KEEP_LAYOUT_DIGEST,
    }));
  }

  return {
    builder: () => builder,
    buildings,
    castle,
    ctx,
    receipts,
    resource: () => resource,
    projectRevision: () => builder.revision
      + resource.revision
      + [...buildings.values()].reduce((sum, building) => sum + building.revision, 0n),
    schedules,
    settlementCalls,
    snapshot,
    start,
    transaction,
    setBalance(kind: 'food' | 'wood' | 'stone' | 'gold', value: bigint) {
      resource = { ...resource, [kind]: value };
    },
    setNow(value: bigint) {
      now = value;
    },
    setCorruptCompletionWrite(value: boolean) {
      corruptCompletionWrite = value;
    },
    mutateBuilder(mutator: (row: AnyRow) => AnyRow) {
      builder = mutator(structuredClone(builder));
    },
  };
}

function onlySchedule(fixture: ReturnType<typeof makeFixture>): AnyRow {
  assert.equal(fixture.schedules.size, 1);
  return structuredClone([...fixture.schedules.values()][0]!);
}

test('a serialized twenty-request distinct-key burst accepts one project exactly once', () => {
  const fixture = makeFixture();
  const beforeResource = fixture.resource();
  const first = fixture.start('city-mill', requestKey('tab-a'));
  assert.equal(first.idempotent, false);

  assert.throws(
    () => fixture.start('lumber-camp', requestKey('tab-b')),
    /INNER_KEEP_BUILDER_BUSY/,
  );
  for (let index = 0; index < 18; index += 1) {
    assert.throws(
      () => fixture.start('city-stoneworks', requestKey('rapid', index)),
      /INNER_KEEP_BUILDER_BUSY/,
    );
  }

  assert.equal(fixture.buildings.size, 1);
  assert.equal(fixture.schedules.size, 1);
  assert.equal(fixture.receipts.size, 1);
  assert.equal(fixture.resource().revision, beforeResource.revision + 1n);
  assert.deepEqual(
    {
      food: fixture.resource().food,
      wood: fixture.resource().wood,
      stone: fixture.resource().stone,
      gold: fixture.resource().gold,
    },
    { food: 9_700n, wood: 9_100n, stone: 9_400n, gold: 10_000n },
  );
  assert.equal(fixture.builder().activeBuildingKey, `${CASTLE_ID}:city-mill`);
});

test('twenty serialized same-key retries reuse one receipt', () => {
  const fixture = makeFixture();
  const key = requestKey('same-command');
  const outcomes = [fixture.start('city-mill', key)];
  for (let index = 1; index < 20; index += 1) {
    outcomes.push(fixture.start('city-mill', key));
  }
  assert.equal(outcomes.filter(outcome => !outcome.idempotent).length, 1);
  assert.equal(outcomes.filter(outcome => outcome.idempotent).length, 19);
  assert.equal(fixture.buildings.size, 1);
  assert.equal(fixture.schedules.size, 1);
  assert.equal(fixture.receipts.size, 1);
  assert.equal(fixture.resource().revision, 1n);
  assert.equal(fixture.settlementCalls.length, 1);
});

test('idempotent retries bind the accepted target while ignoring later CAS drift', () => {
  const fixture = makeFixture();
  const requestCorrelation = requestKey('same-command-target');
  fixture.start('city-mill', requestCorrelation);
  const afterFirst = fixture.snapshot();

  assert.throws(
    () => fixture.start('city-mill', requestCorrelation, {
      ...DEFAULT_PLACEMENTS['city-mill'],
      localXMicrounits: DEFAULT_PLACEMENTS['city-mill'].localXMicrounits + 500_000n,
    }),
    /INNER_KEEP_IDEMPOTENCY_CONFLICT/,
  );
  assert.deepEqual(fixture.snapshot(), afterFirst);

  assert.throws(
    () => fixture.start('city-mill', requestCorrelation, DEFAULT_PLACEMENTS['city-mill'], {
      expectedTargetLevel: 2,
      expectedProjectRevision: fixture.projectRevision().toString(),
    }),
    /INNER_KEEP_IDEMPOTENCY_CONFLICT/,
  );
  assert.deepEqual(fixture.snapshot(), afterFirst);

  const replay = fixture.start('city-mill', requestCorrelation, DEFAULT_PLACEMENTS['city-mill'], {
    expectedTargetLevel: 1,
    expectedProjectRevision: '0',
    expectedPolicyDigest: '0'.repeat(64),
    expectedLayoutDigest: '0'.repeat(64),
  });
  assert.equal(replay.idempotent, true);
  assert.deepEqual(fixture.snapshot(), afterFirst);
  assert.equal(fixture.settlementCalls.length, 1);
});

test('invalid free placements reject before settlement with zero persistent mutation', () => {
  const cases = [
    {
      label: 'off-grid',
      placement: {
        ...DEFAULT_PLACEMENTS['city-mill'],
        localXMicrounits: -30_250_000n,
      },
      code: /INNER_KEEP_PLACEMENT_OFF_GRID/,
    },
    {
      label: 'rotation',
      placement: {
        ...DEFAULT_PLACEMENTS['city-mill'],
        rotationMilliDegrees: 45_000,
      },
      code: /INNER_KEEP_PLACEMENT_ROTATION/,
    },
    {
      label: 'boundary',
      placement: {
        ...DEFAULT_PLACEMENTS['city-mill'],
        localXMicrounits: -38_500_000n,
      },
      code: /INNER_KEEP_PLACEMENT_OUTSIDE/,
    },
    {
      label: 'reserved',
      placement: {
        localXMicrounits: 0n,
        localZMicrounits: 0n,
        rotationMilliDegrees: 0,
      },
      code: /INNER_KEEP_PLACEMENT_RESERVED/,
    },
  ] as const;

  for (const scenario of cases) {
    const fixture = makeFixture();
    const before = fixture.snapshot();
    assert.throws(
      () => fixture.start('city-mill', requestKey(`invalid-placement-${scenario.label}`), scenario.placement),
      scenario.code,
    );
    assert.deepEqual(fixture.snapshot(), before);
    assert.equal(fixture.settlementCalls.length, 0);
    assert.equal(fixture.buildings.size, 0);
    assert.equal(fixture.receipts.size, 0);
    assert.equal(fixture.schedules.size, 0);
  }
});

test('serialized occupied-placement race preserves the first building and rejects the second atomically', () => {
  const fixture = makeFixture();
  fixture.start('city-stoneworks', requestKey('occupied-winner'));
  const callback = onlySchedule(fixture);
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runInnerKeepConstructionSchedule(
    fixture.ctx,
    callback as ScheduleInput,
  ));

  const before = fixture.snapshot();
  const settlementsBefore = fixture.settlementCalls.length;
  assert.throws(
    () => fixture.start(
      'city-goldworks',
      requestKey('occupied-loser'),
      DEFAULT_PLACEMENTS['city-stoneworks'],
    ),
    /INNER_KEEP_PLACEMENT_OCCUPIED/,
  );
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.settlementCalls.length, settlementsBefore);
  assert.equal(fixture.buildings.size, 1);
  assert.equal(fixture.receipts.size, 1);
  assert.equal(fixture.schedules.size, 0);
});

test('Barracks and Cathedral begin absent and can each be placed by a player', () => {
  for (const buildingKind of ['city-barracks', 'grand-covenant-cathedral'] as const) {
    const fixture = makeFixture();
    assert.equal(fixture.buildings.size, 0);
    const result = fixture.start(buildingKind, requestKey(`landmark-${buildingKind}`));
    assert.equal(result.building.buildingKind, buildingKind);
    assert.equal(result.building.completedLevel, 0);
    assert.equal(result.building.targetLevel, 1);
    assert.deepEqual({
      localXMicrounits: result.building.localXMicrounits,
      localZMicrounits: result.building.localZMicrounits,
      rotationMilliDegrees: result.building.rotationMilliDegrees,
    }, DEFAULT_PLACEMENTS[buildingKind]);
  }
});

test('stale policy digest rejects before reconciliation or settlement', () => {
  const fixture = makeFixture();
  const before = fixture.snapshot();
  assert.throws(
    () => fixture.start('city-mill', requestKey('stale-policy'), DEFAULT_PLACEMENTS['city-mill'], {
      expectedTargetLevel: 1,
      expectedProjectRevision: fixture.projectRevision().toString(),
      expectedPolicyDigest: '0'.repeat(64),
    }),
    /INNER_KEEP_STATE_CHANGED/,
  );
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.settlementCalls.length, 0);
});

test('stale placement-layout digest rejects before reconciliation or settlement', () => {
  const fixture = makeFixture();
  const before = fixture.snapshot();
  assert.throws(
    () => fixture.start('city-mill', requestKey('stale-layout'), DEFAULT_PLACEMENTS['city-mill'], {
      expectedTargetLevel: 1,
      expectedProjectRevision: fixture.projectRevision().toString(),
      expectedLayoutDigest: '0'.repeat(64),
    }),
    /INNER_KEEP_STATE_CHANGED/,
  );
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.settlementCalls.length, 0);
});

test('stale aggregate revision rejects before settlement even when the target is unchanged', () => {
  const fixture = makeFixture();
  const staleRevision = fixture.projectRevision().toString();
  fixture.start('lumber-camp', requestKey('revision-advance'));
  const callback = onlySchedule(fixture);
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runInnerKeepConstructionSchedule(
    fixture.ctx,
    callback as ScheduleInput,
  ));

  const before = fixture.snapshot();
  const settlementsBefore = fixture.settlementCalls.length;
  assert.throws(
    () => fixture.start('city-mill', requestKey('stale-revision'), DEFAULT_PLACEMENTS['city-mill'], {
      expectedTargetLevel: 1,
      expectedProjectRevision: staleRevision,
    }),
    /INNER_KEEP_STATE_CHANGED/,
  );
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.settlementCalls.length, settlementsBefore);
});

test('stale target rejects before settlement even with the current aggregate revision', () => {
  const fixture = makeFixture();
  fixture.start('city-mill', requestKey('target-level-one'));
  const callback = onlySchedule(fixture);
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runInnerKeepConstructionSchedule(
    fixture.ctx,
    callback as ScheduleInput,
  ));

  const before = fixture.snapshot();
  const settlementsBefore = fixture.settlementCalls.length;
  assert.throws(
    () => fixture.start('city-mill', requestKey('stale-target'), DEFAULT_PLACEMENTS['city-mill'], {
      expectedTargetLevel: 1,
      expectedProjectRevision: fixture.projectRevision().toString(),
    }),
    /INNER_KEEP_STATE_CHANGED/,
  );
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.settlementCalls.length, settlementsBefore);
});

test('overdue reconciliation advances the CAS before settlement and rolls back on mismatch', () => {
  const fixture = makeFixture();
  fixture.start('city-mill', requestKey('overdue-level-one'));
  const callback = onlySchedule(fixture);
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);
  const before = fixture.snapshot();
  const settlementsBefore = fixture.settlementCalls.length;
  const retainedRevision = fixture.projectRevision().toString();

  assert.throws(
    () => fixture.start('lumber-camp', requestKey('overdue-stale-revision'), DEFAULT_PLACEMENTS['lumber-camp'], {
      expectedTargetLevel: 1,
      expectedProjectRevision: retainedRevision,
    }),
    /INNER_KEEP_STATE_CHANGED/,
  );
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.settlementCalls.length, settlementsBefore);
});

test('non-canonical CAS inputs reject without settlement', () => {
  const fixture = makeFixture();
  const before = fixture.snapshot();
  const invalid = [
    { target: 1, revision: '', policyDigest: INNER_KEEP_POLICY_DIGEST },
    { target: 1, revision: '+0', policyDigest: INNER_KEEP_POLICY_DIGEST },
    { target: 1, revision: '00', policyDigest: INNER_KEEP_POLICY_DIGEST },
    { target: 1, revision: ' 0', policyDigest: INNER_KEEP_POLICY_DIGEST },
    { target: 1, revision: '110680464442257309691', policyDigest: INNER_KEEP_POLICY_DIGEST },
    { target: 0, revision: '0', policyDigest: INNER_KEEP_POLICY_DIGEST },
    { target: 6, revision: '0', policyDigest: INNER_KEEP_POLICY_DIGEST },
    { target: 1, revision: '0', policyDigest: '' },
    { target: 1, revision: '0', policyDigest: '0'.repeat(64) },
  ] as const;
  invalid.forEach(({ target, revision, policyDigest }, index) => {
    assert.throws(
      () => fixture.start('city-mill', requestKey('invalid-cas', index), DEFAULT_PLACEMENTS['city-mill'], {
        expectedTargetLevel: target,
        expectedProjectRevision: revision,
        expectedPolicyDigest: policyDigest,
      }),
      /INNER_KEEP_STATE_CHANGED/,
    );
    assert.deepEqual(fixture.snapshot(), before);
  });
  assert.equal(fixture.settlementCalls.length, 0);
});

test('harnessed same-timestamp settlement feeds the stored account before exact deduction', () => {
  const fixture = makeFixture({ settlementAward: 25n });
  const result = fixture.start('city-mill', requestKey('settlement'));

  assert.equal(fixture.settlementCalls.length, 1);
  assert.deepEqual(fixture.settlementCalls[0], { fid: FID, now: STARTED_AT_MICROS });
  assert.equal(fixture.resource().settledThroughMicros, STARTED_AT_MICROS);
  assert.equal(fixture.resource().revision, 2n);
  assert.deepEqual(
    {
      food: fixture.resource().food,
      wood: fixture.resource().wood,
      stone: fixture.resource().stone,
      gold: fixture.resource().gold,
    },
    { food: 9_725n, wood: 9_125n, stone: 9_425n, gold: 10_025n },
  );
  assert.deepEqual(
    {
      food: result.receipt.deductedFood,
      wood: result.receipt.deductedWood,
      stone: result.receipt.deductedStone,
      gold: result.receipt.deductedGold,
    },
    { food: 300n, wood: 900n, stone: 600n, gold: 0n },
  );
});

test('each insufficient resource rolls settlement and every project write back atomically', () => {
  const cost = canonicalInnerKeepCost('city-goldworks', 1, {}).effectiveCost;
  for (const [kind, code] of [
    ['food', 'INNER_KEEP_INSUFFICIENT_FOOD'],
    ['wood', 'INNER_KEEP_INSUFFICIENT_WOOD'],
    ['stone', 'INNER_KEEP_INSUFFICIENT_STONE'],
    ['gold', 'INNER_KEEP_INSUFFICIENT_GOLD'],
  ] as const) {
    const fixture = makeFixture({ settlementAward: 25n });
    fixture.setBalance(kind, cost[kind] - 26n);
    const before = fixture.snapshot();
    assert.throws(
      () => fixture.start('city-goldworks', requestKey(`insufficient-${kind}`)),
      new RegExp(code),
    );
    assert.deepEqual(fixture.snapshot(), before);
    assert.equal(fixture.settlementCalls.length, 1);
    assert.equal(fixture.buildings.size, 0);
    assert.equal(fixture.schedules.size, 0);
    assert.equal(fixture.receipts.size, 0);
    assert.equal(fixture.builder().activeBuildingKey, undefined);
  }
});

test('only the harnessed stored account can satisfy a project', () => {
  const insufficient = makeFixture();
  insufficient.setBalance('gold', 499n);
  assert.throws(
    () => insufficient.start('city-goldworks', requestKey('pending-not-spendable')),
    /INNER_KEEP_INSUFFICIENT_GOLD/,
  );
  assert.equal(insufficient.buildings.size, 0);
});

test('early, tampered, persisted-drift, and Builder-mismatch callbacks fail without mutation', () => {
  const cases = [
    {
      label: 'early',
      prepare(fixture: ReturnType<typeof makeFixture>, schedule: AnyRow) {
        fixture.setNow(schedule.scheduledAt.value.microsSinceUnixEpoch - 1n);
        return schedule;
      },
      code: /INNER_KEEP_COMPLETION_EARLY/,
    },
    {
      label: 'tampered-revision',
      prepare(fixture: ReturnType<typeof makeFixture>, schedule: AnyRow) {
        fixture.setNow(schedule.scheduledAt.value.microsSinceUnixEpoch);
        return { ...schedule, expectedRevision: schedule.expectedRevision + 1n };
      },
      code: /INNER_KEEP_SCHEDULE_INTEGRITY/,
    },
    {
      label: 'tampered-target',
      prepare(fixture: ReturnType<typeof makeFixture>, schedule: AnyRow) {
        fixture.setNow(schedule.scheduledAt.value.microsSinceUnixEpoch);
        return { ...schedule, expectedTargetLevel: schedule.expectedTargetLevel + 1 };
      },
      code: /INNER_KEEP_SCHEDULE_INTEGRITY/,
    },
    {
      label: 'persisted-revision-drift',
      prepare(fixture: ReturnType<typeof makeFixture>, schedule: AnyRow) {
        fixture.setNow(schedule.scheduledAt.value.microsSinceUnixEpoch);
        fixture.schedules.set(schedule.scheduleId, {
          ...schedule,
          expectedRevision: schedule.expectedRevision + 1n,
        });
        return schedule;
      },
      code: /INNER_KEEP_SCHEDULE_INTEGRITY/,
    },
    {
      label: 'persisted-target-drift',
      prepare(fixture: ReturnType<typeof makeFixture>, schedule: AnyRow) {
        fixture.setNow(schedule.scheduledAt.value.microsSinceUnixEpoch);
        fixture.schedules.set(schedule.scheduleId, {
          ...schedule,
          expectedTargetLevel: schedule.expectedTargetLevel + 1,
        });
        return schedule;
      },
      code: /INNER_KEEP_SCHEDULE_INTEGRITY/,
    },
    {
      label: 'builder-mismatch',
      prepare(fixture: ReturnType<typeof makeFixture>, schedule: AnyRow) {
        fixture.setNow(schedule.scheduledAt.value.microsSinceUnixEpoch);
        fixture.mutateBuilder(row => ({ ...row, activeBuildingKey: `${CASTLE_ID}:lumber-camp` }));
        return schedule;
      },
      code: /INNER_KEEP_SCHEDULE_INTEGRITY/,
    },
  ] as const;

  for (const scenario of cases) {
    const fixture = makeFixture();
    fixture.start('city-mill', requestKey(`completion-${scenario.label}`));
    const callback = scenario.prepare(fixture, onlySchedule(fixture));
    const before = fixture.snapshot();
    assert.throws(
      () => fixture.transaction(() => runInnerKeepConstructionSchedule(
        fixture.ctx,
        callback as ScheduleInput,
      )),
      scenario.code,
    );
    assert.deepEqual(fixture.snapshot(), before);
  }
});

test('a duplicate schedule fails closed without mutating the project graph', () => {
  const fixture = makeFixture();
  fixture.start('city-mill', requestKey('completion-duplicate-schedule'));
  const callback = onlySchedule(fixture);
  const duplicateScheduleId = callback.scheduleId + 1n;
  fixture.schedules.set(duplicateScheduleId, {
    ...structuredClone(callback),
    scheduleId: duplicateScheduleId,
  });
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);

  const before = fixture.snapshot();
  assert.throws(
    () => fixture.transaction(() => runInnerKeepConstructionSchedule(
      fixture.ctx,
      structuredClone(callback) as ScheduleInput,
    )),
    /INNER_KEEP_SCHEDULE_INTEGRITY/,
  );
  assert.deepEqual(fixture.snapshot(), before);
});

test('exact and late callbacks complete without a claim, refund, or duplicate effect', () => {
  for (const lateness of [0n, 60_000_000n]) {
    const fixture = makeFixture();
    fixture.start('city-mill', requestKey(`complete-${lateness.toString()}`));
    const callback = onlySchedule(fixture);
    const resourceBefore = structuredClone(fixture.resource());
    const receiptsBefore = structuredClone([...fixture.receipts.entries()]);
    fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch + lateness);
    fixture.transaction(() => runInnerKeepConstructionSchedule(
      fixture.ctx,
      structuredClone(callback) as ScheduleInput,
    ));

    const building = [...fixture.buildings.values()][0]!;
    assert.equal(building.phase, 'complete');
    assert.equal(building.completedLevel, 1);
    assert.equal(building.targetLevel, 1);
    assert.equal(fixture.schedules.size, 0);
    assert.equal(fixture.builder().activeBuildingKey, undefined);
    assert.equal(fixture.builder().busyUntilMicros, undefined);
    assert.deepEqual(fixture.resource(), resourceBefore);
    assert.deepEqual([...fixture.receipts.entries()], receiptsBefore);

    const completed = fixture.snapshot();
    fixture.transaction(() => runInnerKeepConstructionSchedule(
      fixture.ctx,
      structuredClone(callback) as ScheduleInput,
    ));
    assert.deepEqual(fixture.snapshot(), completed);
  }
});

test('post-write integrity failure rolls the schedule, building, and Builder back together', () => {
  const fixture = makeFixture();
  fixture.start('city-mill', requestKey('completion-rollback'));
  const callback = onlySchedule(fixture);
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);
  fixture.setCorruptCompletionWrite(true);
  const before = fixture.snapshot();
  assert.throws(
    () => fixture.transaction(() => runInnerKeepConstructionSchedule(
      fixture.ctx,
      callback as ScheduleInput,
    )),
    /INNER_KEEP_COMPLETION_INTEGRITY/,
  );
  assert.deepEqual(fixture.snapshot(), before);
});

test('completed levels affect the next authoritative upgrade only after completion', () => {
  const fixture = makeFixture();
  fixture.start('city-mill', requestKey('level-one'));
  assert.throws(
    () => fixture.start('city-mill', requestKey('upgrade-too-early')),
    /INNER_KEEP_BUILDER_BUSY/,
  );
  const callback = onlySchedule(fixture);
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runInnerKeepConstructionSchedule(
    fixture.ctx,
    callback as ScheduleInput,
  ));

  const expected = canonicalInnerKeepCost('city-mill', 2, { 'city-mill': 1 });
  const upgrade = fixture.start('city-mill', requestKey('level-two'));
  assert.equal(upgrade.building.completedLevel, 1);
  assert.equal(upgrade.building.targetLevel, 2);
  assert.equal(upgrade.building.phase, 'constructing');
  assert.deepEqual(
    {
      food: upgrade.receipt.deductedFood,
      wood: upgrade.receipt.deductedWood,
      stone: upgrade.receipt.deductedStone,
      gold: upgrade.receipt.deductedGold,
    },
    expected.effectiveCost,
  );
  assert.deepEqual(
    expected.discountBasisPoints,
    { food: 500, wood: 0, stone: 0, gold: 0 },
  );
});

test('an upgrade cannot relocate or rotate its persisted building transform', () => {
  const fixture = makeFixture();
  fixture.start('city-mill', requestKey('fixed-transform-level-one'));
  const callback = onlySchedule(fixture);
  fixture.setNow(callback.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runInnerKeepConstructionSchedule(
    fixture.ctx,
    callback as ScheduleInput,
  ));

  const before = fixture.snapshot();
  const settlementsBefore = fixture.settlementCalls.length;
  assert.throws(
    () => fixture.start('city-mill', requestKey('fixed-transform-level-two'), {
      ...DEFAULT_PLACEMENTS['city-mill'],
      rotationMilliDegrees: 180_000,
    }),
    /INNER_KEEP_BUILDING_ALREADY_EXISTS/,
  );
  assert.deepEqual(fixture.snapshot(), before);
  assert.equal(fixture.settlementCalls.length, settlementsBefore);
});
