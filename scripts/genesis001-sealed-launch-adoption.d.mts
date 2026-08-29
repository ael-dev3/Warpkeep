export const GENESIS_001_FREEZE_PUBLISH_SOURCE_COMMIT: string;
export const GENESIS_001_FREEZE_PUBLISH_RECEIPT_BASENAME: string;
export const GENESIS_001_FREEZE_PUBLISH_RECEIPT_SHA256: string;
export const GENESIS_001_DATABASE_IDENTITY: string;
export const GENESIS_001_SOURCE_BASELINE_COMMIT: string;
export const GENESIS_001_BASELINE_ABI_SHA256: string;
export const GENESIS_001_FREEZE_RELEASE_NONCE: string;
export const GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE: string;
export const GENESIS_001_LIVE_POLICY_OBSERVATION_PROFILE: string;
export const GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_PROFILE: string;
export const GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE: string;

export const GENESIS_001_FREEZE_ADOPTION_AUTHORITY: Readonly<{
  freezePublishSourceCommit: string;
  freezePublishReceiptBasename: string;
  freezePublishReceiptDigest: string;
}>;

export class Genesis001SealedLaunchAdoptionError extends Error {
  readonly code: string;
}

export function genesis001PolicyReceiptDigest(value: unknown): string;
export function genesis001PolicyObservationBootstrapReceiptDigest(
  value: unknown,
): string;
export function genesis001FreezePublishReceiptDigest(value: unknown): string;
export function genesis001CensusOpaqueProofDigest(value: unknown): string;
export function genesis001MonitorSuspensionReceiptDigest(value: unknown): string;
export function genesis001AdmissionMonitorCurrentStateReceiptDigest(
  value: unknown,
): string;

export type Genesis001SealedLaunchPublicEvidence = Readonly<{
  g001DatabaseIdentity: string;
  g001SourceBaselineCommit: string;
  g001BaselineAbiSha256: string;
  g001FreezeReleaseNonce: string;
  g001FreezePublishReceiptDigest: string;
  g001PolicyReceiptDigest: string;
  g001PolicyObservationBootstrapReceiptDigest: string;
  g001PolicySourceCommit: string;
  g001ReleaseVersion: '0.3.43';
  g001PlayerAccessEnabled: true;
  g001AdmissionStateMutationsEnabled: false;
  g001AccessRequestSubmissionsEnabled: false;
  g001CensusPrivacySafeReceiptProfile: string;
  g001CensusPrivacySafeReceiptDigest: string;
  admissionMonitorSuspensionReceiptDigest: string;
  admissionMonitorCurrentStateReceiptDigest: string;
  admissionMonitorDisabled: true;
  admissionMonitorLoaded: false;
}>;

export function deriveGenesis001SealedLaunchEvidence(
  value: unknown,
): Genesis001SealedLaunchPublicEvidence;

export function deriveGenesis001SealedLaunchEvidenceForTesting(
  value: unknown,
  authority: Readonly<{
    freezePublishSourceCommit: string;
    freezePublishReceiptBasename: string;
    freezePublishReceiptDigest: string;
  }>,
  verificationTime: Date,
): Genesis001SealedLaunchPublicEvidence;
