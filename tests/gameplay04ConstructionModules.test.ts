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
      pluginBuild.onLoad({ filter: /.*/, namespace: 'spacetimedb-syscall-test-boundary' }, () => ({
        loader: 'js',
        contents: `export const moduleHooks = Symbol.for('spacetimedb.moduleHooks'); export function row_iter_bsatn_close() {}`,
      }));
    },
  };
  const result = await build({
    stdin: { contents, loader: 'ts', resolveDir: resolve(import.meta.dirname, '..'), sourcefile },
    bundle: true, format: 'esm', platform: 'node', target: 'es2022', write: false,
    plugins: [syscallStub],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`);
}

let ptr: BundledModule;
let g002: BundledModule;

beforeAll(async () => {
  [ptr, g002] = await Promise.all([
    bundleModule(`
      export { default as schema } from './spacetimedb/ptr/src/schema.ts';
      export * from './spacetimedb/ptr/src/gameplayConstruction.ts';
      import './spacetimedb/ptr/src/index.ts';
    `, 'gameplay04-construction-ptr-entry.ts'),
    bundleModule(`
      export { default as schema } from './spacetimedb/genesis002/src/schema.ts';
      export * from './spacetimedb/genesis002/src/gameplayConstruction.ts';
      import './spacetimedb/genesis002/src/index.ts';
    `, 'gameplay04-construction-g002-entry.ts'),
  ]);
});

test('both realms register seven private gameplay families and the exact construction wire', () => {
  for (const module of [ptr, g002]) {
    const tables = module.schema.moduleDef.tables.filter((row: any) => String(row.sourceName).includes('gameplay04'));
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
    assert.equal(names.filter((name: string) => name === 'start_gameplay04_building_v1').length, 1);
  }
});

test('the shared schedule descriptor has an exact mutually-exclusive lane payload shape', () => {
  for (const module of [ptr, g002]) {
    const table = module.schema.moduleDef.tables.find((row: any) => row.sourceName === 'gameplay04_schedule_v1');
    const type = module.schema.moduleDef.typespace.types[
      typeof table.productTypeRef === 'number' ? table.productTypeRef : table.productTypeRef.value
    ];
    assert.deepEqual(type.value.elements.map((element: any) => element.name), [
      'scheduleId', 'scheduledAt', 'keepId', 'lane', 'worker', 'project',
    ]);
  }
});

test('G002 construction rejects every caller class before reading storage', () => {
  const input = {
    sequence: 2n, requestKey: `g04:2:${'a'.repeat(32)}`, expectedRevision: 1n,
    expectedAtlasRevision: 7n, policyVersion: 'warpkeep-0.4-gameplay-v1',
    layoutDigest: '152d900c9e2309ed822610d3b885e9dcbd0dcae1d5621b3ddbaf788844f6dec8',
    kind: 'city-mill', targetLevel: 1, x: -15_000_000n, z: 15_000_000n, rotation: 0,
    expectedCost: { food: 20n, wood: 40n, stone: 20n, gold: 0n },
    expectedDurationMicros: 120_000_000n,
  };
  for (const connectionId of [null, {}]) {
    let touched = false;
    const ctx = {
      connectionId,
      sender: { equals: () => true },
      databaseIdentity: {},
      withTx: (effect: (tx: unknown) => unknown) => effect({
        get db() { touched = true; throw new Error('storage touched'); },
      }),
    };
    assert.throws(() => g002.startGameplay04BuildingV1(ctx, input), /GENESIS002_GAMEPLAY_CLOSED/u);
    assert.equal(touched, false);
  }
});
