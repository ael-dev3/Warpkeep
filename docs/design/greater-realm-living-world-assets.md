# Greater Realm dormant living-world semantics

Status: private candidate-generation contract only

Atlas: `GENESIS_001_GREATER_REALM`

Greater Realm activation state: unchanged

This document defines how the single private Greater Realm candidate may
reserve coherent space for a future living-world presentation. It does not
copy an asset, add a browser/runtime route, change a SpacetimeDB schema, spawn
an actor, create a gameplay road, seed production, or activate the candidate.
The deployed Lowlands remains the only active world.

## Candidate semantic authority

All fields derive deterministically from the reconciled geology, elevation,
landform, climate, hydrology, biome, region, and clearance authority. Stable
cell order and complete tie-breakers are mandatory. Semantics are private
package data; only separately allowlisted, coordinate-free aggregates may
appear in a sanitized report.

| Layer              | Private candidate meaning                                                                                                 | Explicit non-meaning                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Vegetation patches | Connected canopy/woody vegetation, groundcover, wildflower, edge, clearing, and open-country potential                    | Placed blades, meshes, draw calls, harvestable trees, or resource nodes |
| Habitat character  | Compatibility for temperate forest, taiga, jungle, wetland/swamp, savanna, desert, alpine/snow, meadow, heath, and plains | A biome renderer, weather system, or playable ecology                   |
| Route corridors    | Dry road potential and explicitly fordable river/stream crossings between stable strategic anchors                        | Movement authority, pathfinding, bridges, ferries, or gate opening      |
| Scenic anchors     | Terrain-supported potential for abandoned ruins, partial walls, waystones, lamps, and roadside details                    | Imported art, collision, ownership, loot, quests, or persistence        |
| Ambient capacity   | Bounded habitat/route potential for rabbits, citizens, guards, couriers, and courier mounts, including exotic mounts      | Spawned NPCs, AI, combat, economies, schedules, or server state         |

Vegetation must form broad, irregular, ecologically legible clusters with
clearings and feathered margins. It must preserve substantial open plains and
other open country instead of filling every dry cell. Riparian growth may
follow lakes, rivers, streams, deltas, marshes, and swamps, while desert,
alpine, snowy, volcanic, coastal, and high-exposure areas use compatible sparse
coverage. Jungle capacity requires warm, wet, connected terrain; taiga and
snow capacity require cold evidence; wetland/swamp capacity requires verified
wetness and drainage; savanna and desert capacity require the corresponding
heat/moisture regime. A visual label cannot override the physical fields.

Living-world v4 keeps canopy/woody potential in `vegetationDensity` and retains
the private, cell-level `groundcoverDensity` and `wildflowerDensity` channels
introduced by v3.
Groundcover represents grass, sedge, heath, or similarly low vegetation;
wildflowers are a sparse compatible subset and can never exceed groundcover at
the same cell. Both channels are zero on water, the protected Lowlands,
reserved sites, strategic clearances, unsupported slopes, and incompatible
biome/landform combinations. Their patches use independent deterministic
channels so flowers do not merely trace every grass edge and grass does not
become a uniform carpet.

Layer validation preserves connected texture without equating grass with
woody cover. Every retained groundcover patch has at least six cells and every
retained wildflower patch at least three; each layer has more than one patch,
no isolated or undersized remainder, and at least 8 and 4 distinct nonzero
density values respectively. The largest groundcover patch may cover at most
90% of groundcovered cells, while the largest wildflower patch may cover at
most 95% of flower-positive cells. At least 1% of groundcovered cells must have
zero woody-vegetation density, and the vegetation/groundcover Jaccard overlap
may not exceed 95%. These are private authority checks, not rendered-instance
or gameplay counts.

The living classifier shares the final topography's 3,500 cool-forest
transition: compatible cool meadow, heath, lowland, woodland, pine, and coast
become taiga ecology, while cool volcanic and ash ground remains sparse alpine
ecology. After ordinary clearance and patch pruning, a deterministic
groundcover-channel pass may remove woody density only from degree-one canopy
fringe cells until the unchanged 1% open-groundcover floor is met. Removing a
leaf cannot split the retained woody component; dense interiors are never
hollowed, and a candidate with insufficient safe fringe still fails closed.
This is an in-place correction to the unpublished v4 candidate authority: the
Greater Realm remains generation-only, no v4 candidate has been selected, and
production is unchanged. Earlier pre-eligibility draft digests are not package
authority.

