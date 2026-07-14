import * as THREE from 'three';

import type { GraphicsQualityTier } from '../../settings/graphicsPreference';
import {
  disposeObject3DResources,
  loadWarpkeepTitle,
  resolveWarpkeepTitleModel,
  WARPKEEP_TITLE_LAYOUT,
  type LoadedWarpkeepTitle
} from './loadWarpkeepTitle';
import {
  createTitleMaterialReveal,
  type TitleMaterialReveal
} from './titleMaterialReveal';
import {
  createTitlePresentationState,
  titlePrimaryTimeoutMs,
  titleTransitionProgress,
  transitionTitlePresentation,
  type TitlePresentationEvent,
  type TitlePresentationState
} from './titlePresentationMachine';

export type TitleFallbackAssembly = Readonly<{
  group: THREE.Group;
  safeWidth: number;
}>;

type RenderableTitle = Readonly<{
  group: THREE.Group;
  safeWidth: number;
  reveal: TitleMaterialReveal;
}>;

export type TitlePresentationController = Readonly<{
  stage: THREE.Group;
  getSafeWidth: () => number;
  getState: () => TitlePresentationState;
  setQuality: (quality: GraphicsQualityTier) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  update: (now: number) => boolean;
  dispose: () => void;
}>;

export type CreateTitlePresentationControllerOptions = Readonly<{
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: Pick<THREE.WebGLRenderer, 'compile'>;
  baseUrl: string;
  initialQuality: GraphicsQualityTier;
  reducedMotion: boolean;
  createFallback: () => TitleFallbackAssembly;
  onNeedsRender?: () => void;
  onStateChange?: (state: TitlePresentationState) => void;
  now?: () => number;
  loadTitle?: typeof loadWarpkeepTitle;
}>;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function asRenderable(assembly: LoadedWarpkeepTitle | TitleFallbackAssembly): RenderableTitle {
  const reveal = createTitleMaterialReveal(assembly.group);
  reveal.setOpacity(0);
  return { ...assembly, reveal };
}

