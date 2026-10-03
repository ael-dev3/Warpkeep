import assert from 'node:assert/strict';
import test from 'node:test';
import { CASTLE_WORKER_TRAVEL_MICROS_PER_STEP, PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS } from '../src/castleWorkerPolicy';
import {
  encodeProductionPlayerCanaryRecoverySnapshotV2,
  parseProductionPlayerCanaryRecoverySnapshotV2,
} from '../src/productionPlayerCanaryRecoveryPolicy';
import { completeWorkerAssignmentNaturally, dispatchGenericCanaryRoute, dispatchProductionCanaryOrdinal, errorCode, inspectProductionPlayerCanaryRecoveryStatusV1, mutateDispatchV2ReceiptMetadata, prepareProductionPlayerCanaryFixture, recoverProductionCanaryOrdinal, replayProductionCanaryOrdinalAtCurrentTime, stateText, timestamp } from './greaterRealmRelocationTestSupport';

test('production canary rejects coherent huge generic-before-f00 revision forgery active and terminal', () => {
  const exercise = (terminal: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      terminal
        ? 'generic-before-f00-huge-terminal-0001'
        : 'generic-before-f00-huge-active-0001',
      registration.notAfterMicros,
    );
    assert.ok(generic.assignment);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    if (terminal) completeWorkerAssignmentNaturally(fixture, workerId);

    const forgedDispatchRevision = 100n;
    const genericReceipt = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment?.assignmentId
      && row.commandKind.startsWith('dispatch-v2:')
    ))!;
    genericReceipt.resultRevision = forgedDispatchRevision;
    const position = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    position.resultRevision = forgedDispatchRevision;
    const marker = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
    )!;
    const snapshot = [...parseProductionPlayerCanaryRecoverySnapshotV2(
      marker.assignmentId!,
    )];
    snapshot[0] = Object.freeze({
      ...snapshot[0]!,
      workerRevision: forgedDispatchRevision,
      timelineRevision: Number(forgedDispatchRevision),
    });
    marker.assignmentId = encodeProductionPlayerCanaryRecoverySnapshotV2(snapshot);
    marker.resultRevision = forgedDispatchRevision;
    const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
    worker.revision = terminal
      ? forgedDispatchRevision + 3n
      : forgedDispatchRevision;
    worker.timelineRevision = Number(worker.revision);
    if (!terminal) {
      const assignment = fixture.tables.workerAssignmentV1.workerId.find(workerId)!;
      const occupation = fixture.tables.workerNodeOccupationV1.byWorker.find(workerId)!;
      const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
      assignment.timelineRevision = Number(forgedDispatchRevision);
      occupation.timelineRevision = Number(forgedDispatchRevision);
      schedule.timelineRevision = Number(forgedDispatchRevision);
    }

    const before = stateText(fixture);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.match(
      errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
        fixture.ctx,
        { ...prepared.baselineInput },
      )) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
  };
  exercise(false);
  exercise(true);
});

test('production canary rejects coherent forged original pc2 revisions active and terminal', () => {
  const exercise = (terminal: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
    assert.ok(dispatched.assignment);
    if (terminal) completeWorkerAssignmentNaturally(fixture, workerId);
    const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
    worker.revision = 100n;
    worker.timelineRevision = 100;
    if (!terminal) {
      const assignment = fixture.tables.workerAssignmentV1.workerId.find(workerId)!;
      const occupation = fixture.tables.workerNodeOccupationV1.byWorker.find(workerId)!;
      const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
      assignment.timelineRevision = 100;
      occupation.timelineRevision = 100;
      schedule.timelineRevision = 100;
    }
    const before = stateText(fixture);
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /ROSTER_INVALID|ASSIGNMENT_INVALID|RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
  };
  exercise(false);
  exercise(true);
});

test('production canary rejects terminal pc2 receipts whose immutable planned return reaches cutoff', () => {
  for (const beyondCutoffMicros of [0n, 1n]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration, routePlan } = prepared;
    dispatchProductionCanaryOrdinal(prepared, 1);
    completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);
    const dispatch = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    const travelMicros = BigInt(routePlan.routes[0]!.routeSteps)
      * CASTLE_WORKER_TRAVEL_MICROS_PER_STEP;
    dispatch.createdAt = timestamp(
      registration.notAfterMicros
        - PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS
        - 2n * travelMicros
        + beyondCutoffMicros,
    );
    const before = stateText(fixture);
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
  }
});

test('production canary rebinds pc2 capacity digest on active and terminal replay paths', () => {
  for (const terminal of [false, true]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, routePlan } = prepared;
    dispatchProductionCanaryOrdinal(prepared, 1);
    if (terminal) {
      completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);
    }
    const dispatch = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    const originalCapacity = String(dispatch.commandKind).split(':')[3]!;
    mutateDispatchV2ReceiptMetadata(
      dispatch,
      'capacityDigest',
      originalCapacity === 'b'.repeat(64) ? 'c'.repeat(64) : 'b'.repeat(64),
    );
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
  }
});
