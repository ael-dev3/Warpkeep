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
  'b78bacc360df53f57bed668a68c311acf14e957156ecd8256e388a6ef38496bf';

/** SHA-256 of the canonical Social Contract's normalized visible <main> text. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256 =
  'a052a4f53aee749b702037f7a6eeb1e9dbd6fab0cbcd60aed81dacade8cbb66d';
