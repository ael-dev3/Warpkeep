import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { resolveExistingAuthBridgeNotificationPreparedReceipt } from './auth-bridge-notification-prepared-receipt.mjs';
import type {
  resolveAuthBridgeNotificationPreparedOriginalUploadAuthority,
  resolveExistingAuthBridgeNotificationPreparedDeployJournal,
} from './auth-bridge-notification-prepared-deploy-journal.mjs';
import type {
  inspectAuthBridgeNotificationPreparedRecoveryAuthority,
  inspectAuthBridgeNotificationPreparedRecoverySource,
} from './auth-bridge-notification-prepared-cloudflare-runtime.mjs';

declare const providerBrand: unique symbol;
declare const observationBrand: unique symbol;
declare const testBrand: unique symbol;
export type SealedRealmsProductionBridgeProvider = Readonly<{ readonly [providerBrand]: true }>;
export type SealedRealmsProductionBridgeObservation = Readonly<{ readonly [observationBrand]: true }>;
export type SealedRealmsProductionBridgeProviderTestCapability = Readonly<{ readonly [testBrand]: true }>;

export function createSealedRealmsProductionBridgeProviderTestCapability():
  SealedRealmsProductionBridgeProviderTestCapability;

export function createSealedRealmsProductionBridgeProvider(options: Readonly<{
  authority: SealedRealmsProductionSourceAuthority;
  privateState: SealedRealmsProductionPrivateState;
  repositoryRoot: string;
  fetchImpl: typeof fetch;
  testOnlyCapability?: SealedRealmsProductionBridgeProviderTestCapability;
  testOnlyEnvironment?: NodeJS.ProcessEnv;
  testOnlyNow?: () => Date;
  testOnlyResolveReceipt?: typeof resolveExistingAuthBridgeNotificationPreparedReceipt;
  testOnlyResolveJournal?: typeof resolveExistingAuthBridgeNotificationPreparedDeployJournal;
  testOnlyResolveUpload?: typeof resolveAuthBridgeNotificationPreparedOriginalUploadAuthority;
  testOnlyInspectSource?: typeof inspectAuthBridgeNotificationPreparedRecoverySource;
  testOnlyInspectLive?: typeof inspectAuthBridgeNotificationPreparedRecoveryAuthority;
}>): SealedRealmsProductionBridgeProvider;

export function assertSealedRealmsProductionBridgeProvider(
  provider: unknown,
  authority: SealedRealmsProductionSourceAuthority,
  privateState: SealedRealmsProductionPrivateState,
  repositoryRoot: string,
): SealedRealmsProductionBridgeProvider;

export function inspectSealedRealmsProductionBridgeProvider(options: Readonly<{
  provider: SealedRealmsProductionBridgeProvider;
  preparedReceiptDigest: string;
  journalHeadDigest: string;
}>): Promise<SealedRealmsProductionBridgeObservation>;

export function consumeSealedRealmsProductionBridgeObservation(options: Readonly<{
  provider: SealedRealmsProductionBridgeProvider;
  observation: SealedRealmsProductionBridgeObservation;
  preparedReceiptDigest: string;
  journalHeadDigest: string;
  now: Date;
}>): Readonly<{
  deployment: Readonly<{
    deploymentId: string;
    workerVersionId: string;
    bridgeSourceCommit: string;
    controlPlaneAttestationDigest: string;
    publicAttestationDigest: string;
    privateAttestationDigest: string;
    observedAt: string;
  }>;
  binding: Readonly<{
    ptrDatabaseIdentity: string;
    ptrBindingDigest: string;
    ptrBindingAttestationDigest: string;
    observedAt: string;
  }>;
}>;
