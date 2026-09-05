import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import {
  Gameplay04KeepError,
  initializeKeep04,
  readKeep04,
  type InitializeKeepInput04,
  type KeepBinding04,
  type KeepRow04,
  type KeepStorage04,
  type ReceiptRow04,
  type WorkerSlot04,
} from '../spacetimedb/gameplay04/keep';
import { GAMEPLAY04_POLICY_VERSION } from '../spacetimedb/gameplay04/policy';

const DATABASE_IDENTITY = '1'.repeat(64);
const OWNER_FID = 42n;
const KEEP_ID = `g04:${DATABASE_IDENTITY}:${OWNER_FID}`;
const NONCE = 'a'.repeat(32);

const BINDING: KeepBinding04 = Object.freeze({
  keepId: KEEP_ID,
  databaseIdentity: DATABASE_IDENTITY,
  ownerFid: OWNER_FID,
  atlasId: 'PTR_GREATER_REALM',
  atlasRevision: 7n,
  anchorCellKey: 'T1_LOWLANDS:0:0',
});

const INPUT: InitializeKeepInput04 = Object.freeze({
  sequence: 1n,
  requestKey: `g04:1:${NONCE}`,
  expectedRevision: 0n,
  policyVersion: GAMEPLAY04_POLICY_VERSION,
});

function clonedMap<T extends { [key: string]: unknown }>(
  rows: Map<string, T>,
): Map<string, T> {
  return new Map([...rows].map(([key, row]) => [key, { ...row }]));
}

class TransactionalKeepHarness {
  keeps = new Map<string, KeepRow04>();
  workers = new Map<string, WorkerSlot04>();
  receipts = new Map<string, ReceiptRow04>();

  tx<T>(effect: (storage: KeepStorage04) => T, failWorkerInsert?: number): T {
    const keeps = clonedMap(this.keeps);
    const workers = clonedMap(this.workers);
    const receipts = clonedMap(this.receipts);
    let workerInsertCount = 0;
    const storage: KeepStorage04 = {
      findKeep: keepId => keeps.get(keepId) ?? null,
      workers: keepId => [...workers.values()].filter(row => row.keepId === keepId),
      receipts: keepId => [...receipts.values()].filter(row => row.keepId === keepId),
      insertKeep: row => {
        if (keeps.has(row.keepId)) throw new Error('duplicate keep');
        keeps.set(row.keepId, { ...row });
      },
      insertWorker: row => {
        workerInsertCount += 1;
        if (workerInsertCount === failWorkerInsert) throw new Error('worker insert failed');
        if (workers.has(row.workerId)) throw new Error('duplicate worker');
        workers.set(row.workerId, { ...row });
      },
      insertReceipt: row => {
        if (receipts.has(row.receiptId)) throw new Error('duplicate receipt');
        receipts.set(row.receiptId, { ...row });
      },
    };
    const result = effect(storage);
    this.keeps = keeps;
    this.workers = workers;
    this.receipts = receipts;
    return result;
  }

  directStorage(): KeepStorage04 {
    return {
      findKeep: keepId => this.keeps.get(keepId) ?? null,
      workers: keepId => [...this.workers.values()].filter(row => row.keepId === keepId),
      receipts: keepId => [...this.receipts.values()].filter(row => row.keepId === keepId),
      insertKeep: row => { this.keeps.set(row.keepId, row); },
      insertWorker: row => { this.workers.set(row.workerId, row); },
      insertReceipt: row => { this.receipts.set(row.receiptId, row); },
    };
  }

  snapshot() {
    const byKey = <T extends Record<string, unknown>>(rows: Map<string, T>) => (
      [...rows].sort(([left], [right]) => left.localeCompare(right))
        .map(([key, row]) => [key, { ...row }] as const)
    );
    return {
      keeps: byKey(this.keeps),
      workers: byKey(this.workers),
      receipts: byKey(this.receipts),
    };
  }
}

