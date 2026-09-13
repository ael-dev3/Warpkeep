import { recoveryBindingCandidate } from './recoveryBindingCandidate';

export const g002AdoptionKeys = [
  'g002ExistingUpdateReceiptDigest', 'g002ExistingUpdateReceiptCommitment',
  'g002ExistingStateAdoptionReceiptDigest', 'g002ExistingStateAdoptionReceiptCommitment',
  'g002DatabaseIdentity', 'g002ExpectedProgramKeccak256', 'g002ModuleSourceCommit',
  'g002ModuleSha256', 'g002ModuleTreeId', 'g002DependencyClosureDigest',
  'g002SpacetimeExecutableSha256', 'g002SpacetimeCliConfigSha256',
  'g002AtlasSourceCommit', 'g002AtlasId', 'g002PublicReleaseId', 'g002PublicApprovalReceiptId',
  'g002ReleaseVersion', 'g002ReleaseSha256', 'g002ReleaseHeaderSha256', 'g002VerificationDigest',
  'g002AtlasReady', 'g002Sealed', 'g002PopulationGuardPassed', 'g002PlayerCount',
  'g002GeneralAdmissionCount', 'g002AdmissionsOpen', 'g002AccessRequestsOpen',
  'g002ExpectedSealedStateHmacSha256',
] as const;
const ptrAdoptionKeys = [
  'ptrExistingUpdateReceiptDigest', 'ptrExistingUpdateReceiptCommitment',
  'ptrExistingStateAdoptionReceiptDigest', 'ptrExistingStateAdoptionReceiptCommitment',
  'ptrDatabaseIdentity', 'ptrExpectedProgramKeccak256', 'ptrModuleSourceCommit',
  'ptrModuleSha256', 'ptrModuleTreeId', 'ptrDependencyClosureDigest',
  'ptrSpacetimeExecutableSha256', 'ptrSpacetimeCliConfigSha256',
  'ptrAtlasSourceCommit', 'ptrAtlasId', 'ptrPublicReleaseId', 'ptrPublicApprovalReceiptId',
  'ptrReleaseVersion', 'ptrExpectedReleaseSha256', 'ptrReleaseHeaderSha256', 'ptrVerificationDigest',
  'ptrAtlasReady', 'ptrSealed', 'ptrPopulationGuardPassed', 'ptrSingletonOwnerCount',
  'ptrOwnerEnabled', 'ptrGeneralAdmissionCount', 'ptrAdmissionsOpen', 'ptrAccessRequestsOpen',
  'ptrExpectedSealedStateHmacSha256', 'ptrExpectedOwnerInvariantHmacSha256',
];
export const g002PtrAdoptionKeys = Object.keys(recoveryBindingCandidate()).flatMap(key =>
  key === 'g002PublishReceiptDigest' ? [...g002AdoptionKeys]
    : key === 'ptrPublishReceiptDigest' ? ptrAdoptionKeys
      : key.startsWith('g002') || key.startsWith('ptr') || key === 'admissionNotificationsEnabled' ? [] : [key]);

/** Synthetic public scalars only; no signature, preserved-state or deployment authority. */
export function recoveryG002PtrAdoptionCandidate(): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = {
    ...recoveryBindingCandidate(), schemaVersion: 5,
    profile: 'warpkeep-0.4.0-sealed-launch-g002-ptr-adoption-v5',
    g002ExistingUpdateReceiptDigest: '1'.repeat(64), g002ExistingUpdateReceiptCommitment: null,
    g002ExistingStateAdoptionReceiptDigest: '2'.repeat(64), g002ExistingStateAdoptionReceiptCommitment: null,
    g002ReleaseVersion: '0.4.0', g002Sealed: true, g002PopulationGuardPassed: true,
    g002PlayerCount: 0, g002GeneralAdmissionCount: 0, g002AdmissionsOpen: false, g002AccessRequestsOpen: false,
    g002ExpectedSealedStateHmacSha256: '3'.repeat(64),
    ptrExistingUpdateReceiptDigest: '9'.repeat(64), ptrExistingUpdateReceiptCommitment: null,
    ptrExistingStateAdoptionReceiptDigest: '8'.repeat(64), ptrExistingStateAdoptionReceiptCommitment: null,
    ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1,
    ptrGeneralAdmissionCount: 0, ptrExpectedSealedStateHmacSha256: '7'.repeat(64),
    ptrExpectedOwnerInvariantHmacSha256: '6'.repeat(64),
  };
  return Object.fromEntries(g002PtrAdoptionKeys.map(key => [key, values[key]!]));
}
