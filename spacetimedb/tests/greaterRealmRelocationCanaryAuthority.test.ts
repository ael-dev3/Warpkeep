import assert from 'node:assert/strict';
import test from 'node:test';
import { CASTLE_WORKER_TRAVEL_MICROS_PER_STEP, PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS } from '../src/castleWorkerPolicy';
import {
  encodeProductionPlayerCanaryRecoverySnapshotV2,
  parseProductionPlayerCanaryRecoverySnapshotV2,
} from '../src/productionPlayerCanaryRecoveryPolicy';
import { Fixture, type PreparedCanaryFixture, assertProductionPlayerCanaryGenericWorkerWriteAvailableV2, clone, completeWorkerAssignmentNaturally, dispatchGenericCanaryRoute, dispatchProductionCanaryOrdinal, dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1, errorCode, inspectProductionPlayerCanaryAdminEvidence, inspectProductionPlayerCanaryRecoveryStatusV1, mutateDispatchV2ReceiptMetadata, prepareProductionPlayerCanaryFixture, recallCastleWorker, recoverProductionCanaryOrdinal, registerProductionPlayerCanaryApprovalV1, replayProductionCanaryOrdinalAtCurrentTime, settleAllWorkerAssignmentsForFid, stateText, timestamp } from './greaterRealmRelocationTestSupport';



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
        { fid, ...prepared.baselineInput },
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

test('production canary dispatch and replay reject malformed full stored approval authority without writes', () => {
  const corruptions: readonly [string, (prepared: PreparedCanaryFixture) => void][] = [
    ['artifact', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.ownerApprovalArtifactDigest = '4'.repeat(64);
    }],
    ['owner', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.ownerApprovalCommitment = '5'.repeat(64);
    }],
    ['registration', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.approvalRegistrationCommitment = '6'.repeat(64);
    }],
    ['cross-index', prepared => {
      const table = prepared.fixture.tables
        .productionPlayerCanaryApprovalRegistrationV1;
      const row = table.fid.find(prepared.fid)!;
      table.rows.unshift({
        ...clone(row),
        challengeDigest: '7'.repeat(64),
        fid: prepared.fid + 99_999n,
      });
    }],
  ];
  for (const [label, corrupt] of corruptions) {
    const fresh = prepareProductionPlayerCanaryFixture();
    corrupt(fresh);
    const freshBefore = stateText(fresh.fixture);
    assert.equal(
      errorCode(() => dispatchProductionCanaryOrdinal(fresh, 1)),
      'STATE_INTEGRITY',
      `${label} NEW dispatch`,
    );
    assert.equal(stateText(fresh.fixture), freshBefore);

    const replay = prepareProductionPlayerCanaryFixture();
    dispatchProductionCanaryOrdinal(replay, 1);
    corrupt(replay);
    const replayBefore = stateText(replay.fixture);
    assert.equal(
      errorCode(() => replayProductionCanaryOrdinalAtCurrentTime(replay, 1)),
      'STATE_INTEGRITY',
      `${label} replay`,
    );
    assert.equal(stateText(replay.fixture), replayBefore);
  }
});

test('production canary containment survives rollout off while wrong tuples and pre-cutoff ordinals stay gated', () => {
  const wrongTuple = prepareProductionPlayerCanaryFixture();
  const wrongRoute = wrongTuple.routePlan.routes[1]!;
  const firstCommand = wrongTuple.commands.commands[0]!;
  const wrongBefore = stateText(wrongTuple.fixture);
  const wrongUuid = wrongTuple.fixture.uuidSequence;
  assert.match(errorCode(() => wrongTuple.fixture.transaction(() => (
    dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1(
      wrongTuple.fixture.ctx,
      {
        fid: wrongTuple.fid,
        castle: wrongTuple.castle,
        workerId: wrongRoute.workerId,
        resourceKind: wrongRoute.resourceKind,
        locationId: wrongRoute.locationId,
        expectedRevision: wrongRoute.atlasRevision,
        idempotencyKey: firstCommand.dispatchIdempotencyKey,
      },
    )
  ))) ?? '', /DISPATCH_TUPLE_INVALID/u);
  assert.equal(stateText(wrongTuple.fixture), wrongBefore);
  assert.equal(wrongTuple.fixture.uuidSequence, wrongUuid);

  const preCutoff = prepareProductionPlayerCanaryFixture();
  dispatchProductionCanaryOrdinal(preCutoff, 1);
  preCutoff.fixture.tables.realmWorkerSystemV1.rows[0]!.mode = 'staged';
  const preCutoffBefore = stateText(preCutoff.fixture);
  const preCutoffUuid = preCutoff.fixture.uuidSequence;
  assert.equal(
    errorCode(() => recoverProductionCanaryOrdinal(preCutoff, 1)),
    'WORKER_SYSTEM_NOT_READY',
  );
  assert.equal(stateText(preCutoff.fixture), preCutoffBefore);
  assert.equal(preCutoff.fixture.uuidSequence, preCutoffUuid);

  for (const ordinal of [0, 1]) {
    const postCutoff = prepareProductionPlayerCanaryFixture();
    const { fixture, registration, routePlan } = postCutoff;
    dispatchProductionCanaryOrdinal(postCutoff, 1);
    fixture.ctx.timestamp = timestamp(registration.notAfterMicros);
    fixture.tables.realmWorkerSystemV1.rows[0]!.mode = 'staged';
    assert.equal(
      recoverProductionCanaryOrdinal(postCutoff, ordinal),
      ordinal === 0 ? 'fenced' : 'recalled',
    );
    assert.equal(
      fixture.tables.castleWorkerV1.workerId.find(
        routePlan.routes[0]!.workerId,
      )!.status,
      'returning',
    );
  }
});

