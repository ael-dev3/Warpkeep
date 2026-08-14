import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS,
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
  CastleWorkerPolicyError,
  clampProductionPlayerCanaryTimeline,
  planCastleWorkerAccrual,
  planCastleWorkerTimeline,
  planProductionPlayerCanaryTimelineBeforeCutoff,
  planWorkerIdempotencyReceiptPruneV1,
  productionPlayerCanaryReplayTimelineIsValid,
  rosterDigestForCastleIds,
  runBoundedDueCastleWorkerScheduleDrainV1,
  workerAssignmentStateIsConsistent,
  workerIdForCastle,
  workerResourceKinds,
  workerResourcePolicy,
} from '../src/castleWorkerPolicy';

test('generic worker roster IDs are stable and exactly four per castle', () => {
  assert.equal(CASTLE_WORKERS_PER_CASTLE, 4);
  assert.deepEqual(
    Array.from({ length: CASTLE_WORKERS_PER_CASTLE }, (_, index) => workerIdForCastle(42n, index + 1)),
    [
      'genesis-001-castle-42-worker-01',
      'genesis-001-castle-42-worker-02',
      'genesis-001-castle-42-worker-03',
      'genesis-001-castle-42-worker-04',
    ],
  );
  assert.notEqual(rosterDigestForCastleIds([42n, 7n]), rosterDigestForCastleIds([42n]));
  assert.equal(rosterDigestForCastleIds([42n, 7n]), rosterDigestForCastleIds([7n, 42n]));
});

test('all four resource policies use the shared 60-second quantum and 30-day cap', () => {
  assert.deepEqual(workerResourceKinds(), ['gold', 'food', 'wood', 'stone']);
  for (const kind of workerResourceKinds()) {
    const policy = workerResourcePolicy(kind);
    assert.equal(policy.quantumMicros, 60_000_000n);
    assert.equal(policy.gatheringDurationMicros, CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS);
    assert.equal(policy.gatheringTotal, 43_200n * policy.ratePerQuantum);
  }
});

test('timeline and accrual are server-time-only and quantum aligned', () => {
  const timeline = planCastleWorkerTimeline(1_000_000n, 3);
  assert.equal(timeline.arrivesAtMicros, 91_000_000n);
  assert.equal(timeline.gatheringEndsAtMicros, 2_592_091_000_000n);
  assert.equal(timeline.returnsAtMicros, 2_592_181_000_000n);
  const policy = workerResourcePolicy('stone');
  const state = {
    phase: 'gathering',
    ...timeline,
    returnStartedAtMicros: undefined,
    routeSteps: 3,
    returnStartProgressBasisPoints: 0,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    resourceKind: 'stone',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
  } as const;
  const plan = planCastleWorkerAccrual(state, timeline.arrivesAtMicros + 2n * policy.quantumMicros + 1n);
  assert.equal(plan.completedQuanta, 2n);
  assert.equal(plan.newlyAccruedAmount, 2n * policy.ratePerQuantum);
  assert.equal(plan.settledThroughMicros, timeline.arrivesAtMicros + 2n * policy.quantumMicros);
});

test('reload-safe canary duration is exact and can accrue only one quantum', () => {
  const standard = planCastleWorkerTimeline(1_000_000n, 3);
  const timeline = clampProductionPlayerCanaryTimeline(standard);
  const policy = workerResourcePolicy('stone');
  assert.equal(
    timeline.gatheringEndsAtMicros - timeline.arrivesAtMicros,
    PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
  );
  assert.equal(
    timeline.returnsAtMicros - timeline.gatheringEndsAtMicros,
    timeline.arrivesAtMicros - timeline.startedAtMicros,
  );
  const state = {
    phase: 'gathering',
    ...timeline,
    returnStartedAtMicros: undefined,
    routeSteps: 3,
    returnStartProgressBasisPoints: 0,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    resourceKind: 'stone',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
  } as const;
  assert.equal(workerAssignmentStateIsConsistent(state), true);
  assert.deepEqual(planCastleWorkerAccrual(state, timeline.gatheringEndsAtMicros), {
    accruedAmount: policy.ratePerQuantum,
    newlyAccruedAmount: policy.ratePerQuantum,
    completedQuanta: 1n,
    settledThroughMicros: timeline.arrivesAtMicros + policy.quantumMicros,
  });
  assert.equal(workerAssignmentStateIsConsistent({
    ...state,
    gatheringEndsAtMicros: timeline.arrivesAtMicros + 120_000_000n,
    returnsAtMicros: timeline.returnsAtMicros + 1n,
  }), false);
  assert.equal(workerAssignmentStateIsConsistent({
    ...state,
    accruedAmount: policy.ratePerQuantum + 1n,
  }), false);
});

