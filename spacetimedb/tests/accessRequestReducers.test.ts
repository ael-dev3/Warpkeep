import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ACCESS_REQUEST_QUEUE_CAPACITY,
  accessRequestQueueAcceptsSubmission,
  takeBoundedAccessRequestRows,
} from '../src/accessRequestPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function registrations(text: string, marker: string): string[] {
  const start = text.indexOf(marker);
  const end = text.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start, `missing schema marker ${marker}`);
  return text.slice(start + marker.length, end)
    .split(/[,\n]/)
    .map(value => value.trim())
    .filter(value => /^[A-Za-z][A-Za-z0-9]*$/.test(value));
}

function section(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `missing source section ${startMarker}`);
  return text.slice(start, end);
}

test('access requests add one exact private table at the end of the deployed v12 schema', () => {
  const schema = source('../src/schema.ts');
  const v12 = source('../migration-fixtures/additive-v12-schema/src/index.ts');
  const v13 = source('../migration-fixtures/additive-v13-schema/src/index.ts');
  const currentRegistrations = registrations(schema, 'const warpkeep = schema({');
  const v12Registrations = registrations(v12, 'const db = schema({');
  const v13Registrations = registrations(v13, 'const db = schema({');

  assert.equal(v12Registrations.length, 53);
  assert.deepEqual(v13Registrations.slice(0, 53), v12Registrations);
  assert.deepEqual(v13Registrations.slice(53), ['accessRequestV1']);
  assert.deepEqual(currentRegistrations.slice(0, 54), v13Registrations);
  assert.deepEqual(currentRegistrations.slice(54, 56), [
    'dailyMarkGrantV1',
    'dailyMarkScheduleV1',
  ]);

  const definition = section(
    schema,
    'export const accessRequestV1 = table(',
    '\n);',
  );
  assert.match(definition, /\{ name: 'access_request_v1' \}/);
  assert.doesNotMatch(definition, /public:\s*true|indexes:|status|note|source|username|pfp|wallet/i);
  assert.deepEqual(
    [...definition.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1]),
    ['fid', 'requestCycle', 'requestedAt'],
  );
  assert.match(definition, /fid: t\.u64\(\)\.primaryKey\(\)/);
  assert.match(definition, /requestCycle: t\.u64\(\)/);
  assert.match(definition, /requestedAt: t\.timestamp\(\)/);
});

test('caller procedures derive the sole FID from the resolver and expose one exact status product', () => {
  const reducer = source('../src/reducers/accessRequests.ts');
  const statusSchema = section(
    reducer,
    "const accessRequestStatusV1 = t.object('AccessRequestStatusV1'",
    '\n});',
  );
  assert.deepEqual(
    [...statusSchema.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1]),
    ['status', 'requestedAtMicros'],
  );
  assert.match(statusSchema, /status: t\.string\(\)/);
  assert.match(statusSchema, /requestedAtMicros: t\.option\(t\.u64\(\)\)/);

  const getStatus = section(
    reducer,
    'export const accessRequestGetStatusV1',
    '/**\n * Atomic, cycle-idempotent request submission.',
  );
  const submit = section(
    reducer,
    'export const accessRequestSubmitV1',
    '/**\n * Bounded, deterministic Hermes-only inspection.',
  );
  for (const [body, wireName] of [
    [getStatus, 'access_request_get_status_v1'],
    [submit, 'access_request_submit_v1'],
  ] as const) {
    assert.match(body, new RegExp(`name: '${wireName}'`));
    assert.match(
      body,
      new RegExp(`const \\{ requestFid \\} = requireAccessRequestResolver\\(tx, '${
        wireName === 'access_request_get_status_v1' ? 'status' : 'submit'
      }'\\)`),
    );
    assert.doesNotMatch(body, /\{\s*fid:\s*t\.u64\(\)/);
    assert.doesNotMatch(body, /requireAdmin|requireAllowedFid|requireAdmittedPlayer/);
  }
  assert.match(reducer, /status: 'not_requested'/);
  assert.match(reducer, /status: 'requested'/);
  assert.match(reducer, /status: 'already_admitted'/);
});

