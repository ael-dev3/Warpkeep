import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import { useFarcasterAuth } from '../farcaster/FarcasterAuthProviderCore';
import type {
  FarcasterAuthViewState,
  FarcasterOidcSession,
  VerifiedFarcasterIdentity
} from '../farcaster/farcasterAuthTypes';
import type { WarpkeepBackendState } from '../spacetime/warpkeepBackendTypes';
import {
  useWarpkeepBackend,
  WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE
} from '../spacetime';
import {
  WarpkeepAudioDirector,
  WarpkeepHapticsDirector,
  WarpkeepSfxDirector,
  WARPKEEP_REALM_TO_MENU_TRANSITION_MS,
  stopWarpkeepSfxVoices,
  type AudioScene,
  type WarpkeepAudioDirectorHandle
} from './audio';
import {
  WarpkeepMainMenu,
  WARPKEEP_MENU_POSTER_URL,
  WARPKEEP_MENU_VIDEO_URL,
  type AuthRailRenderControls,
  type MenuInputModality
} from './menu/WarpkeepMainMenu';
import { WarpTransitionOverlay } from './transition/WarpTransitionOverlay';
import {
  createExperienceState,
  experienceTransitionReducer,
  getWarpTransitionTiming,
  type GatewayTransitionInput,
  type WarpTransitionDirection,
  type WarpkeepStableExperiencePhase
} from './transition/experienceTransition';
import {
  currentGatewayViewport,
  resolveGatewayActivationOrigin,
  type GatewayActivationRecord
} from './title/gatewayActivation';
import {
  browserGraphicsCapabilities,
  readGraphicsPreference,
  realmProfileForQuality,
  resolveGraphicsQuality,
  subscribeGraphicsPreference,
  writeGraphicsPreference,
  type GraphicsPreference
} from '../settings/graphicsPreference';
import {
  readAudioMuted,
  subscribeAudioMuted,
  writeAudioMuted
} from '../settings/audioPreference';
import {
  allowsSpeculativeMenuMediaPreload,
  type NetworkNavigatorSnapshot
} from '../settings/networkPreloadPolicy';
import {
  hasExactMiniAppHint,
  useMiniAppBackNavigation,
  useMiniAppHost
} from '../farcaster/miniapp';
import {
  REALM_SURFACE_HISTORY_KEY,
  readRealmSurfaceHistoryState
} from './realm/realmSurfaceNavigation';
import { TitleGatewayHint } from './title/TitleGatewayHint';
import {
  fallbackGatewayClientCenter,
  type WarpkeepTitleScreenHandle
} from './title/titleScreenTypes';
import { FarcasterMiniAppEntryGate } from './auth/FarcasterMiniAppEntryGate';
import './WarpkeepExperience.css';

const MENU_HASH = '#menu';
const REALM_HASH = '#realm';
const MENU_HISTORY_KEY = 'warpkeepMenu';
const REALM_HISTORY_KEY = 'warpkeepRealm';
const DIRECT_REALM_HISTORY_KEY = 'warpkeepDirectRealm';
const DIRECT_REALM_RETURN_WATCHDOG_MS = 1_500;
const TITLE_HINT_DELAY_MS = 5_000;

const WarpkeepTitleScreen3D = lazy(async () => {
  const module = await import('./title/WarpkeepTitleScreen3D');
  return { default: module.WarpkeepTitleScreen3D };
});

const RealmMapScreen = lazy(async () => {
  const module = await import('./realm/RealmMapScreen');
  return { default: module.RealmMapScreen };
});

const FarcasterAdmissionPanel = lazy(async () => {
  const module = await import('./auth/FarcasterAdmissionPanel');
  return { default: module.FarcasterAdmissionPanel };
});

function SceneModuleFallback({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-label={label} className="warpkeep-experience__scene-loader" role="status">
      <span aria-hidden="true" />
      <small>{label}</small>
    </div>
  );
}

type WarpkeepHistoryState = Record<string, unknown> & {
  [MENU_HISTORY_KEY]?: true;
  [REALM_HISTORY_KEY]?: true;
  [DIRECT_REALM_HISTORY_KEY]?: true;
};

function hasMenuHash() {
  return typeof window !== 'undefined' && window.location.hash === MENU_HASH;
}

function hasRealmHash() {
  return typeof window !== 'undefined' && window.location.hash === REALM_HASH;
}

function hasMiniAppLaunchHint() {
  return typeof window !== 'undefined' && hasExactMiniAppHint(window.location.search);
}

function initialStablePhase(): WarpkeepStableExperiencePhase {
  // A hash is never a credential. Even a restored bridge session must first
  // re-check admission before the authoritative realm may mount.
  if (hasRealmHash()) return 'menu';
  // The exact Mini App launch URL opens on a lightweight authority gate. The
  // host SDK must still verify the surface before any direct entry can occur.
  if (hasMiniAppLaunchHint()) return 'menu';
  return hasMenuHash() ? 'menu' : 'title';
}

function readReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isIgnoredShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.isContentEditable
    || target.closest('input, textarea, select, a[href], button, [role="button"]')
  );
}

function safeGatewayOrigin(activation: GatewayActivationRecord) {
  return resolveGatewayActivationOrigin(activation, currentGatewayViewport());
}

function menuHistoryState() {
  const current = window.history.state;
  const safeCurrent = current && typeof current === 'object'
    ? current as Record<string, unknown>
    : {};
  const nextState = { ...safeCurrent, [MENU_HISTORY_KEY]: true } as WarpkeepHistoryState;
  delete nextState[REALM_HISTORY_KEY];
  delete nextState[DIRECT_REALM_HISTORY_KEY];
  delete nextState[REALM_SURFACE_HISTORY_KEY];
  return nextState;
}

function realmHistoryState(directMiniAppEntry = false) {
  const current = window.history.state;
  const safeCurrent = current && typeof current === 'object'
    ? current as Record<string, unknown>
    : {};
  const nextState = {
    ...safeCurrent,
    [REALM_HISTORY_KEY]: true
  } as WarpkeepHistoryState;
  if (directMiniAppEntry) {
    nextState[DIRECT_REALM_HISTORY_KEY] = true;
  } else {
    delete nextState[DIRECT_REALM_HISTORY_KEY];
  }
  delete nextState[REALM_SURFACE_HISTORY_KEY];
  return nextState;
}

function pageUrlWithoutHash() {
  return `${window.location.pathname}${window.location.search}`;
}

function blurActiveElement() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && activeElement !== document.body) {
    activeElement.blur();
  }
}

function MiniAppMenuBackBinding({
  active,
  onBack
}: Readonly<{
  active: boolean;
  onBack: () => void;
}>) {
  useMiniAppBackNavigation(active ? 1 : 0, onBack);
  return null;
}

