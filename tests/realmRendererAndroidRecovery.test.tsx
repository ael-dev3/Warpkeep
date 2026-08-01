import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sceneState = vi.hoisted(() => ({
  create: vi.fn()
}));

vi.mock('../src/components/realm/createRealmScene', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/realm/createRealmScene')>();
  return { ...actual, createRealmScene: sceneState.create };
});

vi.mock('../src/components/realm/realmMapPresentationHelpers', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/components/realm/realmMapPresentationHelpers')
  >();
  return { ...actual, canUseWebGL: () => true };
});

import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import type { CreateRealmSceneOptions } from '../src/components/realm/createRealmScene';
import {
  REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY
} from '../src/components/realm/realmRendererEmergencyQuality';
import {
  REALM_RENDERER_CONTEXT_RESTORE_TIMEOUT_MS,
  REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS,
  REALM_RENDERER_RECOVERY_WALL_TIMEOUT_MS,
  REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS,
  REALM_RENDERER_STABILITY_WINDOW_MS
} from '../src/components/realm/realmRendererRecovery';
import {
  MiniAppHostProvider,
  type MiniAppBrowserRuntime,
  type MiniAppSdk
} from '../src/farcaster/miniapp';
import {
  WARPKEEP_GRAPHICS_PREFERENCE_KEY,
  type GraphicsPreference
} from '../src/settings/graphicsPreference';
import {
  CANONICAL_TEST_FID,
  createCanonicalGenesisSnapshot
} from './fixtures/canonicalGenesisSnapshot';
import { createReadyResourceState } from './fixtures/resourceState';

const ANDROID_VIEWPORT = Object.freeze({ width: 412, height: 915 });
const ANDROID_CHROME_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 6a) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const FARCASTER_ANDROID_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 6a Build/UQ1A; wv) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 '
  + 'Chrome/126.0.0.0 Mobile Safari/537.36';

type BrowserShape = Readonly<{
  label: string;
  miniApp: boolean;
  userAgent: string;
}>;

const BROWSER_SHAPES: readonly BrowserShape[] = Object.freeze([
  Object.freeze({
    label: 'Android Chrome',
    miniApp: false,
    userAgent: ANDROID_CHROME_USER_AGENT
  }),
  Object.freeze({
    label: 'Farcaster Android WebView',
    miniApp: true,
    userAgent: FARCASTER_ANDROID_WEBVIEW_USER_AGENT
  })
]);

function sceneHandle() {
  const noOp = () => undefined;
  return {
    dispose: vi.fn(),
    setPresentationActive: vi.fn(),
    reconcileLiveGatheringState: vi.fn(),
    getCameraAttestation: vi.fn(() => null),
    restoreCameraAttestation: vi.fn(),
    getWorkerPresentationContinuity: vi.fn(() => null),
    restoreWorkerPresentationContinuity: vi.fn(() => true),
    getSceneBuildSequence: vi.fn(() => 1),
    focusCastle: noOp,
    locateCastle: noOp,
    locateWorker: vi.fn(() => null),
    getWorkerCurrentCoord: vi.fn(() => null),
    locateCell: noOp,
    focusCell: noOp,
    frameFoundingDistrict: noOp,
    focusKeep: noOp,
    recenterKeep: noOp,
    setHovered: noOp,
    setPresentedCastleIds: noOp,
    setSelected: noOp,
    setSelectedCastleId: noOp,
    setSelectedGoldSiteId: noOp,
    setSelectedFoodSiteId: noOp,
    setSelectedWoodSiteId: noOp,
    setSelectedStoneSiteId: noOp,
    setSelectedWorkerId: noOp,
    setSelectedWorkerRouteId: noOp,
    setSelectedWaterCellKey: noOp,
    setHoveredWaterCellKey: noOp,
    setHoveredWorkerId: noOp,
    setComposition: noOp,
    showRealm: noOp
  };
}

function installAndroidBrowserShape(shape: BrowserShape) {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(ANDROID_VIEWPORT.width);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(ANDROID_VIEWPORT.height);
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2.625);
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(shape.userAgent);
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    configurable: true,
    value: 5
  });
}

