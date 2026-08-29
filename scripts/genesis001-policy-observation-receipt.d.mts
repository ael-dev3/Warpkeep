export const GENESIS_001_POLICY_OBSERVATION_PROCEDURE:
  'genesis_001_access_policy_v1';

export type Genesis001ClosedPolicy = Readonly<{
  realmId: 'GENESIS_001';
  releaseVersion: '0.3.43';
  playerAccessEnabled: true;
  admissionStateMutationsEnabled: false;
  accessRequestSubmissionsEnabled: false;
  sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
  freezeReleaseNonce:
    '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00';
}>;

export type Genesis001PolicyObservationReceipt = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-genesis-001-live-policy-observation-v1';
  sourceCommit: string;
  observedAt: string;
  databaseIdentity:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
  procedure: 'genesis_001_access_policy_v1';
  mutationSubmitted: false;
  policy: Genesis001ClosedPolicy;
  policyReceiptDigest: string;
}>;

export type Genesis001PolicyObservationBootstrapAuthority = Readonly<{
  sourceCommit: string;
  adminSecretPath: string;
}>;

export type Genesis001PolicyObservationSession = Readonly<{
  inspect: (procedure: string) => Promise<unknown>;
  invalidate: () => Promise<void>;
  close: () => Promise<void>;
}>;

export type Genesis001PolicyObservationTestDependencies = Readonly<{
  attestProtectedMain: (repositoryRoot: string) => string;
  readAdminSecretFile: (path: string) => string;
  createSession: (
    input: Readonly<{ adminSecret: string }>,
  ) => Genesis001PolicyObservationSession;
  now: () => Date;
}>;

export class Genesis001PolicyObservationError extends Error {
  constructor(code: string);
  readonly code: string;
}

export function captureGenesis001PolicyObservationBootstrapAuthority(
  environment?: Record<string, string | undefined>,
): Genesis001PolicyObservationBootstrapAuthority;

export function parseGenesis001PolicyObservationArguments(
  arguments_: readonly string[],
): Readonly<{ command: 'observe' }>;

export function executeGenesis001PolicyObservation(input: Readonly<{
  sourceCommit: string;
  adminSecretPath: string;
  repositoryRoot: string;
  testOnlyDependencies?: Genesis001PolicyObservationTestDependencies;
}>): Promise<Genesis001PolicyObservationReceipt>;
