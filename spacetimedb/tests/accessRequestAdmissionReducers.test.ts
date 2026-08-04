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

test('request-CAS admission uses one exact read-only request tuple guard', () => {
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

test('Hermes exact admission status covers missing and existing identities without mutation', () => {
  const requests = source('../src/reducers/accessRequests.ts');
  const product = section(
    requests,
    "const adminAccessRequestAdmissionStatusV1 = t.object(",
    '\n);\n\n',
  );
  assert.deepEqual(
    [...product.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map(match => match[1]),
    [
      'admissionState',
      'authEpoch',
      'requestState',
      'requestCycle',
      'requestedAtMicros',
    ],
  );
  assert.match(product, /authEpoch: t\.u32\(\)/);
  assert.match(product, /requestCycle: t\.option\(t\.u64\(\)\)/);
  assert.match(product, /requestedAtMicros: t\.option\(t\.u64\(\)\)/);

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
  assert.match(status, /admissionState === 'disabled'/);
  assert.match(status, /BigInt\(authEpoch\) \+ 1n/);
  assert.match(status, /allowed === null && request\.requestCycle !== 0n/);
  assert.match(status, /request\.requestCycle > maximumStoredRequestCycle/);
  assert.match(status, /requestedAtMicros\(request\)/);
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
  assert.match(procedure, /\{ fid: t\.u64\(\) \}/);
  assert.match(procedure, /requireAdmin\(tx\)/);
  assert.match(procedure, /requireSupportedFid\(fid\)/);
  assert.match(procedure, /return adminAdmissionStatus\(tx, fid\)/);
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(procedure, /realmProfileV1|adminAudit|allowedFid\.iter|accessRequestV1\.iter/);
});

test('existing-founder request CAS requires disabled state and preserves the founder graph', () => {
  const admin = source('../src/reducers/admin.ts');
  const reducer = section(
    admin,
    'export const adminAllowFidForAccessRequestV1',
    '/**\n * Owner-only first-founding request CAS',
  );

  assert.match(reducer, /name: 'admin_allow_fid_for_access_request_v1'/);
  assert.match(reducer, /expectedRequestCycle: t\.u64\(\)/);
  assert.match(reducer, /expectedRequestedAtMicros: t\.u64\(\)/);
  assert.match(reducer, /const admin = requireAdmin\(ctx\)/);
  assert.match(reducer, /requireSupportedFid\(fid\)/);
  assert.match(reducer, /existing === null \|\| existing\.enabled/);
  assert.match(reducer, /BigInt\(existing\.authEpoch\) \+ 1n/);
  assert.match(reducer, /requireExactAccessRequest\(/);
  assert.ok(
    reducer.indexOf('requireExactAccessRequest(')
      < reducer.indexOf('applyAllowedFidTransition(ctx'),
  );
  assert.match(reducer, /auditAction: 'allow_fid_for_access_request_v1'/);
  assert.equal(
    reducer.match(/assertGenesisFounderForFid\(ctx, fid\)/g)?.length,
    2,
  );
  assert.equal(
    reducer.match(/assertGenesisResourceForFid\(ctx, fid\)/g)?.length,
    2,
  );
  assert.match(reducer, /grantDailyMarkIfActive\(ctx, fid\)/);
  assert.ok(
    reducer.indexOf('applyAllowedFidTransition(ctx')
      < reducer.indexOf('grantDailyMarkIfActive(ctx, fid)'),
  );
  assert.doesNotMatch(reducer, /ensureGenesisFounder/);
});

test('first-time profiled request CAS requires missing state and cycle zero', () => {
  const admin = source('../src/reducers/admin.ts');
  const reducer = section(
    admin,
    'export const adminAdmitFounderForAccessRequestV2',
    '/** Burn and wallet-attribution mutation wires',
  );

  assert.match(reducer, /name: 'admin_admit_founder_for_access_request_v2'/);
  assert.match(reducer, /expectedRequestCycle: t\.u64\(\)/);
  assert.match(reducer, /expectedRequestedAtMicros: t\.u64\(\)/);
  assert.match(reducer, /canonicalUsername: t\.string\(\)/);
  assert.match(reducer, /pfpUrl: t\.string\(\)/);
  assert.match(reducer, /const admin = requireAdmin\(ctx\)/);
  assert.match(reducer, /requireSupportedFid\(input\.fid\)/);
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
  assert.match(reducer, /grantDailyMarkIfActive\(ctx, input\.fid\)/);
  assert.ok(
    reducer.indexOf('ensureGenesisFounder(ctx, input.fid, normalized)')
      < reducer.indexOf('grantDailyMarkIfActive(ctx, input.fid)'),
  );
});

test('legacy admission reducers remain separate compatibility wires', () => {
  const admin = source('../src/reducers/admin.ts');
  const allow = section(
    admin,
    'export const adminAllowFid =',
    '/**\n * Atomic owner-only founding path.',
  );
  const admit = section(
    admin,
    'export const adminAdmitFounderV1 =',
    '/** Trusted local-operator profile projection',
  );

  assert.match(allow, /name: 'admin_allow_fid'/);
  assert.match(admit, /name: 'admin_admit_founder_v1'/);
  assert.doesNotMatch(allow, /expectedRequestCycle|expectedRequestedAtMicros/);
  assert.doesNotMatch(admit, /expectedRequestCycle|expectedRequestedAtMicros/);
});

test('CAS reducers are exported, explicitly pinned, and represented in generated bindings', () => {
  const schema = source('../src/schema.ts');
  const moduleIndex = source('../src/index.ts');
  for (const [wire, sourceName] of [
    ['admin_allow_fid_for_access_request_v1', 'adminAllowFidForAccessRequestV1'],
    ['admin_admit_founder_for_access_request_v2', 'adminAdmitFounderForAccessRequestV2'],
  ] as const) {
    assert.equal(schema.match(new RegExp(`'${wire}'`, 'g'))?.length, 1);
    assert.match(moduleIndex, new RegExp(`\\b${sourceName}\\b`));
  }

  assert.equal(
    existsSync(new URL('../../src/spacetime/module_bindings/admin_allow_fid_for_access_request_v_1_reducer.ts', import.meta.url)),
    true,
  );
  assert.equal(
    existsSync(new URL('../../src/spacetime/module_bindings/admin_admit_founder_for_access_request_v_2_reducer.ts', import.meta.url)),
    true,
  );

  const procedureWire = 'admin_get_access_request_admission_status_v1';
  assert.equal(schema.match(new RegExp(`'${procedureWire}'`, 'g'))?.length, 1);
  assert.match(moduleIndex, /\badminGetAccessRequestAdmissionStatusV1\b/);
  assert.equal(
    existsSync(new URL('../../src/spacetime/module_bindings/admin_get_access_request_admission_status_v_1_procedure.ts', import.meta.url)),
    true,
  );
});
