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
separate review. Alpha 0.3.7's reviewed shared-world resource authority activates
that narrow official runtime permission. The exact masters remain beside their
records outside `public/`; Pages serves only the faithful 64×64 derivatives at
immutable SHA-256-prefixed paths. The instruction does not establish underlying
ownership, grant a separate public open-content licence, authorize general
third-party derivative or redistribution use, or grant trademark,
canonical-identity, currency, reward, or entitlement rights.

| Resource | Provenance master | 64×64 RGBA PNG | 64×64 lossless WebP | Decoded RGBA SHA-256 |
| --- | --- | --- | --- | --- |
| Food | `docs/reference/resources/2026-07-17-hegemony-food-icon/hegemony-food-reference.png` — 1,849,831 bytes, SHA-256 `d1e295299f710be2b04249d6a96e0abd53ccc6d2bd74560428ee0964f5fff474` | `public/images/resources/hegemony-food-c2034046ead78f5f.png` — 7,567 bytes, SHA-256 `c2034046ead78f5f23a79ae2fb742352c8c353586d0761e63bf725054bf5d3a4` | `public/images/resources/hegemony-food-5c012a7e939f8796.webp` — 6,314 bytes, SHA-256 `5c012a7e939f879698921bfb2d17a1007d5635cf6bfbaa8477205cef2375c509` | `c80fc693e2b3bf56836fe7f235e4ee457f8e7203892b72139f3c98b7ee05fcad` |
| Gold | `docs/reference/resources/2026-07-17-hegemony-gold-icon/hegemony-gold-reference.png` — 1,142,819 bytes, SHA-256 `87dddaa91a23f630e86da35da8b5b7300c0ecce9fb850060c0c18b0f2de72f26` | `public/images/resources/hegemony-gold-3d087ebe1ba2beaf.png` — 6,578 bytes, SHA-256 `3d087ebe1ba2beaf5590b93fcccde998546c4eb1c5e3c124a694a85683241d9a` | `public/images/resources/hegemony-gold-522eb5b1f40b5d51.webp` — 5,704 bytes, SHA-256 `522eb5b1f40b5d51395301a9f85b99e9f96008140e6c24d33c38b795546b9689` | `fc8afe04499adf8c0f0e1cb8c95e2cadb302365d9acca4e41ca595aff2caf256` |
| Stone | `docs/reference/resources/2026-07-17-hegemony-stone-icon/hegemony-stone-reference.png` — 1,107,308 bytes, SHA-256 `dcf32bfe714b82c81a9db0d13bff0f176689ff35ff6c0554c3f7c0c8f24fa6e0` | `public/images/resources/hegemony-stone-e23ed963027579c7.png` — 6,149 bytes, SHA-256 `e23ed963027579c7dd6e465414e3a171aba622d25009af9d4d1077f568fa7f7b` | `public/images/resources/hegemony-stone-ac50a538fc202d15.webp` — 4,366 bytes, SHA-256 `ac50a538fc202d15b378649f4778c88d1a312bced1dd8f3f7cdbb829a50841de` | `97f48ef84d6f768f4e1b2242ae90eaa80e1aeba92de75c8c85b5843b854c0278` |
| Wood | `docs/reference/resources/2026-07-17-hegemony-wood-icon/hegemony-wood-reference.png` — 1,190,014 bytes, SHA-256 `e8b586724afd1082c38c89f86de6d854b86234696b3978633be96152bc17c93a` | `public/images/resources/hegemony-wood-d992823f7a7f2999.png` — 5,729 bytes, SHA-256 `d992823f7a7f2999eff03c77f68ab0c24a952ba6018bab4ee86ccd8f2dd3f689` | `public/images/resources/hegemony-wood-add35506da245240.webp` — 4,386 bytes, SHA-256 `add35506da245240c245c8605433108b188b03c94eadab400b2cb9bab956c92c` | `3686140686a8801ca17fb10a12ed22368a0ad1fab5fc76a2d2b0b73cdb0d8479` |

