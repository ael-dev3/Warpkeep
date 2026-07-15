import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepQaJourneyLab } from '../src/dev/WarpkeepQaJourneyLab';
import {
  boundQaAutoCycleInterval,
  QA_ADMISSION_PHASE_BY_SCENARIO,
  QA_AUTH_SCENARIO_BY_PHASE,
  QA_JOURNEY_SCENARIOS,
  QA_SYNTHETIC_IDENTITY,
  QA_UNSCANNABLE_QR_DATA_URL,
  readQaJourneyOptions,
  type QaJourneyScenario
} from '../src/dev/qaJourneyFixture';

let animationFrames: Map<number, FrameRequestCallback>;
let nextAnimationFrameId: number;
let fetchImpl: ReturnType<typeof vi.fn>;
let storageRead: ReturnType<typeof vi.spyOn>;
let storageWrite: ReturnType<typeof vi.spyOn>;
let storageRemove: ReturnType<typeof vi.spyOn>;
let storageClear: ReturnType<typeof vi.spyOn>;
let cookieWrite: ReturnType<typeof vi.spyOn>;
let indexedDbOpen: ReturnType<typeof vi.fn>;

const QA_SCENARIO_LANDMARKS = {
  journey: { role: 'navigation', name: 'Hegemony main menu' },
  menu: { role: 'navigation', name: 'Hegemony main menu' },
  terms: { role: 'dialog', name: 'ALPHA PARTICIPATION TERMS' },
  'auth-creating': { role: 'heading', name: 'CLAIM YOUR KEEP' },
  'auth-awaiting': { role: 'heading', name: 'CLAIM YOUR KEEP' },
  'auth-qr-error': { role: 'heading', name: 'CLAIM YOUR KEEP' },
  'auth-verifying': { role: 'heading', name: 'VERIFYING HEGEMONY RECORD' },
  'admission-pending': { role: 'heading', name: 'ENTRY NOT YET GRANTED' },
  'auth-authenticated': { role: 'heading', name: 'HEGEMONY RECORD VERIFIED' },
  'auth-expired': { role: 'heading', name: 'AUTHENTICATION EXPIRED' },
  'auth-error': { role: 'heading', name: 'AUTHENTICATION FAILED' },
  'admission-connecting': { role: 'heading', name: 'OPENING HEGEMONY RECORDS' },
  'admission-reconnecting': { role: 'heading', name: 'REOPENING HEGEMONY RECORDS' },
  'admission-checking': { role: 'heading', name: 'VERIFYING FRONTIER ACCESS' },
  'admission-awaiting-terms': { role: 'heading', name: 'ALPHA TERMS REQUIRED' },
  'admission-denied': { role: 'heading', name: 'ENTRY NOT YET GRANTED' },
  'admission-bootstrapping': { role: 'heading', name: 'ESTABLISHING YOUR KEEP' },
  'admission-accepting-terms': { role: 'heading', name: 'RECORDING ALPHA TERMS' },
  'admission-opening-realm': { role: 'heading', name: 'OPENING GENESIS 001…' },
  'admission-error': { role: 'heading', name: 'HEGEMONY RECORDS UNREACHABLE' },
  'realm-player': { role: 'main', name: 'Hegemony realm' },
  'realm-observer': { role: 'main', name: 'Hegemony realm QA observer' }
} as const satisfies Readonly<Record<
  QaJourneyScenario,
  Readonly<{
    role: 'dialog' | 'heading' | 'main' | 'navigation';
    name: string;
  }>
>>;

function expectNoExternalSideEffects() {
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(storageRead).not.toHaveBeenCalled();
  expect(storageWrite).not.toHaveBeenCalled();
  expect(storageRemove).not.toHaveBeenCalled();
  expect(storageClear).not.toHaveBeenCalled();
  expect(cookieWrite).not.toHaveBeenCalled();
  expect(indexedDbOpen).not.toHaveBeenCalled();
}

async function settlePresentation() {
  await act(async () => {
    for (let round = 0; round < 8; round += 1) await Promise.resolve();
  });
  const frames = [...animationFrames.values()];
  animationFrames.clear();
  act(() => frames.forEach((callback) => callback(0)));
}

function acceptTerms() {
  const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
  fireEvent.click(within(dialog).getByRole('checkbox', {
    name: 'I understand and agree to these Alpha Terms.'
  }));
  fireEvent.click(within(dialog).getByRole('button', {
    name: /CONTINUE TO (?:SIGN-IN|ACCESS CHECK|REALM)/
  }));
}

