import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react';

import { FarcasterAdmissionPanel } from '../components/auth/FarcasterAdmissionPanel';
import { FarcasterQrAuthPanel } from '../components/auth/FarcasterQrAuthPanel';
import { AlphaParticipationTermsDialog } from '../components/menu/AlphaParticipationTermsDialog';
import { WarpkeepMainMenu } from '../components/menu/WarpkeepMainMenu';
import { RealmMapScreen } from '../components/realm/RealmMapScreen';
import type { FarcasterAuthViewState } from '../farcaster/farcasterAuthTypes';
import {
  boundQaAutoCycleInterval,
  createQaJourneyRealm,
  isQaAdmissionScenario,
  QA_ADMISSION_PHASE_BY_SCENARIO,
  QA_AUTH_STATES,
  QA_JOURNEY_AUTOCYCLE_SCENARIOS,
  QA_JOURNEY_SCENARIOS,
  QA_SYNTHETIC_IDENTITY,
  type QaAdmissionScenario,
  type QaJourneyScenario
} from './qaJourneyFixture';
import './qaJourney.css';

type WarpkeepQaJourneyLabProps = Readonly<{
  initialScenario?: QaJourneyScenario;
  initialAutoCycle?: boolean;
  autoCycleIntervalMs?: number;
  syncLocation?: boolean;
}>;

function nextAuthState(current: FarcasterAuthViewState): FarcasterAuthViewState {
  switch (current.phase) {
    case 'creating-channel':
      return QA_AUTH_STATES.awaiting;
    case 'awaiting-approval':
      return QA_AUTH_STATES.verifying;
    case 'verifying':
      return QA_AUTH_STATES.pending;
    case 'expired':
    case 'error':
      return QA_AUTH_STATES.creating;
    default:
      return current;
  }
}

function advanceLabel(state: FarcasterAuthViewState) {
  switch (state.phase) {
    case 'creating-channel':
      return 'CREATE SYNTHETIC CHANNEL';
    case 'awaiting-approval':
      return 'RECEIVE SYNTHETIC APPROVAL';
    case 'verifying':
      return 'COMPLETE LOCAL VERIFICATION';
    case 'pending-admission':
      return 'USE CHECK AGAIN IN THE AUTH PANEL';
    case 'authenticated':
      return 'USE ENTER REALM IN THE AUTH PANEL';
    default:
      return 'OPEN ENTER REALM TO BEGIN';
  }
}

function SyntheticJourney({
  controlsSuppressed,
  onEnterRealm
}: Readonly<{
  controlsSuppressed: boolean;
  onEnterRealm: () => void;
}>) {
  const [authState, setAuthState] = useState<FarcasterAuthViewState>(QA_AUTH_STATES.anonymous);
  const [rememberDevice, setRememberDevice] = useState(false);
  const canAdvance = [
    'creating-channel',
    'awaiting-approval',
    'verifying',
    'expired',
    'error'
  ].includes(authState.phase);

  const reset = useCallback(() => {
    setAuthState(QA_AUTH_STATES.anonymous);
    setRememberDevice(false);
  }, []);

  return (
    <>
      <WarpkeepMainMenu
        active
        authState={authState}
        onCancelFarcasterSignIn={reset}
        onPrepareFarcasterQrCode={() => undefined}
        onRefreshFarcasterSession={() => setAuthState(QA_AUTH_STATES.authenticated)}
        onRememberDeviceChange={setRememberDevice}
        onRequestAuthenticatedRealm={(identity) => {
          if (identity.fid === QA_SYNTHETIC_IDENTITY.fid) onEnterRealm();
        }}
        onRequestFarcasterSignIn={() => setAuthState(QA_AUTH_STATES.creating)}
        onRequestReturn={() => undefined}
        onRetryFarcasterSignIn={() => setAuthState(QA_AUTH_STATES.creating)}
        onSignOut={reset}
        rememberDevice={rememberDevice}
      />
      <section
        aria-label="Synthetic journey controls"
        aria-hidden={controlsSuppressed || undefined}
        className="qa-journey__flow-controls"
        data-auth-phase={authState.phase}
        inert={controlsSuppressed ? true : undefined}
      >
        <span>LOCAL FLOW · {authState.phase.toUpperCase()}</span>
        <button
          disabled={!canAdvance}
          onClick={() => setAuthState((current) => nextAuthState(current))}
          type="button"
        >
          {advanceLabel(authState)}
        </button>
        <button onClick={reset} type="button">RESET FLOW</button>
      </section>
    </>
  );
}

