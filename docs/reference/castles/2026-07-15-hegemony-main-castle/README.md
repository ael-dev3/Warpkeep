# Hegemony Main Castle — Public Source Record and Project-Internal Runtime Derivatives

This record identifies the public source archive for Warpkeep's active
Hegemony Main Castle and the exact browser-runtime derivatives prepared from
it. The source archive is not copied into this repository; the browser serves
only the integrity-verified GLBs committed under `public/models/hegemony/`.

## Public source record

- **Asset repository:** [`ael-dev3/Warpkeep-Assets`](https://github.com/ael-dev3/Warpkeep-Assets)
- **Asset-repository commit:** `0cd2d506c352885850fc15759603baccbad669e7`
- **Source introduction commit:** `9963722765c7935391d85d943b3c4f0163f0c5a8`
- **Release:** [`hegemony-frontier-keep-3d-2026-07-14`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/hegemony-frontier-keep-3d-2026-07-14)
- **Release attachment:** [`hegemony-frontier-keep-3d-sources-v1.zip`](https://github.com/ael-dev3/Warpkeep-Assets/releases/download/hegemony-frontier-keep-3d-2026-07-14/hegemony-frontier-keep-3d-sources-v1.zip)
  — 10,672,929 bytes, SHA-256
  `c029a636ee0a791ca54072d5f32fcf68263677951fd59c338dfe242264335d5f`
- **Exact source member:** `hegemony-frontier-keep-3d-sources-v1/HegemonyMainCastle.glb`
  — 2,233,564 bytes, SHA-256
  `b33755f14bbed0855cf738ba8fb2dbdde9cf56e976b7f108a2259dd478a9b580`

The source is a glTF 2.0 binary with one scene, node, mesh, primitive, and
material; two embedded 2048×2048 WebP atlas images; 73,070 triangles; 173,299
POSITION vertices; and no animations. It requires
`EXT_meshopt_compression`, `EXT_texture_webp`, and `KHR_mesh_quantization`.
Its source-space bounds are `[-6.41045, 0, -4.93809]` to
`[6.41045, 14.062, 4.92809]`. The archived metadata identifies the gate as
facing `+Z` at yaw `0`.

## Authorization boundary

On 2026-07-15, the Warpkeep project owner explicitly authorized
**project-internal runtime integration and deterministic derivative
preparation** of this named source. This permits the checked-in runtime workflow
described below; it is not a separate public open-license grant.

In particular, this record does not relicense the source or its derivatives as
CC-BY-4.0 or Apache-2.0, create a general third-party derivative or
redistribution grant, or grant trademark or canonical-identity rights. The
public archive remains recorded as
`public-archive-authorized-no-separate-open-license`. Any broader distribution,
relicensing, or canonical-identity use must have separate documented authority.

## Runtime derivatives

Each output has one mesh, primitive, and material; two embedded, dimension- and
hash-verified WebP images;
and required `EXT_meshopt_compression`, `EXT_texture_webp`, and
`KHR_mesh_quantization` extensions. Sharp performs the explicit atlas resize
before gltfpack simplifies geometry; the High profile preserves the exact
source WebPs, while Balanced and Compact contain genuine 1024×1024 and 512×512
atlases.

| Profile | Runtime file | Bytes | Triangles | Uploaded vertices | Index type | Simplification / embedded texture size | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| High | [`hegemony-main-castle-high.glb`](../../../../public/models/hegemony/hegemony-main-castle-high.glb) | 1,934,920 | 67,680 | 153,439 | unsigned 32-bit | ratio `0.75`, error `0.004`, 2048×2048 | `9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2` |
| Balanced | [`hegemony-main-castle-balanced.glb`](../../../../public/models/hegemony/hegemony-main-castle-balanced.glb) | 1,172,132 | 40,353 | 78,928 | unsigned 32-bit | ratio `0.42`, error `0.012`, 1024×1024 | `aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e` |
| Compact | [`hegemony-main-castle-compact.glb`](../../../../public/models/hegemony/hegemony-main-castle-compact.glb) | 508,508 | 19,086 | 34,098 | unsigned 16-bit | ratio `0.25`, error `0.018`, 512×512 | `de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29` |

The Compact profile preserves the full source height. Its verified source-space
bounds are `[-6.389847983, 0, -4.888312794]` to
`[6.389809055, 14.062000218, 4.928393334]`.

## Reproducible preparation

From the repository root, acquire only the pinned source archive and pinned
native tool, then prepare and verify the output:

```sh
npm run assets:fetch:castle
npm run tools:fetch:gltfpack
npm run prepare:hegemony-castle
npm run verify:runtime-assets
```

The fetch and preparation scripts require the standard `unzip` utility. A
custom fetched tool destination set through `WARPKEEP_GLTFPACK_BIN_CACHE` is
also used automatically by preparation; `WARPKEEP_GLTFPACK_BIN` remains the
higher-priority exact offline executable override.

For an already verified offline archive, point preparation at that exact file:

```sh
WARPKEEP_CASTLE_ARCHIVE=/trusted/offline/hegemony-frontier-keep-3d-sources-v1.zip \
  npm run prepare:hegemony-castle
```

The preparation script verifies the release attachment bytes and SHA-256, safe
ZIP paths and absence of symlinks, exact source-member bytes and SHA-256, an
attested absolute system unzip, checksum-pinned `gltfpack` 1.2, pinned Sharp
0.35.3/libvips 8.18.3/libwebp 1.6.0, complete physical-buffer coverage,
byte-identical Meshopt payload transfer into each resized intermediate, and
every output's bytes, hash, GLB structure, triangle/vertex/index counts, atlas
dimensions, image bytes/hashes, material atlas metadata, and required
extensions. The native optimizer receives a private temp cwd and a minimal
credential-free environment. It writes runtime derivatives only after all
checks succeed. Release attachments are never a browser runtime CDN.

The exact machine-readable values are retained in [`manifest.json`](manifest.json).