test('canary dispatch requires its complete return strictly before cutoff', () => {
  const timeline = clampProductionPlayerCanaryTimeline(
    planCastleWorkerTimeline(1_000_000n, 3),
  );
  assert.equal(timeline.returnsAtMicros, 300_999_999n);
  assert.throws(
    () => planProductionPlayerCanaryTimelineBeforeCutoff(
      1_000_000n,
      3,
      timeline.returnsAtMicros,
    ),
    (error: unknown) => error instanceof CastleWorkerPolicyError
      && error.code === 'PRODUCTION_PLAYER_CANARY_TIMELINE_CUTOFF_INVALID',
  );
  assert.deepEqual(
    planProductionPlayerCanaryTimelineBeforeCutoff(
      1_000_000n,
      3,
      timeline.returnsAtMicros + 1n,
    ),
    timeline,
  );
});

test('canary replay binds the approved route and immutable return while allowing a recalled return cursor', () => {
  const approvedRouteSteps = 3;
  const timeline = clampProductionPlayerCanaryTimeline(
    planCastleWorkerTimeline(1_000_000n, approvedRouteSteps),
  );
  const immutable = {
    startedAtMicros: timeline.startedAtMicros,
    arrivesAtMicros: timeline.arrivesAtMicros,
    gatheringEndsAtMicros: timeline.gatheringEndsAtMicros,
    routeSteps: approvedRouteSteps,
    approvedRouteSteps,
    notAfterMicros: timeline.returnsAtMicros + 1n,
  } as const;

  // An explicit recall may replace the assignment's current returnsAt cursor;
  // replay authority is instead bound to the immutable planned full return.
  const recalledReturnsAtMicros = timeline.gatheringEndsAtMicros - 1n;
  assert.notEqual(recalledReturnsAtMicros, timeline.returnsAtMicros);
  assert.equal(productionPlayerCanaryReplayTimelineIsValid(immutable), true);
  assert.equal(productionPlayerCanaryReplayTimelineIsValid({
    ...immutable,
    routeSteps: approvedRouteSteps + 1,
  }), false);
  assert.equal(productionPlayerCanaryReplayTimelineIsValid({
    ...immutable,
    arrivesAtMicros: timeline.arrivesAtMicros + 1n,
  }), false);
  assert.equal(productionPlayerCanaryReplayTimelineIsValid({
    ...immutable,
    gatheringEndsAtMicros: timeline.gatheringEndsAtMicros + 1n,
  }), false);
  assert.equal(productionPlayerCanaryReplayTimelineIsValid({
    ...immutable,
    notAfterMicros: timeline.returnsAtMicros,
  }), false);
  assert.equal(productionPlayerCanaryReplayTimelineIsValid({
    ...immutable,
    startedAtMicros: (1n << 64n) - 1n,
  }), false);
});

test('overdue same-assignment arrival drains expiry and return in at most three transitions', () => {
  type Schedule = Readonly<{
    assignmentId: string;
    scheduleId: string;
    stage: 'arrival' | 'expiry' | 'return' | 'unexpected';
    at: bigint;
  }>;
  const pending: Schedule[] = [{
    assignmentId: 'assignment-1',
    scheduleId: '01-arrival',
    stage: 'arrival',
    at: 10n,
  }];
  const ran: string[] = [];
  runBoundedDueCastleWorkerScheduleDrainV1(
    pending[0]!,
    40n,
    schedule => {
      ran.push(schedule.stage);
      pending.splice(pending.findIndex(row => row.scheduleId === schedule.scheduleId), 1);
      if (schedule.stage === 'arrival') pending.push({
        assignmentId: schedule.assignmentId,
        scheduleId: '02-expiry',
        stage: 'expiry',
        at: 20n,
      });
      if (schedule.stage === 'expiry') pending.push({
        assignmentId: schedule.assignmentId,
        scheduleId: '03-return',
        stage: 'return',
        at: 30n,
      });
      if (schedule.stage === 'return') pending.push({
        assignmentId: schedule.assignmentId,
        scheduleId: '04-unexpected',
        stage: 'unexpected',
        at: 35n,
      });
    },
    assignmentId => pending.filter(row => row.assignmentId === assignmentId),
    schedule => schedule.at,
  );
  assert.deepEqual(ran, ['arrival', 'expiry', 'return']);
  assert.deepEqual(pending.map(schedule => schedule.stage), ['unexpected']);
});