function DirectAuthStage({
  scenario,
  onScenarioChange
}: Readonly<{
  scenario: Exclude<
    QaJourneyScenario,
    | 'journey'
    | 'menu'
    | 'terms'
    | 'realm-player'
    | 'realm-observer'
    | QaAdmissionScenario
  >;
  onScenarioChange: (scenario: QaJourneyScenario) => void;
}>) {
  const state: FarcasterAuthViewState = {
    'auth-creating': QA_AUTH_STATES.creating,
    'auth-awaiting': QA_AUTH_STATES.awaiting,
    'auth-qr-error': QA_AUTH_STATES.qrError,
    'auth-verifying': QA_AUTH_STATES.verifying,
    'admission-pending': QA_AUTH_STATES.pending,
    'auth-authenticated': QA_AUTH_STATES.authenticated,
    'auth-expired': QA_AUTH_STATES.expired,
    'auth-error': QA_AUTH_STATES.error
  }[scenario];

  const identity = state.phase === 'authenticated' || state.phase === 'pending-admission'
    ? state.identity
    : undefined;

  return (
    <main className="qa-journey__auth-stage">
      <div className="warpkeep-menu-auth-rail">
        <FarcasterQrAuthPanel
          assurance={state.phase === 'authenticated' ? state.assurance : undefined}
          errorMessage={state.phase === 'error' || state.phase === 'expired'
            ? state.error.message
            : undefined}
          identity={identity}
          onBackToMenu={() => onScenarioChange('menu')}
          onCancel={() => onScenarioChange('menu')}
          onCheckAdmission={() => onScenarioChange('auth-authenticated')}
          onEnterRealm={() => undefined}
          onPrepareQrCode={() => onScenarioChange('auth-awaiting')}
          onRetry={() => onScenarioChange('auth-creating')}
          onSignOut={() => onScenarioChange('menu')}
          phase={state.phase}
          qr={state.phase === 'awaiting-approval' ? state.qr : undefined}
        />
      </div>
    </main>
  );
}

function DirectAdmissionStage({
  scenario,
  onScenarioChange
}: Readonly<{
  scenario: QaAdmissionScenario;
  onScenarioChange: (scenario: QaJourneyScenario) => void;
}>) {
  return (
    <main className="qa-journey__auth-stage">
      <div className="warpkeep-menu-auth-rail">
        <FarcasterAdmissionPanel
          identity={QA_SYNTHETIC_IDENTITY}
          onBackToMenu={() => onScenarioChange('menu')}
          onCheckAgain={() => onScenarioChange('auth-authenticated')}
          onSignOut={() => onScenarioChange('menu')}
          phase={QA_ADMISSION_PHASE_BY_SCENARIO[scenario]}
        />
      </div>
    </main>
  );
}

function ScenarioStage({
  controlsSuppressed,
  scenario,
  onScenarioChange
}: Readonly<{
  scenario: QaJourneyScenario;
  controlsSuppressed: boolean;
  onScenarioChange: (scenario: QaJourneyScenario) => void;
}>) {
  if (scenario === 'journey') {
    return (
      <SyntheticJourney
        controlsSuppressed={controlsSuppressed}
        onEnterRealm={() => onScenarioChange('realm-player')}
      />
    );
  }
  if (scenario === 'menu') {
    return (
      <WarpkeepMainMenu
        active
        onRequestReturn={() => undefined}
      />
    );
  }
  if (isQaAdmissionScenario(scenario)) {
    return <DirectAdmissionStage onScenarioChange={onScenarioChange} scenario={scenario} />;
  }
  if (scenario === 'terms') {
    return (
      <main className="qa-journey__modal-stage" aria-label="Synthetic Terms fixture">
        <AlphaParticipationTermsDialog
          onCancel={() => onScenarioChange('menu')}
          onContinue={() => onScenarioChange('auth-creating')}
        />
      </main>
    );
  }
  if (scenario === 'realm-player' || scenario === 'realm-observer') {
    const realm = createQaJourneyRealm();
    return (
      <RealmMapScreen
        identity={{
          ...realm.identity,
          username: QA_SYNTHETIC_IDENTITY.username,
          displayName: QA_SYNTHETIC_IDENTITY.displayName
        }}
        onRequestReturn={() => onScenarioChange('menu')}
        presentationMode={scenario === 'realm-observer' ? 'observer' : 'player'}
        snapshot={realm.snapshot}
      />
    );
  }
  return <DirectAuthStage onScenarioChange={onScenarioChange} scenario={scenario} />;
}

function replaceLocalScenario(scenario: QaJourneyScenario) {
  const url = new URL(window.location.href);
  url.searchParams.set('scenario', scenario);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
}

