# Hegemony Wheat Farm inspection art

This record identifies the supplied Wheat Farm artwork and the exact transparent
WebP prepared for the reviewed Food Farm inspector. The original attachment,
the image-generation edit, and the alpha-matte intermediate remain outside the
repository; their hashes, dimensions, and the complete bounded transformation
are retained in [`manifest.json`](manifest.json).

On 18 July 2026, the Warpkeep project owner instructed PR #57 to polish the
supplied Wheat Farm visual into a transparent, high-resolution inspection image
and prepare the matching card treatment. That authorization covers this exact
checked-in derivative in the public Warpkeep GitHub repository and an eventual
official `warpkeep.com` Pages runtime only after separately approved deployment.
It is use authorization only, not deployment approval; it does not prove
underlying ownership, create a public open-content licence, or grant general
derivative, redistribution, trademark, or canonical-identity rights.

## Runtime output

| File | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `public/images/realm/hegemony-wheat-farm-record.webp` | 1254×1254 | 224,806 | `466c80380a8d23de043731a7c386e78c9b36a2d2e69fa175db4b87efc3f43eb0` |

The rendered Farm was placed on a flat `#ff00ff` chroma field, then a recorded
hard chroma matte removed that field with no feather. A bounded residual-magenta
cleanup removed 198 keyed pixels from the output. The decoded result has
853,604 fully transparent, zero partially transparent, and 718,912 opaque
pixels. Its alpha-16 visible bounds are `x=23..1181`, `y=70..1142`, leaving
transparent breathing room around the windmill, wheat, cart, and ground-base
silhouette.

`FoodFarmInspectionPanel` displays this image as decorative, same-origin art
with a pointer-inert local art stage that rises slightly above the card edge.
It is deliberately mounted only by the live integration when a
validated public Food site is selected. It creates no map target, balance,
gathering authority, or deployment approval. The 2D card does not promote the
separate 3D Wheat Farm runtime assets into collision, placement, or economic
authority.
