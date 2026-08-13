export declare const PRODUCTION_PLAYER_CANARY_EVIDENCE_AUTHORITY_PROFILE:
  'warpkeep-production-player-canary-evidence-authority-v1';

export declare class ProductionPlayerCanaryEvidenceAuthorityError extends Error {
  readonly code: string;
}

export type ProductionPlayerCanaryEvidenceAuthority = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_EVIDENCE_AUTHORITY_PROFILE;
  reviewedAdmissionPlanDigest: string;
  reviewedAdmissionClaimDigest: string;
  notificationEvidenceCommitment: string;
  adminGameplayEvidenceDigest: string;
  serverBaselineCommitment: string;
  ownerApprovalCommitment: string;
  routeSetCommitment: string;
  approvedAt: string;
  notAfter: string;
  recordedAt: string;
  protectedCommit: string;
  protectedTree: string;
  notificationPagesLiveReceiptDigest: string;
  notificationPagesLivePagesSourceCommit: string;
  notificationPagesLiveBridgeSourceCommit: string;
  notificationPagesLiveRootReceiptDigest: string;
  notificationPagesLiveRootPagesSourceCommit: string;
  normalRequestAdmission: true;
  exactlyOnceNotification: true;
  sameAdmissionGeneration: true;
  sameFounder: true;
  directTierOneFounder: true;
  workerCount: 4;
  dispatchReceiptCount: 4;
  recallReceiptCount: 4;
  distinctResourceKindCount: 4;
  naturalGatheringWindowSatisfied: true;
  terminalIdleWorkerCount: 4;
  terminalGraphEmpty: true;
  isolatedResourceKindCount: 4;
  resourceQuantumCount: 4;
  humanRouteAndTimeCutoffSatisfied: true;
}>;

export declare function productionPlayerCanaryAdmissionProfileDigest(
  profile: unknown,
): string;
export declare function productionPlayerCanarySubjectCommitment(
  fid: bigint | string,
  evidenceNonce: string,
): string;
export declare function validateProductionPlayerCanaryAdminEvidenceV1(
  value: unknown,
): void;
export declare function parseProductionPlayerCanaryEvidenceAuthority(
  value: unknown,
): ProductionPlayerCanaryEvidenceAuthority;
export declare function inspectProductionPlayerCanaryExpectedEvidenceAuthority(
  input: Readonly<{
    founderPlanDirectory: string;
    reviewedAdmissionPlanReference: Readonly<{ filename: string; sha256: string }>;
    ownerApprovalDirectory: string;
    ownerApprovalReference: Readonly<{ filename: string; sha256: string }>;
    expectedSourceConfigurationDigest: string;
    expectedTargetConfigurationDigest: string;
    expectedProfilePolicyVersion: string;
    pagesSourceCommit: string;
    rootBinding?: Readonly<Record<string, unknown>>;
    liveReceiptDirectory?: string;
    repositoryRoot?: string;
    liveFetchImpl?: typeof fetch;
    notificationBridgeUrl: string;
    notificationOperatorSecret: string;
    notificationFetchImpl?: typeof fetch;
    adminSecret: string;
    now: Date;
  }>,
): Promise<ProductionPlayerCanaryEvidenceAuthority>;
export declare function requireProductionPlayerCanaryExpectedEvidenceAuthority(
  value: unknown,
): ProductionPlayerCanaryEvidenceAuthority;
export declare const productionPlayerCanaryEvidenceAuthorityTestSeams: Readonly<{
  assertProtectedSource: (
    repositoryRoot: string,
    protectedCommit: string,
    protectedTree: string,
  ) => void;
  assertProtectedSourceAtRoot: (
    repositoryRoot: string,
    protectedCommit: string,
    protectedTree: string,
    expectedRepositoryRoot: string,
    executingAuthorityBytes: string,
  ) => void;
  buildExpectedEvidenceAuthority: (
    input: Readonly<Record<string, unknown>>,
  ) => ProductionPlayerCanaryEvidenceAuthority;
  inspectExpectedEvidenceAuthority: (
    input: Readonly<Record<string, unknown>>,
    dependencies: Readonly<Record<string, unknown>>,
  ) => Promise<ProductionPlayerCanaryEvidenceAuthority>;
}> | undefined;
