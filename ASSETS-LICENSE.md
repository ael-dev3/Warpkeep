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
- `public/video/warpkeep-menu-loop.mp4`
- `public/images/menu/warpkeep-menu-poster.webp`
- `docs/reference/factions/**`
- `docs/reference/castles/**`
- `docs/reference/menu/**`
- generated/reference images, audio, contact sheets, archive notes, and manifests committed to this repository

To the extent the CC0 public-domain dedication is not legally effective in a jurisdiction, the project owner grants everyone a perpetual, worldwide, royalty-free, non-exclusive, irrevocable license to use, copy, modify, publish, distribute, sublicense, sell, and create derivative works from those project-owned materials for any purpose.

## Hegemony menu media provenance

The 2026-07-10 title-to-menu milestone uses project-provided media supplied for this repository. This record describes the files and transformations; it does not assert ownership by any third party.

| Intended use | Project-provided source | Repository file | Technical record |
| --- | --- | --- | --- |
| Animated menu plate | `warpkeep_menu_loop_no_audio.mp4` | `public/video/warpkeep-menu-loop.mp4` | Source: 5,142,079 bytes, SHA-256 `270b4ecc7fa69519a29eb743786a8c69d5062f5fc454d82f2bfd8094698f0542`. Runtime derivative: 1280×720, 24 fps, H.264 High, yuv420p limited-range BT.709, no audio, 14.041667 s, 4,439,356 bytes, SHA-256 `75a6b3c8dd023f537b2b0889d0de0ee2ccd82483ec8913ea9626f0a2b3e5e303`. The final source second is dissolved into its first second and the timeline begins at source 1.000 s to reduce the original visible seam; explicit BT.709 color metadata and faststart are retained for consistent browser decoding. |
| Immediate menu fallback | Color-managed derivative of runtime video frame 0 | `public/images/menu/warpkeep-menu-poster.webp` | 1280×720 WebP, quality 82 with embedded sRGB ICC, 122,328 bytes, SHA-256 `2280d6ef6b1f09e6b72d8b34dbecff2ee1e7e5c72dab17e1a8c8a22b9c01b53a`. The tagged BT.709 frame is converted to sRGB so the poster and first decoded video frame remain visually aligned in Chromium and macOS decoders. |
| Hegemony menu score | `Sunset Hegemony.mp3` | `public/audio/warpkeep-menu-theme.mp3` | Original bytes preserved: stereo 48 kHz MP3, 401.919979 s decoded program, 9,631,066 bytes, SHA-256 `ea2a77cf5a2729e4a90a7ccbfe9a37ab1387c9371232b5219843e1715fa17917`. Runtime uses two cached elements and a 1.792 s equal-power overlap beginning at 400.128 s. |
| Composition reference only | `warpkeep-main-menu-reference.png` | `docs/reference/menu/2026-07-10/warpkeep-main-menu-reference.png` | 1555×1011 PNG, 2,653,834 bytes, SHA-256 `dc7ad4319cf8d37e3e127a0954ac9ed982ed37031ac672ef614f84311c10277c`. Never served as the runtime page or poster; all menu lettering is live HTML/CSS. |

## Trademark and endorsement note

These licenses do not grant trademark rights or imply endorsement by the project owner. Forks, mods, and community realms should avoid presenting themselves as the canonical Warpkeep deployment unless explicitly authorized.
