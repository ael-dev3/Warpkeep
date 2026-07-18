/**
 * The current Alpha entry agreement is one bundle: the Alpha Terms plus the
 * named Hegemony Social Contract. The legacy reducer/input name remains
 * "terms" for deployed wire compatibility only.
 */
export const WARPKEEP_ENTRY_AGREEMENT_VERSION =
  '2026-07-18-hegemony-entry-agreement-v1';

/** Compatibility alias retained by existing reducer and client imports. */
export const WARPKEEP_ALPHA_TERMS_VERSION = WARPKEEP_ENTRY_AGREEMENT_VERSION;

/**
 * Immutable acceptance rows from these prior bundles can still justify an
 * already-public Community Marks projection. They never satisfy the current
 * entry or gameplay requirement, which always compares the exact current ID.
 */
export const WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS = Object.freeze([
  '2026-07-14',
] as const);

export const WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS = Object.freeze([
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
  ...WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
] as const);

/** Every supported version can create at most one immutable row for one FID. */
export const WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM =
  WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.length;
