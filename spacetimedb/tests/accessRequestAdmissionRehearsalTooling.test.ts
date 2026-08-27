import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('CI executes the focused real-module admission suspension rehearsal before the general proof', () => {
  const packageJson = JSON.parse(source('../../package.json')) as {
    scripts?: Record<string, string>;
  };
  const workflow = source('../../.github/workflows/verify.yml');
  const command = 'npm run stdb:verify-admission-cas-rehearsal';

  assert.equal(
    packageJson.scripts?.['stdb:verify-admission-cas-rehearsal'],
    'node scripts/verify-admission-request-cas-rehearsal.mjs',
  );
  assert.match(workflow, /npm run stdb:verify-access-request-migration/);
  assert.match(workflow, /npm run stdb:verify-admission-cas-rehearsal/);
  assert.match(workflow, /npm run stdb:verify-additive-migration/);
  assert.ok(workflow.indexOf(command) < workflow.indexOf('npm run stdb:verify-additive-migration'));
});

test('admission suspension rehearsal is loopback-only, disposable, pinned, and deletion-disabled', () => {
  const proof = source('../../scripts/verify-admission-request-cas-rehearsal.mjs');

  assert.match(proof, /expectedCliVersion = '2\.6\.1'/);
  assert.match(proof, /052c83fe984a4c4eb7bb4f9afa5c6b1903891d87/);
  assert.match(proof, /rehearsalTimeoutMilliseconds = 300_000/);
  assert.match(proof, /127\.0\.0\.1/);
  assert.match(proof, /'--in-memory'/);
  assert.match(proof, /spacetimedb\/migration-fixtures\/current-candidate-inspection/);
  assert.doesNotMatch(proof, /spacetimedb\/migration-fixtures\/additive-v17-schema/);
  assert.doesNotMatch(proof, /spacetimedb\/migration-fixtures\/additive-v16-schema/);
  assert.match(proof, /mkdtempSync\(join\(tmpdir\(\), 'warpkeep-admission-cas-'/);
  assert.match(proof, /mode: 0o600/);
  assert.match(proof, /'--delete-data=never'/);
  assert.match(proof, /value\.startsWith\('--delete-data='/);
  assert.doesNotMatch(proof, /--delete-data=(?:always|on-conflict|if-required)/);
  assert.match(proof, /arguments_\.includes\('--break-clients'\)/);
  assert.doesNotMatch(proof, /arguments_\.push\('--break-clients'\)/);
  assert.match(proof, /cleanupMigrationProofResources/);
  assert.match(proof, /containServerProcessErrors/);
});

test('admission rehearsal rejects every request and admission writer without mutation', () => {
  const proof = source('../../scripts/verify-admission-request-cas-rehearsal.mjs');

  for (const mutation of [
    'access_request_submit_v1',
    'admin_allow_fid',
    'admin_admit_founder_v1',
    'admin_allow_fid_for_access_request_v1',
    'admin_admit_founder_for_access_request_v2',
    'admin_disable_fid',
    'admin_bump_auth_epoch',
    'admin_reset_access_request_v1',
  ]) assert.match(proof, new RegExp(`name: '${mutation}'`));

  assert.match(
    proof,
    /expectedStatus: 500,[\s\S]*expectedError: 'ACCESS_REQUESTS_SEALED'/,
  );
  assert.equal((proof.match(/expectedStatus: 530/g) ?? []).length, 7);
  assert.equal((proof.match(/expectedError: 'ADMISSIONS_SEALED'/g) ?? []).length, 7);
  assert.match(proof, /sealedMutations\.length !== 8/);
  assert.match(proof, /new Set\(sealedMutations\.map/);
  assert.match(proof, /if \(rejectedMutations !== 8\)/);
  assert.match(proof, /The module instance encountered a fatal error/);
  assert.match(proof, /if \(responseBody !== expectedBody\)/);
  assert.match(proof, /const baseline = await inspectState\(\)/);
  assert.match(proof, /const after = await inspectState\(\)/);
  assert.match(proof, /if \(after !== baseline\)/);
  assert.match(proof, /Admission suspension attempt mutated state/);
  assert.doesNotMatch(proof, /first-exact-admission|exact-reenable/);
});

test('admission rehearsal binds the frozen policy, read-only status, and complete state digest', () => {
  const proof = source('../../scripts/verify-admission-request-cas-rehearsal.mjs');

  for (const table of [
    'allowed_fid',
    'castle',
    'castle_slot_claim_v1',
    'realm_profile_v1',
    'mark_account_v1',
    'resource_account_v1',
    'realm_worker_system_v1',
    'castle_worker_v1',
    'worker_assignment_v1',
    'worker_node_occupation_v1',
    'worker_command_idempotency_v1',
    'worker_assignment_schedule_v_1',
    'admin_audit',
  ]) assert.match(proof, new RegExp(table));

  assert.match(proof, /genesis_001_access_policy_v1/);
  assert.match(proof, /access_request_get_status_v1/);
  assert.match(proof, /admin_get_access_request_admission_status_v1/);
  assert.match(proof, /realmId: 'GENESIS_001'/);
  assert.match(proof, /releaseVersion: '0\.3\.43'/);
  assert.match(proof, /playerAccessEnabled: true/);
  assert.match(proof, /admissionStateMutationsEnabled: false/);
  assert.match(proof, /accessRequestSubmissionsEnabled: false/);
  assert.match(proof, /8\/8 mutation surfaces rejected/);
});
