// @vitest-environment node

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { beforeAll, test } from 'vitest';

type BundledModule = Readonly<Record<string, any>>;

async function bundleModule(contents: string, sourcefile: string): Promise<BundledModule> {
  const syscallStub: Plugin = {
    name: 'spacetimedb-syscall-test-boundary',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^spacetime:sys@2\.[01]$/ }, args => ({
        path: args.path, namespace: 'spacetimedb-syscall-test-boundary',
      }));
      pluginBuild.onLoad(
        { filter: /.*/, namespace: 'spacetimedb-syscall-test-boundary' },
        () => ({ loader: 'js', contents: `
          export const moduleHooks = Symbol.for('spacetimedb.moduleHooks');
          export function row_iter_bsatn_close() {}
        ` }),
      );
    },
  };
  const result = await build({
    stdin: { contents, loader: 'ts', resolveDir: resolve(import.meta.dirname, '..'), sourcefile },
    bundle: true, format: 'esm', platform: 'node', target: 'es2022', write: false,
    plugins: [syscallStub],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`);
}

let ptrModule: BundledModule;
let g002Module: BundledModule;

beforeAll(async () => {
  [ptrModule, g002Module] = await Promise.all([
    bundleModule(`
      export { default as schema } from './spacetimedb/ptr/src/schema.ts';
      export * from './spacetimedb/ptr/src/gameplayWorkers.ts';
      export * from './spacetimedb/ptr/src/gameplaySchedule.ts';
      import './spacetimedb/ptr/src/index.ts';
    `, 'gameplay04-workers-ptr-entry.ts'),
    bundleModule(`
      export { default as schema } from './spacetimedb/genesis002/src/schema.ts';
      export * from './spacetimedb/genesis002/src/gameplayWorkers.ts';
      export * from './spacetimedb/genesis002/src/gameplaySchedule.ts';
      import './spacetimedb/genesis002/src/index.ts';
    `, 'gameplay04-workers-g002-entry.ts'),
  ]);
});

test('both modules register seven private gameplay descriptors and exact Worker wires', () => {
  for (const module of [ptrModule, g002Module]) {
    const tables = module.schema.moduleDef.tables.filter((row: any) => (
      String(row.sourceName).includes('gameplay04')
    ));
    assert.equal(tables.length, 7);
    assert.ok(tables.every((row: any) => row.tableAccess.tag === 'Private'));
    assert.deepEqual(tables.map((row: any) => row.sourceName), [
      'gameplay04KeepV1', 'gameplay04WorkerV1', 'gameplay04ReceiptV1',
      'gameplay04ReservationV1', 'gameplay04BuildingV1', 'gameplay04ProjectV1',
      'gameplay04_schedule_v1',
    ]);
    const names = module.schema.moduleDef.explicitNames.entries
      .filter((entry: any) => entry.tag === 'Function')
      .map((entry: any) => entry.value.canonicalName);
    for (const name of [
      'dispatch_gameplay04_worker_v1',
      'recall_gameplay04_worker_v1',
      'run_gameplay_04_schedule_v_1',
    ]) assert.equal(names.filter((candidate: string) => candidate === name).length, 1);
  }
});

test('the scheduler table has ScheduleAt state and its reducer is not a client procedure', () => {
  for (const module of [ptrModule, g002Module]) {
    const schedule = module.schema.moduleDef.tables.find((row: any) => (
      row.sourceName === 'gameplay04_schedule_v1'
    ));
    assert.ok(schedule);
    const rowType = module.schema.moduleDef.typespace.types[
      typeof schedule.productTypeRef === 'number'
        ? schedule.productTypeRef
        : schedule.productTypeRef.value
    ];
    const scheduledAt = rowType.value.elements.find((element: any) => (
      element.name === 'scheduledAt'
    ));
    assert.equal(scheduledAt.algebraicType.tag, 'Sum');
    const hooks = module.schema[Symbol.for('spacetimedb.moduleHooks')];
    hooks.call(module.schema, {
      default: module.schema,
      dispatchGameplay04WorkerV1: module.dispatchGameplay04WorkerV1,
      recallGameplay04WorkerV1: module.recallGameplay04WorkerV1,
      runGameplay04ScheduleV1: module.runGameplay04ScheduleV1,
    });
    assert.deepEqual(module.schema.moduleDef.schedules, [{
      sourceName: undefined,
      tableName: 'gameplay04_schedule_v1',
      scheduleAtCol: 1,
      functionName: 'runGameplay04ScheduleV1',
    }]);
    const procedures = module.schema.moduleDef.procedures.map((row: any) => row.name);
    assert.ok(procedures.every((name: string) => name !== 'run_gameplay_04_schedule_v_1'));
  }
});

test('the SDK-registered PTR scheduler enforces the system caller before database access', () => {
  let touched = false;
  const databaseIdentity = {};
  const ctx = {
    connectionId: {},
    sender: { equals: () => false },
    databaseIdentity,
    get db() { touched = true; throw new Error('storage touched'); },
  };
  assert.throws(() => ptrModule.runGameplay04ScheduleV1(ctx, { arg: {
    scheduleId: 1n,
    scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: 2n } },
    keepId: 'keep', lane: 'worker',
    worker: { workerId: 'worker', assignmentRevision: 1n }, project: undefined,
  } }), /GAMEPLAY04_SCHEDULER_UNAUTHORIZED/u);
  assert.equal(touched, false);
});

test('G002 Worker procedures and every scheduler caller class fail closed before storage', () => {
  for (const [call, arg] of [
    [g002Module.dispatchGameplay04WorkerV1, {
      sequence: 2n, requestKey: `g04:2:${'a'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    }],
    [g002Module.recallGameplay04WorkerV1, {
      sequence: 2n, requestKey: `g04:2:${'a'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0,
    }],
    [g002Module.runGameplay04ScheduleV1, { arg: {
      scheduleId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: 2n } },
      keepId: 'keep', lane: 'worker',
      worker: { workerId: 'worker', assignmentRevision: 1n }, project: undefined,
    } }],
  ] as const) {
    for (const connectionId of [null, {}]) {
      let touched = false;
      const ctx = {
        connectionId,
        sender: { equals: () => true }, databaseIdentity: {},
        withTx: (effect: (tx: unknown) => unknown) => effect({
          get db() { touched = true; throw new Error('storage touched'); },
        }),
      };
      assert.throws(() => call(ctx, arg), /GENESIS002_GAMEPLAY_CLOSED/u);
      assert.equal(touched, false);
    }
  }
});
