import type {
  FarcasterOidcSession,
  FarcasterQuickAuthTokenResult,
} from '../farcaster/farcasterAuthTypes';
import type { OwnerCanaryPrivateSession } from './ownerCanaryAuthClient';
import type {
  OwnerCanaryFreshPageRecoveryApi,
  OwnerCanaryFreshPageRecoveryInput,
  OwnerCanaryRecoveryApi,
  OwnerCanaryRecoveryState,
} from './ownerCanaryRuntime';
import {
  sanitizeOwnerCanaryJourneyEvidence,
  type OwnerCanarySanitizedEvidence,
} from './ownerCanaryEvidence';

export const OWNER_CANARY_STAGES = Object.freeze([
  'baseline',
  'founder',
  'routes',
  'dispatch',
  'dispatch-replay',
  'gathering',
  'recall',
  'returning',
  'terminal',
  'evidence',
] as const);

export type OwnerCanaryStage = typeof OWNER_CANARY_STAGES[number];
export type OwnerCanaryRunStage<Authority> = <Result>(
  stage: OwnerCanaryStage,
  operation: (authority: Authority, signal: AbortSignal) => Promise<Result>,
) => Promise<Result>;

export type OwnerCanaryEvidenceApi<Authority> = Readonly<{
  run(input: Readonly<{
    evidenceNonce: string;
    reviewedAdmissionPlanDigest: string;
    routeSetCommitment: string;
    signal: AbortSignal;
    runStage: OwnerCanaryRunStage<Authority>;
  }>): Promise<unknown>;
}>;

export type OwnerCanaryControllerState =
  | Readonly<{ phase: 'idle'; completedStageCount: 0 }>
  | Readonly<{
      phase: 'awaiting-consent' | 'authenticating' | 'running-stage';
      stage: OwnerCanaryStage;
      stageNumber: number;
      completedStageCount: number;
    }>
  | Readonly<{ phase: 'complete'; completedStageCount: 10 }>
  | Readonly<{
      phase:
        | 'cancelled'
        | 'failed'
        | 'authority-close-unconfirmed'
        | 'recovery-authority-close-unconfirmed';
      completedStageCount: number;
    }>;

export type OwnerCanaryControllerFailureCode =
  | 'already-running'
  | 'invalid-private-input'
  | 'consent-denied'
  | 'quick-auth-unavailable'
  | 'exchange-failed'
  | 'subject-changed'
  | 'subject-not-approved'
  | 'authority-failed'
  | 'authority-close-unconfirmed'
  | 'stage-failed'
  | 'evidence-contract'
  | 'cancelled';

const failureCodes = new WeakMap<Error, OwnerCanaryControllerFailureCode>();

export class OwnerCanaryControllerError extends Error {
  override readonly name = 'OwnerCanaryControllerError';

  constructor() {
    super('The production player canary stopped.');
  }
}

function failure(code: OwnerCanaryControllerFailureCode): OwnerCanaryControllerError {
  const error = new OwnerCanaryControllerError();
  failureCodes.set(error, code);
  return error;
}

export function ownerCanaryControllerFailureCode(
  error: unknown,
): OwnerCanaryControllerFailureCode | null {
  return error instanceof OwnerCanaryControllerError
    ? failureCodes.get(error) ?? 'stage-failed'
    : null;
}

export type OwnerCanaryControllerDependencies<
  Authority,
  RecallRecoveryAuthority = Authority,
  FreshPageRecoveryAuthority = RecallRecoveryAuthority,
