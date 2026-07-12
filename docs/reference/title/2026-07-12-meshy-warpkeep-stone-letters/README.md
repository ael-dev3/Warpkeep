# Warpkeep Stone-Letter 3D Models and Title Assemblies

Byte-for-byte archive of the six Meshy-generated stone-letter source GLBs supplied by Ael for the unique glyphs in **WARPKEEP**, plus the subsequently supplied high/compact optimized title assemblies and their complete support bundle. Repeated `P` and `E` characters reuse their corresponding meshes in the assembled files.

## Provenance

- **Source:** six original glyph files and one supplemental optimized-title package supplied by Ael with explicit v0.3 archive and licensing authorization
- **Archive date:** 2026-07-12
- **Generation service:** Meshy AI, as identified by the original glyph filenames
- **Preservation:** original basenames and bytes retained exactly
- **Purpose:** source/reference archive and optimized runtime-candidate preservation; none of these files is currently a runtime dependency

Ael explicitly authorized this named asset set for the Warpkeep v0.3 licensing policy. Private workflow metadata is intentionally omitted from the public archive. The archive is staged on the v0.3 licensing stack and must not be merged into `main` or any v0.2.x release line. Merge only at or after the first v0.3.0 licensing cutover.

## Visual summary

The six source models are distinct `W`, `A`, `R`, `P`, `K`, and `E` glyphs with ivory cracked-stone faces, gilded bevels, and purple gem or inlay accents. The supplied high and compact assemblies present all eight WARPKEEP letters in one centered row, with the second P and E reusing their original meshes.

Local inspection of the supplied source/high/compact contact sheets and three assembled-title previews found no blank model, missing texture, mislabeled glyph, clipping, or obvious corruption. The supplied preview files are preserved in the archive; no new review render was committed.

## Unique source glyphs

| Glyph | Original filename | Bytes | Triangles | POSITION vertices | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| W | `Meshy_AI_Warpkeep_W_Stone_Lett_0712102109_image-to-3d-texture.glb` | 52,968,424 | 636,046 | 328,333 | `61b887ddcc2e025b3d9b0b4e67fc51b30e0d6a4b11d474758c412d08b2330814` |
| A | `Meshy_AI_Warpkeep_A_Stone_Lett_0712102720_image-to-3d-texture.glb` | 40,650,392 | 282,732 | 146,750 | `498031fb8b94520e6e3cf58e8451dce7791f59acd31fcd3e6eb86dbe3090eb6e` |
| R | `Meshy_AI_Warpkeep_R_Stone_Lett_0712103530_image-to-3d-texture.glb` | 50,589,156 | 574,388 | 298,455 | `8bb7ad7410cec4404765723a2dafd9e617a8454e39714a2391671941c51c4556` |
| P | `Meshy_AI_Warpkeep_P_Stone_Lett_0712104246_image-to-3d-texture.glb` | 38,240,900 | 221,106 | 114,342 | `0a1dae8ec89c26bfdda3fed489955bcd621206b5e3df40d03cca507b690df2fd` |
| K | `Meshy_AI_Warpkeep_K_Stone_Lett_0712104959_image-to-3d-texture.glb` | 43,528,656 | 436,726 | 226,890 | `15f1471a96f7050b9cf373550abac8b5af918806da047a832927fabba7ab6ae4` |
| E | `Meshy_AI_Warpkeep_E_Stone_Lett_0712105549_image-to-3d-texture.glb` | 38,881,292 | 251,822 | 131,541 | `2038848ba8f2de6c328f6e53106adf6bd172197db716c457b02489bddee2de36` |

**Source aggregate:** six unique files, 264,858,820 bytes, 2,402,820 triangles, and 1,246,311 POSITION vertices.

Every source file is a self-contained GLB / glTF 2.0 model generated with `pygltflib@v1.16.5`. Each contains one scene, one node, one mesh, one primitive, one PBR material, and four embedded JPEG textures. There are no animations, cameras, external textures, or required glTF extensions. `@gltf-transform/cli` 4.4.1 reports zero errors for all six, with the same non-blocking generated-tangent-space warning and default-node-matrix information notice recorded in [`manifest.json`](manifest.json).

## Optimized high and compact assemblies

| Profile | Bytes | Unique triangles | Rendered triangles | POSITION vertices | Embedded textures | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| High | 3,844,364 | 288,328 | 345,078 | 186,285 | 20 WebP, 1024×1024 | `2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5` |
| Compact | 1,714,060 | 132,136 | 158,146 | 95,073 | 20 WebP, 512×512 | `d29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8` |

Both assemblies contain one `WarpkeepTitleRoot`, eight named letter nodes, six reusable meshes/materials, and no external URI dependencies. Their final normalized-quantized world bounds match the supplied layout records at approximately 13.6554 wide × 1.9001 high × 0.5001 deep. They use `EXT_meshopt_compression`, `EXT_texture_webp`, and `KHR_mesh_quantization`.

`@gltf-transform/cli` 4.4.1 reports zero errors and zero warnings for both. Its only information notice is that the validator does not inspect `EXT_meshopt_compression`. Complete technical records, exact ZIP contents, support-file hashes, and layout parity are in [`manifest.json`](manifest.json) and [`optimized-title-assemblies/`](optimized-title-assemblies/).

## v0.3 license and attribution

This named source-and-assembly asset set is licensed for Warpkeep v0.3.0 and later under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (`CC-BY-4.0`). Suggested credit:

> “Warpkeep stone-letter 3D models and title assemblies” by the Warpkeep project, licensed under CC BY 4.0.

The grant applies to copyright and related rights controlled by Warpkeep. It does not license Meshy AI or other generation software, services, names, or trademarks, any other third-party rights, or Warpkeep trademarks and canonical identity. See [`ATTRIBUTION.md`](ATTRIBUTION.md), [`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md), and [`../../../../LICENSING.md`](../../../../LICENSING.md).

## Archive boundary

The six source GLBs and all supplied supplemental files are preserved unchanged. The high and compact files arrived already optimized; this archive performed no additional optimization, conversion, texture recompression, metadata stripping, or runtime integration. Archival does not authorize replacing or modifying the live title implementation.
