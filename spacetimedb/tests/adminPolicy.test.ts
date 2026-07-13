import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  InvalidAdmissionEpochStateError,
  evaluateAdmissionEpoch,
  resolveAuthResolverAdmission,
} from '../src/admissionPolicy';
import {
  AuthEpochExhaustedError,
  executeAllowFidTransition,
  planAllowFid,
  type AllowFidPlan,
} from '../src/adminPolicy';
import { MAX_AUTH_EPOCH } from '../src/config';

function enabledPolicy(authEpoch: number) {
  return { enabled: true, authEpoch } as const;
}

function disabledPolicy(authEpoch: number) {
  return { enabled: false, authEpoch } as const;
}

function recordingHandlers(events: string[]) {
  const record = (plan: AllowFidPlan) => events.push(`${plan.kind}:${plan.authEpoch}`);
  return {
    insert: record,
    enabled: record,
    reenabled: record,
    audit: () => events.push('audit'),
  };
}

test('first admission starts at epoch one', () => {
  assert.deepEqual(planAllowFid(null), {
    kind: 'insert',
    enabled: true,
    authEpoch: 1,
  });
});

test('auth resolver exposes exact least-privilege admission states', () => {
  assert.deepEqual(resolveAuthResolverAdmission(null), {
    state: 'missing',
    authEpoch: 0,
  });
  assert.deepEqual(resolveAuthResolverAdmission(disabledPolicy(17)), {
    state: 'disabled',
    authEpoch: 0,
  });
  assert.deepEqual(resolveAuthResolverAdmission(enabledPolicy(17)), {
    state: 'enabled',
    authEpoch: 17,
  });
});

test('auth resolver fails closed for an enabled legacy epoch-zero row', () => {
  assert.throws(
    () => resolveAuthResolverAdmission(enabledPolicy(0)),
    InvalidAdmissionEpochStateError,
  );
});

test('repeated allow while enabled preserves the epoch', () => {
  assert.deepEqual(planAllowFid(enabledPolicy(9)), {
    kind: 'enabled',
    enabled: true,
    authEpoch: 9,
  });
});

test('disable then re-enable increments exactly once', () => {
  const reenabled = planAllowFid(disabledPolicy(9));
  assert.deepEqual(reenabled, {
    kind: 'reenabled',
    enabled: true,
    authEpoch: 10,
  });
  assert.deepEqual(planAllowFid(enabledPolicy(reenabled.authEpoch)), {
    kind: 'enabled',
    enabled: true,
    authEpoch: 10,
  });
});

test('a disabled row can rotate from one below maximum to maximum', () => {
  assert.deepEqual(planAllowFid(disabledPolicy(MAX_AUTH_EPOCH - 1)), {
    kind: 'reenabled',
    enabled: true,
    authEpoch: MAX_AUTH_EPOCH,
  });
});

test('maximum-epoch re-enable fails before state or audit callbacks', () => {
  const existing = disabledPolicy(MAX_AUTH_EPOCH);
  const events: string[] = [];
  assert.throws(
    () => executeAllowFidTransition(existing, recordingHandlers(events)),
    AuthEpochExhaustedError,
  );
  assert.deepEqual(existing, { enabled: false, authEpoch: MAX_AUTH_EPOCH });
  assert.deepEqual(events, []);
});

test('an already-enabled maximum-epoch row remains valid and does not overflow', () => {
  const events: string[] = [];
  assert.deepEqual(
    executeAllowFidTransition(enabledPolicy(MAX_AUTH_EPOCH), recordingHandlers(events)),
    { kind: 'enabled', enabled: true, authEpoch: MAX_AUTH_EPOCH },
  );
  assert.deepEqual(events, [`enabled:${MAX_AUTH_EPOCH}`, 'audit']);
});

