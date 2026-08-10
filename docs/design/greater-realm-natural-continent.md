# Greater Realm natural-continent candidate design

Status: candidate-generation design only

Atlas: `GENESIS_001_GREATER_REALM`

Generator algorithm: `greater-realm-v2-natural-continent-pr-a.12`
Terrain-seed namespace: `greater-realm-v2-natural-continent-pr-a.3`
Production state: unchanged

This document defines the offline, owner-reviewed candidate stage for a future
Greater Realm. It does not add a database table, browser route, renderer,
feature flag, migration, seed reducer, production record, or active mechanic.
No candidate is selected by this pull request.

## Immutable starting point

The deployed `GENESIS_001` Lowlands remains the authority for its exact 10,000
cells, 100 castle slots, water layout, resource sites, forest layout, routes,
and local keys. Candidate generation treats that world as a locked patch. A
candidate may choose one of six axial rotations and a global translation for
future presentation, but it may not rewrite any locked local coordinate or
catalog entry.

The future global key contract is collision-free and region-qualified:

```text
<region-id>:<local-q>,<local-r>
```

The exact Lowlands transform is private candidate data. A later bridge must
keep current gameplay in local coordinates and prove a reversible mapping
before any atlas record can be activated.

## Fixed strategic contract

An eligible candidate has 100,000–150,000 active atlas cells and exactly ten
strategic regions:

| Tier | Count | Working regions                                                                                          | Aggregate target |
| ---- | ----: | -------------------------------------------------------------------------------------------------------- | ---------------: |
| I    |     6 | The Hegemony Lowlands, Frostmere Reach, Sunscar Expanse, Mirefen Delta, Stonewake Isles, Emberwood March |          68%–74% |
| II   |     3 | Crownwood March, Ironveil March, Glasswater March                                                        |          22%–27% |
| III  |     1 | Throneheart                                                                                              |            3%–6% |

Tier III must be the smallest region by total cells and passable land. Each
Tier II region has two Tier I neighbours and one Tier III neighbour. The
physical graph contains exactly 18 sealed gates: two for each of the six
Tier-I/Tier-II relationships and two for each of the three
Tier-II/Tier-III relationships. Closed gates are impassable and grant no
combat, ownership, reward, or travel behavior.

The six Tier I regions reserve future capacity for 100 castles each. Only the
existing Lowlands 100 are active. The other 500 candidate slots are private,
dormant suitability results and must not enter the current castle-slot table.
New slots are dry, at least three cells from a sealed gate, live inside a
same-region passable component of at least 200 cells, and remain at least five
hexes from every previously accepted slot, including the deployed Lowlands.

## Deterministic generation

Authority decisions use canonical cell order, integer or fixed-point fields,
stable complete tie-breakers, and counter-addressed random channels. A sample
is a pure function of the private candidate seed, stage, axial coordinate, and
sample ordinal. Root-seed ordinals derive that candidate seed through an
explicit terrain-seed namespace, which changes only for an intentional world
reroll; the separate generator algorithm version still identifies and binds
the package implementation. There is no mutable random stream and no
`Math.random` in generation authority.

Each candidate runs independently through these stage families:

1. Build a larger private axial canvas, 7–12 separated pseudo-tectonic domains,
   and 3–8 irregular subduction-style island arcs with crust, age, rock
   resistance, buoyancy, volcanic potential, and integer motion vectors.
2. Derive continentalness, basin structure, convergent uplift, rifts, transform
   scarps, volcanic relief, and independent macro/meso/local relief channels.
3. Apply synchronous, material-conserving thermal shaping.
4. Derive a connected active atlas mask from geography plus a variable
   deep-ocean/fog buffer. Inactive canvas cells are discarded, not seeded.
