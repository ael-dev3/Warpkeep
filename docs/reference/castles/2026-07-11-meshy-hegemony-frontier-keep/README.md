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

## Runtime derivative

The original archive is intentionally **not** loaded by the runtime. A separate, optimized derivative is served only after an authenticated player enters the Realm:

- **Runtime file:** [`public/models/hegemony-frontier-keep.runtime.glb`](../../../../public/models/hegemony-frontier-keep.runtime.glb)
- **Bytes / SHA-256:** 1,139,756 bytes / `b350421e8fd64b59f1c10ae1191454b99799d1c978dac45f9e24d67907691163`
- **Model budget:** 75,278 triangles, 65,554 uploaded vertices, 1024×1024 WebP textures
- **Required glTF extensions:** `EXT_meshopt_compression`, `EXT_texture_webp`, `KHR_mesh_quantization`
- **Transform:** `gltf-transform optimize` with Meshopt high compression, a 0.08 simplify ratio / 0.012 simplify error, WebP conversion, 1024 texture cap, flatten/join/weld/prune.

`RealmMapScreen` dynamically imports `GLTFLoader` and the Meshopt decoder, then grounds the model to terrain with a local six-sided foundation. The title, menu, and authentication flow never fetch this model.

## Archive boundary

The unchanged original GLB is preserved byte-for-byte. No preview render, conversion, recompression, or metadata stripping was applied.

Project-owned reference media in `docs/reference/castles/**` follows Warpkeep's maximum-freedom media policy. See [`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md).
