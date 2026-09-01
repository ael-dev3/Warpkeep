import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';

export const SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_PROFILE:
  'warpkeep-sealed-realms-auth-bridge-import-authority-v1';
export const SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RECEIPT_PROFILE:
  'warpkeep-sealed-realms-auth-bridge-suspension-private-v1';
export const SEALED_REALMS_AUTH_BRIDGE_ACCESS_REQUEST_URL:
  'https://auth.warpkeep.com/v2/access/request';

export class SealedRealmsProductionAuthBridgeStateError extends Error {
  readonly code: string;
  constructor(code: string);
}

declare const sealedRealmsAuthBridgeTestOnlyCapability: unique symbol;
export type SealedRealmsProductionAuthBridgeStateTestCapability = Readonly<{
  readonly [sealedRealmsAuthBridgeTestOnlyCapability]: true;
}>;
export function createSealedRealmsProductionAuthBridgeStateTestCapability():
  SealedRealmsProductionAuthBridgeStateTestCapability;

export type SealedRealmsAdmissionSuspensionObservation = Readonly<{
  postNoRedirect: true;
  postContentType: 'application/json; charset=utf-8';
  postAccessControlAllowOrigin: 'https://warpkeep.com';
  postProbeStatus: 503;
  postProbeDigest: string;
  optionsNoRedirect: true;
  optionsContentType: 'application/json; charset=utf-8';
  optionsAccessControlAllowOrigin: 'https://warpkeep.com';
  optionsProbeStatus: 503;
  optionsProbeDigest: string;
}>;

export function inspectSealedRealmsAdmissionSuspension(options: Readonly<{
  fetchImpl: typeof fetch;
}>): Promise<SealedRealmsAdmissionSuspensionObservation>;

export function assertSealedRealmsAdmissionSuspensionObservation(
  observation: SealedRealmsAdmissionSuspensionObservation,
): SealedRealmsAdmissionSuspensionObservation;

declare const sealedRealmsBridgeGateConfirmation: unique symbol;
export type SealedRealmsBridgeGateConfirmation = Readonly<{
  readonly [sealedRealmsBridgeGateConfirmation]: true;
}>;

declare const sealedRealmsActivationEvidenceConfirmation: unique symbol;
export type SealedRealmsActivationEvidenceConfirmation = Readonly<{
  readonly [sealedRealmsActivationEvidenceConfirmation]: true;
}>;

declare const sealedRealmsActivationEvidenceMember: unique symbol;
/** Opaque private member which only a captured Task 6E generator may receive. */
export type SealedRealmsActivationEvidenceMember = Readonly<{
  readonly [sealedRealmsActivationEvidenceMember]: true;
}>;
export type SealedRealmsActivationEvidenceProjection = Readonly<{
  authBridgeSuspensionPrivateReceipt: Readonly<{
    schemaVersion: 1;
    profile: 'warpkeep-sealed-realms-auth-bridge-suspension-private-v1';
    sourceCommit: string;
    deploymentAuthority: Readonly<Record<string, unknown>>;
    g002Gate: Readonly<Record<string, unknown>>;
    g002ImportAuthorityCrossLink: Readonly<Record<string, unknown>>;
    ptrGate: Readonly<Record<string, unknown>>;
    ptrImportAuthorityCrossLink: Readonly<Record<string, unknown>>;
    activationGate: Readonly<Record<string, unknown>>;
  }>;
}>;

declare const sealedRealmsActivationEvidenceGenerator: unique symbol;
/** Fixed Task 6E generator capability; it cannot be provided to dispatch. */
export type SealedRealmsProductionActivationEvidenceGenerator = Readonly<{
  readonly [sealedRealmsActivationEvidenceGenerator]: true;
}>;

export type SealedRealmsBridgeAuthorityContext = Readonly<{
  sourceCommit: string;
  deploymentId: string;
  workerVersionId: string;
  ptrDatabaseIdentity: string;
  ptrBindingDigest: string;
}>;

export type SealedRealmsImportReceiptResolution =
  | Readonly<SealedRealmsBridgeAuthorityContext & {
    disposition: 'adopted';
    receiptDigest: string;
  }>
  | Readonly<SealedRealmsBridgeAuthorityContext & {
    disposition: 'no-effect';
    noEffectDigest: string;
  }>;

export type SealedRealmsOwnerProvisionReceipt = Readonly<
  SealedRealmsBridgeAuthorityContext & {
    receiptDigest: string;
    provisionReceiptDigest: string;
  }
>;

declare const sealedRealmsOwnerProvisionConfirmation: unique symbol;
export type SealedRealmsOwnerProvisionConfirmation = Readonly<{
  readonly [sealedRealmsOwnerProvisionConfirmation]: true;
}>;

