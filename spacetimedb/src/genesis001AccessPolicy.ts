export type Genesis001AccessPolicyErrorCode =
  | 'PLAYER_ACCESS_SEALED'
  | 'ADMISSIONS_SEALED'
  | 'ACCESS_REQUESTS_SEALED';

/**
 * Genesis 001 remains permanently bound to its 0.3.43 population. These
 * values are compiled into the module so no host flag can reopen admission.
 */
export const GENESIS_001_ACCESS_POLICY = Object.freeze({
  realmId: 'GENESIS_001',
  releaseVersion: '0.3.43',
  playerAccessEnabled: true,
  admissionStateMutationsEnabled: false,
  accessRequestSubmissionsEnabled: false,
} as const);

export class Genesis001AccessPolicyError extends Error {
  readonly code: Genesis001AccessPolicyErrorCode;

  constructor(code: Genesis001AccessPolicyErrorCode) {
    super(code);
    this.name = 'Genesis001AccessPolicyError';
    this.code = code;
  }
}

function requireEnabled(
  enabled: boolean,
  code: Genesis001AccessPolicyErrorCode,
): void {
  if (!enabled) throw new Genesis001AccessPolicyError(code);
}

export function requireGenesis001PlayerAccessEnabled(): void {
  requireEnabled(
    GENESIS_001_ACCESS_POLICY.playerAccessEnabled,
    'PLAYER_ACCESS_SEALED',
  );
}

export function requireGenesis001AdmissionStateMutationEnabled(): void {
  requireEnabled(
    GENESIS_001_ACCESS_POLICY.admissionStateMutationsEnabled,
    'ADMISSIONS_SEALED',
  );
}

export function requireGenesis001AccessRequestSubmissionEnabled(): void {
  requireEnabled(
    GENESIS_001_ACCESS_POLICY.accessRequestSubmissionsEnabled,
    'ACCESS_REQUESTS_SEALED',
  );
}
