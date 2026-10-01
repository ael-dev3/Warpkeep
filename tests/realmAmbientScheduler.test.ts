import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRealmAmbientScheduler } from '../src/components/realm/realmAmbientScheduler';

type FrameCallback = FrameRequestCallback;
const managedSchedulers = new Set<ReturnType<typeof createRealmAmbientScheduler>>();

function createManagedScheduler(options: Parameters<typeof createRealmAmbientScheduler>[0]) {
  const scheduler = createRealmAmbientScheduler(options);
  managedSchedulers.add(scheduler);
  return scheduler;
}

function installAnimationFrames() {
  const callbacks = new Map<number, FrameCallback>();
  let nextId = 1;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id);
  });
  const frame = (timestamp: number) => {
    const entry = callbacks.entries().next().value as [number, FrameCallback] | undefined;
    if (!entry) throw new Error('Expected a pending animation frame');
    callbacks.delete(entry[0]);
    entry[1](timestamp);
  };
  const browserFrame = (timestamp: number) => {
    // Browser RAF dispatch snapshots the queue: a render requested by an
    // ambient step belongs to the next frame, not this callback batch.
    for (const [id, callback] of [...callbacks]) {
      if (callbacks.delete(id)) callback(timestamp);
    }
  };
  return { callbacks, request, cancel, frame, browserFrame };
}

