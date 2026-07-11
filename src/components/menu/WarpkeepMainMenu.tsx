import {
  Suspense,
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref
} from 'react';

import type {
  FarcasterAuthViewState,
  VerifiedFarcasterIdentity
} from '../../farcaster/farcasterAuthTypes';
import { MenuDevelopmentNotice } from './MenuDevelopmentNotice';
import { menuCommands, type MenuCommand, type MenuCommandId } from './menuCommands';
import './WarpkeepMainMenu.css';

export type MenuInputModality = 'keyboard' | 'pointer' | 'touch' | 'unknown';

export type WarpkeepMainMenuProps = {
  active: boolean;
  visible?: boolean;
  interactive?: boolean;
  onRequestReturn: () => void;
  /** When supplied, ENTER REALM opens the live realm foundation instead of its legacy notice. */
  onRequestEnterRealm?: () => void;
  authState?: FarcasterAuthViewState;
  onRequestFarcasterSignIn?: () => void;
  onCancelFarcasterSignIn?: () => void;
  /** Lifecycle-only cancellation; unlike a player cancellation it preserves a route intent. */
  onDisposeFarcasterSignIn?: () => void;
  onRetryFarcasterSignIn?: () => void;
  onPrepareFarcasterQrCode?: () => void;
  onSignOut?: () => void;
  rememberDevice?: boolean;
  hasRememberedDevice?: boolean;
  onRememberDeviceChange?: (remember: boolean) => void;
  onRequestAuthenticatedRealm?: (identity: VerifiedFarcasterIdentity) => void;
  /**
   * A guarded anonymous `#realm` route asks the menu to show its native auth
   * rail and create one fresh request after the provider is mounted.
   */
  openFarcasterAuthPanel?: boolean;
  inputModality?: MenuInputModality;
  focusFirstCommand?: boolean;
  onVideoReady?: () => void;
  onVideoError?: () => void;
  noticeDurationMs?: number;
};

type ActiveNotice = {
  command: MenuCommand;
  anchorElement: HTMLButtonElement;
  refreshKey: number;
};

