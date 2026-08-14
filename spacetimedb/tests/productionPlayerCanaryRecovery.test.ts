import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  assertProductionPlayerCanaryDispatchTupleV2,
  encodeProductionPlayerCanaryRecoverySnapshotV2,
  parseProductionPlayerCanaryRecoverySnapshotV2,
  planProductionPlayerCanaryRecoverySweepV2,
  planProductionPlayerCanaryContainmentReturnV2,
  productionPlayerCanaryDispatchCommandOrdinalV2,
  productionPlayerCanaryDispatchDispositionV2,
  productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2,
  productionPlayerCanaryRecoveryDisposition,
  productionPlayerCanaryRecoveryFenceReceiptMatchesV2,
  productionPlayerCanaryRecoverySnapshotMaximumRevisionV2,
  productionPlayerCanaryRecoverySnapshotTransitionIsValidV2,
  productionPlayerCanaryLaterDispatchPositionOrderIsValidV2,
  productionPlayerCanaryLaterLineageIsExactV2,
  productionPlayerCanaryLaterWorkerRevisionIsExactV2,
  productionPlayerCanaryOriginalWorkerRevisionIsExactV2,
  productionPlayerCanaryRecoveryPolicyErrorCode,
  productionPlayerCanaryStructuralEvidenceCandidate,
} from '../src/productionPlayerCanaryRecoveryPolicy';
import {
  productionPlayerCanaryGameplayWriteGateCodeV2,
} from '../src/productionPlayerCanaryApprovalPolicy';

function rejectsWithRecoveryCode(code: string) {
  return (error: unknown) => (
    productionPlayerCanaryRecoveryPolicyErrorCode(error) === code
  );
}

test('recovery disposition is exhaustive and gives active recall precedence', () => {
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: false,
    structuralEvidenceCandidate: false,
    recoveryTopologyCompleted: false,
    outboundWorkerCount: 1,
    gatheringWorkerCount: 0,
    returningWorkerCount: 3,
  }), 'recall-required');
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: false,
    structuralEvidenceCandidate: false,
    recoveryTopologyCompleted: false,
    outboundWorkerCount: 0,
    gatheringWorkerCount: 0,
    returningWorkerCount: 4,
  }), 'return-in-progress');
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: true,
    structuralEvidenceCandidate: true,
    recoveryTopologyCompleted: false,
    outboundWorkerCount: 0,
    gatheringWorkerCount: 0,
    returningWorkerCount: 0,
  }), 'terminal-evidence-candidate');
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: true,
    structuralEvidenceCandidate: false,
    recoveryTopologyCompleted: false,
    outboundWorkerCount: 0,
    gatheringWorkerCount: 0,
    returningWorkerCount: 0,
  }), 'terminal-evidence-impossible');
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: false,
    structuralEvidenceCandidate: false,
    recoveryTopologyCompleted: true,
    outboundWorkerCount: 2,
    gatheringWorkerCount: 1,
    returningWorkerCount: 1,
  }), 'terminal-evidence-impossible');
});

test('structural evidence candidacy ends strictly before the approval cutoff', () => {
  const candidate = (observedAtMicros: bigint) => (
    productionPlayerCanaryStructuralEvidenceCandidate({
      terminalSafe: true,
      observedAtMicros,
      notAfterMicros: 100n,
      dispatchReceiptCount: 4,
      correlatedRecallReceiptCount: 4,
      noOpRecallReceiptCount: 0,
      unexpectedReceiptCount: 0,
    })
  );
  assert.equal(candidate(99n), true);
  assert.equal(candidate(100n), false);
  assert.equal(candidate(101n), false);
});

test('central gameplay gate is half-open and permanently rejects stale v1 approval rows', () => {
  const v2 = Object.freeze({
    fid: 42n,
    commandKeyPolicyVersion: 'warpkeep-production-player-canary-command-key-v2',
    approvedAtMicros: 100n,
    notAfterMicros: 200n,
    registeredAt: Object.freeze({ microsSinceUnixEpoch: 100n }),
  });
  assert.equal(productionPlayerCanaryGameplayWriteGateCodeV2(v2, 42n, 99n), undefined);
  assert.equal(
    productionPlayerCanaryGameplayWriteGateCodeV2(v2, 42n, 100n),
    'PRODUCTION_PLAYER_CANARY_GENERIC_WORKER_WRITE_BLOCKED',
  );
  assert.equal(
    productionPlayerCanaryGameplayWriteGateCodeV2(v2, 42n, 199n),
    'PRODUCTION_PLAYER_CANARY_GENERIC_WORKER_WRITE_BLOCKED',
  );
  assert.equal(productionPlayerCanaryGameplayWriteGateCodeV2(v2, 42n, 200n), undefined);
  assert.equal(productionPlayerCanaryGameplayWriteGateCodeV2(v2, 42n, 201n), undefined);
  assert.equal(productionPlayerCanaryGameplayWriteGateCodeV2({
    ...v2,
    commandKeyPolicyVersion: 'warpkeep-production-player-canary-command-key-v1',
  }, 42n, 201n), 'STATE_INTEGRITY');
});

