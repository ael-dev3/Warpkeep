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
| Vegetation patches | Connected canopy, understory, groundcover, density, edge, clearing, and open-country potential                            | Placed meshes, draw calls, harvestable trees, or resource nodes    |
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
with at least 15% open country; and routes covering 5–20% of eligible land.
They also require at least 32 abandoned ruins with exactly 2–3 adjacent ruined
wall cells each, 64 waystones, 96 lamps, 128 rabbit habitats, 64 civilian
footfall cells, 16 guard posts, 32 ordinary courier cells, and 4 exotic-courier
cells, while all ambient capacity stays at or below 2% of eligible land. These
are coordinate-free candidate-quality bounds, not runtime spawn quotas.

A private `dressing` preview makes field
coherence, open-country balance, corridors, and anchor/capacity classes visible
to the owner. It is the seventh marked preview in the intended package
contract and must never be committed or published.

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

## Follow-on ownership

Later pull requests may consume an owner-approved package only after separate
authorization. Schema and streaming work owns caller-bounded authority;
renderer work owns fog-safe visibility, instancing, LODs, materials, animation,
and budgets; asset work owns provenance and artifact verification; gameplay
work owns movement, occupation, AI, rewards, combat, and persistence. None of
those responsibilities are implemented or implied by PR A.
