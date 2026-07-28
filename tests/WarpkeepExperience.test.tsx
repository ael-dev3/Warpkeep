import { StrictMode, type ReactElement } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WarpkeepExperience,
  resolveRealmContinuityIdentity
} from '../src/components/WarpkeepExperience';
import { FarcasterAuthProvider } from '../src/farcaster/FarcasterAuthProvider';
import { WarpkeepSpacetimeProvider } from '../src/spacetime/WarpkeepSpacetimeProvider';
import { NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS } from '../src/spacetime/warpkeepBackendTypes';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

const mediaPaused = new WeakMap<HTMLMediaElement, boolean>();
let titleGatewayMeasurable = true;

function render(ui: ReactElement) {
  return testingLibraryRender(
    <FarcasterAuthProvider>
      <WarpkeepSpacetimeProvider>
        {ui}
      </WarpkeepSpacetimeProvider>
    </FarcasterAuthProvider>
  );
}

function rectangle(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({})
  } as DOMRect;
}

function expectOverlayPercentageOrigin(
  overlay: HTMLElement,
  u: number,
  v: number
) {
  const x = overlay.style.getPropertyValue('--warp-origin-x');
  const y = overlay.style.getPropertyValue('--warp-origin-y');
  expect(x.endsWith('%')).toBe(true);
  expect(y.endsWith('%')).toBe(true);
  expect(Number.parseFloat(x)).toBeCloseTo(u * 100, 8);
  expect(Number.parseFloat(y)).toBeCloseTo(v * 100, 8);
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
    if (
      this.classList.contains('warpkeep-title-screen')
      || this.classList.contains('warpkeep-gateway')
    ) {
      return rectangle(0, 0, 1280, 720);
    }
    if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
      if (!titleGatewayMeasurable) return rectangle(0, 0, 0, 0);
      return rectangle(600, 190, 152, 56);
    }
    if (this.classList.contains('warpkeep-gateway-button')) {
      if (!titleGatewayMeasurable) return rectangle(0, 0, 0, 0);
      return rectangle(612, 173, 128, 90);
    }
    if (this.classList.contains('warp-transition-overlay')) {
      return rectangle(0, 0, 1280, 720);
    }
    if (this.classList.contains('warpkeep-menu-command')) {
      return rectangle(900, 320, 280, 54);
    }
    if (this.classList.contains('warpkeep-menu-notice')) {
      return rectangle(0, 0, 360, 92);
    }
    return rectangle(0, 0, 0, 0);
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

async function settleInitialTitle() {
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  return screen.getByRole('button', { name: 'Enter Warpkeep' });
}

