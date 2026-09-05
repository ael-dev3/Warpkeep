import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import {
  initializeKeep04,
  readKeep04,
  type KeepBinding04,
  type KeepRow04,
  type ReceiptRow04,
} from '../spacetimedb/gameplay04/keep';
import { GAMEPLAY04_POLICY_VERSION } from '../spacetimedb/gameplay04/policy';
import {
  Gameplay04WorkerError,
  dispatchWorker04,
  preflightWorkerCommand04,
  recallWorker04,
  reconcileWorkers04,
  type DispatchWorkerInput04,
  type Reservation04,
  type ResolvedDispatch04,
  type WorkerRow04,
  type WorkerSchedule04,
  type WorkerStorage04,
} from '../spacetimedb/gameplay04/workers';

const DATABASE_IDENTITY = '1'.repeat(64);
const KEEP_ID = `g04:${DATABASE_IDENTITY}:42`;
const BINDING: KeepBinding04 = Object.freeze({
  keepId: KEEP_ID,
  databaseIdentity: DATABASE_IDENTITY,
  ownerFid: 42n,
  atlasId: 'PTR_GREATER_REALM',
  atlasRevision: 7n,
  anchorCellKey: 'CELL:0:0',
});
const ZERO_LEVELS = Object.freeze({
  'city-mill': 0,
  'lumber-camp': 0,
  'city-stoneworks': 0,
  'city-goldworks': 0,
  'city-barracks': 0,
  'grand-covenant-cathedral': 0,
});
const TARGET: ResolvedDispatch04 = Object.freeze({
  locationId: 'LOCATION:WOOD',
  destinationCellKey: 'CELL:2:0',
  resource: 'wood',
  candidateNodeIds: Object.freeze(['NODE:0', 'NODE:1', 'NODE:2']),
  route: Object.freeze([
    Object.freeze({ q: 0, r: 0 }),
    Object.freeze({ q: 1, r: 0 }),
    Object.freeze({ q: 2, r: 0 }),
  ]),
  completed: ZERO_LEVELS,
});

function requestKey(sequence: bigint, nonce = 'a'): string {
  return `g04:${sequence}:${nonce.repeat(32)}`;
}

function dispatchInput(
  sequence = 2n,
  expectedRevision = sequence - 1n,
  overrides: Partial<DispatchWorkerInput04> = {},
): DispatchWorkerInput04 {
  return Object.freeze({
    sequence,
    requestKey: requestKey(sequence),
    expectedRevision,
    policyVersion: GAMEPLAY04_POLICY_VERSION,
    expectedAtlasRevision: 7n,
    workerOrdinal: 0,
    locationId: 'LOCATION:WOOD',
    resource: 'wood',
    gatheringDurationMicros: 60_000_000n,
    ...overrides,
  });
}

function cloneMap<T extends Record<string, unknown>>(rows: Map<string, T>): Map<string, T> {
  return new Map([...rows].map(([key, row]) => [key, { ...row }]));
}

class WorkerHarness {
  keeps = new Map<string, KeepRow04>();
  workers = new Map<string, WorkerRow04>();
  receipts = new Map<string, ReceiptRow04>();
  reservations = new Map<string, Reservation04>();
  schedules = new Map<bigint, WorkerSchedule04>();
  nextScheduleId = 1n;
  failOn: 'updateKeep' | 'updateWorker' | 'insertReservation' | 'insertSchedule' | undefined;
  hideReservationsOnFind = false;

  constructor() {
    this.tx(store => initializeKeep04(store, BINDING, 0n, {
      sequence: 1n,
      requestKey: requestKey(1n),
      expectedRevision: 0n,
      policyVersion: GAMEPLAY04_POLICY_VERSION,
    }));
  }

