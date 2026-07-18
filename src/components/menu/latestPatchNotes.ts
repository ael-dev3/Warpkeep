export type LatestPatchNotes = Readonly<{
  releasedOn: string;
  title: string;
  summary: string;
  highlights: readonly string[];
  alphaNotice: string;
}>;

const ALPHA_0_3_2_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '14 JUL 2026',
  title: 'GENESIS 001 FOUNDING',
  summary:
    'The Hegemony frontier is now a persistent shared realm built for its first close-knit founders.',
  highlights: Object.freeze([
    '1,261 authoritative realm cells and 100 permanent castle slots grow outward from one founding district.',
    'Admission founds one nearby level-one keep; trusted Farcaster presentation identifies each castle.',
    'Paged navigation, castle inspection, responsive labels, and radius-aware rendering keep the expanded realm clear and fast.',
    'Private, server-owned Hegemony Marks groundwork is live. Accounts begin at 0; spending and production burn-credit application remain unavailable.',
    'Marks are experimental game accounting—not rewards, airdrops, transferable assets, or money.'
  ]),
  alphaNotice: 'Alpha systems remain experimental and may change.'
});

const ALPHA_0_3_3_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '14 JUL 2026',
  title: 'GENESIS REALM QUALITY',
  summary:
    'Alpha 0.3.3 strengthens realm readiness and makes the shared frontier clearer without changing its authority model.',
  highlights: Object.freeze([
    'Realm entry waits for one complete, internally consistent Genesis snapshot instead of presenting partial world state.',
    'Public castle identity stays limited to sanitized Farcaster display fields; private identity and wallet data remain outside the realm view.',
    'Founded keeps now share quality-aware rendering of the real Hegemony castle asset instead of abstract peer markers.',
    'Static Farcaster portraits and persistent usernames stay anchored to their castles; crowded names consolidate without hiding the keeps beneath them.',
    'A slimmer HUD, focused castle record, first-view Realm Council link, and searchable Explore panel keep navigation clear across mouse, touch, and keyboard play.'
  ]),
  alphaNotice: 'Released 14 July 2026. Alpha systems remain experimental and may change.'
});

const ALPHA_0_3_4_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '15 JUL 2026',
  title: 'REALM QUALITY FOLLOW-THROUGH',
  summary:
    'Alpha 0.3.4 tightens the Genesis realm presentation without changing player authority.',
  highlights: Object.freeze([
    'Castle labels stay attached to the visible keep silhouette through dense clusters, viewport changes, and responsive layouts.',
    'Optimized Hegemony Main Castle models now replace the earlier Frontier Keep derivatives across the shared realm.',
    'The exact compact Hegemony GLB is decoded, instanced, and activated from the WebGL canvas in a local regression before terrain can be selected.',
    'The rendered browser matrix now exercises complete player layouts across desktop, tablet, mobile, and short-landscape views.',
    'Local QA remains excluded from production Pages assets. This release does not publish a Worker, SpacetimeDB module, profile refresh, admission, world, castle, wallet, or Marks change.'
  ]),
  alphaNotice: 'Released 15 July 2026. Alpha systems remain experimental and may change.'
});

const ALPHA_0_3_5_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '16 JUL 2026',
  title: 'GAME-READY CASTLE REFRESH',
  summary:
    'Alpha 0.3.5 refreshes Realm castles, settles each keep into an authored Lowlands landscape, and gives every founder a cleaner identity presentation without changing player authority.',
  highlights: Object.freeze([
    'Cinematic, Balanced, and Performance graphics now use the new High, Balanced, and Compact GameReady castle models.',
    'Every castle tier now carries its matching road-and-island landscape base with grass, trees, rocks, shrubs, and flowers; the authored base replaces the old synthetic contact shadow.',
    'The Compact castle keeps its intentionally shorter authored proportions; each base inherits the castle transform exactly instead of being independently centred, scaled, or grounded.',
    'Slim usernames stay fixed at each castle foundation; individual labels never drift or grow leader lines, while dense identities consolidate through deterministic keeper clusters and Explore.',
    'The responsive castle record uses only sanitized public Farcaster and existing Realm data, with a safe portrait-to-initial fallback instead of invented gameplay fields or actions.',
    'Verified sign-in now keeps the Farcaster username and static PFP visible during and after QR verification, with exact-FID tab restoration limited to non-authoritative presentation.',
    'Background-cleaned castle record art and every GameReady model remain same-origin, integrity-pinned, provenance-recorded, and cache-safe at immutable asset paths.',
    'This Pages-only patch changes client-side decoration clearance and authentication presentation, but no Terms, authentication authority, admission, authoritative world generation, castle ownership, wallet, Marks, Worker, or SpacetimeDB authority.'
  ]),
  alphaNotice: 'Released 16 July 2026 after protected deployment and exact-build verification.'
});

