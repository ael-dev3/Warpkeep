export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_16_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '24 JUL 2026',
  title: 'THE HARVEST REMEMBERED',
  summary:
    'Gathering in Genesis 001 now lives in one clear record, and the Realm remembers completed yield without asking its keepers to claim it by hand.',
  highlights: Object.freeze([
    'An occupied Mine, Farm, Camp, or Quarry now keeps the site, keeper, journey phase, time left, and public identity together in one record.',
    'A gathering portrait remains a deliberate path to the keeper’s castle, while an owner’s worker recall stays inside that same record.',
    'Completed yield settles into the Realm automatically during an authenticated session, with server-owned recall and expiry schedules closing journeys while a player is away.',
    'The old Claim Resource and Collect Yield controls are gone; resource totals remain private and server-authoritative.'
  ]),
  alphaNotice:
    'Alpha 0.3.16 is an unfinished, evolving world. The prepared four-worker system remains staged behind inactive rollout gates and is not live yet; community feedback helps shape what is built next.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.16': ALPHA_0_3_16_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
