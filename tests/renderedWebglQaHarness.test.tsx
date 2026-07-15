import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RenderedWebglQaHarness } from '../src/dev/RenderedWebglQaHarness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('rendered WebGL local QA harness', () => {
  it('fails visibly rather than accepting the static fallback as a WebGL result', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fetchImpl = vi.fn(() => Promise.reject(new Error('Network is forbidden in fixture QA.')));
    vi.stubGlobal('fetch', fetchImpl);

    render(<RenderedWebglQaHarness quality="reduced" />);

    const status = screen.getByText('LOCAL RENDERED WEBGL QA').closest('aside');
    if (!(status instanceof HTMLElement)) throw new Error('missing rendered QA status');
    await waitFor(() => {
      expect(status.dataset.renderedWebglStatus).toBe('fallback');
    });
    expect(status.dataset.fixture).toBe('synthetic-canonical-100');
    expect(status.dataset.castleCount).toBe('100');
    expect(status.dataset.quality).toBe('reduced');
    expect(status.dataset.renderer).toBe('fallback');
    expect(screen.getByText('STATIC FALLBACK — NOT A RENDER PASS')).not.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByRole('main', { name: 'Hegemony realm QA observer' })
      .getAttribute('data-presentation-mode')).toBe('observer');
  });

  it('fails closed when its deterministic fixture cannot initialize', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(
      <RenderedWebglQaHarness
        createFixtureRealm={() => {
          throw new Error('fixture unavailable');
        }}
        quality="balanced"
      />
    );

    expect(screen.getByRole('alert').textContent).toMatch(/fixture initialization failed/i);
    const status = screen.getByText('LOCAL RENDERED WEBGL QA').closest('aside');
    expect(status?.getAttribute('data-rendered-webgl-status')).toBe('error');
    expect(screen.queryByRole('main', { name: 'Hegemony realm QA observer' })).toBeNull();
  });
});
