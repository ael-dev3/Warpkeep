import type { FarcasterOidcSession } from '../farcaster/farcasterAuthTypes';
import type {
  OwnerCanaryEvidenceApi,
} from './ownerCanaryController';
import type { OwnerCanarySanitizedEvidence } from './ownerCanaryEvidence';

/**
 * Production integration seam. The adapter may keep private worker, location,
 * cell, and idempotency-key correlations inside its `run` closure. None of
 * those values may appear in the sanitized return value.
 */
export type OwnerCanaryRuntime<Authority = unknown> = Readonly<{
  evidenceApi: OwnerCanaryEvidenceApi<Authority>;
  openAuthority(session: FarcasterOidcSession, signal: AbortSignal): Promise<Authority>;
  closeAuthority(authority: Authority): Promise<void> | void;
  verifyPrivateSubject(input: Readonly<{
    subjectFid: number;
    reviewedAdmissionPlanDigest: string;
    signal: AbortSignal;
  }>): Promise<boolean>;
  acceptSanitizedEvidence(evidence: OwnerCanarySanitizedEvidence): Promise<void> | void;
}>;

export type OwnerCanaryRuntimeLoader = () => Promise<OwnerCanaryRuntime | null>;
