import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';

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

export function createSealedRealmsProductionActivationRecords(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  authority: SealedRealmsProductionSourceAuthority;
  /** Required for descriptors; omitted for candidate-independent receipt reads. */
  readBindingCandidate?: (preparationSourceCommit: string,
    receiptProjection?: SealedRealmsProductionRecoveryReceiptProjection) => unknown;
}>): SealedRealmsProductionActivationRecords;

export function assertSealedRealmsProductionActivationRecords(
  records: unknown,
): SealedRealmsProductionActivationRecords;

export function assertSealedRealmsProductionActivationRecordsAuthority(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  privateState: SealedRealmsProductionPrivateState;
  authority: SealedRealmsProductionSourceAuthority;
}>): SealedRealmsProductionActivationRecords;

/** Reopens the exact S-bound V2 corpus without a candidate, private bodies or writes. */
export function readSealedRealmsProductionRecoveryReceiptProjection(
  records: SealedRealmsProductionActivationRecords,
  verificationTime?: string,
): SealedRealmsProductionRecoveryReceiptProjection;

/** Data validation only; does not establish producer or deployment authority. */
export function validateSealedRealmsProductionRecoveryActivationEvidence(
  envelope: unknown,
  verificationTime?: string,
): Readonly<Record<string, unknown>>;

export function inspectSealedRealmsProductionRecoveryActivationRecords(
  records: SealedRealmsProductionActivationRecords,
  verificationTime?: string,
): Readonly<{ sourceCommit: string; schemaVersion: 2; descriptorSha256: string }>;

/** Reads a canonical schema-2 candidate and twelve non-historical private records. */
export function writeSealedRealmsProductionRecoveryActivationDescriptor(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  consumeDescriptor: (descriptor: number) => undefined;
}>): Readonly<Record<never, never>>;

/** Opens only the fixed private descriptor FD to one synchronous internal consumer. */
export function writeSealedRealmsProductionActivationDescriptor(input: Readonly<{
  records: SealedRealmsProductionActivationRecords;
  consumeDescriptor: (descriptor: number) => undefined;
}>): Readonly<Record<never, never>>;
