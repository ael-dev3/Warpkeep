# Alpha 0.3.20 Realm presentation pass

This note records the frontend-only presentation choices for **The Crafted
Lowlands**. It does not define terrain, Water, route, collision, resource, or
identity authority.

## Baseline

The unchanged PR 2 head passed the disposable full-stack journey and all 14
rendered WebGL cases before visual work began. The baseline retained the exact
10,000-cell Realm, canonical Water rows, 210 shared tree transforms, founded
castles, resource sites, and public Worker routes.

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

## Budgets

No ceiling is increased:

- grass keeps its existing quality-specific active instance, triangle, draw,
  cache, and scheduler caps;
- decorative forest remains at most 1,200 / 600 / 180 instances,
  320k / 160k / 45k triangles, and five draws for High / Balanced / Reduced;
- shared forest remains one static batch at the selected approved LOD;
- terrain keeps the existing indexed topology, triangle budget, one material,
  and one draw;
- no new animation loop, gameplay query, backend call, or persistent row is
  introduced.

## Review evidence

Review uses identical synthetic cameras through the existing rendered harness,
plus High, Balanced, Reduced, overview, reduced-motion, shader-fallback,
asset-fallback, route-clearance, cache, disposal, and context-recovery
fixtures. Screenshots and local visual aggregates remain QA output and are not
committed.

Canopy sway remains optional. If it cannot stay within the existing material
and scheduler contract, trees remain static and telemetry says so. Water,
route ribbons, wagons, castles, resource sites, camera, HUD, and release
metadata belong to the following stacked PRs.
