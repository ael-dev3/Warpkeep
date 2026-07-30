import { describe, expect, it } from 'vitest';

import {
  hasExactMiniAppHint,
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
        safeAreaInsets: { top: 0, right: 0, bottom: 2, left: 3 }
      },
      features: {
        haptics: false,
        cameraAndMicrophoneAccess: false
      }
    });
  });
});
