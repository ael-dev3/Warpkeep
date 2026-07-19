# Luminous broad grass

## Scope

This draft PR is presentation-only. It changes the existing procedural grass
geometry, palette, material coverage, density policy, and aggregate telemetry.
It does not change terrain membership, passability, structures, resources,
castle state, routes, economy, SpacetimeDB, or the shared ambience scheduler.

Protected `main` was refreshed at `f23643c0d07e91847cadd5445a294d965ad76e1c`
(Alpha 0.3.11 baseline).

## Verified diagnosis

- `createLowPolyGrassGeometry.ts` builds 5/4/3 crossed ribbons per instance.
  Every ribbon starts at one shared local root and tapers to a single tip, so
  the patch reads as a narrow star/crown rather than distributed ground cover.
- The biome ranges (`0.18..0.30` height and `0.12..0.22` width) are tall for the
  local unit geometry. Instance scaling therefore emphasizes the vertical
  teeth and leaves the footprint sparse.
- `createRealmGrassMaterial.ts` multiplies a dark `#748f47` material base with
  already-muted instance/ground tints. It writes no alpha-hash coverage and
  adds no foliage wrap/backlight floor, so standard lighting can collapse the
  field toward black.
- `createRealmGrassLayer.ts` owns one mesh and scales the complete transformed
  geometry by `grassEdgeFade`; edge patches shrink in X/Z into their root.
  Instance phase/stiffness exist, but each crossed patch still moves as one
  rigid crown.
- `realmGrass.ts` uses a golden-angle candidate ring with low candidate counts
  (Meadow 30, Lowland 24) and further retention/separation thinning. The active
  plans currently allow 14,000/7,000/2,000 patches, which exceeds the requested
  High and Reduced ceilings and does not guarantee the requested dense Meadow /
  Lowland ranges.
- `realmAmbientScheduler.ts` is already one demand-driven shared clock with
  hidden-tab pause, reduced-motion support, frame caps, time-jump clamping, and
  disposal. It will remain the only animation loop.

## Redesign

- Generate distributed patch geometry with 9/7/5 three-triangle blades for
  High/Balanced/Reduced. Roots use deterministic low-discrepancy positions in a
  `0.08..0.46` local disk, with per-blade lean, height, width, yaw, phase, and
  stiffness. Geometry variants are 3/2/1 per quality and share one material.
- Keep patch roots and footprints fixed during active-window fades. Fade
  fragment coverage with alpha-hash inputs and cap any edge height reduction;
  selection flattening bends/shortens only the affected patch.
- Author Meadow/Lowland palettes as sRGB hex values, convert through
  `THREE.Color` to linear instance colours, use a neutral white material base,
  and add a bounded root floor plus restrained tip backlight/wrap term.
- Preserve world-space wind direction. Vertex motion combines world wave,
  patch phase, blade phase, stiffness, and global gust; roots remain planted.
- Keep the existing camera-local cache, static instance matrices between
  repacks, raycast no-op, lifecycle disposal, and shared scheduler.

## Hard budgets

| Quality  | Blades/patch | Variants | Max patches | Triangles/patch | Max triangles | Draw calls |
| -------- | -----------: | -------: | ----------: | --------------: | ------------: | ---------: |
| High     |            9 |        3 |       7,000 |              27 |       189,000 |          3 |
| Balanced |            7 |        2 |       4,000 |              21 |        84,000 |          2 |
| Reduced  |            5 |        1 |       1,200 |              15 |        18,000 |          1 |

## Verification

Deterministic geometry, distribution, colour, material, wind, layer, active
window, cleanup, and budget tests will pin the new contracts. The existing
rendered WebGL harness will be extended with fixed-time grass views when its
current fixture surface permits; no owner desktop path or private screenshot
will be committed. Residual risks include alpha-hash grain at low resolution,
MSAA-dependent alpha-to-coverage, extra variant draw calls, mobile thermal
behaviour, Three.js r185 shader-hook drift, and the intentionally absent
physical grass interaction.