function miniAppHost() {
  const back = {
    show: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined),
    onback: null as (() => void) | null
  };
  const sdk: MiniAppSdk = {
    isInMiniApp: async () => true,
    context: Promise.resolve({
      user: {
        fid: CANONICAL_TEST_FID,
        username: 'warpkeeper',
        displayName: 'Warp Keeper'
      },
      client: {
        clientFid: 9_150,
        added: true,
        platformType: 'mobile',
        safeAreaInsets: { top: 24, right: 0, bottom: 24, left: 0 }
      },
      features: { haptics: true },
      location: { type: 'launcher' }
    }),
    getCapabilities: async () => ['actions.ready', 'back'],
    actions: {
      ready: vi.fn(async () => undefined)
    },
    back
  };
  const runtime: MiniAppBrowserRuntime = {
    search: () => '?miniApp=true',
    viewport: () => ANDROID_VIEWPORT,
    document,
    getMountedShell: () => document.body,
    waitForAnimationFrame: async () => undefined
  };
  return { runtime, sdk };
}

async function renderAndroidRealm(
  shape: BrowserShape,
  onGraphicsPreferenceChange: (preference: GraphicsPreference) => void,
  onRequestReturn: () => void
) {
  installAndroidBrowserShape(shape);
  const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
  const realm = (
    <RealmMapScreen
      graphicsPreference="balanced"
      identity={{ fid: CANONICAL_TEST_FID, username: 'warpkeeper' }}
      onGraphicsPreferenceChange={onGraphicsPreferenceChange}
      onRequestReturn={onRequestReturn}
      qualityOverride="balanced"
      resolvedGraphicsQuality="balanced"
      resources={createReadyResourceState(CANONICAL_TEST_FID)}
      snapshot={snapshot}
    />
  );

  if (shape.miniApp) {
    const host = miniAppHost();
    render(
      <MiniAppHostProvider
        runtime={host.runtime}
        sdkLoader={async () => host.sdk}
      >
        {realm}
      </MiniAppHostProvider>
    );
  } else {
    render(realm);
  }

  const root = screen.getByRole('main', { name: 'Hegemony realm' });
  await waitFor(() => expect(root.dataset.realmChromeMode).toBe(
    shape.miniApp ? 'miniapp' : 'compact-web'
  ));
  expect(window.navigator.userAgent).toBe(shape.userAgent);
  expect(window.navigator.maxTouchPoints).toBe(5);
  expect(sceneState.create).toHaveBeenCalledOnce();
  return { root, snapshot };
}

function sceneOptions(index: number) {
  return sceneState.create.mock.calls[index]![0] as CreateRealmSceneOptions;
}

function sceneResult(index: number) {
  return sceneState.create.mock.results[index]!.value as ReturnType<typeof sceneHandle>;
}

function loseContext(options: CreateRealmSceneOptions) {
  options.onRendererFailure?.({
    code: 'context-lost',
    retryable: true,
    phase: 'ready',
    message: 'Synthetic Android graphics-context loss.'
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY, 'balanced');
  sceneState.create.mockReset();
  sceneState.create.mockImplementation(() => sceneHandle());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Reflect.deleteProperty(window.navigator, 'maxTouchPoints');
  vi.restoreAllMocks();
});

