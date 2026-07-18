/** Exact version of the Social Contract incorporated by the current Terms. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION =
  '2026-07-18-hegemony-social-contract-v1';

/**
 * Exact server-side identifier for the complete current entry-agreement bundle.
 * It is derived from the incorporated Social Contract identifier so changing
 * that contract version necessarily changes the accepted bundle version.
 */
export const WARPKEEP_ENTRY_AGREEMENT_VERSION =
  WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION.replace(
    '-social-contract-',
    '-entry-agreement-',
  );

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
  '0c2fab74ee3eaf0f453503decb9eaafb65bb7ae226f99742b65797e89e3ab864';

/** SHA-256 of the canonical Social Contract's normalized visible <main> text. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256 =
  'c6cd22628622aceaba25dd4f9cc5f609873f86a0e7d458c0e4bdf54c9b012571';
