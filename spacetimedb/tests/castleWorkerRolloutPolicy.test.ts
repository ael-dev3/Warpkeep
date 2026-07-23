import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKER_PROTOCOL_CAPABILITY,
  CASTLE_WORKERS_PER_CASTLE,
  workerNodeKey,
} from '../src/castleWorkerPolicy';
import {
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  CASTLE_WORKER_RESOURCE_STATE_VERSION,
  CastleWorkerRolloutPolicyError,
  type WorkerActivationSnapshot,
  type WorkerClientAttestation,
  assertWorkerClientAttestation,
  legacyDispatchWorkerStateBlocker,
  planDeterministicWorkerBackfill,
  resourceRosterDigest,
  workerActivationBlockers,
  workerRolloutPhase,
  workerRolloutPhaseAt,
} from '../src/castleWorkerRolloutPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
} from '../src/resourceAuthorityPolicy';

const artifactDigest = 'a'.repeat(64);
const sourceCommit = 'b'.repeat(40);

function attestation(
  overrides: Partial<WorkerClientAttestation> = {},
): WorkerClientAttestation {
  return Object.freeze({
    capability: CASTLE_WORKER_PROTOCOL_CAPABILITY,
    clientRelease: 'alpha-0.3.15',
    clientArtifactDigest: artifactDigest,
    sourceCommit,
    resourceStateVersion: CASTLE_WORKER_RESOURCE_STATE_VERSION,
    resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
    expectedCastleCount: 2,
    expectedWorkerCount: 8,
    rosterDigest: planDeterministicWorkerBackfill([7n, 42n], []).rosterDigest,
    resourceRosterDigest: resourceRosterDigest([
      {
        fid: 101n,
        castleId: 7n,
        food: 0n,
        wood: 0n,
        stone: 0n,
        gold: 0n,
        settledThroughMicros: 1n,
        revision: 0n,
        policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
      },
      {
        fid: 202n,
        castleId: 42n,
        food: 0n,
        wood: 0n,
        stone: 0n,
        gold: 0n,
        settledThroughMicros: 1n,
        revision: 0n,
        policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
      },
    ]),
    ...overrides,
  });
}

function readySnapshot(
  reviewed = attestation(),
  overrides: Partial<WorkerActivationSnapshot> = {},
): WorkerActivationSnapshot {
  return Object.freeze({
    phase: 'draining',
    systemRows: 1n,
    systemConfigValid: true,
    expectedCastleCount: reviewed.expectedCastleCount,
    expectedWorkerCount: reviewed.expectedWorkerCount,
    actualCastleCount: BigInt(reviewed.expectedCastleCount),
    actualWorkerCount: BigInt(reviewed.expectedWorkerCount),
    rosterDigest: reviewed.rosterDigest,
    expectedRosterDigest: reviewed.rosterDigest,
    malformedWorkerGraphRows: 0n,
    resourceAccounts: BigInt(reviewed.expectedCastleCount),
    missingResourceAccounts: 0n,
    orphanedResourceAccounts: 0n,
    resourceInvariantViolations: 0n,
    resourceRosterDigest: reviewed.resourceRosterDigest,
    canonicalResourceCatalog: true,
    legacyExpeditions: 0n,
    legacyOccupations: 0n,
    legacySchedules: 0n,
    genericAssignments: 0n,
    genericOccupations: 0n,
    genericSchedules: 0n,
    genericCommandReceipts: 0n,
    ...overrides,
  });
}

