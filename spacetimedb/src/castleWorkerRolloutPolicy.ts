import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKER_PROTOCOL_CAPABILITY,
  CASTLE_WORKER_U64_MAX,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
  workerIdForCastle,
  workerResourceKinds,
  workerResourcePolicy,
} from './castleWorkerPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  resourceAccountStateIsConsistent,
  type ResourceAccountState,
} from './resourceAuthorityPolicy';

export const CASTLE_WORKER_ROLLOUT_POLICY_VERSION =
  'genesis-001-castle-worker-rollout-v1';
export const CASTLE_WORKER_RESOURCE_STATE_VERSION = 2;
export const CASTLE_WORKER_MAX_CASTLES = 100;
export const CASTLE_WORKER_CLIENT_RELEASE_MAX_LENGTH = 64;
export const CASTLE_WORKER_CLIENT_RELEASE_PATTERN =
  /^(?:alpha-)?0\.3\.[0-9]+(?:[-+][a-z0-9.-]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_COMMIT_HEX = /^[0-9a-f]{40}$/;
const U32_MAX = 0xffff_ffff;

export type CastleWorkerRolloutPhase =
  | 'absent'
  | 'staged'
  | 'draining'
  | 'active'
  | 'invalid';

export type LegacyDispatchWorkerStateSnapshot = Readonly<{
  phase: CastleWorkerRolloutPhase;
  exactGenericNodeOccupied: boolean;
  genericAssignments: bigint;
  genericOccupations: bigint;
  genericSchedules: bigint;
  genericCommandReceipts: bigint;
  workerCount: bigint;
  actualCastleCount: bigint;
  expectedCastleCount: number;
  expectedWorkerCount: number;
  rosterDigestMatches: boolean;
  wholeCastleWorkerSubset: boolean;
  invalidWorkerRows: bigint;
}>;

export class CastleWorkerRolloutPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CastleWorkerRolloutPolicyError';
  }
}

function fail(code: string): never {
  throw new CastleWorkerRolloutPolicyError(code);
}

function appendFnv64(hash: bigint, value: string): bigint {
  let next = hash;
  for (const byte of new TextEncoder().encode(value)) {
    next ^= BigInt(byte);
    next = (next * 0x100000001b3n) & CASTLE_WORKER_U64_MAX;
  }
  return next;
}

function digestStrings(values: readonly string[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const value of values) {
    hash = appendFnv64(hash, `${value.length}:${value}|`);
  }
  return hash.toString(16).padStart(16, '0');
}

export const CASTLE_WORKER_RESOURCE_CATALOG_DIGEST = digestStrings(
  workerResourceKinds().flatMap(kind => {
    const policy = workerResourcePolicy(kind);
    return [
      kind,
      policy.sitePolicyVersion,
      policy.siteCatalogDigest,
      String(policy.canonicalSiteCount),
      policy.expeditionPolicyVersion,
      policy.quantumMicros.toString(),
      policy.ratePerQuantum.toString(),
      policy.gatheringDurationMicros.toString(),
    ];
  }),
);

export type WorkerRolloutSystemRowLike = Readonly<{
  realmId: string;
  policyVersion: string;
  workersPerCastle: number;
  expectedCastleCount: number;
  expectedWorkerCount: number;
  rosterDigest: string;
  mode: string;
  legacyDrainRequired: boolean;
  createdAt: Readonly<{ microsSinceUnixEpoch: bigint }>;
  activatedAt:
    | Readonly<{ microsSinceUnixEpoch: bigint }>
    | null
    | undefined;
}>;

