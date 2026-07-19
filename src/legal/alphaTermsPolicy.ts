/** Exact version of the Social Contract incorporated by the current Terms. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_VERSION =
  '2026-07-19-HEGEMONY-SOCIAL-CONTRACT-V3';

/**
 * Exact server-side identifier for the complete current entry-agreement bundle.
 * It is kept as a separate, case-sensitive identifier so browser and server
 * acceptance records bind the complete bundle rather than only one document.
 */
export const WARPKEEP_ENTRY_AGREEMENT_VERSION =
  '2026-07-19-hegemony-entry-agreement-v3';

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
  '4eb57f45f09d5b895ccceb6eb194e1f742afcb03edd2b59de5d7a3f5301fffe1';

/** SHA-256 of the canonical Social Contract's normalized visible <main> text. */
export const WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_TEXT_SHA256 =
  '4116ad01c9d0cbcf26dede2cbb5776602077b18c1500eb4e276f13d0c3081489';
