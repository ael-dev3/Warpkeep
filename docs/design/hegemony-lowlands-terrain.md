# Hegemony Lowlands Terrain and Frontier Keep

## Purpose and scope

`ENTER REALM` opens a deterministic Hegemony Lowlands presentation slice: a radius-five pointy-top axial disc with **91 logical gameplay cells**. It is still not a persistent campaign, but it is intentionally large enough to read as a place rather than a single tactical board.

The slice includes a contiguous sunlit terrain surface, selection/navigation, a local visual placement interaction for the Hegemony Frontier Keep, and an accessible SVG fallback. It does not yet persist keeps, resources, roads, farms, units, combat, ownership, fog of war, pathfinding, server state, or alternate biomes.

## Coordinate and seed contract

The map uses pointy-top axial coordinates:

```txt
x = size × sqrt(3) × (q + r / 2)
z = size × 1.5 × r
s = -q - r
```

Cells use stable `q,r` keys. A radius-five disc enumerates 91 unique cells. `HEGEMONY_GENESIS_001` is the canonical first seed and is hashed to an unsigned 32-bit value using a documented FNV-1a variant. Independent `(world seed, q, r, channel, index)` hashes create cell fields; generation has no mutable RNG state and never uses `Math.random()`.

The map generator remains renderer-independent and still defaults to radius two for small unit fixtures. The public Realm view explicitly requests radius five.

## Surface and seam strategy

Terrain height combines:

1. a broad continuous world-space value-noise field; and
2. cell-local micro-relief multiplied by a pointy-hex interior mask.

The interior mask is exactly zero on a cell border. Therefore differently seeded neighboring cells cannot create a height discontinuity on shared edges or corners.

The Realm renderer converts each of the six radial hex wedges into an eight-subdivision triangular lattice. All generated positions are keyed in world space and emitted into one indexed `BufferGeometry`; shared borders and wedge seams reuse the same vertex. The live radius-five surface contains **34,944 non-degenerate triangles** (`91 × 6 × 8²`) in one terrain draw call, so the existing deterministic height/color functions are visible rather than reduced to six broad facets per cell.

## Lighting and terrain direction

The terrain is intentionally brighter and more legible than the original technical slice while remaining grounded:

- cool daylight hemisphere fill with a soft cool directional fill;
- warm sun with a bounded PCF shadow map;
- terrain receives the keep’s shadows rather than using baked imagery;
- muted moss, dry grass, ochre soil, and stone colors are sampled procedurally in world space;
- a wider blue-green atmosphere and orthographic camera fit the generated terrain bounds instead of a fixed 19-cell viewbox.

There is no reference-image texture, fixed tile pattern, raised board, or permanent cell border in the WebGL terrain. Hover and selected outlines are separate transient lines.

## Frontier Keep landmark

The Hegemony Frontier Keep starts at `q:0, r:0`. Selecting another cell and choosing **Place Frontier Keep** moves the visible landmark locally for this browser session; it is deliberately not stored as ownership or a game write.

The original Ael-supplied Meshy GLB remains archived byte-for-byte in [`docs/reference/castles/2026-07-11-meshy-hegemony-frontier-keep/`](../reference/castles/2026-07-11-meshy-hegemony-frontier-keep/). It is 63,263,296 bytes and roughly 941k triangles, so it is not served by the Realm.

Instead, the Realm lazy-loads [`public/models/hegemony-frontier-keep.runtime.glb`](../../public/models/hegemony-frontier-keep.runtime.glb) only after the authenticated Realm mounts. The derived runtime model is 1,139,756 bytes, uses Meshopt-compressed geometry plus WebP textures, and has 75,278 triangles. `GLTFLoader` and the Meshopt decoder are dynamically imported with the Realm, keeping title, menu, and QR authentication flows free of the model download. The loader normalizes the model to a small hex foundation, grounds it with `terrainHeightAtWorld`, enables cast/receive shadows, and disposes model resources when the Realm unmounts.

## Interaction and fallback

The Realm provides:

- an orthographic strategy camera fitted to generated terrain bounds;
- pointer drag pan bounded around the landscape and wheel zoom;
- keyboard cell selection with arrow keys;
- separate gold hover and violet selected-cell outlines;
- a compact, scrollable 91-cell navigator with an explicit keep indicator;
- Escape and Return to Menu behavior; and
- a colored SVG/CSS fallback generated from the same map, including a keep marker when WebGL2 is unavailable.

## Rendering budget

Current realm-specific budget:

- terrain: one indexed mesh / one draw call / 34,944 triangles at high quality;
- hover and selection: one line object each when active;
- one dynamic 3D keep plus a six-sided stone foundation, loaded only in Realm;
- one shadow-casting sun and one terrain receiver;
- no terrain texture atlas, vegetation instancing, units, or persistent structure layer yet.

## Future overlays

The base terrain API remains renderer-independent. Future layers can add roads, farms, resource markers, additional keeps, units, ownership, corruption, fog, rivers, forests, and server persistence without baking identity into the neutral lowlands surface.
