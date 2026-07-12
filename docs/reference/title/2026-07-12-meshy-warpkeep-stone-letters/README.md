# Warpkeep Stone-Letter 3D Models

Byte-for-byte archive of the six Meshy-generated stone-letter GLB models supplied by Ael for the unique glyphs in **WARPKEEP**. Repeated `P` and `E` characters can reuse their corresponding model; no duplicate source file is stored.

## Provenance

- **Source:** six original files supplied by Ael with explicit v0.3 archive and licensing authorization
- **Archive date:** 2026-07-12
- **Generation service:** Meshy AI, as identified by the original filenames
- **Preservation:** original basenames and bytes retained exactly
- **Purpose:** reference/source archive only; none of these files is a runtime dependency

Ael explicitly authorized these new project assets for the Warpkeep v0.3 licensing policy. Private workflow metadata is intentionally omitted from the public archive. The archive is staged on the v0.3 licensing stack and must not be merged into `main` or any v0.2.x release line. Merge only at or after the first v0.3.0 licensing cutover.

## Visual summary

The six models are distinct `W`, `A`, `R`, `P`, `K`, and `E` glyphs with ivory cracked-stone faces, gilded bevels, and purple gem or inlay accents. A local Three.js contact-sheet render loaded every GLB and texture successfully; no blank model, missing texture, mislabeled glyph, clipping, or obvious corruption was observed. The temporary preview was not committed.

## Files

| Glyph | Original filename | Bytes | Triangles | POSITION vertices | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| W | `Meshy_AI_Warpkeep_W_Stone_Lett_0712102109_image-to-3d-texture.glb` | 52,968,424 | 636,046 | 328,333 | `61b887ddcc2e025b3d9b0b4e67fc51b30e0d6a4b11d474758c412d08b2330814` |
| A | `Meshy_AI_Warpkeep_A_Stone_Lett_0712102720_image-to-3d-texture.glb` | 40,650,392 | 282,732 | 146,750 | `498031fb8b94520e6e3cf58e8451dce7791f59acd31fcd3e6eb86dbe3090eb6e` |
| R | `Meshy_AI_Warpkeep_R_Stone_Lett_0712103530_image-to-3d-texture.glb` | 50,589,156 | 574,388 | 298,455 | `8bb7ad7410cec4404765723a2dafd9e617a8454e39714a2391671941c51c4556` |
| P | `Meshy_AI_Warpkeep_P_Stone_Lett_0712104246_image-to-3d-texture.glb` | 38,240,900 | 221,106 | 114,342 | `0a1dae8ec89c26bfdda3fed489955bcd621206b5e3df40d03cca507b690df2fd` |
| K | `Meshy_AI_Warpkeep_K_Stone_Lett_0712104959_image-to-3d-texture.glb` | 43,528,656 | 436,726 | 226,890 | `15f1471a96f7050b9cf373550abac8b5af918806da047a832927fabba7ab6ae4` |
| E | `Meshy_AI_Warpkeep_E_Stone_Lett_0712105549_image-to-3d-texture.glb` | 38,881,292 | 251,822 | 131,541 | `2038848ba8f2de6c328f6e53106adf6bd172197db716c457b02489bddee2de36` |

**Aggregate:** six unique files, 264,858,820 bytes, 2,402,820 triangles, and 1,246,311 POSITION vertices.

## Technical summary

Every file is a self-contained GLB / glTF 2.0 model generated with `pygltflib@v1.16.5`. Each contains one scene, one node, one mesh, one primitive, one PBR material, and four embedded JPEG textures:

- 4096×4096 base color
- 2048×2048 metallic-roughness
- 4096×4096 normal
- 2048×2048 emissive

There are no animations, cameras, external textures, or required glTF extensions. `@gltf-transform/cli` 4.4.1 validation reports zero errors for all six files. Each source has the same non-blocking generated-tangent-space warning and default-node-matrix information notice; the exact codes and per-file bounds are recorded in [`manifest.json`](manifest.json).

## v0.3 license and attribution

These six project-owned creative assets are licensed for Warpkeep v0.3.0 and later under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (`CC-BY-4.0`). Suggested credit:

> “Warpkeep stone-letter 3D models” by the Warpkeep project, licensed under CC BY 4.0.

The grant applies to copyright and related rights controlled by Warpkeep. It does not license Meshy AI software, services, names, or trademarks, any other third-party rights, or Warpkeep trademarks and canonical identity. See [`ATTRIBUTION.md`](ATTRIBUTION.md), [`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md), and [`../../../../LICENSING.md`](../../../../LICENSING.md).

## Archive boundary

The original GLBs are preserved unchanged. No optimization, conversion, texture recompression, metadata stripping, runtime export, or committed preview was performed.
