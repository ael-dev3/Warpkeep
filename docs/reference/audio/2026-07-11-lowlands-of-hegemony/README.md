# Lowlands of Hegemony audio archive — 2026-07-11

This directory preserves the exact project-provided source attachment used for the authenticated Hegemony Lowlands score.

## Archive and runtime record

- [`Lowlands Of Hegemony.mp3`](Lowlands%20Of%20Hegemony.mp3) is the byte-for-byte source archive: MP3, 48 kHz stereo, 244.919979-second decoded program, 5,722,488 bytes, SHA-256 `3a04a006e10771c738edacd47150d6039a4eda4faee6bf47f64813b134f81908`.
- The source contains one MP3 audio stream plus a 360×360 MJPEG front-cover stream. Its title is `Lowlands Of Hegemony`; artist is `ael_dev7`.
- [`../../../../public/audio/warpkeep-lowlands-theme.mp3`](../../../../public/audio/warpkeep-lowlands-theme.mp3) is the runtime derivative: the original audio stream is stream-copied, with the embedded image and source-generator metadata excluded. It contains one 48 kHz stereo MP3 stream, title `Lowlands of Hegemony`, artist `ael_dev7`, 5,704,657 bytes, SHA-256 `d75a8865eda00c808c472d438240a5f645173dead353d44925f34cee500fa13c`.

The application never serves this archived source. It loads only the cleaned runtime derivative after an authenticated player enters the Lowlands.

## Playback design

The master is approximately -13.9 LUFS integrated with a 0.0 dBFS true peak, so runtime gain is deliberately conservative (`0.37`) rather than destructively normalizing the file. Its tail fades close to silence; a native hard restart would be audible. The audio director instead runs a two-element equal-power loop:

- outgoing source begins the overlap at `236.000000` seconds;
- decoded program endpoint is `244.919979` seconds;
- overlap is `8.919979` seconds;
- the incoming source begins at its matching head position and becomes the next active source.

This realm scene crossfades title/menu → realm over 2.3 seconds and realm → menu over 1.9 seconds. The menu score keeps its own position while Lowlands plays; realm position is retained during normal return/re-entry in the same mounted session and reset after sign-out.

## Provenance and license

Source: Ael-provided project attachment. Ownership and original terms are not independently established, so the source and runtime derivative are not assigned a new license by assumption. See [`ASSETS-LICENSE.md`](../../../../ASSETS-LICENSE.md) and the full machine-readable technical record in [`manifest.json`](manifest.json).
