import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef
} from 'react';
import {
  WARPKEEP_AUDIO_LEVELS,
  WARPKEEP_AUDIO_TRANSITION_MS,
  WARPKEEP_MENU_LOOP,
  getEqualPowerGains,
  getMenuLoopSchedule,
  getOtherMenuSource,
  type AudioScene,
  type MenuSourceIndex
} from './audioDirector';

const titleSoundtracks = [
  {
    id: 'theme-a',
    label: 'Title theme I',
    path: 'audio/warpkeep-title-theme-a.mp3'
  },
  {
    id: 'theme-b',
    label: 'Title theme II',
    path: 'audio/warpkeep-title-theme-b.mp3'
  }
] as const;

const menuSoundtrackPath = 'audio/warpkeep-menu-theme.mp3';
const playbackGestureEvents = ['pointerdown', 'pointerup', 'click', 'touchstart', 'keydown'] as const;
const volumeEpsilon = 0.0001;

interface SceneMix {
  menu: number;
  title: number;
}

interface SceneTransition {
  durationMs: number;
  from: SceneMix;
  startedAt: number;
  to: SceneMix;
}

interface MenuLoopState {
  activeIndex: MenuSourceIndex;
  phase: 'stable' | 'crossfading';
}

export interface WarpkeepAudioDirectorHandle {
  ensurePlaybackFromGesture: () => void;
  transitionTo: (scene: AudioScene) => void;
}

export interface WarpkeepAudioDirectorProps {
  scene?: AudioScene;
  preloadMenu?: boolean;
}

function getRandomTrackIndex() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % titleSoundtracks.length;
  }

  return Math.floor(Math.random() * titleSoundtracks.length);
}

function getSceneMix(scene: AudioScene): SceneMix {
  return scene === 'menu' ? { menu: 1, title: 0 } : { menu: 0, title: 1 };
}

function setCurrentTime(audio: HTMLAudioElement, nextTime: number) {
  try {
    audio.currentTime = nextTime;
  } catch {
    // A media element can reject seeks before metadata is available. The next
    // canplay/timeupdate event gives the scheduler another safe opportunity.
  }
}

function pauseMedia(audio: HTMLAudioElement | null) {
  if (!audio) {
    return;
  }

  audio.pause();
}

function playMedia(audio: HTMLAudioElement | null, onBlocked?: () => void) {
  if (!audio || audio.error) {
    return false;
  }

  try {
    const playback = audio.play();
    if (playback && typeof playback.catch === 'function') {
      void playback.catch(() => {
        onBlocked?.();
      });
    }
    return true;
  } catch {
    onBlocked?.();
    return false;
  }
}

export const WarpkeepAudioDirector = forwardRef<
  WarpkeepAudioDirectorHandle,
  WarpkeepAudioDirectorProps
