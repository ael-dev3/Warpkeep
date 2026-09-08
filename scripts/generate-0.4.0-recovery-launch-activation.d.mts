import type { SealedRealmsActivationEvidenceMember, SealedRealmsProductionAuthBridgeStateTestCapability } from './sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
export type RecoveryActivationBootstrapFacts = Readonly<{
  preparationSourceCommit: string; moduleTreeId: string; bootstrapBlob: string; bootstrapSha256: string;
}>;
type TestOnlyBootstrapInput = Readonly<{
  capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationBootstrapFacts;
}>;
export function readRecoveryActivationBootstrapAuthority(
  authority: SealedRealmsProductionSourceAuthority, testOnly?: TestOnlyBootstrapInput,
): RecoveryActivationBootstrapFacts;
/** Pure data comparison, never generation or deployment authority. */
export function validateRecoveryLaunchActivationProjection(
  envelope: unknown, bridge: unknown, verificationTime?: string,
): Readonly<Record<string, unknown>>;
export function createRecoveryLaunchActivationBindingFromEvidence(
  envelope: unknown, member: SealedRealmsActivationEvidenceMember,
  authority: SealedRealmsProductionSourceAuthority, testOnly?: TestOnlyBootstrapInput | Readonly<{ capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationLinuxPolicyFacts }>,
): Readonly<Record<string, unknown>>;
export function generateRecoveryLaunchActivationBindingFromDescriptor(
  descriptor: number, member: SealedRealmsActivationEvidenceMember,
  authority: SealedRealmsProductionSourceAuthority, testOnly?: TestOnlyBootstrapInput | Readonly<{ capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationLinuxPolicyFacts }>,
): Readonly<Record<string, unknown>>;

export type RecoveryActivationLinuxPolicyFacts = Readonly<{ preparationSourceCommit: string; moduleTreeId: string; operatorBlob: string; operatorSha256: string }>;
export function readRecoveryActivationLinuxPolicyAuthority(authority: SealedRealmsProductionSourceAuthority, testOnly?: Readonly<{ capability: SealedRealmsProductionAuthBridgeStateTestCapability; facts: RecoveryActivationLinuxPolicyFacts }>): RecoveryActivationLinuxPolicyFacts;
