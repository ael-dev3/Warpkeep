export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_4_0_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '27 AUG 2026',
  title: 'THE SECOND GENESIS WAITS',
  summary:
    'Genesis 001 remains the preserved 0.3.43 Realm, while the Genesis 002 world foundation arrives sealed behind the 0.4.0 launcher.',
  highlights: Object.freeze([
    'A new realm chooser shows a green check when the signed-in keeper is admitted, a red X when they are not admitted, and clear tooltips explaining each realm-specific state.',
    'Existing Genesis 001 keepers retain their 0.3.43 Realm access; new admissions and access requests are suspended while the future admission path is rebuilt.',
    'Genesis 002 carries the 0.4.0 world foundation with zero admitted players. Its data remains private, and it cannot be entered, queried by players, or reached through an access request.',
    'A dedicated PTR carries future patch testing behind short-lived owner authority. It has no player admission or access-request path and is not available to other users.'
  ]),
  alphaNotice:
    'Alpha 0.4.0 remains unfinished. New admissions are suspended, Genesis 002 has no admitted users and cannot be entered, PTR is owner-only, and construction, units, combat, alliances, chat, and the larger strategy loop are not live.'
});

const ALPHA_0_3_43_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '2 AUG 2026',
  title: 'THE REALM STANDS READY',
  summary:
    'Genesis 001 now meets uncertain roads with a gentler path, a settled gateway, and one clear account of the living Realm.',
  highlights: Object.freeze([
    'If a mobile graphics session falters, Warpkeep now descends through lighter visual footing before offering Performance mode, privacy-safe diagnostics, a return path, and direct support.',
    'Request Access answers the first accepted gesture quietly, settles into a durable Request Received record, and never retries an uncertain mutation.',
    'The current Mini App presentation now shows the Realm, an available resource order, and all four permanent Workers exactly as they appear in this release.'
  ]),
  alphaNotice:
    'Alpha 0.3.43 remains invite-only and unfinished. Permanent keeps, four Worker journeys, and persistent gathering are live; construction, units, combat, alliances, and the larger strategy loop are still being built. A petition requests manual review only and promises no admission, reward, or financial value.'
});

const ALPHA_0_3_42_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE GATE FALLS QUIET',
  summary:
    'The Hegemony gate now answers a petition through light and motion alone, leaving its archived resonance outside the living client.',
  highlights: Object.freeze([
    'Request Access is now deliberately silent in ordinary browsers and the Farcaster Mini App; its former sample is no longer loaded, preloaded, decoded, or emitted.',
    'The violet-and-gold response and immediate one-shot Request Sent state remain intact, with the same private submission and manual admission boundaries.',
    'The exact retired recording remains preserved in the checksummed Warpkeep Assets archive while production verification rejects its former path and trigger.'
  ]),
  alphaNotice:
    'Alpha 0.3.42 remains an invite-only, unfinished world. This presentation change does not alter authentication, petitions, admission, keeps, Workers, resources, balances, rewards, or persistent Realm records.'
});

const ALPHA_0_3_41_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE REALM MENDS ITSELF',
  summary:
    'When a keeper’s graphics falter, Genesis 001 now seeks a lighter path, explains what happened, and keeps the Realm within reach.',
  highlights: Object.freeze([
    'Warpkeep now descends through lighter session-only graphics tiers and a fresh canvas before preserving a readable 2D safety overview with clear Retry and Return choices.',
    'Android and embedded passages count only visible healthy time, bound repeated first-frame interruptions, and keep an already healthy Realm when an optional visual update stalls.',
    'Every classified graphics failure now carries a clear reference, likely causes, the repair in progress, privacy-safe compatibility details, and a direct path to support.'
  ]),
  alphaNotice:
    'Alpha 0.3.41 remains an invite-only, unfinished world. Renderer recovery changes presentation only; it does not alter authentication, admission, keeps, Workers, resources, balances, rewards, or persistent Realm records.'
});