>(function WarpkeepAudioDirector({ scene = 'title', preloadMenu = true }, forwardedRef) {
  const titleTrack = useMemo(() => titleSoundtracks[getRandomTrackIndex()], []);
  const initialSceneRef = useRef(scene);
  const titleAudioRef = useRef<HTMLAudioElement>(null);
  const menuAudioRefs = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([
    null,
    null
  ]);
  const disposedRef = useRef(false);
  const hiddenRef = useRef(
    typeof document === 'undefined' ? false : document.hidden
  );
  const requestedSceneRef = useRef<AudioScene>(scene);
  const sceneMixRef = useRef<SceneMix>(getSceneMix(scene));
  const sceneTransitionRef = useRef<SceneTransition | null>(null);
  const sceneAnimationFrameRef = useRef<number | null>(null);
  const loopAnimationFrameRef = useRef<number | null>(null);
  const loopScheduleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const loopStateRef = useRef<MenuLoopState>({ activeIndex: 0, phase: 'stable' });
  const loopGainsRef = useRef<[number, number]>([1, 0]);

  const markPlaybackBlocked = useCallback(() => {
    // Gesture listeners remain registered for the director's lifetime. They do
    // no media work unless an intended source is paused, so a rejected autoplay
    // is retried by the next real interaction without accumulating listeners.
  }, []);

  const applyVolumes = useCallback(() => {
    const titleAudio = titleAudioRef.current;
    const [menuAudioA, menuAudioB] = menuAudioRefs.current;
    const sceneMix = sceneMixRef.current;
    const loopGains = loopGainsRef.current;

    if (titleAudio) {
      titleAudio.volume = WARPKEEP_AUDIO_LEVELS.title * sceneMix.title;
    }

    if (menuAudioA) {
      menuAudioA.volume = WARPKEEP_AUDIO_LEVELS.menu * sceneMix.menu * loopGains[0];
    }

    if (menuAudioB) {
      menuAudioB.volume = WARPKEEP_AUDIO_LEVELS.menu * sceneMix.menu * loopGains[1];
    }
  }, []);

  const clearLoopSchedule = useCallback(() => {
    if (loopScheduleTimerRef.current !== null) {
      window.clearTimeout(loopScheduleTimerRef.current);
      loopScheduleTimerRef.current = null;
    }
  }, []);

  const clearLoopAnimation = useCallback(() => {
    if (loopAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(loopAnimationFrameRef.current);
      loopAnimationFrameRef.current = null;
    }
  }, []);

  const scheduleMenuLoopRef = useRef<() => void>(() => undefined);
  const beginMenuLoopCrossfadeRef = useRef<() => void>(() => undefined);

  const finishMenuLoopCrossfade = useCallback(() => {
    clearLoopAnimation();

    const previousIndex = loopStateRef.current.activeIndex;
    const nextIndex = getOtherMenuSource(previousIndex);
    const previousAudio = menuAudioRefs.current[previousIndex];
    const nextAudio = menuAudioRefs.current[nextIndex];

    pauseMedia(previousAudio);
    if (previousAudio) {
      setCurrentTime(previousAudio, 0);
      previousAudio.preload = 'none';
    }
    if (nextAudio) {
      nextAudio.preload = 'auto';
    }

    loopStateRef.current = { activeIndex: nextIndex, phase: 'stable' };
    loopGainsRef.current = nextIndex === 0 ? [1, 0] : [0, 1];
    applyVolumes();
    scheduleMenuLoopRef.current();
  }, [applyVolumes, clearLoopAnimation]);

  const beginMenuLoopCrossfade = useCallback(() => {
    if (
      disposedRef.current ||
      hiddenRef.current ||
      requestedSceneRef.current !== 'menu' ||
      loopStateRef.current.phase === 'crossfading'
    ) {
      return;
    }

    const activeIndex = loopStateRef.current.activeIndex;
    const standbyIndex = getOtherMenuSource(activeIndex);
    const activeAudio = menuAudioRefs.current[activeIndex];
    const standbyAudio = menuAudioRefs.current[standbyIndex];

    if (!activeAudio || !standbyAudio || activeAudio.paused) {
      return;
    }

    clearLoopSchedule();
    const initialSchedule = getMenuLoopSchedule(
      activeAudio.currentTime,
      activeAudio.paused,
      activeAudio.playbackRate
    );
    const initialProgress = initialSchedule.crossfadeProgress;
    const initialGains = getEqualPowerGains(initialProgress);

    loopStateRef.current = { activeIndex, phase: 'crossfading' };
    standbyAudio.preload = 'auto';
    setCurrentTime(standbyAudio, initialProgress * WARPKEEP_MENU_LOOP.overlapSeconds);
    loopGainsRef.current[activeIndex] = initialGains.outgoing;
    loopGainsRef.current[standbyIndex] = initialGains.incoming;
    applyVolumes();
    const restoreActiveSource = () => {
      if (
        disposedRef.current ||
        loopStateRef.current.phase !== 'crossfading' ||
        loopStateRef.current.activeIndex !== activeIndex
      ) {
        return;
      }

      clearLoopAnimation();
      pauseMedia(standbyAudio);
      setCurrentTime(standbyAudio, 0);
      standbyAudio.preload = 'none';
      activeAudio.preload = 'auto';
      loopStateRef.current = { activeIndex, phase: 'stable' };
      loopGainsRef.current[activeIndex] = 1;
      loopGainsRef.current[standbyIndex] = 0;
      applyVolumes();
      markPlaybackBlocked();
    };
    const playbackAttempted = playMedia(standbyAudio, restoreActiveSource);

    if (!playbackAttempted) {
      restoreActiveSource();
      return;
    }

    const updateLoopCrossfade = () => {
      loopAnimationFrameRef.current = null;

      if (
        disposedRef.current ||
        hiddenRef.current ||
        requestedSceneRef.current !== 'menu' ||
        loopStateRef.current.phase !== 'crossfading'
      ) {
        return;
      }

      const schedule = getMenuLoopSchedule(
        activeAudio.currentTime,
        activeAudio.paused,
        activeAudio.playbackRate
      );
      const gains = getEqualPowerGains(schedule.crossfadeProgress);

      loopGainsRef.current[activeIndex] = gains.outgoing;
      loopGainsRef.current[standbyIndex] = gains.incoming;
      applyVolumes();

      if (
        schedule.crossfadeProgress >= 1 ||
        activeAudio.ended ||
        activeAudio.currentTime >= WARPKEEP_MENU_LOOP.endSeconds
      ) {
        finishMenuLoopCrossfade();
        return;
      }

      if (!activeAudio.paused) {
        loopAnimationFrameRef.current = window.requestAnimationFrame(updateLoopCrossfade);
      }
    };

    loopAnimationFrameRef.current = window.requestAnimationFrame(updateLoopCrossfade);
  }, [
    applyVolumes,
    clearLoopAnimation,
    clearLoopSchedule,
    finishMenuLoopCrossfade,
    markPlaybackBlocked
  ]);

  beginMenuLoopCrossfadeRef.current = beginMenuLoopCrossfade;

  const scheduleMenuLoop = useCallback(() => {
    clearLoopSchedule();

    if (
      disposedRef.current ||
      hiddenRef.current ||
      requestedSceneRef.current !== 'menu' ||
      loopStateRef.current.phase === 'crossfading'
    ) {
      return;
    }

    const activeAudio = menuAudioRefs.current[loopStateRef.current.activeIndex];
    if (!activeAudio || activeAudio.paused) {
      return;
    }

    const schedule = getMenuLoopSchedule(
      activeAudio.currentTime,
      activeAudio.paused,
      activeAudio.playbackRate
    );

    if (schedule.shouldCrossfadeNow) {
      beginMenuLoopCrossfadeRef.current();
      return;
    }

    if (schedule.delayMs !== null) {
      loopScheduleTimerRef.current = window.setTimeout(() => {
        loopScheduleTimerRef.current = null;
        beginMenuLoopCrossfadeRef.current();
      }, schedule.delayMs);
    }
  }, [clearLoopSchedule]);

  scheduleMenuLoopRef.current = scheduleMenuLoop;

  const resetMenuToOpening = useCallback(() => {
    clearLoopSchedule();
    clearLoopAnimation();

    menuAudioRefs.current.forEach((audio) => {
      pauseMedia(audio);
      if (audio) {
        setCurrentTime(audio, 0);
        audio.preload = 'none';
      }
    });

    loopStateRef.current = { activeIndex: 0, phase: 'stable' };
    loopGainsRef.current = [1, 0];
    applyVolumes();
  }, [applyVolumes, clearLoopAnimation, clearLoopSchedule]);

  const restartEndedMenuSource = useCallback((activeAudio: HTMLAudioElement) => {
    if (
      disposedRef.current
      || hiddenRef.current
      || requestedSceneRef.current !== 'menu'
    ) {
      return;
    }

    clearLoopSchedule();
    clearLoopAnimation();

    const activeIndex = loopStateRef.current.activeIndex;
    const standbyIndex = getOtherMenuSource(activeIndex);
    const standbyAudio = menuAudioRefs.current[standbyIndex];

    pauseMedia(standbyAudio);
    if (standbyAudio) {
      setCurrentTime(standbyAudio, 0);
      standbyAudio.preload = 'none';
    }

    loopStateRef.current = { activeIndex, phase: 'stable' };
    loopGainsRef.current = activeIndex === 0 ? [1, 0] : [0, 1];
    activeAudio.preload = 'auto';
    setCurrentTime(activeAudio, 0);
    applyVolumes();
    playMedia(activeAudio, () => {
      clearLoopSchedule();
      markPlaybackBlocked();
    });
  }, [
    applyVolumes,
    clearLoopAnimation,
    clearLoopSchedule,
    markPlaybackBlocked
  ]);

  const playIntendedSources = useCallback(() => {
    if (disposedRef.current || hiddenRef.current) {
      return;
    }

    const titleAudio = titleAudioRef.current;
    const sceneMix = sceneMixRef.current;
    const activeMenuAudio = menuAudioRefs.current[loopStateRef.current.activeIndex];

    if (sceneMix.title > volumeEpsilon && titleAudio?.paused) {
      playMedia(titleAudio, markPlaybackBlocked);
    }

    if (sceneMix.menu > volumeEpsilon && activeMenuAudio?.paused) {
      activeMenuAudio.preload = 'auto';
      playMedia(activeMenuAudio, markPlaybackBlocked);
    }

    if (loopStateRef.current.phase === 'crossfading') {
      const standbyIndex = getOtherMenuSource(loopStateRef.current.activeIndex);
      const standbyAudio = menuAudioRefs.current[standbyIndex];
      if (standbyAudio?.paused) {
        playMedia(standbyAudio, markPlaybackBlocked);
      }
      beginMenuLoopCrossfadeRef.current();
    } else if (requestedSceneRef.current === 'menu') {
      scheduleMenuLoopRef.current();
    }
  }, [markPlaybackBlocked]);

  const finishSceneTransition = useCallback(() => {
    const targetScene = requestedSceneRef.current;
    sceneTransitionRef.current = null;
    sceneAnimationFrameRef.current = null;
    sceneMixRef.current = getSceneMix(targetScene);
    applyVolumes();

    if (targetScene === 'menu') {
      pauseMedia(titleAudioRef.current);
      scheduleMenuLoopRef.current();
    } else {
      clearLoopSchedule();
      clearLoopAnimation();
      menuAudioRefs.current.forEach(pauseMedia);
    }
  }, [applyVolumes, clearLoopAnimation, clearLoopSchedule]);

  const runSceneTransition = useCallback(
    (timestamp: number) => {
      sceneAnimationFrameRef.current = null;
      const transition = sceneTransitionRef.current;

      if (!transition || disposedRef.current) {
        return;
      }

      if (hiddenRef.current) {
        finishSceneTransition();
        return;
      }

      const progress = Math.min(
        1,
        Math.max(0, (timestamp - transition.startedAt) / transition.durationMs)
      );
      const gains = getEqualPowerGains(progress);

      sceneMixRef.current = {
        menu: transition.from.menu * gains.outgoing + transition.to.menu * gains.incoming,
        title: transition.from.title * gains.outgoing + transition.to.title * gains.incoming
      };
      applyVolumes();

      if (progress >= 1) {
        finishSceneTransition();
        return;
      }

      sceneAnimationFrameRef.current = window.requestAnimationFrame(runSceneTransition);
    },
    [applyVolumes, finishSceneTransition]
  );

  const transitionTo = useCallback(
    (nextScene: AudioScene) => {
      if (disposedRef.current || nextScene === requestedSceneRef.current) {
        playIntendedSources();
        return;
      }

      const previousScene = requestedSceneRef.current;
      requestedSceneRef.current = nextScene;

      if (nextScene === 'menu') {
        if (previousScene !== 'menu') {
          resetMenuToOpening();
        }
      } else {
        clearLoopSchedule();
      }

      if (sceneAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(sceneAnimationFrameRef.current);
        sceneAnimationFrameRef.current = null;
      }

      if (hiddenRef.current) {
        clearLoopSchedule();
        clearLoopAnimation();
        sceneTransitionRef.current = null;
        sceneMixRef.current = getSceneMix(nextScene);
        applyVolumes();
        pauseMedia(titleAudioRef.current);
        menuAudioRefs.current.forEach(pauseMedia);
        return;
      }

      if (nextScene === 'menu') {
        const activeMenuAudio = menuAudioRefs.current[loopStateRef.current.activeIndex];
        if (activeMenuAudio) {
          activeMenuAudio.preload = 'auto';
        }
        playMedia(activeMenuAudio, markPlaybackBlocked);
      } else {
        playMedia(titleAudioRef.current, markPlaybackBlocked);
      }

      sceneTransitionRef.current = {
        durationMs: WARPKEEP_AUDIO_TRANSITION_MS,
        from: { ...sceneMixRef.current },
        startedAt: performance.now(),
        to: getSceneMix(nextScene)
      };
      sceneAnimationFrameRef.current = window.requestAnimationFrame(runSceneTransition);
    },
    [
      applyVolumes,
      clearLoopAnimation,
      clearLoopSchedule,
      markPlaybackBlocked,
      playIntendedSources,
      resetMenuToOpening,
      runSceneTransition
    ]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      ensurePlaybackFromGesture: playIntendedSources,
      transitionTo
    }),
    [playIntendedSources, transitionTo]
  );

  useEffect(() => {
    transitionTo(scene);
  }, [scene, transitionTo]);

  useEffect(() => {
    disposedRef.current = false;
    requestedSceneRef.current = initialSceneRef.current;
    sceneMixRef.current = getSceneMix(initialSceneRef.current);

    const titleAudio = titleAudioRef.current;
    const menuAudios = menuAudioRefs.current;
    const allAudio = [titleAudio, ...menuAudios].filter(
      (audio): audio is HTMLAudioElement => audio !== null
    );

    titleAudio!.loop = true;
    allAudio.forEach((audio) => {
      audio.muted = false;
    });
    titleAudio!.preload = 'auto';
    if (menuAudios[0]) {
      menuAudios[0].preload = preloadMenu ? 'auto' : 'none';
    }
    if (menuAudios[1]) {
      menuAudios[1].preload = 'none';
    }
    applyVolumes();

    const handleGesture = () => {
      playIntendedSources();
    };

    const handleVisibilityChange = () => {
      hiddenRef.current = document.hidden;

      if (document.hidden) {
        if (loopStateRef.current.phase === 'crossfading') {
          finishMenuLoopCrossfade();
        }
        clearLoopSchedule();
        clearLoopAnimation();
        if (sceneAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(sceneAnimationFrameRef.current);
          sceneAnimationFrameRef.current = null;
        }
        allAudio.forEach(pauseMedia);
        return;
      }

      if (sceneTransitionRef.current) {
        finishSceneTransition();
      }
      playIntendedSources();
    };

    const handleMenuPlaybackProgress = () => {
      if (requestedSceneRef.current === 'menu') {
        scheduleMenuLoopRef.current();
      }
    };

    const handleActiveMenuEnded = (event: Event) => {
      const activeAudio = menuAudioRefs.current[loopStateRef.current.activeIndex];
      if (
        !activeAudio
        || event.currentTarget !== activeAudio
        || requestedSceneRef.current !== 'menu'
      ) {
        return;
      }

      if (loopStateRef.current.phase === 'crossfading') {
        finishMenuLoopCrossfade();
      } else {
        restartEndedMenuSource(activeAudio);
      }
    };

    playbackGestureEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleGesture, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    menuAudios.forEach((audio) => {
      audio?.addEventListener('play', handleMenuPlaybackProgress);
      audio?.addEventListener('timeupdate', handleMenuPlaybackProgress);
      audio?.addEventListener('ratechange', handleMenuPlaybackProgress);
      audio?.addEventListener('seeked', handleMenuPlaybackProgress);
      audio?.addEventListener('ended', handleActiveMenuEnded);
    });

    playIntendedSources();

    return () => {
      disposedRef.current = true;
      clearLoopSchedule();
      clearLoopAnimation();

      if (sceneAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(sceneAnimationFrameRef.current);
        sceneAnimationFrameRef.current = null;
      }

      playbackGestureEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleGesture, true);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      menuAudios.forEach((audio) => {
        audio?.removeEventListener('play', handleMenuPlaybackProgress);
        audio?.removeEventListener('timeupdate', handleMenuPlaybackProgress);
        audio?.removeEventListener('ratechange', handleMenuPlaybackProgress);
        audio?.removeEventListener('seeked', handleMenuPlaybackProgress);
        audio?.removeEventListener('ended', handleActiveMenuEnded);
      });
      allAudio.forEach(pauseMedia);
      sceneTransitionRef.current = null;
    };
  }, [
    applyVolumes,
    clearLoopAnimation,
    clearLoopSchedule,
    finishMenuLoopCrossfade,
    finishSceneTransition,
    playIntendedSources,
    restartEndedMenuSource
  ]);

  useEffect(() => {
    const [primaryAudio, standbyAudio] = menuAudioRefs.current;
    if (primaryAudio && loopStateRef.current.activeIndex === 0) {
      primaryAudio.preload = preloadMenu ? 'auto' : 'none';
    }
    if (standbyAudio && loopStateRef.current.activeIndex !== 1) {
      standbyAudio.preload = 'none';
    }
  }, [preloadMenu]);

  const baseUrl = import.meta.env.BASE_URL;
  const menuSoundtrackUrl = `${baseUrl}${menuSoundtrackPath}`;

  return (
    <div data-warpkeep-audio-director="true" hidden aria-hidden="true">
      <audio
        ref={titleAudioRef}
        data-audio-role="title"
        data-sound-default="on"
        data-track={titleTrack.id}
        data-track-label={titleTrack.label}
        src={`${baseUrl}${titleTrack.path}`}
        loop
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />
      <audio
        ref={(audio) => {
          menuAudioRefs.current[0] = audio;
        }}
        data-audio-role="menu-primary"
        src={menuSoundtrackUrl}
        preload={preloadMenu ? 'auto' : 'none'}
        aria-hidden="true"
        tabIndex={-1}
      />
      <audio
        ref={(audio) => {
          menuAudioRefs.current[1] = audio;
        }}
        data-audio-role="menu-standby"
        src={menuSoundtrackUrl}
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
});
