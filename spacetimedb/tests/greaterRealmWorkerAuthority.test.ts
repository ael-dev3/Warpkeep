import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
} from '../src/greaterRealmV17Policy';
import { attestCurrentGreaterRealmGateModeForTest } from './greaterRealmGateModeTestPolicy';

function source(path: string) {
  return readFileSync(resolve(import.meta.dirname, path), 'utf8');
}

function position(text: string, fragment: string) {
  const result = text.indexOf(fragment);
  assert.notEqual(result, -1, `missing source fragment: ${fragment}`);
  return result;
}

test('authenticated public input validation precedes receipt replay and every fresh-only gate', () => {
  const reducer = source('../src/reducers/castleWorkers.ts');
  const authority = source('../src/castleWorkerAuthority.ts');
  const reducerStart = position(reducer, 'export const dispatchGreaterRealmWorkerV1');
  const reducerBody = reducer.slice(reducerStart, position(reducer.slice(reducerStart), 'export const recallWorkerV1') + reducerStart);
  assert.ok(
    position(reducerBody, 'requireAuthenticatedCastleOwnerActionV1(ctx)')
      < position(reducerBody, 'dispatchGreaterRealmCastleWorkerV2(ctx'),
  );

  const start = position(authority, 'export function dispatchGreaterRealmCastleWorkerV2');
  const body = authority.slice(start, position(authority.slice(start), '\nfunction progressBasisPoints') + start);
  const request = position(body, 'assignmentRequestKey(input.fid, input.idempotencyKey)');
  const fingerprint = position(body, 'validateGreaterRealmWorkerDispatchInputV2(input)');
  const receiptRead = position(body, 'workerCommandIdempotencyV1.requestKey.find(requestKey)');
  const replay = position(body, 'replayGreaterRealmWorkerDispatchV2(prior, input, fingerprint)');
  const active = position(body, 'greaterRealmWorkerSystemActiveV1(ctx)');
  const capacity = position(body, 'resolveGreaterRealmWorkerDispatchTargetV2(ctx, input, fingerprint)');
  const assignmentWrite = position(body, 'workerAssignmentV1.insert({');
  const receiptWrite = position(body, 'workerCommandIdempotencyV1.insert({');
  const counter = position(body, 'advanceGreaterRealmWorkerDispatchCounterV1(ctx, target)');
  assert.ok(request < fingerprint);
  assert.ok(fingerprint < receiptRead);
  assert.ok(receiptRead < replay);
  assert.ok(replay < active);
  assert.ok(active < capacity);
  assert.ok(capacity < assignmentWrite);
  assert.ok(assignmentWrite < receiptWrite);
  assert.ok(receiptWrite < counter);
});

