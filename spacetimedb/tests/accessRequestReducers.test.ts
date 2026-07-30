import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

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
  const currentRegistrations = registrations(schema, 'const warpkeep = schema({');
  const v12Registrations = registrations(v12, 'const db = schema({');

  assert.equal(v12Registrations.length, 53);
  assert.deepEqual(currentRegistrations.slice(0, 53), v12Registrations);
  assert.deepEqual(currentRegistrations.slice(53), ['accessRequestV1']);

  const definition = section(
    schema,
    'export const accessRequestV1 = table(',
    '\n);',
  );
  assert.match(definition, /\{ name: 'access_request_v1' \}/);
  assert.doesNotMatch(definition, /public:\s*true|indexes:|status|note|source|username|pfp|wallet/i);
  assert.deepEqual(
    [...definition.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1]),
    ['fid', 'requestedAt'],
  );
  assert.match(definition, /fid: t\.u64\(\)\.primaryKey\(\)/);
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
    '/**\n * Atomic, idempotent request submission.',
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
    assert.match(body, /const \{ requestFid \} = requireAccessRequestResolver\(tx\)/);
    assert.doesNotMatch(body, /\{\s*fid:\s*t\.u64\(\)/);
    assert.doesNotMatch(body, /requireAdmin|requireAllowedFid|requireAdmittedPlayer/);
  }
  assert.match(reducer, /status: 'not_requested'/);
  assert.match(reducer, /status: 'requested'/);
  assert.match(reducer, /status: 'already_admitted'/);
});

test('submission is primary-key idempotent, database-timestamped, and mutation-isolated', () => {
  const reducer = source('../src/reducers/accessRequests.ts');
  const status = section(
    reducer,
    'export const accessRequestGetStatusV1',
    '/**\n * Atomic, idempotent request submission.',
  );
  const submit = section(
    reducer,
    'export const accessRequestSubmitV1',
    '/**\n * Bounded, deterministic Hermes-only inspection.',
  );
  const admin = reducer.slice(reducer.indexOf('export const adminListAccessRequestsV1'));

  assert.doesNotMatch(status, /\.(?:insert|update|delete)\s*\(/);
  assert.match(submit, /let request = tx\.db\.accessRequestV1\.fid\.find\(requestFid\)/);
  assert.match(submit, /if \(request === null\)[\s\S]*tx\.db\.accessRequestV1\.insert\(\{/);
  assert.match(submit, /fid: requestFid,[\s\S]*requestedAt: tx\.timestamp/);
  assert.doesNotMatch(submit, /\.(?:update|delete)\s*\(/);
  assert.doesNotMatch(
    submit,
    /tx\.db\.(?:allowedFid|adminAudit|castle|player|playerV2|playerOwnershipV2|realmProfileV1|resourceAccountV1|castleWorkerV1)\.(?:insert|update|delete)/,
  );
  assert.doesNotMatch(admin, /\.(?:insert|update|delete)\s*\(/);
});

test('Hermes listing is admin-only, bounded, deterministic, and derives resolution state', () => {
  const reducer = source('../src/reducers/accessRequests.ts');
  const admin = reducer.slice(reducer.indexOf('export const adminListAccessRequestsV1'));

  assert.match(admin, /requireAdmin\(tx\)/);
  assert.match(admin, /limit < 1[\s\S]*limit > MAX_ACCESS_REQUEST_PAGE_SIZE/);
  assert.match(reducer, /const MAX_ACCESS_REQUEST_PAGE_SIZE = 100/);
  assert.match(admin, /resolveAdmissionState\(tx\.db\.allowedFid\.fid\.find\(row\.fid\)\)/);
  assert.match(admin, /if \(!includeResolved && admissionState !== 'missing'\) return \[\]/);
  assert.match(admin, /left\.requestedAtMicros < right\.requestedAtMicros/);
  assert.match(admin, /left\.fid < right\.fid/);
  assert.match(admin, /entry\.requestedAtMicros === afterRequestedAtMicros[\s\S]*entry\.fid > afterFid/);
  assert.match(admin, /const hasMore = remaining\.length > entries\.length/);
  assert.match(admin, /totalRequests: BigInt\(rows\.length\)/);
  assert.match(admin, /pendingRequests/);
});

test('all new versioned wires are pinned and no private table binding is generated', () => {
  const schema = source('../src/schema.ts');
  const explicitNames = section(schema, 'for (const name of [', ']) {');
  for (const name of [
    'access_request_get_status_v1',
    'access_request_submit_v1',
    'admin_list_access_requests_v1',
  ]) {
    assert.equal(explicitNames.match(new RegExp(`'${name}'`, 'g'))?.length, 1);
  }

  const moduleIndex = source('../src/index.ts');
  assert.match(moduleIndex, /accessRequestGetStatusV1/);
  assert.match(moduleIndex, /accessRequestSubmitV1/);
  assert.match(moduleIndex, /adminListAccessRequestsV1/);
  assert.equal(
    existsSync(new URL('../../src/spacetime/module_bindings/access_request_v_1_table.ts', import.meta.url)),
    false,
  );
});
