import {
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
  WarpkeepAudioDirector,
  type AudioScene,
  type WarpkeepAudioDirectorHandle
} from './audio';
import {
  WarpkeepMainMenu,
  WARPKEEP_MENU_POSTER_URL,
  WARPKEEP_MENU_VIDEO_URL,
  type MenuInputModality
} from './menu/WarpkeepMainMenu';
import { RealmMapScreen } from './realm/RealmMapScreen';
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
import { TitleGatewayHint } from './title/TitleGatewayHint';
import { WarpkeepTitleScreen3D } from './title/WarpkeepTitleScreen3D';
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
  // A refreshed/direct realm URL has no trusted in-memory session. Start on
  // the menu without flashing the realm; its pending route intent opens the
  // native identity rail after the menu is interactive.
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
    signOut: signOutFarcaster
  } = useFarcasterAuth();
  const initialPhase = useMemo(initialStablePhase, []);
  const [experience, dispatch] = useReducer(
    experienceTransitionReducer,
    initialPhase,
    createExperienceState
  );
  const [presentedScreen, setPresentedScreen] = useState<WarpkeepStableExperiencePhase>(
    initialPhase
  );
  const [pendingDestination, setPendingDestination] = useState<'realm' | null>(() => (
    hasRealmHash() ? 'realm' : null
  ));
  const [gatewayOrigin, setGatewayOrigin] = useState<WarpTransitionOrigin>(() => ({
    x: typeof window === 'undefined' ? 640 : window.innerWidth * 0.5,
    y: typeof window === 'undefined' ? 280 : window.innerHeight * 0.36
  }));
  const [inputModality, setInputModality] = useState<MenuInputModality>('unknown');
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);
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
  const verifiedIdentityRef = useRef<VerifiedFarcasterIdentity | null>(
    farcasterAuthState.phase === 'authenticated'
      ? farcasterAuthState.identity
      : null
  );
  const returnPreparingRef = useRef(returnPreparing);
  phaseRef.current = experience.phase;
  returnPreparingRef.current = returnPreparing;
  verifiedIdentityRef.current = farcasterAuthState.phase === 'authenticated'
    ? farcasterAuthState.identity
    : null;

  const clearPendingRealmDestination = useCallback(() => {
    setPendingDestination(null);
  }, []);

  const cancelFarcasterSignInAndClearDestination = useCallback(() => {
    clearPendingRealmDestination();
    cancelFarcasterSignIn();
  }, [cancelFarcasterSignIn, clearPendingRealmDestination]);

  const gateAnonymousRealmRoute = useCallback(() => {
    // A hash is not a credential. Preserve the player's intended realm
    // destination privately, but normalize the visible URL to the menu before
    // the menu opens its own on-demand Farcaster identity rail.
    setPendingDestination('realm');
    cancelFarcasterSignIn();
    if (hasRealmHash()) {
      window.history.replaceState(
        menuHistoryState(),
        '',
        `${pageUrlWithoutHash()}${MENU_HASH}`
      );
    }
  }, [cancelFarcasterSignIn]);

  const handleSignOut = useCallback(() => {
    clearPendingRealmDestination();
    signOutFarcaster();
  }, [clearPendingRealmDestination, signOutFarcaster]);

  useLayoutEffect(() => {
    if (!blockedInitialRealmRef.current || !hasRealmHash()) {
      return;
    }
    blockedInitialRealmRef.current = false;
    gateAnonymousRealmRoute();
  }, [gateAnonymousRealmRoute]);

  const audioScene: AudioScene = !returnPreparing && (
    experience.phase === 'menu'
    || experience.phase === 'realm'
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
  const realmIdentity = farcasterAuthState.phase === 'authenticated'
    ? {
        fid: farcasterAuthState.identity.fid,
        username: farcasterAuthState.identity.username,
        displayName: farcasterAuthState.identity.displayName
      }
    : null;
  const realmMounted = experience.phase === 'realm' && realmIdentity !== null;
  const titleInteractive = experience.phase === 'title';
  const menuInteractive = experience.phase === 'menu' && !returnPreparing;
  const menuMediaActive = menuMounted;

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

  const beginRealmEntry = useCallback((identity: VerifiedFarcasterIdentity) => {
    if (phaseRef.current !== 'menu' || returnPreparingRef.current) {
      return;
    }

    const verifiedIdentity = verifiedIdentityRef.current;
    if (!verifiedIdentity || verifiedIdentity.fid !== identity.fid) {
      return;
    }

    clearPendingRealmDestination();
    blurActiveElement();
    if (!hasRealmHash()) {
      window.history.pushState(realmHistoryState(), '', `${pageUrlWithoutHash()}${REALM_HASH}`);
    }
    setPresentedScreen('realm');
    dispatch({ type: 'request-realm' });
  }, [clearPendingRealmDestination]);

  const returnRealmToMenu = useCallback(() => {
    if (phaseRef.current !== 'realm') {
      return;
    }

    clearPendingRealmDestination();
    blurActiveElement();
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
        if (verifiedIdentityRef.current) {
          clearPendingRealmDestination();
          setPresentedScreen('realm');
          dispatch({ type: 'complete-menu' });
          dispatch({ type: 'request-realm' });
          return;
        }
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
  }, [clearPendingRealmDestination, gateAnonymousRealmRoute, markTransitionCovered]);

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
      if (hasRealmHash() && !verifiedIdentityRef.current) {
        gateAnonymousRealmRoute();
      }
      if (returnPreparingRef.current && hasMenuHash()) {
        cancelPreparedReturn();
        return;
      }
      if (hasRealmHash()) {
        if (returnPreparingRef.current) {
          cancelPreparedReturn();
          setPresentedScreen('realm');
          dispatch({ type: 'request-realm' });
          return;
        }
        if (phase === 'title') {
          const projection = titleRef.current?.getGatewayProjection()
            ?? fallbackGatewayProjection();
          titleRef.current?.requestEnter('keyboard');
          if (phaseRef.current === 'title' && !entryLockedRef.current) {
            beginMenuTransition(projection, 'unknown', false);
          }
          return;
        }
        if (phase === 'menu') {
          setPresentedScreen('realm');
          dispatch({ type: 'request-realm' });
        }
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
      if (hasRealmHash() && !verifiedIdentityRef.current) {
        gateAnonymousRealmRoute();
      } else if (!hasMenuHash() && !hasRealmHash()) {
        entryLockedRef.current = false;
        beginTitleTransition('none');
      }
    } else if (experience.phase === 'title' && (hasMenuHash() || hasRealmHash())) {
      if (hasRealmHash() && !verifiedIdentityRef.current) {
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
      preloadVideo = document.createElement('video');
      preloadVideo.muted = true;
      preloadVideo.preload = 'metadata';
      preloadVideo.src = WARPKEEP_MENU_VIDEO_URL;
      preloadVideo.load();
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
  }, [experience.phase, titleReady]);

  const getCurrentGatewayProjection = useCallback(() => (
    titleRef.current?.getGatewayProjection() ?? fallbackGatewayProjection()
  ), []);

  return (
    <div
      className="warpkeep-experience"
      data-phase={experience.phase}
      data-presented-screen={presentedScreen}
      data-return-preparing={returnPreparing ? 'true' : 'false'}
      data-transition-sequence={experience.transitionSequence}
    >
      {titleMounted ? (
        <div
          className="warpkeep-experience__screen warpkeep-experience__screen--title"
          data-presented={presentedScreen === 'title' ? 'true' : 'false'}
          aria-hidden={!titleInteractive}
          inert={!titleInteractive ? true : undefined}
        >
          <WarpkeepTitleScreen3D
            ref={titleRef}
            phase={experience.phase === 'transitioning-to-menu'
              ? 'departing'
              : experience.phase === 'transitioning-to-title' || returnPreparing
                ? 'returning'
                : 'active'}
            onMeaningfulInteraction={dismissTitleHint}
            onReady={() => setTitleReady(true)}
            onRequestEnterMenu={handleTitleEntryRequest}
          />
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
            openFarcasterAuthPanel={pendingDestination === 'realm'}
            onCancelFarcasterSignIn={cancelFarcasterSignInAndClearDestination}
            onDisposeFarcasterSignIn={cancelFarcasterSignIn}
            onRequestAuthenticatedRealm={beginRealmEntry}
            onRequestFarcasterSignIn={beginFarcasterSignIn}
            onRequestReturn={handleExplicitReturn}
            onRetryFarcasterSignIn={retryFarcasterSignIn}
            onSignOut={handleSignOut}
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
          <RealmMapScreen
            identity={realmIdentity}
            onRequestReturn={returnRealmToMenu}
          />
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