Reconstruct with `node scripts/prepare-hegemony-resource-icons.mjs`. The
offline-only script accepts no source or destination override, requires each
exact checked-in 1254×1254 RGBA master by path, length, SHA-256, decoded RGBA
hash, and alpha profile, and pins Sharp 0.35.3 with libvips 8.18.3, libpng
1.6.58, and libwebp 1.6.0. Decoding fails on warnings and is capped at
1,572,516 input pixels. It disables SIMD and Sharp caching, uses concurrency 1,
and resizes with Lanczos3, `fit: fill`, and `fastShrinkOnLoad: false`. PNG
uses RGBA8, compression level 9, adaptive filtering, effort 10, no palette,
and no progressive encoding. WebP uses lossless mode, quality and alpha quality
100, effort 6, the icon preset, no smart subsampling, and exact transparent
RGB. The complete eight-file family is validated before rollback-safe staged
replacement; unexpected directory entries fail closed.

The source attachments and chroma-key intermediates are not committed. Their
hashes, edit prompts, cleanup parameters, decoded RGBA hashes, alpha profiles,
and visible bounds are recorded in the [dated gold icon record](docs/reference/resources/2026-07-17-hegemony-gold-icon/manifest.json), [dated food icon record](docs/reference/resources/2026-07-17-hegemony-food-icon/manifest.json), [dated stone icon record](docs/reference/resources/2026-07-17-hegemony-stone-icon/manifest.json), and [dated wood icon record](docs/reference/resources/2026-07-17-hegemony-wood-icon/manifest.json). The reference masters remain under
`LicenseRef-Warpkeep-Provenance-Required`; neither the provenance masters nor
their faithful runtime encodings are silently relicensed by their location.

## Hegemony Gold Mine inspection artwork

On 2026-07-18, the Warpkeep project owner supplied a high-resolution Gold Mine
visual and instructed PR #49 to polish it into a transparent inspection-card
derivative. That authorization covers this exact checked-in output in the
public Warpkeep GitHub repository and an eventual official `warpkeep.com`
Pages runtime after separately approved deployment. It is use authorization
only, not deployment approval, and does not establish underlying ownership, a
public/open-content licence, general derivative or redistribution rights,
trademark rights, or authority to place a Gold Mine, expose a balance, or
activate gathering.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Decorative Gold Mine inspection card artwork | `public/images/realm/hegemony-gold-mine-record.webp` | 1254×1254 transparent WebP, 218,736 bytes, SHA-256 `a2c52a5e1536860ce3ad778c1719e354637fe473495c45ee927c99f468c60fa3`; generated from the supplied 1254×1254 reference through the recorded image-edit and chroma-matte workflow. |

The exact source attachment and image-generation/chroma-matte intermediates are
not committed. Their hashes, prompt, cleanup parameters, decoded RGBA hash,
alpha profile, and visible bounds are recorded in the dated [Gold Mine
inspection-art record](docs/reference/resources/2026-07-18-hegemony-gold-mine/record-art/manifest.json).
The reviewed draft integration mounts the card as decorative inspection art
only; it grants no resource, currency, reward, entitlement, map-placement, or
Gold/Marks authority. No Pages deployment is authorized by this record.

## Hegemony Stone Quarry inspection artwork

On 2026-07-19, the Warpkeep project owner supplied a Stone Quarry visual and
instructed draft PR #65 to prepare a high-resolution UI element in the
same careful inspection-art pattern. That authorization covers this exact
checked-in output in the public Warpkeep GitHub repository and an eventual
official `warpkeep.com` Pages runtime after separately approved deployment. It
is use authorization only, not deployment approval, and does not establish
underlying ownership, a public/open-content licence, general derivative or
redistribution rights, trademark rights, or authority to place a Stone Quarry,
expose a balance, or activate gathering.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Decorative Stone Quarry inspection-card artwork | `public/images/realm/hegemony-stone-quarry-record.webp` | 1254×1254 transparent WebP, 186,736 bytes, SHA-256 `86b13c14a0eda7403c3583d886be3242e04d7ef9e442fcfdbcc054642421a70a`; generated from the supplied reference through the recorded image-edit and chroma-matte workflow. |

