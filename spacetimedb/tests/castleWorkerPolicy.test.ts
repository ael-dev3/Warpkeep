import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS,
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  CastleWorkerPolicyError,
  planCastleWorkerAccrual,
  planCastleWorkerTimeline,
  rosterDigestForCastleIds,
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
