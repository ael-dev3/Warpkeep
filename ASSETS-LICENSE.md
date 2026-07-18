# Warpkeep Asset Licensing and Provenance

This file records the license and provenance status of runtime media, archived references, generated derivatives, and asset manifests. Repository presence or delivery by Ael does not by itself establish copyright ownership or transferable licensing authority.

## Active policy

Active project-owned creative-content license: CC-BY-4.0

Through v0.2.0, confirmed project-owned creative material was made available under the historical `CC0-1.0` policy. Beginning with v0.3.0, new or modified confirmed project-owned creative material is licensed under `CC-BY-4.0` where Warpkeep has authority to grant it.

Historical CC0 versions remain available under CC0-1.0. Third-party and externally governed assets remain under their original terms. No future license is assigned to an asset whose authority is incomplete or ambiguous.

## Classification rules

- **Project-owned:** the provenance record expressly identifies the material as project-owned and records the authority supporting that classification. This status must be confirmed again before future modifications.
- **Project-provided:** an asset was supplied to the repository, but supply does not prove ownership. Treat it as externally governed or unresolved unless the record establishes the right to license it.
- **Generated derivative:** a transformed or generated output inherits the source-rights question; generation does not automatically create a new Warpkeep license.
- **Reference-only:** archived for art direction or provenance and not a runtime dependency.
- **Metadata:** manifests and technical records are project-authored documentation, but they do not change the license of the media they describe.

## Software license

Source code, scripts, configuration, tests, and other new or modified v0.3 software are under Apache-2.0; see [`LICENSE`](LICENSE). Historical 0BSD grants remain valid at [`licenses/legacy/LICENSE-0BSD-v0.2.0`](licenses/legacy/LICENSE-0BSD-v0.2.0). Neither policy relicenses dependencies or upstream tools.

## Documentation, lore, and manifests

Project-authored documentation, design notes, lore, and manifests follow the historical `CC0-1.0` policy through v0.2.0 and the active `CC-BY-4.0` policy for new or modified confirmed project-owned material from v0.3.0. Documentation that records external source terms does not grant those terms away.

## Hegemony menu media provenance

The 2026-07-10 title-to-menu milestone uses project-provided media supplied for this repository. This record preserves the files and transformations; it does not establish copyright ownership, upstream permissions, or a future CC-BY-4.0 grant for the source media or its derivatives.

| Intended use | Project-provided source | Repository file | Technical record |
| --- | --- | --- | --- |
| Animated menu plate | `warpkeep_menu_loop_clean_hq_max_coverage_1080p_no_audio.mp4` | `public/video/warpkeep-menu-loop-v2.mp4` | Source: 7,561,210 bytes, SHA-256 `5ef6c41af8231665dadd0c214e23875e2f994dcd257e8ce98bf7bfd8ab0e5fa0`. Runtime derivative: 1920×1080, 24 fps, 337 frames, H.264 High Level 4.1 with four reference frames, yuv420p limited-range BT.709, no audio, 14.041667 s, 5,713,248 bytes, SHA-256 `6034f049e8ee25a412fdc1f8c7ccce1ab403a58eac9158e1d0b55a6bfa99260c`. The timeline begins at source 1.000 s and ends with an exact-endpoint 24-frame linear tail-to-head blend; the repaired wrap is 66.405% less discontinuous, and the fast-start film retains exact cadence and identical boundaries over three audited loops. |
| Immediate menu fallback | Color-managed derivative of runtime video frame 0 | `public/images/menu/warpkeep-menu-poster-v2.webp` | 1920×1080 WebP, quality 84/method 6 with embedded sRGB ICC, 249,626 bytes, SHA-256 `d0fa4d4fbd893369a78d7ada828723e7612f95bbf4d8ee0eeef9858a33ce581c`. The tagged BT.709 frame is converted to sRGB; poster-to-video RGB mean absolute error measured 2.332/255 in Chromium and 2.173/255 through macOS ColorSync. |
| Hegemony menu score | `Sunset Hegemony.mp3` | `public/audio/warpkeep-menu-theme.mp3` | Original bytes preserved: stereo 48 kHz MP3, 401.919979 s decoded program, 9,631,066 bytes, SHA-256 `ea2a77cf5a2729e4a90a7ccbfe9a37ab1387c9371232b5219843e1715fa17917`. Runtime uses two cached elements and a 1.792 s equal-power overlap beginning at 400.128 s. |
| Hegemony Lowlands score | `Lowlands Of Hegemony.mp3` | `public/audio/warpkeep-lowlands-theme.mp3` | Exact original is archived under `docs/reference/audio/2026-07-11-lowlands-of-hegemony/`: 5,722,488 bytes, SHA-256 `3a04a006e10771c738edacd47150d6039a4eda4faee6bf47f64813b134f81908`, MP3 48 kHz stereo plus a 360×360 MJPEG cover. Runtime is an audio-stream-only copy: 5,704,657 bytes, SHA-256 `d75a8865eda00c808c472d438240a5f645173dead353d44925f34cee500fa13c`, with a 8.919979 s equal-power loop from 236.000 through 244.919979 seconds. |
| Composition reference only | `warpkeep-main-menu-reference.png` | `docs/reference/menu/2026-07-10/warpkeep-main-menu-reference.png` | 1555×1011 PNG, 2,653,834 bytes, SHA-256 `dc7ad4319cf8d37e3e127a0954ac9ed982ed37031ac672ef614f84311c10277c`. Never served as the runtime page or poster; all menu lettering is live HTML/CSS. |