/**
 * Preserve presentation identity only across the provider's exact public
 * Realm continuity window. The bridge-authenticated machine and the retained
 * canonical Realm must still name the same FID; no tokenless state gains
 * backend or command authority through this presentation-only reference.
 */
export function resolveRealmContinuityIdentity(
  previous: VerifiedFarcasterIdentity | null,
  authState: FarcasterAuthViewState,
  oidcSession: FarcasterOidcSession | undefined,
  backendState: WarpkeepBackendState,
  now = Date.now()
): VerifiedFarcasterIdentity | null {
  if (
    authState.phase !== 'authenticated'
    || authState.assurance !== 'bridge-oidc-alpha'
  ) {
    return null;
  }
  const backendHasRealmContinuity = (
    backendState.phase === 'ready'
    || backendState.phase === 'reconnecting'
  );
  const backendRealmIsSameFid = backendHasRealmContinuity
    && backendState.identity?.fid === authState.identity.fid
    && backendState.realm?.ownCastle.ownerFid === authState.identity.fid;
  if (oidcSession !== undefined && oidcSession.expiresAt > now) {
    // A passive provider effect tears down old Realm state after render. On a
    // direct authenticated FID transition, do not let the new identity shell
    // pair with one frame of the previous caller's retained private display.
    return !backendHasRealmContinuity || backendRealmIsSameFid
      ? authState.identity
      : null;
  }
  return backendRealmIsSameFid && previous?.fid === authState.identity.fid
    ? previous
    : null;
}