export function workerRolloutPhase(
  row: WorkerRolloutSystemRowLike | null | undefined,
  rowCount: bigint,
): CastleWorkerRolloutPhase {
  if (row === null || row === undefined) return rowCount === 0n ? 'absent' : 'invalid';
  if (
    rowCount !== 1n
    || row.realmId !== 'GENESIS_001'
    || row.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || row.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || !Number.isSafeInteger(row.expectedCastleCount)
    || row.expectedCastleCount < 0
    || row.expectedCastleCount > CASTLE_WORKER_MAX_CASTLES
    || row.expectedWorkerCount !== row.expectedCastleCount * CASTLE_WORKERS_PER_CASTLE
    || !/^[0-9a-f]{16}$/.test(row.rosterDigest)
    || typeof row.createdAt?.microsSinceUnixEpoch !== 'bigint'
    || row.createdAt.microsSinceUnixEpoch < 0n
  ) return 'invalid';
  if (row.mode === 'active' && !row.legacyDrainRequired) {
    if (
      row.activatedAt === undefined
      || row.activatedAt === null
      || typeof row.activatedAt.microsSinceUnixEpoch !== 'bigint'
      || row.activatedAt.microsSinceUnixEpoch < row.createdAt.microsSinceUnixEpoch
    ) return 'invalid';
    return 'active';
  }
  if (row.mode !== 'staged') return 'invalid';
  if (row.activatedAt !== undefined && row.activatedAt !== null) return 'invalid';
  return row.legacyDrainRequired ? 'draining' : 'staged';
}

export function workerRolloutPhaseAt(
  row: WorkerRolloutSystemRowLike | null | undefined,
  rowCount: bigint,
  observedAtMicros: bigint,
): CastleWorkerRolloutPhase {
  const phase = workerRolloutPhase(row, rowCount);
  if (
    typeof observedAtMicros !== 'bigint'
    || observedAtMicros < 0n
    || (
      phase !== 'absent'
      && phase !== 'invalid'
      && row !== null
      && row !== undefined
      && row.createdAt.microsSinceUnixEpoch > observedAtMicros
    )
    || (
      phase === 'active'
      && row?.activatedAt !== undefined
      && row.activatedAt !== null
      && row.activatedAt.microsSinceUnixEpoch > observedAtMicros
    )
  ) return 'invalid';
  return phase;
}

/**
 * Symmetric cutover guard for legacy dispatch. Before activation, generic
 * lifecycle rows must not coexist with new legacy work. A staged roster is
 * permitted only while it is empty or is the exact canonical idle roster
 * declared by the staged system row.
 */
export function legacyDispatchWorkerStateBlocker(
  snapshot: LegacyDispatchWorkerStateSnapshot,
): string | undefined {
  if (snapshot.phase === 'draining' || snapshot.phase === 'active') {
    return 'LEGACY_EXPEDITION_DISPATCH_RETIRED';
  }
  if (snapshot.phase === 'invalid') return 'WORKER_SYSTEM_INTEGRITY';
  if (snapshot.exactGenericNodeOccupied) {
    return 'LEGACY_SITE_OCCUPIED_BY_WORKER';
  }
  if (
    snapshot.genericAssignments !== 0n
    || snapshot.genericOccupations !== 0n
    || snapshot.genericSchedules !== 0n
    || snapshot.genericCommandReceipts !== 0n
  ) return 'WORKER_PREACTIVATION_STATE_INVALID';
  if (snapshot.phase === 'absent') {
    return snapshot.workerCount === 0n
      ? undefined
      : 'WORKER_PREACTIVATION_STATE_INVALID';
  }
  if (
    snapshot.actualCastleCount !== BigInt(snapshot.expectedCastleCount)
    || snapshot.workerCount > BigInt(snapshot.expectedWorkerCount)
    || snapshot.workerCount % BigInt(CASTLE_WORKERS_PER_CASTLE) !== 0n
    || !snapshot.rosterDigestMatches
    || !snapshot.wholeCastleWorkerSubset
    || snapshot.invalidWorkerRows !== 0n
  ) {
    return 'WORKER_PREACTIVATION_STATE_INVALID';
  }
  return undefined;
}

export type WorkerRosterRowLike = Readonly<{
  workerId: string;
  originCastleId: bigint;
  ordinal: number;
  status: string;
  resourceKind: string | undefined;
  siteId: string | undefined;
  startedAtMicros: bigint | undefined;
  arrivesAtMicros: bigint | undefined;
  gatheringEndsAtMicros: bigint | undefined;
  returnStartedAtMicros: bigint | undefined;
  returnsAtMicros: bigint | undefined;
  routeSteps: number | undefined;
  returnStartProgressBasisPoints: number | undefined;
  timelineRevision: number;
  revision: bigint;
}>;

