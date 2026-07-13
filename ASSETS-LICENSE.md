# Warpkeep Asset Licensing and Provenance

This file records the license and provenance status of runtime media, archived references, generated derivatives, and asset manifests. Repository presence or delivery by Ael does not by itself establish copyright ownership or transferable licensing authority.

## Active policy

Active project-owned creative-content license: CC-BY-4.0

Through v0.2.0, confirmed project-owned creative material was made available under the historical `CC0-1.0` policy. Beginning with v0.3.0, new or modified confirmed project-owned creative material is licensed under `CC-BY-4.0` where Warpkeep has authority to grant it.

Historical CC0 versions remain available under CC0-1.0. Third-party and externally governed assets remain under their original terms. No future license is assigned to an asset whose authority is incomplete or ambiguous.

## Classification rules

- **Project-owned:** the provenance record expressly identifies the material as project-owned and records the authority supporting that classification. This status must be confirmed again before future modifications.
- **Project-provided:** an asset was supplied to the repository, but supply does not prove ownership. Treat it as externally governed or unresolved unless the record establishes the right to license it.
- **Generated derivative:** a transformed or generated output inherits the source-rights question; generation does not automatically create a new Warpkeep license.
- **Reference-only:** archived for art direction or provenance and not a runtime dependency.
- **Metadata:** manifests and technical records are project-authored documentation, but they do not change the license of the media they describe.

## Software license

Source code, scripts, configuration, tests, and other new or modified v0.3 software are under Apache-2.0; see [`LICENSE`](LICENSE). Historical 0BSD grants remain valid at [`licenses/legacy/LICENSE-0BSD-v0.2.0`](licenses/legacy/LICENSE-0BSD-v0.2.0). Neither policy relicenses dependencies or upstream tools.

## Documentation, lore, and manifests

Project-authored documentation, design notes, lore, and manifests follow the historical `CC0-1.0` policy through v0.2.0 and the active `CC-BY-4.0` policy for new or modified confirmed project-owned material from v0.3.0. Documentation that records external source terms does not grant those terms away.

## Hegemony menu media provenance

The 2026-07-10 title-to-menu milestone uses project-provided media supplied for this repository. This record preserves the files and transformations; it does not establish copyright ownership, upstream permissions, or a future CC-BY-4.0 grant for the source media or its derivatives.

| Intended use | Project-provided source | Repository file | Technical record |
| --- | --- | --- | --- |
| Animated menu plate | `warpkeep_menu_loop_clean_hq_max_coverage_1080p_no_audio.mp4` | `public/video/warpkeep-menu-loop-v2.mp4` | Source: 7,561,210 bytes, SHA-256 `5ef6c41af8231665dadd0c214e23875e2f994dcd257e8ce98bf7bfd8ab0e5fa0`. Runtime derivative: 1920×1080, 24 fps, 337 frames, H.264 High Level 4.1 with four reference frames, yuv420p limited-range BT.709, no audio, 14.041667 s, 5,713,248 bytes, SHA-256 `6034f049e8ee25a412fdc1f8c7ccce1ab403a58eac9158e1d0b55a6bfa99260c`. The timeline begins at source 1.000 s and ends with an exact-endpoint 24-frame linear tail-to-head blend; the repaired wrap is 66.405% less discontinuous, and the fast-start film retains exact cadence and identical boundaries over three audited loops. |
| Immediate menu fallback | Color-managed derivative of runtime video frame 0 | `public/images/menu/warpkeep-menu-poster-v2.webp` | 1920×1080 WebP, quality 84/method 6 with embedded sRGB ICC, 249,626 bytes, SHA-256 `d0fa4d4fbd893369a78d7ada828723e7612f95bbf4d8ee0eeef9858a33ce581c`. The tagged BT.709 frame is converted to sRGB; poster-to-video RGB mean absolute error measured 2.332/255 in Chromium and 2.173/255 through macOS ColorSync. |
| Hegemony menu score | `Sunset Hegemony.mp3` | `public/audio/warpkeep-menu-theme.mp3` | Original bytes preserved: stereo 48 kHz MP3, 401.919979 s decoded program, 9,631,066 bytes, SHA-256 `ea2a77cf5a2729e4a90a7ccbfe9a37ab1387c9371232b5219843e1715fa17917`. Runtime uses two cached elements and a 1.792 s equal-power overlap beginning at 400.128 s. |
| Hegemony Lowlands score | `Lowlands Of Hegemony.mp3` | `public/audio/warpkeep-lowlands-theme.mp3` | Exact original is archived under `docs/reference/audio/2026-07-11-lowlands-of-hegemony/`: 5,722,488 bytes, SHA-256 `3a04a006e10771c738edacd47150d6039a4eda4faee6bf47f64813b134f81908`, MP3 48 kHz stereo plus a 360×360 MJPEG cover. Runtime is an audio-stream-only copy: 5,704,657 bytes, SHA-256 `d75a8865eda00c808c472d438240a5f645173dead353d44925f34cee500fa13c`, with a 8.919979 s equal-power loop from 236.000 through 244.919979 seconds. |
| Composition reference only | `warpkeep-main-menu-reference.png` | `docs/reference/menu/2026-07-10/warpkeep-main-menu-reference.png` | 1555×1011 PNG, 2,653,834 bytes, SHA-256 `dc7ad4319cf8d37e3e127a0954ac9ed982ed37031ac672ef614f84311c10277c`. Never served as the runtime page or poster; all menu lettering is live HTML/CSS. |

