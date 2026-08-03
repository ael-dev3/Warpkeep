import { describe, expect, it, vi } from 'vitest';

import {
  hasExactMiniAppHint,
  installMiniAppQuickAuthPreconnect,
  readMiniAppNotificationDetailsHint,
  readMiniAppQuickAuthToken,
  sanitizeMiniAppCapabilities,
  sanitizeMiniAppContext
} from '../src/farcaster/miniapp';

describe('Farcaster Mini App runtime sanitization', () => {
  it('accepts only one exact miniApp=true query value', () => {
    expect(hasExactMiniAppHint('?miniApp=true')).toBe(true);
    expect(hasExactMiniAppHint('?release=alpha&miniApp=true')).toBe(true);

    expect(hasExactMiniAppHint('')).toBe(false);
    expect(hasExactMiniAppHint('?miniApp=false')).toBe(false);
    expect(hasExactMiniAppHint('?miniApp=True')).toBe(false);
    expect(hasExactMiniAppHint('?miniApp=%74rue')).toBe(false);
    expect(hasExactMiniAppHint('?miniApp=true%20')).toBe(false);
    expect(hasExactMiniAppHint('?miniApp=true&miniApp=true')).toBe(false);
  });

  it('keeps only exact known capabilities in canonical order', () => {
    expect(sanitizeMiniAppCapabilities([
      'haptics.selectionChanged',
      'unknown.action',
      'actions.close',
      'actions.close',
      42
    ])).toEqual([
      'actions.close',
      'haptics.selectionChanged'
    ]);
    expect(sanitizeMiniAppCapabilities({ capabilities: ['actions.close'] }))
      .toEqual([]);
  });

  it('accepts only the exact bounded Quick Auth token result', () => {
    const token = `${'a'.repeat(16)}.${'b'.repeat(24)}.${'c'.repeat(32)}`;
    expect(readMiniAppQuickAuthToken({ token })).toBe(token);
    expect(readMiniAppQuickAuthToken({ token, fid: 539_854 })).toBeNull();
    expect(readMiniAppQuickAuthToken({ token: 'not-a-jwt' })).toBeNull();
    expect(readMiniAppQuickAuthToken({
      token: `a.${'b'.repeat(8 * 1_024)}.c`
    })).toBeNull();
  });

  it('reuses the static Quick Auth preconnect without creating a duplicate', () => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://auth.farcaster.xyz';
    document.head.append(link);

    const cleanup = installMiniAppQuickAuthPreconnect(document);
    expect(document.head.querySelectorAll('link[rel~="preconnect"]')).toHaveLength(1);

    cleanup();
    expect(link.isConnected).toBe(true);
    link.remove();
  });

  it('minimizes profile context and clamps every safe-area axis', () => {
    const context = sanitizeMiniAppContext({
      user: {
        fid: 539_854,
        username: '  0xael.eth\u0000 ',
        displayName: 'Ael\u0007',
        pfpUrl: 'https://images.example/ael.png',
        custodyAddress: 'must-not-pass-through'
      },
      client: {
        clientFid: 9_150,
        added: true,
        notificationsEnabledHint: false,
        platformType: 'mobile',
        safeAreaInsets: {
          top: 999,
          right: 55,
          bottom: -20,
          left: 999
        },
        notificationDetails: { token: 'must-not-pass-through' }
      },
      features: {
        haptics: true,
        cameraAndMicrophoneAccess: 'yes'
      },
      location: {
        type: 'cast_embed',
        cast: { text: 'must-not-pass-through' }
      }
    }, {
      width: 400,
      height: 800
    });

    expect(context).toEqual({
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
          right: 55,
          bottom: 0,
          left: 100
        }
      },
      features: {
        haptics: true,
        cameraAndMicrophoneAccess: false
      },
      locationType: 'cast_embed'
    });
    expect(JSON.stringify(context)).not.toContain('must-not-pass-through');
  });

  it('rejects invalid authority-shaped identity and unsafe profile URLs', () => {
    expect(sanitizeMiniAppContext({
      user: { fid: '539854' },
      client: { clientFid: 9_150, added: true }
    }, { width: 400, height: 800 })).toBeNull();

    expect(sanitizeMiniAppContext({
      user: {
        fid: 539_854,
        username: 'not a username',
        pfpUrl: 'http://images.example/ael.png'
      },
      client: {
        clientFid: 9_150,
        added: false,
        safeAreaInsets: {
          top: Number.NaN,
          right: Number.POSITIVE_INFINITY,
          bottom: 2,
          left: 3
        }
      }
    }, { width: 400, height: 800 })).toEqual({
      user: { fid: 539_854 },
      client: {
        clientFid: 9_150,
        added: false,
        notificationsEnabledHint: false,
        safeAreaInsets: { top: 0, right: 0, bottom: 2, left: 3 }
      },
      features: {
        haptics: false,
        cameraAndMicrophoneAccess: false
      }
    });
  });

  it('reduces valid notification details to one boolean and retains no secret', () => {
    const token = 'private-notification-token';
    const url = 'https://api.warpcast.com/v1/frame-notifications';
    expect(readMiniAppNotificationDetailsHint({ token, url })).toBe(true);
    expect(readMiniAppNotificationDetailsHint({ token: 'short', url })).toBe(false);
    expect(readMiniAppNotificationDetailsHint({ token, url: 'http://example.com' }))
      .toBe(false);
    expect(readMiniAppNotificationDetailsHint({ token, url, extra: 'ignored' }))
      .toBe(true);

    const context = sanitizeMiniAppContext({
      user: { fid: 539_854 },
      client: {
        clientFid: 9_150,
        added: true,
        notificationDetails: { token, url }
      }
    }, { width: 400, height: 800 });

    expect(context?.client.notificationsEnabledHint).toBe(true);
    expect(JSON.stringify(context)).not.toContain(token);
    expect(JSON.stringify(context)).not.toContain(url);

    const mutableClient: Record<string, unknown> = {
      clientFid: 9_150,
      added: true
    };
    Object.defineProperty(mutableClient, 'notificationDetails', {
      get() {
        throw new Error('private mutable host detail');
      }
    });
    const poisoned = sanitizeMiniAppContext({
      user: { fid: 539_854 },
      client: mutableClient
    }, { width: 400, height: 800 });
    expect(poisoned?.client.notificationsEnabledHint).toBe(false);
  });

  it('rejects oversized or mutable notification tokens before encoding them', () => {
    const encode = vi.spyOn(TextEncoder.prototype, 'encode');
    expect(readMiniAppNotificationDetailsHint({
      token: 'x'.repeat(2_049),
      url: 'https://api.warpcast.com/v1/frame-notifications'
    })).toBe(false);
    expect(encode).not.toHaveBeenCalled();

    let tokenReads = 0;
    let urlReads = 0;
    const mutable: Record<string, unknown> = {};
    Object.defineProperties(mutable, {
      token: {
        get() {
          tokenReads += 1;
          return tokenReads === 1
            ? 'private-notification-token'
            : 'mutated-private-token';
        }
      },
      url: {
        get() {
          urlReads += 1;
          return 'https://api.warpcast.com/v1/frame-notifications';
        }
      }
    });
    expect(readMiniAppNotificationDetailsHint(mutable)).toBe(true);
    expect(tokenReads).toBe(1);
    expect(urlReads).toBe(1);
    encode.mockRestore();
  });

  it('accepts only an exact bounded Warpkeep approval notification launch', () => {
    const valid = sanitizeMiniAppContext({
      user: { fid: 539_854 },
      client: { clientFid: 9_150, added: true },
      location: {
        type: 'notification',
        notification: {
          notificationId: 'warpkeep-access-approved-v1-e42',
          title: 'must-not-pass-through',
          body: 'must-not-pass-through'
        }
      }
    }, { width: 400, height: 800 });
    expect(valid?.locationType).toBe('notification');
    expect(valid?.notificationId).toBe('warpkeep-access-approved-v1-e42');
    expect(JSON.stringify(valid)).not.toContain('must-not-pass-through');

    const pendingRequest = sanitizeMiniAppContext({
      user: { fid: 539_854 },
      client: { clientFid: 9_150, added: true },
      location: {
        type: 'notification',
        notification: {
          notificationId: 'warpkeep-access-approved-v2-r1800000000000000'
        }
      }
    }, { width: 400, height: 800 });
    expect(pendingRequest?.notificationId)
      .toBe('warpkeep-access-approved-v2-r1800000000000000');

    for (const notificationId of [
      'warpkeep-access-approved-v1-e0',
      'warpkeep-access-approved-v1-e01',
      'warpkeep-access-approved-v2-e1',
      'warpkeep-access-approved-v2-r0',
      'warpkeep-access-approved-v2-r01',
      `warpkeep-access-approved-v1-e${'1'.repeat(129)}`
    ]) {
      const context = sanitizeMiniAppContext({
        user: { fid: 539_854 },
        client: { clientFid: 9_150, added: true },
        location: {
          type: 'notification',
          notification: { notificationId, title: 'x', body: 'y' }
        }
      }, { width: 400, height: 800 });
      expect(context?.locationType).toBe('notification');
      expect(context?.notificationId).toBeUndefined();
    }

    const launcher = sanitizeMiniAppContext({
      user: { fid: 539_854 },
      client: { clientFid: 9_150, added: true },
      location: {
        type: 'launcher',
        notification: {
          notificationId: 'warpkeep-access-approved-v1-e42'
        }
      }
    }, { width: 400, height: 800 });
    expect(launcher?.notificationId).toBeUndefined();
  });
});
