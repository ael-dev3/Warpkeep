import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookState = vi.hoisted(() => ({
  backend: {} as Record<string, unknown>,
  farcaster: {} as Record<string, unknown>,
  miniApp: {} as Record<string, unknown>,
  miniAppBack: undefined as (() => void) | undefined,
}));

vi.mock('../src/farcaster/FarcasterAuthProviderCore', () => ({
  useFarcasterAuth: () => hookState.farcaster,
}));

vi.mock('../src/spacetime', () => ({
  useWarpkeepBackend: () => hookState.backend,
  WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE: 'Genesis 001 is unavailable.',
}));

vi.mock('../src/farcaster/miniapp', () => ({
  hasExactMiniAppHint: () => false,
  useMiniAppBackNavigation: (_priority: number, onBack: () => void) => {
    hookState.miniAppBack = onBack;
  },
  useMiniAppHost: () => hookState.miniApp,
}));

vi.mock('../src/components/realm/RealmMapScreen', async () => {
  const { createElement } = await import('react');
  return {
    RealmMapScreen: (props: Record<string, unknown>) => createElement(
      'main',
      {
        'aria-label': 'PTR realm test surface',
        'data-has-genesis-continuity': String(props.realmContinuity !== undefined),
        'data-has-genesis-snapshot': String(props.snapshot !== undefined),
        'data-has-ptr-authority': String(props.ptrRealmAuthority !== undefined),
        'data-ptr-castle-id': String(
          (props.ptrViewAnchor as { castleId?: number } | undefined)?.castleId ?? '',
        ),
      },
      createElement('button', {
        onClick: props.onRequestReturn as (() => void) | undefined,
        type: 'button',
      }, 'Return to Menu'),
    ),
  };
});

import { WarpkeepExperience } from '../src/components/WarpkeepExperience';
import {
  PtrRealmProvider,
  type PtrRealmProviderRuntime,
} from '../src/ptr/PtrRealmProvider';
import {
  createPtrRealmAuthClient,
  isCurrentPtrRealmAuthority,
  type PtrRealmAuthority,
} from '../src/ptr/ptrRealmAuthClient';
import type { PtrRealmConnectionSession } from '../src/ptr/ptrRealmConnection';
import type { AvailablePtrRealmConfig } from '../src/ptr/ptrRealmConfig';
import type { GreaterRealmProviderBridge } from '../src/spacetime/greaterRealmProviderBridge';

const NOW = 1_800_000_000_000;
const OWNER_FID = 12_345;
const DATABASE_IDENTITY = 'd'.repeat(64);
const CONFIG: AvailablePtrRealmConfig = Object.freeze({
  availability: 'available',
  enabled: true,
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  databaseIdentity: DATABASE_IDENTITY,
});

function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function ownerAuthority(): Promise<PtrRealmAuthority> {
  const issuedAt = NOW / 1_000;
  const jwt = [
    segment({ alg: 'ES256', typ: 'JWT', kid: 'ptr-experience-test' }),
    segment({
      iss: 'https://auth.warpkeep.com',
      sub: `farcaster:${OWNER_FID}`,
      aud: ['warpkeep-ptr-spacetimedb'],
      token_type: 'spacetime-access',
      auth_version: 2,
      realm_id: 'PTR',
      fid: String(OWNER_FID),
      auth_epoch: 1,
      roles: ['warpkeep-ptr-owner'],
      iat: issuedAt,
      nbf: issuedAt,
      exp: issuedAt + 120,
      session_iat: issuedAt,
      session_exp: issuedAt + 120,
      jti: 'ptr-experience-test-jti',
    }),
    'test_signature',
  ].join('.');
  return createPtrRealmAuthClient({
    expectedDatabaseIdentity: DATABASE_IDENTITY,
    now: () => NOW,
    fetch: vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      status: 'authorized',
      realmId: 'PTR',
      identity: { fid: OWNER_FID },
      databaseIdentity: DATABASE_IDENTITY,
      accessToken: jwt,
      tokenType: 'spacetime-access',
      accessExpiresAt: NOW + 120_000,
    }), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
    })) as typeof fetch,
  }).exchangeQuickAuth('quick.auth.token');
}

