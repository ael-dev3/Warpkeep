# Hegemony Castle Landscape Base — GameReady Runtime Record

This record identifies the exact owner-supplied `Warpkeep Castle Landscape
Base` package accepted for the landscape under every active Hegemony Main
Castle LOD, the bounded metadata correction applied during installation, and
the exact checked-in outputs. The source package, previews, QA files, and
authoring `.blend` are not browser dependencies and are not reproduced here;
the browser serves only the integrity-verified GLBs under
`public/models/hegemony/`.

## Supplied package

- **Asset ID:** `warpkeep.castle-landscape-base`
- **Package version:** `1.0.0`
- **Package creation date:** 2026-07-16
- **Package manifest:** `asset-manifest.json` — 2,177 bytes, SHA-256
  `106d64f5eaf91332acc83c18d5abbd9ad230b17eb4c9ffee1231ecf7d595d3f5`
- **Package instructions:** `README.md` — 2,720 bytes, SHA-256
  `b4d5b39bdb0f33eda0c183e0b071c6483befc850cea5c0131abec7384556c8c9`
- **Coordinate contract:** glTF `+Y` up, castle ground at `Y=0`, road facing
  `+Z`
- **Attachment contract:** castle and base use the exact same parent position,
  quaternion, and uniform scale

The package and personal filesystem location are deliberately not copied into
this record. Exact package-relative paths, byte counts, and hashes define the
accepted input boundary. The supplied source `.blend`, QA reports, and previews
remain package evidence rather than repository/runtime dependencies.

## Authorization boundary

On 2026-07-16, the Warpkeep project owner supplied these exact three GameReady
inputs and explicitly instructed PR #40 to add the bases under the game's
castles and deploy the patch. That direction authorizes integration of this
exact family into this public Warpkeep GitHub repository and its official
`warpkeep.com` Pages runtime, plus the bounded deterministic atlas-metadata
correction below.

It does not create a separate public open license, relicense the inputs or
outputs as CC-BY-4.0 or Apache-2.0, grant general third-party derivative or
redistribution permission, grant trademark or canonical-identity rights, or
authorize substitution of a same-named package. The inputs and outputs remain
classified as `LicenseRef-Warpkeep-Provenance-Required`; broader use requires
separate documented authority.

## Exact authorized inputs

| Profile | Package-relative input | Bytes | Triangles | POSITION entries | Index type | Actual embedded atlas | GLB `wk_atlas_size` | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| High | `Runtime/Warpkeep_Castle_LandscapeBase_LOD0_High_Runtime.glb` | 214,372 | 3,954 | 10,681 | unsigned 16-bit | 1024×1024 | 1024 | `be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c` |
| Balanced | `Runtime/Warpkeep_Castle_LandscapeBase_LOD1_Balanced_Runtime.glb` | 92,792 | 2,138 | 5,611 | unsigned 16-bit | 512×512 | 1024 | `5f4e3c52336c78414b5370b63a5e4b924a773297092430eb6f4773bc094eb5cf` |
| Compact | `Runtime/Warpkeep_Castle_LandscapeBase_LOD2_Compact_Runtime.glb` | 27,336 | 714 | 1,780 | unsigned 16-bit | 256×256 | 1024 | `ebaf6c6cef216b92de86aa49ea2d612d63227210858b7427fa0c7e97a81323dc` |

The package manifest correctly declares the intended 1024, 512, and 256
texture targets. The discrepancy is confined to
`materials[0].extras.wk_atlas_size` inside the Balanced and Compact GLBs.

## Bounded deterministic correction

High requires no correction and is installed byte-for-byte. Balanced and
Compact already contain the correct embedded WebP payloads but declare the
generic atlas value 1024. The installer rewrites only that material metadata to
512 or 256 and performs the necessary deterministic GLB JSON/BIN padding and
offset repacking.

The correction does not alter geometry, transforms, images, UVs, colors,
brightness, normals, or authored placement. Every geometry and embedded-image
payload byte remains unchanged. The corrected byte counts and hashes therefore
identify container/metadata normalization rather than a visual derivative.

## Active runtime outputs

| Profile | Runtime file | Bytes | Triangles | POSITION entries | Embedded images | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| High | [`hegemony-castle-landscape-base-high-be79476bee4e1f34.glb`](../../../../public/models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb) | 214,372 | 3,954 | 10,681 | two 1024×1024 WebPs | `be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c` |
| Balanced | [`hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb`](../../../../public/models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb) | 92,784 | 2,138 | 5,611 | two 512×512 WebPs | `179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f` |
| Compact | [`hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb`](../../../../public/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb) | 27,328 | 714 | 1,780 | two 256×256 WebPs | `f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3` |

Every output is a glTF 2.0 binary generated by glTF-Transform 4.4.1 with one
scene, node, mesh, primitive, material, and two embedded WebP images. There are
no animations. Each requires `EXT_meshopt_compression`, `EXT_texture_webp`, and
`KHR_mesh_quantization`; `KHR_materials_specular` remains optional.