test('receipt capacity prunes only ordinary rows and never pc1/pc2 safety authority', () => {
  const fid = 42n;
  const receipt = (
    commandKey: string,
    createdAtMicros: bigint,
    assignmentId?: string,
  ) => ({
    requestKey: `${fid.toString()}:${commandKey}`,
    fid,
    assignmentId,
    createdAtMicros,
  });
  const receipts = [
    receipt(`pc1-${'a'.repeat(64)}`, 1n),
    receipt(`ordinary-${'b'.repeat(16)}`, 2n, 'active-assignment'),
    receipt(`pc2-${'c'.repeat(64)}`, 3n),
    receipt(`ordinary-${'d'.repeat(16)}`, 4n),
  ];
  assert.deepEqual(planWorkerIdempotencyReceiptPruneV1({
    fid,
    maximumReceiptCount: 4,
    activeAssignmentIds: ['active-assignment'],
    receipts,
  }), [`${fid.toString()}:ordinary-${'d'.repeat(16)}`]);
  assert.deepEqual(planWorkerIdempotencyReceiptPruneV1({
    fid,
    maximumReceiptCount: 5,
    activeAssignmentIds: ['active-assignment'],
    receipts,
  }), []);
  assert.throws(
    () => planWorkerIdempotencyReceiptPruneV1({
      fid,
      maximumReceiptCount: 2,
      activeAssignmentIds: [],
      receipts: [
        receipt(`pc1-${'a'.repeat(64)}`, 1n),
        receipt(`pc2-${'b'.repeat(64)}`, 2n),
      ],
    }),
    (error: unknown) => error instanceof CastleWorkerPolicyError
      && error.code === 'WORKER_IDEMPOTENCY_RESERVED_CAPACITY',
  );
  assert.throws(
    () => planWorkerIdempotencyReceiptPruneV1({
      fid,
      maximumReceiptCount: 2,
      activeAssignmentIds: [],
      receipts: [
        receipt(`ordinary-${'g'.repeat(16)}`, 1n, 'completed-after-f00'),
        receipt(`pc2-f00-${'h'.repeat(64)}`, 2n, 'canonical-snapshot'),
      ],
    }),
    (error: unknown) => error instanceof CastleWorkerPolicyError
      && error.code === 'WORKER_IDEMPOTENCY_RESERVED_CAPACITY',
  );
  assert.throws(
    () => planWorkerIdempotencyReceiptPruneV1({
      fid,
      maximumReceiptCount: 1,
      activeAssignmentIds: [],
      receipts: [{ ...receipt(`ordinary-${'e'.repeat(16)}`, 1n), fid: fid + 1n }],
    }),
    (error: unknown) => error instanceof CastleWorkerPolicyError
      && error.code === 'WORKER_IDEMPOTENCY_RECEIPT_INVALID',
  );
  assert.deepEqual(planWorkerIdempotencyReceiptPruneV1({
    fid,
    maximumReceiptCount: 1,
    activeAssignmentIds: [],
    receipts: [receipt(`xpc2-${'f'.repeat(16)}`, 1n)],
  }), [`${fid.toString()}:xpc2-${'f'.repeat(16)}`]);

  const saturated = [
    receipt(`pc1-${'a'.repeat(64)}`, 1n),
    receipt(`pc2-f00-${'b'.repeat(64)}`, 2n, 'snapshot-payload'),
    receipt(`ordinary-${'0'.repeat(16)}`, 0n, 'active-assignment'),
    receipt(`ordinary-${'1'.repeat(16)}`, 1n, 'completed-after-f00'),
    ...Array.from({ length: 60 }, (_, index) => receipt(
      `ordinary-${(index + 2).toString().padStart(16, '0')}`,
      BigInt(index + 2),
    )),
  ];
  assert.equal(saturated.length, 64);
  assert.deepEqual(planWorkerIdempotencyReceiptPruneV1({
    fid,
    maximumReceiptCount: 64,
    activeAssignmentIds: ['active-assignment'],
    receipts: saturated,
  }), [`${fid.toString()}:ordinary-${'2'.padStart(16, '0')}`]);
  assert.throws(
    () => planWorkerIdempotencyReceiptPruneV1({
      fid,
      maximumReceiptCount: 64,
      activeAssignmentIds: [],
      receipts: Array.from({ length: 64 }, (_, index) => receipt(
        `pc2-${index.toString().padStart(16, '0')}`,
        BigInt(index),
      )),
    }),
    (error: unknown) => error instanceof CastleWorkerPolicyError
      && error.code === 'WORKER_IDEMPOTENCY_RESERVED_CAPACITY',
  );
});

