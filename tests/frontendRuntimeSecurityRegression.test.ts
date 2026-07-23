import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearWarpkeepTitleBinaryCacheForTests,
  loadWarpkeepTitle,
  readExactWarpkeepTitleResponseBody
} from '../src/components/title/loadWarpkeepTitle';
import {
  clearHegemonyKeepBinaryCacheForTests,
  loadHegemonyKeep
} from '../src/components/realm/loadHegemonyKeep';
import {
  clearHegemonyLandscapeBaseBinaryCacheForTests,
  loadHegemonyLandscapeBase
} from '../src/components/realm/loadHegemonyLandscapeBase';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import {
  createFarcasterSessionAuthority,
  type FarcasterAppClientPort
} from '../src/farcaster/farcasterAuthClient';
import { createFarcasterOidcBridgeClient } from '../src/farcaster/farcasterOidcBridgeClient';
import {
  createFarcasterAuthMachineState,
  farcasterAuthMachineReducer
} from '../src/farcaster/farcasterAuthMachine';
import {
  WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
  safePublicHttpsImageUrl,
  safeWarpkeepProfileImageUrl
} from '../src/security/publicImageUrl';
import { normalizePublicProfileText } from '../src/security/publicProfileText';
import {
  FarcasterAuthContextError,
  resolveFarcasterAuthContext
} from '../src/farcaster/farcasterAuthContext';

const BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const NONCE = 'abcdefgh12345678';
const REQUEST_ID = 'request-id-12345678';
const TEST_FID = 424_242_424;

function streamedResponse(chunks: readonly Uint8Array[], status = 200) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    }
  }), { status });
}

function bridgeClient(fetchImplementation: typeof fetch) {
  return createFarcasterOidcBridgeClient({
    bridgeUrl: 'https://auth.warpkeep.com',
    issuer: 'https://auth.warpkeep.com',
    audience: 'warpkeep-spacetimedb',
    allowLocalHttp: false,
    fetch: fetchImplementation
  });
}

function challengeRequest() {
  return {
    domain: 'warpkeep.com',
    siweUri: 'https://warpkeep.com/',
    bindingChallenge: BINDING_CHALLENGE,
    bindingMethod: 'S256' as const
  };
}