const ALPHA_0_3_40_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE REALM ENDURES',
  summary:
    'When a keeper’s device falters, Genesis 001 now returns on gentler footing instead of leaving them at an endless threshold.',
  highlights: Object.freeze([
    'A disrupted Realm now rebuilds one visual tier lighter for the current browser session without rewriting the keeper’s chosen graphics setting.',
    'Every restoration has a firm boundary; a scene that cannot return is released safely into clear Retry and Return choices.',
    'Android Chrome and Farcaster’s Android passage now carry the same recovery journey, while authentication, admission, and the living world remain untouched.'
  ]),
  alphaNotice:
    'Alpha 0.3.40 remains an invite-only, unfinished world. This compatibility release changes no admission decision, keep, Worker, resource, balance, reward, or persistent Realm record.'
});

const ALPHA_0_3_39_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE PETITION HOLDS',
  summary:
    'A keeper’s first petition now stays sealed even when the road to the Hegemony records briefly goes dark.',
  highlights: Object.freeze([
    'Request Access becomes Request Sent on the first gesture and stays closed across menu and Mini App presentation changes.',
    'A delayed confirmation can no longer replay the Hegemony resonance, violet-and-gold seal, or private submission.',
    'SpacetimeDB still preserves one private petition per admission cycle while admission itself remains a separate manual decision.'
  ]),
  alphaNotice:
    'Alpha 0.3.39 remains an invite-only, unfinished world. A petition requests review only; it grants no admission, keep, ownership, balance, reward, or financial promise.'
});

const ALPHA_0_3_38_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE WAY BACK',
  summary:
    'The Realm now keeps one clear road back to Warpkeep’s gates, even when Farcaster carries a keeper straight inside.',
  highlights: Object.freeze([
    'Farcaster’s native Back control now remains available at the Realm root for keepers who enter Genesis 001 directly.',
    'Back closes nested Realm records one step at a time, then returns to Warpkeep’s menu without signing the keeper out.',
    'The route adds no new map overlay and leaves authentication, admission, Terms, keeps, Workers, resources, and world state untouched.'
  ]),
  alphaNotice:
    'Alpha 0.3.38 remains an invite-only, unfinished world. This navigation release changes no admission decision, ownership record, balance, or persistent Realm data.'
});

const ALPHA_0_3_37_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE GATE HEEDS ONCE',
  summary:
    'One deliberate petition now carries the full answer of the Hegemony gate.',
  highlights: Object.freeze([
    'Request Access seals itself as Request Sent on the first gesture, before any network round trip can invite a second tap.',
    'The gold strike, violet water-like echo, and exact admission resonance now answer only that first accepted gesture.',
    'A petition already held by SpacetimeDB returns as Request Received and remains closed across refreshes, while a proven outage can still recover through one status-first retry.'
  ]),
  alphaNotice:
    'Alpha 0.3.37 remains an invite-only, unfinished world. A petition requests manual review only; it does not grant admission, create a keep, or change any Realm ownership or balance.'
});

const ALPHA_0_3_36_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE GATE RESOUNDS',
  summary:
    'The Hegemony gate now answers a keeper’s petition with a measured resonance of its own.',
  highlights: Object.freeze([
    'Request Access now carries the exact Hegemony admission chime on the first trusted gesture, without layering the ordinary interface press over it.',
    'A close gold seal and softer violet echo follow the sound’s strike and water-like decay, then leave the gateway quiet and untouched.',
    'The one bounded voice respects mute and reduced-motion preferences, stops when the Realm is concealed, and remains distinct from the later confirmation that the private record has settled.'
  ]),
  alphaNotice:
    'Alpha 0.3.36 remains an invite-only, unfinished world. The resonance marks only a petition leaving the player’s hand; it does not grant admission, create a keep, or change any Realm ownership or balance.'
});

const ALPHA_0_3_35_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '1 AUG 2026',
  title: 'THE PETITION IS SEALED',
  summary:
    'A violet-and-gold answer now gathers around a keeper’s petition the moment it leaves their hand.',
  highlights: Object.freeze([
    'Request Access answers the first click with a restrained Hegemony seal while the petition settles into its immediate Request Sent state.',
    'The flourish never shifts the gateway or captures another touch, and it quiets completely when reduced motion is requested.',
    'Only a newly placed petition receives the ceremony; an existing private Realm record remains calm, received, and impossible to submit again.'
  ]),
  alphaNotice:
    'Alpha 0.3.35 remains an invite-only, unfinished world. The seal confirms only that a petition was placed; it does not grant admission, create a keep, or change any Realm ownership or balance.'
});

