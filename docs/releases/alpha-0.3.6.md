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

This candidate changes only the Realm's client-side daylight/IBL balance,
bounded castle and authored-base calibration, scene-linear Lowlands palette,
shared castle/base terrain clearance, local terrain support, occupied-cell
interaction overlay, identity presentation, camera framing, map gesture
handling, projected-label motion, and player-directed graphics defaults. It
also synchronizes player-visible release truth for package version `0.3.6`.

It does not authorize or perform:

- a Cloudflare Worker deployment, Durable Object migration, DNS change, or
  GitHub Pages deployment;
- a SpacetimeDB module, schema, protocol, world, or production-data mutation;
- a Terms, authentication, authorization, admission, profile, castle ownership,
  wallet, or Marks change; or
- a GLB edit, texture replacement, independent base correction, public
  relicensing, or broader derivative/redistribution grant.

## Castle and base readability

The owner-approved GameReady files remain byte-for-byte at their existing
immutable integrity-pinned URLs. Runtime applies an idempotent diffuse-colour
uniform gain of `1.22` to castle materials and `1.10` to authored landscape-base
materials, with every channel bounded to `1.25`. High, Balanced, and Compact use
the same role-specific values, so LOD changes cannot substitute a different
brightness policy. The authored colour is retained separately, preventing
repeated tuning or role changes from compounding the gain.

The calibration adds no texture sample, texture allocation, material, draw,
light, shadow map, or render pass. It does not add emissive response or change
roughness, metallic response, normal mapping, texture colour space, model
geometry, provenance, or the exact castle/base parent transform.

The world now starts with a camera-visible daylight key at `(4.5, 14, 10.5)`, a
clear-sky/earth hemisphere, and a bright generated sun highlight in its bounded
procedural IBL. Environment intensity is `0.44` High, `0.39` Balanced, and
`0.34` Reduced. The existing camera-facing fill is deliberately reduced to
approximately `0.42` irradiance and the amethyst side fill to `0.16`, leaving
amethyst as an accent rather than the dominant bounce. This raises wall
readability without increasing global ACES exposure, adding a light, shadow
map, render pass, or unbounded animation loop.

Lowlands palette values remain scene-linear vertex colours, but now favor a
cleaner green base/meadow/forest range. The SVG fallback encodes those values
once to display sRGB, so fallback terrain no longer interprets the same palette
as a darker CSS colour.

## Authored landscape contact

Castle and landscape-base authored transforms remain exactly shared. Diagnostic
sampling found that the authored island reaches about `1.06` world units from
its centre, while the former terrain foundation influence ended inside that
footprint. Alpha 0.3.6 expands only the local render foundation and its outer
blend so the island is supported across every canonical castle slot: flat
support reaches `1.08` world units and the outer blend reaches `1.22`.
Decoration clearance uses the same conservative `1.22` outside boundary.

The dense High base has more intended below-ground skirt triangles than the
other LODs. A small `0.010` world-unit clearance is therefore applied once to
the complete castle-plus-base assembly for every LOD. It preserves the shared
child transform and leaves the skirt buried; it is not a High-only adjustment
or an independent base lift.

This is a client render input. It does not rewrite an authoritative terrain
row, canonical cell, castle coordinate, model asset, or world-generation seed.
Hover and selection no longer draw the depth-tested six-edge cell line through
an occupied castle island; identity, raycasting, and the selected castle record
remain the occupied-cell feedback.

## Graphics default and settings

Cinematic is the default title and Realm profile on every device. The renderer
continues to enforce its existing pixel-ratio and drawing-buffer ceilings, and
its normal WebGL/model fallbacks remain available. Balanced and Performance are
clear explicit opt-downs for a device that needs them; the previous stored
`auto` choice migrates to Cinematic. The redesigned settings panel makes that
choice visible and returns players **Back to the Menu**.

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

## Map interaction and label motion

The Realm map now owns one deliberate pointer-gesture lane across both its
WebGL canvas and permanent castle identity rails. A primary drag can therefore
start on either terrain or a rail and engage on its first deliberate attempt;
HUD controls and dialogs remain outside the lane. The coordinator keeps a rail
tap as normal castle activation, but once movement becomes a drag it captures
the pointer, applies the complete movement that crossed the threshold, and
suppresses only the resulting rail click.

Direct drag uses ground-plane intersections at the previous and current
viewport points, then applies the bounded world-space movement immediately.
Starting direct input cancels stale camera catch-up. Wheel zoom remains anchored
under the pointer for every eased frame; when the wheel begins on a rail, its
castle-foundation point is the anchor. Pinch combines centroid pan with
centroid-anchored zoom through the same camera path. Moving inward from the
explicit zoom-zero overview is continuous rather than jumping to the ordinary
interactive floor. High-rate pointer samples accumulate into one camera update
and WebGL render per display frame without dropping movement.

Pointer cancellation, capture loss, loss of the pressed button, window blur,
document hiding, and scene disposal all clear gesture and direct-camera state.
Failed capture is retried while a drag remains active, and drag suppression
cannot consume keyboard or assistive activation. Resizing or changing HUD
composition invalidates an old screen anchor so eased zoom always settles.
Castle rails now receive their projection in the scene frame at tenth-pixel
precision instead of waiting for a second animation frame and stepping at
whole pixels. Their moving plates no longer request permanent transform
promotion or backdrop blur, reducing avoidable compositing work without
changing their accessible button behavior.

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

- focused material, lighting, terrain-placement, camera, shared canvas/rail
  gesture, cancellation, persistent-label, responsive React, and patch-note
  regressions;
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