export function WarpkeepExperience() {
  const {
    state: farcasterAuthState,
    accessRequest,
    restoreSession: restoreFarcasterSession,
    beginSignIn: beginFarcasterSignIn,
    cancelSignIn: cancelFarcasterSignIn,
    retrySignIn: retryFarcasterSignIn,
    prepareQrCode: prepareFarcasterQrCode,
    refreshSession: refreshFarcasterSession,
    requestAccess,
    retryAccessRequestStatus,
    signOut: signOutFarcaster,
    oidcSession,
    rememberDevice,
    setRememberDevice
  } = useFarcasterAuth();
  const miniAppHost = useMiniAppHost();
  const backend = useWarpkeepBackend();
  const initiallyAuthenticated = farcasterAuthState.phase === 'authenticated'
    && farcasterAuthState.assurance === 'bridge-oidc-alpha'
    && oidcSession !== undefined
    && oidcSession.expiresAt > Date.now();
  const initialPhase = useMemo(
    () => initialStablePhase(),
    // The first render intentionally never treats a route hash as admission.
    []
  );
  const [experience, dispatch] = useReducer(
    experienceTransitionReducer,
    initialPhase,
    createExperienceState
  );
  const [presentedScreen, setPresentedScreen] = useState<WarpkeepStableExperiencePhase>(
    initialPhase
  );
  const [pendingDestination, setPendingDestination] = useState<'realm' | null>(null);
  const [directMiniAppEntryEnabled, setDirectMiniAppEntryEnabled] = useState(
    hasMiniAppLaunchHint
  );
  const [inputModality, setInputModality] = useState<MenuInputModality>('unknown');
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);
  const [graphicsPreference, setGraphicsPreference] = useState(readGraphicsPreference);
  const [audioMuted, setAudioMuted] = useState(readAudioMuted);
  const [graphicsCapabilities, setGraphicsCapabilities] = useState(browserGraphicsCapabilities);
  const [titleReady, setTitleReady] = useState(initialPhase !== 'title');
  const [showTitleHint, setShowTitleHint] = useState(false);
  const [hintUsesTouchCopy, setHintUsesTouchCopy] = useState(false);
  const [menuPreloadReady, setMenuPreloadReady] = useState(initialPhase !== 'title');
  const [returnPreparing, setReturnPreparing] = useState(false);
  const [armedTransitionSequence, setArmedTransitionSequence] = useState(-1);
  const titleRef = useRef<WarpkeepTitleScreenHandle>(null);
  const audioDirectorRef = useRef<WarpkeepAudioDirectorHandle>(null);
  const titleDepartureFocusRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(experience.phase);
  const entryLockedRef = useRef(false);
  const hintDismissedRef = useRef(false);
  const hintShownRef = useRef(false);
  const hintTimerRef = useRef<number | null>(null);
  const coveredSequenceRef = useRef(-1);
  const completedSequenceRef = useRef(-1);
  const lastPointerTypeRef = useRef<string>('mouse');
  const restoreTitleFocusRef = useRef(false);
  const blockedInitialRealmRef = useRef(hasRealmHash());
  const realmAudioResetTimerRef = useRef<number | null>(null);
  const directRealmReturnCleanupRef = useRef<(() => void) | null>(null);
  const verifiedIdentityRef = useRef<VerifiedFarcasterIdentity | null>(
    initiallyAuthenticated
      ? farcasterAuthState.identity
      : null
  );
  const backendRealmContinuityRef = useRef(
    backend.state.phase === 'ready' || backend.state.phase === 'reconnecting'
  );
  const returnPreparingRef = useRef(returnPreparing);
  phaseRef.current = experience.phase;
  returnPreparingRef.current = returnPreparing;
  verifiedIdentityRef.current = resolveRealmContinuityIdentity(
    verifiedIdentityRef.current,
    farcasterAuthState,
    oidcSession,
    backend.state
  );
  backendRealmContinuityRef.current = backend.state.phase === 'ready'
    || backend.state.phase === 'reconnecting';

  const resolvedGraphicsQuality = useMemo(
    () => resolveGraphicsQuality(graphicsPreference, graphicsCapabilities),
    [graphicsCapabilities, graphicsPreference]
  );

  const updateGraphicsPreference = useCallback((preference: GraphicsPreference) => {
    writeGraphicsPreference(preference);
    setGraphicsPreference(preference);
  }, []);

  const updateAudioMuted = useCallback((muted: boolean) => {
    writeAudioMuted(muted);
    setAudioMuted(muted);
  }, []);

  useEffect(() => {
    const updateCapabilities = () => setGraphicsCapabilities(browserGraphicsCapabilities());
    let resizeTimer = 0;
    const scheduleCapabilityUpdate = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(updateCapabilities, 100);
    };
    const unsubscribe = subscribeGraphicsPreference(setGraphicsPreference);
    window.addEventListener('resize', scheduleCapabilityUpdate, { passive: true });
    return () => {
      window.clearTimeout(resizeTimer);
      unsubscribe();
      window.removeEventListener('resize', scheduleCapabilityUpdate);
    };
  }, []);

  useEffect(() => subscribeAudioMuted(setAudioMuted), []);

  const clearPendingRealmDestination = useCallback(() => {
    setPendingDestination(null);
  }, []);

  const cancelFarcasterSignInAndClearDestination = useCallback(() => {
    clearPendingRealmDestination();
    backend.cancelAlphaTermsAcceptance();
    cancelFarcasterSignIn();
  }, [backend, cancelFarcasterSignIn, clearPendingRealmDestination]);

  const gateAnonymousRealmRoute = useCallback(() => {
    // A hash is neither a credential nor Alpha Terms acceptance. Normalize every
    // unaccepted realm route to the menu without preserving an auth/realm intent.
    setPendingDestination(null);
    cancelFarcasterSignIn();
    if (hasRealmHash()) {
      window.history.replaceState(
        menuHistoryState(),
        '',
        `${pageUrlWithoutHash()}${MENU_HASH}`
      );
    }
  }, [cancelFarcasterSignIn]);

  const fadeRealmAudioToMenuAndReset = useCallback(() => {
    const audioDirector = audioDirectorRef.current;
    if (!audioDirector) {
      return;
    }
    audioDirector.prepareScene('menu');
    audioDirector.transitionTo('menu');
    if (realmAudioResetTimerRef.current !== null) {
      window.clearTimeout(realmAudioResetTimerRef.current);
    }
    realmAudioResetTimerRef.current = window.setTimeout(() => {
      realmAudioResetTimerRef.current = null;
      audioDirectorRef.current?.resetScene('realm');
    }, WARPKEEP_REALM_TO_MENU_TRANSITION_MS);
  }, []);

  const handleSignOut = useCallback(() => {
    clearPendingRealmDestination();
    stopWarpkeepSfxVoices();
    backend.disconnect();
    if (phaseRef.current === 'realm') {
      fadeRealmAudioToMenuAndReset();
    } else {
      audioDirectorRef.current?.resetScene('realm');
    }
    signOutFarcaster();
  }, [backend, clearPendingRealmDestination, fadeRealmAudioToMenuAndReset, signOutFarcaster]);

  useLayoutEffect(() => {
    if (!blockedInitialRealmRef.current || !hasRealmHash()) {
      return;
    }
    blockedInitialRealmRef.current = false;
    gateAnonymousRealmRoute();
  }, [gateAnonymousRealmRoute]);

  useEffect(() => () => {
    if (realmAudioResetTimerRef.current !== null) {
      window.clearTimeout(realmAudioResetTimerRef.current);
    }
    directRealmReturnCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (backendRealmContinuityRef.current) {
      return;
    }
    if (!hasRealmHash() && phaseRef.current !== 'realm') {
      return;
    }

    if (hasRealmHash()) {
      gateAnonymousRealmRoute();
    }
    if (phaseRef.current === 'realm') {
      clearPendingRealmDestination();
      fadeRealmAudioToMenuAndReset();
      setPresentedScreen('menu');
      dispatch({ type: 'return-menu' });
    }
  }, [
    clearPendingRealmDestination,
    backend.state.phase,
    farcasterAuthState.phase,
    fadeRealmAudioToMenuAndReset,
    gateAnonymousRealmRoute
  ]);

  const audioScene: AudioScene = !returnPreparing && experience.phase === 'realm'
    ? 'realm'
    : !returnPreparing && (
      experience.phase === 'menu'
      || experience.phase === 'transitioning-to-menu'
    )
      ? 'menu'
      : 'title';
  const transitionRequest = experience.transitionRequest;
  const titleMounted = returnPreparing
    || experience.phase === 'title'
    || experience.phase === 'transitioning-to-title'
    || (
      experience.phase === 'transitioning-to-menu'
      && presentedScreen === 'title'
    );
  const menuMounted = experience.phase === 'menu'
    || experience.phase === 'transitioning-to-menu'
    || (
      experience.phase === 'transitioning-to-title'
      && presentedScreen === 'menu'
    );
  const realmIdentity = (
    backend.state.phase === 'ready'
    || backend.state.phase === 'reconnecting'
  )
    && verifiedIdentityRef.current
    && backend.state.identity?.fid === verifiedIdentityRef.current.fid
    && backend.state.realm?.ownCastle.ownerFid === verifiedIdentityRef.current.fid
    ? {
        fid: verifiedIdentityRef.current.fid,
        username: verifiedIdentityRef.current.username,
        displayName: verifiedIdentityRef.current.displayName,
        pfpUrl: verifiedIdentityRef.current.pfpUrl
      }
    : null;
  const realmMounted = experience.phase === 'realm' && realmIdentity !== null;
  const backendMutationAuthorityCurrent = farcasterAuthState.phase === 'authenticated'
    && farcasterAuthState.assurance === 'bridge-oidc-alpha'
    && oidcSession !== undefined
    && oidcSession.expiresAt > Date.now()
    && backend.state.identity?.fid === farcasterAuthState.identity.fid;
  const titleInteractive = experience.phase === 'title';
  const menuInteractive = experience.phase === 'menu' && !returnPreparing;
  const menuMediaActive = menuMounted;
  const miniAppEntryGateActive = menuMounted
    && directMiniAppEntryEnabled
    && (miniAppHost.state === 'detecting' || miniAppHost.isMiniApp);

  useEffect(() => {
    if (!realmMounted) {
      return;
    }
    // Covers a direct #realm restoration, which has no click gesture. Browsers
    // may still block playback, but the authenticated realm source is ready
    // for the next real interaction and anonymous views never prepare it.
    audioDirectorRef.current?.prepareScene('realm');
    audioDirectorRef.current?.transitionTo('realm');
  }, [realmMounted]);

  useEffect(() => {
    if (
      phaseRef.current !== 'realm'
      || backend.state.phase === 'ready'
      || backend.state.phase === 'reconnecting'
    ) {
      return;
    }
    fadeRealmAudioToMenuAndReset();
    setPresentedScreen('menu');
    dispatch({ type: 'return-menu' });
    if (hasRealmHash()) {
      window.history.replaceState(
        menuHistoryState(),
        '',
        `${pageUrlWithoutHash()}${MENU_HASH}`
      );
    }
  }, [backend.state.phase, fadeRealmAudioToMenuAndReset]);

  const dismissTitleHint = useCallback(() => {
    hintDismissedRef.current = true;
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setShowTitleHint(false);
  }, []);

  const beginMenuTransition = useCallback((
    activation: GatewayActivationRecord,
    input: GatewayTransitionInput,
    pushHistory: boolean
  ) => {
    if (
      phaseRef.current !== 'title'
      || entryLockedRef.current
      || !activation.ready
    ) {
      return;
    }

    entryLockedRef.current = true;
    dismissTitleHint();
    const resolvedModality: MenuInputModality = input === 'keyboard'
      ? 'keyboard'
      : input === 'pointer' && lastPointerTypeRef.current === 'touch'
        ? 'touch'
        : input === 'pointer'
          ? 'pointer'
          : 'unknown';
    const transitionInput: GatewayTransitionInput =
      input === 'pointer' && resolvedModality === 'touch'
        ? 'touch'
        : input;
    setInputModality(resolvedModality);
    setMenuPreloadReady(true);
    const gatewayClientOrigin = safeGatewayOrigin(activation);
    if (resolvedModality === 'keyboard') {
      const landmark = titleDepartureFocusRef.current;
      if (landmark) {
        landmark.dataset.active = 'true';
        landmark.setAttribute('aria-hidden', 'false');
        landmark.setAttribute('role', 'status');
        landmark.focus({ preventScroll: true });
      }
    } else {
      blurActiveElement();
    }
    audioDirectorRef.current?.ensurePlaybackFromGesture();
    audioDirectorRef.current?.transitionTo('menu');

    if (pushHistory && !hasMenuHash()) {
      window.history.pushState(menuHistoryState(), '', `${pageUrlWithoutHash()}${MENU_HASH}`);
    }

    dispatch({
      type: 'request-menu',
      input: transitionInput,
      gatewayClientOrigin,
      acceptedAt: performance.now()
    });
  }, [dismissTitleHint]);

  const handleTitleEntryRequest = useCallback((
    activation: GatewayActivationRecord
  ) => {
    beginMenuTransition(activation, activation.input, true);
  }, [beginMenuTransition]);

  const commitRealmEntry = useCallback((
    identity: VerifiedFarcasterIdentity,
    routeMode: 'push' | 'replace' = 'push'
  ) => {
    if (
      !backend.sharedAlphaAvailable
      || phaseRef.current !== 'menu'
      || returnPreparingRef.current
    ) {
      return;
    }

    const verifiedIdentity = verifiedIdentityRef.current;
    if (!verifiedIdentity || verifiedIdentity.fid !== identity.fid) {
      return;
    }

    if (backend.state.phase !== 'ready') return;

    clearPendingRealmDestination();
    blurActiveElement();
    if (realmAudioResetTimerRef.current !== null) {
      window.clearTimeout(realmAudioResetTimerRef.current);
      realmAudioResetTimerRef.current = null;
    }
    // Explicit menu entry can unlock audio inside its player gesture. Direct
    // Mini App entry only prepares the source; the first real touch remains
    // responsible for satisfying iOS and Android autoplay policy.
    if (routeMode === 'push') {
      audioDirectorRef.current?.ensurePlaybackFromGesture();
    }
    audioDirectorRef.current?.prepareScene('realm');
    audioDirectorRef.current?.transitionTo('realm');
    if (!hasRealmHash()) {
      const nextState = realmHistoryState(routeMode === 'replace');
      if (routeMode === 'replace') {
        window.history.replaceState(nextState, '', `${pageUrlWithoutHash()}${REALM_HASH}`);
      } else {
        window.history.pushState(nextState, '', `${pageUrlWithoutHash()}${REALM_HASH}`);
      }
    }
    setPresentedScreen('realm');
    dispatch({ type: 'request-realm' });
  }, [backend, clearPendingRealmDestination]);

  const beginRealmEntry = useCallback((identity: VerifiedFarcasterIdentity) => {
    if (
      !backend.sharedAlphaAvailable
      || phaseRef.current !== 'menu'
      || returnPreparingRef.current
    ) {
      return;
    }
    const verifiedIdentity = verifiedIdentityRef.current;
    if (!verifiedIdentity || verifiedIdentity.fid !== identity.fid) return;

    // A submitted Terms dialog creates only an in-memory entry intent. A
    // cancelled acknowledgement may still have committed server-side; repeat
    // entry resumes that exact recorded attempt without resending the reducer.
    // The Realm transition still waits for admission and readiness.
    setPendingDestination('realm');
    if (
      backend.entryAgreementSatisfied
      && backend.state.phase === 'awaiting-terms'
    ) {
      backend.beginAlphaTermsAcceptance();
    } else if (backend.state.phase === 'denied' || backend.state.phase === 'error') {
      backend.checkAgain();
    }
  }, [backend]);

  useEffect(() => {
    if (
      pendingDestination !== 'realm'
      || backend.state.phase !== 'ready'
      || !verifiedIdentityRef.current
      || phaseRef.current !== 'menu'
    ) {
      return;
    }
    commitRealmEntry(verifiedIdentityRef.current);
  }, [backend.state.phase, commitRealmEntry, pendingDestination]);

  useEffect(() => {
    if (
      !directMiniAppEntryEnabled
      || !miniAppHost.isMiniApp
      || phaseRef.current !== 'menu'
      || returnPreparingRef.current
      || farcasterAuthState.phase !== 'authenticated'
      || farcasterAuthState.assurance !== 'bridge-oidc-alpha'
      || oidcSession === undefined
      || oidcSession.expiresAt <= Date.now()
      || backend.state.phase !== 'ready'
      || !backend.entryAgreementSatisfied
      || backend.state.identity?.fid !== farcasterAuthState.identity.fid
      || backend.state.realm?.ownCastle.ownerFid !== farcasterAuthState.identity.fid
      || !verifiedIdentityRef.current
    ) {
      return;
    }

    // Quick Auth, admission, current Terms acceptance, and canonical Realm
    // readiness have all been proven by their existing authorities. Replace
    // the launch entry instead of growing host history with a skipped menu.
    commitRealmEntry(verifiedIdentityRef.current, 'replace');
  }, [
    backend.state.phase,
    commitRealmEntry,
    directMiniAppEntryEnabled,
    farcasterAuthState,
    miniAppHost.isMiniApp,
    oidcSession
  ]);

  useEffect(() => {
    if (
      pendingDestination !== 'realm'
      || (
        backend.state.phase !== 'denied'
        && backend.state.phase !== 'error'
        && farcasterAuthState.phase !== 'anonymous'
        && farcasterAuthState.phase !== 'error'
        && farcasterAuthState.phase !== 'expired'
      )
    ) {
      return;
    }
    clearPendingRealmDestination();
  }, [
    backend.state.phase,
    clearPendingRealmDestination,
    farcasterAuthState.phase,
    pendingDestination
  ]);

  const returnRealmToMenu = useCallback(() => {
    if (
      phaseRef.current !== 'realm'
      || directRealmReturnCleanupRef.current
    ) {
      return;
    }

    clearPendingRealmDestination();
    setDirectMiniAppEntryEnabled(false);
    blurActiveElement();
    audioDirectorRef.current?.ensurePlaybackFromGesture();
    audioDirectorRef.current?.prepareScene('menu');
    audioDirectorRef.current?.transitionTo('menu');
    const state = window.history.state as WarpkeepHistoryState | null;
    const canReturnThroughHistory = hasRealmHash()
      && state?.[REALM_HISTORY_KEY] === true
      && state?.[DIRECT_REALM_HISTORY_KEY] !== true;
    const returningFromDirectRealm = hasRealmHash()
      && state?.[REALM_HISTORY_KEY] === true
      && state?.[DIRECT_REALM_HISTORY_KEY] === true;
    const surfaceDepth = state && typeof state === 'object'
      ? readRealmSurfaceHistoryState(
          state[REALM_SURFACE_HISTORY_KEY]
        )?.stack.length ?? 0
      : 0;
    setPresentedScreen('menu');
    dispatch({ type: 'return-menu' });
    if (returningFromDirectRealm && surfaceDepth > 0) {
      let completed = false;
      let retriesRemaining = 1;
      let watchdog: number | undefined;

      const teardown = () => {
        window.removeEventListener('popstate', handlePopState);
        if (watchdog !== undefined) window.clearTimeout(watchdog);
        watchdog = undefined;
        if (directRealmReturnCleanupRef.current === cancel) {
          directRealmReturnCleanupRef.current = null;
        }
      };
      const finish = () => {
        if (completed) return;
        completed = true;
        teardown();
        window.history.replaceState(
          menuHistoryState(),
          '',
          `${pageUrlWithoutHash()}${MENU_HASH}`
        );
      };
      const cancel = () => {
        if (completed) return;
        completed = true;
        teardown();
      };
      const currentSurfaceDepth = () => {
        const current = window.history.state;
        return current && typeof current === 'object'
          ? readRealmSurfaceHistoryState(
              (current as WarpkeepHistoryState)[REALM_SURFACE_HISTORY_KEY]
            )?.stack.length ?? 0
          : 0;
      };
      const armWatchdog = () => {
        if (watchdog !== undefined) window.clearTimeout(watchdog);
        watchdog = window.setTimeout(() => {
          watchdog = undefined;
          const remainingDepth = currentSurfaceDepth();
          if (remainingDepth === 0) {
            finish();
            return;
          }
          if (retriesRemaining <= 0) {
            // A WebView that refuses traversal still receives a safe menu
            // route; subsequent Realm-shaped history is normalized by the
            // ordinary route gate rather than reopening gameplay.
            finish();
            return;
          }
          retriesRemaining -= 1;
          try {
            window.history.go(-remainingDepth);
            armWatchdog();
          } catch {
            finish();
          }
        }, DIRECT_REALM_RETURN_WATCHDOG_MS);
      };
      function handlePopState() {
        const remainingDepth = currentSurfaceDepth();
        if (remainingDepth === 0) {
          finish();
          return;
        }
        try {
          window.history.go(-remainingDepth);
          armWatchdog();
        } catch {
          finish();
        }
      }

      directRealmReturnCleanupRef.current = cancel;
      window.addEventListener('popstate', handlePopState);
      try {
        window.history.go(-surfaceDepth);
        armWatchdog();
      } catch {
        finish();
      }
    } else if (canReturnThroughHistory) {
      window.history.go(-(surfaceDepth + 1));
    } else {
      window.history.replaceState(menuHistoryState(), '', `${pageUrlWithoutHash()}${MENU_HASH}`);
    }
  }, [clearPendingRealmDestination]);

  const beginTitleTransition = useCallback((historyMode: 'back' | 'replace' | 'none') => {
    if (
      phaseRef.current !== 'menu'
      || entryLockedRef.current
      || returnPreparingRef.current
    ) {
      return;
    }

    entryLockedRef.current = true;
    cancelFarcasterSignInAndClearDestination();
    setShowTitleHint(false);
    setTitleReady(false);
    setReturnPreparing(true);
    blurActiveElement();
    audioDirectorRef.current?.ensurePlaybackFromGesture();
    audioDirectorRef.current?.transitionTo('title');
    if (historyMode === 'back') {
      window.history.back();
    } else if (historyMode === 'replace' && hasMenuHash()) {
      const current = window.history.state;
      const nextState = current && typeof current === 'object'
        ? { ...(current as Record<string, unknown>) }
        : {};
      delete nextState[MENU_HISTORY_KEY];
      window.history.replaceState(nextState, '', pageUrlWithoutHash());
    }
  }, [cancelFarcasterSignInAndClearDestination]);

  const cancelPreparedReturn = useCallback(() => {
    setReturnPreparing(false);
    setTitleReady(false);
    entryLockedRef.current = false;
    setPresentedScreen('menu');
    audioDirectorRef.current?.transitionTo('menu');
  }, []);

  useEffect(() => {
    if (!returnPreparing) {
      return undefined;
    }

    const beginPreparedTransition = () => {
      const title = titleRef.current;
      const measurement = title?.getGatewayMeasurement();
      if (!title || !measurement?.ready || measurement.generation < 1) {
        return false;
      }
      const activation = title.getGatewayActivation('history');
      if (!activation.ready) {
        return false;
      }
      const gatewayClientOrigin = safeGatewayOrigin(activation);
      setReturnPreparing(false);
      dispatch({
        type: 'request-title',
        input: 'history',
        gatewayClientOrigin,
        acceptedAt: performance.now()
      });
      return true;
    };
    if (!titleReady) {
      return undefined;
    }
    let frame = 0;
    const waitForFreshMeasurement = () => {
      if (!beginPreparedTransition()) {
        frame = window.requestAnimationFrame(waitForFreshMeasurement);
      }
    };
    waitForFreshMeasurement();
    return () => window.cancelAnimationFrame(frame);
  }, [returnPreparing, titleReady]);

  const handleExplicitReturn = useCallback(() => {
    const state = window.history.state as WarpkeepHistoryState | null;
    const canReturnThroughHistory = hasMenuHash() && state?.[MENU_HISTORY_KEY] === true;
    beginTitleTransition(canReturnThroughHistory ? 'back' : 'replace');
  }, [beginTitleTransition]);

  const openOrdinaryMiniAppMenu = useCallback(() => {
    clearPendingRealmDestination();
    window.history.replaceState(
      menuHistoryState(),
      '',
      `${pageUrlWithoutHash()}${MENU_HASH}`
    );
    setDirectMiniAppEntryEnabled(false);
  }, [clearPendingRealmDestination]);

  const markTransitionCovered = useCallback((
    sequence: number,
    direction: WarpTransitionDirection
  ) => {
    if (coveredSequenceRef.current === sequence) {
      return;
    }
    coveredSequenceRef.current = sequence;
    setPresentedScreen(direction === 'to-menu' ? 'menu' : 'title');
  }, []);

  const markTransitionArmed = useCallback((sequence: number) => {
    setArmedTransitionSequence((current) => (
      current === sequence ? current : sequence
    ));
  }, []);

  const finishTransition = useCallback((
    sequence: number,
    direction: WarpTransitionDirection
  ) => {
    if (completedSequenceRef.current === sequence) {
      return;
    }
    completedSequenceRef.current = sequence;
    markTransitionCovered(sequence, direction);

    if (direction === 'to-menu') {
      if (hasRealmHash()) {
        gateAnonymousRealmRoute();
      }
      if (!hasMenuHash()) {
        setTitleReady(false);
        setReturnPreparing(true);
        audioDirectorRef.current?.transitionTo('title');
      }
      dispatch({ type: 'complete-menu' });
    } else {
      restoreTitleFocusRef.current = true;
      dispatch({ type: 'complete-title' });
      entryLockedRef.current = false;
    }
  }, [gateAnonymousRealmRoute, markTransitionCovered]);

  useEffect(() => {
    if (
      experience.phase !== 'title'
      || !titleReady
      || !restoreTitleFocusRef.current
    ) {
      return undefined;
    }

    restoreTitleFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => titleRef.current?.focusGateway());
    return () => window.cancelAnimationFrame(frame);
  }, [experience.phase, titleReady]);

  useEffect(() => {
    if (
      !transitionRequest
      || armedTransitionSequence !== transitionRequest.sequence
    ) {
      if (experience.phase === 'menu' && !returnPreparing) {
        entryLockedRef.current = false;
      }
      return undefined;
    }

    const { direction, sequence } = transitionRequest;
    const timing = getWarpTransitionTiming(reducedMotion);
    const coverTimer = window.setTimeout(
      () => markTransitionCovered(sequence, direction),
      timing.coverAtMs + 80
    );
    const completionTimer = window.setTimeout(
      () => finishTransition(sequence, direction),
      timing.totalMs + 180
    );

    return () => {
      window.clearTimeout(coverTimer);
      window.clearTimeout(completionTimer);
    };
  }, [
    armedTransitionSequence,
    experience.phase,
    finishTransition,
    markTransitionCovered,
    reducedMotion,
    returnPreparing,
    transitionRequest
  ]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      lastPointerTypeRef.current = event.pointerType || 'mouse';
    };
    const handleTouchStart = () => {
      lastPointerTypeRef.current = 'touch';
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('touchstart', handleTouchStart, true);
    };
  }, []);

  useEffect(() => {
    if (experience.phase !== 'title') {
      return undefined;
    }

    const handleTitleKeyDown = (event: KeyboardEvent) => {
      const isEntryKey = event.key === 'Enter'
        || event.key === ' '
        || event.key === 'Space'
        || event.key === 'Spacebar';
      if (
        !isEntryKey
        || event.repeat
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || event.shiftKey
        || isIgnoredShortcutTarget(event.target)
      ) {
        return;
      }

      if (event.key !== 'Enter') {
        event.preventDefault();
      }
      setInputModality('keyboard');
      titleRef.current?.requestEnter('keyboard');
    };

    document.addEventListener('keydown', handleTitleKeyDown, true);
    return () => document.removeEventListener('keydown', handleTitleKeyDown, true);
  }, [experience.phase]);

  useEffect(() => {
    const synchronizeHistory = () => {
      if (directRealmReturnCleanupRef.current) return;
      const phase = phaseRef.current;
      if (hasRealmHash() && phase !== 'realm') {
        gateAnonymousRealmRoute();
      }
      if (returnPreparingRef.current && hasMenuHash()) {
        cancelPreparedReturn();
        return;
      }
      if (hasRealmHash()) {
        // Only the explicit, terms-gated realm entry path may leave us here.
        return;
      }
      if (hasMenuHash()) {
        if (phase === 'title') {
          const title = titleRef.current;
          if (!titleReady || !title) {
            return;
          }
          const activation = title.getGatewayActivation('history');
          title.requestEnter('history');
          if (phaseRef.current === 'title' && !entryLockedRef.current) {
            beginMenuTransition(activation, 'history', false);
          }
        } else if (phase === 'realm') {
          setPresentedScreen('menu');
          dispatch({ type: 'return-menu' });
        }
        return;
      }
      if (phase === 'menu') {
        if (!miniAppEntryGateActive) beginTitleTransition('none');
      } else if (phase === 'realm') {
        // A direct #realm visit has no preceding menu entry. Preserve a useful
        // in-app route rather than exposing a blank phase on browser Back.
        setPresentedScreen('menu');
        window.history.replaceState(menuHistoryState(), '', `${pageUrlWithoutHash()}${MENU_HASH}`);
        dispatch({ type: 'return-menu' });
      }
    };

    window.addEventListener('popstate', synchronizeHistory);
    window.addEventListener('hashchange', synchronizeHistory);
    return () => {
      window.removeEventListener('popstate', synchronizeHistory);
      window.removeEventListener('hashchange', synchronizeHistory);
    };
  }, [
    beginMenuTransition,
    beginTitleTransition,
    cancelPreparedReturn,
    gateAnonymousRealmRoute,
    miniAppEntryGateActive,
    titleReady
  ]);

  useEffect(() => {
    if (returnPreparing) {
      return;
    }

    if (experience.phase === 'menu') {
      if (hasRealmHash()) {
        // A restored authorized session can finish its server checks in an
        // effect. commitRealmEntry has already written #realm, while React has
        // not yet reduced request-realm. Preserve that exact explicit intent
        // for the next render instead of mistaking it for a forged deep link.
        const state = window.history.state as WarpkeepHistoryState | null;
        if (
          pendingDestination !== 'realm'
          && state?.[DIRECT_REALM_HISTORY_KEY] !== true
        ) {
          gateAnonymousRealmRoute();
        }
      } else if (
        !miniAppEntryGateActive
        && !hasMenuHash()
        && !hasRealmHash()
      ) {
        entryLockedRef.current = false;
        beginTitleTransition('none');
      }
    } else if (
      experience.phase === 'title'
      && titleReady
      && (hasMenuHash() || hasRealmHash())
    ) {
      if (hasRealmHash()) {
        gateAnonymousRealmRoute();
      }
      entryLockedRef.current = false;
      titleRef.current?.requestEnter('history');
    }
  }, [
    beginMenuTransition,
    beginTitleTransition,
    experience.phase,
    gateAnonymousRealmRoute,
    miniAppEntryGateActive,
    pendingDestination,
    returnPreparing,
    titleReady
  ]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(query.matches);
    query.addEventListener?.('change', handleChange);
    return () => query.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (
      experience.phase !== 'title'
      || !titleReady
      || hintDismissedRef.current
      || hintShownRef.current
    ) {
      return undefined;
    }

    hintTimerRef.current = window.setTimeout(() => {
      hintTimerRef.current = null;
      if (phaseRef.current !== 'title' || hintDismissedRef.current) {
        return;
      }
      hintShownRef.current = true;
      const coarsePointer = typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;
      setHintUsesTouchCopy(
        lastPointerTypeRef.current === 'touch'
        || coarsePointer
        || (navigator.maxTouchPoints ?? 0) > 0
      );
      setShowTitleHint(true);
    }, TITLE_HINT_DELAY_MS);

    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    };
  }, [experience.phase, titleReady]);

  useEffect(() => {
    if (!titleReady || experience.phase !== 'title') {
      return undefined;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    let fallbackTimer: number | null = null;
    let preloadVideo: HTMLVideoElement | null = null;
    const preload = () => {
      if (cancelled) {
        return;
      }
      const poster = new Image();
      poster.decoding = 'async';
      poster.src = WARPKEEP_MENU_POSTER_URL;
      if (!allowsSpeculativeMenuMediaPreload(
        navigator as Navigator & NetworkNavigatorSnapshot
      )) {
        return;
      }
      if (!reducedMotion) {
        preloadVideo = document.createElement('video');
        preloadVideo.muted = true;
        preloadVideo.preload = 'metadata';
        preloadVideo.src = WARPKEEP_MENU_VIDEO_URL;
        preloadVideo.load();
      }
      setMenuPreloadReady(true);
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleHandle = idleWindow.requestIdleCallback(preload, { timeout: 1_500 });
    } else {
      fallbackTimer = window.setTimeout(preload, 600);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleHandle);
      }
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      if (preloadVideo) {
        preloadVideo.removeAttribute('src');
        preloadVideo.load();
      }
    };
  }, [experience.phase, reducedMotion, titleReady]);

  const getCurrentGatewayClientCenter = useCallback(() => (
    titleRef.current?.getGatewayClientCenter() ?? fallbackGatewayClientCenter()
  ), []);

  const admissionIdentity = verifiedIdentityRef.current;
  const admissionPhase = backend.state.phase;
  const renderAdmissionPanel = admissionPhase !== 'idle'
    && admissionPhase !== 'ready'
    && admissionIdentity
    ? ({
        headingRef,
        primaryActionRef,
        onCheckAgain,
        onBackToMenu,
        onPresentationReady
      }: AuthRailRenderControls) => (
        <FarcasterAdmissionPanel
          accessRequest={accessRequest}
          headingRef={headingRef}
          identity={admissionIdentity}
          onCheckAgain={onCheckAgain}
          onBackToMenu={onBackToMenu}
          onPresentationReady={onPresentationReady}
          onRequestAccess={requestAccess}
          onRetryAccessRequestStatus={retryAccessRequestStatus}
          onSignOut={handleSignOut}
          phase={admissionPhase}
          primaryActionRef={primaryActionRef}
        />
      )
    : undefined;

  return (
    <div
      className="warpkeep-experience"
      data-phase={experience.phase}
      data-presented-screen={presentedScreen}
      data-return-preparing={returnPreparing ? 'true' : 'false'}
      data-transition-sequence={experience.transitionSequence}
      data-graphics-quality={resolvedGraphicsQuality}
      data-audio-muted={audioMuted ? 'true' : 'false'}
    >
      {menuMounted ? (
        <MiniAppMenuBackBinding
          active={menuInteractive && !miniAppEntryGateActive}
          onBack={handleExplicitReturn}
        />
      ) : null}
      <div
        aria-atomic="true"
        aria-hidden={
          experience.phase !== 'transitioning-to-menu'
          || inputModality !== 'keyboard'
        }
        aria-live={
          experience.phase === 'transitioning-to-menu'
          && inputModality === 'keyboard'
            ? 'polite'
            : 'off'
        }
        className="warpkeep-experience__title-departure-focus"
        data-active={String(
          experience.phase === 'transitioning-to-menu'
          && inputModality === 'keyboard'
        )}
        ref={titleDepartureFocusRef}
        role={
          experience.phase === 'transitioning-to-menu'
          && inputModality === 'keyboard'
            ? 'status'
            : undefined
        }
        tabIndex={-1}
      >
        Entering Warpkeep. Opening the main menu.
      </div>
      {titleMounted ? (
        <div
          className="warpkeep-experience__screen warpkeep-experience__screen--title"
          data-presented={presentedScreen === 'title' ? 'true' : 'false'}
          aria-hidden={!titleInteractive}
          inert={!titleInteractive ? true : undefined}
        >
          <Suspense fallback={<SceneModuleFallback label="OPENING THE GATEWAY" />}>
            <WarpkeepTitleScreen3D
              ref={titleRef}
              graphicsQuality={resolvedGraphicsQuality}
              phase={experience.phase === 'transitioning-to-menu'
                ? 'departing'
                : experience.phase === 'transitioning-to-title'
                  ? 'returning'
                  : returnPreparing
                    ? 'preparing-return'
                  : 'active'}
              onMeaningfulInteraction={dismissTitleHint}
              onReady={() => setTitleReady(true)}
              onRequestEnterMenu={handleTitleEntryRequest}
            />
          </Suspense>
        </div>
      ) : null}

      {menuMounted ? (
        <div
          className="warpkeep-experience__screen warpkeep-experience__screen--menu"
          data-presented={presentedScreen === 'menu' ? 'true' : 'false'}
          aria-hidden={!menuInteractive}
          inert={!menuInteractive ? true : undefined}
        >
          {miniAppEntryGateActive ? (
            <FarcasterMiniAppEntryGate
              accessRequest={accessRequest}
              authState={farcasterAuthState}
              backendState={backend.state}
              hostState={miniAppHost.state}
              onAcceptTerms={backend.beginAlphaTermsAcceptance}
              onBackToMenu={openOrdinaryMiniAppMenu}
              onCancelTermsAttempt={backend.cancelAlphaTermsAcceptance}
              onCheckBackend={backend.checkAgain}
              onRefreshSession={refreshFarcasterSession}
              onRequestAccess={requestAccess}
              onRetryAccessRequestStatus={retryAccessRequestStatus}
              onRetryAuthentication={beginFarcasterSignIn}
              onSignOut={handleSignOut}
            />
          ) : (
            <WarpkeepMainMenu
              active={menuMediaActive}
              authState={farcasterAuthState}
              visible={presentedScreen === 'menu'}
              interactive={menuInteractive}
              inputModality={menuInteractive ? inputModality : 'unknown'}
              focusFirstCommand={menuInteractive && inputModality === 'keyboard'}
              authRailAttemptFailed={admissionPhase === 'denied' || admissionPhase === 'error'}
              entryAgreementSatisfied={backend.entryAgreementSatisfied}
              entryAgreementRequired={admissionPhase === 'awaiting-terms'}
              backendUnavailableMessage={backend.sharedAlphaAvailable
                ? undefined
                : WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE}
              onCancelFarcasterSignIn={cancelFarcasterSignInAndClearDestination}
              onAcceptAlphaTermsAttempt={backend.beginAlphaTermsAcceptance}
              onDisposeFarcasterSignIn={cancelFarcasterSignIn}
              onRequestAuthenticatedRealm={beginRealmEntry}
              onRequestAuthRailCheck={backend.checkAgain}
              onRequestFarcasterSignIn={beginFarcasterSignIn}
              onRestoreFarcasterSession={restoreFarcasterSession}
              onPrepareFarcasterQrCode={prepareFarcasterQrCode}
              onRefreshFarcasterSession={refreshFarcasterSession}
              accessRequest={accessRequest}
              onRequestAccess={requestAccess}
              onRetryAccessRequestStatus={retryAccessRequestStatus}
              onRequestReturn={handleExplicitReturn}
              onRememberDeviceChange={setRememberDevice}
              onRetryFarcasterSignIn={retryFarcasterSignIn}
              onSignOut={handleSignOut}
              renderAuthRailContent={renderAdmissionPanel}
              rememberDevice={rememberDevice}
              graphicsPreference={graphicsPreference}
              resolvedGraphicsQuality={resolvedGraphicsQuality}
              onGraphicsPreferenceChange={updateGraphicsPreference}
              audioMuted={audioMuted}
              onAudioMutedChange={updateAudioMuted}
            />
          )}
        </div>
      ) : null}

      {realmMounted ? (
        <div
          className="warpkeep-experience__screen warpkeep-experience__screen--realm"
          data-presented={presentedScreen === 'realm' ? 'true' : 'false'}
          aria-hidden={experience.phase !== 'realm'}
          inert={experience.phase !== 'realm' ? true : undefined}
        >
          <Suspense fallback={<SceneModuleFallback label="OPENING GENESIS 001" />}>
            {backend.state.realm ? (
              <RealmMapScreen
                identity={realmIdentity}
                snapshot={backend.state.realm}
                resources={backend.state.resources}
                goldExpedition={backend.state.goldExpedition}
                onDispatchGoldExpedition={
                  !backendMutationAuthorityCurrent
                  || backend.state.goldExpedition === undefined
                  ? undefined
                  : backend.dispatchGoldExpedition}
                foodExpedition={backend.state.foodExpedition}
                onDispatchFoodExpedition={
                  !backendMutationAuthorityCurrent
                  || backend.state.foodExpedition === undefined
                  ? undefined
                  : backend.dispatchFoodExpedition}
                woodExpedition={backend.state.woodExpedition}
                onDispatchWoodExpedition={
                  !backendMutationAuthorityCurrent
                  || backend.state.woodExpedition === undefined
                  ? undefined
                  : backend.dispatchWoodExpedition}
                stoneExpedition={backend.state.stoneExpedition}
                onDispatchStoneExpedition={
                  !backendMutationAuthorityCurrent
                  || backend.state.stoneExpedition === undefined
                  ? undefined
                  : backend.dispatchStoneExpedition}
                workerProjection={backend.state.workerProjection}
                workerRoster={backend.state.workerRoster}
                workerResourceState={backend.state.workerResourceState}
                workerPrivateSync={backend.workerPrivateSync}
                onRetryWorkerPrivateSync={backend.retryWorkerPrivateSync}
                onDispatchWorker={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.workerPrivateSync.phase === 'ready'
                  && backend.workerPrivateSync.commandsEnabled
                  && backend.state.workerProjection?.mode === 'active'
                  ? backend.dispatchWorker
                  : undefined}
                onRecallWorker={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.state.realm?.workerSystem?.mode === 'active'
                  && backend.state.realm.workerWorkers !== undefined
                  && backend.state.realm.workerOccupations !== undefined
                  ? backend.recallWorker
                  : undefined}
                onRecallAllWorkers={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.state.realm?.workerSystem?.mode === 'active'
                  && backend.state.realm.workerWorkers !== undefined
                  && backend.state.realm.workerOccupations !== undefined
                  ? backend.recallAllWorkers
                  : undefined}
                onReturnLegacyExpedition={
                  backendMutationAuthorityCurrent
                    ? backend.returnLegacyExpedition
                    : undefined
                }
                graphicsPreference={graphicsPreference}
                resolvedGraphicsQuality={resolvedGraphicsQuality}
                audioMuted={audioMuted}
                onGraphicsPreferenceChange={updateGraphicsPreference}
                onAudioMutedChange={updateAudioMuted}
                onRequestReturn={returnRealmToMenu}
                qualityOverride={realmProfileForQuality(resolvedGraphicsQuality)}
              />
            ) : (
              <section className="warpkeep-experience__realm-unavailable" role="alert">
                <p>{backend.state.phase === 'error'
                  ? 'Genesis 001 could not be opened safely.'
                  : 'Opening Genesis 001…'}</p>
                {backend.state.phase === 'error' ? (
                  <div>
                    <button type="button" onClick={backend.checkAgain}>Retry</button>
                    <button type="button" onClick={returnRealmToMenu}>Return to Menu</button>
                  </div>
                ) : null}
              </section>
            )}
          </Suspense>
        </div>
      ) : null}

      {showTitleHint && experience.phase === 'title' ? (
        <TitleGatewayHint
          getGatewayClientCenter={getCurrentGatewayClientCenter}
          touch={hintUsesTouchCopy}
        />
      ) : null}

      {transitionRequest ? (
        <WarpTransitionOverlay
          key={transitionRequest.sequence}
          request={transitionRequest}
          reducedMotion={reducedMotion}
          onArmed={() => markTransitionArmed(transitionRequest.sequence)}
          onCovered={() => markTransitionCovered(
            transitionRequest.sequence,
            transitionRequest.direction
          )}
          onComplete={() => finishTransition(
            transitionRequest.sequence,
            transitionRequest.direction
          )}
        />
      ) : null}

      {miniAppEntryGateActive ? null : (
        <WarpkeepAudioDirector
          muted={audioMuted}
          ref={audioDirectorRef}
          scene={audioScene}
          preloadMenu={menuPreloadReady || audioScene === 'menu'}
        />
      )}
      <WarpkeepSfxDirector muted={audioMuted} />
      <WarpkeepHapticsDirector />
    </div>
  );
}
