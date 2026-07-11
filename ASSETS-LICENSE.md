# Warpkeep Licensing Notes

Warpkeep uses maximum-freedom public licensing by default.

## Software license

Source code, scripts, configuration, tests, and other software files are licensed under the Zero-Clause BSD license (`0BSD`). See [`LICENSE`](LICENSE).

`0BSD` is intentionally permissive: it allows use, copying, modification, distribution, sublicensing, private use, commercial use, and resale with minimal friction.

## Documentation, lore, and project-owned media

Markdown documentation, design notes, lore text, manifests, and project-owned visual/media assets are dedicated under CC0 1.0 Universal unless a file explicitly says otherwise. See [`LICENSE-CC0`](LICENSE-CC0).

This includes, unless separately noted:

- `public/images/warpkeep-cover.png`
- `public/images/factions/**`
- `public/audio/warpkeep-title-theme-a.mp3`
- `public/audio/warpkeep-title-theme-b.mp3`
- `public/audio/warpkeep-menu-theme.mp3`
- `public/video/warpkeep-menu-loop-v2.mp4`
- `public/images/menu/warpkeep-menu-poster-v2.webp`
- `public/models/hegemony/**`
- `docs/reference/factions/**`
- `docs/reference/castles/**`
- `docs/reference/terrain/**`
- `docs/reference/menu/**`
- generated/reference images, audio, contact sheets, archive notes, and manifests committed to this repository

To the extent the CC0 public-domain dedication is not legally effective in a jurisdiction, the project owner grants everyone a perpetual, worldwide, royalty-free, non-exclusive, irrevocable license to use, copy, modify, publish, distribute, sublicense, sell, and create derivative works from those project-owned materials for any purpose.

## Hegemony menu media provenance

The 2026-07-10 title-to-menu milestone uses project-provided media supplied for this repository. This record describes the files and transformations; it does not assert ownership by any third party.

| Intended use | Project-provided source | Repository file | Technical record |
| --- | --- | --- | --- |
| Animated menu plate | `warpkeep_menu_loop_clean_hq_max_coverage_1080p_no_audio.mp4` | `public/video/warpkeep-menu-loop-v2.mp4` | Source: 7,561,210 bytes, SHA-256 `5ef6c41af8231665dadd0c214e23875e2f994dcd257e8ce98bf7bfd8ab0e5fa0`. Runtime derivative: 1920×1080, 24 fps, 337 frames, H.264 High Level 4.1 with four reference frames, yuv420p limited-range BT.709, no audio, 14.041667 s, 5,713,248 bytes, SHA-256 `6034f049e8ee25a412fdc1f8c7ccce1ab403a58eac9158e1d0b55a6bfa99260c`. The timeline begins at source 1.000 s and ends with an exact-endpoint 24-frame linear tail-to-head blend; the repaired wrap is 66.405% less discontinuous, and the fast-start film retains exact cadence and identical boundaries over three audited loops. |
| Immediate menu fallback | Color-managed derivative of runtime video frame 0 | `public/images/menu/warpkeep-menu-poster-v2.webp` | 1920×1080 WebP, quality 84/method 6 with embedded sRGB ICC, 249,626 bytes, SHA-256 `d0fa4d4fbd893369a78d7ada828723e7612f95bbf4d8ee0eeef9858a33ce581c`. The tagged BT.709 frame is converted to sRGB; poster-to-video RGB mean absolute error measured 2.332/255 in Chromium and 2.173/255 through macOS ColorSync. |
| Hegemony menu score | `Sunset Hegemony.mp3` | `public/audio/warpkeep-menu-theme.mp3` | Original bytes preserved: stereo 48 kHz MP3, 401.919979 s decoded program, 9,631,066 bytes, SHA-256 `ea2a77cf5a2729e4a90a7ccbfe9a37ab1387c9371232b5219843e1715fa17917`. Runtime uses two cached elements and a 1.792 s equal-power overlap beginning at 400.128 s. |
| Composition reference only | `warpkeep-main-menu-reference.png` | `docs/reference/menu/2026-07-10/warpkeep-main-menu-reference.png` | 1555×1011 PNG, 2,653,834 bytes, SHA-256 `dc7ad4319cf8d37e3e127a0954ac9ed982ed37031ac672ef614f84311c10277c`. Never served as the runtime page or poster; all menu lettering is live HTML/CSS. |

The original 1280×720 runtime film and poster were superseded on 2026-07-11. Their filenames, hashes, and derivation details remain in the dated menu manifest as a historical record.

## Hegemony Frontier Keep provenance

The archived Hegemony Frontier Keep and its runtime derivatives are project-provided media supplied for this repository. The source remains byte-for-byte intact under `docs/reference/castles/2026-07-11-meshy-hegemony-frontier-keep/`; the public models are generated derivatives covered by the same CC0 project-media policy.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Archived source | `docs/reference/castles/2026-07-11-meshy-hegemony-frontier-keep/Meshy_AI_Hegemony_Frontier_Kee_0711104905_image-to-3d-texture.glb` | 63,263,296 bytes, SHA-256 `fd31cd99ce2c81a3bb149915954ee72009f1db0ebb8a9e972747e21294d5986d`, 941,298 source triangles, four embedded JPEG textures. Never served at runtime. |
| High runtime keep | `public/models/hegemony/hegemony-frontier-keep-high.glb` | 2,256,092 bytes, SHA-256 `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c`, 56,466 triangles, four 2048×2048 WebP textures, Meshopt compression. |
| Compact runtime keep | `public/models/hegemony/hegemony-frontier-keep-compact.glb` | 760,916 bytes, SHA-256 `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b`, 17,536 triangles, four 1024×1024 WebP textures, Meshopt compression. |

Both runtime files are reproducible with `npm run prepare:hegemony-keep`. The pinned preparation pipeline and complete technical metadata are recorded in the dated castle archive.

## Trademark and endorsement note

These licenses do not grant trademark rights or imply endorsement by the project owner. Forks, mods, and community realms should avoid presenting themselves as the canonical Warpkeep deployment unless explicitly authorized.
