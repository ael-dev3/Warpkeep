export const AUTH_BRIDGE_NOTIFICATION_B0_CLOUDFLARE_API_ORIGIN:
  'https://api.cloudflare.com';
export const AUTH_BRIDGE_NOTIFICATION_B0_SOURCE_DIGEST_PROFILE:
  'warpkeep-auth-bridge-wrangler-multipart-v1';

export class AuthBridgeNotificationB0CloudflareRuntimeError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export type AuthBridgeNotificationB0Module = Readonly<{
  name: string;
  field?: string;
  contentType: string;
  bytes: Buffer;
}>;

export function authBridgeNotificationB0SourceDigest(
  modules: readonly AuthBridgeNotificationB0Module[],
): string;

export function parseAuthBridgeNotificationB0Multipart(
  body: Buffer,
  contentType: string,
): readonly (AuthBridgeNotificationB0Module & Readonly<{ field: string }>)[];

export function inspectAuthBridgeNotificationB0Multipart(
  body: Buffer,
  contentType: string,
): Readonly<{
  metadata: Readonly<Record<string, unknown>>;
  sourceDigest: string;
  modules: readonly AuthBridgeNotificationB0Module[];
}>;

export function buildAuthBridgeNotificationB0WranglerMultipart(
  options: Readonly<{
    contract: Readonly<Record<string, unknown>>;
    repositoryRoot: string;
    serviceRoot: string;
    nodeExecutable: string;
    wranglerEntrypoint: string;
    commandRunner?: (input: Readonly<{
      executable: string;
      args: readonly string[];
      cwd: string;
      env: Readonly<Record<string, string>>;
    }>) => Promise<Readonly<{
      code: number | null;
      signal: NodeJS.Signals | null;
      stdout: Buffer;
      stderr: Buffer;
    }>>;
  }>,
): Promise<Readonly<{
  body: Buffer;
  contentType: string;
  metadata: Readonly<Record<string, unknown>>;
  sourceDigest: string;
}>>;

export function attestAuthBridgeNotificationB0CandidateMultipartMetadata(
  options: Readonly<{
    metadata: unknown;
    contract: Readonly<Record<string, unknown>>;
    predecessorVersionId: string;
  }>,
): true;

export function projectAuthBridgeNotificationB0CloudflareVersion(
  options: Readonly<{
    value: unknown;
    contract: Readonly<Record<string, unknown>>;
    sourceDigest: string;
  }>,
): Readonly<Record<string, unknown>>;

export function createAuthBridgeNotificationB0CloudflareRuntime(
  options: Readonly<{
    contract: Readonly<Record<string, unknown>>;
    apiToken: string;
    repositoryRoot: string;
    serviceRoot: string;
    nodeExecutable: string;
    wranglerEntrypoint: string;
    multipartBody?: Buffer;
    multipartContentType?: string;
    fetchImpl?: typeof fetch;
    commandRunner?: (input: Readonly<{
      executable: string;
      args: readonly string[];
      cwd: string;
      env: Readonly<Record<string, string>>;
    }>) => Promise<Readonly<{
      code: number | null;
      signal: NodeJS.Signals | null;
      stdout: Buffer;
      stderr: Buffer;
    }>>;
    clock?: () => Date;
    requestTimeoutMilliseconds?: number;
    settleDelayImpl?: (milliseconds: number) => Promise<void>;
    journal: Readonly<{
      inspect: () => Readonly<{
        phase: string | null;
        uploadMode?: 'version' | null;
        predecessorDeploymentId?: string | null;
        predecessorVersionId?: string | null;
      }>;
    }>;
  }>,
): Readonly<{
  prepareUpload: (contract: Readonly<Record<string, unknown>>) => Promise<Readonly<{
    mode: 'version';
    predecessorDeploymentId: string;
    predecessorVersionId: string;
  }>>;
  uploadVersion: (
    contract: Readonly<Record<string, unknown>>,
    plan: Readonly<{
      mode: 'version';
      predecessorDeploymentId: string;
      predecessorVersionId: string;
    }>,
  ) => Promise<Readonly<{ versionId: string }>>;
  reconcileVersion: (contract: Readonly<Record<string, unknown>>) => Promise<readonly string[]>;
  inspectVersion: (versionId: string) => Promise<unknown>;
  assertPredecessorStable: (predecessor: Readonly<{
    deploymentId: string;
    versionId: string;
  }>) => Promise<void>;
  releaseVersion: (input: Readonly<{
    versionId: string;
    predecessorDeploymentId: string;
    predecessorVersionId: string;
    percentage: 100;
    message: string;
  }>) => Promise<void>;
  inspectDeployment: () => Promise<unknown>;
  dispose: () => void;
}>;
