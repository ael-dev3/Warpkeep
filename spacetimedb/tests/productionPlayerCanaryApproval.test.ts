import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ProductionPlayerCanaryApprovalError,
  productionPlayerCanaryOwnerApprovalCommitmentV1,
  productionPlayerCanaryApprovalRegistrationCommitmentV1,
  reconcileProductionPlayerCanaryApprovalRowsV1,
} from '../src/productionPlayerCanaryApprovalPolicy';

const material = Object.freeze({
  challengeDigest: 'a'.repeat(64),
  reviewedAdmissionPlanDigest: 'b'.repeat(64),
  serverBaselineCommitment: 'c'.repeat(64),
  routeSetCommitment: 'd'.repeat(64),
  commandKeyPolicyVersion: 'warpkeep-production-player-canary-command-key-v2',
  commandSetCommitment: 'e'.repeat(64),
  ownerApprovalArtifactDigest: 'f'.repeat(64),
  ownerApprovalCommitment: '1'.repeat(64),
  approvedAtMicros: 1_000_000n,
  notAfterMicros: 2_000_000n,
});
const approvalRegistrationCommitment =
  productionPlayerCanaryApprovalRegistrationCommitmentV1(material);
const row = Object.freeze({
  ...material,
  fid: 123n,
  approvalRegistrationCommitment,
  registeredAt: { microsSinceUnixEpoch: 1_500_000n },
});

function lookup(value: typeof row | null = row) {
  return {
    byChallenge: value,
    byFid: value,
    byBaseline: value,
    byRouteSet: value,
    byCommandSet: value,
    byArtifact: value,
    byOwnerApproval: value,
    byRegistration: value,
  };
}

test('registration commitment is exact and all eight unique lookups reconcile one row', () => {
  assert.match(approvalRegistrationCommitment, /^[0-9a-f]{64}$/u);
  assert.equal(
    reconcileProductionPlayerCanaryApprovalRowsV1(
      lookup() as never,
      approvalRegistrationCommitment,
    ),
    row,
  );
  assert.equal(
    reconcileProductionPlayerCanaryApprovalRowsV1(
      lookup(null) as never,
      approvalRegistrationCommitment,
    ),
    null,
  );
  assert.notEqual(
    productionPlayerCanaryApprovalRegistrationCommitmentV1({
      ...material,
      notAfterMicros: material.notAfterMicros + 1n,
    }),
    approvalRegistrationCommitment,
  );
  assert.match(productionPlayerCanaryOwnerApprovalCommitmentV1({
    evidenceNonce: '9'.repeat(64),
    ownerApprovalArtifactDigest: material.ownerApprovalArtifactDigest,
    serverBaselineCommitment: material.serverBaselineCommitment,
    routeSetCommitment: material.routeSetCommitment,
  }), /^[0-9a-f]{64}$/u);
});

test('every partial, cross-row, or commitment collision fails closed', () => {
  for (const key of Object.keys(lookup()) as (keyof ReturnType<typeof lookup>)[]) {
    assert.throws(
      () => reconcileProductionPlayerCanaryApprovalRowsV1(
        { ...lookup(), [key]: null } as never,
        approvalRegistrationCommitment,
      ),
      ProductionPlayerCanaryApprovalError,
      key,
    );
  }
  const other = Object.freeze({
    ...row,
    challengeDigest: '2'.repeat(64),
  });
  assert.throws(
    () => reconcileProductionPlayerCanaryApprovalRowsV1(
      { ...lookup(), byArtifact: other } as never,
      approvalRegistrationCommitment,
    ),
    /PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_CONFLICT/u,
  );
  assert.throws(
    () => reconcileProductionPlayerCanaryApprovalRowsV1(
      {
        ...lookup(),
        byArtifact: { ...row, approvalRegistrationCommitment: '8'.repeat(64) },
      } as never,
      approvalRegistrationCommitment,
    ),
    /PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_CONFLICT/u,
  );
  assert.throws(
    () => reconcileProductionPlayerCanaryApprovalRowsV1(
      lookup() as never,
      '3'.repeat(64),
    ),
    /PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_CONFLICT/u,
  );
});