test('deterministic backfill creates exactly four stable workers per castle', () => {
  const first = planDeterministicWorkerBackfill([42n, 7n], []);
  assert.equal(first.expectedCastleCount, 2);
  assert.equal(first.expectedWorkerCount, 2 * CASTLE_WORKERS_PER_CASTLE);
  assert.equal(first.rowsToInsert.length, 8);
  assert.deepEqual(
    first.rowsToInsert.map(row => row.workerId),
    [
      'genesis-001-castle-7-worker-01',
      'genesis-001-castle-7-worker-02',
      'genesis-001-castle-7-worker-03',
      'genesis-001-castle-7-worker-04',
      'genesis-001-castle-42-worker-01',
      'genesis-001-castle-42-worker-02',
      'genesis-001-castle-42-worker-03',
      'genesis-001-castle-42-worker-04',
    ],
  );
  assert.ok(first.rowsToInsert.every(row => (
    row.status === 'idle'
    && row.timelineRevision === 0
    && row.revision === 0n
  )));

  const rerun = planDeterministicWorkerBackfill([7n, 42n], first.rowsToInsert);
  assert.equal(rerun.rowsToInsert.length, 0);
  assert.equal(rerun.rosterDigest, first.rosterDigest);
});

test('backfill fails closed on partial, active, duplicate, and orphaned rows', () => {
  const canonical = planDeterministicWorkerBackfill([7n], []).rowsToInsert;
  assert.throws(
    () => planDeterministicWorkerBackfill([7n], canonical.slice(0, 3)),
    (error: unknown) => (
      error instanceof CastleWorkerRolloutPolicyError
      && error.code === 'WORKER_ROSTER_PARTIAL'
    ),
  );
  assert.throws(
    () => planDeterministicWorkerBackfill([7n], [
      { ...canonical[0]!, status: 'gathering' },
      ...canonical.slice(1),
    ]),
    (error: unknown) => (
      error instanceof CastleWorkerRolloutPolicyError
      && error.code === 'WORKER_ROSTER_INTEGRITY'
    ),
  );
  assert.throws(
    () => planDeterministicWorkerBackfill([7n], [
      canonical[0]!,
      canonical[0]!,
      ...canonical.slice(2),
    ]),
    (error: unknown) => (
      error instanceof CastleWorkerRolloutPolicyError
      && error.code === 'WORKER_ROSTER_DUPLICATE'
    ),
  );
  assert.throws(
    () => planDeterministicWorkerBackfill([7n], [
      { ...canonical[0]!, originCastleId: 8n },
    ]),
    (error: unknown) => (
      error instanceof CastleWorkerRolloutPolicyError
      && error.code === 'WORKER_ROSTER_ORPHAN'
    ),
  );
});

test('same resource may occupy different nodes while an exact node key collides', () => {
  const canonicalIds = {
    gold: 'genesis-001-tier1-gold-01',
    food: 'genesis-001-tier1-food-001',
    wood: 'genesis-001-tier1-wood-001',
    stone: 'genesis-001-tier1-stone-001',
  } as const;
  assert.deepEqual(
    Object.entries(canonicalIds).map(([kind, siteId]) => (
      workerNodeKey(kind, siteId)
    )),
    [
      'gold:genesis-001-tier1-gold-01',
      'food:genesis-001-tier1-food-001',
      'wood:genesis-001-tier1-wood-001',
      'stone:genesis-001-tier1-stone-001',
    ],
  );
  // The key grammar also remains compatible with any already-deployed
  // colon-delimited canonical catalog identifiers.
  assert.equal(
    workerNodeKey('gold', 'genesis-001:gold:0001'),
    'gold:genesis-001:gold:0001',
  );
  const first = workerNodeKey('wood', canonicalIds.wood);
  const second = workerNodeKey('wood', 'genesis-001-tier1-wood-002');
  assert.notEqual(first, second);
  assert.equal(first, workerNodeKey('wood', canonicalIds.wood));
  assert.throws(
    () => workerNodeKey('wood', 'logging camp'),
    /WORKER_SITE_ID_INVALID/,
  );
});

