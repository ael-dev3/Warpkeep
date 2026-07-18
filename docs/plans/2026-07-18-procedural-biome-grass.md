# Procedural Biome Grass and GPU Wind

**Status:** draft implementation plan for the standalone visual grass/wind PR.

**Branch boundary:** `agent/procedural-biome-grass-wind`, rooted directly at
`main` commit `3ca99d2d263453fbb112a7a21fa1bfde294e186b` (the Alpha 0.3.8
checkout). This work is presentation-only. It does not change SpacetimeDB,
generated bindings, authority, resources, collision, pathfinding, movement,
visibility, deployment state, package/release version, or production data.

The historical resource work in PRs #48 and #49 is not replayed or modified by
this branch. The currently separate draft work in #51 (Gold Mine expeditions)
and #52 (canonical forest layout) is neither merged into nor depended on by
this branch. If either lands before this branch, reconcile the shared
`createRealmScene.ts` integration deliberately against the resulting `main`;
do not stack or silently combine the workstreams.

## Visual goal

Replace the sparse, CPU-matrix-animated `green-tuft` and `dry-tuft` details
with dense but bounded, low-poly grass clumps. Close and medium strategic views
should read as living Lowlands fields, while the full-Realm view continues to
read through terrain colour, water, landmarks, forests, and castles rather than
sub-pixel foliage.

Grass is decorative only. It never creates a resource, interaction target,
gameplay occupancy, concealment rule, or information that a player must infer
for play.

## Deterministic placement policy

Grass generation lives in renderer-neutral modules and accepts only canonical
terrain/map inputs, fixed channels, and explicit presentation exclusions. It
does not read the clock, browser state, iteration order, or `Math.random`.

- `realm-grass-macro-coverage-v1` is smooth world-space value noise at a 6.75
  world-unit wavelength. It creates fields and clearings that cross cell
  boundaries.
- `realm-grass-meso-coverage-v1` is an independent 2.35-unit field used with a
  per-candidate micro hash (`realm-grass-micro-coverage-v1`) to break up the
  edges of fields without a hex-grid pattern.
- Candidates use a golden-ratio stratified sequence, cell-seeded rotation and
  jitter, a conservative pointy-hex interior, deterministic rank, and a small
  local minimum separation. Stable sorting makes results invariant to supplied
  cell/exclusion array order.
- Each accepted point has immutable cell, x/z, grounded height, yaw, size,
  terrain-blended tint, wind phase, stiffness, wind response, and rank data.
  Ground height comes from `terrainHeightAtWorld`; local height samples reject
  or thin steep slopes.
- Permanent castle slots and existing `TerrainStructurePlacement`
  `decorationClearanceRadius` values are honored before packing. No secondary
  castle-clearance rule is invented.

### Biome profiles and bare areas

The profile table is deliberately explicit and frozen by pure tests. Counts
below are High-quality candidates before coverage, slope, clearance, and local
spacing rejection; Balanced and Reduced multiply them by 0.62 and 0.25,
respectively, with deterministic rounding.

| Terrain | High candidates/cell | Complete-bare threshold | Height | Width | Intended character |
| --- | ---: | ---: | --- | --- | --- |
| Meadow | 30 | 0.12 | 0.18–0.30 | 0.12–0.22 | Fresh yellow-green field with occasional warm tips |
| Lowland | 24 | 0.20 | 0.18–0.30 | 0.12–0.22 | Muted medium green, limited dry gold |
| Forest | 20 | 0.32 | 0.16–0.27 | 0.12–0.21 | Cool, shadowed undergrowth |
| Heath | 14 | 0.47 | 0.14–0.24 | 0.11–0.20 | Olive with restrained amethyst variation |
| Ridge | 4 | 0.84 | 0.08–0.16 | 0.08–0.15 | Isolated straw/olive ledges |
| Ancient Stone | 2 | 0.96 | 0.06–0.12 | 0.07–0.12 | Almost bare grey-green/weathered straw |
| Lake | 0 | 1.00 | — | — | Always grassless |
| Render apron | 5 | 0.65 | 0.08–0.14 | 0.09–0.16 | Sparse neutral edge treatment |

