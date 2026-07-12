# Optimized Warpkeep Title Assemblies

Byte-for-byte preservation of the supplied high and compact **WARPKEEP** title assemblies and their complete support package. These files are archived on the v0.3 licensing stack as optimized runtime candidates; they are **not currently wired into or served by the Warpkeep runtime**.

## Provenance and preservation

- **Supplier and authority:** Ael supplied this named asset set and explicitly requested its archive under the Warpkeep v0.3 licensing terms.
- **Source relationship:** the assemblies combine the six unique W, A, R, P, K, and E stone-letter models in the parent archive.
- **Preservation:** the original ZIP, both standalone GLBs, layouts, checksums, source note, and six preview/contact sheets are byte-for-byte copies of the supplied files.
- **Parity:** both standalone GLBs match the copies inside the ZIP; the three separately supplied full-title previews match their ZIP copies.
- **Private metadata:** communication-platform and attachment metadata is intentionally omitted.

## Models

| Profile | Bytes | Unique triangles | Rendered triangles | POSITION vertices | Embedded textures | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| High | 3,844,364 | 288,328 | 345,078 | 186,285 | 20 WebP, 1024×1024 | `2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5` |
| Compact | 1,714,060 | 132,136 | 158,146 | 95,073 | 20 WebP, 512×512 | `d29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8` |

Each self-contained GLB has one scene, a `WarpkeepTitleRoot`, eight named letter nodes (`W`, `A`, `R`, `P1`, `K`, `E1`, `E2`, `P2`), six meshes, six materials, and no external URI dependency. `P2` reuses the P mesh and `E2` reuses the E mesh. The files use `EXT_meshopt_compression`, `EXT_texture_webp`, and `KHR_mesh_quantization`.

The supplied layout records match the final quantized world bounds: approximately 13.6554 wide × 1.9001 high × 0.5001 deep, centered at X/Z zero with baseline Y zero.

## Validation and visual check

- `@gltf-transform/cli` 4.4.1: zero errors and zero warnings for both GLBs.
- The only information notice is `UNSUPPORTED_EXTENSION` because that validator build does not inspect `EXT_meshopt_compression` itself.
- GLB magic/version/declared length/chunk boundaries, compressed geometry counts, named-node/mesh reuse, embedded WebP headers, layout JSON, and package checksums pass deterministic inspection.
- The supplied source, high, and compact contact sheets show W, A, R, P, K, and E consistently. The three full-title previews show the complete WARPKEEP assembly, including a high-profile angled view. No blank panel, missing texture, clipping, mislabeled glyph, or obvious corruption was observed.

The JPEGs here are supplied source-package evidence, not previews generated during repository review.

## Package contents

- `warpkeep-title-runtime-assets.zip` — untouched original 13-entry bundle, 5,995,634 bytes, SHA-256 `5da0dbd818cfd10a8b9f9b4cce3b81ebf69a4345018204404e847c1c2bf0b357`
- `warpkeep-title-high.glb` and `warpkeep-title-compact.glb`
- high/compact layout JSON records
- original checksum and source-note text files
- three complete-title previews and three source/high/compact contact sheets

Exact per-file hashes, dimensions, technical metadata, package entries, and validator records are in [`../manifest.json`](../manifest.json). `WARPKEEP_TITLE_ASSET_README.txt` is preserved as supplied; this repository README and the parent licensing records define archive status and release boundaries.

## v0.3 license and boundary

This named asset set is licensed for Warpkeep v0.3.0 and later under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (`CC-BY-4.0`). Suggested credit:

> “Warpkeep stone-letter 3D models and title assemblies” by the Warpkeep project, licensed under CC BY 4.0.

The grant applies only to copyright and related rights controlled by Warpkeep. It does not license Meshy AI or other generation software, services, names, or trademarks, other third-party rights, or Warpkeep trademarks and canonical identity.

This archive must remain stacked and unmerged until the first v0.3.0 licensing cutover. It must not enter `main` or a v0.2.x release snapshot before that boundary. Archival does not authorize runtime integration, replacement of the procedural title, optimization, recompression, or deployment.