The exact source attachment and image-generation/chroma-matte intermediates are
not committed. Their hashes, prompt, cleanup parameters, decoded RGBA hash,
alpha profile, and visible bounds are recorded in the dated [Stone Quarry
inspection-art record](docs/reference/resources/2026-07-18-hegemony-stone-quarry/record-art/manifest.json).
The prepared panel is mounted only through the separately reviewed canonical
Stone-site integration; it grants no resource, currency, reward, entitlement,
map-placement, Stone/Marks authority, or Pages deployment.

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
`materials[0].extras.wk_atlas_size: 1024`; this candidate record preserves their
source bytes without correction. The 2026-07-18 Gold Wagon integration uses a
separate reviewed runtime-output record below; browser code must never import
these candidate paths or substitute them for the digest-bearing public outputs.
The dated [Gold Mine candidate record](docs/reference/resources/2026-07-18-hegemony-gold-mine/)
preserves the full historical boundary. All three remain
`LicenseRef-Warpkeep-Provenance-Required` and do not independently create a live
Gold balance, currency, reward, entitlement, or link to Community Marks.

## Hegemony Gold Mine runtime assets

On 2026-07-18, the Warpkeep project owner instructed the Gold Wagon integration
to use all available project assets. That authorizes the three exact reviewed
Gold Mine runtime outputs below in the public Warpkeep GitHub repository and
an eventual official `warpkeep.com` Pages runtime after separately approved
deployment. This is use authorization only, not deployment approval. It does
not establish underlying
ownership, a separate public/open-content licence, general derivative or
redistribution rights, trademark rights, or Gold/Marks, site, occupation,
dispatch, route, reward, or settlement authority.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Selected/near Gold Mine | `public/models/hegemony/gathering-nodes/gold-mine/hegemony-gold-mine-high-6c3731e0f3381014.glb` | Exact supplied High bytes: 263,528 bytes, SHA-256 `6c3731e0f3381014d661d539c25f67e4f79f894b721d1feac9e275b07b8a6ab3`, 4,233 triangles, three 1024×1024 embedded WebPs. |
| Nearby Gold Mine | `public/models/hegemony/gathering-nodes/gold-mine/hegemony-gold-mine-balanced-96a467baaf1dfba4.glb` | 154,380 bytes, SHA-256 `96a467baaf1dfba44d9c21e2ceb18348b564e3cdfe7daffb6d6bcd209634af42`, 3,553 triangles, three 512×512 embedded WebPs; only `material.extras.wk_atlas_size` is normalized from 1024 to 512. |
| Distant Gold Mine | `public/models/hegemony/gathering-nodes/gold-mine/hegemony-gold-mine-compact-d2644366898cf610.glb` | 95,016 bytes, SHA-256 `d2644366898cf610c9824761ff01fb43346d9db92a8a13be0569b3d49557dd6f`, 2,681 triangles, three 256×256 embedded WebPs; only `material.extras.wk_atlas_size` is normalized from 1024 to 256. |

The original candidate GLBs remain unchanged under `docs/reference/` as audit
evidence. The checked-in output family is verified by
`node scripts/verify-hegemony-gold-mine-runtime.mjs`; ordinary builds only
verify it and never fetch or prepare the owner-supplied package. The dated
[runtime record](docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime/manifest.json)
pins input/output hashes, the bounded metadata repair, orientation, and the
visual-only scope boundary.

## Hegemony Wheat Farm runtime assets

On 2026-07-18, the Warpkeep project owner supplied the named Wheat Farm runtime
delivery and instructed a separate draft PR to add Tier 1 Food nodes. That
instruction authorizes only the three exact digest-bearing GLBs below in the
public Warpkeep repository and an eventual official `warpkeep.com` Pages
runtime after separately approved merge and deployment. It is runtime-use
authorization only, not approval to merge, deploy, seed a world, or activate
Food gathering.

