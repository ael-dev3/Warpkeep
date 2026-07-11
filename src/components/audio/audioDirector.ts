export type AudioScene = 'title' | 'menu' | 'realm';

export type AudioLoopScene = Exclude<AudioScene, 'title'>;

export type AudioSourceIndex = 0 | 1;

/** @deprecated Prefer AudioSourceIndex so loop helpers remain scene-agnostic. */
export type MenuSourceIndex = AudioSourceIndex;

export type AudioSourceRole = AudioScene;

export interface EqualPowerGains {
  incoming: number;
  outgoing: number;
}

export interface AudioLoopDefinition {
  crossfadeStartSeconds: number;
  endSeconds: number;
  overlapSeconds: number;
}

export interface AudioLoopSchedule {
  crossfadeProgress: number;
  delayMs: number | null;
  shouldCrossfadeNow: boolean;
}

/** @deprecated Prefer AudioLoopSchedule so loop helpers remain scene-agnostic. */
export type MenuLoopSchedule = AudioLoopSchedule;

export interface ScenePlaybackPlan {
  menu: boolean;
  realm: boolean;
  title: boolean;
}

export type SceneMix = Record<AudioScene, number>;

export const WARPKEEP_AUDIO_LEVELS = Object.freeze({
  menu: 0.48,
  realm: 0.37,
  title: 0.58
});

/** The established title/menu crossfade duration. */
export const WARPKEEP_AUDIO_TRANSITION_MS = 1_700;

export const WARPKEEP_MENU_TO_REALM_TRANSITION_MS = 2_300;

export const WARPKEEP_REALM_TO_MENU_TRANSITION_MS = 1_900;

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
}) satisfies AudioLoopDefinition;

/**
 * Lowlands of Hegemony resolves into near silence at the tail. The measured
 * 8.919979-second overlap closes the loop without a hard restart.
 */
export const WARPKEEP_REALM_LOOP = Object.freeze({
  crossfadeStartSeconds: 236,
  endSeconds: 244.919979,
  overlapSeconds: 8.919979
}) satisfies AudioLoopDefinition;

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

export function getSceneMix(scene: AudioScene): SceneMix {
  return {
    menu: scene === 'menu' ? 1 : 0,
    realm: scene === 'realm' ? 1 : 0,
    title: scene === 'title' ? 1 : 0
  };
}

export function getScenePlaybackPlan(
  scene: AudioScene,
  hidden: boolean
): ScenePlaybackPlan {
  if (hidden) {
    return { menu: false, realm: false, title: false };
  }

  return {
    menu: scene === 'menu',
    realm: scene === 'realm',
    title: scene === 'title'
  };
}

export function getSceneTransitionDuration(
  from: AudioScene,
  to: AudioScene
) {
  if (from === 'menu' && to === 'realm') {
    return WARPKEEP_MENU_TO_REALM_TRANSITION_MS;
  }

  if (from === 'realm' && to === 'menu') {
    return WARPKEEP_REALM_TO_MENU_TRANSITION_MS;
  }

  return WARPKEEP_AUDIO_TRANSITION_MS;
}

export function getLoopSchedule(
  loop: AudioLoopDefinition,
  currentTime: number,
  paused: boolean,
  playbackRate = 1
): AudioLoopSchedule {
  const safeCurrentTime = Math.max(0, Number.isFinite(currentTime) ? currentTime : 0);

  if (paused || playbackRate <= 0 || !Number.isFinite(playbackRate)) {
    return {
      crossfadeProgress: 0,
      delayMs: null,
      shouldCrossfadeNow: false
    };
  }

  const secondsUntilCrossfade = loop.crossfadeStartSeconds - safeCurrentTime;
  const crossfadeProgress = clampUnit(
    (safeCurrentTime - loop.crossfadeStartSeconds) / loop.overlapSeconds
  );

  return {
    crossfadeProgress,
    delayMs: Math.max(0, (secondsUntilCrossfade / playbackRate) * 1_000),
    shouldCrossfadeNow: secondsUntilCrossfade <= 0
  };
}

export function getMenuLoopSchedule(
  currentTime: number,
  paused: boolean,
  playbackRate = 1
) {
  return getLoopSchedule(WARPKEEP_MENU_LOOP, currentTime, paused, playbackRate);
}

export function getRealmLoopSchedule(
  currentTime: number,
  paused: boolean,
  playbackRate = 1
) {
  return getLoopSchedule(WARPKEEP_REALM_LOOP, currentTime, paused, playbackRate);
}

export function getOtherSource(index: AudioSourceIndex): AudioSourceIndex {
  return index === 0 ? 1 : 0;
}

/** @deprecated Prefer getOtherSource so loop helpers remain scene-agnostic. */
export const getOtherMenuSource = getOtherSource;
