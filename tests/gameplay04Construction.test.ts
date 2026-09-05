import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'vitest';

import {
  GAMEPLAY04_LAYOUT_DIGEST,
  Gameplay04ConstructionError,
  completedBuildingLevels04,
  startBuilding04,
  type BuildingRow04,
  type ConstructionStorage04,
  type ProjectRow04,
  type ProjectSchedule04,
  type StartBuildingInput04,
} from '../spacetimedb/gameplay04/construction';
import { initializeKeep04, type KeepBinding04, type KeepRow04, type ReceiptRow04 } from '../spacetimedb/gameplay04/keep';
import { placementDigestInput04, type Placement04 } from '../spacetimedb/gameplay04/placement';
import {
  buildingCost04,
  buildingDuration04,
  GAMEPLAY04_POLICY_VERSION,
  type Building04,
  type CompletedLevels04,
} from '../spacetimedb/gameplay04/policy';
import { reconcileGameplay04 } from '../spacetimedb/gameplay04/reconciliation';
import {
  dispatchWorker04,
  type DispatchWorkerInput04,
  type Reservation04,
  type ResolvedDispatch04,
  type WorkerRow04,
  type WorkerSchedule04,
} from '../spacetimedb/gameplay04/workers';

const DATABASE = '1'.repeat(64);
const KEEP_ID = `g04:${DATABASE}:42`;
const BINDING: KeepBinding04 = Object.freeze({
  keepId: KEEP_ID,
  databaseIdentity: DATABASE,
  ownerFid: 42n,
  atlasId: 'PTR_GREATER_REALM',
  atlasRevision: 7n,
  anchorCellKey: 'CELL:0:0',
});
const ZERO_LEVELS: CompletedLevels04 = Object.freeze({
  'city-mill': 0,
  'lumber-camp': 0,
  'city-stoneworks': 0,
  'city-goldworks': 0,
  'city-barracks': 0,
  'grand-covenant-cathedral': 0,
});
const PLACEMENTS: Readonly<Record<Building04, Placement04>> = Object.freeze({
  'city-mill': Object.freeze({ kind: 'city-mill', x: -15_000_000n, z: 15_000_000n, rotation: 0 }),
  'lumber-camp': Object.freeze({ kind: 'lumber-camp', x: -15_000_000n, z: 26_000_000n, rotation: 0 }),
  'city-stoneworks': Object.freeze({ kind: 'city-stoneworks', x: 15_000_000n, z: 10_000_000n, rotation: 0 }),
  'city-goldworks': Object.freeze({ kind: 'city-goldworks', x: 15_000_000n, z: 22_000_000n, rotation: 0 }),
  'city-barracks': Object.freeze({ kind: 'city-barracks', x: 20_000_000n, z: -30_000_000n, rotation: 0 }),
  'grand-covenant-cathedral': Object.freeze({ kind: 'grand-covenant-cathedral', x: -25_500_000n, z: -23_500_000n, rotation: 0 }),
});

function key(sequence: bigint, nonce = 'a'): string {
  return `g04:${sequence}:${nonce.repeat(32)}`;
}

function cloneRows<K, V extends Record<string, unknown>>(rows: Map<K, V>): Map<K, V> {
  return new Map([...rows].map(([id, row]) => [id, { ...row }]));
}

class ConstructionHarness {
  keeps = new Map<string, KeepRow04>();
  workers = new Map<string, WorkerRow04>();
  receipts = new Map<string, ReceiptRow04>();
  reservations = new Map<string, Reservation04>();
  workerSchedules = new Map<bigint, WorkerSchedule04>();
  buildings = new Map<string, BuildingRow04>();
  projects = new Map<string, ProjectRow04>();
  projectSchedules = new Map<bigint, ProjectSchedule04>();
  nextScheduleId = 1n;
  failAfterProjectInsert = false;

  constructor() {
    this.tx(store => initializeKeep04(store, BINDING, 0n, {
      sequence: 1n, requestKey: key(1n), expectedRevision: 0n,
      policyVersion: GAMEPLAY04_POLICY_VERSION,
    }));
  }

