# Greater Realm dormant living-world semantics

Status: private candidate-generation contract only

Atlas: `GENESIS_001_GREATER_REALM`

Production state: unchanged

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

| Layer              | Private candidate meaning                                                                                                 | Explicit non-meaning                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Vegetation patches | Connected canopy/woody vegetation, groundcover, wildflower, edge, clearing, and open-country potential                    | Placed blades, meshes, draw calls, harvestable trees, or resource nodes |
| Habitat character  | Compatibility for temperate forest, taiga, jungle, wetland/swamp, savanna, desert, alpine/snow, meadow, heath, and plains | A biome renderer, weather system, or playable ecology              |
| Route corridors    | Dry road potential and explicitly fordable river/stream crossings between stable strategic anchors                        | Movement authority, pathfinding, bridges, ferries, or gate opening |
| Scenic anchors     | Terrain-supported potential for abandoned ruins, partial walls, waystones, lamps, and roadside details                    | Imported art, collision, ownership, loot, quests, or persistence   |
| Ambient capacity   | Bounded habitat/route potential for rabbits, citizens, guards, couriers, and courier mounts, including exotic mounts      | Spawned NPCs, AI, combat, economies, schedules, or server state    |

Vegetation must form broad, irregular, ecologically legible clusters with
clearings and feathered margins. It must preserve substantial open plains and
other open country instead of filling every dry cell. Riparian growth may
follow lakes, rivers, streams, deltas, marshes, and swamps, while desert,
alpine, snowy, volcanic, coastal, and high-exposure areas use compatible sparse
coverage. Jungle capacity requires warm, wet, connected terrain; taiga and
snow capacity require cold evidence; wetland/swamp capacity requires verified
wetness and drainage; savanna and desert capacity require the corresponding
heat/moisture regime. A visual label cannot override the physical fields.

Living-world v3 keeps canopy/woody potential in `vegetationDensity` and adds
private, cell-level `groundcoverDensity` and `wildflowerDensity` channels.
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

The added channels advance the living-world authority to
`greater-realm-private-living-world-v3`, the generator algorithm to
`greater-realm-v2-natural-continent-pr-a.13`, and the private atlas format to
7. The terrain-seed namespace remains `.3`, so this package revision does not
silently reroll the candidate.

## Clean-room grass reference

The grass architecture review used Steve245270533's
[`three-stylized` commit
`3275628b85b51b6d611703e8a956a05f43b31645`](https://github.com/Steve245270533/three-stylized/tree/3275628b85b51b6d611703e8a956a05f43b31645),
published under its
[MIT License](https://github.com/Steve245270533/three-stylized/blob/3275628b85b51b6d611703e8a956a05f43b31645/LICENSE).
That repository's README in turn credits cortiz2894's MIT-licensed
[`stylized-components` at commit
`b182d81bff64531e584f50d71f046ae05fab3c87`](https://github.com/cortiz2894/stylized-components/tree/b182d81bff64531e584f50d71f046ae05fab3c87)
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

The initial acceptance budget has three camera bands, measured over the whole
visible chunk set rather than independently per cell:

| Band | Intended presentation | Initial profiling guardrail (not release-final) |
| ---- | --------------------- | ----------------------------------------------- |
| Near | Bent blade/clump geometry plus sparse flower heads | 65,536 instances and 8 grass/flower draw submissions |
| Mid  | Simplified clumps with reduced segments and no individual flower heads | 32,768 instances and 4 draw submissions |
| Far  | Terrain tint, roughness, and normal response only | No blade or flower geometry |

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

## Follow-on ownership

Later pull requests may consume an owner-approved package only after separate
authorization. Schema and streaming work owns caller-bounded authority;
renderer work owns fog-safe visibility, instancing, LODs, materials, animation,
and budgets; asset work owns provenance and artifact verification; gameplay
work owns movement, occupation, AI, rewards, combat, and persistence. None of
those responsibilities are implemented or implied by PR A.
