export declare const PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_PROFILE:
  'warpkeep-production-player-canary-operator-journal-v1';
export declare const PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_STATE_CHILD:
  'production-player-canary-operator-journal-v1';
export declare const PRODUCTION_PLAYER_CANARY_OPERATOR_PHASES: readonly [
  'prepared',
  'baseline-submit-intent',
  'baseline-submission-uncertain',
  'baseline-absence-observed',
  'baseline-reconciled',
  'owner-approval-install-intent',
  'owner-approval-installed',
  'approval-submit-intent',
  'approval-submission-uncertain',
  'approval-absence-observed',
  'approval-reconciled',
  'awaiting-authoritative-evidence',
  'receipt-install-intent',
  'receipt-install-not-published',
  'receipt-installed',
];

export type ProductionPlayerCanaryOperatorContract = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-production-player-canary-operator-v1';
  operationId: string;
  evidenceNonce: string;
  reviewedAdmissionClaimDigest: string;
  subjectCommitment: string;
  repositoryRoot: string;
  protectedCommit: string;
  protectedTree: string;
  founderPlanDirectory: string;
  reviewedAdmissionPlanReference: Readonly<{ filename: string; sha256: string }>;
  ownerApprovalDirectory: string;
  receiptDirectory: string;
}>;

export type ProductionPlayerCanaryOperatorJournal = Readonly<{
  inspect(): Readonly<{
    contract: ProductionPlayerCanaryOperatorContract;
    phase: typeof PRODUCTION_PLAYER_CANARY_OPERATOR_PHASES[number];
    sequence: number;
    payload: Readonly<Record<string, unknown>>;
    recordDigest: string;
  }>;
  payloadFor(phase: typeof PRODUCTION_PLAYER_CANARY_OPERATOR_PHASES[number]):
    Readonly<Record<string, unknown>> | null;
  beginBaselineWrite(input: Readonly<{
    arguments: unknown;
    confirmationDigest: string;
  }>): Readonly<{
    attempt: number;
    argumentsDigest: string;
    permit: (() => void) & Readonly<{
      markSubmissionUncertain(): Promise<void>;
      bindWriteNotStartedError(error: unknown): void;
    }>;
  }>;
  baselineAbsenceObserved(): unknown;
  baselineReconciled(value: unknown): unknown;
  ownerApprovalInstallIntent(value: unknown): unknown;
  ownerApprovalInstalled(value: unknown): unknown;
  beginApprovalWrite(input: Readonly<{
    arguments: unknown;
    confirmationDigest: string;
  }>): Readonly<{
    attempt: number;
    argumentsDigest: string;
    permit: (() => void) & Readonly<{
      markSubmissionUncertain(): Promise<void>;
      bindWriteNotStartedError(error: unknown): void;
    }>;
  }>;
  approvalAbsenceObserved(): unknown;
  approvalReconciled(value: unknown): unknown;
  awaitingAuthoritativeEvidence(): unknown;
  receiptInstallIntent(value: Readonly<{
    receiptDigest: string;
    evidenceAuthorityDigest: string;
    recordedAt: string;
    notAfter: string;
  }>): unknown;
  receiptInstallNotPublished(): unknown;
  receiptInstalled(result: unknown): unknown;
}>;

export declare class ProductionPlayerCanaryOperatorJournalError extends Error {
  readonly code: string;
  readonly disposition: string;
}

export declare function parseProductionPlayerCanaryOperatorContract(
  value: unknown,
): ProductionPlayerCanaryOperatorContract;
export declare function productionPlayerCanaryOperatorConfirmationDigest(input: Readonly<{
  operationId: string;
  action:
    | 'capture-baseline'
    | 'install-owner-approval'
    | 'register-approval';
  attempt: number;
  effectDigest: string;
}>): string;
export declare function productionPlayerCanaryOperatorEffectDigest(value: unknown): string;
export declare function withProductionPlayerCanaryOperatorJournal<T>(input: Readonly<{
  contract: ProductionPlayerCanaryOperatorContract;
  reportedHome?: string;
  validateBeforePrepare?: () => Promise<void> | void;
  operation: (journal: ProductionPlayerCanaryOperatorJournal) => Promise<T> | T;
}>): Promise<T>;
export declare const productionPlayerCanaryOperatorJournalTestSeams:
  | Readonly<{
    withJournalDependencies<T>(
      input: Readonly<{
        contract: ProductionPlayerCanaryOperatorContract;
        reportedHome?: string;
        validateBeforePrepare?: () => Promise<void> | void;
        operation: (
          journal: ProductionPlayerCanaryOperatorJournal,
        ) => Promise<T> | T;
      }>,
      injected?: Readonly<{
        now?: () => Date;
        randomBytes?: (size: number) => Buffer;
        probeProcessIdentity?: (pid: number) => unknown;
        currentProcessIdentity?: () => string;
      }>,
    ): Promise<T>;
  }>
  | undefined;
