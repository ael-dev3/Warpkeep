# Warpkeep Alpha 0.3.5 — GameReady Castle & Landscape LOD Refresh

**Status: Pages-only Alpha 0.3.5 candidate. It becomes a verified public
release only after protected-main deployment and exact-build verification.
No Worker, Durable Object, SpacetimeDB, admission, profile, authoritative world,
castle, wallet, Marks, scan, or burn operation is part of this release.**

Alpha 0.3.5 refreshes the Realm's three Hegemony Main Castle runtime models and
adds one matching authored landscape base beneath every founded keep without
changing player authority or the canonical Genesis 001 world. The High,
Balanced, and Compact profiles use paired GameReady castle/base families
prepared from exact owner-supplied inputs approved for this public Warpkeep
repository and its official Pages runtime. Foundation-bound username rails and
a responsive Farcaster castle record keep identity readable without pretending
that new gameplay state exists.

## Release scope

This release changes the checked-in browser castle and landscape-base GLBs,
their exact integrity and profile metadata, one same-origin decorative
castle-record image, the Realm label and record presentation, player-visible
release truth, and the documentation needed to recover and review those runtime
boundaries. Client terrain presentation also uses a 1.08-unit decoration-only
clearance around each authored island so procedural trees and rocks do not
intersect it; foundation height/color influence and the canonical Genesis 001
world remain unchanged. It does not authorize or perform:

- a Cloudflare Worker deployment or Durable Object migration;
- a SpacetimeDB module or schema publication;
- profile refresh, admission, founding, world, castle, wallet, or Marks
  mutation; or
- any public relicensing or general redistribution grant. The only recorded
  derivative authority is the bounded castle/base GLB atlas-size metadata
  correction and the exact official Warpkeep background cleanup for the
  castle-record artwork; neither exception grants broader derivative or
  redistribution rights.

## GameReady LOD family

The three files remain one-mesh, one-primitive, one-material glTF 2.0 binaries
with embedded WebP base-colour and normal atlases. They continue to require the
Meshopt, WebP, and mesh-quantization extensions used by the production loader.

| Profile | Runtime bytes | Triangles | Position vertices | Actual atlas size | Native height |
| --- | ---: | ---: | ---: | ---: | ---: |
| High | 2,215,972 | 72,850 | 171,554 | 2048×2048 | 14.062 |
| Balanced | 892,788 | 32,550 | 67,687 | 1024×1024 | 14.062 |
| Compact | 453,628 | 17,232 | 34,800 | 512×512 | 13.470 |

High deliberately accepts a modest transfer and triangle increase for its
richer close-view geometry. Balanced and Compact are smaller and submit fewer
triangles than the Alpha 0.3.4 profiles. The Compact source is approximately
4.2% shorter than High and Balanced; the project owner explicitly accepted that
LOD variation. Production still applies one uniform scale, horizontal
centering, and ground alignment per loaded model. It does not stretch any axis
or rewrite authoritative castle placement.

The supplied Balanced and Compact binaries carried a generic 2048 atlas hint
despite containing real 1024 and 512 pixel images. Warpkeep deterministically
normalises only that metadata field; geometry and embedded image bytes remain
unchanged. Runtime records and integrity checks use the actual decoded
dimensions for each tier so the source hint cannot be mistaken for the shipping
allocation.

All six Alpha 0.3.5 GLBs use immutable public filenames carrying the first 16
hex characters of their verified SHA-256. The former Alpha 0.3.4 castle files
remain at their exact old pathnames and bytes for cached-client and rollback
compatibility. GitHub Pages does not partition these assets by query string, so
release safety depends on the immutable pathname rather than a `?v=` marker.

## GameReady landscape-base family

Every castle tier now loads with its matching standalone island base. The base
adds a gate road, grass, trees, rocks, bushes, flowers, and an authored
below-ground skirt while remaining decorative presentation rather than new
world state.

| Profile | Runtime bytes | Triangles | Position entries | Actual atlas size |
| --- | ---: | ---: | ---: | ---: |
| High | 214,372 | 3,954 | 10,681 | 1024×1024 |
| Balanced | 92,784 | 2,138 | 5,611 | 512×512 |
| Compact | 27,328 | 714 | 1,780 | 256×256 |

The castle and base share the exact parent position, quaternion, and uniform
scale. Runtime does not independently center, normalize, ground, or scale the
base from its wider bounds; its road faces `+Z` and the lower island edge is
intentionally below the castle ground plane. Castle-only dimensions continue
to drive LOD thresholds, camera focus, and the exact username-foundation anchor.
Composite bounds only make culling conservative around the wider island.
The existing terrain foundation blend remains local; a separate 1.08-unit
decoration-clearance radius keeps procedural details out of the wider base
without widening ordinary terrain height/color influence.