The original 1280×720 runtime film and poster were superseded on 2026-07-11. Their filenames, hashes, and derivation details remain in the dated menu manifest as a historical record.

The unresolved-rights source film/audio binaries are not present in the v0.3.0 HEAD and were not uploaded to a public asset release. Exact technical records remain in `docs/reference/`; required runtime derivatives remain in `public/` under the same unresolved source terms.

## WARPKEEP stone title provenance

The optimized WARPKEEP stone-letter assemblies were supplied with explicit v0.3 archival and CC-BY-4.0 authorization. Source/master material is held in the public [Warpkeep-Assets](https://github.com/ael-dev3/Warpkeep-Assets) release [`title-stone-letters-2026-07-12`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/title-stone-letters-2026-07-12); the browser serves only the verified runtime assemblies committed here.

| Profile | Repository file | Technical record |
| --- | --- | --- |
| Cinematic/high title | `public/models/title/warpkeep-title-high.glb` | 3,844,364 bytes, SHA-256 `2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5`, Meshopt-compressed GLB. |
| Balanced/performance title | `public/models/title/warpkeep-title-compact.glb` | 1,714,060 bytes, SHA-256 `d29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8`, Meshopt-compressed GLB. |

Attribution: **WARPKEEP Stone Title Assembly by Clawberto**, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The verified `warpkeep-title-assemblies-v1.zip` release attachment is 5,994,957 bytes with SHA-256 `492af33d4b0ff5ab80f2e726b68c2f8d497cd75bbcc036f57f2388e0b4089177`. `npm run assets:fetch` and `npm run prepare:title-models` reconstruct the runtime files through an explicit cache/offline boundary; ordinary builds never fetch release assets.

## Hegemony Mark currency artwork provenance

The Hegemony Mark currency artwork has an explicit CC-BY-4.0 grant in the immutable [Warpkeep-Assets release `hegemony-mark-2026-07-13`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/hegemony-mark-2026-07-13), pinned to asset-repository commit `23795ce671fa2c7c98e188887b7a444a194a8a1e`. The verified transparent source attachment is a 500×500 RGBA PNG, 407,560 bytes, SHA-256 `059a61fb40d9e04fdaf27327a921ed5a3174ec48c1549512a71fbbb71aeb2b86`. That source/master is not committed to Warpkeep and GitHub Releases are not used as a runtime CDN.

| Runtime size | PNG | Lossless WebP |
| --- | --- | --- |
| 32×32 | `public/images/factions/hegemony/marks/hegemony-mark-32.png` — 2,508 bytes, SHA-256 `5a11e27123b287a663d316c2b307e5be6549cee206383dc17c741762df69363e` | `public/images/factions/hegemony/marks/hegemony-mark-32.webp` — 2,060 bytes, SHA-256 `1ad2faaea36b80bfdd2140ea9d401a49d96766a4bf2d7a439a8dbaac814c1449` |
| 64×64 | `public/images/factions/hegemony/marks/hegemony-mark-64.png` — 8,122 bytes, SHA-256 `773cdd9cae90a5030182d50689a3e6322cb628b8732a528d2a3563c9468b2bbb` | `public/images/factions/hegemony/marks/hegemony-mark-64.webp` — 6,230 bytes, SHA-256 `f99a96695ed7bf7278b5273d8d6362df70e4b7d2112cdddd22adb1912a08289a` |
| 128×128 | `public/images/factions/hegemony/marks/hegemony-mark-128.png` — 28,910 bytes, SHA-256 `e694e586f9fa061c2ebcfe0a852f53f20a9b90794c3bbf5fd31d514a83bf5728` | `public/images/factions/hegemony/marks/hegemony-mark-128.webp` — 20,364 bytes, SHA-256 `3cbae6967d54a709efb2e9a455040fdb89b5fb1e682ebeddbfda71d39b0b260e` |
| 256×256 | `public/images/factions/hegemony/marks/hegemony-mark-256.png` — 104,050 bytes, SHA-256 `8515b544c231a78f41f80731b74caeeca1cd93dbad6313a424f95fe669a25852` | `public/images/factions/hegemony/marks/hegemony-mark-256.webp` — 67,172 bytes, SHA-256 `55814b1b150f268426b1a49bffea5a377ca7a62adad526d2e09c48966428dc86` |

Attribution: **Warpkeep Hegemony Mark currency artwork by the Warpkeep project**, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The grant covers the named source PNG and faithful runtime derivatives to the extent copyright and related rights are controlled by the Warpkeep project. It does not license OpenAI services, names, trademarks, third-party rights, or Warpkeep trademarks and canonical identity. The complete release coordinates, deterministic Sharp/libvips settings, decoded-pixel hashes, alpha audit, and visual QA are in the [runtime manifest](docs/reference/factions/hegemony/2026-07-13-hegemony-mark/runtime-manifest.json).

## Hegemony resource icon provenance

The gold-stack, food, stone, and wood icons were supplied by the Warpkeep
project owner on 2026-07-17 with instructions to add transparent resource
icons to the draft Alpha 0.3.6 mechanics PR. Those instructions authorize the
exact background-cleaned reference PNGs in this public Warpkeep repository and
future official Pages runtime use after the corresponding mechanic receives
separate review. The reviewed Alpha 0.3.6 integration retains the exact masters
beside their records, outside `public/`, and does not copy the images or mount
placeholder resource counters into Pages; the instruction
does not establish underlying ownership, grant a separate public
open-content licence, authorize general third-party derivative or
redistribution use, or grant trademark, canonical-identity, currency, reward,
or entitlement rights.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Planned gold-resource presentation | `docs/reference/resources/2026-07-17-hegemony-gold-icon/hegemony-gold-reference.png` | 1254×1254 RGBA PNG, 1,142,819 bytes, SHA-256 `87dddaa91a23f630e86da35da8b5b7300c0ecce9fb850060c0c18b0f2de72f26`; background-cleaned through the recorded image-edit and chroma-matte workflow. |
| Planned food-resource presentation | `docs/reference/resources/2026-07-17-hegemony-food-icon/hegemony-food-reference.png` | 1254×1254 RGBA PNG, 1,849,831 bytes, SHA-256 `d1e295299f710be2b04249d6a96e0abd53ccc6d2bd74560428ee0964f5fff474`; background-cleaned through the recorded image-edit and chroma-matte workflow. |
| Planned stone-resource presentation | `docs/reference/resources/2026-07-17-hegemony-stone-icon/hegemony-stone-reference.png` | 1254×1254 RGBA PNG, 1,107,308 bytes, SHA-256 `dcf32bfe714b82c81a9db0d13bff0f176689ff35ff6c0554c3f7c0c8f24fa6e0`; background-cleaned through the recorded image-edit and chroma-matte workflow. |
| Planned wood-resource presentation | `docs/reference/resources/2026-07-17-hegemony-wood-icon/hegemony-wood-reference.png` | 1254×1254 RGBA PNG, 1,190,014 bytes, SHA-256 `e8b586724afd1082c38c89f86de6d854b86234696b3978633be96152bc17c93a`; background-cleaned through the recorded image-edit and chroma-matte workflow. |

The source attachments and chroma-key intermediates are not committed. Their
hashes, edit prompts, cleanup parameters, decoded RGBA hashes, alpha profiles,
and visible bounds are recorded in the [dated gold icon record](docs/reference/resources/2026-07-17-hegemony-gold-icon/manifest.json), [dated food icon record](docs/reference/resources/2026-07-17-hegemony-food-icon/manifest.json), [dated stone icon record](docs/reference/resources/2026-07-17-hegemony-stone-icon/manifest.json), and [dated wood icon record](docs/reference/resources/2026-07-17-hegemony-wood-icon/manifest.json). The reference masters remain under
`LicenseRef-Warpkeep-Provenance-Required`; neither their inclusion as dormant
reference masters nor a future gameplay implementation silently relicenses them.

## Hegemony Gold Mine inspection artwork

On 2026-07-18, the Warpkeep project owner supplied a high-resolution Gold Mine
visual and instructed PR #49 to polish it into a transparent inspection-card
derivative. That authorization covers this exact checked-in output in the
public Warpkeep GitHub repository and official `warpkeep.com` Pages runtime,
but does not establish underlying ownership, a public/open-content licence,
general derivative or redistribution rights, trademark rights, or authority to
place a Gold Mine, expose a balance, or activate gathering.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Decorative Gold Mine inspection card artwork | `public/images/realm/hegemony-gold-mine-record.webp` | 1254×1254 transparent WebP, 218,736 bytes, SHA-256 `a2c52a5e1536860ce3ad778c1719e354637fe473495c45ee927c99f468c60fa3`; generated from the supplied 1254×1254 reference through the recorded image-edit and chroma-matte workflow. |

The exact source attachment and image-generation/chroma-matte intermediates are
not committed. Their hashes, prompt, cleanup parameters, decoded RGBA hash,
alpha profile, and visible bounds are recorded in the dated [Gold Mine
inspection-art record](docs/reference/resources/2026-07-18-hegemony-gold-mine/record-art/manifest.json).
The card is currently standalone and unmounted; its decorative image grants no
resource, currency, reward, entitlement, map-placement, or Gold/Marks authority.

## Hegemony Gold Mine review candidates

On 2026-07-18, the Warpkeep project owner supplied three exact Gold Mine runtime
candidate GLBs and requested a standalone draft-review preparation. That narrow
request authorizes preserving the exact candidate bytes and project-authored
technical record in this review work only. It does not establish underlying
ownership, a separate public/open-content licence, general derivative or
redistribution rights, trademark rights, official Pages delivery, or permission
to activate the models in game presentation.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Unintegrated High Gold Mine candidate | `docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime-candidates/hegemony-gold-mine-high-6c3731e0f3381014.glb` | 263,528 bytes, SHA-256 `6c3731e0f3381014d661d539c25f67e4f79f894b721d1feac9e275b07b8a6ab3`, 4,233 triangles, three 1024×1024 embedded WebPs. |
| Unintegrated Balanced Gold Mine candidate | `docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime-candidates/hegemony-gold-mine-balanced-42776e6a0a1196c.glb` | 154,388 bytes, SHA-256 `42776e6a0a1196c43e872d9d6d08a8acbf398b5dbd26ba7ab20e0c0cfdd52008`, 3,553 triangles, three 512×512 embedded WebPs. |
| Unintegrated Compact Gold Mine candidate | `docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime-candidates/hegemony-gold-mine-compact-b39ad147954ba420.glb` | 95,024 bytes, SHA-256 `b39ad147954ba4200efe680975038416784f759918ca295282d95812710ca853`, 2,681 triangles, three 256×256 embedded WebPs. |

The supplied `runtime-manifest.json` is 2,191 bytes with SHA-256
`9bb0bcf28b3b2f073d8f4a9cdbe5c2ad1d41d921668f25172a2105f52fd82dd4`.
Its High profile is internally consistent. The exact supplied Balanced and
Compact files have 512×512 and 256×256 WebP atlases but retain
`materials[0].extras.wk_atlas_size: 1024`; this staging record preserves their
bytes without correction. A later approved integration needs a separately
reviewed decision and new immutable output records before moving any candidate
under `public/`. The dated [Gold Mine record](docs/reference/resources/2026-07-18-hegemony-gold-mine/)
contains the complete candidate boundary. All three remain
`LicenseRef-Warpkeep-Provenance-Required` and do not create a live Gold balance,
currency, reward, entitlement, or link to Community Marks.

## Historical Hegemony Frontier Keep provenance

The Hegemony Frontier Keep and its former runtime derivatives were project-provided media supplied for this repository. The 63 MB source remains byte-for-byte identifiable through its technical record but is not present in the current tree or a public release while redistribution authority is unresolved. The three former runtime derivatives are also retired and absent; their future license follows the source-rights determination, not the fact of conversion.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Restricted source record | Not present in v0.3.0 HEAD/public releases | 63,263,296 bytes, SHA-256 `fd31cd99ce2c81a3bb149915954ee72009f1db0ebb8a9e972747e21294d5986d`, 941,298 source triangles, four embedded JPEG textures. Never served at runtime. |
| Former high runtime keep | `public/models/hegemony/hegemony-frontier-keep-high.glb` — absent | 2,256,092 bytes, SHA-256 `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c`, 56,466 triangles, four 2048×2048 WebP textures, Meshopt compression. |
| Former balanced runtime keep | `public/models/hegemony/hegemony-frontier-keep-balanced.glb` — absent | 2,064,100 bytes, SHA-256 `bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4`, 37,634 triangles, four 2048×2048 WebP textures, Meshopt compression. |
| Former compact runtime keep | `public/models/hegemony/hegemony-frontier-keep-compact.glb` — absent | 760,916 bytes, SHA-256 `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b`, 17,536 triangles, four 1024×1024 WebP textures, Meshopt compression. |

The retired files are not reproducible through an executable checked into the
active repository. The former generator fetched an unverified CLI, inherited
the developer environment, and could write unresolved-rights outputs into
`public/`; it was removed rather than preserved as a misleading private tool.
The exact historical arguments, hashes, and technical metadata remain in the
dated castle record. Any future reproduction requires separately reviewed,
integrity-pinned offline tooling, a credential-free process, a private
non-public destination, and confirmed source authority.

## Hegemony Main Castle GameReady runtime assets

The active Hegemony Main Castle family comes from the exact, owner-supplied
GameReady package identified as **Warpkeep Hegemony Castle — Archer/Mage
Platforms**. On 2026-07-16, the Warpkeep project owner explicitly authorized
the package's three named GLBs for integration into this public Warpkeep GitHub
repository and its official `warpkeep.com` Pages runtime, together with the
bounded deterministic metadata correction described below. This authorization
permits their checked-in and official runtime use by Warpkeep;
it does not grant a separate public open license, relicense the inputs or
outputs as CC-BY-4.0 or Apache-2.0, create a general third-party derivative or
redistribution grant, or grant trademark or canonical-identity rights.

The supplied `asset-manifest.json` is 1,456 bytes with SHA-256
`6a4a67baa4912f93337b7100d27ffe65e9c185492e8c2047c4d2ccdefe591c23`.
The installer accepts only that manifest and the exact authorized input hashes.
High is committed byte-for-byte. Balanced and Compact contained correct
embedded 1024×1024 and 512×512 WebP payloads but incorrectly declared
`wk_atlas_size: 2048`; the deterministic helper corrects only that material
metadata and repacks GLB padding/offsets while preserving every geometry and
embedded-image payload byte.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| High runtime castle | `public/models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb` | 2,215,972 bytes, SHA-256 `9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8`, 72,850 triangles, 171,554 uploaded vertices, unsigned 32-bit indices, two embedded 2048×2048 WebP images, Meshopt compression. |
| Balanced runtime castle | `public/models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb` | 892,788 bytes, SHA-256 `a9df1a9acd36e7208b764396854053a6e3c591f2eb04a83a6e2437c55a3aa157`, 32,550 triangles, 67,687 uploaded vertices, unsigned 32-bit indices, two embedded 1024×1024 WebP images, Meshopt compression. |
| Compact runtime castle | `public/models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb` | 453,628 bytes, SHA-256 `b665d75e10e3e289dac09ebb9f0eeec75469dda77fb25265b03b5ad6081c627b`, 17,232 triangles, 34,800 uploaded vertices, unsigned 16-bit indices, two embedded 512×512 WebP images, Meshopt compression. |

The browser serves only the checked-in, integrity-verified runtime files; the
supplied package is never a runtime CDN. Reinstall only from an authorized
exact package root with `WARPKEEP_CASTLE_GAMEREADY_ROOT` and
`npm run prepare:hegemony-castle`, then run
`npm run verify:runtime-assets`. The dated
[GameReady castle record](docs/reference/castles/2026-07-16-hegemony-main-castle-gameready/)
preserves the exact inputs, outputs, correction boundary, and authorization.

The 2026-07-15 public-source derivative set is superseded as the application
asset family, but its exact three binaries remain checked in at their legacy
unhashed URLs for cached-client and verified-rollback compatibility.
`scripts/prepare-hegemony-main-castle.mjs` is historical comparison tooling, not
an installer for either the active or compatibility paths. Their immutable
technical record remains in the
[historical castle record](docs/reference/castles/2026-07-15-hegemony-main-castle/).
The GameReady geometry has accepted profile-relative size and height
differences. This asset change does not itself claim brighter materials; castle
lighting and palette remain renderer concerns.

## Hegemony Castle Landscape Base GameReady runtime assets

The island, road, tree, rock, bush, flower, and grass landscape under each
active Hegemony Main Castle comes from the exact owner-supplied package
identified as **Warpkeep Castle Landscape Base**, asset ID
`warpkeep.castle-landscape-base`, version `1.0.0`. On 2026-07-16, the Warpkeep
project owner explicitly instructed PR #40 to add these bases under the game's
castles and deploy the patch. That instruction authorizes integration of the
exact three named GLBs into this public Warpkeep GitHub repository and its
official `warpkeep.com` Pages runtime, plus the bounded deterministic metadata
correction below. It does not grant a separate public open license,
relicense inputs or outputs as CC-BY-4.0 or Apache-2.0, create a general
third-party derivative or redistribution grant, or grant trademark,
canonical-identity, or same-named-file substitution rights.

The supplied `asset-manifest.json` is 2,177 bytes with SHA-256
`106d64f5eaf91332acc83c18d5abbd9ad230b17eb4c9ffee1231ecf7d595d3f5`.
The installer accepts only that package identity and the exact authorized input
hashes. High is committed byte-for-byte. Balanced and Compact contain correct
embedded 512×512 and 256×256 WebPs but declare `wk_atlas_size: 1024`; the
deterministic correction changes only that material metadata and necessary GLB
container padding/offsets while preserving every geometry and image payload
byte.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| High castle landscape base | `public/models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb` | 214,372 bytes, SHA-256 `be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c`, 3,954 triangles, 10,681 POSITION entries, two embedded 1024×1024 WebPs, Meshopt compression. |
| Balanced castle landscape base | `public/models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb` | 92,784 bytes, SHA-256 `179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f`, 2,138 triangles, 5,611 POSITION entries, two embedded 512×512 WebPs, Meshopt compression. |
| Compact castle landscape base | `public/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb` | 27,328 bytes, SHA-256 `f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3`, 714 triangles, 1,780 POSITION entries, two embedded 256×256 WebPs, Meshopt compression. |

The castle and base must receive the exact same parent transform. The base is
never independently centered, normalized, grounded, or scaled; its below-ground
skirt and `+Z` road direction are authored placement. The complete family is
classified as `LicenseRef-Warpkeep-Provenance-Required`. Neither its location
under `public/` nor metadata-only correction changes that status. The dated
[GameReady landscape-base record](docs/reference/castles/2026-07-16-hegemony-castle-landscape-base-gameready/)
preserves exact inputs, outputs, embedded-image hashes, placement contract,
performance budgets, and authorization boundary.

## Hegemony castle record artwork

The Alpha 0.3.5 castle inspection card uses one transparent decorative WebP
prepared from 2D castle art supplied by the Warpkeep project owner on 16 July
2026. The owner explicitly instructed PR #40 to remove the supplied background
and deploy the cleaned result in Warpkeep. That instruction authorizes this
exact checked-in use in the public Warpkeep GitHub repository and its official
`warpkeep.com` Pages runtime; it does not establish underlying ownership,
grant a separate public open-content licence, authorize general third-party
derivatives or redistribution, or grant trademark or canonical-identity rights.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Castle record decoration | `public/images/realm/hegemony-castle-record.webp` | 1254×1254 alpha WebP, 145,416 bytes, SHA-256 `30e0c3cd1bbc4732bb5025a78a5dc0cc66bc01c1b752a3f21b48fb429cc11123`; background-cleaned through the exact recorded image-edit and chroma-matte workflow. |

The two source attachments and the generated chroma-key intermediate are not
committed. Their exact hashes, the complete edit prompt, cleanup parameters,
decoded RGBA hash, alpha profile, and visible bounds are recorded in the
[dated castle record](docs/reference/castles/2026-07-16-hegemony-castle-record-art/).
The runtime file remains under `LicenseRef-Warpkeep-Provenance-Required`; neither
its location in `public/` nor the cleanup operation silently relicenses it.

## Trademark and endorsement note

These licenses do not grant trademark rights or imply endorsement by the project. Forks, mods, and community realms should avoid presenting themselves as the canonical Warpkeep deployment unless explicitly authorized; see [`TRADEMARKS.md`](TRADEMARKS.md).
