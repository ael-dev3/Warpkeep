import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepExperience } from '../src/components/WarpkeepExperience';

function installBrowserStubs() {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    media: '',
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
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
  installBrowserStubs();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Warpkeep realm entry', () => {
  it('opens the deterministic realm through ENTER REALM and returns to the existing menu', async () => {
    const { container } = render(<WarpkeepExperience />);
    const experience = container.querySelector('.warpkeep-experience')!;

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(experience.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');
    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Lowlands' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    await act(async () => {});
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();
  });

  it('supports a direct #realm load with a safe menu return route', () => {
    window.history.replaceState({}, '', '/#realm');
    const { container } = render(<WarpkeepExperience />);

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Lowlands' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
  });

  it('leaves the other menu commands as their existing development notices', () => {
    render(<WarpkeepExperience />);

    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS' }));
    expect(screen.getByRole('status').textContent).toContain('war council');
  });
});
