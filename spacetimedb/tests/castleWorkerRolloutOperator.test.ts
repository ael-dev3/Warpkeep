import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  CASTLE_WORKER_RESOURCE_STATE_VERSION,
  type WorkerClientAttestation,
} from '../src/castleWorkerRolloutPolicy';
import {
  CASTLE_WORKER_PROTOCOL_CAPABILITY,
} from '../src/castleWorkerPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
} from '../src/resourceAuthorityPolicy';
import {
  WorkerRolloutControlError,
  planWorkerActivation,
  projectWorkerRolloutOperatorStatus,
} from '../../scripts/worker-rollout-controls';

const reviewed: WorkerClientAttestation = Object.freeze({
  capability: CASTLE_WORKER_PROTOCOL_CAPABILITY,
  clientRelease: 'alpha-0.3.15',
  clientArtifactDigest: 'a'.repeat(64),
  sourceCommit: 'b'.repeat(40),
  resourceStateVersion: CASTLE_WORKER_RESOURCE_STATE_VERSION,
  resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
  resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  expectedCastleCount: 2,
  expectedWorkerCount: 8,
  rosterDigest: '0123456789abcdef',
  resourceRosterDigest: 'fedcba9876543210',
});

function status(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    phase: 'draining',
    systemRows: 1n,
    systemConfigValid: true,
    expectedCastleCount: 2,
    expectedWorkerCount: 8,
    actualCastleCount: 2n,
    actualWorkerCount: 8n,
    rosterDigest: reviewed.rosterDigest,
    expectedRosterDigest: reviewed.rosterDigest,
    malformedWorkerGraphRows: 0n,
    resourceAccounts: 2n,
    missingResourceAccounts: 0n,
    orphanedResourceAccounts: 0n,
    resourceInvariantViolations: 0n,
    resourceRosterDigest: reviewed.resourceRosterDigest,
    canonicalResourceCatalog: true,
    resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
    legacyExpeditions: 0n,
    legacyOccupations: 0n,
    legacySchedules: 0n,
    genericAssignments: 0n,
    genericOccupations: 0n,
    genericSchedules: 0n,
    genericCommandReceipts: 0n,
    ...overrides,
  };
}

test('offline operator emits a non-submitting exact activation plan', () => {
  const plan = planWorkerActivation(status(), reviewed);
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.reducer, 'admin_activate_worker_system_v1');
  assert.deepEqual(plan.arguments, reviewed);
  assert.equal(plan.dataDeletion, false);
  assert.equal(plan.automaticSubmission, false);
  assert.equal(plan.requiresExplicitOwnerApproval, true);
});

test('operator refuses malformed aggregate types and a catalog mismatch', () => {
  assert.throws(
    () => projectWorkerRolloutOperatorStatus({
      ...status(),
      actualWorkerCount: 8,
    }),
    (error: unknown) => (
      error instanceof WorkerRolloutControlError
      && error.code === 'WORKER_ROLLOUT_STATUS_INVALID'
    ),
  );
  assert.throws(
    () => projectWorkerRolloutOperatorStatus({
      ...status(),
      resourceCatalogDigest: '0'.repeat(16),
    }),
    (error: unknown) => (
      error instanceof WorkerRolloutControlError
      && error.code === 'WORKER_RESOURCE_CATALOG_MISMATCH'
    ),
  );
});

test('operator reports every live blocker and never creates a mutation plan', () => {
  const plan = planWorkerActivation(status({
    legacySchedules: 1n,
    genericOccupations: 1n,
  }), reviewed);
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.blockers, [
    'WORKER_LEGACY_DRAIN_REQUIRED',
    'WORKER_PREACTIVATION_STATE_NOT_EMPTY',
  ]);
  assert.equal(plan.automaticSubmission, false);
  assert.equal(plan.dataDeletion, false);
});
