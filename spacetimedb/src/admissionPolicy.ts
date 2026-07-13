import { MAX_AUTH_EPOCH } from './config';

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

export type AuthResolverAdmission = Readonly<{
  state: 'missing' | 'disabled' | 'enabled';
  authEpoch: number;
}>;

export class InvalidAdmissionEpochStateError extends Error {
  constructor() {
    super('INVALID_AUTH_EPOCH_STATE');
    this.name = 'InvalidAdmissionEpochStateError';
  }
}

/**
 * Expose only the admission fact needed to mint a player token. Epoch zero is
 * reserved as the non-enabled sentinel and can never be returned as enabled.
 */
export function resolveAuthResolverAdmission(
  allowed: AllowedFidAdmissionState | null,
): AuthResolverAdmission {
  if (allowed === null) return { state: 'missing', authEpoch: 0 };
  if (!allowed.enabled) return { state: 'disabled', authEpoch: 0 };
  if (
    !Number.isInteger(allowed.authEpoch) ||
    allowed.authEpoch < 1 ||
    allowed.authEpoch > MAX_AUTH_EPOCH
  ) {
    throw new InvalidAdmissionEpochStateError();
  }
  return { state: 'enabled', authEpoch: allowed.authEpoch };
}