test('approval authority remains a private append-only suffix with exact unique keys', () => {
  const schema = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
  const authority = readFileSync(
    new URL('../src/productionPlayerCanaryApproval.ts', import.meta.url),
    'utf8',
  );
  const start = schema.indexOf(
    'export const productionPlayerCanaryApprovalRegistrationV1 = table(',
  );
  const end = schema.indexOf('\n);', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const table = schema.slice(start, end);
  assert.doesNotMatch(table, /public:\s*true/u);
  for (const field of [
    'challengeDigest: t.string().primaryKey()',
    'fid: t.u64().unique()',
    'serverBaselineCommitment: t.string().unique()',
    'routeSetCommitment: t.string().unique()',
    'commandSetCommitment: t.string().unique()',
    'ownerApprovalArtifactDigest: t.string().unique()',
    'ownerApprovalCommitment: t.string().unique()',
    'approvalRegistrationCommitment: t.string().unique()',
  ]) assert.ok(table.includes(field), field);
  assert.doesNotMatch(authority, /\.update\(|\.delete\(/u);
  const registerStart = authority.indexOf(
    'export function registerProductionPlayerCanaryApprovalV1(',
  );
  const registerEnd = authority.indexOf(
    'export function inspectProductionPlayerCanaryApprovalRegistrationV1(',
    registerStart,
  );
  const register = authority.slice(registerStart, registerEnd);
  assert.ok(
    register.indexOf('if (existing !== null)')
      < register.indexOf('const authority = requireBoundServerAuthority'),
    'exact replay must return before mutable route/time checks',
  );
  assert.ok(
    register.indexOf('if (existing !== null)')
      < register.indexOf(
        'assertProductionPlayerCanaryApprovalPristineBaselineV2',
      ),
    'exact replay must return before the NEW-only current pristine recheck',
  );
  assert.ok(
    register.indexOf('assertProductionPlayerCanaryApprovalPristineBaselineV2')
      < register.indexOf(
        'productionPlayerCanaryApprovalRegistrationV1.insert',
      ),
    'the current pristine recheck must be the final authority before insert',
  );
});

test('stale v1 canary state is never reinterpreted as v2 authority', () => {
  const approval = readFileSync(
    new URL('../src/productionPlayerCanaryApproval.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    approval,
    /input\.commandKeyPolicyVersion[\s\S]*!== PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION/u,
  );
  assert.match(
    approval,
    /row\.commandKeyPolicyVersion[\s\S]*!== PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION/u,
  );

  const baseline = readFileSync(
    new URL('../src/productionPlayerCanaryBaseline.ts', import.meta.url),
    'utf8',
  );
  for (const field of [
    'assignmentCount',
    'occupationCount',
    'scheduleCount',
    'commandReceiptCount',
  ]) assert.match(baseline, new RegExp(`\\b${field}\\b`, 'u'));
  assert.match(baseline, /PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED/u);

  const recovery = readFileSync(
    new URL('../src/productionPlayerCanaryRecovery.ts', import.meta.url),
    'utf8',
  );
  assert.match(recovery, /RESERVED_COMMAND_V1_PREFIX = 'pc1-'/u);
  assert.match(
    recovery,
    /registration\.commandKeyPolicyVersion[\s\S]*!== commandAuthority\.commandKeyPolicyVersion/u,
  );
});

test('caller runtime API is exact, caller-authenticated, and never transports keys or identity', () => {
  const reducer = readFileSync(
    new URL('../src/reducers/castleWorkers.ts', import.meta.url),
    'utf8',
  );
  const start = reducer.indexOf(
    'export const getProductionPlayerCanaryRuntimeV1 = warpkeep.procedure(',
  );
  const end = reducer.indexOf(
    'export const adminGetProductionPlayerCanaryEvidenceV1',
    start,
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const runtime = reducer.slice(start, end);
  assert.match(runtime, /name: 'get_production_player_canary_runtime_v1'/u);
  assert.match(runtime, /requireGameplayReadPlayerV1/u);
  assert.match(runtime, /claims\.fid/u);
  assert.doesNotMatch(runtime, /dispatchIdempotencyKey|recallIdempotencyKey/u);
  assert.match(runtime, /commandSetCommitment/u);
  const responseStart = runtime.indexOf('return {');
  const response = runtime.slice(responseStart);
  assert.doesNotMatch(
    response,
    /\bfid\s*:|castleId\s*:|challengeDigest\s*:|approvalRegistrationCommitment\s*:/u,
  );
  const bindingUrl = new URL(
    '../../src/spacetime/module_bindings/get_production_player_canary_runtime_v_1_procedure.ts',
    import.meta.url,
  );
  assert.equal(existsSync(bindingUrl), true);
  const binding = readFileSync(bindingUrl, 'utf8');
  assert.match(binding, /evidenceNonce: __t\.string\(\)/u);
  assert.match(binding, /reviewedAdmissionPlanDigest: __t\.string\(\)/u);
  assert.match(binding, /routeSetCommitment: __t\.string\(\)/u);
  assert.doesNotMatch(binding, /\bfid\b|idempotencyKey|castleId/u);
  assert.equal(existsSync(new URL(
    '../../src/spacetime/module_bindings/get_my_production_player_canary_route_plan_v_1_procedure.ts',
    import.meta.url,
  )), false);
});