The supplied `runtime-manifest.json` is 2,845 bytes with SHA-256
`04beb96110a84593ebab8e2cd1b8fff59421a1eb498806bed2527dd43607a923` and
declares the package as project-owned and authored for Warpkeep. That narrow
delivery record does not establish a separate public/open-content licence,
general derivative or redistribution rights, trademark rights, or Food
account, balance, placement, occupancy, route, worker, reward, collection,
settlement, timing, or SpacetimeDB authority.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Selected/near Wheat Farm | `public/models/hegemony/gathering-nodes/wheat-farm/hegemony-wheat-farm-high-d1437bc1cfe81ee.glb` | Exact supplied High bytes: 1,884,180 bytes, SHA-256 `d1437bc1cfe81eef20cc5106acf849df919e6d4008a3b28d380a3d7194ed4ac7`, 17,860 triangles, 40,320 vertices, vertex colors and no embedded textures. |
| Nearby Wheat Farm | `public/models/hegemony/gathering-nodes/wheat-farm/hegemony-wheat-farm-balanced-bab5cbb18b45b6a5.glb` | Exact supplied Balanced bytes: 1,182,004 bytes, SHA-256 `bab5cbb18b45b6a565e2070d4b3f6ed17916e81f70be72203f704eeb86260403`, 10,906 triangles, 25,310 vertices, vertex colors and no embedded textures. |
| Distant Wheat Farm | `public/models/hegemony/gathering-nodes/wheat-farm/hegemony-wheat-farm-compact-a34bfdafd6b8923c.glb` | Exact supplied Compact bytes: 567,908 bytes, SHA-256 `a34bfdafd6b8923c7cf90071d3ad097858fd59ca8df5cd2e776f44b967e9e3e6`, 5,416 triangles, 12,102 vertices, vertex colors and no embedded textures. |

The source manifest marks these runtime exports as provisional. The draft
preserves their exact bytes and does not silently represent that delivery as a
final release. `node scripts/verify-hegemony-wheat-farm-runtime-assets.mjs`
fails closed on unknown, missing, non-regular, changed, reordered, or
structurally incompatible LODs; ordinary builds never fetch, rewrite, or serve
the external delivery package. The dated [Wheat Farm runtime
record](docs/reference/resources/2026-07-18-hegemony-wheat-farm/runtime/manifest.json)
pins the source-manifest facts, bounds, orientation, LOD budgets, collision
guidance, and visual-only scope boundary. This family remains
`LicenseRef-Warpkeep-Provenance-Required`.

## Hegemony Wheat Farm inspection artwork

On 2026-07-18, the Warpkeep project owner instructed PR #57 to polish the
supplied Wheat Farm visual into a transparent inspection-card derivative. That
authorization covers this exact checked-in output in the public Warpkeep GitHub
repository and an eventual official `warpkeep.com` Pages runtime only after
separately approved deployment. It is use authorization only, not deployment
approval, and does not establish underlying ownership, a public/open-content
licence, general derivative or redistribution rights, trademark rights, or
authority to place a Food site, expose a balance, or activate gathering.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Decorative Wheat Farm inspection card artwork | `public/images/realm/hegemony-wheat-farm-record.webp` | 1254×1254 transparent WebP, 224,806 bytes, SHA-256 `466c80380a8d23de043731a7c386e78c9b36a2d2e69fa175db4b87efc3f43eb0`; generated from the supplied 1254×1254 reference through the recorded image-edit and hard chroma-matte workflow. |

The exact source attachment and image-generation/chroma-matte intermediates are
not committed. Their hashes, transformation method, cleanup parameters,
decoded RGBA hash, alpha profile, and visible bounds are recorded in the dated
[Wheat Farm inspection-art record](docs/reference/resources/2026-07-18-hegemony-wheat-farm/record-art/manifest.json).
The reviewed draft integration mounts the card as decorative inspection art
only; it grants no resource, currency, reward, entitlement, map-placement, or
Food authority. No Pages deployment is authorized by this record.

## Hegemony Logging Camp inspection artwork

