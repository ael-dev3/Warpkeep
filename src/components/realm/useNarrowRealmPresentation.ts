import { useEffect, useState } from 'react';

const NARROW_REALM_MAXIMUM_WIDTH = 760;

function readNarrowRealmPresentation() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= NARROW_REALM_MAXIMUM_WIDTH
    || window.matchMedia?.('(pointer: coarse)').matches === true;
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
