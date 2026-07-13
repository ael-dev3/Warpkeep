export type WarpkeepTitleModelProfile = 'high' | 'compact';

export const TITLE_FALLBACK_MINIMUM_MS = 10_000;
export const TITLE_COMPACT_TIMEOUT_MS = 16_000;
export const TITLE_HIGH_TIMEOUT_MS = 20_000;
export const TITLE_REVEAL_MS = 800;
export const TITLE_REDUCED_MOTION_REVEAL_MS = 160;

export type TitlePresentationPhase =
  | 'initializing'
  | 'model-loading'
  | 'model-compiling'
  | 'model-revealing'
  | 'model-ready'
  | 'model-failed-waiting'
  | 'fallback-compiling'
  | 'fallback-revealing'
  | 'fallback-ready'
  | 'replacement-loading'
  | 'replacement-compiling'
  | 'replacement-crossfading'
  | 'disposed';

export type TitlePresentationState = Readonly<{
  phase: TitlePresentationPhase;
  mountStartedAt: number;
  minimumFallbackAt: number;
  primaryDeadlineAt: number;
  fallbackEligible: boolean;
  fallbackLocked: boolean;
  requestId: number;
  desiredProfile: WarpkeepTitleModelProfile;
  activeProfile: WarpkeepTitleModelProfile | null;
  candidateProfile: WarpkeepTitleModelProfile | null;
  transitionStartedAt: number | null;
  reducedMotion: boolean;
  failure: string | null;
}>;

export type TitlePresentationEvent =
  | Readonly<{ type: 'minimum-elapsed'; now: number }>
  | Readonly<{ type: 'primary-timeout'; now: number }>
  | Readonly<{ type: 'model-loaded'; requestId: number }>
  | Readonly<{ type: 'model-compiled'; requestId: number; now: number }>
  | Readonly<{ type: 'model-failed'; requestId: number; now: number; reason: string }>
  | Readonly<{
      type: 'quality-requested';
      requestId: number;
      profile: WarpkeepTitleModelProfile;
    }>
  | Readonly<{ type: 'replacement-timeout'; requestId: number; reason: string }>
  | Readonly<{ type: 'fallback-compiled'; now: number }>
  | Readonly<{ type: 'fallback-compile-failed'; reason: string }>
  | Readonly<{ type: 'transition-finished' }>
  | Readonly<{ type: 'reduced-motion-changed'; reducedMotion: boolean }>
  | Readonly<{ type: 'dispose' }>;

export function titlePrimaryTimeoutMs(profile: WarpkeepTitleModelProfile) {
  return profile === 'high' ? TITLE_HIGH_TIMEOUT_MS : TITLE_COMPACT_TIMEOUT_MS;
}

export function titleRevealDurationMs(reducedMotion: boolean) {
  return reducedMotion ? TITLE_REDUCED_MOTION_REVEAL_MS : TITLE_REVEAL_MS;
}

export function createTitlePresentationState(
  profile: WarpkeepTitleModelProfile,
  now: number,
  reducedMotion: boolean,
  requestId = 1
): TitlePresentationState {
  return {
    phase: 'model-loading',
    mountStartedAt: now,
    minimumFallbackAt: now + TITLE_FALLBACK_MINIMUM_MS,
    primaryDeadlineAt: now + titlePrimaryTimeoutMs(profile),
    fallbackEligible: false,
    fallbackLocked: false,
    requestId,
    desiredProfile: profile,
    activeProfile: null,
    candidateProfile: null,
    transitionStartedAt: null,
    reducedMotion,
    failure: null
  };
}

function beginFallback(
  state: TitlePresentationState,
  failure = state.failure
): TitlePresentationState {
  if (state.activeProfile || state.fallbackLocked || state.phase === 'disposed') {
    return state;
  }
  return {
    ...state,
    phase: 'fallback-compiling',
    fallbackEligible: true,
    fallbackLocked: true,
    candidateProfile: null,
    transitionStartedAt: null,
    failure
  };
}

function currentRequest(state: TitlePresentationState, requestId: number) {
  return !state.fallbackLocked && state.requestId === requestId;
}

