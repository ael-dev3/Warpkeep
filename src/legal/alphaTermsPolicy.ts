/** Exact server-side acceptance identifier for the currently published Terms. */
export const WARPKEEP_ALPHA_TERMS_VERSION = '2026-07-14';

/**
 * SHA-256 of the canonical Terms document's normalized visible <main> text.
 * CI binds wording changes to an intentional policy/version review instead of
 * allowing the accepted document to drift behind an unchanged reducer value.
 */
export const WARPKEEP_ALPHA_TERMS_TEXT_SHA256 =
  '5c74d72861fd08e97974a52ab8114fbe945a49926d37225486bb9b967eec84b4';
