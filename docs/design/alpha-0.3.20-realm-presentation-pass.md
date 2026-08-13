# Alpha 0.3.20 Realm presentation pass

This note records the frontend-only presentation choices for **The Crafted
Lowlands**. It does not define terrain, Water, route, collision, resource,
worker, ownership, or identity authority.

## Baseline

The unchanged continuity head passed the disposable full-stack journey and all
14 rendered WebGL cases before visual work began. The baseline retained the
exact 10,000-cell Realm, canonical Water rows, 210 shared tree transforms,
founded castles, resource sites, and public Worker routes.

The visible problems were:

- grass palettes were highly saturated and shader tips could appear emissive;
- quality tiers generated different grass layouts instead of stable subsets;
- grass and decorative trees were spread too evenly, with few readable rests
  or clearings;
- terrain semantics were strongest at each cell centre, making the hidden hex
  structure easier to see than the wider landscape;
- terrain roughness was constant and did not describe slopes, hollows,
  vegetation, or damp ground;
- tree asset failure fell back to identical cones;
- route vegetation clearance came from invented radial spokes and rings
  instead of validated live Worker paths;
- rivers read as blue hex tiles rather than continuous channels;
- routes looked diagrammatic, and equal segment timing made wagons change speed
  through otherwise continuous journeys;
- worker, node, and reservation identity treatments could compete or duplicate;
- keeps and resource sites needed clearer grounding and world-state hierarchy;
- records, menus, and camera bands did not yet share one responsive information
  hierarchy;
- fallback, clustering, cache, and material telemetry did not describe the
  presentation actually on screen.

## Choices

- Keep the shared Lowlands height function and every authoritative coordinate
  unchanged. Perceived depth comes from continuous colour sampling and
  per-vertex slope, hollow/crest, vegetation, and wetness cues.
- Use one pinned `MeshStandardMaterial` extension for terrain. If Three.js
  shader markers drift, retain the ordinary standard material and report the
  fallback; do not blank the Realm.
- Keep grass instanced and camera-local. High supplies the canonical candidate
  layout; Balanced and Reduced retain deterministic subsets.
- Use restrained moss, meadow, fern, olive, and dry-gold grass colours with
  automated display-sRGB saturation and linear-luminance limits.
- Use stable broad and secondary vegetation fields to form tufts, rests, bare
  pockets, forest shelter, and coherent gusts. Reduced motion keeps placement
  and density but stops sway.
- Preserve all shared tree rows exactly. Habitat and canopy fields may change
  only non-authoritative infill, tint, scale, and fallback presentation.
- Replace cone-only tree fallback with a local procedural trunk and layered
  canopy silhouette. No remote discovery, picking, or dynamic shadow field is
  added.
- Clear vegetation only around Water, structures, approved site/root
  footprints, and canonical live public Worker routes. Route changes invalidate
  bounded grass/forest caches in place; they do not rebuild the scene.
- Present canonical rivers as continuous inset channels with readable banks,
  restrained wetness and foam, exact full-cell fallback/picking, and a natural
  ocean-to-fog continuation.
- Map authoritative Worker progress over cumulative world-space route length.
  Keep exact endpoints and return direction while smoothing only inside the
  validated dry corridor.
- Batch route hierarchy into bounded owned, selected, and peer styles. Keep
  wagon, route, reservation, and PFP presentation reconciled from the same
  public Worker truth.
- Ground keeps and resource sites without changing their coordinates, and make
  available, reserved, gathering, unavailable, hovered, and selected states
  distinct without relying on raw IDs or coordinates.
- Use close, strategy, and overview bands to reduce clutter progressively.
  Related records share a compact shell, while responsive composition keeps the
  map, profile trigger, resource rail, menus, and inspectors from competing.
- Preserve authority-driven pending, confirmed, and error feedback. Reduced
  motion removes decorative travel effects without hiding state transitions.

## Budgets

All ceilings remain explicit and quality-specific. The true near/mid topology
split raises only the grass draw ceiling from 3 / 2 / 1 to 6 / 4 / 2 for High /
Balanced / Reduced; active instances, triangles, cache, and scheduler ceilings
remain unchanged:

- grass remains within its quality-specific active instance, triangle, cache,
  and scheduler caps plus the revised 6 / 4 / 2 draw ceiling;
- decorative forest remains at most 1,200 / 600 / 180 instances,
  320k / 160k / 45k triangles, and five draws for High / Balanced / Reduced;
- shared forest remains one static batch at the selected approved LOD;
- terrain keeps the existing indexed topology, triangle budget, one material,
  and one draw;
- Water remains within 220k / 105k / 35k triangles and four draws for High /
  Balanced / Reduced;
- routes remain capped at 24 visible routes, 512 segments, and three style
  draws;
- worker models remain capped at 12 / 8 / 4 with their existing animation
  limits;
- no new animation loop, gameplay query, backend call, or persistent row is
  introduced.

## Review evidence

Review uses identical synthetic cameras through the existing rendered harness,
plus High, Balanced, Reduced, overview, reduced-motion, shader-fallback,
asset-fallback, route-clearance, cache, disposal, and context-recovery
fixtures. The disposable full-stack journey separately proves reload,
reconnect, delayed private synchronization, dispatch, recall, Recall All,
released-node reuse, and title departure without production contact.
Screenshots and local visual aggregates remain private or synthetic QA output
and are not committed.

Canopy sway remains optional. If it cannot stay within the existing material
and scheduler contract, trees remain static and telemetry says so. Interaction
cues and location ambience also remain deferred until an owner-approved,
provenance-recorded sound bank exists. The existing soundtrack is unchanged.
