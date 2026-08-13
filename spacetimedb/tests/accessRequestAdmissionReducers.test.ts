import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `missing source section ${startMarker}`);
  return text.slice(start, end);
}

test('request-CAS admission guard compares the complete immutable tuple before writes', () => {
  const admin = source('../src/reducers/admin.ts');
  const guard = section(
    admin,
    'function requireExactAccessRequest(',
    '\n}\n\nfunction assertExactGenesisDynamicGraph',
  );

  assert.match(guard, /accessRequestV1\.fid\.find\(fid\)/);
  assert.match(guard, /request\?\.requestedAt\.microsSinceUnixEpoch/);
  assert.match(guard, /expectedRequestCycle !== requiredRequestCycle/);
  assert.match(guard, /request\.requestCycle !== expectedRequestCycle/);
  assert.match(guard, /storedRequestedAtMicros <= 0n/);
  assert.match(guard, /storedRequestedAtMicros !== expectedRequestedAtMicros/);
  assert.match(guard, /ACCESS_REQUEST_ADMISSION_CAS_MISMATCH/);
  assert.doesNotMatch(guard, /\.(?:insert|update|delete)\s*\(/);
});

test('admin admission status is an exact read-only view for missing and existing FIDs', () => {
  const requests = source('../src/reducers/accessRequests.ts');
  const status = section(
    requests,
    'function adminAdmissionStatus(',
    '/**\n * Caller-private status.',
  );
  assert.match(status, /const admissionState = resolveAdmissionState\(allowed\)/);
  assert.match(status, /let authEpoch = 0/);
  assert.match(status, /allowed\.authEpoch < 1/);
  assert.match(status, /allowed\.authEpoch > MAX_AUTH_EPOCH/);
  assert.match(status, /assertGenesisFounderForFid\(tx, fid\)/);
  assert.match(status, /assertGenesisResourceForFid\(tx, fid\)/);
  assert.match(status, /requestCycleForAdmission\(allowed, admissionState\)/);
  assert.match(status, /request\.requestCycle > maximumStoredRequestCycle/);
  assert.match(status, /'not_requested'/);
  assert.match(status, /'pending'/);
  assert.match(status, /'resolved'/);
  assert.doesNotMatch(status, /\.(?:insert|update|delete)\s*\(/);

  const procedure = section(
    requests,
    'export const adminGetAccessRequestAdmissionStatusV1',
    '/**\n * Exact admin-private pre/post view',
  );
  assert.match(procedure, /name: 'admin_get_access_request_admission_status_v1'/);
  assert.match(procedure, /requireAdmin\(tx\)/);
  assert.match(procedure, /requireSupportedFid\(fid\)/);
  assert.match(procedure, /return adminAdmissionStatus\(tx, fid\)/);
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/);
});

test('existing-founder request CAS requires disabled state and preserves permanent graphs', () => {
  const admin = source('../src/reducers/admin.ts');
  const reducer = section(
    admin,
    'export const adminAllowFidForAccessRequestV1',
    '/**\n * Owner-only first-founding request CAS',
  );

  assert.match(reducer, /name: 'admin_allow_fid_for_access_request_v1'/);
  assert.match(reducer, /expectedRequestCycle: t\.u64\(\)/);
  assert.match(reducer, /expectedRequestedAtMicros: t\.u64\(\)/);
  assert.match(reducer, /existing === null/);
  assert.match(reducer, /existing\.enabled/);
  assert.match(reducer, /BigInt\(existing\.authEpoch\) \+ 1n/);
  assert.ok(
    reducer.indexOf('requireExactAccessRequest(')
      < reducer.indexOf('applyAllowedFidTransition(ctx'),
  );
  assert.match(reducer, /auditAction: 'allow_fid_for_access_request_v1'/);
  assert.equal(reducer.match(/assertGenesisFounderForFid\(ctx, fid\)/g)?.length, 2);
  assert.equal(reducer.match(/assertGenesisResourceForFid\(ctx, fid\)/g)?.length, 2);
  assert.match(reducer, /grantDailyMarkIfActive\(ctx, fid\)/);
  assert.doesNotMatch(reducer, /ensureGenesisFounder/);
});

test('first-time request CAS requires absent admission and exact cycle zero', () => {
  const admin = source('../src/reducers/admin.ts');
  const reducer = section(
    admin,
    'export const adminAdmitFounderForAccessRequestV2',
    '/** Burn and wallet-attribution mutation wires',
  );

  assert.match(reducer, /name: 'admin_admit_founder_for_access_request_v2'/);
  assert.match(reducer, /expectedRequestCycle: t\.u64\(\)/);
  assert.match(reducer, /expectedRequestedAtMicros: t\.u64\(\)/);
  assert.match(reducer, /normalizeAdmissionReadyTrustedProfile\(input\)/);
  assert.match(reducer, /allowedFid\.fid\.find\(input\.fid\) !== null/);
  assert.match(
    reducer,
    /requireExactAccessRequest\([\s\S]*input\.expectedRequestCycle,[\s\S]*input\.expectedRequestedAtMicros,[\s\S]*0n/,
  );
  assert.ok(
    reducer.indexOf('requireExactAccessRequest(')
      < reducer.indexOf('applyAllowedFidTransition(ctx'),
  );
  assert.match(reducer, /auditAction: 'admit_founder_for_access_request_v2'/);
  assert.match(reducer, /ensureGenesisFounder\(ctx, input\.fid, normalized\)/);
  assert.match(reducer, /admissionProfileIsComplete\(verifiedProfile\)/);
  assert.match(reducer, /trustedProfilesEqual\(verifiedProfile, normalized\)/);
  assert.match(reducer, /assertGenesisFounderForFid\(ctx, input\.fid\)/);
  assert.match(reducer, /assertGenesisResourceForFid\(ctx, input\.fid\)/);
});

test('request-CAS wires are exported, explicitly pinned, and generated', () => {
  const schema = source('../src/schema.ts');
  const moduleIndex = source('../src/index.ts');
  for (const [wire, sourceName] of [
    ['admin_allow_fid_for_access_request_v1', 'adminAllowFidForAccessRequestV1'],
    ['admin_admit_founder_for_access_request_v2', 'adminAdmitFounderForAccessRequestV2'],
    ['admin_get_access_request_admission_status_v1', 'adminGetAccessRequestAdmissionStatusV1'],
  ] as const) {
    assert.equal(schema.match(new RegExp(`'${wire}'`, 'g'))?.length, 1);
    assert.match(moduleIndex, new RegExp(`\\b${sourceName}\\b`));
  }

  for (const binding of [
    '../../src/spacetime/module_bindings/admin_allow_fid_for_access_request_v_1_reducer.ts',
    '../../src/spacetime/module_bindings/admin_admit_founder_for_access_request_v_2_reducer.ts',
    '../../src/spacetime/module_bindings/admin_get_access_request_admission_status_v_1_procedure.ts',
  ]) {
    assert.equal(existsSync(new URL(binding, import.meta.url)), true);
  }
});