On 2026-07-19, the Warpkeep project owner instructed PR #62 to use the
supplied high-resolution Logging Camp visual as a transparent inspection-card
derivative. That authorization covers this exact checked-in output in the
public Warpkeep GitHub repository and an eventual official `warpkeep.com`
Pages runtime only after separately approved deployment. It is use authorization
only, not merge or deployment approval; it does not establish ownership, a
public/open-content licence, general derivative or redistribution rights, or
Wood account, balance, placement, occupancy, route, worker, reward, collection,
settlement, timing, or SpacetimeDB authority.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Decorative Logging Camp inspection card artwork | `public/images/realm/hegemony-logging-camp-record.webp` | 1254×1254 transparent WebP, 177,622 bytes, SHA-256 `fb9d171e423a7bd4bfcce1e68cd3faecb38b4904bc528f720e4283522fca1293`; prepared from the supplied 1254×1254 RGB preview through the recorded local foreground-matte workflow. |

The exact source attachment and alpha-matte intermediate are not committed.
Their hashes, transformation method, decoded RGBA hash, alpha profile, and
visible bounds are recorded in the dated [Logging Camp inspection-art
record](docs/reference/resources/2026-07-18-hegemony-logging-camp/record-art/manifest.json).
The reviewed draft integration mounts the card as decorative inspection art
only; it grants no resource, currency, reward, entitlement, map-placement, or
Wood authority. No Pages deployment is authorized by this record.

## Hegemony Logging Camp runtime assets

On 2026-07-18, the Warpkeep project owner supplied the named Logging Camp
runtime delivery and requested a separate Wood-node pull request. That request
authorizes only the three exact digest-bearing GLBs below for review in this
public Warpkeep repository. It is runtime-use authorization only, not approval
to merge, deploy, seed a world, or activate Wood gathering.

The supplied `runtime-manifest.json` is 2,246 bytes with SHA-256
`0385c4e268445fe6529cb2d3285ee9bdd405f23f6ba8fecc8ccdf0d39a62cec2` and
declares the package as project-owned and authored for Warpkeep. That narrow
delivery record does not establish a separate public/open-content licence,
general derivative or redistribution rights, trademark rights, or Wood account,
balance, placement, occupancy, route, worker, reward, collection, settlement,
timing, or SpacetimeDB authority.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Selected/near Logging Camp | `public/models/hegemony/gathering-nodes/logging-camp/hegemony-logging-camp-high-a68c133a4a50654b.glb` | Exact supplied High bytes: 689,328 bytes, SHA-256 `a68c133a4a50654bc611de2b66e6d0d42729aaf0b91b59b7d2b7749566826f70`, 5,030 triangles, 10,952 vertices, vertex colors and no embedded textures. |
| Nearby Logging Camp | `public/models/hegemony/gathering-nodes/logging-camp/hegemony-logging-camp-balanced-227046f89c4150ee.glb` | Exact supplied Balanced bytes: 460,656 bytes, SHA-256 `227046f89c4150eec5b908cc75e162fa9ad489be123fc941714f9ad294b73593`, 3,318 triangles, 7,312 vertices, vertex colors and no embedded textures. |
| Distant Logging Camp | `public/models/hegemony/gathering-nodes/logging-camp/hegemony-logging-camp-compact-ecea536ae18ef3ef.glb` | Exact supplied Compact bytes: 236,252 bytes, SHA-256 `ecea536ae18ef3ef5c6dc5eda158fa33d8e5d3a1e7848478c248a32efac1eccf`, 1,698 triangles, 3,734 vertices, vertex colors and no embedded textures. |

The owner-supplied source directory and editable masters are not committed.
`WARPKEEP_LOGGING_CAMP_RUNTIME_ROOT=/path/to/Runtime npm run
prepare:hegemony-logging-camp-runtime` is an audited offline installer only;
it rejects a changed, incomplete, non-regular, or symbolic source package and
atomically installs exact source bytes without fetching or transforming them.
`node scripts/verify-hegemony-logging-camp-runtime-assets.mjs` runs in ordinary
builds and fails closed on unknown, missing, non-regular, changed, or
structurally incompatible LODs. The dated [Logging Camp runtime
record](docs/reference/resources/2026-07-18-hegemony-logging-camp/runtime/manifest.json)
pins its source-manifest facts, orientation, bounds, LOD budgets, collision
guidance, and visual-only scope boundary. This family remains
`LicenseRef-Warpkeep-Provenance-Required`.

