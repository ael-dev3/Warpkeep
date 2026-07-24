export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_14_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '22 JUL 2026',
  title: 'A STEADIER FRONTIER',
  summary:
    'Genesis 001 is steadier and easier to read, with resilient Realm rendering, selectable moving water, and a greener Lowlands.',
  highlights: Object.freeze([
    'The Realm now recovers from temporary graphics interruptions while preserving your selection and camera intent.',
    'Castle rendering can continue at compact detail when optional richer models cannot load.',
    'Water surfaces now move gently when motion is enabled, and visible river and ocean cells can be selected for read-only public records.',
    'The Lowlands now use a clearer green palette and denser grass coverage without changing authoritative terrain, ownership, or resource rules.'
  ]),
  alphaNotice:
    'Alpha 0.3.14 is an unfinished, evolving world. Four-worker gathering is staged for later and is not live yet; community feedback helps shape what is built next.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.14': ALPHA_0_3_14_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
