export const AUTH_BRIDGE_NOTIFICATION_PREPARED_CLOUDFLARE_API_ORIGIN:
  'https://api.cloudflare.com';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_SOURCE_DIGEST_PROFILE:
  'warpkeep-auth-bridge-wrangler-multipart-v1';

export class AuthBridgeNotificationPreparedCloudflareRuntimeError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export type AuthBridgeNotificationPreparedModule = Readonly<{
  name: string;
  field?: string;
  contentType: string;
  bytes: Buffer;
}>;

export function authBridgeNotificationPreparedSourceDigest(
  modules: readonly AuthBridgeNotificationPreparedModule[],
): string;

export function parseAuthBridgeNotificationPreparedMultipart(
  body: Buffer,
  contentType: string,
): readonly (AuthBridgeNotificationPreparedModule & Readonly<{ field: string }>)[];

export function inspectAuthBridgeNotificationPreparedMultipart(
  body: Buffer,
  contentType: string,
): Readonly<{
  metadata: Readonly<Record<string, unknown>>;
  sourceDigest: string;
  modules: readonly AuthBridgeNotificationPreparedModule[];
}>;

export function buildAuthBridgeNotificationPreparedWranglerMultipart(
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

export function projectAuthBridgeNotificationPreparedCloudflareVersion(
  options: Readonly<{
    value: unknown;
    contract: Readonly<Record<string, unknown>>;
    sourceDigest: string;
  }>,
): Readonly<Record<string, unknown>>;

export function createAuthBridgeNotificationPreparedCloudflareRuntime(
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
    journal: Readonly<{ inspect: () => Readonly<{ phase: string | null }> }>;
  }>,
): Readonly<{
  uploadVersion: (contract: Readonly<Record<string, unknown>>) => Promise<Readonly<{ versionId: string }>>;
  reconcileVersion: (contract: Readonly<Record<string, unknown>>) => Promise<readonly string[]>;
  inspectVersion: (versionId: string) => Promise<unknown>;
  releaseVersion: (input: Readonly<{ versionId: string; percentage: 100; message: string }>) => Promise<void>;
  inspectDeployment: () => Promise<unknown>;
  dispose: () => void;
}>;
