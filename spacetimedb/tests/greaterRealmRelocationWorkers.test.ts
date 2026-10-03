import assert from 'node:assert/strict';
import test from 'node:test';
import { GREATER_REALM_PUBLIC_REGIONS } from '../src/greaterRealmV17Policy';
import { Fixture, type Row, advanceToActive, clone, dispatchGreaterRealmCastleWorkerV2, errorCode, greaterRealmDispatchInput, haltGreaterRealmActivationAuthorizedTransactionV1, opaqueSuffix, prepareGreaterRealmWorkerLocation, recallCastleWorker, recallCastleWorkerForExactCanaryAssignment, runCastleWorkerSchedule, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('active v17 Worker dispatch accepts an exporter-shaped second lexical location block', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const target = prepareGreaterRealmWorkerLocation(fixture, 'wood', 2, 1_001n, 1);
  const rows = fixture.tables.greaterRealmResourceNodeV1.locationId.filter(target.locationId)
    .sort((left: Row, right: Row) => left.releaseOrdinal - right.releaseOrdinal);
  assert.deepEqual(rows.map((row: Row) => row.nodeOrdinal), [1, 2]);
  assert.equal(rows[1]!.releaseOrdinal, rows[0]!.releaseOrdinal + 1);
  const preceding = fixture.tables.greaterRealmResourceNodeV1.releaseOrdinal.find(
    rows[0]!.releaseOrdinal - 1,
  )!;
  assert.equal(preceding.nodeOrdinal, 0);
  assert.ok(preceding.locationId.localeCompare(target.locationId) < 0);
  assert.notEqual(preceding.cellKey, rows[0]!.cellKey);

  const input = greaterRealmDispatchInput(
    fixture,
    1,
    'wood',
    target.locationId,
    'greater-worker-second-location-0001',
  );
  const result = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, input)
  ));
  assert.equal(result.idempotent, false);
  assert.equal(result.leaseId, `${target.locationId}:1`);
});

test('active v17 Worker dispatch allocates first-free public leases, replays exactly, and survives recall/return', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const target = prepareGreaterRealmWorkerLocation(fixture, 'food', 2);
  const activation = fixture.tables.greaterRealmActivationV1.rows[0]!;
  const workerRootBefore = clone(fixture.tables.realmWorkerSystemV2.rows[0]!);
  const foundingCount = activation.postCanaryFoundingCount;
  const allocationSequence = activation.nextAllocationSequence;
  const firstInput = greaterRealmDispatchInput(
    fixture,
    1,
    'food',
    target.locationId,
    'greater-worker-dispatch-0001',
  );
  const first = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, firstInput)
  ));
  assert.equal(first.idempotent, false);
  assert.equal(first.leaseId, `${target.locationId}:1`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 1);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryFoundingCount, foundingCount);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.nextAllocationSequence, allocationSequence);
  assert.deepEqual(fixture.tables.realmWorkerSystemV2.rows[0], workerRootBefore);
  assert.equal(fixture.tables.workerAssignmentV1.rows[0]!.siteId, first.leaseId);
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(firstInput.workerId)!.siteId, first.leaseId);
  assert.equal(fixture.tables.workerNodeOccupationV1.rows[0]!.siteId, first.leaseId);
  assert.match(fixture.tables.workerCommandIdempotencyV1.rows[0]!.commandKind, /^dispatch-v2:/);

  const beforeReplay = stateText(fixture);
  const replay = dispatchGreaterRealmCastleWorkerV2(fixture.ctx, firstInput);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.leaseId, first.leaseId);
  assert.equal(stateText(fixture), beforeReplay);

  const secondInput = greaterRealmDispatchInput(
    fixture,
    2,
    'food',
    target.locationId,
    'greater-worker-dispatch-0002',
  );
  const second = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, secondInput)
  ));
  assert.equal(second.leaseId, `${target.locationId}:2`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 2);

  const fullBefore = stateText(fixture);
  const thirdInput = greaterRealmDispatchInput(
    fixture,
    3,
    'food',
    target.locationId,
    'greater-worker-dispatch-0003',
  );
  assert.match(
    errorCode(() => fixture.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(fixture.ctx, thirdInput)
    ))) ?? '',
    /CAPACITY|EXHAUSTED/,
  );
  assert.equal(stateText(fixture), fullBefore);

  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid: firstInput.fid,
    castle: firstInput.castle,
    workerId: firstInput.workerId,
    idempotencyKey: 'greater-worker-recall-0001',
  }));
  assert.equal(
    fixture.tables.workerNodeOccupationV1.nodeKey.find(`food:${first.leaseId}`),
    null,
  );
  const returnSchedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    firstInput.workerId,
  )!;
  assert.equal(returnSchedule.stage, 'return-complete');
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, returnSchedule));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(firstInput.workerId)!.status, 'idle');
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(firstInput.workerId), null);

  const reused = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, thirdInput)
  ));
  assert.equal(reused.leaseId, `${target.locationId}:1`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 3);

  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  const haltedBeforeReplay = stateText(fixture);
  const terminalReplay = dispatchGreaterRealmCastleWorkerV2(fixture.ctx, firstInput);
  assert.equal(terminalReplay.idempotent, true);
  assert.equal(terminalReplay.leaseId, `${target.locationId}:1`);
  assert.equal(stateText(fixture), haltedBeforeReplay);
  const haltedFresh = greaterRealmDispatchInput(
    fixture,
    4,
    'food',
    target.locationId,
    'greater-worker-dispatch-0004',
  );
  assert.match(
    errorCode(() => fixture.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(fixture.ctx, haltedFresh)
    ))) ?? '',
    /NOT_ACTIVE|MODE|PHASE|CURRENT_WORLD_UNAVAILABLE/,
  );
  assert.equal(stateText(fixture), haltedBeforeReplay);

  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid: thirdInput.fid,
    castle: thirdInput.castle,
    workerId: thirdInput.workerId,
    idempotencyKey: 'greater-worker-recall-halted-0003',
  }));
  const haltedReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    thirdInput.workerId,
  )!;
  assert.equal(haltedReturn.stage, 'return-complete');
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, haltedReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(thirdInput.workerId)!.status, 'idle');
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(thirdInput.workerId), null);
});

