# Genesis 001 Realm Presentation

## Purpose and authority

After Sign In with Farcaster, Terms acceptance, and private admission succeed,
Warpkeep opens one shared world presentation: canonical Genesis 001. SpacetimeDB
owns the realm, world tiles, public metadata, players, profiles, and castles. The
browser renders that complete projection; it does not invent a smaller recovery
map, ownership, castle coordinates, or player identity.

This presentation does not yet implement resources, roads, farms, units,
movement, combat, fog of war, or alternate biomes.

## Canonical readiness boundary

The authenticated realm mounts only after a single validator accepts the whole
snapshot. The contract requires one active Genesis 001 realm at protocol 3,
radius 20, the expected generation and render radius, exactly 1,261 world rows,
exactly 1,261 matching metadata rows, valid tile keys/rings/static metadata,
valid castle occupancy, and an own castle that belongs to the authenticated
player.

Partial subscriptions, ambiguous realms, missing sidecars, stale geography, and
invalid castle relations remain behind a branded loading surface and eventually
fail closed to Retry or Return to Menu. A same-player reconnect may retain an
earlier snapshot only when its complete private fingerprint still matches the
canonical Genesis contract. No authenticated production path generates or
renders a standalone radius-four world.

```txt
authoritative radius:        20
authoritative cells:      1,261
render radius:               22
visual apron cells:         258
total rendered cells:     1,519
current passable cells:   1,101
```

The original 61 radius-four rows remain unchanged as rings 0–4 inside this same
world. They are historical inner geography, not a second runtime topology.

The map uses pointy-top axial coordinates:

```txt
x = size × sqrt(3) × (q + r / 2)
z = size × 1.5 × r
s = -q - r
```

Stable `(world seed, q, r, channel, index)` hashes generate terrain fields and
decoration candidates without mutable random state or `Math.random()`.

## Terrain and foundations

Each pointy hex is split into six radial wedges and barycentrically subdivided.
Vertices are deduplicated by stable quantized world position before normals are
computed for the combined mesh. Shared edges therefore reuse positions and do
not create overlapping cell meshes, cracks, or hard normal seams.

One deterministic quality plan is applied to canonical Genesis before large
arrays or GPU resources are allocated. There is no special 61/91-cell runtime
branch:

| Profile | Subdivisions | Terrain triangles | Triangle ceiling | Detail ceiling |
| --- | ---: | ---: | ---: | ---: |
| High | 4 | 145,824 | 150,000 | 7,000 |
| Balanced | 3 | 82,026 | 90,000 | 5,500 |
| Reduced | 2 | 36,456 | 40,000 | 3,000 |

Every authoritative castle receives a deterministic local placement. The
normalized castle spans 1.48 world units and its authored island reaches about
1.06 units from the shared origin. Terrain therefore uses a 1.08 level footprint
and 1.22 smooth blend radius. The blend crosses the owning hex boundary but
remains disjoint at the canonical minimum three-world-unit castle spacing. The
same 1.22 outer radius clears local vegetation, while the placement continues to
supply a packed-earth/stone tint.

Three deterministic instanced detail layers add green tufts, dry tufts, and
stones. Canonical density is bounded per profile and reduced further in the
visual apron. Terrain and detail work remains demand-driven and pauses while the
document is hidden.

Canonical metadata also gives every authoritative cell one of seven restrained
terrain presentations:

| Terrain | Cells | Presentation |
| --- | ---: | --- |
| Lowland | 266 | moss and packed-soil substrate |
| Meadow | 274 | lighter grass and dried-gold interior |
| Forest | 280 | cooler ground with low procedural coppices |
| Heath | 281 | muted amethyst heather |
| Ridge | 59 | weathered stone outcrops |
| Lake | 48 | opaque, low-profile slate water |
| Ancient stone | 53 | compact monoliths and cool stone |