describe('Realm ambient scheduler', () => {
  afterEach(() => {
    // Failed regression assertions must still retire their visibility listener
    // before spies are restored and another clock case begins.
    for (const scheduler of managedSchedulers) scheduler.dispose();
    managedSchedulers.clear();
    vi.restoreAllMocks();
  });

  it('aligns to animation frames and caps High presentation at its requested cadence', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const onStep = vi.fn();
    const scheduler = createRealmAmbientScheduler({ frameCap: 24, active: true, onStep });

    frames.frame(0);
    frames.frame(20);
    expect(onStep).not.toHaveBeenCalled();
    frames.frame(45);
    expect(onStep).toHaveBeenCalledOnce();
    expect(onStep.mock.calls[0]![0]).toBeCloseTo(0.045, 4);
    expect(frames.request).toHaveBeenCalled();

    scheduler.dispose();
    expect(frames.cancel).toHaveBeenCalled();
  });

  it('dynamically stops in overview/hidden states and resumes without a giant time jump', () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const frames = installAnimationFrames();
    const onStep = vi.fn();
    const scheduler = createRealmAmbientScheduler({ frameCap: 16, active: false, onStep });

    expect(frames.callbacks.size).toBe(0);
    scheduler.setActive(true);
    frames.frame(0);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.callbacks.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    frames.frame(10_000);
    frames.frame(10_070);
    expect(onStep).toHaveBeenCalledOnce();
    expect(onStep.mock.calls[0]![0]).toBeLessThanOrEqual(0.1);

    scheduler.setActive(false);
    expect(frames.callbacks.size).toBe(0);
    scheduler.dispose();
  });

  it('stays inert at zero cadence and fails closed after a callback error', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const inert = createRealmAmbientScheduler({ frameCap: 0, active: true, onStep: vi.fn() });
    expect(frames.callbacks.size).toBe(0);
    inert.setVisible(true);
    expect(inert.isActive()).toBe(false);
    inert.dispose();

    const failing = createRealmAmbientScheduler({
      frameCap: 24,
      active: true,
      onStep: () => { throw new Error('synthetic ambient failure'); }
    });
    frames.frame(0);
    frames.frame(50);
    expect(failing.isActive()).toBe(false);
    expect(frames.callbacks.size).toBe(0);
  });

  it('keeps visibility and grass activity as separate dynamic gates', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const scheduler = createRealmAmbientScheduler({ frameCap: 24, active: true, onStep: vi.fn() });

    expect(frames.callbacks.size).toBe(1);
    scheduler.setVisible(false);
    expect(scheduler.isActive()).toBe(false);
    expect(frames.callbacks.size).toBe(0);
    scheduler.setVisible(true);
    expect(scheduler.isActive()).toBe(true);
    expect(frames.callbacks.size).toBe(1);
    scheduler.setActive(false);
    scheduler.setVisible(false);
    scheduler.setVisible(true);
    expect(scheduler.isActive()).toBe(false);
    expect(frames.callbacks.size).toBe(0);
    scheduler.dispose();
  });

  it('raises movement cadence without leaving a second frame loop behind', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const onStep = vi.fn();
    const scheduler = createRealmAmbientScheduler({
      frameCap: 24,
      active: true,
      onStep
    });

    frames.frame(0);
    frames.frame(20);
    expect(onStep).not.toHaveBeenCalled();

    scheduler.setFrameCap(60);
    expect(scheduler.getFrameCap()).toBe(60);
    expect(frames.callbacks.size).toBe(1);
    frames.frame(30);
    frames.frame(47);
    expect(onStep).toHaveBeenCalledOnce();

    scheduler.setFrameCap(0);
    expect(scheduler.isActive()).toBe(false);
    expect(frames.callbacks.size).toBe(0);
    scheduler.setFrameCap(30);
    expect(scheduler.isActive()).toBe(true);
    expect(frames.callbacks.size).toBe(1);

    scheduler.dispose();
  });

  it.each([12, 18, 24])('carries an early %iHz step as signed debt without a next-tick burst', (frameCap) => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const onStep = vi.fn();
    const scheduler = createManagedScheduler({ frameCap, active: true, onStep });
    const period = 1_000 / frameCap;

    frames.browserFrame(0);
    frames.browserFrame(period - 0.0005);
    expect(onStep).toHaveBeenCalledOnce();
    frames.browserFrame(period - 0.0005 + 1_000 / 60);
    expect(onStep).toHaveBeenCalledOnce();
    scheduler.dispose();
    expect(frames.callbacks.size).toBe(0);
  });

  it.each([12, 18, 24])('keeps %iHz next-frame renders within the rounded display-clock tick window', (frameCap) => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const renderedTicks: number[] = [];
    let currentTick = 0;
    let renderFrame = 0;
    const onStep = vi.fn(() => {
      if (renderFrame !== 0) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = 0;
        renderedTicks.push(currentTick);
      });
    });
    const scheduler = createManagedScheduler({ frameCap, active: true, onStep });
    try {
      for (; currentTick <= 3_600; currentTick++) {
        frames.browserFrame(Math.floor(currentTick * 1_000 / 60 * 10) / 10);
      }
      const tickIntervals = renderedTicks.slice(1).map((tick, index) => (
        tick - renderedTicks[index]!
      ));
      expect(renderedTicks.length).toBeGreaterThan(frameCap * 50);
      expect(tickIntervals.every((ticks) => ticks > 1)).toBe(true);
      expect(Math.max(...tickIntervals)).toBeLessThanOrEqual(Math.ceil(60 / frameCap));
      expect(onStep.mock.calls.length).toBeLessThanOrEqual(frameCap * 60 + 1);
    } finally {
      scheduler.dispose();
      if (renderFrame !== 0) window.cancelAnimationFrame(renderFrame);
    }
    expect(frames.callbacks.size).toBe(0);
  });

  it.each([12, 18, 24])('preserves the %iHz average after repeated half-millisecond early frames', (frameCap) => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const onStep = vi.fn();
    const scheduler = createManagedScheduler({ frameCap, active: true, onStep });
    const period = 1_000 / frameCap;
    frames.browserFrame(0);
    for (let step = 1; step <= 1_000; step++) {
      frames.browserFrame(step * (period - 0.5));
    }
    const elapsed = 1_000 * (period - 0.5);
    expect(onStep.mock.calls.length).toBeGreaterThan(980);
    // Zero-clamping early debt would emit on every supplied frame and exceed
    // this unchanged average cap. The remainder must preserve negative debt.
    expect(onStep.mock.calls.length).toBeLessThanOrEqual(Math.floor(elapsed / period) + 1);
    scheduler.dispose();
    expect(frames.callbacks.size).toBe(0);
  });

  it.each([12, 18, 24])('resets %iHz phase across stalls, visibility, activity and cap changes', (frameCap) => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const frames = installAnimationFrames();
    const onStep = vi.fn();
    const scheduler = createManagedScheduler({ frameCap, active: true, onStep });
    const period = 1_000 / frameCap;
    frames.browserFrame(0);
    frames.browserFrame(period - 0.5);
    expect(onStep).toHaveBeenCalledOnce();
    frames.browserFrame(10_000);
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep.mock.calls[1]![0] - onStep.mock.calls[0]![0]).toBeLessThanOrEqual(0.100000001);
    frames.browserFrame(10_000);
    expect(onStep).toHaveBeenCalledTimes(2);

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.callbacks.size).toBe(0);
    frames.browserFrame(20_000);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    frames.browserFrame(20_001);
    expect(onStep).toHaveBeenCalledTimes(2);
    frames.browserFrame(20_001 + period);
    expect(onStep).toHaveBeenCalledTimes(3);

    scheduler.setActive(false);
    expect(frames.callbacks.size).toBe(0);
    scheduler.setActive(true);
    expect(frames.callbacks.size).toBe(1);
    frames.browserFrame(30_000);
    expect(onStep).toHaveBeenCalledTimes(3);
    const nextFrameCap = frameCap === 18 ? 24 : 18;
    scheduler.setFrameCap(nextFrameCap);
    expect(frames.callbacks.size).toBe(1);
    frames.browserFrame(40_000);
    frames.browserFrame(40_000 + 1_000 / nextFrameCap - 0.5);
    expect(onStep).toHaveBeenCalledTimes(4);
    scheduler.setFrameCap(0);
    expect(frames.callbacks.size).toBe(0);
    scheduler.setFrameCap(12);
    expect(frames.callbacks.size).toBe(1);
    scheduler.dispose();
    expect(frames.callbacks.size).toBe(0);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.callbacks.size).toBe(0);
  });

  it('bounds early tolerance for a high cap and never steps on repeated zero-delta frames', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const frames = installAnimationFrames();
    const onStep = vi.fn();
    const scheduler = createManagedScheduler({ frameCap: 2_000, active: true, onStep });
    frames.browserFrame(0);
    for (let repeated = 0; repeated < 10; repeated++) frames.browserFrame(0);
    expect(onStep).not.toHaveBeenCalled();
    frames.browserFrame(0.5);
    expect(onStep).toHaveBeenCalledOnce();
    for (let repeated = 0; repeated < 10; repeated++) frames.browserFrame(0.5);
    expect(onStep).toHaveBeenCalledOnce();
    scheduler.dispose();
    expect(frames.callbacks.size).toBe(0);
  });
});
