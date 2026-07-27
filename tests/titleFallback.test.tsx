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
      projection: {
        x: 676,
        y: 218,
        viewportWidth: 1280,
        viewportHeight: 720,
        visible: true
      },
      projectionSourceRect: {
        left: 80,
        top: 40,
        width: 1280,
        height: 720
      }
    });
    expect(resolveGatewayActivationOrigin(activation, {
      left: 0,
      top: 0,
      width: 1_440,
      height: 900
    })).toEqual({
      x: 756,
      y: 258
    });
  });
});
