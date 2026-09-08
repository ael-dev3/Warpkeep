import type { SealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import type { SealedRealmsProductionSourceAuthority } from "./sealed-realms-production-source-authority.mjs";
import type {
  SealedRealmsProductionActivationRecords,
  SealedRealmsRecoveryCandidateReadContext,
} from "./sealed-realms-production-activation-records.mjs";
declare const brand: unique symbol;
export type SealedRealmsProductionRecoveryProgramArtifacts = Readonly<{
  [brand]: true;
}>;
export function createSealedRealmsProductionRecoveryProgramArtifacts(
  input: Readonly<{
    privateState: SealedRealmsProductionPrivateState;
    authority: SealedRealmsProductionSourceAuthority;
  }>,
): Promise<SealedRealmsProductionRecoveryProgramArtifacts>;
export function readSealedRealmsProductionRecoveryProgramArtifacts(
  input: Readonly<{
    capability: SealedRealmsProductionRecoveryProgramArtifacts;
    privateState: SealedRealmsProductionPrivateState;
    authority: SealedRealmsProductionSourceAuthority;
    records: SealedRealmsProductionActivationRecords;
    readContext?: SealedRealmsRecoveryCandidateReadContext;
  }>,
): Readonly<{
  g001ExpectedProgramKeccak256: string;
  g002ExpectedProgramKeccak256: string;
}>;
export function disposeSealedRealmsProductionRecoveryProgramArtifacts(
  capability: SealedRealmsProductionRecoveryProgramArtifacts,
): void;
