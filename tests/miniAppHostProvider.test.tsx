import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MiniAppHostProvider,
  useMiniAppBackNavigation,
  useMiniAppHost,
  type MiniAppBrowserRuntime,
  type MiniAppHostValue,
  type MiniAppSdk,
  type MiniAppSdkEventName
} from '../src/farcaster/miniapp';
import {
  useMiniAppAdmissionGrant,
  type MiniAppAdmissionGrant
} from '../src/farcaster/miniapp/MiniAppHostProvider';
import {
  WarpkeepHapticsDirector,
  emitWarpkeepSfxBatch,
  resolveWarpkeepHapticCue
} from '../src/components/audio';
import { FarcasterAccessRequestAction } from '../src/components/auth/FarcasterAccessRequest';

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
  const listeners = new Map<
    MiniAppSdkEventName,
    Set<(...args: never[]) => void>
  >();
  const on = vi.fn((
    event: MiniAppSdkEventName,
    listener: (...args: never[]) => void
  ) => {
    const eventListeners = listeners.get(event) ?? new Set();
    eventListeners.add(listener);
    listeners.set(event, eventListeners);
  });
  const removeListener = vi.fn((
    event: MiniAppSdkEventName,
    listener: (...args: never[]) => void
  ) => {
    listeners.get(event)?.delete(listener);
  });
  const sdk: MiniAppSdk = {
    isInMiniApp: vi.fn(async () => true),
    context: Promise.resolve(validContext()),
    getCapabilities: vi.fn(async () => [
      'actions.ready',
      'actions.openUrl',
      'haptics.selectionChanged',
      'back'
    ]),
    on,
    removeListener,
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
  const emit = (event: MiniAppSdkEventName, payload?: unknown) => {
    for (const listener of listeners.get(event) ?? []) {
      (listener as (value?: unknown) => void)(payload);
    }
  };
  return { sdk, back, emit, listeners, on, removeListener };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, reject, resolve });
}

function Harness({
  children,
  runtime,
  sdkLoader,
  capture,
  captureGrant,
  hostDeadlineMilliseconds,
  addMiniAppDeadlineMilliseconds,
  quickAuthDeadlineMilliseconds
}: {
  children?: ReactNode;
  runtime: MiniAppBrowserRuntime;
  sdkLoader: () => Promise<unknown>;
  capture: (value: MiniAppHostValue) => void;
  captureGrant?: (value: MiniAppAdmissionGrant | undefined) => void;
  hostDeadlineMilliseconds?: number;
  addMiniAppDeadlineMilliseconds?: number;
  quickAuthDeadlineMilliseconds?: number;
}) {
  function Probe() {
    capture(useMiniAppHost());
    captureGrant?.(useMiniAppAdmissionGrant());
    return <div data-testid="stable-shell">{children}</div>;
  }
  return (
    <MiniAppHostProvider
      hostDeadlineMilliseconds={hostDeadlineMilliseconds}
      addMiniAppDeadlineMilliseconds={addMiniAppDeadlineMilliseconds}
      quickAuthDeadlineMilliseconds={quickAuthDeadlineMilliseconds}
      runtime={runtime}
      sdkLoader={sdkLoader}
    >
      <Probe />
    </MiniAppHostProvider>
  );
}