export type WorkerBackfillPlan = Readonly<{
  expectedCastleCount: number;
  expectedWorkerCount: number;
  rosterDigest: string;
  rowsToInsert: readonly WorkerRosterRowLike[];
}>;

function idleWorkerRow(castleId: bigint, ordinal: number): WorkerRosterRowLike {
  return Object.freeze({
    workerId: workerIdForCastle(castleId, ordinal),
    originCastleId: castleId,
    ordinal,
    status: 'idle',
    resourceKind: undefined,
    siteId: undefined,
    startedAtMicros: undefined,
    arrivesAtMicros: undefined,
    gatheringEndsAtMicros: undefined,
    returnStartedAtMicros: undefined,
    returnsAtMicros: undefined,
    routeSteps: undefined,
    returnStartProgressBasisPoints: undefined,
    timelineRevision: 0,
    revision: 0n,
  });
}

function idleWorkerRowIsCanonical(row: WorkerRosterRowLike): boolean {
  if (
    row.ordinal < 1
    || row.ordinal > CASTLE_WORKERS_PER_CASTLE
    || row.workerId !== workerIdForCastle(row.originCastleId, row.ordinal)
    || row.status !== 'idle'
    || row.timelineRevision !== 0
    || row.revision !== 0n
  ) return false;
  return [
    row.resourceKind,
    row.siteId,
    row.startedAtMicros,
    row.arrivesAtMicros,
    row.gatheringEndsAtMicros,
    row.returnStartedAtMicros,
    row.returnsAtMicros,
    row.routeSteps,
    row.returnStartProgressBasisPoints,
  ].every(value => value === undefined);
}

/**
 * Produce the complete deterministic insert set before any write occurs.
 * A castle may have no rows or its exact four-row idle roster; partial,
 * oversized, active, duplicate, and orphaned state all fail closed.
 */
export function planDeterministicWorkerBackfill(
  castleIds: readonly bigint[],
  existingRows: readonly WorkerRosterRowLike[],
): WorkerBackfillPlan {
  if (castleIds.length > CASTLE_WORKER_MAX_CASTLES) fail('WORKER_ROSTER_CAPACITY');
  const sortedCastleIds = [...castleIds].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  const castleSet = new Set<string>();
  for (const castleId of sortedCastleIds) {
    if (
      castleId < 0n
      || castleId > CASTLE_WORKER_U64_MAX
      || castleSet.has(castleId.toString())
    ) fail('WORKER_CASTLE_SET_INVALID');
    castleSet.add(castleId.toString());
  }
  const expectedWorkerCount = sortedCastleIds.length * CASTLE_WORKERS_PER_CASTLE;
  if (
    expectedWorkerCount > U32_MAX
    || sortedCastleIds.length > Math.floor(U32_MAX / CASTLE_WORKERS_PER_CASTLE)
  ) fail('WORKER_ROSTER_CAPACITY');

  const rowsByCastle = new Map<string, WorkerRosterRowLike[]>();
  const workerIds = new Set<string>();
  for (const row of existingRows) {
    const castleKey = row.originCastleId.toString();
    if (!castleSet.has(castleKey)) fail('WORKER_ROSTER_ORPHAN');
    if (workerIds.has(row.workerId)) fail('WORKER_ROSTER_DUPLICATE');
    workerIds.add(row.workerId);
    const rows = rowsByCastle.get(castleKey) ?? [];
    rows.push(row);
    rowsByCastle.set(castleKey, rows);
  }

  const rowsToInsert: WorkerRosterRowLike[] = [];
  for (const castleId of sortedCastleIds) {
    const rows = rowsByCastle.get(castleId.toString()) ?? [];
    if (rows.length === 0) {
      for (let ordinal = 1; ordinal <= CASTLE_WORKERS_PER_CASTLE; ordinal += 1) {
        rowsToInsert.push(idleWorkerRow(castleId, ordinal));
      }
      continue;
    }
    if (rows.length !== CASTLE_WORKERS_PER_CASTLE) fail('WORKER_ROSTER_PARTIAL');
    const ordinals = new Set<number>();
    for (const row of rows) {
      if (!idleWorkerRowIsCanonical(row) || ordinals.has(row.ordinal)) {
        fail('WORKER_ROSTER_INTEGRITY');
      }
      ordinals.add(row.ordinal);
    }
  }

  return Object.freeze({
    expectedCastleCount: sortedCastleIds.length,
    expectedWorkerCount,
    rosterDigest: rosterDigestForCastleIds(sortedCastleIds),
    rowsToInsert: Object.freeze(rowsToInsert),
  });
}

