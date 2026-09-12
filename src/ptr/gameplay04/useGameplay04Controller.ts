import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { PtrGameplay04Capability } from '../ptrRealmConnection';
import { createGameplay04Controller, type Controller04, type Snapshot04 } from './createGameplay04Controller';

function productionNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function create(capability: PtrGameplay04Capability): Controller04 {
  return createGameplay04Controller({ capability, nonce: productionNonce, now: Date.now });
}

export function useGameplay04Controller(capability: PtrGameplay04Capability): Readonly<{
  controller: Controller04; snapshot: Snapshot04;
}> {
  // Creation is inert. A new capability renders a fresh loading snapshot immediately,
  // never the previous session's view while waiting for effect cleanup.
  const initial = useMemo(() => create(capability), [capability]);
  const [mounted, setMounted] = useState<Readonly<{ capability: PtrGameplay04Capability; controller: Controller04 }> | null>(null);
  const controller = mounted?.capability === capability ? mounted.controller : initial;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    // StrictMode can replay setup after cleanup. Re-enter with a new controller,
    // never resurrect a disposed envelope or replay into a replacement generation.
    const active = initial.getSnapshot().phase === 'disposed' ? create(capability) : initial;
    setMounted({ capability, controller: active });
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void active.refresh();
    };
    void active.refresh();
    const interval = window.setInterval(refreshVisible, 5000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
      active.dispose();
    };
  }, [capability, initial]);

  return { controller, snapshot };
}
