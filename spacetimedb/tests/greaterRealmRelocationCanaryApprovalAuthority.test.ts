import assert from 'node:assert/strict';
import test from 'node:test';
import { type PreparedCanaryFixture, clone, dispatchProductionCanaryOrdinal, dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1, errorCode, prepareProductionPlayerCanaryFixture, recoverProductionCanaryOrdinal, replayProductionCanaryOrdinalAtCurrentTime, stateText, timestamp } from './greaterRealmRelocationTestSupport';

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