export type ResourceRosterRowLike = Readonly<{
  fid: bigint;
  castleId: bigint;
  food: bigint;
  wood: bigint;
  stone: bigint;
  gold: bigint;
  settledThroughMicros: bigint;
  revision: bigint;
  policyVersion: string;
}>;

export function resourceRosterDigest(
  rows: readonly ResourceRosterRowLike[],
): string {
  const sorted = [...rows].sort((left, right) => (
    left.castleId < right.castleId
      ? -1
      : left.castleId > right.castleId
        ? 1
        : left.fid < right.fid ? -1 : left.fid > right.fid ? 1 : 0
  ));
  const seenFids = new Set<string>();
  const seenCastles = new Set<string>();
  for (const row of sorted) {
    if (
      row.fid <= 0n
      || row.fid > CASTLE_WORKER_U64_MAX
      || row.castleId < 0n
      || row.castleId > CASTLE_WORKER_U64_MAX
      || seenFids.has(row.fid.toString())
      || seenCastles.has(row.castleId.toString())
      || !resourceAccountStateIsConsistent(row as ResourceAccountState)
    ) fail('WORKER_RESOURCE_STATE_INVALID');
    seenFids.add(row.fid.toString());
    seenCastles.add(row.castleId.toString());
  }
  return digestStrings(sorted.map(row => (
    `${row.fid}:${row.castleId}:${GENESIS_RESOURCE_POLICY_VERSION}`
  )));
}

export type WorkerClientAttestation = Readonly<{
  capability: string;
  clientRelease: string;
  clientArtifactDigest: string;
  sourceCommit: string;
  resourceStateVersion: number;
  resourcePolicyVersion: string;
  resourceCatalogDigest: string;
  expectedCastleCount: number;
  expectedWorkerCount: number;
  rosterDigest: string;
  resourceRosterDigest: string;
}>;

export function assertWorkerClientAttestation(
  attestation: WorkerClientAttestation,
): void {
  if (attestation.capability !== CASTLE_WORKER_PROTOCOL_CAPABILITY) {
    fail('WORKER_CLIENT_CAPABILITY_MISMATCH');
  }
  if (
    typeof attestation.clientRelease !== 'string'
    || attestation.clientRelease.length > CASTLE_WORKER_CLIENT_RELEASE_MAX_LENGTH
    || !CASTLE_WORKER_CLIENT_RELEASE_PATTERN.test(attestation.clientRelease)
  ) {
    fail('WORKER_CLIENT_RELEASE_INVALID');
  }
  if (!SHA256_HEX.test(attestation.clientArtifactDigest)) {
    fail('WORKER_CLIENT_ARTIFACT_INVALID');
  }
  if (!GIT_COMMIT_HEX.test(attestation.sourceCommit)) {
    fail('WORKER_SOURCE_COMMIT_INVALID');
  }
  if (
    attestation.resourceStateVersion !== CASTLE_WORKER_RESOURCE_STATE_VERSION
    || attestation.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
  ) fail('WORKER_RESOURCE_POLICY_MISMATCH');
  if (attestation.resourceCatalogDigest !== CASTLE_WORKER_RESOURCE_CATALOG_DIGEST) {
    fail('WORKER_RESOURCE_CATALOG_MISMATCH');
  }
  if (
    !Number.isSafeInteger(attestation.expectedCastleCount)
    || attestation.expectedCastleCount < 0
    || attestation.expectedCastleCount > CASTLE_WORKER_MAX_CASTLES
    || attestation.expectedWorkerCount
      !== attestation.expectedCastleCount * CASTLE_WORKERS_PER_CASTLE
    || !/^[0-9a-f]{16}$/.test(attestation.rosterDigest)
    || !/^[0-9a-f]{16}$/.test(attestation.resourceRosterDigest)
  ) fail('WORKER_ACTIVATION_ATTESTATION_INVALID');
}

