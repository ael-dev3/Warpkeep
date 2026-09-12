import type { SealedRealmsProductionRecoveryProgramArtifacts } from './sealed-realms-production-recovery-program-artifacts.mjs';
import type { SealedRealmsProductionRecoverySourceClosure } from './sealed-realms-production-recovery-source-closure.mjs';
import type { SealedRealmsProductionRecoveryPreparation } from './sealed-realms-production-recovery-preparation.mjs';
import type { SealedRealmsProductionAuthBridgeState } from './sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsProductionActivationRecords, SealedRealmsRecoveryCandidateReadContext } from './sealed-realms-production-activation-records.mjs';
import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
type Input = Readonly<{ records: SealedRealmsProductionActivationRecords;
  privateState: SealedRealmsProductionPrivateState; authority: SealedRealmsProductionSourceAuthority;
  sourceClosure?: SealedRealmsProductionRecoverySourceClosure;
  programArtifacts?: SealedRealmsProductionRecoveryProgramArtifacts;
  preparation?: SealedRealmsProductionRecoveryPreparation;
  bridgeState?: SealedRealmsProductionAuthBridgeState;
  readContext?: SealedRealmsRecoveryCandidateReadContext }>;
/** Data only. Selects V3 from exclusive update evidence and preserves V2 wire output.
 * Reopens the configured producer workspace; missing or invalid releases refuse inspection. */
export function inspectSealedRealmsProductionRecoveryCandidate(input: Input): Readonly<{
  facts: Readonly<Record<string, string | number | boolean | null>>; missingFields: readonly string[] }>;
/** Throws with fixed missingFields schema names until actual producer facts exist. */
export function readSealedRealmsProductionRecoveryCandidate(input: Input): string;
