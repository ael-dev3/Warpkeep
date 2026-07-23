import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadProfileImage = vi.hoisted(() => vi.fn());

vi.mock('../src/components/realm/loadRealmProfileImage', () => ({
  loadBoundedRealmProfileImage: loadProfileImage
}));

import {
  REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS,
  REALM_PROFILE_IMAGE_RETRY_DELAY_MS,
  StaticProfileImageCanvas
} from '../src/components/profile/StaticProfileImageCanvas';

const URL = 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/abcdefgh/public';

function pendingLoad(_url: string, options: { signal: AbortSignal }) {
  return new Promise<never>((_resolve, reject) => {
    options.signal.addEventListener(
      'abort',
      () => reject(new Error('aborted')),
      { once: true }
    );
  });
}

afterEach(() => {
  vi.useRealTimers();
  loadProfileImage.mockReset();
  vi.restoreAllMocks();
});

describe('shared static profile-image lifecycle', () => {
  it('deduplicates concurrent consumers and aborts only after the final release', () => {
    loadProfileImage.mockImplementation(pendingLoad);
    const first = render(
      <StaticProfileImageCanvas fallback={<span>A</span>} safeUrl={URL} snapshotPixels={64} />
    );
    const second = render(
      <StaticProfileImageCanvas fallback={<span>B</span>} safeUrl={URL} snapshotPixels={96} />
    );

    expect(loadProfileImage).toHaveBeenCalledTimes(1);
    const signal = loadProfileImage.mock.calls[0]![1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    first.unmount();
    expect(signal.aborted).toBe(false);
    second.unmount();
    expect(signal.aborted).toBe(true);
  });

  it('queues excess unique sources without rejecting mounted consumers', async () => {
    const pending: Array<{
      resolve: (loaded: {
        image: HTMLImageElement;
        dispose: () => void;
      }) => void;
    }> = [];
    loadProfileImage.mockImplementation((_url: string, options: { signal: AbortSignal }) => (
      new Promise((resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true }
        );
        pending.push({ resolve });
      })
    ));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    const view = render(
      <>
        {Array.from(
          { length: REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS + 3 },
          (_, index) => (
            <StaticProfileImageCanvas
              fallback={<span>{index}</span>}
              key={index}
              safeUrl={`${URL}-${index}`}
              snapshotPixels={64}
            />
          )
        )}
      </>
    );

    expect(loadProfileImage).toHaveBeenCalledTimes(
      REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS
    );
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalHeight: { value: 64 },
      naturalWidth: { value: 64 }
    });
    await act(async () => pending[0]!.resolve({ image, dispose: vi.fn() }));
    await waitFor(() => {
      expect(loadProfileImage).toHaveBeenCalledTimes(
        REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS + 1
      );
    });

    await act(async () => view.unmount());
    expect(loadProfileImage.mock.calls.slice(1).every(
      (call) => (call[1].signal as AbortSignal).aborted
    )).toBe(true);
  });

  it('does not reuse an aborted slot until its loader promise settles', async () => {
    const pending: Array<{ reject: (reason: unknown) => void }> = [];
    loadProfileImage.mockImplementation(() => new Promise((_resolve, reject) => {
      pending.push({ reject });
    }));
    const activeViews = Array.from(
      { length: REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS },
      (_, index) => render(
        <StaticProfileImageCanvas
          fallback={<span>{index}</span>}
          safeUrl={`${URL}-active-${index}`}
          snapshotPixels={64}
        />
      )
    );
    const queuedView = render(
      <StaticProfileImageCanvas
        fallback={<span>queued</span>}
        safeUrl={`${URL}-queued`}
        snapshotPixels={64}
      />
    );
    expect(loadProfileImage).toHaveBeenCalledTimes(
      REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS
    );

    for (const view of activeViews) view.unmount();
    expect(loadProfileImage).toHaveBeenCalledTimes(
      REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS
    );

    await act(async () => pending[0]!.reject(new Error('settled after abort')));
    await waitFor(() => {
      expect(loadProfileImage).toHaveBeenCalledTimes(
        REALM_PROFILE_IMAGE_MAX_CONCURRENT_LOADS + 1
      );
    });

    queuedView.unmount();
    await act(async () => {
      for (const load of pending.slice(1)) load.reject(new Error('test cleanup'));
    });
  });

  it('recovers from one transient reviewed-CDN failure without retrying indefinitely', async () => {
    vi.useFakeTimers();
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalHeight: { value: 64 },
      naturalWidth: { value: 64 }
    });
    const dispose = vi.fn();
    loadProfileImage
      .mockRejectedValueOnce(new Error('transient CDN failure'))
      .mockResolvedValueOnce({ image, dispose });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);

    const view = render(
      <StaticProfileImageCanvas
        fallback={<span>V</span>}
        safeUrl={`${URL}-retry`}
        snapshotPixels={64}
      />
    );
    await act(async () => undefined);
    expect(loadProfileImage).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('canvas')?.dataset.profileImageState)
      .toBe('unavailable');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REALM_PROFILE_IMAGE_RETRY_DELAY_MS);
    });
    expect(loadProfileImage).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('canvas')?.dataset.profileImageState).toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REALM_PROFILE_IMAGE_RETRY_DELAY_MS * 4);
    });
    expect(loadProfileImage).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
