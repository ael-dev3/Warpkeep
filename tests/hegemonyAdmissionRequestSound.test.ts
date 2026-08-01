import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createHegemonyAdmissionRequestSoundPlayer,
  emitHegemonyAdmissionRequestSound,
  HEGEMONY_ADMISSION_REQUEST_SOUND_ASSET,
  HEGEMONY_ADMISSION_REQUEST_SOUND_LEVEL,
  HEGEMONY_ADMISSION_REQUEST_SOUND_TRIGGER,
  subscribeHegemonyAdmissionRequestSound
} from '../src/components/audio/hegemonyAdmissionRequestSound';

const runtimePath = resolve(
  process.cwd(),
  'public',
  HEGEMONY_ADMISSION_REQUEST_SOUND_ASSET
);

function fakeAudio() {
  const audio = document.createElement('audio');
  const play = vi.spyOn(audio, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  return { audio, pause, play };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Hegemony admission-request sound', () => {
  it('pins the exact reviewed runtime bytes and semantic trigger', () => {
    const bytes = readFileSync(runtimePath);
    expect(statSync(runtimePath).size).toBe(49_581);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '73465f59b6d0f9b1166b547608750ca6ec58bad7aac36e9899b3995ffb50d070'
    );
    expect(HEGEMONY_ADMISSION_REQUEST_SOUND_TRIGGER).toBe(
      'hegemony-empire-admission.request'
    );
  });

  it('delivers its exact trigger synchronously and unsubscribes cleanly', () => {
    const heard: string[] = [];
    const unsubscribe = subscribeHegemonyAdmissionRequestSound((trigger) => {
      heard.push(trigger);
    });

    emitHegemonyAdmissionRequestSound();
    expect(heard).toEqual(['hegemony-empire-admission.request']);

    unsubscribe();
    emitHegemonyAdmissionRequestSound();
    expect(heard).toHaveLength(1);
  });

  it('plays one bounded voice and allows a fresh gesture only after settlement', () => {
    const { audio, pause, play } = fakeAudio();
    const player = createHegemonyAdmissionRequestSoundPlayer(audio);

    expect(audio.volume).toBe(HEGEMONY_ADMISSION_REQUEST_SOUND_LEVEL);
    expect(player.play()).toBe(true);
    expect(player.play()).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);

    audio.dispatchEvent(new Event('ended'));
    expect(pause).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(0);
    expect(player.play()).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('stops without replay on mute, concealment, error, and disposal', () => {
    const { audio, pause, play } = fakeAudio();
    const player = createHegemonyAdmissionRequestSoundPlayer(audio);

    expect(player.play()).toBe(true);
    player.setMuted(true);
    expect(audio.muted).toBe(true);
    expect(player.play()).toBe(false);

    player.setMuted(false);
    expect(player.play()).toBe(true);
    player.setHidden(true);
    expect(player.play()).toBe(false);

    player.setHidden(false);
    expect(player.play()).toBe(true);
    audio.dispatchEvent(new Event('error'));
    expect(player.play()).toBe(true);

    player.dispose();
    expect(player.play()).toBe(false);
    expect(play).toHaveBeenCalledTimes(4);
    expect(pause.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('does not let a stale rejected attempt stop a newer voice', async () => {
    const { audio, play } = fakeAudio();
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    play
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      }))
      .mockResolvedValue(undefined);
    const player = createHegemonyAdmissionRequestSoundPlayer(audio);

    expect(player.play()).toBe(true);
    player.stop();
    expect(player.play()).toBe(true);
    rejectFirst?.(new Error('autoplay rejected'));
    await Promise.resolve();
    await Promise.resolve();

    expect(player.play()).toBe(false);
    audio.dispatchEvent(new Event('ended'));
    expect(player.play()).toBe(true);
  });
});
