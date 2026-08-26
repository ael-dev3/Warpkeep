import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateAdmissionEpoch,
  resolveAuthResolverAdmission,
} from '../src/admissionPolicy';
import {
  GENESIS_001_ACCESS_POLICY,
  requireGenesis001AccessRequestSubmissionEnabled,
  requireGenesis001AdmissionStateMutationEnabled,
  requireGenesis001PlayerAccessEnabled,
} from '../src/genesis001AccessPolicy';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = resolve(testDirectory, '../src');

function source(path: string): string {
  return readFileSync(resolve(testDirectory, path), 'utf8');
}

function exportedSection(text: string, exportName: string): string {
  const marker = `export const ${exportName} =`;
  const start = text.indexOf(marker);
  const end = text.indexOf('\nexport const ', start + marker.length);
  assert.ok(start >= 0, `missing source section ${exportName}`);
  return text.slice(start, end < 0 ? text.length : end);
}

function functionSection(text: string, functionName: string, endMarker: string): string {
  const marker = `function ${functionName}(`;
  const start = text.indexOf(marker);
  const end = text.indexOf(endMarker, start + marker.length);
  assert.ok(start >= 0 && end > start, `missing source function ${functionName}`);
  return text.slice(start, end);
}

function allTypeScriptSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return allTypeScriptSources(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function assertPolicyError(code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'Genesis001AccessPolicyError');
    assert.equal(error.message, code);
    assert.equal((error as Error & { code?: unknown }).code, code);
    return true;
  };
}

test('Genesis 001 release 0.3.43 seals population changes while retaining player access', () => {
  assert.deepEqual(GENESIS_001_ACCESS_POLICY, {
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
  });
  assert.doesNotThrow(() => requireGenesis001PlayerAccessEnabled());
  assert.deepEqual(resolveAuthResolverAdmission({ enabled: true, authEpoch: 7 }), {
    state: 'enabled',
    authEpoch: 7,
  });
  assert.equal(
    evaluateAdmissionEpoch({ enabled: true, authEpoch: 7 }, 7),
    'current',
  );
});

test('Genesis 001 exposes an exact read-only live access-policy receipt', () => {
  const reducer = source('../src/reducers/genesis001AccessPolicy.ts');
  const index = source('../src/index.ts');
  const schema = source('../src/schema.ts');

  assert.match(
    reducer,
    /const genesis001AccessPolicyReceiptV1 = t\.object\('Genesis001AccessPolicyV1', \{[\s\S]*realmId: t\.string\(\),[\s\S]*releaseVersion: t\.string\(\),[\s\S]*playerAccessEnabled: t\.bool\(\),[\s\S]*admissionStateMutationsEnabled: t\.bool\(\),[\s\S]*accessRequestSubmissionsEnabled: t\.bool\(\),[\s\S]*\}\);/,
  );
  const procedure = exportedSection(reducer, 'genesis001AccessPolicyV1');
  assert.match(procedure, /name: 'genesis_001_access_policy_v1'/);
  assert.match(procedure, /requireWarpkeepMetadataConnection\(tx\)/);
  assert.match(procedure, /return GENESIS_001_ACCESS_POLICY/);
  assert.doesNotMatch(procedure, /tx\.db\./);
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/);
  assert.match(
    index,
    /export \{\s*genesis001AccessPolicyV1,\s*\} from '\.\/reducers\/genesis001AccessPolicy';/,
  );
  assert.equal(
    schema.match(/'genesis_001_access_policy_v1'/g)?.length,
    1,
  );
});

test('enabled-player admission remains policy-bound before its first table read', () => {
  const auth = source('../src/auth.ts');
  const start = auth.indexOf('export function requireAllowedFid(');
  const end = auth.indexOf('export function requireAdmittedPlayer(', start);
  assert.ok(start >= 0 && end > start);
  const allowedFidGate = auth.slice(start, end);
  const authenticated = allowedFidGate.indexOf('requireWarpkeepJwt(ctx)');
  const guarded = allowedFidGate.indexOf('requireGenesis001PlayerAccessEnabled()');
  const tableRead = allowedFidGate.indexOf('ctx.db.allowedFid.fid.find(claims.fid)');

  assert.ok(authenticated >= 0);
  assert.ok(guarded > authenticated);
  assert.ok(tableRead > guarded);
});

