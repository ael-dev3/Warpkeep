# Inner Keep 3D asset selection record

This directory records the exact reviewed subset of the Warpkeep Inner-Keep
3D Asset Library authorized for the public Warpkeep repository and official
runtime. It is a file-by-file runtime-use record, not a blanket license for the
source archive, any unlisted asset, or unrelated redistribution.

## Pinned source

| Coordinate | Pinned value |
| --- | --- |
| Repository | [`ael-dev3/Warpkeep-Assets`](https://github.com/ael-dev3/Warpkeep-Assets) |
| Repository main commit | `10c84fbcc339f143ee6f25dfe7a0682660e0e458` |
| Release commit | `74033ebffb7f0a3ec371ccdabac10974bbe413b9` |
| Release | [`inner-keep-3d-asset-library-2026-08-02`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/inner-keep-3d-asset-library-2026-08-02) |
| Attachment | `inner-keep-3d-asset-library-2026-08-02-v1.zip` |
| Attachment size | 234,962,670 bytes |
| Attachment SHA-256 | `f13bc9e7b8e32a6767b1959307a202d894123f384e11fd19550d75e0dfe5f6c9` |
| Trusted release manifest SHA-256 | `67a31bee8c63718143a9071e9cb906f2229b9776c55d9d6fce3fd87bf2f032ae` |
| Selection digest | `00304c5dbf819cec6cb656996c1105f64efcf36acf8099c431f5b04b822679f0` |

The [machine-readable selection](manifest.json) pins every selected source
member, byte count, SHA-256 digest, triangle count, bound, and
content-addressed destination. It also preserves the exact owner instruction
that authorized this bounded runtime use on 2026-08-04.

The selection digest hashes the parsed JSON projection `{ selectionId,
sourceRelease, profiles, assets, existingRuntimeReuse }`. Object keys are
sorted recursively, array order is retained, and ECMAScript JSON serialization
defines string and number encoding. This avoids generator-specific distinctions
such as `9` versus `9.0`, which are the same JSON number after parsing.

## Reviewed runtime subset

| Family | Assets |
| --- | ---: |
| Economy buildings | 4 |
| Permanent landmarks | 2 |
| Palisade pieces | 6 |
| Town items | 19 |
| Stone and ruin pieces | 4 |
| New tree assets | 3 |
| Existing authorized tree families reused | 3 |

The selected subset contains 114 GLBs: High, Balanced, and Compact for each of
38 assets. Six 320×320 previews cover the four economy buildings plus the
Grand Covenant Cathedral and Hegemony Shieldcourt Barracks. The Cathedral is
the Inner Keep's permanent main-building and northern visual anchor. The
Barracks is its western garrison anchor.

| Profile | Bytes | Triangles |
| --- | ---: | ---: |
| High | 19,570,592 | 159,914 |
| Balanced | 10,074,464 | 85,284 |
| Compact | 5,991,748 | 42,671 |

All 114 models total 35,636,804 bytes. The six selected previews total 928,374
bytes. `LOD3_Map`, inspection and catalogue models, editable sources, tools,
and every unlisted asset remain excluded.

## Exact authorization boundary

On 2026-08-04, Ael instructed the project to use Warpkeep-Assets 3D objects in
the official Inner Keep and to make the Grand Covenant Cathedral its main
building. That instruction authorizes the exact 114 GLBs and six PNG previews
at selection digest
`00304c5dbf819cec6cb656996c1105f64efcf36acf8099c431f5b04b822679f0`
for the public `ael-dev3/Warpkeep` repository and official `warpkeep.com`
client.

This is runtime-use authorization only. It does not relicense the source
archive, authorize unlisted or substitute files, grant general derivative or
redistribution rights, or approve activation, merge, or deployment. The
selected media remains `LicenseRef-Warpkeep-Provenance-Required`; mixed source
terms and provenance continue to apply.

Three separately authorized Realm tree families may be reused under their own
dated record. This selection does not duplicate those files or broaden their
permission.

## Local audit and installation

Place the exact archive and trusted release manifest in a private local cache,
or point the commands at trusted offline files:

```sh
WARPKEEP_INNER_KEEP_ARCHIVE=/trusted/offline/inner-keep-3d-asset-library-2026-08-02-v1.zip \
WARPKEEP_INNER_KEEP_RELEASE_MANIFEST=/trusted/offline/manifest.json \
  npm run assets:audit:inner-keep

WARPKEEP_INNER_KEEP_ARCHIVE=/trusted/offline/inner-keep-3d-asset-library-2026-08-02-v1.zip \
WARPKEEP_INNER_KEEP_RELEASE_MANIFEST=/trusted/offline/manifest.json \
  npm run prepare:inner-keep-assets
```

The audit validates the full ZIP member set and extracts only allowlisted
members into a temporary private directory. Installation writes only the 120
recorded content-addressed outputs after exact byte, hash, and structure
verification. Ordinary builds never read the source archive or use the
network; they verify the installed files already in the repository.
