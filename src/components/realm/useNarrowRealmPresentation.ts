import { useEffect, useState } from 'react';

export const NARROW_REALM_MAXIMUM_WIDTH = 760;

export function isNarrowRealmPresentation(
  viewportWidth: number,
  coarsePointer: boolean
) {
  return viewportWidth < NARROW_REALM_MAXIMUM_WIDTH || coarsePointer;
}

function readNarrowRealmPresentation() {
  if (typeof window === 'undefined') return false;
  return isNarrowRealmPresentation(
    window.innerWidth,
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}

/** Keeps presentation-only disclosures aligned with the matching CSS query. */
export function useNarrowRealmPresentation() {
  const [narrow, setNarrow] = useState(readNarrowRealmPresentation);

  useEffect(() => {
    const pointer = window.matchMedia?.('(pointer: coarse)');
    const update = () => setNarrow(readNarrowRealmPresentation());
    window.addEventListener('resize', update);
    pointer?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      pointer?.removeEventListener?.('change', update);
    };
  }, []);

  return narrow;
}
