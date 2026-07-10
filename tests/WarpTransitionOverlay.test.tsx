import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WarpTransitionOverlay } from '../src/components/transition/WarpTransitionOverlay';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WarpTransitionOverlay', () => {
  it('anchors the cinematic veil to the supplied projected gateway center', () => {
    render(
      <WarpTransitionOverlay
        direction="to-menu"
        origin={{ x: 643.25, y: 274.5 }}
        reducedMotion={false}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    expect(overlay.getAttribute('data-direction')).toBe('to-menu');
    expect(overlay.getAttribute('data-motion')).toBe('standard');
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('643.25px');
    expect(overlay.style.getPropertyValue('--warp-origin-y')).toBe('274.5px');
    expect(overlay.style.getPropertyValue('--warp-transition-duration')).toBe('2000ms');
    expect(overlay.style.getPropertyValue('--warp-cover-at')).toBe('1240ms');
  });

  it('falls back safely when projected coordinates are unavailable', () => {
    render(
      <WarpTransitionOverlay
        direction="to-title"
        origin={{ x: Number.NaN, y: Number.POSITIVE_INFINITY }}
        reducedMotion={false}
      />
    );

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-direction')).toBe('to-title');
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('50%');
    expect(overlay.style.getPropertyValue('--warp-origin-y')).toBe('42%');
  });

  it('emits covered and completed milestones at most once', () => {
    const onCovered = vi.fn();
    const onComplete = vi.fn();
    const { container } = render(
      <WarpTransitionOverlay
        direction="to-menu"
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
    const { rerender } = render(
      <WarpTransitionOverlay direction="to-menu" reducedMotion />
    );
    let overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-motion')).toBe('reduced');
    expect(overlay.style.getPropertyValue('--warp-transition-duration')).toBe('240ms');
    expect(overlay.style.getPropertyValue('--warp-cover-at')).toBe('120ms');

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    rerender(<WarpTransitionOverlay direction="to-title" />);
    overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.getAttribute('data-motion')).toBe('reduced');
  });
});