5. Place the locked Lowlands reserve, then run a real geomorphology stage before
   the final fluvial pass. A low-frequency carrier first shapes broad terraces
   with short smooth ramps; a bounded low-frequency axial domain warp bends
   those contours without moving the active mask, coastline, or locked
   Lowlands reserve, while independently named meso/detail bands restore
   weathering so the result keeps natural relief instead of reading as contour
   stairs. A private A/B proof runs an unwarped baseline through the same
   weathering, coast-strength blend, displacement cap, and edge-relaxation
   passes, and rejects a candidate unless domain warping changes at least one
   final terrace elevation. The stage then uses preliminary drainage and
   climate to apply bounded glacial erosion and moraines, arid wadis and
   aeolian shaping, volcanic/caldera relief tied to tectonic evidence, and
   coherent beach, cliff, delta, and fjord shaping. Coastline sign and the
   Lowlands reserve stay exact. The package records the terrace delta
   separately and proves the material budget of the erosion/deposition
   processes independently.
6. Run stable Priority-Flood depression handling on the six-connected graph,
   route flats toward legal outlets, prove a drainage DAG, accumulate
   discharge, and apply bounded stream-power-like incision and sediment
   transport. Re-run thermal relaxation and hydrology, deposit the routed
   sediment onto that relaxed surface, and run final hydrology before
   reconciling the immutable Lowlands topography and surface. Incision and
   deposition never alter protected Lowlands cells.
7. Derive paired topography and visual-biome authority from the same reconciled
   elevation, routed flow, geology, climate, water, region, and geomorphology
   process fields. The paired result includes slope, aspect, profile/plan
   curvature, wetness, exposure, coast/freshwater distance, watersheds, ridges,
   temperature, moisture, landforms, and biome classes; visual classifications
   cannot drift away from the process evidence that produced the terrain.
   Generated forest components smaller than 28 connected cells resolve into
   compatible meadow, heath, or temperate-lowland transitions, leaving broad
   clustered woods and meaningful open plains and other open country.
   Candidate-only ecological semantics extend that same evidence into coherent
   vegetation and habitat
   patches for temperate forest, taiga, jungle, wetland/swamp, savanna, desert,
   alpine/snow, meadow, heath, and plains. The frozen Lowlands surface is
   excluded from this cleanup and from new-generator composition scoring.
   The final reconciled dry surface must also pass a private second-order
   structure-function audit at lags 1, 4, and 12 along all three undirected hex
   axes. Only complete dry, non-Lowlands corridors contribute; the proof
   requires adequate pair coverage, genuine multiscale growth, and bounded
   axial anisotropy so white noise, one-scale blobs, and grid-aligned bands
   cannot satisfy the terrain gate.
8. Grow natural geographic basins, bind the working region identities by
   climate/process character, assign the fixed strategic graph, and align tier
   barriers and gate saddles with coherent highlands rather than radial bands.
9. Choose dormant castle suitability and potential sites; derive private
   road/ford corridors, ruin/wall/waystone/lamp anchors, and bounded
   ambient-life potentials; then write private chunks whose payloads bind those
   dressing fields, topography patches, and aggregate quality metrics. These
   are semantic candidate fields, not spawned actors, routes, meshes,
   persistence records, or gameplay systems. Their detailed contract is
   documented in
   [Greater Realm dormant living-world semantics](greater-realm-living-world-assets.md).

`sedimentDepth` is the exact non-negative deposit added to the relaxed fluvial
surface before final routing. The generator proves cell by cell that the final
fluvial elevation equals the relaxed base plus this depth, proves zero sediment
inside protected Lowlands cells, and conserves eroded material as deposited
plus exported sediment. PR A keeps this private generation evidence out of all
runtime and persistence schemas.

Sea level and mask parameters are fixed before a candidate attempt. A result
outside the approved cell range is rejected; the generator never pads, trims,
or adds filler to reach a requested count.

Aggregate land and water shares describe the continent's topographic
footprint at sea level. Rivers, streams, and enclosed surface-water overlays
remain features of that footprint; they do not silently shrink the continent
when a hydrology threshold changes.