test('sealed policy guards abort before simulated table or audit effects', () => {
  for (const [guard, code] of [
    [requireGenesis001AdmissionStateMutationEnabled, 'ADMISSIONS_SEALED'],
    [requireGenesis001AccessRequestSubmissionEnabled, 'ACCESS_REQUESTS_SEALED'],
  ] as const) {
    const effects: string[] = [];
    assert.throws(
      () => {
        guard();
        effects.push('table-write');
        effects.push('audit-write');
      },
      assertPolicyError(code),
    );
    assert.deepEqual(effects, []);
  }
});

test('every admission and request writer remains exhaustively known', () => {
  const mutations = new Map<string, number>();
  const mutationPattern = /\b(?:ctx|tx)\.db\.(allowedFid|accessRequestV1)(?:\.fid)?\.(insert|update|delete)\s*\(/g;

  for (const path of allTypeScriptSources(sourceDirectory)) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(mutationPattern)) {
      const key = `${relative(sourceDirectory, path)}:${match[1]}:${match[2]}`;
      mutations.set(key, (mutations.get(key) ?? 0) + 1);
    }
  }

  assert.deepEqual(
    [...mutations.entries()].sort(([left], [right]) => left.localeCompare(right)),
    [
      ['reducers/accessRequests.ts:accessRequestV1:delete', 1],
      ['reducers/accessRequests.ts:accessRequestV1:insert', 1],
      ['reducers/accessRequests.ts:accessRequestV1:update', 1],
      ['reducers/accessRequests.ts:allowedFid:update', 1],
      ['reducers/admin.ts:allowedFid:insert', 1],
      ['reducers/admin.ts:allowedFid:update', 4],
    ],
  );
});

test('all seven admission-state reducers guard before their first mutation boundary', () => {
  const admin = source('../src/reducers/admin.ts');
  const accessRequests = source('../src/reducers/accessRequests.ts');
  const admissionReducers = [
    'adminAllowFid',
    'adminAdmitFounderV1',
    'adminAllowFidForAccessRequestV1',
    'adminAdmitFounderForAccessRequestV2',
    'adminDisableFid',
    'adminBumpAuthEpoch',
  ] as const;

  for (const reducerName of admissionReducers) {
    const reducer = exportedSection(admin, reducerName);
    const authenticated = reducer.indexOf('requireAdmin(ctx)');
    const guarded = reducer.indexOf('requireGenesis001AdmissionStateMutationEnabled()');
    const directMutation = reducer.search(
      /\bctx\.db\.[A-Za-z0-9_.]+\.(?:insert|update|delete)\s*\(/,
    );
    const transition = reducer.indexOf('applyAllowedFidTransition(ctx');
    const boundaries = [directMutation, transition].filter(index => index >= 0);
    assert.ok(authenticated >= 0, `${reducerName} must authenticate its administrator`);
    assert.ok(guarded > authenticated, `${reducerName} must seal after authentication`);
    assert.ok(boundaries.length > 0, `${reducerName} must retain a mutation boundary`);
    assert.ok(
      guarded < Math.min(...boundaries),
      `${reducerName} must seal before its first mutation boundary`,
    );
  }

  const reset = exportedSection(accessRequests, 'adminResetAccessRequestV1');
  const resetAuthenticated = reset.indexOf('requireAdmin(ctx)');
  const resetGuarded = reset.indexOf('requireGenesis001AdmissionStateMutationEnabled()');
  const resetMutation = reset.search(
    /\bctx\.db\.[A-Za-z0-9_.]+\.(?:insert|update|delete)\s*\(/,
  );
  assert.ok(resetAuthenticated >= 0);
  assert.ok(resetGuarded > resetAuthenticated);
  assert.ok(resetMutation > resetGuarded);
});

test('shared admission writer and applicant submission fail closed before writes', () => {
  const admin = source('../src/reducers/admin.ts');
  const transition = functionSection(
    admin,
    'applyAllowedFidTransition',
    '\n}\n\n/**\n * Exact access-request compare-and-swap guard',
  );
  assert.ok(
    transition.indexOf('requireGenesis001AdmissionStateMutationEnabled()')
      < transition.search(/\bctx\.db\.allowedFid/),
  );

  const accessRequests = source('../src/reducers/accessRequests.ts');
  const submit = exportedSection(accessRequests, 'accessRequestSubmitV1');
  const authenticated = submit.indexOf("requireAccessRequestResolver(tx, 'submit')");
  const guarded = submit.indexOf('requireGenesis001AccessRequestSubmissionEnabled()');
  const tableAccess = submit.indexOf('tx.db.allowedFid.fid.find(requestFid)');
  assert.ok(authenticated >= 0);
  assert.ok(guarded > authenticated);
  assert.ok(tableAccess > guarded);
});