describe.each(BROWSER_SHAPES)('$label renderer recovery', (shape) => {
  it('bounds a never-ready first scene and never reuses a poisoned canvas', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { root } = await renderAndroidRealm(shape, vi.fn(), vi.fn());
    const firstOptions = sceneOptions(0);
    const firstScene = sceneResult(0);
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererDeadlineKind).toBe('scene-build');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS));
    expect(firstScene.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    const secondOptions = sceneOptions(1);
    const secondScene = sceneResult(1);
    expect(secondOptions.quality.id).toBe('reduced');
    expect(secondOptions.canvas).not.toBe(firstOptions.canvas);
    expect(root.dataset.rendererDeadlineKind).toBe('scene-build');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS));
    expect(secondScene.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(3);
    const thirdOptions = sceneOptions(2);
    const thirdScene = sceneResult(2);
    expect(thirdOptions.quality.id).toBe('reduced');
    expect(thirdOptions.canvas).not.toBe(secondOptions.canvas);
    expect(thirdOptions.canvas).not.toBe(firstOptions.canvas);

    act(() => vi.advanceTimersByTime(REALM_RENDERER_INITIAL_SCENE_TIMEOUT_MS));
    expect(thirdScene.dispose).toHaveBeenCalledOnce();
    expect(root.dataset.rendererState).toBe('static-degraded');
    expect(root.dataset.rendererFailure).toBe('scene-build-timeout');
    expect(screen.getByText('WK-GFX-013')).not.toBeNull();
    expect(screen.getByText(/webgl2=available/)).not.toBeNull();
    expect(root.getAttribute('aria-busy')).toBe('false');
  });

  it('rotates to one fresh reduced renderer before the 2D safety view and ignores late callbacks', async () => {
    const onGraphicsPreferenceChange = vi.fn();
    const onRequestReturn = vi.fn();
    const { root, snapshot } = await renderAndroidRealm(
      shape,
      onGraphicsPreferenceChange,
      onRequestReturn
    );
    const originalOptions = sceneOptions(0);
    const originalScene = sceneResult(0);
    act(() => originalOptions.onCastlesReady?.(snapshot.castles.length));
    expect(root.dataset.rendererState).toBe('ready');

    vi.useFakeTimers();
    act(() => loseContext(originalOptions));
    expect(root.dataset.rendererState).toBe('recovering');
    expect(root.dataset.rendererDeadlineKind).toBe('context-restore');
    expect(window.sessionStorage.getItem(
      REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY
    )).toBe('reduced');

    act(() => originalOptions.onRendererContextRestored?.());
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    const rebuiltOptions = sceneOptions(1);
    const rebuiltScene = sceneResult(1);
    expect(rebuiltOptions.quality.id).toBe('reduced');
    expect(originalScene.dispose).toHaveBeenCalledOnce();
    expect(root.dataset.rendererGeneration).toBe('2');
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererDeadlineKind).toBe('scene-rebuild');
    expect(root.dataset.rendererRequestedQuality).toBe('balanced');
    expect(root.dataset.rendererEmergencyQuality).toBe('reduced');
    expect(root.dataset.rendererEffectiveQuality).toBe('reduced');
    expect(onGraphicsPreferenceChange).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY)).toBe('balanced');

    act(() => {
      originalOptions.onRendererContextRestored?.();
      originalOptions.onCastlesReady?.(snapshot.castles.length);
      loseContext(originalOptions);
    });
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    expect(root.dataset.rendererGeneration).toBe('2');
    expect(root.dataset.rendererState).toBe('loading');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS));
    expect(rebuiltScene.dispose).toHaveBeenCalledOnce();
    expect(root.dataset.realmSceneDisposalCount).toBe('2');
    expect(sceneState.create).toHaveBeenCalledTimes(3);
    const finalRetryOptions = sceneOptions(2);
    const finalRetryScene = sceneResult(2);
    expect(finalRetryOptions.quality.id).toBe('reduced');
    expect(finalRetryOptions.canvas).not.toBe(rebuiltOptions.canvas);
    expect(root.dataset.rendererGeneration).toBe('3');
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererLastFailureCode).toBe('scene-rebuild-timeout');
    expect(root.dataset.rendererDeadlineKind).toBe('scene-rebuild');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(window.localStorage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY)).toBe('balanced');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS));
    expect(finalRetryScene.dispose).toHaveBeenCalledOnce();
    expect(root.dataset.rendererState).toBe('static-degraded');
    expect(root.dataset.rendererFailure).toBe('scene-rebuild-timeout');
    expect(root.dataset.rendererDeadlineKind).toBe('none');
    expect(root.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByText('2D SAFETY VIEW ACTIVE')).not.toBeNull();
    expect(screen.getByText('WK-GFX-005')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Contact @0xael.eth' }).getAttribute('href'))
      .toBe('https://farcaster.xyz/0xael.eth');
    expect(screen.getByRole('button', { name: 'Retry 3D Realm' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(onRequestReturn).toHaveBeenCalledOnce();

    act(() => {
      rebuiltOptions.onCastlesReady?.(snapshot.castles.length);
      rebuiltOptions.onRendererContextRestored?.();
      loseContext(rebuiltOptions);
      vi.advanceTimersByTime(REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS);
    });
    expect(rebuiltScene.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(3);
    expect(root.dataset.rendererGeneration).toBe('3');
    expect(root.dataset.rendererState).toBe('static-degraded');
  });

  it('keeps a lower-tier rebuilt generation ready after its deadline passes', async () => {
    const onGraphicsPreferenceChange = vi.fn();
    const { root, snapshot } = await renderAndroidRealm(
      shape,
      onGraphicsPreferenceChange,
      vi.fn()
    );
    const originalOptions = sceneOptions(0);
    const originalScene = sceneResult(0);
    act(() => originalOptions.onCastlesReady?.(snapshot.castles.length));

    vi.useFakeTimers();
    act(() => {
      loseContext(originalOptions);
      originalOptions.onRendererContextRestored?.();
    });
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    const rebuiltOptions = sceneOptions(1);
    const rebuiltScene = sceneResult(1);
    expect(rebuiltOptions.quality.id).toBe('reduced');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS - 1));
    expect(root.dataset.rendererState).toBe('loading');
    act(() => rebuiltOptions.onCastlesReady?.(snapshot.castles.length));
    expect(root.dataset.rendererState).toBe('ready');
    expect(root.dataset.rendererGeneration).toBe('2');
    expect(root.dataset.rendererDeadlineKind).toBe('none');
    expect(root.getAttribute('aria-busy')).toBe('false');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS * 2));
    expect(root.dataset.rendererState).toBe('ready');
    expect(root.dataset.rendererFailure).toBe('none');
    expect(originalScene.dispose).toHaveBeenCalledOnce();
    expect(rebuiltScene.dispose).not.toHaveBeenCalled();
    expect(onGraphicsPreferenceChange).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(WARPKEEP_GRAPHICS_PREFERENCE_KEY)).toBe('balanced');
    expect(window.sessionStorage.getItem(
      REALM_RENDERER_EMERGENCY_QUALITY_SESSION_KEY
    )).toBe('reduced');

    // A later, independent interruption receives its own bounded budget even
    // though this browser session remains on the reduced safety ceiling.
    expect(root.dataset.rendererRecoveryAttempt).toBe('0');
    act(() => loseContext(rebuiltOptions));
    expect(root.dataset.rendererState).toBe('recovering');
    expect(root.dataset.rendererRecoveryAttempt).toBe('1');
    expect(root.dataset.rendererDeadlineKind).toBe('context-restore');
  });

  it('bounds repeated first-frame crashes and accumulates context diagnostics across canvases', async () => {
    const { root, snapshot } = await renderAndroidRealm(shape, vi.fn(), vi.fn());
    const firstOptions = sceneOptions(0);
    act(() => firstOptions.onCastlesReady?.(snapshot.castles.length));

    vi.useFakeTimers();
    firstOptions.canvas.dataset.realmRendererContextLossCount = '1';
    act(() => loseContext(firstOptions));
    expect(root.dataset.rendererRecoveryAttempt).toBe('1');
    expect(root.dataset.rendererContextLossCount).toBe('1');
    firstOptions.canvas.dataset.realmRendererContextRestoreCount = '1';
    act(() => firstOptions.onRendererContextRestored?.());

    const secondOptions = sceneOptions(1);
    act(() => secondOptions.onCastlesReady?.(snapshot.castles.length));
    expect(root.dataset.rendererState).toBe('ready');
    expect(root.dataset.rendererRecoveryAttempt).toBe('1');

    secondOptions.canvas.dataset.realmRendererContextLossCount = '1';
    act(() => loseContext(secondOptions));
    expect(root.dataset.rendererRecoveryAttempt).toBe('2');
    expect(root.dataset.rendererContextLossCount).toBe('2');
    secondOptions.canvas.dataset.realmRendererContextRestoreCount = '1';
    act(() => secondOptions.onRendererContextRestored?.());

    const thirdOptions = sceneOptions(2);
    act(() => thirdOptions.onCastlesReady?.(snapshot.castles.length));
    expect(root.dataset.rendererState).toBe('ready');
    expect(root.dataset.rendererRecoveryAttempt).toBe('2');
    expect(root.dataset.rendererContextRestoreCount).toBe('2');

    thirdOptions.canvas.dataset.realmRendererContextLossCount = '1';
    act(() => loseContext(thirdOptions));
    expect(sceneState.create).toHaveBeenCalledTimes(3);
    expect(root.dataset.rendererState).toBe('static-degraded');
    expect(root.dataset.rendererFailure).toBe('context-lost');
    expect(root.dataset.rendererContextLossCount).toBe('3');
  });

  it('resets the recovery budget only after a healthy stability window', async () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { root, snapshot } = await renderAndroidRealm(shape, vi.fn(), vi.fn());
    const originalOptions = sceneOptions(0);
    act(() => originalOptions.onCastlesReady?.(snapshot.castles.length));

    vi.useFakeTimers();
    act(() => {
      loseContext(originalOptions);
      originalOptions.onRendererContextRestored?.();
    });
    const rebuiltOptions = sceneOptions(1);
    act(() => rebuiltOptions.onCastlesReady?.(snapshot.castles.length));
    expect(root.dataset.rendererRecoveryAttempt).toBe('1');

    act(() => vi.advanceTimersByTime(6_000));
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(REALM_RENDERER_STABILITY_WINDOW_MS));
    expect(root.dataset.rendererRecoveryAttempt).toBe('1');

    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(REALM_RENDERER_STABILITY_WINDOW_MS - 6_001));
    expect(root.dataset.rendererRecoveryAttempt).toBe('1');
    act(() => vi.advanceTimersByTime(1));
    expect(root.dataset.rendererRecoveryAttempt).toBe('0');
  });

  it('preserves a full visible restore budget after a backgrounded WebView resumes', async () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { root, snapshot } = await renderAndroidRealm(shape, vi.fn(), vi.fn());
    const originalOptions = sceneOptions(0);
    act(() => originalOptions.onCastlesReady?.(snapshot.castles.length));

    vi.useFakeTimers();
    act(() => loseContext(originalOptions));
    expect(root.dataset.rendererState).toBe('recovering');

    act(() => vi.advanceTimersByTime(7_000));
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(30_000));
    expect(root.dataset.rendererState).toBe('recovering');
    expect(sceneState.create).toHaveBeenCalledOnce();

    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(7_999));
    expect(root.dataset.rendererState).toBe('recovering');

    act(() => originalOptions.onRendererContextRestored?.());
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    const rebuiltOptions = sceneOptions(1);
    act(() => rebuiltOptions.onCastlesReady?.(snapshot.castles.length));
    expect(root.dataset.rendererState).toBe('ready');
    expect(root.dataset.rendererDeadlineKind).toBe('none');
  });

  it('leaves an abandoned hidden restore generation at the hard wall deadline', async () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { root, snapshot } = await renderAndroidRealm(shape, vi.fn(), vi.fn());
    const originalOptions = sceneOptions(0);
    const originalScene = sceneResult(0);
    act(() => originalOptions.onCastlesReady?.(snapshot.castles.length));

    vi.useFakeTimers();
    hidden = true;
    act(() => loseContext(originalOptions));
    act(() => vi.advanceTimersByTime(REALM_RENDERER_RECOVERY_WALL_TIMEOUT_MS - 1));
    expect(root.dataset.rendererState).toBe('recovering');
    expect(sceneState.create).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(1));
    expect(originalScene.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererLastFailureCode).toBe('context-restore-timeout');
  });
});

