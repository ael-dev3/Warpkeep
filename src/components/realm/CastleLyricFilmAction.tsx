import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalFocusBoundary } from '../menu/useModalFocusBoundary';
import { WARPKEEP_LYRIC_FILM_URL } from './castleLyricFilmConfig';
import './CastleLyricFilmAction.css';

/** This film is a versioned public release; it is never inferred from a display name. */
export { WARPKEEP_LYRIC_FILM_OWNER_FID, WARPKEEP_LYRIC_FILM_URL } from './castleLyricFilmConfig';

export type CastleLyricFilmActionProps = Readonly<{
  /** The close callback lets a Mini App host Back action dismiss the film first. */
  onOpenChange?: (open: boolean, requestClose?: () => void) => void;
}>;

/** Loads the full film only after an explicit player action. */
export function CastleLyricFilmAction({ onOpenChange }: CastleLyricFilmActionProps) {
  const [open, setOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wasOpenRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const close = useCallback(() => {
    videoRef.current?.pause();
    setOpen(false);
  }, []);

  useModalFocusBoundary({
    dialogRef,
    initialFocusRef: closeRef,
    onEscape: close,
    active: open
  });

  useLayoutEffect(() => {
    if (!open) return undefined;
    onOpenChangeRef.current?.(true, close);
    return () => {
      videoRef.current?.pause();
      onOpenChangeRef.current?.(false);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  const mountVideo = useCallback((video: HTMLVideoElement | null) => {
    if (video === null) videoRef.current?.pause();
    videoRef.current = video;
    if (video !== null) {
      // The video mounts during the button's user gesture. Controls remain
      // available when a host declines sound-on autoplay.
      void video.play().catch(() => undefined);
    }
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="castle-lyric-film__trigger"
        aria-haspopup="dialog"
        onClick={() => {
          setLoadFailed(false);
          setOpen(true);
        }}
      >
        <span className="castle-lyric-film__play" aria-hidden="true">▶</span>
        <span className="castle-lyric-film__trigger-copy">
          <strong>WATCH LEAVE IT ON</strong>
          <span>A Warpkeep lyric film · 4:33</span>
        </span>
        <span className="castle-lyric-film__spark" aria-hidden="true">✦</span>
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          className="castle-lyric-film__backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="castle-lyric-film-title"
            aria-describedby="castle-lyric-film-description"
            className="castle-lyric-film__dialog"
          >
            <header className="castle-lyric-film__header">
              <div>
                <span className="castle-lyric-film__eyebrow">WARPKEEP · THE FILM</span>
                <h2 id="castle-lyric-film-title">Leave It On</h2>
                <p id="castle-lyric-film-description">A lyric film from the world of Warpkeep</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="castle-lyric-film__close"
                aria-label="Close Leave It On film"
                onClick={close}
              >×</button>
            </header>
            <video
              ref={mountVideo}
              className="castle-lyric-film__video"
              controls
              playsInline
              preload="none"
              tabIndex={0}
              aria-label="Leave It On Warpkeep lyric film"
              onError={() => setLoadFailed(true)}
            >
              <source src={WARPKEEP_LYRIC_FILM_URL} type="video/mp4" />
            </video>
            <footer className="castle-lyric-film__footer">
              {loadFailed ? <span role="status">Playback unavailable here.</span> : <span>Sound on for the full experience.</span>}
              <a href={WARPKEEP_LYRIC_FILM_URL} target="_blank" rel="noopener noreferrer">
                Open full video ↗
              </a>
            </footer>
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}