The authored island replaces the old synthetic contact-shadow instance when
the complete base family is ready. Picking compares the nearest valid
castle-geometry and simple non-rendered landscape-collider hits, so a farther
castle cannot beat a nearer base; decorative base triangles are never collision
geometry. If either model fails exact loading, parsing, assembly, or readiness,
the complete family fails closed to the canonical illustrated Realm fallback
instead of mixing castles and stale bases.

Castle and base transports coalesce only when their integrity-pinned URL and
normalized timeout policy both match. Each caller may cancel independently;
the underlying request is aborted only after its final pending consumer leaves.
One mounted-Realm prefab repository likewise coalesces concurrent LOD
acquisitions, keeps one resource retain per cache entry, and retires a resolved
LOD only after both pending acquisitions and active leases reach zero. Retirement
is final for that Realm lifetime and releases geometries, materials, textures,
and decoded bitmap sources exactly once. A valid empty authoritative castle set
reports readiness zero without attempting a nonexistent castle/base pairing.

Across the complete three-tier runtime family, the bases add 334,484 checked-in
bytes. At 100 visible castles they add at most 131,496, 105,576, or 71,400
triangles in Cinematic, Balanced, and Performance profiles, producing combined
ceilings of 2,667,272, 2,196,408, and 1,794,600. They add at most three, two, or
one instanced draws; their approximately 10.5 MiB of decoded images before
mipmaps is shared once per resident LOD, not copied for every castle.

Because Cinematic keeps all three paired LOD assemblies resident, automatic
selection now requires measured 8 GB device memory, at least six logical CPU
threads, and the existing viewport/drawing-buffer/WebGL limits. Browsers that
do not report that headroom remain Balanced by default. The explicit Cinematic
setting stays available, so this conservative default does not remove player
control.

The supplied Balanced and Compact base binaries contain real 512 and 256 pixel
WebPs but declare `wk_atlas_size: 1024`. Warpkeep deterministically changes only
that metadata to 512 or 256 and repacks the GLB container. Geometry, transforms,
embedded-image payloads, brightness, and color remain unchanged; High is
installed byte-for-byte.

## Foundation identity rails

Each direct username rail has one deterministic screen projection at the
castle's foundation base. The visual rail is deliberately narrow and
translucent inside a separate 44 CSS-pixel interaction target. It carries the
sanitized canonical `@username`, then trusted display name, then the neutral
`Hegemony Keep` fallback.

An individual username is never randomly nudged, stacked around the roof, or
connected back with a leader line. If its exact base position cannot remain
inside the safe area without colliding with a castle silhouette, reserved UI,
or another identity, it enters the deterministic keeper-cluster/Explore
accounting instead of being shown at a misleading location. Camera motion
updates the direct rail from the current foundation projection; membership
hysteresis does not freeze or offset the anchor.

## Responsive Farcaster castle record

The authentication presentation merged after Alpha 0.3.4 now keeps the verified
Farcaster username and static PFP visible during and after QR verification.
After an authoritative cookie refresh, an exact-FID, tab-scoped cache may
restore only those already-sanitized display fields. It cannot restore a
session, choose an FID, admit a player, or alter the Worker/OIDC/SpacetimeDB
authority chain; any FID mismatch fails closed.

Click, tap, Enter/Space, canvas picking, and navigator activation retain the
existing selection boundary and open a responsive record rather than a new
gameplay surface. The record may show only already-sanitized public
presentation data and existing public castle fields: the castle name and
level, coordinates, a valid founded date, canonical username, trusted display
name and biography, and community Marks fields only when their existing public
visibility flag is true. The Farcaster profile link is derived only from a
validated canonical username and is absent in the observer fixture.

A reviewed Farcaster PFP URL may produce only one bounded static canvas
snapshot. The loader accepts the fixed same-origin observer placeholder or
reviewed HTTPS provider/path pairs; sends no credentials or referrer; refuses
redirects; and accepts only JPEG, PNG, or non-animated WebP. It caps transfer at
2 MiB, waits at most eight seconds, rejects either dimension above 4,096 or more
than 4,194,304 decoded pixels, then decodes through a temporary blob URL and
disposes it after drawing. No remote image element enters the document. A
missing, rejected, oversized, animated, timed-out, or failed portrait leaves the
sanitized public-name initial, then the Warpkeep `W`; the record does not depend
on a remote image to remain readable. Alpha 0.3.5 does not invent durability,
alliance, combat status, coordinates outside the existing castle record, or
destructive action state to imitate the visual reference.

