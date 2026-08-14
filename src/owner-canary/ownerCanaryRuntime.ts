import type { FarcasterOidcSession } from '../farcaster/farcasterAuthTypes';
import type { OwnerCanaryPrivateSession } from './ownerCanaryAuthClient';
import type {
  OwnerCanaryEvidenceApi,
} from './ownerCanaryController';
import type { OwnerCanarySanitizedEvidence } from './ownerCanaryEvidence';

export type OwnerCanaryRecoveryState =
  | 'none'
  | 'required'
  | 'running'
  | 'safe'
  | 'unconfirmed';

/** Recall-only, memory-only recovery. It has no dispatch or evidence API. */
export type OwnerCanaryRecoveryApi<Authority> = Readonly<{
  state(): OwnerCanaryRecoveryState;
  recover(authority: Authority, signal: AbortSignal): Promise<void>;
}>;

export type OwnerCanaryFreshPageRecoveryInput = Readonly<{
  evidenceNonce: string;
  reviewedAdmissionPlanDigest: string;
}>;

/** Reload-only all-worker recall-or-fence. It can never publish browser safety. */
export type OwnerCanaryFreshPageRecoveryApi<Authority> = Readonly<{
  recover(
    authority: Authority,
    input: OwnerCanaryFreshPageRecoveryInput,
    signal: AbortSignal,
  ): Promise<void>;
}>;

/**
 * Production integration seam. The adapter may keep its branded runtime-plan
 * handle plus private worker, location, cell, and idempotency-key correlations
 * inside one `run` closure. None may enter React or the sanitized return value.
 */
export type OwnerCanaryRuntime<
  Authority = unknown,
  RecallRecoveryAuthority = Authority,
  FreshPageRecoveryAuthority = RecallRecoveryAuthority,
> = Readonly<{
  evidenceApi: OwnerCanaryEvidenceApi<Authority>;
  recoveryApi: OwnerCanaryRecoveryApi<RecallRecoveryAuthority>;
  freshPageRecoveryApi: OwnerCanaryFreshPageRecoveryApi<FreshPageRecoveryAuthority>;
  openAuthority(session: FarcasterOidcSession, signal: AbortSignal): Promise<Authority>;
  closeAuthority(authority: Authority): Promise<void> | void;
  openRecallRecoveryAuthority(
    session: FarcasterOidcSession,
    signal: AbortSignal,
  ): Promise<RecallRecoveryAuthority>;
  closeRecallRecoveryAuthority(authority: RecallRecoveryAuthority): Promise<void> | void;
  openFreshPageRecoveryAuthority(
    session: FarcasterOidcSession,
    signal: AbortSignal,
  ): Promise<FreshPageRecoveryAuthority>;
  closeFreshPageRecoveryAuthority(authority: FreshPageRecoveryAuthority): Promise<void> | void;
  verifyPrivateSubject(input: Readonly<{
    privateSession: OwnerCanaryPrivateSession;
    latchedSubjectFid: number;
    reviewedAdmissionPlanDigest: string;
    signal: AbortSignal;
  }>): Promise<boolean>;
  acceptSanitizedEvidence(evidence: OwnerCanarySanitizedEvidence): Promise<void> | void;
}>;

export type OwnerCanaryRuntimeLoader = () => Promise<OwnerCanaryRuntime | null>;
