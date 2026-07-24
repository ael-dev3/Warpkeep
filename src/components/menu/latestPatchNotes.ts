export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_15_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '24 JUL 2026',
  title: 'FOUR HANDS OF THE KEEP',
  summary:
    'Every founded keep in Genesis 001 now commands four persistent workers, with clearer control from the Realm map and your player menu.',
  highlights: Object.freeze([
    'Send any of your four server-governed workers to Gold Mines, Wheat Farms, Logging Camps, or Stone Quarries; each resource node accepts one worker.',
    'Your PFP menu now shows how many workers are deployed and can recall every recallable worker to the keep in one guarded command.',
    'Your occupied resource records now offer Recall Worker to Keep, while other players’ worker records remain public and read-only.',
    'Select a keeper portrait inside a worker record to find their home castle without changing your current zoom.'
  ]),
  alphaNotice:
    'Alpha 0.3.15 is an unfinished, evolving world. Workers can gather resources, but the wider construction and strategy loop is not playable yet; Alpha participation offers no promised reward or financial return.'
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
