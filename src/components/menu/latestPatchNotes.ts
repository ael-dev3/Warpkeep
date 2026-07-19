export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_12_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '19 JUL 2026',
  title: 'RIVERS OF GENESIS',
  summary:
    'Water has found its way through Genesis 001, and Stone Quarries now call a fourth supply wagon into the living frontier.',
  highlights: Object.freeze([
    'A persistent ocean, lakes, and rivers now shape the Lowlands around its unchanged castles and roads.',
    'Stone Quarries join Gold Mines, Wheat Farms, and Logging Camps. Each resource has its own private, server-governed wagon expedition.',
    'Grass reaches farther across the Realm, while touch, viewport, and Safari refinements make the map calmer on smaller screens.',
    'The Hegemony Social Contract is shorter and clearer. The core strategy loop is still unfinished, and Alpha participation carries no promise of rewards or financial return.'
  ]),
  alphaNotice:
    'Alpha 0.3.12 is an unfinished, evolving world. Community feedback helps shape what is built next.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.12': ALPHA_0_3_12_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
