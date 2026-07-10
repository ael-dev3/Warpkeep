import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle
} from '../src/components/title/BlackHoleGateway';

function renderVisibleGateway(props: React.ComponentProps<typeof BlackHoleGateway> = {}) {
  const gatewayRef = createRef<BlackHoleGatewayHandle>();
  const result = render(<BlackHoleGateway ref={gatewayRef} {...props} />);
  act(() => gatewayRef.current?.setProjectedPosition(200, 140, 400, 320, true));
  return { gatewayRef, ...result };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BlackHoleGateway', () => {
  it('exposes a native semantic button and positions it without a React frame update', () => {
    const gatewayRef = createRef<BlackHoleGatewayHandle>();
    render(<BlackHoleGateway ref={gatewayRef} />);
    const button = screen.getByRole('button', { hidden: true });

    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-label')).toBe('Enter Warpkeep');
    expect((button as HTMLButtonElement).type).toBe('button');
    expect((button as HTMLButtonElement).disabled).toBe(true);

    act(() => gatewayRef.current?.setProjectedPosition(240, 120, 800, 600, true));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.parentElement?.style.transform).toContain('translate3d(240px, 120px');

    act(() => gatewayRef.current?.setProjectedPosition(Number.NaN, 120, 800, 600, true));
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.parentElement?.hidden).toBe(true);
  });

  it('activates through the native click path and exposes a polite status notice', () => {
    const onActivate = vi.fn();
    renderVisibleGateway({ onActivate, autoDismissMs: null });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    button.focus();
    fireEvent.click(button, { detail: 0 });

    const status = screen.getByRole('status');
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(status.textContent).toBe('The Warpkeep gateway is still under development. Return soon.');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(status.id);
    expect(button.getAttribute('aria-describedby')).toBe(status.id);
    expect(document.activeElement).toBe(button);
  });

  it('reports focus changes without changing notice state', () => {
    const onFocusChange = vi.fn();
    renderVisibleGateway({ onFocusChange, autoDismissMs: null });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    fireEvent.focus(button);
    fireEvent.blur(button);

    expect(onFocusChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('activates directly from Enter and Space without allowing key-repeat surges', () => {
    const onActivate = vi.fn();
    renderVisibleGateway({ onActivate, autoDismissMs: null });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.getByRole('status')).not.toBeNull();
    expect(onActivate).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    expect(screen.queryByRole('status')).toBeNull();
    expect(onActivate).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(button, { key: ' ' });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.keyUp(button, { key: ' ' });
    expect(screen.getByRole('status')).not.toBeNull();
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('dismisses with Escape and with an outside pointer down but not an inside one', () => {
    renderVisibleGateway({ autoDismissMs: null });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    fireEvent.click(button);
    const firstStatus = screen.getByRole('status');
    fireEvent.pointerDown(firstStatus);
    expect(screen.getByRole('status')).toBe(firstStatus);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(screen.getByRole('status')).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('restarts auto-dismiss and refreshes the live notice on repeated activation', () => {
    vi.useFakeTimers();
    const onActivate = vi.fn();
    renderVisibleGateway({ onActivate, autoDismissMs: 5_000 });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    fireEvent.click(button);
    const firstStatus = screen.getByRole('status');
    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.click(button);
    const refreshedStatus = screen.getByRole('status');

    expect(refreshedStatus).not.toBe(firstStatus);
    expect(onActivate).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole('status')).toBe(refreshedStatus);
    act(() => vi.advanceTimersByTime(2_001));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('can keep the notice available when automatic dismissal is disabled', () => {
    vi.useFakeTimers();
    renderVisibleGateway({ autoDismissMs: null });
    fireEvent.click(screen.getByRole('button', { name: 'Enter Warpkeep' }));

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('status')).not.toBeNull();
  });

  it('keeps semantic activation available when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    renderVisibleGateway({ autoDismissMs: null });

    fireEvent.click(screen.getByRole('button', { name: 'Enter Warpkeep' }));
    expect(screen.getByRole('status').textContent).toContain('under development');
  });
});
