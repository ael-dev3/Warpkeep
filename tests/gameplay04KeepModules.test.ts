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
      export { dispatchGameplay04WorkerV1, recallGameplay04WorkerV1 }
        from './spacetimedb/ptr/src/gameplayWorkers.ts';
      export { startGameplay04BuildingV1 }
        from './spacetimedb/ptr/src/gameplayConstruction.ts';
      export { runGameplay04ScheduleV1 }
        from './spacetimedb/ptr/src/gameplaySchedule.ts';
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

function regionManifest(lowlandsCellCount = 1) {
  return `${JSON.stringify(REGION_IDENTITIES.map(([regionId, publicName], ordinal) => ({
    regionId,
    publicName,
    ordinal,
    tier: 1,
    cellCount: ordinal === 0 ? lowlandsCellCount : 0,
    passableCellCount: ordinal === 0 ? lowlandsCellCount : 0,
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
  reservations = new Map<string, Record<string, any>>();
  buildings = new Map<string, Record<string, any>>();
  projects = new Map<string, Record<string, any>>();
  schedules = new Map<bigint, Record<string, any>>();
  nextScheduleId = 1n;
  maxScheduleRows = 0;
  failAfterScheduleInsert = false;
  anchor = {
    singletonKey: 'PTR_OWNER_V1', ownerFid: OWNER_FID, authEpoch: 1,
    enabled: true, provisionedAt: {}, provisionedBy: 'service:hermes',
    suspendedAt: undefined, suspendedBy: undefined,
  };
  importEpoch = 7n;
  resourceComponentKey = `GRC-${'A'.repeat(26)}`;
  resourceNodeMode: 'valid' | 'duplicate-node' | 'release-gap' | 'active' = 'valid';
  resourceAtAdjacentCell = false;
  resourceKind: 'food' | 'wood' | 'stone' | 'gold' = 'wood';
  failOnUpdateKeep = false;
  nowMicros = NOW_MICROS;
  payload: unknown = ownerPayload();
  auditRows: unknown[] = [];

  private database(
    keeps = this.keeps,
    workers = this.workers,
    receipts = this.receipts,
    reservations = this.reservations,
    buildings = this.buildings,
    projects = this.projects,
    schedules = this.schedules,
    scheduleCounter = { value: this.nextScheduleId },
  ) {
    const cellCount = this.resourceAtAdjacentCell ? 2 : 1;
    const release = {
      atlasId: 'PTR_GREATER_REALM', publicReleaseId: `GRR-${'A'.repeat(26)}`,
      publicName: 'PTR Greater Realm', state: 'ready', readyAt: {},
      importEpoch: this.importEpoch, verificationPhase: 'complete',
      expectedRegionCount: 6, expectedComponentCount: 1, expectedChunkCount: 1,
      expectedCellCount: cellCount, expectedSlotCount: 600, expectedResourceNodeCount: 12_000,
      verifiedComponentCount: 1, verifiedChunkCount: 1, verifiedCellCount: cellCount,
      verifiedSlotCount: 600, verifiedResourceNodeCount: 12_000,
      nextChunkOrdinal: 1, componentExpectedCellCount: cellCount,
      importedPassableCellCount: cellCount, componentExpectedSlotCount: 600,
      componentExpectedResourceNodeCount: 12_000,
      regionManifestJson: regionManifest(cellCount), generatorVersion: 'generator-v1',
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
      atlasQ: 0, atlasR: 0, elevation: 0, regionId: 'T1_LOWLANDS', tier: 1,
    };
    const destination = this.resourceAtAdjacentCell ? {
      ...cell,
      cellKey: 'T1_LOWLANDS:1:0', atlasQ: 1, atlasR: 0,
      routeDepth: 1, routeParentDirection: 3,
    } : cell;
    const resourceLocationId = `LOCATION:${this.resourceKind.toUpperCase()}`;
    const resourceNodes = [0, 1, 2, 3].map(nodeOrdinal => ({
      nodeId: `NODE:${this.resourceKind.toUpperCase()}:${nodeOrdinal}`,
      locationId: resourceLocationId, nodeOrdinal,
      releaseOrdinal: 100 + nodeOrdinal, atlasId: 'PTR_GREATER_REALM',
      cellKey: destination.cellKey, regionId: destination.regionId,
      componentKey: this.resourceComponentKey,
      resourceKind: this.resourceKind, policyVersion: 'atlas-resource-v1', tier: 1,
      active: false, allocationRank: 0xffff_ffff,
    }));
    if (this.resourceNodeMode === 'duplicate-node') {
      resourceNodes[1] = { ...resourceNodes[1]!, nodeId: resourceNodes[0]!.nodeId };
    } else if (this.resourceNodeMode === 'release-gap') {
      resourceNodes[1] = { ...resourceNodes[1]!, releaseOrdinal: 200 };
    } else if (this.resourceNodeMode === 'active') {
      resourceNodes[1] = { ...resourceNodes[1]!, active: true };
    }
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
        count: () => BigInt(cellCount),
        cellKey: { find: (key: string) => (
          key === cell.cellKey ? cell : key === destination.cellKey ? destination : null
        ) },
        atlasCoordKey: { find: (key: string) => (
          key === 'A:0:0' ? cell : key === 'A:1:0' ? destination : null
        ) },
      },
      greaterRealmCastleSlotV1: { count: () => 600n },
      greaterRealmResourceNodeV1: {
        count: () => 12_000n,
        locationId: { filter: (key: string) => key === resourceLocationId ? resourceNodes : [] },
      },
      ptrOwnerAnchorV1: {
        count: () => 1n,
        singletonKey: {
          find: () => this.anchor,
          update: (next: typeof this.anchor) => { this.anchor = next; },
        },
      },
      adminAudit: { insert: (row: unknown) => { this.auditRows.push(row); } },
      gameplay04KeepV1: {
        keepId: {
          find: (key: string) => keeps.get(key) ?? null,
          update: (row: Record<string, any>) => {
            if (this.failOnUpdateKeep) throw new Error('injected updateKeep failure');
            keeps.set(row.keepId, { ...row });
          },
        },
        insert: (row: Record<string, any>) => { keeps.set(row.keepId, { ...row }); },
      },
      gameplay04WorkerV1: {
        keepId: { filter: (key: string) => [...workers.values()].filter(row => row.keepId === key) },
        workerId: {
          find: (key: string) => workers.get(key) ?? null,
          update: (row: Record<string, any>) => { workers.set(row.workerId, { ...row }); },
        },
        insert: (row: Record<string, any>) => { workers.set(row.workerId, { ...row }); },
      },
      gameplay04ReceiptV1: {
        keepId: { filter: (key: string) => [...receipts.values()].filter(row => row.keepId === key) },
        receiptId: { delete: (key: string) => receipts.delete(key) },
        insert: (row: Record<string, any>) => { receipts.set(row.receiptId, { ...row }); },
      },
      gameplay04ReservationV1: {
        keepId: { filter: (key: string) => [...reservations.values()].filter(row => row.keepId === key) },
        nodeId: {
          find: (key: string) => reservations.get(key) ?? null,
          delete: (key: string) => reservations.delete(key),
        },
        insert: (row: Record<string, any>) => { reservations.set(row.nodeId, { ...row }); },
      },
      gameplay04BuildingV1: {
        keepId: { filter: (key: string) => [...buildings.values()].filter(row => row.keepId === key) },
        buildingId: {
          find: (key: string) => buildings.get(key) ?? null,
          update: (row: Record<string, any>) => { buildings.set(row.buildingId, { ...row }); },
        },
        insert: (row: Record<string, any>) => { buildings.set(row.buildingId, { ...row }); },
      },
      gameplay04ProjectV1: {
        keepId: {
          find: (key: string) => projects.get(key) ?? null,
          delete: (key: string) => projects.delete(key),
        },
        insert: (row: Record<string, any>) => { projects.set(row.keepId, { ...row }); },
      },
      gameplay04_schedule_v1: {
        keepId: { filter: (key: string) => [...schedules.values()].filter(row => row.keepId === key) },
        scheduleId: {
          find: (key: bigint) => schedules.get(key) ?? null,
          delete: (key: bigint) => schedules.delete(key),
        },
        insert: (row: Record<string, any>) => {
          const id = row.scheduleId === 0n ? scheduleCounter.value++ : row.scheduleId;
          schedules.set(id, { ...row, scheduleId: id });
          this.maxScheduleRows = Math.max(this.maxScheduleRows, schedules.size);
          if (this.failAfterScheduleInsert) throw new Error('injected schedule insert failure');
        },
      },
    };
  }

  context() {
    const outer = this;
    return {
      senderAuth: { jwt: this.payload === null ? null : { fullPayload: this.payload } },
      timestamp: { microsSinceUnixEpoch: this.nowMicros },
      databaseIdentity: { toHexString: () => DATABASE_IDENTITY },
      withTx<T>(effect: (tx: any) => T): T {
        const keeps = new Map([...outer.keeps].map(([key, row]) => [key, { ...row }]));
        const workers = new Map([...outer.workers].map(([key, row]) => [key, { ...row }]));
        const receipts = new Map([...outer.receipts].map(([key, row]) => [key, { ...row }]));
        const reservations = new Map([...outer.reservations].map(([key, row]) => [key, { ...row }]));
        const buildings = new Map([...outer.buildings].map(([key, row]) => [key, { ...row }]));
        const projects = new Map([...outer.projects].map(([key, row]) => [key, { ...row }]));
        const schedules = new Map([...outer.schedules].map(([key, row]) => [key, { ...row }]));
        const scheduleCounter = { value: outer.nextScheduleId };
        const tx = {
          ...this,
          db: outer.database(keeps, workers, receipts, reservations, buildings, projects, schedules, scheduleCounter),
        };
        const result = effect(tx);
        outer.keeps = keeps;
        outer.workers = workers;
        outer.receipts = receipts;
        outer.reservations = reservations;
        outer.buildings = buildings;
        outer.projects = projects;
        outer.schedules = schedules;
        outer.nextScheduleId = scheduleCounter.value;
        return result;
      },
      db: this.database(),
    };
  }

  invokeSchedule(
    arg: Record<string, any>,
    options: Readonly<{ foreignSender?: boolean; connectionId?: object | null }> = {},
  ) {
    const keeps = new Map([...this.keeps].map(([key, row]) => [key, { ...row }]));
    const workers = new Map([...this.workers].map(([key, row]) => [key, { ...row }]));
    const receipts = new Map([...this.receipts].map(([key, row]) => [key, { ...row }]));
    const reservations = new Map([...this.reservations].map(([key, row]) => [key, { ...row }]));
    const buildings = new Map([...this.buildings].map(([key, row]) => [key, { ...row }]));
    const projects = new Map([...this.projects].map(([key, row]) => [key, { ...row }]));
    const schedules = new Map([...this.schedules].map(([key, row]) => [key, { ...row }]));
    const scheduleCounter = { value: this.nextScheduleId };
    const databaseIdentity = {
      toHexString: () => DATABASE_IDENTITY,
      equals: (other: unknown) => other === databaseIdentity,
    };
    const ctx = {
      sender: options.foreignSender
        ? { equals: () => false }
        : databaseIdentity,
      connectionId: options.connectionId ?? null,
      databaseIdentity,
      timestamp: { microsSinceUnixEpoch: this.nowMicros },
      db: this.database(keeps, workers, receipts, reservations, buildings, projects, schedules, scheduleCounter),
    };
    const result = (ptrModule.runGameplay04ScheduleV1 as Callable)(ctx, { arg });
    this.keeps = keeps;
    this.workers = workers;
    this.receipts = receipts;
    this.reservations = reservations;
    this.buildings = buildings;
    this.projects = projects;
    this.schedules = schedules;
    this.nextScheduleId = scheduleCounter.value;
    return result;
  }

  runScheduleByEngine(
    arg: Record<string, any>,
    options: Readonly<{ foreignSender?: boolean; connectionId?: object | null }> = {},
  ) {
    let failure: unknown;
    try {
      this.invokeSchedule(arg, options);
    } catch (error) {
      failure = error;
    }
    this.schedules.delete(arg.scheduleId);
    if (failure !== undefined) throw failure;
  }

  snapshot() {
    return JSON.stringify({
      keeps: [...this.keeps], workers: [...this.workers], receipts: [...this.receipts],
      reservations: [...this.reservations], buildings: [...this.buildings],
      projects: [...this.projects], schedules: [...this.schedules],
      nextScheduleId: this.nextScheduleId,
      legacy: { active: false, allocationRank: 0xffff_ffff, population: 0 },
    }, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
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
      policyVersion: 'warpkeep-0.4-gameplay-v1',
      layoutVersion: 'warpkeep-0.4-placement-v1',
      layoutDigest: '152d900c9e2309ed822610d3b885e9dcbd0dcae1d5621b3ddbaf788844f6dec8',
      revision: 1n,
      lastAcceptedSequence: 1n, food: 0n, wood: 0n, stone: 0n, gold: 0n,
      workers: [0, 1, 2, 3].map(ordinal => ({
        ordinal, assignmentRevision: 0n, assignment: undefined, lastReturn: undefined,
      })),
      buildings: [],
      project: undefined,
      completedLevels: {
        mill: 0, lumberCamp: 0, stoneworks: 0, goldworks: 0, barracks: 0, cathedral: 0,
      },
      completedEffects: {
        foodYieldPerQuantum: 10n, woodYieldPerQuantum: 10n,
        stoneYieldPerQuantum: 10n, goldYieldPerQuantum: 10n,
        travelPerEdgeMicros: 2_000_000n, levelOneBuildDurationMicros: 120_000_000n,
      },
    });
    assert.doesNotMatch(JSON.stringify(read(harness.context()), (_key, value) => (
      typeof value === 'bigint' ? value.toString() : value
    )), /ownerFid|keepId|requestKey|fingerprint|jwt|credential/u);
  });

  test('dispatch executes the production atlas loader and storage adapter', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    assert.deepEqual((ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
      sequence: 2n, requestKey: `g04:2:${'b'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    }), { sequence: 2n, revision: 2n });
    assert.equal(harness.reservations.size, 1);
    assert.equal(harness.schedules.size, 1);
    assert.equal(harness.workers.values().next().value!.assignment.route.length, 1);
  });

  test('actual PTR gather, construction, completion, and later dispatch use persisted effects', () => {
    const harness = new PtrHarness();
    const renew = () => {
      const nowSeconds = Number(harness.nowMicros / 1_000_000n);
      harness.payload = ownerPayload({
        iat: nowSeconds - 1, nbf: nowSeconds - 1, exp: nowSeconds + 119,
        session_iat: nowSeconds - 1, session_exp: nowSeconds + 119,
        jti: `renewed-${nowSeconds}`,
      });
    };
    const initialize = ptrModule.initializeGameplay04KeepV1 as Callable;
    const dispatch = ptrModule.dispatchGameplay04WorkerV1 as Callable;
    const start = ptrModule.startGameplay04BuildingV1 as Callable;
    const read = ptrModule.getGameplay04KeepV1 as Callable;
    initialize(harness.context(), GAMEPLAY_INPUT);
    let sequence = 2n;
    let revision = 1n;
    for (const resource of ['food', 'wood', 'stone'] as const) {
      harness.resourceKind = resource;
      dispatch(harness.context(), {
        sequence,
        requestKey: `g04:${sequence}:${sequence.toString().repeat(32)}`,
        expectedRevision: revision,
        policyVersion: 'warpkeep-0.4-gameplay-v1',
        expectedAtlasRevision: 7n,
        workerOrdinal: 0,
        locationId: `LOCATION:${resource.toUpperCase()}`,
        resource,
        gatheringDurationMicros: 60_000_000n,
      });
      revision += 1n;
      harness.nowMicros += 60_000_000n;
      renew();
      revision = read(harness.context()).revision;
      sequence += 1n;
    }
    assert.deepEqual(
      (({ food, wood, stone, gold }) => ({ food, wood, stone, gold }))(read(harness.context())),
      { food: 60n, wood: 60n, stone: 60n, gold: 0n },
    );
    const buildAt = harness.nowMicros;
    const buildInput = {
      sequence: 5n,
      requestKey: `g04:5:${'5'.repeat(32)}`,
      expectedRevision: 7n,
      expectedAtlasRevision: 7n,
      policyVersion: 'warpkeep-0.4-gameplay-v1',
      layoutDigest: '152d900c9e2309ed822610d3b885e9dcbd0dcae1d5621b3ddbaf788844f6dec8',
      kind: 'city-mill',
      targetLevel: 1,
      x: -15_000_000n,
      z: 15_000_000n,
      rotation: 0,
      expectedCost: { food: 20n, wood: 40n, stone: 20n, gold: 0n },
      expectedDurationMicros: 120_000_000n,
    };
    assert.deepEqual(start(harness.context(), buildInput), { sequence: 5n, revision: 8n });
    assert.equal(harness.buildings.values().next().value!.completedLevel, 0);
    harness.resourceKind = 'food';
    dispatch(harness.context(), {
      sequence: 6n, requestKey: `g04:6:${'6'.repeat(32)}`, expectedRevision: 8n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:FOOD', resource: 'food',
      gatheringDurationMicros: 60_000_000n,
    });
    assert.equal(harness.workers.values().next().value!.assignment.journey.yieldPerQuantum, 10n);
    assert.equal(harness.schedules.size, 2);
    harness.nowMicros = buildAt + 120_000_000n;
    renew();
    const completed = read(harness.context());
    assert.equal(completed.revision, 10n);
    assert.equal(completed.buildings[0].completedLevel, 1);
    assert.equal(completed.project, undefined);
    assert.equal(completed.completedEffects.foodYieldPerQuantum, 12n);
    assert.deepEqual(dispatch(harness.context(), {
      sequence: 7n, requestKey: `g04:7:${'7'.repeat(32)}`, expectedRevision: 10n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:FOOD', resource: 'food',
      gatheringDurationMicros: 60_000_000n,
    }), { sequence: 7n, revision: 11n });
    assert.equal(harness.workers.values().next().value!.assignment.journey.yieldPerQuantum, 12n);
    const snapshot = harness.snapshot();
    assert.deepEqual(start(harness.context(), buildInput), { sequence: 5n, revision: 8n });
    assert.equal(harness.snapshot(), snapshot);
  });

  test('the shared schedule graph supports four Workers plus one project and atomic replacement', () => {
    const setup = () => {
      const harness = new PtrHarness();
      (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
      const keepId = [...harness.keeps.keys()][0]!;
      harness.keeps.set(keepId, {
        ...harness.keeps.get(keepId)!, food: 100n, wood: 100n, stone: 100n, gold: 0n,
      });
      (ptrModule.startGameplay04BuildingV1 as Callable)(harness.context(), {
        sequence: 2n, requestKey: `g04:2:${'2'.repeat(32)}`, expectedRevision: 1n,
        expectedAtlasRevision: 7n, policyVersion: 'warpkeep-0.4-gameplay-v1',
        layoutDigest: '152d900c9e2309ed822610d3b885e9dcbd0dcae1d5621b3ddbaf788844f6dec8',
        kind: 'city-mill', targetLevel: 1, x: -15_000_000n, z: 15_000_000n,
        rotation: 0, expectedCost: { food: 20n, wood: 40n, stone: 20n, gold: 0n },
        expectedDurationMicros: 120_000_000n,
      });
      harness.resourceAtAdjacentCell = true;
      for (let ordinal = 0; ordinal < 4; ordinal += 1) {
        const sequence = BigInt(ordinal + 3);
        (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
          sequence, requestKey: `g04:${sequence}:${sequence.toString().repeat(32)}`,
          expectedRevision: sequence - 1n,
          policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
          workerOrdinal: ordinal, locationId: 'LOCATION:WOOD', resource: 'wood',
          gatheringDurationMicros: 60_000_000n,
        });
      }
      assert.equal(harness.schedules.size, 5);
      return harness;
    };
    const successful = setup();
    successful.maxScheduleRows = 5;
    successful.nowMicros += 2_000_000n;
    assert.equal((ptrModule.getGameplay04KeepV1 as Callable)(successful.context()).revision, 7n);
    assert.equal(successful.schedules.size, 5);
    assert.equal(successful.maxScheduleRows, 6);

    const rollback = setup();
    rollback.nowMicros += 2_000_000n;
    const before = rollback.snapshot();
    rollback.failAfterScheduleInsert = true;
    assert.throws(
      () => (ptrModule.getGameplay04KeepV1 as Callable)(rollback.context()),
      /GAMEPLAY04_READ_FAILED/u,
    );
    assert.equal(rollback.snapshot(), before);
  });

  test('malformed lanes reject, and a foreign project identity cannot complete the current project', () => {
    const malformed = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(malformed.context(), GAMEPLAY_INPUT);
    (ptrModule.dispatchGameplay04WorkerV1 as Callable)(malformed.context(), {
      sequence: 2n, requestKey: `g04:2:${'2'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    });
    const [scheduleId, schedule] = malformed.schedules.entries().next().value!;
    malformed.schedules.set(scheduleId, { ...schedule, lane: 'unknown' });
    const corrupted = malformed.snapshot();
    expectSenderCode(
      () => (ptrModule.getGameplay04KeepV1 as Callable)(malformed.context()),
      'GAMEPLAY04_STORED_STATE_INVALID',
    );
    assert.equal(malformed.snapshot(), corrupted);

    const stale = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(stale.context(), GAMEPLAY_INPUT);
    const keepId = [...stale.keeps.keys()][0]!;
    stale.keeps.set(keepId, {
      ...stale.keeps.get(keepId)!, food: 100n, wood: 100n, stone: 100n, gold: 0n,
    });
    (ptrModule.startGameplay04BuildingV1 as Callable)(stale.context(), {
      sequence: 2n, requestKey: `g04:2:${'2'.repeat(32)}`, expectedRevision: 1n,
      expectedAtlasRevision: 7n, policyVersion: 'warpkeep-0.4-gameplay-v1',
      layoutDigest: '152d900c9e2309ed822610d3b885e9dcbd0dcae1d5621b3ddbaf788844f6dec8',
      kind: 'city-mill', targetLevel: 1, x: -15_000_000n, z: 15_000_000n,
      rotation: 0, expectedCost: { food: 20n, wood: 40n, stone: 20n, gold: 0n },
      expectedDurationMicros: 120_000_000n,
    });
    const current = stale.schedules.values().next().value!;
    stale.nowMicros = current.scheduledAt.value.microsSinceUnixEpoch;
    const before = stale.snapshot();
    stale.invokeSchedule({
      ...current,
      project: { ...current.project, buildingId: `${keepId}:building:lumber-camp` },
    });
    assert.equal(stale.snapshot(), before);
    assert.equal(stale.buildings.values().next().value!.completedLevel, 0);
  });

  test('production dispatch rejects a resource group bound to the wrong component without writes', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    harness.resourceComponentKey = `GRC-${'B'.repeat(26)}`;
    const before = harness.snapshot();
    expectSenderCode(() => (ptrModule.dispatchGameplay04WorkerV1 as Callable)(
      harness.context(), {
        sequence: 2n, requestKey: `g04:2:${'c'.repeat(32)}`, expectedRevision: 1n,
        policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
        workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
        gatheringDurationMicros: 60_000_000n,
      },
    ), 'GAMEPLAY04_TARGET_INVALID');
    assert.equal(harness.snapshot(), before);
  });

  test('production dispatch rejects duplicate, noncontiguous, and legacy-active node groups', () => {
    for (const mode of ['duplicate-node', 'release-gap', 'active'] as const) {
      const harness = new PtrHarness();
      (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
      harness.resourceNodeMode = mode;
      const before = harness.snapshot();
      expectSenderCode(() => (ptrModule.dispatchGameplay04WorkerV1 as Callable)(
        harness.context(), {
          sequence: 2n, requestKey: `g04:2:${'3'.repeat(32)}`, expectedRevision: 1n,
          policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
          workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
          gatheringDurationMicros: 60_000_000n,
        },
      ), 'GAMEPLAY04_TARGET_INVALID');
      assert.equal(harness.snapshot(), before);
    }
  });

  test('PTR scheduler rejects both client caller shapes before touching state', () => {
    for (const options of [
      { foreignSender: true },
      { connectionId: {} },
    ]) {
      const harness = new PtrHarness();
      (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
      (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
        sequence: 2n, requestKey: `g04:2:${'d'.repeat(32)}`, expectedRevision: 1n,
        policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
        workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
        gatheringDurationMicros: 60_000_000n,
      });
      const current = harness.schedules.values().next().value!;
      const before = harness.snapshot();
      expectSenderCode(
        () => harness.invokeSchedule(current, options),
        'GAMEPLAY04_SCHEDULER_UNAUTHORIZED',
      );
      assert.equal(harness.snapshot(), before);
    }
  });

  test('PTR scheduler keeps current future rows and ignores missing, foreign, and stale callbacks', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
      sequence: 2n, requestKey: `g04:2:${'e'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    });
    const current = harness.schedules.values().next().value!;
    let before = harness.snapshot();
    harness.invokeSchedule(current);
    assert.equal(harness.snapshot(), before, 'reducer no-op does not emulate engine deletion');
    harness.invokeSchedule({ ...current, scheduleId: 99n });
    assert.equal(harness.snapshot(), before);
    harness.invokeSchedule({ ...current, worker: { ...current.worker, workerId: 'foreign' } });
    assert.equal(harness.snapshot(), before);

    harness.schedules.delete(current.scheduleId);
    const replacement = { ...current, scheduleId: 2n };
    harness.schedules.set(replacement.scheduleId, replacement);
    before = harness.snapshot();
    harness.invokeSchedule(current);
    assert.equal(harness.snapshot(), before);
    assert.equal(harness.schedules.has(replacement.scheduleId), true);
  });

  test('disabled owner callbacks preserve assignment, claim, wakeup, balances, and sequence', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
      sequence: 2n, requestKey: `g04:2:${'f'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    });
    const current = harness.schedules.values().next().value!;
    harness.nowMicros = current.scheduledAt.value.microsSinceUnixEpoch;
    harness.anchor = { ...harness.anchor, enabled: false };
    const before = harness.snapshot();
    harness.invokeSchedule(current);
    assert.equal(harness.snapshot(), before);
  });

  test('current PTR callback credits once without consuming command sequence', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
      sequence: 2n, requestKey: `g04:2:${'1'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    });
    const current = harness.schedules.values().next().value!;
    harness.nowMicros = current.scheduledAt.value.microsSinceUnixEpoch;
    harness.runScheduleByEngine(current);
    const keep = harness.keeps.values().next().value!;
    assert.deepEqual(
      { wood: keep.wood, revision: keep.revision, sequence: keep.lastAcceptedSequence },
      { wood: 60n, revision: 3n, sequence: 2n },
    );
    assert.equal(harness.reservations.size, 0);
    assert.equal(harness.schedules.size, 0);
    const settled = harness.snapshot();
    harness.invokeSchedule(current);
    assert.equal(harness.snapshot(), settled);
  });

  test('failed callback rolls back adapter writes, engine cleanup loses its row, and read repairs once', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
      sequence: 2n, requestKey: `g04:2:${'2'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    });
    const current = harness.schedules.values().next().value!;
    harness.nowMicros = current.scheduledAt.value.microsSinceUnixEpoch;
    harness.failOnUpdateKeep = true;
    assert.throws(() => harness.runScheduleByEngine(current), /injected updateKeep failure/u);
    const rolledBack = harness.keeps.values().next().value!;
    assert.deepEqual(
      { wood: rolledBack.wood, revision: rolledBack.revision, sequence: rolledBack.lastAcceptedSequence },
      { wood: 0n, revision: 2n, sequence: 2n },
    );
    assert.equal(harness.workers.values().next().value!.assignment !== undefined, true);
    assert.equal(harness.reservations.size, 1);
    assert.equal(harness.schedules.size, 0, 'engine cleanup is separate from reducer rollback');

    harness.failOnUpdateKeep = false;
    (ptrModule.getGameplay04KeepV1 as Callable)(harness.context());
    const repaired = harness.keeps.values().next().value!;
    assert.deepEqual(
      { wood: repaired.wood, revision: repaired.revision, sequence: repaired.lastAcceptedSequence },
      { wood: 60n, revision: 3n, sequence: 2n },
    );
    const settled = harness.snapshot();
    (ptrModule.getGameplay04KeepV1 as Callable)(harness.context());
    assert.equal(harness.snapshot(), settled);
  });

  test('failed arrival callback cleanup is repaired before return and a later read credits once', () => {
    const harness = new PtrHarness();
    harness.resourceAtAdjacentCell = true;
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), {
      sequence: 2n, requestKey: `g04:2:${'5'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    });
    const arrival = harness.schedules.values().next().value!;
    harness.nowMicros = arrival.scheduledAt.value.microsSinceUnixEpoch;
    harness.failOnUpdateKeep = true;
    assert.throws(() => harness.runScheduleByEngine(arrival), /injected updateKeep failure/u);
    assert.equal(harness.schedules.size, 0);
    assert.equal(harness.reservations.size, 1);
    assert.equal(harness.keeps.values().next().value!.revision, 2n);

    harness.failOnUpdateKeep = false;
    (ptrModule.getGameplay04KeepV1 as Callable)(harness.context());
    const repaired = harness.schedules.values().next().value!;
    assert.ok(repaired.scheduleId > arrival.scheduleId);
    assert.ok(repaired.scheduledAt.value.microsSinceUnixEpoch > harness.nowMicros);
    assert.deepEqual(
      { wood: harness.keeps.values().next().value!.wood,
        revision: harness.keeps.values().next().value!.revision,
        sequence: harness.keeps.values().next().value!.lastAcceptedSequence },
      { wood: 0n, revision: 3n, sequence: 2n },
    );

    harness.nowMicros = repaired.scheduledAt.value.microsSinceUnixEpoch + 2_000_000n;
    (ptrModule.getGameplay04KeepV1 as Callable)(harness.context());
    assert.deepEqual(
      { wood: harness.keeps.values().next().value!.wood,
        revision: harness.keeps.values().next().value!.revision,
        sequence: harness.keeps.values().next().value!.lastAcceptedSequence },
      { wood: 60n, revision: 4n, sequence: 2n },
    );
    const settled = harness.snapshot();
    (ptrModule.getGameplay04KeepV1 as Callable)(harness.context());
    assert.equal(harness.snapshot(), settled);
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

  test('renewed owner session replays before resource loading while expired, suspended, and cross-db sessions cannot replay', () => {
    const harness = new PtrHarness();
    (ptrModule.initializeGameplay04KeepV1 as Callable)(harness.context(), GAMEPLAY_INPUT);
    const input = {
      sequence: 2n, requestKey: `g04:2:${'4'.repeat(32)}`, expectedRevision: 1n,
      policyVersion: 'warpkeep-0.4-gameplay-v1', expectedAtlasRevision: 7n,
      workerOrdinal: 0, locationId: 'LOCATION:WOOD', resource: 'wood',
      gatheringDurationMicros: 60_000_000n,
    };
    const original = (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), input);
    harness.payload = ownerPayload({
      iat: 1_040, nbf: 1_040, session_iat: 1_040, jti: 'renewed-owner-jti',
    });
    harness.resourceNodeMode = 'active';
    const beforeReplay = harness.snapshot();
    assert.deepEqual(
      (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), input),
      original,
    );
    assert.equal(harness.snapshot(), beforeReplay);

    for (const mutate of [
      () => { harness.payload = ownerPayload({ exp: 1_050, session_exp: 1_050 }); },
      () => { harness.payload = ownerPayload({ ptr_database_identity: '2'.repeat(64) }); },
      () => {
        harness.payload = ownerPayload();
        harness.anchor = { ...harness.anchor, enabled: false };
      },
    ]) {
      harness.anchor = { ...harness.anchor, enabled: true };
      mutate();
      const before = harness.snapshot();
      assert.throws(
        () => (ptrModule.dispatchGameplay04WorkerV1 as Callable)(harness.context(), input),
        /INVALID_PTR_OWNER_SESSION|PTR_OWNER_NOT_AUTHORIZED/u,
      );
      assert.equal(harness.snapshot(), before);
    }
  });

  test('stale atlas and changed atlas binding fail without reseeding', () => {
    const stale = new PtrHarness();
    const staleBefore = stale.snapshot();
    stale.importEpoch = 0n;
    expectSenderCode(
      () => (ptrModule.initializeGameplay04KeepV1 as Callable)(stale.context(), GAMEPLAY_INPUT),
      'PTR_ATLAS_UNAVAILABLE',
    );
    assert.equal(stale.snapshot(), staleBefore);

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
  test('both modules append the same seven private gameplay descriptors', () => {
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
    assert.equal(ptr.length, 7);
    assert.deepEqual(
      g002.map((row: any) => ({
        sourceName: row.sourceName,
        tableAccess: row.tableAccess,
        fields: row.rowType.value.elements.map((element: any) => ({
          name: element.name,
          tag: element.algebraicType.tag,
        })),
      })),
      ptr.map((row: any) => ({
        sourceName: row.sourceName,
        tableAccess: row.tableAccess,
        fields: row.rowType.value.elements.map((element: any) => ({
          name: element.name,
          tag: element.algebraicType.tag,
        })),
      })),
    );
    assert.ok(ptr.every((row: any) => row.tableAccess.tag === 'Private'));
    assert.deepEqual(ptr.map((row: any) => row.sourceName), [
      'gameplay04KeepV1', 'gameplay04WorkerV1', 'gameplay04ReceiptV1',
      'gameplay04ReservationV1', 'gameplay04BuildingV1', 'gameplay04ProjectV1',
      'gameplay04_schedule_v1',
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

  test('the G002 population guard directly counts all seven gameplay families', () => {
    const requireEmpty = genesis002Module.requireGenesis002PopulationEmpty as Callable;
    for (const changed of [
      undefined, 'gameplay04KeepV1', 'gameplay04WorkerV1', 'gameplay04ReceiptV1',
      'gameplay04ReservationV1', 'gameplay04BuildingV1', 'gameplay04ProjectV1',
      'gameplay04_schedule_v1',
    ]) {
      const db: Record<string, unknown> = {};
      for (const name of [
        'allowedFid', 'accessRequestV1', 'player', 'playerV2', 'playerOwnershipV2',
        'castle', 'realmProfileV1', 'alphaTermsAcceptanceV1', 'markAccountV1',
        'resourceAccountV1', 'greaterRealmCastleClaimV1', 'greaterRealmCellOccupancyV1',
        'greaterRealmActivationV1', 'realmWorkerSystemV2', 'gameplay04KeepV1',
        'gameplay04WorkerV1', 'gameplay04ReceiptV1',
        'gameplay04ReservationV1', 'gameplay04BuildingV1', 'gameplay04ProjectV1',
        'gameplay04_schedule_v1',
      ]) db[name] = { count: () => name === changed ? 1n : 0n };
      if (changed === undefined) assert.doesNotThrow(() => requireEmpty({ db }));
      else expectSenderCode(
        () => requireEmpty({ db }),
        'GENESIS_002_POPULATION_NOT_EMPTY',
      );
    }
  });
});