test('dispatch decision accepts only exact pc2 NEW authority and read-only expired replay', () => {
  const commands = Object.freeze([
    Object.freeze({ dispatchIdempotencyKey: `pc2-d01-${'a'.repeat(64)}` }),
    Object.freeze({ dispatchIdempotencyKey: `pc2-d02-${'b'.repeat(64)}` }),
  ]);
  assert.equal(
    productionPlayerCanaryDispatchCommandOrdinalV2(commands, 'ordinary-command-key'),
    null,
  );
  assert.throws(
    () => productionPlayerCanaryDispatchCommandOrdinalV2(
      commands,
      `pc1-d01-${'c'.repeat(64)}`,
    ),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_COMMAND_KEY_RESERVED'),
  );
  assert.throws(
    () => productionPlayerCanaryDispatchCommandOrdinalV2(
      commands,
      `pc2-d01-${'c'.repeat(64)}`,
    ),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_DISPATCH_TUPLE_INVALID'),
  );
  assert.equal(
    productionPlayerCanaryDispatchCommandOrdinalV2(
      commands,
      commands[0]!.dispatchIdempotencyKey,
    ),
    1,
  );

  const route = Object.freeze({
    ordinal: 1,
    workerId: 'worker-1',
    resourceKind: 'gold' as const,
    locationId: 'location-1',
    atlasRevision: 7n,
    routeSteps: 1,
    nodeCount: 1,
  });
  const tuple = Object.freeze({
    workerId: route.workerId,
    resourceKind: route.resourceKind,
    locationId: route.locationId,
    expectedRevision: route.atlasRevision,
  });
  assert.doesNotThrow(() => assertProductionPlayerCanaryDispatchTupleV2(
    route,
    1,
    tuple,
  ));
  assert.throws(
    () => assertProductionPlayerCanaryDispatchTupleV2(
      route,
      1,
      { ...tuple, workerId: 'worker-2' },
    ),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_DISPATCH_TUPLE_INVALID'),
  );

  const fresh = Object.freeze({
    observedAtMicros: 100n,
    approvedAtMicros: 100n,
    notAfterMicros: 1_000n,
    plannedReturnsAtMicros: 999n,
    existingDispatch: false,
    dispatchReceiptCount: 0,
    receiptCount: 0,
    fenced: false,
  });
  assert.equal(productionPlayerCanaryDispatchDispositionV2(fresh), 'new');
  assert.throws(
    () => productionPlayerCanaryDispatchDispositionV2({
      ...fresh,
      plannedReturnsAtMicros: fresh.notAfterMicros,
    }),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_DISPATCH_TIMELINE_CUTOFF'),
  );
  assert.throws(
    () => productionPlayerCanaryDispatchDispositionV2({
      ...fresh,
      observedAtMicros: fresh.notAfterMicros,
    }),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_DISPATCH_AUTHORITY_UNAVAILABLE'),
  );
  assert.equal(productionPlayerCanaryDispatchDispositionV2({
    ...fresh,
    observedAtMicros: fresh.notAfterMicros + 1n,
    plannedReturnsAtMicros: undefined,
    existingDispatch: true,
    dispatchReceiptCount: 1,
    receiptCount: 1,
  }), 'replay');
  assert.throws(
    () => productionPlayerCanaryDispatchDispositionV2({
      ...fresh,
      observedAtMicros: fresh.notAfterMicros + 1n,
      plannedReturnsAtMicros: undefined,
      existingDispatch: true,
      dispatchReceiptCount: 1,
      receiptCount: 2,
      fenced: true,
    }),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_DISPATCH_FENCED'),
  );
  assert.throws(
    () => productionPlayerCanaryDispatchDispositionV2({
      ...fresh,
      receiptCount: 1,
    }),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_BASELINE_RECEIPTS_NOT_PRISTINE'),
  );
});

test('ordinal-zero preflight plans atomic fence, all-four recall, and inert replay', () => {
  const idle = Object.freeze(Array.from({ length: 4 }, (_, index) => Object.freeze({
    ordinal: index + 1,
    rosterValid: true,
    dispatchPresent: false,
    positionFenced: false,
    laterUnrelatedAssignment: false,
    unrelatedAssignmentCanonical: false,
    recallPresent: false,
    assignmentPresent: false,
    workerIdle: true,
    assignmentExact: false,
    assignmentReturning: false,
  })));
  assert.deepEqual(planProductionPlayerCanaryRecoverySweepV2(idle, false), {
    insertFence: true,
    positionFenceOrdinals: [1, 2, 3, 4],
    recallOrdinals: [],
    mutationRecallOrdinals: [],
  });

  const active = idle.map(state => Object.freeze({
    ...state,
    dispatchPresent: true,
    assignmentPresent: true,
    workerIdle: false,
    assignmentExact: true,
  }));
  assert.deepEqual(planProductionPlayerCanaryRecoverySweepV2(active, false), {
    insertFence: true,
    positionFenceOrdinals: [],
    recallOrdinals: [1, 2, 3, 4],
    mutationRecallOrdinals: [1, 2, 3, 4],
  });

  const recovered = active.map(state => Object.freeze({
    ...state,
    recallPresent: true,
    assignmentReturning: true,
  }));
  const replay = planProductionPlayerCanaryRecoverySweepV2(recovered, true);
  let markerRows = 1;
  let assignmentMutations = 0;
  if (replay.insertFence) markerRows += 1;
  assignmentMutations += replay.mutationRecallOrdinals.length;
  assert.equal(markerRows, 1);
  assert.equal(assignmentMutations, 0);
  assert.throws(
    () => planProductionPlayerCanaryRecoverySweepV2(active, true),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_RECOVERY_REPLAY_INVALID'),
  );

  const emptyReplay = planProductionPlayerCanaryRecoverySweepV2(
    idle.map(state => Object.freeze({ ...state, positionFenced: true })),
    true,
  );
  assert.deepEqual(emptyReplay, {
    insertFence: false,
    positionFenceOrdinals: [],
    recallOrdinals: [],
    mutationRecallOrdinals: [],
  });

  const mixed = active.map((state, index) => index < 2
    ? state
    : idle[index]!);
  const mixedPlan = planProductionPlayerCanaryRecoverySweepV2(mixed, false);
  assert.deepEqual(mixedPlan.positionFenceOrdinals, [3, 4]);
  assert.deepEqual(mixedPlan.mutationRecallOrdinals, [1, 2]);
  assert.equal(1 + 4 + mixedPlan.mutationRecallOrdinals.length, 7);

  const oneMismatch = active.map((state, index) => index === 2
    ? Object.freeze({ ...state, assignmentExact: false })
    : state);
  const writes: string[] = [];
  assert.throws(
    () => {
      const plan = planProductionPlayerCanaryRecoverySweepV2(oneMismatch, false);
      if (plan.insertFence) writes.push('fence');
      writes.push(...plan.mutationRecallOrdinals.map(String));
    },
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID'),
  );
  assert.deepEqual(writes, []);

  const twoLater = idle.map((state, index) => index === 0
    ? Object.freeze({
      ...state,
      dispatchPresent: true,
      laterUnrelatedAssignment: true,
      unrelatedAssignmentCanonical: true,
      recallPresent: true,
      assignmentPresent: true,
      workerIdle: false,
    })
    : index === 1
      ? Object.freeze({
        ...state,
        laterUnrelatedAssignment: true,
        unrelatedAssignmentCanonical: true,
        assignmentPresent: true,
        workerIdle: false,
      })
      : state);
  const unrelatedBytes = JSON.stringify(twoLater.slice(0, 2));
  const laterPlan = planProductionPlayerCanaryRecoverySweepV2(twoLater, false);
  assert.deepEqual(laterPlan.positionFenceOrdinals, [2, 3, 4]);
  assert.deepEqual(laterPlan.mutationRecallOrdinals, []);
  assert.equal(JSON.stringify(twoLater.slice(0, 2)), unrelatedBytes);
  assert.throws(
    () => planProductionPlayerCanaryRecoverySweepV2(twoLater, true),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_RECOVERY_REPLAY_INVALID'),
  );
  const completedLater = twoLater.map((state, index) => index === 1
    ? Object.freeze({ ...state, positionFenced: true })
    : index >= 2
      ? Object.freeze({ ...state, positionFenced: true })
      : state);
  assert.deepEqual(
    planProductionPlayerCanaryRecoverySweepV2(completedLater, true),
    {
      insertFence: false,
      positionFenceOrdinals: [],
      recallOrdinals: [],
      mutationRecallOrdinals: [],
    },
  );
  assert.throws(
    () => planProductionPlayerCanaryRecoverySweepV2(
      completedLater.map((state, index) => index === 1
        ? Object.freeze({ ...state, unrelatedAssignmentCanonical: false })
        : state),
      true,
    ),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID'),
  );
});

