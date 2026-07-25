export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_18_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '24 JUL 2026',
  title: 'THE KEEP MUSTERS',
  summary:
    'Genesis 001 is preparing four permanent workers for every founded keep, with flexible gathering, automatic settlement, and clear return commands.',
  highlights: Object.freeze([
    'Each founded keep receives exactly four durable workers that can gather Gold, Food, Wood, or Stone at distinct open sites.',
    'Worker production settles into private authoritative balances automatically; keepers can recall one worker or call every worker home.',
    'The legacy wagon transition preserves earned resources and releases every matching expedition, occupation, and schedule before the new system can awaken.'
  ]),
  alphaNotice:
    'Alpha 0.3.18 is an unfinished, evolving world. Four-worker play is live only after the production module is published, every legacy row is safely drained, generic mode is active, and the matching client is deployed; until then the existing expedition flow remains authoritative.'
});

const ALPHA_0_3_19_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '25 JUL 2026',
  title: 'THE ROAD REMEMBERS',
  summary:
    'Workers now begin their journeys from the Genesis 001 Realm map itself, following visible Lowlands roads between keep and resource site.',
  highlights: Object.freeze([
    'Select an open Gold Mine, Wheat Farm, Logging Camp, or Stone Quarry and send one of your four ready workers directly from that site record.',
    'Supply Wagons, keeper portraits, and bounded dashed routes follow a deterministic dry Lowlands journey instead of jumping to an endpoint or disappearing at a river.',
    'Recall sends workers physically home from their current progress, while reconnecting and reduced-motion play preserve their true place on the road.'
  ]),
  alphaNotice:
    'Alpha 0.3.19 remains an unfinished, evolving world. Worker ownership, node leases, timers, settlement, and recall stay server-authoritative; wagon routes are a deterministic dry-land presentation of those journeys.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.19': ALPHA_0_3_19_PATCH_NOTES,
    '0.3.18': ALPHA_0_3_18_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