test('production canary first pc2 and every later target reprove pristine mutable state', () => {
  const templatePrepared = prepareProductionPlayerCanaryFixture();
  const templateDispatch = dispatchProductionCanaryOrdinal(templatePrepared, 1);
  const assignmentTemplate = clone(templateDispatch.assignment!);
  const occupationTemplate = clone(
    templatePrepared.fixture.tables.workerNodeOccupationV1.byWorker.find(
      templatePrepared.routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    templatePrepared.fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      templatePrepared.routePlan.routes[0]!.workerId,
    )!,
  );
  const corruptions: readonly [string, (prepared: PreparedCanaryFixture) => void][] = [
    ['worker-revision', prepared => {
      const worker = prepared.fixture.tables.castleWorkerV1.workerId.find(
        prepared.routePlan.routes[0]!.workerId,
      )!;
      worker.revision = 100n;
      worker.timelineRevision = 100;
    }],
    ['assignment', prepared => {
      prepared.fixture.tables.workerAssignmentV1.insert(clone(assignmentTemplate));
    }],
    ['occupation', prepared => {
      prepared.fixture.tables.workerNodeOccupationV1.insert(clone(occupationTemplate));
    }],
    ['schedule', prepared => {
      prepared.fixture.tables.workerAssignmentScheduleV1.insert({
        ...clone(scheduleTemplate),
        scheduleId: 0n,
      });
    }],
    ['resource', prepared => {
      const resource = prepared.fixture.tables.resourceAccountV1.fid.find(
        prepared.fid,
      )!;
      resource.food += 1n;
      resource.revision += 1n;
      resource.updatedAt = prepared.fixture.ctx.timestamp;
    }],
  ];
  for (const [label, corrupt] of corruptions) {
    const prepared = prepareProductionPlayerCanaryFixture();
    corrupt(prepared);
    const before = stateText(prepared.fixture);
    const uuidBefore = prepared.fixture.uuidSequence;
    assert.match(
      errorCode(() => dispatchProductionCanaryOrdinal(prepared, 1)) ?? '',
      /BASELINE_PRISTINE_REQUIRED|DISPATCH_TARGET_NOT_PRISTINE/u,
      label,
    );
    assert.equal(stateText(prepared.fixture), before, label);
    assert.equal(prepared.fixture.uuidSequence, uuidBefore, label);
  }

  const later = prepareProductionPlayerCanaryFixture();
  dispatchProductionCanaryOrdinal(later, 1);
  const target = later.fixture.tables.castleWorkerV1.workerId.find(
    later.routePlan.routes[1]!.workerId,
  )!;
  target.revision = 100n;
  target.timelineRevision = 100;
  const laterBefore = stateText(later.fixture);
  const laterUuid = later.fixture.uuidSequence;
  assert.equal(
    errorCode(() => dispatchProductionCanaryOrdinal(later, 2)),
    'PRODUCTION_PLAYER_CANARY_DISPATCH_TARGET_NOT_PRISTINE',
  );
  assert.equal(stateText(later.fixture), laterBefore);
  assert.equal(later.fixture.uuidSequence, laterUuid);

  const freshSweep = prepareProductionPlayerCanaryFixture();
  const sweepTarget = freshSweep.fixture.tables.castleWorkerV1.workerId.find(
    freshSweep.routePlan.routes[2]!.workerId,
  )!;
  sweepTarget.revision = 100n;
  sweepTarget.timelineRevision = 100;
  const sweepBefore = stateText(freshSweep.fixture);
  const sweepUuid = freshSweep.fixture.uuidSequence;
  assert.equal(
    errorCode(() => recoverProductionCanaryOrdinal(freshSweep, 0)),
    'PRODUCTION_PLAYER_CANARY_DISPATCH_TARGET_NOT_PRISTINE',
  );
  assert.equal(stateText(freshSweep.fixture), sweepBefore);
  assert.equal(freshSweep.fixture.uuidSequence, sweepUuid);
});

