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
import { NEW_ADMISSIONS_SUSPENDED } from '../release/admissionLaunchPolicy';
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
  type AuthRailRenderControls
} from './menu/WarpkeepMainMenu';
import { resolveMenuWarpletSelection } from './menu/menuWarpletRegistry';
import {
  createExperienceState,
  experienceTransitionReducer,
  type WarpkeepStableExperiencePhase
} from './transition/experienceTransition';
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
  hasExactMiniAppHint,
  useMiniAppBackNavigation,
  useMiniAppHost
} from '../farcaster/miniapp';
import { usePtrRealm } from '../ptr/PtrRealmProvider';
import { isCurrentPtrRealmAuthority } from '../ptr/ptrRealmAuthClient';
import { PtrSessionRenewalPanel } from '../ptr/PtrSessionContinuation';
import {
  REALM_SURFACE_HISTORY_KEY,
  readRealmSurfaceHistoryState
} from './realm/realmSurfaceNavigation';
import { FarcasterMiniAppEntryGate } from './auth/FarcasterMiniAppEntryGate';
import { useFarcasterAdmissionCheckResultHaptic } from './auth/FarcasterAdmissionCheck';
import './WarpkeepExperience.css';

const MENU_HASH = '#menu';
const REALM_HASH = '#realm';
const MENU_HISTORY_KEY = 'warpkeepMenu';
const REALM_HISTORY_KEY = 'warpkeepRealm';
const DIRECT_REALM_HISTORY_KEY = 'warpkeepDirectRealm';
const REALM_ID_HISTORY_KEY = 'warpkeepRealmId';
const DIRECT_REALM_RETURN_WATCHDOG_MS = 1_500;
const NOTIFICATION_ADMISSION_CONFIRMATION_MS = 900;

const RealmMapScreen = lazy(async () => {
  const module = await import('./realm/RealmMapScreen');
  return { default: module.RealmMapScreen };
});

const WarpkeepMenuWorld3D = lazy(async () => {
  const module = await import('./menu/WarpkeepMenuWorld3D');
  return { default: module.WarpkeepMenuWorld3D };
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
  [REALM_ID_HISTORY_KEY]?: ActiveRealmId;
};

type ActiveRealmId = 'genesis-001' | 'ptr';

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
  return 'menu';
}

function menuHistoryState() {
  const current = window.history.state;
  const safeCurrent = current && typeof current === 'object'
    ? current as Record<string, unknown>
    : {};
  const nextState = { ...safeCurrent, [MENU_HISTORY_KEY]: true } as WarpkeepHistoryState;
  delete nextState[REALM_HISTORY_KEY];
  delete nextState[DIRECT_REALM_HISTORY_KEY];
  delete nextState[REALM_ID_HISTORY_KEY];
  delete nextState[REALM_SURFACE_HISTORY_KEY];
  return nextState;
}

