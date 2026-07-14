import {
  Suspense,
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref
} from 'react';

import type {
  FarcasterAuthViewState,
  VerifiedFarcasterIdentity
} from '../../farcaster/farcasterAuthTypes';
import { AlphaParticipationTermsDialog } from './AlphaParticipationTermsDialog';
import { CreditsRoll } from './CreditsRoll';
import { MenuDevelopmentNotice } from './MenuDevelopmentNotice';
import { SettingsPanel } from './SettingsPanel';
import { WarpkeepBuildStamp } from './WarpkeepBuildStamp';
import { menuCommands, type MenuCommand, type MenuCommandId } from './menuCommands';
import {
  DEFAULT_WARPKEEP_REPOSITORY_URL,
  type WarpkeepBuildInfo
} from '../../build/buildInfo';
import type {
  GraphicsPreference,
  GraphicsQualityTier
} from '../../settings/graphicsPreference';
import './WarpkeepMainMenu.css';

export type MenuInputModality = 'keyboard' | 'pointer' | 'touch' | 'unknown';

export type AuthRailRenderControls = Readonly<{
  headingRef: Ref<HTMLHeadingElement>;
  primaryActionRef: Ref<HTMLButtonElement>;
  onCheckAgain: () => void;
  onBackToMenu: () => void;
  onPresentationReady: () => void;
}>;

export type WarpkeepMainMenuProps = {
  active: boolean;
  visible?: boolean;
  interactive?: boolean;
  onRequestReturn: () => void;
  /** When supplied, ENTER REALM opens the live realm foundation instead of its legacy notice. */
  onRequestEnterRealm?: () => void;
  /** Blocks SIWF when the public shared-alpha configuration is intentionally inactive. */
  backendUnavailableMessage?: string;
  authState?: FarcasterAuthViewState;
  onRequestFarcasterSignIn?: () => void;
  onCancelFarcasterSignIn?: () => void;
  /** Lifecycle-only cancellation; unlike a player cancellation it preserves a route intent. */
  onDisposeFarcasterSignIn?: () => void;
  onRetryFarcasterSignIn?: () => void;
  onPrepareFarcasterQrCode?: () => void;
  onRefreshFarcasterSession?: () => void;
  onSignOut?: () => void;
  rememberDevice?: boolean;
  onRememberDeviceChange?: (remember: boolean) => void;
  onRequestAuthenticatedRealm?: (identity: VerifiedFarcasterIdentity) => void;
  /** Fired only after the player checks and submits the Alpha Terms dialog. */
  onAcceptAlphaTermsAttempt?: () => void;
  /** Renders an admission rail whose retry is owned by the Terms gate. */
  renderAuthRailContent?: (controls: AuthRailRenderControls) => ReactNode;
  onRequestAuthRailCheck?: () => void;
  authRailAttemptFailed?: boolean;
  /** @deprecated Route state must never bypass intentional Terms acceptance. */
  openFarcasterAuthPanel?: boolean;
  inputModality?: MenuInputModality;
  focusFirstCommand?: boolean;
  buildInfo?: WarpkeepBuildInfo;
  onVideoReady?: () => void;
  onVideoError?: () => void;
  noticeDurationMs?: number;
  graphicsPreference?: GraphicsPreference;
  resolvedGraphicsQuality?: GraphicsQualityTier;
  onGraphicsPreferenceChange?: (preference: GraphicsPreference) => void;
};

type ActiveNotice = {
  command: MenuCommand;
  notice?: string;
  anchorElement: HTMLButtonElement;
  refreshKey: number;
};

type MenuSurface = 'commands' | 'farcaster-auth' | 'settings' | 'credits';

type TermsContinuation =
  | 'begin-sign-in'
  | 'retry-sign-in'
  | 'refresh-session'
  | 'check-auth-rail'
  | 'enter-authenticated'
  | 'show-pending'
  | 'legacy-enter';

type TermsRequest = {
  continuation: TermsContinuation;
  keyboardDriven: boolean;
};

const ANONYMOUS_AUTH_STATE: FarcasterAuthViewState = Object.freeze({
  phase: 'anonymous'
});

