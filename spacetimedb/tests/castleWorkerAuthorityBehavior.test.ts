import assert from 'node:assert/strict';
import test from 'node:test';

import {
  recallAllReplayMatches,
  recallAllWorkersReceipt,
  recallReplayMatches,
  recallWorkerReceipt,
  takeBoundedRows,
  workerCastleOwnershipMatches,
  workerCommandReceiptShapeIsValid,
  workerScheduleMatchesAssignment,
} from '../src/castleWorkerCommandPolicy';

test('canonical worker ownership rejects cross-FID and cross-castle authority', () => {
  assert.equal(workerCastleOwnershipMatches({
    fid: 101n,
    castleId: 7n,
    castleOwnerFid: 101n,
    accountFid: 101n,
    accountCastleId: 7n,
  }), true);
  assert.equal(workerCastleOwnershipMatches({
    fid: 202n,
    castleId: 7n,
    castleOwnerFid: 101n,
    accountFid: 202n,
    accountCastleId: 9n,
  }), false);
  assert.equal(workerCastleOwnershipMatches({
    fid: 101n,
    castleId: 7n,
    castleOwnerFid: 101n,
    accountFid: 101n,
    accountCastleId: 8n,
  }), false);
});

test('an idle recall receipt remains an exact harmless replay after reassignment', () => {
  const receipt = recallWorkerReceipt(
    '101:recall-noop-0001',
    101n,
    'genesis-001-castle-7-worker-01',
    4n,
  );
  assert.equal(workerCommandReceiptShapeIsValid(receipt), true);
  assert.equal(recallReplayMatches(
    receipt,
    101n,
    'genesis-001-castle-7-worker-01',
  ), true);

  const laterAssignment = Object.freeze({
    assignmentId: 'later-assignment',
    workerId: 'genesis-001-castle-7-worker-01',
    phase: 'outbound',
  });
  assert.equal(recallReplayMatches(receipt, 101n, laterAssignment.workerId), true);
  assert.equal(receipt.assignmentId, undefined);
  assert.equal(receipt.resourceKind, undefined);
  assert.equal(receipt.siteId, undefined);
});

test('recall and recall-all receipts distinguish correlation from replay-safe no-op', () => {
  const correlated = recallWorkerReceipt(
    '101:recall-active-01',
    101n,
    'genesis-001-castle-7-worker-02',
    9n,
    { resourceKind: 'wood', siteId: 'logging-camp-001', assignmentId: 'assignment-01' },
  );
  const noOpAll = recallAllWorkersReceipt('101:recall-all-noop1', 101n, 9n);
  assert.equal(workerCommandReceiptShapeIsValid(correlated), true);
  assert.equal(workerCommandReceiptShapeIsValid(noOpAll), true);
  assert.equal(recallAllReplayMatches(noOpAll, 101n), true);
  assert.equal(recallAllReplayMatches(noOpAll, 202n), false);
  assert.equal(recallReplayMatches(correlated, 101n, correlated.workerId!), true);

  assert.equal(workerCommandReceiptShapeIsValid({
    ...correlated,
    assignmentId: undefined,
    resourceKind: 'wood',
  }), false);
});

test('stale schedule generations never match the current worker lifecycle', () => {
  const assignment = Object.freeze({
    phase: 'outbound',
    workerId: 'genesis-001-castle-7-worker-03',
    timelineRevision: 8,
    arrivesAtMicros: 2_000_000n,
    gatheringEndsAtMicros: 3_000_000n,
    returnsAtMicros: 4_000_000n,
  });
  const current = Object.freeze({
    stage: 'arrival',
    workerId: assignment.workerId,
    timelineRevision: 8,
    scheduledAt: Object.freeze({
      tag: 'Time',
      value: Object.freeze({ microsSinceUnixEpoch: assignment.arrivesAtMicros }),
    }),
  });
  assert.equal(workerScheduleMatchesAssignment(current, assignment), true);
  assert.equal(workerScheduleMatchesAssignment({ ...current, timelineRevision: 7 }, assignment), false);
  assert.equal(workerScheduleMatchesAssignment({ ...current, stage: 'return-complete' }, assignment), false);
  assert.equal(workerScheduleMatchesAssignment({
    ...current,
    scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: 2_000_001n } },
  }, assignment), false);
});

test('bounded caller reads consume only the one overflow row needed to fail closed', () => {
  let reads = 0;
  const rows = (function* manyRows() {
    for (let index = 0; index < 100; index += 1) {
      reads += 1;
      yield index;
    }
  }());
  const result = takeBoundedRows(rows, 4);
  assert.deepEqual(result.rows, [0, 1, 2, 3]);
  assert.equal(result.overflow, true);
  assert.equal(reads, 5);
});
