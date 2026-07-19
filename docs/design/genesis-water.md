# Genesis 001 water

Alpha 0.3.12 adds deterministic rivers, lakes, and an ocean apron without
changing Genesis 001's 10,000 authoritative land cells.

## Frozen layout

Water is derived from the protected Genesis 001 generation-three world. The
10,000 authoritative land cells remain byte-for-byte unchanged. A deterministic
radius-65 pointy-hex disc supplies the surrounding ocean apron:

| Metric | Frozen value |
| --- | ---: |
| Water layout version | 1 |
| Disc radius | 65 cells |
| Disc cells | 12,871 |
| Canonical land cells | 10,000 |
| Ocean cells | 2,871 |
| Canonical lake cells | 409 |
| Connected lake bodies | 362 |
| Primary rivers | 12 (two per sector) |
| Unique river cells | 400 |
| Drainage-eligible cells | 8,335 |
| Sea level | 975 milli-units (-0.025 world Y) |
| Coastal analyzer | fixed-point min/max/mean/median and 10th/90th percentiles, with six sector summaries |
| Fog start / full depth | 3 / 5 cells |
| Ocean buffer beyond full-fog depth | 2 cells |
| Layout digest | `e6e3601063254a232a80bcc2921e6717b7564f8fce7b276207ffca39c1843dba` |
| Source commit | `f23643c0d07e91847cadd5445a294d965ad76e1c` |

Ocean depth is a deterministic coast flood-fill. Lakes are all canonical
`terrainKind = lake` cells grouped by connected component. Rivers are fixed,
one-cell-wide authority paths with no loops, gaps, shared cells, or gameplay
movement changes. The fixed-point hydrology pass assigns all 8,335 eligible
land cells to low coastal outlets by deterministic coast distance, then computes
stable flow accumulation over that acyclic downstream graph. Each river uses
those exact parent edges rather than a separate pathfinder. Each
selected path receives a non-increasing fixed-point surface profile that meets
the sea level exactly at its mouth. A river may not consume a castle slot,
resource site, forest instance, lake, ancient-stone blocker, or other reviewed
static exclusion. The subsequent Stone catalog is also selected after excluding
this river set, so no quarry occupies a Water cell.

The artifact is generated from fixed inputs only: canonical world rows, the
Genesis seed, integer coordinates, and quantized elevation. It does not use
wall time, `Math.random`, network state, browser state, AI, or iteration order
of an unsorted object. Server policy and browser terrain share the same Lowlands
height sampler and a documented 1,000-milli datum, so persisted Water heights
map directly to renderer world Y. The digest covers the policy, sea-level result,
ocean depths, complete drainage parent/accumulation analysis, lake summaries,
ordered river paths, surface profiles, and body metadata.

## Additive authority surface

The next schema suffix appends these public tables after the existing refs
0–36 (water refs 37–40):

- `realm_water_layout_v1` — one immutable layout/activation row;
- `realm_water_body_v1` — ocean, lake, and river summaries;
- `realm_water_cell_v1` — fixed-point per-cell topology and fog band;
- `realm_environment_v1` — shared epoch, sea level, and fixed-point sun vector.

No per-frame wave state is persisted. The administrative boundary is explicit:

- `admin_seed_genesis_water_layout_v1` accepts no topology, coordinate, count,
  or timestamp arguments and is idempotent;
- `admin_activate_genesis_water_layout_v1` activates only a complete exact
  catalog;
- `admin_inspect_genesis_water_layout_v1` returns bounded aggregate counts and
  the digest, never the full topology.

Every seed path checks the canonical realm and exact 10,000 land rows, rejects
extra, partial, orphaned, or drifted rows, and writes the body/cell catalog and
environment row as one staged authority operation. Existing tables and prior
reducers are not updated.

## Browser presentation

The browser subscribes to the four public tables as one fail-closed projection.
It builds no local shoreline or river topology. Until the layout is activated
and every row matches the frozen digest, the existing terrain, static sky, and
fog fallback remains visible.

The renderer uses one merged ocean surface, connected lake surfaces, twelve
river ribbons, and an outer downward skirt. River ribbons taper into the ocean
plane at their mouths. Per-vertex depth, bank-blend, and canonical fog-band
attributes feed the reviewed Three.js r185 `MeshStandardMaterial`
`onBeforeCompile` contract before the material's opaque output is written.
Fresnel, depth tint, bank attenuation, horizon blending, fog, and generated
sun glimmer are visual only. The scene light, visible sun, and reflection map
derive from the public fixed-point sun vector. Reduced motion disables
animation; the existing demand-driven ambient `requestAnimationFrame`
scheduler is reused—no second water loop is introduced.

The two-cell buffer is geometry beyond the depth at which the water has already
blended strongly toward the horizon and scene fog. It is not described as
client-side culling or as an invisible gameplay boundary.

Quality ceilings are enforced before the layer is attached:

| Quality | Max triangles | Max draws | Wave components |
| --- | ---: | ---: | ---: |
| High | 220,000 | 4 | 8 |
| Balanced | 105,000 | 4 | 5 |
| Reduced | 35,000 | 4 | 0 (static) |

The ordinary strategic overview is capped at a radius-28 footprint (about
2,500 authoritative cells); it never fits the complete board. Full generated
terrain remains available for controlled panning, with camera and fog bounds
keeping the ocean edge outside the default composition.

## Activation

Water remains invisible until the exact server-side layout has been seeded,
checked, and activated. Publication alone does not activate the projection.