export type SealedRealmsProductionAuthBridgeState = Readonly<{
  establish: () => Promise<Readonly<{ ready: true }>>;
  inspect: () => Promise<Readonly<{
    g002Sealed: boolean;
    ptrSealed: boolean;
    complete: boolean;
  }>>;
  inspectGate: (input: Readonly<{ lane: 'g002' | 'ptr' }>) => Promise<Readonly<{
    confirmation: SealedRealmsBridgeGateConfirmation;
  }>>;
  applyGate: (input: Readonly<{
    confirmation: SealedRealmsBridgeGateConfirmation;
    apply: () => unknown | Promise<unknown>;
  }>) => Promise<Readonly<{ status: 'cross-linked' }>>;
  inspectOwnerProvisionEvidence: (input: Readonly<{
    inspect: () => Readonly<{ receiptDigest: string; inspectionDigest: string }>
      | Promise<Readonly<{ receiptDigest: string; inspectionDigest: string }>>;
  }>) => Promise<Readonly<{ confirmation: SealedRealmsOwnerProvisionConfirmation }>>;
  applyOwnerProvision: (input: Readonly<{
    confirmation: SealedRealmsOwnerProvisionConfirmation;
    provision: () => Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>
      | Promise<Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>>;
  }>) => Promise<Readonly<Record<never, never>>>;
  inspectLiveEvidence: (input:
    | Readonly<{
      lane: 'g002';
      inspect: () => Readonly<{ receiptDigest: string; evidenceDigest: string }>
        | Promise<Readonly<{ receiptDigest: string; evidenceDigest: string }>>;
    }>
    | Readonly<{
      lane: 'ptr';
      inspect: () => Readonly<{
        receiptDigest: string;
        provisionReceiptDigest: string;
        evidenceDigest: string;
      }> | Promise<Readonly<{
        receiptDigest: string;
        provisionReceiptDigest: string;
        evidenceDigest: string;
      }>>;
    }>,
  ) => Promise<Readonly<Record<never, never>>>;
  inspectActivationEvidence: () => Promise<Readonly<{
    confirmation: SealedRealmsActivationEvidenceConfirmation;
  }>>;
}>;

export function createSealedRealmsProductionAuthBridgeState(options: Readonly<{
  authority: SealedRealmsProductionSourceAuthority;
  privateState: SealedRealmsProductionPrivateState;
  repositoryRoot: string;
  /** Test-only substitute for the trusted account home. */
  reportedHome?: string;
  deploymentAttester: (context: Readonly<{
    sourceCommit: string;
    runId: string;
    runAttempt: number;
  }>) => unknown | Promise<unknown>;
  bindingAttester: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  fetchImpl: typeof fetch;
  inspectImportReceipt: (context: Readonly<SealedRealmsBridgeAuthorityContext & {
    lane: 'g002' | 'ptr';
  }>) => SealedRealmsImportReceiptResolution | Promise<SealedRealmsImportReceiptResolution>;
  authenticateImportResult: (context: Readonly<SealedRealmsBridgeAuthorityContext & {
    lane: 'g002' | 'ptr';
    result: unknown;
  }>) => Extract<SealedRealmsImportReceiptResolution, { disposition: 'adopted' }>
    | Promise<Extract<SealedRealmsImportReceiptResolution, { disposition: 'adopted' }>>;
  resolveOwnerProvisionReceipt: (context: Readonly<SealedRealmsBridgeAuthorityContext & {
    receiptDigest: string;
  }>) => SealedRealmsOwnerProvisionReceipt | Promise<SealedRealmsOwnerProvisionReceipt>;
  /** Test-only deterministic clock; requires testOnlyCapability. */
  now?: () => Date;
  /** Test-only deterministic randomness; requires testOnlyCapability. */
  randomBytesImpl?: (length: number) => Uint8Array;
  testOnlyCapability?: SealedRealmsProductionAuthBridgeStateTestCapability;
  testOnlyResolvePreparedReceipt?: (input: unknown) => unknown | Promise<unknown>;
  testOnlyResolveCompletedJournal?: (input: unknown) => unknown | Promise<unknown>;
}>): SealedRealmsProductionAuthBridgeState;

export function assertSealedRealmsProductionAuthBridgeState(
  state: unknown,
): SealedRealmsProductionAuthBridgeState;

export function assertSealedRealmsProductionAuthBridgeStateAuthority(
  state: SealedRealmsProductionAuthBridgeState,
  authority: SealedRealmsProductionSourceAuthority,
): SealedRealmsProductionAuthBridgeState;

export function createSealedRealmsProductionActivationEvidenceGenerator(input: Readonly<{
  generate: (input: Readonly<{
    member: SealedRealmsActivationEvidenceMember;
  }>) => unknown | Promise<unknown>;
}>): SealedRealmsProductionActivationEvidenceGenerator;

export function assertSealedRealmsProductionActivationEvidenceGenerator(
  generator: unknown,
): SealedRealmsProductionActivationEvidenceGenerator;

export function assertSealedRealmsProductionActivationEvidenceMember(
  member: unknown,
): SealedRealmsActivationEvidenceMember;

export function readSealedRealmsProductionActivationEvidenceMember(
  member: unknown,
): SealedRealmsActivationEvidenceProjection;

export function consumeSealedRealmsProductionActivationEvidenceConfirmation(
  confirmation: SealedRealmsActivationEvidenceConfirmation,
): Promise<Readonly<Record<never, never>>>;

export function consumeSealedRealmsProductionActivationEvidenceForGenerator(input: Readonly<{
  confirmation: SealedRealmsActivationEvidenceConfirmation;
  generator: SealedRealmsProductionActivationEvidenceGenerator;
}>): Promise<Readonly<Record<never, never>>>;