export type WorkerActivationSnapshot = Readonly<{
  phase: CastleWorkerRolloutPhase;
  systemRows: bigint;
  systemConfigValid: boolean;
  expectedCastleCount: number;
  expectedWorkerCount: number;
  actualCastleCount: bigint;
  actualWorkerCount: bigint;
  rosterDigest: string;
  expectedRosterDigest: string;
  malformedWorkerGraphRows: bigint;
  resourceAccounts: bigint;
  missingResourceAccounts: bigint;
  orphanedResourceAccounts: bigint;
  resourceInvariantViolations: bigint;
  resourceRosterDigest: string;
  canonicalResourceCatalog: boolean;
  legacyExpeditions: bigint;
  legacyOccupations: bigint;
  legacySchedules: bigint;
  genericAssignments: bigint;
  genericOccupations: bigint;
  genericSchedules: bigint;
  genericCommandReceipts: bigint;
}>;

/**
 * The activation boundary returns every blocker for review, but callers must
 * reject the transition if even one signal is present.
 */
export function workerActivationBlockers(
  snapshot: WorkerActivationSnapshot,
  attestation: WorkerClientAttestation,
): readonly string[] {
  const blockers: string[] = [];
  try {
    assertWorkerClientAttestation(attestation);
  } catch (error) {
    blockers.push(error instanceof CastleWorkerRolloutPolicyError
      ? error.code
      : 'WORKER_ACTIVATION_ATTESTATION_INVALID');
  }
  if (snapshot.phase !== 'draining') blockers.push('WORKER_LEGACY_DRAIN_NOT_STARTED');
  if (snapshot.actualCastleCount === 0n) blockers.push('WORKER_REALM_EMPTY');
  if (snapshot.systemRows !== 1n || !snapshot.systemConfigValid) {
    blockers.push('WORKER_SYSTEM_NOT_READY');
  }
  if (
    snapshot.expectedCastleCount !== attestation.expectedCastleCount
    || snapshot.expectedWorkerCount !== attestation.expectedWorkerCount
    || snapshot.actualCastleCount !== BigInt(attestation.expectedCastleCount)
    || snapshot.actualWorkerCount !== BigInt(attestation.expectedWorkerCount)
  ) blockers.push('WORKER_ROSTER_COUNT_MISMATCH');
  if (
    snapshot.rosterDigest !== attestation.rosterDigest
    || snapshot.expectedRosterDigest !== attestation.rosterDigest
  ) blockers.push('WORKER_ROSTER_DIGEST_MISMATCH');
  if (snapshot.malformedWorkerGraphRows !== 0n) {
    blockers.push('WORKER_GRAPH_INTEGRITY');
  }
  if (
    snapshot.resourceAccounts !== snapshot.actualCastleCount
    || snapshot.missingResourceAccounts !== 0n
    || snapshot.orphanedResourceAccounts !== 0n
    || snapshot.resourceInvariantViolations !== 0n
    || snapshot.resourceRosterDigest !== attestation.resourceRosterDigest
  ) blockers.push('WORKER_RESOURCE_STATE_NOT_READY');
  if (!snapshot.canonicalResourceCatalog) {
    blockers.push('WORKER_RESOURCE_CATALOG_NOT_READY');
  }
  if (
    snapshot.legacyExpeditions !== 0n
    || snapshot.legacyOccupations !== 0n
    || snapshot.legacySchedules !== 0n
  ) blockers.push('WORKER_LEGACY_DRAIN_REQUIRED');
  if (
    snapshot.genericAssignments !== 0n
    || snapshot.genericOccupations !== 0n
    || snapshot.genericSchedules !== 0n
    || snapshot.genericCommandReceipts !== 0n
  ) blockers.push('WORKER_PREACTIVATION_STATE_NOT_EMPTY');
  return Object.freeze([...new Set(blockers)]);
}

export function assertWorkerActivationReady(
  snapshot: WorkerActivationSnapshot,
  attestation: WorkerClientAttestation,
): void {
  const blockers = workerActivationBlockers(snapshot, attestation);
  if (blockers.length > 0) fail(blockers[0]!);
}
