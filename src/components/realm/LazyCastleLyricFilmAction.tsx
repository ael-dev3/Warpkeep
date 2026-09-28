import { lazy, Suspense } from 'react';
import type { CastleLyricFilmActionProps } from './CastleLyricFilmAction';
import { WARPKEEP_LYRIC_FILM_URL } from './castleLyricFilmConfig';

function OpenFilmExternally() {
  return (
    <a href={WARPKEEP_LYRIC_FILM_URL} target="_blank" rel="noopener noreferrer">
      Open Leave It On film ↗
    </a>
  );
}

const DeferredAction = lazy(async () => {
  try {
    const module = await import('./CastleLyricFilmAction');
    return { default: module.CastleLyricFilmAction };
  } catch {
    // A failed optional player chunk should leave the rest of the realm usable.
    return { default: OpenFilmExternally };
  }
});

export function LazyCastleLyricFilmAction(props: CastleLyricFilmActionProps) {
  return (
    <Suspense fallback={null}>
      <DeferredAction {...props} />
    </Suspense>
  );
}
