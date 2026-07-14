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
import { useFarcasterAuth } from '../farcaster/FarcasterAuthProvider';
import type { VerifiedFarcasterIdentity } from '../farcaster/farcasterAuthTypes';
import {
  useWarpkeepBackend,
  WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE
} from '../spacetime';
import {
  WarpkeepAudioDirector,
  WARPKEEP_REALM_TO_MENU_TRANSITION_MS,
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
import {
  WarpTransitionOverlay,
  type WarpTransitionOrigin
} from './transition/WarpTransitionOverlay';
import {
  createExperienceState,
  experienceTransitionReducer,
  getWarpTransitionDirection,
  getWarpTransitionTiming,
  type WarpTransitionDirection,
  type WarpkeepStableExperiencePhase
} from './transition/experienceTransition';
import type { GatewayProjection } from './title/BlackHoleGateway';
import {
  browserGraphicsCapabilities,
  readGraphicsPreference,
  realmProfileForQuality,
  resolveGraphicsQuality,
  subscribeGraphicsPreference,
  writeGraphicsPreference,
  type GraphicsPreference
} from '../settings/graphicsPreference';
import { TitleGatewayHint } from './title/TitleGatewayHint';
import {
  fallbackGatewayProjection,
  type WarpkeepTitleScreenHandle
} from './title/titleScreenTypes';
import './WarpkeepExperience.css';

const MENU_HASH = '#menu';
const REALM_HASH = '#realm';
const MENU_HISTORY_KEY = 'warpkeepMenu';
const REALM_HISTORY_KEY = 'warpkeepRealm';
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
};

function hasMenuHash() {
  return typeof window !== 'undefined' && window.location.hash === MENU_HASH;
}

function hasRealmHash() {
  return typeof window !== 'undefined' && window.location.hash === REALM_HASH;
}