  tx<T>(effect: (store: WorkerStorage04) => T): T {
    const keeps = cloneMap(this.keeps);
    const workers = cloneMap(this.workers);
    const receipts = cloneMap(this.receipts);
    const reservations = cloneMap(this.reservations);
    const schedules = new Map([...this.schedules].map(([key, row]) => [key, { ...row }]));
    let nextScheduleId = this.nextScheduleId;
    const maybeFail = (name: WorkerHarness['failOn']) => {
      if (this.failOn === name) throw new Error(`injected ${name} failure`);
    };
    const store: WorkerStorage04 = {
      findKeep: keepId => keeps.get(keepId) ?? null,
      workers: keepId => [...workers.values()].filter(row => row.keepId === keepId),
      receipts: keepId => [...receipts.values()].filter(row => row.keepId === keepId),
      reservations: keepId => [...reservations.values()].filter(row => row.keepId === keepId),
      schedules: keepId => [...schedules.values()].filter(row => row.keepId === keepId),
      findReservation: nodeId => this.hideReservationsOnFind ? null : reservations.get(nodeId) ?? null,
      insertKeep: row => { keeps.set(row.keepId, { ...row }); },
      insertWorker: row => { workers.set(row.workerId, { ...row, assignment: undefined, lastReturn: undefined }); },
      insertReceipt: row => { receipts.set(row.receiptId, { ...row }); },
      updateKeep: row => { maybeFail('updateKeep'); keeps.set(row.keepId, { ...row }); },
      updateWorker: row => { maybeFail('updateWorker'); workers.set(row.workerId, { ...row }); },
      deleteReceipt: receiptId => { receipts.delete(receiptId); },
      insertReservation: row => {
        maybeFail('insertReservation');
        if (reservations.has(row.nodeId)) throw new Error('duplicate reservation');
        reservations.set(row.nodeId, { ...row });
      },
      deleteReservation: nodeId => { reservations.delete(nodeId); },
      insertSchedule: row => {
        maybeFail('insertSchedule');
        const scheduleId = nextScheduleId++;
        schedules.set(scheduleId, { ...row, scheduleId });
      },
      deleteSchedule: scheduleId => { schedules.delete(scheduleId); },
    };
    const result = effect(store);
    this.keeps = keeps;
    this.workers = workers;
    this.receipts = receipts;
    this.reservations = reservations;
    this.schedules = schedules;
    this.nextScheduleId = nextScheduleId;
    return result;
  }

