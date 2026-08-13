export const GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_PROFILE:
  'warpkeep-greater-realm-release-gate-deploy-boundary-v1';

export class GreaterRealmReleaseGateDeployBoundaryError extends Error {
  readonly code: string;
}

export function runGreaterRealmReleaseGateDeployBoundary(
  options: Readonly<{
    repositoryRoot?: string;
    expectedCommit: string;
  }>,
): Promise<Readonly<{
  schemaVersion: 1;
  profile: typeof GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_PROFILE;
  expectedCommit: string;
  phase: string;
  nativePackageName: string;
}>>;

export const greaterRealmReleaseGateDeployBoundaryTestSeams: Readonly<{
  exactGitSource: (
    repositoryRoot: string,
    expectedCommit: string,
    allowedIgnoredPaths: readonly string[],
    spawn?: (
      command: string,
      arguments_: string[],
      options: unknown,
    ) => Readonly<{ status: number | null; stdout: string }>,
  ) => void;
  runBoundary: (
    options: Readonly<{ repositoryRoot?: string; expectedCommit: string }>,
    dependencies?: Readonly<{
      spawn?: (
        command: string,
        arguments_: string[],
        options: unknown,
      ) => Readonly<{ status: number | null; stdout: string }>;
      installResolver?: (repositoryRoot: string, nativePackage: string) => unknown;
      attestResolver?: (repositoryRoot: string, identity: unknown) => unknown;
      attestRootDependencies?: (
        repositoryRoot: string,
        platform: string,
        architecture: string,
      ) => unknown;
      loadReleaseGate?: () => Promise<Readonly<{
        verifyGreaterRealmReleaseGateState?: () => Promise<string>;
      }>>;
    }>,
  ) => Promise<unknown>;
  runWithPostflight: <T>(
    operator: () => T | Promise<T>,
    postflight: () => unknown | Promise<unknown>,
  ) => Promise<T>;
}>;
