# Hegemony Gold Mine inspection art

This record identifies the supplied Gold Mine artwork and the exact transparent
WebP prepared for the reviewed Gold Mine inspection card. The original attachment,
the image-generation edit, and the chroma-matte intermediate remain outside the
repository; their hashes, dimensions, and the complete bounded transformation
are retained in [`manifest.json`](manifest.json).

On 18 July 2026, the Warpkeep project owner instructed PR #49 to polish the
supplied Gold Mine visual into a transparent high-resolution inspection image
and prepare the matching card treatment. That authorization covers this exact
checked-in derivative in the public Warpkeep GitHub repository and an eventual
official `warpkeep.com` Pages runtime only after separately approved deployment.
It is use authorization only, not deployment approval; it does not prove
underlying ownership, create a public open-content licence, or grant general
derivative, redistribution, trademark, or canonical-identity rights.

## Runtime output

| File | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `public/images/realm/hegemony-gold-mine-record.webp` | 1254×1254 | 218,736 | `a2c52a5e1536860ce3ad778c1719e354637fe473495c45ee927c99f468c60fa3` |

The rendered mine was placed on a flat chroma-green field, then a recorded soft
chroma matte removed the field and despilled the edge. The decoded result has
929,410 fully transparent, 4,354 partially transparent, and 638,752 opaque
pixels. Its alpha-16 visible bounds are `x=36..1181`, `y=22..1180`, leaving
transparent breathing room around the mine, cart, rails, and rock silhouette.

`GoldMineInspectionPanel` displays this image as decorative, same-origin art
with a pointer-inert art stage that rises above the card edge. It is deliberately
mounted only by the reviewed draft integration when a public Gold Mine site is
selected. It creates no map target, balance, gathering authority, or deployment
approval. The 2D card does not promote the separate 3D review candidates under
`runtime-candidates/`.
