import type {
  SealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';
import type {
  SealedRealmsProductionSourceAuthority,
} from './sealed-realms-production-source-authority.mjs';
import type {
  SealedRealmsProductionWorkflowPermit,
} from './sealed-realms-production-workflow-authority.mjs';

export const SEALED_REALMS_PRODUCTION_CONTINUATION_KINDS: readonly [
  'g001-census-first-to-second',
  'g001-census-second-to-suspension',
  'g002-publication',
  'g002-import',
  'ptr-publication',
  'ptr-import',
  'ptr-owner-provision',
  'activation-evidence',
];
export type SealedRealmsProductionContinuationKind =
  (typeof SEALED_REALMS_PRODUCTION_CONTINUATION_KINDS)[number];

export class SealedRealmsProductionContinuationError extends Error {
  readonly code: string;
  constructor(code: string);
}

declare const sealedRealmsProductionContinuationStore: unique symbol;
export type SealedRealmsProductionContinuationStore = Readonly<{
  readonly [sealedRealmsProductionContinuationStore]: true;
}>;
declare const sealedRealmsProductionContinuationClaim: unique symbol;
export type SealedRealmsProductionContinuationClaim = Readonly<{
  readonly [sealedRealmsProductionContinuationClaim]: true;
}>;

export function createSealedRealmsProductionContinuationStore(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  clock?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
}>): SealedRealmsProductionContinuationStore;

export function assertSealedRealmsProductionContinuationStore(
  store: unknown,
): SealedRealmsProductionContinuationStore;

export type SealedRealmsProductionContinuationInput = Readonly<{
  store: SealedRealmsProductionContinuationStore;
  permit: SealedRealmsProductionWorkflowPermit;
  sourceAuthority: SealedRealmsProductionSourceAuthority;
  kind: SealedRealmsProductionContinuationKind;
  runId: string;
  runAttempt: string | number;
  subject: string;
  evidenceDigest: string;
  receiptDigests: readonly string[];
  predecessorDigests: readonly string[];
}>;

export function issueSealedRealmsProductionContinuation(
  input: SealedRealmsProductionContinuationInput,
): Promise<Readonly<{ status: 'issued' }>>;

export function claimSealedRealmsProductionContinuation(
  input: SealedRealmsProductionContinuationInput & Readonly<{
    effect: (claim: SealedRealmsProductionContinuationClaim) => unknown | Promise<unknown>;
  }>,
): Promise<Readonly<{ status: 'completed' }>>;

export function reconcileSealedRealmsProductionContinuation(
  input: SealedRealmsProductionContinuationInput & Readonly<{
    readOnlyReconcile: () => Readonly<{
      outcome: 'effect-applied' | 'no-effect';
      observationDigest: string;
    }> | Promise<Readonly<{
      outcome: 'effect-applied' | 'no-effect';
      observationDigest: string;
    }>>;
  }>,
): Promise<Readonly<{
  status: 'reconciled';
  outcome: 'effect-applied' | 'no-effect';
}>>;

export function assertSealedRealmsProductionContinuationClaim(input: Readonly<{
  claim: unknown;
  store: SealedRealmsProductionContinuationStore;
  sourceAuthority: SealedRealmsProductionSourceAuthority;
  kind: SealedRealmsProductionContinuationKind;
  runId: string;
  runAttempt: string | number;
  subject: string;
  evidenceDigest: string;
  receiptDigests: readonly string[];
  predecessorDigests: readonly string[];
}>): true;