const ALPHA_0_3_34_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '31 JUL 2026',
  title: 'THE PETITION STANDS',
  summary:
    'A keeper’s petition now settles visibly the instant it is sent, while the Realm’s private record remains final.',
  highlights: Object.freeze([
    'Request Access becomes a disabled Request Sent action on the first click, without waiting for a network round trip.',
    'A petition already recorded by SpacetimeDB remains visibly received and cannot be submitted again from the gateway.',
    'Rapid repeated gestures are absorbed locally, while the existing private server record remains cycle-idempotent and manually reviewed.'
  ]),
  alphaNotice:
    'Alpha 0.3.34 remains an invite-only, unfinished world. Sending a petition does not grant admission, create a keep, or change any Realm ownership or balance.'
});

const ALPHA_0_3_33_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '31 JUL 2026',
  title: 'THE REALM REMEMBERS',
  summary:
    'Each admitted keeper now receives one experimental Community Mark for every eligible Realm day.',
  highlights: Object.freeze([
    'SpacetimeDB issues one exact Mark automatically to every admitted keeper each UTC Realm day; no wallet, token, transaction, or payment is involved.',
    'Private daily receipts make retries harmless, while revoked admission pauses future grants without erasing the balance already recorded.',
    'The former SNAP burn, wallet-attribution, and chain-scanning paths have been retired from the active game and its operator tools.'
  ]),
  alphaNotice:
    'Alpha 0.3.33 remains an invite-only, unfinished world. Community Marks cannot be spent, transferred, redeemed, or converted and promise no token, airdrop, financial return, guaranteed reward, or future value.'
});

const ALPHA_0_3_32_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '31 JUL 2026',
  title: 'THE HEGEMONY CREST',
  summary:
    'Warpkeep now opens beneath the same current Hegemony crest in Farcaster and the browser.',
  highlights: Object.freeze([
    'The native Mini App launch splash now carries the current purple-and-gold Hegemony crest instead of the original draft mark.',
    'The brief browser opening frame and no-JavaScript fallback use that same crest, so the retired standalone W no longer flashes between Farcaster and the Realm.',
    'A content-addressed image URL gives the current crest a fresh cache identity while leaving every entry and Realm authority boundary unchanged.'
  ]),
  alphaNotice:
    'Alpha 0.3.32 remains an invite-only, unfinished world. This presentation patch does not change authentication, admission, Terms acceptance, castle ownership, Workers, resources, balances, terrain, or persistent world state.'
});

const ALPHA_0_3_31_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '31 JUL 2026',
  title: 'THE GATE LISTENS',
  summary:
    'A verified keeper still beyond the frontier can now place one clear petition before the gate and return when the Realm answers.',
  highlights: Object.freeze([
    'Entry Not Yet Granted now presents Request Access as its single primary action, even when an earlier request-status check could not be completed.',
    'Try Again no longer competes with Check Again before a petition exists; once Request Received is confirmed, Check Again returns for the later admission decision.',
    'Request submission remains private, manually reviewed, and idempotent: it grants no admission, creates no keep, and changes no existing Realm record.'
  ]),
  alphaNotice:
    'Alpha 0.3.31 remains an invite-only, unfinished world. This gateway correction does not change admission decisions, castle ownership, Workers, resources, balances, terrain, or the larger strategy features still being built.'
});

const ALPHA_0_3_30_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '31 JUL 2026',
  title: 'THE GATE REMEMBERS',
  summary:
    'Returning keepers can now open directly inside Genesis 001 from Farcaster, while every unmet promise stops at the one gate that owns it.',
  highlights: Object.freeze([
    'An admitted Farcaster keeper whose current Alpha Terms and canonical keep are confirmed opens the Realm directly, without crossing the title or ordinary menu.',
    'A keeper still outside the frontier remains on Request Access for manual review, while a new Terms version asks for one fresh, explicit acceptance.',
    'Missing Quick Auth credentials settle into a safe retry, native Back dismisses the Terms record, and route or host presentation data never grants entry.'
  ]),
  alphaNotice:
    'Alpha 0.3.30 remains an invite-only, unfinished world. This entry-flow release does not change admission decisions, castle ownership, Workers, resources, balances, terrain, or the larger strategy features still being built.'
});

