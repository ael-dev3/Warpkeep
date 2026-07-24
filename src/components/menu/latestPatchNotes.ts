export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_15_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '24 JUL 2026',
  title: 'THE LIVING FRONTIER',
  summary:
    'Genesis 001 feels more alive and easier to read, from its restored keeps and denser forests to the gathering stories unfolding across the Lowlands.',
  highlights: Object.freeze([
    'Authored keep and title textures are restored, with a softer ocean-to-fog horizon and denser biome-shaped forests.',
    'Occupied resource sites now carry safe public Farcaster portraits, including static previews for animated or decentralized profile images.',
    'Selecting a keep, water cell, worker, or resource record no longer pulls the camera away; ordinary zoom-out is also tighter and more readable.',
    'Gathering records now show the authoritative arrival, gathering, or return time left instead of a generic deployment duration.'
  ]),
  alphaNotice:
    'Alpha 0.3.15 is an unfinished, evolving world. The four-worker system and recall controls remain staged behind inactive rollout gates and are not live yet; community feedback helps shape what is built next.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.15': ALPHA_0_3_15_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
