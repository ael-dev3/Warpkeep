import { useEffect, useRef } from 'react';

import { ProceduralSfxEngine } from './proceduralSfxEngine';
import {
  subscribeWarpkeepSfx,
  subscribeWarpkeepSfxStop,
  type WarpkeepSfxEvent
} from './sfxEvents';
import {
  subscribeWarpkeepWaterAmbience,
  type WarpkeepWaterAmbienceState
} from './waterAmbience';

export interface WarpkeepSfxDirectorEngine {
  activateFromTrustedGesture: (trusted: boolean) => Promise<boolean>;
  dispose: () => void;
  emit: (event: WarpkeepSfxEvent) => boolean;
  emitBatch: (events: readonly WarpkeepSfxEvent[]) => number;
  setHidden: (hidden: boolean) => void;
  setMuted: (muted: boolean) => void;
  setWaterAmbience: (state: WarpkeepWaterAmbienceState) => void;
  stopAll: () => void;
}

export type WarpkeepSfxDirectorProps = Readonly<{
  muted?: boolean;
  /** Test seam; production always uses the bounded procedural engine. */
  createEngine?: () => WarpkeepSfxDirectorEngine;
}>;

type SfxControl = HTMLElement & Readonly<{
  dataset: DOMStringMap & {
    warpkeepSfx?: string;
  };
}>;

const interactiveSelector = [
  'button',
  '[role="button"]',
  'input[type="button"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]'
].join(',');

function controlCopy(control: HTMLElement) {
  return [
    control.getAttribute('aria-label'),
    control.getAttribute('title'),
    control.textContent
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolves ordinary control feedback at the document boundary. Specific world
 * selections emit their material cue inside RealmMapScreen first; the engine
 * suppresses this generic press from the same browser click.
 */
export function resolveWarpkeepUiSfx(
  target: EventTarget | null
): WarpkeepSfxEvent | undefined {
  if (!(target instanceof Element)) return undefined;
  const control = target.closest<SfxControl>(interactiveSelector);
  if (
    !control
    || control.matches(':disabled')
    || control.getAttribute('aria-disabled') === 'true'
  ) return undefined;

  switch (control.dataset.warpkeepSfx) {
    case 'none':
      return undefined;
    case 'quiet':
      return { kind: 'ui-press', emphasis: 'quiet' };
    case 'primary':
      return { kind: 'ui-press', emphasis: 'primary' };
    case 'open':
      return { kind: 'ui-open' };
    case 'close':
      return { kind: 'ui-close' };
    case 'back':
      return { kind: 'ui-back' };
    case 'deny':
      return { kind: 'ui-deny' };
  }

  const copy = controlCopy(control);
  if (/\b(close|dismiss)\b/.test(copy)) return { kind: 'ui-close' };
  if (/\b(back|return|cancel|escape)\b/.test(copy)) return { kind: 'ui-back' };
  if (/\b(settings|workers|explore|navigator|details|open)\b/.test(copy)) {
    return { kind: 'ui-open' };
  }
  if (/\b(enter|continue|proceed|confirm|accept|dispatch|recall)\b/.test(copy)) {
    return { kind: 'ui-press', emphasis: 'primary' };
  }
  return { kind: 'ui-press' };
}

function isMeaningfulKeyboardGesture(event: KeyboardEvent) {
  return !event.repeat && ![
    'Alt',
    'AltGraph',
    'CapsLock',
    'Control',
    'Meta',
    'Shift'
  ].includes(event.key);
}

/**
 * Owns exactly one lazy WebAudio event graph for the application lifetime.
 * It renders no UI and holds no per-frame React state.
 */
export function WarpkeepSfxDirector({
  muted = false,
  createEngine
}: WarpkeepSfxDirectorProps) {
  const engineRef = useRef<WarpkeepSfxDirectorEngine | null>(null);
  const createEngineRef = useRef(createEngine);
  const mutedRef = useRef(muted);
  createEngineRef.current = createEngine;
  mutedRef.current = muted;

  useEffect(() => {
    // Construct inside the effect so React StrictMode's setup/cleanup replay
    // receives a fresh engine rather than reusing one it has just disposed.
    const engine = createEngineRef.current?.() ?? new ProceduralSfxEngine();
    engineRef.current = engine;
    engine.setMuted(mutedRef.current);
    engine.setHidden(document.hidden);

    const activate = (event: Event) => {
      if (event instanceof KeyboardEvent && !isMeaningfulKeyboardGesture(event)) return;
      void engine.activateFromTrustedGesture(event.isTrusted);
    };
    const playOrdinaryControl = (event: MouseEvent) => {
      if (!event.isTrusted || event.defaultPrevented) return;
      const resolved = resolveWarpkeepUiSfx(event.target);
      if (resolved) engine.emit(resolved);
    };
    const handleVisibility = () => engine.setHidden(document.hidden);
    const unsubscribeEvents = subscribeWarpkeepSfx((events) => {
      engine.emitBatch(events);
    });
    const unsubscribeStop = subscribeWarpkeepSfxStop(() => engine.stopAll());
    const unsubscribeWaterAmbience = subscribeWarpkeepWaterAmbience((state) => {
      engine.setWaterAmbience(state);
    });

    window.addEventListener('pointerdown', activate, { capture: true, passive: true });
    window.addEventListener('touchstart', activate, { capture: true, passive: true });
    window.addEventListener('keydown', activate, { capture: true });
    document.addEventListener('click', playOrdinaryControl);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribeEvents();
      unsubscribeStop();
      unsubscribeWaterAmbience();
      window.removeEventListener('pointerdown', activate, true);
      window.removeEventListener('touchstart', activate, true);
      window.removeEventListener('keydown', activate, true);
      document.removeEventListener('click', playOrdinaryControl);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (engineRef.current === engine) engineRef.current = null;
      engine.dispose();
    };
  // The director intentionally owns one engine for one mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
  }, [muted]);

  return null;
}
