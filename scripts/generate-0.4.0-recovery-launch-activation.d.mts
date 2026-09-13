import type { SealedRealmsActivationEvidenceMember, SealedRealmsProductionAuthBridgeStateTestCapability } from './sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { SealedRealmsProductionPtrExistingStateAdoptionEvidence, SealedRealmsProductionG002ExistingStateAdoptionEvidence } from './sealed-realms-production-activation-records.mjs';
export type RecoveryActivationBootstrapFacts = Readonly<{
  preparationSourceCommit: string; moduleTreeId: string; bootstrapBlob: string; bootstrapSha256: string;
}>;
type TestOnlyBootstrapInput = Readonly<{
  capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationBootstrapFacts;
}>;
export function readRecoveryActivationBootstrapAuthority(
  authority: SealedRealmsProductionSourceAuthority, testOnly?: TestOnlyBootstrapInput,
): RecoveryActivationBootstrapFacts;
/** Evidence comparison, never generation or deployment authority. Each adoption requires its retained opaque capability. */
export function validateRecoveryLaunchActivationProjection(
  envelope: unknown, bridge: unknown, verificationTime?: string,
  existingStateAdoption?: SealedRealmsProductionPtrExistingStateAdoptionEvidence,
  g002ExistingStateAdoption?: SealedRealmsProductionG002ExistingStateAdoptionEvidence,
): Readonly<Record<string, unknown>>;
export function createRecoveryLaunchActivationBindingFromEvidence(
  envelope: unknown, member: SealedRealmsActivationEvidenceMember,
  authority: SealedRealmsProductionSourceAuthority, testOnly?: TestOnlyBootstrapInput | Readonly<{ capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationLinuxPolicyFacts }>,
  existingStateAdoption?: SealedRealmsProductionPtrExistingStateAdoptionEvidence,
  g002ExistingStateAdoption?: SealedRealmsProductionG002ExistingStateAdoptionEvidence,
): Readonly<Record<string, unknown>>;
export function generateRecoveryLaunchActivationBindingFromDescriptor(
  descriptor: number, member: SealedRealmsActivationEvidenceMember,
  authority: SealedRealmsProductionSourceAuthority, testOnly?: TestOnlyBootstrapInput | Readonly<{ capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationLinuxPolicyFacts }>,
  existingStateAdoption?: SealedRealmsProductionPtrExistingStateAdoptionEvidence,
  g002ExistingStateAdoption?: SealedRealmsProductionG002ExistingStateAdoptionEvidence,
): Readonly<Record<string, unknown>>;

export type RecoveryActivationLinuxPolicyFacts = Readonly<{ preparationSourceCommit: string; moduleTreeId: string; operatorBlob: string; operatorSha256: string }>;
export function readRecoveryActivationLinuxPolicyAuthority(authority: SealedRealmsProductionSourceAuthority, testOnly?: Readonly<{ capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationLinuxPolicyFacts }>): RecoveryActivationLinuxPolicyFacts;
