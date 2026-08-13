import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  productionPlayerCanaryBaselineCommitments,
  productionPlayerCanaryChallengeDigest,
  productionPlayerCanaryMissingBaselineStatus,
  assertProductionPlayerCanaryPristineBaselineMaterial,
  reconcileProductionPlayerCanaryStoredBaselines,
  validateProductionPlayerCanaryBaselineInput,
} from '../src/productionPlayerCanaryBaselinePolicy';

const NONCE = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);

function pristineMaterial(overrides: Record<string, unknown> = {}) {
  const castleId = 71n;
  return {
    fid: 123n,
    reviewedAdmissionPlanDigest: PLAN,
    evidenceNonce: NONCE,
    challengeDigest: productionPlayerCanaryChallengeDigest(NONCE),
    castleId,
    atlasId: 'GENESIS_001_GREATER_REALM',
    atlasRevision: 7n,
    capturedAtMicros: 4_000_000n,
    resourceSettledThroughMicros: 2_000_000n,
    resourceRevision: 0n,
    resourceFood: 0n,
    resourceWood: 0n,
    resourceStone: 0n,
    resourceGold: 0n,
    resourcePolicyVersion: 'genesis-resource-yield-v1',
    resourceCreatedAtMicros: 2_000_000n,
    resourceUpdatedAtMicros: 2_000_000n,
    admittedAtMicros: 2_000_000n,
    acceptedAtMicros: 3_000_000n,
    requestedAtMicros: 1_000_000n,
    invitedAtMicros: 2_000_000n,
    pristineWorkers: Array.from({ length: 4 }, (_, index) => ({
      workerId: `genesis-001-castle-71-worker-0${index + 1}`,
      originCastleId: castleId,
      ordinal: index + 1,
      status: 'idle',
      timelineRevision: 0,
      revision: 0n,
      optionalTimelineEmpty: true,
    })),
    assignmentCount: 0n,
    occupationCount: 0n,
    scheduleCount: 0n,
    commandReceiptCount: 0n,
    ...overrides,
  };
}

function immutableRow() {
  const material = pristineMaterial();
  const commitments = productionPlayerCanaryBaselineCommitments(material);
  return {
    challengeDigest: material.challengeDigest,
    fid: material.fid,
    reviewedAdmissionPlanDigest: material.reviewedAdmissionPlanDigest,
    baselineCommitment: commitments.serverBaselineCommitment,
    castleId: material.castleId,
    atlasId: material.atlasId,
    atlasRevision: material.atlasRevision,
    capturedAtMicros: material.capturedAtMicros,
    resourceSettledThroughMicros: material.resourceSettledThroughMicros,
    resourceRevision: material.resourceRevision,
    resourceFood: material.resourceFood,
    resourceWood: material.resourceWood,
    resourceStone: material.resourceStone,
    resourceGold: material.resourceGold,
    resourcePolicyVersion: material.resourcePolicyVersion,
    resourceCreatedAtMicros: material.resourceCreatedAtMicros,
    pristineRosterCommitment: commitments.pristineRosterCommitment,
  };
}

test('pristine capture material rejects chronology, gameplay, and resource drift', () => {
  const valid = pristineMaterial();
  assert.doesNotThrow(() => assertProductionPlayerCanaryPristineBaselineMaterial(valid));
  const hostile = [
    { capturedAtMicros: 2_999_999n },
    { resourceRevision: 1n },
    { resourceFood: 1n },
    { resourceUpdatedAtMicros: 2_000_001n },
    { assignmentCount: 1n },
    { occupationCount: 1n },
    { scheduleCount: 1n },
    { commandReceiptCount: 1n },
    { pristineWorkers: valid.pristineWorkers.map((worker, index) => (
      index === 0 ? { ...worker, revision: 1n } : worker
    )) },
    { pristineWorkers: valid.pristineWorkers.map((worker, index) => (
      index === 1 ? { ...worker, optionalTimelineEmpty: false } : worker
    )) },
  ];
  for (const drift of hostile) {
    assert.throws(
      () => assertProductionPlayerCanaryPristineBaselineMaterial({ ...valid, ...drift }),
      /PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED/,
    );
  }
});

test('commitments bind nonce, plan, private resource state, and pristine roster', () => {
  const first = productionPlayerCanaryBaselineCommitments(pristineMaterial());
  const differentNonce = productionPlayerCanaryBaselineCommitments(pristineMaterial({
    evidenceNonce: 'c'.repeat(64),
    challengeDigest: productionPlayerCanaryChallengeDigest('c'.repeat(64)),
  }));
  const differentPlan = productionPlayerCanaryBaselineCommitments(pristineMaterial({
    reviewedAdmissionPlanDigest: 'd'.repeat(64),
  }));
  assert.notEqual(first.serverBaselineCommitment, differentNonce.serverBaselineCommitment);
  assert.notEqual(first.serverBaselineCommitment, differentPlan.serverBaselineCommitment);
  assert.notEqual(first.pristineRosterCommitment, differentNonce.pristineRosterCommitment);
  assert.match(first.serverBaselineCommitment, /^[0-9a-f]{64}$/u);
});

