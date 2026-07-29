export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_26_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '29 JUL 2026',
  title: 'THE NORTHERN REACH',
  summary:
    'Beyond the founding heartland, winter now gathers across the northern outer Lowlands and deepens toward the rim.',
  highlights: Object.freeze([
    'A broad, irregular frost transition preserves the familiar central Lowlands before giving way to deeper northern snow.',
    'Grass becomes shorter and sparser through the snowline, while woodland carries a restrained dusting on exposed upper growth.',
    'The winter frontier is presentation only: terrain topology, movement, Water, Workers, resources, routes, and world authority remain unchanged.'
  ]),
  alphaNotice:
    'Alpha 0.3.26 remains an unfinished, evolving world. The Northern Reach is a static visual climate treatment, not a new terrain rule, season, weather system, or gameplay modifier.'
});

const ALPHA_0_3_25_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '29 JUL 2026',
  title: 'THE LIVING REALM',
  summary:
    'The Realm now answers ordinary actions with restrained sound, while full-cell rivers carry a clearer path from their sources to the sea.',
  highlights: Object.freeze([
    'Interface, keep, resource, Water, and confirmed Worker actions receive a small procedural sound vocabulary that respects trusted browser gestures and the existing mute setting.',
    'Every canonical river now fills its Water hex, with adjacent banks, directional flow, and a distinct shallow-river character from the surrounding ocean.',
    'River records can be followed one cell at a time upstream or downstream, with explicit source, mouth, and camera-focus actions.'
  ]),
  alphaNotice:
    'Alpha 0.3.25 remains an unfinished, evolving world. This presentation release does not change Worker routes, timings, ownership, resources, balances, or persistent world authority.'
});

const ALPHA_0_3_24_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '29 JUL 2026',
  title: 'WAGONS TAKE THE ROAD',
  summary:
    'This build gives Supply Wagons a continuous, speed-matched locomotion cycle while every journey remains anchored to authoritative Realm time and route truth.',
  highlights: Object.freeze([
    'Visible journeys advance at a smooth demand-driven cadence; a completed Start, Stop, or turn gesture can no longer leave a moving wagon frozen on the road.',
    'Horse gait and distance-driven wheel rotation follow actual route speed, with continuous heading and terrain contact through corners and recall.',
    'Reconnects, late model loads, and LOD changes restore the current movement phase, while reduced motion keeps positional truth without permanent full-scene rendering.'
  ]),
  alphaNotice:
    'Alpha 0.3.24 remains an unfinished, evolving world. This frontend presentation release does not change authentication, Worker authority, routes, assignments, timings, node leases, settlement, balances, terrain topology, or persistent world state.'
});

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

const ALPHA_0_3_23_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '28 JUL 2026',
  title: 'THE GATE ALIGNS',
  summary:
    'The violet passage now opens from the visible black-hole gateway itself, keeping every crossing centered even when browser and overlay scales differ.',
  highlights: Object.freeze([
    'The first visible transition frame now begins at the rendered gateway center instead of a displaced browser, overlay, or click coordinate.',
    'Pointer, touch, keyboard, and returning passages share the same measured gateway origin across repeated crossings, normalized for transformed display spaces.',
    'The gateway stays closed whenever its visible center, interaction target, and focus position do not agree.'
  ]),
  alphaNotice:
    'Alpha 0.3.23 remains an unfinished, evolving world. This title-passage correction does not change authentication, Worker authority, resources, Realm rendering, or persistent world state.'
});

const ALPHA_0_3_22_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '28 JUL 2026',
  title: 'THE WAGONS REST',
  summary:
    'Resting wagons now wait unseen inside their keeps until the road calls, while an early gateway-alignment pass prepared a fuller correction.',
  highlights: Object.freeze([
    'An initial title-transition alignment pass shipped, but later production evidence confirmed that the visible gateway and violet passage could still disagree.',
    'Idle Supply Wagons now rest inside their keeps rather than gathering outside on the Realm map; outbound, gathering, and returning journeys remain visible.',
    'All four Workers remain available through keep controls, with dispatch, recall, routes, resources, and Realm authority unchanged.'
  ]),
  alphaNotice:
    'Alpha 0.3.22 remains an unfinished, evolving world. This presentation pass does not change Worker ownership, private accounting, settlement, node release, recall, or the deployed database contract.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.26': ALPHA_0_3_26_PATCH_NOTES,
    '0.3.25': ALPHA_0_3_25_PATCH_NOTES,
    '0.3.24': ALPHA_0_3_24_PATCH_NOTES,
    '0.3.23': ALPHA_0_3_23_PATCH_NOTES,
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
