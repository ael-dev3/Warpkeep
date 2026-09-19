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
export function createSealedRealmsProductionRecoveryAdoptionProgramArtifacts(
  input: Parameters<typeof createSealedRealmsProductionRecoveryProgramArtifacts>[0],
): Promise<SealedRealmsProductionRecoveryProgramArtifacts>;
export function readSealedRealmsProductionRecoveryAdoptionProgramComparison(input: Readonly<{
  capability: SealedRealmsProductionRecoveryProgramArtifacts;
  privateState: SealedRealmsProductionPrivateState;
  authority: SealedRealmsProductionSourceAuthority;
  ptrSourceCommit: string; g002SourceCommit: string;
}>): Readonly<{ sourceCommit: string; sourceTree: string;
  g002: Readonly<{ programArtifactSha256: string; programKeccak256: string; moduleTreeId: string; dependencyClosureDigest: string }>;
  ptr: Readonly<{ programArtifactSha256: string; moduleTreeId: string; dependencyClosureDigest: string }> }>;
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
