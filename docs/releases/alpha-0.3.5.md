# Warpkeep Alpha 0.3.5 — GameReady Castle LOD Refresh

**Status: Pages-only Alpha 0.3.5 candidate. It becomes a verified public
release only after protected-main deployment and exact-build verification.
No Worker, Durable Object, SpacetimeDB, admission, profile, world, castle,
wallet, Marks, scan, or burn operation is part of this release.**

Alpha 0.3.5 refreshes the Realm's three Hegemony Main Castle runtime models
without changing player authority or the canonical Genesis 001 world. The High,
Balanced, and Compact profiles now use the GameReady family prepared from three
exact owner-supplied inputs approved for Warpkeep's internal runtime
integration.

## Release scope

This release changes the checked-in browser GLBs, their exact integrity and
profile metadata, player-visible release truth, and the documentation needed to
recover and review that runtime boundary. It does not authorize or perform:

- a Cloudflare Worker deployment or Durable Object migration;
- a SpacetimeDB module or schema publication;
- profile refresh, admission, founding, world, castle, wallet, or Marks
  mutation; or
- any public relicensing, general redistribution grant, or derivative authority
  beyond the recorded atlas-size metadata correction.

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

## Visual boundary

This is a geometry and encoding refresh, not a lighting or surface-brightness
claim. The GameReady files do not by themselves brighten the castle material;
High retains the prior High base-colour and normal atlas bytes, while the other
tiers retain the same overall dark-stone material direction. Realm lighting,
terrain colour, grounding, fog, and any future authorised surface calibration
remain separate measured work under the Realm readability plan.

## Integrity and provenance

Each browser request remains same-origin, exact-length bounded, and SHA-256
verified before parsing. Repository checks pin the reviewed GLB structure,
geometry counts, transforms, actual embedded-image dimensions, and image/file
digests. A malformed, substituted, truncated, or expanded file fails closed to
the canonical illustrated Realm fallback.

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
- the complete root test suite, typecheck, ordinary production build, and
  canonical `DEPLOY_BASE=/` Pages build;
- real Meshopt decode, instancing, canvas picking, cleanup, and three-tier LOD
  coverage; and
- the bounded rendered-WebGL and source-reference comparison lanes, with any
  accepted native silhouette difference described rather than hidden.

The public menu build stamp remains the exact deployment coordinate. An
annotated `v0.3.5` tag and GitHub Release are created only after the matching
protected-main commit is deployed and its public build stamp is verified.
