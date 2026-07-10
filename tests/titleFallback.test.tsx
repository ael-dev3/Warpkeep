import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WarpkeepTitleScreenFallback } from '../src/components/title/WarpkeepTitleScreenFallback';

describe('Warpkeep continuous-outline fallback', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the same eight unified glyph outlines without modular polygons or generic text', () => {
    const { container } = render(<WarpkeepTitleScreenFallback />);
    const wordmark = container.querySelector('.warpkeep-fallback-wordmark');
    expect(wordmark).not.toBeNull();
    expect(wordmark!.querySelectorAll('polygon')).toHaveLength(0);
    expect(wordmark!.querySelectorAll('text')).toHaveLength(0);

    const faces = wordmark!.querySelectorAll('path[fill="url(#warpkeepConcreteFace)"]');
    const sides = wordmark!.querySelectorAll('.warpkeep-fallback-wordmark-depth path');
    expect(faces).toHaveLength(8);
    expect(sides).toHaveLength(16);

    faces.forEach((face, index) => {
      expect(face.getAttribute('fill-rule')).toBe('evenodd');
      expect(face.getAttribute('d')).toBe(sides[index].getAttribute('d'));
      expect(face.getAttribute('d')).toBe(sides[index + 8].getAttribute('d'));
    });
  });

  it('uses whole-word lighting coordinates and preserves the three carved counters', () => {
    const { container } = render(<WarpkeepTitleScreenFallback />);
    const gradient = container.querySelector('#warpkeepConcreteFace');
    const grain = container.querySelector('#warpkeepConcreteGrain');
    const faces = container.querySelectorAll('path[fill="url(#warpkeepConcreteFace)"]');
    expect(gradient?.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    expect(grain?.getAttribute('filterUnits')).toBe('userSpaceOnUse');
    faces.forEach((face) => expect(face.hasAttribute('transform')).toBe(false));

    const subpathCounts = Array.from(faces, (face) => face.getAttribute('d')!.match(/\bM\b/g)?.length ?? 0);
    expect(subpathCounts).toEqual([1, 2, 2, 2, 1, 1, 1, 2]);

    const firstMoveXs = Array.from(faces, (face) =>
      Number(face.getAttribute('d')!.match(/^M ([\d.]+)/)?.[1])
    );
    firstMoveXs.slice(1).forEach((x, index) => expect(x).toBeGreaterThan(firstMoveXs[index]));
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
          x: 600,
          y: 190,
          left: 600,
          top: 190,
          right: 752,
          bottom: 246,
          width: 152,
          height: 56,
          toJSON: () => ({})
        } as DOMRect;
      }

      if (this.classList.contains('warpkeep-title-screen')) {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 1280,
          bottom: 720,
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
    expect(onRequestEnterMenu.mock.calls[0][0]).toMatchObject({
      x: 676,
      y: 218,
      viewportWidth: 1280,
      viewportHeight: 720,
      visible: true
    });
  });
});
