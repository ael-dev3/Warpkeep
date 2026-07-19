/** Exact version of the Social Contract incorporated by the current Terms. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION =
  '2026-07-19-hegemony-social-contract-v2';

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
  '44d0043467b273293d59a2958e4837d13d289fd81eee708c7187d63a58659928';

/** SHA-256 of the canonical Social Contract's normalized visible <main> text. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256 =
  '676b53ce46eb57d99883e8731103779a658fc75a5e8ba5069cce0ab57d1268bc';