test('rollout phase encodes stage, drain, and active without changing v12 shape', () => {
  const createdAt = { microsSinceUnixEpoch: 100n };
  const activatedAt = { microsSinceUnixEpoch: 101n };
  const base = {
    realmId: 'GENESIS_001',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: 4,
    expectedCastleCount: 2,
    expectedWorkerCount: 8,
    rosterDigest: attestation().rosterDigest,
    mode: 'staged',
    legacyDrainRequired: false,
    createdAt,
    activatedAt: undefined,
  } as const;
  assert.equal(workerRolloutPhase(undefined, 0n), 'absent');
  assert.equal(workerRolloutPhase(base, 1n), 'staged');
  assert.equal(workerRolloutPhase({ ...base, legacyDrainRequired: true }, 1n), 'draining');
  assert.equal(
    workerRolloutPhase({ ...base, mode: 'active', activatedAt }, 1n),
    'active',
  );
  assert.equal(
    workerRolloutPhaseAt(
      { ...base, mode: 'active', activatedAt },
      1n,
      activatedAt.microsSinceUnixEpoch - 1n,
    ),
    'invalid',
  );
  assert.equal(
    workerRolloutPhaseAt(
      { ...base, mode: 'active', activatedAt },
      1n,
      activatedAt.microsSinceUnixEpoch,
    ),
    'active',
  );
  assert.equal(
    workerRolloutPhaseAt(
      {
        ...base,
        createdAt: {
          microsSinceUnixEpoch: createdAt.microsSinceUnixEpoch + 1n,
        },
      },
      1n,
      createdAt.microsSinceUnixEpoch,
    ),
    'invalid',
  );
  for (const invalid of [
    { ...base, activatedAt },
    { ...base, legacyDrainRequired: true, activatedAt },
    { ...base, mode: 'active' },
    {
      ...base,
      mode: 'active',
      activatedAt: { microsSinceUnixEpoch: createdAt.microsSinceUnixEpoch - 1n },
    },
    {
      ...base,
      mode: 'active',
      legacyDrainRequired: true,
      activatedAt,
    },
  ]) assert.equal(workerRolloutPhase(invalid, 1n), 'invalid');
});

test('client release attestation is bounded before the release grammar is evaluated', () => {
  assert.doesNotThrow(() => assertWorkerClientAttestation(attestation()));
  assert.throws(
    () => assertWorkerClientAttestation(attestation({
      clientRelease: `alpha-0.3.15-${'a'.repeat(65)}`,
    })),
    (error: unknown) => (
      error instanceof CastleWorkerRolloutPolicyError
      && error.code === 'WORKER_CLIENT_RELEASE_INVALID'
    ),
  );
});

