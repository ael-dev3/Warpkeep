import assert from 'node:assert/strict';
import test from 'node:test';
import { planCastleWorkerTimeline, runBoundedDueCastleWorkerScheduleDrainV1, workerResourcePolicy } from '../src/castleWorkerPolicy';
import { type PreparedCanaryFixture, type Row, clone, completeNormalProductionCanaryEvidenceRun, completeWorkerAssignmentNaturally, dispatchGenericCanaryRoute, dispatchProductionCanaryOrdinal, errorCode, fillProductionCanaryReceiptsWithPinnedRows, inspectProductionPlayerCanaryAdminEvidence, inspectProductionPlayerCanaryRecoveryStatusV1, mutateDispatchV2ReceiptMetadata, prepareProductionPlayerCanaryFixture, recallCastleWorker, recallOrdinaryCanaryRoute, recallProductionPlayerCanaryWorkerV1, recoverProductionCanaryOrdinal, runCastleWorkerSchedule, runNextWorkerSchedule, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('production canary accepts generic-after-f00 returning phase lineage for direct arrival and no-op recalls', () => {
  const exercise = (mode: 'direct' | 'arrival' | 'natural-noop') => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    const workerId = routePlan.routes[0]!.workerId;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const generic = dispatchGenericCanaryRoute(
      prepared,
      1,
      `generic-after-f00-${mode}-0001`,
      registration.notAfterMicros,
    );
    assert.ok(generic.assignment);
    if (mode !== 'direct') runNextWorkerSchedule(fixture, workerId);
    if (mode === 'natural-noop') runNextWorkerSchedule(fixture, workerId);
    recallOrdinaryCanaryRoute(
      prepared,
      1,
      `generic-after-f00-${mode}-recall-0001`,
      fixture.ctx.timestamp.microsSinceUnixEpoch,
    );
    const assignment = fixture.tables.workerAssignmentV1.workerId.find(workerId)!;
    const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
    assert.equal(assignment.phase, 'returning');
    assert.equal(worker.revision, mode === 'direct' ? 2n : 3n);
    const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
      ...baselineInput,
    });
    assert.equal(status.disposition, 'terminal-evidence-impossible');
    const before = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    assert.equal(stateText(fixture), before);
  };
  exercise('direct');
  exercise('arrival');
  exercise('natural-noop');
});

