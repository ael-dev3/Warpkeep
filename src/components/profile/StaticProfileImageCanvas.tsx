import { useEffect, useRef, useState, type ReactNode } from 'react';

import { loadBoundedRealmProfileImage } from '../realm/loadRealmProfileImage';

export type StaticProfileImageCanvasProps = Readonly<{
  fallback: ReactNode;
  safeUrl: string;
  snapshotPixels: number;
  className?: string;
}>;

function boundedSnapshotPixels(value: number) {
  return Number.isSafeInteger(value) && value > 0 && value <= 512 ? value : 128;
}

/**
 * Draws one immutable square cover snapshot from the bounded profile loader.
 * The supplied fallback remains visible until fetch, validation, and drawing
 * all succeed; no remote image element is ever attached to the document.
 */
export function StaticProfileImageCanvas({
  fallback,
  safeUrl,
  snapshotPixels,
  className
}: StaticProfileImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const pixels = boundedSnapshotPixels(snapshotPixels);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState('loading');
    void loadBoundedRealmProfileImage(safeUrl, { signal: controller.signal })
      .then(({ image, dispose }) => {
        if (!active) {
          dispose();
          return;
        }

        const canvas = canvasRef.current;
        const sourceWidth = image.naturalWidth;
        const sourceHeight = image.naturalHeight;
        try {
          if (!canvas || sourceWidth <= 0 || sourceHeight <= 0) {
            throw new Error('Profile image has no drawable dimensions.');
          }
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D rendering is unavailable.');

          const sourceSize = Math.min(sourceWidth, sourceHeight);
          context.clearRect(0, 0, pixels, pixels);
          context.drawImage(
            image,
            (sourceWidth - sourceSize) / 2,
            (sourceHeight - sourceSize) / 2,
            sourceSize,
            sourceSize,
            0,
            0,
            pixels,
            pixels
          );
          setState('ready');
        } catch {
          setState('unavailable');
        } finally {
          dispose();
        }
      })
      .catch(() => {
        if (active) setState('unavailable');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [pixels, safeUrl]);

  return (
    <>
      <canvas
        aria-hidden="true"
        className={className}
        data-profile-image-state={state}
        height={pixels}
        ref={canvasRef}
        style={{
          display: state === 'ready' ? 'block' : 'none',
          height: '100%',
          width: '100%'
        }}
        width={pixels}
      />
      {state !== 'ready' ? fallback : null}
    </>
  );
}
