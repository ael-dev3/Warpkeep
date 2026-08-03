export const DEFAULT_AUTH_BRIDGE_URL: string;
export const DEFAULT_FARCASTER_RPC_PRIMARY_URL: string;
export const DEFAULT_FARCASTER_RPC_SECONDARY_URL: string;

export function normalizeExpectedRpcUrl(value: string, label: string): string;
export function farcasterRpcEndpointFingerprint(rpcUrl: string): string;

export type AuthBridgeRpcRoleAttestation = Readonly<{
  profile: 'warpkeep-auth-v2';
  digest: string;
  farcasterRpcEndpointRoleFingerprints: Readonly<{
    primary: string;
    secondary: string;
  }>;
}>;

export function verifyAuthBridgeRpcRoleAttestation(options?: Readonly<{
  bridgeUrl?: string;
  adminToken?: string;
  expectedPrimaryRpcUrl?: string;
  expectedSecondaryRpcUrl?: string;
  fetchImpl?: typeof fetch;
}>): Promise<AuthBridgeRpcRoleAttestation>;