test('production canary ordinal-zero preserves two later generic journeys including one due accrual quantum', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput, registration, routePlan } = prepared;
  const original = dispatchProductionCanaryOrdinal(prepared, 1);
  assert.ok(original.assignment);
  const laterTwo = dispatchGenericCanaryRoute(
    prepared,
    2,
    'generic-mixed-due-ordinal-0002',
    registration.notAfterMicros,
  );
  const laterThree = dispatchGenericCanaryRoute(
    prepared,
    3,
    'generic-mixed-outbound-ordinal-0003',
    registration.notAfterMicros,
  );
  assert.ok(laterTwo.assignment);
  assert.ok(laterThree.assignment);
  runNextWorkerSchedule(fixture, routePlan.routes[1]!.workerId);
  const gathering = fixture.tables.workerAssignmentV1.workerId.find(
    routePlan.routes[1]!.workerId,
  )!;
  assert.equal(gathering.phase, 'gathering');
  fixture.ctx.timestamp = timestamp(
    gathering.arrivesAtMicros
      + workerResourcePolicy(gathering.resourceKind).quantumMicros,
  );

  const laterState = [1, 2].map(index => {
    const workerId = routePlan.routes[index]!.workerId;
    return Object.freeze({
      assignment: clone(fixture.tables.workerAssignmentV1.workerId.find(workerId)),
      worker: clone(fixture.tables.castleWorkerV1.workerId.find(workerId)),
      occupation: clone(fixture.tables.workerNodeOccupationV1.byWorker.find(workerId)),
      schedule: clone(fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)),
    });
  });
  const sharedEconomy = Object.freeze({
    resource: clone(fixture.tables.resourceAccountV1.fid.find(fid)),
    activation: clone(fixture.tables.greaterRealmActivationV1.rows[0]),
    claim: clone(fixture.tables.greaterRealmCastleClaimV1.castleId.find(
      prepared.castle.castleId,
    )),
    resourceNodes: clone(fixture.tables.greaterRealmResourceNodeV1.rows.filter(
      row => row.locationId === routePlan.routes[1]!.locationId
        || row.locationId === routePlan.routes[2]!.locationId,
    )),
  });
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  for (let offset = 0; offset < laterState.length; offset += 1) {
    const workerId = routePlan.routes[offset + 1]!.workerId;
    assert.deepEqual(
      {
        assignment: fixture.tables.workerAssignmentV1.workerId.find(workerId),
        worker: fixture.tables.castleWorkerV1.workerId.find(workerId),
        occupation: fixture.tables.workerNodeOccupationV1.byWorker.find(workerId),
        schedule: fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId),
      },
      laterState[offset],
    );
  }
  assert.deepEqual({
    resource: fixture.tables.resourceAccountV1.fid.find(fid),
    activation: fixture.tables.greaterRealmActivationV1.rows[0],
    claim: fixture.tables.greaterRealmCastleClaimV1.castleId.find(
      prepared.castle.castleId,
    ),
    resourceNodes: fixture.tables.greaterRealmResourceNodeV1.rows.filter(
      row => row.locationId === routePlan.routes[1]!.locationId
        || row.locationId === routePlan.routes[2]!.locationId,
    ),
  }, sharedEconomy);
  const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    ...baselineInput,
  });
  assert.equal(status.disposition, 'terminal-evidence-impossible');
  const replayBefore = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), replayBefore);
});

test('production canary delayed postcutoff ordinal recalls preserve a due unrelated generic journey', () => {
  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, registration, routePlan } = prepared;
    const laterOrdinal = ordinal === 4 ? 1 : ordinal + 1;
    dispatchProductionCanaryOrdinal(prepared, ordinal);
    const later = dispatchGenericCanaryRoute(
      prepared,
      laterOrdinal,
      `generic-delayed-recall-${ordinal}-later-${laterOrdinal}`,
      registration.notAfterMicros,
    );
    assert.ok(later.assignment);
    const laterWorkerId = routePlan.routes[laterOrdinal - 1]!.workerId;
    runNextWorkerSchedule(fixture, laterWorkerId);
    const gathering = fixture.tables.workerAssignmentV1.workerId.find(
      laterWorkerId,
    )!;
    fixture.ctx.timestamp = timestamp(
      gathering.arrivesAtMicros
        + workerResourcePolicy(gathering.resourceKind).quantumMicros,
    );
    const unrelatedBefore = Object.freeze({
      assignment: clone(fixture.tables.workerAssignmentV1.workerId.find(laterWorkerId)),
      worker: clone(fixture.tables.castleWorkerV1.workerId.find(laterWorkerId)),
      occupation: clone(fixture.tables.workerNodeOccupationV1.byWorker.find(laterWorkerId)),
      schedule: clone(fixture.tables.workerAssignmentScheduleV1.byWorker.find(laterWorkerId)),
      resource: clone(fixture.tables.resourceAccountV1.fid.find(fid)),
      activation: clone(fixture.tables.greaterRealmActivationV1.rows[0]),
      claim: clone(fixture.tables.greaterRealmCastleClaimV1.castleId.find(
        prepared.castle.castleId,
      )),
    });
    assert.equal(recoverProductionCanaryOrdinal(prepared, ordinal), 'recalled');
    assert.deepEqual({
      assignment: fixture.tables.workerAssignmentV1.workerId.find(laterWorkerId),
      worker: fixture.tables.castleWorkerV1.workerId.find(laterWorkerId),
      occupation: fixture.tables.workerNodeOccupationV1.byWorker.find(laterWorkerId),
      schedule: fixture.tables.workerAssignmentScheduleV1.byWorker.find(laterWorkerId),
      resource: fixture.tables.resourceAccountV1.fid.find(fid),
      activation: fixture.tables.greaterRealmActivationV1.rows[0],
      claim: fixture.tables.greaterRealmCastleClaimV1.castleId.find(
        prepared.castle.castleId,
      ),
    }, unrelatedBefore);
    const replayBefore = stateText(fixture);
    assert.equal(recoverProductionCanaryOrdinal(prepared, ordinal), 'replayed');
    assert.equal(stateText(fixture), replayBefore);
  }
});

