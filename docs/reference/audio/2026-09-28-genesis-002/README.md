# Genesis 002 realm score — 2026-09-28

## Source and runtime files

The supplied `Genesis 002.m4a`, recorded in the [immutable prepared archive manifest](https://github.com/ael-dev3/Warpkeep-Assets/blob/f0993b0b14e865922f739f9ac218334b4695b577/releases/genesis-002-realm-score-2026-09-28/manifest.json), is 4,044,476 bytes, SHA-256 `18e1ba7986bac220146d248ee863fd0020cbacc3e1e7661dd052f608d868b598`. FFprobe identifies one 48 kHz stereo Opus stream in an MP4/M4A container with a 223.600-second duration. Its source comment says `made with suno`; that is a creation disclosure, not proof of ownership or a license.

The archive remains a draft in [open Warpkeep-Assets PR #38](https://github.com/ael-dev3/Warpkeep-Assets/pull/38); it has not been published as a release.

The browser runtime is [`warpkeep-genesis-002-theme.m4a`](../../../../public/audio/warpkeep-genesis-002-theme.m4a): 4,539,823 bytes, SHA-256 `6392e617b1c869ea81b211aebb10cdca42218377d0d0161232efa6f26dcced47`, AAC-LC, 48 kHz stereo, 223.613 seconds. It preserves the complete program. The 13 ms duration difference comes from AAC encoding; the source was not trimmed or normalized.

Conversion used FFmpeg 8.1.2:

```sh
ffmpeg -nostdin -hide_banner -y -i 'Genesis 002.m4a' \
  -map 0:a:0 -map_metadata -1 -vn -c:a aac -b:a 160k \
  -movflags +faststart -f ipod warpkeep-genesis-002-runtime-aac.m4a
```

The output decodes completely. EBU R128 measured the supplied master at -17.8 LUFS integrated, 7.0 LU loudness range, and -4.8 dBFS true peak. Playback uses a conservative 0.58 realm gain, which brings the score close to the existing Lowlands output without destructive normalization.

## Playback

At the shared audio director's existing authenticated realm-entry preparation point, the realm ID selects its score: Genesis 001 and PTR retain Lowlands; `genesis-002` selects this file. The two cached media elements use an eight-second equal-power wrap from 215.613 to 223.613 seconds and retain the director's existing scene fades, mute preference, visibility pause, and browser gesture handling.

Genesis 002 is still sealed in the current 0.4 source, so this change adds no way to enter it and does not enable admissions or connect to its backend. The score selection is ready for a future authorized G002 entry path; no current player can trigger that path.

## Provenance and rights

Ael supplied the exact source and requested official Genesis 002 realm playback plus archival in Warpkeep-Assets. The metadata's Suno disclosure does not establish authorship, ownership, or service rights. This exact official-use and archive authorization is recorded in [`ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md); no open-content license or broader public reuse right is asserted.

See the [machine-readable record](manifest.json) and [Assets archive](https://github.com/ael-dev3/Warpkeep-Assets/tree/codex/genesis002-realm-score/docs/collections/genesis-002-realm-score-2026-09-28.md) for checksums and package details.
