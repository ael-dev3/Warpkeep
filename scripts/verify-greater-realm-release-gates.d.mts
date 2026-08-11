export type GreaterRealmReleaseGateEnvelope = Readonly<{
  entryAgreementReleaseStatus: 'review-only-rollout-blocked' | 'production-approved';
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
  clientPresentationAllowed: boolean;
  serverPresentationAllowed: boolean;
  entryAgreementApproved: boolean;
  additivePublishApproved: boolean;
  importForwardFixApproved: boolean;
  activationForwardFixApproved: boolean;
  clientActivationApproved: boolean;
  admissionNotificationsApproved: boolean;
  pagesNotificationsEnabled: boolean;
}>;

export function verifyGreaterRealmReleaseGateEnvelope(
  value: unknown,
): string;

export function verifyGreaterRealmReleaseGateState(): string;
