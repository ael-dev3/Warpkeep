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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WarpTransitionOverlay', () => {
  it('converts the immutable client-space gateway center into overlay-local coordinates', () => {
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
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('543.25px');
    expect(overlay.style.getPropertyValue('--warp-origin-y')).toBe('224.5px');
    expect(overlay.style.getPropertyValue('--warp-transition-duration')).toBe('2000ms');
    expect(overlay.style.getPropertyValue('--warp-cover-at')).toBe('1240ms');
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
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('543.25px');
    expect(overlay.style.getPropertyValue('--warp-origin-y')).toBe('224.5px');
    expect(onArmed).toHaveBeenCalledOnce();
  });

  it('arms once and keeps the accepted client origin immutable across later resize', () => {
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
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('543.25px');

    overlayRect = rectangle(200, 100, 700, 500);
    fireEvent(window, new Event('resize'));

    expect(onArmed).toHaveBeenCalledOnce();
    expect(overlay.getAttribute('data-overlay-left')).toBe('100');
    expect(overlay.getAttribute('data-overlay-top')).toBe('50');
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('543.25px');
    expect(overlay.style.getPropertyValue('--warp-origin-y')).toBe('224.5px');
  });

  it('emits covered and completed milestones at most once', () => {
    mockOverlayRect(() => rectangle(0, 0, 1280, 720));
    const onCovered = vi.fn();
    const onComplete = vi.fn();
    const { container } = render(
      <WarpTransitionOverlay
        request={transitionRequest()}
        onCovered={onCovered}
        onComplete={onComplete}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    const coverSignal = container.querySelector('.warp-transition-overlay__cover-signal')!;
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
