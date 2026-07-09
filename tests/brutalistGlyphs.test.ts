import { describe, expect, it } from 'vitest';
import {
  brutalistGlyphCharacters,
  getBrutalistGlyph,
  getBrutalistPairGap,
  layoutBrutalistGlyphs,
  type BrutalistGlyphPoint
} from '../src/components/title/brutalistGlyphs';

function signedArea(points: ReadonlyArray<BrutalistGlyphPoint>) {
  return points.reduce((area, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return area + x * nextY - nextX * y;
  }, 0) * 0.5;
}

function orientation(
  [ax, ay]: BrutalistGlyphPoint,
  [bx, by]: BrutalistGlyphPoint,
  [cx, cy]: BrutalistGlyphPoint
) {
  const crossProduct = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return Math.abs(crossProduct) < 1e-10 ? 0 : Math.sign(crossProduct);
}

function pointOnSegment(
  [ax, ay]: BrutalistGlyphPoint,
  [bx, by]: BrutalistGlyphPoint,
  [px, py]: BrutalistGlyphPoint
) {
  return px >= Math.min(ax, bx) - 1e-10 && px <= Math.max(ax, bx) + 1e-10 &&
    py >= Math.min(ay, by) - 1e-10 && py <= Math.max(ay, by) + 1e-10;
}

function segmentsIntersect(
  a: BrutalistGlyphPoint,
  b: BrutalistGlyphPoint,
  c: BrutalistGlyphPoint,
  d: BrutalistGlyphPoint
) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (abC === 0 && pointOnSegment(a, b, c)) ||
    (abD === 0 && pointOnSegment(a, b, d)) ||
    (cdA === 0 && pointOnSegment(c, d, a)) ||
    (cdB === 0 && pointOnSegment(c, d, b));
}

function expectSimpleLoop(points: ReadonlyArray<BrutalistGlyphPoint>) {
  expect(points.length).toBeGreaterThanOrEqual(3);
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent = first === second || firstNext === second || secondNext === first;
      if (!adjacent) {
        expect(
          segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext]),
          `segments ${first} and ${second} should not intersect`
        ).toBe(false);
      }
    }
  }
}

function pointInsideLoop([x, y]: BrutalistGlyphPoint, points: ReadonlyArray<BrutalistGlyphPoint>) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[previous];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

describe('Warpkeep continuous architectural glyph system', () => {
  it('defines exactly the six custom glyphs used by WARPKEEP', () => {
    expect([...brutalistGlyphCharacters].sort()).toEqual(['A', 'E', 'K', 'P', 'R', 'W']);
    expect(Array.from('WARPKEEP').map((character) => getBrutalistGlyph(character))).toHaveLength(8);
    expect(() => getBrutalistGlyph('S')).toThrow(/Unsupported monumental title glyph/);
  });

  it('uses one simple clockwise exterior per glyph with no modular parts or tiers', () => {
    brutalistGlyphCharacters.forEach((character) => {
      const glyph = getBrutalistGlyph(character);
      expect('parts' in glyph).toBe(false);
      expectSimpleLoop(glyph.outer);
      expect(signedArea(glyph.outer)).toBeLessThan(0);

      const xs = glyph.outer.map(([x]) => x);
      const ys = glyph.outer.map(([, y]) => y);
      expect(Math.min(...xs)).toBe(0);
      expect(Math.max(...xs)).toBe(glyph.width);
      expect(Math.min(...ys)).toBe(0);
      expect(Math.max(...ys)).toBe(1);
    });
  });

  it('uses clean counter-clockwise counters contained by their glyph exterior', () => {
    const expectedHoleCounts = { W: 0, A: 1, R: 1, P: 1, K: 0, E: 0 } as const;
    brutalistGlyphCharacters.forEach((character) => {
      const glyph = getBrutalistGlyph(character);
      expect(glyph.holes).toHaveLength(expectedHoleCounts[character]);
      glyph.holes.forEach((hole) => {
        expectSimpleLoop(hole);
        expect(signedArea(hole)).toBeGreaterThan(0);
        hole.forEach((point) => expect(pointInsideLoop(point, glyph.outer)).toBe(true));
        for (let outerIndex = 0; outerIndex < glyph.outer.length; outerIndex += 1) {
          for (let holeIndex = 0; holeIndex < hole.length; holeIndex += 1) {
            expect(segmentsIntersect(
              glyph.outer[outerIndex],
              glyph.outer[(outerIndex + 1) % glyph.outer.length],
              hole[holeIndex],
              hole[(holeIndex + 1) % hole.length]
            )).toBe(false);
          }
        }
      });
    });
  });

  it('keeps every coordinate finite and inside the declared cap-height bounds', () => {
    brutalistGlyphCharacters.forEach((character) => {
      const glyph = getBrutalistGlyph(character);
      [...glyph.outer, ...glyph.holes.flat()].forEach(([x, y]) => {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(glyph.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      });
    });
  });

  it('applies the validated optical spacing schedule', () => {
    expect(getBrutalistPairGap('W', 'A')).toBe(0.025);
    expect(getBrutalistPairGap('A', 'R')).toBe(0.039);
    expect(getBrutalistPairGap('R', 'P')).toBe(0.035);
    expect(getBrutalistPairGap('P', 'K')).toBe(0.045);
    expect(getBrutalistPairGap('K', 'E')).toBe(0.035);
    expect(getBrutalistPairGap('E', 'E')).toBe(0.031);
    expect(getBrutalistPairGap('E', 'P')).toBe(0.039);
    expect(getBrutalistPairGap('W', 'W')).toBe(0.035);
    expect(() => getBrutalistPairGap('W', 'S')).toThrow(/Unsupported monumental title glyph/);
  });

  it('lays out the wordmark monotonically and scales every metric together', () => {
    const layout = layoutBrutalistGlyphs('WARPKEEP');
    expect(layout.placements.map(({ character }) => character).join('')).toBe('WARPKEEP');
    expect(layout.width).toBeCloseTo(6.999, 10);
    layout.placements.slice(1).forEach((placement, index) => {
      const previous = layout.placements[index];
      expect(placement.x).toBeCloseTo(
        previous.x + previous.glyph.width + getBrutalistPairGap(previous.character, placement.character),
        10
      );
    });

    const doubled = layoutBrutalistGlyphs('WARPKEEP', 2);
    expect(doubled.width).toBeCloseTo(layout.width * 2, 10);
    doubled.placements.forEach((placement, index) => {
      expect(placement.x).toBeCloseTo(layout.placements[index].x * 2, 10);
    });
    expect(layoutBrutalistGlyphs('').width).toBe(0);
    expect(() => layoutBrutalistGlyphs('W', 0)).toThrow(/finite positive/);
    expect(() => layoutBrutalistGlyphs('W', Number.NaN)).toThrow(/finite positive/);
  });
});
