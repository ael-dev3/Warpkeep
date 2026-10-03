import assert from 'node:assert/strict';
import test from 'node:test';
import { clone, completeWorkerAssignmentNaturally, dispatchGenericCanaryRoute, dispatchProductionCanaryOrdinal, errorCode, inspectProductionPlayerCanaryRecoveryStatusV1, prepareProductionPlayerCanaryFixture, recallAllCastleWorkers, recallOrdinaryCanaryRoute, recoverProductionCanaryOrdinal, replayProductionCanaryOrdinalAtCurrentTime, runCurrentWorkerSchedule, runNextWorkerSchedule, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('production canary completed f00 rejects historical assignment occupation and schedule orphans without writes', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, routePlan, registration } = prepared;
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(dispatched.assignment);
  const assignmentTemplate = clone(dispatched.assignment);
  const occupationTemplate = clone(
    fixture.tables.workerNodeOccupationV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);

  const assertRejectedWithoutWrite = (insert: () => void, remove: () => void) => {
    insert();
    const before = stateText(fixture);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /ASSIGNMENT_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    remove();
  };
  assertRejectedWithoutWrite(
    () => fixture.tables.workerAssignmentV1.insert({
      ...assignmentTemplate,
      fid: 99_999n,
      workerId: 'orphan-worker-assignment',
    }),
    () => {
      fixture.tables.workerAssignmentV1.assignmentId.delete(
        assignmentTemplate.assignmentId,
      );
    },
  );
  assertRejectedWithoutWrite(
    () => fixture.tables.workerNodeOccupationV1.insert({
      ...occupationTemplate,
      workerId: 'orphan-worker-occupation',
      originCastleId: 99_999n,
    }),
    () => {
      fixture.tables.workerNodeOccupationV1.nodeKey.delete(
        occupationTemplate.nodeKey,
      );
    },
  );
  let orphanScheduleId = 0n;
  assertRejectedWithoutWrite(
    () => {
      const inserted = fixture.tables.workerAssignmentScheduleV1.insert({
        ...scheduleTemplate,
        scheduleId: 0n,
        workerId: 'orphan-worker-schedule',
      });
      orphanScheduleId = inserted.scheduleId;
    },
    () => {
      fixture.tables.workerAssignmentScheduleV1.scheduleId.delete(orphanScheduleId);
    },
  );
});

test('production canary pc2 replay is read-only after recall returning and terminal orphan variants', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, routePlan } = prepared;
  const dispatched = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(dispatched.assignment);
  const assignmentTemplate = clone(dispatched.assignment);
  const occupationTemplate = clone(
    fixture.tables.workerNodeOccupationV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      routePlan.routes[0]!.workerId,
    )!,
  );

  assert.equal(recoverProductionCanaryOrdinal(prepared, 1), 'recalled');
  const returningBefore = stateText(fixture);
  const returningReplay = replayProductionCanaryOrdinalAtCurrentTime(prepared, 1);
  assert.equal(returningReplay.idempotent, true);
  assert.equal(returningReplay.assignment?.phase, 'returning');
  assert.equal(stateText(fixture), returningBefore);

  runNextWorkerSchedule(fixture, routePlan.routes[0]!.workerId);
  const terminalBefore = stateText(fixture);
  const terminalReplay = replayProductionCanaryOrdinalAtCurrentTime(prepared, 1);
  assert.equal(terminalReplay.idempotent, true);
  assert.equal(terminalReplay.assignment, undefined);
  assert.equal(stateText(fixture), terminalBefore);

  const assertTerminalOrphanRejected = (
    label: string,
    insert: () => void,
    remove: () => void,
  ) => {
    insert();
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /ASSIGNMENT_INVALID|REPLAY_INVALID/u,
      label,
    );
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    remove();
  };
  assertTerminalOrphanRejected(
    'assignment',
    () => fixture.tables.workerAssignmentV1.insert({
      ...assignmentTemplate,
      fid: 99_999n,
      workerId: 'pc2-replay-orphan-assignment',
    }),
    () => fixture.tables.workerAssignmentV1.assignmentId.delete(
      assignmentTemplate.assignmentId,
    ),
  );
  assertTerminalOrphanRejected(
    'occupation',
    () => fixture.tables.workerNodeOccupationV1.insert({
      ...occupationTemplate,
      workerId: 'pc2-replay-orphan-occupation',
      originCastleId: 99_999n,
    }),
    () => fixture.tables.workerNodeOccupationV1.nodeKey.delete(
      occupationTemplate.nodeKey,
    ),
  );
  let orphanScheduleId = 0n;
  assertTerminalOrphanRejected(
    'schedule',
    () => {
      orphanScheduleId = fixture.tables.workerAssignmentScheduleV1.insert({
        ...scheduleTemplate,
        scheduleId: 0n,
        workerId: 'pc2-replay-orphan-schedule',
      }).scheduleId;
    },
    () => fixture.tables.workerAssignmentScheduleV1.scheduleId.delete(
      orphanScheduleId,
    ),
  );
});

