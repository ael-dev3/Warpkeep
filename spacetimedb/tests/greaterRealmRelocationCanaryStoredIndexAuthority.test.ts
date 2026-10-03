import assert from 'node:assert/strict';
import test from 'node:test';
import { type PreparedCanaryFixture, assertProductionPlayerCanaryGenericWorkerWriteAvailableV2, clone, dispatchGenericCanaryRoute, dispatchProductionCanaryOrdinal, errorCode, inspectProductionPlayerCanaryAdminEvidence, inspectProductionPlayerCanaryRecoveryStatusV1, prepareProductionPlayerCanaryFixture, recallCastleWorker, recoverProductionCanaryOrdinal, replayProductionCanaryOrdinalAtCurrentTime, settleAllWorkerAssignmentsForFid, stateText } from './greaterRealmRelocationTestSupport';

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
        ...active.baselineInput,
      }),
      'admin status',
    );
    assertIntegrity(
      () => inspectProductionPlayerCanaryAdminEvidence(active.fixture.ctx, {
        ...active.baselineInput,
      }),
      'admin evidence',
    );
  }
});
