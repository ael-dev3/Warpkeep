/** Exact version of the Social Contract incorporated by the current Terms. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION =
  '2026-07-19-HEGEMONY-SOCIAL-CONTRACT-V3';

/**
 * Exact server-side identifier for the complete current entry-agreement bundle.
 * It is kept as a separate, case-sensitive identifier so browser and server
 * acceptance records bind the complete bundle rather than only one document.
 */
export const WARPKEEP_ENTRY_AGREEMENT_VERSION =
  '2026-07-31-hegemony-entry-agreement-v4';

/**
 * Release tooling may publish only an exact selected bundle carrying this
 * status. Feature-specific approvals remain independent and fail closed.
 */
export const WARPKEEP_ENTRY_AGREEMENT_RELEASE_STATUS =
  'production-approved';

/**
 * Retained deployed reducer/input name. It identifies the complete linked
 * entry agreement, not the Terms document alone.
 */
export const WARPKEEP_ALPHA_TERMS_VERSION = WARPKEEP_ENTRY_AGREEMENT_VERSION;

/**
 * SHA-256 of the canonical Terms document's normalized visible <main> text.
 * CI binds wording changes to an intentional policy/version review instead of
 * allowing the accepted document to drift behind an unchanged reducer value.
 */
export const WARPKEEP_ALPHA_TERMS_TEXT_SHA256 =
  'db2a780f02c52527abe06a5260d291ca82f5b8e48ab2a218f33714240c0f9549';

/** SHA-256 of the canonical Social Contract's normalized visible <main> text. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256 =
  'f4a9da0bfde64367198f65162f1085809fb665d221343d25c575510495e63949';

/** Factual notice version published alongside the selected entry agreement. */
export const WARPKEEP_ALPHA_PRIVACY_NOTICE_VERSION = '2026-08-02-v5';

/** SHA-256 of the canonical Privacy Notice's normalized visible <main> text. */
export const WARPKEEP_ALPHA_PRIVACY_NOTICE_TEXT_SHA256 =
  '6e97f9fd3700d34ef274f1dcb423dc2115b08dcabc6ed6d21ddb3b4e97e3a34f';