describe('Farcaster Mini App host provider', () => {
  it('accepts a later same-document notification generation without exposing it in host state', async () => {
    const oldTicket = 'D'.repeat(43);
    const newTicket = 'E'.repeat(43);
    let hash = `#warpkeep-grant-v1=${oldTicket}`;
    let navigationListener: (() => void) | undefined;
    let latest: MiniAppHostValue | undefined;
    let latestGrant: MiniAppAdmissionGrant | undefined;
    const runtime: MiniAppBrowserRuntime = {
      ...runtimeFor('?miniApp=true'),
      hash: () => hash,
      replaceHash: (next) => { hash = next; },
      subscribeNavigationChange: (listener) => {
        navigationListener = listener;
        return () => { navigationListener = undefined; };
      }
    };
    render(
      <Harness
        capture={(value) => { latest = value; }}
        captureGrant={(value) => { latestGrant = value; }}
        runtime={runtime}
        sdkLoader={async () => fakeSdk().sdk}
      />
    );

    await waitFor(() => expect(latestGrant).toBeDefined());
    const oldGrant = latestGrant!;
    expect(oldGrant.read()).toBe(oldTicket);
    expect(oldGrant.notificationId).toBeUndefined();
    expect(JSON.stringify(latest)).not.toContain(oldTicket);

    hash = `#warpkeep-grant-v1=${newTicket}`;
    act(() => navigationListener?.());
    await waitFor(() => expect(latestGrant?.read()).toBe(newTicket));
    expect(latestGrant?.notificationId).toBeUndefined();
    oldGrant.clear(oldTicket);
    expect(latestGrant?.read()).toBe(newTicket);
    expect(JSON.stringify(latest)).not.toContain(newTicket);

    act(() => latestGrant?.clear(newTicket));
    await waitFor(() => expect(latestGrant).toBeUndefined());
  });

  it('pairs a grant only with the exact sanitized Farcaster notification launch context', async () => {
    const ticket = 'G'.repeat(43);
    const intentId = 'I'.repeat(22);
    let hash = `#warpkeep-grant-v1=${ticket}`;
    let latest: MiniAppHostValue | undefined;
    let latestGrant: MiniAppAdmissionGrant | undefined;
    const context = validContext();
    const host = fakeSdk({
      context: Promise.resolve({
        ...context,
        location: {
          type: 'notification',
          notification: {
            notificationId: `warpkeep-access-grant-v3-i${intentId}`,
            title: 'ignored',
            body: 'ignored'
          }
        }
      })
    });
    const runtime: MiniAppBrowserRuntime = {
      ...runtimeFor('?miniApp=true'),
      hash: () => hash,
      replaceHash: (next) => { hash = next; }
    };

    render(
      <Harness
        capture={(value) => { latest = value; }}
        captureGrant={(value) => { latestGrant = value; }}
        runtime={runtime}
        sdkLoader={async () => host.sdk}
      />
    );

    await waitFor(() => expect(latestGrant?.notificationId)
      .toBe(`warpkeep-access-grant-v3-i${intentId}`));
    expect(latestGrant?.read()).toBe(ticket);
    expect(JSON.stringify(latest)).not.toContain(ticket);
    expect(JSON.stringify(latestGrant)).not.toContain(ticket);
  });

  it('reconciles a grant that arrives while navigation subscription is being installed', async () => {
    const ticket = 'F'.repeat(43);
    let hash = '';
    let latest: MiniAppHostValue | undefined;
    let latestGrant: MiniAppAdmissionGrant | undefined;
    const runtime: MiniAppBrowserRuntime = {
      ...runtimeFor('?miniApp=true'),
      hash: () => hash,
      replaceHash: (next) => { hash = next; },
      subscribeNavigationChange: () => {
        // Model a host navigation after render-time capture but before the
        // passive effect has finished registering its listener.
        hash = `#warpkeep-grant-v1=${ticket}`;
        return () => {};
      }
    };

    render(
      <Harness
        capture={(value) => { latest = value; }}
        captureGrant={(value) => { latestGrant = value; }}
        runtime={runtime}
        sdkLoader={async () => fakeSdk().sdk}
      />
    );

    await waitFor(() => expect(latestGrant?.read()).toBe(ticket));
    expect(hash).toBe('#menu');
    expect(JSON.stringify(latest)).not.toContain(ticket);
  });

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

  it('reports a framed regular-web surface without treating it as a Mini App', () => {
    let latest: MiniAppHostValue | undefined;
    const loader = vi.fn(async () => fakeSdk().sdk);
    render(
      <Harness
        runtime={{ ...runtimeFor(''), isFramed: () => true }}
        sdkLoader={loader}
        capture={(value) => { latest = value; }}
      />
    );

    expect(latest?.state).toBe('regular-web');
    expect(latest?.isMiniApp).toBe(false);
    expect(latest?.isFramed).toBe(true);
    expect(loader).not.toHaveBeenCalled();
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

    await waitFor(() => expect(latest?.state).toBe('regular-web'));
    expect(latest?.recoveryReason).toBeNull();
    expect(latest?.retry()).toBe(false);
    expect(contextRead).toBe(false);
    expect(sdk.actions.ready).not.toHaveBeenCalled();
    expect(document.head.querySelector(
      '[data-warpkeep-miniapp-quick-auth-preconnect]'
    )).toBeNull();
  });

  it('distinguishes an SDK detection exception from an explicit regular-web result', async () => {
    const { sdk } = fakeSdk({
      isInMiniApp: vi.fn(async () => {
        throw new Error('private host detail');
      })
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
    expect(latest?.recoveryReason).toBe('sdk-unavailable');
    expect(latest?.retry()).toBe(true);
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
        notificationsEnabledHint: false,
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
    expect(latest?.notificationPresentation).toBe('unsupported');
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

  it('reclamps host safe areas when the embedded viewport changes', async () => {
    let viewport = { width: 400, height: 800 };
    let notifyViewportChange = () => {};
    const unsubscribe = vi.fn();
    const runtime: MiniAppBrowserRuntime = {
      ...runtimeFor('?miniApp=true'),
      viewport: () => viewport,
      subscribeViewportChange: (listener) => {
        notifyViewportChange = listener;
        return unsubscribe;
      }
    };
    const { sdk } = fakeSdk();
    let latest: MiniAppHostValue | undefined;
    const view = render(
      <Harness
        runtime={runtime}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(latest?.context?.client.safeAreaInsets.top).toBe(160);
    expect(latest?.context?.client.safeAreaInsets.left).toBe(100);

    act(() => {
      viewport = { width: 200, height: 400 };
      notifyViewportChange();
    });

    await waitFor(() => {
      expect(latest?.context?.client.safeAreaInsets.top).toBe(100);
      expect(latest?.context?.client.safeAreaInsets.left).toBe(50);
    });
    const styles = document.head.querySelectorAll(
      '[data-warpkeep-miniapp-safe-area]'
    );
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain(
      '--fc-safe-area-inset-top:100px;'
    );
    expect(styles[0]?.textContent).toContain(
      '--fc-safe-area-inset-left:50px;'
    );

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('never re-reads mutable raw host identity or insets after sanitization', async () => {
    let viewport = { width: 400, height: 800 };
    let notifyViewportChange = () => {};
    const rawContext = validContext();
    const runtime: MiniAppBrowserRuntime = {
      ...runtimeFor('?miniApp=true'),
      viewport: () => viewport,
      subscribeViewportChange: (listener) => {
        notifyViewportChange = listener;
        return () => {};
      }
    };
    const { sdk } = fakeSdk({ context: Promise.resolve(rawContext) });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        runtime={runtime}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    rawContext.user.fid = 1_000_001;
    rawContext.user.username = 'spoofed';
    rawContext.client.safeAreaInsets.top = 0;
    rawContext.client.safeAreaInsets.left = 0;

    act(() => {
      viewport = { width: 200, height: 400 };
      notifyViewportChange();
    });

    await waitFor(() => {
      expect(latest?.context?.client.safeAreaInsets.top).toBe(100);
      expect(latest?.context?.client.safeAreaInsets.left).toBe(50);
    });
    expect(latest?.context?.user).toEqual({
      fid: 539_854,
      username: '0xael.eth',
      displayName: 'Ael',
      pfpUrl: 'https://images.example/ael.png'
    });

    act(() => {
      viewport = { width: 800, height: 1_200 };
      notifyViewportChange();
    });

    await waitFor(() => {
      expect(latest?.context?.client.safeAreaInsets.top).toBe(160);
      expect(latest?.context?.client.safeAreaInsets.left).toBe(160);
    });
    expect(latest?.context?.user.fid).toBe(539_854);
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
    expect(await latest!.actions.addMiniApp()).toEqual({
      status: 'unsupported'
    });
    expect(sdk.actions.addMiniApp).not.toHaveBeenCalled();

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

  it('maps clustered game feedback to one capability-checked host haptic', async () => {
    const { sdk } = fakeSdk({
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'haptics.impactOccurred',
        'haptics.notificationOccurred',
        'haptics.selectionChanged'
      ])
    });
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      >
        <WarpkeepHapticsDirector />
      </Harness>
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));

    expect(resolveWarpkeepHapticCue([
      { kind: 'select-worker' },
      { kind: 'worker-dispatch-confirmed', count: 1 }
    ])).toEqual({ kind: 'notification', type: 'success' });
    expect(resolveWarpkeepHapticCue([
      { kind: 'worker-arrived', count: 1 },
      { kind: 'select-water', regime: 'river' }
    ])).toBeUndefined();
    expect(resolveWarpkeepHapticCue([
      { kind: 'access-request-confirmed' }
    ])).toEqual({ kind: 'notification', type: 'success' });

    await act(async () => {
      emitWarpkeepSfxBatch([
        { kind: 'select-worker' },
        { kind: 'worker-dispatch-confirmed', count: 1 }
      ]);
      await Promise.resolve();
    });
    expect(sdk.haptics?.notificationOccurred)
      .toHaveBeenCalledExactlyOnceWith('success');
    expect(sdk.haptics?.selectionChanged).not.toHaveBeenCalled();

    await act(async () => {
      emitWarpkeepSfxBatch([{ kind: 'access-request-confirmed' }]);
      await Promise.resolve();
    });
    expect(sdk.haptics?.notificationOccurred).toHaveBeenCalledTimes(2);
    expect(sdk.haptics?.notificationOccurred).toHaveBeenLastCalledWith('success');

    await act(async () => {
      emitWarpkeepSfxBatch([
        { kind: 'select-gold' },
        { kind: 'select-stone' }
      ]);
      await Promise.resolve();
    });
    expect(sdk.haptics?.selectionChanged).toHaveBeenCalledTimes(1);

    await act(async () => {
      emitWarpkeepSfxBatch([
        { kind: 'worker-recall-confirmed', count: 1 },
        { kind: 'command-failed' }
      ]);
      await Promise.resolve();
    });
    expect(sdk.haptics?.notificationOccurred)
      .toHaveBeenLastCalledWith('error');
  });

  it('gives one light haptic only to the access activation that wins its lock', async () => {
    const { sdk } = fakeSdk({
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'haptics.impactOccurred'
      ])
    });
    const onRequestAccess = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      >
        <FarcasterAccessRequestAction
          onRequestAccess={onRequestAccess}
          state={{ phase: 'request-available' }}
        />
      </Harness>
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));

    const request = screen.getByRole('button', { name: 'REQUEST ACCESS' });
    fireEvent.click(request);
    fireEvent.click(request);

    expect(onRequestAccess).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(sdk.haptics?.impactOccurred)
      .toHaveBeenCalledExactlyOnceWith('light'));
  });

  it('keeps notification events secret-free, generation-bound, and resize-safe', async () => {
    let viewport = { width: 400, height: 800 };
    let notifyViewportChange = () => {};
    const unsubscribe = vi.fn();
    const token = 'private-notification-token';
    const deliveryUrl = 'https://api.warpcast.com/v1/frame-notifications';
    const context = validContext();
    const runtime: MiniAppBrowserRuntime = {
      ...runtimeFor('?miniApp=true'),
      viewport: () => viewport,
      subscribeViewportChange: (listener) => {
        notifyViewportChange = listener;
        return unsubscribe;
      }
    };
    const host = fakeSdk({
      context: Promise.resolve({
        ...context,
        client: {
          ...context.client,
          notificationDetails: { token, url: deliveryUrl }
        },
        location: {
          type: 'notification',
          notification: {
            notificationId: 'warpkeep-access-approved-v1-e42',
            title: 'must-not-pass-through',
            body: 'must-not-pass-through'
          }
        }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    let latest: MiniAppHostValue | undefined;
    const view = render(
      <StrictMode>
        <Harness
          runtime={runtime}
          sdkLoader={async () => host.sdk}
          capture={(value) => { latest = value; }}
        />
      </StrictMode>
    );

    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(latest?.notificationPresentation).toBe('enabled-hint');
    expect(latest?.context?.client.notificationsEnabledHint).toBe(true);
    expect(latest?.context?.notificationId)
      .toBe('warpkeep-access-approved-v1-e42');
    for (const event of [
      'miniAppAdded',
      'miniAppAddRejected',
      'miniAppRemoved',
      'notificationsEnabled',
      'notificationsDisabled'
    ] as const) {
      expect(host.on).toHaveBeenCalledWith(event, expect.any(Function));
    }
    expect(host.on).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(latest?.context)).not.toContain(token);
    expect(JSON.stringify(latest?.context)).not.toContain(deliveryUrl);
    expect(JSON.stringify(latest?.context)).not.toContain('must-not-pass-through');

    act(() => host.emit('notificationsDisabled'));
    expect(latest?.notificationPresentation).toBe('disabled-hint');
    expect(latest?.context?.client.notificationsEnabledHint).toBe(false);
    expect(latest?.context?.notificationId)
      .toBe('warpkeep-access-approved-v1-e42');

    act(() => {
      viewport = { width: 200, height: 400 };
      notifyViewportChange();
    });
    await waitFor(() => {
      expect(latest?.context?.client.safeAreaInsets.top).toBe(100);
    });
    expect(latest?.notificationPresentation).toBe('disabled-hint');
    expect(latest?.context?.client.notificationsEnabledHint).toBe(false);
    expect(latest?.context?.notificationId)
      .toBe('warpkeep-access-approved-v1-e42');

    act(() => host.emit('miniAppAdded', {}));
    expect(latest?.notificationPresentation).toBe('added-status-unknown');
    act(() => host.emit('miniAppAddRejected', {
      reason: 'rejected_by_user'
    }));
    expect(latest?.notificationPresentation).toBe('rejected');
    act(() => host.emit('miniAppAddRejected', {
      reason: 'invalid_domain_manifest'
    }));
    expect(latest?.notificationPresentation).toBe('invalid-manifest');
    const poisonedEvent: Record<string, unknown> = {};
    Object.defineProperty(poisonedEvent, 'notificationDetails', {
      get() {
        throw new Error('private mutable event detail');
      }
    });
    expect(() => act(() => {
      host.emit('notificationsEnabled', poisonedEvent);
    })).not.toThrow();
    expect(latest?.notificationPresentation).toBe('invalid-manifest');
    act(() => host.emit('notificationsEnabled', {
      notificationDetails: { token: 'short', url: deliveryUrl }
    }));
    expect(latest?.notificationPresentation).toBe('failed');
    act(() => host.emit('notificationsEnabled', {
      notificationDetails: { token, url: deliveryUrl }
    }));
    expect(latest?.notificationPresentation).toBe('enabled-hint');
    expect(latest?.context?.client.notificationsEnabledHint).toBe(true);
    act(() => host.emit('miniAppRemoved'));
    expect(latest?.notificationPresentation).toBe('not-added');
    expect(latest?.context?.client.added).toBe(false);

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(host.removeListener).toHaveBeenCalledTimes(5);
    expect(Array.from(host.listeners.values()).every((set) => set.size === 0))
      .toBe(true);
  });

  it('single-flights 20 add prompts, binds the receiver, and discards its private result', async () => {
    const pending = deferred<unknown>();
    const token = 'private-notification-token';
    const deliveryUrl = 'https://api.warpcast.com/v1/frame-notifications';
    const context = validContext();
    const host = fakeSdk({
      context: Promise.resolve({
        ...context,
        client: { ...context.client, added: false }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    const actions = host.sdk.actions;
    const addMiniApp = vi.fn(function (this: unknown) {
      if (this !== actions) throw new Error('receiver lost');
      return pending.promise;
    });
    actions.addMiniApp = addMiniApp;
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => host.sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(latest?.notificationPresentation).toBe('not-added');

    let attempts: Promise<unknown>[] = [];
    act(() => {
      attempts = Array.from(
        { length: 20 },
        () => latest!.actions.addMiniApp()
      );
    });
    expect(new Set(attempts).size).toBe(1);
    expect(latest?.notificationPresentation).toBe('requesting');
    await act(async () => Promise.resolve());
    expect(addMiniApp).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({
        notificationDetails: { token, url: deliveryUrl }
      });
      await attempts[0];
    });
    await expect(attempts[0]).resolves.toEqual({ status: 'enabled-hint' });
    expect(latest?.notificationPresentation).toBe('enabled-hint');
    expect(latest?.context?.client.added).toBe(true);
    expect(latest?.context?.client.notificationsEnabledHint).toBe(true);
    expect(JSON.stringify(latest)).not.toContain(token);
    expect(JSON.stringify(latest)).not.toContain(deliveryUrl);
    expect(document.body.textContent).not.toContain(token);
    expect(document.body.textContent).not.toContain(deliveryUrl);
    await expect(latest!.actions.addMiniApp()).resolves.toEqual({
      status: 'enabled-hint'
    });
    expect(addMiniApp).toHaveBeenCalledTimes(1);
    expect(storageWrite).not.toHaveBeenCalled();
    storageWrite.mockRestore();
  });

  it('coalesces touch, synthetic click, and repeated Enter activations', async () => {
    const pending = deferred<unknown>();
    const context = validContext();
    const host = fakeSdk({
      context: Promise.resolve({
        ...context,
        client: { ...context.client, added: false }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    const addMiniApp = vi.fn(() => pending.promise);
    host.sdk.actions.addMiniApp = addMiniApp;
    let latest: MiniAppHostValue | undefined;

    function ActionProbe() {
      const { actions } = useMiniAppHost();
      const activate = () => { void actions.addMiniApp(); };
      return (
        <button
          onClick={activate}
          onKeyDown={(event) => {
            if (event.key === 'Enter') activate();
          }}
          onPointerUp={activate}
          type="button"
        >
          Enable alerts
        </button>
      );
    }

    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => host.sdk}
        capture={(value) => { latest = value; }}
      >
        <ActionProbe />
      </Harness>
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    const button = screen.getByRole('button', { name: 'Enable alerts' });
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    for (let index = 0; index < 20; index += 1) {
      fireEvent.keyDown(button, { key: 'Enter', repeat: index > 0 });
    }
    await act(async () => Promise.resolve());
    expect(addMiniApp).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({});
      await Promise.resolve();
    });
  });

  it('maps add-prompt outcomes without exposing host errors', async () => {
    const context = validContext();
    const host = fakeSdk({
      context: Promise.resolve({
        ...context,
        client: { ...context.client, added: false }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    const rejected = Object.assign(new Error('private rejection'), {
      name: 'AddMiniApp.RejectedByUser'
    });
    const invalid = Object.assign(new Error('private manifest detail'), {
      name: 'AddMiniApp.InvalidDomainManifest'
    });
    host.sdk.actions.addMiniApp = vi.fn()
      .mockRejectedValueOnce(rejected)
      .mockRejectedValueOnce(invalid)
      .mockRejectedValueOnce(new Error('private generic detail'))
      .mockResolvedValueOnce({});
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => host.sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));

    const runPrompt = async () => {
      let result;
      await act(async () => {
        result = await latest!.actions.addMiniApp();
      });
      return result;
    };

    await expect(runPrompt()).resolves.toEqual({
      status: 'rejected'
    });
    expect(latest?.notificationPresentation).toBe('rejected');
    await expect(runPrompt()).resolves.toEqual({
      status: 'invalid-manifest'
    });
    expect(latest?.notificationPresentation).toBe('invalid-manifest');
    await expect(runPrompt()).resolves.toEqual({
      status: 'failed'
    });
    expect(latest?.notificationPresentation).toBe('failed');
    await expect(runPrompt()).resolves.toEqual({
      status: 'setup-requested'
    });
    expect(latest?.notificationPresentation).toBe('setup-requested');
    expect(document.body.textContent).not.toContain('private rejection');
    expect(document.body.textContent).not.toContain('private manifest detail');
    expect(document.body.textContent).not.toContain('private generic detail');
  });

  it('keeps a timed-out native prompt single-flight and reconciles its late result', async () => {
    vi.useFakeTimers();
    const context = validContext();
    const host = fakeSdk({
      context: Promise.resolve({
        ...context,
        client: { ...context.client, added: false }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    const pending = deferred<unknown>();
    const addMiniApp = vi.fn(() => pending.promise);
    host.sdk.actions.addMiniApp = addMiniApp;
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        addMiniAppDeadlineMilliseconds={250}
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => host.sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(latest?.state).toBe('miniapp');

    const attempt = latest!.actions.addMiniApp();
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(251);
    });
    await expect(attempt).resolves.toEqual({ status: 'timeout' });
    expect(latest?.notificationPresentation).toBe('setup-requested');
    await expect(latest!.actions.addMiniApp()).resolves.toEqual({
      status: 'timeout'
    });
    expect(addMiniApp).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({
        notificationDetails: {
          token: 'private-notification-token',
          url: 'https://api.warpcast.com/v1/frame-notifications'
        }
      });
      await pending.promise;
    });
    expect(latest?.notificationPresentation).toBe('enabled-hint');
    expect(addMiniApp).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh retry after rejection and ignores the old late result', async () => {
    const firstPending = deferred<unknown>();
    const retryPending = deferred<unknown>();
    const context = validContext();
    const host = fakeSdk({
      context: Promise.resolve({
        ...context,
        client: { ...context.client, added: false }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    const addMiniApp = vi.fn()
      .mockImplementationOnce(() => firstPending.promise)
      .mockImplementationOnce(() => retryPending.promise);
    host.sdk.actions.addMiniApp = addMiniApp;
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => host.sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));

    const attempt = latest!.actions.addMiniApp();
    await act(async () => Promise.resolve());
    act(() => host.emit('miniAppAddRejected', {
      reason: 'rejected_by_user'
    }));
    expect(latest?.notificationPresentation).toBe('rejected');

    const retry = latest!.actions.addMiniApp();
    await act(async () => Promise.resolve());
    expect(addMiniApp).toHaveBeenCalledTimes(2);
    expect(latest?.notificationPresentation).toBe('requesting');

    await act(async () => {
      firstPending.resolve({
        notificationDetails: {
          token: 'private-notification-token',
          url: 'https://api.warpcast.com/v1/frame-notifications'
        }
      });
      await attempt;
    });
    await expect(attempt).resolves.toEqual({ status: 'enabled-hint' });
    expect(latest?.notificationPresentation).toBe('requesting');

    await act(async () => {
      retryPending.resolve({
        notificationDetails: {
          token: 'private-retry-notification-token',
          url: 'https://api.warpcast.com/v1/frame-notifications'
        }
      });
      await retry;
    });
    await expect(retry).resolves.toEqual({ status: 'enabled-hint' });
    expect(latest?.notificationPresentation).toBe('enabled-hint');
    expect(addMiniApp).toHaveBeenCalledTimes(2);
  });

  it('cleans exact listeners and ignores an add result from a replaced host', async () => {
    const pending = deferred<unknown>();
    const context = validContext();
    const first = fakeSdk({
      context: Promise.resolve({
        ...context,
        client: { ...context.client, added: false }
      }),
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    first.sdk.actions.addMiniApp = vi.fn(() => pending.promise);
    const second = fakeSdk({
      getCapabilities: vi.fn(async () => [
        'actions.ready',
        'actions.addMiniApp'
      ])
    });
    const firstLoader = async () => first.sdk;
    const secondLoader = async () => second.sdk;
    const firstRuntime = runtimeFor('?miniApp=true');
    const secondRuntime = runtimeFor('?miniApp=true');
    let latest: MiniAppHostValue | undefined;
    const view = render(
      <Harness
        runtime={firstRuntime}
        sdkLoader={firstLoader}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    const attempt = latest!.actions.addMiniApp();
    await act(async () => Promise.resolve());
    expect(first.sdk.actions.addMiniApp).toHaveBeenCalledTimes(1);

    view.rerender(
      <Harness
        runtime={secondRuntime}
        sdkLoader={secondLoader}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(second.sdk.actions.ready).toHaveBeenCalledOnce());
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(first.removeListener).toHaveBeenCalledTimes(5);
    expect(second.on).toHaveBeenCalledTimes(5);
    const replacementPresentation = latest?.notificationPresentation;

    act(() => first.emit('notificationsDisabled'));
    expect(latest?.notificationPresentation).toBe(replacementPresentation);
    pending.resolve({
      notificationDetails: {
        token: 'private-notification-token',
        url: 'https://api.warpcast.com/v1/frame-notifications'
      }
    });
    await expect(attempt).resolves.toEqual({ status: 'host-replaced' });
    expect(latest?.notificationPresentation).toBe(replacementPresentation);
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

    expect(await latest!.quickAuth.getToken()).toEqual({ status: 'unsupported' });
    expect(getToken).not.toHaveBeenCalled();
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    await expect(latest!.quickAuth.getToken()).resolves.toEqual({
      status: 'token',
      token
    });
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('binds the Quick Auth receiver and passes only the documented force option', async () => {
    const token = `${'a'.repeat(16)}.${'b'.repeat(24)}.${'c'.repeat(32)}`;
    const receiver: NonNullable<MiniAppSdk['quickAuth']> = {};
    const getToken = vi.fn(async function (
      this: unknown,
      options?: { force?: boolean }
    ) {
      if (this !== receiver) throw new Error('receiver lost');
      if (options?.force !== true) throw new Error('force missing');
      return { token };
    });
    receiver.getToken = getToken;
    const { sdk } = fakeSdk({ quickAuth: receiver });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));

    await expect(latest!.quickAuth.getToken({ force: true })).resolves.toEqual({
      status: 'token',
      token
    });
    expect(getToken).toHaveBeenCalledExactlyOnceWith({ force: true });
  });

  it('allows a cold mobile Quick Auth round trip to outlive the generic host deadline', async () => {
    vi.useFakeTimers();
    const token = `${'a'.repeat(16)}.${'b'.repeat(24)}.${'c'.repeat(32)}`;
    const getToken = vi.fn(() => new Promise<unknown>((resolve) => {
      window.setTimeout(() => resolve({ token }), 700);
    }));
    const { sdk } = fakeSdk({ quickAuth: { getToken } });
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        hostDeadlineMilliseconds={250}
        quickAuthDeadlineMilliseconds={1_000}
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(latest?.state).toBe('miniapp');

    const acquisition = latest!.quickAuth.getToken();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(701);
    });
    await expect(acquisition).resolves.toEqual({ status: 'token', token });
  });

  it('coalesces concurrent host acquisitions without duplicating native sign-in', async () => {
    const token = `${'a'.repeat(16)}.${'b'.repeat(24)}.${'c'.repeat(32)}`;
    const pending = deferred<unknown>();
    const getToken = vi.fn(() => pending.promise);
    const { sdk } = fakeSdk({ quickAuth: { getToken } });
    let latest: MiniAppHostValue | undefined;
    render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));

    const first = latest!.quickAuth.getToken();
    const second = latest!.quickAuth.getToken();
    expect(first).toBe(second);
    pending.resolve({ token });
    await expect(first).resolves.toEqual({ status: 'token', token });
    await expect(second).resolves.toEqual({ status: 'token', token });
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('classifies SDK rejection and host replacement without exposing either error', async () => {
    const rejectedSdk = fakeSdk({
      quickAuth: { getToken: vi.fn(async () => { throw new Error('private rejection'); }) }
    }).sdk;
    let latest: MiniAppHostValue | undefined;
    const view = render(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => rejectedSdk}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    await expect(latest!.quickAuth.getToken()).resolves.toEqual({ status: 'rejected' });

    const pending = deferred<unknown>();
    const firstSdk = fakeSdk({ quickAuth: { getToken: vi.fn(() => pending.promise) } }).sdk;
    const secondSdk = fakeSdk().sdk;
    const firstLoader = async () => firstSdk;
    const secondLoader = async () => secondSdk;
    view.rerender(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={firstLoader}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    const acquisition = latest!.quickAuth.getToken();
    view.rerender(
      <Harness
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={secondLoader}
        capture={(value) => { latest = value; }}
      />
    );
    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    pending.resolve({ token: `${'a'.repeat(16)}.${'b'.repeat(24)}.${'c'.repeat(32)}` });
    await expect(acquisition).resolves.toEqual({ status: 'host-replaced' });
    expect(document.body.textContent).not.toContain('private rejection');
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
    await expect(latest!.quickAuth.getToken()).resolves.toEqual({
      status: 'invalid-shape'
    });
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

  it('recovers when the host ready method changes after SDK validation', async () => {
    const { sdk } = fakeSdk();
    let readyReads = 0;
    Object.defineProperty(sdk.actions, 'ready', {
      configurable: true,
      get() {
        readyReads += 1;
        if (readyReads === 1) return async () => {};
        throw new Error('private mutable host failure');
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
  });

  it('ignores a throwing optional Back getter and still opens the Mini App', async () => {
    const { sdk } = fakeSdk();
    Object.defineProperty(sdk, 'back', {
      configurable: true,
      get() {
        throw new Error('private optional host failure');
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
    expect(latest?.recoveryReason).toBeNull();
    expect(sdk.actions.ready).toHaveBeenCalledTimes(1);
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

  it('single-flights an in-place recovery retry and ignores the sealed generation', async () => {
    const ready = vi.fn()
      .mockRejectedValueOnce(new Error('private transient host failure'))
      .mockResolvedValue(undefined);
    const { sdk } = fakeSdk({ actions: { ready } });
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
    expect(document.head.querySelector(
      '[data-warpkeep-miniapp-safe-area]'
    )).toBeNull();

    expect(latest?.retry()).toBe(true);
    expect(latest?.retry()).toBe(false);
    expect(latest?.state).toBe('recovery');

    await waitFor(() => expect(latest?.state).toBe('miniapp'));
    expect(ready).toHaveBeenCalledTimes(2);
    expect(latest?.recoveryReason).toBeNull();
    expect(document.head.querySelector(
      '[data-warpkeep-miniapp-safe-area]'
    )).not.toBeNull();
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

  it('returns a typed timeout when a verified host stalls while issuing Quick Auth', async () => {
    vi.useFakeTimers();
    const getToken = vi.fn(() => new Promise<unknown>(() => undefined));
    const { sdk } = fakeSdk({ quickAuth: { getToken } });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        hostDeadlineMilliseconds={250}
        quickAuthDeadlineMilliseconds={1_000}
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
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_001);
    });

    await expect(tokenPromise).resolves.toEqual({ status: 'timeout' });
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('bounds every retry when the SDK retains one poisoned pending promise', async () => {
    vi.useFakeTimers();
    const nativeRoundTrip = vi.fn(() => new Promise<unknown>(() => undefined));
    let sdkPending: Promise<unknown> | undefined;
    const getToken = vi.fn(() => {
      sdkPending ??= nativeRoundTrip();
      return sdkPending;
    });
    const { sdk } = fakeSdk({ quickAuth: { getToken } });
    let latest: MiniAppHostValue | undefined;

    render(
      <Harness
        hostDeadlineMilliseconds={250}
        quickAuthDeadlineMilliseconds={1_000}
        runtime={runtimeFor('?miniApp=true')}
        sdkLoader={async () => sdk}
        capture={(value) => { latest = value; }}
      />
    );

    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    const first = latest!.quickAuth.getToken();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });
    await expect(first).resolves.toEqual({ status: 'timeout' });

    const forced = latest!.quickAuth.getToken({ force: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });
    await expect(forced).resolves.toEqual({ status: 'timeout' });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(nativeRoundTrip).toHaveBeenCalledTimes(1);
  });
});