Road potential prefers connected, low-slope, dry corridors and may cross only
river/stream cells that this authority explicitly classifies and proves as
fords. `CARRIAGEWAY` is dormant future wagon and supply-wagon capacity beside
major sites, not a spawned vehicle, dispatch path, or movement grant. Routes
avoid lakes, ocean, impassable crests, protected castle pads, sealed
gate aprons, and incompatible sites. Ruin and partial-wall anchors require stable
dry support and bounded clear space. Waystones and lamps require an eligible
road or site relationship. Rabbit and civilian capacity favors safe habitat;
guard capacity requires a defensible route/site context; courier and mount
capacity requires a continuous eligible corridor. No capacity field creates
an entity or a timer.

Deterministic validation rejects isolated one-cell noise, excessive blanket
coverage, incompatible overlaps, blocked strategic approaches, and collisions
with protected Lowlands authority. Candidate-scale gates require at least eight
cells in every ecology class; at least 20% lush, 8% cold/upland, and 3%
arid/savanna ecology; no single class above 55%; 25–85% vegetated eligible land
with at least 15% open country; groundcover on 35–85% of eligible land;
wildflowers on 2–20% of groundcovered land; and dry tracks, roads, and
carriageways covering 5–20% of eligible land. Ford cells are validated
separately and never count toward that dry-land percentage because they occupy
river or stream cells.

Candidate eligibility further requires at least eight groundcover patches and
eight wildflower patches, caps their largest patches at 60% and 30% of their
respective positive cells, and requires at least 32 and 16 distinct nonzero
density values respectively. Patch counts, minimum component sizes, density
diversity, and positive-cell totals are cross-checked so an internally
impossible aggregate cannot satisfy the gate.

They also require at least 32 abandoned ruins with exactly 2–3 adjacent ruined
wall cells each, 64 waystones, 96 lamps, 128 rabbit habitats, 64 civilian
footfall cells, 16 guard posts, 32 ordinary courier cells, and 4 exotic-courier
cells, while all ambient capacity stays at or below 2% of eligible land. These
are coordinate-free candidate-quality bounds, not runtime spawn quotas.

A private `dressing` preview makes field coherence, grass/flower patch
variation, open-country balance, corridors, and anchor/capacity classes visible
to the owner. It is the seventh marked preview in the intended package contract
and must never be committed or published.

The added channels and marsh-aware dressing rules advance the living-world
authority to `greater-realm-private-living-world-v4`, the generator algorithm
to `greater-realm-v2-natural-continent-pr-a.18`, and the private atlas format
to 8. The terrain-seed namespace remains `.3`, so this package revision does not
silently reroll the candidate.

## Clean-room grass reference

