export type BrutalistGlyphPart = {
  points: ReadonlyArray<readonly [number, number]>;
  tier: number;
};

export type BrutalistGlyphDefinition = {
  width: number;
  parts: ReadonlyArray<BrutalistGlyphPart>;
};

const part = (tier: number, points: BrutalistGlyphPart['points']): BrutalistGlyphPart => ({
  tier,
  points
});

const glyphs = {
  W: {
    width: 1.08,
    parts: [
      part(1, [[0, 1], [0.2, 1], [0.38, 0], [0.17, 0]]),
      part(0, [[0.17, 0], [0.38, 0], [0.52, 0.69], [0.38, 0.82]]),
      part(2, [[0.48, 0.69], [0.62, 0.82], [0.82, 0], [0.62, 0]]),
      part(1, [[0.62, 0], [0.82, 0], [1, 1], [0.8, 1]])
    ]
  },
  A: {
    width: 0.86,
    parts: [
      part(0, [[0, 0], [0.25, 0], [0.49, 1], [0.28, 1]]),
      part(1, [[0.75, 0], [1, 0], [0.72, 1], [0.51, 1]]),
      part(2, [[0.18, 0.35], [0.82, 0.35], [0.76, 0.57], [0.24, 0.57]]),
      part(2, [[0.28, 0.82], [0.72, 0.82], [0.72, 1], [0.28, 1]])
    ]
  },
  R: {
    width: 0.88,
    parts: [
      part(0, [[0, 0], [0.25, 0], [0.25, 1], [0, 1]]),
      part(2, [[0.18, 0.78], [0.76, 0.78], [0.76, 1], [0.18, 1]]),
      part(1, [[0.2, 0.45], [0.72, 0.45], [0.72, 0.65], [0.2, 0.65]]),
      part(0, [[0.68, 0.51], [0.91, 0.61], [0.91, 0.86], [0.68, 0.96]]),
      part(2, [[0.43, 0.52], [0.66, 0.52], [1, 0], [0.7, 0]])
    ]
  },
  P: {
    width: 0.8,
    parts: [
      part(0, [[0, 0], [0.26, 0], [0.26, 1], [0, 1]]),
      part(2, [[0.18, 0.78], [0.76, 0.78], [0.76, 1], [0.18, 1]]),
      part(1, [[0.2, 0.45], [0.72, 0.45], [0.72, 0.66], [0.2, 0.66]]),
      part(0, [[0.67, 0.51], [0.94, 0.58], [0.94, 0.88], [0.67, 0.96]])
    ]
  },
  K: {
    width: 0.85,
    parts: [
      part(0, [[0, 0], [0.26, 0], [0.26, 1], [0, 1]]),
      part(2, [[0.19, 0.43], [0.43, 0.43], [1, 1], [0.7, 1]]),
      part(1, [[0.2, 0.57], [0.45, 0.57], [1, 0], [0.7, 0]]),
      part(3, [[0.18, 0.41], [0.48, 0.41], [0.48, 0.59], [0.18, 0.59]])
    ]
  },
  E: {
    width: 0.74,
    parts: [
      part(0, [[0, 0], [0.27, 0], [0.27, 1], [0, 1]]),
      part(2, [[0.19, 0.78], [1, 0.78], [1, 1], [0.19, 1]]),
      part(1, [[0.19, 0.4], [0.82, 0.4], [0.82, 0.6], [0.19, 0.6]]),
      part(2, [[0.19, 0], [1, 0], [1, 0.22], [0.19, 0.22]])
    ]
  }
} as const satisfies Record<string, BrutalistGlyphDefinition>;

export type BrutalistGlyphCharacter = keyof typeof glyphs;

export const brutalistGlyphCharacters = Object.freeze(Object.keys(glyphs) as BrutalistGlyphCharacter[]);

export function getBrutalistGlyph(character: string): BrutalistGlyphDefinition {
  const glyph = glyphs[character as BrutalistGlyphCharacter];
  if (!glyph) {
    throw new Error(`Unsupported monumental title glyph: ${character}`);
  }
  return glyph;
}