The macro threshold represents an intentionally complete clearing, not merely a
lower count. Meso coverage and per-point retention then create natural thinning
inside grass-supporting biomes. This preserves broad vegetation without
uniformly filling every cell. Palette colours are mixed with the sampled local
terrain tint so roots remain visually planted rather than pasted on.

## Generic exclusions and interaction readability

`RealmGrassExclusion` is a bounded, sorted circle (`id`, world point, radius),
not an asset- or resource-specific rule. It clears small presentation roots for
forest trees, ridge outcrops, and ancient monoliths today, and allows future
reviewed structures to provide a clearance without teaching grass about Gold
Mines, logging, food, quarry, or any other gameplay type.

Grass has a no-op raycast and is never added to terrain/castle input targets.
Per-instance canonical q/r attributes let the shader flatten grass in a
selected cell to 42% and a hovered cell to 70% of normal height. Ordinary
motion interpolates that uniform transition over 140 ms; reduced motion settles
it immediately. The existing selection outlines, labels, drag, pinch, wheel,
and castle interactions remain above the decorative layer.

## Geometry and material contract

One programmatic, shared low-poly ribbon geometry is instanced per active
clump. No GLB, texture atlas, alpha foliage card, external asset, per-clump
mesh, or grass shadow is introduced.

| Profile | Ribbons/clump | Triangles/ribbon | Triangles/clump |
| --- | ---: | ---: | ---: |
| High | 5 | 3 | 15 |
| Balanced | 4 | 3 | 12 |
| Reduced | 3 | 3 | 9 |

Each tapered ribbon has two root vertices, two mid vertices, and a tip. Its
`grassFlex` attribute is 0 at roots, about 0.56 through the middle, and 1 at
the tip; normals are manually upward-biased for readable double-sided,
low-poly lighting.

The material remains a `MeshStandardMaterial` so it retains the established
lighting, fog, tone mapping, colour space, instance transforms, and instance
colours. Its narrowly asserted `onBeforeCompile` hook is pinned to the
`three-r185` shader contract and carries a stable program cache key. Missing
`#include <begin_vertex>` fails closed instead of quietly shipping broken wind.

Required uniforms are `uGrassTime`, `uGrassWindDirection`,
`uGrassWindStrength`, `uGrassGlobalVisibility`, `uGrassSelectedCell`,
`uGrassHoveredCell`, and `uGrassInteractionFlattening`. Required instanced
attributes are `grassPhase`, `grassStiffness`, `grassWindScale`,
`grassCell`, and `grassEdgeFade`, alongside `grassFlex` and
`instanceColor`.

Wind uses a fixed prevailing direction, a broad world-space travelling wave, a
secondary cross-wave, slow gust modulation, and per-instance phase/stiffness.
Only x/z vertices with flex above zero move; roots remain exactly planted. The
maximum legal sway is 0.075 world units and instance bounds are inflated by
that amount after packing. Advancing wind changes one material time uniform;
it never calls `setMatrixAt`, walks the instance pool, or marks instance
matrices dirty.

## Bounded active-window and quality policy

The complete Genesis 001 world is already 10,000 authoritative cells (10,981
rendered cells with apron), so this implementation deliberately does not
generate a world-wide grass array. A camera-focus-centred axial disc looks up
only the cell coordinates it needs. A hysteresis threshold prevents repacking
on small camera movement, an outer 1.5–2-cell band shrinks edge grass, and a
fixed-capacity `InstancedMesh` packs candidates by deterministic rank.

| Quality | Capacity | Triangle ceiling | Active radius | Cache limit | Wind cadence |
| --- | ---: | ---: | ---: | ---: | ---: |
| High | 14,000 | 210,000 | 12 cells | 2,048 cells | 24 fps |
| Balanced | 7,000 | 84,000 | 9 cells | 1,024 cells | 16 fps |
| Reduced | 2,000 | 18,000 | 6 cells | 512 cells | static (0 fps) |

