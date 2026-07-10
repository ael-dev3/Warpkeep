export type AudioScene = 'title' | 'menu';

export type MenuSourceIndex = 0 | 1;

export type AudioSourceRole = 'title' | 'menu';

export interface EqualPowerGains {
  incoming: number;
  outgoing: number;
}

export interface MenuLoopSchedule {
  crossfadeProgress: number;
  delayMs: number | null;
  shouldCrossfadeNow: boolean;
}

export interface ScenePlaybackPlan {
  menu: boolean;
  title: boolean;
}

export const WARPKEEP_AUDIO_LEVELS = Object.freeze({
  menu: 0.48,
  title: 0.58
});

export const WARPKEEP_AUDIO_TRANSITION_MS = 1_700;

/**
 * The supplied master has a musically compatible head/tail window from
 * 400.128 seconds until 401.920 seconds. Both menu elements use the same URL;
 * the standby element starts at the head while the active element traverses
 * this overlap.
 */
export const WARPKEEP_MENU_LOOP = Object.freeze({
  crossfadeStartSeconds: 400.128,
  endSeconds: 401.92,
  overlapSeconds: 1.792
});

export function clampUnit(value: number) {
  if (!Number.isFinite(value)) {
    return value === Number.POSITIVE_INFINITY ? 1 : 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function getEqualPowerGains(progress: number): EqualPowerGains {
  const phase = clampUnit(progress) * Math.PI * 0.5;

  return {
    incoming: Math.sin(phase),
    outgoing: Math.cos(phase)
  };
}

export function getScenePlaybackPlan(
  scene: AudioScene,
  hidden: boolean
): ScenePlaybackPlan {
  if (hidden) {
    return { menu: false, title: false };
  }

  return {
    menu: scene === 'menu',
    title: scene === 'title'
  };
}

export function getMenuLoopSchedule(
  currentTime: number,
  paused: boolean,
  playbackRate = 1
): MenuLoopSchedule {
  const safeCurrentTime = Math.max(0, Number.isFinite(currentTime) ? currentTime : 0);

  if (paused || playbackRate <= 0 || !Number.isFinite(playbackRate)) {
    return {
      crossfadeProgress: 0,
      delayMs: null,
      shouldCrossfadeNow: false
    };
  }

  const secondsUntilCrossfade = WARPKEEP_MENU_LOOP.crossfadeStartSeconds - safeCurrentTime;
  const crossfadeProgress = clampUnit(
    (safeCurrentTime - WARPKEEP_MENU_LOOP.crossfadeStartSeconds) /
      WARPKEEP_MENU_LOOP.overlapSeconds
  );

  return {
    crossfadeProgress,
    delayMs: Math.max(0, (secondsUntilCrossfade / playbackRate) * 1_000),
    shouldCrossfadeNow: secondsUntilCrossfade <= 0
  };
}

export function getOtherMenuSource(index: MenuSourceIndex): MenuSourceIndex {
  return index === 0 ? 1 : 0;
}
