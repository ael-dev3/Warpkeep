import {
  ADMISSIONS_SUSPENDED_NOTICE,
  NEW_ADMISSIONS_SUSPENDED
} from '../../release/admissionLaunchPolicy';
import {
  GENESIS_001_PRESERVED_RELEASE_VERSION,
  GENESIS_002_SEALED_RELEASE_VERSION,
  PTR_RELEASE_VERSION
} from '../../release/realmReleaseIdentity';

export { ADMISSIONS_SUSPENDED_NOTICE, NEW_ADMISSIONS_SUSPENDED };

export const GENESIS_001_ID = 'genesis-001' as const;
export const GENESIS_002_ID = 'genesis-002' as const;
export const PTR_ID = 'ptr' as const;

export type RealmId = typeof GENESIS_001_ID | typeof GENESIS_002_ID | typeof PTR_ID;
export type RealmAdmission = 'admitted' | 'not-admitted' | 'unknown';
export type PtrRealmAuthority = Readonly<{
  source: 'server-verified';
  admission: RealmAdmission;
}>;

export type RealmChoice = Readonly<{
  id: RealmId;
  label: string;
  version: string;
  admission: RealmAdmission;
  statusLabel: 'Admitted' | 'Not admitted' | 'Access unknown';
  tooltip: string;
}>;

const GENESIS_001_ADMITTED_TOOLTIP =
  'Admitted to Genesis 001. Your existing 0.3.43 access is preserved.';
const GENESIS_001_UNVERIFIED_TOOLTIP =
  'Not admitted or not signed in. Sign in to verify existing admission. New admissions are suspended.';
const GENESIS_002_SEALED_TOOLTIP =
  'Not admitted to Genesis 002. Admissions are suspended for the 0.4.0 launch.';
const PTR_UNKNOWN_TOOLTIP =
  'PTR access is not yet verified. Server authority is required before entry.';
const PTR_ADMITTED_TOOLTIP =
  'Admitted to PTR by the server-verified access provider.';
const PTR_NOT_ADMITTED_TOOLTIP =
  'Not admitted to PTR. Server authority did not grant access.';

export function getRealmChoices(
  genesis001Admitted: boolean,
  ptrAuthority?: PtrRealmAuthority
): readonly RealmChoice[] {
  const ptrAdmission = ptrAuthority?.source === 'server-verified'
    ? ptrAuthority.admission
    : 'unknown';
  return Object.freeze([
    Object.freeze({
      id: GENESIS_001_ID,
      label: 'Genesis 001',
      version: GENESIS_001_PRESERVED_RELEASE_VERSION,
      admission: genesis001Admitted ? 'admitted' : 'not-admitted',
      statusLabel: genesis001Admitted ? 'Admitted' : 'Not admitted',
      tooltip: genesis001Admitted
        ? GENESIS_001_ADMITTED_TOOLTIP
        : GENESIS_001_UNVERIFIED_TOOLTIP
    }),
    Object.freeze({
      id: GENESIS_002_ID,
      label: 'Genesis 002',
      version: GENESIS_002_SEALED_RELEASE_VERSION,
      admission: 'not-admitted',
      statusLabel: 'Not admitted',
      tooltip: GENESIS_002_SEALED_TOOLTIP
    }),
    Object.freeze({
      id: PTR_ID,
      label: 'PTR',
      version: PTR_RELEASE_VERSION,
      admission: ptrAdmission,
      statusLabel: ptrAdmission === 'admitted'
        ? 'Admitted'
        : ptrAdmission === 'not-admitted' ? 'Not admitted' : 'Access unknown',
      tooltip: ptrAdmission === 'admitted'
        ? PTR_ADMITTED_TOOLTIP
        : ptrAdmission === 'not-admitted' ? PTR_NOT_ADMITTED_TOOLTIP : PTR_UNKNOWN_TOOLTIP
    })
  ]);
}

export const GENESIS_002_SEALED_NOTICE =
  'Genesis 002 is sealed. Admissions are suspended for the 0.4.0 launch; no access request or realm connection was made.';

export const PTR_UNKNOWN_NOTICE =
  'PTR access is not yet verified. A server-verified access result is required; no realm connection was made.';

export const PTR_NOT_ADMITTED_NOTICE =
  'PTR access was not granted by the server-verified provider; no realm connection was made.';

export const PTR_DIRECTORY_ONLY_NOTICE =
  'PTR entry must be initiated from the Realm Directory after server access is verified; no Genesis 001 callback was made.';