The original 1280×720 runtime film and poster were superseded on 2026-07-11. Their filenames, hashes, and derivation details remain in the dated menu manifest as a historical record.

The unresolved-rights source film/audio binaries are not present in the v0.3.0 HEAD and were not uploaded to a public asset release. Exact technical records remain in `docs/reference/`; required runtime derivatives remain in `public/` under the same unresolved source terms.

## WARPKEEP stone title provenance

The optimized WARPKEEP stone-letter assemblies were supplied with explicit v0.3 archival and CC-BY-4.0 authorization. Source/master material is held in the public [Warpkeep-Assets](https://github.com/ael-dev3/Warpkeep-Assets) release [`title-stone-letters-2026-07-12`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/title-stone-letters-2026-07-12); the browser serves only the verified runtime assemblies committed here.

| Profile | Repository file | Technical record |
| --- | --- | --- |
| Cinematic/high title | `public/models/title/warpkeep-title-high.glb` | 3,844,364 bytes, SHA-256 `2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5`, Meshopt-compressed GLB. |
| Balanced/performance title | `public/models/title/warpkeep-title-compact.glb` | 1,714,060 bytes, SHA-256 `d29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8`, Meshopt-compressed GLB. |

Attribution: **WARPKEEP Stone Title Assembly by Clawberto**, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The verified `warpkeep-title-assemblies-v1.zip` release attachment is 5,994,957 bytes with SHA-256 `492af33d4b0ff5ab80f2e726b68c2f8d497cd75bbcc036f57f2388e0b4089177`. `npm run assets:fetch` and `npm run prepare:title-models` reconstruct the runtime files through an explicit cache/offline boundary; ordinary builds never fetch release assets.

## Hegemony Frontier Keep provenance

The Hegemony Frontier Keep and its runtime derivatives are project-provided media supplied for this repository. The 63 MB source remains byte-for-byte identifiable through its technical record but is not present in the v0.3.0 HEAD or a public release while redistribution authority is unresolved. The public models are generated derivatives whose future license follows the source-rights determination, not the fact of conversion.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Restricted source record | Not present in v0.3.0 HEAD/public releases | 63,263,296 bytes, SHA-256 `fd31cd99ce2c81a3bb149915954ee72009f1db0ebb8a9e972747e21294d5986d`, 941,298 source triangles, four embedded JPEG textures. Never served at runtime. |
| High runtime keep | `public/models/hegemony/hegemony-frontier-keep-high.glb` | 2,256,092 bytes, SHA-256 `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c`, 56,466 triangles, four 2048×2048 WebP textures, Meshopt compression. |
| Balanced runtime keep | `public/models/hegemony/hegemony-frontier-keep-balanced.glb` | 2,064,100 bytes, SHA-256 `bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4`, 37,634 triangles, four 2048×2048 WebP textures, Meshopt compression. |
| Compact runtime keep | `public/models/hegemony/hegemony-frontier-keep-compact.glb` | 760,916 bytes, SHA-256 `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b`, 17,536 triangles, four 1024×1024 WebP textures, Meshopt compression. |

All three runtime files are reproducible with `npm run prepare:hegemony-keep` when an authorized exact source copy is supplied through `WARPKEEP_KEEP_SOURCE`. The pinned preparation pipeline and complete technical metadata are recorded in the dated castle record.

## Trademark and endorsement note

These licenses do not grant trademark rights or imply endorsement by the project. Forks, mods, and community realms should avoid presenting themselves as the canonical Warpkeep deployment unless explicitly authorized; see [`TRADEMARKS.md`](TRADEMARKS.md).