  snapshot(): string {
    return JSON.stringify({
      keeps: [...this.keeps], workers: [...this.workers], receipts: [...this.receipts],
      reservations: [...this.reservations], schedules: [...this.schedules],
      nextScheduleId: this.nextScheduleId,
    }, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
  }

  worker(ordinal: number): WorkerRow04 {
    return this.workers.get(`${KEEP_ID}:worker:${ordinal}`)!;
  }
}

function expectCode(effect: () => unknown, code: string): void {
  assert.throws(effect, error => {
    assert.ok(error instanceof Gameplay04WorkerError);
    assert.equal(error.code, code);
    return true;
  });
}

describe('persistent gameplay 0.4 Worker authority', () => {
  test('dispatch reserves a real node and credits only once after return', () => {
    const harness = new WorkerHarness();
    const dispatch = harness.tx(store => dispatchWorker04(
      store, BINDING, 0n, dispatchInput(), TARGET,
    ));
    assert.deepEqual(dispatch, { sequence: 2n, revision: 2n });
    assert.equal(harness.keeps.get(KEEP_ID)!.wood, 0n);
    assert.equal(harness.reservations.size, 1);
    assert.equal(harness.schedules.size, 1);

    assert.deepEqual(
      harness.tx(store => reconcileWorkers04(store, BINDING, 68_000_000n)),
      { changed: true, revision: 3n },
    );
    assert.equal(harness.keeps.get(KEEP_ID)!.wood, 60n);
    assert.equal(harness.worker(0).assignment, undefined);
    assert.deepEqual(harness.worker(0).lastReturn, {
      assignmentRevision: 1n,
      resource: 'wood',
      returnedAtMicros: 68_000_000n,
      earned: 60n,
      credited: 60n,
      overflow: 0n,
    });
    assert.equal(harness.reservations.size, 0);
    assert.equal(harness.schedules.size, 0);
    const settled = harness.snapshot();
    assert.deepEqual(
      harness.tx(store => reconcileWorkers04(store, BINDING, 70_000_000n)),
      { changed: false, revision: 3n },
    );
    assert.equal(harness.snapshot(), settled);
  });

  test('a retained dispatch replay succeeds after its node is reallocated', () => {
    const harness = new WorkerHarness();
    const input = dispatchInput();
    const original = harness.tx(store => dispatchWorker04(store, BINDING, 0n, input, TARGET));
    harness.tx(store => reconcileWorkers04(store, BINDING, 68_000_000n));
    harness.tx(store => dispatchWorker04(
      store,
      BINDING,
      70_000_000n,
      dispatchInput(3n, 3n, { workerOrdinal: 1, requestKey: requestKey(3n) }),
      TARGET,
    ));
    assert.equal(harness.reservations.get('NODE:0')!.workerId, `${KEEP_ID}:worker:1`);
    assert.deepEqual(
      harness.tx(store => dispatchWorker04(store, BINDING, 71_000_000n, input, {
        ...TARGET,
        candidateNodeIds: [],
      })),
      original,
    );
  });

  test('preflight distinguishes replay before resource loading and rejects conflicts or gaps', () => {
    const harness = new WorkerHarness();
    const input = dispatchInput();
    harness.tx(store => dispatchWorker04(store, BINDING, 0n, input, TARGET));
    assert.deepEqual(harness.tx(store => preflightWorkerCommand04(
      store, BINDING, 1n, { kind: 'dispatch', input },
    )), { kind: 'replay', result: { sequence: 2n, revision: 2n } });
    expectCode(() => harness.tx(store => preflightWorkerCommand04(
      store, BINDING, 1n, {
        kind: 'dispatch', input: { ...input, requestKey: requestKey(2n, 'b') },
      },
    )), 'GAMEPLAY04_RECEIPT_CONFLICT');
    expectCode(() => harness.tx(store => preflightWorkerCommand04(
      store, BINDING, 1n, {
        kind: 'recall', input: {
          sequence: 4n, requestKey: requestKey(4n), expectedRevision: 2n,
          policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
          workerOrdinal: 0,
        },
      },
    )), 'GAMEPLAY04_SEQUENCE_INVALID');
  });

  test('outbound recall uses partial-edge time and returning or idle recalls are stable', () => {
    const harness = new WorkerHarness();
    harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    const recall = (sequence: bigint, expectedRevision: bigint, now: bigint) => harness.tx(store => (
      recallWorker04(store, BINDING, now, {
        sequence, requestKey: requestKey(sequence), expectedRevision,
        policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
        workerOrdinal: 0,
      })
    ));
    assert.deepEqual(recall(3n, 2n, 1_500_000n), { sequence: 3n, revision: 3n });
    assert.equal(harness.worker(0).assignment!.journey.recalledAt, 1_500_000n);
    assert.equal(harness.schedules.values().next().value!.dueAtMicros, 3_000_000n);
    assert.deepEqual(recall(4n, 3n, 2_000_000n), { sequence: 4n, revision: 4n });
    assert.equal(harness.worker(0).assignment!.journey.recalledAt, 1_500_000n);
    harness.tx(store => reconcileWorkers04(store, BINDING, 3_000_000n));
    assert.deepEqual(recall(5n, 5n, 4_000_000n), { sequence: 5n, revision: 6n });
    assert.equal(harness.worker(0).assignment, undefined);
    assert.equal(harness.worker(0).lastReturn!.earned, 0n);
  });

  test('settlement overflow is explicit and deterministic in Worker ordinal order', () => {
    const harness = new WorkerHarness();
    harness.keeps.set(KEEP_ID, { ...harness.keeps.get(KEEP_ID)!, wood: 999_950n });
    harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    harness.tx(store => dispatchWorker04(
      store, BINDING, 0n,
      dispatchInput(3n, 2n, { workerOrdinal: 1, requestKey: requestKey(3n) }),
      TARGET,
    ));
    harness.tx(store => reconcileWorkers04(store, BINDING, 68_000_000n));
    assert.equal(harness.keeps.get(KEEP_ID)!.wood, 1_000_000n);
    assert.deepEqual(
      [harness.worker(0).lastReturn!.overflow, harness.worker(1).lastReturn!.overflow],
      [10n, 60n],
    );
  });

  test('failed reservation, schedule, or post-credit keep writes rollback every table', () => {
    for (const failure of ['insertReservation', 'insertSchedule'] as const) {
      const harness = new WorkerHarness();
      const before = harness.snapshot();
      harness.failOn = failure;
      assert.throws(
        () => harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET)),
        new RegExp(`injected ${failure} failure`, 'u'),
      );
      assert.equal(harness.snapshot(), before);
    }
    const settlement = new WorkerHarness();
    settlement.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    const before = settlement.snapshot();
    settlement.failOn = 'updateKeep';
    assert.throws(
      () => settlement.tx(store => reconcileWorkers04(store, BINDING, 68_000_000n)),
      /injected updateKeep failure/u,
    );
    assert.equal(settlement.snapshot(), before);
  });