  tx<T>(effect: (storage: ConstructionStorage04) => T): T {
    const keeps = cloneRows(this.keeps);
    const workers = cloneRows(this.workers);
    const receipts = cloneRows(this.receipts);
    const reservations = cloneRows(this.reservations);
    const workerSchedules = cloneRows(this.workerSchedules);
    const buildings = cloneRows(this.buildings);
    const projects = cloneRows(this.projects);
    const projectSchedules = cloneRows(this.projectSchedules);
    let nextScheduleId = this.nextScheduleId;
    const storage: ConstructionStorage04 = {
      findKeep: id => keeps.get(id) ?? null,
      workers: id => [...workers.values()].filter(row => row.keepId === id),
      receipts: id => [...receipts.values()].filter(row => row.keepId === id),
      reservations: id => [...reservations.values()].filter(row => row.keepId === id),
      schedules: id => [...workerSchedules.values()].filter(row => row.keepId === id),
      findReservation: id => reservations.get(id) ?? null,
      buildings: id => [...buildings.values()].filter(row => row.keepId === id),
      findProject: id => projects.get(id) ?? null,
      projectSchedules: id => [...projectSchedules.values()].filter(row => row.keepId === id),
      insertKeep: row => { keeps.set(row.keepId, { ...row }); },
      insertWorker: row => { workers.set(row.workerId, {
        ...row, assignment: row.assignment, lastReturn: row.lastReturn,
      }); },
      insertReceipt: row => { receipts.set(row.receiptId, { ...row }); },
      updateKeep: row => { keeps.set(row.keepId, { ...row }); },
      updateWorker: row => { workers.set(row.workerId, { ...row }); },
      deleteReceipt: id => { receipts.delete(id); },
      insertReservation: row => { reservations.set(row.nodeId, { ...row }); },
      deleteReservation: id => { reservations.delete(id); },
      insertSchedule: row => {
        const scheduleId = nextScheduleId++;
        workerSchedules.set(scheduleId, { ...row, scheduleId });
      },
      deleteSchedule: id => { workerSchedules.delete(id); },
      insertBuilding: row => { buildings.set(row.buildingId, { ...row }); },
      updateBuilding: row => { buildings.set(row.buildingId, { ...row }); },
      insertProject: row => {
        projects.set(row.keepId, { ...row });
        if (this.failAfterProjectInsert) throw new Error('injected project insert failure');
      },
      deleteProject: id => { projects.delete(id); },
      insertProjectSchedule: row => {
        const scheduleId = nextScheduleId++;
        projectSchedules.set(scheduleId, { ...row, scheduleId });
      },
      deleteProjectSchedule: id => { projectSchedules.delete(id); },
    };
    const result = effect(storage);
    this.keeps = keeps;
    this.workers = workers;
    this.receipts = receipts;
    this.reservations = reservations;
    this.workerSchedules = workerSchedules;
    this.buildings = buildings;
    this.projects = projects;
    this.projectSchedules = projectSchedules;
    this.nextScheduleId = nextScheduleId;
    return result;
  }

