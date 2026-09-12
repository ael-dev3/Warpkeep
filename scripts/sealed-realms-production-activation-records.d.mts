import type { SealedRealmsProductionContinuationStore } from './sealed-realms-production-continuation.mjs';
import type { verifyPtrUpdateObservationPair } from '../services/release-recovery/src/ptrObservation.ts';
import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { PtrExistingUpdateCompletion, PtrExistingStateAdoption, PtrExistingUpdateReceipt } from './ptr-production-existing-update-adapter.mjs';

export class SealedRealmsProductionActivationRecordsError extends Error {
  readonly code: string;
  constructor(code: string);
}

declare const sealedRealmsActivationRecordsBrand: unique symbol;
export type SealedRealmsProductionActivationRecords = Readonly<{
  readonly [sealedRealmsActivationRecordsBrand]: true;
}>;

/** Scalar receipt facts only; neither producer authority nor recovery authorization. */
export type SealedRealmsProductionRecoveryReceiptProjection = Readonly<
  Record<string, string | number | boolean | null>
>;
declare const recoveryCandidateReadContext: unique symbol;
export type SealedRealmsRecoveryCandidateReadContext = Readonly<{ [recoveryCandidateReadContext]: true }>;

export function createSealedRealmsProductionActivationRecords(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  authority: SealedRealmsProductionSourceAuthority;
  /** Required for descriptors; omitted for candidate-independent receipt reads. */
  readBindingCandidate?: (preparationSourceCommit: string,
    receiptProjection?: SealedRealmsProductionRecoveryReceiptProjection,
    readContext?: SealedRealmsRecoveryCandidateReadContext) => unknown;
}>): SealedRealmsProductionActivationRecords;

export function assertSealedRealmsProductionActivationRecords(
  records: unknown,
): SealedRealmsProductionActivationRecords;

export function assertSealedRealmsProductionActivationRecordsAuthority(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  privateState: SealedRealmsProductionPrivateState;
  authority: SealedRealmsProductionSourceAuthority;
}>): SealedRealmsProductionActivationRecords;

/** Fixed private capture only; no caller receipt body, digest or path is accepted. */
export function writeSealedRealmsProductionPtrExistingUpdateRecord(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  authority: SealedRealmsProductionSourceAuthority;
  completion: PtrExistingUpdateCompletion;
}>): Readonly<{ receiptDigest: string; recordDigest: string }>;

/** Private signed V4 evidence only; does not authorize an effect or activate V3. */
export function writeSealedRealmsProductionPtrExistingStateAdoptionRecord(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  authority: SealedRealmsProductionSourceAuthority;
  adoption: PtrExistingStateAdoption;
}>): Promise<Readonly<{ receiptDigest: string; recordDigest: string }>>;

/** Reopens the exact S-bound V2 or V3 corpus without a candidate, private bodies or writes. */
export function readSealedRealmsProductionRecoveryReceiptProjection(
  records: SealedRealmsProductionActivationRecords,
  verificationTime?: string,
): SealedRealmsProductionRecoveryReceiptProjection;

/** Current corpus, or a callback-scoped completed receipt time; data only, never authority. */
export function readSealedRealmsProductionRecoveryCandidateRecords(
  records: SealedRealmsProductionActivationRecords,
  context?: SealedRealmsRecoveryCandidateReadContext,
): Readonly<{ projection: SealedRealmsProductionRecoveryReceiptProjection;
  bootstrap: Readonly<{ preparationSourceCommit: string; preparationSourceTree: string;
    bootstrapBlob: string; bootstrapSha256: string }> | Readonly<{ profile: 'warpkeep-g001-linux-policy-observation-v1'; preparationSourceCommit: string; preparationSourceTree: string; operatorBlob: string; operatorSha256: string }> }>;

/** Data validation only; does not establish producer or deployment authority. */
export function validateSealedRealmsProductionRecoveryActivationEvidence(
  envelope: unknown,
  verificationTime?: string,
): Readonly<Record<string, unknown>>;

export function inspectSealedRealmsProductionRecoveryActivationRecords(
  records: SealedRealmsProductionActivationRecords,
  verificationTime?: string,
): Readonly<{ sourceCommit: string; schemaVersion: 2 | 3; descriptorSha256: string }>;

/** Reads a canonical schema-2 or schema-3 candidate and twelve non-historical private records. */
export function writeSealedRealmsProductionRecoveryActivationDescriptor(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  consumeDescriptor: (descriptor: number) => undefined;
}>): Readonly<Record<never, never>>;

/** Opens only the fixed private descriptor FD to one synchronous internal consumer. */
export function writeSealedRealmsProductionActivationDescriptor(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  consumeDescriptor: (descriptor: number) => undefined;
}>): Readonly<Record<never, never>>;

/** Opaque retained historical evidence, not an effect or activation capability. */
declare const retainedPtrAdoptionBrand: unique symbol;
export type SealedRealmsProductionPtrExistingStateAdoptionEvidence = Readonly<{ [retainedPtrAdoptionBrand]: true }>;
export function authenticateSealedRealmsProductionPtrExistingStateAdoption(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  authority: SealedRealmsProductionSourceAuthority;
  store: SealedRealmsProductionContinuationStore;
}>): Promise<SealedRealmsProductionPtrExistingStateAdoptionEvidence>;
export function readSealedRealmsProductionPtrExistingStateAdoptionEvidence(input: Readonly<{
  evidence: SealedRealmsProductionPtrExistingStateAdoptionEvidence;
  privateState: SealedRealmsProductionPrivateState;
  sourceCommit: string;
}>): Readonly<{ sourceCommit: string; sourceTree: string; adoptionReceiptDigest: string;
  completionReceipt: PtrExistingUpdateReceipt;
  pair: Awaited<ReturnType<typeof verifyPtrUpdateObservationPair>>;
}>;
