import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  WARPKEEP_AUDIO_LEVELS,
  WARPKEEP_MENU_LOOP,
  WARPKEEP_REALM_LOOP,
  getEqualPowerGains,
  getLoopSchedule,
  getOtherSource,
  getSceneMix,
  getSceneTransitionDuration,
  type AudioLoopDefinition,
  type AudioLoopScene,
  type AudioScene,
  type AudioSourceIndex,
  type SceneMix
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

const loopScenes = ['menu', 'realm'] as const satisfies readonly AudioLoopScene[];

interface LoopSceneDefinition {
  level: number;
  loop: AudioLoopDefinition;
  path: string;
}

const loopSceneDefinitions: Record<AudioLoopScene, LoopSceneDefinition> = {
  menu: {
    level: WARPKEEP_AUDIO_LEVELS.menu,
    loop: WARPKEEP_MENU_LOOP,
    path: 'audio/warpkeep-menu-theme.mp3'
  },
  realm: {
    level: WARPKEEP_AUDIO_LEVELS.realm,
    loop: WARPKEEP_REALM_LOOP,
    path: 'audio/warpkeep-lowlands-theme.mp3'
  }
};

const playbackGestureEvents = ['pointerdown', 'pointerup', 'click', 'touchstart', 'keydown'] as const;
const volumeEpsilon = 0.0001;

type AudioPair = [HTMLAudioElement | null, HTMLAudioElement | null];

interface SceneTransition {
  durationMs: number;
  from: SceneMix;
  startedAt: number;
  to: SceneMix;
}

interface LoopState {
  activeIndex: AudioSourceIndex;
  phase: 'stable' | 'crossfading';
}

type LoopStateMap = Record<AudioLoopScene, LoopState>;
type LoopGainsMap = Record<AudioLoopScene, [number, number]>;
type LoopTimerMap = Record<AudioLoopScene, number | null>;

function createLoopStates(): LoopStateMap {
  return {
    menu: { activeIndex: 0, phase: 'stable' },
    realm: { activeIndex: 0, phase: 'stable' }
  };
}

function createLoopGains(): LoopGainsMap {
  return {
    menu: [1, 0],
    realm: [1, 0]
  };
}

function createLoopTimers(): LoopTimerMap {
  return {
    menu: null,
    realm: null
  };
}

function getRandomTrackIndex() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % titleSoundtracks.length;
  }

  return Math.floor(Math.random() * titleSoundtracks.length);
}

function isLoopScene(scene: AudioScene): scene is AudioLoopScene {
  return scene !== 'title';
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
  audio?.pause();
}

