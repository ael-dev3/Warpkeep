# Hegemony Lowlands Terrain Foundation

## Purpose and scope

`ENTER REALM` now opens an early deterministic Hegemony Lowlands terrain prototype: a radius-two, pointy-top axial hex disc with 19 logical gameplay cells. It is a terrain and interaction foundation, not a playable campaign.

This slice intentionally does **not** contain keeps, resources, roads, farms, units, combat, ownership, fog of war, persistence, pathfinding, server state, or alternate biomes.

## Reference role

The supplied seven-hex plains image was used as **art direction only**. The runtime does not load it, crop it, trace it, derive a texture from it, or depend on it.

The extracted rules are:

- muted olive and moss-green dominant grass;
- restrained warm ochre/umber soil rather than bright dirt paths;
- sparse neutral gray-brown stone scale for a later decoration layer;
- sparse, desaturated dried-gold accents for a later decoration layer;
- calm neutral-daylight readability suitable for strategy pieces;
- no literal raised-board edges, cast shadows, tile seams, or fixed soil patterns.

The initial runtime applies authored procedural vertex colors only. No reference image is archived in this change because no user-provided source asset is committed here.

## Coordinate and seed contract

The map uses pointy-top axial coordinates:

```txt
x = size × sqrt(3) × (q + r / 2)
z = size × 1.5 × r
s = -q - r
```

Cells use stable `q,r` keys. A radius-two disc enumerates 19 unique cells; the same helpers support radius four (61 cells) without changing the data contract.

`HEGEMONY_GENESIS_001` is the canonical first seed. It is hashed to an unsigned 32-bit value using a documented FNV-1a variant. Independent `(world seed, q, r, channel, index)` hashes create all cell fields. Generation has no mutable RNG state and never uses `Math.random()`.

## Seam strategy

Terrain height combines:

1. a broad continuous world-space value-noise field; and
2. small cell-local micro-relief multiplied by a pointy-hex interior mask.

The interior mask is exactly zero on a cell border. Thus two neighbors can use different cell seeds without creating a height discontinuity on their shared edge or corners.

The renderer consumes a single combined indexed `BufferGeometry` data set. Shared world-space corners are deduplicated, border heights are global-only, and normals are computed after all cells are assembled. The first mesh uses six fan triangles per cell as a conservative foundation; later subdivision can increase surface detail without changing the coordinate or seed APIs.

## Material and visual rules

The first surface uses live Three.js lighting with a high-roughness `MeshStandardMaterial`, continuous procedural vertex colors, a neutral-blue hemisphere fill, and warm-neutral directional daylight. It has no texture lookup, permanent cell border, raised tile thickness, or baked shadow.

The typed visual contract lives in `src/game/map/hegemonyLowlandsSpec.ts`:

- target soil coverage: 0.17;
- boundary-safe ratio: 0.16;
- intended center-clear ratio for future decoration placement: 0.34;
- global relief amplitude: 0.052;
- local relief amplitude: 0.022.

## Interaction and rendering budget

The realm screen provides:

- an orthographic strategy camera;
- bounded wheel zoom and pointer drag pan;
- separate hover gold and selection violet outline overlays;
- accessible cell buttons and selected-cell status;
- Escape and Return to Menu behavior;
- a static SVG/CSS fallback generated from the same 19-cell map when WebGL2 is unavailable.

Current terrain-specific scene budget:

- terrain surface: one mesh / one draw call;
- hover outline: one line object only when active;
- selection outline: one line object only when active;
- decorations: none in this core slice.

The current mesh contains 114 triangles (`19 × 6`). Fine grass, dry tufts, stone instancing, richer subdivision, quality profiles, and camera polish belong to follow-up visual terrain work.

## Future overlays

The base map API remains renderer-independent so future layers can add roads, farms, resource markers, keeps, units, ownership, corruption, fog, rivers, forests, and server persistence without baking identity into the neutral lowlands surface.