export function transitionTitlePresentation(
  state: TitlePresentationState,
  event: TitlePresentationEvent
): TitlePresentationState {
  if (state.phase === 'disposed') return state;
  if (event.type === 'dispose') return { ...state, phase: 'disposed' };

  switch (event.type) {
    case 'minimum-elapsed': {
      if (event.now < state.minimumFallbackAt || state.activeProfile || state.fallbackLocked) {
        return state;
      }
      if (state.phase === 'model-failed-waiting') return beginFallback(state);
      return { ...state, fallbackEligible: true };
    }
    case 'primary-timeout': {
      if (event.now < state.primaryDeadlineAt || state.activeProfile) return state;
      if (![
        'model-loading',
        'model-compiling',
        'model-failed-waiting'
      ].includes(state.phase)) return state;
      return beginFallback(state, state.failure ?? 'The title model exceeded its bounded startup deadline.');
    }
    case 'model-loaded': {
      if (!currentRequest(state, event.requestId)) return state;
      if (state.phase === 'model-loading') return { ...state, phase: 'model-compiling' };
      if (state.phase === 'replacement-loading') {
        return { ...state, phase: 'replacement-compiling', candidateProfile: state.desiredProfile };
      }
      return state;
    }
    case 'model-compiled': {
      if (!currentRequest(state, event.requestId)) return state;
      if (state.phase === 'model-compiling') {
        return {
          ...state,
          phase: 'model-revealing',
          activeProfile: state.desiredProfile,
          transitionStartedAt: event.now,
          failure: null
        };
      }
      if (state.phase === 'replacement-compiling') {
        return {
          ...state,
          phase: 'replacement-crossfading',
          candidateProfile: state.desiredProfile,
          transitionStartedAt: event.now,
          failure: null
        };
      }
      return state;
    }
    case 'model-failed': {
      if (!currentRequest(state, event.requestId)) return state;
      if (state.phase === 'replacement-loading' || state.phase === 'replacement-compiling') {
        return {
          ...state,
          phase: 'model-ready',
          candidateProfile: null,
          transitionStartedAt: null,
          failure: event.reason
        };
      }
      if (state.phase !== 'model-loading' && state.phase !== 'model-compiling') return state;
      const failed = { ...state, failure: event.reason };
      return event.now >= state.minimumFallbackAt || state.fallbackEligible
        ? beginFallback(failed, event.reason)
        : { ...failed, phase: 'model-failed-waiting' };
    }
    case 'quality-requested': {
      if (state.fallbackLocked || event.profile === state.activeProfile || event.profile === state.candidateProfile) {
        return state;
      }
      if (state.activeProfile && state.phase === 'model-ready') {
        return {
          ...state,
          phase: 'replacement-loading',
          requestId: event.requestId,
          desiredProfile: event.profile,
          candidateProfile: event.profile,
          transitionStartedAt: null,
          failure: null
        };
      }
      if (!state.activeProfile && [
        'model-loading',
        'model-compiling',
        'model-failed-waiting'
      ].includes(state.phase)) {
        return {
          ...state,
          phase: 'model-loading',
          requestId: event.requestId,
          desiredProfile: event.profile,
          primaryDeadlineAt: state.mountStartedAt + titlePrimaryTimeoutMs(event.profile),
          transitionStartedAt: null,
          failure: null
        };
      }
      return state;
    }
    case 'replacement-timeout': {
      if (
        state.requestId !== event.requestId
        || !state.activeProfile
        || (state.phase !== 'replacement-loading' && state.phase !== 'replacement-compiling')
      ) return state;
      return {
        ...state,
        phase: 'model-ready',
        candidateProfile: null,
        transitionStartedAt: null,
        failure: event.reason
      };
    }
    case 'fallback-compiled': {
      if (state.phase !== 'fallback-compiling') return state;
      return { ...state, phase: 'fallback-revealing', transitionStartedAt: event.now };
    }
    case 'fallback-compile-failed': {
      if (state.phase !== 'fallback-compiling') return state;
      return {
        ...state,
        phase: 'fallback-ready',
        transitionStartedAt: null,
        failure: event.reason
      };
    }
    case 'transition-finished': {
      if (state.phase === 'model-revealing') {
        return { ...state, phase: 'model-ready', transitionStartedAt: null };
      }
      if (state.phase === 'fallback-revealing') {
        return { ...state, phase: 'fallback-ready', transitionStartedAt: null };
      }
      if (state.phase === 'replacement-crossfading' && state.candidateProfile) {
        return {
          ...state,
          phase: 'model-ready',
          activeProfile: state.candidateProfile,
          candidateProfile: null,
          transitionStartedAt: null
        };
      }
      return state;
    }
    case 'reduced-motion-changed':
      return { ...state, reducedMotion: event.reducedMotion };
  }
}

export function titleTransitionProgress(state: TitlePresentationState, now: number) {
  if (state.transitionStartedAt === null) return 1;
  return Math.min(
    1,
    Math.max(0, (now - state.transitionStartedAt) / titleRevealDurationMs(state.reducedMotion))
  );
}
