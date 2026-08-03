import { useEffect } from 'react';

import { useMiniAppHost } from '../../farcaster/miniapp';
import {
  subscribeWarpkeepSfx,
  type WarpkeepSfxEvent
} from './sfxEvents';

export type WarpkeepHapticCue =
  | Readonly<{ kind: 'selection' }>
  | Readonly<{ kind: 'impact'; type: 'light' | 'soft' }>
  | Readonly<{
      kind: 'notification';
      type: 'success' | 'warning' | 'error';
    }>;

const SELECTION_EVENT_KINDS = new Set<WarpkeepSfxEvent['kind']>([
  'select-keep',
  'select-worker',
  'select-gold',
  'select-food',
  'select-wood',
  'select-stone'
]);

/**
 * Resolves at most one host cue for a clustered presentation batch. Automatic
 * Worker arrivals and river-follow steps intentionally remain silent here so
 * haptics can never become a background loop or imply authority.
 */
export function resolveWarpkeepHapticCue(
  events: readonly WarpkeepSfxEvent[]
): WarpkeepHapticCue | undefined {
  if (events.some(event => event.kind === 'command-failed')) {
    return Object.freeze({ kind: 'notification', type: 'error' });
  }
  if (events.some(event => event.kind === 'ui-deny')) {
    return Object.freeze({ kind: 'notification', type: 'warning' });
  }
  if (events.some(event => (
    event.kind === 'worker-dispatch-confirmed'
    || event.kind === 'worker-recall-confirmed'
    || event.kind === 'access-request-confirmed'
    || event.kind === 'inner-keep-project-completed'
  ))) {
    return Object.freeze({ kind: 'notification', type: 'success' });
  }
  if (events.some(event => SELECTION_EVENT_KINDS.has(event.kind))) {
    return Object.freeze({ kind: 'selection' });
  }
  if (events.some(event => event.kind === 'inner-keep-project-confirmed')) {
    return Object.freeze({ kind: 'impact', type: 'soft' });
  }
  if (events.some(event => event.kind === 'inner-keep-menu-opened')) {
    return Object.freeze({ kind: 'impact', type: 'light' });
  }
  if (events.some(event => event.kind === 'ui-open')) {
    return Object.freeze({ kind: 'impact', type: 'soft' });
  }
  if (events.some(event => (
    event.kind === 'ui-back'
    || event.kind === 'ui-close'
  ))) {
    return Object.freeze({ kind: 'impact', type: 'light' });
  }
  return undefined;
}

/**
 * Adds capability-checked Mini App haptics to the existing SFX taxonomy.
 * Ordinary browsers resolve every optional host call to false and keep the
 * complete visual and accessible feedback path unchanged.
 */
export function WarpkeepHapticsDirector({ muted = false }: Readonly<{
  muted?: boolean;
}>) {
  const { haptics } = useMiniAppHost();

  useEffect(() => {
    const unsubscribe = subscribeWarpkeepSfx((events) => {
      if (muted) return;
      const cue = resolveWarpkeepHapticCue(events);
      if (!cue) return;
      if (cue.kind === 'selection') {
        void haptics.selectionChanged();
      } else if (cue.kind === 'impact') {
        void haptics.impactOccurred(cue.type);
      } else {
        void haptics.notificationOccurred(cue.type);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [haptics, muted]);

  return null;
}
