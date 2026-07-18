import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRealmAmbientScheduler } from '../src/components/realm/realmAmbientScheduler';

type FrameCallback = FrameRequestCallback;

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
  return { callbacks, request, cancel, frame };
}

describe('Realm ambient scheduler', () => {
  afterEach(() => {
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
});
