export const ADMISSION_REQUEST_SUSPENSION_PROFILE:
  'warpkeep-admission-request-suspension-live-v1';
export const ADMISSION_REQUEST_SUSPENSION_BRIDGE:
  'https://auth.warpkeep.com';

export class AdmissionRequestSuspensionVerificationError extends Error {
  readonly code: string;
}

export type AdmissionRequestSuspensionReceipt = Readonly<{
  schemaVersion: 1;
  profile: typeof ADMISSION_REQUEST_SUSPENSION_PROFILE;
  bridgeOrigin: typeof ADMISSION_REQUEST_SUSPENSION_BRIDGE;
  requestPath: '/v2/access/request';
  postStatus: 503;
  optionsStatus: 503;
  errorCode: 'admission_requests_suspended';
  errorMessage: 'New admission requests are temporarily suspended.';
  statusPath: '/v2/access/status';
  statusOptionsStatus: 204;
  requestSubmissionsSuspended: true;
  readOnlyStatusAvailable: true;
}>;

export function verifyAdmissionRequestSuspensionLive(input: Readonly<{
  bridgeOrigin: typeof ADMISSION_REQUEST_SUSPENSION_BRIDGE;
  fetchImpl?: typeof fetch;
}>): Promise<Readonly<{
  receipt: AdmissionRequestSuspensionReceipt;
  receiptSha256: string;
}>>;