function suppressUnsafeLabClick(event: ReactMouseEvent<HTMLDivElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const modal = event.currentTarget.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  if (modal && !modal.contains(target)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor) return;
  try {
    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) {
      event.preventDefault();
      event.stopPropagation();
    }
  } catch {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function WarpkeepQaJourneyLab({
  initialScenario = 'journey',
  initialAutoCycle = false,
  autoCycleIntervalMs = 6_000,
  syncLocation = false
}: WarpkeepQaJourneyLabProps) {
  const [scenario, setScenario] = useState<QaJourneyScenario>(initialScenario);
  const [autoCycle, setAutoCycle] = useState(
    initialAutoCycle && initialScenario !== 'journey' && initialScenario !== 'terms'
  );
  const [controlsVisible, setControlsVisible] = useState(true);
  const [modalActive, setModalActive] = useState(false);
  const labRootRef = useRef<HTMLDivElement>(null);
  const boundedAutoCycleIntervalMs = boundQaAutoCycleInterval(autoCycleIntervalMs);

  useEffect(() => {
    const root = labRootRef.current;
    if (!root) return undefined;
    const reconcileModal = () => {
      const next = Boolean(root.querySelector('[role="dialog"][aria-modal="true"]'));
      setModalActive((current) => current === next ? current : next);
      if (next) setAutoCycle(false);
    };
    const observer = new MutationObserver(reconcileModal);
    observer.observe(root, { childList: true, subtree: true });
    reconcileModal();
    return () => observer.disconnect();
  }, []);

  const changeScenario = useCallback((nextScenario: QaJourneyScenario) => {
    setScenario(nextScenario);
    if (nextScenario === 'journey' || nextScenario === 'terms') setAutoCycle(false);
    if (syncLocation) replaceLocalScenario(nextScenario);
  }, [syncLocation]);

  useEffect(() => {
    if (!autoCycle) return undefined;
    const timer = window.setInterval(() => {
      setScenario((current) => {
        const currentIndex = QA_JOURNEY_AUTOCYCLE_SCENARIOS.indexOf(
          current as Exclude<QaJourneyScenario, 'journey' | 'terms'>
        );
        const next = QA_JOURNEY_AUTOCYCLE_SCENARIOS[
          (currentIndex + 1) % QA_JOURNEY_AUTOCYCLE_SCENARIOS.length
        ]!;
        if (syncLocation) replaceLocalScenario(next);
        return next;
      });
    }, boundedAutoCycleIntervalMs);
    return () => window.clearInterval(timer);
  }, [autoCycle, boundedAutoCycleIntervalMs, syncLocation]);

  const toggleAutoCycle = useCallback(() => {
    if (autoCycle) {
      setAutoCycle(false);
      return;
    }
    if (scenario === 'journey' || scenario === 'terms') changeScenario('menu');
    setAutoCycle(true);
  }, [autoCycle, changeScenario, scenario]);

  return (
    <div
      className="qa-journey"
      data-modal-active={modalActive ? 'true' : 'false'}
      data-qa-scenario={scenario}
      onAuxClickCapture={suppressUnsafeLabClick}
      onClickCapture={suppressUnsafeLabClick}
      onContextMenuCapture={suppressUnsafeLabClick}
      ref={labRootRef}
    >
      <ScenarioStage
        controlsSuppressed={modalActive}
        key={scenario}
        onScenarioChange={changeScenario}
        scenario={scenario}
      />
      {controlsVisible ? (
        <aside
          aria-hidden={modalActive || undefined}
          aria-label="Local QA controls"
          className="qa-journey__controls"
          inert={modalActive ? true : undefined}
        >
          <div>
            <strong>WARPKEEP QA JOURNEY LAB</strong>
            <span>SYNTHETIC · LOOPBACK ONLY · EXTERNAL LINKS DISABLED</span>
          </div>
          <label>
            <span>VIEW</span>
            <select
              aria-label="QA journey view"
              onChange={(event) => changeScenario(event.currentTarget.value as QaJourneyScenario)}
              value={scenario}
            >
              {QA_JOURNEY_SCENARIOS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <button
            aria-pressed={autoCycle}
            onClick={toggleAutoCycle}
            type="button"
          >
            {autoCycle ? 'PAUSE AUTO-CYCLE' : 'START AUTO-CYCLE'}
          </button>
          <button onClick={() => setControlsVisible(false)} type="button">HIDE CONTROLS</button>
        </aside>
      ) : (
        <button
          className="qa-journey__restore-controls"
          onClick={() => setControlsVisible(true)}
          type="button"
        >
          OPEN LOCAL QA CONTROLS
        </button>
      )}
    </div>
  );
}
