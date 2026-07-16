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
    'Alpha 0.3.5 refreshes every Realm castle with the owner-approved GameReady Hegemony LOD family without changing player authority.',
  highlights: Object.freeze([
    'Cinematic, Balanced, and Performance graphics now use the new High, Balanced, and Compact GameReady castle models.',
    'High preserves the richest close-view geometry, while Balanced and Compact reduce transfer size and submitted geometry for wider views.',
    'The Compact model keeps its intentionally shorter authored proportions; every tier is still uniformly scaled, centred, and grounded in the Lowlands.',
    'Each model remains same-origin, exact-length bounded, and SHA-256 verified before it can enter the Realm.',
    'This Pages-only patch changes no authentication, admission, world generation, castle ownership, wallet, Marks, Worker, or SpacetimeDB authority.'
  ]),
  alphaNotice: 'Released 16 July 2026. Alpha systems remain experimental and may change.'
});

export const WARPKEEP_PATCH_NOTES_BY_VERSION: Readonly<Record<string, LatestPatchNotes>> =
  Object.freeze({
    '0.3.2': ALPHA_0_3_2_PATCH_NOTES,
    '0.3.3': ALPHA_0_3_3_PATCH_NOTES,
    '0.3.4': ALPHA_0_3_4_PATCH_NOTES,
    '0.3.5': ALPHA_0_3_5_PATCH_NOTES
  });

export function getLatestPatchNotes(productVersion: string) {
  return Object.hasOwn(WARPKEEP_PATCH_NOTES_BY_VERSION, productVersion)
    ? WARPKEEP_PATCH_NOTES_BY_VERSION[productVersion]
    : undefined;
}
