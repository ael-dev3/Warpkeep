import { useEffect, useState } from 'react';

import {
  resolveRealmChromeModeFromViewport,
  type RealmChromeMode
} from './realmChromePresentation';

function viewportSnapshot() {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    layoutWidth: window.innerWidth,
    layoutHeight: window.innerHeight,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false
  };
}

export function useRealmChromeMode(miniApp: boolean): RealmChromeMode {
  const [mode, setMode] = useState<RealmChromeMode>(() => {
    if (typeof window === 'undefined') return miniApp ? 'miniapp' : 'desktop-web';
    return resolveRealmChromeModeFromViewport({
      miniApp,
      ...viewportSnapshot()
    });
  });

  useEffect(() => {
    const pointerQuery = window.matchMedia?.('(pointer: coarse)');
    let frame: number | undefined;
    const update = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        setMode(resolveRealmChromeModeFromViewport({
          miniApp,
          ...viewportSnapshot()
        }));
      });
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    pointerQuery?.addEventListener?.('change', update);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      pointerQuery?.removeEventListener?.('change', update);
    };
  }, [miniApp]);

  return mode;
}