beforeEach(() => {
  animationFrames = new Map();
  nextAnimationFrameId = 0;
  fetchImpl = vi.fn(() => Promise.reject(new Error('Network is forbidden in local journey tests.')));
  vi.stubGlobal('fetch', fetchImpl);
  vi.stubGlobal('XMLHttpRequest', class ForbiddenQaXmlHttpRequest {
    constructor() {
      throw new Error('XMLHttpRequest is forbidden in local journey tests.');
    }
  });
  vi.stubGlobal('WebSocket', class ForbiddenQaWebSocket {
    constructor() {
      throw new Error('WebSocket is forbidden in local journey tests.');
    }
  });
  vi.stubGlobal('EventSource', class ForbiddenQaEventSource {
    constructor() {
      throw new Error('EventSource is forbidden in local journey tests.');
    }
  });
  indexedDbOpen = vi.fn(() => {
    throw new Error('IndexedDB is forbidden in local journey tests.');
  });
  vi.stubGlobal('indexedDB', Object.freeze({ open: indexedDbOpen }));
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    nextAnimationFrameId += 1;
    animationFrames.set(nextAnimationFrameId, callback);
    return nextAnimationFrameId;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
    animationFrames.delete(frameId);
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  storageRead = vi.spyOn(Storage.prototype, 'getItem');
  storageWrite = vi.spyOn(Storage.prototype, 'setItem');
  storageRemove = vi.spyOn(Storage.prototype, 'removeItem');
  storageClear = vi.spyOn(Storage.prototype, 'clear');
  cookieWrite = vi.spyOn(document, 'cookie', 'set');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Warpkeep local QA journey lab', () => {
  it('keeps the synthetic QR presentation SVG structurally closed exactly once', () => {
    const encodedMarkup = QA_UNSCANNABLE_QR_DATA_URL.split(',', 2)[1];
    expect(encodedMarkup).toBeTruthy();

    const markup = decodeURIComponent(encodedMarkup!);
    expect(markup).toMatch(/^<svg\b/);
    expect(markup).toContain('NOT SCANNABLE');
    expect(markup.endsWith('</svg>')).toBe(true);
    expect(markup.match(/<\/svg>/g)).toHaveLength(1);
  });

  it('parses only bounded, enumerated local presentation options', () => {
    expect(readQaJourneyOptions('?scenario=auth-awaiting&autocycle=1&interval=2500')).toEqual({
      scenario: 'auth-awaiting',
      autoCycle: true,
      intervalMs: 2_500
    });
    expect(readQaJourneyOptions('?scenario=../../realm&autocycle=true&interval=1')).toEqual({
      scenario: 'journey',
      autoCycle: false,
      intervalMs: 6_000
    });
    expect(new Set(QA_JOURNEY_SCENARIOS.map(({ id }) => id)).size).toBe(
      QA_JOURNEY_SCENARIOS.length
    );
    expect(Object.keys(QA_AUTH_SCENARIO_BY_PHASE)).toHaveLength(8);
    expect(Object.keys(QA_ADMISSION_PHASE_BY_SCENARIO)).toHaveLength(9);
    expect(boundQaAutoCycleInterval(1)).toBe(6_000);
    expect(boundQaAutoCycleInterval(2_000)).toBe(2_000);
    expect(boundQaAutoCycleInterval(30_001)).toBe(6_000);
  });

  it.each(QA_JOURNEY_SCENARIOS)(
    'mounts the manifest-backed $id state without external authority',
    ({ id }) => {
      render(<WarpkeepQaJourneyLab initialScenario={id} />);
      const root = document.querySelector<HTMLElement>('.qa-journey');
      expect(root?.getAttribute('data-qa-scenario')).toBe(id);
      const landmark = QA_SCENARIO_LANDMARKS[id];
      expect(screen.getByRole(landmark.role, { name: landmark.name })).not.toBeNull();
      expectNoExternalSideEffects();
    }
  );

  it('runs the complete Terms, synthetic auth, admission, and realm journey without authority', async () => {
    render(<WarpkeepQaJourneyLab initialScenario="journey" />);

    expect(screen.getByText(
      'SYNTHETIC · LOOPBACK ONLY · EXTERNAL LINKS DISABLED'
    )).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const firstTerms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(firstTerms).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((within(firstTerms).getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    await act(async () => Promise.resolve());
    const labControls = document.querySelector<HTMLElement>('.qa-journey__controls');
    expect(labControls?.hasAttribute('inert')).toBe(true);
    const hideControls = labControls?.querySelector<HTMLButtonElement>('button:last-of-type');
    expect(hideControls?.textContent).toBe('HIDE CONTROLS');
    fireEvent.click(hideControls!);
    expect(document.querySelector('.qa-journey__controls')).toBe(labControls);
    expect(screen.queryByRole('complementary', { name: 'Local QA controls' })).toBeNull();

    acceptTerms();
    await settlePresentation();
    let authPanel = screen.getByRole('region', { name: 'Farcaster sign-in' });
    expect(authPanel.getAttribute('data-phase')).toBe('creating-channel');

    fireEvent.click(screen.getByRole('button', { name: 'CREATE SYNTHETIC CHANNEL' }));
    authPanel = screen.getByRole('region', { name: 'Farcaster sign-in' });
    expect(authPanel.getAttribute('data-phase')).toBe('awaiting-approval');
    const qr = within(authPanel).getByRole('img', { name: 'Sign in with Farcaster QR code' });
    expect(qr.getAttribute('src')).toBe(QA_UNSCANNABLE_QR_DATA_URL);
    expect(within(authPanel).queryByRole('link')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'RECEIVE SYNTHETIC APPROVAL' }));
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' }).getAttribute('data-phase'))
      .toBe('verifying');
    fireEvent.click(screen.getByRole('button', { name: 'COMPLETE LOCAL VERIFICATION' }));
    expect(screen.getByRole('heading', { name: 'ENTRY NOT YET GRANTED' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'ENTER REALM' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    expect(screen.getByRole('heading', { name: 'HEGEMONY RECORD VERIFIED' })).not.toBeNull();
    expect(document.body.textContent).toContain(String(QA_SYNTHETIC_IDENTITY.fid));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    const secondTerms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(secondTerms).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    acceptTerms();
    await settlePresentation();

    expect(screen.getByRole('main', { name: 'Hegemony realm' })).not.toBeNull();
    expect(screen.getByTestId('realm-static-fallback')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expectNoExternalSideEffects();
  });

  it('keeps a direct Terms fixture unchecked, isolated, and side-effect free', async () => {
    render(<WarpkeepQaJourneyLab initialScenario="terms" />);
    const terms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(terms).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((within(terms).getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => Promise.resolve());
    expect(document.querySelector('.qa-journey__controls')?.hasAttribute('inert')).toBe(true);
    expectNoExternalSideEffects();
  });

  it.each([
    ['auth-creating', 'CLAIM YOUR KEEP'],
    ['auth-awaiting', 'CLAIM YOUR KEEP'],
    ['auth-qr-error', 'CLAIM YOUR KEEP'],
    ['auth-verifying', 'VERIFYING HEGEMONY RECORD'],
    ['admission-pending', 'ENTRY NOT YET GRANTED'],
    ['auth-authenticated', 'HEGEMONY RECORD VERIFIED'],
    ['auth-expired', 'AUTHENTICATION EXPIRED'],
    ['auth-error', 'AUTHENTICATION FAILED']
  ] as const)('renders the %s presentation from synthetic local state', (scenario, heading) => {
    render(<WarpkeepQaJourneyLab initialScenario={scenario as QaJourneyScenario} />);
    expect(screen.getByRole('heading', { name: heading })).not.toBeNull();
    expect(screen.queryByRole('link', { name: /open (?:in )?farcaster/i })).toBeNull();
    expectNoExternalSideEffects();
  });

  it.each([
    ['admission-connecting', 'OPENING HEGEMONY RECORDS'],
    ['admission-reconnecting', 'REOPENING HEGEMONY RECORDS'],
    ['admission-checking', 'VERIFYING FRONTIER ACCESS'],
    ['admission-awaiting-terms', 'ALPHA TERMS REQUIRED'],
    ['admission-denied', 'ENTRY NOT YET GRANTED'],
    ['admission-bootstrapping', 'ESTABLISHING YOUR KEEP'],
    ['admission-accepting-terms', 'RECORDING ALPHA TERMS'],
    ['admission-opening-realm', 'OPENING GENESIS 001…'],
    ['admission-error', 'HEGEMONY RECORDS UNREACHABLE']
  ] as const)('renders exhaustive %s backend presentation state', (scenario, heading) => {
    render(<WarpkeepQaJourneyLab initialScenario={scenario} />);
    expect(screen.getByRole('heading', { name: heading })).not.toBeNull();
    expectNoExternalSideEffects();
  });

  it('keeps direct fixtures presentation-only and suppresses external navigation', () => {
    let rendered = render(<WarpkeepQaJourneyLab initialScenario="auth-authenticated" />);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('heading', { name: 'HEGEMONY RECORD VERIFIED' })).not.toBeNull();
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();

    rendered.unmount();
    rendered = render(<WarpkeepQaJourneyLab initialScenario="auth-qr-error" />);
    fireEvent.click(screen.getByRole('button', { name: 'TRY QR AGAIN' }));
    expect(screen.getByRole('img', { name: 'Sign in with Farcaster QR code' })).not.toBeNull();

    rendered.unmount();
    render(<WarpkeepQaJourneyLab initialScenario="menu" />);
    const external = screen.getByRole('link', {
      name: 'Open Warpkeep repository on GitHub (opens in a new tab)'
    });
    const before = window.location.href;
    expect(fireEvent.click(external)).toBe(false);
    expect(fireEvent(external, new MouseEvent('auxclick', {
      bubbles: true,
      button: 1,
      cancelable: true
    }))).toBe(false);
    expect(fireEvent.contextMenu(external)).toBe(false);
    expect(window.location.href).toBe(before);
    expectNoExternalSideEffects();
  });

  it('bounds auto-cycle and never starts it inside the interactive consent journey', () => {
    vi.useFakeTimers();
    const { container, unmount } = render(
      <WarpkeepQaJourneyLab initialAutoCycle initialScenario="journey" />
    );
    expect(screen.getByRole('button', { name: 'START AUTO-CYCLE' })).not.toBeNull();
    act(() => vi.advanceTimersByTime(30_000));
    expect(container.querySelector('.qa-journey')?.getAttribute('data-qa-scenario')).toBe('journey');

    unmount();
    const second = render(
      <WarpkeepQaJourneyLab
        autoCycleIntervalMs={1}
        initialAutoCycle
        initialScenario="menu"
      />
    );
    act(() => vi.advanceTimersByTime(5_999));
    expect(second.container.querySelector('.qa-journey')?.getAttribute('data-qa-scenario'))
      .toBe('menu');
    act(() => vi.advanceTimersByTime(1));
    expect(second.container.querySelector('.qa-journey')?.getAttribute('data-qa-scenario'))
      .toBe('auth-creating');
    expectNoExternalSideEffects();
  });

  it.each([
    ['realm-player', 'Hegemony realm'],
    ['realm-observer', 'Hegemony realm QA observer']
  ] as const)('mounts %s with the canonical local fixture', (scenario, accessibleName) => {
    render(<WarpkeepQaJourneyLab initialScenario={scenario} />);
    expect(screen.getByRole('main', { name: accessibleName })).not.toBeNull();
    expect(screen.getByTestId('realm-static-fallback')).not.toBeNull();
    expectNoExternalSideEffects();
  });

  it('promotes the exact Explore identity into player inspection without authority', async () => {
    render(<WarpkeepQaJourneyLab initialScenario="realm-player" />);
    await settlePresentation();

    fireEvent.click(screen.getByRole('button', {
      name: 'Explore realm, 4 founded castles'
    }));
    const explore = screen.getByRole('dialog', { name: 'Explore' });
    fireEvent.change(within(explore).getByRole('searchbox', {
      name: 'Search founded castles'
    }), { target: { value: 'sentinel-two' } });
    const target = within(explore).getByRole('button', {
      name: /Inspect @sentinel-two, Cinderwatch Keep/
    });
    fireEvent.click(target);
    await settlePresentation();

    const inspector = screen.getByRole('dialog', { name: '@sentinel-two' });
    expect(within(inspector).getByText('Cinderwatch Keep')).not.toBeNull();
    const focusedLabels = document.querySelectorAll<HTMLButtonElement>(
      'button.realm-castle-label[data-castle-id="102"][data-focused="true"]'
    );
    expect(focusedLabels).toHaveLength(1);
    expect(focusedLabels[0]?.querySelector('.realm-castle-label__identity')?.textContent)
      .toBe('@sentinel-two');
    expect(document.querySelector('.realm-map-screen')?.getAttribute('data-label-accounting-valid'))
      .toBe('true');
    expectNoExternalSideEffects();
  });
});
