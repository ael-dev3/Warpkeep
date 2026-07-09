import { cleanup, render } from '@testing-library/react';
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
});
