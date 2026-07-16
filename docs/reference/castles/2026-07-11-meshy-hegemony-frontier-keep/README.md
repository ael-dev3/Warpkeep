# Hegemony Frontier Keep — Historical Source and Derivative Record

Ael-supplied GLB source archive for Warpkeep Hegemony castle art direction and
the former Realm landmark. Neither the source nor the former runtime
derivatives is present in the current runtime tree.

## Provenance

- **Source:** Project attachment supplied by Ael
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

## Historical runtime derivatives

The original archive was never loaded by the runtime. Three optimized
derivatives were formerly available; the paths below are historical identifiers,
not links to current files:

| Profile | Runtime file | Bytes | Triangles | Uploaded vertices | Textures | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| High | `hegemony-frontier-keep-high.glb` | 2,256,092 | 56,466 | 55,704 | four 2048×2048 WebP maps | `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c` |
| Balanced | `hegemony-frontier-keep-balanced.glb` | 2,064,100 | 37,634 | 40,632 | four 2048×2048 WebP maps | `bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4` |
| Compact | `hegemony-frontier-keep-compact.glb` | 760,916 | 17,536 | 24,766 | four 1024×1024 WebP maps | `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b` |

All three models contain one mesh, one primitive, one material, and base-color, metallic-roughness, normal, and restrained emissive maps. They require `EXT_meshopt_compression`, `EXT_texture_webp`, and `KHR_mesh_quantization`. Cinematic uses High, normal phones use Balanced, and Performance uses Compact.

The active Realm loader no longer references these paths. The technical notes
below describe the historical implementation only.

## Retired preparation record

The former checked-in generator has been removed. Although it verified final
output hashes, it fetched an unverified CLI, inherited the developer process
environment, and wrote unresolved-rights derivatives directly into `public/`.
Those are unsafe properties for a command described as private historical
provenance, so the active repository intentionally exposes no runnable
reproduction path.

High used a `0.06` simplification ratio, `0.008` error, and 2048-pixel textures. Balanced used `0.04`, `0.012`, and 2048 pixels. Compact used `0.018`, `0.018`, and 1024 pixels. All used WebP textures plus flatten, join, weld, and prune transforms. The exact historical arguments and expected hashes remain in [`manifest.json`](manifest.json).

Because redistribution authority for the 63 MB source is unresolved, it is not
present in current repository heads and is not automatically downloaded. Any
future reproduction must use an authorized exact source, preverified offline
tooling, a minimal credential-free environment, and a private non-public
destination under a separately reviewed procedure.

The source normal map does not include authored tangents. Generating MikkTSpace tangents removes the glTF validator's generated-tangent-space warning and gives the close camera a stable normal-map basis.

## Archive boundary

The unchanged original GLB was preserved byte-for-byte in the historical Git record and a restricted operational quarantine. It is not publicly mirrored or present in the v0.3.0 HEAD pending redistribution clearance. No preview render, conversion, recompression, or metadata stripping was applied.

This is project-provided reference media with preserved provenance. The archive does not independently establish ownership or a future license for the source or generated derivatives. See [`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md).