type MenuSurface = 'commands' | 'farcaster-auth';

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
  authState = ANONYMOUS_AUTH_STATE,
  onRequestFarcasterSignIn,
  onCancelFarcasterSignIn,
  onDisposeFarcasterSignIn,
  onRetryFarcasterSignIn,
  onPrepareFarcasterQrCode,
  onSignOut,
  rememberDevice = true,
  hasRememberedDevice = false,
  onRememberDeviceChange,
  onRequestAuthenticatedRealm,
  openFarcasterAuthPanel = false,
  inputModality = 'unknown',
  focusFirstCommand,
  onVideoReady,
  onVideoError,
  noticeDurationMs = 5600
}: WarpkeepMainMenuProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const commandRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const authHeadingRef = useRef<HTMLHeadingElement>(null);
  const authPrimaryActionRef = useRef<HTMLButtonElement>(null);
  const noticeSequenceRef = useRef(0);
  const didFocusOnRevealRef = useRef(false);
  const playbackBlockedRef = useRef(false);
  const didReportVideoReadyRef = useRef(false);
  const didReportVideoErrorRef = useRef(false);
  const authWasKeyboardDrivenRef = useRef(false);
  const previousAuthPhaseRef = useRef(authState.phase);
  const lastActionModalityRef = useRef<MenuInputModality>(inputModality);
  const routeAuthStartQueuedRef = useRef(false);
  const routeAuthStartVersionRef = useRef(0);
  const [videoState, setVideoState] = useState<'waiting' | 'ready' | 'error'>('waiting');
  const [activeNotice, setActiveNotice] = useState<ActiveNotice | null>(null);
  const [surface, setSurface] = useState<MenuSurface>('commands');
  const reducedMotion = useReducedMotionPreference();
  const interactive = interactiveOverride ?? (active && visible);
  const shouldFocusFirstCommand = focusFirstCommand ?? inputModality === 'keyboard';
  const authPanelOpen = surface === 'farcaster-auth';
  const authenticatedIdentity = authState.phase === 'authenticated'
    ? authState.identity
    : undefined;
  const authenticatedAssurance = authState.phase === 'authenticated'
    ? authState.assurance
    : undefined;
  const farcasterAuthEnabled = Boolean(
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
      previousPhase !== 'anonymous'
      && authState.phase === 'anonymous'
      && !openFarcasterAuthPanel
    ) {
      setSurface('commands');
    }
  }, [authState.phase, openFarcasterAuthPanel]);

  const restoreFirstCommandFocus = useCallback(() => {
    const frame = window.requestAnimationFrame(() => {
      commandRefs.current[0]?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const closeAuthPanel = useCallback((restoreKeyboardFocus = false) => {
    onCancelFarcasterSignIn?.();
    setSurface('commands');
    if (restoreKeyboardFocus) {
      restoreFirstCommandFocus();
    }
  }, [onCancelFarcasterSignIn, restoreFirstCommandFocus]);

  const handleRequestReturn = useCallback(() => {
    onCancelFarcasterSignIn?.();
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
  }, [activeNotice, authPanelOpen, closeAuthPanel, handleRequestReturn, interactive]);

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

  const openNotice = useCallback((command: MenuCommand, anchorElement: HTMLButtonElement) => {
    noticeSequenceRef.current += 1;
    setActiveNotice({
      command,
      anchorElement,
      refreshKey: noticeSequenceRef.current
    });
  }, []);

  const openAuthPanel = useCallback((keyboardDriven: boolean) => {
    authWasKeyboardDrivenRef.current = keyboardDriven;
    setActiveNotice(null);
    setSurface('farcaster-auth');
  }, []);

  useEffect(() => {
    if (!openFarcasterAuthPanel || !interactive || !farcasterAuthEnabled) {
      routeAuthStartVersionRef.current += 1;
      routeAuthStartQueuedRef.current = false;
      return;
    }

    if (!authPanelOpen) {
      openAuthPanel(false);
    }
    if (authState.phase !== 'anonymous') {
      routeAuthStartVersionRef.current += 1;
      routeAuthStartQueuedRef.current = false;
      return;
    }

    if (routeAuthStartQueuedRef.current) {
      return;
    }

    // A direct `#realm` load mounts the menu below the provider. Queue this
    // one explicit route-gated request until all mount effects have run, which
    // also keeps StrictMode's effect probe from creating a duplicate channel.
    routeAuthStartQueuedRef.current = true;
    const requestVersion = routeAuthStartVersionRef.current;
    void Promise.resolve().then(() => {
      if (
        routeAuthStartVersionRef.current !== requestVersion
        || !routeAuthStartQueuedRef.current
      ) {
        return;
      }
      onRequestFarcasterSignIn?.();
    });
    return () => {
      if (routeAuthStartVersionRef.current === requestVersion) {
        routeAuthStartVersionRef.current += 1;
      }
      routeAuthStartQueuedRef.current = false;
    };
  }, [
    authPanelOpen,
    authState.phase,
    farcasterAuthEnabled,
    interactive,
    onRequestFarcasterSignIn,
    openAuthPanel,
    openFarcasterAuthPanel
  ]);

  const handleCommandClick = useCallback((
    command: MenuCommand,
    anchorElement: HTMLButtonElement,
    keyboardDriven: boolean
  ) => {
    if (command.id === 'enter-realm' && farcasterAuthEnabled) {
      if (authenticatedIdentity) {
        onRequestAuthenticatedRealm?.(authenticatedIdentity);
      } else {
        openAuthPanel(keyboardDriven);
        onRequestFarcasterSignIn?.();
      }
      return;
    }

    if (command.id === 'enter-realm' && onRequestEnterRealm) {
      setActiveNotice(null);
      onRequestEnterRealm();
      return;
    }
    openNotice(command, anchorElement);
  }, [
    authenticatedIdentity,
    farcasterAuthEnabled,
    onRequestAuthenticatedRealm,
    onRequestEnterRealm,
    onRequestFarcasterSignIn,
    openAuthPanel,
    openNotice
  ]);

  const handleRetrySignIn = useCallback(() => {
    const keyboardDriven = lastActionModalityRef.current === 'keyboard';
    authWasKeyboardDrivenRef.current = keyboardDriven;
    onRetryFarcasterSignIn?.();
    if (keyboardDriven) {
      window.requestAnimationFrame(() => {
        authHeadingRef.current?.focus({ preventScroll: true });
      });
    }
  }, [onRetryFarcasterSignIn]);

  const handleBackToCommands = useCallback(() => {
    closeAuthPanel(lastActionModalityRef.current === 'keyboard');
  }, [closeAuthPanel]);

  const handleSignOut = useCallback(() => {
    const restoreKeyboardFocus = lastActionModalityRef.current === 'keyboard';
    onSignOut?.();
    setSurface('commands');
    if (restoreKeyboardFocus) {
      restoreFirstCommandFocus();
    }
  }, [onSignOut, restoreFirstCommandFocus]);

  const handleAuthenticatedRealmEntry = useCallback((identity: VerifiedFarcasterIdentity) => {
    setSurface('commands');
    onRequestAuthenticatedRealm?.(identity);
  }, [onRequestAuthenticatedRealm]);

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
    <main
      aria-hidden={!interactive}
      aria-labelledby="warpkeep-menu-title"
      className={rootClassName}
      data-active={active ? 'true' : 'false'}
      data-menu-surface={surface}
      data-media-state={reducedMotion ? 'static' : videoState}
      data-visible={visible ? 'true' : 'false'}
      inert={!interactive ? true : undefined}
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
          {authenticatedIdentity ? (
            <div className="warpkeep-menu-identity">
              <Suspense fallback={null}>
                <FarcasterIdentityBadge
                  compact
                  identity={authenticatedIdentity}
                  onActivate={() => openAuthPanel(
                    lastActionModalityRef.current === 'keyboard'
                  )}
                />
              </Suspense>
              <span className="warpkeep-menu-identity__assurance">
                {authenticatedAssurance === 'remembered-device-prototype'
                  ? 'REMEMBERED DEVICE'
                  : 'FARCASTER VERIFIED'}
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
          </nav>
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
            <FarcasterQrAuthPanel
              channelUrl={authState.phase === 'awaiting-approval'
                ? authState.channelUrl
                : undefined}
              assurance={authenticatedAssurance}
              errorMessage={authState.phase === 'error' || authState.phase === 'expired'
                ? authState.error.message
                : undefined}
              hasRememberedDevice={hasRememberedDevice}
              headingRef={authHeadingRef}
              identity={authenticatedIdentity}
              onPresentationReady={handleAuthPanelPresentationReady}
              onBackToMenu={handleBackToCommands}
              onCancel={() => closeAuthPanel(
                lastActionModalityRef.current === 'keyboard'
              )}
              onEnterRealm={handleAuthenticatedRealmEntry}
              onPrepareQrCode={onPrepareFarcasterQrCode}
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
          onDismiss={() => setActiveNotice(null)}
          refreshKey={activeNotice.refreshKey}
        />
      ) : null}
    </main>
  );
}

export type { MenuCommandId };
