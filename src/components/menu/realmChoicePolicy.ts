import {
  ADMISSIONS_SUSPENDED_NOTICE,
  NEW_ADMISSIONS_SUSPENDED
} from '../../release/admissionLaunchPolicy';

export { ADMISSIONS_SUSPENDED_NOTICE, NEW_ADMISSIONS_SUSPENDED };

export const GENESIS_001_ID = 'genesis-001' as const;
export const GENESIS_002_ID = 'genesis-002' as const;

export type RealmId = typeof GENESIS_001_ID | typeof GENESIS_002_ID;
export type RealmAdmission = 'admitted' | 'not-admitted';

export type RealmChoice = Readonly<{
  id: RealmId;
  label: string;
  version: string;
  admission: RealmAdmission;
  statusLabel: 'Admitted' | 'Not admitted';
  tooltip: string;
}>;

const GENESIS_001_ADMITTED_TOOLTIP =
  'Admitted to Genesis 001. Your existing 0.3.43 access is preserved.';
const GENESIS_001_UNVERIFIED_TOOLTIP =
  'Not admitted or not signed in. Sign in to verify existing admission. New admissions are suspended.';
const GENESIS_002_SEALED_TOOLTIP =
  'Not admitted to Genesis 002. Admissions are suspended for the 0.4.0 launch.';

export function getRealmChoices(genesis001Admitted: boolean): readonly RealmChoice[] {
  return Object.freeze([
    Object.freeze({
      id: GENESIS_001_ID,
      label: 'Genesis 001',
      version: '0.3.43',
      admission: genesis001Admitted ? 'admitted' : 'not-admitted',
      statusLabel: genesis001Admitted ? 'Admitted' : 'Not admitted',
      tooltip: genesis001Admitted
        ? GENESIS_001_ADMITTED_TOOLTIP
        : GENESIS_001_UNVERIFIED_TOOLTIP
    }),
    Object.freeze({
      id: GENESIS_002_ID,
      label: 'Genesis 002',
      version: '0.4.0',
      admission: 'not-admitted',
      statusLabel: 'Not admitted',
      tooltip: GENESIS_002_SEALED_TOOLTIP
    })
  ]);
}

export const GENESIS_002_SEALED_NOTICE =
  'Genesis 002 is sealed. Admissions are suspended for the 0.4.0 launch; no access request or realm connection was made.';
