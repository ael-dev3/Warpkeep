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

## Active runtime models

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `warpkeep-title-high.glb` | 3,844,364 | `2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5` |
| `warpkeep-title-compact.glb` | 1,714,060 | `d29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8` |
| `hegemony-main-castle-high.glb` | 1,934,920 | `9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2` |
| `hegemony-main-castle-balanced.glb` | 1,172,132 | `aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e` |
| `hegemony-main-castle-compact.glb` | 508,508 | `de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29` |

`npm run verify:runtime-assets` also verifies required runtime audio/video. `npm run verify:file-sizes` rejects new tracked non-runtime files over 5 MiB.

## Hegemony Main Castle source and deterministic preparation

The active Hegemony Main Castle source is the exact
`HegemonyMainCastle.glb` member in the public
[`hegemony-frontier-keep-3d-2026-07-14`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/hegemony-frontier-keep-3d-2026-07-14)
release attachment. The attachment is 10,672,929 bytes with SHA-256
`c029a636ee0a791ca54072d5f32fcf68263677951fd59c338dfe242264335d5f`; the
source member is 2,233,564 bytes with SHA-256
`b33755f14bbed0855cf738ba8fb2dbdde9cf56e976b7f108a2259dd478a9b580`.

Prepare the runtime files only through the checksum-pinned source fetch and
toolchain:

```sh
npm run assets:fetch:castle
npm run tools:fetch:gltfpack
npm run prepare:hegemony-castle
npm run verify:runtime-assets
```

`WARPKEEP_CASTLE_ARCHIVE` may name an already verified offline copy of the
same attachment. The preparation script uses an attested absolute system unzip
instead of PATH lookup and rejects unexpected archive paths, duplicates,
symlinks, source bytes, tool bytes, output hashes, GLB structure, atlas
dimensions/hashes, and required extensions before it writes an output. Pinned
Sharp 0.35.3/libvips 8.18.3/libwebp 1.6.0 performs the explicit 1024- and
512-pixel atlas resizes before gltfpack. The optimizer runs with a private cwd,
private HOME/TMPDIR, system-only PATH, C locale, and no inherited developer
credentials. Fetches validate the single GitHub payload redirect and prohibit
further redirects; exact byte length and SHA-256 remain authoritative. Ordinary
builds never fetch the release archive.

On 2026-07-15, the project owner authorized project-internal runtime
integration and deterministic derivative preparation of this named source. That
is not a separate public open-license, redistribution, third-party derivative,
trademark, or canonical-identity grant. Preserve the scope and the checksums in
the dated [Hegemony Main Castle record](../../reference/castles/2026-07-15-hegemony-main-castle/).

## Historical Frontier Keep runtime model record

The following former runtime paths and hashes are retained solely as historical
provenance. They are absent from the current tree and rejected by the active
runtime verifier.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `hegemony-frontier-keep-high.glb` | 2,256,092 | `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c` |
| `hegemony-frontier-keep-balanced.glb` | 2,064,100 | `bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4` |
| `hegemony-frontier-keep-compact.glb` | 760,916 | `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b` |

## Historical Frontier Keep source restriction

The 63,263,296-byte keep source has SHA-256 `fd31cd99ce2c81a3bb149915954ee72009f1db0ebb8a9e972747e21294d5986d`. Its redistribution authority is unresolved, so it is absent from v0.3.0 HEAD and public releases. Full keep regeneration requires an authorized exact offline copy:

```sh
WARPKEEP_KEEP_SOURCE=/trusted/offline/source.glb \
  npm run prepare:hegemony-frontier-keep:historical
```

The historical pipeline fails closed for missing or different bytes. Its
outputs are for private provenance comparison only and must be removed again;
`npm run verify:runtime-assets` intentionally rejects their presence. Do not
publish or restore them until authority, immutable tag, attachment bytes/hash,
download verification, and original terms are recorded.