test('production canary NEW approval rejects receipt and graph races while exact replay ignores later mutable state', () => {
  const template = prepareProductionPlayerCanaryFixture();
  const dispatched = dispatchProductionCanaryOrdinal(template, 1);
  const assignmentTemplate = clone(dispatched.assignment!);
  const occupationTemplate = clone(
    template.fixture.tables.workerNodeOccupationV1.byWorker.find(
      template.routePlan.routes[0]!.workerId,
    )!,
  );
  const scheduleTemplate = clone(
    template.fixture.tables.workerAssignmentScheduleV1.byWorker.find(
      template.routePlan.routes[0]!.workerId,
    )!,
  );
  const races: readonly [string, (fixture: Fixture, fid: bigint) => void][] = [
    ['pc1 receipt', (fixture, fid) => {
      const resource = fixture.tables.resourceAccountV1.fid.find(fid)!;
      const worker = fixture.tables.castleWorkerV1.byOriginCastle.filter(
        resource.castleId,
      )[0]!;
      fixture.tables.workerCommandIdempotencyV1.insert({
        requestKey: `${fid.toString()}:pc1-approval-race-0001`,
        fid,
        workerId: worker.workerId,
        commandKind: 'recall',
        resourceKind: undefined,
        siteId: undefined,
        assignmentId: undefined,
        resultRevision: worker.revision,
        createdAt: fixture.ctx.timestamp,
      });
    }],
    ['ordinary receipt', (fixture, fid) => {
      const resource = fixture.tables.resourceAccountV1.fid.find(fid)!;
      const worker = fixture.tables.castleWorkerV1.byOriginCastle.filter(
        resource.castleId,
      )[0]!;
      fixture.tables.workerCommandIdempotencyV1.insert({
        requestKey: `${fid.toString()}:ordinary-approval-race-0001`,
        fid,
        workerId: worker.workerId,
        commandKind: 'recall',
        resourceKind: undefined,
        siteId: undefined,
        assignmentId: undefined,
        resultRevision: worker.revision,
        createdAt: fixture.ctx.timestamp,
      });
    }],
    ['assignment', fixture => {
      fixture.tables.workerAssignmentV1.insert(clone(assignmentTemplate));
    }],
    ['occupation', fixture => {
      fixture.tables.workerNodeOccupationV1.insert(clone(occupationTemplate));
    }],
    ['schedule', fixture => {
      fixture.tables.workerAssignmentScheduleV1.insert({
        ...clone(scheduleTemplate),
        scheduleId: 0n,
      });
    }],
  ];
  for (const [label, race] of races) {
    let racedFixture: Fixture | undefined;
    let racedBefore = '';
    let racedUuid = -1;
    assert.equal(errorCode(() => prepareProductionPlayerCanaryFixture(candidate => {
      racedFixture = candidate.fixture;
      race(candidate.fixture, candidate.fid);
      racedBefore = stateText(candidate.fixture);
      racedUuid = candidate.fixture.uuidSequence;
    })), 'PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED', label);
    assert.ok(racedFixture, label);
    assert.equal(stateText(racedFixture), racedBefore, label);
    assert.equal(racedFixture.uuidSequence, racedUuid, label);
    assert.equal(
      racedFixture.tables.productionPlayerCanaryApprovalRegistrationV1.count(),
      0n,
      label,
    );
  }

  const replay = prepareProductionPlayerCanaryFixture();
  replay.fixture.tables.castleWorkerV1.workerId.find(
    replay.routePlan.routes[0]!.workerId,
  )!.revision = 100n;
  const replayBefore = stateText(replay.fixture);
  const replayUuid = replay.fixture.uuidSequence;
  const replayStatus = replay.fixture.transaction(() => (
    registerProductionPlayerCanaryApprovalV1(
      replay.fixture.ctx,
      replay.registrationInput,
    )
  ));
  assert.equal(replayStatus.approvalRegistered, true);
  assert.equal(stateText(replay.fixture), replayBefore);
  assert.equal(replay.fixture.uuidSequence, replayUuid);
});

