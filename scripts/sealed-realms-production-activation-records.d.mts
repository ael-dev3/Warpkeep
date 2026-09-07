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

export function createSealedRealmsProductionActivationRecords(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  authority: SealedRealmsProductionSourceAuthority;
  readBindingCandidate: (preparationSourceCommit: string) => unknown;
}>): SealedRealmsProductionActivationRecords;

export function assertSealedRealmsProductionActivationRecords(
  records: unknown,
): SealedRealmsProductionActivationRecords;

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
