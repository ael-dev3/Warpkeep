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
| `hegemony-main-castle-high.glb` | 2,215,972 | `9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8` |
| `hegemony-main-castle-balanced.glb` | 892,788 | `a9df1a9acd36e7208b764396854053a6e3c591f2eb04a83a6e2437c55a3aa157` |
| `hegemony-main-castle-compact.glb` | 453,628 | `b665d75e10e3e289dac09ebb9f0eeec75469dda77fb25265b03b5ad6081c627b` |
| `hegemony-castle-landscape-base-high.glb` | 214,372 | `be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c` |
| `hegemony-castle-landscape-base-balanced.glb` | 92,784 | `179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f` |
| `hegemony-castle-landscape-base-compact.glb` | 27,328 | `f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3` |

`npm run verify:runtime-assets` also verifies required runtime audio/video. `npm run verify:file-sizes` rejects new tracked non-runtime files over 5 MiB.

## Active Hegemony Main Castle GameReady installation

The active family is installed from the exact owner-supplied package identified
as **Warpkeep Hegemony Castle — Archer/Mage Platforms**. Its
`asset-manifest.json` is 1,456 bytes with SHA-256
`6a4a67baa4912f93337b7100d27ffe65e9c185492e8c2047c4d2ccdefe591c23`.
The package root must contain that file and the three exact inputs at their
declared `public/models/hegemony/` paths.

Install and verify from a trusted, authorized exact package root:

```sh
WARPKEEP_CASTLE_GAMEREADY_ROOT=/trusted/offline/game-ready-package \
  npm run prepare:hegemony-castle
npm run verify:runtime-assets
```

The installer rejects symlinks, non-regular files, a changed package identity,
or any byte/hash mismatch before writing runtime files. High is copied
byte-for-byte. Balanced and Compact have correct embedded 1024×1024 and
512×512 WebP payloads but arrive with incorrect `wk_atlas_size: 2048`
material metadata. The existing deterministic WebP-aware GLB helper corrects
that field to 1024 and 512 and repacks only JSON/BIN padding and offsets;
geometry buffers and embedded image payload bytes remain unchanged. All three
outputs are structure-, extension-, geometry-, transform-, atlas-, and
hash-verified before installation.

| Profile | Authorized input bytes / SHA-256 | Installed output bytes / SHA-256 | Correction |
| --- | --- | --- | --- |
| High | 2,215,972 / `9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8` | 2,215,972 / `9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8` | none; byte-for-byte |
| Balanced | 892,796 / `a480439ac47be4ee419ce623de0d785c4f4ce73cd110dc093c6508faa6cfdbae` | 892,788 / `a9df1a9acd36e7208b764396854053a6e3c591f2eb04a83a6e2437c55a3aa157` | atlas metadata 2048 → 1024; payloads preserved |
| Compact | 453,632 / `5b0f6919585b10f51b42f004c32d1c96bf2addc2549af3b84b0eea7fcedffe5e` | 453,628 / `b665d75e10e3e289dac09ebb9f0eeec75469dda77fb25265b03b5ad6081c627b` | atlas metadata 2048 → 512; payloads preserved |

On 2026-07-16, the project owner authorized these exact three inputs for
project-internal Warpkeep runtime integration and this bounded deterministic
metadata correction only. That is not a separate public open-license, general
redistribution or third-party derivative permission, trademark grant, or
canonical-identity grant. The complete record is the dated
[GameReady Hegemony Main Castle record](../../reference/castles/2026-07-16-hegemony-main-castle-gameready/).

The geometry family introduces profile-relative size and height differences
that the project owner explicitly accepted. It does not itself make the castle
materials brighter; renderer lighting and palette work remain separate.

## Active Hegemony Castle Landscape Base GameReady installation

The matching authored island family is installed separately from the exact
owner-supplied **Warpkeep Castle Landscape Base** package, asset ID
`warpkeep.castle-landscape-base`, version `1.0.0`. Its
`asset-manifest.json` is 2,177 bytes with SHA-256
`106d64f5eaf91332acc83c18d5abbd9ad230b17eb4c9ffee1231ecf7d595d3f5`.

Install and verify only from a trusted, authorized exact package root:

```sh
WARPKEEP_CASTLE_BASE_GAMEREADY_ROOT=/trusted/offline/game-ready-base-package \
  npm run prepare:hegemony-castle-base
npm run verify:runtime-assets
```

| Profile | Authorized input bytes / SHA-256 | Installed output bytes / SHA-256 | Correction |
| --- | --- | --- | --- |
| High | 214,372 / `be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c` | 214,372 / `be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c` | none; byte-for-byte |
| Balanced | 92,792 / `5f4e3c52336c78414b5370b63a5e4b924a773297092430eb6f4773bc094eb5cf` | 92,784 / `179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f` | atlas metadata 1024 → 512; payloads preserved |
| Compact | 27,336 / `ebaf6c6cef216b92de86aa49ea2d612d63227210858b7427fa0c7e97a81323dc` | 27,328 / `f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3` | atlas metadata 1024 → 256; payloads preserved |

The installer rejects symlinks, non-regular files, package-identity changes,
and byte/hash mismatches before writing. High is copied byte-for-byte;
Balanced/Compact change only the incorrect material atlas metadata and
necessary GLB padding/offsets. Castle and base must receive the exact same
parent position, quaternion, and uniform scale. Never independently center,
normalize, ground, or scale the base: the below-ground skirt and `+Z` road are
authored placement.

The owner explicitly instructed PR #40 to integrate these exact bases under
Warpkeep castles. That narrow scope and bounded metadata correction remain
`LicenseRef-Warpkeep-Provenance-Required`; they do not establish a public open
licence, general third-party derivative/redistribution authority, trademark or
canonical-identity rights, or same-named-file substitution. The exact record is
the dated
[GameReady landscape-base record](../../reference/castles/2026-07-16-hegemony-castle-landscape-base-gameready/).

## Historical 2026-07-15 Hegemony Main Castle preparation

The prior set derived from the exact `HegemonyMainCastle.glb` member in the
public `hegemony-frontier-keep-3d-2026-07-14` release is superseded. Its fetch
command is retained as `npm run assets:fetch:castle:source-0.3.4`, and its
preparation command is retained as
`npm run prepare:hegemony-castle:source-0.3.4`, solely for historical evidence
and private comparison. Neither command reproduces or installs the active
GameReady family, and an output from the historical preparation script is
rejected by the active runtime verifier.

Do not use `scripts/prepare-hegemony-main-castle.mjs` as the active reproducer.
The public release coordinates, former output hashes, pinned `gltfpack`/Sharp
pipeline, and original 2026-07-15 authorization boundary remain in the
[historical record](../../reference/castles/2026-07-15-hegemony-main-castle/).

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
