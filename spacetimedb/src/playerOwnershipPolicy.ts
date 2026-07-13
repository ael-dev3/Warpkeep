export type PlayerOwnershipState =
  | 'unbound'
  | 'current'
  | 'partial'
  | 'identity_mismatch';

/**
 * Classify the public-profile/private-ownership pair without depending on the
 * database runtime. Every one-sided or mismatched state is intentionally
 * distinct from the only state that grants existing-player authority.
 */
export function evaluatePlayerOwnership(
  playerExists: boolean,
  ownershipExists: boolean,
  identityMatches: boolean,
): PlayerOwnershipState {
  if (!playerExists && !ownershipExists) return 'unbound';
  if (!playerExists || !ownershipExists) return 'partial';
  return identityMatches ? 'current' : 'identity_mismatch';
}
