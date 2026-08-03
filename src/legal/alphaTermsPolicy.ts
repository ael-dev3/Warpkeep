/** Exact version of the Social Contract incorporated by the current Terms. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION =
  '2026-08-03-HEGEMONY-SOCIAL-CONTRACT-V4';

/**
 * Exact server-side identifier for the complete current entry-agreement bundle.
 * It is kept as a separate, case-sensitive identifier so browser and server
 * acceptance records bind the complete bundle rather than only one document.
 */
export const WARPKEEP_ENTRY_AGREEMENT_VERSION =
  '2026-08-03-hegemony-entry-agreement-v5';

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
  'dede7757c3be767b7a87e89e2c68817e9390cde91fabcf38246756afacdf51bd';

/** SHA-256 of the canonical Social Contract's normalized visible <main> text. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256 =
  '85941d066dd39f5be069d640f1419491e6fc0f691d01c292bfc3ed995c249110';
