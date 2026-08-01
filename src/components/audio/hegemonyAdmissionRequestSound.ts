export const HEGEMONY_ADMISSION_REQUEST_SOUND_TRIGGER =
  'hegemony-empire-admission.request' as const;

export const HEGEMONY_ADMISSION_REQUEST_SOUND_ASSET =
  'audio/Hegemony_Empire_Admission_Request_Button.mp3' as const;

export const HEGEMONY_ADMISSION_REQUEST_SOUND_LEVEL = 0.52;

export type HegemonyAdmissionRequestSoundTrigger =
  typeof HEGEMONY_ADMISSION_REQUEST_SOUND_TRIGGER;

type HegemonyAdmissionRequestSoundListener = (
  trigger: HegemonyAdmissionRequestSoundTrigger
) => void;

const listeners = new Set<HegemonyAdmissionRequestSoundListener>();

export function subscribeHegemonyAdmissionRequestSound(
  listener: HegemonyAdmissionRequestSoundListener
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Emits on the trusted Request Access click edge. Subscribers must remain
 * synchronous so embedded mobile browsers preserve media-playback authority.
 */
export function emitHegemonyAdmissionRequestSound() {
  for (const listener of listeners) {
    listener(HEGEMONY_ADMISSION_REQUEST_SOUND_TRIGGER);
  }
}

export type HegemonyAdmissionRequestSoundPlayer = Readonly<{
  dispose: () => void;
  play: () => boolean;
  setHidden: (hidden: boolean) => void;
  setMuted: (muted: boolean) => void;
  stop: () => void;
}>;

/**
 * Owns one bounded HTML audio voice. A second request cannot restart or stack
 * the sample while it is active, and lifecycle changes never cause replay.
 */
export function createHegemonyAdmissionRequestSoundPlayer(
  audio: HTMLAudioElement
): HegemonyAdmissionRequestSoundPlayer {
  let active = false;
  let disposed = false;
  let hidden = false;
  let muted = false;
  let generation = 0;

  audio.volume = HEGEMONY_ADMISSION_REQUEST_SOUND_LEVEL;

  const reset = () => {
    const shouldPause = active || !audio.paused;
    generation += 1;
    active = false;
    if (shouldPause) audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // A media element can reject seeking before metadata is available.
    }
  };

  const handleSettled = () => reset();
  audio.addEventListener('ended', handleSettled);
  audio.addEventListener('error', handleSettled);

  return Object.freeze({
    dispose: () => {
      if (disposed) return;
      disposed = true;
      audio.removeEventListener('ended', handleSettled);
      audio.removeEventListener('error', handleSettled);
      reset();
    },
    play: () => {
      if (active || disposed || hidden || muted) return false;
      active = true;
      const attempt = ++generation;
      try {
        audio.currentTime = 0;
        const playback = audio.play();
        void Promise.resolve(playback).catch(() => {
          if (attempt === generation) reset();
        });
        return true;
      } catch {
        if (attempt === generation) reset();
        return false;
      }
    },
    setHidden: (nextHidden) => {
      hidden = nextHidden;
      if (hidden) reset();
    },
    setMuted: (nextMuted) => {
      muted = nextMuted;
      audio.muted = muted;
      if (muted) reset();
    },
    stop: reset
  });
}