## Hegemony Stone Quarry runtime assets

On 2026-07-18, the Warpkeep project owner supplied the named Stone Quarry
runtime package and instructed an isolated draft PR to start integrating
another node through the established runtime-asset system. That authorizes only
the three exact digest-bearing GLBs below in the public Warpkeep repository and
an eventual official warpkeep.com Pages runtime after separately approved merge
and deployment. It is use authorization only, not approval to merge, deploy,
seed a world, or activate Stone gathering.

The supplied runtime-manifest.json is 2,415 bytes with SHA-256
3351ad854b4e3e173ed557bfb00684f9a7a1b02211822325cb117ff4fcdc9d85 and
declares the package project-owned and authored for Warpkeep. That delivery
does not establish a separate public/open-content licence, general derivative
or redistribution rights, trademark rights, or Stone account, balance,
placement, occupancy, route, worker, reward, collection, settlement, timing,
or SpacetimeDB authority.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Selected/near Stone Quarry | `public/models/hegemony/gathering-nodes/stone-quarry/hegemony-stone-quarry-high-a4a3258f1f28a7d8.glb` | Exact supplied High bytes: 558,036 bytes, SHA-256 `a4a3258f1f28a7d85658b32a0257d3ca5cb810b8f7a010fd5ebbf7cde12c7537`, 5,362 triangles, 11,893 vertices, vertex colours and no embedded textures. |
| Nearby Stone Quarry | `public/models/hegemony/gathering-nodes/stone-quarry/hegemony-stone-quarry-balanced-44573c53850a31ec.glb` | Exact supplied Balanced bytes: 337,788 bytes, SHA-256 `44573c53850a31ec0178f88918d18471309016a5b4edffdcf1d3e42670109925`, 3,346 triangles, 7,162 vertices, vertex colours and no embedded textures. |
| Distant Stone Quarry | `public/models/hegemony/gathering-nodes/stone-quarry/hegemony-stone-quarry-compact-b4dbbc1c55a67c12.glb` | Exact supplied Compact bytes: 166,720 bytes, SHA-256 `b4dbbc1c55a67c120df2f2b54852e30a2de980254216821b4a599a10e2e5030e`, 1,654 triangles, 3,504 vertices, vertex colours and no embedded textures. |

Node scripts/verify-hegemony-stone-quarry-runtime-assets.mjs fails closed on
unknown, missing, non-regular, changed, reordered, or structurally
incompatible LODs. Ordinary builds verify only the checked-in public family and
never fetch, rewrite, or serve the owner-supplied delivery package. The dated
[Stone Quarry runtime record](docs/reference/resources/2026-07-18-hegemony-stone-quarry/runtime/manifest.json)
pins source-manifest facts, bounds, orientation, collision guidance, and the
visual-only scope boundary. This family remains
`LicenseRef-Warpkeep-Provenance-Required`.

## Hegemony Supply Wagon runtime assets

