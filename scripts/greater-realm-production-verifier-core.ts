import {
  digestGreaterRealmProductionCutoverStatus,
  projectGreaterRealmProductionCutoverStatus,
  type GreaterRealmProductionCutoverStatus,
} from './greater-realm-production-relocation-core';

export const GREATER_REALM_PRODUCTION_MAX_FOUNDERS = 600 as const;

export type GreaterRealmProductionVerificationReceipt = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-greater-realm-production-active-verification-v1';
  atlasSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
  expectedFounderCount: number;
  founderCapacityRemaining: number;
  admissionState: 'open' | 'at-capacity';
  activeClaimRows: string;
  occupancyRows: string;
  auditRows: string;
  statusDigest: string;
}>;

export class GreaterRealmProductionVerifierError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionVerifierError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmProductionVerifierError(code);
}

function assertExpectedFounderCount(value: number): void {
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > GREATER_REALM_PRODUCTION_MAX_FOUNDERS
  ) fail('GREATER_REALM_PRODUCTION_VERIFIER_FOUNDER_COUNT_INVALID');
}

function assertActiveGraph(
  status: GreaterRealmProductionCutoverStatus,
  expectedFounderCount: number,
): void {
  const founders = BigInt(expectedFounderCount);
  const postCanaryFounderCount = expectedFounderCount - status.snapshotCastleCount;
  if (
    status.releaseState !== 'active'
    || status.releaseReady
    || status.activationMode !== 'active'
    || !status.everActive
    || status.rollbackEligible
    || status.resumeEligible
    || status.legacyFoundingOpen
    || status.legacyJourneyDispatchOpen
    || !status.currentWorldGraphApplicable
    || !status.currentWorldGraphExact
    || status.currentWorldIntegrityViolationCount !== 0
    || status.currentFounderCount !== expectedFounderCount
    || status.founderCapacityRemaining
      !== GREATER_REALM_PRODUCTION_MAX_FOUNDERS - expectedFounderCount
    || status.snapshotCastleCount > expectedFounderCount
    || status.postCanaryFoundingCount !== postCanaryFounderCount
    || status.snapshotWorkerCount !== status.snapshotCastleCount * 4
    || status.snapshotResourceAccountCount !== status.snapshotCastleCount
    || status.snapshotMarkAccountCount !== status.snapshotCastleCount
    || status.nextAllocationSequence !== founders
    || status.greaterRealmClaimRows !== founders
    || status.greaterRealmOccupancyRows !== founders
    || status.activeClaimRows !== founders
    || status.plannedClaimRows !== 0n
    || status.relocatedClaimRows !== BigInt(status.snapshotCastleCount)
    || status.foundedClaimRows !== BigInt(postCanaryFounderCount)
    || status.legacyClaimRows !== 0n
    || status.legacyOccupiedWorldTileRows !== 0n
    || status.atlasRows !== 1n
    || status.atlasMode !== 'active'
    || status.atlasRevision === undefined
    || status.atlasCastleCapacity !== GREATER_REALM_PRODUCTION_MAX_FOUNDERS
    || status.atlasVisibleRegionCount !== status.expectedRegionCount
    || status.atlasVisibleCellCount !== status.expectedCellCount
    || status.atlasVisibleChunkCount !== status.expectedChunkCount
    || status.visibleRegionRows !== BigInt(status.expectedRegionCount)
    || status.activeVisibleRegionRows !== BigInt(status.expectedRegionCount)
    || status.workerSystemV2Rows !== 1n
    || status.workerSystemV2Mode !== 'active'
    || status.workerSystemV2RosterDigest === undefined
    || status.workerSystemV2CurrentCastleCount !== expectedFounderCount
    || status.workerSystemV2CurrentWorkerCount !== expectedFounderCount * 4
    || status.workerSystemV1Rows !== 1n
    || status.workerSystemV1Mode !== 'active'
    || status.workerSystemV1RosterDigest === undefined
    || status.workerSystemV1RosterDigest !== status.workerSystemV2RosterDigest
    || status.workerSystemV1ExpectedCastleCount !== expectedFounderCount
    || status.workerSystemV1ExpectedWorkerCount !== expectedFounderCount * 4
    || status.activeAdmissionEligible !== (
      expectedFounderCount < GREATER_REALM_PRODUCTION_MAX_FOUNDERS
    )
  ) fail('GREATER_REALM_PRODUCTION_VERIFIER_ACTIVE_GRAPH_INVALID');
}

/** Exact post-activation production aggregate verification for founder counts 1..600. */
export function verifyGreaterRealmActiveProductionStatus(input: Readonly<{
  value: unknown;
  expectedFounderCount: number;
  expectedAtlasSourceCommit: string;
  expectedAtlasId: string;
  expectedPublicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
}>): GreaterRealmProductionVerificationReceipt {
  assertExpectedFounderCount(input.expectedFounderCount);
  if (
    !/^[0-9a-f]{40}$/u.test(input.expectedAtlasSourceCommit)
    || !/^[0-9a-f]{40}$/u.test(input.moduleSourceCommit)
    || typeof input.expectedAtlasId !== 'string'
    || input.expectedAtlasId.length < 1
    || input.expectedAtlasId.length > 512
    || typeof input.expectedPublicReleaseId !== 'string'
    || input.expectedPublicReleaseId.length < 1
    || input.expectedPublicReleaseId.length > 512
    || !/^[0-9a-f]{64}$/u.test(input.expectedReleaseSha256)
  ) {
    fail('GREATER_REALM_PRODUCTION_VERIFIER_SOURCE_PROVENANCE_INVALID');
  }
  let status: GreaterRealmProductionCutoverStatus;
  try {
    status = projectGreaterRealmProductionCutoverStatus(input.value);
  } catch (error) {
    if (error instanceof GreaterRealmProductionVerifierError) throw error;
    fail('GREATER_REALM_PRODUCTION_VERIFIER_STATUS_INVALID');
  }
  if (
    status.sourceCommit !== input.expectedAtlasSourceCommit
    || status.atlasId !== input.expectedAtlasId
    || status.publicReleaseId !== input.expectedPublicReleaseId
    || status.expectedReleaseSha256 !== input.expectedReleaseSha256
  ) {
    fail('GREATER_REALM_PRODUCTION_VERIFIER_ATLAS_RELEASE_MISMATCH');
  }
  assertActiveGraph(status, input.expectedFounderCount);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-active-verification-v1',
    atlasSourceCommit: input.expectedAtlasSourceCommit,
    atlasId: input.expectedAtlasId,
    publicReleaseId: input.expectedPublicReleaseId,
    expectedReleaseSha256: input.expectedReleaseSha256,
    moduleSourceCommit: input.moduleSourceCommit,
    expectedFounderCount: input.expectedFounderCount,
    founderCapacityRemaining: status.founderCapacityRemaining,
    admissionState: status.activeAdmissionEligible ? 'open' : 'at-capacity',
    activeClaimRows: status.activeClaimRows.toString(),
    occupancyRows: status.greaterRealmOccupancyRows.toString(),
    auditRows: status.auditRows.toString(),
    statusDigest: digestGreaterRealmProductionCutoverStatus(status),
  });
}
