# Hegemony main-menu reference — 2026-07-10

This directory archives the project-provided composition reference and the provenance record for the title-to-Hegemony-menu milestone.

## Reference use

`warpkeep-main-menu-reference.png` guides composition, hierarchy, antique-gold typography, ornaments, title/tagline placement, and the right-side command stack. It is not a runtime background: its baked lettering is never served by the application. The production title, tagline, buttons, notices, and Return to Title control are live semantic HTML/CSS over the separate clean film.

## Runtime media decisions

- The supplied castle film contained one H.264 video stream and no audio stream. Its original wrap was 7.62× the median ordinary frame-to-frame change at analysis resolution, so the runtime derivative uses a tested one-second tail-to-head dissolve. Across three decoded loops, the repaired boundary is about 67.7% less discontinuous and has no frame-cadence drift.
- The runtime film explicitly declares limited-range BT.709 primaries, transfer, and matrix metadata. Its WebP poster is a color-managed first-frame derivative with an embedded sRGB profile, keeping the poster and first decoded video frame visually aligned across the tested Chromium and macOS decode paths.
- The “Sunset Hegemony” MP3 is preserved byte-for-byte. Its final cadence completes before a quiet release; the audio director begins a second cached source at 0.000 s when the outgoing source reaches 400.128 s and performs a 1.792 s equal-power overlap through 401.920 s.

See `manifest.json` for exact source/runtime filenames, hashes, dimensions, durations, codecs, bytes, and intended uses.