const FarcasterIdentityBadge = lazy(async () => {
  const module = await import('../auth/FarcasterIdentityBadge');
  return { default: module.FarcasterIdentityBadge };
});

const FarcasterQrAuthPanel = lazy(async () => {
  const module = await import('../auth/FarcasterQrAuthPanel');
  return { default: module.FarcasterQrAuthPanel };
});

function FarcasterAuthPanelFallback({
  headingRef,
  primaryActionRef,
  onCancel
}: {
  headingRef: Ref<HTMLHeadingElement>;
  primaryActionRef: Ref<HTMLButtonElement>;
  onCancel: () => void;
}) {
  return (
    <section
      aria-busy="true"
      aria-label="Farcaster sign-in"
      className="farcaster-auth-panel farcaster-auth-panel--creating-channel"
      data-phase="creating-channel"
    >
      <div aria-hidden="true" className="farcaster-auth-panel__ornament">
        <span />
        <i />
        <span />
      </div>
      <header className="farcaster-auth-panel__header">
        <p className="farcaster-auth-panel__eyebrow">FARCASTER SIGN-IN</p>
        <h2 ref={headingRef} tabIndex={-1}>CLAIM YOUR KEEP</h2>
      </header>
      <p aria-live="polite" className="farcaster-auth-panel__live-region" role="status">
        Preparing sign-in
      </p>
      <div className="farcaster-auth-panel__actions farcaster-auth-panel__actions--quiet">
        <button
          className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
          onClick={onCancel}
          ref={primaryActionRef}
          type="button"
        >
          CANCEL
        </button>
      </div>
    </section>
  );
}

export function resolveMenuAssetUrl(baseUrl: string, assetPath: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}

export const WARPKEEP_MENU_VIDEO_URL = resolveMenuAssetUrl(
  import.meta.env.BASE_URL,
  'video/warpkeep-menu-loop-v2.mp4'
);

export const WARPKEEP_MENU_POSTER_URL = resolveMenuAssetUrl(
  import.meta.env.BASE_URL,
  'images/menu/warpkeep-menu-poster-v2.webp'
);

function readReducedMotionPreference() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(readReducedMotionPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(preference.matches);
    preference.addEventListener?.('change', handleChange);

    return () => preference.removeEventListener?.('change', handleChange);
  }, []);

  return reducedMotion;
}

function safelyPauseVideo(video: HTMLVideoElement) {
  try {
    video.pause();
  } catch {
    // Media support is optional; the poster keeps the menu usable.
  }
}