const ALPHA_0_3_29_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '31 JUL 2026',
  title: 'THE REALM HOLDS',
  summary:
    'Genesis 001 now recovers more cleanly from interrupted touch and embedded navigation, while its gateway records and Worker orders hold to tighter boundaries.',
  highlights: Object.freeze([
    'Interrupted drags and pinches retire cleanly when a Realm record or menu takes focus, and embedded Back navigation recovers when a host silently drops its history event.',
    'Gathering portraits keep one bounded accessible control lane, ambient overflow portraits no longer steal taps, and selected keep names refresh when public profile details arrive.',
    'Farcaster verification and access requests now have firmer lifetime and queue bounds, while an exact Worker order can be retried after the Worker returns without sending them twice.'
  ]),
  alphaNotice:
    'Alpha 0.3.29 remains an invite-only, unfinished world. This continuity patch does not change admission decisions, castle ownership, gathering rates, balances, terrain, or the larger strategy features still being built.'
});

const ALPHA_0_3_28_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '31 JUL 2026',
  title: 'THE REALM IN HAND',
  summary:
    'Genesis 001 now fits naturally in Farcaster and responds cleanly to touch, while the living Realm remains the whole stage beneath every focused record.',
  highlights: Object.freeze([
    'A compact portrait rail keeps the keeper portrait and all four resources clear of device safe areas without covering the Realm.',
    'Keeps, Workers, resources, Water, terrain, Explore, and Settings open as focused destinations with one predictable Back path and restrained motion.',
    'Selection, one-finger panning, and pinch zoom share one reliable map gesture lane across iPhone, Android, and embedded browsers; supported Mini App hosts add quiet haptics after real outcomes.',
    'Verified players awaiting admission can submit a private access request for manual review. Mini Apps prefer server-validated Quick Auth with memory-only authority, while ordinary browser sign-in remains bound to SIWF.'
  ]),
  alphaNotice:
    'Alpha 0.3.28 remains an invite-only, unfinished world. An access request is not admission; it creates no castle and changes no ownership, balance, Worker authority, terrain, or persistent world rule.'
});

const ALPHA_0_3_27_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '30 JUL 2026',
  title: 'THE SUNSCOURED SOUTH',
  summary:
    'The southern outer Lowlands now open into a warm, wind-shaped frontier while the founding heartland remains familiar.',
  highlights: Object.freeze([
    'A broad dry transition gathers beyond the central district and deepens into pale and compact sand tones toward the southern rim.',
    'Grass becomes shorter and sparse through the frontier, preserving quiet ground and the natural shape of Water, routes, keeps, and resource sites.',
    'The north and founding center retain their established character, and the southern treatment adds no terrain height, movement, resource, or world-authority rule.'
  ]),
  alphaNotice:
    'Alpha 0.3.27 remains an unfinished, evolving world. The Sunscoured South is a static visual treatment, not a desert terrain kind, climate system, hazard, yield change, or gameplay modifier.'
});

const ALPHA_0_3_26_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '30 JUL 2026',
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
    '0.4.0': ALPHA_0_4_0_PATCH_NOTES,
    '0.3.43': ALPHA_0_3_43_PATCH_NOTES,
    '0.3.42': ALPHA_0_3_42_PATCH_NOTES,
    '0.3.41': ALPHA_0_3_41_PATCH_NOTES,
    '0.3.40': ALPHA_0_3_40_PATCH_NOTES,
    '0.3.39': ALPHA_0_3_39_PATCH_NOTES,
    '0.3.38': ALPHA_0_3_38_PATCH_NOTES,
    '0.3.37': ALPHA_0_3_37_PATCH_NOTES,
    '0.3.36': ALPHA_0_3_36_PATCH_NOTES,
    '0.3.35': ALPHA_0_3_35_PATCH_NOTES,
    '0.3.34': ALPHA_0_3_34_PATCH_NOTES,
    '0.3.33': ALPHA_0_3_33_PATCH_NOTES,
    '0.3.32': ALPHA_0_3_32_PATCH_NOTES,
    '0.3.31': ALPHA_0_3_31_PATCH_NOTES,
    '0.3.30': ALPHA_0_3_30_PATCH_NOTES,
    '0.3.29': ALPHA_0_3_29_PATCH_NOTES,
    '0.3.28': ALPHA_0_3_28_PATCH_NOTES,
    '0.3.27': ALPHA_0_3_27_PATCH_NOTES,
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