test('dispatch-position and global fences are exact and never predate approval', () => {
  const approvedAtMicros = 100n;
  const observedAtMicros = 100n;
  const positionRequestKey = `42:pc2-d01-${'a'.repeat(64)}`;
  const globalRequestKey = `42:pc2-f00-${'b'.repeat(64)}`;
  const position = Object.freeze({
    requestKey: positionRequestKey,
    fid: 42n,
    commandKind: 'recall',
    workerId: 'worker-1',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId: undefined,
    resultRevision: 7n,
    createdAt: Object.freeze({ microsSinceUnixEpoch: approvedAtMicros }),
  });
  assert.equal(productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(
    position,
    {
      fid: 42n,
      requestKey: positionRequestKey,
      workerId: 'worker-1',
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
    },
  ), true);
  assert.equal(productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(
    { ...position, createdAt: { microsSinceUnixEpoch: approvedAtMicros - 1n } },
    {
      fid: 42n,
      requestKey: positionRequestKey,
      workerId: 'worker-1',
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
    },
  ), false);
  assert.equal(productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(
    { ...position, workerId: undefined },
    {
      fid: 42n,
      requestKey: positionRequestKey,
      workerId: 'worker-1',
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
    },
  ), false);
  assert.equal(productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(
    { ...position, workerId: 'worker-2' },
    {
      fid: 42n,
      requestKey: positionRequestKey,
      workerId: 'worker-1',
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
    },
  ), false);
  assert.equal(productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(
    { ...position, createdAt: { microsSinceUnixEpoch: observedAtMicros + 1n } },
    {
      fid: 42n,
      requestKey: positionRequestKey,
      workerId: 'worker-1',
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
    },
  ), false);
  assert.equal(productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(
    { ...position, resultRevision: 8n },
    {
      fid: 42n,
      requestKey: positionRequestKey,
      workerId: 'worker-1',
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
    },
  ), false);

  const snapshotPayload = encodeProductionPlayerCanaryRecoverySnapshotV2([
    { status: 'i', workerRevision: 7n, timelineRevision: 7 },
    { status: 'i', workerRevision: 3n, timelineRevision: 3 },
    { status: 'i', workerRevision: 0n, timelineRevision: 0 },
    { status: 'i', workerRevision: 1n, timelineRevision: 1 },
  ]);
  const global = Object.freeze({
    ...position,
    requestKey: globalRequestKey,
    commandKind: 'recall-all',
    workerId: undefined,
    assignmentId: snapshotPayload,
  });
  assert.equal(productionPlayerCanaryRecoveryFenceReceiptMatchesV2(
    global,
    {
      fid: 42n,
      requestKey: globalRequestKey,
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
      snapshotPayload,
    },
  ), true);
  assert.equal(productionPlayerCanaryRecoveryFenceReceiptMatchesV2(
    { ...global, createdAt: { microsSinceUnixEpoch: approvedAtMicros - 1n } },
    {
      fid: 42n,
      requestKey: globalRequestKey,
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
      snapshotPayload,
    },
  ), false);
  assert.equal(productionPlayerCanaryRecoveryFenceReceiptMatchesV2(
    { ...global, createdAt: { microsSinceUnixEpoch: observedAtMicros + 1n } },
    {
      fid: 42n,
      requestKey: globalRequestKey,
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
      snapshotPayload,
    },
  ), false);
  assert.equal(productionPlayerCanaryRecoveryFenceReceiptMatchesV2(
    { ...global, resultRevision: 8n },
    {
      fid: 42n,
      requestKey: globalRequestKey,
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision: 7n,
      snapshotPayload,
    },
  ), false);
});

