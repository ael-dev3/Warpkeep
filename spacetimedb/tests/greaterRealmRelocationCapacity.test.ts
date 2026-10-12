import assert from 'node:assert/strict';
import test from 'node:test';
import { Fixture, addOnePostCommitFounder, admissionProfileFor, advanceToActive, dispatchGreaterRealmCastleWorkerV2, enableCanonicalInnerKeep, ensureGenesisFounder, errorCode, greaterRealmDispatchInput, haltGreaterRealmActivationAuthorizedTransactionV1, insertIntendedAdmission, prepareGreaterRealmWorkerLocation, projectMyGreaterRealmWorkerStateV2, recallCastleWorker, runCastleWorkerSchedule, stateText, timestamp } from './greaterRealmRelocationTestSupport';



test('the 600th v17 castle succeeds, the 601st fails, and capacity never blocks replay', () => {
  const fixture = new Fixture();
  advanceToActive(fixture);
  for (let index = 0; index < 499; index += 1) {
    addOnePostCommitFounder(fixture, BigInt(20_000 + index));
  }
  enableCanonicalInnerKeep(fixture);
  fixture.ctx.timestamp = timestamp(50_000n);
  const fid600 = 30_600n;
  const admission600 = admissionProfileFor(fid600);
  assert.equal(fixture.transaction(() => {
    insertIntendedAdmission(fixture, fid600);
    return ensureGenesisFounder(fixture.ctx, fid600, admission600);
  }), 'created');
  assert.equal(fixture.tables.castle.count(), 600n);
  assert.equal(fixture.tables.castleWorkerV1.count(), 2_400n);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryFoundingCount, 500);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.nextAllocationSequence, 600n);
  assert.equal(fixture.tables.realmWorkerSystemV2.rows[0]!.currentCastleCount, 600);
  assert.equal(fixture.tables.realmWorkerSystemV2.rows[0]!.currentWorkerCount, 2_400);

  const control = projectMyGreaterRealmWorkerStateV2(fixture.ctx, fid600);
  assert.equal(control.resource.castleId, 600n);
  assert.equal(control.workers.length, 4);
  assert.ok(control.workers.every(worker => worker.status === 'idle'));
  const workerTarget = prepareGreaterRealmWorkerLocation(
    fixture,
    'wood',
    1,
    fid600,
  );
  const workerInput = greaterRealmDispatchInput(
    fixture,
    1,
    'wood',
    workerTarget.locationId,
    'greater-worker-capacity-0600',
    fid600,
  );
  const workerDispatch = fixture.transaction(() => (
    dispatchGreaterRealmCastleWorkerV2(fixture.ctx, workerInput)
  ));
  assert.equal(workerDispatch.leaseId, `${workerTarget.locationId}:1`);
  assert.equal(fixture.tables.greaterRealmActivationV1.rows[0]!.postCanaryDispatchCount, 1);
  fixture.transaction(() => recallCastleWorker(fixture.ctx, {
    fid: fid600,
    castle: workerInput.castle,
    workerId: workerInput.workerId,
    idempotencyKey: 'greater-worker-capacity-recall-0600',
  }));
  const capacityReturn = fixture.tables.workerAssignmentScheduleV1.byWorker.find(
    workerInput.workerId,
  )!;
  fixture.transaction(() => runCastleWorkerSchedule(fixture.ctx, capacityReturn));
  assert.equal(fixture.tables.castleWorkerV1.workerId.find(workerInput.workerId)!.status, 'idle');

  const replayBefore = stateText(fixture);
  assert.equal(ensureGenesisFounder(fixture.ctx, fid600, admission600), 'preserved');
  assert.equal(stateText(fixture), replayBefore);

  const fid601 = 30_601n;
  assert.equal(errorCode(() => fixture.transaction(() => {
    insertIntendedAdmission(fixture, fid601);
    ensureGenesisFounder(fixture.ctx, fid601, admissionProfileFor(fid601));
  })), 'GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED');
  assert.equal(stateText(fixture), replayBefore);

  assert.equal(haltGreaterRealmActivationAuthorizedTransactionV1(fixture.ctx), 'halted');
  const haltedReplay = stateText(fixture);
  assert.equal(ensureGenesisFounder(fixture.ctx, fid600, admission600), 'preserved');
  assert.equal(stateText(fixture), haltedReplay);
  assert.equal(errorCode(() => fixture.transaction(() => {
    insertIntendedAdmission(fixture, 30_602n);
    ensureGenesisFounder(fixture.ctx, 30_602n, admissionProfileFor(30_602n));
  })), 'GREATER_REALM_CURRENT_WORLD_UNAVAILABLE');
  assert.equal(stateText(fixture), haltedReplay);
});
