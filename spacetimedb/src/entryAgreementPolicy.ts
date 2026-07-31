/**
 * The current Alpha entry agreement is one bundle: the Alpha Terms plus the
 * named Hegemony Social Contract. The legacy reducer/input name remains
 * "terms" for deployed wire compatibility only.
 */
export const WARPKEEP_ENTRY_AGREEMENT_VERSION =
  '2026-07-31-hegemony-entry-agreement-v4';

/** Compatibility alias retained by existing reducer and client imports. */
export const WARPKEEP_ALPHA_TERMS_VERSION = WARPKEEP_ENTRY_AGREEMENT_VERSION;

/**
 * Immutable acceptance rows from these prior bundles can still justify an
 * already-public Community Marks projection. They never satisfy the current
 * entry or gameplay requirement, which always compares the exact current ID.
 */
export const WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS = Object.freeze([
  '2026-07-19-hegemony-entry-agreement-v3',
  '2026-07-19-hegemony-entry-agreement-v2',
  '2026-07-18-hegemony-entry-agreement-v1',
  '2026-07-14',
] as const);

export const WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS = Object.freeze([
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
  ...WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
] as const);

/** Every supported version can create at most one immutable row for one FID. */
export const WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM =
  WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.length;

export type EntryAgreementAcceptanceEvidence = Readonly<{
  acceptanceKey: string;
  fid: bigint;
  termsVersion: string;
}>;

export type CurrentEntryAgreementStatusV1 = Readonly<{
  requiredVersion: typeof WARPKEEP_ALPHA_TERMS_VERSION;
  acceptedCurrent: boolean;
}>;

/**
 * Distinguishes corrupt keyed evidence from normal missing acceptance without
 * exposing the row or relying on an error string inside the procedure.
 */
export class EntryAgreementStatusConflictError extends Error {
  constructor() {
    super('ALPHA_TERMS_ACCEPTANCE_CONFLICT');
    this.name = 'EntryAgreementStatusConflictError';
  }
}

/**
 * The helper receives only the two capabilities needed by the caller-only
 * procedure: establish the admitted FID, then perform one exact keyed read.
 * It cannot enumerate or mutate acceptance evidence.
 */
export function readCurrentEntryAgreementStatusV1(
  requireAdmittedFid: () => bigint,
  findAcceptance: (
    acceptanceKey: string
  ) => EntryAgreementAcceptanceEvidence | null,
): CurrentEntryAgreementStatusV1 {
  const fid = requireAdmittedFid();
  const acceptanceKey = `${fid}:${WARPKEEP_ALPHA_TERMS_VERSION}`;
  const acceptance = findAcceptance(acceptanceKey);
  if (
    acceptance !== null
    && (
      acceptance.acceptanceKey !== acceptanceKey
      || acceptance.fid !== fid
      || acceptance.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION
    )
  ) {
    throw new EntryAgreementStatusConflictError();
  }
  return Object.freeze({
    requiredVersion: WARPKEEP_ALPHA_TERMS_VERSION,
    acceptedCurrent: acceptance !== null,
  });
}

/**
 * Privacy gate for an already-enabled public Community Marks projection.
 * Historical evidence can preserve an earlier explicit publication choice,
 * but every accepted row must still match its exact keyed FID and version.
 */
export function retainedEntryAgreementEvidenceExists(
  fid: bigint,
  findAcceptance: (
    acceptanceKey: string
  ) => EntryAgreementAcceptanceEvidence | null,
): boolean {
  return WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.some((version) => {
    const acceptanceKey = `${fid}:${version}`;
    const acceptance = findAcceptance(acceptanceKey);
    return acceptance?.acceptanceKey === acceptanceKey
      && acceptance.fid === fid
      && acceptance.termsVersion === version;
  });
}