The per-cell immutable-data cache is an LRU and is cleared on disposal. Generic
root exclusions are normalized and indexed once into small world-space buckets,
so active-window repacks do not repeatedly sort or scan every semantic feature
for every candidate. Active data and GPU allocation are bounded by the selected
quality plan rather than world cardinality. A deterministic budget collector
thins over-capacity candidates by distance/rank before writing the fixed pool.
Stones and semantic terrain features retain their own static budgets and are
not counted as grass.

In full-Realm overview the detailed grass window is empty, mesh count is zero,
and no wind work is scheduled. This is intentional visual culling, not a hole
in terrain presentation. The same safe empty state is used if grass setup
fails: terrain, castles, controls, labels, and semantic features continue to
work, with a bounded presentation QA state rather than player-facing shader
logs.

Because canonical production already exercises a 10,000-cell world, bounded
traversal must be proven directly against it: move the active window across the
map and show that active cells, cache entries, instance count, and allocation
never exceed the selected plan. If a future synthetic stress fixture is useful,
it must be development-only, have no production route/import, and never be
described as canonical Genesis state.

## Animation scheduler

The old 180 ms CPU wind step is replaced by one demand-driven,
`requestAnimationFrame`-aligned scheduler shared with the Realm scene. It is
frame-capped at 24 fps High or 16 fps Balanced, advances only shader time, and
has no Reduced-quality loop.

It starts only while a non-empty close/approach/keep grass window is visible,
pauses when the document is hidden, stops in overview, stops for reduced
motion, and cancels on disposal. Re-activation resets its accumulator and
clamps elapsed frame deltas so a sleeping tab does not resume with a large wind
time jump. Camera-driven frames remain authoritative during active camera
motion; this layer does not create a permanent 60 fps render loop or a second
infinite renderer loop.

## Telemetry and verification

The scene exposes only bounded presentation telemetry: candidate/active cell
counts, active instances, triangles, draw calls, cache entries, animated flag,
target cadence, terrain-kind counts, complete-bare cells, structure/exclusion
and slope rejections, and overview-hidden state. It never logs individual
points, player/session data, routes, or unbounded arrays.

Automated coverage should prove:

- fixed noise channel/wavelength results, stable generation under input
  permutation, biome ordering, lake emptiness, height/width limits, placements,
  slope thinning, generic exclusions, and bare patches;
- exact geometry topology/flex contract and shader uniform/attribute/cache-key
  contract, including bounded root/tip motion and preserved material path;
- active-window overview suppression, hysteresis, deterministic capacity
  thinning, LRU bounds/disposal, and no whole-map grass materialization;
- no matrix uploads or per-instance CPU work during wind, scheduler frame caps,
  hidden/overview/reduced-motion pauses, resume behavior, and disposal; and
- terrain/castle selection through grass plus selected/hovered flattening.

Before review, run focused grass tests, the root Vitest suite, TypeScript and
production builds, asset/output policy checks, and rendered QA. Rendered QA
must cover representative meadow, lowland, forest, heath, ridge, ancient
stone, lake, apron, clearing, structure/feature clearance, selected/hovered
cells, full overview, close keep, active-window pan, quality changes, remount,
Reduced, reduced motion, and supported portrait/landscape viewports. Record
still frames at a fixed QA wind phase and short live-wind evidence separately.

## Residual risks and non-goals

Density, palette, and wind tuning are provisional art-direction values; broad
device/thermal behavior still needs browser evidence. Grass deliberately does
not react physically to caravans or units. Future landmarks and structures must
submit generic exclusion circles to retain clean roots. Shader chunk changes in
future Three.js upgrades require an explicit contract review instead of a
silent fallback.

This work does not add weather, seasons, harvesting, gameplay bending,
individual grass shadows, post-processing, imported grass art, non-WebGL SVG
grass, a resource feature, a backend mutation, a release claim, a merge, or a
deployment.
