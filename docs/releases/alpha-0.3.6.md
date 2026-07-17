# Warpkeep Alpha 0.3.6 — Realm Readability & Stability

**Status (18 July 2026): integration candidate; not merged, deployed, tagged,
or verified as a public release. Alpha 0.3.5 remains live until protected-main
deployment and exact-build verification succeed.**

Alpha 0.3.6 is a bounded presentation, maintainability, and defensive-hardening
patch. It changes no Terms decision, admission, castle ownership, authoritative
world row, Marks accounting, wallet state, DNS, or production data. It contains
no SpacetimeDB schema or reducer change.

## Realm presentation

- Bounded role-aware diffuse calibration, a camera-visible daylight key,
  clear-sky/earth bounce, restrained amethyst fill, and brighter procedural IBL
  make all castle LODs more readable without changing the integrity-pinned GLB
  bytes, embedded textures, global exposure, light count, shadow allocation,
  draw count, or authority.
- Lowlands use a cleaner scene-linear green palette. The SVG fallback performs
  the matching display-sRGB conversion instead of showing a darker palette.
- Local render foundations support the authored island footprint out to radius
  `1.08`, blend to relief by `1.22`, and use that outer radius for decoration
  clearance. One `0.010` shared assembly lift applies to castle and base at
  every LOD; the base is never independently transformed.
- Occupied cells no longer draw a depth-tested outline through the authored
  landscape base.

## Camera, labels, and input

- The overview fits the actual convex terrain perimeter. Ordinary wheel and
  pinch input retain a readable zoom floor while explicit overview remains
  available.
- Canvas and castle rails share one pointer coordinator. Threshold-crossing
  movement is retained; label taps still activate; drag, pinch, lost buttons,
  capture loss, cancellation, blur, hidden-page transition, and disposal clean
  their state. Direct input is display-cadence-coalesced and ground anchored.
- Camera projection reaches labels in the same frame with tenth-pixel precision.
  Moving plates no longer request permanent transform promotion or backdrop
  blur.
- Each safely in-viewport founded castle receives a direct text rail at its
  projected foundation. Camera distance and LOD cannot turn it into a floating
  cluster. Controls whose conservative rail width or minimum 45px vertical hit
  box would be clipped, or whose conservative box would be obstructed by
  visible Realm UI, are omitted from the world layer while Explore remains the
  complete castle list.
- Exactly one visible world label is tabbable. Arrow keys move spatially,
  Home/End follow deterministic reading order, and focus recovers when
  projection removes the active label. Rendered QA retains bounded label-on-
  label collision telemetry while rejecting label clipping, non-label hit
  obstruction, and reserved-UI overlap in the supported viewport matrix.

## Graphics and player identity

Hardware-aware **Auto** remains the recommended graphics default. It selects
Cinematic only with measured desktop memory/CPU/texture headroom, keeps normal
phones Balanced, and chooses Performance for constrained devices. Cinematic,
Balanced, and Performance remain explicit settings; renderer pixel and drawing-
buffer ceilings still apply.

The compact player HUD now reuses the same reviewed static Farcaster portrait
canvas as castle records. Remote images remain credential-free, redirect-free,
size/time/dimension/pixel bounded, and static-format-only; rejection falls back
to a sanitized public-name initial or `W`. FID digits are not promoted to the
main player label.

## Resource groundwork, not mechanics

Four exact provenance-pinned transparent icon masters—Food, Wood, Stone, and
Gold—are retained beside their provenance records, outside the Pages `public/`
tree, for a future mechanics slice. A pure decoder accepts only an exact,
non-negative, unsigned-64-bit bigint projection with those four keys. These
files create no authority and are neither copied into the Pages artifact nor
mounted as placeholder counters.

Alpha 0.3.6 does **not** implement resource balances, accrual, costs,
construction, queueing, cancellation, or a player action. Community Marks
remains a separate visibility-gated status. The unresolved gameplay rules and
server acceptance gates remain in
[`docs/plans/2026-07-17-alpha-0.3.6-mechanics.md`](../plans/2026-07-17-alpha-0.3.6-mechanics.md).

## Defensive source hardening

The candidate includes the separately reviewed repository hardening commit:

- stricter auth challenge configuration, bounded TTLs, fail-closed store
  errors, canonical cookie handling, and bounded administrative bearer parsing;
- canonical bounded profile/castle text and image ingress, complete founder-
  profile projections without requiring first-auth player bootstrap, and
  loopback-only browser auth transport;
- bounded, abortable title/model/fetch lifecycles;
- finite fail-closed dormant game-loop arithmetic;
- exact bounded tooling downloads, attested archive extraction, private atomic
  caches, and current exact-SHA CI action pins; and
- removal of a convenience production-log command from package scripts.

These are source controls, not an authentication bypass or a claim that the
Cloudflare Worker has already been redeployed. Worker release, Pages release,
and SpacetimeDB publication are separate gates.

## Release gate

Before public release, the exact combined head must pass root, auth-bridge, and
SpacetimeDB tests; typecheck; both production builds; runtime-asset, licence,
dependency, signature, generated-binding, and additive-migration checks; the
rendered WebGL and journey matrices; protected-main CI; Pages deployment; and
exact public build-stamp verification. Only that verified deployed commit may
receive the annotated `v0.3.6` tag and GitHub Release.