The exact embedded-image payloads are also pinned:

| Profile | Role | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| High | normal | 95,098 | `ee821457dcc3efba733e9176dac35f4bd07916c1f613a89175788f9b2817181d` |
| High | base color | 29,586 | `92918cb1e221b75ee11af809b1e99b3fb5f60b4342f0dbea68b65135e241dc65` |
| Balanced | normal | 29,544 | `439351b1cc2f84f988bfeb5b492a9c6652c74741bed29ce17fd7e45c222f99f0` |
| Balanced | base color | 10,130 | `3714349aed5b0f7225807674f4719a79f5fd09e25a5cb108f5cc46a4767dc86f` |
| Compact | normal | 2,900 | `39bb781d03fe4f134532846750e7f387891c053703e90ce28e150d5a568ef29f` |
| Compact | base color | 2,460 | `80d914be77fd5dde0fc330091ae35d366a6497d1982f1b75dc7b43920526924d` |

## Placement and renderer contract

The base is a child of the same normalized castle assembly. It receives the
castle's exact parent position, quaternion, and uniform scale. It must never be
independently centered, normalized, grounded, or scaled from its own bounds.
Its below-ground skirt is intentional, and its road/gate direction is `+Z`.
The castle footprint and height continue to own LOD selection, camera focus,
and the honest username-foundation anchor; composite castle-plus-base bounds
exist only for conservative rendering and culling.

After castle-derived normalization, the base occupies approximately 2.056
world units across X, 1.705 across Z, and 0.259 vertically, with its lower edge
near `Y=-0.049`, and its outer geometry reaches about 1.06 units from the shared
origin. A 1.08 level terrain footprint supports the complete island before a
short blend reaches natural relief at radius 1.22. Decoration clearance uses
the same 1.22 outer radius. Bounded neighboring-cell lookup preserves local
sampling even though the foundation crosses its owning hex boundary.

The immutable manifest in this directory records the Alpha 0.3.5 import-time
foundation values (`0.62`/`0.78`) and original decoration clearance (`1.08`).
Alpha 0.3.6 applies the later renderer-only `1.08`/`1.22` support and `1.22`
clearance described above; that revision does not rewrite the historical
asset-ingest record or any authoritative terrain row.

Because the authored island supplies physical contact and grounding, the old
synthetic contact-shadow instance is suppressed whenever the complete base LOD
family is ready. Picking compares the nearest valid castle-geometry and simple
non-rendered base-collider hits; it never raycasts decorative base triangles.
Failure of either half of an LOD assembly fails the whole family closed to the
canonical illustrated Realm fallback; a stale base may not count as a
presented castle.

## Profile budgets

All three base outputs add 334,484 checked-in bytes. Castle plus base residency
across all LOD files is 3,896,872 bytes. At 100 visible castles, the profile
ceilings become:

| Graphics profile | Added base triangles | Castle-plus-base triangle ceiling | Added instanced model draws |
| --- | ---: | ---: | ---: |
| Cinematic / High | 131,496 | 2,667,272 | up to 3 |
| Balanced | 105,576 | 2,196,408 | up to 2 |
| Performance / Reduced | 71,400 | 1,794,600 | 1 |

The shared texture families contribute approximately 10.5 MiB of decoded
resident image data before mipmaps; they are shared once per resident LOD, not
once per castle. These budgets replace the old contact-shadow draw rather than
adding it, and they do not infer GPU memory from compressed GLB sizes.

## Exact installation

From the repository root, point the dedicated installer at an authorized exact
copy of the package and verify the complete family:

```sh
WARPKEEP_CASTLE_BASE_GAMEREADY_ROOT=/trusted/offline/game-ready-base-package \
  npm run prepare:hegemony-castle-base
npm run verify:runtime-assets
```

The installer accepts only the exact package identity and all three exact input
hashes, rejects symlink leaves or ancestors and non-regular files, and validates
every normalized output before installation. It then stages and verifies the
complete family on the destination filesystem, atomically replaces each runtime
path without truncating an existing inode, verifies every installed byte, and
rolls the entire family back if any caught in-process replacement or
post-install check fails. Existing destination bytes are pinned at preflight and
rechecked immediately before replacement, so even a same-size mutation fails
closed. A stale `.warpkeep-family-install-*` transaction blocks both another
installation and the runtime-asset verification performed by the production
build; exact runtime hashes independently reject a mixed family.
Ordinary builds do not read the source package or perform network access.
Machine-readable values are retained in [`manifest.json`](manifest.json).

This bounded transaction is not a crash journal. It does not automatically
recover from process termination, kernel failure, or power loss, and it cannot
make a concurrent ancestor-directory swap safe without `openat`-style directory
handles. The source package and runtime destination must therefore remain on
trusted, exclusively controlled local paths for the entire operation. Any
surviving transaction evidence is left in place for explicit operator recovery
rather than guessed at or silently deleted.
