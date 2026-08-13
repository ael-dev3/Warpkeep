/**
 * Downstream Greater Realm presentation and admission-delivery approvals.
 *
 * These values are deliberately separate from the production module publisher.
 * The publisher's release envelope must keep both corresponding fields false:
 * publishing server bytes is never permission to expose the client or deliver
 * admission notifications. A later reviewed source phase changes these exact
 * literals only after the active-v17 production evidence exists.
 */
export const GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS = Object.freeze({
  clientActivationApproved: false,
  admissionNotificationsApproved: false,
} as const);

export type GreaterRealmDownstreamReleaseFlags =
  typeof GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS;
