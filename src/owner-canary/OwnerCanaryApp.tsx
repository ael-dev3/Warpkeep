import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  MiniAppHostProvider,
  useMiniAppHost,
} from '../farcaster/miniapp/MiniAppHostProvider';
import {
  createOwnerCanaryAuthClient,
} from './ownerCanaryAuthClient';
import {
  createOwnerCanaryController,
  runOwnerCanaryPlayerEvidence,
  type OwnerCanaryController,
  type OwnerCanaryControllerState,
  type OwnerCanaryStage,
} from './ownerCanaryController';
import { loadOwnerCanaryProductionRuntime } from './ownerCanaryProductionRuntime';
import type {
  OwnerCanaryRecoveryState,
  OwnerCanaryRuntime,
  OwnerCanaryRuntimeLoader,
} from './ownerCanaryRuntime';

export type OwnerCanaryAppProps = Readonly<{
  loadRuntime?: OwnerCanaryRuntimeLoader;
}>;

type PendingConsent = Readonly<{
  stage: OwnerCanaryStage;
  stageNumber: number;
  resolve(approved: boolean): void;
}>;

type EvidenceHandoffState = 'idle' | 'pending' | 'complete' | 'failed';

const IDLE_STATE: OwnerCanaryControllerState = Object.freeze({
  phase: 'idle',
  completedStageCount: 0,
});