const ALPHA_0_3_6_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '18 JUL 2026',
  title: 'REALM READABILITY & STABILITY',
  summary:
    'Alpha 0.3.6 is a Realm-presentation patch for a brighter, greener, more dependable Lowlands without changing player authority.',
  highlights: Object.freeze([
    'A camera-visible daylight sun, clear-sky/earth bounce, brighter bounded IBL, and role-specific material calibration give every castle tier a more sunlit read; global exposure, light count, shadow allocation, and demand-driven rendering remain unchanged.',
    'Lowlands now favor cleaner green scene-linear terrain colours, and the SVG fallback correctly encodes that same palette for display.',
    'Hardware-aware Auto remains the recommended default: it selects Cinematic only with measured headroom, keeps normal phones Balanced, and fails down on constrained devices. Every fixed profile remains selectable, and Settings returns you back to the menu.',
    'Wider local terrain foundations support each authored island footprint, and castle interaction feedback no longer draws a depth-tested cell line through the landscape base.',
    'Every safely in-viewport founded castle keeps a direct identity rail at its exact foundation anchor; clipped or visible-UI-obstructed controls stay in Explore, exactly one visible label is tabbable, spatial arrow keys and Home/End provide deterministic navigation, and rendered QA records bounded label-on-label contention while rejecting non-label hit obstruction, viewport clipping, or HUD overlap. Explore remains the complete castle list.',
    'Ordinary wheel and pinch input retain a readable zoom floor, while the explicit Realm overview frames the actual convex rendered-terrain perimeter with a conservative raised-scene margin so canonical slots remain inspectable.',
    'Dragging now catches on the first deliberate attempt, even from a castle name; scroll and pinch zoom stay centered on the point of interest, and labels move smoothly with the map.',
    'The compact player HUD now shows the sanitized static Farcaster portrait with the existing safe monogram fallback; exact resource-icon masters remain outside the Pages public tree and a fail-closed bigint decoder is included only as future groundwork, with no balances, production, construction, or placeholder counters enabled.',
    'Defensive source hardening tightens authentication configuration, cookies, bounded transports, canonical profile/castle ingress, complete founder-profile projections without requiring first-auth player bootstrap, tooling, and CI without adding a bypass or mutating admission, Worker, SpacetimeDB, production data, authoritative world state, DNS, wallet, or Marks.'
  ]),
  alphaNotice:
    'Released 18 July 2026 after protected Pages deployment and exact-build verification.'
});

const ALPHA_0_3_7_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: 'CANDIDATE · 18 JUL 2026',
  title: 'GENESIS RESOURCE AUTHORITY',
  summary:
    'Alpha 0.3.7 is an undeployed candidate for one small persistent resource loop; Alpha 0.3.8 is now the verified public main release.',
  highlights: Object.freeze([
    'Each founder receives one private, caller-scoped Food, Wood, Stone, and Gold inventory owned by SpacetimeDB; peer balances never enter the public Realm subscription.',
    'Server time and authoritative castle terrain determine completed ten-minute yields. Collect accepts no browser-supplied FID, balance, terrain, rate, timestamp, or castle input.',
    'Resource reads and collection fail closed behind admission, current castle ownership, the exact Alpha Terms acceptance, and a complete private resource-account graph; the client never applies an optimistic balance.',
    'Community Marks remains a separate private authority with its existing zero-start accounting and policy; this candidate adds no conversion, transfer, credit, or spending path.',
    'Food, Wood, Stone, and Gold use immutable, integrity-checked runtime icons derived from the recorded masters without publishing those source masters in the Pages artifact.',
    'The additive schema fixture, generated-binding checks, guarded founder backfill, and counts-only version-four inspection prepare a bounded migration without exposing FIDs or balances.',
    'Construction, upgrades, units, combat, trading, public inventories, and financial rewards remain unavailable.'
  ]),
  alphaNotice:
    'Undeployed candidate. Release requires additive module publication, an owner-approved guarded founder backfill, version-four counts verification, exact Pages deployment, and final owner approval.'
});

const ALPHA_0_3_8_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: '18 JUL 2026',
  title: 'THE REALM GROWS',
  summary:
    'Genesis 001 stretches to a wider horizon while its first keeps remain close enough to feel like a founding neighbourhood.',
  highlights: Object.freeze([
    'Genesis 001 now holds 10,000 persistent cells. Every original cell and all 100 close-outward founder sites remain in place, so no castle was moved by the expansion.',
    'Admitted founders can return to their keep, explore the Lowlands, and inspect the public identity of nearby castle owners in one shared authoritative world.',
    'Each keep has private Food, Wood, Stone, and Gold stores that begin at zero and grow from its terrain over time; the Realm, not the browser, keeps the tally. Community Marks remain separate and cannot be spent or earned as rewards.',
    'The outer frontier includes dormant space for future resource sites, but no map node, building, unit, combat, alliance, trade, or season system is active.',
    'A sleeping Realm now has more time to wake. If the same founder briefly reconnects, Genesis stays in view while private controls wait safely for authority to return.',
    'Alpha participation offers no airdrop, guaranteed reward, financial return, or promise of future value.'
  ]),
  alphaNotice:
    'Released 18 July 2026. Alpha systems remain experimental and may change.'
});