The design adapts practical ideas from research on
[procedural tectonic structure](https://onlinelibrary.wiley.com/doi/10.1111/cgf.13614),
[coupled uplift and fluvial erosion](https://onlinelibrary.wiley.com/doi/10.1111/cgf.12820),
[Priority-Flood drainage](https://doi.org/10.1016/j.cageo.2013.04.024), and
[tile-based erosion evaluation](https://arxiv.org/abs/2210.14496), plus the
terrain-material and height-atmosphere demonstrations in
[SimonDev's game-development demos](https://simondev.io/demos/gamedev/#customizing-materials),
the deterministic layered-noise and erosion workflow demonstrated by
[Procedural Terrains](https://terrains.zyfod.dev/) and documented in its
[open-source engine](https://github.com/ZyFou/ProceduralTerrains), and the
exponential height-fog treatment documented in the
[Crytek SIGGRAPH 2006 course notes](https://advances.realtimerendering.com/s2006/Course_26_SIGGRAPH_2006.pdf).
It does not copy third-party code, data, maps, art, labels, or balance tables.

The Procedural Terrains comparison is an architectural cross-check rather than
a shader import. Its multi-octave frequency/amplitude stack maps to Warpkeep's
independently named macro, meso, and local integer fields; domain-warped massifs
map to irregular pseudo-tectonic boundaries and independently warped terrace
contours; ridged relief maps to uplift-aligned mountain systems; and its
hydraulic masks map to Warpkeep's authoritative flow, incision, sediment,
slope, wetness, and coastal process fields. Smooth terrace ramps and restored
weathering detail are retained together, so broad playable plateaus do not
become vertical contour walls. Camera LOD, GPU material blending, triplanar
detail, shoreline shading, and interactive splines remain renderer concerns
for a later activation PR and cannot alter PR A's private terrain authority.

## Candidate hard gates

A candidate is ineligible if any of these proofs fail:

- active count is outside 100,000–150,000;
- the active mask is disconnected, exposes the private canvas, or has an
  obvious disc, hexagon, square, long straight cutoff, or filler boundary;
- land does not retain a meaningful deep-ocean/fog buffer;
- the topographic land mask does not contain 2–4 major landmasses and 3–8
  large islands;
- the dominant continental system contains less than 55% or more than 90% of
  land, lacks a meaningful secondary mass, or fails to carry at least 80% of
  both Tier II and Tier III land. This explicitly implements the requested
  primary-continent plus secondary-landmass policy rather than making a lone
  monolith eligible;
- production-scale 64px/256px silhouette checks detect excessive rotational
  similarity, long axial coast runs, implausible convex solidity, or either
  over-smoothed or one-cell-noisy coast detail;
- the surrounding ocean is not saltwater at every active boundary cell, lacks
  the global and 12-sector land clearance floors, or visually crowds the
  fog-ready frame;
- generated oak, old-growth, and non-glacial pine forests are outside the
  8%–42% dry-land envelope, remain dominated by tiny/confetti components, lack
  at least three broad patches, or collapse into one blanket mass. Flower
  meadow, glacial valley, and the immutable Lowlands patch are not
  misclassified as generated forest;
- ecological dressing breaks landform/biome compatibility, blankets open
  country, fragments major vegetation patches into visual confetti, places
  terrestrial potential on open water, or fails to reserve meaningful plains,
  meadow, heath, savanna, desert, wetland/swamp, jungle, taiga, and alpine/snow
  character where the reconciled climate and landform evidence supports it;
- generated mountain authority is outside the 3%–28% dry-land envelope, lacks
  at least two coherent systems, remains dominated by speckles or one massif,
  or has no sufficiently long, anisotropic, off-centre belt. Ancient-stone
  Lowlands cells are not counted as mountains;
- region count, tier ratios, region balance, fixed adjacency, 18 gates, or 600
  total castle capacity differs from the contract;
- a Tier-II parent lacks one connected strategic mainland spine between dry
  outer- and inner-frontier anchors. Dry ground plus explicitly fordable river
  and stream cells may carry the interior route; ocean, lake, and sea cells may
  not. Gate endpoints and their independently proved approaches remain dry;
- a closed tier barrier has an ungated land bypass;
- opening all declared gate endpoints exposes any cross-tier edge other than
  the exact 18 recorded physical corridors;
- either side of a sealed gate lacks two internally vertex-disjoint dry
  approaches, beginning at distinct endpoint neighbours and terminating in
  the same independently measured vertex-biconnected regional core of at least
  64 cells. Complete Tarjan blocks are retained; when blocks share an
  articulation, only the deterministic largest owner can retain that vertex,
  so an incomplete path fragment cannot masquerade as a robust core;
- the completed geological band differs from its independently replayed
  same-tier distance field: two cells per side at the Outer Crown (four-cell
  local normal) and three per side at the Inner Throne (six-cell local normal).
  Curved or intersecting ranges may create a wider longitudinal massif, so
  bounded 4–8-cell private normal witnesses cover every strategic region-pair
  boundary rather than mislabelling a bend as thickness. Oceans and lakes may
  contribute explicit natural-barrier cells. Every final impassable crest cell
  must lie inside the band, and the cell graph must remain sealed outside the
  exact gate corridors;
- the largest passable component covers less than 80% of a non-Stonewake Tier I
  region, 55% of intentionally archipelagic Stonewake Isles, 85% of a Tier II
  region, or 90% of Tier III;
- passable-region fragmentation, boundary density, tendrils, radial tier
  agreement, or radial Tier-I boundary alignment exceeds its fixed limit;
- the measured final surface is outside 4–6 major ocean/sea bodies, 48–72
  major river networks, 120–240 minor stream heads, or 48–96 lakes;
- a flow cycle, uphill routing edge, unexplained inland sink, or inconsistent
  lake exists. Every connected lake body must have one exact filled-surface
  elevation and a legal spill or sea-level outlet; adjacent bodies at different
  filled elevations must not be merged for counting or proof;
- derived topography is degenerate, a region misses its tier-specific biome
  diversity floor, a Tier-I biome exceeds 55% of that region's land, or an
  incompatible hot-arid/frozen visual adjacency survives classification;
- geomorphology changes the Lowlands reserve, lacks both broad plateau and
  short-ramp terrace evidence, loses its bounded weathered detail, domain warp
  has no measured effect on the final terrace elevations, final relief lacks
  multiscale structure or develops excessive hex-axis banding, violates its
  exact erosion/deposition material budget or climate/tectonic/coastal
  compatibility, or omits the required glacial, arid, volcanic, and coastal
  process evidence;
- the locked Lowlands patch or any protected catalog differs;
- castle candidates lack local passability, spacing, or clearance;
- a private road/ford corridor crosses forbidden water or impassable terrain,
  or a ruin, wall, waystone, lamp, rabbit, citizen, guard, courier, or
  exotic-mount potential violates its deterministic clearance, habitat, route,
  or site-support rule;
- integer range, stage-digest, deterministic replay, package-integrity, or private
  boundary validation fails.

For this offline topology proof, river and minor-stream corridors are fordable
route surfaces; oceans and lakes are not. This does not activate movement,
bridges, ferries, or any cross-region mechanic. Every sealed gate endpoint and
every recorded primary/alternate gate-approach cell must remain strictly dry;
fordable water can connect regional interiors but cannot masquerade as a gate
apron.

Quality remains a vector, not an automatic decision. After the private package
has been regenerated and byte-for-byte verified, the owner-review record joins
its public aggregate evidence to coordinate-free private metrics. Those metrics
span outer-boundary/coastal artifacts, passable-region coherence and route
fragmentation, throne-route clearance, chunk population balance, geological
and landform alignment, climate/coastal compatibility, hydrology, biome
diversity/balance, multiscale silhouette, directional ocean clearance, and
forest/mountain clustering. Raw coordinates, seeds, transforms, hidden-site
identities, package paths, and digests never enter that record. The tool carries
no recommendation; only the owner can approve the candidate.

## Private and public outputs

The generator workspace lives outside the repository in an owner-only
directory. It contains marked, type-tagged seed envelopes; exact cells,
coordinates and transforms; geology and geomorphology process fields; paired
topography/biome authority; private vegetation patches, route/site anchors and
ambient-life potentials; regions, gates, slots and sites; stage digests;
exact chunk manifests whose payloads bind the dressing fields, exact
topography-patch manifests, packages, and seven marked private previews. The
intended package contract adds a `dressing` view to the
silhouette, hillshade, biome, hydrology, region-topology/outer-ocean, and
mountain/gate set. Chunk manifests bind the canonical cell-index set and
complete field payload, while each referenced topography patch separately binds
its process and derived-field inventory and payload. These artifacts are never
committed, served, copied to `public/`, attached to a pull request, or printed
to logs.

The only candidate artifact suitable for Git is a newly constructed sanitized
aggregate report. It may contain:

- an independently random opaque review handle;
- exact total cell, land, and water counts;
- tier totals and broad per-tier region size ranges;
- aggregate water, geology, topography, hydrology, naturalness, gate, castle,
  runtime, and memory metrics;
- boolean hard-proof results;
- selection status, which remains `pending` in this pull request.

It must not contain coordinates, named exact hidden-region sizes, transforms,
seeds, seed digests, private/layout/stage/package digests, chunk keys, exact
hidden sites, maps, screenshots, previews, paths, or reconstructive data.

## Review and future pull requests

Per the owner’s direction, PR A produces exactly one eligible canonical world
for review—not eight separate worlds or parallel variants.
Private owner review includes silhouette,
hillshade, biome, hydrology, region-topology/outer-ocean, and mountain/gate
views, plus a dressing view for clustered vegetation, open-country balance,
route/site anchors, and ambient-life capacity. The dressing view is private
candidate evidence only; it does not contain or authorize runtime assets,
spawned actors, simulation, or persistence. The region view uses a fixed opaque
fog exterior and review-only outer-ocean bands; its watermark explicitly
identifies it as a composition proxy, not shipped runtime fog or server
fog-of-war authority. The silhouette follows topographic land at sea level, so
rivers and streams remain features within the landmass instead of punching
false coastline gaps.
The hillshade view applies a presentation-only exponential height atmosphere:
low valleys and long view rays accumulate denser haze, while high peaks remain
clearer. Extinction darkens terrain radiance and in-scattering adds a blurred
sky-color proxy as separate terms. Neither term becomes terrain, visibility,
fog-of-war, persistence, or gameplay authority.

Owner-supplied map references are composition guidance, never source assets or
pixel targets. Review asks whether the candidate has a strong irregular macro
landmass, meaningful bays, peninsulas and inland water, coherent forest and
mountain belts rather than confetti, hydrology that organizes the terrain,
substantial ocean breathing room, and an outer boundary fully consumed by fog.
Neither the land nor its fog envelope may resolve into a disc, hexagon, radial
flower or repeated rotated pattern under close inspection.

The review tool deterministically emits a one-candidate, unranked private review
record from the verified private package and sanitized public metrics. It
records `pending`, carries no recommendation, and has no automatic-selection
side effect. The record stores only an opaque candidate handle, objective
directions, and hard-constraint labels—never metric values or reconstructive
material. No scalar score makes the final choice.

Only an explicit owner approval may be recorded as a private selection receipt.
After that approval, a separate pull request may bind the selected private
package to an additive, inactive SpacetimeDB schema. Later pull requests
separately cover the Lowlands bridge, fog-safe atlas renderer, caller-bounded
streaming, visible-region assets, guarded seeding, and an explicitly authorized
production release. Selection does not authorize any of those steps. PR A
changes no schema, runtime, renderer, public generated asset, deployment, or
production record; the current Lowlands remains the only active world.
The workflow-only delta stages GitHub-hosted Node in a runner-private path so
the existing fail-closed toolchain attestation can run. It changes no deploy
input, target, artifact, custom domain, or release behavior.