  snapshot(): string {
    return JSON.stringify({
      keeps: [...this.keeps], workers: [...this.workers], receipts: [...this.receipts],
      reservations: [...this.reservations], workerSchedules: [...this.workerSchedules],
      buildings: [...this.buildings], projects: [...this.projects],
      projectSchedules: [...this.projectSchedules], nextScheduleId: this.nextScheduleId,
    }, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
  }

  setBalances(food: bigint, wood: bigint, stone: bigint, gold: bigint): void {
    this.keeps.set(KEEP_ID, { ...this.keeps.get(KEEP_ID)!, food, wood, stone, gold });
  }
}

function quote(
  sequence: bigint,
  revision: bigint,
  kind: Building04,
  targetLevel: number,
  completed: CompletedLevels04 = ZERO_LEVELS,
  overrides: Partial<StartBuildingInput04> = {},
): StartBuildingInput04 {
  const placement = PLACEMENTS[kind];
  return Object.freeze({
    sequence,
    requestKey: key(sequence),
    expectedRevision: revision,
    expectedAtlasRevision: 7n,
    policyVersion: GAMEPLAY04_POLICY_VERSION,
    layoutDigest: GAMEPLAY04_LAYOUT_DIGEST,
    kind,
    targetLevel,
    x: placement.x,
    z: placement.z,
    rotation: placement.rotation,
    expectedCost: buildingCost04(kind, targetLevel),
    expectedDurationMicros: buildingDuration04(targetLevel, completed),
    ...overrides,
  });
}

function dispatchInput(sequence: bigint, revision: bigint, resource: 'food' | 'wood' | 'stone'): DispatchWorkerInput04 {
  return Object.freeze({
    sequence, requestKey: key(sequence), expectedRevision: revision,
    policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
    workerOrdinal: 0, locationId: `LOCATION:${resource}`, resource,
    gatheringDurationMicros: 60_000_000n,
  });
}

function target(
  resource: 'food' | 'wood' | 'stone',
  completed: CompletedLevels04 = ZERO_LEVELS,
): ResolvedDispatch04 {
  return Object.freeze({
    locationId: `LOCATION:${resource}`,
    destinationCellKey: BINDING.anchorCellKey,
    resource,
    candidateNodeIds: Object.freeze([`NODE:${resource}`]),
    route: Object.freeze([{ q: 0, r: 0 }]),
    completed,
  });
}

function expectConstructionCode(effect: () => unknown, code: string): void {
  assert.throws(effect, error => {
    assert.ok(error instanceof Gameplay04ConstructionError);
    assert.equal(error.code, code);
    return true;
  });
}

function earnStarterResources(harness: ConstructionHarness): void {
  let now = 0n;
  let revision = 1n;
  let sequence = 2n;
  for (const resource of ['food', 'wood', 'stone'] as const) {
    assert.doesNotThrow(
      () => harness.tx(store => dispatchWorker04(
        store, BINDING, now, dispatchInput(sequence, revision, resource), target(resource),
      )),
      `earned ${resource} dispatch`,
    );
    revision += 1n;
    now += 60_000_000n;
    harness.tx(store => reconcileGameplay04(store, BINDING, now));
    revision += 1n;
    sequence += 1n;
    now += 1n;
  }
  assert.deepEqual(
    (({ food, wood, stone, gold }) => ({ food, wood, stone, gold }))(harness.keeps.get(KEEP_ID)!),
    { food: 60n, wood: 60n, stone: 60n, gold: 0n },
  );
}

describe('persistent gameplay 0.4 construction', () => {
  test('earned resources buy a permanent Mill, completion is once-only, and replay is inert', () => {
    const harness = new ConstructionHarness();
    earnStarterResources(harness);
    const now = 180_000_003n;
    const input = quote(5n, 7n, 'city-mill', 1);
    const accepted = harness.tx(store => startBuilding04(store, BINDING, now, input));
    assert.deepEqual(accepted, { sequence: 5n, revision: 8n });
    assert.deepEqual(
      (({ food, wood, stone, gold }) => ({ food, wood, stone, gold }))(harness.keeps.get(KEEP_ID)!),
      { food: 40n, wood: 20n, stone: 40n, gold: 0n },
    );
    assert.equal(harness.buildings.get(`${KEEP_ID}:building:city-mill`)!.completedLevel, 0);
    assert.deepEqual(
      harness.tx(store => reconcileGameplay04(store, BINDING, now + 119_999_999n)),
      { changed: false, revision: 8n },
    );
    assert.deepEqual(
      harness.tx(store => reconcileGameplay04(store, BINDING, now + 120_000_000n)),
      { changed: true, revision: 9n },
    );
    assert.equal(harness.buildings.get(`${KEEP_ID}:building:city-mill`)!.completedLevel, 1);
    assert.equal(harness.projects.size, 0);
    assert.equal(harness.projectSchedules.size, 0);
    const completed = harness.snapshot();
    assert.deepEqual(harness.tx(store => startBuilding04(store, BINDING, now + 121_000_000n, input)), accepted);
    assert.equal(harness.snapshot(), completed);
    assert.equal(completedBuildingLevels04([...harness.buildings.values()])['city-mill'], 1);
  });

  test('upgrades preserve placement, enforce one Builder, and use completed Cathedral only for future duration', () => {
    const harness = new ConstructionHarness();
    harness.setBalances(1_000_000n, 1_000_000n, 1_000_000n, 1_000_000n);
    const cathedral = quote(2n, 1n, 'grand-covenant-cathedral', 1);
    harness.tx(store => startBuilding04(store, BINDING, 10n, cathedral));
    expectConstructionCode(
      () => harness.tx(store => startBuilding04(store, BINDING, 11n, quote(3n, 2n, 'city-mill', 1))),
      'GAMEPLAY04_BUILDER_BUSY',
    );
    harness.tx(store => reconcileGameplay04(store, BINDING, 120_000_010n));
    const levels = completedBuildingLevels04([...harness.buildings.values()]);
    const mill = quote(3n, 3n, 'city-mill', 1, levels);
    assert.equal(mill.expectedDurationMicros, 114_000_000n);
    harness.tx(store => startBuilding04(store, BINDING, 120_000_011n, mill));
    harness.tx(store => reconcileGameplay04(store, BINDING, 234_000_011n));
    const original = harness.buildings.get(`${KEEP_ID}:building:city-mill`)!;
    expectConstructionCode(
      () => harness.tx(store => startBuilding04(store, BINDING, 234_000_012n, quote(
        4n, 5n, 'city-mill', 2, levels, { x: original.x + 500_000n },
      ))),
      'GAMEPLAY04_INPUT_INVALID',
    );
    harness.tx(store => startBuilding04(store, BINDING, 234_000_012n, quote(4n, 5n, 'city-mill', 2, levels)));
    const upgraded = harness.buildings.get(original.buildingId)!;
    assert.deepEqual([upgraded.x, upgraded.z, upgraded.rotation, upgraded.revision], [original.x, original.z, original.rotation, 2n]);
  });

  test('quote mismatches, insufficient resources, invalid placement, and failed persistence consume nothing', () => {
    for (const mutate of [
      (input: StartBuildingInput04) => ({ ...input, layoutDigest: '0'.repeat(64) }),
      (input: StartBuildingInput04) => ({ ...input, policyVersion: 'old' }),
      (input: StartBuildingInput04) => ({ ...input, expectedCost: { ...input.expectedCost, wood: 39n } }),
      (input: StartBuildingInput04) => ({ ...input, expectedDurationMicros: 1n }),
      (input: StartBuildingInput04) => ({ ...input, rotation: 1 }),
      (input: StartBuildingInput04) => ({ ...input, x: 1n }),
    ]) {
      const harness = new ConstructionHarness();
      harness.setBalances(100n, 100n, 100n, 100n);
      const before = harness.snapshot();
      expectConstructionCode(
        () => harness.tx(store => startBuilding04(store, BINDING, 1n, mutate(quote(2n, 1n, 'city-mill', 1)) as StartBuildingInput04)),
        'GAMEPLAY04_INPUT_INVALID',
      );
      assert.equal(harness.snapshot(), before);
    }
    for (const resource of ['food', 'wood', 'stone', 'gold'] as const) {
      const harness = new ConstructionHarness();
      const cost = buildingCost04('city-goldworks', 1);
      harness.setBalances(cost.food, cost.wood, cost.stone, cost.gold);
      harness.keeps.set(KEEP_ID, { ...harness.keeps.get(KEEP_ID)!, [resource]: cost[resource] - 1n });
      const before = harness.snapshot();
      expectConstructionCode(
        () => harness.tx(store => startBuilding04(store, BINDING, 1n, quote(2n, 1n, 'city-goldworks', 1))),
        'GAMEPLAY04_INSUFFICIENT_RESOURCES',
      );
      assert.equal(harness.snapshot(), before);
    }
    const rollback = new ConstructionHarness();
    rollback.setBalances(100n, 100n, 100n, 100n);
    const before = rollback.snapshot();
    rollback.failAfterProjectInsert = true;
    assert.throws(
      () => rollback.tx(store => startBuilding04(store, BINDING, 1n, quote(2n, 1n, 'city-mill', 1))),
      /injected project insert failure/u,
    );
    assert.equal(rollback.snapshot(), before);
  });

  test('all six legal placements validate and completed effects are derived from persisted rows', () => {
    const harness = new ConstructionHarness();
    harness.setBalances(1_000_000n, 1_000_000n, 1_000_000n, 1_000_000n);
    let sequence = 2n;
    let revision = 1n;
    let now = 0n;
    for (const kind of Object.keys(PLACEMENTS) as Building04[]) {
      const levels = completedBuildingLevels04([...harness.buildings.values()]);
      const input = quote(sequence, revision, kind, 1, levels);
      harness.tx(store => startBuilding04(store, BINDING, now, input));
      revision += 1n;
      now += input.expectedDurationMicros;
      harness.tx(store => reconcileGameplay04(store, BINDING, now));
      revision += 1n;
      sequence += 1n;
      now += 1n;
    }
    assert.deepEqual(completedBuildingLevels04([...harness.buildings.values()]), {
      'city-mill': 1, 'lumber-camp': 1, 'city-stoneworks': 1,
      'city-goldworks': 1, 'city-barracks': 1, 'grand-covenant-cathedral': 1,
    });
  });

  test('the fixed quote digest is the SHA256 of the canonical placement input', () => {
    assert.equal(
      createHash('sha256').update(placementDigestInput04(), 'utf8').digest('hex'),
      GAMEPLAY04_LAYOUT_DIGEST,
    );
    assert.equal(GAMEPLAY04_LAYOUT_DIGEST, '152d900c9e2309ed822610d3b885e9dcbd0dcae1d5621b3ddbaf788844f6dec8');
  });
});
