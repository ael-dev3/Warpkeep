export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_17_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '24 JUL 2026',
  title: 'THE GATE REMEMBERS',
  summary:
    'Once a keeper has accepted the current entry agreement and opened Genesis 001, the same authorized session can pass through the gate again without another checkbox.',
  highlights: Object.freeze([
    'Returning from the Realm to the main menu no longer asks the same authorized keeper to accept the same agreement again.',
    'Fresh, expired, signed-out, changed-identity, and otherwise unproven sessions still stop at an unchecked agreement before authentication or entry.',
    'Agreement reuse stays private and memory-only; no acceptance flag is persisted in browser storage and the server remains the authority.'
  ]),
  alphaNotice:
    'Alpha 0.3.17 is an unfinished, evolving world. The prepared four-worker system remains staged behind inactive rollout gates and is not live yet; community feedback helps shape what is built next.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.17': ALPHA_0_3_17_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