test('f00 snapshot is canonical, bounded, and proves exact lifecycle deltas', () => {
  const assignmentId = '00000000-0000-7000-8000-000000000001';
  const routes = Object.freeze([
    Object.freeze({ status: 'i' as const, workerRevision: 0n, timelineRevision: 0 }),
    Object.freeze({
      status: 'o' as const,
      workerRevision: 1n,
      timelineRevision: 1,
      assignmentId,
    }),
    Object.freeze({
      status: 'g' as const,
      workerRevision: 2n,
      timelineRevision: 2,
      assignmentId: '00000000-0000-7000-8000-000000000002',
    }),
    Object.freeze({
      status: 'r' as const,
      workerRevision: 3n,
      timelineRevision: 3,
      assignmentId: '00000000-0000-7000-8000-000000000003',
    }),
  ]);
  const encoded = encodeProductionPlayerCanaryRecoverySnapshotV2(routes);
  assert.deepEqual(parseProductionPlayerCanaryRecoverySnapshotV2(encoded), routes);
  assert.equal(productionPlayerCanaryRecoverySnapshotMaximumRevisionV2(routes), 3n);
  assert.equal(productionPlayerCanaryRecoverySnapshotTransitionIsValidV2({
    snapshot: routes[1]!,
    currentStatus: 'i',
    currentAssignmentId: undefined,
    currentWorkerRevision: 4n,
    currentTimelineRevision: 4,
    snapshotAssignmentCompletedExplicitly: false,
    currentAssignmentReturnsExplicitly: false,
  }), true);
  assert.equal(productionPlayerCanaryRecoverySnapshotTransitionIsValidV2({
    snapshot: routes[1]!,
    currentStatus: 'i',
    currentAssignmentId: undefined,
    currentWorkerRevision: 3n,
    currentTimelineRevision: 3,
    snapshotAssignmentCompletedExplicitly: true,
    currentAssignmentReturnsExplicitly: false,
  }), true);
  assert.equal(productionPlayerCanaryRecoverySnapshotTransitionIsValidV2({
    snapshot: routes[1]!,
    currentStatus: 'g',
    currentAssignmentId: assignmentId,
    currentWorkerRevision: 2n,
    currentTimelineRevision: 2,
    snapshotAssignmentCompletedExplicitly: false,
    currentAssignmentReturnsExplicitly: false,
  }), true);
  assert.equal(productionPlayerCanaryRecoverySnapshotTransitionIsValidV2({
    snapshot: routes[1]!,
    currentStatus: 'g',
    currentAssignmentId: assignmentId,
    currentWorkerRevision: 2n,
    currentTimelineRevision: 3,
    snapshotAssignmentCompletedExplicitly: false,
    currentAssignmentReturnsExplicitly: false,
  }), false);
  for (const invalid of [
    encoded.replace('pc2-f00-s1|', 'pc2-f00-s0|'),
    encoded.replace('6:i|0|0|', '06:i|0|0|'),
    encoded.replace('00000000-0000-7000-8000-000000000001', 'NOT-A-UUID'),
    `${encoded}x`,
  ]) {
    assert.throws(
      () => parseProductionPlayerCanaryRecoverySnapshotV2(invalid),
      rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID'),
    );
  }
});

test('later generic dispatch revision is ordered on both sides of the fence', () => {
  const order = (genericCreatedAtMicros: bigint, genericResultRevision: bigint) => (
    productionPlayerCanaryLaterDispatchPositionOrderIsValidV2({
      genericCreatedAtMicros,
      genericResultRevision,
      positionCreatedAtMicros: 200n,
      positionResultRevision: 7n,
    })
  );
  assert.equal(order(199n, 7n), true);
  assert.equal(order(200n, 7n), true);
  assert.equal(order(199n, 8n), false);
  assert.equal(order(201n, 8n), true);
  assert.equal(order(201n, 7n), false);
});

test('worker revision lineage admits only exact lifecycle increments', () => {
  const active = (
    phase: string,
    workerRevision: bigint,
    recallResultRevision?: bigint,
  ) => productionPlayerCanaryLaterWorkerRevisionIsExactV2({
    phase,
    dispatchResultRevision: 1n,
    recallResultRevision,
    workerRevision,
    naturalExpiryReturn: recallResultRevision === undefined,
  });
  assert.equal(active('outbound', 1n), true);
  assert.equal(active('gathering', 2n), true);
  assert.equal(active('returning', 2n, 2n), true);
  assert.equal(active('returning', 3n, 3n), true);
  assert.equal(active('returning', 100n, 100n), false);
  assert.equal(active('outbound', 0n), false);
  assert.equal(productionPlayerCanaryOriginalWorkerRevisionIsExactV2({
    phase: 'idle',
    dispatchResultRevision: 1n,
    recallResultRevision: 2n,
    workerRevision: 3n,
    naturalExpiryReturn: false,
  }), true);
  assert.equal(productionPlayerCanaryOriginalWorkerRevisionIsExactV2({
    phase: 'idle',
    dispatchResultRevision: 1n,
    recallResultRevision: 99n,
    workerRevision: 100n,
    naturalExpiryReturn: false,
  }), false);
  assert.equal(productionPlayerCanaryLaterLineageIsExactV2({
    genericCreatedAtMicros: 100n,
    genericDispatchResultRevision: 1n,
    positionCreatedAtMicros: 100n,
    positionResultRevision: 1n,
    freshUnfencedPosition: false,
    genericWasPresentInSnapshot: true,
  }), true);
  assert.equal(productionPlayerCanaryLaterLineageIsExactV2({
    genericCreatedAtMicros: 100n,
    genericDispatchResultRevision: 99n,
    positionCreatedAtMicros: 100n,
    positionResultRevision: 99n,
    freshUnfencedPosition: false,
    genericWasPresentInSnapshot: true,
  }), false);
  assert.equal(productionPlayerCanaryLaterLineageIsExactV2({
    genericCreatedAtMicros: 100n,
    genericDispatchResultRevision: 5n,
    originalDispatchResultRevision: 1n,
    originalRecallResultRevision: 99n,
    freshUnfencedPosition: false,
  }), false);
});