test('conditional canary recall is exact-assignment atomic, replay-safe, and idle-no-op free', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const target = prepareGreaterRealmWorkerLocation(fixture, 'food', 2);
  const dispatch = greaterRealmDispatchInput(
    fixture,
    1,
    'food',
    target.locationId,
    'conditional-canary-dispatch-0001',
  );
  fixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(fixture.ctx, dispatch));
  const dispatchReceipt = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${dispatch.fid.toString()}:${dispatch.idempotencyKey}`,
  )!;
  const exact = {
    fid: dispatch.fid,
    castle: dispatch.castle,
    workerId: dispatch.workerId,
    recallIdempotencyKey: 'conditional-canary-recall-0001',
    expectedResourceKind: dispatchReceipt.resourceKind,
    expectedSiteId: dispatchReceipt.siteId,
    expectedAssignmentId: dispatchReceipt.assignmentId,
  };
  for (const hostile of [
    { ...exact, expectedAssignmentId: '00000000-0000-7000-8000-999999999999' },
    { ...exact, expectedResourceKind: 'wood' },
    { ...exact, expectedSiteId: `${target.locationId}:2` },
  ]) {
    const before = stateText(fixture);
    assert.equal(
      errorCode(() => fixture.transaction(() => (
        recallCastleWorkerForExactCanaryAssignment(fixture.ctx, hostile)
      ))),
      'WORKER_CANARY_ASSIGNMENT_MISMATCH',
    );
    assert.equal(stateText(fixture), before);
  }

  // Recovery is safety authority, not proof eligibility: an expired approval
  // timestamp cannot make the exact assignment unsafe to recall.
  fixture.ctx.timestamp = timestamp(9_999_999_999_999n);
  assert.equal(fixture.transaction(() => (
    recallCastleWorkerForExactCanaryAssignment(fixture.ctx, exact)
  )), 'recalled');
  const recallRequestKey = `${dispatch.fid.toString()}:${exact.recallIdempotencyKey}`;
  const recallReceipt = fixture.tables.workerCommandIdempotencyV1.requestKey.find(
    recallRequestKey,
  )!;
  assert.equal(recallReceipt.assignmentId, dispatchReceipt.assignmentId);
  assert.equal(recallReceipt.resourceKind, dispatchReceipt.resourceKind);
  assert.equal(recallReceipt.siteId, dispatchReceipt.siteId);
  const replayBefore = stateText(fixture);
  assert.equal(
    recallCastleWorkerForExactCanaryAssignment(fixture.ctx, exact),
    'replayed',
  );
  assert.equal(stateText(fixture), replayBefore);

  const returnSchedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    dispatch.workerId,
  )!;
  fixture.ctx.timestamp = timestamp(returnSchedule.scheduledAt.value.microsSinceUnixEpoch);
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, returnSchedule));
  assert.equal(fixture.tables.workerAssignmentV1.workerId.find(dispatch.workerId), null);

  const idleFixture = new Fixture();
  advanceToActive(idleFixture);
  const idleTarget = prepareGreaterRealmWorkerLocation(idleFixture, 'food', 2);
  const completed = greaterRealmDispatchInput(
    idleFixture,
    1,
    'food',
    idleTarget.locationId,
    'conditional-canary-natural-0001',
  );
  idleFixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(
    idleFixture.ctx,
    completed,
  ));
  const completedReceipt = idleFixture.tables.workerCommandIdempotencyV1.requestKey.find(
    `${completed.fid.toString()}:${completed.idempotencyKey}`,
  )!;
  for (let transition = 0; transition < 3; transition += 1) {
    const schedule = idleFixture.tables.workerAssignmentScheduleV1.byWorker.find(
      completed.workerId,
    )!;
    idleFixture.ctx.timestamp = timestamp(schedule.scheduledAt.value.microsSinceUnixEpoch);
    idleFixture.transaction(() => runCastleWorkerSchedule(idleFixture.ctx, schedule));
  }
  const idleRecallKey = 'conditional-canary-idle-recall-0001';
  const idleBefore = stateText(idleFixture);
  assert.equal(recallCastleWorkerForExactCanaryAssignment(idleFixture.ctx, {
    fid: completed.fid,
    castle: completed.castle,
    workerId: completed.workerId,
    recallIdempotencyKey: idleRecallKey,
    expectedResourceKind: completedReceipt.resourceKind,
    expectedSiteId: completedReceipt.siteId,
    expectedAssignmentId: completedReceipt.assignmentId,
  }), 'idle');
  assert.equal(stateText(idleFixture), idleBefore);
  assert.equal(
    idleFixture.tables.workerCommandIdempotencyV1.requestKey.find(
      `${completed.fid.toString()}:${idleRecallKey}`,
    ),
    null,
  );

  // A later same-route assignment (including the read->write race case) must
  // never be recalled with the earlier canary's expected assignment identity.
  const unrelated = greaterRealmDispatchInput(
    idleFixture,
    1,
    'food',
    idleTarget.locationId,
    'ordinary-later-same-route-0001',
  );
  idleFixture.transaction(() => dispatchGreaterRealmCastleWorkerV2(
    idleFixture.ctx,
    unrelated,
  ));
  const unrelatedBefore = stateText(idleFixture);
  assert.equal(
    errorCode(() => idleFixture.transaction(() => (
      recallCastleWorkerForExactCanaryAssignment(idleFixture.ctx, {
        fid: completed.fid,
        castle: completed.castle,
        workerId: completed.workerId,
        recallIdempotencyKey: 'conditional-canary-race-recall-0001',
        expectedResourceKind: completedReceipt.resourceKind,
        expectedSiteId: completedReceipt.siteId,
        expectedAssignmentId: completedReceipt.assignmentId,
      })
    ))),
    'WORKER_CANARY_ASSIGNMENT_MISMATCH',
  );
  assert.equal(stateText(idleFixture), unrelatedBefore);
});

test('active v17 Worker dispatch resolves every resource in all six immutable components', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  const resourceKinds = ['food', 'wood', 'stone', 'gold'] as const;
  let dispatches = 0;
  for (const region of GREATER_REALM_PUBLIC_REGIONS) {
    const slot = fixture.tables.greaterRealmCastleSlotV1.rows.find(row => (
      row.regionId === region.id && row.active
    ))!;
    const claim = fixture.tables.greaterRealmCastleClaimV1.rows.find(row => (
      row.slotId === slot.slotId
    ))!;
    const fid = claim.ownerFid as bigint;
    for (const resourceKind of resourceKinds) {
      const target = prepareGreaterRealmWorkerLocation(fixture, resourceKind, 1, fid);
      const input = greaterRealmDispatchInput(
        fixture,
        1,
        resourceKind,
        target.locationId,
        `greater-worker-${region.ordinal}-${resourceKind}-dispatch`,
        fid,
      );
      const result = fixture.transaction(() => (
        dispatchGreaterRealmCastleWorkerV2(fixture.ctx, input)
      ));
      assert.equal(result.leaseId, `${target.locationId}:1`);
      fixture.transaction(() => recallCastleWorker(fixture.ctx, {
        fid,
        castle: input.castle,
        workerId: input.workerId,
        idempotencyKey: `greater-worker-${region.ordinal}-${resourceKind}-recall`,
      }));
      const returnSchedule = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
        input.workerId,
      )!;
      fixture.ctx.timestamp = timestamp(returnSchedule.scheduledAt.value.microsSinceUnixEpoch);
      fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, returnSchedule));
      assert.equal(fixture.tables.castleWorkerV1.workerId.find(input.workerId)!.status, 'idle');
      dispatches += 1;
    }
  }
  assert.equal(dispatches, 24);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 24);
});

test('fresh v17 Worker dispatch rejects wrong public authority and rolls back atomically at the counter write', () => {
  const probe = new Fixture();
  advanceToActive(probe);
  const probeTarget = prepareGreaterRealmWorkerLocation(probe, 'gold', 1);
  const probeInput = greaterRealmDispatchInput(
    probe,
    1,
    'gold',
    probeTarget.locationId,
    'greater-worker-fault-0001',
  );
  probe.transaction(() => dispatchGreaterRealmCastleWorkerV2(probe.ctx, probeInput));
  const finalWrite = probe.mutationCount;
  assert.ok(finalWrite >= 6);

  const rollback = new Fixture();
  advanceToActive(rollback);
  const rollbackTarget = prepareGreaterRealmWorkerLocation(rollback, 'gold', 1);
  const rollbackInput = greaterRealmDispatchInput(
    rollback,
    1,
    'gold',
    rollbackTarget.locationId,
    'greater-worker-fault-0001',
  );
  const beforeFault = stateText(rollback);
  assert.equal(
    errorCode(() => rollback.transaction(
      () => dispatchGreaterRealmCastleWorkerV2(rollback.ctx, rollbackInput),
      finalWrite,
    )),
    'INJECTED_TRANSACTION_FAULT',
  );
  assert.equal(stateText(rollback), beforeFault);
  assert.equal(rollback.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 0);

  const invalidCases: readonly [string, (input: Row) => void][] = [
    ['revision', input => { input.expectedRevision += 1n; }],
    ['location', input => { input.locationId = `GRL-${opaqueSuffix(99_999)}`; }],
    ['resource', input => { input.resourceKind = 'stone'; }],
    ['castle', input => { input.castle = rollback.tables.castle.castleId.find(2n)!; }],
    ['fid', input => { input.fid = 1_002n; }],
  ];
  for (const [label, change] of invalidCases) {
    const input: { -readonly [Key in keyof typeof rollbackInput]: (typeof rollbackInput)[Key] } = clone(rollbackInput);
    input.idempotencyKey = `greater-worker-invalid-${label}-0001`;
    change(input);
    const before = stateText(rollback);
    assert.notEqual(
      errorCode(() => rollback.transaction(() => (
        dispatchGreaterRealmCastleWorkerV2(rollback.ctx, input as typeof rollbackInput)
      ))),
      undefined,
      label,
    );
    assert.equal(stateText(rollback), before, label);
  }

  const destination = rollback.tables.greaterRealmCellV1.cellKey.find(
    rollbackTarget.destinationCellKey,
  )!;
  const priorDepth = destination.routeDepth;
  destination.routeDepth = 4_097;
  assert.match(
    errorCode(() => rollback.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(rollback.ctx, rollbackInput)
    ))) ?? '',
    /ROUTE/,
  );
  destination.routeDepth = priorDepth;
  const node = rollback.tables.greaterRealmResourceNodeV1.locationId.filter(
    rollbackTarget.locationId,
  )[0]!;
  node.tier = 2;
  assert.match(
    errorCode(() => rollback.transaction(() => (
      dispatchGreaterRealmCastleWorkerV2(rollback.ctx, rollbackInput)
    ))) ?? '',
    /LOCATION|TIER/,
  );
});