> = Readonly<{
  evidenceApi: OwnerCanaryEvidenceApi<Authority>;
  requestStageConsent(input: Readonly<{
    stage: OwnerCanaryStage;
    stageNumber: number;
    stageCount: 10;
    signal: AbortSignal;
  }>): Promise<boolean>;
  getQuickAuthToken(options: Readonly<{ force: true }>): Promise<FarcasterQuickAuthTokenResult>;
  exchangeQuickAuth(token: string, signal: AbortSignal): Promise<OwnerCanaryPrivateSession>;
  openAuthority(session: FarcasterOidcSession, signal: AbortSignal): Promise<Authority>;
  closeAuthority(authority: Authority): Promise<void> | void;
  openRecallRecoveryAuthority(
    session: FarcasterOidcSession,
    signal: AbortSignal,
  ): Promise<RecallRecoveryAuthority>;
  closeRecallRecoveryAuthority(authority: RecallRecoveryAuthority): Promise<void> | void;
  openFreshPageRecoveryAuthority?(
    session: FarcasterOidcSession,
    signal: AbortSignal,
  ): Promise<FreshPageRecoveryAuthority>;
  closeFreshPageRecoveryAuthority?(authority: FreshPageRecoveryAuthority): Promise<void> | void;
  verifyPrivateSubject(input: Readonly<{
    privateSession: OwnerCanaryPrivateSession;
    latchedSubjectFid: number;
    reviewedAdmissionPlanDigest: string;
    signal: AbortSignal;
  }>): Promise<boolean>;
  recoveryApi?: OwnerCanaryRecoveryApi<RecallRecoveryAuthority>;
  freshPageRecoveryApi?: OwnerCanaryFreshPageRecoveryApi<FreshPageRecoveryAuthority>;
  onState?(state: OwnerCanaryControllerState): void;
  onRecoveryState?(state: OwnerCanaryRecoveryState): void;
}>;

export type OwnerCanaryController = Readonly<{
  run(input: OwnerCanaryRunInput, signal?: AbortSignal): Promise<OwnerCanarySanitizedEvidence>;
  recover(signal?: AbortSignal): Promise<void>;
  recoverFreshPage(
    input: OwnerCanaryFreshPageRecoveryInput,
    signal?: AbortSignal,
  ): Promise<void>;
  cancel(): void;
  state(): OwnerCanaryControllerState;
  recoveryState(): OwnerCanaryRecoveryState;
}>;

export type OwnerCanaryRunInput = Readonly<{
  evidenceNonce: string;
  reviewedAdmissionPlanDigest: string;
  routeSetCommitment: string;
}>;

const PRIVATE_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const brandedPlayerEvidence = new WeakSet<object>();

function exactPrivateRunInput(value: unknown): OwnerCanaryRunInput | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return undefined;
  const keys = (ownKeys as string[]).sort();
  if (keys.join('\0') !== [
    'evidenceNonce',
    'reviewedAdmissionPlanDigest',
    'routeSetCommitment',
  ].sort().join('\0')) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const evidenceNonce = descriptors.evidenceNonce?.value;
  const reviewedAdmissionPlanDigest = descriptors.reviewedAdmissionPlanDigest?.value;
  const routeSetCommitment = descriptors.routeSetCommitment?.value;
  if (
    typeof evidenceNonce !== 'string'
    || typeof reviewedAdmissionPlanDigest !== 'string'
    || typeof routeSetCommitment !== 'string'
    || !PRIVATE_DIGEST_PATTERN.test(evidenceNonce)
    || !PRIVATE_DIGEST_PATTERN.test(reviewedAdmissionPlanDigest)
    || !PRIVATE_DIGEST_PATTERN.test(routeSetCommitment)
  ) return undefined;
  return Object.freeze({
    evidenceNonce,
    reviewedAdmissionPlanDigest,
    routeSetCommitment,
  });
}

function exactFreshPageRecoveryInput(
  value: unknown,
): OwnerCanaryFreshPageRecoveryInput | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return undefined;
  const keys = (ownKeys as string[]).sort();
  if (keys.join('\0') !== [
    'evidenceNonce',
    'reviewedAdmissionPlanDigest',
  ].sort().join('\0')) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const evidenceNonce = descriptors.evidenceNonce?.value;
  const reviewedAdmissionPlanDigest = descriptors.reviewedAdmissionPlanDigest?.value;
  if (
    typeof evidenceNonce !== 'string'
    || typeof reviewedAdmissionPlanDigest !== 'string'
    || !PRIVATE_DIGEST_PATTERN.test(evidenceNonce)
    || !PRIVATE_DIGEST_PATTERN.test(reviewedAdmissionPlanDigest)
  ) return undefined;
  return Object.freeze({ evidenceNonce, reviewedAdmissionPlanDigest });
}

