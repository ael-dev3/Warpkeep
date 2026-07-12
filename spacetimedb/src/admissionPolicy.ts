export interface AllowedFidAdmissionState {
  enabled: boolean;
  authEpoch: number;
}

export type AdmissionEpochDecision =
  | 'missing'
  | 'disabled'
  | 'epoch_mismatch'
  | 'current';

export function evaluateAdmissionEpoch(
  allowed: AllowedFidAdmissionState | null,
  tokenAuthEpoch: number,
): AdmissionEpochDecision {
  if (allowed === null) return 'missing';
  if (!allowed.enabled) return 'disabled';
  if (allowed.authEpoch !== tokenAuthEpoch) return 'epoch_mismatch';
  return 'current';
}