test('production canary terminal pc2 and generic receipts must be chronologically complete when observed', () => {
  for (const recalled of [false, true]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, commands, routePlan } = prepared;
    dispatchProductionCanaryOrdinal(prepared, 1);
    const workerId = routePlan.routes[0]!.workerId;
    if (recalled) {
      runNextWorkerSchedule(fixture, workerId);
      assert.equal(recoverProductionCanaryOrdinal(prepared, 1), 'recalled');
      runNextWorkerSchedule(fixture, workerId);
    } else {
      completeWorkerAssignmentNaturally(fixture, workerId);
    }
    const receipt = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${fid.toString()}:${recalled
        ? commands.commands[0]!.recallIdempotencyKey
        : commands.commands[0]!.dispatchIdempotencyKey}`,
    )!;
    receipt.createdAt = timestamp(
      receipt.createdAt.microsSinceUnixEpoch + 1n,
    );
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(prepared, 1)) ?? '',
      /ASSIGNMENT_INVALID|REPLAY_INVALID|RECEIPT_INVALID|ROSTER_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
  }

  for (const recalled of [false, true]) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      recalled
        ? 'generic-terminal-chronology-recall-0001'
        : 'generic-terminal-chronology-natural-0001',
      registration.notAfterMicros,
    );
    const workerId = routePlan.routes[0]!.workerId;
    if (recalled) {
      runNextWorkerSchedule(fixture, workerId);
      recallOrdinaryCanaryRoute(
        prepared,
        1,
        'generic-terminal-chronology-recall-command-0001',
        fixture.ctx.timestamp.microsSinceUnixEpoch,
      );
      runNextWorkerSchedule(fixture, workerId);
    } else {
      completeWorkerAssignmentNaturally(fixture, workerId);
    }
    const receipt = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === generic.assignment!.assignmentId
      && (
        recalled
          ? row.commandKind === 'recall'
          : row.commandKind.startsWith('dispatch-v2:')
      )
    ))!;
    receipt.createdAt = timestamp(
      receipt.createdAt.microsSinceUnixEpoch + 1n,
    );
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
      fixture.ctx,
      { ...baselineInput },
    )) ?? '', /ASSIGNMENT_INVALID|REPLAY_INVALID|RECEIPT_INVALID|ROSTER_INVALID/u);
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /ASSIGNMENT_INVALID|REPLAY_INVALID|RECEIPT_INVALID|ROSTER_INVALID/u,
    );
    assert.equal(stateText(fixture), before);
    assert.equal(fixture.uuidSequence, uuidBefore);
  }
});

test('production canary approval permanently blocks ordinary recall-all while leaving other FIDs unchanged', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, castle, registration } = prepared;
  const assertBlocked = (atMicros: bigint, key: string) => {
    fixture.ctx.timestamp = timestamp(atMicros);
    const before = stateText(fixture);
    assert.equal(errorCode(() => fixture.transaction(() => (
      recallAllCastleWorkers(fixture.ctx, {
        fid,
        castle,
        idempotencyKey: key,
      })
    ))), 'PRODUCTION_PLAYER_CANARY_RECALL_ALL_PERMANENTLY_BLOCKED');
    assert.equal(stateText(fixture), before);
  };
  assertBlocked(registration.approvedAtMicros, 'blocked-recall-all-window-0001');
  assertBlocked(registration.notAfterMicros, 'blocked-recall-all-cutoff-0002');
  assertBlocked(registration.notAfterMicros + 1n, 'blocked-recall-all-after-0003');
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assertBlocked(registration.notAfterMicros + 2n, 'blocked-recall-all-f00-0004');

  const registrationRow = fixture.tables
    .productionPlayerCanaryApprovalRegistrationV1.fid.find(fid)!;
  registrationRow.commandKeyPolicyVersion = 'malformed-v1';
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros + 3n);
  const malformedBefore = stateText(fixture);
  assert.equal(errorCode(() => fixture.transaction(() => (
    recallAllCastleWorkers(fixture.ctx, {
      fid,
      castle,
      idempotencyKey: 'blocked-recall-all-malformed-0005',
    })
  ))), 'STATE_INTEGRITY');
  assert.equal(stateText(fixture), malformedBefore);

  const otherFid = 1_001n;
  const otherCastle = fixture.tables.castle.ownerFid.find(otherFid)!;
  fixture.transaction(() => recallAllCastleWorkers(fixture.ctx, {
    fid: otherFid,
    castle: otherCastle,
    idempotencyKey: 'other-fid-recall-all-allowed-0001',
  }));
  assert.notEqual(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${otherFid.toString()}:other-fid-recall-all-allowed-0001`,
    ),
    null,
  );
});