test('an exact lost-response replay remains read-only after gameplay and every key collision fails closed', () => {
  const row = immutableRow();
  const input = validateProductionPlayerCanaryBaselineInput({
    fid: row.fid,
    reviewedAdmissionPlanDigest: row.reviewedAdmissionPlanDigest,
    evidenceNonce: NONCE,
  });
  const exact = reconcileProductionPlayerCanaryStoredBaselines(row, row, input).status!;
  assert.equal(exact.serverBaselineCommitment, row.baselineCommitment);
  assert.equal(exact.baselineCaptured, true);
  assert.doesNotMatch(
    JSON.stringify(exact, (_key, value) => typeof value === 'bigint' ? value.toString() : value),
    /123|castle|atlas|food|wood|stone|gold/iu,
  );

  assert.throws(() => reconcileProductionPlayerCanaryStoredBaselines(
    row,
    row,
    validateProductionPlayerCanaryBaselineInput({
    fid: row.fid,
    reviewedAdmissionPlanDigest: 'e'.repeat(64),
    evidenceNonce: NONCE,
    }),
  ), /PRODUCTION_PLAYER_CANARY_BASELINE_CONFLICT/);
  assert.throws(() => reconcileProductionPlayerCanaryStoredBaselines(
    null,
    row,
    validateProductionPlayerCanaryBaselineInput({
    fid: row.fid,
    reviewedAdmissionPlanDigest: row.reviewedAdmissionPlanDigest,
    evidenceNonce: 'f'.repeat(64),
    }),
  ), /PRODUCTION_PLAYER_CANARY_BASELINE_CONFLICT/);
  assert.throws(() => reconcileProductionPlayerCanaryStoredBaselines(
    row,
    null,
    validateProductionPlayerCanaryBaselineInput({
    fid: row.fid + 1n,
    reviewedAdmissionPlanDigest: row.reviewedAdmissionPlanDigest,
    evidenceNonce: NONCE,
    }),
  ), /PRODUCTION_PLAYER_CANARY_BASELINE_CONFLICT/);
});

test('readback represents definite absence without manufacturing baseline authority', () => {
  const input = validateProductionPlayerCanaryBaselineInput({
    fid: 123n,
    reviewedAdmissionPlanDigest: PLAN,
    evidenceNonce: NONCE,
  });
  assert.deepEqual(productionPlayerCanaryMissingBaselineStatus(input), {
    profile: 'warpkeep-production-player-canary-server-baseline-v1',
    challengeDigest: productionPlayerCanaryChallengeDigest(NONCE),
    reviewedAdmissionPlanDigest: PLAN,
    serverBaselineCommitment: '',
    capturedAtMicros: 0n,
    baselineCaptured: false,
    directTierOneFounder: false,
    normalRequestAdmission: false,
    pristineWorkerCount: 0,
    terminalGraphEmpty: false,
    pristineResourceAccount: false,
  });
});

test('schema and ABI keep the baseline private, append-only, and server-loaded', () => {
  const schema = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
  const baseline = readFileSync(
    new URL('../src/productionPlayerCanaryBaseline.ts', import.meta.url),
    'utf8',
  );
  const reducers = readFileSync(
    new URL('../src/reducers/castleWorkers.ts', import.meta.url),
    'utf8',
  );
  const definition = schema.slice(
    schema.indexOf('export const productionPlayerCanaryBaselineV1 = table('),
    schema.indexOf('\n);', schema.indexOf(
      'export const productionPlayerCanaryBaselineV1 = table(',
    )) + 3,
  );
  assert.doesNotMatch(definition, /\bpublic\s*:/u);
  assert.match(definition, /challengeDigest: t\.string\(\)\.primaryKey\(\)/u);
  assert.match(definition, /fid: t\.u64\(\)\.unique\(\)/u);
  assert.match(definition, /baselineCommitment: t\.string\(\)\.unique\(\)/u);
  assert.doesNotMatch(baseline, /productionPlayerCanaryBaselineV1\.[A-Za-z]+\.(?:update|delete)\(/u);
  assert.match(reducers, /name: 'admin_capture_production_player_canary_baseline_v1'/u);
  assert.match(reducers, /name: 'admin_get_production_player_canary_baseline_v1'/u);
  const capture = baseline.slice(
    baseline.indexOf('export function captureProductionPlayerCanaryBaseline('),
    baseline.indexOf('/** Read and reconcile the immutable row', baseline.indexOf(
      'export function captureProductionPlayerCanaryBaseline(',
    )),
  );
  assert.ok(capture.indexOf('existingBaselineRow(ctx, input)') >= 0);
  assert.ok(capture.indexOf('buildPristineMaterial(ctx, input)') >= 0);
  assert.ok(
    capture.indexOf('existingBaselineRow(ctx, input)')
      < capture.indexOf('buildPristineMaterial(ctx, input)'),
    'exact stored replay must reconcile before consulting mutable gameplay state',
  );
  const finalProcedure = reducers.slice(
    reducers.indexOf('export const adminGetProductionPlayerCanaryEvidenceV1'),
  );
  assert.doesNotMatch(
    finalProcedure,
    /baseline(?:ObservedAtMicros|SettledThroughMicros|Revision|Food|Wood|Stone|Gold)/u,
  );
  assert.match(finalProcedure, /inspectProductionPlayerCanaryAdminEvidence\(tx, input\)/u);
});
