import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  productionPlayerCanaryRecoveryDisposition,
  productionPlayerCanaryStructuralEvidenceCandidate,
} from '../src/productionPlayerCanaryRecoveryPolicy';

test('recovery disposition is exhaustive and gives active recall precedence', () => {
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: false,
    structuralEvidenceCandidate: false,
    outboundWorkerCount: 1,
    gatheringWorkerCount: 0,
    returningWorkerCount: 3,
  }), 'recall-required');
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: false,
    structuralEvidenceCandidate: false,
    outboundWorkerCount: 0,
    gatheringWorkerCount: 0,
    returningWorkerCount: 4,
  }), 'return-in-progress');
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: true,
    structuralEvidenceCandidate: true,
    outboundWorkerCount: 0,
    gatheringWorkerCount: 0,
    returningWorkerCount: 0,
  }), 'terminal-evidence-candidate');
  assert.equal(productionPlayerCanaryRecoveryDisposition({
    terminalSafe: true,
    structuralEvidenceCandidate: false,
    outboundWorkerCount: 0,
    gatheringWorkerCount: 0,
    returningWorkerCount: 0,
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

test('caller conditional recall accepts no browser lineage and validates exact dispatch authority', () => {
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
  assert.match(conditional, /input\.ordinal < 1/u);
  assert.match(conditional, /input\.ordinal > CASTLE_WORKERS_PER_CASTLE/u);
  assert.match(conditional, /requireProductionPlayerCanaryBaselineRow/u);
  assert.match(conditional, /requireProductionPlayerCanaryApprovalRegistrationV1/u);
  assert.match(conditional, /productionPlayerCanaryCommandAuthorityV1/u);
  assert.match(conditional, /dispatch === null/u);
  assert.match(conditional, /dispatchReceiptMatches/u);
  assert.match(conditional, /recallCastleWorkerForExactCanaryAssignment/u);
  assert.doesNotMatch(conditional, /recallAll/u);

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
