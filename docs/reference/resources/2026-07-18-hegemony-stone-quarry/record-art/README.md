# Hegemony Stone Quarry inspection art

This record identifies the supplied Stone Quarry artwork and the exact
high-resolution transparent WebP prepared for the unmounted Stone Quarry
inspection card. The original attachment, image-generation edit, and
chroma-matte intermediate remain outside the repository; their hashes,
dimensions, and complete bounded transformation are retained in
[`manifest.json`](manifest.json).

On 18 July 2026, the Warpkeep project owner supplied the Quarry visual and
instructed draft PR #59 to add a polished high-resolution UI element similar to
the reviewed inspection-art pattern. That authorization covers this exact
checked-in derivative in the public Warpkeep GitHub repository and an eventual
official `warpkeep.com` Pages runtime only after separately approved deployment.
It is use authorization only, not deployment approval; it does not prove
underlying ownership, create a public open-content licence, or grant general
derivative, redistribution, trademark, or canonical-identity rights.

## Runtime output

| File | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `public/images/realm/hegemony-stone-quarry-record.webp` | 1254×1254 | 134,508 | `58725387db6218ccd5f47aea46a22db80161b232e6bb4de6f60c21068efe40fd` |

The rendered Quarry was placed on a flat chroma-green field, then a recorded
soft chroma matte removed the field and despilled the edge. The decoded result
has 1,078,736 fully transparent, 5,760 partially transparent, and 488,020
opaque pixels. Its alpha-16 visible bounds are `x=93..1219`, `y=227..989`,
leaving transparent breathing room around the quarry, hoist, cart, workbench,
and ground silhouette.

`StoneQuarryInspectionPanel` displays this image as decorative, same-origin
art with a pointer-inert art stage that rises above the card edge. Its broad
Quarry silhouette is scaled within the existing responsive inspection shell.
The panel is intentionally not mounted: a Stone-site catalog, map placement,
renderer, server authority, gathering action, balance, reward, and deployment
remain out of scope for this asset-only draft.
