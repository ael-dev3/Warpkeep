// @ts-expect-error -- Vitest executes these integrity checks in Node; app code remains browser-only.
import { createHash } from 'node:crypto';
// @ts-expect-error -- Vitest executes these integrity checks in Node; app code remains browser-only.
import { existsSync, readFileSync } from 'node:fs';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WARPKEEP_MENU_POSTER_URL,
  WARPKEEP_MENU_VIDEO_URL,
  WarpkeepMainMenu,
  resolveMenuAssetUrl
} from '../src/components/menu/WarpkeepMainMenu';

function installMotionPreference(matches = false) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

describe('Warpkeep main-menu media', () => {
  const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');

  beforeEach(() => {
    installMotionPreference();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalHiddenDescriptor) {
      Object.defineProperty(Document.prototype, 'hidden', originalHiddenDescriptor);
    }
    Reflect.deleteProperty(document, 'hidden');
  });

  it('ships the audited runtime media pair and removes its superseded copies', () => {
    const auditedAssets = [
      {
        bytes: 5_713_248,
        path: 'public/video/warpkeep-menu-loop-v2.mp4',
        sha256: '6034f049e8ee25a412fdc1f8c7ccce1ab403a58eac9158e1d0b55a6bfa99260c'
      },
      {
        bytes: 249_626,
        path: 'public/images/menu/warpkeep-menu-poster-v2.webp',
        sha256: 'd0fa4d4fbd893369a78d7ada828723e7612f95bbf4d8ee0eeef9858a33ce581c'
      }
    ] as const;
    const repositoryRoot = (
      globalThis as typeof globalThis & { process: { cwd: () => string } }
    ).process.cwd();

    for (const assetRecord of auditedAssets) {
      const asset = readFileSync(`${repositoryRoot}/${assetRecord.path}`);
      expect(asset.byteLength).toBe(assetRecord.bytes);
      expect(createHash('sha256').update(asset).digest('hex')).toBe(assetRecord.sha256);
    }

    expect(existsSync(`${repositoryRoot}/public/video/warpkeep-menu-loop.mp4`)).toBe(false);
    expect(existsSync(`${repositoryRoot}/public/images/menu/warpkeep-menu-poster.webp`)).toBe(false);
  });

  it('uses BASE_URL-safe public media paths', () => {
    expect(resolveMenuAssetUrl('/Warpkeep/', '/video/warpkeep-menu-loop-v2.mp4'))
      .toBe('/Warpkeep/video/warpkeep-menu-loop-v2.mp4');
    expect(resolveMenuAssetUrl('/Warpkeep', 'images/menu/poster.webp'))
      .toBe('/Warpkeep/images/menu/poster.webp');
    expect(WARPKEEP_MENU_VIDEO_URL).toContain('video/warpkeep-menu-loop-v2.mp4');
    expect(WARPKEEP_MENU_POSTER_URL).toContain('images/menu/warpkeep-menu-poster-v2.webp');
  });

  it('configures one silent inline looping video over an immediate poster', () => {
    const { container } = render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    const video = container.querySelector('video.warpkeep-menu-background') as HTMLVideoElement;
    const posterFallback = container.querySelector('.warpkeep-menu-poster-fallback') as HTMLElement;

    expect(video).not.toBeNull();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.controls).toBe(false);
    expect(video.autoplay).toBe(true);
    expect(video.preload).toBe('auto');
    expect(video.poster).toContain('images/menu/warpkeep-menu-poster-v2.webp');
    expect(video.src).toContain('video/warpkeep-menu-loop-v2.mp4');
    expect(posterFallback.style.backgroundImage).toContain('warpkeep-menu-poster-v2.webp');
  });

  it('reports readiness once and retains the poster/UI after a media error', () => {
    const onVideoReady = vi.fn();
    const onVideoError = vi.fn();
    const { container } = render(
      <WarpkeepMainMenu
        active
        onRequestReturn={vi.fn()}
        onVideoError={onVideoError}
        onVideoReady={onVideoReady}
      />
    );
    const menu = container.querySelector('main.warpkeep-menu') as HTMLElement;
    const video = container.querySelector('video') as HTMLVideoElement;

    fireEvent.loadedData(video);
    fireEvent.canPlay(video);
    expect(onVideoReady).toHaveBeenCalledTimes(1);
    expect(menu.dataset.mediaState).toBe('ready');

    fireEvent.error(video);
    fireEvent.error(video);
    expect(onVideoError).toHaveBeenCalledTimes(1);
    expect(menu.dataset.mediaState).toBe('error');
    expect(container.querySelector('.warpkeep-menu-poster-fallback')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Hegemony main menu"]')).not.toBeNull();
  });

  it('pauses while inactive or hidden and resumes when visibility returns', () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { rerender } = render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    expect(playSpy).toHaveBeenCalled();

    rerender(<WarpkeepMainMenu active={false} onRequestReturn={vi.fn()} visible={false} />);
    expect(pauseSpy).toHaveBeenCalled();

    rerender(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pauseSpy).toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(playSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it('retries blocked video playback on the next real interaction', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new Error('autoplay blocked'))
      .mockResolvedValue(undefined);
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);

    await Promise.resolve();
    await Promise.resolve();
    expect(playSpy).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(document.body);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it('explicitly pauses the captured video element when the menu unmounts', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { container, unmount } = render(
      <WarpkeepMainMenu active onRequestReturn={vi.fn()} />
    );
    const video = container.querySelector('video') as HTMLVideoElement;
    pauseSpy.mockClear();
    unmount();
    expect(pauseSpy.mock.instances).toContain(video);
  });

  it('uses the poster as a static reduced-motion experience', () => {
    vi.unstubAllGlobals();
    installMotionPreference(true);
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const { container } = render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    const menu = container.querySelector('main.warpkeep-menu') as HTMLElement;
    const video = container.querySelector('video') as HTMLVideoElement;

    expect(menu.dataset.mediaState).toBe('static');
    expect(video.autoplay).toBe(false);
    expect(video.preload).toBe('none');
    expect(playSpy).not.toHaveBeenCalled();
    expect(container.querySelector('.warpkeep-menu-poster-fallback')).not.toBeNull();
  });
});