test('production canary all write recovery and status paths reject corrupt stored baseline or approval indexes', () => {
  const corruptions: readonly [string, (prepared: PreparedCanaryFixture) => void][] = [
    ['baseline-scalar', prepared => {
      prepared.fixture.tables.productionPlayerCanaryBaselineV1.fid
        .find(prepared.fid)!.resourceRevision = 1n;
    }],
    ['baseline-cross-index', prepared => {
      const table = prepared.fixture.tables.productionPlayerCanaryBaselineV1;
      const row = table.fid.find(prepared.fid)!;
      table.rows.unshift({
        ...clone(row),
        challengeDigest: '8'.repeat(64),
        fid: prepared.fid + 88_888n,
      });
    }],
    ['approval-artifact', prepared => {
      prepared.fixture.tables.productionPlayerCanaryApprovalRegistrationV1.fid
        .find(prepared.fid)!.ownerApprovalArtifactDigest = '9'.repeat(64);
    }],
    ['approval-cross-index', prepared => {
      const table = prepared.fixture.tables
        .productionPlayerCanaryApprovalRegistrationV1;
      const row = table.fid.find(prepared.fid)!;
      table.rows.unshift({
        ...clone(row),
        challengeDigest: 'a'.repeat(64),
        fid: prepared.fid + 77_777n,
      });
    }],
  ];
  for (const [label, corrupt] of corruptions) {
    const fresh = prepareProductionPlayerCanaryFixture();
    corrupt(fresh);
    const freshBefore = stateText(fresh.fixture);
    const freshUuid = fresh.fixture.uuidSequence;
    assert.equal(
      errorCode(() => dispatchProductionCanaryOrdinal(fresh, 1)),
      'STATE_INTEGRITY',
      `${label} NEW pc2`,
    );
    assert.equal(stateText(fresh.fixture), freshBefore);
    assert.equal(fresh.fixture.uuidSequence, freshUuid);

    const active = prepareProductionPlayerCanaryFixture();
    dispatchProductionCanaryOrdinal(active, 1);
    dispatchGenericCanaryRoute(
      active,
      2,
      `generic-before-${label}-corruption-0002`,
      active.registration.notAfterMicros,
    );
    corrupt(active);
    const before = stateText(active.fixture);
    const uuidBefore = active.fixture.uuidSequence;
    const assertIntegrity = (action: () => unknown, operation: string) => {
      assert.equal(errorCode(action), 'STATE_INTEGRITY', `${label} ${operation}`);
      assert.equal(stateText(active.fixture), before);
      assert.equal(active.fixture.uuidSequence, uuidBefore);
    };
    assertIntegrity(
      () => replayProductionCanaryOrdinalAtCurrentTime(active, 1),
      'pc2 replay',
    );
    assertIntegrity(
      () => dispatchGenericCanaryRoute(
        active,
        3,
        `generic-after-${label}-corruption-0003`,
        active.registration.notAfterMicros + 1n,
      ),
      'generic dispatch',
    );
    assertIntegrity(() => active.fixture.transaction(() => {
      assertProductionPlayerCanaryGenericWorkerWriteAvailableV2(
        active.fixture.ctx,
        { fid: active.fid, idempotencyKey: `recall-after-${label}-corruption` },
      );
      recallCastleWorker(active.fixture.ctx, {
        fid: active.fid,
        castle: active.castle,
        workerId: active.routePlan.routes[1]!.workerId,
        idempotencyKey: `recall-after-${label}-corruption`,
      });
    }), 'per-worker recall');
    assertIntegrity(() => active.fixture.transaction(() => {
      assertProductionPlayerCanaryGenericWorkerWriteAvailableV2(
        active.fixture.ctx,
        { fid: active.fid, idempotencyKey: `settle-after-${label}-corruption` },
      );
      settleAllWorkerAssignmentsForFid(active.fixture.ctx, active.fid);
    }), 'resource settlement');
    assertIntegrity(
      () => recoverProductionCanaryOrdinal(active, 0),
      'ordinal-zero recovery',
    );
    assertIntegrity(
      () => inspectProductionPlayerCanaryRecoveryStatusV1(active.fixture.ctx, {
        fid: active.fid,
        ...active.baselineInput,
      }),
      'admin status',
    );
    assertIntegrity(
      () => inspectProductionPlayerCanaryAdminEvidence(active.fixture.ctx, {
        fid: active.fid,
        ...active.baselineInput,
      }),
      'admin evidence',
    );
  }
});