test('production canary rejects coherent generic metadata route and timeline tampering without writes', () => {
  const exercise = (
    label: string,
    corrupt: (prepared: PreparedCanaryFixture, assignment: Row, receipt: Row) => void,
  ) => {
    const prepared = prepareProductionPlayerCanaryFixture();
    const { fixture, fid, baselineInput, registration, routePlan } = prepared;
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
    const dispatched = dispatchGenericCanaryRoute(
      prepared,
      1,
      `generic-coherent-tamper-${label}-0001`,
      registration.notAfterMicros,
    );
    const assignment = dispatched.assignment!;
    const receipt = fixture.tables.workerCommandIdempotencyV1.rows.find(row => (
      row.assignmentId === assignment.assignmentId
      && row.commandKind.startsWith('dispatch-v2:')
    ))!;
    corrupt(prepared, assignment, receipt);
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.match(
      errorCode(() => recoverProductionCanaryOrdinal(prepared, 0)) ?? '',
      /RECEIPT_INVALID|ASSIGNMENT_INVALID|REPLAY_INVALID/u,
      label,
    );
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    assert.match(errorCode(() => inspectProductionPlayerCanaryRecoveryStatusV1(
      fixture.ctx,
      { ...baselineInput },
    )) ?? '', /RECEIPT_INVALID|ASSIGNMENT_INVALID|REPLAY_INVALID/u, label);
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
    assert.equal(
      fixture.tables.castleWorkerV1.workerId.find(
        routePlan.routes[0]!.workerId,
      )!.status,
      'outbound',
    );
  };

  exercise('fingerprint', (_prepared, _assignment, receipt) => {
    const original = String(receipt.commandKind).split(':')[4]!;
    mutateDispatchV2ReceiptMetadata(
      receipt,
      'fingerprint',
      original === 'd'.repeat(64) ? 'e'.repeat(64) : 'd'.repeat(64),
    );
  });
  exercise('atlas', (_prepared, _assignment, receipt) => {
    const expected = BigInt(String(receipt.commandKind).split(':')[1]!);
    mutateDispatchV2ReceiptMetadata(
      receipt,
      'expectedRevision',
      (expected + 1n).toString(),
    );
  });
  exercise('capacity', (_prepared, _assignment, receipt) => {
    const original = String(receipt.commandKind).split(':')[3]!;
    mutateDispatchV2ReceiptMetadata(
      receipt,
      'capacityDigest',
      original === 'f'.repeat(64) ? '0'.repeat(64) : 'f'.repeat(64),
    );
  });
  exercise('route-timeline', ({ fixture }, assignment) => {
    const altered = planCastleWorkerTimeline(
      assignment.startedAtMicros,
      assignment.routeSteps + 1,
    );
    Object.assign(assignment, altered, {
      routeSteps: assignment.routeSteps + 1,
      settledThroughMicros: altered.arrivesAtMicros,
    });
    const worker = fixture.tables.castleWorkerV1.workerId.find(
      assignment.workerId,
    )!;
    Object.assign(worker, altered, { routeSteps: assignment.routeSteps });
    const occupation = fixture.tables.workerNodeOccupationV1.byWorker.find(
      assignment.workerId,
    )!;
    Object.assign(occupation, {
      startedAtMicros: altered.startedAtMicros,
      arrivesAtMicros: altered.arrivesAtMicros,
      gatheringEndsAtMicros: altered.gatheringEndsAtMicros,
    });
    const schedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      assignment.workerId,
    )!;
    schedule.scheduledAt = {
      tag: 'Time',
      value: timestamp(altered.arrivesAtMicros),
    };
  });
});