const ALPHA_0_3_9_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: 'CANDIDATE · 18 JUL 2026',
  title: 'GENESIS GOLD EXPEDITIONS',
  summary:
    'Alpha 0.3.9 is an undeployed candidate for a bounded Gold Mine wagon loop on the expanded Genesis 001 world; Alpha 0.3.8 is now the verified public main release.',
  highlights: Object.freeze([
    'The Alpha 0.3.8 world definition remains exact: 10,000 persistent cells and 2,000 resource-capable anchors, with every original founder slot preserved.',
    'Food, Wood, and Stone retain server-time terrain collection. Gold has one issuance path: a completed wagon-gathering minute, never passive terrain yield.',
    'Twenty-four deterministic Tier-I Gold Mines are selected from passable resource-capable Genesis anchors and pinned by a placement digest.',
    'A dispatch sends only a site id and idempotency key. The server derives admission, terms, castle, passable route, timing, one-wagon limit, 1 Gold/minute rate, 30-day gathering window, and return; the browser never moves a wagon or credits Gold.',
    'Every player can see a public Mine occupancy timeline and origin castle, while FIDs, request keys, routes, accrued output, and balances stay private. Internal-only arrival, expiry, and return schedules settle whole minutes exactly once.',
    'Gold Mines and Hegemony supply wagons use provenance-pinned High, Balanced, and Compact assets with bounded model reuse, nearby-only animation, safe marker fallback, and an accessible site record.',
    'The preserved Genesis founding Lowlands gain one shared, server-seeded forest layout: every player sees the same 210 trees, groves, and clearings from 22 provenance-pinned families, while High, Balanced, and Compact settings change model detail only. The layout stays decorative: terrain, passability, castle slots, Gold sites, ownership, and economy remain unchanged.',
    'Community Marks remains a separate private authority with no conversion, transfer, credit, or spending path. Construction, upgrades, combat, trading, public inventories, and financial rewards remain unavailable.'
  ]),
  alphaNotice:
    'Undeployed candidate. Release requires additive module publication, owner-approved resource, Gold-site, and forest-layout setup, aggregate verification, exact Pages deployment, and final owner approval.'
});

const ALPHA_0_3_10_PATCH_NOTES: LatestPatchNotes = Object.freeze({
  releasedOn: 'CANDIDATE · 18 JUL 2026',
  title: 'HEGEMONY ENTRY AGREEMENT',
  summary:
    'Alpha 0.3.10 is an undeployed candidate that joins the Alpha Terms and Hegemony Social Contract as one versioned entry agreement; Alpha 0.3.8 remains the verified public main release.',
  highlights: Object.freeze([
    'One concise, unchecked entry dialog links to the Alpha Terms, Hegemony Social Contract, and Privacy Notice in that order. The checkbox accepts the Terms and Social Contract only; the Privacy Notice remains a notice, not blanket consent.',
    'The current client and module require the same exact entry-agreement bundle before entry and gameplay. An older acceptance cannot quietly authorize the newer agreement.',
    'A successful acknowledgement adds only private immutable FID, exact bundle-version, and acceptance-time evidence. Browser checkbox state, proof material, tokens, cookies, wallets, chat, and social-graph data are not added to that record.',
    'A specifically retained historical record can preserve an already-public Community Marks projection, but never grants current entry or gameplay eligibility.',
    'The current Alpha remains Hegemony-only and allowlist/admission gated. Ousters and Core are provisional future-setting names, not playable factions, active feature work, or promises.',
    'This candidate adds no schema, protocol, reducer-wire, faction, chat, AI, moderation-tooling, premium, payment, reward, or Marks-economy feature.'
  ]),
  alphaNotice:
    'Undeployed draft candidate. Stack reconciliation, formal legal/privacy and naming review, matching client/module release, protected deployment, and exact-build verification remain separately approval-gated.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.2': ALPHA_0_3_2_PATCH_NOTES,
    '0.3.3': ALPHA_0_3_3_PATCH_NOTES,
    '0.3.4': ALPHA_0_3_4_PATCH_NOTES,
    '0.3.5': ALPHA_0_3_5_PATCH_NOTES,
    '0.3.6': ALPHA_0_3_6_PATCH_NOTES,
    '0.3.7': ALPHA_0_3_7_PATCH_NOTES,
    '0.3.8': ALPHA_0_3_8_PATCH_NOTES,
    '0.3.9': ALPHA_0_3_9_PATCH_NOTES,
    '0.3.10': ALPHA_0_3_10_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