test('production canary preserves historical recall-all rows but rejects replay and post-registration topology', () => {
  const historical = prepareProductionPlayerCanaryFixture();
  const historicalKey = `${historical.fid.toString()}:historical-recall-all-0001`;
  const registeredAtMicros = historical.registration.registeredAtMicros;
  historical.fixture.tables.workerCommandIdempotencyV1.insert({
    requestKey: historicalKey,
    fid: historical.fid,
    workerId: undefined,
    commandKind: 'recall-all',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId: undefined,
    resultRevision: 0n,
    createdAt: timestamp(registeredAtMicros - 1n),
  });
  historical.fixture.ctx.timestamp = timestamp(historical.registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(historical, 0), 'fenced');
  assert.notEqual(
    historical.fixture.tables.workerCommandIdempotencyV1.requestKey.find(historicalKey),
    null,
  );
  const replayBefore = stateText(historical.fixture);
  assert.equal(errorCode(() => historical.fixture.transaction(() => (
    recallAllCastleWorkers(historical.fixture.ctx, {
      fid: historical.fid,
      castle: historical.castle,
      idempotencyKey: 'historical-recall-all-0001',
    })
  ))), 'PRODUCTION_PLAYER_CANARY_RECALL_ALL_PERMANENTLY_BLOCKED');
  assert.equal(stateText(historical.fixture), replayBefore);

  const forbidden = prepareProductionPlayerCanaryFixture();
  const forbiddenKey = `${forbidden.fid.toString()}:forbidden-recall-all-0001`;
  forbidden.fixture.tables.workerCommandIdempotencyV1.insert({
    requestKey: forbiddenKey,
    fid: forbidden.fid,
    workerId: undefined,
    commandKind: 'recall-all',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId: undefined,
    resultRevision: 0n,
    createdAt: timestamp(forbidden.registration.registeredAtMicros),
  });
  forbidden.fixture.ctx.timestamp = timestamp(forbidden.registration.notAfterMicros);
  const forbiddenBefore = stateText(forbidden.fixture);
  assert.match(
    errorCode(() => recoverProductionCanaryOrdinal(forbidden, 0)) ?? '',
    /RECEIPT_INVALID/u,
  );
  assert.equal(stateText(forbidden.fixture), forbiddenBefore);
  assert.notEqual(
    forbidden.fixture.tables.workerCommandIdempotencyV1.requestKey.find(forbiddenKey),
    null,
  );
});

test('production canary accepts exact postcutoff ordinary per-worker recall before f00 active and completed', () => {
  const active = prepareProductionPlayerCanaryFixture();
  const activeDispatch = dispatchProductionCanaryOrdinal(active, 1);
  assert.ok(activeDispatch.assignment);
  recallOrdinaryCanaryRoute(
    active,
    1,
    'ordinary-original-recall-active-0001',
    active.registration.notAfterMicros,
  );
  const activeAssignmentBefore = clone(
    active.fixture.tables.workerAssignmentV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    )!,
  );
  const activeWorkerBefore = clone(
    active.fixture.tables.castleWorkerV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    )!,
  );
  assert.equal(activeAssignmentBefore.phase, 'returning');
  assert.equal(recoverProductionCanaryOrdinal(active, 0), 'fenced');
  assert.deepEqual(
    active.fixture.tables.workerAssignmentV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    ),
    activeAssignmentBefore,
  );
  assert.deepEqual(
    active.fixture.tables.castleWorkerV1.workerId.find(
      active.routePlan.routes[0]!.workerId,
    ),
    activeWorkerBefore,
  );

  const completed = prepareProductionPlayerCanaryFixture();
  dispatchProductionCanaryOrdinal(completed, 1);
  recallOrdinaryCanaryRoute(
    completed,
    1,
    'ordinary-original-recall-complete-0001',
    completed.registration.notAfterMicros,
  );
  runCurrentWorkerSchedule(completed.fixture, completed.routePlan.routes[0]!.workerId);
  assert.equal(
    completed.fixture.tables.workerAssignmentV1.workerId.find(
      completed.routePlan.routes[0]!.workerId,
    ),
    null,
  );
  assert.equal(recoverProductionCanaryOrdinal(completed, 0), 'fenced');
  const completedBefore = stateText(completed.fixture);
  assert.equal(recoverProductionCanaryOrdinal(completed, 0), 'fenced');
  assert.equal(stateText(completed.fixture), completedBefore);
});

test('production canary accepts exact dual pc2 plus ordinary no-op recall and rejects forged dual revisions', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, commands, registration, routePlan } = prepared;
  dispatchProductionCanaryOrdinal(prepared, 1);
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const pc2Recall = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.recallIdempotencyKey}`,
  )!;
  recallOrdinaryCanaryRoute(
    prepared,
    1,
    'ordinary-original-noop-after-f00-0001',
    registration.notAfterMicros,
  );
  const ordinaryKey = `${fid.toString()}:ordinary-original-noop-after-f00-0001`;
  const ordinary = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    ordinaryKey,
  )!;
  assert.equal(ordinary.resultRevision, pc2Recall.resultRevision);
  const exactBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), exactBefore);

  runCurrentWorkerSchedule(fixture, routePlan.routes[0]!.workerId);
  const canonicalRevision = ordinary.resultRevision;
  for (const forgedRevision of [1n, canonicalRevision + 1n, canonicalRevision + 99n]) {
    ordinary.resultRevision = forgedRevision;
    const forgedBefore = stateText(fixture);
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID/u,
    );
    assert.equal(stateText(fixture), forgedBefore);
  }
  ordinary.resultRevision = canonicalRevision;
});
