import { useEffect, useMemo, useRef } from 'react';

const titleSoundtracks = [
  {
    id: 'theme-a',
    label: 'Title theme I',
    src: `${import.meta.env.BASE_URL}audio/warpkeep-title-theme-a.mp3`
  },
  {
    id: 'theme-b',
    label: 'Title theme II',
    src: `${import.meta.env.BASE_URL}audio/warpkeep-title-theme-b.mp3`
  }
] as const;

const titleSoundtrackVolume = 0.58;
const playbackGestureEvents = ['pointerdown', 'pointerup', 'click', 'touchstart', 'keydown'] as const;

function randomTrackIndex() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % titleSoundtracks.length;
  }

  return Math.floor(Math.random() * titleSoundtracks.length);
}

export function WarpkeepTitleSoundtrack() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const track = useMemo(() => titleSoundtracks[randomTrackIndex()], []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    let disposed = false;

    const configureAudio = () => {
      audio.autoplay = true;
      audio.loop = true;
      audio.muted = false;
      audio.volume = titleSoundtrackVolume;
      audio.preload = 'auto';
    };

    const removeGestureListeners = () => {
      playbackGestureEvents.forEach((eventName) => {
        window.removeEventListener(eventName, playAfterGesture, true);
      });
    };

    const addGestureListeners = () => {
      playbackGestureEvents.forEach((eventName) => {
        window.addEventListener(eventName, playAfterGesture, {
          capture: true,
          passive: true
        });
      });
    };

    const startPlayback = async () => {
      if (disposed || audio.error) {
        return;
      }

      configureAudio();

      try {
        await audio.play();
        if (!audio.paused) {
          removeGestureListeners();
        }
      } catch {
        // Browsers usually block audible autoplay until the first user gesture.
        // Keep sound enabled and retry from any click/tap/key without exposing a UI button.
      }
    };

    function playAfterGesture() {
      void startPlayback();
    }

    const startWhenReady = () => {
      void startPlayback();
    };

    const resumeWhenVisible = () => {
      if (!document.hidden && audio.paused) {
        void startPlayback();
      }
    };

    configureAudio();
    addGestureListeners();
    audio.addEventListener('canplay', startWhenReady);
    audio.addEventListener('play', removeGestureListeners);
    document.addEventListener('visibilitychange', resumeWhenVisible);

    void startPlayback();

    return () => {
      disposed = true;
      removeGestureListeners();
      audio.removeEventListener('canplay', startWhenReady);
      audio.removeEventListener('play', removeGestureListeners);
      document.removeEventListener('visibilitychange', resumeWhenVisible);
      audio.pause();
    };
  }, [track.src]);

  return (
    <audio
      ref={audioRef}
      className="warpkeep-title-audio"
      data-sound-default="on"
      data-track={track.id}
      src={track.src}
      loop
      autoPlay
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
