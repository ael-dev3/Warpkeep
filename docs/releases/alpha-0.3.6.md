# Warpkeep Alpha 0.3.6 — Realm Readability & Stability

**Status: candidate in PR #44; not merged, deployed, tagged, or verified as a
public release. Alpha 0.3.5 remains the verified Pages-only public release.
No Worker, Durable Object, SpacetimeDB, admission, profile, authoritative world,
castle, wallet, Marks, scan, burn, DNS, or deployment operation is part of this
candidate.**

Alpha 0.3.6 is a bounded browser-presentation patch for the live Genesis 001
Realm. It responds to a 17 July 2026 owner capture in which GameReady castle
masonry remained too dark beside pale Lowlands terrain, direct identity rails
changed into moving keeper aggregates during zoom, authored landscape bases
appeared to intersect local relief, and ordinary camera input could expose the
finite hex world as a small island in the scene fallback.

The capture is diagnostic input only and is not retained in the repository.
The implementation changes no authoritative tile, castle, player, profile,
admission, wallet, or Marks record.

## Release scope

This candidate changes only the Realm's client-side material calibration,
existing directional-fill orientation and intensity, local terrain support
around already-founded castles, occupied-cell interaction overlay, identity
presentation, and camera framing. It also synchronizes player-visible release
truth for package version `0.3.6`.

It does not authorize or perform:

- a Cloudflare Worker deployment, Durable Object migration, DNS change, or
  GitHub Pages deployment;
- a SpacetimeDB module, schema, protocol, world, or production-data mutation;
- a Terms, authentication, authorization, admission, profile, castle ownership,
  wallet, or Marks change; or
- a GLB edit, texture replacement, model repositioning, independent base lift,
  public relicensing, or broader derivative/redistribution grant.

## Castle and base readability

The owner-approved GameReady files remain byte-for-byte at their existing
immutable integrity-pinned URLs. Runtime applies an idempotent diffuse-colour
uniform gain of `1.18` to castle materials and `1.06` to authored landscape-base
materials, with every channel bounded to `1.25`. High, Balanced, and Compact use
the same role-specific values, so LOD changes cannot substitute a different
brightness policy. The authored colour is retained separately, preventing
repeated tuning or role changes from compounding the gain.

The calibration adds no texture sample, texture allocation, material, draw,
light, shadow map, or render pass. It does not add emissive response or change
roughness, metallic response, normal mapping, texture colour space, model
geometry, provenance, or the exact castle/base parent transform.

The existing neutral directional fill is also moved closer to the horizontal
camera azimuth. It targets approximately `0.70` camera-facing irradiance while
contributing less than `0.09` upward irradiance. The competing amethyst fill is
reduced to `0.32`. This raises wall readability without increasing the global
ACES exposure or terrain material energy and without introducing a new light or
an unbounded animation loop.

## Authored landscape contact

Castle and landscape-base transforms remain exactly shared. Diagnostic sampling
found that the authored island reaches about `1.06` world units from its centre,
while the former terrain foundation influence ended inside that footprint.
Alpha 0.3.6 expands only the local render foundation and its outer blend so the
island is supported across every canonical castle slot: flat support reaches
`1.08` world units and the outer blend reaches `1.22`. Decoration clearance
uses the same conservative `1.22` outside boundary.

This is a client render input. It does not rewrite an authoritative terrain
row, canonical cell, castle coordinate, model transform, or world-generation
seed. It also does not hide the defect with an independent model lift. Hover and
selection no longer draw the depth-tested six-edge cell line through an occupied
castle island; identity, raycasting, and the selected castle record remain the
occupied-cell feedback.

## Permanent foundation identity

Every projection-visible founded castle now receives exactly one direct,
text-bearing identity button at the current projected foundation anchor. Camera
distance, LOD selection, hover, selection, label collision, and nearby keeper
membership cannot replace that button with a cluster, overflow entry, floating
badge, or leader line. Compact presentation is determined only by the viewport
class, so zoom cannot flip an identity between label modes.

Projection membership is gated by the instance layer's live pre-mask 3D
frustum set as well as the 2D silhouette. A label therefore cannot remain at a
screen edge after its castle model has been culled, while a castle newly entering
the frustum is still discoverable before the prior frame's presentation mask is
updated. The transparent interaction target uses a one-pixel safety margin over
the required 44 CSS pixels so device-scale rounding cannot intermittently make
the control undersized.

Dense labels may overlap as the last truthful fallback. Selected, focused,
owned, and hovered controls keep deterministic visual priority, and Explore
retains the complete keyboard- and touch-accessible list. Overlap is preferable
to detaching an identity from its castle or making it appear and disappear as
camera thresholds change. Each world rail remains keyboard-focusable with an
at-least-44-pixel control box, but a lower rail in a dense overlap can be pointer-obscured
by the rail above it; Explore is the guaranteed individually selectable pointer
and touch path for that residual case.

## Camera framing

Ordinary wheel and pinch input retain a readable minimum zoom of `0.16` instead
of reaching the former tiny-world view. The explicit Realm overview remains
available at zoom zero so all 100 canonical slots can be inspected. Its fit uses
the actual convex 12-point perimeter derived from rendered cell corners,
including the real chamfers, plus a conservative raised-scene margin rather
than the nonexistent corners of an axis-aligned bounding box. This changes
presentation framing only: it creates no new world cell, collision target,
navigation coordinate, or gameplay authority.

## Integrity and authority

The `0.3.6` package version identifies checked-in candidate source, not a public
deployment. The in-menu patch chronicle deliberately says candidate until the
protected-main Pages workflow and exact-build post-deploy checks pass. Alpha
0.3.5 remains the verified public release and the current public menu build
stamp remains its exact deployment coordinate.

The browser still consumes only the existing sanitized public Farcaster and
Realm projections. FID remains identity, profile fields remain display
metadata, and server authority remains responsible for admission, founding,
ownership, world state, and future gameplay. No new public field, action, trust
decision, or backend writer is introduced.

## Candidate validation

PR #44 must not be promoted from candidate on the strength of checked-in notes.
Before review it requires:

- focused material, lighting, terrain-placement, camera, interaction, cleanup,
  persistent-label, responsive React, and patch-note regressions;
- the complete root test suite, TypeScript check, ordinary production build,
  canonical `DEPLOY_BASE=/` Pages build, runtime-asset integrity, file-size,
  licence/provenance, and production-output exclusion checks;
- rendered WebGL coverage at High, Balanced, and Reduced across desktop,
  tablet, portrait mobile, and short landscape, including close, approach,
  minimum-interactive, and explicit-overview frames with zero console errors;
  and
- protected-main deployment plus exact public build-stamp verification before
  a `v0.3.6` tag, GitHub Release, or public-release wording is created.

Until all release gates pass, this document records candidate intent and tested
source behavior only. It is not evidence that Alpha 0.3.6 is live.