function initialStablePhase(): WarpkeepStableExperiencePhase {
  // A hash is never a credential. Even a restored bridge session must first
  // re-check admission before the authoritative realm may mount.
  if (hasRealmHash()) return 'menu';
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

function safeGatewayOrigin(projection: GatewayProjection): WarpTransitionOrigin {
  if (
    projection.visible
    && Number.isFinite(projection.x)
    && Number.isFinite(projection.y)
  ) {
    return { x: projection.x, y: projection.y };
  }

  const fallback = fallbackGatewayProjection();
  return { x: fallback.x, y: fallback.y };
}

function menuHistoryState() {
  const current = window.history.state;
  const safeCurrent = current && typeof current === 'object'
    ? current as Record<string, unknown>
    : {};
  const nextState = { ...safeCurrent, [MENU_HISTORY_KEY]: true } as WarpkeepHistoryState;
  delete nextState[REALM_HISTORY_KEY];
  return nextState;
}

function realmHistoryState() {
  const current = window.history.state;
  const safeCurrent = current && typeof current === 'object'
    ? current as Record<string, unknown>
    : {};
  return { ...safeCurrent, [REALM_HISTORY_KEY]: true } satisfies WarpkeepHistoryState;
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

export function WarpkeepExperience() {
  const {
    state: farcasterAuthState,
    beginSignIn: beginFarcasterSignIn,
    cancelSignIn: cancelFarcasterSignIn,
    retrySignIn: retryFarcasterSignIn,
    prepareQrCode: prepareFarcasterQrCode,
    refreshSession: refreshFarcasterSession,
    signOut: signOutFarcaster,
    oidcSession,
    rememberDevice,
    setRememberDevice
  } = useFarcasterAuth();
  const backend = useWarpkeepBackend();
  const initiallyAuthenticated = farcasterAuthState.phase === 'authenticated'
    && farcasterAuthState.assurance === 'bridge-oidc-alpha'
    && oidcSession !== undefined;
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
  const [gatewayOrigin, setGatewayOrigin] = useState<WarpTransitionOrigin>(() => ({
    x: typeof window === 'undefined' ? 640 : window.innerWidth * 0.5,
    y: typeof window === 'undefined' ? 280 : window.innerHeight * 0.36
  }));
  const [inputModality, setInputModality] = useState<MenuInputModality>('unknown');
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);
  const [graphicsPreference, setGraphicsPreference] = useState(readGraphicsPreference);
  const [graphicsCapabilities, setGraphicsCapabilities] = useState(browserGraphicsCapabilities);
  const [titleReady, setTitleReady] = useState(initialPhase !== 'title');
  const [showTitleHint, setShowTitleHint] = useState(false);
  const [hintUsesTouchCopy, setHintUsesTouchCopy] = useState(false);
  const [menuPreloadReady, setMenuPreloadReady] = useState(initialPhase !== 'title');
  const [returnPreparing, setReturnPreparing] = useState(false);
  const titleRef = useRef<WarpkeepTitleScreenHandle>(null);
  const audioDirectorRef = useRef<WarpkeepAudioDirectorHandle>(null);
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
  verifiedIdentityRef.current = farcasterAuthState.phase === 'authenticated'
    && farcasterAuthState.assurance === 'bridge-oidc-alpha'
    && oidcSession !== undefined
    ? farcasterAuthState.identity
    : null;
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
  const transitionDirection = getWarpTransitionDirection(experience.phase);
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
    ? {
        fid: verifiedIdentityRef.current.fid,
        username: verifiedIdentityRef.current.username,
        displayName: verifiedIdentityRef.current.displayName
      }
    : null;
  const realmMounted = experience.phase === 'realm' && realmIdentity !== null;
  const titleInteractive = experience.phase === 'title';
  const menuInteractive = experience.phase === 'menu' && !returnPreparing;
  const menuMediaActive = menuMounted;

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
    projection: GatewayProjection,
    input: 'keyboard' | 'pointer' | 'unknown',
    pushHistory: boolean
  ) => {
    if (phaseRef.current !== 'title' || entryLockedRef.current) {
      return;
    }

    entryLockedRef.current = true;
    dismissTitleHint();
    const resolvedModality: MenuInputModality = input === 'keyboard'
      ? 'keyboard'
      : input === 'pointer' && lastPointerTypeRef.current === 'touch'
        ? 'touch'
        : input;
    setInputModality(resolvedModality);
    setMenuPreloadReady(true);
    setGatewayOrigin(safeGatewayOrigin(projection));
    blurActiveElement();
    audioDirectorRef.current?.ensurePlaybackFromGesture();
    audioDirectorRef.current?.transitionTo('menu');

    if (pushHistory && !hasMenuHash()) {
      window.history.pushState(menuHistoryState(), '', `${pageUrlWithoutHash()}${MENU_HASH}`);
    }

    dispatch({ type: 'request-menu' });
  }, [dismissTitleHint]);

  const handleTitleEntryRequest = useCallback((
    projection: GatewayProjection,
    input: 'keyboard' | 'pointer'
  ) => {
    beginMenuTransition(projection, input, true);
  }, [beginMenuTransition]);

  const commitRealmEntry = useCallback((identity: VerifiedFarcasterIdentity) => {
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
    // Start source preparation and the spatial music handoff inside the
    // authenticated player gesture, before the route can unmount the menu.
    audioDirectorRef.current?.ensurePlaybackFromGesture();
    audioDirectorRef.current?.prepareScene('realm');
    audioDirectorRef.current?.transitionTo('realm');
    if (!hasRealmHash()) {
      window.history.pushState(realmHistoryState(), '', `${pageUrlWithoutHash()}${REALM_HASH}`);
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

    // A submitted Terms dialog creates only an in-memory entry intent. The
    // Realm transition waits for the server acknowledgement and admission
    // lifecycle to return to ready, including for remembered sessions.
    setPendingDestination('realm');
    if (backend.state.phase === 'denied' || backend.state.phase === 'error') {
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
    if (phaseRef.current !== 'realm') {
      return;
    }

    clearPendingRealmDestination();
    blurActiveElement();
    audioDirectorRef.current?.ensurePlaybackFromGesture();
    audioDirectorRef.current?.prepareScene('menu');
    audioDirectorRef.current?.transitionTo('menu');
    const state = window.history.state as WarpkeepHistoryState | null;
    const canReturnThroughHistory = hasRealmHash() && state?.[REALM_HISTORY_KEY] === true;
    setPresentedScreen('menu');
    dispatch({ type: 'return-menu' });
    if (canReturnThroughHistory) {
      window.history.back();
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
      const projection = titleRef.current?.getGatewayProjection()
        ?? fallbackGatewayProjection();
      setGatewayOrigin(safeGatewayOrigin(projection));
      setReturnPreparing(false);
      dispatch({ type: 'request-title' });
    };
    if (titleReady) {
      beginPreparedTransition();
      return undefined;
    }

    const readinessFallback = window.setTimeout(beginPreparedTransition, 900);
    return () => window.clearTimeout(readinessFallback);
  }, [returnPreparing, titleReady]);

  const handleExplicitReturn = useCallback(() => {
    const state = window.history.state as WarpkeepHistoryState | null;
    const canReturnThroughHistory = hasMenuHash() && state?.[MENU_HISTORY_KEY] === true;
    beginTitleTransition(canReturnThroughHistory ? 'back' : 'replace');
  }, [beginTitleTransition]);

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
    if (!transitionDirection) {
      if (experience.phase === 'menu' && !returnPreparing) {
        entryLockedRef.current = false;
      }
      return undefined;
    }

    const sequence = experience.transitionSequence;
    const timing = getWarpTransitionTiming(reducedMotion);
    const coverTimer = window.setTimeout(
      () => markTransitionCovered(sequence, transitionDirection),
      timing.coverAtMs + 80
    );
    const completionTimer = window.setTimeout(
      () => finishTransition(sequence, transitionDirection),
      timing.totalMs + 180
    );

    return () => {
      window.clearTimeout(coverTimer);
      window.clearTimeout(completionTimer);
    };
  }, [
    experience.phase,
    experience.transitionSequence,
    finishTransition,
    markTransitionCovered,
    reducedMotion,
    returnPreparing,
    transitionDirection
  ]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      lastPointerTypeRef.current = event.pointerType || 'mouse';
      if (phaseRef.current === 'title') {
        dismissTitleHint();
      }
    };
    const handleTouchStart = () => {
      lastPointerTypeRef.current = 'touch';
      if (phaseRef.current === 'title') {
        dismissTitleHint();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('touchstart', handleTouchStart, true);
    };
  }, [dismissTitleHint]);

  useEffect(() => {
    if (experience.phase !== 'title') {
      return undefined;
    }

    const handleTitleKeyDown = (event: KeyboardEvent) => {
      dismissTitleHint();
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
  }, [dismissTitleHint, experience.phase]);

  useEffect(() => {
    const synchronizeHistory = () => {
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
          const projection = titleRef.current?.getGatewayProjection()
            ?? fallbackGatewayProjection();
          titleRef.current?.requestEnter('keyboard');
          if (phaseRef.current === 'title' && !entryLockedRef.current) {
            beginMenuTransition(projection, 'unknown', false);
          }
        } else if (phase === 'realm') {
          setPresentedScreen('menu');
          dispatch({ type: 'return-menu' });
        }
        return;
      }
      if (phase === 'menu') {
        beginTitleTransition('none');
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
    gateAnonymousRealmRoute
  ]);

  useEffect(() => {
    if (returnPreparing) {
      return;
    }

    if (experience.phase === 'menu') {
      if (hasRealmHash()) {
        gateAnonymousRealmRoute();
      } else if (!hasMenuHash() && !hasRealmHash()) {
        entryLockedRef.current = false;
        beginTitleTransition('none');
      }
    } else if (experience.phase === 'title' && (hasMenuHash() || hasRealmHash())) {
      if (hasRealmHash()) {
        gateAnonymousRealmRoute();
      }
      entryLockedRef.current = false;
      if (titleRef.current) {
        titleRef.current.requestEnter('keyboard');
      } else {
        beginMenuTransition(fallbackGatewayProjection(), 'unknown', false);
      }
    }
  }, [
    beginMenuTransition,
    beginTitleTransition,
    experience.phase,
    gateAnonymousRealmRoute,
    returnPreparing
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

  const getCurrentGatewayProjection = useCallback(() => (
    titleRef.current?.getGatewayProjection() ?? fallbackGatewayProjection()
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
          headingRef={headingRef}
          identity={admissionIdentity}
          onCheckAgain={onCheckAgain}
          onBackToMenu={onBackToMenu}
          onPresentationReady={onPresentationReady}
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
    >
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
                : experience.phase === 'transitioning-to-title' || returnPreparing
                  ? 'returning'
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
          <WarpkeepMainMenu
            active={menuMediaActive}
            authState={farcasterAuthState}
            visible={presentedScreen === 'menu'}
            interactive={menuInteractive}
            inputModality={menuInteractive ? inputModality : 'unknown'}
            focusFirstCommand={menuInteractive && inputModality === 'keyboard'}
            authRailAttemptFailed={admissionPhase === 'denied' || admissionPhase === 'error'}
            backendUnavailableMessage={backend.sharedAlphaAvailable
              ? undefined
              : WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE}
            onCancelFarcasterSignIn={cancelFarcasterSignInAndClearDestination}
            onAcceptAlphaTermsAttempt={backend.beginAlphaTermsAcceptance}
            onDisposeFarcasterSignIn={cancelFarcasterSignIn}
            onRequestAuthenticatedRealm={beginRealmEntry}
            onRequestAuthRailCheck={backend.checkAgain}
            onRequestFarcasterSignIn={beginFarcasterSignIn}
            onPrepareFarcasterQrCode={prepareFarcasterQrCode}
            onRefreshFarcasterSession={refreshFarcasterSession}
            onRequestReturn={handleExplicitReturn}
            onRememberDeviceChange={setRememberDevice}
            onRetryFarcasterSignIn={retryFarcasterSignIn}
            onSignOut={handleSignOut}
            renderAuthRailContent={renderAdmissionPanel}
            rememberDevice={rememberDevice}
            graphicsPreference={graphicsPreference}
            resolvedGraphicsQuality={resolvedGraphicsQuality}
            onGraphicsPreferenceChange={updateGraphicsPreference}
          />
        </div>
      ) : null}

      {realmMounted ? (
        <div
          className="warpkeep-experience__screen warpkeep-experience__screen--realm"
          data-presented={presentedScreen === 'realm' ? 'true' : 'false'}
          aria-hidden={experience.phase !== 'realm'}
          inert={experience.phase !== 'realm' ? true : undefined}
        >
          <Suspense fallback={<SceneModuleFallback label="ASSEMBLING THE REALM" />}>
            <RealmMapScreen
              identity={realmIdentity}
              ownCastle={backend.state.realm?.ownCastle}
              otherCastles={backend.state.realm?.castles}
              sharedPlayers={backend.state.realm?.players}
              sharedProfiles={backend.state.realm?.profiles}
              sharedTileMetadata={backend.state.realm?.tileMetadata}
              sharedTiles={backend.state.realm?.tiles}
              realmName={backend.state.realm?.realm?.publicName}
              onRequestReturn={returnRealmToMenu}
              qualityOverride={realmProfileForQuality(resolvedGraphicsQuality)}
            />
          </Suspense>
        </div>
      ) : null}

      {showTitleHint && experience.phase === 'title' ? (
        <TitleGatewayHint
          getProjection={getCurrentGatewayProjection}
          touch={hintUsesTouchCopy}
        />
      ) : null}

      {transitionDirection ? (
        <WarpTransitionOverlay
          key={experience.transitionSequence}
          direction={transitionDirection}
          origin={gatewayOrigin}
          reducedMotion={reducedMotion}
          onCovered={() => markTransitionCovered(
            experience.transitionSequence,
            transitionDirection
          )}
          onComplete={() => finishTransition(
            experience.transitionSequence,
            transitionDirection
          )}
        />
      ) : null}

      <WarpkeepAudioDirector
        ref={audioDirectorRef}
        scene={audioScene}
        preloadMenu={menuPreloadReady || audioScene === 'menu'}
      />
    </div>
  );
}