beforeEach(async () => {
  await Promise.all([
    import('../src/components/title/WarpkeepTitleScreen3D'),
    import('../src/components/realm/RealmMapScreen')
  ]);
  vi.useFakeTimers();
  titleGatewayMeasurable = true;
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

  it('enters the menu exactly once, replaces the old notice, and unmounts the title renderer', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    expect(screen.queryByText(/gateway is still under development/i)).toBeNull();

    fireEvent.click(gateway, { detail: 1, clientX: 676, clientY: 218 });
    fireEvent.click(gateway, { detail: 1, clientX: 676, clientY: 218 });
    const experience = container.querySelector('.warpkeep-experience')!;
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');
    expect(experience.getAttribute('data-transition-sequence')).toBe('1');
    expect(document.querySelectorAll('.warp-transition-overlay')).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(2_250);
    });
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.getByRole('heading', { level: 1, name: 'WARPKEEP' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Enter Warpkeep' })).toBeNull();
    expect(container.querySelectorAll('audio[data-audio-role]')).toHaveLength(5);
    expect(container.querySelectorAll('audio[data-audio-role^="realm"][src]')).toHaveLength(0);
  });

  it('freezes the rendered gateway center rather than the physical pointer point', async () => {
    render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();

    fireEvent.click(gateway, {
      detail: 1,
      clientX: 731.5,
      clientY: 250.25
    });
    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-input')).toBe('pointer');
    expect(overlay.getAttribute('data-gateway-client-x')).toBe('676');
    expect(Number(overlay.getAttribute('data-gateway-client-y'))).toBeCloseTo(218);
    expectOverlayPercentageOrigin(overlay, 676 / 1_280, 218 / 720);

    vi.stubGlobal('innerWidth', 900);
    vi.stubGlobal('innerHeight', 640);
    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByTestId('warp-transition-overlay')).toBe(overlay);
    expectOverlayPercentageOrigin(overlay, 676 / 1_280, 218 / 720);
  });

  it('does not advance fallback clocks before the overlay has a measured origin', async () => {
    vi.stubGlobal('ResizeObserver', undefined);
    let overlayMeasurable = false;
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement
    ) {
      if (
        this.classList.contains('warpkeep-title-screen')
        || this.classList.contains('warpkeep-gateway')
      ) {
        return rectangle(0, 0, 1280, 720);
      }
      if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
        return rectangle(600, 190, 152, 56);
      }
      if (this.classList.contains('warpkeep-gateway-button')) {
        return rectangle(612, 173, 128, 90);
      }
      if (this.classList.contains('warp-transition-overlay')) {
        return overlayMeasurable
          ? rectangle(0, 0, 1280, 720)
          : rectangle(0, 0, 0, 0);
      }
      if (this.classList.contains('warpkeep-menu-command')) {
        return rectangle(900, 320, 280, 54);
      }
      return rectangle(0, 0, 0, 0);
    });
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();

    fireEvent.click(gateway, { detail: 0 });
    const experience = container.querySelector('.warpkeep-experience')!;
    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-origin-ready')).toBe('false');

    await act(async () => vi.advanceTimersByTime(4_000));
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');
    expect(experience.getAttribute('data-presented-screen')).toBe('title');

    overlayMeasurable = true;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(overlay.getAttribute('data-origin-ready')).toBe('true');

    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-phase')).toBe('menu');
  });

  it('maps the visible gateway through offset source and overlay bounds', async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.classList.contains('warpkeep-title-screen')) {
        return rectangle(100, 50, 640, 360);
      }
      if (this.classList.contains('warpkeep-gateway')) {
        return rectangle(20, 10, 1280, 720);
      }
      if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
        return rectangle(300, 150, 100, 40);
      }
      if (this.classList.contains('warpkeep-gateway-button')) {
        return rectangle(286, 125, 128, 90);
      }
      if (this.classList.contains('warp-transition-overlay')) {
        return rectangle(40, 20, 900, 600);
      }
      if (this.classList.contains('warpkeep-menu-command')) {
        return rectangle(400, 240, 240, 48);
      }
      return rectangle(0, 0, 0, 0);
    });
    render(<WarpkeepExperience />);
    await settleInitialTitle();

    fireEvent.keyDown(document.body, { key: 'Enter' });

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-gateway-client-x')).toBe('350');
    expect(overlay.getAttribute('data-gateway-client-y')).toBe('170');
    expect(overlay.getAttribute('data-overlay-left')).toBe('40');
    expect(overlay.getAttribute('data-overlay-top')).toBe('20');
    expectOverlayPercentageOrigin(overlay, 310 / 900, 150 / 600);
  });

  it('retires keyboard gateway focus before handing focus to the stable menu command', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    gateway.focus();
    expect(document.activeElement).toBe(gateway);

    fireEvent.click(gateway, { detail: 0 });
    const gatewayAnchor = gateway.closest('.warpkeep-gateway-anchor') as HTMLDivElement;
    expect((gateway as HTMLButtonElement).disabled).toBe(true);
    expect(gatewayAnchor.hidden).toBe(true);
    expect(gatewayAnchor.inert).toBe(true);
    const departureLandmark = screen.getByRole('status');
    const overlay = screen.getByTestId('warp-transition-overlay');
    expectOverlayPercentageOrigin(overlay, 676 / 1_280, 218 / 720);
    expect(departureLandmark.textContent).toBe('Entering Warpkeep. Opening the main menu.');
    expect(departureLandmark.getAttribute('data-active')).toBe('true');
    expect(document.activeElement).toBe(departureLandmark);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('transitioning-to-menu');

    await act(async () => {
      vi.advanceTimersByTime(2_250);
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'ENTER REALM' })
    );
  });

  it('uses the same retired-gateway and focus handoff lifecycle with reduced motion', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    gateway.focus();

    fireEvent.click(gateway, { detail: 0 });
    const anchor = gateway.closest('.warpkeep-gateway-anchor') as HTMLDivElement;
    const landmark = screen.getByRole('status');
    expect(screen.getByTestId('warp-transition-overlay').getAttribute('data-motion'))
      .toBe('reduced');
    expect(anchor.hidden).toBe(true);
    expect(anchor.inert).toBe(true);
    expect((gateway as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(landmark);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('transitioning-to-menu');

    await act(async () => {
      vi.advanceTimersByTime(421);
    });
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('menu');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'ENTER REALM' })
    );
  });

  it('keeps the entry hint through irrelevant and missed input, then dismisses it on activation', async () => {
    render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();

    act(() => vi.advanceTimersByTime(4_998));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(2));
    const hint = screen.getByRole('status');
    expect(hint.textContent).toBe('Click the core or press Enter.');
    expect(hint.getAttribute('data-placement')).toBe('above');

    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
    fireEvent.touchStart(document.body);
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: 'Shift' });
    act(() => gateway.focus());
    expect(screen.getByRole('status')).toBe(hint);

    fireEvent.click(gateway, { detail: 1, clientX: 676, clientY: 218 });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses touch-specific hint copy on coarse-pointer devices', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes('(pointer: coarse)'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    render(<WarpkeepExperience />);
    await settleInitialTitle();
    act(() => vi.advanceTimersByTime(5_000));
    const hint = screen.getByRole('status');
    expect(hint.textContent).toBe('Tap the core to enter.');
    expect(hint.getAttribute('data-placement')).toBe('above');
  });

  it('supports global Enter and Space while rejecting repeats, modifiers, and overlaps', async () => {
    const { container } = render(<WarpkeepExperience />);
    await settleInitialTitle();
    const experience = container.querySelector('.warpkeep-experience')!;

    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    input.remove();
    expect(experience.getAttribute('data-phase')).toBe('title');

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true
    });
    act(() => {
      document.body.dispatchEvent(spaceEvent);
      fireEvent.keyDown(document.body, { key: 'Enter' });
    });
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');
    expect(experience.getAttribute('data-transition-sequence')).toBe('1');
  });

  it('opens and closes the dramatic credits roll before Escape returns through the menu', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    await act(async () => vi.advanceTimersByTime(2_250));

    const credits = screen.getByRole('button', { name: 'CREDITS' });
    fireEvent.click(credits);
    expect(screen.getByRole('dialog', { name: 'Warpkeep credits' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Warpkeep credits' })).toBeNull();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');

    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => vi.advanceTimersByTime(2_250));
    const restoredGateway = screen.getByRole('button', { name: 'Enter Warpkeep' });
    act(() => vi.advanceTimersByTime(20));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('title');
    expect(document.activeElement).toBe(restoredGateway);
    expect(window.location.hash).toBe('');
  });

  it('loads #menu directly without mounting WebGL and can return without a reload', async () => {
    window.history.replaceState({}, '', '/#menu');
    const { container } = render(<WarpkeepExperience />);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(screen.queryByRole('button', { name: 'Enter Warpkeep' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(screen.getByRole('button', { name: 'Enter Warpkeep' })).not.toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('reprojects the reverse veil from the readied title after a viewport change', async () => {
    window.history.replaceState({}, '', '/#menu');
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement
    ) {
      if (
        this.classList.contains('warpkeep-title-screen')
        || this.classList.contains('warpkeep-gateway')
      ) {
        return rectangle(0, 0, 390, 844);
      }
      if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
        return rectangle(150, 275, 90, 40);
      }
      if (this.classList.contains('warpkeep-gateway-button')) {
        return rectangle(131, 250, 128, 90);
      }
      if (this.classList.contains('warp-transition-overlay')) {
        return rectangle(20, 40, 350, 700);
      }
      if (this.classList.contains('warpkeep-menu-command')) {
        return rectangle(40, 420, 310, 44);
      }
      if (this.classList.contains('warpkeep-menu-notice')) {
        return rectangle(0, 0, 340, 92);
      }
      return rectangle(0, 0, 0, 0);
    });
    render(<WarpkeepExperience />);

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(1));

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-input')).toBe('history');
    expect(overlay.getAttribute('data-gateway-client-x')).toBe('195');
    expect(overlay.getAttribute('data-gateway-client-y')).toBe('295');
    expectOverlayPercentageOrigin(overlay, 175 / 350, 255 / 700);
  });

  it('keeps reverse passage unarmed until a fresh rendered gateway measurement exists', async () => {
    window.history.replaceState({}, '', '/#menu');
    let gatewayVisible = false;
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement
    ) {
      if (
        this.classList.contains('warpkeep-title-screen')
        || this.classList.contains('warpkeep-gateway')
      ) {
        return rectangle(0, 0, 800, 600);
      }
      if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
        return gatewayVisible
          ? rectangle(200, 280, 84, 62)
          : rectangle(0, 0, 0, 0);
      }
      if (this.classList.contains('warpkeep-gateway-button')) {
        return rectangle(178, 266, 128, 90);
      }
      if (this.classList.contains('warp-transition-overlay')) {
        return rectangle(10, 15, 780, 570);
      }
      if (this.classList.contains('warpkeep-menu-command')) {
        return rectangle(420, 420, 280, 54);
      }
      return rectangle(0, 0, 0, 0);
    });
    const { container } = render(<WarpkeepExperience />);

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(3_000));

    const experience = container.querySelector('.warpkeep-experience')!;
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(experience.getAttribute('data-return-preparing')).toBe('true');
    expect(screen.queryByTestId('warp-transition-overlay')).toBeNull();

    gatewayVisible = true;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    });

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-title');
    expect(overlay.getAttribute('data-origin-ready')).toBe('true');
    expect(overlay.getAttribute('data-gateway-client-x')).toBe('242');
    expect(overlay.getAttribute('data-gateway-client-y')).toBe('311');
    expectOverlayPercentageOrigin(overlay, 232 / 780, 296 / 570);
  });

  it('uses each newly rendered gateway center across repeated bidirectional cycles', async () => {
    let gatewayCenter = { x: 420, y: 210 };
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement
    ) {
      if (
        this.classList.contains('warpkeep-title-screen')
        || this.classList.contains('warpkeep-gateway')
      ) {
        return rectangle(0, 0, 1280, 720);
      }
      if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
        return rectangle(gatewayCenter.x - 50, gatewayCenter.y - 20, 100, 40);
      }
      if (this.classList.contains('warpkeep-gateway-button')) {
        return rectangle(gatewayCenter.x - 64, gatewayCenter.y - 45, 128, 90);
      }
      if (this.classList.contains('warp-transition-overlay')) {
        return rectangle(25, 30, 1200, 660);
      }
      if (this.classList.contains('warpkeep-menu-command')) {
        return rectangle(900, 320, 280, 54);
      }
      if (this.classList.contains('warpkeep-menu-notice')) {
        return rectangle(0, 0, 360, 92);
      }
      return rectangle(0, 0, 0, 0);
    });
    const { container } = render(<WarpkeepExperience />);

    const expectOrigin = (
      sequence: number,
      input: 'history' | 'keyboard',
      x: number,
      y: number
    ) => {
      const overlay = screen.getByTestId('warp-transition-overlay');
      expect(overlay.getAttribute('data-transition-sequence')).toBe(String(sequence));
      expect(overlay.getAttribute('data-input')).toBe(input);
      expect(overlay.getAttribute('data-origin-ready')).toBe('true');
      expect(overlay.getAttribute('data-gateway-client-x')).toBe(String(x));
      expect(overlay.getAttribute('data-gateway-client-y')).toBe(String(y));
      expectOverlayPercentageOrigin(overlay, (x - 25) / 1_200, (y - 30) / 660);
    };

    fireEvent.click(await settleInitialTitle(), { detail: 0 });
    expectOrigin(1, 'keyboard', 420, 210);
    await act(async () => vi.advanceTimersByTime(2_250));

    window.history.replaceState({}, '', '/#menu');
    gatewayCenter = { x: 760, y: 330 };
    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(1));
    expectOrigin(2, 'history', 760, 330);
    await act(async () => vi.advanceTimersByTime(2_250));

    gatewayCenter = { x: 515, y: 260 };
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enter Warpkeep' }), {
      detail: 0
    });
    expectOrigin(3, 'keyboard', 515, 260);
    await act(async () => vi.advanceTimersByTime(2_250));

    window.history.replaceState({}, '', '/#menu');
    gatewayCenter = { x: 900, y: 410 };
    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(1));
    expectOrigin(4, 'history', 900, 410);
    expect(container.querySelector('.warpkeep-experience')
      ?.getAttribute('data-transition-sequence')).toBe('4');
  });

  it('honors the latest hash when history changes during an in-flight entry transition', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    const experience = container.querySelector('.warpkeep-experience')!;
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.history.replaceState({}, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(3_300));
    expect(experience.getAttribute('data-phase')).toBe('title');
    expect(window.location.hash).toBe('');
  });

  it('waits for a measured title gateway before honoring a menu history route', async () => {
    titleGatewayMeasurable = false;
    const { container } = render(<WarpkeepExperience />);
    expect(screen.queryByRole('button', { name: 'Enter Warpkeep' })).toBeNull();

    act(() => {
      window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    const experience = container.querySelector('.warpkeep-experience')!;
    expect(experience.getAttribute('data-phase')).toBe('title');
    expect(document.querySelector('.warp-transition-overlay')).toBeNull();

    titleGatewayMeasurable = true;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(1);
    });
    const overlay = document.querySelector<HTMLElement>('.warp-transition-overlay');
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');
    expect(overlay?.getAttribute('data-input')).toBe('history');
    expect(Number(overlay?.getAttribute('data-gateway-client-x'))).toBeCloseTo(676, 5);
    expect(Number(overlay?.getAttribute('data-gateway-client-y'))).toBeCloseTo(218, 5);
  });

  it('serializes Back during entry without exposing an interactive wrong-hash menu', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    const experience = container.querySelector('.warpkeep-experience')!;

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(1_400));
    const menuCommand = screen.queryByRole('button', { name: 'ENTER REALM', hidden: true });
    expect(menuCommand ? (menuCommand as HTMLButtonElement).disabled : true).toBe(true);

    await act(async () => vi.advanceTimersByTime(850));
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    });
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-title');
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-phase')).toBe('title');
    expect(window.location.hash).toBe('');
  });

  it('cancels a prepared return when Forward restores the menu hash', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    const experience = container.querySelector('.warpkeep-experience')!;

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-return-preparing')).toBe('true');

    act(() => {
      window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(experience.getAttribute('data-return-preparing')).toBe('false');
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect((screen.getByRole('button', { name: 'ENTER REALM' }) as HTMLButtonElement).disabled)
      .toBe(false);

    await act(async () => vi.advanceTimersByTime(3_500));
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
  });

  it('keeps one experience and cleans its shortcuts through a StrictMode lifecycle', async () => {
    window.history.replaceState({}, '', '/#menu');
    const { container, unmount } = render(
      <StrictMode>
        <WarpkeepExperience />
      </StrictMode>
    );

    expect(container.querySelectorAll('.warpkeep-experience')).toHaveLength(1);
    expect(container.querySelectorAll('audio[data-audio-role]')).toHaveLength(5);
    expect(container.querySelectorAll('audio[data-audio-role^="realm"][src]')).toHaveLength(0);
    expect(container.querySelectorAll('video.warpkeep-menu-background')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('title');
    expect(screen.getByRole('button', { name: 'Enter Warpkeep' })).not.toBeNull();

    unmount();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(container.querySelector('.warpkeep-experience')).toBeNull();
  });
});
