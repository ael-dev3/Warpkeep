# Realm Lighting, Color, and Castle Readability Decision Record

**Status:** accepted direction; lighting, material, fog, palette, and visual-QA
implementation remains future work

**Audit baseline:** `089430e` (`main`, 2026-07-16)

**Alpha 0.3.5 release scope:** the exact GameReady castle and matching
landscape-base LOD families only. The release does not implement the future
lighting work described here.

This record preserves the decisions and measured boundaries from the original
implementation proposal without retaining a second copy of active asset
manifests or a line-by-line speculative implementation design. It authorizes no
authentication, world-state, backend, deployment, or DNS change.

## Decision

Do not repair Realm readability by raising global exposure or copying another
game's saturated palette. Keep Warpkeep's restrained Lowlands identity and make
six bounded changes in a separately reviewed release:

1. define one explicit color-space contract for every terrain color;
2. use directional, soft grounding rather than a flat synthetic contact disc;
3. establish a clear key/fill hierarchy and reserve amethyst for accents;
4. keep fog on the distant realm rather than the castle being read;
5. lift castle-stone midtones through one bounded, LOD-consistent surface
   calibration only if lighting is insufficient; and
6. add production-scene, object-aware visual metrics before tuning values.

A focused shadow map may improve approach and selected-keep views. Do not render
a world-sized shadow pass over all 100 castles. Overview grounding must remain
cheap; High, and possibly Balanced after measurement, may use one tightly
bounded shadow pass around the active focus. Reduced remains authored-base-only.

## Evidence and confirmed gaps

The comparison screenshots that prompted the audit were perceptual evidence
only. They are not runtime assets, palette sources, or numeric golden targets.
They omitted the exact browser, display profile, graphics quality, camera pose,
and capture processing, so thresholds must come from deterministic Warpkeep
fixtures.

The `089430e` audit established these implementation facts:

- `REALM_QUALITY_SPECS` declared High and Balanced shadow-map sizes, but the
  canonical render planner disabled dynamic shadows in every production tier.
- The old fallback grounding cue was one uniform green-brown circle. Alpha 0.3.5
  replaces that cue with the authored landscape base when the complete family
  is ready, but it does not add directional cast shadows.
- The renderer already uses sRGB output and ACES tone mapping. Color textures
  are sRGB and normal/data textures are non-color, so no obvious castle-texture
  double-gamma error was found; global exposure is not the first lever.
- Terrain palette floats are written directly as Linear-sRGB WebGL vertex
  colors but multiplied into display-sRGB CSS values by the SVG fallback. The
  same values therefore have two confirmed interpretations. For example,
  `grassBase` `(0.424, 0.49, 0.271)` is approximately `rgb(108 125 69)` in CSS
  but displays much lighter when treated directly as linear input.
- Warm sun, purple fill, camera fill, environment light, fog, and a dark
  low-channel castle material interact without a simple value hierarchy.
- Each castle LOD has one material with base-color and normal atlases and no
  authored AO, emissive, or metallic-roughness texture. Lighting can improve
  form but cannot invent missing material classes.
- Existing LOD evidence proves source fidelity, while whole-frame browser
  evidence proves credible output. Neither isolates castle readability from UI
  labels and surrounding terrain.
- Realm rendering is demand-driven. Any future shadow or lighting work must not
  introduce an unconditional animation loop.

## Accepted asset baseline

The exact active model facts, hashes, authorization, and placement constraints
live in the canonical records rather than being duplicated here:

- [Alpha 0.3.5 release notes](../releases/alpha-0.3.5.md)
- [GameReady castle record](../reference/castles/2026-07-16-hegemony-main-castle-gameready/)
- [GameReady landscape-base record](../reference/castles/2026-07-16-hegemony-castle-landscape-base-gameready/)
- [Lowlands renderer contract](../design/hegemony-lowlands-terrain.md)

The model refresh is an accepted geometry, encoding, and authored-grounding
baseline. It is not evidence that the castle material became brighter. The base
inherits the castle's exact parent transform and must not be independently
centered, normalized, grounded, or scaled.

## Desired visual contract

- Keep masonry weighty and weathered; lift readable midtones rather than
  bleaching the texture.
- Make the 3D castle measurably brighter than the audited baseline without
  obtaining the entire improvement by darkening terrain or raising exposure.
- Preserve distinct roofs, gates, windows, banners, electrum accents, and
  recesses.
- Keep perceived brightness and hue stable across High, Balanced, and Compact
  LOD switches.
- Make the sun direction evident from lit planes and a grounded shadow.
- Preserve intentionally dark windows and recesses without crushing most of the
  visible castle into near-black.
- Keep meadow and lowland brighter than forest, heath, ridge, and ancient stone
  while maintaining one natural world.
- Keep distant atmosphere, but prevent visible fog wash over the focused
  foreground castle.
