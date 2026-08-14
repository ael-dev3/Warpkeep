import { sha256Hex } from './sha256';

export const PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_PROFILE =
  'warpkeep-production-player-canary-approval-registration-v1';
export const PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION =
  'warpkeep-production-player-canary-command-key-v2';

export class ProductionPlayerCanaryApprovalError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProductionPlayerCanaryApprovalError';
  }
}

function fail(code: string): never {
  throw new ProductionPlayerCanaryApprovalError(code);
}

export type ProductionPlayerCanaryGameplayWriteRegistrationV2 = Readonly<{
  fid: bigint;
  commandKeyPolicyVersion: string;
  approvedAtMicros: bigint;
  notAfterMicros: bigint;
  registeredAt: Readonly<{ microsSinceUnixEpoch: bigint }>;
}>;

/** Pure decision seam used by every caller-triggered gameplay mutation gate. */
export function productionPlayerCanaryGameplayWriteGateCodeV2(
  registration: ProductionPlayerCanaryGameplayWriteRegistrationV2 | null,
  fid: bigint,
  observedAtMicros: bigint,
): 'STATE_INTEGRITY'
  | 'PRODUCTION_PLAYER_CANARY_GENERIC_WORKER_WRITE_BLOCKED'
  | undefined {
  if (registration === null) return undefined;
  if (
    registration.fid !== fid
    || registration.commandKeyPolicyVersion
      !== PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION
    || registration.approvedAtMicros < 1n
    || registration.notAfterMicros <= registration.approvedAtMicros
    || registration.registeredAt.microsSinceUnixEpoch
      < registration.approvedAtMicros
    || registration.registeredAt.microsSinceUnixEpoch
      >= registration.notAfterMicros
  ) return 'STATE_INTEGRITY';
  return observedAtMicros >= registration.approvedAtMicros
    && observedAtMicros < registration.notAfterMicros
    ? 'PRODUCTION_PLAYER_CANARY_GENERIC_WORKER_WRITE_BLOCKED'
    : undefined;
}

function framed(values: readonly (string | number | bigint | boolean)[]): string {
  return values.map((value) => {
    const text = value.toString();
    return `${new TextEncoder().encode(text).byteLength}:${text}`;
  }).join('|');
}

export type ProductionPlayerCanaryApprovalRegistrationCommitmentMaterial =
  Readonly<{
    challengeDigest: string;
    reviewedAdmissionPlanDigest: string;
    serverBaselineCommitment: string;
    routeSetCommitment: string;
    commandKeyPolicyVersion: string;
    commandSetCommitment: string;
    ownerApprovalArtifactDigest: string;
    ownerApprovalCommitment: string;
    approvedAtMicros: bigint;
    notAfterMicros: bigint;
  }>;

export function productionPlayerCanaryApprovalRegistrationCommitmentV1(
  input: ProductionPlayerCanaryApprovalRegistrationCommitmentMaterial,
): string {
  return sha256Hex(`${framed([
    'warpkeep.production-player-canary.approval-registration.v1',
    input.challengeDigest,
    input.reviewedAdmissionPlanDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
    input.commandKeyPolicyVersion,
    input.commandSetCommitment,
    input.ownerApprovalArtifactDigest,
    input.ownerApprovalCommitment,
    input.approvedAtMicros,
    input.notAfterMicros,
  ])}\n`);
}

export function productionPlayerCanaryOwnerApprovalCommitmentV1(
  input: Readonly<{
    evidenceNonce: string;
    ownerApprovalArtifactDigest: string;
    serverBaselineCommitment: string;
    routeSetCommitment: string;
  }>,
): string {
  return sha256Hex(`${framed([
    'warpkeep.production-player-canary.owner-approval.v1',
    input.evidenceNonce,
    input.ownerApprovalArtifactDigest,
    input.serverBaselineCommitment,
    input.routeSetCommitment,
  ])}\n`);
}

type CollisionRow = Readonly<{
  challengeDigest: string;
  approvalRegistrationCommitment: string;
}>;

export type ProductionPlayerCanaryApprovalLookup<Row extends CollisionRow> =
  Readonly<{
    byChallenge: Row | null;
    byFid: Row | null;
    byBaseline: Row | null;
    byRouteSet: Row | null;
    byCommandSet: Row | null;
    byArtifact: Row | null;
    byOwnerApproval: Row | null;
    byRegistration: Row | null;
  }>;

/** All unique lookups must be absent or resolve to the exact same row. */
export function reconcileProductionPlayerCanaryApprovalRowsV1<
  Row extends CollisionRow,
>(
  lookup: ProductionPlayerCanaryApprovalLookup<Row>,
  approvalRegistrationCommitment: string,
): Row | null {
  const rows = [
    lookup.byChallenge,
    lookup.byFid,
    lookup.byBaseline,
    lookup.byRouteSet,
    lookup.byCommandSet,
    lookup.byArtifact,
    lookup.byOwnerApproval,
    lookup.byRegistration,
  ] as const;
  const present = rows.filter((row): row is Row => row !== null);
  if (present.length === 0) return null;
  const challengeDigest = present[0]!.challengeDigest;
  if (
    present.length !== rows.length
    || present.some(row => row.challengeDigest !== challengeDigest)
    || present.some(row => (
      row.approvalRegistrationCommitment !== approvalRegistrationCommitment
    ))
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_CONFLICT');
  return present[0]!;
}
