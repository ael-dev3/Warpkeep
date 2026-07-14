import { StrictMode, createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WARPKEEP_AUDIO_LEVELS,
  WARPKEEP_AUDIO_TRANSITION_MS,
  WARPKEEP_MENU_LOOP,
  WARPKEEP_MENU_TO_REALM_TRANSITION_MS,
  WARPKEEP_REALM_LOOP,
  WARPKEEP_REALM_TO_MENU_TRANSITION_MS,
  WarpkeepAudioDirector,
  clampUnit,
  getEqualPowerGains,
  getLoopSchedule,
  getMenuLoopSchedule,
  getRealmLoopSchedule,
  getOtherSource,
  getOtherMenuSource,
  getScenePlaybackPlan,
  getSceneTransitionDuration,
  type WarpkeepAudioDirectorHandle
} from '../src/components/audio';

const pausedMedia = new WeakMap<HTMLMediaElement, boolean>();
let animationFrameCallbacks: FrameRequestCallback[];

function getAudio(container: HTMLElement, role: string) {
  return container.querySelector<HTMLAudioElement>(`audio[data-audio-role="${role}"]`)!;
}

beforeEach(() => {
  animationFrameCallbacks = [];
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    return pausedMedia.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    pausedMedia.set(this, false);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    pausedMedia.set(this, true);
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    animationFrameCallbacks.push(callback);
    return animationFrameCallbacks.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('audio director helpers', () => {
  it('keeps the experience crossfade inside the requested 1.4–2.0 second window', () => {
    expect(WARPKEEP_AUDIO_TRANSITION_MS).toBeGreaterThanOrEqual(1_400);
    expect(WARPKEEP_AUDIO_TRANSITION_MS).toBeLessThanOrEqual(2_000);
    expect(WARPKEEP_AUDIO_LEVELS).toEqual({ title: 0.58, menu: 0.48, realm: 0.37 });
    expect(getSceneTransitionDuration('title', 'menu')).toBe(WARPKEEP_AUDIO_TRANSITION_MS);
    expect(getSceneTransitionDuration('menu', 'realm')).toBe(
      WARPKEEP_MENU_TO_REALM_TRANSITION_MS
    );
    expect(getSceneTransitionDuration('realm', 'menu')).toBe(
      WARPKEEP_REALM_TO_MENU_TRANSITION_MS
    );
  });

  it('clamps unsafe values and produces equal-power crossfade gains', () => {
    expect(clampUnit(-4)).toBe(0);
    expect(clampUnit(0.4)).toBe(0.4);
    expect(clampUnit(8)).toBe(1);
    expect(clampUnit(Number.NaN)).toBe(0);
    expect(clampUnit(Number.POSITIVE_INFINITY)).toBe(1);

    expect(getEqualPowerGains(0)).toEqual({ incoming: 0, outgoing: 1 });
    const midpoint = getEqualPowerGains(0.5);
    expect(midpoint.incoming).toBeCloseTo(Math.SQRT1_2, 8);
    expect(midpoint.outgoing).toBeCloseTo(Math.SQRT1_2, 8);
    expect(midpoint.incoming ** 2 + midpoint.outgoing ** 2).toBeCloseTo(1, 8);
    expect(getEqualPowerGains(1).incoming).toBe(1);
    expect(getEqualPowerGains(1).outgoing).toBeCloseTo(0, 8);
  });

  it('schedules the measured 400.128s → 401.920s menu overlap without a paused loop', () => {
    expect(WARPKEEP_MENU_LOOP).toEqual({
      crossfadeStartSeconds: 400.128,
      endSeconds: 401.92,
      overlapSeconds: 1.792
    });

    expect(getMenuLoopSchedule(100, true)).toEqual({
      crossfadeProgress: 0,
      delayMs: null,
      shouldCrossfadeNow: false
    });
    expect(getMenuLoopSchedule(399.128, false)).toEqual({
      crossfadeProgress: 0,
      delayMs: 1_000,
      shouldCrossfadeNow: false
    });
    expect(getMenuLoopSchedule(399.128, false, 2).delayMs).toBe(500);

    const midpoint = getMenuLoopSchedule(401.024, false);
    expect(midpoint.shouldCrossfadeNow).toBe(true);
    expect(midpoint.delayMs).toBe(0);
    expect(midpoint.crossfadeProgress).toBeCloseTo(0.5, 8);
    expect(getMenuLoopSchedule(401.92, false).crossfadeProgress).toBe(1);
    expect(getOtherSource(0)).toBe(1);
    expect(getOtherSource(1)).toBe(0);
    expect(getOtherMenuSource(0)).toBe(1);
    expect(getOtherMenuSource(1)).toBe(0);
  });

  it('uses the documented Lowlands overlap and exposes it through generic scheduling', () => {
    expect(WARPKEEP_REALM_LOOP).toEqual({
      crossfadeStartSeconds: 236,
      endSeconds: 244.919979,
      overlapSeconds: 8.919979
    });

    const midpoint = getRealmLoopSchedule(
      WARPKEEP_REALM_LOOP.crossfadeStartSeconds + WARPKEEP_REALM_LOOP.overlapSeconds / 2,
      false
    );
    expect(midpoint.shouldCrossfadeNow).toBe(true);
    expect(midpoint.crossfadeProgress).toBeCloseTo(0.5, 8);
    expect(
      getLoopSchedule(WARPKEEP_REALM_LOOP, WARPKEEP_REALM_LOOP.crossfadeStartSeconds - 1, false)
    ).toEqual({
      crossfadeProgress: 0,
      delayMs: 1_000,
      shouldCrossfadeNow: false
    });
  });

  it('makes hidden and inactive playback decisions explicit', () => {
    expect(getScenePlaybackPlan('title', false)).toEqual({
      title: true,
      menu: false,
      realm: false
    });
    expect(getScenePlaybackPlan('menu', false)).toEqual({
      title: false,
      menu: true,
      realm: false
    });
    expect(getScenePlaybackPlan('realm', false)).toEqual({
      title: false,
      menu: false,
      realm: true
    });
    expect(getScenePlaybackPlan('menu', true)).toEqual({
      title: false,
      menu: false,
      realm: false
    });
  });
});

describe('WarpkeepAudioDirector', () => {
  it('retains one random title theme, caches the menu pair, and keeps the realm pair source-free', () => {
    const { container } = render(<WarpkeepAudioDirector />);
    const title = getAudio(container, 'title');
    const primary = getAudio(container, 'menu-primary');
    const standby = getAudio(container, 'menu-standby');
    const realmPrimary = getAudio(container, 'realm-primary');
    const realmStandby = getAudio(container, 'realm-standby');

    expect(container.querySelectorAll('audio')).toHaveLength(5);
    expect(title.src).toMatch(/\/audio\/warpkeep-title-theme-[ab]\.mp3$/);
    expect(title.dataset.track).toMatch(/^theme-[ab]$/);
    expect(title.loop).toBe(true);
    expect(primary.src).toMatch(/\/audio\/warpkeep-menu-theme\.mp3$/);
    expect(standby.src).toBe(primary.src);
    expect(primary.loop).toBe(false);
    expect(standby.loop).toBe(false);
    expect(title.preload).toBe('auto');
    expect(primary.preload).toBe('auto');
    expect(standby.preload).toBe('none');
    expect(realmPrimary.getAttribute('src')).toBeNull();
    expect(realmStandby.getAttribute('src')).toBeNull();
    expect(realmPrimary.preload).toBe('none');
    expect(realmStandby.preload).toBe('none');
  });

  it('preloads only the primary menu source until the standby is needed', () => {
    const { container, rerender } = render(
      <WarpkeepAudioDirector preloadMenu={false} />
    );
    const title = getAudio(container, 'title');
    const primary = getAudio(container, 'menu-primary');
    const standby = getAudio(container, 'menu-standby');

    expect(title.preload).toBe('auto');
    expect(primary.preload).toBe('none');
    expect(standby.preload).toBe('none');

    rerender(<WarpkeepAudioDirector preloadMenu />);
    expect(primary.preload).toBe('auto');
    expect(standby.preload).toBe('none');
  });

  it('defers both menu sources without delaying the title track', () => {
    const { container } = render(<WarpkeepAudioDirector preloadMenu={false} />);
    const title = getAudio(container, 'title');
    const primary = getAudio(container, 'menu-primary');
    const standby = getAudio(container, 'menu-standby');

    expect(title.preload).toBe('auto');
    expect(primary.preload).toBe('none');
    expect(standby.preload).toBe('none');
  });

  it('keeps title audio source-free on a direct menu route until title is requested', () => {
    const directorRef = createRef<WarpkeepAudioDirectorHandle>();
    const { container } = render(
      <WarpkeepAudioDirector ref={directorRef} scene="menu" />
    );
    const title = getAudio(container, 'title');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);

    expect(title.getAttribute('src')).toBeNull();
    expect(title.preload).toBe('none');
    expect(playSpy.mock.instances).not.toContain(title);

    playSpy.mockClear();
    act(() => directorRef.current?.transitionTo('title'));
    expect(title.src).toMatch(/\/audio\/warpkeep-title-theme-[ab]\.mp3$/);
    expect(title.preload).toBe('auto');
    expect(playSpy.mock.instances).toContain(title);
  });

  it('does not attach or request Lowlands until an explicit realm preparation gesture', () => {
    const directorRef = createRef<WarpkeepAudioDirectorHandle>();
    const { container, rerender } = render(
      <WarpkeepAudioDirector ref={directorRef} scene="realm" />
    );
    const realmPrimary = getAudio(container, 'realm-primary');
    const realmStandby = getAudio(container, 'realm-standby');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);

    expect(realmPrimary.getAttribute('src')).toBeNull();
    expect(realmStandby.getAttribute('src')).toBeNull();
    expect(playSpy.mock.instances).not.toContain(realmPrimary);

    act(() => directorRef.current?.prepareScene('realm'));
    expect(realmPrimary.src).toMatch(/\/audio\/warpkeep-lowlands-theme\.mp3$/);
    expect(realmStandby.src).toBe(realmPrimary.src);
    expect(realmPrimary.preload).toBe('auto');
    expect(realmStandby.preload).toBe('none');

    // A declarative realm scene starts only after the explicit preparation,
    // preserving the no-anonymous-request contract for direct routing.
    rerender(<WarpkeepAudioDirector ref={directorRef} scene="realm" />);
    act(() => directorRef.current?.ensurePlaybackFromGesture());
    expect(playSpy.mock.instances).toContain(realmPrimary);
  });

  it('crossfades from the retained menu position into Lowlands and back', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const directorRef = createRef<WarpkeepAudioDirectorHandle>();
    const { container } = render(<WarpkeepAudioDirector ref={directorRef} scene="menu" />);
    const menu = getAudio(container, 'menu-primary');
    const realm = getAudio(container, 'realm-primary');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);

    menu.currentTime = 128.5;
    act(() => directorRef.current?.prepareScene('realm'));
    playSpy.mockClear();
    act(() => directorRef.current?.transitionTo('realm'));
    expect(playSpy.mock.instances).toContain(realm);

    const intoRealmMidpoint = animationFrameCallbacks.shift()!;
    act(() => intoRealmMidpoint(2_150));
    expect(menu.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.menu * Math.SQRT1_2, 5);
    expect(realm.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.realm * Math.SQRT1_2, 5);

    const intoRealmFinal = animationFrameCallbacks.shift()!;
    act(() => intoRealmFinal(3_300));
    expect(menu.paused).toBe(true);
    expect(menu.currentTime).toBe(128.5);
    expect(realm.volume).toBe(WARPKEEP_AUDIO_LEVELS.realm);

    vi.spyOn(performance, 'now').mockReturnValue(4_000);
    playSpy.mockClear();
    act(() => directorRef.current?.transitionTo('menu'));
    expect(playSpy.mock.instances).toContain(menu);
    expect(menu.currentTime).toBe(128.5);

    const backToMenuMidpoint = animationFrameCallbacks.shift()!;
    act(() => backToMenuMidpoint(4_950));
    expect(menu.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.menu * Math.SQRT1_2, 5);
    expect(realm.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.realm * Math.SQRT1_2, 5);
  });

  it('resets an already prepared realm pair without creating a source on anonymous pages', () => {
    const directorRef = createRef<WarpkeepAudioDirectorHandle>();
    const { container } = render(<WarpkeepAudioDirector ref={directorRef} />);
    const realmPrimary = getAudio(container, 'realm-primary');
    const realmStandby = getAudio(container, 'realm-standby');

    act(() => directorRef.current?.resetScene());
    expect(realmPrimary.getAttribute('src')).toBeNull();
    expect(realmStandby.getAttribute('src')).toBeNull();

    act(() => directorRef.current?.prepareScene('realm'));
    realmPrimary.currentTime = 72;
    realmStandby.currentTime = 4;
    act(() => directorRef.current?.resetScene('realm'));
    expect(realmPrimary.currentTime).toBe(0);
    expect(realmStandby.currentTime).toBe(0);
    expect(realmPrimary.preload).toBe('auto');
    expect(realmStandby.preload).toBe('none');
  });

  it('starts the menu source synchronously and equal-power fades before pausing title', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const directorRef = createRef<WarpkeepAudioDirectorHandle>();
    const { container } = render(<WarpkeepAudioDirector ref={directorRef} />);
    const title = getAudio(container, 'title');
    const menu = getAudio(container, 'menu-primary');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);
    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause);

    title.currentTime = 43.25;
    playSpy.mockClear();
    act(() => directorRef.current?.transitionTo('menu'));
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy.mock.instances[0]).toBe(menu);
    expect(menu.currentTime).toBe(0);

    const midpointFrame = animationFrameCallbacks.shift()!;
    act(() => midpointFrame(1_850));
    expect(title.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.title * Math.SQRT1_2, 5);
    expect(menu.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.menu * Math.SQRT1_2, 5);

    const finalFrame = animationFrameCallbacks.shift()!;
    act(() => finalFrame(2_700));
    expect(title.volume).toBe(0);
    expect(menu.volume).toBe(WARPKEEP_AUDIO_LEVELS.menu);
    expect(pauseSpy.mock.instances).toContain(title);

    vi.spyOn(performance, 'now').mockReturnValue(3_000);
    playSpy.mockClear();
    act(() => directorRef.current?.transitionTo('title'));
    expect(playSpy.mock.instances).toContain(title);
    expect(title.currentTime).toBe(43.25);
  });

  it('also follows declarative scene changes', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const { container, rerender } = render(<WarpkeepAudioDirector scene="title" />);
    const title = getAudio(container, 'title');
    const menu = getAudio(container, 'menu-primary');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);

    playSpy.mockClear();
    rerender(<WarpkeepAudioDirector scene="menu" />);
    expect(playSpy.mock.instances).toContain(menu);

    playSpy.mockClear();
    rerender(<WarpkeepAudioDirector scene="title" />);
    expect(playSpy.mock.instances).toContain(title);
  });

  it('crossfades between two cached menu elements at the measured loop point', () => {
    const { container } = render(<WarpkeepAudioDirector scene="menu" />);
    const primary = getAudio(container, 'menu-primary');
    const standby = getAudio(container, 'menu-standby');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);
    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause);

    playSpy.mockClear();
    primary.currentTime = WARPKEEP_MENU_LOOP.crossfadeStartSeconds;
    fireEvent.timeUpdate(primary);
    expect(playSpy.mock.instances).toContain(standby);
    expect(standby.currentTime).toBe(0);
    expect(standby.preload).toBe('auto');

    primary.currentTime =
      WARPKEEP_MENU_LOOP.crossfadeStartSeconds + WARPKEEP_MENU_LOOP.overlapSeconds / 2;
    const midpointFrame = animationFrameCallbacks.shift()!;
    act(() => midpointFrame(1));
    expect(primary.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.menu * Math.SQRT1_2, 5);
    expect(standby.volume).toBeCloseTo(WARPKEEP_AUDIO_LEVELS.menu * Math.SQRT1_2, 5);

    primary.currentTime = WARPKEEP_MENU_LOOP.endSeconds;
    const finalFrame = animationFrameCallbacks.shift()!;
    act(() => finalFrame(2));
    expect(pauseSpy.mock.instances).toContain(primary);
    expect(primary.currentTime).toBe(0);
    expect(primary.preload).toBe('none');
    expect(standby.preload).toBe('auto');
    expect(standby.volume).toBe(WARPKEEP_AUDIO_LEVELS.menu);
  });

  it('recovers from a rejected standby crossfade when the active source ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { container, unmount } = render(<WarpkeepAudioDirector scene="menu" />);
    const primary = getAudio(container, 'menu-primary');
    const standby = getAudio(container, 'menu-standby');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);
    const cancelAnimationFrameSpy = vi.mocked(window.cancelAnimationFrame);

    playSpy.mockImplementation(function (this: HTMLMediaElement) {
      pausedMedia.set(this, false);
      return this === standby
        ? Promise.reject(new Error('standby playback blocked'))
        : Promise.resolve();
    });
    playSpy.mockClear();
    cancelAnimationFrameSpy.mockClear();

    primary.currentTime = WARPKEEP_MENU_LOOP.crossfadeStartSeconds;
    fireEvent.timeUpdate(primary);
    expect(playSpy.mock.instances).toContain(standby);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
    expect(primary.volume).toBe(WARPKEEP_AUDIO_LEVELS.menu);
    expect(primary.preload).toBe('auto');
    expect(standby.paused).toBe(true);
    expect(standby.preload).toBe('none');

    const scheduledFramesBeforeRecovery = animationFrameCallbacks.length;
    playSpy.mockClear();
    pausedMedia.set(primary, true);
    fireEvent.ended(primary);

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy.mock.instances[0]).toBe(primary);
    expect(primary.currentTime).toBe(0);
    expect(primary.paused).toBe(false);
    expect(standby.paused).toBe(true);
    expect(animationFrameCallbacks).toHaveLength(scheduledFramesBeforeRecovery);

    playSpy.mockClear();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.ended(primary);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('pauses every source while hidden and resumes only the requested scene', () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { container } = render(<WarpkeepAudioDirector scene="menu" />);
    const title = getAudio(container, 'title');
    const primary = getAudio(container, 'menu-primary');
    const standby = getAudio(container, 'menu-standby');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);
    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause);

    pauseSpy.mockClear();
    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    expect(pauseSpy.mock.instances).toEqual(expect.arrayContaining([title, primary, standby]));

    playSpy.mockClear();
    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(playSpy.mock.instances).toContain(primary);
    expect(playSpy.mock.instances).not.toContain(title);
    expect(playSpy.mock.instances).not.toContain(standby);
  });

  it('settles a scene change while hidden and waits for visibility before playing', () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const directorRef = createRef<WarpkeepAudioDirectorHandle>();
    const { container } = render(
      <WarpkeepAudioDirector ref={directorRef} scene="title" />
    );
    const title = getAudio(container, 'title');
    const primary = getAudio(container, 'menu-primary');
    const standby = getAudio(container, 'menu-standby');
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);

    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    playSpy.mockClear();
    const scheduledFramesBeforeTransition = animationFrameCallbacks.length;

    act(() => directorRef.current?.transitionTo('menu'));

    expect(playSpy).not.toHaveBeenCalled();
    expect(title.paused).toBe(true);
    expect(primary.paused).toBe(true);
    expect(standby.paused).toBe(true);
    expect(title.volume).toBe(0);
    expect(primary.volume).toBe(WARPKEEP_AUDIO_LEVELS.menu);
    expect(animationFrameCallbacks).toHaveLength(scheduledFramesBeforeTransition);

    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(playSpy.mock.instances).toContain(primary);
    expect(playSpy.mock.instances).not.toContain(title);
    expect(playSpy.mock.instances).not.toContain(standby);
    expect(primary.preload).toBe('auto');
  });

  it('has one effective gesture retry and removes it during StrictMode cleanup', () => {
    const { unmount } = render(
      <StrictMode>
        <WarpkeepAudioDirector />
      </StrictMode>
    );
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);

    playSpy.mockClear();
    // WeakMap has no clear method; the committed title source was paused by the
    // StrictMode probe cleanup, so the second setup has already resumed it.
    const title = document.querySelector<HTMLAudioElement>('audio[data-audio-role="title"]')!;
    pausedMedia.set(title, true);
    fireEvent.pointerDown(window);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy.mock.instances[0]).toBe(title);

    playSpy.mockClear();
    unmount();
    fireEvent.pointerDown(window);
    expect(playSpy).not.toHaveBeenCalled();
  });
});