afterEach(() => {
  clearWarpkeepTitleBinaryCacheForTests();
  clearHegemonyKeepBinaryCacheForTests();
  clearHegemonyLandscapeBaseBinaryCacheForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('untrusted browser presentation boundaries', () => {
  it('removes bidi, zero-width, and control characters before profile presentation', () => {
    expect(normalizePublicProfileText(
      '  Keep\u202eer\u200b\n\tName\u2066  '
    )).toBe('Keeper Name');
    expect(normalizePublicProfileText('\u202e\u200b\u2066')).toBeUndefined();

    const restored = createFarcasterAuthMachineState({
      identity: {
        fid: TEST_FID,
        username: 'keep\u202eer',
        displayName: 'Warp\nKeeper',
        pfpUrl: 'https://images.example:8443/profile.png',
        verifiedAt: 1_000,
        verifications: []
      },
      expiresAt: 2_000,
      sessionExpiresAt: 3_000
    });
    expect(restored.view).toMatchObject({
      phase: 'authenticated',
      identity: {
        fid: TEST_FID,
        username: 'keeper',
        displayName: 'Warp Keeper'
      }
    });
    if (restored.view.phase === 'authenticated') {
      expect(restored.view.identity).not.toHaveProperty('pfpUrl');
    }
  });

  it('rejects explicit non-default ports on otherwise public HTTPS image URLs', () => {
    expect(safePublicHttpsImageUrl('https://images.example/profile.png'))
      .toBe('https://images.example/profile.png');
    expect(safePublicHttpsImageUrl('https://images.example:443/profile.png'))
      .toBe('https://images.example/profile.png');
    expect(safePublicHttpsImageUrl('https://images.example:8443/profile.png'))
      .toBeUndefined();
  });

  it('rejects alternate numeric spellings that URL canonicalizes to literal IPv4', () => {
    for (const value of [
      'https://127.1/profile.png',
      'https://0177.0.0.1/profile.png',
      'https://0x7f000001/profile.png',
      'https://2130706433/profile.png',
    ]) expect(safePublicHttpsImageUrl(value)).toBeUndefined();
  });

  it('keeps only the exact fixed profile placeholder idempotent on the current origin', () => {
    const absolute = new URL(
      WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
      window.location.origin
    ).toString();
    expect(safeWarpkeepProfileImageUrl(WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH))
      .toBe(absolute);
    expect(safeWarpkeepProfileImageUrl(absolute)).toBe(absolute);
    const otherPath = new URL('/private/profile.png', window.location.origin).toString();
    expect(safeWarpkeepProfileImageUrl(otherPath))
      .toBeUndefined();
    expect(safeWarpkeepProfileImageUrl(`${absolute}?variant=tracking`)).toBeUndefined();
  });

  it('sanitizes relay profile controls before they enter verified identity state', async () => {
    const signature = `0x${'11'.repeat(65)}` as const;
    const client: FarcasterAppClientPort = {
      createChannel: vi.fn(async () => ({ isError: true })),
      status: vi.fn(async () => ({
        isError: false,
        response: { ok: true, status: 200 },
        data: {
          state: 'completed',
          nonce: NONCE,
          message: 'signed message',
          signature,
          fid: TEST_FID,
          signatureParams: {
            siweUri: 'https://warpkeep.com/',
            domain: 'warpkeep.com',
            nonce: NONCE,
            expirationTime: '2026-07-16T12:05:00.000Z',
            requestId: REQUEST_ID
          },
          acceptAuthAddress: true,
          username: 'keep\u202eer',
          displayName: 'Warp\nKeeper',
          pfpUrl: 'https://images.example:8443/profile.png'
        }
      })),
      verifySignInMessage: vi.fn(async () => ({ isError: true }))
    };
    const authority = createFarcasterSessionAuthority({ client });

    await expect(authority.getStatus('channel-token-12345678')).resolves.toMatchObject({
      state: 'completed',
      username: 'keeper',
      displayName: 'Warp Keeper'
    });
    const status = await authority.getStatus('channel-token-12345678');
    expect(status).not.toHaveProperty('pfpUrl');
  });
});

describe('Farcaster authentication origin binding', () => {
  it('permits HTTP only for explicit loopback development hosts', () => {
    for (const [origin, host] of [
      ['http://localhost:5173', 'localhost:5173'],
      ['http://127.0.0.1:5173', '127.0.0.1:5173'],
      ['http://[::1]:5173', '[::1]:5173']
    ] as const) {
      expect(resolveFarcasterAuthContext({ origin, host, baseUrl: '/' }).siweUri)
        .toBe(`${origin}/`);
    }

    for (const [origin, host] of [
      ['http://192.168.1.20:5173', '192.168.1.20:5173'],
      ['http://warpkeep.test:5173', 'warpkeep.test:5173'],
      ['http://localhost.attacker.example:5173', 'localhost.attacker.example:5173']
    ] as const) {
      expect(() => resolveFarcasterAuthContext({ origin, host, baseUrl: '/' }))
        .toThrow(FarcasterAuthContextError);
    }
  });

  it('uses the same strict base-path boundary as browser session cleanup', () => {
    for (const baseUrl of [
      '/Warpkeep//',
      '/Warpkeep%2Fother/',
      '/Warpkeep%5Cother/',
      '/Warpkeep%3Fother/',
      '/Warpkeep%23other/',
      '/Warpkeep%00other/'
    ]) {
      expect(() => resolveFarcasterAuthContext({
        origin: 'https://warpkeep.com',
        host: 'warpkeep.com',
        baseUrl
      })).toThrow(FarcasterAuthContextError);
    }
  });
});

describe('bounded and aborting frontend transports', () => {
  it('aborts unread bridge JSON and logout failure bodies', async () => {
    const signals: AbortSignal[] = [];
    const fetchImplementation = vi.fn(async (_input, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Response('untrusted failure body', {
        status: signals.length === 1 ? 200 : 500,
        headers: signals.length === 1
          ? { 'content-type': 'text/plain' }
          : undefined
      });
    }) as unknown as typeof fetch;
    const client = bridgeClient(fetchImplementation);

    await expect(client.createChallenge(challengeRequest())).rejects.toThrow();
    await expect(client.logoutSession()).rejects.toThrow();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('rejects an empty Content-Length and aborts before accepting bridge JSON', async () => {
    let signal: AbortSignal | undefined;
    const fetchImplementation = vi.fn(async (_input, init) => {
      signal = init?.signal as AbortSignal;
      return new Response('{}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': ''
        }
      });
    }) as unknown as typeof fetch;

    await expect(bridgeClient(fetchImplementation).createChallenge(challengeRequest()))
      .rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });

  it('streams exact title bytes and releases short or oversized bodies', async () => {
    const exact = streamedResponse([Uint8Array.of(1, 2), Uint8Array.of(3)]);
    await expect(readExactWarpkeepTitleResponseBody(exact, 3))
      .resolves.toEqual(Uint8Array.of(1, 2, 3).buffer);
    expect(exact.body?.locked).toBe(false);

    const short = streamedResponse([Uint8Array.of(1, 2)]);
    await expect(readExactWarpkeepTitleResponseBody(short, 3)).rejects.toThrow(/exact byte budget/i);
    expect(short.body?.locked).toBe(false);

    let cancelled = false;
    const oversized = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(1, 2, 3, 4));
      },
      cancel() {
        cancelled = true;
      }
    }));
    await expect(readExactWarpkeepTitleResponseBody(oversized, 3))
      .rejects.toThrow(/exceeds its exact byte budget/i);
    expect(cancelled).toBe(true);
    expect(oversized.body?.locked).toBe(false);
  });

  it('bounds a direct title load by its asset deadline and aborts the transport', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImplementation = vi.fn((_input, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchImplementation);

    const pending = loadWarpkeepTitle({
      baseUrl: '/',
      quality: 'balanced',
      targetHeight: 2
    });
    const rejected = expect(pending).rejects.toThrow(/timed out after 16000ms/i);
    await vi.advanceTimersByTimeAsync(16_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
  });

  it('uses redirect-failing requests and aborts rejected title/castle/base responses', async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_input, init) => {
      requests.push(init ?? {});
      return streamedResponse([Uint8Array.of(1)], 503);
    }));

    await expect(loadWarpkeepTitle({
      baseUrl: '/',
      quality: 'balanced',
      targetHeight: 2
    })).rejects.toThrow(/request failed/i);
    await expect(loadHegemonyKeep({
      baseUrl: '/',
      maxAnisotropy: 1,
      quality: REALM_QUALITY_SPECS.reduced
    })).rejects.toThrow(/request failed/i);
    await expect(loadHegemonyLandscapeBase({
      baseUrl: '/',
      maxAnisotropy: 1,
      quality: REALM_QUALITY_SPECS.reduced
    })).rejects.toThrow(/request failed/i);

    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({
      credentials: 'same-origin',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    expect(requests.slice(1).every((request) => request.redirect === 'error')).toBe(true);
    expect(requests.every((request) => (request.signal as AbortSignal).aborted)).toBe(true);
  });
});
