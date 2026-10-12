import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeProductionPlayerCanaryRecoverySnapshotV2,
  parseProductionPlayerCanaryRecoverySnapshotV2,
} from '../src/productionPlayerCanaryRecoveryPolicy';
import { type PreparedCanaryFixture, clone, completeWorkerAssignmentNaturally, dispatchGenericCanaryRoute, dispatchProductionCanaryOrdinal, errorCode, inspectProductionPlayerCanaryRecoveryStatusV1, prepareProductionPlayerCanaryFixture, recallOrdinaryCanaryRoute, recoverProductionCanaryOrdinal, runNextWorkerSchedule, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('production canary fence-first serialization is atomic, terminal, and replay-only', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, baselineInput } = prepared;
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 1n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const rows = fixture.tables.workerCommandIdempotencyV1.rows.filter(
    row => row.fid === fid,
  );
  assert.equal(rows.length, 5);
  const marker = rows.at(-1)!;
  assert.equal(
    marker.requestKey,
    `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
  );
  assert.equal(marker.commandKind, 'recall-all');
  assert.equal(marker.workerId, undefined);
  for (let index = 0; index < 4; index += 1) {
    const position = rows[index]!;
    assert.equal(
      position.requestKey,
      `${fid.toString()}:${commands.commands[index]!.dispatchIdempotencyKey}`,
    );
    assert.equal(position.commandKind, 'recall');
    assert.equal(position.workerId, prepared.routePlan.routes[index]!.workerId);
    assert.deepEqual(position.createdAt, marker.createdAt);
  }
  const replayBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), replayBefore);
  assert.equal(
    inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      ...baselineInput,
    }).disposition,
    'terminal-evidence-impossible',
  );
  const dispatchBefore = stateText(fixture);
  assert.match(
    errorCode(() => dispatchProductionCanaryOrdinal(prepared, 1)) ?? '',
    /FENCED/,
  );
  assert.equal(stateText(fixture), dispatchBefore);
});

test('production canary rejects future recovery rows and malformed f00 snapshots without writes', () => {
  const assertRejected = (
    prepared: PreparedCanaryFixture,
    label: string,
  ) => {
    const { fixture, fid, baselineInput } = prepared;
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u,
      label,
    );
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
      fixture.ctx,
      { ...baselineInput },
    )) ?? '', /RECEIPT_INVALID|REPLAY_INVALID|ASSIGNMENT_INVALID/u, label);
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
  };

  for (const kind of ['marker', 'position'] as const) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const key = kind === 'marker'
      ? commands.recoveryFenceIdempotencyKey
      : commands.commands[0]!.dispatchIdempotencyKey;
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${key}`,
    )!.createdAt = timestamp(
      fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
    );
    assertRejected(prepared, `future ${kind}`);
  }

  {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, registration } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      'generic-future-receipt-0001',
      registration.notAfterMicros,
    );
    fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment!.assignmentId
      && row.commandKind.startsWith('dispatch-v2:')
    ))!.createdAt = timestamp(
      fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
    );
    assertRejected(prepared, 'future generic');
  }

  for (const kind of ['payload', 'vector', 'maximum'] as const) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, registration } = prepared;
    if (kind === 'vector') dispatchProductionCanaryOrdinal(prepared, 1);
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const marker = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
    )!;
    if (kind === 'payload') marker.assignmentId = 'pc2-f00-s1|malformed';
    if (kind === 'maximum') marker.resultRevision += 1n;
    if (kind === 'vector') {
      const snapshot = [...parseProductionPlayerCanaryRecoverySnapshotV2(
        marker.assignmentId!,
      )];
      [snapshot[0], snapshot[1]] = [snapshot[1]!, snapshot[0]!];
      marker.assignmentId = encodeProductionPlayerCanaryRecoverySnapshotV2(snapshot);
    }
    assertRejected(prepared, `snapshot ${kind}`);
  }
});

test('production canary completed f00 never heals a missing position fence', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, baselineInput } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const missingKey = `${fid.toString()}:${commands.commands[2]!.dispatchIdempotencyKey}`;
  fixture.tables.workerCommandIdempotencyV1.requestKey.delete(missingKey);
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(missingKey),
    null,
  );
  const before = stateText(fixture);
  const uuidBefore = fixture.uuidSequence;
  assert.match(
    errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
    /REPLAY_INVALID|RECEIPT_INVALID/u,
  );
  assert.equal(stateText(fixture), before);
  assert.equal(fixture.uuidSequence, uuidBefore);
  assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
    fixture.ctx,
    { ...baselineInput },
  )) ?? '', /REPLAY_INVALID|RECEIPT_INVALID/u);
  assert.equal(stateText(fixture), before);
  assert.equal(fixture.uuidSequence, uuidBefore);
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(missingKey),
    null,
  );
});