The drawer stays beside the map on wide layouts and becomes a bounded,
safe-area-aware sheet on compact and short-landscape layouts. Its close and
profile controls preserve 44 CSS-pixel targets, keyboard focus, and overflow
containment.

## Castle record artwork

The record hero uses
`public/images/realm/hegemony-castle-record.webp`, a 1254×1254 transparent
WebP prepared from project-owner-supplied 2D castle art. The original white
background was removed through the exact recorded edit and chroma-matte
workflow; transparent corners, alpha profile, decoded pixels, 145,416-byte
length, and SHA-256
`30e0c3cd1bbc4732bb5025a78a5dc0cc66bc01c1b752a3f21b48fb429cc11123`
are pinned in repository verification. The image is decorative and
accessibility-hidden. It is not a world model, profile signal, gameplay field,
or network authority.

The owner's 16 July instruction authorizes this exact checked-in use in the
public Warpkeep GitHub repository and official `warpkeep.com` Pages runtime.
The dated provenance record retains both source hashes, the edit
prompt and cleanup parameters without committing the source attachments or
intermediate. The cleanup creates no separate public open-content licence,
general derivative/redistribution authority, ownership claim, trademark grant,
or permission to substitute a same-named asset.

## Visual boundary

This is a geometry and encoding refresh, not a lighting or surface-brightness
claim. The GameReady files do not by themselves brighten the castle material;
High retains the prior High base-colour and normal atlas bytes, while the other
tiers retain the same overall dark-stone material direction. Realm lighting,
terrain colour, grounding, fog, and any future authorised surface calibration
remain separate measured work under the Realm readability plan.
The landscape base improves authored grounding and local environmental detail,
but it likewise does not claim a renderer lighting or palette correction.

## Integrity and provenance

Each GameReady GLB browser request uses an immutable same-origin pathname and
remains exact-length bounded and SHA-256 verified before parsing. Repository
checks pin the reviewed GLB structure, geometry counts, transforms, actual
embedded-image dimensions, and image/file digests. A malformed, substituted,
truncated, or expanded GLB fails
closed to the canonical illustrated Realm fallback. The decorative WebP has a
separate build-time exact-length/hash and decoded-alpha contract; if its normal
`<img>` load or decode fails, the styled record hero remains without treating
the artwork as Realm state or authority.

On 16 July 2026 the project owner authorised integration of the exact High,
Balanced, and Compact GameReady inputs into the public Warpkeep GitHub
repository and official `warpkeep.com` Pages runtime, plus the bounded
atlas-size metadata correction needed for Balanced and Compact. That
instruction is not a separate open licence, a broader third-party derivative or
redistribution grant, general regeneration authority, or a trademark or
canonical-identity grant. The previous public-source preparation pipeline and
its Alpha 0.3.4 outputs remain historical evidence rather than a recipe for
silently overwriting this active set.

The owner separately supplied the exact `Warpkeep Castle Landscape Base`
version `1.0.0` package and instructed PR #40 to add its three runtime LODs
under the castles and deploy the patch. This authorizes exact integration into
this public Warpkeep GitHub repository and official `warpkeep.com` Pages
runtime plus the bounded Balanced/Compact metadata correction only. The bases
remain
`LicenseRef-Warpkeep-Provenance-Required`; supply and integration do not create
a public open licence, general third-party derivative/redistribution authority,
trademark or canonical-identity rights, or permission to substitute same-named
files.

## Required release evidence

Before protected-main release, the exact candidate must pass:

- runtime-asset integrity, file-size policy, and licence/provenance checks;
- castle-record alpha/integrity checks and foundation-label, PFP fallback,
  sanitized-record, keyboard, and responsive CSS/component regressions;
- the complete root test suite, typecheck, ordinary production build, and
  canonical `DEPLOY_BASE=/` Pages build;
- real Meshopt decode, instancing, canvas picking, cleanup, and three-tier LOD
  coverage for both castle and matching base, including exact transform parity,
  base/castle readiness-count parity, conservative culling, and legacy
  contact-shadow suppression; and
- the bounded rendered-WebGL and source-reference comparison lanes, with any
  accepted native silhouette difference described rather than hidden.

The public menu build stamp remains the exact deployment coordinate. An
annotated `v0.3.5` tag and GitHub Release are created only after the matching
protected-main commit is deployed and its public build stamp is verified.
