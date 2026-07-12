# Hegemony Frontier Keep — Source Archive and Runtime Derivative

Ael-supplied GLB source archive for Warpkeep Hegemony castle art direction and the derived public Realm landmark.

## Provenance

- **Source:** Discord attachment supplied by Ael
- **Source message:** [`1525459351110680616`](https://discord.com/channels/1483857530282053754/1524505797797744742/1525459351110680616)
- **Original filename:** `Meshy_AI_Hegemony_Frontier_Kee_0711104905_image-to-3d-texture.glb`
- **Archive date:** 2026-07-11
- **Integrity:** SHA-256 `fd31cd99ce2c81a3bb149915954ee72009f1db0ebb8a9e972747e21294d5986d`; 63,263,296 bytes

## Technical summary

- GLB / glTF 2.0 binary model
- Container generator metadata: `pygltflib@v1.16.5`
- One scene, one node, one mesh, one primitive, and one material
- Four embedded textures/images
- 534,919 POSITION vertices
- No animations or cameras
- Position bounds: `[-0.950408, -0.679886, -0.665247]` to `[0.948223, 0.674411, 0.663394]`

## Runtime derivatives

The original archive is intentionally **not** loaded by the runtime. Two optimized derivatives are available, and the selected Realm quality profile fetches exactly one only after an authenticated player enters the Realm:

| Profile | Runtime file | Bytes | Triangles | Uploaded vertices | Textures | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| High | [`hegemony-frontier-keep-high.glb`](../../../../public/models/hegemony/hegemony-frontier-keep-high.glb) | 2,256,092 | 56,466 | 55,704 | four 2048×2048 WebP maps | `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c` |
| Compact | [`hegemony-frontier-keep-compact.glb`](../../../../public/models/hegemony/hegemony-frontier-keep-compact.glb) | 760,916 | 17,536 | 24,766 | four 1024×1024 WebP maps | `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b` |

Both models contain one mesh, one primitive, one material, and base-color, metallic-roughness, normal, and restrained emissive maps. They require `EXT_meshopt_compression`, `EXT_texture_webp`, and `KHR_mesh_quantization`. High quality uses the 2K/56K-triangle derivative; compact and reduced quality use the 1K/17K-triangle derivative.

`loadHegemonyKeep` dynamically imports `GLTFLoader` and the Meshopt decoder, chooses the quality-appropriate URL beneath Vite's active `BASE_URL`, generates no duplicate fetch, and normalizes the model to a 1.48-unit footprint. The keep's closed gate faces `+Z` at yaw `0`, toward the default strategy camera. Its lowest foundation point is grounded to the placement surface and its horizontal bounds are centered before placement. The title, menu, and authentication flow never fetch either model.

## Reproducible preparation

Run the checked-in development script from the repository root:

```sh
npm run prepare:hegemony-keep
```

The script pins `@gltf-transform/cli` 4.4.1, verifies the untouched source hash and byte length, builds both outputs in a temporary directory, generates MikkTSpace tangents, applies high-level Meshopt compression and 14/10/12-bit position/normal/UV quantization, validates the outputs, and checks their exact bytes, hashes, triangle counts, uploaded vertex counts, image counts, and required extensions before copying them into `public/models/hegemony/`.

High uses a `0.06` simplification ratio, `0.008` simplification error, and 2048-pixel texture cap. Compact uses `0.018`, `0.018`, and 1024 pixels. Both use WebP textures plus flatten, join, weld, and prune transforms. The exact arguments and expected hashes are recorded in [`scripts/prepare-hegemony-frontier-keep.mjs`](../../../../scripts/prepare-hegemony-frontier-keep.mjs) and [`manifest.json`](manifest.json).

The source normal map does not include authored tangents. Generating MikkTSpace tangents removes the glTF validator's generated-tangent-space warning and gives the close camera a stable normal-map basis.

## Archive boundary

The unchanged original GLB is preserved byte-for-byte. No preview render, conversion, recompression, or metadata stripping was applied.

This is project-provided reference media with preserved provenance. The archive does not independently establish ownership or a future license for the source or generated derivatives. See [`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md).
