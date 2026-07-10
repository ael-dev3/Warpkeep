import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';

import { MenuDevelopmentNotice } from './MenuDevelopmentNotice';
import { menuCommands, type MenuCommand, type MenuCommandId } from './menuCommands';
import './WarpkeepMainMenu.css';

export type MenuInputModality = 'keyboard' | 'pointer' | 'touch' | 'unknown';

export type WarpkeepMainMenuProps = {
  active: boolean;
  visible?: boolean;
  interactive?: boolean;
  onRequestReturn: () => void;
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
  inputModality = 'unknown',
  focusFirstCommand,
  onVideoReady,
  onVideoError,
  noticeDurationMs = 5600
}: WarpkeepMainMenuProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const commandRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const noticeSequenceRef = useRef(0);
  const didFocusOnRevealRef = useRef(false);
  const playbackBlockedRef = useRef(false);
  const didReportVideoReadyRef = useRef(false);
  const didReportVideoErrorRef = useRef(false);
  const [videoState, setVideoState] = useState<'waiting' | 'ready' | 'error'>('waiting');
  const [activeNotice, setActiveNotice] = useState<ActiveNotice | null>(null);
  const reducedMotion = useReducedMotionPreference();
  const interactive = interactiveOverride ?? (active && visible);
  const shouldFocusFirstCommand = focusFirstCommand ?? inputModality === 'keyboard';

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
      didFocusOnRevealRef.current = false;
      return;
    }

    if (shouldFocusFirstCommand && !didFocusOnRevealRef.current) {
      didFocusOnRevealRef.current = true;
      commandRefs.current[0]?.focus({ preventScroll: true });
    }
  }, [interactive, shouldFocusFirstCommand]);

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
      if (activeNotice) {
        setActiveNotice(null);
      } else {
        onRequestReturn();
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [activeNotice, interactive, onRequestReturn]);

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
      data-media-state={reducedMotion ? 'static' : videoState}
      data-visible={visible ? 'true' : 'false'}
      inert={!interactive ? true : undefined}
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
                onClick={(event) => openNotice(command, event.currentTarget)}
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

      <button
        aria-label="Return to Title"
        className="warpkeep-menu-back"
        disabled={!interactive}
        onClick={onRequestReturn}
        tabIndex={interactive ? 0 : -1}
        type="button"
      >
        <span aria-hidden="true" className="warpkeep-menu-back__arrow">←</span>
        <span className="warpkeep-menu-back__label">Return to Title</span>
      </button>

      <p aria-live="polite" className="warpkeep-menu-live-region">
        {interactive ? 'Main menu' : ''}
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
