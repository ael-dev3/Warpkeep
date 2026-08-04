# Greater Realm natural-continent candidate design

Status: candidate-generation design only

Atlas: `GENESIS_001_GREATER_REALM`

Generator: `greater-realm-v2-natural-continent-pr-a.3`
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

| Tier | Count | Working regions | Aggregate target |
| --- | ---: | --- | ---: |
| I | 6 | The Hegemony Lowlands, Frostmere Reach, Sunscar Expanse, Mirefen Delta, Stonewake Isles, Emberwood March | 68%–74% |
| II | 3 | Crownwood March, Ironveil March, Glasswater March | 22%–27% |
| III | 1 | Throneheart | 3%–6% |

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
is a pure function of the private candidate seed, generator version, stage,
axial coordinate, and sample ordinal. There is no mutable random stream and no
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
   the final fluvial pass. That stage uses preliminary drainage and climate to
   apply bounded glacial erosion and moraines, arid wadis and aeolian shaping,
   volcanic/caldera relief tied to tectonic evidence, and coherent beach,
   cliff, delta, and fjord shaping. It preserves the Lowlands reserve exactly
   and proves a material budget for its signed process deltas.
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
8. Grow natural geographic basins, bind the working region identities by
   climate/process character, assign the fixed strategic graph, and align tier
   barriers and gate saddles with coherent highlands rather than radial bands.
9. Choose dormant castle suitability, potential sites, private chunks and
   topography patches, and aggregate quality metrics.

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
[tile-based erosion evaluation](https://arxiv.org/abs/2210.14496). It does not
copy third-party code, data, maps, art, labels, or balance tables.

## Candidate hard gates

A candidate is ineligible if any of these proofs fail:

- active count is outside 100,000–150,000;
- the active mask is disconnected, exposes the private canvas, or has an
  obvious disc, hexagon, square, long straight cutoff, or filler boundary;
- land does not retain a meaningful deep-ocean/fog buffer;
- the topographic land mask does not contain 2–4 major landmasses and 3–8
  large islands;
- region count, tier ratios, region balance, fixed adjacency, 18 gates, or 600
  total castle capacity differs from the contract;
- a Tier-II parent lacks a dry outer-frontier anchor joined to its dry inner
  anchor. The generator first preserves an already-sound natural partition;
  only a parent that would miss the Tier-I frontier activates the deterministic
  dual-anchor spine repair;
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
- geomorphology changes the Lowlands reserve, violates its exact material
  budget or climate/tectonic/coastal compatibility, or omits the required
  glacial, arid, volcanic, and coastal process evidence;
- the locked Lowlands patch or any protected catalog differs;
- castle candidates lack local passability, spacing, or clearance;
- integer range, stage-digest, deterministic replay, package-integrity, or private
  boundary validation fails.

For this offline topology proof, river and minor-stream corridors are fordable
route surfaces; oceans and lakes are not. This does not activate movement,
bridges, ferries, or any cross-region mechanic. Castle sites and sealed gate
endpoints themselves must still be dry.

Quality is a vector, not an automatic winner. After each complete private
package has been regenerated and byte-for-byte verified, the owner-only
comparison joins its public aggregate evidence to a coordinate-free private
metric vector. That vector spans outer-boundary/coastal artifacts, passable
region coherence and route fragmentation, throne-route clearance, chunk
population balance, geological and landform alignment, climate/coastal
compatibility, hydrology, and biome diversity/balance. Raw coordinates, seeds,
transforms, hidden-site identities, package paths, and digests never enter the
shortlist. The tooling may produce a diverse shortlist, but only the owner can
select a candidate.

## Private and public outputs

The generator workspace lives outside the repository in an owner-only
directory. It contains marked, type-tagged seed envelopes; exact cells,
coordinates and transforms; geology and geomorphology process fields; paired
topography/biome authority; regions, gates, slots and sites; stage digests;
exact chunk and topography-patch manifests; packages; and six marked private
previews. Chunk manifests bind the canonical cell-index set and complete field
payload, while each referenced topography patch separately binds its process
and derived-field inventory and payload. These artifacts are never committed,
served, copied to `public/`, attached to a pull request, or printed to logs.

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

The candidate batch contains 8–16 eligible worlds; twelve is the preferred
review set. Private owner review includes comparable silhouette, hillshade,
biome, hydrology, topology/fog, and mountain/gate views. The comparison tool
deterministically produces an unranked, diverse three-to-five-candidate
shortlist using Pareto/vector separation across verified private package
aggregates as well as the sanitized public metrics. It records `pending`,
carries no recommendation, and has no automatic-selection side effect. The
private shortlist stores only opaque candidate handles, objective directions,
and hard-constraint labels—never metric values or reconstructive material. No
scalar score makes the final choice.

Only an explicit owner approval may be recorded as a private selection receipt.
After that approval, a separate pull request may bind the selected private
package to an additive, inactive SpacetimeDB schema. Later pull requests
separately cover the Lowlands bridge, fog-safe atlas renderer, caller-bounded
streaming, visible-region assets, guarded seeding, and an explicitly authorized
production release. Selection does not authorize any of those steps. PR A
changes no schema, runtime, renderer, public generated asset, deployment, or
production record; the current Lowlands remains the only active world.