The grass architecture review used Steve245270533's
[`three-stylized` commit
`3275628b85b51b6d611703e8a956a05f43b31645`](https://github.com/Steve245270533/three-stylized/tree/3275628b85b51b6d611703e8a956a05f43b31645),
published under its
[MIT License](https://github.com/Steve245270533/three-stylized/blob/3275628b85b51b6d611703e8a956a05f43b31645/LICENSE).
That repository's README in turn credits cortiz2894's MIT-licensed
[`stylized-components`](https://github.com/cortiz2894/stylized-components/tree/b182d81bff64531e584f50d71f046ae05fab3c87)
as its upstream. This review separately pins that upstream at commit
`b182d81bff64531e584f50d71f046ae05fab3c87`
([license](https://github.com/cortiz2894/stylized-components/blob/b182d81bff64531e584f50d71f046ae05fab3c87/LICENSE)).
Only general concepts informed this contract: deterministic density layers,
seeded surface sampling, a distinct sparse wildflower layer, batched instanced
geometry, terrain-aware placement, and vertex-stage wind. PR A copies no code,
shader, asset, test, data, constants, or generated output. A later pull request
that imports or adapts implementation material must conduct its own provenance
review and preserve every applicable license notice.

## Asset readiness and provenance boundary

The main Warpkeep repository already contains a verified 22-species tree
family and supply-wagon LODs. Their presence does not make them part of this
candidate, nor does it authorize new runtime placement in PR A.

At audited Warpkeep-Assets `main` commit
`10c84fbcc339f143ee6f25dfe7a0682660e0e458`, the following provenance-tracked
release families are relevant:

- `inner-keep-3d-asset-library-2026-08-02`;
- `hegemony-citizens-keep-services-2026-08-03`;
- `hegemony-unit-corps-2026-08-03`;
- `rabbit-runtime-ui-bundle-2026-07-30`.

The later asset review should evaluate these concrete matches rather than
inventing placeholder art:

| Candidate role             | Confirmed asset candidates                                                                                                                       | Review constraint                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Continental vegetation     | The 22-species standard tree family already present in Warpkeep; the Inner Keep fantasy tree expansion for rare jungle/savanna landmarks         | Use biome-specific mixes, GPU instancing, density budgets, and broad treeless clearings; fantasy silhouettes stay rare    |
| Rabbits                    | The rigged Rabbit High/Balanced models with Idle, Walk, Nibble, and Alert clips; Compact is static                                               | Resolve or explicitly accept the retained skinned-mesh-root validator warning before runtime use                          |
| Citizens and light keepers | Ember Lamplighter, Cistern Warden, Chirurgeon Apothecary, Bell Herald, and Basilica Warden                                                       | Keep settlement/road activity bounded and Hegemony-specific; do not scatter citizens through untouched wilderness         |
| Guards and patrols         | Ward Peacekeeper plus Bulwark, Legionary, Vanguard, Honor Guard, and the mounted Hegemony corps                                                  | Patrol schedules need later server-time authority; this PR stores habitat/route capacity only                             |
| Couriers and exotic mounts | Existing supply wagon; Emberfoot Courier on a giant jackrabbit; Shellback Shrine Tender on a giant tortoise; mounted Horseguard/Outrider options | Treat rider-and-mount files as combined units and never misidentify the wagon-derived `WorkerHegemony` file as a humanoid |
| Roads and crossings        | Dirt/cobble road pieces, stepping stones, milestone, and `KeepBridge_Short6m`                                                                    | Continental roads remain data-driven curves; modular meshes are close-range dressing, not world-scale topology            |
| Ruins and walls            | Broken portico, collapsed arch, rubble, round tower shell, breached wall, keep wall/gateway pieces, and the wooden palisade kit                  | Require dry stable support, collision/clearance review, and no sealed-barrier bypass                                      |
| Lamps and roadside life    | Timber Post Lamp, Wrought Iron Double Lamp, Wall Bracket Lantern, braziers, signposts, noticeboards, wells, benches, and troughs                 | Emissive/light counts, shadow distance, and nighttime budgets belong to the renderer PR                                   |

PR A does not import, vendor, reference by runtime path, or authorize any of
those files. A follow-on asset pull request must independently establish the
exact artifact ledger, license/provenance record, integrity digest, coordinate
convention, material policy, LOD/animation contract, performance budget, and
runtime verifier before using any family. Semantic names in this document are
roles, not proof that a corresponding production asset is suitable.

Confirmed content gaps include wetland plant sets, jungle groundcover, vines,
palms, desert flora, snow-material meshes, large bridges, and broader wildlife.
Until licensed assets pass that later review, the renderer may use a separately
reviewed procedural/material fallback or omit the decorative role. It must not
silently substitute an unrelated asset, reveal a private placement, or claim
missing content is live.

## Dormant renderer handoff

An authorized renderer follow-on should expand only visible, approved cells
into deterministic client-side presentation. It must not write individual
blades, flower stems, transforms, wind phases, or LOD decisions to SpacetimeDB.
Those details are ephemeral render data derived from the approved world
revision, cell key, density channel, and bounded local sample ordinal.

The renderer has three camera bands. Every lower-detail representation must be
a stable hash-ranked subset or aggregate of the same public presentation
sequence; changing camera band must not reshuffle roots or reveal a cell that
the caller is not authorized to receive.

| Band | Intended presentation                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| Near | Bent segmented blade patches plus a separately bounded sparse flower layer                                   |
| Mid  | Simplified clumps with fewer blade equivalents and no individual flower heads                                |
| Far  | Shared groundcover tint, roughness, and normal response in the terrain material; no blade or flower geometry |

"Instance" is too ambiguous for a production budget. A **patch instance** is
one transform referencing a planted patch geometry; a **blade equivalent** is
one blade contained in that geometry; and a **flower instance** belongs to the
separate flower layer. The first renderer implementation must preserve or beat
the existing quality-plan ceilings across the combined near and mid bands:

| Quality  | Grass patch instances | Blade equivalents | Grass triangles | Grass draws | Flower instances | Flower draws | Repack upload ceiling |
| -------- | --------------------: | ----------------: | --------------: | ----------: | ---------------: | -----------: | --------------------: |
| High     |                 7,000 |            63,000 |         189,000 |           6 |              512 |            1 |                 1 MiB |
| Balanced |                 4,000 |            28,000 |          84,000 |           4 |              256 |            1 |               512 KiB |
| Reduced  |                 1,200 |             6,000 |          18,000 |           2 |       0 geometry |            0 |               192 KiB |

The grass instance/triangle/draw rows preserve the current production plans;
the separate flower and upload values are conservative starting ceilings to be
tightened by the renderer PR's traces. They are ceilings, not density targets.
Flower color may remain in the far or Reduced terrain response when flower
geometry is disabled. Counts may never be computed as unbounded world area
multiplied by density, and per-cell budgets may not be summed without first
applying the visible-window ceiling. Before allocating, the renderer must
validate `maxAttributes`, maximum buffer sizes, the selected geometry profile,
every decoded array length, decompressed output ceiling, and every count/byte
multiplication. The complete compiled attribute layout includes base geometry,
instance-matrix columns, instance color, custom instance fields, and optional
material features and must fit `maxAttributes`; unsupported plans downshift
atomically to the next proven quality or to terrain-only groundcover.

Chunk transitions require stable seeded sampling and a short stochastic or
dithered cross-fade so camera movement does not reshuffle or visibly pop the
field. The vertex stage may align roots to terrain, apply height/width
variation, bend tips with low-frequency world wind plus per-instance phase, and
carry a root-to-tip color response. The fragment/material stage may blend
biome tint, sun exposure, and restrained subsurface-like rim light. None of
those effects may alter authoritative density, reveal hidden cells, allocate
unbounded work, or bypass fog-safe visibility. The ceilings remain provisional
until representative desktop and mobile GPU traces prove frame time, memory,
overdraw, and shader-variant budgets in a separate pull request.

The implementation must not use one continent-wide mesh with
`frustumCulled = false`. The camera-local active window owns fixed-capacity
near/mid variant pools with recomputed, wind-safe bounds that participate in
frustum culling. Repacking happens only on meaningful active-window changes.
Matrices, colors, and custom instance fields that are rewritten by a repack use
dynamic upload usage rather than being advertised as static.

Grass and flowers share the same world-space wind clock and direction, while
retaining independent deterministic placement streams. Hero blades require a
real root-to-tip hue/value response and a bounded view/sun thin-blade
backscatter term. The shaded normal must follow the bend closely enough to
avoid static highlights on moving grass. Cutouts stay opaque, depth-writing,
and early-Z friendly; transparent sorting is not an acceptable substitute for
alpha hashing, alpha-to-coverage, or an equivalent proven cutout path.
The runtime reports whether vegetation animation is active and its configured
wind-update ceiling. Actual observed update cadence remains a rendered-QA and
device-profile measurement, since water or moving actors may still cause the
grass geometry to be drawn between wind-uniform updates.

Shadow policy is explicit rather than accidental. The current decorative grass
and flower pools neither cast nor receive shadow maps; ambient and direct
lighting provide their grounding without a mismatched animated shadow pass. If
shadow casting or receiving is enabled later, the color, depth, and distance
passes must use the same wind bend, LOD cross-fade, and alpha threshold, and
casting must remain inside a separately profiled near ring. A static or
differently clipped shadow for a moving blade is a release blocker.

The existing `WebGLRenderer`/GLSL path remains the production baseline. An
optional modern path may use Three's `WebGPURenderer` and TSL/NodeMaterial only
after a separate migration ports the current `onBeforeCompile` behavior and
proves the same deterministic samples, linear-color output, fog/visibility
boundary, cleanup, and quality ceilings on all three relevant executions: the
production `WebGLRenderer`/GLSL path, the `WebGPURenderer`/TSL WebGPU backend,
and the `WebGPURenderer`/TSL forced-WebGL2 backend. Three currently documents
`WebGPURenderer` as experimental and does not support `onBeforeCompile`
customizations, so capability detection or device loss must fall back
atomically without changing world authority. Relevant upstream contracts are
the official
[WebGPURenderer guide](https://threejs.org/manual/en/webgpurenderer),
[WebGPURenderer API](https://threejs.org/docs/pages/WebGPURenderer.html), and
[TSL documentation](https://threejs.org/docs/pages/TSL.html).

Visibility is applied before subscription, decode, allocation, and telemetry.
An absent or unauthorized chunk produces no grass, flower, or far-terrain tint;
clients never infer it from neighbors. Runtime telemetry is coordinate-free and
must not expose hidden biome/density aggregates, private candidate seeds, or
candidate package digests.

The renderer PR is not release-ready until synthetic public fixtures provide
fixed-camera/fixed-time visual regressions for near, mid, far, flowers,
groundcover-only clearings, slopes, roads, water margins, backlighting,
reduced-motion, shadows, and both directions of every LOD transition.
Reduced-motion mode freezes grass and flower wind plus transition noise and
must produce stable, non-shimmering cutouts on every backend. The same fixture
set compares the production GLSL renderer and both TSL backends within a
reviewed perceptual tolerance.

Desktop, mobile, and Farcaster WebView runs must record P95 CPU and GPU frame
cost, main-thread repack latency, actual animation-update cadence, upload
bytes, active CPU/GPU memory, overdraw, draws, triangles, visible/culled chunks,
shader fallbacks, thermal behavior, context/device-loss recovery, and repeated
rebuild/disposal. Recording numbers is not a pass condition: before renderer
implementation begins, that pull request defines a representative device
matrix and exact pass/fail ceilings for steady vegetation CPU/GPU cost, P95
repack slices, active bytes, and upload cadence, and obtains owner approval.
Work is split or deferred so a vegetation rebuild never creates a browser long
task of 50 ms or more. Missing or failed device evidence blocks activation.
Private candidate pixels are never CI fixtures.

This handoff does not claim that visible Greater Realm grass is implemented by
PR A. The current client's general Realm renderer, used by the already-public
Lowlands terrain, now supplies bounded WebGL2 patch instancing; deterministic,
terrain-aware sampling; stable alpha-hash/alpha-to-coverage near/mid
transitions with genuinely lower-topology mid patches; camera-local active
windows and frustum-cullable
pools whose repack bounds include maximum wind sway; world-space wind,
reduced-motion fallback, and LOD/lifecycle telemetry; and root-to-tip grading,
bend-responsive normals, and bounded view/sun thin-blade backscatter. It also
owns a separate deterministic near-detail wildflower layer derived from
accepted grass roots, limited to one opaque alpha-hash/alpha-to-coverage draw
and hard instance ceilings of 512 on High, 256 on Balanced, and zero geometry
on Reduced. Grass
and flowers share the scene wind clock and direction while retaining distinct
placement streams. These are general runtime capabilities, not evidence that
any private candidate cell or density channel has been published.

Greater Realm package field streaming and activation remain deferred. The
private package is still dormant, and neither the new grass LODs nor the
wildflower layer consumes it. Shadow-pass parity, if grass or flowers are later
allowed to cast, and an optional TSL/WebGPU backend also remain follow-on
acceptance work after candidate approval.

## Follow-on ownership

Later pull requests may consume an owner-approved package only after separate
authorization. Schema and streaming work owns caller-bounded authority;
renderer work owns fog-safe visibility, instancing, LODs, materials, animation,
and budgets; asset work owns provenance and artifact verification; gameplay
work owns movement, occupation, AI, rewards, combat, and persistence. None of
those responsibilities are implemented or implied by PR A.