test('fresh target resolution uses the exact location index and first-free public capacity ordinal', () => {
  const authority = source('../src/greaterRealmWorkerAuthority.ts');
  const shared = source('../src/greaterRealmResourceLocationAuthority.ts');
  assert.match(
    shared,
    /greaterRealmResourceNodeV1\.locationId\.filter\(locationId\)/,
  );
  assert.match(authority, /resolveGreaterRealmResourceLocationV1\(/);
  assert.match(authority, /return translatePolicyError\(error\)/);
  assert.match(shared, /GREATER_REALM_MAX_RESOURCE_NODES_PER_LOCATION/);
  assert.match(shared, /!Number\.isSafeInteger\(first\.nodeOrdinal\)/);
  assert.match(shared, /first\.nodeOrdinal < 0/);
  assert.match(shared, /first\.nodeOrdinal > U32_MAX/);
  assert.match(shared, /!Number\.isSafeInteger\(first\.releaseOrdinal\)/);
  assert.match(shared, /first\.releaseOrdinal < 0/);
  assert.match(shared, /first\.releaseOrdinal > U32_MAX/);
  assert.match(shared, /!Number\.isSafeInteger\(lastNodeOrdinal\)/);
  assert.match(shared, /lastNodeOrdinal > U32_MAX/);
  assert.match(shared, /!Number\.isSafeInteger\(lastReleaseOrdinal\)/);
  assert.match(shared, /lastReleaseOrdinal > U32_MAX/);
  assert.match(shared, /row\.nodeOrdinal !== first\.nodeOrdinal \+ index/);
  assert.match(shared, /row\.releaseOrdinal !== first\.releaseOrdinal \+ index/);
  assert.match(authority, /occupiedCapacityOrdinals/);
  assert.match(authority, /selectGreaterRealmPublicCapacityLeaseV1\(\{/);
  assert.match(authority, /priorReceipt: null/);
  assert.match(authority, /selected\.result !== 'allocated'/);
});

test('route time is derived only from bounded server parent/LCA authority', () => {
  const authority = source('../src/greaterRealmWorkerAuthority.ts');
  assert.match(authority, /GREATER_REALM_MAX_ROUTE_DEPTH/);
  assert.match(authority, /routeParentDirection/);
  assert.match(authority, /sealedBoundaryMask/);
  assert.match(authority, /parent\.routeDepth !== row\.routeDepth - 1/);
  assert.match(authority, /originIndexes/);
  assert.match(authority, /routeSteps = originIndex \+ index/);
  for (const forbidden of ['Math.sqrt', 'hypot(', 'browser', 'clientDistance']) {
    assert.equal(authority.includes(forbidden), false, forbidden);
  }
});

test('dispatch changes only the activation dispatch counter after all graph writes', () => {
  const authority = source('../src/greaterRealmWorkerAuthority.ts');
  const counterStart = position(authority, 'export function advanceGreaterRealmWorkerDispatchCounterV1');
  const body = authority.slice(counterStart);
  assert.match(body, /row\.mode !== 'active'/);
  assert.match(body, /advanceGreaterRealmPostCanaryCounterV1\([\s\S]*?'dispatch'/);
  assert.match(body, /postCanaryDispatchCount: next\.postCanaryDispatchCount/);
  assert.match(body, /updated\.postCanaryFoundingCount !== row\.postCanaryFoundingCount/);
  assert.match(body, /updated\.nextAllocationSequence !== row\.nextAllocationSequence/);
  assert.doesNotMatch(body, /postCanaryFoundingCount:/);
  assert.doesNotMatch(body, /nextAllocationSequence:/);
});

test('v17 active inspection widens to 600 while legacy repair remains capped at 100', () => {
  const authority = source('../src/castleWorkerAuthority.ts');
  const systemStart = position(authority, 'function greaterRealmWorkerSystemActiveV1');
  const system = authority.slice(
    systemStart,
    position(authority.slice(systemStart), '\nfunction canonicalSiteFor') + systemStart,
  );
  const activeStart = position(authority, 'export function assertCastleWorkerActiveGraphHealthyV1');
  const repairStart = position(authority, 'function assertWorkerReturnRepairInspectionCapacity');
  const active = authority.slice(activeStart, repairStart);
  const repair = authority.slice(repairStart, position(authority.slice(repairStart), 'export function') + repairStart);
  assert.match(system, /row\.expectedCastleCount > GREATER_REALM_CASTLE_CAPACITY/);
  assert.match(system, /ctx\.db\.castle\.count\(\) !== expectedCastleCount/);
  assert.match(system, /ctx\.db\.castleWorkerV1\.count\(\) !== expectedWorkerCount/);
  assert.match(active, /GREATER_REALM_MAX_WORKER_ROWS/);
  assert.match(active, /GREATER_REALM_MAX_WORKER_RECEIPT_ROWS/);
  assert.match(repair, /CASTLE_WORKER_MAX_CASTLES/);
  assert.match(repair, /WORKER_RETURN_REPAIR_MAX_ROWS/);
  assert.match(repair, /WORKER_RETURN_REPAIR_MAX_RECEIPTS/);
  assert.doesNotMatch(repair, /GREATER_REALM_MAX_WORKER/);
  assert.match(authority, /export function projectMyGreaterRealmWorkerStateV2/);
  assert.match(
    source('../src/reducers/castleWorkers.ts'),
    /getMyWorkerControlStateV2[\s\S]*?requireGameplayReadPlayerV1\(tx\)[\s\S]*?projectMyGreaterRealmWorkerStateV2ForIndexedReadV1\(/,
  );
  assert.match(
    authority,
    /projectMyWorkerState[\s\S]*?workerSystemActive\(ctx\)/,
  );
  assert.match(
    authority,
    /dispatchCastleWorker[\s\S]*?greaterRealmLegacyJourneyDispatchIsOpenV1\(ctx\)[\s\S]*?workerSystemActive\(ctx\)/,
  );
  assert.match(
    authority,
    /recallCastleWorker[\s\S]*?workerSystemActiveForCurrentGameplayV1\(ctx\)/,
  );
  assert.match(
    authority,
    /recallAllCastleWorkers[\s\S]*?workerSystemActiveForCurrentGameplayV1\(ctx\)/,
  );
  assert.match(
    source('../src/innerKeepAuthority.ts'),
    /projectMyWorkerStateForCurrentGameplayIndexedReadV1\(/,
  );
  assert.doesNotMatch(
    source('../src/innerKeepAuthority.ts'),
    /projectMyWorkerState\(/,
  );
  const reducers = source('../src/reducers/castleWorkers.ts');
  assert.match(
    reducers,
    /getMyResourceStateV2[\s\S]*?requireGameplayReadPlayerV1\(tx\)[\s\S]*?projectMyWorkerStateForCurrentGameplayIndexedReadV1\(/,
  );
  assert.match(
    reducers,
    /adminGetWorkerSystemStatusV1[\s\S]*?inspectCastleWorkerGraphForCurrentGameplayV1\(/,
  );
  assert.match(
    reducers,
    /adminPlanWorkerRosterV1[\s\S]*?inspectCastleWorkerGraph\(tx\)/,
  );
});

test('public reducer and V2 control projection expose no private topology or capacity digest', () => {
  const reducer = source('../src/reducers/castleWorkers.ts');
  const generatedReducer = source('../../src/spacetime/module_bindings/dispatch_greater_realm_worker_v_1_reducer.ts');
  const generatedControl = source('../../src/spacetime/module_bindings/get_my_worker_control_state_v_2_procedure.ts');
  const dispatchStart = position(reducer, 'export const dispatchGreaterRealmWorkerV1');
  const dispatchBody = reducer.slice(dispatchStart, position(reducer.slice(dispatchStart), 'export const recallWorkerV1') + dispatchStart);
  const forbiddenPrivateName = ['node', 'Id'].join('');
  assert.deepEqual(
    [...dispatchBody.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*): t\./gm)].map(match => match[1]),
    ['workerId', 'resourceKind', 'locationId', 'expectedRevision', 'idempotencyKey'],
  );
  for (const text of [dispatchBody, generatedReducer, generatedControl]) {
    assert.equal(text.includes(forbiddenPrivateName), false);
    assert.equal(text.includes('capacityDigest'), false);
  }
  assert.match(reducer, /siteId: worker\.siteId/);
  assert.match(reducer, /atlasRevision: atlas\.revision/);
});

test('the module gate mode is reviewed while production presentation remains compile-time false', () => {
  attestCurrentGreaterRealmGateModeForTest(
    GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED,
    GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED,
  );
  assert.match(
    source('../../src/greater-realm/greaterRealmTransport.ts'),
    /GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const/,
  );
  assert.match(
    source('../../src/spacetime/greaterRealmProviderBridge.ts'),
    /GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const/,
  );
});