test('containment return forfeits latent canary credit without touching unrelated state', () => {
  const startedAtMicros = 100n;
  const arrivesAtMicros = startedAtMicros + 30_000_000n;
  const gatheringEndsAtMicros = arrivesAtMicros + 119_999_999n;
  const unrelatedAssignment = Object.freeze({
    assignmentId: 'generic-later',
    settledThroughMicros: arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    updatedAtMicros: 123n,
  });
  const unrelatedWorker = Object.freeze({ revision: 9n, status: 'gathering' });
  const unrelatedOccupation = Object.freeze({ nodeKey: 'gold:later' });
  const unrelatedSchedule = Object.freeze({ scheduleId: 99n, stage: 'gathering-expiry' });
  const resourceAccount = Object.freeze({ food: 7n, revision: 4n, updatedAtMicros: 88n });
  const before = structuredClone({
    unrelatedAssignment,
    unrelatedWorker,
    unrelatedOccupation,
    unrelatedSchedule,
    resourceAccount,
  });
  const observedAtMicros = arrivesAtMicros + 70_000_000n;
  const plan = planProductionPlayerCanaryContainmentReturnV2({
    observedAtMicros,
    startedAtMicros,
    arrivesAtMicros,
    gatheringEndsAtMicros,
    settledThroughMicros: arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    routeSteps: 1,
    timelineRevision: 2,
    workerRevision: 5n,
  });
  assert.deepEqual(plan, {
    returnStartedAtMicros: observedAtMicros,
    returnsAtMicros: observedAtMicros + 30_000_000n,
    returnStartProgressBasisPoints: 10_000,
    settledThroughMicros: observedAtMicros,
    timelineRevision: 3,
    workerRevision: 6n,
  });
  assert.deepEqual({
    unrelatedAssignment,
    unrelatedWorker,
    unrelatedOccupation,
    unrelatedSchedule,
    resourceAccount,
  }, before);
  assert.throws(
    () => planProductionPlayerCanaryContainmentReturnV2({
      observedAtMicros,
      startedAtMicros,
      arrivesAtMicros,
      gatheringEndsAtMicros,
      settledThroughMicros: arrivesAtMicros,
      accruedAmount: 1n,
      materializedAmount: 0n,
      routeSteps: 1,
      timelineRevision: 2,
      workerRevision: 5n,
    }),
    rejectsWithRecoveryCode('PRODUCTION_PLAYER_CANARY_RECOVERY_CONTAINMENT_INVALID'),
  );
});

