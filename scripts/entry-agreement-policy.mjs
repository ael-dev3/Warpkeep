/**
 * Node-side mirror of the entry-agreement history used by release tooling.
 * `tests/alphaTermsPolicy.test.ts` keeps this file aligned with the server
 * policy because Node cannot import the SpacetimeDB TypeScript module directly.
 */
export const WARPKEEP_ENTRY_AGREEMENT_VERSION =
  '2026-07-19-hegemony-entry-agreement-v2';

export const WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS = Object.freeze([
  '2026-07-18-hegemony-entry-agreement-v1',
  '2026-07-14',
]);

export const WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS = Object.freeze([
  WARPKEEP_ENTRY_AGREEMENT_VERSION,
  ...WARPKEEP_HISTORICAL_ENTRY_AGREEMENT_VERSIONS,
]);

export const WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM =
  WARPKEEP_ENTRY_AGREEMENT_EVIDENCE_VERSIONS.length;