test('production canary normal pre-cutoff all-four recall materializes one quantum and remains evidence-eligible', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput } = prepared;
  completeNormalProductionCanaryEvidenceRun(prepared);
  const resource = fixture.tables.resourceAccountV1.fid.find(fid)!;
  const storedBaseline = fixture.tables.productionPlayerCanaryBaselineV1.fid.find(fid)!;
  assert.ok(resource.revision > storedBaseline.resourceRevision);
  const status = inspectProductionPlayerCanaryRecoveryStatusV1(fixture.ctx, {
    ...baselineInput,
  });
  assert.equal(status.terminalSafe, true);
  assert.equal(status.structuralEvidenceCandidate, true);
  assert.equal(status.disposition, 'terminal-evidence-candidate');
  const evidence = inspectProductionPlayerCanaryAdminEvidence(fixture.ctx, {
    ...baselineInput,
  });
  assert.equal(evidence.resourceQuantumCount, 4);
  assert.equal(evidence.dispatchReceiptCount, 4);
  assert.equal(evidence.recallReceiptCount, 4);
  for (const kind of ['food', 'wood', 'stone', 'gold'] as const) {
    assert.equal(
      evidence[`${kind}Delta`],
      workerResourcePolicy(kind).ratePerQuantum,
    );
  }
});

test('production canary admin evidence rejects future dispatch and recall receipts read-only', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, baselineInput, commands } = prepared;
  completeNormalProductionCanaryEvidenceRun(prepared);
  const dispatch = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.dispatchIdempotencyKey}`,
  )!;
  const recall = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${commands.commands[0]!.recallIdempotencyKey}`,
  )!;
  const originalDispatchAt = clone(dispatch.createdAt);
  const originalRecallAt = clone(recall.createdAt);
  const assertFutureRejected = (label: string) => {
    const before = stateText(fixture);
    const uuidBefore = fixture.uuidSequence;
    assert.equal(errorCode(() => inspectProductionPlayerCanaryAdminEvidence(
      fixture.ctx,
      { ...baselineInput },
    )), 'PRODUCTION_PLAYER_CANARY_JOURNEY_INVALID', label);
    assert.equal(stateText(fixture), before, label);
    assert.equal(fixture.uuidSequence, uuidBefore, label);
  };
  dispatch.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  assertFutureRejected('future dispatch');
  dispatch.createdAt = originalDispatchAt;
  recall.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  assertFutureRejected('future recall');
  recall.createdAt = originalRecallAt;
  dispatch.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  recall.createdAt = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 2n,
  );
  assertFutureRejected('coordinated future dispatch and recall');
});

test('production canary overdue schedule drains actual arrival expiry and return in exactly three transitions', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, registration, routePlan } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const dispatched = dispatchGenericCanaryRoute(
    prepared,
    1,
    'generic-overdue-three-stage-drain-0001',
    registration.notAfterMicros,
  );
  assert.ok(dispatched.assignment);
  const workerId = routePlan.routes[0]!.workerId;
  const initial = fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId)!;
  fixture.ctx.timestamp = timestamp(dispatched.assignment.returnsAtMicros);
  let transitions = 0;
  fixture.transaction(() => runBoundedDueCastleWorkerScheduleDrainV1(
    initial,
    fixture.ctx.timestamp.microsSinceUnixEpoch,
    schedule => {
      transitions += 1;
      runCastleWorkerSchedule(fixture.ctx, schedule);
    },
    assignmentId => fixture.tables.workerAssignmentScheduleV1.byAssignment
      .filter(assignmentId),
    schedule => schedule.scheduledAt.value.microsSinceUnixEpoch,
  ));
  assert.equal(transitions, 3);
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(workerId), null);
  assert.equal(
    fixture.tables.workerAssignmentScheduleV1.byWorker.find(workerId),
    null,
  );
  const worker = fixture.tables.castleWorkerV1.workerId.find(workerId)!;
  assert.equal(worker.status, 'idle');
  assert.equal(worker.revision, 4n);
  const before = stateText(fixture);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  assert.equal(stateText(fixture), before);
});

