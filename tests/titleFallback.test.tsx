import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WarpkeepTitleScreenFallback } from '../src/components/title/WarpkeepTitleScreenFallback';
import { resolveGatewayActivationOrigin } from '../src/components/title/gatewayActivation';

describe('Warpkeep continuous-outline fallback', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the non-WebGL fallback free of a programmatic title wordmark', () => {
    const { container } = render(<WarpkeepTitleScreenFallback />);
    expect(container.querySelector('.warpkeep-fallback-wordmark')).toBeNull();
    expect(container.querySelector('.warpkeep-fallback-title-stage')).toBeNull();
    expect(container.querySelector('h1')).toBeNull();
    expect(container.textContent).not.toContain('WARPKEEP');
  });

  it('uses lightweight eye-lens crescents and localized rays in the decorative fallback', () => {
    const { container } = render(<WarpkeepTitleScreenFallback />);
    const decorativeGalaxy = container.querySelector('.warpkeep-fallback-galaxy');
    expect(decorativeGalaxy?.getAttribute('aria-hidden')).toBe('true');
    expect(decorativeGalaxy?.querySelectorAll('.warpkeep-fallback-lens')).toHaveLength(2);
    expect(decorativeGalaxy?.querySelectorAll('.warpkeep-fallback-ray')).toHaveLength(2);
  });

  it('keeps a semantic core gateway outside the decorative aria-hidden galaxy', () => {
    const onRequestEnterMenu = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
        return {
          x: 680,
          y: 230,
          left: 680,
          top: 230,
          right: 832,
          bottom: 286,
          width: 152,
          height: 56,
          toJSON: () => ({})
        } as DOMRect;
      }

      if (this.classList.contains('warpkeep-gateway-button')) {
        return {
          x: 686,
          y: 213,
          left: 686,
          top: 213,
          right: 826,
          bottom: 303,
          width: 140,
          height: 90,
          toJSON: () => ({})
        } as DOMRect;
      }

      if (
        this.classList.contains('warpkeep-title-screen')
        || this.classList.contains('warpkeep-gateway')
      ) {
        return {
          x: 80,
          y: 40,
          left: 80,
          top: 40,
          right: 1360,
          bottom: 760,
          width: 1280,
          height: 720,
          toJSON: () => ({})
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({})
      } as DOMRect;
    });

    const { container } = render(
      <WarpkeepTitleScreenFallback onRequestEnterMenu={onRequestEnterMenu} />
    );
    const button = screen.getByRole('button', { name: 'Enter Warpkeep' });
    expect(button.closest('[aria-hidden="true"]')).toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(button);
    expect(container.querySelector('.warpkeep-title-screen')?.getAttribute('data-gateway-surging')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
    expect(onRequestEnterMenu).toHaveBeenCalledTimes(1);
    const activation = onRequestEnterMenu.mock.calls[0]![0];
    expect(activation).toMatchObject({
      input: 'keyboard',
      pointerClientPoint: null,
      rendererPoint: {
        space: 'renderer',
        x: 676,
        y: 218,
        viewportWidth: 1280,
        viewportHeight: 720,
        visible: true
      },
      sourceSurfaceRect: {
        space: 'client-rect',
        left: 80,
        top: 40,
        width: 1280,
        height: 720
      },
      gatewayClientCenter: {
        space: 'client',
        x: 756,
        y: 258
      },
      buttonClientCenter: {
        space: 'client',
        x: 756,
        y: 258
      },
      alignmentErrorPx: 0,
      ready: true
    });
    expect(resolveGatewayActivationOrigin(activation, {
      space: 'client-rect',
      left: 0,
      top: 0,
      width: 1_440,
      height: 900
    })).toEqual({
      space: 'client',
      x: 756,
      y: 258
    });
  });

  it('freezes fallback surface geometry only after the reverse passage is accepted', () => {
    const { container, rerender } = render(
      <WarpkeepTitleScreenFallback phase="preparing-return" />
    );
    const surface = container.querySelector<HTMLElement>('.warpkeep-title-screen')!;
    const galaxy = container.querySelector<HTMLElement>('.warpkeep-fallback-galaxy')!;
    Object.defineProperty(surface, 'clientWidth', {
      configurable: true,
      value: 1280
    });
    Object.defineProperty(surface, 'clientHeight', {
      configurable: true,
      value: 720
    });
    Object.defineProperties(galaxy, {
      offsetLeft: {
        configurable: true,
        value: 640
      },
      offsetTop: {
        configurable: true,
        value: -14
      },
      offsetWidth: {
        configurable: true,
        value: 1126
      },
      offsetHeight: {
        configurable: true,
        value: 619
      }
    });
    expect(surface.style.width).toBe('');
    expect(galaxy.style.width).toBe('');

    rerender(<WarpkeepTitleScreenFallback phase="returning" />);
    expect(surface.style.width).toBe('1280px');
    expect(surface.style.height).toBe('720px');
    expect(surface.style.minWidth).toBe('1280px');
    expect(surface.style.maxHeight).toBe('720px');
    expect(galaxy.style.left).toBe('640px');
    expect(galaxy.style.top).toBe('-14px');
    expect(galaxy.style.width).toBe('1126px');
    expect(galaxy.style.height).toBe('619px');
    expect(galaxy.style.aspectRatio).toBe('auto');

    rerender(<WarpkeepTitleScreenFallback phase="active" />);
    expect(surface.getAttribute('style')).toBeNull();
    expect(galaxy.getAttribute('style')).toBeNull();
  });
});
