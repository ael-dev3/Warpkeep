import type { SealedRealmsProductionActivationRecords, SealedRealmsRecoveryCandidateReadContext } from './sealed-realms-production-activation-records.mjs';
import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
type Input = Readonly<{ records: SealedRealmsProductionActivationRecords;
  privateState: SealedRealmsProductionPrivateState; authority: SealedRealmsProductionSourceAuthority;
  readContext?: SealedRealmsRecoveryCandidateReadContext }>;
/** Data only; incomplete facts never authorize a candidate or deployment. */
export function inspectSealedRealmsProductionRecoveryCandidate(input: Input): Readonly<{
  facts: Readonly<Record<string, string | number | boolean | null>>; missingFields: readonly string[] }>;
/** Throws with fixed missingFields schema names until actual producer facts exist. */
export function readSealedRealmsProductionRecoveryCandidate(input: Input): string;
