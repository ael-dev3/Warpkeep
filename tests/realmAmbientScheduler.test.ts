import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRealmAmbientScheduler,
  REALM_AMBIENT_STEP_MILLISECONDS
} from '../src/components/realm/realmAmbientScheduler';

describe('Realm ambient scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('advances at a bounded fixed cadence without requesting display-rate frames', () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    const onStep = vi.fn();
    const scheduler = createRealmAmbientScheduler({ enabled: true, onStep });

    vi.advanceTimersByTime(REALM_AMBIENT_STEP_MILLISECONDS - 1);
    expect(onStep).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStep).toHaveBeenLastCalledWith(REALM_AMBIENT_STEP_MILLISECONDS / 1000);
    vi.advanceTimersByTime(REALM_AMBIENT_STEP_MILLISECONDS * 2);
    expect(onStep.mock.calls.map(([elapsed]) => elapsed)).toEqual([0.18, 0.36, 0.54]);
    expect(requestFrame).not.toHaveBeenCalled();

    scheduler.dispose();
    vi.advanceTimersByTime(REALM_AMBIENT_STEP_MILLISECONDS * 4);
    expect(onStep).toHaveBeenCalledTimes(3);
  });

  it('cancels while hidden and resumes without catching up hidden time', () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const onStep = vi.fn();
    const scheduler = createRealmAmbientScheduler({ enabled: true, onStep });

    vi.advanceTimersByTime(60);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(REALM_AMBIENT_STEP_MILLISECONDS * 8);
    expect(onStep).not.toHaveBeenCalled();

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(REALM_AMBIENT_STEP_MILLISECONDS);
    expect(onStep).toHaveBeenCalledOnce();
    expect(onStep).toHaveBeenCalledWith(0.18);

    scheduler.dispose();
  });

  it('stays inert when disabled and fails closed after an ambient callback error', () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const disabledStep = vi.fn();
    const disabled = createRealmAmbientScheduler({ enabled: false, onStep: disabledStep });
    vi.advanceTimersByTime(REALM_AMBIENT_STEP_MILLISECONDS * 2);
    expect(disabledStep).not.toHaveBeenCalled();
    disabled.dispose();

    const failingStep = vi.fn(() => { throw new Error('synthetic ambience failure'); });
    const enabled = createRealmAmbientScheduler({ enabled: true, onStep: failingStep });
    vi.advanceTimersByTime(REALM_AMBIENT_STEP_MILLISECONDS * 4);
    expect(failingStep).toHaveBeenCalledOnce();
    enabled.dispose();
  });
});