test('legacy dispatch permits only healthy absent or staged generic state', () => {
  const healthy = {
    phase: 'absent',
    exactGenericNodeOccupied: false,
    genericAssignments: 0n,
    genericOccupations: 0n,
    genericSchedules: 0n,
    genericCommandReceipts: 0n,
    workerCount: 0n,
    actualCastleCount: 0n,
    expectedCastleCount: 0,
    expectedWorkerCount: 0,
    rosterDigestMatches: true,
    wholeCastleWorkerSubset: true,
    invalidWorkerRows: 0n,
  } as const;
  assert.equal(legacyDispatchWorkerStateBlocker(healthy), undefined);
  assert.equal(legacyDispatchWorkerStateBlocker({
    ...healthy,
    phase: 'staged',
    actualCastleCount: 2n,
    expectedCastleCount: 2,
    expectedWorkerCount: 8,
  }), undefined);
  assert.equal(legacyDispatchWorkerStateBlocker({
    ...healthy,
    phase: 'staged',
    actualCastleCount: 2n,
    expectedCastleCount: 2,
    workerCount: 8n,
    expectedWorkerCount: 8,
  }), undefined);
  assert.equal(legacyDispatchWorkerStateBlocker({
    ...healthy,
    phase: 'staged',
    actualCastleCount: 2n,
    expectedCastleCount: 2,
    workerCount: 4n,
    expectedWorkerCount: 8,
  }), undefined);

  for (const resourceKind of ['gold', 'food', 'wood', 'stone'] as const) {
    assert.equal(
      legacyDispatchWorkerStateBlocker({
        ...healthy,
        phase: 'staged',
        actualCastleCount: 2n,
        expectedCastleCount: 2,
        expectedWorkerCount: 8,
        exactGenericNodeOccupied: workerNodeKey(
          resourceKind,
          `genesis-001-tier1-${resourceKind}-001`,
        ).startsWith(`${resourceKind}:`),
      }),
      'LEGACY_SITE_OCCUPIED_BY_WORKER',
    );
  }
  for (const corrupt of [
    { genericAssignments: 1n },
    { genericOccupations: 1n },
    { genericSchedules: 1n },
    { genericCommandReceipts: 1n },
    { workerCount: 1n },
    { workerCount: 8n, expectedWorkerCount: 8, invalidWorkerRows: 1n },
  ] as const) {
    assert.equal(
      legacyDispatchWorkerStateBlocker({
        ...healthy,
        phase: 'staged',
        actualCastleCount: 2n,
        expectedCastleCount: 2,
        expectedWorkerCount: 8,
        ...corrupt,
      }),
      'WORKER_PREACTIVATION_STATE_INVALID',
    );
  }
  assert.equal(
    legacyDispatchWorkerStateBlocker({ ...healthy, workerCount: 4n }),
    'WORKER_PREACTIVATION_STATE_INVALID',
  );
  for (const corruptSubset of [
    { actualCastleCount: 1n },
    { rosterDigestMatches: false },
    { wholeCastleWorkerSubset: false },
    { workerCount: 2n },
    { workerCount: 12n },
  ] as const) {
    assert.equal(
      legacyDispatchWorkerStateBlocker({
        ...healthy,
        phase: 'staged',
        actualCastleCount: 2n,
        expectedCastleCount: 2,
        expectedWorkerCount: 8,
        workerCount: 4n,
        ...corruptSubset,
      }),
      'WORKER_PREACTIVATION_STATE_INVALID',
    );
  }
  assert.equal(
    legacyDispatchWorkerStateBlocker({ ...healthy, phase: 'draining' }),
    'LEGACY_EXPEDITION_DISPATCH_RETIRED',
  );
  assert.equal(
    legacyDispatchWorkerStateBlocker({ ...healthy, phase: 'invalid' }),
    'WORKER_SYSTEM_INTEGRITY',
  );
});

test('activation requires exact capability, resources, digests, empty generic state, and a complete legacy drain', () => {
  const reviewed = attestation();
  assert.deepEqual(workerActivationBlockers(readySnapshot(reviewed), reviewed), []);

  const blockers = workerActivationBlockers(
    readySnapshot(reviewed, {
      legacyExpeditions: 1n,
      genericAssignments: 1n,
      resourceInvariantViolations: 1n,
      canonicalResourceCatalog: false,
    }),
    { ...reviewed, capability: 'generic-castle-workers-unreviewed' },
  );
  assert.deepEqual(blockers, [
    'WORKER_CLIENT_CAPABILITY_MISMATCH',
    'WORKER_RESOURCE_STATE_NOT_READY',
    'WORKER_RESOURCE_CATALOG_NOT_READY',
    'WORKER_LEGACY_DRAIN_REQUIRED',
    'WORKER_PREACTIVATION_STATE_NOT_EMPTY',
  ]);
});

test('resource roster digest is order-independent and rejects malformed authority rows', () => {
  const rows = [
    {
      fid: 101n,
      castleId: 7n,
      food: 0n,
      wood: 0n,
      stone: 0n,
      gold: 0n,
      settledThroughMicros: 1n,
      revision: 0n,
      policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    },
    {
      fid: 202n,
      castleId: 42n,
      food: 2n,
      wood: 3n,
      stone: 4n,
      gold: 5n,
      settledThroughMicros: 2n,
      revision: 1n,
      policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    },
  ] as const;
  assert.equal(resourceRosterDigest(rows), resourceRosterDigest([...rows].reverse()));
  assert.throws(
    () => resourceRosterDigest([{ ...rows[0], policyVersion: 'wrong' }]),
    /WORKER_RESOURCE_STATE_INVALID/,
  );
});