The semantic tint fades completely at shared cell edges, preserving the one
continuous mesh rather than drawing a categorical hex board. The 258-cell
visual apron has no authoritative metadata and remains neutral. Vertical
features are suppressed on all 100 founding slots and inside every occupied
castle clearance. Generic grass and stones are removed from scenic blockers,
so semantic features reallocate the existing detail budget rather than adding
an unbounded layer. At runtime the five possible semantic instance families
plus the three generic families remain at no more than eight detail draw calls.

Static-content values such as `resource-capable`, `core-capable`, and `reserve`
are future placement capability only. The renderer deliberately exposes no
resource, Core, reward, or gameplay marker from those values.

## Real castle rendering

Every visible founded castle uses a verified Hegemony castle GLB. The ordinary
WebGL path contains no cone, crystal, pin, number-circle, or temporary primitive
castle. Realm presentation remains branded-loading until all authoritative
castles have real instances; model failure switches the whole view to the
canonical illustrated fallback instead of presenting mixed representations.

The project-internally authorized GameReady installation boundary provides
three integrity-pinned Hegemony Main Castle LODs:

| LOD | Runtime path | Bytes | Triangles | Embedded images / profile texture target | SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| High | `public/models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb` | 2,215,972 | 72,850 | two 2048×2048 WebP images | `9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8` |
| Balanced | `public/models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb` | 892,788 | 32,550 | two 1024×1024 WebP images | `a9df1a9acd36e7208b764396854053a6e3c591f2eb04a83a6e2437c55a3aa157` |
| Compact | `public/models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb` | 453,628 | 17,232 | two 512×512 WebP images | `b665d75e10e3e289dac09ebb9f0eeec75469dda77fb25265b03b5ad6081c627b` |

Each castle LOD has one matching integrity-pinned GameReady landscape base:

| LOD | Runtime path | Bytes | Triangles | Embedded images | SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| High | `public/models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb` | 214,372 | 3,954 | two 1024×1024 WebPs | `be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c` |
| Balanced | `public/models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb` | 92,784 | 2,138 | two 512×512 WebPs | `179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f` |
| Compact | `public/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb` | 27,328 | 714 | two 256×256 WebPs | `f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3` |

The base is not another authoritative structure. Castle and base are assembled
under the exact same parent position, quaternion, and uniform scale. Runtime
must not independently center, normalize, ground, or scale the base; its
below-ground skirt and `+Z` gate road are authored placement. Castle-only
height and footprint continue to drive screen-space LOD, camera focus, and the
username-foundation anchor. Composite castle-plus-base bounds exist only for
conservative culling. Picking compares the nearest valid castle-geometry and
simple non-rendered oval base-collider hits; decorative island triangles are
never collision geometry.
The 1.08 level footprint covers the complete authored island before terrain
blends to natural relief at radius 1.22. Decoration clearance uses that same
1.22 outer radius, preventing trees, rocks, and terrain relief from intersecting
the approximately 2.056×1.705-world-unit base. Bounded neighboring-cell queries
keep the wider influence local without scanning all 100 castle placements.

The exact GameReady package and its three inputs were supplied and authorized
by the project owner on 2026-07-16 for project-internal Warpkeep runtime
integration plus bounded deterministic metadata correction only. That limited
authorization is not a separate public open license, general redistribution or
third-party derivative permission, trademark grant, or canonical-identity
grant; the full provenance boundary is in the dated
[GameReady castle record](../reference/castles/2026-07-16-hegemony-main-castle-gameready/).
The separately supplied landscape package has the same narrow PR #40
project-internal integration boundary and remains
`LicenseRef-Warpkeep-Provenance-Required`; see its
[GameReady landscape-base record](../reference/castles/2026-07-16-hegemony-castle-landscape-base-gameready/).

The GameReady inputs already contain their final geometry and embedded WebP
payloads. High is installed byte-for-byte. Balanced and Compact arrive with
correct 1024×1024 and 512×512 images but incorrectly declare atlas size 2048;
the deterministic metadata helper corrects those declarations while preserving
all geometry and image payload bytes. The verifier decodes and checks both
dimensions and per-image hashes, so a profile cannot silently misdeclare its
atlas.