test('production canary f00 pins reserved and completed-generic receipts at the live 64-row prune boundary', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, castle, commands, registration, routePlan } = prepared;
  fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
  const completed = dispatchGenericCanaryRoute(
    prepared,
    1,
    'generic-completed-before-prune-0001',
    registration.notAfterMicros,
  );
  assert.ok(completed.assignment);
  completeWorkerAssignmentNaturally(fixture, routePlan.routes[0]!.workerId);

  const fillerWorker = fixture.tables.castleWorkerV1.workerId.find(
    routePlan.routes[3]!.workerId,
  )!;
  const lookalikeKey = `${fid.toString()}:xpc2-lookalike-0000`;
  fixture.tables.workerCommandIdempotencyV1.insert({
    requestKey: lookalikeKey,
    fid,
    workerId: fillerWorker.workerId,
    commandKind: 'recall',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId: undefined,
    resultRevision: fillerWorker.revision,
    createdAt: timestamp(fixture.ctx.timestamp.microsSinceUnixEpoch - 1n),
  });
  while (fixture.tables.workerCommandIdempotencyV1.rows.filter(
    row => row.fid === fid,
  ).length < 64) {
    const ordinal = fixture.tables.workerCommandIdempotencyV1.rows.filter(
      row => row.fid === fid,
    ).length;
    fixture.tables.workerCommandIdempotencyV1.insert({
      requestKey: `${fid.toString()}:historical-noop-${String(ordinal).padStart(4, '0')}`,
      fid,
      workerId: fillerWorker.workerId,
      commandKind: 'recall',
      resourceKind: undefined,
      siteId: undefined,
      assignmentId: undefined,
      resultRevision: fillerWorker.revision,
      createdAt: fixture.ctx.timestamp,
    });
  }
  const completedAssignmentId = completed.assignment.assignmentId;
  const protectedBefore = fixture.tables.workerCommandIdempotencyV1.rows
    .filter(row => (
      row.requestKey.startsWith(`${fid.toString()}:pc2-`)
      || row.assignmentId === completedAssignmentId
    ))
    .map(row => clone(row));
  assert.equal(
    protectedBefore.filter(row => row.requestKey.includes(
      commands.recoveryFenceIdempotencyKey,
    )).length,
    1,
  );
  const oldestHistoricalKey = fixture.tables.workerCommandIdempotencyV1.rows
    .filter(row => row.requestKey.includes(':historical-noop-'))
    .sort((left, right) => left.requestKey.localeCompare(right.requestKey))[0]!
    .requestKey;

  const second = dispatchGenericCanaryRoute(
    prepared,
    2,
    'generic-live-prune-dispatch-0002',
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  assert.equal(second.idempotent, false);
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(lookalikeKey),
    null,
  );
  assert.notEqual(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(oldestHistoricalKey),
    null,
  );
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.rows.filter(row => row.fid === fid).length,
    64,
  );
  for (const protectedRow of protectedBefore) {
    assert.deepEqual(
      fixture.tables.workerCommandIdempotencyV1.requestKey.find(
        protectedRow.requestKey,
      ),
      protectedRow,
    );
  }

  fixture.ctx.timestamp = timestamp(
    fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid,
    castle,
    workerId: routePlan.routes[1]!.workerId,
    idempotencyKey: 'generic-live-prune-recall-0002',
  }));
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.requestKey.find(oldestHistoricalKey),
    null,
  );
  assert.equal(
    fixture.tables.workerCommandIdempotencyV1.rows.filter(row => row.fid === fid).length,
    64,
  );
  for (const protectedRow of protectedBefore) {
    assert.deepEqual(
      fixture.tables.workerCommandIdempotencyV1.requestKey.find(
        protectedRow.requestKey,
      ),
      protectedRow,
    );
  }
  assert.ok(fixture.tables.workerCommandIdempotencyV1.rows.some(row => (
    row.assignmentId === second.assignment?.assignmentId
    && row.commandKind === 'recall'
  )));
});

