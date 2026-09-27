import { StrictMode, type ReactElement } from 'react';
import { act, cleanup, fireEvent, render as testingLibraryRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WarpkeepExperience,
  resolveRealmContinuityIdentity
} from '../src/components/WarpkeepExperience';
import { FarcasterAuthProvider } from '../src/farcaster/FarcasterAuthProvider';
import { WarpkeepSpacetimeProvider } from '../src/spacetime/WarpkeepSpacetimeProvider';
import { PtrRealmProvider } from '../src/ptr/PtrRealmProvider';
import { NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS } from '../src/spacetime/warpkeepBackendTypes';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

const mediaPaused = new WeakMap<HTMLMediaElement, boolean>();

function render(ui: ReactElement) {
  return testingLibraryRender(
    <FarcasterAuthProvider>
      <WarpkeepSpacetimeProvider>
        <PtrRealmProvider config={{ availability: 'unavailable' }}>
          {ui}
        </PtrRealmProvider>
      </WarpkeepSpacetimeProvider>
    </FarcasterAuthProvider>
  );
}

function installBrowserStubs(reducedMotion = false) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })));
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.classList.contains('warpkeep-menu-command')) {
      return { x: 900, y: 320, left: 900, top: 320, right: 1180, bottom: 374,
        width: 280, height: 54, toJSON: () => ({}) } as DOMRect;
    }
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0,
      width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    return mediaPaused.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    mediaPaused.set(this, false);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    mediaPaused.set(this, true);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
}

beforeEach(async () => {
  await import('../src/components/realm/RealmMapScreen');
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/');
  installBrowserStubs();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WarpkeepExperience', () => {
  it('keeps Realm presentation identity only through the exact same-FID token window', () => {
    const now = 10_000;
    const identity = Object.freeze({
      fid: 12_345,
      username: 'keeper12345',
      verifications: [] as const,
      verifiedAt: now
    });
    const authenticated = Object.freeze({
      phase: 'authenticated' as const,
      assurance: 'bridge-oidc-alpha' as const,
      identity
    });
    const realm = createCanonicalGenesisSnapshot(identity.fid);
    const readyBackend = Object.freeze({
      phase: 'ready' as const,
      workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
      identity,
      admission: 'ready' as const,
      realm
    });
    const reconnectingBackend = Object.freeze({
      ...readyBackend,
      phase: 'reconnecting' as const
    });
    const liveToken = Object.freeze({
      jwt: 'header.payload.signature',
      issuer: 'https://auth.warpkeep.com',
      audience: 'warpkeep-spacetimedb',
      expiresAt: now + 1_000
    });

    expect(resolveRealmContinuityIdentity(
      identity,
      authenticated,
      liveToken,
      readyBackend,
      now
    )).toBe(identity);
    const replacementIdentity = Object.freeze({
      ...identity,
      fid: 54_321,
      username: 'keeper54321'
    });
    const replacementAuthenticated = Object.freeze({
      ...authenticated,
      identity: replacementIdentity
    });
    expect(resolveRealmContinuityIdentity(
      identity,
      replacementAuthenticated,
      liveToken,
      readyBackend,
      now
    )).toBeNull();
    expect(resolveRealmContinuityIdentity(
      identity,
      replacementAuthenticated,
      liveToken,
      {
        ...readyBackend,
        identity: replacementIdentity
      },
      now
    )).toBeNull();
    expect(resolveRealmContinuityIdentity(
      identity,
      replacementAuthenticated,
      liveToken,
      {
        phase: 'checking-admission',
        workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
        identity: replacementIdentity
      },
      now
    )).toBe(replacementIdentity);
    expect(resolveRealmContinuityIdentity(
      identity,
      authenticated,
      undefined,
      readyBackend,
      now
    )).toBe(identity);
    expect(resolveRealmContinuityIdentity(
      identity,
      authenticated,
      { ...liveToken, expiresAt: now },
      reconnectingBackend,
      now
    )).toBe(identity);

    expect(resolveRealmContinuityIdentity(
      identity,
      { phase: 'anonymous' },
      undefined,
      reconnectingBackend,
      now
    )).toBeNull();
    expect(resolveRealmContinuityIdentity(
      identity,
      { ...authenticated, assurance: 'live-client-verified' },
      undefined,
      reconnectingBackend,
      now
    )).toBeNull();
    expect(resolveRealmContinuityIdentity(
      identity,
      {
        ...authenticated,
        identity: { ...identity, fid: 54_321 }
      },
      undefined,
      reconnectingBackend,
      now
    )).toBeNull();
    expect(resolveRealmContinuityIdentity(
      identity,
      authenticated,
      undefined,
      {
        phase: 'error',
        workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
        identity
      },
      now
    )).toBeNull();
  });

  it.each(['/', '/#title', '/#menu'])(
    'opens the menu directly from %s without a title gateway',
    (route) => {
      window.history.replaceState({}, '', route);
      const { container } = render(<WarpkeepExperience />);
      const experience = container.querySelector('.warpkeep-experience');
      expect(experience?.getAttribute('data-phase')).toBe('menu');
      expect(experience?.getAttribute('data-presented-screen')).toBe('menu');
      expect(window.location.hash).toBe('#menu');
      expect(screen.getByRole('heading', { level: 1, name: 'WARPKEEP' })).not.toBeNull();
      expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Return to Title' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Enter Warpkeep' })).toBeNull();
      expect(container.querySelector('.warpkeep-experience__screen--title')).toBeNull();
      expect(container.querySelector('.warp-transition-overlay')).toBeNull();
      expect(container.querySelector('canvas')).toBeNull();
      expect(container.querySelectorAll('audio[data-audio-role^="realm"][src]')).toHaveLength(0);
    }
  );

  it('normalizes Back and Forward visits to retired title and root routes', () => {
    const { container } = render(<WarpkeepExperience />);
    const experience = container.querySelector('.warpkeep-experience');
    for (const route of ['/#title', '/', '/#menu']) {
      act(() => {
        window.history.replaceState({}, '', route);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(window.location.hash).toBe('#menu');
      expect(experience?.getAttribute('data-phase')).toBe('menu');
      expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();
      expect(container.querySelector('.warp-transition-overlay')).toBeNull();
    }
  });

  it('preserves the credits dialog while Escape returns to the menu root', () => {
    const { container } = render(<WarpkeepExperience />);
    fireEvent.click(screen.getByRole('button', { name: 'CREDITS' }));
    expect(screen.getByRole('dialog', { name: 'Warpkeep credits' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Warpkeep credits' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('button', { name: 'Return to Title' })).toBeNull();
  });

  it('honors reduced motion without mounting a gateway or transition veil', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'), media: query,
      onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn()
    }));
    const { container } = render(<WarpkeepExperience />);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('menu');
    expect(container.querySelector('.warpkeep-experience__screen--title')).toBeNull();
    expect(container.querySelector('.warp-transition-overlay')).toBeNull();
  });

  it('keeps one menu experience through a StrictMode lifecycle', () => {
    const { container, unmount } = render(
      <StrictMode><WarpkeepExperience /></StrictMode>
    );
    expect(container.querySelectorAll('.warpkeep-experience')).toHaveLength(1);
    expect(container.querySelectorAll('.warpkeep-experience__screen--menu')).toHaveLength(1);
    expect(container.querySelectorAll('audio[data-audio-role]')).toHaveLength(5);
    expect(container.querySelectorAll('.warpkeep-menu-scene')).toHaveLength(1);
    expect(container.querySelectorAll('video.warpkeep-menu-background')).toHaveLength(0);
    unmount();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(container.querySelector('.warpkeep-experience')).toBeNull();
  });
});