The asset verifier also pins each LOD's VEC3 quantized position component type,
exact three-axis accessor bounds, scene graph, and uniform mesh/root transforms.
High and Balanced resolve to 14.062 source units of height; Compact resolves to
13.47 and is about 4.2% shorter before the shared footprint normalization. The
project owner explicitly accepted the GameReady family's profile-relative size
and height differences. This makes a silent proportion or transform collapse
an asset-policy failure without pretending that the accepted LODs are
dimension-identical.

Each required LOD is fetched and parsed once per mounted realm. A scene-lifetime
repository owns its geometry, materials, and textures; deterministic
`InstancedMesh` buckets reuse those resources across castles. Screen-space LOD
selection has separate enter/exit thresholds, a selected-castle floor, quality
ceilings, stable castle-ID-to-instance mapping, frustum culling, and tested
4-castle/100-castle packing. Late loads cannot insert after unmount, and the
final lease disposes each shared GPU resource exactly once.

Higher-detail residency is explicitly bounded. High permits at most eight High
and 24 Balanced castles; Balanced permits at most 24 Balanced castles; Reduced
uses Compact throughout. With all 100 slots visible and promoted, the complete
castle-plus-base ceilings are 2,667,272, 2,196,408, and 1,794,600 triangles for
High, Balanced, and Reduced. The base adds 131,496, 105,576, or 71,400 of those
triangles and at most three, two, or one corresponding instanced draws. The
three base files add 334,484 compressed bytes; their approximately 10.5 MiB of
decoded images before mipmaps is shared once per resident LOD, not per castle.
Four fully promoted castles contain 307,216 High, 138,752 Balanced, or 71,784
Compact castle-plus-base triangles.

Derivative transfer sizes and geometry counts are integrity-pinned, but decoded
GPU memory is device- and browser-dependent. The prefab repository owns one
resource set per resident LOD and shares textures only after material and
decoded-image compatibility are proven; no memory estimate is inferred solely
from compressed transfer bytes.

Normalization uses one uniform scale, centers X/Z, and aligns the lowest source
point to the local foundation on the castle child, then copies that exact
transform to the authored base without independently normalizing it. Authored
material differences are preserved; only unsafe numeric extremes are bounded.
Warm frontier sunlight, neutral stone light, cool amethyst fill, restrained
ACES exposure, and the base's physical island thickness provide depth without
stretching a realm-wide shadow map over 1,519 cells. When the complete base LOD
family is ready, the old footprint contact-shadow instance is suppressed to
avoid double-dark grounding.

The GameReady model refresh changes geometry and profile proportions, not the
authored brightness contract. No brighter-material result is claimed by these
GLBs; any castle-brightness improvement must come from separately reviewed
renderer lighting, material-response, and palette changes.

PBR separation comes from an asset-free procedural equirectangular environment,
not a network HDR download. High, Balanced, and Reduced generate bounded
256×128, 128×64, and 64×32 maps with intensities 0.44, 0.39, and 0.34. The map,
visible sun disc, and directional light share one direction. Allocation failure
keeps the solid sky and direct lights playable; local controlled WebGL QA
requires the aggregate `procedural` environment status.

## Identity and interaction

Public castle presentation comes only from sanitized trusted profile records.
World labels prefer `@canonicalUsername`, then trusted display name, then
`Hegemony Keep`. The direct world rail contains text rather than a portrait so
its identity remains narrow and stationary. The selected castle record prefers
a safe HTTPS Farcaster PFP, then a public-name initial, then the Warpkeep `W`.
FID digits are never the main label or avatar; FID may appear once as secondary
record metadata only where an existing public projection provides it.

