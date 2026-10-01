# Warplet castle menu assets — 2026-09-27

The Alpha 0.4 menu loads a real-time 3D scene built from Warplet's Watch v2, the project-authored model released in [Warpkeep-Assets](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/warplets-watch-castle-2026-09-14). The runtime castle and rooftop guardian stay separate so the verified-FID presentation contract remains intact.

| File | Role | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `warplet-castle-base-v2-18428728949eea8b.glb` | Castle-only extraction master | 3,274,996 | `18428728949eea8b593e2920240f467609c925cf78a28eceb60a929aebc6e7c6` |
| `warplet-castle-hegemony-source-v2-c55f2c6c610e4aac.glb` | Castle source with the current Hegemony emblem woven into the existing cloth banners | 4,977,796 | `c55f2c6c610e4aacddde58e485156c85629dd0a2eab88fad65652c317ae59088` |
| `warplet-guardian-source-v2-e934a81ae2a210e4.glb` | Exact standalone v2 rooftop guardian source | 1,836,344 | `e934a81ae2a210e495675aff99293aebc60cebb1a42603c9d99351db43d9e602` |
| `public/models/menu/warplet-castle-hegemony-v2-meshopt-webp-181a847fe386859f.glb` | Browser runtime castle | 801,300 | `181a847fe386859f5facc1fa7c2b420a8b4bc4b8434d25ea4ec200c5408062ef` |
| `public/models/menu/warplet-guardian-v2-meshopt-b959ee1e17e96f00.glb` | Browser runtime guardian | 235,112 | `b959ee1e17e96f0088d6d8dbdd1944cb02266b2219f6db6e167138ef30746fe5` |

The extractor [`scripts/assets/derive-warplet-castle-base.py`](../../../../scripts/assets/derive-warplet-castle-base.py) accepts only the exact combined release GLB (5,112,500 bytes, SHA-256 `2ab3f39cae142f0e168242095ce17b9608998d26384d91609c8084956ddae6a6`) and writes the castle-only master above. [`scripts/assets/texture-hegemony-banners.py`](../../../../scripts/assets/texture-hegemony-banners.py) verifies that master and the supplied emblem (`public/images/menu/hegemony-emblem-26e8664b1db0acf3.png`, SHA-256 `26e8664b1db0acf3e6db443caf46ef13e45fe9de794749e431b7c2e3d6fb8774`), then writes the reproducible textured castle source beside these records. It changes the existing banner UVs and opaque cloth texture; it adds no geometry or floating emblems.

Rebuild the runtime pair with the checksum-pinned `gltfpack` 1.2 executable:

```sh
python scripts/assets/texture-hegemony-banners.py
npm run tools:fetch:gltfpack
npm run prepare:menu-world-models
npm run verify:runtime-assets
```

The preparation step verifies every source, tool, and output byte count and SHA-256. It uses meshoptimizer compression and glTF quantization without triangle simplification. The castle keeps all nine meshes, their material assignments, and source vertex/index counts; its banner texture is encoded as WebP at the encoder's maximum quality setting. The guardian keeps its 12-joint skin and both `Warplet_Idle` and `Warplet_Torch_Salute` animations; animation tracks are resampled at 30 Hz. Runtime outputs are content-addressed and immutable. Temporary conversion files are removed when the command finishes.

Together, these two runtime files transfer 1,036,412 bytes rather than 6,814,140 bytes for the full-resolution source pair, an 84.8% reduction. A 390×844 local production-candidate resource profile dropped from 9,516,527 to 3,738,799 bytes for the complete menu waterfall while preserving the same scene and verified-FID assignment behavior. Browser verification confirmed the model-ready state, visible canvas, and no console warnings.

The original supplied 1254×1254 emblem remains unchanged for the banner derivation and the 256×256 heading derivative remains unchanged. The emblem was supplied on 2026-09-27 and is also proposed in open [Warpkeep-Assets PR #37](https://github.com/ael-dev3/Warpkeep-Assets/pull/37). The referenced Warplet model, character, and emblem remain `LicenseRef-Warpkeep-Provenance-Required`; this optimization does not grant a new license.

The guardian sits on the castle turret with a +12 world-Y translation. Preserve that seating contract for replacement models, or add an explicit per-model transform instead of changing the camera to compensate. [`menuWarpletRegistry.ts`](../../../../src/components/menu/menuWarpletRegistry.ts) maps only a verified numeric Farcaster FID to a guardian URL. Anonymous web visitors see the showcase model; other verified FIDs receive a neutral rooftop figure until their model has been reviewed and assigned. The scene remains decorative and does not affect gameplay authority.