test('early recall is structurally valid and permanently caps accrual at return start', () => {
  const timeline = planCastleWorkerTimeline(1_000_000n, 3);
  const policy = workerResourcePolicy('wood');
  const outboundRecall = {
    phase: 'returning',
    ...timeline,
    returnStartedAtMicros: timeline.startedAtMicros + 30_000_000n,
    returnsAtMicros: timeline.startedAtMicros + 59_997_000n,
    routeSteps: 3,
    returnStartProgressBasisPoints: 3_333,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    resourceKind: 'wood',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
  } as const;
  assert.equal(workerAssignmentStateIsConsistent(outboundRecall), true);
  assert.deepEqual(planCastleWorkerAccrual(outboundRecall, timeline.gatheringEndsAtMicros), {
    accruedAmount: 0n,
    newlyAccruedAmount: 0n,
    completedQuanta: 0n,
    settledThroughMicros: timeline.arrivesAtMicros,
  });

  const returnStartedAtMicros = timeline.arrivesAtMicros + 2n * policy.quantumMicros + 30_000_000n;
  const gatheringRecall = {
    ...outboundRecall,
    returnStartedAtMicros,
    returnsAtMicros: returnStartedAtMicros + 90_000_000n,
    returnStartProgressBasisPoints: 10_000,
  };
  const capped = planCastleWorkerAccrual(gatheringRecall, timeline.gatheringEndsAtMicros);
  assert.equal(capped.completedQuanta, 2n);
  assert.equal(capped.accruedAmount, 2n * policy.ratePerQuantum);
  assert.equal(capped.settledThroughMicros, timeline.arrivesAtMicros + 2n * policy.quantumMicros);
  assert.equal(
    planCastleWorkerAccrual({
      ...gatheringRecall,
      settledThroughMicros: capped.settledThroughMicros,
      accruedAmount: capped.accruedAmount,
      materializedAmount: capped.accruedAmount,
    }, timeline.gatheringEndsAtMicros).newlyAccruedAmount,
    0n,
  );
});

test('returning assignments fail closed without a bounded return-start cursor', () => {
  const timeline = planCastleWorkerTimeline(1_000_000n, 1);
  assert.equal(workerAssignmentStateIsConsistent({
    phase: 'returning',
    ...timeline,
    returnStartedAtMicros: undefined,
    routeSteps: 1,
    returnStartProgressBasisPoints: 0,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    resourceKind: 'food',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
  }), false);
});

test('assignment timing cannot forge a shorter route or return-progress award', () => {
  const timeline = planCastleWorkerTimeline(1_000_000n, 2);
  const base = {
    phase: 'outbound',
    ...timeline,
    returnStartedAtMicros: undefined,
    routeSteps: 2,
    returnStartProgressBasisPoints: 0,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    resourceKind: 'stone',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
  } as const;
  assert.equal(workerAssignmentStateIsConsistent(base), true);
  assert.equal(workerAssignmentStateIsConsistent({
    ...base,
    arrivesAtMicros: base.arrivesAtMicros - 1n,
  }), false);
  const returnStartedAtMicros = base.startedAtMicros + 30_000_000n;
  assert.equal(workerAssignmentStateIsConsistent({
    ...base,
    phase: 'returning',
    returnStartedAtMicros,
    returnStartProgressBasisPoints: 5_001,
    returnsAtMicros: returnStartedAtMicros + 30_000_000n,
  }), false);
});

test('policy rejects invalid resource kinds, roster ordinals, and routes', () => {
  assert.throws(() => workerResourcePolicy('mana'), (error: unknown) => (
    error instanceof CastleWorkerPolicyError && error.code === 'WORKER_RESOURCE_UNSUPPORTED'
  ));
  assert.throws(() => workerIdForCastle(1n, 5), (error: unknown) => (
    error instanceof CastleWorkerPolicyError && error.code === 'WORKER_ROSTER_ORDINAL_INVALID'
  ));
  assert.throws(() => planCastleWorkerTimeline(0n, 0), (error: unknown) => (
    error instanceof CastleWorkerPolicyError && error.code === 'WORKER_ROUTE_INVALID'
  ));
});
