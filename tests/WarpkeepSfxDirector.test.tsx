import { StrictMode } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WarpkeepSfxDirector,
  resolveWarpkeepUiSfx,
  shouldActivateWarpkeepSfx,
  type WarpkeepSfxDirectorEngine
} from '../src/components/audio/WarpkeepSfxDirector';
import {
  emitWarpkeepSfx,
  stopWarpkeepSfxVoices
} from '../src/components/audio/sfxEvents';
import {
  emitHegemonyAdmissionRequestSound,
  type HegemonyAdmissionRequestSoundPlayer
} from '../src/components/audio/hegemonyAdmissionRequestSound';

function fakeEngine(): WarpkeepSfxDirectorEngine {
  return {
    activateFromTrustedGesture: vi.fn(async () => true),
    dispose: vi.fn(),
    emit: vi.fn(() => true),
    emitBatch: vi.fn(() => 1),
    setHidden: vi.fn(),
    setMuted: vi.fn(),
    setWaterAmbience: vi.fn(),
    stopAll: vi.fn()
  };
}

function fakeAdmissionPlayer(): HegemonyAdmissionRequestSoundPlayer {
  return {
    dispose: vi.fn(),
    play: vi.fn(() => true),
    setHidden: vi.fn(),
    setMuted: vi.fn(),
    stop: vi.fn()
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ordinary UI SFX classification', () => {
  it('keeps explicit opt-outs and material control meanings deterministic', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button id="plain">Retry</button>
      <button id="open" aria-label="Open settings">gear</button>
      <button id="close" aria-label="Close Realm menu">x</button>
      <button id="back">Return to Menu</button>
      <button id="primary" data-warpkeep-sfx="primary">Begin</button>
      <button id="none" data-warpkeep-sfx="none">Silent</button>
      <button id="disabled" disabled>Unavailable</button>
    `;

    expect(resolveWarpkeepUiSfx(root.querySelector('#plain'))).toEqual({
      kind: 'ui-press'
    });
    expect(resolveWarpkeepUiSfx(root.querySelector('#open'))).toEqual({
      kind: 'ui-open'
    });
    expect(resolveWarpkeepUiSfx(root.querySelector('#close'))).toEqual({
      kind: 'ui-close'
    });
    expect(resolveWarpkeepUiSfx(root.querySelector('#back'))).toEqual({
      kind: 'ui-back'
    });
    expect(resolveWarpkeepUiSfx(root.querySelector('#primary'))).toEqual({
      kind: 'ui-press',
      emphasis: 'primary'
    });
    expect(resolveWarpkeepUiSfx(root.querySelector('#none'))).toBeUndefined();
    expect(resolveWarpkeepUiSfx(root.querySelector('#disabled'))).toBeUndefined();
  });
});

describe('WarpkeepSfxDirector', () => {
  it('uses only trusted, actively authorized browser gesture edges for WebAudio', () => {
    const activation = {
      isTrusted: true,
      userActivationActive: true
    } as const;

    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'pointerdown',
      pointerType: 'mouse'
    })).toBe(true);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'pointerup',
      pointerType: 'mouse'
    })).toBe(false);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'pointerdown',
      pointerType: 'touch'
    })).toBe(false);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'pointerup',
      pointerType: 'touch'
    })).toBe(true);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'pointerdown',
      pointerType: 'pen'
    })).toBe(false);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'pointerup',
      pointerType: 'pen'
    })).toBe(true);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'keydown',
      key: 'Enter'
    })).toBe(true);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'keydown',
      key: 'Enter',
      repeat: true
    })).toBe(false);
    expect(shouldActivateWarpkeepSfx({
      ...activation,
      eventType: 'keydown',
      key: 'Shift'
    })).toBe(false);
  });

  it('rejects missing browser activation and untrusted input on every allowed edge', () => {
    for (const input of [
      { eventType: 'pointerdown', pointerType: 'mouse' },
      { eventType: 'pointerup', pointerType: 'touch' },
      { eventType: 'pointerup', pointerType: 'pen' },
      { eventType: 'keydown', key: 'Enter' }
    ] as const) {
      expect(shouldActivateWarpkeepSfx({
        ...input,
        isTrusted: false,
        userActivationActive: true
      })).toBe(false);
      expect(shouldActivateWarpkeepSfx({
        ...input,
        isTrusted: true,
        userActivationActive: false
      })).toBe(false);
    }
  });

  it('maintains one live event subscription through StrictMode and cleans it up', () => {
    const engines: WarpkeepSfxDirectorEngine[] = [];
    const admissionPlayers: HegemonyAdmissionRequestSoundPlayer[] = [];
    const view = render(
      <StrictMode>
        <WarpkeepSfxDirector
          createAdmissionSoundPlayer={() => {
            const player = fakeAdmissionPlayer();
            admissionPlayers.push(player);
            return player;
          }}
          createEngine={() => {
            const engine = fakeEngine();
            engines.push(engine);
            return engine;
          }}
        />
      </StrictMode>
    );

    emitWarpkeepSfx({ kind: 'select-keep' });
    emitHegemonyAdmissionRequestSound();
    expect(engines.reduce(
      (count, engine) => count + vi.mocked(engine.emitBatch).mock.calls.length,
      0
    )).toBe(1);
    expect(admissionPlayers.reduce(
      (count, player) => count + vi.mocked(player.play).mock.calls.length,
      0
    )).toBe(1);

    view.unmount();
    emitWarpkeepSfx({ kind: 'select-gold' });
    emitHegemonyAdmissionRequestSound();
    expect(engines.reduce(
      (count, engine) => count + vi.mocked(engine.emitBatch).mock.calls.length,
      0
    )).toBe(1);
    expect(engines.every((engine) => (
      vi.mocked(engine.dispose).mock.calls.length === 1
    ))).toBe(true);
    expect(admissionPlayers.reduce(
      (count, player) => count + vi.mocked(player.play).mock.calls.length,
      0
    )).toBe(1);
    expect(admissionPlayers.every((player) => (
      vi.mocked(player.dispose).mock.calls.length === 1
    ))).toBe(true);
  });

  it('forwards mute, visibility, and explicit stop lifecycle to both bounded voices', () => {
    const engine = fakeEngine();
    const admissionPlayer = fakeAdmissionPlayer();
    const view = render(
      <WarpkeepSfxDirector
        createAdmissionSoundPlayer={() => admissionPlayer}
        createEngine={() => engine}
        muted={false}
      />
    );
    const audio = document.querySelector<HTMLAudioElement>(
      'audio[data-warpkeep-audio-role="hegemony-admission-request"]'
    );
    expect(audio?.hidden).toBe(true);
    expect(audio?.preload).toBe('auto');
    expect(audio?.getAttribute('src')).toBe(
      '/audio/Hegemony_Empire_Admission_Request_Button.mp3'
    );
    expect(engine.setMuted).toHaveBeenCalledWith(false);
    expect(engine.setHidden).toHaveBeenCalledWith(document.hidden);
    expect(admissionPlayer.setMuted).toHaveBeenCalledWith(false);
    expect(admissionPlayer.setHidden).toHaveBeenCalledWith(document.hidden);
    expect(engine.setWaterAmbience).toHaveBeenCalledWith({
      regime: 'none',
      relevance: 0,
      character: 0,
      selected: false
    });

    view.rerender(
      <WarpkeepSfxDirector
        createAdmissionSoundPlayer={() => admissionPlayer}
        createEngine={() => engine}
        muted
      />
    );
    expect(engine.setMuted).toHaveBeenLastCalledWith(true);
    expect(admissionPlayer.setMuted).toHaveBeenLastCalledWith(true);

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.setHidden).toHaveBeenLastCalledWith(true);
    expect(admissionPlayer.setHidden).toHaveBeenLastCalledWith(true);
    hidden.mockRestore();

    emitHegemonyAdmissionRequestSound();
    expect(admissionPlayer.play).toHaveBeenCalledOnce();
    stopWarpkeepSfxVoices();
    expect(engine.stopAll).toHaveBeenCalledOnce();
    expect(admissionPlayer.stop).toHaveBeenCalledOnce();
  });

  it('does not treat synthetic test input as a trusted browser gesture', () => {
    const engine = fakeEngine();
    const admissionPlayer = fakeAdmissionPlayer();
    render(
      <WarpkeepSfxDirector
        createAdmissionSoundPlayer={() => admissionPlayer}
        createEngine={() => engine}
      />
    );
    fireEvent.pointerDown(window);
    fireEvent.pointerUp(window);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.click(document.body);
    expect(engine.activateFromTrustedGesture).not.toHaveBeenCalled();
    expect(engine.emit).not.toHaveBeenCalled();
  });
});