test('submission is admission-cycle idempotent, database-timestamped, and mutation-isolated', () => {
  const reducer = source('../src/reducers/accessRequests.ts');
  const status = section(
    reducer,
    'export const accessRequestGetStatusV1',
    '/**\n * Atomic, cycle-idempotent request submission.',
  );
  const submit = section(
    reducer,
    'export const accessRequestSubmitV1',
    '/**\n * Bounded, deterministic Hermes-only inspection.',
  );
  const admin = section(
    reducer,
    'export const adminListAccessRequestsV1',
    '/**\n * Exact admin-private pre/post view',
  );

  assert.doesNotMatch(status, /\.(?:insert|update|delete)\s*\(/);
  assert.match(submit, /let request = tx\.db\.accessRequestV1\.fid\.find\(requestFid\)/);
  assert.match(
    submit,
    /accessRequestQueueAcceptsSubmission\(requestCount, request !== null\)/,
  );
  assert.match(submit, /if \(request === null\)[\s\S]*tx\.db\.accessRequestV1\.insert\(\{/);
  assert.match(submit, /fid: requestFid,[\s\S]*requestCycle,[\s\S]*requestedAt: tx\.timestamp/);
  assert.match(
    submit,
    /else if \(request\.requestCycle !== requestCycle\)[\s\S]*accessRequestV1\.fid\.update\(\{/,
  );
  assert.doesNotMatch(submit, /\.delete\s*\(/);
  assert.doesNotMatch(
    submit,
    /tx\.db\.(?:allowedFid|adminAudit|castle|player|playerV2|playerOwnershipV2|realmProfileV1|resourceAccountV1|castleWorkerV1)\.(?:insert|update|delete)/,
  );
  assert.doesNotMatch(admin, /\.(?:insert|update|delete)\s*\(/);
});

test('Hermes listing is admin-only, bounded, deterministic, and derives resolution state', () => {
  const reducer = source('../src/reducers/accessRequests.ts');
  const admin = section(
    reducer,
    'export const adminListAccessRequestsV1',
    '/**\n * Exact admin-private pre/post view',
  );

  assert.match(admin, /requireAdmin\(tx\)/);
  assert.match(admin, /limit < 1[\s\S]*limit > MAX_ACCESS_REQUEST_PAGE_SIZE/);
  assert.match(reducer, /const MAX_ACCESS_REQUEST_PAGE_SIZE = 100/);
  assert.match(
    admin,
    /totalRequests > BigInt\(ACCESS_REQUEST_QUEUE_CAPACITY\)/,
  );
  assert.match(admin, /takeBoundedAccessRequestRows\([\s\S]*accessRequestV1\.iter\(\)/);
  assert.match(admin, /const allowed = tx\.db\.allowedFid\.fid\.find\(row\.fid\)/);
  assert.match(admin, /resolveAdmissionState\(allowed\)/);
  assert.match(admin, /requestState = requestCycle !== undefined && row\.requestCycle === requestCycle/);
  assert.match(admin, /if \(!includeResolved && requestState !== 'pending'\) return \[\]/);
  assert.match(admin, /left\.requestedAtMicros < right\.requestedAtMicros/);
  assert.match(admin, /left\.fid < right\.fid/);
  assert.match(admin, /entry\.requestedAtMicros === afterRequestedAtMicros[\s\S]*entry\.fid > afterFid/);
  assert.match(admin, /const hasMore = remaining\.length > entries\.length/);
  assert.match(admin, /totalRequests,/);
  assert.match(admin, /pendingRequests/);
});

test('admin reset is exact-CAS, idempotent, audited, and mutation-isolated', () => {
  const reducer = source('../src/reducers/accessRequests.ts');
  const statusProduct = section(
    reducer,
    "const adminAccessRequestResetStatusV1 = t.object('AdminAccessRequestResetStatusV1'",
    '\n});',
  );
  assert.deepEqual(
    [...statusProduct.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1]),
    [
      'admissionState',
      'authEpoch',
      'requestState',
      'requestCycle',
      'requestedAtMicros',
    ],
  );

  const status = section(
    reducer,
    'export const adminGetAccessRequestResetStatusV1',
    '/**\n * Owner-only reset',
  );
  const reset = reducer.slice(reducer.indexOf('export const adminResetAccessRequestV1'));
  assert.match(status, /requireAdmin\(tx\)/);
  assert.match(status, /requireSupportedFid\(fid\)/);
  assert.doesNotMatch(status, /\.(?:insert|update|delete)\s*\(/);

  assert.match(reset, /name: 'admin_reset_access_request_v1'/);
  assert.match(reset, /expectedEnabled: t\.bool\(\)/);
  assert.match(reset, /expectedAuthEpoch: t\.u32\(\)/);
  assert.match(reset, /expectedRequestCycle: t\.option\(t\.u64\(\)\)/);
  assert.match(reset, /expectedRequestedAtMicros: t\.option\(t\.u64\(\)\)/);
  assert.match(reset, /requireAdmin\(ctx\)/);
  assert.match(reset, /requireFounderAuthEpoch\(existing\.authEpoch\)/);
  assert.match(reset, /existing\.authEpoch !== expectedAuthEpoch/);
  assert.match(reset, /request\.requestCycle !== expectedRequestCycle/);
  assert.match(reset, /requestedAtMicros\(request\) !== expectedRequestedAtMicros/);
  assert.match(
    reset,
    /const exactCommittedRequestDeletionRetry = !existing\.enabled[\s\S]*expectedRequestCycle !== undefined/,
  );
  assert.match(reset, /!exactCommittedRequestDeletionRetry[\s\S]*existing\.enabled !== expectedEnabled/);
  assert.match(
    reset,
    /if \(exactCommittedRequestDeletionRetry \|\| \(!expectedEnabled && request === null\)\) return/,
  );
  assert.match(reset, /allowedFid\.fid\.update\(\{/);
  assert.match(reset, /accessRequestV1\.fid\.delete\(fid\)/);
  assert.match(reset, /action: 'reset_access_request_v1'/);
  assert.doesNotMatch(
    reset,
    /(?:ctx|tx)\.db\.(?:castle|castleSlotClaimV1|player|playerV2|playerOwnershipV2|realmProfileV1|markAccountV1|alphaTermsAcceptanceV1|resourceAccountV1|castleWorkerV1|workerAssignmentV1|workerNodeOccupationV1|workerAssignmentScheduleV1|workerCommandIdempotencyV1|dailyMarkGrantV1)\.(?:insert|update|delete)/,
  );
});

test('queue capacity rejects only first inserts and bounds materialization', () => {
  assert.equal(ACCESS_REQUEST_QUEUE_CAPACITY, 4_096);
  assert.equal(accessRequestQueueAcceptsSubmission(1n, false, 2), true);
  assert.equal(accessRequestQueueAcceptsSubmission(2n, false, 2), false);
  assert.equal(accessRequestQueueAcceptsSubmission(2n, true, 2), true);
  assert.equal(accessRequestQueueAcceptsSubmission(3n, true, 2), true);

  let reads = 0;
  const result = takeBoundedAccessRequestRows((function* rows() {
    for (let index = 0; index < 10; index += 1) {
      reads += 1;
      yield index;
    }
  }()), 2);
  assert.deepEqual(result.rows, [0, 1]);
  assert.equal(result.overflow, true);
  assert.equal(reads, 3);
});

test('disabled founders receive a fresh review cycle without gaining authority', () => {
  const reducer = source('../src/reducers/accessRequests.ts');
  const cycle = section(
    reducer,
    'function requestCycleForAdmission(',
    '\n}\n\nfunction statusForRow',
  );
  const submit = section(
    reducer,
    'export const accessRequestSubmitV1',
    '/**\n * Bounded, deterministic Hermes-only inspection.',
  );

  assert.match(cycle, /if \(state === 'enabled'\) return undefined/);
  assert.match(cycle, /if \(state === 'missing'\) return 0n/);
  assert.match(cycle, /BigInt\(allowed\.authEpoch\) \+ 1n/);
  assert.doesNotMatch(reducer, /ACCESS_REQUEST_NOT_ELIGIBLE/);
  assert.doesNotMatch(submit, /tx\.db\.allowedFid\.(?:insert|update|delete)/);
});

test('all new versioned wires are pinned and no private table binding is generated', () => {
  const schema = source('../src/schema.ts');
  const explicitNames = section(schema, 'for (const name of [', ']) {');
  for (const name of [
    'access_request_get_status_v1',
    'access_request_submit_v1',
    'admin_list_access_requests_v1',
    'admin_get_access_request_reset_status_v1',
    'admin_reset_access_request_v1',
  ]) {
    assert.equal(explicitNames.match(new RegExp(`'${name}'`, 'g'))?.length, 1);
  }

  const moduleIndex = source('../src/index.ts');
  assert.match(moduleIndex, /accessRequestGetStatusV1/);
  assert.match(moduleIndex, /accessRequestSubmitV1/);
  assert.match(moduleIndex, /adminListAccessRequestsV1/);
  assert.match(moduleIndex, /adminGetAccessRequestResetStatusV1/);
  assert.match(moduleIndex, /adminResetAccessRequestV1/);
  assert.equal(
    existsSync(new URL('../../src/spacetime/module_bindings/admin_get_access_request_reset_status_v_1_procedure.ts', import.meta.url)),
    true,
  );
  assert.equal(
    existsSync(new URL('../../src/spacetime/module_bindings/admin_reset_access_request_v_1_reducer.ts', import.meta.url)),
    true,
  );
  assert.equal(
    existsSync(new URL('../../src/spacetime/module_bindings/access_request_v_1_table.ts', import.meta.url)),
    false,
  );
});
