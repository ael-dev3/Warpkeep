# Hegemony Logging Camp inspection art

This record identifies the supplied Logging Camp artwork and the exact
transparent WebP prepared for the reviewed Wood-site inspector. The original
attachment and the local alpha-matte intermediate remain outside the repository;
their hashes, dimensions, alpha audit, and bounded transformation are retained
in [`manifest.json`](manifest.json).

On 19 July 2026, the Warpkeep project owner instructed PR #62 to use the
supplied high-resolution Logging Camp visual as a transparent inspection image.
That authorization covers this exact checked-in derivative in the public
Warpkeep GitHub repository and an eventual official `warpkeep.com` Pages
runtime only after separately approved deployment. It is use authorization
only, not merge or deployment approval; it does not prove underlying ownership,
create a public open-content licence, or grant general derivative,
redistribution, trademark, or canonical-identity rights.

## Runtime output

| File | Dimensions | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `public/images/realm/hegemony-logging-camp-record.webp` | 1254×1254 | 177,622 | `fb9d171e423a7bd4bfcce1e68cd3faecb38b4904bc528f720e4283522fca1293` |

The supplied image was an RGB preview with a baked gray/white checkerboard,
not an alpha PNG. A reviewed local foreground matte removed that background
without direct gray-color keying, then the approved alpha PNG was deterministically
encoded as the checked-in WebP. A narrow neutral spill cleanup removes
checkerboard-colored pixels retained at the matte edge. The decoded output has
963,484 fully transparent, 39,058 partially transparent, and 569,974 opaque
pixels. Its alpha-16 visible bounds are `x=34..1217`, `y=154..1006`, preserving breathing
room around the lifting frame, log stack, wagon, and green site base.

`LoggingCampInspectionPanel` displays this image as decorative, same-origin art
with a pointer-inert local art stage that rises slightly above the card edge. It
is mounted only by the reviewed draft integration for a validated public
Wood-site inspector. It creates no map target, balance, gathering authority,
or deployment approval. The 2D card does not promote the separate 3D Logging
Camp runtime assets into collision, placement, or economic authority.