function playMedia(audio: HTMLAudioElement | null, onBlocked?: () => void) {
  if (!audio || audio.error || !audio.hasAttribute('src')) {
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

export interface WarpkeepAudioDirectorHandle {
  ensurePlaybackFromGesture: () => void;
  prepareScene: (scene: AudioLoopScene) => void;
  resetScene: (scene?: AudioLoopScene) => void;
  transitionTo: (scene: AudioScene) => void;
}

export interface WarpkeepAudioDirectorProps {
  scene?: AudioScene;
  preloadMenu?: boolean;
}

/**
 * Keeps the title and the two looping soundscapes in one equal-power mixer.
 * The realm pair deliberately renders without a source until prepareScene()
 * is invoked by an authenticated entry gesture.
 */
export const WarpkeepAudioDirector = forwardRef<
  WarpkeepAudioDirectorHandle,
  WarpkeepAudioDirectorProps
>(function WarpkeepAudioDirector({ scene = 'title', preloadMenu = true }, forwardedRef) {
  const baseUrl = import.meta.env.BASE_URL;
  const soundtrackUrls = useMemo(
    () => ({
      menu: `${baseUrl}${loopSceneDefinitions.menu.path}`,
      realm: `${baseUrl}${loopSceneDefinitions.realm.path}`
    }),
    [baseUrl]
  );
  const titleTrack = useMemo(() => titleSoundtracks[getRandomTrackIndex()], []);
  const initialSceneRef = useRef(scene);
  const preloadMenuRef = useRef(preloadMenu);
  const titleAudioRef = useRef<HTMLAudioElement>(null);
  const loopAudioRefs = useRef<Record<AudioLoopScene, AudioPair>>({
    menu: [null, null],
    realm: [null, null]
  });
  const [realmPrepared, setRealmPrepared] = useState(false);
  const preparedLoopScenesRef = useRef<Record<AudioLoopScene, boolean>>({
    menu: true,
    realm: false
  });
  const disposedRef = useRef(false);
  const hiddenRef = useRef(typeof document === 'undefined' ? false : document.hidden);
  const requestedSceneRef = useRef<AudioScene>(scene);
  const sceneMixRef = useRef<SceneMix>(getSceneMix(scene));
  const sceneTransitionRef = useRef<SceneTransition | null>(null);
  const sceneAnimationFrameRef = useRef<number | null>(null);
  const loopStateRef = useRef<LoopStateMap>(createLoopStates());
  const loopGainsRef = useRef<LoopGainsMap>(createLoopGains());
  const loopScheduleTimerRef = useRef<LoopTimerMap>(createLoopTimers());
  const loopAnimationFrameRef = useRef<LoopTimerMap>(createLoopTimers());

  const markPlaybackBlocked = useCallback(() => {
    // Gesture listeners remain registered for the director's lifetime. They do
    // no media work unless an intended source is paused, so a rejected autoplay
    // is retried by the next real interaction without accumulating listeners.
  }, []);

  const getLoopPair = useCallback((loopScene: AudioLoopScene) => {
    return loopAudioRefs.current[loopScene];
  }, []);

  const getActiveLoopAudio = useCallback(
    (loopScene: AudioLoopScene) => {
      const { activeIndex } = loopStateRef.current[loopScene];
      return getLoopPair(loopScene)[activeIndex];
    },
    [getLoopPair]
  );

  const getAllAudio = useCallback(() => {
    const title = titleAudioRef.current;
    const loops = loopScenes.flatMap((loopScene) => getLoopPair(loopScene));
    return [title, ...loops].filter((audio): audio is HTMLAudioElement => audio !== null);
  }, [getLoopPair]);

  const applyVolumes = useCallback(() => {
    const titleAudio = titleAudioRef.current;
    const sceneMix = sceneMixRef.current;

    if (titleAudio) {
      titleAudio.volume = WARPKEEP_AUDIO_LEVELS.title * sceneMix.title;
    }

    loopScenes.forEach((loopScene) => {
      const pair = getLoopPair(loopScene);
      const gains = loopGainsRef.current[loopScene];
      const level = loopSceneDefinitions[loopScene].level * sceneMix[loopScene];

      pair.forEach((audio, index) => {
        if (audio) {
          audio.volume = level * gains[index];
        }
      });
    });
  }, [getLoopPair]);

  const clearLoopSchedule = useCallback((loopScene: AudioLoopScene) => {
    const timer = loopScheduleTimerRef.current[loopScene];
    if (timer !== null) {
      window.clearTimeout(timer);
      loopScheduleTimerRef.current[loopScene] = null;
    }
  }, []);

  const clearLoopAnimation = useCallback((loopScene: AudioLoopScene) => {
    const frame = loopAnimationFrameRef.current[loopScene];
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      loopAnimationFrameRef.current[loopScene] = null;
    }
  }, []);

  const ensureLoopSources = useCallback(
    (loopScene: AudioLoopScene) => {
      const sourceUrl = soundtrackUrls[loopScene];
      getLoopPair(loopScene).forEach((audio) => {
        if (audio && !audio.hasAttribute('src')) {
          audio.setAttribute('src', sourceUrl);
        }
      });
    },
    [getLoopPair, soundtrackUrls]
  );

  const prepareScene = useCallback(
    (loopScene: AudioLoopScene) => {
      if (disposedRef.current) {
        return;
      }

      const wasPrepared = preparedLoopScenesRef.current[loopScene];
      preparedLoopScenesRef.current[loopScene] = true;
      ensureLoopSources(loopScene);

      const pair = getLoopPair(loopScene);
      const activeIndex = loopStateRef.current[loopScene].activeIndex;
      pair.forEach((audio, index) => {
        if (audio) {
          audio.preload = index === activeIndex ? 'auto' : 'none';
        }
      });

      if (loopScene === 'realm' && !wasPrepared) {
        setRealmPrepared(true);
      }
    },
    [ensureLoopSources, getLoopPair]
  );

  const scheduleLoopRef = useRef<(loopScene: AudioLoopScene) => void>(() => undefined);
  const beginLoopCrossfadeRef = useRef<(loopScene: AudioLoopScene) => void>(() => undefined);

  const stabilizeLoopPair = useCallback(
    (loopScene: AudioLoopScene) => {
      const state = loopStateRef.current[loopScene];
      if (state.phase !== 'crossfading') {
        return;
      }

      const activeIndex = state.activeIndex;
      const standbyIndex = getOtherSource(activeIndex);
      const [activeAudio, standbyAudio] = [
        getLoopPair(loopScene)[activeIndex],
        getLoopPair(loopScene)[standbyIndex]
      ];

      pauseMedia(standbyAudio);
      if (standbyAudio) {
        setCurrentTime(standbyAudio, 0);
        standbyAudio.preload = 'none';
      }
      if (activeAudio) {
        activeAudio.preload = 'auto';
      }

      loopStateRef.current[loopScene] = { activeIndex, phase: 'stable' };
      loopGainsRef.current[loopScene] = activeIndex === 0 ? [1, 0] : [0, 1];
      applyVolumes();
    },
    [applyVolumes, getLoopPair]
  );

  const pauseLoopScene = useCallback(
    (loopScene: AudioLoopScene) => {
      clearLoopSchedule(loopScene);
      clearLoopAnimation(loopScene);
      stabilizeLoopPair(loopScene);
      getLoopPair(loopScene).forEach(pauseMedia);
    },
    [clearLoopAnimation, clearLoopSchedule, getLoopPair, stabilizeLoopPair]
  );

  const resetLoopScene = useCallback(
    (loopScene: AudioLoopScene) => {
      clearLoopSchedule(loopScene);
      clearLoopAnimation(loopScene);

      const prepared = preparedLoopScenesRef.current[loopScene];
      const initialPreload =
        loopScene === 'menu' ? (preloadMenuRef.current ? 'auto' : 'none') : 'auto';

      getLoopPair(loopScene).forEach((audio, index) => {
        pauseMedia(audio);
        if (audio) {
          setCurrentTime(audio, 0);
          audio.preload = prepared && index === 0 ? initialPreload : 'none';
        }
      });

      loopStateRef.current[loopScene] = { activeIndex: 0, phase: 'stable' };
      loopGainsRef.current[loopScene] = [1, 0];
      applyVolumes();
    },
    [applyVolumes, clearLoopAnimation, clearLoopSchedule, getLoopPair]
  );

  const finishLoopCrossfade = useCallback(
    (loopScene: AudioLoopScene) => {
      clearLoopAnimation(loopScene);

      const previousIndex = loopStateRef.current[loopScene].activeIndex;
      const nextIndex = getOtherSource(previousIndex);
      const [previousAudio, nextAudio] = [
        getLoopPair(loopScene)[previousIndex],
        getLoopPair(loopScene)[nextIndex]
      ];

      pauseMedia(previousAudio);
      if (previousAudio) {
        setCurrentTime(previousAudio, 0);
        previousAudio.preload = 'none';
      }
      if (nextAudio) {
        nextAudio.preload = 'auto';
      }

      loopStateRef.current[loopScene] = { activeIndex: nextIndex, phase: 'stable' };
      loopGainsRef.current[loopScene] = nextIndex === 0 ? [1, 0] : [0, 1];
      applyVolumes();
      scheduleLoopRef.current(loopScene);
    },
    [applyVolumes, clearLoopAnimation, getLoopPair]
  );

  const beginLoopCrossfade = useCallback(
    (loopScene: AudioLoopScene) => {
      const state = loopStateRef.current[loopScene];
      if (
        disposedRef.current ||
        hiddenRef.current ||
        requestedSceneRef.current !== loopScene ||
        !preparedLoopScenesRef.current[loopScene] ||
        state.phase === 'crossfading'
      ) {
        return;
      }

      const activeIndex = state.activeIndex;
      const standbyIndex = getOtherSource(activeIndex);
      const [activeAudio, standbyAudio] = [
        getLoopPair(loopScene)[activeIndex],
        getLoopPair(loopScene)[standbyIndex]
      ];

      if (!activeAudio || !standbyAudio || activeAudio.paused) {
        return;
      }

      clearLoopSchedule(loopScene);
      const definition = loopSceneDefinitions[loopScene];
      const initialSchedule = getLoopSchedule(
        definition.loop,
        activeAudio.currentTime,
        activeAudio.paused,
        activeAudio.playbackRate
      );
      const initialProgress = initialSchedule.crossfadeProgress;
      const initialGains = getEqualPowerGains(initialProgress);

      loopStateRef.current[loopScene] = { activeIndex, phase: 'crossfading' };
      standbyAudio.preload = 'auto';
      setCurrentTime(standbyAudio, initialProgress * definition.loop.overlapSeconds);
      loopGainsRef.current[loopScene][activeIndex] = initialGains.outgoing;
      loopGainsRef.current[loopScene][standbyIndex] = initialGains.incoming;
      applyVolumes();

      const restoreActiveSource = () => {
        const currentState = loopStateRef.current[loopScene];
        if (
          disposedRef.current ||
          currentState.phase !== 'crossfading' ||
          currentState.activeIndex !== activeIndex
        ) {
          return;
        }

        clearLoopAnimation(loopScene);
        pauseMedia(standbyAudio);
        setCurrentTime(standbyAudio, 0);
        standbyAudio.preload = 'none';
        activeAudio.preload = 'auto';
        loopStateRef.current[loopScene] = { activeIndex, phase: 'stable' };
        loopGainsRef.current[loopScene] = activeIndex === 0 ? [1, 0] : [0, 1];
        applyVolumes();
        markPlaybackBlocked();
      };

      if (!playMedia(standbyAudio, restoreActiveSource)) {
        restoreActiveSource();
        return;
      }

      const updateLoopCrossfade = () => {
        loopAnimationFrameRef.current[loopScene] = null;

        if (
          disposedRef.current ||
          hiddenRef.current ||
          requestedSceneRef.current !== loopScene ||
          loopStateRef.current[loopScene].phase !== 'crossfading'
        ) {
          return;
        }

        const schedule = getLoopSchedule(
          definition.loop,
          activeAudio.currentTime,
          activeAudio.paused,
          activeAudio.playbackRate
        );
        const gains = getEqualPowerGains(schedule.crossfadeProgress);
        loopGainsRef.current[loopScene][activeIndex] = gains.outgoing;
        loopGainsRef.current[loopScene][standbyIndex] = gains.incoming;
        applyVolumes();

        if (
          schedule.crossfadeProgress >= 1 ||
          activeAudio.ended ||
          activeAudio.currentTime >= definition.loop.endSeconds
        ) {
          finishLoopCrossfade(loopScene);
          return;
        }

        if (!activeAudio.paused) {
          loopAnimationFrameRef.current[loopScene] = window.requestAnimationFrame(updateLoopCrossfade);
        }
      };

      loopAnimationFrameRef.current[loopScene] = window.requestAnimationFrame(updateLoopCrossfade);
    },
    [
      applyVolumes,
      clearLoopAnimation,
      clearLoopSchedule,
      finishLoopCrossfade,
      getLoopPair,
      markPlaybackBlocked
    ]
  );

  beginLoopCrossfadeRef.current = beginLoopCrossfade;

  const scheduleLoop = useCallback(
    (loopScene: AudioLoopScene) => {
      clearLoopSchedule(loopScene);

      if (
        disposedRef.current ||
        hiddenRef.current ||
        requestedSceneRef.current !== loopScene ||
        !preparedLoopScenesRef.current[loopScene] ||
        loopStateRef.current[loopScene].phase === 'crossfading'
      ) {
        return;
      }

      const activeAudio = getActiveLoopAudio(loopScene);
      if (!activeAudio || activeAudio.paused) {
        return;
      }

      const schedule = getLoopSchedule(
        loopSceneDefinitions[loopScene].loop,
        activeAudio.currentTime,
        activeAudio.paused,
        activeAudio.playbackRate
      );

      if (schedule.shouldCrossfadeNow) {
        beginLoopCrossfadeRef.current(loopScene);
        return;
      }

      if (schedule.delayMs !== null) {
        loopScheduleTimerRef.current[loopScene] = window.setTimeout(() => {
          loopScheduleTimerRef.current[loopScene] = null;
          beginLoopCrossfadeRef.current(loopScene);
        }, schedule.delayMs);
      }
    },
    [clearLoopSchedule, getActiveLoopAudio]
  );

  scheduleLoopRef.current = scheduleLoop;

  const restartEndedLoopSource = useCallback(
    (loopScene: AudioLoopScene, activeAudio: HTMLAudioElement) => {
      if (
        disposedRef.current ||
        hiddenRef.current ||
        requestedSceneRef.current !== loopScene ||
        !preparedLoopScenesRef.current[loopScene]
      ) {
        return;
      }

      clearLoopSchedule(loopScene);
      clearLoopAnimation(loopScene);

      const activeIndex = loopStateRef.current[loopScene].activeIndex;
      const standbyIndex = getOtherSource(activeIndex);
      const standbyAudio = getLoopPair(loopScene)[standbyIndex];

      pauseMedia(standbyAudio);
      if (standbyAudio) {
        setCurrentTime(standbyAudio, 0);
        standbyAudio.preload = 'none';
      }

      loopStateRef.current[loopScene] = { activeIndex, phase: 'stable' };
      loopGainsRef.current[loopScene] = activeIndex === 0 ? [1, 0] : [0, 1];
      activeAudio.preload = 'auto';
      setCurrentTime(activeAudio, 0);
      applyVolumes();
      playMedia(activeAudio, () => {
        clearLoopSchedule(loopScene);
        markPlaybackBlocked();
      });
    },
    [
      applyVolumes,
      clearLoopAnimation,
      clearLoopSchedule,
      getLoopPair,
      markPlaybackBlocked
    ]
  );

  const playIntendedSources = useCallback(() => {
    if (disposedRef.current || hiddenRef.current) {
      return;
    }

    const sceneMix = sceneMixRef.current;
    const titleAudio = titleAudioRef.current;
    if (sceneMix.title > volumeEpsilon && titleAudio?.paused) {
      playMedia(titleAudio, markPlaybackBlocked);
    }

    loopScenes.forEach((loopScene) => {
      if (
        sceneMix[loopScene] <= volumeEpsilon ||
        !preparedLoopScenesRef.current[loopScene]
      ) {
        return;
      }

      const activeAudio = getActiveLoopAudio(loopScene);
      if (activeAudio?.paused) {
        activeAudio.preload = 'auto';
        playMedia(activeAudio, markPlaybackBlocked);
      }
    });

    const requestedScene = requestedSceneRef.current;
    if (!isLoopScene(requestedScene) || !preparedLoopScenesRef.current[requestedScene]) {
      return;
    }

    const state = loopStateRef.current[requestedScene];
    if (state.phase === 'crossfading') {
      const standbyAudio = getLoopPair(requestedScene)[getOtherSource(state.activeIndex)];
      if (standbyAudio?.paused) {
        playMedia(standbyAudio, markPlaybackBlocked);
      }
      return;
    }

    scheduleLoopRef.current(requestedScene);
  }, [getActiveLoopAudio, getLoopPair, markPlaybackBlocked]);

  const finishSceneTransition = useCallback(() => {
    const targetScene = requestedSceneRef.current;
    sceneTransitionRef.current = null;
    sceneAnimationFrameRef.current = null;
    sceneMixRef.current = getSceneMix(targetScene);
    applyVolumes();

    if (targetScene === 'title') {
      loopScenes.forEach(pauseLoopScene);
      return;
    }

    pauseMedia(titleAudioRef.current);
    const inactiveLoopScene = targetScene === 'menu' ? 'realm' : 'menu';
    pauseLoopScene(inactiveLoopScene);
    if (preparedLoopScenesRef.current[targetScene]) {
      scheduleLoopRef.current(targetScene);
    }
  }, [applyVolumes, pauseLoopScene]);

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
        realm: transition.from.realm * gains.outgoing + transition.to.realm * gains.incoming,
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
      if (disposedRef.current) {
        return;
      }

      if (nextScene === requestedSceneRef.current) {
        playIntendedSources();
        return;
      }

      const previousScene = requestedSceneRef.current;
      requestedSceneRef.current = nextScene;

      if (isLoopScene(previousScene) && previousScene !== nextScene) {
        clearLoopSchedule(previousScene);
      }
      if (nextScene === 'menu' && previousScene === 'title') {
        resetLoopScene('menu');
      }

      if (sceneAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(sceneAnimationFrameRef.current);
        sceneAnimationFrameRef.current = null;
      }

      if (hiddenRef.current) {
        sceneTransitionRef.current = null;
        sceneMixRef.current = getSceneMix(nextScene);
        applyVolumes();
        pauseMedia(titleAudioRef.current);
        loopScenes.forEach(pauseLoopScene);
        return;
      }

      if (nextScene === 'title') {
        playMedia(titleAudioRef.current, markPlaybackBlocked);
      } else if (preparedLoopScenesRef.current[nextScene]) {
        const activeAudio = getActiveLoopAudio(nextScene);
        if (activeAudio) {
          activeAudio.preload = 'auto';
        }
        playMedia(activeAudio, markPlaybackBlocked);
      }

      sceneTransitionRef.current = {
        durationMs: getSceneTransitionDuration(previousScene, nextScene),
        from: { ...sceneMixRef.current },
        startedAt: performance.now(),
        to: getSceneMix(nextScene)
      };
      sceneAnimationFrameRef.current = window.requestAnimationFrame(runSceneTransition);
    },
    [
      applyVolumes,
      clearLoopSchedule,
      getActiveLoopAudio,
      markPlaybackBlocked,
      pauseLoopScene,
      playIntendedSources,
      resetLoopScene,
      runSceneTransition
    ]
  );

  const resetScene = useCallback(
    (loopScene: AudioLoopScene = 'realm') => {
      resetLoopScene(loopScene);
    },
    [resetLoopScene]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      ensurePlaybackFromGesture: playIntendedSources,
      prepareScene,
      resetScene,
      transitionTo
    }),
    [playIntendedSources, prepareScene, resetScene, transitionTo]
  );

  useEffect(() => {
    transitionTo(scene);
  }, [scene, transitionTo]);

  useEffect(() => {
    disposedRef.current = false;
    requestedSceneRef.current = initialSceneRef.current;
    sceneMixRef.current = getSceneMix(initialSceneRef.current);

    const titleAudio = titleAudioRef.current;
    const allAudio = getAllAudio();
    titleAudio!.loop = true;
    allAudio.forEach((audio) => {
      audio.muted = false;
    });
    titleAudio!.preload = 'auto';
    getLoopPair('menu')[0] && (getLoopPair('menu')[0]!.preload = preloadMenuRef.current ? 'auto' : 'none');
    getLoopPair('menu')[1] && (getLoopPair('menu')[1]!.preload = 'none');
    getLoopPair('realm').forEach((audio) => {
      if (audio) {
        audio.preload = 'none';
      }
    });
    applyVolumes();

    const handleGesture = () => {
      playIntendedSources();
    };

    const handleVisibilityChange = () => {
      hiddenRef.current = document.hidden;

      if (document.hidden) {
        if (sceneAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(sceneAnimationFrameRef.current);
          sceneAnimationFrameRef.current = null;
        }
        loopScenes.forEach(pauseLoopScene);
        allAudio.forEach(pauseMedia);
        return;
      }

      if (sceneTransitionRef.current) {
        finishSceneTransition();
      }
      playIntendedSources();
    };

    const playbackListeners = loopScenes.map((loopScene) => {
      const handleProgress = () => {
        if (requestedSceneRef.current === loopScene) {
          scheduleLoopRef.current(loopScene);
        }
      };
      const handleEnded = (event: Event) => {
        const activeAudio = getActiveLoopAudio(loopScene);
        if (
          !activeAudio ||
          event.currentTarget !== activeAudio ||
          requestedSceneRef.current !== loopScene
        ) {
          return;
        }

        if (loopStateRef.current[loopScene].phase === 'crossfading') {
          finishLoopCrossfade(loopScene);
        } else {
          restartEndedLoopSource(loopScene, activeAudio);
        }
      };

      getLoopPair(loopScene).forEach((audio) => {
        audio?.addEventListener('play', handleProgress);
        audio?.addEventListener('timeupdate', handleProgress);
        audio?.addEventListener('ratechange', handleProgress);
        audio?.addEventListener('seeked', handleProgress);
        audio?.addEventListener('ended', handleEnded);
      });

      return { handleEnded, handleProgress, loopScene };
    });

    playbackGestureEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleGesture, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    playIntendedSources();

    return () => {
      disposedRef.current = true;
      loopScenes.forEach((loopScene) => {
        clearLoopSchedule(loopScene);
        clearLoopAnimation(loopScene);
      });
      if (sceneAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(sceneAnimationFrameRef.current);
        sceneAnimationFrameRef.current = null;
      }

      playbackGestureEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleGesture, true);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      playbackListeners.forEach(({ handleEnded, handleProgress, loopScene }) => {
        getLoopPair(loopScene).forEach((audio) => {
          audio?.removeEventListener('play', handleProgress);
          audio?.removeEventListener('timeupdate', handleProgress);
          audio?.removeEventListener('ratechange', handleProgress);
          audio?.removeEventListener('seeked', handleProgress);
          audio?.removeEventListener('ended', handleEnded);
        });
      });
      allAudio.forEach(pauseMedia);
      sceneTransitionRef.current = null;
    };
  }, [
    applyVolumes,
    clearLoopAnimation,
    clearLoopSchedule,
    finishLoopCrossfade,
    finishSceneTransition,
    getActiveLoopAudio,
    getAllAudio,
    getLoopPair,
    pauseLoopScene,
    playIntendedSources,
    restartEndedLoopSource
  ]);

  useEffect(() => {
    preloadMenuRef.current = preloadMenu;
    const [primaryAudio, standbyAudio] = getLoopPair('menu');
    if (primaryAudio && loopStateRef.current.menu.activeIndex === 0) {
      primaryAudio.preload = preloadMenu ? 'auto' : 'none';
    }
    if (standbyAudio && loopStateRef.current.menu.activeIndex !== 1) {
      standbyAudio.preload = 'none';
    }
  }, [getLoopPair, preloadMenu]);

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
          loopAudioRefs.current.menu[0] = audio;
        }}
        data-audio-role="menu-primary"
        src={soundtrackUrls.menu}
        preload={preloadMenu ? 'auto' : 'none'}
        aria-hidden="true"
        tabIndex={-1}
      />
      <audio
        ref={(audio) => {
          loopAudioRefs.current.menu[1] = audio;
        }}
        data-audio-role="menu-standby"
        src={soundtrackUrls.menu}
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      />
      <audio
        ref={(audio) => {
          loopAudioRefs.current.realm[0] = audio;
        }}
        data-audio-role="realm-primary"
        src={realmPrepared ? soundtrackUrls.realm : undefined}
        preload={realmPrepared ? 'auto' : 'none'}
        aria-hidden="true"
        tabIndex={-1}
      />
      <audio
        ref={(audio) => {
          loopAudioRefs.current.realm[1] = audio;
        }}
        data-audio-role="realm-standby"
        src={realmPrepared ? soundtrackUrls.realm : undefined}
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
});