  test('authenticated reconciliation repairs engine-cleaned wakeups and still settles once', () => {
    const beforeReturn = new WorkerHarness();
    beforeReturn.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    beforeReturn.schedules.clear();
    assert.deepEqual(
      beforeReturn.tx(store => reconcileWorkers04(store, BINDING, 4_000_000n)),
      { changed: true, revision: 3n },
    );
    assert.equal(beforeReturn.schedules.size, 1);
    assert.equal(beforeReturn.schedules.values().next().value!.dueAtMicros, 64_000_000n);

    const afterReturn = new WorkerHarness();
    afterReturn.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    afterReturn.schedules.clear();
    assert.deepEqual(
      afterReturn.tx(store => reconcileWorkers04(store, BINDING, 68_000_000n)),
      { changed: true, revision: 3n },
    );
    assert.equal(afterReturn.keeps.get(KEEP_ID)!.wood, 60n);
    const settled = afterReturn.snapshot();
    afterReturn.tx(store => reconcileWorkers04(store, BINDING, 70_000_000n));
    assert.equal(afterReturn.snapshot(), settled);
  });

  test('zero-distance routes require the actual destination and malformed paths fail closed', () => {
    const valid = new WorkerHarness();
    assert.doesNotThrow(() => valid.tx(store => dispatchWorker04(
      store, BINDING, 0n, dispatchInput(), {
        ...TARGET, destinationCellKey: BINDING.anchorCellKey,
        route: [{ q: 0, r: 0 }],
      },
    )));
    for (const target of [
      { ...TARGET, destinationCellKey: 'CELL:invented', route: [{ q: 0, r: 0 }] },
      { ...TARGET, route: [{ q: 0, r: 0 }, { q: 2, r: 0 }] },
      { ...TARGET, candidateNodeIds: ['NODE:0', 'NODE:0'] },
    ]) {
      const harness = new WorkerHarness();
      expectCode(
        () => harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), target)),
        'GAMEPLAY04_TARGET_INVALID',
      );
    }
  });

  test('zero-distance gathering recall settles atomically without a past wakeup', () => {
    const harness = new WorkerHarness();
    harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), {
      ...TARGET, destinationCellKey: BINDING.anchorCellKey, route: [{ q: 0, r: 0 }],
    }));
    assert.deepEqual(harness.tx(store => recallWorker04(store, BINDING, 5_000_000n, {
      sequence: 3n, requestKey: requestKey(3n), expectedRevision: 2n,
      policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
      workerOrdinal: 0,
    })), { sequence: 3n, revision: 3n });
    assert.equal(harness.worker(0).assignment, undefined);
    assert.equal(harness.worker(0).lastReturn!.earned, 0n);
    assert.equal(harness.schedules.size, 0);
  });

  test('an overdue wakeup must still match a real journey boundary', () => {
    const harness = new WorkerHarness();
    harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    const [id, row] = harness.schedules.entries().next().value!;
    harness.schedules.set(id, { ...row, dueAtMicros: 1_000_000n });
    expectCode(
      () => harness.tx(store => reconcileWorkers04(store, BINDING, 2_000_000n)),
      'GAMEPLAY04_STORED_STATE_INVALID',
    );
  });

  test('Worker ordinal scalar validation is controlled before sorting', () => {
    const harness = new WorkerHarness();
    const row = harness.worker(0);
    harness.workers.set(row.workerId, { ...row, ordinal: Number.NaN });
    assert.throws(
      () => readKeep04({
        findKeep: keepId => harness.keeps.get(keepId) ?? null,
        workers: keepId => [...harness.workers.values()].filter(worker => worker.keepId === keepId),
        receipts: keepId => [...harness.receipts.values()].filter(receipt => receipt.keepId === keepId),
        insertKeep: () => {}, insertWorker: () => {}, insertReceipt: () => {},
      }, BINDING),
      /GAMEPLAY04_STORED_STATE_INVALID/u,
    );
  });

  test('130 accepted commands retain only the latest 128 receipts and reject a pruned replay', () => {
    const harness = new WorkerHarness();
    let revision = 1n;
    for (let sequence = 2n; sequence <= 130n; sequence += 1n) {
      const result = harness.tx(store => recallWorker04(store, BINDING, sequence, {
        sequence, requestKey: requestKey(sequence), expectedRevision: revision,
        policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
        workerOrdinal: 0,
      }));
      revision = result.revision;
    }
    assert.equal(harness.receipts.size, 128);
    assert.equal(harness.receipts.has(`${KEEP_ID}:receipt:1`), false);
    assert.equal(harness.receipts.has(`${KEEP_ID}:receipt:130`), true);
    expectCode(() => harness.tx(store => recallWorker04(store, BINDING, 131n, {
      sequence: 2n, requestKey: requestKey(2n), expectedRevision: 1n,
      policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
      workerOrdinal: 0,
    })), 'GAMEPLAY04_RECEIPT_EXPIRED');
  });

  test('immediate recall reconciliation carries an earlier Worker settlement balance', () => {
    const harness = new WorkerHarness();
    harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    harness.tx(store => dispatchWorker04(store, BINDING, 20_000_000n, dispatchInput(
      3n, 2n, { workerOrdinal: 1, requestKey: requestKey(3n) },
    ), {
      ...TARGET, destinationCellKey: BINDING.anchorCellKey,
      candidateNodeIds: ['NODE:B'], route: [{ q: 0, r: 0 }],
    }));
    const input = {
      sequence: 4n, requestKey: requestKey(4n), expectedRevision: 3n,
      policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
      workerOrdinal: 1,
    } as const;
    assert.deepEqual(harness.tx(store => recallWorker04(
      store, BINDING, 68_000_000n, input,
    )), { sequence: 4n, revision: 4n });
    assert.equal(harness.keeps.get(KEEP_ID)!.wood, 100n);
    assert.deepEqual(
      [harness.worker(0).lastReturn?.credited, harness.worker(1).lastReturn?.credited],
      [60n, 40n],
    );
    const settled = harness.snapshot();
    assert.deepEqual(harness.tx(store => recallWorker04(
      store, BINDING, 69_000_000n, input,
    )), { sequence: 4n, revision: 4n });
    assert.equal(harness.snapshot(), settled);
  });

  test('active revision-zero and same-revision prior-return graphs fail without writes', () => {
    for (const corrupt of ['zero', 'same-return'] as const) {
      const harness = new WorkerHarness();
      harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
      const worker = harness.worker(0);
      const reservation = harness.reservations.get('NODE:0')!;
      const [scheduleId, schedule] = harness.schedules.entries().next().value!;
      if (corrupt === 'zero') {
        harness.workers.set(worker.workerId, { ...worker, assignmentRevision: 0n });
        harness.reservations.set('NODE:0', { ...reservation, assignmentRevision: 0n });
        harness.schedules.set(scheduleId, { ...schedule, assignmentRevision: 0n });
      } else {
        harness.workers.set(worker.workerId, {
          ...worker,
          lastReturn: {
            assignmentRevision: worker.assignmentRevision,
            resource: 'wood', returnedAtMicros: 0n,
            earned: 0n, credited: 0n, overflow: 0n,
          },
        });
      }
      const before = harness.snapshot();
      expectCode(
        () => harness.tx(store => reconcileWorkers04(store, BINDING, 68_000_000n)),
        'GAMEPLAY04_STORED_STATE_INVALID',
      );
      assert.equal(harness.snapshot(), before);
    }
  });

  test('scheduler revision makes a pending fresh command stale without consuming sequence', () => {
    const harness = new WorkerHarness();
    harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), TARGET));
    harness.tx(store => reconcileWorkers04(store, BINDING, 4_000_000n));
    const before = harness.snapshot();
    expectCode(() => harness.tx(store => recallWorker04(store, BINDING, 5_000_000n, {
      sequence: 3n, requestKey: requestKey(3n), expectedRevision: 2n,
      policyVersion: GAMEPLAY04_POLICY_VERSION, expectedAtlasRevision: 7n,
      workerOrdinal: 0,
    })), 'GAMEPLAY04_INPUT_INVALID');
    assert.equal(harness.snapshot(), before);
  });

  test('primary-key arbitration rolls back a concurrent stale reservation attempt', () => {
    const harness = new WorkerHarness();
    harness.reservations.set('NODE:0', {
      nodeId: 'NODE:0', keepId: 'foreign', workerId: 'foreign', assignmentRevision: 1n,
    });
    harness.hideReservationsOnFind = true;
    const before = harness.snapshot();
    assert.throws(
      () => harness.tx(store => dispatchWorker04(store, BINDING, 0n, dispatchInput(), {
        ...TARGET, candidateNodeIds: ['NODE:0'],
      })),
      /duplicate reservation/u,
    );
    assert.equal(harness.snapshot(), before);
  });

  test('wrong atlas epoch, unsupported duration, and unknown resource consume no sequence', () => {
    for (const overrides of [
      { expectedAtlasRevision: 8n },
      { gatheringDurationMicros: 1n },
      { resource: 'iron' as any },
    ]) {
      const harness = new WorkerHarness();
      const before = harness.snapshot();
      expectCode(() => harness.tx(store => dispatchWorker04(
        store, BINDING, 0n, dispatchInput(2n, 1n, overrides), TARGET,
      )), 'GAMEPLAY04_INPUT_INVALID');
      assert.equal(harness.snapshot(), before);
    }
  });
});
