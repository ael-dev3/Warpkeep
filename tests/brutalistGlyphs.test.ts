import { describe, expect, it } from 'vitest';
import {
  brutalistGlyphCharacters,
  getBrutalistGlyph
} from '../src/components/title/brutalistGlyphs';

describe('Warpkeep custom monumental glyph system', () => {
  it('builds the title without depending on a rounded font asset', () => {
    const title = 'WARPKEEP';

    for (const character of title) {
      const glyph = getBrutalistGlyph(character);
      expect(glyph.parts.length).toBeGreaterThanOrEqual(4);
      expect(glyph.width).toBeGreaterThan(0.7);
      expect(glyph.width).toBeLessThanOrEqual(1.1);
    }
  });

  it('uses stepped architectural tiers and sharp polygonal masses', () => {
    brutalistGlyphCharacters.forEach((character) => {
      const glyph = getBrutalistGlyph(character);
      const tiers = new Set(glyph.parts.map((glyphPart) => glyphPart.tier));

      expect(tiers.size).toBeGreaterThanOrEqual(2);
      glyph.parts.forEach((glyphPart) => {
        expect(glyphPart.points.length).toBeGreaterThanOrEqual(4);
        glyphPart.points.forEach(([x, y]) => {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        });
      });
    });
  });

  it('separates intersecting buttresses onto different depth tiers', () => {
    const a = getBrutalistGlyph('A');
    const k = getBrutalistGlyph('K');

    expect(a.parts[1].tier).not.toBe(a.parts[3].tier);
    expect(k.parts[1].tier).not.toBe(k.parts[3].tier);
  });

  it('rejects unsupported lettering instead of silently falling back to a font', () => {
    expect(() => getBrutalistGlyph('S')).toThrow(/Unsupported monumental title glyph/);
  });
});