On 2026-07-18, the same project-owner instruction authorizes the exact reviewed
Hegemony Supply Wagon runtime outputs below in the public Warpkeep GitHub
repository and an eventual official `warpkeep.com` Pages runtime after
separately approved deployment. This is use authorization only, not deployment
approval. The source is the
checksum-pinned `Warpkeep_Wagon_NoTelescope_GameReady.glb` from the public
`ael-dev3/Warpkeep-Assets` release; that provenance does not establish
underlying ownership, a separate public/open-content licence, general
derivative or redistribution rights, trademark rights, or Gold/Marks, site,
route, dispatch, balance, settlement, or entitlement authority.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Selected/near animated wagon | `public/models/hegemony/hegemony-supply-wagon-high-4a0f762b9dadeadd.glb` | Exact selected NoTelescope source bytes: 1,637,452 bytes, SHA-256 `4a0f762b9dadeaddd8b2d528a7e165eaa98a8dd4134eb924604922524e7bbc5d`, 40,650 triangles, 47-joint rig, six clips, 2048/1024/2048 WebP atlases. |
| Nearby animated wagon | `public/models/hegemony/hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb` | 752,364 bytes, SHA-256 `af0f8788eaaf9a32e9fd8d17e9ab897a9036d0cc7161a318afa0af3556c6e3b2`, 27,582 triangles, 47-joint rig, six clips, deterministic 512px WebP atlases. |
| Distant animated wagon | `public/models/hegemony/hegemony-supply-wagon-compact-fefb5105b95d43b4.glb` | 452,676 bytes, SHA-256 `fefb5105b95d43b411571000e8ae3fd78460eaa5f490eaeb63f90e5d84aba6ca`, 16,954 triangles, 47-joint rig, six clips, deterministic 256px WebP atlases. |

The release ZIP is retained only in ignored local cache during manual
preparation, never served as a runtime CDN. The checked-in output family is
verified by `node scripts/verify-hegemony-supply-wagon-assets.mjs`; ordinary
builds never fetch or rewrite it. The dated [Supply Wagon runtime record](docs/reference/factions/hegemony/2026-07-18-hegemony-supply-wagon/manifest.json)
pins the release, source, toolchain, output hashes, LOD budgets, rendering
contract, and visual-only scope boundary.

## Hegemony environment tree runtime assets

On 2026-07-18, the Warpkeep project owner supplied
Warpkeep_Trees_Runtime_Bundle_2026-07-18.zip and instructed a draft PR to
integrate its trees into natural forest and open-biome presentation. The
archive is 1,276,509 bytes with SHA-256
8ff19bb2a9b4c779db0836ea8ab59f8d67abfd282d5b4cce70d48e062874f9e2.
That instruction authorizes the 66 exact digest-bearing outputs in this public
Warpkeep GitHub repository and an eventual official warpkeep.com Pages runtime
after separately approved deployment. It is use authorization only, not merge
or deployment approval; it does not establish underlying ownership, a
public/open-content licence, general derivative or redistribution rights,
trademark rights, or game-authority rights.

| Intended use | Repository file | Technical record |
| --- | --- | --- |
| Visual-only Hegemony tree family | public/models/hegemony/environment/trees/hegemony-tree-*.glb | 22 distinct tree assets, each with exact High, Balanced, and Compact LODs: 66 files, 4,726,460 bytes, 25,528 total triangles. Every filename carries its SHA-256 prefix and every full hash, input manifest, source bundle record, GLB structure, and LOD count is pinned in the dated runtime manifest. |

The exact source GLBs are copied byte-for-byte; ordinary builds only run
node scripts/verify-hegemony-tree-runtime-assets.mjs and never fetch,
unpack, transform, or rewrite the supplied bundle. The
[Environment Trees record](docs/reference/assets/2026-07-18-hegemony-environment-trees/)
also records the source-manifest double-sided discrepancy: the 16
species-library manifests say false, while all supplied GLBs actually have
an opaque, double-sided material. Preserve the GLB bytes and renderer-facing
decoded behavior rather than silently editing assets.

The family remains LicenseRef-Warpkeep-Provenance-Required: use-authorized
only, with no separate public open license asserted. It is decorative
presentation only. The reviewed public `realm_forest_layout_v1` and
`realm_forest_instance_v1` projection may store a fixed, digest-pinned Genesis
visual layout that selects these immutable asset identifiers and transforms;
that layout is authored and validated independently of GLB geometry. Model
selection, LOD, deterministic visual variation, and a private terrain-contact
wrapper must not become a source of authoritative collision, gameplay
placement, ownership, resources, rewards, pathing, or other game authority.
Legacy Regular Tree variants have no authorized runtime collision; species
records retain only their supplied trunk-only guidance.

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
