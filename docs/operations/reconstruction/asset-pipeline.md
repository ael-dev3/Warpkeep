# Asset pipeline reconstruction

## Repository boundary

- Browser/runtime media is committed under `public/` in Warpkeep.
- Authorized source/master packages belong in tag-specific Warpkeep-Assets release attachments, not Git history.
- Browsers never fetch release attachments.
- Ordinary `npm run build` performs no asset-network access.
- `.cache/warpkeep-assets/` is explicit, local, and untracked.
- Unresolved-rights material is never published by assumption.

## Stone title release

Public release: [`title-stone-letters-2026-07-12`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/title-stone-letters-2026-07-12)

| Attachment | Bytes | SHA-256 |
| --- | ---: | --- |
| `warpkeep-stone-letter-sources-v1.zip` | 264,904,102 | `f0584d72e573fe90f5da94e12eb003df4bf99f78cc09dde54a28bb9dee59bdf1` |
| `warpkeep-title-assemblies-v1.zip` | 5,994,957 | `492af33d4b0ff5ab80f2e726b68c2f8d497cd75bbcc036f57f2388e0b4089177` |
| `manifest.json` | 7,081 | `6305ad4d8447e43337c71b706ebf18d7af009337715f83050dc5a5a527ca1865` |
| `SHA256SUMS.txt` | 282 | `a6995b2edd12ef472290fa20f31b3643fdb88851e5b1685a1b33da32e523f786` |

Reconstruct the runtime models:

```sh
npm run assets:fetch
npm run prepare:title-models
npm run verify:runtime-assets
```

Custom cache destination:

```sh
WARPKEEP_TITLE_ARCHIVE_CACHE=/trusted/cache/warpkeep-title-assemblies-v1.zip \
  npm run assets:fetch
```

Offline preparation:

```sh
WARPKEEP_TITLE_ARCHIVE=/trusted/offline/warpkeep-title-assemblies-v1.zip \
  npm run prepare:title-models
```

The scripts verify release tag/attachment coordinates, bytes, SHA-256, safe paths, duplicates, traversal, symlinks, internal model hashes, and GLB headers before writing runtime files.

For an independent release download:

```sh
gh release download title-stone-letters-2026-07-12 \
  --repo ael-dev3/Warpkeep-Assets \
  --dir /trusted/download-directory
```

Then verify checksums, manifest entry parity, path safety, and every GLB:

```sh
npx --yes @gltf-transform/cli@4.4.1 validate <model.glb>
```

## Runtime models

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `warpkeep-title-high.glb` | 3,844,364 | `2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5` |
| `warpkeep-title-compact.glb` | 1,714,060 | `d29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8` |
| `hegemony-frontier-keep-high.glb` | 2,256,092 | `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c` |
| `hegemony-frontier-keep-balanced.glb` | 2,064,100 | `bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4` |
| `hegemony-frontier-keep-compact.glb` | 760,916 | `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b` |

`npm run verify:runtime-assets` also verifies required runtime audio/video. `npm run verify:file-sizes` rejects new tracked non-runtime files over 5 MiB.

## Keep source restriction

The 63,263,296-byte keep source has SHA-256 `fd31cd99ce2c81a3bb149915954ee72009f1db0ebb8a9e972747e21294d5986d`. Its redistribution authority is unresolved, so it is absent from v0.3.0 HEAD and public releases. Full keep regeneration requires an authorized exact offline copy:

```sh
WARPKEEP_KEEP_SOURCE=/trusted/offline/source.glb \
  npm run prepare:hegemony-keep
```

The pipeline fails closed for missing or different bytes. Do not publish a keep source release until authority, immutable tag, attachment bytes/hash, download verification, and original terms are recorded.
