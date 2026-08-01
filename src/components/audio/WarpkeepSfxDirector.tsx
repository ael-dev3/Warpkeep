import { useEffect, useRef } from 'react';

import { ProceduralSfxEngine } from './proceduralSfxEngine';
import {
  createHegemonyAdmissionRequestSoundPlayer,
  HEGEMONY_ADMISSION_REQUEST_SOUND_ASSET,
  subscribeHegemonyAdmissionRequestSound,
  type HegemonyAdmissionRequestSoundPlayer
} from './hegemonyAdmissionRequestSound';
import {
  emitWarpkeepSfx,
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
  /** Test seam; production always owns one bounded admission sample voice. */
  createAdmissionSoundPlayer?: (
    audio: HTMLAudioElement
  ) => HegemonyAdmissionRequestSoundPlayer;
}>;

export type WarpkeepSfxActivationInput = Readonly<{
  eventType: 'keydown' | 'pointerdown' | 'pointerup';
  isTrusted: boolean;
  key?: string;
  pointerType?: string;
  repeat?: boolean;
  userActivationActive: boolean;
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

function isMeaningfulKeyboardGesture(key: string, repeat: boolean) {
  return !repeat && ![
    'Alt',
    'AltGraph',
    'CapsLock',
    'Control',
    'Meta',
    'Shift'
  ].includes(key);
}

/**
 * Keeps WebAudio initialization on the browser's activation-triggering edge.
 * Touch and pen do not gain user activation until pointerup, while a mouse may
 * activate on pointerdown. `isTrusted` alone is deliberately insufficient.
 */
export function shouldActivateWarpkeepSfx(
  input: WarpkeepSfxActivationInput
) {
  if (!input.isTrusted || !input.userActivationActive) return false;
  if (input.eventType === 'keydown') {
    return isMeaningfulKeyboardGesture(input.key ?? '', input.repeat === true);
  }
  if (input.eventType === 'pointerdown') return input.pointerType === 'mouse';
  return (
    input.eventType === 'pointerup'
    && (input.pointerType === 'touch' || input.pointerType === 'pen')
  );
}

/**
 * Owns one lazy WebAudio graph and one tiny admission sample voice for the
 * application lifetime. It renders no visible UI and holds no per-frame state.
 */
export function WarpkeepSfxDirector({
  muted = false,
  createEngine,
  createAdmissionSoundPlayer
}: WarpkeepSfxDirectorProps) {
  const engineRef = useRef<WarpkeepSfxDirectorEngine | null>(null);
  const admissionAudioRef = useRef<HTMLAudioElement | null>(null);
  const admissionPlayerRef = useRef<HegemonyAdmissionRequestSoundPlayer | null>(null);
  const createEngineRef = useRef(createEngine);
  const createAdmissionSoundPlayerRef = useRef(createAdmissionSoundPlayer);
  const mutedRef = useRef(muted);
  createEngineRef.current = createEngine;
  createAdmissionSoundPlayerRef.current = createAdmissionSoundPlayer;
  mutedRef.current = muted;

  useEffect(() => {
    // Construct inside the effect so React StrictMode's setup/cleanup replay
    // receives a fresh engine rather than reusing one it has just disposed.
    const engine = createEngineRef.current?.() ?? new ProceduralSfxEngine();
    const admissionAudio = admissionAudioRef.current;
    const admissionPlayer = admissionAudio
      ? createAdmissionSoundPlayerRef.current?.(admissionAudio)
        ?? createHegemonyAdmissionRequestSoundPlayer(admissionAudio)
      : null;
    engineRef.current = engine;
    admissionPlayerRef.current = admissionPlayer;
    engine.setMuted(mutedRef.current);
    engine.setHidden(document.hidden);
    admissionPlayer?.setMuted(mutedRef.current);
    admissionPlayer?.setHidden(document.hidden);

    const activate = (event: KeyboardEvent | PointerEvent) => {
      const eventType = event.type;
      if (
        eventType !== 'keydown'
        && eventType !== 'pointerdown'
        && eventType !== 'pointerup'
      ) return;
      const keyboardEvent = eventType === 'keydown'
        ? event as KeyboardEvent
        : undefined;
      const pointerEvent = eventType === 'keydown'
        ? undefined
        : event as PointerEvent;
      if (!shouldActivateWarpkeepSfx({
        eventType,
        isTrusted: event.isTrusted,
        key: keyboardEvent?.key,
        pointerType: pointerEvent?.pointerType,
        repeat: keyboardEvent?.repeat,
        userActivationActive: navigator.userActivation?.isActive === true
      })) return;
      void engine.activateFromTrustedGesture(event.isTrusted);
    };
    const playOrdinaryControl = (event: MouseEvent) => {
      if (!event.isTrusted || event.defaultPrevented) return;
      const resolved = resolveWarpkeepUiSfx(event.target);
      if (resolved) emitWarpkeepSfx(resolved);
    };
    const handleVisibility = () => {
      engine.setHidden(document.hidden);
      admissionPlayer?.setHidden(document.hidden);
    };
    const unsubscribeEvents = subscribeWarpkeepSfx((events) => {
      engine.emitBatch(events);
    });
    const unsubscribeAdmissionSound = subscribeHegemonyAdmissionRequestSound(() => {
      admissionPlayer?.play();
    });
    const unsubscribeStop = subscribeWarpkeepSfxStop(() => {
      engine.stopAll();
      admissionPlayer?.stop();
    });
    const unsubscribeWaterAmbience = subscribeWarpkeepWaterAmbience((state) => {
      engine.setWaterAmbience(state);
    });

    window.addEventListener('pointerdown', activate, { capture: true, passive: true });
    window.addEventListener('pointerup', activate, { capture: true, passive: true });
    window.addEventListener('keydown', activate, { capture: true });
    document.addEventListener('click', playOrdinaryControl);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribeEvents();
      unsubscribeAdmissionSound();
      unsubscribeStop();
      unsubscribeWaterAmbience();
      window.removeEventListener('pointerdown', activate, true);
      window.removeEventListener('pointerup', activate, true);
      window.removeEventListener('keydown', activate, true);
      document.removeEventListener('click', playOrdinaryControl);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (engineRef.current === engine) engineRef.current = null;
      if (admissionPlayerRef.current === admissionPlayer) {
        admissionPlayerRef.current = null;
      }
      admissionPlayer?.dispose();
      engine.dispose();
    };
  // The director intentionally owns one engine for one mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
    admissionPlayerRef.current?.setMuted(muted);
  }, [muted]);

  return (
    <audio
      aria-hidden="true"
      data-warpkeep-audio-role="hegemony-admission-request"
      hidden
      preload="auto"
      ref={admissionAudioRef}
      src={`${import.meta.env.BASE_URL}${HEGEMONY_ADMISSION_REQUEST_SOUND_ASSET}`}
    />
  );
}
