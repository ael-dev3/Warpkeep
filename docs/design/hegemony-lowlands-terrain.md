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
normalized model spans 1.48 world units; its terrain uses a 0.62 level footprint
and 0.78 smooth blend radius. The blend completes before the pointy-hex
inradius, preserving close adjacent founders without cross-cell seams. The same
placement clears local vegetation and supplies a packed-earth/stone tint.

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

The project-internally authorized preparation pipeline produces three
integrity-pinned Hegemony Main Castle LODs:

| LOD | Runtime path | Bytes | Triangles | Embedded images / profile texture target | SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| High | `public/models/hegemony/hegemony-main-castle-high.glb` | 1,934,920 | 67,680 | two 2048×2048 WebP images | `9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2` |
| Balanced | `public/models/hegemony/hegemony-main-castle-balanced.glb` | 1,172,132 | 40,353 | two 1024×1024 WebP images | `aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e` |
| Compact | `public/models/hegemony/hegemony-main-castle-compact.glb` | 508,508 | 19,086 | two 512×512 WebP images | `de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29` |

The source is the checksum-pinned `HegemonyMainCastle.glb` member from the
public `hegemony-frontier-keep-3d-2026-07-14` release. On 2026-07-15, the
project owner authorized project-internal runtime integration and deterministic
derivative preparation. That limited authorization is not a separate public
open license, redistribution/third-party derivative permission, trademark
grant, or canonical-identity grant; the full provenance boundary is in the
dated castle record.

The runtime preparation stage explicitly rewrites the embedded atlases with
pinned Sharp/libvips before geometry simplification. It preserves the High
source payloads exactly, uses lossless WebP for resized normal maps, and uses
quality-90 WebP for resized base color. The verifier decodes and checks both
dimensions and per-image hashes, so a profile cannot silently retain a larger
atlas.

Each required LOD is fetched and parsed once per mounted realm. A scene-lifetime
repository owns its geometry, materials, and textures; deterministic
`InstancedMesh` buckets reuse those resources across castles. Screen-space LOD
selection has separate enter/exit thresholds, a selected-castle floor, quality
ceilings, stable castle-ID-to-instance mapping, frustum culling, and tested
4-castle/100-castle packing. Late loads cannot insert after unmount, and the
final lease disposes each shared GPU resource exactly once.

Higher-detail residency is explicitly bounded. High permits at most eight High
and 24 Balanced castles; Balanced permits at most 24 Balanced castles; Reduced
uses Compact throughout. With all 100 slots visible and promoted, those ceilings
bound castle geometry to 2,807,760, 2,419,008, and 1,908,600 triangles
respectively. Because each GLB has one primitive, the 100-castle High case still
uses at most three castle instance draw calls plus one shared contact-shadow draw
call. Four fully promoted castles contain 270,720 High, 161,412 Balanced, or
76,344 Compact triangles.

Derivative transfer sizes and geometry counts are integrity-pinned, but decoded
GPU memory is device- and browser-dependent. The prefab repository owns one
resource set per resident LOD and shares textures only after material and
decoded-image compatibility are proven; no memory estimate is inferred solely
from compressed transfer bytes.

Normalization uses one uniform scale, centers X/Z, and aligns the lowest source
point to the local foundation. Authored material differences are preserved;
only unsafe numeric extremes are bounded. Warm frontier sunlight, neutral stone
light, cool amethyst fill, restrained ACES exposure, and one footprint-sized
contact shadow per visible castle provide depth without stretching a realm-wide
shadow map over 1,519 cells.

PBR separation comes from an asset-free procedural equirectangular environment,
not a network HDR download. High, Balanced, and Reduced generate bounded
256×128, 128×64, and 64×32 maps with intensities 0.36, 0.32, and 0.28. The map,
visible sun disc, and directional light share one direction. Allocation failure
keeps the solid sky and direct lights playable; local controlled WebGL QA
requires the aggregate `procedural` environment status.

## Identity and interaction

Public castle presentation comes only from sanitized trusted profile records.
World labels prefer `@canonicalUsername`, then trusted display name, then
`Hegemony Keep`. Avatars prefer a safe HTTPS Farcaster PFP, then a public-name
initial, then the Warpkeep sigil. FID digits are never the main label or avatar;
FID may appear once as secondary record metadata.

Hover is an imperative, animation-frame-coalesced visual effect. It does not
change terrain selection, castle selection, inspection, camera focus, the main
HUD, or live-region output. Click, tap, Enter/Space, and explicit navigator
activation are the only selection paths. Castle instances are raycast before
terrain, and deterministic instance IDs resolve back to castle IDs. Drag and
pinch gestures suppress hover and click activation until they end.

React owns label identity and public profile content. Camera movement updates
CSS transforms at most once per animation frame. Collision uses measured label
and avatar dimensions, bounded membership, hysteresis, and reserved HUD,
inspector, toolbar, navigator, and safe-area rectangles.

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
inline Marks presentation, bottom action toolbar, explicit selected-castle
record, and a searchable Realm Navigator. The navigator lists meaningful
founded castles and offers an optional validated q/r jump; it does not expose a
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
claims of Alpha 0.3.3.