- Reserve amethyst for faction identity, sigils, portals, and restrained fill.
- Preserve interaction, identity, authoritative world state, accessibility,
  fallback behavior, and castle placement.

## Implementation sequence

1. **Measurement and color contract.** Extend the existing loopback-only
   production fixture with fixed overview, approach, and selected-keep captures
   across all three quality tiers and representative responsive viewports. Use
   castle and adjacent-ground masks for luminance, clipping, local range, edge
   contrast, ground separation, and shadow coverage. Raw pixels remain transient
   and local; durable evidence remains fixed-shape and identity-free. Author
   palette swatches as display-sRGB, decode once for linear WebGL work, and
   encode once for the CSS/SVG fallback.
2. **Lighting, fog, and grounding.** Establish one measured key/fill hierarchy,
   neutralize competing fills before adding energy, keep distant fog, and
   preserve the authored base without restoring the synthetic contact disc.
3. **Surface calibration if required.** If lighting alone cannot meet the
   object-masked target, prepare one authorized, deterministic, hue-preserving
   midtone calibration across all LODs. Pin every resulting byte and hash and
   preserve the existing provenance boundary.
4. **Focused shadow experiment.** Enable at most one active-focus shadow map on
   High first. Measure Balanced before enabling it; allocate none on Reduced.
   Preserve demand rendering and invalidate the shadow only when focus, light,
   camera fit, LOD packing, viewport, or relevant terrain changes.
5. **Release integration.** Run the complete regression and same-device
   performance matrix, record the next release truth, and verify the exact
   protected-main deployment.

## Acceptance and budgets

The implementation is incomplete until deterministic production-scene fixtures
show all of the following:

- roof, front, and side planes remain distinguishable at overview, approach, and
  close views;
- castle midtones improve without bleached stone, clipped electrum, crushed
  recesses, or a visible LOD brightness/hue flash;
- directional shadow evidence touches the base and agrees with the visible sun;
- the focused castle remains separable from adjacent ground without relying on
  a DOM label or selection outline;
- the old circular contact edge/halo does not return;
- the direct-light environment fallback remains readable; and
- object-masked metrics exclude UI pixels and stay within owner-approved ranges
  established from a deterministic Warpkeep baseline and target.

Preserve these current geometry and drawing-buffer budgets unless a separate
measured change is approved:

| Profile | Terrain triangles | Detail instances | Target drawing-buffer pixels | Castle-plus-base ceiling |
| --- | ---: | ---: | ---: | ---: |
| High | 150,000 | 7,000 | 8,400,000 | 2,667,272 triangles |
| Balanced | 90,000 | 5,500 | 5,200,000 | 2,196,408 triangles |
| Reduced | 40,000 | 3,000 | 2,400,000 | 1,794,600 triangles |

The first true-shadow experiment may submit no more than one focused
castle-plus-base assembly: 76,804 triangles on High, 34,688 on Balanced, and
zero on Reduced. High may allocate at most one `2048×2048` shadow map; Balanced
at most one `1024×1024`; Reduced allocates none. Cascades, cube maps, a second
shadow-casting light, or a larger caster set require separate measurement and
review.

Also preserve demand rendering, hidden-document pause behavior, bounded draw
calls, and exact-once cleanup through context loss, partial setup, quality
recreation, and teardown. Performance evidence is a same-device before/after
comparison; compressed GLB bytes are not GPU-memory evidence.

## Rollout, authority, and release boundary

Ship palette and color correctness to every tier together. Stage focused true
shadows on High first and retain authored-base grounding everywhere. A typed,
build-time-only `legacy` / `readable-v2` presentation revision may provide one
release of rollback. It must not become a URL parameter, local-storage override,
backend flag, or authority-bearing state, and it must be removed after the new
presentation passes its release gates.

Terrain coordinates, castle ownership, identity, admission, world state,
gameplay, Marks, authentication, and backend protocol remain unchanged. WebGL
fallback, keyboard, touch, pointer, labels, inspector, navigator, and safe-area
behavior remain complete.

The GameReady castle/base refresh belongs to the Alpha 0.3.5 release. Any
player-visible lighting, material, fog, palette, or true-shadow implementation
receives its own later version, changelog entry, release note, menu patch note,
and exact-deployment verification.

## Non-goals

- copying a comparison game's terrain, castle, palette, UI, roads, or
  composition;
- redesigning the accepted GameReady castle or landscape-base geometry;
- adding post-processing, screen-space AO, bloom, or per-castle dynamic lights
  before the simpler pipeline is measured;
- changing authoritative terrain, castle placement, gameplay, identity,
  authentication, backend state, or deployment; or
- treating this record as authorization to merge or ship the future visual work
  without its acceptance gates.

Implementation should use the official Three.js color-management, shadow,
renderer, standard-material, directional-light, and fog documentation; the glTF
2.0 material specification; and the existing
[QA Observatory boundary](../operations/qa-observatory.md).
