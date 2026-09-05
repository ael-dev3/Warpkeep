// @vitest-environment node

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { beforeAll, describe, test } from 'vitest';

type Callable = (...args: any[]) => any;
type BundledModule = Readonly<Record<string, any>>;

const DATABASE_IDENTITY = '1'.repeat(64);
const OWNER_FID = 42n;
const NOW_MICROS = 1_050_000_000n;
const GAMEPLAY_INPUT = Object.freeze({
  sequence: 1n,
  requestKey: `g04:1:${'a'.repeat(32)}`,
  expectedRevision: 0n,
  policyVersion: 'warpkeep-0.4-gameplay-v1',
});

let ptrModule: BundledModule;
let genesis002Module: BundledModule;

async function bundleModule(contents: string, sourcefile: string): Promise<BundledModule> {
  const syscallStub: Plugin = {
    name: 'spacetimedb-syscall-test-boundary',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^spacetime:sys@2\.[01]$/ }, args => ({
        path: args.path,
        namespace: 'spacetimedb-syscall-test-boundary',
      }));
      pluginBuild.onLoad(
        { filter: /.*/, namespace: 'spacetimedb-syscall-test-boundary' },
        () => ({
          loader: 'js',
          contents: `
            export const moduleHooks = Symbol.for('spacetimedb.moduleHooks');
            export function row_iter_bsatn_close() {}
          `,
        }),
      );
    },
  };
  const result = await build({
    stdin: {
      contents,
      loader: 'ts',
      resolveDir: resolve(import.meta.dirname, '..'),
      sourcefile,
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    plugins: [syscallStub],
  });
  const encoded = Buffer.from(result.outputFiles[0]!.text).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`) as Promise<BundledModule>;
}

beforeAll(async () => {
  [ptrModule, genesis002Module] = await Promise.all([
    bundleModule(`
      export { default as schema } from './spacetimedb/ptr/src/schema.ts';
      export {
        initializeGameplay04KeepV1,
        getGameplay04KeepV1,
      } from './spacetimedb/ptr/src/gameplayKeep.ts';
      export { getPtrOwnerStatusV1, adminSuspendPtrOwnerV1 }
        from './spacetimedb/ptr/src/ownerReducers.ts';
      export { onConnect } from './spacetimedb/ptr/src/lifecycle.ts';
      import './spacetimedb/ptr/src/index.ts';
    `, 'gameplay04-ptr-test-entry.ts'),
    bundleModule(`
      export { default as schema } from './spacetimedb/genesis002/src/schema.ts';
      export {
        initializeGameplay04KeepV1,
        getGameplay04KeepV1,
      } from './spacetimedb/genesis002/src/gameplayKeep.ts';
      export { requireGenesis002PopulationEmpty }
        from './spacetimedb/genesis002/src/population.ts';
      import './spacetimedb/genesis002/src/index.ts';
    `, 'gameplay04-g002-test-entry.ts'),
  ]);
});

const REGION_IDENTITIES = Object.freeze([
  ['T1_LOWLANDS', 'The Hegemony Lowlands'],
  ['T1_FROSTMERE', 'Frostmere Reach'],
  ['T1_SUNSCAR', 'Sunscar Expanse'],
  ['T1_MIREFEN', 'Mirefen Delta'],
  ['T1_STONEWAKE', 'Stonewake Isles'],
  ['T1_EMBERWOOD', 'Emberwood March'],
] as const);

function ownerPayload(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    iss: 'https://auth.warpkeep.com',
    sub: `farcaster:${OWNER_FID}`,
    aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access',
    roles: ['warpkeep-ptr-owner'],
    auth_version: 2,
    fid: OWNER_FID.toString(),
    auth_epoch: 1,
    ptr_database_identity: DATABASE_IDENTITY,
    realm_id: 'PTR',
    iat: 1_000,
    nbf: 1_000,
    exp: 1_120,
    session_iat: 1_000,
    session_exp: 1_120,
    jti: 'ptr-owner-jti',
    ...overrides,
  };
}

function adminPayload() {
  return {
    iss: 'https://auth.warpkeep.com',
    sub: 'service:hermes',
    aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    ptr_owner_fid: OWNER_FID.toString(),
    ptr_owner_auth_epoch: 1,
    iat: 1_000,
    nbf: 1_000,
    exp: 1_300,
    jti: 'ptr-admin-jti',
  };
}

function zeroCountTable(extra: Record<string, unknown> = {}) {
  return { count: () => 0n, ...extra };
}

function regionManifest() {
  return `${JSON.stringify(REGION_IDENTITIES.map(([regionId, publicName], ordinal) => ({
    regionId,
    publicName,
    ordinal,
    tier: 1,
    cellCount: ordinal === 0 ? 1 : 0,
    passableCellCount: ordinal === 0 ? 1 : 0,
    chunkCount: ordinal === 0 ? 1 : 0,
    castleCapacity: 100,
    resourceLocationCount: 2_000,
    resourceNodeCount: 2_000,
    foodNodeCount: 500,
    woodNodeCount: 500,
    stoneNodeCount: 500,
    goldNodeCount: 500,
    active: false,
  })))}\n`;
}

class PtrHarness {
  keeps = new Map<string, Record<string, any>>();
  workers = new Map<string, Record<string, any>>();
  receipts = new Map<string, Record<string, any>>();
  anchor = {
    singletonKey: 'PTR_OWNER_V1', ownerFid: OWNER_FID, authEpoch: 1,
    enabled: true, provisionedAt: {}, provisionedBy: 'service:hermes',
    suspendedAt: undefined, suspendedBy: undefined,
  };
  importEpoch = 7n;
  payload: unknown = ownerPayload();
  auditRows: unknown[] = [];

  private database(
    keeps = this.keeps,
    workers = this.workers,
    receipts = this.receipts,
  ) {
    const release = {
      atlasId: 'PTR_GREATER_REALM', publicReleaseId: `GRR-${'A'.repeat(26)}`,
      publicName: 'PTR Greater Realm', state: 'ready', readyAt: {},
      importEpoch: this.importEpoch, verificationPhase: 'complete',
      expectedRegionCount: 6, expectedComponentCount: 1, expectedChunkCount: 1,
      expectedCellCount: 1, expectedSlotCount: 600, expectedResourceNodeCount: 12_000,
      verifiedComponentCount: 1, verifiedChunkCount: 1, verifiedCellCount: 1,
      verifiedSlotCount: 600, verifiedResourceNodeCount: 12_000,
      nextChunkOrdinal: 1, componentExpectedCellCount: 1,
      importedPassableCellCount: 1, componentExpectedSlotCount: 600,
      componentExpectedResourceNodeCount: 12_000,
      regionManifestJson: regionManifest(), generatorVersion: 'generator-v1',
      runtimePartitionVersion: 'axial-bin-15-tier-one-filter-v1',
      rendererContractVersion: 'greater-realm-renderer-v1',
    };
    const component = {
      componentKey: `GRC-${'A'.repeat(26)}`, componentOrdinal: 0,
      atlasId: 'PTR_GREATER_REALM', rootCellKey: 'T1_LOWLANDS:0:0',
      active: true, verificationPhase: 'complete',
    };
    const cell = {
      cellKey: 'T1_LOWLANDS:0:0', atlasId: 'PTR_GREATER_REALM',
      componentKey: component.componentKey, chunkHandle: `GRK-${'A'.repeat(26)}`,
      passable: true, routeDepth: 0, routeParentDirection: undefined,
      atlasQ: 0, atlasR: 0, elevation: 0,
    };
    const chunk = {
      chunkHandle: cell.chunkHandle, atlasId: 'PTR_GREATER_REALM', binQ: 0, binR: 0,
    };
    return {
      allowedFid: zeroCountTable(), accessRequestV1: zeroCountTable(),
      player: zeroCountTable(), playerV2: zeroCountTable(),
      playerOwnershipV2: zeroCountTable(), castle: zeroCountTable(),
      realmProfileV1: zeroCountTable(), alphaTermsAcceptanceV1: zeroCountTable(),
      markAccountV1: zeroCountTable(), resourceAccountV1: zeroCountTable(),
      greaterRealmCastleClaimV1: zeroCountTable(),
      greaterRealmCellOccupancyV1: zeroCountTable(),
      greaterRealmActivationV1: zeroCountTable(), realmAtlasV1: zeroCountTable(),
      realmAtlasVisibleRegionV1: zeroCountTable(), realmWorkerSystemV2: zeroCountTable(),
      greaterRealmReleaseV1: {
        count: () => 1n, iter: () => [release].values(),
        atlasId: { find: () => release },
      },
      greaterRealmNavigationComponentV1: {
        count: () => 1n, componentOrdinal: { find: () => component },
      },
      greaterRealmChunkV1: {
        count: () => 1n, chunkHandle: { find: () => chunk },
      },
      greaterRealmCellV1: {
        count: () => 1n, cellKey: { find: () => cell },
      },
      greaterRealmCastleSlotV1: { count: () => 600n },
      greaterRealmResourceNodeV1: { count: () => 12_000n },
      ptrOwnerAnchorV1: {
        count: () => 1n,
        singletonKey: {
          find: () => this.anchor,
          update: (next: typeof this.anchor) => { this.anchor = next; },
        },
      },
      adminAudit: { insert: (row: unknown) => { this.auditRows.push(row); } },
      gameplay04KeepV1: {
        keepId: { find: (key: string) => keeps.get(key) ?? null },
        insert: (row: Record<string, any>) => { keeps.set(row.keepId, { ...row }); },
      },
      gameplay04WorkerV1: {
        keepId: { filter: (key: string) => [...workers.values()].filter(row => row.keepId === key) },
        insert: (row: Record<string, any>) => { workers.set(row.workerId, { ...row }); },
      },
      gameplay04ReceiptV1: {
        keepId: { filter: (key: string) => [...receipts.values()].filter(row => row.keepId === key) },
        insert: (row: Record<string, any>) => { receipts.set(row.receiptId, { ...row }); },
      },
    };
  }

  context() {
    const outer = this;
    return {
      senderAuth: { jwt: this.payload === null ? null : { fullPayload: this.payload } },
      timestamp: { microsSinceUnixEpoch: NOW_MICROS },
      databaseIdentity: { toHexString: () => DATABASE_IDENTITY },
      withTx<T>(effect: (tx: any) => T): T {
        const keeps = new Map([...outer.keeps].map(([key, row]) => [key, { ...row }]));
        const workers = new Map([...outer.workers].map(([key, row]) => [key, { ...row }]));
        const receipts = new Map([...outer.receipts].map(([key, row]) => [key, { ...row }]));
        const tx = { ...this, db: outer.database(keeps, workers, receipts) };
        const result = effect(tx);
        outer.keeps = keeps;
        outer.workers = workers;
        outer.receipts = receipts;
        return result;
      },
      db: this.database(),
    };
  }

  snapshot() {
    return JSON.stringify({
      keeps: [...this.keeps.keys()], workers: [...this.workers.keys()],
      receipts: [...this.receipts.keys()],
    });
  }
}

function expectSenderCode(effect: () => unknown, code: string): void {
  assert.throws(effect, error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, code);
    return true;
  });
}

describe('PTR gameplay keep module adapter', () => {
  test('executes the registered SDK procedures and returns only the private wire projection', () => {
    const harness = new PtrHarness();
    const initialize = ptrModule.initializeGameplay04KeepV1 as Callable;
    const read = ptrModule.getGameplay04KeepV1 as Callable;
    assert.deepEqual(initialize(harness.context(), GAMEPLAY_INPUT), {
      sequence: 1n, revision: 1n,
    });
    const beforeRetry = harness.snapshot();
    assert.deepEqual(initialize(harness.context(), GAMEPLAY_INPUT), {
      sequence: 1n, revision: 1n,
    });
    assert.equal(harness.snapshot(), beforeRetry);
    assert.deepEqual(read(harness.context()), {
      policyVersion: 'warpkeep-0.4-gameplay-v1', revision: 1n,
      lastAcceptedSequence: 1n, food: 0n, wood: 0n, stone: 0n, gold: 0n,
      workers: [0, 1, 2, 3].map(ordinal => ({ ordinal, assignmentRevision: 0n })),
    });
    assert.doesNotMatch(JSON.stringify(read(harness.context()), (_key, value) => (
      typeof value === 'bigint' ? value.toString() : value
    )), /ownerFid|keepId|requestKey|fingerprint|jwt|credential/u);
  });

  test('owner/auth/atlas failures precede gameplay writes', () => {
    const cases: Array<readonly [(harness: PtrHarness) => void, string]> = [
      [harness => { harness.payload = null; }, 'AUTH_REQUIRED'],
      [harness => { harness.payload = adminPayload(); }, 'INVALID_PTR_OWNER_SESSION'],
      [
        harness => { harness.payload = ownerPayload({ ptr_database_identity: '2'.repeat(64) }); },
        'PTR_OWNER_NOT_AUTHORIZED',
      ],
      [
        harness => { harness.payload = ownerPayload({ exp: 1_050, session_exp: 1_050 }); },
        'INVALID_PTR_OWNER_SESSION',
      ],
      [harness => { harness.payload = ownerPayload({ auth_epoch: 2 }); }, 'PTR_OWNER_NOT_AUTHORIZED'],
      [harness => { harness.anchor = { ...harness.anchor, enabled: false }; }, 'PTR_OWNER_NOT_AUTHORIZED'],
    ];
    for (const [mutate, expectedCode] of cases) {
      const harness = new PtrHarness();
      mutate(harness);
      const before = harness.snapshot();
      expectSenderCode(
        () => (ptrModule.initializeGameplay04KeepV1 as Callable)(
          harness.context(), GAMEPLAY_INPUT,
        ),
        expectedCode,
      );
      assert.equal(harness.snapshot(), before);
    }
  });

  test('stale atlas and changed atlas binding fail without reseeding', () => {
    const stale = new PtrHarness();
    stale.importEpoch = 0n;
    expectSenderCode(
      () => (ptrModule.initializeGameplay04KeepV1 as Callable)(stale.context(), GAMEPLAY_INPUT),
      'PTR_ATLAS_UNAVAILABLE',
    );
    assert.equal(stale.snapshot(), '{"keeps":[],"workers":[],"receipts":[]}');

    const changed = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(changed.context(), GAMEPLAY_INPUT);
    changed.importEpoch = 8n;
    expectSenderCode(
      () => (ptrModule.getGameplay04KeepV1 as Callable)(changed.context()),
      'GAMEPLAY04_BINDING_MISMATCH',
    );
    assert.equal(changed.keeps.size, 1);
  });

  test('initialized gameplay leaves legacy reconnect/status/suspension guards empty', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    assert.doesNotThrow(() => (ptrModule.onConnect as Callable)(harness.context()));
    const status = (ptrModule.getPtrOwnerStatusV1 as Callable)(harness.context());
    assert.equal(status.ownerFid, OWNER_FID);
    assert.equal(status.atlasReady, true);
    harness.payload = adminPayload();
    assert.doesNotThrow(() => (ptrModule.adminSuspendPtrOwnerV1 as Callable)(harness.context()));
    assert.equal(harness.anchor.enabled, false);
    assert.equal(harness.auditRows.length, 1);
    assert.equal(harness.keeps.size, 1);
  });
});

describe('module-local schema and Genesis 002 closure', () => {
  test('both modules append the same three private gameplay descriptors', () => {
    const tableProjection = (module: BundledModule) => module.schema.moduleDef.tables
      .filter((row: any) => String(row.sourceName).includes('gameplay04'))
      .map((row: any) => ({
        sourceName: row.sourceName,
        tableAccess: row.tableAccess,
        indexes: row.indexes,
        constraints: row.constraints,
        rowType: module.schema.moduleDef.typespace.types[
          typeof row.productTypeRef === 'number'
            ? row.productTypeRef
            : row.productTypeRef.value
        ],
      }));
    const ptr = tableProjection(ptrModule);
    const g002 = tableProjection(genesis002Module);
    assert.equal(ptr.length, 3);
    assert.deepEqual(g002, ptr);
    assert.ok(ptr.every((row: any) => row.tableAccess.tag === 'Private'));
    assert.deepEqual(ptr.map((row: any) => row.sourceName), [
      'gameplay04KeepV1', 'gameplay04WorkerV1', 'gameplay04ReceiptV1',
    ]);
  });

  test('both exact gameplay procedure wire names are pinned in each module', () => {
    for (const module of [ptrModule, genesis002Module]) {
      const names = module.schema.moduleDef.explicitNames.entries
        .filter((entry: any) => entry.tag === 'Function')
        .map((entry: any) => entry.value.canonicalName);
      assert.equal(names.filter((name: string) => name === 'initialize_gameplay04_keep_v1').length, 1);
      assert.equal(names.filter((name: string) => name === 'get_gameplay04_keep_v1').length, 1);
    }
  });

  test('G002 denies both functions to anonymous, owner, and admin before storage access', () => {
    for (const payload of [null, ownerPayload(), adminPayload()]) {
      for (const [procedure, args] of [
        [genesis002Module.initializeGameplay04KeepV1 as Callable, GAMEPLAY_INPUT],
        [genesis002Module.getGameplay04KeepV1 as Callable, undefined],
      ] as const) {
        let storageTouched = false;
        const ctx = {
          withTx: (effect: Callable) => effect({
            get db() {
              storageTouched = true;
              throw new Error('storage touched');
            },
          }),
          senderAuth: { jwt: payload === null ? null : { fullPayload: payload } },
        };
        expectSenderCode(
          () => args === undefined ? procedure(ctx) : procedure(ctx, args),
          'GENESIS002_GAMEPLAY_CLOSED',
        );
        assert.equal(storageTouched, false);
      }
    }
  });

  test('the G002 population guard directly counts all three gameplay families', () => {
    const requireEmpty = genesis002Module.requireGenesis002PopulationEmpty as Callable;
    for (const changed of [undefined, 'gameplay04KeepV1', 'gameplay04WorkerV1', 'gameplay04ReceiptV1']) {
      const db: Record<string, unknown> = {};
      for (const name of [
        'allowedFid', 'accessRequestV1', 'player', 'playerV2', 'playerOwnershipV2',
        'castle', 'realmProfileV1', 'alphaTermsAcceptanceV1', 'markAccountV1',
        'resourceAccountV1', 'greaterRealmCastleClaimV1', 'greaterRealmCellOccupancyV1',
        'greaterRealmActivationV1', 'realmWorkerSystemV2', 'gameplay04KeepV1',
        'gameplay04WorkerV1', 'gameplay04ReceiptV1',
      ]) db[name] = { count: () => name === changed ? 1n : 0n };
      if (changed === undefined) assert.doesNotThrow(() => requireEmpty({ db }));
      else expectSenderCode(
        () => requireEmpty({ db }),
        'GENESIS_002_POPULATION_NOT_EMPTY',
      );
    }
  });
});
