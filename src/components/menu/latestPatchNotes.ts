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

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.2': ALPHA_0_3_2_PATCH_NOTES,
    '0.3.3': ALPHA_0_3_3_PATCH_NOTES,
    '0.3.4': ALPHA_0_3_4_PATCH_NOTES,
    '0.3.5': ALPHA_0_3_5_PATCH_NOTES,
    '0.3.6': ALPHA_0_3_6_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
