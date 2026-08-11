import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
} from '../src/greaterRealmV17Policy';
import { attestCurrentGreaterRealmGateModeForTest } from './greaterRealmGateModeTestPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(value: string, start: string, end: string): string {
  const first = value.indexOf(start);
  const last = value.indexOf(end, first + start.length);
  assert.notEqual(first, -1, `missing section start: ${start}`);
  assert.notEqual(last, -1, `missing section end: ${end}`);
  return value.slice(first, last);
}

const reducerSource = source('../src/reducers/greaterRealmCutover.ts');
const auditSource = source('../src/greaterRealmCutoverAudit.ts');
const projectionSource = source('../src/greaterRealmCutoverStatus.ts');
const indexSource = source('../src/index.ts');
const generatedTypes = source('../../src/spacetime/module_bindings/types.ts');

const reducers = Object.freeze([
  Object.freeze([
    'adminPrepareGreaterRealmActivationV1',
    'admin_prepare_greater_realm_activation_v1',
    'admin_prepare_greater_realm_activation_v_1_reducer.ts',
    'prepareGreaterRealmActivationAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminBeginGreaterRealmDrainV1',
    'admin_begin_greater_realm_drain_v1',
    'admin_begin_greater_realm_drain_v_1_reducer.ts',
    'beginGreaterRealmDrainAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminFreezeGreaterRealmActivationV1',
    'admin_freeze_greater_realm_activation_v1',
    'admin_freeze_greater_realm_activation_v_1_reducer.ts',
    'freezeGreaterRealmActivationAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminPlanGreaterRealmRelocationV1',
    'admin_plan_greater_realm_relocation_v1',
    'admin_plan_greater_realm_relocation_v_1_reducer.ts',
    'planGreaterRealmRelocationAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminRelocateGreaterRealmCanaryV1',
    'admin_relocate_greater_realm_canary_v1',
    'admin_relocate_greater_realm_canary_v_1_reducer.ts',
    'relocateGreaterRealmCanaryAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminCommitGreaterRealmActiveV1',
    'admin_commit_greater_realm_active_v1',
    'admin_commit_greater_realm_active_v_1_reducer.ts',
    'commitGreaterRealmActiveAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminHaltGreaterRealmActivationV1',
    'admin_halt_greater_realm_activation_v1',
    'admin_halt_greater_realm_activation_v_1_reducer.ts',
    'haltGreaterRealmActivationAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminResumeGreaterRealmActiveV1',
    'admin_resume_greater_realm_active_v1',
    'admin_resume_greater_realm_active_v_1_reducer.ts',
    'resumeGreaterRealmActiveAuthorizedTransactionV1',
  ]),
  Object.freeze([
    'adminRollbackGreaterRealmBeforeCommitV1',
    'admin_rollback_greater_realm_before_commit_v1',
    'admin_rollback_greater_realm_before_commit_v_1_reducer.ts',
    'rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1',
  ]),
] as const);

