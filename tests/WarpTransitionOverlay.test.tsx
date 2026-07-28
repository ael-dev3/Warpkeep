import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarpTransitionOverlay } from '../src/components/transition/WarpTransitionOverlay';
import type {
  GatewayTransitionInput,
  GatewayTransitionRequest,
  WarpTransitionDirection
} from '../src/components/transition/experienceTransition';

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

function transitionRequest({
  direction = 'to-menu',
  input = 'pointer',
  sequence = 1,
  x = 643.25,
  y = 274.5
}: Partial<{
  direction: WarpTransitionDirection;
  input: GatewayTransitionInput;
  sequence: number;
  x: number;
  y: number;
}> = {}): GatewayTransitionRequest {
  return Object.freeze({
    sequence,
    direction,
    input,
    gatewayClientOrigin: Object.freeze({ space: 'client', x, y }),
    acceptedAt: 100
  });
}

function mockOverlayRect(getRect: () => DOMRect) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('warp-transition-overlay')) {
        return getRect();
      }
      return rectangle(0, 0, 0, 0);
    });
}

function expectPercentageOrigin(
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WarpTransitionOverlay', () => {
  it('converts the immutable client-space gateway center into normalized overlay coordinates', () => {
    mockOverlayRect(() => rectangle(100, 50, 900, 600));
    render(
      <WarpTransitionOverlay
        request={transitionRequest()}
        reducedMotion={false}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.getAttribute('data-direction')).toBe('to-menu');
    expect(overlay.getAttribute('data-input')).toBe('pointer');
    expect(overlay.getAttribute('data-motion')).toBe('standard');
    expect(overlay.getAttribute('data-origin-ready')).toBe('true');
    expect(overlay.getAttribute('data-transition-sequence')).toBe('1');
    expect(overlay.getAttribute('data-gateway-client-x')).toBe('643.25');
    expect(overlay.getAttribute('data-gateway-client-y')).toBe('274.5');
    expect(overlay.getAttribute('data-overlay-left')).toBe('100');
    expect(overlay.getAttribute('data-overlay-top')).toBe('50');
    expect(overlay.getAttribute('data-portal-root')).toBe('body');
    expect(overlay.parentElement).toBe(document.body);
    expectPercentageOrigin(overlay, 543.25 / 900, 224.5 / 600);
    expect(Number(overlay.getAttribute('data-overlay-origin-x'))).toBeCloseTo(543.25);
    expect(Number(overlay.getAttribute('data-overlay-origin-y'))).toBeCloseTo(224.5);
    expect(overlay.style.getPropertyValue('--warp-transition-duration')).toBe('2000ms');
    expect(overlay.style.getPropertyValue('--warp-cover-at')).toBe('1240ms');
  });

  it('normalizes through an overlay whose local dimensions are twice its rendered bounds', () => {
    mockOverlayRect(() => rectangle(0, 0, 1_920, 1_080));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('warp-transition-overlay') ? 3_840 : 0;
      });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('warp-transition-overlay') ? 2_160 : 0;
      });
    render(
      <WarpTransitionOverlay
        request={transitionRequest({ x: 960, y: 370 })}
        reducedMotion={false}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    expectPercentageOrigin(overlay, 0.5, 370 / 1_080);
    expect(overlay.getAttribute('data-overlay-client-width')).toBe('3840');
    expect(overlay.getAttribute('data-overlay-client-height')).toBe('2160');
    expect(Number(overlay.getAttribute('data-overlay-origin-x'))).toBe(1_920);
    expect(Number(overlay.getAttribute('data-overlay-origin-y'))).toBeCloseTo(740);
    expect(
      Number(overlay.getAttribute('data-overlay-origin-x'))
      / overlay.clientWidth
      * 1_920
    ).toBeCloseTo(960);
    expect(
      Number(overlay.getAttribute('data-overlay-origin-y'))
      / overlay.clientHeight
      * 1_080
    ).toBeCloseTo(370);
  });

  it('stays unarmed with no default origin until its own bounds are measurable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    let overlayRect = rectangle(0, 0, 0, 0);
    mockOverlayRect(() => overlayRect);
    const onCovered = vi.fn();
    const onComplete = vi.fn();
    const onArmed = vi.fn();
    render(
      <WarpTransitionOverlay
        request={transitionRequest({ direction: 'to-title', input: 'history' })}
        onArmed={onArmed}
        onCovered={onCovered}
        onComplete={onComplete}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-direction')).toBe('to-title');
    expect(overlay.getAttribute('data-origin-ready')).toBe('false');
    expect(overlay.getAttribute('data-overlay-origin-x')).toBe('');
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('');
    expect(overlay.style.getPropertyValue('--warp-origin-y')).toBe('');
    expect(onArmed).not.toHaveBeenCalled();

    fireEvent.animationEnd(overlay);
    expect(onCovered).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    overlayRect = rectangle(100, 50, 900, 600);
    fireEvent(window, new Event('resize'));

    expect(overlay.getAttribute('data-origin-ready')).toBe('true');
    expectPercentageOrigin(overlay, 543.25 / 900, 224.5 / 600);
    expect(onArmed).toHaveBeenCalledOnce();
  });

  it('arms once and reprojects the accepted client origin across later resize', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    let overlayRect = rectangle(100, 50, 900, 600);
    mockOverlayRect(() => overlayRect);
    const onArmed = vi.fn();
    render(
      <WarpTransitionOverlay
        request={transitionRequest()}
        onArmed={onArmed}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(onArmed).toHaveBeenCalledOnce();
    expect(overlay.getAttribute('data-overlay-left')).toBe('100');
    expectPercentageOrigin(overlay, 543.25 / 900, 224.5 / 600);

    overlayRect = rectangle(200, 100, 700, 500);
    fireEvent(window, new Event('resize'));

    expect(onArmed).toHaveBeenCalledOnce();
    expect(overlay.getAttribute('data-overlay-left')).toBe('200');
    expect(overlay.getAttribute('data-overlay-top')).toBe('100');
    expectPercentageOrigin(overlay, 443.25 / 700, 174.5 / 500);
    expect(
      200 + Number(overlay.getAttribute('data-overlay-origin-u')) * 700
    ).toBeCloseTo(643.25);
    expect(
      100 + Number(overlay.getAttribute('data-overlay-origin-v')) * 500
    ).toBeCloseTo(274.5);
  });

  it('records visual viewport geometry without changing client-space origin math', () => {
    const visualViewport = Object.assign(new EventTarget(), {
      offsetLeft: 12,
      offsetTop: 18,
      width: 780,
      height: 520,
      scale: 1.5
    });
    vi.stubGlobal('visualViewport', visualViewport);
    mockOverlayRect(() => rectangle(100, 50, 900, 600));
    render(<WarpTransitionOverlay request={transitionRequest()} />);

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-visual-viewport-offset-left')).toBe('12');
    expect(overlay.getAttribute('data-visual-viewport-offset-top')).toBe('18');
    expect(overlay.getAttribute('data-visual-viewport-width')).toBe('780');
    expect(overlay.getAttribute('data-visual-viewport-height')).toBe('520');
    expect(overlay.getAttribute('data-visual-viewport-scale')).toBe('1.5');
    expectPercentageOrigin(overlay, 543.25 / 900, 224.5 / 600);
  });

  it('emits covered and completed milestones at most once', () => {
    mockOverlayRect(() => rectangle(0, 0, 1280, 720));
    const onCovered = vi.fn();
    const onComplete = vi.fn();
    render(
      <WarpTransitionOverlay
        request={transitionRequest()}
        onCovered={onCovered}
        onComplete={onComplete}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    const coverSignal = document.querySelector('.warp-transition-overlay__cover-signal')!;
    // React uses the prefixed event in jsdom, where AnimationEvent is absent.
    const finishAnimation = (element: Element) => {
      fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }));
    };
    finishAnimation(coverSignal);
    finishAnimation(coverSignal);
    finishAnimation(overlay);
    finishAnimation(overlay);

    expect(onCovered).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('uses a short static fade for explicit or preferred reduced motion', () => {
    mockOverlayRect(() => rectangle(0, 0, 1280, 720));
    const { rerender } = render(
      <WarpTransitionOverlay request={transitionRequest()} reducedMotion />
    );
    let overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-motion')).toBe('reduced');
    expect(overlay.style.getPropertyValue('--warp-transition-duration')).toBe('240ms');
    expect(overlay.style.getPropertyValue('--warp-cover-at')).toBe('120ms');

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    rerender(
      <WarpTransitionOverlay
        request={transitionRequest({ direction: 'to-title', sequence: 2 })}
      />
    );
    overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-motion')).toBe('reduced');
  });
});