function realmHistoryState(
  directMiniAppEntry = false,
  realmId: ActiveRealmId = 'genesis-001'
) {
  const current = window.history.state;
  const safeCurrent = current && typeof current === 'object'
    ? current as Record<string, unknown>
    : {};
  const nextState = {
    ...safeCurrent,
    [REALM_HISTORY_KEY]: true,
    [REALM_ID_HISTORY_KEY]: realmId
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
    admissionCheck,
    restoreSession: restoreFarcasterSession,
    beginSignIn: beginFarcasterSignIn,
    cancelSignIn: cancelFarcasterSignIn,
    retrySignIn: retryFarcasterSignIn,
    prepareQrCode: prepareFarcasterQrCode,
    refreshSession: refreshFarcasterSession,
    checkAdmission,
    requestAccess,
    retryAccessRequestStatus,
    signOut: signOutFarcaster,
    oidcSession,
    rememberDevice,
    setRememberDevice
  } = useFarcasterAuth();
  const miniAppHost = useMiniAppHost();
  const ptrRealm = usePtrRealm();
  useFarcasterAdmissionCheckResultHaptic(admissionCheck);
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
  const [menuRouteGeneration, setMenuRouteGeneration] = useState(0);
  const [pendingDestination, setPendingDestination] = useState<'realm' | 'ptr' | null>(null);
  const [activeRealm, setActiveRealm] = useState<ActiveRealmId | null>(null);
  const ptrSurfaceRef = useRef<'world' | 'keep'>('world');
  const ptrUnconfirmedActionRef = useRef(false);
  const ptrLastGameplayRef = useRef(ptrRealm.gameplay04);
  const [ptrContinuationNotice, setPtrContinuationNotice] = useState(false);
  const [directMiniAppEntryEnabled, setDirectMiniAppEntryEnabled] = useState(
    hasMiniAppLaunchHint
  );
  const [graphicsPreference, setGraphicsPreference] = useState(readGraphicsPreference);
  const [audioMuted, setAudioMuted] = useState(readAudioMuted);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [graphicsCapabilities, setGraphicsCapabilities] = useState(browserGraphicsCapabilities);
  const audioDirectorRef = useRef<WarpkeepAudioDirectorHandle>(null);
  const phaseRef = useRef(experience.phase);
  const activeRealmRef = useRef(activeRealm);
  const blockedInitialRealmRef = useRef(hasRealmHash());
  const realmAudioResetTimerRef = useRef<number | null>(null);
  const directRealmReturnCleanupRef = useRef<(() => void) | null>(null);
  const notificationRealmEntryTimerRef = useRef<number | null>(null);
  const pendingDestinationRef = useRef<'realm' | 'ptr' | null>(pendingDestination);
  const verifiedIdentityRef = useRef<VerifiedFarcasterIdentity | null>(
    initiallyAuthenticated
      ? farcasterAuthState.identity
      : null
  );
  const backendRealmContinuityRef = useRef(
    backend.state.phase === 'ready' || backend.state.phase === 'reconnecting'
  );
  phaseRef.current = experience.phase;
  activeRealmRef.current = activeRealm;
  pendingDestinationRef.current = pendingDestination;
  verifiedIdentityRef.current = resolveRealmContinuityIdentity(
    verifiedIdentityRef.current,
    farcasterAuthState,
    oidcSession,
    backend.state
  );
  backendRealmContinuityRef.current = backend.state.phase === 'ready'
    || backend.state.phase === 'reconnecting';

  const resolvedGraphicsQuality = useMemo(
    () => resolveGraphicsQuality(graphicsPreference, {
      ...graphicsCapabilities,
      conservativeEmbeddedMobile: miniAppHost.isMiniApp
    }),
    [graphicsCapabilities, graphicsPreference, miniAppHost.isMiniApp]
  );
  const farcasterMenuIdentity = farcasterAuthState.phase === 'authenticated'
    || farcasterAuthState.phase === 'pending-admission'
    ? farcasterAuthState.identity
    : null;
  const ptrMenuIdentity = (ptrRealm.phase === 'admitted' || ptrRealm.phase === 'ready')
    && ptrRealm.presentationAuthority?.source === 'server-verified'
    && ptrRealm.presentationAuthority.admission === 'admitted'
    && ptrRealm.authority !== null
    && isCurrentPtrRealmAuthority(ptrRealm.authority, Date.now())
    ? ptrRealm.authority
    : null;
  const menuWarpletSelection = farcasterMenuIdentity && ptrMenuIdentity
    && farcasterMenuIdentity.fid !== ptrMenuIdentity.fid
    ? { kind: 'unassigned' as const, fid: null, sceneKey: 'verified-fid-conflict' }
    : farcasterMenuIdentity || ptrMenuIdentity
      ? resolveMenuWarpletSelection(farcasterMenuIdentity ?? ptrMenuIdentity)
      : miniAppHost.isMiniApp
        // A Mini App host is never assignment authority, even without context.user.
        ? { kind: 'unassigned' as const, fid: null, sceneKey: 'miniapp-unverified-fid' }
        : resolveMenuWarpletSelection(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const updateGraphicsPreference = useCallback((preference: GraphicsPreference) => {
    writeGraphicsPreference(preference);
    setGraphicsPreference(preference);
  }, []);

  const updateAudioMuted = useCallback((muted: boolean) => {
    if (!muted) audioDirectorRef.current?.unmuteFromGesture();
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
    pendingDestinationRef.current = null;
    setPendingDestination(null);
  }, []);

  const cancelPtrRealmEntry = useCallback(() => {
    if (pendingDestinationRef.current === 'ptr') {
      clearPendingRealmDestination();
    }
    ptrRealm.leave();
    ptrSurfaceRef.current = 'world';
    ptrUnconfirmedActionRef.current = false;
    setPtrContinuationNotice(false);
  }, [clearPendingRealmDestination, ptrRealm.leave]);

  useEffect(() => {
    ptrRealm.setContinuationActive(activeRealm === 'ptr' && experience.phase === 'realm');
    return () => ptrRealm.setContinuationActive(false);
  }, [activeRealm, experience.phase, ptrRealm.setContinuationActive]);

  // React can batch a fast renewal through to ready. Capture the old command
  // state before the fresh controller's layout effects report its first read.
  const ptrSessionReplaced = ptrRealm.gameplay04 !== null
    && ptrLastGameplayRef.current !== null
    && ptrRealm.gameplay04 !== ptrLastGameplayRef.current;
  const ptrRenewalInterrupted = activeRealm === 'ptr' && experience.phase === 'realm'
    && ptrUnconfirmedActionRef.current
    && (ptrRealm.phase === 'renewing' || ptrRealm.phase === 'renewal-error' || ptrSessionReplaced);
  useLayoutEffect(() => {
    if (ptrRenewalInterrupted) setPtrContinuationNotice(true);
    ptrLastGameplayRef.current = ptrRealm.gameplay04;
  }, [ptrRenewalInterrupted, ptrRealm.gameplay04]);

  const rememberPtrSurface = useCallback((surface: 'world' | 'keep') => {
    if (activeRealmRef.current === 'ptr' && phaseRef.current === 'realm') {
      ptrSurfaceRef.current = surface;
    }
  }, []);
  const rememberPtrCommandState = useCallback((unconfirmed: boolean) => {
    if (activeRealmRef.current === 'ptr' && phaseRef.current === 'realm') {
      ptrUnconfirmedActionRef.current = unconfirmed;
    }
  }, []);
  const dismissPtrContinuationNotice = useCallback(() => setPtrContinuationNotice(false), []);

  const deactivateCurrentRealm = useCallback(() => {
    cancelPtrRealmEntry();
    activeRealmRef.current = null;
    setActiveRealm(null);
  }, [cancelPtrRealmEntry]);

  const cancelFarcasterSignInAndClearDestination = useCallback(() => {
    clearPendingRealmDestination();
    backend.cancelAlphaTermsAcceptance();
    cancelFarcasterSignIn();
  }, [backend, cancelFarcasterSignIn, clearPendingRealmDestination]);

  const gateAnonymousRealmRoute = useCallback(() => {
    // A hash is neither a credential nor Alpha Terms acceptance. Normalize every
    // unaccepted realm route to the menu without preserving an auth/realm intent.
    cancelPtrRealmEntry();
    cancelFarcasterSignIn();
    if (hasRealmHash()) {
      window.history.replaceState(
        menuHistoryState(),
        '',
        `${pageUrlWithoutHash()}${MENU_HASH}`
      );
    }
  }, [cancelFarcasterSignIn, cancelPtrRealmEntry]);

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
    deactivateCurrentRealm();
    stopWarpkeepSfxVoices();
    backend.disconnect();
    if (phaseRef.current === 'realm') {
      fadeRealmAudioToMenuAndReset();
    } else {
      audioDirectorRef.current?.resetScene('realm');
    }
    signOutFarcaster();
  }, [
    backend,
    clearPendingRealmDestination,
    deactivateCurrentRealm,
    fadeRealmAudioToMenuAndReset,
    signOutFarcaster
  ]);

  useLayoutEffect(() => {
    if (blockedInitialRealmRef.current && hasRealmHash()) {
      blockedInitialRealmRef.current = false;
      gateAnonymousRealmRoute();
    } else if (!hasMenuHash() && !hasRealmHash()) {
      // Root and retired #title routes both resolve to the menu before paint.
      window.history.replaceState(
        menuHistoryState(),
        '',
        `${pageUrlWithoutHash()}${MENU_HASH}`
      );
    }
  }, [gateAnonymousRealmRoute]);

  useEffect(() => () => {
    if (realmAudioResetTimerRef.current !== null) {
      window.clearTimeout(realmAudioResetTimerRef.current);
    }
    directRealmReturnCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (activeRealmRef.current === 'ptr') {
      return;
    }
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
      deactivateCurrentRealm();
      fadeRealmAudioToMenuAndReset();
      setPresentedScreen('menu');
      dispatch({ type: 'return-menu' });
    }
  }, [
    clearPendingRealmDestination,
    deactivateCurrentRealm,
    backend.state.phase,
    farcasterAuthState.phase,
    fadeRealmAudioToMenuAndReset,
    gateAnonymousRealmRoute
  ]);

  const genesis001RealmIdentity = (
    backend.state.phase === 'ready'
    || backend.state.phase === 'reconnecting'
  )
    && verifiedIdentityRef.current
    && backend.state.identity?.fid === verifiedIdentityRef.current.fid
    && (
      backend.state.realm?.ownCastle.ownerFid === verifiedIdentityRef.current.fid
      || (
        backend.state.legacyRealmAuthority === 'retired'
        && backend.state.realmContinuity?.ownCastle.ownerFid
          === verifiedIdentityRef.current.fid
      )
    )
    ? {
        fid: verifiedIdentityRef.current.fid,
        username: verifiedIdentityRef.current.username,
        displayName: verifiedIdentityRef.current.displayName,
        pfpUrl: verifiedIdentityRef.current.pfpUrl
      }
    : null;
  const ptrPresentationUser = miniAppHost.context?.user;
  const ptrRealmIdentity = ptrRealm.phase === 'ready'
    && ptrRealm.authority !== null
    && ptrRealm.bridge !== null
    && ptrRealm.viewAnchor !== null
    ? {
        fid: ptrRealm.authority.fid,
        ...(ptrPresentationUser?.fid === ptrRealm.authority.fid
          ? {
              ...(ptrPresentationUser.username === undefined
                ? {}
                : { username: ptrPresentationUser.username }),
              ...(ptrPresentationUser.displayName === undefined
                ? {}
                : { displayName: ptrPresentationUser.displayName }),
              ...(ptrPresentationUser.pfpUrl === undefined
                ? {}
                : { pfpUrl: ptrPresentationUser.pfpUrl })
            }
          : {})
      }
    : null;
  const realmIdentity = activeRealm === 'ptr'
    ? ptrRealmIdentity
    : activeRealm === 'genesis-001' ? genesis001RealmIdentity : null;
  const realmMounted = experience.phase === 'realm' && realmIdentity !== null;
  const ptrContinuationVisible = experience.phase === 'realm' && activeRealm === 'ptr'
    && (ptrRealm.phase === 'renewing' || ptrRealm.phase === 'renewal-error');
  const backendMutationAuthorityCurrent = farcasterAuthState.phase === 'authenticated'
    && farcasterAuthState.assurance === 'bridge-oidc-alpha'
    && oidcSession !== undefined
    && oidcSession.expiresAt > Date.now()
    && backend.state.identity?.fid === farcasterAuthState.identity.fid;
  const audioScene: AudioScene = experience.phase === 'realm' ? 'realm' : 'menu';
  const menuMounted = experience.phase === 'menu';
  const menuInteractive = menuMounted;
  const miniAppEntryGateActive = menuMounted
    && directMiniAppEntryEnabled
    && (
      miniAppHost.state === 'detecting'
      || miniAppHost.state === 'recovery'
      || miniAppHost.isMiniApp
    );

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
      || activeRealmRef.current === 'ptr'
      || backend.state.phase === 'ready'
      || backend.state.phase === 'reconnecting'
    ) {
      return;
    }
    deactivateCurrentRealm();
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
  }, [backend.state.phase, deactivateCurrentRealm, fadeRealmAudioToMenuAndReset]);

  useEffect(() => {
    if (
      phaseRef.current !== 'realm'
      || activeRealmRef.current !== 'ptr'
      || ptrRealm.phase === 'renewing'
      || ptrRealm.phase === 'renewal-error'
      || (
        ptrRealm.phase === 'ready'
        && ptrRealm.authority !== null
        && ptrRealm.bridge !== null
        && ptrRealm.viewAnchor !== null
      )
    ) {
      return;
    }
    deactivateCurrentRealm();
    clearPendingRealmDestination();
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
  }, [
    clearPendingRealmDestination,
    deactivateCurrentRealm,
    fadeRealmAudioToMenuAndReset,
    ptrRealm.authority,
    ptrRealm.bridge,
    ptrRealm.phase,
    ptrRealm.viewAnchor
  ]);

  const commitPreparedRealmEntry = useCallback((
    realmId: ActiveRealmId,
    routeMode: 'push' | 'replace' = 'push'
  ) => {
    if (phaseRef.current !== 'menu') return;
    clearPendingRealmDestination();
    activeRealmRef.current = realmId;
    setActiveRealm(realmId);
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
      const nextState = realmHistoryState(routeMode === 'replace', realmId);
      if (routeMode === 'replace') {
        window.history.replaceState(nextState, '', `${pageUrlWithoutHash()}${REALM_HASH}`);
      } else {
        window.history.pushState(nextState, '', `${pageUrlWithoutHash()}${REALM_HASH}`);
      }
    }
    setPresentedScreen('realm');
    dispatch({ type: 'request-realm' });
  }, [clearPendingRealmDestination]);

  const commitRealmEntry = useCallback((
    identity: VerifiedFarcasterIdentity,
    routeMode: 'push' | 'replace' = 'push'
  ) => {
    if (!backend.sharedAlphaAvailable) return;
    const verifiedIdentity = verifiedIdentityRef.current;
    if (
      !verifiedIdentity
      || verifiedIdentity.fid !== identity.fid
      || backend.state.phase !== 'ready'
    ) return;
    commitPreparedRealmEntry('genesis-001', routeMode);
  }, [backend, commitPreparedRealmEntry]);

  const beginPtrRealmEntry = useCallback(() => {
    if (
      phaseRef.current !== 'menu'
      || ptrRealm.phase !== 'admitted'
      || ptrRealm.authority === null
    ) return;
    pendingDestinationRef.current = 'ptr';
    setPendingDestination('ptr');
    void ptrRealm.enter();
  }, [ptrRealm]);

  const beginRealmEntry = useCallback((identity: VerifiedFarcasterIdentity) => {
    if (
      !backend.sharedAlphaAvailable
      || phaseRef.current !== 'menu'
    ) {
      return;
    }
    const verifiedIdentity = verifiedIdentityRef.current;
    if (!verifiedIdentity || verifiedIdentity.fid !== identity.fid) return;

    cancelPtrRealmEntry();

    // A submitted Terms dialog creates only an in-memory entry intent. A
    // cancelled acknowledgement may still have committed server-side; repeat
    // entry resumes that exact recorded attempt without resending the reducer.
    // The Realm transition still waits for admission and readiness.
    pendingDestinationRef.current = 'realm';
    setPendingDestination('realm');
    if (
      backend.entryAgreementSatisfied
      && backend.state.phase === 'awaiting-terms'
    ) {
      backend.beginAlphaTermsAcceptance();
    } else if (backend.state.phase === 'denied' || backend.state.phase === 'error') {
      backend.checkAgain();
    }
  }, [backend, cancelPtrRealmEntry]);

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
      pendingDestination !== 'ptr'
      || pendingDestinationRef.current !== 'ptr'
      || ptrRealm.phase !== 'ready'
      || ptrRealm.authority === null
      || ptrRealm.bridge === null
      || ptrRealm.viewAnchor === null
      || phaseRef.current !== 'menu'
    ) return;
    commitPreparedRealmEntry('ptr');
  }, [
    commitPreparedRealmEntry,
    pendingDestination,
    ptrRealm.authority,
    ptrRealm.bridge,
    ptrRealm.phase,
    ptrRealm.viewAnchor
  ]);

  useEffect(() => {
    if (
      !directMiniAppEntryEnabled
      || !miniAppHost.isMiniApp
      || phaseRef.current !== 'menu'
      || farcasterAuthState.phase !== 'authenticated'
      || farcasterAuthState.assurance !== 'bridge-oidc-alpha'
      || oidcSession === undefined
      || oidcSession.expiresAt <= Date.now()
      || backend.state.phase !== 'ready'
      || !backend.entryAgreementSatisfied
      || backend.state.identity?.fid !== farcasterAuthState.identity.fid
      || (
        backend.state.realm?.ownCastle.ownerFid !== farcasterAuthState.identity.fid
        && !(
          backend.state.legacyRealmAuthority === 'retired'
          && backend.state.realmContinuity?.ownCastle.ownerFid
            === farcasterAuthState.identity.fid
        )
      )
      || !verifiedIdentityRef.current
    ) {
      if (notificationRealmEntryTimerRef.current !== null) {
        window.clearTimeout(notificationRealmEntryTimerRef.current);
        notificationRealmEntryTimerRef.current = null;
      }
      return;
    }

    // Quick Auth, admission, current Terms acceptance, and canonical Realm
    // readiness have all been proven by their existing authorities. Replace
    // the launch entry instead of growing host history with a skipped menu.
    if (miniAppHost.context?.notificationId === undefined) {
      commitRealmEntry(verifiedIdentityRef.current, 'replace');
      return;
    }
    if (notificationRealmEntryTimerRef.current !== null) return;
    notificationRealmEntryTimerRef.current = window.setTimeout(() => {
      notificationRealmEntryTimerRef.current = null;
      const currentIdentity = verifiedIdentityRef.current;
      if (!currentIdentity) return;
      commitRealmEntry(currentIdentity, 'replace');
    }, NOTIFICATION_ADMISSION_CONFIRMATION_MS);
    return () => {
      if (notificationRealmEntryTimerRef.current !== null) {
        window.clearTimeout(notificationRealmEntryTimerRef.current);
        notificationRealmEntryTimerRef.current = null;
      }
    };
  }, [
    backend.state.phase,
    commitRealmEntry,
    directMiniAppEntryEnabled,
    farcasterAuthState,
    miniAppHost.isMiniApp,
    miniAppHost.context?.notificationId,
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

  useEffect(() => {
    if (
      pendingDestination !== 'ptr'
      || (
        ptrRealm.phase !== 'unavailable'
        && ptrRealm.phase !== 'unknown'
        && ptrRealm.phase !== 'not-admitted'
        && ptrRealm.phase !== 'error'
      )
    ) return;
    clearPendingRealmDestination();
  }, [clearPendingRealmDestination, pendingDestination, ptrRealm.phase]);

  const returnRealmToMenu = useCallback(() => {
    if (
      phaseRef.current !== 'realm'
      || directRealmReturnCleanupRef.current
    ) {
      return;
    }

    clearPendingRealmDestination();
    deactivateCurrentRealm();
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
  }, [clearPendingRealmDestination, deactivateCurrentRealm]);

  const openOrdinaryMiniAppMenu = useCallback(() => {
    cancelPtrRealmEntry();
    window.history.replaceState(
      menuHistoryState(),
      '',
      `${pageUrlWithoutHash()}${MENU_HASH}`
    );
    setDirectMiniAppEntryEnabled(false);
  }, [cancelPtrRealmEntry]);

  useEffect(() => {
    const synchronizeHistory = () => {
      if (directRealmReturnCleanupRef.current) return;
      if (hasRealmHash()) {
        if (phaseRef.current !== 'realm') gateAnonymousRealmRoute();
        return;
      }
      if (!hasMenuHash()) {
        window.history.replaceState(
          menuHistoryState(),
          '',
          `${pageUrlWithoutHash()}${MENU_HASH}`
        );
        if (phaseRef.current === 'menu') {
          // Back to a retired root/title entry still dismisses transient menu
          // surfaces and checked Terms, as the former title return did.
          cancelPtrRealmEntry();
          cancelFarcasterSignInAndClearDestination();
          setMenuRouteGeneration((current) => current + 1);
        }
      }
      if (phaseRef.current === 'realm') {
        clearPendingRealmDestination();
        deactivateCurrentRealm();
        fadeRealmAudioToMenuAndReset();
        setPresentedScreen('menu');
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
    cancelFarcasterSignInAndClearDestination,
    cancelPtrRealmEntry,
    clearPendingRealmDestination,
    deactivateCurrentRealm,
    fadeRealmAudioToMenuAndReset,
    gateAnonymousRealmRoute
  ]);

  useEffect(() => {
    if (experience.phase !== 'menu') return;
    if (hasRealmHash()) {
      // React may not yet have reduced an authorized entry's request-realm.
      const state = window.history.state as WarpkeepHistoryState | null;
      const pendingRealmId = pendingDestination === 'ptr'
        ? 'ptr'
        : pendingDestination === 'realm' ? 'genesis-001' : null;
      const explicitRealmIntent = state?.[REALM_ID_HISTORY_KEY] !== undefined
        && (
          state[REALM_ID_HISTORY_KEY] === pendingRealmId
          || state[REALM_ID_HISTORY_KEY] === activeRealm
        );
      if (!explicitRealmIntent && state?.[DIRECT_REALM_HISTORY_KEY] !== true) {
        gateAnonymousRealmRoute();
      }
    } else if (!hasMenuHash()) {
      window.history.replaceState(
        menuHistoryState(),
        '',
        `${pageUrlWithoutHash()}${MENU_HASH}`
      );
    }
  }, [activeRealm, experience.phase, gateAnonymousRealmRoute, pendingDestination]);

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
          admissionRequestsSuspended={NEW_ADMISSIONS_SUSPENDED}
          admissionCheck={farcasterAuthState.phase === 'pending-admission'
            ? admissionCheck
            : undefined}
          headingRef={headingRef}
          identity={admissionIdentity}
          onCheckAgain={farcasterAuthState.phase === 'pending-admission'
            ? checkAdmission
            : () => {
                onCheckAgain();
                return true;
              }}
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

  if (
    miniAppHost.isFramed
    && (
      miniAppHost.state === 'regular-web'
      || miniAppHost.state === 'recovery'
    )
  ) {
    return (
      <main className="warpkeep-frame-boundary" role="alert">
        <section
          aria-labelledby="warpkeep-frame-boundary-title"
          className="warpkeep-frame-boundary__panel"
        >
          <p className="warpkeep-frame-boundary__eyebrow">SECURE REALM ENTRY</p>
          <h1 id="warpkeep-frame-boundary-title">OPEN WARPKEEP DIRECTLY</h1>
          <p>
            This embedded page is not a verified Farcaster Mini App. Open the
            Realm directly before signing in or issuing commands.
          </p>
          <a href="https://warpkeep.com/" target="_top">
            OPEN WARPKEEP
          </a>
        </section>
      </main>
    );
  }

  return (
    <div
      className="warpkeep-experience"
      data-phase={experience.phase}
      data-active-realm={activeRealm ?? 'none'}
      data-presented-screen={presentedScreen}
      data-transition-sequence={experience.transitionSequence}
      data-graphics-quality={resolvedGraphicsQuality}
      data-audio-muted={audioMuted ? 'true' : 'false'}
    >
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
              admissionCheck={admissionCheck}
              authState={farcasterAuthState}
              backendState={backend.state}
              hostState={miniAppHost.state}
              recoveryReason={miniAppHost.recoveryReason}
              onAcceptTerms={backend.beginAlphaTermsAcceptance}
              onBackToMenu={openOrdinaryMiniAppMenu}
              onCancelTermsAttempt={backend.cancelAlphaTermsAcceptance}
              onCheckBackend={backend.checkAgain}
              onRefreshSession={checkAdmission}
              onRequestAccess={requestAccess}
              onRetryAccessRequestStatus={retryAccessRequestStatus}
              onRetryAuthentication={beginFarcasterSignIn}
              onRetryHost={miniAppHost.retry}
              onSignOut={handleSignOut}
            />
          ) : (
            <WarpkeepMainMenu
              key={menuRouteGeneration}
              active={menuMounted}
              scene={(animationActive) => (
                <Suspense fallback={null}>
                  <WarpkeepMenuWorld3D
                    key={menuWarpletSelection.sceneKey}
                    active={animationActive && presentedScreen === 'menu'}
                    reducedMotion={reducedMotion}
                    quality={resolvedGraphicsQuality}
                    guardianUrl={menuWarpletSelection.kind === 'unassigned'
                      ? null
                      : menuWarpletSelection.guardianUrl}
                  />
                </Suspense>
              )}
              authState={farcasterAuthState}
              visible={presentedScreen === 'menu'}
              interactive={menuInteractive}
              inputModality="unknown"
              focusFirstCommand={false}
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
              ptrRealmAuthority={ptrRealm.presentationAuthority ?? undefined}
              ptrRealmBusy={ptrRealm.phase === 'checking' || ptrRealm.phase === 'connecting'}
              onCheckRealmAccess={() => {
                void ptrRealm.checkAccess();
              }}
              onCancelPtrRealm={cancelPtrRealmEntry}
              onRequestPtrRealm={beginPtrRealmEntry}
              onRequestAuthRailCheck={backend.checkAgain}
              onRequestFarcasterSignIn={beginFarcasterSignIn}
              onRestoreFarcasterSession={restoreFarcasterSession}
              onPrepareFarcasterQrCode={prepareFarcasterQrCode}
              onRefreshFarcasterSession={refreshFarcasterSession}
              admissionCheck={admissionCheck}
              onCheckFarcasterAdmission={checkAdmission}
              accessRequest={accessRequest}
              onRequestAccess={requestAccess}
              onRetryAccessRequestStatus={retryAccessRequestStatus}
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

      {ptrContinuationVisible ? (
        <div
          className="warpkeep-experience__screen warpkeep-experience__screen--realm"
          data-presented="true"
        >
          <MiniAppMenuBackBinding active onBack={returnRealmToMenu} />
          <PtrSessionRenewalPanel failed={ptrRealm.phase === 'renewal-error'}
            onRetry={() => void ptrRealm.renewSession()} onReturn={returnRealmToMenu} />
        </div>
      ) : null}

      {realmMounted ? (
        <div
          className="warpkeep-experience__screen warpkeep-experience__screen--realm"
          data-presented={presentedScreen === 'realm' ? 'true' : 'false'}
          aria-hidden={experience.phase !== 'realm'}
          inert={experience.phase !== 'realm' ? true : undefined}
        >
          <Suspense fallback={<SceneModuleFallback label={
            activeRealm === 'ptr' ? 'OPENING PTR' : 'OPENING GENESIS 001'
          } />}>
            {activeRealm === 'ptr'
            && ptrRealm.authority !== null
            && ptrRealm.bridge !== null
            && ptrRealm.viewAnchor !== null ? (
              <RealmMapScreen
                identity={realmIdentity}
                ptrRealmAuthority={ptrRealm.authority}
                ptrViewAnchor={ptrRealm.viewAnchor}
                ptrGameplay04={ptrRealm.gameplay04 ?? undefined}
                ptrInitialSurface={ptrSurfaceRef.current}
                onPtrSurfaceChange={rememberPtrSurface}
                onPtrCommandStateChange={rememberPtrCommandState}
                ptrContinuationNotice={ptrContinuationNotice}
                onDismissPtrContinuationNotice={dismissPtrContinuationNotice}
                greaterRealm={ptrRealm.bridge}
                graphicsPreference={graphicsPreference}
                resolvedGraphicsQuality={resolvedGraphicsQuality}
                audioMuted={audioMuted}
                onGraphicsPreferenceChange={updateGraphicsPreference}
                onAudioMutedChange={updateAudioMuted}
                onRequestReturn={returnRealmToMenu}
                qualityOverride={realmProfileForQuality(resolvedGraphicsQuality)}
              />
            ) : backend.state.realm || backend.state.legacyRealmAuthority === 'retired' ? (
              <RealmMapScreen
                identity={realmIdentity}
                snapshot={backend.state.realm}
                realmContinuity={backend.state.realmContinuity}
                greaterRealm={backend.greaterRealm}
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
                innerKeep={backend.state.innerKeep}
                onStartInnerKeepProject={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.state.innerKeep?.phase === 'ready'
                  && backend.state.innerKeep.commandsEnabled
                    ? backend.startInnerKeepProject
                    : undefined}
                onRequestInnerKeepSync={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.state.innerKeep !== undefined
                    ? backend.retryInnerKeepSync
                    : undefined}
                workerPrivateSync={backend.workerPrivateSync}
                onRetryWorkerPrivateSync={backend.retryWorkerPrivateSync}
                onDispatchWorker={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.state.legacyRealmAuthority !== 'retired'
                  && backend.workerPrivateSync.phase === 'ready'
                  && backend.workerPrivateSync.commandsEnabled
                  && backend.state.workerProjection?.mode === 'active'
                  ? backend.dispatchWorker
                  : undefined}
                onRecallWorker={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.state.legacyRealmAuthority !== 'retired'
                  && backend.state.workerProjection?.mode === 'active'
                  ? backend.recallWorker
                  : undefined}
                onRecallAllWorkers={
                  backend.state.phase === 'ready'
                  && backend.state.admission === 'ready'
                  && backendMutationAuthorityCurrent
                  && backend.state.legacyRealmAuthority !== 'retired'
                  && backend.state.workerProjection?.mode === 'active'
                  ? backend.recallAllWorkers
                  : undefined}
                onReturnLegacyExpedition={
                  backendMutationAuthorityCurrent
                  && backend.state.legacyRealmAuthority !== 'retired'
                    ? backend.returnLegacyExpedition
                    : undefined
                }
                realmChat={backend.realmChat}
                onSendRealmChatMessage={backend.sendRealmChatMessage}
                onReportRealmChatMessage={backend.reportRealmChatMessage}
                onLoadEarlierRealmChat={backend.loadEarlierRealmChat}
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

      <WarpkeepAudioDirector
        deferUntilGesture
        muted={audioMuted}
        ref={audioDirectorRef}
        scene={audioScene}
        preloadMenu={false}
        resumeFadeMs={520}
        suspended={miniAppEntryGateActive}
      />
      <WarpkeepSfxDirector muted={audioMuted} />
      <WarpkeepHapticsDirector muted={audioMuted} />
    </div>
  );
}
