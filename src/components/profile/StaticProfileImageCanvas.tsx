import { useEffect, useRef, useState, type ReactNode } from 'react';

import { loadBoundedRealmProfileImage } from '../realm/loadRealmProfileImage';
import type { LoadedRealmProfileImage } from '../realm/loadRealmProfileImage';

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
 * A profile source can legally decode to roughly 16 MiB. Keep the shared
 * loader small enough for mobile while still filling visible marker rows
 * progressively. Queued consumers remain eligible instead of permanently
 * falling back when the active slots are busy.
 */
export const REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS = 4;

type SharedProfileImageEntry = {
  safeUrl: string;
  controller?: AbortController;
  loaded?: LoadedRealmProfileImage;
  promise: Promise<LoadedRealmProfileImage>;
  resolve: (loaded: LoadedRealmProfileImage) => void;
  reject: (reason: unknown) => void;
  references: number;
  state: 'queued' | 'loading' | 'settled' | 'failed';
  slotActive: boolean;
};

const sharedProfileImages = new Map<string, SharedProfileImageEntry>();
const sharedProfileImageQueue: SharedProfileImageEntry[] = [];
let activeSharedProfileImageLoads = 0;

function removeSharedProfileImage(safeUrl: string, entry: SharedProfileImageEntry) {
  if (sharedProfileImages.get(safeUrl) === entry) sharedProfileImages.delete(safeUrl);
}

function releaseSharedProfileImageSlot(entry: SharedProfileImageEntry) {
  if (!entry.slotActive) return;
  entry.slotActive = false;
  activeSharedProfileImageLoads = Math.max(0, activeSharedProfileImageLoads - 1);
  pumpSharedProfileImageQueue();
}

function disposeSharedProfileImage(safeUrl: string, entry: SharedProfileImageEntry) {
  removeSharedProfileImage(safeUrl, entry);
  if (entry.state === 'queued') {
    entry.state = 'failed';
    entry.reject(new Error('Profile image request was released before loading.'));
    return;
  }
  if (entry.state === 'loading') {
    entry.controller?.abort();
    // Keep the slot until the bounded loader actually settles. This preserves
    // the hard decode/network concurrency ceiling even across abort races.
    return;
  }
  if (entry.state === 'settled') {
    entry.loaded?.dispose();
    entry.loaded = undefined;
  }
}

function pumpSharedProfileImageQueue() {
  while (
    activeSharedProfileImageLoads < REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS
    && sharedProfileImageQueue.length > 0
  ) {
    const entry = sharedProfileImageQueue.shift()!;
    if (
      entry.state !== 'queued'
      || entry.references === 0
      || sharedProfileImages.get(entry.safeUrl) !== entry
    ) {
      continue;
    }
    const controller = new AbortController();
    entry.controller = controller;
    entry.state = 'loading';
    entry.slotActive = true;
    activeSharedProfileImageLoads += 1;
    const safeUrl = entry.safeUrl;
    void loadBoundedRealmProfileImage(safeUrl, { signal: controller.signal })
      .then((loaded) => {
        entry.loaded = loaded;
        entry.state = 'settled';
        entry.resolve(loaded);
        if (entry.references === 0) disposeSharedProfileImage(safeUrl, entry);
      })
      .catch((error) => {
        entry.state = 'failed';
        removeSharedProfileImage(safeUrl, entry);
        entry.reject(error);
      })
      .finally(() => releaseSharedProfileImageSlot(entry));
  }
}

function acquireSharedProfileImage(safeUrl: string) {
  let entry = sharedProfileImages.get(safeUrl);
  if (!entry) {
    let resolve!: (loaded: LoadedRealmProfileImage) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<LoadedRealmProfileImage>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    entry = {
      safeUrl,
      promise,
      resolve,
      reject,
      references: 0,
      state: 'queued',
      slotActive: false
    };
    sharedProfileImages.set(safeUrl, entry);
    sharedProfileImageQueue.push(entry);
  }
  entry.references += 1;
  pumpSharedProfileImageQueue();
  let released = false;
  return Object.freeze({
    promise: entry.promise,
    release: () => {
      if (released) return;
      released = true;
      entry!.references = Math.max(0, entry!.references - 1);
      if (entry!.references === 0) disposeSharedProfileImage(safeUrl, entry!);
    }
  });
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
    setState('loading');
    const lease = acquireSharedProfileImage(safeUrl);
    void lease.promise
      .then(({ image }) => {
        if (!active) return;

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
          lease.release();
        }
      })
      .catch(() => {
        if (active) setState('unavailable');
        lease.release();
      });

    return () => {
      active = false;
      lease.release();
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
