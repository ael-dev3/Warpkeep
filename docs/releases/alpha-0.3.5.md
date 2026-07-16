# Warpkeep Alpha 0.3.5 — GameReady Castle LOD Refresh

**Status: Pages-only Alpha 0.3.5 candidate. It becomes a verified public
release only after protected-main deployment and exact-build verification.
No Worker, Durable Object, SpacetimeDB, admission, profile, world, castle,
wallet, Marks, scan, or burn operation is part of this release.**

Alpha 0.3.5 refreshes the Realm's three Hegemony Main Castle runtime models and
the player-facing identity presentation around them without changing player
authority or the canonical Genesis 001 world. The High, Balanced, and Compact
profiles use the GameReady family prepared from three exact owner-supplied
inputs approved for Warpkeep's internal runtime integration. Foundation-bound
username rails and a responsive Farcaster castle record keep identity readable
without pretending that new gameplay state exists.

## Release scope

This release changes the checked-in browser GLBs, their exact integrity and
profile metadata, one same-origin decorative castle-record image, the Realm
label and record presentation, player-visible release truth, and the
documentation needed to recover and review those runtime boundaries. It does
not authorize or perform:

- a Cloudflare Worker deployment or Durable Object migration;
- a SpacetimeDB module or schema publication;
- profile refresh, admission, founding, world, castle, wallet, or Marks
  mutation; or
- any public relicensing or general redistribution grant. The only recorded
  derivative authority is the bounded GLB atlas-size metadata correction and
  the exact project-internal background cleanup for the castle-record artwork;
  neither exception grants broader derivative or redistribution rights.

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

Click, tap, Enter/Space, canvas picking, and navigator activation retain the
existing selection boundary and open a responsive record rather than a new
gameplay surface. The record may show only already-sanitized public
presentation data and existing public castle fields: the castle name and
level, coordinates, a valid founded date, canonical username, trusted display
name and biography, and community Marks fields only when their existing public
visibility flag is true. The Farcaster profile link is derived only from a
validated canonical username and is absent in the observer fixture.

A safe HTTPS Farcaster PFP is decoded into a bounded static canvas snapshot. A
missing, rejected, or failed portrait falls back to the sanitized public-name
initial, then the Warpkeep `W`; the record does not depend on a remote image to
remain readable. Alpha 0.3.5 does not invent durability, alliance, combat
status, coordinates outside the existing castle record, or destructive action
state to imitate the visual reference.

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

The owner's 16 July instruction authorizes this exact project-internal PR #40
runtime use. The dated provenance record retains both source hashes, the edit
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

## Integrity and provenance

Each GameReady GLB browser request remains same-origin, exact-length bounded,
and SHA-256 verified before parsing. Repository checks pin the reviewed GLB
structure, geometry counts, transforms, actual embedded-image dimensions, and
image/file digests. A malformed, substituted, truncated, or expanded GLB fails
closed to the canonical illustrated Realm fallback. The decorative WebP has a
separate build-time exact-length/hash and decoded-alpha contract; if its normal
`<img>` load or decode fails, the styled record hero remains without treating
the artwork as Realm state or authority.

On 16 July 2026 the project owner authorised project-internal runtime
integration of the exact High, Balanced, and Compact GameReady inputs and the
bounded atlas-size metadata correction needed for Balanced and Compact. That
instruction is not a separate open licence, a broader third-party derivative or
redistribution grant, general regeneration authority, or a trademark or
canonical-identity grant. The previous public-source preparation pipeline and
its Alpha 0.3.4 outputs remain historical evidence rather than a recipe for
silently overwriting this active set.

## Required release evidence

Before protected-main release, the exact candidate must pass:

- runtime-asset integrity, file-size policy, and licence/provenance checks;
- castle-record alpha/integrity checks and foundation-label, PFP fallback,
  sanitized-record, keyboard, and responsive CSS/component regressions;
- the complete root test suite, typecheck, ordinary production build, and
  canonical `DEPLOY_BASE=/` Pages build;
- real Meshopt decode, instancing, canvas picking, cleanup, and three-tier LOD
  coverage; and
- the bounded rendered-WebGL and source-reference comparison lanes, with any
  accepted native silhouette difference described rather than hidden.

The public menu build stamp remains the exact deployment coordinate. An
annotated `v0.3.5` tag and GitHub Release are created only after the matching
protected-main commit is deployed and its public build stamp is verified.