function framedTextBytes(frames: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = frames.map((frame) => encoder.encode(frame));
  const lengths = encoded.map((frame) => encoder.encode(`${frame.byteLength}:`));
  const totalLength = encoded.reduce((total, frame, index) => (
    total + lengths[index]!.byteLength + frame.byteLength + 1
  ), 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let index = 0; index < encoded.length; index += 1) {
    const length = lengths[index]!;
    const frame = encoded[index]!;
    result.set(length, offset);
    offset += length.byteLength;
    result.set(frame, offset);
    offset += frame.byteLength;
    result[offset] = index === encoded.length - 1 ? 0x0a : 0x7c;
    offset += 1;
    length.fill(0);
    frame.fill(0);
  }
  return result;
}

async function defaultSameSubjectDigest(input: Readonly<{
  evidenceNonce: string;
  subjectFid: number;
}>): Promise<string> {
  const material = framedTextBytes([
    'warpkeep.production-player-canary.same-subject.v1',
    input.evidenceNonce,
    `farcaster:${input.subjectFid}`,
  ]);
  try {
    const digest = new Uint8Array(await crypto.subtle.digest(
      'SHA-256',
      material.buffer as ArrayBuffer,
    ));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } finally {
    material.fill(0);
  }
}

/** Rejects parsed or reconstructed JSON; only this in-process runner can brand evidence. */
export function requireOwnerCanaryPlayerEvidence(
  value: unknown,
): OwnerCanarySanitizedEvidence {
  if (
    typeof value !== 'object'
    || value === null
    || !brandedPlayerEvidence.has(value)
  ) throw failure('evidence-contract');
  return value as OwnerCanarySanitizedEvidence;
}

export function createOwnerCanaryController<
  Authority,
  RecallRecoveryAuthority = Authority,
  FreshPageRecoveryAuthority = RecallRecoveryAuthority,
