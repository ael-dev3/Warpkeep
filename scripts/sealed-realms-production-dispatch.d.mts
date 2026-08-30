import type {
  SEALED_REALMS_OPERATIONS,
  SealedRealmsProductionSourceAuthority,
} from './sealed-realms-production-source-authority.mjs';
import type {
  SealedRealmsActivationEvidenceConfirmation,
  SealedRealmsBridgeGateConfirmation,
  SealedRealmsOwnerProvisionConfirmation,
} from './sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsPublicationConfirmation } from './sealed-realms-production-reconciliation.mjs';

export class SealedRealmsProductionDispatcherError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type SealedRealmsProductionOperation = (typeof SEALED_REALMS_OPERATIONS)[number];
export type SealedRealmsProductionSafeStatus =
  | 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE'
  | 'activation-evidence-inspected'
  | 'completed'
  | 'cross-linked'
  | 'current-state-inspected'
  | 'import-inspected'
  | 'live-inspected'
  | 'owner-provision-inspected'
  | 'owner-provisioned'
  | 'preflight-inspected'
  | 'publish-inspected'
  | 'submitted'
  | 'unavailable';
export type SealedRealmsProductionOpaqueConfirmation =
  | SealedRealmsPublicationConfirmation
  | SealedRealmsBridgeGateConfirmation
  | SealedRealmsOwnerProvisionConfirmation
  | SealedRealmsActivationEvidenceConfirmation;

export type SealedRealmsProductionLane = Readonly<{
  execute: (input: Readonly<{
    operation: SealedRealmsProductionOperation;
    authority: SealedRealmsProductionSourceAuthority;
    input?: Readonly<{ confirmation: SealedRealmsProductionOpaqueConfirmation }>;
  }>) => Readonly<{
    status?: SealedRealmsProductionSafeStatus;
    ready?: boolean;
    confirmation?: SealedRealmsProductionOpaqueConfirmation;
  }> | Promise<Readonly<{
    status?: SealedRealmsProductionSafeStatus;
    ready?: boolean;
    confirmation?: SealedRealmsProductionOpaqueConfirmation;
  }>>;
}>;

export type SealedRealmsProductionDispatcher = Readonly<{
  dispatch: (request: Readonly<{
    operation: SealedRealmsProductionOperation;
    workflowInputSha: string;
    input?: Readonly<{ confirmation: SealedRealmsProductionOpaqueConfirmation }>;
  }>) => Promise<Readonly<{
    operation: string;
    status?: SealedRealmsProductionSafeStatus;
    ready?: boolean;
    confirmation?: SealedRealmsProductionOpaqueConfirmation;
  }>>;
}>;

export function createSealedRealmsProductionDispatcher(input: Readonly<{
  readGit: (arguments_: readonly string[]) => Uint8Array | string;
  readBinding: (commit: string) => Readonly<Record<string, unknown>>;
  verifyEvidence: (commit: string) => Readonly<{ verifiedSha: string }>;
  g001Lane?: SealedRealmsProductionLane;
  g002Lane?: SealedRealmsProductionLane;
  ptrLane?: SealedRealmsProductionLane;
  activationLane?: SealedRealmsProductionLane;
  /** Test-only narrow lane seams. */
  testOnlyLanes?: Readonly<{
    g001?: SealedRealmsProductionLane;
    g002?: SealedRealmsProductionLane;
    ptr?: SealedRealmsProductionLane;
    activation?: SealedRealmsProductionLane;
  }>;
}>): SealedRealmsProductionDispatcher;

export function assertSealedRealmsProductionDispatcher(
  dispatcher: unknown,
): SealedRealmsProductionDispatcher;
