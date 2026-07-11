# Hegemony Lowlands Terrain and Frontier Keep

## Purpose and scope

After standard web Sign In with Farcaster verifies the player, `ENTER REALM` opens Warpkeep's first bright game-space presentation: a continuous Hegemony Lowlands terrain, a fixed first keep at the center, and enough accessible selection and camera control to inspect the scene.

This remains a session-bound prototype. It does not persist keep ownership or implement resources, roads, farms, units, combat, fog of war, pathfinding, server state, or alternate biomes.

## Playable map and visual apron

The authoritative prototype terrain map remains renderer-independent and uses the canonical `HEGEMONY_GENESIS_001` seed. The public Realm separates gameplay from visual continuation:

```txt
playable radius:       4
playable cells:       61
render radius:         5
visual apron cells:   30
total rendered cells: 91
```

Only the radius-four map is selectable and exposed to semantic gameplay controls. The outer 30 cells reuse the same seed, biome, height, and color rules, but exist only in the derived render surface. They cannot be hovered, selected, used as keep destinations, or serialized as owned gameplay cells. Continuous desaturation, reduced decoration density, camera framing, and atmospheric fog soften the outer boundary without adding walls, water, or a hard board edge.

The map uses pointy-top axial coordinates:

```txt
x = size × sqrt(3) × (q + r / 2)
z = size × 1.5 × r
s = -q - r
```

Cells retain stable `q,r` keys. Independent `(world seed, q, r, channel, index)` hashes generate cell fields and decoration candidates without mutable random state or `Math.random()`.

## Subdivided seamless surface

Terrain height combines:

1. broad continuous world-space value noise;
2. restrained cell-local micro-relief multiplied by an exact-zero border falloff; and
3. an optional renderer-independent structure-placement influence.

Each pointy hex is split into six radial wedges. Each wedge becomes a barycentrically subdivided triangular lattice, and every generated vertex is deduplicated by a stable quantized world position before normals are computed for the combined mesh. Shared edge and corner positions therefore reuse the same indexed vertex. Cell-local height and color influence reaches exactly zero before cell boundaries, preventing cracks, color seams, overlapping cell meshes, and hard normal seams.

The three runtime profiles use one terrain draw call and remain in bounded geometry budgets:

| Profile | Subdivisions per edge | Radius-five terrain triangles |
| --- | ---: | ---: |
| High | 8 | 34,944 |
| Compact | 5 | 13,650 |
| Reduced | 3 | 4,914 |

All generated positions, colors, normals, and indices are finite; the tested canonical surfaces have no significant degenerate triangles.

## Center placement surface

The first Hegemony Frontier Keep is fixed at `q:0, r:0`. It is not a movable building-placement interaction.

The renderer-independent placement definition uses a `0.43` footprint radius and a `0.70` smooth blend radius. Terrain inside the footprint resolves to the cell-center height, then blends back into natural relief before reaching any shared edge. The same influence adds restrained packed-earth/stone color and clears grass, dry vegetation, and stones through the blend radius plus a safety margin. This grounds the keep without a raised slab or visible circular platform.

The model normalizer centers each LOD in X/Z, aligns its lowest foundation point to terrain, preserves the closed gate on the `+Z` facing axis, and scales the footprint to `1.48` world units—74% of one hex diameter. A restrained contact shadow remains available when dynamic shadows are disabled.

## Palette, daylight, and instanced details

The lowland surface uses authored procedural color rather than a downloaded or reference-image texture. Broad and fine world-space signals mix brighter olive and moss grass, warm ochre soil, dry gold, and neutral gray-brown stone. Cell `moisture`, `soilBias`, and `dryGrassBias` have modest interior influence that fades safely at borders. The apron tint changes continuously in world space instead of producing a ring seam.

Three deterministic `InstancedMesh` layers add:

- crossed low-poly green grass-blade tufts;
- shorter dry-gold tufts; and
- small dodecahedral stones.

Candidates keep a safe distance from cell edges and the center placement, have seeded rotation/scale, and use lower density in the apron. The canonical high profile produces 780 green tufts and 150 dry tufts plus a tested 40–80 seed-selected stones; compact produces 360 green and 60 dry tufts, while reduced keeps 60 green tufts and no dry layer. Each nonempty kind remains one draw call.

The Realm uses a pale blue-gray background/fog, a warm-neutral sun, cool sky fill, warm secondary fill, and a high-roughness terrain material. High quality enables one 2048 directional PCF shadow map for the keep and nearby ground. Compact and reduced disable dynamic shadows and retain the lightweight keep contact shadow. There is no bloom, SSAO, vignette, or permanent postprocessing loop.

## Quality profiles

One typed quality specification controls geometry, decoration density, shadows, keep LOD, drawing-buffer budget, pixel-ratio cap, and fog:

