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

const ALPHA_0_3_20_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '27 JUL 2026',
  title: 'THE CRAFTED LOWLANDS',
  summary:
    'Genesis 001 now holds together more calmly through worker journeys, with a richer Lowlands landscape and clearer ways to read the living Realm.',
  highlights: Object.freeze([
    'Worker journeys, wagons, routes, portraits, and controls remain present across reloads and reconnects while private commands synchronize safely in place.',
    'Natural terrain, clustered grass, shaped forests, continuous rivers, and grounded keeps and resource sites make the Lowlands feel like one crafted landscape.',
    'More physical travel, coherent identity markers, refined records, camera hierarchy, and responsive composition keep the world readable across desktop and mobile.'
  ]),
  alphaNotice:
    'Alpha 0.3.20 remains an unfinished, evolving world. Worker authority, ownership, private balances, gathering rates, settlement, and the deployed database contract remain unchanged.'
});

const ALPHA_0_3_21_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '27 JUL 2026',
  title: 'THE REALM ANSWERS',
  summary:
    'Keeper commands, balances, and passage through the gateway now recover in place without asking the living Realm to disappear around them.',
  highlights: Object.freeze([
    'Four deployed Workers remain present across reloads and reconnects while one coherent private control record restores their current accrual and command context.',
    'Food, Wood, Stone, and Gold stay readable during synchronization, and authenticated recall can still call one Worker or every Worker home under server authority.',
    'The title passage now opens from the exact gateway activation point, while the in-Realm command menu is shorter and focused on actions that matter in the world.'
  ]),
  alphaNotice:
    'Alpha 0.3.21 remains an unfinished, evolving world. Worker ownership, private accounting, settlement, node release, and recall remain server-authoritative; the additive control read does not change balances or gameplay authority.'
});

const ALPHA_0_3_22_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '28 JUL 2026',
  title: 'THE GATE HOLDS',
  summary:
    'The violet gateway now holds beneath the keeper’s hand, while resting wagons wait unseen inside their keeps until the road calls.',
  highlights: Object.freeze([
    'The title gateway and its violet passage remain centered on the activation point throughout the visible transition instead of drifting beneath it.',
    'Idle Supply Wagons now rest inside their keeps rather than gathering outside on the Realm map; outbound, gathering, and returning journeys remain visible.',
    'All four Workers remain available through keep controls, with dispatch, recall, routes, resources, and Realm authority unchanged.'
  ]),
  alphaNotice:
    'Alpha 0.3.22 remains an unfinished, evolving world. This presentation pass does not change Worker ownership, private accounting, settlement, node release, recall, or the deployed database contract.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.22': ALPHA_0_3_22_PATCH_NOTES,
    '0.3.21': ALPHA_0_3_21_PATCH_NOTES,
    '0.3.20': ALPHA_0_3_20_PATCH_NOTES,
    '0.3.19': ALPHA_0_3_19_PATCH_NOTES,
    '0.3.18': ALPHA_0_3_18_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