describe('Realm renderer recovery generation arbitration', () => {
  it('retains the restore-listener generation when construction inputs change during context loss', () => {
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const commonProps = {
      graphicsPreference: 'balanced' as const,
      identity: { fid: CANONICAL_TEST_FID, username: 'warpkeeper' },
      onGraphicsPreferenceChange: vi.fn(),
      onRequestReturn: vi.fn(),
      resolvedGraphicsQuality: 'balanced' as const,
      resources: createReadyResourceState(CANONICAL_TEST_FID),
      snapshot
    };
    const { rerender } = render(
      <RealmMapScreen {...commonProps} qualityOverride="balanced" />
    );
    const originalOptions = sceneOptions(0);
    const originalScene = sceneResult(0);
    act(() => originalOptions.onCastlesReady?.(snapshot.castles.length));
    const root = screen.getByRole('main', { name: 'Hegemony realm' });

    vi.useFakeTimers();
    act(() => loseContext(originalOptions));
    rerender(<RealmMapScreen {...commonProps} qualityOverride="high" />);

    expect(sceneState.create).toHaveBeenCalledOnce();
    expect(originalScene.dispose).not.toHaveBeenCalled();
    expect(root.dataset.rendererGeneration).toBe('1');
    expect(root.dataset.rendererState).toBe('recovering');
    expect(root.dataset.rendererDeadlineKind).toBe('context-restore');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_CONTEXT_RESTORE_TIMEOUT_MS));
    expect(originalScene.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    expect(sceneOptions(1).quality.id).toBe('reduced');
    expect(sceneOptions(1).canvas).not.toBe(originalOptions.canvas);
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererLastFailureCode).toBe('context-restore-timeout');
    act(() => sceneOptions(1).onCastlesReady?.(snapshot.castles.length));
    expect(root.dataset.rendererState).toBe('ready');
  });

  it('retires a lost predecessor and its hidden candidate into one lower-tier bounded generation', () => {
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const commonProps = {
      graphicsPreference: 'cinematic' as const,
      identity: { fid: CANONICAL_TEST_FID, username: 'warpkeeper' },
      onGraphicsPreferenceChange: vi.fn(),
      onRequestReturn: vi.fn(),
      resolvedGraphicsQuality: 'cinematic' as const,
      resources: createReadyResourceState(CANONICAL_TEST_FID),
      snapshot
    };
    const { rerender } = render(
      <RealmMapScreen {...commonProps} qualityOverride="high" />
    );
    const predecessorOptions = sceneOptions(0);
    const predecessorScene = sceneResult(0);
    act(() => predecessorOptions.onCastlesReady?.(snapshot.castles.length));

    rerender(<RealmMapScreen {...commonProps} qualityOverride="balanced" />);
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    const hiddenCandidateOptions = sceneOptions(1);
    const hiddenCandidateScene = sceneResult(1);
    const root = screen.getByRole('main', { name: 'Hegemony realm' });
    expect(root.dataset.rendererGeneration).toBe('2');
    expect(root.dataset.rendererState).toBe('loading');

    vi.useFakeTimers();
    act(() => loseContext(predecessorOptions));
    expect(sceneState.create).toHaveBeenCalledTimes(3);
    const recoveryOptions = sceneOptions(2);
    const recoveryScene = sceneResult(2);
    expect(recoveryOptions.quality.id).toBe('reduced');
    expect(predecessorScene.dispose).toHaveBeenCalledOnce();
    expect(hiddenCandidateScene.dispose).toHaveBeenCalledOnce();
    expect(root.dataset.rendererGeneration).toBe('3');
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererDeadlineKind).toBe('scene-rebuild');

    act(() => {
      hiddenCandidateOptions.onRendererFailure?.({
        code: 'scene-build-failed',
        retryable: true,
        phase: 'loading'
      });
      hiddenCandidateOptions.onCastlesReady?.(snapshot.castles.length);
      hiddenCandidateOptions.onRendererContextRestored?.();
    });
    expect(sceneState.create).toHaveBeenCalledTimes(3);
    expect(recoveryScene.dispose).not.toHaveBeenCalled();
    expect(root.dataset.rendererGeneration).toBe('3');
    expect(root.dataset.rendererState).toBe('loading');

    act(() => vi.advanceTimersByTime(REALM_RENDERER_SCENE_REBUILD_TIMEOUT_MS));
    expect(recoveryScene.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(4);
    expect(sceneOptions(3).quality.id).toBe('reduced');
    expect(sceneOptions(3).canvas).not.toBe(recoveryOptions.canvas);
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererLastFailureCode).toBe('scene-rebuild-timeout');
  });

  it('preserves the absolute rebuild deadline across recovery-time construction churn', () => {
    const snapshot = createCanonicalGenesisSnapshot(CANONICAL_TEST_FID);
    const commonProps = {
      graphicsPreference: 'cinematic' as const,
      identity: { fid: CANONICAL_TEST_FID, username: 'warpkeeper' },
      onGraphicsPreferenceChange: vi.fn(),
      onRequestReturn: vi.fn(),
      resolvedGraphicsQuality: 'cinematic' as const,
      resources: createReadyResourceState(CANONICAL_TEST_FID),
      snapshot
    };
    const { rerender } = render(
      <RealmMapScreen {...commonProps} qualityOverride="high" />
    );
    const originalOptions = sceneOptions(0);
    act(() => originalOptions.onCastlesReady?.(snapshot.castles.length));
    const root = screen.getByRole('main', { name: 'Hegemony realm' });

    vi.useFakeTimers();
    act(() => {
      loseContext(originalOptions);
      originalOptions.onRendererContextRestored?.();
    });
    expect(sceneState.create).toHaveBeenCalledTimes(2);
    expect(sceneOptions(1).quality.id).toBe('balanced');
    act(() => vi.advanceTimersByTime(15_000));

    rerender(<RealmMapScreen {...commonProps} qualityOverride="reduced" />);
    expect(sceneState.create).toHaveBeenCalledTimes(3);
    const finalScene = sceneResult(2);
    expect(sceneOptions(2).quality.id).toBe('reduced');
    expect(root.dataset.rendererGeneration).toBe('3');
    expect(root.dataset.rendererDeadlineKind).toBe('scene-rebuild');

    act(() => vi.advanceTimersByTime(4_999));
    expect(root.dataset.rendererState).toBe('loading');
    act(() => vi.advanceTimersByTime(1));
    expect(finalScene.dispose).toHaveBeenCalledOnce();
    expect(sceneState.create).toHaveBeenCalledTimes(4);
    expect(root.dataset.rendererState).toBe('loading');
    expect(root.dataset.rendererLastFailureCode).toBe('scene-rebuild-timeout');
  });
});