test('a retained token from before re-enable resolves to AUTH_EPOCH_MISMATCH', () => {
  const reenabled = planAllowFid(disabledPolicy(4));
  assert.equal(
    evaluateAdmissionEpoch({ enabled: true, authEpoch: reenabled.authEpoch }, 4),
    'epoch_mismatch',
  );
  assert.equal(
    evaluateAdmissionEpoch({ enabled: true, authEpoch: reenabled.authEpoch }, reenabled.authEpoch),
    'current',
  );
});

test('the auth-epoch procedure remains a read-only lookup with no audit mutation', () => {
  const source = readFileSync(new URL('../src/reducers/admin.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export const adminGetFidAuthEpoch');
  const end = source.indexOf('export const authResolverGetFidAdmissionV2', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const procedure = source.slice(start, end);

  assert.match(procedure, /requireAdmin\(tx\)/);
  assert.match(procedure, /requireSupportedFid\(fid\)/);
  assert.match(procedure, /allowedFid\.fid\.find\(fid\)\?\.authEpoch \?\? 0/);
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(procedure, /\baudit\s*\(/);
});

test('the v2 admission resolver is separately protected and leaves the legacy lookup unchanged', () => {
  const source = readFileSync(new URL('../src/reducers/admin.ts', import.meta.url), 'utf8');
  const legacyStart = source.indexOf('export const adminGetFidAuthEpoch');
  const resolverStart = source.indexOf('export const authResolverGetFidAdmissionV2');
  const resolverEnd = source.indexOf('/** Protected and idempotent canonical world seeding.', resolverStart);
  assert.notEqual(legacyStart, -1);
  assert.notEqual(resolverStart, -1);
  assert.notEqual(resolverEnd, -1);

  const legacy = source.slice(legacyStart, resolverStart);
  assert.match(legacy, /requireAdmin\(tx\)/);
  assert.match(legacy, /allowedFid\.fid\.find\(fid\)\?\.authEpoch \?\? 0/);

  const resolver = source.slice(resolverStart, resolverEnd);
  assert.match(resolver, /name: 'auth_resolver_get_fid_admission_v2'/);
  assert.match(resolver, /requireAuthEpochResolver\(tx, fid\)/);
  assert.match(resolver, /resolveAuthResolverAdmission/);
  assert.doesNotMatch(resolver, /requireAdmin\(tx\)/);
  assert.doesNotMatch(resolver, /\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(resolver, /\baudit\s*\(/);
});

test('the additive v2 status is admin-only, aggregate-only, and leaves legacy status intact', () => {
  const source = readFileSync(new URL('../src/reducers/admin.ts', import.meta.url), 'utf8');
  const legacyStart = source.indexOf('export const adminGetAlphaStatus =');
  const v2Start = source.indexOf('export const adminGetAlphaStatusV2 =');
  const v2End = source.indexOf('/**\n * Bridge/Hermes can resolve', v2Start);
  assert.notEqual(legacyStart, -1);
  assert.notEqual(v2Start, -1);
  assert.notEqual(v2End, -1);

  const legacy = source.slice(legacyStart, v2Start);
  assert.match(legacy, /name: 'admin_get_alpha_status'/);
  assert.match(legacy, /players: tx\.db\.player\.count\(\)/);
  assert.doesNotMatch(legacy, /playerV2|playerOwnershipV2/);

  const v2 = source.slice(v2Start, v2End);
  assert.match(v2, /name: 'admin_get_alpha_status_v2'/);
  assert.match(v2, /requireAdmin\(tx\)/);
  assert.match(v2, /legacyPlayers: tx\.db\.player\.count\(\)/);
  assert.match(v2, /playersV2: tx\.db\.playerV2\.count\(\)/);
  assert.match(v2, /playerOwnershipsV2: tx\.db\.playerOwnershipV2\.count\(\)/);
  assert.match(v2, /orphanedPlayerRowsV2/);
  assert.match(v2, /orphanedOwnershipRowsV2/);
  assert.match(v2, /protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION/);
  assert.doesNotMatch(v2, /\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(v2, /\baudit\s*\(/);
  assert.doesNotMatch(v2, /targetFid|actorSubject|\bnote\b|\.identity\b|username|displayName|pfpUrl/);
});