test('all nine production relocation reducers are registered, argument-free, and authority-routed', () => {
  assert.equal(
    indexSource.split("from './reducers/greaterRealmCutover'").length - 1,
    1,
  );
  for (const [symbol, wire, binding, authority] of reducers) {
    assert.match(indexSource, new RegExp(`\\b${symbol}\\b`), symbol);
    assert.equal(reducerSource.split(`name: '${wire}'`).length - 1, 1, wire);
    const body = section(
      reducerSource,
      `export const ${symbol}`,
      symbol === 'adminRollbackGreaterRealmBeforeCommitV1'
        ? 'export const adminGetGreaterRealmCutoverStatusV1'
        : `export const ${reducers[reducers.findIndex(row => row[0] === symbol) + 1]![0]}`,
    );
    assert.match(body, /warpkeep\.reducer\(\s*\{ name: '[^']+' \},\s*ctx =>/u);
    assert.match(body, /authorizedActivation\(ctx,/u);
    assert.match(body, new RegExp(`\\b${authority}\\(ctx`), authority);
    const bindingUrl = new URL(`../../src/spacetime/module_bindings/${binding}`, import.meta.url);
    assert.equal(existsSync(bindingUrl), true, binding);
    assert.match(readFileSync(bindingUrl, 'utf8'), /export default \{\};/u, binding);
  }
});

test('the reviewed activation gate runs before admin authentication and status authenticates before reads', () => {
  attestCurrentGreaterRealmGateModeForTest(
    GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
    GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  );
  const boundary = section(
    reducerSource,
    'function authorizedActivation',
    'export const adminPrepareGreaterRealmActivationV1',
  );
  assert.ok(
    boundary.indexOf('requireGreaterRealmV17ActivationGate();')
      < boundary.indexOf('const admin = requireAdmin(ctx);'),
  );
  const status = reducerSource.slice(
    reducerSource.indexOf('export const adminGetGreaterRealmCutoverStatusV1'),
  );
  assert.ok(
    status.indexOf('requireAdmin(tx);')
      < status.indexOf('projectGreaterRealmCutoverStatusV1(tx)'),
  );
  assert.match(status, /ctx => ctx\.withTx\(tx =>/u);
});

test('changed relocation reducers append one fixed private audit while exact retries remain write-free', () => {
  const boundary = section(
    reducerSource,
    'function authorizedActivation',
    'export const adminPrepareGreaterRealmActivationV1',
  );
  assert.match(boundary, /const admin = requireAdmin\(ctx\);/u);
  assert.match(boundary, /runGreaterRealmCutoverTransitionWithAuditV1\(/u);
  assert.ok(
    boundary.indexOf('const admin = requireAdmin(ctx);')
      < boundary.indexOf('runGreaterRealmCutoverTransitionWithAuditV1('),
  );
  assert.match(auditSource, /const result = run\(\);/u);
  assert.match(auditSource, /if \(result === 'unchanged'\) return result;/u);
  assert.ok(
    auditSource.indexOf("if (result === 'unchanged') return result;")
      < auditSource.indexOf('ctx.db.adminAudit.insert({'),
  );
  assert.equal(auditSource.split('ctx.db.adminAudit.insert({').length - 1, 1);
  assert.match(auditSource, /targetFid: undefined/u);
  assert.match(auditSource, /actorSubject,/u);
  assert.match(auditSource, /note: GREATER_REALM_CUTOVER_AUDIT_NOTE_V1/u);
  assert.match(
    auditSource,
    /GREATER_REALM_CUTOVER_AUDIT_NOTE_V1\s*=\s*\n\s*'protocol-v17;greater-realm-cutover-audit-v1'/u,
  );
  for (const [, wire] of reducers) {
    const action = wire.replace(/^admin_/u, '');
    assert.equal(reducerSource.split(`'${action}'`).length - 1, 1, action);
    assert.equal(auditSource.split(`| '${action}'`).length - 1, 1, action);
  }
});

test('the generated status ABI is flat, aggregate-only, and includes exactly fifteen journey counts', () => {
  const schema = section(
    reducerSource,
    "const adminGreaterRealmCutoverStatusV1 = t.object(",
    'function senderActivationError',
  );
  assert.doesNotMatch(schema, /t\.array\(/u);
  assert.doesNotMatch(
    schema,
    /\b(?:actorSubject|fid|ownerFid|castleId|slotId|cellKey|nodeId|locationId|atlasQ|atlasR|createdAt|updatedAt|preparedAt|activatedAt)\s*:/u,
  );
  const generated = section(
    generatedTypes,
    'export const AdminGreaterRealmCutoverStatusV1',
    'export const AdminGreaterRealmImportPlanV1',
  );
  assert.doesNotMatch(generated, /__t\.array\(/u);
  assert.doesNotMatch(
    generated,
    /\b(?:actorSubject|fid|ownerFid|castleId|slotId|cellKey|nodeId|locationId|atlasQ|atlasR|createdAt|updatedAt|preparedAt|activatedAt)\s*:/u,
  );
  const journeyFields = [
    'goldNodeOccupationRows',
    'goldExpeditionRows',
    'goldExpeditionScheduleRows',
    'foodNodeOccupationRows',
    'foodExpeditionRows',
    'foodExpeditionScheduleRows',
    'woodNodeOccupationRows',
    'woodExpeditionRows',
    'woodExpeditionScheduleRows',
    'stoneNodeOccupationRows',
    'stoneExpeditionRows',
    'stoneExpeditionScheduleRows',
    'workerAssignmentRows',
    'workerNodeOccupationRows',
    'workerAssignmentScheduleRows',
  ];
  assert.equal(journeyFields.length, 15);
  for (const field of journeyFields) {
    assert.equal(generated.split(`${field}: __t.u64()`).length - 1, 1, field);
  }
  assert.equal(generated.split('auditRows: __t.u64()').length - 1, 1);
  assert.match(projectionSource, /auditRows: ctx\.db\.adminAudit\.count\(\)/u);
  assert.match(
    projectionSource,
    /release\.componentExpectedCellCount === release\.importedPassableCellCount/u,
  );
  assert.doesNotMatch(
    projectionSource,
    /release\.componentExpectedCellCount === release\.expectedCellCount/u,
  );
  assert.doesNotMatch(
    projectionSource,
    /release\.importedPassableCellCount === release\.expectedCellCount/u,
  );
  assert.match(projectionSource, /Every scan is capped by a protocol constant/u);
  assert.match(projectionSource, /currentWorldGraphExact/u);
  assert.match(projectionSource, /activeAdmissionEligible/u);
});

test('the admin procedure binding returns the exact generated cutover product', () => {
  const binding = source(
    '../../src/spacetime/module_bindings/admin_get_greater_realm_cutover_status_v_1_procedure.ts',
  );
  assert.match(binding, /export const params = \{\s*\};/u);
  assert.match(binding, /export const returnType = AdminGreaterRealmCutoverStatusV1/u);
  assert.match(indexSource, /\badminGetGreaterRealmCutoverStatusV1\b/u);
});

test('the target-aware re-enable proof is admin-only, identity-free, exact, and generated', () => {
  const aggregateGraph = section(
    projectionSource,
    'function exactFounderAggregateGraph(',
    'export function projectGreaterRealmCutoverStatusV1',
  );
  assert.match(aggregateGraph, /allowed\.fid !== castle\.ownerFid/u);
  assert.doesNotMatch(aggregateGraph, /!allowed\.enabled/u);

  const projection = section(
    projectionSource,
    'export function projectGreaterRealmReenableStatusV1(',
    'export function greaterRealmCutoverStatusErrorCode',
  );
  assert.match(projection, /assertGreaterRealmCurrentFounderForFidV1\(ctx, fid\)/u);
  assert.match(projection, /assertGenesisResourceForFid\(ctx, fid\)/u);
  assert.match(projection, /assertCastleWorkerRoster\(ctx, founder\.castle\.castleId\)/u);
  assert.match(projection, /request\.requestCycle === BigInt\(targetAuthEpoch\) \+ 1n/u);
  assert.match(projection, /targetRequestedAtMicros > 0n/u);
  assert.doesNotMatch(projection, /return[\s\S]*\bfid\s*[,}]/u);

  const procedure = reducerSource.slice(
    reducerSource.indexOf('export const adminGetGreaterRealmReenableStatusV1'),
  );
  assert.match(procedure, /name: 'admin_get_greater_realm_reenable_status_v1'/u);
  assert.ok(procedure.indexOf('requireAdmin(tx);') < procedure.indexOf('requireSupportedFid(fid);'));
  assert.ok(
    procedure.indexOf('requireSupportedFid(fid);')
      < procedure.indexOf('projectGreaterRealmReenableStatusV1(tx, fid)'),
  );
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/u);

  const generated = section(
    generatedTypes,
    'export const AdminGreaterRealmReenableStatusV1',
    'export const AdminGreaterRealmStatusV1',
  );
  for (const field of [
    'currentWorldGraphApplicable',
    'targetFounderGraphExact',
    'targetAllowedEnabled',
    'targetReenableEligible',
  ]) assert.equal(generated.split(`${field}: __t.bool()`).length - 1, 1, field);
  assert.doesNotMatch(generated, /\b(?:fid|castleId|slotId|cellKey|ownerFid)\s*:/u);

  const binding = source(
    '../../src/spacetime/module_bindings/admin_get_greater_realm_reenable_status_v_1_procedure.ts',
  );
  assert.match(binding, /fid: __t\.u64\(\)/u);
  assert.match(binding, /returnType = AdminGreaterRealmReenableStatusV1/u);
  assert.match(indexSource, /\badminGetGreaterRealmReenableStatusV1\b/u);
});
