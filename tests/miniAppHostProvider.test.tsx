import { act, cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MiniAppHostProvider,
  useMiniAppBackNavigation,
  useMiniAppHost,
  type MiniAppBrowserRuntime,
  type MiniAppHostValue,
  type MiniAppSdk
} from '../src/farcaster/miniapp';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  document.head
    .querySelectorAll('[data-warpkeep-miniapp-safe-area]')
    .forEach((element) => element.remove());
  document.head
    .querySelectorAll('[data-warpkeep-miniapp-quick-auth-preconnect]')
    .forEach((element) => element.remove());
});

function runtimeFor(
  search: string,
  frame: () => Promise<void> = async () => {}
): MiniAppBrowserRuntime {
  return {
    search: () => search,
    viewport: () => ({ width: 400, height: 800 }),
    document,
    getMountedShell: () => document.body,
    waitForAnimationFrame: frame
  };
}

function validContext() {
  return {
    user: {
      fid: 539_854,
      username: '0xael.eth',
      displayName: 'Ael',
      pfpUrl: 'https://images.example/ael.png'
    },
    client: {
      clientFid: 9_150,
      added: true,
      platformType: 'mobile',
      safeAreaInsets: {
        top: 999,
        right: 30,
        bottom: -5,
        left: 999
      }
    },
    features: { haptics: true },
    location: {
      type: 'launcher',
      privateHostPayload: 'must-not-pass-through'
    }
  };
}

function fakeSdk(overrides: Partial<MiniAppSdk> = {}) {
  const back = {
    onback: null as (() => unknown) | null,
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {})
  };
  const sdk: MiniAppSdk = {
    isInMiniApp: vi.fn(async () => true),
    context: Promise.resolve(validContext()),
    getCapabilities: vi.fn(async () => [
      'actions.ready',
      'actions.openUrl',
      'haptics.selectionChanged',
      'back'
    ]),
    back,
    actions: {
      ready: vi.fn(async () => {}),
      openUrl: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      addMiniApp: vi.fn(async () => {}),
      viewProfile: vi.fn(async () => {}),
      openMiniApp: vi.fn(async () => {})
    },
    haptics: {
      impactOccurred: vi.fn(async () => {}),
      notificationOccurred: vi.fn(async () => {}),
      selectionChanged: vi.fn(async () => {})
    },
    ...overrides
  };
  return { sdk, back };
}

function Harness({
  children,
  runtime,
  sdkLoader,
  capture,
  hostDeadlineMilliseconds
}: {
  children?: ReactNode;
  runtime: MiniAppBrowserRuntime;
  sdkLoader: () => Promise<unknown>;
  capture: (value: MiniAppHostValue) => void;
  hostDeadlineMilliseconds?: number;
}) {
  function Probe() {
    capture(useMiniAppHost());
    return <div data-testid="stable-shell">{children}</div>;
  }
  return (
    <MiniAppHostProvider
      hostDeadlineMilliseconds={hostDeadlineMilliseconds}
      runtime={runtime}
      sdkLoader={sdkLoader}
    >
      <Probe />
    </MiniAppHostProvider>
  );
}

