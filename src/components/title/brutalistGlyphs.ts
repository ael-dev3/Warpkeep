export type BrutalistGlyphPoint = readonly [x: number, y: number];

export type BrutalistGlyphDefinition = {
  /** Horizontal extent in cap-height units. */
  readonly width: number;
  /** Clockwise exterior silhouette in cap-height units. */
  readonly outer: ReadonlyArray<BrutalistGlyphPoint>;
  /** Counter-clockwise counters carved from the exterior silhouette. */
  readonly holes: ReadonlyArray<ReadonlyArray<BrutalistGlyphPoint>>;
};

export type BrutalistGlyphPlacement = {
  readonly character: BrutalistGlyphCharacter;
  readonly glyph: BrutalistGlyphDefinition;
  readonly x: number;
  readonly index: number;
};

export type BrutalistGlyphLayout = {
  readonly placements: ReadonlyArray<BrutalistGlyphPlacement>;
  readonly width: number;
};

/**
 * A deliberately small architectural alphabet for the WARPKEEP wordmark.
 *
 * Coordinates are expressed directly in cap-height units rather than as a
 * percentage of each glyph's width. Each glyph therefore shares the same
 * structural stroke measurements while retaining its own optical width.
 * Every exterior is a single clockwise loop; A, R, and P each contain one
 * counter-clockwise counter.
 */
const glyphs = {
  W: {
    width: 1.08,
    outer: [
      [0, 1], [0.23, 1], [0.35, 0.32], [0.38, 0.66], [0.43, 0.74],
      [0.65, 0.74], [0.7, 0.66], [0.73, 0.32], [0.85, 1], [1.08, 1],
      [0.85, 0], [0.64, 0], [0.54, 0.19], [0.44, 0], [0.23, 0]
    ],
    holes: []
  },
  A: {
    width: 0.86,
    outer: [
      [0, 0], [0.29, 1], [0.57, 1], [0.86, 0],
      [0.65, 0], [0.57, 0.35], [0.29, 0.35], [0.21, 0]
    ],
    holes: [[
      [0.335, 0.52], [0.525, 0.52], [0.485, 0.78], [0.375, 0.78]
    ]]
  },
  R: {
    width: 0.88,
    outer: [
      [0, 1], [0.67, 1], [0.79, 0.87], [0.79, 0.68], [0.74, 0.56],
      [0.58, 0.47], [0.88, 0], [0.69, 0], [0.41, 0.39], [0.22, 0.39],
      [0.22, 0], [0, 0]
    ],
    holes: [[
      [0.22, 0.6], [0.5, 0.6], [0.59, 0.66],
      [0.59, 0.77], [0.51, 0.82], [0.22, 0.82]
    ]]
  },
  P: {
    width: 0.8,
    outer: [
      [0, 1], [0.68, 1], [0.8, 0.87], [0.8, 0.57],
      [0.62, 0.43], [0.22, 0.43], [0.22, 0], [0, 0]
    ],
    holes: [[
      [0.22, 0.6], [0.51, 0.6], [0.6, 0.66],
      [0.6, 0.77], [0.52, 0.82], [0.22, 0.82]
    ]]
  },
  K: {
    width: 0.85,
    outer: [
      [0, 1], [0.23, 1], [0.23, 0.68], [0.55, 1], [0.85, 1],
      [0.55, 0.6], [0.59, 0.54], [0.59, 0.46], [0.55, 0.4],
      [0.85, 0], [0.55, 0], [0.23, 0.32], [0.23, 0], [0, 0]
    ],
    holes: []
  },
  E: {
    width: 0.74,
    outer: [
      [0, 1], [0.74, 1], [0.74, 0.8], [0.22, 0.8],
      [0.22, 0.59], [0.59, 0.59], [0.59, 0.41], [0.22, 0.41],
      [0.22, 0.2], [0.74, 0.2], [0.74, 0], [0, 0]
    ],
    holes: []
  }
} as const satisfies Record<string, BrutalistGlyphDefinition>;

export type BrutalistGlyphCharacter = keyof typeof glyphs;

export const brutalistGlyphCharacters = Object.freeze(
  Object.keys(glyphs) as BrutalistGlyphCharacter[]
);

const defaultPairGap = 0.035;

/** Optical gaps in cap-height units for the only pairs used by WARPKEEP. */
const pairGaps: Readonly<Record<string, number>> = Object.freeze({
  WA: 0.025,
  AR: 0.039,
  RP: 0.035,
  PK: 0.045,
  KE: 0.035,
  EE: 0.031,
  EP: 0.039
});

export function getBrutalistGlyph(character: string): BrutalistGlyphDefinition {
  const glyph = glyphs[character as BrutalistGlyphCharacter];
  if (!glyph) {
    throw new Error(`Unsupported monumental title glyph: ${character}`);
  }
  return glyph;
}

export function getBrutalistPairGap(left: string, right: string): number {
  getBrutalistGlyph(left);
  getBrutalistGlyph(right);
  return pairGaps[`${left}${right}`] ?? defaultPairGap;
}

export function layoutBrutalistGlyphs(text: string, scale = 1): BrutalistGlyphLayout {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('Brutalist glyph layout scale must be a finite positive number.');
  }

  const characters = Array.from(text);
  const placements: BrutalistGlyphPlacement[] = [];
  let cursor = 0;

  characters.forEach((character, index) => {
    const glyph = getBrutalistGlyph(character);
    placements.push({
      character: character as BrutalistGlyphCharacter,
      glyph,
      x: cursor,
      index
    });
    cursor += glyph.width * scale;

    const nextCharacter = characters[index + 1];
    if (nextCharacter !== undefined) {
      cursor += getBrutalistPairGap(character, nextCharacter) * scale;
    }
  });

  return { placements, width: cursor };
}
