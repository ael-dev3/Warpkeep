import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle
} from '../src/components/title/BlackHoleGateway';
import { titleSceneSpec } from '../src/components/title/titleSceneSpec';

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
    expect(button.closest('.warpkeep-gateway')?.getAttribute('data-interactive')).toBe('true');
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
    expect(button.closest('.warpkeep-gateway')?.getAttribute('data-interactive')).toBe('false');
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

  it('requests the real experience once and retires the focus anchor immediately', () => {
    const onActivate = vi.fn();
    const { gatewayRef } = renderVisibleGateway({ onActivate });
    const button = screen.getByRole('button', {
      name: 'Enter Warpkeep'
    }) as HTMLButtonElement;
    const anchor = button.parentElement as HTMLDivElement;
    const initialTransform = anchor.style.transform;

    fireEvent.click(button, { detail: 0 });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]?.[0]).toMatchObject({
      input: 'keyboard',
      projection: {
        x: 200,
        y: 140,
        viewportWidth: 400,
        viewportHeight: 320,
        visible: true
      }
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(button.hasAttribute('aria-expanded')).toBe(false);
    expect(button.disabled).toBe(true);
    expect(button.tabIndex).toBe(-1);
    expect(anchor.hidden).toBe(true);
    expect(anchor.inert).toBe(true);
    expect(anchor.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(button, { detail: 1 });
    expect(onActivate).toHaveBeenCalledTimes(1);

    act(() => gatewayRef.current?.setProjectedPosition(310, 210, 400, 320, true));
    expect(anchor.style.transform).toBe(initialTransform);
    expect(button.closest('.warpkeep-gateway')?.getAttribute('data-interactive')).toBe('false');
    expect(gatewayRef.current?.getProjectedPosition()).toMatchObject({
      x: 200,
      y: 140,
      visible: false
    });
  });

  it('captures exact pointer coordinates in one deeply immutable activation record', () => {
    const onActivate = vi.fn();
    const { container } = renderVisibleGateway({ onActivate });
    const gateway = container.querySelector<HTMLElement>('.warpkeep-gateway')!;
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });
    vi.spyOn(gateway, 'getBoundingClientRect').mockReturnValue(
      rectangle(100, 50, 800, 640)
    );
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
      rectangle(430, 270, 140, 90)
    );

    fireEvent.click(button, {
      detail: 1,
      clientX: 548.25,
      clientY: 301.75
    });

    const activation = onActivate.mock.calls[0]?.[0];
    expect(activation).toMatchObject({
      input: 'pointer',
      clientPoint: { x: 548.25, y: 301.75 },
      buttonRect: { left: 430, top: 270, width: 140, height: 90 },
      projectionSourceRect: { left: 100, top: 50, width: 800, height: 640 }
    });
    expect(Object.isFrozen(activation)).toBe(true);
    expect(Object.isFrozen(activation.clientPoint)).toBe(true);
    expect(Object.isFrozen(activation.buttonRect)).toBe(true);
    expect(Object.isFrozen(activation.projection)).toBe(true);
    expect(Object.isFrozen(activation.projectionSourceRect)).toBe(true);
  });

  it('retains the physical press point when a touch click omits usable coordinates', () => {
    const onActivate = vi.fn();
    renderVisibleGateway({ onActivate });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
      rectangle(430, 270, 140, 90)
    );

    fireEvent.pointerDown(button, {
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 503.5,
      clientY: 312.25
    });
    fireEvent.click(button, {
      detail: 1,
      clientX: 0,
      clientY: 0
    });

    expect(onActivate.mock.calls[0]?.[0]).toMatchObject({
      input: 'pointer',
      clientPoint: { x: 503.5, y: 312.25 }
    });
  });

  it('captures the measured button rectangle for keyboard activation', () => {
    const onActivate = vi.fn();
    renderVisibleGateway({ onActivate });
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(
      rectangle(356, 172, 128, 88)
    );

    fireEvent.click(button, { detail: 0, clientX: 0, clientY: 0 });

    expect(onActivate.mock.calls[0]?.[0]).toMatchObject({
      input: 'keyboard',
      clientPoint: null,
      buttonRect: { left: 356, top: 172, width: 128, height: 88 }
    });
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