type PtrRuntimeHarness = Readonly<{
  runtime: PtrRealmProviderRuntime;
  failTransport: () => void;
}>;

type DeferredPtrRuntimeHarness = Readonly<{
  runtime: PtrRealmProviderRuntime;
  connectSignal: () => AbortSignal | undefined;
  releaseConnection: () => void;
}>;

function runtimeHarness(authority: PtrRealmAuthority): PtrRuntimeHarness {
  const session = Object.freeze({
    realmId: 'PTR',
    generation: 2,
  }) as unknown as PtrRealmConnectionSession;
  const bridge = Object.freeze({
    phase: 'available',
    presentationAllowed: true,
    sessionGeneration: 2,
    createRuntime: vi.fn(),
  }) as unknown as GreaterRealmProviderBridge;
  let transportFailure: (() => void) | undefined;
  const runtime: PtrRealmProviderRuntime = Object.freeze({
    now: () => NOW,
    createAuthClient: vi.fn(() => Object.freeze({
      exchangeQuickAuth: vi.fn(async () => authority),
    })),
    connect: vi.fn(async options => {
      transportFailure = () => options.onTransportFailure?.('transport-unavailable');
      return session;
    }),
    preflight: vi.fn(async () => Object.freeze({
      castleId: OWNER_FID,
      q: 14,
      r: -9,
    })),
    createBridge: vi.fn(() => bridge),
    isSessionCurrent: vi.fn(() => true),
    closeSession: vi.fn(),
  });
  return Object.freeze({
    runtime,
    failTransport: () => transportFailure?.(),
  });
}

function deferredRuntimeHarness(authority: PtrRealmAuthority): DeferredPtrRuntimeHarness {
  const session = Object.freeze({
    realmId: 'PTR',
    generation: 2,
  }) as unknown as PtrRealmConnectionSession;
  const bridge = Object.freeze({
    phase: 'available',
    presentationAllowed: true,
    sessionGeneration: 2,
    createRuntime: vi.fn(),
  }) as unknown as GreaterRealmProviderBridge;
  let resolveConnection: ((session: PtrRealmConnectionSession) => void) | undefined;
  let signal: AbortSignal | undefined;
  const connection = new Promise<PtrRealmConnectionSession>((resolve) => {
    resolveConnection = resolve;
  });
  const runtime: PtrRealmProviderRuntime = Object.freeze({
    now: () => NOW,
    createAuthClient: vi.fn(() => Object.freeze({
      exchangeQuickAuth: vi.fn(async () => authority),
    })),
    connect: vi.fn(options => {
      signal = options.signal;
      return connection;
    }),
    preflight: vi.fn(async () => Object.freeze({
      castleId: OWNER_FID,
      q: 14,
      r: -9,
    })),
    createBridge: vi.fn(() => bridge),
    isSessionCurrent: vi.fn(() => true),
    closeSession: vi.fn(),
  });
  return Object.freeze({
    runtime,
    connectSignal: () => signal,
    releaseConnection: () => resolveConnection?.(session),
  });
}

async function beginDeferredPtrEntry(harness: DeferredPtrRuntimeHarness) {
  fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
  await waitFor(() => expect(screen.getByRole('radio', {
    name: /PTR.*Admitted/i,
  })).not.toBeNull());
  fireEvent.click(screen.getByRole('radio', { name: /PTR.*Admitted/i }));
  fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));
  await waitFor(() => expect(harness.runtime.connect).toHaveBeenCalledTimes(1));
}

async function releaseDeferredConnection(harness: DeferredPtrRuntimeHarness) {
  await act(async () => {
    harness.releaseConnection();
    await Promise.resolve();
  });
}

