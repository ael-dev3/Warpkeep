export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_13_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '19 JUL 2026',
  title: 'THE LIVING LOWLANDS',
  summary:
    'Genesis 001 breathes more naturally as rivers, forests, grasslands, and the ocean settle into a clearer frontier.',
  highlights: Object.freeze([
    'The old scattered lakes have receded into lowland, leaving twelve persistent one-cell rivers and the ocean around Genesis 001.',
    'You can pan through the coast and open water until the full fog boundary, including from the strategic overview.',
    'Grass now follows broad biome patterns and forests gather into natural groves while rivers, roads, keeps, and resource sites stay clear.',
    'Moving supply wagons can be selected, and the Realm menu now keeps every active expedition within reach.'
  ]),
  alphaNotice:
    'Alpha 0.3.13 is an unfinished, evolving world. Community feedback helps shape what is built next.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.13': ALPHA_0_3_13_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
