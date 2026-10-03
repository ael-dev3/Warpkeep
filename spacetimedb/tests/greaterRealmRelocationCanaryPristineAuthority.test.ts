import assert from 'node:assert/strict';
import test from 'node:test';
import { Fixture, type PreparedCanaryFixture, clone, dispatchProductionCanaryOrdinal, errorCode, prepareProductionPlayerCanaryFixture, recoverProductionCanaryOrdinal, registerProductionPlayerCanaryApprovalV1, stateText } from './greaterRealmRelocationTestSupport';

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
