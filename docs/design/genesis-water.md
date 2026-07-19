# Genesis 001 canonical water (Alpha 0.3.12 candidate)

This document describes the additive water proposal in the Alpha 0.3.12
candidate branch. It does not change the current Alpha 0.3.11 release truth,
production database, DNS, or deployment configuration.

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
| Unique river cells | 456 |
| Priority-flood eligible cells | 8,335 |
| Sea level | 979 milli-units |
| Coastal analyzer | fixed-point min/max/mean/median and 10th/90th percentiles, with six sector summaries |
| Fog start / full depth | 3 / 5 cells |
| Hidden ocean buffer | 2 cells |
| Layout digest | `e9753e5eff5c73f05ef802aedf22575acf8ccbb634192827172f4d1455167f05` |
| Source commit | `f23643c0d07e91847cadd5445a294d965ad76e1c` |

Ocean depth is a deterministic coast flood-fill. Lakes are all canonical
`terrainKind = lake` cells grouped by connected component. Rivers are fixed,
one-cell-wide authority paths with no loops, gaps, shared cells, or gameplay
movement changes. The fixed-point hydrology pass priority-floods 8,335 eligible
land cells from valid coastal outlets, assigns an acyclic downstream parent,
and computes stable flow accumulation before source/mouth selection. Each
selected path receives a non-increasing fixed-point surface profile that meets
the sea level at its mouth. A river may not consume a castle slot, resource
site, forest instance, lake, ancient-stone blocker, or other reviewed static
exclusion.

The artifact is generated from fixed inputs only: canonical world rows, the
Genesis seed, integer coordinates, and quantized elevation. It does not use
wall time, `Math.random`, network state, browser state, AI, or iteration order
of an unsorted object. The digest covers the policy, sea-level result, ocean
depths, complete priority-flood parent/accumulation analysis, lake summaries,
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

The browser subscribes to the four public rows as one fail-closed projection.
It builds no local shoreline or river topology. Until the layout is activated
and every row matches the frozen digest, the existing terrain, static sky, and
fog fallback remains visible.

The renderer uses one merged ocean surface, connected lake surfaces, twelve
river ribbons, and an outer downward skirt. Per-vertex depth and bank-blend
attributes feed the reviewed Three.js r185 `MeshStandardMaterial`
`onBeforeCompile` contract. Fresnel, depth tint, foam/bank softness, fog, and
subtle sun glimmer are visual only. Reduced motion disables animation; the
existing demand-driven ambient `requestAnimationFrame` scheduler is reused—no
second water loop is introduced.

Quality ceilings are enforced before the layer is attached:

| Quality | Max triangles | Max draws | Wave components |
| --- | ---: | ---: | ---: |
| High | 220,000 | 4 | 8 |
| Balanced | 105,000 | 4 | 5 |
| Reduced | 35,000 | 3 | 0 (static) |

The ordinary strategic overview is capped at a radius-28 footprint (about
2,500 authoritative cells); it never fits the complete board. Full generated
terrain remains available for controlled panning, with camera and fog bounds
keeping the ocean edge outside the default composition.

## Review and activation boundary

This PR is intentionally draft-only. Review should verify the frozen digest,
schema refs 37–40, generated binding diff, authority failure codes, browser
projection tests, camera geometry tests, reduced-motion behavior, and quality
telemetry. No production publication, DNS change, component seed, merge, or
release tag is part of this proposal.