test('production canary all-pinned 64-row cap rolls back real dispatch and recall transactions', () => {
  const dispatchPrepared = prepareProductionPlayerCanaryFixture();
  dispatchPrepared.fixture.ctx.timestamp = timestamp(
    dispatchPrepared.registration.notAfterMicros,
  );
  assert.equal(recoverProductionCanaryOrdinal(dispatchPrepared, 0), 'fenced');
  fillProductionCanaryReceiptsWithPinnedRows(dispatchPrepared);
  const dispatchBefore = stateText(dispatchPrepared.fixture);
  const dispatchUuidBefore = dispatchPrepared.fixture.uuidSequence;
  assert.equal(
    errorCode(() => dispatchGenericCanaryRoute(
      dispatchPrepared,
      1,
      'generic-all-pinned-dispatch-0001',
      dispatchPrepared.registration.notAfterMicros + 1n,
    )),
    'WORKER_IDEMPOTENCY_RESERVED_CAPACITY',
  );
  assert.equal(stateText(dispatchPrepared.fixture), dispatchBefore);
  assert.equal(dispatchPrepared.fixture.uuidSequence, dispatchUuidBefore);

  const recallPrepared = prepareProductionPlayerCanaryFixture();
  recallPrepared.fixture.ctx.timestamp = timestamp(
    recallPrepared.registration.notAfterMicros,
  );
  assert.equal(recoverProductionCanaryOrdinal(recallPrepared, 0), 'fenced');
  const active = dispatchGenericCanaryRoute(
    recallPrepared,
    1,
    'generic-all-pinned-live-0001',
    recallPrepared.registration.notAfterMicros + 1n,
  );
  assert.ok(active.assignment);
  fillProductionCanaryReceiptsWithPinnedRows(recallPrepared);
  recallPrepared.fixture.ctx.timestamp = timestamp(
    recallPrepared.fixture.ctx.timestamp.microsSinceUnixEpoch + 1n,
  );
  const recallBefore = stateText(recallPrepared.fixture);
  const recallUuidBefore = recallPrepared.fixture.uuidSequence;
  assert.equal(errorCode(() => recallPrepared.fixture.transaction(() => (
    recallCastleWorker(recallPrepared.fixture.ctx, {
      fid: recallPrepared.fid,
      castle: recallPrepared.castle,
      workerId: recallPrepared.routePlan.routes[0]!.workerId,
      idempotencyKey: 'generic-all-pinned-recall-0001',
    })
  ))), 'WORKER_IDEMPOTENCY_RESERVED_CAPACITY');
  assert.equal(stateText(recallPrepared.fixture), recallBefore);
  assert.equal(recallPrepared.fixture.uuidSequence, recallUuidBefore);
});

test('production canary ordinal-zero injected mid-sweep fault rolls back every row and retries deterministically', () => {
  const prepared = prepareProductionPlayerCanaryFixture();
  const { fixture, fid, castle, baselineInput, registration } = prepared;
  dispatchProductionCanaryOrdinal(prepared, 1);
  fixture.ctx.timestamp = timestamp(registration.approvedAtMicros + 2n);
  const before = stateText(fixture);
  const uuidBefore = fixture.uuidSequence;
  assert.throws(() => fixture.transaction(() => (
    recallProductionPlayerCanaryWorkerV1(fixture.ctx, {
      castle,
      ...baselineInput,
      ordinal: 0,
    })
  ), 5), /INJECTED_TRANSACTION_FAULT/u);
  assert.equal(stateText(fixture), before);
  assert.equal(fixture.uuidSequence, uuidBefore);
  assert.equal(recoverProductionCanaryOrdinal(prepared, 0), 'fenced');
});
