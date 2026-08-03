# Inner Keep 3D asset selection record

This directory records the exact, reviewed subset of the Warpkeep Inner-Keep
3D Asset Library proposed for the Inner Keep. It is an allowlist and provenance
record, not a runtime-use grant. No archive model or preview is committed to
Warpkeep by this record.

## Pinned source

| Coordinate | Pinned value |
| --- | --- |
| Repository | [`ael-dev3/Warpkeep-Assets`](https://github.com/ael-dev3/Warpkeep-Assets) |
| Repository main commit | `b074ffb6317ff9a581f5b7fc7f0a0760e721a9b6` |
| Release commit | `74033ebffb7f0a3ec371ccdabac10974bbe413b9` |
| Release | [`inner-keep-3d-asset-library-2026-08-02`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/inner-keep-3d-asset-library-2026-08-02) |
| Attachment | `inner-keep-3d-asset-library-2026-08-02-v1.zip` |
| Attachment size | 234,962,670 bytes |
| Attachment SHA-256 | `f13bc9e7b8e32a6767b1959307a202d894123f384e11fd19550d75e0dfe5f6c9` |
| Trusted release manifest SHA-256 | `67a31bee8c63718143a9071e9cb906f2229b9776c55d9d6fce3fd87bf2f032ae` |
| Selection digest | `6763aeb1755d800b817a0d5174182474d3836a928c59beb4b4fdf65f5d1f6ec3` |

The [machine-readable selection](manifest.json) pins every selected source
member, byte count, SHA-256 digest, triangle count, bounds, and proposed
content-addressed destination.

The selection digest hashes the parsed JSON projection `{ selectionId,
sourceRelease, profiles, assets, existingRuntimeReuse }`. Object keys are
sorted recursively, array order is retained, and ECMAScript JSON serialization
defines string and number encoding. This avoids generator-specific distinctions
such as `9` versus `9.0`, which are the same JSON number after parsing.

## Reviewed subset

| Family | Assets |
| --- | ---: |
| Economy buildings | 4 |
| Palisade pieces | 6 |
| Town items | 19 |
| Stone and ruin pieces | 4 |
| New tree assets | 3 |
| Existing authorized tree families reused | 3 |

The new subset contains 108 GLBs: High, Balanced, and Compact for each of 36
assets. It also contains four 320×320 building-card previews. The selected
models total 11,316,348 bytes across all three profiles. The selected previews
total 634,685 bytes. `LOD3_Map`, Barracks, Cathedral, inspection/catalogue
models, editable sources, tools, and every unlisted asset remain excluded.

## Authorization gate

The source release authorizes public archival and GitHub Release distribution.
It does not separately authorize copying archive-only media into the public
Warpkeep repository or official runtime. The supplied product prompt expressly
is not a relicensing grant, so installation remains blocked.

An owner decision must name this exact use before the record can change. A
sufficient narrowly scoped record would be:

> I authorize the 108 GLBs and four PNG previews identified by Inner Keep
> selection digest `6763aeb1755d800b817a0d5174182474d3836a928c59beb4b4fdf65f5d1f6ec3`
> from Warpkeep-Assets release `inner-keep-3d-asset-library-2026-08-02` to be
> copied into the public `ael-dev3/Warpkeep` repository and served by the
> official `warpkeep.com` runtime at their recorded content-addressed paths.
> This is a runtime-use authorization only. It does not approve merge,
> deployment, activation, broader redistribution, relicensing, or substitution.

After that decision is preserved in reviewable project history, update the
authorization fields in `manifest.json` and the corresponding verifier
expectations together. Never bypass only the installer check.

## Local audit

Place the exact archive and trusted release manifest in a private local cache,
or point the audit at trusted offline files:

```sh
WARPKEEP_INNER_KEEP_ARCHIVE=/trusted/offline/inner-keep-3d-asset-library-2026-08-02-v1.zip \
WARPKEEP_INNER_KEEP_RELEASE_MANIFEST=/trusted/offline/manifest.json \
  npm run assets:audit:inner-keep
```

The audit validates the full ZIP member set and extracts only the allowlisted
members into a temporary private directory for verification. It writes no
runtime output. `npm run prepare:inner-keep-assets` intentionally fails before
reading the archive while runtime-use authorization remains pending.