function expectCode(effect: () => unknown, code: string): void {
  assert.throws(effect, error => {
    assert.ok(error instanceof Gameplay04KeepError);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /42|aaaaaaaa|T1_LOWLANDS/u);
    return true;
  });
}

describe('gameplay 0.4 keep initialization authority', () => {
  test('initialization is persistent and retry has no second effect', () => {
    const harness = new TransactionalKeepHarness();
    const first = harness.tx(store => initializeKeep04(store, BINDING, 100n, INPUT));
    const before = harness.snapshot();
    const retry = harness.tx(store => initializeKeep04(store, BINDING, 200n, INPUT));

    assert.deepEqual(first, { sequence: 1n, revision: 1n });
    assert.deepEqual(retry, first);
    assert.deepEqual(harness.snapshot(), before);
    const state = readKeep04(harness.directStorage(), BINDING);
    assert.deepEqual(state.workers.map(worker => worker.ordinal), [0, 1, 2, 3]);
    assert.equal(
      state.keep.food + state.keep.wood + state.keep.stone + state.keep.gold,
      0n,
    );
    assert.equal(state.keep.createdAtMicros, 100n);
    assert.equal(state.keep.ownerFid, OWNER_FID);
    assert.ok(Object.isFrozen(state) && Object.isFrozen(state.keep));
    assert.ok(state.workers.every(Object.isFrozen));
    assert.equal(
      harness.receipts.get(`${KEEP_ID}:receipt:1`)!.fingerprint,
      JSON.stringify([
        'initialize', '1', INPUT.requestKey, '0', GAMEPLAY04_POLICY_VERSION,
      ]),
    );
  });

  test('a failure on the third Worker insert rolls back every table', () => {
    const harness = new TransactionalKeepHarness();
    assert.throws(
      () => harness.tx(
        store => initializeKeep04(store, BINDING, 100n, INPUT),
        3,
      ),
      /worker insert failed/u,
    );
    assert.deepEqual(harness.snapshot(), { keeps: [], workers: [], receipts: [] });
  });

  test('rejects malformed inputs before any write', () => {
    const invalidInputs: readonly [unknown, string][] = [
      [{ ...INPUT, sequence: 0n, requestKey: `g04:0:${NONCE}` }, 'GAMEPLAY04_SEQUENCE_INVALID'],
      [{ ...INPUT, requestKey: `g04:2:${NONCE}` }, 'GAMEPLAY04_INPUT_INVALID'],
      [{ ...INPUT, requestKey: 'g04:1:ABC' }, 'GAMEPLAY04_INPUT_INVALID'],
      [{ ...INPUT, expectedRevision: 1n }, 'GAMEPLAY04_INPUT_INVALID'],
      [{ ...INPUT, policyVersion: 'old-policy' }, 'GAMEPLAY04_INPUT_INVALID'],
      [{ ...INPUT, unexpected: true }, 'GAMEPLAY04_INPUT_INVALID'],
      [{ ...INPUT, sequence: 1 }, 'GAMEPLAY04_INPUT_INVALID'],
    ];
    for (const [input, code] of invalidInputs) {
      const harness = new TransactionalKeepHarness();
      expectCode(
        () => harness.tx(store => initializeKeep04(
          store,
          BINDING,
          100n,
          input as InitializeKeepInput04,
        )),
        code,
      );
      assert.deepEqual(harness.snapshot(), { keeps: [], workers: [], receipts: [] });
    }
  });

  test('validates binding, timestamp, and u64 boundaries', () => {
    for (const binding of [
      { ...BINDING, databaseIdentity: 'A'.repeat(64) },
      { ...BINDING, ownerFid: 0n, keepId: `g04:${DATABASE_IDENTITY}:0` },
      { ...BINDING, ownerFid: 18_446_744_073_709_551_616n },
      { ...BINDING, atlasRevision: 0n },
      { ...BINDING, anchorCellKey: '' },
      { ...BINDING, keepId: 'wrong' },
    ]) {
      const harness = new TransactionalKeepHarness();
      expectCode(
        () => harness.tx(store => initializeKeep04(store, binding, 0n, INPUT)),
        'GAMEPLAY04_BINDING_INVALID',
      );
    }
    for (const timestamp of [-1n, 9_223_372_036_854_775_808n]) {
      const harness = new TransactionalKeepHarness();
      expectCode(
        () => harness.tx(store => initializeKeep04(store, BINDING, timestamp, INPUT)),
        'GAMEPLAY04_TIMESTAMP_INVALID',
      );
    }
    const harness = new TransactionalKeepHarness();
    assert.deepEqual(
      harness.tx(store => initializeKeep04(
        store,
        BINDING,
        9_223_372_036_854_775_807n,
        INPUT,
      )),
      { sequence: 1n, revision: 1n },
    );
  });

  test('read never initializes and initialization rejects orphan rows', () => {
    const missing = new TransactionalKeepHarness();
    expectCode(
      () => readKeep04(missing.directStorage(), BINDING),
      'GAMEPLAY04_NOT_INITIALIZED',
    );

    const orphanWorker = new TransactionalKeepHarness();
    orphanWorker.workers.set(`${KEEP_ID}:worker:0`, {
      workerId: `${KEEP_ID}:worker:0`, keepId: KEEP_ID, ordinal: 0,
      assignmentRevision: 0n,
    });
    expectCode(
      () => orphanWorker.tx(store => initializeKeep04(store, BINDING, 1n, INPUT)),
      'GAMEPLAY04_STORED_STATE_INVALID',
    );

    const orphanReceipt = new TransactionalKeepHarness();
    orphanReceipt.receipts.set(`${KEEP_ID}:receipt:1`, {
      receiptId: `${KEEP_ID}:receipt:1`, keepId: KEEP_ID, sequence: 1n,
      requestKey: INPUT.requestKey,
      fingerprint: JSON.stringify([
        'initialize', '1', INPUT.requestKey, '0', GAMEPLAY04_POLICY_VERSION,
      ]),
      resultRevision: 1n,
    });
    expectCode(
      () => orphanReceipt.tx(store => initializeKeep04(store, BINDING, 1n, INPUT)),
      'GAMEPLAY04_STORED_STATE_INVALID',
    );
  });

  test('existing state fails closed on database or atlas binding changes', () => {
    for (const mutate of [
      (row: KeepRow04): KeepRow04 => ({ ...row, databaseIdentity: '2'.repeat(64) }),
      (row: KeepRow04): KeepRow04 => ({ ...row, atlasRevision: 8n }),
      (row: KeepRow04): KeepRow04 => ({ ...row, anchorCellKey: 'T1_LOWLANDS:1:0' }),
    ]) {
      const harness = new TransactionalKeepHarness();
      harness.tx(store => initializeKeep04(store, BINDING, 1n, INPUT));
      harness.keeps.set(KEEP_ID, mutate(harness.keeps.get(KEEP_ID)!));
      expectCode(
        () => readKeep04(harness.directStorage(), BINDING),
        'GAMEPLAY04_BINDING_MISMATCH',
      );
    }
  });

  test('rejects missing, duplicate, foreign, and over-cap Worker state', () => {
    const mutations: Array<(harness: TransactionalKeepHarness) => void> = [
      harness => { harness.workers.delete(`${KEEP_ID}:worker:3`); },
      harness => {
        harness.workers.set('duplicate-slot', {
          workerId: `${KEEP_ID}:worker:0`, keepId: KEEP_ID, ordinal: 0,
          assignmentRevision: 0n,
        });
      },
      harness => {
        harness.workers.set(`${KEEP_ID}:worker:3`, {
          workerId: `${KEEP_ID}:worker:3`, keepId: 'foreign', ordinal: 3,
          assignmentRevision: 0n,
        });
      },
      harness => {
        harness.workers.set(`${KEEP_ID}:worker:4`, {
          workerId: `${KEEP_ID}:worker:4`, keepId: KEEP_ID, ordinal: 4,
          assignmentRevision: 0n,
        });
      },
    ];
    for (const mutate of mutations) {
      const harness = new TransactionalKeepHarness();
      harness.tx(store => initializeKeep04(store, BINDING, 1n, INPUT));
      mutate(harness);
      expectCode(
        () => readKeep04(harness.directStorage(), BINDING),
        'GAMEPLAY04_STORED_STATE_INVALID',
      );
    }
  });

  test('receipt replay, conflict, expiry, gaps, and normal re-entry are distinct', () => {
    const harness = new TransactionalKeepHarness();
    harness.tx(store => initializeKeep04(store, BINDING, 1n, INPUT));

    expectCode(
      () => harness.tx(store => initializeKeep04(
        store,
        BINDING,
        2n,
        { ...INPUT, requestKey: `g04:1:${'b'.repeat(32)}` },
      )),
      'GAMEPLAY04_RECEIPT_CONFLICT',
    );
    harness.receipts.clear();
    expectCode(
      () => harness.tx(store => initializeKeep04(store, BINDING, 2n, INPUT)),
      'GAMEPLAY04_RECEIPT_EXPIRED',
    );
    expectCode(
      () => harness.tx(store => initializeKeep04(store, BINDING, 2n, {
        ...INPUT, sequence: 3n, requestKey: `g04:3:${NONCE}`,
      })),
      'GAMEPLAY04_SEQUENCE_INVALID',
    );
    expectCode(
      () => harness.tx(store => initializeKeep04(store, BINDING, 2n, {
        ...INPUT, sequence: 2n, requestKey: `g04:2:${NONCE}`,
        expectedRevision: 1n,
      })),
      'GAMEPLAY04_ALREADY_INITIALIZED',
    );
  });

  test('a retained replay preserves its original result after aggregate revision changes', () => {
    const harness = new TransactionalKeepHarness();
    harness.tx(store => initializeKeep04(store, BINDING, 1n, INPUT));
    const original = harness.keeps.get(KEEP_ID)!;
    harness.keeps.set(KEEP_ID, { ...original, revision: 9n });
    assert.deepEqual(
      harness.tx(store => initializeKeep04(store, BINDING, 9n, INPUT)),
      { sequence: 1n, revision: 1n },
    );
    assert.equal(harness.keeps.get(KEEP_ID)!.revision, 9n);
  });

  test('rejects a retained receipt whose result revision is ahead of the keep', () => {
    const harness = new TransactionalKeepHarness();
    harness.tx(store => initializeKeep04(store, BINDING, 1n, INPUT));
    const receiptId = `${KEEP_ID}:receipt:1`;
    harness.receipts.set(receiptId, {
      ...harness.receipts.get(receiptId)!,
      resultRevision: 2n,
    });
    expectCode(
      () => readKeep04(harness.directStorage(), BINDING),
      'GAMEPLAY04_STORED_STATE_INVALID',
    );
  });

  test('bounds receipt scans at 128 rows', () => {
    const harness = new TransactionalKeepHarness();
    harness.tx(store => initializeKeep04(store, BINDING, 1n, INPUT));
    harness.keeps.set(KEEP_ID, {
      ...harness.keeps.get(KEEP_ID)!,
      revision: 129n,
      lastAcceptedSequence: 129n,
    });
    for (let sequence = 2n; sequence <= 129n; sequence += 1n) {
      const requestKey = `g04:${sequence}:${sequence.toString(16).padStart(32, '0')}`;
      harness.receipts.set(`${KEEP_ID}:receipt:${sequence}`, {
        receiptId: `${KEEP_ID}:receipt:${sequence}`,
        keepId: KEEP_ID,
        sequence,
        requestKey,
        fingerprint: JSON.stringify(['future-command', sequence.toString(), requestKey]),
        resultRevision: sequence,
      });
    }
    expectCode(
      () => readKeep04(harness.directStorage(), BINDING),
      'GAMEPLAY04_STORED_STATE_INVALID',
    );
  });
});
