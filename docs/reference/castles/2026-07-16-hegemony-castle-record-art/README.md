# Hegemony castle record art

This record identifies the supplied 2D castle artwork and the exact transparent
WebP used by the Alpha 0.3.5 castle inspection card. The two original attachment
images and the chroma-key intermediate remain outside the repository; hashes,
dimensions, and the complete bounded transformation are retained here.

On 16 July 2026 the Warpkeep project owner instructed the PR #40 work to clean
the supplied UI art, remove its background, and deploy the result in Warpkeep.
That is sufficient for this exact project-internal runtime use. It is not proof
of underlying ownership, a public open-content licence, or a general derivative
or redistribution grant.

## Runtime output

| File | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `public/images/realm/hegemony-castle-record.webp` | 1254×1254 | 145,416 | `30e0c3cd1bbc4732bb5025a78a5dc0cc66bc01c1b752a3f21b48fb429cc11123` |

The high-resolution supplied render was edited onto a flat green field with the
castle design and angle held fixed. A recorded soft chroma matte then removed
that field, contracted one pixel, feathered 0.35 pixels, and despilled the edge.
The decoded result contains 889,605 fully transparent, 15,358 partially
transparent, and 667,553 opaque pixels. Its alpha-16 visible bounds are
`x=129..1089`, `y=25..1166`, leaving transparent breathing room around every
spire and battlement.

The browser requests the asset only when a castle record is opened. It is
decorative (`alt=""`), same-origin, exact-hash pinned, and never treated as a
source of castle authority or gameplay data. See [`manifest.json`](manifest.json)
for the exact input hashes, generation prompt, cleanup parameters, decoded-pixel
hash, and authorisation boundary.
