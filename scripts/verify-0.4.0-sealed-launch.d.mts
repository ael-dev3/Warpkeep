export const SEALED_LAUNCH_PROFILE: 'warpkeep-0.4.0-sealed-launch-v1';
export const GENESIS_001_DATABASE_IDENTITY: string;
export const GENESIS_001_SOURCE_BASELINE_COMMIT: string;
export const GENESIS_001_BASELINE_ABI_SHA256: string;
export const GENESIS_001_FREEZE_RELEASE_NONCE: string;
export const GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE:
  'warpkeep-genesis-001-census-export-privacy-safe-v1';
export const GENESIS_001_ADMITTED_PLAYER_CENSUS_PUBLIC_PROFILE:
  'warpkeep-genesis-001-admitted-player-census-privacy-safe-v1';
export const GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS:
  readonly string[];
export const SEALED_LAUNCH_SOURCE_PATHS: Readonly<Record<string, string>>;

export class SealedLaunchVerificationError extends Error {
  readonly code: string;
}

export function verifyGenesis001AdmittedPlayerCensusBoundary(
  sources: Readonly<{
    genesis001AdmittedPlayerCensusSource: string;
    genesis001AdmittedPlayerCensusDeclaration: string;
  }>,
): void;

export function sealedLaunchReceiptCommitment(
  commitmentKey: string,
  binding: Readonly<Record<string, unknown>>,
): string;

export function createSealedLaunchActivationBinding(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>>;

export function verifySealedLaunchActivationHistory(input: Readonly<{
  bindingSource: string;
  candidateActivationCommit: string;
  isAncestor: (ancestor: string, descendant: string) => boolean;
  parentsOf: (commit: string) => readonly string[];
  historicalPathChanges: (
    ancestor: string,
    descendant: string,
    paths: readonly string[],
  ) => boolean;
  sourceProjection: (commit: string, paths: readonly string[]) => Buffer;
  activationDelta: (
    preparationCommit: string,
    activationCommit: string,
    paths: readonly string[],
  ) => Readonly<{
    changedPaths: readonly string[];
    preparationEntries: readonly Readonly<{
      path: string;
      mode: string;
      type: string;
    }>[];
    activationEntries: readonly Readonly<{
      path: string;
      mode: string;
      type: string;
    }>[];
  }>;
}>): Readonly<{
  preparationSourceCommit: string;
  candidateActivationCommit: string;
  genesis001SourceBaselineCommit: string;
  genesis001FreezePublishSourceCommit: string;
}>;

export function inspectSealedLaunchGitHistoryForTesting(input: Readonly<{
  repositoryRoot: string;
  historicalCommit: string;
  preparationCommit: string;
  activationCommit: string;
  protectedPaths: readonly string[];
}>): Readonly<{
  historicalPathChanges: boolean;
  historicalProjection: Buffer;
  preparationProjection: Buffer;
  delta: Readonly<{
    changedPaths: readonly string[];
    preparationEntries: readonly Readonly<{
      path: string;
      mode: string;
      type: string;
    }>[];
    activationEntries: readonly Readonly<{
      path: string;
      mode: string;
      type: string;
    }>[];
  }>;
}>;

export function verifySealedLaunchSources(
  sources: Readonly<Record<string, string>>,
  requestedPhase?: 'preparation' | 'activation' | 'checked-in',
): Readonly<{
  schemaVersion: 1;
  profile: typeof SEALED_LAUNCH_PROFILE;
  phase: 'preparation' | 'activation';
  packageVersion: '0.3.43' | '0.4.0';
  pagesDeploymentApproved: boolean;
  g001ReleaseVersion: '0.3.43' | null;
  g002DatabaseIdentity: string | null;
  ptrDatabaseIdentity: string | null;
  ptrPresentationEnabled: boolean;
}>;

export function classifySealedLaunchPagesSources(
  sources: Readonly<Record<string, string>>,
): 'sealed-launch-blocked' | 'sealed-g002';

export function verifySealedLaunchPagesBuildEnvironment(input: Readonly<{
  bindingSource: string;
  environment: Readonly<Record<string, string | undefined>>;
}>): Readonly<{
  ptrEnabled: true;
  ptrDatabaseIdentity: string;
}>;

export function classifySealedLaunchPagesDeployLane(input: Readonly<{
  repositoryRoot?: string;
  candidatePagesSourceCommit: string;
}>): Readonly<{
  profile: typeof SEALED_LAUNCH_PROFILE;
  candidatePagesSourceCommit: string;
  mode: 'sealed-launch-blocked' | 'sealed-g002';
}>;
