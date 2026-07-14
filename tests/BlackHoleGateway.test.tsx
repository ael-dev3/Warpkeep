import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle
} from '../src/components/title/BlackHoleGateway';
import { titleSceneSpec } from '../src/components/title/titleSceneSpec';

function renderVisibleGateway(props: React.ComponentProps<typeof BlackHoleGateway> = {}) {
  const gatewayRef = createRef<BlackHoleGatewayHandle>();
  const result = render(<BlackHoleGateway ref={gatewayRef} {...props} />);
  act(() => gatewayRef.current?.setProjectedPosition(200, 140, 400, 320, true));
  return { gatewayRef, ...result };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BlackHoleGateway', () => {
  it('projects a native semantic button without a React frame update', () => {
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
    expect(gatewayRef.current?.getProjectedPosition()).toEqual({
      x: 240,
      y: 120,
      viewportWidth: 800,
      viewportHeight: 600,
      visible: true
    });

    act(() => gatewayRef.current?.setProjectedPosition(Number.NaN, 120, 800, 600, true));
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.parentElement?.hidden).toBe(true);
  });

  it('wires the centered elliptical hit area to the shared title specification', () => {
    const { container } = renderVisibleGateway();
    const gateway = container.querySelector<HTMLElement>('.warpkeep-gateway');
    expect(gateway).not.toBeNull();
    expect(gateway!.style.getPropertyValue('--warpkeep-gateway-hit-width-min'))
      .toBe(`${titleSceneSpec.gateway.hitWidthMinPx}px`);
    expect(gateway!.style.getPropertyValue('--warpkeep-gateway-hit-width-fluid'))
      .toBe(`${titleSceneSpec.gateway.hitWidthViewportRatio * 100}vw`);
    expect(gateway!.style.getPropertyValue('--warpkeep-gateway-hit-width-max'))
      .toBe(`${titleSceneSpec.gateway.hitWidthMaxPx}px`);
    expect(gateway!.style.getPropertyValue('--warpkeep-gateway-hit-height-min'))
      .toBe(`${titleSceneSpec.gateway.hitHeightMinPx}px`);
    expect(gateway!.style.getPropertyValue('--warpkeep-gateway-hit-height-fluid'))
      .toBe(`${titleSceneSpec.gateway.hitHeightViewportRatio * 100}vw`);
    expect(gateway!.style.getPropertyValue('--warpkeep-gateway-hit-height-max'))
      .toBe(`${titleSceneSpec.gateway.hitHeightMaxPx}px`);
  });

  it('requests the real experience through the native click path without the obsolete notice', () => {
    const onActivate = vi.fn();
    renderVisibleGateway({ onActivate });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    fireEvent.click(button, { detail: 0 });
    expect(onActivate).toHaveBeenLastCalledWith('keyboard');
    expect(screen.queryByRole('status')).toBeNull();
    expect(button.hasAttribute('aria-expanded')).toBe(false);

    fireEvent.click(button, { detail: 1 });
    expect(onActivate).toHaveBeenLastCalledWith('pointer');
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('reports focus without treating focus, keydown, or pointerdown as activation', () => {
    const onFocusChange = vi.fn();
    const onMeaningfulInteraction = vi.fn();
    const { gatewayRef } = renderVisibleGateway({ onFocusChange, onMeaningfulInteraction });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    act(() => gatewayRef.current?.focus());
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: 'Shift' });
    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    expect(onMeaningfulInteraction).not.toHaveBeenCalled();

    fireEvent.click(button, { detail: 1 });
    expect(onMeaningfulInteraction).toHaveBeenCalledTimes(1);
    fireEvent.blur(button);
    expect(onFocusChange.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps an explicitly requested reusable notice dismissible and nonmodal', () => {
    renderVisibleGateway({ notice: 'Optional atmospheric status.', autoDismissMs: null });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    fireEvent.click(button);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Optional atmospheric status.');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(button.getAttribute('aria-describedby')).toBe(status.id);

    fireEvent.pointerDown(status);
    expect(screen.getByRole('status')).toBe(status);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refreshes and auto-dismisses only an explicitly configured notice', () => {
    vi.useFakeTimers();
    renderVisibleGateway({ notice: 'Temporary status.', autoDismissMs: 5_000 });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });

    fireEvent.click(button);
    const firstStatus = screen.getByRole('status');
    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.click(button);
    const refreshedStatus = screen.getByRole('status');
    expect(refreshedStatus).not.toBe(firstStatus);

    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByRole('status')).toBe(refreshedStatus);
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays disabled while its owning title view is inactive', () => {
    const onActivate = vi.fn();
    const { rerender, gatewayRef } = renderVisibleGateway({ onActivate, disabled: true });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep', hidden: true });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);
    expect(onActivate).not.toHaveBeenCalled();

    rerender(<BlackHoleGateway ref={gatewayRef} onActivate={onActivate} disabled={false} />);
    act(() => gatewayRef.current?.setProjectedPosition(200, 140, 400, 320, true));
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