test('production canary dispatch-first lost response is clamped then atomically recalled and fenced', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, routePlan } = prepared;
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.equal(dispatched.idempotent, false);
  assert.ok(dispatched.assignment);
  assert.equal(
    dispatched.assignment.gatheringEndsAtMicros
      - dispatched.assignment.arrivesAtMicros,
    119_999_999n,
  );
  const plannedReturn = dispatched.assignment.gatheringEndsAtMicros
    + (dispatched.assignment.arrivesAtMicros - dispatched.assignment.startedAtMicros);
  assert.ok(plannedReturn < registration.notAfterMicros);

  const lostResponseBefore = stateText(fixture);
  const replay = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.assignment?.assignmentId, dispatched.assignment.assignmentId);
  assert.equal(stateText(fixture), lostResponseBefore);

  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const receipts = fixture.tables.workerCommandIdempotencyV1.rows.filter(
    row => row.fid === fid,
  );
  assert.equal(receipts.length, 6);
  const marker = receipts.at(-1)!;
  assert.equal(
    marker.requestKey,
    `${fid.toString()}:${commands.recoveryFenceIdempotencyKey}`,
  );
  assert.equal(marker.commandKind, 'recall-all');
  assert.match(marker.assignmentId, /^pc2-f00-s1\|/u);
  const recall = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.recallIdempotencyKey}`,
  );
  assert.equal(recall?.assignmentId, dispatched.assignment.assignmentId);
  assert.equal(
    fixture.tables.castleWorkerV1.workerId.find(routePlan.routes[0]!.workerId)?.status,
    'returning',
  );
  for (let index = 1; index < 4; index += 1) {
    const position = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${commands.commands[index]!.dispatchIdempotencyKey}`,
    );
    assert.equal(position?.workerId, routePlan.routes[index]!.workerId);
    assert.deepEqual(position?.createdAt, marker.createdAt);
  }
  const fencedBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 1), 'fenced');
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), fencedBefore);
});

test('production canary pc2 dispatch and ordinal-zero serialize safely at the same microsecond', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(dispatched.assignment);
  const dispatchAt = clone(prepared.fixture.ctx.timestamp);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const recall = prepared.fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${prepared.fid.toString()}:${prepared.commands.commands[0]!.recallIdempotencyKey}`,
  )!;
  assert.deepEqual(recall.createdAt, dispatchAt);
  assert.equal(recall.resultRevision, 2n);
  const before = stateText(prepared.fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(prepared.fixture), before);
});

test('production canary f00 accepts same-micro generic-after serialization through terminal completion', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput, registration, routePlan } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const markerAt = clone(fixture.ctx.timestamp);
  const generic = dispatchGenericCanaryRoute(
    prepared,
    1,
    'generic-after-f00-worker-0001',
    registration.notAfterMicros,
  );
  assert.equal(generic.idempotent, false);
  assert.deepEqual(generic.assignment?.createdAt, markerAt);
  let status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    ...baselineInput,
  });
  assert.equal(status.terminalSafe, false);
  assert.equal(status.disposition, 'terminal-evidence-impossible');
  const activeBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), activeBefore);

  completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);
  status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    ...baselineInput,
  });
  assert.equal(status.terminalSafe, true);
  assert.equal(status.disposition, 'terminal-evidence-impossible');
  const terminalBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), terminalBefore);
});

test('production canary f00 tracks generic-before completion after direct and post-arrival recalls', () => {
  const exercise = (recallAfterArrival: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      recallAfterArrival
        ? 'generic-before-f00-arrival-recall-0001'
        : 'generic-before-f00-direct-recall-0001',
      registration.notAfterMicros,
    );
    assert.ok(generic.assignment);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const marker = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${prepared.commands.recoveryFenceIdempotencyKey}`,
    )!;
    assert.deepEqual(marker.createdAt, generic.assignment.createdAt);

    if (recallAfterArrival) runNextWorkerSchedule(fixture, workerId);
    recallOrdinaryCanaryRoute(
      prepared,
      1,
      recallAfterArrival
        ? 'generic-after-arrival-recall-0001'
        : 'generic-direct-outbound-recall-0001',
      fixture.ctx.timestamp.microsSinceUnixEpoch,
    );
    const recall = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment?.assignmentId
      && row.commandKind === 'recall'
    ))!;
    assert.equal(
      recall.resultRevision,
      recallAfterArrival ? 3n : 2n,
    );
    runNextWorkerSchedule(fixture, workerId);
    assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);
    const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      ...baselineInput,
    });
    assert.equal(status.terminalSafe, true);
    assert.equal(status.disposition, 'terminal-evidence-impossible');
    const terminalBefore = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    assert.equal(stateText(fixture), terminalBefore);
  };
  exercise(false);
  exercise(true);
});

test('production canary terminal replay tracks a later journey after f00 captured original pc2 returning', () => {
  const exercise = (natural: boolean) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    dispatchProductionCanaryOrdinal(prepared, 1);
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const markerSnapshot = parseProductionPlayerCanaryRecoverySnapshotV2(
      fixture.tables.workerCommandIdempotencyV1.requestKey.find(
        `${fid.toString()}:${prepared.commands.recoveryFenceIdempotencyKey}`,
      )!.assignmentId!,
    )[0]!;
    assert.equal(markerSnapshot.status, 'r');
    assert.ok(markerSnapshot.assignmentId);
    runNextWorkerSchedule(fixture, workerId);
    assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);

    const later = dispatchGenericCanaryRoute(
      prepared,
      1,
      natural
        ? 'generic-after-original-snapshot-natural-0001'
        : 'generic-after-original-snapshot-direct-0001',
      fixture.ctx.timestamp.microsSinceUnixEpoch < registration.notAfterMicros
        ? registration.notAfterMicros
        : fixture.ctx.timestamp.microsSinceUnixEpoch,
    );
    assert.ok(later.assignment);
    if (natural) {
      completeWorkerAssignmentNaturally(fixture, workerId);
    } else {
      recallOrdinaryCanaryRoute(
        prepared,
        1,
        'generic-after-original-snapshot-direct-recall-0001',
        fixture.ctx.timestamp.microsSinceUnixEpoch,
      );
      runNextWorkerSchedule(fixture, workerId);
    }
    assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);
    const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      ...baselineInput,
    });
    assert.equal(status.terminalSafe, true);
    assert.equal(status.disposition, 'terminal-evidence-impossible');
    const before = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    assert.equal(stateText(fixture), before);
  };
  exercise(false);
  exercise(true);
});