| Profile | Green per playable/apron cell | Dry per playable/apron cell | Stone chance playable/apron | Pixel-ratio cap | Fog near/far | Dynamic shadow | Keep LOD |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| High | 11 / 4 | 2 / 1 | 0.78 / 0.28 | 2.0 | 28 / 58 | 2048 | High |
| Compact | 5 / 2 | 1 / 0 | 0.46 / 0.18 | 1.6 | 26 / 52 | No | Compact |
| Reduced | 1 / 0 | 0 / 0 | 0.20 / 0.08 | 1.25 | 24 / 48 | No | Compact |

The typed profile selector uses viewport dimensions, device pixel ratio, drawing-buffer cost, and an available texture-size capability input—not user-agent sniffing. The active pixel ratio is further clamped against each profile's total drawing-buffer budget. Reduced motion preserves terrain quality while making camera changes settle immediately.

## Frontier Keep runtime assets

The unchanged Ael-supplied Meshy source remains archived at [`docs/reference/castles/2026-07-11-meshy-hegemony-frontier-keep/`](../reference/castles/2026-07-11-meshy-hegemony-frontier-keep/). It is 63,263,296 bytes, contains approximately 941,298 source triangles, and is never requested by the runtime.

The reproducible `npm run prepare:hegemony-keep` pipeline uses pinned `@gltf-transform/cli@4.4.1`, WebP textures, generated MikkTSpace tangents, Meshopt high compression, quantization, and validation to produce two exact LODs:

| LOD | Runtime path | Bytes | Triangles | Uploaded vertices | Textures | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| High | `public/models/hegemony/hegemony-frontier-keep-high.glb` | 2,256,092 | 56,466 | 55,704 | four 2048×2048 WebP | `ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c` |
| Compact | `public/models/hegemony/hegemony-frontier-keep-compact.glb` | 760,916 | 17,536 | 24,766 | four 1024×1024 WebP | `9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b` |

Both have one scene, mesh, primitive, and material and require `EXT_meshopt_compression`, `EXT_texture_webp`, and `KHR_mesh_quantization`. The active quality profile chooses one path before loading; reduced reuses compact. The public GLB remains outside JavaScript bundles.

`GLTFLoader` and `MeshoptDecoder` are dynamically imported only after the authenticated Realm mounts. Textures receive bounded anisotropy and correct color space, emissive response is restrained for daylight, and model geometry/materials/textures are disposed on unmount. A translucent primitive keep stands in while loading; a solid primitive keep replaces it if loading fails without taking down the terrain or navigation.

## Verified identity contract

The Realm only mounts while the Farcaster auth state is verified. `WarpkeepExperience` passes a deliberately narrow, proof-free object containing only `fid`, `username`, and `displayName`. The HUD presents:

```txt
@username Keep
FID 12345
Hegemony Frontier Keep
Level 1
Session-bound prototype
```

When username is absent, the title becomes `FID 12345 Keep`. The identity personalizes the current scene only: no castle record is persisted, no local storage ownership is created, and no server authority is claimed. Returning to the menu preserves the in-memory identity; signing out prevents later Realm entry until a new verified session exists.

## Perspective camera and controls

The Realm owns one `PerspectiveCamera` whose pose, field of view, pitch, focus target, distance, and fog morph together across a normalized overview-to-keep zoom. The overview starts at a 20° field of view and 48° pitch; the close state reaches a 42° field of view and 27° pitch while blending focus upward toward the keep. This produces a readable strategic overview and a materially closer, lower gate inspection without free orbit, camera flipping, or underside visibility.

Wheel and touch-pinch input update a target zoom. Exponential damping advances only while the camera is unsettled, so the result is smooth without introducing a permanent 60 fps loop. Dragging pans within terrain-aware bounds. Inspect Keep selects `0,0` and enters the close view; Realm View returns to the overview; Recenter Keep and Home restore the keep target. Fog and clipping planes adapt with the camera pose.

Rendering remains demand-driven on initial setup, resize, camera settling, hover, selection, model completion, and quality-dependent scene changes. Camera animation pauses while the document is hidden and all listeners, animation frames, renderer resources, scene geometry, materials, textures, overlays, instances, and observers are disposed on unmount.

## HUD, accessibility, and fallback

The compact HUD exposes identity, FID, Level 1, active quality, selected coordinates/terrain, Return to Menu, Recenter Keep, Inspect Keep/Realm View, and concise control hints. Clicking or tapping the 3D keep selects the center cell and enters its close view. Arrow keys move among playable cells, Enter/Space inspects the selected keep, Home recenters, and Escape returns.

The previous permanent coordinate matrix is replaced by a collapsed **Realm Cells 61** navigator. Opening it provides exactly 61 semantic cell buttons; none of the 30 apron cells appears there.

If WebGL2 is unavailable, an illustrated SVG fallback renders all 91 terrain cells, visually distinguishes the 61 playable cells from the apron, shows the personalized fixed center keep marker, and preserves the same HUD and collapsible navigator. A 3D-model failure uses the primitive keep fallback without replacing the working WebGL terrain.

## Deferred gameplay

The base terrain, placement, decoration, quality, camera, and identity boundaries are structured for future overlays. Roads, farms, rivers, forests, multiple keeps, resources, units, ownership, corruption, fog of war, combat, and server persistence remain future milestones rather than implied features of this presentation slice.
