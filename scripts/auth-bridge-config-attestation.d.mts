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
  notificationDeliveryEnabled: boolean;
  notificationTransportConfigured: boolean;
  notificationClientCount: number;
  publicAuthEnabled: boolean;
  accessExpectedFidRequired: boolean;
}>;

export const AUTH_BRIDGE_RELEASE_ATTESTATION_KEYS: readonly [
  'schemaVersion',
  'profile',
  'bridgeSourceCommit',
  'notificationDeliveryEnabled',
  'notificationTransportConfigured',
  'admissionNotificationStoreConfigured',
  'notificationClientCount',
  'notificationDeliveryContractDigest',
  'publicAuthEnabled',
  'accessExpectedFidRequired',
];

export type AuthBridgeReleaseAttestation = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-admission-notification-bridge-v1';
  bridgeSourceCommit: string;
  notificationDeliveryEnabled: true;
  notificationTransportConfigured: true;
  admissionNotificationStoreConfigured: true;
  notificationClientCount: 1;
  notificationDeliveryContractDigest: string;
  publicAuthEnabled: boolean;
  accessExpectedFidRequired: boolean;
}>;

export function verifyAuthBridgeRpcRoleAttestation(options?: Readonly<{
  bridgeUrl?: string;
  adminToken?: string;
  expectedPrimaryRpcUrl?: string;
  expectedSecondaryRpcUrl?: string;
  fetchImpl?: typeof fetch;
}>): Promise<AuthBridgeRpcRoleAttestation>;

export function parseAuthBridgeReleaseAttestation(
  value: unknown,
): AuthBridgeReleaseAttestation;

export function verifyAuthBridgeReleaseAttestation(options: Readonly<{
  bridgeUrl?: string;
  expected: AuthBridgeReleaseAttestation;
  fetchImpl?: typeof fetch;
}>): Promise<AuthBridgeReleaseAttestation>;

export function verifyAuthBridgePreparedConfigAttestation(options: Readonly<{
  bridgeUrl?: string;
  adminToken: string;
  expectedPrimaryRpcUrl?: string;
  expectedSecondaryRpcUrl?: string;
  expectedReleaseAttestation: AuthBridgeReleaseAttestation;
  fetchImpl?: typeof fetch;
}>): Promise<Readonly<{
  releaseAttestation: AuthBridgeReleaseAttestation;
  configurationDigest: string;
  farcasterRpcEndpointRoleFingerprints: Readonly<{
    primary: string;
    secondary: string;
  }>;
}>>;
