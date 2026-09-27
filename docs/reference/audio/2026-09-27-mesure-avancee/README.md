# Verdant Citadel menu score — 2026-09-27

Ael supplied `Mesure Avancée.m4a` for the new Warpkeep 0.4 menu and instructed its use there. The local source was 3,616,838 bytes, SHA-256 `3b8390f581efc29134759271af0ba2a95c9ee290a29bfeb641d364438c68001f`, with a 209.600-second stereo 48 kHz Opus stream inside an MP4 container. Its metadata says it was made with Suno. The source file is not checked into this repository, and this record does not assert an open-content license or rights beyond the owner's requested official game use.

The browser runtime uses [`public/audio/warpkeep-verdant-menu-theme.m4a`](../../../../public/audio/warpkeep-verdant-menu-theme.m4a), 4,223,322 bytes, SHA-256 `a823fbd932c425d8bb60b1d7319403ba1f0fb23a7c5670da66c215ff22cc206a`. It is stereo AAC at 48 kHz, 208.100 seconds, approximately 160 kbit/s. Converting to AAC provides broad browser playback support; the source's final 1.5 seconds of silence were omitted. Source metadata was stripped from the runtime file.

```sh
ffmpeg -i 'Mesure Avancée.m4a' -t 208.1 -map 0:a:0 -map_metadata -1 -vn \
  -c:a aac -b:a 160k -ar 48000 -movflags +faststart \
  public/audio/warpkeep-verdant-menu-theme.m4a
```

The menu audio director uses two elements with an equal-power, three-second overlap from 205.1 through 208.1 seconds. The original tail steadily fades over its final four seconds and the opening builds softly. The existing mute, visibility, gesture-retry, and Realm transition behavior remain in effect.