function OwnerCanaryPanel({
  loadRuntime = loadOwnerCanaryProductionRuntime,
}: OwnerCanaryAppProps) {
  const host = useMiniAppHost();
  const authClient = useMemo(() => createOwnerCanaryAuthClient(), []);
  const [runtime, setRuntime] = useState<OwnerCanaryRuntime | null>();
  const [evidenceNonce, setEvidenceNonce] = useState('');
  const [reviewedAdmissionPlanDigest, setReviewedAdmissionPlanDigest] = useState('');
  const [routeSetCommitment, setRouteSetCommitment] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [controllerState, setControllerState] = useState<OwnerCanaryControllerState>(IDLE_STATE);
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null);
  const [handoffState, setHandoffState] = useState<EvidenceHandoffState>('idle');
  const [runAttempted, setRunAttempted] = useState(false);
  const [recoveryState, setRecoveryState] = useState<OwnerCanaryRecoveryState>('none');
  const controllerRef = useRef<OwnerCanaryController | undefined>(undefined);
  const pendingConsentRef = useRef<PendingConsent | undefined>(undefined);

  const settlePendingConsent = useCallback((approved: boolean) => {
    const pending = pendingConsentRef.current;
    pendingConsentRef.current = undefined;
    setPendingConsent(null);
    pending?.resolve(approved);
  }, []);

  useEffect(() => {
    if (host.state !== 'miniapp') {
      setRuntime(undefined);
      return undefined;
    }
    let retained = true;
    setRuntime(undefined);
    void Promise.resolve()
      .then(loadRuntime)
      .then((loaded) => {
        if (retained) setRuntime(loaded);
      })
      .catch(() => {
        if (retained) setRuntime(null);
      });
    return () => {
      retained = false;
    };
  }, [host.state, loadRuntime]);

  useEffect(() => () => {
    controllerRef.current?.cancel();
    controllerRef.current = undefined;
    const pending = pendingConsentRef.current;
    pendingConsentRef.current = undefined;
    pending?.resolve(false);
  }, []);

  const requestStageConsent = useCallback((input: Readonly<{
    stage: OwnerCanaryStage;
    stageNumber: number;
    signal: AbortSignal;
  }>) => new Promise<boolean>((resolve) => {
    if (input.signal.aborted || pendingConsentRef.current) {
      resolve(false);
      return;
    }
    let settled = false;
    const settle = (approved: boolean) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener('abort', onAbort);
      resolve(approved);
    };
    const onAbort = () => settle(false);
    input.signal.addEventListener('abort', onAbort, { once: true });
    const pending = Object.freeze({
      stage: input.stage,
      stageNumber: input.stageNumber,
      resolve: settle,
    });
    pendingConsentRef.current = pending;
    setPendingConsent(pending);
  }), []);

  const running = controllerState.phase === 'awaiting-consent'
    || controllerState.phase === 'authenticating'
    || controllerState.phase === 'running-stage';
  const busy = running || handoffState === 'pending' || recoveryState === 'running';
  const canStart = host.state === 'miniapp'
    && runtime !== undefined
    && runtime !== null
    && confirmed
    && /^[0-9a-f]{64}$/.test(evidenceNonce)
    && /^[0-9a-f]{64}$/.test(reviewedAdmissionPlanDigest)
    && /^[0-9a-f]{64}$/.test(routeSetCommitment)
    && controllerState.phase !== 'authority-close-unconfirmed'
    && handoffState !== 'failed'
    && !runAttempted
    && !busy;

  const start = useCallback(() => {
    if (!canStart || !runtime) return;
    setRunAttempted(true);
    setHandoffState('idle');
    const runInput = Object.freeze({
      evidenceNonce,
      reviewedAdmissionPlanDigest,
      routeSetCommitment,
    });
    setConfirmed(false);
    setEvidenceNonce('');
    setReviewedAdmissionPlanDigest('');
    setRouteSetCommitment('');
    const controller = createOwnerCanaryController({
      evidenceApi: runtime.evidenceApi,
      recoveryApi: runtime.recoveryApi,
      requestStageConsent,
      getQuickAuthToken: host.quickAuth.getToken,
      exchangeQuickAuth: (token, signal) => authClient.exchangeQuickAuth(token, signal),
      openAuthority: runtime.openAuthority,
      closeAuthority: runtime.closeAuthority,
      openRecallRecoveryAuthority: runtime.openRecallRecoveryAuthority,
      closeRecallRecoveryAuthority: runtime.closeRecallRecoveryAuthority,
      verifyPrivateSubject: runtime.verifyPrivateSubject,
      onState: setControllerState,
      onRecoveryState: setRecoveryState,
    });
    controllerRef.current = controller;
    void runOwnerCanaryPlayerEvidence(controller, runInput)
      .then(async (evidence) => {
        setHandoffState('pending');
        try {
          await runtime.acceptSanitizedEvidence(evidence);
          setHandoffState('complete');
        } catch {
          setHandoffState('failed');
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (
          controllerRef.current === controller
          && controller.recoveryState() !== 'required'
          && controller.recoveryState() !== 'unconfirmed'
        ) controllerRef.current = undefined;
      });
  }, [
    authClient,
    canStart,
    evidenceNonce,
    host.quickAuth.getToken,
    requestStageConsent,
    reviewedAdmissionPlanDigest,
    routeSetCommitment,
    runtime,
  ]);

  const cancel = useCallback(() => {
    settlePendingConsent(false);
    controllerRef.current?.cancel();
  }, [settlePendingConsent]);

  const recover = useCallback(() => {
    const controller = controllerRef.current;
    if (
      !controller
      || (recoveryState !== 'required' && recoveryState !== 'unconfirmed')
    ) return;
    void controller.recover().catch(() => undefined).finally(() => {
      if (
        controllerRef.current === controller
        && controller.recoveryState() === 'safe'
      ) controllerRef.current = undefined;
    });
  }, [recoveryState]);

  const unavailableMessage = host.state === 'detecting'
    ? 'Confirming the Farcaster Mini App host…'
    : host.state !== 'miniapp'
      ? 'This owner-only operation is available only inside the Farcaster Mini App.'
      : runtime === undefined
        ? 'Loading the reviewed canary transport…'
        : runtime === null
          ? 'The reviewed canary transport is not prepared.'
          : null;

  return (
    <main className="owner-canary" data-owner-canary-entry="v1">
      <section aria-labelledby="owner-canary-title" className="owner-canary__panel">
        <p className="owner-canary__eyebrow">WARPKEEP · PRODUCTION CONTROL</p>
        <h1 id="owner-canary-title">Owner player canary</h1>
        <p className="owner-canary__copy">
          This isolated path changes live player state. It does not open or preview the Greater Realm.
        </p>
        <p className="owner-canary__copy">
          This page realm is single-use. Never retry here after a run starts: close the Mini App and
          require independent operator reconciliation. Any dispatched workers must be recalled
          urgently during the reviewed recall stage.
        </p>

        {unavailableMessage ? (
          <p aria-live="polite" className="owner-canary__notice" role="status">
            {unavailableMessage}
          </p>
        ) : (
          <>
            <label className="owner-canary__field">
              <span>Private evidence nonce</span>
              <input
                autoCapitalize="none"
                autoComplete="off"
                disabled={busy}
                inputMode="text"
                maxLength={64}
                onChange={(event) => setEvidenceNonce(event.currentTarget.value)}
                placeholder="64 lowercase hexadecimal characters"
                spellCheck={false}
                type="password"
                value={evidenceNonce}
              />
            </label>
            <label className="owner-canary__field">
              <span>Reviewed admission-plan digest</span>
              <input
                autoCapitalize="none"
                autoComplete="off"
                disabled={busy}
                inputMode="text"
                maxLength={64}
                onChange={(event) => setReviewedAdmissionPlanDigest(event.currentTarget.value)}
                placeholder="64 lowercase hexadecimal characters"
                spellCheck={false}
                value={reviewedAdmissionPlanDigest}
              />
            </label>
            <label className="owner-canary__field">
              <span>Private route-set commitment</span>
              <input
                autoCapitalize="none"
                autoComplete="off"
                disabled={busy}
                inputMode="text"
                maxLength={64}
                onChange={(event) => setRouteSetCommitment(event.currentTarget.value)}
                placeholder="64 lowercase hexadecimal characters"
                spellCheck={false}
                type="password"
                value={routeSetCommitment}
              />
            </label>
            <label className="owner-canary__confirmation">
              <input
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>I approve this run to mutate an already-admitted live production player.</span>
            </label>
            <button
              className="owner-canary__primary"
              disabled={!canStart}
              onClick={start}
              type="button"
            >
              Begin reviewed canary
            </button>
          </>
        )}

        {pendingConsent ? (
          <div className="owner-canary__stage" role="group" aria-labelledby="owner-canary-stage-title">
            <p className="owner-canary__eyebrow">
              STAGE {pendingConsent.stageNumber} OF 10
            </p>
            <h2 id="owner-canary-stage-title">{pendingConsent.stage}</h2>
            <p>
              {pendingConsent.stage === 'recall'
                ? 'Urgent recall: authenticate now so every dispatched worker can be recalled without delay.'
                : 'Continue only when you are ready for a new forced Farcaster authentication prompt.'}
            </p>
            <button
              className="owner-canary__primary"
              onClick={() => settlePendingConsent(true)}
              type="button"
            >
              Authenticate and run this stage
            </button>
          </div>
        ) : null}

        {controllerState.phase === 'authenticating' || controllerState.phase === 'running-stage' ? (
          <p aria-live="polite" className="owner-canary__notice" role="status">
            {controllerState.phase === 'authenticating' ? 'Authenticating' : 'Running'} stage{' '}
            {controllerState.stageNumber} of 10: {controllerState.stage}.
          </p>
        ) : null}
        {controllerState.phase === 'complete' && handoffState === 'pending' ? (
          <p aria-live="polite" className="owner-canary__notice" role="status">
            The player stages completed. Waiting for the reviewed verifier handoff.
          </p>
        ) : null}
        {controllerState.phase === 'complete' && handoffState === 'complete' ? (
          <p aria-live="polite" className="owner-canary__success" role="status">
            The browser actuator stages ended and their private handoff completed. This is not release
            authority: activation remains forbidden until the independent Maincloud admin proof and
            protected receipt both pass review.
          </p>
        ) : null}
        {controllerState.phase === 'authority-close-unconfirmed' ? (
          <p aria-live="assertive" className="owner-canary__failure" role="alert">
            Player-authority closure could not be confirmed. Never retry the main run. If recall is
            required, only the fresh-authenticated recovery control below may open a new authority;
            independent operator confirmation remains mandatory.
          </p>
        ) : controllerState.phase === 'recovery-authority-close-unconfirmed' ? (
          <p aria-live="assertive" className="owner-canary__failure" role="alert">
            Recovery-authority closure could not be confirmed. Browser recovery is now permanently
            disabled; close the Mini App and require independent operator confirmation.
          </p>
        ) : handoffState === 'failed' ? (
          <p aria-live="assertive" className="owner-canary__failure" role="alert">
            Verifier handoff completion could not be confirmed. Do not retry in this page session;
            close the Mini App and require independent operator reconciliation.
          </p>
        ) : controllerState.phase === 'failed' ? (
          <p aria-live="assertive" className="owner-canary__failure" role="alert">
            {recoveryState === 'required' || recoveryState === 'unconfirmed'
              ? 'The main canary stopped after dispatch may have been attempted. Never retry the main run; the recall-only control below is the sole permitted browser action.'
              : 'The canary stopped, but its production outcome may be ambiguous. Do not retry in this page session; close the Mini App and require independent operator reconciliation.'}
          </p>
        ) : null}
        {controllerState.phase === 'cancelled' ? (
          <p aria-live="assertive" className="owner-canary__failure" role="alert">
            {recoveryState === 'required' || recoveryState === 'unconfirmed'
              ? 'The main canary was cancelled after dispatch may have been attempted. Never retry the main run; the recall-only control below is the sole permitted browser action.'
              : 'The canary was cancelled, but an accepted production mutation cannot be ruled out. Do not retry in this page session; close the Mini App and require independent operator reconciliation.'}
          </p>
        ) : null}
        {(recoveryState === 'required' || recoveryState === 'unconfirmed')
          && controllerState.phase !== 'recovery-authority-close-unconfirmed' ? (
          <div className="owner-canary__stage" role="group" aria-labelledby="owner-canary-recovery-title">
            <p className="owner-canary__eyebrow">RECALL-ONLY RECOVERY</p>
            <h2 id="owner-canary-recovery-title">Urgent worker recall</h2>
            <p>
              Authenticate again to recall only workers whose reviewed dispatch was attempted.
              This cannot dispatch, restart, complete evidence, or authorize release.
            </p>
            <button className="owner-canary__primary" onClick={recover} type="button">
              Authenticate and attempt recall-only recovery
            </button>
          </div>
        ) : recoveryState === 'running' ? (
          <p aria-live="assertive" className="owner-canary__notice" role="status">
            Running recall-only recovery with fresh owner authentication.
          </p>
        ) : recoveryState === 'safe' && controllerState.phase !== 'complete' ? (
          <p aria-live="assertive" className="owner-canary__success" role="status">
            Recall safety was observed for every attempted worker. This is not canary evidence or
            release authority; independent admin inspection is still required.
          </p>
        ) : null}
        {running ? (
          <button className="owner-canary__secondary" onClick={cancel} type="button">
            Cancel run
          </button>
        ) : null}
      </section>
    </main>
  );
}

export function OwnerCanaryApp(props: OwnerCanaryAppProps) {
  return (
    <MiniAppHostProvider>
      <OwnerCanaryPanel {...props} />
    </MiniAppHostProvider>
  );
}
