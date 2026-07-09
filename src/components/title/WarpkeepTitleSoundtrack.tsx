import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

type PlaybackState = 'starting' | 'playing' | 'blocked' | 'paused' | 'error';

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
  const playbackErrorRef = useRef(false);
  const track = useMemo(() => titleSoundtracks[randomTrackIndex()], []);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('starting');

  const startPlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || playbackErrorRef.current) {
      return;
    }

    audio.loop = true;
    audio.muted = false;
    audio.volume = 0.58;
    setSoundEnabled(true);
    setPlaybackState((state) => (state === 'playing' ? 'playing' : 'starting'));

    try {
      await audio.play();
      setPlaybackState('playing');
    } catch {
      setPlaybackState('blocked');
    }
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || playbackState === 'error') {
      return;
    }

    if (playbackState === 'playing') {
      audio.pause();
      setSoundEnabled(false);
      setPlaybackState('paused');
      return;
    }

    void startPlayback();
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    audio.loop = true;
    audio.muted = false;
    audio.volume = 0.58;

    const markPlaying = () => {
      setSoundEnabled(true);
      setPlaybackState('playing');
    };
    const markPaused = () => setPlaybackState((state) => (state === 'playing' ? 'paused' : state));
    const markError = () => {
      playbackErrorRef.current = true;
      setPlaybackState('error');
    };
    const playAfterGesture = () => {
      if (!playbackErrorRef.current && soundEnabled) {
        void startPlayback();
      }
    };

    audio.addEventListener('play', markPlaying);
    audio.addEventListener('pause', markPaused);
    audio.addEventListener('error', markError);
    window.addEventListener('pointerdown', playAfterGesture, { once: true });
    window.addEventListener('keydown', playAfterGesture, { once: true });

    if (soundEnabled) {
      void startPlayback();
    }

    return () => {
      audio.removeEventListener('play', markPlaying);
      audio.removeEventListener('pause', markPaused);
      audio.removeEventListener('error', markError);
      window.removeEventListener('pointerdown', playAfterGesture);
      window.removeEventListener('keydown', playAfterGesture);
      audio.pause();
    };
  }, [soundEnabled, startPlayback]);

  const label = playbackState === 'error' ? 'Sound unavailable' : soundEnabled ? 'Sound on' : 'Sound off';

  return (
    <div className="warpkeep-soundtrack" data-track={track.id} data-playback-state={playbackState}>
      <audio ref={audioRef} src={track.src} loop autoPlay preload="auto" aria-hidden="true" />
      <button
        className="warpkeep-soundtrack-button"
        type="button"
        onClick={togglePlayback}
        disabled={playbackState === 'error'}
        aria-pressed={soundEnabled && playbackState !== 'error'}
        aria-label={
          playbackState === 'blocked'
            ? `Sound on by default. Click or tap to allow playback for ${track.label}`
            : `${label}: ${track.label}`
        }
      >
        <span className="warpkeep-soundtrack-dot" aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
