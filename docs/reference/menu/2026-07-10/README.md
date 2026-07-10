# Hegemony main-menu archive and runtime record — 2026-07-10

This directory preserves the Ael-provided menu-development references byte-for-byte and records the runtime derivatives used by the title-to-Hegemony-menu milestone. The runtime record was last updated on 2026-07-11 when the clean 1080p source replaced the original 720p menu film.

![Warpkeep main-menu reference](warpkeep-main-menu-reference.png)

## Archived source media

- [`warpkeep-menu-loop-silent.mp4`](warpkeep-menu-loop-silent.mp4) — 15.041667-second, 1280×720 H.264 High film at 24 fps with no audio stream.
- [`warpkeep-menu-loop-clean-hq-max-coverage-1080p-silent.mp4`](warpkeep-menu-loop-clean-hq-max-coverage-1080p-silent.mp4) — clean high-quality maximum-coverage 15.041667-second, 1920×1080 H.264 High film at 24 fps with no audio stream.
- [`sunset-hegemony.mp3`](sunset-hegemony.mp3) — 401.919979-second stereo 48 kHz MP3 with embedded cover art. The archived attachment arrived with an `.ogg` name, but its detected container and codec are MP3, so the repository filename uses `.mp3` without changing its bytes.
- [`warpkeep-main-menu-reference.png`](warpkeep-main-menu-reference.png) — 1555×1011 composition reference.

The film container supplied with the implementation prompt has a different container-level hash from the archived Discord attachment, but both contain the same H.264 video bitstream and decode to the same pixels. The manifest records both container hashes and the shared stream hash.

## Reference use

The composition reference guides the castle-left/open-right hierarchy, antique-gold title and ornaments, restrained tagline, vertical command stack, warm sunset stone, violet gateway energy, foreground-to-distant-citadel depth, and calm atmospheric motion. Its baked lettering is never served by the application: the production title, tagline, commands, notices, and Return to Title control are live semantic HTML/CSS over the clean film.

## Runtime media decisions

- The current film is derived from the clean maximum-coverage 1920×1080 source. Its raw wrap was 7.23568× the median ordinary frame-to-frame change at analysis resolution. The runtime begins at source 1.000 seconds and finishes with an exact-endpoint 24-frame linear tail-to-head blend whose final frame is 100% of the opening head. Its boundary is 66.405% less discontinuous, and a three-loop decode preserved all 1,011 frames at exact 24 fps cadence with identical boundaries and no drift.
- The runtime film uses a CRF 20 slow H.264 High encode constrained to Level 4.1 and four reference frames for broad hardware-decoder compatibility. The 313 unchanged source-aligned frames scored VMAF 98.3015, SSIM 0.990383, and PSNR 37.9298 dB. It explicitly declares limited-range BT.709 primaries, transfer, and matrix metadata and places its index before the media payload for fast-start delivery.
- Its poster is a color-managed 1920×1080 quality-84 WebP with an embedded sRGB profile. Against the first decoded video frame, it measured 2.332/255 RGB mean absolute error in Chromium and 2.173/255 through macOS ColorSync, keeping the fallback-to-film handoff visually aligned.
- The “Sunset Hegemony” MP3 is copied byte-for-byte into `public/audio/`. Its final cadence completes before a quiet release; the audio director starts the standby source at 0.000 seconds when the outgoing source reaches 400.128 seconds and performs a 1.792-second equal-power overlap through 401.920 seconds.
- Files in this archive remain documentation assets. The application loads only the copies and derivatives identified under `public/` in `manifest.json`.

## Provenance

- Source: Ael-provided project attachments.
- Image attachment basename: `img_8be8dd61c97e.png` / `warpkeep-main-menu-reference.png`.
- Video attachment basenames: `warpkeep_menu_loop_no_audio.mp4` and `warpkeep_menu_loop_clean_hq_max_coverage_1080p_no_audio.mp4`.
- Audio attachment basename: `audio_ac578c8d7609.ogg` / `Sunset Hegemony.mp3`; detected as MP3.
- Audio metadata: title `Sunset Hegemony`, artist `ael_dev7`, instrumental, made with Suno.
- Licensing: covered by the repository's project-owned media policy in [`../../../../ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md).

See [`manifest.json`](manifest.json) for exact archive/runtime filenames, hashes, dimensions, durations, codecs, bytes, transformations, and intended uses.