export function WarpkeepMainMenu({
  active,
  visible = active,
  interactive: interactiveOverride,
  onRequestReturn,
  onRequestEnterRealm,
  backendUnavailableMessage,
  authState = ANONYMOUS_AUTH_STATE,
  onRequestFarcasterSignIn,
  onCancelFarcasterSignIn,
  onDisposeFarcasterSignIn,
  onRetryFarcasterSignIn,
  onPrepareFarcasterQrCode,
  onRefreshFarcasterSession,
  onSignOut,
  rememberDevice = false,
  onRememberDeviceChange,
  onRequestAuthenticatedRealm,
  onAcceptAlphaTermsAttempt,
  renderAuthRailContent,
  onRequestAuthRailCheck,
  authRailAttemptFailed = false,
  inputModality = 'unknown',
  focusFirstCommand,
  buildInfo,
  onVideoReady,
  onVideoError,
  noticeDurationMs = 5600,
  graphicsPreference = 'auto',
  resolvedGraphicsQuality = 'balanced',
  onGraphicsPreferenceChange
}: WarpkeepMainMenuProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const commandRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const authHeadingRef = useRef<HTMLHeadingElement>(null);
  const authPrimaryActionRef = useRef<HTMLButtonElement>(null);
  const surfaceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const termsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const noticeSequenceRef = useRef(0);
  const didFocusOnRevealRef = useRef(false);
  const playbackBlockedRef = useRef(false);
  const didReportVideoReadyRef = useRef(false);
  const didReportVideoErrorRef = useRef(false);
  const authWasKeyboardDrivenRef = useRef(false);
  const authAttemptStartedRef = useRef(false);
  const acceptedEntryAttemptRef = useRef(false);
  const previousAuthPhaseRef = useRef(authState.phase);
  const lastActionModalityRef = useRef<MenuInputModality>(inputModality);
  const [videoState, setVideoState] = useState<'waiting' | 'ready' | 'error'>('waiting');
  const [activeNotice, setActiveNotice] = useState<ActiveNotice | null>(null);
  const [surface, setSurface] = useState<MenuSurface>('commands');
  const [termsRequest, setTermsRequest] = useState<TermsRequest | null>(null);
  const reducedMotion = useReducedMotionPreference();
  const interactive = interactiveOverride ?? (active && visible);
  const shouldFocusFirstCommand = focusFirstCommand ?? inputModality === 'keyboard';
  const authPanelOpen = surface === 'farcaster-auth';
  const termsOpen = termsRequest !== null;
  const modalSurfaceOpen = termsOpen || surface === 'settings' || surface === 'credits';
  const authenticatedIdentity = authState.phase === 'authenticated'
    ? authState.identity
    : undefined;
  const pendingIdentity = authState.phase === 'pending-admission'
    ? authState.identity
    : undefined;
  const sessionIdentity = authenticatedIdentity ?? pendingIdentity;
  const authenticatedAssurance = authState.phase === 'authenticated'
    ? authState.assurance
    : undefined;
  const farcasterAuthEnabled = !backendUnavailableMessage && Boolean(
    onRequestFarcasterSignIn
    && onCancelFarcasterSignIn
    && onRetryFarcasterSignIn
    && onSignOut
    && onRequestAuthenticatedRealm
  );

  const attemptVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || !active || reducedMotion || document.hidden) {
      return;
    }

    try {
      const playResult = video.play();
      if (playResult && typeof playResult.catch === 'function') {
        void playResult
          .then(() => {
            playbackBlockedRef.current = false;
          })
          .catch(() => {
            playbackBlockedRef.current = true;
          });
      }
    } catch {
      playbackBlockedRef.current = true;
    }
  }, [active, reducedMotion]);

  useEffect(() => {
    const mountedVideo = videoRef.current;
    const reconcilePlayback = () => {
      const video = mountedVideo;
      if (!video) {
        return;
      }

      if (active && !reducedMotion && !document.hidden) {
        attemptVideoPlayback();
      } else {
        safelyPauseVideo(video);
      }
    };

    const retryBlockedPlayback = () => {
      if (playbackBlockedRef.current) {
        attemptVideoPlayback();
      }
    };

    reconcilePlayback();
    document.addEventListener('visibilitychange', reconcilePlayback);
    document.addEventListener('pointerdown', retryBlockedPlayback, true);
    document.addEventListener('keydown', retryBlockedPlayback, true);

    return () => {
      document.removeEventListener('visibilitychange', reconcilePlayback);
      document.removeEventListener('pointerdown', retryBlockedPlayback, true);
      document.removeEventListener('keydown', retryBlockedPlayback, true);
      if (mountedVideo) {
        safelyPauseVideo(mountedVideo);
      }
    };
  }, [active, attemptVideoPlayback, reducedMotion]);

  useEffect(() => {
    if (!interactive) {
      setActiveNotice(null);
      setSurface('commands');
      setTermsRequest(null);
      termsTriggerRef.current = null;
      acceptedEntryAttemptRef.current = false;
      didFocusOnRevealRef.current = false;
      return;
    }

    if (shouldFocusFirstCommand && !didFocusOnRevealRef.current) {
      didFocusOnRevealRef.current = true;
      commandRefs.current[0]?.focus({ preventScroll: true });
    }
  }, [interactive, shouldFocusFirstCommand]);

  useEffect(() => {
    const previousPhase = previousAuthPhaseRef.current;
    previousAuthPhaseRef.current = authState.phase;
    if (
      authState.phase === 'error'
      || authState.phase === 'expired'
      || (previousPhase !== 'anonymous' && authState.phase === 'anonymous')
    ) {
      acceptedEntryAttemptRef.current = false;
    }
    if (
      authState.phase === 'anonymous'
      || authState.phase === 'authenticated'
      || authState.phase === 'pending-admission'
    ) {
      authAttemptStartedRef.current = false;
    }
    if (
      previousPhase !== 'anonymous'
      && authState.phase === 'anonymous'
    ) {
      setSurface('commands');
    }
  }, [authState.phase]);

  useEffect(() => {
    if (authRailAttemptFailed) {
      acceptedEntryAttemptRef.current = false;
    }
  }, [authRailAttemptFailed]);

  const restoreFirstCommandFocus = useCallback(() => {
    const frame = window.requestAnimationFrame(() => {
      commandRefs.current[0]?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const restoreSurfaceTriggerFocus = useCallback(() => {
    const trigger = surfaceTriggerRef.current;
    surfaceTriggerRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      trigger?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const restoreTermsTriggerFocus = useCallback(() => {
    const trigger = termsTriggerRef.current;
    termsTriggerRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      trigger?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const openSettings = useCallback((anchorElement: HTMLButtonElement) => {
    surfaceTriggerRef.current = anchorElement;
    setActiveNotice(null);
    setSurface('settings');
  }, []);

  const closeSettings = useCallback(() => {
    setSurface('commands');
    restoreSurfaceTriggerFocus();
  }, [restoreSurfaceTriggerFocus]);

  const openCredits = useCallback((anchorElement: HTMLButtonElement) => {
    surfaceTriggerRef.current = anchorElement;
    setActiveNotice(null);
    setSurface('credits');
  }, []);

  const closeCredits = useCallback(() => {
    setSurface('commands');
    restoreSurfaceTriggerFocus();
  }, [restoreSurfaceTriggerFocus]);

  const closeAuthPanel = useCallback((restoreKeyboardFocus = false) => {
    acceptedEntryAttemptRef.current = false;
    authAttemptStartedRef.current = false;
    // Player-driven dismissal must also clear an authenticated admission
    // attempt owned by the parent. The auth provider safely ignores cancel
    // outside an active SIWF flow, while the parent drops its deferred realm
    // destination so a late ready result cannot enter after Escape/Back.
    onCancelFarcasterSignIn?.();
    setSurface('commands');
    if (restoreKeyboardFocus) {
      restoreFirstCommandFocus();
    }
  }, [onCancelFarcasterSignIn, restoreFirstCommandFocus]);

  const closeTerms = useCallback(() => {
    acceptedEntryAttemptRef.current = false;
    setTermsRequest(null);
    restoreTermsTriggerFocus();
  }, [restoreTermsTriggerFocus]);

  const handleRequestReturn = useCallback(() => {
    acceptedEntryAttemptRef.current = false;
    if (authAttemptStartedRef.current) {
      authAttemptStartedRef.current = false;
      onCancelFarcasterSignIn?.();
    }
    setSurface('commands');
    onRequestReturn();
  }, [onCancelFarcasterSignIn, onRequestReturn]);

  useEffect(() => {
    if (!interactive || !authPanelOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      authHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authPanelOpen, interactive]);

  const handleAuthPanelPresentationReady = useCallback(() => {
    if (!interactive || !authPanelOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      authHeadingRef.current?.focus({ preventScroll: true });
    });
  }, [authPanelOpen, interactive]);

  useEffect(() => {
    if (
      !interactive
      || !authPanelOpen
      || !authWasKeyboardDrivenRef.current
      || (
        authState.phase !== 'authenticated'
        && authState.phase !== 'pending-admission'
        && authState.phase !== 'expired'
        && authState.phase !== 'error'
      )
    ) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      authPrimaryActionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authPanelOpen, authState.phase, interactive]);

  useEffect(() => () => {
    if (!authAttemptStartedRef.current) {
      return;
    }
    authAttemptStartedRef.current = false;
    (onDisposeFarcasterSignIn ?? onCancelFarcasterSignIn)?.();
  }, [onCancelFarcasterSignIn, onDisposeFarcasterSignIn]);

  useEffect(() => {
    if (!interactive) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      // Mounted modal surfaces own their complete keyboard boundary, including
      // Escape. Let their capture listener close exactly once and restore the
      // command that opened them through the corresponding close callback.
      if (termsOpen || surface === 'settings' || surface === 'credits') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      lastActionModalityRef.current = 'keyboard';
      if (activeNotice) {
        setActiveNotice(null);
      } else if (authPanelOpen) {
        closeAuthPanel(true);
      } else {
        handleRequestReturn();
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [activeNotice, authPanelOpen, closeAuthPanel, handleRequestReturn, interactive, surface, termsOpen]);

  const handleVideoReady = useCallback(() => {
    setVideoState('ready');
    if (!didReportVideoReadyRef.current) {
      didReportVideoReadyRef.current = true;
      onVideoReady?.();
    }
  }, [onVideoReady]);

  const handleVideoError = useCallback(() => {
    setVideoState('error');
    safelyPauseVideo(videoRef.current as HTMLVideoElement);
    if (!didReportVideoErrorRef.current) {
      didReportVideoErrorRef.current = true;
      onVideoError?.();
    }
  }, [onVideoError]);

  const openNotice = useCallback((
    command: MenuCommand,
    anchorElement: HTMLButtonElement,
    notice?: string
  ) => {
    noticeSequenceRef.current += 1;
    setActiveNotice({
      command,
      ...(notice ? { notice } : {}),
      anchorElement,
      refreshKey: noticeSequenceRef.current
    });
  }, []);

  const openAuthPanel = useCallback((keyboardDriven: boolean) => {
    authWasKeyboardDrivenRef.current = keyboardDriven;
    setActiveNotice(null);
    setSurface('farcaster-auth');
  }, []);

  const openTerms = useCallback((
    continuation: TermsContinuation,
    anchorElement: HTMLButtonElement | null,
    keyboardDriven: boolean
  ) => {
    termsTriggerRef.current = anchorElement;
    setActiveNotice(null);
    setTermsRequest({ continuation, keyboardDriven });
  }, []);

  const handleCommandClick = useCallback((
    command: MenuCommand,
    anchorElement: HTMLButtonElement,
    keyboardDriven: boolean
  ) => {
    if (command.id === 'settings') {
      openSettings(anchorElement);
      return;
    }

    if (command.id === 'credits') {
      openCredits(anchorElement);
      return;
    }

    if (command.id === 'enter-realm' && backendUnavailableMessage) {
      openNotice(command, anchorElement, backendUnavailableMessage);
      return;
    }

    if (command.id === 'enter-realm' && farcasterAuthEnabled) {
      if (authenticatedIdentity) {
        openTerms('enter-authenticated', anchorElement, keyboardDriven);
      } else if (pendingIdentity) {
        openTerms('show-pending', anchorElement, keyboardDriven);
      } else {
        openTerms('begin-sign-in', anchorElement, keyboardDriven);
      }
      return;
    }

    if (command.id === 'enter-realm' && onRequestEnterRealm) {
      openTerms('legacy-enter', anchorElement, keyboardDriven);
      return;
    }
    openNotice(command, anchorElement);
  }, [
    authenticatedIdentity,
    pendingIdentity,
    backendUnavailableMessage,
    farcasterAuthEnabled,
    onRequestEnterRealm,
    openCredits,
    openSettings,
    openNotice,
    openTerms
  ]);

  const handleRetrySignIn = useCallback(() => {
    const keyboardDriven = lastActionModalityRef.current === 'keyboard';
    openTerms('retry-sign-in', authPrimaryActionRef.current, keyboardDriven);
  }, [openTerms]);

  const handleTermsContinue = useCallback(() => {
    const request = termsRequest;
    if (!request) {
      return;
    }

    termsTriggerRef.current = null;
    setTermsRequest(null);
    authWasKeyboardDrivenRef.current = request.keyboardDriven;
    acceptedEntryAttemptRef.current = true;

    if (request.continuation === 'legacy-enter') {
      acceptedEntryAttemptRef.current = false;
      onRequestEnterRealm?.();
      return;
    }

    onAcceptAlphaTermsAttempt?.();

    openAuthPanel(request.keyboardDriven);
    if (request.continuation === 'begin-sign-in') {
      authAttemptStartedRef.current = true;
      onRequestFarcasterSignIn?.();
    } else if (request.continuation === 'retry-sign-in') {
      authAttemptStartedRef.current = true;
      onRetryFarcasterSignIn?.();
      window.requestAnimationFrame(() => {
        authHeadingRef.current?.focus({ preventScroll: true });
      });
    } else if (request.continuation === 'refresh-session') {
      acceptedEntryAttemptRef.current = false;
      onRefreshFarcasterSession?.();
    } else if (request.continuation === 'check-auth-rail') {
      acceptedEntryAttemptRef.current = false;
      onRequestAuthRailCheck?.();
    } else if (request.continuation === 'enter-authenticated' && authenticatedIdentity) {
      acceptedEntryAttemptRef.current = false;
      onRequestAuthenticatedRealm?.(authenticatedIdentity);
    }
  }, [
    authenticatedIdentity,
    onAcceptAlphaTermsAttempt,
    onRequestAuthenticatedRealm,
    onRequestEnterRealm,
    onRequestFarcasterSignIn,
    onRefreshFarcasterSession,
    onRequestAuthRailCheck,
    onRetryFarcasterSignIn,
    openAuthPanel,
    termsRequest
  ]);

  const handleBackToCommands = useCallback(() => {
    closeAuthPanel(lastActionModalityRef.current === 'keyboard');
  }, [closeAuthPanel]);

  const handleSignOut = useCallback(() => {
    const restoreKeyboardFocus = lastActionModalityRef.current === 'keyboard';
    authAttemptStartedRef.current = false;
    acceptedEntryAttemptRef.current = false;
    onSignOut?.();
    setSurface('commands');
    if (restoreKeyboardFocus) {
      restoreFirstCommandFocus();
    }
  }, [onSignOut, restoreFirstCommandFocus]);

  const handleAuthenticatedRealmEntry = useCallback((identity: VerifiedFarcasterIdentity) => {
    if (!acceptedEntryAttemptRef.current) {
      openTerms(
        'enter-authenticated',
        authPrimaryActionRef.current,
        lastActionModalityRef.current === 'keyboard'
      );
      return;
    }
    acceptedEntryAttemptRef.current = false;
    setSurface('commands');
    onRequestAuthenticatedRealm?.(identity);
  }, [onRequestAuthenticatedRealm, openTerms]);

  const handleRefreshFarcasterSession = useCallback(() => {
    if (acceptedEntryAttemptRef.current) {
      acceptedEntryAttemptRef.current = false;
      onRefreshFarcasterSession?.();
      return;
    }
    openTerms(
      'refresh-session',
      authPrimaryActionRef.current,
      lastActionModalityRef.current === 'keyboard'
    );
  }, [onRefreshFarcasterSession, openTerms]);

  const handleAuthRailCheck = useCallback(() => {
    if (acceptedEntryAttemptRef.current) {
      acceptedEntryAttemptRef.current = false;
      onRequestAuthRailCheck?.();
      return;
    }
    openTerms(
      'check-auth-rail',
      authPrimaryActionRef.current,
      lastActionModalityRef.current === 'keyboard'
    );
  }, [onRequestAuthRailCheck, openTerms]);

  const handleNavigationKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!interactive) {
      return;
    }

    const currentIndex = commandRefs.current.findIndex((button) => button === event.target);
    if (currentIndex < 0) {
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % menuCommands.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + menuCommands.length) % menuCommands.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = menuCommands.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    commandRefs.current[nextIndex]?.focus({ preventScroll: true });
  }, [interactive]);

  const describedNoticeId = useMemo(
    () => activeNotice ? `warpkeep-menu-notice-${activeNotice.command.id}` : undefined,
    [activeNotice]
  );

  const rootClassName = [
    'warpkeep-menu',
    visible ? 'warpkeep-menu--visible' : '',
    videoState === 'ready' ? 'warpkeep-menu--video-ready' : '',
    videoState === 'error' ? 'warpkeep-menu--video-error' : '',
    reducedMotion ? 'warpkeep-menu--reduced-motion' : ''
  ].filter(Boolean).join(' ');

  return (
    <>
      <main
      aria-hidden={!interactive || modalSurfaceOpen}
      aria-labelledby="warpkeep-menu-title"
      className={rootClassName}
      data-active={active ? 'true' : 'false'}
      data-menu-surface={surface}
      data-media-state={reducedMotion ? 'static' : videoState}
      data-visible={visible ? 'true' : 'false'}
      inert={!interactive || modalSurfaceOpen ? true : undefined}
      onKeyDownCapture={() => {
        lastActionModalityRef.current = 'keyboard';
      }}
      onPointerDownCapture={(event) => {
        lastActionModalityRef.current = event.pointerType === 'touch' ? 'touch' : 'pointer';
      }}
    >
      <div
        aria-hidden="true"
        className="warpkeep-menu-poster-fallback"
        style={{ backgroundImage: `url(${WARPKEEP_MENU_POSTER_URL})` }}
      />
      <video
        aria-hidden="true"
        autoPlay={!reducedMotion}
        className="warpkeep-menu-background"
        loop
        muted
        onCanPlay={handleVideoReady}
        onError={handleVideoError}
        onLoadedData={handleVideoReady}
        playsInline
        poster={WARPKEEP_MENU_POSTER_URL}
        preload={reducedMotion ? 'none' : 'auto'}
        ref={videoRef}
        src={WARPKEEP_MENU_VIDEO_URL}
        tabIndex={-1}
      />
      <div aria-hidden="true" className="warpkeep-menu-color-grade" />
      <div aria-hidden="true" className="warpkeep-menu-vignette" />

      <header className="warpkeep-menu-heading">
        <div aria-hidden="true" className="warpkeep-menu-heading__crest">
          <span />
          <i />
          <span />
        </div>
        <h1 className="warpkeep-menu-title" id="warpkeep-menu-title">WARPKEEP</h1>
        <div aria-hidden="true" className="warpkeep-menu-heading__rule">
          <span />
          <i />
          <span />
        </div>
        <p className="warpkeep-menu-tagline">
          BUILD YOUR LEGACY. DEFEND THE REALM. DEFY THE CORE.
        </p>
      </header>

      {!authPanelOpen ? (
        <>
          {sessionIdentity ? (
            <div className="warpkeep-menu-identity">
              <Suspense fallback={null}>
                <FarcasterIdentityBadge
                  compact
                  identity={sessionIdentity}
                  onActivate={farcasterAuthEnabled
                    ? () => openAuthPanel(lastActionModalityRef.current === 'keyboard')
                    : undefined}
                />
              </Suspense>
              <span className="warpkeep-menu-identity__assurance">
                {pendingIdentity ? 'ADMISSION PENDING' : 'FARCASTER VERIFIED'}
              </span>
            </div>
          ) : null}

          <nav
            aria-label="Hegemony main menu"
            className="warpkeep-menu-nav"
            onKeyDown={handleNavigationKeyDown}
          >
            <ol className="warpkeep-menu-command-list">
              {menuCommands.map((command, commandIndex) => (
                <li className="warpkeep-menu-command-item" key={command.id}>
                  <button
                    aria-describedby={activeNotice?.command.id === command.id ? describedNoticeId : undefined}
                    className="warpkeep-menu-command"
                    data-command={command.id}
                    data-prominent={commandIndex === 0 ? 'true' : undefined}
                    disabled={!interactive}
                    onClick={(event) => handleCommandClick(
                      command,
                      event.currentTarget,
                      event.detail === 0
                    )}
                    ref={(button) => {
                      commandRefs.current[commandIndex] = button;
                    }}
                    tabIndex={interactive ? 0 : -1}
                    type="button"
                  >
                    <span>{command.label}</span>
                  </button>
                </li>
              ))}
            </ol>
            <section
              aria-labelledby="warpkeep-menu-project-heading"
              className="warpkeep-menu-project"
            >
              <h2
                className="warpkeep-menu-project__heading"
                id="warpkeep-menu-project-heading"
              >
                PROJECT
              </h2>
              <a
                aria-label="Open Warpkeep repository on GitHub (opens in a new tab)"
                className="warpkeep-menu-project__link"
                href={DEFAULT_WARPKEEP_REPOSITORY_URL}
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                tabIndex={interactive ? 0 : -1}
                target="_blank"
              >
                <span>WARPKEEP ON GITHUB</span>
                <span aria-hidden="true" className="warpkeep-menu-project__external-mark">↗</span>
              </a>
            </section>
          </nav>
          <WarpkeepBuildStamp buildInfo={buildInfo} />
        </>
      ) : (
        <div className="warpkeep-menu-auth-rail">
          <Suspense fallback={
            <FarcasterAuthPanelFallback
              headingRef={authHeadingRef}
              onCancel={() => closeAuthPanel(
                lastActionModalityRef.current === 'keyboard'
              )}
              primaryActionRef={authPrimaryActionRef}
            />
          }>
            {renderAuthRailContent?.({
              headingRef: authHeadingRef,
              primaryActionRef: authPrimaryActionRef,
              onCheckAgain: handleAuthRailCheck,
              onBackToMenu: handleBackToCommands,
              onPresentationReady: handleAuthPanelPresentationReady
            }) ?? (
              <FarcasterQrAuthPanel
                channelUrl={authState.phase === 'awaiting-approval'
                  ? authState.channelUrl
                  : undefined}
                assurance={authenticatedAssurance}
                errorMessage={authState.phase === 'error' || authState.phase === 'expired'
                  ? authState.error.message
                  : undefined}
                headingRef={authHeadingRef}
                identity={sessionIdentity}
                onPresentationReady={handleAuthPanelPresentationReady}
                onBackToMenu={handleBackToCommands}
                onCancel={() => closeAuthPanel(
                  lastActionModalityRef.current === 'keyboard'
                )}
                onEnterRealm={handleAuthenticatedRealmEntry}
                onPrepareQrCode={onPrepareFarcasterQrCode}
                onCheckAdmission={handleRefreshFarcasterSession}
                onRememberDeviceChange={onRememberDeviceChange}
                onRetry={handleRetrySignIn}
                onSignOut={handleSignOut}
                phase={authState.phase === 'anonymous'
                  ? 'creating-channel'
                  : authState.phase}
                primaryActionRef={authPrimaryActionRef}
                qr={authState.phase === 'awaiting-approval'
                  ? authState.qr
                  : undefined}
                rememberDevice={rememberDevice}
              />
            )}
          </Suspense>
        </div>
      )}

      <button
        aria-label="Return to Title"
        className="warpkeep-menu-back"
        disabled={!interactive}
        onClick={handleRequestReturn}
        tabIndex={interactive ? 0 : -1}
        type="button"
      >
        <span aria-hidden="true" className="warpkeep-menu-back__arrow">←</span>
        <span className="warpkeep-menu-back__label">Return to Title</span>
      </button>

      <p aria-live="polite" className="warpkeep-menu-live-region">
        {interactive && !authPanelOpen ? 'Main menu' : ''}
      </p>

      {activeNotice ? (
        <MenuDevelopmentNotice
          anchorElement={activeNotice.anchorElement}
          command={activeNotice.command}
          durationMs={noticeDurationMs}
          key={`${activeNotice.command.id}-${activeNotice.refreshKey}`}
          notice={activeNotice.notice}
          onDismiss={() => setActiveNotice(null)}
          refreshKey={activeNotice.refreshKey}
        />
      ) : null}
      </main>
      {surface === 'settings' && interactive ? (
        <SettingsPanel
          onChange={(preference) => onGraphicsPreferenceChange?.(preference)}
          onClose={closeSettings}
          preference={graphicsPreference}
          resolvedQuality={resolvedGraphicsQuality}
        />
      ) : null}
      {surface === 'credits' && interactive ? (
        <CreditsRoll onClose={closeCredits} />
      ) : null}
      {termsOpen && interactive ? (
        <AlphaParticipationTermsDialog
          onCancel={closeTerms}
          onContinue={handleTermsContinue}
        />
      ) : null}
    </>
  );
}

export type { MenuCommandId };
