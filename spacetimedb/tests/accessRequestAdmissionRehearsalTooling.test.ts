import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('CI executes the focused real-module request-CAS rehearsal before the general proof', () => {
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

test('request-CAS rehearsal is loopback-only, disposable, pinned, and deletion-disabled', () => {
  const proof = source('../../scripts/verify-admission-request-cas-rehearsal.mjs');

  assert.match(proof, /expectedCliVersion = '2\.6\.1'/);
  assert.match(proof, /052c83fe984a4c4eb7bb4f9afa5c6b1903891d87/);
  assert.match(proof, /rehearsalTimeoutMilliseconds = 300_000/);
  assert.match(proof, /127\.0\.0\.1/);
  assert.match(proof, /'--in-memory'/);
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

test('request-CAS rehearsal executes exact first admission and re-enable failures and commits', () => {
  const proof = source('../../scripts/verify-admission-request-cas-rehearsal.mjs');

  assert.match(proof, /admin_get_access_request_admission_status_v1/);
  assert.match(proof, /admin_admit_founder_for_access_request_v2/);
  assert.match(proof, /admin_allow_fid_for_access_request_v1/);
  assert.match(proof, /admin_stage_worker_system_v1/);
  assert.match(proof, /\['warpkeep-access-request-resolver'\],[\s\S]{0,40}15/);
  assert.match(proof, /requestCycle: 0n/);
  assert.match(proof, /requestCycle: 2n/);
  assert.match(proof, /requestCycle: 1n/);
  assert.match(proof, /requestedAtMicros: firstTuple\.requestedAtMicros \+ 1n/);
  assert.match(proof, /requestedAtMicros: disabledTuple\.requestedAtMicros \+ 1n/);
  assert.match(proof, /DELETE FROM access_request_v1 WHERE fid/);
  assert.match(proof, /Stale replaced missing-FID request tuple mutated state/);
  assert.match(proof, /First request-CAS admission retry duplicated founder state/);
  assert.match(proof, /Request-CAS re-enable retry duplicated or changed state/);
  assert.ok((proof.match(/expectedStatus|530/g) ?? []).length > 6);
});

test('request-CAS rehearsal binds permanent graphs, exact workers, audits, and epochs', () => {
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

  assert.match(proof, /workers: 4n/);
  assert.match(proof, /enabled = true AND auth_epoch = 1/);
  assert.match(proof, /enabled = false AND auth_epoch = 1/);
  assert.match(proof, /enabled = true AND auth_epoch = 2/);
  assert.match(proof, /'admit_founder_for_access_request_v2'/);
  assert.match(proof, /'allow_fid_for_access_request_v1'/);
  assert.match(proof, /'disable_fid'/);
  assert.match(proof, /SELECT action, target_fid, actor_subject FROM admin_audit/);
  assert.match(proof, /projection\.includes\('service:hermes'\)/);
  assert.match(proof, /projection\.includes\(String\(founderFid\)\)/);
  assert.match(proof, /await inspectGraph\(\) !== foundedGraphDigest/);
});