test('admin recovery status is exact, aggregate-only, admin-gated, and read-only', () => {
  const source = readFileSync(resolve(
    process.cwd(),
    'src/reducers/castleWorkers.ts',
  ), 'utf8');
  const start = source.indexOf(
    'export const adminGetProductionPlayerCanaryRecoveryStatusV1',
  );
  assert.notEqual(start, -1);
  const boundary = source.slice(start, source.indexOf('\n);', start) + 3);
  assert.match(boundary, /admin_get_production_player_canary_recovery_status_v1/u);
  assert.match(boundary, /ctx\.withTx/u);
  assert.match(boundary, /requireAdmin\(tx\)/u);
  assert.match(boundary, /inspectProductionPlayerCanaryRecoveryStatusV1/u);
  assert.doesNotMatch(boundary, /\.insert\(|\.update\(|\.delete\(|recallAll|recallWorker/u);

  const aggregate = readFileSync(resolve(
    process.cwd(),
    'src/productionPlayerCanaryRecovery.ts',
  ), 'utf8');
  for (const field of [
    'profile',
    'challengeDigest',
    'reviewedAdmissionPlanDigest',
    'serverBaselineCommitment',
    'routeSetCommitment',
    'commandSetCommitment',
    'approvalRegistrationCommitment',
    'notAfterMicros',
    'observedAtMicros',
    'dispatchReceiptCount',
    'correlatedRecallReceiptCount',
    'noOpRecallReceiptCount',
    'unexpectedReceiptCount',
    'idleWorkerCount',
    'outboundWorkerCount',
    'gatheringWorkerCount',
    'returningWorkerCount',
    'assignmentCount',
    'occupationCount',
    'scheduleCount',
    'terminalSafe',
    'structuralEvidenceCandidate',
    'disposition',
  ]) assert.match(aggregate, new RegExp(`\\b${field}\\b`, 'u'));
  const inspectStart = aggregate.indexOf(
    'export function inspectProductionPlayerCanaryRecoveryStatusV1',
  );
  const inspectEnd = aggregate.indexOf(
    '\nexport function productionPlayerCanaryRecoveryErrorCode',
    inspectStart,
  );
  const readOnlyInspect = aggregate.slice(inspectStart, inspectEnd);
  assert.doesNotMatch(
    readOnlyInspect,
    /recallAllCastleWorkers|recallCastleWorker|\.insert\(|\.update\(|\.delete\(/u,
  );
});

test('caller recovery accepts no browser lineage and validates exact v2 dispatch authority', () => {
  const reducers = readFileSync(resolve(
    process.cwd(),
    'src/reducers/castleWorkers.ts',
  ), 'utf8');
  const reducerStart = reducers.indexOf(
    'export const recallProductionPlayerCanaryWorkerV1',
  );
  const reducerEnd = reducers.indexOf('\n);', reducerStart) + 3;
  const reducer = reducers.slice(reducerStart, reducerEnd);
  assert.match(reducer, /recall_production_player_canary_worker_v1/u);
  assert.match(reducer, /requireAuthenticatedCastleOwnerActionV1\(ctx\)/u);
  assert.match(reducer, /recallProductionPlayerCanaryWorkerAuthorityV1/u);
  for (const field of [
    'reviewedAdmissionPlanDigest',
    'evidenceNonce',
    'ordinal',
  ]) assert.match(reducer, new RegExp(`\\b${field}\\b`, 'u'));
  assert.doesNotMatch(
    reducer,
    /fid:\s*t\.|workerId:\s*t\.|resourceKind:\s*t\.|siteId:\s*t\.|assignmentId:\s*t\.|idempotencyKey:\s*t\.|recallAll/u,
  );

  const recovery = readFileSync(resolve(
    process.cwd(),
    'src/productionPlayerCanaryRecovery.ts',
  ), 'utf8');
  const start = recovery.indexOf(
    'export function recallProductionPlayerCanaryWorkerV1',
  );
  const end = recovery.indexOf(
    '\n/** Admin-only, read-only aggregate',
    start,
  );
  const conditional = recovery.slice(start, end);
  assert.match(conditional, /validInput\(input\)/u);
  assert.match(conditional, /input\.ordinal < 0/u);
  assert.match(conditional, /input\.ordinal > CASTLE_WORKERS_PER_CASTLE/u);
  assert.match(conditional, /requireProductionPlayerCanaryBaselineRow/u);
  assert.match(conditional, /requireProductionPlayerCanaryApprovalRegistrationV1/u);
  assert.match(conditional, /productionPlayerCanaryCommandAuthorityV2/u);
  assert.match(conditional, /input\.ordinal === 0/u);
  assert.match(conditional, /assertExpectedCanaryReceiptsV2/u);
  assert.match(conditional, /recoveryFenceIdempotencyKey/u);
  assert.match(conditional, /commandKind: 'recall-all'/u);
  assert.match(conditional, /dispatch === null/u);
  assert.match(conditional, /dispatchReceiptMatches/u);
  assert.match(conditional, /recallCastleWorkerForExactCanaryAssignment/u);
  assert.match(conditional, /recallExactCanaryAssignmentForRecoveryV2/u);
  assert.match(
    conditional,
    /ctx\.timestamp\.microsSinceUnixEpoch < registration\.notAfterMicros/u,
  );
  assert.doesNotMatch(conditional, /recallAllCastleWorkers/u);
  const containmentStart = recovery.indexOf(
    'function recallExactCanaryAssignmentForRecoveryV2',
  );
  const containmentEnd = recovery.indexOf(
    '\nexport type ProductionPlayerCanaryDispatchClassificationV2',
    containmentStart,
  );
  const containment = recovery.slice(containmentStart, containmentEnd);
  assert.match(containment, /planProductionPlayerCanaryContainmentReturnV2/u);
  assert.doesNotMatch(
    containment,
    /settleAllWorkerAssignmentsForFid|resourceAccountV1|workerAssignmentV1\.byFid|workerSystemActive/u,
  );
  assert.ok(
    conditional.indexOf('ctx.timestamp.microsSinceUnixEpoch < registration.notAfterMicros')
      < conditional.indexOf('recallCastleWorkerForExactCanaryAssignment(ctx'),
  );
  assert.ok(
    conditional.indexOf('recallCastleWorkerForExactCanaryAssignment(ctx')
      < conditional.lastIndexOf('recallExactCanaryAssignmentForRecoveryV2(ctx'),
  );

  const binding = readFileSync(resolve(
    process.cwd(),
    '../src/spacetime/module_bindings/recall_production_player_canary_worker_v_1_reducer.ts',
  ), 'utf8');
  assert.match(binding, /reviewedAdmissionPlanDigest: __t\.string\(\)/u);
  assert.match(binding, /evidenceNonce: __t\.string\(\)/u);
  assert.match(binding, /ordinal: __t\.u32\(\)/u);
  assert.doesNotMatch(binding, /fid|workerId|assignmentId|idempotencyKey|admin/u);

  const browserRuntime = readFileSync(resolve(
    process.cwd(),
    '../src/owner-canary/ownerCanaryEvidenceRuntime.ts',
  ), 'utf8');
  assert.match(browserRuntime, /recallWarpkeepProductionPlayerCanaryWorker/u);
  assert.doesNotMatch(
    browserRuntime,
    /adminGetProductionPlayerCanaryRecoveryStatus|recallAllWarpkeep/u,
  );
});

test('exact classifier, half-open generic gate, clamp, and due drain are reviewable', () => {
  const recovery = readFileSync(resolve(
    process.cwd(),
    'src/productionPlayerCanaryRecovery.ts',
  ), 'utf8');
  const classifierStart = recovery.indexOf(
    'export function classifyProductionPlayerCanaryDispatchV2',
  );
  const classifierEnd = recovery.indexOf(
    '\n/**\n * Caller-authenticated',
    classifierStart,
  );
  const classifier = recovery.slice(classifierStart, classifierEnd);
  const recoveryPolicy = readFileSync(resolve(
    process.cwd(),
    'src/productionPlayerCanaryRecoveryPolicy.ts',
  ), 'utf8');
  assert.match(classifier, /RESERVED_COMMAND_V1_PREFIX/u);
  assert.match(classifier, /RESERVED_COMMAND_V2_PREFIX/u);
  assert.match(classifier, /existingDispatch === undefined/u);
  assert.match(classifier, /planProductionPlayerCanaryTimelineBeforeCutoff/u);
  assert.match(classifier, /productionPlayerCanaryDispatchDispositionV2/u);
  const dispositionStart = recoveryPolicy.indexOf(
    'export function productionPlayerCanaryDispatchDispositionV2',
  );
  const dispositionEnd = recoveryPolicy.indexOf(
    '\nexport type ProductionPlayerCanaryRecoverySweepOrdinalStateV2',
    dispositionStart,
  );
  const disposition = recoveryPolicy.slice(dispositionStart, dispositionEnd);
  assert.ok(disposition.indexOf('if (input.fenced)') >= 0);
  assert.ok(
    disposition.indexOf('if (input.fenced)')
      < disposition.indexOf('if (input.existingDispatch)'),
  );
  assert.ok(
    disposition.indexOf('if (input.existingDispatch)')
      < disposition.indexOf('input.observedAtMicros >= input.notAfterMicros'),
  );
  assert.match(disposition, /input\.dispatchReceiptCount === 0/u);
  assert.match(disposition, /input\.receiptCount !== 0/u);
  assert.match(recoveryPolicy, /route\.workerId !== input\.workerId/u);
  assert.match(recoveryPolicy, /route\.resourceKind !== input\.resourceKind/u);
  assert.match(recoveryPolicy, /route\.locationId !== input\.locationId/u);
  assert.match(recoveryPolicy, /route\.atlasRevision !== input\.expectedRevision/u);

  const auth = readFileSync(resolve(process.cwd(), 'src/auth.ts'), 'utf8');
  const authStart = auth.indexOf('export function requireGameplayPlayerV1');
  const authEnd = auth.indexOf(
    '\n/**\n * Read-only v17 gate',
    authStart,
  );
  const gameplayGate = auth.slice(authStart, authEnd);
  assert.equal(
    gameplayGate.match(/requireStoredProductionPlayerCanaryApprovalRegistrationV2/gu)
      ?.length,
    1,
  );
  assert.doesNotMatch(
    gameplayGate,
    /productionPlayerCanaryApprovalRegistrationV1\.fid\.find/u,
  );
  assert.match(gameplayGate, /productionPlayerCanaryGameplayWriteGateCodeV2/u);
  const genericGateStart = recovery.indexOf(
    'export function assertProductionPlayerCanaryGenericWorkerWriteAvailableV2',
  );
  const genericGateEnd = recovery.indexOf(
    '\n/**\n * Exact server-side dispatch classifier',
    genericGateStart,
  );
  const genericGate = recovery.slice(genericGateStart, genericGateEnd);
  assert.match(
    genericGate,
    /requireStoredProductionPlayerCanaryApprovalRegistrationV2/u,
  );
  assert.doesNotMatch(
    genericGate,
    /productionPlayerCanaryApprovalRegistrationV1\.fid\.find/u,
  );
  const evidence = readFileSync(resolve(
    process.cwd(),
    'src/productionPlayerCanaryEvidence.ts',
  ), 'utf8');
  const evidenceStart = evidence.indexOf(
    'export function inspectProductionPlayerCanaryAdminEvidence',
  );
  const evidenceEnd = evidence.indexOf(
    '\nexport function productionPlayerCanaryEvidenceErrorCode',
    evidenceStart,
  );
  const evidenceAuthority = evidence.slice(evidenceStart, evidenceEnd);
  assert.ok(
    evidenceAuthority.indexOf('requireStoredProductionPlayerCanaryBaselineV2')
      < evidenceAuthority.indexOf('requireProductionPlayerCanaryBaselineRow'),
  );
  assert.ok(
    evidenceAuthority.indexOf(
      'requireStoredProductionPlayerCanaryApprovalRegistrationV2',
    ) < evidenceAuthority.indexOf(
      'requireProductionPlayerCanaryApprovalRegistrationV1',
    ),
  );
  const approvalPolicy = readFileSync(resolve(
    process.cwd(),
    'src/productionPlayerCanaryApprovalPolicy.ts',
  ), 'utf8');
  const gateStart = approvalPolicy.indexOf(
    'export function productionPlayerCanaryGameplayWriteGateCodeV2',
  );
  const gateEnd = approvalPolicy.indexOf('\nfunction framed', gateStart);
  const gate = approvalPolicy.slice(gateStart, gateEnd);
  assert.match(gate, /observedAtMicros < registration\.notAfterMicros/u);
  assert.match(gate, /observedAtMicros >= registration\.approvedAtMicros/u);
  assert.doesNotMatch(gate, /observedAtMicros <= registration\.notAfterMicros/u);
  assert.match(gate, /PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION/u);
  assert.match(gate, /PRODUCTION_PLAYER_CANARY_GENERIC_WORKER_WRITE_BLOCKED/u);
  const readStart = auth.indexOf('export function requireGameplayReadPlayerV1');
  const readEnd = auth.indexOf(
    '\n/** Exact caller-scoped v17 map authority',
    readStart,
  );
  const readGate = auth.slice(readStart, readEnd);
  assert.match(readGate, /return requireGameplayPlayerGraphV1\(ctx\)/u);
  assert.doesNotMatch(readGate, /return requireGameplayPlayerV1\(ctx\)/u);

  const reducers = readFileSync(resolve(
    process.cwd(),
    'src/reducers/castleWorkers.ts',
  ), 'utf8');
  const reducerStart = reducers.indexOf(
    'export const dispatchGreaterRealmWorkerV1',
  );
  const reducerEnd = reducers.indexOf(
    '\nexport const recallWorkerV1',
    reducerStart,
  );
  assert.ok(reducerStart >= 0 && reducerEnd > reducerStart);
  const reducer = reducers.slice(reducerStart, reducerEnd);
  assert.match(
    reducer,
    /dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1\(\s*ctx,\s*dispatchInput/u,
  );
  assert.doesNotMatch(reducer, /dispatchGreaterRealmCastleWorkerV2/u);

  const wrapperStart = recovery.indexOf(
    'export function dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1',
  );
  const wrapperEnd = recovery.indexOf(
    '\n/**\n * Caller-authenticated, atomic conditional recall.',
    wrapperStart,
  );
  assert.ok(wrapperStart >= 0 && wrapperEnd > wrapperStart);
  const wrapper = recovery.slice(wrapperStart, wrapperEnd);
  assert.match(wrapper, /classifyProductionPlayerCanaryDispatchV2/u);
  assert.match(wrapper, /clampClassifiedProductionPlayerCanaryAssignmentV2/u);
  assert.match(wrapper, /result\.idempotent/u);
  assert.match(
    wrapper,
    /productionPlayerCanaryReplayTimelineIsValid/u,
  );
  assert.match(wrapper, /PRODUCTION_PLAYER_CANARY_TIMELINE_REPLAY_INVALID/u);
  assert.match(
    wrapper,
    /routeSteps: result\.assignment\.routeSteps/u,
  );
  assert.match(
    wrapper,
    /approvedRouteSteps: classifiedRoute\.routeSteps/u,
  );
  assert.match(
    wrapper,
    /notAfterMicros: classification\.authority\.registration\.notAfterMicros/u,
  );
  const classifiedAt = wrapper.indexOf(
    'classifyProductionPlayerCanaryDispatchV2',
  );
  const dispatchedAt = wrapper.indexOf(
    'dispatchGreaterRealmCastleWorkerV2(ctx, input)',
    classifiedAt,
  );
  const replayAt = wrapper.indexOf(
    'productionPlayerCanaryReplayTimelineIsValid',
    dispatchedAt,
  );
  const clampAt = wrapper.indexOf(
    'clampClassifiedProductionPlayerCanaryAssignmentV2',
    replayAt,
  );
  assert.ok(
    classifiedAt >= 0
      && dispatchedAt > classifiedAt
      && replayAt > dispatchedAt
      && clampAt > replayAt,
  );

  const sweepStart = recovery.indexOf('if (input.ordinal === 0)');
  const positionInsert = recovery.indexOf(
    'ctx.db.workerCommandIdempotencyV1.insert',
    sweepStart,
  );
  const recallSweep = recovery.indexOf(
    'recallExactCanaryAssignmentForRecoveryV2(ctx',
    positionInsert,
  );
  const completedMarker = recovery.indexOf("commandKind: 'recall-all'", recallSweep);
  assert.ok(sweepStart >= 0 && positionInsert > sweepStart);
  assert.ok(recallSweep > positionInsert && completedMarker > recallSweep);
  assert.match(disposition, /if \(input\.fenced\)/u);
  assert.match(
    recovery,
    /laterState\.consumedRequestKeys\.size \+ ordinaryOriginalRecallKeys\.size\s+!== genericReceipts\.length/u,
  );
  assert.match(
    recovery,
    /dispatchSlot\.resultRevision > fence\.resultRevision/u,
  );
  assert.match(recovery, /assignment\.routeSteps === route\.routeSteps/u);
  assert.match(recovery, /immutablePlannedReturnMicros < authority/u);
  assert.match(recovery, /strictReceiptTopologyValid/u);

  const schema = readFileSync(resolve(process.cwd(), 'src/schema.ts'), 'utf8');
  const drainStart = schema.indexOf('function runCastleWorkerScheduleWithDueDrain');
  const drainEnd = schema.indexOf(
    '\n/** Scheduler-only lifecycle reducer',
    drainStart,
  );
  const drain = schema.slice(drainStart, drainEnd);
  assert.match(drain, /runBoundedDueCastleWorkerScheduleDrainV1/u);
  assert.match(drain, /runCastleWorkerSchedule\(ctx, current\)/u);
  const policy = readFileSync(resolve(
    process.cwd(),
    'src/castleWorkerPolicy.ts',
  ), 'utf8');
  const policyDrainStart = policy.indexOf(
    'export function runBoundedDueCastleWorkerScheduleDrainV1',
  );
  const policyDrainEnd = policy.indexOf('\nexport type CastleWorkerAccrualState', policyDrainStart);
  const policyDrain = policy.slice(policyDrainStart, policyDrainEnd);
  assert.match(policy, /export function productionPlayerCanaryReplayTimelineIsValid/u);
  assert.match(
    policy,
    /input\.routeSteps !== input\.approvedRouteSteps/u,
  );
  assert.match(
    policy,
    /PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS/u,
  );
  assert.match(policyDrain, /transition < 3/u);
  assert.match(policyDrain, /initial\.assignmentId/u);
  assert.match(policyDrain, /scheduledAt <= observedAtMicros/u);
});

test('ordinary dispatch and conditional canary recall retain their distinct lifecycle gates', () => {
  const source = readFileSync(resolve(
    process.cwd(),
    'src/castleWorkerAuthority.ts',
  ), 'utf8');
  const dispatchStart = source.indexOf(
    'export function dispatchGreaterRealmCastleWorkerV2',
  );
  const dispatchEnd = source.indexOf(
    '\nexport function runCastleWorkerSchedule',
    dispatchStart,
  );
  const conditionalRecallStart = source.indexOf(
    'export function recallCastleWorkerForExactCanaryAssignment',
  );
  const conditionalRecallEnd = source.indexOf(
    '\nexport function recallAllCastleWorkers',
    conditionalRecallStart,
  );
  assert.ok(dispatchStart >= 0 && dispatchEnd > dispatchStart);
  assert.ok(
    conditionalRecallStart > dispatchEnd
      && conditionalRecallEnd > conditionalRecallStart,
  );

  const dispatch = source.slice(dispatchStart, dispatchEnd);
  assert.match(dispatch, /greaterRealmWorkerSystemActiveV1\(ctx\)/u);
  assert.doesNotMatch(dispatch, /workerSystemActiveForCurrentGameplayV1\(ctx\)/u);

  const conditionalRecall = source.slice(
    conditionalRecallStart,
    conditionalRecallEnd,
  );
  assert.match(
    conditionalRecall,
    /workerSystemActiveForCurrentGameplayV1\(ctx\)/u,
  );
  assert.doesNotMatch(
    conditionalRecall,
    /greaterRealmWorkerSystemActiveV1\(ctx\)/u,
  );
});