describe('Farcaster Mini App host provider', () => {
  it('does not import or signal the host without the exact hint', async () => {
    for (const search of [
      '',
      '?miniApp=false',
      '?miniApp=True',
      '?miniApp=true&miniApp=true'
    ]) {
      let latest: MiniAppHostValue | undefined;
      const loader = vi.fn(async () => fakeSdk().sdk);
      const view = render(
        <Harness
          runtime={runtimeFor(search)}
          sdkLoader={loader}
          capture={(value) => { latest = value; }}
        />
      );

      expect(latest?.state).toBe('regular-web');
      expect(latest?.isMiniApp).toBe(false);
      expect(loader).not.toHaveBeenCalled();
      expect(document.head.querySelector(
        '[data-warpkeep-miniapp-quick-auth-preconnect]'
      )).toBeNull();
      view.unmount();
    }
  });

  it('requires isInMiniApp proof before reading context or calling ready', async () => {
    let contextRead = false;
    const { sdk } = fakeSdk({
      isInMiniApp: vi.fn(async () => false)
    });
    Object.defineProperty(sdk, 'context', {
      get() {
        contextRead = true;
        return Promise.resolve(validContext());
      }
    });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await waitFor(() => expect(latest?.state).toBe('recovery'));
    expect(latest?.recoveryReason).toBe('not-in-miniapp');
    expect(contextRead).toBe(false);
    expect(sdk.actions.ready).not.toHaveBeenCalled();
  });

  it('installs sanitized context and CSS before one bounded ready signal', async () => {
    const frames: string[] = [];
    const ready = vi.fn(async () => {
      expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(document.head.querySelector(
      '[data-warpkeep-miniapp-safe-area]'
    )).not.toBeNull();
    expect(document.head.querySelector<HTMLLinkElement>(
      '[data-warpkeep-miniapp-quick-auth-preconnect]'
    )?.href).toBe('https://auth.farcaster.xyz/');
    });
    const { sdk, back } = fakeSdk({
      actions: { ready }
    });
    let latest: MiniAppHostValue | undefined;
    const loader = vi.fn(async () => sdk);

    render(
      <StrictMode>
        <Harness
          runtime={runtimeFor('?release=alpha&miniApp=true', async () => {
            frames.push('frame');
          })}
          sdkLoader={loader}
          capture={(value) => { latest = value; }}
        />
      </StrictMode>
    );

    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    expect(ready).toHaveBeenCalledWith({
      disableNativeGestures: true
    });
    expect(back.hide).toHaveBeenCalled();
    expect(back.hide.mock.invocationCallOrder[0])
      .toBeLessThan(ready.mock.invocationCallOrder[0]);
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(latest?.state).toBe('miniapp');
    expect(latest?.context).toEqual({
      user: {
        fid: 539_854,
        username: '0xael.eth',
        displayName: 'Ael',
        pfpUrl: 'https://images.example/ael.png'
      },
      client: {
        clientFid: 9_150,
        added: true,
        platformType: 'mobile',
        safeAreaInsets: {
          top: 160,
          right: 30,
          bottom: 0,
          left: 100
        }
      },
      features: {
        haptics: true,
        cameraAndMicrophoneAccess: false
      },
      locationType: 'launcher'
    });
    expect(JSON.stringify(latest?.context)).not.toContain('privateHostPayload');

    const safeAreaStyle = document.head.querySelector(
      '[data-warpkeep-miniapp-safe-area]'
    );
    expect(safeAreaStyle?.textContent).toContain(
      '--fc-safe-area-inset-top:160px;'
    );
    expect(safeAreaStyle?.textContent).toContain(
      '--fc-safe-area-inset-left:100px;'
    );
  });

  it('gates actions, haptics, and back navigation by exact capabilities', async () => {
    const { sdk, back } = fakeSdk();
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));

    expect(await latest!.actions.openUrl('https://warpkeep.com/terms/'))
      .toBe(true);
    expect(sdk.actions.openUrl).toHaveBeenCalledWith(
      'https://warpkeep.com/terms/'
    );
    expect(await latest!.actions.openUrl('javascript:alert(1)')).toBe(false);
    expect(await latest!.actions.close()).toBe(false);
    expect(sdk.actions.close).not.toHaveBeenCalled();

    expect(await latest!.haptics.selectionChanged()).toBe(true);
    expect(await latest!.haptics.impactOccurred('light')).toBe(false);
    expect(sdk.haptics?.impactOccurred).not.toHaveBeenCalled();

    const onBack = vi.fn();
    const cleanupBack = latest!.bindBackNavigation({ depth: 2, onBack });
    await waitFor(() => expect(back.show).toHaveBeenCalledTimes(1));
    back.onback?.();
    expect(onBack).toHaveBeenCalledTimes(1);
    cleanupBack();
    await waitFor(() => expect(back.hide).toHaveBeenCalled());
    expect(back.onback).toBeNull();

    const rootCleanup = latest!.bindBackNavigation({ depth: 0, onBack });
    await waitFor(() => expect(back.hide).toHaveBeenCalledTimes(2));
    expect(back.show).toHaveBeenCalledTimes(1);
    expect(back.onback).toBeNull();
    rootCleanup();
  });

  it('returns a fresh Quick Auth bearer only after verified host detection', async () => {
    const token = `${'a'.repeat(16)}.${'b'.repeat(24)}.${'c'.repeat(32)}`;
    const getToken = vi.fn(async () => ({ token }));
    const { sdk } = fakeSdk({
      quickAuth: { getToken }
    });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    expect(await latest!.quickAuth.getToken()).toBeNull();
    expect(getToken).not.toHaveBeenCalled();
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    await expect(latest!.quickAuth.getToken()).resolves.toBe(token);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed Quick Auth SDK results without exposing them', async () => {
    const { sdk } = fakeSdk({
      quickAuth: {
        getToken: vi.fn(async () => ({
          token: 'not-a-compact-jwt',
          privateContext: 'must-not-pass-through'
        }))
      }
    });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    await expect(latest!.quickAuth.getToken()).resolves.toBeNull();
  });

  it('binds the back hook after detection and cleans it on unmount', async () => {
    const { sdk, back } = fakeSdk();
    const onBack = vi.fn();

    function BackHookProbe() {
      useMiniAppBackNavigation(1, onBack);
      return <div>realm detail</div>;
    }

    const view = render(
      <MiniAppHostProvider
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
      >
        <BackHookProbe />
      </MiniAppHostProvider>
    );

    await waitFor(() => expect(back.show).toHaveBeenCalledTimes(1));
    back.onback?.();
    expect(onBack).toHaveBeenCalledTimes(1);

    view.unmount();
    await waitFor(() => expect(back.hide).toHaveBeenCalled());
    expect(back.onback).toBeNull();
  });

  it('updates nested Back callbacks without hiding and re-showing the host control', async () => {
    const { sdk, back } = fakeSdk();
    const runtime = runtimeFor('?miniApp=true');
    const loader = async () => sdk;
    const firstBack = vi.fn();
    const secondBack = vi.fn();

    function BackHookProbe({
      depth,
      onBack
    }: Readonly<{
      depth: number;
      onBack: () => void;
    }>) {
      useMiniAppBackNavigation(depth, onBack);
      return <div>realm detail</div>;
    }

    const view = render(
      <MiniAppHostProvider runtime={runtime} sdkLoader={loader}>
        <BackHookProbe depth={1} onBack={firstBack} />
      </MiniAppHostProvider>
    );

    await waitFor(() => expect(back.show).toHaveBeenCalledTimes(1));
    const hideCount = back.hide.mock.calls.length;
    view.rerender(
      <MiniAppHostProvider runtime={runtime} sdkLoader={loader}>
        <BackHookProbe depth={2} onBack={secondBack} />
      </MiniAppHostProvider>
    );
    await act(async () => Promise.resolve());

    expect(back.show).toHaveBeenCalledTimes(1);
    expect(back.hide).toHaveBeenCalledTimes(hideCount);
    back.onback?.();
    expect(firstBack).not.toHaveBeenCalled();
    expect(secondBack).toHaveBeenCalledOnce();
  });

  it('enters recovery and removes host CSS after a single ready failure', async () => {
    const ready = vi.fn(async () => {
      throw new Error('private host failure');
    });
    const { sdk } = fakeSdk({
      actions: {
        ready
      }
    });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await waitFor(() => expect(latest?.state).toBe('recovery'));
    expect(latest?.recoveryReason).toBe('ready-failed');
    expect(ready).toHaveBeenCalledTimes(1);
    expect(document.head.querySelector(
      '[data-warpkeep-miniapp-safe-area]'
    )).toBeNull();
  });

  it('allows a fresh mount to retry after a failed ready attempt', async () => {
    const ready = vi.fn()
      .mockRejectedValueOnce(new Error('private transient host failure'))
      .mockResolvedValue(undefined);
    const { sdk } = fakeSdk({ actions: { ready } });
    const runtime = runtimeFor('?miniApp=true');
    let latest: MiniAppHostValue | undefined;

    const first = render(
      <Harness
        runtime={runtime}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('recovery'));
    expect(latest?.recoveryReason).toBe('ready-failed');
    first.unmount();

    latest = undefined;
    render(
      <Harness
        runtime={runtime}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it('signals ready again for a genuine later host mount using the same runtime', async () => {
    const runtime = runtimeFor('?miniApp=true');
    const firstReady = vi.fn(async () => {});
    const secondReady = vi.fn(async () => {});
    const firstSdk = fakeSdk({ actions: { ready: firstReady } }).sdk;
    const secondSdk = fakeSdk({ actions: { ready: secondReady } }).sdk;
    let latest: MiniAppHostValue | undefined;

    const first = render(
      <Harness
        runtime={runtime}
        sdkLoader={async () => firstSdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(firstReady).toHaveBeenCalledOnce();
    first.unmount();

    latest = undefined;
    render(
      <Harness
        runtime={runtime}
        sdkLoader={async () => secondSdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(secondReady).toHaveBeenCalledOnce();
  });

  it('signals the replacement host when a mounted provider receives a new runtime', async () => {
    const firstReady = vi.fn(async () => {});
    const secondReady = vi.fn(async () => {});
    const firstSdk = fakeSdk({ actions: { ready: firstReady } }).sdk;
    const secondSdk = fakeSdk({ actions: { ready: secondReady } }).sdk;
    const firstLoader = async () => firstSdk;
    const secondLoader = async () => secondSdk;
    let latest: MiniAppHostValue | undefined;

    const view = render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={firstLoader}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(firstReady).toHaveBeenCalledOnce();

    latest = undefined;
    view.rerender(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={secondLoader}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(secondReady).toHaveBeenCalledOnce());
  });

  it('bounds a stalled ready call before exposing Mini App authority', async () => {
    vi.useFakeTimers();
    const ready = vi.fn(() => new Promise<void>(() => undefined));
    const { sdk } = fakeSdk({ actions: { ready } });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        hostDeadlineMilliseconds={250}
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(251);
    });

    expect(ready).toHaveBeenCalledTimes(1);
    expect(latest?.state).toBe('recovery');
    expect(latest?.recoveryReason).toBe('host-timeout');
    expect(latest?.isMiniApp).toBe(false);
  });

  it('returns null when a verified host stalls while issuing Quick Auth', async () => {
    vi.useFakeTimers();
    const getToken = vi.fn(() => new Promise<unknown>(() => undefined));
    const { sdk } = fakeSdk({ quickAuth: { getToken } });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        hostDeadlineMilliseconds={250}
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(latest?.state).toBe('miniapp');
    const tokenPromise = latest!.quickAuth.getToken();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(251);
    });

    await expect(tokenPromise).resolves.toBeNull();
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});