export function createTitlePresentationController({
  scene,
  camera,
  renderer,
  baseUrl,
  initialQuality,
  reducedMotion,
  createFallback,
  onNeedsRender = () => undefined,
  onStateChange = () => undefined,
  now = () => performance.now(),
  loadTitle = loadWarpkeepTitle
}: CreateTitlePresentationControllerOptions): TitlePresentationController {
  const stage = new THREE.Group();
  stage.name = 'warpkeep-title-stage';
  stage.position.set(...WARPKEEP_TITLE_LAYOUT.anchor);
  scene.add(stage);

  const initialProfile = resolveWarpkeepTitleModel(baseUrl, initialQuality).profile;
  let state = createTitlePresentationState(initialProfile, now(), reducedMotion);
  let active: RenderableTitle | null = null;
  let candidate: RenderableTitle | null = null;
  let safeWidth: number = WARPKEEP_TITLE_LAYOUT.safeWidth;
  let requestSequence = state.requestId;
  let requestController: AbortController | null = null;
  let minimumTimer = 0;
  let deadlineTimer = 0;
  let replacementTimer = 0;
  let disposed = false;
  const discardedGroups = new WeakSet<THREE.Object3D>();

  const notify = () => {
    onStateChange(state);
    onNeedsRender();
  };

  const clearTimer = (timer: number) => {
    if (timer) window.clearTimeout(timer);
  };

  const discard = (renderable: RenderableTitle | null) => {
    if (!renderable || discardedGroups.has(renderable.group)) return;
    discardedGroups.add(renderable.group);
    stage.remove(renderable.group);
    disposeObject3DResources(renderable.group);
  };

  const discardCandidate = () => {
    const previous = candidate;
    candidate = null;
    discard(previous);
  };

  const setState = (next: TitlePresentationState) => {
    if (next === state) return false;
    state = next;
    notify();
    return true;
  };

  let startFallback = () => undefined;

  const dispatch = (event: TitlePresentationEvent) => {
    const previousPhase = state.phase;
    const changed = setState(transitionTitlePresentation(state, event));
    if (
      changed
      && state.phase === 'fallback-compiling'
      && previousPhase !== 'fallback-compiling'
    ) {
      startFallback();
    }
    return changed;
  };

  const schedulePrimaryDeadline = () => {
    clearTimer(deadlineTimer);
    const delay = Math.max(0, state.primaryDeadlineAt - now());
    deadlineTimer = window.setTimeout(() => {
      deadlineTimer = 0;
      dispatch({ type: 'primary-timeout', now: now() });
    }, delay);
  };

  const scheduleReplacementDeadline = (
    requestId: number,
    quality: GraphicsQualityTier
  ) => {
    clearTimer(replacementTimer);
    const profile = resolveWarpkeepTitleModel(baseUrl, quality).profile;
    replacementTimer = window.setTimeout(() => {
      replacementTimer = 0;
      requestController?.abort();
      requestController = null;
      discardCandidate();
      dispatch({
        type: 'replacement-timeout',
        requestId,
        reason: 'The replacement title model exceeded its bounded startup deadline.'
      });
    }, titlePrimaryTimeoutMs(profile));
  };

  const finishCandidateCompile = (renderable: RenderableTitle, requestId: number) => {
    const next = transitionTitlePresentation(state, {
      type: 'model-compiled',
      requestId,
      now: now()
    });
    if (next === state) {
      if (candidate === renderable) candidate = null;
      discard(renderable);
      return;
    }

    if (next.phase === 'model-revealing') {
      clearTimer(deadlineTimer);
      clearTimer(minimumTimer);
      deadlineTimer = 0;
      minimumTimer = 0;
      active = renderable;
      candidate = null;
      safeWidth = renderable.safeWidth;
    } else if (next.phase === 'replacement-crossfading') {
      clearTimer(replacementTimer);
      replacementTimer = 0;
    }
    setState(next);
  };

  const startRequest = (quality: GraphicsQualityTier, requestId: number) => {
    requestController?.abort();
    requestController = new AbortController();
    const controller = requestController;
    discardCandidate();

    void loadTitle({
      baseUrl,
      quality,
      targetHeight: WARPKEEP_TITLE_LAYOUT.visualHeight,
      signal: controller.signal
    }).then((loaded) => {
      if (
        disposed
        || controller.signal.aborted
        || state.requestId !== requestId
        || state.fallbackLocked
      ) {
        disposeObject3DResources(loaded.group);
        return;
      }

      const loadedState = transitionTitlePresentation(state, {
        type: 'model-loaded',
        requestId
      });
      if (loadedState === state) {
        disposeObject3DResources(loaded.group);
        return;
      }
      setState(loadedState);

      const renderable = asRenderable(loaded);
      candidate = renderable;
      stage.add(renderable.group);
      onNeedsRender();

      try {
        renderer.compile(scene, camera);
        if (
          disposed
          || controller.signal.aborted
          || candidate !== renderable
          || state.requestId !== requestId
          || state.fallbackLocked
        ) {
          if (candidate === renderable) candidate = null;
          discard(renderable);
          return;
        }
        finishCandidateCompile(renderable, requestId);
      } catch (error) {
        if (candidate === renderable) candidate = null;
        discard(renderable);
        if (disposed || controller.signal.aborted || state.requestId !== requestId) return;
        dispatch({
          type: 'model-failed',
          requestId,
          now: now(),
          reason: errorMessage(error, 'The title model could not be prepared for rendering.')
        });
      }
    }).catch((error: unknown) => {
      if (
        disposed
        || controller.signal.aborted
        || isAbortError(error)
        || state.requestId !== requestId
      ) return;
      dispatch({
        type: 'model-failed',
        requestId,
        now: now(),
        reason: errorMessage(error, 'The title model could not be loaded.')
      });
    }).finally(() => {
      if (requestController === controller) requestController = null;
    });
  };

  startFallback = () => {
    requestController?.abort();
    requestController = null;
    clearTimer(deadlineTimer);
    clearTimer(replacementTimer);
    deadlineTimer = 0;
    replacementTimer = 0;
    discardCandidate();

    let renderable: RenderableTitle;
    try {
      renderable = asRenderable(createFallback());
      active = renderable;
      safeWidth = renderable.safeWidth;
      stage.add(renderable.group);
    } catch (error) {
      dispatch({
        type: 'fallback-create-failed',
        reason: errorMessage(error, 'The fallback title could not be created.')
      });
      return;
    }

    try {
      renderer.compile(scene, camera);
      if (disposed || active !== renderable || state.phase !== 'fallback-compiling') return;
      dispatch({ type: 'fallback-compiled', now: now() });
    } catch (error: unknown) {
      if (disposed || active !== renderable || state.phase !== 'fallback-compiling') return;
      renderable.reveal.restore();
      dispatch({
        type: 'fallback-compile-failed',
        reason: errorMessage(error, 'The fallback title could not be prepared for rendering.')
      });
    }
  };

  minimumTimer = window.setTimeout(() => {
    minimumTimer = 0;
    dispatch({ type: 'minimum-elapsed', now: now() });
  }, Math.max(0, state.minimumFallbackAt - now()));
  schedulePrimaryDeadline();
  onStateChange(state);
  startRequest(initialQuality, state.requestId);

  return {
    stage,
    getSafeWidth: () => safeWidth,
    getState: () => state,
    setQuality: (quality) => {
      if (disposed) return;
      const requestId = ++requestSequence;
      const previous = state;
      const next = transitionTitlePresentation(state, {
        type: 'quality-requested',
        requestId,
        profile: resolveWarpkeepTitleModel(baseUrl, quality).profile
      });
      if (next === state) return;
      setState(next);

      if (state.phase === 'model-ready' && previous.candidateProfile) {
        requestController?.abort();
        requestController = null;
        clearTimer(replacementTimer);
        replacementTimer = 0;
        active?.reveal.restore();
        discardCandidate();
        onNeedsRender();
        return;
      }

      if (state.phase !== 'replacement-loading' && state.phase !== 'model-loading') {
        return;
      }
      if (state.phase === 'replacement-loading') {
        active?.reveal.restore();
      }
      startRequest(quality, requestId);
      if (state.phase === 'replacement-loading') {
        scheduleReplacementDeadline(requestId, quality);
      } else {
        schedulePrimaryDeadline();
      }
    },
    setReducedMotion: (nextReducedMotion) => {
      if (disposed || state.reducedMotion === nextReducedMotion) return;
      dispatch({
        type: 'reduced-motion-changed',
        reducedMotion: nextReducedMotion,
        now: now()
      });
    },
    update: (frameNow) => {
      if (disposed) return false;
      if (state.phase === 'model-revealing' || state.phase === 'fallback-revealing') {
        const progress = titleTransitionProgress(state, frameNow);
        active?.reveal.setOpacity(progress);
        if (progress >= 1) {
          active?.reveal.restore();
          dispatch({ type: 'transition-finished' });
          return false;
        }
        return true;
      }
      if (state.phase === 'replacement-crossfading' && active && candidate) {
        const progress = titleTransitionProgress(state, frameNow);
        active.reveal.setOpacity(1 - progress);
        candidate.reveal.setOpacity(progress);
        if (progress >= 1) {
          const previous = active;
          candidate.reveal.restore();
          active = candidate;
          candidate = null;
          safeWidth = active.safeWidth;
          stage.remove(previous.group);
          disposeObject3DResources(previous.group);
          dispatch({ type: 'transition-finished' });
          return false;
        }
        return true;
      }
      return false;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      requestController?.abort();
      requestController = null;
      clearTimer(minimumTimer);
      clearTimer(deadlineTimer);
      clearTimer(replacementTimer);
      minimumTimer = 0;
      deadlineTimer = 0;
      replacementTimer = 0;
      state = transitionTitlePresentation(state, { type: 'dispose' });
      const previousActive = active;
      active = null;
      const previousCandidate = candidate;
      candidate = null;
      discard(previousActive);
      discard(previousCandidate);
      scene.remove(stage);
      onStateChange(state);
    }
  };
}