function installBrowserStubs() {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
  window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
  installBrowserStubs();
  hookState.miniAppBack = undefined;
  hookState.farcaster = Object.freeze({
    state: Object.freeze({ phase: 'anonymous' }),
    accessRequest: Object.freeze({ phase: 'request-available' }),
    admissionCheck: Object.freeze({ phase: 'idle' }),
    restoreSession: vi.fn(async () => false),
    beginSignIn: vi.fn(),
    cancelSignIn: vi.fn(),
    retrySignIn: vi.fn(),
    prepareQrCode: vi.fn(),
    refreshSession: vi.fn(),
    checkAdmission: vi.fn(() => false),
    requestAccess: vi.fn(() => false),
    retryAccessRequestStatus: vi.fn(),
    signOut: vi.fn(),
    oidcSession: undefined,
    rememberDevice: false,
    setRememberDevice: vi.fn(),
  });
  hookState.backend = Object.freeze({
    state: Object.freeze({ phase: 'idle' }),
    sharedAlphaAvailable: true,
    entryAgreementSatisfied: false,
    greaterRealm: Object.freeze({
      phase: 'dormant',
      reason: 'connection-unavailable',
      presentationAllowed: false,
    }),
    workerPrivateSync: Object.freeze({
      phase: 'not-required',
      commandsEnabled: false,
    }),
    realmChat: undefined,
    cancelAlphaTermsAcceptance: vi.fn(),
    disconnect: vi.fn(),
    checkAgain: vi.fn(),
    beginAlphaTermsAcceptance: vi.fn(),
    retryWorkerPrivateSync: vi.fn(),
    dispatchGoldExpedition: vi.fn(),
    dispatchFoodExpedition: vi.fn(),
    dispatchWoodExpedition: vi.fn(),
    dispatchStoneExpedition: vi.fn(),
    startInnerKeepProject: vi.fn(),
    dispatchWorker: vi.fn(),
    recallWorker: vi.fn(),
    recallAllWorkers: vi.fn(),
    returnLegacyExpedition: vi.fn(),
    sendRealmChatMessage: vi.fn(),
    reportRealmChatMessage: vi.fn(),
    loadEarlierRealmChat: vi.fn(),
  });
  hookState.miniApp = Object.freeze({
    state: 'miniapp',
    isMiniApp: true,
    isFramed: false,
    context: Object.freeze({
      user: Object.freeze({
        fid: OWNER_FID,
        username: 'ptr-owner',
        displayName: 'PTR Owner',
      }),
      client: Object.freeze({ clientFid: 9_999 }),
    }),
    capabilities: Object.freeze([]),
    notificationPresentation: 'unsupported',
    recoveryReason: null,
    retry: vi.fn(),
    bindBackNavigation: vi.fn(() => vi.fn()),
    hasCapability: vi.fn(() => false),
    actions: Object.freeze({}),
    haptics: Object.freeze({
      impactOccurred: vi.fn(async () => true),
      notificationOccurred: vi.fn(async () => true),
      selectionChanged: vi.fn(async () => true),
    }),
    quickAuth: Object.freeze({
      getToken: vi.fn(async () => Object.freeze({
        status: 'token',
        token: 'quick.auth.token',
      })),
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Warpkeep PTR realm integration', () => {
  it('checks and enters PTR without Genesis state, then tears PTR down on return', async () => {
    const authority = await ownerAuthority();
    const harness = runtimeHarness(authority);
    render(
      <PtrRealmProvider config={CONFIG} runtime={harness.runtime}>
        <WarpkeepExperience />
      </PtrRealmProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await waitFor(() => expect(screen.getByRole('radio', {
      name: /PTR.*Admitted/i,
    })).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: /PTR.*Admitted/i }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    const ptrSurface = await screen.findByRole('main', { name: 'PTR realm test surface' });
    expect(ptrSurface.getAttribute('data-has-ptr-authority')).toBe('true');
    expect(ptrSurface.getAttribute('data-ptr-castle-id')).toBe(String(OWNER_FID));
    expect(ptrSurface.getAttribute('data-has-genesis-snapshot')).toBe('false');
    expect(ptrSurface.getAttribute('data-has-genesis-continuity')).toBe('false');
    expect(hookState.backend.disconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull());
    expect(harness.runtime.closeSession).toHaveBeenCalled();
  });

  it('revokes the mounted PTR surface and normalizes history on transport failure', async () => {
    const authority = await ownerAuthority();
    const harness = runtimeHarness(authority);
    render(
      <PtrRealmProvider config={CONFIG} runtime={harness.runtime}>
        <WarpkeepExperience />
      </PtrRealmProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await waitFor(() => expect(screen.getByRole('radio', {
      name: /PTR.*Admitted/i,
    })).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: /PTR.*Admitted/i }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));
    await screen.findByRole('main', { name: 'PTR realm test surface' });

    act(() => harness.failTransport());

    await waitFor(() => expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull());
    expect(screen.queryByRole('main', { name: 'PTR realm test surface' })).toBeNull();
    expect(document.querySelector('.warpkeep-experience')?.getAttribute('data-active-realm'))
      .toBe('none');
    expect(window.location.hash).toBe('#menu');
    expect(harness.runtime.closeSession).toHaveBeenCalled();
    expect(hookState.backend.disconnect).not.toHaveBeenCalled();
  });

  it('treats forged PTR history state and a realm hash as untrusted navigation', async () => {
    window.history.replaceState({
      warpkeepRealm: true,
      warpkeepRealmId: 'ptr',
    }, '', '/#realm');
    const authority = await ownerAuthority();
    const harness = runtimeHarness(authority);

    render(
      <PtrRealmProvider config={CONFIG} runtime={harness.runtime}>
        <WarpkeepExperience />
      </PtrRealmProvider>,
    );

    await waitFor(() => expect(window.location.hash).toBe('#menu'));
    expect(screen.queryByRole('main', { name: 'PTR realm test surface' })).toBeNull();
    expect(document.querySelector('.warpkeep-experience')?.getAttribute('data-active-realm'))
      .toBe('none');
    expect(harness.runtime.connect).not.toHaveBeenCalled();
  });

  it('Back cancels a deferred PTR entry, revokes authority, and blocks late entry', async () => {
    const authority = await ownerAuthority();
    const harness = deferredRuntimeHarness(authority);
    render(
      <PtrRealmProvider config={CONFIG} runtime={harness.runtime}>
        <WarpkeepExperience />
      </PtrRealmProvider>,
    );

    await beginDeferredPtrEntry(harness);

    const back = screen.getByRole('button', { name: 'BACK' }) as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    expect((screen.getByRole('button', {
      name: 'CHECKING ACCESS…',
    }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(back);

    await waitFor(() => expect(harness.connectSignal()?.aborted).toBe(true));
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
    await releaseDeferredConnection(harness);

    await waitFor(() => expect(harness.runtime.closeSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('main', { name: 'PTR realm test surface' })).toBeNull();
    expect(window.location.hash).toBe('#menu');
  });

  it.each([
    ['Genesis 001', /Genesis 001/i],
    ['Genesis 002', /Genesis 002/i],
  ] as const)(
    'switching to %s cancels a deferred PTR entry and cannot enter PTR late',
    async (_realmLabel, realmName) => {
      const authority = await ownerAuthority();
      const harness = deferredRuntimeHarness(authority);
      render(
        <PtrRealmProvider config={CONFIG} runtime={harness.runtime}>
          <WarpkeepExperience />
        </PtrRealmProvider>,
      );

      await beginDeferredPtrEntry(harness);
      fireEvent.click(screen.getByRole('radio', { name: realmName }));

      await waitFor(() => expect(harness.connectSignal()?.aborted).toBe(true));
      expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
      await releaseDeferredConnection(harness);

      await waitFor(() => expect(harness.runtime.closeSession).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('main', { name: 'PTR realm test surface' })).toBeNull();
      expect(window.location.hash).toBe('#menu');
    },
  );

  it('host Back toward title cancels a deferred PTR entry and closes its late session', async () => {
    const authority = await ownerAuthority();
    const harness = deferredRuntimeHarness(authority);
    render(
      <PtrRealmProvider config={CONFIG} runtime={harness.runtime}>
        <WarpkeepExperience />
      </PtrRealmProvider>,
    );

    await beginDeferredPtrEntry(harness);
    act(() => hookState.miniAppBack?.());

    await waitFor(() => expect(harness.connectSignal()?.aborted).toBe(true));
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
    await releaseDeferredConnection(harness);

    await waitFor(() => expect(harness.runtime.closeSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('main', { name: 'PTR realm test surface' })).toBeNull();
  });
});
