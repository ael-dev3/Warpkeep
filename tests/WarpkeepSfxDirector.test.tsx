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
    const view = render(
      <StrictMode>
        <WarpkeepSfxDirector createEngine={() => {
          const engine = fakeEngine();
          engines.push(engine);
          return engine;
        }} />
      </StrictMode>
    );

    emitWarpkeepSfx({ kind: 'select-keep' });
    expect(engines.reduce(
      (count, engine) => count + vi.mocked(engine.emitBatch).mock.calls.length,
      0
    )).toBe(1);

    view.unmount();
    emitWarpkeepSfx({ kind: 'select-gold' });
    expect(engines.reduce(
      (count, engine) => count + vi.mocked(engine.emitBatch).mock.calls.length,
      0
    )).toBe(1);
    expect(engines.every((engine) => (
      vi.mocked(engine.dispose).mock.calls.length === 1
    ))).toBe(true);
  });

  it('forwards mute, visibility, and explicit stop lifecycle without React audio state', () => {
    const engine = fakeEngine();
    const view = render(
      <WarpkeepSfxDirector createEngine={() => engine} muted={false} />
    );
    expect(engine.setMuted).toHaveBeenCalledWith(false);
    expect(engine.setHidden).toHaveBeenCalledWith(document.hidden);
    expect(engine.setWaterAmbience).toHaveBeenCalledWith({
      regime: 'none',
      relevance: 0,
      character: 0,
      selected: false
    });

    view.rerender(
      <WarpkeepSfxDirector createEngine={() => engine} muted />
    );
    expect(engine.setMuted).toHaveBeenLastCalledWith(true);

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.setHidden).toHaveBeenLastCalledWith(true);
    hidden.mockRestore();

    stopWarpkeepSfxVoices();
    expect(engine.stopAll).toHaveBeenCalledOnce();
  });

  it('does not treat synthetic test input as a trusted browser gesture', () => {
    const engine = fakeEngine();
    render(<WarpkeepSfxDirector createEngine={() => engine} />);
    fireEvent.pointerDown(window);
    fireEvent.pointerUp(window);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.click(document.body);
    expect(engine.activateFromTrustedGesture).not.toHaveBeenCalled();
    expect(engine.emit).not.toHaveBeenCalled();
  });
});