>(
  dependencies: OwnerCanaryControllerDependencies<
    Authority,
    RecallRecoveryAuthority,
    FreshPageRecoveryAuthority
  >,
): OwnerCanaryController {
  let activeAbort: AbortController | undefined;
  let mainAuthorityCloseUnconfirmed = false;
  let recoveryAuthorityCloseUnconfirmed = false;
  let mainRunConsumed = false;
  let freshPageRecoveryOnly = false;
  let freshPageSubjectFid: number | undefined;
  let latchedSubjectFid: number | undefined;
  let latchedReviewedAdmissionPlanDigest: string | undefined;
  let publicRecoveryState: OwnerCanaryRecoveryState = 'none';
  let publicState: OwnerCanaryControllerState = Object.freeze({
    phase: 'idle',
    completedStageCount: 0,
  });

  const publish = (state: OwnerCanaryControllerState) => {
    publicState = Object.freeze(state);
    try {
      dependencies.onState?.(publicState);
    } catch {
      // Presentation observers are not canary authority and cannot alter a run.
    }
  };

  const publishRecovery = (state: OwnerCanaryRecoveryState) => {
    publicRecoveryState = state;
    try {
      dependencies.onRecoveryState?.(state);
    } catch {
      // Presentation observers are not recovery authority.
    }
  };

  return Object.freeze({
    state: () => publicState,
    recoveryState: () => publicRecoveryState,
    cancel: () => activeAbort?.abort(),
    async recoverFreshPage(
      input: OwnerCanaryFreshPageRecoveryInput,
      externalSignal?: AbortSignal,
    ): Promise<void> {
      if (
        recoveryAuthorityCloseUnconfirmed
        || activeAbort
        || !dependencies.freshPageRecoveryApi
        || !dependencies.openFreshPageRecoveryAuthority
        || !dependencies.closeFreshPageRecoveryAuthority
        || (!freshPageRecoveryOnly && mainRunConsumed)
      ) throw failure(recoveryAuthorityCloseUnconfirmed
        ? 'authority-close-unconfirmed'
        : activeAbort
          ? 'already-running'
          : 'stage-failed');

      // Selecting reload recovery permanently excludes this controller and
      // page realm from the main canary, even when private input is malformed.
      freshPageRecoveryOnly = true;
      mainRunConsumed = true;
      let privateInput = exactFreshPageRecoveryInput(input);
      if (!privateInput) {
        publishRecovery('unconfirmed');
        throw failure('invalid-private-input');
      }

      const abort = new AbortController();
      activeAbort = abort;
      const forwardAbort = () => abort.abort();
      externalSignal?.addEventListener('abort', forwardAbort, { once: true });
      if (externalSignal?.aborted) abort.abort();
      let privateSession: OwnerCanaryPrivateSession | undefined;
      let authority: FreshPageRecoveryAuthority | undefined;
      let authorityOpened = false;
      let closeFailed = false;
      publishRecovery('running');
      try {
        const quickAuth = await dependencies.getQuickAuthToken({ force: true });
        if (abort.signal.aborted) throw failure('cancelled');
        if (quickAuth.status !== 'token') throw failure('quick-auth-unavailable');
        let token: string | undefined = quickAuth.token;
        try {
          privateSession = await dependencies.exchangeQuickAuth(token, abort.signal);
        } catch (error) {
          if (abort.signal.aborted) throw failure('cancelled');
          if (error instanceof OwnerCanaryControllerError) throw error;
          throw failure('exchange-failed');
        } finally {
          token = undefined;
        }
        if (
          !privateSession
          || !Number.isSafeInteger(privateSession.subjectFid)
          || privateSession.subjectFid <= 0
        ) throw failure('exchange-failed');
        const expectedSubjectFid = freshPageSubjectFid ?? privateSession.subjectFid;
        if (privateSession.subjectFid !== expectedSubjectFid) {
          throw failure('subject-changed');
        }
        // Latch before the fallible verifier or connection open. A failed
        // first attempt cannot switch owner subjects inside this page realm.
        freshPageSubjectFid = expectedSubjectFid;
        let approvedSubject = false;
        try {
          approvedSubject = await dependencies.verifyPrivateSubject({
            privateSession,
            latchedSubjectFid: expectedSubjectFid,
            reviewedAdmissionPlanDigest: privateInput.reviewedAdmissionPlanDigest,
            signal: abort.signal,
          });
        } catch {
          if (abort.signal.aborted) throw failure('cancelled');
          throw failure('subject-not-approved');
        }
        if (approvedSubject !== true) throw failure('subject-not-approved');
        authority = await dependencies.openFreshPageRecoveryAuthority(
          privateSession.session,
          abort.signal,
        );
        authorityOpened = true;
        privateSession = undefined;
        await dependencies.freshPageRecoveryApi.recover(
          authority,
          privateInput,
          abort.signal,
        );
        if (abort.signal.aborted) throw failure('cancelled');
      } catch (error) {
        publishRecovery('unconfirmed');
        throw error instanceof OwnerCanaryControllerError
          ? error
          : failure(abort.signal.aborted ? 'cancelled' : 'stage-failed');
      } finally {
        privateSession = undefined;
        privateInput = undefined;
        if (authorityOpened) {
          try {
            await dependencies.closeFreshPageRecoveryAuthority(
              authority as FreshPageRecoveryAuthority,
            );
          } catch {
            recoveryAuthorityCloseUnconfirmed = true;
            closeFailed = true;
            publish(Object.freeze({
              phase: 'recovery-authority-close-unconfirmed',
              completedStageCount: publicState.completedStageCount,
            }));
          }
        }
        // A reload cannot prove which old dispatches or transports remain in
        // flight. Only repeated admin status can establish terminal safety.
        publishRecovery('unconfirmed');
        abort.abort();
        externalSignal?.removeEventListener('abort', forwardAbort);
        if (activeAbort === abort) activeAbort = undefined;
        if (closeFailed) throw failure('authority-close-unconfirmed');
      }
    },
    async recover(externalSignal?: AbortSignal): Promise<void> {
      if (
        recoveryAuthorityCloseUnconfirmed
        || activeAbort
        || !dependencies.recoveryApi
        || (publicRecoveryState !== 'required' && publicRecoveryState !== 'unconfirmed')
        || latchedSubjectFid === undefined
        || latchedReviewedAdmissionPlanDigest === undefined
      ) throw failure(recoveryAuthorityCloseUnconfirmed
        ? 'authority-close-unconfirmed'
        : 'stage-failed');
      const abort = new AbortController();
      activeAbort = abort;
      const forwardAbort = () => abort.abort();
      externalSignal?.addEventListener('abort', forwardAbort, { once: true });
      if (externalSignal?.aborted) abort.abort();
      let privateSession: OwnerCanaryPrivateSession | undefined;
      let authority: RecallRecoveryAuthority | undefined;
      let authorityOpened = false;
      publishRecovery('running');
      try {
        const quickAuth = await dependencies.getQuickAuthToken({ force: true });
        if (abort.signal.aborted) throw failure('cancelled');
        if (quickAuth.status !== 'token') throw failure('quick-auth-unavailable');
        let token: string | undefined = quickAuth.token;
        try {
          privateSession = await dependencies.exchangeQuickAuth(token, abort.signal);
        } catch (error) {
          if (abort.signal.aborted) throw failure('cancelled');
          if (error instanceof OwnerCanaryControllerError) throw error;
          throw failure('exchange-failed');
        } finally {
          token = undefined;
        }
        if (
          !privateSession
          || privateSession.subjectFid !== latchedSubjectFid
        ) throw failure('subject-changed');
        let approvedSubject = false;
        try {
          approvedSubject = await dependencies.verifyPrivateSubject({
            privateSession,
            latchedSubjectFid,
            reviewedAdmissionPlanDigest: latchedReviewedAdmissionPlanDigest,
            signal: abort.signal,
          });
        } catch {
          if (abort.signal.aborted) throw failure('cancelled');
          throw failure('subject-not-approved');
        }
        if (approvedSubject !== true) throw failure('subject-not-approved');
        authority = await dependencies.openRecallRecoveryAuthority(
          privateSession.session,
          abort.signal,
        );
        authorityOpened = true;
        privateSession = undefined;
        await dependencies.recoveryApi.recover(authority, abort.signal);
        if (abort.signal.aborted) throw failure('cancelled');
      } catch (error) {
        publishRecovery('unconfirmed');
        throw error instanceof OwnerCanaryControllerError
          ? error
          : failure(abort.signal.aborted ? 'cancelled' : 'stage-failed');
      } finally {
        privateSession = undefined;
        let closeFailed = false;
        if (authorityOpened) {
          try {
            await dependencies.closeRecallRecoveryAuthority(
              authority as RecallRecoveryAuthority,
            );
          } catch {
            recoveryAuthorityCloseUnconfirmed = true;
            publishRecovery('unconfirmed');
            publish(Object.freeze({
              phase: 'recovery-authority-close-unconfirmed',
              completedStageCount: publicState.completedStageCount,
            }));
            abort.abort();
            closeFailed = true;
          }
        }
        const runtimeState = dependencies.recoveryApi.state();
        if (
          !closeFailed
          && !mainAuthorityCloseUnconfirmed
          && runtimeState === 'safe'
        ) {
          publishRecovery('safe');
          latchedSubjectFid = undefined;
          latchedReviewedAdmissionPlanDigest = undefined;
        } else {
          publishRecovery('unconfirmed');
        }
        abort.abort();
        externalSignal?.removeEventListener('abort', forwardAbort);
        if (activeAbort === abort) activeAbort = undefined;
        if (closeFailed) throw failure('authority-close-unconfirmed');
      }
    },
    async run(input: OwnerCanaryRunInput, externalSignal?: AbortSignal): Promise<OwnerCanarySanitizedEvidence> {
      if (mainAuthorityCloseUnconfirmed || recoveryAuthorityCloseUnconfirmed) {
        throw failure('authority-close-unconfirmed');
      }
      if (activeAbort) throw failure('already-running');
      if (mainRunConsumed) throw failure('stage-failed');
      const privateInput = exactPrivateRunInput(input);
      if (!privateInput) throw failure('invalid-private-input');
      mainRunConsumed = true;
      latchedReviewedAdmissionPlanDigest = privateInput.reviewedAdmissionPlanDigest;
      const abort = new AbortController();
      activeAbort = abort;
      const forwardAbort = () => abort.abort();
      externalSignal?.addEventListener('abort', forwardAbort, { once: true });
      if (externalSignal?.aborted) abort.abort();
      let expectedStageIndex = 0;
      let stageActive = false;
      let fatal = false;

      const runStage: OwnerCanaryRunStage<Authority> = async (stage, operation) => {
        if (
          fatal
          || stageActive
          || stage !== OWNER_CANARY_STAGES[expectedStageIndex]
          || typeof operation !== 'function'
        ) {
          fatal = true;
          abort.abort();
          throw failure('evidence-contract');
        }
        stageActive = true;
        const stageNumber = expectedStageIndex + 1;
        let authority: Authority | undefined;
        let authorityOpened = false;
        let privateSession: OwnerCanaryPrivateSession | undefined;
        let stageCompleted = false;
        try {
          publish(Object.freeze({
            phase: 'awaiting-consent',
            stage,
            stageNumber,
            completedStageCount: expectedStageIndex,
          }));
          const approved = await dependencies.requestStageConsent({
            stage,
            stageNumber,
            stageCount: 10,
            signal: abort.signal,
          });
          if (abort.signal.aborted) throw failure('cancelled');
          if (approved !== true) throw failure('consent-denied');

          publish(Object.freeze({
            phase: 'authenticating',
            stage,
            stageNumber,
            completedStageCount: expectedStageIndex,
          }));
          const quickAuth = await dependencies.getQuickAuthToken({ force: true });
          if (abort.signal.aborted) throw failure('cancelled');
          if (quickAuth.status !== 'token') throw failure('quick-auth-unavailable');
          let token: string | undefined = quickAuth.token;
          try {
            privateSession = await dependencies.exchangeQuickAuth(token, abort.signal);
          } catch (error) {
            if (abort.signal.aborted) throw failure('cancelled');
            if (error instanceof OwnerCanaryControllerError) throw error;
            throw failure('exchange-failed');
          } finally {
            token = undefined;
          }
          if (
            !privateSession
            || !Number.isSafeInteger(privateSession.subjectFid)
            || privateSession.subjectFid <= 0
          ) throw failure('exchange-failed');
          const expectedSubjectFid = latchedSubjectFid ?? privateSession.subjectFid;
          if (privateSession.subjectFid !== expectedSubjectFid) {
            throw failure('subject-changed');
          }
          let approvedSubject = false;
          try {
            approvedSubject = await dependencies.verifyPrivateSubject({
              privateSession,
              latchedSubjectFid: expectedSubjectFid,
              reviewedAdmissionPlanDigest: privateInput.reviewedAdmissionPlanDigest,
              signal: abort.signal,
            });
          } catch {
            if (abort.signal.aborted) throw failure('cancelled');
            throw failure('subject-not-approved');
          }
          if (approvedSubject !== true) throw failure('subject-not-approved');
          latchedSubjectFid = expectedSubjectFid;
          try {
            authority = await dependencies.openAuthority(privateSession.session, abort.signal);
            authorityOpened = true;
          } catch {
            if (abort.signal.aborted) throw failure('cancelled');
            throw failure('authority-failed');
          }
          privateSession = undefined;
          if (abort.signal.aborted) throw failure('cancelled');
          publish(Object.freeze({
            phase: 'running-stage',
            stage,
            stageNumber,
            completedStageCount: expectedStageIndex,
          }));
          let result: Awaited<ReturnType<typeof operation>>;
          try {
            result = await operation(authority, abort.signal);
          } catch {
            if (abort.signal.aborted) throw failure('cancelled');
            throw failure('stage-failed');
          }
          if (abort.signal.aborted) throw failure('cancelled');
          stageCompleted = true;
          return result;
        } catch (error) {
          fatal = true;
          abort.abort();
          throw error;
        } finally {
          privateSession = undefined;
          if (authorityOpened) {
            try {
              await dependencies.closeAuthority(authority as Authority);
            } catch {
              fatal = true;
              mainAuthorityCloseUnconfirmed = true;
              abort.abort();
              throw failure('authority-close-unconfirmed');
            } finally {
              authorityOpened = false;
              authority = undefined;
            }
          }
          if (stageCompleted && !fatal && !abort.signal.aborted) expectedStageIndex += 1;
          stageActive = false;
        }
      };

      try {
        const candidate = await dependencies.evidenceApi.run(Object.freeze({
          evidenceNonce: privateInput.evidenceNonce,
          reviewedAdmissionPlanDigest: privateInput.reviewedAdmissionPlanDigest,
          routeSetCommitment: privateInput.routeSetCommitment,
          signal: abort.signal,
          runStage,
        }));
        if (abort.signal.aborted) throw failure('cancelled');
        if (fatal || stageActive || expectedStageIndex !== OWNER_CANARY_STAGES.length) {
          throw failure('evidence-contract');
        }
        const journey = sanitizeOwnerCanaryJourneyEvidence(candidate);
        if (!journey || latchedSubjectFid === undefined) throw failure('evidence-contract');
        const sameSubjectCommitment = await defaultSameSubjectDigest({
          evidenceNonce: privateInput.evidenceNonce,
          subjectFid: latchedSubjectFid,
        });
        if (!HEX_DIGEST_PATTERN.test(sameSubjectCommitment)) {
          throw failure('evidence-contract');
        }
        const evidence: OwnerCanarySanitizedEvidence = Object.freeze({
          ...journey,
          sameSubjectCommitment,
          freshAuthenticationStageCount: 10,
          tokenPersisted: false,
          adminImpersonation: false,
          notificationBypass: false,
        });
        brandedPlayerEvidence.add(evidence);
        publish(Object.freeze({ phase: 'complete', completedStageCount: 10 }));
        return evidence;
      } catch (error) {
        const normalized = error instanceof OwnerCanaryControllerError
          ? error
          : failure(abort.signal.aborted ? 'cancelled' : 'stage-failed');
        const normalizedCode = ownerCanaryControllerFailureCode(normalized);
        publish(Object.freeze({
          phase: normalizedCode === 'cancelled'
            ? 'cancelled'
            : normalizedCode === 'authority-close-unconfirmed'
              ? 'authority-close-unconfirmed'
              : 'failed',
          completedStageCount: expectedStageIndex,
        }));
        throw normalized;
      } finally {
        abort.abort();
        const runtimeRecoveryState = dependencies.recoveryApi?.state() ?? 'none';
        publishRecovery(runtimeRecoveryState);
        if (runtimeRecoveryState === 'none' || runtimeRecoveryState === 'safe') {
          latchedSubjectFid = undefined;
          latchedReviewedAdmissionPlanDigest = undefined;
        }
        externalSignal?.removeEventListener('abort', forwardAbort);
        if (activeAbort === abort) activeAbort = undefined;
      }
    },
  });
}

/** Single production browser-memory runner; raw authority never enters its result. */
export async function runOwnerCanaryPlayerEvidence(
  controller: OwnerCanaryController,
  input: OwnerCanaryRunInput,
  signal?: AbortSignal,
): Promise<OwnerCanarySanitizedEvidence> {
  return requireOwnerCanaryPlayerEvidence(await controller.run(input, signal));
}
