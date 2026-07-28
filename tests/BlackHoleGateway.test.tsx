import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BlackHoleGateway,
  type BlackHoleGatewayHandle
} from '../src/components/title/BlackHoleGateway';
import {
  createGatewayRendererPoint,
  snapshotGatewayRect
} from '../src/components/title/gatewayActivation';
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

const defaultRendererPoint = () => createGatewayRendererPoint({
  x: 200,
  y: 140,
  viewportWidth: 400,
  viewportHeight: 320,
  visible: true
});

const defaultSourceRect = () => snapshotGatewayRect(
  rectangle(100, 50, 800, 640)
)!;

type RenderedGatewayOptions = Readonly<{
  rendererPoint?: ReturnType<typeof createGatewayRendererPoint>;
  sourceRect?: ReturnType<typeof defaultSourceRect>;
  layerRect?: DOMRect;
  layerClientWidth?: number;
  layerClientHeight?: number;
  buttonRect?: DOMRect;
}>;

function renderVisibleGateway(
  props: React.ComponentProps<typeof BlackHoleGateway> = {},
  options: RenderedGatewayOptions = {}
) {
  const gatewayRef = createRef<BlackHoleGatewayHandle>();
  const result = render(<BlackHoleGateway ref={gatewayRef} {...props} />);
  const gateway = result.container.querySelector<HTMLElement>('.warpkeep-gateway')!;
  const anchor = result.container.querySelector<HTMLElement>('.warpkeep-gateway-anchor')!;
  const button = screen.getByRole('button', {
    name: 'Enter Warpkeep',
    hidden: true
  }) as HTMLButtonElement;
  const rendererPoint = options.rendererPoint ?? defaultRendererPoint();
  const sourceRect = options.sourceRect ?? defaultSourceRect();
  const layerRect = options.layerRect ?? rectangle(100, 50, 800, 640);
  const clientCenter = {
    x: sourceRect.left
      + rendererPoint.x / rendererPoint.viewportWidth * sourceRect.width,
    y: sourceRect.top
      + rendererPoint.y / rendererPoint.viewportHeight * sourceRect.height
  };
  const buttonRect = options.buttonRect
    ?? rectangle(clientCenter.x - 70, clientCenter.y - 45, 140, 90);

  vi.spyOn(gateway, 'getBoundingClientRect').mockReturnValue(layerRect);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(buttonRect);
  Object.defineProperty(gateway, 'clientWidth', {
    configurable: true,
    value: options.layerClientWidth ?? 400
  });
  Object.defineProperty(gateway, 'clientHeight', {
    configurable: true,
    value: options.layerClientHeight ?? 320
  });

  let ready = false;
  act(() => {
    ready = gatewayRef.current?.setRenderedGateway(rendererPoint, sourceRect) ?? false;
  });
  return {
    gatewayRef,
    gateway,
    anchor,
    button,
    rendererPoint,
    sourceRect,
    clientCenter,
    ready,
    ...result
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('BlackHoleGateway', () => {
  it('maps renderer coordinates through the source surface and scaled gateway layer', () => {
    const rendererPoint = createGatewayRendererPoint({
      x: 240,
      y: 120,
      viewportWidth: 800,
      viewportHeight: 600,
      visible: true
    });
    const sourceRect = snapshotGatewayRect(
      rectangle(100, 50, 1_600, 1_200)
    )!;
    const { anchor, button, gateway, gatewayRef, ready } = renderVisibleGateway(
      {},
      {
        rendererPoint,
        sourceRect,
        layerRect: rectangle(100, 50, 800, 600),
        layerClientWidth: 400,
        layerClientHeight: 300,
        buttonRect: rectangle(510, 245, 140, 90)
      }
    );

    expect(ready).toBe(true);
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.disabled).toBe(false);
    expect(anchor.style.transform).toBe('translate3d(240px, 120px, 0)');
    expect(gateway.dataset.rendererX).toBe('240');
    expect(gateway.dataset.rendererY).toBe('120');
    expect(gateway.dataset.clientX).toBe('580');
    expect(gateway.dataset.clientY).toBe('290');
    expect(gatewayRef.current?.getGatewayClientCenter()).toEqual({
      space: 'client',
      x: 580,
      y: 290
    });
    expect(gatewayRef.current?.getRenderedMeasurement()).toMatchObject({
      rendererPoint,
      sourceSurfaceRect: sourceRect,
      gatewayClientCenter: { space: 'client', x: 580, y: 290 },
      buttonClientCenter: { space: 'client', x: 580, y: 290 },
      alignmentErrorPx: 0,
      ready: true
    });
  });

  it('fails closed when the semantic button is not aligned to the rendered gateway', () => {
    const { button, gateway, gatewayRef, ready } = renderVisibleGateway(
      {},
      { buttonRect: rectangle(435, 285, 140, 90) }
    );

    expect(ready).toBe(false);
    expect(button.disabled).toBe(true);
    expect(gateway.dataset.interactive).toBe('false');
    expect(gatewayRef.current?.getRenderedMeasurement()).toMatchObject({
      gatewayClientCenter: { space: 'client', x: 500, y: 330 },
      buttonClientCenter: { space: 'client', x: 505, y: 330 },
      alignmentErrorPx: 5,
      ready: false
    });
  });

  it('wires the centered elliptical hit area to the shared title specification', () => {
    const { gateway } = renderVisibleGateway();
    expect(gateway.style.getPropertyValue('--warpkeep-gateway-hit-width-min'))
      .toBe(`${titleSceneSpec.gateway.hitWidthMinPx}px`);
    expect(gateway.style.getPropertyValue('--warpkeep-gateway-hit-width-fluid'))
      .toBe(`${titleSceneSpec.gateway.hitWidthViewportRatio * 100}vw`);
    expect(gateway.style.getPropertyValue('--warpkeep-gateway-hit-width-max'))
      .toBe(`${titleSceneSpec.gateway.hitWidthMaxPx}px`);
    expect(gateway.style.getPropertyValue('--warpkeep-gateway-hit-height-min'))
      .toBe(`${titleSceneSpec.gateway.hitHeightMinPx}px`);
    expect(gateway.style.getPropertyValue('--warpkeep-gateway-hit-height-fluid'))
      .toBe(`${titleSceneSpec.gateway.hitHeightViewportRatio * 100}vw`);
    expect(gateway.style.getPropertyValue('--warpkeep-gateway-hit-height-max'))
      .toBe(`${titleSceneSpec.gateway.hitHeightMaxPx}px`);
  });

  it('uses the rendered gateway center for keyboard activation and locks once', () => {
    const onActivate = vi.fn();
    const { anchor, button, gatewayRef } = renderVisibleGateway({ onActivate });
    const initialTransform = anchor.style.transform;

    fireEvent.click(button, { detail: 0 });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]?.[0]).toMatchObject({
      input: 'keyboard',
      pointerClientPoint: null,
      rendererPoint: {
        space: 'renderer',
        x: 200,
        y: 140,
        viewportWidth: 400,
        viewportHeight: 320,
        visible: true
      },
      sourceSurfaceRect: {
        space: 'client-rect',
        left: 100,
        top: 50,
        width: 800,
        height: 640
      },
      gatewayClientCenter: { space: 'client', x: 500, y: 330 },
      ready: true
    });
    expect(button.disabled).toBe(true);
    expect(button.tabIndex).toBe(-1);
    expect(anchor.hidden).toBe(true);
    expect(anchor.inert).toBe(true);
    expect(anchor.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(button, { detail: 0 });
    expect(onActivate).toHaveBeenCalledTimes(1);

    act(() => {
      gatewayRef.current?.setRenderedGateway(
        createGatewayRendererPoint({
          x: 310,
          y: 210,
          viewportWidth: 400,
          viewportHeight: 320,
          visible: true
        }),
        defaultSourceRect()
      );
    });
    expect(anchor.style.transform).toBe(initialTransform);
    expect(gatewayRef.current?.getRenderedMeasurement().ready).toBe(false);
  });

  it('retains pointer coordinates only as validation evidence, not visual origin', () => {
    const onActivate = vi.fn();
    const { button, gateway } = renderVisibleGateway({ onActivate });

    fireEvent.click(button, {
      detail: 1,
      clientX: 650,
      clientY: 330
    });
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(button, {
      detail: 1,
      clientX: 548.25,
      clientY: 301.75
    });

    const activation = onActivate.mock.calls[0]?.[0];
    expect(activation).toMatchObject({
      input: 'pointer',
      pointerClientPoint: {
        space: 'client',
        x: 548.25,
        y: 301.75
      },
      buttonRect: {
        space: 'client-rect',
        left: 430,
        top: 285,
        width: 140,
        height: 90
      },
      gatewayClientCenter: { space: 'client', x: 500, y: 330 }
    });
    expect(gateway.dataset.acceptedPointerX).toBe('548.25');
    expect(gateway.dataset.acceptedPointerY).toBe('301.75');
    expect(gateway.dataset.frozenClientX).toBe('500');
    expect(gateway.dataset.frozenClientY).toBe('330');
    expect(Object.isFrozen(activation)).toBe(true);
    expect(Object.isFrozen(activation.pointerClientPoint)).toBe(true);
    expect(Object.isFrozen(activation.rendererPoint)).toBe(true);
    expect(Object.isFrozen(activation.sourceSurfaceRect)).toBe(true);
  });

  it('retains the physical touch press when the synthesized click omits coordinates', () => {
    const onActivate = vi.fn();
    const { button } = renderVisibleGateway({ onActivate });

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
      pointerClientPoint: {
        space: 'client',
        x: 503.5,
        y: 312.25
      },
      gatewayClientCenter: { space: 'client', x: 500, y: 330 }
    });
  });

  it('reports focus without treating focus, keydown, or pointerdown as activation', () => {
    const onFocusChange = vi.fn();
    const onMeaningfulInteraction = vi.fn();
    const { button, gatewayRef } = renderVisibleGateway({
      onFocusChange,
      onMeaningfulInteraction
    });

    act(() => gatewayRef.current?.focus());
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: 'Shift' });
    fireEvent.pointerDown(button, {
      pointerType: 'mouse',
      button: 0,
      clientX: 500,
      clientY: 330
    });
    expect(onMeaningfulInteraction).not.toHaveBeenCalled();

    fireEvent.click(button, { detail: 0 });
    expect(onMeaningfulInteraction).toHaveBeenCalledTimes(1);
    fireEvent.blur(button);
    expect(onFocusChange.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps an explicitly requested reusable notice dismissible and nonmodal', () => {
    const { button } = renderVisibleGateway({
      notice: 'Optional atmospheric status.',
      autoDismissMs: null
    });

    fireEvent.click(button, { detail: 0 });
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Optional atmospheric status.');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(button.getAttribute('aria-describedby')).toBe(status.id);

    fireEvent.pointerDown(status);
    expect(screen.getByRole('status')).toBe(status);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(button, { detail: 0 });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refreshes and auto-dismisses only an explicitly configured notice', () => {
    vi.useFakeTimers();
    const { button } = renderVisibleGateway({
      notice: 'Temporary status.',
      autoDismissMs: 5_000
    });

    fireEvent.click(button, { detail: 0 });
    const firstStatus = screen.getByRole('status');
    act(() => vi.advanceTimersByTime(3_000));
    fireEvent.click(button, { detail: 0 });
    const refreshedStatus = screen.getByRole('status');
    expect(refreshedStatus).not.toBe(firstStatus);

    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByRole('status')).toBe(refreshedStatus);
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('retains a fresh rendered measurement while the owning title view is inactive', () => {
    const onActivate = vi.fn();
    const { button, gatewayRef, rerender } = renderVisibleGateway({
      onActivate,
      disabled: true
    });
    expect(button.disabled).toBe(true);
    expect(gatewayRef.current?.getRenderedMeasurement()).toMatchObject({
      gatewayClientCenter: { space: 'client', x: 500, y: 330 },
      ready: true
    });

    fireEvent.click(button);
    expect(onActivate).not.toHaveBeenCalled();

    rerender(
      <BlackHoleGateway
        ref={gatewayRef}
        onActivate={onActivate}
        disabled={false}
      />
    );
    expect(button.disabled).toBe(false);
  });
});
