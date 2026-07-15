import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RenderedWebglQaHarness } from '../src/dev/RenderedWebglQaHarness';
import {
  RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS,
  RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS
} from '../src/dev/renderedWebglQa';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it('ignores a transient responsive map replacement but fails closed after bounded absence', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('innerWidth', 667);
    vi.stubGlobal('innerHeight', 375);

    const rendered = render(<RenderedWebglQaHarness quality="reduced" />);
    const status = screen.getByText('LOCAL RENDERED WEBGL QA').closest('aside');
    if (!(status instanceof HTMLElement)) throw new Error('missing rendered QA status');
    await waitFor(() => expect(status.dataset.renderer).toBe('fallback'));

    const map = screen.getByRole('main', { name: 'Hegemony realm QA observer' });
    const mapParent = map.parentElement;
    if (!mapParent) throw new Error('missing rendered QA map parent');
    vi.useFakeTimers();
    try {
      map.remove();
      await act(async () => Promise.resolve());
      expect(status.dataset.renderer).toBe('fallback');

      mapParent.append(map);
      await act(async () => Promise.resolve());
      await act(async () => {
        vi.advanceTimersByTime(RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS);
      });
      expect(status.dataset.renderer).toBe('fallback');

      map.remove();
      await act(async () => Promise.resolve());
      await act(async () => {
        vi.advanceTimersByTime(RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS - 1);
      });
      expect(status.dataset.renderer).toBe('fallback');
      await act(async () => vi.advanceTimersByTime(1));
      expect(status.dataset.renderer).toBe('error');
    } finally {
      mapParent.append(map);
      rendered.unmount();
      vi.useRealTimers();
    }
  });

  it('retains the first valid WebGL readiness attestation during a long-lived session', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    render(<RenderedWebglQaHarness quality="high" />);
    const status = screen.getByText('LOCAL RENDERED WEBGL QA').closest('aside');
    if (!(status instanceof HTMLElement)) throw new Error('missing rendered QA status');
    await waitFor(() => expect(status.dataset.renderer).toBe('fallback'));
    const map = screen.getByRole('main', { name: 'Hegemony realm QA observer' });

    now = 1_120;
    map.dataset.renderer = 'webgl';
    await waitFor(() => expect(status.dataset.renderer).toBe('webgl'));
    expect(status.dataset.readyAfterMs).toBe('120');

    now = 1_000 + RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS + 60_000;
    map.append(document.createElement('span'));
    await act(async () => Promise.resolve());
    expect(status.dataset.renderer).toBe('webgl');
    expect(status.dataset.renderedWebglStatus).toBe('ready');
    expect(status.dataset.readyAfterMs).toBe('120');

    map.dataset.renderer = 'fallback';
    await waitFor(() => expect(status.dataset.renderer).toBe('fallback'));
    map.dataset.renderer = 'webgl';
    await waitFor(() => expect(status.dataset.renderer).toBe('error'));
  });
});