Hover is an imperative, animation-frame-coalesced visual effect. It does not
change terrain selection, castle selection, inspection, camera focus, the main
HUD, or live-region output. Click, tap, Enter/Space, and explicit navigator
activation are the only selection paths. Castle instances are raycast before
terrain, and deterministic instance IDs resolve back to castle IDs. Drag and
pinch gestures suppress hover and click activation until they end.

React owns label identity and public profile content. Camera movement updates
CSS transforms at most once per animation frame. Every individual username rail
uses the current projected foundation base as both layout and visual anchor.
Full and compact rails share that point, have no nudge radius, roof stack, or
connector leader, and retain one identity-keyed React control while camera
distance and castle LOD change. Only a stable viewport-width breakpoint may
select compact presentation; distance and projected density never change label
membership or presentation. Projection and edge visibility use one fixed
quality-session envelope rather than the active mesh LOD envelope.

Every founded castle whose minimum direct-control box fits inside the current
viewport receives one rail. Camera distance, LOD, density, and collision never
move that rail away from its projected foundation or turn it into a cluster.
Fully clipped edge controls are omitted from the world layer, and rendered QA
rejects collisions, failed hit testing, or reserved-UI overlap in the supported
viewport matrix. One roving tab stop bounds keyboard traversal. Explore remains
the complete navigator for every founded castle, including edge and offscreen
identities.

The responsive selected-castle record renders only already-sanitized public
Farcaster presentation and existing public Realm fields: castle name, level,
coordinates, a valid founded date, canonical username, trusted display name and
biography, and public Marks values only when the profile's visibility flag is
true. A validated canonical username may produce the Farcaster profile link.
The record invents no durability, alliance, combat status, resource state, or
destructive action.

Its decorative hero is the same-origin
`public/images/realm/hegemony-castle-record.webp`, an accessibility-hidden
1254×1254 alpha WebP with exact byte, decoded-pixel, alpha, hash, and provenance
checks. The art is a background-cleaned presentation layer rather than a world
model, profile signal, or authority source. Its dated narrow PR #40
project-internal authorization does not imply an open licence or broader
derivative/redistribution right.

## Camera and responsive UI

The perspective camera composes against the unobstructed play region rather
than the raw canvas center. Runtime measurements supply left HUD, right drawer,
bottom toolbar/navigator, compact bottom-sheet, and device-safe insets. Opening
or closing an inspector smoothly recomposes the same camera. Explicit castle
activation focuses that castle; overview and Founding District remain separate
actions.

The close view uses an 18° telephoto-style field of view versus the 26° overview
lens, increasing distance instead of distorting the castle. Safe-bound golden
tests cover 1920×1080, 1440×900, 1024×768, 390×844, and 667×375 with the
inspector open and closed. Reduced-motion mode settles composition immediately.

The in-realm interface uses compact amethyst/electrum layers: an own-keep HUD,
inline Marks presentation, bottom action toolbar, a responsive selected-castle
record with bounded decorative art, and a searchable Realm Navigator. The
record remains a stable side drawer on wide layouts and a safe-area-aware sheet
on compact or short-landscape layouts. The navigator lists meaningful founded
castles and offers an optional validated q/r jump; it does not expose a
permanent grid of more than one thousand coordinate buttons.

Escape closes the topmost inspector or navigator before returning to the menu.
Arrow keys move map selection only while the map owns focus. Labels and nested
controls contain their events, focus is visibly restored, touch targets remain
at least 44 CSS pixels, and hover is never announced.

If WebGL2 or a required model is unavailable, an illustrated SVG fallback still
renders the radius-22 surface, distinguishes all 1,261 authoritative cells from
the 258-cell apron, shows every founded castle and public identity, and retains
the same selection, HUD, inspector, and navigator contract.

## Residual limits

The 100-castle path is architecture- and regression-tested, but real device GPU
and thermal behavior still varies. Label count, pixel ratio, terrain detail, and
LOD ceilings remain deliberately bounded. Rich gameplay overlays, persistent
camera preferences, and alternate castle models are future work rather than
claims of Alpha 0.3.5.
