import type { Buffer } from 'node:buffer';
declare const providerCapability: unique symbol;
/** Credential transport only; the production factory must authenticate artifact ownership. */
export interface PtrUpdateProviderArtifact {
  readonly artifactDescriptor: number;
  readonly moduleSha256: string;
  readonly spacetimeExecutable: string;
  readonly spacetimeExecutableSha256: string;
  readonly spacetimeCliRootDirectory: string;
  readonly spacetimeCliConfigPath: string;
  readonly spacetimeCliConfigSha256: string;
  readonly assertSourceAndArtifact: () => void;
  readonly assertCliConfig: () => void;
}
export interface PtrUpdateProviderCredentials { readonly [providerCapability]: true }
export type PtrUpdateProviderRequest = { readonly operation: 'metadata' | 'schema' | 'health' | 'plan' }
  | { readonly operation: 'apply'; readonly migrationToken: string; readonly beforeSend: () => void | Promise<void> };
export function createPtrUpdateProviderCredentials(input: { readonly artifact: PtrUpdateProviderArtifact }): PtrUpdateProviderCredentials;
/** Identity is the local CLI assertion, not a server-authenticated owner proof. Health sends no authorization header. */
export function requestPtrUpdateProvider(capability: PtrUpdateProviderCredentials, input: PtrUpdateProviderRequest): Promise<Readonly<{ bytes: Buffer; claimedProviderIdentity: string }>>;
export function disposePtrUpdateProviderCredentials(capability: PtrUpdateProviderCredentials): void;
